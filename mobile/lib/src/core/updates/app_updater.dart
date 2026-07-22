import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:ota_update/ota_update.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';

import 'current_version.dart';

/// Автообновления Android: проверяет последний релиз на GitHub
/// (stable или beta-канал с предрелизами), сравнивает с текущей
/// версией (из package_info), скачивает APK с прогрессом и
/// запускает системный установщик. При ошибке OTA — фолбэк на браузер.
class AppUpdater {
  AppUpdater._();

  static const _repo = 'tranquility598-beep/love-app';
  static const _skipKey = 'love_update_skip_version';
  static const _betaKey = 'love_update_beta_channel';
  static bool _busy = false;

  /// Канал обновлений: false — stable, true — beta (предрелизы GitHub).
  static Future<bool> isBetaChannel() async =>
      (await SharedPreferences.getInstance()).getBool(_betaKey) ?? false;

  static Future<void> setBetaChannel(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_betaKey, value);
    // Сменили канал — забываем отложенную «Позже» версию.
    await prefs.remove(_skipKey);
  }

  /// Проверка обновлений. Возвращает номер найденной новой версии
  /// или null, если обновлений нет/ошибка.
  ///
  /// [silent] — тихая проверка на старте: молчит, если обновлений нет,
  /// и не показывает диалог для версии, отложенной кнопкой «Позже».
  static Future<String?> checkForUpdates(
    BuildContext context, {
    bool silent = true,
  }) async {
    if (_busy) return null;
    _busy = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final beta = prefs.getBool(_betaKey) ?? false;

      final release = await _fetchLatestRelease(beta);
      if (release == null) {
        if (!silent && context.mounted) {
          _snack(context, 'Не удалось проверить обновления. Попробуй позже.');
        }
        return null;
      }

      final latest = (release['tag_name'] as String? ?? '')
          .replaceFirst(RegExp(r'^v'), '');
      if (latest.isEmpty || !await CurrentVersion.isNewer(latest)) {
        if (!silent && context.mounted) {
          _snack(context, 'У тебя последняя версия');
        }
        return null;
      }

      // «Позже» уже нажимали для этой версии — на старте не надоедаем,
      // но ручная проверка из настроек всё равно показывает диалог.
      if (silent && prefs.getString(_skipKey) == latest) return latest;

      final apkUrl = _pickApkUrl(release['assets'] as List<dynamic>? ?? []);
      if (apkUrl == null) {
        if (!silent && context.mounted) {
          _snack(context, 'В релизе v$latest нет APK — скачай с сайта');
        }
        return latest;
      }

      final notes = (release['body'] as String? ?? '').trim();
      if (!context.mounted) return latest;
      await _showUpdateDialog(context, latest, notes, apkUrl, prefs);
      return latest;
    } catch (_) {
      return null; // сеть/парсинг — проверим в следующий раз
    } finally {
      _busy = false;
    }
  }

  /// stable → /releases/latest (предрелизы GitHub туда не попадают),
  /// beta → список релизов, берём самый свежий включая prerelease.
  static Future<Map<String, dynamic>?> _fetchLatestRelease(bool beta) async {
    const headers = {'Accept': 'application/vnd.github+json'};
    try {
      if (beta) {
        final res = await http
            .get(
              Uri.parse(
                  'https://api.github.com/repos/$_repo/releases?per_page=10'),
              headers: headers,
            )
            .timeout(const Duration(seconds: 15));
        if (res.statusCode != 200) return null;
        final list = jsonDecode(res.body) as List<dynamic>;
        for (final r in list) {
          if (r is Map<String, dynamic> && r['draft'] != true) return r;
        }
        return null;
      }
      final res = await http
          .get(
            Uri.parse('https://api.github.com/repos/$_repo/releases/latest'),
            headers: headers,
          )
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return null;
      return jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// true, если [latest] новее [current] (сравнение чисел через точку).
  static bool _isNewer(String latest, String current) {
    List<int> parse(String v) => v
        .split(RegExp(r'[.+-]'))
        .map((p) => int.tryParse(p) ?? 0)
        .toList();
    final a = parse(latest);
    final b = parse(current);
    for (var i = 0; i < 3; i++) {
      final x = i < a.length ? a[i] : 0;
      final y = i < b.length ? b[i] : 0;
      if (x != y) return x > y;
    }
    return false;
  }

  /// Выбор APK из ассетов: сначала arm64, потом love-mobile, потом любой.
  static String? _pickApkUrl(List<dynamic> assets) {
    final apks = <String, String>{}; // name -> url
    for (final a in assets) {
      final name = (a['name'] as String? ?? '').toLowerCase();
      final url = a['browser_download_url'] as String?;
      if (name.endsWith('.apk') && url != null) apks[name] = url;
    }
    if (apks.isEmpty) return null;
    for (final e in apks.entries) {
      if (e.key.contains('arm64')) return e.value;
    }
    for (final e in apks.entries) {
      if (e.key.contains('love-mobile')) return e.value;
    }
    return apks.values.first;
  }

  static void _snack(BuildContext context, String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  static Future<void> _showUpdateDialog(
    BuildContext context,
    String version,
    String notes,
    String apkUrl,
    SharedPreferences prefs,
  ) {
    final shortNotes =
        notes.length > 600 ? '${notes.substring(0, 600)}…' : notes;
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Доступно обновление $version'),
        content: shortNotes.isEmpty
            ? const Text('Вышла новая версия LOVE.')
            : SingleChildScrollView(child: Text(shortNotes)),
        actions: [
          TextButton(
            onPressed: () {
              prefs.setString(_skipKey, version);
              Navigator.of(ctx).pop();
            },
            child: const Text('Позже'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              _download(context, apkUrl);
            },
            child: const Text('Обновить'),
          ),
        ],
      ),
    );
  }

  /// Скачивает APK с прогресс-баром и запускает установщик.
  static void _download(BuildContext context, String apkUrl) {
    final progress = ValueNotifier<double?>(null);
    var dialogOpen = true;

    void closeDialog() {
      if (dialogOpen && context.mounted) {
        dialogOpen = false;
        Navigator.of(context, rootNavigator: true).pop();
      }
    }

    void fallbackToBrowser() {
      closeDialog();
      launchUrl(Uri.parse(apkUrl), mode: LaunchMode.externalApplication);
    }

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: const Text('Скачивание обновления'),
        content: ValueListenableBuilder<double?>(
          valueListenable: progress,
          builder: (_, value, __) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              LinearProgressIndicator(value: value),
              const SizedBox(height: 12),
              Text(value == null
                  ? 'Подготовка…'
                  : '${(value * 100).round()}%'),
            ],
          ),
        ),
      ),
    );

    try {
      OtaUpdate()
          .execute(apkUrl, destinationFilename: 'love-update.apk')
          .listen((OtaEvent event) {
        switch (event.status) {
          case OtaStatus.DOWNLOADING:
            final pct = double.tryParse(event.value ?? '');
            if (pct != null) progress.value = pct / 100;
            break;
          case OtaStatus.INSTALLING:
            // Системный установщик открылся — наша часть готова.
            closeDialog();
            break;
          default:
            // Ошибка (разрешение, сеть, чексумма) — фолбэк на браузер.
            fallbackToBrowser();
            break;
        }
      }, onError: (_) => fallbackToBrowser());
    } catch (_) {
      fallbackToBrowser();
    }
  }
}
