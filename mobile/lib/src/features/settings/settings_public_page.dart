import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/network/api_client.dart';
import '../../core/network/love_api.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import 'settings_widgets.dart';

class PublicPageSettings extends StatefulWidget {
  const PublicPageSettings({required this.api, super.key});
  final LoveApi api;
  @override
  State<PublicPageSettings> createState() => _PublicPageSettingsState();
}

class _PublicPageSettingsState extends State<PublicPageSettings>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _summary;
  bool _opening = false;
  String? _owner;
  int _revision = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final owner = AppSessionScope.of(context).user?.id;
    if (_owner == owner) return;
    _owner = owner;
    ++_revision;
    _summary = null;
    _opening = false;
    if (owner != null) _load();
  }

  @override
  void dispose() {
    ++_revision;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    if (_owner == null) return;
    final revision = _revision;
    try {
      final value = await widget.api.profilePageSummary();
      if (mounted && revision == _revision) setState(() => _summary = value);
    } catch (_) {
      /* Сервер с выключенными публичными страницами не показывает карточку. */
    }
  }

  String get _address {
    final urls = _summary?['urls'];
    if (urls is! Map) return '';
    return ((urls['shortAvailable'] == true ? urls['short'] : urls['long']) ??
            urls['long'] ??
            '')
        .toString();
  }

  Future<void> _openEditor() async {
    if (_opening) return;
    final revision = _revision;
    setState(() => _opening = true);
    try {
      final response = await widget.api.profileEditorSession();
      if (!mounted || revision != _revision) return;
      final uri = Uri.tryParse(response['url']?.toString() ?? '');
      final apiHost = Uri.parse(AppConfig.apiBaseUrl).host;
      if (uri == null ||
          !{'https', 'http'}.contains(uri.scheme) ||
          (uri.host != 'me.loveapp.chat' && uri.host != apiHost)) {
        throw const ApiException(
            'Не удалось открыть редактор страницы. Попробуйте позже.');
      }
      // Одноразовый код остаётся во фрагменте ссылки; JWT приложения не передаётся.
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw const ApiException('Не удалось открыть браузер.');
      }
    } catch (error) {
      if (mounted && revision == _revision) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(error is ApiException
                ? error.message
                : 'Не удалось открыть редактор страницы.')));
      }
    } finally {
      if (mounted && revision == _revision) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = _summary;
    if (summary == null) return const SizedBox.shrink();
    final enabled = summary['enabled'] == true;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: SettingsCard(title: 'Публичная страница', children: [
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(enabled ? 'Опубликована' : 'Пока не опубликована',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                if (_address.isNotEmpty)
                  SelectableText(_address,
                      style: TextStyle(
                          color: context.palette.textMuted, fontSize: 12)),
                if (summary['moderation'] == 'hidden' ||
                    summary['restricted'] == true)
                  const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('Страница временно недоступна по ссылке.')),
                const SizedBox(height: 12),
                FilledButton.icon(
                    onPressed: _opening ? null : _openEditor,
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    label:
                        Text(_opening ? 'Открываем…' : 'Настроить страницу')),
                if (_address.isNotEmpty)
                  TextButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: _address));
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text('Ссылка скопирована')));
                        }
                      },
                      icon: const Icon(Icons.copy_rounded, size: 16),
                      label: const Text('Скопировать ссылку')),
              ],
            )),
      ]),
    );
  }
}
