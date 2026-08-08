import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/widgets/staff_role_badge.dart';

void main() {
  test('legacy staff roles map to current hierarchy', () {
    expect(normalizeStaffRole('founder'), 'developer');
    expect(normalizeStaffRole('admin'), 'senior_admin');
    expect(normalizeStaffRole('moderator'), 'senior_moderator');
  });

  test('role labels are available only for staff', () {
    expect(staffRoleLabel('developer'), 'Разработчик');
    expect(staffRoleLabel('support'), 'Support');
    expect(staffRoleLabel('user'), isEmpty);
  });
}
