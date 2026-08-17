import 'package:flutter/material.dart';

import '../theme/love_tokens.dart';

class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    required this.future,
    required this.builder,
    this.empty,
    this.onRetry,
    super.key,
  });

  final Future<T> future;
  final Widget Function(BuildContext context, T value) builder;
  final Widget? empty;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator(strokeWidth: 2));
        }
        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(LoveSpacing.lg),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                   Icon(
                    Icons.wifi_off_rounded,
                    color: context.palette.textMuted,
                    size: 34,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    snapshot.error.toString(),
                    textAlign: TextAlign.center,
                    style:  TextStyle(color: context.palette.textMuted),
                  ),
                  if (onRetry != null) ...[
                    const SizedBox(height: 14),
                    OutlinedButton.icon(
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Повторить'),
                    ),
                  ],
                ],
              ),
            ),
          );
        }
        final value = snapshot.data;
        if (value == null) return empty ?? const SizedBox.shrink();
        return builder(context, value);
      },
    );
  }
}
