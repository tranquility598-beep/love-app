import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../theme/love_tokens.dart';
import '../support/support_models.dart';

/// Жалоба на профиль: сначала «что не так» (аватар, имя, описание…), затем
/// причина из того же дерева, что у жалоб на сообщения, и описание.
/// Сервер: GET /cases/profile-report-options, POST /cases/profile-reports.
class ProfileReportFlow {
  ProfileReportFlow._();

  static Future<bool?> open(
    BuildContext context, {
    required LoveApi api,
    required String userId,
    required String name,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: context.palette.dropA(0.72),
      builder: (_) => _ProfileReportSheet(api: api, userId: userId, name: name),
    );
  }
}

class _ProfileReportSheet extends StatefulWidget {
  const _ProfileReportSheet(
      {required this.api, required this.userId, required this.name});
  final LoveApi api;
  final String userId;
  final String name;

  @override
  State<_ProfileReportSheet> createState() => _ProfileReportSheetState();
}

class _ProfileReportSheetState extends State<_ProfileReportSheet> {
  final _description = TextEditingController();
  late Future<ProfileReportOptions> _future = widget.api.profileReportOptions();
  ProfileReportPart? _part;
  final List<ReportReason> _path = [];
  bool _submitting = false;

  bool get _atStart => _part == null;
  bool get _ready => _part != null && _path.isNotEmpty && _path.last.isLeaf;

  void _back() {
    setState(() {
      if (_path.isNotEmpty) {
        _path.removeLast();
      } else {
        _part = null;
      }
    });
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    return PopScope(
      canPop: _atStart,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_atStart) _back();
      },
      child: Padding(
        padding: EdgeInsets.only(bottom: keyboard),
        child: Container(
          height: (MediaQuery.sizeOf(context).height - keyboard) * 0.9,
          decoration: BoxDecoration(
            color: context.palette.bgTertiary,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            border:
                Border(top: BorderSide(color: context.palette.borderActive)),
          ),
          child: SafeArea(
            top: false,
            child: FutureBuilder<ProfileReportOptions>(
              future: _future,
              builder: (context, snapshot) => Column(
                children: [
                  _header(),
                  Expanded(child: _body(snapshot)),
                  _footer(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 12),
      decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: context.palette.border))),
      child: Column(
        children: [
          Container(
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: context.palette.borderActive,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (!_atStart)
                IconButton(
                    tooltip: 'Назад',
                    onPressed: _back,
                    icon: const Icon(Icons.arrow_back_rounded))
              else
                const SizedBox(width: 48),
              Expanded(
                child: Column(
                  children: [
                    const Text('Жалоба на профиль',
                        style: TextStyle(
                            fontSize: 19, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(widget.name,
                        style: TextStyle(
                            color: context.palette.textMuted, fontSize: 11.5)),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Закрыть',
                onPressed: () => Navigator.of(context).pop(false),
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _body(AsyncSnapshot<ProfileReportOptions> snapshot) {
    if (snapshot.connectionState != ConnectionState.done) {
      return const Center(child: CircularProgressIndicator());
    }
    if (snapshot.hasError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(snapshot.error.toString(), textAlign: TextAlign.center),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: () =>
                    setState(() => _future = widget.api.profileReportOptions()),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Повторить'),
              ),
            ],
          ),
        ),
      );
    }
    final options = snapshot.data!;
    if (_part == null) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          const Text('Что не так в профиле?',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          for (final part in options.parts)
            _Tile(label: part.label, onTap: () => setState(() => _part = part)),
        ],
      );
    }
    if (_ready) return _review();
    final current = _path.isEmpty ? options.categories : _path.last.children;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      children: [
        _Breadcrumbs(
            text: [_part!.label, ..._path.map((r) => r.label)].join('  ›  ')),
        const SizedBox(height: 12),
        Text(_path.isEmpty ? 'Какая проблема?' : 'Уточните проблему',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        for (final reason in current)
          _Tile(
            label: reason.label,
            description: reason.description,
            onTap: () => setState(() => _path.add(reason)),
          ),
      ],
    );
  }

  Widget _review() {
    final leaf = _path.last;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      children: [
        const Text('Проверьте жалобу',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        _Breadcrumbs(
            text: [_part!.label, ..._path.map((r) => r.label)].join('  ›  ')),
        const SizedBox(height: 14),
        TextField(
          controller: _description,
          minLines: 4,
          maxLines: 8,
          maxLength: 2000,
          decoration: InputDecoration(
            labelText: leaf.descriptionRequired
                ? 'Описание обязательно'
                : 'Дополнительное описание',
            hintText:
                'Добавьте контекст, который поможет модератору разобраться',
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'В обращение попадёт снимок профиля в его нынешнем виде. Автор жалобы не будет показан нарушителю.',
          style: TextStyle(
              color: context.palette.textMuted, fontSize: 11.5, height: 1.4),
        ),
      ],
    );
  }

  Widget _footer() {
    // Кнопки темы тянутся на всю ширину (Size.fromHeight) — в строке только в Expanded.
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
      decoration: BoxDecoration(
        color: context.palette.bgPrimary,
        border: Border(top: BorderSide(color: context.palette.border)),
      ),
      child: Row(
        children: [
          if (!_atStart)
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _submitting ? null : _back,
                icon: const Icon(Icons.arrow_back_rounded),
                label: const Text('Назад'),
              ),
            )
          else
            Text('Выберите, где нарушение',
                style:
                    TextStyle(color: context.palette.textMuted, fontSize: 12)),
          if (_ready) ...[
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: FilledButton.icon(
                onPressed: _submitting ? null : _submit,
                icon: _submitting
                    ? const SizedBox(
                        width: 17,
                        height: 17,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.flag_rounded),
                label: const Text('Отправить жалобу'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _submit() async {
    final leaf = _path.last;
    if (leaf.descriptionRequired && _description.text.trim().length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Добавьте описание не короче 10 символов.')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.api.reportProfile(
        userId: widget.userId,
        part: _part!.id,
        path: _path.map((item) => item.id).toList(),
        description: _description.text,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _Breadcrumbs extends StatelessWidget {
  const _Breadcrumbs({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.palette.inkA(0.035),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.palette.border),
      ),
      child: Text(text,
          style: TextStyle(
              color: context.palette.dangerText,
              fontWeight: FontWeight.w700,
              height: 1.4)),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(
      {required this.label, required this.onTap, this.description = ''});
  final String label;
  final String description;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Material(
        color: context.palette.inkA(0.035),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.palette.border),
            ),
            child: Row(
              children: [
                Icon(Icons.flag_outlined,
                    size: 20, color: context.palette.dangerText),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label,
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                      if (description.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(description,
                            style: TextStyle(
                                color: context.palette.textMuted,
                                fontSize: 12,
                                height: 1.35)),
                      ],
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded,
                    color: context.palette.textMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
