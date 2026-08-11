import 'package:flutter/material.dart';

import '../../config/app_config.dart';
import '../../core/network/love_api.dart';
import '../../core/realtime/app_events.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../chat/chat_models.dart';

/// Уже участник этого пространства?
///
/// Сервер сообщает об этом только в ответ на попытку вступить, а спрашивать
/// разрешение задним числом поздно. Поэтому до вступления сверяем превью со
/// списком своих пространств: по id, а если старый backend его не отдал —
/// по названию.
///
/// Проверка best-effort: при ошибке возвращаем false, потому что кнопка
/// «Вступить» всё равно корректно обработает ответ «вы уже участник».
Future<bool> inviteTargetJoined(
  LoveApi api,
  Map<String, dynamic> preview,
) async {
  try {
    final spaces = await api.servers();
    final previewId = asId(preview['id']);
    final previewName = asText(preview['name']);
    return spaces.any((space) {
      if (previewId.isNotEmpty) return asId(space['_id']) == previewId;
      return previewName.isNotEmpty && asText(space['name']) == previewName;
    });
  } catch (_) {
    return false;
  }
}

/// Приглашение, открытое ссылкой `love-app://invite/КОД`.
///
/// Раньше deep link вступал молча: тапнул ссылку в чужом чате — и ты уже
/// участник, без единого вопроса. Здесь сначала показываем, куда приглашают,
/// и решение оставляем человеку.
///
/// Возвращает название пространства, если пользователь вступил именно сейчас,
/// и null во всех остальных случаях (отказ, уже участник, битая ссылка).
Future<String?> showInvitePrompt({
  required BuildContext context,
  required LoveApi api,
  required String code,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _InvitePromptSheet(api: api, code: code),
  );
}

class _InvitePromptSheet extends StatefulWidget {
  const _InvitePromptSheet({required this.api, required this.code});

  final LoveApi api;
  final String code;

  @override
  State<_InvitePromptSheet> createState() => _InvitePromptSheetState();
}

class _InvitePromptSheetState extends State<_InvitePromptSheet> {
  Map<String, dynamic>? _preview;
  bool _loading = true;
  bool _joining = false;
  bool _member = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final preview = await widget.api.invitePreview(widget.code);
      final member = await inviteTargetJoined(widget.api, preview);
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _member = member;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Приглашение не найдено или истекло. Попроси новую ссылку.';
        _loading = false;
      });
    }
  }

  Future<void> _join() async {
    setState(() => _joining = true);
    try {
      await widget.api.joinInvite(widget.code);
      if (!mounted) return;
      // Список сфер на экране мог быть загружен до вступления — просим
      // обновиться, иначе новая сфера появится только после ручного pull.
      AppEvents.instance.spacesChanged();
      Navigator.of(context).pop(asText(_preview?['name'], 'сфере'));
    } catch (error) {
      if (!mounted) return;
      final text = error.toString();
      if (text.contains('уже являетесь')) {
        setState(() {
          _member = true;
          _joining = false;
        });
        return;
      }
      setState(() {
        _joining = false;
        _error = text;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: const BoxDecoration(
          color: LoveColors.surfaceStrong,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: LoveColors.borderActive,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 44),
                  child: SizedBox(
                    width: 26,
                    height: 26,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              else if (_preview == null)
                _InviteError(
                  message: _error ?? 'Приглашение недействительно',
                  onClose: () => Navigator.of(context).pop(),
                )
              else
                _InviteBody(
                  preview: _preview!,
                  member: _member,
                  joining: _joining,
                  error: _error,
                  onJoin: _join,
                  onClose: () => Navigator.of(context).pop(),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InviteError extends StatelessWidget {
  const _InviteError({required this.message, required this.onClose});

  final String message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.link_off_rounded,
            size: 30,
            color: LoveColors.textMuted,
          ),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 14,
              height: 1.45,
              color: LoveColors.textSecondary,
            ),
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: OutlinedButton(
              onPressed: onClose,
              child: const Text('Закрыть'),
            ),
          ),
        ],
      ),
    );
  }
}

class _InviteBody extends StatelessWidget {
  const _InviteBody({
    required this.preview,
    required this.member,
    required this.joining,
    required this.error,
    required this.onJoin,
    required this.onClose,
  });

  final Map<String, dynamic> preview;
  final bool member;
  final bool joining;
  final String? error;
  final VoidCallback onJoin;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final name = asText(preview['name'], 'Сфера LOVE');
    final description = asText(preview['description']);
    final icon = AppConfig.mediaUrl(asText(preview['icon']));
    final banner = AppConfig.mediaUrl(asText(preview['banner']));
    final isRoom = asText(preview['kind']) == 'room';
    final memberCount = int.tryParse(asText(preview['memberCount'])) ?? 0;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: banner == null || banner.isEmpty
                ? const _BannerFallback()
                : Image.network(
                    banner,
                    height: 104,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const _BannerFallback(),
                  ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  LoveAvatar(label: name, imageUrl: icon, size: 52),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ПРИГЛАШЕНИЕ В LOVE',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.3,
                            color: LoveColors.textMuted,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            color: LoveColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${isRoom ? 'Комната' : 'Сфера'} · '
                          '${_membersLabel(memberCount)}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: LoveColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (description.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  description,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.5,
                    height: 1.45,
                    color: LoveColors.textSecondary,
                  ),
                ),
              ],
              if (error != null) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: LoveColors.dangerBg,
                    border: Border.all(color: LoveColors.dangerBorder),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    error!,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: LoveColors.danger,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 18),
              if (member)
                SizedBox(
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: onClose,
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: Text(
                      isRoom
                          ? 'Вы уже в этой комнате'
                          : 'Вы уже в этой сфере',
                    ),
                  ),
                )
              else ...[
                SizedBox(
                  height: 48,
                  child: FilledButton(
                    onPressed: joining ? null : onJoin,
                    child: joining
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.black,
                            ),
                          )
                        : Text(isRoom ? 'Вступить в комнату' : 'Вступить'),
                  ),
                ),
                const SizedBox(height: 9),
                SizedBox(
                  height: 46,
                  child: TextButton(
                    onPressed: joining ? null : onClose,
                    child: const Text('Не сейчас'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  String _membersLabel(int count) {
    final mod100 = count % 100;
    final mod10 = count % 10;
    if (mod100 >= 11 && mod100 <= 14) return '$count участников';
    if (mod10 == 1) return '$count участник';
    if (mod10 >= 2 && mod10 <= 4) return '$count участника';
    return '$count участников';
  }
}

class _BannerFallback extends StatelessWidget {
  const _BannerFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 104,
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: 0.1),
            Colors.white.withValues(alpha: 0.02),
          ],
        ),
      ),
      child: Icon(
        Icons.favorite,
        size: 26,
        color: Colors.white.withValues(alpha: 0.22),
      ),
    );
  }
}
