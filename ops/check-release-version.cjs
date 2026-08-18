const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);
const pubspec = fs.readFileSync(
  path.join(rootDir, 'mobile', 'pubspec.yaml'),
  'utf8'
);
const mobileVersionMatch = pubspec.match(/^version:\s*([^+\s]+)(?:\+\d+)?\s*$/m);

if (!mobileVersionMatch) {
  throw new Error('Не удалось прочитать version из mobile/pubspec.yaml');
}

const desktopVersion = packageJson.version;
const mobileVersion = mobileVersionMatch[1];

if (desktopVersion !== mobileVersion) {
  throw new Error(
    `Версии не совпадают: package.json=${desktopVersion}, mobile/pubspec.yaml=${mobileVersion}`
  );
}

// Номера, зашитые в интерфейс. Обычно их не видно — версия приходит из сборки
// (app.getVersion() на десктопе, PackageInfo на телефоне), но если этот путь
// отвалится, пользователю покажут именно эти строки. Именно так интерфейс
// полгода показывал 2.0.0 на 2.1.0, поэтому теперь релиз без их обновления
// не собирается.
const hardcoded = [
  {
    file: path.join('client', 'js', 'new', 'script.js'),
    what: 'APP_VERSION_FALLBACK',
    pattern: /APP_VERSION_FALLBACK\s*=\s*['"]([^'"]+)['"]/
  },
  {
    file: path.join('client', 'index.html'),
    what: 'бейдж «Текущая версия» в настройках',
    pattern: /id="settings-updates-version"[^>]*>\s*v?([0-9][^<\s]*)\s*</
  },
  {
    file: path.join('client', 'index.html'),
    what: 'бейдж версии в разделе «О программе»',
    pattern: /id="settings-about-version"[^>]*>\s*v?([0-9][^<\s]*)\s*</
  },
  {
    file: path.join('mobile', 'lib', 'src', 'config', 'app_config.dart'),
    what: 'AppConfig.productVersion',
    pattern: /productVersion\s*=\s*['"]([^'"]+)['"]/
  }
];

const problems = [];

for (const item of hardcoded) {
  const fullPath = path.join(rootDir, item.file);
  let contents;
  try {
    contents = fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    problems.push(`${item.file}: файл не читается (${error.code || error.message})`);
    continue;
  }
  const found = contents.match(item.pattern);
  if (!found) {
    problems.push(
      `${item.file}: не нашёл ${item.what} — проверьте, не переписали ли это место`
    );
    continue;
  }
  if (found[1] !== desktopVersion) {
    problems.push(
      `${item.file}: ${item.what} = ${found[1]}, а версия релиза ${desktopVersion}`
    );
  }
}

if (problems.length > 0) {
  throw new Error(
    ['Зашитые в интерфейс номера версии отстали:', ...problems.map((p) => `  - ${p}`)].join('\n')
  );
}

const refName = process.argv[2] || process.env.GITHUB_REF_NAME || '';
if (/^v\d/.test(refName) && refName !== `v${desktopVersion}`) {
  throw new Error(
    `Тег ${refName} не совпадает с версией приложения v${desktopVersion}`
  );
}

console.log(`Версия релиза согласована: v${desktopVersion}`);
