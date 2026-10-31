/**
 * Конструктор темы (Love Premium): свои цвета вместо готовой темы.
 *
 * Человек выбирает пять цветов — фон, второй фон, текст, приглушённый текст и
 * акцент. Остальное (подложки, рамки, текст на кнопках) выводится из них, а
 * читаемость подстраивается здесь, на сервере: текст держит контраст 4.5 к
 * обоим фонам, приглушённый — 3. Сломать страницу до нечитаемой нельзя
 * никаким набором цветов, а редактор честно говорит, что поправили.
 */

const { HEX6, hexRgb, rgbHex, luminance, mix, rgba, readableOnGradient, ensureContrast } = require('./profileColor');

const CUSTOM_THEME_FIELDS = Object.freeze(['bg', 'bg2', 'text', 'muted', 'accent']);

function pick(raw, key) {
  const value = raw && raw[key];
  return HEX6.test(String(value || '')) ? String(value).toLowerCase() : null;
}

/** null, если своя тема выключена; иначе { tokens, adjusted: [поля] }. */
function buildCustomTheme(raw) {
  if (!raw || !raw.enabled) return null;
  const bg = pick(raw, 'bg') || '#0b0b0f';
  const light = luminance(hexRgb(bg)) > 0.4;
  const bg2 = pick(raw, 'bg2') || rgbHex(mix(hexRgb(bg), [255, 255, 255], light ? 0.6 : 0.07));
  const adjusted = [];

  const text = ensureContrast(pick(raw, 'text') || (light ? '#16161a' : '#f2f2f2'), [bg, bg2], 4.5);
  if (text.adjusted) adjusted.push('text');
  const mutedBase = pick(raw, 'muted') || rgbHex(mix(hexRgb(text.color), hexRgb(bg), 0.42));
  const muted = ensureContrast(mutedBase, [bg, bg2], 3);
  if (muted.adjusted && pick(raw, 'muted')) adjusted.push('muted');

  const accent = pick(raw, 'accent') || text.color;
  return {
    adjusted,
    tokens: {
      bg,
      bg2,
      surface: rgba(text.color, light ? 0.035 : 0.05),
      text: text.color,
      muted: muted.color,
      accent,
      accentText: readableOnGradient(accent, accent, '#ffffff'),
      border: rgba(text.color, light ? 0.1 : 0.11)
    }
  };
}

module.exports = { CUSTOM_THEME_FIELDS, buildCustomTheme };
