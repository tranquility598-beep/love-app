/**
 * Генератор og-default.png — карточки превью для страниц без своей картинки.
 *
 * ЗАПУСКАЕТСЯ ВРУЧНУЮ И ТОЛЬКО ЛОКАЛЬНО, из корня репозитория:
 *   node server/assets/og-default.build.js
 * Результат (og-default.png) коммитится рядом и раздаётся как обычный файл.
 *
 * Почему так, а не рисованием на запрос: canvas стоит в КОРНЕВОМ package.json
 * (это зависимость Electron-клиента), а сервер разворачивается из
 * server/package.json командой npm ci --ignore-scripts — нативный модуль там
 * не собрать. Плюс на сервере до недавнего времени не было ни одного шрифта.
 * Поэтому инструмент работает там, где он есть, а в прод уезжает готовый PNG.
 *
 * Пути картинок в мета-теге выбираются так: своя картинка (Premium) → аватар
 * владельца → этот файл. Персональные карточки с именем и аватаром будет
 * рисовать редактор в браузере и загружать как обычную картинку страницы:
 * там и шрифты есть, и canvas бесплатный.
 */
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const W = 1200;
const H = 630;
const BG = '#0b0b12';
const BG2 = '#141420';
const ACCENT = '#7c5cff';
const ACCENT_TO = '#ff3fa4';
const TEXT = '#f2f2f7';
const MUTED = '#9b9baa';
const FONT = '"Segoe UI", "DejaVu Sans", Arial, sans-serif';

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// Проверка, что шрифт вообще рисует буквы: нулевая ширина означает, что
// картинка получится без текста, и коммитить её нельзя.
ctx.font = `700 60px ${FONT}`;
const probe = ctx.measureText('Страница').width;
if (probe < 10) {
  console.error('Шрифт не рисует кириллицу (ширина ' + probe + '). Картинка не создана.');
  process.exit(1);
}

// Фон
const bg = ctx.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, BG);
bg.addColorStop(0.55, BG2);
bg.addColorStop(1, BG);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

// Два акцентных пятна
function blob(x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}
blob(250, 150, 420, ACCENT, 0.42);
blob(980, 520, 420, ACCENT_TO, 0.34);

// Сердце по центру сверху
function heart(cx, cy, size, fill) {
  const s = size / 20;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(-11, 0, -10, -9, -4.5, -9);
  ctx.bezierCurveTo(-1.5, -9, 0, -6.5, 0, -6.5);
  ctx.bezierCurveTo(0, -6.5, 1.5, -9, 4.5, -9);
  ctx.bezierCurveTo(10, -9, 11, 0, 0, 8);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

const grad = ctx.createLinearGradient(W / 2 - 60, 175, W / 2 + 60, 265);
grad.addColorStop(0, ACCENT);
grad.addColorStop(1, ACCENT_TO);
heart(W / 2, 215, 116, grad);

ctx.textAlign = 'center';

ctx.font = `700 72px ${FONT}`;
ctx.fillStyle = TEXT;
ctx.fillText('Страница в Love', W / 2, 380);

ctx.font = `400 34px ${FONT}`;
ctx.fillStyle = MUTED;
ctx.fillText('ссылки, музыка и оформление — на одной странице', W / 2, 434);

// Плашка с адресом
const label = 'me.loveapp.chat';
ctx.font = `600 30px ${FONT}`;
const tw = ctx.measureText(label).width;
const pillW = tw + 64;
const pillH = 60;
const pillX = W / 2 - pillW / 2;
const pillY = 492;
const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY + pillH);
pillGrad.addColorStop(0, ACCENT);
pillGrad.addColorStop(1, ACCENT_TO);
ctx.beginPath();
ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
ctx.fillStyle = pillGrad;
ctx.fill();
ctx.fillStyle = '#ffffff';
ctx.fillText(label, W / 2, pillY + 40);

const outDir = path.join(__dirname, 'server', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'og-default.png');
const buf = canvas.toBuffer('image/png');
fs.writeFileSync(outFile, buf);
console.log('готово:', outFile, '|', buf.length, 'байт | ширина пробного текста', Math.round(probe));
