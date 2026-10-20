import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/features/auth/auth_repository.dart';
import 'package:love_mobile/src/features/settings/settings_subscriptions_section.dart';
import 'package:love_mobile/src/session/app_session.dart';
import 'package:love_mobile/src/theme/love_theme.dart';

Future<void> _pump(WidgetTester tester, AuthUser? user) async {
  final session = AppSession()..user = user;
  await tester.pumpWidget(
    AppSessionScope(
      session: session,
      child: MaterialApp(
        theme: LoveTheme.dark(),
        home: const Scaffold(
          body: SingleChildScrollView(child: SubscriptionsSettingsSection()),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('показывает цены как на ПК и текущий Premium', (tester) async {
    await _pump(
      tester,
      AuthUser(
        id: 'u1',
        username: 'premiumtester',
        plan: 'premium',
        planExpiresAt: DateTime.now().add(const Duration(days: 30)),
      ),
    );
    expect(find.text('Love Premium'), findsOneWidget);
    for (final price in ['0 ₽', '299 ₽', '499 ₽', '799 ₽']) {
      expect(find.textContaining(price), findsWidgets, reason: price);
    }
    expect(find.text('Ваш тариф'), findsWidgets);
    expect(find.text('Покупка пока недоступна'), findsNWidgets(3));
  });

  testWidgets('просроченный тариф показывается как Free', (tester) async {
    await _pump(
      tester,
      AuthUser(
        id: 'u2',
        username: 'expired',
        plan: 'pro',
        planExpiresAt: DateTime.now().subtract(const Duration(days: 1)),
      ),
    );
    expect(find.text('Love Free'), findsOneWidget);
    expect(find.textContaining('Срок подписки завершён'), findsOneWidget);
  });
}
