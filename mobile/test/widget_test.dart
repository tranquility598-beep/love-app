import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/theme/love_theme.dart';

void main() {
  testWidgets('renders the mobile app theme shell', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LoveTheme.dark(),
        home: const Scaffold(
          body: Center(child: Text('Love')),
        ),
      ),
    );

    expect(find.text('Love'), findsOneWidget);
  });
}
