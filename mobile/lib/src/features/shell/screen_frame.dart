import 'package:flutter/material.dart';

import '../../theme/love_tokens.dart';

/// Standard list/page header used across the main tabs.
///
/// Web `.sidebar-header`: 64px tall, hairline bottom border, title in
/// **Lora italic** (lowercase in source), trailing icon actions on the right.
class ScreenFrame extends StatelessWidget {
  const ScreenFrame({
    required this.title,
    required this.child,
    this.leading,
    this.trailing,
    this.titleStyle,
    this.showDivider = true,
    super.key,
  });

  final String title;
  final Widget child;
  final Widget? leading;
  final Widget? trailing;
  final TextStyle? titleStyle;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SafeArea(
          bottom: false,
          child: Container(
            height: 64,
            padding: const EdgeInsets.fromLTRB(20, 0, 12, 0),
            decoration: showDivider
                ? const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: LoveColors.border),
                    ),
                  )
                : null,
            child: Row(
              children: [
                if (leading != null) ...[
                  leading!,
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: titleStyle ?? LoveText.screenTitle,
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}
