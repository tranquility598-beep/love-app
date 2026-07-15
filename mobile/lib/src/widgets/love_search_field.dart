import 'package:flutter/material.dart';

import '../theme/love_tokens.dart';

/// Web `.search-box` — a compact translucent search input. Wrapper padding
/// 12×18; input 36–40px tall, `rgba(0,0,0,0.25)` fill, hairline border, 8px
/// radius, no focus ring.
class LoveSearchField extends StatefulWidget {
  const LoveSearchField({
    required this.controller,
    this.hint = 'Поиск…',
    this.onChanged,
    this.autofocus = false,
    super.key,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged;
  final bool autofocus;

  @override
  State<LoveSearchField> createState() => _LoveSearchFieldState();
}

class _LoveSearchFieldState extends State<LoveSearchField> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final focused = _focus.hasFocus;
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
      child: Container(
        height: 40,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: focused ? 0.4 : 0.25),
          borderRadius: const BorderRadius.all(LoveRadii.sm),
          border: Border.all(
            color: focused ? LoveColors.borderActive : LoveColors.border,
          ),
        ),
        alignment: Alignment.center,
        child: TextField(
          controller: widget.controller,
          focusNode: _focus,
          autofocus: widget.autofocus,
          onChanged: widget.onChanged,
          cursorColor: LoveColors.textPrimary,
          style: const TextStyle(
            color: LoveColors.textPrimary,
            fontSize: 14,
          ),
          decoration: InputDecoration(
            isDense: true,
            filled: false,
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12),
            hintText: widget.hint,
            hintStyle: const TextStyle(
              color: LoveColors.textMuted,
              fontSize: 14,
            ),
          ),
        ),
      ),
    );
  }
}
