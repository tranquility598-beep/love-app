/**
 * Блоки содержимого: галерея, приглашение в сферу, интересы, цитата, таймер.
 *
 * Порядок и видимость этих блоков настраиваются в «Порядке блоков»
 * (design.js), здесь — только их содержимое.
 */

import { $, fill, el, lockNote, toast } from './ui.js';
import { state, update, fieldError, feature, onChange } from './store.js';
import { api } from './api.js';
import { textField, textArea, ACCEPT } from './fields.js';

const limits = () => (state.caps && state.caps.limits) || {};
const errorLine = (...names) => {
  const message = names.map(fieldError).find(Boolean);
  return message ? el('p', { class: 'field-error', role: 'alert', text: message }) : null;
};

// ---------------------------------------------------------------------------
// Галерея
// ---------------------------------------------------------------------------

let galleryBusy = false;

export function renderGallery() {
  const rule = feature('gallery');
  const max = limits().gallery || 6;
  const shots = (state.page.gallery || []).slice();

  const setGallery = (next) => {
    update({ gallery: next }, { now: true });
    renderGallery();
  };

  const input = el('input', {
    type: 'file', accept: ACCEPT.image, hidden: true,
    onChange: async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (limits().assetBytes && file.size > limits().assetBytes) {
        toast(`Файл больше ${Math.round(limits().assetBytes / (1024 * 1024))} МБ`, 'err');
        return;
      }
      galleryBusy = true;
      renderGallery();
      try {
        const result = await api.upload('gallery', file);
        galleryBusy = false;
        setGallery([...(state.page.gallery || []), result.url].slice(0, max));
      } catch (error) {
        galleryBusy = false;
        toast(error.message || 'Не удалось загрузить фото', 'err');
        renderGallery();
      }
    }
  });

  const item = (url, index) => el('div', { class: 'gallery-item' }, [
    el('img', { src: url, alt: '', loading: 'lazy' }),
    el('div', { class: 'gallery-tools' }, [
      el('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', text: '←', title: 'Левее',
        disabled: index === 0,
        onClick: () => { const next = shots.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; setGallery(next); }
      }),
      el('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', text: '→', title: 'Правее',
        disabled: index === shots.length - 1,
        onClick: () => { const next = shots.slice(); [next[index + 1], next[index]] = [next[index], next[index + 1]]; setGallery(next); }
      }),
      el('button', {
        class: 'btn btn--ghost btn--icon', type: 'button', text: '✕', title: 'Убрать',
        onClick: () => setGallery(shots.filter((_, i) => i !== index))
      })
    ])
  ]);

  fill($('gallery-body'), [
    shots.length
      ? el('div', { class: 'gallery-edit' }, shots.map(item))
      : el('p', { class: 'hint', text: `Пока пусто. До ${max} фото: работы, поездки, котики — посетитель откроет любое крупно.` }),
    el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn btn--sm', type: 'button',
        text: galleryBusy ? 'Загружаем…' : 'Добавить фото',
        disabled: galleryBusy || !rule.allowed || shots.length >= max,
        onClick: () => input.click()
      }),
      input,
      shots.length >= max ? el('span', { class: 'hint', text: `Это предел: ${max} фото.` }) : null
    ]),
    rule.allowed ? null : lockNote(rule.requires),
    !rule.allowed && shots.length
      ? el('p', { class: 'lock lock--soft', text: 'Подписка закончилась: галерея на странице не показывается. Фото сохранены.' })
      : null,
    errorLine('gallery')
  ]);
}

// ---------------------------------------------------------------------------
// Приглашение в сферу
// ---------------------------------------------------------------------------

let inviteUnsubscribe = null;

export function renderInvite() {
  const status = el('div', { class: 'invite-now' });
  const input = el('input', {
    class: 'input', type: 'url', placeholder: 'ссылка-приглашение из Love',
    maxlength: 300, autocomplete: 'off', spellcheck: false,
    onKeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); put(); } }
  });

  function put() {
    const value = input.value.trim();
    if (!value) return;
    update({ invite: value }, { now: true });
    input.value = '';
  }

  // Название сферы приходит только с ответом сервера, а секции на успешное
  // сохранение не перерисовываются. Строку статуса обновляем сами.
  function paintStatus() {
    const invite = state.page.invite;
    if (typeof invite === 'string') {
      fill(status, [el('span', { class: 'hint', text: 'Проверяем приглашение…' })]);
      return;
    }
    if (!invite || !invite.code) {
      fill(status, [el('span', { class: 'hint', text: 'Карточки пока нет.' })]);
      return;
    }
    fill(status, [
      el('span', { class: 'invite-name', text: invite.name ? `На странице: «${invite.name}»` : `На странице: ${invite.code}` }),
      el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', text: 'Убрать',
        onClick: () => update({ invite: null }, { now: true })
      })
    ]);
  }

  if (inviteUnsubscribe) inviteUnsubscribe();
  inviteUnsubscribe = onChange((reason) => { if (reason === 'local') paintStatus(); });

  fill($('invite-body'), [
    el('p', { class: 'hint', text: 'Карточка «Вступить» в вашу сферу или комнату. В Love нажмите «Пригласить», скопируйте ссылку и вставьте сюда.' }),
    status,
    el('div', { class: 'invite-row' }, [
      input,
      el('button', { class: 'btn btn--sm', type: 'button', text: 'Поставить', onClick: put })
    ]),
    el('p', { class: 'hint', text: 'Название, иконка и число участников подтягиваются сами. Отзовёте приглашение — карточка исчезнет.' }),
    errorLine('invite')
  ]);
  paintStatus();
}

// ---------------------------------------------------------------------------
// Интересы, цитата, таймер
// ---------------------------------------------------------------------------

function quoteNow() {
  const quote = state.page.quote || {};
  return { text: quote.text || '', author: quote.author || '' };
}

function countdownNow() {
  const countdown = state.page.countdown || {};
  return { title: countdown.title || '', at: countdown.at || null };
}

/** ISO → значение для input[type=datetime-local] в часовом поясе человека. */
function localValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function renderMore() {
  const max = limits().tags || 12;
  const tagMax = limits().tagLength || 24;
  const tags = (state.page.tags || []).slice();
  const chips = el('div', { class: 'chips-edit' });

  const commitTags = () => update({ tags: tags.slice() }, { now: true });

  function paintChips() {
    fill(chips, tags.length
      ? tags.map((tag, index) => el('span', { class: 'chip-edit' }, [
        el('span', { text: tag }),
        el('button', {
          type: 'button', text: '×', 'aria-label': `Убрать «${tag}»`,
          onClick: () => { tags.splice(index, 1); paintChips(); commitTags(); }
        })
      ]))
      : [el('span', { class: 'hint', text: 'Пока пусто — на странице будут увлечения из профиля Love, если включён блок статуса.' })]);
  }

  const tagInput = el('input', {
    class: 'input', type: 'text', maxlength: tagMax,
    placeholder: 'кофе, сноуборд, lo-fi… и Enter', autocomplete: 'off',
    onKeydown: (event) => {
      if (event.key !== 'Enter' && event.key !== ',') return;
      event.preventDefault();
      const value = tagInput.value.replace(/,/g, ' ').trim();
      if (!value) return;
      if (tags.length >= max) { toast(`Интересов может быть до ${max}`, 'err'); return; }
      if (!tags.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase())) {
        tags.push(value);
        paintChips();
        commitTags();
      }
      tagInput.value = '';
    }
  });
  paintChips();

  const countdown = countdownNow();
  const when = el('input', {
    class: 'input input--date', type: 'datetime-local',
    value: localValue(countdown.at),
    onChange: (event) => {
      const value = event.target.value;
      update({ countdown: { ...countdownNow(), at: value ? new Date(value).toISOString() : null } }, { now: true });
    }
  });

  fill($('more-body'), [
    el('div', { class: 'field' }, [
      el('div', { class: 'field-top' }, [
        el('span', { class: 'field-label', text: 'Интересы' }),
        el('span', { class: 'counter', text: `${tags.length}/${max}` })
      ]),
      chips,
      tagInput,
      errorLine('tags')
    ]),

    textArea({
      label: 'Цитата',
      value: quoteNow().text,
      max: limits().quote || 240,
      rows: 3,
      placeholder: 'любимая фраза или девиз',
      error: fieldError('quote'),
      onInput: (value) => update({ quote: { ...quoteNow(), text: value } })
    }),
    textField({
      label: 'Автор цитаты',
      value: quoteNow().author,
      max: limits().quoteAuthor || 60,
      placeholder: 'можно оставить пустым',
      onInput: (value) => update({ quote: { ...quoteNow(), author: value } })
    }),

    textField({
      label: 'Таймер: до чего',
      value: countdown.title,
      max: limits().countdownTitle || 60,
      placeholder: 'например, до релиза трека',
      onInput: (value) => update({ countdown: { ...countdownNow(), title: value } })
    }),
    el('div', { class: 'field' }, [
      el('div', { class: 'field-top' }, [el('span', { class: 'field-label', text: 'Дата и время' })]),
      el('div', { class: 'invite-row' }, [
        when,
        countdown.at
          ? el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button', text: 'Убрать таймер',
            onClick: () => { update({ countdown: { title: '', at: null } }, { now: true }); renderMore(); }
          })
          : null
      ]),
      el('p', { class: 'hint', text: 'Время — ваше местное. Когда дата наступит, вместо цифр будет «Уже началось».' }),
      errorLine('countdown.at')
    ])
  ]);
}
