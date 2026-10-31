(function () {
  'use strict';

  const state = {
    dmPeer: null,
    members: [],
    mediaModes: new Map(),
    remoteStreams: new Map(),
    localStream: null,
    localMode: 'none',
    focusedServerKey: null,
    theaterKey: null,
    theaterZoom: 1,
    theaterPanX: 0,
    theaterPanY: 0,
    avatarUrls: new Map()
  };

  const THEATER_MIN_ZOOM = 1;
  const THEATER_MAX_ZOOM = 4;

  const asId = value => String(value || '');

  // «Свой» участник определяется по userId; флагу isOwn верим только когда
  // сравнить id нечем. Иначе устаревший флаг в списке отдавал МОЙ локальный
  // поток в плитку собеседника — жмёшь свою камеру, мигает чужая.
  function isOwnMember(member) {
    const selfId = asId(window.currentUser?._id);
    const memberId = asId(member?.userId);
    if (selfId && memberId) return memberId === selfId;
    return !!member?.isOwn;
  }

  const mediaMode = member => {
    // Явный режим от сервера важнее кэша: кэш живёт до конца сессии и,
    // однажды выставленный, показывал камеру уже после её выключения.
    const explicit = member?.mediaMode;
    if (explicit === 'none' || explicit === 'camera' || explicit === 'screen') return explicit;
    const key = asId(member?.socketId || member?.userId);
    return state.mediaModes.get(key)
      || (member?.screenSharing || member?.hasShare ? 'screen' : member?.cameraOn || member?.hasCam ? 'camera' : 'none');
  };
  const displayName = member => member?.nickname || member?.username || member?.name || 'Участник';
  const initials = name => String(name || '?').trim().slice(0, 2).toUpperCase();

  function normalizeAvatar(value) {
    const raw = String(value || '').trim();
    const cssUrl = raw.match(/^url\(["']?(.*?)["']?\)$/i);
    return cssUrl ? cssUrl[1] : raw;
  }

  // Список участников приходит в двух формах: «сырой» с сервера (avatar — это
  // ссылка) и маппленный для констелляции (avatar — 1–2 буквы инициалов, а
  // ссылка лежит в avatarUrl). Инициалы нельзя отдавать в getAvatarUrl —
  // выходит битый /api/users/avatar/VE, картинка падает, и вместо аватарки
  // остаются буквы. Ровно поэтому аватарка появлялась только после мута:
  // voice:user_muted подсовывал сцене сырой список с настоящей ссылкой.
  const isAvatarRef = value => String(value || '').trim().length > 2;

  function avatarUrl(member) {
    const own = isOwnMember(member);
    const profileAvatar = own
      ? [document.getElementById('nav-profile-btn'), document.getElementById('profile-avatar-display')]
          .map(element => element ? getComputedStyle(element).backgroundImage : '')
          .find(value => value && value !== 'none')
      : '';
    const candidates = own
      ? [member?.avatarUrl, member?.avatar, window.currentUser?.avatar,
         window.currentUser?.avatarUrl, window.ownProfileData?.avatarUrl, profileAvatar]
      : [member?.avatarUrl, member?.avatar];
    const raw = candidates.map(normalizeAvatar).find(isAvatarRef) || '';
    if (!raw) return '';
    return typeof window.getAvatarUrl === 'function'
      ? window.getAvatarUrl(raw, displayName(member), member?.userId)
      : raw;
  }

  function setAvatar(avatar, member, key, name) {
    const cacheKey = asId(member?.userId || key);
    const nextUrl = avatarUrl(member) || state.avatarUrls.get(cacheKey) || '';
    avatar.dataset.avatarUrl = nextUrl;

    if (!nextUrl) {
      avatar.style.backgroundImage = '';
      avatar.classList.remove('has-image');
      avatar.textContent = initials(name);
      return;
    }

    state.avatarUrls.set(cacheKey, nextUrl);
    const applyImage = () => {
      if (avatar.dataset.avatarUrl !== nextUrl) return;
      avatar.style.backgroundImage = `url("${String(nextUrl).replace(/"/g, '%22')}")`;
      avatar.classList.add('has-image');
      avatar.textContent = '';
    };
    if (avatar.classList.contains('has-image') && avatar.style.backgroundImage.includes(nextUrl)) return;

    const image = new Image();
    image.onload = applyImage;
    image.onerror = () => {
      if (avatar.dataset.avatarUrl !== nextUrl) return;
      state.avatarUrls.delete(cacheKey);
      avatar.style.backgroundImage = '';
      avatar.classList.remove('has-image');
      avatar.textContent = initials(name);
    };
    image.src = nextUrl;
  }

  // Вертикальный кадр (экран или камера телефона) в горизонтальной плитке с
  // object-fit: cover терял верх и низ. Смотрим на настоящие размеры кадра:
  // вертикальное видео всегда вписываем целиком, как демонстрацию.
  function watchAspect(video) {
    if (video._loveAspect) return;
    video._loveAspect = true;
    const apply = () => {
      const portrait = !!video.srcObject && video.videoWidth > 0 && video.videoHeight > video.videoWidth * 1.05;
      video.classList.toggle('is-portrait', portrait);
      video.closest('.love-voice-tile, .video-stream-box')?.classList.toggle('has-portrait-media', portrait);
    };
    video.addEventListener('loadedmetadata', apply);
    video.addEventListener('resize', apply);
    video._loveAspectApply = apply;
  }

  function setVideo(video, stream, mode) {
    if (!video) return;
    watchAspect(video);
    video.muted = true;
    video.playsInline = true;
    video.classList.toggle('is-screenshare', mode === 'screen');
    if (video.srcObject !== stream) {
      video.srcObject = stream || null;
      if (stream) video.play().catch(() => {});
      video._loveAspectApply?.();
    }
  }

  function remoteDmEntry() {
    for (const [socketId, stream] of state.remoteStreams) {
      const mode = state.mediaModes.get(asId(socketId)) || 'camera';
      if (mode !== 'none') return { stream, mode };
    }
    return { stream: null, mode: 'none' };
  }

  // Звонок в ЛС рисуется той же сценой, что войс сферы: те же плитки, клик по
  // плитке разворачивает её в сетке, кнопка в углу открывает большой просмотр с
  // приближением. Участники здесь не с сервера, а собраны из собеседника и себя.
  const dmActive = () => {
    const channelId = asId(window.voiceManager?.channelId);
    return !!state.dmPeer && (!channelId || channelId.startsWith('dm_call:'));
  };

  function dmMembers() {
    const peer = state.dmPeer;
    if (!peer) return [];
    const selfId = asId(window.currentUser?._id) || 'dm-self';
    const live = id => state.members.find(member => asId(member?.userId) === id) || {};
    const remoteId = asId(peer.userId) || 'dm-peer';
    const remote = remoteDmEntry();
    return [
      { ...live(remoteId), userId: remoteId, isOwn: false, nickname: peer.name, avatar: peer.avatar, avatarUrl: peer.avatar, _media: { ...remote, own: false } },
      { ...live(selfId), userId: selfId, isOwn: true, nickname: window.currentUser?.nickname || window.currentUser?.username || 'Вы', _media: { stream: state.localStream, mode: state.localMode, own: true } }
    ];
  }

  function renderDm() {
    const grid = document.getElementById('call-tile-grid');
    const modal = document.getElementById('call-modal');
    if (!grid || !modal) return;
    // Свёрнутый звонок кадры не декодирует — как скрытый войс.
    if (modal.classList.contains('hidden')) {
      grid.querySelectorAll('video').forEach(video => { video.srcObject = null; });
      return;
    }
    document.getElementById('call-voice-profile')?.classList.add('hidden');
    renderTiles(grid, dmMembers());
  }

  function memberKey(member) {
    return asId(member?.userId || member?.socketId || member?.name);
  }

  function streamFor(member) {
    if (member?._media) {
      const media = member._media;
      const live = !!media.stream?.getVideoTracks().some(track => track.readyState === 'live');
      return live && media.mode !== 'none' ? media : { stream: null, mode: 'none', own: media.own };
    }
    const own = isOwnMember(member);
    const mode = mediaMode(member);
    if (own) {
      const manager = window.voiceManager;
      return {
        stream: mode === 'screen' ? manager?.screenStream : mode === 'camera' ? manager?.cameraStream : null,
        mode,
        own: true
      };
    }
    const socketId = asId(member?.socketId);
    return {
      stream: state.remoteStreams.get(socketId) || window.voiceManager?.remoteVideoStreams?.get(socketId) || null,
      mode,
      own: false
    };
  }

  const theaterEl = () => document.getElementById('voice-theater');
  const theaterOpen = () => !!theaterEl() && !theaterEl().classList.contains('hidden');
  const theaterShowsKey = key => theaterOpen() && state.theaterKey === key;

  function theaterMembers() {
    if (dmActive()) return dmMembers();
    const list = state.members.length
      ? state.members
      : (window.voiceManager?.channelMembers || window.voiceMembers || []);
    return list.filter(member => memberKey(member));
  }

  function theaterPick(key) {
    const members = theaterMembers();
    const wanted = members.find(member => memberKey(member) === key);
    const media = wanted ? streamFor(wanted) : null;
    if (wanted && media.stream && media.mode !== 'none') return { member: wanted, media };
    // Демку выключили — не оставляем чёрный экран, а переходим к тому, кто ещё
    // показывает; если таких нет, покажем подсказку.
    for (const member of members) {
      const next = streamFor(member);
      if (next.stream && next.mode !== 'none') return { member, media: next };
    }
    return { member: wanted || null, media: null };
  }

  function applyTheaterTransform() {
    const video = document.getElementById('voice-theater-video');
    const value = document.getElementById('voice-theater-zoom-reset');
    const stage = document.getElementById('voice-theater-stage');
    if (value) value.textContent = `${Math.round(state.theaterZoom * 100)}%`;
    stage?.classList.toggle('is-zoomed', state.theaterZoom > 1);
    if (!video) return;
    video.style.transform = `translate(${state.theaterPanX}px, ${state.theaterPanY}px) scale(${state.theaterZoom})`;
  }

  function setTheaterZoom(next, options = {}) {
    const clamped = Math.min(THEATER_MAX_ZOOM, Math.max(THEATER_MIN_ZOOM, Number(next) || 1));
    state.theaterZoom = clamped;
    if (clamped === 1 || options.resetPan) {
      state.theaterPanX = 0;
      state.theaterPanY = 0;
    }
    applyTheaterTransform();
  }

  function renderTheater() {
    const overlay = theaterEl();
    if (!overlay || overlay.classList.contains('hidden')) return;
    const video = document.getElementById('voice-theater-video');
    const empty = document.getElementById('voice-theater-empty');
    const title = document.getElementById('voice-theater-title');
    const strip = document.getElementById('voice-theater-strip');
    const picked = theaterPick(state.theaterKey);
    const active = !!picked.media?.stream;
    state.theaterKey = picked.member ? memberKey(picked.member) : null;

    setVideo(video, active ? picked.media.stream : null, picked.media?.mode);
    video?.classList.toggle('hidden', !active);
    empty?.classList.toggle('hidden', active);
    if (title) {
      const name = picked.member ? displayName(picked.member) : '';
      const kind = picked.media?.mode === 'screen' ? 'Демонстрация экрана' : picked.media?.mode === 'camera' ? 'Камера' : '';
      title.textContent = active ? `${kind} · ${name}` : 'Никто не показывает экран';
    }

    // Полоска: остальные участники. Живое <video> тут не держим — одновременный
    // декод нескольких потоков заметно греет машину, а нужно понимать «кто ещё
    // в канале» и уметь переключиться одним кликом.
    if (strip) {
      const members = theaterMembers();
      strip.innerHTML = '';
      members.forEach(member => {
        const key = memberKey(member);
        const media = streamFor(member);
        const hasMedia = !!media.stream && media.mode !== 'none';
        const name = displayName(member);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'voice-theater-chip';
        item.dataset.memberKey = key;
        item.classList.toggle('is-current', key === state.theaterKey && active);
        item.classList.toggle('has-media', hasMedia);
        item.disabled = !hasMedia;
        item.title = hasMedia ? `Показать: ${name}` : name;
        item.innerHTML = `
          <span class="voice-theater-chip-avatar"></span>
          <span class="voice-theater-chip-text">
            <span class="voice-theater-chip-name"></span>
            <span class="voice-theater-chip-mode"></span>
          </span>`;
        item.querySelector('.voice-theater-chip-name').textContent = name;
        item.querySelector('.voice-theater-chip-mode').textContent =
          media.mode === 'screen' ? 'Экран' : media.mode === 'camera' ? 'Камера' : 'В канале';
        setAvatar(item.querySelector('.voice-theater-chip-avatar'), member, key, name);
        item.addEventListener('click', () => openTheater(key));
        strip.appendChild(item);
      });
    }
    applyTheaterTransform();
  }

  function openTheater(key) {
    const overlay = theaterEl();
    if (!overlay) return;
    const wanted = asId(key);
    const picked = wanted ? null : theaterPick(null).member;
    state.theaterKey = wanted || (picked ? memberKey(picked) : null);
    overlay.classList.remove('hidden');
    setTheaterZoom(1, { resetPan: true });
    renderTheater();
    // Тот же поток в сетке под оверлеем декодировать незачем.
    renderServer();
    renderDm();
    // Просмотр — на весь экран, а не окном внутри приложения. Если система не
    // дала (нет разрешения, старая среда), остаётся на всё окно: стили те же.
    overlay.requestFullscreen?.().catch(() => {});
    wakeTheaterControls();
  }

  function closeTheater(render = true) {
    const overlay = theaterEl();
    if (!overlay) return;
    overlay.classList.add('hidden');
    const video = document.getElementById('voice-theater-video');
    if (video) video.srcObject = null;
    state.theaterKey = null;
    setTheaterZoom(1, { resetPan: true });
    clearTimeout(theaterIdleTimer);
    overlay.classList.remove('is-idle');
    if (document.fullscreenElement === overlay) document.exitFullscreen?.().catch(() => {});
    if (render) {
      renderServer();
      renderDm();
    }
  }

  // На весь экран панели не должны закрывать кадр: прячутся, пока мышь стоит.
  let theaterIdleTimer = null;
  function wakeTheaterControls() {
    const overlay = theaterEl();
    if (!overlay) return;
    overlay.classList.remove('is-idle');
    clearTimeout(theaterIdleTimer);
    theaterIdleTimer = setTimeout(() => overlay.classList.add('is-idle'), 2500);
  }

  function initTheater() {
    const overlay = theaterEl();
    if (!overlay) return;
    document.getElementById('voice-theater-close')?.addEventListener('click', closeTheater);
    document.getElementById('voice-theater-zoom-in')?.addEventListener('click', () => setTheaterZoom(state.theaterZoom + 0.25));
    document.getElementById('voice-theater-zoom-out')?.addEventListener('click', () => setTheaterZoom(state.theaterZoom - 0.25));
    document.getElementById('voice-theater-zoom-reset')?.addEventListener('click', () => setTheaterZoom(1, { resetPan: true }));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeTheater();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && theaterOpen()) closeTheater();
    });
    // Esc в полном экране система обрабатывает сама и keydown не присылает.
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && theaterOpen()) closeTheater();
    });
    overlay.addEventListener('pointermove', wakeTheaterControls);

    const stage = document.getElementById('voice-theater-stage');
    if (!stage) return;
    stage.addEventListener('wheel', event => {
      event.preventDefault();
      setTheaterZoom(state.theaterZoom + (event.deltaY < 0 ? 0.2 : -0.2));
    }, { passive: false });

    let drag = null;
    stage.addEventListener('pointerdown', event => {
      if (state.theaterZoom <= 1) return;
      drag = { x: event.clientX, y: event.clientY, panX: state.theaterPanX, panY: state.theaterPanY };
      stage.setPointerCapture?.(event.pointerId);
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', event => {
      if (!drag) return;
      // Ограничиваем сдвиг тем, что реально уехало за края при текущем зуме,
      // иначе кадр можно утащить в пустоту.
      const limitX = stage.clientWidth * (state.theaterZoom - 1) / 2;
      const limitY = stage.clientHeight * (state.theaterZoom - 1) / 2;
      state.theaterPanX = Math.max(-limitX, Math.min(limitX, drag.panX + (event.clientX - drag.x)));
      state.theaterPanY = Math.max(-limitY, Math.min(limitY, drag.panY + (event.clientY - drag.y)));
      applyTheaterTransform();
    });
    const endDrag = () => {
      drag = null;
      stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
  }

  function ensureServerTile(grid, key) {
    let tile = Array.from(grid.children).find(node => node.dataset?.memberKey === key);
    if (tile) return tile;
    tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'love-voice-tile';
    tile.dataset.memberKey = key;
    tile.innerHTML = `
      <video class="love-voice-tile-video" autoplay playsinline muted></video>
      <span class="love-voice-tile-placeholder"><span class="love-voice-tile-avatar"></span></span>
      <span class="love-voice-tile-expand" role="button" tabindex="0" title="Открыть в большом виде">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </span>
      <span class="love-voice-tile-footer">
        <span class="love-voice-tile-name"></span>
        <span class="love-voice-tile-mode"></span>
      </span>`;
    const expand = tile.querySelector('.love-voice-tile-expand');
    // Клик по плитке остаётся «развернуть в сетке» — большой просмотр это
    // отдельная кнопка, иначе одним жестом не выбрать между ними.
    expand?.addEventListener('click', event => {
      event.stopPropagation();
      if (tile.classList.contains('has-media')) openTheater(key);
    });
    expand?.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (tile.classList.contains('has-media')) openTheater(key);
    });
    tile.addEventListener('click', () => {
      if (!tile.classList.contains('has-media')) return;
      const toggle = () => {
        state.focusedServerKey = state.focusedServerKey === key ? null : key;
        renderServer();
        renderDm();
      };
      // Увеличение — это смена grid-column/grid-row, а её браузер не анимирует.
      // FLIP доводит плитки трансформом, иначе кадр просто перескакивает.
      if (typeof window.animateLayoutFlip === 'function') {
        window.animateLayoutFlip(grid.querySelectorAll('.love-voice-tile'), toggle, { duration: 380 });
      } else {
        toggle();
      }
    });
    return tile;
  }

  // Сцена живёт в двух местах: войс сферы и войс комнаты — это разные
  // контейнеры в разметке. Раньше рендер знал только серверный, и в комнате
  // оставался старый рендер орб-карточек, который клонируется через cloneNode
  // и физически не может держать живое <video> — отсюда заглушки вместо демок.
  function serverTarget() {
    const roomPane = document.getElementById('room-pane-voice');
    const roomGrid = document.getElementById('room-voice-grid-constellation');
    const roomConnected = !document.getElementById('room-voice-connected-bar')?.classList.contains('hidden');
    if (roomGrid && roomPane && !roomPane.classList.contains('pane-hidden') && roomConnected) {
      return { grid: roomGrid, countId: 'room-voice-preconnect-count' };
    }
    const panel = document.getElementById('server-voice-panel');
    const grid = document.getElementById('voice-grid-constellation');
    if (grid && panel && !panel.classList.contains('hidden')) {
      return { grid, countId: 'voice-member-count-text' };
    }
    return null;
  }

  function renderServer(members) {
    if (Array.isArray(members)) state.members = members.slice();
    const target = serverTarget();
    const channelId = String(window.voiceManager?.channelId || '');
    if (!target || !channelId || channelId.startsWith('dm_call:')) return false;
    const grid = target.grid;

    // Второй контейнер гасим: иначе в нём остаются плитки прошлой сессии с
    // живым srcObject — один и тот же поток декодируется дважды.
    ['voice-grid-constellation', 'room-voice-grid-constellation'].forEach(id => {
      const other = document.getElementById(id);
      if (!other || other === grid) return;
      other.querySelectorAll('.love-voice-tile').forEach(tile => {
        const video = tile.querySelector('video');
        if (video) video.srcObject = null;
        tile.remove();
      });
    });

    const list = state.members.length
      ? state.members
      : (window.voiceManager?.channelMembers || window.voiceMembers || []);
    renderTiles(grid, list);
    const count = document.getElementById(target.countId);
    if (count) count.textContent = `${list.length} в канале`;
    return true;
  }

  function renderTiles(grid, list) {
    const liveKeys = new Set();
    const ordered = [];

    grid.classList.add('love-voice-grid');
    grid.dataset.count = String(list.length);
    list.forEach(member => {
      const key = memberKey(member);
      if (!key) return;
      liveKeys.add(key);
      const tile = ensureServerTile(grid, key);
      const name = displayName(member);
      const media = streamFor(member);
      const active = !!media.stream && media.mode !== 'none';
      const video = tile.querySelector('.love-voice-tile-video');
      const avatar = tile.querySelector('.love-voice-tile-avatar');

      tile.classList.toggle('has-media', active);
      tile.classList.toggle('is-screen', media.mode === 'screen');
      tile.classList.toggle('is-focused', state.focusedServerKey === key && active);
      tile.classList.toggle('speaking', !!member?.speaking);
      tile.title = active ? 'Нажмите, чтобы развернуть или вернуть плитку' : name;
      // Пока кадр открыт в большом виде, второй декод того же потока не нужен.
      setVideo(video, active && !theaterShowsKey(key) ? media.stream : null, media.mode);
      tile.querySelector('.love-voice-tile-name').textContent = name + (member?.muted || member?.micActive === false ? ' · микрофон выключен' : '');
      tile.querySelector('.love-voice-tile-mode').textContent = media.mode === 'screen' ? 'Экран' : media.mode === 'camera' ? 'Камера' : '';
      setAvatar(avatar, member, key, name);
      ordered.push(tile);
    });

    // The legacy constellation renderer used the same container and leaves
    // `.voice-pcard` nodes behind. Keep this stage as the container's single
    // owner, otherwise a stale card is rendered alongside the new tile.
    Array.from(grid.children).forEach(node => {
      const isStageTile = node.classList.contains('love-voice-tile');
      const isCurrentMember = liveKeys.has(node.dataset?.memberKey);
      if (isStageTile && isCurrentMember) return;
      const video = node.querySelector('video');
      if (video) video.srcObject = null;
      node.remove();
    });
    // Ставим на место только то, что реально сдвинулось: перенос <video> в DOM
    // гасит кадр, а на каждом рендере это читалось как мигание плитки.
    ordered.forEach((tile, index) => {
      if (grid.children[index] !== tile) grid.insertBefore(tile, grid.children[index] || null);
    });
  }

  function openDm(peer) {
    state.dmPeer = peer || null;
    renderDm();
  }

  function setRemoteMedia(sourceId, stream, mode) {
    const key = asId(sourceId);
    if (!key) return;
    if (stream) state.remoteStreams.set(key, stream);
    if (mode) state.mediaModes.set(key, mode);
    renderDm();
    renderServer();
    renderTheater();
  }

  function removeRemoteMedia(sourceId) {
    const key = asId(sourceId);
    state.remoteStreams.delete(key);
    state.mediaModes.set(key, 'none');
    renderDm();
    renderServer();
    renderTheater();
  }

  function setLocalMedia(stream, mode) {
    state.localStream = stream || null;
    state.localMode = stream ? mode : 'none';
    renderDm();
    renderServer();
    renderTheater();
  }

  function updateMediaState(data) {
    const socketId = asId(data?.socketId);
    const userId = asId(data?.userId);
    const mode = ['none', 'camera', 'screen'].includes(data?.mode) ? data.mode : 'none';
    if (socketId) state.mediaModes.set(socketId, mode);
    if (userId) state.mediaModes.set(userId, mode);
    // replaceTrack может снова использовать тот же receiver без ontrack.
    // Режим none скрывает кадр, но сохраняет ссылку до ухода участника.
    state.members = state.members.map(member => {
      if (asId(member?.socketId) !== socketId && asId(member?.userId) !== userId) return member;
      return { ...member, mediaMode: mode, cameraOn: mode === 'camera', screenSharing: mode === 'screen' };
    });
    renderDm();
    renderServer();
    renderTheater();
  }

  function syncMembers(members) {
    state.members = Array.isArray(members) ? members.slice() : [];
    // Кэш режима держим под всеми ключами участника (socketId и userId) —
    // читается он по socketId, а писался раньше только по userId, из-за чего
    // запись из updateMediaState жила своей жизнью и залипала.
    state.members.forEach(member => {
      const mode = mediaMode(member);
      [memberKey(member), member?.socketId, member?.userId].forEach(id => {
        const key = asId(id);
        if (key) state.mediaModes.set(key, mode);
      });
    });
    renderDm();
    renderServer();
    renderTheater();
  }

  function reset() {
    state.remoteStreams.clear();
    state.mediaModes.clear();
    state.members = [];
    state.dmPeer = null;
    state.localStream = null;
    state.localMode = 'none';
    state.focusedServerKey = null;
    state.avatarUrls.clear();
    closeTheater(false);
    document.querySelectorAll('.call-live-video, .love-voice-tile-video, .voice-theater-video').forEach(video => { video.srcObject = null; });
    ['voice-grid-constellation', 'room-voice-grid-constellation'].forEach(id => {
      const grid = document.getElementById(id);
      if (grid) { grid.replaceChildren(); grid.dataset.count = '0'; }
    });
    ['voice-member-count-text', 'room-voice-preconnect-count'].forEach(id => {
      const count = document.getElementById(id);
      if (count) count.textContent = '0 в канале';
    });
    document.getElementById('call-tile-grid')?.replaceChildren();
  }

  function init() {
    document.getElementById('voice-stage-collapse')?.addEventListener('click', () => {
      document.getElementById('server-voice-panel')?.classList.add('hidden');
      document.getElementById('server-chat-panel')?.classList.remove('hidden');
      if (typeof window.updateVoiceMiniBar === 'function') window.updateVoiceMiniBar();
    });
    initTheater();
    // Старые кнопки «на весь экран» вели в мок-модалку с картинкой-заглушкой —
    // отсюда «при включении демки ничего не видно». Ведём их в живой просмотр.
    ['server-preview-expand', 'theater-toggle', 'room-theater-toggle'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openTheater();
      });
    });
    renderDm();
  }

  window.CallStageController = {
    openDm,
    renderDm,
    renderServer,
    setRemoteMedia,
    removeRemoteMedia,
    setLocalMedia,
    updateMediaState,
    syncMembers,
    openTheater,
    closeTheater,
    reset,
    getState: () => state
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
