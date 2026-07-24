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
    this.edited = false,
    this.replyToId = '',
    this.replyToAuthor = '',
    this.replyToContent = '',
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

  /// True when the author edited this message (`edited` on the server model).
  final bool edited;

  /// Reply info. The server populates `replyTo` with the quoted message and
  /// its author; realtime temp-broadcasts may carry only the id — the chat
  /// screen then resolves author/content from the loaded message list.
  final String replyToId;
  final String replyToAuthor;
  final String replyToContent;

  factory ChatMessage.fromJson(
    Map<String, dynamic> json, {
    required String currentUserId,
  }) {
    final authorRaw = json['author'];
    final author = authorRaw is Map
        ? authorRaw.cast<String, dynamic>()
        : <String, dynamic>{};
    final authorId = author.isEmpty ? asId(authorRaw) : asId(author['_id']);

    final replyRaw = json['replyTo'];
    var replyToId = '';
    var replyToAuthor = '';
    var replyToContent = '';
    if (replyRaw is Map) {
      final reply = replyRaw.cast<String, dynamic>();
      replyToId = asId(reply['_id']);
      final replyAuthorRaw = reply['author'];
      if (replyAuthorRaw is Map) {
        replyToAuthor = userDisplayName(replyAuthorRaw.cast<String, dynamic>());
      }
      replyToContent = asText(reply['content']);
    } else {
      replyToId = asId(replyRaw);
    }

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
      edited: asBool(json['edited']),
      replyToId: replyToId,
      replyToAuthor: replyToAuthor,
      replyToContent: replyToContent,
    );
  }

  ChatMessage copyWith({String? content, bool? edited}) {
    return ChatMessage(
      id: id,
      channelId: channelId,
      content: content ?? this.content,
      authorName: authorName,
      authorId: authorId,
      authorAvatar: authorAvatar,
      createdAt: createdAt,
      isOwn: isOwn,
      attachments: attachments,
      type: type,
      edited: edited ?? this.edited,
      replyToId: replyToId,
      replyToAuthor: replyToAuthor,
      replyToContent: replyToContent,
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

  bool get isImage =>
      type == 'image' ||
      mimeType.startsWith('image/') ||
      _hasExtension(const ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

  /// Note: `.webm` voice notes from desktop stay audio — [isVoice] wins in
  /// the attachment dispatch, so only mime `video/*` or video extensions
  /// land here.
  bool get isVideo =>
      mimeType.startsWith('video/') ||
      _hasExtension(const ['.mp4', '.mov', '.m4v', '.avi', '.mkv']);

  bool _hasExtension(List<String> extensions) {
    final lower = name.toLowerCase();
    return extensions.any(lower.endsWith);
  }
}
