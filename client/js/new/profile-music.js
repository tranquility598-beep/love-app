/* ════════════════════════════════════════════════════════════════════
   LOVE — Музыка профиля
   • Владелец слушает трек со своего локального файла (путь в localStorage).
     Если файл удалён с ПК — музыка убирается из профиля, просим указать заново.
   • Сжатая копия трека лежит на Cloudinary — её слушают другие пользователи.
   • Чужие треки кешируются в Cache Storage, очищаются кнопкой «Очистить кеш».
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const LS_PATH = 'love_my_music_path';   // абсолютный путь к локальному файлу владельца
  const LS_TITLE = 'love_my_music_title'; // название «Исполнитель - Трек»
  const CACHE_NAME = 'love-audio-cache';  // Cache Storage для чужих треков

  const _objectUrls = new Set(); // чтобы освобождать blob-URL

  function _trackUrl(url) { _objectUrls.add(url); return url; }
  function _revoke(url) {
    if (url && _objectUrls.has(url)) {
      try { URL.revokeObjectURL(url); } catch (e) {}
      _objectUrls.delete(url);
    }
  }

  const hasElectron = () =>
    typeof window !== 'undefined' && window.electronAPI &&
    typeof window.electronAPI.readLocalFile === 'function';

  // ── Сохранение выбранного владельцем файла ──────────────────────────
  // Возвращает { title } и асинхронно грузит копию на Cloudinary + в профиль.
  async function setOwnMusic(file) {
    if (!file) return null;
    const title = file.name.replace(/\.[^.]+$/, '');

    // Локальный путь (Electron отдаёт абсолютный путь у File)
    const localPath = file.path || '';
    if (localPath) {
      try {
        localStorage.setItem(LS_PATH, localPath);
        localStorage.setItem(LS_TITLE, title);
      } catch (e) {}
    }

    // Грузим сжатую копию на Cloudinary для других слушателей
    let cloudUrl = '';
    try {
      if (typeof UsersAPI !== 'undefined' && UsersAPI.uploadMusic) {
        const res = await UsersAPI.uploadMusic(file);
        cloudUrl = (res && (res.url || (res.data && res.data.url))) || '';
      }
    } catch (e) {
      console.warn('[music] Cloudinary upload failed:', e && e.message);
    }

    // Не молчим, если облачная копия не загрузилась — иначе друзья видят трек
    // без звука (url пустой), а пользователь об этом не знает.
    if (!cloudUrl && typeof window.showToast === 'function') {
      window.showToast('Музыка', 'Трек добавлен, но копию для друзей загрузить не удалось. Попробуйте аудиофайл до 10 МБ.');
    }

    // Сохраняем в профиле (title всегда, url — если выгрузилось)
    try {
      if (typeof UsersAPI !== 'undefined' && UsersAPI.updateProfile) {
        const music = { url: cloudUrl, title };
        await UsersAPI.updateProfile({ listening: title, music });
        if (window.currentUser) window.currentUser.music = music;
      }
    } catch (e) {
      console.warn('[music] updateProfile(music) failed:', e && e.message);
    }

    if (window.ownProfileData) {
      window.ownProfileData.listening = title;
      window.ownProfileData.musicTitle = title;
      window.ownProfileData.musicCloudUrl = cloudUrl;
    }
    return { title, cloudUrl, localPath };
  }

  // ── Проверка наличия локального файла владельца при старте ───────────
  // Если путь сохранён, но файла больше нет — чистим музыку из профиля.
  async function ensureOwnMusicValid() {
    const p = localStorage.getItem(LS_PATH);
    if (!p || !hasElectron()) return { ok: true };
    let exists = false;
    try { exists = await window.electronAPI.checkLocalFile(p); } catch (e) { exists = false; }
    if (exists) return { ok: true, path: p };

    // Локальный файл пропал — убираем только локальный путь.
    try { localStorage.removeItem(LS_PATH); localStorage.removeItem(LS_TITLE); } catch (e) {}

    // Если на Cloudinary есть копия — трек продолжает играть с неё, профиль НЕ трогаем.
    const cloudUrl = (window.currentUser && window.currentUser.music && window.currentUser.music.url) || '';
    if (cloudUrl) {
      return { ok: true, localGone: true };
    }

    // Копии нет — музыку слушать неоткуда, чистим профиль.
    try {
      if (typeof UsersAPI !== 'undefined' && UsersAPI.updateProfile) {
        await UsersAPI.updateProfile({ music: null });
      }
    } catch (e) {}
    if (window.currentUser) window.currentUser.music = { url: '', title: '' };
    return { ok: false, removed: true };
  }

  // ── Получить источник для воспроизведения ───────────────────────────
  // opts: { isOwn: boolean, cloudUrl: string }
  // Возвращает { src } (blob-URL или direct-URL) — пустая строка = играть нечего.
  async function resolveSource(opts) {
    opts = opts || {};
    console.log('[Music] resolveSource called:', JSON.stringify(opts));

    // Владелец: пробуем локальный файл
    if (opts.isOwn) {
      const p = localStorage.getItem(LS_PATH);
      console.log('[Music] own: localPath =', p, 'electron =', hasElectron());
      if (p && hasElectron()) {
        try {
          const res = await window.electronAPI.readLocalFile(p);
          console.log('[Music] own: readLocalFile result:', res && res.ok);
          if (res && res.ok && res.data) {
            const blob = new Blob([res.data], { type: res.mime || 'audio/mpeg' });
            return { src: _trackUrl(URL.createObjectURL(blob)), source: 'local' };
          }
        } catch (e) {
          console.warn('[Music] own: readLocalFile failed:', e && e.message);
        }
        return { src: '', missing: true };
      }
    }

    // Чужой трек или владелец без локального файла: прямая ссылка + Cache API
    if (opts.cloudUrl) {
      console.log('[Music] cloudUrl =', opts.cloudUrl);
      try {
        const cached = await _fromCache(opts.cloudUrl);
        console.log('[Music] _fromCache result:', cached ? cached.substring(0, 80) + '...' : 'null');
        if (cached) return { src: cached, source: 'cache' };
      } catch (e) {
        console.warn('[Music] _fromCache error:', e && e.message);
      }
      console.log('[Music] fallback to direct URL');
      return { src: opts.cloudUrl, source: 'direct' };
    }

    console.warn('[Music] NO cloudUrl provided! Returning empty src.');
    return { src: '' };
  }

  // ── Cache API для чужих треков ───────────────────────────────────────
  async function _fromCache(url) {
    if (!('caches' in window)) {
      console.log('[Music] no Cache API, returning null');
      return null;
    }
    try {
      const cache = await caches.open(CACHE_NAME);
      let resp = await cache.match(url);
      if (!resp) {
        console.log('[Music] cache miss, fetching:', url.substring(0, 80));
        try {
          const net = await fetch(url, { mode: 'cors' });
          console.log('[Music] fetch result:', net.status, net.ok);
          if (net.ok) {
            await cache.put(url, net.clone());
            resp = net;
          }
        } catch (fetchErr) {
          console.warn('[Music] CORS fetch failed:', fetchErr && fetchErr.message);
        }
      } else {
        console.log('[Music] cache hit!');
      }
      if (resp) {
        const blob = await resp.blob();
        console.log('[Music] blob created, size:', blob.size);
        return _trackUrl(URL.createObjectURL(blob));
      }
    } catch (e) {
      console.warn('[Music] _fromCache error:', e && e.message);
    }
    return null;
  }

  // ── Управление кешем (для настроек) ──────────────────────────────────
  async function getCacheSizeBytes() {
    if (!('caches' in window)) return 0;
    try {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      let total = 0;
      for (const req of keys) {
        const resp = await cache.match(req);
        if (resp) {
          const buf = await resp.clone().arrayBuffer();
          total += buf.byteLength;
        }
      }
      return total;
    } catch (e) {
      return 0;
    }
  }

  async function clearCache() {
    if (!('caches' in window)) return;
    try { await caches.delete(CACHE_NAME); } catch (e) {}
    // освобождаем активные blob-URL
    _objectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    _objectUrls.clear();
  }

  window.ProfileMusic = {
    setOwnMusic,
    ensureOwnMusicValid,
    resolveSource,
    getCacheSizeBytes,
    clearCache,
    revoke: _revoke,
    getOwnTitle: () => localStorage.getItem(LS_TITLE) || ''
  };
})();
