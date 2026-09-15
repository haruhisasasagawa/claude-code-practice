# -*- coding: utf-8 -*-
"""
店舗版 ver2.0 のワークブックに「調理時間」シートを追加する。
調理マニュアル(調理時間一覧: 商品/調理機器/条件/1個〜7個の時間/備考)を読み込み、
登録商品(期間データ!B14:B33)と売上CSVの商品名にマニュアルの項目を名寄せして転記する。
商品ごとの行には 調理機器・条件・個数別の時間(秒)・一度に最大 を値で持たせ(手修正OK)、
準備数計算の仕込み数から 回数・所要時間(分) を自動計算する。マニュアルの原本は同じシートの
下段に参考として転記する。

  python add_cooking_sheet.py <ver2.0.xlsx> <調理マニュアル.xlsx> <出力.xlsx> [--csv 売上CSV ...]
    --csv : 名寄せの候補にする売上・在庫・原価CSV(商品名だけ使う)。省略時はブック内の
            CSV貼付A/B に貼られた商品名を使う
"""
import argparse
import os
import re
import sys
import unicodedata

from openpyxl import load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_tool import (BORDER_LIGHT, CHIP_NAVY, CORAL, F_AUTO, F_INPUT, F_ZEBRA, GRAY, INK,  # noqa: E402
                        NAVY, N_SLOTS, ROW_M0, ROW_P0, align, chip, fill, fnt, note, read_csv_rows,
                        style_range, title_band)
from upgrade_v2 import check_hidden_cols, restore_comment_vml                                   # noqa: E402

SHEET = "調理時間"
ROW_C0 = 6                        # 商品1行目
N_ROWS = 30                       # 商品行数(登録20枠+候補・新規用)
FOOD_CATS = {"ホットドッグ", "軽食系フード", "調理系スイーツ", "その他フード"}
TAB_COLOR = "3AA981"

# マニュアルの項目名 → 売上CSVの商品名を拾うキーワード。各要素は「いずれかを含む」、
# 要素同士は「すべて含む」。exclude はそれを含む商品を外す(正規化: 全角→半角・小文字・空白除去)
MATCH_RULES = [
    ("ピクルスケチャップ＆マスタード", [["ケチャップ"], ["マスタード"]], []),
    ("4種のチーズ", [["4種"], ["チーズ"]], []),
    ("スパイシーハラペーニョ", [["ハラペ"]], []),
    ("チキンクリームシチュー", [["チキンクリーム", "チキンシチュ"]], []),
    ("ビーフシチュー＆チーズ", [["ビーフシチュ"]], []),
    ("ガリポテ", [["ガリポテ"]], []),
    ("サルサ＆アボカド", [["サルサ", "アボカド"]], []),
    ("スナックじゃが", [["じゃが"]], []),
    ("手包みピザ", [["ピザ"]], []),
    ("スパイシー！ポップチキン", [["ポップチキン"]], []),
    ("チョコクリームチュリトス", [["チュリトス"], ["チョコ"]], []),
    ("チュリトス プレーン", [["チュリトス"]], ["チョコ"]),
]


def norm(s):
    s = unicodedata.normalize("NFKC", str(s or ""))
    return re.sub(r"[\s　・･!！\(\)（）/／]", "", s).lower()


def parse_sec(v):
    """'45秒' '1分10秒' '40～50秒' '80秒' → 秒(範囲は上限)。'調理不可'/空 → None。注記を返す"""
    if v is None:
        return None, ""
    t = unicodedata.normalize("NFKC", str(v)).strip()
    if not t or "不可" in t:
        return None, ""
    parts = [x.strip() for x in re.split(r"[~〜～\-]", t)]
    if len(parts) > 1 and re.fullmatch(r"\d+", parts[0]):        # 「40～50秒」→ 40秒〜50秒
        unit = "分" if parts[-1].endswith("分") else "秒"
        parts[0] += unit
    secs = []
    for p in parts:
        m = re.fullmatch(r"\s*(?:(\d+)分)?\s*(?:(\d+)秒)?\s*", p)
        if not m or (m.group(1) is None and m.group(2) is None):
            return None, f"読み取れない時間「{t}」"
        secs.append(int(m.group(1) or 0) * 60 + int(m.group(2) or 0))
    if len(secs) > 1:
        return max(secs), f"{t}（上限で計算）"
    return secs[0], ""


def parse_manual(path):
    """調理時間一覧シートを読む。戻り値: [{group, machine, cond, times{1..7}, max, note, remarks}]"""
    wb = load_workbook(path, data_only=True)
    ws = wb["調理時間一覧"] if "調理時間一覧" in wb.sheetnames else wb.worksheets[0]
    head = [str(c.value or "").strip() for c in ws[1]]
    col = {h: i for i, h in enumerate(head)}
    for need in ("商品", "調理機器"):
        if need not in col:
            raise SystemExit(f"マニュアルの1行目に「{need}」列がありません: {head}")
    out = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[col["商品"]]:
            continue
        rec = {"group": str(row[col["商品"]]).strip(), "machine": str(row[col["調理機器"]] or "").strip(),
               "cond": str(row[col.get("条件", -1)] or "").strip() if "条件" in col else "",
               "times": {}, "remarks": []}
        for k in range(1, COUNTS + 1):
            key = f"{k}個"
            if key in col:
                sec, rem = parse_sec(row[col[key]])
                rec["times"][k] = sec
                if rem:
                    rec["remarks"].append(f"{k}個: {rem}")
        known = {"商品", "調理機器", "条件"} | {f"{k}個" for k in range(1, COUNTS + 1)}
        extra = [str(v).strip() for i, v in enumerate(row) if v is not None and (i >= len(head) or head[i] not in known)]
        extra = [v for v in extra if v and v != "None"]
        rec["note"] = "／".join(extra)
        m = re.search(r"最大\s*(\d+)", unicodedata.normalize("NFKC", rec["note"]))
        rec["max"] = int(m.group(1)) if m else max([k for k, s in rec["times"].items() if s is not None] or [1])
        out.append(rec)
    return out


def split_variants(group):
    """'ホットドッグ（A／B／C）' → ('ホットドッグ', ['A','B','C'])。括弧が無ければ (group, [group])"""
    g = str(group).strip()
    m = re.match(r"^(.*?)[（(](.*)[)）]\s*$", g)
    if not m:
        return g.strip(), [g.strip()]
    base = m.group(1).strip()
    vs = [v.strip() for v in re.split(r"[／/]", m.group(2)) if v.strip()]
    return base, vs


def rule_for_variant(variant):
    nv = norm(variant)
    for name, kws, excl in MATCH_RULES:
        if norm(name) == nv or norm(name) in nv or nv in norm(name):
            return kws, excl
    return [[nv[:4]]] if len(nv) >= 4 else [[nv]], []      # 未知の項目は先頭4文字で拾う(要確認)


def match_products(manual, candidates):
    """商品名 → (マニュアルrec(機種は先頭), variant名, 照合メモ)。複数機種は備考に列挙"""
    by_group = {}
    for rec in manual:
        by_group.setdefault(rec["group"], []).append(rec)
    result = {}
    for group, recs in by_group.items():
        base, variants = split_variants(group)
        for variant in variants:
            kws, excl = rule_for_variant(variant)
            for name in candidates:
                n = norm(name)
                if any(norm(e) in n for e in excl):
                    continue
                if all(any(norm(k) in n for k in alts) for alts in kws):
                    if name in result:
                        continue
                    label = base if base == variant else f"{base}（{variant}）"
                    result[name] = (recs, label)
    return result


def sec_text(sec):
    if sec is None:
        return "—"
    return f"{sec // 60}分{sec % 60}秒" if sec >= 60 and sec % 60 else (f"{sec // 60}分" if sec >= 60 else f"{sec}秒")


COUNTS = 10                       # 1個〜10個(マニュアルの列に合わせる)
C_T0 = 6                          # 1個の列(F)
CL = lambda i: get_column_letter(i)                                   # noqa: E731
COL_T1, COL_TN = CL(C_T0), CL(C_T0 + COUNTS - 1)                      # F .. O
COL_MAX, COL_N, COL_O, COL_P, COL_Q = (CL(C_T0 + COUNTS + k) for k in range(5))   # P Q R S T
LAST = COL_Q


def build_sheet(wb, manual, candidates):
    if SHEET in wb.sheetnames:
        del wb[SHEET]
    ws = wb.create_sheet(SHEET, index=wb.sheetnames.index("期間データ") + 1)
    ws.sheet_properties.tabColor = TAB_COLOR
    ws.sheet_view.showGridLines = False
    widths = {"A": 5, "B": 30, "C": 24, "D": 24, "E": 18, COL_MAX: 7, COL_N: 9, COL_O: 7, COL_P: 11, COL_Q: 46}
    for k in range(COUNTS):
        widths[CL(C_T0 + k)] = 6.2
    for c, w in widths.items():
        ws.column_dimensions[c].width = w
    last = LAST
    title_band(ws, f"B1:{last}1", "　🍳 調理時間｜商品ごとの調理条件（マニュアルから転記・手修正OK）")
    note(ws, f"B2:{last}2", "商品名はプルダウン（貼ったCSVの商品）。調理機器・条件・個数別の時間(秒)・一度に最大は"
         "マニュアルの値を転記したもので、そのまま書き換えられます。仕込み数は準備数計算から自動で拾い、"
         "回数 ＝ 仕込み数 ÷ 一度に最大（切り上げ）、所要時間 ＝ 回数 × 最大個数のときの時間。", 9)
    ws.merge_cells(f"B2:{last}2")
    ws["B2"].alignment = align("left", "center", True)
    ws.row_dimensions[2].height = 30
    chip(ws, "B3:E3", "  ✏️ 黄色＝入力（手修正OK）　🔒 グレー＝自動計算", CHIP_NAVY, INK, 9)
    hdr = ["No.", "商品名（プルダウンで選択）", "マニュアルの項目（参考）", "調理機器", "条件"] + \
          [f"{k}個" for k in range(1, COUNTS + 1)] + ["一度に\n最大", "仕込み数\n(自動)", "回数\n(自動)", "所要時間\n(自動)", "照合・備考（手修正OK）"]
    hr = ROW_C0 - 1
    for i, h in enumerate(hdr, start=1):
        ws.cell(row=hr, column=i, value=h)
    style_range(ws, f"A{hr}:{last}{hr}", font=fnt(9, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws.row_dimensions[hr].height = 30
    ws.cell(row=hr - 1, column=C_T0, value="↓ 同時に調理する個数ごとの時間（秒。1分10秒 → 70）")
    style_range(ws, f"{COL_T1}{hr - 1}:{COL_TN}{hr - 1}", font=fnt(8.5, False, GRAY), alignment=align("left"))

    registered = []
    pd = wb["期間データ"]
    for i in range(N_SLOTS):
        v = pd[f"B{ROW_P0 + i}"].value
        registered.append(v if isinstance(v, str) and v.strip() else None)
    reg_names = [v for v in registered if v]
    matched = match_products(manual, list(dict.fromkeys(reg_names + candidates)))
    extra = [n for n in candidates if n in matched and n not in reg_names]
    rows = [(n, True) for n in reg_names] + [(n, False) for n in extra]
    if len(rows) > N_ROWS:
        rows = rows[:N_ROWS]

    first, lastrow = ROW_C0, ROW_C0 + N_ROWS - 1
    for k in range(N_ROWS):
        r = ROW_C0 + k
        ws.row_dimensions[r].height = 19
        name, is_reg = rows[k] if k < len(rows) else (None, False)
        ws[f"A{r}"] = k + 1
        ws[f"B{r}"] = name
        memo = []
        if name and name in matched:
            recs, label = matched[name]
            rec = recs[0]
            ws[f"C{r}"] = label
            ws[f"D{r}"] = rec["machine"]
            ws[f"E{r}"] = rec["cond"]
            for kk in range(1, COUNTS + 1):
                ws.cell(row=r, column=C_T0 - 1 + kk, value=rec["times"].get(kk))
            ws[f"{COL_MAX}{r}"] = rec["max"]
            memo.append("自動で名寄せ" + ("" if is_reg else "（未登録の候補）"))
            if len(recs) > 1:
                alts = "／".join(f"{x['machine']}: " + "・".join(sec_text(x["times"].get(kk)) for kk in range(1, x["max"] + 1))
                                 for x in recs[1:])
                memo.append(f"機器は要確認（他: {alts}）")
            if rec["remarks"]:
                memo.append("；".join(rec["remarks"]))
            if rec["note"] and not re.search(r"最大", rec["note"]):
                memo.append(rec["note"])
        elif name:
            memo.append("⚠ マニュアルに該当する項目なし → 調理機器・時間・一度に最大を手入力")
        ws[f"{COL_Q}{r}"] = "｜".join(memo) if memo else None
        ws[f"{COL_N}{r}"] = (f'=IF($B{r}="","",IFERROR(INDEX(準備数計算!$G${ROW_M0}:$G${ROW_M0 + N_SLOTS - 1},'
                             f'MATCH($B{r},準備数計算!$C${ROW_M0}:$C${ROW_M0 + N_SLOTS - 1},0)),"—"))')
        ws[f"{COL_O}{r}"] = (f'=IF(OR($B{r}="",NOT(ISNUMBER(${COL_N}{r})),NOT(ISNUMBER(${COL_MAX}{r}))),"",'
                             f'IF(${COL_MAX}{r}<=0,"⚠ 最大",ROUNDUP(${COL_N}{r}/${COL_MAX}{r},0)))')
        tsel = f'INDEX(${COL_T1}{r}:${COL_TN}{r},1,MIN({COUNTS},MAX(1,${COL_MAX}{r})))'
        ws[f"{COL_P}{r}"] = (f'=IF(OR($B{r}="",NOT(ISNUMBER(${COL_O}{r}))),"",'
                             f'IF(NOT(ISNUMBER({tsel})),"⚠ 時間未入力",${COL_O}{r}*{tsel}/60))')
        zebra = F_ZEBRA if k % 2 else "FFFFFF"
        style_range(ws, f"A{r}", font=fnt(9, False, GRAY), fl=fill(zebra), alignment=align("center"), border=BORDER_LIGHT)
        style_range(ws, f"B{r}:E{r}", font=fnt(9.5), fl=fill(F_INPUT), alignment=align("left"), border=BORDER_LIGHT)
        style_range(ws, f"{COL_T1}{r}:{COL_MAX}{r}", font=fnt(9.5), fl=fill(F_INPUT), alignment=align("center"),
                    border=BORDER_LIGHT, num='0"秒"')
        ws[f"{COL_MAX}{r}"].number_format = '0"個"'
        style_range(ws, f"{COL_N}{r}:{COL_O}{r}", font=fnt(9.5), fl=fill(F_AUTO), alignment=align("center"),
                    border=BORDER_LIGHT, num="0")
        style_range(ws, f"{COL_P}{r}", font=fnt(10, True, CORAL), fl=fill(F_AUTO), alignment=align("center"),
                    border=BORDER_LIGHT, num='0.0"分"')
        style_range(ws, f"{COL_Q}{r}", font=fnt(8.5, False, "5B6472"), fl=fill(zebra), alignment=align("left"), border=BORDER_LIGHT)
    tr = lastrow + 1
    ws[f"B{tr}"] = "登録商品の合計（仕込み数のある行）"
    ws[f"{COL_P}{tr}"] = f'=IF(COUNT({COL_P}{first}:{COL_P}{lastrow})=0,"",SUM({COL_P}{first}:{COL_P}{lastrow}))'
    ws[f"{COL_N}{tr}"] = f'=IF(COUNT({COL_N}{first}:{COL_N}{lastrow})=0,"",SUM({COL_N}{first}:{COL_N}{lastrow}))'
    style_range(ws, f"B{tr}:{COL_MAX}{tr}", font=fnt(9.5, True), alignment=align("right"))
    style_range(ws, f"{COL_N}{tr}", font=fnt(9.5, True), alignment=align("center"), num="0")
    style_range(ws, f"{COL_P}{tr}", font=fnt(10, True, CORAL), alignment=align("center"), num='0.0"分"')
    note(ws, f"B{tr + 1}:{last}{tr + 1}",
         "※ 所要時間は「一度に最大」の個数で回し続けた場合の調理時間の合計です（仕込み・盛り付けの手間は含みません）。"
         "複数の機器で同時に調理する場合は台数で割ってください。時間は秒で入力（1分10秒 → 70）。"
         "同じ商品でも機器で時間が違うので、備考の他機種の時間を見て使う機器に合わせて書き換えてください。", 8.5)
    ws.merge_cells(f"B{tr + 1}:{last}{tr + 1}")
    ws[f"B{tr + 1}"].alignment = align("left", "center", True)
    ws.row_dimensions[tr + 1].height = 28

    dv = DataValidation(type="list", formula1="商品リスト", allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add(f"B{first}:B{lastrow}")
    dv2 = DataValidation(type="whole", operator="greaterThanOrEqual", formula1="0", allow_blank=True)
    ws.add_data_validation(dv2)
    dv2.add(f"{COL_T1}{first}:{COL_MAX}{lastrow}")
    ws.conditional_formatting.add(f"{COL_N}{first}:{COL_P}{lastrow}",
                                  FormulaRule(formula=[f'LEFT(${COL_N}{first},1)="—"'], font=Font(color=GRAY)))
    ws.conditional_formatting.add(f"{COL_O}{first}:{COL_Q}{lastrow}",
                                  FormulaRule(formula=[f'ISNUMBER(SEARCH("⚠",{COL_O}{first}))'], font=Font(color=CORAL, bold=True)))

    # ---- マニュアルの原本(参考) ----
    r0 = tr + 3
    chip(ws, f"B{r0}:E{r0}", "  📖 調理マニュアル（原本からの転記・参考。行の追加OK）", CHIP_NAVY, INK, 9.5)
    hr2 = r0 + 1
    ws[f"B{hr2}"] = "調理機器"
    ws.merge_cells(f"C{hr2}:E{hr2}")
    ws[f"C{hr2}"] = "マニュアルの項目｜条件"
    for kk in range(1, COUNTS + 1):
        ws.cell(row=hr2, column=C_T0 - 1 + kk, value=f"{kk}個")
    ws[f"{COL_MAX}{hr2}"] = "一度に\n最大"
    ws.merge_cells(f"{COL_N}{hr2}:{last}{hr2}")
    ws[f"{COL_N}{hr2}"] = "備考（同時調理数など）"
    style_range(ws, f"B{hr2}:{last}{hr2}", font=fnt(9, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws.row_dimensions[hr2].height = 30
    rr = hr2
    for rec in manual:
        rr += 1
        ws.row_dimensions[rr].height = 18
        ws[f"B{rr}"] = rec["machine"]
        ws.merge_cells(f"C{rr}:E{rr}")
        ws[f"C{rr}"] = rec["group"] + (f"｜{rec['cond']}" if rec["cond"] else "")
        for kk in range(1, COUNTS + 1):
            ws.cell(row=rr, column=C_T0 - 1 + kk, value=rec["times"].get(kk) if rec["times"].get(kk) is not None else "—")
        ws[f"{COL_MAX}{rr}"] = rec["max"]
        ws.merge_cells(f"{COL_N}{rr}:{last}{rr}")
        ws[f"{COL_N}{rr}"] = "；".join([x for x in [rec["note"]] + rec["remarks"] if x]) or None
        style_range(ws, f"B{rr}:{last}{rr}", font=fnt(9), fl=fill(F_ZEBRA if (rr - hr2) % 2 else "FFFFFF"),
                    alignment=align("left"), border=BORDER_LIGHT)
        style_range(ws, f"{COL_T1}{rr}:{COL_MAX}{rr}", font=fnt(9), alignment=align("center"), num='0"秒"')
        ws[f"{COL_MAX}{rr}"].number_format = '0"個"'
    note(ws, f"B{rr + 1}:{last}{rr + 1}", "※ 「—」＝その個数での同時調理は不可（マニュアル記載）。範囲のある時間は上限で転記。", 8.5)
    ws.freeze_panes = f"C{ROW_C0}"
    ws.print_area = f"A1:{last}{rr + 1}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = 9
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    return len(rows), sum(1 for n, _ in rows if n in matched), extra


def add_guide_line(wb):
    g = wb["使い方"]
    for row in g.iter_rows(min_col=3, max_col=3):
        c = row[0]
        if isinstance(c.value, str) and "🆕 v2.0" in c.value:
            pass
    # v2.0 追加機能ブロックの末尾に1行足す(空き行を探す)
    r = g.max_row
    while r > 1 and g[f"C{r}"].value is None:
        r -= 1
    r += 1
    from build_tool import disp_w
    t = ("・調理時間（シート）：調理マニュアルの機器・個数別の時間・一度に最大を商品ごとに転記した表です（手修正OK）。"
         "準備数計算の仕込み数から 回数と所要時間（分）を自動で出します。新商品は商品名をプルダウンで選び、"
         "下段のマニュアル原本を見て時間を入れてください。")
    nl = max(1, -(-int(disp_w(t) * 2) // 100))
    g.row_dimensions[r].height = 15 * nl + 5
    note(g, f"C{r}:J{r}", t, 9.5, INK, wrap=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("manual")
    ap.add_argument("dst")
    ap.add_argument("--csv", action="append", default=[], help="名寄せ候補の売上CSV(商品名のみ使用)")
    a = ap.parse_args()
    manual = parse_manual(a.manual)
    wb = load_workbook(a.src)
    cands = []
    for p in a.csv:
        for r in read_csv_rows(p):
            if r[7] in FOOD_CATS and r[13] and r[13] not in cands:
                cands.append(r[13])
    if not a.csv:
        for sheet in ("CSV貼付A", "CSV貼付B"):
            ws = wb[sheet]
            for r in range(5, ws.max_row + 1):
                name, cat = ws[f"N{r}"].value, ws[f"H{r}"].value
                if isinstance(name, str) and name.strip() and cat in FOOD_CATS and name not in cands:
                    cands.append(name)
    n_rows, n_matched, extra = build_sheet(wb, manual, cands)
    add_guide_line(wb)
    wb.save(a.dst)
    n = restore_comment_vml(a.src, a.dst)
    ok, hidden = check_hidden_cols(a.dst)
    if not ok:
        raise SystemExit(f"非表示列が壊れています: {hidden}")
    print(f"{SHEET}: {a.dst}  (マニュアル {len(manual)}行, 商品行 {n_rows} うち名寄せ {n_matched}, "
          f"未登録の候補 {len(extra)}: {extra}, comments restored: {n})")


if __name__ == "__main__":
    main()
