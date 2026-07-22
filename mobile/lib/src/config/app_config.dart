class AppConfig {
  static const _rawApiBaseUrl = String.fromEnvironment(
    'LOVE_API_BASE_URL',
    defaultValue: 'https://api.loveapp.chat',
  );

  /// Product version shown in Settings/Hub (mirrors the desktop `getVersion()`
  /// fallback). Independent from the Flutter package version.
  static const productVersion = '2.0.6';
  static const website = 'https://loveapp.chat';
  static const supportEmail = 'support@loveapp.chat';

  static String get apiBaseUrl {
    var value = _rawApiBaseUrl.trim();
    while (value.endsWith('/')) {
      value = value.substring(0, value.length - 1);
    }
    return value;
  }

  static String get socketUrl => apiBaseUrl;

  static Uri apiUri(String path, [Map<String, String?>? query]) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    final cleanQuery = <String, String>{};
    if (query != null) {
      for (final entry in query.entries) {
        final value = entry.value;
        if (value != null && value.isNotEmpty) {
          cleanQuery[entry.key] = value;
        }
      }
    }

    final uri = Uri.parse('$apiBaseUrl/api$normalizedPath');
    return cleanQuery.isEmpty ? uri : uri.replace(queryParameters: cleanQuery);
  }

  static String? mediaUrl(Object? value) {
    final raw = value?.toString().trim();
    if (raw == null || raw.isEmpty) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return '$apiBaseUrl$raw';
    return '$apiBaseUrl/$raw';
  }
}
