import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../theme/love_tokens.dart';
import '../support/support_models.dart';
import 'chat_models.dart';

class MessageReportFlow {
  MessageReportFlow._();

  static Future<bool?> open(
    BuildContext context, {
    required LoveApi api,
    required ChatMessage message,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: context.palette.dropA(0.72),
      builder: (_) => _MessageReportSheet(api: api, message: message),
    );
  }
}

class _MessageReportSheet extends StatefulWidget {
  const _MessageReportSheet({required this.api, required this.message});
  final LoveApi api;
  final ChatMessage message;

  @override
  State<_MessageReportSheet> createState() => _MessageReportSheetState();
}

class _MessageReportSheetState extends State<_MessageReportSheet> {
  final _description = TextEditingController();
  late Future<List<ReportReason>> _future = widget.api.messageReportTaxonomy();
  final List<ReportReason> _path = [];
  bool _submitting = false;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _path.isEmpty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _path.isNotEmpty) setState(() => _path.removeLast());
      },
      child: Container(
        height: MediaQuery.sizeOf(context).height * 0.9,
        decoration:  BoxDecoration(
          color: context.palette.bgTertiary,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: context.palette.borderActive)),
        ),
        child: SafeArea(
          top: false,
          child: FutureBuilder<List<ReportReason>>(
            future: _future,
            builder: (context, snapshot) {
              return Column(
                children: [
                  _header(),
                  Expanded(child: _body(snapshot)),
                  _footer(snapshot.data ?? const []),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _header() {
    final selected = _path.isNotEmpty;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 12),
      decoration:  BoxDecoration(
          border: Border(bottom: BorderSide(color: context.palette.border))),
      child: Column(
        children: [
          Center(
              child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                      color: context.palette.borderActive,
                      borderRadius: BorderRadius.circular(99)))),
          const SizedBox(height: 10),
          Row(
            children: [
              if (selected)
                IconButton(
                  tooltip: 'Назад',
                  onPressed: () => setState(() => _path.removeLast()),
                  icon: const Icon(Icons.arrow_back_rounded),
                )
              else
                const SizedBox(width: 48),
               Expanded(
                child: Column(
                  children: [
                    Text('Жалоба на сообщение',
                        style: TextStyle(
                            fontSize: 19, fontWeight: FontWeight.w800)),
                    SizedBox(height: 2),
                    Text('Модератор увидит защищённый снимок',
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

  Widget _body(AsyncSnapshot<List<ReportReason>> snapshot) {
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
              Text(snapshot.error.toString(),
                  textAlign: TextAlign.center,
                  style:  TextStyle(color: context.palette.textSecondary)),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: () => setState(
                    () => _future = widget.api.messageReportTaxonomy()),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Повторить'),
              ),
            ],
          ),
        ),
      );
    }
    final roots = snapshot.data ?? const [];
    final current = _path.isEmpty ? roots : _path.last.children;
    if (_path.isNotEmpty && _path.last.isLeaf) return _review();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      children: [
        _messagePreview(),
        const SizedBox(height: 16),
        Text(
          _path.isEmpty ? 'Что произошло?' : 'Уточните проблему',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        for (final reason in current)
          _ReasonTile(
              reason: reason, onTap: () => setState(() => _path.add(reason))),
      ],
    );
  }

  Widget _review() {
    final leaf = _path.last;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      children: [
        _messagePreview(),
        const SizedBox(height: 16),
        const Text('Проверьте жалобу',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: context.palette.inkA(0.035),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.palette.border)),
          child: Text(_path.map((item) => item.label).join('  ›  '),
              style:  TextStyle(
                  color: context.palette.dangerText,
                  fontWeight: FontWeight.w700,
                  height: 1.4)),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _description,
          minLines: 4,
          maxLines: 8,
          maxLength: 4000,
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
          'Автор жалобы не будет показан нарушителю. Ложные жалобы могут привести к предупреждению.',
          style: TextStyle(
              color: context.palette.textMuted, fontSize: 11.5, height: 1.4),
        ),
      ],
    );
  }

  Widget _messagePreview() {
    final content = widget.message.content.trim();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: context.palette.inkA(0.04),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.palette.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.message.authorName,
              style:  TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  color: context.palette.textSecondary)),
          const SizedBox(height: 5),
          Text(content.isEmpty ? 'Сообщение содержит вложение' : content,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(height: 1.4)),
        ],
      ),
    );
  }

  Widget _footer(List<ReportReason> roots) {
    final ready = _path.isNotEmpty && _path.last.isLeaf;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
      decoration:  BoxDecoration(
          color: context.palette.bgPrimary,
          border: Border(top: BorderSide(color: context.palette.border))),
      child: Row(
        children: [
          if (_path.isNotEmpty)
            OutlinedButton.icon(
              onPressed:
                  _submitting ? null : () => setState(() => _path.removeLast()),
              icon: const Icon(Icons.arrow_back_rounded),
              label: const Text('Назад'),
            )
          else
            Text('${roots.length} категорий',
                style:
                     TextStyle(color: context.palette.textMuted, fontSize: 12)),
          const Spacer(),
          if (ready)
            FilledButton.icon(
              onPressed: _submitting ? null : _submit,
              icon: _submitting
                  ? const SizedBox(
                      width: 17,
                      height: 17,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.flag_rounded),
              label: const Text('Отправить жалобу'),
            ),
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
      await widget.api.reportMessage(
        messageId: widget.message.id,
        path: _path.map((item) => item.id).toList(),
        description: _description.text,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
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

class _ReasonTile extends StatelessWidget {
  const _ReasonTile({required this.reason, required this.onTap});
  final ReportReason reason;
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
                border: Border.all(color: context.palette.border)),
            child: Row(
              children: [
                 Icon(Icons.flag_outlined,
                    size: 20, color: context.palette.dangerText),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(reason.label,
                          style: const TextStyle(fontWeight: FontWeight.w800)),
                      if (reason.description.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(reason.description,
                            style:  TextStyle(
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
