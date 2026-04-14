/**
 * Founder Privileges System
 * Система привилегий для создателя приложения
 */

// ID создателя (твой ID)
const FOUNDER_ID = '69b26a1f2ab0c77d91a105d4';
const FOUNDER_EMAIL = 'putinalnksandr@gmail.com';

class FounderSystem {
  constructor() {
    this.isFounder = false;
    this.privileges = {
      rainbowName: true,
      crownBadge: true,
      customColors: true,
      animatedAvatar: true,
      glowEffect: true,
      invisibleMode: false,
      godMode: false,
      viewDeletedMessages: false,
      bypassLimits: true,
      adminPanel: true
    };
  }

  // Проверка является ли пользователь создателем (должно совпадать с server/utils/founder.js)
  checkFounder(user) {
    if (!user) return false;

    this.founderUserId = user._id;
    this.isFounder = !!(
      user.isFounder ||
      user._id === FOUNDER_ID ||
      user.email === FOUNDER_EMAIL ||
      (user.badges && user.badges.includes('founder')) ||
      user.role === 'admin' ||
      user.role === 'owner'
    );

    if (this.isFounder) {
      console.log('👑 FOUNDER MODE ACTIVATED');
      this.activatePrivileges();
    }

    return this.isFounder;
  }

  // Активация привилегий
  activatePrivileges() {
    // Добавляем класс к body для CSS стилей
    document.body.classList.add('founder-mode');
    
    // Применяем визуальные эффекты
    if (this.privileges.rainbowName) {
      this.applyRainbowName();
    }
    
    if (this.privileges.crownBadge) {
      this.applyCrownBadge();
    }
    
    if (this.privileges.glowEffect) {
      this.applyGlowEffect();
    }
    
    // Показываем админ-панель в настройках
    if (this.privileges.adminPanel) {
      this.showAdminPanel();
    }
    
    // Уведомление
    setTimeout(() => {
      showNotification('success', 'Привилегии создателя активированы', '👑 FOUNDER MODE');
    }, 1000);
  }

  // Радужное имя
  applyRainbowName() {
    const style = document.createElement('style');
    style.id = 'founder-rainbow-style';
    style.textContent = `
      @keyframes rainbow {
        0% { color: #ff0000; }
        16% { color: #ff7f00; }
        33% { color: #ffff00; }
        50% { color: #00ff00; }
        66% { color: #0000ff; }
        83% { color: #8b00ff; }
        100% { color: #ff0000; }
      }
      
      .founder-name {
        animation: rainbow 3s linear infinite;
        font-weight: 700;
        text-shadow: 0 0 10px currentColor;
      }
      
      .founder-mode .message-author:has(.founder-crown),
      .founder-mode #settings-username-display,
      .founder-mode .profile-banner-name {
        animation: rainbow 3s linear infinite;
        font-weight: 700;
        text-shadow: 0 0 10px currentColor;
      }
    `;
    document.head.appendChild(style);
  }

  // Корона рядом с именем
  applyCrownBadge() {
    // Добавляем корону ко всем именам пользователя
    const observer = new MutationObserver(() => {
      this.addCrownToNames();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    this.addCrownToNames();
  }

  addCrownToNames() {
    if (!window.currentUser || !this.isFounder) return;
    const uid = window.currentUser._id;

    // Добавляем корону к именам в сообщениях
    document.querySelectorAll('.message-author').forEach(author => {
      const messageEl = author.closest('[data-author-id]');
      if (messageEl && messageEl.dataset.authorId === uid) {
        if (!author.querySelector('.founder-crown')) {
          const crown = document.createElement('span');
          crown.className = 'founder-crown';
          crown.textContent = ' 👑';
          crown.title = 'Создатель Love';
          crown.style.cssText = 'font-size: 1.1em; filter: drop-shadow(0 0 5px gold);';
          author.appendChild(crown);
        }
      }
    });
    
    // Добавляем корону в профиль
    const profileName = document.getElementById('settings-username-display');
    if (profileName && !profileName.querySelector('.founder-crown')) {
      const crown = document.createElement('span');
      crown.className = 'founder-crown';
      crown.textContent = ' 👑';
      crown.title = 'Создатель Love';
      crown.style.cssText = 'font-size: 1.2em; filter: drop-shadow(0 0 8px gold);';
      profileName.appendChild(crown);
    }
  }

  // Эффект свечения
  applyGlowEffect() {
    const uid = this.founderUserId || FOUNDER_ID;
    const style = document.createElement('style');
    style.id = 'founder-glow-style';
    style.textContent = `
      @keyframes founderGlow {
        0%, 100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.4); }
        50% { box-shadow: 0 0 30px rgba(255, 215, 0, 1), 0 0 60px rgba(255, 215, 0, 0.6); }
      }
      
      .founder-mode .message-avatar[src*="${uid}"],
      .founder-mode .profile-avatar {
        animation: founderGlow 2s ease-in-out infinite;
        border: 2px solid gold;
      }
      
      .founder-mode [data-author-id="${uid}"] {
        background: linear-gradient(90deg, 
          rgba(255, 215, 0, 0.05) 0%, 
          rgba(255, 215, 0, 0.1) 50%, 
          rgba(255, 215, 0, 0.05) 100%);
        border-left: 3px solid gold;
      }
    `;
    document.head.appendChild(style);
  }

  // Показать админ-панель
  showAdminPanel() {
    // Добавляем вкладку в настройки
    const settingsSidebar = document.querySelector('.settings-sidebar');
    if (settingsSidebar && !document.getElementById('founder-admin-tab')) {
      const divider = document.createElement('div');
      divider.className = 'settings-divider';
      
      const adminTab = document.createElement('div');
      adminTab.id = 'founder-admin-tab';
      adminTab.className = 'settings-nav-item';
      adminTab.style.cssText = 'background: linear-gradient(90deg, rgba(255,215,0,0.1), rgba(255,215,0,0.2)); border-left: 3px solid gold;';
      adminTab.innerHTML = '👑 Админ-панель';
      adminTab.onclick = () => {
        showSettingsTab('founder-admin', adminTab);
        // Загружаем статистику при открытии
        this.loadStats();
      };
      
      // Вставляем перед кнопкой "Выйти"
      const logoutBtn = settingsSidebar.querySelector('.settings-nav-item.danger');
      if (logoutBtn) {
        logoutBtn.parentNode.insertBefore(divider, logoutBtn);
        logoutBtn.parentNode.insertBefore(adminTab, logoutBtn);
      }
      
      // Создаем контент админ-панели
      this.createAdminPanelContent();
      
      // Настраиваем обработчики socket событий
      this.setupSocketHandlers();
    }
  }

  // Обработчики founder:* зарегистрированы в socket.js (глобальный window.socket)
  setupSocketHandlers() {}

  // Загрузка статистики
  loadStats() {
    const s = window.socket;
    if (s && this.isFounder) {
      s.emit('founder:get_stats');

      if (!this.statsInterval) {
        this.statsInterval = setInterval(() => {
          if (window.socket && this.isFounder) {
            window.socket.emit('founder:get_stats');
          }
        }, 5000);
      }
    }
  }

  // Остановить обновление статистики
  stopStatsUpdate() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  // Отображение логов входа
  displayLogs(logs) {
    const list = Array.isArray(logs) ? logs : [];
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (t) => String(t || '').replace(/</g, '&lt;');

    let existing = document.getElementById('founder-logs-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'founder-logs-modal-overlay';
    overlay.className = 'modal-overlay';

    const rows = list
      .map((log) => {
        const u = log.userId && typeof log.userId === 'object' ? log.userId : null;
        const userLabel = u ? `${esc(u.username || '')} (${esc(u.email || '')})` : esc(log.email || '');
        const ts = log.timestamp ? new Date(log.timestamp).toLocaleString('ru-RU') : '—';
        return `<tr>
          <td>${ts}</td>
          <td>${userLabel}</td>
          <td>${esc(log.ip || '')}</td>
          <td>${esc(log.status || '')}</td>
          <td class="founder-log-location">${esc(log.location || '')}</td>
        </tr>`;
      })
      .join('');

    overlay.innerHTML = `
      <div class="modal founder-logs-modal" style="max-width: 900px; width: 95vw;">
        <div class="modal-header">
          <h2>📋 Логи входов</h2>
          <button type="button" class="modal-close" data-close-founders-logs>✕</button>
        </div>
        <div class="modal-body" style="overflow: auto; max-height: 70vh;">
          <table class="founder-logs-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Пользователь</th>
                <th>IP</th>
                <th>Статус</th>
                <th>Локация</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5">Нет записей</td></tr>'}</tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close-founders-logs>Закрыть</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-close-founders-logs]').forEach((btn) => {
      btn.addEventListener('click', () => overlay.remove());
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // Создать контент админ-панели
  createAdminPanelContent() {
    const settingsContent = document.querySelector('.settings-content');
    if (!settingsContent || document.getElementById('settings-founder-admin')) return;
    
    const adminPanel = document.createElement('div');
    adminPanel.id = 'settings-founder-admin';
    adminPanel.className = 'settings-tab hidden';
    adminPanel.innerHTML = `
      <h2 class="settings-title">👑 Админ-панель создателя</h2>
      <p style="color: var(--text-muted); margin-bottom: 24px;">
        Специальные привилегии и инструменты для создателя Love
      </p>
      
      <div class="settings-section">
        <h3 style="color: gold; margin-bottom: 16px;">⚡ Супер-способности</h3>
        
        <div class="settings-toggle-row">
          <div>
            <div class="settings-toggle-title">Невидимый режим</div>
            <div class="settings-toggle-desc">Быть онлайн но показываться оффлайн</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="founder-invisible-mode" onchange="window.founderSystem.togglePrivilege('invisibleMode', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <div class="settings-toggle-row">
          <div>
            <div class="settings-toggle-title">Просмотр удаленных сообщений</div>
            <div class="settings-toggle-desc">Видеть что было удалено</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="founder-view-deleted" onchange="window.founderSystem.togglePrivilege('viewDeletedMessages', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        
        <div class="settings-toggle-row">
          <div>
            <div class="settings-toggle-title">Бог-режим в голосовых</div>
            <div class="settings-toggle-desc">Контроль над всеми микрофонами</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="founder-god-mode" onchange="window.founderSystem.togglePrivilege('godMode', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      
      <div class="settings-section" style="margin-top: 32px;">
        <h3 style="color: gold; margin-bottom: 16px;">📊 Статистика (обновляется каждые 5 сек)</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="color: var(--text-muted); font-size: 12px;">Онлайн пользователей</div>
            <div style="font-size: 24px; font-weight: 700; color: #00ff00;" id="founder-stats-online">-</div>
          </div>
          <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="color: var(--text-muted); font-size: 12px;">Всего пользователей</div>
            <div style="font-size: 24px; font-weight: 700;" id="founder-stats-total">-</div>
          </div>
          <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="color: var(--text-muted); font-size: 12px;">Всего серверов</div>
            <div style="font-size: 24px; font-weight: 700;" id="founder-stats-servers">-</div>
          </div>
          <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
            <div style="color: var(--text-muted); font-size: 12px;">Сообщений сегодня</div>
            <div style="font-size: 24px; font-weight: 700;" id="founder-stats-messages">-</div>
          </div>
        </div>
      </div>
      
      <div class="settings-section" style="margin-top: 32px;">
        <h3 style="color: gold; margin-bottom: 16px;">🛠 Инструменты</h3>
        <button class="btn btn-primary" onclick="founderBroadcastMessage()" style="margin-right: 8px;">
          📢 Отправить объявление всем
        </button>
        <button class="btn btn-secondary" onclick="founderViewLogs()">
          📋 Просмотреть логи
        </button>
      </div>
      
      <div style="margin-top: 32px; padding: 16px; background: rgba(255, 215, 0, 0.1); border: 1px solid gold; border-radius: 8px;">
        <div style="font-weight: 700; color: gold; margin-bottom: 8px;">👑 Статус создателя</div>
        <div style="color: var(--text-muted); font-size: 14px;">
          Вы являетесь создателем Love. У вас есть полный доступ ко всем функциям и инструментам.
        </div>
      </div>
    `;
    
    settingsContent.appendChild(adminPanel);
  }

  // Переключить привилегию
  togglePrivilege(privilege, enabled) {
    this.privileges[privilege] = enabled;
    localStorage.setItem(`founder-${privilege}`, enabled);
    
    const messages = {
      invisibleMode: enabled ? 'Невидимый режим включен' : 'Невидимый режим выключен',
      viewDeletedMessages: enabled ? 'Просмотр удаленных сообщений включен' : 'Просмотр удаленных сообщений выключен',
      godMode: enabled ? 'Бог-режим включен' : 'Бог-режим выключен'
    };
    
    showNotification('success', messages[privilege] || 'Настройка обновлена');
  }

  // Получить привилегию
  hasPrivilege(privilege) {
    return this.isFounder && this.privileges[privilege];
  }
}

// Глобальный экземпляр
window.founderSystem = new FounderSystem();

// Функции для админ-панели
function founderBroadcastMessage() {
  // Создаем модальное окно для ввода сообщения
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>📢 Отправить объявление</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Сообщение для всех пользователей</label>
          <textarea id="broadcast-message" class="input" rows="4" placeholder="Введите текст объявления..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Отмена</button>
        <button class="btn btn-primary" onclick="sendBroadcast()">Отправить</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('broadcast-message').focus();
}

function sendBroadcast() {
  const message = document.getElementById('broadcast-message').value.trim();
  if (message) {
    if (window.socket) {
      window.socket.emit('founder:broadcast', { message });
    }
    showNotification('success', 'Объявление отправлено всем пользователям');
    document.querySelector('.modal-overlay').remove();
  } else {
    showNotification('warning', 'Введите текст объявления');
  }
}

function founderViewLogs() {
  if (window.socket && window.founderSystem.isFounder) {
    window.socket.emit('founder:get_logs', { limit: 100 });
    showNotification('info', 'Загрузка логов...');
  }
}

// Инициализация при загрузке пользователя
document.addEventListener('DOMContentLoaded', () => {
  // Проверяем через небольшую задержку, чтобы currentUser успел загрузиться
  setTimeout(() => {
    if (window.currentUser) {
      window.founderSystem.checkFounder(window.currentUser);
    }
  }, 500);
});
