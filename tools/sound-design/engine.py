#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Движок синтеза для звукового набора Love.

Тембры взяты по образцу Discord/Telegram, а не «чистый синус»:
  * fm()      — FM-синтез. Индекс модуляции гаснет быстрее амплитуды: яркая
                атака, чистый хвост. Это и есть тембр колокола/маримбы.
                Неgармоничный ratio (1.41, 7.0) = стекло/колокол,
                целый (3.0) = дерево/маримба.
  * pluck()   — Karplus-Strong, калимба. Discord-овские join/leave по характеру
                ближе всего к щипковому мягкому язычку.
  * pop()     — перкуссионный «поп» с быстрым падением высоты + шумовой
                транзиент. Именно так сделаны mute/unmute у Discord: это не
                нота, это щелчок.
  * reverb()  — свёртка с синтетическим затухающим шумом, независимым для L и R.
                Хвост 150-400 мс — то, из-за чего звук слышится «сделанным»,
                а не «сгенерированным». Без него любой UI-звук = системный бип.
"""

from __future__ import annotations

import math
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48_000

FFMPEG = Path(
    r"C:\Users\Aleksandr\AppData\Local\Programs\Velorn\resources\bin\ffmpeg.exe"
)

# Тональная сетка: D-минор пентатоника.
N = {
    "D3": 146.832, "A3": 220.000,
    "D4": 293.665, "F4": 349.228, "G4": 391.995, "A4": 440.000,
    "C5": 523.251, "D5": 587.330, "F5": 698.456, "G5": 783.991, "A5": 880.000,
    "C6": 1046.502, "D6": 1174.659, "F6": 1396.913, "A6": 1760.000,
}


# ---------------------------------------------------------------------------
# Огибающие
# ---------------------------------------------------------------------------


def env(n: int, attack_ms: float, curve: float = 4.5) -> np.ndarray:
    """Приподнятый косинус на атаке + экспоненциальный спад строго в ноль."""
    a = min(max(1, int(SR * attack_ms / 1000.0)), n)
    e = np.empty(n, dtype=np.float64)
    e[:a] = 0.5 - 0.5 * np.cos(np.pi * np.linspace(0.0, 1.0, a, endpoint=False))
    d = n - a
    if d > 0:
        tail = np.exp(-curve * np.linspace(0.0, 1.0, d))
        e[a:] = (tail - tail[-1]) / (1.0 - tail[-1])
    return e


def _n(dur_ms: float) -> int:
    return max(2, int(SR * dur_ms / 1000.0))


# ---------------------------------------------------------------------------
# Тембры
# ---------------------------------------------------------------------------


def fm(
    freq: float,
    dur_ms: float,
    ratio: float = 3.0,
    index: float = 3.0,
    index_decay: float = 3.2,
    attack_ms: float = 2.5,
    curve: float = 4.5,
    bend: float = 0.0,
    lowpass: float | None = 13_000.0,
) -> np.ndarray:
    """FM-тон. ratio=3 → маримба, 1.41 → колокол, 7 → стекло.

    index_decay > curve означает, что обертоны уходят раньше основного тона —
    ключевой признак живого удара по чему-то физическому.
    """
    n = _n(dur_ms)
    t = np.arange(n) / SR
    T = dur_ms / 1000.0

    f = freq * (1.0 + bend * (t / T))
    ph = 2.0 * np.pi * np.cumsum(f) / SR
    mod = index * np.exp(-index_decay * t / T) * np.sin(ratio * ph)

    x = np.sin(ph + mod) * env(n, attack_ms, curve)
    if lowpass:
        x = signal.sosfilt(
            signal.butter(2, min(lowpass, SR / 2 - 200), "low", fs=SR, output="sos"), x
        )
    return x


def pluck(
    freq: float,
    dur_ms: float,
    damping: float = 0.9955,
    brightness: float = 0.35,
    attack_ms: float = 1.5,
    lowpass: float = 10_000.0,
    seed: int = 11,
) -> np.ndarray:
    """Karplus-Strong: щипок / калимба. Мягче и «деревяннее» любого FM."""
    n = _n(dur_ms)
    L = max(2, int(round(SR / freq)))

    rng = np.random.default_rng(seed)
    buf = signal.sosfilt(
        signal.butter(2, 300 + brightness * 7_000, "low", fs=SR, output="sos"),
        rng.standard_normal(L),
    )
    buf = buf / max(np.max(np.abs(buf)), 1e-9)

    out = np.empty(n, dtype=np.float64)
    prev = 0.0
    i = 0
    for k in range(n):
        cur = buf[i]
        out[k] = cur
        buf[i] = 0.5 * (cur + prev) * damping
        prev = cur
        i = (i + 1) % L

    # Кольцевой буфер даёт разрыв на стыке — снимаем его фильтром, иначе шипит.
    out = signal.sosfilt(
        signal.butter(3, min(lowpass, SR / 2 - 200), "low", fs=SR, output="sos"), out
    )
    # Своя огибающая у струны уже есть; добавляем только мягкую атаку и уход в 0.
    out *= env(n, attack_ms, curve=1.4)
    return out


def pop(
    f_start: float,
    f_end: float,
    dur_ms: float = 85.0,
    noise_db: float = -10.0,
    band: tuple[float, float] = (180.0, 2_400.0),
    curve: float = 8.0,
    drop: float = 6.0,
    seed: int = 5,
) -> np.ndarray:
    """Перкуссионный «поп»: высота экспоненциально падает к f_end + шум.

    Так сделаны mute/unmute/deafen у Discord — это щелчок, а не нота.
    """
    n = _n(dur_ms)
    t = np.arange(n) / SR
    T = dur_ms / 1000.0

    f = f_end + (f_start - f_end) * np.exp(-drop * t / T)
    x = np.sin(2.0 * np.pi * np.cumsum(f) / SR) * env(n, 1.6, curve)

    rng = np.random.default_rng(seed)
    nz = signal.sosfilt(
        signal.butter(2, band, "band", fs=SR, output="sos"), rng.standard_normal(n)
    )
    nz *= env(n, 0.6, curve=16.0)
    return x + nz * 10.0 ** (noise_db / 20.0)


def tick(
    dur_ms: float = 14.0,
    band: tuple[float, float] = (1_800.0, 6_500.0),
    seed: int = 3,
) -> np.ndarray:
    """Микро-щелчок для переключателей: только полосовой шум, без тона."""
    n = _n(dur_ms)
    rng = np.random.default_rng(seed)
    nz = signal.sosfilt(
        signal.butter(4, band, "band", fs=SR, output="sos"), rng.standard_normal(n)
    )
    return nz * env(n, 0.5, curve=18.0)


# ---------------------------------------------------------------------------
# Композиция и пространство
# ---------------------------------------------------------------------------


def seq(parts: list[tuple[float, np.ndarray]], total_ms: float | None = None) -> np.ndarray:
    """Сложить фрагменты по временной сетке (смещения в мс). Моно или стерео."""
    end = max(int(SR * off / 1000.0) + len(b) for off, b in parts)
    n = max(end, _n(total_ms)) if total_ms else end
    ch = max(b.shape[1] if b.ndim == 2 else 1 for _, b in parts)
    out = np.zeros((n, ch) if ch > 1 else n, dtype=np.float64)
    for off, b in parts:
        i = int(SR * off / 1000.0)
        if ch > 1 and b.ndim == 1:
            b = np.stack([b, b], axis=1)
        out[i : i + len(b)] += b
    return out


def reverb(
    x: np.ndarray,
    decay_ms: float = 240.0,
    mix: float = 0.22,
    predelay_ms: float = 7.0,
    tone: float = 5_200.0,
    width: float = 0.75,
    seed: int = 7,
) -> np.ndarray:
    """Стерео-реверб свёрткой. Вход моно или стерео, выход всегда (n, 2).

    Импульсные отклики для L и R генерируются из разных шумов — это даёт
    естественную ширину без искусственного пинг-понга.
    """
    n_ir = _n(decay_ms)
    t = np.arange(n_ir) / SR
    dec = np.exp(-6.9 * t / (decay_ms / 1000.0))

    rng = np.random.default_rng(seed)
    sos_lp = signal.butter(2, tone, "low", fs=SR, output="sos")
    sos_hp = signal.butter(2, 280, "high", fs=SR, output="sos")

    irs = []
    for ch in range(2):
        ir = rng.standard_normal(n_ir) * dec
        ir = signal.sosfilt(sos_hp, signal.sosfilt(sos_lp, ir))
        ir /= max(np.sqrt(np.sum(ir**2)), 1e-9)
        irs.append(ir)

    # Живые сэмплы приходят стерео, синтез — моно. Канал берём свой, если есть.
    src = np.asarray(x, dtype=np.float64)
    src = src if src.ndim == 2 else np.stack([src, src], axis=1)

    pre = int(SR * predelay_ms / 1000.0)
    dry = np.pad(src, ((0, n_ir + pre), (0, 0)))
    n_out = len(dry)

    def _wet(ch: int, ir: np.ndarray) -> np.ndarray:
        w = np.pad(signal.fftconvolve(src[:, ch], ir), (pre, 0))
        return np.pad(w, (0, max(0, n_out - len(w))))[:n_out]

    wet = np.stack([_wet(ch, ir) for ch, ir in enumerate(irs)], axis=1)
    # width=0 — моно-хвост, width=1 — полностью раздельные каналы.
    mid = wet.mean(axis=1, keepdims=True)
    wet = mid + (wet - mid) * width

    return dry + wet * mix


def stereo(x: np.ndarray) -> np.ndarray:
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def trim_tail(
    x: np.ndarray,
    floor_db: float = -64.0,
    fade_ms: float = 12.0,
    keep_length: bool = False,
) -> np.ndarray:
    """Обрезать тишину в хвосте после реверба и увести край строго в ноль."""
    if not keep_length:
        m = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
        thr = np.max(m) * 10.0 ** (floor_db / 20.0)
        idx = np.nonzero(m > thr)[0]
        if len(idx):
            x = x[: min(len(x), idx[-1] + _n(fade_ms))]
    f = min(_n(fade_ms), len(x))
    ramp = np.linspace(1.0, 0.0, f)
    if x.ndim == 2:
        x[-f:] *= ramp[:, None]
    else:
        x[-f:] *= ramp
    return x


# ---------------------------------------------------------------------------
# Измерения
# ---------------------------------------------------------------------------


def _a_weight(mono: np.ndarray) -> np.ndarray:
    n = len(mono)
    f2 = np.maximum(np.fft.rfftfreq(n, 1.0 / SR), 1e-6) ** 2
    a = (12194.0**2 * f2**2) / (
        (f2 + 20.6**2)
        * np.sqrt((f2 + 107.7**2) * (f2 + 737.9**2))
        * (f2 + 12194.0**2)
    )
    a_db = 20.0 * np.log10(np.maximum(a, 1e-12)) + 2.0
    return np.fft.irfft(np.fft.rfft(mono) * 10.0 ** (a_db / 20.0), n)


def momentary_dba(x: np.ndarray, win_ms: float = 50.0) -> float:
    """Максимум A-взвешенного RMS по окну 50 мс — прокси воспринимаемой громкости."""
    mono = x.mean(axis=1) if x.ndim == 2 else x
    xa = _a_weight(mono)
    w = max(1, _n(win_ms))
    if len(xa) <= w:
        rms = float(np.sqrt(np.mean(xa**2)))
    else:
        rms = float(np.sqrt(np.convolve(xa**2, np.ones(w) / w, "valid").max()))
    return 20.0 * math.log10(max(rms, 1e-12))


def dbfs(v: float) -> float:
    return 20.0 * math.log10(max(abs(v), 1e-12))


# ---------------------------------------------------------------------------
# Финализация и запись
# ---------------------------------------------------------------------------


def finish(
    x: np.ndarray,
    target_dba: float,
    ceiling_db: float,
    trim_db: float = 0.0,
    keep_length: bool = False,
) -> np.ndarray:
    """Стерео, края в ноль, нормализация по громкости, потолок по пику.

    keep_length=True для лупов: хвостовую тишину обрезать нельзя, она задаёт
    ритм повторения.
    """
    x = stereo(np.asarray(x, dtype=np.float64))

    # DC снимаем до фейдов, иначе смещение возвращает край из нуля.
    x -= x.mean(axis=0, keepdims=True)
    x = trim_tail(x, keep_length=keep_length)

    fi = _n(0.8)
    x[:fi] *= np.linspace(0.0, 1.0, fi)[:, None]

    x *= 10.0 ** ((target_dba + trim_db - momentary_dba(x)) / 20.0)

    peak = float(np.max(np.abs(x)))
    ceil = 10.0 ** (ceiling_db / 20.0)
    if peak > ceil:
        x *= ceil / peak
    return x


def write_wav(path: Path, x: np.ndarray) -> None:
    """WAV 48 кГц / 16 бит стерео с TPDF-дизером."""
    rng = np.random.default_rng(1234)
    d = (rng.random(x.shape) - rng.random(x.shape)) / 32768.0
    pcm = (np.clip(x + d, -1.0, 1.0) * 32767.0).astype("<i2")

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def encode_ogg(wav: Path, ogg: Path, quality: str = "4") -> None:
    ogg.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [str(FFMPEG), "-y", "-loglevel", "error", "-i", str(wav),
         "-c:a", "libvorbis", "-q:a", quality, str(ogg)],
        check=True,
    )
