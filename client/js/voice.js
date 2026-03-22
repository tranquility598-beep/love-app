/**
 * Voice модуль - WebRTC голосовой чат
 * Управляет peer-to-peer аудио соединениями
 */

class VoiceManager {
  constructor() {
    this.localStream = null;
    this.peerConnections = new Map(); // socketId -> RTCPeerConnection
    this.audioElements = new Map(); // socketId -> HTMLAudioElement
    this.channelId = null;
    this.isMuted = false;
    this.isDeafened = false;
    this.isSpeaking = false;
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
  }

  /**
   * Очистка ресурсов
   */
  cleanup() {
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

      // Создаем offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
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
      console.log('🔊 Received remote audio track from:', socketId);
      this.playRemoteAudio(socketId, event.streams[0]);
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

    socketToggleDeafen(this.channelId, this.isDeafened);
    return this.isDeafened;
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

/**
 * Присоединиться к голосовому каналу
 */
async function joinVoiceChannel(channelId, channelName, serverName) {
  // Если уже в голосовом канале - выходим
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
}

/**
 * Переключить микрофон в голосовом канале
 */
function toggleVoiceMute() {
  if (window.voiceManager) {
    const muted = window.voiceManager.toggleMute();
    const btn = document.getElementById('voice-mute-btn');
    if (btn) {
      btn.classList.toggle('muted', muted);
      btn.title = muted ? 'Включить микрофон' : 'Выключить микрофон';
    }
    // Также обновляем кнопку в панели пользователя
    updateMicButton(muted);
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
  }
}

/**
 * Показать панель голосового чата
 */
function showVoicePanel(channelName, serverName) {
  const panel = document.getElementById('voice-panel');
  const nameEl = document.getElementById('voice-channel-name');
  const serverEl = document.getElementById('voice-server-name');

  if (panel) panel.classList.remove('hidden');
  if (nameEl) nameEl.textContent = channelName;
  if (serverEl) serverEl.textContent = serverName || '';
}

/**
 * Скрыть панель голосового чата
 */
function hideVoicePanel() {
  const panel = document.getElementById('voice-panel');
  if (panel) panel.classList.add('hidden');
}

/**
 * Обновить индикатор говорящего
 */
function updateSpeakingIndicator(userId, speaking) {
  // Обновляем в списке участников
  const memberEl = document.querySelector(`[data-user-id="${userId}"]`);
  if (memberEl) {
    const indicator = memberEl.querySelector('.member-speaking-indicator');
    if (indicator) {
      indicator.style.display = speaking ? 'block' : 'none';
    }
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
      <span class="voice-member-name">${member.username}</span>
      ${member.muted ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ed4245"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>' : ''}
    </div>
  `).join('');
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
