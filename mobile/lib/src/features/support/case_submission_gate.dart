import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../theme/love_tokens.dart';
import 'support_models.dart';

class CaseSubmissionNotice extends StatelessWidget {
  const CaseSubmissionNotice({required this.state, this.onOpen, super.key});
  final CaseSubmissionState state;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
            color: context.palette.surfaceStrong,
            border: Border.all(color: context.palette.border),
            borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(state.explanation,
              style:
                  TextStyle(color: context.palette.textSecondary, height: 1.5)),
          if (state.activeCaseId.isNotEmpty && onOpen != null)
            TextButton(
                onPressed: onOpen,
                child: const Text('Открыть текущее обращение')),
        ]),
      );
}

/// Формы узнают причину ограничения до ввода и загрузки файлов.
/// Сервер повторно проверяет лимит при записи; старый backend не разрешает отправку.
class CaseSubmissionGate extends StatefulWidget {
  const CaseSubmissionGate(
      {required this.api, required this.builder, super.key});
  final LoveApi api;
  final Widget Function(BuildContext context, bool allowed) builder;
  @override
  State<CaseSubmissionGate> createState() => _CaseSubmissionGateState();
}

class _CaseSubmissionGateState extends State<CaseSubmissionGate> {
  CaseSubmissionState? _state;
  String? _error;
  bool _loading = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_state?.code == 'CASE_COOLDOWN' && mounted && _error == null) {
        if (_state!.remainingSeconds == 0 && !_loading) {
          _load();
        } else {
          setState(() {});
        }
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final inbox = await widget.api.caseInbox();
      if (mounted) setState(() => _state = inbox.submission);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_loading)
            const Padding(
                padding: EdgeInsets.only(bottom: 14),
                child: LinearProgressIndicator(minHeight: 2)),
          if (_error != null) ...[
            Text(_error!),
            TextButton(
                onPressed: _loading ? null : _load,
                child: const Text('Повторить')),
          ],
          if (_state != null) CaseSubmissionNotice(state: _state!),
          widget.builder(context,
              !_loading && _error == null && (_state?.canSubmit ?? false)),
        ],
      );
}
