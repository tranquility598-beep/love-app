import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'prefs/love_prefs.dart';
import '../theme/love_tokens.dart';

/// Ссылки в сообщениях пишут другие люди, поэтому всё, что ведёт за пределы
/// наших доменов, открываем только после явного подтверждения с показом
/// настоящего хоста. Парная реализация для ПК — `client/js/external-link-guard.js`.
class ExternalLink {
  const ExternalLink._();

  /// Свои домены: сайт, приглашения, API и медиа. Поддомены проверяем суффиксом
  /// с точкой, иначе `loveapp.chat.evil.com` сошёл бы за свой.
  static const _ownDomain = 'loveapp.chat';

  static bool isOwn(Uri uri) {
    final host = uri.host.toLowerCase();
    return host == _ownDomain || host.endsWith('.$_ownDomain');
  }

  /// `www.example.com` без схемы тоже считается ссылкой в тексте, поэтому
  /// дописываем https, но не трогаем адреса, где схема уже есть.
  static Uri? normalize(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    final hasScheme = RegExp(r'^[a-zA-Z][a-zA-Z0-9+.\-]*:').hasMatch(trimmed);
    final uri = Uri.tryParse(hasScheme ? trimmed : 'https://$trimmed');
    if (uri == null || uri.host.isEmpty) return null;
    return uri;
  }

  /// Открыть ссылку, спросив подтверждение для чужих сайтов.
  static Future<void> open(BuildContext context, String raw) async {
    final uri = normalize(raw);
    if (uri == null) return;
    if (!isOwn(uri) && LovePrefs.instance.getBool(K.linkWarning, true)) {
      final proceed = await _confirm(context, uri);
      if (proceed != true) return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  static Future<bool?> _confirm(BuildContext context, Uri uri) {
    var dontWarn = false;
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (innerContext, setState) => AlertDialog(
          backgroundColor: context.palette.bgTertiary,
          title: const Text('Переход на другой сайт'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
               Text(
                'Ссылка ведёт за пределы LOVE. Проверьте адрес — чужой сайт '
                'может притворяться знакомым.',
                style: TextStyle(
                  fontSize: 13.5,
                  height: 1.45,
                  color: context.palette.textSecondary,
                ),
              ),
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: context.palette.inkA(0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: context.palette.borderActive),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      uri.host,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style:  TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w900,
                        color: context.palette.textPrimary,
                      ),
                    ),
                    if (_tail(uri).isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        _tail(uri),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style:  TextStyle(
                          fontSize: 11.5,
                          height: 1.35,
                          fontFamily: LoveFonts.mono,
                          color: context.palette.textMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 4),
              // Галочка про сами предупреждения, а не про эту ссылку, поэтому
              // сохраняем её при любом ответе — иначе «отметил, а всё равно
              // спрашивает».
              InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => setState(() => dontWarn = !dontWarn),
                child: Row(
                  children: [
                    Checkbox(
                      value: dontWarn,
                      onChanged: (value) =>
                          setState(() => dontWarn = value ?? false),
                      visualDensity: VisualDensity.compact,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    const SizedBox(width: 6),
                     Expanded(
                      child: Text(
                        'Больше не предупреждать',
                        style: TextStyle(
                          fontSize: 13,
                          color: context.palette.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => _close(innerContext, false, dontWarn),
              child: const Text('Остаться'),
            ),
            FilledButton(
              onPressed: () => _close(innerContext, true, dontWarn),
              child: const Text('Перейти'),
            ),
          ],
        ),
      ),
    );
  }

  static void _close(BuildContext context, bool proceed, bool dontWarn) {
    if (dontWarn) LovePrefs.instance.setBool(K.linkWarning, false);
    Navigator.pop(context, proceed);
  }

  /// Путь с запросом — то, что после хоста. Одинокий «/» не показываем.
  static String _tail(Uri uri) {
    final path = uri.path == '/' ? '' : uri.path;
    final query = uri.hasQuery ? '?${uri.query}' : '';
    final fragment = uri.hasFragment ? '#${uri.fragment}' : '';
    return '$path$query$fragment';
  }
}
