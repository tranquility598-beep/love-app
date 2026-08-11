import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

import 'core/network/love_api.dart';
import 'core/calls/call_center.dart';
import 'core/prefs/love_prefs.dart';
import 'features/auth/auth_screen.dart';
import 'features/servers/invite_prompt.dart';
import 'features/shell/main_shell.dart';
import 'features/support/restricted_access_screen.dart';
import 'session/app_session.dart';
import 'theme/love_theme.dart';

class LoveMobileApp extends StatefulWidget {
  const LoveMobileApp({super.key});

  @override
  State<LoveMobileApp> createState() => _LoveMobileAppState();
}

class _LoveMobileAppState extends State<LoveMobileApp> {
  late final AppSession session;
  late final AppLinks _appLinks;
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<Uri>? _linkSubscription;

  /// Код из ссылки, пришедшей до входа: вступать некуда, пока нет аккаунта,
  /// поэтому держим его до логина, а не выбрасываем.
  String? _pendingInvite;
  bool _invitePromptOpen = false;

  @override
  void initState() {
    super.initState();
    session = AppSession()..restore();
    session.addListener(_onSessionChanged);
    _appLinks = AppLinks();
    _linkSubscription = _appLinks.uriLinkStream.listen(_handleIncomingLink);
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleIncomingLink(uri);
    });
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    session.removeListener(_onSessionChanged);
    session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppSessionScope(
      session: session,
      child: MaterialApp(
        title: 'Love',
        navigatorKey: CallCenter.navigatorKey,
        scaffoldMessengerKey: _messengerKey,
        debugShowCheckedModeBanner: false,
        theme: LoveTheme.dark(),
        builder: (context, child) {
          // Apply the user's "Масштаб интерфейса" setting globally, matching
          // the desktop app's root font-size scaling.
          return ValueListenableBuilder<double>(
            valueListenable: LovePrefs.instance.uiScale,
            builder: (context, scale, _) {
              final media = MediaQuery.of(context);
              return MediaQuery(
                data: media.copyWith(
                  textScaler: TextScaler.linear(scale),
                ),
                child: child ?? const SizedBox.shrink(),
              );
            },
          );
        },
        home: AnimatedBuilder(
          animation: session,
          builder: (context, _) {
            if (session.isBooting) {
              return const _BootScreen();
            }
            if (!session.isAuthenticated) {
              return const AuthScreen();
            }
            if (session.isRestricted) {
              return const RestrictedAccessScreen();
            }
            return const MainShell();
          },
        ),
      ),
    );
  }

  Future<void> _handleIncomingLink(Uri uri) async {
    if (uri.scheme != 'love-app') return;
    if (uri.host == 'invite') {
      await _handleInviteLink(uri);
      return;
    }
    if (uri.host != 'login-success') return;
    final token = uri.queryParameters['token'];
    if (token == null || token.isEmpty) {
      _showSnack('Google не вернул токен входа');
      return;
    }
    try {
      await session.completeExternalAuth(token);
      _showSnack('Вход через Google выполнен');
    } catch (error) {
      _showSnack(error.toString());
    }
  }

  Future<void> _handleInviteLink(Uri uri) async {
    final code = uri.pathSegments.isEmpty ? '' : uri.pathSegments.first.trim();
    if (code.isEmpty) {
      _showSnack('Код приглашения не найден');
      return;
    }
    await _openInvite(code);
  }

  /// Показать приглашение.
  ///
  /// Молча вступать нельзя: тап по ссылке в чужом чате не должен добавлять
  /// человека в сферу без вопроса. Поэтому только открываем превью, а решение
  /// принимает пользователь.
  Future<void> _openInvite(String code) async {
    if (session.isRestricted) {
      _pendingInvite = null;
      _showSnack('Аккаунт ограничен — приглашение недоступно');
      return;
    }

    // Холодный старт: ссылка приходит раньше, чем восстановлена сессия.
    // Придержим код и добьём его из _onSessionChanged.
    final navigatorContext = CallCenter.navigatorKey.currentContext;
    if (session.isBooting || !session.isAuthenticated ||
        navigatorContext == null) {
      _pendingInvite = code;
      if (!session.isBooting && !session.isAuthenticated) {
        _showSnack('Войдите в аккаунт — приглашение откроется сразу после входа');
      }
      return;
    }

    // Две ссылки подряд (или повторный uriLinkStream) не должны открывать
    // два листа друг на друге.
    if (_invitePromptOpen) return;
    _invitePromptOpen = true;
    try {
      final joined = await showInvitePrompt(
        context: navigatorContext,
        api: LoveApi(),
        code: code,
      );
      if (joined != null) _showSnack('Вы вступили в «$joined»');
    } finally {
      _invitePromptOpen = false;
    }
  }

  void _onSessionChanged() {
    final code = _pendingInvite;
    if (code == null) return;
    if (session.isBooting || !session.isAuthenticated) return;
    _pendingInvite = null;
    // Дерево на этом кадре ещё перестраивается под вход — лист открываем после.
    WidgetsBinding.instance.addPostFrameCallback((_) => _openInvite(code));
  }

  void _showSnack(String message) {
    _messengerKey.currentState?.showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}

class _BootScreen extends StatelessWidget {
  const _BootScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(
            center: Alignment.topCenter,
            radius: 1.2,
            colors: [Color(0xFF101010), Color(0xFF050505), Colors.black],
          ),
        ),
        child: Center(
          child: SizedBox(
            width: 42,
            height: 42,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
    );
  }
}
