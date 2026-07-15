import 'package:flutter/material.dart';

import '../config/app_config.dart';

class SpaceBanner extends StatelessWidget {
  const SpaceBanner({
    required this.url,
    this.height = 96,
    this.radius = 12,
    super.key,
  });

  final String url;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final mediaUrl = AppConfig.mediaUrl(url);
    if (mediaUrl == null) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.network(
        mediaUrl,
        height: height,
        width: double.infinity,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.low,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      ),
    );
  }
}
