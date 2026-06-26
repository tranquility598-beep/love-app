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
  input.dispatchEvent(new Event('input', { bubbles: true }));
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
    return;
  }
  
  if (!selectedEmojiFile) {
    return;
  }
  
  if (!window.currentServerId) {
    return;
  }
  
  try {
    // Загрузка через безопасный IPC proxy (apiUpload подставляет токен в main process).
    // НЕ читаем raw JWT в renderer — это нарушение security-модели.
    const formData = new FormData();
    formData.append('emoji', selectedEmojiFile);
    formData.append('name', name);

    await apiUpload(`/servers/${window.currentServerId}/emojis`, formData, 'POST');

    // showNotification('success', 'Эмодзи загружен');
    
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
  
  // Очищаем grid безопасно
  grid.innerHTML = '';
  
  emojis.forEach(emoji => {
    const emojiItem = document.createElement('div');
    emojiItem.className = 'emoji-item';
    
    // Кнопка удаления
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'emoji-item-delete';
    deleteBtn.title = 'Удалить';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => deleteEmoji(emoji._id));
    
    // Изображение эмодзи
    const img = document.createElement('img');
    img.src = `${window.BASE_URL || 'http://localhost:5555'}${emoji.url}`;
    img.alt = escapeHtml(emoji.name);
    
    // Название эмодзи
    const nameDiv = document.createElement('div');
    nameDiv.className = 'emoji-item-name';
    nameDiv.textContent = `:${emoji.name}:`; // ИСПРАВЛЕНО: Безопасно через textContent
    
    emojiItem.appendChild(deleteBtn);
    emojiItem.appendChild(img);
    emojiItem.appendChild(nameDiv);
    
    grid.appendChild(emojiItem);
  });
}

/**
 * Удалить эмодзи
 */
async function deleteEmoji(emojiId) {
  if (!confirm('Удалить этот эмодзи?')) return;
  
  if (!window.currentServerId) {
    return;
  }
  
  try {
    // Удаление через безопасный IPC proxy (apiFetch подставляет токен в main process).
    await apiFetch(`/servers/${window.currentServerId}/emojis/${emojiId}`, {
      method: 'DELETE'
    });

    // showNotification('success', 'Эмодзи удален');
    
    // Обновляем список эмодзи
    await loadServerEmojis();
    
    // Обновляем данные сервера
    if (window.selectServer) {
      await window.selectServer(window.currentServerId);
    }
    
  } catch (error) {
    console.error('Delete emoji error:', error);
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
