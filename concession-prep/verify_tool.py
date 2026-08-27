# -*- coding: utf-8 -*-
"""
生成したExcel(v3)の計算結果を、CSVからPythonで独立集計した期待値と突合する。
使い方:
  python verify_tool.py <xlsx> --template
  python verify_tool.py <xlsx> --csv-a A.csv --csv-b B.csv --select A \
      --att-a 9000,13000,12000 --att-b ... --peak 1200 --mult 1.2
"""
import argparse
import math
import sys

from openpyxl import load_workbook

from build_tool import DEFAULT_PRODUCTS, read_csv_rows

ap = argparse.ArgumentParser()
ap.add_argument("xlsx")
ap.add_argument("--template", action="store_true")
ap.add_argument("--csv-a")
ap.add_argument("--csv-b")
ap.add_argument("--select", choices=["A", "B"], default="A")
ap.add_argument("--att-a")
ap.add_argument("--att-b")
ap.add_argument("--peak", type=int)
ap.add_argument("--mult", type=float, default=1.0)
a = ap.parse_args()

wb = load_workbook(a.xlsx, data_only=True)
errors = []


def check(label, got, want, tol=0):
    ok = (got == want) if tol == 0 else (
        got is not None and want is not None and abs(got - want) <= tol)
    if not ok:
        errors.append(f"NG {label}: got={got!r} want={want!r}")


def sales_by_name(csv_path):
    total = {}
    for row in read_csv_rows(csv_path):
        name, qty = row[13], row[26]
        if name is not None:
            total[name] = total.get(name, 0) + (qty or 0)
    return total


pd = wb["期間データ"]
m = wb["準備数計算"]
pr = wb["印刷用"]

if a.template:
    for i in range(len(DEFAULT_PRODUCTS)):
        r = 14 + i
        check(f"期間データ!B{r}", pd[f"B{r}"].value, DEFAULT_PRODUCTS[i])
        check(f"期間データ!C{r}(A販売=0)", pd[f"C{r}"].value, 0)
        check(f"期間データ!D{r}(B販売=0)", pd[f"D{r}"].value, 0)
    check("期間データ!G4(A未貼付表示)", "貼り付けてください" in (pd["G4"].value or ""), True)
    check("準備数計算!E11(要確認)", m["E11"].value, "要確認")
    check("準備数計算!F11(空欄)", m["F11"].value in (None, ""), True)
    warn = m["B8"].value or ""
    for kw in ("未貼付", "そろっていません", "ピーク動員数"):
        check(f"B8警告[{kw}]", kw in warn, True)
else:
    sa = sales_by_name(a.csv_a)
    sb = sales_by_name(a.csv_b)
    att_a = [int(x) for x in a.att_a.split(",")]
    att_b = [int(x) for x in a.att_b.split(",")]
    att_sel = sum(att_a) if a.select == "A" else sum(att_b)
    att_oth = sum(att_b) if a.select == "A" else sum(att_a)
    sel_sales = sa if a.select == "A" else sb
    oth_sales = sb if a.select == "A" else sa

    check("期間データ!F6(A動員計)", pd["F6"].value, sum(att_a))
    check("期間データ!J10(B動員計)", pd["J10"].value, sum(att_b))
    check("期間データ!G4(✔一致)", "✔一致" in (pd["G4"].value or ""), True)
    check("期間データ!B11(✔一致)", "✔一致" in (pd["B11"].value or ""), True)

    for i, name in enumerate(DEFAULT_PRODUCTS):
        r = 14 + i
        check(f"期間データ!C{r}({name[:6]})", pd[f"C{r}"].value, sa.get(name, 0))
        check(f"期間データ!D{r}", pd[f"D{r}"].value, sb.get(name, 0))

    check("準備数計算!M4", m["M4"].value, 1 if a.select == "A" else 2)
    check("準備数計算!M5", m["M5"].value, att_sel)
    check("準備数計算!M6", m["M6"].value, att_oth)
    check("準備数計算!D7(適用倍率)", m["D7"].value, a.mult, tol=1e-9)
    for i, name in enumerate(DEFAULT_PRODUCTS):
        r = 11 + i
        s = sel_sales.get(name, 0)
        rate = s / att_sel
        check(f"準備数計算!D{r}", m[f"D{r}"].value, s)
        check(f"準備数計算!E{r}", m[f"E{r}"].value, rate, tol=1e-9)
        check(f"準備数計算!F{r}", m[f"F{r}"].value, math.ceil(a.peak * rate * a.mult), tol=1)
        check(f"準備数計算!G{r}", m[f"G{r}"].value, oth_sales.get(name, 0) / att_oth, tol=1e-9)
        check(f"印刷用!D{8 + i}", pr[f"D{8 + i}"].value, math.ceil(a.peak * rate * a.mult), tol=1)
    warn = m["B8"].value
    if warn not in (None, ""):
        errors.append(f"NG B8警告が出ている: {warn!r}")

    # 商品リスト(プルダウン)の中身
    uniq_a = list(dict.fromkeys(r[13] for r in read_csv_rows(a.csv_a) if r[13]))
    uniq_b = list(dict.fromkeys(r[13] for r in read_csv_rows(a.csv_b) if r[13]))
    check("商品リスト先頭", pd["Q5"].value, uniq_a[0])
    check("商品リストA件数目", pd[f"Q{4 + len(uniq_a)}"].value, uniq_a[-1])
    check("商品リストB先頭", pd[f"Q{5 + len(uniq_a)}"].value, uniq_b[0])
    check("商品リスト末尾", pd[f"Q{4 + len(uniq_a) + len(uniq_b)}"].value, uniq_b[-1])

# 空き枠
for i in range(len(DEFAULT_PRODUCTS), 20):
    for col in "CDEFG":
        v = m[f"{col}{11 + i}"].value
        if v not in (None, ""):
            errors.append(f"NG 準備数計算 空き枠 {col}{11 + i}: {v!r}")

if errors:
    print(f"FAILED ({len(errors)}):")
    for e in errors[:40]:
        print(" ", e)
    sys.exit(1)
print("ALL OK", "(template)" if a.template else f"(select={a.select}, 動員={att_sel})")
