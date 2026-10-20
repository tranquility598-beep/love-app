const crypto = require('crypto');
const Case = require('../models/Case');
const { CLOSED_CASE_STATUSES, CASE_COOLDOWN_MS, CASE_SUBMISSION_POLICY_VERSION, CASE_SUBMISSION_INDEX } = require('../config/caseSubmissionPolicy');

let indexReady;
function ensureSubmissionIndex() {
  // Do not accept an unguarded write if index creation fails. The new field is
  // absent on legacy cases, so existing duplicate cases do not block this index.
  if (!indexReady) {
    indexReady = Case.collection.createIndex({ submissionKey: 1 }, { ...CASE_SUBMISSION_INDEX })
      .catch(error => { indexReady = null; throw error; });
  }
  return indexReady;
}

function submissionIdentity({ reporter, contact } = {}) {
  // Tags are editable and user supplied; only the server-generated source key
  // identifies an automatic moderation escalation.
  const manualCases = { sourceKey: { $not: /^warning-review:/ } };
  if (reporter) {
    const id = Case.schema.path('reporter').cast(reporter._id || reporter);
    return { key: `user:${id}`, filter: { reporter: id, ...manualCases } };
  }
  const email = String(contact?.email || '').trim().toLowerCase();
  if (!email) return null;
  return {
    key: `site:${crypto.createHash('sha256').update(email).digest('hex')}`,
    filter: { reporter: null, 'contact.email': email, ...manualCases }
  };
}

async function getSubmissionState(identity, now = new Date()) {
  const base = { policyVersion: CASE_SUBMISSION_POLICY_VERSION, allowed: true, code: null, retryAfter: 0, nextAllowedAt: null, activeCase: null,
    cooldownSeconds: CASE_COOLDOWN_MS / 1000, serverNow: now.toISOString() };
  if (!identity) return base;
  // Read in this order: a case closed between the two queries must start its
  // cooldown, rather than slip between concurrent active/closed snapshots.
  const active = await Case.findOne({ ...identity.filter, status: { $nin: CLOSED_CASE_STATUSES } })
    .select('_id number kind status').sort({ createdAt: 1 }).lean();
  if (active) return { ...base, allowed: false, code: 'CASE_ALREADY_OPEN', activeCase: active,
    message: `У вас уже есть открытое обращение ${active.number || ''}. Дождитесь его закрытия; подробности можно добавить в существующую переписку.` };

  const [last] = await Case.aggregate([
    { $match: { ...identity.filter, status: { $in: CLOSED_CASE_STATUSES } } },
    { $project: { closedAt: { $ifNull: ['$resolvedAt', '$updatedAt'] } } },
    { $sort: { closedAt: -1 } }, { $limit: 1 }
  ]);
  const nextAllowedAt = new Date(last?.closedAt || 0).getTime() + CASE_COOLDOWN_MS;
  const retryAfter = Math.max(0, Math.ceil((nextAllowedAt - now.getTime()) / 1000));
  if (!retryAfter) return base;
  return { ...base, allowed: false, code: 'CASE_COOLDOWN', retryAfter,
    nextAllowedAt: new Date(nextAllowedAt).toISOString(),
    message: `После закрытия обращения действует пауза 15 минут. Новое можно отправить через ${Math.ceil(retryAfter / 60)} мин.` };
}

function blockedError(state) {
  return Object.assign(new Error(state.message), {
    caseSubmissionState: state, status: state.code === 'CASE_COOLDOWN' ? 429 : 409
  });
}

async function releaseExpiredSlot(identity, now = new Date()) {
  await Case.updateMany({ submissionKey: identity.key, status: { $in: CLOSED_CASE_STATUSES },
    resolvedAt: { $lte: new Date(now.getTime() - CASE_COOLDOWN_MS) } },
  { $unset: { submissionKey: 1 } }, { timestamps: false });
}

function isSubmissionKeyConflict(error) {
  return error?.code === 11000 && (error.keyPattern?.submissionKey || error.keyValue?.submissionKey
    || String(error.message || '').includes(CASE_SUBMISSION_INDEX.name));
}

async function createSubmittedCase(data) {
  const identity = submissionIdentity(data);
  if (!identity) throw new Error('Не удалось определить автора обращения');
  await ensureSubmissionIndex();
  const state = await getSubmissionState(identity);
  if (!state.allowed) throw blockedError(state);
  // A closed case keeps its unique key throughout the cooldown. Clearing only
  // an expired key atomically also prevents create/close races across workers.
  await releaseExpiredSlot(identity);
  try {
    return await Case.create({ ...data, submissionKey: identity.key });
  } catch (error) {
    if (!isSubmissionKeyConflict(error)) throw error;
    const fresh = await getSubmissionState(identity);
    throw blockedError(fresh.allowed ? { ...fresh, allowed: false, code: 'CASE_ALREADY_OPEN',
      message: 'Другое обращение уже отправляется. Обновите список обращений.' } : fresh);
  }
}

async function prepareCaseStatus(item, nextStatus) {
  const wasClosed = CLOSED_CASE_STATUSES.includes(item.status);
  const closing = CLOSED_CASE_STATUSES.includes(nextStatus);
  if (!closing && wasClosed && !String(item.sourceKey || '').startsWith('warning-review:')) {
    const identity = submissionIdentity(item);
    if (identity) {
      await ensureSubmissionIndex();
      const other = await Case.findOne({ ...identity.filter, _id: { $ne: item._id },
        status: { $nin: CLOSED_CASE_STATUSES } }).select('_id').lean();
      if (other) throw blockedError({ allowed: false, code: 'CASE_ALREADY_OPEN', retryAfter: 0,
        message: 'У автора уже есть другое открытое обращение. Сначала закройте его.' });
      await releaseExpiredSlot(identity);
      item.submissionKey = identity.key;
    }
  }
  if (closing && (!wasClosed || !item.resolvedAt)) item.resolvedAt = new Date();
  if (!closing) item.resolvedAt = null;
  item.status = nextStatus;
}

function sendSubmissionError(res, error) {
  if (error?.caseSubmissionState) {
    const state = error.caseSubmissionState;
    if (state.retryAfter) res.set('Retry-After', String(state.retryAfter));
    res.status(error.status || 409).json({ ...state, submission: state });
    return true;
  }
  if (isSubmissionKeyConflict(error) || error?.name === 'VersionError') {
    res.status(409).json({ code: 'CASE_CONFLICT', message: 'Обращение уже изменилось или у автора есть другое обращение. Обновите список.' });
    return true;
  }
  return false;
}

module.exports = { submissionIdentity, getSubmissionState, createSubmittedCase, prepareCaseStatus, sendSubmissionError };
