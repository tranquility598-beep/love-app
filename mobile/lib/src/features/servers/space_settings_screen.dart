import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/invite_links.dart';
import '../../core/network/love_api.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../widgets/love_surface.dart';
import '../../widgets/space_banner.dart';
import '../chat/chat_models.dart';
import '../shell/screen_frame.dart';

enum _SpaceSettingsSection { overview, members, invite, danger }

class SpaceSettingsScreen extends StatefulWidget {
  const SpaceSettingsScreen({
    required this.spaceId,
    required this.api,
    this.initialSpace,
    super.key,
  });

  final String spaceId;
  final LoveApi api;
  final Map<String, dynamic>? initialSpace;

  @override
  State<SpaceSettingsScreen> createState() => _SpaceSettingsScreenState();
}

class _SpaceSettingsScreenState extends State<SpaceSettingsScreen> {
  late Future<Map<String, dynamic>> _future;
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _vibeStatus = TextEditingController();
  final _color = TextEditingController();
  final _inviteController = TextEditingController();

  _SpaceSettingsSection _section = _SpaceSettingsSection.overview;
  String? _loadedId;
  String? _inviteLink;
  bool _busy = false;
  bool _changed = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = widget.api.server(widget.spaceId);
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _vibeStatus.dispose();
    _color.dispose();
    _inviteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        body: LoveBackground(
          child: ScreenFrame(
            title: 'Настройки',
            leading: IconButton(
              tooltip: 'Назад',
              onPressed: () => Navigator.of(context).pop(_changed),
              icon: const Icon(Icons.arrow_back_rounded),
            ),
            child: AsyncValueView<Map<String, dynamic>>(
              future: _future,
              onRetry: _reload,
              builder: (context, space) {
                _hydrate(space);
                final isRoom = _isRoom(space);
                final isOwner = _isOwner(context, space);
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    _SpaceHeaderCard(space: space, isRoom: isRoom),
                    const SizedBox(height: 14),
                    _SettingsNav(
                      value: _section,
                      onChanged: (value) => setState(() {
                        _section = value;
                        _error = null;
                      }),
                    ),
                    const SizedBox(height: 14),
                    switch (_section) {
                      _SpaceSettingsSection.overview => _overview(
                          space: space,
                          isRoom: isRoom,
                          isOwner: isOwner,
                        ),
                      _SpaceSettingsSection.members => _members(space),
                      _SpaceSettingsSection.invite => _inviteSection(space),
                      _SpaceSettingsSection.danger => _danger(
                          space: space,
                          isOwner: isOwner,
                        ),
                    },
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _overview({
    required Map<String, dynamic> space,
    required bool isRoom,
    required bool isOwner,
  }) {
    final hasIcon = asText(space['icon']).isNotEmpty;
    final hasBanner = asText(space['banner']).isNotEmpty;
    return _SettingsCard(
      title: isRoom ? 'Обзор комнаты' : 'Обзор сферы',
      subtitle: isOwner
          ? 'Название, описание и обложки сохраняются в общей базе.'
          : 'У вас нет прав на изменение этого пространства.',
      child: Column(
        children: [
          TextField(
            controller: _name,
            enabled: isOwner && !_busy,
            maxLength: 100,
            decoration: const InputDecoration(
              labelText: 'Название',
              prefixIcon: Icon(Icons.badge_outlined),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            enabled: isOwner && !_busy,
            maxLength: 500,
            minLines: 3,
            maxLines: 5,
            decoration: const InputDecoration(
              labelText: 'Описание',
              prefixIcon: Icon(Icons.notes_rounded),
            ),
          ),
          if (isRoom) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _vibeStatus,
              enabled: isOwner && !_busy,
              maxLength: 60,
              decoration: const InputDecoration(
                labelText: 'Вайб комнаты',
                prefixIcon: Icon(Icons.bolt_outlined),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _color,
              enabled: isOwner && !_busy,
              decoration: const InputDecoration(
                labelText: 'Цвет комнаты',
                hintText: '#ffffff',
                prefixIcon: Icon(Icons.palette_outlined),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed:
                      isOwner && !_busy ? () => _pickImage('icon') : null,
                  icon: const Icon(Icons.image_outlined),
                  label: const Text('Иконка'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed:
                      isOwner && !_busy ? () => _pickImage('banner') : null,
                  icon: const Icon(Icons.panorama_outlined),
                  label: const Text('Баннер'),
                ),
              ),
            ],
          ),
          if (isOwner && (hasIcon || hasBanner)) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                if (hasIcon)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : () => _removeImage('icon'),
                      icon: const Icon(Icons.hide_image_outlined),
                      label: const Text('Убрать иконку'),
                    ),
                  ),
                if (hasIcon && hasBanner) const SizedBox(width: 10),
                if (hasBanner)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : () => _removeImage('banner'),
                      icon: const Icon(Icons.image_not_supported_outlined),
                      label: const Text('Убрать баннер'),
                    ),
                  ),
              ],
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: const TextStyle(color: LoveColors.textPrimary),
            ),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: isOwner && !_busy ? () => _saveOverview(isRoom) : null,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.black,
                    ),
                  )
                : const Icon(Icons.check_rounded),
            label: const Text('Сохранить'),
          ),
        ],
      ),
    );
  }

  Widget _members(Map<String, dynamic> space) {
    final members = _mapList(space['members']);
    return _SettingsCard(
      title: 'Участники',
      subtitle: '${members.length} человек в пространстве.',
      child: Column(
        children: [
          if (members.isEmpty)
            const Text(
              'Список участников пуст.',
              style: TextStyle(color: LoveColors.textMuted),
            )
          else
            for (final member in members) ...[
              _MemberTile(
                member: member,
                ownerId: asId(space['owner']),
              ),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }

  Widget _inviteSection(Map<String, dynamic> space) {
    return _SettingsCard(
      title: 'Приглашение',
      subtitle: 'Создать новую ссылку или скопировать текущую.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            readOnly: true,
            controller: _inviteController,
            decoration: const InputDecoration(
              labelText: 'Ссылка',
              prefixIcon: Icon(Icons.link_rounded),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _createInvite,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Обновить'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: (_inviteLink ?? '').isEmpty ? null : _copyInvite,
                  icon: const Icon(Icons.copy_rounded),
                  label: const Text('Копировать'),
                ),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: const TextStyle(color: LoveColors.textPrimary),
            ),
          ],
        ],
      ),
    );
  }

  Widget _danger({
    required Map<String, dynamic> space,
    required bool isOwner,
  }) {
    final isRoom = _isRoom(space);
    return _SettingsCard(
      title: 'Опасная зона',
      subtitle: isOwner
          ? 'Владелец может удалить пространство полностью.'
          : 'Можно выйти из пространства на этом аккаунте.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!isOwner)
            OutlinedButton.icon(
              onPressed: _busy ? null : _leave,
              icon: const Icon(Icons.logout_rounded),
              label: Text(isRoom ? 'Выйти из комнаты' : 'Выйти из сферы'),
            ),
          if (isOwner)
            FilledButton.icon(
              onPressed: _busy ? null : _delete,
              style: FilledButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
              ),
              icon: const Icon(Icons.delete_outline_rounded),
              label: Text(isRoom ? 'Удалить комнату' : 'Удалить сферу'),
            ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: const TextStyle(color: LoveColors.textPrimary),
            ),
          ],
        ],
      ),
    );
  }

  void _reload() {
    setState(() {
      _future = widget.api.server(widget.spaceId);
      _loadedId = null;
    });
  }

  void _hydrate(Map<String, dynamic> space) {
    final id = asId(space['_id']);
    if (id.isEmpty || id == _loadedId) return;
    final settings = space['settings'] is Map
        ? (space['settings'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    _loadedId = id;
    _name.text = asText(space['name']);
    _description.text = asText(space['description']);
    _vibeStatus.text = asText(settings['vibeStatus']);
    _color.text = asText(settings['color']);
    final invites = space['invites'];
    if (invites is List && invites.isNotEmpty && invites.first is Map) {
      final code = asText((invites.first as Map)['code']);
      if (code.isNotEmpty) _inviteLink = _inviteUrl(code);
      _inviteController.text = _inviteLink ?? '';
    }
  }

  Future<void> _saveOverview(bool isRoom) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.updateServer(widget.spaceId, {
        'name': _name.text.trim(),
        'description': _description.text.trim(),
        if (isRoom) 'vibeStatus': _vibeStatus.text.trim(),
        if (isRoom) 'color': _color.text.trim(),
      });
      _changed = true;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Настройки сохранены')),
      );
      _reload();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickImage(String kind) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        imageQuality: 82,
        maxWidth: kind == 'icon' ? 640 : 1600,
        maxHeight: kind == 'icon' ? 640 : 900,
      );
      if (picked == null) return;
      if (kind == 'icon') {
        await widget.api.uploadServerIcon(
          widget.spaceId,
          picked.path,
          mimeType: picked.mimeType,
        );
      } else {
        await widget.api.uploadServerBanner(
          widget.spaceId,
          picked.path,
          mimeType: picked.mimeType,
        );
      }
      _changed = true;
      _reload();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _removeImage(String kind) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (kind == 'icon') {
        await widget.api.deleteServerIcon(widget.spaceId);
      } else {
        await widget.api.deleteServerBanner(widget.spaceId);
      }
      _changed = true;
      _reload();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createInvite() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = await widget.api.createInvite(widget.spaceId);
      // Ссылка от сервера приоритетнее: условие было перевёрнуто и при
      // непустом коде подставляло мёртвый `loveapp.chat/invite/...`.
      final link = InviteLinks.fromResponse(
        asText(response['inviteUrl']),
        asText(response['inviteCode']),
      );
      setState(() {
        _inviteLink = link;
        _inviteController.text = link;
      });
      await _copyInvite();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copyInvite() async {
    final link = _inviteLink;
    if (link == null || link.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: link));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Ссылка скопирована: $link')),
    );
  }

  Future<void> _leave() async {
    final confirmed = await _confirm(
      title: 'Выйти?',
      message: 'Пространство исчезнет из списка на этом аккаунте.',
      action: 'Выйти',
    );
    if (confirmed != true) return;
    await _dangerAction(() => widget.api.leaveServer(widget.spaceId));
  }

  Future<void> _delete() async {
    final confirmed = await _confirm(
      title: 'Удалить?',
      message: 'Это действие нельзя отменить.',
      action: 'Удалить',
    );
    if (confirmed != true) return;
    await _dangerAction(() => widget.api.deleteServer(widget.spaceId));
  }

  Future<void> _dangerAction(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      _changed = true;
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool?> _confirm({
    required String title,
    required String message,
    required String action,
  }) {
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(action),
          ),
        ],
      ),
    );
  }
}

class _SpaceHeaderCard extends StatelessWidget {
  const _SpaceHeaderCard({
    required this.space,
    required this.isRoom,
  });

  final Map<String, dynamic> space;
  final bool isRoom;

  @override
  Widget build(BuildContext context) {
    final name = asText(space['name'], isRoom ? 'Комната' : 'Сфера');
    final banner = asText(space['banner']);
    return LoveSurface(
      padding: const EdgeInsets.all(16),
      radius: 18,
      color: LoveColors.surfaceStrong,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (banner.isNotEmpty) ...[
            SpaceBanner(url: banner, height: 110),
            const SizedBox(height: 12),
          ],
          Row(
            children: [
              LoveAvatar(
                label: name,
                imageUrl: asText(space['icon']),
                icon: isRoom ? Icons.grid_view_rounded : Icons.public_rounded,
                size: 58,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${isRoom ? 'Комната' : 'Сфера'} · ${_memberCount(space)} участников',
                      style: const TextStyle(color: LoveColors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettingsNav extends StatelessWidget {
  const _SettingsNav({
    required this.value,
    required this.onChanged,
  });

  final _SpaceSettingsSection value;
  final ValueChanged<_SpaceSettingsSection> onChanged;

  @override
  Widget build(BuildContext context) {
    return LoveSurface(
      padding: const EdgeInsets.all(4),
      radius: 14,
      color: Colors.white.withValues(alpha: 0.035),
      child: Row(
        children: [
          _NavButton(
            icon: Icons.tune_rounded,
            label: 'Обзор',
            selected: value == _SpaceSettingsSection.overview,
            onTap: () => onChanged(_SpaceSettingsSection.overview),
          ),
          _NavButton(
            icon: Icons.people_outline_rounded,
            label: 'Люди',
            selected: value == _SpaceSettingsSection.members,
            onTap: () => onChanged(_SpaceSettingsSection.members),
          ),
          _NavButton(
            icon: Icons.link_rounded,
            label: 'Инвайт',
            selected: value == _SpaceSettingsSection.invite,
            onTap: () => onChanged(_SpaceSettingsSection.invite),
          ),
          _NavButton(
            icon: Icons.warning_amber_rounded,
            label: 'Еще',
            selected: value == _SpaceSettingsSection.danger,
            onTap: () => onChanged(_SpaceSettingsSection.danger),
          ),
        ],
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
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
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: selected ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icon,
                  size: 18,
                  color: selected ? Colors.black : LoveColors.textSecondary,
                ),
                const SizedBox(height: 3),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: selected ? Colors.black : LoveColors.textSecondary,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
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

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LoveSurface(
      padding: const EdgeInsets.all(16),
      radius: 18,
      color: LoveColors.surfaceStrong,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(color: LoveColors.textMuted, height: 1.35),
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({
    required this.member,
    required this.ownerId,
  });

  final Map<String, dynamic> member;
  final String ownerId;

  @override
  Widget build(BuildContext context) {
    final user = member['user'] is Map
        ? (member['user'] as Map).cast<String, dynamic>()
        : member;
    final name = userDisplayName(user);
    final isOwner = asId(user['_id']) == ownerId;
    return LoveSurface(
      padding: const EdgeInsets.all(12),
      radius: 14,
      color: Colors.white.withValues(alpha: 0.035),
      child: Row(
        children: [
          LoveAvatar(
            label: name,
            imageUrl: asText(user['avatar']),
            status: asText(user['status']),
            size: 38,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
          if (isOwner)
            const Text(
              'владелец',
              style: TextStyle(
                color: LoveColors.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
        ],
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

bool _isOwner(BuildContext context, Map<String, dynamic> space) {
  final currentUserId = AppSessionScope.of(context).user?.id ?? '';
  return currentUserId.isNotEmpty && asId(space['owner']) == currentUserId;
}

int _memberCount(Map<String, dynamic> space) {
  final members = space['members'];
  if (members is List) return members.length;
  return int.tryParse(asText(space['memberCount'])) ?? 0;
}

List<Map<String, dynamic>> _mapList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .toList();
}

String _inviteUrl(String code) => InviteLinks.webUrl(code);
