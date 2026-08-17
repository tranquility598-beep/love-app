import 'package:flutter/material.dart';

import '../theme/love_tokens.dart';

/// Centered empty state, matching web `.empty-state-panel`: a bordered circle
/// mark, a Lora serif title and a muted body — sitting flat on the background
/// (no card wrapper on mobile).
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
    super.key,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 320),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color:  context.palette.inkA(0.16)), // 0.16
                ),
                child: Icon(icon, color: context.palette.accent, size: 30),
              ),
              const SizedBox(height: 20),
              Text(
                title,
                textAlign: TextAlign.center,
                style: LoveText.serifTitle(context.palette),
              ),
              const SizedBox(height: 10),
              Text(
                message,
                textAlign: TextAlign.center,
                style:  TextStyle(
                  color: context.palette.textMuted,
                  fontSize: 13.5,
                  height: 1.45,
                ),
              ),
              if (action != null) ...[
                const SizedBox(height: 20),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
