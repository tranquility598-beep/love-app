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
      'voice-input-device': 'default',
      'voice-output-device': 'default',
      'input-volume': 100,
      'output-volume': 100,
      'noise-suppression': true,
      'echo-cancellation': true,
      'auto-gain-control': true,
      'voice-activation': false,
      'default-screen-quality': 'ultra',

      // Конфиденциальность
      'privacy-friend-requests': true,
      'privacy-server-invites': true,
      'privacy-online-status': true,
      'privacy-activity': true,
      'privacy-dm-from-servers': true,
      'privacy-typing-indicator': true,
      // Спрашивать перед переходом по ссылке на чужой сайт (свои домены — молча).
      // Тот же ключ на мобиле: mobile/lib/src/core/prefs/love_prefs.dart.
      'love_link_warning': true,
      
      // Внешний вид
      'app-theme': 'dark', // dark | light | system
      'font-size': 'medium',
      'ui-scale': 100,
      'compact-mode': false,
      'animations': true,
      'transparency-effects': true,
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
      case 'transparency-effects':
        this.applyTransparency(value);
        break;
      case 'show-avatars':
        this.applyShowAvatars(value);
        break;
      case 'app-theme':
        this.applyTheme(value);
        break;
        
      // Голос
      case 'output-volume':
        this.applyOutputVolume(value);
        break;
      case 'voice-output-device':
        document.querySelectorAll('audio[data-voice-output="true"], #remote-audio-container audio').forEach(audio => {
          if (typeof applyAudioOutputDevice === 'function') applyAudioOutputDevice(audio);
        });
        break;

      // Микрофон и обработка звука читаются только в момент захвата трека
      // (getUserMedia → getVoiceAudioConstraints), поэтому на живом
      // соединении их надо перезахватить — иначе выбор применялся бы лишь
      // при следующем входе в войс. switchMicrophone сам ничего не делает,
      // если войса нет, так что вызов на старте безвреден.
      case 'voice-input-device':
      case 'noise-suppression':
      case 'echo-cancellation':
      case 'auto-gain-control':
        if (window.voiceManager && typeof window.voiceManager.switchMicrophone === 'function') {
          window.voiceManager.switchMicrophone();
        }
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
    const factor = Math.min(1.25, Math.max(0.75, (Number(scale) || 100) / 100));

    // Раньше здесь менялся корневой font-size — и это не работало: вёрстка
    // почти целиком в px (≈3670 значений против 8 в rem), так что размер
    // корня на неё не влияет. Масштабируем страницу целиком.
    if (window.electronAPI && typeof window.electronAPI.setZoomFactor === 'function') {
      window.electronAPI.setZoomFactor(factor);
    } else {
      // Вне Electron (дев-превью в браузере) — тот же эффект через CSS.
      document.documentElement.style.zoom = factor === 1 ? '' : String(factor);
    }

    // Подчищаем инлайновый font-size от прежней версии, иначе он останется
    // в разметке у тех, кто уже двигал ползунок.
    document.documentElement.style.fontSize = '';
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

  // Размытие и стекло (см. client/styles/appearance.css)
  applyTransparency(enabled) {
    if (!enabled) {
      document.body.classList.add('no-transparency');
    } else {
      document.body.classList.remove('no-transparency');
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

  // Тема: атрибут на <html> (не body) — так раньше срабатывает, а инлайновый
  // скрипт в index.html ставит его ещё до первой отрисовки, без чёрной
  // вспышки. «Системная» — живая подписка на prefers-color-scheme: смена
  // темы ОС на лету переворачивает и приложение, без перезапуска.
  applyTheme(mode) {
    const resolved = (mode === 'light' || mode === 'dark')
      ? mode
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', resolved);

    if (!this._themeMq && window.matchMedia) {
      this._themeMq = window.matchMedia('(prefers-color-scheme: light)');
      const onChange = () => {
        if (this.settings['app-theme'] === 'system') this.applyTheme('system');
      };
      if (typeof this._themeMq.addEventListener === 'function') {
        this._themeMq.addEventListener('change', onChange);
      } else if (typeof this._themeMq.addListener === 'function') {
        this._themeMq.addListener(onChange);
      }
    }

    // starfield.js слушает событие и перекрашивает звёзды/вуаль
    window.dispatchEvent(new CustomEvent('themechange'));
  }

  // Громкость выхода
  applyOutputVolume(volume) {
    document.querySelectorAll('audio[data-voice-output="true"], #remote-audio-container audio').forEach(audio => {
      audio.volume = volume / 100;
    });
    if (window.applyVolumeToVoiceMessages) {
      window.applyVolumeToVoiceMessages(volume);
    }
    if (window.SoundManager && typeof window.SoundManager.setVolume === 'function') {
      window.SoundManager.setVolume(volume);
    }
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
  initAudioDeviceSelect('voice-input-device');
  initAudioDeviceSelect('voice-output-device');
  initializeAudioDeviceSelectors();
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', initializeAudioDeviceSelectors);
  }
}

function initAudioDeviceSelect(id) {
  const select = document.getElementById(id);
  if (!select) return;
  select.value = window.settingsManager.get(id) || 'default';
  select.addEventListener('change', (e) => {
    const selected = e.target.selectedOptions?.[0];
    window.settingsManager.saveSetting(id, e.target.value || 'default');
    localStorage.setItem(`${id}-label`, selected?.dataset.deviceLabel || selected?.textContent || '');
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

async function initializeAudioDeviceSelectors() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    populateAudioDeviceSelect('voice-input-device', devices.filter(d => d.kind === 'audioinput'), 'Микрофон');
    populateAudioDeviceSelect('voice-output-device', devices.filter(d => d.kind === 'audiooutput'), 'Вывод');
  } catch (error) {
    console.warn('Failed to enumerate audio devices:', error);
  }
}

function populateAudioDeviceSelect(selectId, devices, fallbackLabel) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const saved = window.settingsManager.get(selectId) || 'default';
  const savedLabel = localStorage.getItem(`${selectId}-label`) || '';
  select.innerHTML = '';
  const defaultDevice = devices.find(device => device.deviceId === 'default');
  const defaultDeviceLabel = formatDefaultAudioDeviceLabel(defaultDevice?.label);
  const defaultOption = document.createElement('option');
  defaultOption.value = 'default';
  defaultOption.textContent = defaultDeviceLabel;
  defaultOption.dataset.deviceLabel = defaultDevice?.label || defaultDeviceLabel;
  select.appendChild(defaultOption);
  devices.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.dataset.deviceLabel = device.label || '';
    option.textContent = device.label || `${fallbackLabel} ${index + 1}`;
    select.appendChild(option);
  });
  const options = Array.from(select.options);
  const matchedById = options.find(option => option.value === saved);
  const matchedByLabel = saved !== 'default' && savedLabel ? options.find(option => option.dataset.deviceLabel === savedLabel) : null;
  if (matchedById) {
    select.value = matchedById.value;
  } else if (matchedByLabel) {
    select.value = matchedByLabel.value;
    window.settingsManager.saveSetting(selectId, matchedByLabel.value);
  } else {
    const savedOption = document.createElement('option');
    savedOption.value = saved;
    savedOption.textContent = savedLabel || 'Сохранённое устройство';
    savedOption.dataset.deviceLabel = savedLabel;
    savedOption.hidden = true;
    select.appendChild(savedOption);
    select.value = saved;
  }
}

function formatDefaultAudioDeviceLabel(label) {
  if (!label) return 'Default';
  const match = label.match(/^Default\s*-\s*(.+)$/i);
  return `Default — ${match ? match[1] : label}`;
}

function getVoiceAudioConstraints() {
  const inputDevice = window.settingsManager?.get('voice-input-device') || 'default';
  const constraints = {
    echoCancellation: window.settingsManager?.get('echo-cancellation') !== false,
    noiseSuppression: window.settingsManager?.get('noise-suppression') !== false,
    autoGainControl: window.settingsManager?.get('auto-gain-control') !== false
  };
  if (inputDevice && inputDevice !== 'default') {
    // NOTE: `ideal` (not `exact`) so a stale/removed device id degrades to the
    // default mic instead of throwing OverconstrainedError and killing voice.
    constraints.deviceId = { ideal: inputDevice };
  }
  return constraints;
}

async function applyAudioOutputDevice(audio) {
  if (!audio) return;
  const outputDevice = window.settingsManager?.get('voice-output-device') || 'default';
  audio.dataset.voiceOutput = 'true';
  audio.volume = (Number(window.settingsManager?.get('output-volume')) || 100) / 100;
  if (typeof audio.setSinkId === 'function' && outputDevice && outputDevice !== 'default') {
    try {
      await audio.setSinkId(outputDevice);
    } catch (error) {
      console.warn('Failed to set audio output device:', error);
    }
  }
}

window.initializeAudioDeviceSelectors = initializeAudioDeviceSelectors;
window.getVoiceAudioConstraints = getVoiceAudioConstraints;
window.applyAudioOutputDevice = applyAudioOutputDevice;
