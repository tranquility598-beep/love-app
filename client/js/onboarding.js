(function () {
  'use strict';

  if (window.LoveOnboarding) return;

  const ONBOARD_KEY = 'love_onboarding_done';
  const STAGE_ID = 'love-onboarding-stage';
  const SPOTLIGHT_ID = 'love-spotlight-onboarding';
  const TARGET_CLASS = 'love-spotlight-target-active';
  const INTRO_TEXT = 'Давайте пройдем небольшое обучение';
  const FINAL_TEXT = 'Добро пожаловать в Love!';

  const DESKTOP_STEPS = [
    {
      target: '#dm-btn',
      title: 'Навигация',
      text: 'Сердце возвращает к личным сообщениям и основному рабочему экрану.',
      action: 'click',
      before: resetToMainScreen
    },
    {
      target: '#dm-conversations, #dm-list, #dm-sidebar-view',
      title: 'Чаты',
      text: 'Здесь будут личные диалоги. Если список пустой, пользователь сможет быстро перейти к добавлению друзей.',
      action: 'next',
      before: resetToMainScreen
    },
    {
      target: '#servers-sidebar, #server-list, #add-entity-btn',
      title: 'Сферы и комнаты',
      text: 'Левая панель собирает серверы, комнаты и быстрые действия создания или входа по коду.',
      action: 'next',
      before: closeKnownOverlays
    },
    {
      target: '#add-entity-btn',
      title: 'Создание',
      text: 'Эта кнопка открывает создание сервера, комнаты или вход по приглашению.',
      action: 'click',
      before: closeKnownOverlays
    },
    {
      target: '#voice-panel, #mic-btn, #headset-btn, #room-voice-panel, #voice-view',
      title: 'Voice',
      text: 'Голос, микрофон, звук, камера и демонстрация экрана управляются из voice-панелей.',
      action: 'next',
      before: closeKnownOverlays
    },
    {
      target: '#friends-add-btn, .find-friends-btn, #friends-view',
      title: 'Друзья',
      text: 'Раздел друзей нужен для контактов, заявок и быстрого перехода к личным сообщениям.',
      action: 'next',
      before: openFriendsScreen
    },
    {
      target: '.account-settings-btn, #rail-settings-btn',
      title: 'Настройки',
      text: 'Шестеренка открывает настройки профиля, внешнего вида, уведомлений, приватности и голоса.',
      action: 'click',
      before: closeKnownOverlays
    },
    {
      target: '#settings-modal .settings-sidebar, #settings-profile, #settings-modal',
      title: 'Настройки профиля',
      text: 'Здесь меняются профиль, аккаунт, уведомления и поведение приложения.',
      action: 'next',
      before: openSettingsScreen
    },
    {
      target: '.user-panel-avatar, .user-panel-info, #rail-profile-btn, #user-panel-root, #profile-popover',
      title: 'Профиль',
      text: 'Аватар открывает карточку пользователя и быстрый вход в редактирование профиля.',
      action: 'click',
      before: closeKnownOverlays
    }
  ];

  const MOBILE_STEPS = [
    {
      target: '#dm-btn',
      title: 'Навигация',
      text: 'Сердце возвращает к личным сообщениям и главному рабочему экрану.',
      action: 'click',
      before: resetToMainScreen
    },
    {
      target: '#channels-sidebar, #dm-sidebar-view, #dm-list',
      title: 'Панель раздела',
      text: 'На мобильном экране эта область будет адаптироваться под чаты, сферы и комнаты.',
      action: 'next',
      before: resetToMainScreen
    },
    {
      target: '#servers-sidebar, #server-list, #add-entity-btn',
      title: 'Сферы',
      text: 'Здесь живут серверы и комнаты, а кнопка плюс открывает создание или вход по коду.',
      action: 'next',
      before: closeKnownOverlays
    },
    {
      target: '#voice-panel, #mic-btn, #headset-btn, #room-voice-panel, #voice-view',
      title: 'Voice',
      text: 'Микрофон, звук, камера и демонстрация должны работать одинаково на телефоне и Windows.',
      action: 'next',
      before: closeKnownOverlays
    },
    {
      target: '#friends-add-btn, .find-friends-btn, #friends-view',
      title: 'Друзья',
      text: 'Здесь будут контакты, заявки и кнопка добавления друзей.',
      action: 'next',
      before: openFriendsScreen
    },
    {
      target: '.account-settings-btn, #rail-settings-btn',
      title: 'Настройки',
      text: 'Настройки открывают профиль, уведомления, приватность, голос и внешний вид.',
      action: 'click',
      before: closeKnownOverlays
    },
    {
      target: '.user-panel-avatar, .user-panel-info, #rail-profile-btn, #user-panel-root, #profile-popover',
      title: 'Профиль',
      text: 'Аватар ведет к карточке профиля и быстрым действиям аккаунта.',
      action: 'click',
      before: closeKnownOverlays
    }
  ];

  let spotlightState = null;
  let introTimer = null;
  let finalTimers = [];

  function isDone() {
    try {
      const value = localStorage.getItem(ONBOARD_KEY);
      return value === '1' || value === 'true';
    } catch (error) {
      return false;
    }
  }

  function markDone() {
    try {
      localStorage.setItem(ONBOARD_KEY, '1');
    } catch (error) {}
  }

  function reset() {
    try {
      localStorage.removeItem(ONBOARD_KEY);
    } catch (error) {}
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  function getSteps() {
    return isMobile() ? MOBILE_STEPS : DESKTOP_STEPS;
  }

  function ensureStage() {
    let stage = document.getElementById(STAGE_ID);
    if (stage) return stage;

    stage = document.createElement('div');
    stage.id = STAGE_ID;
    stage.className = 'love-onboarding-stage hidden';
    stage.innerHTML = `
      <div class="love-onboarding-heart" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
        </svg>
      </div>
      <div class="love-onboarding-stage-text"></div>
      <button type="button" class="love-onboarding-skip">Пропустить обучение</button>
    `;
    document.body.appendChild(stage);
    return stage;
  }

  function clearIntroTimer() {
    if (introTimer) {
      clearTimeout(introTimer);
      introTimer = null;
    }
  }

  function clearFinalTimers() {
    finalTimers.forEach(timer => clearTimeout(timer));
    finalTimers = [];
  }

  function startIntro(options = {}) {
    if (!options.force && isDone()) return false;

    stop(false);
    clearFinalTimers();

    const stage = ensureStage();
    const text = stage.querySelector('.love-onboarding-stage-text');
    const skip = stage.querySelector('.love-onboarding-skip');
    let finished = false;

    document.body.classList.add('love-onboarding-stage-active');
    stage.className = 'love-onboarding-stage love-onboarding-intro';
    text.textContent = INTRO_TEXT;
    skip.hidden = false;

    const leaveIntro = (callback) => {
      if (finished) return;
      finished = true;
      clearIntroTimer();
      stage.classList.add('is-leaving');
      window.setTimeout(() => {
        stage.className = 'love-onboarding-stage hidden';
        document.body.classList.remove('love-onboarding-stage-active');
        callback();
      }, prefersReducedMotion() ? 80 : 420);
    };

    skip.onclick = () => {
      markDone();
      leaveIntro(() => showFinalWelcome());
    };

    introTimer = window.setTimeout(() => {
      leaveIntro(() => startSpotlight({ force: true }));
    }, prefersReducedMotion() ? 700 : 1800);

    return true;
  }

  function showFinalWelcome(options = {}) {
    clearIntroTimer();
    clearFinalTimers();
    cleanupSpotlightTarget();
    resetToMainScreen();

    if (options.markDone) markDone();

    const stage = ensureStage();
    const text = stage.querySelector('.love-onboarding-stage-text');
    const skip = stage.querySelector('.love-onboarding-skip');

    document.body.classList.add('love-onboarding-stage-active');
    stage.className = 'love-onboarding-stage love-onboarding-final';
    text.innerHTML = buildFinalText(options.text || FINAL_TEXT);
    skip.hidden = true;

    const hold = prefersReducedMotion() ? 1800 : (options.duration || 4300);
    finalTimers.push(window.setTimeout(() => {
      stage.classList.add('is-leaving');
      finalTimers.push(window.setTimeout(() => {
        stage.className = 'love-onboarding-stage hidden';
        document.body.classList.remove('love-onboarding-stage-active');
        resetToMainScreen();
      }, prefersReducedMotion() ? 80 : 650));
    }, hold));

    return true;
  }

  function buildFinalText(value) {
    let index = 0;
    return String(value).split(' ').map(word => {
      const letters = Array.from(word).map(char => {
        const safeChar = escapeHtml(char);
        return `<span class="love-glow-char" style="--i:${index++}" data-char="${safeChar}">${safeChar}</span>`;
      }).join('');
      return `<span class="love-glow-word">${letters}</span>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function ensureSpotlight() {
    if (spotlightState) return spotlightState;

    const root = document.createElement('div');
    root.id = SPOTLIGHT_ID;
    root.className = 'love-spotlight-onboarding hidden';
    root.innerHTML = `
      <div class="love-spotlight-scrim love-spotlight-scrim-top"></div>
      <div class="love-spotlight-scrim love-spotlight-scrim-right"></div>
      <div class="love-spotlight-scrim love-spotlight-scrim-bottom"></div>
      <div class="love-spotlight-scrim love-spotlight-scrim-left"></div>
      <div class="love-spotlight-ring" aria-hidden="true"></div>
      <section class="love-spotlight-card" role="dialog" aria-live="polite" aria-label="Обучение Love">
        <div class="love-spotlight-progress"><span></span></div>
        <div class="love-spotlight-count"></div>
        <h2 class="love-spotlight-title"></h2>
        <p class="love-spotlight-text"></p>
        <div class="love-spotlight-actions">
          <button type="button" class="love-spotlight-skip">Пропустить</button>
          <button type="button" class="love-spotlight-next">Далее</button>
        </div>
      </section>
    `;
    document.body.appendChild(root);

    spotlightState = {
      root,
      index: 0,
      steps: [],
      target: null,
      targetHandler: null,
      ring: root.querySelector('.love-spotlight-ring'),
      card: root.querySelector('.love-spotlight-card'),
      progress: root.querySelector('.love-spotlight-progress span'),
      count: root.querySelector('.love-spotlight-count'),
      title: root.querySelector('.love-spotlight-title'),
      text: root.querySelector('.love-spotlight-text'),
      next: root.querySelector('.love-spotlight-next'),
      skip: root.querySelector('.love-spotlight-skip'),
      scrims: {
        top: root.querySelector('.love-spotlight-scrim-top'),
        right: root.querySelector('.love-spotlight-scrim-right'),
        bottom: root.querySelector('.love-spotlight-scrim-bottom'),
        left: root.querySelector('.love-spotlight-scrim-left')
      }
    };

    spotlightState.next.addEventListener('click', nextSpotlightStep);
    spotlightState.skip.addEventListener('click', () => finishSpotlight(true));
    return spotlightState;
  }

  function startSpotlight(options = {}) {
    if (!options.force && isDone()) return false;

    clearIntroTimer();
    const state = ensureSpotlight();
    state.steps = Array.isArray(options.steps) && options.steps.length ? options.steps : getSteps();
    state.index = 0;

    document.body.classList.remove('love-onboarding-stage-active');
    document.body.classList.add('love-spotlight-active');
    state.root.classList.remove('hidden');
    state.root.classList.toggle('is-mobile', isMobile());

    window.addEventListener('resize', updateSpotlightLayout);
    window.addEventListener('orientationchange', updateSpotlightLayout);
    window.addEventListener('scroll', updateSpotlightLayout, true);

    showSpotlightStep(0);
    return true;
  }

  function showSpotlightStep(index) {
    const state = ensureSpotlight();
    cleanupSpotlightTarget();

    const steps = state.steps && state.steps.length ? state.steps : getSteps();
    state.steps = steps;
    state.index = Math.max(0, Math.min(index, steps.length - 1));

    const step = steps[state.index];
    if (!step) return finishSpotlight(false);
    if (typeof step.before === 'function') step.before();

    window.setTimeout(() => {
      const target = findTarget(step.target);
      if (!target) {
        nextSpotlightStep();
        return;
      }

      state.target = target;
      target.classList.add(TARGET_CLASS);
      state.title.textContent = step.title;
      state.text.textContent = step.text;
      state.count.textContent = `${state.index + 1} / ${steps.length}`;
      state.progress.style.width = `${((state.index + 1) / steps.length) * 100}%`;
      state.next.textContent = state.index === steps.length - 1 ? 'Готово' : 'Далее';
      state.next.hidden = step.action === 'click';

      if (step.action === 'click') {
        state.targetHandler = () => window.setTimeout(nextSpotlightStep, 180);
        target.addEventListener('click', state.targetHandler, { once: true });
      }

      updateSpotlightLayout();
    }, step.delay || 140);
  }

  function nextSpotlightStep() {
    const state = spotlightState;
    if (!state) return;
    const steps = state.steps && state.steps.length ? state.steps : getSteps();
    if (state.index >= steps.length - 1) {
      finishSpotlight(false);
      return;
    }
    showSpotlightStep(state.index + 1);
  }

  function finishSpotlight() {
    cleanupSpotlightTarget();
    markDone();

    if (spotlightState) {
      spotlightState.root.classList.add('hidden');
    }

    document.body.classList.remove('love-spotlight-active');
    window.removeEventListener('resize', updateSpotlightLayout);
    window.removeEventListener('orientationchange', updateSpotlightLayout);
    window.removeEventListener('scroll', updateSpotlightLayout, true);
    resetToMainScreen();
    showFinalWelcome();
  }

  function stop(clearFlag) {
    clearIntroTimer();
    clearFinalTimers();
    cleanupSpotlightTarget();

    const stage = document.getElementById(STAGE_ID);
    if (stage) stage.className = 'love-onboarding-stage hidden';
    if (spotlightState) spotlightState.root.classList.add('hidden');

    document.body.classList.remove('love-onboarding-stage-active', 'love-spotlight-active');
    window.removeEventListener('resize', updateSpotlightLayout);
    window.removeEventListener('orientationchange', updateSpotlightLayout);
    window.removeEventListener('scroll', updateSpotlightLayout, true);

    if (clearFlag) reset();
  }

  function cleanupSpotlightTarget() {
    const state = spotlightState;
    if (!state || !state.target) return;

    if (state.targetHandler) {
      state.target.removeEventListener('click', state.targetHandler);
    }

    state.target.classList.remove(TARGET_CLASS);
    state.target = null;
    state.targetHandler = null;
  }

  function findTarget(selector) {
    if (!selector) return null;
    for (const part of selector.split(',')) {
      const matches = document.querySelectorAll(part.trim());
      for (const el of matches) {
        if (isTargetUsable(el)) return el;
      }
    }
    return null;
  }

  function isTargetUsable(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0';
  }

  function updateSpotlightLayout() {
    const state = spotlightState;
    if (!state || !state.target || state.root.classList.contains('hidden')) return;

    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const rect = getSpotlightRect(state.target, viewportWidth, viewportHeight);
    const pad = Math.max(10, Math.min(18, viewportWidth * 0.025));
    const left = Math.max(8, rect.left - pad);
    const top = Math.max(8, rect.top - pad);
    const right = Math.min(viewportWidth - 8, rect.right + pad);
    const bottom = Math.min(viewportHeight - 8, rect.bottom + pad);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    setRect(state.scrims.top, 0, 0, viewportWidth, top);
    setRect(state.scrims.bottom, 0, bottom, viewportWidth, Math.max(0, viewportHeight - bottom));
    setRect(state.scrims.left, 0, top, left, height);
    setRect(state.scrims.right, right, top, Math.max(0, viewportWidth - right), height);
    setRect(state.ring, left, top, width, height);

    state.ring.style.borderRadius = Math.abs(width - height) < 10 && width <= 96 ? '50%' : '16px';

    const mobile = isMobile();
    const cardWidth = Math.min(360, viewportWidth - (mobile ? 24 : 28));
    state.card.style.width = `${cardWidth}px`;

    const cardRect = state.card.getBoundingClientRect();
    let cardLeft = right + 18;
    let cardTop = top + height / 2 - cardRect.height / 2;

    if (cardLeft + cardWidth > viewportWidth - 14) cardLeft = left - cardWidth - 18;
    if (cardLeft < 14) cardLeft = Math.max(14, Math.min(viewportWidth - cardWidth - 14, left));

    if (mobile) {
      cardLeft = 12;
      cardTop = bottom + 12;
      if (cardTop + cardRect.height > viewportHeight - 80) {
        cardTop = top - cardRect.height - 12;
      }
      if (cardTop < 12) {
        cardTop = Math.max(12, Math.min(viewportHeight - cardRect.height - 80, viewportHeight * 0.5 - cardRect.height * 0.5));
      }
    }

    const maxCardTop = (mobile ? viewportHeight - 80 : viewportHeight - 14) - cardRect.height;
    state.card.style.left = `${cardLeft}px`;
    state.card.style.top = `${Math.max(mobile ? 12 : 14, Math.min(maxCardTop, cardTop))}px`;
  }

  function getSpotlightRect(target, viewportWidth, viewportHeight) {
    const rect = target.getBoundingClientRect();
    const mobile = isMobile();
    const largeTarget = rect.width > viewportWidth * 0.74 || rect.height > viewportHeight * (mobile ? 0.34 : 0.52);
    const containerTarget = target.matches('#dm-list, #dm-sidebar-view, #servers-sidebar, #server-list, #friends-view, #settings-modal, #settings-profile, #room-voice-panel, #voice-view');

    if (!largeTarget && !containerTarget) return rect;

    const maxWidth = Math.min(rect.width, mobile ? viewportWidth - 34 : 460);
    const maxHeight = Math.min(rect.height, mobile ? 168 : 260);
    const left = rect.left + Math.max(0, (rect.width - maxWidth) / 2);
    const top = Math.max(12, Math.min(rect.top + 18, viewportHeight - maxHeight - (mobile ? 92 : 18)));

    return {
      left,
      top,
      right: left + maxWidth,
      bottom: top + maxHeight,
      width: maxWidth,
      height: maxHeight
    };
  }

  function setRect(el, left, top, width, height) {
    Object.assign(el.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`
    });
  }

  function closeKnownOverlays() {
    const profilePopover = document.getElementById('profile-popover');
    if (profilePopover) profilePopover.classList.add('hidden');

    const addEntityMenu = document.getElementById('add-entity-menu');
    if (addEntityMenu) addEntityMenu.classList.add('hidden');

    if (typeof window.closeModal === 'function') {
      try { window.closeModal('settings-modal'); } catch (error) {}
      try { window.closeModal('server-settings-modal'); } catch (error) {}
    }
  }

  function resetToMainScreen() {
    closeKnownOverlays();

    if (typeof window.showDMView === 'function') {
      try {
        window.showDMView();
      } catch (error) {}
    }

    if (typeof window.showWelcomeView === 'function') {
      try { window.showWelcomeView(); } catch (error) {}
    }
  }

  function openFriendsScreen() {
    closeKnownOverlays();
    if (typeof window.showFriendsView === 'function') {
      try { window.showFriendsView(); } catch (error) {}
    }
  }

  function openSettingsScreen() {
    const profilePopover = document.getElementById('profile-popover');
    if (profilePopover) profilePopover.classList.add('hidden');

    if (typeof window.showSettings === 'function') {
      try { window.showSettings(); } catch (error) {}
    }
  }

  window.LoveOnboarding = Object.freeze({
    key: ONBOARD_KEY,
    isDone,
    markDone,
    reset,
    startIntro,
    startSpotlight,
    showFinalWelcome,
    stop,
    getSteps
  });
})();
