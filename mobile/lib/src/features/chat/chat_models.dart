String asId(Object? value) {
  if (value == null) return '';
  if (value is Map) return (value['_id'] ?? value['id'] ?? '').toString();
  return value.toString();
}

String asText(Object? value, [String fallback = '']) {
  if (value == null) return fallback;
  final text = value.toString();
  return text.isEmpty ? fallback : text;
}

bool asBool(Object? value) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) return value == 'true' || value == '1';
  return false;
}

String userDisplayName(Map<String, dynamic>? user) {
  if (user == null) return 'Love user';
  return asText(user['nickname'], asText(user['username'], 'Love user'));
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.channelId,
    required this.content,
    required this.authorName,
    required this.authorId,
    required this.authorAvatar,
    required this.createdAt,
    required this.isOwn,
    this.attachments = const [],
    this.type = 'default',
  });

  final String id;
  final String channelId;
  final String content;
  final String authorName;
  final String authorId;
  final String authorAvatar;
  final DateTime createdAt;
  final bool isOwn;
  final List<ChatAttachment> attachments;
  final String type;

  factory ChatMessage.fromJson(
    Map<String, dynamic> json, {
    required String currentUserId,
  }) {
    final authorRaw = json['author'];
    final author = authorRaw is Map
        ? authorRaw.cast<String, dynamic>()
        : <String, dynamic>{};
    final authorId = author.isEmpty ? asId(authorRaw) : asId(author['_id']);
    return ChatMessage(
      id: asId(json['_id']),
      channelId: asId(json['channel']),
      content: asText(json['content']),
      authorName: userDisplayName(author),
      authorId: authorId,
      authorAvatar: asText(author['avatar']),
      createdAt: DateTime.tryParse(asText(json['createdAt'])) ?? DateTime.now(),
      isOwn: authorId == currentUserId,
      attachments: _attachments(json['attachments']),
      type: asText(json['type'], 'default'),
    );
  }

  bool get hasMedia =>
      attachments.isNotEmpty ||
      type == 'file' ||
      type == 'image' ||
      content.toLowerCase().contains('.webm');

  static List<ChatAttachment> _attachments(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => ChatAttachment.fromJson(item.cast<String, dynamic>()))
        .toList();
  }
}

class ChatAttachment {
  const ChatAttachment({
    required this.url,
    required this.name,
    required this.type,
    required this.mimeType,
    required this.size,
  });

  final String url;
  final String name;
  final String type;
  final String mimeType;
  final int size;

  factory ChatAttachment.fromJson(Map<String, dynamic> json) {
    return ChatAttachment(
      url: asText(json['url']),
      name: asText(json['originalName'], asText(json['filename'], 'Файл')),
      type: asText(json['type'], 'file'),
      mimeType: asText(json['mimetype']),
      size: int.tryParse(asText(json['size'])) ?? 0,
    );
  }

  bool get isVoice =>
      type == 'audio' ||
      mimeType.startsWith('audio/') ||
      name.toLowerCase().endsWith('.webm') ||
      name.toLowerCase().endsWith('.mp3') ||
      name.toLowerCase().endsWith('.m4a') ||
      name.toLowerCase().endsWith('.ogg');
}
