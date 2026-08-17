import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/invite_links.dart';
import '../../core/network/love_api.dart';
import '../../core/realtime/app_events.dart';
import '../../core/realtime/love_socket.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../widgets/love_pill_tabs.dart';
import '../../widgets/love_surface.dart';
import '../../widgets/space_banner.dart';
import '../chat/chat_models.dart';
import '../chat/chat_screen.dart';
import '../shell/screen_frame.dart';
import 'room_screen.dart';
import 'space_settings_screen.dart';
import 'voice_channel_panel.dart';

enum _SpaceFilter { all, spheres, rooms }

enum _SpaceAction { sphere, room, invite }

class ServersScreen extends StatefulWidget {
  const ServersScreen({
    required this.api,
    required this.socket,
    super.key,
  });

  final LoveApi api;
  final LoveSocket socket;

  @override
  State<ServersScreen> createState() => _ServersScreenState();
}

class _ServersScreenState extends State<ServersScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  _SpaceFilter _filter = _SpaceFilter.all;
  final _events = AppEvents.instance;
  late int _spacesRevision;

  @override
  void initState() {
    super.initState();
    _future = widget.api.servers();
    _spacesRevision = _events.spacesRevision;
    _events.addListener(_onAppEvents);
  }

  @override
  void dispose() {
    _events.removeListener(_onAppEvents);
    super.dispose();
  }

  /// Шина общая на всё приложение, поэтому реагируем только на смену
  /// [AppEvents.spacesRevision] — иначе список перезагружался бы на каждое
  /// входящее уведомление.
  void _onAppEvents() {
    if (_events.spacesRevision == _spacesRevision) return;
    _spacesRevision = _events.spacesRevision;
    if (mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return ScreenFrame(
      title: 'Сферы',
      trailing: IconButton(
        tooltip: 'Создать или войти',
        onPressed: _openCreateSheet,
        color: context.palette.textSecondary,
        iconSize: 22,
        icon: const Icon(Icons.add_rounded),
      ),
      child: AsyncValueView<List<Map<String, dynamic>>>(
        future: _future,
        onRetry: _reload,
        builder: (context, spaces) {
          final filtered = _filtered(spaces);
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 104),
              children: [
                _FilterBar(
                  value: _filter,
                  spaces: spaces,
                  onChanged: (value) => setState(() => _filter = value),
                ),
                const SizedBox(height: 12),
                if (spaces.isEmpty)
                  const EmptyState(
                    icon: Icons.public_rounded,
                    title: 'Пока нет сфер и комнат',
                    message:
                        'Создайте свое пространство или войдите по ссылке-приглашению.',
                  )
                else if (filtered.isEmpty)
                  EmptyState(
                    icon: _filter == _SpaceFilter.rooms
                        ? Icons.grid_view_rounded
                        : Icons.public_rounded,
                    title: _filter == _SpaceFilter.rooms
                        ? 'Комнат пока нет'
                        : 'Сфер пока нет',
                    message: 'Можно создать новое пространство через кнопку +.',
                  )
                else
                  for (final space in filtered) ...[
                    _SpaceCard(
                      space: space,
                      onOpen: () => _openSpace(space),
                      onOpenChannel: _openChannel,
                      onOpenVoice: _openVoice,
                      onOpenSettings: () => _openSettings(space),
                      onCreateInvite: () => _createInvite(space),
                    ),
                    const SizedBox(height: 12),
                  ],
              ],
            ),
          );
        },
      ),
    );
  }

  void _reload() {
    setState(() {
      _future = widget.api.servers();
    });
  }

  List<Map<String, dynamic>> _filtered(List<Map<String, dynamic>> spaces) {
    return switch (_filter) {
      _SpaceFilter.all => spaces,
      _SpaceFilter.spheres => spaces.where((item) => !_isRoom(item)).toList(),
      _SpaceFilter.rooms => spaces.where(_isRoom).toList(),
    };
  }

  void _openChannel(Map<String, dynamic> space, Map<String, dynamic> channel) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          title: '# ${asText(channel['name'], 'chat')}',
          channelId: asId(channel['_id']),
          serverId: asId(space['_id']),
          api: widget.api,
          socket: widget.socket,
        ),
      ),
    );
  }

  void _openVoice(Map<String, dynamic> space, Map<String, dynamic> channel) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _ChannelVoiceScreen(
          spaceName: asText(space['name'], 'Сфера'),
          channel: channel,
          socket: widget.socket,
        ),
      ),
    );
  }

  void _openSpace(Map<String, dynamic> space) {
    if (_isRoom(space)) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => RoomScreen(
            space: space,
            api: widget.api,
            socket: widget.socket,
          ),
        ),
      );
      return;
    }

    final textChannel = _firstTextChannel(space);
    if (textChannel != null) {
      _openChannel(space, textChannel);
    }
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
    if (changed == true) await _refresh();
  }

  Future<void> _createInvite(Map<String, dynamic> space) async {
    try {
      final response = await widget.api.createInvite(asId(space['_id']));
      // Приоритет — ссылка от сервера. Раньше условие было перевёрнуто:
      // при непустом коде подставлялась зашитая `loveapp.chat/invite/...`,
      // а такого маршрута на статике сайта нет — ссылка не открывалась.
      final link = InviteLinks.fromResponse(
        asText(response['inviteUrl']),
        asText(response['inviteCode']),
      );
      if (link.isNotEmpty) {
        await Clipboard.setData(ClipboardData(text: link));
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            link.isEmpty ? 'Инвайт создан' : 'Ссылка скопирована: $link',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    }
  }

  Future<void> _openCreateSheet() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _CreateSpaceSheet(api: widget.api),
    );
    if (changed == true) {
      await _refresh();
    }
  }

  Future<void> _refresh() async {
    final next = widget.api.servers();
    setState(() {
      _future = next;
    });
    await next;
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.value,
    required this.spaces,
    required this.onChanged,
  });

  final _SpaceFilter value;
  final List<Map<String, dynamic>> spaces;
  final ValueChanged<_SpaceFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final sphereCount = spaces.where((item) => !_isRoom(item)).length;
    final roomCount = spaces.where(_isRoom).length;
    const order = [_SpaceFilter.all, _SpaceFilter.spheres, _SpaceFilter.rooms];
    return LovePillTabs(
      padding: EdgeInsets.zero,
      selected: order.indexOf(value),
      onSelected: (index) => onChanged(order[index]),
      tabs: [
        LovePillTab('Все', count: spaces.length),
        LovePillTab('Сферы', count: sphereCount),
        LovePillTab('Комнаты', count: roomCount),
      ],
    );
  }
}

class _SpaceCard extends StatelessWidget {
  const _SpaceCard({
    required this.space,
    required this.onOpen,
    required this.onOpenChannel,
    required this.onOpenVoice,
    required this.onOpenSettings,
    required this.onCreateInvite,
  });

  final Map<String, dynamic> space;
  final VoidCallback onOpen;
  final void Function(Map<String, dynamic>, Map<String, dynamic>) onOpenChannel;
  final void Function(Map<String, dynamic>, Map<String, dynamic>) onOpenVoice;
  final VoidCallback onOpenSettings;
  final VoidCallback onCreateInvite;

  @override
  Widget build(BuildContext context) {
    final name = asText(space['name'], 'Сфера');
    final description = asText(space['description']);
    final isRoom = _isRoom(space);
    final channels = _mapList(space['channels']);
    final textChannels =
        channels.where((item) => asText(item['type']) == 'text').toList();
    final voiceChannels =
        channels.where((item) => asText(item['type']) == 'voice').toList();
    final voiceCount = voiceChannels.length;
    final memberCount = _memberCount(space);
    final banner = asText(space['banner']);

    return LoveSurface(
      padding: const EdgeInsets.all(14),
      radius: 16,
      color: context.palette.surfaceStrong,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (banner.isNotEmpty) ...[
            SizedBox(
              width: double.infinity,
              child: SpaceBanner(url: banner),
            ),
            const SizedBox(height: 12),
          ],
          Row(
            children: [
              LoveAvatar(
                label: name,
                imageUrl: asText(space['icon']),
                icon: isRoom ? Icons.grid_view_rounded : Icons.public_rounded,
                size: 50,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _KindPill(text: isRoom ? 'комната' : 'сфера'),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$memberCount участников · ${textChannels.length} чат · $voiceCount войс',
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
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: isRoom ? 'Настройки комнаты' : 'Настройки сферы',
                    onPressed: onOpenSettings,
                    icon: const Icon(Icons.tune_rounded),
                  ),
                  IconButton(
                    tooltip: 'Скопировать инвайт',
                    onPressed: onCreateInvite,
                    icon: const Icon(Icons.link_rounded),
                  ),
                ],
              ),
            ],
          ),
          if (description.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style:  TextStyle(
                color: context.palette.textSecondary,
                height: 1.35,
              ),
            ),
          ],
          const SizedBox(height: 12),
          if (isRoom)
            FilledButton.icon(
              onPressed: onOpen,
              icon: const Icon(Icons.open_in_full_rounded),
              label: const Text('Открыть комнату'),
            )
          else if (textChannels.isEmpty && voiceChannels.isEmpty)
             Text(
              'Нет доступных каналов',
              style: TextStyle(color: context.palette.textMuted),
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final channel in textChannels.take(5))
                  ActionChip(
                    avatar: const Icon(Icons.tag_rounded, size: 16),
                    label: Text(asText(channel['name'], 'chat')),
                    onPressed: () => onOpenChannel(space, channel),
                  ),
                for (final channel in voiceChannels.take(5))
                  ActionChip(
                    avatar: const Icon(Icons.graphic_eq_rounded, size: 16),
                    label: Text(asText(channel['name'], 'Голосовой')),
                    onPressed: () => onOpenVoice(space, channel),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

/// Full-screen voice channel view opened from a sphere card.
class _ChannelVoiceScreen extends StatelessWidget {
  const _ChannelVoiceScreen({
    required this.spaceName,
    required this.channel,
    required this.socket,
  });

  final String spaceName;
  final Map<String, dynamic> channel;
  final LoveSocket socket;

  @override
  Widget build(BuildContext context) {
    final channelName = asText(channel['name'], 'Голосовой');
    return Scaffold(
      body: LoveBackground(
        child: SafeArea(
          bottom: false,
          child: ScreenFrame(
            title: channelName,
            leading: IconButton(
              tooltip: 'Назад',
              onPressed: () => Navigator.of(context).maybePop(),
              icon: const Icon(Icons.arrow_back_rounded),
            ),
            child: ChannelVoicePanel(
              title: spaceName,
              channel: channel,
              socket: socket,
            ),
          ),
        ),
      ),
    );
  }
}

class _CreateSpaceSheet extends StatefulWidget {
  const _CreateSpaceSheet({required this.api});

  final LoveApi api;

  @override
  State<_CreateSpaceSheet> createState() => _CreateSpaceSheetState();
}

class _CreateSpaceSheetState extends State<_CreateSpaceSheet> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _invite = TextEditingController();

  _SpaceAction _action = _SpaceAction.sphere;
  Map<String, dynamic>? _preview;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _invite.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 0, 12, inset + 12),
      child: LoveSurface(
        radius: 22,
        color: context.palette.surfaceStrong,
        shadow: true,
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Создать',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Закрыть',
                    onPressed: _busy ? null : () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _SpaceActionGrid(
                value: _action,
                onChanged: (value) {
                  setState(() {
                    _action = value;
                    _error = null;
                    _preview = null;
                  });
                },
              ),
              const SizedBox(height: 16),
              if (_action == _SpaceAction.invite)
                _InviteFields(
                  controller: _invite,
                  preview: _preview,
                  onPreview: _previewInvite,
                  enabled: !_busy,
                )
              else ...[
                TextField(
                  controller: _name,
                  enabled: !_busy,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: 'Название',
                    hintText: _action == _SpaceAction.room
                        ? 'Комната для друзей'
                        : 'Моя новая сфера',
                    prefixIcon: Icon(
                      _action == _SpaceAction.room
                          ? Icons.grid_view_rounded
                          : Icons.public_rounded,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _description,
                  enabled: !_busy,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Описание',
                    hintText: 'Коротко о пространстве',
                    prefixIcon: Icon(Icons.notes_rounded),
                  ),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style:  TextStyle(
                    color: context.palette.textPrimary,
                    height: 1.35,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: _busy ? null : _submit,
                icon: _busy
                    ?  SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: context.palette.onAccent,
                        ),
                      )
                    : Icon(
                        _action == _SpaceAction.invite
                            ? Icons.login_rounded
                            : Icons.add_rounded,
                      ),
                label: Text(_action == _SpaceAction.invite
                    ? 'Войти по приглашению'
                    : 'Создать'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _previewInvite() async {
    final code = _parseInviteCode(_invite.text);
    if (code == null) {
      setState(() => _error = 'Вставьте ссылку или код приглашения');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final preview = await widget.api.invitePreview(code);
      if (!mounted) return;
      setState(() => _preview = preview);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    try {
      setState(() => _busy = true);
      if (_action == _SpaceAction.invite) {
        final code = _parseInviteCode(_invite.text);
        if (code == null) {
          throw const FormatException('Вставьте ссылку или код приглашения');
        }
        await widget.api.joinInvite(code);
      } else {
        final name = _name.text.trim();
        if (name.length < 2) {
          throw const FormatException('Название должно быть от 2 символов');
        }
        if (_action == _SpaceAction.room) {
          await widget.api.createRoom(
            name: name,
            description: _description.text,
          );
        } else {
          await widget.api.createServer(
            name: name,
            description: _description.text,
          );
        }
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _SpaceActionGrid extends StatelessWidget {
  const _SpaceActionGrid({
    required this.value,
    required this.onChanged,
  });

  final _SpaceAction value;
  final ValueChanged<_SpaceAction> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _SpaceActionButton(
          icon: Icons.public_rounded,
          title: 'Сфера',
          subtitle: 'каналы',
          selected: value == _SpaceAction.sphere,
          onTap: () => onChanged(_SpaceAction.sphere),
        ),
        const SizedBox(width: 8),
        _SpaceActionButton(
          icon: Icons.grid_view_rounded,
          title: 'Комната',
          subtitle: 'друзья',
          selected: value == _SpaceAction.room,
          onTap: () => onChanged(_SpaceAction.room),
        ),
        const SizedBox(width: 8),
        _SpaceActionButton(
          icon: Icons.link_rounded,
          title: 'Войти',
          subtitle: 'инвайт',
          selected: value == _SpaceAction.invite,
          onTap: () => onChanged(_SpaceAction.invite),
        ),
      ],
    );
  }
}

class _SpaceActionButton extends StatelessWidget {
  const _SpaceActionButton({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            height: 92,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: selected
                  ? context.palette.inkA(0.11)
                  : context.palette.inkA(0.035),
              border: Border.all(
                color: selected ? context.palette.borderActive : context.palette.border,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 24),
                const SizedBox(height: 8),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:  TextStyle(
                    color: context.palette.textMuted,
                    fontSize: 11,
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

class _InviteFields extends StatelessWidget {
  const _InviteFields({
    required this.controller,
    required this.preview,
    required this.onPreview,
    required this.enabled,
  });

  final TextEditingController controller;
  final Map<String, dynamic>? preview;
  final VoidCallback onPreview;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final preview = this.preview;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          enabled: enabled,
          decoration: InputDecoration(
            labelText: 'Ссылка-приглашение',
            hintText: InviteLinks.hintUrl,
            prefixIcon: const Icon(Icons.link_rounded),
            suffixIcon: IconButton(
              tooltip: 'Проверить',
              onPressed: enabled ? onPreview : null,
              icon: const Icon(Icons.search_rounded),
            ),
          ),
          onSubmitted: (_) => enabled ? onPreview() : null,
        ),
        if (preview != null) ...[
          const SizedBox(height: 12),
          LoveSurface(
            padding: const EdgeInsets.all(12),
            radius: 14,
            color: context.palette.inkA(0.04),
            child: Row(
              children: [
                LoveAvatar(
                  label: asText(preview['name'], 'Love'),
                  imageUrl: asText(preview['icon']),
                  icon: asText(preview['kind']) == 'room'
                      ? Icons.grid_view_rounded
                      : Icons.public_rounded,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        asText(preview['name'], 'Приглашение'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${asText(preview['kind']) == 'room' ? 'Комната' : 'Сфера'} · ${asText(preview['memberCount'], '0')} участников',
                        style:  TextStyle(
                          color: context.palette.textMuted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _KindPill extends StatelessWidget {
  const _KindPill({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.palette.inkA(0.06),
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Text(
          text,
          style:  TextStyle(
            color: context.palette.textSecondary,
            fontSize: 10,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

bool _isRoom(Map<String, dynamic> space) {
  final settings = space['settings'];
  final settingsKind = settings is Map ? settings['kind'] : null;
  final kind =
      asText(space['kind'], asText(space['_kind'], asText(settingsKind)));
  return kind == 'room';
}

int _memberCount(Map<String, dynamic> space) {
  final members = space['members'];
  if (members is List) return members.length;
  final count = int.tryParse(asText(space['memberCount']));
  return count ?? 0;
}

Map<String, dynamic>? _firstTextChannel(Map<String, dynamic> space) {
  for (final channel in _mapList(space['channels'])) {
    if (asText(channel['type']) == 'text') return channel;
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

String? _parseInviteCode(String value) {
  final input = value.trim();
  if (input.isEmpty) return null;
  // Ссылку разбирает общий InviteLinks — там же поддержаны хост API
  // и dev-хост. Отдельно принимаем «голый» код: его диктуют голосом.
  final fromLink = InviteLinks.codeOf(input);
  if (fromLink != null) return fromLink.toUpperCase();
  final bare = RegExp(r'^[A-Za-z0-9-]{4,32}$').firstMatch(input);
  return bare?.group(0)?.toUpperCase();
}
