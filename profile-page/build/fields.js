/**
 * Контролы редактора.
 *
 * Каждая функция возвращает готовый узел и ничего не знает про сохранение:
 * секция передаёт onInput/onToggle и сама решает, что положить в update().
 *
 * Правило про лимиты: maxlength ставится по лимиту тарифа, а не по лимиту базы.
 * Тогда лишний текст физически не набирается, и не приходится показывать
 * ошибку там, где хватает счётчика.
 */

import { el, fill, lockNote, toast } from './ui.js';

let seq = 0;
const uid = (prefix) => `${prefix}-${++seq}`;

function counterNode(value, max) {
  return el('span', { class: 'counter', text: `${[...String(value || '')].length}/${max}` });
}

function labelRow(label, right) {
  return el('div', { class: 'field-top' }, [
    el('span', { class: 'field-label', text: label }),
    right || null
  ]);
}

function extras({ hint, error }) {
  return [
    error ? el('p', { class: 'field-error', role: 'alert', text: error }) : null,
    hint ? el('p', { class: 'hint', text: hint }) : null
  ];
}

/**
 * Одна строка текста.
 * onInput(value) вызывается на каждый символ — дебаунс живёт в store.
 */
export function textField({ label, hint, value = '', max, placeholder, error, locked, requires, onInput }) {
  const id = uid('f');
  const counter = max ? counterNode(value, max) : null;

  const input = el('input', {
    class: `input${error ? ' is-bad' : ''}`,
    id,
    type: 'text',
    value: value || '',
    placeholder: placeholder || '',
    maxlength: max || null,
    disabled: Boolean(locked),
    autocomplete: 'off',
    spellcheck: false,
    onInput: (event) => {
      const next = event.target.value;
      if (counter) counter.textContent = `${[...next].length}/${max}`;
      if (onInput) onInput(next);
    }
  });

  return el('div', { class: `field${locked ? ' field--locked' : ''}` }, [
    el('label', { class: 'field-top', for: id }, [
      el('span', { class: 'field-label', text: label }),
      counter
    ]),
    input,
    locked ? lockNote(requires) : null,
    extras({ hint, error })
  ]);
}

/**
 * Многострочное поле. rows подбирается под лимит, чтобы не было пустой простыни.
 *
 * enforce: false нужно, когда в поле УЖЕ лежит текст длиннее лимита (набрали на
 * платном тарифе, потом подписка кончилась). maxlength в этом случае вреден: он
 * не обрезает готовое значение, но запрещает править середину текста, потому что
 * любой ввод превышает лимит. Счётчик при этом честно показывает перебор.
 */
export function textArea({ label, hint, value = '', max, enforce = true, placeholder, error, locked, requires, rows, onInput }) {
  const id = uid('t');
  const counter = max ? counterNode(value, max) : null;

  const area = el('textarea', {
    class: `textarea${error ? ' is-bad' : ''}`,
    id,
    rows: rows || (max && max > 300 ? 5 : 3),
    placeholder: placeholder || '',
    maxlength: max && enforce ? max : null,
    disabled: Boolean(locked),
    spellcheck: true,
    onInput: (event) => {
      const next = event.target.value;
      if (counter) {
        const length = [...next].length;
        counter.textContent = `${length}/${max}`;
        counter.classList.toggle('is-over', length > max);
      }
      if (onInput) onInput(next);
    }
  });
  area.value = value || '';
  if (counter && [...String(value || '')].length > max) counter.classList.add('is-over');

  return el('div', { class: `field${locked ? ' field--locked' : ''}` }, [
    el('label', { class: 'field-top', for: id }, [
      el('span', { class: 'field-label', text: label }),
      counter
    ]),
    area,
    locked ? lockNote(requires) : null,
    extras({ hint, error })
  ]);
}

/**
 * Переключатель.
 *
 * Заблокированный тарифом переключатель не прячем: человек должен видеть, что
 * возможность есть, иначе он будет её искать. Выключить уже включённое сервер
 * разрешает всегда — поэтому disabled ставится только когда возможность
 * выключена и включить её нельзя.
 *
 * Тонкость: если подписка кончилась, а настройка осталась включённой, человек
 * может её выключить — и вот тогда обратно уже нельзя. Гасим переключатель
 * сразу, не дожидаясь ответа сервера: иначе следующий клик уедет в отказ и
 * будет выглядеть как поломка.
 */
export function toggle({ label, hint, checked = false, locked, requires, error, onToggle }) {
  const id = uid('s');
  const lockedNote = locked ? lockNote(requires) : null;
  const soft = locked
    ? el('p', {
      class: 'lock lock--soft',
      text: 'Подписка закончилась: сейчас это не показывается на странице. Настройка сохранена.'
    })
    : null;
  if (lockedNote) lockedNote.hidden = Boolean(checked);
  if (soft) soft.hidden = !checked;

  const input = el('input', {
    class: 'switch-input',
    id,
    type: 'checkbox',
    checked: Boolean(checked),
    disabled: Boolean(locked) && !checked,
    onChange: (event) => {
      const on = event.target.checked;
      if (locked && !on) {
        input.disabled = true;
        if (lockedNote) lockedNote.hidden = false;
        if (soft) soft.hidden = true;
      }
      if (onToggle) onToggle(on);
    }
  });

  return el('div', { class: `field field--row${locked ? ' field--locked' : ''}` }, [
    el('label', { class: 'switch', for: id }, [
      input,
      el('span', { class: 'switch-track', 'aria-hidden': true }),
      el('span', { class: 'switch-text' }, [
        el('span', { class: 'switch-label', text: label }),
        hint ? el('span', { class: 'switch-hint', text: hint }) : null
      ])
    ]),
    lockedNote,
    soft,
    error ? el('p', { class: 'field-error', role: 'alert', text: error }) : null
  ]);
}

/** Заголовок группы внутри карточки. */
export function groupTitle(text) {
  return el('p', { class: 'group-title', text });
}

/**
 * Дата.
 *
 * Родной input[type=date] вместо своего календаря — по той же причине, что и с
 * цветом: на телефоне это системный выбор даты, который человек уже умеет
 * крутить. onPick отдаёт 'ГГГГ-ММ-ДД' или '' — секция сама решает, что это
 * значит.
 *
 * max ограничивает будущее прямо в браузере. Это удобство, а не проверка:
 * сервер всё равно посмотрит сам, но получить отказ после того, как выбрал
 * дату, — обидно и непонятно.
 */
export function dateField({ label, hint, value = '', max, min, error, locked, requires, onPick }) {
  const id = uid('d');

  const input = el('input', {
    class: `input input--date${error ? ' is-bad' : ''}`,
    id,
    type: 'date',
    value: value || '',
    max: max || null,
    min: min || null,
    disabled: Boolean(locked),
    onChange: (event) => { if (onPick) onPick(event.target.value); }
  });

  return el('div', { class: `field${locked ? ' field--locked' : ''}` }, [
    el('label', { class: 'field-top', for: id }, [
      el('span', { class: 'field-label', text: label })
    ]),
    input,
    locked ? lockNote(requires) : null,
    extras({ hint, error })
  ]);
}

// ---------------------------------------------------------------------------
// Выбор из справочника
// ---------------------------------------------------------------------------

/**
 * Плитки выбора: тема, раскладка, шрифт, рамка, эффект.
 *
 * items — как их отдал сервер в capabilities: { id, name, tier, allowed, ... }.
 * Закрытые тарифом варианты остаются на виду и не гаснут до неразличимости:
 * человек должен видеть, за что предлагают заплатить, — иначе он просто не
 * узнает, что там что-то есть. Клик по такому варианту ничего не сохраняет, но и
 * не молчит: мёртвая кнопка без объяснения читается как поломка.
 *
 * fallbackName нужен для честности после понижения тарифа. Сервер в этом случае
 * показывает посетителю первый вариант каталога, а в редакторе выбранным
 * остаётся прежний — если об этом не сказать, человек будет уверен, что на
 * странице до сих пор его тема.
 */
export function choicePicker({
  label, hint, items = [], value, error, wide, preview, onPick
}) {
  const active = items.find((item) => item.id === value) || null;
  const fallbackName = items.length ? items[0].name : '';
  const downgraded = Boolean(active && active.allowed === false && active.id !== items[0]?.id);

  const tiles = items.map((item) => {
    const locked = item.allowed === false;
    const on = item.id === value;
    return el('button', {
      class: `pick${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}`,
      type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      dataset: { id: item.id },
      onClick: (event) => {
        if (locked) {
          toast(`«${item.name}» — в ${item.tier === 'premium' ? 'Love Premium' : 'Love Pro'}`, 'err');
          return;
        }
        const tile = event.currentTarget;
        if (tile.classList.contains('is-on')) return;
        // Отметку переносим сами, не дожидаясь ответа сервера: секции не
        // перерисовываются после локальной правки (иначе редактор уводил бы
        // фокус из текстовых полей), и без этого выбор визуально не двигался бы.
        markActive(tile);
        if (onPick) onPick(item.id);
      }
    }, [
      preview ? preview(item) : null,
      el('span', { class: 'pick-name', text: item.name }),
      locked ? el('span', { class: 'pick-lock', text: '🔒', 'aria-hidden': true }) : null
    ]);
  });

  function markActive(tile) {
    tiles.forEach((node) => {
      const on = node === tile;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  return el('div', { class: 'field' }, [
    labelRow(label),
    el('div', { class: `picks${wide ? ' picks--wide' : ''}` }, tiles),
    downgraded
      ? el('p', {
        class: 'lock lock--soft',
        text: `Подписка закончилась: на странице сейчас «${fallbackName}». Выбор сохранён.`
      })
      : null,
    extras({ hint, error })
  ]);
}

// ---------------------------------------------------------------------------
// Выбор из длинного списка
// ---------------------------------------------------------------------------

/**
 * Родной select.
 *
 * Плитками, как темы, здесь не получится: иконок двадцать шесть, и в каждой
 * строке ссылок своя. Родной список к тому же ищется набором с клавиатуры и на
 * телефоне открывается системным колесом — своей реализацией это не побить.
 */
export function selectField({ value, options = [], disabled, title, ariaLabel, onPick }) {
  return el('select', {
    class: 'select',
    disabled: Boolean(disabled),
    title: title || '',
    'aria-label': ariaLabel || title || '',
    onChange: (event) => { if (onPick) onPick(event.target.value); }
  }, options.map((item) => el('option', {
    value: item.id,
    text: item.name,
    selected: item.id === value
  })));
}

// ---------------------------------------------------------------------------
// Цвет
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const segments = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = segments[Math.floor(h / 60) % 6];
  const to = (v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Второй цвет градиента по умолчанию.
 *
 * Ставить вторым цветом тот же самый нельзя: человек включает «градиент», на
 * странице ничего не меняется, и он думает, что кнопка не работает. Сдвиг по
 * кругу даёт заметный, но всегда сочетающийся переход.
 */
export function shiftHue(hex, deg = 40) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return hslToHex((h * 360 + deg + 360) % 360, s, l);
}

/**
 * Кружок выбора цвета.
 *
 * Родной input[type=color] вместо своей палитры — сознательно: на телефоне это
 * системный выбор цвета, к которому человек привык, и он работает без единой
 * строчки нашего кода. Рядом показываем hex, потому что цвет надо уметь
 * назвать — например, чтобы повторить его в оформлении канала.
 *
 * onPick вызывается на каждое движение по палитре; дебаунс живёт в store.
 */
export function colorInput({ value, fallback = '#7c5cff', disabled, title, onPick }) {
  const shown = hexToRgb(value) ? String(value).toLowerCase() : fallback;
  const label = el('span', { class: 'color-hex', text: shown });

  const input = el('input', {
    class: 'color-dot',
    type: 'color',
    value: shown,
    disabled: Boolean(disabled),
    title: title || '',
    onInput: (event) => {
      const next = String(event.target.value).toLowerCase();
      label.textContent = next;
      if (onPick) onPick(next);
    }
  });

  return el('span', { class: `color${disabled ? ' is-off' : ''}` }, [input, label]);
}

// ---------------------------------------------------------------------------
// Ползунок
// ---------------------------------------------------------------------------

/**
 * Ползунок.
 *
 * Значение показываем цифрой рядом с названием: «размытие» без числа
 * невозможно повторить, а человек регулярно хочет вернуть как было.
 */
export function slider({ label, value = 0, min = 0, max = 100, step = 1, unit = '', disabled, hint, onInput }) {
  const id = uid('r');
  const out = el('span', { class: 'counter', text: `${value}${unit}` });

  const range = el('input', {
    class: 'range',
    id,
    type: 'range',
    min, max, step,
    value,
    disabled: Boolean(disabled),
    onInput: (event) => {
      const next = Number(event.target.value);
      out.textContent = `${next}${unit}`;
      if (onInput) onInput(next);
    }
  });

  return el('div', { class: 'field' }, [
    el('label', { class: 'field-top', for: id }, [
      el('span', { class: 'field-label', text: label }),
      out
    ]),
    range,
    extras({ hint })
  ]);
}

// ---------------------------------------------------------------------------
// Файлы
// ---------------------------------------------------------------------------

/**
 * Что предлагать в диалоге выбора файла.
 *
 * Список повторяет проверку в server/utils/profileMedia. accept — это удобство,
 * а не защита, но расходиться с сервером ему нельзя: иначе человек выберет
 * файл, дождётся загрузки и получит отказ.
 */
export const ACCEPT = {
  image: 'image/jpeg,image/png,image/webp,image/gif',
  video: 'video/mp4,video/webm',
  audio: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav'
};

const asMb = (bytes) => Math.round(bytes / (1024 * 1024));

function kindOfFile(file) {
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'image';
}

/**
 * Загрузка файла: аватар, баннер, фон, трек, превью для мессенджеров.
 *
 * Файл сначала уезжает в POST /asset и только потом его адрес сохраняется в
 * странице — это два запроса, и между ними человеку надо что-то показывать.
 * Показываем сам файл: пока идёт загрузка, превью рисуется из blob-ссылки на
 * выбранный файл (CSP редактора это разрешает), поэтому картинка появляется
 * сразу, а не через десять секунд ожидания.
 *
 * Размер и тип проверяем и здесь, до отправки. Не ради безопасности — сервер
 * всё равно проверит, — а чтобы не гнать по мобильной сети десять мегабайт,
 * которые заведомо отклонят.
 *
 * guard(file) — правило слота, которое не выразить через accept: например, гиф
 * на аватар пускают только с Pro. Возвращает текст отказа или null.
 */
export function mediaField({
  label, hint, url, kind = 'image', accept = ACCEPT.image, shape = 'wide',
  empty = 'ничего не загружено', maxBytes, locked, requires, error, softNote,
  guard, upload, onDone, onClear
}) {
  const node = el('div', { class: `field${locked ? ' field--locked' : ''}` });
  let shown = { url: url || null, kind };
  let good = { url: url || null, kind };   // к чему возвращаться, если не вышло
  let blobUrl = null;
  let busy = false;
  let problem = null;

  const input = el('input', {
    class: 'file-input',
    type: 'file',
    accept,
    onChange: (event) => {
      const file = event.target.files && event.target.files[0];
      // Сбрасываем значение сразу: иначе повторный выбор того же файла не даёт
      // события, и после ошибки человек не может попробовать ещё раз.
      event.target.value = '';
      if (file) send(file);
    }
  });

  function setShown(next) {
    shown = next;
    if (blobUrl && next.url !== blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
  }

  async function send(file) {
    problem = (maxBytes && file.size > maxBytes)
      ? `Файл больше ${asMb(maxBytes)} МБ — на вашем тарифе это предел`
      : (guard ? guard(file) : null);
    if (problem) {
      paint();
      return;
    }

    blobUrl = URL.createObjectURL(file);
    shown = { url: blobUrl, kind: kindOfFile(file) };
    busy = true;
    paint();

    try {
      const result = await upload(file);
      good = { url: result.url, kind: result.kind };
      setShown(good);
      busy = false;
      paint();
      if (onDone) onDone(result);
    } catch (failure) {
      busy = false;
      problem = failure.message || 'Не удалось загрузить файл';
      setShown(good);
      paint();
    }
  }

  function preview() {
    if (!shown.url) return el('span', { class: 'media-empty', text: empty });
    if (shape === 'audio') {
      return el('audio', { class: 'media-audio', src: shown.url, controls: true, preload: 'metadata' });
    }
    if (shown.kind === 'video') {
      // muted + preload=metadata: нужен первый кадр, а не проигрывание десяти
      // мегабайт видео в редакторе.
      return el('video', {
        class: 'media-shot', src: shown.url,
        muted: true, playsinline: true, preload: 'metadata', tabindex: -1
      });
    }
    return el('img', { class: 'media-shot', src: shown.url, alt: '' });
  }

  function paint() {
    fill(node, [
      labelRow(label),
      el('div', { class: `media media--${shape}` }, [
        el('div', { class: 'media-box' }, [
          preview(),
          busy ? el('span', { class: 'media-veil', text: 'загружаем…' }) : null
        ]),
        el('div', { class: 'media-side' }, [
          el('button', {
            class: 'btn btn--sm',
            type: 'button',
            text: shown.url ? 'Заменить' : 'Загрузить',
            disabled: busy || Boolean(locked),
            onClick: () => input.click()
          }),
          shown.url
            ? el('button', {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              text: 'Убрать',
              // Убрать сервер разрешает на любом тарифе — поэтому кнопка живая
              // даже когда подписка кончилась и загрузить новое нельзя.
              disabled: busy,
              onClick: () => {
                setShown({ url: null, kind });
                good = { url: null, kind };
                problem = null;
                paint();
                if (onClear) onClear();
              }
            })
            : null
        ])
      ]),
      locked && !shown.url ? lockNote(requires) : null,
      locked && shown.url && softNote ? el('p', { class: 'lock lock--soft', text: softNote }) : null,
      extras({ hint, error: problem || error }),
      input
    ]);
  }

  paint();
  return node;
}
