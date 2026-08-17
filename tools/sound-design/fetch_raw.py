import subprocess, sys
from pathlib import Path
from urllib.parse import quote

BASE = "https://raw.githubusercontent.com/sgossner/VCSL/master/"
DEST = Path(__file__).resolve().parent / "samples" / "raw"

FILES = [
    # маримба — дерево, тёплая; soft и med для разной подачи
    *[f"Idiophones/Struck Idiophones/Marimba/Marimba_hit_Outrigger_{n}_{v}_01.wav"
      for n in ("C4", "G4", "B4", "F5", "C6") for v in ("soft", "med")],
    # глокеншпиль — металл, звонкий
    "Idiophones/Struck Idiophones/Glockenspiel/glock_soft_G4_01.wav",
    "Idiophones/Struck Idiophones/Glockenspiel/glock_soft_C5_02.wav",
    "Idiophones/Struck Idiophones/Glockenspiel/glock_soft_G5_01.wav",
    "Idiophones/Struck Idiophones/Glockenspiel/glock_soft_C6_01.wav",
    # калимба — мягкий щипок
    *[f"Idiophones/Plucked Idiophones/Kalimba, Kenya/Mbira6_Normal_MainSpirit_{s}.wav"
      for s in ("C#4_k2_vl3_rr2", "D#4_k13_vl3_rr2", "F#4_k14_vl3_rr2",
                "A4_k1_vl3_rr2", "B4_k15_vl3_rr2")],
    # ручные колокольчики — длинный чистый звон, под звонки
    *[f"Idiophones/Struck Idiophones/Hand Chimes/sus_{n}_r01_main.wav"
      for n in ("A4", "C5", "D5", "C6")],
    # клавес — сухой деревянный удар, под щелчки и попы
    "Idiophones/Struck Idiophones/Claves/Claves1_Hit_v1_rr1_Mid.wav",
    "Idiophones/Struck Idiophones/Claves/Claves2_Hit_v1_rr1_Mid.wav",
]

DEST.mkdir(parents=True, exist_ok=True)
procs = []
for p in FILES:
    out = DEST / Path(p).name
    procs.append((out, subprocess.Popen(
        ["curl", "-sL", "-m", "90", "-o", str(out), BASE + quote(p)])))
for out, pr in procs:
    pr.wait()
    sz = out.stat().st_size if out.exists() else 0
    print(f"{'ok ' if sz > 20_000 else 'BAD'} {sz/1024:>8.0f} KB  {out.name}")
