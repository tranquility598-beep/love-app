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
  // Возвращает { src } (blob-URL или '') — пустая строка = играть нечего (симуляция).
  async function resolveSource(opts) {
    opts = opts || {};

    // Владелец: пробуем локальный файл
    if (opts.isOwn) {
      const p = localStorage.getItem(LS_PATH);
      if (p && hasElectron()) {
        try {
          const res = await window.electronAPI.readLocalFile(p);
          if (res && res.ok && res.data) {
            const blob = new Blob([res.data], { type: res.mime || 'audio/mpeg' });
            return { src: _trackUrl(URL.createObjectURL(blob)), source: 'local' };
          }
        } catch (e) { /* падаем дальше на cloud */ }
        // Локальный путь есть, но файл не читается — он пропал
        return { src: '', missing: true };
      }
      // Локального пути нет (например другой ПК) — играем с Cloudinary, если есть
    }

    // Чужой трек или владелец без локального файла: Cloudinary + Cache API
    if (opts.cloudUrl) {
      const cached = await _fromCache(opts.cloudUrl);
      if (cached) return { src: cached, source: 'cache' };
    }

    return { src: '' };
  }

  // ── Cache API для чужих треков ───────────────────────────────────────
  async function _fromCache(url) {
    if (!('caches' in window)) {
      // Нет Cache API — просто отдаём прямую ссылку
      return url;
    }
    try {
      const cache = await caches.open(CACHE_NAME);
      let resp = await cache.match(url);
      if (!resp) {
        const net = await fetch(url, { mode: 'cors' });
        if (!net.ok) return url; // не вышло — прямая ссылка как fallback
        await cache.put(url, net.clone());
        resp = net;
      }
      const blob = await resp.blob();
      return _trackUrl(URL.createObjectURL(blob));
    } catch (e) {
      return url; // любой сбой — прямая ссылка
    }
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
