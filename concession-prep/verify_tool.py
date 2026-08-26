# -*- coding: utf-8 -*-
"""
生成したExcelの計算結果を、Pythonで再計算した期待値と突合する検証スクリプト。
使い方: python verify_tool.py <xlsx> [period]
  period: 7 / 3 / 1 (省略時 7) … 準備数計算!D4 に設定されている参照期間と合わせる
"""
import datetime as dt
import math
import random
import sys

from openpyxl import load_workbook

XLSX = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 7

# ---- build_tool.py と同じサンプルデータを再生成 ----
TODAY = dt.date(2026, 8, 26)
DATES = [TODAY - dt.timedelta(days=7 - i) for i in range(7)]
ATTEND = [4200, 3900, 5100, 8300, 7800, 3600, 4100]
PRODUCTS = [
    ("ポップコーン（塩）M", 0.075, 550),
    ("ポップコーン（キャラメル）M", 0.058, 570),
    ("ポップコーン ハーフ＆ハーフ", 0.040, 600),
    ("ドリンク S", 0.045, 340),
    ("ドリンク M", 0.092, 400),
    ("ドリンク L", 0.033, 460),
    ("チュロス（シナモン）", 0.028, 380),
    ("ホットドッグ", 0.022, 500),
    ("ナチョス（チーズソース）", 0.016, 480),
    ("フライドポテト", 0.026, 420),
    ("チキンナゲット", 0.015, 450),
    ("ソフトクリーム（バニラ）", 0.013, 350),
]
rng = random.Random(20260826)
qty = {}   # (day_idx, name) -> qty
for di, (d, att) in enumerate(zip(DATES, ATTEND)):
    weekend = d.weekday() in (5, 6)
    for name, rate, price in PRODUCTS:
        qty[(di, name)] = round(att * rate * (1.08 if weekend else 1.0) * rng.uniform(0.85, 1.15))

FORECAST = 5000
MULTS = [1.0, 1.2, 1.5]
sel = list(range(7 - N, 7))                      # 参照期間の日index
att_total = sum(ATTEND[i] for i in sel)

wb = load_workbook(XLSX, data_only=True)
errors = []


def check(label, got, want, tol=0):
    ok = (got == want) if tol == 0 else (
        got is not None and want is not None and abs(got - want) <= tol)
    if not ok:
        errors.append(f"NG {label}: got={got!r} want={want!r}")


# ---- 日別データ: 販売数グリッド・動員合計 ----
ws = wb["日別データ"]
for i, (name, _, _) in enumerate(PRODUCTS):
    r = 9 + i
    check(f"日別データ!B{r}", ws[f"B{r}"].value, name)
    for j in range(7):
        c = ws.cell(row=r, column=3 + j).value
        check(f"日別データ!{chr(67 + j)}{r}", c, qty[(j, name)])
    check(f"日別データ!J{r}", ws[f"J{r}"].value, sum(qty[(j, name)] for j in range(7)))
check("日別データ!J6(動員7日計)", ws["J6"].value, sum(ATTEND))
for i in range(12, 20):                          # 空き枠は空欄のはず
    r = 9 + i
    v = ws.cell(row=r, column=3).value
    if v not in (None, ""):
        errors.append(f"NG 日別データ 空き枠 C{r} が空でない: {v!r}")

# ---- 準備数計算 ----
ws = wb["準備数計算"]
check("準備数計算!L4(参照日数)", ws["L4"].value, N)
check("準備数計算!L5(動員合計)", ws["L5"].value, att_total)
for i, (name, _, _) in enumerate(PRODUCTS):
    r = 11 + i
    sales = sum(qty[(j, name)] for j in sel)
    rate = sales / att_total
    check(f"準備数計算!C{r}", ws[f"C{r}"].value, name)
    check(f"準備数計算!D{r}(期間販売数)", ws[f"D{r}"].value, sales)
    check(f"準備数計算!E{r}(購買率)", ws[f"E{r}"].value, rate, tol=1e-9)
    check(f"準備数計算!F{r}(基準準備数)", ws[f"F{r}"].value, math.ceil(FORECAST * rate), tol=1)
    for col, m in zip("GHI", MULTS):
        want = math.ceil((FORECAST * rate) * m)
        check(f"準備数計算!{col}{r}(×{m})", ws[f"{col}{r}"].value, want, tol=1)
for i in range(12, 20):
    r = 11 + i
    for col in "CDEFGHI":
        v = ws[f"{col}{r}"].value
        if v not in (None, ""):
            errors.append(f"NG 準備数計算 空き枠 {col}{r} が空でない: {v!r}")

# ---- CSV貼付: チェック列・件数 ----
ws = wb["CSV貼付"]
check("CSV貼付!J2(貼付行数)", ws["J2"].value, 84)
check("CSV貼付!J3(未登録件数)", ws["J3"].value, 0)
check("CSV貼付!I5(チェック)", ws["I5"].value, "✔ OK")

# ---- ガード類: CSV取込チェック行・警告セル ----
ws = wb["日別データ"]
for j in range(7):
    v = ws.cell(row=7, column=3 + j).value
    check(f"日別データ!{chr(67 + j)}7(CSV取込)", v, "✔")
ws = wb["準備数計算"]
warn = ws["B7"].value
if warn not in (None, ""):
    errors.append(f"NG 準備数計算!B7 警告が出ている: {warn!r}")

if errors:
    print(f"FAILED ({len(errors)} errors, period={N}日)")
    for e in errors[:40]:
        print(" ", e)
    sys.exit(1)
print(f"ALL OK (period={N}日, 動員合計={att_total})")
