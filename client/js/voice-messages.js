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
let activeVoiceMessageAudio = null;
let activeVoiceMessageButton = null;
let isVoiceSending = false;

const VOICE_UNMUTE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
const VOICE_MUTE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

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
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: typeof getVoiceAudioConstraints === 'function' ? getVoiceAudioConstraints() : true
    });
    if (typeof initializeAudioDeviceSelectors === 'function') initializeAudioDeviceSelectors();
    
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
    const volumeSetting = window.settingsManager ? window.settingsManager.get('output-volume') : 100;
    currentVoicePreviewAudio.volume = (Number(volumeSetting) ?? 100) / 100;
    if (typeof applyAudioOutputDevice === 'function') applyAudioOutputDevice(currentVoicePreviewAudio);
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
  if (isVoiceSending) return;

  isVoiceSending = true;
  const sendBtn = document.querySelector('#voice-preview .voice-send-btn');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.5';
  }
  
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
  } finally {
    isVoiceSending = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.style.opacity = '1';
    }
  }
}

function renderVoiceMessage(attachment, isOwn) {
  const baseUrl = window.BASE_URL || 'http://localhost:5555';
  const raw = attachment.url || '';
  const url = raw.startsWith('http') ? raw : `${baseUrl}${raw}`;
  const safeUrl = escapeHtml(url);
  const ownClass = isOwn ? ' voice-message-own' : '';
  return `
    <div class="voice-message-player${ownClass}">
      <button type="button" class="voice-play-btn" data-voice-url="${safeUrl}" onclick="playVoiceMessageFromButton(this)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </button>
      <div class="voice-message-info">
        <div class="voice-message-duration">
          ГС · <span class="voice-current-time">0:00</span> / <span class="voice-total-time">--:--</span>
        </div>
        <div class="voice-message-waveform">
          <div class="voice-message-progress" style="width: 0%"></div>
        </div>
      </div>
      <div class="voice-volume-controls">
        <button type="button" class="voice-mute-btn" onclick="toggleVoiceMessageMute(this)">${VOICE_UNMUTE_SVG}</button>
        <input type="range" class="voice-volume-slider" min="0" max="1" step="0.01" value="1" oninput="setVoiceVolume(this)">
      </div>
    </div>
  `;
}

function toggleVoiceMessageMute(btn) {
  const player = btn.closest('.voice-message-player');
  const audio = player._audio;
  if (!audio) return;
  audio.muted = !audio.muted;
  btn.innerHTML = audio.muted ? VOICE_MUTE_SVG : VOICE_UNMUTE_SVG;
  const slider = player.querySelector('.voice-volume-slider');
  if (slider) {
    slider.value = audio.muted ? 0 : audio.volume;
    slider.style.setProperty('--volume-progress', (slider.value * 100) + '%');
  }
}

function setVoiceVolume(slider) {
  const player = slider.closest('.voice-message-player');
  const audio = player._audio;
  if (!audio) return;
  audio.volume = slider.value;
  audio.muted = (slider.value == 0);
  const muteBtn = player.querySelector('.voice-mute-btn');
  if (muteBtn) {
    muteBtn.innerHTML = audio.muted ? VOICE_MUTE_SVG : VOICE_UNMUTE_SVG;
  }
  slider.style.setProperty('--volume-progress', (slider.value * 100) + '%');
}

function playVoiceMessageFromButton(button) {
  const url = button?.dataset?.voiceUrl;
  if (!url) return;
  playVoiceMessage(url, button);
  const player = button.closest('.voice-message-player');
  if (player) {
    player._audio = button._voiceAudio || player._voiceAudio;
  }
}

function bindVoicePlayerAudio(player, button, audio, url) {
  if (!player || !button || !audio || audio._voicePlayerBound) return;
  if (typeof applyAudioOutputDevice === 'function') applyAudioOutputDevice(audio);
  const volumeSetting = window.settingsManager ? window.settingsManager.get('output-volume') : 100;
  audio.volume = (Number(volumeSetting) ?? 100) / 100;
  audio._voicePlayerBound = true;

  // Waveform Drag seeking logic
  const waveform = player.querySelector('.voice-message-waveform');
  const progress = player.querySelector('.voice-message-progress');
  if (waveform && progress && !waveform._dragBound) {
    waveform._dragBound = true;

    function scrubTo(e) {
      if (!audio.duration) return;
      const rect = waveform.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
      progress.style.width = (pct * 100) + '%';
    }

    let isDragging = false;
    waveform.addEventListener('mousedown', (e) => {
      isDragging = true;
      scrubTo(e);

      const onMouseMove = (moveEvent) => {
        if (isDragging) scrubTo(moveEvent);
      };
      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // Initialize volume UI state
  const volumeSlider = player.querySelector('.voice-volume-slider');
  if (volumeSlider) {
    volumeSlider.value = audio.muted ? 0 : audio.volume;
    volumeSlider.style.setProperty('--volume-progress', (volumeSlider.value * 100) + '%');
  }
  const muteBtn = player.querySelector('.voice-mute-btn');
  if (muteBtn) {
    muteBtn.innerHTML = audio.muted ? VOICE_MUTE_SVG : VOICE_UNMUTE_SVG;
  }

  audio.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      _resolveWebmDuration(audio);
    } else {
      updateVoicePlayerProgress(player, audio);
    }
  });
  audio.addEventListener('durationchange', () => {
    if (audio._resolvingDuration && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio._resolvingDuration = false;
      try { audio.currentTime = 0; } catch (_) {}
    }
    updateVoicePlayerProgress(player, audio);
  });
  audio.addEventListener('timeupdate', () => {
    updateVoicePlayerProgress(player, audio);
  });
  audio.addEventListener('play', () => {
    setVoiceButtonIcon(button, true);
  });
  audio.addEventListener('pause', () => {
    if (!audio.ended) setVoiceButtonIcon(button, false);
  });
  audio.addEventListener('ended', () => {
    resetVoicePlayer(player, button);
    if (activeVoiceMessageAudio === audio) {
      activeVoiceMessageAudio = null;
      activeVoiceMessageButton = null;
    }
  });
  audio.addEventListener('error', () => {
    console.error('Voice message playback error:', audio.error, url);
    setVoiceButtonIcon(button, false);
  });
}

function _resolveWebmDuration(audio) {
  // WebM blobs from MediaRecorder often lack a valid duration in their
  // metadata. The cross-browser fix: seek past the end and wait for
  // durationchange, then rewind to 0.
  if (audio._durationResolved) return;
  audio._durationResolved = true;
  audio._resolvingDuration = true;
  try {
    audio.currentTime = 1e6;
  } catch (_) {
    // Some browsers throw before metadata; retry on next loadedmetadata.
    audio._durationResolved = false;
    audio._resolvingDuration = false;
  }
}

function ensureVoiceMessageMetadata(button) {
  if (!button || button._voiceAudio) return;
  const url = button.dataset?.voiceUrl;
  if (!url) return;
  const audio = new Audio(url);
  audio.preload = 'metadata';
  if (typeof applyAudioOutputDevice === 'function') applyAudioOutputDevice(audio);
  button._voiceAudio = audio;
  const player = button.closest('.voice-message-player');
  if (player) {
    player._voiceAudio = audio;
    player._audio = audio;
  }
  bindVoicePlayerAudio(player, button, audio, url);
  audio.load();
}

function _initVoiceMessagePreload() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const buttons = node.matches?.('.voice-message-player .voice-play-btn[data-voice-url]')
          ? [node]
          : Array.from(node.querySelectorAll?.('.voice-message-player .voice-play-btn[data-voice-url]') || []);
        buttons.forEach(ensureVoiceMessageMetadata);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial pass for already-rendered messages
  document.querySelectorAll('.voice-message-player .voice-play-btn[data-voice-url]').forEach(ensureVoiceMessageMetadata);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initVoiceMessagePreload);
} else {
  _initVoiceMessagePreload();
}

function updateVoicePlayerProgress(player, audio) {
  if (!player || !audio) return;
  const progress = player.querySelector('.voice-message-progress');
  const current = player.querySelector('.voice-current-time');
  const total = player.querySelector('.voice-total-time');

  if (current) current.textContent = formatDuration(audio.currentTime);
  if (total && Number.isFinite(audio.duration) && audio.duration > 0) {
    total.textContent = formatDuration(audio.duration);
  }
  if (progress && Number.isFinite(audio.duration) && audio.duration > 0) {
    progress.style.width = `${Math.min(100, Math.max(0, (audio.currentTime / audio.duration) * 100))}%`;
  }
}

function resetVoicePlayer(player, button) {
  if (button) setVoiceButtonIcon(button, false);
  if (!player) return;
  const progress = player.querySelector('.voice-message-progress');
  const current = player.querySelector('.voice-current-time');
  if (progress) progress.style.width = '0%';
  if (current) current.textContent = '0:00';
}

/**
 * Воспроизвести голосовое сообщение
 */
function playVoiceMessage(url, button) {
  const player = button.closest('.voice-message-player');
  if (button._voiceAudio) {
    const existing = button._voiceAudio;
    if (typeof applyAudioOutputDevice === 'function') applyAudioOutputDevice(existing);
    if (player) {
      player._voiceAudio = existing;
      player._audio = existing;
    }
    bindVoicePlayerAudio(player, button, existing, url);
    if (existing.paused) {
      if (activeVoiceMessageAudio && activeVoiceMessageAudio !== existing) {
        activeVoiceMessageAudio.pause();
        setVoiceButtonIcon(activeVoiceMessageButton, false);
      }
      if (existing.ended || (Number.isFinite(existing.duration) && existing.currentTime >= existing.duration)) {
        existing.currentTime = 0;
      }
      existing.play();
      activeVoiceMessageAudio = existing;
      activeVoiceMessageButton = button;
    } else {
      existing.pause();
    }
    return;
  }
  const audio = new Audio(url);
  audio.preload = 'metadata';
  button._voiceAudio = audio;
  if (player) {
    player._voiceAudio = audio;
    player._audio = audio;
  }
  bindVoicePlayerAudio(player, button, audio, url);
  
  if (activeVoiceMessageAudio && activeVoiceMessageAudio !== audio) {
    activeVoiceMessageAudio.pause();
    setVoiceButtonIcon(activeVoiceMessageButton, false);
  }

  audio.play()
    .then(() => {
      activeVoiceMessageAudio = audio;
      activeVoiceMessageButton = button;
    })
    .catch((error) => {
      console.error('Voice message play() failed:', error, url);
      setVoiceButtonIcon(button, false);
    });
}

function seekVoiceMessage(event, waveform) {
  const player = waveform.closest('.voice-message-player');
  if (!player) return;
  const button = player.querySelector('.voice-play-btn');
  let audio = player._voiceAudio || button?._voiceAudio;
  if (!audio && button) {
    const url = button.dataset.voiceUrl;
    if (url) {
      audio = new Audio(url);
      audio.preload = 'metadata';
      if (typeof applyAudioOutputDevice === 'function') applyAudioOutputDevice(audio);
      player._voiceAudio = audio;
      button._voiceAudio = audio;
      audio.addEventListener('loadedmetadata', () => {
        seekVoiceMessage(event, waveform);
        updateVoicePlayerProgress(player, audio);
      });
      audio.load();
    }
    return;
  }
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;

  const rect = waveform.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * audio.duration;
  updateVoicePlayerProgress(player, audio);
}

window.applyVolumeToVoiceMessages = function(volume) {
  const volVal = volume / 100;
  if (currentVoicePreviewAudio) {
    currentVoicePreviewAudio.volume = volVal;
  }
  document.querySelectorAll('.voice-play-btn').forEach(btn => {
    if (btn._voiceAudio) {
      btn._voiceAudio.volume = volVal;
    }
  });
};
