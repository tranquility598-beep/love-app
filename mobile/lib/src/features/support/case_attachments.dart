import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../core/platform/audio_file_picker.dart';

class CaseFileDraft {
  CaseFileDraft(this.file, this.mimeType);
  final PickedChatFile file;
  final String mimeType;
  Map<String, dynamic>? _uploaded;

  static const _types = <String, (String, int)>{
    'jpg': ('image/jpeg', 10),
    'jpeg': ('image/jpeg', 10),
    'png': ('image/png', 10),
    'gif': ('image/gif', 10),
    'webp': ('image/webp', 10),
    'mp4': ('video/mp4', 50),
    'webm': ('video/webm', 50),
    'mov': ('video/quicktime', 50),
    'avi': ('video/x-msvideo', 50),
    'txt': ('text/plain', 5),
    'log': ('text/plain', 5),
    'pdf': ('application/pdf', 5),
  };

  factory CaseFileDraft.checked(PickedChatFile file) {
    final type = _types[file.name.split('.').last.toLowerCase()];
    if (type == null) {
      throw const FormatException(
          'Можно приложить изображение, видео, PDF или текстовый файл.');
    }
    if (file.size <= 0 || file.size > type.$2 * 1048576) {
      throw FormatException('Выберите непустой файл до ${type.$2} МБ.');
    }
    return CaseFileDraft(file, type.$1);
  }

  Future<Map<String, dynamic>> upload(LoveApi api) async {
    if (_uploaded != null) return _uploaded!;
    final response = await api.uploadAttachment(file.path, mimeType: mimeType);
    final url = response['url']?.toString() ?? '';
    if (!{'http', 'https'}.contains(Uri.tryParse(url)?.scheme)) {
      throw const FormatException('Сервер не подтвердил загрузку вложения.');
    }
    return _uploaded = {
      'name': response['originalName'] ?? file.name,
      'url': url,
      'mimeType': response['mimetype'] ?? mimeType,
      'size': response['size'] ?? file.size
    };
  }
}

class CaseAttachments extends StatefulWidget {
  const CaseAttachments(
      {required this.files,
      required this.enabled,
      required this.onChanged,
      super.key});
  final List<CaseFileDraft> files;
  final bool enabled;
  final VoidCallback onChanged;
  @override
  State<CaseAttachments> createState() => _CaseAttachmentsState();
}

class _CaseAttachmentsState extends State<CaseAttachments> {
  bool _picking = false;
  Future<void> _pick() async {
    if (_picking || !widget.enabled || widget.files.length >= 5) return;
    setState(() => _picking = true);
    try {
      final file = await ChatNativeFiles.pickFile();
      if (file == null ||
          !mounted ||
          !widget.enabled ||
          widget.files.length >= 5) {
        return;
      }
      if (widget.files.any((draft) => draft.file.path == file.path)) return;
      widget.files.add(CaseFileDraft.checked(file));
      widget.onChanged();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(error is FormatException
                ? error.message
                : 'Не удалось прикрепить файл.')));
      }
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final draft in widget.files)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.insert_drive_file_outlined),
            title: Text(draft.file.name,
                maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing: IconButton(
                tooltip: 'Убрать файл',
                onPressed: widget.enabled
                    ? () {
                        widget.files.remove(draft);
                        widget.onChanged();
                      }
                    : null,
                icon: const Icon(Icons.close_rounded)),
          ),
        OutlinedButton.icon(
            onPressed: widget.enabled && !_picking && widget.files.length < 5
                ? _pick
                : null,
            icon: const Icon(Icons.attach_file_rounded),
            label: Text(_picking
                ? 'Выбираем…'
                : 'Прикрепить файл (${widget.files.length}/5)')),
      ]);
}
