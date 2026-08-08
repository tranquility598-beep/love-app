class SafeDiagnosticLog {
  SafeDiagnosticLog._();

  static final SafeDiagnosticLog instance = SafeDiagnosticLog._();

  static const _capacity = 120;
  final List<String> _entries = [];

  void network(String method, String path, int statusCode) {
    add('network $method ${_safePath(path)} status=$statusCode');
  }

  void socket(String event) {
    add('socket ${_clean(event)}');
  }

  void add(String value) {
    final line = '${DateTime.now().toUtc().toIso8601String()} ${_clean(value)}';
    _entries.add(line);
    if (_entries.length > _capacity) {
      _entries.removeRange(0, _entries.length - _capacity);
    }
  }

  String snapshot() => _entries.join('\n');

  String _safePath(String value) {
    final clean = value.split('?').first;
    return clean
        .replaceAll(RegExp(r'/[0-9a-fA-F]{20,}'), '/:id')
        .replaceAll(RegExp(r'/[^/]+@[^/]+'), '/:account');
  }

  String _clean(String value) {
    return value
        .replaceAll(
            RegExp(r'Bearer\s+\S+', caseSensitive: false), 'Bearer [REDACTED]')
        .replaceAll(RegExp(r'\beyJ[\w-]+\.[\w-]+\.[\w-]+\b'), '[REDACTED_JWT]')
        .replaceAll(
          RegExp(r'(token|password|secret|authorization)\s*[:=]\s*\S+',
              caseSensitive: false),
          r'$1=[REDACTED]',
        )
        .replaceAll(RegExp(r'[\r\n]+'), ' ')
        .trim();
  }
}
