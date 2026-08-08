import '../chat/chat_models.dart';

class SupportCase {
  const SupportCase({
    required this.id,
    required this.number,
    required this.kind,
    required this.title,
    required this.description,
    required this.status,
    required this.priority,
    required this.createdAt,
    required this.updatedAt,
    this.notes = const [],
    this.attachments = const [],
    this.category,
  });

  final String id;
  final String number;
  final String kind;
  final String title;
  final String description;
  final String status;
  final String priority;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<SupportNote> notes;
  final List<SupportAttachment> attachments;
  final String? category;

  bool get isClosed =>
      const {'resolved', 'rejected', 'archived'}.contains(status);

  factory SupportCase.fromJson(Map<String, dynamic> json) {
    final public = _map(json['public']);
    final notes = _mapList(json['notes']).map(SupportNote.fromJson).toList();
    final attachments =
        _mapList(json['attachments']).map(SupportAttachment.fromJson).toList();
    final createdAt = _date(json['createdAt']);
    return SupportCase(
      id: asId(json['_id']),
      number: asText(json['number'], 'LOVE'),
      kind: asText(json['kind'], 'support'),
      title: asText(json['title'], 'Обращение'),
      description: asText(json['description']),
      status: asText(json['status'], 'new'),
      priority: asText(json['priority'], 'normal'),
      createdAt: createdAt,
      updatedAt: _date(json['updatedAt'], fallback: createdAt),
      notes: notes,
      attachments: attachments,
      category: public['category']?.toString(),
    );
  }

  SupportCase copyWith({
    String? status,
    String? priority,
    DateTime? updatedAt,
    List<SupportNote>? notes,
  }) {
    return SupportCase(
      id: id,
      number: number,
      kind: kind,
      title: title,
      description: description,
      status: status ?? this.status,
      priority: priority ?? this.priority,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      notes: notes ?? this.notes,
      attachments: attachments,
      category: category,
    );
  }
}

class SupportNote {
  const SupportNote({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.authorName,
    required this.authorId,
    required this.authorAvatar,
    required this.authorRole,
    this.internal = false,
  });

  final String id;
  final String body;
  final DateTime createdAt;
  final String authorName;
  final String authorId;
  final String authorAvatar;
  final String authorRole;
  final bool internal;

  factory SupportNote.fromJson(Map<String, dynamic> json) {
    final author = _map(json['author']);
    return SupportNote(
      id: asId(json['_id']),
      body: asText(json['body']),
      createdAt: _date(json['createdAt']),
      authorName: userDisplayName(author.isEmpty ? null : author),
      authorId: asId(author.isEmpty ? json['author'] : author['_id']),
      authorAvatar: asText(author['avatar']),
      authorRole: asText(author['role'], asText(author['staffRank'])),
      internal: asBool(json['internal']),
    );
  }
}

class SupportAttachment {
  const SupportAttachment({
    required this.name,
    required this.url,
    required this.mimeType,
    required this.size,
  });

  final String name;
  final String url;
  final String mimeType;
  final int size;

  factory SupportAttachment.fromJson(Map<String, dynamic> json) {
    return SupportAttachment(
      name: asText(json['name'], 'Файл'),
      url: asText(json['url']),
      mimeType: asText(json['mimeType']),
      size: (json['size'] as num?)?.toInt() ?? 0,
    );
  }
}

class ModerationStatus {
  const ModerationStatus({
    required this.warningCount,
    required this.trustScore,
    required this.reputationLabel,
    required this.reputationTone,
    required this.thresholds,
    required this.actions,
    this.activeRestriction,
  });

  final int warningCount;
  final int trustScore;
  final String reputationLabel;
  final String reputationTone;
  final List<WarningThreshold> thresholds;
  final List<ModerationRecord> actions;
  final ModerationRecord? activeRestriction;

  factory ModerationStatus.fromJson(Map<String, dynamic> json) {
    final reputation = _map(json['reputation']);
    final actions =
        _mapList(json['actions']).map(ModerationRecord.fromJson).toList();
    final activeRaw = _map(json['activeRestriction']);
    return ModerationStatus(
      warningCount: (json['warningCount'] as num?)?.toInt() ?? 0,
      trustScore: (json['trustScore'] as num?)?.toInt() ?? 100,
      reputationLabel: asText(reputation['label'], 'Надёжный пользователь'),
      reputationTone: asText(reputation['tone'], 'good'),
      thresholds:
          _mapList(json['thresholds']).map(WarningThreshold.fromJson).toList(),
      actions: actions,
      activeRestriction:
          activeRaw.isEmpty ? null : ModerationRecord.fromJson(activeRaw),
    );
  }
}

class WarningThreshold {
  const WarningThreshold({required this.count, required this.consequence});

  final int count;
  final String consequence;

  factory WarningThreshold.fromJson(Map<String, dynamic> json) {
    return WarningThreshold(
      count: (json['count'] as num?)?.toInt() ?? 0,
      consequence: asText(json['consequence']),
    );
  }
}

class ModerationRecord {
  const ModerationRecord({
    required this.id,
    required this.type,
    required this.reason,
    required this.active,
    required this.revoked,
    required this.permanent,
    required this.automatic,
    required this.canAppeal,
    this.startsAt,
    this.expiresAt,
    this.appeal,
  });

  final String id;
  final String type;
  final String reason;
  final bool active;
  final bool revoked;
  final bool permanent;
  final bool automatic;
  final bool canAppeal;
  final DateTime? startsAt;
  final DateTime? expiresAt;
  final AppealSummary? appeal;

  factory ModerationRecord.fromJson(Map<String, dynamic> json) {
    final appeal = _map(json['appeal']);
    return ModerationRecord(
      id: asId(json['_id']),
      type: asText(json['type'], 'warning'),
      reason: asText(json['reason'], 'Причина не указана'),
      active: asBool(json['active']),
      revoked: asBool(json['revoked']),
      permanent: asBool(json['permanent']),
      automatic: asBool(json['automatic']),
      canAppeal: asBool(json['canAppeal']),
      startsAt: _nullableDate(json['startsAt']),
      expiresAt: _nullableDate(json['expiresAt']),
      appeal: appeal.isEmpty ? null : AppealSummary.fromJson(appeal),
    );
  }
}

class AppealSummary {
  const AppealSummary(
      {required this.id, required this.number, required this.status});

  final String id;
  final String number;
  final String status;

  factory AppealSummary.fromJson(Map<String, dynamic> json) {
    return AppealSummary(
      id: asId(json['_id']),
      number: asText(json['number']),
      status: asText(json['status'], 'new'),
    );
  }
}

class ReportReason {
  const ReportReason({
    required this.id,
    required this.label,
    this.description = '',
    this.descriptionRequired = false,
    this.severity = 'high',
    this.children = const [],
  });

  final String id;
  final String label;
  final String description;
  final bool descriptionRequired;
  final String severity;
  final List<ReportReason> children;

  bool get isLeaf => children.isEmpty;

  factory ReportReason.fromJson(Map<String, dynamic> json) {
    return ReportReason(
      id: asText(json['id']),
      label: asText(json['label'], 'Другая проблема'),
      description: asText(json['description']),
      descriptionRequired: asBool(json['descriptionRequired']),
      severity: asText(json['severity'], 'high'),
      children: _mapList(json['children']).map(ReportReason.fromJson).toList(),
    );
  }
}

Map<String, dynamic> _map(Object? value) {
  return value is Map ? value.cast<String, dynamic>() : <String, dynamic>{};
}

List<Map<String, dynamic>> _mapList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => item.cast<String, dynamic>())
      .toList();
}

DateTime _date(Object? value, {DateTime? fallback}) {
  return DateTime.tryParse(asText(value)) ?? fallback ?? DateTime.now();
}

DateTime? _nullableDate(Object? value) {
  final text = asText(value);
  return text.isEmpty ? null : DateTime.tryParse(text);
}
