/**
 * Settings Manager - управление настройками приложения
 */

class SettingsManager {
  constructor() {
    this.settings = this.loadSettings();
    this.applySettings();
  }

  // Загрузка настроек из localStorage
  loadSettings() {
    const defaults = {
      // Уведомления
      'notif-messages': true,
      'notif-friends': true,
      'notif-sound': true,
      'notif-mentions': true,
      'notif-preview': true,
      
      // Голос и видео
      'input-volume': 100,
      'output-volume': 100,
      'noise-suppression': true,
      'echo-cancellation': true,
      'auto-gain-control': true,
      'voice-activation': false,
      'default-screen-quality': 'medium',
      
      // Конфиденциальность
      'privacy-friend-requests': true,
      'privacy-server-invites': true,
      'privacy-online-status': true,
      'privacy-activity': true,
      'privacy-dm-from-servers': true,
      'privacy-typing-indicator': true,
      
      // Внешний вид
      'font-size': 'medium',
      'ui-scale': 100,
      'compact-mode': false,
      'animations': true,
      'show-avatars': true,
      'link-preview': true,
      'hd-emoji': true,
      
      // Язык и регион
      'app-language': 'ru',
      'time-format': '24',
      'date-format': 'dmy',
      'use-system-language': false,
      'app-timezone': 'auto'
    };

    const settings = {};
    for (const [key, defaultValue] of Object.entries(defaults)) {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        // Парсим boolean и числа
        if (saved === 'true') settings[key] = true;
        else if (saved === 'false') settings[key] = false;
        else if (!isNaN(saved)) settings[key] = Number(saved);
        else settings[key] = saved;
      } else {
        settings[key] = defaultValue;
      }
    }
    
    return settings;
  }

  // Сохранение настройки
  saveSetting(key, value) {
    this.settings[key] = value;
    localStorage.setItem(key, value);
    this.applySetting(key, value);
    if (['app-language', 'time-format', 'date-format', 'use-system-language', 'app-timezone'].includes(key)) {
      this.applyLocaleSettings();
    }
    // Применить переводы в реальном времени при смене языка
    if (key === 'app-language' || key === 'use-system-language') {
      const lang = this.getEffectiveLanguageCode();
      if (window.i18n && window.i18n.applyTranslations) {
        window.i18n.applyTranslations(lang);
      }
    }
  }

  // Применение всех настроек
  applySettings() {
    for (const [key, value] of Object.entries(this.settings)) {
      this.applySetting(key, value);
    }
    this.applyLocaleSettings();
    // Применить переводы при инициализации
    const lang = this.getEffectiveLanguageCode();
    if (window.i18n && window.i18n.applyTranslations) {
      window.i18n.applyTranslations(lang);
    } else {
      // i18n ещё не загружен — дождёмся DOMContentLoaded
      document.addEventListener('DOMContentLoaded', () => {
        if (window.i18n && window.i18n.applyTranslations) {
          window.i18n.applyTranslations(this.getEffectiveLanguageCode());
        }
      });
    }
  }

  // Применение конкретной настройки
  applySetting(key, value) {
    switch(key) {
      // Внешний вид
      case 'font-size':
        this.applyFontSize(value);
        break;
      case 'ui-scale':
        this.applyUIScale(value);
        break;
      case 'compact-mode':
        this.applyCompactMode(value);
        break;
      case 'animations':
        this.applyAnimations(value);
        break;
      case 'show-avatars':
        this.applyShowAvatars(value);
        break;
        
      // Голос
      case 'output-volume':
        this.applyOutputVolume(value);
        break;
    }
  }

  /** Язык интерфейса, формат даты/времени (для formatTime/formatDate в ui.js) */
  applyLocaleSettings() {
    const lang = this.getEffectiveLanguageCode();
    const map = {
      ru: 'ru-RU',
      en: 'en-US',
      uk: 'uk-UA',
      de: 'de-DE',
      fr: 'fr-FR',
      es: 'es-ES'
    };
    const tag = map[lang] || 'ru-RU';
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-locale', tag);
    window.dispatchEvent(new CustomEvent('app:locale-changed', { detail: { lang, tag } }));
  }

  getEffectiveLanguageCode() {
    if (this.settings['use-system-language']) {
      const nav = (navigator.language || 'ru').slice(0, 2);
      return nav || 'ru';
    }
    return this.settings['app-language'] || 'ru';
  }

  // Применение размера шрифта
  applyFontSize(size) {
    const sizes = {
      small: '14px',
      medium: '16px',
      large: '18px',
      xlarge: '20px'
    };
    document.documentElement.style.setProperty('--base-font-size', sizes[size] || sizes.medium);
  }

  // Применение масштаба UI
  applyUIScale(scale) {
    document.documentElement.style.fontSize = (16 * scale / 100) + 'px';
  }

  // Компактный режим
  applyCompactMode(enabled) {
    if (enabled) {
      document.body.classList.add('compact-mode');
    } else {
      document.body.classList.remove('compact-mode');
    }
  }

  // Анимации
  applyAnimations(enabled) {
    if (!enabled) {
      document.body.classList.add('no-animations');
    } else {
      document.body.classList.remove('no-animations');
    }
  }

  // Показывать аватары
  applyShowAvatars(enabled) {
    if (!enabled) {
      document.body.classList.add('hide-avatars');
    } else {
      document.body.classList.remove('hide-avatars');
    }
  }

  // Громкость выхода
  applyOutputVolume(volume) {
    document.querySelectorAll('#remote-audio-container audio').forEach(audio => {
      audio.volume = volume / 100;
    });
  }

  // Получить настройку
  get(key) {
    return this.settings[key];
  }
}

// Глобальный экземпляр
window.settingsManager = new SettingsManager();

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
  initializeSettingsUI();
});

// Инициализация UI настроек
function initializeSettingsUI() {
  // Слайдеры
  initSlider('input-volume', 'input-volume-value');
  initSlider('output-volume', 'output-volume-value');
  initSlider('ui-scale', 'ui-scale-value');

  // Чекбоксы
  const checkboxes = [
    'notif-messages', 'notif-friends', 'notif-sound', 'notif-mentions', 'notif-preview',
    'noise-suppression', 'echo-cancellation', 'auto-gain-control', 'voice-activation',
    'privacy-friend-requests', 'privacy-server-invites', 'privacy-online-status',
    'privacy-activity', 'privacy-dm-from-servers', 'privacy-typing-indicator',
    'compact-mode', 'animations', 'show-avatars', 'link-preview', 'hd-emoji',
    'use-system-language'
  ];
  
  checkboxes.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.checked = window.settingsManager.get(id);
      checkbox.addEventListener('change', (e) => {
        window.settingsManager.saveSetting(id, e.target.checked);
      });
    }
  });

  // Селекты
  const selects = ['font-size', 'default-screen-quality', 'app-language', 'time-format', 'date-format', 'app-timezone'];
  selects.forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.value = window.settingsManager.get(id);
      select.addEventListener('change', (e) => {
        window.settingsManager.saveSetting(id, e.target.value);
      });
    }
  });
}

// Инициализация слайдера
function initSlider(sliderId, valueId) {
  const slider = document.getElementById(sliderId);
  const valueDisplay = document.getElementById(valueId);
  
  if (slider && valueDisplay) {
    const savedValue = window.settingsManager.get(sliderId);
    slider.value = savedValue;
    valueDisplay.textContent = savedValue;
    
    slider.addEventListener('input', (e) => {
      const value = e.target.value;
      valueDisplay.textContent = value;
      window.settingsManager.saveSetting(sliderId, Number(value));
    });
  }
}
