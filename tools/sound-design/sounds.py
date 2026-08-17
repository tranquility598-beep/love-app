#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Звуковой набор Love: свои фразы из живых записанных нот.

Сырьё — одиночные ноты маримбы, глокеншпиля, калимбы и ручных колокольчиков
(VCSL, CC0). Ноты, фразы, длины, огибающие и пространство — свои.

Сетка: пентатоника D-минор (D F G A C). Один лад на весь интерфейс — поэтому
звуки складываются друг с другом, даже когда приходят внахлёст.

Для самых часто слышимых событий сделано по 2-3 варианта (суффикс __a/__b/__c),
чтобы выбрать на слух. После выбора вариант переименовывается в базовое имя.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Sequence

import numpy as np

from engine import reverb, seq
from sampler import hit, layer, note

# Целевая громкость (A-взвешенный RMS по окну 50 мс) и потолок по пику.
LOUD_UI = -29.0
LOUD_CHAT = -26.0
LOUD_ALERT = -23.0
LOUD_RING = -18.0
CEIL_SHORT = -9.0
CEIL_RING = -5.0


@dataclass
class Sound:
    name: str          # базовое событие (без суффикса варианта)
    rel: str           # путь внутри assets/sounds
    build: Callable[[], np.ndarray]
    loud: float
    ceil: float = CEIL_SHORT
    fmt: str = "wav"   # wav для коротких, ogg для длинных лупов
    loop: bool = False  # луп: длину не трогать, тишина в хвосте задаёт ритм
    note: str = ""
    variant: str = ""  # "", "a", "b", "c"
    tags: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return f"{self.name}__{self.variant}" if self.variant else self.name


# ---------------------------------------------------------------------------
# Голоса: живые инструменты
# ---------------------------------------------------------------------------


def mar(n: str, dur: float, **kw) -> np.ndarray:
    """Маримба, мягкая палочка — тёплое дерево, короткий звон."""
    return note("marimba_soft", n, dur, **kw)


def marm(n: str, dur: float, **kw) -> np.ndarray:
    """Маримба, средний удар — заметнее, больше стука от палочки."""
    return note("marimba_med", n, dur, **kw)


def glo(n: str, dur: float, **kw) -> np.ndarray:
    """Глокеншпиль — металл, ясная верхушка."""
    return note("glock_soft", n, dur, **kw)


def kal(n: str, dur: float, **kw) -> np.ndarray:
    """Калимба — щипок, живое дыхание в атаке.

    Верх приглушён: в записи 4% энергии выше 8 кГц, в телефонном динамике
    это сипение, а не воздух.
    """
    kw.setdefault("lowpass", 11_000.0)
    return note("kalimba", n, dur, **kw)


def chi(n: str, dur: float, **kw) -> np.ndarray:
    """Ручные колокольчики — долгий чистый хвост."""
    return note("chime", n, dur, **kw)


def phrase(voice: Callable, notes: Sequence[str], gap: float, dur: float,
           gains: Sequence[float] = (), **kw) -> np.ndarray:
    """Фраза: ноты через `gap` мс. Каждая следующая чуть тише — как у живого
    исполнителя, который не бьёт дважды с одинаковой силой."""
    g = list(gains) or [1.0 * 0.93 ** i for i in range(len(notes))]
    return seq([(i * gap, voice(n, dur, **kw) * g[i]) for i, n in enumerate(notes)])


def thud(shift: float, dur: float, tone: str = "", tone_gain: float = 0.5,
         tone_dur: float = 70.0, click: float = 0.55,
         which: str = "Claves1") -> np.ndarray:
    """Глухой удар для микрофона и наушников: клавес + низкая нота корпуса.

    Не нота — событие. Поэтому клавес транспонируется свободно: чем ниже,
    чем тупее удар, тем яснее «выключено».
    """
    parts = [hit(which, dur, gain=click, shift=shift, decay=7.0, hold_ms=8.0)]
    if tone:
        parts.append(mar(tone, tone_dur, decay=6.0, gain=tone_gain))
    return layer(*parts)


# ---------------------------------------------------------------------------
# Набор
# ---------------------------------------------------------------------------

SOUNDS: list[Sound] = [
    # --- отправка сообщения: одна нота, коротко, почти незаметно -----------
    Sound("message_send", "chat/message_send",
          lambda: reverb(mar("D5", 150, decay=4.0), decay_ms=140, mix=0.10, tone=6000),
          LOUD_CHAT - 3, variant="a", note="маримба D5, сухо", tags=["чат"]),
    Sound("message_send", "chat/message_send",
          lambda: reverb(kal("D5", 190, decay=3.4), decay_ms=160, mix=0.12),
          LOUD_CHAT - 3, variant="b", note="калимба D5, щипок", tags=["чат"]),
    Sound("message_send", "chat/message_send",
          lambda: reverb(mar("A5", 130, decay=4.5), decay_ms=130, mix=0.10, tone=6500),
          LOUD_CHAT - 3, variant="c", note="маримба A5, выше и легче", tags=["чат"]),

    # --- приём сообщения: две ноты вверх ----------------------------------
    Sound("message_receive", "chat/message_receive",
          lambda: reverb(phrase(mar, ["A5", "D6"], 70, 200, decay=3.6),
                         decay_ms=200, mix=0.14),
          LOUD_CHAT, variant="a", note="маримба A5→D6", tags=["чат"]),
    Sound("message_receive", "chat/message_receive",
          lambda: reverb(phrase(glo, ["G5", "C6"], 75, 240, decay=3.0),
                         decay_ms=230, mix=0.16, tone=6500),
          LOUD_CHAT, variant="b", note="глокеншпиль G5→C6", tags=["чат"]),
    Sound("message_receive", "chat/message_receive",
          lambda: reverb(phrase(chi, ["D5", "A5"], 85, 280, decay=2.6),
                         decay_ms=240, mix=0.16),
          LOUD_CHAT, variant="c", note="колокольчики D5→A5", tags=["чат"]),

    # --- уведомление: заметно, но не тревожно ------------------------------
    Sound("notification", "notifications/notification",
          lambda: reverb(phrase(glo, ["C6", "G5"], 95, 300, decay=2.6),
                         decay_ms=300, mix=0.20),
          LOUD_ALERT, variant="a", note="глокеншпиль C6→G5, вниз",
          tags=["уведомления"]),
    Sound("notification", "notifications/notification",
          lambda: reverb(phrase(mar, ["D5", "A5", "D6"], 85, 260, decay=3.2),
                         decay_ms=280, mix=0.18),
          LOUD_ALERT, variant="b", note="маримба D5-A5-D6, вверх",
          tags=["уведомления"]),
    Sound("notification", "notifications/notification",
          lambda: reverb(phrase(chi, ["A5", "D6"], 100, 420, decay=2.2),
                         decay_ms=380, mix=0.22),
          LOUD_ALERT, variant="c", note="колокольчики A5→D6, долгий хвост",
          tags=["уведомления"]),

    # --- системное сообщение: ниже и нейтральнее ---------------------------
    Sound("system", "notifications/system",
          lambda: reverb(phrase(marm, ["A4", "D5"], 100, 240, decay=3.6),
                         decay_ms=220, mix=0.16),
          LOUD_ALERT - 3, note="маримба A4→D5", tags=["уведомления"]),

    # --- вход в голосовой: вверх, тёплый -----------------------------------
    Sound("user_join", "presence/user_join",
          lambda: reverb(phrase(kal, ["A4", "D5"], 80, 260, decay=3.0),
                         decay_ms=220, mix=0.15),
          LOUD_UI + 3, variant="a", note="калимба A4→D5", tags=["присутствие"]),
    Sound("user_join", "presence/user_join",
          lambda: reverb(phrase(mar, ["D5", "A5"], 75, 220, decay=3.4),
                         decay_ms=200, mix=0.14),
          LOUD_UI + 3, variant="b", note="маримба D5→A5", tags=["присутствие"]),

    # --- выход из голосового: вниз, глуше ----------------------------------
    Sound("user_leave", "presence/user_leave",
          lambda: reverb(phrase(kal, ["D5", "A4"], 80, 280, decay=2.8),
                         decay_ms=220, mix=0.15, tone=4200),
          LOUD_UI + 3, note="калимба D5→A4", tags=["присутствие"]),

    # --- микрофон и наушники: удары, не ноты -------------------------------
    Sound("voice_mute", "voice/voice_mute",
          lambda: reverb(thud(-7.0, 95, tone="D4", tone_gain=0.45),
                         decay_ms=110, mix=0.07, tone=3600),
          LOUD_UI + 2, variant="a", note="глухой удар + D4", tags=["голос"]),
    Sound("voice_mute", "voice/voice_mute",
          lambda: reverb(thud(-4.0, 75, click=0.7, which="Claves2"),
                         decay_ms=90, mix=0.06, tone=3200),
          LOUD_UI + 2, variant="b", note="сухой удар, без тона", tags=["голос"]),

    Sound("voice_unmute", "voice/voice_unmute",
          lambda: reverb(thud(1.0, 80, tone="A4", tone_gain=0.4, tone_dur=90),
                         decay_ms=110, mix=0.07, tone=4800),
          LOUD_UI + 2, note="светлый удар + A4", tags=["голос"]),

    Sound("voice_deafen", "voice/voice_deafen",
          lambda: reverb(seq([(0.0, thud(-5.0, 70, click=0.6)),
                              (75.0, thud(-9.0, 110, tone="D4", tone_gain=0.4,
                                          click=0.55) * 0.92)]),
                         decay_ms=130, mix=0.07, tone=3000),
          LOUD_UI + 2, note="два удара вниз", tags=["голос"]),

    Sound("voice_undeafen", "voice/voice_undeafen",
          lambda: reverb(seq([(0.0, thud(-4.0, 70, click=0.55)),
                              (75.0, thud(2.0, 100, tone="A4", tone_gain=0.4,
                                          click=0.6) * 0.95)]),
                         decay_ms=130, mix=0.07, tone=5000),
          LOUD_UI + 2, note="два удара вверх", tags=["голос"]),

    # --- переключатель в интерфейсе: только щелчок -------------------------
    Sound("ui_toggle", "ui/ui_toggle",
          lambda: reverb(hit("Claves2", 45, shift=4.0, decay=9.0, hold_ms=5.0),
                         decay_ms=70, mix=0.05),
          LOUD_UI - 3, note="сухой щелчок клавес", tags=["интерфейс"]),

    # --- звонки: лупы ------------------------------------------------------
    Sound("call_incoming", "calls/call_incoming",
          lambda: seq([(0.0, reverb(phrase(chi, ["A5", "D6"], 150, 520, decay=2.0),
                                    decay_ms=340, mix=0.22)),
                       (880.0, reverb(phrase(chi, ["A5", "D6"], 150, 520, decay=2.0),
                                      decay_ms=340, mix=0.22))],
                      total_ms=3000.0),
          LOUD_RING, CEIL_RING, fmt="ogg", loop=True,
          note="колокольчики A5→D6 дважды, пауза, луп 3 с", tags=["звонки", "луп"]),

    Sound("call_outgoing", "calls/call_outgoing",
          lambda: seq([(0.0, reverb(mar("D5", 260, decay=3.2), decay_ms=240, mix=0.16)),
                       (1400.0, reverb(mar("D5", 260, decay=3.2),
                                       decay_ms=240, mix=0.16))],
                      total_ms=2800.0),
          LOUD_RING - 6, CEIL_RING, fmt="ogg", loop=True,
          note="маримба D5 каждые 1.4 с, луп", tags=["звонки", "луп"]),

    # --- запуск приложения: аккорд D-минор --------------------------------
    Sound("app_splash", "app/app_splash",
          lambda: reverb(seq([(0.0, mar("D4", 900, decay=2.2)),
                              (70.0, mar("A4", 850, decay=2.2) * 0.75),
                              (150.0, mar("D5", 800, decay=2.4) * 0.6),
                              (250.0, chi("A5", 900, decay=1.8) * 0.4)]),
                         decay_ms=520, mix=0.26, predelay_ms=12, tone=6000),
          LOUD_ALERT - 2, note="аккорд D-минор, разлив", tags=["приложение"]),
]


def by_event() -> dict[str, list[Sound]]:
    out: dict[str, list[Sound]] = {}
    for s in SOUNDS:
        out.setdefault(s.name, []).append(s)
    return out
