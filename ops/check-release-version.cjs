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

const refName = process.argv[2] || process.env.GITHUB_REF_NAME || '';
if (/^v\d/.test(refName) && refName !== `v${desktopVersion}`) {
  throw new Error(
    `Тег ${refName} не совпадает с версией приложения v${desktopVersion}`
  );
}

console.log(`Версия релиза согласована: v${desktopVersion}`);
