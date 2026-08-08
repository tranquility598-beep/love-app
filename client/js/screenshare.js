let selectedSourceId = null;
let _shareOrigin = 'voice-btn-share';

// Сброс UI демонстрации, если захват не начался (отмена/ошибка). Без этого
// интерфейс залипал в режиме «идёт трансляция» с пустым экраном (фикс «моковой демки»).
function _resetShareUI(origin) {
  if (window.voiceState) window.voiceState.shareActive = false;
  const own = (window.voiceMembers || []).find(m => m.isOwn);
  if (own) own.hasShare = false;
  if (origin === 'call-btn-screenshare') {
    const b = document.getElementById('call-btn-screenshare');
    if (b) b.classList.remove('screenshare-active');
  } else {
    const b = document.getElementById('voice-btn-share');
    if (b) {
      b.classList.remove('active-state');
      b.classList.add('muted-state');
      b.title = 'Включить трансляцию экрана';
      const a = b.querySelector('.voice-icon-active'); if (a) a.classList.add('hidden');
      const m = b.querySelector('.voice-icon-muted'); if (m) m.classList.remove('hidden');
    }
    if (typeof syncRoomBtns === 'function') syncRoomBtns();
  }
  if (typeof _triggerVoiceRerender === 'function') _triggerVoiceRerender();
  else if (typeof renderVoiceChannel === 'function') renderVoiceChannel();
}

async function openScreenshareModal(origin) {
  selectedSourceId = null;
  _shareOrigin = origin || 'voice-btn-share';
  const modal = document.getElementById('screenshare-modal');
  const container = document.getElementById('screenshare-sources');
  const startBtn = document.getElementById('screenshare-start');

  // Качество по умолчанию берём из настроек пользователя (дефолт — ultra/1080p30).
  const qualitySelectInit = document.getElementById('screen-quality');
  const savedQ = (window.settingsManager && typeof window.settingsManager.get === 'function')
    ? window.settingsManager.get('default-screen-quality') : null;
  if (qualitySelectInit && savedQ) qualitySelectInit.value = savedQ;
  
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
    document.getElementById('screenshare-cancel').onclick = () => { _resetShareUI(_shareOrigin); closeFn(); };
    return;
  }
  
  container.innerHTML = '';
  sources.forEach((source, idx) => {
    const card = document.createElement('div');
    card.className = 'screenshare-source-card';

    const img = document.createElement('img');
    img.src = source.thumbnail || '';
    // Имя источника: имя из ОС → тип (экран/окно) → индекс. Никогда не пустое
    // и строится заново при каждом перезапуске списка (фикс пропадающих названий).
    const sname = (source.name && String(source.name).trim()) ? String(source.name).trim() : '';
    const displayName = sname
      || (String(source.id || '').startsWith('screen') ? 'Экран' : 'Окно')
      || ('Источник ' + (idx + 1));
    img.alt = displayName;

    const nameEl = document.createElement('div');
    nameEl.className = 'screenshare-source-card-name';
    nameEl.textContent = displayName;
    nameEl.title = displayName;

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

  document.getElementById('screenshare-cancel').onclick = () => { _resetShareUI(_shareOrigin); closeFn(); };

  startBtn.onclick = async () => {
    if (!selectedSourceId) return;
    closeFn();
    const qualitySelect = document.getElementById('screen-quality');
    const quality = qualitySelect ? qualitySelect.value : 'ultra';
    await startScreenShareWithSource(selectedSourceId, quality);
  };
}

async function startScreenShareWithSource(sourceId, quality = 'ultra') {
  const settings = {
    low:    { width: 854,  height: 480,  frameRate: 10 },
    medium: { width: 1280, height: 720,  frameRate: 15 },
    high:   { width: 1920, height: 1080, frameRate: 24 },
    ultra:  { width: 1920, height: 1080, frameRate: 30 }
  }[quality] || { width: 1920, height: 1080, frameRate: 30 };

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
          // Отмена в системном окне (NotAllowed/Abort) — не ошибка: тихо
          // сбрасываем кнопку и НЕ шлём в сеть событие начала стрима.
          const nm = err4 && err4.name;
          if (nm !== 'NotAllowedError' && nm !== 'AbortError') {
            alert('Не удалось запустить демонстрацию экрана: ' + err4.message);
          }
          _resetShareUI(_shareOrigin);
          return;
        }
      }
    }
  }

  const videoTrack = stream ? stream.getVideoTracks()[0] : null;
  if (!videoTrack) {
    console.error('[ScreenShare] No video track found in stream');
    _resetShareUI(_shareOrigin);
    return;
  }
  console.log('[ScreenShare] Video track readyState:', videoTrack.readyState, 'enabled:', videoTrack.enabled);

  if (window.voiceManager) {
    if (window.voiceManager.isCameraOn && typeof window.voiceManager.stopCamera === 'function') {
      await window.voiceManager.stopCamera();
    }
    window.voiceManager.screenStream = stream;
    window.voiceManager.isScreenSharing = true;
    if (typeof socketSetVoiceMediaState === 'function') {
      socketSetVoiceMediaState(window.voiceManager.channelId, 'screen');
    }
    for (const [socketId, pc] of window.voiceManager.peerConnections) {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(videoTrack);
      } else {
        pc.addTrack(videoTrack, stream);
      }
      // Renegotiate WebRTC to let peers know about the new track
      await window.voiceManager.renegotiate(socketId);
    }

    // Show local preview of the screen share
    if (typeof showScreenShareVideo === 'function') {
      showScreenShareVideo(stream, 'local');
    }

    // Синхронизируем новый дизайн: отмечаем демонстрацию активной и перерисовываем
    // констелляцию, чтобы превью показало живой screenStream вместо заглушки.
    if (window.voiceState) window.voiceState.shareActive = true;
    if (typeof _triggerVoiceRerender === 'function') {
      _triggerVoiceRerender();
    } else if (typeof renderVoiceChannel === 'function') {
      renderVoiceChannel();
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
    const roomBtn = document.getElementById('room-voice-btn-share');
    if (roomBtn) {
      roomBtn.classList.add('active-state');
      roomBtn.classList.remove('muted-state');
    }
  }
}
