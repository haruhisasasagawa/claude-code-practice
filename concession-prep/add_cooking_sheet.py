# -*- coding: utf-8 -*-
"""
店舗版 ver2.0 のワークブックに「調理時間」シートを追加する。
調理マニュアル(調理時間一覧: 商品/調理機器/条件/1個〜10個の時間/備考)を読み込み、
登録商品(期間データ!B14:B33)と売上CSVの食品名にマニュアルの項目を名寄せして転記する。
商品ごとの行には 調理機器・条件・一度に最大・回転の間隔・個数別の時間(秒) を値で持たせ(手修正OK)、
準備数計算の仕込み数から 回数・所要時間(分) を自動計算し、保持時間(期間データ)と並べて見せる。
名寄せの確からしさは 照合・備考 に「名前一致」「❓ キーワード推定」「⚠ 先頭文字の推定」で示す。
マニュアルの原本は同じシートの下段に参考として転記する。再実行するとシートは作り直される(手修正は消える)。

  python add_cooking_sheet.py <ver2.0.xlsx> <調理マニュアル.xlsx> <出力.xlsx> [--csv 売上A.csv 売上B.csv] [--sample-label]
    --csv          : 名寄せの候補にする売上・在庫・原価CSV(商品名だけ使う)。省略時はブック内の CSV貼付A/B に
                     貼られた商品名を使う(候補はプルダウンで選べる商品に限る)
    --sample-label : 説明行に「サンプル」の表記を入れる(仮数値サンプル用)
"""
import argparse
import os
import re
import sys
import unicodedata

from openpyxl import load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_tool import (BORDER_LIGHT, CHIP_NAVY, CORAL, F_AUTO, F_INPUT, F_ZEBRA, GRAY, INK,  # noqa: E402
                        NAVY, N_SLOTS, ROW_M0, ROW_P0, align, chip, disp_w, fill, fnt, note,
                        read_csv_rows, style_range, title_band)
from upgrade_v2 import (CK_MIN_COL, CK_NAME_COL, CK_ROW0, CK_ROWS, CK_SHEET,                     # noqa: E402
                        check_hidden_cols, restore_comment_vml)

SHEET = CK_SHEET
ROW_C0 = CK_ROW0                  # 商品1行目
N_ROWS = CK_ROWS                  # 商品行数(登録20枠+候補・新規用)
COUNTS = 10                       # 1〜10個(本)。マニュアルの列に合わせる
FOOD_CATS = {"ホットドッグ", "軽食系フード", "調理系スイーツ", "その他フード"}
EXCLUDE_NAME = ("ＴＣ用", "テナント用", "廃棄計上用")      # 販売商品でない振替・計上用の名前は候補から外す
COND_WORDS = ("イレギュラー", "緊急", "代替", "予備")        # 括弧内がこれなら味ではなく条件(同じ商品の別機器)
TAB_COLOR = "3AA981"
TAG = "【サンプル：数値はすべて仮の値です】"
AMBER = "B7791F"

# 列の役割(左から): No. 商品名 項目(参考) 機器 条件 最大 間隔 仕込み数 回数 所要時間 保持時間 備考 1..10個
COL_NAME, COL_LABEL, COL_MACH, COL_COND = "B", "C", "D", "E"
COL_MAX, COL_GAP, COL_NEED, COL_RUNS, COL_MIN, COL_HOLD, COL_MEMO = "F", "G", "H", "I", "J", "K", "L"
assert (COL_NAME, COL_MIN) == (CK_NAME_COL, CK_MIN_COL)   # 印刷用「調理の目安」が参照する位置
C_T0 = 13                                                        # 1個の列(M)
COL_T1, COL_TN = get_column_letter(C_T0), get_column_letter(C_T0 + COUNTS - 1)   # M..V
LAST = COL_TN
MEMO_WIDTH = 44

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
TIER_TEXT = {"exact": "名寄せ: 名前一致", "rule": "❓ 名寄せ: キーワード推定（要確認）",
             "stem": "⚠ 名寄せ: 先頭文字の推定（要確認）"}


def norm(s):
    s = unicodedata.normalize("NFKC", str(s or ""))
    return re.sub(r"[\s　・･!！\(\)（）/／]", "", s).lower()


def parse_sec(v):
    """'45秒' '1分10秒' '40～50秒' '80秒' 数値 → 秒(範囲は上限)。'調理不可'/空 → None。
    戻り値: (秒 or None, 注記, 読み取れたか)"""
    if v is None:
        return None, "", True
    if isinstance(v, (int, float)):
        return int(v), "", True
    t = unicodedata.normalize("NFKC", str(v)).strip()
    if not t or "不可" in t:
        return None, "", True
    parts = [x.strip() for x in re.split(r"[~〜～\-]", t)]
    if len(parts) > 1 and re.fullmatch(r"\d+", parts[0]):        # 「40～50秒」→ 40秒〜50秒
        parts[0] += "分" if parts[-1].endswith("分") else "秒"
    secs = []
    for p in parts:
        if re.fullmatch(r"\d+", p):
            secs.append(int(p))
            continue
        m = re.fullmatch(r"\s*(?:(\d+)分)?\s*(?:(\d+)秒)?\s*", p)
        if not m or (m.group(1) is None and m.group(2) is None):
            return None, f"読み取れない時間「{t}」", False
        secs.append(int(m.group(1) or 0) * 60 + int(m.group(2) or 0))
    if len(secs) > 1:
        return max(secs), f"{t}（上限で計算）", True
    return secs[0], "", True


def split_variants(group):
    """'ホットドッグ（A／B／C）' → ('ホットドッグ', ['A','B','C'])。括弧が無ければ (group, [group])"""
    g = str(group).strip()
    m = re.match(r"^(.*?)[（(](.*)[)）]\s*$", g)
    if not m:
        return g, [g]
    base = m.group(1).strip()
    vs = [v.strip() for v in re.split(r"[／/]", m.group(2)) if v.strip()]
    return base, vs


def parse_manual(path):
    """調理時間一覧シートを読む。戻り値: ([{group, machine, cond, times{1..COUNTS}, max, gap, note, remarks, raw}], 警告)"""
    wb = load_workbook(path, data_only=True)
    ws = wb["調理時間一覧"] if "調理時間一覧" in wb.sheetnames else wb.worksheets[0]
    head = [str(c.value or "").strip() for c in ws[1]]
    col = {h: i for i, h in enumerate(head)}
    for need in ("商品", "調理機器"):
        if need not in col:
            raise SystemExit(f"マニュアルの1行目に「{need}」列がありません: {head}")
    known = {"商品", "調理機器", "条件"} | {f"{k}個" for k in range(1, COUNTS + 1)}
    out, warns = [], []
    for ri, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row or not row[col["商品"]]:
            continue
        group = str(row[col["商品"]]).strip()
        cond = str((row[col["条件"]] if "条件" in col else "") or "").strip()
        base, vs = split_variants(group)
        if len(vs) == 1 and vs[0] != group and any(w in vs[0] for w in COND_WORDS):
            cond = f"{vs[0]}｜{cond}" if cond else vs[0]        # 「（イレギュラー時）」は同じ商品の別機器
            group = base
        rec = {"group": group, "machine": str(row[col["調理機器"]] or "").strip(), "cond": cond,
               "times": {}, "raw": {}, "remarks": []}
        for k in range(1, COUNTS + 1):
            key = f"{k}個"
            if key in col:
                sec, rem, ok = parse_sec(row[col[key]])
                rec["times"][k] = sec
                rec["raw"][k] = None if ok else str(row[col[key]])
                if rem:
                    rec["remarks"].append(f"{k}個: {rem}")
                if not ok:
                    warns.append(f"{ri}行目 {key}: 「{row[col[key]]}」を秒に読み替えられません")
        extra = [str(v).strip() for i, v in enumerate(row) if v is not None and (i >= len(head) or head[i] not in known)]
        rec["note"] = "／".join(v for v in extra if v and v != "None")
        nn = unicodedata.normalize("NFKC", rec["note"])
        m = re.search(r"(?:一度に)?最大\s*(\d+)\s*(?:個|本|枚|つ|まで)", nn)
        if m:
            rec["max"] = int(m.group(1))
        else:
            if "最大" in nn:
                warns.append(f"{ri}行目: 備考の「最大」から個数を読み取れません（{rec['note']}）")
            rec["max"] = max([k for k, s in rec["times"].items() if s is not None] or [1])
        g = re.search(r"(\d+)\s*(分|秒)\s*(?:程度|ほど)?\s*(?:空け|あけ|間隔)", nn)
        rec["gap"] = (int(g.group(1)) * (60 if g.group(2) == "分" else 1)) if g else None
        out.append(rec)
    return out, warns


def rule_for_variant(variant):
    """戻り値: (キーワード, 除外, 'rule'|'stem')。MATCH_RULESに無い項目は先頭4文字で仮に拾う"""
    nv = norm(variant)
    for name, kws, excl in MATCH_RULES:
        if norm(name) == nv or norm(name) in nv:
            return kws, excl, "rule"
    return ([[nv[:4]]] if len(nv) >= 4 else [[nv]]), [], "stem"


def match_products(manual, candidates):
    """商品名 → (マニュアルrec一覧(先頭が転記対象), 項目ラベル, tier)。同じ名前は先に見つかった項目"""
    by_group = {}
    for rec in manual:
        by_group.setdefault(rec["group"], []).append(rec)
    result = {}
    for group, recs in by_group.items():
        base, variants = split_variants(group)
        for variant in variants:
            kws, excl, how = rule_for_variant(variant)
            for name in candidates:
                n = norm(name)
                if any(norm(e) in n for e in excl):
                    continue
                if not all(any(norm(k) in n for k in alts) for alts in kws):
                    continue
                tier = "exact" if n in (norm(variant), norm(group), norm(base + variant)) else how
                label = base if base == variant else f"{base}（{variant}）"
                cur = result.get(name)
                rank = {"exact": 0, "rule": 1, "stem": 2}
                if cur is None or rank[tier] < rank[cur[2]]:
                    result[name] = (recs, label, tier)
    return result


def sec_text(sec):
    if sec is None:
        return "—"
    return f"{sec // 60}分{sec % 60}秒" if sec >= 60 and sec % 60 else (f"{sec // 60}分" if sec >= 60 else f"{sec}秒")


def short_machine(name):
    toks = name.split()
    return toks[-1] if len(toks) > 1 and re.search(r"[A-Za-z]", toks[-1]) else name


def lines_for(text, width_chars):
    return max(1, -(-int(disp_w(text)) // max(1, int(width_chars * 1.0))))


def build_sheet(wb, manual, candidates, sample_label=False):
    if SHEET in wb.sheetnames:
        del wb[SHEET]
    ws = wb.create_sheet(SHEET, index=wb.sheetnames.index("期間データ") + 1)
    ws.sheet_properties.tabColor = TAB_COLOR
    ws.sheet_view.showGridLines = False
    widths = {"A": 5, COL_NAME: 30, COL_LABEL: 26, COL_MACH: 24, COL_COND: 18, COL_MAX: 8, COL_GAP: 8,
              COL_NEED: 9, COL_RUNS: 7, COL_MIN: 11, COL_HOLD: 9, COL_MEMO: MEMO_WIDTH}
    for k in range(COUNTS):
        widths[get_column_letter(C_T0 + k)] = 6.2
    for c, w in widths.items():
        ws.column_dimensions[c].width = w
    title_band(ws, f"B1:{LAST}1", "　🍳 調理時間｜商品ごとの調理条件（マニュアルから転記・手修正OK）")
    ws.row_dimensions[1].height = 34
    desc = ("商品名はプルダウン（貼ったCSVの商品）。調理機器・条件・一度に最大・回転の間隔・個数別の時間(秒)は"
            "マニュアルの値を転記した入力セルで、そのまま書き換えられます。仕込み数は準備数計算の👉仕込み数を商品名で拾い、"
            "回数 ＝ 仕込み数 ÷ 一度に最大（切り上げ）、所要時間(分) ＝ （回数 × 「一度に最大」の個数のときの時間 ＋ "
            "（回数−1）× 回転の間隔）÷ 60。保持時間より長い所要時間は赤で示します（1台では保持時間内に作りきれない目安）。")
    if sample_label:
        desc = TAG + "　" + desc
    note(ws, f"B2:{LAST}2", desc, 9)
    ws.merge_cells(f"B2:{LAST}2")
    ws["B2"].alignment = align("left", "center", True)
    ws.row_dimensions[2].height = 42
    chip(ws, "B3:E3", "  ✏️ 黄色＝入力（手修正OK）　🔒 グレー＝自動計算　❓⚠＝名寄せ・機器の要確認", CHIP_NAVY, INK, 9)
    ws.row_dimensions[3].height = 20
    hr = ROW_C0 - 1
    hdr = {"A": "No.", COL_NAME: "商品名（プルダウンで選択）", COL_LABEL: "マニュアルの項目\n（参考・計算には使いません）",
           COL_MACH: "調理機器", COL_COND: "条件", COL_MAX: "一度に最大\n(個・本)", COL_GAP: "回転の\n間隔(秒)",
           COL_NEED: "仕込み数\n(自動)", COL_RUNS: "回数\n(自動)", COL_MIN: "所要時間\n(分・自動)",
           COL_HOLD: "保持時間\n(分・参考)", COL_MEMO: "照合・備考（手修正OK）"}
    for k in range(1, COUNTS + 1):
        hdr[get_column_letter(C_T0 - 1 + k)] = str(k)
    for c, h in hdr.items():
        ws[f"{c}{hr}"] = h
    style_range(ws, f"A{hr}:{LAST}{hr}", font=fnt(9, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws.row_dimensions[hr].height = 32
    ws[f"{COL_T1}{hr - 1}"] = "↓ 同時に調理する個数（本数）ごとの時間（秒。1分10秒 → 70。「—」＝その個数は調理不可）"
    style_range(ws, f"{COL_T1}{hr - 1}:{COL_TN}{hr - 1}", font=fnt(8.5, False, GRAY), alignment=align("left"))

    pd = wb["期間データ"]
    reg_names = []
    for i in range(N_SLOTS):
        v = pd[f"B{ROW_P0 + i}"].value
        if isinstance(v, str) and v.strip():
            reg_names.append(v)
    cands = [c for c in candidates if not any(x in c for x in EXCLUDE_NAME)]
    matched = match_products(manual, list(dict.fromkeys(reg_names + cands)))
    extra = [n for n in cands if n in matched and n not in reg_names]
    unmatched = [n for n in cands if n not in matched and n not in reg_names]
    rows = [(n, True) for n in reg_names] + [(n, False) for n in extra]
    dropped = [n for n, _ in rows[N_ROWS:]]
    rows = rows[:N_ROWS]
    n_flag = 0

    first, lastrow = ROW_C0, ROW_C0 + N_ROWS - 1
    for k in range(N_ROWS):
        r = ROW_C0 + k
        name, is_reg = rows[k] if k < len(rows) else (None, False)
        ws[f"A{r}"] = k + 1
        ws[f"{COL_NAME}{r}"] = name
        memo = []
        if name and name in matched:
            recs, label, tier = matched[name]
            rec = recs[0]
            ws[f"{COL_LABEL}{r}"] = label
            ws[f"{COL_MACH}{r}"] = rec["machine"]
            ws[f"{COL_COND}{r}"] = rec["cond"]
            for kk in range(1, COUNTS + 1):
                sec = rec["times"].get(kk)
                ws.cell(row=r, column=C_T0 - 1 + kk, value=sec if sec is not None else ("?" if rec["raw"].get(kk) else "—"))
            ws[f"{COL_MAX}{r}"] = rec["max"]
            ws[f"{COL_GAP}{r}"] = rec["gap"]
            memo.append(TIER_TEXT[tier] + ("" if is_reg else "（未登録の候補）"))
            if len(recs) > 1:
                alts = "／".join(f"{short_machine(x['machine'])}: " +
                                 "/".join(sec_text(x["times"].get(kk)) for kk in range(1, min(COUNTS, x["max"]) + 1))
                                 for x in recs[1:])
                memo.append(f"⚠ 機器は要確認（他: {alts}）")
            if rec["remarks"]:
                memo.append("；".join(rec["remarks"]))
            if rec["note"] and not re.search(r"最大", unicodedata.normalize("NFKC", rec["note"])):
                memo.append(rec["note"])
            if tier != "exact" or len(recs) > 1:
                n_flag += 1
        elif name:
            memo.append("⚠ マニュアルに該当する項目なし → 調理機器・時間・一度に最大を手入力")
            n_flag += 1
        text = "｜".join(memo) if memo else None
        ws[f"{COL_MEMO}{r}"] = text
        need_rng = f"準備数計算!$C${ROW_M0}:$C${ROW_M0 + N_SLOTS - 1}"
        g_rng = f"準備数計算!$G${ROW_M0}:$G${ROW_M0 + N_SLOTS - 1}"
        ws[f"{COL_NEED}{r}"] = (f'=IF(${COL_NAME}{r}="","",IF(ISNA(MATCH(${COL_NAME}{r},{need_rng},0)),"未登録",'
                                f'INDEX({g_rng},MATCH(${COL_NAME}{r},{need_rng},0))))')
        ws[f"{COL_RUNS}{r}"] = (f'=IF(${COL_NAME}{r}="","",IF(NOT(ISNUMBER(${COL_NEED}{r})),"",'
                                f'IF(NOT(ISNUMBER(${COL_MAX}{r})),"⚠ 最大未入力",IF(${COL_MAX}{r}<=0,"⚠ 最大",'
                                f'IF(${COL_MAX}{r}>{COUNTS},"⚠ 最大は{COUNTS}まで",ROUNDUP(${COL_NEED}{r}/${COL_MAX}{r},0))))))')
        tsel = f'INDEX(${COL_T1}{r}:${COL_TN}{r},1,${COL_MAX}{r})'
        gap = f'IF(ISNUMBER(${COL_GAP}{r}),${COL_GAP}{r},0)'
        ws[f"{COL_MIN}{r}"] = (f'=IF(OR(${COL_NAME}{r}="",NOT(ISNUMBER(${COL_RUNS}{r}))),"",'
                               f'IF(NOT(ISNUMBER({tsel})),"⚠ その個数は不可／時間なし",'
                               f'(${COL_RUNS}{r}*{tsel}+MAX(0,${COL_RUNS}{r}-1)*{gap})/60))')
        hold_rng = f"期間データ!$E${ROW_P0}:$E${ROW_P0 + N_SLOTS - 1}"
        name_rng = f"期間データ!$B${ROW_P0}:$B${ROW_P0 + N_SLOTS - 1}"
        ws[f"{COL_HOLD}{r}"] = (f'=IF(${COL_NAME}{r}="","",IFERROR(IF(ISNUMBER(INDEX({hold_rng},MATCH(${COL_NAME}{r},{name_rng},0))),'
                                f'INDEX({hold_rng},MATCH(${COL_NAME}{r},{name_rng},0)),"—"),"—"))')
        zebra = F_ZEBRA if k % 2 else "FFFFFF"
        nl = max(lines_for(text or "", MEMO_WIDTH), lines_for(ws[f"{COL_LABEL}{r}"].value or "", 26))
        ws.row_dimensions[r].height = 19 if nl <= 1 else 13 * nl + 6
        style_range(ws, f"A{r}", font=fnt(9, False, GRAY), fl=fill(zebra), alignment=align("center"), border=BORDER_LIGHT)
        style_range(ws, f"{COL_NAME}{r}", font=fnt(9.5), fl=fill(F_INPUT), alignment=align("left"), border=BORDER_LIGHT)
        style_range(ws, f"{COL_LABEL}{r}", font=fnt(8.5, False, GRAY), fl=fill(zebra), alignment=align("left", "center", True), border=BORDER_LIGHT)
        style_range(ws, f"{COL_MACH}{r}:{COL_GAP}{r}", font=fnt(9.5), fl=fill(F_INPUT), alignment=align("left"), border=BORDER_LIGHT)
        style_range(ws, f"{COL_MAX}{r}:{COL_GAP}{r}", font=fnt(9.5), fl=fill(F_INPUT), alignment=align("center"), border=BORDER_LIGHT, num="0")
        style_range(ws, f"{COL_NEED}{r}:{COL_RUNS}{r}", font=fnt(9.5), fl=fill(F_AUTO), alignment=align("center"), border=BORDER_LIGHT, num="0")
        style_range(ws, f"{COL_MIN}{r}", font=fnt(10, True, CORAL), fl=fill(F_AUTO), alignment=align("center"), border=BORDER_LIGHT, num='0.0"分"')
        style_range(ws, f"{COL_HOLD}{r}", font=fnt(9.5, False, "5B6472"), fl=fill(F_AUTO), alignment=align("center"), border=BORDER_LIGHT, num='0"分"')
        style_range(ws, f"{COL_MEMO}{r}", font=fnt(8.5, False, "5B6472"), fl=fill("FFFBEB"), alignment=align("left", "center", True), border=BORDER_LIGHT)
        style_range(ws, f"{COL_T1}{r}:{COL_TN}{r}", font=fnt(9.5), fl=fill(F_INPUT), alignment=align("center"), border=BORDER_LIGHT, num='0"秒"')
    tr = lastrow + 1
    ws[f"{COL_NAME}{tr}"] = "単純合計（機器が違えば並行して作れる）"
    ws[f"{COL_NEED}{tr}"] = f'=IF(COUNT({COL_NEED}{first}:{COL_NEED}{lastrow})=0,"",SUM({COL_NEED}{first}:{COL_NEED}{lastrow}))'
    ws[f"{COL_MIN}{tr}"] = f'=IF(COUNT({COL_MIN}{first}:{COL_MIN}{lastrow})=0,"",SUM({COL_MIN}{first}:{COL_MIN}{lastrow}))'
    style_range(ws, f"{COL_NAME}{tr}:{COL_GAP}{tr}", font=fnt(9.5, True), alignment=align("right"))
    style_range(ws, f"{COL_NEED}{tr}", font=fnt(9.5, True), alignment=align("center"), num="0")
    style_range(ws, f"{COL_MIN}{tr}", font=fnt(10, True, CORAL), alignment=align("center"), num='0.0"分"')
    # 機器ごとの合計(同じ機器の商品は順番に作るので、こちらが実際の目安)
    machines = list(dict.fromkeys(rec["machine"] for rec in manual if rec["machine"]))
    mr0 = tr + 2
    chip(ws, f"{COL_NAME}{mr0}:{COL_COND}{mr0}", "  ⏱ 機器ごとの合計所要時間（同じ機器の商品は順番に作るため、こちらが実際の目安）", CHIP_NAVY, INK, 9.5)
    mr = mr0
    for mach in machines + [None]:
        mr += 1
        ws[f"{COL_MACH}{mr}"] = mach
        ws[f"{COL_NAME}{mr}"] = "機器（上の表の調理機器と同じ表記）" if mach is None else None
        ws[f"{COL_MIN}{mr}"] = (f'=IF(${COL_MACH}{mr}="","",IF(COUNTIF(${COL_MACH}${first}:${COL_MACH}${lastrow},${COL_MACH}{mr})=0,"—",'
                                f'SUMIF(${COL_MACH}${first}:${COL_MACH}${lastrow},${COL_MACH}{mr},${COL_MIN}${first}:${COL_MIN}${lastrow})))')
        ws[f"{COL_NEED}{mr}"] = (f'=IF(${COL_MACH}{mr}="","",SUMIF(${COL_MACH}${first}:${COL_MACH}${lastrow},${COL_MACH}{mr},'
                                 f'${COL_NEED}${first}:${COL_NEED}${lastrow}))')
        style_range(ws, f"{COL_NAME}{mr}", font=fnt(8.5, False, GRAY), alignment=align("right"))
        style_range(ws, f"{COL_MACH}{mr}:{COL_COND}{mr}", font=fnt(9.5), fl=fill(F_INPUT), alignment=align("left"), border=BORDER_LIGHT)
        style_range(ws, f"{COL_NEED}{mr}", font=fnt(9.5), fl=fill(F_AUTO), alignment=align("center"), border=BORDER_LIGHT, num="0")
        style_range(ws, f"{COL_MIN}{mr}", font=fnt(10, True, CORAL), fl=fill(F_AUTO), alignment=align("center"), border=BORDER_LIGHT, num='0.0"分"')
    ws[f"{COL_HOLD}{mr0 + 1}"] = "← 1台あたり。複数台なら台数で割る"
    style_range(ws, f"{COL_HOLD}{mr0 + 1}:{COL_MEMO}{mr0 + 1}", font=fnt(8.5, False, GRAY), alignment=align("left"))
    MACH_ROW0 = mr0 + 1
    nr = mr + 1
    lines = ["※ 所要時間は「一度に最大」の個数で回し続けた場合の調理時間です（仕込み・盛り付けの手間は含みません）。"
             "同じ商品でも機器で時間が違うので、備考の他機種の時間（下段の原本にも）を見て使う機器に合わせて "
             "調理機器・時間・一度に最大・備考 を書き換えてください。名寄せの ❓⚠ は確認したら消してOKです。",
             "※ 所要時間が保持時間より長い商品（赤い背景）は、1台で作り切るとピーク前に最初の分が保持時間を超えます。"
             "台数を増やすか、何回かに分けてピークに向けて作る目安にしてください。"]
    if unmatched:
        lines.append("※ マニュアルに項目が無いCSVの食品（必要なら商品名を選んで手入力）: " + "、".join(unmatched))
    if dropped:
        lines.append("※ 行数の上限(30)で載せられなかった候補: " + "、".join(dropped))
    for t in lines:
        note(ws, f"{COL_NAME}{nr}:{LAST}{nr}", t, 8.5)
        ws.merge_cells(f"{COL_NAME}{nr}:{LAST}{nr}")
        ws[f"{COL_NAME}{nr}"].alignment = align("left", "center", True)
        ws.row_dimensions[nr].height = 14 * lines_for(t, 200) + 4
        nr += 1

    dv = DataValidation(type="list", formula1="商品リスト", allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add(f"{COL_NAME}{first}:{COL_NAME}{lastrow}")
    dv2 = DataValidation(type="whole", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                         showErrorMessage=True, errorTitle="時間／個数", error="秒または個数を整数で入力してください（1分10秒 → 70）。調理不可の個数は空欄か「—」")
    ws.add_data_validation(dv2)
    dv2.add(f"{COL_MAX}{first}:{COL_GAP}{lastrow}")
    dv3 = DataValidation(type="custom", formula1=f'OR(ISNUMBER({COL_T1}{first}),{COL_T1}{first}="—",{COL_T1}{first}="")',
                         allow_blank=True, showErrorMessage=True, errorTitle="時間",
                         error="秒を整数で入力してください（1分10秒 → 70）。調理不可の個数は「—」")
    ws.add_data_validation(dv3)
    dv3.add(f"{COL_T1}{first}:{COL_TN}{lastrow}")
    ws.conditional_formatting.add(f"{COL_NEED}{first}:{COL_MIN}{lastrow}",
                                  FormulaRule(formula=[f'OR(LEFT(${COL_NEED}{first},1)="—",${COL_NEED}{first}="未登録")'], font=Font(color=GRAY)))
    ws.conditional_formatting.add(f"{COL_RUNS}{first}:{COL_MEMO}{lastrow}",
                                  FormulaRule(formula=[f'ISNUMBER(SEARCH("⚠",{COL_RUNS}{first}))'], font=Font(color=CORAL, bold=True)))
    ws.conditional_formatting.add(f"{COL_MEMO}{first}:{COL_MEMO}{lastrow}",
                                  FormulaRule(formula=[f'ISNUMBER(SEARCH("❓",{COL_MEMO}{first}))'], font=Font(color=AMBER, bold=True)))
    ws.conditional_formatting.add(f"{COL_MIN}{first}:{COL_MIN}{lastrow}",
                                  FormulaRule(formula=[f'AND(ISNUMBER(${COL_MIN}{first}),ISNUMBER(${COL_HOLD}{first}),${COL_MIN}{first}>${COL_HOLD}{first})'],
                                              fill=PatternFill("solid", start_color="FCE7E2", end_color="FCE7E2")))

    # ---- マニュアルの原本(参考) ----
    r0 = nr + 1
    chip(ws, f"{COL_NAME}{r0}:{COL_COND}{r0}", "  📖 調理マニュアル（原本からの転記・参考。行の追加OK）", CHIP_NAVY, INK, 9.5)
    hr2 = r0 + 1
    ws[f"{COL_NAME}{hr2}"] = "調理機器"
    ws.merge_cells(f"{COL_LABEL}{hr2}:{COL_COND}{hr2}")
    ws[f"{COL_LABEL}{hr2}"] = "マニュアルの項目｜条件"
    ws[f"{COL_MAX}{hr2}"] = "一度に\n最大"
    ws[f"{COL_GAP}{hr2}"] = "間隔\n(秒)"
    ws.merge_cells(f"{COL_NEED}{hr2}:{COL_MEMO}{hr2}")
    ws[f"{COL_NEED}{hr2}"] = "備考（同時調理数など）"
    for kk in range(1, COUNTS + 1):
        ws.cell(row=hr2, column=C_T0 - 1 + kk, value=str(kk))
    style_range(ws, f"{COL_NAME}{hr2}:{LAST}{hr2}", font=fnt(9, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws.row_dimensions[hr2].height = 30
    rr = hr2
    for rec in manual:
        rr += 1
        ws.row_dimensions[rr].height = 18
        ws[f"{COL_NAME}{rr}"] = rec["machine"]
        ws.merge_cells(f"{COL_LABEL}{rr}:{COL_COND}{rr}")
        ws[f"{COL_LABEL}{rr}"] = rec["group"] + (f"｜{rec['cond']}" if rec["cond"] else "")
        for kk in range(1, COUNTS + 1):
            sec = rec["times"].get(kk)
            ws.cell(row=rr, column=C_T0 - 1 + kk, value=sec if sec is not None else ("?" if rec["raw"].get(kk) else "—"))
        ws[f"{COL_MAX}{rr}"] = rec["max"]
        ws[f"{COL_GAP}{rr}"] = rec["gap"]
        ws.merge_cells(f"{COL_NEED}{rr}:{COL_MEMO}{rr}")
        ws[f"{COL_NEED}{rr}"] = "；".join([x for x in [rec["note"]] + rec["remarks"] if x]) or None
        style_range(ws, f"{COL_NAME}{rr}:{LAST}{rr}", font=fnt(9), fl=fill(F_ZEBRA if (rr - hr2) % 2 else "FFFFFF"),
                    alignment=align("left"), border=BORDER_LIGHT)
        style_range(ws, f"{COL_MAX}{rr}:{COL_GAP}{rr}", font=fnt(9), alignment=align("center"), num="0")
        style_range(ws, f"{COL_T1}{rr}:{COL_TN}{rr}", font=fnt(9), alignment=align("center"), num='0"秒"')
    note(ws, f"{COL_NAME}{rr + 1}:{LAST}{rr + 1}",
         "※ 「—」＝その個数での同時調理は不可（マニュアル記載）。「?」＝読み取れなかった表記（原本を確認）。範囲のある時間は上限で転記。"
         "「間隔」は備考の「○分空ける」から。", 8.5)
    ws.freeze_panes = f"{COL_LABEL}{ROW_C0}"
    ws.print_area = f"A1:{LAST}{rr + 1}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = 9
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    return {"rows": len(rows), "matched": sum(1 for n, _ in rows if n in matched), "extra": [n for n, _ in rows if n not in reg_names],
            "unmatched": unmatched, "dropped": dropped, "flagged": n_flag, "machines": machines, "mach_row0": MACH_ROW0}


GUIDE_LINE = ("・調理時間（シート）：調理マニュアルの機器・個数別の時間・一度に最大を商品ごとに転記した表です（手修正OK）。"
              "準備数計算の仕込み数から 回数と所要時間（分）を自動で出し、保持時間と比べられます。新商品は商品名をプルダウンで選び、"
              "下段のマニュアル原本を見て時間を入れてください。備考の ❓⚠ は名寄せや機器の要確認です。")


def add_guide_line(wb):
    """使い方の末尾に調理時間の案内を1行足す(すでにあれば書き換えるだけ)"""
    g = wb["使い方"]
    target = None
    for row in g.iter_rows(min_col=3, max_col=3):
        c = row[0]
        if isinstance(c.value, str) and c.value.startswith("・調理時間（シート）"):
            target = c.row
    if target is None:
        r = g.max_row
        while r > 1 and g[f"C{r}"].value is None:
            r -= 1
        target = r + 1
    nl = max(1, -(-int(disp_w(GUIDE_LINE) * 2) // 100))
    g.row_dimensions[target].height = 15 * nl + 5
    note(g, f"C{target}:J{target}", GUIDE_LINE, 9.5, INK, wrap=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("manual")
    ap.add_argument("dst")
    ap.add_argument("--csv", nargs="+", action="extend", default=[], help="名寄せ候補の売上CSV(商品名のみ使用。複数可)")
    ap.add_argument("--sample-label", action="store_true", help="説明行にサンプルの表記を入れる")
    a = ap.parse_args()
    manual, warns = parse_manual(a.manual)
    for w in warns:
        print("⚠ マニュアル:", w)
    wb = load_workbook(a.src)
    cands = []
    for p in a.csv:
        for r in read_csv_rows(p):
            if r[7] in FOOD_CATS and isinstance(r[13], str) and r[13] not in cands:
                cands.append(r[13])
    if not a.csv:
        for sheet in ("CSV貼付A", "CSV貼付B"):
            ws = wb[sheet]
            for r in range(5, ws.max_row + 1):
                name, cat = ws[f"N{r}"].value, ws[f"H{r}"].value
                if isinstance(name, str) and name.strip() and cat in FOOD_CATS and name not in cands:
                    cands.append(name)
    info = build_sheet(wb, manual, cands, sample_label=a.sample_label)
    add_guide_line(wb)
    wb.save(a.dst)
    n = restore_comment_vml(a.src, a.dst)
    ok, hidden = check_hidden_cols(a.dst)
    if not ok:
        raise SystemExit(f"非表示列が壊れています: {hidden}")
    print(f"{SHEET}: {a.dst}  (マニュアル {len(manual)}行, 商品行 {info['rows']} うち名寄せ {info['matched']}, "
          f"要確認 {info['flagged']}, 未登録の候補 {len(info['extra'])}: {info['extra']}, comments restored: {n})")
    if info["unmatched"]:
        print("  マニュアルに項目が無いCSVの食品:", info["unmatched"])
    if info["dropped"]:
        print("  ⚠ 行数上限で載せられなかった候補:", info["dropped"])


if __name__ == "__main__":
    main()
