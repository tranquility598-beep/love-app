#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Рендер набора: считает, проверяет, пишет файлы и страницу прослушивания.

    PYTHONIOENCODING=utf-8 python render.py
    PYTHONIOENCODING=utf-8 python render.py --only message_send,notification
"""

from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path

import numpy as np

from engine import SR, dbfs, encode_ogg, finish, momentary_dba, write_wav
from sounds import SOUNDS, Sound

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"


def hf_energy_db(x: np.ndarray, f_lo: float = 20_000.0) -> float:
    """Доля энергии выше 20 кГц — признак алиасинга.

    Порог именно 20 кГц: живые записи законно несут воздух в 16-20 кГц
    (глокеншпиль, атака калимбы), и мерить оттуда — ловить музыку вместо
    брака. Источники сняты на 44.1 кГц, поэтому выше 22 кГц у них не может
    быть ничего настоящего, и всплеск там означает грязный пересэмплинг.
    """
    mono = x.mean(axis=1)
    sp = np.abs(np.fft.rfft(mono)) ** 2
    fr = np.fft.rfftfreq(len(mono), 1.0 / SR)
    tot = sp.sum()
    hi = sp[fr >= f_lo].sum()
    return 10.0 * np.log10(max(hi / max(tot, 1e-30), 1e-12))


def render(s: Sound) -> dict:
    x = finish(s.build(), s.loud, s.ceil, keep_length=s.loop)

    wav = OUT / f"{s.key}.wav"
    write_wav(wav, x)
    if s.fmt == "ogg":
        final = OUT / f"{s.key}.ogg"
        encode_ogg(wav, final)
        wav.unlink()
    else:
        final = wav

    return {
        "sound": s,
        "path": final,
        "ms": round(len(x) / SR * 1000.0),
        "peak": dbfs(float(np.max(np.abs(x)))),
        "dba": momentary_dba(x),
        "edge": max(dbfs(float(np.max(np.abs(x[0])))), dbfs(float(np.max(np.abs(x[-1]))))),
        "dc": dbfs(float(np.max(np.abs(x.mean(axis=0))))),
        "hf": hf_energy_db(x),
        "kb": final.stat().st_size / 1024.0,
    }


def report(rows: list[dict]) -> None:
    print(f"\n{'звук':<24} {'мс':>5} {'пик':>7} {'dBA':>7} {'край':>7} "
          f"{'DC':>7} {'>20k':>7} {'KB':>7}")
    print("-" * 76)
    for r in rows:
        print(f"{r['sound'].key:<24} {r['ms']:>5} {r['peak']:>7.1f} {r['dba']:>7.1f} "
              f"{r['edge']:>7.0f} {r['dc']:>7.0f} {r['hf']:>7.1f} {r['kb']:>7.1f}")

    bad = [r for r in rows if r["peak"] > -0.5 or r["edge"] > -70 or r["hf"] > -38]
    print(f"\nвсего {len(rows)}, {sum(r['kb'] for r in rows):.0f} KB, "
          f"проблемных {len(bad)}")
    for r in bad:
        print(f"  ! {r['sound'].key}: пик {r['peak']:.1f}, край {r['edge']:.0f}, "
              f"ВЧ {r['hf']:.1f}")


CSS = """
:root{--bg:#0b0b0f;--card:#15151c;--line:#26262f;--tx:#e8e8ef;--dim:#8b8b9a;--ac:#e0457b}
*{box-sizing:border-box}
body{margin:0;padding:32px;background:var(--bg);color:var(--tx);
 font:14px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif}
h1{font-size:20px;margin:0 0 4px}
.sub{color:var(--dim);margin:0 0 24px}
.grp{background:var(--card);border:1px solid var(--line);border-radius:12px;
 padding:16px;margin-bottom:12px}
.grp h2{font-size:15px;margin:0 0 2px}
.grp .p{color:var(--dim);font-size:12px;margin:0 0 12px;font-family:ui-monospace,monospace}
.row{display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:none}
button{background:var(--ac);color:#fff;border:0;border-radius:8px;
 width:38px;height:38px;font-size:15px;cursor:pointer;flex:none}
button:active{transform:scale(.93)}
.v{font-weight:600;width:24px;flex:none;text-transform:uppercase;color:var(--ac)}
.n{flex:1}
.m{color:var(--dim);font-size:12px;font-family:ui-monospace,monospace;flex:none}
.hint{color:var(--dim);font-size:12px;margin-top:20px}
kbd{background:#22222b;border:1px solid var(--line);border-radius:4px;padding:1px 5px}
"""

JS = """
let cur=null;
function play(id){
  if(cur){cur.pause();cur.currentTime=0}
  const a=document.getElementById(id);
  a.currentTime=0;a.volume=0.9;a.play();cur=a;
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&cur){cur.pause();cur.currentTime=0}
});
"""


DESC = {
    "message_send": "отправил сообщение — тише всего, на грани заметности",
    "message_receive": "пришло сообщение в открытом чате",
    "notification": "уведомление, когда чат закрыт",
    "system": "системное сообщение",
    "user_join": "кто-то зашёл в голосовой",
    "user_leave": "кто-то вышел из голосового",
    "voice_mute": "выключил микрофон",
    "voice_unmute": "включил микрофон",
    "voice_deafen": "выключил звук совсем",
    "voice_undeafen": "включил звук",
    "ui_toggle": "переключатель в интерфейсе",
    "call_incoming": "входящий звонок, зациклено",
    "call_outgoing": "исходящий гудок, зациклено",
    "app_splash": "запуск приложения",
}

# Сырьё: показать, из чего собрано. Одна голая нота на инструмент.
RAW_DEMO = [
    ("маримба, мягкая палочка", "marimba_soft", "G4"),
    ("глокеншпиль", "glock_soft", "C5"),
    ("калимба", "kalimba", "A4"),
    ("ручные колокольчики", "chime", "C5"),
]


def _raw_clips() -> list[tuple[str, str]]:
    """Голые записи, приведённые к одной громкости — для сравнения с готовым."""
    from sampler import note as _note

    out = []
    for label, inst, nm in RAW_DEMO:
        x = _note(inst, nm, 1200, decay=1.2)
        x = finish(x, -26.0, -9.0)
        p = OUT / f"_raw_{inst}.wav"
        write_wav(p, x)
        out.append((label, base64.b64encode(p.read_bytes()).decode()))
        p.unlink()
    return out


INTRO_VCSL = (
    "Собрано из записей живых инструментов: маримба, глокеншпиль, калимба, "
    "ручные колокольчики, клавесы (VCSL, public domain). Готовых UI-звуков тут "
    "нет — сырьё это одиночные ноты, а фразы, лад, длины, огибающие и "
    "пространство мои. Один лад на весь интерфейс (пентатоника D-минор), "
    "поэтому звуки не спорят друг с другом, даже когда приходят внахлёст."
)


def write_preview(rows: list[dict], intro: str = INTRO_VCSL, raw: bool = True,
                  out_name: str = "preview.html",
                  title: str = "Love — звуковой набор") -> Path:
    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(r["sound"].name, []).append(r)

    parts = [
        "<!DOCTYPE html><html lang='ru'><head><meta charset='utf-8'>",
        f"<title>{title}</title><style>", CSS, "</style></head><body>",
        f"<h1>{title}</h1>",
        f"<p class='sub'>{intro}</p>",
    ]
    if raw:
        parts.append("<div class='grp'><h2>сырьё</h2><p class='p'>из чего "
                     "собрано — голые ноты, как они лежат в библиотеке</p>")
        for label, b64 in _raw_clips():
            parts.append(
                f"<div class='row'>"
                f"<button onclick=\"play('raw{abs(hash(label))}')\">&#9654;</button>"
                f"<span class='v'>·</span><span class='n'>{label}</span>"
                f"<audio id='raw{abs(hash(label))}' preload='auto' "
                f"src='data:audio/wav;base64,{b64}'></audio></div>"
            )
        parts.append("</div>")

    for name, rs in groups.items():
        s0 = rs[0]["sound"]
        parts.append(f"<div class='grp'><h2>{name}</h2>"
                     f"<p class='p'>{DESC.get(name, '')}<br>"
                     f"assets/sounds/{s0.rel}.{s0.fmt}</p>")
        for r in rs:
            s = r["sound"]
            b64 = base64.b64encode(r["path"].read_bytes()).decode()
            mime = "audio/ogg" if s.fmt == "ogg" else "audio/wav"
            parts.append(
                f"<div class='row'>"
                f"<button onclick=\"play('{s.key}')\">&#9654;</button>"
                f"<span class='v'>{s.variant or '—'}</span>"
                f"<span class='n'>{s.note}</span>"
                f"<span class='m'>{r['ms']} мс · {r['kb']:.0f} KB</span>"
                f"<audio id='{s.key}' preload='auto' "
                f"src='data:{mime};base64,{b64}'></audio></div>"
            )
        parts.append("</div>")

    parts += ["<p class='hint'>Где несколько вариантов (a/b/c) — скажи, какой "
              "оставить: <code>send a, receive b, notif a, join b, mute a</code>. "
              "Если характер не тот — скажи, что не так, поменяю инструмент или "
              "фразу. <kbd>Esc</kbd> — стоп.</p>",
              "<script>", JS, "</script></body></html>"]

    p = OUT / out_name
    p.write_text("".join(parts), encoding="utf-8")
    return p


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="список событий через запятую")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    only = {s.strip() for s in a.only.split(",") if s.strip()}
    todo = [s for s in SOUNDS if not only or s.name in only]

    rows = []
    for s in todo:
        print(f"  {s.key} ...", flush=True)
        rows.append(render(s))

    report(rows)
    print(f"\nстраница: {write_preview(rows)}")


if __name__ == "__main__":
    main()
