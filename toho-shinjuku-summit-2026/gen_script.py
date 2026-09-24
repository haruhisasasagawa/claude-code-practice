#!/usr/bin/env python3
"""script.json (the talk script) -> src/script-data.js + 台本 text file.

    python3 gen_script.py && python3 build.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
data = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))

ORDER = ["cover", "origin", "heyday", "turning", "rebirth", "position",
         "landscape", "strengths", "renewal", "legacy", "together"]
CUE = "［▶］"


def chars(text: str) -> int:
    return len(re.sub(r"\s", "", text.replace(CUE, "")))


scenes = {s["id"]: s for s in data["scenes"]}
flags = {}
for f in data.get("flags", []):
    flags.setdefault(f["id"], []).append(f["note"])

# --- script-data.js (read by the deck for presenter view / notes / print) ---
js_scenes = {}
for sid in ORDER:
    s = scenes[sid]
    js_scenes[sid] = {"title": s["title"], "seconds": s["seconds"], "text": s["script"], "flags": flags.get(sid, [])}
target = sum(s["seconds"] for s in js_scenes.values())
js = ("/* 台本データ — gen_script.py が script.json から生成（直接編集せず script.json を直す） */\n"
      "window.TALK = " + json.dumps({"target": target, "scenes": js_scenes}, ensure_ascii=False, indent=1) + ";\n")
(ROOT / "src" / "script-data.js").write_text(js, encoding="utf-8")

# --- plain-text script for printing / sharing ---
def mmss(sec):
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


lines = [
    "TOHOシネマズ新宿　新宿映画館サミット2026 リレートーク　台本",
    "=" * 44,
    f"持ち時間：3〜5分／目標 {mmss(target)}（1分≒300字）　合計 約{sum(chars(scenes[s]['script']) for s in ORDER)}字",
    "［▶］＝ここでクリック（→キー）して画面を次へ進める",
    "",
]
cum = 0
for i, sid in enumerate(ORDER):
    s = scenes[sid]
    start = cum
    cum += s["seconds"]
    no = "表紙" if i == 0 else f"{i:02d}"
    lines.append(f"■ {no}　{s['title']}　（{mmss(start)}〜{mmss(cum)}／{s['seconds']}秒・{chars(s['script'])}字）")
    lines.append(s["script"].replace(CUE, "\n　［▶ クリック］\n"))
    for f in flags.get(sid, []):
        lines.append(f"　※要確認：{f}")
    lines.append("")
if data.get("notes"):
    lines += ["-" * 44, "確認メモ", *[f"・{n}" for n in data["notes"]], ""]
(ROOT / "TOHO_Shinjuku_Summit2026_台本.txt").write_text("\n".join(lines), encoding="utf-8")
print(f"script-data.js + 台本.txt written; target {mmss(target)}")
