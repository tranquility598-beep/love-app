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
          // Поле утоплено относительно экрана. Через `onAccent` это работало
          // только в тёмной теме, где он чёрный; в светлой он белый, и поле
          // оказывалось светлее фона — ступенькой вверх вместо вниз. В тёмной
          // теме `sinkA` даёт ровно тот же чёрный, что и раньше.
          color: context.palette.sinkA(focused ? 0.4 : 0.25),
          borderRadius: const BorderRadius.all(LoveRadii.sm),
          border: Border.all(
            color: focused ? context.palette.borderActive : context.palette.border,
          ),
        ),
        alignment: Alignment.center,
        child: TextField(
          controller: widget.controller,
          focusNode: _focus,
          autofocus: widget.autofocus,
          onChanged: widget.onChanged,
          cursorColor: context.palette.textPrimary,
          style:  TextStyle(
            color: context.palette.textPrimary,
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
            hintStyle:  TextStyle(
              color: context.palette.textMuted,
              fontSize: 14,
            ),
          ),
        ),
      ),
    );
  }
}
