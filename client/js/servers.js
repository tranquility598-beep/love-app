/**
 * Servers модуль - управление серверами и каналами
 */

let selectedChannelType = 'text';
let serverIconFile = null;

/**
 * Показать модальное окно создания сервера
 */
function showCreateServerModal() {
  document.getElementById('server-name-input').value = '';
  document.getElementById('server-desc-input').value = '';
  document.getElementById('server-icon-preview').innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="#b9bbbe">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
    </svg>
    <span>Загрузить</span>
  `;
  serverIconFile = null;
  openModal('create-server-modal');
}

/**
 * Предпросмотр иконки сервера
 */
function previewServerIcon(event) {
  const file = event.target.files[0];
  if (!file) return;
  serverIconFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('server-icon-preview');
    if (preview) {
      preview.innerHTML = `<img src="${e.target.result}" alt="Иконка сервера" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    }
  };
  reader.readAsDataURL(file);
}

/**
 * Создать сервер
 */
async function createServer() {
  const name = document.getElementById('server-name-input')?.value.trim();
  const description = document.getElementById('server-desc-input')?.value.trim();

  if (!name) {
    showNotification('warning', 'Введите название сервера');
    return;
  }

  try {
    const data = await ServersAPI.create(name, description);
    const server = data.server;

    // Загружаем иконку если выбрана
    if (serverIconFile) {
      try {
        await ServersAPI.uploadIcon(server._id, serverIconFile);
      } catch (e) {
        console.error('Error uploading server icon:', e);
      }
    }

    closeModal('create-server-modal');
    await loadServers();
    await selectServer(server._id);
    showNotification('success', `Сервер "${name}" создан!`);
  } catch (error) {
    showNotification('error', error.message);
  }
}

/**
 * Показать модальное окно присоединения к серверу
 */
function showJoinServerModal() {
  document.getElementById('invite-code-input').value = '';
  document.getElementById('join-server-error').classList.add('hidden');
  openModal('join-server-modal');
}

/**
 * Присоединиться к серверу по инвайт-коду
 */
async function joinServer() {
  const code = document.getElementById('invite-code-input')?.value.trim().toUpperCase();
  const errorEl = document.getElementById('join-server-error');

  if (!code) {
    if (errorEl) { errorEl.textContent = 'Введите инвайт-код'; errorEl.classList.remove('hidden'); }
    return;
  }

  try {
    const data = await ServersAPI.join(code);
    closeModal('join-server-modal');
    await loadServers();
    await selectServer(data.server._id);
    showNotification('success', `Вы присоединились к серверу "${data.server.name}"!`);
  } catch (error) {
    if (errorEl) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); }
  }
}

/**
 * Показать модальное окно создания канала
 */
function showCreateChannelModal(defaultType) {
  selectedChannelType = defaultType || 'text';
  document.getElementById('channel-name-input').value = '';

  // Устанавливаем тип
  selectChannelType(selectedChannelType);
  openModal('create-channel-modal');
}

/**
 * Выбрать тип канала
 */
function selectChannelType(type) {
  selectedChannelType = type;

  document.querySelectorAll('.channel-type-option').forEach(el => {
    el.classList.remove('active');
  });

  const activeEl = document.getElementById(`type-${type}`);
  if (activeEl) activeEl.classList.add('active');

  // Обновляем префикс
  const prefix = document.getElementById('channel-prefix');
  if (prefix) {
    prefix.textContent = type === 'text' ? '#' : '🔊';
  }
}

/**
 * Создать канал
 */
async function createChannel() {
  const name = document.getElementById('channel-name-input')?.value.trim()
    .toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, '');

  if (!name) {
    showNotification('warning', 'Введите название канала');
    return;
  }

  if (!window.currentServer) {
    showNotification('warning', 'Выберите сервер');
    return;
  }

  try {
    await ChannelsAPI.create(name, selectedChannelType, window.currentServer._id);
    closeModal('create-channel-modal');

    // Перезагружаем сервер
    const data = await ServersAPI.get(window.currentServer._id);
    window.currentServer = data.server;
    renderServerChannels(data.server);

    showNotification('success', `Канал "${name}" создан!`);
  } catch (error) {
    showNotification('error', error.message);
  }
}
