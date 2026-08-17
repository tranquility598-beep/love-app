import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../calls/call_center.dart';

/// Tracks which DM conversation is currently open, so we don't show an in-app
/// banner for a chat the user is already looking at.
class ActiveChat {
  ActiveChat._();
  static String? conversationId;
}

/// Lightweight in-app notification presenter — slides a tappable banner down
/// from the top over any screen. Driven by realtime socket events while the
/// app is foregrounded. Uses a global navigator key so it can be triggered
/// from anywhere (e.g. the socket layer) without a BuildContext.
class InAppNotifications {
  InAppNotifications._();

  static GlobalKey<NavigatorState> get navigatorKey => CallCenter.navigatorKey;

  static OverlayEntry? _entry;

  static void show({
    required String title,
    String? body,
    String? avatarLabel,
    String? avatarUrl,
    IconData? icon,
    VoidCallback? onTap,
  }) {
    final overlay = navigatorKey.currentState?.overlay;
    if (overlay == null) return;

    _dismiss();

    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (context) => _BannerHost(
        title: title,
        body: body,
        avatarLabel: avatarLabel,
        avatarUrl: avatarUrl,
        icon: icon,
        onTap: () {
          _dismiss();
          onTap?.call();
        },
        onDismiss: () {
          if (identical(_entry, entry)) _dismiss();
        },
      ),
    );
    _entry = entry;
    overlay.insert(entry);
  }

  static void _dismiss() {
    _entry?.remove();
    _entry = null;
  }
}

class _BannerHost extends StatefulWidget {
  const _BannerHost({
    required this.title,
    required this.onDismiss,
    required this.onTap,
    this.body,
    this.avatarLabel,
    this.avatarUrl,
    this.icon,
  });

  final String title;
  final String? body;
  final String? avatarLabel;
  final String? avatarUrl;
  final IconData? icon;
  final VoidCallback onDismiss;
  final VoidCallback onTap;

  @override
  State<_BannerHost> createState() => _BannerHostState();
}

class _BannerHostState extends State<_BannerHost>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
  )..forward();
  Timer? _autoDismiss;

  @override
  void initState() {
    super.initState();
    _autoDismiss = Timer(const Duration(seconds: 4), _close);
  }

  @override
  void dispose() {
    _autoDismiss?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _close() async {
    _autoDismiss?.cancel();
    if (!mounted) return;
    await _controller.reverse();
    widget.onDismiss();
  }

  @override
  Widget build(BuildContext context) {
    final slide = CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic);
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, -1),
          end: Offset.zero,
        ).animate(slide),
        child: FadeTransition(
          opacity: slide,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Dismissible(
                key: const ValueKey('in-app-banner'),
                direction: DismissDirection.up,
                onDismissed: (_) => widget.onDismiss(),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: widget.onTap,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color:  context.palette.glassStrong,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: context.palette.borderActive),
                        boxShadow: [
                          BoxShadow(
                            color: context.palette.dropA(0.5),
                            blurRadius: 30,
                            offset: const Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          if (widget.icon != null)
                            Container(
                              width: 40,
                              height: 40,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: context.palette.inkA(0.06),
                                border: Border.all(color: context.palette.border),
                              ),
                              child: Icon(widget.icon,
                                  size: 20, color: context.palette.textPrimary),
                            )
                          else
                            LoveAvatar(
                              label: widget.avatarLabel ?? 'Love',
                              imageUrl: widget.avatarUrl,
                              size: 40,
                            ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style:  TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: context.palette.textPrimary,
                                  ),
                                ),
                                if ((widget.body ?? '').isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    widget.body!,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style:  TextStyle(
                                      fontSize: 13,
                                      color: context.palette.textSecondary,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
