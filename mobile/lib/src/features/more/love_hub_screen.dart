import 'package:flutter/material.dart';

import '../../config/app_config.dart';
import '../../core/network/api_client.dart';
import '../../core/network/love_api.dart';
import '../../core/diagnostics/safe_diagnostic_log.dart';
import '../../core/realtime/app_events.dart';
import '../../core/prefs/love_prefs.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_background.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/staff_role_badge.dart';
import '../chat/chat_models.dart';
import '../settings/settings_widgets.dart';
import '../shell/screen_frame.dart';

/// Love Hub community dashboard backed by the shared Love API.
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
               Text(
                'Центр управления сообществом и обновлениями',
                style: TextStyle(color: context.palette.textSecondary, fontSize: 14),
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
                     Text(
                      'Спасибо, что вы с нами. Полная история обновлений и '
                      'голосование за идеи появятся в одном из ближайших '
                      'релизов.',
                      style: TextStyle(
                          color: context.palette.textSecondary, height: 1.45),
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
                     Text(
                      'Версия',
                      style: TextStyle(
                        fontFamily: LoveFonts.mono,
                        fontSize: 11,
                        letterSpacing: 1.0,
                        color: context.palette.textMuted,
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
                     Text(
                      'установлена',
                      style: TextStyle(
                          color: context.palette.textMuted, fontSize: 12.5),
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
                      style:
                          TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                     Text(
                      'Голосуйте за лучшие предложения в реальном времени. '
                      'Функция появится в следующем обновлении.',
                      style: TextStyle(
                          color: context.palette.textSecondary, height: 1.4),
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
                      style:
                          TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
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
                     Text(
                      'Полный список изменений будет доступен здесь.',
                      style: TextStyle(
                          color: context.palette.textSecondary, height: 1.4),
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
                     Text(
                      'Голосуйте за идеи и направление развития — ♥ за, '
                      '💔 против.',
                      style: TextStyle(
                          color: context.palette.textSecondary, height: 1.4),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Text(
                          'Открыть и проголосовать',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: context.palette.inkA(0.9),
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
      builder: (context) => _CommunityIdeasList(api: LoveApi()),
    );
  }

  void _openForm(BuildContext context, {required bool isBug}) {
    showLoveSheet<void>(
      context,
      title: isBug ? 'Сообщить об ошибке' : 'Предложить идею',
      builder: (context) => _CommunityCaseForm(api: LoveApi(), isBug: isBug),
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
            style:
                 TextStyle(color: context.palette.textSecondary, height: 1.5),
          ),
          const SizedBox(height: 16),
          for (var i = 0; i < info.items.length; i++)
            _InfoItem(
                index: i + 1, item: info.items[i], numbered: info.numbered),
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
      builder: (context) => _DevLogFeed(api: LoveApi()),
    );
  }
}

class _CommunityIdeasList extends StatefulWidget {
  const _CommunityIdeasList({required this.api});
  final LoveApi api;

  @override
  State<_CommunityIdeasList> createState() => _CommunityIdeasListState();
}

class _CommunityIdeasListState extends State<_CommunityIdeasList> {
  late Future<List<Map<String, dynamic>>> _future = widget.api.communityIdeas();

  void _reload() {
    setState(() => _future = widget.api.communityIdeas());
  }

  Future<void> _vote(Map<String, dynamic> idea, int value) async {
    final id = idea['_id']?.toString();
    if (id == null) return;
    try {
      final result = await widget.api.voteIdea(id, value);
      if (!mounted) return;
      setState(() {
        idea['score'] = result['score'] ?? idea['score'];
        idea['_myVote'] = value;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: CircularProgressIndicator(),
            ),
          );
        }
        if (snapshot.hasError) {
          return _NetworkError(
            message: snapshot.error.toString(),
            onRetry: _reload,
          );
        }
        final ideas = snapshot.data ?? const [];
        if (ideas.isEmpty) {
          return const _IconEmptyState(
            icon: Icons.lightbulb_outline_rounded,
            title: 'Пока нет опубликованных идей',
            text: 'Предложите первую идею. После проверки она появится здесь.',
          );
        }
        return Column(
          children: [
            for (final idea in ideas)
              Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  color: context.palette.inkA(0.03),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: context.palette.border),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              LoveBadge(
                                  _ideaCategory(asText(idea['category']))),
                              LoveBadge(_ideaStatus(asText(idea['status']))),
                            ],
                          ),
                          const SizedBox(height: 9),
                          Text(
                            idea['title']?.toString() ?? 'Без названия',
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            idea['summary']?.toString() ?? 'Без описания',
                            style:  TextStyle(
                              color: context.palette.textSecondary,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      children: [
                        IconButton(
                          tooltip: 'Поддержать',
                          onPressed: () => _vote(idea, 1),
                          icon: Icon(
                            Icons.keyboard_arrow_up_rounded,
                            color: idea['_myVote'] == 1
                                ? context.palette.accent
                                : context.palette.textMuted,
                          ),
                        ),
                        Text(
                          '${idea['score'] ?? 0}',
                          style: const TextStyle(
                            fontFamily: LoveFonts.mono,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        IconButton(
                          tooltip: 'Не поддержать',
                          onPressed: () => _vote(idea, -1),
                          icon: Icon(
                            Icons.keyboard_arrow_down_rounded,
                            color: idea['_myVote'] == -1
                                ? context.palette.accent
                                : context.palette.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _CommunityCaseForm extends StatefulWidget {
  const _CommunityCaseForm({required this.api, required this.isBug});
  final LoveApi api;
  final bool isBug;

  @override
  State<_CommunityCaseForm> createState() => _CommunityCaseFormState();
}

class _CommunityCaseFormState extends State<_CommunityCaseForm> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  bool _diagnostics = false;
  bool _submitting = false;
  String _priority = 'normal';
  String _category = 'other';

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_title.text.trim().length < 3 || _description.text.trim().length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Добавьте название и подробное описание.')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final result = await widget.api.createCommunityCase(
        kind: widget.isBug ? 'bug' : 'idea',
        title: _title.text,
        description: _description.text,
        diagnosticsConsent: widget.isBug && _diagnostics,
        priority: widget.isBug ? _priority : 'normal',
        category: widget.isBug ? 'other' : _category,
        safeLog: widget.isBug && _diagnostics
            ? SafeDiagnosticLog.instance.snapshot()
            : '',
      );
      if (!mounted) return;
      final item = result['case'];
      final number = item is Map ? item['number'] : null;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                'Обращение отправлено${number == null ? '' : ': $number'}')),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.isBug
              ? 'Опишите, что произошло, что ожидалось и как повторить ошибку.'
              : 'Расскажите, что стоит добавить и какую проблему это решает.',
          style:  TextStyle(color: context.palette.textSecondary, height: 1.45),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _title,
          maxLength: 160,
          decoration: const InputDecoration(labelText: 'Название'),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _description,
          minLines: 4,
          maxLines: 8,
          maxLength: 10000,
          decoration: const InputDecoration(labelText: 'Подробное описание'),
        ),
        const SizedBox(height: 10),
        if (widget.isBug)
          DropdownButtonFormField<String>(
            initialValue: _priority,
            decoration: const InputDecoration(labelText: 'Риск ошибки'),
            items: const [
              DropdownMenuItem(
                  value: 'low', child: Text('Низкий — косметическая проблема')),
              DropdownMenuItem(
                  value: 'normal',
                  child: Text('Обычный — функция работает неверно')),
              DropdownMenuItem(
                  value: 'high', child: Text('Высокий — функция недоступна')),
              DropdownMenuItem(
                  value: 'critical',
                  child: Text('Критический — безопасность или потеря данных')),
            ],
            onChanged: _submitting
                ? null
                : (value) => setState(() => _priority = value ?? 'normal'),
          )
        else
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(labelText: 'Категория идеи'),
            items: const [
              DropdownMenuItem(value: 'messaging', child: Text('Сообщения')),
              DropdownMenuItem(value: 'voice', child: Text('Голос и звонки')),
              DropdownMenuItem(value: 'servers', child: Text('Серверы')),
              DropdownMenuItem(value: 'profile', child: Text('Профиль')),
              DropdownMenuItem(
                  value: 'mobile', child: Text('Мобильное приложение')),
              DropdownMenuItem(value: 'safety', child: Text('Безопасность')),
              DropdownMenuItem(
                  value: 'accessibility', child: Text('Доступность')),
              DropdownMenuItem(value: 'other', child: Text('Другое')),
            ],
            onChanged: _submitting
                ? null
                : (value) => setState(() => _category = value ?? 'other'),
          ),
        if (widget.isBug)
          CheckboxListTile(
            value: _diagnostics,
            onChanged: _submitting
                ? null
                : (value) => setState(() => _diagnostics = value ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text(
              'Приложить версию приложения, сведения об ОС и безопасный технический журнал',
              style: TextStyle(fontSize: 13),
            ),
            subtitle: const Text('Токены и переписки не отправляются.'),
          ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: Text(_submitting ? 'Отправляем...' : 'Отправить'),
        ),
      ],
    );
  }
}

class _NetworkError extends StatelessWidget {
  const _NetworkError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _IconEmptyState(
      icon: Icons.cloud_off_rounded,
      title: 'Не удалось загрузить данные',
      text: message.replaceFirst('ApiException: ', ''),
      action: OutlinedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh_rounded),
        label: const Text('Повторить'),
      ),
    );
  }
}

class _IconEmptyState extends StatelessWidget {
  const _IconEmptyState({
    required this.icon,
    required this.title,
    required this.text,
    this.action,
  });
  final IconData icon;
  final String title;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 8),
      child: Column(
        children: [
          Icon(icon, size: 38, color: context.palette.textMuted),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 7),
          Text(text,
              textAlign: TextAlign.center,
              style:  TextStyle(
                  color: context.palette.textSecondary, height: 1.4)),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
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
        color: context.palette.inkA(0.03),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color:  context.palette.inkA(0.05)),
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
                   Icon(Icons.north_east_rounded,
                      size: 16, color: context.palette.textMuted),
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
        color: solid ? context.palette.accent : context.palette.inkA(0.05),
        borderRadius: BorderRadius.circular(6),
        border: solid ? null : Border.all(color: context.palette.borderActive),
      ),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          fontFamily: LoveFonts.mono,
          fontSize: 10,
          letterSpacing: 0.6,
          fontWeight: FontWeight.w500,
          color: solid
              ? context.palette.onAccent
              : muted
                  ? context.palette.textMuted
                  : context.palette.textSecondary,
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
      color: context.palette.inkA(0.02),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: context.palette.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w500, fontSize: 14)),
              ),
               Icon(Icons.north_east_rounded,
                  size: 15, color: context.palette.textMuted),
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

// История выпусков — та же, что на сайте, только короче: здесь её читают с
// телефона, между делом. Текущая версия берёт номер из сборки, чтобы после
// релиза не пришлось править её здесь руками. У прошлых выпусков номер зашит:
// подставлять туда версию сборки нельзя, иначе старая запись подпишется свежим
// номером.
List<_HubUpdate> _seedUpdates(String version) => [
      _HubUpdate(
        version: 'v$version',
        date: 'август 2026',
        tag: 'Текущая версия',
        title: 'Версия показывается правильно',
        desc: 'Приложение называло себя 2.0.0 — и в настройках, и в Love Hub, '
            'и в этом самом списке. Обновлялось оно при этом честно, врала '
            'только надпись.',
        changes: const [
          'Версия в настройках и в Love Hub берётся у самой сборки, а не из '
              'заглушки',
          'Верхняя запись в истории обновлений больше не подписывается номером '
              'свежего выпуска',
          'Сборка релиза теперь не соберётся, если номер версии забыли '
              'обновить хоть в одном месте',
        ],
      ),
      const _HubUpdate(
        version: 'v2.1.0',
        date: 'август 2026',
        tag: 'Обновление',
        title: 'Приглашения, уведомления и спокойный войс',
        desc: 'Ссылка-приглашение теперь работает откуда угодно, уведомления '
            'перестали засыпать вас карточками, а войс в сферах выглядит и '
            'ведёт себя как звонок в личке.',
        changes: [
          'Приглашения: одна ссылка открывает превью в браузере и саму сферу в '
              'приложении. Молча никуда не вступаете — сначала видно, кто и '
              'куда зовёт',
          'Уведомления: десять сообщений от одного человека — одна карточка. '
              'Фото показываются миниатюрой, голосовые, видео и файлы — '
              'подписью',
          'Войс в сферах: та же панель, что в звонках. Аватарки видно с первой '
              'секунды, кнопки камеры и демонстрации управляют только вашим '
              'потоком',
          'Демонстрацию можно открыть на весь экран, приближать пальцами, и '
              'остальные участники при этом остаются полоской сбоку',
          'Медиа: зум фотографий пальцами, видео во весь экран и в ландшафте',
          'Голосовые: живая волна уровня во время записи',
          'Светлая тема — целиком, а не местами. И нормальные иконки тем в '
              '«Внешнем виде»',
          'Ссылки на чужие сайты сначала спрашивают, точно ли вы туда хотите',
          'Сообщения, пришедшие пока приложение было свёрнуто, больше не '
              'теряются: при возвращении переписка дочитывается сама',
        ],
      ),
      const _HubUpdate(
        version: 'v2.0.7',
        date: 'август 2026',
        tag: 'Обновление',
        title: 'Звонки, которые не мешают',
        desc: 'Пачка правок по звонкам: демонстрация запускается с первого '
            'раза, картинку можно приблизить, а разговор не обрывается, если '
            'уйти с экрана.',
        changes: [
          'Демонстрация экрана запускается в правильном порядке — больше не '
              'бывает чёрного кадра вместо картинки',
          'Зум и «картинка в картинке» во время звонка',
          'Переключение камеры и таблетка активного звонка на компьютере',
          'Видео из сообщений открывается одинаково на телефоне и на ПК',
        ],
      ),
      const _HubUpdate(
        version: 'v2.0.6',
        date: 'июль 2026',
        tag: 'Обновление',
        title: 'Звонок слышно, даже когда приложение свёрнуто',
        desc: 'Android научился обновляться сам, а входящий звонок приходит '
            'полноэкранным уведомлением — даже если приложение закрыто.',
        changes: [
          'Обновления внутри приложения на Android: проверяет, скачивает и '
              'ставит само, браузер не нужен',
          'Входящий звонок — полноэкранное уведомление с «Принять» и '
              '«Отклонить». Пока идёт разговор, в шторке висит микрофон и '
              '«Завершить»',
          'Компактный вид сообщений, отдельные переключатели уведомлений и '
              'выключатель анимаций',
          'Уход с экрана переписки больше не сбрасывает звонок',
          'Кнопка микрофона перестала срабатывать через раз',
          'Связь не сдаётся: переподключение бесконечное, с растущей паузой',
        ],
      ),
      const _HubUpdate(
        version: 'v2.0.5',
        date: 'июль 2026',
        tag: 'Обновление',
        title: 'Стабильный войс и присутствие на телефоне',
        desc: 'Можно быть залогиненным на компьютере и телефоне одновременно — '
            'звонки приходят на оба.',
        changes: [
          'Войс на нескольких устройствах: оба получают звонки и заходят в '
              'каналы независимо',
          'Панель войса на телефоне: кто в канале, микрофон, наушники, вход и '
              'выход с подтверждением сервера',
          'Переключение или отключение микрофона больше не ломает разговор',
          'Иконки и баннеры для сфер и комнат',
          'Публичный сайт loveapp.chat с историей версий и поддержкой',
        ],
      ),
      const _HubUpdate(
        version: 'v2.0.4',
        date: 'июнь 2026',
        tag: 'Обновление',
        title: 'Уведомления — как надо',
        desc: 'Настоящие уведомления системы, пока приложение свёрнуто, и '
            'заявки в друзья прямо из панели.',
        changes: [
          'Нативные уведомления на компьютере: сообщения, заявки, упоминания, '
              'пропущенные звонки. Клик ведёт сразу в нужное место',
          'Две вкладки в панели: «Обычные» и «Системные»',
          'Заявки в друзья с кнопками «Принять» и «Отклонить» прямо там',
          'Переворот камеры на телефоне во время видеозвонка',
        ],
      ),
      const _HubUpdate(
        version: 'v2.0.3',
        date: 'июнь 2026',
        tag: 'Обновление',
        title: 'Всегда актуальная версия',
        desc: 'Обновления скачиваются в фоне и ставятся при перезапуске.',
        changes: [
          'Автообновления на компьютере',
          'Настройки → Обновления: версия, статус, прогресс и «Перезапустить и '
              'установить»',
          'Бета-канал для тех, кому интересно раньше',
          'Музыка в профиле снова стабильно слышна друзьям',
        ],
      ),
      const _HubUpdate(
        version: 'v2.0.2',
        date: 'май 2026',
        tag: 'Обновление',
        title: 'Голос, который соединяет',
        desc: 'Спокойные переподключения и чище звук.',
        changes: [
          'Стабильнее голосовые соединения',
          'Аккуратные переподключения без выпадения из канала',
          'Лучше качество звука в звонках и комнатах',
        ],
      ),
      const _HubUpdate(
        version: 'v2.0.1',
        date: 'май 2026',
        tag: 'Обновление',
        title: 'Более плавный старт',
        desc: 'Первый запуск и вход стали быстрее и тише.',
        changes: [
          'Спокойнее и быстрее первый запуск и вход',
          'Полировка и мелкие исправления по всему приложению',
        ],
      ),
      const _HubUpdate(
        version: 'v2.0.0',
        date: 'май 2026',
        tag: 'Большое обновление',
        title: 'Общение, переосмысленное',
        desc: 'Новый голосовой движок, демонстрация экрана до 1080p и '
            'чёрно-белый мир, сделанный для сосредоточенности.',
        changes: [
          'Голосовые комнаты 2.0: новый движок, орбы присутствия, камера',
          'Демонстрация экрана до 1080p 60 кадров с выбором окна или дисплея',
          'Всё в реальном времени: сообщения, звонки и статусы без перезагрузок',
          'Дизайн ваби-саби: профили, настроения, музыка и интересы в одном '
              'спокойном интерфейсе',
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
        color: context.palette.inkA(0.03),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.palette.border),
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
                  style:  TextStyle(
                      fontFamily: LoveFonts.mono,
                      fontSize: 12.5,
                      color: context.palette.textSecondary)),
            ],
          ),
          const SizedBox(height: 6),
          _BentoTag(update.tag),
          const SizedBox(height: 10),
          Text(update.desc,
              style:  TextStyle(
                  color: context.palette.textSecondary, height: 1.4)),
          const SizedBox(height: 10),
          for (final change in update.changes)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                   Text('•  ',
                      style: TextStyle(color: context.palette.textMuted)),
                  Expanded(
                    child: Text(change,
                        style:  TextStyle(
                            color: context.palette.textSecondary,
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
    _InfoRow(
        'Уважение.',
        'Никаких оскорблений, травли и дискриминации. Относитесь к другим '
            'так, как хотели бы, чтобы относились к вам.'),
    _InfoRow('Без спама.',
        'Не засоряйте чаты рекламой, флудом и повторяющимися сообщениями.'),
    _InfoRow(
        'Безопасность.',
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
                color: context.palette.inkA(0.06),
                border: Border.all(color: context.palette.border),
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
                    style:  TextStyle(
                        color: context.palette.textSecondary,
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
    required this.authorName,
    required this.authorAvatar,
    required this.authorRole,
    required this.commentCount,
  });

  final String id;
  final String date;
  final String text;
  final int hearts;
  final int broken;
  final String authorName;
  final String authorAvatar;
  final String authorRole;
  final int commentCount;

  factory _DevLogPost.fromJson(Map<String, dynamic> json) {
    final published = DateTime.tryParse(
      (json['publishedAt'] ?? json['createdAt'] ?? '').toString(),
    );
    final author = json['author'] is Map
        ? (json['author'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    return _DevLogPost(
      id: json['_id']?.toString() ?? '',
      date: published == null
          ? 'сегодня'
          : '${published.toLocal().day.toString().padLeft(2, '0')}.${published.toLocal().month.toString().padLeft(2, '0')}.${published.toLocal().year}',
      text: [json['title'], json['body']]
          .where((value) => value != null && value.toString().trim().isNotEmpty)
          .map((value) => value.toString().trim())
          .join('\n\n'),
      hearts: (json['upVotes'] as num?)?.toInt() ?? 0,
      broken: (json['downVotes'] as num?)?.toInt() ?? 0,
      authorName: asText(
          author['nickname'], asText(author['username'], 'Команда Love')),
      authorAvatar: asText(author['avatar']),
      authorRole: asText(author['role']),
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
    );
  }

  _DevLogPost copyWith({int? hearts, int? broken, int? commentCount}) {
    return _DevLogPost(
      id: id,
      date: date,
      text: text,
      hearts: hearts ?? this.hearts,
      broken: broken ?? this.broken,
      authorName: authorName,
      authorAvatar: authorAvatar,
      authorRole: authorRole,
      commentCount: commentCount ?? this.commentCount,
    );
  }
}

class _DevLogFeed extends StatefulWidget {
  const _DevLogFeed({required this.api});
  final LoveApi api;

  @override
  State<_DevLogFeed> createState() => _DevLogFeedState();
}

class _DevLogFeedState extends State<_DevLogFeed> {
  late Map<String, String> _votes = LovePrefs.instance.devLogVotes();
  List<_DevLogPost> _posts = const [];
  bool _loading = true;
  bool _loadingMore = false;
  int _page = 1;
  int _pages = 1;
  int _seenRevision = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _seenRevision = AppEvents.instance.devLogRevision;
    AppEvents.instance.addListener(_handleRealtime);
    _load();
  }

  @override
  void dispose() {
    AppEvents.instance.removeListener(_handleRealtime);
    super.dispose();
  }

  void _handleRealtime() {
    final events = AppEvents.instance;
    if (_seenRevision == events.devLogRevision) return;
    _seenRevision = events.devLogRevision;
    final update = events.lastDevLogUpdate;
    final postId = asId(update['postId']);
    if (asBool(update['removed']) && postId.isNotEmpty) {
      setState(
          () => _posts = _posts.where((post) => post.id != postId).toList());
      return;
    }
    final index = _posts.indexWhere((post) => post.id == postId);
    if (index >= 0) {
      setState(() {
        final current = _posts[index];
        _posts[index] = current.copyWith(
          hearts: (update['upVotes'] as num?)?.toInt(),
          broken: (update['downVotes'] as num?)?.toInt(),
          commentCount: (update['commentCount'] as num?)?.toInt(),
        );
      });
    } else if (asBool(update['refresh'])) {
      _load(quiet: true);
    }
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final result = await widget.api.devLogPage();
      final posts = result['posts'] is List
          ? (result['posts'] as List)
              .whereType<Map>()
              .map((item) => _DevLogPost.fromJson(item.cast<String, dynamic>()))
              .toList()
          : <_DevLogPost>[];
      final pagination = result['pagination'] is Map
          ? (result['pagination'] as Map).cast<String, dynamic>()
          : <String, dynamic>{};
      if (!mounted) return;
      setState(() {
        _posts = posts;
        _page = (pagination['page'] as num?)?.toInt() ?? 1;
        _pages = (pagination['pages'] as num?)?.toInt() ?? 1;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _page >= _pages) return;
    setState(() => _loadingMore = true);
    try {
      final result = await widget.api.devLogPage(page: _page + 1);
      final next = result['posts'] is List
          ? (result['posts'] as List)
              .whereType<Map>()
              .map((item) => _DevLogPost.fromJson(item.cast<String, dynamic>()))
              .toList()
          : <_DevLogPost>[];
      final pagination = result['pagination'] is Map
          ? (result['pagination'] as Map).cast<String, dynamic>()
          : <String, dynamic>{};
      if (!mounted) return;
      setState(() {
        _posts = [
          ..._posts,
          ...next.where((item) => !_posts.any((old) => old.id == item.id))
        ];
        _page = (pagination['page'] as num?)?.toInt() ?? _page + 1;
        _pages = (pagination['pages'] as num?)?.toInt() ?? _pages;
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _vote(String id, String choice) async {
    try {
      final result =
          await widget.api.voteDevLog(id, choice == 'heart' ? 1 : -1);
      if (!mounted) return;
      setState(() {
        _votes = {..._votes, id: choice};
        _posts = _posts.map((post) {
          if (post.id != id) return post;
          return post.copyWith(
            hearts: (result['upVotes'] as num?)?.toInt(),
            broken: (result['downVotes'] as num?)?.toInt(),
          );
        }).toList();
      });
      LovePrefs.instance.setDevLogVote(id, choice);
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: CircularProgressIndicator(),
        ),
      );
    }
    if (_posts.isEmpty) {
      if (_error != null) {
        return _NetworkError(message: _error!, onRetry: _load);
      }
      return const _IconEmptyState(
        icon: Icons.article_outlined,
        title: 'Dev Log пока пуст',
        text: 'Новые заметки команды появятся здесь.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
         Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text(
            'Заметки разработки. Голосуйте за идеи — ♥ за, 💔 против.',
            style: TextStyle(color: context.palette.textMuted, fontSize: 12.5),
          ),
        ),
        if (_error != null) ...[
          LoveBanner(
              'Не удалось обновить ленту. Уже загруженные записи сохранены.'),
          const SizedBox(height: 12),
        ],
        for (final post in _posts)
          _DevLogCard(
            api: widget.api,
            post: post,
            vote: _votes[post.id],
            onVote: (choice) => _vote(post.id, choice),
          ),
        if (_page < _pages)
          OutlinedButton.icon(
            onPressed: _loadingMore ? null : _loadMore,
            icon: _loadingMore
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.expand_more_rounded),
            label: const Text('Показать ещё'),
          ),
      ],
    );
  }
}

class _DevLogCard extends StatefulWidget {
  const _DevLogCard({
    required this.api,
    required this.post,
    required this.vote,
    required this.onVote,
  });

  final LoveApi api;
  final _DevLogPost post;
  final String? vote;
  final ValueChanged<String> onVote;

  @override
  State<_DevLogCard> createState() => _DevLogCardState();
}

class _DevLogCardState extends State<_DevLogCard> {
  final _comment = TextEditingController();
  List<Map<String, dynamic>> _comments = const [];
  Map<String, dynamic>? _replyTo;
  bool _expanded = false;
  bool _loadingComments = false;
  bool _sendingComment = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    final hearts = post.hearts;
    final broken = post.broken;
    final total = hearts + broken;
    final pct = total == 0 ? 0 : (hearts / total * 100).round();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.palette.inkA(0.03),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.palette.border),
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
                  color: context.palette.inkA(0.08),
                  border: Border.all(color: context.palette.border),
                ),
                child: LoveAvatar(
                    label: post.authorName,
                    imageUrl: post.authorAvatar,
                    size: 34),
              ),
              const SizedBox(width: 10),
              Flexible(
                  child: Text(post.authorName,
                      style: const TextStyle(fontWeight: FontWeight.w700))),
              if (staffRoleLabel(post.authorRole).isNotEmpty) ...[
                const SizedBox(width: 7),
                StaffRoleLabel(role: post.authorRole, compact: true),
              ],
              const Spacer(),
              Text(post.date,
                  style:  TextStyle(
                      color: context.palette.textMuted, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 12),
          Text(post.text,
              style:  TextStyle(
                  color: context.palette.textSecondary, height: 1.45)),
          const SizedBox(height: 14),
          // Vote bar
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: total == 0 ? 0 : hearts / total,
              minHeight: 6,
              backgroundColor: context.palette.inkA(0.06),
              valueColor:  AlwaysStoppedAnimation<Color>(context.palette.accent),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _VoteButton(
                icon: Icons.favorite_rounded,
                count: hearts,
                active: widget.vote == 'heart',
                onTap: () => widget.onVote('heart'),
              ),
              const SizedBox(width: 10),
              _VoteButton(
                icon: Icons.heart_broken_rounded,
                count: broken,
                active: widget.vote == 'broken',
                onTap: () => widget.onVote('broken'),
              ),
              const Spacer(),
              Text('$pct% за',
                  style:  TextStyle(
                      color: context.palette.textMuted,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _toggleComments,
              icon: Icon(
                  _expanded
                      ? Icons.expand_less_rounded
                      : Icons.chat_bubble_outline_rounded,
                  size: 18),
              label: Text(_expanded
                  ? 'Скрыть комментарии'
                  : 'Комментарии (${post.commentCount})'),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            child: _expanded ? _commentsBody() : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Future<void> _toggleComments() async {
    setState(() => _expanded = !_expanded);
    if (_expanded && _comments.isEmpty) await _loadComments();
  }

  Future<void> _loadComments() async {
    setState(() => _loadingComments = true);
    try {
      final comments = await widget.api.devLogComments(widget.post.id);
      if (mounted) setState(() => _comments = comments);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _loadingComments = false);
    }
  }

  Widget _commentsBody() {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.only(top: 12),
      decoration:  BoxDecoration(
          border: Border(top: BorderSide(color: context.palette.border))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_loadingComments)
            const Center(
                child: Padding(
                    padding: EdgeInsets.all(18),
                    child: CircularProgressIndicator()))
          else if (_comments.isEmpty)
             Padding(
              padding: EdgeInsets.symmetric(vertical: 14),
              child: Text('Комментариев пока нет.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.palette.textMuted)),
            )
          else
            for (final comment in _comments) _commentTile(comment),
          if (_replyTo != null)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                  color: context.palette.inkA(0.04),
                  borderRadius: BorderRadius.circular(10)),
              child: Row(
                children: [
                  Expanded(
                      child: Text('Ответ для ${_commentAuthor(_replyTo!)}',
                          style:  TextStyle(
                              color: context.palette.textSecondary, fontSize: 12))),
                  IconButton(
                      tooltip: 'Отменить ответ',
                      onPressed: () => setState(() => _replyTo = null),
                      icon: const Icon(Icons.close_rounded),
                      iconSize: 17),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _comment,
                  minLines: 1,
                  maxLines: 4,
                  maxLength: 2000,
                  decoration: const InputDecoration(
                      hintText: 'Написать комментарий', counterText: ''),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Отправить комментарий',
                onPressed: _sendingComment ? null : _sendComment,
                icon: _sendingComment
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.send_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _commentTile(Map<String, dynamic> comment) {
    final author = comment['author'] is Map
        ? (comment['author'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    final nested = asId(comment['parent']).isNotEmpty;
    return Padding(
      padding: EdgeInsets.fromLTRB(nested ? 24 : 0, 0, 0, 10),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
            color: context.palette.inkA(0.025),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.palette.border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                LoveAvatar(
                    label: _commentAuthor(comment),
                    imageUrl: asText(author['avatar']),
                    size: 24),
                const SizedBox(width: 7),
                Expanded(
                    child: Text(_commentAuthor(comment),
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w800))),
                if (staffRoleLabel(asText(author['role'])).isNotEmpty)
                  StaffRoleLabel(role: asText(author['role']), compact: true),
              ],
            ),
            const SizedBox(height: 6),
            Text(asText(comment['body']),
                style:  TextStyle(
                    color: context.palette.textSecondary, height: 1.4)),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _replyTo = comment),
                style: TextButton.styleFrom(
                    minimumSize: Size.zero,
                    padding: const EdgeInsets.only(top: 6)),
                child: const Text('Ответить'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _commentAuthor(Map<String, dynamic> comment) {
    final author = comment['author'] is Map
        ? (comment['author'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    return asText(author['nickname'], asText(author['username'], 'Love user'));
  }

  Future<void> _sendComment() async {
    final body = _comment.text.trim();
    if (body.isEmpty) return;
    setState(() => _sendingComment = true);
    try {
      final result = await widget.api.addDevLogComment(
        widget.post.id,
        body,
        parent: _replyTo == null ? null : asId(_replyTo!['_id']),
      );
      final raw = result['comment'];
      if (raw is Map && mounted) {
        setState(() {
          _comments = [..._comments, raw.cast<String, dynamic>()];
          _comment.clear();
          _replyTo = null;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _sendingComment = false);
    }
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
      color: active ? context.palette.inkA(0.12) : context.palette.inkA(0.03),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
                color: active ? context.palette.borderActive : context.palette.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon,
                  size: 15,
                  color: active ? context.palette.accent : context.palette.textSecondary),
              const SizedBox(width: 6),
              Text('$count',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: active ? context.palette.accent : context.palette.textSecondary,
                  )),
            ],
          ),
        ),
      ),
    );
  }
}



String _ideaCategory(String value) {
  return const {
        'messaging': 'Сообщения',
        'voice': 'Голос и звонки',
        'servers': 'Серверы',
        'profile': 'Профиль',
        'mobile': 'Мобильное',
        'safety': 'Безопасность',
        'accessibility': 'Доступность',
        'other': 'Другое',
      }[value.toLowerCase()] ??
      'Другое';
}

String _ideaStatus(String value) {
  return const {
        'under_review': 'На рассмотрении',
        'planned': 'Запланировано',
        'in_progress': 'В разработке',
        'completed': 'Готово',
        'declined': 'Отклонено',
      }[value.toLowerCase()] ??
      'На рассмотрении';
}
