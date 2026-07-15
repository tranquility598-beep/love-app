import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_background.dart';
import '../../widgets/love_surface.dart';
import 'auth_repository.dart';

enum _AuthMode { login, register, otp, twoFactor }

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _username = TextEditingController();
  final _code = TextEditingController();

  _AuthMode _mode = _AuthMode.login;
  String? _pendingEmail;
  String? _pendingToken;
  String? _error;
  bool _googleBusy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _username.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = AppSessionScope.of(context);
    return Scaffold(
      body: LoveBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(18),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: LoveSurface(
                  radius: 22,
                  color: LoveColors.surfaceStrong,
                  padding: const EdgeInsets.fromLTRB(22, 24, 22, 22),
                  child: AutofillGroup(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const _BrandMark(),
                        const SizedBox(height: 22),
                        if (_mode == _AuthMode.login ||
                            _mode == _AuthMode.register)
                          _AuthSwitch(
                            mode: _mode,
                            onChanged: (mode) {
                              setState(() {
                                _mode = mode;
                                _error = null;
                              });
                            },
                          ),
                        const SizedBox(height: 20),
                        Text(
                          _title,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _note,
                          style: const TextStyle(
                            color: LoveColors.textSecondary,
                            height: 1.45,
                          ),
                        ),
                        const SizedBox(height: 20),
                        ..._fieldsForMode(),
                        if (_mode == _AuthMode.login) ...[
                          const SizedBox(height: 6),
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed:
                                  session.isBusy ? null : _forgotPassword,
                              child: const Text('Забыли пароль?'),
                            ),
                          ),
                        ],
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          _ErrorBox(message: _error!),
                        ],
                        const SizedBox(height: 18),
                        FilledButton(
                          onPressed: session.isBusy ? null : _submit,
                          child: session.isBusy
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.black,
                                  ),
                                )
                              : Text(_buttonText),
                        ),
                        if (_mode == _AuthMode.login ||
                            _mode == _AuthMode.register) ...[
                          const SizedBox(height: 16),
                          const _AuthDivider(),
                          const SizedBox(height: 16),
                          _GoogleButton(
                            busy: _googleBusy,
                            onPressed: session.isBusy ? null : _startGoogleAuth,
                          ),
                        ],
                        if (_mode == _AuthMode.otp ||
                            _mode == _AuthMode.twoFactor) ...[
                          const SizedBox(height: 10),
                          TextButton(
                            onPressed: session.isBusy
                                ? null
                                : () {
                                    setState(() {
                                      _mode = _AuthMode.login;
                                      _code.clear();
                                      _pendingToken = null;
                                      _error = null;
                                    });
                                  },
                            child: const Text('Вернуться ко входу'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String get _title {
    return switch (_mode) {
      _AuthMode.login => 'С возвращением',
      _AuthMode.register => 'Создать аккаунт',
      _AuthMode.otp => 'Подтвердите почту',
      _AuthMode.twoFactor => 'Код входа',
    };
  }

  String get _note {
    return switch (_mode) {
      _AuthMode.login => 'Войдите в Love, чтобы начать общение.',
      _AuthMode.register =>
        'После регистрации backend отправит код подтверждения на почту.',
      _AuthMode.otp =>
        'Введите код, который пришел на ${_pendingEmail ?? _email.text}.',
      _AuthMode.twoFactor =>
        'Введите 2FA-код, который пришел на ${_pendingEmail ?? _email.text}.',
    };
  }

  String get _buttonText {
    return switch (_mode) {
      _AuthMode.login => 'Войти',
      _AuthMode.register => 'Зарегистрироваться',
      _AuthMode.otp => 'Подтвердить',
      _AuthMode.twoFactor => 'Продолжить',
    };
  }

  List<Widget> _fieldsForMode() {
    final fields = <Widget>[];
    if (_mode == _AuthMode.register) {
      fields.add(
        _LoveField(
          controller: _username,
          label: 'Имя',
          hint: 'aleks',
          icon: Icons.person_outline,
          autofillHints: const [AutofillHints.username],
          textInputAction: TextInputAction.next,
        ),
      );
      fields.add(const SizedBox(height: 12));
    }
    if (_mode == _AuthMode.login || _mode == _AuthMode.register) {
      fields.add(
        _LoveField(
          controller: _email,
          label: 'Email',
          hint: 'you@example.com',
          icon: Icons.alternate_email_rounded,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          textInputAction: TextInputAction.next,
        ),
      );
      fields.add(const SizedBox(height: 12));
      fields.add(
        _LoveField(
          controller: _password,
          label: 'Пароль',
          hint: 'Минимум 8 символов',
          icon: Icons.lock_outline_rounded,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
        ),
      );
    } else {
      fields.add(
        _LoveField(
          controller: _code,
          label: 'Код',
          hint: '000000',
          icon: Icons.pin_outlined,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
        ),
      );
    }
    return fields;
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    final session = AppSessionScope.of(context);
    try {
      final result = await switch (_mode) {
        _AuthMode.login => session.login(_email.text, _password.text),
        _AuthMode.register => session.register(
            username: _username.text,
            email: _email.text,
            password: _password.text,
          ),
        _AuthMode.otp =>
          session.verifyOtp(_pendingEmail ?? _email.text, _code.text),
        _AuthMode.twoFactor =>
          session.verifyTwoFactor(_pendingToken ?? '', _code.text),
      };

      if (!mounted) return;
      switch (result.type) {
        case AuthResultType.authenticated:
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(result.message ?? 'Готово')),
          );
          break;
        case AuthResultType.needsOtp:
          setState(() {
            _mode = _AuthMode.otp;
            _pendingEmail = result.email;
            _code.clear();
          });
          break;
        case AuthResultType.needsTwoFactor:
          setState(() {
            _mode = _AuthMode.twoFactor;
            _pendingEmail = result.email;
            _pendingToken = result.pendingToken;
            _code.clear();
          });
          break;
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    }
  }

  Future<void> _startGoogleAuth() async {
    setState(() {
      _error = null;
      _googleBusy = true;
    });
    try {
      final uri = AppSessionScope.of(context).authRepository.googleAuthUri;
      final opened = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        setState(() => _error = 'Не удалось открыть Google OAuth');
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _googleBusy = false);
    }
  }

  Future<void> _forgotPassword() async {
    final controller = TextEditingController(text: _email.text.trim());
    final message = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        var submitting = false;
        String? localError;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submit() async {
              final email = controller.text.trim();
              if (email.isEmpty) {
                setDialogState(() => localError = 'Введите email');
                return;
              }
              setDialogState(() {
                submitting = true;
                localError = null;
              });
              try {
                final session = AppSessionScope.of(context);
                final result = await session.forgotPassword(email);
                if (context.mounted) Navigator.of(context).pop(result);
              } catch (error) {
                setDialogState(() {
                  submitting = false;
                  localError = error.toString();
                });
              }
            }

            return AlertDialog(
              backgroundColor: LoveColors.surfaceStrong,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: const BorderSide(color: LoveColors.border),
              ),
              title: const Text('Восстановить пароль'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Отправим письмо со ссылкой и кодом для сброса.',
                    style: TextStyle(
                      color: LoveColors.textSecondary,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: controller,
                    enabled: !submitting,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      hintText: 'you@example.com',
                      prefixIcon: Icon(Icons.alternate_email_rounded),
                    ),
                    onSubmitted: (_) => submitting ? null : submit(),
                  ),
                  if (localError != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      localError!,
                      style: const TextStyle(color: LoveColors.danger),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed:
                      submitting ? null : () => Navigator.of(context).pop(),
                  child: const Text('Отмена'),
                ),
                FilledButton(
                  onPressed: submitting ? null : submit,
                  child: submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.black,
                          ),
                        )
                      : const Text('Отправить'),
                ),
              ],
            );
          },
        );
      },
    );
    controller.dispose();
    if (!mounted || message == null) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 58,
          height: 58,
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: SvgPicture.asset('assets/icons/auth_mark.svg'),
        ),
        const SizedBox(height: 12),
        const Text(
          'LOVE',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w900,
            letterSpacing: 4,
          ),
        ),
      ],
    );
  }
}

class _AuthSwitch extends StatelessWidget {
  const _AuthSwitch({required this.mode, required this.onChanged});

  final _AuthMode mode;
  final ValueChanged<_AuthMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: LoveColors.border),
      ),
      child: Row(
        children: [
          _SwitchButton(
            label: 'Вход',
            selected: mode == _AuthMode.login,
            onTap: () => onChanged(_AuthMode.login),
          ),
          _SwitchButton(
            label: 'Регистрация',
            selected: mode == _AuthMode.register,
            onTap: () => onChanged(_AuthMode.register),
          ),
        ],
      ),
    );
  }
}

class _AuthDivider extends StatelessWidget {
  const _AuthDivider();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider(color: LoveColors.border)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            'или',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: LoveColors.textMuted,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ),
        const Expanded(child: Divider(color: LoveColors.border)),
      ],
    );
  }
}

class _GoogleButton extends StatelessWidget {
  const _GoogleButton({required this.busy, required this.onPressed});

  final bool busy;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: busy ? null : onPressed,
      icon: busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const _GoogleMark(),
      label: const Text('Продолжить с Google'),
      style: OutlinedButton.styleFrom(
        foregroundColor: LoveColors.textPrimary,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: LoveColors.borderActive),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}

class _GoogleMark extends StatelessWidget {
  const _GoogleMark();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 18,
      height: 18,
      child: CustomPaint(painter: _GoogleMarkPainter()),
    );
  }
}

class _GoogleMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    final rect = Offset.zero & size;
    stroke.color = LoveColors.textPrimary;
    canvas.drawArc(rect.deflate(2), -0.1, 5.5, false, stroke);
    canvas.drawLine(
      Offset(size.width * 0.55, size.height * 0.52),
      Offset(size.width - 2, size.height * 0.52),
      stroke,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _SwitchButton extends StatelessWidget {
  const _SwitchButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(11),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: selected ? Colors.black : LoveColors.textSecondary,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LoveField extends StatelessWidget {
  const _LoveField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.keyboardType,
    this.obscureText = false,
    this.autofillHints,
    this.textInputAction,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final TextInputType? keyboardType;
  final bool obscureText;
  final Iterable<String>? autofillHints;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      autofillHints: autofillHints,
      textInputAction: textInputAction,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon),
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: LoveColors.danger.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: LoveColors.danger.withValues(alpha: 0.28)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Text(
          message,
          style: const TextStyle(color: LoveColors.textPrimary, height: 1.35),
        ),
      ),
    );
  }
}
