/**
 * Цвета публичной страницы: контраст по WCAG и подстройка читаемости.
 *
 * Пользовательские цвета сюда приходят только как #rrggbb (проверены в роуте),
 * наружу уходят тоже только #rrggbb или rgba() из чисел — ни одной строки,
 * которой можно было бы закрыть CSS-свойство.
 */

const HEX6 = /^#[0-9a-f]{6}$/i;

function hexRgb(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value == null ? '' : value).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

function rgbHex(rgb) {
  return `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(rgb) {
  const [r, g, b] = rgb.map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function rgba(hex, alpha) {
  const rgb = hexRgb(hex) || [255, 255, 255];
  return `rgba(${rgb.join(',')},${Number(alpha).toFixed(3)})`;
}

// Текст, который читается по ВСЕЙ длине градиента: концы и середина.
function readableOnGradient(from, to, fallback) {
  const a = hexRgb(from), b = hexRgb(to);
  if (!a || !b) return fallback;
  const stops = [a, b, a.map((v, i) => Math.round((v + b[i]) / 2))];
  let best = fallback, score = -1;
  for (const option of ['#0b0b0b', '#ffffff']) {
    const rgb = hexRgb(option);
    const worst = Math.min(...stops.map(stop => contrast(rgb, stop)));
    if (worst > score) { score = worst; best = option; }
  }
  return best;
}

/**
 * Цвет, который читается на всех фонах из списка не хуже min.
 *
 * Если исходный уже читается — он и возвращается. Иначе перебираем кандидатов:
 * исходный цвет, уведённый к чёрному и к белому мелкими шагами, и все серые.
 * Из тех, что проходят min на ВСЕХ фонах, берём самый близкий к исходному —
 * оттенок человека сохраняется, сколько возможно. Серые нужны для фонов на
 * разных краях (чёрный и белый): там проходит только середина, и прежний
 * поиск в одну сторону её не находил.
 *
 * Если пройти min нельзя никаким цветом, возвращаем цвет с наибольшим худшим
 * контрастом — лучшее из возможного, а не первый попавшийся край.
 */
function ensureContrast(fg, backgrounds, min) {
  const color = hexRgb(fg);
  const bgs = backgrounds.map(hexRgb).filter(Boolean);
  if (!color || !bgs.length) return { color: fg, adjusted: false };
  const worst = rgb => Math.min(...bgs.map(bg => contrast(rgb, bg)));
  if (worst(color) >= min) return { color: rgbHex(color), adjusted: false };

  const candidates = [];
  for (let step = 1; step <= 100; step += 1) {
    candidates.push(mix(color, [0, 0, 0], step / 100), mix(color, [255, 255, 255], step / 100));
  }
  for (let level = 0; level <= 255; level += 1) candidates.push([level, level, level]);

  const distance = rgb => Math.hypot(rgb[0] - color[0], rgb[1] - color[1], rgb[2] - color[2]);
  let best = null, bestDistance = Infinity, fallback = null, fallbackScore = -1;
  for (const raw of candidates) {
    const rgb = hexRgb(rgbHex(raw));        // округляем так же, как уйдёт в CSS
    const score = worst(rgb);
    if (score >= min && distance(rgb) < bestDistance) { best = rgb; bestDistance = distance(rgb); }
    if (score > fallbackScore) { fallback = rgb; fallbackScore = score; }
  }
  return { color: rgbHex(best || fallback), adjusted: true };
}

module.exports = { HEX6, hexRgb, rgbHex, luminance, contrast, mix, rgba, readableOnGradient, ensureContrast };
