/**
 * UI модуль - вспомогательные функции интерфейса
 * Исправлены все ID и имена функций для соответствия HTML
 */

// ===== EASTER EGGS LOGIC =====
let logoClickCount = 0;
let logoClickTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  // Детекция платформы для адаптации UI (Mac/Windows)
  if (window.electronAPI && window.electronAPI.platform) {
    const platform = window.electronAPI.platform;
    if (platform === 'darwin') {
      document.body.classList.add('is-mac');
      console.log('🍎 Running on macOS - adapting UI...');
    } else {
      document.body.classList.add('is-windows');
      console.log('💻 Running on Windows - using standard UI...');
    }
  }

  const dmBtn = document.getElementById('dm-btn');
  if (dmBtn) {
    dmBtn.addEventListener('click', () => {
      logoClickCount++;
      
      if (logoClickTimeout) clearTimeout(logoClickTimeout);
      
      if (logoClickCount === 7) {
        // Если окно уже открыто, не открываем заново
        const modal = document.getElementById('developer-modal-egg');
        if (modal && modal.classList.contains('hidden')) {
          openModal('developer-modal-egg', { allowEscape: false, allowClickOutside: false });
        }
        logoClickCount = 0;
      }
      
      logoClickTimeout = setTimeout(() => {
        logoClickCount = 0;
      }, 500); // Тайм-аут сброса — 0.5 сек для очень быстрых кликов
    });
  }
});

/**
 * Создает эффект взрыва сердец на экране
 */
function triggerHeartBurst() {
  const heartCount = 40;
  const area = document.body;
  
  for (let i = 0; i < heartCount; i++) {
    const heart = document.createElement('div');
    heart.className = 'heart-particle';
    heart.innerHTML = '🤍'; // Белое сердце для соответствия ЧБ теме
    
    // Случайные параметры
    const startX = Math.random() * window.innerWidth;
    const startY = window.innerHeight + 50;
    const size = Math.random() * 20 + 10;
    const duration = Math.random() * 3 + 2;
    const delay = Math.random() * 0.5;
    const rot = Math.random() * 360 - 180;
    
    heart.style.left = startX + 'px';
    heart.style.bottom = '-50px';
    heart.style.fontSize = size + 'px';
    heart.style.setProperty('--rot', rot + '0deg');
    heart.style.animation = `floatUp ${duration}s ease-out ${delay}s forwards`;
    
    area.appendChild(heart);
    
    // Удаляем после завершения
    setTimeout(() => {
      heart.remove();
    }, (duration + delay) * 1000);
  }
}

window.triggerHeartBurst = triggerHeartBurst;

// ===== УВЕДОМЛЕНИЯ =====
function showNotification(type, message, title) {
  const container = document.getElementById('notifications-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const titles = { success: 'Успешно', error: 'Ошибка', warning: 'Предупреждение', info: 'Уведомление' };

  // Создаем уведомление безопасно через DOM API
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  
  const iconDiv = document.createElement('div');
  iconDiv.className = 'notification-icon';
  iconDiv.textContent = icons[type] || 'ℹ️';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'notification-content';
  
  const titleDiv = document.createElement('div');
  titleDiv.className = 'notification-title';
  titleDiv.textContent = title || titles[type]; // ИСПРАВЛЕНО: Безопасно через textContent
  
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'notification-body';
  bodyDiv.textContent = message; // ИСПРАВЛЕНО: Безопасно через textContent
  
  contentDiv.appendChild(titleDiv);
  contentDiv.appendChild(bodyDiv);
  
  notif.appendChild(iconDiv);
  notif.appendChild(contentDiv);

  container.appendChild(notif);
  
  // Воспроизводим звук если настройка включена
  if (window.settingsManager && window.settingsManager.get('notif-sound')) {
    playNotificationSound(type);
  }
  
  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => notif.remove(), 300);
  }, 4000);
}

/**
 * Глобальная полоса объявления сверху экрана (founder:broadcast) — видна всем, включая отправителя
 */
function showGlobalAnnouncementBanner(data) {
  const message = data.message || '';
  const from = data.from || 'Администратор';
  let bar = document.getElementById('global-announcement-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'global-announcement-bar';
    bar.className = 'global-announcement-bar';
    bar.setAttribute('role', 'alert');
    document.body.insertBefore(bar, document.body.firstChild);
  }
  bar.classList.remove('hidden');
  const safeMsg = typeof escapeHtml === 'function' ? escapeHtml(message) : message;
  const safeFrom = typeof escapeHtml === 'function' ? escapeHtml(from) : from;
  bar.innerHTML = `
    <div class="global-announcement-inner">
      <span class="global-announcement-icon" aria-hidden="true">📢</span>
      <div class="global-announcement-text">
        <div class="global-announcement-title">Объявление от ${safeFrom}</div>
        <div class="global-announcement-message">${safeMsg}</div>
      </div>
      <button type="button" class="global-announcement-close" aria-label="Закрыть">✕</button>
    </div>
  `;
  const close = bar.querySelector('.global-announcement-close');
  const app = document.getElementById('app');
  const applyPadding = () => {
    if (app) {
      requestAnimationFrame(() => {
        app.style.paddingTop = bar.offsetHeight ? `${bar.offsetHeight}px` : '';
      });
    }
  };
  applyPadding();

  if (close) {
    close.addEventListener('click', () => {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      if (app) app.style.paddingTop = '';
    });
  }
}

window.showGlobalAnnouncementBanner = showGlobalAnnouncementBanner;

// Воспроизведение звука уведомления
function playNotificationSound(type) {
  try {
    const audio = new Audio();
    // Разные звуки для разных типов уведомлений
    const frequencies = {
      success: [523.25, 659.25], // C5, E5
      error: [392.00, 329.63],   // G4, E4
      warning: [440.00, 493.88], // A4, B4
      info: [523.25, 587.33]     // C5, D5
    };
    
    const freq = frequencies[type] || frequencies.info;
    
    // Создаем простой звук используя Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = freq[0];
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
    
    // Второй тон
    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.value = freq[1];
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.1, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.1);
    }, 50);
  } catch (err) {
    console.error('Error playing notification sound:', err);
  }
}

function showMessageNotification(message) {
  if (document.hasFocus()) return;
  showNotification('info', message.content?.substring(0, 80) || 'Новое сообщение', message.author?.username);
}

// ===== МОДАЛЬНЫЕ ОКНА — UNIFIED ARCHITECTURE =====

/**
 * Modal Stack Manager
 * Tracks open modals, manages z-index, focus, and scroll locking
 */
const ModalManager = {
  stack: [], // Array of { id, element, previousFocus, allowEscape, allowClickOutside }
  baseZIndex: 1000,
  scrollLockCount: 0,

  /**
   * Opens a modal and adds it to the stack
   * @param {string} id - Modal overlay element ID
   * @param {Object} options - { allowEscape: true, allowClickOutside: true, initialFocus: null }
   */
  open(id, options = {}) {
    const modal = document.getElementById(id);
    if (!modal) {
      console.warn(`[ModalManager] Modal not found: ${id}`);
      return;
    }

    // Check if already open
    if (this.stack.find(m => m.id === id)) {
      console.warn(`[ModalManager] Modal already open: ${id}`);
      return;
    }

    // Store currently focused element
    const previousFocus = document.activeElement;

    // Default options
    const config = {
      allowEscape: options.allowEscape !== false, // Default true
      allowClickOutside: options.allowClickOutside !== false, // Default true
      initialFocus: options.initialFocus || null,
      ...options
    };

    // Add to stack
    this.stack.push({
      id,
      element: modal,
      previousFocus,
      ...config
    });

    // Set z-index based on stack position
    modal.style.zIndex = this.baseZIndex + this.stack.length * 10;

    // Show modal
    modal.classList.remove('hidden');

    // Enable scroll lock
    this.enableScrollLock();

    // Set initial focus
    this.setInitialFocus(modal, config.initialFocus);

    // Setup focus trap
    this.setupFocusTrap(modal);

    console.log(`[ModalManager] Opened: ${id}, stack depth: ${this.stack.length}`);
  },

  /**
   * Closes a modal and removes it from the stack
   * @param {string} id - Modal overlay element ID
   */
  close(id) {
    const index = this.stack.findIndex(m => m.id === id);
    if (index === -1) {
      console.warn(`[ModalManager] Modal not in stack: ${id}`);
      return;
    }

    const modalData = this.stack[index];
    const modal = modalData.element;

    // Hide modal
    modal.classList.add('hidden');

    // Remove from stack
    this.stack.splice(index, 1);

    // Disable scroll lock if no modals remain
    if (this.stack.length === 0) {
      this.disableScrollLock();
    }

    // Return focus to previous element
    if (modalData.previousFocus && typeof modalData.previousFocus.focus === 'function') {
      try {
        modalData.previousFocus.focus();
      } catch (e) {
        console.warn('[ModalManager] Could not return focus:', e);
      }
    }

    console.log(`[ModalManager] Closed: ${id}, stack depth: ${this.stack.length}`);
  },

  /**
   * Closes the topmost modal in the stack
   */
  closeTop() {
    if (this.stack.length === 0) return;
    const topModal = this.stack[this.stack.length - 1];
    if (topModal.allowEscape) {
      this.close(topModal.id);
    }
  },

  /**
   * Closes all modals
   */
  closeAll() {
    while (this.stack.length > 0) {
      const topModal = this.stack[this.stack.length - 1];
      this.close(topModal.id);
    }
  },

  /**
   * Enables scroll locking on body
   */
  enableScrollLock() {
    this.scrollLockCount++;
    if (this.scrollLockCount === 1) {
      document.body.style.overflow = 'hidden';
    }
  },

  /**
   * Disables scroll locking on body
   */
  disableScrollLock() {
    this.scrollLockCount = Math.max(0, this.scrollLockCount - 1);
    if (this.scrollLockCount === 0) {
      document.body.style.overflow = '';
    }
  },

  /**
   * Sets initial focus inside modal
   */
  setInitialFocus(modal, initialFocusSelector) {
    setTimeout(() => {
      let focusTarget = null;

      // Try custom selector first
      if (initialFocusSelector) {
        focusTarget = modal.querySelector(initialFocusSelector);
      }

      // Fallback: first input or button
      if (!focusTarget) {
        focusTarget = modal.querySelector('input:not([type="hidden"]), textarea, select, button');
      }

      // Fallback: modal itself
      if (!focusTarget) {
        focusTarget = modal.querySelector('.modal, .modal-content, .settings-modal');
      }

      if (focusTarget && typeof focusTarget.focus === 'function') {
        try {
          focusTarget.focus();
        } catch (e) {
          console.warn('[ModalManager] Could not set initial focus:', e);
        }
      }
    }, 100); // Delay to allow modal animation
  },

  /**
   * Sets up focus trap inside modal
   */
  setupFocusTrap(modal) {
    const focusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      const focusableElements = Array.from(modal.querySelectorAll(focusableSelector));
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab on first element -> focus last
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
      // Tab on last element -> focus first
      else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    // Store handler for cleanup
    if (!modal._focusTrapHandler) {
      modal._focusTrapHandler = handleTab;
      modal.addEventListener('keydown', handleTab);
    }
  },

  /**
   * Checks if a modal is currently open
   */
  isOpen(id) {
    return this.stack.some(m => m.id === id);
  },

  /**
   * Gets the topmost modal ID
   */
  getTopModalId() {
    if (this.stack.length === 0) return null;
    return this.stack[this.stack.length - 1].id;
  }
};

// Legacy functions for backward compatibility
function openModal(id, options) {
  ModalManager.open(id, options);
}

function closeModal(id) {
  ModalManager.close(id);
}

// Global click-outside handler
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    const modalId = e.target.id;
    const modalData = ModalManager.stack.find(m => m.id === modalId);
    if (modalData && modalData.allowClickOutside) {
      ModalManager.close(modalId);
    }
  }
});

// Global ESC key handler - only closes topmost modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close topmost modal if allowed
    ModalManager.closeTop();
    
    // Also close context menu and emoji picker (not modals)
    hideContextMenu();
    const emojiPicker = document.getElementById('emoji-picker-container');
    if (emojiPicker) emojiPicker.classList.add('hidden');
  }
});

// ===== АВАТАРЫ И УТИЛИТЫ =====
function getAvatarUrl(avatar, fallbackUsername) {
  if (!avatar || avatar === '' || avatar === 'undefined' || avatar === 'null') {
    return generateDefaultAvatar(fallbackUsername || (window.currentUser ? window.currentUser.username : '?'));
  }
  if (avatar.startsWith('http') || avatar.startsWith('data:')) return avatar;
  const baseUrl = window.BASE_URL || 'http://localhost:5555';
  return `${baseUrl}${avatar}`;
}

function generateDefaultAvatar(username) {
  const colors = ['#5865f2','#eb459e','#3ba55c','#faa61a','#ed4245','#00b0f4'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const letter = username ? username[0].toUpperCase() : '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="${color}"/><text x="20" y="26" text-anchor="middle" fill="white" font-size="18" font-family="Arial" font-weight="bold">${letter}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function getFormatLocaleTag() {
  const sm = window.settingsManager;
  if (!sm || !sm.getEffectiveLanguageCode) return 'ru-RU';
  const lang = sm.getEffectiveLanguageCode();
  const map = { ru: 'ru-RU', en: 'en-US', uk: 'uk-UA', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };
  return map[lang] || 'ru-RU';
}

function getRelativeDayLabels() {
  const lang = window.settingsManager?.getEffectiveLanguageCode?.() || 'ru';
  const L = {
    ru: { today: 'Сегодня', yesterday: 'Вчера', at: 'в' },
    en: { today: 'Today', yesterday: 'Yesterday', at: 'at' },
    uk: { today: 'Сьогодні', yesterday: 'Вчора', at: 'о' },
    de: { today: 'Heute', yesterday: 'Gestern', at: 'um' },
    fr: { today: "Aujourd'hui", yesterday: 'Hier', at: 'à' },
    es: { today: 'Hoy', yesterday: 'Ayer', at: 'a las' }
  };
  return L[lang] || L.ru;
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getTimeZoneOptions() {
  const tz = window.settingsManager?.get('app-timezone');
  if (!tz || tz === 'auto') return {};
  return { timeZone: tz };
}

function formatTime(date) {
  const d = new Date(date);
  const locale = getFormatLocaleTag();
  const hour12 = window.settingsManager?.get('time-format') === '12';
  return d.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    ...getTimeZoneOptions()
  });
}

function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const labels = getRelativeDayLabels();
  const locale = getFormatLocaleTag();
  const fmt = window.settingsManager?.get('date-format') || 'dmy';

  if (isSameCalendarDay(d, now)) {
    return `${labels.today} ${labels.at} ${formatTime(d)}`;
  }
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (isSameCalendarDay(d, y)) {
    return `${labels.yesterday} ${labels.at} ${formatTime(d)}`;
  }

  const tzOpt = getTimeZoneOptions();
  if (fmt === 'mdy') {
    return (
      d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...tzOpt
      }) +
      ` ${labels.at} ` +
      formatTime(d)
    );
  }
  if (fmt === 'ymd') {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...tzOpt
    }).format(d);
    return `${ymd} ${labels.at} ${formatTime(d)}`;
  }
  return (
    d.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...tzOpt
    }) +
    ` ${labels.at} ` +
    formatTime(d)
  );
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1048576).toFixed(1) + ' МБ';
}

function getFileIcon(mimetype) {
  if (mimetype?.startsWith('image/')) return '🖼️';
  if (mimetype?.startsWith('video/')) return '🎬';
  if (mimetype?.startsWith('audio/')) return '🎵';
  if (mimetype?.includes('pdf')) return '📄';
  if (mimetype?.includes('zip') || mimetype?.includes('rar')) return '📦';
  return '📎';
}

function updateUserStatusInDOM(userId, status) {
  document.querySelectorAll(`[data-user-id="${userId}"] .status-dot`).forEach(dot => {
    dot.className = `status-dot ${status}`;
  });
  document.querySelectorAll(`[data-user-id="${userId}"] .user-status-dot`).forEach(dot => {
    dot.className = `user-status-dot ${status}`;
  });
}

// ===== ПАНЕЛЬ ПОЛЬЗОВАТЕЛЯ =====
// updateUserPanel - использует правильный ID 'user-avatar' из HTML
function updateUserPanel() {
  const user = window.currentUser;
  if (!user) return;

  const nameEl = document.getElementById('user-panel-name');
  const tagEl = document.getElementById('user-panel-tag');
  const avatarEl = document.getElementById('user-avatar'); // ID в HTML: user-avatar
  const statusDot = document.getElementById('user-status-dot');

  if (nameEl) {
    nameEl.textContent = user.username || 'Пользователь';
    if (user.role === 'owner') {
      nameEl.innerHTML += ' <span class="owner-badge" title="Создатель" style="font-size:1.1em; margin-left:4px;">👑</span>';
    }
  }
  if (avatarEl) avatarEl.src = getAvatarUrl(user.avatar, user.username);
  if (statusDot) statusDot.className = 'user-status-dot ' + (user.status || 'online');

  // Compact account в server rail (виден в room-mode). Не дубликат
  // большого user-panel — это отдельный DOM-узел с другими id.
  const railImg = document.getElementById('rail-account-img');
  const railDot = document.getElementById('rail-account-dot');
  const railProfileBtn = document.getElementById('rail-profile-btn');
  if (railImg) {
    railImg.src = getAvatarUrl(user.avatar, user.username);
    railImg.alt = user.username || '';
  }
  if (railDot) {
    railDot.className = 'rail-account-dot ' + (user.status || 'online');
  }
  if (railProfileBtn && user.username) {
    railProfileBtn.title = user.username;
  }
}

// Биндинги compact account в server rail. Вызываются один раз
// (см. _railAccountBound). Только addEventListener, без inline onclick.
let _railAccountBound = false;
function bindRailAccount() {
  if (_railAccountBound) return;
  const profileBtn = document.getElementById('rail-profile-btn');
  const settingsBtn = document.getElementById('rail-settings-btn');
  if (!profileBtn || !settingsBtn) return;
  profileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Передаём сам profileBtn как anchor — popover спозиционируется
    // относительно compact-аватара в server rail, а не относительно
    // скрытого в room-mode #user-panel-root.
    if (typeof toggleProfilePopover === 'function') {
      toggleProfilePopover(e, profileBtn);
    }
  });
  settingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // showSettings — это account settings, НЕ room settings
    // (room settings — отдельная кнопка в room-header).
    if (typeof showSettings === 'function') showSettings();
  });
  _railAccountBound = true;
}
// Регистрируем биндинги после загрузки DOM. Безопасно вызывается
// несколько раз — guard'ит флаг.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindRailAccount);
} else {
  bindRailAccount();
}

// ===== КНОПКИ УПРАВЛЕНИЯ =====
function toggleMembersList() {
  const sidebar = document.getElementById('members-sidebar');
  const btn = document.getElementById('members-toggle-btn');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
    if (btn) btn.classList.toggle('active', !sidebar.classList.contains('hidden'));
  }
}

// Переключить микрофон
let globalMicMuted = false;
function toggleMic() {
  globalMicMuted = !globalMicMuted;
  const btn = document.getElementById('mic-btn');
  if (btn) {
    btn.classList.toggle('muted', globalMicMuted);
    // Update icon
    const icon = btn.querySelector('svg');
    if (icon) {
      if (globalMicMuted) {
        icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
      }
    }
  }
  
  if (window.voiceManager) {
    window.voiceManager.isMuted = globalMicMuted;
    if (window.voiceManager.localStream) {
      window.voiceManager.localStream.getAudioTracks().forEach(function(t) { t.enabled = !globalMicMuted; });
    }
  }
  
  // Play sound
  if (window.playVoiceSound) {
    window.playVoiceSound(globalMicMuted ? 'mute' : 'unmute');
  }
}

// toggleDeafen - вызывается из HTML onclick="toggleDeafen()"
let globalDeafened = false;
function toggleDeafen() {
  globalDeafened = !globalDeafened;
  const btn = document.getElementById('headset-btn');
  if (btn) {
    btn.classList.toggle('muted', globalDeafened);
    // Update icon
    const icon = btn.querySelector('svg');
    if (icon) {
      if (globalDeafened) {
        icon.innerHTML = '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        icon.innerHTML = '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>';
      }
    }
  }
  document.querySelectorAll('#remote-audio-container audio').forEach(function(audio) {
    audio.muted = globalDeafened;
  });

  // Play sound
  if (window.playVoiceSound) {
    window.playVoiceSound(globalDeafened ? 'deafen' : 'undeafen');
  }
}

// Удалены toggleVoiceMute и toggleVoiceDeafen так как они теперь в voice.js

// ===== CREATE CHANNEL MODAL =====
function showCreateChannelModal(type, categoryName = '') {
  window._selectedChannelType = type || 'text';
  window._selectedCategoryName = categoryName;
  
  // Clear inputs
  const nameInput = document.getElementById('channel-name-input');
  if (nameInput) {
    nameInput.value = '';
    nameInput.focus();
  }
  
  const prefix = document.getElementById('channel-prefix');
  if (prefix) prefix.textContent = type === 'voice' ? '🔊' : '#';
  
  // Populate hidden category select for compatibility with createChannel
  const catSelect = document.getElementById('channel-category-select');
  if (catSelect) {
    catSelect.innerHTML = `<option value="${categoryName}">${categoryName || 'Без категории'}</option>`;
    catSelect.value = categoryName;
  }
  
  // Update channel type selector
  if (window.selectChannelType) {
    window.selectChannelType(window._selectedChannelType);
  }
  
  openModal('create-channel-modal');
}

// Create channel
async function createChannel() {
  const nameInput = document.getElementById('channel-name-input');
  const catSelect = document.getElementById('channel-category-select');
  
  let name = nameInput ? nameInput.value.trim() : '';
  const category = catSelect ? catSelect.value : '';
  const type = window._selectedChannelType || 'text';
  
  if (!name) {
    showNotification('warning', 'Введите название канала');
    return;
  }

  // Format name (Discord style)
  if (type === 'text') {
    name = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, '');
  }
  
  if (!window.currentServer) {
    showNotification('warning', 'Выберите сервер');
    return;
  }
  
  try {
    const data = await ChannelsAPI.create(name, type, window.currentServer._id, category);
    showNotification('success', 'Канал создан');
    closeModal('create-channel-modal');
    
    // Refresh server channels
    const serverData = await ServersAPI.get(window.currentServer._id);
    window.currentServer = serverData.server;
    renderServerChannels(serverData.server);
    
    if (nameInput) nameInput.value = '';
  } catch (error) {
    showNotification('error', error.message || 'Ошибка создания канала');
  }
}

// ===== PERSONAL PROFILE MODAL =====
function showPersonalProfile() {
  const user = window.currentUser;
  if (!user) return;
  
  // Create personal profile modal if it doesn't exist
  let modal = document.getElementById('personal-profile-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'personal-profile-modal';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal premium-modal">
        <div class="modal-header">
          <h2 class="modal-header-title">Личный профиль</h2>
          <button class="modal-close" onclick="closeModal('personal-profile-modal')">✕</button>
        </div>
        <div class="modal-body" style="padding: 24px">
          <div class="profile-banner-premium">
            <div class="profile-avatar-container" style="margin: 0 auto 16px;">
              <img id="personal-avatar" src="" alt="Avatar">
              <div class="avatar-overlay" onclick="document.getElementById('personal-avatar-input').click()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <span>Изменить</span>
              </div>
            </div>
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="font-size:20px;font-weight:700;color:var(--text-primary)" id="personal-username-display"></div>
              <div style="font-size:13px;color:var(--text-muted);margin-top:4px" id="personal-tag-display">Пользователь</div>
            </div>
          </div>
          <input type="file" id="personal-avatar-input" accept="image/*" style="display:none" onchange="uploadPersonalAvatar(event)">
          
          <div class="modal-field">
            <label class="modal-label">Имя пользователя</label>
            <div class="premium-input-wrapper">
              <span class="premium-prefix">👤</span>
              <input type="text" id="personal-username" class="premium-input" placeholder="Введите имя...">
            </div>
          </div>
          
          <div class="modal-field">
            <label class="modal-label">О себе</label>
            <div class="premium-input-wrapper" style="height: auto; align-items: flex-start; padding: 12px">
              <textarea id="personal-bio" class="premium-input" style="height: 80px; resize: none;" placeholder="Расскажите о себе..."></textarea>
            </div>
          </div>
          
          <div class="premium-footer">
            <button class="modal-btn secondary" onclick="closeModal('personal-profile-modal')">Отмена</button>
            <button class="modal-btn primary" onclick="savePersonalProfile()">Сохранить изменения</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  // Populate modal with user data
  const avatarEl = document.getElementById('personal-avatar');
  const usernameEl = document.getElementById('personal-username');
  const bioEl = document.getElementById('personal-bio');
  const usernameDisplay = document.getElementById('personal-username-display');
  const tagDisplay = document.getElementById('personal-tag-display');
  
  if (avatarEl) avatarEl.src = getAvatarUrl(user.avatar);
  if (usernameEl) usernameEl.value = user.username || '';
  if (bioEl) bioEl.value = user.bio || '';
  if (usernameDisplay) {
    usernameDisplay.textContent = user.username || '';
    if (user.role === 'owner') usernameDisplay.innerHTML += ' 👑';
  }
  
  openModal('personal-profile-modal');
}

// Upload personal avatar
async function uploadPersonalAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const data = await UsersAPI.uploadAvatar(file);
    window.currentUser.avatar = data.url;
    localStorage.setItem('user', JSON.stringify(window.currentUser));
    
    const personalAvatar = document.getElementById('personal-avatar');
    if (personalAvatar) personalAvatar.src = getAvatarUrl(data.url);
    updateUserPanel();
    showNotification('success', 'Аватар обновлен');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка загрузки аватара');
  }
}

// Save personal profile
async function savePersonalProfile() {
  const username = document.getElementById('personal-username') ? document.getElementById('personal-username').value.trim() : '';
  const bio = document.getElementById('personal-bio') ? document.getElementById('personal-bio').value : '';
  
  if (!username) {
    showNotification('warning', 'Введите имя пользователя');
    return;
  }
  
  try {
    const data = await UsersAPI.updateProfile({ username, bio });
    window.currentUser = Object.assign({}, window.currentUser, (data.user || {}));
    localStorage.setItem('user', JSON.stringify(window.currentUser));
    updateUserPanel();
    
    const usernameDisplay = document.getElementById('personal-username-display');
    if (usernameDisplay) usernameDisplay.textContent = username;
    
    showNotification('success', 'Профиль сохранен');
    closeModal('personal-profile-modal');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка сохранения');
  }
}

// ===== НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ =====

// ===== PROFILE POPOVER =====
//
// Раньше popover жёстко якорился к #user-panel-root. В room-mode этот
// узел скрыт вместе с #channels-sidebar (display:none) → getBoundingClientRect
// возвращает {0,0,0,0} и popover вылетал в угол экрана.
//
// Теперь функция принимает второй параметр anchorEl (элемент-якорь).
// Старые вызовы `toggleProfilePopover(event)` продолжают работать —
// fallback по цепочке: anchorEl → event.currentTarget → #user-panel-root.
// Compact avatar в server rail передаёт rail-profile-btn как anchor
// (см. bindRailAccount).
function toggleProfilePopover(event, anchorEl) {
  if (event) event.stopPropagation();
  const popover = document.getElementById('profile-popover');
  if (!popover) return;

  if (popover.classList.contains('hidden')) {
    updateProfilePopover();

    // Выбираем якорь. Если переданный/event-target скрыт (offsetParent=null)
    // — fallback на видимый rail-profile-btn (room-mode) или user-panel-root.
    const candidates = [
      anchorEl,
      event && event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
      document.getElementById('rail-profile-btn'),
      document.getElementById('user-panel-root'),
    ];
    let anchor = null;
    for (const el of candidates) {
      if (el && el.offsetParent !== null) { anchor = el; break; }
    }
    if (!anchor) anchor = document.getElementById('user-panel-root');

    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      popover.style.left = rect.left + 'px';
      popover.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    }

    popover.classList.remove('hidden');
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', closePopoverOnOutsideClick);
    }, 0);
  } else {
    closeProfilePopover();
  }
}

function closeProfilePopover() {
  const popover = document.getElementById('profile-popover');
  if (popover) popover.classList.add('hidden');
  document.removeEventListener('click', closePopoverOnOutsideClick);
}

function closePopoverOnOutsideClick(e) {
  const popover = document.getElementById('profile-popover');
  const userPanel = document.getElementById('user-panel-root');
  // Также игнорируем клик по compact avatar в server rail (room-mode),
  // иначе клик по нему сразу же закрывает только что открытый popover.
  const railProfile = document.getElementById('rail-profile-btn');
  if (
    popover && !popover.contains(e.target)
    && (!userPanel || !userPanel.contains(e.target))
    && (!railProfile || !railProfile.contains(e.target))
  ) {
    closeProfilePopover();
  }
}

function getStatusText(status) {
  const map = { 'online': 'В сети', 'idle': 'Не активен', 'dnd': 'Не беспокоить', 'offline': 'Невидимый' };
  return map[status] || 'В сети';
}

function updateProfilePopover() {
  const user = window.currentUser;
  if (!user) return;

  const avatar = document.getElementById('popover-avatar');
  const username = document.getElementById('popover-username');
  const statusText = document.getElementById('popover-status-text');
  const bio = document.getElementById('popover-bio');
  const memberSince = document.getElementById('popover-member-since');
  const statusDot = document.getElementById('popover-status-dot');
  const banner = document.getElementById('popover-banner');
  
  // Принимаем только hex — защита от CSS-инъекций.
  const rawColor = user.profileColor || '#5865F2';
  const profileColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawColor) ? rawColor : '#5865F2';

  if (avatar) avatar.src = user.avatar ? getAvatarUrl(user.avatar) : generateDefaultAvatar(user.username);
  if (username) username.textContent = user.username || '';
  if (statusText) statusText.textContent = getStatusText(user.status);
  if (bio) bio.textContent = user.bio ? user.bio : 'Биография не указана';
  
  if (memberSince) {
    if (user.createdAt) {
      const date = new Date(user.createdAt);
      memberSince.textContent = `Участник с ${!isNaN(date.valueOf()) ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}`;
      memberSince.style.display = 'block';
    } else {
      memberSince.style.display = 'none';
    }
  }
  
  if (statusDot) {
    statusDot.className = 'popover-status-dot ' + (user.status || 'online');
  }
  
  // Apply profile color glow to banner
  if (banner) {
    banner.style.background = `linear-gradient(135deg, rgba(20,20,28,1) 0%, ${profileColor}33 100%)`;
    banner.style.boxShadow = `inset 0 -20px 40px -10px ${profileColor}22`;
  }
}

// Popover button handlers
document.addEventListener('DOMContentLoaded', () => {
  const openProfileBtn = document.getElementById('popover-open-profile');
  const editProfileBtn = document.getElementById('popover-edit-profile');
  
  if (openProfileBtn) {
    openProfileBtn.addEventListener('click', () => {
      closeProfilePopover();
      if (window.currentUser) openProfile(window.currentUser._id);
    });
  }
  
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
      closeProfilePopover();
      openSettingsToProfile();
    });
  }
});

function openSettingsToProfile() {
  showSettings();
  setTimeout(() => {
    const profileTabBtn = document.querySelector('.settings-nav-item');
    if (profileTabBtn && typeof showSettingsTab === 'function') {
      showSettingsTab('profile', profileTabBtn);
    }
  }, 10);
}

// ===== SETTINGS =====
// showSettings - вызывается из HTML onclick="showSettings()"
function showSettings() {
  const user = window.currentUser;
  if (!user) return;

  const avatarEl = document.getElementById('settings-avatar');
  const usernameEl = document.getElementById('settings-username');
  const bioEl = document.getElementById('settings-bio');
  const statusEl = document.getElementById('settings-status');
  const usernameDisplay = document.getElementById('settings-username-display');
  const statusDisplay = document.getElementById('settings-status-display');
  const colorEl = document.getElementById('settings-profile-color');
  const banner = document.getElementById('settings-profile-banner');

  if (avatarEl) avatarEl.src = user.avatar ? getAvatarUrl(user.avatar) : generateDefaultAvatar(user.username);
  if (usernameEl) usernameEl.value = user.username || '';
  if (bioEl) bioEl.value = user.bio || '';
  if (statusEl) statusEl.value = user.status || 'online';
  if (colorEl) colorEl.value = user.profileColor || '#5865F2';
  if (usernameDisplay) {
    usernameDisplay.textContent = user.username || '';
    if (user.role === 'owner') usernameDisplay.innerHTML += ' 👑';
  }
  if (statusDisplay) statusDisplay.textContent = getStatusText(user.status);

  // Apply profile color glow to settings banner
  applyBannerGlow(banner, user.profileColor || '#5865F2');

  // Обновляем состояние кнопки сохранения
  checkProfileChanges();

  openModal('settings-modal');
}

// Алиас для совместимости
function showUserSettings() {
  showSettings();
}

function showSettingsTab(tab, el) {
  document.querySelectorAll('#settings-modal .settings-tab').forEach(function(t) { t.classList.add('hidden'); });
  document.querySelectorAll('#settings-modal .settings-nav-item').forEach(function(i) { i.classList.remove('active'); });

  const tabEl = document.getElementById('settings-' + tab);
  if (tabEl) tabEl.classList.remove('hidden');
  if (el) el.classList.add('active');
}

function applyBannerGlow(banner, color) {
  if (!banner) return;
  // Валидация: принимаем только hex #RGB или #RRGGBB, иначе — дефолт.
  // Защита от CSS-инъекций, т.к. значение подставляется в style.
  const safe = (typeof color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color))
    ? color
    : '#5865F2';
  banner.style.background = `linear-gradient(135deg, rgba(18,18,22,0.97) 0%, ${safe}28 60%, ${safe}15 100%)`;
  banner.style.boxShadow = `inset 0 0 60px -20px ${safe}30`;
  // Update avatar border glow
  const avatarWrap = banner.querySelector('.profile-avatar-wrapper');
  if (avatarWrap) {
    avatarWrap.style.borderColor = `${safe}60`;
    avatarWrap.style.boxShadow = `0 0 16px ${safe}25`;
  }
}

function checkProfileChanges() {
  const user = window.currentUser;
  if (!user) return;

  const usernameEl = document.getElementById('settings-username');
  const bioEl = document.getElementById('settings-bio');
  const statusEl = document.getElementById('settings-status');
  const colorEl = document.getElementById('settings-profile-color');

  const currentUsername = usernameEl ? usernameEl.value.trim() : '';
  const currentBio = bioEl ? bioEl.value : '';
  const currentStatus = statusEl ? statusEl.value : 'online';
  const currentColor = colorEl ? colorEl.value : '#5865F2';

  const originalUsername = user.username || '';
  const originalBio = user.bio || '';
  const originalStatus = user.status || 'online';
  const originalColor = user.profileColor || '#5865F2';

  const hasChanges = (currentUsername !== originalUsername) || 
                     (currentBio !== originalBio) || 
                     (currentStatus !== originalStatus) ||
                     (currentColor.toLowerCase() !== originalColor.toLowerCase());

  const saveBtn = document.getElementById('settings-save-btn');
  if (saveBtn) {
    saveBtn.disabled = !hasChanges;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const fields = ['settings-username', 'settings-bio', 'settings-status', 'settings-profile-color'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        checkProfileChanges();
        
        // Моментальное обновление имени в превью
        if (id === 'settings-username') {
          const display = document.getElementById('settings-username-display');
          if (display && window.currentUser) {
            display.textContent = e.target.value.trim() || window.currentUser.username;
            if (window.currentUser.role === 'owner') {
              display.innerHTML += ' 👑';
            }
          }
        }
        
        // Моментальное обновление градиента баннера при смене цвета
        if (id === 'settings-profile-color') {
          const banner = document.getElementById('settings-profile-banner');
          applyBannerGlow(banner, e.target.value);
        }
        
        // Моментальное обновление статуса в превью
        if (id === 'settings-status') {
          const statusDisplay = document.getElementById('settings-status-display');
          if (statusDisplay) statusDisplay.textContent = getStatusText(e.target.value);
        }
      });
      el.addEventListener('change', (e) => {
        checkProfileChanges();
        if (id === 'settings-profile-color') {
          const banner = document.getElementById('settings-profile-banner');
          applyBannerGlow(banner, e.target.value);
        }
        if (id === 'settings-status') {
          const statusDisplay = document.getElementById('settings-status-display');
          if (statusDisplay) statusDisplay.textContent = getStatusText(e.target.value);
        }
      });
    }
  });
});

async function saveProfile() {
  const username = document.getElementById('settings-username') ? document.getElementById('settings-username').value.trim() : '';
  const bio = document.getElementById('settings-bio') ? document.getElementById('settings-bio').value : '';
  const status = document.getElementById('settings-status') ? document.getElementById('settings-status').value : 'online';
  const profileColor = document.getElementById('settings-profile-color') ? document.getElementById('settings-profile-color').value : '#5865F2';

  if (!username) {
    showNotification('warning', 'Введите имя пользователя');
    return;
  }

  try {
    const data = await UsersAPI.updateProfile({ username, bio, profileColor });
    if (status) await AuthAPI.updateStatus(status);
    window.currentUser = Object.assign({}, window.currentUser, (data.user || {}), { status, profileColor });
    localStorage.setItem('user', JSON.stringify(window.currentUser));
    
    // Sync all UI locations
    updateUserPanel();
    updateProfilePopover();

    const usernameDisplay = document.getElementById('settings-username-display');
    if (usernameDisplay) {
      usernameDisplay.textContent = username;
      if (window.currentUser.role === 'owner') usernameDisplay.innerHTML += ' 👑';
    }
    
    const statusDisplay = document.getElementById('settings-status-display');
    if (statusDisplay) statusDisplay.textContent = getStatusText(status);

    showNotification('success', 'Профиль обновлён');
    checkProfileChanges();
  } catch (error) {
    showNotification('error', error.message || 'Ошибка сохранения');
  }
}

async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Показываем превью сразу после выбора файла
  const settingsAvatar = document.getElementById('settings-avatar');
  if (settingsAvatar && file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      settingsAvatar.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  try {
    const data = await UsersAPI.uploadAvatar(file);
    const avatarUrl = data.user?.avatar || data.url;
    window.currentUser.avatar = avatarUrl;
    localStorage.setItem('user', JSON.stringify(window.currentUser));

    if (settingsAvatar) {
      const resolvedUrl = getAvatarUrl(avatarUrl);
      // Добавляем timestamp только если это не data: URL
      if (!avatarUrl.startsWith('data:')) {
        settingsAvatar.src = avatarUrl + '?t=' + Date.now();
      } else {
        settingsAvatar.src = avatarUrl;
      }
    }
    
    updateUserPanel();
    showNotification('success', 'Аватар обновлен');
  } catch (error) {
    // Если ошибка, возвращаем старый аватар
    if (settingsAvatar && window.currentUser.avatar) {
      settingsAvatar.src = getAvatarUrl(window.currentUser.avatar);
    }
    showNotification('error', error.message || 'Ошибка загрузки аватара');
  }
}

// ===== ТЕМА =====
function setTheme(theme, el) {
  document.body.classList.remove('light-theme', 'space-theme', 'dark-blue-theme', 'purple-theme', 'amoled-theme', 'cyberpunk-theme', 'green-theme', 'gradient-theme');
  if (theme === 'light') document.body.classList.add('light-theme');
  if (theme === 'space') document.body.classList.add('space-theme');
  if (theme === 'dark-blue') document.body.classList.add('dark-blue-theme');
  if (theme === 'purple') document.body.classList.add('purple-theme');
  if (theme === 'amoled') document.body.classList.add('amoled-theme');
  if (theme === 'cyberpunk') document.body.classList.add('cyberpunk-theme');
  if (theme === 'green') document.body.classList.add('green-theme');
  if (theme === 'gradient') document.body.classList.add('gradient-theme');
  
  localStorage.setItem('love-theme', theme);
  
  if (el) {
    el.closest('.theme-options').querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
  }
}

// ===== НАСТРОЙКИ СЕРВЕРА =====
function showServerSettings() {
  const server = window.currentServer;
  if (!server) return;

  const nameInput = document.getElementById('server-settings-name');
  const descInput = document.getElementById('server-settings-desc');

  if (nameInput) nameInput.value = server.name || '';
  if (descInput) descInput.value = server.description || '';

  // Visibility of dangerous actions
  const isOwner = server.owner === window.currentUser?._id || server.owner?._id === window.currentUser?._id;
  const deleteBtn = document.getElementById('delete-server-item');
  if (deleteBtn) deleteBtn.style.display = isOwner ? 'block' : 'none';

  // Инвайт-код
  if (server.invites && server.invites.length > 0) {
    const codeEl = document.getElementById('server-invite-code');
    if (codeEl) codeEl.textContent = server.invites[server.invites.length - 1].code || '------';
  } else {
    loadServerInvite(server._id);
  }

  // Участники
  const membersList = document.getElementById('server-members-list');
  if (membersList && server.members) {
    membersList.innerHTML = ''; // Очищаем безопасно
    
    server.members.forEach(function(m) {
      const user = m.user || m;
      
      // Создаем элемент участника через DOM API
      const memberItem = document.createElement('div');
      memberItem.className = 'server-member-item';
      
      const avatar = document.createElement('img');
      avatar.className = 'server-member-avatar';
      avatar.src = getAvatarUrl(user.avatar);
      avatar.alt = escapeHtml(user.username);
      
      const memberInfo = document.createElement('div');
      memberInfo.className = 'server-member-info';
      
      const memberName = document.createElement('div');
      memberName.className = 'server-member-name';
      memberName.textContent = user.username; // ИСПРАВЛЕНО: Безопасно через textContent
      
      if (user.role === 'owner') {
        const crownSpan = document.createElement('span');
        crownSpan.title = 'Создатель';
        crownSpan.textContent = ' 👑';
        memberName.appendChild(crownSpan);
      }
      
      const memberRole = document.createElement('div');
      memberRole.className = 'server-member-role';
      memberRole.textContent = m.roles ? m.roles.join(', ') : 'участник';
      
      memberInfo.appendChild(memberName);
      memberInfo.appendChild(memberRole);
      
      memberItem.appendChild(avatar);
      memberItem.appendChild(memberInfo);
      
      membersList.appendChild(memberItem);
    });
  }

  // Categories
  renderServerCategories();

  openModal('server-settings-modal');
}
async function loadServerInvite(serverId) {
  try {
    const data = await ServersAPI.createInvite(serverId);
    const codeEl = document.getElementById('server-invite-code');
    if (codeEl) codeEl.textContent = data.inviteCode || data.code || '------';
  } catch (e) {
    console.error('Error loading invite:', e);
  }
}

/**
 * Рендер списка категорий в настройках
 */
function renderServerCategories() {
  const container = document.getElementById('server-categories-list');
  if (!container || !window.currentServer) return;

  const categories = window.currentServer.categories || [];
  
  if (categories.length === 0) {
    container.innerHTML = '<div class="settings-empty">Категорий пока нет</div>';
    return;
  }

  // Очищаем контейнер безопасно
  container.innerHTML = '';
  
  categories.forEach(cat => {
    const categoryItem = document.createElement('div');
    categoryItem.className = 'category-settings-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = cat.name; // ИСПРАВЛЕНО: Безопасно через textContent
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'settings-action-btn danger';
    deleteBtn.textContent = 'Удалить';
    deleteBtn.addEventListener('click', () => deleteServerCategory(cat._id));
    
    categoryItem.appendChild(nameSpan);
    categoryItem.appendChild(deleteBtn);
    
    container.appendChild(categoryItem);
  });
}

/**
 * Добавить категорию (настройки)
 */
async function addServerCategory() {
  const input = document.getElementById('new-category-name');
  const name = input ? input.value.trim() : '';

  if (!name) {
    showNotification('warning', 'Название не может быть пустым');
    return;
  }

  try {
    const data = await ServersAPI.addCategory(window.currentServer._id, name);
    window.currentServer.categories = data.categories;
    renderServerCategories();
    if (input) input.value = '';
    showNotification('success', 'Категория добавлена');
    // Refresh main UI
    renderServerChannels(window.currentServer);
  } catch (error) {
    showNotification('error', error.message || 'Ошибка');
  }
}

/**
 * Удалить категорию (настройки)
 */
async function deleteServerCategory(categoryId) {
  Modal.confirm({
    title: 'Удалить категорию',
    body: 'Вы действительно хотите удалить эту категорию? (Каналы останутся, но будут без категории)',
    confirmText: 'Удалить',
    isDanger: true,
    onConfirm: async () => {
      try {
        const data = await ServersAPI.deleteCategory(window.currentServer._id, categoryId);
        window.currentServer.categories = data.categories;
        renderServerCategories();
        showNotification('success', 'Категория удалена');
        // Refresh main UI
        renderServerChannels(window.currentServer);
      } catch (error) {
        showNotification('error', error.message || 'Ошибка');
      }
    }
  });
}

window.addServerCategory = addServerCategory;
window.deleteServerCategory = deleteServerCategory;

function showServerSettingsTab(tab, el) {
  document.querySelectorAll('#server-settings-modal .settings-tab').forEach(function(t) { t.classList.add('hidden'); });
  document.querySelectorAll('#server-settings-modal .settings-nav-item').forEach(function(i) { i.classList.remove('active'); });

  const tabEl = document.getElementById('server-settings-' + tab);
  if (tabEl) tabEl.classList.remove('hidden');
  if (el) el.classList.add('active');
}

async function saveServerSettings() {
  const nameEl = document.getElementById('server-settings-name');
  const descEl = document.getElementById('server-settings-desc');
  const name = nameEl ? nameEl.value.trim() : '';
  const description = descEl ? descEl.value : '';

  if (!window.currentServer) return;
  if (!name) { showNotification('warning', 'Введите название сервера'); return; }

  try {
    const data = await ServersAPI.update(window.currentServer._id, { name, description });
    window.currentServer = Object.assign({}, window.currentServer, (data.server || { name, description }));
    const headerTitle = document.getElementById('server-header-title');
    if (headerTitle) headerTitle.textContent = name;
    showNotification('success', 'Настройки сервера сохранены');
    closeModal('server-settings-modal');
    await loadServers();
  } catch (error) {
    showNotification('error', error.message || 'Ошибка сохранения');
  }
}

async function regenerateInviteCode() {
  if (!window.currentServer) return;
  try {
    const data = await ServersAPI.createInvite(window.currentServer._id);
    const codeEl = document.getElementById('server-invite-code');
    if (codeEl) codeEl.textContent = data.inviteCode || data.code || '------';
    showNotification('success', 'Новый код создан');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка');
  }
}

function copyInviteCode() {
  const code = document.getElementById('server-invite-code') ? document.getElementById('server-invite-code').textContent : '';
  if (code && code !== '------') {
    navigator.clipboard.writeText(code).then(function() { showNotification('success', 'Код скопирован'); });
  }
}

// ===== CUSTOM CONFIRM SYSTEM =====
const Modal = {
  confirm: function({ title, body, confirmText, onConfirm, isDanger = false }) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const bodyEl = document.getElementById('confirm-body');
    const okBtn = document.getElementById('confirm-ok');
    
    if (!modal || !okBtn) return;
    
    titleEl.textContent = title || 'Подтверждение';
    bodyEl.textContent = body || 'Вы уверены?';
    okBtn.textContent = confirmText || 'Продолжить';
    
    // Danger styling
    okBtn.className = isDanger ? 'modal-btn danger-btn' : 'modal-btn primary';
    
    // Create new element to clear old event listeners
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    newOkBtn.addEventListener('click', () => {
      onConfirm();
      closeModal('confirm-modal');
    });
    
    openModal('confirm-modal');
  }
};

window.Modal = Modal;

/**
 * Удалить канал на сервере
 */
function deleteChannelConfirm(channelId) {
  Modal.confirm({
    title: 'Удалить канал',
    body: 'Вы уверены, что хотите удалить этот канал? Все сообщения будут навсегда удалены.',
    confirmText: 'Удалить канал',
    isDanger: true,
    onConfirm: async () => {
      try {
        await ChannelsAPI.delete(channelId);
        showNotification('success', 'Канал удален');
        
        // Refresh server
        if (window.currentServer) {
          const data = await ServersAPI.get(window.currentServer._id);
          window.currentServer = data.server;
          renderServerChannels(data.server);
          
          if (window.currentChannelId === channelId) {
            showWelcomeView();
          }
        }
      } catch (error) {
        showNotification('error', 'Не удалось удалить канал');
      }
    }
  });
}

window.deleteChannelConfirm = deleteChannelConfirm;

async function deleteServer() {
  if (!window.currentServer) return;
  // Если это комната (settings.kind === 'room'), показываем
  // понятный пользователю текст без слова "сервер".
  const isRoom = window.currentServer.settings && window.currentServer.settings.kind === 'room';
  const titleText = isRoom ? 'Удалить комнату?' : 'Удаление сервера';
  const bodyText = isRoom
    ? 'Это действие нельзя отменить. Комната будет удалена для всех участников.'
    : `Вы действительно хотите удалить "${window.currentServer.name}"? Это действие необратимо!`;
  const okText = isRoom ? 'Удалить комнату' : 'Удалить сервер';
  const successText = isRoom ? 'Комната удалена' : 'Сервер удален';
  const errorText = isRoom ? 'Ошибка удаления комнаты' : 'Ошибка удаления сервера';

  Modal.confirm({
    title: titleText,
    body: bodyText,
    confirmText: okText,
    isDanger: true,
    onConfirm: async () => {
      try {
        await ServersAPI.delete(window.currentServer._id);
        closeModal('server-settings-modal');
        // Закрываем room settings panel, если был открыт
        if (typeof window.RoomsUI?.closeSettingsPanel === 'function') {
          window.RoomsUI.closeSettingsPanel();
        }
        window.currentServer = null;
        if (typeof exitRoomMode === 'function') exitRoomMode();
        if (typeof showWelcomeView === 'function') showWelcomeView();
        else showDMView();
        await loadServers();
        showNotification('success', successText);
      } catch (error) {
        showNotification('error', error.message || errorText);
      }
    }
  });
}

async function leaveServer() {
  if (!window.currentServer) return;
  const isRoom = window.currentServer.settings && window.currentServer.settings.kind === 'room';

  Modal.confirm({
    title: isRoom ? 'Выйти из комнаты?' : 'Покинуть сервер',
    body: isRoom
      ? `Вы перестанете быть участником "${window.currentServer.name}".`
      : `Вы действительно хотите покинуть "${window.currentServer.name}"?`,
    confirmText: isRoom ? 'Выйти' : 'Покинуть',
    isDanger: true,
    onConfirm: async () => {
      try {
        await ServersAPI.leave(window.currentServer._id);
        closeModal('server-settings-modal');
        if (typeof window.RoomsUI?.closeSettingsPanel === 'function') {
          window.RoomsUI.closeSettingsPanel();
        }
        window.currentServer = null;
        if (typeof exitRoomMode === 'function') exitRoomMode();
        if (typeof showWelcomeView === 'function') showWelcomeView();
        else showDMView();
        await loadServers();
        showNotification('success', isRoom ? 'Вы покинули комнату' : 'Вы покинули сервер');
      } catch (error) {
        showNotification('error', error.message || 'Ошибка');
      }
    }
  });
}

// ===== КОНТЕКСТНОЕ МЕНЮ =====
let contextMenuTarget = null;

function showContextMenu(e, messageId, authorId) {
  e.preventDefault();
  contextMenuTarget = { messageId, authorId };

  const oldMenu = document.querySelector('.context-menu');
  if (oldMenu) oldMenu.remove();

  const isOwn = authorId === (window.currentUser && window.currentUser._id);

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML =
    '<div class="context-menu-item emoji-reactions">' +
      '<div class="quick-reactions">' +
        '<span onclick="addQuickReaction(\'👍\')">👍</span>' +
        '<span onclick="addQuickReaction(\'❤️\')">❤️</span>' +
        '<span onclick="addQuickReaction(\'😂\')">😂</span>' +
        '<span onclick="addQuickReaction(\'😮\')">😮</span>' +
        '<span onclick="addQuickReaction(\'😢\')">😢</span>' +
        '<span onclick="addQuickReaction(\'🔥\')">🔥</span>' +
      '</div>' +
    '</div>' +
    '<div class="context-menu-divider"></div>' +
    '<div class="context-menu-item" onclick="replyToMessage()">💬 Ответить</div>' +
    '<div class="context-menu-item" onclick="pinMessageFromContext()">📌 Закрепить</div>' +
    (isOwn ?
      '<div class="context-menu-item" onclick="editMessage()">✏️ Редактировать</div>' +
      '<div class="context-menu-item danger" onclick="deleteMessage()">🗑️ Удалить</div>'
    : '');

  document.body.appendChild(menu);

  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - 250);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  setTimeout(function() {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 10);
}

function hideContextMenu() {
  const menu = document.querySelector('.context-menu');
  if (menu) menu.remove();
  contextMenuTarget = null;
}

function replyToMessage() {
  if (contextMenuTarget && typeof startReply === 'function') {
    startReply(contextMenuTarget.messageId);
  }
  hideContextMenu();
}

function editMessage() {
  if (contextMenuTarget && typeof startEditMessage === 'function') {
    startEditMessage(contextMenuTarget.messageId);
  }
  hideContextMenu();
}

function deleteMessage() {
  if (contextMenuTarget && typeof confirmDeleteMessage === 'function') {
    confirmDeleteMessage(contextMenuTarget.messageId);
  }
  hideContextMenu();
}

function addQuickReaction(emoji) {
  if (contextMenuTarget && typeof socketReactMessage === 'function') {
    socketReactMessage(contextMenuTarget.messageId, emoji);
  }
  hideContextMenu();
}

function pinMessageFromContext() {
  if (contextMenuTarget && typeof pinMessage === 'function') {
    const messageEl = document.querySelector(`[data-message-id="${contextMenuTarget.messageId}"]`);
    if (messageEl) {
      const channelId = window.currentChannelId;
      if (channelId) {
        pinMessage(contextMenuTarget.messageId, channelId);
      }
    }
  }
  hideContextMenu();
}

// ===== ПРОСМОТР ИЗОБРАЖЕНИЙ =====
function openImageViewer(url) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <div class="image-viewer" role="dialog" aria-label="Просмотр изображения">
      <div class="image-viewer-toolbar">
        <button type="button" class="image-viewer-tool" data-action="zoom-out" title="Уменьшить">−</button>
        <button type="button" class="image-viewer-tool" data-action="reset" title="Сбросить масштаб">100%</button>
        <button type="button" class="image-viewer-tool" data-action="zoom-in" title="Увеличить">+</button>
        <button type="button" class="image-viewer-close" data-action="close" title="Закрыть">✕</button>
      </div>
      <div class="image-viewer-stage">
        <img src="${url}" alt="Image" draggable="false">
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const viewer = overlay.querySelector('.image-viewer');
  const img = overlay.querySelector('img');
  const resetBtn = overlay.querySelector('[data-action="reset"]');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;

  function applyTransform() {
    img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    if (resetBtn) resetBtn.textContent = `${Math.round(scale * 100)}%`;
    viewer.classList.toggle('is-zoomed', scale > 1);
  }

  function setScale(nextScale) {
    scale = Math.min(5, Math.max(0.25, nextScale));
    if (scale <= 1) {
      offsetX = 0;
      offsetY = 0;
    }
    applyTransform();
  }

  overlay.addEventListener('click', function(e) {
    const action = e.target?.dataset?.action;
    if (action === 'close' || e.target === overlay) {
      overlay.remove();
      return;
    }
    if (action === 'zoom-in') setScale(scale + 0.25);
    if (action === 'zoom-out') setScale(scale - 0.25);
    if (action === 'reset') setScale(1);
  });

  overlay.addEventListener('wheel', function(e) {
    e.preventDefault();
    setScale(scale + (e.deltaY < 0 ? 0.15 : -0.15));
  }, { passive: false });

  img.addEventListener('dblclick', function() {
    setScale(scale > 1 ? 1 : 2);
  });

  img.addEventListener('pointerdown', function(e) {
    if (scale <= 1) return;
    dragging = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;
    img.setPointerCapture(e.pointerId);
  });

  img.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
    applyTransform();
  });

  img.addEventListener('pointerup', function(e) {
    dragging = false;
    img.releasePointerCapture(e.pointerId);
  });
}

// ===== EMOJI INPUT =====
function insertEmojiIntoInput(emoji) {
  const input = document.getElementById('message-input');
  if (!input) return;

  input.focus();
  
  // Для textarea используем другой подход
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const text = input.value;
  const before = text.substring(0, start);
  const after = text.substring(end);
  
  input.value = before + emoji + after;
  input.selectionStart = input.selectionEnd = start + emoji.length;
  
  // Триггерим событие input для авто-ресайза
  input.dispatchEvent(new Event('input'));
}

// ===== AUTO RESIZE TEXTAREA =====
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}
/**
 * Загрузка истории входов
 */
async function loadLoginLogs() {
  const list = document.getElementById('login-logs-list');
  if (!list) return;
  await refreshSecurityUserState();
  syncSecurityAccountFields();
  
  try {
    list.innerHTML = '<div class="logs-loading">Загрузка данных...</div>';
    
    const data = await AuthAPI.getLoginLogs();
    const logs = data.logs || [];

    if (logs.length === 0) {
      list.innerHTML = '<div class="logs-empty">История входов пуста</div>';
      return;
    }

    // currentSid приходит с backend (req.sid из верифицированного токена).
    // НЕ парсим JWT в renderer — это нарушение security-модели.
    const currentSid = data.currentSid || null;

    list.innerHTML = '';
    
    // Разделяем на текущую и остальные
    const currentSession = logs.find(l => l._id === currentSid);
    const otherSessions = logs.filter(l => l._id !== currentSid);

    if (currentSession) {
      const title = document.createElement('div');
      title.className = 'log-category-title';
      title.textContent = 'Текущий сеанс';
      list.appendChild(title);
      renderLogItem(currentSession, list, true, currentSid);
    }

    if (otherSessions.length > 0) {
      const title = document.createElement('div');
      title.className = 'log-category-title';
      title.textContent = 'Другие входы';
      list.appendChild(title);
      otherSessions.forEach(log => renderLogItem(log, list, false, currentSid));
    }
    
  } catch (error) {
    console.error('Failed to load logs:', error);
    list.innerHTML = '<div class="logs-empty">Ошибка загрузки истории</div>';
  }
}

async function refreshSecurityUserState() {
  try {
    const data = await AuthAPI.getMe();
    if (data.user) {
      window.currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
    }
  } catch (error) {
    console.error('Failed to refresh security user state:', error);
  }
}

/**
 * Вспомогательная функция для отрисовки элемента лога
 */
function renderLogItem(log, container, isCurrent, currentSid) {
  const item = document.createElement('div');
  item.className = 'login-log-item';
  item.id = `log-${log._id}`;
  
  const date = new Date(log.timestamp).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  
  // Парсим User-Agent
  let device = 'Неизвестное устройство';
  const ua = log.userAgent || '';
  if (ua.includes('Electron')) device = 'Приложение Love (Electron)';
  else if (ua.includes('Chrome')) device = 'Google Chrome';
  else if (ua.includes('Firefox')) device = 'Mozilla Firefox';
  else if (ua.includes('Safari')) device = 'Apple Safari';
  else if (ua.includes('Mobile')) device = 'Моб. устройство';
  
  const statusText = { success: 'Успешно', failed: 'Ошибка', locked: 'Блок' };
  const methodText = { password: 'Email и пароль', google: 'Google' };
  
  item.innerHTML = `
    <div class="log-info">
      <div class="log-ip-row">
        <span class="log-ip">${log.ip}</span>
        ${isCurrent ? '<span class="log-status-badge current">Текущий</span>' : 
          `<span class="log-status-badge ${log.status}">${statusText[log.status]}</span>`}
      </div>
      <div class="log-location">${log.location || 'Местоположение неизвестно'}</div>
      <div class="log-device">${device}</div>
      <div class="log-device">Способ входа: ${methodText[log.loginMethod] || 'Неизвестно'}</div>
      <div class="log-time">${date}</div>
    </div>
    <button class="log-delete-btn" onclick="deleteLoginLogRecord('${log._id}', ${JSON.stringify(log._id === currentSid)})" title="${isCurrent ? 'Завершить этот сеанс' : 'Удалить запись'}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
  `;
  
  container.appendChild(item);
}

function syncSecurityAccountFields() {
  const usernameInput = document.getElementById('security-username-input');
  if (usernameInput && window.currentUser?.username) {
    usernameInput.value = window.currentUser.username;
  }

  const usernamePassword = document.getElementById('security-username-password');
  if (usernamePassword) usernamePassword.classList.toggle('hidden', !window.currentUser?.hasPassword);

  const passwordAlert = document.getElementById('security-password-alert');
  if (passwordAlert) passwordAlert.classList.toggle('hidden', Boolean(window.currentUser?.hasPassword));

  const securityNav = document.getElementById('settings-security-nav');
  if (securityNav) securityNav.classList.toggle('security-attention', !window.currentUser?.hasPassword);

  const twoFactorToggle = document.getElementById('security-2fa-toggle');
  if (twoFactorToggle) {
    twoFactorToggle.checked = Boolean(window.currentUser?.twoFactorEnabled);
    twoFactorToggle.disabled = !window.currentUser?.hasPassword;
  }

  const hint = document.getElementById('security-username-hint');
  if (!hint) return;

  const changedAt = window.currentUser?.usernameChangedAt ? new Date(window.currentUser.usernameChangedAt) : null;
  if (!changedAt) {
    hint.textContent = 'Имя пользователя можно менять один раз в 7 дней.';
    return;
  }

  const availableAt = new Date(changedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  hint.textContent = Date.now() < availableAt.getTime()
    ? `Следующая смена имени доступна ${availableAt.toLocaleString('ru-RU')}.`
    : 'Имя пользователя можно менять один раз в 7 дней.';
}

async function changeSecurityUsername() {
  const input = document.getElementById('security-username-input');
  const username = input?.value.trim();
  if (!username) return;

  try {
    const currentPassword = document.getElementById('security-username-password')?.value || '';
    const data = await UsersAPI.updateProfile({ username, currentPassword });
    window.currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(data.user));
    syncSecurityAccountFields();
    if (typeof showNotification === 'function') showNotification('success', 'Имя пользователя изменено');
  } catch (error) {
    if (typeof showNotification === 'function') showNotification('error', error.message || 'Не удалось изменить имя');
  }
}

async function toggleEmailTwoFactor(enabled) {
  const toggle = document.getElementById('security-2fa-toggle');
  try {
    const data = await AuthAPI.toggleTwoFactor(enabled);
    window.currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(data.user));
    syncSecurityAccountFields();
    if (typeof showNotification === 'function') showNotification('success', data.message || 'Настройки 2FA обновлены');
  } catch (error) {
    if (toggle) toggle.checked = !enabled;
    if (typeof showNotification === 'function') showNotification('error', error.message || 'Не удалось обновить 2FA');
  }
}

async function changeSecurityPassword() {
  const currentPassword = document.getElementById('security-current-password')?.value || '';
  const newPassword = document.getElementById('security-new-password')?.value || '';
  const confirmPassword = document.getElementById('security-confirm-password')?.value || '';

  if (!newPassword || newPassword !== confirmPassword) {
    if (typeof showNotification === 'function') showNotification('error', 'Новые пароли не совпадают');
    return;
  }

  try {
    await AuthAPI.changePassword(currentPassword, newPassword);
    const data = await AuthAPI.getMe();
    if (data.user) {
      window.currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    ['security-current-password', 'security-new-password', 'security-confirm-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    syncSecurityAccountFields();
    if (typeof showNotification === 'function') showNotification('success', 'Пароль изменен');
  } catch (error) {
    if (typeof showNotification === 'function') showNotification('error', error.message || 'Не удалось изменить пароль');
  }
}

/**
 * Удаление записи лога
 */
async function deleteLoginLogRecord(logId, isCurrentSession = false) {
  try {
    const item = document.getElementById(`log-${logId}`);
    if (item) item.style.opacity = '0.5';
    
    await AuthAPI.deleteLoginLog(logId);

    if (isCurrentSession) {
      await clearAuthToken();
      localStorage.removeItem('user');
      window.currentUser = null;
      if (typeof disconnectSocket === 'function') disconnectSocket();
      if (typeof closeModal === 'function') closeModal('settings-modal');
      if (typeof showAuthScreen === 'function') {
        showAuthScreen();
      } else {
        document.getElementById('app')?.classList.add('hidden');
        document.getElementById('login-screen')?.classList.remove('hidden');
        document.getElementById('register-screen')?.classList.add('hidden');
      }
      return;
    }
    
    if (item) {
      item.style.transform = 'translateX(20px)';
      item.style.opacity = '0';
      setTimeout(() => item.remove(), 200);
    }
  } catch (error) {
    console.error('Failed to delete log:', error);
    if (typeof showNotification === 'function') {
      showNotification('error', 'Не удалось удалить запись');
    }
  }
}

// Экспортируем функции в глобальную область
window.loadLoginLogs = loadLoginLogs;
window.deleteLoginLogRecord = deleteLoginLogRecord;
window.changeSecurityUsername = changeSecurityUsername;
window.changeSecurityPassword = changeSecurityPassword;
window.toggleEmailTwoFactor = toggleEmailTwoFactor;
