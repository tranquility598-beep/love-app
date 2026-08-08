#!/usr/bin/env node
/**
 * Guard: проверяет, что в собранных артефактах (build/dist) нет .env файлов
 * и известных секретных паттернов. Падает с кодом 1 при обнаружении —
 * используется в release workflow до публикации.
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'build', 'dist');
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.yml', '.yaml', '.html', '.txt', '.md', '.cjs', '.mjs']);
const MAX_TEXT_FILE_SIZE = 5 * 1024 * 1024;

// Паттерны, которых не должно быть в поставляемых артефактах.
const SECRET_PATTERNS = [
  { name: 'MongoDB URI', re: /mongodb(\+srv)?:\/\/[^\s"']+:[^s"']+@/i },
  { name: 'Cloudinary URL с секретом', re: /cloudinary:\/\/[^@\s"']+@/i },
  { name: 'Private key', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  // Строковый литерал, присвоенный секретной переменной (не чтение process.env).
  { name: 'JWT secret literal', re: /JWT_SECRET\s*=\s*['"][^'"]{12,}['"]/ },
  { name: 'TURN credential literal', re: /(TURN_CREDENTIAL|TURN_SECRET|credential)\s*[:=]\s*['"][^'"]{12,}['"]/ },
  // Регрессионный сторожок: старый публичный JWT-fallback не должен возвращаться.
  { name: 'Known public JWT fallback', re: /love-app-secret-key-2024/ }
];

let violations = [];

function scanFile(filePath) {
  const base = path.basename(filePath);
  if (base === '.env' || /^\.env\./.test(base)) {
    violations.push(`${filePath}: найден .env файл`);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) return;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }
  if (stat.size > MAX_TEXT_FILE_SIZE) return;
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(content)) {
      violations.push(`${filePath}: обнаружен паттерн «${name}»`);
    }
  }
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) scanFile(full);
  }
}

if (!fs.existsSync(DIST_DIR)) {
  console.error(`[check-build-secrets] Каталог ${DIST_DIR} не найден — сборка не выполнялась?`);
  process.exit(1);
}

walk(DIST_DIR);

if (violations.length) {
  console.error('[check-build-secrets] ОБНАРУЖЕНЫ СЕКРЕТЫ В АРТЕФАКТАХ СБОРКИ:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error('[check-build-secrets] Публикация запрещена до устранения утечки.');
  process.exit(1);
}

console.log('[check-build-secrets] OK: секретов в артефактах не обнаружено.');
