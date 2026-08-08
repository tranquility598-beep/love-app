import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../theme/love_tokens.dart';

const _roleAliases = <String, String>{
  'founder': 'developer',
  'admin': 'senior_admin',
  'moderator': 'senior_moderator',
};

const _roleLabels = <String, String>{
  'support': 'Support',
  'junior_moderator': 'Младший модератор',
  'senior_moderator': 'Старший модератор',
  'junior_admin': 'Младший администратор',
  'senior_admin': 'Старший администратор',
  'deputy_developer': 'Заместитель разработчика',
  'developer': 'Разработчик',
};

const _roleDescriptions = <String, String>{
  'support': 'Помогает пользователям и передаёт сложные вопросы модерации.',
  'junior_moderator':
      'Рассматривает жалобы и выдаёт базовые предупреждения и муты.',
  'senior_moderator':
      'Рассматривает сложные жалобы, апелляции и контролирует модераторов.',
  'junior_admin':
      'Управляет сервисными разделами, контентом и расширенной модерацией.',
  'senior_admin': 'Отвечает за команду, безопасность и критические решения.',
  'deputy_developer':
      'Помогает управлять командой и технической инфраструктурой Love.',
  'developer': 'Разработчик и владелец Love.',
};

const _roleSvgs = <String, String>{
  'support':
      '<path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2zM20 13a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2z"/><path d="M17 17c-.8 2-2.4 3-5 3"/>',
  'junior_moderator':
      '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6z"/><path d="M9 12h6"/>',
  'senior_moderator':
      '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  'junior_admin':
      '<circle cx="8" cy="15" r="4"/><path d="m11 12 7-7 2 2-2 2 1.5 1.5-2 2L16 11l-2 2"/>',
  'senior_admin':
      '<path d="m4 8 4 4 4-7 4 7 4-4-2 10H6z"/><path d="M6 18h12"/>',
  'deputy_developer':
      '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/><path d="M18.5 3.5v3M17 5h3"/>',
  'developer':
      '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/><path d="M17.5 3v3M16 4.5h3"/>',
};

String normalizeStaffRole(String? role) {
  final value = (role ?? '').trim().toLowerCase();
  return _roleAliases[value] ?? value;
}

String staffRoleLabel(String? role) {
  return _roleLabels[normalizeStaffRole(role)] ?? '';
}

class StaffRoleIcon extends StatelessWidget {
  const StaffRoleIcon({required this.role, this.size = 26, super.key});

  final String role;
  final double size;

  @override
  Widget build(BuildContext context) {
    final normalized = normalizeStaffRole(role);
    final path = _roleSvgs[normalized];
    final label = staffRoleLabel(normalized);
    if (path == null || label.isEmpty) return const SizedBox.shrink();
    final svg =
        '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">$path</svg>';
    return Tooltip(
      message: label,
      child: Semantics(
        button: true,
        label: 'Роль: $label',
        child: InkResponse(
          radius: size,
          onTap: () => _showRole(context, normalized),
          child: Container(
            width: size,
            height: size,
            padding: EdgeInsets.all(size * 0.22),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: LoveColors.border),
            ),
            child: SvgPicture.string(svg),
          ),
        ),
      ),
    );
  }

  void _showRole(BuildContext context, String normalized) {
    final label = staffRoleLabel(normalized);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => SafeArea(
        child: Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: LoveColors.surfaceStrong,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StaffRoleIconStatic(role: normalized, size: 42),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 5),
                    Text(
                      _roleDescriptions[normalized] ?? '',
                      style: const TextStyle(
                          color: LoveColors.textSecondary, height: 1.4),
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
}

class StaffRoleIconStatic extends StatelessWidget {
  const StaffRoleIconStatic({required this.role, this.size = 32, super.key});
  final String role;
  final double size;

  @override
  Widget build(BuildContext context) {
    final path = _roleSvgs[normalizeStaffRole(role)];
    if (path == null) return const SizedBox.shrink();
    final svg =
        '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">$path</svg>';
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.24),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: LoveColors.border),
      ),
      child: SvgPicture.string(svg),
    );
  }
}

class StaffRoleLabel extends StatelessWidget {
  const StaffRoleLabel({required this.role, this.compact = false, super.key});
  final String? role;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final label = staffRoleLabel(role);
    if (label.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: compact ? 8 : 10, vertical: compact ? 4 : 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: LoveColors.borderActive),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: compact ? 10.5 : 12,
              fontWeight: FontWeight.w800,
              color: LoveColors.textSecondary)),
    );
  }
}
