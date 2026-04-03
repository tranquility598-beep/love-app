/**
 * Логика окна входящего звонка
 */

const callerAvatar = document.getElementById('caller-avatar');
const callerName = document.getElementById('caller-name');
const btnAccept = document.getElementById('btn-accept');
const btnDecline = document.getElementById('btn-decline');
const bulkRipple = document.getElementById('bulk-ripple');
const avatarContainer = document.getElementById('avatar-container');

const ringingSound = new Audio('assets/sounds/call_ringing.mp3');
ringingSound.volume = 0.3;
ringingSound.loop = true;

let currentCallerId = null;

// Получаем данные о звонящем
window.electronAPI.onIncomingCallData((data) => {
  const { caller } = data;
  currentCallerId = caller._id;
  
  callerName.textContent = caller.username;
  callerAvatar.src = getAvatarUrl(caller.avatar);
  
  // Запускаем звук звонка
  ringingSound.play().catch(e => console.log('Audio play blocked:', e));
});

// Кнопка Принять
btnAccept.onclick = () => {
  stopSounds();
  window.electronAPI.sendCallAction({ accepted: true, callerId: currentCallerId });
};

// Кнопка Отклонить
btnDecline.onclick = () => {
  stopSounds();
  
  // Добавляем класс визуального эффекта Бульк
  if (bulkRipple) {
    bulkRipple.classList.add('bulk-animate');
  }

  // Анимация уменьшения аватарки
  avatarContainer.classList.add('shrinking');
  
  // Закрываем окно через небольшую задержку после анимации
  setTimeout(() => {
    window.electronAPI.sendCallAction({ accepted: false, callerId: currentCallerId });
  }, 600);
};

function stopSounds() {
  ringingSound.pause();
  ringingSound.currentTime = 0;
}

/**
 * Вспомогательная функция для URL аватара
 */
function getAvatarUrl(avatar) {
  if (!avatar) return 'assets/default-avatar.png';
  if (avatar.startsWith('http')) return avatar;
  
  // Определяем базовый URL сервера динамически
  let isPackaged = false;
  if (window.electronAPI && window.electronAPI.isPackagedSync) {
    isPackaged = window.electronAPI.isPackagedSync();
  }
  
  const BASE_URL = isPackaged ? 'https://love-app-2ou3.onrender.com' : 'http://localhost:5555'; 
  return `${BASE_URL}/api/users/avatar/${avatar}`;
}
