import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Общая сериализация SDP/ICE для ЛС и каналов; роли совпадают с ПК по socketId.
class PeerNegotiation {
  PeerNegotiation(
      {required this.channelId,
      required this.localSocketId,
      required this.createPeer,
      required this.peer,
      required this.send});

  final String Function() channelId;
  final String Function() localSocketId;
  final Future<RTCPeerConnection> Function(String) createPeer;
  final RTCPeerConnection? Function(String) peer;
  final void Function(String event, Map<String, dynamic> payload) send;
  final _states = <String, _PeerState>{};
  final _creating = <String, Future<RTCPeerConnection>>{};
  int _epoch = 0;

  _PeerState _state(String id) => _states.putIfAbsent(id, _PeerState.new);
  bool _current(String id, RTCPeerConnection pc, int epoch, String room) =>
      epoch == _epoch &&
      room.isNotEmpty &&
      channelId() == room &&
      identical(peer(id), pc);

  Future<RTCPeerConnection> _getPeer(String id) async {
    final pending = _creating[id];
    if (pending != null) return pending;
    final existing = peer(id);
    if (existing != null) return existing;
    final future = createPeer(id);
    _creating[id] = future;
    try {
      return await future;
    } finally {
      if (identical(_creating[id], future)) _creating.remove(id);
    }
  }

  void bind(String id, RTCPeerConnection pc) {
    pc.onSignalingState = (state) {
      final flags = _states[id];
      if (identical(peer(id), pc) &&
          flags?.pending == true &&
          state == RTCSignalingState.RTCSignalingStateStable) {
        unawaited(offer(id));
      }
    };
  }

  Future<void> offer(String id, {bool iceRestart = false}) async {
    final epoch = _epoch, room = channelId();
    if (room.isEmpty) return;
    try {
      final pc = await _getPeer(id);
      if (!_current(id, pc, epoch, room)) return;
      final flags = _state(id);
      flags.pending = true;
      flags.restart = flags.restart || iceRestart;
      if (flags.making ||
          flags.answering ||
          pc.signalingState != RTCSignalingState.RTCSignalingStateStable) {
        return;
      }
      flags.pending = false;
      flags.making = true;
      final restart = flags.restart;
      flags.restart = false;
      final task = () async {
        final description = await pc.createOffer({
          'offerToReceiveAudio': true,
          'offerToReceiveVideo': true,
          'iceRestart': restart
        });
        if (!_current(id, pc, epoch, room)) return;
        await pc.setLocalDescription(description);
        if (_current(id, pc, epoch, room)) {
          send('webrtc:offer', {
            'targetSocketId': id,
            'offer': description.toMap(),
            'channelId': room
          });
        }
      }();
      flags.outgoing = task;
      try {
        await task;
      } finally {
        flags.making = false;
        flags.outgoing = null;
        if (_current(id, pc, epoch, room) &&
            flags.pending &&
            !flags.answering &&
            pc.signalingState == RTCSignalingState.RTCSignalingStateStable) {
          scheduleMicrotask(() => unawaited(offer(id)));
        }
      }
    } catch (_) {/* Закрытый/сменившийся peer не оживляем. */}
  }

  Future<void> receiveOffer(
      String id, RTCSessionDescription description) async {
    final epoch = _epoch, room = channelId();
    if (room.isEmpty) return;
    final flags = _state(id);
    final previous = flags.incoming;
    final task = () async {
      if (previous != null) {
        try {
          await previous;
        } catch (_) {}
      }
      if (epoch != _epoch || channelId() != room) return;
      final pc = await _getPeer(id);
      if (!_current(id, pc, epoch, room)) return;
      final collision = flags.making ||
          pc.signalingState != RTCSignalingState.RTCSignalingStateStable;
      flags.ignoreOffer = collision && localSocketId().compareTo(id) < 0;
      if (flags.ignoreOffer) return;
      flags.answering = true;
      try {
        try {
          await flags.outgoing;
        } catch (_) {}
        if (!_current(id, pc, epoch, room)) return;
        if (pc.signalingState != RTCSignalingState.RTCSignalingStateStable) {
          await pc.setLocalDescription(RTCSessionDescription('', 'rollback'));
        }
        await pc.setRemoteDescription(description);
        await _flush(id, pc);
        if (!_current(id, pc, epoch, room)) return;
        final answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (_current(id, pc, epoch, room)) {
          send('webrtc:answer', {
            'targetSocketId': id,
            'answer': answer.toMap(),
            'channelId': room
          });
        }
      } finally {
        flags.answering = false;
        if (_current(id, pc, epoch, room) && flags.pending) {
          unawaited(offer(id));
        }
      }
    }();
    flags.incoming = task;
    try {
      await task;
    } catch (_) {/* Не роняем остальные соединения. */} finally {
      if (identical(flags.incoming, task)) flags.incoming = null;
    }
  }

  Future<void> receiveAnswer(
      String id, RTCSessionDescription description) async {
    final pc = peer(id), epoch = _epoch, room = channelId();
    if (pc == null ||
        pc.signalingState !=
            RTCSignalingState.RTCSignalingStateHaveLocalOffer) {
      return;
    }
    try {
      await pc.setRemoteDescription(description);
      if (!_current(id, pc, epoch, room)) return;
      _state(id).ignoreOffer = false;
      await _flush(id, pc);
    } catch (_) {/* Устаревший answer после rollback. */}
  }

  Future<void> candidate(String id, RTCIceCandidate candidate) async {
    if (channelId().isEmpty) return;
    final pc = peer(id), flags = _state(id);
    try {
      if (pc == null || (await pc.getRemoteDescription())?.type == null) {
        if (flags.candidates.length < 100) flags.candidates.add(candidate);
        return;
      }
      await pc.addCandidate(candidate);
    } catch (_) {/* ICE старого offer при glare может быть отвергнут. */}
  }

  Future<void> _flush(String id, RTCPeerConnection pc) async {
    final flags = _state(id);
    final candidates = flags.candidates.toList();
    flags.candidates.clear();
    for (final candidate in candidates) {
      if (!identical(peer(id), pc)) return;
      try {
        await pc.addCandidate(candidate);
      } catch (_) {}
    }
  }

  void remove(String id) {
    _states.remove(id);
    _creating.remove(id);
  }

  void reset() {
    ++_epoch;
    _states.clear();
    _creating.clear();
  }
}

class _PeerState {
  bool making = false,
      answering = false,
      pending = false,
      restart = false,
      ignoreOffer = false;
  Future<void>? outgoing, incoming;
  final candidates = <RTCIceCandidate>[];
}
