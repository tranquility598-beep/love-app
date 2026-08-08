function envFlag(name, fallback = true) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

const featureFlags = Object.freeze({
  adminV1: envFlag('FEATURE_ADMIN_V1'),
  casesV1: envFlag('FEATURE_CASES_V1'),
  communityV1: envFlag('FEATURE_COMMUNITY_V1'),
  analyticsV1: envFlag('FEATURE_ANALYTICS_V1'),
  staffCommsV1: envFlag('FEATURE_STAFF_COMMS_V1')
});

function requireFeature(name) {
  return (req, res, next) => {
    if (featureFlags[name]) return next();
    return res.status(404).json({ message: 'Функция временно отключена' });
  };
}

module.exports = { featureFlags, requireFeature };
