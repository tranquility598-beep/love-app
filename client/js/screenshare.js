let selectedSourceId = null;

async function openScreenshareModal() {
  selectedSourceId = null;
  const modal = document.getElementById('screenshare-modal');
  const container = document.getElementById('screenshare-sources');
  const startBtn = document.getElementById('screenshare-start');
  
  // Use ModalManager if available to register in the stack
  if (typeof window.openModal === 'function') {
    window.openModal('screenshare-modal');
  } else {
    modal.classList.remove('hidden');
  }
  
  container.innerHTML = '<div class="screenshare-loading">Загрузка...</div>';
  startBtn.disabled = true;

  const closeFn = () => {
    container.innerHTML = ''; // Очищаем превью для освобождения памяти
    if (typeof window.closeModal === 'function') window.closeModal('screenshare-modal');
    else modal.classList.add('hidden');
  };

  let sources = [];
  try {
    if (!window.electronAPI || typeof window.electronAPI.getScreenSources !== 'function') {
      throw new Error('Функция выбора экранов недоступна. Пожалуйста, ПЕРЕЗАПУСТИТЕ приложение, чтобы изменения вступили в силу.');
    }
    sources = await window.electronAPI.getScreenSources();
  } catch (error) {
    container.innerHTML = `<div class="screenshare-loading" style="color: var(--status-danger); padding: 40px; text-align: center;">${error.message || 'Ошибка загрузки'}</div>`;
    
    // Bind cancel button even on error
    document.getElementById('screenshare-cancel').onclick = closeFn;
    return;
  }
  
  container.innerHTML = '';
  sources.forEach(source => {
    const card = document.createElement('div');
    card.className = 'screenshare-source-card';
    
    const img = document.createElement('img');
    img.src = source.thumbnail;
    const displayName = source.name && source.name.trim() ? source.name : (source.id.startsWith('screen') ? 'Экран' : 'Окно');
    img.alt = displayName;
    
    const nameEl = document.createElement('div');
    nameEl.className = 'screenshare-source-card-name';
    nameEl.textContent = displayName;
    
    card.appendChild(img);
    card.appendChild(nameEl);

    card.addEventListener('click', () => {
      document.querySelectorAll('.screenshare-source-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedSourceId = source.id;
      startBtn.disabled = false;
    });
    container.appendChild(card);
  });

  document.getElementById('screenshare-cancel').onclick = closeFn;

  startBtn.onclick = async () => {
    if (!selectedSourceId) return;
    closeFn();
    const qualitySelect = document.getElementById('screen-quality');
    const quality = qualitySelect ? qualitySelect.value : 'medium';
    await startScreenShareWithSource(selectedSourceId, quality);
  };
}

async function startScreenShareWithSource(sourceId, quality = 'medium') {
  const settings = {
    low:    { width: 854,  height: 480,  frameRate: 10 },
    medium: { width: 1280, height: 720,  frameRate: 15 },
    high:   { width: 1920, height: 1080, frameRate: 24 },
    ultra:  { width: 1920, height: 1080, frameRate: 30 }
  }[quality] || { width: 1280, height: 720, frameRate: 15 };

  let stream;
  try {
    console.log('[ScreenShare] Attempting getUserMedia with mandatory constraints');
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1,
          minHeight: 1,
          maxWidth: 4000,
          maxHeight: 4000
        }
      }
    });
    console.log('[ScreenShare] Attempt 1 succeeded');
  } catch (err1) {
    console.warn('[ScreenShare] Attempt 1 failed:', err1);
    
    // Attempt 2: Without minWidth/minHeight in mandatory
    try {
      console.log('[ScreenShare] Attempting getUserMedia with minimal mandatory constraints');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
      });
      console.log('[ScreenShare] Attempt 2 succeeded');
    } catch (err2) {
      console.warn('[ScreenShare] Attempt 2 failed:', err2);
      
      // Attempt 3: Modern standard constraints style (no mandatory wrapper)
      try {
        console.log('[ScreenShare] Attempting getUserMedia with standard constraints structure');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            width: { ideal: settings.width },
            height: { ideal: settings.height },
            frameRate: { ideal: settings.frameRate }
          }
        });
        console.log('[ScreenShare] Attempt 3 succeeded');
      } catch (err3) {
        console.warn('[ScreenShare] Attempt 3 failed:', err3);
        
        // Attempt 4: Fallback to getDisplayMedia if all getUserMedia attempts fail
        try {
          console.log('[ScreenShare] Attempting native getDisplayMedia fallback');
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: settings.width },
              height: { ideal: settings.height },
              frameRate: { ideal: settings.frameRate }
            },
            audio: false
          });
          console.log('[ScreenShare] Attempt 4 succeeded');
        } catch (err4) {
          console.error('[ScreenShare] All screen capture attempts failed:', err4);
          alert('Не удалось запустить демонстрацию экрана: ' + err4.message);
          return;
        }
      }
    }
  }

  const videoTrack = stream ? stream.getVideoTracks()[0] : null;
  if (!videoTrack) {
    console.error('[ScreenShare] No video track found in stream');
    return;
  }
  console.log('[ScreenShare] Video track readyState:', videoTrack.readyState, 'enabled:', videoTrack.enabled);

  if (window.voiceManager) {
    window.voiceManager.screenStream = stream;
    window.voiceManager.isScreenSharing = true;
    window.voiceManager.peerConnections.forEach(async (pc, socketId) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(videoTrack);
      } else {
        pc.addTrack(videoTrack, stream);
      }
      // Renegotiate WebRTC to let peers know about the new track
      window.voiceManager.renegotiate(socketId);
    });

    // Show local preview of the screen share
    if (typeof showScreenShareVideo === 'function') {
      showScreenShareVideo(stream, 'local');
    }

    // Notify signalling server
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('screen:start', { channelId: window.voiceManager.channelId });
    }

    videoTrack.onended = () => {
      console.warn('[ScreenShare] videoTrack.onended fired in screenshare.js! readyState:', videoTrack.readyState);
      window.voiceManager.stopScreenShare();
    };
    
    // Update UI buttons
    const btn = document.getElementById('voice-screen-btn');
    if (btn) {
      btn.classList.add('active');
      btn.title = 'Остановить демонстрацию';
    }
    const viewBtn = document.getElementById('voice-view-screen-btn');
    if (viewBtn) {
      viewBtn.classList.add('active');
      viewBtn.title = 'Остановить демонстрацию';
    }
    const roomBtn = document.getElementById('room-voice-screen-btn');
    if (roomBtn) {
      roomBtn.setAttribute('data-active', 'true');
    }
  }
}
