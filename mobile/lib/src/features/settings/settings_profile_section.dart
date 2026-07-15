import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/network/api_client.dart';
import '../../core/network/love_api.dart';
import '../../core/platform/audio_file_picker.dart';
import '../../features/auth/auth_repository.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import 'settings_widgets.dart';

/// Settings → Профиль. The public profile card exactly as on desktop: avatar,
/// display name, bio, status, mood-icon picker, "now listening" (+ music
/// upload), and the hobbies editor. Saves via `PUT /users/profile`.
class ProfileSettingsSection extends StatefulWidget {
  const ProfileSettingsSection({required this.api, super.key});

  final LoveApi api;

  @override
  State<ProfileSettingsSection> createState() => _ProfileSettingsSectionState();
}

class _ProfileSettingsSectionState extends State<ProfileSettingsSection> {
  final _nickname = TextEditingController();
  final _bio = TextEditingController();
  final _customStatus = TextEditingController();
  final _listening = TextEditingController();

  String _mood = 'tea';
  List<HobbyItem> _hobbies = [];
  String _musicUrl = '';
  String _musicTitle = '';

  String? _loadedUserId;
  bool _saving = false;
  bool _uploadingAvatar = false;
  bool _uploadingMusic = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final user = AppSessionScope.of(context).user;
    if (user != null && user.id != _loadedUserId) {
      _hydrate(user);
    }
  }

  @override
  void dispose() {
    _nickname.dispose();
    _bio.dispose();
    _customStatus.dispose();
    _listening.dispose();
    super.dispose();
  }

  void _hydrate(AuthUser user) {
    _loadedUserId = user.id;
    _nickname.text = user.nickname ?? user.username;
    _bio.text = user.bio ?? '';
    _customStatus.text = user.customStatus ?? '';
    _listening.text = user.listening ?? '';
    final mood = user.mood ?? '';
    _mood = moodIconNames.contains(mood) ? mood : 'tea';
    _hobbies = user.hobbies
        .map((item) => HobbyItem(
              text: item['text']?.toString().trim() ?? '',
              icon: hobbyIconNames.contains(item['icon']?.toString())
                  ? item['icon'].toString()
                  : 'tea',
            ))
        .where((h) => h.text.isNotEmpty)
        .take(HobbiesEditor.maxHobbies)
        .toList();
    _musicTitle = user.musicTitle ?? '';
    _musicUrl = user.musicUrl ?? '';
  }

  @override
  Widget build(BuildContext context) {
    final session = AppSessionScope.of(context);
    final user = session.user;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Профиль',
          desc: 'Так вас видят другие пользователи Love',
        ),
        const SizedBox(height: 16),
        // Avatar card
        SettingsCard(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  LoveAvatar(
                    label: user?.displayName ?? 'Love user',
                    imageUrl: user?.avatar,
                    size: 66,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.displayName ?? 'Love user',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '@${user?.username ?? 'love'}',
                          style: const TextStyle(color: LoveColors.textMuted),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: _uploadingAvatar ? null : _pickAvatar,
                          icon: _uploadingAvatar
                              ? const SizedBox(
                                  width: 15,
                                  height: 15,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.image_outlined, size: 18),
                          label: const Text('Изменить аватар'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        // Public card fields
        SettingsCard(
          title: 'Публичная карточка',
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 4),
              child: Column(
                children: [
                  TextField(
                    controller: _nickname,
                    maxLength: 32,
                    decoration: const InputDecoration(
                      labelText: 'Отображаемое имя',
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextField(
                    controller: _bio,
                    maxLength: 190,
                    minLines: 3,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      labelText: 'О себе',
                      hintText: 'Расскажите о себе...',
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextField(
                    controller: _customStatus,
                    maxLength: 48,
                    decoration: const InputDecoration(
                      labelText: 'Статус (настроение)',
                      hintText: 'Чем заняты прямо сейчас?',
                    ),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: SettingsSubtitle('Иконка настроения',
                        padding: const EdgeInsets.only(bottom: 10)),
                  ),
                  MoodPicker(
                    value: _mood,
                    onChanged: (name) => setState(() => _mood = name),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        // Activity: music + hobbies
        SettingsCard(
          title: 'Активность',
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _listening,
                    maxLength: 80,
                    decoration: const InputDecoration(
                      labelText: 'Сейчас слушает',
                      hintText: 'Исполнитель — Название',
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _uploadingMusic ? null : _pickMusic,
                          icon: _uploadingMusic
                              ? const SizedBox(
                                  width: 15,
                                  height: 15,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2),
                                )
                              : const Icon(Icons.audio_file_outlined, size: 18),
                          label: const Text('Загрузить трек'),
                        ),
                      ),
                      if (_musicUrl.isNotEmpty) ...[
                        const SizedBox(width: 10),
                        IconButton(
                          tooltip: 'Убрать трек',
                          onPressed: () => setState(() {
                            _musicUrl = '';
                            _musicTitle = '';
                          }),
                          icon: const Icon(Icons.close_rounded),
                        ),
                      ],
                    ],
                  ),
                  if (_musicUrl.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle_rounded,
                              size: 15, color: settingsSuccess),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              _musicTitle.isEmpty ? 'Трек загружен' : _musicTitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: LoveColors.textMuted,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 14),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: SettingsSubtitle('Сферы увлечений',
                        padding: const EdgeInsets.only(bottom: 4)),
                  ),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 10),
                    child: Text(
                      'До 5 увлечений, по 20 символов каждое.',
                      style: TextStyle(color: LoveColors.textMuted, fontSize: 12),
                    ),
                  ),
                  HobbiesEditor(
                    hobbies: _hobbies,
                    onChanged: (next) => setState(() => _hobbies = next),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!,
            style: const TextStyle(color: LoveColors.danger, height: 1.35),
          ),
        ],
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: _saving ? null : () => _saveProfile(session),
          icon: _saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.black,
                  ),
                )
              : const Icon(Icons.check_rounded),
          label: const Text('Сохранить профиль'),
        ),
      ],
    );
  }

  Future<void> _pickAvatar() async {
    setState(() {
      _uploadingAvatar = true;
      _error = null;
    });
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        imageQuality: 82,
        maxWidth: 640,
        maxHeight: 640,
      );
      if (picked == null) return;
      final response =
          await widget.api.uploadAvatar(picked.path, mimeType: picked.mimeType);
      final rawUser = response['user'];
      if (rawUser is Map && mounted) {
        AppSessionScope.of(context)
            .updateUserFromJson(rawUser.cast<String, dynamic>());
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Future<void> _pickMusic() async {
    setState(() {
      _uploadingMusic = true;
      _error = null;
    });
    try {
      final file = await AudioFilePicker.pickAudio();
      if (file == null) return;
      final response =
          await widget.api.uploadMusic(file.path, mimeType: file.mimeType);
      final url = response['url']?.toString() ?? '';
      if (url.isEmpty) {
        throw const FormatException('Сервер не вернул ссылку на трек');
      }
      setState(() {
        _musicUrl = url;
        if (_musicTitle.trim().isEmpty) {
          _musicTitle = file.name.replaceFirst(RegExp(r'\.[^.]+$'), '');
        }
        if (_listening.text.trim().isEmpty) {
          _listening.text = _musicTitle.trim();
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _uploadingMusic = false);
    }
  }

  Future<void> _saveProfile(AppSession session) async {
    if (_nickname.text.trim().isEmpty) {
      setState(() => _error = 'Имя не может быть пустым');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final response = await widget.api.updateProfile({
        'nickname': _nickname.text.trim(),
        'bio': _bio.text.trim(),
        'customStatus': _customStatus.text.trim(),
        'mood': _mood,
        'listening': _listening.text.trim(),
        'music': {'title': _musicTitle.trim(), 'url': _musicUrl},
        'hobbies': _hobbies.map((h) => h.toJson()).toList(),
      });
      final rawUser = response['user'];
      if (rawUser is Map) {
        session.updateUserFromJson(rawUser.cast<String, dynamic>());
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Изменения сохранены')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _friendly(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _friendly(Object error) {
    if (error is ApiException) return error.message;
    return error.toString();
  }
}
