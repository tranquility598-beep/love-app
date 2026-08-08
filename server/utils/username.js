const USERNAME_COLLATION = Object.freeze({ locale: 'en', strength: 2 });
const USERNAME_INDEX_NAME = 'username_unique_ci';

function normalizeUsername(value) {
  return String(value || '').trim();
}

function sanitizeUsernameBase(value) {
  const sanitized = normalizeUsername(value)
    .replace(/[^a-zA-Z0-9_а-яА-ЯёЁ]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

  return sanitized.length >= 2 ? sanitized : 'user';
}

function findUserByUsername(User, username, excludeUserId = null) {
  const query = { username: normalizeUsername(username) };
  if (excludeUserId) query._id = { $ne: excludeUserId };

  return User.findOne(query).collation(USERNAME_COLLATION);
}

function getDuplicateField(error) {
  if (!error || error.code !== 11000) return null;

  if (error.keyPattern?.username || error.keyValue?.username || /username/i.test(error.message || '')) {
    return 'username';
  }
  if (error.keyPattern?.email || error.keyValue?.email || /email/i.test(error.message || '')) {
    return 'email';
  }
  return 'unknown';
}

async function generateAvailableUsername(User, preferredName, stableSuffix = '') {
  const base = sanitizeUsernameBase(preferredName);
  const suffix = String(stableSuffix || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8) || 'new';

  const candidates = [base];
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const tail = attempt === 0 ? `_${suffix}` : `_${suffix}${attempt}`;
    candidates.push(`${base.slice(0, 32 - tail.length)}${tail}`);
  }

  for (const candidate of candidates) {
    if (!await findUserByUsername(User, candidate)) return candidate;
  }

  throw new Error('Не удалось подобрать свободное имя пользователя');
}

async function ensureCaseInsensitiveUsernameIndex(User) {
  const indexes = await User.collection.indexes();
  const existing = indexes.find(index => index.name === USERNAME_INDEX_NAME);

  if (existing) {
    const hasExpectedCollation = existing.unique === true
      && existing.collation?.strength === USERNAME_COLLATION.strength;
    if (!hasExpectedCollation) {
      throw new Error(`Index ${USERNAME_INDEX_NAME} exists with incompatible options`);
    }
    return false;
  }

  await User.collection.createIndex(
    { username: 1 },
    {
      name: USERNAME_INDEX_NAME,
      unique: true,
      collation: USERNAME_COLLATION
    }
  );
  return true;
}

module.exports = {
  USERNAME_COLLATION,
  USERNAME_INDEX_NAME,
  normalizeUsername,
  generateAvailableUsername,
  findUserByUsername,
  getDuplicateField,
  ensureCaseInsensitiveUsernameIndex
};
