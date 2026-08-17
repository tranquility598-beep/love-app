import 'package:flutter/material.dart';

import '../theme/love_tokens.dart';

class LovePillTab {
  const LovePillTab(this.label, {this.count, this.showDot = false});
  final String label;
  final int? count;
  final bool showDot;
}

/// Horizontal scrolling pill filter tabs, matching web `.friends-filter-nav`
/// `.filter-tab`. Inactive: faint fill, muted text. Active: brighter fill +
/// white text + border. Optional `(count)` and a pending white dot.
class LovePillTabs extends StatelessWidget {
  const LovePillTabs({
    required this.tabs,
    required this.selected,
    required this.onSelected,
    this.padding = const EdgeInsets.symmetric(horizontal: 16),
    super.key,
  });

  final List<LovePillTab> tabs;
  final int selected;
  final ValueChanged<int> onSelected;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 34,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: padding,
        itemCount: tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (context, index) {
          final tab = tabs[index];
          final active = index == selected;
          return _Pill(
            tab: tab,
            active: active,
            onTap: () => onSelected(index),
          );
        },
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.tab, required this.active, required this.onTap});

  final LovePillTab tab;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = active ? context.palette.accent :  context.palette.inkA(0.4); // 0.4
    return Material(
      color: active
          ? context.palette.inkA(0.08)
          : context.palette.inkA(0.03),
      borderRadius: BorderRadius.circular(99),
      child: InkWell(
        borderRadius: BorderRadius.circular(99),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(99),
            border: Border.all(
              color: active ? context.palette.borderActive : context.palette.border,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                tab.count != null ? '${tab.label} (${tab.count})' : tab.label,
                style: TextStyle(
                  color: fg,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (tab.showDot) ...[
                const SizedBox(width: 6),
                Container(
                  width: 6,
                  height: 6,
                  decoration:  BoxDecoration(
                    shape: BoxShape.circle,
                    color: context.palette.accent,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
