import 'package:flutter/material.dart';
import 'package:flutter_displaymode/flutter_displaymode.dart';

import 'src/app.dart';
import 'src/core/prefs/love_prefs.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LovePrefs.instance.init();
  try {
    await FlutterDisplayMode.setHighRefreshRate();
  } catch (_) {}
  runApp(const LoveMobileApp());
}
