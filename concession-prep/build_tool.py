# -*- coding: utf-8 -*-
"""
TOHOシネマズ新宿 コンセッション事前準備数ツール（雛形）生成スクリプト

シート構成:
  使い方      … 3ステップの利用ガイド・凡例・注意点
  準備数計算  … 参照期間(直近7日/3日/昨日)の購買率 × 予測動員数 × 時間帯倍率
  日別データ  … 直近7日の日付・動員数(入力) と 商品別販売数(CSVから自動集計)
  CSV貼付     … 集計ソフトから抽出したCSVの貼り付け場所(商品名一致チェック付き)

サンプルデータ(動員数・販売CSV)は seed 固定の擬似乱数で生成。
"""
import datetime as dt
import random

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import DataBarRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.properties import PageSetupProperties

OUT = "/home/user/claude-code-practice/concession-prep/TOHO新宿_コンセッション準備数ツール.xlsx"

# ---------------------------------------------------------------- palette ----
FONT_NAME = "BIZ UDPゴシック"   # Win10以降標準のUDフォント。無い環境では自動代替

NAVY = "2E3A59"      # タイトル・表ヘッダー
INK = "333B4A"       # 基本文字色
GRAY = "8A93A3"      # 補足文字
CORAL = "E8604C"     # アクセント(準備数)
TEAL = "1F9E92"      # アクセント(データ)
AMBER = "E9A13B"     # アクセント(CSV/倍率)
GREEN = "2E9E5B"

F_INPUT = "FFF4D6"   # 入力セル(クリーム)
B_INPUT = "F0D48A"   # 入力セル枠
F_AUTO = "F2F4F7"    # 自動計算セル(ライトグレー)
F_ZEBRA = "F8FAFC"   # 縞模様
F_BASE = "FFF1EE"    # 基準準備数の列
CHIP_NAVY = "E9EDF5"
CHIP_AMBER = "FDF0DA"
CHIP_CORAL = "FCE7E2"
CHIP_TEAL = "DFF2F0"
LINE = "DFE3EA"      # 罫線(ライト)

thin = Side(style="thin", color=LINE)
hair = Side(style="hair", color=LINE)
in_side = Side(style="thin", color=B_INPUT)
BORDER_LIGHT = Border(left=thin, right=thin, top=thin, bottom=thin)
BORDER_HAIR = Border(left=hair, right=hair, top=hair, bottom=hair)
BORDER_INPUT = Border(left=in_side, right=in_side, top=in_side, bottom=in_side)


def fnt(size=10.5, bold=False, color=INK):
    return Font(name=FONT_NAME, size=size, bold=bold, color=color)


def fill(color):
    return PatternFill(start_color=color, end_color=color, fill_type="solid")


def align(h="left", v="center", wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)


def style_range(ws, ref, font=None, fl=None, alignment=None, border=None, num=None):
    """merge範囲を含む矩形の全セルに書式を適用する"""
    start, end = ref.split(":") if ":" in ref else (ref, ref)
    sc, sr = coord(start)
    ec, er = coord(end)
    for r in range(sr, er + 1):
        for c in range(sc, ec + 1):
            cell = ws.cell(row=r, column=c)
            if font:
                cell.font = font
            if fl:
                cell.fill = fl
            if alignment:
                cell.alignment = alignment
            if border:
                cell.border = border
            if num:
                cell.number_format = num


def coord(ref):
    col = "".join(ch for ch in ref if ch.isalpha())
    row = int("".join(ch for ch in ref if ch.isdigit()))
    from openpyxl.utils import column_index_from_string
    return column_index_from_string(col), row


def title_band(ws, ref, text):
    ws.merge_cells(ref)
    style_range(ws, ref, font=fnt(14, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("left", "center"))
    ws[ref.split(":")[0]] = text


def chip(ws, ref, text, chip_fill, color=INK, size=10, bold=True, h="left"):
    if ":" in ref:
        ws.merge_cells(ref)
    style_range(ws, ref, font=fnt(size, bold, color), fl=fill(chip_fill),
                alignment=align(h, "center"))
    ws[ref.split(":")[0]] = text


def note(ws, ref, text, size=9, color=GRAY, wrap=False, h="left"):
    if ":" in ref:
        ws.merge_cells(ref)
    style_range(ws, ref, font=fnt(size, False, color),
                alignment=align(h, "center", wrap))
    ws[ref.split(":")[0]] = text


# ------------------------------------------------------------ sample data ----
TODAY = dt.date(2026, 8, 26)
DATES = [TODAY - dt.timedelta(days=7 - i) for i in range(7)]        # 8/19..8/25
ATTEND = [4200, 3900, 5100, 8300, 7800, 3600, 4100]                 # 動員サンプル

PRODUCTS = [  # (商品名, 基準購買率, 単価)  ※サンプル値
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
CSV_ROWS = []   # (date, name, qty, amount)
for d, att in zip(DATES, ATTEND):
    weekend = d.weekday() in (5, 6)
    for name, rate, price in PRODUCTS:
        q = round(att * rate * (1.08 if weekend else 1.0) * rng.uniform(0.85, 1.15))
        CSV_ROWS.append((d, name, q, q * price))

N_SLOTS = 20            # 商品枠(10〜20種類想定 → 20枠)
CSV_MAX = 500           # CSV貼付の最大行数
ROW_P0 = 9              # 日別データ: 商品1行目
ROW_M0 = 11             # 準備数計算: 商品1行目

wb = Workbook()

# ============================================================== 使い方 =======
ws = wb.active
ws.title = "使い方"
ws.sheet_properties.tabColor = NAVY
ws.sheet_view.showGridLines = False
widths = {"A": 2.5, "B": 6, "C": 13, "D": 13, "E": 13, "F": 13, "G": 13,
          "H": 13, "I": 13, "J": 13}
for c, w in widths.items():
    ws.column_dimensions[c].width = w

ws.row_dimensions[1].height = 38
title_band(ws, "A1:J1", "　🍿 コンセッション 事前準備数ツール")
ws.row_dimensions[2].height = 20
note(ws, "B2:J2", "TOHOシネマズ新宿｜過去の購買率から、ピーク前の仕込み数を自動計算する雛形です", 9.5)

ws.row_dimensions[4].height = 22
chip(ws, "B4:D4", "  つかいかた（3ステップ）", CHIP_NAVY, NAVY)

steps = [
    ("①", CORAL, "「日別データ」シートに 日付 と 動員数 を入力",
     "直近7日分。日付は左から古い順（右端＝昨日）。販売数はSTEP②のCSVから自動で入ります。｜担当：社員"),
    ("②", AMBER, "「CSV貼付」シートに 集計ソフトのCSV を貼り付け",
     "A列=日付・B列=商品名・C列=販売数。右側の商品名チェックが「✔ OK」になっているか確認。｜担当：社員"),
    ("③", TEAL, "「準備数計算」シートで 参照期間 と 予測動員数 を選ぶ",
     "直近7日間/3日間/昨日から期間を選択。時間帯の倍率（×120%など）は表の右上で自由に変更。｜担当：社員（確認：スタッフ）"),
]
r = 6
for mark, color, head, desc in steps:
    ws.row_dimensions[r].height = 24
    ws.row_dimensions[r + 1].height = 20
    chip(ws, f"B{r}:B{r + 1}", mark, "FFFFFF", color, 16, True, "center")
    style_range(ws, f"B{r}:B{r + 1}", border=Border(left=Side(style="medium", color=color),
                                                    top=Side(style="medium", color=color),
                                                    bottom=Side(style="medium", color=color)))
    ws.merge_cells(f"C{r}:J{r}")
    style_range(ws, f"C{r}:J{r}", font=fnt(11, True, INK), alignment=align("left", "bottom"))
    ws[f"C{r}"] = head
    note(ws, f"C{r + 1}:J{r + 1}", desc, 9)
    r += 3

r += 1                                        # 凡例
ws.row_dimensions[r].height = 22
chip(ws, f"B{r}:D{r}", "  セルの色のルール", CHIP_NAVY, NAVY)
r += 1
ws.row_dimensions[r].height = 20
chip(ws, f"C{r}:D{r}", "✏️ 黄色 ＝ 入力するセル", F_INPUT, INK, 9.5, False, "center")
style_range(ws, f"C{r}:D{r}", border=BORDER_INPUT)
chip(ws, f"F{r}:G{r}", "🔒 グレー ＝ 自動計算", F_AUTO, "5B6472", 9.5, False, "center")
style_range(ws, f"F{r}:G{r}", border=BORDER_LIGHT)

r += 2                                        # 計算ルール
ws.row_dimensions[r].height = 22
chip(ws, f"B{r}:D{r}", "  計算のしくみ", CHIP_NAVY, NAVY)
r += 1
note(ws, f"C{r}:J{r}", "購買率 ＝ 参照期間の販売数 ÷ 参照期間の動員数", 10, INK)
r += 1
note(ws, f"C{r}:J{r}", "準備数 ＝ 予測動員数 × 購買率 × 時間帯倍率（小数点以下は切り上げ）", 10, INK)

r += 2                                        # 注意
ws.row_dimensions[r].height = 22
chip(ws, f"B{r}:D{r}", "  注意メモ", CHIP_NAVY, NAVY)
notes = [
    "・商品枠は最大20です（「日別データ」シートの商品名欄）。10〜20品での運用を想定しています。",
    "・商品名はCSV側と完全一致が必要です。「⚠ 未登録」が出たら、どちらかの名前をそろえてください。",
    "・CSVを貼り付けて日付が文字列になった場合は、日付列を選択 →「データ」→「区切り位置」で日付に戻せます。",
    "・いまはサンプルデータが入っています。実際のデータで上書きしてお使いください。",
]
for t in notes:
    r += 1
    ws.row_dimensions[r].height = 18
    note(ws, f"C{r}:J{r}", t, 9.5, INK)
r += 2
note(ws, f"C{r}:J{r}", "雛形版 v1.0（2026/8）｜数式・レイアウトは自由に調整してください", 8.5)

# ========================================================== 準備数計算 =======
ws = wb.create_sheet("準備数計算")
ws.sheet_properties.tabColor = CORAL
ws.sheet_view.showGridLines = False
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0

widths = {"A": 2.5, "B": 6, "C": 26, "D": 12, "E": 11, "F": 13,
          "G": 12, "H": 12, "I": 12, "J": 2.5, "K": 12, "L": 10}
for c, w in widths.items():
    ws.column_dimensions[c].width = w

ws.row_dimensions[1].height = 34
title_band(ws, "B1:I1", "　🍿 準備数計算｜ピーク前の仕込み数")
ws.row_dimensions[2].height = 18
note(ws, "B2:I2", "過去の購買率 × 予測動員数 × 時間帯倍率 で、事前に準備する数を自動計算します", 9)
ws.row_dimensions[3].height = 6

# --- 計算用ヘルパー(参照日数・動員合計) ------------------------------------
chip(ws, "K3:L3", " ⚙ 計算用（さわらない）", "F7F8FA", GRAY, 8, False)
note(ws, "K4", "参照日数", 8.5, GRAY, h="right")
ws["L4"] = '=IF($D$4="昨日",1,IF($D$4="直近3日間",3,7))'
note(ws, "K5", "動員合計", 8.5, GRAY, h="right")
ws["L5"] = "=SUMPRODUCT((COLUMN(日別データ!$C$6:$I$6)>=10-$L$4)*1,日別データ!$C$6:$I$6)"
style_range(ws, "L4:L5", font=fnt(8.5, False, GRAY), alignment=align("left"), num="#,##0")
style_range(ws, "K3:L5", border=BORDER_HAIR)

# --- コントロール(①参照期間 ②予測動員数 ③倍率) ----------------------------
ws.row_dimensions[4].height = 24
chip(ws, "B4:C4", "  ① 参照期間", CHIP_CORAL, INK, 10)
ws["D4"] = "直近7日間"
style_range(ws, "D4", font=fnt(10.5, True), fl=fill(F_INPUT),
            alignment=align("center"), border=BORDER_INPUT)
ws.merge_cells("E4:I4")
ws["E4"] = ('=IF(日別データ!$I$4="","（「日別データ」シートに日付を入力してください）",'
            '"参照: "&TEXT(INDEX(日別データ!$C$4:$I$4,1,8-$L$4),"m/d")&"〜"&'
            'TEXT(日別データ!$I$4,"m/d")&"（動員合計 "&TEXT($L$5,"#,##0")&"人）")')
style_range(ws, "E4:I4", font=fnt(9.5, False, "5B6472"), alignment=align("left"))

ws.row_dimensions[5].height = 24
chip(ws, "B5:C5", "  ② 予測動員数", CHIP_CORAL, INK, 10)
ws["D5"] = 5000
ws["D5"].comment = Comment("サンプル値です。準備したい日の予測動員数(人)に置き換えてください。", "準備数ツール")
style_range(ws, "D5", font=fnt(10.5, True), fl=fill(F_INPUT),
            alignment=align("center"), border=BORDER_INPUT, num="#,##0")
note(ws, "E5:I5", "← 準備したい日（明日など）の予測動員数を入力", 9)

ws.row_dimensions[6].height = 20
chip(ws, "B6:C6", "  ③ 時間帯倍率", CHIP_CORAL, INK, 10)
note(ws, "D6:I6", "→ 表の右上「×○○%」を書き換えると、時間帯ごとの準備数に反映されます（名前も変更OK）", 9)
ws.row_dimensions[7].height = 6

# --- 表ヘッダー -------------------------------------------------------------
ws.row_dimensions[8].height = 18
ws.row_dimensions[9].height = 20
ws.row_dimensions[10].height = 20
chip(ws, "G8:I8", " ⏰ 時間帯別の準備数（自由に変更OK）", CHIP_AMBER, INK, 8.5)
for ref, text in [("B8:B10", "No."), ("C8:C10", "商品名"), ("D8:D10", "期間販売数"),
                  ("E8:E10", "購買率"), ("F8:F10", "基準準備数\n(倍率100%)")]:
    ws.merge_cells(ref)
    style_range(ws, ref, font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws[ref.split(":")[0]] = text
for col, label, mult in [("G", "通常帯", 1.0), ("H", "混雑帯", 1.2), ("I", "ピーク帯", 1.5)]:
    ws[f"{col}9"] = label
    style_range(ws, f"{col}9", font=fnt(9.5, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT)
    ws[f"{col}10"] = mult
    style_range(ws, f"{col}10", font=fnt(10, True, CORAL), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT, num='"×"0%')
ws["G9"].comment = Comment("時間帯の名前は自由に変更できます(例: 12時台、レイト前)。", "準備数ツール")
ws["G10"].comment = Comment("倍率はサンプルです。1.2 と入力すると ×120% になります。", "準備数ツール")

# --- 商品行 -----------------------------------------------------------------
for i in range(N_SLOTS):
    r = ROW_M0 + i
    dr = ROW_P0 + i          # 日別データ側の行
    ws.row_dimensions[r].height = 20
    zebra = fill(F_ZEBRA) if i % 2 else None
    ws[f"B{r}"] = i + 1
    ws[f"C{r}"] = f'=IF(日別データ!B{dr}="","",日別データ!B{dr})'
    ws[f"D{r}"] = (f'=IF($C{r}="","",SUMPRODUCT((COLUMN(日別データ!$C$6:$I$6)>=10-$L$4)*1,'
                   f'日別データ!C{dr}:I{dr}))')
    ws[f"E{r}"] = f'=IF($C{r}="","",IFERROR(D{r}/$L$5,0))'
    ws[f"F{r}"] = f'=IF(OR($C{r}="",$D$5=""),"",ROUNDUP($D$5*E{r},0))'
    for col in "GHI":
        ws[f"{col}{r}"] = (f'=IF(OR($C{r}="",$D$5="",{col}$10=""),"",'
                           f'ROUNDUP($D$5*$E{r}*{col}$10,0))')
    style_range(ws, f"B{r}", font=fnt(9, False, GRAY), alignment=align("center"))
    style_range(ws, f"C{r}", font=fnt(10.5), alignment=align("left"))
    style_range(ws, f"D{r}", font=fnt(10, False, "5B6472"), alignment=align("center"), num="#,##0")
    style_range(ws, f"E{r}", font=fnt(10, False, "5B6472"), alignment=align("center"), num="0.0%")
    style_range(ws, f"F{r}", font=fnt(10.5, True, CORAL), fl=fill(F_BASE),
                alignment=align("center"), num="#,##0")
    style_range(ws, f"G{r}:I{r}", font=fnt(10.5, True, NAVY), alignment=align("center"), num="#,##0")
    if zebra:
        for col in "BCDE":
            ws[f"{col}{r}"].fill = fill(F_ZEBRA)
        for col in "GHI":
            ws[f"{col}{r}"].fill = fill(F_ZEBRA)
    for col in "BCDEFGHI":
        cell = ws[f"{col}{r}"]
        cell.border = Border(bottom=hair, left=hair, right=hair)

style_range(ws, f"B{ROW_M0}:I{ROW_M0 + N_SLOTS - 1}", border=None)  # no-op(既に設定済)
last = ROW_M0 + N_SLOTS - 1
ws.row_dimensions[last + 1].height = 18
note(ws, f"B{last + 1}:I{last + 1}",
     "※ 準備数 ＝ 予測動員数 × 購買率 × 倍率（小数点以下切り上げ）｜購買率 ＝ 参照期間の販売数 ÷ 動員数", 8.5)

bar = DataBarRule(start_type="num", start_value=0, end_type="max",
                  color=CORAL, showValue=True)
ws.conditional_formatting.add(f"F{ROW_M0}:F{last}", bar)

dv_period = DataValidation(type="list", formula1='"直近7日間,直近3日間,昨日"', allow_blank=False)
dv_period.error = "リストから選んでください（直近7日間／直近3日間／昨日）"
dv_period.errorTitle = "参照期間"
ws.add_data_validation(dv_period)
dv_period.add("D4")

dv_fore = DataValidation(type="whole", operator="between", formula1="0", formula2="999999")
dv_fore.error = "予測動員数は 0〜999,999 の整数で入力してください"
dv_fore.errorTitle = "予測動員数"
ws.add_data_validation(dv_fore)
dv_fore.add("D5")

dv_mult = DataValidation(type="decimal", operator="between", formula1="0", formula2="5")
dv_mult.error = "倍率は 0〜5 の数値で入力してください（1.2 → ×120%）"
dv_mult.errorTitle = "時間帯倍率"
ws.add_data_validation(dv_mult)
dv_mult.add("G10:I10")

ws.freeze_panes = "A11"

# ========================================================== 日別データ =======
ws = wb.create_sheet("日別データ")
ws.sheet_properties.tabColor = TEAL
ws.sheet_view.showGridLines = False
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0

ws.column_dimensions["A"].width = 5
ws.column_dimensions["B"].width = 24
for c in "CDEFGHI":
    ws.column_dimensions[c].width = 10
ws.column_dimensions["J"].width = 11
ws.column_dimensions["K"].width = 18

ws.row_dimensions[1].height = 34
title_band(ws, "A1:K1", "　📅 日別データ（動員数・販売数）")
ws.row_dimensions[2].height = 20
note(ws, "A2", "凡例:", 8.5, GRAY, h="right")
chip(ws, "B2", "✏️ 入力セル", F_INPUT, INK, 8.5, False, "center")
style_range(ws, "B2", border=BORDER_INPUT)
chip(ws, "C2:D2", "🔒 自動計算", F_AUTO, "5B6472", 8.5, False, "center")
style_range(ws, "C2:D2", border=BORDER_LIGHT)
note(ws, "F2:K2", "日付は左から古い順（右端＝昨日）。販売数は「CSV貼付」シートから自動集計されます。", 8.5)
ws.row_dimensions[3].height = 6

ws.row_dimensions[4].height = 22
chip(ws, "B4", "  日付", CHIP_TEAL, INK, 10)
ws.row_dimensions[5].height = 16
note(ws, "B5", "  曜日", 8.5, GRAY)
ws.row_dimensions[6].height = 22
chip(ws, "B6", "  動員数（人）", CHIP_TEAL, INK, 10)
for j, (d, att) in enumerate(zip(DATES, ATTEND)):
    col = get_column_letter(3 + j)
    ws[f"{col}4"] = d
    style_range(ws, f"{col}4", font=fnt(10, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT, num="m/d")
    ws[f"{col}5"] = f'=IF({col}$4="","",CHOOSE(WEEKDAY({col}$4),"日","月","火","水","木","金","土"))'
    style_range(ws, f"{col}5", font=fnt(8.5, False, GRAY), alignment=align("center"))
    ws[f"{col}6"] = att
    style_range(ws, f"{col}6", font=fnt(10.5), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT, num="#,##0")
ws["C4"].comment = Comment("日付・動員数はサンプルです。実際の直近7日分に置き換えてください。", "準備数ツール")
ws["J6"] = "=IF(COUNT(C6:I6)=0,\"\",SUM(C6:I6))"
style_range(ws, "J6", font=fnt(10.5, True, TEAL), fl=fill(F_AUTO),
            alignment=align("center"), border=BORDER_LIGHT, num="#,##0")
note(ws, "J5", "7日計", 8, GRAY, h="center")

# 土日を色分け(日=赤/土=青)
weekend_red = FormulaRule(formula=['WEEKDAY(C$4)=1'], font=Font(name=FONT_NAME, color="D14343", bold=True))
weekend_blue = FormulaRule(formula=['WEEKDAY(C$4)=7'], font=Font(name=FONT_NAME, color="3B6FD4", bold=True))
ws.conditional_formatting.add("C4:I5", weekend_red)
ws.conditional_formatting.add("C4:I5", weekend_blue)

ws.row_dimensions[7].height = 6
ws.row_dimensions[8].height = 22
for ref, text in [("A8", "No."), ("B8", "商品名"), ("J8", "7日合計"), ("K8", "メモ")]:
    style_range(ws, ref, font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center"), border=BORDER_LIGHT)
    ws[ref] = text
for j in range(7):
    col = get_column_letter(3 + j)
    ws[f"{col}8"] = f'=IF({col}$4="","",{col}$4)'
    style_range(ws, f"{col}8", font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center"), border=BORDER_LIGHT, num="m/d")

for i in range(N_SLOTS):
    r = ROW_P0 + i
    ws.row_dimensions[r].height = 20
    ws[f"A{r}"] = i + 1
    style_range(ws, f"A{r}", font=fnt(9, False, GRAY), alignment=align("center"))
    if i < len(PRODUCTS):
        ws[f"B{r}"] = PRODUCTS[i][0]
    style_range(ws, f"B{r}", font=fnt(10.5), fl=fill(F_INPUT),
                alignment=align("left"), border=BORDER_INPUT)
    for j in range(7):
        col = get_column_letter(3 + j)
        ws[f"{col}{r}"] = (f'=IF(OR($B{r}="",{col}$4=""),"",'
                           f'SUMIFS(CSV貼付!$C$5:$C${4 + CSV_MAX},CSV貼付!$A$5:$A${4 + CSV_MAX},{col}$4,'
                           f'CSV貼付!$B$5:$B${4 + CSV_MAX},$B{r}))')
        style_range(ws, f"{col}{r}", font=fnt(10, False, "5B6472"),
                    fl=fill(F_AUTO if i % 2 == 0 else F_ZEBRA),
                    alignment=align("center"), num="#,##0")
    ws[f"J{r}"] = f'=IF($B{r}="","",SUM(C{r}:I{r}))'
    style_range(ws, f"J{r}", font=fnt(10, True, "5B6472"), fl=fill(F_AUTO),
                alignment=align("center"), num="#,##0")
    style_range(ws, f"K{r}", font=fnt(9), alignment=align("left"))
    for col in "ABCDEFGHIJK":
        ws[f"{col}{r}"].border = Border(bottom=hair, left=hair, right=hair)
    # 入力セルの枠は上書きで戻す
    ws[f"B{r}"].border = BORDER_INPUT

ws["B9"].comment = Comment("商品名はサンプルです(最大20枠)。CSV側の商品名と完全一致させてください。", "準備数ツール")
last = ROW_P0 + N_SLOTS - 1
ws.row_dimensions[last + 1].height = 26
note(ws, f"A{last + 1}:K{last + 1}",
     "※ 販売数のセルは自動計算です。CSVを使わず手入力したい場合は、数値を直接入力しても使えます"
     "（自動集計に戻すには、となりのセルの数式をコピーしてください）。", 8.5, GRAY, wrap=True)

ws.freeze_panes = "C9"

# ============================================================ CSV貼付 ========
ws = wb.create_sheet("CSV貼付")
ws.sheet_properties.tabColor = AMBER
ws.sheet_view.showGridLines = False

ws.column_dimensions["A"].width = 12
ws.column_dimensions["B"].width = 28
ws.column_dimensions["C"].width = 10
ws.column_dimensions["D"].width = 13
ws.column_dimensions["E"].width = 10
ws.column_dimensions["F"].width = 15
ws.column_dimensions["G"].width = 2.5
ws.column_dimensions["H"].width = 11
ws.column_dimensions["I"].width = 9

ws.row_dimensions[1].height = 34
title_band(ws, "A1:I1", "　📋 CSV貼付（集計ソフトのデータ）")
ws.row_dimensions[2].height = 30
note(ws, "A2:F2",
     "集計ソフトから抽出したCSVを、5行目以降にそのまま貼り付けてください（A=日付・B=商品名・C=販売数、最大500行）。"
     "列の並びが違う場合は、貼り付けてから列を入れ替えてください。", 9, GRAY, wrap=True)
ws.row_dimensions[3].height = 18

chip(ws, "H2", "貼付行数", CHIP_AMBER, INK, 8.5, False, "center")
ws["I2"] = f"=COUNTA($A$5:$A${4 + CSV_MAX})"
style_range(ws, "I2", font=fnt(10, True), alignment=align("center"), num="#,##0")
chip(ws, "H3", "⚠ 未登録", CHIP_AMBER, INK, 8.5, False, "center")
ws["I3"] = f'=COUNTIF($F$5:$F${4 + CSV_MAX},"⚠ 未登録")'
style_range(ws, "I3", font=fnt(10, True), alignment=align("center"), num="#,##0")
warn_red = FormulaRule(formula=["$I$3>0"], font=Font(name=FONT_NAME, color="D14343", bold=True))
ws.conditional_formatting.add("I3", warn_red)

ws.row_dimensions[4].height = 22
for ref, text in [("A4", "日付"), ("B4", "商品名"), ("C4", "販売数"),
                  ("D4", "金額（予備）"), ("E4", "（予備）"), ("F4", "商品名チェック")]:
    style_range(ws, ref, font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center"), border=BORDER_LIGHT)
    ws[ref] = text
ws["F4"].comment = Comment("「日別データ」の商品名一覧に載っているかを自動判定します。"
                           "「⚠ 未登録」の行は集計されません。", "準備数ツール")

for i in range(CSV_MAX):
    r = 5 + i
    for col in "ABCDE":
        ws[f"{col}{r}"].border = BORDER_HAIR
        ws[f"{col}{r}"].font = fnt(9.5)
    ws[f"A{r}"].number_format = "m/d"
    ws[f"A{r}"].alignment = align("center")
    ws[f"C{r}"].number_format = "#,##0"
    ws[f"C{r}"].alignment = align("center")
    ws[f"D{r}"].number_format = "#,##0"
    ws[f"D{r}"].alignment = align("center")
    ws[f"F{r}"] = (f'=IF($B{r}="","",IF(ISNUMBER(MATCH($B{r},日別データ!$B${ROW_P0}:$B${ROW_P0 + N_SLOTS - 1},0)),'
                   f'"✔ OK","⚠ 未登録"))')
    ws[f"F{r}"].font = fnt(9, False, GRAY)
    ws[f"F{r}"].alignment = align("center")
    ws[f"F{r}"].border = BORDER_HAIR

ok_green = FormulaRule(formula=[f'ISNUMBER(SEARCH("✔",F5))'],
                       font=Font(name=FONT_NAME, size=9, color=GREEN))
ng_red = FormulaRule(formula=[f'ISNUMBER(SEARCH("⚠",F5))'],
                     font=Font(name=FONT_NAME, size=9, bold=True, color="D14343"),
                     fill=fill("FDECEC"))
ws.conditional_formatting.add(f"F5:F{4 + CSV_MAX}", ok_green)
ws.conditional_formatting.add(f"F5:F{4 + CSV_MAX}", ng_red)

for i, (d, name, qty, amount) in enumerate(CSV_ROWS):
    r = 5 + i
    ws[f"A{r}"] = d
    ws[f"B{r}"] = name
    ws[f"C{r}"] = qty
    ws[f"D{r}"] = amount
ws["A5"].comment = Comment("5行目以降はサンプルデータです。実際のCSVに置き換えてください。", "準備数ツール")

ws.freeze_panes = "A5"

# ------------------------------------------------------------------ save -----
wb.properties.title = "コンセッション事前準備数ツール"
wb.properties.creator = "TOHOシネマズ新宿 コンセッション"
wb.save(OUT)
print("saved:", OUT)
