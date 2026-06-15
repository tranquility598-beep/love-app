(function() {
  'use strict';

  const MAIN_VIEWS = [
    'welcome-view',
    'friends-view',
    'chat-view',
    'voice-view',
    'server-room-panel',
    'love-hub-view',
    'love-notifications-view'
  ];

  const ICONS = {
    heart: '<svg id="logo-icon-heart" class="logo-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    bubble: '<svg id="logo-icon-bubble" class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    servers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    friends: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    hub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    authHeart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function makeButton(id, title, icon, onClick, className = 'nav-btn') {
    let button = byId(id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = id;
    }
    button.className = className;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = icon;
    button.onclick = onClick;
    return button;
  }

  function installAppShellClasses() {
    byId('app')?.classList.add('new-design-app-root');
    document.querySelector('.app-layout')?.classList.add('app-container');

    const rail = byId('servers-sidebar');
    rail?.classList.add('global-sidebar');

    const channels = byId('channels-sidebar');
    channels?.classList.add('conversations-sidebar');

    byId('main-content')?.classList.add('new-design-main-host');
    byId('friends-view')?.classList.add('view-panel', 'friends-unified-panel');
    byId('chat-view')?.classList.add('view-panel', 'chat-area');
    byId('voice-view')?.classList.add('view-panel');
    byId('server-room-panel')?.classList.add('view-panel');
    byId('messages-list')?.classList.add('chat-feed');
    byId('message-input-area')?.classList.add('chat-input-area');
    document.querySelector('.message-input-wrapper')?.classList.add('message-input-form');

    const friendsHeader = document.querySelector('#friends-view .friends-header');
    friendsHeader?.classList.add('friends-unified-header');
    byId('friends-content')?.classList.add('friends-list-content');
    wrapFriendsPanel();
    adaptSettingsModal();

    const title = byId('channels-header-title');
    title?.classList.add('sidebar-title');

    const header = document.querySelector('#dm-sidebar-view .channels-header');
    header?.classList.add('sidebar-header');
    ensureCloseButton(header);

    const dmSearch = byId('dm-search-section');
    if (dmSearch) {
      dmSearch.classList.add('search-box');
      const button = dmSearch.querySelector('.find-friends-btn');
      if (button && !byId('new-design-dm-search')) {
        const input = document.createElement('input');
        input.id = 'new-design-dm-search';
        input.type = 'text';
        input.placeholder = 'поиск...';
        input.addEventListener('input', () => filterDMItems(input.value));
        dmSearch.insertBefore(input, button);
      }
    }

    byId('dm-conversations')?.classList.add('conversations-list');
    byId('server-sidebar-view')?.querySelector('.channels-header')?.classList.add('sidebar-header');
  }

  function installAuthDesign() {
    decorateAuthScreen('login-screen', 'login');
    decorateAuthScreen('register-screen', 'register');
    decorateAuthScreen('otp-screen', 'login');
    decorateAuthScreen('forgot-password-screen', 'login');
    decorateAuthScreen('reset-password-screen', 'login');
    decorateGoogleOnboarding();
  }

  function decorateAuthScreen(screenId, activeTab) {
    const screen = byId(screenId);
    const card = screen?.querySelector('.auth-card');
    if (!screen || !card || card.dataset.newDesignAuth === 'true') return;
    card.dataset.newDesignAuth = 'true';

    if (!screen.querySelector('.auth-orb')) {
      const bg = screen.querySelector('.auth-bg') || document.createElement('div');
      bg.classList.add('auth-bg');
      bg.innerHTML = '<span class="auth-orb auth-orb--1"></span><span class="auth-orb auth-orb--2"></span><span class="auth-orb auth-orb--3"></span><div class="auth-grain"></div>';
      if (!bg.parentNode) screen.prepend(bg);
    }

    const oldLogo = card.querySelector('.auth-logo');
    if (oldLogo) oldLogo.remove();

    const brand = document.createElement('div');
    brand.className = 'auth-brand';
    brand.innerHTML = `
      <span class="auth-brand-heart">${ICONS.authHeart}</span>
      <span class="auth-brand-name">L O V E</span>
      <span class="auth-brand-tag">мессенджер, сделанный с любовью</span>
    `;
    card.prepend(brand);

    if (screenId === 'login-screen' || screenId === 'register-screen') {
      const authSwitch = document.createElement('div');
      authSwitch.className = `auth-switch ${activeTab === 'register' ? 'is-register' : ''}`;
      authSwitch.innerHTML = `
        <span class="auth-switch-thumb"></span>
        <button type="button" class="auth-switch-btn ${activeTab === 'login' ? 'active' : ''}" data-auth-tab="login">Вход</button>
        <button type="button" class="auth-switch-btn ${activeTab === 'register' ? 'active' : ''}" data-auth-tab="register">Регистрация</button>
      `;
      authSwitch.querySelector('[data-auth-tab="login"]')?.addEventListener('click', () => {
        if (typeof window.showLogin === 'function') window.showLogin();
      });
      authSwitch.querySelector('[data-auth-tab="register"]')?.addEventListener('click', () => {
        if (typeof window.showRegister === 'function') window.showRegister();
      });
      brand.after(authSwitch);
    }

    card.querySelectorAll('.password-wrapper').forEach(wrapper => {
      wrapper.classList.add('auth-input-wrap');
    });
    card.querySelectorAll('.auth-btn.google-btn').forEach(button => {
      button.classList.add('auth-google');
    });
  }

  function decorateGoogleOnboarding() {
    const modal = byId('google-onboarding-modal');
    const card = modal?.querySelector('.modal');
    if (!card || card.dataset.newDesignAuth === 'true') return;
    card.dataset.newDesignAuth = 'true';
    card.classList.add('auth-card', 'auth-card--narrow');
    const header = card.querySelector('.modal-header');
    if (header && !card.querySelector('.auth-brand')) {
      const brand = document.createElement('div');
      brand.className = 'auth-brand';
      brand.innerHTML = `
        <span class="auth-brand-heart">${ICONS.authHeart}</span>
        <span class="auth-brand-name">Почти готово</span>
        <span class="auth-brand-tag">выберите имя пользователя</span>
      `;
      header.replaceWith(brand);
    }
    card.querySelector('.modal-footer')?.classList.add('auth-oauth-actions');
  }

  function wrapFriendsPanel() {
    const friends = byId('friends-view');
    if (!friends || friends.querySelector(':scope > .unified-glass-card')) return;
    const shell = document.createElement('div');
    shell.className = 'unified-glass-card';
    while (friends.firstChild) {
      shell.appendChild(friends.firstChild);
    }
    friends.appendChild(shell);
  }

  function adaptSettingsModal() {
    const modal = document.querySelector('#settings-modal .settings-modal');
    if (!modal) return;
    modal.classList.add('settings-shell');

    const sidebar = modal.querySelector('.settings-sidebar');
    if (sidebar && !sidebar.querySelector('.settings-sidebar-header')) {
      const header = document.createElement('div');
      header.className = 'settings-sidebar-header';
      const title = document.createElement('h2');
      title.className = 'settings-sidebar-title';
      title.textContent = 'Настройки';
      header.appendChild(title);
      sidebar.prepend(header);
    }

    modal.querySelector('.settings-close')?.classList.add('settings-close-btn');
    const content = modal.querySelector('.settings-content');
    if (content && !content.querySelector(':scope > .settings-content-scroll')) {
      const scroll = document.createElement('div');
      scroll.className = 'settings-content-scroll';
      Array.from(content.childNodes).forEach(node => scroll.appendChild(node));
      content.appendChild(scroll);
    }
  }

  function ensureCloseButton(header) {
    if (!header || header.querySelector('.mobile-only-toggle-close')) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sidebar-toggle-trigger mobile-only-toggle-close';
    close.title = 'Закрыть';
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = ICONS.close;
    close.addEventListener('click', closeSidebars);
    header.appendChild(close);
  }

  function filterDMItems(query) {
    const normalized = query.trim().toLowerCase();
    document.querySelectorAll('#dm-conversations .dm-item, #dm-conversations .conversation-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.classList.toggle('hidden', Boolean(normalized) && !text.includes(normalized));
    });
  }

  function installGlobalSidebar() {
    const rail = byId('servers-sidebar');
    if (!rail || byId('new-design-global-nav')) return;

    const dmButton = byId('dm-btn');
    if (dmButton) {
      dmButton.className = 'logo-nav-area active';
      dmButton.innerHTML = `${ICONS.heart}${ICONS.bubble}`;
      dmButton.title = 'Чаты и ЛС';
      dmButton.setAttribute('aria-label', 'Чаты и ЛС');
      dmButton.onclick = () => {
        if (typeof window.showDMView === 'function') window.showDMView();
        setActiveNav('dm');
        openSidebars();
      };
    }

    const nav = document.createElement('nav');
    nav.className = 'global-nav';
    nav.id = 'new-design-global-nav';
    nav.appendChild(makeButton('nav-servers', 'Серверы и комнаты', ICONS.servers, () => {
      if (typeof window.showDMView === 'function') window.showDMView();
      setActiveNav('servers');
      openSidebars();
    }));
    nav.appendChild(makeButton('nav-friends', 'Друзья', ICONS.friends, () => {
      if (typeof window.showFriendsView === 'function') window.showFriendsView();
      setActiveNav('friends');
      closeSidebars();
    }));
    nav.appendChild(makeButton('nav-hub', 'Love Hub', ICONS.hub, () => {
      showLoveHubView();
      closeSidebars();
    }));
    nav.appendChild(makeButton('nav-notifications', 'Уведомления', ICONS.bell, () => {
      showNotificationsView();
      closeSidebars();
    }));
    nav.appendChild(makeButton('mobile-more-trigger', 'Еще', ICONS.more, () => {
      rail.classList.toggle('more-open');
    }));

    const firstDivider = rail.querySelector('.servers-divider');
    if (firstDivider) {
      firstDivider.after(nav);
    } else if (dmButton) {
      dmButton.after(nav);
    } else {
      rail.prepend(nav);
    }

    let sidebarDivider = rail.querySelector('.sidebar-divider');
    if (!sidebarDivider) {
      sidebarDivider = document.createElement('div');
      sidebarDivider.className = 'sidebar-divider';
      nav.after(sidebarDivider);
    }

    const footer = document.createElement('div');
    footer.className = 'sidebar-footer';
    footer.id = 'new-design-sidebar-footer';
    footer.appendChild(makeButton('nav-settings', 'Настройки', ICONS.settings, () => {
      if (typeof window.showSettings === 'function') window.showSettings();
      rail.classList.remove('more-open');
    }));

    const profile = document.createElement('button');
    profile.type = 'button';
    profile.className = 'user-avatar-btn';
    profile.id = 'nav-profile-btn';
    profile.title = 'Мой профиль';
    profile.setAttribute('aria-label', 'Мой профиль');
    const letter = document.createElement('span');
    letter.className = 'avatar-letter';
    letter.textContent = getCurrentUserLetter();
    profile.appendChild(letter);
    profile.addEventListener('click', (event) => {
      if (typeof window.toggleProfilePopover === 'function') {
        window.toggleProfilePopover(event, profile);
      }
      rail.classList.remove('more-open');
    });
    footer.appendChild(profile);
    rail.appendChild(footer);
  }

  function getCurrentUserLetter() {
    const source = window.currentUser?.nickname || window.currentUser?.username || 'Я';
    return String(source).trim().charAt(0).toUpperCase() || 'Я';
  }

  function installSidebarToggle() {
    if (byId('new-design-sidebar-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'new-design-sidebar-toggle';
    button.className = 'sidebar-toggle-trigger';
    button.title = 'Скрыть/показать боковые панели';
    button.setAttribute('aria-label', 'Скрыть/показать боковые панели');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    button.addEventListener('click', () => {
      document.querySelector('.app-layout')?.classList.toggle('sidebar-collapsed');
    });
    byId('chat-view')?.prepend(button);
  }

  function openSidebars() {
    document.querySelector('.app-layout')?.classList.remove('sidebar-collapsed');
  }

  function closeSidebars() {
    if (window.matchMedia('(max-width: 900px)').matches) {
      document.querySelector('.app-layout')?.classList.add('sidebar-collapsed');
    }
  }

  function ensureMainView(id, classes) {
    const host = byId('main-content');
    if (!host) return null;
    let view = byId(id);
    if (!view) {
      view = document.createElement('div');
      view.id = id;
      view.className = classes;
      host.insertBefore(view, byId('members-sidebar') || null);
    }
    return view;
  }

  function installHubView() {
    const view = ensureMainView('love-hub-view', 'view-panel panel-hidden hidden');
    if (!view || view.dataset.newDesignReady === 'true') return;
    view.dataset.newDesignReady = 'true';

    const main = document.createElement('main');
    main.className = 'hub-bento-dashboard';
    main.style.width = '100%';
    main.style.height = '100%';
    main.style.padding = '40px';
    main.style.overflowY = 'auto';
    main.style.position = 'relative';

    main.innerHTML = `
      <header class="bento-header" style="margin-bottom:32px;display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <h1 class="sidebar-title" style="font-size:32px;font-family:var(--font-serif);margin-bottom:8px;">Love Hub</h1>
          <p style="color:var(--text-secondary);font-size:15px;">Центр управления сообществом и обновлениями</p>
        </div>
        <div class="hub-header-actions">
          <button class="hub-btn hub-btn-primary" id="hub-devlog-btn" type="button">Dev Log</button>
          <button class="hub-btn hub-btn-ghost" id="hub-view-updates-btn" type="button">История обновлений</button>
          <button class="hub-btn hub-btn-ghost" id="hub-suggest-btn" type="button">Предложить идею</button>
          <button class="hub-btn hub-btn-ghost" id="hub-report-bug-btn" type="button">Сообщить об ошибке</button>
        </div>
      </header>
      <div class="bento-grid">
        <div class="bento-card bento-hero" style="position:relative;">
          <span class="bento-corner-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span>
          <div class="bento-tag">Love App</div>
          <h2 id="hub-hero-title">Новый дизайн Love</h2>
          <p id="hub-hero-desc">Интерфейс переносится на визуальную систему sandbox/new-design, при этом рабочая авторизация, чаты, голос, настройки и защита остаются из основного клиента.</p>
          <div class="bento-hero-visual"><div class="bento-circle-accent"></div></div>
        </div>
        <div class="bento-card bento-stat">
          <h3>Статус</h3>
          <div class="stat-value">OK</div>
          <div class="stat-trend positive">Клиент защищен</div>
        </div>
        <div class="bento-card bento-idea">
          <div class="bento-header-row"><span class="bento-tag idea">Идеи</span></div>
          <h3>Предложения</h3>
          <p>Раздел будет подключен к API, когда появится рабочий endpoint.</p>
        </div>
        <div class="bento-card bento-actions">
          <h3>Полезное</h3>
          <div class="bento-action-links">
            <a href="#" id="hub-link-settings">Настройки профиля</a>
            <a href="#" id="hub-link-friends">Друзья</a>
            <a href="#" id="hub-link-create">Создать сферу</a>
          </div>
        </div>
        <div class="bento-card bento-minor">
          <div class="bento-tag update">Безопасность</div>
          <h3>Основная защита сохранена</h3>
          <p>DOMPurify, sanitize.js, API/token flow, socket и anti-spam логика остаются из рабочего клиента.</p>
        </div>
        <div class="bento-card bento-devlog" id="bento-devlog-card">
          <span class="bento-tag devlog">Dev Log</span>
          <h3>Этап переноса</h3>
          <p>Макет применяется как дизайн-слой, без подключения sandbox mock script.</p>
          <span class="bento-devlog-cta">Открыть настройки</span>
        </div>
      </div>
    `;
    view.appendChild(main);

    byId('hub-link-settings')?.addEventListener('click', (event) => {
      event.preventDefault();
      if (typeof window.showSettings === 'function') window.showSettings();
    });
    byId('hub-link-friends')?.addEventListener('click', (event) => {
      event.preventDefault();
      if (typeof window.showFriendsView === 'function') window.showFriendsView();
    });
    byId('hub-link-create')?.addEventListener('click', (event) => {
      event.preventDefault();
      byId('add-entity-btn')?.click();
    });
    byId('bento-devlog-card')?.addEventListener('click', () => {
      if (typeof window.showSettings === 'function') window.showSettings();
    });
  }

  function installNotificationsView() {
    const view = ensureMainView('love-notifications-view', 'view-panel panel-hidden hidden');
    if (!view || view.dataset.newDesignReady === 'true') return;
    view.dataset.newDesignReady = 'true';

    const main = document.createElement('main');
    main.className = 'notifications-unified-panel';
    main.innerHTML = `
      <div class="unified-glass-card">
        <header class="notifications-unified-header">
          <h1 class="friends-title">Уведомления</h1>
          <div class="notif-actions-top">
            <button class="notif-action-text-btn" id="mark-all-read-notifs" type="button">Прочитать<br>все</button>
            <button class="notif-action-text-btn" id="clear-all-notifs" type="button">Очистить<br>все</button>
          </div>
        </header>
        <div class="notifications-feed-list" id="notif-feed-container"></div>
      </div>
    `;
    view.appendChild(main);
    renderNotificationsEmpty();
    byId('clear-all-notifs')?.addEventListener('click', renderNotificationsEmpty);
    byId('mark-all-read-notifs')?.addEventListener('click', renderNotificationsEmpty);
  }

  function renderNotificationsEmpty() {
    const container = byId('notif-feed-container');
    if (!container) return;
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state-panel';
    const mark = document.createElement('div');
    mark.className = 'empty-state-mark';
    mark.textContent = '♡';
    const title = document.createElement('h3');
    title.textContent = 'Пусто';
    const desc = document.createElement('p');
    desc.textContent = 'Когда появятся уведомления, они будут здесь.';
    empty.append(mark, title, desc);
    container.appendChild(empty);
  }

  function hideAllMainViews(visibleId) {
    MAIN_VIEWS.forEach(id => {
      const element = byId(id);
      if (!element) return;
      const hidden = id !== visibleId;
      element.classList.toggle('hidden', hidden);
      element.classList.toggle('panel-hidden', hidden);
    });
  }

  function showLoveHubView() {
    installHubView();
    hideAllMainViews('love-hub-view');
    setActiveNav('hub');
    syncNavigationState('hub');
  }

  function showNotificationsView() {
    installNotificationsView();
    hideAllMainViews('love-notifications-view');
    setActiveNav('notifications');
    syncNavigationState('notifications');
  }

  function syncNavigationState(view) {
    window.currentView = view;
    if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
      try {
        window.NavigationController._commitState({
          currentView: view,
          currentDMConversation: null,
          currentServer: null,
          currentServerId: null,
          currentRoom: null
        }, `new-design-${view}`);
      } catch (error) {
        console.warn('[new-design] navigation sync skipped', error);
      }
    }
  }

  function wrapSwitchMainView() {
    const original = window.switchMainView;
    if (typeof original !== 'function' || original.__newDesignWrapped) return;
    const wrapped = function(visibleId) {
      original.call(this, visibleId);
      MAIN_VIEWS.forEach(id => {
        const element = byId(id);
        if (!element) return;
        const hidden = id !== visibleId;
        element.classList.toggle('hidden', hidden);
        element.classList.toggle('panel-hidden', hidden);
      });
      updateActiveFromView(visibleId);
    };
    wrapped.__newDesignWrapped = true;
    window.switchMainView = wrapped;
  }

  function setActiveNav(name) {
    document.querySelectorAll('.logo-nav-area, .nav-btn, .server-icon').forEach(item => {
      item.classList.remove('active');
    });
    const map = {
      dm: 'dm-btn',
      servers: 'nav-servers',
      friends: 'nav-friends',
      hub: 'nav-hub',
      notifications: 'nav-notifications'
    };
    byId(map[name])?.classList.add('active');
  }

  function updateActiveFromView(visibleId) {
    const map = {
      'friends-view': 'friends',
      'chat-view': 'dm',
      'welcome-view': 'dm',
      'voice-view': 'servers',
      'server-room-panel': 'servers',
      'love-hub-view': 'hub',
      'love-notifications-view': 'notifications'
    };
    setActiveNav(map[visibleId] || 'dm');
  }

  function exposeApi() {
    window.showLoveHubView = showLoveHubView;
    window.showNotificationsView = showNotificationsView;
    window.closeMobileSidebars = closeSidebars;
  }

  function init() {
    document.body.classList.add('new-design-client');
    installAuthDesign();
    installAppShellClasses();
    installGlobalSidebar();
    installSidebarToggle();
    installHubView();
    installNotificationsView();
    wrapSwitchMainView();
    exposeApi();
    updateActiveFromView(document.querySelector('#main-content > :not(.hidden)')?.id || 'friends-view');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
