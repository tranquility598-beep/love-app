import 'package:flutter/material.dart';

import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_surface.dart';
import 'settings_widgets.dart';

/// Тарифы Love. Состав и цены — те же, что в «Настройки → Подписки» на ПК
/// (client/index.html). Оплаты пока нет: кнопки покупки неактивны.
class _Plan {
  const _Plan(this.id, this.name, this.description, this.price, this.features,
      {this.featured = false});

  final String id;
  final String name;
  final String description;
  final int price;
  final List<String> features;
  final bool featured;
}

const _plans = <_Plan>[
  _Plan('free', 'Free', 'Всё, чтобы начать общаться.', 0, [
    'Основные возможности общения',
    'Публичная страница профиля',
    'До 3 ссылок на странице',
    'Базовые темы оформления',
  ]),
  _Plan('pro', 'Pro', 'Больше свободы в оформлении.', 299, [
    'Все возможности Free',
    'До 12 ссылок и короткий адрес',
    'Свой фон и цвет акцента',
    'Анимированные аватар и баннер',
    'Статистика за 7 дней',
  ]),
  _Plan('premium', 'Premium', 'Профиль с вашим характером.', 499, [
    'Все возможности Pro',
    'До 20 ссылок на странице',
    'Музыка, эффекты и видеофон',
    'Шрифты и рамки аватара',
    'Статистика за 30 дней',
  ], featured: true),
  _Plan('duo', 'Duo', 'Один тариф для вас двоих.', 799, [
    'Premium для двух аккаунтов',
    'Отдельный профиль у каждого',
    'Музыка и эффекты на страницах',
    'Оформление без общих настроек',
  ]),
];

class SubscriptionsSettingsSection extends StatelessWidget {
  const SubscriptionsSettingsSection({super.key});

  @override
  Widget build(BuildContext context) {
    final user = AppSessionScope.of(context).user;
    final stored = _plans.any((p) => p.id == user?.plan) ? user!.plan! : 'free';
    final expiresAt = user?.planExpiresAt;
    final expired = stored != 'free' &&
        expiresAt != null &&
        !expiresAt.isAfter(DateTime.now());
    // Просроченный платный тариф показывается как Free — так же решает сервер.
    final current = expired ? 'free' : stored;
    final currentPlan = _plans.firstWhere((p) => p.id == current);
    final detail = current == 'free'
        ? (expired
            ? 'Срок подписки завершён. Сейчас доступны возможности Free.'
            : 'Бесплатный тариф без ограничения по сроку.')
        : (expiresAt != null
            ? 'Действует до ${_date(expiresAt)}.'
            : 'Тариф активен на вашем аккаунте.');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Подписки',
          desc: 'Тарифы Love. Цены предварительные, оплата пока недоступна.',
        ),
        const SizedBox(height: 16),
        SettingsCard(
          title: 'Ваш тариф',
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user == null ? 'Нет данных об аккаунте' : 'Love ${currentPlan.name}',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  user == null ? 'Откройте раздел после входа в Love.' : detail,
                  style: TextStyle(color: context.palette.textMuted, height: 1.4),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 14),
        for (final plan in _plans) ...[
          _PlanCard(plan: plan, current: user != null && plan.id == current),
          const SizedBox(height: 12),
        ],
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'Общение в Love остаётся бесплатным. Платные тарифы расширяют '
            'возможности оформления профиля.',
            style: TextStyle(color: context.palette.textMuted, height: 1.45, fontSize: 12.5),
          ),
        ),
      ],
    );
  }

  static String _date(DateTime value) {
    final local = value.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(local.day)}.${two(local.month)}.${local.year}';
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.current});

  final _Plan plan;
  final bool current;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final highlighted = current || plan.featured;
    return LoveSurface(
      radius: 16,
      color: palette.surfaceStrong,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      child: DecoratedBox(
        decoration: const BoxDecoration(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(plan.name,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                const Spacer(),
                if (current)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: palette.accent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('Ваш тариф',
                        style: TextStyle(
                            color: palette.onAccent,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800)),
                  )
                else if (plan.featured)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: palette.borderActive),
                    ),
                    child: Text('Популярный',
                        style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(plan.description, style: TextStyle(color: palette.textMuted)),
            const SizedBox(height: 10),
            Text.rich(
              TextSpan(children: [
                TextSpan(
                  text: '${plan.price} ₽',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: highlighted ? palette.textPrimary : palette.textSecondary,
                  ),
                ),
                TextSpan(
                  text: ' / месяц',
                  style: TextStyle(color: palette.textMuted, fontSize: 13),
                ),
              ]),
            ),
            const SizedBox(height: 10),
            for (final feature in plan.features)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Icon(Icons.check_rounded, size: 16, color: palette.textSecondary),
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(feature, style: const TextStyle(height: 1.3))),
                  ],
                ),
              ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: null,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(44),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(plan.price == 0 ? 'Бесплатно' : 'Покупка пока недоступна'),
            ),
          ],
        ),
      ),
    );
  }
}
