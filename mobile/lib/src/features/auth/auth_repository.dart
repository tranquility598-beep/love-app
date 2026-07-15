import '../../core/network/api_client.dart';
import '../../core/storage/auth_token_store.dart';
import '../../config/app_config.dart';

enum AuthResultType {
  authenticated,
  needsOtp,
  needsTwoFactor,
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
  });

  final AuthResultType type;
  final AuthUser? user;
  final String? email;
  final String? pendingToken;
  final String? message;

  factory AuthResult.authenticated(AuthUser user, {String? message}) {
    return AuthResult._(
      type: AuthResultType.authenticated,
      user: user,
      message: message,
    );
  }

  factory AuthResult.needsOtp({required String email, String? message}) {
    return AuthResult._(
      type: AuthResultType.needsOtp,
      email: email,
      message: message,
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

class AuthRepository {
  AuthRepository({
    ApiClient? api,
    AuthTokenStore? tokenStore,
  })  : api = api ?? ApiClient(tokenStore: tokenStore),
        tokenStore = tokenStore ?? const AuthTokenStore();

  final ApiClient api;
  final AuthTokenStore tokenStore;

  Future<AuthUser?> restoreSession() async {
    final token = await tokenStore.readToken();
    if (token == null || token.isEmpty) return null;
    try {
      final response = await api.get('/auth/me');
      return AuthUser.fromJson(response['user'] as Map<String, dynamic>);
    } catch (_) {
      await tokenStore.clear();
      return null;
    }
  }

  Future<AuthResult> login(String email, String password) async {
    final response = await api.post(
      '/auth/login',
      body: {'email': email.trim(), 'password': password},
    );
    return _authResultFromResponse(response);
  }

  Future<AuthResult> register({
    required String username,
    required String email,
    required String password,
  }) async {
    final response = await api.post(
      '/auth/register',
      body: {
        'username': username.trim(),
        'email': email.trim(),
        'password': password,
      },
    );
    return AuthResult.needsOtp(
      email: response['email']?.toString() ?? email.trim(),
      message: response['message']?.toString(),
    );
  }

  Future<AuthResult> verifyOtp(String email, String code) async {
    final response = await api.post(
      '/auth/verify-otp',
      body: {'email': email.trim(), 'code': code.trim()},
    );
    return _authenticatedFromResponse(response);
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
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Local logout must still work when the server is unavailable.
    }
    await tokenStore.clear();
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
      return Future.value(AuthResult.needsOtp(
        email: response['email']?.toString() ?? '',
        message: response['message']?.toString(),
      ));
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
    return AuthResult.authenticated(
      user,
      message: response['message']?.toString(),
    );
  }
}
