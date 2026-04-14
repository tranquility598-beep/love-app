/**
 * Управление кастомными эмодзи сервера
 */

let selectedEmojiFile = null;

/**
 * Показать кастомные эмодзи в пикере
 */
function showCustomEmojisInPicker() {
  const section = document.getElementById('custom-emojis-section');
  if (!section) return;
  
  const server = window.currentServer;
  if (!server || !server.emojis || server.emojis.length === 0) {
    section.innerHTML = '';
    return;
  }
  
  const baseUrl = window.BASE_URL || 'http://localhost:5555';
  
  section.innerHTML = `
    <div class="custom-emojis-title">Эмодзи сервера</div>
    <div class="custom-emojis-list">
      ${server.emojis.map(emoji => `
        <button class="custom-emoji-btn" onclick="insertCustomEmoji(':${emoji.name}:')" title=":${emoji.name}:">
          <img src="${baseUrl}${emoji.url}" alt="${emoji.name}">
        </button>
      `).join('')}
    </div>
  `;
}

/**
 * Вставить кастомный эмодзи в поле ввода
 */
function insertCustomEmoji(emojiText) {
  const input = document.getElementById('message-input');
  if (!input) return;
  
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const text = input.value;
  
  input.value = text.substring(0, start) + emojiText + ' ' + text.substring(end);
  input.selectionStart = input.selectionEnd = start + emojiText.length + 1;
  
  // Закрываем пикер
  const picker = document.getElementById('emoji-picker-container');
  if (picker) picker.classList.add('hidden');
  
  input.focus();
}

/**
 * Обработка выбора файла эмодзи
 */
function handleEmojiFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  selectedEmojiFile = file;
  const fileNameDisplay = document.getElementById('emoji-file-name');
  if (fileNameDisplay) {
    fileNameDisplay.textContent = `Выбран файл: ${file.name}`;
  }
}

/**
 * Загрузить эмодзи на сервер
 */
async function uploadEmoji() {
  const nameInput = document.getElementById('emoji-name-input');
  const name = nameInput?.value.trim();
  
  if (!name) {
    showNotification('error', 'Введите название эмодзи');
    return;
  }
  
  if (!selectedEmojiFile) {
    showNotification('error', 'Выберите файл');
    return;
  }
  
  if (!window.currentServerId) {
    showNotification('error', 'Выберите сервер');
    return;
  }
  
  try {
    const formData = new FormData();
    formData.append('emoji', selectedEmojiFile);
    formData.append('name', name);
    
    const apiRoot = window.API_BASE || `${(window.BASE_URL || 'http://localhost:5555').replace(/\/$/, '')}/api`;
    const response = await fetch(`${apiRoot}/servers/${window.currentServerId}/emojis`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(response.status >= 500 ? 'Ошибка сервера' : 'Некорректный ответ сервера');
    }

    if (!response.ok) {
      throw new Error(data.message || 'Ошибка загрузки');
    }
    
    showNotification('success', 'Эмодзи загружен');
    
    // Очищаем форму
    nameInput.value = '';
    selectedEmojiFile = null;
    document.getElementById('emoji-file-input').value = '';
    document.getElementById('emoji-file-name').textContent = '';
    
    // Обновляем список эмодзи
    await loadServerEmojis();
    
    // Обновляем данные сервера
    if (window.selectServer) {
      await window.selectServer(window.currentServerId);
    }
    
  } catch (error) {
    console.error('Upload emoji error:', error);
    showNotification('error', error.message || 'Ошибка загрузки эмодзи');
  }
}

/**
 * Загрузить список эмодзи сервера
 */
async function loadServerEmojis() {
  if (!window.currentServer) return;
  
  const grid = document.getElementById('server-emojis-grid');
  if (!grid) return;
  
  const emojis = window.currentServer.emojis || [];
  
  if (emojis.length === 0) {
    grid.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Загрузите первый эмодзи</div>';
    return;
  }
  
  grid.innerHTML = emojis.map(emoji => `
    <div class="emoji-item">
      <button class="emoji-item-delete" onclick="deleteEmoji('${emoji._id}')" title="Удалить">×</button>
      <img src="${window.BASE_URL || 'http://localhost:5555'}${emoji.url}" alt="${emoji.name}">
      <div class="emoji-item-name">:${emoji.name}:</div>
    </div>
  `).join('');
}

/**
 * Удалить эмодзи
 */
async function deleteEmoji(emojiId) {
  if (!confirm('Удалить этот эмодзи?')) return;
  
  if (!window.currentServerId) {
    showNotification('error', 'Выберите сервер');
    return;
  }
  
  try {
    const apiRoot = window.API_BASE || `${(window.BASE_URL || 'http://localhost:5555').replace(/\/$/, '')}/api`;
    const response = await fetch(`${apiRoot}/servers/${window.currentServerId}/emojis/${emojiId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Ошибка удаления');
    }
    
    showNotification('success', 'Эмодзи удален');
    
    // Обновляем список эмодзи
    await loadServerEmojis();
    
    // Обновляем данные сервера
    if (window.selectServer) {
      await window.selectServer(window.currentServerId);
    }
    
  } catch (error) {
    console.error('Delete emoji error:', error);
    showNotification('error', error.message || 'Ошибка удаления эмодзи');
  }
}

// Загружаем эмодзи при открытии вкладки
document.addEventListener('DOMContentLoaded', () => {
  // Слушаем изменения вкладок настроек
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.id === 'server-settings-emojis' && !mutation.target.classList.contains('hidden')) {
        loadServerEmojis();
      }
    });
  });
  
  const emojisTab = document.getElementById('server-settings-emojis');
  if (emojisTab) {
    observer.observe(emojisTab, { attributes: true, attributeFilter: ['class'] });
  }
});
