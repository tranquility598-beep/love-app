function assertProductionSecurity() {
  if (process.env.NODE_ENV !== 'production') return;

  const requirements = [
    ['JWT_SECRET', process.env.JWT_SECRET, 32],
    ['ADMIN_2FA_ENCRYPTION_KEY', process.env.ADMIN_2FA_ENCRYPTION_KEY, 32]
  ];
  const invalid = requirements
    .filter(([, value, length]) => !value || value.length < length)
    .map(([name]) => name);

  if (invalid.length) {
    throw new Error(`Production security configuration is missing or too short: ${invalid.join(', ')}`);
  }
  if (!process.env.ADMIN_ORIGINS) {
    throw new Error('ADMIN_ORIGINS must be explicitly configured in production');
  }
  if (!process.env.ALLOWED_ORIGINS) {
    throw new Error('ALLOWED_ORIGINS must be explicitly configured in production');
  }

  const adminOrigins = process.env.ADMIN_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
  if (!adminOrigins.length || adminOrigins.some(origin => !origin.startsWith('https://') || origin.includes('*'))) {
    throw new Error('ADMIN_ORIGINS must contain exact HTTPS origins without wildcards');
  }
  if (process.env.ALLOWED_ORIGINS.includes('*')) {
    throw new Error('ALLOWED_ORIGINS must not contain wildcards');
  }
  if (process.env.ADMIN_ALLOW_NO_ORIGIN === 'true') {
    throw new Error('ADMIN_ALLOW_NO_ORIGIN cannot be enabled in production');
  }
  if (process.env.ADMIN_BOOTSTRAP_CODE_HASH) {
    throw new Error('ADMIN_BOOTSTRAP_CODE_HASH is forbidden in production');
  }
  if (process.env.ADMIN_LOCAL_EMAIL_PREVIEW === 'true') {
    throw new Error('ADMIN_LOCAL_EMAIL_PREVIEW is forbidden in production');
  }
}

module.exports = { assertProductionSecurity };
