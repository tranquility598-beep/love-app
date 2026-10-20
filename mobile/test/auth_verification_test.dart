import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:love_mobile/src/core/network/api_client.dart';
import 'package:love_mobile/src/core/storage/auth_token_store.dart';
import 'package:love_mobile/src/features/auth/auth_repository.dart';

class _MemoryTokenStore extends AuthTokenStore {
  String? token;

  @override
  Future<String?> readToken() async => token;

  @override
  Future<void> saveToken(String value) async => token = value;

  @override
  Future<void> clear() async => token = null;
}

/// Репозиторий с подменённым сервером: [reply] получает путь и тело запроса.
AuthRepository _repo(http.Response Function(String path, Map body) reply) {
  final store = _MemoryTokenStore();
  final client = MockClient((request) async {
    final body = request.body.isEmpty ? <String, dynamic>{} : jsonDecode(request.body) as Map;
    return reply(request.url.path, body);
  });
  return AuthRepository(api: ApiClient(httpClient: client, tokenStore: store), tokenStore: store);
}

http.Response _json(int status, Map<String, dynamic> body) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

void main() {
  test('вход в неподтверждённый аккаунт ведёт на экран кода, а не в ошибку', () async {
    final repo = _repo((path, body) => _json(403, {
          'requireVerification': true,
          'email': 'typo@example.test',
          'registrationToken': 'reg-token',
          'retryAfter': 42,
          'message': 'Введите код из последнего письма или исправьте адрес почты.',
        }));
    final result = await repo.login('typo@example.test', 'secret-pass1');
    expect(result.type, AuthResultType.needsOtp);
    expect(result.email, 'typo@example.test');
    expect(result.registrationToken, 'reg-token');
    expect(result.retryAfter, 42);
    expect(result.deliveryFailed, isFalse);
  });

  test('регистрация без отправленного письма — тоже экран кода с пометкой', () async {
    final repo = _repo((path, body) => _json(503, {
          'requireVerification': true,
          'code': 'EMAIL_SEND_FAILED',
          'email': 'new@example.test',
          'registrationToken': 'reg-token',
          'retryAfter': 0,
          'message': 'Аккаунт создан, но письмо не отправлено.',
        }));
    final result = await repo.register(username: 'newbie', email: 'new@example.test', password: 'secret-pass1');
    expect(result.type, AuthResultType.needsOtp);
    expect(result.deliveryFailed, isTrue);
    expect(result.retryAfter, 0);
  });

  test('обычный неверный пароль остаётся ошибкой', () async {
    final repo = _repo((path, body) => _json(401, {'message': 'Неверный email или пароль'}));
    expect(repo.login('a@example.test', 'wrong'), throwsA(isA<ApiException>()));
  });

  test('код уже принят — EmailAlreadyVerified с почтой для входа', () async {
    final repo = _repo((path, body) => _json(409, {
          'code': 'EMAIL_ALREADY_VERIFIED',
          'email': 'done@example.test',
          'message': 'Почта уже подтверждена. Войдите с паролем.',
        }));
    expect(
      repo.verifyOtp('done@example.test', '123456'),
      throwsA(isA<EmailAlreadyVerified>().having((e) => e.email, 'email', 'done@example.test')),
    );
  });

  test('повторная отправка: таймер из ответа, слишком рано — RetryLater', () async {
    var calls = 0;
    final repo = _repo((path, body) {
      expect(path, '/api/auth/resend-otp');
      calls++;
      return calls == 1
          ? _json(200, {'message': 'Новый код отправлен', 'retryAfter': 60})
          : _json(429, {'code': 'OTP_COOLDOWN', 'retryAfter': 37, 'message': 'Слишком частые запросы'});
    });
    final delivery = await repo.resendOtp('a@example.test');
    expect(delivery.retryAfter, 60);
    expect(
      repo.resendOtp('a@example.test'),
      throwsA(isA<RetryLater>().having((e) => e.retryAfter, 'retryAfter', 37)),
    );
  });

  test('смена почты отправляет токен и новый адрес, возвращает новый токен', () async {
    final repo = _repo((path, body) {
      expect(path, '/api/auth/registration-email');
      expect(body['registrationToken'], 'old-token');
      expect(body['email'], 'right@example.test');
      return _json(200, {
        'requireVerification': true,
        'email': 'right@example.test',
        'registrationToken': 'new-token',
        'retryAfter': 60,
        'message': 'Код отправлен на новую почту',
      });
    });
    final result = await repo.changeRegistrationEmail('old-token', ' right@example.test ');
    expect(result.type, AuthResultType.needsOtp);
    expect(result.email, 'right@example.test');
    expect(result.registrationToken, 'new-token');
    expect(result.retryAfter, 60);
  });
}
