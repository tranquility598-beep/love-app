/**
 * Секции редактора.
 *
 * Каждая render*() полностью пересобирает содержимое своей карточки из state.
 * Поэтому её нельзя вызывать во время набора текста — только по событию
 * 'server' (данные пришли с сервера) или из соседней секции, которая точно
 * знает, что фокуса в полях нет.
 *
 * Замки берутся из capabilities.features[...]: сервер — единственный, кто
 * решает, что доступно, а редактор только показывает его решение.
 */

import { $, fill, el, lockNote, iconNode, toast } from './ui.js';
import { state, update, fieldError, feature, onChange } from './store.js';
import { api } from './api.js';
import { setPreviewAlt } from './preview.js';
import { avatarFields, avatarSummary, styleChanged, resetStyle, AVATAR_STYLE_KEYS } from './design.js';
import {
  textField, textArea, toggle, choicePicker, colorInput, shiftHue,
  slider, mediaField, dateField, groupTitle, fold, nameOf, ACCEPT
} from './fields.js';
import { openLayoutEditor } from './layout-editor.js';

const limits = () => (state.caps && state.caps.limits) || {};

/**
 * Гиф на аватар и в баннер — платная возможность (см. animatedAvatar в
 * config/profileTiers). Отказ выдаём до отправки: гиф обычно тяжёлый, и гнать
 * его по мобильной сети, чтобы потом отклонить, — издевательство.
 *
 * Проверяем так же, как сервер, — по расширению. Анимацию внутри webp никто из
 * нас не ищет, и это осознанно: правило существует, чтобы гиф был платным.
 */
function gifGuard(name, where) {
  return (file) => {
    const gif = file.type === 'image/gif' || /\.gif$/i.test(file.name || '');
    if (!gif) return null;
    const rule = feature(name);
    if (rule.allowed) return null;
    return `Гифку ${where} можно в ${rule.requires === 'premium' ? 'Love Premium' : 'Love Pro'}. Выберите обычную картинку.`;
  };
}

// ---------------------------------------------------------------------------
// О себе
// ---------------------------------------------------------------------------

export function renderBasics() {
  const page = state.page;
  const account = state.account || {};
  const bioMax = limits().bioMaxLength || 140;
  const bio = page.bio || '';
  // Текст, написанный на прежнем тарифе, мы не стираем — но на странице
  // показывается только его начало, и об этом надо сказать прямо, иначе человек
  // будет думать, что описание пропало.
  const bioOver = [...bio].length > bioMax;

  fill($('basics-body'), [
    mediaField({
      label: 'Аватар',
      shape: 'circle',
      url: page.avatar,
      accept: ACCEPT.image,
      maxBytes: limits().assetBytes,
      // Пустой кружок здесь не значит «на странице пусто»: аватар подставится
      // из аккаунта, и врать об этом нельзя.
      empty: 'из Love',
      hint: 'По умолчанию используется аватар из Love.',
      guard: gifGuard('animatedAvatar', 'на аватар'),
      upload: (file) => api.upload('avatar', file),
      onDone: (result) => update({ avatar: result.url }, { now: true }),
      onClear: () => update({ avatar: null }, { now: true })
    }),

    mediaField({
      label: 'Баннер',
      shape: 'wide',
      url: page.banner,
      accept: ACCEPT.image,
      maxBytes: limits().assetBytes,
      hint: 'Изображение в верхней части профиля.',
      guard: gifGuard('animatedBanner', 'в баннер'),
      upload: (file) => api.upload('banner', file),
      onDone: (result) => update({ banner: result.url }, { now: true }),
      onClear: () => update({ banner: null }, { now: true })
    }),

    textField({
      label: 'Имя на странице',
      value: page.displayName || '',
      max: 40,
      placeholder: account.nickname || account.username || '',
      error: fieldError('displayName'),
      hint: 'Оставьте пустым, чтобы использовать имя из Love.',
      onInput: (value) => update({ displayName: value })
    }),

    textField({
      label: 'Подпись',
      value: page.headline || '',
      max: 80,
      placeholder: 'одна строка под именем',
      error: fieldError('headline'),
      onInput: (value) => update({ headline: value })
    }),

    textArea({
      label: 'О себе',
      value: bio,
      max: bioMax,
      enforce: !bioOver,
      placeholder: 'пара фраз о себе',
      error: fieldError('bio'),
      hint: bioOver
        ? `На странице видны первые ${bioMax} символов. Чтобы сохранить правку, сократите текст до ${bioMax}.`
        : bioMax < 1200
          ? `На вашем тарифе до ${bioMax} символов. В Love Pro — 600, в Premium — 1200.`
          : null,
      onInput: (value) => update({ bio: value })
    })
  ]);
}

// ---------------------------------------------------------------------------
// Оформление
// ---------------------------------------------------------------------------

const catalog = (name) => (state.caps && state.caps[name]) || [];

/** Акцент выбранной темы — он же значение по умолчанию для своего цвета. */
function themeAccent() {
  const theme = catalog('themes').find((item) => item.id === state.page.theme);
  return (theme && theme.tokens && theme.tokens.accent) || '#7c5cff';
}

function effectPreview(item) {
  const id = item.id === 'none' ? 'none' : item.id;
  return el('span', { class: `effect-art effect-art--${id}`, 'aria-hidden': true }, [
    el('i', { class: 'effect-art-dot effect-art-dot--one' }),
    el('i', { class: 'effect-art-dot effect-art-dot--two' }),
    el('i', { class: 'effect-art-dot effect-art-dot--three' })
  ]);
}

function layoutPreview(item) {
  return el('span', { class: `layout-art layout-art--${item.id}`, 'aria-hidden': true }, [
    el('i', { class: 'layout-art-cover' }),
    el('i', { class: 'layout-art-avatar' }),
    el('i', { class: 'layout-art-title' }),
    el('i', { class: 'layout-art-link' }),
    el('i', { class: 'layout-art-link layout-art-link--two' })
  ]);
}

/**
 * Своя расстановка поверх выбранной раскладки: кнопка открывает полноэкранный
 * редактор (layout-editor.js). Только на компьютере — на телефоне тянуть
 * рамки пальцем по уменьшенной странице неудобно и неточно.
 */
function customLayoutField() {
  const rule = feature('customLayout');
  const on = Boolean(state.page.customLayout && state.page.customLayout.on);
  return el('div', { class: 'field custom-layout' }, [
    el('div', { class: 'field-top' }, [el('span', { class: 'field-label' }, ['Своя расстановка ', el('span', { class: 'beta', text: 'Бета' })])]),
    el('p', { class: 'hint', text: on
      ? 'Включена: блоки стоят там, где вы их поставили. Раскладка выше задаёт их вид.'
      : 'Двигайте и растягивайте блоки страницы как хотите — во весь экран, поверх выбранной раскладки.' }),
    rule.allowed
      ? el('div', { class: 'custom-layout-actions' }, [
        el('button', {
          class: 'btn btn--sm custom-layout-open', type: 'button',
          text: on ? 'Изменить расстановку' : 'Настроить расстановку',
          onClick: () => openLayoutEditor(() => renderLook())
        }),
        on ? el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Вернуть как в раскладке',
          onClick: () => {
            if (!window.confirm('Убрать свою расстановку? Страница снова встанет по раскладке.')) return;
            update({ customLayout: { on: false } }, { now: true });
            renderLook();
          }
        }) : null
      ])
      : lockNote(rule.requires),
    rule.allowed ? el('p', { class: 'hint custom-layout-narrow', text: 'Настраивается только с компьютера.' }) : null
  ]);
}

function framePreview(item) {
  return el('span', { class: `frame-art frame-art--${item.id}`, 'aria-hidden': true }, [
    el('i', { class: 'frame-art-face', text: 'L' })
  ]);
}

/**
 * Свой цвет и градиент.
 *
 * Кнопки здесь меняют не значение, а состав полей (появляется второй кружок,
 * появляется «сбросить»), поэтому блок умеет перерисовывать себя целиком.
 * Текстовых полей внутри нет, так что терять фокус нечему.
 */
function accentField() {
  const node = el('div', { class: 'field' });

  const paint = () => {
    const page = state.page;
    const allowed = feature('customAccent').allowed;
    const gradientRule = feature('accentGradient');
    const base = themeAccent();
    const custom = Boolean(page.accent || page.accentTo);
    const gradient = Boolean(page.accentTo);

    const row = [
      colorInput({
        value: page.accent,
        fallback: base,
        disabled: !allowed,
        title: 'Основной цвет',
        onPick: (hex) => update({ accent: hex })
      })
    ];

    if (gradient) {
      row.push(el('span', { class: 'color-arrow', text: '→', 'aria-hidden': true }));
      row.push(colorInput({
        value: page.accentTo,
        fallback: base,
        disabled: !gradientRule.allowed,
        title: 'Второй цвет градиента',
        onPick: (hex) => update({ accentTo: hex })
      }));
      row.push(el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', text: 'Убрать градиент',
        // Убрать своё значение сервер разрешает на любом тарифе — поэтому
        // кнопка живая даже когда подписка кончилась.
        onClick: () => { update({ accentTo: null }, { now: true }); paint(); }
      }));
    } else if (allowed && gradientRule.allowed) {
      row.push(el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', text: 'Градиент',
        onClick: () => {
          const from = page.accent || base;
          update({ accent: from, accentTo: shiftHue(from) }, { now: true });
          paint();
        }
      }));
    }

    fill(node, [
      el('div', { class: 'field-top' }, [
        el('span', { class: 'field-label', text: 'Цвет акцента' }),
        custom
          ? el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button', text: 'Цвет темы',
            onClick: () => { update({ accent: null, accentTo: null }, { now: true }); paint(); }
          })
          : null
      ]),
      el('div', { class: 'color-row' }, row),
      !allowed && custom
        ? el('p', {
          class: 'lock lock--soft',
          text: 'Подписка закончилась: на странице сейчас цвет темы. Ваш цвет сохранён.'
        })
        : null,
      !allowed && !custom ? lockNote(feature('customAccent').requires) : null,
      allowed && !gradientRule.allowed && !gradient
        ? el('p', { class: 'hint', text: `Градиент из двух цветов — в ${gradientRule.requires === 'premium' ? 'Love Premium' : 'Love Pro'}.` })
        : null,
      !gradientRule.allowed && gradient
        ? el('p', { class: 'lock lock--soft', text: 'Подписка закончилась: на странице сейчас один цвет. Градиент сохранён.' })
        : null,
      fieldError('accent') || fieldError('accentTo')
        ? el('p', { class: 'field-error', role: 'alert', text: fieldError('accent') || fieldError('accentTo') })
        : null
    ]);
  };

  paint();
  return { node, repaint: paint };
}

function effectsNow() {
  const page = state.page;
  if (Array.isArray(page.effects) && page.effects.length) return page.effects.slice();
  return page.effect && page.effect !== 'none' ? [page.effect] : [];
}

/**
 * Эффекты — несколько сразу, поэтому не choicePicker (он про один вариант), а
 * плитки-переключатели. Порядок включения виден цифрой: при переполнении
 * выключается самый ранний, и человеку должно быть понятно, какой именно.
 */
function effectsField() {
  const node = el('div', { class: 'field' });

  const paint = () => {
    const max = limits().effectsAtOnce || 1;
    const on = effectsNow();
    const items = catalog('effects').filter((item) => item.id !== 'none');
    const colorsRule = feature('effectColors');
    const colors = (state.page.effectColors || []).slice(0, 2);
    const base = state.page.accent || themeAccent();

    const set = (next) => {
      update({ effects: next }, { now: true });
      paint();
    };

    const tiles = items.map((item) => {
      const locked = item.allowed === false;
      const active = on.includes(item.id);
      return el('button', {
        class: `pick${active ? ' is-on' : ''}${locked ? ' is-locked' : ''}`,
        type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        onClick: () => {
          if (active) { set(on.filter((id) => id !== item.id)); return; }
          if (locked) {
            toast(`«${item.name}» — в ${item.tier === 'premium' ? 'Love Premium' : 'Love Pro'}`, 'err');
            return;
          }
          let next = [...on, item.id];
          if (next.length > max) {
            const dropped = catalog('effects').find((entry) => entry.id === next[0]);
            next = next.slice(next.length - max);
            toast(`Сразу можно до ${max}: «${dropped ? dropped.name : next[0]}» выключен`);
          }
          set(next);
        }
      }, [
        effectPreview(item),
        el('span', { class: 'pick-name', text: item.name }),
        locked ? el('span', { class: 'pick-lock', text: '🔒', 'aria-hidden': true }) : null,
        active && max > 1 ? el('span', { class: 'pick-order', text: String(on.indexOf(item.id) + 1), 'aria-hidden': true }) : null
      ]);
    });

    const colorRow = colors.length
      ? el('div', { class: 'color-row' }, [
        colorInput({
          value: colors[0], fallback: base, disabled: !colorsRule.allowed, title: 'Первый цвет эффектов',
          onPick: (hex) => update({ effectColors: [hex, (state.page.effectColors || [])[1] || hex] })
        }),
        el('span', { class: 'color-arrow', text: '+', 'aria-hidden': true }),
        colorInput({
          value: colors[1] || colors[0], fallback: base, disabled: !colorsRule.allowed, title: 'Второй цвет эффектов',
          onPick: (hex) => update({ effectColors: [(state.page.effectColors || [])[0] || base, hex] })
        }),
        el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Цвета акцента',
          onClick: () => { update({ effectColors: [] }, { now: true }); paint(); }
        })
      ])
      : el('div', { class: 'row-actions' }, [
        el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Свои цвета эффектов',
          disabled: !colorsRule.allowed,
          onClick: () => { update({ effectColors: [base, shiftHue(base, 140)] }, { now: true }); paint(); }
        }),
        colorsRule.allowed ? el('span', { class: 'hint', text: 'Сейчас частицы и свечение — цветами акцента.' }) : null
      ]);

    fill(node, [
      el('div', { class: 'field-top' }, [
        el('span', { class: 'field-label', text: 'Эффекты' }),
        el('span', { class: 'counter', text: `${on.length}/${max}` })
      ]),
      el('div', { class: 'picks picks--wide' }, tiles),
      el('p', {
        class: 'hint',
        text: max > 1
          ? `Можно включить до ${max} сразу — например, ${feature('effects').allowed ? 'снег и плёнку' : 'пылинки и плёнку'}. Нажмите ещё раз, чтобы выключить.`
          : 'Нажмите ещё раз, чтобы выключить.'
      }),
      groupTitle('Цвета эффектов'),
      colorRow,
      colorsRule.allowed ? null : lockNote(colorsRule.requires),
      fieldError('effects') || fieldError('effectColors')
        ? el('p', { class: 'field-error', role: 'alert', text: fieldError('effects') || fieldError('effectColors') })
        : null
    ]);
  };

  paint();
  return node;
}

let fontBusy = false;
let registeredFont = '';

/**
 * Свой шрифт регистрируем в документе через FontFace: превью — теневое
 * дерево, а @font-face внутри него Chrome не применяет. Плитки выбора и
 * превью видят шрифт одинаково.
 */
function registerCustomFont(url) {
  if (!url || url === registeredFont || !window.FontFace || !document.fonts) return;
  registeredFont = url;
  new FontFace('LoveCustom', `url("${url}")`).load()
    .then((face) => { document.fonts.add(face); })
    .catch(() => { registeredFont = ''; });
}

function customFontField() {
  const rule = feature('customFont');
  const font = state.page.customFont || {};
  if (font.url) registerCustomFont(font.url);
  const input = el('input', {
    type: 'file', accept: '.woff2,.woff,.ttf,.otf', hidden: true,
    onChange: async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      fontBusy = true;
      renderLook();
      try {
        const result = await api.upload('font', file);
        const name = String(file.name || '').replace(/\.[^.]+$/, '').slice(0, 60);
        update({ customFont: { url: result.url, name }, font: 'custom' }, { now: true });
        registerCustomFont(result.url);
        toast(`Шрифт «${name}» подключён`);
      } catch (error) {
        toast(error.message || 'Не получилось загрузить шрифт', 'err');
      } finally {
        fontBusy = false;
        renderLook();
      }
    }
  });
  return el('div', { class: 'field' }, [
    el('div', { class: 'cursor-row' }, [
      el('span', { class: 'font-own', style: font.url ? 'font-family:"LoveCustom",sans-serif' : '', text: 'Aa' }),
      el('button', {
        class: 'btn btn--sm', type: 'button',
        text: fontBusy ? 'Загружаем…' : font.url ? 'Заменить свой шрифт' : 'Загрузить свой шрифт',
        disabled: fontBusy || !rule.allowed,
        onClick: () => input.click()
      }),
      font.url
        ? el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', text: 'Убрать',
          onClick: () => { update({ customFont: { url: null, name: '' }, font: state.page.font === 'custom' ? 'system' : state.page.font }, { now: true }); renderLook(); }
        })
        : null,
      input
    ]),
    el('p', { class: 'hint', text: font.url ? `Сейчас: ${font.name || 'свой шрифт'}. Убедитесь, что лицензия шрифта разрешает его использовать на сайте.` : 'Файл .woff2, .woff, .ttf или .otf до 3 МБ. Лучше .woff2 — он легче.' }),
    rule.allowed ? null : lockNote(rule.requires),
    fieldError('customFont') ? el('p', { class: 'field-error', role: 'alert', text: fieldError('customFont') }) : null
  ]);
}

let previewAlt = false;

/**
 * Вторая тема: страница сама переключается под светлую/тёмную систему гостя
 * или по времени суток. Превью показывает её по кнопке — у гостя это делает
 * браузер или часы.
 */
function secondTheme() {
  const page = state.page;
  const mode = page.themeMode || 'fixed';
  const custom = page.customTheme && page.customTheme.enabled;
  const nodes = [
    choicePicker({
      label: 'Вторая тема',
      hint: custom
        ? 'Со своей темой из конструктора вторая тема не работает.'
        : 'Например, светлая днём и тёмная ночью — или как привык гость.',
      items: catalog('themeModes'),
      value: mode,
      wide: true,
      error: fieldError('themeMode'),
      onPick: (id) => {
        const patch = { themeMode: id };
        // Без пары вторая тема не включится — подставим противоположную.
        if (id !== 'fixed' && !page.altTheme) patch.altTheme = page.theme === 'porcelain' ? 'midnight' : 'porcelain';
        update(patch, { now: true });
        renderLook();
      }
    })
  ];
  if (mode !== 'fixed') {
    nodes.push(choicePicker({
      label: mode === 'time' ? 'Ночью / днём — вторая тема' : 'Для гостей с другой системной темой',
      items: catalog('themes').filter((item) => item.id !== page.theme),
      value: page.altTheme,
      wide: true,
      error: fieldError('altTheme'),
      preview: (item) => el('span', {
        class: 'swatch',
        style: `background:linear-gradient(135deg,${item.tokens.bg},${item.tokens.bg2})`
      }, [el('span', { class: 'swatch-dot', style: `background:${item.tokens.accent}` })]),
      onPick: (id) => update({ altTheme: id }, { now: true })
    }));
    nodes.push(el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        text: previewAlt ? 'Показать основную тему' : 'Показать вторую тему в превью',
        onClick: () => { previewAlt = !previewAlt; setPreviewAlt(previewAlt); renderLook(); }
      }),
      el('span', {
        class: 'hint',
        text: mode === 'time' ? 'С 20:00 до 6:00 по часам гостя, ночью — ещё и звёзды.' : 'Браузер гостя сам выбирает светлую или тёмную.'
      })
    ]));
  }
  return nodes;
}

export function renderLook() {
  const page = state.page;
  const accent = accentField();

  const effectCount = effectsNow().length;
  fill($('look-body'), [
    fold({
      id: 'look-theme', title: 'Тема и цвет', open: true,
      summary: page.customTheme && page.customTheme.enabled ? 'Своя тема' : nameOf(catalog('themes'), page.theme),
      changed: page.theme !== 'midnight' || Boolean(page.accent) || Boolean(page.accentTo) || (page.themeMode || 'fixed') !== 'fixed',
      onReset: () => { update({ theme: 'midnight', accent: null, accentTo: null, themeMode: 'fixed', altTheme: null }, { now: true }); renderLook(); },
      children: [
    choicePicker({
      label: 'Тема',
      hint: page.customTheme && page.customTheme.enabled
        ? 'Сейчас включена своя тема — карточка «Конструктор темы» ниже. Готовая тема вернётся, когда её выключите.'
        : null,
      items: catalog('themes'),
      value: page.theme,
      wide: true,
      error: fieldError('theme'),
      preview: (item) => el('span', {
        class: 'swatch',
        style: `background:linear-gradient(135deg,${item.tokens.bg},${item.tokens.bg2})`
      }, [
        el('span', { class: 'swatch-dot', style: `background:${item.tokens.accent}` })
      ]),
      onPick: (id) => {
        update({ theme: id }, { now: true });
        // Сменилась тема — сменился и цвет по умолчанию под кружком акцента,
        // и подпись свёрнутой группы.
        renderLook();
      }
    }),

    accent.node,
    el('div', { class: 'adv-only fold-stack' }, secondTheme())
      ]
    }),

    fold({
      id: 'look-layout', title: 'Раскладка',
      summary: nameOf(catalog('layouts'), page.layout) + (page.customLayout && page.customLayout.on ? ' · своя расстановка' : ''),
      changed: (page.layout || 'stack') !== 'stack' || Boolean(page.customLayout && page.customLayout.on),
      onReset: () => { update({ layout: 'stack' }, { now: true }); renderLook(); },
      children: [
    choicePicker({
      label: 'Раскладка',
      hint: 'Выберите композицию страницы и сравните в превью.',
      items: catalog('layouts'),
      wide: true,
      preview: layoutPreview,
      value: page.layout,
      error: fieldError('layout'),
      onPick: (id) => { update({ layout: id }, { now: true }); renderLook(); }
    }),
    customLayoutField()
      ]
    }),

    fold({
      id: 'look-font', title: 'Шрифт', target: '.pf-name',
      summary: page.font === 'custom' ? 'Свой шрифт' : nameOf(catalog('fonts'), page.font),
      changed: (page.font || 'system') !== 'system',
      onReset: () => { update({ font: 'system' }, { now: true }); renderLook(); },
      children: [
    choicePicker({
      label: 'Шрифт',
      hint: 'Шрифт имени и экрана входа. Мелкий текст остаётся удобным для чтения.',
      items: catalog('fonts'),
      value: page.font,
      error: fieldError('font'),
      wide: true,
      preview: (item) => el('span', { class: 'font-sample', style: `font-family:${item.stack}`, text: 'Aa Бб' }),
      onPick: (id) => {
        if (id === 'custom' && !(page.customFont && page.customFont.url)) {
          toast('Сначала загрузите свой шрифт ниже');
          renderLook();
          return;
        }
        update({ font: id }, { now: true });
        renderLook();
      }
    }),
    customFontField()
      ]
    }),

    fold({
      id: 'look-frame', title: 'Аватар', target: '.pf-avatar',
      summary: [nameOf(catalog('avatarFrames'), page.avatarFrame), avatarSummary()].filter(Boolean).join(' · '),
      changed: (page.avatarFrame || 'none') !== 'none' || styleChanged(AVATAR_STYLE_KEYS),
      onReset: () => { update({ avatarFrame: 'none' }, { now: true }); resetStyle(AVATAR_STYLE_KEYS); renderLook(); },
      children: [
    choicePicker({
      label: 'Рамка аватара',
      hint: 'От тонкого контура до мягкого свечения. Анимация видна в превью.',
      items: catalog('avatarFrames'),
      wide: true,
      preview: framePreview,
      value: page.avatarFrame,
      error: fieldError('avatarFrame'),
      onPick: (id) => { update({ avatarFrame: id }, { now: true }); renderLook(); }
    }),
    ...avatarFields()
      ]
    }),

    fold({
      id: 'look-effects', title: 'Эффекты', summary: effectCount ? `Включено: ${effectCount}` : 'Без эффектов',
      changed: effectCount > 0 || (page.effectColors || []).length > 0,
      onReset: () => { update({ effects: [], effectColors: [] }, { now: true }); renderLook(); },
      children: [effectsField()]
    })
  ]);
}

// ---------------------------------------------------------------------------
// Фон
// ---------------------------------------------------------------------------

/**
 * Вложенные объекты сервер разбирает целиком: присланный без url объект
 * background он поймёт как «поставить фон из ниоткуда», а не как «поменять
 * только размытие». Поэтому каждая правка собирается из свежего состояния —
 * не из снимка, сделанного при отрисовке: update() заменяет объект в state
 * новым, и старая ссылка почти сразу устаревает.
 */
function bgNow() {
  const bg = state.page.background || {};
  return {
    kind: bg.kind || 'none',
    url: bg.url || null,
    blur: bg.blur ?? 0,
    dim: bg.dim ?? 40
  };
}

const patchBg = (extra, options) => update({ background: { ...bgNow(), ...extra } }, options);

function gradientNow() {
  const g = state.page.bgGradient || {};
  return {
    enabled: Boolean(g.enabled),
    colors: (g.colors || []).slice(0, 3),
    angle: g.angle ?? 160
  };
}

const patchGradient = (extra, options) => update({ bgGradient: { ...gradientNow(), ...extra } }, options);

/**
 * Свой градиент фона. Цвета по умолчанию берём из темы, чтобы первое
 * включение не превращало страницу в кислотный плакат.
 */
function gradientField(repaint) {
  const g = gradientNow();
  const theme = catalog('themes').find((item) => item.id === state.page.theme);
  const tokens = (theme && theme.tokens) || {};
  const colors = g.colors.length >= 2 ? g.colors : [tokens.bg2 || '#141414', tokens.bg || '#090909'];
  const hasImage = bgNow().kind !== 'none' && Boolean(bgNow().url);

  const setColor = (index, hex) => {
    const next = gradientNow().colors.length >= 2 ? gradientNow().colors.slice() : colors.slice();
    next[index] = hex;
    patchGradient({ colors: next });
  };

  const row = colors.map((color, index) => colorInput({
    value: color,
    fallback: color,
    disabled: !g.enabled,
    title: `Цвет ${index + 1}`,
    onPick: (hex) => setColor(index, hex)
  }));

  return [
    toggle({
      label: 'Свой градиент фона',
      hint: hasImage ? 'Сейчас под картинкой — виден, пока фон-картинка не стоит.' : 'Вместо фона темы: два или три цвета и угол.',
      checked: g.enabled,
      error: fieldError('bgGradient'),
      onToggle: (on) => {
        patchGradient({ enabled: on, colors: gradientNow().colors.length >= 2 ? gradientNow().colors : colors }, { now: true });
        repaint();
      }
    }),
    g.enabled
      ? el('div', { class: 'field' }, [
        el('div', { class: 'field-top' }, [
          el('span', { class: 'field-label', text: 'Цвета градиента' }),
          colors.length < 3
            ? el('button', {
              class: 'btn btn--ghost btn--sm', type: 'button', text: '+ третий цвет',
              onClick: () => { patchGradient({ colors: [...colors, shiftHue(colors[1], 60)] }, { now: true }); repaint(); }
            })
            : el('button', {
              class: 'btn btn--ghost btn--sm', type: 'button', text: 'Убрать третий',
              onClick: () => { patchGradient({ colors: colors.slice(0, 2) }, { now: true }); repaint(); }
            })
        ]),
        el('div', { class: 'color-row' }, row)
      ])
      : null,
    g.enabled
      ? slider({
        label: 'Угол',
        value: g.angle,
        min: 0, max: 360, unit: '°',
        onInput: (value) => patchGradient({ angle: value })
      })
      : null,
    g.enabled
      ? toggle({
        label: 'Переливается',
        hint: 'Цвета медленно перетекают друг в друга.',
        checked: Boolean(state.page.bgGradient && state.page.bgGradient.animated),
        locked: !feature('animatedGradient').allowed,
        requires: feature('animatedGradient').requires,
        error: fieldError('bgGradient.animated'),
        onToggle: (on) => patchGradient({ animated: on }, { now: true })
      })
      : null
  ];
}

// ---------------------------------------------------------------------------
// Узор и живой фон
// ---------------------------------------------------------------------------

function patternNow() {
  const raw = state.page.bgPattern || {};
  return { kind: raw.kind || 'none', opacity: raw.opacity ?? 35 };
}

function backgroundExtras() {
  const pattern = patternNow();
  return [
    fold({
      id: 'bg-pattern', title: 'Узор', adv: true, summary: pattern.kind === 'none' ? 'Без узора' : nameOf(catalog('bgPatterns'), pattern.kind),
      changed: pattern.kind !== 'none',
      onReset: () => { update({ bgPattern: { kind: 'none', opacity: 35 } }, { now: true }); renderBackground(); },
      children: [
    choicePicker({
      label: 'Узор поверх фона',
      hint: 'Тонкий рисунок, который растворяется к низу страницы.',
      items: catalog('bgPatterns'),
      value: pattern.kind,
      wide: true,
      preview: (item) => el('span', { class: `style-art style-art--pattern is-${item.id}`, 'aria-hidden': true }),
      error: fieldError('bgPattern'),
      onPick: (id) => { update({ bgPattern: { ...patternNow(), kind: id } }, { now: true }); renderBackground(); }
    }),
    pattern.kind !== 'none'
      ? slider({
        label: 'Заметность узора',
        value: pattern.opacity,
        min: 5, max: 100, unit: ' %',
        onInput: (value) => update({ bgPattern: { ...patternNow(), opacity: value } })
      })
      : null
      ]
    }),
    fold({
      id: 'bg-live', title: 'Живой фон', adv: true, summary: (state.page.liveBg || 'none') === 'none' ? 'Нет' : nameOf(catalog('liveBackgrounds'), state.page.liveBg),
      changed: (state.page.liveBg || 'none') !== 'none',
      onReset: () => { update({ liveBg: 'none' }, { now: true }); renderBackground(); },
      children: [
    choicePicker({
      label: 'Живой фон',
      hint: 'Медленно движется под содержимым. Цвета — эффектов или акцента.',
      items: catalog('liveBackgrounds'),
      value: state.page.liveBg || 'none',
      wide: true,
      preview: (item) => el('span', { class: `style-art style-art--live is-${item.id}`, 'aria-hidden': true }),
      error: fieldError('liveBg'),
      onPick: (id) => { update({ liveBg: id }, { now: true }); renderBackground(); }
    })
      ]
    })
  ];
}

export function renderBackground() {
  const image = feature('backgroundImage');
  const video = feature('videoBackground');

  const paint = () => {
    const bg = bgNow();
    const on = bg.kind !== 'none' && Boolean(bg.url);

    const grad = gradientNow();
    fill($('background-body'), [
      fold({
        id: 'bg-media', title: 'Картинка или видео', open: true,
        summary: on ? (bg.kind === 'video' ? 'Видео' : 'Картинка') : 'Нет',
        changed: on,
        onReset: () => { patchBg({ kind: 'none', url: null }, { now: true }); paint(); },
        children: [
      mediaField({
        label: 'Фон страницы',
        shape: 'cover',
        url: bg.url,
        kind: bg.kind === 'video' ? 'video' : 'image',
        // Видео не предлагаем тем, у кого его не примут: выбрать файл и
        // получить отказ хуже, чем сразу увидеть, что это в другом тарифе.
        accept: video.allowed ? `${ACCEPT.image},${ACCEPT.video}` : ACCEPT.image,
        maxBytes: limits().assetBytes,
        locked: !image.allowed,
        requires: image.requires,
        softNote: 'Подписка закончилась: на странице сейчас обычный фон темы. Файл сохранён.',
        hint: video.allowed
          ? 'Картинка или короткое видео. Длинное видео посетитель с телефона просто не дождётся.'
          : image.allowed
            ? 'Картинка. Видео-фон — в Love Premium.'
            : null,
        guard: gifGuard('animatedBackground', 'фоном'),
        upload: (file) => api.upload('background', file),
        onDone: (result) => {
          patchBg({ kind: result.kind, url: result.url }, { now: true });
          paint();
        },
        onClear: () => {
          patchBg({ kind: 'none', url: null }, { now: true });
          paint();
        }
      }),

      // Размытие и затемнение без фона не на что накладывать.
      on
        ? slider({
          label: 'Размытие',
          value: bg.blur,
          min: 0, max: 20, unit: ' px',
          disabled: !image.allowed,
          onInput: (value) => patchBg({ blur: value })
        })
        : null,

      on
        ? slider({
          label: 'Затемнение',
          value: bg.dim,
          min: 0, max: 85, unit: ' %',
          disabled: !image.allowed,
          hint: 'Помогает сохранить читаемость на светлом фоне.',
          onInput: (value) => patchBg({ dim: value })
        })
        : null,

      fieldError('background') || fieldError('background.url') || fieldError('background.kind')
        ? el('p', {
          class: 'field-error',
          role: 'alert',
          text: fieldError('background') || fieldError('background.url') || fieldError('background.kind')
        })
        : null,

        ]
      }),
      fold({
        id: 'bg-gradient', title: 'Градиент', adv: true, summary: grad.enabled ? 'Включён' : 'Выключен',
        changed: grad.enabled,
        onReset: () => { patchGradient({ enabled: false }, { now: true }); paint(); },
        children: gradientField(paint)
      }),
      ...backgroundExtras()
    ]);
  };

  paint();
}

// ---------------------------------------------------------------------------
// Музыка
// ---------------------------------------------------------------------------

function musicNow() {
  const music = state.page.music || {};
  return {
    url: music.url || null,
    title: music.title || '',
    artist: music.artist || '',
    volume: music.volume ?? 60
  };
}

const patchMusic = (extra, options) => update({ music: { ...musicNow(), ...extra } }, options);

export function renderMusic() {
  const rule = feature('music');

  const paint = () => {
    const music = musicNow();
    const tracks = state.page.playlist || [];
    // Два трека и больше — плейлист: один список вместо поля «Трек» сверху
    // и его же копии первой строкой.
    const isList = tracks.length >= 2;
    const on = Boolean(music.url) || isList;

    fill($('music-body'), [
      isList || music.url
        ? null
        : mediaField({
          label: 'Трек',
          shape: 'audio',
          kind: 'audio',
          url: music.url,
          accept: ACCEPT.audio,
          maxBytes: limits().assetBytes,
          locked: !rule.allowed,
          requires: rule.requires,
          softNote: 'Подписка закончилась: трек на странице не играет. Файл сохранён.',
          empty: 'трека нет',
          // Про экран входа надо сказать здесь, а не в соседней карточке: человек
          // ставит музыку и ждёт, что она заиграет сама.
          hint: 'Музыка начнёт играть после нажатия на экран входа.',
          upload: (file) => api.upload('music', file),
          onDone: (result, file) => {
            patchMusic({ url: result.url, title: musicNow().title || trackName(file) }, { now: true });
            paint();
            // Экран входа зависит от трека: с музыкой он показывается всегда.
            // Перерисовываем соседнюю карточку, иначе подпись в ней врёт до
            // перезагрузки.
            renderEntry();
          },
          onClear: () => {
            patchMusic({ url: null, title: '', artist: '' }, { now: true });
            paint();
            renderEntry();
          }
        }),

      ...(!isList && music.url ? singleTrack(paint) : []),

      ...(isList ? playlistRows(paint) : []),

      on
        ? slider({
          label: 'Громкость',
          value: music.volume,
          min: 0, max: 100, unit: ' %',
          disabled: !rule.allowed,
          hint: music.volume < 10 ? 'Очень тихо — гости могут решить, что музыки нет.' : null,
          onInput: (value) => patchMusic({ volume: value })
        })
        : null,

      fieldError('music') || fieldError('music.url')
        ? el('p', {
          class: 'field-error',
          role: 'alert',
          text: fieldError('music') || fieldError('music.url')
        })
        : null,

      ...addTrack(paint)
    ]);
  };

  paint();
}

// ---------------------------------------------------------------------------
// Плейлист (Premium)
// ---------------------------------------------------------------------------

let playlistBusy = false;
let listening = null;        // { url, audio } — какой трек слушают прямо в редакторе

function listen(url, button) {
  if (listening && listening.url === url) {
    listening.audio.pause();
    listening = null;
    button.textContent = '▶';
    return;
  }
  if (listening) listening.audio.pause();
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, (musicNow().volume || 60) / 100));
  audio.play().catch(() => toast('Не получилось воспроизвести трек', 'err'));
  audio.addEventListener('ended', () => { if (listening && listening.audio === audio) { listening = null; button.textContent = '▶'; } });
  listening = { url, audio };
  document.querySelectorAll('.track-play').forEach((node) => { node.textContent = '▶'; });
  button.textContent = '❚❚';
}

/**
 * Название трека из имени файла — только если оно похоже на название. Файлы
 * из мессенджеров часто называются набором цифр («-6224841128583685855»),
 * такое лучше оставить пустым, чем показывать гостям.
 */
function trackName(file) {
  const name = String((file && file.name) || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  return /[a-zа-яё]/i.test(name) ? name.slice(0, 80) : '';
}

/** Один трек — той же строкой, что и в плейлисте, вместо голого плеера браузера. */
function singleTrack(repaint) {
  const rule = feature('music');
  const music = musicNow();
  const locked = !rule.allowed;
  let busy = false;
  const replace = el('input', {
    type: 'file', accept: ACCEPT.audio, hidden: true,
    onChange: async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file || busy) return;
      if (limits().assetBytes && file.size > limits().assetBytes) {
        toast(`Файл больше ${Math.round(limits().assetBytes / (1024 * 1024))} МБ`, 'err');
        return;
      }
      busy = true;
      try {
        const result = await api.upload('music', file);
        // Новый файл — новое название, если человек не вписал своё.
        patchMusic({ url: result.url, title: trackName(file) || musicNow().title }, { now: true });
      } catch (error) {
        toast(error.message || 'Не удалось загрузить трек', 'err');
      } finally {
        busy = false;
        repaint();
        renderEntry();
      }
    }
  });
  return [
    el('div', { class: 'field-top' }, [el('span', { class: 'field-label', text: 'Трек' })]),
    el('div', { class: 'tracks' }, [
      el('div', { class: 'track-row' }, [
        el('button', {
          class: 'btn btn--ghost btn--icon track-play', type: 'button', text: listening && listening.url === music.url ? '❚❚' : '▶',
          title: 'Послушать', onClick: (event) => listen(music.url, event.currentTarget)
        }),
        el('div', { class: 'track-fields' }, [
          el('input', {
            class: 'input', type: 'text', value: music.title, maxlength: 80, placeholder: 'название трека', disabled: locked,
            'aria-label': 'Название трека', onInput: (event) => patchMusic({ title: event.target.value })
          }),
          el('input', {
            class: 'input', type: 'text', value: music.artist, maxlength: 80, placeholder: 'исполнитель', disabled: locked,
            'aria-label': 'Исполнитель', onInput: (event) => patchMusic({ artist: event.target.value })
          })
        ]),
        el('div', { class: 'link-tools' }, [
          el('button', {
            class: 'btn btn--ghost btn--icon', type: 'button', text: '↻', title: 'Заменить файл', disabled: locked,
            onClick: () => replace.click()
          }),
          el('button', {
            class: 'btn btn--ghost btn--icon', type: 'button', text: '✕', title: 'Убрать трек',
            onClick: () => {
              if (listening && listening.url === music.url) { listening.audio.pause(); listening = null; }
              patchMusic({ url: null, title: '', artist: '' }, { now: true });
              repaint();
              renderEntry();
            }
          })
        ])
      ])
    ]),
    replace,
    el('p', { class: 'hint', text: 'Музыка начнёт играть после нажатия на экран входа.' }),
    fieldError('music.title') ? el('p', { class: 'field-error', role: 'alert', text: fieldError('music.title') }) : null,
    locked ? lockNote(rule.requires) : null
  ];
}

/** Перевести список в одиночный трек, когда в нём остался один. */
function collapseTo(track) {
  update({ playlist: [], music: { ...musicNow(), url: track.url, title: track.title || '', artist: track.artist || '' } }, { now: true });
}

function playlistRows(repaint) {
  const tracks = (state.page.playlist || []).map((track) => ({ ...track }));
  const save = (next, now = true) => update({ playlist: next }, now ? { now: true } : {});

  const row = (track, index) => el('div', { class: 'track-row' }, [
    el('button', {
      class: 'btn btn--ghost btn--icon track-play', type: 'button', text: listening && listening.url === track.url ? '❚❚' : '▶',
      title: 'Послушать', onClick: (event) => listen(track.url, event.currentTarget)
    }),
    el('div', { class: 'track-fields' }, [
      el('input', {
        class: 'input', type: 'text', value: track.title || '', maxlength: 80, placeholder: `трек ${index + 1} — название`,
        onInput: (event) => { tracks[index].title = event.target.value; save(tracks.map((t) => ({ ...t })), false); }
      }),
      el('input', {
        class: 'input', type: 'text', value: track.artist || '', maxlength: 80, placeholder: 'исполнитель',
        onInput: (event) => { tracks[index].artist = event.target.value; save(tracks.map((t) => ({ ...t })), false); }
      })
    ]),
    el('div', { class: 'link-tools' }, [
      el('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', text: '↑', title: 'Выше', disabled: index === 0,
        onClick: () => { [tracks[index - 1], tracks[index]] = [tracks[index], tracks[index - 1]]; save(tracks); repaint(); }
      }),
      el('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', text: '↓', title: 'Ниже', disabled: index === tracks.length - 1,
        onClick: () => { [tracks[index + 1], tracks[index]] = [tracks[index], tracks[index + 1]]; save(tracks); repaint(); }
      }),
      el('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', text: '✕', title: 'Убрать',
        onClick: () => {
          const left = tracks.filter((_, i) => i !== index);
          if (left.length === 1) collapseTo(left[0]);
          else save(left);
          repaint();
        }
      })
    ])
  ]);

  return [
    el('div', { class: 'field-top' }, [
      el('span', { class: 'field-label', text: 'Плейлист' }),
      el('span', { class: 'counter', text: `${tracks.length}/${limits().playlist || 8}` })
    ]),
    el('div', { class: 'tracks' }, tracks.map(row)),
    el('p', { class: 'hint', text: 'Играют по очереди, первый — после нажатия на экран входа. У гостя кнопки «назад» и «вперёд».' }),
    fieldError('playlist') ? el('p', { class: 'field-error', role: 'alert', text: fieldError('playlist') }) : null
  ];
}

/** «Добавить трек»: из одного трека получается плейлист. */
function addTrack(repaint) {
  const rule = feature('playlist');
  const music = musicNow();
  const tracks = state.page.playlist || [];
  const max = limits().playlist || 8;
  if (!music.url && tracks.length < 2) return [];

  const input = el('input', {
    type: 'file', accept: ACCEPT.audio, hidden: true,
    onChange: async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (limits().assetBytes && file.size > limits().assetBytes) {
        toast(`Файл больше ${Math.round(limits().assetBytes / (1024 * 1024))} МБ`, 'err');
        return;
      }
      playlistBusy = true;
      repaint();
      try {
        const result = await api.upload('music', file);
        const name = trackName(file);
        const now = musicNow();
        let next = (state.page.playlist || []).slice();
        // Первый трек плейлиста — тот, что стоял одиночным, с его названием.
        if (next.length < 2 && now.url) next = [{ url: now.url, title: now.title || '', artist: now.artist || '' }];
        next = [...next, { url: result.url, title: name, artist: '' }].slice(0, max);
        update({ playlist: next }, { now: true });
      } catch (error) {
        toast(error.message || 'Не удалось загрузить трек', 'err');
      } finally {
        playlistBusy = false;
        repaint();
      }
    }
  });

  return [
    el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn btn--sm', type: 'button',
        text: playlistBusy ? 'Загружаем…' : tracks.length >= 2 ? 'Добавить трек' : 'Добавить ещё трек — получится плейлист',
        disabled: playlistBusy || !rule.allowed || tracks.length >= max,
        onClick: () => input.click()
      }),
      input
    ]),
    rule.allowed ? null : lockNote(rule.requires)
  ];
}

/** Свой пикер сервисов вместо системного select: логотип и название видны сразу. */
function linkIconPicker(value, options, onPick) {
  const getIcon = (id) => options.find((icon) => icon.id === id) || options[0] || null;
  let selected = getIcon(value);

  const selectedIcon = el('span', { class: 'icon-picker-current-icon', 'aria-hidden': true }, [
    iconNode(selected && selected.svg)
  ]);
  const selectedName = el('span', { class: 'icon-picker-current-name', text: selected ? selected.name : 'Сервис' });
  const trigger = el('summary', {
    class: 'icon-picker-trigger',
    'aria-label': 'Выбрать сервис для ссылки'
  }, [
    selectedIcon,
    selectedName,
    el('span', { class: 'icon-picker-chevron', 'aria-hidden': true })
  ]);
  const search = el('input', {
    class: 'input icon-picker-search',
    type: 'search',
    placeholder: 'Найти сервис',
    autocomplete: 'off',
    'aria-label': 'Поиск сервиса'
  });
  const grid = el('div', { class: 'icon-picker-grid', 'aria-label': 'Сервисы' });
  const picker = el('details', { class: 'icon-picker' });
  const outside = (event) => {
    if (!picker.contains(event.target)) picker.open = false;
  };

  function draw(query = '') {
    const needle = query.trim().toLocaleLowerCase();
    const matches = options.filter((icon) => `${icon.name} ${icon.id}`.toLocaleLowerCase().includes(needle));
    fill(grid, matches.map((icon) => el('button', {
      class: `icon-option${selected && selected.id === icon.id ? ' is-selected' : ''}`,
      type: 'button',
      title: icon.name,
      'aria-label': icon.name,
      'aria-pressed': Boolean(selected && selected.id === icon.id),
      onClick: () => {
        selected = icon;
        fill(selectedIcon, [iconNode(icon.svg)]);
        selectedName.textContent = icon.name;
        picker.open = false;
        search.value = '';
        draw();
        if (onPick) onPick(icon.id);
        trigger.focus();
      }
    }, [
      el('span', { class: 'icon-option-mark', 'aria-hidden': true }, [iconNode(icon.svg)]),
      el('span', { class: 'icon-option-name', text: icon.name })
    ])));
    grid.dataset.empty = matches.length ? 'false' : 'true';
  }

  search.addEventListener('input', () => draw(search.value));
  picker.addEventListener('toggle', () => {
    if (picker.open) {
      document.addEventListener('pointerdown', outside);
      search.focus();
    } else {
      document.removeEventListener('pointerdown', outside);
    }
  });
  picker.append(trigger, el('div', { class: 'icon-picker-popover' }, [search, grid]));
  draw();
  return picker;
}

// ---------------------------------------------------------------------------
// Ссылки
// ---------------------------------------------------------------------------

/**
 * Адрес проверяем ровно как сервер (isSafeLinkUrl в routes/profilePages.js):
 * чужие домены разрешены — в этом смысл визитки, — а вот схема только http(s).
 * javascript: в href — это исполнение кода на странице у каждого посетителя.
 */
function okUrl(value) {
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * «vk.com/me» → «https://vk.com/me».
 *
 * Люди копируют адреса без схемы постоянно, и отказ «должно начинаться с
 * https://» на такое выглядит придиркой. Дописываем на уходе из поля, а не на
 * каждый символ: иначе первая же набранная буква превратится в адрес.
 * Пробел внутри — признак, что это не адрес, а заметка; такое не трогаем.
 *
 * Домен ищем по юникод-буквам, а не по [a-z]: «мойсайт.рф» — обычный рабочий
 * адрес, и обойтись с ним хуже, чем с «mysite.com», было бы странно.
 */
function guessUrl(value) {
  const text = String(value || '').trim();
  if (!text || /^[a-z][a-z0-9+.-]*:/i.test(text) || /\s/.test(text)) return text;
  return /^[^/]+\.\p{L}{2,}/u.test(text) ? `https://${text}` : text;
}

export function renderLinks() {
  const body = $('links-body');
  const max = limits().links || 3;
  const icons = (state.caps && state.caps.linkIcons) || [];

  // Своя копия списка: строки добавляют, удаляют и двигают, а держать это в
  // state.page нельзя — там живёт то, что уже принял сервер.
  let rows = (state.page.links || []).map((link) => ({
    label: link.label || '',
    url: link.url || '',
    icon: link.icon || 'link'
  }));

  /**
   * Незаполненные строки не отправляем: человек нажал «Добавить» и ещё не
   * дописал адрес — сервер на такое ответит ошибкой, хотя ошибки никакой нет.
   * А вот сломанный адрес блокирует отправку целиком: сервер отклоняет весь
   * список, и лучше показать это здесь, чем ловить 400 и откатывать правки.
   */
  function commit(options) {
    if (rows.some((row) => row.url && !okUrl(row.url))) return false;
    update({ links: rows.filter((row) => row.url).map((row) => ({ ...row })) }, options);
    return true;
  }

  const count = () => {
    const node = $('links-count');
    if (node) node.textContent = `${rows.length}/${max}`;
  };

  function row(item, index) {
    // Ругаться начинаем только после первого ухода из поля. Пока человек
    // набирает адрес, любое незаконченное начало формально «неправильное», и
    // краснеть на «h», «ht», «htt» — значит мешать человеку делать своё дело.
    let scolded = Boolean(item.url) && !okUrl(item.url);

    const urlInput = el('input', {
      class: 'input',
      type: 'url',
      value: item.url,
      placeholder: 'https://…',
      maxlength: 400,
      autocomplete: 'off',
      spellcheck: false,
      onInput: (event) => {
        item.url = event.target.value;
        // Исправился — снимаем красноту сразу, не дожидаясь ухода из поля:
        // держать ошибку на уже правильном адресе незачем.
        if (scolded && okUrl(item.url)) scolded = false;
        say();
        commit();
      },
      onBlur: (event) => {
        const fixed = guessUrl(event.target.value);
        const changed = fixed !== item.url;
        if (changed) {
          event.target.value = fixed;
          item.url = fixed;
        }
        scolded = Boolean(item.url) && !okUrl(item.url);
        say();
        // Дописали схему сами — сохраняем сразу, чтобы человек видел итог. Если
        // ничего не менялось, набор уже стоит в очереди автосохранения.
        if (changed) commit({ now: true });
      }
    });

    // Подписи под адресом живут как отдельные узлы и переключаются на месте.
    // Перерисовать строку целиком было бы проще, но человек в этот момент
    // набирает адрес — перерисовка выбьет курсор из поля на первом же символе.
    const bad = el('p', {
      class: 'field-error', role: 'alert',
      text: 'Ссылка должна начинаться с http:// или https://'
    });
    // Про несохранённую строку надо сказать: иначе человек закроет редактор,
    // вернётся и не найдёт её, хотя «сохранено» горело.
    const empty = el('p', { class: 'hint', text: 'Пока адрес пустой, строка не сохраняется.' });

    function say() {
      urlInput.classList.toggle('is-bad', scolded);
      bad.hidden = !scolded;
      empty.hidden = Boolean(item.url);
    }
    say();

    const move = (shift) => {
      const to = index + shift;
      if (to < 0 || to >= rows.length) return;
      [rows[index], rows[to]] = [rows[to], rows[index]];
      commit({ now: true });
      paint();
      // Строка переехала — вместе с ней переехали и её кнопки, а фокус остался
      // на выброшенном узле. Возвращаем его на ту же кнопку в новом месте:
      // иначе поднять ссылку на три позиции с клавиатуры невозможно.
      //
      // На краю списка нужная кнопка гаснет — тогда берём соседнюю: фокус
      // остаётся в строке, и дальше можно уехать обратно, не ища её табом.
      const moved = body.querySelectorAll('.link-row')[to];
      const tools = moved ? moved.querySelectorAll('.link-tools button') : [];
      const wanted = tools[shift < 0 ? 0 : 1];
      const other = tools[shift < 0 ? 1 : 0];
      const target = wanted && !wanted.disabled ? wanted : other;
      if (target && !target.disabled) target.focus();
    };

    return el('div', { class: 'link-row' }, [
      el('div', { class: 'link-head' }, [
        linkIconPicker(item.icon, icons, (id) => {
            item.icon = id;
            commit({ now: true });
          }),
        el('div', { class: 'link-tools' }, [
          el('button', {
            class: 'btn btn--ghost btn--icon', type: 'button', text: '↑',
            title: 'Выше', disabled: index === 0, onClick: () => move(-1)
          }),
          el('button', {
            class: 'btn btn--ghost btn--icon', type: 'button', text: '↓',
            title: 'Ниже', disabled: index === rows.length - 1, onClick: () => move(1)
          }),
          el('button', {
            class: 'btn btn--ghost btn--icon', type: 'button', text: '✕',
            title: 'Удалить',
            onClick: () => {
              rows.splice(index, 1);
              commit({ now: true });
              paint();
              // Удалили строку — фокус должен остаться там же, где был палец:
              // на кнопке удаления следующей строки, а если удалили последнюю,
              // то на предыдущей. Пустой список — уводим на «Добавить».
              const left = body.querySelectorAll('.link-row');
              const near = left[Math.min(index, left.length - 1)];
              const next = near
                ? near.querySelectorAll('.link-tools button')[2]
                : body.querySelector('.row-actions button');
              if (next && !next.disabled) next.focus();
            }
          })
        ])
      ]),

      el('input', {
        class: 'input',
        type: 'text',
        value: item.label,
        placeholder: 'как назвать — можно оставить пустым',
        maxlength: 40,
        autocomplete: 'off',
        onInput: (event) => {
          item.label = event.target.value;
          commit();
        }
      }),

      urlInput,
      bad,
      empty,
      fieldError(`links.${index}`)
        ? el('p', { class: 'field-error', role: 'alert', text: fieldError(`links.${index}`) })
        : null
    ]);
  }

  function paint() {
    count();
    const full = rows.length >= max;

    fill(body, [
      rows.length
        ? el('div', { class: 'links' }, rows.map(row))
        : el('p', { class: 'hint', text: 'Ссылок пока нет. Добавьте те, по которым вас ищут.' }),

      el('div', { class: 'row-actions' }, [
        el('button', {
          class: 'btn btn--sm', type: 'button', text: 'Добавить ссылку',
          disabled: full,
          onClick: () => {
            rows.push({ label: '', url: '', icon: 'link' });
            paint();
            // Курсор сразу в адрес новой строки: следующее действие человека —
            // вставить ссылку, и лишний клик тут ничем не оправдан.
            const inputs = body.querySelectorAll('.link-row input[type="url"]');
            const last = inputs[inputs.length - 1];
            if (last) last.focus();
          }
        }),
        full
          ? el('span', {
            class: 'hint',
            text: max < 20
              ? `Это предел вашего тарифа: ${max}. В Love Pro — 12, в Premium — 20.`
              : `Больше ${max} ссылок не умещается.`
          })
          : null
      ]),

      fieldError('links')
        ? el('p', { class: 'field-error', role: 'alert', text: fieldError('links') })
        : null
    ]);
  }

  paint();
}

// ---------------------------------------------------------------------------
// Экран входа
// ---------------------------------------------------------------------------

/**
 * Заглушка «нажми, чтобы войти» перед страницей.
 *
 * Тонкость, из-за которой здесь не просто переключатель: с музыкой экран входа
 * показывается всегда, даже со снятой галочкой. Так решено на сервере
 * (profilePageView.js) — без нажатия браузер звук не запускает, и трек молча не
 * заиграл бы. Врать переключателем не хочется: он остаётся при своём значении,
 * а про сегодняшнюю реальность говорим подписью. Снимут музыку — вернётся их
 * собственный выбор, а не наш.
 */
export function renderEntry() {
  const rule = feature('enterOverlay');

  const paint = () => {
    const overlay = state.page.enterOverlay || {};
    const on = Boolean(overlay.enabled);
    // Музыка учитывается только рабочая: на free трек лежит в настройках, но на
    // странице не играет, и экран входа из-за него не появляется.
    const byMusic = Boolean(state.page.music?.url) && feature('music').allowed;

    fill($('entry-body'), [
      toggle({
        label: 'Показывать экран входа',
        hint: byMusic
          ? 'С треком он показывается всегда — иначе музыка не заиграет.'
          : 'Страница откроется не сразу: сначала имя и надпись, дальше по нажатию.',
        checked: on,
        locked: !rule.allowed,
        requires: rule.requires,
        error: fieldError('enterOverlay'),
        onToggle: (next) => {
          update({ enterOverlay: { ...overlay, enabled: next } }, { now: true });
          paint();
        }
      }),

      // Надпись прячем, когда экран не показывается: настраивать текст того,
      // чего никто не увидит, — только сбивать с толку.
      on || byMusic
        ? textField({
          label: 'Надпись',
          value: overlay.text || '',
          max: 40,
          locked: !rule.allowed && !byMusic,
          requires: rule.requires,
          placeholder: 'нажми, чтобы войти',
          hint: 'Пусто — оставим «нажми, чтобы войти».',
          error: fieldError('enterOverlay.text'),
          onInput: (value) => update({ enterOverlay: { ...overlay, text: value } })
        })
        : null
    ]);
  };

  paint();
}

// ---------------------------------------------------------------------------
// Что показывать
// ---------------------------------------------------------------------------

function statusHint() {
  const a = state.account || {};
  const filled = [a.mood, a.customStatus, (a.hobbies || []).length ? 'интересы' : ''].filter(Boolean);
  return filled.length
    ? 'Настроение, статус и интересы из вашего профиля Love.'
    : 'Пока показывать нечего: настроение и статус заполняются в приложении.';
}

export function renderBlocks() {
  const page = state.page;
  const status = feature('statusBlock');
  const badges = feature('badges');
  const footer = feature('hideFooter');

  fill($('blocks-body'), [
    toggle({
      label: 'Настроение и статус',
      hint: statusHint(),
      checked: Boolean(page.showStatus),
      locked: !status.allowed,
      requires: status.requires,
      error: fieldError('showStatus'),
      onToggle: (on) => update({ showStatus: on }, { now: true })
    }),

    toggle({
      label: 'Значки',
      hint: 'Сколько вы в Love, подтверждённый аккаунт, подписка.',
      checked: Boolean(page.showBadges),
      locked: !badges.allowed,
      requires: badges.requires,
      error: fieldError('showBadges'),
      onToggle: (on) => update({ showBadges: on }, { now: true })
    }),

    toggle({
      label: 'Сердечко со счётчиком',
      hint: 'Гости ставят сердечко без регистрации — одно на человека, накрутку отсекаем.',
      checked: Boolean(page.hearts && page.hearts.enabled),
      locked: !feature('hearts').allowed,
      requires: feature('hearts').requires,
      error: fieldError('hearts'),
      onToggle: (on) => update({ hearts: { enabled: on } }, { now: true })
    }),

    toggle({
      label: 'Убрать подпись «Сделано в Love»',
      hint: 'Кнопка «Написать в Love» остаётся — без неё страница ни к чему не ведёт.',
      checked: Boolean(page.hideFooter),
      locked: !footer.allowed,
      requires: footer.requires,
      error: fieldError('hideFooter'),
      onToggle: (on) => update({ hideFooter: on }, { now: true })
    })
  ]);
}

// ---------------------------------------------------------------------------
// Пара и близкие
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSE_MAX = 3;
const CLOSE_COOLDOWN_DAYS = 14;

/** 1 день, 2 дня, 5 дней. */
function daysWord(count) {
  const tail = count % 100;
  if (tail > 10 && tail < 20) return 'дней';
  const last = count % 10;
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

/** Дата с сервера → значение для input[type=date]. Считаем по местным часам. */
function dateValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * '2026-08-24' → полночь по местному времени.
 *
 * Не UTC: сервер не принимает дату из будущего, а UTC-полночь сегодняшнего дня
 * для нас наступает уже утром — и с трёх ночи до трёх утра «сегодня» отвечало бы
 * отказом. Местная полночь всегда позади.
 */
function dateToIso(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toISOString();
}

/** Кружок с картинкой или первой буквой имени. */
function personPic(person) {
  if (person.avatar) return el('img', { class: 'person-pic', src: person.avatar, alt: '' });
  const letter = [...(person.nickname || person.username || '?')][0] || '?';
  return el('span', {
    class: 'person-pic person-pic--empty',
    text: letter.toUpperCase(),
    'aria-hidden': true
  });
}

/**
 * Строка человека: картинка, имя, ник и одна кнопка.
 *
 * Ник показываем всегда, даже когда есть имя: имена в Love не уникальны, и без
 * ника нельзя убедиться, что отмечен именно тот человек, а не его тёзка.
 */
function personRow(person, action) {
  return el('div', { class: 'person' }, [
    personPic(person),
    el('div', { class: 'person-main' }, [
      person.nickname ? el('span', { class: 'person-name', text: person.nickname }) : null,
      el('span', { class: 'person-nick', text: '@' + person.username })
    ]),
    action || null
  ]);
}

/**
 * Поиск человека по нику.
 *
 * Списком друзей не показываем сознательно: их бывает несколько сотен, а нужен
 * ровно один — набрать ник быстрее, чем прокрутить. Сервер ищет только среди
 * своих друзей, поэтому чужой ник отвечает «такого нет», и перебирать ники
 * незнакомых людей через это поле нельзя.
 */
function friendPicker({ placeholder, disabled, onPick }) {
  const node = el('div', { class: 'finder' });
  let text = '';
  let busy = false;
  let problem = null;

  const submit = async () => {
    const nick = text.trim().replace(/^@/, '');
    if (!nick || busy) return;
    busy = true;
    problem = null;
    paint();
    try {
      const data = await api.resolveFriend(nick);
      text = '';
      busy = false;
      paint();
      onPick(data.person);
    } catch (error) {
      busy = false;
      problem = error.message;
      paint(true);
    }
  };

  function paint(refocus) {
    const input = el('input', {
      class: `input${problem ? ' is-bad' : ''}`,
      type: 'text',
      value: text,
      placeholder: placeholder || 'ник',
      disabled: busy || Boolean(disabled),
      autocomplete: 'off',
      spellcheck: false,
      onInput: (event) => { text = event.target.value; },
      // Enter в поле «ник» — то же самое, что нажать кнопку. Настоящую форму
      // здесь не заводим: внутри редактора она перезагружала бы страницу.
      onKeyDown: (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        submit();
      }
    });

    fill(node, [
      el('div', { class: 'finder-row' }, [
        input,
        el('button', {
          class: 'btn btn--sm',
          type: 'button',
          text: busy ? 'Ищем…' : 'Найти',
          disabled: busy || Boolean(disabled),
          onClick: submit
        })
      ]),
      problem ? el('p', { class: 'field-error', role: 'alert', text: problem }) : null
    ]);

    // После отказа человек хочет поправить ник, а перерисовка съела фокус —
    // возвращаем каретку в конец строки, чтобы не искать поле заново.
    if (refocus) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  paint();
  return node;
}

/**
 * Пара и близкие.
 *
 * Обе настройки касаются не только владельца страницы, поэтому отметить можно
 * только человека из своих друзей — это проверяет сервер. Здесь важнее другое:
 * убрать кого-то из близких разрешено раз в две недели, и сказать об этом надо
 * ДО нажатия. Кнопка, которая гарантированно вернёт отказ, — не защита, а
 * ловушка.
 */
export function renderPeople() {
  const pairRule = feature('pairBlock');
  const closeRule = feature('closeFriends');

  // Свои копии: пока правка в полёте, state.page.pair держит форму патча
  // ({ partnerId }), а рисовать надо человека ({ partner }). Сервер отвечает
  // страницей целиком, и после ответа копии снова сходятся.
  let pair = { ...(state.page.pair || {}) };
  let close = [...(state.page.closeFriends || [])];

  // Кого-то убрали только что: сервер поставит отметку времени, но ответ ещё в
  // пути, а секция после удачного сохранения сама не перерисовывается. Без этого
  // флага соседние кнопки «Убрать» остались бы живыми и следующий клик уехал бы
  // в отказ — то есть ровно та ловушка, от которой кулдаун и защищает.
  let removedNow = false;

  const savePair = () => update({
    pair: {
      partnerId: pair.partner ? pair.partner.id : null,
      since: pair.since || null,
      visible: Boolean(pair.visible)
    }
  }, { now: true });

  const saveClose = () => update(
    { closeFriends: close.map((person) => person.id) },
    { now: true }
  );

  // Кулдаун считаем и сами, чтобы погасить кнопку заранее. Решает всё равно
  // сервер — эта цифра нужна только чтобы не подставлять человека. Читаем
  // отметку на каждой отрисовке, а не один раз: после ответа сервера она другая.
  const cooldown = () => {
    const changedAt = removedNow
      ? Date.now()
      : (state.page.closeFriendsChangedAt ? new Date(state.page.closeFriendsChangedAt).getTime() : 0);
    const waitDays = Math.ceil((changedAt + CLOSE_COOLDOWN_DAYS * DAY_MS - Date.now()) / DAY_MS);
    return { frozen: changedAt > 0 && waitDays > 0, waitDays };
  };

  const paint = () => {
    const partner = pair.partner || null;
    const full = close.length >= CLOSE_MAX;
    const { frozen, waitDays } = cooldown();

    fill($('people-body'), [
      groupTitle('Пара'),

      partner
        ? personRow(partner, el('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          // Убрать разрешено на любом тарифе: запирать человека в отношениях,
          // которые кончились, потому что кончилась подписка, — абсурд.
          text: 'Убрать',
          onClick: () => {
            pair = { partner: null, since: null, visible: false };
            savePair();
            paint();
          }
        }))
        : friendPicker({
          placeholder: 'ник вашего человека',
          disabled: !pairRule.allowed,
          onPick: (person) => {
            // Включаем показ сразу: ник половинки в это поле вписывают
            // осознанно, и просить после этого щёлкнуть ещё и переключатель —
            // лишний шаг. Выключить можно тут же, рядом.
            pair = { ...pair, partner: person, visible: true };
            savePair();
            paint();
          }
        }),

      !partner && !pairRule.allowed ? lockNote(pairRule.requires) : null,
      partner && !pairRule.allowed
        ? el('p', {
          class: 'lock lock--soft',
          text: 'Подписка закончилась: блок сейчас не показывается на странице. Настройка сохранена.'
        })
        : null,

      partner ? dateField({
        label: 'Вместе с',
        value: dateValue(pair.since),
        // Дату не проверяем на «слишком давно»: люди пишут и 2013 год, и это
        // правда. Ограничиваем только будущее — его сервер всё равно отклонит.
        max: dateValue(Date.now()),
        hint: 'Покажем «вместе 128 дней». Без даты — просто «вместе».',
        error: fieldError('pair.since'),
        onPick: (value) => {
          pair = { ...pair, since: value ? dateToIso(value) : null };
          savePair();
        }
      }) : null,

      partner ? toggle({
        label: 'Показывать пару на странице',
        hint: 'Видно картинку, имя и сколько вы вместе.',
        checked: Boolean(pair.visible),
        locked: !pairRule.allowed,
        requires: pairRule.requires,
        error: fieldError('pair.partnerId'),
        onToggle: (on) => {
          pair = { ...pair, visible: on };
          savePair();
        }
      }) : null,

      el('p', {
        class: 'hint',
        text: 'Отметить можно только человека из ваших друзей в Love.'
      }),

      groupTitle('Близкие'),

      close.length
        ? el('div', { class: 'people-list' }, close.map((person) => personRow(person, el('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          text: 'Убрать',
          disabled: frozen,
          onClick: () => {
            close = close.filter((item) => item.id !== person.id);
            removedNow = true;
            saveClose();
            paint();
          }
        }))))
        : null,

      // Поле поиска прячем, когда мест не осталось: пустая строка ввода рядом с
      // «больше трёх нельзя» выглядит как поломка.
      !full && closeRule.allowed
        ? friendPicker({
          placeholder: 'ник друга',
          onPick: (person) => {
            if (close.some((item) => item.id === person.id)) {
              toast('Этот человек уже в списке', 'err');
              return;
            }
            close = [...close, person];
            saveClose();
            paint();
          }
        })
        : null,

      !closeRule.allowed && !close.length ? lockNote(closeRule.requires) : null,
      !closeRule.allowed && close.length
        ? el('p', {
          class: 'lock lock--soft',
          text: 'Подписка закончилась: близкие сейчас не показываются на странице. Список сохранён.'
        })
        : null,

      fieldError('closeFriends')
        ? el('p', { class: 'field-error', role: 'alert', text: fieldError('closeFriends') })
        : null,

      el('p', {
        class: 'hint',
        text: full
          ? `Места заняты: больше ${CLOSE_MAX} нельзя. Уберите кого-то, чтобы добавить нового.`
          : `До ${CLOSE_MAX} человек. Они увидят у себя значок, что вы отметили их близкими.`
      }),

      // Про кулдаун говорим и когда он идёт, и когда его нет: правило неочевидное,
      // а узнать о нём в момент, когда кнопка уже не работает, — обидно.
      el('p', {
        class: 'hint',
        text: frozen
          ? `Убрать кого-то можно будет через ${waitDays} ${daysWord(waitDays)}. Добавлять можно в любой момент.`
          : `Добавлять можно в любой момент, убирать — раз в ${CLOSE_COOLDOWN_DAYS} дней.`
      })
    ]);
  };

  paint();
}

// ---------------------------------------------------------------------------
// Превью в мессенджерах
// ---------------------------------------------------------------------------

/**
 * Картинка, которую видно, когда ссылку кидают в чат.
 *
 * Своя картинка — платная, но подпись здесь нужна всем: люди не понимают, откуда
 * берётся превью, и решают, что оно сломано. Порядок ровно как на сервере
 * (ogFor в routes/profilePublic.js): своя → аватар → фирменная карточка.
 */
// Карточка «так ссылка выглядит в чате». Раньше в рамке было лишь слово
// «аватар», и было непонятно, что именно увидят люди. Картинка выбирается
// ровно как на сервере (ogFor): своя (если тариф пускает) → аватар →
// фирменная карточка. Обновляется на лету, пока меняют имя и описание.
function shareCard(rule) {
  const page = state.page || {};
  const account = state.account || {};
  const own = rule.allowed ? (page.ogImage || null) : null;
  const avatar = page.avatar || account.avatar || null;
  const image = own || avatar || '/og/default.png';
  const wide = Boolean(own) || !avatar;
  const title = `${page.displayName || account.nickname || account.username || 'Профиль'} — Love`;
  const text = String(page.headline || page.bio || `Профиль ${account.nickname || account.username || ''} в Love`).slice(0, 200);
  let host = 'me.loveapp.chat';
  try { host = new URL(state.urls?.public || state.urls?.long || '').host || host; } catch (_) { /* оставим по умолчанию */ }

  return el('div', { class: `share-card${wide ? ' share-card--wide' : ''}` }, [
    el('span', { class: 'share-card-label', text: 'Так ссылка выглядит в чате' }),
    el('div', { class: 'share-card-body' }, [
      el('span', { class: 'share-card-site', text: host }),
      el('strong', { class: 'share-card-title', text: title }),
      el('span', { class: 'share-card-text', text }),
      el('img', { class: 'share-card-image', src: image, alt: '', loading: 'lazy' })
    ]),
    el('span', {
      class: 'share-card-note',
      text: host.startsWith('127.') || host.startsWith('localhost')
        ? 'Локальный адрес мессенджеры открыть не могут — превью появится у ссылки на опубликованную страницу.'
        : 'Мессенджеры запоминают превью на несколько дней: у старых сообщений оно не обновится сразу.'
    })
  ]);
}

let shareCardUnsubscribe = null;

export function renderShare() {
  const rule = feature('customOgImage');
  const cardSlot = el('div', { class: 'share-card-slot' });
  const paintCard = () => fill(cardSlot, [shareCard(rule)]);
  if (shareCardUnsubscribe) shareCardUnsubscribe();
  shareCardUnsubscribe = onChange((reason) => {
    if (reason === 'local' || reason === 'server') paintCard();
  });

  const paint = () => {
    const own = state.page.ogImage || null;

    fill($('share-body'), [
      mediaField({
        label: 'Картинка превью',
        shape: 'cover',
        url: own,
        kind: 'image',
        accept: ACCEPT.image,
        maxBytes: limits().assetBytes,
        locked: !rule.allowed,
        requires: rule.requires,
        softNote: 'Подписка закончилась: в чатах сейчас показывается аватар. Файл сохранён.',
        empty: own ? 'ничего не загружено' : 'аватар',
        // Размер называем, потому что здесь он действительно важен: соцсети
        // режут картинку под свою рамку, и лицо у края уезжает за границу.
        hint: 'Лучше всего 1200×630. Узкую или высокую картинку мессенджеры обрежут по краям.',
        upload: (file) => api.upload('og', file),
        onDone: (result) => {
          update({ ogImage: result.url }, { now: true });
          paint();
        },
        onClear: () => {
          update({ ogImage: null }, { now: true });
          paint();
        }
      }),

      cardSlot,

      el('p', {
        class: 'hint',
        text: own
          ? 'Мессенджеры помнят превью по нескольку дней. Новая картинка в старых сообщениях не обновится.'
          : 'Пока своей картинки нет, в чатах показывается ваш аватар. Нет и его — фирменная карточка Love.'
      }),

      fieldError('ogImage')
        ? el('p', { class: 'field-error', role: 'alert', text: fieldError('ogImage') })
        : null
    ]);
    paintCard();
  };

  paint();
}

// ---------------------------------------------------------------------------
// Просмотры
// ---------------------------------------------------------------------------

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** '2026-08-24' → '24 авг'. Год не пишем: окно максимум 30 дней. */
function dayLabel(key) {
  const [, month, day] = String(key).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] || ''}`.trim();
}

/** 1 просмотр, 2 просмотра, 5 просмотров. */
function viewsWord(count) {
  const tail = count % 100;
  if (tail > 10 && tail < 20) return 'просмотров';
  const last = count % 10;
  if (last === 1) return 'просмотр';
  if (last >= 2 && last <= 4) return 'просмотра';
  return 'просмотров';
}

/**
 * Столбики без библиотек: высота в процентах от лучшего дня.
 *
 * Пустые дни оставляем видимой полоской в 2px. Ноль высотой в ноль — это дыра
 * в ряду, и глазом она читается как «данных нет», хотя данные есть: ноль.
 */
function chart(series) {
  const top = Math.max(...series.map((point) => point.count), 1);

  return el('div', { class: 'chart' }, [
    el('div', { class: 'chart-bars' }, series.map((point) => el('div', {
      class: `chart-bar${point.count ? '' : ' is-empty'}`,
      style: `height:${point.count ? Math.max(6, Math.round((point.count / top) * 100)) : 2}%`,
      title: `${dayLabel(point.day)} — ${point.count} ${viewsWord(point.count)}`
    }))),
    el('div', { class: 'chart-axis' }, [
      el('span', { text: dayLabel(series[0].day) }),
      el('span', { text: 'сегодня' })
    ])
  ]);
}

/**
 * Статистика приходит отдельным запросом, а не вместе со страницей: она не
 * нужна для правок и не должна задерживать открытие редактора.
 */
export async function renderStats() {
  const body = $('stats-body');
  const rule = feature('viewStats');

  fill(body, [el('p', { class: 'hint', text: 'Считаем…' })]);

  let data;
  try {
    data = await api.stats();
  } catch (error) {
    fill(body, [
      el('p', { class: 'field-error', role: 'alert', text: error.message }),
      el('button', {
        class: 'btn btn--sm', type: 'button', text: 'Ещё раз',
        onClick: () => renderStats()
      })
    ]);
    return;
  }

  // Общий счётчик есть на любом тарифе, график по дням — с Pro. Отказ по
  // тарифу приходит и отсюда: подписка могла закончиться, пока вкладка открыта.
  if (!data.available) {
    fill(body, [
      data.total != null
        ? el('div', { class: 'stat-top' }, [
          el('span', { class: 'stat-value', text: String(data.total || 0) }),
          el('span', { class: 'stat-unit', text: `${viewsWord(data.total || 0)} всего` })
        ])
        : null,
      el('p', { class: 'hint', text: 'График по дням: в Love Pro — за неделю, в Premium — за месяц.' }),
      lockNote(data.requires || rule.requires),
      heartsLine(data),
      linkClicks(data),
      analyticsBlock(data),
      milestonesToggle()
    ]);
    return;
  }

  const series = data.series || [];
  const recent = series.reduce((sum, point) => sum + point.count, 0);

  fill(body, [
    el('div', { class: 'stat-top' }, [
      el('span', { class: 'stat-value', text: String(data.total || 0) }),
      el('span', { class: 'stat-unit', text: `${viewsWord(data.total || 0)} всего` })
    ]),

    series.length ? chart(series) : null,

    el('p', {
      class: 'hint',
      text: recent
        ? `За ${data.days} дней — ${recent} ${viewsWord(recent)}.`
        : `За ${data.days} дней страницу никто не открывал.`
    }),
    // Про способ подсчёта надо сказать честно: иначе цифра будет расходиться с
    // ожиданием «я сам открыл десять раз, где они».
    el('p', { class: 'hint', text: 'Один человек за день считается один раз. Роботов соцсетей, которые ходят за превью, не считаем.' }),
    heartsLine(data),
    linkClicks(data),
    analyticsBlock(data),
    milestonesToggle()
  ]);
}

const SOURCE_NAMES = {
  telegram: 'Telegram', tiktok: 'TikTok', discord: 'Discord', instagram: 'Instagram', youtube: 'YouTube',
  vk: 'ВКонтакте', x: 'X (Twitter)', search: 'Поиск', love: 'Сайт Love', direct: 'Напрямую и из приложений', other: 'Другие сайты'
};
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function bars(entries, top) {
  return el('div', { class: 'clicks' }, entries.map(([name, value]) => el('div', { class: 'click-row' }, [
    el('span', { class: 'click-name', text: name }),
    el('span', { class: 'click-bar' }, [el('i', { style: `width:${Math.round((value / Math.max(1, top)) * 100)}%` })]),
    el('span', { class: 'click-count', text: String(value) })
  ])));
}

/**
 * Аналитика (Pro). Часы сервер хранит по UTC — здесь сдвигаем их в часовой
 * пояс владельца, иначе «пик в 3 ночи» был бы чужим временем.
 */
function analyticsBlock(data) {
  if (!data.analytics) {
    return el('div', { class: 'clicks' }, [
      groupTitle('Аналитика'),
      el('p', { class: 'hint', text: 'Откуда приходят гости, в какие часы и дни заходят, сколько нажали «Написать в Love». Данные уже копятся.' }),
      lockNote(data.analyticsRequire || 'pro')
    ]);
  }
  const a = data.analytics;
  const sources = Object.entries(a.sources || {}).map(([key, value]) => [SOURCE_NAMES[key] || key, Number(value) || 0])
    .filter(([, value]) => value > 0).sort((x, y) => y[1] - x[1]);
  const offset = Math.round(-new Date().getTimezoneOffset() / 60);
  const hours = Array(24).fill(0), days = Array(7).fill(0);
  (a.week || []).forEach((value, utc) => {
    const local = ((utc + offset) % 168 + 168) % 168;
    hours[local % 24] += value;
    days[(Math.floor(local / 24) + 6) % 7] += value;       // 0 — воскресенье, в списке оно последнее
  });
  const peakHour = hours.indexOf(Math.max(...hours));
  const views = data.total || 0;
  const cta = a.cta || 0;
  const hourTop = Math.max(1, ...hours);
  return el('div', { class: 'analytics' }, [
    groupTitle('Аналитика'),
    el('div', { class: 'stat-top' }, [
      el('span', { class: 'stat-value', text: String(cta) }),
      el('span', { class: 'stat-unit', text: `нажали «Написать в Love»${views ? ` — ${Math.round((cta / views) * 100)}% гостей` : ''}` })
    ]),
    el('p', { class: 'field-label', text: 'Откуда пришли' }),
    sources.length ? bars(sources, sources[0][1]) : el('p', { class: 'hint', text: 'Пока нет данных.' }),
    el('p', { class: 'field-label', text: 'Когда заходят' }),
    el('div', { class: 'hours' }, hours.map((value, hour) => el('i', {
      class: value ? '' : 'is-empty',
      style: `height:${value ? Math.max(8, Math.round((value / hourTop) * 100)) : 4}%`,
      title: `${hour}:00 — ${value}`
    }))),
    el('div', { class: 'chart-axis' }, [el('span', { text: '0:00' }), el('span', { text: '12:00' }), el('span', { text: '23:00' })]),
    hours.some(Boolean) ? el('p', { class: 'hint', text: `Чаще всего — около ${peakHour}:00 по вашему времени.` }) : null,
    bars(WEEKDAYS.map((name, i) => [name, days[i]]), Math.max(1, ...days))
  ]);
}

function milestonesToggle() {
  return toggle({
    label: 'Сообщать о вехах в Love',
    hint: '«Вашу страницу открыли 1 000 раз», «100 сердечек» — придёт уведомлением в приложении.',
    checked: state.page.notifyMilestones !== false,
    onToggle: (on) => update({ notifyMilestones: on }, { now: true })
  });
}

function heartsLine(data) {
  if (!(state.page.hearts && state.page.hearts.enabled) && !data.hearts) return null;
  return el('div', { class: 'stat-hearts' }, [
    el('span', { class: 'stat-hearts-mark', text: '♥', 'aria-hidden': true }),
    el('span', { text: `${data.hearts || 0} — столько сердечек поставили гости` })
  ]);
}

/** Нажатия по каждой ссылке — Pro. Свои нажатия владельца не считаются. */
function linkClicks(data) {
  if (!Array.isArray(data.links)) {
    return el('div', { class: 'clicks' }, [
      groupTitle('Нажатия ссылок'),
      el('p', { class: 'hint', text: 'Сколько раз нажимали каждую ссылку.' }),
      lockNote(data.linksRequire || 'pro')
    ]);
  }
  if (!data.links.length) return null;
  const top = Math.max(1, ...data.links.map((link) => link.clicks || 0));
  return el('div', { class: 'clicks' }, [
    groupTitle('Нажатия ссылок'),
    ...data.links.map((link) => {
      let host = link.url;
      try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch (_) { /* покажем как есть */ }
      return el('div', { class: 'click-row' }, [
        el('span', { class: 'click-name', text: link.label || host }),
        el('span', { class: 'click-bar' }, [el('i', { style: `width:${Math.round(((link.clicks || 0) / top) * 100)}%` })]),
        el('span', { class: 'click-count', text: String(link.clicks || 0) })
      ]);
    }),
    el('p', { class: 'hint', text: 'Один посетитель по одной ссылке за день — одно нажатие.' })
  ]);
}
