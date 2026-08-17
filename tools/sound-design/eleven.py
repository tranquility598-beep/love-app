#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Звуковой набор через ElevenLabs text-to-sound-effects.

Два шага, чтобы не жечь кредиты на каждый пересчёт:

    PYTHONIOENCODING=utf-8 python eleven.py --fetch --yes    # запрос к API -> кэш
    PYTHONIOENCODING=utf-8 python eleven.py                  # рендер из кэша + страница

Ответы складываются в samples/eleven/ и больше не запрашиваются: повторный
--fetch трогает только то, чего в кэше нет (или всё, если --force).

Ключ ищется в ELEVENLABS_API_KEY / ELEVEN_API_KEY / XI_API_KEY, затем в файле
tools/sound-design/.eleven_key (одна строка).

Пост-обработка та же, что у своего набора: срез тишины, спад края в ноль,
нормализация по A-взвешенной громкости к тем же LOUD_*/CEIL_*. Без этого
сравнивать наборы нельзя — громкое всегда кажется лучше.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import wave
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy import signal

from engine import FFMPEG, SR
from sounds import (CEIL_RING, CEIL_SHORT, LOUD_ALERT, LOUD_CHAT, LOUD_RING,
                    LOUD_UI, Sound)

HERE = Path(__file__).resolve().parent
CACHE = HERE / "samples" / "eleven"

API = "https://api.elevenlabs.io/v1/sound-generation"
MODEL = "eleven_text_to_sound_v2"

# 192 kbps требует Creator, любой PCM — Pro. 128 доступен на всех тарифах,
# а битрейт тут не узкое место: дальше всё равно свой рендер в WAV 48 кГц.
OUT_FMT = "mp3_44100_128"

# Общий хвост промпта. Модель по умолчанию любит добавить комнату и подложку —
# это в интерфейсе слышно как грязь, поэтому тишина запрашивается явно.
# «professionally recorded ... foley» — формулировка из их же гайда по промптам:
# она сдвигает выдачу от бытовой записи к чистому студийному сэмплу.
CLEAN = ("high-quality professionally recorded foley sample, "
         "dry close-miked studio one-shot, isolated single event, "
         "no reverb, no room ambience, no background noise, no music, "
         "digital silence before and after")


@dataclass
class Prompt:
    name: str            # событие
    rel: str             # путь внутри assets/sounds
    text: str            # что просим у модели
    dur: float           # duration_seconds, 0.5..30
    loud: float          # целевая громкость, dBA
    ceil: float = CEIL_SHORT
    infl: float = 0.6    # prompt_influence: выше — точнее по промпту, но однообразнее
    loop: bool = False
    fmt: str = "wav"
    note: str = ""
    takes: int = 1       # сколько разных дублей просить (модель стохастична)
    tags: list[str] = field(default_factory=list)

    def full(self) -> str:
        return f"{self.text}, {CLEAN}"


# ---------------------------------------------------------------------------
# Промпты: те же 14 событий, те же пути
# ---------------------------------------------------------------------------

PROMPTS: list[Prompt] = [
    Prompt("message_send", "chat/message_send",
           "one single soft wooden marimba note, gentle felt mallet tap, "
           "short and muted, quiet messenger send blip",
           0.5, LOUD_CHAT - 3, takes=3, note="маримба, одна нота",
           tags=["чат"]),

    Prompt("message_receive", "chat/message_receive",
           "two quick soft marimba notes rising in pitch, gentle felt mallet, "
           "warm wooden bars, short decay, messenger incoming message",
           0.8, LOUD_CHAT, takes=3, note="две ноты вверх", tags=["чат"]),

    Prompt("notification", "notifications/notification",
           "gentle glockenspiel chime, two soft metallic bell notes, warm and "
           "clear, short bright decay, calm messenger notification",
           1.2, LOUD_ALERT, takes=3, note="глокеншпиль, две ноты",
           tags=["уведомления"]),

    Prompt("system", "notifications/system",
           "one low warm wooden mallet note, muted and neutral, very short, "
           "understated system message cue",
           0.8, LOUD_ALERT - 3, note="низкая нейтральная нота",
           tags=["уведомления"]),

    Prompt("user_join", "presence/user_join",
           "soft kalimba thumb piano pluck, two notes rising in pitch, warm "
           "wooden tine, short and intimate, someone joins a voice channel",
           0.8, LOUD_UI + 3, takes=2, note="калимба вверх",
           tags=["присутствие"]),

    Prompt("user_leave", "presence/user_leave",
           "soft kalimba thumb piano pluck, two notes falling in pitch, warm "
           "wooden tine, short and muted, someone leaves a voice channel",
           0.8, LOUD_UI + 3, note="калимба вниз", tags=["присутствие"]),

    Prompt("voice_mute", "voice/voice_mute",
           "single soft muffled wooden thud, dull low fingertip tap on hollow "
           "wood, no pitch, no ring, microphone switched off",
           0.5, LOUD_UI + 2, takes=2, note="глухой удар", tags=["голос"]),

    Prompt("voice_unmute", "voice/voice_unmute",
           "single soft wooden tap, light bright knock on hollow wood with a "
           "warm body, very short, microphone switched on",
           0.5, LOUD_UI + 2, note="светлый удар", tags=["голос"]),

    Prompt("voice_deafen", "voice/voice_deafen",
           "two quick soft muffled wooden thuds descending in pitch, dull and "
           "damped, no ring, headphones switched off",
           0.6, LOUD_UI + 2, note="два удара вниз", tags=["голос"]),

    Prompt("voice_undeafen", "voice/voice_undeafen",
           "two quick light wooden taps ascending in pitch, dry and short, "
           "headphones switched on",
           0.6, LOUD_UI + 2, note="два удара вверх", tags=["голос"]),

    Prompt("ui_toggle", "ui/ui_toggle",
           "one tiny dry wooden claves click, extremely short and quiet, "
           "pure transient with no tone, interface switch",
           0.5, LOUD_UI - 3, infl=0.7, note="сухой щелчок",
           tags=["интерфейс"]),

    # --- лупы: длину задаёт duration_seconds, стык шьёт сама модель ---------
    Prompt("call_incoming", "calls/call_incoming",
           "calm phone ringtone: two soft handbell notes rising, then a long "
           "pause of silence, warm and unhurried, repeating pattern",
           3.0, LOUD_RING, CEIL_RING, infl=0.45, loop=True, fmt="ogg",
           takes=2, note="колокольчики, луп 3 с", tags=["звонки", "луп"]),

    Prompt("call_outgoing", "calls/call_outgoing",
           "outgoing call dial tone: one soft warm marimba note, then a long "
           "pause of silence, quiet and patient, repeating pattern",
           2.8, LOUD_RING - 6, CEIL_RING, infl=0.45, loop=True, fmt="ogg",
           note="маримба, луп 2.8 с", tags=["звонки", "луп"]),

    Prompt("app_splash", "app/app_splash",
           "warm marimba arpeggio of three soft rising notes resolving into a "
           "gentle bell shimmer, elegant and brief, app startup signature",
           1.5, LOUD_ALERT - 2, infl=0.45, takes=2,
           note="аккорд на запуске", tags=["приложение"]),
]

VAR = "abcdefgh"


def key_of(p: Prompt, take: int) -> str:
    return f"{p.name}__{VAR[take]}" if p.takes > 1 else p.name


# ---------------------------------------------------------------------------
# Ключ и запрос
# ---------------------------------------------------------------------------


def api_key() -> str:
    for var in ("ELEVENLABS_API_KEY", "ELEVEN_API_KEY", "XI_API_KEY"):
        if v := os.environ.get(var, "").strip():
            return v
    f = HERE / ".eleven_key"
    if f.exists() and (v := f.read_text(encoding="utf-8").strip()):
        return v
    raise SystemExit(
        "Нет ключа ElevenLabs.\n"
        "  положи его в tools/sound-design/.eleven_key (одной строкой)\n"
        "  или экспортируй ELEVENLABS_API_KEY"
    )


def generate(p: Prompt, dst: Path, key: str) -> None:
    body = json.dumps({
        "text": p.full(),
        "model_id": MODEL,
        "duration_seconds": p.dur,
        "prompt_influence": p.infl,
        "loop": p.loop,
    }).encode()

    req = urllib.request.Request(
        f"{API}?output_format={OUT_FMT}",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json",
                 "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:600]
        raise SystemExit(f"ElevenLabs {e.code}: {detail}") from None

    if len(data) < 512:
        raise SystemExit(f"ElevenLabs вернул {len(data)} байт — это не звук: "
                         f"{data[:300]!r}")

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(data)


def fetch(todo: list[Prompt], force: bool, dry: bool) -> None:
    want: list[tuple[Prompt, int, Path]] = []
    for p in todo:
        for t in range(p.takes):
            dst = CACHE / f"{key_of(p, t)}.mp3"
            if force or not dst.exists():
                want.append((p, t, dst))

    if not want:
        print("кэш полон, запрашивать нечего")
        return

    secs = sum(p.dur for p, _, _ in want)
    print(f"запросов: {len(want)}, суммарно {secs:.1f} с звука")
    for p, t, dst in want:
        print(f"  {key_of(p, t):<24} {p.dur:>4.1f} с  infl {p.infl}"
              f"{'  loop' if p.loop else ''}")
    if dry:
        print("\nэто тратит кредиты. повтори с --yes, если согласен")
        return

    key = api_key()
    for p, t, dst in want:
        print(f"  -> {key_of(p, t)} ...", flush=True)
        generate(p, dst, key)
        print(f"     {dst.stat().st_size / 1024:.0f} KB")


# ---------------------------------------------------------------------------
# Декод и подготовка
# ---------------------------------------------------------------------------


def decode(src: Path) -> np.ndarray:
    """MP3 -> float64 (n, 2) на 48 кГц.

    Через ffmpeg, а не своим декодером: у MP3 на краях паддинг кодировщика,
    и ffmpeg снимает его по gapless-заголовку. Именно этот паддинг был
    причиной хака `currentTime = 0.3` в старом sound-manager.
    """
    tmp = src.with_suffix(".dec.wav")
    subprocess.run(
        [str(FFMPEG), "-y", "-loglevel", "error", "-i", str(src),
         "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", str(tmp)],
        check=True,
    )
    try:
        with wave.open(str(tmp), "rb") as w:
            raw = w.readframes(w.getnframes())
    finally:
        tmp.unlink(missing_ok=True)

    x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    return x.reshape(-1, 2)


def trim_head(x: np.ndarray, rel_db: float = -50.0, floor: float = 1.2e-4,
              pre_ms: float = 1.5) -> np.ndarray:
    """Срезать тишину и подшумок перед атакой: модель почти всегда их оставляет."""
    m = np.max(np.abs(x), axis=1)
    thr = max(float(np.max(m)) * 10.0 ** (rel_db / 20.0), floor)
    idx = np.nonzero(m > thr)[0]
    if not len(idx):
        return x
    return x[max(0, int(idx[0]) - int(SR * pre_ms / 1000.0)):]


def load(p: Prompt, take: int, hp: float = 45.0) -> np.ndarray:
    """Кэшированный дубль как массив, готовый к finish().

    У лупа голову не трогаем: стык шила модель, и срез начала его порвёт.
    Фильтр 45 Гц — модель иногда кладёт инфразвуковой подвал, в телефоне
    он не слышен, но съедает запас по пику.
    """
    src = CACHE / f"{key_of(p, take)}.mp3"
    if not src.exists():
        raise SystemExit(f"нет в кэше: {src.name} — сначала --fetch")

    x = decode(src)
    x = signal.sosfilt(signal.butter(2, hp, "high", fs=SR, output="sos"),
                       x, axis=0)
    return x if p.loop else trim_head(x)


def sounds_from_cache(todo: list[Prompt]) -> list[Sound]:
    out: list[Sound] = []
    for p in todo:
        for t in range(p.takes):
            if not (CACHE / f"{key_of(p, t)}.mp3").exists():
                continue
            out.append(Sound(
                name=p.name, rel=p.rel,
                build=lambda p=p, t=t: load(p, t),
                loud=p.loud, ceil=p.ceil, fmt=p.fmt, loop=p.loop,
                note=p.note, variant=(VAR[t] if p.takes > 1 else ""),
                tags=p.tags,
            ))
    return out


INTRO = ("Сгенерировано моделью ElevenLabs text-to-sound-effects по текстовым "
         "описаниям. Ноты, длины и громкости заданы промптом и приведены к тем "
         "же уровням, что и свой набор, — можно сравнивать напрямую. Где "
         "несколько дублей (a/b/c) — это разные ответы модели на один и тот же "
         "запрос.")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true", help="запросить у API")
    ap.add_argument("--yes", action="store_true", help="да, тратить кредиты")
    ap.add_argument("--force", action="store_true", help="перезапросить и то, что в кэше")
    ap.add_argument("--only", default="", help="события через запятую")
    a = ap.parse_args()

    only = {s.strip() for s in a.only.split(",") if s.strip()}
    todo = [p for p in PROMPTS if not only or p.name in only]

    if a.fetch:
        fetch(todo, a.force, dry=not a.yes)
        if not a.yes:
            return

    import render as R

    have = sounds_from_cache(todo)
    if not have:
        print("кэш пуст — запусти с --fetch --yes")
        return

    # Свой подкаталог: имена файлов совпадают со своим набором.
    R.OUT = R.OUT / "eleven"
    R.OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for s in have:
        print(f"  {s.key} ...", flush=True)
        rows.append(R.render(s))

    R.report(rows)
    page = R.write_preview(rows, intro=INTRO, raw=False,
                           out_name="preview-eleven.html",
                           title="Love — звуки (ElevenLabs)")
    print(f"\nстраница: {page}")


if __name__ == "__main__":
    main()
