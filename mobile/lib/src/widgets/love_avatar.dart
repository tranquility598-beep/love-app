import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../theme/love_tokens.dart';

/// Circular avatar with a flat dark fill and initials fallback, matching the
/// web `.conv-avatar` / `.partner-avatar` treatment. Online presence is a small
/// white dot with a soft glow; offline is a dim white dot.
class LoveAvatar extends StatelessWidget {
  const LoveAvatar({
    required this.label,
    this.icon,
    this.imageUrl,
    this.status,
    this.size = 44,
    this.borderColor,
    super.key,
  });

  final String label;
  final IconData? icon;
  final String? imageUrl;
  final String? status;
  final double size;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final mediaUrl = AppConfig.mediaUrl(imageUrl);
    final dot = size * 0.24;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          RepaintBoundary(
            child: ClipOval(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _backgroundColor,
                  border: Border.all(color: borderColor ?? LoveColors.border),
                ),
                child: mediaUrl == null
                    ? _FallbackAvatar(
                        icon: icon,
                        initials: _initials,
                        size: size,
                      )
                    : Image.network(
                        mediaUrl,
                        width: size,
                        height: size,
                        fit: BoxFit.cover,
                        filterQuality: FilterQuality.low,
                        gaplessPlayback: true,
                        errorBuilder: (_, __, ___) => _FallbackAvatar(
                          icon: icon,
                          initials: _initials,
                          size: size,
                        ),
                      ),
              ),
            ),
          ),
          if (status != null)
            Positioned(
              right: -1,
              bottom: -1,
              child: Container(
                width: dot,
                height: dot,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: status == 'online'
                      ? LoveColors.presenceOnline
                      : LoveColors.presenceOffline,
                  border: Border.all(color: LoveColors.bgAndroid, width: 2),
                  boxShadow: status == 'online'
                      ? [
                          BoxShadow(
                            color: Colors.white.withValues(alpha: 0.4),
                            blurRadius: 6,
                          ),
                        ]
                      : null,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Color get _backgroundColor {
    final steps = [
      const Color(0xFF161616),
      const Color(0xFF1B1B1B),
      const Color(0xFF202020),
      const Color(0xFF141414),
    ];
    return steps[_seed % steps.length];
  }

  int get _seed {
    if (label.trim().isEmpty) return 0;
    return label.runes.fold<int>(0, (sum, rune) => sum + rune);
  }

  String get _initials {
    final value = label.trim();
    if (value.isEmpty) return '?';
    final words = value.split(RegExp(r'\s+'));
    if (words.length > 1) {
      return '${_firstRune(words.first)}${_firstRune(words.last)}'
          .toUpperCase();
    }
    return _firstRune(value).toUpperCase();
  }

  String _firstRune(String value) {
    if (value.isEmpty) return '?';
    return String.fromCharCode(value.runes.first);
  }
}

class _FallbackAvatar extends StatelessWidget {
  const _FallbackAvatar({
    required this.initials,
    required this.size,
    this.icon,
  });

  final String initials;
  final double size;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: icon == null
          ? Text(
              initials,
              style: TextStyle(
                color: LoveColors.textPrimary,
                fontSize: size * 0.36,
                fontWeight: FontWeight.w600,
              ),
            )
          : Icon(
              icon,
              color: LoveColors.textPrimary,
              size: size * 0.46,
            ),
    );
  }
}
