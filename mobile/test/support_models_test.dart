import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/features/support/support_models.dart';

void main() {
  test('support case parses replies and closed states', () {
    final supportCase = SupportCase.fromJson({
      '_id': 'case-1',
      'number': 'LOVE-42',
      'kind': 'support',
      'title': 'Проблема со входом',
      'description': 'Не приходит код',
      'status': 'resolved',
      'priority': 'high',
      'createdAt': '2026-08-04T08:00:00.000Z',
      'updatedAt': '2026-08-04T09:00:00.000Z',
      'notes': [
        {
          '_id': 'note-1',
          'body': 'Проверяем отправку',
          'createdAt': '2026-08-04T08:30:00.000Z',
          'author': {
            '_id': 'staff-1',
            'username': 'helper',
            'role': 'support',
          },
        },
      ],
    });

    expect(supportCase.id, 'case-1');
    expect(supportCase.isClosed, isTrue);
    expect(supportCase.notes, hasLength(1));
    expect(supportCase.notes.single.authorRole, 'support');
  });

  test('moderation status keeps appeal and restriction data', () {
    final status = ModerationStatus.fromJson({
      'warningCount': 3,
      'trustScore': 54,
      'reputation': {'label': 'Есть нарушения', 'tone': 'warning'},
      'activeRestriction': {
        '_id': 'action-1',
        'type': 'mute',
        'reason': 'Спам',
        'active': true,
        'canAppeal': true,
        'expiresAt': '2026-08-05T08:00:00.000Z',
        'appeal': {
          '_id': 'appeal-1',
          'number': 'LOVE-A-1',
          'status': 'triaged',
        },
      },
    });

    expect(status.warningCount, 3);
    expect(status.activeRestriction?.active, isTrue);
    expect(status.activeRestriction?.appeal?.number, 'LOVE-A-1');
  });
}
