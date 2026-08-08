import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/network/love_api.dart';
import '../../core/platform/audio_file_picker.dart';
import '../../core/realtime/app_events.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../widgets/love_pill_tabs.dart';
import '../settings/settings_widgets.dart';
import '../chat/chat_models.dart';
import '../shell/screen_frame.dart';
import 'support_models.dart';

class SupportCenterScreen extends StatefulWidget {
  const SupportCenterScreen({
    required this.api,
    this.events,
    this.initialCaseId,
    this.initialTab = 0,
    this.restrictedMode = false,
    super.key,
  });

  final LoveApi api;
  final AppEvents? events;
  final String? initialCaseId;
  final int initialTab;
  final bool restrictedMode;

  @override
  State<SupportCenterScreen> createState() => _SupportCenterScreenState();
}

class _SupportCenterScreenState extends State<SupportCenterScreen> {
  late final AppEvents _events = widget.events ?? AppEvents.instance;
  List<SupportCase> _cases = const [];
  ModerationStatus? _status;
  bool _loadingCases = true;
  bool _loadingStatus = true;
  String? _casesError;
  String? _statusError;
  late int _tab = widget.initialTab.clamp(0, 1);
  int _seenSupportRevision = 0;
  int _seenModerationRevision = 0;
  bool _openedInitial = false;

  @override
  void initState() {
    super.initState();
    _seenSupportRevision = _events.supportRevision;
    _seenModerationRevision = _events.moderationRevision;
    _events.addListener(_handleEvents);
    _loadCases();
    _loadStatus();
  }

  @override
  void dispose() {
    _events.removeListener(_handleEvents);
    super.dispose();
  }

  void _handleEvents() {
    if (_seenSupportRevision != _events.supportRevision) {
      _seenSupportRevision = _events.supportRevision;
      unawaited(_loadCases(quiet: true));
    }
    if (_seenModerationRevision != _events.moderationRevision) {
      _seenModerationRevision = _events.moderationRevision;
      unawaited(_loadStatus(quiet: true));
    }
  }

  Future<void> _loadCases({bool quiet = false}) async {
    if (!quiet && mounted) setState(() => _loadingCases = true);
    try {
      final items = await widget.api.myCases();
      if (!mounted) return;
      setState(() {
        _cases = items;
        _casesError = null;
        _loadingCases = false;
      });
      _openInitialCaseIfNeeded();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _casesError = error.toString();
        _loadingCases = false;
      });
    }
  }

  Future<void> _loadStatus({bool quiet = false}) async {
    if (!quiet && mounted) setState(() => _loadingStatus = true);
    try {
      final status = await widget.api.moderationStatus();
      if (!mounted) return;
      setState(() {
        _status = status;
        _statusError = null;
        _loadingStatus = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _statusError = error.toString();
        _loadingStatus = false;
      });
    }
  }

  void _openInitialCaseIfNeeded() {
    final initial = widget.initialCaseId;
    if (_openedInitial || initial == null || initial.isEmpty) return;
    _openedInitial = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openCase(initial);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LoveBackground(
        child: ScreenFrame(
          title:
              widget.restrictedMode ? 'Поддержка Love' : 'Помощь и нарушения',
          leading: IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          trailing: _tab == 0
              ? IconButton(
                  tooltip: 'Новое обращение',
                  onPressed: _createCase,
                  icon: const Icon(Icons.add_comment_outlined),
                )
              : null,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: LovePillTabs(
                  tabs: const [
                    LovePillTab('Обращения'),
                    LovePillTab('Нарушения'),
                  ],
                  selected: _tab,
                  onSelected: (value) => setState(() => _tab = value),
                ),
              ),
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  child: _tab == 0
                      ? _casesBody(key: const ValueKey('cases'))
                      : _violationsBody(key: const ValueKey('violations')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _casesBody({required Key key}) {
    if (_loadingCases) {
      return const Center(
          key: ValueKey('cases-loading'), child: CircularProgressIndicator());
    }
    if (_casesError != null) {
      return _RetryState(
        key: key,
        message: _casesError!,
        onRetry: _loadCases,
      );
    }
    if (_cases.isEmpty) {
      return EmptyState(
        key: key,
        icon: Icons.support_agent_rounded,
        title: 'Обращений пока нет',
        message: 'Здесь появится ваша переписка с командой Love.',
        action: FilledButton.icon(
          onPressed: _createCase,
          icon: const Icon(Icons.add_rounded),
          label: const Text('Новое обращение'),
        ),
      );
    }
    return RefreshIndicator(
      key: key,
      onRefresh: _loadCases,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        itemCount: _cases.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final item = _cases[index];
          return _CaseCard(item: item, onTap: () => _openCase(item.id));
        },
      ),
    );
  }

  Widget _violationsBody({required Key key}) {
    if (_loadingStatus) {
      return const Center(
          key: ValueKey('status-loading'), child: CircularProgressIndicator());
    }
    if (_statusError != null || _status == null) {
      return _RetryState(
        key: key,
        message: _statusError ?? 'Не удалось загрузить сведения',
        onRetry: _loadStatus,
      );
    }
    return _ViolationsView(
      key: key,
      status: _status!,
      onAppeal: _appeal,
    );
  }

  Future<void> _openCase(String id) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SupportCaseScreen(
          api: widget.api,
          events: _events,
          caseId: id,
        ),
      ),
    );
    if (mounted) unawaited(_loadCases(quiet: true));
  }

  Future<void> _createCase() async {
    final created = await showModalBottomSheet<SupportCase>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _NewCaseSheet(api: widget.api),
    );
    if (created == null || !mounted) return;
    setState(() => _cases = [created, ..._cases]);
    await _openCase(created.id);
  }

  Future<void> _appeal(ModerationRecord action) async {
    final created = await showModalBottomSheet<SupportCase>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _AppealSheet(api: widget.api, action: action),
    );
    if (created == null || !mounted) return;
    setState(() {
      _cases = [created, ..._cases.where((item) => item.id != created.id)];
      _tab = 0;
    });
    unawaited(_loadStatus(quiet: true));
    await _openCase(created.id);
  }
}

class SupportCaseScreen extends StatefulWidget {
  const SupportCaseScreen({
    required this.api,
    required this.events,
    required this.caseId,
    super.key,
  });

  final LoveApi api;
  final AppEvents events;
  final String caseId;

  @override
  State<SupportCaseScreen> createState() => _SupportCaseScreenState();
}

class _SupportCaseScreenState extends State<SupportCaseScreen> {
  final _reply = TextEditingController();
  final _scroll = ScrollController();
  SupportCase? _item;
  bool _loading = true;
  bool _sending = false;
  String? _error;
  int _seenRevision = 0;

  @override
  void initState() {
    super.initState();
    widget.events.activeCaseId = widget.caseId;
    _seenRevision = widget.events.supportRevision;
    widget.events.addListener(_handleEvents);
    _load();
  }

  @override
  void dispose() {
    if (widget.events.activeCaseId == widget.caseId) {
      widget.events.activeCaseId = null;
    }
    widget.events.removeListener(_handleEvents);
    _reply.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _handleEvents() {
    if (_seenRevision == widget.events.supportRevision) return;
    _seenRevision = widget.events.supportRevision;
    final update = widget.events.lastSupportUpdate;
    if (asId(update['caseId']) != widget.caseId) return;
    final noteRaw = update['note'];
    if (noteRaw is Map && _item != null) {
      final note = SupportNote.fromJson(noteRaw.cast<String, dynamic>());
      if (!_item!.notes.any((existing) => existing.id == note.id)) {
        setState(() {
          _item = _item!.copyWith(
            status: asText(update['status'], _item!.status),
            updatedAt: DateTime.tryParse(asText(update['updatedAt'])) ??
                DateTime.now(),
            notes: [..._item!.notes, note],
          );
        });
        _scrollToEnd();
      }
    } else {
      unawaited(_load(quiet: true));
    }
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet && mounted) setState(() => _loading = true);
    try {
      final item = await widget.api.caseDetails(widget.caseId);
      if (!mounted) return;
      setState(() {
        _item = item;
        _loading = false;
        _error = null;
      });
      _scrollToEnd();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    return Scaffold(
      body: LoveBackground(
        child: ScreenFrame(
          title: item?.number ?? 'Обращение',
          leading: IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null || item == null
                  ? _RetryState(
                      message: _error ?? 'Обращение не найдено', onRetry: _load)
                  : Column(
                      children: [
                        Expanded(child: _thread(item)),
                        if (!item.isClosed) _composer(item),
                      ],
                    ),
        ),
      ),
    );
  }

  Widget _thread(SupportCase item) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(item.title,
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w800)),
              ),
              _CaseBadge(label: _statusLabel(item.status)),
            ],
          ),
          const SizedBox(height: 8),
          Text(item.description,
              style: const TextStyle(
                  color: LoveColors.textSecondary, height: 1.45)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _CaseBadge(label: _kindLabel(item.kind)),
              _CaseBadge(
                  label: _priorityLabel(item.priority),
                  accent: item.priority == 'critical'),
            ],
          ),
          if (item.attachments.isNotEmpty) ...[
            const SizedBox(height: 14),
            for (final file in item.attachments)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.attach_file_rounded),
                title: Text(file.name),
                subtitle: Text(_fileSize(file.size)),
                onTap: () {
                  final url = AppConfig.mediaUrl(file.url);
                  if (url != null) {
                    launchUrl(Uri.parse(url),
                        mode: LaunchMode.externalApplication);
                  }
                },
              ),
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Divider(height: 1),
          ),
          if (item.notes.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 28),
              child: Text(
                'Команда ещё не ответила. Новые сообщения появятся здесь автоматически.',
                textAlign: TextAlign.center,
                style: TextStyle(color: LoveColors.textMuted, height: 1.4),
              ),
            ),
          for (final note in item.notes) _NoteBubble(note: note),
          if (item.isClosed)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: LoveBanner(
                  'Обращение закрыто. Для новой проблемы создайте отдельное обращение.'),
            ),
        ],
      ),
    );
  }

  Widget _composer(SupportCase item) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
        decoration: const BoxDecoration(
          color: Color(0xFF0B0B0B),
          border: Border(top: BorderSide(color: LoveColors.border)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _reply,
                minLines: 1,
                maxLines: 5,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Ответить команде Love',
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: 'Отправить',
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_rounded),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.isEmpty || _item == null) return;
    setState(() => _sending = true);
    try {
      final note = await widget.api.replyToCase(widget.caseId, text);
      if (!mounted) return;
      _reply.clear();
      setState(() {
        _item = _item!.copyWith(
          status: 'triaged',
          updatedAt: DateTime.now(),
          notes: [..._item!.notes, note],
        );
      });
      _scrollToEnd();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
        );
      }
    });
  }
}

class _NewCaseSheet extends StatefulWidget {
  const _NewCaseSheet({required this.api});
  final LoveApi api;

  @override
  State<_NewCaseSheet> createState() => _NewCaseSheetState();
}

class _NewCaseSheetState extends State<_NewCaseSheet> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  final List<PickedChatFile> _files = [];
  String _priority = 'normal';
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _LoveSheetFrame(
      title: 'Новое обращение',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _title,
            maxLength: 160,
            decoration: const InputDecoration(
                labelText: 'Тема', hintText: 'Кратко опишите проблему'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _description,
            minLines: 4,
            maxLines: 8,
            maxLength: 10000,
            decoration: const InputDecoration(
                labelText: 'Описание',
                hintText: 'Что произошло и какой результат вы ожидали?'),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _priority,
            decoration: const InputDecoration(labelText: 'Приоритет'),
            items: const [
              DropdownMenuItem(value: 'low', child: Text('Низкий')),
              DropdownMenuItem(value: 'normal', child: Text('Обычный')),
              DropdownMenuItem(value: 'high', child: Text('Высокий')),
              DropdownMenuItem(value: 'critical', child: Text('Критический')),
            ],
            onChanged: _busy
                ? null
                : (value) => setState(() => _priority = value ?? 'normal'),
          ),
          const SizedBox(height: 8),
          const Text(
            'Критический приоритет используйте только при угрозе безопасности или полной потере доступа.',
            style: TextStyle(
                color: LoveColors.textMuted, fontSize: 12, height: 1.35),
          ),
          if (_files.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final file in _files)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.insert_drive_file_outlined),
                title: Text(file.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: IconButton(
                  tooltip: 'Убрать файл',
                  onPressed:
                      _busy ? null : () => setState(() => _files.remove(file)),
                  icon: const Icon(Icons.close_rounded),
                ),
              ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: _busy ? null : _pickFile,
                icon: const Icon(Icons.attach_file_rounded),
                label: const Text('Файл'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy ? null : _submit,
                  icon: _busy
                      ? const SizedBox(
                          width: 17,
                          height: 17,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send_rounded),
                  label: const Text('Отправить'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _pickFile() async {
    final file = await ChatNativeFiles.pickFile();
    if (file != null && mounted) setState(() => _files.add(file));
  }

  Future<void> _submit() async {
    if (_title.text.trim().length < 3 || _description.text.trim().length < 10) {
      _snack('Добавьте тему и подробное описание не короче 10 символов.');
      return;
    }
    setState(() => _busy = true);
    try {
      final attachments = <Map<String, dynamic>>[];
      for (final file in _files) {
        final uploaded = await widget.api
            .uploadAttachment(file.path, mimeType: file.mimeType);
        attachments.add({
          'name': asText(uploaded['originalName'], file.name),
          'url': asText(uploaded['url']),
          'mimeType': asText(uploaded['mimetype'], file.mimeType),
          'size': (uploaded['size'] as num?)?.toInt() ?? file.size,
        });
      }
      final created = await widget.api.createSupportCase(
        title: _title.text,
        description: _description.text,
        priority: _priority,
        attachments: attachments,
      );
      if (mounted) Navigator.of(context).pop(created);
    } catch (error) {
      _snack(error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }
}

class _AppealSheet extends StatefulWidget {
  const _AppealSheet({required this.api, required this.action});
  final LoveApi api;
  final ModerationRecord action;

  @override
  State<_AppealSheet> createState() => _AppealSheetState();
}

class _AppealSheetState extends State<_AppealSheet> {
  final _description = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _LoveSheetFrame(
      title: 'Подать апелляцию',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LoveBanner(
              'Одна апелляция доступна для каждого активного наказания.'),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            minLines: 5,
            maxLines: 9,
            maxLength: 10000,
            decoration: const InputDecoration(
              labelText: 'Причина пересмотра',
              hintText: 'Объясните ситуацию и приложите важный контекст',
            ),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: _busy
                ? const SizedBox(
                    width: 17,
                    height: 17,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.gavel_rounded),
            label: const Text('Отправить апелляцию'),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    if (_description.text.trim().length < 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Опишите причину подробнее, минимум 20 символов.')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final result = await widget.api.createAppeal(
        moderationActionId: widget.action.id,
        description: _description.text,
      );
      if (mounted) Navigator.of(context).pop(result);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _ViolationsView extends StatelessWidget {
  const _ViolationsView(
      {required this.status, required this.onAppeal, super.key});
  final ModerationStatus status;
  final ValueChanged<ModerationRecord> onAppeal;

  @override
  Widget build(BuildContext context) {
    final danger = status.reputationTone == 'danger';
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.035),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                  color: danger
                      ? LoveColors.danger.withValues(alpha: 0.5)
                      : LoveColors.borderActive),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(danger
                        ? Icons.warning_amber_rounded
                        : Icons.verified_user_outlined),
                    const SizedBox(width: 10),
                    Expanded(
                        child: Text(status.reputationLabel,
                            style: const TextStyle(
                                fontSize: 17, fontWeight: FontWeight.w800))),
                    Text('${status.trustScore}/100',
                        style: const TextStyle(
                            fontFamily: LoveFonts.mono,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
                const SizedBox(height: 14),
                LinearProgressIndicator(
                  value: status.trustScore / 100,
                  minHeight: 7,
                  borderRadius: BorderRadius.circular(99),
                  backgroundColor: Colors.white.withValues(alpha: 0.06),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    const Text('Активные предупреждения',
                        style: TextStyle(color: LoveColors.textSecondary)),
                    const Spacer(),
                    Text('${status.warningCount}/7',
                        style: const TextStyle(fontWeight: FontWeight.w900)),
                  ],
                ),
                const SizedBox(height: 10),
                _WarningTrack(
                    count: status.warningCount, thresholds: status.thresholds),
              ],
            ),
          ),
          if (status.activeRestriction != null) ...[
            const SizedBox(height: 12),
            LoveBanner(
              _restrictionSummary(status.activeRestriction!),
              variant: BannerVariant.warning,
            ),
          ],
          const SizedBox(height: 20),
          const Text('История нарушений',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          if (status.actions.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 36),
              child: Text('Нарушений нет.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: LoveColors.textMuted)),
            )
          else
            for (final action in status.actions)
              _ModerationCard(
                  action: action,
                  onAppeal: action.canAppeal ? () => onAppeal(action) : null),
        ],
      ),
    );
  }
}

class _CaseCard extends StatelessWidget {
  const _CaseCard({required this.item, required this.onTap});
  final SupportCase item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.03),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: LoveColors.border)),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(13)),
                child: Icon(_kindIcon(item.kind), size: 21),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text('${item.number} · ${_statusLabel(item.status)}',
                        style: const TextStyle(
                            color: LoveColors.textMuted, fontSize: 11.5)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right_rounded,
                  color: LoveColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoteBubble extends StatelessWidget {
  const _NoteBubble({required this.note});
  final SupportNote note;

  @override
  Widget build(BuildContext context) {
    final currentUserId = AppSessionScope.of(context).user?.id ?? '';
    final own = note.authorId == currentUserId;
    return Align(
      alignment: own ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints:
            BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: own
              ? const Color(0xFF241518)
              : Colors.white.withValues(alpha: 0.045),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: own ? const Color(0x663C2026) : LoveColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!own) ...[
                  LoveAvatar(
                      label: note.authorName,
                      imageUrl: note.authorAvatar,
                      size: 24),
                  const SizedBox(width: 7),
                ],
                Flexible(
                    child: Text(own ? 'Вы' : note.authorName,
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w800))),
                if (!own && note.authorRole.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  _CaseBadge(label: _roleLabel(note.authorRole)),
                ],
              ],
            ),
            const SizedBox(height: 6),
            Text(note.body, style: const TextStyle(height: 1.4)),
          ],
        ),
      ),
    );
  }
}

class _ModerationCard extends StatelessWidget {
  const _ModerationCard({required this.action, this.onAppeal});
  final ModerationRecord action;
  final VoidCallback? onAppeal;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: action.active ? LoveColors.borderActive : LoveColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(_actionLabel(action.type),
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w800))),
              _CaseBadge(
                  label: action.revoked
                      ? 'Снято'
                      : action.active
                          ? 'Активно'
                          : 'Завершено',
                  accent: action.active),
            ],
          ),
          const SizedBox(height: 7),
          Text(action.reason,
              style: const TextStyle(
                  color: LoveColors.textSecondary, height: 1.4)),
          const SizedBox(height: 8),
          Text(_actionTerm(action),
              style:
                  const TextStyle(color: LoveColors.textMuted, fontSize: 12)),
          if (action.appeal != null) ...[
            const SizedBox(height: 8),
            Text(
                'Апелляция ${action.appeal!.number}: ${_statusLabel(action.appeal!.status)}',
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w700)),
          ],
          if (onAppeal != null) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
                onPressed: onAppeal,
                icon: const Icon(Icons.gavel_rounded),
                label: const Text('Подать апелляцию')),
          ],
        ],
      ),
    );
  }
}

class _WarningTrack extends StatelessWidget {
  const _WarningTrack({required this.count, required this.thresholds});
  final int count;
  final List<WarningThreshold> thresholds;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Stack(
          alignment: Alignment.centerLeft,
          children: [
            Container(
                height: 7,
                decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(99))),
            FractionallySizedBox(
              widthFactor: (count.clamp(0, 7)) / 7,
              child: Container(
                  height: 7,
                  decoration: BoxDecoration(
                      color: count >= 5 ? LoveColors.danger : Colors.white,
                      borderRadius: BorderRadius.circular(99))),
            ),
          ],
        ),
        const SizedBox(height: 10),
        for (final threshold in thresholds)
          Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(
              children: [
                SizedBox(
                    width: 24,
                    child: Text('${threshold.count}',
                        style: const TextStyle(fontWeight: FontWeight.w900))),
                Expanded(
                    child: Text(threshold.consequence,
                        style: const TextStyle(
                            color: LoveColors.textMuted, fontSize: 11.5))),
              ],
            ),
          ),
      ],
    );
  }
}

class _LoveSheetFrame extends StatelessWidget {
  const _LoveSheetFrame({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        constraints:
            BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.92),
        decoration: const BoxDecoration(
          color: Color(0xFF0E0E0E),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: LoveColors.borderActive)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                    child: Container(
                        width: 42,
                        height: 4,
                        decoration: BoxDecoration(
                            color: LoveColors.borderActive,
                            borderRadius: BorderRadius.circular(99)))),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                        child: Text(title,
                            style: const TextStyle(
                                fontSize: 21, fontWeight: FontWeight.w800))),
                    IconButton(
                        tooltip: 'Закрыть',
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close_rounded)),
                  ],
                ),
                const SizedBox(height: 10),
                child,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CaseBadge extends StatelessWidget {
  const _CaseBadge({required this.label, this.accent = false});
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: accent
            ? LoveColors.danger.withValues(alpha: 0.13)
            : Colors.white.withValues(alpha: 0.055),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
            color: accent
                ? LoveColors.danger.withValues(alpha: 0.45)
                : LoveColors.border),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              color:
                  accent ? const Color(0xFFFFA1AC) : LoveColors.textSecondary)),
    );
  }
}

class _RetryState extends StatelessWidget {
  const _RetryState({required this.message, required this.onRetry, super.key});
  final String message;
  final Future<void> Function({bool quiet}) onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined,
                size: 36, color: LoveColors.textMuted),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: LoveColors.textSecondary)),
            const SizedBox(height: 14),
            OutlinedButton.icon(
                onPressed: () => onRetry(),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Повторить')),
          ],
        ),
      ),
    );
  }
}

String _kindLabel(String value) {
  return const {
        'support': 'Поддержка',
        'appeal': 'Апелляция',
        'report': 'Жалоба',
        'bug': 'Ошибка',
        'idea': 'Идея',
      }[value] ??
      value;
}

IconData _kindIcon(String value) {
  return const {
        'support': Icons.support_agent_rounded,
        'appeal': Icons.gavel_rounded,
        'report': Icons.flag_outlined,
        'bug': Icons.bug_report_outlined,
        'idea': Icons.lightbulb_outline_rounded,
      }[value] ??
      Icons.chat_bubble_outline_rounded;
}

String _statusLabel(String value) {
  return const {
        'new': 'Новое',
        'triaged': 'Принято',
        'in_progress': 'В работе',
        'waiting_user': 'Ждёт ответа',
        'resolved': 'Решено',
        'rejected': 'Отклонено',
        'archived': 'В архиве',
      }[value] ??
      value;
}

String _priorityLabel(String value) {
  return const {
        'low': 'Низкий',
        'normal': 'Обычный',
        'high': 'Высокий',
        'critical': 'Критический',
      }[value] ??
      value;
}

String _actionLabel(String value) {
  return const {
        'warning': 'Предупреждение',
        'mute': 'Мут',
        'ban': 'Блокировка',
        'deactivate': 'Деактивация',
      }[value] ??
      value;
}

String _roleLabel(String value) {
  return const {
        'support': 'Support',
        'junior_moderator': 'Мл. модератор',
        'senior_moderator': 'Ст. модератор',
        'junior_admin': 'Мл. администратор',
        'senior_admin': 'Ст. администратор',
        'deputy_developer': 'Зам. разработчика',
        'developer': 'Разработчик',
      }[value] ??
      value;
}

String _actionTerm(ModerationRecord action) {
  if (action.revoked) return 'Наказание снято';
  if (action.permanent) return 'Бессрочно';
  if (action.expiresAt == null) return action.active ? 'Активно' : 'Завершено';
  final local = action.expiresAt!.toLocal();
  return action.active
      ? 'До ${_formatDate(local)} · осталось ${_remaining(local)}'
      : 'Завершено ${_formatDate(local)}';
}

String _restrictionSummary(ModerationRecord action) {
  return '${_actionLabel(action.type)}: ${action.reason}. ${_actionTerm(action)}';
}

String _remaining(DateTime until) {
  final diff = until.difference(DateTime.now());
  if (diff.isNegative) return '0 мин';
  if (diff.inDays > 0) return '${diff.inDays} дн.';
  if (diff.inHours > 0) return '${diff.inHours} ч.';
  return '${diff.inMinutes.clamp(1, 59)} мин.';
}

String _formatDate(DateTime value) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(value.day)}.${two(value.month)}.${value.year} ${two(value.hour)}:${two(value.minute)}';
}

String _fileSize(int value) {
  if (value < 1024) return '$value Б';
  if (value < 1024 * 1024) return '${(value / 1024).toStringAsFixed(1)} КБ';
  return '${(value / (1024 * 1024)).toStringAsFixed(1)} МБ';
}
