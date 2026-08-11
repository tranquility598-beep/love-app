/**
 * Вкладка «Медиа» в комнатах.
 *
 * Отдельного хранилища файлов нет: всё, что загружали в комнату, лежит
 * во вложениях сообщений (Message.attachments). Поэтому вкладка просто
 * читает GET /api/messages/:channelId/media — сервер разворачивает
 * вложения в плоский список, новые сверху.
 *
 * До этого вкладка была статичной заглушкой с тремя выдуманными
 * именами файлов.
 */
(function () {
  'use strict';

  const PAGE_SIZE = 60;
  // Сколько страниц подряд дочитываем, если фильтр отсеял всё содержимое.
  const MAX_EMPTY_PAGES = 5;

  const state = {
    channelId: null,
    filter: 'all',
    items: [],
    nextBefore: null,
    loading: false
  };

  const el = {};

  function cache() {
    el.pane = document.getElementById('room-pane-media');
    el.grid = document.getElementById('room-media-grid');
    el.status = document.getElementById('room-media-state');
    el.more = document.getElementById('room-media-more');
    el.refresh = document.getElementById('room-media-refresh');
    return Boolean(el.pane && el.grid);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function humanSize(bytes) {
    const n = Number(bytes) || 0;
    if (!n) return '';
    if (n < 1024) return n + ' Б';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' КБ';
    return (n / (1024 * 1024)).toFixed(1) + ' МБ';
  }

  function shortDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso));
    } catch (e) {
      return '';
    }
  }

  // Текстовый канал активной комнаты — источник медиатеки.
  // Комната это тот же Server с одним text- и одним voice-каналом.
  function resolveChannelId() {
    const active = typeof window._getActiveState === 'function' ? window._getActiveState() : {};
    const servers = window._mockServers || {};
    const room = servers[active.activeServerId];
    const channel = room && (room.channels || []).find(ch => ch.type === 'text');
    return channel && channel._realId ? channel._realId : null;
  }

  function setStatus(text) {
    if (!el.status) return;
    if (!text) {
      el.status.classList.add('hidden');
      el.status.innerHTML = '';
      return;
    }
    el.status.classList.remove('hidden');
    el.status.innerHTML = `<span class="helper-text">${esc(text)}</span>`;
  }

  // ── Карточки ─────────────────────────────────────────────────────────────

  function buildCard(item) {
    const card = document.createElement('div');
    card.className = `media-card media-card-${esc(item.type)}`;
    card.dataset.url = item.url;
    card.dataset.type = item.type;
    card.dataset.name = item.name;

    const author = item.author ? (item.author.nickname || item.author.username || '') : '';
    const meta = [humanSize(item.size), shortDate(item.createdAt)].filter(Boolean).join(' · ');

    if (item.type === 'image') {
      card.innerHTML =
        `<div class="media-card-preview"><img src="${esc(item.url)}" alt="${esc(item.name)}" loading="lazy"></div>` +
        `<div class="media-card-meta"><span class="media-card-name">${esc(item.name)}</span><span class="media-card-sub">${esc(meta)}</span></div>`;
    } else if (item.type === 'video') {
      card.innerHTML =
        '<div class="media-card-preview media-preview-video">' +
          `<video src="${esc(item.url)}" preload="metadata" muted playsinline></video>` +
          '<span class="media-card-play">▶</span>' +
        '</div>' +
        `<div class="media-card-meta"><span class="media-card-name">${esc(item.name)}</span><span class="media-card-sub">${esc(meta)}</span></div>`;
    } else if (item.type === 'audio') {
      card.innerHTML =
        '<div class="media-card-preview media-preview-audio">' +
          `<audio src="${esc(item.url)}" controls preload="none"></audio>` +
        '</div>' +
        `<div class="media-card-meta"><span class="media-card-name">${esc(item.name)}</span><span class="media-card-sub">${esc(meta)}</span></div>`;
    } else {
      card.innerHTML =
        '<div class="media-card-preview media-preview-file">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        '</div>' +
        `<div class="media-card-meta"><span class="media-card-name">${esc(item.name)}</span><span class="media-card-sub">${esc(meta)}</span></div>`;
    }

    if (author) card.title = `${item.name} — ${author}`;
    return card;
  }

  function render() {
    if (!el.grid) return;
    el.grid.innerHTML = '';

    // Фильтрует сервер (?type=), поэтому items уже готовы к выводу.
    if (!state.items.length) {
      setStatus(state.filter === 'all'
        ? 'В комнате ещё нет файлов. Всё, что отправят в чат, появится здесь.'
        : 'В этой категории пока пусто.');
    } else {
      setStatus('');
      state.items.forEach(item => el.grid.appendChild(buildCard(item)));
    }

    if (el.more) {
      el.more.classList.toggle('hidden', !state.nextBefore);
    }
  }

  // ── Загрузка ─────────────────────────────────────────────────────────────

  async function load({ append = false } = {}) {
    if (state.loading) return;
    const channelId = resolveChannelId();

    if (!channelId) {
      state.items = [];
      state.nextBefore = null;
      if (el.grid) el.grid.innerHTML = '';
      setStatus('Комната ещё не загружена.');
      return;
    }

    // Смена комнаты — начинаем список заново.
    if (channelId !== state.channelId) {
      state.channelId = channelId;
      state.items = [];
      state.nextBefore = null;
      append = false;
    }

    if (typeof MessagesAPI === 'undefined' || !MessagesAPI.getMedia) {
      setStatus('Медиатека недоступна.');
      return;
    }

    state.loading = true;
    if (!append) setStatus('Загружаем медиатеку...');

    try {
      let before = append ? state.nextBefore : null;
      let collected = [];
      let cursor = null;

      // Страница считается по сообщениям, а фильтр применяется к вложениям,
      // поэтому под фильтром страница легко приходит пустой при живом
      // курсоре. Дочитываем — иначе «Показать ещё» щёлкает вхолостую.
      for (let page = 0; page < MAX_EMPTY_PAGES; page++) {
        const data = await MessagesAPI.getMedia(channelId, {
          type: state.filter === 'all' ? null : state.filter,
          before,
          limit: PAGE_SIZE
        });
        collected = collected.concat((data && data.items) || []);
        cursor = (data && data.nextBefore) || null;
        if (collected.length || !cursor) break;
        before = cursor;
      }

      state.items = append ? state.items.concat(collected) : collected;
      state.nextBefore = cursor;
      render();
    } catch (err) {
      console.error('[room-media] load failed:', err);
      setStatus('Не удалось загрузить медиатеку.');
    } finally {
      state.loading = false;
    }
  }

  // ── Просмотр ─────────────────────────────────────────────────────────────

  function openVideo(url, name) {
    const overlay = document.createElement('div');
    overlay.className = 'media-video-overlay';
    const box = document.createElement('div');
    box.className = 'media-video-box';

    // Тот же кастомный плеер, что и в ленте сообщений (горячие клавиши,
    // скорость, буфер). Голый <video controls> выглядел чужеродно.
    if (typeof window.buildVideoPlayer === 'function') {
      box.appendChild(window.buildVideoPlayer(url, name));
    } else {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      box.appendChild(video);
    }

    const caption = document.createElement('div');
    caption.className = 'media-video-name';
    caption.textContent = name || '';
    box.appendChild(caption);
    overlay.appendChild(box);

    const close = () => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);

    // Автоплей: кастомный плеер стартует с паузы.
    const videoEl = box.querySelector('video');
    if (videoEl) videoEl.play().catch(() => {});
  }

  function onGridClick(e) {
    const card = e.target.closest('.media-card');
    if (!card) return;
    // Плеер аудио обрабатывает клики сам.
    if (e.target.closest('audio')) return;

    const { url, type, name } = card.dataset;
    if (!url) return;

    if (type === 'image' && typeof window.openImageLightbox === 'function') {
      window.openImageLightbox(url);
    } else if (type === 'video') {
      openVideo(url, name);
    } else if (type !== 'audio') {
      // Файлы отдаются с Content-Disposition: attachment — просто открываем.
      window.open(url, '_blank', 'noopener');
    }
  }

  // Живое обновление: пока вкладка открыта, новое вложение в чате комнаты
  // должно появляться сразу. Подписку вешаем лениво — на момент
  // DOMContentLoaded window.socket ещё null (его ставит initSocket),
  // и при переподключении объект сокета создаётся заново.
  let boundSocket = null;

  function bindSocket() {
    const sock = window.socket;
    if (!sock || sock === boundSocket || typeof sock.on !== 'function') return;
    boundSocket = sock;

    sock.on('message:new', (data) => {
      if (!data || !data.message || !state.channelId) return;
      if (String(data.channelId) !== String(state.channelId)) return;
      if (!(data.message.attachments || []).length) return;
      if (el.pane && !el.pane.classList.contains('pane-hidden')) load();
    });
  }

  // ── Инициализация ────────────────────────────────────────────────────────

  function init() {
    if (!cache()) return;

    el.grid.addEventListener('click', onGridClick);

    // Кнопки ищем внутри панели: класс .media-filter общий, и если
    // медиатека появится ещё где-то, обработчики не должны пересечься.
    const filters = el.pane.querySelectorAll('.media-filter');
    filters.forEach(btn => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.mediaFilter || 'all';
        if (next === state.filter) return;
        filters.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = next;
        // Фильтр уходит в запрос, а пагинация идёт по сообщениям — курсор
        // от прошлой категории не переиспользуем.
        state.items = [];
        state.nextBefore = null;
        load();
      });
    });

    if (el.more) el.more.addEventListener('click', () => load({ append: true }));
    if (el.refresh) el.refresh.addEventListener('click', () => {
      state.nextBefore = null;
      load();
    });

    // Панель показывают из нескольких мест (вкладки комнаты и пункты
    // сайдбара), поэтому ловим сам факт показа, а не конкретную кнопку.
    let wasVisible = !el.pane.classList.contains('pane-hidden');
    const observer = new MutationObserver(() => {
      const visible = !el.pane.classList.contains('pane-hidden');
      if (visible === wasVisible) return;
      wasVisible = visible;
      if (!visible) return;
      bindSocket();
      state.nextBefore = null;
      load();
    });
    observer.observe(el.pane, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LoveRoomMedia = { reload: () => { state.channelId = null; load(); } };
})();
