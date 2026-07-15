import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/core/prefs/love_prefs.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LovePrefs.instance.init();
  runApp(const LoveMobileApp());
}
