# -*- coding: utf-8 -*-
"""
生成したExcel(v2)の計算結果を、Pythonで再計算した期待値と突合する検証スクリプト。
使い方: python verify_tool.py <xlsx> [period] [band]
  period: 7 / 3 / 1 (省略時 7) … 準備数計算!D4 の参照期間と合わせる
  band:   全体 / 朝 / 昼 / 夕方 / 夜 (省略時 昼) … 準備数計算!D5 と合わせる
"""
import math
import sys

from openpyxl import load_workbook

import sample_data as sd

XLSX = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 7
BAND = sys.argv[3] if len(sys.argv) > 3 else "昼"

ATT_BANDS, QTY, CSV_ROWS = sd.build()
PRODUCTS, ATTEND, BANDS = sd.PRODUCTS, sd.ATTEND, sd.BANDS

PEAK = 1200
MULT = 1.2
sel = list(range(7 - N, 7))
att_total_all = sum(ATTEND[i] for i in sel)
att_total = att_total_all if BAND == "全体" else sum(ATT_BANDS[BAND][i] for i in sel)

wb = load_workbook(XLSX, data_only=True)
errors = []


def check(label, got, want, tol=0):
    ok = (got == want) if tol == 0 else (
        got is not None and want is not None and abs(got - want) <= tol)
    if not ok:
        errors.append(f"NG {label}: got={got!r} want={want!r}")


def day_total(di, name):
    return sum(QTY[(di, name, b)] for b in BANDS)


def band_sum(name, band):
    if band == "全体":
        return sum(day_total(i, name) for i in sel)
    return sum(QTY[(i, name, band)] for i in sel)


# ---- 日別データ ----
ws = wb["日別データ"]
for i, (name, _, _) in enumerate(PRODUCTS):
    r = 13 + i
    check(f"日別データ!B{r}", ws[f"B{r}"].value, name)
    for j in range(7):
        check(f"日別データ!{chr(67 + j)}{r}", ws.cell(row=r, column=3 + j).value, day_total(j, name))
    check(f"日別データ!J{r}", ws[f"J{r}"].value, sum(day_total(j, name) for j in range(7)))
check("日別データ!J6(動員7日計)", ws["J6"].value, sum(ATTEND))
for k, b in enumerate(BANDS):
    check(f"日別データ!J{7 + k}(動員{b}7日計)", ws[f"J{7 + k}"].value, sum(ATT_BANDS[b]))
for j in range(7):
    check(f"日別データ!{chr(67 + j)}11(CSV取込)", ws.cell(row=11, column=3 + j).value, "✔")
for i in range(len(PRODUCTS), 20):
    v = ws.cell(row=13 + i, column=3).value
    if v not in (None, ""):
        errors.append(f"NG 日別データ 空き枠 C{13 + i} が空でない: {v!r}")

# ---- 準備数計算 ----
ws = wb["準備数計算"]
check("準備数計算!J4(参照日数)", ws["J4"].value, N)
check("準備数計算!J5(動員合計)", ws["J5"].value, att_total)
check("準備数計算!J8(期間内帯データ数)", ws["J8"].value, len(PRODUCTS) * len(BANDS) * N)
check("準備数計算!J9(全体動員)", ws["J9"].value, att_total_all)
check("準備数計算!J10(判定不能行)", ws["J10"].value, 0)
warn = ws["B8"].value
if warn not in (None, ""):
    errors.append(f"NG 準備数計算!B8 警告が出ている: {warn!r}")
for i, (name, _, _) in enumerate(PRODUCTS):
    r = 11 + i
    sales = band_sum(name, BAND)
    rate = sales / att_total
    sales_all = band_sum(name, "全体")
    check(f"準備数計算!C{r}", ws[f"C{r}"].value, name)
    check(f"準備数計算!D{r}(期間販売数)", ws[f"D{r}"].value, sales)
    check(f"準備数計算!E{r}(購買率)", ws[f"E{r}"].value, rate, tol=1e-9)
    check(f"準備数計算!F{r}(作る数)", ws[f"F{r}"].value,
          math.ceil(PEAK * rate * MULT), tol=1)
    check(f"準備数計算!G{r}(参考全体)", ws[f"G{r}"].value, sales_all / att_total_all, tol=1e-9)
for i in range(len(PRODUCTS), 20):
    r = 11 + i
    for col in "CDEFG":
        v = ws[f"{col}{r}"].value
        if v not in (None, ""):
            errors.append(f"NG 準備数計算 空き枠 {col}{r} が空でない: {v!r}")

# ---- 印刷用 ----
ws = wb["印刷用"]
check("印刷用!B3(ヘッダー)", ("1日全体" if BAND == "全体" else BAND) in (ws["B3"].value or ""), True)
for i, (name, _, _) in enumerate(PRODUCTS):
    r = 8 + i
    rate = band_sum(name, BAND) / att_total
    check(f"印刷用!C{r}", ws[f"C{r}"].value, name)
    check(f"印刷用!D{r}(作る数)", ws[f"D{r}"].value, math.ceil(PEAK * rate * MULT), tol=1)
    check(f"印刷用!E{r}(チェック欄)", ws[f"E{r}"].value, "☐")

# ---- CSV貼付 ----
ws = wb["CSV貼付"]
check("CSV貼付!L2(貼付行数)", ws["L2"].value, len(CSV_ROWS))
check("CSV貼付!L3(未登録件数)", ws["L3"].value, 0)
check("CSV貼付!I5(商品名チェック)", ws["I5"].value, "✔ OK")
for r, want in [(5, "朝"), (6, "昼"), (7, "夕方"), (8, "夜")]:
    check(f"CSV貼付!J{r}(時間帯判定)", ws[f"J{r}"].value, want)

if errors:
    print(f"FAILED ({len(errors)} errors, period={N}日, band={BAND})")
    for e in errors[:40]:
        print(" ", e)
    sys.exit(1)
print(f"ALL OK (period={N}日, band={BAND}, 動員合計={att_total})")
