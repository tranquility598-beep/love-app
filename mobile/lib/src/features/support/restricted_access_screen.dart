import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../core/realtime/app_events.dart';
import '../../core/realtime/love_socket.dart';
import '../auth/auth_repository.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_background.dart';
import 'support_center_screen.dart';

class RestrictedAccessScreen extends StatefulWidget {
  const RestrictedAccessScreen({super.key});

  @override
  State<RestrictedAccessScreen> createState() => _RestrictedAccessScreenState();
}

class _RestrictedAccessScreenState extends State<RestrictedAccessScreen> {
  final _api = LoveApi();
  final _socket = LoveSocket();
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    _socket.on('moderation:updated', _onModerationUpdated);
    _socket.on('moderation:restricted', _onRestricted);
    _socket.on('support:updated', _onSupportUpdated);
    unawaited(_socket.connect());
    _clock = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    _socket.off('moderation:updated', _onModerationUpdated);
    _socket.off('moderation:restricted', _onRestricted);
    _socket.off('support:updated', _onSupportUpdated);
    unawaited(_socket.disconnect());
    super.dispose();
  }

  void _onModerationUpdated(dynamic _) {
    AppEvents.instance.moderationChanged();
    final session = AppSessionScope.of(context);
    unawaited(session.refreshRestriction());
  }

  void _onRestricted(dynamic data) {
    if (data is! Map) return;
    final value = data.cast<String, dynamic>();
    AppSessionScope.of(context).applyRestriction(
      AccountRestriction.fromJson(value),
    );
  }

  void _onSupportUpdated(dynamic data) {
    final payload =
        data is Map ? data.cast<String, dynamic>() : <String, dynamic>{};
    AppEvents.instance.supportChanged(
      caseId: payload['caseId']?.toString(),
      payload: payload,
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = AppSessionScope.of(context);
    final restriction = session.restriction;
    if (restriction == null) return const SizedBox.shrink();
    final isDeactivated =
        restriction.type == 'deactivated' || restriction.type == 'deactivate';
    return Scaffold(
      body: LoveBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(
                  children: [
                    Container(
                      width: 70,
                      height: 70,
                      decoration: BoxDecoration(
                        color: context.palette.danger.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                        border: Border.all(
                            color: context.palette.danger.withValues(alpha: 0.5)),
                      ),
                      child: Icon(
                        isDeactivated
                            ? Icons.person_off_outlined
                            : Icons.gpp_bad_outlined,
                        color:  context.palette.dangerText,
                        size: 32,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      isDeactivated
                          ? 'Аккаунт деактивирован'
                          : 'Доступ ограничен',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontFamily: LoveFonts.serif,
                        fontSize: 30,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                     Text(
                      'Чтение причины, поддержка и апелляция остаются доступны.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: context.palette.textSecondary, height: 1.45),
                    ),
                    const SizedBox(height: 22),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: context.palette.danger.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                            color: context.palette.danger.withValues(alpha: 0.35)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                           Text('ПРИЧИНА',
                              style: TextStyle(
                                  color: context.palette.dangerText,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w900)),
                          const SizedBox(height: 7),
                          Text(
                              restriction.reason.trim().isEmpty
                                  ? 'Причина не указана'
                                  : restriction.reason,
                              style: const TextStyle(height: 1.4)),
                          const SizedBox(height: 12),
                          Text(_term(restriction),
                              style:  TextStyle(
                                  color: context.palette.textMuted, fontSize: 12.5)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => SupportCenterScreen(
                              api: _api,
                              events: AppEvents.instance,
                              initialTab: 1,
                              restrictedMode: true,
                            ),
                          ),
                        ),
                        icon: const Icon(Icons.gavel_rounded),
                        label: const Text('Нарушения и апелляция'),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => SupportCenterScreen(
                              api: _api,
                              events: AppEvents.instance,
                              restrictedMode: true,
                            ),
                          ),
                        ),
                        icon: const Icon(Icons.support_agent_rounded),
                        label: const Text('Написать в поддержку'),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextButton.icon(
                      onPressed: session.isBusy ? null : session.logout,
                      icon: const Icon(Icons.logout_rounded),
                      label: const Text('Выйти из аккаунта'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _term(AccountRestriction restriction) {
    final expiresAt = restriction.expiresAt?.toLocal();
    if (expiresAt == null) return 'Срок: бессрочно';
    final remaining = expiresAt.difference(DateTime.now());
    if (remaining.isNegative) {
      return 'Срок ограничения завершён, обновляем состояние';
    }
    if (remaining.inDays > 0) {
      return 'Осталось: ${remaining.inDays} дн. ${remaining.inHours.remainder(24)} ч.';
    }
    if (remaining.inHours > 0) {
      return 'Осталось: ${remaining.inHours} ч. ${remaining.inMinutes.remainder(60)} мин.';
    }
    return 'Осталось: ${remaining.inMinutes.clamp(1, 59)} мин.';
  }
}
