import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/network/love_api.dart';
import '../../core/notifications/in_app_notifications.dart';
import '../../core/platform/audio_file_picker.dart';
import '../../core/realtime/love_socket.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../core/prefs/love_prefs.dart';
import '../../core/notifications/local_notifications.dart';
import '../../core/calls/call_center.dart';
import 'chat_models.dart';
import 'dm_call_controller.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    required this.title,
    required this.api,
    required this.socket,
    this.channelId,
    this.conversationId,
    this.serverId,
    this.peerId,
    this.peerAvatar,
    this.embedded = false,
    this.showHeader = true,
    super.key,
  });

  final String title;
  final String? channelId;
  final String? conversationId;
  final String? serverId;
  final String? peerId;
  final String? peerAvatar;
  final LoveApi api;
  final LoveSocket socket;
  final bool embedded;
  final bool showHeader;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _message = TextEditingController();
  final _scroll = ScrollController();
  final _messages = <ChatMessage>[];
  final _pendingAttachments = <_PendingAttachment>[];

  String? _activeChannelId;
  String _currentUserId = '';
  bool _loading = true;
  bool _sending = false;
  bool _recordingVoice = false;
  bool _slowLoad = false;
  String? _error;
  DmCallController? _callController;

  @override
  void initState() {
    super.initState();
    _activeChannelId = widget.channelId;
    if (widget.conversationId != null) {
      ActiveChat.conversationId = widget.conversationId;
      LocalNotifications.clearConversation(widget.conversationId!);
    }
    widget.socket.on('message:new', _handleNewMessage);
    widget.socket.on('message:update', _handleMessageUpdate);
    widget.socket.on('dm:new_message', _handleDmMessage);
    _joinServerRoom();
    final peerId = widget.peerId;
    if (widget.conversationId != null && peerId != null && peerId.isNotEmpty) {
      // Call controller lives in CallScreen, not on the screen:
      // leaving the chat no longer ends the call.
      _callController = CallCenter.instance.obtain(
        socket: widget.socket,
        conversationId: widget.conversationId!,
        channelId: widget.channelId ?? '',
        peerId: peerId,
        peerName: widget.title,
        peerAvatar: widget.peerAvatar ?? '',
      );
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _currentUserId = AppSessionScope.of(context).user?.id ?? '';
  }

  @override
  void dispose() {
    if (ActiveChat.conversationId == widget.conversationId) {
      ActiveChat.conversationId = null;
    }
    widget.socket.off('message:new', _handleNewMessage);
    widget.socket.off('message:update', _handleMessageUpdate);
    widget.socket.off('dm:new_message', _handleDmMessage);
    if (_recordingVoice) {
      ChatNativeFiles.cancelVoiceRecording();
    }
    if (_callController != null) {
      CallCenter.instance.release(_callController!);
    }
    _message.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final content = Column(
      children: [
        if (widget.showHeader)
          _ChatHeader(
            title: widget.title,
            avatarUrl: widget.peerAvatar,
            subtitle: widget.conversationId == null
                ? 'Текстовый канал'
                : 'Личный диалог',
            actions: [
              if (_callController != null)
                AnimatedBuilder(
                  animation: _callController!,
                  builder: (context, _) => LoveActionButton(
                    tooltip: 'Позвонить',
                    icon: _callController!.isVisible
                        ? Icons.call_rounded
                        : Icons.call_outlined,
                    onPressed: _callController!.canStart
                        ? _callController!.startOutgoing
                        : null,
                  ),
                ),
              if (_callController != null)
                AnimatedBuilder(
                  animation: _callController!,
                  builder: (context, _) => LoveActionButton(
                    tooltip: 'Видеозвонок',
                    icon: Icons.videocam_outlined,
                    onPressed: _callController!.canStart
                        ? _callController!.startOutgoing
                        : null,
                  ),
                ),
              LoveActionButton(
                tooltip: 'Поиск',
                icon: Icons.search_rounded,
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Поиск по чату скоро')),
                ),
              ),
            ],
          ),
        Expanded(child: _body()),
        if (_callController != null)
          AnimatedBuilder(
            animation: _callController!,
            builder: (context, _) => _DmCallPanel(controller: _callController!),
          ),
        _Composer(
          controller: _message,
          sending: _sending,
          recordingVoice: _recordingVoice,
          attachments: _pendingAttachments,
          onAttach: _pickAttachment,
          onRemoveAttachment: _removeAttachment,
          onEmoji: _showEmojiSheet,
          onVoice: _toggleVoiceRecording,
          onSend: _send,
        ),
      ],
    );

    if (widget.embedded) return content;

    return Scaffold(
      body: LoveBackground(
        child: SafeArea(
          bottom: false,
          child: content,
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(strokeWidth: 2),
            if (_slowLoad) ...[
              const SizedBox(height: 14),
              Text(
                widget.conversationId != null
                    ? 'Жду историю личного чата...'
                    : 'Жду сообщения канала...',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: LoveColors.textMuted,
                  fontSize: 12,
                ),
              ),
            ],
          ],
        ),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(LoveSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: LoveColors.textMuted),
              ),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Повторить'),
              ),
            ],
          ),
        ),
      );
    }
    if (_messages.isEmpty) {
      return const EmptyState(
        icon: Icons.chat_bubble_outline,
        title: 'Сообщений пока нет',
        message: 'Напишите первым, чтобы начать разговор.',
      );
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        final message = _messages[index];
        final prev = index > 0 ? _messages[index - 1] : null;
        final grouped = prev != null &&
            prev.isOwn == message.isOwn &&
            prev.authorName == message.authorName &&
            message.createdAt.difference(prev.createdAt).inMinutes.abs() < 5;
        return _MessageBubble(message: message, grouped: grouped);
      },
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _slowLoad = false;
      _error = null;
    });
    Future<void>.delayed(const Duration(seconds: 4), () {
      if (mounted && _loading) setState(() => _slowLoad = true);
    });
    try {
      final List<Map<String, dynamic>> raw;
      if (widget.conversationId != null) {
        raw = await _loadConversationMessages();
      } else {
        final channelId = widget.channelId;
        if (channelId == null || channelId.isEmpty) {
          throw const FormatException('Канал чата не найден');
        }
        _activeChannelId = channelId;
        _joinServerRoom();
        raw = await widget.api.messages(channelId);
      }
      _messages
        ..clear()
        ..addAll(raw.map(
          (item) => ChatMessage.fromJson(item, currentUserId: _currentUserId),
        ));
      _scrollToEnd();
    } catch (error) {
      _error = error.toString();
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _slowLoad = false;
        });
      }
    }
  }

  Future<List<Map<String, dynamic>>> _loadConversationMessages() async {
    try {
      final response =
          await widget.api.conversationMessages(widget.conversationId!);
      final channelId = asId(response['channelId']);
      if (channelId.isNotEmpty) {
        _activeChannelId = channelId;
        _callController?.updateChannelId(channelId);
      }
      final messages = response['messages'];
      if (messages is List) {
        return messages
            .whereType<Map>()
            .map((item) => item.cast<String, dynamic>())
            .toList();
      }
      throw const FormatException('Сервер вернул неверный формат сообщений');
    } catch (error) {
      final fallbackChannelId = _activeChannelId;
      if (fallbackChannelId == null || fallbackChannelId.isEmpty) rethrow;
      return widget.api.messages(fallbackChannelId);
    }
  }

  Future<void> _send() async {
    final text = _message.text.trim();
    final channelId = _activeChannelId;
    final pendingAttachments = List<_PendingAttachment>.of(_pendingAttachments);
    if (pendingAttachments.any((item) => item.uploading)) {
      _showSnack('Дождитесь загрузки файлов');
      return;
    }
    if ((text.isEmpty && pendingAttachments.isEmpty) ||
        channelId == null ||
        channelId.isEmpty ||
        _sending) {
      return;
    }

    final currentUser = AppSessionScope.of(context).user;
    final tempId = 'temp_${DateTime.now().microsecondsSinceEpoch}';
    setState(() {
      _sending = true;
      _message.clear();
      _pendingAttachments.clear();
      _messages.add(
        ChatMessage(
          id: tempId,
          channelId: channelId,
          content: text,
          authorName: currentUser?.username ?? 'Вы',
          authorId: currentUser?.id ?? '',
          authorAvatar: currentUser?.avatar ?? '',
          createdAt: DateTime.now(),
          isOwn: true,
          attachments: pendingAttachments
              .map(
                (item) => ChatAttachment(
                  url: item.path,
                  name: item.name,
                  type: item.type,
                  mimeType: item.mimeType,
                  size: item.size,
                ),
              )
              .toList(),
          type: pendingAttachments.isEmpty ? 'default' : 'file',
        ),
      );
    });
    _scrollToEnd();

    try {
      final attachments = <Map<String, dynamic>>[];
      for (final pending in pendingAttachments) {
        final uploaded =
            pending.uploaded ?? await widget.api.uploadAttachment(pending.path, mimeType: pending.mimeType);
        attachments.add({
          'type': pending.typeFromUpload(uploaded),
          'url': asText(uploaded['url']),
          'filename': asText(uploaded['filename'], pending.name),
          'originalName': asText(uploaded['originalName'], pending.name),
          'size': int.tryParse(asText(uploaded['size'])) ?? pending.size,
          'mimetype': asText(uploaded['mimetype'], pending.mimeType),
        });
      }
      if (widget.socket.isConnected) {
        widget.socket.emit('message:send', {
          'channelId': channelId,
          'content': text,
          'attachments': attachments,
          'tempId': tempId,
        });
      } else {
        if (attachments.isEmpty) {
          await widget.api.sendMessage(channelId, text);
        } else {
          throw const FormatException(
              'Нет realtime-соединения для отправки файла');
        }
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _pendingAttachments
          ..clear()
          ..addAll(pendingAttachments);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pickAttachment() async {
    try {
      final picked = await ChatNativeFiles.pickFile();
      if (picked == null || !mounted) return;
      final pending = _PendingAttachment.file(picked)..uploading = true;
      setState(() {
        _pendingAttachments.add(pending);
      });
      final uploaded = await widget.api.uploadAttachment(pending.path, mimeType: pending.mimeType);
      if (!mounted || !_pendingAttachments.contains(pending)) return;
      setState(() {
        pending
          ..uploaded = uploaded
          ..uploading = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _pendingAttachments.removeWhere((item) => item.uploading);
        });
      }
      _showSnack(error.toString());
    }
  }

  void _removeAttachment(int index) {
    if (index < 0 || index >= _pendingAttachments.length) return;
    setState(() => _pendingAttachments.removeAt(index));
  }

  Future<void> _toggleVoiceRecording() async {
    try {
      if (_recordingVoice) {
        final recorded = await ChatNativeFiles.stopVoiceRecording();
        if (!mounted) return;
        setState(() => _recordingVoice = false);
        if (recorded != null && recorded.durationMs > 500) {
          final pending = _PendingAttachment.voice(recorded)..uploading = true;
          setState(() {
            _pendingAttachments.add(pending);
          });
          final uploaded = await widget.api.uploadAttachment(pending.path, mimeType: pending.mimeType);
          if (!mounted || !_pendingAttachments.contains(pending)) return;
          setState(() {
            pending
              ..uploaded = uploaded
              ..uploading = false;
          });
        }
        return;
      }
      final status = await Permission.microphone.request();
      if (!status.isGranted) {
        throw const FormatException('Нет доступа к микрофону');
      }
      await ChatNativeFiles.startVoiceRecording();
      if (mounted) setState(() => _recordingVoice = true);
    } catch (error) {
      if (mounted) setState(() => _recordingVoice = false);
      _showSnack(error.toString());
    }
  }

  Future<void> _showEmojiSheet() async {
    const emojis = [
      '😀',
      '😂',
      '🥹',
      '😍',
      '😘',
      '😎',
      '😭',
      '😡',
      '❤️',
      '🔥',
      '✨',
      '👍',
      '🙏',
      '💀',
      '🎧',
      '🌙',
      '💬',
      '⭐',
      '🍓',
      '🖤',
      '🤍',
      '👀',
      '😴',
      '🥰',
    ];
    final emoji = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => SafeArea(
        child: Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: LoveColors.surfaceStrong,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: GridView.builder(
            shrinkWrap: true,
            itemCount: emojis.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 6,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemBuilder: (context, index) => InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Navigator.of(context).pop(emojis[index]),
              child: Center(
                child: Text(
                  emojis[index],
                  style: const TextStyle(fontSize: 26),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    if (emoji == null) return;
    final selection = _message.selection;
    final text = _message.text;
    final start = selection.isValid ? selection.start : text.length;
    final end = selection.isValid ? selection.end : text.length;
    _message.value = TextEditingValue(
      text: text.replaceRange(start, end, emoji),
      selection: TextSelection.collapsed(offset: start + emoji.length),
    );
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  void _handleNewMessage(dynamic data) {
    _addSocketMessage(data is Map ? data.cast<String, dynamic>() : null);
  }

  void _handleDmMessage(dynamic data) {
    if (data is! Map) return;
    if (widget.conversationId != null &&
        asId(data['conversationId']) != widget.conversationId) {
      return;
    }
    final message = data['message'];
    if (message is Map) {
      _addMessage(message.cast<String, dynamic>());
    }
  }

  void _handleMessageUpdate(dynamic data) {
    if (data is! Map) return;
    final raw = data.cast<String, dynamic>();
    final message = raw['message'];
    final channelId = _eventChannelId(raw, message);
    if (channelId != _activeChannelId) return;
    final tempId = asId(raw['tempId']);
    if (message is! Map) return;
    final updated = ChatMessage.fromJson(
      message.cast<String, dynamic>(),
      currentUserId: _currentUserId,
    );
    setState(() {
      final index = _messages.indexWhere((item) => item.id == tempId);
      if (index == -1) {
        if (!_messages.any((item) => item.id == updated.id)) {
          _messages.add(updated);
        }
      } else {
        _messages[index] = updated;
      }
    });
  }

  void _addSocketMessage(Map<String, dynamic>? data) {
    if (data == null) return;
    final message = data['message'];
    if (_eventChannelId(data, message) != _activeChannelId) return;
    if (message is! Map) return;
    final raw = message.cast<String, dynamic>();
    // In a DM the server delivers an incoming message over TWO events:
    // `message:new` (with the sender's temp id) AND `dm:new_message` (with the
    // real id). Appending on both — with a later `message:update` rewriting the
    // temp copy to the real id — produces a duplicate bubble. Mirror the web
    // guard (socket.js): for a DM, `message:new` handles ONLY our own messages
    // (so the optimistic echo reconciles temp→real); incoming messages flow
    // solely through `dm:new_message`.
    if (widget.conversationId != null) {
      final author = raw['author'];
      final authorId = author is Map ? asId(author['_id']) : asId(author);
      if (authorId != _currentUserId) return;
    }
    _addMessage(raw);
  }

  void _addMessage(Map<String, dynamic> raw) {
    final parsed = ChatMessage.fromJson(raw, currentUserId: _currentUserId);
    if (_messages.any((item) => item.id == parsed.id)) return;
    setState(() => _messages.add(parsed));
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  String _eventChannelId(Map<String, dynamic> data, Object? message) {
    final direct = asId(data['channelId']);
    if (direct.isNotEmpty) return direct;
    if (message is Map) return asId(message['channel']);
    return '';
  }

  void _joinServerRoom() {
    final serverId = widget.serverId;
    if (serverId == null || serverId.isEmpty) return;
    widget.socket.emit('server:join', {'serverId': serverId});
  }
}

class _ChatHeader extends StatelessWidget {
  const _ChatHeader({
    required this.title,
    required this.subtitle,
    this.avatarUrl,
    this.actions = const [],
  });

  final String title;
  final String subtitle;
  final String? avatarUrl;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: const EdgeInsets.fromLTRB(6, 0, 10, 0),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: LoveColors.border)),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).pop(),
            color: LoveColors.textSecondary,
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          ),
          const SizedBox(width: 2),
          LoveAvatar(label: title, imageUrl: avatarUrl, size: 38),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: LoveColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: LoveColors.textSecondary,
                    fontSize: 11.5,
                  ),
                ),
              ],
            ),
          ),
          for (final action in actions) action,
        ],
      ),
    );
  }
}

/// Ghost square icon button used in chat/action headers (web `.action-btn`:
/// 36×36, 8px radius, transparent, secondary color, hover → faint fill).
class LoveActionButton extends StatelessWidget {
  const LoveActionButton({
    required this.icon,
    required this.onPressed,
    this.tooltip,
    super.key,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final button = Material(
      type: MaterialType.transparency,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onPressed,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(
            icon,
            size: 20,
            color: onPressed == null
                ? LoveColors.textMuted
                : LoveColors.textSecondary,
          ),
        ),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

class _DmCallPanel extends StatelessWidget {
  const _DmCallPanel({required this.controller});

  final DmCallController controller;

  @override
  Widget build(BuildContext context) {
    if (!controller.isVisible) return const SizedBox.shrink();

    final incoming = controller.phase == DmCallPhase.incoming;
    final connected = controller.phase == DmCallPhase.connected ||
        controller.phase == DmCallPhase.connecting;
    final error = controller.phase == DmCallPhase.error;

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: LoveColors.surfaceStrong,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: LoveColors.borderActive),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.26),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            LoveAvatar(
              label: controller.displayName,
              imageUrl: controller.peerAvatar,
              size: 38,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    controller.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    controller.statusText,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: LoveColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (incoming) ...[
              IconButton.filled(
                tooltip: 'Принять',
                onPressed: controller.acceptIncoming,
                icon: const Icon(Icons.call_rounded),
              ),
              const SizedBox(width: 6),
              IconButton.outlined(
                tooltip: 'Отклонить',
                onPressed: controller.declineIncoming,
                icon: const Icon(Icons.call_end_rounded),
              ),
            ] else if (error) ...[
              IconButton.outlined(
                tooltip: 'Закрыть',
                onPressed: controller.dismissError,
                icon: const Icon(Icons.close_rounded),
              ),
            ] else ...[
              if (connected) ...[
                IconButton.outlined(
                  tooltip: controller.muted
                      ? 'Включить микрофон'
                      : 'Выключить микрофон',
                  onPressed: controller.toggleMute,
                  icon: Icon(
                    controller.muted
                        ? Icons.mic_off_rounded
                        : Icons.mic_rounded,
                  ),
                ),
                const SizedBox(width: 6),
              ],
              IconButton.filled(
                tooltip: 'Завершить',
                onPressed: controller.endCall,
                icon: const Icon(Icons.call_end_rounded),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatefulWidget {
  const _MessageBubble({required this.message, this.grouped = false});

  final ChatMessage message;

  /// True when the previous message is from the same author within a short
  /// window — hide the repeated avatar/name and tighten spacing.
  final bool grouped;

  @override
  State<_MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<_MessageBubble> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final message = widget.message;
    final color =
        message.isOwn ? LoveColors.bubbleOwn : LoveColors.bubblePartner;
    final textColor =
        message.isOwn ? LoveColors.bubbleOwnText : LoveColors.bubblePartnerText;
    final metaColor = message.isOwn
        ? Colors.black.withValues(alpha: 0.48)
        : LoveColors.textMuted;
    final bubble = ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * 0.76,
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(message.isOwn ? 18 : 6),
            bottomRight: Radius.circular(message.isOwn ? 6 : 18),
          ),
          border: message.isOwn
              ? null
              : Border.all(color: Colors.white.withValues(alpha: 0.06)),
        ),
        child: Padding(
          padding: LovePrefs.instance.compactMode.value
              ? const EdgeInsets.fromLTRB(12, 7, 12, 6)
              : const EdgeInsets.fromLTRB(14, 10, 14, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message.content.trim().isNotEmpty)
                    _ExpandableMessageText(
                      text: message.content,
                      color: textColor,
                      expanded: _expanded,
                      onToggle: () => setState(() => _expanded = !_expanded),
                    ),
                  if (message.attachments.isNotEmpty) ...[
                    if (message.content.trim().isNotEmpty)
                      const SizedBox(height: 8),
                    for (final attachment in message.attachments)
                      _AttachmentChip(
                        attachment: attachment,
                        own: message.isOwn,
                      ),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Text(
                _formatTime(message.createdAt),
                style: TextStyle(
                  color: metaColor,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );

    final grouped = widget.grouped;

    final compact = LovePrefs.instance.compactMode.value;

    if (message.isOwn) {
      return Padding(
        padding: EdgeInsets.only(bottom: grouped ? 2 : (compact ? 5 : 10)),
        child: Align(alignment: Alignment.centerRight, child: bubble),
      );
    }

    return Padding(
      padding: EdgeInsets.only(bottom: grouped ? 2 : (compact ? 6 : 12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (grouped)
            const SizedBox(width: 38)
          else ...[
            LoveAvatar(
              label: message.authorName,
              imageUrl: message.authorAvatar,
              size: 30,
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!grouped)
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 4),
                    child: Text(
                      message.authorName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: LoveColors.textMuted,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                bubble,
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime value) {
    final local = value.toLocal();
    final hours = local.hour.toString().padLeft(2, '0');
    final minutes = local.minute.toString().padLeft(2, '0');
    return '$hours:$minutes';
  }
}

class _ExpandableMessageText extends StatelessWidget {
  const _ExpandableMessageText({
    required this.text,
    required this.color,
    required this.expanded,
    required this.onToggle,
  });

  static const _collapseAtChars = 280;
  static const _collapseAtLines = 7;

  final String text;
  final Color color;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final shouldCollapse = text.runes.length > _collapseAtChars ||
        '\n'.allMatches(text).length >= _collapseAtLines;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          _wrapLongRuns(text),
          maxLines: shouldCollapse && !expanded ? 6 : null,
          overflow: shouldCollapse && !expanded
              ? TextOverflow.fade
              : TextOverflow.visible,
          softWrap: true,
          style: TextStyle(color: color, height: 1.35),
        ),
        if (shouldCollapse) ...[
          const SizedBox(height: 4),
          TextButton(
            onPressed: onToggle,
            style: TextButton.styleFrom(
              foregroundColor: color.withValues(alpha: 0.76),
              padding: EdgeInsets.zero,
              minimumSize: const Size(0, 28),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
            child: Text(expanded ? 'Свернуть' : 'Посмотреть еще'),
          ),
        ],
      ],
    );
  }

  String _wrapLongRuns(String value) {
    return value.replaceAllMapped(
      RegExp(r'(\S{24})(?=\S)'),
      (match) => '${match.group(1)}\u{200B}',
    );
  }
}

class _AttachmentChip extends StatelessWidget {
  const _AttachmentChip({
    required this.attachment,
    required this.own,
  });

  final ChatAttachment attachment;
  final bool own;

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(attachment.url) ?? '';
    final icon = attachment.isVoice
        ? Icons.graphic_eq_rounded
        : attachment.type == 'image'
            ? Icons.image_outlined
            : Icons.attach_file_rounded;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: url.isEmpty ? null : () => launchUrl(Uri.parse(url)),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: own
                ? Colors.black.withValues(alpha: 0.08)
                : Colors.white.withValues(alpha: 0.055),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: own
                  ? Colors.black.withValues(alpha: 0.08)
                  : LoveColors.border,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 17),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  attachment.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingAttachment {
  _PendingAttachment({
    required this.path,
    required this.name,
    required this.mimeType,
    required this.size,
    required this.type,
    this.durationMs = 0,
  });

  factory _PendingAttachment.file(PickedChatFile file) {
    return _PendingAttachment(
      path: file.path,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      type: file.isImage
          ? 'image'
          : file.isAudio
              ? 'audio'
              : 'file',
    );
  }

  factory _PendingAttachment.voice(RecordedVoiceMessage file) {
    return _PendingAttachment(
      path: file.path,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      type: 'audio',
      durationMs: file.durationMs,
    );
  }

  final String path;
  final String name;
  final String mimeType;
  final int size;
  final String type;
  final int durationMs;
  bool uploading = false;
  Map<String, dynamic>? uploaded;

  String typeFromUpload(Map<String, dynamic> uploaded) {
    final uploadedType = asText(uploaded['type']);
    if (type == 'audio') return 'audio';
    return uploadedType.isEmpty ? type : uploadedType;
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.recordingVoice,
    required this.attachments,
    required this.onAttach,
    required this.onRemoveAttachment,
    required this.onEmoji,
    required this.onVoice,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final bool recordingVoice;
  final List<_PendingAttachment> attachments;
  final VoidCallback onAttach;
  final void Function(int index) onRemoveAttachment;
  final VoidCallback onEmoji;
  final VoidCallback onVoice;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (attachments.isNotEmpty) ...[
              _AttachmentPreviewStrip(
                attachments: attachments,
                onRemove: onRemoveAttachment,
              ),
              const SizedBox(height: 8),
            ],
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.03),
                border: Border.all(color: const Color(0x14FFFFFF)),
                borderRadius: BorderRadius.circular(22),
              ),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Прикрепить файл',
                    onPressed: sending ? null : onAttach,
                    color: LoveColors.textSecondary,
                    iconSize: 22,
                    icon: const Icon(Icons.attach_file_rounded),
                  ),
                  IconButton(
                    tooltip: 'Эмодзи',
                    onPressed: sending ? null : onEmoji,
                    color: LoveColors.textSecondary,
                    iconSize: 22,
                    icon: const Icon(Icons.sentiment_satisfied_outlined),
                  ),
                  Expanded(
                    child: TextField(
                      controller: controller,
                      minLines: 1,
                      maxLines: 5,
                      textCapitalization: TextCapitalization.sentences,
                      style: const TextStyle(fontSize: 15),
                      decoration: const InputDecoration(
                        isDense: true,
                        hintText: 'Написать…',
                        filled: false,
                        contentPadding: EdgeInsets.symmetric(vertical: 10),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                      ),
                      onSubmitted: (_) => onSend(),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Отправить',
                    onPressed: sending ? null : onSend,
                    color: LoveColors.textPrimary,
                    iconSize: 22,
                    icon: sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: LoveColors.textSecondary,
                            ),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                  IconButton(
                    tooltip: recordingVoice
                        ? 'Остановить запись'
                        : 'Голосовое сообщение',
                    onPressed: sending ? null : onVoice,
                    color: recordingVoice
                        ? LoveColors.danger
                        : LoveColors.textSecondary,
                    iconSize: 22,
                    icon: Icon(
                      recordingVoice
                          ? Icons.stop_circle_outlined
                          : Icons.mic_none_rounded,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttachmentPreviewStrip extends StatelessWidget {
  const _AttachmentPreviewStrip({
    required this.attachments,
    required this.onRemove,
  });

  final List<_PendingAttachment> attachments;
  final void Function(int index) onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: LoveColors.surfaceStrong,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: LoveColors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < attachments.length; i++) ...[
            _PendingAttachmentTile(
              attachment: attachments[i],
              onRemove: () => onRemove(i),
            ),
            if (i != attachments.length - 1)
              Divider(
                height: 12,
                color: Colors.white.withValues(alpha: 0.06),
              ),
          ],
        ],
      ),
    );
  }
}

class _PendingAttachmentTile extends StatelessWidget {
  const _PendingAttachmentTile({
    required this.attachment,
    required this.onRemove,
  });

  final _PendingAttachment attachment;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final icon = attachment.type == 'audio'
        ? Icons.graphic_eq_rounded
        : attachment.type == 'image'
            ? Icons.image_outlined
            : Icons.attach_file_rounded;
    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, size: 18),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                attachment.type == 'audio' && attachment.durationMs > 0
                    ? 'Голосовое сообщение'
                    : attachment.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                attachment.uploading
                    ? 'Загрузка...'
                    : attachment.durationMs > 0
                        ? _formatDuration(attachment.durationMs)
                        : _formatBytes(attachment.size),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: LoveColors.textMuted,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Убрать',
          onPressed: onRemove,
          icon: const Icon(Icons.close_rounded),
        ),
      ],
    );
  }

  String _formatBytes(int bytes) {
    if (bytes <= 0) return 'Готово к отправке';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  String _formatDuration(int ms) {
    final total = (ms / 1000).round();
    final minutes = total ~/ 60;
    final seconds = (total % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }
}
