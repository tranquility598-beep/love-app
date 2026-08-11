import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/network/love_api.dart';
import '../../core/notifications/in_app_notifications.dart';
import '../../core/platform/audio_file_picker.dart';
import '../../core/realtime/love_socket.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../widgets/staff_role_badge.dart';
import '../../core/prefs/love_prefs.dart';
import '../../core/notifications/local_notifications.dart';
import '../../core/calls/call_center.dart';
import '../profile/user_profile_screen.dart';
import 'capsule_sheet.dart';
import 'chat_models.dart';
import 'dm_call_controller.dart';
import '../calls/call_screen.dart';
import '../calls/call_session.dart';
import 'invite_card.dart';
import 'message_media.dart';
import 'message_report_sheet.dart';

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
  State createState() => _ChatScreenState();
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

  /// Message the next send replies to («Ответить»).
  ChatMessage? _replyTo;

  /// Own message currently being edited («Редактировать»).
  ChatMessage? _editing;

  /// Срок капсулы для следующей отправки. null — обычное сообщение.
  DateTime? _capsuleAt;

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
    widget.socket.on('message:edited', _handleMessageEdited);
    widget.socket.on('message:deleted', _handleMessageDeleted);
    widget.socket.on('dm:new_message', _handleDmMessage);
    widget.socket.on('capsule:scheduled', _handleCapsuleScheduled);
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
    widget.socket.off('message:edited', _handleMessageEdited);
    widget.socket.off('message:deleted', _handleMessageDeleted);
    widget.socket.off('dm:new_message', _handleDmMessage);
    widget.socket.off('capsule:scheduled', _handleCapsuleScheduled);
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
            onTitleTap: widget.peerId == null || widget.peerId!.isEmpty
                ? null
                : () => _openProfile(widget.peerId!),
            actions: [
              if (_callController != null)
                LoveActionButton(
                  tooltip: 'Позвонить',
                  icon: Icons.call_outlined,
                  onPressed: () => _openCall(),
                ),
              if (_callController != null)
                LoveActionButton(
                  tooltip: 'Видеозвонок',
                  icon: Icons.videocam_outlined,
                  onPressed: () => _openCall(video: true),
                ),
            ],
          ),
        Expanded(child: _body()),
        if (_capsuleAt != null) _capsuleBanner(),
        if (_replyTo != null || _editing != null) _composerBanner(),
        _Composer(
          controller: _message,
          sending: _sending,
          recordingVoice: _recordingVoice,
          editing: _editing != null,
          attachments: _pendingAttachments,
          capsuleAt: _capsuleAt,
          onAttach: _pickAttachment,
          onRemoveAttachment: _removeAttachment,
          onEmoji: _showEmojiSheet,
          onCapsule: _openCapsuleSheet,
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
        final replySource = _replySourceOf(message);
        return _MessageBubble(
          message: message,
          grouped: grouped,
          api: widget.api,
          replyAuthor: message.replyToAuthor.isNotEmpty
              ? message.replyToAuthor
              : (replySource?.authorName ?? ''),
          replyContent: message.replyToContent.isNotEmpty
              ? message.replyToContent
              : (replySource?.content ?? ''),
          onLongPress: () => _showMessageActions(message),
          onAuthorTap: message.isOwn || message.authorId.isEmpty
              ? null
              : () => _openProfile(message.authorId),
        );
      },
    );
  }

  ChatMessage? _replySourceOf(ChatMessage message) {
    if (message.replyToId.isEmpty) return null;
    for (final item in _messages) {
      if (item.id == message.replyToId) return item;
    }
    return null;
  }

  void _openProfile(String userId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => UserProfileScreen(
          userId: userId,
          api: widget.api,
          socket: widget.socket,
        ),
      ),
    );
  }

  /// Открыть полноэкранный звонок (начинает вызов, если он ещё не начат).
  void _openCall({bool video = false}) {
    final call = _callController;
    if (call == null) return;
    final starting = call.canStart;
    if (starting) {
      call.startOutgoing(video: video);
    }
    CallScreen.open(context, DmCallSession(call));
    if (video && !starting && !call.cameraOn && !call.screenSharing) {
      call.toggleCamera();
    }
  }

  /// Плашка «капсула взведена». Формулировка важна: на десктопе люди
  /// решали, что капсула уже отправлена, и ждали её, ничего не написав.
  Widget _capsuleBanner() {
    final at = _capsuleAt;
    if (at == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: const BorderRadius.all(LoveRadii.sm),
          border: Border(
            left: BorderSide(
              color: Colors.white.withValues(alpha: 0.5),
              width: 2,
            ),
            top: BorderSide(color: LoveColors.borderActive),
            right: BorderSide(color: LoveColors.borderActive),
            bottom: BorderSide(color: LoveColors.borderActive),
          ),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.schedule_rounded,
              size: 16,
              color: LoveColors.textSecondary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Следующее сообщение уйдёт капсулой — откроется '
                '${_formatCapsuleDate(at)}. Напиши текст и отправь.',
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.35,
                  color: LoveColors.textSecondary,
                ),
              ),
            ),
            IconButton(
              tooltip: 'Отменить капсулу',
              onPressed: () => setState(() => _capsuleAt = null),
              iconSize: 18,
              color: LoveColors.textSecondary,
              icon: const Icon(Icons.close_rounded),
            ),
          ],
        ),
      ),
    );
  }

  Widget _composerBanner() {
    final editing = _editing;
    final replyTo = _replyTo;
    final label = editing != null
        ? 'Редактирование сообщения'
        : 'Ответ для ${replyTo?.authorName ?? ''}';
    final target = editing ?? replyTo;
    final preview = target == null
        ? ''
        : target.content.trim().isNotEmpty
            ? target.content
            : target.hasMedia
                ? 'Вложение'
                : 'Сообщение';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: LoveColors.border),
        ),
        child: Row(
          children: [
            Icon(
              editing != null ? Icons.edit_rounded : Icons.reply_rounded,
              size: 16,
              color: LoveColors.textSecondary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: LoveColors.textSecondary,
                    ),
                  ),
                  if (preview.trim().isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      preview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: LoveColors.textMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            IconButton(
              tooltip: 'Отменить',
              onPressed: _cancelComposerAction,
              iconSize: 18,
              color: LoveColors.textSecondary,
              icon: const Icon(Icons.close_rounded),
            ),
          ],
        ),
      ),
    );
  }

  void _cancelComposerAction() {
    if (!mounted) return;
    setState(() {
      if (_editing != null) _message.clear();
      _editing = null;
      _replyTo = null;
    });
  }

  Future<void> _showMessageActions(ChatMessage message) async {
    final isTemp =
        message.id.startsWith('temp_') || message.id.startsWith('temp-');
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => SafeArea(
        child: Container(
          margin: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: LoveColors.surfaceStrong,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!isTemp)
                _MessageActionTile(
                  icon: Icons.reply_rounded,
                  label: 'Ответить',
                  onTap: () => Navigator.of(context).pop('reply'),
                ),
              if (message.content.trim().isNotEmpty)
                _MessageActionTile(
                  icon: Icons.copy_rounded,
                  label: 'Копировать текст',
                  onTap: () => Navigator.of(context).pop('copy'),
                ),
              if (message.isOwn && !isTemp && message.content.trim().isNotEmpty)
                _MessageActionTile(
                  icon: Icons.edit_rounded,
                  label: 'Редактировать',
                  onTap: () => Navigator.of(context).pop('edit'),
                ),
              if (message.isOwn && !isTemp)
                _MessageActionTile(
                  icon: Icons.delete_outline_rounded,
                  label: 'Удалить',
                  danger: true,
                  onTap: () => Navigator.of(context).pop('delete'),
                ),
              if (!message.isOwn && !isTemp)
                _MessageActionTile(
                  icon: Icons.flag_outlined,
                  label: 'Пожаловаться',
                  danger: true,
                  onTap: () => Navigator.of(context).pop('report'),
                ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || action == null) return;
    switch (action) {
      case 'reply':
        setState(() {
          _editing = null;
          _replyTo = message;
        });
      case 'copy':
        await Clipboard.setData(ClipboardData(text: message.content));
        _showSnack('Текст скопирован');
      case 'edit':
        setState(() {
          _replyTo = null;
          _editing = message;
          _message.text = message.content;
          _message.selection = TextSelection.collapsed(
            offset: message.content.length,
          );
        });
      case 'delete':
        await _deleteMessage(message);
      case 'report':
        final sent = await MessageReportFlow.open(
          context,
          api: widget.api,
          message: message,
        );
        if (sent == true) _showSnack('Жалоба отправлена команде модерации');
    }
  }

  Future<void> _deleteMessage(ChatMessage message) async {
    try {
      widget.socket.kick();
      if (widget.socket.isConnected) {
        widget.socket.emit('message:delete', {'messageId': message.id});
      } else {
        await widget.api.deleteMessage(message.id);
      }
      if (!mounted) return;
      setState(() {
        _messages.removeWhere((item) => item.id == message.id);
        if (_editing?.id == message.id) {
          _editing = null;
          _message.clear();
        }
        if (_replyTo?.id == message.id) _replyTo = null;
      });
    } catch (error) {
      _showSnack(error.toString());
    }
  }

  Future<void> _applyEdit(ChatMessage editing, String content) async {
    try {
      widget.socket.kick();
      if (widget.socket.isConnected) {
        widget.socket.emit('message:edit', {
          'messageId': editing.id,
          'content': content,
        });
      } else {
        await widget.api.editMessage(editing.id, content);
      }
      if (!mounted) return;
      setState(() {
        final index = _messages.indexWhere((item) => item.id == editing.id);
        if (index != -1) {
          _messages[index] =
              _messages[index].copyWith(content: content, edited: true);
        }
        _editing = null;
        _message.clear();
      });
    } catch (error) {
      _showSnack(error.toString());
    }
  }

  Future _load() async {
    setState(() {
      _loading = true;
      _slowLoad = false;
      _error = null;
    });
    Future.delayed(const Duration(seconds: 4), () {
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

  /// Догружает то, что ещё не улетело в Cloudinary, и приводит к payload,
  /// который ждёт сервер.
  Future<List<Map<String, dynamic>>> _uploadPending(
    List<_PendingAttachment> pending,
  ) async {
    final attachments = <Map<String, dynamic>>[];
    for (final item in pending) {
      final uploaded = item.uploaded ??
          await widget.api
              .uploadAttachment(item.path, mimeType: item.mimeType);
      attachments.add({
        'type': item.typeFromUpload(uploaded),
        'url': asText(uploaded['url']),
        'filename': asText(uploaded['filename'], item.name),
        'originalName': asText(uploaded['originalName'], item.name),
        'size': int.tryParse(asText(uploaded['size'])) ?? item.size,
        'mimetype': asText(uploaded['mimetype'], item.mimeType),
      });
    }
    return attachments;
  }

  Future _send() async {
    final text = _message.text.trim();
    final editing = _editing;
    if (editing != null) {
      if (text.isEmpty) return;
      await _applyEdit(editing, text);
      return;
    }

    final channelId = _activeChannelId;
    final replyTo = _replyTo;
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
    final capsuleAt = _capsuleAt;
    final tempId = 'temp_${DateTime.now().microsecondsSinceEpoch}';

    // Капсулу в ленту не добавляем: до срока её нет ни у кого, включая
    // автора. Иначе пузырь висел бы до перезапуска и выглядел отправленным.
    if (capsuleAt != null) {
      setState(() {
        _sending = true;
        _message.clear();
        _pendingAttachments.clear();
        _replyTo = null;
      });
      try {
        final attachments = await _uploadPending(pendingAttachments);
        widget.socket.kick();
        if (widget.socket.isConnected) {
          widget.socket.emit('message:send', {
            'channelId': channelId,
            'content': text,
            'attachments': attachments,
            'tempId': tempId,
            'deliverAt': capsuleAt.toUtc().toIso8601String(),
            if (replyTo != null &&
                !replyTo.id.startsWith('temp_') &&
                !replyTo.id.startsWith('temp-'))
              'replyTo': replyTo.id,
          });
          // Снимет взвод и покажет подтверждение по 'capsule:scheduled'.
          return;
        }
        if (attachments.isNotEmpty) {
          throw const FormatException(
              'Нет realtime-соединения для отправки файла');
        }
        await widget.api.sendMessage(
          channelId,
          text,
          deliverAt: capsuleAt,
          replyTo: replyTo != null &&
                  !replyTo.id.startsWith('temp_') &&
                  !replyTo.id.startsWith('temp-')
              ? replyTo.id
              : null,
        );
        if (!mounted) return;
        setState(() => _capsuleAt = null);
        _showSnack('Капсула запланирована');
      } catch (error) {
        if (!mounted) return;
        setState(() {
          _message.text = text;
          _pendingAttachments
            ..clear()
            ..addAll(pendingAttachments);
          _replyTo = replyTo;
        });
        _showSnack(error.toString());
      } finally {
        if (mounted) setState(() => _sending = false);
      }
      return;
    }

    setState(() {
      _sending = true;
      _message.clear();
      _pendingAttachments.clear();
      _replyTo = null;
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
          replyToId: replyTo?.id ?? '',
          replyToAuthor: replyTo?.authorName ?? '',
          replyToContent: replyTo?.content ?? '',
        ),
      );
    });
    _scrollToEnd();

    try {
      final attachments = await _uploadPending(pendingAttachments);
      widget.socket.kick();
      if (widget.socket.isConnected) {
        widget.socket.emit('message:send', {
          'channelId': channelId,
          'content': text,
          'attachments': attachments,
          'tempId': tempId,
          if (replyTo != null &&
              !replyTo.id.startsWith('temp_') &&
              !replyTo.id.startsWith('temp-'))
            'replyTo': replyTo.id,
        });
      } else {
        if (attachments.isEmpty) {
          await widget.api.sendMessage(
            channelId,
            text,
            replyTo: replyTo != null &&
                    !replyTo.id.startsWith('temp_') &&
                    !replyTo.id.startsWith('temp-')
                ? replyTo.id
                : null,
          );
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
        _replyTo = replyTo;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future _pickAttachment() async {
    try {
      final picked = await ChatNativeFiles.pickFile();
      if (picked == null || !mounted) return;
      final pending = _PendingAttachment.file(picked)..uploading = true;
      setState(() {
        _pendingAttachments.add(pending);
      });
      final uploaded = await widget.api
          .uploadAttachment(pending.path, mimeType: pending.mimeType);
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

  Future _toggleVoiceRecording() async {
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
          final uploaded = await widget.api
              .uploadAttachment(pending.path, mimeType: pending.mimeType);
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

  Future _showEmojiSheet() async {
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
    final emoji = await showModalBottomSheet(
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
      selection:
          TextSelection.collapsed(offset: (start + emoji.length).toInt()),
    );
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  String _formatCapsuleDate(DateTime at) {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    final local = at.toLocal();
    final time = '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
    final date = '${local.day} ${months[local.month - 1]}';
    final now = DateTime.now();
    if (local.year != now.year) return '$date ${local.year}, $time';
    return '$date, $time';
  }

  Future<void> _openCapsuleSheet() async {
    final picked = await CapsuleSheet.open(
      context,
      api: widget.api,
      armed: _capsuleAt,
    );
    if (!mounted || picked == null) return;
    setState(() {
      // Капсула и редактирование несовместимы: правка уходит другим событием.
      _editing = null;
      _capsuleAt = picked.clear ? null : picked.deliverAt;
    });
  }

  /// Сервер подтвердил капсулу. Оптимистичный пузырь для неё не рисуем
  /// (сообщения ещё нет в ленте), поэтому просто снимаем взвод.
  void _handleCapsuleScheduled(dynamic data) {
    if (!mounted) return;
    if (data is Map && asId(data['channelId']).isNotEmpty) {
      if (asId(data['channelId']) != _activeChannelId) return;
    }
    setState(() {
      _capsuleAt = null;
      _sending = false;
    });
    _showSnack('Капсула запланирована');
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

  void _handleMessageEdited(dynamic data) {
    if (data is! Map) return;
    final raw = data.cast<String, dynamic>();
    final message = raw['message'];
    if (message is! Map) return;
    if (_eventChannelId(raw, message) != _activeChannelId) return;
    final updated = ChatMessage.fromJson(
      message.cast<String, dynamic>(),
      currentUserId: _currentUserId,
    );
    final index = _messages.indexWhere((item) => item.id == updated.id);
    if (index == -1) return;
    setState(() => _messages[index] = updated);
  }

  void _handleMessageDeleted(dynamic data) {
    if (data is! Map) return;
    final raw = data.cast<String, dynamic>();
    final channelId = asId(raw['channelId']);
    if (channelId.isNotEmpty && channelId != _activeChannelId) return;
    final messageId = asId(raw['messageId']);
    if (messageId.isEmpty) return;
    setState(() => _messages.removeWhere((item) => item.id == messageId));
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
    this.onTitleTap,
    this.actions = const [],
  });

  final String title;
  final String subtitle;
  final String? avatarUrl;
  final VoidCallback? onTitleTap;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: LoveColors.border)),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).maybePop(),
            color: LoveColors.textSecondary,
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 19),
          ),
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: onTitleTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 4,
                  vertical: 6,
                ),
                child: Row(
                  children: [
                    LoveAvatar(label: title, imageUrl: avatarUrl, size: 38),
                    const SizedBox(width: 10),
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
                              fontWeight: FontWeight.w900,
                              color: LoveColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: LoveColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          ...actions,
          const SizedBox(width: 4),
        ],
      ),
    );
  }
}

class LoveActionButton extends StatelessWidget {
  const LoveActionButton({
    required this.icon,
    required this.tooltip,
    this.onPressed,
    super.key,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Tooltip(
        message: tooltip,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onPressed,
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: LoveColors.border),
            ),
            child: Icon(
              icon,
              size: 18,
              color: onPressed == null
                  ? LoveColors.textMuted
                  : LoveColors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}

class _MessageBubble extends StatefulWidget {
  const _MessageBubble({
    required this.message,
    required this.api,
    this.grouped = false,
    this.replyAuthor = '',
    this.replyContent = '',
    this.onLongPress,
    this.onAuthorTap,
  });

  final ChatMessage message;
  final LoveApi api;
  final bool grouped;
  final String replyAuthor;
  final String replyContent;
  final VoidCallback? onLongPress;
  final VoidCallback? onAuthorTap;

  @override
  State<_MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<_MessageBubble> {
  @override
  Widget build(BuildContext context) {
    final message = widget.message;
    final compact = LovePrefs.instance.compactMode.value;
    final inviteCode = InviteCard.inviteCodeOf(message.content);
    final displayText = inviteCode == null
        ? message.content
        : InviteCard.stripInviteLink(message.content);
    final hasText = displayText.trim().isNotEmpty;
    final hasMedia = inviteCode != null || message.attachments.isNotEmpty;

    // Картинка, видео и карточка приглашения — сами по себе непрозрачные
    // карточки. Пузырь вокруг них добавлял вторую рамку и лишний фон, из-за
    // чего сообщение с файлом выглядело криво. Аудио и файловые чипы
    // полупрозрачные — им подложка пузыря нужна, иначе не читаются.
    final bare = hasMedia &&
        !hasText &&
        message.replyToId.isEmpty &&
        message.attachments
            .every((item) => item.isImage || (!item.isVoice && item.isVideo));

    final timeText = Text(
      '${_formatTime(message.createdAt)}${message.edited ? ' · изм.' : ''}',
      style: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: bare
            ? LoveColors.textMuted
            : (message.isOwn
                    ? LoveColors.bubbleOwnText
                    : LoveColors.bubblePartnerText)
                .withValues(alpha: 0.5),
      ),
    );

    final bubbleCore = ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * 0.76,
      ),
      child: Container(
        padding: bare
            ? EdgeInsets.zero
            : EdgeInsets.symmetric(
                horizontal: compact ? 10 : 12,
                vertical: compact ? 5 : 7,
              ),
        decoration: bare
            ? null
            : BoxDecoration(
                color: message.isOwn
                    ? LoveColors.bubbleOwn
                    : LoveColors.bubblePartner,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(message.isOwn ? 16 : 5),
                  bottomRight: Radius.circular(message.isOwn ? 5 : 16),
                ),
                border: message.isOwn
                    ? null
                    : Border.all(color: LoveColors.border),
              ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.replyToId.isNotEmpty)
              _ReplyPreview(
                author: widget.replyAuthor,
                content: widget.replyContent,
                own: message.isOwn,
              ),
            if (hasText)
              _ExpandableMessageText(
                text: displayText,
                color: message.isOwn
                    ? LoveColors.bubbleOwnText
                    : LoveColors.bubblePartnerText,
                trailing: hasMedia ? null : timeText,
              ),
            if (inviteCode != null)
              InviteCard(api: widget.api, code: inviteCode),
            for (final attachment in message.attachments)
              AttachmentView(attachment: attachment, own: message.isOwn),
            if (hasMedia || !hasText) ...[
              const SizedBox(height: 2),
              Align(alignment: Alignment.bottomRight, child: timeText),
            ],
          ],
        ),
      ),
    );

    final bubble = GestureDetector(
      onLongPress: widget.onLongPress,
      child: bubbleCore,
    );

    return Padding(
      padding: EdgeInsets.only(
        top: widget.grouped ? 3 : (compact ? 8 : 12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment:
            message.isOwn ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!message.isOwn) ...[
            if (widget.grouped)
              const SizedBox(width: 34)
            else
              GestureDetector(
                onTap: widget.onAuthorTap,
                child: LoveAvatar(
                  label: message.authorName,
                  imageUrl: message.authorAvatar,
                  size: 28,
                ),
              ),
            const SizedBox(width: 6),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: message.isOwn
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                if (!message.isOwn && !widget.grouped)
                  Padding(
                    padding: const EdgeInsets.only(left: 6, bottom: 3),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: GestureDetector(
                            onTap: widget.onAuthorTap,
                            child: Text(
                              message.authorName,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                color: LoveColors.textMuted,
                              ),
                            ),
                          ),
                        ),
                        if (staffRoleLabel(message.authorRole).isNotEmpty) ...[
                          const SizedBox(width: 5),
                          StaffRoleIcon(role: message.authorRole, size: 25),
                        ],
                      ],
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

/// Quoted message preview inside a bubble (reply).
class _ReplyPreview extends StatelessWidget {
  const _ReplyPreview({
    required this.author,
    required this.content,
    required this.own,
  });

  final String author;
  final String content;
  final bool own;

  @override
  Widget build(BuildContext context) {
    final base = own ? Colors.black : Colors.white;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Container(
          color: base.withValues(alpha: 0.07),
          child: IntrinsicHeight(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(width: 3, color: base.withValues(alpha: 0.45)),
                Flexible(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 5,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          author.isEmpty ? 'Сообщение' : author,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            color: base.withValues(alpha: 0.75),
                          ),
                        ),
                        if (content.trim().isNotEmpty) ...[
                          const SizedBox(height: 1),
                          Text(
                            content,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: base.withValues(alpha: 0.6),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MessageActionTile extends StatelessWidget {
  const _MessageActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? LoveColors.danger : LoveColors.textPrimary;
    return ListTile(
      onTap: onTap,
      leading: Icon(
        icon,
        size: 20,
        color: danger ? LoveColors.danger : LoveColors.textSecondary,
      ),
      title: Text(
        label,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
      dense: true,
      visualDensity: VisualDensity.compact,
    );
  }
}

/// Long message text with collapse/expand («Показать полностью»).
class _ExpandableMessageText extends StatefulWidget {
  const _ExpandableMessageText({
    required this.text,
    required this.color,
    this.trailing,
  });

  final String text;
  final Color color;

  /// Optional widget (timestamp) rendered inline at the end of the last line.
  final Widget? trailing;

  static const collapseChars = 280;
  static const collapseLines = 7;

  @override
  State<_ExpandableMessageText> createState() => _ExpandableMessageTextState();
}

class _ExpandableMessageTextState extends State<_ExpandableMessageText> {
  bool _expanded = false;

  bool get _isLong =>
      widget.text.length > _ExpandableMessageText.collapseChars ||
      '\n'.allMatches(widget.text).length >=
          _ExpandableMessageText.collapseLines;

  @override
  Widget build(BuildContext context) {
    final text = _wrapLongRuns(widget.text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text.rich(
          TextSpan(
            text: text,
            children: [
              if (widget.trailing != null)
                WidgetSpan(
                  alignment: PlaceholderAlignment.bottom,
                  child: Padding(
                    padding: const EdgeInsets.only(left: 7),
                    child: widget.trailing!,
                  ),
                ),
            ],
          ),
          maxLines: !_isLong || _expanded
              ? null
              : _ExpandableMessageText.collapseLines,
          overflow: !_isLong || _expanded
              ? TextOverflow.visible
              : TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 14.5,
            height: 1.35,
            color: widget.color,
          ),
        ),
        if (_isLong)
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _expanded ? 'Свернуть' : 'Показать полностью',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  color: widget.color.withValues(alpha: 0.65),
                ),
              ),
            ),
          ),
      ],
    );
  }

  /// Inserts zero-width breaks into very long unbroken runs so they wrap
  /// instead of overflowing the bubble.
  String _wrapLongRuns(String value) {
    return value.replaceAllMapped(
      RegExp(r'\S{24}'),
      (match) => '${match.group(0)}\u200B',
    );
  }
}

class _PendingAttachment {
  _PendingAttachment({
    required this.path,
    required this.name,
    required this.type,
    required this.mimeType,
    required this.size,
    this.isVoice = false,
  });

  factory _PendingAttachment.file(PickedChatFile picked) {
    return _PendingAttachment(
      path: picked.path,
      name: picked.name,
      type: picked.isImage
          ? 'image'
          : picked.isAudio
              ? 'audio'
              : 'file',
      mimeType: picked.mimeType,
      size: picked.size,
    );
  }

  factory _PendingAttachment.voice(RecordedVoiceMessage recorded) {
    return _PendingAttachment(
      path: recorded.path,
      name: recorded.name,
      type: 'audio',
      mimeType: recorded.mimeType,
      size: recorded.size,
      isVoice: true,
    );
  }

  final String path;
  final String name;
  final String type;
  final String mimeType;
  final int size;
  final bool isVoice;

  bool uploading = false;
  Map<String, dynamic>? uploaded;

  String typeFromUpload(Map<String, dynamic> upload) {
    final mime = asText(upload['mimetype'], mimeType);
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    return type;
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.recordingVoice,
    required this.editing,
    required this.attachments,
    required this.capsuleAt,
    required this.onAttach,
    required this.onRemoveAttachment,
    required this.onEmoji,
    required this.onCapsule,
    required this.onVoice,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final bool recordingVoice;
  final bool editing;
  final List<_PendingAttachment> attachments;

  /// Срок капсулы, если она взведена. null — обычная отправка.
  final DateTime? capsuleAt;
  final VoidCallback onAttach;
  final void Function(int index) onRemoveAttachment;
  final VoidCallback onEmoji;
  final VoidCallback onCapsule;
  final VoidCallback onVoice;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (attachments.isNotEmpty)
              _AttachmentPreviewStrip(
                attachments: attachments,
                onRemove: onRemoveAttachment,
              ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: LoveColors.borderActive),
              ),
              // Кнопок в строке пять, и с дефолтными 48dp полю ввода
              // почти не остаётся места на узком экране.
              child: IconButtonTheme(
                data: IconButtonThemeData(
                  style: IconButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(40, 40),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
                child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  IconButton(
                    tooltip: 'Прикрепить файл',
                    onPressed: editing ? null : onAttach,
                    color: LoveColors.textSecondary,
                    icon: const Icon(Icons.add_rounded, size: 22),
                  ),
                  IconButton(
                    tooltip: 'Эмодзи',
                    onPressed: onEmoji,
                    color: LoveColors.textSecondary,
                    icon: const Icon(
                      Icons.emoji_emotions_outlined,
                      size: 20,
                    ),
                  ),
                  if (!editing)
                    IconButton(
                      tooltip: 'Капсула времени',
                      onPressed: onCapsule,
                      color: capsuleAt != null
                          ? Colors.white
                          : LoveColors.textSecondary,
                      icon: Icon(
                        capsuleAt != null
                            ? Icons.schedule_rounded
                            : Icons.schedule_outlined,
                        size: 20,
                      ),
                    ),
                  Expanded(
                    child: TextField(
                      controller: controller,
                      minLines: 1,
                      maxLines: 5,
                      textAlignVertical: TextAlignVertical.center,
                      textInputAction: TextInputAction.newline,
                      cursorColor: LoveColors.textPrimary,
                      style: const TextStyle(
                        color: LoveColors.textPrimary,
                        fontSize: 14.5,
                      ),
                      decoration: InputDecoration(
                        hintText: recordingVoice
                            ? 'Идёт запись голосового...'
                            : editing
                                ? 'Изменить сообщение...'
                                : 'Написать...',
                        hintStyle: const TextStyle(
                          color: LoveColors.textMuted,
                          fontSize: 14,
                        ),
                        // Рамку и фон рисует Container вокруг всей строки.
                        // Без явного сброса тема подставляет свои границы
                        // и заливку, и получается «окно внутри окна».
                        filled: false,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        errorBorder: InputBorder.none,
                        focusedErrorBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 12,
                        ),
                      ),
                    ),
                  ),
                  if (!editing)
                    IconButton(
                      tooltip: recordingVoice
                          ? 'Остановить запись'
                          : 'Голосовое сообщение',
                      onPressed: onVoice,
                      color: recordingVoice
                          ? LoveColors.danger
                          : LoveColors.textSecondary,
                      icon: Icon(
                        recordingVoice
                            ? Icons.stop_circle_outlined
                            : Icons.mic_none_rounded,
                        size: 21,
                      ),
                    ),
                  IconButton(
                    tooltip: editing ? 'Сохранить' : 'Отправить',
                    onPressed: sending ? null : onSend,
                    color: Colors.white,
                    icon: sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            editing ? Icons.check_rounded : Icons.send_rounded,
                            size: 20,
                          ),
                  ),
                ],
                ),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: SizedBox(
        height: 44,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: attachments.length,
          separatorBuilder: (context, index) => const SizedBox(width: 8),
          itemBuilder: (context, index) => _PendingAttachmentTile(
            attachment: attachments[index],
            onRemove: () => onRemove(index),
          ),
        ),
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: LoveColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            attachment.isVoice
                ? Icons.mic_rounded
                : attachment.type == 'image'
                    ? Icons.image_outlined
                    : Icons.attach_file_rounded,
            size: 16,
            color: LoveColors.textSecondary,
          ),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 120),
            child: Text(
              attachment.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: LoveColors.textPrimary,
              ),
            ),
          ),
          const SizedBox(width: 4),
          if (attachment.uploading)
            const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            InkWell(
              onTap: onRemove,
              child: const Icon(
                Icons.close_rounded,
                size: 16,
                color: LoveColors.textMuted,
              ),
            ),
        ],
      ),
    );
  }
}
