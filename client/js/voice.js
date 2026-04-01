/**
 * Voice модуль - WebRTC голосовой чат
 * Управляет peer-to-peer аудио соединениями и демонстрацией экрана
 */

class VoiceManager {
  constructor() {
    this.localStream = null;
    this.screenStream = null;
    this.peerConnections = new Map(); // socketId -> RTCPeerConnection
    this.audioElements = new Map(); // socketId -> HTMLAudioElement
    this.channelId = null;
    this.isMuted = false;
    this.isDeafened = false;
    this.isSpeaking = false;
    this.isScreenSharing = false;
    this.audioContext = null;
    this.analyser = null;
    this.speakingThreshold = 20;
    this.speakingCheckInterval = null;

    // ICE серверы для WebRTC
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
  }

  /**
   * Присоединиться к голосовому каналу
   */
  async joinChannel(channelId) {
    try {
      this.channelId = channelId;

      // Запрашиваем доступ к микрофону
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      // Настраиваем анализатор для определения говорящего
      this.setupAudioAnalyser();

      // Уведомляем сервер о входе в канал
      socketJoinVoice(channelId);

      // Звук входа (Discord-style)
      if (window.playVoiceSound) window.playVoiceSound('join');

      console.log('🎤 Joined voice channel:', channelId);
      return true;

    } catch (error) {
      console.error('Error joining voice channel:', error);
      if (error.name === 'NotAllowedError') {
        showNotification('error', 'Нет доступа к микрофону. Разрешите доступ в настройках.');
      } else {
        showNotification('error', 'Не удалось подключиться к голосовому каналу');
      }
      return false;
    }
  }

  /**
   * Покинуть голосовой канал
   */
  leaveChannel() {
    if (this.channelId) {
      socketLeaveVoice(this.channelId);
    }
    this.cleanup();
    
    // Звук выхода (Discord-style)
    if (window.playVoiceSound) window.playVoiceSound('disconnect');
  }

  /**
   * Очистка ресурсов
   */
  cleanup() {
    // Останавливаем демонстрацию экрана
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
      this.isScreenSharing = false;
    }

    // Останавливаем локальный поток
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Закрываем все peer соединения
    this.peerConnections.forEach((pc, socketId) => {
      pc.close();
    });
    this.peerConnections.clear();

    // Удаляем аудио элементы
    this.audioElements.forEach((audio, socketId) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();

    // Останавливаем анализатор
    if (this.speakingCheckInterval) {
      clearInterval(this.speakingCheckInterval);
      this.speakingCheckInterval = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.channelId = null;
    this.isMuted = false;
    this.isDeafened = false;
    this.isSpeaking = false;

    // Убираем видео демонстрации
    hideScreenShareVideo();

    console.log('🔇 Left voice channel');
  }

  /**
   * Инициировать WebRTC соединение с другим участником
   */
  async initiateConnection(targetSocketId, targetUserId) {
    try {
      const pc = this.createPeerConnection(targetSocketId);

      // Добавляем локальный поток
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          pc.addTrack(track, this.localStream);
        });
      }

      // Если есть демонстрация экрана — добавляем видеотрек
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => {
          pc.addTrack(track, this.screenStream);
        });
      }

      // Создаем offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      await pc.setLocalDescription(offer);

      // Отправляем offer через сигнальный сервер
      socketSendOffer(targetSocketId, offer, this.channelId);

      console.log('📤 Sent WebRTC offer to:', targetSocketId);

    } catch (error) {
      console.error('Error initiating WebRTC connection:', error);
    }
  }

  /**
   * Обработать входящий offer
   */
  async handleOffer(offer, fromSocketId, fromUserId) {
    try {
      const pc = this.createPeerConnection(fromSocketId);

      // Добавляем локальный поток
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          pc.addTrack(track, this.localStream);
        });
      }

      // Если есть демонстрация экрана — добавляем видеотрек
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => {
          pc.addTrack(track, this.screenStream);
        });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Создаем answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Отправляем answer
      socketSendAnswer(fromSocketId, answer, this.channelId);

      console.log('📥 Handled WebRTC offer from:', fromSocketId);

    } catch (error) {
      console.error('Error handling WebRTC offer:', error);
    }
  }

  /**
   * Обработать входящий answer
   */
  async handleAnswer(answer, fromSocketId) {
    try {
      const pc = this.peerConnections.get(fromSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ WebRTC connection established with:', fromSocketId);
      }
    } catch (error) {
      console.error('Error handling WebRTC answer:', error);
    }
  }

  /**
   * Обработать ICE кандидата
   */
  async handleIceCandidate(candidate, fromSocketId) {
    try {
      const pc = this.peerConnections.get(fromSocketId);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  /**
   * Создать RTCPeerConnection
   */
  createPeerConnection(socketId) {
    // Если уже есть connection — закрываем старый
    if (this.peerConnections.has(socketId)) {
      this.peerConnections.get(socketId).close();
    }

    const pc = new RTCPeerConnection(this.iceServers);
    this.peerConnections.set(socketId, pc);

    // ICE кандидаты
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketSendIceCandidate(socketId, event.candidate, this.channelId);
      }
    };

    // Получение удаленного потока
    pc.ontrack = (event) => {
      const track = event.track;
      console.log('🔊 Received remote track:', track.kind, 'from:', socketId);

      if (track.kind === 'audio') {
        this.playRemoteAudio(socketId, event.streams[0]);
      } else if (track.kind === 'video') {
        // Демонстрация экрана от другого пользователя
        showScreenShareVideo(event.streams[0], socketId);
      }
    };

    // Состояние соединения
    pc.onconnectionstatechange = () => {
      console.log(`WebRTC connection state (${socketId}):`, pc.connectionState);
      if (pc.connectionState === 'failed') {
        this.removeConnection(socketId);
      }
    };

    return pc;
  }

  /**
   * Воспроизвести удаленный аудио поток
   */
  playRemoteAudio(socketId, stream) {
    let audio = this.audioElements.get(socketId);

    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      document.body.appendChild(audio);
      this.audioElements.set(socketId, audio);
    }

    audio.srcObject = stream;

    if (this.isDeafened) {
      audio.muted = true;
    }
  }

  /**
   * Удалить соединение
   */
  removeConnection(socketId) {
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(socketId);
    }

    const audio = this.audioElements.get(socketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(socketId);
    }

    // Если это был тот, кто шарил экран — убираем видео
    hideScreenShareVideoForUser(socketId);
  }

  /**
   * Переключить микрофон
   */
  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }

    // Звук мута (Discord-style)
    if (window.playVoiceSound) {
      window.playVoiceSound(this.isMuted ? 'mute' : 'unmute');
    }

    socketToggleMute(this.channelId, this.isMuted);
    return this.isMuted;
  }

  /**
   * Переключить наушники (deafen)
   */
  toggleDeafen() {
    this.isDeafened = !this.isDeafened;

    // Заглушаем все удаленные потоки
    this.audioElements.forEach(audio => {
      audio.muted = this.isDeafened;
    });

    // Если включили deafen - также мутируем микрофон
    if (this.isDeafened && !this.isMuted) {
      this.isMuted = true;
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
    }

    // Звук дефена (Discord-style)
    if (window.playVoiceSound) {
      window.playVoiceSound(this.isDeafened ? 'deafen' : 'undeafen');
    }

    socketToggleDeafen(this.channelId, this.isDeafened);
    return this.isDeafened;
  }

  /**
   * Начать демонстрацию экрана
   */
  async startScreenShare() {
    if (this.isScreenSharing) {
      this.stopScreenShare();
      return false;
    }

    try {
      // Запрашиваем доступ к экрану
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      this.isScreenSharing = true;

      // Добавляем видеотрек во все существующие peer connections
      const videoTrack = this.screenStream.getVideoTracks()[0];

      this.peerConnections.forEach((pc, socketId) => {
        pc.addTrack(videoTrack, this.screenStream);
        // Пересоздаем offer для обновления
        this.renegotiate(socketId);
      });

      // Показываем свой экран локально (превью)
      showScreenShareVideo(this.screenStream, 'local');

      // Уведомляем сервер
      if (socket) {
        socket.emit('screen:start', { channelId: this.channelId });
      }

      // Обрабатываем остановку демонстрации через системный UI
      videoTrack.onended = () => {
        this.stopScreenShare();
      };

      showNotification('success', 'Демонстрация экрана запущена');
      return true;

    } catch (error) {
      console.error('Error starting screen share:', error);
      if (error.name !== 'NotAllowedError') {
        showNotification('error', 'Не удалось начать демонстрацию экрана');
      }
      return false;
    }
  }

  /**
   * Остановить демонстрацию экрана
   */
  stopScreenShare() {
    if (!this.isScreenSharing || !this.screenStream) return;

    // Удаляем видеотрек из всех peer connections
    const videoTrack = this.screenStream.getVideoTracks()[0];

    this.peerConnections.forEach((pc, socketId) => {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        pc.removeTrack(videoSender);
        this.renegotiate(socketId);
      }
    });

    // Останавливаем поток
    this.screenStream.getTracks().forEach(track => track.stop());
    this.screenStream = null;
    this.isScreenSharing = false;

    // Убираем видео
    hideScreenShareVideo();

    // Уведомляем сервер
    if (socket) {
      socket.emit('screen:stop', { channelId: this.channelId });
    }

    showNotification('info', 'Демонстрация экрана остановлена');
  }

  /**
   * Пересогласование WebRTC соединения (при добавлении/удалении треков)
   */
  async renegotiate(socketId) {
    const pc = this.peerConnections.get(socketId);
    if (!pc) return;

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      socketSendOffer(socketId, offer, this.channelId);
    } catch (error) {
      console.error('Error renegotiating:', error);
    }
  }

  /**
   * Настройка анализатора для определения говорящего
   */
  setupAudioAnalyser() {
    if (!this.localStream) return;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.speakingCheckInterval = setInterval(() => {
        if (!this.isMuted && this.analyser) {
          this.analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

          const isSpeaking = average > this.speakingThreshold;

          if (isSpeaking !== this.isSpeaking) {
            this.isSpeaking = isSpeaking;
            socketSpeaking(this.channelId, isSpeaking);
            updateSpeakingIndicator(window.currentUser?._id, isSpeaking);
          }
        }
      }, 100);

    } catch (error) {
      console.error('Error setting up audio analyser:', error);
    }
  }
}

// Глобальный экземпляр VoiceManager
window.voiceManager = null;

// Флаг для защиты от спама входа в войс
let _isJoiningVoice = false;

/**
 * Присоединиться к голосовому каналу
 */
async function joinVoiceChannel(channelId, channelName, serverName) {
  // ===== ЗАЩИТА ОТ СПАМА =====
  if (_isJoiningVoice) {
    console.log('⏳ Already joining voice channel, ignoring...');
    return;
  }

  // Если уже в этом же голосовом канале — переключаем интерфейс обратно на полнoэкранный Voice View
  if (window.currentVoiceChannel === channelId) {
    if (typeof showVoiceView === 'function') {
      showVoiceView();
    }
    console.log('ℹ️ Already in this voice channel');
    return;
  }

  _isJoiningVoice = true;

  try {
    // Если уже в другом голосовом канале - выходим
    if (window.currentVoiceChannel) {
      await leaveVoiceChannel();
    }

    window.voiceManager = new VoiceManager();
    const success = await window.voiceManager.joinChannel(channelId);

    if (success) {
      window.currentVoiceChannel = channelId;
      showVoicePanel(channelName, serverName);
      showNotification('success', `Вы подключились к каналу "${channelName}"`);
    }
  } finally {
    // Снимаем блокировку через небольшую задержку чтобы предотвратить мгновенный повтор
    setTimeout(() => {
      _isJoiningVoice = false;
    }, 1000);
  }
}

/**
 * Покинуть голосовой канал
 */
async function leaveVoiceChannel() {
  if (window.voiceManager) {
    window.voiceManager.leaveChannel();
    window.voiceManager = null;
  }
  window.currentVoiceChannel = null;
  hideVoicePanel();

  // Если открыт полноэкранный интерфейс, закрываем его
  const voiceView = document.getElementById('voice-view');
  if (voiceView && !voiceView.classList.contains('hidden')) {
    if (window.currentChannelId) {
      if (typeof showChatView === 'function') showChatView();
    } else {
      if (typeof showFriendsView === 'function') showFriendsView();
    }
  }
}

/**
 * Переключить микрофон в голосовом канале
 */
function toggleVoiceMute() {
  if (window.voiceManager) {
    const muted = window.voiceManager.toggleMute();
    
    // Синхронизация с маленькой боковой панелью
    const btn = document.getElementById('voice-mute-btn');
    if (btn) {
      btn.classList.toggle('muted', muted);
      btn.title = muted ? 'Включить микрофон' : 'Выключить микрофон';
    }
    
    // Синхронизация с полноэкранным Voice View панелью
    const viewBtn = document.getElementById('voice-view-mute-btn');
    if (viewBtn) {
      viewBtn.classList.toggle('muted', muted);
      viewBtn.title = muted ? 'Включить микрофон' : 'Выключить микрофон';
    }
    
    // Синхронизируем с нижней панелью пользователя и глобальной переменной
    if (typeof globalMicMuted !== 'undefined') globalMicMuted = muted;
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
      micBtn.classList.toggle('muted', muted);
      const icon = micBtn.querySelector('svg');
      if (icon) {
        if (muted) {
          icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/>';
        } else {
          icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
        }
      }
    }
  }
}

/**
 * Переключить наушники в голосовом канале
 */
function toggleVoiceDeafen() {
  if (window.voiceManager) {
    const deafened = window.voiceManager.toggleDeafen();
    const btn = document.getElementById('voice-deafen-btn');
    if (btn) {
      btn.classList.toggle('deafened', deafened);
      btn.title = deafened ? 'Включить звук' : 'Выключить звук';
    }

    // Синхронизация с полноэкранным Voice View
    const viewBtn = document.getElementById('voice-view-deafen-btn');
    if (viewBtn) {
      viewBtn.classList.toggle('deafened', deafened);
      viewBtn.title = deafened ? 'Включить звук' : 'Выключить звук';
    }
    
    // Синхронизируем с нижней панелью пользователя и глобальной переменной
    if (typeof globalDeafened !== 'undefined') globalDeafened = deafened;
    const headsetBtn = document.getElementById('headset-btn');
    if (headsetBtn) {
      headsetBtn.classList.toggle('muted', deafened);
      const icon = headsetBtn.querySelector('svg');
      if (icon) {
        if (deafened) {
          icon.innerHTML = '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="1" y1="1" x2="23" y2="23"/>';
        } else {
          icon.innerHTML = '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>';
        }
      }
    }
    
    // Если deafened включён, нужно также визуально выключить микрофон
    if (deafened) {
      const muteBtn = document.getElementById('voice-mute-btn');
      if (muteBtn) {
        muteBtn.classList.add('muted');
        muteBtn.title = 'Выключить микрофон';
      }
      const vmBtn = document.getElementById('voice-view-mute-btn');
      if (vmBtn) {
        vmBtn.classList.add('muted');
        vmBtn.title = 'Выключить микрофон';
      }
      
      const micBtn = document.getElementById('mic-btn');
      if (micBtn) {
        micBtn.classList.add('muted');
        const icon = micBtn.querySelector('svg');
        if (icon) {
          icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/>';
        }
      }
    }
  }
}

/**
 * Переключить камеру (заглушка)
 */
function toggleCamera() {
  const btn = document.getElementById('voice-view-camera-btn');
  if (!btn) return;
  
  const isActive = btn.classList.toggle('active');
  btn.title = isActive ? 'Выключить камеру' : 'Включить камеру';
  
  if (isActive) {
    showNotification('info', 'Камера в разработке. Скоро здесь будет ваше видео!');
  }
}

/**
 * Переключить демонстрацию экрана
 */
async function toggleScreenShare() {
  if (!window.voiceManager) {
    showNotification('warning', 'Сначала подключитесь к голосовому каналу');
    return;
  }

  const sharing = await window.voiceManager.startScreenShare();
  const btn = document.getElementById('voice-screen-btn');
  if (btn) {
    btn.classList.toggle('active', sharing);
    btn.title = sharing ? 'Остановить демонстрацию' : 'Демонстрация экрана';
  }

  const viewBtn = document.getElementById('voice-view-screen-btn');
  if (viewBtn) {
    viewBtn.classList.toggle('active', sharing);
    viewBtn.title = sharing ? 'Остановить демонстрацию' : 'Демонстрация экрана';
  }
}

/**
 * Показать панель голосового чата и переключить на полноэкранный Voice View
 */
function showVoicePanel(channelName, serverName) {
  const panel = document.getElementById('voice-panel');
  const nameEl = document.getElementById('voice-channel-name');
  const serverEl = document.getElementById('voice-server-name');
  
  // Обновляем плавающую боковую панель
  if (panel) panel.classList.remove('hidden');
  if (nameEl) nameEl.textContent = channelName;
  if (serverEl) serverEl.textContent = serverName || '';

  // Обновляем заголовок в полноэкранном Voice View
  const viewTitle = document.getElementById('voice-view-channel-name');
  if (viewTitle) viewTitle.textContent = channelName + (serverName ? ` (${serverName})` : '');

  // Переключаем интерфейс на экран голосового чата
  if (typeof showVoiceView === 'function') {
    showVoiceView();
  }
}

/**
 * Скрыть панель голосового чата
 */
function hideVoicePanel() {
  const panel = document.getElementById('voice-panel');
  if (panel) panel.classList.add('hidden');
}

/**
 * Показать видео демонстрации экрана
 */
function showScreenShareVideo(stream, sourceId) {
  let container = document.getElementById('screen-share-container'); // Старый контейнер, на всякий случай
  const gridContainer = document.getElementById('voice-view-grid'); // Новый контейнер

  let video = document.getElementById('screen-share-video-' + sourceId);
  const targetUserId = sourceId === 'local' ? window.currentUser?._id : sourceId;
  const screenCardId = 'voice-screen-card-' + targetUserId;
  let screenCard = document.getElementById(screenCardId);

  if (!video) {
    video = document.createElement('video');
    video.id = 'screen-share-video-' + sourceId;
    video.autoplay = true;
    video.playsInline = true;
    video.className = 'voice-card-video screen-share-video';
    if (sourceId === 'local') {
      video.muted = true; // Свой экран без звука
    }
    
    if (!screenCard) {
      screenCard = document.createElement('div');
      screenCard.id = screenCardId;
      screenCard.className = 'voice-card screen-share-card';
      
      const nameTag = sourceId === 'local' ? 'Вы' : 'Пользователь';
      
      screenCard.innerHTML = `
        <div class="voice-card-name-tag">📺 Экран: ${nameTag}</div>
        <button class="fullscreen-btn" title="На весь экран" onclick="const v = this.parentElement.querySelector('video'); if (v && v.requestFullscreen) v.requestFullscreen();">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        </button>
      `;

      if (gridContainer) {
        gridContainer.appendChild(screenCard);
      } else if (container) {
        container.querySelector('.screen-share-videos')?.appendChild(screenCard);
        container.classList.remove('hidden');
      }
    }
    screenCard.appendChild(video);
  } else if (screenCard && video.parentElement !== screenCard) {
    screenCard.appendChild(video);
  }

  video.srcObject = stream;
}

/**
 * Скрыть видео демонстрации экрана
 */
function hideScreenShareVideo() {
  const videos = document.querySelectorAll('.screen-share-video');
  videos.forEach(v => {
    v.srcObject = null;
    const card = v.parentElement;
    if (card && card.classList.contains('screen-share-card')) {
      card.remove();
    }
    v.remove();
  });
  
  const container = document.getElementById('screen-share-container');
  if (container) {
    container.classList.add('hidden');
  }
}

/**
 * Скрыть видео демонстрации экрана от конкретного пользователя
 */
function hideScreenShareVideoForUser(socketId) {
  const video = document.getElementById('screen-share-video-' + socketId);
  if (video) {
    video.srcObject = null;
    const card = video.parentElement;
    if (card && card.classList.contains('screen-share-card')) {
      card.remove();
    }
    video.remove();
  }
}

/**
 * Обновить индикатор говорящего
 */
function updateSpeakingIndicator(userId, speaking) {
  const memberEl = document.querySelector(`[data-user-id="${userId}"]`);
  if (memberEl) {
    const indicator = memberEl.querySelector('.member-speaking-indicator');
    if (indicator) {
      indicator.style.display = speaking ? 'block' : 'none';
    }
  }

  // Обновляем в сетке Voice View
  const voiceCardEl = document.getElementById(`voice-card-${userId}`);
  if (voiceCardEl) {
    voiceCardEl.classList.toggle('speaking', speaking);
  }

  // Обновляем в списке голосового канала
  const voiceMemberEl = document.querySelector(`.voice-member-item[data-user-id="${userId}"]`);
  if (voiceMemberEl) {
    voiceMemberEl.classList.toggle('voice-member-speaking', speaking);
  }
}

/**
 * Обновить UI голосового канала
 */
function updateVoiceChannelUI(channelId) {
  // Обновляем список участников в канале
  const channelEl = document.querySelector(`[data-channel-id="${channelId}"]`);
  if (channelEl) {
    // Перезагружаем данные канала
  }
}

/**
 * Обновить список участников голосового канала
 */
function updateVoiceChannelMembersUI(channelId, members) {
  const membersContainer = document.querySelector(`.voice-channel-members[data-channel-id="${channelId}"]`);
  if (!membersContainer) return;

  membersContainer.innerHTML = members.map(member => `
    <div class="voice-member-item" data-user-id="${member.userId}">
      <img class="voice-member-avatar" src="${getAvatarUrl(member.avatar)}" alt="${member.username}">
      <span class="voice-member-name">${member.username}${member.role === 'owner' ? ' <span title="Создатель" style="font-size:1.1em">👑</span>' : ''}</span>
      ${member.muted ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ed4245"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>' : ''}
    </div>
  `).join('');

  // Также обновим voice-panel участников если панель открыта
  updateVoicePanelMembers(channelId, members);
}

/**
 * Обновить участников в voice-panel
 * Обновить участников в боковой панели и в центральном Grid (Voice View)
 */
function updateVoicePanelMembers(channelId, members) {
  if (window.currentVoiceChannel !== channelId) return;
  
  // Обновляем маленькую боковую панель
  const panelMembers = document.getElementById('voice-panel-members');
  if (panelMembers) {
    panelMembers.innerHTML = members.map(member => `
      <div class="voice-panel-member ${member.userId === window.currentUser?._id ? 'self' : ''}" data-user-id="${member.userId}">
        <img class="voice-panel-member-avatar" src="${getAvatarUrl(member.avatar)}" alt="${member.username}">
        <span class="voice-panel-member-name">${member.username}</span>
        ${member.muted ? '<span class="voice-panel-member-muted">🔇</span>' : ''}
      </div>
    `).join('');
  }

  // Обновляем полноэкранный Grid (Voice View)
  const gridContainer = document.getElementById('voice-view-grid');
  if (gridContainer) {
    gridContainer.innerHTML = members.map(member => `
      <div class="voice-card" id="voice-card-${member.userId}" data-user-id="${member.userId}">
        <!-- Если у юзера есть видео (демонстрация экрана), оно будет вставлено сюда поверх аватарки -->
        <img class="voice-card-avatar" src="${getAvatarUrl(member.avatar)}" alt="${member.username}">
        <div class="voice-card-name-tag">
          ${member.username} 
          ${member.muted ? '🔇' : ''}
          ${member.deafened ? '🎧' : ''}
        </div>
      </div>
    `).join('');
    
    // Переразмещаем уже активные видео-элементы в отдельные новые карточки
    // Это гарантирует, что демонстрация экрана всегда остается в сетке, даже когда зашел новый пользователь и сетка перерисовалась
    const videos = document.querySelectorAll('.screen-share-video');
    videos.forEach(v => {
      const sourceId = v.id.replace('screen-share-video-', '');
      const targetUserId = sourceId === 'local' ? window.currentUser?._id : sourceId;
      
      const memberInfo = members.find(m => m.userId === targetUserId);
      const nameTag = memberInfo ? memberInfo.username : 'Пользователь';

      let screenCardId = 'voice-screen-card-' + targetUserId;
      let screenCard = document.getElementById(screenCardId);
      if (!screenCard) {
        screenCard = document.createElement('div');
        screenCard.id = screenCardId;
        screenCard.className = 'voice-card screen-share-card';
        screenCard.innerHTML = `
          <div class="voice-card-name-tag">📺 Экран: ${nameTag}</div>
          <button class="fullscreen-btn" title="На весь экран" onclick="const v = this.parentElement.querySelector('video'); if (v && v.requestFullscreen) v.requestFullscreen();">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        `;
        gridContainer.appendChild(screenCard);
      }
      screenCard.appendChild(v);
    });
    
    const videoContainer = document.getElementById('screen-share-container');
    if (videoContainer) {
      videoContainer.classList.add('hidden');
    }
  }
}

/**
 * Обновить UI кнопки мута
 */
function updateVoiceMuteUI(userId, muted) {
  const voiceMemberEl = document.querySelector(`.voice-member-item[data-user-id="${userId}"]`);
  if (voiceMemberEl) {
    voiceMemberEl.classList.toggle('voice-member-muted', muted);
  }
}

// ==================== DM VOICE CALLS LOGIC ====================

// Звуковое сопровождение (Discord-style)
const sounds = {
  calling: new Audio('assets/sounds/call_calling.mp3'),
  ringing: new Audio('assets/sounds/call_ringing.mp3'),
  join: new Audio('assets/sounds/user_join.mp3'),
  leave: new Audio('assets/sounds/user_leave.mp3'),
  mute: new Audio('assets/sounds/mute.mp3'),
  unmute: new Audio('assets/sounds/unmute.mp3'),
  deafen: new Audio('assets/sounds/deafen.mp3'),
  undeafen: new Audio('assets/sounds/undeafen.mp3'),
  disconnect: new Audio('assets/sounds/disconnect.mp3'),
  notification: new Audio('assets/sounds/discord-notification1.mp3')
};

// Зацикливаем гудки
sounds.calling.loop = true;
sounds.ringing.loop = true;

/**
 * Проиграть звук
 */
function playSound(name) {
  if (sounds[name]) {
    sounds[name].currentTime = 0;
    sounds[name].play().catch(() => {});
  }
}

/**
 * Начать звонок в ЛС (как звонящий)
 */
async function startDMCall() {
  if (!window.currentDMConversation) return;
  const other = window.currentDMConversation.participants?.find(p => p._id !== window.currentUser?._id);
  if (!other) return;

  console.log('📞 Initiating DM call to:', other.username);
  
  // Показываем оверлей
  showDMCallOverlay(other);
  
  // Звук исходящего вызова
  sounds.calling.play().catch(() => {});
  
  // Отправляем сокет-запрос
  if (window.socketRequestCall) {
    window.socketRequestCall(other._id);
  }
  // playRingingSound();
}

window.startDMCall = startDMCall;

/**
 * Показать оверлей звонка (для звонящего)
 */
function showDMCallOverlay(peer) {
  const overlay = document.getElementById('dm-call-overlay');
  const myImg = document.getElementById('caller-mini-my-img');
  const peerImg = document.getElementById('caller-mini-peer-img');
  const peerName = document.getElementById('call-overlay-peer-name');
  const status = document.getElementById('call-overlay-status');
  const peerContainer = document.getElementById('caller-mini-peer');

  if (!overlay) return;

  myImg.src = getAvatarUrl(window.currentUser?.avatar);
  peerImg.src = getAvatarUrl(peer.avatar);
  peerName.textContent = peer.username;
  status.textContent = 'ОЖИДАНИЕ ОТВЕТА...';
  
  peerContainer.classList.add('peer-ringing');
  overlay.classList.remove('hidden');
}

/**
 * Обработка ответа на наш звонок
 */
async function handleDMCallResponse(accepted, responderId) {
  const overlay = document.getElementById('dm-call-overlay');
  const status = document.getElementById('call-overlay-status');
  const peerContainer = document.getElementById('caller-mini-peer');

  // Всегда останавливаем гудок
  sounds.calling.pause();
  sounds.calling.currentTime = 0;

  if (!accepted) {
    status.textContent = 'ВЫЗОВ ОТКЛОНЕН';
    peerContainer.classList.remove('peer-ringing');

    // Визуальный эффект Бульк
    const ripple = document.getElementById('dm-bulk-ripple');
    if (ripple) ripple.classList.add('bulk-animate');

    // Анимация уменьшения
    peerContainer.classList.add('shrinking');
    playSound('disconnect');

    setTimeout(() => {
      overlay.classList.add('hidden');
      peerContainer.classList.remove('shrinking');
      if (ripple) ripple.classList.remove('bulk-animate');
    }, 1000);
    return;
  }

  // Принято!
  status.textContent = 'В ЭФИРЕ';
  peerContainer.classList.remove('peer-ringing');
  playSound('join');
  
  if (!window.voiceManager) {
    window.voiceManager = new VoiceManager();
    const callRoomId = `dm_call:${window.currentDMConversationId}`;
    window.voiceManager.channelId = callRoomId;
    await window.voiceManager.joinChannel(callRoomId);
  }
}

window.handleDMCallResponse = handleDMCallResponse;

/**
 * Завершение звонка (очистка)
 */
function handleDMCallEnd() {
  const overlay = document.getElementById('dm-call-overlay');
  if (overlay) overlay.classList.add('hidden');
  
  sounds.calling.pause();
  sounds.calling.currentTime = 0;
  playSound('disconnect');

  if (window.voiceManager) {
    window.voiceManager.leaveChannel();
    window.voiceManager = null;
  }
  
  showNotification('info', 'Звонок завершен');
}

window.handleDMCallEnd = handleDMCallEnd;

/**
 * Функция для получателя: войти в WebRTC после нажатия "Принять"
 */
async function startWebRTCCall(callerId) {
  // Останавливаем все звуки вызова (если были)
  sounds.calling.pause();
  sounds.ringing.pause();

  if (!window.voiceManager) {
    window.voiceManager = new VoiceManager();
    const callRoomId = `dm_call:${window.currentDMConversationId || 'direct'}`;
    window.voiceManager.channelId = callRoomId;
    await window.voiceManager.joinChannel(callRoomId);
  }
  playSound('join');
}

window.startWebRTCCall = startWebRTCCall;

// Инициируем звуки при муте/дефене
window.playVoiceSound = playSound;

function showDMCallOverlay(peer) {
  const overlay = document.getElementById('dm-call-overlay');
  const myImg = document.getElementById('caller-mini-my-img');
  const peerImg = document.getElementById('caller-mini-peer-img');
  const peerName = document.getElementById('call-overlay-peer-name');
  const status = document.getElementById('call-overlay-status');
  const peerContainer = document.getElementById('caller-mini-peer');

  if (!overlay) return;

  myImg.src = getAvatarUrl(window.currentUser?.avatar);
  peerImg.src = getAvatarUrl(peer.avatar);
  peerName.textContent = peer.username;
  status.textContent = 'ОЖИДАНИЕ ОТВЕТА...';
  
  peerContainer.classList.add('peer-ringing');
  overlay.classList.remove('hidden');
}

function endDMCall() {
  if (!window.currentDMConversation) return;
  const other = window.currentDMConversation.participants?.find(p => p._id !== window.currentUser?._id);
  if (other && window.socketEndCall) {
    window.socketEndCall(other._id);
  }
  handleDMCallEnd();
}
window.endDMCall = endDMCall;

window.toggleCallOverlay = () => {
  const overlay = document.getElementById('dm-call-overlay');
  if (overlay) overlay.classList.toggle('minimized');
};



