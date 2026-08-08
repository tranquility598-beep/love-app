const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const AnalyticsDaily = require('../models/AnalyticsDaily');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const User = require('../models/User');
const Server = require('../models/Server');
const Message = require('../models/Message');
const LoginLog = require('../models/LoginLog');
const Case = require('../models/Case');
const ModerationAction = require('../models/ModerationAction');

const FIVE_MINUTES = 5 * 60 * 1000;
const SNAPSHOT_RETENTION = 90 * 24 * 60 * 60 * 1000;

function floorBucket(date = new Date()) {
  return new Date(Math.floor(date.getTime() / FIVE_MINUTES) * FIVE_MINUTES);
}

async function capturePresenceSnapshot(presence) {
  const bucket = floorBucket();
  const sessions = [...presence.connectedUsers.values()]
    .reduce((total, sockets) => total + sockets.size, 0);
  const voiceParticipants = [...presence.voiceChannels.values()]
    .reduce((total, members) => total + members.length, 0);
  const uniqueUsers = presence.connectedUsers.size;

  await AnalyticsSnapshot.updateOne(
    { bucket },
    {
      $set: {
        uniqueUsers,
        sessions,
        voiceParticipants,
        expiresAt: new Date(bucket.getTime() + SNAPSHOT_RETENTION)
      }
    },
    { upsert: true }
  );

  const date = bucket.toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00.000Z`);
  const stats = await AnalyticsSnapshot.aggregate([
    { $match: { bucket: { $gte: start, $lt: new Date(start.getTime() + 86400000) } } },
    { $group: { _id: null, peak: { $max: '$uniqueUsers' }, average: { $avg: '$uniqueUsers' }, samples: { $sum: 1 } } }
  ]);
  const current = stats[0] || { peak: 0, average: 0, samples: 0 };
  await AnalyticsDaily.updateOne(
    { date },
    { $set: { peakOnline: current.peak, averageOnline: current.average, onlineSamples: current.samples } },
    { upsert: true }
  );
  return { bucket, uniqueUsers, sessions, voiceParticipants };
}

function startAnalyticsCollector(presence) {
  const capture = () => capturePresenceSnapshot(presence)
    .catch(error => console.error('[analytics] snapshot:', error.message));
  const initialTimer = setTimeout(capture, 5000);
  const interval = setInterval(capture, FIVE_MINUTES);
  initialTimer.unref?.();
  interval.unref?.();
  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}

function resolveRange(query) {
  const now = new Date();
  const presets = { '24h': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  if (query.from && query.to) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) {
      return { from, to, preset: 'custom' };
    }
  }
  const preset = presets[query.range] ? query.range : '7d';
  return { from: new Date(now.getTime() - presets[preset] * 86400000), to: now, preset };
}

function collectionSeries(model, dateField, from, to, unit, extraMatch = {}) {
  return model.aggregate([
    { $match: { ...extraMatch, [dateField]: { $gte: from, $lte: to } } },
    { $group: { _id: { $dateTrunc: { date: `$${dateField}`, unit, timezone: 'UTC' } }, value: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
}

async function getAnalytics(query, presence) {
  const { from, to, preset } = resolveRange(query);
  const unit = to.getTime() - from.getTime() <= 2 * 86400000 ? 'hour' : 'day';
  const dayAgo = new Date(to.getTime() - 86400000);
  const weekAgo = new Date(to.getTime() - 7 * 86400000);
  const monthAgo = new Date(to.getTime() - 30 * 86400000);

  const [
    totalUsers, verifiedUsers, totalServers, totalMessages, totalCases,
    dauUsers, wauUsers, mauUsers, snapshots,
    registrations, verifications, messages, servers, cases, punishments, calls,
    caseBreakdown, punishmentBreakdown
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isVerified: true }),
    Server.countDocuments(),
    Message.countDocuments(),
    Case.countDocuments(),
    LoginLog.distinct('userId', { status: 'success', timestamp: { $gte: dayAgo, $lte: to } }),
    LoginLog.distinct('userId', { status: 'success', timestamp: { $gte: weekAgo, $lte: to } }),
    LoginLog.distinct('userId', { status: 'success', timestamp: { $gte: monthAgo, $lte: to } }),
    AnalyticsSnapshot.find({ bucket: { $gte: from, $lte: to } }).sort({ bucket: 1 }).lean(),
    collectionSeries(User, 'createdAt', from, to, unit),
    collectionSeries(User, 'verifiedAt', from, to, unit),
    collectionSeries(Message, 'createdAt', from, to, unit),
    collectionSeries(Server, 'createdAt', from, to, unit),
    collectionSeries(Case, 'createdAt', from, to, unit),
    collectionSeries(ModerationAction, 'createdAt', from, to, unit, { type: { $in: ['warning', 'mute', 'ban', 'deactivate'] } }),
    collectionSeries(AnalyticsEvent, 'occurredAt', from, to, unit, { type: 'call_started' }),
    Case.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: '$kind', value: { $sum: 1 } } }]),
    ModerationAction.aggregate([{ $match: { createdAt: { $gte: from, $lte: to } } }, { $group: { _id: '$type', value: { $sum: 1 } } }])
  ]);

  const onlineSessions = [...presence.connectedUsers.values()].reduce((sum, value) => sum + value.size, 0);
  const peakOnline = snapshots.reduce((max, item) => Math.max(max, item.uniqueUsers), presence.connectedUsers.size);
  const averageOnline = snapshots.length
    ? snapshots.reduce((sum, item) => sum + item.uniqueUsers, 0) / snapshots.length
    : presence.connectedUsers.size;

  const buckets = new Map();
  const addSeries = (name, rows) => rows.forEach(row => {
    const key = row._id.toISOString();
    const item = buckets.get(key) || { at: key };
    item[name] = row.value;
    buckets.set(key, item);
  });
  addSeries('registrations', registrations);
  addSeries('verifications', verifications);
  addSeries('messages', messages);
  addSeries('servers', servers);
  addSeries('cases', cases);
  addSeries('punishments', punishments);
  addSeries('calls', calls);

  return {
    range: { preset, from, to, unit, timezone: 'UTC' },
    kpis: {
      totalUsers,
      verifiedUsers,
      verificationConversion: totalUsers ? verifiedUsers / totalUsers : 0,
      totalServers,
      totalMessages,
      totalCases,
      dau: dauUsers.length,
      wau: wauUsers.length,
      mau: mauUsers.length,
      onlineUsers: presence.connectedUsers.size,
      onlineSessions,
      averageOnline: Math.round(averageOnline * 10) / 10,
      peakOnline
    },
    online: snapshots.map(item => ({
      at: item.bucket,
      users: item.uniqueUsers,
      sessions: item.sessions,
      voice: item.voiceParticipants
    })),
    timeline: [...buckets.values()].sort((a, b) => a.at.localeCompare(b.at)),
    caseBreakdown: Object.fromEntries(caseBreakdown.map(item => [item._id, item.value])),
    punishmentBreakdown: Object.fromEntries(punishmentBreakdown.map(item => [item._id, item.value]))
  };
}

module.exports = { capturePresenceSnapshot, startAnalyticsCollector, getAnalytics, resolveRange };
