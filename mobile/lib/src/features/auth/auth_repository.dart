import 'dart:async';

import '../../core/network/api_client.dart';
import '../../core/storage/auth_token_store.dart';
import '../../config/app_config.dart';

enum AuthResultType {
  authenticated,
  restricted,
  needsOtp,
  needsTwoFactor,
}

class AccountRestriction {
  const AccountRestriction({
    required this.type,
    required this.reason,
    this.expiresAt,
    this.actionId,
  });

  final String type;
  final String reason;
  final DateTime? expiresAt;
  final String? actionId;

  bool get isPermanent => expiresAt == null;

  factory AccountRestriction.fromJson(Map<String, dynamic> json) {
    final expiresText = json['expiresAt']?.toString() ?? '';
    return AccountRestriction(
      type: json['type']?.toString() ?? 'ban',
      reason: json['reason']?.toString() ?? '',
      expiresAt: expiresText.isEmpty ? null : DateTime.tryParse(expiresText),
      actionId: json['actionId']?.toString(),
    );
  }
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.username,
    this.email,
    this.avatar,
    this.status,
    this.nickname,
    this.role,
    this.bio,
    this.customStatus,
    this.mood,
    this.listening,
    this.musicTitle,
    this.musicUrl,
    this.badges = const [],
    this.hobbies = const [],
    this.servers = const [],
    this.friends = const [],
    this.hasPassword = false,
    this.hasGoogle = false,
    this.twoFactorEnabled = false,
    this.createdAt,
    this.lastSeen,
    this.isFounder = false,
    this.plan,
    this.planExpiresAt,
  });

  final String id;
  final String username;
  final String? email;
  final String? avatar;
  final String? status;
  final String? nickname;
  final String? role;
  final String? bio;
  final String? customStatus;
  final String? mood;
  final String? listening;
  final String? musicTitle;
  final String? musicUrl;
  final List<String> badges;
  final List<Map<String, dynamic>> hobbies;
  final List<Map<String, dynamic>> servers;
  final List<Map<String, dynamic>> friends;
  final bool hasPassword;
  final bool hasGoogle;
  final bool twoFactorEnabled;
  final DateTime? createdAt;
  final DateTime? lastSeen;
  final bool isFounder;

  /// Тариф: free | pro | premium | duo. Сервер отдаёт его только для своего
  /// аккаунта. planExpiresAt == null — бессрочно.
  final String? plan;
  final DateTime? planExpiresAt;

  String get initials => username.isEmpty ? '?' : username[0].toUpperCase();
  String get displayName =>
      (nickname != null && nickname!.trim().isNotEmpty) ? nickname! : username;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    final music = json['music'] is Map
        ? (json['music'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    return AuthUser(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      username:
          (json['username'] ?? json['nickname'] ?? 'Love user').toString(),
      email: json['email']?.toString(),
      avatar: json['avatar']?.toString(),
      status: json['status']?.toString(),
      nickname: json['nickname']?.toString(),
      role: json['role']?.toString(),
      bio: json['bio']?.toString(),
      customStatus: json['customStatus']?.toString(),
      mood: json['mood']?.toString(),
      listening: json['listening']?.toString(),
      musicTitle: music['title']?.toString(),
      musicUrl: music['url']?.toString(),
      badges: _stringList(json['badges']),
      hobbies: _mapList(json['hobbies']),
      servers: _mapList(json['servers']),
      friends: _mapList(json['friends']),
      hasPassword: json['hasPassword'] == true,
      hasGoogle: json['hasGoogle'] == true,
      twoFactorEnabled: json['twoFactorEnabled'] == true,
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
      lastSeen: DateTime.tryParse(json['lastSeen']?.toString() ?? ''),
      isFounder: json['isFounder'] == true,
      plan: json['plan']?.toString(),
      planExpiresAt: DateTime.tryParse(json['planExpiresAt']?.toString() ?? ''),
    );
  }

  static List<String> _stringList(Object? value) {
    if (value is! List) return const [];
    return value.map((item) => item.toString()).toList();
  }

  static List<Map<String, dynamic>> _mapList(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
  }
}

class AuthResult {
  const AuthResult._({
    required this.type,
    this.user,
    this.email,
    this.pendingToken,
    this.message,
    this.restriction,
    this.registrationToken,
    this.retryAfter = 0,
    this.deliveryFailed = false,
  });

  final AuthResultType type;
  final AuthUser? user;
  final String? email;
  final String? pendingToken;
  final String? message;
  final AccountRestriction? restriction;

  /// Узкий токен сервера на смену почты неподтверждённой регистрации.
  /// Нет у Google-аккаунтов: там почту меняет Google.
  final String? registrationToken;

  /// Сколько секунд ждать до повторной отправки кода.
  final int retryAfter;

  /// Аккаунт есть, но письмо с кодом не ушло (EMAIL_SEND_FAILED).
  final bool deliveryFailed;

  factory AuthResult.authenticated(AuthUser user, {String? message}) {
    return AuthResult._(
      type: AuthResultType.authenticated,
      user: user,
      message: message,
    );
  }

  factory AuthResult.restricted(
    AuthUser user,
    AccountRestriction restriction, {
    String? message,
  }) {
    return AuthResult._(
      type: AuthResultType.restricted,
      user: user,
      restriction: restriction,
      message: message,
    );
  }

  factory AuthResult.needsOtp({
    required String email,
    String? message,
    String? registrationToken,
    int retryAfter = 0,
    bool deliveryFailed = false,
  }) {
    return AuthResult._(
      type: AuthResultType.needsOtp,
      email: email,
      message: message,
      registrationToken: registrationToken,
      retryAfter: retryAfter,
      deliveryFailed: deliveryFailed,
    );
  }

  /// Ответ сервера «нужно подтвердить почту». Приходит и как 200/201
  /// (регистрация), и как 403 (вход в неподтверждённый аккаунт), и как 503
  /// (аккаунт есть, письмо не ушло) — во всех случаях человеку нужен экран кода.
  factory AuthResult.verificationFrom(
    Map<String, dynamic> data, {
    required String fallbackEmail,
  }) {
    final email = data['email']?.toString();
    final token = data['registrationToken']?.toString();
    return AuthResult.needsOtp(
      email: (email == null || email.isEmpty) ? fallbackEmail : email,
      message: data['message']?.toString(),
      registrationToken: (token == null || token.isEmpty) ? null : token,
      retryAfter: secondsFrom(data['retryAfter']),
      deliveryFailed: data['code'] == 'EMAIL_SEND_FAILED',
    );
  }

  factory AuthResult.needsTwoFactor({
    required String email,
    required String pendingToken,
    String? message,
  }) {
    return AuthResult._(
      type: AuthResultType.needsTwoFactor,
      email: email,
      pendingToken: pendingToken,
      message: message,
    );
  }
}

int secondsFrom(Object? value) {
  final parsed =
      value is num ? value.toInt() : int.tryParse(value?.toString() ?? '');
  return parsed == null || parsed < 0 ? 0 : parsed;
}

/// Код уже принят (например, ответ на первую попытку потерялся в сети):
/// аккаунт подтверждён, осталось войти паролем.
class EmailAlreadyVerified implements Exception {
  const EmailAlreadyVerified(this.email, this.message);

  final String email;
  final String message;

  @override
  String toString() => message;
}

/// Повторная отправка кода: сколько ждать следующую.
class OtpDelivery {
  const OtpDelivery({required this.retryAfter, this.message});

  final int retryAfter;
  final String? message;
}

/// Отказ с подсказкой, через сколько секунд можно повторить (429).
class RetryLater implements Exception {
  const RetryLater(this.message, this.retryAfter);

  final String message;
  final int retryAfter;

  @override
  String toString() => message;
}

Map<String, dynamic> _dataOf(ApiException error) {
  final data = error.data;
  return data is Map<String, dynamic> ? data : const <String, dynamic>{};
}

/// Общая обработка ответов кода и почты: «уже подтверждена» и «подождите».
Never _rethrowVerificationError(ApiException error, String email) {
  final data = _dataOf(error);
  if (error.statusCode == 409 && data['code'] == 'EMAIL_ALREADY_VERIFIED') {
    throw EmailAlreadyVerified(
        data['email']?.toString() ?? email, error.message);
  }
  if (error.statusCode == 429) {
    throw RetryLater(error.message, secondsFrom(data['retryAfter']));
  }
  throw error;
}

class AuthRepository {
  AuthRepository({
    ApiClient? api,
    AuthTokenStore? tokenStore,
  })  : api = api ?? ApiClient(tokenStore: tokenStore),
        tokenStore = tokenStore ?? const AuthTokenStore();

  final ApiClient api;
  final AuthTokenStore tokenStore;

  Future<AuthResult?> restoreSession() async {
    final token = await tokenStore.readToken();
    if (token == null || token.isEmpty) return null;
    try {
      final restricted = await api.get('/auth/restriction');
      return _restrictedFromResponse(restricted);
    } on ApiException catch (error) {
      if (error.statusCode != 404) {
        if (error.statusCode == 401) await tokenStore.clear();
        if (error.statusCode == 401) return null;
      }
    }
    try {
      final response = await api.get('/auth/me');
      return AuthResult.authenticated(
        AuthUser.fromJson(response['user'] as Map<String, dynamic>),
      );
    } on ApiException catch (error) {
      if (error.statusCode == 401) await tokenStore.clear();
      return null;
    }
  }

  Future<AuthResult?> restrictionState() async {
    try {
      final response = await api.get('/auth/restriction');
      return _restrictedFromResponse(response);
    } on ApiException catch (error) {
      if (error.statusCode == 404 || error.statusCode == 401) return null;
      rethrow;
    }
  }

  Future<AuthResult> login(String email, String password) async {
    try {
      final response = await api.post(
        '/auth/login',
        body: {'email': email.trim(), 'password': password},
      );
      return _authResultFromResponse(response);
    } on ApiException catch (error) {
      // Неподтверждённая почта приходит как 403 (или 503, если письмо не
      // ушло): это не ошибка входа, а следующий шаг — экран кода.
      final data = _dataOf(error);
      if (data['requireVerification'] == true) {
        return AuthResult.verificationFrom(data, fallbackEmail: email.trim());
      }
      rethrow;
    }
  }

  Future<AuthResult> register({
    required String username,
    required String email,
    required String password,
  }) async {
    try {
      final response = await api.post(
        '/auth/register',
        body: {
          'username': username.trim(),
          'email': email.trim(),
          'password': password,
        },
      );
      return AuthResult.verificationFrom(response, fallbackEmail: email.trim());
    } on ApiException catch (error) {
      // 503 EMAIL_SEND_FAILED: аккаунт создан, письмо не ушло — всё равно
      // экран кода, где можно исправить почту или запросить код ещё раз.
      final data = _dataOf(error);
      if (data['requireVerification'] == true) {
        return AuthResult.verificationFrom(data, fallbackEmail: email.trim());
      }
      rethrow;
    }
  }

  Future<AuthResult> verifyOtp(String email, String code) async {
    try {
      final response = await api.post(
        '/auth/verify-otp',
        body: {'email': email.trim(), 'code': code.trim()},
      );
      return _authenticatedFromResponse(response);
    } on ApiException catch (error) {
      _rethrowVerificationError(error, email.trim());
    }
  }

  Future<OtpDelivery> resendOtp(String email) async {
    try {
      final response = await api.post(
        '/auth/resend-otp',
        body: {'email': email.trim()},
      );
      return OtpDelivery(
        retryAfter: secondsFrom(response['retryAfter'] ?? 60),
        message: response['message']?.toString(),
      );
    } on ApiException catch (error) {
      _rethrowVerificationError(error, email.trim());
    }
  }

  /// Исправить почту неподтверждённой регистрации: тот же аккаунт, код
  /// уходит на новый адрес. Сервер выдаёт новый registrationToken.
  Future<AuthResult> changeRegistrationEmail(
    String registrationToken,
    String email,
  ) async {
    try {
      final response = await api.post(
        '/auth/registration-email',
        body: {'registrationToken': registrationToken, 'email': email.trim()},
      );
      return AuthResult.verificationFrom(response, fallbackEmail: email.trim());
    } on ApiException catch (error) {
      final data = _dataOf(error);
      if (data['requireVerification'] == true) {
        return AuthResult.verificationFrom(data, fallbackEmail: email.trim());
      }
      _rethrowVerificationError(error, email.trim());
    }
  }

  Future<AuthResult> verifyTwoFactor(String pendingToken, String code) async {
    final response = await api.post(
      '/auth/verify-2fa',
      body: {'pendingToken': pendingToken, 'code': code.trim()},
    );
    return _authenticatedFromResponse(response);
  }

  Uri get googleAuthUri => AppConfig.apiUri('/auth/google');

  Future<AuthResult> completeExternalAuth(String token) async {
    final cleanToken = token.trim();
    if (cleanToken.isEmpty) {
      throw const ApiException('Пустой токен авторизации');
    }
    await tokenStore.saveToken(cleanToken);
    try {
      final response = await api.get('/auth/me');
      return AuthResult.authenticated(
        AuthUser.fromJson(response['user'] as Map<String, dynamic>),
        message: 'Вход через Google выполнен',
      );
    } catch (error) {
      await tokenStore.clear();
      rethrow;
    }
  }

  Future<String> forgotPassword(String email) async {
    final response = await api.post(
      '/auth/forgot-password',
      body: {'email': email.trim()},
    );
    return response['message']?.toString() ??
        'Если email существует, мы отправили письмо для сброса пароля.';
  }

  Future<String?> issueSocketToken() async {
    final response = await api.post('/auth/socket-token');
    return response['token']?.toString();
  }

  Future<void> logout() async {
    final oldToken = await tokenStore.readToken();
    await tokenStore.clear();
    if (oldToken != null && oldToken.isNotEmpty) {
      unawaited(api.revokeSession(oldToken));
    }
  }

  Future<AuthResult> _authResultFromResponse(Map<String, dynamic> response) {
    if (response['requireTwoFactor'] == true) {
      return Future.value(AuthResult.needsTwoFactor(
        email: response['email']?.toString() ?? '',
        pendingToken: response['pendingToken']?.toString() ?? '',
        message: response['message']?.toString(),
      ));
    }
    if (response['requireVerification'] == true) {
      return Future.value(
        AuthResult.verificationFrom(response, fallbackEmail: ''),
      );
    }
    return _authenticatedFromResponse(response);
  }

  Future<AuthResult> _authenticatedFromResponse(
    Map<String, dynamic> response,
  ) async {
    final token = response['token']?.toString();
    if (token != null && token.isNotEmpty) {
      await tokenStore.saveToken(token);
    }
    final user = AuthUser.fromJson(response['user'] as Map<String, dynamic>);
    if (response['accountRestricted'] == true &&
        response['restriction'] is Map) {
      return AuthResult.restricted(
        user,
        AccountRestriction.fromJson(
          (response['restriction'] as Map).cast<String, dynamic>(),
        ),
        message: response['message']?.toString(),
      );
    }
    return AuthResult.authenticated(
      user,
      message: response['message']?.toString(),
    );
  }

  AuthResult _restrictedFromResponse(Map<String, dynamic> response) {
    final user = AuthUser.fromJson(
      (response['user'] as Map).cast<String, dynamic>(),
    );
    final restriction = AccountRestriction.fromJson(
      (response['restriction'] as Map).cast<String, dynamic>(),
    );
    return AuthResult.restricted(
      user,
      restriction,
      message: response['message']?.toString(),
    );
  }
}
