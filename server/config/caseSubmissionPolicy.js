const CLOSED_CASE_STATUSES = Object.freeze(['resolved', 'rejected', 'archived']);
const CASE_COOLDOWN_MS = 15 * 60 * 1000;
const CASE_SUBMISSION_POLICY_VERSION = 1;
const CASE_SUBMISSION_INDEX = Object.freeze({
  name: 'case_submission_key_unique',
  unique: true,
  background: true,
  partialFilterExpression: { submissionKey: { $type: 'string' } }
});

module.exports = { CLOSED_CASE_STATUSES, CASE_COOLDOWN_MS, CASE_SUBMISSION_POLICY_VERSION, CASE_SUBMISSION_INDEX };
