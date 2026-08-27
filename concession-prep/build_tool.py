# -*- coding: utf-8 -*-
"""
TOHOシネマズ新宿 コンセッション事前準備数ツール（雛形 v2）生成スクリプト

シート構成:
  使い方      … 3ステップの利用ガイド・凡例・注意点
  準備数計算  … 参照期間 × 時間帯(朝/昼/夕方/夜/1日全体)の購買率 × ピーク動員数 × 倍率 → 作る数
  印刷用      … A4縦1枚の仕込み指示書(準備数計算から自動連動・チェック欄付き)
  日別データ  … 直近7日の日付・動員数(1日計/時間帯別)を入力。商品別販売数はCSVから自動集計
  CSV貼付     … 集計ソフトのCSV貼り付け場所(商品名チェック・時間帯判定付き)

サンプルデータは sample_data.py で生成(seed固定)。
"""
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import DataBarRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import column_index_from_string, get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.properties import PageSetupProperties

import sample_data as sd

OUT = "/home/user/claude-code-practice/concession-prep/TOHO新宿_コンセッション準備数ツール.xlsx"

# ---------------------------------------------------------------- palette ----
FONT_NAME = "BIZ UDPゴシック"   # Win10以降標準のUDフォント。無い環境では自動代替

NAVY = "2E3A59"
INK = "333B4A"
GRAY = "8A93A3"
CORAL = "E8604C"
TEAL = "1F9E92"
AMBER = "E9A13B"
GREEN = "2E9E5B"
RED = "D14343"

F_INPUT = "FFF4D6"
B_INPUT = "F0D48A"
F_AUTO = "F2F4F7"
F_ZEBRA = "F8FAFC"
F_BASE = "FFF1EE"
CHIP_NAVY = "E9EDF5"
CHIP_AMBER = "FDF0DA"
CHIP_CORAL = "FCE7E2"
CHIP_TEAL = "DFF2F0"
LINE = "DFE3EA"

thin = Side(style="thin", color=LINE)
hair = Side(style="hair", color=LINE)
in_side = Side(style="thin", color=B_INPUT)
coral_side = Side(style="medium", color=CORAL)
BORDER_LIGHT = Border(left=thin, right=thin, top=thin, bottom=thin)
BORDER_HAIR = Border(left=hair, right=hair, top=hair, bottom=hair)
BORDER_INPUT = Border(left=in_side, right=in_side, top=in_side, bottom=in_side)


def fnt(size=10.5, bold=False, color=INK):
    return Font(name=FONT_NAME, size=size, bold=bold, color=color)


def fill(color):
    return PatternFill(start_color=color, end_color=color, fill_type="solid")


def align(h="left", v="center", wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)


def coord(ref):
    col = "".join(ch for ch in ref if ch.isalpha())
    row = int("".join(ch for ch in ref if ch.isdigit()))
    return column_index_from_string(col), row


def style_range(ws, ref, font=None, fl=None, alignment=None, border=None, num=None):
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
ATT_BANDS, QTY, CSV_ROWS = sd.build()
DATES, ATTEND, PRODUCTS, BANDS = sd.DATES, sd.ATTEND, sd.PRODUCTS, sd.BANDS

N_SLOTS = 20            # 商品枠(10〜20種類想定 → 20枠)
CSV_MAX = 2000          # CSV貼付の最大行数
CSV_END = 4 + CSV_MAX   # CSV貼付データ最終行
ROW_P0 = 13             # 日別データ: 商品1行目
ROW_M0 = 11             # 準備数計算: 商品1行目

wb = Workbook()

# ============================================================== 使い方 =======
ws = wb.active
ws.title = "使い方"
ws.sheet_properties.tabColor = NAVY
ws.sheet_view.showGridLines = False
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1
ws.page_setup.paperSize = 9          # A4
for c, w in {"A": 2.5, "B": 6, "C": 13, "D": 13, "E": 13, "F": 13, "G": 13,
             "H": 13, "I": 13, "J": 13}.items():
    ws.column_dimensions[c].width = w

ws.row_dimensions[1].height = 38
title_band(ws, "A1:J1", "　🍿 コンセッション 事前準備数ツール")
ws.row_dimensions[2].height = 20
note(ws, "B2:J2", "TOHOシネマズ新宿｜過去の購買率から、ピーク前の仕込み数（作る数）を自動計算する雛形です", 9.5)

ws.row_dimensions[4].height = 22
chip(ws, "B4:D4", "  つかいかた（3ステップ）", CHIP_NAVY, NAVY)

steps = [
    ("①", CORAL, "「日別データ」シートに 日付 と 動員数 を入力",
     "直近7日分。日付は左から古い順（右端＝昨日）。時間帯別の動員数（朝〜夜）は任意入力。販売数はSTEP②のCSVから自動。｜担当：社員"),
    ("②", AMBER, "「CSV貼付」シートに 集計ソフトのCSV を貼り付け",
     "A=日付・B=商品名・C=販売数・D=時刻か時間帯（任意）。商品名チェックとCSV取込チェックが「✔」か確認。｜担当：社員"),
    ("③", TEAL, "「準備数計算」で 時間帯・ピーク動員数 を入れて「作る数」を確認",
     "ピーク動員数＝これから準備する回（例：1時間後のピーク）の合計動員数。「印刷用」シートをA4で刷って現場へ。｜担当：社員（確認：スタッフ）"),
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
note(ws, f"C{r}:J{r}", "購買率 ＝ 参照期間（の選んだ時間帯）の販売数 ÷ 動員数", 10, INK)
r += 1
note(ws, f"C{r}:J{r}", "作る数 ＝ ピーク動員数 × 購買率 × 倍率（小数点以下は切り上げ）", 10, INK)

r += 2                                        # 注意
ws.row_dimensions[r].height = 22
chip(ws, f"B{r}:D{r}", "  注意メモ", CHIP_NAVY, NAVY)
notes = [
    "・ピーク動員数には「これから準備する回」の合計動員数を入れます（例：1時間後のピークの回の計）。",
    "・CSVのD列に時刻（例 13:05）か時間帯（朝/昼/夕方/夜）が入っていると、時間帯別の購買率で計算できます。",
    "　（無い場合は自動で「1日全体」の購買率になります。時間帯の区切りはCSV貼付シートの上部で変更できます）",
    "・深夜〜早朝（5:00より前、変更可）の時刻は「夜」として扱います（レイトショー対応）。",
    "・時間帯別の購買率を使うときは、「日別データ」の朝〜夜の動員数も入力してください（未入力だと「要確認」表示）。",
    "・販売数を手入力した場合は時間帯別には反映されないため、「1日全体」でお使いください。",
    "・商品枠は最大20です（「日別データ」シートの商品名欄）。商品名はCSV側と完全一致が必要です。",
    "・CSV貼付は最大2000行まで集計されます。列が多いCSVは「日付・商品名・販売数（・時刻）」だけ貼ると確実です。",
    "・CSVを貼り付けて日付が文字列になった場合は、日付列を選択 →「データ」→「区切り位置」で日付に戻せます。",
    "・「印刷用」シートは準備数計算と自動連動です。A4縦1枚で印刷して現場に持っていけます。",
    "・いまはサンプルデータが入っています。実際のデータで上書きしてお使いください。",
]
for t in notes:
    r += 1
    ws.row_dimensions[r].height = 18
    note(ws, f"C{r}:J{r}", t, 9.5, INK)
r += 2
note(ws, f"C{r}:J{r}", "雛形版 v2.0（2026/8）｜数式・レイアウトは自由に調整してください", 8.5)

# ========================================================== 準備数計算 =======
ws = wb.create_sheet("準備数計算")
ws.sheet_properties.tabColor = CORAL
ws.sheet_view.showGridLines = False
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1
ws.page_setup.paperSize = 9          # A4
ws.print_area = "A1:H31"

for c, w in {"A": 2.5, "B": 6, "C": 26, "D": 13, "E": 11, "F": 16,
             "G": 12, "H": 8, "I": 12, "J": 10}.items():
    ws.column_dimensions[c].width = w

ws.row_dimensions[1].height = 34
title_band(ws, "B1:H1", "　🍿 準備数計算｜ピーク前の仕込み数")
ws.row_dimensions[2].height = 18
note(ws, "B2:H2", "時間帯ごとの購買率 × ピーク動員数 × 倍率 で「作る数」を自動計算します", 9)
ws.row_dimensions[3].height = 6

# --- 計算用ヘルパー ----------------------------------------------------------
chip(ws, "I3:J3", " ⚙ 計算用（さわらない）", "F7F8FA", GRAY, 8, False)
# 参照期間の開始/終了(終了は排他)。開始セルが空欄なら0(=すべて含む)扱い
W_START = ('IF(INDEX(日別データ!$C$4:$I$4,1,8-$J$4)="",0,'
           'INDEX(日別データ!$C$4:$I$4,1,8-$J$4))')
W_END = "日別データ!$I$4+1"
CSV_A = f"CSV貼付!$A$5:$A${CSV_END}"
CSV_B = f"CSV貼付!$B$5:$B${CSV_END}"
CSV_J = f"CSV貼付!$J$5:$J${CSV_END}"
IN_WINDOW = f"({CSV_A}>={W_START})*({CSV_A}<{W_END})"
# 動員行のマスク: 期間内×日付入力済み×数値かつ正(文字列動員の混入を除外)
ATT_SEL = "INDEX(日別データ!$C$6:$I$10,$J$6,0)"
MASK_SEL = (f"(COLUMN(日別データ!$C$6:$I$6)>=10-$J$4)*(日別データ!$C$4:$I$4<>\"\")"
            f"*ISNUMBER({ATT_SEL})*({ATT_SEL}>0)")
MASK_ALL = ('(COLUMN(日別データ!$C$6:$I$6)>=10-$J$4)*(日別データ!$C$4:$I$4<>"")'
            "*ISNUMBER(日別データ!$C$6:$I$6)*(日別データ!$C$6:$I$6>0)")
helpers = [
    ("I4", "参照日数", "J4", '=IF($D$4="昨日",1,IF($D$4="直近3日間",3,7))'),
    ("I5", "動員合計", "J5", f"=SUMPRODUCT({MASK_SEL},{ATT_SEL})"),
    ("I6", "動員行", "J6", '=IFERROR(IF(OR($D$5="1日全体",$D$5="",$J$8=0),1,'
                           'MATCH($D$5,{"朝","昼","夕方","夜"},0)+1),1)'),
    ("I7", "帯条件", "J7", '=IF(OR($D$5="1日全体",$D$5="",$J$8=0,'
                           'ISNA(MATCH($D$5,{"朝","昼","夕方","夜"},0))),"*",$D$5)'),
    ("I8", "帯データ数", "J8", f'=SUMPRODUCT(({CSV_B}<>"")*{IN_WINDOW}*'
                               f'(({CSV_J}="朝")+({CSV_J}="昼")+({CSV_J}="夕方")+({CSV_J}="夜")))'),
    ("I9", "全体動員", "J9", f"=SUMPRODUCT({MASK_ALL},日別データ!$C$6:$I$6)"),
    ("I10", "判定不能行", "J10", f'=SUMPRODUCT(({CSV_B}<>"")*{IN_WINDOW}*'
                                 f'(({CSV_J}="－")+({CSV_J}="⚠ 不明")))'),
]
for lref, ltext, vref, formula in helpers:
    note(ws, lref, ltext, 8.5, GRAY, h="right")
    ws[vref] = formula
    style_range(ws, vref, font=fnt(8.5, False, GRAY), alignment=align("left"), num="#,##0")
style_range(ws, "I3:J10", border=BORDER_HAIR)

# --- コントロール ------------------------------------------------------------
ws.row_dimensions[4].height = 24
chip(ws, "B4:C4", "  ① 参照期間", CHIP_CORAL, INK, 10)
ws["D4"] = "直近7日間"
style_range(ws, "D4", font=fnt(10.5, True), fl=fill(F_INPUT),
            alignment=align("center"), border=BORDER_INPUT)
ws.merge_cells("E4:H4")
ws["E4"] = ('=IF(日別データ!$I$4="","（「日別データ」シートに日付を入力してください）",'
            '"参照: "&IF(INDEX(日別データ!$C$4:$I$4,1,8-$J$4)="","—",'
            'TEXT(INDEX(日別データ!$C$4:$I$4,1,8-$J$4),"m/d"))&"〜"&'
            'TEXT(日別データ!$I$4,"m/d")&"｜"&IF($J$7="*","1日全体",$D$5)&'
            '"の動員合計 "&TEXT($J$5,"#,##0")&"人")')
style_range(ws, "E4:H4", font=fnt(9.5, False, "5B6472"), alignment=align("left"))

ws.row_dimensions[5].height = 24
chip(ws, "B5:C5", "  ② 時間帯", CHIP_CORAL, INK, 10)
ws["D5"] = "昼"
ws["D5"].comment = Comment("朝・昼・夕方・夜の購買率で計算します。CSVに時刻・時間帯の情報が"
                           "無いときは、自動的に「1日全体」の購買率で計算します。", "準備数ツール")
style_range(ws, "D5", font=fnt(10.5, True), fl=fill(F_INPUT),
            alignment=align("center"), border=BORDER_INPUT)
note(ws, "E5:H5", "← どの時間帯の売れ方で計算するか（CSVに時刻/時間帯があるとき有効）", 9)

ws.row_dimensions[6].height = 24
chip(ws, "B6:C6", "  ③ ピーク動員数", CHIP_CORAL, INK, 10)
ws["D6"] = 1200
ws["D6"].comment = Comment("これから準備する回（例：1時間後のピークの回）の合計動員数を"
                           "入力してください。サンプル値です。", "準備数ツール")
style_range(ws, "D6", font=fnt(10.5, True), fl=fill(F_INPUT),
            alignment=align("center"), border=BORDER_INPUT, num="#,##0")
note(ws, "E6:H6", "← これから準備する回の合計動員数（例：1時間後のピークの回の計）", 9)

ws.row_dimensions[7].height = 24
chip(ws, "B7:C7", "  ④ 倍率", CHIP_CORAL, INK, 10)
ws["D7"] = 1.2
ws["D7"].comment = Comment("1.2 と入力すると ×120% です。余裕を持たせたいときに上げてください。",
                           "準備数ツール")
style_range(ws, "D7", font=fnt(10.5, True, CORAL), fl=fill(F_INPUT),
            alignment=align("center"), border=BORDER_INPUT, num='"×"0%')
note(ws, "E7:H7", "← 余裕を持たせるなら ×110%〜×150% など", 9)

ws.row_dimensions[8].height = 14
ws.merge_cells("B8:H8")
ws["B8"] = ('=IF(日別データ!$I$4="","",TRIM('
            'IF(AND($D$5<>"1日全体",$D$5<>"",$J$8=0),'
            '"⚠ 参照期間のCSVに時刻・時間帯の情報が無いため、1日全体の購買率で計算しています。","")&" "&'
            f'IF(SUMPRODUCT({MASK_SEL})<$J$4,'
            '"⚠ 参照期間に日付か動員数（"&IF($J$7="*","1日計",$D$5)&"）が未入力の日があります'
            '（そろっている日だけで計算します）。","")&" "&'
            'IF(SUMPRODUCT((COLUMN(日別データ!$C$11:$I$11)>=10-$J$4)*'
            '(日別データ!$C$11:$I$11="✔"))=0,'
            '"⚠ 参照期間の販売データがCSV貼付にありません。CSVを確認してください。","")&" "&'
            'IF(AND($J$7<>"*",$J$10>0),'
            '"⚠ CSVに時間帯を判定できない行が "&$J$10&" 件あり、集計から除外されています'
            '（CSV貼付のD列を確認）。","")&" "&'
            'IF(SUMPRODUCT((日別データ!$B$13:$B$32<>"")*'
            '(COUNTIF(日別データ!$B$13:$B$32,日別データ!$B$13:$B$32)>1))>0,'
            '"⚠ 日別データに同じ商品名が重複しています（集計が二重になります）。","")&" "&'
            'IF(OR($D$6="",$D$6=0),"⚠ ピーク動員数が未入力です。","")&" "&'
            'IF(OR($D$7="",$D$7=0),"⚠ 倍率が0%または未入力です。","")))')
style_range(ws, "B8:H8", font=fnt(8.5, True, RED), alignment=align("left"))
ws.row_dimensions[9].height = 6

# --- 表ヘッダー --------------------------------------------------------------
ws.row_dimensions[10].height = 34
for ref, text in [("B10", "No."), ("C10", "商品名"), ("D10", "期間販売数"),
                  ("E10", "購買率"), ("G10", "（参考）\n1日全体")]:
    style_range(ws, ref, font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws[ref] = text
style_range(ws, "F10", font=fnt(11, True, "FFFFFF"), fl=fill(CORAL),
            alignment=align("center", "center", True), border=BORDER_LIGHT)
ws["F10"] = "👉 作る数\n(この数を準備)"

# --- 商品行 ------------------------------------------------------------------
for i in range(N_SLOTS):
    r = ROW_M0 + i
    dr = ROW_P0 + i
    ws.row_dimensions[r].height = 21
    ws[f"B{r}"] = i + 1
    ws[f"C{r}"] = f'=IF(日別データ!B{dr}="","",日別データ!B{dr})'
    ws[f"D{r}"] = (
        f'=IF($C{r}="","",IF($J$7="*",'
        f'SUMPRODUCT({MASK_ALL},日別データ!C{dr}:I{dr}),'
        f'SUMPRODUCT({MASK_SEL}*'
        f'SUMIFS(CSV貼付!$C$5:$C${CSV_END},'
        f'CSV貼付!$A$5:$A${CSV_END},">="&日別データ!$C$4:$I$4,'
        f'CSV貼付!$A$5:$A${CSV_END},"<"&日別データ!$C$4:$I$4+1,'
        f'CSV貼付!$B$5:$B${CSV_END},$C{r},'
        f'CSV貼付!$J$5:$J${CSV_END},$J$7))))')
    ws[f"E{r}"] = f'=IF($C{r}="","",IF($J$5<=0,"要確認",D{r}/$J$5))'
    ws[f"F{r}"] = (f'=IF(OR($C{r}="",$D$6="",$D$7=""),"",'
                   f'IF(ISNUMBER($E{r}),ROUNDUP($D$6*$E{r}*$D$7,0),"—"))')
    ws[f"G{r}"] = (f'=IF($C{r}="","",IF($J$9<=0,"－",'
                   f'SUMPRODUCT({MASK_ALL},日別データ!C{dr}:I{dr})/$J$9))')
    style_range(ws, f"B{r}", font=fnt(9, False, GRAY), alignment=align("center"))
    style_range(ws, f"C{r}", font=fnt(10.5), alignment=align("left"))
    style_range(ws, f"D{r}", font=fnt(10, False, "5B6472"), alignment=align("center"), num="#,##0")
    style_range(ws, f"E{r}", font=fnt(10, False, "5B6472"), alignment=align("center"), num="0.0%")
    style_range(ws, f"F{r}", font=fnt(13, True, CORAL), fl=fill(F_BASE),
                alignment=align("center"), num="#,##0")
    style_range(ws, f"G{r}", font=fnt(9, False, GRAY), alignment=align("center"), num="0.0%")
    if i % 2:
        for col in "BCDEG":
            ws[f"{col}{r}"].fill = fill(F_ZEBRA)
    for col in "BCDEG":
        ws[f"{col}{r}"].border = Border(bottom=hair, left=hair, right=hair)
    ws[f"F{r}"].border = Border(bottom=hair, left=coral_side, right=coral_side)

last = ROW_M0 + N_SLOTS - 1
ws[f"F{last}"].border = Border(bottom=coral_side, left=coral_side, right=coral_side)
ws.row_dimensions[last + 1].height = 18
note(ws, f"B{last + 1}:H{last + 1}",
     "※ 作る数 ＝ ピーク動員数 × 購買率 × 倍率（小数点以下切り上げ）｜購買率 ＝ 参照期間（の選んだ時間帯）の販売数 ÷ 動員数", 8.5)

bar = DataBarRule(start_type="num", start_value=0, end_type="max", color=CORAL, showValue=True)
ws.conditional_formatting.add(f"F{ROW_M0}:F{last}", bar)
rate_warn = FormulaRule(formula=[f"ISTEXT(E{ROW_M0})"],
                        font=Font(name=FONT_NAME, size=9, bold=True, color=RED))
ws.conditional_formatting.add(f"E{ROW_M0}:E{last}", rate_warn)

dv_period = DataValidation(type="list", formula1='"直近7日間,直近3日間,昨日"',
                           allow_blank=False, showErrorMessage=True)
dv_period.error = "リストから選んでください（直近7日間／直近3日間／昨日）"
dv_period.errorTitle = "参照期間"
ws.add_data_validation(dv_period)
dv_period.add("D4")

dv_band = DataValidation(type="list", formula1='"1日全体,朝,昼,夕方,夜"',
                         allow_blank=False, showErrorMessage=True)
dv_band.error = "リストから選んでください（1日全体／朝／昼／夕方／夜）"
dv_band.errorTitle = "時間帯"
ws.add_data_validation(dv_band)
dv_band.add("D5")

dv_peak = DataValidation(type="whole", operator="between", formula1="0", formula2="999999",
                         showErrorMessage=True)
dv_peak.error = "ピーク動員数は 0〜999,999 の整数で入力してください"
dv_peak.errorTitle = "ピーク動員数"
ws.add_data_validation(dv_peak)
dv_peak.add("D6")

dv_mult = DataValidation(type="decimal", operator="between", formula1="0", formula2="5",
                         showErrorMessage=True)
dv_mult.error = "倍率は 0〜5 の数値で入力してください（1.2 → ×120%）"
dv_mult.errorTitle = "倍率"
ws.add_data_validation(dv_mult)
dv_mult.add("D7")

ws.freeze_panes = "A11"

# ============================================================ 印刷用 =========
ws = wb.create_sheet("印刷用")
ws.sheet_properties.tabColor = GREEN
ws.sheet_view.showGridLines = False
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.orientation = "portrait"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1
ws.page_setup.paperSize = 9          # A4
ws.print_area = "A1:F28"

for c, w in {"A": 2.5, "B": 7, "C": 30, "D": 16, "E": 14, "F": 2.5}.items():
    ws.column_dimensions[c].width = w

ws.row_dimensions[1].height = 36
title_band(ws, "B1:E1", "　🍿 仕込み指示書（コンセッション）")
ws.row_dimensions[2].height = 24
chip(ws, "B2:E2", "  👇 この数を作ってください", CHIP_CORAL, CORAL, 12, True)

ws.row_dimensions[3].height = 22
ws.merge_cells("B3:E3")
ws["B3"] = ('="対象時間帯: "&IF(準備数計算!$J$7="*","1日全体",準備数計算!$D$5)&'
            '"　｜　ピーク動員数: "&IF(準備数計算!$D$6="","（未入力）",'
            'TEXT(準備数計算!$D$6,"#,##0")&"人")')
style_range(ws, "B3:E3", font=fnt(11, True, INK), alignment=align("left"))
ws.row_dimensions[4].height = 20
ws.merge_cells("B4:E4")
ws["B4"] = ('="倍率: "&IF(準備数計算!$D$7="","（未入力）",'
            '"×"&TEXT(準備数計算!$D$7*100,"0")&"%")&"　｜　"&準備数計算!$E$4')
style_range(ws, "B4:E4", font=fnt(9.5, False, "5B6472"), alignment=align("left"))
ws.row_dimensions[5].height = 22
note(ws, "B5:E5", "日付・回：＿＿＿＿＿＿＿＿＿＿　　作成者：＿＿＿＿＿＿　　確認者：＿＿＿＿＿＿", 10, INK)
ws.row_dimensions[6].height = 14
ws.merge_cells("B6:E6")
ws["B6"] = "=準備数計算!$B$8"
style_range(ws, "B6:E6", font=fnt(8, True, RED), alignment=align("left"))

ws.row_dimensions[7].height = 26
for ref, text in [("B7", "No."), ("C7", "商品名"), ("E7", "できたら✓")]:
    style_range(ws, ref, font=fnt(10, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center"), border=BORDER_LIGHT)
    ws[ref] = text
style_range(ws, "D7", font=fnt(11, True, "FFFFFF"), fl=fill(CORAL),
            alignment=align("center"), border=BORDER_LIGHT)
ws["D7"] = "作る数"

for i in range(N_SLOTS):
    r = 8 + i
    mr = ROW_M0 + i
    ws.row_dimensions[r].height = 24
    ws[f"B{r}"] = f'=IF(準備数計算!$C{mr}="","",{i + 1})'
    ws[f"C{r}"] = f'=IF(準備数計算!$C{mr}="","",準備数計算!$C{mr})'
    ws[f"D{r}"] = f'=IF(準備数計算!$C{mr}="","",準備数計算!$F{mr})'
    ws[f"E{r}"] = f'=IF(準備数計算!$C{mr}="","","☐")'
    style_range(ws, f"B{r}", font=fnt(9.5, False, GRAY), alignment=align("center"))
    style_range(ws, f"C{r}", font=fnt(11.5), alignment=align("left"))
    style_range(ws, f"D{r}", font=fnt(14, True, CORAL), fl=fill(F_BASE),
                alignment=align("center"), num="#,##0")
    style_range(ws, f"E{r}", font=fnt(12, False, "B9C0CC"), alignment=align("center"))
    for col in "BCE":
        ws[f"{col}{r}"].border = BORDER_LIGHT
    ws[f"D{r}"].border = Border(bottom=thin, top=thin, left=coral_side, right=coral_side)

ws.row_dimensions[28].height = 16
note(ws, "B28:E28", "※ 数字は「準備数計算」シートから自動で入ります｜A4縦・1ページ印刷", 8)

# ========================================================== 日別データ =======
ws = wb.create_sheet("日別データ")
ws.sheet_properties.tabColor = TEAL
ws.sheet_view.showGridLines = False
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1
ws.page_setup.paperSize = 9          # A4

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
chip(ws, "B6", "  動員数（1日計）", CHIP_TEAL, INK, 10)
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
ws["J6"] = '=IF(COUNT(C6:I6)=0,"",SUM(C6:I6))'
style_range(ws, "J6", font=fnt(10.5, True, TEAL), fl=fill(F_AUTO),
            alignment=align("center"), border=BORDER_LIGHT, num="#,##0")
note(ws, "J5", "7日計", 8, GRAY, h="center")

for k, band in enumerate(BANDS):                      # 時間帯別動員(任意) 行7-10
    r = 7 + k
    ws.row_dimensions[r].height = 19
    chip(ws, f"B{r}", f"  動員数（{band}）", CHIP_TEAL, "5B6472", 9, False)
    for j in range(7):
        col = get_column_letter(3 + j)
        ws[f"{col}{r}"] = ATT_BANDS[band][j]
        style_range(ws, f"{col}{r}", font=fnt(9.5), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT, num="#,##0")
    ws[f"J{r}"] = f'=IF(COUNT(C{r}:I{r})=0,"",SUM(C{r}:I{r}))'
    style_range(ws, f"J{r}", font=fnt(9.5, True, "5B6472"), fl=fill(F_AUTO),
                alignment=align("center"), border=BORDER_LIGHT, num="#,##0")
ws["C7"].comment = Comment("時間帯別の動員数（任意）。時間帯別の購買率を使うときだけ入力してください。"
                           "サンプル値です。", "準備数ツール")
note(ws, "K7:K10", "← 時間帯別の購買率を使う場合に入力（任意）", 8, GRAY, wrap=True)
band_mismatch = FormulaRule(
    formula=["AND(COUNT(C$7:C$10)=4,SUM(C$7:C$10)<>C$6)"], fill=fill("FBE3C8"))
ws.conditional_formatting.add("C7:I10", band_mismatch)

weekend_red = FormulaRule(formula=['WEEKDAY(C$4)=1'], font=Font(name=FONT_NAME, color=RED, bold=True))
weekend_blue = FormulaRule(formula=['WEEKDAY(C$4)=7'], font=Font(name=FONT_NAME, color="3B6FD4", bold=True))
ws.conditional_formatting.add("C4:I5", weekend_red)
ws.conditional_formatting.add("C4:I5", weekend_blue)

ws.row_dimensions[11].height = 16
note(ws, "B11", "  CSV取込チェック", 8, GRAY)
for j in range(7):
    col = get_column_letter(3 + j)
    ws[f"{col}11"] = (f'=IF({col}$4="","",IF(COUNTIFS(CSV貼付!$A$5:$A${CSV_END},">="&{col}$4,'
                      f'CSV貼付!$A$5:$A${CSV_END},"<"&{col}$4+1)=0,"⚠なし","✔"))')
    style_range(ws, f"{col}11", font=fnt(8, False, GRAY), alignment=align("center"))
csv_ok = FormulaRule(formula=['C$11="✔"'], font=Font(name=FONT_NAME, size=8, color=GREEN))
csv_ng = FormulaRule(formula=['ISNUMBER(SEARCH("⚠",C$11))'],
                     font=Font(name=FONT_NAME, size=8, bold=True, color=RED))
ws.conditional_formatting.add("C11:I11", csv_ok)
ws.conditional_formatting.add("C11:I11", csv_ng)

ws.row_dimensions[12].height = 22
for ref, text in [("A12", "No."), ("B12", "商品名"), ("J12", "7日合計"), ("K12", "メモ")]:
    style_range(ws, ref, font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center"), border=BORDER_LIGHT)
    ws[ref] = text
for j in range(7):
    col = get_column_letter(3 + j)
    ws[f"{col}12"] = f'=IF({col}$4="","",{col}$4)'
    style_range(ws, f"{col}12", font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
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
                           f'SUMIFS(CSV貼付!$C$5:$C${CSV_END},'
                           f'CSV貼付!$A$5:$A${CSV_END},">="&{col}$4,'
                           f'CSV貼付!$A$5:$A${CSV_END},"<"&{col}$4+1,'
                           f'CSV貼付!$B$5:$B${CSV_END},$B{r}))')
        style_range(ws, f"{col}{r}", font=fnt(10, False, "5B6472"),
                    fl=fill(F_AUTO if i % 2 == 0 else F_ZEBRA),
                    alignment=align("center"), num="#,##0")
    ws[f"J{r}"] = f'=IF($B{r}="","",SUM(C{r}:I{r}))'
    style_range(ws, f"J{r}", font=fnt(10, True, "5B6472"), fl=fill(F_AUTO),
                alignment=align("center"), num="#,##0")
    style_range(ws, f"K{r}", font=fnt(9), alignment=align("left"))
    for col in "ABCDEFGHIJK":
        ws[f"{col}{r}"].border = Border(bottom=hair, left=hair, right=hair)
    ws[f"B{r}"].border = BORDER_INPUT

ws[f"B{ROW_P0}"].comment = Comment("商品名はサンプルです(最大20枠)。CSV側の商品名と完全一致させてください。", "準備数ツール")
dup_rule = FormulaRule(
    formula=[f'AND($B{ROW_P0}<>"",COUNTIF($B${ROW_P0}:$B${ROW_P0 + N_SLOTS - 1},$B{ROW_P0})>1)'],
    font=Font(name=FONT_NAME, bold=True, color=RED), fill=fill("FDECEC"))
ws.conditional_formatting.add(f"B{ROW_P0}:B{ROW_P0 + N_SLOTS - 1}", dup_rule)
dv_att = DataValidation(type="whole", operator="between", formula1="0", formula2="999999",
                        showErrorMessage=True)
dv_att.error = "動員数は 0〜999,999 の整数で入力してください（文字や記号は不可）"
dv_att.errorTitle = "動員数"
ws.add_data_validation(dv_att)
dv_att.add("C6:I10")
last = ROW_P0 + N_SLOTS - 1
ws.row_dimensions[last + 1].height = 26
note(ws, f"A{last + 1}:K{last + 1}",
     "※ 販売数のセルは自動計算です。CSVを使わず手入力したい場合は、数値を直接入力しても使えます"
     "（自動集計に戻すには、となりのセルの数式をコピーしてください。手入力時は時間帯別の計算は使えません）。",
     8.5, GRAY, wrap=True)

ws.freeze_panes = "C13"

# ============================================================ CSV貼付 ========
ws = wb.create_sheet("CSV貼付")
ws.sheet_properties.tabColor = AMBER
ws.sheet_view.showGridLines = False
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.page_setup.paperSize = 9          # A4
ws.print_area = "A1:L64"

for c, w in {"A": 12, "B": 26, "C": 10, "D": 13, "E": 12, "F": 10,
             "G": 10, "H": 2.5, "I": 15, "J": 12, "K": 13, "L": 9}.items():
    ws.column_dimensions[c].width = w

ws.row_dimensions[1].height = 34
title_band(ws, "A1:L1", "　📋 CSV貼付（集計ソフトのデータ）")
ws.row_dimensions[2].height = 34
note(ws, "A2:F2",
     "集計ソフトのCSVを5行目以降にそのまま貼り付け（A=日付・B=商品名・C=販売数・D=時刻か時間帯(任意)・"
     "E〜G=予備、最大2000行）。列が多いCSVは必要な列だけ貼ると確実です。",
     9, GRAY, wrap=True)
ws.row_dimensions[3].height = 18

# 時間帯の区切り設定(貼付範囲より上の行なので、貼り付けで壊れない)
ws.column_dimensions["H"].width = 8
for lref, vref, label, val in [("G2", "H2", "⏰深夜→朝", 5 / 24), ("G3", "H3", "朝→昼", 11 / 24),
                               ("I2", "J2", "昼→夕方", 15 / 24), ("I3", "J3", "夕方→夜", 18 / 24)]:
    note(ws, lref, label + " ", 8.5, GRAY, h="right")
    ws[vref] = val
    style_range(ws, vref, font=fnt(9, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT, num="h:mm")
ws["H2"].comment = Comment("時間帯の区切り時刻です（変更OK）。この時刻より前は「夜」（深夜・レイトショー扱い）、"
                           "ここから「朝→昼」の時刻までが「朝」です。", "準備数ツール")

chip(ws, "K2", "貼付行数", CHIP_AMBER, INK, 8.5, False, "center")
ws["L2"] = f"=COUNTA($A$5:$A${CSV_END})"
style_range(ws, "L2", font=fnt(10, True), alignment=align("center"), num="#,##0")
chip(ws, "K3", "⚠ 未登録", CHIP_AMBER, INK, 8.5, False, "center")
# チェック列(I列)が上書きで消えても件数が出るよう、貼付データを直接判定する
ws["L3"] = (f'=SUMPRODUCT(($B$5:$B${CSV_END}<>"")*'
            f'ISNA(MATCH($B$5:$B${CSV_END},日別データ!$B${ROW_P0}:$B${ROW_P0 + N_SLOTS - 1},0)))')
style_range(ws, "L3", font=fnt(10, True), alignment=align("center"), num="#,##0")
warn_red = FormulaRule(formula=["$L$3>0"], font=Font(name=FONT_NAME, color=RED, bold=True))
ws.conditional_formatting.add("L3", warn_red)

ws.row_dimensions[4].height = 22
for ref, text in [("A4", "日付"), ("B4", "商品名"), ("C4", "販売数"),
                  ("D4", "時刻・時間帯"), ("E4", "金額（予備）"), ("F4", "（予備）"),
                  ("G4", "（予備）"), ("I4", "商品名チェック"), ("J4", "時間帯判定")]:
    style_range(ws, ref, font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                alignment=align("center"), border=BORDER_LIGHT)
    ws[ref] = text
ws["I4"].comment = Comment("「日別データ」の商品名一覧に載っているかを自動判定します。"
                           "「⚠ 未登録」の行は集計されません。", "準備数ツール")
ws["J4"].comment = Comment("D列の時刻(または時間帯名)から 朝/昼/夕方/夜 を自動判定します。"
                           "D列が空の行は「－」(時間帯なし)になります。", "準備数ツール")

for i in range(CSV_MAX):
    r = 5 + i
    for col in "ABCDEFG":
        ws[f"{col}{r}"].border = BORDER_HAIR
        ws[f"{col}{r}"].font = fnt(9.5)
    ws[f"A{r}"].number_format = "m/d"
    ws[f"A{r}"].alignment = align("center")
    ws[f"C{r}"].number_format = "#,##0"
    ws[f"C{r}"].alignment = align("center")
    ws[f"D{r}"].number_format = "h:mm"
    ws[f"D{r}"].alignment = align("center")
    ws[f"E{r}"].number_format = "#,##0"
    ws[f"E{r}"].alignment = align("center")
    ws[f"I{r}"] = (f'=IF($B{r}="","",IF(ISNUMBER(MATCH($B{r},日別データ!$B${ROW_P0}:$B${ROW_P0 + N_SLOTS - 1},0)),'
                   f'"✔ OK","⚠ 未登録"))')
    ws[f"I{r}"].font = fnt(9, False, GRAY)
    ws[f"I{r}"].alignment = align("center")
    ws[f"I{r}"].border = BORDER_HAIR
    ws[f"J{r}"] = (f'=IF($B{r}="","",IF($D{r}="","－",'
                   f'IF(ISNUMBER($D{r}),'
                   f'IF(AND($D{r}>=1,MOD($D{r},1)=0),"－",'
                   f'IF(MOD($D{r},1)<$H$2,"夜",IF(MOD($D{r},1)<$H$3,"朝",'
                   f'IF(MOD($D{r},1)<$J$2,"昼",IF(MOD($D{r},1)<$J$3,"夕方","夜"))))),'
                   f'IF(OR($D{r}="朝",$D{r}="昼",$D{r}="夕方",$D{r}="夜"),$D{r},"⚠ 不明"))))')
    ws[f"J{r}"].font = fnt(9, False, GRAY)
    ws[f"J{r}"].alignment = align("center")
    ws[f"J{r}"].border = BORDER_HAIR

ok_green = FormulaRule(formula=['ISNUMBER(SEARCH("✔",I5))'],
                       font=Font(name=FONT_NAME, size=9, color=GREEN))
ng_red = FormulaRule(formula=['ISNUMBER(SEARCH("⚠",I5))'],
                     font=Font(name=FONT_NAME, size=9, bold=True, color=RED),
                     fill=fill("FDECEC"))
ws.conditional_formatting.add(f"I5:I{CSV_END}", ok_green)
ws.conditional_formatting.add(f"I5:I{CSV_END}", ng_red)
band_ng = FormulaRule(formula=['ISNUMBER(SEARCH("⚠",J5))'],
                      font=Font(name=FONT_NAME, size=9, bold=True, color=RED))
ws.conditional_formatting.add(f"J5:J{CSV_END}", band_ng)

for i, (d, name, qty, tfrac, amount) in enumerate(CSV_ROWS):
    r = 5 + i
    ws[f"A{r}"] = d
    ws[f"B{r}"] = name
    ws[f"C{r}"] = qty
    ws[f"D{r}"] = tfrac
    ws[f"E{r}"] = amount
ws["A5"].comment = Comment("5行目以降はサンプルデータです。実際のCSVに置き換えてください。", "準備数ツール")

ws.freeze_panes = "A5"

# ------------------------------------------------------------------ save -----
wb.properties.title = "コンセッション事前準備数ツール"
wb.properties.creator = "TOHOシネマズ新宿 コンセッション"
wb.save(OUT)
print("saved:", OUT, "csv_rows:", len(CSV_ROWS))
