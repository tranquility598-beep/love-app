#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Сэмплер: живые записи инструментов как сырьё для своих звуков.

Сырьё — Versilian Community Sample Library (CC0, public domain): одиночные
ноты маримбы, глокеншпиля, калимбы, ручных колокольчиков и клавес. Это не
готовые UI-звуки, а записи инструментов — как краски, а не картина.

Из них здесь собираются свои звуки: нужная нота (транспонирование не больше
±3 полутонов, чтобы тембр остался живым), своя длина, своя огибающая, своя
фраза. Тембр настоящий, потому что источник — реальная запись; звук свой,
потому что мелодия и характер мои.
"""

from __future__ import annotations

import re
import wave
from fractions import Fraction
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import signal

from engine import SR, _n, momentary_dba

RAW = Path(__file__).resolve().parent / "samples" / "raw"

_STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name: str) -> int:
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d+)", name)
    if not m:
        raise ValueError(f"нота не разобрана: {name}")
    letter, acc, octave = m.groups()
    return (int(octave) + 1) * 12 + _STEP[letter] + (1 if acc == "#" else -1 if acc == "b" else 0)


# Инструмент -> {нота: файл}. Заполняется по именам скачанных файлов.
def _scan() -> dict[str, dict[str, Path]]:
    lib: dict[str, dict[str, Path]] = {}

    for p in sorted(RAW.glob("*.wav")):
        n = p.name
        if m := re.match(r"Marimba_hit_Outrigger_([A-G]#?\d)_(\w+)_", n):
            lib.setdefault(f"marimba_{m.group(2)}", {})[m.group(1)] = p
        elif m := re.match(r"glock_(\w+)_([A-G]#?\d)_", n):
            lib.setdefault(f"glock_{m.group(1)}", {})[m.group(2)] = p
        elif m := re.match(r"Mbira6_\w+_MainSpirit_([A-G]#?\d)_", n):
            lib.setdefault("kalimba", {})[m.group(1)] = p
        elif m := re.match(r"sus_([A-G]#?\d)_", n):
            lib.setdefault("chime", {})[m.group(1)] = p
        elif m := re.match(r"(Claves\d)_", n):
            lib.setdefault("claves", {})[m.group(1)] = p

    return lib


LIB = _scan()


# ---------------------------------------------------------------------------
# Загрузка и подготовка
# ---------------------------------------------------------------------------


@lru_cache(maxsize=64)
def _load(path: str) -> np.ndarray:
    """WAV любой битности -> float64 (n, 2) на 48 кГц.

    Тишина в начале срезана, пик приведён к 1.0. Нормализация обязательна:
    в библиотеке записи гуляют от -68 до -10 dBFS, и без опорного уровня
    слои не смешать предсказуемо.
    """
    with wave.open(path, "rb") as w:
        ch, width, rate, frames = (w.getnchannels(), w.getsampwidth(),
                                   w.getframerate(), w.getnframes())
        raw = w.readframes(frames)

    if width == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = (b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16))
        v = np.where(v & 0x800000, v - 0x1000000, v)
        x = v.astype(np.float64) / 8388608.0
    elif width == 4:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648.0
    else:
        raise ValueError(f"{path}: {width * 8} бит не поддержано")

    x = x.reshape(-1, ch)
    x = np.repeat(x, 2, axis=1) if ch == 1 else x[:, :2]

    if rate != SR:
        f = Fraction(SR, rate).limit_denominator(1000)
        x = signal.resample_poly(x, f.numerator, f.denominator, axis=0)

    x = _trim_head(x)
    return x / max(float(np.max(np.abs(x))), 1e-9)


def _trim_head(x: np.ndarray, rel_db: float = -46.0, floor: float = 1.5e-4,
               pre_ms: float = 1.5) -> np.ndarray:
    """Срезать пред-роллы записи, оставив 1.5 мс перед атакой.

    Порог берётся и относительный, и абсолютный: у самых тихих записей
    (-68 dBFS) относительный порог уходит ниже шума комнаты.
    """
    m = np.max(np.abs(x), axis=1)
    thr = max(np.max(m) * 10.0 ** (rel_db / 20.0), floor)
    idx = np.nonzero(m > thr)[0]
    if not len(idx):
        return x
    return x[max(0, idx[0] - _n(pre_ms)):]


def _shift(x: np.ndarray, semitones: float) -> np.ndarray:
    """Транспонирование пересэмплингом: как удар по другой планке."""
    if abs(semitones) < 0.01:
        return x
    f = Fraction(2.0 ** (-semitones / 12.0)).limit_denominator(400)
    return signal.resample_poly(x, f.numerator, f.denominator, axis=0)


# ---------------------------------------------------------------------------
# Нота нужной высоты и длины
# ---------------------------------------------------------------------------


def note(
    inst: str,
    name: str,
    dur_ms: float,
    decay: float = 3.0,
    hold_ms: float = 8.0,
    gain: float = 1.0,
    lowpass: float = 0.0,
    max_shift: float = 3.5,
) -> np.ndarray:
    """Живая нота: ближайший записанный сэмпл, транспонированный к `name`.

    Длина укорачивается своей экспонентой — настоящая маримба звенит 2 с,
    интерфейсу нужно 200 мс. Затухание накладывается на естественный спад,
    поэтому тембр остаётся, а длина становится наша.

    `lowpass` — мягкий спад сверху для инструментов с ярким верхом (калимба
    отдаёт 4% энергии в 8-16 кГц и в маленьких колонках сипит).
    """
    src = LIB[inst]
    want = midi(name)
    best = min(src, key=lambda k: abs(midi(k) - want))
    delta = want - midi(best)
    if abs(delta) > max_shift:
        raise ValueError(f"{inst}: до {name} от {best} {delta} полутонов — много")

    x = _shift(_load(str(src[best])), delta)

    if lowpass:
        x = signal.sosfilt(signal.butter(2, lowpass, "low", fs=SR, output="sos"),
                           x, axis=0)

    n = _n(dur_ms)
    x = x[:n] if len(x) >= n else np.pad(x, ((0, n - len(x)), (0, 0)))

    h = min(_n(hold_ms), n)
    e = np.ones(n)
    tail = np.exp(-decay * np.linspace(0.0, 1.0, n - h))
    e[h:] = (tail - tail[-1]) / (1.0 - tail[-1])
    return x * e[:, None] * gain


def hit(which: str = "Claves1", dur_ms: float = 70.0, gain: float = 1.0,
        shift: float = 0.0, decay: float = 6.0, hold_ms: float = 10.0) -> np.ndarray:
    """Сухой удар (клавес) — сырьё для щелчков и попов.

    Удержание обязательно: пик клавес приходится на 7 мс, и без него
    огибающая срезает сам транзиент — то, ради чего удар и берётся.
    """
    x = _shift(_load(str(LIB["claves"][which])), shift)
    n = _n(dur_ms)
    x = x[:n] if len(x) >= n else np.pad(x, ((0, n - len(x)), (0, 0)))

    h = min(_n(hold_ms), n - 1)
    e = np.ones(n)
    tail = np.exp(-decay * np.linspace(0.0, 1.0, n - h))
    e[h:] = (tail - tail[-1]) / (1.0 - tail[-1])
    return x * e[:, None] * gain


def layer(*parts: np.ndarray) -> np.ndarray:
    """Наложить слои одинаковой роли (например удар + тон)."""
    n = max(len(p) for p in parts)
    out = np.zeros((n, 2))
    for p in parts:
        out[: len(p)] += p
    return out


def reach(inst: str, max_shift: float = 3.5) -> list[str]:
    """Какие ноты пентатоники D-минор инструмент берёт без насилия над тембром."""
    grid = [f"{s}{o}" for o in (3, 4, 5, 6) for s in ("D", "F", "G", "A", "C")]
    ok = []
    for nm in grid:
        want = midi(nm)
        if min(abs(midi(k) - want) for k in LIB[inst]) <= max_shift:
            ok.append(nm)
    return sorted(ok, key=midi)


def info() -> str:
    def order(keys):
        try:
            return sorted(keys, key=midi)
        except ValueError:      # клавесы названы не нотами
            return sorted(keys)

    lines = []
    for k, v in sorted(LIB.items()):
        lines.append(f"  {k:<14} есть: {' '.join(order(v))}")
        if k != "claves":
            lines.append(f"  {'':<14} берёт: {' '.join(reach(k))}")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print("Библиотека сырья:")
    print(info())
    for inst, nm in (("marimba_soft", "D5"), ("glock_soft", "A5"),
                     ("kalimba", "D4"), ("chime", "D5")):
        x = note(inst, nm, 300)
        print(f"  {inst} {nm}: {len(x) / SR * 1000:.0f} мс, "
              f"{momentary_dba(x):.1f} dBA, пик {np.max(np.abs(x)):.3f}")
    h = hit()
    print(f"  claves: {len(h) / SR * 1000:.0f} мс, пик {np.max(np.abs(h)):.3f}")
