import 'api_client.dart';

class LoveApi {
  LoveApi({ApiClient? api}) : api = api ?? ApiClient();

  final ApiClient api;

  Future<List<Map<String, dynamic>>> conversations() async {
    final response = await api.get('/dm');
    return _list(response['conversations']);
  }

  Future<Map<String, dynamic>> conversationMessages(String conversationId) {
    return api.get('/dm/$conversationId/messages');
  }

  Future<Map<String, dynamic>> openConversation(String userId) {
    return api.post('/dm/$userId');
  }

  Future<void> deleteConversation(String conversationId) async {
    await api.delete('/dm/$conversationId');
  }

  Future<List<Map<String, dynamic>>> searchUsers(String query) async {
    final response = await api.get('/users/search', query: {'q': query.trim()});
    return _list(response['users']);
  }

  Future<List<Map<String, dynamic>>> servers() async {
    final response = await api.get('/servers');
    return _list(response['servers']);
  }

  Future<Map<String, dynamic>> server(String serverId) async {
    final response = await api.get('/servers/$serverId');
    final server = response['server'];
    return server is Map ? server.cast<String, dynamic>() : response;
  }

  Future<Map<String, dynamic>> createServer({
    required String name,
    String? description,
  }) {
    return api.post(
      '/servers',
      body: {
        'name': name.trim(),
        'description': description?.trim() ?? '',
      },
    );
  }

  Future<List<Map<String, dynamic>>> rooms() async {
    final response = await api.get('/servers/rooms');
    return _list(response['rooms']);
  }

  Future<Map<String, dynamic>> createRoom({
    required String name,
    String? description,
  }) {
    return api.post(
      '/servers/rooms',
      body: {
        'name': name.trim(),
        'description': description?.trim() ?? '',
      },
    );
  }

  Future<Map<String, dynamic>> createInvite(String serverId) {
    return api.post('/servers/$serverId/invite');
  }

  Future<Map<String, dynamic>> updateServer(
    String serverId,
    Map<String, dynamic> data,
  ) {
    return api.put('/servers/$serverId', body: data);
  }

  Future<void> leaveServer(String serverId) async {
    await api.delete('/servers/$serverId/leave');
  }

  Future<void> deleteServer(String serverId) async {
    await api.delete('/servers/$serverId');
  }

  Future<Map<String, dynamic>> uploadServerIcon(
    String serverId,
    String filePath, {
    String? mimeType,
  }) {
    return api.upload(
      '/servers/$serverId/icon',
      filePath: filePath,
      fieldName: 'icon',
      method: 'PUT',
      mimeType: mimeType,
    );
  }

  Future<Map<String, dynamic>> uploadServerBanner(
    String serverId,
    String filePath, {
    String? mimeType,
  }) {
    return api.upload(
      '/servers/$serverId/banner',
      filePath: filePath,
      fieldName: 'banner',
      method: 'PUT',
      mimeType: mimeType,
    );
  }

  Future<Map<String, dynamic>> deleteServerIcon(String serverId) {
    return api.delete('/servers/$serverId/icon');
  }

  Future<Map<String, dynamic>> deleteServerBanner(String serverId) {
    return api.delete('/servers/$serverId/banner');
  }

  Future<Map<String, dynamic>> invitePreview(String code) {
    return api.get('/servers/invite/${Uri.encodeComponent(code)}/preview');
  }

  Future<Map<String, dynamic>> joinInvite(String code) {
    return api.post('/servers/join/${Uri.encodeComponent(code)}');
  }

  Future<List<Map<String, dynamic>>> messages(
    String channelId, {
    String? before,
    int limit = 50,
  }) async {
    final response = await api.get(
      '/messages/$channelId',
      query: {'before': before, 'limit': '$limit'},
    );
    return _list(response['messages']);
  }

  Future<Map<String, dynamic>> sendMessage(
    String channelId,
    String content, {
    String? replyTo,
  }) {
    return api.post(
      '/messages/$channelId',
      body: {'content': content, if (replyTo != null) 'replyTo': replyTo},
    );
  }

  /// Публичный профиль пользователя (GET /users/:id).
  Future<Map<String, dynamic>> userProfile(String userId) {
    return api.get('/users/$userId');
  }

  /// REST-фолбэк редактирования (основной путь — сокет `message:edit`).
  Future<Map<String, dynamic>> editMessage(String messageId, String content) {
    return api.put('/messages/$messageId', body: {'content': content});
  }

  /// REST-фолбэк удаления (основной путь — сокет `message:delete`).
  Future<Map<String, dynamic>> deleteMessage(String messageId) {
    return api.delete('/messages/$messageId');
  }

  Future<Map<String, dynamic>> uploadFile({
    required String filePath,
    required String channelId,
    String? content,
    String? replyTo,
  }) {
    return api.upload(
      '/upload/file',
      filePath: filePath,
      fieldName: 'file',
      fields: {
        'channelId': channelId,
        if (content != null) 'content': content,
        if (replyTo != null) 'replyTo': replyTo,
      },
    );
  }

  Future<Map<String, dynamic>> friends() => api.get('/friends');

  Future<Map<String, dynamic>> sendFriendRequest(String userId) {
    return api.post('/friends/request/$userId');
  }

  Future<Map<String, dynamic>> acceptFriend(String userId) {
    return api.post('/friends/accept/$userId');
  }

  Future<Map<String, dynamic>> declineFriend(String userId) {
    return api.post('/friends/decline/$userId');
  }

  Future<Map<String, dynamic>> removeFriend(String userId) {
    return api.delete('/friends/$userId');
  }

  Future<List<Map<String, dynamic>>> notifications() async {
    final response = await api.get('/notifications');
    return _list(response['notifications']);
  }

  Future<void> markNotificationsRead({String? id}) async {
    await api.post('/notifications/read', body: {if (id != null) 'id': id});
  }

  Future<void> clearNotifications() async {
    await api.delete('/notifications');
  }

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) {
    return api.put('/users/profile', body: data);
  }

  /// Change email and/or username. Requires the current password when the
  /// account has one. Server: `PUT /users/account`.
  Future<Map<String, dynamic>> updateAccount({
    String? email,
    String? username,
    required String currentPassword,
  }) {
    return api.put('/users/account', body: {
      if (email != null) 'email': email.trim(),
      if (username != null) 'username': username.trim(),
      'currentPassword': currentPassword,
    });
  }

  /// Server: `POST /auth/change-password` — `{currentPassword, newPassword}`.
  Future<Map<String, dynamic>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) {
    return api.post('/auth/change-password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  /// Server: `POST /auth/security/2fa` — `{enabled}`.
  Future<Map<String, dynamic>> toggleTwoFactor(bool enabled) {
    return api.post('/auth/security/2fa', body: {'enabled': enabled});
  }

  /// Server: `PUT /auth/update-status` — `{status, customStatus?}`.
  Future<Map<String, dynamic>> updateStatus({
    String? status,
    String? customStatus,
  }) {
    return api.put('/auth/update-status', body: {
      if (status != null) 'status': status,
      if (customStatus != null) 'customStatus': customStatus,
    });
  }

  /// Server: `POST /auth/logout-all` — end every other session.
  Future<void> logoutAll() async {
    await api.post('/auth/logout-all');
  }

  Future<Map<String, dynamic>> uploadAvatar(String filePath, {String? mimeType}) {
    return api.upload(
      '/users/avatar',
      filePath: filePath,
      fieldName: 'avatar',
      method: 'PUT',
      mimeType: mimeType,
    );
  }

  Future<Map<String, dynamic>> uploadMusic(String filePath, {String? mimeType}) {
    return api.upload(
      '/upload',
      filePath: filePath,
      fieldName: 'file',
      mimeType: mimeType,
    );
  }

  Future<Map<String, dynamic>> uploadAttachment(String filePath,
      {String? mimeType}) {
    return api.upload(
      '/upload',
      filePath: filePath,
      fieldName: 'file',
      mimeType: mimeType,
    );
  }

  Future<Map<String, dynamic>> releaseInfo() {
    return api.get('/release');
  }

  List<Map<String, dynamic>> _list(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
  }
}
