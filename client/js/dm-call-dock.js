/**
 * Звонок в ЛС — на месте чата, как войс в сферах.
 *
 * Раньше звонок открывался окном поверх всего приложения: ни списка бесед, ни
 * панели слева. На широком окне (≥1025px) окно звонка встаёт ровно на место
 * области чата — список и панель остаются под рукой. Уходишь в другой раздел
 * или открываешь другую беседу — звонок сворачивается в плашку (как войс
 * сферы), разворачиваешь плашку — он снова встаёт на место чата.
 *
 * Логику звонка не трогаем: только класс is-docked на #call-modal и его
 * координаты в CSS-переменных. На узком окне — прежнее окно.
 */
(function () {
  'use strict';

  const WIDE = window.matchMedia('(min-width: 1025px)');
  const modal = document.getElementById('call-modal');
  const chats = document.getElementById('view-chats');
  const pane = chats && chats.querySelector('.chat-area');
  if (!modal || !chats || !pane) return;

  const isOpen = () => !modal.classList.contains('hidden');
  const chatsShown = () => !chats.classList.contains('panel-hidden') && pane.getBoundingClientRect().width > 0;

  function place() {
    const r = pane.getBoundingClientRect();
    modal.style.setProperty('--dm-call-left', r.left + 'px');
    modal.style.setProperty('--dm-call-top', r.top + 'px');
    modal.style.setProperty('--dm-call-width', r.width + 'px');
    modal.style.setProperty('--dm-call-height', r.height + 'px');
  }

  function minimize() {
    document.getElementById('call-btn-minimize')?.click();
  }

  // Класс меняем только при настоящей смене: classList.add/remove переписывает
  // атрибут даже без изменений, наблюдатель снова звал бы sync — вечный цикл.
  function setDocked(on) {
    if (modal.classList.contains('is-docked') !== on) modal.classList.toggle('is-docked', on);
  }

  function sync() {
    // При каждом открытии/сворачивании: кадры идут, только пока звонок виден.
    window.CallStageController?.renderDm();
    // Кнопка войса на панели: свёрнутый звонок живёт в ней и в разделе бесед.
    window.updateVoiceMiniBar?.();
    if (!isOpen() || !WIDE.matches) {
      setDocked(false);
      return;
    }
    if (!chatsShown()) {
      // Звонок открылся (входящий, разворот плашки) в другом разделе —
      // переходим в беседы, там его место.
      document.getElementById('logo-nav-chats')?.click();
      requestAnimationFrame(sync);
      return;
    }
    place();
    setDocked(true);
  }

  // Наблюдатель срабатывает после текущего кода. Разворот из плашки меряет окно
  // сразу после снятия hidden, поэтому он зовёт sync сам (script.js).
  window.dmCallDock = { sync };
  new MutationObserver(sync).observe(modal, { attributes: true, attributeFilter: ['class'] });

  // Ушли из бесед — сворачиваем, как войс сферы.
  new MutationObserver(() => {
    if (modal.classList.contains('is-docked') && isOpen() && chats.classList.contains('panel-hidden')) minimize();
  }).observe(chats, { attributes: true, attributeFilter: ['class'] });

  // Открыли беседу из списка — показываем её, звонок уходит в плашку.
  document.addEventListener('click', event => {
    if (!modal.classList.contains('is-docked') || !isOpen()) return;
    if (event.target.closest('#view-chats .conversation-item')) minimize();
  }, true);

  // Свёрнутый звонок — как свёрнутый войс сферы: кнопка с микрофоном на левой
  // панели и её плашка «На связи». Своя плавающая плашка звонка на широком
  // окне спрятана стилями (calls.css). Кнопки плашки войса умеют только войс
  // сферы — для звонка в ЛС перехватываем их раньше (фаза захвата на window).
  const inDmCall = () => String(window.voiceManager?.channelId || window.currentVoiceChannel || '').startsWith('dm_call:');
  const press = id => document.getElementById(id)?.click();
  window.addEventListener('click', event => {
    if (!WIDE.matches || !inDmCall()) return;
    if (event.target.closest('#voice-dock-trigger')) {
      // Имя собеседника вместо «Голосовой канал»; ставим после штатного обработчика.
      setTimeout(() => {
        const name = document.getElementById('call-title-name')?.textContent || 'Звонок';
        const channel = document.getElementById('vmb-channel');
        if (channel) channel.textContent = name;
      }, 0);
      return;
    }
    const target = event.target.closest('#vmb-return, #vmb-mic, #vmb-leave');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (target.id === 'vmb-return') {
      if (!isOpen()) press('call-mini-expand');
      else sync();
    } else if (target.id === 'vmb-mic') {
      press('call-btn-mute');
      const muted = document.getElementById('call-btn-mute')?.classList.contains('muted-active');
      target.classList.toggle('muted-state', !!muted);
      target.querySelector('.vmb-icon-on')?.classList.toggle('hidden', !!muted);
      target.querySelector('.vmb-icon-off')?.classList.toggle('hidden', !muted);
      return;
    } else {
      press('btn-end-call');
    }
    document.getElementById('voice-dock-trigger')?.click();
  }, true);

  if (window.ResizeObserver) new ResizeObserver(() => { if (modal.classList.contains('is-docked')) place(); }).observe(pane);
  window.addEventListener('resize', sync);
  WIDE.addEventListener?.('change', sync);
})();
