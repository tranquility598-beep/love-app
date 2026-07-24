import 'dart:async';

import 'package:flutter/material.dart';

import '../core/calls/call_center.dart';
import '../core/voice/channel_voice_controller.dart';
import '../features/calls/call_screen.dart';
import '../features/calls/call_session.dart';
import '../features/chat/chat_models.dart';
import '../features/chat/dm_call_controller.dart';
import '../session/app_session.dart';

/// Глобальная «таблетка» активного войса/звонка (ч/б стиль).
///
/// Висит сверху ПОВЕРХ ЛЮБОГО экрана (вставляется в Overlay корневого
/// навигатора), поэтому видна и в чатах, и в сферах, и в настройках.
/// Показывается, когда есть активный звонок в ЛС или войс сферы,
/// а полноэкранный CallScreen скрыт.
///
/// Жесты:
/// - тап — развернуть полноэкранный звонок;
/// - смахнуть/утащить влево или вправо — таблетка прячется в
///   маленький «язычок» у края, чтобы не загораживать контент
///   (тап по язычку возвращает её обратно);
/// - тащить вверх/вниз — поменять высоту, если что-то перекрывает.
///
/// Позиция и сторона запоминаются до перезапуска приложения.
class CallPill {
	CallPill._();

	static OverlayEntry? _entry;
	static bool _mounted = false;

	/// Вызвать ОДИН раз при старте, сразу после CallCenter.instance.init.
	static void mount() {
		if (_mounted) return;
		_mounted = true;
		CallCenter.instance.addListener(_sync);
		ChannelVoiceController.instance.addListener(_sync);
		CallScreen.openNotifier.addListener(_sync);
		_sync();
	}

	static void _sync() {
		final voice = ChannelVoiceController.instance;
		final active =
				CallCenter.instance.activeDm != null || voice.isActive;
		final shouldShow = active && !CallScreen.isOpen;
		if (shouldShow && _entry == null) {
			final overlay = CallCenter.navigatorKey.currentState?.overlay;
			if (overlay == null) {
				// Навигатор ещё не готов — пробуем на следующем кадре.
				WidgetsBinding.instance.addPostFrameCallback((_) => _sync());
				return;
			}
			_entry = OverlayEntry(builder: (_) => const _CallPillWidget());
			overlay.insert(_entry!);
		} else if (!shouldShow && _entry != null) {
			_entry!.remove();
			_entry = null;
		}
	}
}

enum _PillDock { floating, left, right }

class _CallPillWidget extends StatefulWidget {
	const _CallPillWidget();

	@override
	State<_CallPillWidget> createState() => _CallPillWidgetState();
}

class _CallPillWidgetState extends State<_CallPillWidget> {
	// Статические — чтобы позиция переживала скрытие/показ таблетки.
	static _PillDock _dock = _PillDock.floating;
	static double _top = 0;

	Timer? _ticker;
	double _dragDx = 0;

	@override
	void initState() {
		super.initState();
		// Таймер для живого счётчика длительности.
		_ticker = Timer.periodic(const Duration(seconds: 1), (_) {
			if (mounted) setState(() {});
		});
	}

	@override
	void dispose() {
		_ticker?.cancel();
		super.dispose();
	}

	@override
	Widget build(BuildContext context) {
		final voice = ChannelVoiceController.instance;
		final center = CallCenter.instance;
		return AnimatedBuilder(
			animation: Listenable.merge([voice, center]),
			builder: (context, _) {
				final dm = center.activeDm;
				final voiceActive = voice.isActive;
				if (dm == null && !voiceActive) return const SizedBox.shrink();

				final media = MediaQuery.of(context);
				final maxTop = media.size.height * 0.65;
				final top =
						media.padding.top + 6 + _top.clamp(0.0, maxTop);

				if (_dock != _PillDock.floating) {
					return Positioned(
						top: top,
						left: _dock == _PillDock.left ? 0 : null,
						right: _dock == _PillDock.right ? 0 : null,
						child: _edgeTab(),
					);
				}

				final String title;
				final DateTime? connectedAt;
				if (dm != null) {
					title = dm.phase == DmCallPhase.connected
							? dm.displayName
							: 'Звонок...';
					connectedAt = dm.connectedAt;
				} else {
					title = voice.channelTitle.isEmpty
							? 'Войс'
							: voice.channelTitle;
					connectedAt = voice.connectedAt;
				}
				final label = connectedAt == null
						? title
						: '$title · ${_formatDuration(DateTime.now().difference(connectedAt))}';

				return Positioned(
					top: top,
					left: 0,
					right: 0,
					child: Center(child: _pill(label)),
				);
			},
		);
	}

	Widget _pill(String label) {
		return GestureDetector(
			behavior: HitTestBehavior.opaque,
			onTap: _openCallScreen,
			onPanStart: (_) => _dragDx = 0,
			onPanUpdate: (details) {
				_dragDx += details.delta.dx;
				setState(() => _top += details.delta.dy);
			},
			onPanEnd: (details) {
				final vx = details.velocity.pixelsPerSecond.dx;
				if (_dragDx < -60 || vx < -250) {
					setState(() => _dock = _PillDock.left);
				} else if (_dragDx > 60 || vx > 250) {
					setState(() => _dock = _PillDock.right);
				}
			},
			child: Material(
				color: Colors.transparent,
				child: Container(
					padding: const EdgeInsets.symmetric(
						horizontal: 14,
						vertical: 8,
					),
					decoration: BoxDecoration(
						color: const Color(0xF2101010),
						borderRadius: BorderRadius.circular(999),
						border: Border.all(
							color: Colors.white.withValues(alpha: 0.18),
						),
						boxShadow: [
							BoxShadow(
								color: Colors.black.withValues(alpha: 0.45),
								blurRadius: 18,
								offset: const Offset(0, 6),
							),
						],
					),
					child: Row(
						mainAxisSize: MainAxisSize.min,
						children: [
							const Icon(
								Icons.graphic_eq_rounded,
								size: 15,
								color: Colors.white,
							),
							const SizedBox(width: 8),
							ConstrainedBox(
								constraints: const BoxConstraints(maxWidth: 210),
								child: Text(
									label,
									maxLines: 1,
									overflow: TextOverflow.ellipsis,
									style: const TextStyle(
										color: Colors.white,
										fontSize: 12.5,
										fontWeight: FontWeight.w800,
										letterSpacing: 0.2,
										decoration: TextDecoration.none,
									),
								),
							),
							const SizedBox(width: 8),
							Icon(
								Icons.open_in_full_rounded,
								size: 13,
								color: Colors.white.withValues(alpha: 0.6),
							),
						],
					),
				),
			),
		);
	}

	/// Свёрнутая таблетка — «язычок» у края экрана.
	Widget _edgeTab() {
		final left = _dock == _PillDock.left;
		return GestureDetector(
			behavior: HitTestBehavior.opaque,
			onTap: () => setState(() => _dock = _PillDock.floating),
			onPanUpdate: (details) =>
					setState(() => _top += details.delta.dy),
			child: Material(
				color: Colors.transparent,
				child: Container(
					width: 30,
					height: 46,
					decoration: BoxDecoration(
						color: const Color(0xF2101010),
						border: Border.all(
							color: Colors.white.withValues(alpha: 0.18),
						),
						borderRadius: BorderRadius.horizontal(
							left: left
									? Radius.zero
									: const Radius.circular(999),
							right: left
									? const Radius.circular(999)
									: Radius.zero,
						),
					),
					child: const Icon(
						Icons.graphic_eq_rounded,
						size: 15,
						color: Colors.white,
					),
				),
			),
		);
	}

	void _openCallScreen() {
		final navigator = CallCenter.navigatorKey.currentState;
		if (navigator == null) return;
		final dm = CallCenter.instance.activeDm;
		if (dm != null) {
			unawaited(CallScreen.push(navigator, DmCallSession(dm)));
			return;
		}
		var selfId = '';
		var selfName = 'Вы';
		var selfAvatar = '';
		try {
			final user = AppSessionScope.of(context).user;
			selfId = asText(user?.id);
			selfName = asText(user?.username);
			selfAvatar = asText(user?.avatar);
		} catch (_) {
			// Оверлей может быть выше AppSessionScope — не критично,
			// сессия сферы откроется со значениями по умолчанию.
		}
		unawaited(CallScreen.push(
			navigator,
			ChannelCallSession(
				selfId: selfId,
				selfName: selfName,
				selfAvatar: selfAvatar,
			),
		));
	}

	String _formatDuration(Duration d) {
		final h = d.inHours;
		final m = (d.inMinutes % 60).toString().padLeft(2, '0');
		final s = (d.inSeconds % 60).toString().padLeft(2, '0');
		return h > 0 ? '$h:$m:$s' : '$m:$s';
	}
}
