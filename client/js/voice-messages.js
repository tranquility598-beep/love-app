/**
 * Запись и отправка голосовых сообщений
 */

let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;
let isRecording = false;
let currentVoicePreviewUrl = null;
let currentVoicePreviewAudio = null;

/**
 * Безопасное форматирование длительности в "M:SS".
 * WebM blob от MediaRecorder часто не содержит валидной duration —
 * HTMLMediaElement в этом случае возвращает Infinity или NaN, что приводит
 * к строке "Infinity:NaN" в UI. Возвращаем "--:--" пока длительность не известна.
 */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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
      if (audioChunks.length === 0) return;
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
  currentVoicePreviewUrl = audioUrl;
  
  const durationText = recordingStartTime ? formatDuration((Date.now() - recordingStartTime) / 1000) : '--:--';
  const preview = document.createElement('div');
  preview.id = 'voice-preview';
  preview.className = 'voice-recording-preview voice-preview-ready';
  preview.innerHTML = `
    <button type="button" class="voice-play-btn" onclick="toggleVoicePreviewPlayback(this)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
    </button>
    <div class="voice-message-info">
      <div class="voice-message-duration">Предпросмотр · <span class="voice-preview-current">0:00</span> / <span>${durationText}</span></div>
      <div class="voice-message-waveform">
        <div class="voice-message-progress" style="width: 0%"></div>
      </div>
    </div>
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
}

function setVoiceButtonIcon(button, playing) {
  button.innerHTML = playing
    ? `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
      </svg>
    `
    : `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
}

function toggleVoicePreviewPlayback(button) {
  if (!currentVoicePreviewUrl) return;
  const preview = document.getElementById('voice-preview');
  const progress = preview?.querySelector('.voice-message-progress');
  const current = preview?.querySelector('.voice-preview-current');

  if (!currentVoicePreviewAudio) {
    currentVoicePreviewAudio = new Audio(currentVoicePreviewUrl);
    currentVoicePreviewAudio.addEventListener('timeupdate', () => {
      const audio = currentVoicePreviewAudio;
      if (!audio) return;
      if (current) current.textContent = formatDuration(audio.currentTime);
      if (progress && Number.isFinite(audio.duration) && audio.duration > 0) {
        progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
      }
    });
    currentVoicePreviewAudio.addEventListener('ended', () => {
      setVoiceButtonIcon(button, false);
      if (progress) progress.style.width = '0%';
      if (current) current.textContent = '0:00';
    });
  }

  if (currentVoicePreviewAudio.paused) {
    currentVoicePreviewAudio.play();
    setVoiceButtonIcon(button, true);
  } else {
    currentVoicePreviewAudio.pause();
    setVoiceButtonIcon(button, false);
  }
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
  if (currentVoicePreviewAudio) {
    currentVoicePreviewAudio.pause();
    currentVoicePreviewAudio = null;
  }
  currentVoicePreviewUrl = null;
  window.currentVoiceBlob = null;
}

/**
 * Воспроизвести превью
 */
function playVoicePreview(audioUrl) {
  currentVoicePreviewUrl = audioUrl;
  toggleVoicePreviewPlayback(document.querySelector('#voice-preview .voice-play-btn'));
}

/**
 * Отправить голосовое сообщение
 */
async function sendVoiceMessage() {
  if (!window.currentVoiceBlob) return;
  
  try {
    // Создаем FormData для загрузки.
    // ВАЖНО: поле должно называться 'file', как ожидает сервер.
    const formData = new FormData();
    formData.append('file', window.currentVoiceBlob, 'voice-message.webm');

    // Загрузка через безопасный IPC proxy (apiUpload подставляет токен в main process).
    // НЕ читаем raw JWT в renderer.
    const data = await apiUpload('/upload', formData, 'POST');
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
        <div class="voice-message-duration">Голосовое сообщение · <span class="voice-current-time">0:00</span></div>
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
  if (button._voiceAudio) {
    const existing = button._voiceAudio;
    if (existing.paused) {
      existing.play();
      setVoiceButtonIcon(button, true);
    } else {
      existing.pause();
      setVoiceButtonIcon(button, false);
    }
    return;
  }
  const audio = new Audio(url);
  button._voiceAudio = audio;
  const player = button.closest('.voice-message-player');
  const progress = player ? player.querySelector('.voice-message-progress') : null;
  const current = player ? player.querySelector('.voice-current-time') : null;
  
  // Меняем иконку на паузу
  setVoiceButtonIcon(button, true);
  
  // Обновляем прогресс. Если duration ещё неизвестна (Infinity/NaN),
  // не пишем NaN% в DOM.
  audio.addEventListener('timeupdate', () => {
    if (!progress) return;
    const dur = audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const percent = (audio.currentTime / dur) * 100;
    progress.style.width = percent + '%';
    if (current) current.textContent = formatDuration(audio.currentTime);
  });
  
  // Когда закончится
  audio.addEventListener('ended', () => {
    setVoiceButtonIcon(button, false);
    if (progress) {
      progress.style.width = '0%';
    }
  });
  
  audio.play();
}
