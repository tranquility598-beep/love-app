const AuditLog = require('../models/AuditLog');
const { requestIp } = require('../utils/security');

async function logAudit({ req, actor, action, targetType, targetId, details = {} }) {
  return AuditLog.create({
    actor: actor?._id || actor,
    action,
    targetType,
    targetId,
    details,
    ip: req ? requestIp(req) : '',
    userAgent: req?.headers?.['user-agent'] || ''
  });
}

module.exports = { logAudit };
