import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;

import '../../config/app_config.dart';
import '../storage/auth_token_store.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.data});

  final String message;
  final int? statusCode;
  final Object? data;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({
    http.Client? httpClient,
    AuthTokenStore? tokenStore,
    this.timeout = const Duration(seconds: 18),
  })  : _http = httpClient ?? http.Client(),
        tokenStore = tokenStore ?? const AuthTokenStore();

  final http.Client _http;
  final AuthTokenStore tokenStore;
  final Duration timeout;

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, String?>? query,
  }) {
    return request('GET', path, query: query);
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
  }) {
    return request('POST', path, body: body);
  }

  Future<Map<String, dynamic>> put(
    String path, {
    Map<String, dynamic>? body,
  }) {
    return request('PUT', path, body: body);
  }

  Future<Map<String, dynamic>> delete(String path) {
    return request('DELETE', path);
  }

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String?>? query,
  }) async {
    final token = await tokenStore.readToken();
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    final request = http.Request(method, AppConfig.apiUri(path, query))
      ..headers.addAll(headers);
    if (body != null) {
      request.body = jsonEncode(body);
    }

    try {
      final streamed = await _http.send(request).timeout(timeout);
      final response =
          await http.Response.fromStream(streamed).timeout(timeout);
      return _decodeResponse(response);
    } on TimeoutException {
      throw const ApiException(
        'Сервер долго не отвечает. Проверьте интернет и попробуйте еще раз.',
      );
    }
  }

  Future<Map<String, dynamic>> upload(
    String path, {
    required String filePath,
    required String fieldName,
    String method = 'POST',
    Map<String, String>? fields,
    String? mimeType,
  }) async {
    final token = await tokenStore.readToken();
    final request = http.MultipartRequest(method, AppConfig.apiUri(path));
    if (token != null) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    request.fields.addAll(fields ?? const {});
    // Without an explicit content type, http sends `application/octet-stream`,
    // which the server rejects during file validation. Resolve the real MIME
    // (from the picker, or inferred from the extension) so uploads pass.
    final resolvedMime = (mimeType != null && mimeType.trim().isNotEmpty)
        ? mimeType.trim()
        : _inferMimeFromPath(filePath);
    MediaType? contentType;
    if (resolvedMime != null) {
      try {
        contentType = MediaType.parse(resolvedMime);
      } catch (_) {
        contentType = null;
      }
    }
    request.files.add(await http.MultipartFile.fromPath(
      fieldName,
      filePath,
      contentType: contentType,
    ));

    try {
      final streamed = await _http.send(request).timeout(timeout);
      final response =
          await http.Response.fromStream(streamed).timeout(timeout);
      return _decodeResponse(response);
    } on TimeoutException {
      throw const ApiException(
        'Загрузка заняла слишком много времени. Попробуйте еще раз.',
      );
    }
  }

  /// Best-effort MIME guess from a file extension, used when the picker did
  /// not supply one. Covers the types the server accepts.
  static String? _inferMimeFromPath(String filePath) {
    final dot = filePath.lastIndexOf('.');
    if (dot < 0 || dot == filePath.length - 1) return null;
    final ext = filePath.substring(dot + 1).toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'm4a':
      case 'aac':
        return 'audio/mp4';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'avi':
        return 'video/x-msvideo';
      case 'webm':
        return 'video/webm';
      case 'pdf':
        return 'application/pdf';
      case 'txt':
        return 'text/plain';
      case 'zip':
        return 'application/zip';
      default:
        return null;
    }
  }

  Map<String, dynamic> _decodeResponse(http.Response response) {
    final raw = utf8.decode(response.bodyBytes).trim();
    Object? decoded;
    if (raw.isNotEmpty) {
      try {
        decoded = jsonDecode(raw);
      } catch (_) {
        decoded = {'message': raw};
      }
    }

    final data = decoded is Map<String, dynamic>
        ? decoded
        : <String, dynamic>{'data': decoded};

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        data['message']?.toString() ?? 'Ошибка запроса',
        statusCode: response.statusCode,
        data: data,
      );
    }

    return data;
  }
}
