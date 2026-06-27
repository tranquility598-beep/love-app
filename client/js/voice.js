/**
 * Voice модуль - WebRTC голосовой чат
 * Управляет peer-to-peer аудио соединениями и демонстрацией экрана
 */

// ── Capacitor runtime permissions (Android 6+) ─────────────────────────
// На Android WebView getUserMedia() молча падает без явного разрешения.
// Запрашиваем RECORD_AUDIO / CAMERA через Capacitor Permissions API
// перед вызовом navigator.mediaDevices.getUserMedia().
async function ensureMicPermission() {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Permissions) {
      const perm = window.Capacitor.Plugins.Permissions;
      const mic = await perm.query({ name: 'microphone' });
      if (mic && mic.state !== 'granted') {
        const result = await perm.request({ name: 'microphone' });
        if (!result || result.state !== 'granted') {
          console.warn('⚠️ Microphone permission denied by user');
          return false;
        }
      }
    }
    // Fallback: если нет Capacitor Permissions API, пробуем обычный
    // navigator.permissions (поддерживается не везде, но не мешает)
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' });
        if (status.state === 'denied') {
          console.warn('⚠️ Microphone permission denied (system)');
          return false;
        }
      } catch (_) {}
    }
    return true;
  } catch (e) {
    console.warn('ensureMicPermission error:', e);
    return true; // не блокируем — пусть getUserMedia сам покажет диалог
  }
}

async function ensureCameraPermission() {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Permissions) {
      const perm = window.Capacitor.Plugins.Permissions;
      const cam = await perm.query({ name: 'camera' });
      if (cam && cam.state !== 'granted') {
        const result = await perm.request({ name: 'camera' });
        if (!result || result.state !== 'granted') {
          console.warn('⚠️ Camera permission denied by user');
          return false;
        }
      }
    }
    return true;
  } catch (e) {
    console.warn('ensureCameraPermission error:', e);
    return true;
  }
}

window.getAvatarUrl = function(avatar, name, userId) {
  if (!avatar) return 'assets/default-avatar.png';
  if (avatar.startsWith('http')) return avatar;
  
  let isPackaged = false;
  if (window.electronAPI && window.electronAPI.isPackagedSync) {
    isPackaged = window.electronAPI.isPackagedSync();
  }
  
  const BASE_URL = window.BASE_URL || (isPackaged ? 'https://api.loveapp.chat' : 'http://localhost:5555'); 
  return `${BASE_URL}/api/users/avatar/${avatar}`;
};

window._callDisconnectSoundPlayed = false;

window.playCallDisconnectSound = function() {
  if (window._callDisconnectSoundPlayed) return;
  window._callDisconnectSoundPlayed = true;
  if (window.SoundManager) {
    window.SoundManager.stop('call_outgoing');
    window.SoundManager.stop('call_incoming');
    window.SoundManager.play('user_leave');
  }
};

class VoiceManager {
  constructor() {
    this.localStream = null;
    this.screenStream = null;
    this.cameraStream = null;
    this.isCameraOn = false;
    this.peerConnections = new Map(); // socketId -> RTCPeerConnection
    this.audioElements = new Map(); // socketId -> HTMLAudioElement
    this.remoteVideoStreams = new Map(); // socketId -> MediaStream (камера или экран)
    this.screenActiveSockets = new Set(); // socketId с активной демонстрацией экрана (для различения камера/экран)
    this.channelId = null;
    this.isMuted = false;
    this.isDeafened = false;
    this.isSpeaking = false;
    this.isScreenSharing = false;
    this.audioContext = null;
    this.analyser = null;
    this.speakingThreshold = 20;
    this.speakingCheckInterval = null;
    this.remoteAudioStatsIntervals = new Map();
    this.channelMembers = [];

    // Offer queue to prevent signaling glare (double-offer race condition)
    this._offerQueue = new Map(); // socketId -> Array of pending offer tasks
    this._processingOffer = new Map(); // socketId -> boolean

    // ICE candidate buffer: store candidates that arrive before remote description is set
    this._iceCandidateBuffer = new Map(); // socketId -> Array of RTCIceCandidate

    // ICE серверы для WebRTC
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
          urls: 'turn:free.expressturn.com:3478',
          username: '000000002095347409',
          credential: 'W1fE2z8UXd7ookqQdKtFKpC9cnA='
        },
        {
          urls: 'turn:free.expressturn.com:3478?transport=tcp',
          username: '000000002095347409',
          credential: 'W1fE2z8UXd7ookqQdKtFKpC9cnA='
        },
        {
          urls: 'turns:free.expressturn.com:443?transport=tcp',
          username: '000000002095347409',
          credential: 'W1fE2z8UXd7ookqQdKtFKpC9cnA='
        }
      ]
    };
  }

  /**
   * Присоединиться к голосовому каналу
   */
  async joinChannel(channelId) {
    try {
      this.channelId = channelId;

      // Запрашиваем разрешение на микрофон (Android 6+ / Capacitor)
      const micOk = await ensureMicPermission();
      if (!micOk) {
        console.error('🎙️ Microphone permission denied — cannot join voice');
        if (typeof showToast === 'function') showToast('Микрофон', 'Разрешите доступ к микрофону в настройках устройства.');
        return false;
      }

      // Запрашиваем доступ к микрофону
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: typeof getVoiceAudioConstraints === 'function' ? getVoiceAudioConstraints() : true,
        video: false
      });
      if (typeof setupVoiceDeviceSelectors === 'function') setupVoiceDeviceSelectors();

      console.log('🎙️ Local audio tracks:', this.localStream.getAudioTracks().map(track => ({
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      })));

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
        console.warn('[Voice] Microphone access denied');
      } else {
        console.warn('[Voice] Failed to join voice channel:', error.message);
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

    // Останавливаем камеру
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
    this.isCameraOn = false;
    this.remoteVideoStreams.clear();
    this.screenActiveSockets.clear();

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

    this.remoteAudioStatsIntervals.forEach(intervalId => clearInterval(intervalId));
    this.remoteAudioStatsIntervals.clear();

    // Очищаем очереди и буферы сигнализации
    this._offerQueue.clear();
    this._processingOffer.clear();
    this._iceCandidateBuffer.clear();

    // Останавливаем анализатор
    if (this.speakingCheckInterval) {
      clearTimeout(this.speakingCheckInterval);
      this.speakingCheckInterval = null;
    }
    this.analyser = null;

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
          const senders = pc.getSenders();
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, this.localStream);
          }
        });
      }

      // Если есть демонстрация экрана — добавляем видеотрек
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => {
          const senders = pc.getSenders();
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, this.screenStream);
          }
        });
      }

      // Оптимизация: ограничиваем битрейт аудио (речи хватает ~32 кбит/с)
      this._optimizeAudioBitrate(pc);

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
   * Оптимизация битрейта аудио: ~32 кбит/с достаточно для речи Opus.
   * Снижает нагрузку на сеть и CPU. Без SDP-munging — через RTCRtpSender.setParameters.
   */
  async _optimizeAudioBitrate(pc) {
    try {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
      if (!sender) return;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = 32000;   // 32 кбит/с — речь
      params.encodings[0].priority = 'high';     // голос важнее видео
      await sender.setParameters(params);
    } catch (e) {
      console.warn('[Voice] audio bitrate optimize skipped:', e && e.message);
    }
  }

  _getVideoBitrateForPeerCount() {
    const count = this.peerConnections.size;
    if (count <= 1) return 2500000;
    if (count <= 3) return 1500000;
    if (count <= 6) return 800000;
    return 400000;
  }

  async _optimizeVideoBitrate(pc) {
    try {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (!sender) return;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      if (this.isScreenSharing) {
        // Демонстрация экрана: полное разрешение (без даунскейла, иначе текст
        // мылится) + щедрый битрейт из выбранного качества. contentHint='detail'
        // подсказывает кодеку беречь резкость, а не плавность.
        params.encodings[0].maxBitrate = this._screenBitrate || 6000000;
        delete params.encodings[0].scaleResolutionDownBy;
        if (sender.track && 'contentHint' in sender.track) sender.track.contentHint = 'detail';
      } else {
        // Камера: адаптивный битрейт и даунскейл при большом числе участников.
        params.encodings[0].maxBitrate = this._getVideoBitrateForPeerCount();
        params.encodings[0].scaleResolutionDownBy = this.peerConnections.size > 3 ? 2 : 1;
        if (sender.track && 'contentHint' in sender.track) sender.track.contentHint = 'motion';
      }
      await sender.setParameters(params);
    } catch (e) {
      console.warn('[Voice] video bitrate optimize skipped:', e && e.message);
    }
  }

  async restartConnection(socketId) {
    const pc = this.peerConnections.get(socketId);
    if (!pc || pc.signalingState === 'closed') return;

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socketSendOffer(socketId, offer, this.channelId);
      console.log('🔁 Restarted WebRTC ICE with:', socketId);
    } catch (error) {
      console.error('Error restarting WebRTC connection:', error);
      this.removeConnection(socketId);
    }
  }

  /**
   * Обработать входящий offer (с очередью для предотвращения signaling glare)
   */
  async handleOffer(offer, fromSocketId, fromUserId) {
    // Queue offers per peer to serialize processing and prevent glare
    if (!this._offerQueue.has(fromSocketId)) {
      this._offerQueue.set(fromSocketId, []);
    }

    const queue = this._offerQueue.get(fromSocketId);
    
    // If already processing an offer from this peer, queue the new one
    // and drop any previously queued (only latest matters)
    if (this._processingOffer.get(fromSocketId)) {
      queue.length = 0; // drop stale queued offers
      queue.push({ offer, fromSocketId, fromUserId });
      console.log('[Voice] Queued offer from:', fromSocketId, '(previous still processing)');
      return;
    }

    this._processingOffer.set(fromSocketId, true);
    try {
      await this._processOffer(offer, fromSocketId, fromUserId);
    } finally {
      this._processingOffer.set(fromSocketId, false);
      // Process next queued offer if any
      const next = queue.shift();
      if (next) {
        console.log('[Voice] Processing queued offer from:', next.fromSocketId);
        this.handleOffer(next.offer, next.fromSocketId, next.fromUserId)
          .catch(err => console.error('[Voice] Queued offer processing failed:', err));
      }
    }
  }

  /**
   * Внутренняя обработка offer (без конкуренции)
   */
  async _processOffer(offer, fromSocketId, fromUserId) {
    try {
      const pc = this.createPeerConnection(fromSocketId);

      // Добавляем локальный поток
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          const senders = pc.getSenders();
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, this.localStream);
          }
        });
      }

      // Если есть демонстрация экрана — добавляем видеотрек
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => {
          const senders = pc.getSenders();
          if (!senders.find(s => s.track === track)) {
            pc.addTrack(track, this.screenStream);
          }
        });
      }

      // Proper rollback: if we're not in stable state, rollback first
      if (pc.signalingState !== 'stable') {
        console.log('[Voice] Rolling back signaling state:', pc.signalingState, 'for:', fromSocketId);
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (rollbackError) {
          console.warn('WebRTC rollback failed, recreating PC:', rollbackError);
          // If rollback fails, destroy and recreate the peer connection
          this.peerConnections.delete(fromSocketId);
          pc.close();
          return await this._processOffer(offer, fromSocketId, fromUserId);
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush any ICE candidates that arrived before we set remote desc
      await this._flushIceCandidates(fromSocketId);

      // Оптимизация: ограничиваем битрейт аудио и на стороне отвечающего
      this._optimizeAudioBitrate(pc);

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
      if (!pc) return;

      // Glare safety: if we rolled back our offer to accept theirs,
      // the stale answer to our old offer will arrive later.
      // Only apply answer if we're actually waiting for one.
      if (pc.signalingState !== 'have-local-offer') {
        console.warn('[Voice] Ignoring stale answer from:', fromSocketId,
          '(signalingState:', pc.signalingState, ')');
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ WebRTC connection established with:', fromSocketId);

      // Flush buffered ICE candidates now that remote description is set
      this._flushIceCandidates(fromSocketId);
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
      if (!pc || !candidate) return;

      // Buffer candidates if remote description hasn't been set yet
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        if (!this._iceCandidateBuffer.has(fromSocketId)) {
          this._iceCandidateBuffer.set(fromSocketId, []);
        }
        this._iceCandidateBuffer.get(fromSocketId).push(candidate);
        console.log('[Voice] Buffered ICE candidate for:', fromSocketId,
          '(no remote desc yet, buffer size:', this._iceCandidateBuffer.get(fromSocketId).length, ')');
        return;
      }

      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      // Ignore harmless errors for candidates that arrive during rollback
      if (error.name === 'InvalidStateError') {
        console.warn('[Voice] Ignored ICE candidate in invalid state:', fromSocketId);
      } else {
        console.error('Error handling ICE candidate:', error);
      }
    }
  }

  /**
   * Flush buffered ICE candidates after remote description is set
   */
  async _flushIceCandidates(socketId) {
    const buffered = this._iceCandidateBuffer.get(socketId);
    if (!buffered || buffered.length === 0) return;

    const pc = this.peerConnections.get(socketId);
    if (!pc) return;

    console.log('[Voice] Flushing', buffered.length, 'buffered ICE candidates for:', socketId);
    this._iceCandidateBuffer.delete(socketId);

    for (const candidate of buffered) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn('[Voice] Failed to apply buffered ICE candidate:', error);
      }
    }
  }

  /**
   * Создать RTCPeerConnection
   */
  createPeerConnection(socketId) {
    // Если уже есть активное соединение — возвращаем его
    if (this.peerConnections.has(socketId)) {
      const existingPc = this.peerConnections.get(socketId);
      if (existingPc.signalingState !== 'closed') {
        return existingPc;
      }
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
      console.log('🔊 Received remote track:', track.kind, 'from:', socketId, {
        id: track.id,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
      track.onmute = () => console.warn('🔇 Remote track muted:', socketId, track.kind);
      track.onunmute = () => console.log('🔊 Remote track unmuted:', socketId, track.kind);
      track.onended = () => console.warn('⏹️ Remote track ended:', socketId, track.kind);

      const stream = event.streams[0] || new MediaStream([track]);

      if (track.kind === 'audio') {
        this.playRemoteAudio(socketId, stream);
      } else if (track.kind === 'video') {
        // Камера и демонстрация взаимоисключающие, поэтому различаем по тому,
        // была ли активна демонстрация экрана от этого участника (screen:started).
        this.remoteVideoStreams.set(socketId, stream);
        const isScreen = this.screenActiveSockets.has(socketId);
        if (isScreen) {
          // Демонстрация экрана от другого пользователя.
          // showScreenShareVideo handles both creating new and updating existing
          // elements (needed after renegotiation with new stream).
          showScreenShareVideo(stream, socketId);
        } else if (typeof showRemoteCameraVideo === 'function') {
          // Камера другого пользователя — рисуем в превью-камеру.
          showRemoteCameraVideo(stream, socketId);
        }
        // Когда трек завершается (камера/экран выключены удалённо) — чистим превью.
        track.addEventListener('ended', () => {
          this.remoteVideoStreams.delete(socketId);
          if (typeof hideRemoteCameraVideo === 'function') hideRemoteCameraVideo(socketId);
        });
      }
    };

    // Состояние соединения
    pc.onconnectionstatechange = () => {
      console.log(`WebRTC connection state (${socketId}):`, pc.connectionState);
      if (pc.connectionState === 'failed') {
        // Attempt ICE restart for any channel type (not just DM calls)
        if (!pc._iceRestartAttempted) {
          pc._iceRestartAttempted = true;
          console.log('[Voice] Connection failed, attempting ICE restart for:', socketId);
          this.restartConnection(socketId);
        } else {
          console.warn('[Voice] ICE restart already attempted, removing connection:', socketId);
          this.removeConnection(socketId);
        }
      }
      if (pc.connectionState === 'connected') {
        pc._iceRestartAttempted = false; // reset on success
        this.startRemoteAudioStats(socketId, pc);
      }
    };

    return pc;
  }

  startRemoteAudioStats(socketId, pc) {
    if (this.remoteAudioStatsIntervals.has(socketId)) return;

    const intervalId = setInterval(async () => {
      if (!this.peerConnections.has(socketId) || pc.connectionState === 'closed') {
        clearInterval(intervalId);
        this.remoteAudioStatsIntervals.delete(socketId);
        return;
      }

      try {
        const stats = await pc.getStats();
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            if (window.__LOVE_DEBUG) {
              console.log('📊 Remote audio stats:', socketId, {
                bytesReceived: report.bytesReceived,
                packetsReceived: report.packetsReceived,
                packetsLost: report.packetsLost,
                jitter: report.jitter,
                audioLevel: report.audioLevel
              });
            }
          }
        });
      } catch (error) {
        // silent
      }
    }, 5000);

    this.remoteAudioStatsIntervals.set(socketId, intervalId);
  }

  /**
   * Воспроизвести удаленный аудио поток
   */
  playRemoteAudio(socketId, stream) {
    if (!stream) return;
    let audio = this.audioElements.get(socketId);

    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.controls = false;
      audio.volume = 1;
      audio.setAttribute('autoplay', 'true');
      audio.setAttribute('playsinline', 'true');
      audio.addEventListener('playing', () => console.log('🔈 Remote audio element playing:', socketId));
      audio.addEventListener('pause', () => console.log('⏸️ Remote audio element paused:', socketId));
      audio.addEventListener('error', () => console.error('Remote audio element error:', audio.error, socketId));
      // Добавляем к body только один раз
      document.body.appendChild(audio);
      this.audioElements.set(socketId, audio);
    }

    if (typeof applyAudioOutputDevice === 'function') {
      applyAudioOutputDevice(audio);
    }

    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }

    // Заглушение звука (deafen) удалено — входящий звук не мьютим.
    audio.muted = false;
    audio.volume = (Number(window.settingsManager?.get('output-volume')) || 100) / 100;

    // Принудительный запуск (некоторые браузеры блокируют autoplay без .play())
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
      .then(() => {
        console.log('🔈 Remote audio play() resolved:', socketId, {
          muted: audio.muted,
          volume: audio.volume,
          paused: audio.paused,
          readyState: audio.readyState
        });
      })
      .catch(error => {
        console.warn('Audio auto-play failed, will try on interaction:', error);
        // Fallback: запуск по любому клику в документе
        const resumeAudio = () => {
          audio.muted = false;
          audio.volume = 1;
          audio.play().catch(() => {});
          document.removeEventListener('click', resumeAudio);
          document.removeEventListener('keydown', resumeAudio);
        };
        document.addEventListener('click', resumeAudio);
        document.addEventListener('keydown', resumeAudio);
      });
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

    const statsInterval = this.remoteAudioStatsIntervals.get(socketId);
    if (statsInterval) {
      clearInterval(statsInterval);
      this.remoteAudioStatsIntervals.delete(socketId);
    }

    // Clean up offer queue and ICE buffer for this peer
    this._offerQueue.delete(socketId);
    this._processingOffer.delete(socketId);
    this._iceCandidateBuffer.delete(socketId);

    // Если это был тот, кто шарил экран — убираем видео
    hideScreenShareVideoForUser(socketId);
  }

  /**
   * Переключить микрофон
   */
  // Управляет ТОЛЬКО микрофоном (локальный аудио-трек). Идемпотентно:
  // force=true/false жёстко задаёт состояние, без аргумента — переключает.
  // Повторный клик в то же состояние не двоит звук/эмит (защита от спам-кликов).
  toggleMute(force) {
    const next = (typeof force === 'boolean') ? force : !this.isMuted;

    // Всегда приводим трек в соответствие с целевым состоянием (самовосстановление).
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !next;
      });
    }

    if (next === this.isMuted) return this.isMuted; // уже в нужном состоянии

    this.isMuted = next;

    // Если замутились, сбрасываем статус говорения
    if (this.isMuted && this.isSpeaking) {
      this.isSpeaking = false;
      socketSpeaking(this.channelId, false);
      updateSpeakingIndicator(window.currentUser?._id, false);
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
  // Управляет ТОЛЬКО входящим звуком (deafen-флаг). Микрофон НЕ трогает —
  // логика жёстко изолирована от toggleMute. Идемпотентно (force=true/false).
  toggleDeafen(force) {
    const next = (typeof force === 'boolean') ? force : !this.isDeafened;

    // Всегда синхронизируем входящие аудио-элементы с целевым состоянием.
    this.audioElements.forEach(audio => {
      audio.muted = next;
    });

    if (next === this.isDeafened) return this.isDeafened; // уже в нужном состоянии

    this.isDeafened = next;

    // Звук дефена (Discord-style)
    if (window.playVoiceSound) {
      window.playVoiceSound(this.isDeafened ? 'deafen' : 'undeafen');
    }

    socketToggleDeafen(this.channelId, this.isDeafened);
    return this.isDeafened;
  }

  /**
   * Показать настройки демонстрации экрана
   */
  showScreenShareSettings() {
    if (typeof openModal === 'function') {
      openModal('screen-share-settings-modal');
    } else {
      const modal = document.getElementById('screen-share-settings-modal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    }
  }

  /**
   * Начать демонстрацию экрана с выбранными настройками
   */
  async startScreenShare(quality = 'ultra') {
    if (this.isScreenSharing) {
      this.stopScreenShare();
      return false;
    }

    // Настройки качества
    const qualitySettings = {
      low: { width: 854, height: 480, frameRate: 10, bitrate: 1000000 },
      medium: { width: 1280, height: 720, frameRate: 15, bitrate: 2500000 },
      high: { width: 1920, height: 1080, frameRate: 24, bitrate: 4000000 },
      ultra: { width: 1920, height: 1080, frameRate: 30, bitrate: 6000000 }
    };

    const settings = qualitySettings[quality] || qualitySettings.ultra;
    // Битрейт демонстрации берётся отсюда в _optimizeVideoBitrate (без даунскейла).
    this._screenBitrate = settings.bitrate || 6000000;

    try {
      // Запрашиваем доступ к экрану с выбранными настройками
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          width: { ideal: settings.width },
          height: { ideal: settings.height },
          frameRate: { ideal: settings.frameRate }
        },
        audio: false
      });

      this.isScreenSharing = true;

      // Добавляем видеотрек во все существующие peer connections
      const videoTrack = this.screenStream.getVideoTracks()[0];

      // Process peers sequentially to avoid overlapping renegotiations
      for (const [socketId, pc] of this.peerConnections) {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          
          if (videoSender) {
            // Заменяем существующий видео трек
            await videoSender.replaceTrack(videoTrack);
          } else {
            // Добавляем новый видео трек
            pc.addTrack(videoTrack, this.screenStream);
          }
          
          // Пересоздаем offer для обновления (sequential, not parallel)
          await this.renegotiate(socketId);
          await this._optimizeVideoBitrate(pc);
        } catch (err) {
          console.error('Error adding screen share track:', err);
        }
      }

      // Показываем свой экран локально (превью)
      showScreenShareVideo(this.screenStream, 'local');
      // Перерисовываем констелляцию нового дизайна — теперь screenStream готов
      if (typeof _triggerVoiceRerender === 'function') _triggerVoiceRerender();

      // Уведомляем сервер
      if (socket) {
        socket.emit('screen:start', { channelId: this.channelId });
      }

      // Обрабатываем остановку демонстрации через системный UI
      videoTrack.onended = () => {
        console.warn('[Voice] videoTrack.onended fired in voice.js! readyState:', videoTrack.readyState);
        this.stopScreenShare();
      };

      console.log('[Voice] Screen share started');
      return true;

    } catch (error) {
      console.error('Error starting screen share:', error);
      if (error.name !== 'NotAllowedError') {
        console.warn('[Voice] Screen share failed:', error.message);
      }
      return false;
    }
  }

  /**
   * Остановить демонстрацию экрана
   */
  async stopScreenShare() {
    console.log('[Voice] stopScreenShare called. isScreenSharing:', this.isScreenSharing, 'screenStream:', !!this.screenStream, 'Stack:', new Error().stack);
    if (!this.isScreenSharing || !this.screenStream) return;

    // Удаляем видеотрек из всех peer connections (sequential to avoid glare)
    const videoTrack = this.screenStream.getVideoTracks()[0];
    const renegotiateList = [];

    for (const [socketId, pc] of this.peerConnections) {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        pc.removeTrack(videoSender);
        renegotiateList.push(socketId);
      }
    }

    // Renegotiate sequentially
    for (const socketId of renegotiateList) {
      try {
        await this.renegotiate(socketId);
      } catch (err) {
        console.error('[Voice] Renegotiate failed on screen stop for:', socketId, err);
      }
    }

    // Останавливаем поток
    this.screenStream.getTracks().forEach(track => track.stop());
    this.screenStream = null;
    this.isScreenSharing = false;

    // Убираем видео
    hideScreenShareVideo();

    // Сбрасываем активные состояния кнопок в UI
    const btn = document.getElementById('voice-screen-btn');
    if (btn) {
      btn.classList.remove('active');
      btn.title = 'Демонстрация экрана';
    }
    const viewBtn = document.getElementById('voice-view-screen-btn');
    if (viewBtn) {
      viewBtn.classList.remove('active');
      viewBtn.title = 'Демонстрация экрана';
    }
    const roomBtn = document.getElementById('room-voice-btn-share');
    if (roomBtn) {
      roomBtn.classList.remove('active-state');
      roomBtn.classList.add('muted-state');
    }

    // Уведомляем сервер
    if (socket) {
      socket.emit('screen:stop', { channelId: this.channelId });
    }

    // Синхронизируем визуальное состояние нового дизайна (например, если
    // демонстрация остановлена системным UI, а не нашей кнопкой).
    if (window.voiceState) window.voiceState.shareActive = false;
    if (typeof _triggerVoiceRerender === 'function') _triggerVoiceRerender();

    console.log('[Voice] Screen share stopped');
  }

  /**
   * Включить камеру
   */
  async startCamera() {
    if (this.isCameraOn || this._cameraStarting) return true;
    this._cameraStarting = true;

    // Камера и демонстрация взаимоисключающие — если идёт показ экрана, останавливаем его
    if (this.isScreenSharing) {
      await this.stopScreenShare();
    }

    try {
      const camOk = await ensureCameraPermission();
      if (!camOk) {
        console.warn('⚠️ Camera permission denied');
        this._cameraStarting = false;
        return false;
      }
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15 },
          // На мобильных выбирает фронталку/заднюю; на десктопе игнорируется.
          facingMode: { ideal: this._cameraFacing || 'user' }
        },
        audio: false
      });
    } catch (error) {
      console.error('[Voice] Error starting camera:', error);
      this.cameraStream = null;
      this._cameraStarting = false;
      return false;
    }

    this.isCameraOn = true;
    this._cameraStarting = false;

    const videoTrack = this.cameraStream.getVideoTracks()[0];

    // Добавляем видеотрек во все существующие peer connections (sequential to avoid glare)
    for (const [socketId, pc] of this.peerConnections) {
      try {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, this.cameraStream);
        }
        await this.renegotiate(socketId);
        await this._optimizeVideoBitrate(pc);
      } catch (err) {
        console.error('[Voice] Error adding camera track:', err);
      }
    }

    // Показываем свою камеру локально (превью)
    if (typeof showLocalCameraVideo === 'function') {
      showLocalCameraVideo(this.cameraStream);
    }

    // Уведомляем сервер — состояние камеры разойдётся всем в members_update.
    if (socket) {
      socket.emit('camera:start', { channelId: this.channelId });
    }

    // Если камеру выключили на уровне ОС/драйвера — гасим состояние
    videoTrack.onended = () => {
      console.warn('[Voice] camera videoTrack.onended fired');
      this.stopCamera();
    };

    console.log('[Voice] Camera started');
    return true;
  }

  /**
   * Выключить камеру
   */
  async stopCamera() {
    if (!this.isCameraOn || !this.cameraStream) return;

    const renegotiateList = [];
    for (const [socketId, pc] of this.peerConnections) {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        pc.removeTrack(videoSender);
        renegotiateList.push(socketId);
      }
    }

    for (const socketId of renegotiateList) {
      try {
        await this.renegotiate(socketId);
      } catch (err) {
        console.error('[Voice] Renegotiate failed on camera stop for:', socketId, err);
      }
    }

    this.cameraStream.getTracks().forEach(track => track.stop());
    this.cameraStream = null;
    this.isCameraOn = false;

    if (typeof hideLocalCameraVideo === 'function') {
      hideLocalCameraVideo();
    }

    // Уведомляем сервер об остановке камеры.
    if (socket) {
      socket.emit('camera:stop', { channelId: this.channelId });
    }

    console.log('[Voice] Camera stopped');
  }

  /**
   * Переключить фронтальную/заднюю камеру (мобильные). Перезахватывает трек
   * с противоположным facingMode и подменяет его во всех соединениях через
   * replaceTrack (без полной ренеготиации). На десктопе просто берёт другую
   * доступную камеру/ту же. Вызывать: window.voiceManager.flipCamera().
   */
  async flipCamera() {
    if (!this.isCameraOn) return false;
    if (this._cameraFlipping) return false;
    this._cameraFlipping = true;

    const prevFacing = this._cameraFacing || 'user';
    this._cameraFacing = (prevFacing === 'environment') ? 'user' : 'environment';

    let newStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15 },
          facingMode: { ideal: this._cameraFacing }
        },
        audio: false
      });
    } catch (e) {
      console.warn('[Voice] flipCamera failed, keeping current camera:', e && e.message);
      this._cameraFacing = prevFacing; // откат
      this._cameraFlipping = false;
      return false;
    }

    const newTrack = newStream.getVideoTracks()[0];
    // replaceTrack не требует renegotiate — подмена прозрачна для пиров.
    for (const [, pc] of this.peerConnections) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        try { await sender.replaceTrack(newTrack); } catch (err) { console.warn('[Voice] flipCamera replaceTrack:', err && err.message); }
      }
    }

    if (this.cameraStream) this.cameraStream.getTracks().forEach(t => t.stop());
    this.cameraStream = newStream;
    newTrack.onended = () => { this.stopCamera(); };

    if (typeof showLocalCameraVideo === 'function') showLocalCameraVideo(this.cameraStream);
    if (typeof _triggerVoiceRerender === 'function') _triggerVoiceRerender();

    this._cameraFlipping = false;
    return true;
  }

  /**
   * Пересогласование WebRTC соединения (при добавлении/удалении треков)
   */
  async renegotiate(socketId) {
    const pc = this.peerConnections.get(socketId);
    if (!pc || pc.signalingState === 'closed') return;

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      // Guard: PC may have been closed while we awaited createOffer
      // (e.g. user switched channels during renegotiation)
      if (pc.signalingState === 'closed') {
        console.warn('[Voice] PC closed during renegotiation, aborting for:', socketId);
        return;
      }

      await pc.setLocalDescription(offer);
      socketSendOffer(socketId, offer, this.channelId);
    } catch (error) {
      if (error.name === 'InvalidStateError') {
        console.warn('[Voice] Renegotiation aborted (PC closed):', socketId);
      } else {
        console.error('Error renegotiating:', error);
      }
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

      const checkSpeaking = () => {
        if (!this.analyser || !this.speakingCheckInterval) return;
        let isSpeaking = false;
        if (!this.isMuted) {
          this.analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          isSpeaking = average > this.speakingThreshold;
        }

        if (isSpeaking !== this.isSpeaking) {
          this.isSpeaking = isSpeaking;
          socketSpeaking(this.channelId, isSpeaking);
          updateSpeakingIndicator(window.currentUser?._id, isSpeaking);
        }
        // Adaptive: check faster when speaking (100ms), slower when silent/muted (300ms)
        const delay = isSpeaking ? 100 : (this.isMuted ? 500 : 300);
        this.speakingCheckInterval = setTimeout(checkSpeaking, delay);
      };

      this.speakingCheckInterval = setTimeout(checkSpeaking, 100);

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
    // Set currentVoiceChannel BEFORE the socket emit happens inside joinChannel,
    // otherwise voice:members_update can arrive before this assignment and the
    // self user will be dropped by updateVoicePanelMembers' channel-id guard.
    if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
      window.NavigationController._commitState({ currentVoiceChannel: channelId }, 'joinVoiceChannel');
    }
    const success = await window.voiceManager.joinChannel(channelId);

    if (success) {
      window.voiceChannelName = channelName;
      showVoicePanel(channelName, serverName);
      if (typeof updateVoiceMiniBar === 'function') setTimeout(updateVoiceMiniBar, 0);
      console.log(`[Voice] Connected to channel "${channelName}"`);
    } else {
      // Roll back so subsequent updates aren't routed to a non-joined channel
      if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
        window.NavigationController._commitState({ currentVoiceChannel: null }, 'joinVoiceChannel-fail');
      }
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
  window.pendingDMCall = null;
  if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
    window.NavigationController._commitState({ currentVoiceChannel: null }, 'leaveVoiceChannel');
  }
  hideVoicePanel();
  window.voiceChannelName = null;
  if (typeof updateVoiceMiniBar === 'function') setTimeout(updateVoiceMiniBar, 0);

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

    // Обновляем визуальный статус
    if (typeof updateUserVoiceState === 'function') {
      updateUserVoiceState(window.currentUser?._id, muted, undefined);
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

    // Обновляем визуальный статус
    if (typeof updateUserVoiceState === 'function') {
      updateUserVoiceState(window.currentUser?._id, deafened ? true : undefined, deafened);
    }
  }
}

/**
 * Переключить демонстрацию экрана
 */
async function toggleScreenShare() {
  if (!window.voiceManager) {
    console.warn('[Voice] Not connected to a voice channel');
    return;
  }

  // Если уже идет демонстрация, останавливаем
  if (window.voiceManager.isScreenSharing) {
    window.voiceManager.stopScreenShare();
    const btn = document.getElementById('voice-screen-btn');
    if (btn) {
      btn.classList.remove('active');
      btn.title = 'Демонстрация экрана';
    }
    return;
  }

  // Показываем новую модалку
  if (typeof window.openScreenshareModal === 'function') {
    await window.openScreenshareModal();
  } else if (typeof openScreenshareModal === 'function') {
    await openScreenshareModal();
  } else {
    console.warn('[Voice] openScreenshareModal function not found');
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
  const container = document.getElementById('screen-share-container'); // Container above chat
  const gridContainer = document.getElementById('voice-view-grid'); // Fullscreen grid container

  // Find member in voiceManager.channelMembers to map socketId to userId
  let targetUserId = sourceId === 'local' ? window.currentUser?._id : sourceId;
  let memberInfo = null;
  if (window.voiceManager && window.voiceManager.channelMembers) {
    memberInfo = sourceId === 'local'
      ? window.voiceManager.channelMembers.find(m => m.userId === window.currentUser?._id)
      : window.voiceManager.channelMembers.find(m => m.socketId === sourceId);
    if (memberInfo) {
      targetUserId = memberInfo.userId;
    }
  }

  const nameTag = memberInfo ? (memberInfo.nickname || memberInfo.username) : (sourceId === 'local' ? 'Вы' : 'Пользователь');

  // 1. Render in the fullscreen grid (voice-view-grid) — ТОЛЬКО если он реально
  //    виден. В новом дизайне это легаси-контейнер (display:none): создавать в нём
  //    <video> = лишний декодер того же потока (один из источников лагов).
  if (gridContainer && gridContainer.offsetParent !== null) {
    const cardId = 'voice-screen-card-' + targetUserId;
    let card = document.getElementById(cardId);
    let video = document.getElementById('screen-share-video-' + sourceId);

    if (!card) {
      card = document.createElement('div');
      card.id = cardId;
      card.className = 'voice-card screen-share-card';
      card.setAttribute('data-socket-id', sourceId);
      card.innerHTML = `
        <div class="voice-card-name-tag">📺 Экран: ${nameTag}</div>
        <button class="fullscreen-btn" title="На весь экран" onclick="toggleTheaterMode(this)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        </button>
      `;
      gridContainer.appendChild(card);
    } else {
      card.setAttribute('data-socket-id', sourceId);
      const tag = card.querySelector('.voice-card-name-tag');
      if (tag) tag.textContent = `📺 Экран: ${nameTag}`;
    }

    if (!video) {
      video = document.createElement('video');
      video.id = 'screen-share-video-' + sourceId;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.className = 'voice-card-video screen-share-video';
      if (sourceId === 'local') {
        video.muted = true;
      }
      card.appendChild(video);
    }
    
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      // Debounced play: wait for loadedmetadata to avoid play() interruption race
      video.onloadedmetadata = () => {
        try {
          video.play().catch(e => {
            if (e.name !== 'AbortError') console.error('[ScreenShare] Grid video play failed:', e);
          });
        } catch (e) {
          console.warn('[ScreenShare] Grid video play() sync error:', e);
        }
      };
    }
  }

  // 2. Render in the chat screen share container (screen-share-container) —
  //    тоже только если виден (иначе ещё один лишний декодер в скрытом контейнере).
  if (container && container.offsetParent !== null) {
    const chatCardId = 'chat-screen-card-' + targetUserId;
    let chatCard = document.getElementById(chatCardId);
    let chatVideo = document.getElementById('chat-screen-share-video-' + sourceId);
    const videoWrap = container.querySelector('.screen-share-videos');

    if (videoWrap) {
      if (!chatCard) {
        chatCard = document.createElement('div');
        chatCard.id = chatCardId;
        chatCard.className = 'voice-card screen-share-card';
        chatCard.setAttribute('data-socket-id', sourceId);
        chatCard.innerHTML = `
          <div class="voice-card-name-tag">📺 Экран: ${nameTag}</div>
          <button class="fullscreen-btn" title="На весь экран" onclick="toggleTheaterMode(this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        `;
        videoWrap.appendChild(chatCard);
      } else {
        chatCard.setAttribute('data-socket-id', sourceId);
        const tag = chatCard.querySelector('.voice-card-name-tag');
        if (tag) tag.textContent = `📺 Экран: ${nameTag}`;
      }

      if (!chatVideo) {
        chatVideo = document.createElement('video');
        chatVideo.id = 'chat-screen-share-video-' + sourceId;
        chatVideo.autoplay = true;
        chatVideo.playsInline = true;
        chatVideo.setAttribute('playsinline', 'true');
        chatVideo.className = 'voice-card-video screen-share-video';
        if (sourceId === 'local') {
          chatVideo.muted = true;
        }
        chatCard.appendChild(chatVideo);
      }

      if (chatVideo.srcObject !== stream) {
        chatVideo.srcObject = stream;
        chatVideo.onloadedmetadata = () => {
          try {
            chatVideo.play().catch(e => {
              if (e.name !== 'AbortError') console.error('[ScreenShare] Chat video play failed:', e);
            });
          } catch (e) {
            console.warn('[ScreenShare] Chat video play() sync error:', e);
          }
        };
      }
    }
    container.classList.remove('hidden');
  }

  // Room screen-share UI is rendered by voice-constellation.js into the
  // new room voice structure. Do not create legacy room cards here.

  // Живое видео демонстрации в новом дизайне рисует констелляция
  // (renderVoiceChannel читает remoteVideoStreams). Триггерим её, чтобы
  // удалённый экран появился без ожидания следующего members_update.
  if (typeof _triggerVoiceRerender === 'function') _triggerVoiceRerender();
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
  const chatVideo = document.getElementById('chat-screen-share-video-' + socketId);
  if (chatVideo) {
    chatVideo.srcObject = null;
    const card = chatVideo.parentElement;
    if (card && card.classList.contains('screen-share-card')) {
      card.remove();
    }
    chatVideo.remove();
  }
  const roomVideo = document.getElementById('room-screen-share-video-' + socketId);
  if (roomVideo) {
    roomVideo.srcObject = null;
    const card = roomVideo.parentElement;
    if (card && card.classList.contains('screen-share-card')) {
      card.remove();
    }
    roomVideo.remove();
  }
  const container = document.getElementById('screen-share-container');
  if (container) {
    const remaining = container.querySelectorAll('.screen-share-video');
    if (remaining.length === 0) {
      container.classList.add('hidden');
    }
  }
}

// ── Хуки камеры ────────────────────────────────────────────────
// Рендер живого видео живёт внутри renderVoiceChannel (единый источник истины),
// поэтому эти функции лишь триггерят перерисовку констелляции.
function _triggerVoiceRerender() {
  if (typeof queueRenderVoiceChannel === 'function') {
    queueRenderVoiceChannel();
  } else if (typeof renderVoiceChannel === 'function') {
    renderVoiceChannel();
  }
}

function showLocalCameraVideo(stream) {
  _triggerVoiceRerender();
}

function hideLocalCameraVideo() {
  _triggerVoiceRerender();
}

function showRemoteCameraVideo(stream, socketId) {
  _triggerVoiceRerender();
}

function hideRemoteCameraVideo(socketId) {
  _triggerVoiceRerender();
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

  // Обновляем карточку в Rooms voice panel (data-speaking атрибут).
  // Сервер не шлёт voice:user_speaking автору (socket.to исключает sender),
  // поэтому self-индикатор для room cards обновляем локально здесь.
  const roomCardEl = document.querySelector(`.room-voice-card[data-user-id="${userId}"]`);
  if (roomCardEl) {
    roomCardEl.dataset.speaking = String(!!speaking);
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
  if (window.voiceManager && window.voiceManager.channelId === channelId) {
    window.voiceManager.channelMembers = members;
  }
  // Sidebar-блок есть не всегда (только когда соответствующий канал виден в списке).
  // Его отсутствие НЕ должно блокировать апдейт voice-panel и voice-view-grid.
  const membersContainer = document.querySelector(`.voice-channel-members[data-channel-id="${channelId}"]`);
  if (membersContainer) {
    membersContainer.innerHTML = members.map(member => `
      <div class="voice-member-item" data-user-id="${member.userId}" data-muted="${!!member.muted}" data-deafened="${!!member.deafened}">
        <img class="voice-member-avatar" src="${getAvatarUrl(member.avatar, member.nickname || member.username, member.userId)}" alt="${member.nickname || member.username}">
        <span class="voice-member-name">${member.nickname || member.username}${member.role === 'owner' ? ' <span title="Создатель" style="font-size:1.1em">👑</span>' : ''}</span>
        <span class="voice-member-status" style="display: inline-flex; gap: 4px; margin-left: auto; align-items: center;">
          ${member.muted ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>` : ''}
          ${member.deafened ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : ''}
        </span>
      </div>
    `).join('');
  }

  // Voice-panel и full-screen Voice View обновляются ВСЕГДА (если открыты для этого канала)
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
      <div class="voice-panel-member ${member.userId === window.currentUser?._id ? 'self' : ''}" data-user-id="${member.userId}" data-muted="${!!member.muted}" data-deafened="${!!member.deafened}">
        <img class="voice-panel-member-avatar" src="${getAvatarUrl(member.avatar, member.nickname || member.username, member.userId)}" alt="${member.nickname || member.username}">
        <span class="voice-panel-member-name">${member.nickname || member.username}</span>
        <span class="voice-panel-member-status" style="display: inline-flex; gap: 4px; margin-left: auto; align-items: center;">
          ${member.muted ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>` : ''}
          ${member.deafened ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : ''}
        </span>
      </div>
    `).join('');
  }

  // Обновляем полноэкранный Grid (Voice View)
  const gridContainer = document.getElementById('voice-view-grid');
  if (gridContainer) {
    // 1. Находим и отсоединяем все активные карточки трансляции экрана, чтобы сохранить видео-элементы
    const activeScreenCards = Array.from(gridContainer.querySelectorAll('.screen-share-card'));
    activeScreenCards.forEach(card => card.remove());

    gridContainer.innerHTML = members.map(member => `
      <div class="voice-card" id="voice-card-${member.userId}" data-user-id="${member.userId}" data-muted="${!!member.muted}" data-deafened="${!!member.deafened}">
        <!-- Если у юзера есть видео (демонстрация экрана), оно будет вставлено сюда поверх аватарки -->
        <img class="voice-card-avatar" src="${getAvatarUrl(member.avatar, member.nickname || member.username, member.userId)}" alt="${member.nickname || member.username}">
        <div class="voice-card-name-tag" style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 4px 8px;">
          <span class="voice-card-nickname" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">
            ${member.nickname || member.username}
          </span>
          <div class="voice-card-status-icons" style="display: flex; gap: 4px; align-items: center; justify-content: flex-start;">
            ${member.muted ? `<svg class="status-icon status-mute" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>` : ''}
            ${member.deafened ? `<svg class="status-icon status-deafen" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : ''}
          </div>
        </div>
      </div>
    `).join('');
    
    // 2. Восстанавливаем карточки трансляции экрана и обновляем их
    activeScreenCards.forEach(card => {
      const v = card.querySelector('.screen-share-video');
      if (v) {
        const sourceId = v.id.replace('screen-share-video-', '');
        
        // Находим информацию об участнике по socketId или userId
        const memberInfo = sourceId === 'local'
          ? members.find(m => m.userId === window.currentUser?._id)
          : members.find(m => m.socketId === sourceId);
        
        const targetUserId = memberInfo ? memberInfo.userId : (sourceId === 'local' ? window.currentUser?._id : sourceId);
        const nameTag = memberInfo ? (memberInfo.nickname || memberInfo.username) : 'Пользователь';

        // Обновляем ID карточки и имя пользователя (на случай если оно изменилось или загрузилось)
        card.id = 'voice-screen-card-' + targetUserId;
        card.setAttribute('data-socket-id', sourceId);
        const nameTagEl = card.querySelector('.voice-card-name-tag');
        if (nameTagEl) {
          nameTagEl.textContent = `📺 Экран: ${nameTag}`;
        }
        
        if (v.parentElement !== card) {
          card.appendChild(v);
        }
        
        gridContainer.appendChild(card);
        
        // Перезапускаем воспроизведение после перемещения в DOM (guarded)
        try {
          if (v.readyState >= 2) {
            v.play().catch(e => {
              if (e.name !== 'AbortError') console.error('[ScreenShare] play failed on re-append:', e);
            });
          } else {
            v.onloadedmetadata = () => {
              try {
                v.play().catch(e => {
                  if (e.name !== 'AbortError') console.error('[ScreenShare] play failed on re-append:', e);
                });
              } catch (e) {
                console.warn('[ScreenShare] play() sync error on re-append:', e);
              }
            };
          }
        } catch (e) {
          console.warn('[ScreenShare] play() sync error on re-append:', e);
        }
      }
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
function updateUserVoiceState(userId, muted, deafened) {
  // 1. Update main voice view grid card
  const voiceCardEl = document.getElementById(`voice-card-${userId}`);
  if (voiceCardEl) {
    if (muted !== undefined) voiceCardEl.dataset.muted = String(!!muted);
    if (deafened !== undefined) voiceCardEl.dataset.deafened = String(!!deafened);
    
    const isMuted = voiceCardEl.dataset.muted === 'true';
    const isDeafened = voiceCardEl.dataset.deafened === 'true';
    
    const iconsContainer = voiceCardEl.querySelector('.voice-card-status-icons');
    if (iconsContainer) {
      iconsContainer.innerHTML = `
        ${isMuted ? `<svg class="status-icon status-mute" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>` : ''}
        ${isDeafened ? `<svg class="status-icon status-deafen" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : ''}
      `;
    }
  }
  
  // 2. Update floating voice panel member list
  const panelMemberEl = document.querySelector(`.voice-panel-member[data-user-id="${userId}"]`);
  if (panelMemberEl) {
    if (muted !== undefined) panelMemberEl.dataset.muted = String(!!muted);
    if (deafened !== undefined) panelMemberEl.dataset.deafened = String(!!deafened);
    
    const isMuted = panelMemberEl.dataset.muted === 'true';
    const isDeafened = panelMemberEl.dataset.deafened === 'true';
    
    let statusSpan = panelMemberEl.querySelector('.voice-panel-member-status');
    if (!statusSpan) {
      statusSpan = document.createElement('span');
      statusSpan.className = 'voice-panel-member-status';
      statusSpan.style.cssText = 'display: inline-flex; gap: 4px; margin-left: auto; align-items: center;';
      panelMemberEl.appendChild(statusSpan);
    }
    
    const legacyMuteText = panelMemberEl.querySelector('.voice-panel-member-muted');
    if (legacyMuteText) legacyMuteText.remove();
    
    statusSpan.innerHTML = `
      ${isMuted ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>` : ''}
      ${isDeafened ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : ''}
    `;
  }
  
  // 3. Update sidebar voice list
  const voiceMemberEl = document.querySelector(`.voice-member-item[data-user-id="${userId}"]`);
  if (voiceMemberEl) {
    if (muted !== undefined) voiceMemberEl.dataset.muted = String(!!muted);
    if (deafened !== undefined) voiceMemberEl.dataset.deafened = String(!!deafened);
    
    const isMuted = voiceMemberEl.dataset.muted === 'true';
    const isDeafened = voiceMemberEl.dataset.deafened === 'true';
    
    let statusContainer = voiceMemberEl.querySelector('.voice-member-status');
    if (!statusContainer) {
      statusContainer = document.createElement('span');
      statusContainer.className = 'voice-member-status';
      statusContainer.style.cssText = 'display: inline-flex; gap: 4px; margin-left: auto; align-items: center;';
      
      const legacySvgs = voiceMemberEl.querySelectorAll('svg');
      legacySvgs.forEach(s => s.remove());
      
      voiceMemberEl.appendChild(statusContainer);
    }
    
    statusContainer.innerHTML = `
      ${isMuted ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>` : ''}
      ${isDeafened ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : ''}
    `;
  }
  
  // 4. Update Rooms UI card if active
  if (window.RoomsUI && typeof window.RoomsUI.updateRoomCardVoiceState === 'function') {
    window.RoomsUI.updateRoomCardVoiceState(userId, muted, deafened);
  }
}
window.updateUserVoiceState = updateUserVoiceState;

// ==================== DM VOICE CALLS LOGIC ====================

// Звуковое сопровождение интегрировано через SoundManager

function showIncomingDMCallOverlay(call) {
  window.pendingDMCall = call;
  window.currentCallPartnerId = call?.from?._id;
  if (window.SoundManager) {
    window.SoundManager.play('call_incoming');
  }
  const overlay = document.getElementById('incoming-call-overlay');
  if (!overlay || !call?.from) return;
  const avatar = document.getElementById('incoming-call-avatar');
  const name = document.getElementById('incoming-call-name');
  const displayName = call.from.nickname || call.from.username || 'Входящий звонок';
  window.pendingDMCall = call;
  if (avatar) {
    if (avatar.tagName === 'IMG') {
      avatar.src = getAvatarUrl(call.from.avatar, displayName, call.from._id);
    } else if (call.from.avatar) {
      // div-аватар: показываем фото фоном
      avatar.style.backgroundImage = `url("${call.from.avatar}")`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
      avatar.textContent = '';
    } else {
      // буква-заглушка
      avatar.style.backgroundImage = '';
      avatar.textContent = (displayName.charAt(0) || '?').toUpperCase();
    }
  }
  if (name) name.textContent = displayName;
  overlay.classList.remove('hidden');
}

function hideIncomingDMCallOverlay() {
  if (window.electronAPI && typeof window.electronAPI.closeIncomingCall === 'function') {
    window.electronAPI.closeIncomingCall();
  }
  const overlay = document.getElementById('incoming-call-overlay');
  if (overlay) overlay.classList.add('hidden');
  if (window.SoundManager) window.SoundManager.stop('call_incoming');
}

async function acceptIncomingDMCall() {
  const call = window.pendingDMCall;
  if (!call?.from?._id) return;
  hideIncomingDMCallOverlay();
  socketSendCallResponse(call.from._id, true, {
    conversationId: call.conversationId,
    channelId: call.channelId
  });
  await startWebRTCCall(call.from._id, {
    conversationId: call.conversationId,
    channelId: call.channelId
  });
}

function declineIncomingDMCall() {
  const call = window.pendingDMCall;
  hideIncomingDMCallOverlay();
  if (call?.from?._id) {
    socketSendCallResponse(call.from._id, false, {
      conversationId: call.conversationId,
      channelId: call.channelId
    });
  }
  window.pendingDMCall = null;
}

window.showIncomingDMCallOverlay = showIncomingDMCallOverlay;
window.hideIncomingDMCallOverlay = hideIncomingDMCallOverlay;
window.acceptIncomingDMCall = acceptIncomingDMCall;
window.declineIncomingDMCall = declineIncomingDMCall;

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
  if (window.SoundManager) window.SoundManager.play('call_outgoing');
  
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

  myImg.src = getAvatarUrl(window.currentUser?.avatar, window.currentUser?.username, window.currentUser?._id);
  peerImg.src = getAvatarUrl(peer.avatar, peer.username || peer.nickname, peer._id || peer.id);
  peerName.textContent = peer.nickname || peer.username;
  status.textContent = 'ОЖИДАНИЕ ОТВЕТА...';
  
  peerContainer.classList.add('peer-ringing');
  overlay.classList.remove('hidden');
}

/**
 * Обработка ответа на наш звонок
 */
async function handleDMCallResponse(accepted, responderId, meta = {}) {
  // Старый оверлей звонка (может отсутствовать в новом дизайне) — все обращения
  // защищены проверками на null, чтобы НЕ сорвать запуск WebRTC.
  const overlay = document.getElementById('dm-call-overlay');
  const status = document.getElementById('call-overlay-status');
  const peerContainer = document.getElementById('caller-mini-peer');

  // Всегда останавливаем гудок
  if (window.SoundManager) {
    window.SoundManager.stop('call_outgoing');
    window.SoundManager.stop('call_incoming');
  }

  if (!accepted) {
    if (typeof window.onDirectCallEnded === 'function') {
      window.onDirectCallEnded('rejected');
    }
    if (status) status.textContent = 'ВЫЗОВ ОТКЛОНЕН';
    if (peerContainer) {
      peerContainer.classList.remove('peer-ringing');
      const ripple = document.getElementById('dm-bulk-ripple');
      if (ripple) ripple.classList.add('bulk-animate');
      peerContainer.classList.add('shrinking');
      if (window.SoundManager) window.SoundManager.play('user_leave');
      setTimeout(() => {
        if (overlay) overlay.classList.add('hidden');
        peerContainer.classList.remove('shrinking');
        if (ripple) ripple.classList.remove('bulk-animate');
      }, 1000);
    }
    return;
  }

  // Принято! Сначала уведомляем UI, затем запускаем WebRTC.
  if (typeof window.onDirectCallAccepted === 'function') {
    window.onDirectCallAccepted(meta);
  }
  if (status) status.textContent = 'В ЭФИРЕ';
  if (peerContainer) peerContainer.classList.remove('peer-ringing');
  if (window.SoundManager) window.SoundManager.play('user_join');

  const callRoomId = `dm_call:${meta.conversationId || window.currentDMConversationId || meta.channelId || responderId}`;
  if (!window.voiceManager) window.voiceManager = new VoiceManager();
  if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
    window.NavigationController._commitState({ currentVoiceChannel: callRoomId }, 'handleDMCallResponse');
  }
  window.voiceManager.channelId = callRoomId;
  await window.voiceManager.joinChannel(callRoomId);
}

window.handleDMCallResponse = handleDMCallResponse;

/**
 * Завершение звонка (очистка)
 */
function handleDMCallEnd() {
  if (typeof window.onDirectCallEnded === 'function') {
    window.onDirectCallEnded('terminated');
  }
  const overlay = document.getElementById('dm-call-overlay');
  if (overlay) overlay.classList.add('hidden');
  
  hideIncomingDMCallOverlay();
  if (typeof window.playCallDisconnectSound === 'function') {
    window.playCallDisconnectSound();
  }

  if (window.voiceManager) {
    window.voiceManager.leaveChannel();
    window.voiceManager = null;
  }
  
  console.log('[Voice] Call ended');
}

window.handleDMCallEnd = handleDMCallEnd;

/**
 * Функция для получателя: войти в WebRTC после нажатия "Принять"
 */
async function startWebRTCCall(callerId, meta = {}) {
  window._callDisconnectSoundPlayed = false;
  // Останавливаем все звуки вызова (если были)
  if (window.SoundManager) {
    window.SoundManager.stop('call_outgoing');
    window.SoundManager.stop('call_incoming');
  }

  const caller = window.pendingDMCall?.from;
  if (caller) {
    // Open the real call modal interface for the receiver!
    if (typeof window.startDirectCall === 'function') {
      const avatarVal = caller.avatar ? caller.avatar.charAt(0).toUpperCase() : (caller.username ? caller.username.charAt(0).toUpperCase() : 'C');
      window.startDirectCall(caller.nickname || caller.username, avatarVal, false, caller._id, true, caller.avatar || '');
    }
  }

  const callRoomId = `dm_call:${meta.conversationId || window.currentDMConversationId || meta.channelId || callerId}`;
  if (!window.voiceManager) window.voiceManager = new VoiceManager();
  if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
    window.NavigationController._commitState({ currentVoiceChannel: callRoomId }, 'startWebRTCCall');
  }
  window.voiceManager.channelId = callRoomId;
  await window.voiceManager.joinChannel(callRoomId);
  if (window.SoundManager) window.SoundManager.play('user_join');
}

window.startWebRTCCall = startWebRTCCall;

// Инициируем звуки при муте/дефене
window.playVoiceSound = function(name) {
  if (!window.SoundManager) return;
  const map = {
    'join': 'user_join',
    'disconnect': 'user_leave',
    'mute': 'voice_mute',
    'unmute': 'voice_unmute',
    'deafen': 'voice_deafen',
    'undeafen': 'voice_undeafen'
  };
  if (map[name]) {
    window.SoundManager.play(map[name]);
  }
};

function showDMCallOverlay(peer) {
  const overlay = document.getElementById('dm-call-overlay');
  const myImg = document.getElementById('caller-mini-my-img');
  const peerImg = document.getElementById('caller-mini-peer-img');
  const peerName = document.getElementById('call-overlay-peer-name');
  const status = document.getElementById('call-overlay-status');
  const peerContainer = document.getElementById('caller-mini-peer');

  if (!overlay) return;

  myImg.src = getAvatarUrl(window.currentUser?.avatar, window.currentUser?.username, window.currentUser?._id);
  peerImg.src = getAvatarUrl(peer.avatar, peer.username || peer.nickname, peer._id || peer.id);
  peerName.textContent = peer.nickname || peer.username;
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
// Make toggleTheaterMode globally available
window.toggleTheaterMode = function(btn) {
  const card = btn.closest('.screen-share-card');
  if (!card) return;
  
  if (card.classList.contains('theater-mode')) {
    card.classList.remove('theater-mode');
    const placeholder = document.getElementById(card.id + '-placeholder');
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(card, placeholder);
      placeholder.remove();
    }
    const backdrop = document.getElementById('theater-backdrop');
    if (backdrop) backdrop.remove();
  } else {
    card.classList.add('theater-mode');
    
    let placeholder = document.getElementById(card.id + '-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = card.id + '-placeholder';
      placeholder.style.display = 'none';
      card.parentNode.insertBefore(placeholder, card);
    }
    
    document.body.appendChild(card);
    
    let backdrop = document.getElementById('theater-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'theater-backdrop';
      backdrop.style.position = 'fixed';
      backdrop.style.top = '0';
      backdrop.style.left = '0';
      backdrop.style.width = '100vw';
      backdrop.style.height = '100vh';
      backdrop.style.background = 'rgba(0,0,0,0.85)';
      backdrop.style.zIndex = '9999';
      backdrop.style.cursor = 'zoom-out';
      
      backdrop.onclick = () => {
        card.classList.remove('theater-mode');
        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.insertBefore(card, placeholder);
          placeholder.remove();
        }
        backdrop.remove();
      };
      
      document.body.appendChild(backdrop);
    }
  }
};
