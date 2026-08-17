import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/network/love_api.dart';
import '../../core/realtime/love_socket.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../widgets/love_surface.dart';
import '../../widgets/space_banner.dart';
import '../chat/chat_models.dart';
import '../chat/chat_screen.dart';
import 'space_settings_screen.dart';
import 'voice_channel_panel.dart';

enum _RoomTab { chat, voice, media }

class RoomScreen extends StatefulWidget {
  const RoomScreen({
    required this.space,
    required this.api,
    required this.socket,
    super.key,
  });

  final Map<String, dynamic> space;
  final LoveApi api;
  final LoveSocket socket;

  @override
  State<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends State<RoomScreen> {
  late Future<Map<String, dynamic>> _future;
  _RoomTab _tab = _RoomTab.chat;

  @override
  void initState() {
    super.initState();
    _future = widget.api.server(asId(widget.space['_id']));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LoveBackground(
        child: SafeArea(
          bottom: false,
          child: AsyncValueView<Map<String, dynamic>>(
            future: _future,
            onRetry: _reload,
            builder: (context, space) {
              final name = asText(space['name'], 'Комната');
              final channels = _mapList(space['channels']);
              final textChannel = _firstChannel(channels, 'text');
              final voiceChannel = _firstChannel(channels, 'voice');
              return Column(
                children: [
                  _RoomHeader(
                    space: space,
                    onBack: () => Navigator.of(context).pop(),
                    onSettings: () => _openSettings(space),
                  ),
                  _RoomTabs(
                    value: _tab,
                    onChanged: (value) => setState(() => _tab = value),
                  ),
                  Expanded(
                    child: switch (_tab) {
                      _RoomTab.chat => textChannel == null
                          ? const EmptyState(
                              icon: Icons.tag_rounded,
                              title: 'Чат не создан',
                              message: 'У комнаты нет текстового канала.',
                            )
                          : ChatScreen(
                              key: ValueKey(
                                  'room-chat-${asId(textChannel['_id'])}'),
                              title: name,
                              channelId: asId(textChannel['_id']),
                              serverId: asId(space['_id']),
                              api: widget.api,
                              socket: widget.socket,
                              embedded: true,
                              showHeader: false,
                            ),
                      _RoomTab.voice => ChannelVoicePanel(
                          title: name,
                          channel: voiceChannel,
                          socket: widget.socket,
                        ),
                      _RoomTab.media => textChannel == null
                          ? const EmptyState(
                              icon: Icons.perm_media_outlined,
                              title: 'Медиа нет',
                              message: 'Файлы появятся после сообщений в чате.',
                            )
                          : _RoomMediaTab(
                              key: ValueKey(
                                  'room-media-${asId(textChannel['_id'])}'),
                              channelId: asId(textChannel['_id']),
                              api: widget.api,
                            ),
                    },
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  void _reload() {
    setState(() {
      _future = widget.api.server(asId(widget.space['_id']));
    });
  }

  Future<void> _openSettings(Map<String, dynamic> space) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => SpaceSettingsScreen(
          spaceId: asId(space['_id']),
          initialSpace: space,
          api: widget.api,
        ),
      ),
    );
    if (changed == true && mounted) _reload();
  }
}

class _RoomHeader extends StatelessWidget {
  const _RoomHeader({
    required this.space,
    required this.onBack,
    required this.onSettings,
  });

  final Map<String, dynamic> space;
  final VoidCallback onBack;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final name = asText(space['name'], 'Комната');
    final description = asText(space['description']);
    final settings = space['settings'] is Map
        ? (space['settings'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    final vibe = asText(settings['vibeStatus']);
    final banner = asText(space['banner']);
    return Container(
      decoration: BoxDecoration(
        color: context.palette.sinkA(0.22),
        border:  Border(bottom: BorderSide(color: context.palette.border)),
      ),
      child: Column(
        children: [
          if (banner.isNotEmpty)
            SpaceBanner(url: banner, height: 120, radius: 0),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 10),
            child: Row(
              children: [
                IconButton(
                  tooltip: 'Назад',
                  onPressed: onBack,
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
                LoveAvatar(
                  label: name,
                  imageUrl: asText(space['icon']),
                  icon: Icons.grid_view_rounded,
                  size: 42,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        vibe.isNotEmpty
                            ? vibe
                            : description.isNotEmpty
                                ? description
                                : '${_memberCount(space)} участников',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:  TextStyle(
                          color: context.palette.textMuted,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Настройки комнаты',
                  onPressed: onSettings,
                  icon: const Icon(Icons.tune_rounded),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RoomTabs extends StatelessWidget {
  const _RoomTabs({
    required this.value,
    required this.onChanged,
  });

  final _RoomTab value;
  final ValueChanged<_RoomTab> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      child: LoveSurface(
        padding: const EdgeInsets.all(4),
        radius: 14,
        color: context.palette.inkA(0.035),
        child: Row(
          children: [
            _RoomTabButton(
              icon: Icons.chat_bubble_outline_rounded,
              label: 'Чат',
              selected: value == _RoomTab.chat,
              onTap: () => onChanged(_RoomTab.chat),
            ),
            _RoomTabButton(
              icon: Icons.graphic_eq_rounded,
              label: 'Войс',
              selected: value == _RoomTab.voice,
              onTap: () => onChanged(_RoomTab.voice),
            ),
            _RoomTabButton(
              icon: Icons.folder_open_rounded,
              label: 'Медиа',
              selected: value == _RoomTab.media,
              onTap: () => onChanged(_RoomTab.media),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoomTabButton extends StatelessWidget {
  const _RoomTabButton({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? context.palette.accent : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 17,
                  color: selected ? context.palette.onAccent : context.palette.textSecondary,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: selected ? context.palette.onAccent : context.palette.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
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

class _RoomMediaTab extends StatefulWidget {
  const _RoomMediaTab({
    required this.channelId,
    required this.api,
    super.key,
  });

  final String channelId;
  final LoveApi api;

  @override
  State<_RoomMediaTab> createState() => _RoomMediaTabState();
}

class _RoomMediaTabState extends State<_RoomMediaTab> {
  Future<List<ChatMessage>>? _future;
  String _currentUserId = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        setState(() => _future = _load());
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _currentUserId = AppSessionScope.of(context).user?.id ?? '';
  }

  @override
  void didUpdateWidget(covariant _RoomMediaTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.channelId != widget.channelId) {
      _future = _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final future = _future;
    if (future == null) {
      return const Center(child: CircularProgressIndicator(strokeWidth: 2));
    }
    return AsyncValueView<List<ChatMessage>>(
      future: future,
      onRetry: () => setState(() => _future = _load()),
      builder: (context, messages) {
        final items = <_MediaItem>[];
        for (final message in messages) {
          for (final attachment in message.attachments) {
            if (attachment.type == 'image' && !attachment.isVoice) continue;
            items.add(_MediaItem(message: message, attachment: attachment));
          }
        }
        if (items.isEmpty) {
          return const EmptyState(
            icon: Icons.folder_open_rounded,
            title: 'Медиа пока нет',
            message: 'Здесь будут файлы и голосовые сообщения комнаты.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          itemCount: items.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (context, index) => _MediaTile(item: items[index]),
        );
      },
    );
  }

  Future<List<ChatMessage>> _load() async {
    final raw = await widget.api.messages(widget.channelId, limit: 100);
    return raw
        .map(
            (item) => ChatMessage.fromJson(item, currentUserId: _currentUserId))
        .where((message) => message.attachments.isNotEmpty)
        .toList();
  }
}

class _MediaItem {
  const _MediaItem({
    required this.message,
    required this.attachment,
  });

  final ChatMessage message;
  final ChatAttachment attachment;
}

class _MediaTile extends StatelessWidget {
  const _MediaTile({required this.item});

  final _MediaItem item;

  @override
  Widget build(BuildContext context) {
    final attachment = item.attachment;
    final url = AppConfig.mediaUrl(attachment.url) ?? '';
    return LoveSurface(
      padding: EdgeInsets.zero,
      radius: 14,
      color: context.palette.surfaceStrong,
      child: Material(
        type: MaterialType.transparency,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          onTap: url.isEmpty ? null : () => launchUrl(Uri.parse(url)),
          leading: Icon(
            attachment.isVoice
                ? Icons.graphic_eq_rounded
                : Icons.insert_drive_file_outlined,
          ),
          title: Text(
            attachment.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          subtitle: Text(
            '${item.message.authorName} · ${_formatDate(item.message.createdAt)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style:  TextStyle(color: context.palette.textMuted),
          ),
          trailing: const Icon(Icons.open_in_new_rounded, size: 18),
        ),
      ),
    );
  }
}

Map<String, dynamic>? _firstChannel(
  List<Map<String, dynamic>> channels,
  String type,
) {
  for (final channel in channels) {
    if (asText(channel['type']) == type) return channel;
  }
  return null;
}

List<Map<String, dynamic>> _mapList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .toList();
}

int _memberCount(Map<String, dynamic> space) {
  final members = space['members'];
  if (members is List) return members.length;
  return int.tryParse(asText(space['memberCount'])) ?? 0;
}

String _formatDate(DateTime value) {
  final local = value.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day.$month $hour:$minute';
}
