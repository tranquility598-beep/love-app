/**
 * Детали оформления, порядок блоков и свои наборы стиля.
 *
 * Всё здесь — выбор из закрытых списков, которые присылает сервер
 * (capabilities.styleOptions). Своего CSS у человека нет и не будет: ровно из-за
 * этого любая страница Love выглядит прилично, как её ни крути.
 *
 * Объект style уходит на сервер целиком, как background: две быстрые правки
 * подряд иначе затёрли бы друг друга в очереди автосохранения. Поэтому каждая
 * правка собирается из свежего state, а не из снимка на момент отрисовки.
 */

import { $, fill, el, toast, lockNote } from './ui.js';
import { state, update, fieldError, feature } from './store.js';
import { api } from './api.js';
import { toggle, choicePicker, slider, groupTitle, textField, colorInput, shiftHue, fold, nameOf } from './fields.js';
import { renderLook, renderBackground } from './sections.js';

const caps = () => state.caps || {};
const options = (key) => (caps().styleOptions || {})[key] || [];
const contentLimits = () => caps().limits || {};

export function styleNow() {
  const style = (state.page && state.page.style) || {};
  return {
    ...(caps().styleDefaults || {}),
    ...style,
    blockOrder: [...(style.blockOrder || [])],
    hiddenBlocks: [...(style.hiddenBlocks || [])],
    nameColors: [...(style.nameColors || [])]
  };
}

// ---------------------------------------------------------------------------
// Читаемость — тот же расчёт, что на сервере (server/utils/profileColor.js):
// редактор заранее показывает, какой цвет окажется на странице.
// ---------------------------------------------------------------------------

function rgbOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexOf = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
function lum(rgb) {
  const [r, g, b] = rgb.map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function readable(fg, bgs, min) {
  const color = rgbOf(fg);
  const backs = bgs.map(rgbOf).filter(Boolean);
  if (!color || !backs.length) return { color: fg, adjusted: false };
  const worst = (rgb) => Math.min(...backs.map((bg) => ratio(rgb, bg)));
  if (worst(color) >= min) return { color: hexOf(color), adjusted: false };
  // Кандидаты: к чёрному, к белому мелкими шагами и все серые; из прошедших
  // берём ближайший к исходному. Без серых пара фонов «чёрный + белый»
  // оставалась без решения.
  const candidates = [];
  for (let step = 1; step <= 100; step += 1) {
    candidates.push(color.map((v) => v * (1 - step / 100)), color.map((v) => v + (255 - v) * (step / 100)));
  }
  for (let level = 0; level <= 255; level += 1) candidates.push([level, level, level]);
  const distance = (rgb) => Math.hypot(rgb[0] - color[0], rgb[1] - color[1], rgb[2] - color[2]);
  let best = null, bestDistance = Infinity, fallback = null, fallbackScore = -1;
  for (const raw of candidates) {
    const rgb = rgbOf(hexOf(raw));
    const score = worst(rgb);
    if (score >= min && distance(rgb) < bestDistance) { best = rgb; bestDistance = distance(rgb); }
    if (score > fallbackScore) { fallback = rgb; fallbackScore = score; }
  }
  return { color: hexOf(best || fallback), adjusted: true };
}

/** Фон, на котором стоит имя: своя тема или выбранная готовая. */
function pageBackground() {
  const custom = state.page.customTheme || {};
  if (custom.enabled && rgbOf(custom.bg)) return custom.bg;
  const theme = (caps().themes || []).find((item) => item.id === state.page.theme);
  return (theme && theme.tokens && theme.tokens.bg) || '#090909';
}

function themeTokens() {
  const theme = (caps().themes || []).find((item) => item.id === state.page.theme) || (caps().themes || [])[0];
  return (theme && theme.tokens) || {};
}

export const patchStyle = (extra, opts) => update({ style: { ...styleNow(), ...extra } }, opts);

// Значения по умолчанию присылает сервер (styleDefaults). Для списков цветов
// «по умолчанию» — пустой список.
const STYLE_EMPTY = { nameColors: [], cursorColors: [] };
function styleDefault(key) {
  const defaults = caps().styleDefaults || {};
  if (Object.prototype.hasOwnProperty.call(defaults, key)) return defaults[key];
  return Object.prototype.hasOwnProperty.call(STYLE_EMPTY, key) ? STYLE_EMPTY[key] : null;
}
function sameValue(a, b) {
  if (a == null && Array.isArray(b)) a = [];
  if (b == null && Array.isArray(a)) b = [];
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
export function styleChanged(keys) {
  const s = styleNow();
  return keys.some((key) => !sameValue(s[key], styleDefault(key)));
}
export function resetStyle(keys) {
  patchStyle(Object.fromEntries(keys.map((key) => [key, styleDefault(key)])), { now: true });
}

// Всё про аватар собрано в одной группе «Аватар» карточки «Оформление».
export const AVATAR_STYLE_KEYS = ['avatarShape', 'avatarSize', 'avatarTilt'];
export function avatarSummary() {
  const s = styleNow();
  return [nameOf(options('avatarShape'), s.avatarShape), nameOf(options('avatarSize'), s.avatarSize)].filter(Boolean).join(' · ');
}
export function avatarFields() {
  const s = styleNow();
  const pickAvatar = (key, label) => choicePicker({
    label,
    items: options(key),
    value: s[key],
    wide: true,
    preview: ART[key] || null,
    error: fieldError(`style.${key}`),
    onPick: (id) => { patchStyle({ [key]: id }, { now: true }); renderLook(); }
  });
  return [
    pickAvatar('avatarShape', 'Форма аватара'),
    pickAvatar('avatarSize', 'Размер аватара'),
    toggle({
      label: 'Аватар наклоняется',
      hint: 'За курсором на компьютере и от наклона телефона.',
      checked: Boolean(s.avatarTilt),
      locked: !feature('avatarTilt').allowed,
      requires: feature('avatarTilt').requires,
      error: fieldError('style.avatarTilt'),
      onToggle: (on) => { patchStyle({ avatarTilt: on }, { now: true }); renderLook(); }
    })
  ];
}

// ---------------------------------------------------------------------------
// Маленькие картинки к вариантам
// ---------------------------------------------------------------------------

const art = (kind, id, children = [el('i'), el('i')]) =>
  el('span', { class: `style-art style-art--${kind} is-${id}`, 'aria-hidden': true }, children);

const CURSOR_GLYPHS = { default: '↖', dot: '●', ring: '◎', heart: '♥', spark: '✦', cross: '+', custom: '⬚' };

const ART = {
  nameAlign: (item) => art('align', item.id, [el('i'), el('i'), el('i')]),
  avatarShape: (item) => art('avatar', item.id, [el('i')]),
  linkShape: (item) => art('link', `shape-${item.id}`, [el('i')]),
  linkFill: (item) => art('link', `fill-${item.id}`, [el('i')]),
  linkLayout: (item) => art('layout', item.id, [el('i'), el('i'), el('i'), el('i')]),
  nameFill: (item) => art('namefill', item.id, [el('i', { text: 'Aa' })]),
  cardShadow: (item) => art('shadow', item.id, [el('i')]),
  cursor: (item) => el('span', { class: 'style-art style-art--cursor', 'aria-hidden': true, text: CURSOR_GLYPHS[item.id] || '↖' })
};

// ---------------------------------------------------------------------------
// Детали
// ---------------------------------------------------------------------------

const NAME_KEYS = ['nameAlign', 'nameSize', 'nameFill', 'nameColors', 'nameAngle', 'nameEffect', 'nameGradient'];
const LINK_KEYS = ['linkShape', 'linkFill', 'linkLayout', 'linkMotion'];
const CARD_KEYS = ['cardAlpha', 'cardRadius', 'cardBorder', 'cardShadow'];
const CURSOR_KEYS = ['cursor', 'cursorHotspot', 'cursorColors'];
function trailCustom() {
  const t = trailNow();
  return t.colors.length > 0 || t.width !== 100 || t.length !== 560 || !t.glow;
}

export function renderStyle() {
  const s = styleNow();
  const pick = (key, label, hint) => choicePicker({
    label,
    hint,
    items: options(key),
    value: s[key],
    wide: true,
    preview: ART[key] || null,
    error: fieldError(`style.${key}`),
    // Перерисовка обновляет и подпись свёрнутой группы; открытые группы
    // остаются открытыми (fold помнит своё состояние).
    onPick: (id) => { patchStyle({ [key]: id }, { now: true }); renderStyle(); }
  });
  const nameColorNode = el('div', { class: 'name-colors' });

  // Цвета имени живут отдельно от акцента: можно оставить кнопки белыми, а имя
  // сделать розово-фиолетовым. Набор полей зависит от выбранного варианта.
  function paintNameColors() {
    const now = styleNow();
    const mode = now.nameFill === 'theme' && now.nameGradient ? 'accent' : now.nameFill;
    const colors = now.nameColors;
    const bg = pageBackground();
    const warn = colors.filter(Boolean).some((hex) => rgbOf(hex) && ratio(rgbOf(hex), rgbOf(bg)) < 3);

    if (mode !== 'solid' && mode !== 'gradient') { fill(nameColorNode, []); return; }
    const setColor = (index, hex) => {
      const next = styleNow().nameColors.slice();
      next[index] = hex;
      patchStyle({ nameColors: next });
      paintWarn();
    };
    const count = mode === 'solid' ? 1 : Math.max(2, Math.min(3, colors.length));
    const inputs = [];
    for (let i = 0; i < count; i += 1) {
      if (i) inputs.push(el('span', { class: 'color-arrow', text: '→', 'aria-hidden': true }));
      inputs.push(colorInput({ value: colors[i], fallback: colors[i - 1] || '#ffffff', title: `Цвет ${i + 1}`, onPick: (hex) => setColor(i, hex) }));
    }
    if (mode === 'gradient') {
      inputs.push(colors.length < 3
        ? el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: '+ цвет',
          onClick: () => { patchStyle({ nameColors: [...colors.slice(0, 2), shiftHue(colors[1] || '#ffffff', 50)] }, { now: true }); paintNameColors(); }
        })
        : el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Убрать третий',
          onClick: () => { patchStyle({ nameColors: colors.slice(0, 2) }, { now: true }); paintNameColors(); }
        }));
    }
    const warnNode = el('p', { class: 'hint hint--warn', text: 'Имя может теряться на этом фоне — возьмите цвет светлее или темнее.', hidden: !warn });
    function paintWarn() {
      const list = styleNow().nameColors;
      warnNode.hidden = !list.some((hex) => rgbOf(hex) && ratio(rgbOf(hex), rgbOf(bg)) < 3);
    }
    fill(nameColorNode, [
      el('div', { class: 'color-row' }, inputs),
      mode === 'gradient'
        ? slider({ label: 'Угол градиента', value: now.nameAngle ?? 90, min: 0, max: 360, unit: '°', onInput: (value) => patchStyle({ nameAngle: value }) })
        : null,
      warnNode,
      fieldError('style.nameColors') ? el('p', { class: 'field-error', role: 'alert', text: fieldError('style.nameColors') }) : null
    ]);
  }

  const nameFillPicker = choicePicker({
    label: 'Цвет имени',
    hint: 'Отдельно от акцента кнопок. Свой цвет — всем, градиенты — с Love Pro.',
    items: options('nameFill'),
    value: s.nameFill === 'theme' && s.nameGradient ? 'accent' : s.nameFill,
    wide: true,
    preview: (item) => art('namefill', item.id, [el('i', { text: 'Aa' })]),
    error: fieldError('style.nameFill'),
    onPick: (id) => {
      const now = styleNow();
      const base = now.nameColors[0] || state.page.accent || themeTokens().text || '#ffffff';
      const extra = { nameFill: id, nameGradient: false };
      if (id === 'solid' && !now.nameColors.length) extra.nameColors = [base];
      if (id === 'gradient' && now.nameColors.length < 2) extra.nameColors = [base, shiftHue(base, 70)];
      patchStyle(extra, { now: true });
      paintNameColors();
    }
  });
  paintNameColors();

  const label = (key) => nameOf(options(key), s[key]);
  const trailOn = (state.page.effects || []).includes('trail') || state.page.effect === 'trail';
  fill($('style-body'), [
    fold({
      id: 'style-name', title: 'Имя', open: true, target: '.pf-name',
      summary: `${label('nameSize')} · ${label('nameAlign')}`,
      changed: styleChanged(NAME_KEYS), onReset: () => { resetStyle(NAME_KEYS); renderStyle(); },
      children: [
    pick('nameAlign', 'Выравнивание шапки'),
    pick('nameSize', 'Размер имени'),
    nameFillPicker,
    nameColorNode,
    pick('nameEffect', 'Эффект имени', 'Срабатывает, когда страницу открыли. Обновите превью, чтобы посмотреть ещё раз.')
      ]
    }),

    fold({
      id: 'style-links', title: 'Кнопки ссылок', target: '.pf-link',
      summary: `${label('linkShape')} · ${label('linkFill')}`,
      changed: styleChanged(LINK_KEYS), onReset: () => { resetStyle(LINK_KEYS); renderStyle(); },
      children: [
    pick('linkShape', 'Форма кнопок'),
    pick('linkFill', 'Заливка'),
    pick('linkLayout', 'Расположение', '«Как в раскладке» — плиткой в Focus и Bento, списком в Studio, Center, Cover и Magazine.'),
    pick('linkMotion', 'Анимация кнопок', 'Блик пробегает по кнопкам ссылок или их рамка мягко «дышит». Без анимации — спокойнее.')
      ]
    }),

    fold({
      id: 'style-cards', title: 'Карточки', target: '.pf-link, .pf-player, .pf-block, .pf-pair',
      summary: `Подложка ${s.cardAlpha}% · скругление ${s.cardRadius} px`,
      changed: styleChanged(CARD_KEYS), onReset: () => { resetStyle(CARD_KEYS); renderStyle(); },
      children: [
    slider({
      label: 'Плотность подложки',
      value: s.cardAlpha,
      min: 0, max: 100, unit: ' %',
      hint: 'Ссылки, плеер и блоки. 0 — прозрачные, 100 — сплошные.',
      onInput: (value) => patchStyle({ cardAlpha: value })
    }),
    slider({
      label: 'Скругление',
      value: s.cardRadius,
      min: 0, max: 32, unit: ' px',
      onInput: (value) => patchStyle({ cardRadius: value })
    }),
    toggle({
      label: 'Рамка у карточек',
      checked: Boolean(s.cardBorder),
      onToggle: (on) => patchStyle({ cardBorder: on }, { now: true })
    }),
    pick('cardShadow', 'Тень')
      ]
    }),

    fold({
      id: 'style-motion', title: 'Появление', summary: label('entrance'),
      changed: styleChanged(['entrance']), onReset: () => { resetStyle(['entrance']); renderStyle(); },
      children: [
    pick('entrance', 'Появление блоков', 'Как блоки встречают гостя после открытия страницы.')
      ]
    }),

    fold({
      id: 'style-cursor', title: 'Курсор', summary: label('cursor') || 'Обычный',
      changed: styleChanged(CURSOR_KEYS), onReset: () => { resetStyle(CURSOR_KEYS); renderStyle(); },
      children: [
    choicePicker({
      label: 'Курсор',
      hint: 'Виден посетителям с компьютера. Готовые — цвета акцента, или загрузите свою картинку.',
      items: options('cursor'),
      value: s.cursor,
      wide: true,
      preview: ART.cursor,
      error: fieldError('style.cursor'),
      onPick: (id) => {
        if (id === 'custom' && !state.page.cursorImage) {
          toast('Сначала загрузите картинку курсора ниже');
          renderStyle();
          return;
        }
        patchStyle({ cursor: id }, { now: true });
        renderStyle();
      }
    }),
    cursorColorsField(),
    cursorUpload()
      ]
    }),

    fold({
      id: 'style-trail', title: 'Шлейф курсора', summary: trailOn ? 'Включён' : 'Выключен',
      changed: trailOn || trailCustom(),
      onReset: () => {
        const effects = (state.page.effects || []).filter((id) => id !== 'trail');
        update({ effects, trailStyle: { colors: [], width: 100, length: 560, glow: true } }, { now: true });
        renderStyle();
        renderLook();
      },
      children: trailFields()
    })
  ]);
}

// ---------------------------------------------------------------------------
// Свой курсор и шлейф
// ---------------------------------------------------------------------------

/**
 * Свой курсор. Браузеры не показывают курсоры больше 128 px, а на сервере
 * картинки не уменьшаются — поэтому ужимаем здесь, до 48×48 PNG, сохраняя
 * пропорции. Гифка становится первым кадром: анимированных курсоров браузеры
 * всё равно не умеют.
 */
async function shrinkCursor(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('Не получилось открыть картинку'));
      node.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(48 / image.width, 48 / image.height);
    const w = Math.max(1, Math.round(image.width * scale)), h = Math.max(1, Math.round(image.height * scale));
    ctx.drawImage(image, Math.round((48 - w) / 2), Math.round((48 - h) / 2), w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Не получилось подготовить курсор');
    return new File([blob], 'cursor.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Цвет готового курсора: свой или переход из двух цветов. */
function cursorColorsField() {
  const rule = feature('customCursor');
  const colors = styleNow().cursorColors || [];
  const base = state.page.accent || '#e7e7e7';
  const set = (next, now) => patchStyle({ cursorColors: next }, now ? { now: true } : undefined);
  return el('div', { class: 'field' }, [
    el('div', { class: 'field-top' }, [el('span', { class: 'field-label', text: 'Цвет курсора' })]),
    colors.length
      ? el('div', { class: 'color-row' }, [
        colorInput({ value: colors[0], fallback: base, disabled: !rule.allowed, title: 'Цвет курсора', onPick: (hex) => set([hex, ...(styleNow().cursorColors || []).slice(1)]) }),
        colors.length > 1
          ? el('span', { class: 'color-arrow', text: '→', 'aria-hidden': true })
          : null,
        colors.length > 1
          ? colorInput({ value: colors[1], fallback: base, disabled: !rule.allowed, title: 'Второй цвет', onPick: (hex) => set([(styleNow().cursorColors || [])[0] || base, hex]) })
          : el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Градиент', disabled: !rule.allowed, onClick: () => { set([colors[0], shiftHue(colors[0], 90)], true); renderStyle(); } }),
        colors.length > 1
          ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Один цвет', onClick: () => { set([colors[0]], true); renderStyle(); } })
          : null,
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Цвет акцента', onClick: () => { set([], true); renderStyle(); } })
      ])
      : el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', text: 'Свой цвет курсора', disabled: !rule.allowed,
        onClick: () => { set([base], true); renderStyle(); }
      }),
    el('p', { class: 'hint', text: 'Для готовых курсоров. Своя картинка показывается как есть.' })
  ]);
}

let cursorBusy = false;

function cursorUpload() {
  const rule = feature('customCursor');
  const image = state.page.cursorImage;
  const s = styleNow();
  const input = el('input', {
    type: 'file', accept: 'image/png,image/webp,image/gif,image/jpeg', hidden: true,
    onChange: async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      cursorBusy = true;
      renderStyle();
      try {
        const result = await api.upload('cursor', await shrinkCursor(file));
        update({ cursorImage: result.url, style: { ...styleNow(), cursor: 'custom' } }, { now: true });
        toast('Курсор загружен');
      } catch (error) {
        toast(error.message || 'Не получилось загрузить курсор', 'err');
      } finally {
        cursorBusy = false;
        renderStyle();
      }
    }
  });

  return el('div', { class: 'field cursor-field' }, [
    el('div', { class: 'cursor-row' }, [
      el('span', { class: 'cursor-preview', 'aria-hidden': true }, [image ? el('img', { src: image, alt: '' }) : el('span', { text: '↖' })]),
      el('button', {
        class: 'btn btn--sm', type: 'button',
        text: cursorBusy ? 'Загружаем…' : image ? 'Заменить картинку' : 'Загрузить свою картинку',
        disabled: cursorBusy || !rule.allowed,
        onClick: () => input.click()
      }),
      image
        ? el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Убрать',
          onClick: () => {
            update({ cursorImage: null, style: { ...styleNow(), cursor: s.cursor === 'custom' ? 'default' : s.cursor } }, { now: true });
            renderStyle();
          }
        })
        : null,
      input
    ]),
    image
      ? choicePicker({
        label: 'Где остриё',
        items: options('cursorHotspot'),
        value: s.cursorHotspot || 'corner',
        onPick: (id) => patchStyle({ cursorHotspot: id }, { now: true })
      })
      : null,
    el('p', { class: 'hint', text: 'Квадратная картинка с прозрачным фоном смотрится лучше всего. Мы уменьшим её до 48×48.' }),
    rule.allowed ? null : lockNote(rule.requires),
    fieldError('cursorImage') ? el('p', { class: 'field-error', role: 'alert', text: fieldError('cursorImage') }) : null
  ]);
}

function trailNow() {
  const raw = state.page.trailStyle || {};
  return {
    colors: (raw.colors || []).slice(0, 2),
    width: raw.width ?? 100,
    length: raw.length ?? 560,
    glow: raw.glow !== false
  };
}

const patchTrail = (extra, opts) => update({ trailStyle: { ...trailNow(), ...extra } }, opts);

function trailFields() {
  const rule = feature('trailStyle');
  const trail = trailNow();
  const on = (state.page.effects || []).includes('trail') || state.page.effect === 'trail';
  const base = state.page.accent || '#e7e7e7';
  const colors = trail.colors;
  return [
    el('p', {
      class: 'hint',
      text: on
        ? 'Шлейф включён в «Оформлении» → «Эффекты». Здесь — его вид.'
        : 'Шлейф появится, когда в «Оформлении» → «Эффекты» включён «Шлейф курсора».'
    }),
    el('div', { class: 'field' }, [
      el('div', { class: 'field-top' }, [el('span', { class: 'field-label', text: 'Цвета шлейфа' })]),
      colors.length
        ? el('div', { class: 'color-row' }, [
          colorInput({ value: colors[0], fallback: base, disabled: !rule.allowed, title: 'Начало шлейфа', onPick: (hex) => patchTrail({ colors: [hex, trailNow().colors[1] || hex] }) }),
          el('span', { class: 'color-arrow', text: '→', 'aria-hidden': true }),
          colorInput({ value: colors[1] || colors[0], fallback: base, disabled: !rule.allowed, title: 'Конец шлейфа', onPick: (hex) => patchTrail({ colors: [trailNow().colors[0] || base, hex] }) }),
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Цвета эффектов', onClick: () => { patchTrail({ colors: [] }, { now: true }); renderStyle(); } })
        ])
        : el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Свои цвета шлейфа', disabled: !rule.allowed,
          onClick: () => { patchTrail({ colors: [base, shiftHue(base, 120)] }, { now: true }); renderStyle(); }
        })
    ]),
    slider({
      label: 'Толщина', value: trail.width, min: 40, max: 300, step: 10, unit: ' %', disabled: !rule.allowed,
      onInput: (value) => patchTrail({ width: value })
    }),
    slider({
      label: 'Длина следа', value: trail.length, min: 200, max: 1600, step: 50, unit: ' мс', disabled: !rule.allowed,
      hint: 'Сколько живёт след за курсором.',
      onInput: (value) => patchTrail({ length: value })
    }),
    toggle({
      label: 'Свечение вокруг шлейфа',
      checked: trail.glow,
      locked: !rule.allowed,
      requires: rule.requires,
      onToggle: (value) => patchTrail({ glow: value }, { now: true })
    }),
    rule.allowed ? null : lockNote(rule.requires),
    fieldError('trailStyle') ? el('p', { class: 'field-error', role: 'alert', text: fieldError('trailStyle') }) : null
  ];
}

// ---------------------------------------------------------------------------
// Порядок блоков
// ---------------------------------------------------------------------------

/** Блок пустой — на странице его не будет, даже если он «показан». */
const EMPTY = {
  links: (p) => !(p.links || []).length,
  player: (p) => !(p.music && p.music.url),
  gallery: (p) => !(p.gallery || []).length,
  invite: (p) => !(p.invite && p.invite.code),
  interests: (p) => !(p.tags || []).length && !(p.showStatus && ((state.account || {}).hobbies || []).length),
  quote: (p) => !(p.quote && p.quote.text),
  countdown: (p) => !(p.countdown && p.countdown.at),
  pair: (p) => !(p.pair && p.pair.partner && p.pair.visible),
  friends: (p) => !(p.closeFriends || []).length
};

export function renderOrder() {
  const body = $('order-body');
  const names = new Map((caps().blocks || []).map((block) => [block.id, block.name]));
  let order = styleNow().blockOrder.filter((id) => names.has(id));
  for (const id of names.keys()) if (!order.includes(id)) order.push(id);

  const commit = () => patchStyle({ blockOrder: [...order] }, { now: true });

  function move(index, shift) {
    const to = index + shift;
    if (to < 0 || to >= order.length) return;
    [order[index], order[to]] = [order[to], order[index]];
    commit();
    paint();
    // Фокус едет вместе со строкой — иначе поднять блок на три позиции с
    // клавиатуры нельзя (так же сделано у ссылок).
    const row = body.querySelectorAll('.order-row')[to];
    const buttons = row ? row.querySelectorAll('.order-move') : [];
    const target = buttons[shift < 0 ? 0 : 1];
    if (target && !target.disabled) target.focus();
    else if (buttons[shift < 0 ? 1 : 0]) buttons[shift < 0 ? 1 : 0].focus();
  }

  /**
   * Перетаскивание на указателях, а не на HTML5 drag-and-drop: тот не работает
   * пальцем на телефоне, а редактор открывают и оттуда.
   */
  function startDrag(event, row) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const list = row.parentElement;
    const pointer = event.pointerId;
    row.classList.add('is-dragging');

    // Слушаем окно, а не строку: строку мы двигаем по DOM, и захват указателя
    // (setPointerCapture) браузер на таком переносе снимает — дальше движения
    // уходили бы мимо и строка «прилипала» на первом шаге.
    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointer) return;
      moveEvent.preventDefault();
      const others = [...list.children].filter((node) => node !== row);
      const after = others.find((node) => {
        const box = node.getBoundingClientRect();
        return moveEvent.clientY < box.top + box.height / 2;
      });
      if (after) {
        if (row.nextElementSibling !== after) list.insertBefore(row, after);
      } else if (list.lastElementChild !== row) {
        list.appendChild(row);
      }
    };
    const onUp = (upEvent) => {
      if (upEvent.pointerId !== pointer) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      row.classList.remove('is-dragging');
      const next = [...list.children].map((node) => node.dataset.id);
      if (next.join() !== order.join()) {
        order = next;
        commit();
      }
      paint();
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function paint() {
    const style = styleNow();
    const hidden = new Set(style.hiddenBlocks);
    const page = state.page;

    const rows = order.map((id, index) => {
      const isHidden = hidden.has(id);
      const empty = EMPTY[id] ? EMPTY[id](page) : false;
      const row = el('li', { class: `order-row${isHidden ? ' is-hidden' : ''}`, dataset: { id } });
      const handle = el('span', {
        class: 'order-handle', title: 'Перетащите', 'aria-hidden': true,
        onPointerdown: (event) => startDrag(event, row)
      }, [el('i'), el('i'), el('i')]);

      row.append(
        handle,
        el('span', { class: 'order-name', text: names.get(id) || id }),
        empty ? el('span', { class: 'order-note', text: 'пусто' }) : el('span', { class: 'order-note' }),
        el('button', {
          class: `btn btn--ghost btn--sm order-eye${isHidden ? '' : ' is-on'}`,
          type: 'button',
          'aria-pressed': isHidden ? 'false' : 'true',
          title: isHidden ? 'Показать на странице' : 'Скрыть со страницы',
          text: isHidden ? 'Скрыт' : 'Виден',
          onClick: () => {
            const next = new Set(styleNow().hiddenBlocks);
            if (next.has(id)) next.delete(id); else next.add(id);
            patchStyle({ hiddenBlocks: [...next] }, { now: true });
            paint();
          }
        }),
        el('button', {
          class: 'btn btn--ghost btn--icon order-move', type: 'button', text: '↑',
          title: 'Выше', disabled: index === 0, onClick: () => move(index, -1)
        }),
        el('button', {
          class: 'btn btn--ghost btn--icon order-move', type: 'button', text: '↓',
          title: 'Ниже', disabled: index === order.length - 1, onClick: () => move(index, 1)
        })
      );
      return row;
    });

    fill(body, [
      el('p', { class: 'hint', text: 'Перетащите строку за точки слева или двигайте стрелками. Шапка с именем и кнопкой «Написать в Love» всегда сверху.' }),
      el('ol', { class: 'order-list' }, rows),
      el('p', { class: 'hint', text: '«Пусто» — блок ещё не заполнен, на странице его не будет.' }),
      fieldError('style.blockOrder') || fieldError('style')
        ? el('p', { class: 'field-error', role: 'alert', text: fieldError('style.blockOrder') || fieldError('style') })
        : null
    ]);
  }

  paint();
}

// ---------------------------------------------------------------------------
// Свои наборы и чужой стиль
// ---------------------------------------------------------------------------

/** Текущее оформление страницы — то, что переносится набором. */
function snapshotNow() {
  const page = state.page;
  const style = styleNow();
  delete style.allowCopy;
  delete style.blockOrder;
  delete style.hiddenBlocks;
  return {
    theme: page.theme,
    layout: page.layout,
    font: page.font,
    accent: page.accent || null,
    accentTo: page.accentTo || null,
    avatarFrame: page.avatarFrame,
    effect: page.effect,
    effects: (page.effects || []).slice(),
    effectColors: (page.effectColors || []).slice(),
    customTheme: customNow(),
    bgPattern: { ...(page.bgPattern || { kind: 'none', opacity: 35 }) },
    liveBg: page.liveBg || 'none',
    themeMode: page.themeMode || 'fixed',
    altTheme: page.altTheme || null,
    style,
    bgGradient: { ...(page.bgGradient || { enabled: false, colors: [], angle: 160 }) }
  };
}

let undoSnapshot = null;
let undoFrom = '';

function applySnapshot(data) {
  const patch = {};
  for (const key of ['theme', 'layout', 'font', 'avatarFrame', 'accent', 'accentTo', 'effects', 'effectColors', 'customTheme', 'bgPattern', 'liveBg', 'themeMode', 'altTheme']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) patch[key] = data[key];
  }
  // Старые наборы знают только один эффект.
  if (!patch.effects && data.effect) patch.effects = data.effect === 'none' ? [] : [data.effect];
  if (data.style) patch.style = { ...styleNow(), ...data.style };
  if (data.bgGradient) patch.bgGradient = data.bgGradient;
  update(patch, { now: true });
  // Тема, фон и детали поменялись все сразу — перерисовываем их карточки, в
  // полях этих карточек никто не печатает.
  renderLook();
  renderBackground();
  renderStyle();
  renderThemeBuilder();
}

export function renderPresets() {
  const rule = feature('stylePresets');
  const max = contentLimits().stylePresets || 6;
  const presets = (state.page.stylePresets || []).slice();
  let name = '';
  let nick = '';

  const save = () => {
    if (presets.length >= max) return;
    const entry = {
      name: name.trim() || `Стиль ${presets.length + 1}`,
      data: snapshotNow(),
      createdAt: new Date().toISOString()
    };
    update({ stylePresets: [...presets, entry] }, { now: true });
    toast(`Набор «${entry.name}» сохранён`);
    renderPresets();
  };

  const remove = (index) => {
    const next = presets.filter((_, i) => i !== index);
    update({ stylePresets: next }, { now: true });
    renderPresets();
  };

  const copy = async (button) => {
    const username = nick.trim().replace(/^@/, '');
    if (!username) return;
    button.disabled = true;
    try {
      const result = await api.styleOf(username);
      undoSnapshot = snapshotNow();
      undoFrom = result.username || username;
      applySnapshot(result.snapshot || {});
      toast(`Оформление @${undoFrom} применено`);
    } catch (error) {
      toast(error.message || 'Не получилось взять стиль', 'err');
    } finally {
      button.disabled = false;
      renderPresets();
    }
  };

  const presetRow = (preset, index) => el('div', { class: 'preset-row' }, [
    el('span', { class: 'preset-dot', style: `background:${(preset.data && preset.data.accent) || '#e7e7e7'}`, 'aria-hidden': true }),
    el('span', { class: 'preset-name', text: preset.name || `Стиль ${index + 1}` }),
    el('button', {
      class: 'btn btn--sm', type: 'button', text: 'Применить',
      disabled: !rule.allowed,
      onClick: () => { applySnapshot(preset.data || {}); toast(`Набор «${preset.name}» применён`); }
    }),
    el('button', {
      class: 'btn btn--ghost btn--icon', type: 'button', text: '✕', title: 'Удалить набор',
      onClick: () => remove(index)
    })
  ]);

  const copyButton = el('button', {
    class: 'btn btn--sm', type: 'button', text: 'Взять стиль',
    disabled: !rule.allowed,
    onClick: (event) => copy(event.currentTarget)
  });

  fill($('presets-body'), [
    el('p', { class: 'hint', text: 'Набор запоминает тему, цвета, шрифт, рамку, эффект, фон-градиент и детали. Тексты, ссылки и картинки не трогает.' }),

    textField({
      label: 'Название набора',
      max: contentLimits().presetName || 30,
      placeholder: 'например, Ночной',
      locked: !rule.allowed,
      requires: rule.requires,
      onInput: (value) => { name = value; }
    }),
    el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn btn--sm', type: 'button', text: 'Сохранить текущий стиль',
        disabled: !rule.allowed || presets.length >= max,
        onClick: save
      }),
      presets.length >= max ? el('span', { class: 'hint', text: `Больше ${max} наборов не сохранить — удалите ненужный.` }) : null
    ]),
    presets.length ? el('div', { class: 'preset-list' }, presets.map(presetRow)) : null,
    fieldError('stylePresets') ? el('p', { class: 'field-error', role: 'alert', text: fieldError('stylePresets') }) : null,

    groupTitle('Стиль другой страницы'),
    el('div', { class: 'invite-row' }, [
      el('input', {
        class: 'input', type: 'text', placeholder: '@ник', maxlength: 33,
        autocomplete: 'off', spellcheck: false, disabled: !rule.allowed,
        onInput: (event) => { nick = event.target.value; },
        onKeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); copy(copyButton); } }
      }),
      copyButton
    ]),
    el('p', { class: 'hint', text: 'Только с опубликованных страниц, владельцы которых не запретили это ниже у себя.' }),
    undoSnapshot
      ? el('div', { class: 'row-actions' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Вернуть как было',
          onClick: () => {
            applySnapshot(undoSnapshot);
            undoSnapshot = null;
            toast('Прежнее оформление вернулось');
            renderPresets();
          }
        }),
        el('span', { class: 'hint', text: `до стиля @${undoFrom}` })
      ])
      : null,

    toggle({
      label: 'Разрешить брать моё оформление',
      hint: 'Другие смогут повторить вашу тему и детали. Тексты и картинки не копируются.',
      checked: styleNow().allowCopy !== false,
      onToggle: (on) => patchStyle({ allowCopy: on }, { now: true })
    })
  ]);
}

// ---------------------------------------------------------------------------
// Конструктор темы (Premium)
// ---------------------------------------------------------------------------

const THEME_FIELDS = [
  ['bg', 'Фон', 'Основной цвет страницы.'],
  ['bg2', 'Второй фон', 'Свечение сверху и подложки карточек.'],
  ['text', 'Текст', 'Имя, ссылки, заголовки.'],
  ['muted', 'Приглушённый текст', 'Подписи, описание, счётчики.'],
  ['accent', 'Акцент темы', 'Кнопки и рамки, пока не задан свой акцент.']
];

function customNow() {
  const raw = (state.page && state.page.customTheme) || {};
  const out = { enabled: Boolean(raw.enabled) };
  for (const [key] of THEME_FIELDS) out[key] = raw[key] || null;
  return out;
}

const patchCustom = (extra, opts) => update({ customTheme: { ...customNow(), ...extra } }, opts);

/** Цвета текущей готовой темы — стартовая точка конструктора. */
function fromTheme() {
  const t = themeTokens();
  const out = {};
  for (const [key] of THEME_FIELDS) out[key] = rgbOf(t[key]) ? t[key] : null;
  return out;
}

function grade(value) {
  if (value >= 7) return 'отлично';
  if (value >= 4.5) return 'хорошо';
  if (value >= 3) return 'для крупного текста';
  return 'плохо';
}

export function renderThemeBuilder() {
  const rule = feature('customTheme');
  const custom = customNow();
  const report = el('div', { class: 'theme-report' });

  // Отчёт о читаемости пересчитывается на каждое движение по палитре, а сами
  // поля не трогаются — иначе палитра закрывалась бы на полпути.
  function paintReport() {
    const now = customNow();
    const base = { ...fromTheme(), ...Object.fromEntries(Object.entries(now).filter(([, v]) => v)) };
    const bg = base.bg || '#0b0b0f';
    const bg2 = base.bg2 || bg;
    const text = readable(base.text || '#f2f2f2', [bg, bg2], 4.5);
    const muted = readable(base.muted || text.color, [bg, bg2], 3);
    const textRatio = ratio(rgbOf(text.color), rgbOf(bg));
    fill(report, [
      el('div', { class: 'theme-sample', style: `background:linear-gradient(160deg,${bg2},${bg});color:${text.color}` }, [
        el('strong', { text: 'Имя на странице' }),
        el('span', { style: `color:${muted.color}`, text: 'подпись и описание' }),
        el('i', { style: `background:${base.accent || text.color}` })
      ]),
      el('p', { class: 'hint', text: `Читаемость текста на странице: ${textRatio.toFixed(1)} — ${grade(textRatio)}.` }),
      text.adjusted || muted.adjusted
        ? el('p', {
          class: 'hint hint--warn',
          text: `Чтобы текст было видно, на странице он станет ${text.adjusted ? text.color : ''}${text.adjusted && muted.adjusted ? ', а подписи — ' : ''}${muted.adjusted ? muted.color : ''}.`
        })
        : null
    ]);
  }

  const rows = custom.enabled
    ? THEME_FIELDS.map(([key, label, hint]) => {
      const start = custom[key] || fromTheme()[key] || '#888888';
      return el('div', { class: 'theme-row' }, [
        el('div', { class: 'theme-row-text' }, [
          el('span', { class: 'field-label', text: label }),
          el('span', { class: 'hint', text: hint })
        ]),
        colorInput({
          value: start, fallback: start, disabled: !rule.allowed, title: label,
          onPick: (hex) => { patchCustom({ [key]: hex }); paintReport(); }
        })
      ]);
    })
    : [];

  fill($('theme-body'), [
    el('p', { class: 'hint', text: 'Пять своих цветов вместо готовой темы. Если текст будет плохо читаться, страница подстроит его сама.' }),
    toggle({
      label: 'Своя тема',
      hint: custom.enabled ? 'Готовая тема в «Оформлении» сейчас не видна.' : 'Начнём с цветов текущей темы.',
      checked: custom.enabled,
      locked: !rule.allowed,
      requires: rule.requires,
      error: fieldError('customTheme'),
      onToggle: (on) => {
        const startFrom = custom.bg ? customNow() : { ...customNow(), ...fromTheme() };
        patchCustom({ ...startFrom, enabled: on }, { now: true });
        renderThemeBuilder();
        renderLook();
      }
    }),
    custom.enabled ? el('div', { class: 'theme-rows' }, rows) : null,
    custom.enabled ? report : null,
    custom.enabled
      ? el('div', { class: 'row-actions' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Взять цвета текущей темы',
          disabled: !rule.allowed,
          onClick: () => { patchCustom({ ...fromTheme(), enabled: true }, { now: true }); renderThemeBuilder(); }
        })
      ])
      : null,
    !rule.allowed && custom.enabled
      ? el('p', { class: 'lock lock--soft', text: 'Подписка закончилась: на странице сейчас готовая тема. Ваши цвета сохранены.' })
      : null
  ]);
  if (custom.enabled) paintReport();
}

// ---------------------------------------------------------------------------
// Готовые шаблоны
// ---------------------------------------------------------------------------

let templateUndo = null;
let templateName = '';

function templateArt(template) {
  const p = template.preview || {};
  const name = p.name || ['#f2f2f2'];
  const nameStyle = name.length > 1
    ? `background:linear-gradient(90deg,${name.join(',')});-webkit-background-clip:text;background-clip:text;color:transparent`
    : `color:${name[0]}`;
  const dots = (p.dots || []).flatMap((color, i) => [0, 1, 2].map((n) => el('i', {
    class: 'tpl-dot', style: `background:${color};left:${12 + ((i * 37 + n * 29) % 76)}%;top:${10 + ((i * 23 + n * 31) % 70)}%`
  })));
  return el('span', {
    class: `tpl-art${p.light ? ' is-light' : ''}${p.metal ? ' is-metal' : ''}${p.scan ? ' is-scan' : ''}`,
    style: `background:linear-gradient(160deg,${p.bg2 || '#1a1a1a'},${p.bg || '#090909'})`,
    'aria-hidden': true
  }, [
    ...dots,
    el('i', { class: 'tpl-av', style: `border-color:${p.accent || '#e7e7e7'}` }),
    el('b', { class: 'tpl-name', style: `font-family:${p.font || 'serif'};${nameStyle}`, text: 'Мира' }),
    el('i', { class: 'tpl-link', style: `border-color:${p.accent || '#e7e7e7'}55` }),
    el('i', { class: 'tpl-link', style: `border-color:${p.accent || '#e7e7e7'}55` })
  ]);
}

export function renderTemplates() {
  const list = caps().templates || [];
  const apply = (template) => {
    if (!template.allowed) {
      toast(`Шаблон «${template.name}» — в ${template.tier === 'premium' ? 'Love Premium' : 'Love Pro'}`, 'err');
      return;
    }
    templateUndo = snapshotNow();
    templateName = template.name;
    // Своя тема перекрыла бы тему шаблона — на время шаблона её выключаем.
    applySnapshot({ ...template.data, customTheme: { ...customNow(), enabled: false } });
    toast(`Шаблон «${template.name}» в черновике — гости увидят после «Опубликовать изменения»`);
    renderTemplates();
  };

  fill($('templates-body'), [
    el('p', { class: 'hint', text: 'Готовое оформление в один клик: тема, шрифт, цвета, эффекты и детали. Тексты, ссылки и картинки остаются ваши.' }),
    el('div', { class: 'tpl-grid' }, list.map((template) => el('button', {
      class: `tpl${template.allowed ? '' : ' is-locked'}`,
      type: 'button',
      title: template.description,
      onClick: () => apply(template)
    }, [
      templateArt(template),
      el('span', { class: 'tpl-title' }, [
        el('span', { text: template.name }),
        template.tier !== 'free' ? el('span', { class: 'tpl-tier', text: template.tier === 'premium' ? 'Premium' : 'Pro' }) : null
      ]),
      el('span', { class: 'tpl-desc', text: template.description })
    ]))),
    templateUndo
      ? el('div', { class: 'row-actions' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Вернуть как было',
          onClick: () => {
            applySnapshot(templateUndo);
            templateUndo = null;
            toast('Прежнее оформление вернулось');
            renderTemplates();
          }
        }),
        el('span', { class: 'hint', text: `до шаблона «${templateName}»` })
      ])
      : null
  ]);
}
