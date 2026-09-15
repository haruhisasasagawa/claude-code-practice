# -*- coding: utf-8 -*-
"""
店舗版 ver1.1 のワークブックを読み込み、v2.0 の拡張機能を当てる更新スクリプト。
店舗側のカスタマイズ(時間帯設定の自動化・営業時間・切り捨て・商品登録・文言)は
そのまま残し、以下だけを追加する。

  ⑤ 事前準備率     … 準備数計算!D8(整数%・既定100)。仕込み数 ＝ 販売予測数 × 率
  販売予測数/仕込み数 … 準備数計算のF列(予測)とG列(👉 仕込み数)に分離。印刷用は仕込み数
  保持時間・優先     … 期間データに 保持時間(分)・優先(手動) の入力列と基準値(E12)。
                       準備数計算に 保持時間・優先 列(自動)。印刷用に表示切替
                       (すべて/優先:高のみ/優先:低のみ)と優先マーク列
  バグ修正           … 期間A状態表示(期間データ!B7)への参照ズレ(旧G4)を修正

使い方:
  python upgrade_v2.py <ver1.1.xlsx> <出力.xlsx>
"""
import re
import sys
import zipfile
from copy import copy

from openpyxl import load_workbook
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, OneCellAnchor
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.formatting.formatting import ConditionalFormattingList
from openpyxl.formatting.rule import DataBarRule, FormulaRule
from openpyxl.styles import Border, Font
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.dimensions import ColumnDimension

from build_tool import (BORDER_HAIR, BORDER_INPUT, BORDER_LIGHT, CHIP_CORAL, CHIP_NAVY,
                        CORAL, FONT_NAME, F_AUTO, F_BASE, F_INPUT, F_ZEBRA, GRAY, INK,
                        NAVY, RED, N_SLOTS, ROW_M0, ROW_P0, align, chip, coral_side,
                        disp_w, fill, fnt, hair, mk_comment, note, show_paste_comments,
                        style_range, thin)

VIEW_ALL, VIEW_HI, VIEW_LO = "すべて", "優先:高のみ", "優先:低のみ"
HT_THR_DEFAULT = 30          # 優先「高」とみなす保持時間(分)の既定値
EXPLODE_MAX = 40             # 列書式の束を1列ずつに分解する上限列(AN列まで)
RATE = 'IF(AND(ISNUMBER($D$8),$D$8>0),$D$8,100)'   # 事前準備率(未入力・0以下は100%扱い)
VIEW_CELL = '印刷用!$G$2'                             # 印刷用の表示切替セル
PEAK_START, PEAK_END = '$O$5', '$O$6'                 # ⑥ ピーク時間(準備数計算)
CALC_LAST_COL = 'Q'                                   # 準備数計算の表の右端列


def ftext(cell):
    """通常の数式/配列数式のどちらでも数式文字列を返す"""
    v = cell.value
    return v.text if hasattr(v, "text") else v


def explode_column_groups(ws):
    """<col min max> で束ねられた列書式を1列ずつに分解する。openpyxlは束の先頭列
    しか辞書に持たないため、隣の列に幅を設定すると束と重なって非表示が壊れる"""
    cd = ws.column_dimensions
    for key in list(cd.keys()):
        d = cd[key]
        if d.min and d.max and d.max > d.min:
            attrs = dict(width=d.width, hidden=d.hidden, customWidth=d.customWidth,
                         outlineLevel=d.outlineLevel, collapsed=d.collapsed)
            style_arr = copy(d._style)
            del cd[key]
            # 末尾の「〜16384列」の束は編集対象になりうる先頭だけ1列ずつにし、残りは束のまま
            # (全部展開すると<col>が1万6千個になりファイルが肥大化する)
            head_max = min(d.max, max(d.min, EXPLODE_MAX))
            for ci in range(d.min, head_max + 1):
                letter = get_column_letter(ci)
                nd = ColumnDimension(ws, index=letter, **attrs)
                nd._style = copy(style_arr)
                cd[letter] = nd
            if head_max < d.max:
                tail = get_column_letter(head_max + 1)
                nd = ColumnDimension(ws, index=tail, **attrs)
                nd.min, nd.max = head_max + 1, d.max
                nd._style = copy(style_arr)
                cd[tail] = nd
    if any((dd.outlineLevel or 0) > 0 for dd in cd.values()):
        ws.sheet_format.outlineLevelCol = max(dd.outlineLevel or 0 for dd in cd.values())


def _col_px(ws, ci):
    """0始まり列番号 → 表示幅(px)の見積もり"""
    w = ws.column_dimensions[get_column_letter(ci + 1)].width or 8.43
    return int(w * 7 + 5)


def move_title_logo(ws, target_col, right_edge_col):
    """行1(タイトル帯)の画像(店舗ロゴ)を帯の新しい右端へ寄せる。
    2セルアンカーは列幅に追従して伸縮するため、現在の表示サイズを見積もって
    1セルアンカー(固定サイズ)に置き換える"""
    for im in getattr(ws, "_images", []):
        a = im.anchor
        fr = getattr(a, "_from", None)
        if fr is None or fr.row != 0:
            continue
        to = getattr(a, "to", None)
        if to is not None:
            width_px = (sum(_col_px(ws, c) for c in range(fr.col, to.col))
                        - fr.colOff / 9525 + to.colOff / 9525)
            height_px = (to.rowOff - fr.rowOff) / 9525
            if to.row > fr.row:
                height_px += sum((ws.row_dimensions[r + 1].height or 15) * 96 / 72
                                 for r in range(fr.row, to.row))
        else:
            width_px, height_px = a.ext.width / 9525, a.ext.height / 9525
        avail = sum(_col_px(ws, c) for c in range(target_col, right_edge_col + 1))
        off_px = max(0, avail - width_px - 6)
        im.anchor = OneCellAnchor(
            _from=AnchorMarker(col=target_col, colOff=int(off_px * 9525), row=0, rowOff=fr.rowOff),
            ext=XDRPositiveSize2D(int(width_px * 9525), int(height_px * 9525)))


def navy_header(ws, ref, text, size=9.5):
    style_range(ws, ref, font=fnt(size, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws[ref.split(":")[0]] = text


# ============================================================ 準備数計算 =====
def upgrade_calc(ws):
    explode_column_groups(ws)
    ws["B1"] = "　🍿 準備数計算｜ピーク前の仕込み数（販売予測数 × 事前準備率）"
    # 表が右へ広がるので、タイトル帯・説明行も同じ幅に(帯の右端のロゴも右端へ)。
    # 警告行(B9:H9)は塗りが無いので伸ばさない(非表示M列のヘルパーM9が結合に飲まれるため)
    for r_ in (1, 2):
        ws.unmerge_cells(f"B{r_}:H{r_}")
        ws.merge_cells(f"B{r_}:{CALC_LAST_COL}{r_}")
    style_range(ws, f"B1:{CALC_LAST_COL}1", fl=fill(NAVY))
    style_range(ws, "B9:H9", font=fnt(8.5, True, RED), alignment=align("left", wrap=True))
    move_title_logo(ws, 14, 16)                   # O〜Q列の右端へ
    ws["B2"] = ("参照期間(A/B)の購買率 × ピーク動員数 × 係数（時間帯／商品別の波）で「販売予測数」を出し、"
                "⑤事前準備率を掛けた「👉 仕込み数」を自動計算します")

    # ⑤ 事前準備率(既定100%)。行8は空き行だったのでそのまま使う
    ws.row_dimensions[8].height = 24
    chip(ws, "B8:C8", "  ⑤ 事前準備率", CHIP_CORAL, INK, 10)
    ws["D8"] = 100
    style_range(ws, "D8", font=fnt(10.5, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT, num='0"%"')
    ws["D8"].comment = mk_comment("販売予測数の何％を仕込むかを整数で入力します（100＝予測どおり）。"
                                  "控えめにしたい日は80、先週より動員が多い日は120のように。"
                                  "1〜200の範囲。「👉 仕込み数」列と印刷用に反映され、"
                                  "販売予測数そのものは変わりません。")
    ws.merge_cells("E8:H8")
    ws["E8"] = (f'="→ 販売予測数 × "&{RATE}&"% ＝ 仕込み数'
                '（80で控えめ／120で多め）"')
    style_range(ws, "E8:H8", font=fnt(9, False, GRAY), alignment=align("left"))
    dv_rate = DataValidation(type="whole", operator="between", formula1="1", formula2="200",
                             showErrorMessage=True)
    dv_rate.error = "事前準備率は 1〜200 の整数で入力してください（100＝予測どおり）"
    dv_rate.errorTitle = "事前準備率"
    ws.add_data_validation(dv_rate)
    dv_rate.add("D8")

    # 配列数式で保存されていた表示式は通常の数式に戻す(動作は同じ)
    ws["E7"] = ftext(ws["E7"])

    # ⑥ ピーク時間(入力ブロックの右・新列の上)。保持時間と組み合わせて
    # 「仕込み開始の目安 ＝ ピーク開始 − 保持時間」を商品ごとに出す
    chip(ws, "N4:Q4", "  ⑥ ピーク時間", CHIP_CORAL, INK, 10)
    note(ws, "N5", "開始", 9, GRAY, h="right")
    note(ws, "N6", "終了", 9, GRAY, h="right")
    for ref in ("O5", "O6"):
        style_range(ws, ref, font=fnt(10.5, True), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT, num="h:mm")
    note(ws, "P5:Q5", "← 17:30 のように", 8, GRAY)
    note(ws, "P6:Q6", "（終了は目安表示用）", 8, GRAY)
    note(ws, "N7:Q7", "→ 仕込み開始の目安 ＝ 開始 − 保持時間（右端の列）", 8, GRAY)
    ws["O5"].comment = mk_comment("これから準備するピークの開始時刻を 17:30 のように入力します。"
                                  "商品ごとの「仕込み開始(目安)」＝この時刻 − 保持時間 になり、"
                                  "印刷用は開始の早い順に並びます。未入力なら優先 高→低 の並びです。")
    dv_time = DataValidation(type="decimal", operator="between", formula1="0", formula2="2",
                             showErrorMessage=True)
    dv_time.error = "17:30 のように時刻で入力してください（翌日は 25:30 のように24時間超えも可）"
    dv_time.errorTitle = "ピーク時間"
    ws.add_data_validation(dv_time)
    dv_time.add("O5:O6")

    # 期間A状態表示の参照ズレ修正(店舗版はG4→B7へ移動済みだが参照が旧G4のまま)
    b9 = (ftext(ws["B9"]).replace("期間データ!$G$4", "期間データ!$B$7")
          .replace("G列「比較期間（参考）」", "N列「比較期間（参考）」")
          .replace("作る数は0扱いです", "販売予測数・仕込み数は0扱いです"))
    assert b9.rstrip().endswith("))"), "B9の末尾が想定外"
    b9 = (b9.rstrip()[:-1] +
          '&" "&IF(OR($D$8="",NOT(ISNUMBER($D$8)),$D$8<=0),'
          '"⚠ 事前準備率が未入力か0以下です（100%扱い）。","")'
          '&" "&IF(AND(ISNUMBER($D$8),$D$8>0,OR($D$8>200,$D$8<>INT($D$8))),'
          '"⚠ 事前準備率が想定外の値です（1〜200の整数で入力。入力値のまま計算中）。","")'
          f'&" "&IF(AND({PEAK_START}<>"",NOT(ISNUMBER({PEAK_START}))),'
          '"⚠ ピーク時間（開始）が時刻ではありません（17:30 のように入力）。",""))')
    ws["B9"] = b9
    if ws["D7"].comment and "作る数を計算" in ws["D7"].comment.text:
        ws["D7"].comment = mk_comment(ws["D7"].comment.text.replace("作る数を計算", "販売予測数を計算"))
    if ws["M10"].value:
        ws["M10"] = ftext(ws["M10"]).replace("期間データ!$G$4", "期間データ!$B$7")

    # 表ヘッダー: F=販売予測数 / G=👉仕込み数(強調) / H=商品係数 / N=比較期間 / O=保持時間 / P=優先
    navy_header(ws, "F10", "販売予測数")
    style_range(ws, "G10", font=fnt(11, True, "FFFFFF"), fl=fill(CORAL),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws["G10"] = "👉 仕込み数\n(この数を準備)"
    navy_header(ws, "N10", "比較期間\n（参考）")
    navy_header(ws, "O10", "保持時間\n(分)")
    navy_header(ws, "P10", "優先")
    navy_header(ws, "Q10", "仕込み開始\n(目安)")
    for c, w in {"F": 14, "G": 16, "N": 13, "O": 9, "P": 8, "Q": 9}.items():
        ws.column_dimensions[c].width = w

    for i in range(N_SLOTS):
        r = ROW_M0 + i
        dr = ROW_P0 + i
        f_formula = ftext(ws[f"F{r}"])
        cmp_formula = ftext(ws[f"G{r}"])            # 旧G=比較期間(参考) → N列へ
        # 仕込み数 ＝ 販売予測数の式に事前準備率を掛ける(端数処理は店舗設定のまま)
        g_formula, n_sub = re.subn(r"(ROUND(?:UP|DOWN)?\(\$D\$5\*\$E\d+\*)",
                                   lambda mo: mo.group(1) + RATE + "/100*", f_formula)
        assert n_sub == 1, f"F{r}の式に想定の形が見つかりません"
        ws[f"G{r}"] = g_formula
        ws[f"N{r}"] = cmp_formula
        ws[f"O{r}"] = f'=IF($C{r}="","",IF(ISNUMBER(期間データ!E{dr}),期間データ!E{dr},"—"))'
        # 手動は 高/低 だけを受け付け(前後の空白は無視)、それ以外は自動判定へ
        ws[f"P{r}"] = (f'=IF($C{r}="","",IF(TRIM(期間データ!F{dr})="高","高",'
                       f'IF(TRIM(期間データ!F{dr})="低","低",'
                       f'IF(NOT(ISNUMBER(期間データ!E{dr})),"—",'
                       f'IF(期間データ!E{dr}<=IF(ISNUMBER(期間データ!$E$12),期間データ!$E$12,'
                       f'{HT_THR_DEFAULT}),"高","低")))))')
        # 仕込み開始の目安: K列(非表示)に未補正の時刻シリアル(前日側なら負)、Q列に表示用(h:mm)
        ws[f"K{r}"] = (f'=IF(OR($C{r}="",{PEAK_START}="",NOT(ISNUMBER({PEAK_START})),'
                       f'NOT(ISNUMBER(期間データ!E{dr}))),"",{PEAK_START}-期間データ!E{dr}/1440)')
        style_range(ws, f"K{r}", font=fnt(8.5, False, GRAY), alignment=align("center"))
        ws[f"Q{r}"] = f'=IF($C{r}="","",IF($K{r}="","—",MOD($K{r},1)))'
        # 印刷用の並び順キー(非表示L列): ピーク入力時は仕込み開始の早い順(未定は最後)、
        # 未入力時は 高→低。高のみ/低のみは絞り込み(高のみには未入力の—も含む)
        k = i + 1
        tkey = f'IF($K{r}="",9999900+{k},(ROUND($K{r}*1440,0)+10000)*100+{k})'
        no_peak = f'OR({PEAK_START}="",NOT(ISNUMBER({PEAK_START})))'
        ws[f"L{r}"] = (f'=IF($C{r}="","",IF({VIEW_CELL}="{VIEW_HI}",'
                       f'IF($P{r}="低","",IF({no_peak},{k},{tkey})),'
                       f'IF({VIEW_CELL}="{VIEW_LO}",IF($P{r}="低",IF({no_peak},{k},{tkey}),""),'
                       f'IF({no_peak},IF($P{r}="低",100+{k},{k}),{tkey}))))')
        style_range(ws, f"L{r}", font=fnt(8.5, False, GRAY), alignment=align("center"))

        zebra = fill(F_ZEBRA) if i % 2 else None
        style_range(ws, f"F{r}", font=fnt(11, True, INK), fl=zebra,
                    alignment=align("center"), num="#,##0", border=BORDER_HAIR)
        style_range(ws, f"G{r}", font=fnt(13, True, CORAL), fl=fill(F_BASE),
                    alignment=align("center"), num="#,##0",
                    border=Border(bottom=hair, left=coral_side, right=coral_side))
        style_range(ws, f"N{r}", font=fnt(9, False, GRAY), fl=zebra,
                    alignment=align("center"), num="0.0%", border=BORDER_HAIR)
        style_range(ws, f"O{r}", font=fnt(9, False, GRAY), fl=zebra,
                    alignment=align("center"), num='0"分"', border=BORDER_HAIR)
        style_range(ws, f"P{r}", font=fnt(9.5, True, INK), fl=zebra,
                    alignment=align("center"), border=BORDER_HAIR)
        style_range(ws, f"Q{r}", font=fnt(9.5, True, INK), fl=zebra,
                    alignment=align("center"), border=BORDER_HAIR, num="h:mm")
    last = ROW_M0 + N_SLOTS - 1
    ws[f"G{last}"].border = Border(bottom=coral_side, left=coral_side, right=coral_side)

    f11 = ftext(ws[f"F{ROW_M0}"])
    rounding = ("切り捨て" if "ROUNDDOWN(" in f11 else
                "切り上げ" if "ROUNDUP(" in f11 else "四捨五入")
    ws.unmerge_cells(f"B{last + 1}:H{last + 1}")
    ws.row_dimensions[last + 1].height = 30
    note(ws, f"B{last + 1}:{CALC_LAST_COL}{last + 1}",
         f"※ 販売予測数 ＝ ピーク動員数 × 購買率 × 係数（{rounding}）｜👉 仕込み数 ＝ 販売予測数 × ⑤事前準備率（{rounding}）｜"
         "係数 ＝ 商品係数があればそれ、「—」の商品は時間帯係数｜"
         "優先 ＝ 保持時間が基準（期間データE12）以下なら高・長ければ低（手動上書き可・未入力は—）｜"
         "仕込み開始(目安) ＝ ⑥ピーク開始 − 保持時間（印刷用はこの早い順。ピーク未入力なら高→低）｜"
         "比較期間 ＝ A選択時は期間B、それ以外は期間A", 8.5, wrap=True)

    # 条件付き書式を作り直し(データバーは仕込み数へ、要確認は比較期間の新位置へ、優先の色分け)
    ws.conditional_formatting = ConditionalFormattingList()
    ws.conditional_formatting.add(f"E{ROW_M0}:E{last}", FormulaRule(
        formula=[f"ISTEXT(E{ROW_M0})"], font=Font(name=FONT_NAME, size=9, bold=True, color=RED)))
    ws.conditional_formatting.add(f"G{ROW_M0}:G{last}", DataBarRule(
        start_type="num", start_value=0, end_type="max", color=CORAL, showValue=True))
    ws.conditional_formatting.add(f"N{ROW_M0}:N{last}", FormulaRule(
        formula=[f'ISNUMBER(SEARCH("要確認",N{ROW_M0}))'],
        font=Font(name=FONT_NAME, size=9, bold=True, color=RED)))
    ws.conditional_formatting.add(f"P{ROW_M0}:P{last}", FormulaRule(
        formula=[f'P{ROW_M0}="高"'], font=Font(name=FONT_NAME, size=9.5, bold=True, color=CORAL)))
    ws.conditional_formatting.add(f"P{ROW_M0}:P{last}", FormulaRule(
        formula=[f'P{ROW_M0}="低"'], font=Font(name=FONT_NAME, size=9.5, bold=False, color=GRAY)))
    ws.print_area = f"A1:{CALC_LAST_COL}{last + 1}"


# ============================================================ 期間データ =====
def upgrade_period(ws):
    explode_column_groups(ws)
    for ref in ("B7", "B11"):                    # 配列数式で保存された状態表示を通常式に
        if hasattr(ws[ref].value, "text"):
            ws[ref] = ftext(ws[ref])
    ws.row_dimensions[12].height = 18
    note(ws, "B12:D12", "優先「高」の目安：保持時間が右の分数以下（変更可）→", 8.5, GRAY, h="right")
    ws["E12"] = HT_THR_DEFAULT
    style_range(ws, "E12", font=fnt(9.5, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT, num='0"分"')
    ws["E12"].comment = mk_comment("保持時間がこの分数以下の商品を優先「高」、長い商品を「低」と"
                                   "自動判定します。商品ごとに変えたいときは右の「優先(手動)」列で。")
    dv_thr = DataValidation(type="whole", operator="between", formula1="1", formula2="999",
                            showErrorMessage=True)
    dv_thr.error = "1〜999 の整数(分)で入力してください"
    dv_thr.errorTitle = "優先の基準"
    ws.add_data_validation(dv_thr)
    dv_thr.add("E12")

    ws.unmerge_cells("E13:K13")
    navy_header(ws, "E13", "保持時間\n(分)")
    navy_header(ws, "F13", "優先\n(手動)")
    ws.merge_cells("G13:K13")
    navy_header(ws, "G13:K13", "メモ（自由記入）")
    ws["E13"].comment = mk_comment("ホールディングタイム＝作ってから何分まで提供できるか。"
                                   "短い商品ほど作るタイミングに注意が必要なので優先「高」、"
                                   "長い商品は先に作り置きできるので「低」になります。未入力は「—」。")
    ws["F13"].comment = mk_comment("自動判定を変えたい商品だけ 高／低 を選びます。"
                                   "空欄なら保持時間から自動判定。")
    dv_pri = DataValidation(type="list", formula1='"高,低"', allow_blank=True,
                            showErrorMessage=True)
    dv_pri.error = "「高」か「低」を選んでください（空欄＝自動判定）"
    dv_pri.errorTitle = "優先(手動)"
    ws.add_data_validation(dv_pri)
    dv_pri.add(f"F{ROW_P0}:F{ROW_P0 + N_SLOTS - 1}")
    dv_ht = DataValidation(type="whole", operator="between", formula1="0", formula2="9999",
                           showErrorMessage=True)
    dv_ht.error = "保持時間は 0〜9999 の整数(分)で入力してください"
    dv_ht.errorTitle = "保持時間"
    ws.add_data_validation(dv_ht)
    dv_ht.add(f"E{ROW_P0}:E{ROW_P0 + N_SLOTS - 1}")

    for i in range(N_SLOTS):
        r = ROW_P0 + i
        ws.unmerge_cells(f"E{r}:K{r}")
        memo = ws[f"E{r}"].value                    # 旧メモ欄の書き込みは新メモ列へ退避
        ws[f"E{r}"] = None
        if memo not in (None, ""):
            ws[f"G{r}"] = memo
        style_range(ws, f"E{r}", font=fnt(10), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT, num='0"分"')
        style_range(ws, f"F{r}", font=fnt(10, True), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT)
        ws.merge_cells(f"G{r}:K{r}")
        style_range(ws, f"G{r}:K{r}", font=fnt(9), alignment=align("left"),
                    border=Border(bottom=hair, left=hair, right=hair))
    ws["A34"] = ("※ 販売数のセルは自動計算です（CSVの「売上数」列を商品名で集計）。"
                 "保持時間(分)を入れると準備数計算・印刷用に優先（高／低）が出ます（基準は上のE12）。")


# ============================================================== 印刷用 =======
def upgrade_print(ws):
    explode_column_groups(ws)
    for c, w in {"D": 9, "E": 7, "F": 17.7, "G": 11, "H": 2.4}.items():
        ws.column_dimensions[c].width = w
    ws.column_dimensions["I"].hidden = True         # 並び順ヘルパー
    for r in (1, 3, 4, 5, 6, 28):
        ws.unmerge_cells(f"B{r}:E{r}")
        ws.merge_cells(f"B{r}:G{r}")
    ws.unmerge_cells("B2:E2")
    ws.merge_cells("B2:F2")
    style_range(ws, "B1:G1", fl=fill(NAVY))
    move_title_logo(ws, 5, 6)                       # F〜G列の右端へ

    ws["B2"] = ('="  👇 この数を作ってください（販売予測数の"&'
                + RATE.replace("$D$8", "準備数計算!$D$8") + '&"%）"')
    ws["G2"] = VIEW_ALL
    style_range(ws, "G2", font=fnt(9.5, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT)
    ws["G2"].comment = mk_comment("印刷するリストの切替。「すべて」は仕込み開始(目安)の早い順"
                                  "（ピーク時間が未入力なら優先 高→低）。「優先:高のみ」「優先:低のみ」で"
                                  "絞り込み（保持時間が未入力の「—」は高側に含めます）。")
    dv_view = DataValidation(type="list", formula1=f'"{VIEW_ALL},{VIEW_HI},{VIEW_LO}"',
                             allow_blank=True, showErrorMessage=True)
    dv_view.error = f"「{VIEW_ALL}」「{VIEW_HI}」「{VIEW_LO}」から選んでください"
    dv_view.errorTitle = "表示"
    ws.add_data_validation(dv_view)
    dv_view.add("G2")
    ws["B4"] = (ftext(ws["B4"]).rstrip()
                + f'&IF(ISNUMBER(準備数計算!{PEAK_START}),"　｜　ピーク "&TEXT(準備数計算!{PEAK_START},"h:mm")'
                + f'&IF(ISNUMBER(準備数計算!{PEAK_END}),"〜"&TEXT(準備数計算!{PEAK_END},"h:mm"),""),"")')

    navy_header(ws, "B7", "No.", 10)
    navy_header(ws, "C7", "商品名", 10)
    navy_header(ws, "D7", "開始目安", 10)
    navy_header(ws, "E7", "優先", 10)
    style_range(ws, "F7", font=fnt(11, True, "FFFFFF"), fl=fill(CORAL),
                alignment=align("center"), border=BORDER_LIGHT)
    ws["F7"] = "仕込み数"
    navy_header(ws, "G7", "できたら✓", 10)

    rng = f"準備数計算!${{}}${ROW_M0}:${{}}${ROW_M0 + N_SLOTS - 1}"
    for i in range(N_SLOTS):
        r = 8 + i
        k = i + 1
        ws[f"I{r}"] = f'=IFERROR(MOD(SMALL({rng.format("L", "L")},{k}),100),"")'
        ws[f"B{r}"] = f'=IF($I{r}="","",$I{r})'
        ws[f"C{r}"] = f'=IF($I{r}="","",INDEX({rng.format("C", "C")},$I{r}))'
        ws[f"D{r}"] = f'=IF($I{r}="","",INDEX({rng.format("Q", "Q")},$I{r}))'
        ws[f"E{r}"] = f'=IF($I{r}="","",INDEX({rng.format("P", "P")},$I{r}))'
        ws[f"F{r}"] = f'=IF($I{r}="","",INDEX({rng.format("G", "G")},$I{r}))'
        ws[f"G{r}"] = f'=IF($I{r}="","","☐")'
        style_range(ws, f"B{r}", font=fnt(14, False, GRAY), alignment=align("center"), border=BORDER_LIGHT)
        style_range(ws, f"C{r}", font=fnt(14), alignment=align("left"), border=BORDER_LIGHT)
        style_range(ws, f"D{r}", font=fnt(12, True), alignment=align("center"), border=BORDER_LIGHT, num="h:mm")
        style_range(ws, f"E{r}", font=fnt(12, True), alignment=align("center"), border=BORDER_LIGHT)
        style_range(ws, f"F{r}", font=fnt(14, True, CORAL), fl=fill(F_BASE),
                    alignment=align("center"), num="#,##0",
                    border=Border(bottom=thin, top=thin, left=coral_side, right=coral_side))
        style_range(ws, f"G{r}", font=fnt(12, False, "B9C0CC"), alignment=align("center"), border=BORDER_LIGHT)
        style_range(ws, f"I{r}", font=fnt(8, False, GRAY))
    ws.conditional_formatting = ConditionalFormattingList()
    ws.conditional_formatting.add("E8:E27", FormulaRule(
        formula=['E8="高"'], font=Font(name=FONT_NAME, size=12, bold=True, color=CORAL)))
    ws.conditional_formatting.add("E8:E27", FormulaRule(
        formula=['E8="低"'], font=Font(name=FONT_NAME, size=12, bold=False, color=GRAY)))
    ws["B28"] = ("※ 数字は「準備数計算」シートから自動で入ります｜開始目安＝ピーク開始−保持時間｜"
                 "表示の切替は右上のプルダウン｜A4縦・1ページ印刷")
    # A4縦1枚に必ず収める(店舗版の設定を明示的に固定)
    ws.print_area = "A1:H28"
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = 9
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True


# ============================================================== 使い方 =======
def upgrade_guide(ws):
    # 既存の説明文で v2.0 と食い違う箇所を更新(店舗版の文言があるときだけ)
    repl = [
        ("参照期間・ピーク動員数・時間帯 を選ぶ", "参照期間・ピーク動員数・時間帯・事前準備率 を選ぶ"),
        ("作る数 ＝ ピーク動員数 × 購買率 × 係数（切り上げ）｜係数＝時間帯係数（商品別の係数に置き換え可）",
         "販売予測数 ＝ ピーク動員数 × 購買率 × 係数（切り捨て）｜仕込み数 ＝ 販売予測数 × 事前準備率｜係数＝時間帯係数（商品別の係数に置き換え可）"),
        ("作る数の係数が商品ごとの実測に置き換わります", "販売予測数の係数が商品ごとの実測に置き換わります"),
        ("期間B＝前週金～土の7日分", "期間B＝前週金〜木の7日分"),
    ]
    for row in ws.iter_rows(min_row=1, max_row=44, min_col=3, max_col=3):
        c = row[0]
        if isinstance(c.value, str):
            v = c.value
            for a_, b_ in repl:
                v = v.replace(a_, b_)
            if v != c.value:
                c.value = v
    r = 45
    for rng in [str(m) for m in ws.merged_cells.ranges]:
        if rng.startswith("C45:"):
            ws.unmerge_cells(rng)
    ws.row_dimensions[r].height = 22
    chip(ws, f"B{r}:E{r}", "  🆕 v2.0 の追加機能（事前準備率・保持時間・ピーク時間）", CHIP_NAVY, NAVY)
    lines = [
        "・⑤ 事前準備率（準備数計算）：販売予測数の何％を仕込むかを整数で入力します（100＝予測どおり／80で控えめ／"
        "120で多め。1〜200）。「👉 仕込み数」列と印刷用に反映され、販売予測数そのものは変わりません。",
        "・保持時間（期間データ）：商品ごとに「作ってから何分まで提供できるか」を分で入力すると、基準（既定30分以下）で"
        "優先「高」、それより長いと「低」に自動判定します。判定を変えたい商品は「優先(手動)」で高／低を選べます（未入力は「—」で、印刷用では高側に並びます）。",
        "・⑥ ピーク時間（準備数計算・入力ブロックの右）：これから準備するピークの開始（と終了）を 17:30 のように入力すると、"
        "商品ごとの「仕込み開始(目安)」＝ピーク開始 − 保持時間 が出ます（保持時間が長い商品ほど早く、短い商品ほど直前）。",
        "・印刷用の右上のプルダウンで「すべて」「優先:高のみ」「優先:低のみ」を切り替えられます。「すべて」は仕込み開始の早い順"
        "（ピーク時間が未入力なら優先 高→低）。保持時間の短い商品ほど作るタイミングに注意が必要なので「高」、長い商品は先に"
        "作り置きできるので「低」という考え方です。",
    ]
    for t in lines:
        r += 1
        nl = max(1, -(-int(disp_w(t) * 2) // 100))
        ws.row_dimensions[r].height = 15 * nl + 5
        note(ws, f"C{r}:J{r}", t, 9.5, INK, wrap=True)


# ====================================================== メモ(VML)の復元 =====
# 名前空間の接頭辞はExcel(v:/x:)とopenpyxl(ns1:/ns2:)で異なるため接頭辞に依存しない
SHAPE_RE = re.compile(r"<(\w+):shape\b[^>]*>.*?</\1:shape>", re.S)


def iter_shapes(xml):
    """VML内の <shape>…</shape> 要素を文字列で列挙(findallは後方参照グループを返すため不可)"""
    return [m.group(0) for m in SHAPE_RE.finditer(xml)]


def _sheet_vml_map(zf):
    """シート名 → コメント用VMLのzip内パス"""
    names = set(zf.namelist())
    wbxml = zf.read("xl/workbook.xml").decode("utf-8")
    rels = zf.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    rid_target = {}
    for tag in re.findall(r"<Relationship [^>]*/>", rels):
        i_ = re.search(r'\bId="([^"]+)"', tag)
        t_ = re.search(r'\bTarget="([^"]+)"', tag)
        if i_ and t_:
            rid_target[i_.group(1)] = t_.group(1)
    out = {}
    for tag in re.findall(r"<sheet [^>]*/>", wbxml):
        nm = re.search(r'name="([^"]+)"', tag)
        rid = re.search(r'r:id="([^"]+)"', tag)
        if not (nm and rid and rid.group(1) in rid_target):
            continue
        tgt = rid_target[rid.group(1)].lstrip("/")
        sf = tgt if tgt.startswith("xl/") else "xl/" + tgt
        d, f = sf.rsplit("/", 1)
        rel = f"{d}/_rels/{f}.rels"
        if rel not in names:
            continue
        for t in re.findall(r'Target="([^"]+\.vml)"', zf.read(rel).decode("utf-8")):
            if t.startswith("/"):
                path = t.lstrip("/")
            else:
                import posixpath
                path = posixpath.normpath(posixpath.join(d, t))
            if path in names:
                out[nm.group(1)] = path
                break
    return out


def _shape_info(sh):
    st = re.search(r"""style=(["'])(.*?)\1""", sh, re.S)
    row = re.search(r"<(\w+):Row>(\d+)</\1:Row>", sh)
    col = re.search(r"<\w+:Column>(\d+)</\w+:Column>", sh)
    anc = re.search(r"<\w+:Anchor>([^<]*)</\w+:Anchor>", sh)
    return dict(style=st.group(2) if st else None,
                key=(int(row.group(2)), int(col.group(1))) if row and col else None,
                xprefix=row.group(1) if row else "x",           # excel名前空間の接頭辞
                anchor=anc.group(1).strip() if anc else None,
                visible=bool(re.search(r"<\w+:Visible\s*/>", sh)))


def restore_comment_vml(src, dst, hide=()):
    """openpyxlはメモの吹き出し(位置・サイズ・常時表示)を既定値で書き直すため、
    元ファイル(店舗版)のVMLから同じセルのメモの見た目を復元する。
    hide に入れたセル(シート名, 行, 列 いずれも0始まり)は非表示の既定のままにする"""
    with zipfile.ZipFile(src) as zs:
        src_shapes = {}
        for sheet, path in _sheet_vml_map(zs).items():
            xml = zs.read(path).decode("utf-8", "ignore")
            src_shapes[sheet] = {i["key"]: i for i in map(_shape_info, iter_shapes(xml))
                                 if i["key"] and i["style"]}
    if not any(src_shapes.values()):
        return -1                                   # 元ファイルにメモの図形が無い
    patched = {}
    restored = 0
    with zipfile.ZipFile(dst) as zd:
        for sheet, path in _sheet_vml_map(zd).items():
            if sheet not in src_shapes:
                continue
            xml = zd.read(path).decode("utf-8")

            def fix(mo):
                nonlocal restored
                sh = mo.group(0)
                info = _shape_info(sh)
                if not info["key"] or (sheet, *info["key"]) in hide:
                    return sh
                si = src_shapes[sheet].get(info["key"])
                if not si:
                    return sh
                sh = re.sub(r"""style=(["']).*?\1""", 'style="' + si["style"].replace('"', "&quot;") + '"',
                            sh, count=1, flags=re.S)
                px = info["xprefix"]
                sh = re.sub(r"<\w+:Anchor>[^<]*</\w+:Anchor>", "", sh)
                sh = re.sub(r"<\w+:Visible\s*/>", "", sh)
                ins = ""
                if si["anchor"]:
                    ins += f"<{px}:Anchor>{si['anchor']}</{px}:Anchor>"
                if si["visible"]:
                    ins += f"<{px}:Visible/>"
                sh = sh.replace(f"<{px}:Row>", ins + f"<{px}:Row>", 1)
                restored += 1
                return sh

            new = SHAPE_RE.sub(fix, xml)
            if new != xml:
                patched[path] = new.encode("utf-8")
    if patched:
        tmp = dst + ".tmpv"
        with zipfile.ZipFile(dst) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                zout.writestr(item, patched.get(item.filename, zin.read(item.filename)))
        import os
        os.replace(tmp, dst)
    return restored



def check_hidden_cols(path):
    """openpyxl保存後も 準備数計算!I:M と 印刷用!H が非表示のままか(zipのXMLで確認)"""
    with zipfile.ZipFile(path) as z:
        wbxml = z.read("xl/workbook.xml").decode()
        rels = z.read("xl/_rels/workbook.xml.rels").decode()
        rid_target = {}
        for tag in re.findall(r"<Relationship [^>]*/>", rels):
            i_ = re.search(r'\bId="([^"]+)"', tag)
            t_ = re.search(r'\bTarget="([^"]+)"', tag)
            if i_ and t_:
                rid_target[i_.group(1)] = t_.group(1)
        out = {}
        for tag in re.findall(r"<sheet [^>]*/>", wbxml):
            nm = re.search(r'name="([^"]+)"', tag).group(1)
            rid = re.search(r'r:id="([^"]+)"', tag).group(1)
            tgt = rid_target[rid].lstrip("/")
            xml = z.read(tgt if tgt.startswith("xl/") else "xl/" + tgt).decode()
            hidden = set()
            for c in re.findall(r"<col [^>]*/>", xml):
                if 'hidden="1"' in c or 'hidden="true"' in c:
                    mn = int(re.search(r'min="(\d+)"', c).group(1))
                    mx = int(re.search(r'max="(\d+)"', c).group(1))
                    hidden.update(range(mn, mx + 1))
            out[nm] = hidden
    ok = {9, 10, 11, 12, 13} <= out.get("準備数計算", set()) and 9 in out.get("印刷用", set())
    return ok, out


def upgrade(src, dst):
    wb = load_workbook(src)
    upgrade_calc(wb["準備数計算"])
    upgrade_period(wb["期間データ"])
    upgrade_print(wb["印刷用"])
    upgrade_guide(wb["使い方"])
    wb.save(dst)
    # 店舗がExcelで整えたメモの見た目(位置・サイズ・常時表示)を元ファイルから復元。
    # 準備数計算!D7の常時表示メモは新設した⑤の行に重なるため通常のメモ(非表示)に戻す
    n = restore_comment_vml(src, dst, hide={("準備数計算", 6, 3)})
    if n < 0:                                   # 元ファイルにVMLが無い場合の保険
        n = show_paste_comments(dst)
    ok, hidden = check_hidden_cols(dst)
    if not ok:
        raise SystemExit(f"非表示列が壊れています: {hidden}")
    print(f"upgraded: {dst} (comments restored: {n})")


if __name__ == "__main__":
    upgrade(sys.argv[1], sys.argv[2])
