// LOVE — логика экрана звонка на ПК (мобильный стиль)
// Подключить после разметки из call-screen-markup.html и call-screen.css.

/* =============================
   Кнопки нижней панели
   ============================= */

// TODO(Claude Code): прокинуть реальные функции проекта.
function bindCallControls({ onToggleMic, onToggleCamera, onToggleShare, onFullscreen, onHangup }) {
  const micBtn = document.getElementById('ctl-mic');
  const camBtn = document.getElementById('ctl-cam');
  const shareBtn = document.getElementById('ctl-share');
  const fsBtn = document.getElementById('ctl-fullscreen');
  const endBtn = document.getElementById('ctl-hangup');

  micBtn.addEventListener('click', async () => {
    const muted = await onToggleMic();
    micBtn.classList.toggle('is-off', muted);
    micBtn.textContent = muted ? '\u{1F507}' : '\u{1F3A4}';
  });

  camBtn.addEventListener('click', async () => {
    const off = await onToggleCamera();
    camBtn.classList.toggle('is-off', off);
  });

  shareBtn.addEventListener('click', async () => {
    const sharing = await onToggleShare();
    shareBtn.classList.toggle('is-active', sharing);
  });

  fsBtn.addEventListener('click', onFullscreen);
  endBtn.addEventListener('click', onHangup);
}

/* =============================
   Плитки медиа (камера/демка)
   ============================= */

function createMediaTile({ id, stream, label, isShare }) {
  const grid = document.getElementById('call-grid');
  let tile = document.getElementById(id);
  if (!tile) {
    tile = document.createElement('div');
    tile.id = id;
    tile.className = 'media-tile';
    tile.innerHTML =
      '<video autoplay playsinline></video>' +
      '<div class="tile-label"></div>' +
      '<div class="tile-expand-hint">\u2922</div>';
    grid.appendChild(tile);
  }
  const video = tile.querySelector('video');
  video.srcObject = stream;
  if (!isShare) video.muted = true; // звук идёт отдельным аудиотреком
  tile.querySelector('.tile-label').textContent = label;
  tile.onclick = () => expandMedia(stream, label);
  return tile;
}

function showRemoteShareTile(stream, userLabel) {
  return createMediaTile({
    id: 'tile-share-' + stream.id,
    stream,
    label: '\u0414емонстрация — ' + (userLabel || ''),
    isShare: true,
  });
}

function removeRemoteShareTile(userLabelOrId) {
  document
    .querySelectorAll('[id^="tile-share-"]')
    .forEach((el) => el.remove()); // TODO: точечное удаление по userId, если демок несколько
}

function showRemoteCameraTile(stream, userLabel) {
  return createMediaTile({
    id: 'tile-cam-' + stream.id,
    stream,
    label: userLabel || '\u0423частник',
    isShare: false,
  });
}

/* =============================
   Полноэкранный просмотр с зумом и перетаскиванием
   ============================= */

function expandMedia(stream, label) {
  const overlay = document.createElement('div');
  overlay.className = 'media-lightbox';
  overlay.innerHTML =
    '<video autoplay playsinline></video>' +
    '<button class="lb-close">\u2715</button>' +
    '<div class="lb-hint">\u041aолёсико — зум · Перетаскивание — двигать · Двойной клик — сброс · Esc — закрыть</div>';
  document.body.appendChild(overlay);

  const video = overlay.querySelector('video');
  video.srcObject = stream;

  let scale = 1;
  let tx = 0;
  let ty = 0;
  const apply = () => {
    video.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  // зум колёсиком к курсору
  overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    const prev = scale;
    scale = Math.min(5, Math.max(1, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (scale === 1) { tx = 0; ty = 0; }
    else {
      const k = scale / prev;
      tx = tx * k; ty = ty * k;
    }
    apply();
  }, { passive: false });

  // перетаскивание мышью (когда приближено)
  let drag = null;
  video.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    drag = { x: e.clientX - tx, y: e.clientY - ty };
    video.classList.add('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    tx = e.clientX - drag.x;
    ty = e.clientY - drag.y;
    apply();
  });
  window.addEventListener('mouseup', () => {
    drag = null;
    video.classList.remove('dragging');
  });

  video.addEventListener('dblclick', () => {
    scale = 1; tx = 0; ty = 0;
    apply();
  });

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.lb-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

// Экспорт в глобал (или заменить на module.exports/import под сборку проекта)
window.loveCallUI = {
  bindCallControls,
  showRemoteShareTile,
  removeRemoteShareTile,
  showRemoteCameraTile,
  expandMedia,
};
