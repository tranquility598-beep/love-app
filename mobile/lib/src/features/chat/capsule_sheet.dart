import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../theme/love_tokens.dart';
import 'chat_models.dart';

/// Результат выбора в шите капсулы.
class CapsuleChoice {
  const CapsuleChoice.at(this.deliverAt) : clear = false;
  const CapsuleChoice.cleared()
      : deliverAt = null,
        clear = true;

  final DateTime? deliverAt;

  /// true — пользователь снял взвод, а не выбрал новую дату.
  final bool clear;
}

/// Выбор срока капсулы времени + список своих ещё не доставленных капсул.
///
/// Капсула — это обычное сообщение с deliverAt в будущем: до срока его не
/// видит никто, включая автора. Поэтому шит только выставляет дату, а текст
/// пользователь пишет и отправляет как всегда.
class CapsuleSheet {
  static Future<CapsuleChoice?> open(
    BuildContext context, {
    required LoveApi api,
    DateTime? armed,
  }) {
    return showModalBottomSheet<CapsuleChoice>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => _CapsuleSheetBody(api: api, armed: armed),
    );
  }
}

class _CapsuleSheetBody extends StatefulWidget {
  const _CapsuleSheetBody({required this.api, this.armed});

  final LoveApi api;
  final DateTime? armed;

  @override
  State<_CapsuleSheetBody> createState() => _CapsuleSheetBodyState();
}

class _CapsuleSheetBodyState extends State<_CapsuleSheetBody> {
  static const _presets = <_Preset>[
    _Preset('Через час', Duration(hours: 1)),
    _Preset('Завтра', Duration(days: 1)),
    _Preset('Через неделю', Duration(days: 7)),
    _Preset('Через месяц', Duration(days: 30)),
    _Preset('Через год', Duration(days: 365)),
  ];

  final _capsules = <_CapsuleEntry>[];
  bool _loading = true;
  String _cancellingId = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final raw = await widget.api.capsules();
      if (!mounted) return;
      setState(() {
        _capsules
          ..clear()
          ..addAll(raw.map(_CapsuleEntry.fromJson));
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _cancel(_CapsuleEntry entry) async {
    setState(() => _cancellingId = entry.id);
    try {
      await widget.api.cancelCapsule(entry.id);
      if (!mounted) return;
      setState(() {
        _capsules.removeWhere((item) => item.id == entry.id);
        _cancellingId = '';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _cancellingId = '');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    }
  }

  Future<void> _pickCustom() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365 * 5)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(now),
    );
    if (time == null || !mounted) return;

    final picked = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    // Сервер требует минимум минуту вперёд — проверяем здесь, чтобы
    // не гонять заведомо отбойный запрос.
    if (picked.difference(DateTime.now()) < const Duration(minutes: 1)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Дата капсулы должна быть минимум на минуту вперёд'),
        ),
      );
      return;
    }
    Navigator.of(context).pop(CapsuleChoice.at(picked));
  }

  @override
  Widget build(BuildContext context) {
    final insets = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: insets),
        child: Container(
          margin: const EdgeInsets.all(12),
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.82,
          ),
          decoration: BoxDecoration(
            color: LoveColors.surfaceStrong,
            borderRadius: const BorderRadius.all(LoveRadii.md),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _header(),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Выбери срок, затем напиши сообщение и отправь его как '
                        'обычно — оно спрячется до этой даты. Получатель ничего '
                        'не увидит и не получит уведомление раньше времени.',
                        style: TextStyle(
                          fontSize: 12.5,
                          height: 1.45,
                          color: LoveColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final preset in _presets)
                            _PresetChip(
                              label: preset.label,
                              onTap: () => Navigator.of(context).pop(
                                CapsuleChoice.at(
                                  DateTime.now().add(preset.offset),
                                ),
                              ),
                            ),
                          _PresetChip(
                            label: 'Своя дата',
                            onTap: _pickCustom,
                          ),
                        ],
                      ),
                      if (widget.armed != null) ...[
                        const SizedBox(height: 14),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: () => Navigator.of(context)
                                .pop(const CapsuleChoice.cleared()),
                            icon: const Icon(Icons.close_rounded, size: 18),
                            label: const Text('Отменить взведённую капсулу'),
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                      const Text(
                        'ЗАПЛАНИРОВАННЫЕ',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.2,
                          color: LoveColors.textMuted,
                        ),
                      ),
                      const SizedBox(height: 10),
                      _capsuleList(),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: LoveColors.borderActive)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.schedule_rounded,
            size: 18,
            color: LoveColors.textSecondary,
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Капсула времени',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: LoveColors.textPrimary,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Закрыть',
            onPressed: () => Navigator.of(context).pop(),
            iconSize: 20,
            color: LoveColors.textMuted,
            icon: const Icon(Icons.close_rounded),
          ),
        ],
      ),
    );
  }

  Widget _capsuleList() {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (_capsules.isEmpty) {
      return const Text(
        'Пока ни одной капсулы не запланировано.',
        style: TextStyle(fontSize: 12.5, color: LoveColors.textMuted),
      );
    }
    return Column(
      children: [
        for (final entry in _capsules)
          _CapsuleTile(
            entry: entry,
            busy: _cancellingId == entry.id,
            onCancel: () => _cancel(entry),
          ),
      ],
    );
  }
}

class _Preset {
  const _Preset(this.label, this.offset);
  final String label;
  final Duration offset;
}

class _PresetChip extends StatelessWidget {
  const _PresetChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: const BorderRadius.all(LoveRadii.sm),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          borderRadius: const BorderRadius.all(LoveRadii.sm),
          border: Border.all(color: LoveColors.borderActive),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 12.5,
            color: LoveColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _CapsuleTile extends StatelessWidget {
  const _CapsuleTile({
    required this.entry,
    required this.busy,
    required this.onCancel,
  });

  final _CapsuleEntry entry;
  final bool busy;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: LoveColors.bgTertiary,
        borderRadius: const BorderRadius.all(LoveRadii.sm),
        border: Border.all(color: LoveColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  entry.whenLabel,
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.3,
                    color: Color(0xFFD9D9D9),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  entry.preview,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    color: LoveColors.textPrimary,
                  ),
                ),
                if (entry.where.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    entry.where,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: LoveColors.textMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: busy ? null : onCancel,
            child: busy
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Отменить'),
          ),
        ],
      ),
    );
  }
}

class _CapsuleEntry {
  _CapsuleEntry({
    required this.id,
    required this.preview,
    required this.where,
    required this.deliverAt,
  });

  factory _CapsuleEntry.fromJson(Map<String, dynamic> raw) {
    final channel = raw['channel'];
    final channelName =
        channel is Map ? asText(channel['name']) : '';
    final isText = channel is Map && asText(channel['type']) == 'text';
    final content = asText(raw['content']).trim();
    final attachments = raw['attachments'];
    final hasFiles = attachments is List && attachments.isNotEmpty;

    return _CapsuleEntry(
      id: asId(raw['_id']),
      preview: content.isNotEmpty
          ? content
          : hasFiles
              ? 'Вложение'
              : 'Сообщение',
      where: channelName.isEmpty
          ? ''
          : isText
              ? '#$channelName'
              : channelName,
      deliverAt: DateTime.tryParse(asText(raw['deliverAt']))?.toLocal(),
    );
  }

  final String id;
  final String preview;
  final String where;
  final DateTime? deliverAt;

  String get whenLabel {
    final at = deliverAt;
    if (at == null) return 'СРОК НЕ УКАЗАН';
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    final time = '${at.hour.toString().padLeft(2, '0')}:'
        '${at.minute.toString().padLeft(2, '0')}';
    final base = '${at.day} ${months[at.month - 1]}';
    if (at.year != DateTime.now().year) {
      return '$base ${at.year}, $time'.toUpperCase();
    }
    return '$base, $time'.toUpperCase();
  }
}
