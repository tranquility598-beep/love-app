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
    
    // Присоединяемся к комнате сервера через сокет сразу
    socketJoinServer(server._id);
    
    // showNotification('success', `Сервер "${name}" создан!`);
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
    
    // Присоединяемся к комнате сервера через сокет сразу
    socketJoinServer(data.server._id);
    
    // showNotification('success', `Вы присоединились к серверу "${data.server.name}"!`);
  } catch (error) {
    if (errorEl) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); }
  }
}

// Channel creation logic moved to ui.js for consolidation

/**
 * Единое меню создания/входа.
 * Открывается по клику на #add-entity-btn ("+" в server-rail).
 * Содержит три пункта:
 *   - create-server  → showCreateServerModal()
 *   - create-room    → window.RoomsUI.showCreateRoomModal()
 *   - join-by-code   → showJoinServerModal()
 *
 * Ничего не ломает в существующих API создания/входа — это всего
 * лишь UI-обёртка над уже работающими модалками.
 *
 * Никаких inline onclick. Закрытие — по клику вне меню, по Esc и
 * после выбора действия. Позиционирование: справа от рейла, чуть
 * выше кнопки.
 */
function bindAddEntityMenu() {
  const btn = document.getElementById('add-entity-btn');
  const menu = document.getElementById('add-entity-menu');
  if (!btn || !menu) return;

  let isOpen = false;
  let outsideHandler = null;
  let escHandler = null;

  const closeMenu = () => {
    if (!isOpen) return;
    isOpen = false;
    menu.classList.add('hidden');
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    if (outsideHandler) document.removeEventListener('mousedown', outsideHandler, true);
    if (escHandler) document.removeEventListener('keydown', escHandler, true);
    outsideHandler = null;
    escHandler = null;
  };

  const positionMenu = () => {
    // Прижимаем меню к правой стороне server-rail. Открываем ВВЕРХ
    // от кнопки — иначе меню уезжает за нижний край вьюпорта
    // (кнопка "+" живёт у нижней панели servers-sidebar).
    const r = btn.getBoundingClientRect();

    // Чтобы измерить высоту, временно делаем меню разметным, но
    // невидимым (если оно ещё .hidden). offsetHeight в display:none = 0.
    const wasHidden = menu.classList.contains('hidden');
    let prevVisibility = '';
    if (wasHidden) {
      prevVisibility = menu.style.visibility;
      menu.style.visibility = 'hidden';
      menu.classList.remove('hidden');
    }
    const menuHeight = menu.offsetHeight;
    if (wasHidden) {
      menu.classList.add('hidden');
      menu.style.visibility = prevVisibility;
    }

    // Нижний край меню — на 8px выше верхнего края кнопки.
    const desiredTop = r.top - menuHeight - 8;
    menu.style.setProperty('--menu-top', `${Math.max(8, desiredTop)}px`);
    menu.style.setProperty('--menu-left', `${r.right + 12}px`);
  };

  const openMenu = () => {
    if (isOpen) return;
    isOpen = true;
    positionMenu();
    menu.classList.remove('hidden');
    // requestAnimationFrame чтобы запустить fade-in анимацию.
    requestAnimationFrame(() => menu.classList.add('is-open'));
    btn.setAttribute('aria-expanded', 'true');

    outsideHandler = (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) closeMenu();
    };
    escHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
        btn.focus();
      }
    };
    document.addEventListener('mousedown', outsideHandler, true);
    document.addEventListener('keydown', escHandler, true);
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) closeMenu();
    else openMenu();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu();
    }
  });

  // Действия меню. Все три модалки уже существуют — мы только их вызываем.
  menu.querySelectorAll('.add-entity-menu-item[data-action]').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.getAttribute('data-action');
      closeMenu();
      switch (action) {
        case 'create-server':
          if (typeof showCreateServerModal === 'function') showCreateServerModal();
          break;
        case 'create-room':
          if (window.RoomsUI && typeof window.RoomsUI.showCreateRoomModal === 'function') {
            window.RoomsUI.showCreateRoomModal();
          }
          break;
        case 'join-by-code':
          if (typeof showJoinServerModal === 'function') showJoinServerModal();
          break;
      }
    });
  });

  window.addEventListener('resize', () => { if (isOpen) positionMenu(); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAddEntityMenu);
} else {
  bindAddEntityMenu();
}
