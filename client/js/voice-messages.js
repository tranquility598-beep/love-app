/**
 * Запись и отправка голосовых сообщений
 */

let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;
let isRecording = false;

/**
 * Переключить запись голосового сообщения
 */
async function toggleVoiceRecording() {
  if (isRecording) {
    stopVoiceRecording();
  } else {
    await startVoiceRecording();
  }
}

/**
 * Начать запись голосового сообщения
 */
async function startVoiceRecording() {
  try {
    // Запрашиваем доступ к микрофону
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Создаем MediaRecorder
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = () => {
      // Останавливаем все треки
      stream.getTracks().forEach(track => track.stop());
      
      // Создаем blob из записанных данных
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      showVoicePreview(audioBlob);
    };
    
    // Начинаем запись
    mediaRecorder.start();
    isRecording = true;
    recordingStartTime = Date.now();
    
    // Обновляем UI
    updateRecordingUI();
    showRecordingPreview();
    
    // Обновляем таймер каждую секунду
    recordingInterval = setInterval(updateRecordingTime, 100);
    
  } catch (error) {
    console.error('Error starting voice recording:', error);
    alert('Не удалось получить доступ к микрофону. Проверьте разрешения.');
  }
}

/**
 * Остановить запись
 */
function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    isRecording = false;
    
    // Останавливаем таймер
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    
    // Обновляем UI
    updateRecordingUI();
  }
}

/**
 * Отменить запись
 */
function cancelVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    isRecording = false;
    
    // Останавливаем таймер
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }
    
    // Очищаем данные
    audioChunks = [];
  }
  
  // Скрываем превью
  hideRecordingPreview();
  hideVoicePreview();
  updateRecordingUI();
}

/**
 * Обновить UI кнопки записи
 */
function updateRecordingUI() {
  const btn = document.getElementById('voice-record-btn');
  if (!btn) return;
  
  if (isRecording) {
    btn.classList.add('recording');
    btn.title = 'Остановить запись';
  } else {
    btn.classList.remove('recording');
    btn.title = 'Записать голосовое сообщение';
  }
}

/**
 * Показать превью записи
 */
function showRecordingPreview() {
  const inputArea = document.getElementById('message-input-area');
  if (!inputArea) return;
  
  // Проверяем есть ли уже превью
  let preview = document.getElementById('voice-recording-preview');
  if (preview) return;
  
  // Создаем превью
  preview = document.createElement('div');
  preview.id = 'voice-recording-preview';
  preview.className = 'voice-recording-preview';
  preview.innerHTML = `
    <div class="voice-recording-waveform" id="voice-waveform">
      ${Array(20).fill(0).map(() => '<div class="voice-recording-bar" style="height: 10px;"></div>').join('')}
    </div>
    <div class="voice-recording-time" id="voice-recording-time">0:00</div>
    <div class="voice-recording-actions">
      <button class="voice-cancel-btn" onclick="cancelVoiceRecording()">Отмена</button>
    </div>
  `;
  
  // Вставляем перед полем ввода
  const inputWrapper = inputArea.querySelector('.message-input-wrapper');
  if (inputWrapper) {
    inputArea.insertBefore(preview, inputWrapper);
  }
}

/**
 * Скрыть превью записи
 */
function hideRecordingPreview() {
  const preview = document.getElementById('voice-recording-preview');
  if (preview) {
    preview.remove();
  }
}

/**
 * Обновить время записи
 */
function updateRecordingTime() {
  if (!isRecording || !recordingStartTime) return;
  
  const elapsed = Date.now() - recordingStartTime;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  const timeEl = document.getElementById('voice-recording-time');
  if (timeEl) {
    timeEl.textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Анимация волн
  animateWaveform();
  
  // Автоматически останавливаем после 5 минут
  if (seconds >= 300) {
    stopVoiceRecording();
  }
}

/**
 * Анимация волн
 */
function animateWaveform() {
  const bars = document.querySelectorAll('.voice-recording-bar');
  bars.forEach(bar => {
    const height = Math.random() * 30 + 10;
    bar.style.height = height + 'px';
  });
}

/**
 * Показать превью записанного аудио
 */
function showVoicePreview(audioBlob) {
  hideRecordingPreview();
  
  const inputArea = document.getElementById('message-input-area');
  if (!inputArea) return;
  
  // Создаем URL для аудио
  const audioUrl = URL.createObjectURL(audioBlob);
  
  // Получаем длительность
  const audio = new Audio(audioUrl);
  audio.addEventListener('loadedmetadata', () => {
    const duration = Math.floor(audio.duration);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Создаем превью
    const preview = document.createElement('div');
    preview.id = 'voice-preview';
    preview.className = 'voice-recording-preview';
    preview.innerHTML = `
      <div class="voice-message-info">
        <div class="voice-recording-time">${durationText}</div>
        <div class="voice-message-waveform">
          <div class="voice-message-progress" style="width: 0%"></div>
        </div>
      </div>
      <button type="button" class="voice-play-btn" onclick="playVoicePreview('${audioUrl}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
      <div class="voice-recording-actions">
        <button class="voice-cancel-btn" onclick="cancelVoiceRecording()">Отмена</button>
        <button class="voice-send-btn" onclick="sendVoiceMessage()">Отправить</button>
      </div>
    `;
    
    // Сохраняем blob для отправки
    preview.dataset.audioBlob = audioUrl;
    window.currentVoiceBlob = audioBlob;
    
    // Вставляем перед полем ввода
    const inputWrapper = inputArea.querySelector('.message-input-wrapper');
    if (inputWrapper) {
      inputArea.insertBefore(preview, inputWrapper);
    }
  });
}

/**
 * Скрыть превью аудио
 */
function hideVoicePreview() {
  const preview = document.getElementById('voice-preview');
  if (preview) {
    // Освобождаем URL
    const audioUrl = preview.dataset.audioBlob;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    preview.remove();
  }
  window.currentVoiceBlob = null;
}

/**
 * Воспроизвести превью
 */
function playVoicePreview(audioUrl) {
  const audio = new Audio(audioUrl);
  audio.play();
}

/**
 * Отправить голосовое сообщение
 */
async function sendVoiceMessage() {
  if (!window.currentVoiceBlob) return;
  
  try {
    // Создаем FormData для загрузки
    const formData = new FormData();
    // ВАЖНО: поле должно называться 'file', как ожидает сервер
    formData.append('file', window.currentVoiceBlob, 'voice-message.webm');
    
    // Загружаем файл
    const response = await fetch(`${window.BASE_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Upload error:', errorData);
      throw new Error('Upload failed: ' + (errorData.message || response.statusText));
    }
    
    const data = await response.json();
    const audioUrl = data.url;

    // Отправляем сообщение с аудио (поля согласованы с Message.attachments на сервере)
    if (window.socket && window.currentChannelId) {
      window.socket.emit('message:send', {
        channelId: window.currentChannelId,
        content: '',
        attachments: [
          {
            type: 'audio',
            url: audioUrl,
            filename: data.filename || 'voice-message.webm',
            originalName: data.originalName || 'voice-message.webm',
            size: data.size || 0,
            mimetype: data.mimetype || 'audio/webm'
          }
        ]
      });
    }
    
    // Очищаем превью
    hideVoicePreview();
    
  } catch (error) {
    console.error('Error sending voice message:', error);
    alert('Не удалось отправить голосовое сообщение: ' + error.message);
  }
}

/**
 * Отобразить голосовое сообщение в чате
 */
function renderVoiceMessage(attachment, isOwn) {
  const baseUrl = window.BASE_URL || 'http://localhost:5555';
  const raw = attachment.url || '';
  const url = raw.startsWith('http') ? raw : `${baseUrl}${raw}`;
  const safeUrl = JSON.stringify(url);
  const ownClass = isOwn ? ' voice-message-own' : '';
  return `
    <div class="voice-message-player${ownClass}">
      <div class="voice-message-info">
        <div class="voice-message-duration">Голосовое сообщение</div>
        <div class="voice-message-waveform">
          <div class="voice-message-progress" style="width: 0%"></div>
        </div>
      </div>
      <button type="button" class="voice-play-btn" onclick="playVoiceMessage(${safeUrl}, this)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Воспроизвести голосовое сообщение
 */
function playVoiceMessage(url, button) {
  const audio = new Audio(url);
  const player = button.closest('.voice-message-player');
  const progress = player ? player.querySelector('.voice-message-progress') : null;
  
  // Меняем иконку на паузу
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
    </svg>
  `;
  
  // Обновляем прогресс
  audio.addEventListener('timeupdate', () => {
    const percent = (audio.currentTime / audio.duration) * 100;
    if (progress) {
      progress.style.width = percent + '%';
    }
  });
  
  // Когда закончится
  audio.addEventListener('ended', () => {
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;
    if (progress) {
      progress.style.width = '0%';
    }
  });
  
  audio.play();
  
  // Обработка клика для паузы
  button.onclick = () => {
    if (audio.paused) {
      audio.play();
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
        </svg>
      `;
    } else {
      audio.pause();
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
    }
  };
}
