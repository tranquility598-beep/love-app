import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../core/notifications/in_app_notifications.dart';
import '../../core/notifications/local_notifications.dart';
import '../../core/realtime/love_socket.dart';
import '../../core/realtime/app_events.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/fade_indexed_stack.dart';
import '../../widgets/love_background.dart';
import '../../core/prefs/love_prefs.dart';
import '../../core/updates/app_updater.dart';
import '../../core/calls/call_center.dart';
import '../../core/voice/channel_voice_controller.dart';
import '../../widgets/call_pill.dart';
import '../../widgets/love_nav_icons.dart';
import '../chat/chat_models.dart';
import '../auth/auth_repository.dart';
import '../chat/chat_screen.dart';
import '../friends/friends_screen.dart';
import '../home/conversations_screen.dart';
import '../more/more_screen.dart';
import '../notifications/notifications_screen.dart';
import '../servers/servers_screen.dart';
import '../support/support_center_screen.dart';

/// Height of the bottom bar chrome (excluding the safe-area inset).
const double kBottomNavHeight = 60;

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  final _api = LoveApi();
  final _socket = LoveSocket();
  final _events = AppEvents.instance;

  int _index = 0;
  AppLifecycleState _lifecycle = AppLifecycleState.resumed;

  bool get _foreground => _lifecycle == AppLifecycleState.resumed;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    LocalNotifications.init();
    LocalNotifications.onTap = _onNotificationTap;
    LocalNotifications.onAction = CallCenter.instance.handleNotificationAction;
    CallCenter.instance.init(_socket);
    CallPill.mount();
    ChannelVoiceController.instance.init(_socket);
    _socket.connect(
      onConnect: () {},
      onError: (_) {},
    );
    _attachNotificationHandlers();
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) AppUpdater.checkForUpdates(context);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    CallCenter.instance.foreground = state == AppLifecycleState.resumed;
    _lifecycle = state;
    if (state == AppLifecycleState.resumed) {
      _socket.ensureConnected();
      Future<void>.delayed(const Duration(seconds: 4), () {
        if (_lifecycle == AppLifecycleState.resumed) {
          _socket.ensureConnected();
        }
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _socket.off('dm:new_message', _onDmMessage);
    _socket.off('notification:mention', _onMention);
    _socket.off('friend:request_received', _onFriendRequest);
    _socket.off('friend:request_accepted', _onFriendAccepted);
    _socket.off('admin:announcement', _onAnnouncement);
    _socket.off('notification:new', _onNotificationNew);
    _socket.off('support:updated', _onSupportUpdated);
    _socket.off('moderation:updated', _onModerationUpdated);
    _socket.off('moderation:restricted', _onModerationRestricted);
    _socket.off('community:devlog:update', _onDevLogUpdated);
    _socket.disconnect();
    super.dispose();
  }

  void _onNotificationTap(String? payload) {
    switch (payload) {
      case 'chats':
        if (mounted) setState(() => _index = 0);
      case 'friends':
        if (mounted) setState(() => _index = 2);
      case 'notifications':
        if (mounted) setState(() => _index = 3);
      default:
        if (payload != null && payload.startsWith('case:')) {
          _openSupport(payload.substring(5));
        }
    }
  }

  /// Route an event to an in-app banner (foreground) or a system-tray
  /// notification (backgrounded but process alive).
  void _deliver({
    required String title,
    String? body,
    String? avatarLabel,
    String? avatarUrl,
    IconData? icon,
    VoidCallback? onTap,
    String? payload,
    String? conversationId,
  }) {
    if (_foreground) {
      InAppNotifications.show(
        title: title,
        body: body,
        avatarLabel: avatarLabel,
        avatarUrl: avatarUrl,
        icon: icon,
        onTap: onTap,
      );
    } else {
      if (!LovePrefs.instance.getBool(K.notifPush, true)) return;
      if (conversationId != null) {
        LocalNotifications.showMessage(
          conversationId: conversationId,
          sender: title,
          text: body ?? 'Новое сообщение',
          payload: payload,
        );
      } else {
        LocalNotifications.show(title: title, body: body, payload: payload);
      }
    }
  }

  void _attachNotificationHandlers() {
    _socket.on('dm:new_message', _onDmMessage);
    _socket.on('notification:mention', _onMention);
    _socket.on('friend:request_received', _onFriendRequest);
    _socket.on('friend:request_accepted', _onFriendAccepted);
    _socket.on('admin:announcement', _onAnnouncement);
    _socket.on('notification:new', _onNotificationNew);
    _socket.on('support:updated', _onSupportUpdated);
    _socket.on('moderation:updated', _onModerationUpdated);
    _socket.on('moderation:restricted', _onModerationRestricted);
    _socket.on('community:devlog:update', _onDevLogUpdated);
  }

  Map<String, dynamic> _map(Object? value) =>
      value is Map ? value.cast<String, dynamic>() : const {};

  void _onDmMessage(dynamic data) {
    final payload = _map(data);
    final conversationId = asId(payload['conversationId']);
    if (conversationId.isEmpty) return;
    if (_foreground && conversationId == ActiveChat.conversationId) {
      return;
    }
    if (!LovePrefs.instance.getBool(K.notifMessages, true)) return;
    final message = _map(payload['message']);
    final author = _map(message['author']);
    final name = userDisplayName(author.isEmpty ? null : author);
    final content = asText(message['content'], 'Новое сообщение');
    _deliver(
      conversationId: conversationId,
      title: name,
      body: content,
      avatarLabel: name,
      avatarUrl: asText(author['avatar']),
      payload: 'chats',
      onTap: () => _openDm(
        conversationId: conversationId,
        channelId: asId(message['channel']),
        peer: author,
      ),
    );
  }

  void _onMention(dynamic data) {
    if (!LovePrefs.instance.getBool(K.notifMentions, true)) return;
    final payload = _map(data);
    final from = asText(payload['from'], 'Кто-то');
    _deliver(
      title: '$from упомянул вас',
      body: asText(payload['content']),
      icon: Icons.alternate_email_rounded,
      payload: 'notifications',
      onTap: () => setState(() => _index = 3),
    );
  }

  void _onFriendRequest(dynamic data) {
    final from = _map(_map(data)['from']);
    final name = userDisplayName(from.isEmpty ? null : from);
    _deliver(
      title: 'Заявка в друзья',
      body: '$name хочет добавить вас',
      avatarLabel: name,
      avatarUrl: asText(from['avatar']),
      payload: 'friends',
      onTap: () => setState(() => _index = 2),
    );
  }

  void _onFriendAccepted(dynamic data) {
    final by = _map(_map(data)['by']);
    final name = userDisplayName(by.isEmpty ? null : by);
    _deliver(
      title: 'Заявка принята',
      body: '$name теперь ваш друг',
      avatarLabel: name,
      avatarUrl: asText(by['avatar']),
      payload: 'friends',
      onTap: () => setState(() => _index = 2),
    );
  }

  void _onAnnouncement(dynamic data) {
    final payload = _map(data);
    if (asText(payload['type']) == 'silent') return;
    if (!LovePrefs.instance.getBool(K.notifHub, true)) return;
    _deliver(
      title: asText(payload['title'], 'Объявление'),
      body: asText(payload['content']),
      icon: Icons.campaign_outlined,
      payload: 'notifications',
    );
  }

  void _onNotificationNew(dynamic data) {
    final payload = _map(data);
    if (payload.isEmpty) return;
    _events.addNotification(payload);
    final caseId = asId(payload['caseId']);
    if (caseId.isNotEmpty) return;
    final preview = asText(payload['preview'], 'Новое уведомление');
    _deliver(
      title: asText(payload['actorName'], 'Love'),
      body: preview,
      icon: Icons.notifications_none_rounded,
      payload: 'notifications',
      onTap: () => setState(() => _index = 3),
    );
  }

  void _onSupportUpdated(dynamic data) {
    final payload = _map(data);
    final caseId = asId(payload['caseId']);
    _events.supportChanged(caseId: caseId, payload: payload);
    if (caseId.isEmpty || _events.activeCaseId == caseId) return;
    final title = asText(payload['title'], 'Ответ от команды Love');
    final preview =
        asText(payload['preview'], 'В обращении появилось новое сообщение');
    _deliver(
      title: 'Вам ответил сотрудник Love',
      body: '$title · $preview',
      icon: Icons.support_agent_rounded,
      payload: 'case:$caseId',
      onTap: () => _openSupport(caseId),
    );
  }

  void _onModerationUpdated(dynamic data) {
    _events.moderationChanged();
    final payload = _map(data);
    final type = asText(payload['type']);
    if (type == 'ban' || type == 'deactivate' || asBool(payload['revoked'])) {
      unawaited(AppSessionScope.of(context).refreshRestriction());
    }
  }

  void _onModerationRestricted(dynamic data) {
    final payload = _map(data);
    if (payload.isEmpty) return;
    AppSessionScope.of(context).applyRestriction(
      AccountRestriction.fromJson(payload),
    );
    _events.moderationChanged();
  }

  void _onDevLogUpdated(dynamic data) {
    _events.devLogChanged(_map(data));
  }

  void _openSupport(String caseId) {
    final navigator = InAppNotifications.navigatorKey.currentState;
    if (navigator == null) return;
    navigator.push(
      MaterialPageRoute(
        builder: (_) => SupportCenterScreen(
          api: _api,
          events: _events,
          initialCaseId: caseId.isEmpty ? null : caseId,
        ),
      ),
    );
  }

  void _openDm({
    required String conversationId,
    required String channelId,
    required Map<String, dynamic> peer,
  }) {
    final navigator = InAppNotifications.navigatorKey.currentState;
    if (navigator == null) return;
    navigator.push(
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          title: userDisplayName(peer.isEmpty ? null : peer),
          conversationId: conversationId,
          channelId: channelId.isEmpty ? null : channelId,
          peerId: asId(peer['_id']),
          peerAvatar: asText(peer['avatar']),
          api: _api,
          socket: _socket,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      ConversationsScreen(api: _api, socket: _socket),
      ServersScreen(api: _api, socket: _socket),
      FriendsScreen(api: _api, socket: _socket),
      NotificationsScreen(
        api: _api,
        events: _events,
        onOpenCase: _openSupport,
      ),
      const MoreScreen(),
    ];

    return Scaffold(
      body: LoveBackground(
        child: Column(
          children: [
            Expanded(
              child: FadeIndexedStack(
                index: _index,
                children: pages,
              ),
            ),
            _BottomLoveNav(
              index: _index,
              onChanged: (value) => setState(() => _index = value),
            ),
          ],
        ),
      ),
    );
  }
}

/// Flat, full-width bottom navigation bar (web `.global-sidebar` @ mobile).
/// height 60 (+ safe-area), radius 0, border-top only, solid `rgba(10,10,10,.95)`,
/// icon-only, active tab morphs its highlight circle→rounded-square with a glow.
class _BottomLoveNav extends StatelessWidget {
  const _BottomLoveNav({
    required this.index,
    required this.onChanged,
  });

  final int index;
  final ValueChanged<int> onChanged;

  static const _items = <_NavSpec>[
    _NavSpec(active: LoveNavGlyph.heart, inactive: LoveNavGlyph.bubble),
    _NavSpec(active: LoveNavGlyph.layers, inactive: LoveNavGlyph.layers),
    _NavSpec(active: LoveNavGlyph.users, inactive: LoveNavGlyph.users),
    _NavSpec(active: LoveNavGlyph.bell, inactive: LoveNavGlyph.bell),
    _NavSpec(active: LoveNavGlyph.menu, inactive: LoveNavGlyph.menu),
  ];

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    return Container(
      height: kBottomNavHeight + bottomInset,
      padding: EdgeInsets.only(bottom: bottomInset, left: 16, right: 16),
      decoration: const BoxDecoration(
        color:
            LoveColors.glass, // solid rgba(10,10,10,0.95) — no BackdropFilter
        border: Border(
          top: BorderSide(color: Color(0x14FFFFFF)), // rgba(255,255,255,0.08)
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0x66000000), // 0 -8px 32px rgba(0,0,0,0.4)
            blurRadius: 32,
            offset: Offset(0, -8),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          for (var i = 0; i < _items.length; i++)
            _NavButton(
              glyph: index == i ? _items[i].active : _items[i].inactive,
              filled: index == i && _items[i].active == LoveNavGlyph.heart,
              active: index == i,
              onTap: () => onChanged(i),
            ),
        ],
      ),
    );
  }
}

class _NavSpec {
  const _NavSpec({required this.active, required this.inactive});
  final LoveNavGlyph active;
  final LoveNavGlyph inactive;
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.glyph,
    required this.filled,
    required this.active,
    required this.onTap,
  });

  final LoveNavGlyph glyph;
  final bool filled;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: active
              ? Colors.white.withValues(alpha: 0.08)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(active ? 12 : 22),
        ),
        child: Center(
          child: LoveNavIcon(
            glyph: glyph,
            filled: filled,
            glow: active,
            color: active ? Colors.white : LoveColors.textSecondary,
            size: 24,
          ),
        ),
      ),
    );
  }
}
