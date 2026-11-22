# -*- coding: utf-8 -*-
"""
MGRシフト表 → シフトライン人数確認表 を作る。

使い方:
  python build.py <MGRシフト.xlsx> <月シート名(例:12)> <出力.xlsx>

シート構成:
  シフトライン : 日を選ぶと、その日の出勤者を出勤時刻順に30分単位のバーで表示(人数つき)
  月間         : 日×30分の人数一覧(出勤者数・必要人数・行事つき)
  社員別       : 社員ごとの出勤日数・区分別日数・勤務時間
  設定         : 表示開始時刻、基準人数(30分ごと)、使い方
  MGR貼付      : MGRシフト表の月シートを値貼り付けする場所(初期値として指定月を転記)
  MGRマスタ    : MGRシフト表の「マスタ」シートの値
  計算         : 自動計算用(日×社員の出勤・退勤)。編集不要
"""
import sys, datetime as dt
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.styles.differential import DifferentialStyle
from openpyxl.formatting.rule import Rule, ColorScaleRule, FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter as L

MGR, MONTH_SHEET, OUT = sys.argv[1:4]

FONT = "Meiryo UI"
NSLOT, NSTAFF, NDAY = 50, 30, 31          # 30分×50マス(25時間), 社員30枠, 31日
F9 = Font(name=FONT, size=9); F10 = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
TITLE = Font(name=FONT, size=16, bold=True, color="2F6597")
GREY = Font(name=FONT, size=9, color="66727A")
BLUE = Font(name=FONT, size=10, color="0000FF")
LINK = Font(name=FONT, size=10, bold=True, color="2F6597")
HFILL = PatternFill("solid", fgColor="2F6597"); HFONT = Font(name=FONT, size=9, bold=True, color="FFFFFF")
SUBFILL = PatternFill("solid", fgColor="EAF0F3")
YELLOW = PatternFill("solid", fgColor="FFFF00")
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center")

mgr_v = openpyxl.load_workbook(MGR, data_only=True)
src, master = mgr_v[MONTH_SHEET], mgr_v["マスタ"]

def hours(v):
    """マスタの時刻セル → 0:00起点の時間(翌日は+24)。数値以外は None"""
    if isinstance(v, dt.datetime):
        return 24 + v.hour + v.minute / 60
    if isinstance(v, dt.time):
        return v.hour + v.minute / 60
    if isinstance(v, (int, float)):
        return v * 24
    return None

def slot_t(j):               # j番目のマスの開始時刻(時) を表す数式片
    return f"(設定!$C$4*24+{j * 0.5})"

def hdr(ws, row, col, text, fill=HFILL, font=HFONT, align=CENTER):
    c = ws.cell(row, col, text); c.fill = fill; c.font = font; c.alignment = align; c.border = BOX
    return c

wb = openpyxl.Workbook()
wb.remove(wb.active)
SL = wb.create_sheet("シフトライン")
MO = wb.create_sheet("月間")
ST = wb.create_sheet("社員別")
SE = wb.create_sheet("設定")
PA = wb.create_sheet("MGR貼付")
MA = wb.create_sheet("MGRマスタ")
CA = wb.create_sheet("計算")
for w, color in ((SL, "2F6597"), (MO, "2F6597"), (ST, "2F6597"), (SE, "8DBCAF"), (PA, "F4B183"), (MA, "F4B183"), (CA, "BFBFBF")):
    w.sheet_view.showGridLines = False
    w.sheet_properties.tabColor = color

# ================================================================ MGR貼付 / MGRマスタ
for row in src.iter_rows():
    for c in row:
        if c.value is None:
            continue
        t = PA.cell(c.row, c.column, c.value); t.font = F9
        if isinstance(c.value, (dt.datetime, dt.date)):
            t.number_format = "m/d" if c.row == 3 else "yyyy/m"
            if c.row == 3:
                t.font = Font(name=FONT, size=9, bold=True)
PA.column_dimensions["A"].width = 6; PA.column_dimensions["B"].width = 6; PA.column_dimensions["C"].width = 8
for col in range(4, 35):
    PA.column_dimensions[L(col)].width = 4.2
PA.freeze_panes = "D7"
for r in range(7, 66, 2):
    for col in range(3, 35):
        PA.cell(r, col).fill = PatternFill("solid", fgColor="F3F6FA")

for row in master.iter_rows():
    for c in row:
        if c.value is None:
            continue
        t = MA.cell(c.row, c.column)
        if c.column in (1, 3) and 6 <= c.row <= 53 and hours(c.value) is not None:
            t.value = hours(c.value) / 24; t.number_format = "h:mm"
        else:
            t.value = c.value
        t.font = F9
MA["A1"] = "MGRシフト表の「マスタ」シートを値貼り付けする場所です(A1に貼り付け)。A列=出勤、B列=記号、C列=退勤、D列=区分。退勤が翌日の場合は24時間を足した時刻(例 2:00 → 26:00)で持ちます。"
MA["A1"].font = GREY
for col, w in zip("ABCDEFGHIJKLM", [8, 6, 8, 7, 3, 7, 9, 3, 10, 3, 10, 3, 10]):
    MA.column_dimensions[col].width = w

# ================================================================ 設定
SE.column_dimensions["A"].width = 2; SE.column_dimensions["B"].width = 20; SE.column_dimensions["C"].width = 14; SE.column_dimensions["D"].width = 3
for j in range(NSLOT):
    SE.column_dimensions[L(5 + j)].width = 4.2
SE["B2"] = "≡　設定"; SE["B2"].font = TITLE
SE["B4"] = "表示開始時刻"; SE["B4"].font = BOLD
c = SE["C4"]; c.value = 5 / 24; c.number_format = "h:mm"; c.font = BLUE; c.fill = YELLOW; c.border = BOX; c.alignment = CENTER
SE["E4"] = "← シフトラインの左端。ここから30分×50マス(25時間)を表示します。5:00なら翌6:00まで。"; SE["E4"].font = GREY
SE["B5"] = "対象年月(自動)"; SE["B5"].font = BOLD
SE["C5"] = '=IF(ISNUMBER(MGR貼付!$D$3),TEXT(MGR貼付!$D$3,"yyyy年m月"),"貼付なし")'; SE["C5"].font = F10; SE["C5"].alignment = CENTER
SE["E5"] = "← MGR貼付シートのD3(1日の日付)から自動で判定します。"; SE["E5"].font = GREY
SE["B6"] = "月初(自動)"; SE["B6"].font = BOLD
SE["C6"] = '=IF(ISNUMBER(MGR貼付!$D$3),DATE(YEAR(MGR貼付!$D$3),MONTH(MGR貼付!$D$3),1),"")'; SE["C6"].number_format = "yyyy/m/d"; SE["C6"].font = F10; SE["C6"].alignment = CENTER
SE["B7"] = "月の日数(自動)"; SE["B7"].font = BOLD
SE["C7"] = '=IF($C$6="",0,DAY(EOMONTH($C$6,0)))'; SE["C7"].font = F10; SE["C7"].alignment = CENTER

SE["B9"] = "基準人数(30分ごと)　下回る時間帯を赤く表示します。空欄なら判定しません。"; SE["B9"].font = BOLD
hdr(SE, 10, 2, "時刻 →", SUBFILL, Font(name=FONT, size=9, bold=True, color="30363B"))
hdr(SE, 11, 2, "基準人数", SUBFILL, Font(name=FONT, size=9, bold=True, color="30363B"))
for j in range(NSLOT):
    c = hdr(SE, 10, 5 + j, f'=IF(MOD({slot_t(j)},1)=0,TEXT({slot_t(j)}/24,"[h]:mm"),"")', SUBFILL, Font(name=FONT, size=8, bold=True, color="30363B"), LEFT)
    c = SE.cell(11, 5 + j); c.font = BLUE; c.fill = YELLOW; c.border = BOX; c.alignment = CENTER
dv = DataValidation(type="whole", operator="between", formula1="0", formula2="99", allow_blank=True)
SE.add_data_validation(dv); dv.add(f"E11:{L(4 + NSLOT)}11")

guide = [
    (13, "■ 毎月の手順", BOLD),
    (14, "1. MGRシフト表のファイルで月のシート(例「12」)を開き、Ctrl+A で全選択 → Ctrl+C でコピー。", F10),
    (15, "2. このファイルの「MGR貼付」シートの A1 を選び、「値の貼り付け」(右クリック → 貼り付けのオプション → 値 / Ctrl+Alt+V → 値)。", F10),
    (16, "3. これで完了。年月・社員・日ごとのシフトが「シフトライン」「月間」「社員別」に自動で反映されます。", F10),
    (17, "4. 出勤記号や時刻が変わったときは、MGRシフト表の「マスタ」シートも同じ手順で「MGRマスタ」の A1 に値貼り付け。", F10),
    (19, "■ 変換ルール", BOLD),
    (20, "・記号(A〜X、A'など)はMGRマスタの出勤〜退勤に展開します。休・有・リフ・特・外・出・Ｂ半・出勤 など出勤時刻のない記号は勤務なしです。", F10),
    (21, "・早番のW〜X'はマスタで翌日扱い(29:00など)になっていますが、当日の5:00〜6:30として扱います。夜番のR〜V'(0:00〜4:30出勤)は当日深夜(24:00〜)として扱います。", F10),
    (22, "・社員はMGR貼付のC列(C7, C9, … C65 の30枠)から自動で拾います。必要人数はMGR貼付の66行目(必要人数)を使います。", F10),
    (23, "・バーは30分単位です。表示範囲(25時間)の外に出る勤務は、はみ出した分が表示されません。", F10),
]
for r, text, f in guide:
    SE.cell(r, 2, text).font = f

# ================================================================ 計算 (日×社員)
for col, t, w in zip(range(1, 9), ["日", "No", "氏名", "記号", "区分", "出勤h", "退勤h", "並替キー"], [5, 5, 10, 6, 6, 7, 7, 9]):
    hdr(CA, 1, col, t); CA.column_dimensions[L(col)].width = w
CA["J1"] = "自動計算用です。編集しないでください。"; CA["J1"].font = GREY
ROWS = NDAY * NSTAFF                     # 930
for d in range(1, NDAY + 1):
    for i in range(1, NSTAFF + 1):
        r = 1 + (d - 1) * NSTAFF + i
        m = f'MATCH($D{r},MGRマスタ!$B$6:$B$53,0)'
        raw_s = f'INDEX(MGRマスタ!$A$6:$A$53,{m})*24'; raw_e = f'INDEX(MGRマスタ!$C$6:$C$53,{m})*24'
        CA.cell(r, 1, d); CA.cell(r, 2, i)
        CA.cell(r, 3, f'=IF($A{r}>設定!$C$7,"",IF(OR(INDEX(MGR貼付!$C$7:$C$65,2*$B{r}-1)="",INDEX(MGR貼付!$C$7:$C$65,2*$B{r}-1)=0),"",TRIM(INDEX(MGR貼付!$C$7:$C$65,2*$B{r}-1)&"")))')
        CA.cell(r, 4, f'=IF($C{r}="","",IF(OR(INDEX(MGR貼付!$D$7:$AH$65,2*$B{r}-1,$A{r})="",INDEX(MGR貼付!$D$7:$AH$65,2*$B{r}-1,$A{r})=0),"",TRIM(INDEX(MGR貼付!$D$7:$AH$65,2*$B{r}-1,$A{r})&"")))')
        CA.cell(r, 5, f'=IF($D{r}="","",IFERROR(INDEX(MGRマスタ!$D$6:$D$53,{m})&"",""))')
        CA.cell(r, 6, f'=IF($D{r}="","",IFERROR(ROUND(IF(AND({raw_s}>=24,$E{r}<>"夜番"),{raw_s}-24,{raw_s}),4),""))')
        CA.cell(r, 7, f'=IF($F{r}="","",IFERROR(ROUND($F{r}+IF({raw_e}<={raw_s},{raw_e}+24-{raw_s},{raw_e}-{raw_s}),4),""))')
        CA.cell(r, 8, f'=IF($F{r}="","",$F{r}*100+$B{r})')
        for col in range(1, 9):
            CA.cell(r, col).font = F9
CA.freeze_panes = "A2"
R0, R1 = 2, 1 + ROWS
def CR(col):                 # 計算シートの列範囲
    return f"計算!${col}${R0}:${col}${R1}"

# ================================================================ シフトライン
FIRST = 5                                # バー先頭列 E
LAST = FIRST + NSLOT - 1
HC = LAST + 2                            # 非表示補助: pos / 計算行 / 出勤h / 退勤h
HS = HC + 5                              # 非表示補助: 設定順のキー
SL.column_dimensions["A"].width = 2; SL.column_dimensions["B"].width = 9
SL.column_dimensions["C"].width = 4.5; SL.column_dimensions["D"].width = 11.5
for j in range(NSLOT):
    SL.column_dimensions[L(FIRST + j)].width = 2.9
SL.column_dimensions[L(LAST + 1)].width = 2
for col in list(range(HC, HC + 4)) + [HS]:
    SL.column_dimensions[L(col)].hidden = True
TOP, BOT = 9, 9 + NSTAFF - 1            # 社員行 9〜38

SL["B2"] = '="【"&MGR貼付!$B$1&"】シフトライン人数確認表"'; SL["B2"].font = TITLE
SL["B4"] = "↓ 日を選ぶ(1〜31)"; SL["B4"].font = Font(name=FONT, size=9, color="2F6597")
c = SL["B5"]; c.value = 1; c.font = Font(name=FONT, size=16, bold=True); c.fill = YELLOW; c.alignment = CENTER; c.border = BOX
SL.merge_cells("B5:C5")
dv = DataValidation(type="whole", operator="between", formula1="1", formula2="31", allow_blank=False)
SL.add_data_validation(dv); dv.add("B5")
DATEF = "DATE(YEAR(設定!$C$6),MONTH(設定!$C$6),$B$5)"
c = SL["D5"]; c.value = (f'=IF(AND(ISNUMBER($B$5),設定!$C$6<>"",$B$5>=1,$B$5<=設定!$C$7),'
                         f'TEXT({DATEF},"yyyy/m/d")&"（"&CHOOSE(WEEKDAY({DATEF},2),"月","火","水","木","金","土","日")&"）","")')
c.font = Font(name=FONT, size=16, bold=True); c.alignment = LEFT
SL.merge_cells(start_row=5, start_column=4, end_row=5, end_column=FIRST + 9)
c = SL.cell(5, FIRST + 11, f'=IF($D$5="","対象月にこの日はありません","出勤 "&COUNTIF($B${TOP}:$B${BOT},"?*")&" 名"&IF(ISNUMBER(INDEX(MGR貼付!$D$66:$AH$66,$B$5))," ／ 必要 "&INDEX(MGR貼付!$D$66:$AH$66,$B$5)&" 名",""))')
c.font = Font(name=FONT, size=12, bold=True, color="2F6597")
c = SL.cell(5, FIRST + 27, '=IF($D$5="","",IF(IF(OR(INDEX(MGR貼付!$D$5:$AH$5,$B$5)="",INDEX(MGR貼付!$D$5:$AH$5,$B$5)=0),"",TRIM(INDEX(MGR貼付!$D$5:$AH$5,$B$5)&""))="","","行事： "&INDEX(MGR貼付!$D$5:$AH$5,$B$5)))')
c.font = Font(name=FONT, size=11, bold=True, color="C00000")
SL.row_dimensions[5].height = 30
SL["B6"] = "名前・記号・勤務時間はMGR貼付から自動。バーは30分単位。上段の数字はその30分にいる人数(設定の基準人数を下回ると赤)。"; SL["B6"].font = GREY

for col, t in zip((2, 3, 4), ("名前", "記号", "勤務時間")):
    hdr(SL, 7, col, t)
for j in range(NSLOT):
    hdr(SL, 7, FIRST + j, f'=IF(MOD({slot_t(j)},1)=0,TEXT({slot_t(j)}/24,"[h]:mm"),"")', HFILL, HFONT, LEFT)
SL.row_dimensions[7].height = 18
c = SL.cell(8, 4, "人数 →"); c.font = Font(name=FONT, size=8, bold=True, color="30363B"); c.alignment = Alignment(horizontal="right")
for j in range(NSLOT):
    col = L(FIRST + j)
    c = SL.cell(8, FIRST + j, f'=IF($D$5="","",COUNTIF({col}${TOP}:{col}${BOT},1))')
    c.font = Font(name=FONT, size=8, bold=True, color="30363B"); c.alignment = CENTER; c.fill = SUBFILL
    if j % 2 == 0:
        c.border = Border(left=Side(style="thin", color="6B7780"))
SL.row_dimensions[8].height = 15

cP, cI, cB, cE, cK = L(HC), L(HC + 1), L(HC + 2), L(HC + 3), L(HS)
for i in range(1, NSTAFF + 1):          # 設定順のキー
    r = TOP + i - 1
    SL.cell(r, HS, f'=IF($D$5="","",INDEX({CR("H")},($B$5-1)*{NSTAFF}+{i}))').font = GREY
for k in range(NSTAFF):                  # 表示行(出勤時刻順)
    r = TOP + k
    SL.cell(r, HC, f'=IFERROR(MATCH(SMALL(${cK}${TOP}:${cK}${BOT},{k+1}),${cK}${TOP}:${cK}${BOT},0),"")')
    SL.cell(r, HC + 1, f'=IF(${cP}{r}="","",($B$5-1)*{NSTAFF}+${cP}{r})')
    SL.cell(r, HC + 2, f'=IF(${cI}{r}="","",INDEX({CR("F")},${cI}{r}))')
    SL.cell(r, HC + 3, f'=IF(${cI}{r}="","",INDEX({CR("G")},${cI}{r}))')
    for col in range(HC, HC + 4):
        SL.cell(r, col).font = GREY
    c = SL.cell(r, 2, f'=IF(${cI}{r}="","",INDEX({CR("C")},${cI}{r}))'); c.font = BOLD; c.alignment = CENTER
    c = SL.cell(r, 3, f'=IF(${cI}{r}="","",INDEX({CR("D")},${cI}{r}))'); c.font = F10; c.alignment = CENTER
    c = SL.cell(r, 4, f'=IF(${cI}{r}="","",TEXT(${cB}{r}/24,"[h]:mm")&"-"&TEXT(${cE}{r}/24,"[h]:mm"))'); c.font = F9; c.alignment = CENTER
    for j in range(NSLOT):
        t = slot_t(j)
        c = SL.cell(r, FIRST + j, f'=IF(${cB}{r}="","",IF(AND({t}>=${cB}{r},{t}<${cE}{r}),1,""))'); c.number_format = ";;;"
    SL.row_dimensions[r].height = 18
hdr(SL, BOT + 1, 2, "出勤計")
c = SL.cell(BOT + 1, 3, f'=IF($D$5="","",COUNTIF($B${TOP}:$B${BOT},"?*"))'); c.number_format = '0"名"'; c.font = BOLD; c.alignment = CENTER
SL.merge_cells(start_row=BOT + 1, start_column=3, end_row=BOT + 1, end_column=4)

bars = f"{L(FIRST)}{TOP}:{L(LAST)}{BOT}"
SL.conditional_formatting.add(bars, Rule(type="expression", formula=[f"{L(FIRST)}{TOP}=1"],
    dxf=DifferentialStyle(fill=PatternFill("solid", fgColor="5B9BD5", bgColor="5B9BD5"))))
grid = Border(left=Side(style="hair", color="9AA5AE"), right=Side(style="hair", color="9AA5AE"),
              top=Side(style="thin", color="9AA5AE"), bottom=Side(style="thin", color="9AA5AE"))
SL.conditional_formatting.add(f"B{TOP}:{L(LAST)}{BOT}", Rule(type="expression", formula=[f'$B{TOP}<>""'], dxf=DifferentialStyle(border=grid)))
SL.conditional_formatting.add(f"B{TOP}:D{BOT}", Rule(type="expression", formula=[f'$B{TOP}<>""'],
    dxf=DifferentialStyle(fill=PatternFill("solid", fgColor="EAF0F3", bgColor="EAF0F3"))))
for j in range(0, NSLOT, 2):
    SL.conditional_formatting.add(f"{L(FIRST + j)}{TOP}:{L(FIRST + j)}{BOT}", Rule(type="expression", formula=[f'$B{TOP}<>""'],
        dxf=DifferentialStyle(border=Border(left=Side(style="thin", color="6B7780")))))
SL.conditional_formatting.add(f"{L(FIRST)}8:{L(LAST)}8", Rule(type="expression",
    formula=[f'AND(ISNUMBER({L(FIRST)}$8),ISNUMBER(設定!{L(FIRST)}$11),{L(FIRST)}$8<設定!{L(FIRST)}$11)'],
    dxf=DifferentialStyle(font=Font(color="FFFFFF", bold=True), fill=PatternFill("solid", fgColor="C00000", bgColor="C00000"))))
SL.freeze_panes = f"{L(FIRST)}{TOP}"
SL.sheet_view.zoomScale = 90
SL.print_area = f"B2:{L(LAST)}{BOT + 1}"
SL.page_setup.orientation = "landscape"; SL.page_setup.paperSize = SL.PAPERSIZE_A4
SL.page_setup.fitToWidth = 1; SL.page_setup.fitToHeight = 1; SL.sheet_properties.pageSetUpPr.fitToPage = True

# ================================================================ 月間 (日×30分の人数)
MF = 9                                   # バー先頭列 I
ML = MF + NSLOT - 1
MO.column_dimensions["A"].width = 2
for col, w in zip("BCDEFGH", [4, 6, 4, 22, 6, 6, 6]):
    MO.column_dimensions[col].width = w
for j in range(NSLOT):
    MO.column_dimensions[L(MF + j)].width = 2.9
MO["B2"] = '="【"&MGR貼付!$B$1&"】月間 時間帯別人数　"&設定!$C$5'; MO["B2"].font = TITLE
MO["B3"] = "各30分にいる人数。色が濃いほど多く、設定の基準人数を下回るマスは赤。差＝出勤者数−必要人数(MGRシフト表66行目)。"; MO["B3"].font = GREY
for col, t in zip(range(2, 9), ["日", "日付", "曜日", "行事", "出勤", "必要", "差"]):
    hdr(MO, 5, col, t)
for j in range(NSLOT):
    hdr(MO, 5, MF + j, f'=IF(MOD({slot_t(j)},1)=0,TEXT({slot_t(j)}/24,"[h]:mm"),"")', HFILL, HFONT, LEFT)
MO.row_dimensions[5].height = 18
for d in range(1, NDAY + 1):
    r = 5 + d
    MO.cell(r, 2, d)
    c = MO.cell(r, 3, f'=IF(OR(設定!$C$6="",{d}>設定!$C$7),"",設定!$C$6+{d-1})'); c.number_format = "m/d"
    MO.cell(r, 4, f'=IF($C{r}="","",CHOOSE(WEEKDAY($C{r},2),"月","火","水","木","金","土","日"))')
    c = MO.cell(r, 5, f'=IF($C{r}="","",IF(OR(INDEX(MGR貼付!$D$5:$AH$5,{d})="",INDEX(MGR貼付!$D$5:$AH$5,{d})=0),"",TRIM(INDEX(MGR貼付!$D$5:$AH$5,{d})&"")))'); c.alignment = LEFT
    MO.cell(r, 6, f'=IF($C{r}="","",SUMPRODUCT(({CR("A")}={d})*ISNUMBER({CR("F")})))')
    MO.cell(r, 7, f'=IF($C{r}="","",IF(ISNUMBER(INDEX(MGR貼付!$D$66:$AH$66,{d})),INDEX(MGR貼付!$D$66:$AH$66,{d}),""))')
    MO.cell(r, 8, f'=IF(OR($F{r}="",$G{r}=""),"",$F{r}-$G{r})')
    for j in range(NSLOT):
        t = slot_t(j)
        MO.cell(r, MF + j, f'=IF($C{r}="","",COUNTIFS({CR("A")},$B{r},{CR("F")},"<="&{t},{CR("G")},">"&{t}))')
    for col in range(2, ML + 1):
        c = MO.cell(r, col); c.font = F9 if col >= MF else F10; c.border = BOX
        if col != 5:
            c.alignment = CENTER
    MO.row_dimensions[r].height = 17
r = 5 + NDAY + 1
hdr(MO, r, 2, "平均", SUBFILL, Font(name=FONT, size=9, bold=True, color="30363B"))
MO.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
for j in range(NSLOT):
    col = L(MF + j)
    c = MO.cell(r, MF + j, f'=IF(COUNT({col}6:{col}{5+NDAY})=0,"",ROUND(AVERAGE({col}6:{col}{5+NDAY}),1))')
    c.font = Font(name=FONT, size=8, bold=True, color="30363B"); c.fill = SUBFILL; c.border = BOX; c.alignment = CENTER
body = f"{L(MF)}6:{L(ML)}{5+NDAY}"
MO.conditional_formatting.add(body, ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF", end_type="max", end_color="5B9BD5"))
MO.conditional_formatting.add(body, Rule(type="expression",
    formula=[f'AND(ISNUMBER({L(MF)}6),ISNUMBER(設定!{L(FIRST)}$11),{L(MF)}6<設定!{L(FIRST)}$11)'],
    dxf=DifferentialStyle(font=Font(color="FFFFFF", bold=True), fill=PatternFill("solid", fgColor="C00000", bgColor="C00000"))))
MO.conditional_formatting.add(f"H6:H{5+NDAY}", FormulaRule(formula=['AND(ISNUMBER(H6),H6<0)'], font=Font(color="C00000", bold=True)))
MO.conditional_formatting.add(f"B6:E{5+NDAY}", FormulaRule(formula=['AND(ISNUMBER($C6),WEEKDAY($C6,2)=7)'], font=Font(color="C00000")))
MO.conditional_formatting.add(f"B6:E{5+NDAY}", FormulaRule(formula=['AND(ISNUMBER($C6),WEEKDAY($C6,2)=6)'], font=Font(color="2F6597")))
MO.freeze_panes = f"{L(MF)}6"
MO.sheet_view.zoomScale = 90
MO.print_area = f"B2:{L(ML)}{r}"
MO.page_setup.orientation = "landscape"; MO.page_setup.paperSize = MO.PAPERSIZE_A4
MO.page_setup.fitToWidth = 1; MO.page_setup.fitToHeight = 1; MO.sheet_properties.pageSetUpPr.fitToPage = True

# ================================================================ 社員別
ST.column_dimensions["A"].width = 2
for col, w in zip("BCDEFGHIJK", [6, 10, 9, 9, 9, 9, 9, 10, 8, 8]):
    ST.column_dimensions[col].width = w
ST["B2"] = '="【"&MGR貼付!$B$1&"】社員別の集計　"&設定!$C$5'; ST["B2"].font = TITLE
ST["B3"] = "出勤日は出勤記号のある日。勤務時間は出勤〜退勤の合計(休憩を引いていません)。休みは記号「休」の日数、その他休は有・リフ・特などの日数。"; ST["B3"].font = GREY
for col, t in zip(range(2, 12), ["役職", "氏名", "出勤日", "早番", "中番", "遅番", "夜番", "勤務時間", "休", "その他休"]):
    hdr(ST, 5, col, t)
for i in range(1, NSTAFF + 1):
    r = 5 + i
    ST.cell(r, 2, f'=IF($C{r}="","",IF(OR(INDEX(MGR貼付!$B$7:$B$65,{2*i-1})="",INDEX(MGR貼付!$B$7:$B$65,{2*i-1})=0),"",TRIM(INDEX(MGR貼付!$B$7:$B$65,{2*i-1})&"")))')
    ST.cell(r, 3, f'=IF(OR(INDEX(MGR貼付!$C$7:$C$65,{2*i-1})="",INDEX(MGR貼付!$C$7:$C$65,{2*i-1})=0),"",TRIM(INDEX(MGR貼付!$C$7:$C$65,{2*i-1})&""))')
    ST.cell(r, 4, f'=IF($C{r}="","",SUMPRODUCT(({CR("B")}={i})*ISNUMBER({CR("F")})))')
    for k, kb in enumerate(["早番", "中番", "遅番", "夜番"]):
        ST.cell(r, 5 + k, f'=IF($C{r}="","",COUNTIFS({CR("B")},{i},{CR("E")},"{kb}"))')
    c = ST.cell(r, 9, f'=IF($C{r}="","",SUMIFS({CR("G")},{CR("B")},{i})-SUMIFS({CR("F")},{CR("B")},{i}))'); c.number_format = '0.0"h"'
    ST.cell(r, 10, f'=IF($C{r}="","",COUNTIFS({CR("B")},{i},{CR("D")},"休"))')
    ST.cell(r, 11, f'=IF($C{r}="","",SUMPRODUCT(({CR("B")}={i})*({CR("D")}<>"")*({CR("D")}<>"休")*NOT(ISNUMBER({CR("F")}))))')
    for col in range(2, 12):
        c = ST.cell(r, col); c.font = F10; c.alignment = CENTER
ST.conditional_formatting.add(f"B6:K{5+NSTAFF}", Rule(type="expression", formula=['$C6<>""'], dxf=DifferentialStyle(border=BOX)))
ST.freeze_panes = "D6"
ST.print_area = f"B2:K{5+NSTAFF}"
ST.page_setup.orientation = "portrait"; ST.page_setup.paperSize = ST.PAPERSIZE_A4
ST.page_setup.fitToWidth = 1; ST.page_setup.fitToHeight = 1; ST.sheet_properties.pageSetUpPr.fitToPage = True

# リンク
for w in (SL, MO, ST, SE):
    c = w.cell(2, 14 if w is not SE else 8); c.value = '=IFERROR(HYPERLINK("#\'シフトライン\'!B5","▶ シフトライン"),"▶ シフトライン")'; c.font = LINK
    c = w.cell(2, 17 if w is not SE else 11); c.value = '=IFERROR(HYPERLINK("#\'月間\'!B2","▶ 月間"),"▶ 月間")'; c.font = LINK
    c = w.cell(2, 19 if w is not SE else 13); c.value = '=IFERROR(HYPERLINK("#\'設定\'!B2","▶ 設定"),"▶ 設定")'; c.font = LINK

wb.save(OUT)
print("saved", OUT)
