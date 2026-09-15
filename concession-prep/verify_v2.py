# -*- coding: utf-8 -*-
"""
v2.0(upgrade_v2.py で更新した店舗版)の再計算結果を、CSVからPythonで独立計算した
期待値と突合する。事前準備率・保持時間/優先・印刷用の表示切替を検証する。
  python verify_v2.py <再計算済みxlsx> --csv-a A.csv --csv-b B.csv --att-a 9000,13000,12000 \
      --att-b ... --peak 1200 --mult 0.6 --rate 80 --view 優先:高のみ \
      --ht 10,45,,30,... --manual 1:高,5:低 --thr 30 [--expect-warn 文字列] [--mso]
"""
import argparse
import math
import sys

from openpyxl import load_workbook

from build_tool import DEFAULT_PRODUCTS, ROW_M0, read_csv_rows

ap = argparse.ArgumentParser()
ap.add_argument("xlsx")
ap.add_argument("--csv-a", required=True)
ap.add_argument("--csv-b", required=True)
ap.add_argument("--att-a", required=True)
ap.add_argument("--att-b", required=True)
ap.add_argument("--peak", type=int, required=True)
ap.add_argument("--mult", type=float, required=True, help="期待する時間帯係数(M7)")
ap.add_argument("--rate", default="100", help="事前準備率(整数%) か 'blank'(=100扱い+⚠)")
ap.add_argument("--view", default="すべて")
ap.add_argument("--ht", required=True, help="保持時間20件(空欄は空文字)")
ap.add_argument("--manual", default="", help="index:高/低 をカンマ区切り")
ap.add_argument("--thr", type=int, default=30)
ap.add_argument("--expect-warn", action="append", default=[])
ap.add_argument("--mso", action="store_true", help="MSO貼付あり(商品係数で作る数が変わるため近似検証)")
ap.add_argument("--peak-start", default="17:30", help="⑥ピーク開始(空文字=未入力)")
a = ap.parse_args()

errors = []


def check(label, got, want, tol=0):
    ok = (got == want) if tol == 0 else (
        isinstance(got, (int, float)) and isinstance(want, (int, float)) and abs(got - want) <= tol)
    if not ok:
        errors.append(f"NG {label}: got={got!r} want={want!r}")


def fl(x):
    return max(0, math.floor(x + 1e-9))


def as_serial(v):
    """時刻書式のセルは datetime.time/datetime で読めるので日のシリアル値(0〜1)へ"""
    import datetime as _d
    if isinstance(v, _d.datetime):
        return (v - _d.datetime(v.year, v.month, v.day)).total_seconds() / 86400 + (
            (v - _d.datetime(1899, 12, 30)).days if v.year > 1900 else 0)
    if isinstance(v, _d.time):
        return (v.hour * 3600 + v.minute * 60 + v.second) / 86400
    return v


sales = {}
for r in read_csv_rows(a.csv_a):
    if r[13]:
        sales[r[13]] = sales.get(r[13], 0) + (r[26] or 0)
att = sum(int(x) for x in a.att_a.split(","))
ht = [None if s == "" else int(s) for s in a.ht.split(",")]
manual = {int(k): v for k, v in (kv.split(":") for kv in a.manual.split(",") if kv)}
rate = 100 if a.rate == "blank" or int(a.rate) <= 0 else int(a.rate)   # 0以下は100%扱い(⚠つき)
peak = None
if a.peak_start:
    _ph, _pm = a.peak_start.split(":")
    peak = (int(_ph) * 60 + int(_pm)) / 1440

wb = load_workbook(a.xlsx, data_only=True)
m, pr, pd = wb["準備数計算"], wb["印刷用"], wb["期間データ"]

# ---- 数式レベル: G列はF列の式に率を掛けただけ(端数処理・係数条件は同一)、参照の付け替え
import re as _re
from upgrade_v2 import RATE, VIEW_CELL, ftext
wf = load_workbook(a.xlsx)
mf = wf["準備数計算"]
for i in range(len(DEFAULT_PRODUCTS)):
    r = ROW_M0 + i
    f_txt, g_txt = ftext(mf[f"F{r}"]), ftext(mf[f"G{r}"])
    want_g = _re.sub(r"(ROUND(?:UP|DOWN)?\(\$D\$5\*\$E\d+\*)", lambda mo: mo.group(1) + RATE + "/100*", f_txt)
    check(f"G{r}式=F式×率(端数処理同一)", g_txt, want_g)
    check(f"P{r}式(手動はTRIM判定)", "TRIM(期間データ!F" in ftext(mf[f"P{r}"]), True)
b9f = ftext(mf["B9"])
check("B9式に旧G4参照なし", "期間データ!$G$4" in b9f, False)
check("B9式にB7参照", "期間データ!$B$7" in b9f, True)
check("B9式に比較期間はN列案内", "G列「比較期間" in b9f, False)
check("印刷用!B2式に率", RATE.replace("$D$8", "準備数計算!$D$8") in ftext(wf["印刷用"]["B2"]), True)
check("L列式が印刷用の切替セルを参照", VIEW_CELL in ftext(mf[f"L{ROW_M0}"]), True)
check("Q列式(開始目安=MOD)", "MOD($K" in ftext(mf[f"Q{ROW_M0}"]), True)
check("印刷用!B4式にピーク表示", "ピーク" in ftext(wf["印刷用"]["B4"]), True)
pp = wf["印刷用"]
check("印刷用 A4縦1枚(fitToPage)", bool(pp.sheet_properties.pageSetUpPr and pp.sheet_properties.pageSetUpPr.fitToPage), True)
check("印刷用 fitToWidth/Height=1", (pp.page_setup.fitToWidth, pp.page_setup.fitToHeight), (1, 1))
check("印刷用 A4/縦", (pp.page_setup.paperSize, pp.page_setup.orientation), (9, "portrait"))
check("印刷用 印刷範囲", pp.print_area, "'印刷用'!$A$1:$H$28")

if a.mso:
    check("準備数計算!M7(実測係数が数値)", isinstance(m["M7"].value, (int, float)) and m["M7"].value > 0, True)
    check("準備数計算!M9(波の適用)", m["M9"].value, 1)
else:
    check("準備数計算!M7", m["M7"].value, a.mult, tol=1e-9)
check("準備数計算!M4(期間A)", m["M4"].value, 1)
check("期間データ!E12(基準)", pd["E12"].value, a.thr)
check("E8に率表示", f"× {rate}%" in (m["E8"].value or ""), True)
check("印刷用!B2に率表示", f"{rate}%" in (pr["B2"].value or ""), True)

pri, starts = [], []
for i, name in enumerate(DEFAULT_PRODUCTS):
    r = ROW_M0 + i
    rt = sales.get(name, 0) / att
    f_got, g_got = m[f"F{r}"].value, m[f"G{r}"].value
    if a.mso:
        # 商品係数は商品別の波(別途検証済み)に依存するため、率の掛かり方だけ確認
        check(f"F{r}数値", isinstance(f_got, (int, float)), True)
        if isinstance(f_got, (int, float)):
            check(f"G{r}=F×率", g_got, fl(f_got * rate / 100), tol=1)
    else:
        check(f"F{r}(販売予測数)", f_got, fl(a.peak * rt * a.mult), tol=1)
        check(f"G{r}(仕込み数)", g_got, fl(a.peak * rt * a.mult * rate / 100), tol=1)
    h = ht[i]
    check(f"O{r}(保持時間)", m[f"O{r}"].value, "—" if h is None else h)
    want_p = manual.get(i) or ("—" if h is None else ("高" if h <= a.thr else "低"))
    check(f"P{r}(優先)", m[f"P{r}"].value, want_p)
    pri.append(want_p)
    # 仕込み開始の目安(Q)= MOD(ピーク開始 − 保持時間, 1)。K(非表示)は未補正
    if peak is not None and h is not None:
        start = peak - h / 1440
        check(f"Q{r}(開始目安)", as_serial(m[f"Q{r}"].value), start % 1, tol=1e-6)
        check(f"K{r}(開始・未補正)", as_serial(m[f"K{r}"].value), start, tol=1e-6)
        starts.append(round(start * 1440))
    else:
        check(f"Q{r}(開始目安=—)", m[f"Q{r}"].value, "—")
        starts.append(None)
    # 並び順キー(非表示L列)
    k = i + 1
    tkey = (9999900 + k) if starts[-1] is None else (starts[-1] + 10000) * 100 + k
    if a.view == "優先:高のみ":
        want_l = "" if want_p == "低" else (k if peak is None else tkey)
    elif a.view == "優先:低のみ":
        want_l = (k if peak is None else tkey) if want_p == "低" else ""
    else:
        want_l = (100 + k if want_p == "低" else k) if peak is None else tkey
    got_l = m[f"L{r}"].value
    check(f"L{r}(並び順キー)", "" if got_l in (None, "") else got_l, want_l)

# 印刷用: 表示切替どおりの絞り込みと並び(ピーク入力時は仕込み開始の早い順、未定は最後)
NP = len(DEFAULT_PRODUCTS)
if a.view == "優先:高のみ":
    included = [i for i in range(NP) if pri[i] != "低"]
elif a.view == "優先:低のみ":
    included = [i for i in range(NP) if pri[i] == "低"]
else:
    included = list(range(NP))
if peak is None:
    order = [i + 1 for i in included if pri[i] != "低"] + [i + 1 for i in included if pri[i] == "低"]
    if a.view != "すべて":
        order = [i + 1 for i in included]
else:
    order = [i + 1 for i in sorted(included, key=lambda i: (starts[i] is None, starts[i] or 0, i))]
for k in range(20):
    r = 8 + k
    if k < len(order):
        idx = order[k]
        check(f"印刷用!B{r}(No.)", pr[f"B{r}"].value, idx)
        check(f"印刷用!C{r}(商品名)", pr[f"C{r}"].value, DEFAULT_PRODUCTS[idx - 1])
        check(f"印刷用!D{r}(開始目安=準備数計算Q)", as_serial(pr[f"D{r}"].value), as_serial(m[f"Q{ROW_M0 + idx - 1}"].value))
        check(f"印刷用!E{r}(優先)", pr[f"E{r}"].value, pri[idx - 1])
        check(f"印刷用!F{r}(仕込み数=準備数計算G)", pr[f"F{r}"].value, m[f"G{ROW_M0 + idx - 1}"].value)
        check(f"印刷用!G{r}(☐)", pr[f"G{r}"].value, "☐")
    else:
        for c in "BCDEFG":
            check(f"印刷用!{c}{r}(空)", pr[f"{c}{r}"].value in (None, ""), True)
if peak is not None:
    check("印刷用!B4にピーク表示", "ピーク " in (pr["B4"].value or ""), True)

warn = m["B9"].value or ""
# 店舗版は「古いデータ」を※通知(計算は継続)として出すため、警告有無の判定から除く
warn_core = warn.replace("※ CSVの対象期間が古い可能性があります（計算は継続。期間データシートで日付を確認）。", "")
if a.expect_warn or a.rate == "blank" or int(a.rate) <= 0:
    for w in a.expect_warn + (["事前準備率が未入力か0以下"] if (a.rate == "blank" or int(a.rate) <= 0) else []):
        check(f"B9警告[{w}]", w in warn, True)
else:
    if warn_core.strip():
        errors.append(f"NG B9警告が出ている: {warn!r}")
check("印刷用!B6=B9", (pr["B6"].value or "") == warn, True)

if errors:
    print(f"FAILED ({len(errors)}):")
    for e in errors[:40]:
        print(" ", e)
    sys.exit(1)
print(f"ALL OK v2 (view={a.view}, rate={a.rate}, peak={a.peak_start or '-'}, mso={a.mso}, warn={a.expect_warn})")
