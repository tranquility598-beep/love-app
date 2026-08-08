import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client.js';

function defaultIceServers() {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  if (import.meta.env.VITE_STAFF_TURN_URL) {
    servers.push({
      urls: import.meta.env.VITE_STAFF_TURN_URL,
      username: import.meta.env.VITE_STAFF_TURN_USERNAME || '',
      credential: import.meta.env.VITE_STAFF_TURN_CREDENTIAL || ''
    });
  }
  return servers;
}

function emitAck(socket, event, payload = {}, timeoutMs = 5000) {
  return new Promise(resolve => {
    let settled = false;
    const finish = response => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(response || { status: 'error' });
    };
    const timer = window.setTimeout(() => finish({ status: 'error', code: 'ACK_TIMEOUT' }), timeoutMs);
    socket.emit(event, payload, finish);
  });
}

function tuneAudioSender(sender) {
  try {
    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings = parameters.encodings.map(encoding => ({
      ...encoding,
      maxBitrate: 64000,
      priority: 'high',
      networkPriority: 'high'
    }));
    sender.setParameters(parameters).catch(() => {});
  } catch {
    // Some embedded Chromium versions expose setParameters only partially.
  }
}

function preferOpus(peer) {
  try {
    const codecs = RTCRtpSender.getCapabilities?.('audio')?.codecs || [];
    const opus = codecs.filter(codec => codec.mimeType?.toLowerCase() === 'audio/opus');
    if (!opus.length) return;
    const rest = codecs.filter(codec => codec.mimeType?.toLowerCase() !== 'audio/opus');
    peer.getTransceivers().find(item => item.sender?.track?.kind === 'audio')?.setCodecPreferences?.([...opus, ...rest]);
  } catch {
    // Codec ordering is an optimization and must not prevent joining voice.
  }
}

export function useStaffVoice(socket) {
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState('');
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [error, setError] = useState('');
  const [roomsError, setRoomsError] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [peerStates, setPeerStates] = useState({});
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const audioRef = useRef(new Map());
  const candidatesRef = useRef(new Map());
  const roomRef = useRef('');
  const deafenedRef = useRef(false);
  const joinRef = useRef(null);
  const iceServersRef = useRef(defaultIceServers());

  const refreshIceServers = useCallback(async () => {
    try {
      const { data } = await api.get('/staff/voice/ice-config');
      if (Array.isArray(data.iceServers) && data.iceServers.length) {
        iceServersRef.current = data.iceServers;
      }
    } catch {
      iceServersRef.current = defaultIceServers();
    }
    return iceServersRef.current;
  }, []);

  const closePeer = useCallback(socketId => {
    const peer = peersRef.current.get(socketId);
    if (peer) {
      window.clearTimeout(peer.staffDisconnectTimer);
      peer.close();
    }
    peersRef.current.delete(socketId);
    const audio = audioRef.current.get(socketId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    }
    audioRef.current.delete(socketId);
    candidatesRef.current.delete(socketId);
    setPeerStates(current => {
      if (!(socketId in current)) return current;
      const next = { ...current };
      delete next[socketId];
      return next;
    });
  }, []);

  const closeMedia = useCallback(() => {
    for (const socketId of peersRef.current.keys()) closePeer(socketId);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, [closePeer]);

  const ensurePeer = useCallback(remoteSocketId => {
    if (peersRef.current.has(remoteSocketId)) return peersRef.current.get(remoteSocketId);
    const peer = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });
    setPeerStates(current => ({ ...current, [remoteSocketId]: 'new' }));
    streamRef.current?.getAudioTracks().forEach(track => tuneAudioSender(peer.addTrack(track, streamRef.current)));
    preferOpus(peer);
    peer.onicecandidate = event => {
      if (event.candidate && socket && roomRef.current) {
        socket.emit('staff:voice:ice', { roomId: roomRef.current, targetSocketId: remoteSocketId, data: event.candidate.toJSON() });
      }
    };
    peer.ontrack = event => {
      try {
        if ('jitterBufferTarget' in event.receiver) event.receiver.jitterBufferTarget = 0.2;
        if ('playoutDelayHint' in event.receiver) event.receiver.playoutDelayHint = 0.15;
      } catch {
        // Receiver buffering hints are not available in every Chromium build.
      }
      let audio = audioRef.current.get(remoteSocketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audio.playsInline = true;
        audio.preload = 'auto';
        audio.className = 'staff-voice-audio';
        audio.setAttribute('aria-hidden', 'true');
        document.body.append(audio);
        audioRef.current.set(remoteSocketId, audio);
      }
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      audio.muted = deafenedRef.current;
      audio.play()
        .then(() => setPlaybackBlocked(false))
        .catch(() => setPlaybackBlocked(true));
    };
    peer.onconnectionstatechange = () => {
      setPeerStates(current => ({ ...current, [remoteSocketId]: peer.connectionState }));
      if (peer.connectionState === 'failed') setError('VOICE_CONNECTION_FAILED');
      if (peer.connectionState === 'closed') closePeer(remoteSocketId);
    };
    peer.oniceconnectionstatechange = () => {
      if (['connected', 'completed'].includes(peer.iceConnectionState)) {
        window.clearTimeout(peer.staffDisconnectTimer);
        setError(current => current === 'VOICE_CONNECTION_UNSTABLE' ? '' : current);
      } else if (peer.iceConnectionState === 'disconnected') {
        window.clearTimeout(peer.staffDisconnectTimer);
        peer.staffDisconnectTimer = window.setTimeout(() => {
          if (peer.iceConnectionState === 'disconnected') setError('VOICE_CONNECTION_UNSTABLE');
        }, 3000);
      } else if (peer.iceConnectionState === 'failed') {
        setError('VOICE_CONNECTION_FAILED');
      }
    };
    peersRef.current.set(remoteSocketId, peer);
    return peer;
  }, [closePeer, socket]);

  const flushCandidates = useCallback(async remoteSocketId => {
    const peer = peersRef.current.get(remoteSocketId);
    if (!peer?.remoteDescription) return;
    const queued = candidatesRef.current.get(remoteSocketId) || [];
    candidatesRef.current.delete(remoteSocketId);
    for (const candidate of queued) {
      try { await peer.addIceCandidate(candidate); } catch {
        // A peer may close while queued ICE candidates are being flushed.
      }
    }
  }, []);

  const createOffer = useCallback(async remoteSocketId => {
    const peer = ensurePeer(remoteSocketId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket?.emit('staff:voice:offer', { roomId: roomRef.current, targetSocketId: remoteSocketId, data: offer });
  }, [ensurePeer, socket]);

  const refreshRooms = useCallback(async () => {
    if (socket?.connected) {
      const response = await emitAck(socket, 'staff:voice:list');
      if (response.status === 'ok') {
        setRooms(response.rooms || []);
        setRoomsError('');
        return;
      }
    }
    try {
      const { data } = await api.get('/staff/voice/rooms');
      setRooms(data.rooms || []);
      setRoomsError('');
    } catch (requestError) {
      setRoomsError(errorMessage(requestError, 'Не удалось загрузить голосовые комнаты'));
    }
  }, [socket]);

  const leaveRoom = useCallback(async () => {
    if (socket?.connected && roomRef.current) await emitAck(socket, 'staff:voice:leave');
    roomRef.current = '';
    setCurrentRoom('');
    setMuted(false);
    setDeafened(false);
    deafenedRef.current = false;
    closeMedia();
    refreshRooms();
  }, [closeMedia, refreshRooms, socket]);

  const joinRoom = useCallback(async roomId => {
    if (!socket?.connected || !roomId) return false;
    setError('');
    try {
      await refreshIceServers();
      const stream = streamRef.current || await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      streamRef.current = stream;
      if (roomRef.current) {
        await emitAck(socket, 'staff:voice:leave');
      }
      for (const socketId of [...peersRef.current.keys()]) closePeer(socketId);
      const response = await emitAck(socket, 'staff:voice:join', { roomId });
      if (response.status !== 'ok') throw new Error(response.message || 'Voice join failed');
      roomRef.current = roomId;
      setCurrentRoom(roomId);
      setRooms(response.rooms || []);
      setInvitation(null);
      for (const member of response.existingMembers || []) {
        if (member.socketId !== socket.id) await createOffer(member.socketId);
      }
      return true;
    } catch (joinError) {
      setError(joinError.message || 'Microphone is unavailable');
      if (!roomRef.current) closeMedia();
      return false;
    }
  }, [closeMedia, closePeer, createOffer, refreshIceServers, socket]);

  useEffect(() => {
    joinRef.current = joinRoom;
  }, [joinRoom]);

  const toggleMute = useCallback(() => {
    if (!currentRoom || !streamRef.current) return;
    const next = !muted;
    streamRef.current.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
    socket?.emit('staff:voice:mute', { roomId: currentRoom, muted: next });
  }, [currentRoom, muted, socket]);

  const toggleDeafen = useCallback(() => {
    if (!currentRoom) return;
    const next = !deafened;
    deafenedRef.current = next;
    setDeafened(next);
    for (const audio of audioRef.current.values()) audio.muted = next;
    socket?.emit('staff:voice:deafen', { roomId: currentRoom, deafened: next });
  }, [currentRoom, deafened, socket]);

  const resumeAudio = useCallback(async () => {
    const results = await Promise.all([...audioRef.current.values()].map(audio => {
      audio.muted = deafenedRef.current;
      return audio.play().then(() => true).catch(() => false);
    }));
    const blocked = results.some(result => !result);
    setPlaybackBlocked(blocked);
    return !blocked;
  }, []);

  const reconnectRoom = useCallback(() => {
    const roomId = roomRef.current;
    return roomId ? joinRoom(roomId) : Promise.resolve(false);
  }, [joinRoom]);

  const invite = useCallback(async (targetUserId, mode = 'invite', roomId = currentRoom, targetSocketId = '') => {
    if (!socket?.connected || !currentRoom) return { status: 'error' };
    return emitAck(socket, `staff:voice:${mode}`, { roomId, targetUserId, targetSocketId });
  }, [currentRoom, socket]);

  useEffect(() => {
    refreshRooms();
    if (!socket) return undefined;
    const onReady = payload => setRooms(payload.rooms || []);
    const onConnect = () => {
      refreshRooms();
      if (roomRef.current && streamRef.current) joinRef.current?.(roomRef.current);
    };
    const onDisconnect = () => {
      for (const socketId of [...peersRef.current.keys()]) closePeer(socketId);
    };
    const onChanged = () => refreshRooms();
    const onMembers = payload => setRooms(current => current.map(room => room.id === payload.roomId ? { ...room, members: payload.members } : room));
    const onJoined = payload => setRooms(current => current.map(room => room.id === payload.roomId ? { ...room, members: [...room.members.filter(member => member.socketId !== payload.member.socketId), payload.member] } : room));
    const onLeft = payload => {
      closePeer(payload.socketId);
      setRooms(current => current.map(room => room.id === payload.roomId ? { ...room, members: room.members.filter(member => member.socketId !== payload.socketId) } : room));
    };
    const onMemberState = payload => setRooms(current => current.map(room => room.id === payload.roomId ? { ...room, members: room.members.map(member => member.socketId === payload.socketId ? { ...member, muted: payload.muted, deafened: payload.deafened } : member) } : room));
    const onSpeaking = payload => setRooms(current => current.map(room => room.id === payload.roomId ? { ...room, members: room.members.map(member => member.socketId === payload.socketId ? { ...member, speaking: payload.speaking } : member) } : room));
    const onOffer = async ({ roomId, fromSocketId, data }) => {
      if (roomId !== roomRef.current) return;
      const peer = ensurePeer(fromSocketId);
      await peer.setRemoteDescription(data);
      await flushCandidates(fromSocketId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('staff:voice:answer', { roomId, targetSocketId: fromSocketId, data: answer });
    };
    const onAnswer = async ({ roomId, fromSocketId, data }) => {
      if (roomId !== roomRef.current) return;
      const peer = peersRef.current.get(fromSocketId);
      if (!peer) return;
      await peer.setRemoteDescription(data);
      await flushCandidates(fromSocketId);
    };
    const onIce = async ({ roomId, fromSocketId, data }) => {
      if (roomId !== roomRef.current) return;
      const peer = ensurePeer(fromSocketId);
      if (peer.remoteDescription) await peer.addIceCandidate(data).catch(() => {});
      else candidatesRef.current.set(fromSocketId, [...(candidatesRef.current.get(fromSocketId) || []), data]);
    };
    const onInvited = payload => setInvitation({ ...payload, mode: 'invite' });
    const onMoved = payload => {
      if (streamRef.current) joinRef.current?.(payload.room.id);
      else setInvitation({ ...payload, mode: 'move' });
    };
    const onKicked = () => {
      roomRef.current = '';
      setCurrentRoom('');
      setMuted(false);
      setDeafened(false);
      deafenedRef.current = false;
      closeMedia();
      setError('VOICE_KICKED');
      refreshRooms();
    };

    socket.on('staff:ready', onReady);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('staff:voice:changed', onChanged);
    socket.on('staff:voice:members', onMembers);
    socket.on('staff:voice:user-joined', onJoined);
    socket.on('staff:voice:user-left', onLeft);
    socket.on('staff:voice:member-state', onMemberState);
    socket.on('staff:voice:speaking', onSpeaking);
    socket.on('staff:voice:offer', onOffer);
    socket.on('staff:voice:answer', onAnswer);
    socket.on('staff:voice:ice', onIce);
    socket.on('staff:voice:invited', onInvited);
    socket.on('staff:voice:moved', onMoved);
    socket.on('staff:voice:kicked', onKicked);
    if (socket.connected) refreshRooms();
    return () => {
      socket.off('staff:ready', onReady);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('staff:voice:changed', onChanged);
      socket.off('staff:voice:members', onMembers);
      socket.off('staff:voice:user-joined', onJoined);
      socket.off('staff:voice:user-left', onLeft);
      socket.off('staff:voice:member-state', onMemberState);
      socket.off('staff:voice:speaking', onSpeaking);
      socket.off('staff:voice:offer', onOffer);
      socket.off('staff:voice:answer', onAnswer);
      socket.off('staff:voice:ice', onIce);
      socket.off('staff:voice:invited', onInvited);
      socket.off('staff:voice:moved', onMoved);
      socket.off('staff:voice:kicked', onKicked);
      if (roomRef.current) socket.emit('staff:voice:leave', {});
      roomRef.current = '';
      closeMedia();
    };
  }, [closeMedia, closePeer, ensurePeer, flushCandidates, refreshRooms, socket]);

  useEffect(() => {
    if (rooms.length) return undefined;
    const timer = window.setInterval(refreshRooms, 5000);
    return () => window.clearInterval(timer);
  }, [refreshRooms, rooms.length]);

  return {
    rooms,
    currentRoom,
    muted,
    deafened,
    error,
    roomsError,
    invitation,
    playbackBlocked,
    peerStates,
    connectedPeers: Object.values(peerStates).filter(state => state === 'connected').length,
    connected: Boolean(socket?.connected),
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleDeafen,
    resumeAudio,
    reconnectRoom,
    invite,
    refreshRooms,
    dismissInvitation: () => setInvitation(null)
  };
}
