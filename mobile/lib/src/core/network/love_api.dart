import 'dart:io';

import '../../config/app_config.dart';
import '../../features/support/support_models.dart';
import 'api_client.dart';

class LoveApi {
  LoveApi({ApiClient? api}) : api = api ?? ApiClient();

  final ApiClient api;
  static bool _submittingCase = false;

  Future<Map<String, dynamic>> _submitCase(
      String path, Map<String, dynamic> body) async {
    if (_submittingCase) {
      throw const ApiException(
          'Обращение уже отправляется. Дождитесь результата.',
          statusCode: 409);
    }
    _submittingCase = true;
    try {
      final owner = await api.tokenStore.readToken();
      await ensureCaseSubmissionAllowed();
      if (owner == null || owner != await api.tokenStore.readToken()) {
        throw const ApiException('Аккаунт изменился. Откройте форму заново.');
      }
      return await api.post(path, body: body);
    } finally {
      _submittingCase = false;
    }
  }

  Future<CaseSubmissionState> ensureCaseSubmissionAllowed() async {
    final state = (await caseInbox()).submission;
    if (!state.supported || !state.allowed) {
      throw ApiException(state.explanation,
          statusCode: !state.supported
              ? 503
              : state.code == 'CASE_COOLDOWN'
                  ? 429
                  : 409);
    }
    return state;
  }

  Future<List<Map<String, dynamic>>> blockedUsers() async {
    final response = await api.get('/users/me/blocked');
    if (response['blockedUsers'] is! List) {
      throw const ApiException(
          'Сервер не вернул список заблокированных. Попробуйте позже.');
    }
    return _list(response['blockedUsers']);
  }

  Future<void> unblockUser(String userId) async {
    final response =
        await api.delete('/users/me/blocked/${Uri.encodeComponent(userId)}');
    if (response['userId'] != userId) {
      throw const ApiException(
          'Сервер не подтвердил разблокировку. Обновите список.');
    }
  }

  Future<Map<String, dynamic>> profilePageSummary() =>
      api.get('/profile-page/summary');
  Future<Map<String, dynamic>> profileEditorSession() =>
      api.post('/profile-page/editor-session');

  Future<Map<String, dynamic>> userByUsername(String username) async {
    try {
      final response =
          await api.get('/users/by-username/${Uri.encodeComponent(username)}');
      return (response['user'] as Map).cast<String, dynamic>();
    } on ApiException catch (error) {
      if (error.statusCode != 404) rethrow;
      final users = await searchUsers(username);
      for (final user in users) {
        if (user['username']?.toString().toLowerCase() ==
            username.toLowerCase()) {
          return user;
        }
      }
      rethrow;
    }
  }

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

  /// Отправка сообщения через HTTP.
  ///
  /// Это резервный путь: обычно сообщения уходят по сокету. Вложения здесь
  /// обязательны — без них клиент, потерявший realtime, не мог отправить
  /// голосовое и просто падал с ошибкой.
  Future<Map<String, dynamic>> sendMessage(
    String channelId,
    String content, {
    String? replyTo,
    DateTime? deliverAt,
    List<Map<String, dynamic>> attachments = const [],
  }) {
    return api.post(
      '/messages/$channelId',
      body: {
        'content': content,
        if (attachments.isNotEmpty) 'attachments': attachments,
        if (replyTo != null) 'replyTo': replyTo,
        if (deliverAt != null) 'deliverAt': deliverAt.toUtc().toIso8601String(),
      },
    );
  }

  /// Свои ещё не доставленные капсулы времени.
  Future<List<Map<String, dynamic>>> capsules() async {
    final response = await api.get('/messages/capsules');
    return _list(response['capsules']);
  }

  /// Отменить свою капсулу до срока доставки.
  Future<Map<String, dynamic>> cancelCapsule(String capsuleId) {
    return api.delete('/messages/capsules/$capsuleId');
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

  /// Стереть одно уведомление. Раньше крестик в списке звал
  /// [markNotificationsRead], поэтому запись оставалась в базе и возвращалась
  /// при следующем обновлении. Сервер: `DELETE /notifications/:id`.
  Future<void> deleteNotification(String id) async {
    await api.delete('/notifications/$id');
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

  Future<Map<String, dynamic>> uploadAvatar(String filePath,
      {String? mimeType}) {
    return api.upload(
      '/users/avatar',
      filePath: filePath,
      fieldName: 'avatar',
      method: 'PUT',
      mimeType: mimeType,
    );
  }

  Future<Map<String, dynamic>> uploadMusic(String filePath,
      {String? mimeType}) {
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

  Future<List<Map<String, dynamic>>> communityIdeas({bool top = true}) async {
    final response =
        await api.get(top ? '/community/ideas/top' : '/community/ideas');
    return _list(response['ideas']);
  }

  Future<List<Map<String, dynamic>>> communityBugs() async {
    final response = await api.get('/community/bugs', query: {'limit': '50'});
    return _list(response['bugs']);
  }

  Future<List<Map<String, dynamic>>> devLog({int page = 1}) async {
    final response = await api.get(
      '/community/devlog',
      query: {'page': '$page', 'limit': '20'},
    );
    return _list(response['posts']);
  }

  Future<Map<String, dynamic>> devLogPage({int page = 1, int limit = 20}) {
    return api.get(
      '/community/devlog',
      query: {'page': '$page', 'limit': '$limit'},
    );
  }

  Future<List<Map<String, dynamic>>> devLogComments(String postId) async {
    final response = await api.get('/community/devlog/$postId/comments');
    return _list(response['comments']);
  }

  Future<Map<String, dynamic>> addDevLogComment(
    String postId,
    String body, {
    String? parent,
  }) {
    return api.post(
      '/community/devlog/$postId/comments',
      body: {
        'body': body.trim(),
        if (parent != null && parent.isNotEmpty) 'parent': parent,
      },
    );
  }

  Future<Map<String, dynamic>> voteIdea(String id, int value) {
    return api.put('/community/ideas/$id/vote', body: {'value': value});
  }

  Future<Map<String, dynamic>> voteDevLog(String id, int value) {
    return api.put('/community/devlog/$id/vote', body: {'value': value});
  }

  Future<Map<String, dynamic>> createCommunityCase({
    required String kind,
    required String title,
    required String description,
    bool diagnosticsConsent = false,
    String priority = 'normal',
    String category = 'other',
    String safeLog = '',
    List<Map<String, dynamic>> attachments = const [],
  }) {
    return _submitCase('/cases', {
      'kind': kind,
      'title': title.trim(),
      'description': description.trim(),
      'diagnosticsConsent': diagnosticsConsent,
      'priority': priority,
      'category': category,
      if (attachments.isNotEmpty) 'attachments': attachments,
      if (diagnosticsConsent)
        'diagnostics': {
          'appVersion': AppConfig.productVersion,
          'platform': 'Flutter ${Platform.operatingSystem}',
          'osVersion': Platform.operatingSystemVersion,
          'safeLog': _scrubSafeLog(safeLog),
        },
    });
  }

  Future<List<SupportCase>> myCases() async {
    return (await caseInbox()).cases;
  }

  Future<CaseInbox> caseInbox() async {
    final response = await api.get('/cases/mine');
    final raw = response['submission'];
    return CaseInbox(
      cases: _list(response['cases']).map(SupportCase.fromJson).toList(),
      submission: CaseSubmissionState.fromJson(
          raw is Map ? raw.cast<String, dynamic>() : {}),
    );
  }

  Future<SupportCase> caseDetails(String caseId) async {
    final response = await api.get('/cases/$caseId');
    return SupportCase.fromJson(
      (response['case'] as Map).cast<String, dynamic>(),
    );
  }

  Future<ModerationStatus> moderationStatus() async {
    return ModerationStatus.fromJson(await api.get('/cases/status'));
  }

  Future<SupportCase> createSupportCase({
    required String title,
    required String description,
    String priority = 'normal',
    List<Map<String, dynamic>> attachments = const [],
  }) async {
    final response = await _submitCase('/cases', {
      'kind': 'support',
      'title': title.trim(),
      'description': description.trim(),
      'priority': priority,
      if (attachments.isNotEmpty) 'attachments': attachments,
    });
    return SupportCase.fromJson(
      (response['case'] as Map).cast<String, dynamic>(),
    );
  }

  Future<SupportNote> replyToCase(String caseId, String body) async {
    final response = await api.post(
      '/cases/$caseId/replies',
      body: {'body': body.trim()},
    );
    return SupportNote.fromJson(
      (response['note'] as Map).cast<String, dynamic>(),
    );
  }

  Future<SupportCase> createAppeal({
    required String moderationActionId,
    required String description,
  }) async {
    final response = await _submitCase('/cases/appeals', {
      'moderationAction': moderationActionId,
      'description': description.trim(),
    });
    return SupportCase.fromJson(
      (response['case'] as Map).cast<String, dynamic>(),
    );
  }

  Future<List<ReportReason>> messageReportTaxonomy() async {
    final response = await api.get('/cases/message-report-taxonomy');
    return _list(response['categories']).map(ReportReason.fromJson).toList();
  }

  Future<ProfileReportOptions> profileReportOptions() async {
    final response = await api.get('/cases/profile-report-options');
    return ProfileReportOptions(
      parts: _list(response['parts'])
          .map((part) => ProfileReportPart(
              id: part['id']?.toString() ?? '',
              label: part['label']?.toString() ?? ''))
          .where((part) => part.id.isNotEmpty)
          .toList(),
      categories:
          _list(response['categories']).map(ReportReason.fromJson).toList(),
    );
  }

  Future<SupportCase> reportProfile({
    required String userId,
    required String part,
    required List<String> path,
    String description = '',
  }) async {
    final response = await _submitCase('/cases/profile-reports', {
      'userId': userId,
      'part': part,
      'path': path,
      'description': description.trim(),
    });
    return SupportCase.fromJson(
      (response['case'] as Map).cast<String, dynamic>(),
    );
  }

  Future<SupportCase> reportMessage({
    required String messageId,
    required List<String> path,
    String description = '',
  }) async {
    final response = await _submitCase('/cases/message-reports', {
      'messageId': messageId,
      'path': path,
      'description': description.trim(),
    });
    return SupportCase.fromJson(
      (response['case'] as Map).cast<String, dynamic>(),
    );
  }

  List<Map<String, dynamic>> _list(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
  }

  String _scrubSafeLog(String value) {
    final scrubbed = value
        .replaceAll(
            RegExp(r'Bearer\s+\S+', caseSensitive: false), 'Bearer [REDACTED]')
        .replaceAll(
          RegExp(r'(token|password|secret|authorization)\s*[:=]\s*\S+',
              caseSensitive: false),
          r'$1=[REDACTED]',
        );
    return scrubbed.substring(
        0, scrubbed.length > 12000 ? 12000 : scrubbed.length);
  }
}
