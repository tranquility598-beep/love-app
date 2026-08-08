import 'package:flutter/material.dart';

import '../features/auth/auth_repository.dart';

class AppSession extends ChangeNotifier {
  AppSession({AuthRepository? authRepository})
      : authRepository = authRepository ?? AuthRepository();

  final AuthRepository authRepository;

  AuthUser? user;
  AccountRestriction? restriction;
  bool isBooting = true;
  bool isBusy = false;
  String? error;

  bool get isAuthenticated => user != null;
  bool get isRestricted => user != null && restriction != null;

  Future<void> restore() async {
    isBooting = true;
    notifyListeners();
    final restored = await authRepository.restoreSession();
    user ??= restored?.user;
    restriction ??= restored?.restriction;
    isBooting = false;
    notifyListeners();
  }

  Future<AuthResult> login(String email, String password) async {
    return _runAuth(() => authRepository.login(email, password));
  }

  Future<AuthResult> register({
    required String username,
    required String email,
    required String password,
  }) {
    return _runAuth(
      () => authRepository.register(
        username: username,
        email: email,
        password: password,
      ),
    );
  }

  Future<AuthResult> verifyOtp(String email, String code) {
    return _runAuth(() => authRepository.verifyOtp(email, code));
  }

  Future<AuthResult> verifyTwoFactor(String pendingToken, String code) {
    return _runAuth(() => authRepository.verifyTwoFactor(pendingToken, code));
  }

  Future<AuthResult> completeExternalAuth(String token) {
    return _runAuth(() => authRepository.completeExternalAuth(token));
  }

  Future<String> forgotPassword(String email) async {
    isBusy = true;
    error = null;
    notifyListeners();
    try {
      return await authRepository.forgotPassword(email);
    } catch (e) {
      error = e.toString();
      rethrow;
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }

  void updateUser(AuthUser nextUser) {
    user = nextUser;
    notifyListeners();
  }

  Future<void> refreshRestriction() async {
    final wasRestricted = restriction != null;
    final result = await authRepository.restrictionState();
    if (result == null) {
      restriction = null;
      if (wasRestricted) {
        await authRepository.logout();
        user = null;
      }
    } else {
      user = result.user ?? user;
      restriction = result.restriction;
    }
    notifyListeners();
  }

  void applyRestriction(AccountRestriction nextRestriction) {
    restriction = nextRestriction;
    notifyListeners();
  }

  void updateUserFromJson(Map<String, dynamic> json) {
    updateUser(AuthUser.fromJson(json));
  }

  Future<void> logout() async {
    isBusy = true;
    notifyListeners();
    await authRepository.logout();
    user = null;
    restriction = null;
    isBusy = false;
    notifyListeners();
  }

  Future<AuthResult> _runAuth(Future<AuthResult> Function() action) async {
    isBusy = true;
    error = null;
    notifyListeners();
    try {
      final result = await action();
      if (result.type == AuthResultType.authenticated ||
          result.type == AuthResultType.restricted) {
        user = result.user;
        restriction = result.restriction;
      }
      return result;
    } catch (e) {
      error = e.toString();
      rethrow;
    } finally {
      isBusy = false;
      notifyListeners();
    }
  }
}

class AppSessionScope extends InheritedNotifier<AppSession> {
  const AppSessionScope({
    required AppSession session,
    required super.child,
    super.key,
  }) : super(notifier: session);

  static AppSession of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppSessionScope>();
    assert(scope != null, 'AppSessionScope is missing');
    return scope!.notifier!;
  }
}
