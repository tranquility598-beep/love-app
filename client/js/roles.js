/**
 * Управление ролями сервера
 */

let currentServerId = null;
let currentRoleId = null;
let serverRoles = [];

/**
 * Открыть модальное окно ролей
 */
function openRolesModal(serverId) {
  console.log('openRolesModal called with serverId:', serverId);
  
  if (!window.socket || !window.socket.connected) {
    console.error('Socket not connected');
    showNotification('Нет подключения к серверу', 'error');
    return;
  }
  
  currentServerId = serverId;
  console.log('currentServerId set to:', currentServerId);
  
  const modal = document.getElementById('roles-modal');
  console.log('modal element:', modal);
  
  if (!modal) {
    console.error('Modal element not found!');
    return;
  }
  
  modal.classList.remove('hidden');
  console.log('Modal should be visible now');
  
  // Инициализируем обработчики сокетов
  initRoleSocketHandlers();
  
  // Подписываемся на комнату сервера для получения обновлений в реальном времени
  if (window.socketJoinServer) {
    window.socketJoinServer(serverId);
  }
  
  // Загружаем роли сервера
  loadServerRoles(serverId);
}

/**
 * Открыть редактор ролей из настроек сервера
 */
function openRolesModalFromSettings() {
  console.log('openRolesModalFromSettings called');
  console.log('currentServerId:', window.currentServerId);
  console.log('socket:', window.socket);
  console.log('socket.connected:', window.socket?.connected);
  
  const serverId = window.currentServerId;
  if (!serverId) {
    console.error('No current server');
    showNotification('Выберите сервер', 'error');
    return;
  }
  
  // НЕ закрываем настройки сервера, открываем редактор поверх
  openRolesModal(serverId);
}

/**
 * Закрыть модальное окно ролей
 */
function closeRolesModal() {
  const modal = document.getElementById('roles-modal');
  modal.classList.add('hidden');
  currentServerId = null;
  currentRoleId = null;
  serverRoles = [];
}

/**
 * Загрузить роли сервера
 */
function loadServerRoles(serverId) {
  console.log('loadServerRoles called with:', serverId);
  console.log('window.servers:', window.servers);
  
  // Получаем сервер из кэша
  const server = window.servers?.find(s => s._id === serverId);
  console.log('Found server:', server);
  
  if (!server) {
    console.error('Server not found in cache');
    const list = document.getElementById('roles-list');
    list.innerHTML = '<div class="role-editor-placeholder">Сервер не найден</div>';
    return;
  }
  
  serverRoles = server.roles || [];
  console.log('serverRoles loaded:', serverRoles);
  displayRolesList();
}

/**
 * Отобразить список ролей
 */
function displayRolesList() {
  const list = document.getElementById('roles-list');
  
  if (serverRoles.length === 0) {
    list.innerHTML = '<div class="role-editor-placeholder">Нет ролей</div>';
    return;
  }
  
  // Сортируем по позиции
  const sortedRoles = [...serverRoles].sort((a, b) => b.position - a.position);
  
  list.innerHTML = sortedRoles.map(role => `
    <div class="role-item ${currentRoleId === role._id ? 'active' : ''}" 
         onclick="selectRole('${role._id}')">
      <div class="role-color-dot" style="background: ${role.color}"></div>
      <div class="role-name">${escapeHtml(role.name)}</div>
    </div>
  `).join('');
}

/**
 * Выбрать роль для редактирования
 */
function selectRole(roleId) {
  currentRoleId = roleId;
  displayRolesList();
  displayRoleEditor();
}

/**
 * Отобразить редактор роли
 */
function displayRoleEditor() {
  const editor = document.getElementById('role-editor');
  const role = serverRoles.find(r => r._id === currentRoleId);
  
  if (!role) {
    editor.innerHTML = '<div class="role-editor-placeholder">Выберите роль для редактирования</div>';
    return;
  }
  
  const perms = role.permissions || {};
  
  editor.innerHTML = `
    <div class="role-editor-header">
      <h4>${escapeHtml(role.name)}</h4>
    </div>
    
    <div class="role-section">
      <div class="role-section-title">Отображение</div>
      
      <div class="form-group">
        <label>Название роли</label>
        <input type="text" id="role-name-input" value="${escapeHtml(role.name)}" 
               onchange="updateRoleName(this.value)">
      </div>
      
      <div class="form-group">
        <label>Цвет роли</label>
        <div class="role-color-picker">
          <div class="role-color-preview" style="background: ${role.color}"></div>
          <input type="color" id="role-color-input" value="${role.color}" 
                 onchange="updateRoleColor(this.value)">
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Показывать отдельно</div>
          <div class="role-setting-description">Участники с этой ролью будут показаны отдельно</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${role.hoist ? 'active' : ''}" 
               onclick="toggleRoleHoist()"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Упоминаемая</div>
          <div class="role-setting-description">Разрешить всем упоминать эту роль</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${role.mentionable ? 'active' : ''}" 
               onclick="toggleRoleMentionable()"></div>
        </div>
      </div>
    </div>
    
    <div class="role-section">
      <div class="role-section-title">Права</div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Администратор</div>
          <div class="role-setting-description">Полный доступ ко всем функциям</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.administrator ? 'active' : ''}" 
               onclick="togglePermission('administrator')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Управление сервером</div>
          <div class="role-setting-description">Изменять настройки сервера</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.manageServer ? 'active' : ''}" 
               onclick="togglePermission('manageServer')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Управление ролями</div>
          <div class="role-setting-description">Создавать и редактировать роли</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.manageRoles ? 'active' : ''}" 
               onclick="togglePermission('manageRoles')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Управление каналами</div>
          <div class="role-setting-description">Создавать и удалять каналы</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.manageChannels ? 'active' : ''}" 
               onclick="togglePermission('manageChannels')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Кикать участников</div>
          <div class="role-setting-description">Выгонять участников с сервера</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.kickMembers ? 'active' : ''}" 
               onclick="togglePermission('kickMembers')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Банить участников</div>
          <div class="role-setting-description">Блокировать участников</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.banMembers ? 'active' : ''}" 
               onclick="togglePermission('banMembers')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Управление сообщениями</div>
          <div class="role-setting-description">Удалять и закреплять сообщения</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.manageMessages ? 'active' : ''}" 
               onclick="togglePermission('manageMessages')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Отправлять сообщения</div>
          <div class="role-setting-description">Писать в текстовых каналах</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.sendMessages ? 'active' : ''}" 
               onclick="togglePermission('sendMessages')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Читать сообщения</div>
          <div class="role-setting-description">Просматривать текстовые каналы</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.readMessages ? 'active' : ''}" 
               onclick="togglePermission('readMessages')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Упоминать всех</div>
          <div class="role-setting-description">Использовать @everyone и @here</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.mentionEveryone ? 'active' : ''}" 
               onclick="togglePermission('mentionEveryone')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Управление никнеймами</div>
          <div class="role-setting-description">Изменять никнеймы участников</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.manageNicknames ? 'active' : ''}" 
               onclick="togglePermission('manageNicknames')"></div>
        </div>
      </div>
    </div>
    
    <div class="role-section">
      <div class="role-section-title">Голосовые права</div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Подключаться</div>
          <div class="role-setting-description">Подключаться к голосовым каналам</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.connect ? 'active' : ''}" 
               onclick="togglePermission('connect')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Говорить</div>
          <div class="role-setting-description">Говорить в голосовых каналах</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.speak ? 'active' : ''}" 
               onclick="togglePermission('speak')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Отключать микрофон участникам</div>
          <div class="role-setting-description">Отключать микрофон другим участникам</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.muteMembers ? 'active' : ''}" 
               onclick="togglePermission('muteMembers')"></div>
        </div>
      </div>
      
      <div class="role-setting">
        <div class="role-setting-info">
          <div class="role-setting-label">Отключать звук участникам</div>
          <div class="role-setting-description">Отключать звук другим участникам</div>
        </div>
        <div class="role-setting-control">
          <div class="role-toggle ${perms.deafenMembers ? 'active' : ''}" 
               onclick="togglePermission('deafenMembers')"></div>
        </div>
      </div>
    </div>
    
    <div class="role-actions">
      <button class="btn-danger" onclick="deleteRole()">Удалить роль</button>
    </div>
  `;
}

/**
 * Создать новую роль
 */
function createNewRole() {
  if (!window.socket || !window.socket.connected) {
    showNotification('Нет подключения к серверу', 'error');
    return;
  }
  
  if (!currentServerId) {
    showNotification('Выберите сервер', 'error');
    return;
  }
  
  window.socket.emit('role:create', {
    serverId: currentServerId,
    name: 'Новая роль',
    color: '#99aab5',
    permissions: {
      sendMessages: true,
      readMessages: true,
      connect: true,
      speak: true
    }
  });
  
  showNotification('Создание роли...', 'info');
}

/**
 * Обновить название роли
 */
function updateRoleName(name) {
  if (!window.socket || !currentServerId || !currentRoleId) return;
  
  // Локальное обновление для мгновенного отклика
  const role = serverRoles.find(r => r._id === currentRoleId);
  if (role) {
    role.name = name;
    displayRolesList();
  }
  
  window.socket.emit('role:update', {
    serverId: currentServerId,
    roleId: currentRoleId,
    updates: { name }
  });
}

/**
 * Обновить цвет роли
 */
function updateRoleColor(color) {
  if (!window.socket || !currentServerId || !currentRoleId) return;
  
  // Локальное обновление для мгновенного отклика
  const role = serverRoles.find(r => r._id === currentRoleId);
  if (role) {
    role.color = color;
    displayRolesList();
  }
  
  window.socket.emit('role:update', {
    serverId: currentServerId,
    roleId: currentRoleId,
    updates: { color }
  });
  
  // Обновляем превью
  const preview = document.querySelector('.role-color-preview');
  if (preview) preview.style.background = color;
}

/**
 * Переключить hoist
 */
function toggleRoleHoist() {
  const role = serverRoles.find(r => r._id === currentRoleId);
  if (!role || !window.socket) return;
  
  // Локальное обновление для мгновенного отклика
  role.hoist = !role.hoist;
  displayRoleEditor();
  
  window.socket.emit('role:update', {
    serverId: currentServerId,
    roleId: currentRoleId,
    updates: { hoist: role.hoist }
  });
}

/**
 * Переключить mentionable
 */
function toggleRoleMentionable() {
  const role = serverRoles.find(r => r._id === currentRoleId);
  if (!role || !window.socket) return;
  
  // Локальное обновление для мгновенного отклика
  role.mentionable = !role.mentionable;
  displayRoleEditor();
  
  window.socket.emit('role:update', {
    serverId: currentServerId,
    roleId: currentRoleId,
    updates: { mentionable: role.mentionable }
  });
}

/**
 * Переключить право
 */
function togglePermission(permission) {
  const role = serverRoles.find(r => r._id === currentRoleId);
  if (!role || !window.socket) return;
  
  const currentValue = role.permissions[permission] || false;
  
  // Локальное обновление для мгновенного отклика
  if (!role.permissions) role.permissions = {};
  role.permissions[permission] = !currentValue;
  displayRoleEditor();
  
  window.socket.emit('role:update', {
    serverId: currentServerId,
    roleId: currentRoleId,
    updates: {
      permissions: {
        [permission]: !currentValue
      }
    }
  });
}

/**
 * Удалить роль
 */
function deleteRole() {
  if (!window.socket || !currentServerId || !currentRoleId) return;
  
  const role = serverRoles.find(r => r._id === currentRoleId);
  if (!role) return;
  
  if (confirm(`Вы уверены, что хотите удалить роль "${role.name}"?`)) {
    window.socket.emit('role:delete', {
      serverId: currentServerId,
      roleId: currentRoleId
    });
  }
}

/**
 * Открыть модальное окно управления ролями участника
 */
function openMemberRolesModal(userId, username) {
  const modal = document.getElementById('member-roles-modal');
  if (!modal) {
    console.error('member-roles-modal not found');
    return;
  }
  
  modal.classList.remove('hidden');
  
  // Используем currentServerId или window.currentServerId
  const serverId = currentServerId || window.currentServerId;
  if (window.socketJoinServer && serverId) {
    window.socketJoinServer(serverId);
  }
  if (typeof window.initRoleSocketHandlers === 'function') {
    window.initRoleSocketHandlers();
  }
  console.log('openMemberRolesModal:', { userId, username, serverId, currentServerId, windowCurrentServerId: window.currentServerId });
  
  if (!serverId) {
    console.error('No server selected');
    return;
  }
  
  const server = window.servers?.find(s => s._id === serverId);
  console.log('Found server:', server);
  
  if (!server) {
    console.error('Server not found in cache');
    return;
  }
  
  const member = server.members?.find(m => {
    const memberId = m.user?._id || m.user;
    return memberId === userId;
  });
  console.log('Found member:', member);
  
  const memberRoles = member?.roles || [];
  console.log('Member roles:', memberRoles);
  console.log('Server roles:', server.roles);
  
  const list = document.getElementById('member-roles-list');
  list.innerHTML = `
    <div style="margin-bottom: 20px;">
      <strong>Участник:</strong> ${escapeHtml(username)}
    </div>
    <div class="roles-checklist">
      ${(server.roles || []).map(role => {
        const hasRole = memberRoles.some(r => r.toString() === role._id.toString());
        return `
          <div class="role-checkbox-item">
            <label>
              <input type="checkbox" 
                     ${hasRole ? 'checked' : ''} 
                     onchange="toggleMemberRole('${userId}', '${role._id}', this.checked)">
              <span class="role-color-dot" style="background: ${role.color}"></span>
              <span>${escapeHtml(role.name)}</span>
            </label>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Закрыть модальное окно управления ролями участника
 */
function closeMemberRolesModal() {
  const modal = document.getElementById('member-roles-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Переключить роль участника
 */
function toggleMemberRole(userId, roleId, assign) {
  if (!window.socket) return;
  
  const serverId = currentServerId || window.currentServerId;
  if (!serverId) {
    console.error('No server selected');
    return;
  }
  
  console.log('toggleMemberRole:', { userId, roleId, assign, serverId });
  
  if (assign) {
    window.socket.emit('role:assign', {
      serverId: serverId,
      targetUserId: userId,
      roleId: roleId
    });
  } else {
    window.socket.emit('role:remove', {
      serverId: serverId,
      targetUserId: userId,
      roleId: roleId
    });
  }
}

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Показать уведомление
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'success' ? '#43b581' : type === 'error' ? '#f04747' : '#5865f2'};
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ==================== SOCKET ОБРАБОТЧИКИ ====================

/**
 * Инициализация обработчиков сокетов для ролей
 */
function initRoleSocketHandlers() {
  if (!window.socket) return;
  
  // Удаляем старые обработчики, если они есть
  window.socket.off('role:created');
  window.socket.off('role:updated');
  window.socket.off('role:deleted');
  
  // Роль создана
  window.socket.on('role:created', (data) => {
    console.log('role:created event received:', data);
    console.log('currentServerId:', currentServerId);
    console.log('serverRoles before:', serverRoles);
    
    if (data.serverId === currentServerId) {
      serverRoles.push(data.role);
      displayRolesList();
    }
    
    // Обновляем кэш сервера
    const server = window.servers?.find(s => s._id === data.serverId);
    if (server) {
      server.roles.push(data.role);
    }
    
    console.log('serverRoles after:', serverRoles);
  });
  
  // Роль обновлена
  window.socket.on('role:updated', (data) => {
    console.log('role:updated event received:', data);
    
    if (data.serverId === currentServerId) {
      const index = serverRoles.findIndex((r) => String(r._id) === String(data.roleId));
      if (index !== -1) {
        serverRoles[index] = data.role;
        displayRolesList();
        if (String(currentRoleId) === String(data.roleId)) {
          displayRoleEditor();
        }
      }
    }
    
    // Обновляем кэш сервера
    const server = window.servers?.find(s => s._id === data.serverId);
    if (server) {
      const index = server.roles.findIndex((r) => String(r._id) === String(data.roleId));
      if (index !== -1) {
        server.roles[index] = data.role;
      }
    }
    
    // Обновляем текущий сервер и список участников
    if (window.currentServer && window.currentServer._id === data.serverId) {
      const index = window.currentServer.roles.findIndex((r) => String(r._id) === String(data.roleId));
      if (index !== -1) {
        window.currentServer.roles[index] = data.role;
      }
      
      // Обновляем список участников (цвет/название роли могли измениться)
      if (window.loadChannelMembers) {
        window.loadChannelMembers();
      }
    }
  });
  
  // Роль удалена
  window.socket.on('role:deleted', (data) => {
    console.log('role:deleted event received:', data);
    
    if (data.serverId === currentServerId) {
      serverRoles = serverRoles.filter((r) => String(r._id) !== String(data.roleId));
      if (String(currentRoleId) === String(data.roleId)) {
        currentRoleId = null;
      }
      displayRolesList();
      displayRoleEditor();
    }
    
    // Обновляем кэш сервера
    const server = window.servers?.find(s => s._id === data.serverId);
    if (server) {
      server.roles = server.roles.filter((r) => String(r._id) !== String(data.roleId));
    }
  });
  
  // Роль назначена участнику
  window.socket.on('role:assigned', (data) => {
    console.log('role:assigned event received:', data);
    
    // Обновляем кэш сервера
    const server = window.servers?.find(s => s._id === data.serverId);
    if (server) {
      const member = server.members?.find((m) => {
      const uid = m.user && m.user._id != null ? m.user._id : m.user;
      return String(uid) === String(data.userId);
    });
      if (member && !member.roles.some((r) => r.toString() === String(data.roleId))) {
        member.roles.push(data.roleId);
      }
    }
    
    // Обновляем текущий сервер
    if (window.currentServer && window.currentServer._id === data.serverId) {
      const member = window.currentServer.members?.find((m) => {
        const uid = m.user && m.user._id != null ? m.user._id : m.user;
        return String(uid) === String(data.userId);
      });
      if (member && !member.roles.some((r) => r.toString() === String(data.roleId))) {
        member.roles.push(data.roleId);
      }
      
      // Обновляем список участников
      if (window.loadChannelMembers) {
        window.loadChannelMembers();
      }
    }
  });
  
  // Роль снята с участника
  window.socket.on('role:removed', (data) => {
    console.log('role:removed event received:', data);
    
    // Обновляем кэш сервера
    const server = window.servers?.find(s => s._id === data.serverId);
    if (server) {
      const member = server.members?.find((m) => {
        const uid = m.user && m.user._id != null ? m.user._id : m.user;
        return String(uid) === String(data.userId);
      });
      if (member) {
        member.roles = member.roles.filter((r) => r.toString() !== data.roleId.toString());
      }
    }
    
    // Обновляем текущий сервер
    if (window.currentServer && window.currentServer._id === data.serverId) {
      const member = window.currentServer.members?.find((m) => {
        const uid = m.user && m.user._id != null ? m.user._id : m.user;
        return String(uid) === String(data.userId);
      });
      if (member) {
        member.roles = member.roles.filter((r) => r.toString() !== data.roleId.toString());
      }
      
      // Обновляем список участников
      if (window.loadChannelMembers) {
        window.loadChannelMembers();
      }
    }
  });
}

window.initRoleSocketHandlers = initRoleSocketHandlers;

// Инициализируем обработчики при загрузке
if (window.socket) {
  initRoleSocketHandlers();
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  // Закрытие модалки по клику вне её
  const modal = document.getElementById('roles-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeRolesModal();
      }
    });
  }
});
