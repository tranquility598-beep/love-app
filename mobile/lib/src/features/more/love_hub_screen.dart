import 'package:flutter/material.dart';

import '../../config/app_config.dart';
import '../../core/prefs/love_prefs.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_background.dart';
import '../settings/settings_widgets.dart';
import '../shell/screen_frame.dart';

/// Love Hub — the community bento dashboard, ported 1:1 from the desktop
/// `#view-hub`. It is fully static/local (no server): hero, version stat,
/// useful links (rules / roadmap), Dev Log with voting, and update history.
class LoveHubScreen extends StatelessWidget {
  const LoveHubScreen({super.key});

  String get _version => AppConfig.productVersion;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LoveBackground(
        child: ScreenFrame(
          title: 'Love Hub',
          leading: IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
            children: [
              const Text(
                'Центр управления сообществом и обновлениями',
                style: TextStyle(color: LoveColors.textSecondary, fontSize: 14),
              ),
              const SizedBox(height: 14),
              // Action buttons
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _HubButton(
                    label: 'Dev Log',
                    primary: true,
                    onTap: () => _openDevLog(context),
                  ),
                  _HubButton(
                    label: 'История обновлений',
                    onTap: () => _openUpdates(context),
                  ),
                  _HubButton(
                    label: 'Все идеи',
                    onTap: () => _openIdeas(context),
                  ),
                  _HubButton(
                    label: 'Предложить идею',
                    onTap: () => _openForm(context, isBug: false),
                  ),
                  _HubButton(
                    label: 'Сообщить об ошибке',
                    onTap: () => _openForm(context, isBug: true),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              // Hero
              _BentoCard(
                tag: 'Текущая версия',
                onTap: () => _openUpdates(context),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Love App v$_version',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Спасибо, что вы с нами. Полная история обновлений и '
                      'голосование за идеи появятся в одном из ближайших '
                      'релизов.',
                      style: TextStyle(
                          color: LoveColors.textSecondary, height: 1.45),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Version stat
              _BentoCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Версия',
                      style: TextStyle(
                        fontFamily: LoveFonts.mono,
                        fontSize: 11,
                        letterSpacing: 1.0,
                        color: LoveColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'v$_version',
                      style: const TextStyle(
                        fontFamily: LoveFonts.mono,
                        fontSize: 40,
                        fontWeight: FontWeight.w500,
                        height: 1.0,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'установлена',
                      style:
                          TextStyle(color: LoveColors.textMuted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Top idea
              _BentoCard(
                tag: 'Идеи',
                tagStatus: 'Скоро',
                onTap: () => _openIdeas(context),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Голосование за идеи',
                      style: TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Голосуйте за лучшие предложения в реальном времени. '
                      'Функция появится в следующем обновлении.',
                      style: TextStyle(
                          color: LoveColors.textSecondary, height: 1.4),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Useful links
              _BentoCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Полезное',
                      style: TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 12),
                    _LinkRow(
                      label: 'Правила сообщества',
                      onTap: () => _openInfo(context, _rulesInfo),
                    ),
                    const SizedBox(height: 8),
                    _LinkRow(
                      label: 'Roadmap проекта',
                      onTap: () => _openInfo(context, _roadmapInfo),
                    ),
                    const SizedBox(height: 8),
                    _LinkRow(
                      label: 'Сообщить об ошибке',
                      onTap: () => _openForm(context, isBug: true),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Minor update / history
              _BentoCard(
                tag: 'Обновления',
                onTap: () => _openUpdates(context),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('История версий',
                        style: TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    const Text(
                      'Полный список изменений будет доступен здесь.',
                      style: TextStyle(
                          color: LoveColors.textSecondary, height: 1.4),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Dev Log
              _BentoCard(
                tag: 'Dev Log',
                tagSolid: true,
                onTap: () => _openDevLog(context),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Заметки разработки',
                        style: TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    const Text(
                      'Голосуйте за идеи и направление развития — ♥ за, '
                      '💔 против.',
                      style: TextStyle(
                          color: LoveColors.textSecondary, height: 1.4),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Text(
                          'Открыть и проголосовать',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: Colors.white.withValues(alpha: 0.9),
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.arrow_forward_rounded, size: 16),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Modals ────────────────────────────────────────────────────────────────

  void _openUpdates(BuildContext context) {
    final updates = _seedUpdates(_version);
    showLoveSheet<void>(
      context,
      title: 'История обновлений',
      builder: (context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final u in updates) _UpdateItem(update: u),
        ],
      ),
    );
  }

  void _openIdeas(BuildContext context) {
    showLoveSheet<void>(
      context,
      title: 'Идеи сообщества',
      builder: (context) => const _HubEmptyState(
        emoji: '💡',
        title: 'Голосование за идеи',
        text: 'Раздел предложений и народного голосования появится в '
            'следующем обновлении после запуска админ-панели.',
      ),
    );
  }

  void _openForm(BuildContext context, {required bool isBug}) {
    showLoveSheet<void>(
      context,
      title: isBug ? 'Сообщить об ошибке' : 'Предложить идею',
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _HubEmptyState(
            emoji: isBug ? '🐛' : '💡',
            title: isBug ? 'Раздел в разработке' : 'Функция появится позже',
            text: isBug
                ? 'Отправка баг-репортов и публичное отслеживание ошибок '
                    'будут реализованы в ближайшем обновлении.'
                : 'Раздел народных предложений и голосования за идеи находится '
                    'на стадии проектирования.',
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Понятно'),
            ),
          ),
        ],
      ),
    );
  }

  void _openInfo(BuildContext context, _HubInfo info) {
    showLoveSheet<void>(
      context,
      title: info.title,
      builder: (context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            info.lead,
            style: const TextStyle(color: LoveColors.textSecondary, height: 1.5),
          ),
          const SizedBox(height: 16),
          for (var i = 0; i < info.items.length; i++)
            _InfoItem(index: i + 1, item: info.items[i], numbered: info.numbered),
          if (info.note != null) ...[
            const SizedBox(height: 12),
            LoveBanner(info.note!),
          ],
        ],
      ),
    );
  }

  void _openDevLog(BuildContext context) {
    showLoveSheet<void>(
      context,
      title: 'Dev Log',
      builder: (context) => const _DevLogFeed(),
    );
  }
}

// ── Bento card ────────────────────────────────────────────────────────────────

class _BentoCard extends StatelessWidget {
  const _BentoCard({
    required this.child,
    this.tag,
    this.tagStatus,
    this.tagSolid = false,
    this.onTap,
  });

  final Widget child;
  final String? tag;
  final String? tagStatus;
  final bool tagSolid;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0x0DFFFFFF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (tag != null) ...[
            Row(
              children: [
                _BentoTag(tag!, solid: tagSolid),
                if (tagStatus != null) ...[
                  const SizedBox(width: 8),
                  _BentoTag(tagStatus!, muted: true),
                ],
                const Spacer(),
                if (onTap != null)
                  const Icon(Icons.north_east_rounded,
                      size: 16, color: LoveColors.textMuted),
              ],
            ),
            const SizedBox(height: 14),
          ],
          child,
        ],
      ),
    );
    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: content,
      ),
    );
  }
}

class _BentoTag extends StatelessWidget {
  const _BentoTag(this.text, {this.solid = false, this.muted = false});
  final String text;
  final bool solid;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: solid ? Colors.white : Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(6),
        border:
            solid ? null : Border.all(color: LoveColors.borderActive),
      ),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          fontFamily: LoveFonts.mono,
          fontSize: 10,
          letterSpacing: 0.6,
          fontWeight: FontWeight.w500,
          color: solid
              ? Colors.black
              : muted
                  ? LoveColors.textMuted
                  : LoveColors.textSecondary,
        ),
      ),
    );
  }
}

class _HubButton extends StatelessWidget {
  const _HubButton({
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  final String label;
  final bool primary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (primary) {
      return FilledButton(onPressed: onTap, child: Text(label));
    }
    return OutlinedButton(onPressed: onTap, child: Text(label));
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.02),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: LoveColors.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w500, fontSize: 14)),
              ),
              const Icon(Icons.north_east_rounded,
                  size: 15, color: LoveColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Update history item ───────────────────────────────────────────────────────

class _HubUpdate {
  const _HubUpdate({
    required this.version,
    required this.date,
    required this.tag,
    required this.title,
    required this.desc,
    required this.changes,
  });

  final String version;
  final String date;
  final String tag;
  final String title;
  final String desc;
  final List<String> changes;
}

List<_HubUpdate> _seedUpdates(String version) => [
      _HubUpdate(
        version: 'v$version',
        date: '',
        tag: 'Текущая версия',
        title: 'Love App v$version',
        desc: 'Уведомления: нативные на ПК, категории в панели, рабочие '
            'заявки. Камера-флип на мобиле.',
        changes: const [
          'Панель уведомлений: вкладки «Обычные» и «Системные»',
          'Заявки в друзья прямо из уведомлений — кнопки «Принять» / «Отклонить»',
          'Нативные ПК-уведомления при свёрнутом окне (сообщения, заявки, '
              'упоминания, звонки) + иконка',
          'Кнопка разворота камеры (фронт/зад) на мобиле',
          'Авто-обновления и канал Beta (из 2.0.3)',
        ],
      ),
    ];

class _UpdateItem extends StatelessWidget {
  const _UpdateItem({required this.update});
  final _HubUpdate update;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: LoveColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(update.title,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 8),
              Text(update.version,
                  style: const TextStyle(
                      fontFamily: LoveFonts.mono,
                      fontSize: 12.5,
                      color: LoveColors.textSecondary)),
            ],
          ),
          const SizedBox(height: 6),
          _BentoTag(update.tag),
          const SizedBox(height: 10),
          Text(update.desc,
              style: const TextStyle(
                  color: LoveColors.textSecondary, height: 1.4)),
          const SizedBox(height: 10),
          for (final change in update.changes)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('•  ',
                      style: TextStyle(color: LoveColors.textMuted)),
                  Expanded(
                    child: Text(change,
                        style: const TextStyle(
                            color: LoveColors.textSecondary,
                            fontSize: 13,
                            height: 1.35)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _HubEmptyState extends StatelessWidget {
  const _HubEmptyState({
    required this.emoji,
    required this.title,
    required this.text,
  });

  final String emoji;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 8),
      child: Column(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 44)),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: LoveFonts.serif,
              fontStyle: FontStyle.italic,
              fontSize: 19,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(
                color: LoveColors.textSecondary, height: 1.45),
          ),
        ],
      ),
    );
  }
}

// ── Info modal content (rules / roadmap) ──────────────────────────────────────

class _HubInfo {
  const _HubInfo({
    required this.title,
    required this.lead,
    required this.items,
    this.note,
    this.numbered = true,
  });

  final String title;
  final String lead;
  final List<_InfoRow> items;
  final String? note;
  final bool numbered;
}

class _InfoRow {
  const _InfoRow(this.title, this.text, {this.badge});
  final String title;
  final String text;
  final String? badge;
}

const _rulesInfo = _HubInfo(
  title: 'Правила сообщества',
  lead: 'Love — это уютное пространство. Чтобы всем здесь было хорошо, '
      'придерживайтесь нескольких простых правил.',
  numbered: true,
  items: [
    _InfoRow('Уважение.',
        'Никаких оскорблений, травли и дискриминации. Относитесь к другим '
            'так, как хотели бы, чтобы относились к вам.'),
    _InfoRow('Без спама.',
        'Не засоряйте чаты рекламой, флудом и повторяющимися сообщениями.'),
    _InfoRow('Безопасность.',
        'Не делитесь чужими личными данными и не выдавайте себя за других '
            'людей.'),
    _InfoRow('Контент 18+.',
        'Запрещён нелегальный и оскорбляющий контент. Будьте тактичны.'),
    _InfoRow('Помощь.',
        'Нашли нарушение — сообщите через «Сообщить об ошибке» или поддержку.'),
  ],
  note: 'Нарушение правил может привести к ограничению доступа к приложению.',
);

const _roadmapInfo = _HubInfo(
  title: 'Roadmap проекта',
  lead: 'Над чем мы работаем и что ждёт Love в ближайших обновлениях.',
  numbered: false,
  items: [
    _InfoRow('Новый дизайн (Wabi-Sabi)',
        'Полностью переработанный визуальный стиль приложения.',
        badge: 'Готово'),
    _InfoRow('Голосовые комнаты 2.0',
        'Новый дизайн войса с «орбами присутствия» и адаптивом.',
        badge: 'В работе'),
    _InfoRow('Кастомные звуки и стикеры',
        'Загрузка своих звуков уведомлений и наборов стикеров.',
        badge: 'Запланировано'),
    _InfoRow('Веб-версия Love',
        'Доступ к приложению прямо из браузера, без установки.',
        badge: 'Запланировано'),
  ],
);

class _InfoItem extends StatelessWidget {
  const _InfoItem({
    required this.index,
    required this.item,
    required this.numbered,
  });

  final int index;
  final _InfoRow item;
  final bool numbered;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (numbered)
            Container(
              width: 24,
              height: 24,
              margin: const EdgeInsets.only(right: 12, top: 1),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.06),
                border: Border.all(color: LoveColors.border),
              ),
              child: Text('$index',
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700)),
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(item.title,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 14.5)),
                    ),
                    if (item.badge != null) ...[
                      const SizedBox(width: 8),
                      LoveBadge(item.badge!),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(item.text,
                    style: const TextStyle(
                        color: LoveColors.textSecondary,
                        fontSize: 13,
                        height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Dev Log feed with voting ──────────────────────────────────────────────────

class _DevLogPost {
  const _DevLogPost({
    required this.id,
    required this.date,
    required this.text,
    required this.hearts,
    required this.broken,
  });

  final String id;
  final String date;
  final String text;
  final int hearts;
  final int broken;
}

const _devLogSeed = <_DevLogPost>[
  _DevLogPost(
    id: 'dl1',
    date: '10 июня',
    text: 'Переработал экран голосовых каналов — участники теперь в виде '
        '«орбов присутствия» с живой аурой у говорящего. Как вам такой подход?',
    hearts: 42,
    broken: 6,
  ),
  _DevLogPost(
    id: 'dl2',
    date: '8 июня',
    text: 'Думаю добавить авто-переключение тёмной/светлой темы по системным '
        'настройкам. Нужно вам это?',
    hearts: 88,
    broken: 12,
  ),
  _DevLogPost(
    id: 'dl3',
    date: '5 июня',
    text: 'Веб-версия Love — делать её в первую очередь, или сначала довести '
        'десктоп и мобильный билд?',
    hearts: 65,
    broken: 33,
  ),
];

class _DevLogFeed extends StatefulWidget {
  const _DevLogFeed();

  @override
  State<_DevLogFeed> createState() => _DevLogFeedState();
}

class _DevLogFeedState extends State<_DevLogFeed> {
  late Map<String, String> _votes = LovePrefs.instance.devLogVotes();

  void _vote(String id, String choice) {
    final current = _votes[id];
    final next = current == choice ? null : choice;
    setState(() {
      if (next == null) {
        _votes = {..._votes}..remove(id);
      } else {
        _votes = {..._votes, id: next};
      }
    });
    LovePrefs.instance.setDevLogVote(id, next);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text(
            'Заметки разработки. Голосуйте за идеи — ♥ за, 💔 против.',
            style: TextStyle(color: LoveColors.textMuted, fontSize: 12.5),
          ),
        ),
        for (final post in _devLogSeed)
          _DevLogCard(
            post: post,
            vote: _votes[post.id],
            onVote: (choice) => _vote(post.id, choice),
          ),
      ],
    );
  }
}

class _DevLogCard extends StatelessWidget {
  const _DevLogCard({
    required this.post,
    required this.vote,
    required this.onVote,
  });

  final _DevLogPost post;
  final String? vote;
  final ValueChanged<String> onVote;

  @override
  Widget build(BuildContext context) {
    // Apply the local vote on top of the seed counts.
    var hearts = post.hearts;
    var broken = post.broken;
    if (vote == 'heart') hearts += 1;
    if (vote == 'broken') broken += 1;
    final total = hearts + broken;
    final pct = total == 0 ? 0 : (hearts / total * 100).round();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: LoveColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.08),
                  border: Border.all(color: LoveColors.border),
                ),
                child: const Text('А',
                    style: TextStyle(fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 10),
              const Text('Александр',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              Text(post.date,
                  style: const TextStyle(
                      color: LoveColors.textMuted, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 12),
          Text(post.text,
              style: const TextStyle(
                  color: LoveColors.textSecondary, height: 1.45)),
          const SizedBox(height: 14),
          // Vote bar
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: total == 0 ? 0 : hearts / total,
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.06),
              valueColor:
                  const AlwaysStoppedAnimation<Color>(Colors.white),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _VoteButton(
                icon: Icons.favorite_rounded,
                count: hearts,
                active: vote == 'heart',
                onTap: () => onVote('heart'),
              ),
              const SizedBox(width: 10),
              _VoteButton(
                icon: Icons.heart_broken_rounded,
                count: broken,
                active: vote == 'broken',
                onTap: () => onVote('broken'),
              ),
              const Spacer(),
              Text('$pct% за',
                  style: const TextStyle(
                      color: LoveColors.textMuted,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}

class _VoteButton extends StatelessWidget {
  const _VoteButton({
    required this.icon,
    required this.count,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final int count;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: active ? Colors.white.withValues(alpha: 0.12) : _hubFill,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
                color: active ? LoveColors.borderActive : LoveColors.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon,
                  size: 15,
                  color: active ? Colors.white : LoveColors.textSecondary),
              const SizedBox(width: 6),
              Text('$count',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: active ? Colors.white : LoveColors.textSecondary,
                  )),
            ],
          ),
        ),
      ),
    );
  }
}

const _hubFill = Color(0x08FFFFFF);
