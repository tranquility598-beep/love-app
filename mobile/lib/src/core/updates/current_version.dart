import 'package:package_info_plus/package_info_plus.dart';

import '../../config/app_config.dart';

/// Единственный источник правды о текущей версии приложения.
///
/// Берёт версию, зашитую в сам APK на этапе сборки (из pubspec.yaml,
/// поле `version: X.Y.Z+N` -> versionName = X.Y.Z). Больше не зависим от
/// ручного бампа AppConfig.productVersion — он остаётся только fallback'ом.
class CurrentVersion {
  CurrentVersion._();

  static String? _cached;

  /// Версия установленного приложения, например "2.0.5".
  static Future<String> get() async {
    final cached = _cached;
    if (cached != null) return cached;
    try {
      final info = await PackageInfo.fromPlatform();
      final v = info.version.trim();
      if (v.isNotEmpty) {
        _cached = v;
        return v;
      }
    } catch (_) {
      // игнорируем — ниже fallback
    }
    _cached = AppConfig.productVersion;
    return AppConfig.productVersion;
  }

  /// Сравнение семантических версий. > 0 если a новее b, 0 если равны.
  static int compare(String a, String b) {
    List<int> parse(String s) => s
        .trim()
        .replaceFirst(RegExp(r'^[vV]'), '')
        .split(RegExp(r'[+\-]'))
        .first
        .split('.')
        .map((p) => int.tryParse(p) ?? 0)
        .toList();
    final pa = parse(a);
    final pb = parse(b);
    final len = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < len; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x - y;
    }
    return 0;
  }

  /// true, если [latest] строго новее текущей установленной версии.
  static Future<bool> isNewer(String latest) async {
    final current = await get();
    return compare(latest, current) > 0;
  }
}
