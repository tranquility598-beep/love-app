import 'package:flutter/material.dart';

import '../../config/app_config.dart';
import '../../core/invite_links.dart';
import '../../core/network/love_api.dart';
import '../../core/realtime/app_events.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../servers/invite_prompt.dart';
import 'chat_models.dart';

/// Detects a LOVE invite link inside message text and renders a server card
/// with banner, icon, name, member count and a join button — like desktop.
///
/// Server API:
/// - `GET /servers/invite/:code/preview` → `{code, name, description, icon,
///   banner, kind, memberCount}` (+ `id` after the optional server patch)
/// - `POST /servers/join/:code` → 400 «Вы уже являетесь участником...» when
///   the user is already a member.
class InviteCard extends StatefulWidget {
  const InviteCard({required this.api, required this.code, super.key});

  final LoveApi api;
  final String code;

  /// Returns the invite code when [content] contains an invite link.
  ///
  /// Разбор живёт в [InviteLinks]: раньше здесь был свой регексп на
  /// `loveapp.chat`, и вставленная ссылка с хоста API (`api.loveapp.chat`)
  /// карточкой не становилась.
  static String? inviteCodeOf(String content) => InviteLinks.codeOf(content);

  /// [content] without the invite link, so the raw URL is not shown above
  /// the card.
  static String stripInviteLink(String content) => InviteLinks.strip(content);

  @override
  State<InviteCard> createState() => _InviteCardState();
}

class _InviteCardState extends State<InviteCard> {
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
      // Проверка «уже участник» одна на приложение — та же, что в листе
      // deep link'а: два разных ответа на один вопрос путают сильнее всего.
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
        _error = 'Приглашение не найдено или истекло';
        _loading = false;
      });
    }
  }

  Future<void> _join() async {
    setState(() => _joining = true);
    try {
      await widget.api.joinInvite(widget.code);
      if (!mounted) return;
      // Экран сфер мог быть загружен раньше — иначе новая сфера появится
      // там только после ручного pull-to-refresh.
      AppEvents.instance.spacesChanged();
      setState(() {
        _member = true;
        _joining = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Вы присоединились к «${asText(_preview?['name'], 'сфере')}»',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      final text = error.toString();
      final already = text.contains('уже являетесь');
      setState(() {
        _member = already;
        _joining = false;
      });
      if (!already) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(text)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Container(
        width: 250,
        height: 84,
        margin: const EdgeInsets.only(top: 6),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.25),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    if (_error != null) {
      return Container(
        width: 250,
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.25),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.link_off_rounded,
              size: 18,
              color: LoveColors.textMuted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                _error!,
                style: const TextStyle(
                  fontSize: 12,
                  color: LoveColors.textMuted,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final preview = _preview ?? const <String, dynamic>{};
    final name = asText(preview['name'], 'Сфера LOVE');
    final description = asText(preview['description']);
    final icon = AppConfig.mediaUrl(asText(preview['icon']));
    final banner = AppConfig.mediaUrl(asText(preview['banner']));
    final memberCount = int.tryParse(asText(preview['memberCount'])) ?? 0;

    return Container(
      width: 250,
      margin: const EdgeInsets.only(top: 6),
      clipBehavior: Clip.antiAlias,
      // Рамки нет намеренно: карточка лежит внутри пузыря сообщения,
      // и обводка давала двойной контур.
      decoration: BoxDecoration(
        color: const Color(0xF2101010),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (banner != null && banner.isNotEmpty)
            Image.network(
              banner,
              height: 72,
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stack) =>
                  const _BannerFallback(),
            )
          else
            const _BannerFallback(),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    LoveAvatar(label: name, imageUrl: icon, size: 40),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w900,
                              color: LoveColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Приглашение · ${_membersLabel(memberCount)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: LoveColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (description.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: LoveColors.textSecondary,
                      height: 1.35,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  height: 38,
                  child: _member
                      ? OutlinedButton.icon(
                          onPressed: null,
                          icon: const Icon(Icons.check_rounded, size: 16),
                          label: const Text('Вы уже вошли'),
                        )
                      : FilledButton(
                          onPressed: _joining ? null : _join,
                          child: _joining
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.black,
                                  ),
                                )
                              : const Text('Войти'),
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
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
      height: 72,
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
        size: 22,
        color: Colors.white.withValues(alpha: 0.25),
      ),
    );
  }
}
