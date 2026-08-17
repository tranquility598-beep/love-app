import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/love_api.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../more/detail_rows.dart';
import 'settings_widgets.dart';

/// Settings → Аккаунт. Credentials (change email / username / password),
/// security (2FA toggle, logout), and the danger zone.
class AccountSettingsSection extends StatefulWidget {
  const AccountSettingsSection({required this.api, super.key});

  final LoveApi api;

  @override
  State<AccountSettingsSection> createState() => _AccountSettingsSectionState();
}

class _AccountSettingsSectionState extends State<AccountSettingsSection> {
  bool _twoFaBusy = false;

  @override
  Widget build(BuildContext context) {
    final session = AppSessionScope.of(context);
    final user = session.user;
    final created = user?.createdAt;
    final ageDays =
        created == null ? null : DateTime.now().difference(created).inDays;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Аккаунт',
          desc: 'Данные для входа и безопасность',
        ),
        const SizedBox(height: 16),
        SettingsCard(
          children: [
            SettingsActionRow(
              title: 'Электронная почта',
              subtitle: user?.email ?? '—',
              trailing: _EditButton(onTap: () => _changeEmail(session)),
            ),
            SettingsActionRow(
              title: 'Имя пользователя',
              subtitle: '@${user?.username ?? 'love'}',
              trailing: _EditButton(onTap: () => _changeUsername(session)),
            ),
            SettingsActionRow(
              title: 'Пароль',
              subtitle: user?.hasPassword == true
                  ? 'Регулярно обновляйте пароль'
                  : 'Пароль не задан',
              trailing: _EditButton(onTap: () => _changePassword()),
            ),
            SettingsValueRow(
              title: 'Дата создания',
              value: compactDate(created),
              badge: ageDays == null ? null : LoveBadge('$ageDays дн.'),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SettingsCard(
          title: 'Безопасность',
          children: [
            SettingsToggleRow(
              title: 'Двухфакторная аутентификация',
              subtitle: 'Дополнительная защита при входе',
              value: user?.twoFactorEnabled == true,
              onChanged:
                  _twoFaBusy ? null : (v) => _toggleTwoFactor(session, v),
            ),
            SettingsValueRow(
              title: 'Google OAuth',
              value: user?.hasGoogle == true ? 'Подключён' : 'Не подключён',
            ),
          ],
        ),
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: session.isBusy ? null : session.logout,
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Выйти из аккаунта'),
        ),
        const SizedBox(height: 20),
        // Danger zone
        LoveSurfaceDanger(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
               Text(
                'Опасная зона',
                style: TextStyle(
                  fontFamily: LoveFonts.mono,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 1.0,
                  color: context.palette.danger,
                ),
              ),
              const SizedBox(height: 8),
               Text(
                'Удаление аккаунта необратимо. Все сообщения, серверы и данные '
                'будут стёрты навсегда.',
                style: TextStyle(color: context.palette.textSecondary, height: 1.4),
              ),
              const SizedBox(height: 14),
              DangerButton(
                label: 'Удалить аккаунт',
                icon: Icons.delete_outline_rounded,
                onPressed: _deleteAccount,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _toggleTwoFactor(AppSession session, bool enabled) async {
    setState(() => _twoFaBusy = true);
    try {
      final response = await widget.api.toggleTwoFactor(enabled);
      final rawUser = response['user'];
      if (rawUser is Map) {
        session.updateUserFromJson(rawUser.cast<String, dynamic>());
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(enabled ? '2FA включена' : '2FA выключена')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_friendly(error))),
      );
    } finally {
      if (mounted) setState(() => _twoFaBusy = false);
    }
  }

  Future<void> _changeEmail(AppSession session) async {
    await _openAccountModal(
      title: 'Изменить почту',
      fields: const [
        _FieldSpec('email', 'Новая почта', hint: 'name@example.com'),
        _FieldSpec('password', 'Текущий пароль', obscure: true),
      ],
      onSubmit: (values) async {
        final email = values['email']?.trim() ?? '';
        if (email.isEmpty) return 'Введите новую почту';
        final response = await widget.api.updateAccount(
          email: email,
          currentPassword: values['password'] ?? '',
        );
        _applyUser(session, response, 'Почта обновлена');
        return null;
      },
    );
  }

  Future<void> _changeUsername(AppSession session) async {
    await _openAccountModal(
      title: 'Изменить имя пользователя',
      fields: const [
        _FieldSpec('username', 'Новое имя пользователя',
            hint: 'username', maxLen: 32),
        _FieldSpec('password', 'Текущий пароль', obscure: true),
      ],
      onSubmit: (values) async {
        final username = values['username']?.trim() ?? '';
        if (username.length < 2) return 'Имя — минимум 2 символа';
        final response = await widget.api.updateAccount(
          username: username,
          currentPassword: values['password'] ?? '',
        );
        _applyUser(session, response, 'Имя пользователя обновлено');
        return null;
      },
    );
  }

  Future<void> _changePassword() async {
    await _openAccountModal(
      title: 'Изменить пароль',
      fields: const [
        _FieldSpec('current', 'Текущий пароль', obscure: true),
        _FieldSpec('next', 'Новый пароль',
            obscure: true, hint: 'Минимум 8 символов', maxLen: 128),
        _FieldSpec('repeat', 'Повторите новый пароль',
            obscure: true, maxLen: 128),
      ],
      onSubmit: (values) async {
        final next = values['next'] ?? '';
        if (next.length < 8) return 'Новый пароль — минимум 8 символов';
        if (next != (values['repeat'] ?? '')) return 'Пароли не совпадают';
        await widget.api.changePassword(
          currentPassword: values['current'] ?? '',
          newPassword: next,
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Пароль изменён')),
          );
        }
        return null;
      },
    );
  }

  void _applyUser(
      AppSession session, Map<String, dynamic> response, String okMessage) {
    final rawUser = response['user'];
    if (rawUser is Map) {
      session.updateUserFromJson(rawUser.cast<String, dynamic>());
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(response['message']?.toString() ?? okMessage)),
      );
    }
  }

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor:  context.palette.bgTertiary,
        title: const Text('Удалить аккаунт?'),
        content: const Text(
          'Это действие необратимо. Все данные будут стёрты навсегда.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: context.palette.danger),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Удаление аккаунта выполняется через поддержку: '
            'support@loveapp.chat',
          ),
        ),
      );
    }
  }

  Future<void> _openAccountModal({
    required String title,
    required List<_FieldSpec> fields,
    required Future<String?> Function(Map<String, String>) onSubmit,
  }) {
    return showLoveSheet<void>(
      context,
      title: title,
      builder: (sheetContext) => _AccountForm(
        fields: fields,
        onSubmit: onSubmit,
        friendly: _friendly,
      ),
    );
  }

  String _friendly(Object error) {
    if (error is ApiException) return error.message;
    return error.toString();
  }
}

class _AccountForm extends StatefulWidget {
  const _AccountForm({
    required this.fields,
    required this.onSubmit,
    required this.friendly,
  });

  final List<_FieldSpec> fields;
  final Future<String?> Function(Map<String, String>) onSubmit;
  final String Function(Object) friendly;

  @override
  State<_AccountForm> createState() => _AccountFormState();
}

class _AccountFormState extends State<_AccountForm> {
  late final Map<String, TextEditingController> _controllers = {
    for (final f in widget.fields) f.key: TextEditingController(),
  };
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final values = {
        for (final e in _controllers.entries) e.key: e.value.text,
      };
      final result = await widget.onSubmit(values);
      if (result == null) {
        if (mounted) Navigator.of(context).pop();
      } else {
        setState(() {
          _error = result;
          _busy = false;
        });
      }
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = widget.friendly(err);
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final f in widget.fields) ...[
          TextField(
            controller: _controllers[f.key],
            obscureText: f.obscure,
            maxLength: f.maxLen,
            decoration: InputDecoration(labelText: f.label, hintText: f.hint),
          ),
          const SizedBox(height: 4),
        ],
        if (_error != null) ...[
          Text(_error!, style:  TextStyle(color: context.palette.danger)),
          const SizedBox(height: 10),
        ],
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ?  SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: context.palette.onAccent),
                )
              : const Text('Подтвердить'),
        ),
      ],
    );
  }
}

class _EditButton extends StatelessWidget {
  const _EditButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        minimumSize: const Size(0, 34),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        foregroundColor: context.palette.textPrimary,
      ),
      child: const Text('Изменить'),
    );
  }
}

class _FieldSpec {
  const _FieldSpec(this.key, this.label,
      {this.obscure = false, this.hint, this.maxLen});
  final String key;
  final String label;
  final bool obscure;
  final String? hint;
  final int? maxLen;
}

/// Danger-styled card (`.lvs-card--danger`).
class LoveSurfaceDanger extends StatelessWidget {
  const LoveSurfaceDanger({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.palette.dangerBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.palette.dangerBorder),
      ),
      child: child,
    );
  }
}
