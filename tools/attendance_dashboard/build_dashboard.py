#!/usr/bin/env python3
"""TOHOシネマズ新宿 勤務実績ダッシュボード（Excel）生成スクリプト.

シェアフルシフトから出力した月次シフトCSVを「CSV_1〜CSV_6」シートに貼り付けるだけで、
スタッフごとの出勤日数・出勤率・欠勤率などをダッシュボードに表示するExcelブックを生成する。
マクロは使わず、すべてワークシート関数で計算する（Excel 2016以降 / Microsoft 365 想定）。

使い方:
    python build_dashboard.py 出力.xlsx [--csv 8月.csv 9月.csv ...] [--maxrows 6000] [--select 氏名]
"""
import argparse
import csv
import datetime as dt
import re

from openpyxl import Workbook
from openpyxl.chart import BarChart, DoughnutChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.layout import Layout, ManualLayout
from openpyxl.chart.marker import DataPoint
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.comments import Comment
from openpyxl.drawing.line import LineProperties
from openpyxl.formatting.rule import DataBarRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.workbook.properties import CalcProperties
from openpyxl.worksheet.datavalidation import DataValidation

# ---------------------------------------------------------------- constants
NSHEETS = 6
MAXSTAFF = 400            # 半年で扱えるスタッフ数の上限
STACK = NSHEETS * MAXSTAFF
FONT = "Yu Gothic"

S_HOWTO, S_DASH, S_LIST, S_SET, S_ROSTER = "使い方", "ダッシュボード", "スタッフ一覧", "設定", "名簿"
S_CSV = "CSV_{}"
S_CALC = "計算{}"

CSV_HEADERS = [
    "募集シフトの日付", "募集店舗", "応募ステータス", "募集シフトの開始時間", "募集シフトの終了時間",
    "相談応募の開始時間", "相談応募の終了時間", "アサインの開始時間", "アサインの終了時間",
    "変更後の開始時間", "変更後の終了時間", "募集シフトの職種", "募集シフトの資格", "応募者の名前",
    "応募者の従業員番号", "応募者の所属店舗", "応募者の電話番号", "応募者の職種", "応募者の資格", "時給",
    "休憩1開始時間", "休憩1終了時間", "休憩2開始時間", "休憩2終了時間", "休憩3開始時間", "休憩3終了時間",
    "連携ID", "勤務店舗コード", "所属店舗コード", "更新時間", "スケジュールID", "パターン名", "パターンコード", "勤務種別",
]
# 計算シートが列名で探す項目 → マッピングセル（計算シートの AB2〜AT2）
NEEDED = [
    ("AB", "募集シフトの日付"), ("AC", "応募ステータス"), ("AD", "募集シフトの開始時間"), ("AE", "募集シフトの終了時間"),
    ("AF", "変更後の開始時間"), ("AG", "変更後の終了時間"), ("AH", "募集シフトの職種"), ("AI", "応募者の名前"),
    ("AJ", "応募者の従業員番号"), ("AK", "応募者の職種"), ("AL", "応募者の資格"), ("AM", "休憩1開始時間"),
    ("AN", "休憩1終了時間"), ("AO", "休憩2開始時間"), ("AP", "休憩2終了時間"), ("AQ", "休憩3開始時間"),
    ("AR", "休憩3終了時間"), ("AS", "更新時間"), ("AT", "勤務種別"),
]
MAP = {name: colref for colref, name in NEEDED}

JOB_CATS = [("02コンセ", "コンセ"), ("03フロア", "フロア"), ("04ストア", "ストア"), ("05オフィス", "オフィス"),
            ("06トレーナー", "トレーナー"), ("07トレーニー", "トレーニー")]
DEPTS = [("02コンセ", "コンセ"), ("03フロア", "フロア"), ("04ストア", "ストア"), ("05オフィス", "オフィス")]
WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]
REST_CATS = [("事前", "事前（2日以上前）"), ("前日", "前日"), ("当日", "当日（＝欠勤）"), ("事後", "シフト日より後")]

# 配色（dataviz パレット準拠）
C_BLUE, C_BLUE_D, C_RED = "2A78D6", "1C5CAB", "D03B3B"
C_GOOD, C_WARN, C_CRIT = "0CA30C", "FAB219", "D03B3B"
C_GOOD_TXT, C_WARN_TXT = "006300", "9A6400"
C_INK, C_INK2, C_MUTED, C_GRID, C_SURF, C_PAGE, C_DARK = "0B0B0B", "52514E", "898781", "E1E0D9", "FFFFFF", "F3F3F0", "1A1A19"
C_GRAY_BAR = "C3C2B7"
CAT_COLORS = ["2A78D6", "EB6834", "1BAF7A", "EDA100", "E87BA4", "008300", "4A3AA7"]
C_INPUT_FILL = "FFF9C4"

thin = Side(style="thin", color=C_GRID)
hair = Side(style="hair", color=C_GRID)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)


def q(name):
    return f"'{name}'"


def font(size=10, bold=False, color=C_INK, italic=False):
    return Font(name=FONT, size=size, bold=bold, color=color, italic=italic)


def fill(color):
    return PatternFill("solid", start_color=color, end_color=color)


def style(cell, *, size=10, bold=False, color=C_INK, bg=None, align=None, valign="center", wrap=False,
          fmt=None, border=None, italic=False):
    cell.font = font(size, bold, color, italic)
    if bg:
        cell.fill = fill(bg)
    cell.alignment = Alignment(horizontal=align, vertical=valign, wrap_text=wrap)
    if fmt:
        cell.number_format = fmt
    if border:
        cell.border = border


def box_range(ws, rng, side=thin):
    """範囲の外枠だけに罫線を引く."""
    cells = list(ws[rng])
    top, bottom = cells[0], cells[-1]
    for c in top:
        c.border = Border(top=side, left=c.border.left, right=c.border.right, bottom=c.border.bottom)
    for c in bottom:
        c.border = Border(bottom=side, left=c.border.left, right=c.border.right, top=c.border.top)
    for row in cells:
        a, b = row[0], row[-1]
        a.border = Border(left=side, top=a.border.top, bottom=a.border.bottom, right=a.border.right)
        b.border = Border(right=side, top=b.border.top, bottom=b.border.bottom, left=b.border.left)


def fill_range(ws, rng, color):
    for row in ws[rng]:
        for c in row:
            c.fill = fill(color)


# ---------------------------------------------------------------- CSV → 貼付シート（Excel の貼り付け結果を再現）
_DATE = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})$")
_TIME = re.compile(r"^(\d{1,2}):(\d{2})$")
_NUM = re.compile(r"^-?\d+(\.\d+)?$")


def paste_value(s):
    """Excel に CSV を貼り付けたときの自動変換を再現する（日付・時刻・数値）."""
    if s is None or s == "":
        return None, None
    m = _DATE.match(s)
    if m:
        return dt.date(int(m[1]), int(m[2]), int(m[3])), "yyyy/mm/dd"
    m = _TIME.match(s)
    if m:
        return (int(m[1]) * 60 + int(m[2])) / 1440.0, "[h]:mm"
    if _NUM.match(s):
        return (int(s) if "." not in s else float(s)), None
    return s, None


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


# ---------------------------------------------------------------- シート: CSV_k
def build_csv_sheet(wb, k, rows=None):
    ws = wb.create_sheet(S_CSV.format(k))
    ws.sheet_properties.tabColor = "1BAF7A"
    for j, h in enumerate(CSV_HEADERS, 1):
        c = ws.cell(row=1, column=j, value=h)
        style(c, size=9, color=C_MUTED, bg="F3F3F0")
        ws.column_dimensions[L(j)].width = 13
    ws["A1"].comment = Comment(
        "シェアフルシフトのCSVをExcelで開き、ヘッダー行ごと全体をコピーして、このシートのA1セルに貼り付けてください。"
        "（先に貼ってあるデータは削除してから貼り付け）", "dashboard")
    if rows:
        for i, row in enumerate(rows[1:], 2):
            for j, s in enumerate(row, 1):
                v, fmt = paste_value(s)
                if v is None:
                    continue
                c = ws.cell(row=i, column=j, value=v)
                if fmt:
                    c.number_format = fmt
        for j, h in enumerate(rows[0], 1):
            ws.cell(row=1, column=j, value=h)
    ws.freeze_panes = "A2"
    return ws


# ---------------------------------------------------------------- シート: 計算k
CALC_COLS = [
    ("A", "番号"), ("B", "日付"), ("C", "確定"), ("D", "種別"), ("E", "勤務行"), ("F", "更新日(JST)"),
    ("G", "欠勤行"), ("H", "出勤日(初回)"), ("I", "欠勤日(初回)"), ("J", "開始"), ("K", "終了"), ("L", "休憩"),
    ("M", "実働h"), ("N", "深夜h"), ("O", "曜日"), ("P", "休み区分"), ("Q", "却下"), ("R", "職種"),
    ("S", "初出"), ("T", "番号累積"), ("U", "休み日(初回)"),
]


def build_calc_sheet(wb, k, maxrows):
    ws = wb.create_sheet(S_CALC.format(k))
    ws.sheet_properties.tabColor = "898781"
    csvs = q(S_CSV.format(k))
    last = maxrows + 1

    for colref, title in CALC_COLS:
        style(ws[f"{colref}1"], size=9, bold=True, color="FFFFFF", bg=C_INK2)
        ws.column_dimensions[colref].width = 9
    ws.column_dimensions["B"].width = 11
    ws.column_dimensions["F"].width = 11
    ws.column_dimensions["R"].width = 12

    # 列名マッピング（列順が変わっても動くように、ヘッダー名で列位置を探す）
    style(ws["AA1"], size=9, bold=True, color="FFFFFF", bg=C_INK2)
    ws["AA1"] = "列チェック"
    ws["AA2"] = f"=AND(COUNT($AB$2:$AT$2)={len(NEEDED)},MIN($AB$2:$AT$2)>0)"
    for colref, name in NEEDED:
        ws[f"{colref}1"] = name
        style(ws[f"{colref}1"], size=8, color=C_INK2, bg="F3F3F0")
        ws[f"{colref}2"] = f"=IFERROR(MATCH({colref}$1,{csvs}!$1:$1,0),0)"
        ws.column_dimensions[colref].width = 8
    ws["AA4"] = "この行より下の列AB〜ATは、貼付シートの列名→列番号の対応表です。数式で使うので編集しないでください。"
    style(ws["AA4"], size=8, color=C_MUTED)

    def idx(name):
        return f"INDEX({csvs}!$A:$AZ,ROW(),{MAP[name]}$2)"

    def tconv(name):
        x = idx(name)
        return f"IF(ISNUMBER({x}),{x},IFERROR(VALUE({x}),0))"

    num, date_, status, kind, upd = idx("応募者の従業員番号"), idx("募集シフトの日付"), idx("応募ステータス"), idx("勤務種別"), idx("更新時間")
    brk = "+".join(f"({tconv(f'休憩{i}終了時間')}-{tconv(f'休憩{i}開始時間')})" for i in (1, 2, 3))
    sets = q(S_SET)

    for r in range(2, last + 1):
        f = {
            "A": f'=IF(NOT($AA$2),"",IF({num}="","",IF(ISNUMBER({num}),{num},IFERROR(VALUE({num}),{num}))))',
            "B": f'=IF($A{r}="","",IF(ISNUMBER({date_}),{date_},IFERROR(DATEVALUE({date_}),IFERROR(DATEVALUE(SUBSTITUTE({date_},"/","-")),""))))',
            "C": f'=IF($A{r}="","",IF(ISNUMBER(SEARCH("確定",{status})),1,0))',
            "D": f'=IF($A{r}="","",IFERROR({kind}*1,0))',
            "E": f'=IF($A{r}="","",IF(AND($C{r}=1,$D{r}=1),1,0))',
            "F": f'=IF($A{r}="","",IFERROR(INT({upd}*1/86400000+25569+9/24),""))',
            "G": f'=IF($A{r}="","",IF(AND($C{r}=1,$D{r}=4,$B{r}<>"",$F{r}=$B{r}),1,0))',
            "H": f'=IF($A{r}="","",IF($E{r}=1,IF(COUNTIFS($A$2:$A{r},$A{r},$B$2:$B{r},$B{r},$E$2:$E{r},1)=1,1,0),0))',
            "I": (f'=IF($A{r}="","",IF($G{r}=1,IF(COUNTIFS($A$2:$A${last},$A{r},$B$2:$B${last},$B{r},$E$2:$E${last},1)>0,0,'
                  f'IF(COUNTIFS($A$2:$A{r},$A{r},$B$2:$B{r},$B{r},$G$2:$G{r},1)=1,1,0)),0))'),
            "J": f'=IF($E{r}<>1,"",IF({idx("変更後の開始時間")}="",{tconv("募集シフトの開始時間")},{tconv("変更後の開始時間")}))',
            "K": f'=IF($E{r}<>1,"",IF({idx("変更後の終了時間")}="",{tconv("募集シフトの終了時間")},{tconv("変更後の終了時間")}))',
            "L": f'=IF($E{r}<>1,"",{brk})',
            "M": f'=IF($E{r}<>1,"",($K{r}-$J{r}-$L{r})*24)',
            "N": f'=IF($E{r}<>1,"",MAX(0,MIN($K{r},{sets}!$B$8)-MAX($J{r},{sets}!$B$7))*24)',
            "O": f'=IF($A{r}="","",IF($B{r}="","",WEEKDAY($B{r})))',
            "P": (f'=IF($A{r}="","",IF(AND($C{r}=1,$D{r}=4),IF(OR($F{r}="",$B{r}=""),"不明",'
                  f'IF($F{r}>$B{r},"事後",IF($F{r}=$B{r},"当日",IF($F{r}=$B{r}-1,"前日","事前")))),""))'),
            "Q": f'=IF($A{r}="","",IF(ISNUMBER(SEARCH("却下",{status})),1,0))',
            "R": f'=IF($E{r}<>1,"",{idx("募集シフトの職種")}&"")',
            "S": f'=IF($A{r}="","",IF(COUNTIF($A$2:$A{r},$A{r})=1,1,0))',
            "T": f'=N($T{r-1})+IF($S{r}=1,1,0)',
            "U": (f'=IF($A{r}="","",IF(AND($C{r}=1,$D{r}=4),'
                  f'IF(COUNTIFS($A$2:$A{r},$A{r},$B$2:$B{r},$B{r},$C$2:$C{r},1,$D$2:$D{r},4)=1,1,0),0))'),
        }
        for colref, formula in f.items():
            ws[f"{colref}{r}"] = formula
        ws[f"B{r}"].number_format = "yyyy/mm/dd"
        ws[f"F{r}"].number_format = "yyyy/mm/dd"
        ws[f"J{r}"].number_format = "[h]:mm"
        ws[f"K{r}"].number_format = "[h]:mm"
        ws[f"L{r}"].number_format = "[h]:mm"
        ws[f"M{r}"].number_format = "0.00"
        ws[f"N{r}"].number_format = "0.00"
    ws.freeze_panes = "A2"
    return ws


# ---------------------------------------------------------------- シート: 設定
def build_settings(wb):
    ws = wb.create_sheet(S_SET)
    ws.sheet_properties.tabColor = "EDA100"
    ws.column_dimensions["A"].width = 44
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 60
    ws["A1"] = "設定（黄色のセルは変更できます）"
    style(ws["A1"], size=14, bold=True)

    rows = [
        (3, "出勤率 ◎優良 の基準（この値以上）", 0.95, "0%", "総合判定に使用。既定 95%"),
        (4, "出勤率 ○良好 の基準（この値以上）", 0.90, "0%", "この値未満は「△要改善」。既定 90%"),
        (5, "参考値扱いにする確定シフト日数（この日数未満）", 10, "0", "シフト日数が少ない人の出勤率は「参考値」と表示"),
        (7, "深夜勤務の開始時刻", 22 / 24, "[h]:mm", "深夜勤務時間の集計範囲（開始）"),
        (8, "深夜勤務の終了時刻", 29 / 24, "[h]:mm", "同（終了）。翌5時は 29:00 と入力"),
    ]
    for r, label, val, fmt, note in rows:
        ws[f"A{r}"] = label
        ws[f"B{r}"] = val
        style(ws[f"B{r}"], bg=C_INPUT_FILL, fmt=fmt, border=BOX, align="right")
        ws[f"C{r}"] = note
        style(ws[f"C{r}"], size=9, color=C_INK2)

    ws["A11"] = "職種の区分（ダッシュボードの「職種別 勤務時間」に使用）"
    style(ws["A11"], bold=True)
    ws["A12"], ws["B12"] = "CSVの職種名", "表示名"
    for c in ("A12", "B12"):
        style(ws[c], size=9, bold=True, color="FFFFFF", bg=C_INK2)
    for i, (code, label) in enumerate(JOB_CATS):
        r = 13 + i
        ws[f"A{r}"], ws[f"B{r}"] = code, label
        style(ws[f"A{r}"], bg=C_INPUT_FILL, border=BOX)
        style(ws[f"B{r}"], bg=C_INPUT_FILL, border=BOX)
    ws["A19"], ws["B19"] = "（上記以外）", "その他"
    style(ws["B19"], bg=C_INPUT_FILL, border=BOX)

    ws["A22"] = "所属（CSVの「応募者の職種」）の一覧（スタッフ一覧の所属別集計に使用）"
    style(ws["A22"], bold=True)
    ws["A23"], ws["B23"] = "CSVの所属名", "表示名"
    for c in ("A23", "B23"):
        style(ws[c], size=9, bold=True, color="FFFFFF", bg=C_INK2)
    for i, (code, label) in enumerate(DEPTS):
        r = 24 + i
        ws[f"A{r}"], ws[f"B{r}"] = code, label
        style(ws[f"A{r}"], bg=C_INPUT_FILL, border=BOX)
        style(ws[f"B{r}"], bg=C_INPUT_FILL, border=BOX)
    return ws


# ---------------------------------------------------------------- シート: 名簿（集計エンジン）
ROSTER_COLS = {
    "H": "名簿行", "I": "従業員番号", "J": "名前", "K": "所属", "L": "資格", "M": "出勤日数", "N": "欠勤日数",
    "O": "確定シフト日数", "P": "出勤率", "Q": "欠勤率", "R": "勤務時間", "S": "深夜時間", "T": "平均/日",
    "U": "却下回数", "V": "名前順キー", "W": "出勤率順位", "X": "出勤率順キー(降順)", "Y": "ワーストキー(昇順)",
    "AR": "在籍月数", "AT": "名前(名前順)", "AU": "番号(名前順)", "AV": "名簿行(名前順)",
}
MONTH_WORK = ["Z", "AA", "AB", "AC", "AD", "AE"]      # 月別出勤日数
MONTH_ABS = ["AF", "AG", "AH", "AI", "AJ", "AK"]      # 月別欠勤日数
MONTH_HRS = ["AL", "AM", "AN", "AO", "AP", "AQ"]      # 月別勤務時間


def calc_rng(k, colref, maxrows):
    return f"{q(S_CALC.format(k))}!${colref}$2:${colref}${maxrows + 1}"


def sum6(colref, maxrows, key):
    return "+".join(f"SUMIFS({calc_rng(k, colref, maxrows)},{calc_rng(k, 'A', maxrows)},{key})" for k in range(1, NSHEETS + 1))


def build_roster(wb, maxrows):
    ws = wb.create_sheet(S_ROSTER)
    ws.sheet_properties.tabColor = "898781"
    last = maxrows + 1
    head = {"A": "一致行", "B": "番号", "C": "名前", "D": "所属", "E": "資格", "F": "初出", "G": "累積"}
    head.update(ROSTER_COLS)
    for i, c in enumerate(MONTH_WORK):
        head[c] = f"出勤日数 月{i + 1}"
    for i, c in enumerate(MONTH_ABS):
        head[c] = f"欠勤日数 月{i + 1}"
    for i, c in enumerate(MONTH_HRS):
        head[c] = f"勤務時間 月{i + 1}"
    for colref, title in head.items():
        ws[f"{colref}1"] = title
        style(ws[f"{colref}1"], size=9, bold=True, color="FFFFFF", bg=C_INK2)
        ws.column_dimensions[colref].width = 10
    ws.column_dimensions["C"].width = 22
    ws.column_dimensions["J"].width = 22
    ws.column_dimensions["AT"].width = 22

    # --- 6シート分のユニーク番号を積み上げ（新しい月＝番号の大きいシートを先に置き、最新の名前を採用）
    r = 2
    for k in range(NSHEETS, 0, -1):
        calc, csvs = q(S_CALC.format(k)), q(S_CSV.format(k))
        for i in range(1, MAXSTAFF + 1):
            ws[f"A{r}"] = f'=IFERROR(MATCH({i},{calc}!$T$2:$T${last},0),"")'
            ws[f"B{r}"] = f'=IF($A{r}="","",INDEX({calc}!$A$2:$A${last},$A{r}))'
            ws[f"C{r}"] = f'=IF($A{r}="","",INDEX({csvs}!$A:$AZ,$A{r}+1,{calc}!$AI$2)&"")'
            ws[f"D{r}"] = f'=IF($A{r}="","",INDEX({csvs}!$A:$AZ,$A{r}+1,{calc}!$AK$2)&"")'
            ws[f"E{r}"] = f'=IF($A{r}="","",INDEX({csvs}!$A:$AZ,$A{r}+1,{calc}!$AL$2)&"")'
            ws[f"F{r}"] = f'=IF($B{r}="","",IF(COUNTIF($B$2:$B{r},$B{r})=1,1,0))'
            ws[f"G{r}"] = f'=N($G{r - 1})+IF($F{r}=1,1,0)'
            r += 1
    stack_last = r - 1

    # --- 和集合（マスター）と半年集計
    sets = q(S_SET)
    for n in range(1, MAXSTAFF + 1):
        r = n + 1
        key = f"$I{r}"
        ws[f"H{r}"] = f'=IFERROR(MATCH({n},$G$2:$G${stack_last},0),"")'
        ws[f"I{r}"] = f'=IF($H{r}="","",INDEX($B$2:$B${stack_last},$H{r}))'
        ws[f"J{r}"] = f'=IF($H{r}="","",INDEX($C$2:$C${stack_last},$H{r}))'
        ws[f"K{r}"] = f'=IF($H{r}="","",INDEX($D$2:$D${stack_last},$H{r}))'
        ws[f"L{r}"] = f'=IF($H{r}="","",INDEX($E$2:$E${stack_last},$H{r}))'
        ws[f"M{r}"] = f'=IF({key}="","",{sum6("H", maxrows, key)})'
        ws[f"N{r}"] = f'=IF({key}="","",{sum6("I", maxrows, key)})'
        ws[f"O{r}"] = f'=IF({key}="","",$M{r}+$N{r})'
        ws[f"P{r}"] = f'=IF({key}="","",IF($O{r}=0,"",$M{r}/$O{r}))'
        ws[f"Q{r}"] = f'=IF({key}="","",IF($O{r}=0,"",$N{r}/$O{r}))'
        ws[f"R{r}"] = f'=IF({key}="","",{sum6("M", maxrows, key)})'
        ws[f"S{r}"] = f'=IF({key}="","",{sum6("N", maxrows, key)})'
        ws[f"T{r}"] = f'=IF({key}="","",IF($M{r}=0,"",$R{r}/$M{r}))'
        ws[f"U{r}"] = f'=IF({key}="","",{sum6("Q", maxrows, key)})'
        ws[f"V{r}"] = f'=IF($J{r}="","",COUNTIF($J$2:$J${MAXSTAFF + 1},"<"&$J{r})+COUNTIF($J$2:$J{r},$J{r}))'
        ws[f"W{r}"] = f'=IF($P{r}="","",COUNTIF($P$2:$P${MAXSTAFF + 1},">"&$P{r})+1)'
        ws[f"X{r}"] = f'=IF($P{r}="","",$W{r}+COUNTIF($P$2:$P{r},$P{r})-1)'
        ws[f"Y{r}"] = (f'=IF($P{r}="","",IF($O{r}<{sets}!$B$5,"",'
                       f'COUNTIF($P$2:$P${MAXSTAFF + 1},"<"&$P{r})+COUNTIF($P$2:$P{r},$P{r})))')
        for k in range(1, NSHEETS + 1):
            ws[f"{MONTH_WORK[k - 1]}{r}"] = f'=IF({key}="","",SUMIFS({calc_rng(k, "H", maxrows)},{calc_rng(k, "A", maxrows)},{key}))'
            ws[f"{MONTH_ABS[k - 1]}{r}"] = f'=IF({key}="","",SUMIFS({calc_rng(k, "I", maxrows)},{calc_rng(k, "A", maxrows)},{key}))'
            ws[f"{MONTH_HRS[k - 1]}{r}"] = f'=IF({key}="","",SUMIFS({calc_rng(k, "M", maxrows)},{calc_rng(k, "A", maxrows)},{key}))'
        ws[f"AR{r}"] = f'=IF({key}="","",' + "+".join(
            f"(({MONTH_WORK[i]}{r}+{MONTH_ABS[i]}{r})>0)" for i in range(NSHEETS)) + ")"
        ws[f"AT{r}"] = f'=IFERROR(INDEX($J$2:$J${MAXSTAFF + 1},MATCH({n},$V$2:$V${MAXSTAFF + 1},0)),"")'
        ws[f"AU{r}"] = f'=IFERROR(INDEX($I$2:$I${MAXSTAFF + 1},MATCH({n},$V$2:$V${MAXSTAFF + 1},0)),"")'
        ws[f"AV{r}"] = f'=IFERROR(MATCH({n},$V$2:$V${MAXSTAFF + 1},0),"")'
        for c in ("P", "Q"):
            ws[f"{c}{r}"].number_format = "0.0%"
        for c in ("R", "S", "T"):
            ws[f"{c}{r}"].number_format = "0.0"

    # --- 全体・所属別サマリー
    ML = MAXSTAFF + 1
    ws["AX1"] = "全体サマリー"
    style(ws["AX1"], size=9, bold=True, color="FFFFFF", bg=C_INK2)
    ws.column_dimensions["AX"].width = 20
    ws.column_dimensions["AY"].width = 12
    summary = [
        (2, "スタッフ数", f"=SUMPRODUCT(--($I$2:$I${ML}<>\"\"))", "0"),
        (3, "総出勤日数", f"=SUM($M$2:$M${ML})", "0"),
        (4, "総欠勤日数", f"=SUM($N$2:$N${ML})", "0"),
        (5, "総確定シフト日数", f"=SUM($O$2:$O${ML})", "0"),
        (6, "全体出勤率", f'=IF($AY$5=0,"",$AY$3/$AY$5)', "0.0%"),
        (7, "全体欠勤率", f'=IF($AY$5=0,"",$AY$4/$AY$5)', "0.0%"),
        (8, "評価対象人数(確定日数>0)", f"=COUNT($P$2:$P${ML})", "0"),
        (9, "総勤務時間", f"=SUM($R$2:$R${ML})", "0.0"),
    ]
    for r, label, formula, fmt in summary:
        ws[f"AX{r}"], ws[f"AY{r}"] = label, formula
        ws[f"AY{r}"].number_format = fmt

    ws["AX12"] = "所属別"
    style(ws["AX12"], size=9, bold=True, color="FFFFFF", bg=C_INK2)
    for j, h in enumerate(["所属コード", "表示名", "人数", "出勤日数", "欠勤日数", "確定日数", "出勤率", "欠勤率"]):
        c = ws.cell(row=13, column=50 + j, value=h)   # AX=50
        style(c, size=9, bold=True, color="FFFFFF", bg=C_INK2)
    for i in range(len(DEPTS)):
        r = 14 + i
        ws[f"AX{r}"] = f"={sets}!$A${24 + i}"
        ws[f"AY{r}"] = f"={sets}!$B${24 + i}"
        ws[f"AZ{r}"] = f"=COUNTIF($K$2:$K${ML},$AX{r})"
        ws[f"BA{r}"] = f"=SUMIFS($M$2:$M${ML},$K$2:$K${ML},$AX{r})"
        ws[f"BB{r}"] = f"=SUMIFS($N$2:$N${ML},$K$2:$K${ML},$AX{r})"
        ws[f"BC{r}"] = f"=SUMIFS($O$2:$O${ML},$K$2:$K${ML},$AX{r})"
        ws[f"BD{r}"] = f'=IF($BC{r}=0,"",$BA{r}/$BC{r})'
        ws[f"BE{r}"] = f'=IF($BC{r}=0,"",$BB{r}/$BC{r})'
        ws[f"BD{r}"].number_format = "0.0%"
        ws[f"BE{r}"].number_format = "0.0%"

    # --- 月ラベル・貼付状況
    ws["AX20"] = "月ラベル / 貼付状況"
    style(ws["AX20"], size=9, bold=True, color="FFFFFF", bg=C_INK2)
    for j, h in enumerate(["シート", "月", "貼付行数", "状態"]):
        c = ws.cell(row=21, column=50 + j, value=h)
        style(c, size=9, bold=True, color="FFFFFF", bg=C_INK2)
    for k in range(1, NSHEETS + 1):
        r = 21 + k
        calc, csvs = q(S_CALC.format(k)), q(S_CSV.format(k))
        drng = f"{calc}!$B$2:$B${last}"
        ws[f"AX{r}"] = S_CSV.format(k)
        ws[f"AY{r}"] = f'=IF(COUNT({drng})=0,"月{k}（未貼付）",YEAR(MIN({drng}))&"年"&MONTH(MIN({drng}))&"月")'
        ws[f"AZ{r}"] = f"=COUNTA({csvs}!$A$2:$A$200000)"
        ws[f"BA{r}"] = (f'=IF($AZ{r}=0,"未貼付",IF(NOT({calc}!$AA$2),"⚠ 列名が見つかりません（1行目にヘッダーを含めて貼り付けてください）",'
                        f'IF($AZ{r}>{maxrows},"⚠ {maxrows:,}行を超えています（超過分は集計されません）","OK")))')
    ws["AX29"] = "対象期間"
    ws["AY29"] = (f'=IF(COUNT($AZ$22:$AZ$27)=0,"",IF(SUM($AZ$22:$AZ$27)=0,"（CSV未貼付）",'
                  f'INDEX($AY$22:$AY$27,MATCH(TRUE,INDEX($AZ$22:$AZ$27>0,0),0))&" 〜 "&'
                  f'INDEX($AY$22:$AY$27,{NSHEETS}+1-MATCH(TRUE,INDEX(($AZ$27:$AZ$22)>0,0),0))))')
    ws.freeze_panes = "A2"
    return ws


# ---------------------------------------------------------------- シート: ダッシュボード
GRID_FIRST, GRID_LAST = 2, 25            # B〜Y の24列をグリッドとして使う
HC = "AC"                                # 内部計算セルの列（値）
HL = "AB"                                # 内部計算セルの列（ラベル）


def cols(a, b):
    """列番号 a〜b（1始まり）を 'B:E' 形式の文字列に."""
    return f"{L(a)}{{r}}:{L(b)}{{r}}"


def build_dashboard(wb, maxrows, select=None):
    ws = wb.create_sheet(S_DASH)
    ws.sheet_properties.tabColor = C_BLUE
    ws.sheet_view.showGridLines = False
    ros, sets = q(S_ROSTER), q(S_SET)
    ML = MAXSTAFF + 1
    ws.column_dimensions["A"].width = 1.5
    for c in range(GRID_FIRST, GRID_LAST + 1):
        ws.column_dimensions[L(c)].width = 4.6
    ws.column_dimensions["Z"].width = 1.5
    ws.column_dimensions["AA"].width = 3
    ws.column_dimensions[HL].width = 26
    ws.column_dimensions[HC].width = 14
    fill_range(ws, "A1:Z64", C_PAGE)

    def V(colref):
        return f'IF(${HC}$4="","",INDEX({ros}!${colref}$2:${colref}${ML},${HC}$4))'

    # ---- 内部計算セル（画面右外）
    ws[f"{HL}1"] = "内部計算（このブロックは触らないでください）"
    style(ws[f"{HL}1"], size=9, bold=True, color=C_MUTED)
    helpers = [
        (3, "選択スタッフの従業員番号", f'=IFERROR(INDEX({ros}!$AU$2:$AU${ML},MATCH($B$7,{ros}!$AT$2:$AT${ML},0)),"")'),
        (4, "名簿の行", f'=IFERROR(MATCH(${HC}$3,{ros}!$I$2:$I${ML},0),"")'),
        (5, "所属コード", f"={V('K')}"),
        (6, "出勤率", f"={V('P')}"),
        (7, "◎の基準", f"={sets}!$B$3"),
        (8, "○の基準", f"={sets}!$B$4"),
        (9, "参考値扱いの日数", f"={sets}!$B$5"),
        (10, "確定シフト日数", f"={V('O')}"),
    ]
    for r, label, formula in helpers:
        ws[f"{HL}{r}"], ws[f"{HC}{r}"] = label, formula
        style(ws[f"{HL}{r}"], size=9, color=C_INK2)
        style(ws[f"{HC}{r}"], size=9)
    ws[f"{HC}6"].number_format = "0.0%"
    sel = f"${HC}$3"

    def sum6sel(colref, crit_col=None, crit=None):
        parts = []
        for k in range(1, NSHEETS + 1):
            a = f"SUMIFS({calc_rng(k, colref, maxrows)},{calc_rng(k, 'A', maxrows)},{sel}"
            if crit_col:
                a += f",{calc_rng(k, crit_col, maxrows)},{crit}"
            parts.append(a + ")")
        return "+".join(parts)

    # 図データ: 出勤率リング
    ws[f"{HL}12"], ws[f"{HC}12"] = "出勤日", f"=N({V('M')})"
    ws[f"{HL}13"], ws[f"{HC}13"] = "欠勤日", f"=N({V('N')})"
    # 図データ: 職種別勤務時間
    for i in range(len(JOB_CATS)):
        r = 16 + i
        ws[f"{HL}{r}"] = f"={sets}!$B${13 + i}"
        ws[f"{HC}{r}"] = f'=IF({sel}="",0,{sum6sel("M", "R", f"{sets}!$A${13 + i}")})'
    ws[f"{HL}22"] = f"={sets}!$B$19"
    ws[f"{HC}22"] = f'=IF({sel}="",0,MAX(0,N({V("R")})-SUM(${HC}$16:${HC}$21)))'
    # 図データ: 曜日別出勤日数
    for i, wd in enumerate(WEEKDAYS):
        r = 25 + i
        ws[f"{HL}{r}"] = wd
        ws[f"{HC}{r}"] = f'=IF({sel}="",0,{sum6sel("H", "O", i + 1)})'
    # 図データ: 出勤率の比較
    ws[f"{HL}34"], ws[f"{HC}34"] = "本人", f"=N(${HC}$6)"
    ws[f"{HL}35"], ws[f"{HC}35"] = "全体平均", f"=N({ros}!$AY$6)"
    ws[f"{HL}36"] = f'=IF(${HC}$5="","同所属","同所属（"&IFERROR(INDEX({ros}!$AY$14:$AY$17,MATCH(${HC}$5,{ros}!$AX$14:$AX$17,0)),${HC}$5)&"）")'
    ws[f"{HC}36"] = f'=IFERROR(N(INDEX({ros}!$BD$14:$BD$17,MATCH(${HC}$5,{ros}!$AX$14:$AX$17,0))),0)'
    for r in (34, 35, 36):
        ws[f"{HC}{r}"].number_format = "0.0%"
    # 図データ: 休みへの変更タイミング
    for i, (code, label) in enumerate(REST_CATS):
        r = 39 + i
        ws[f"{HL}{r}"] = label
        crit = '"' + code + '"'
        ws[f"{HC}{r}"] = f'=IF({sel}="",0,{sum6sel("U", "P", crit)})'

    # ---- タイトル帯
    ws.row_dimensions[1].height = 6
    for r, h in ((2, 20), (3, 18), (4, 16)):
        ws.row_dimensions[r].height = h
    fill_range(ws, "B2:Y4", C_DARK)
    ws.merge_cells("B2:N3")
    ws["B2"] = "勤務実績ダッシュボード"
    style(ws["B2"], size=18, bold=True, color="FFFFFF", bg=C_DARK, align="left")
    ws.merge_cells("B4:N4")
    ws["B4"] = "TOHOシネマズ新宿｜シェアフルシフトの出力CSVから自動集計（半年分・最大6ヶ月）"
    style(ws["B4"], size=9, color="C3C2B7", bg=C_DARK, align="left")
    ws.merge_cells("O2:Y3")
    ws["O2"] = f'="対象期間　"&{ros}!$AY$29'
    style(ws["O2"], size=11, bold=True, color="FFFFFF", bg=C_DARK, align="right")
    ws.merge_cells("O4:Y4")
    ws["O4"] = f'=IF({ros}!$AY$2="","","集計対象 "&{ros}!$AY$2&"名　｜　貼付済み "&COUNTIF({ros}!$BA$22:$BA$27,"OK")&"ヶ月")'
    style(ws["O4"], size=9, color="C3C2B7", bg=C_DARK, align="right")

    # ---- スタッフ選択行
    ws.row_dimensions[5].height = 8
    ws.row_dimensions[6].height = 14
    ws.row_dimensions[7].height = 18
    ws.row_dimensions[8].height = 18
    ws["B6"] = "スタッフを選択 ▼（クリックしてリストから選ぶか、氏名を入力）"
    style(ws["B6"], size=8, color=C_INK2)
    ws.merge_cells("B7:H8")
    if select:
        ws["B7"] = select
    else:
        ws["B7"] = f'=IF({ros}!$AT$2="","← CSV_1 にデータを貼り付けてください",{ros}!$AT$2)'
    style(ws["B7"], size=14, bold=True, bg="FFFFFF", align="left")
    box_range(ws, "B7:H8", Side(style="medium", color=C_BLUE))
    dv = DataValidation(type="list", formula1="StaffNames", allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add("B7")

    def info(col_a, col_b, r_label, label, formula, fmt=None, size=11):
        ws[f"{col_a}{r_label}"] = label
        style(ws[f"{col_a}{r_label}"], size=8, color=C_INK2)
        ws.merge_cells(f"{col_a}{r_label + 1}:{col_b}{r_label + 2}")
        ws[f"{col_a}{r_label + 1}"] = formula
        style(ws[f"{col_a}{r_label + 1}"], size=size, bold=True, bg="FFFFFF", align="left", fmt=fmt)
        box_range(ws, f"{col_a}{r_label + 1}:{col_b}{r_label + 2}")

    info("J", "L", 6, "従業員番号", f"={V('I')}", fmt="0")
    info("N", "P", 6, "所属", f'=IF(${HC}$5="","",IFERROR(INDEX({ros}!$AY$14:$AY$17,MATCH(${HC}$5,{ros}!$AX$14:$AX$17,0)),${HC}$5))')
    info("R", "T", 6, "資格", f'=IF(${HC}$4="","",SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({V("L")},"01アルバイト","アルバイト"),"02サブリーダー","サブリーダー"),"03リーダー","リーダー"))')
    ws["V6"] = "総合判定（出勤率基準）"
    style(ws["V6"], size=8, color=C_INK2)
    ws.merge_cells("V7:Y8")
    ws["V7"] = (f'=IF(${HC}$6="","－",IF(${HC}$6>=1,"◎ 欠勤なし",IF(${HC}$6>=${HC}$7,"○ 優良",IF(${HC}$6>=${HC}$8,"△ 注意","✕ 要改善")))'
                f'&IF(AND(${HC}$10<>"",${HC}$10<${HC}$9),"（参考値）",""))')
    style(ws["V7"], size=13, bold=True, color="FFFFFF", bg=C_MUTED, align="center")
    badge_rules = [
        (f'AND(ISNUMBER(${HC}$6),${HC}$6>=1)', C_GOOD_TXT),
        (f'AND(ISNUMBER(${HC}$6),${HC}$6>=${HC}$7)', C_GOOD),
        (f'AND(ISNUMBER(${HC}$6),${HC}$6>=${HC}$8)', C_WARN),
        (f'ISNUMBER(${HC}$6)', C_CRIT),
    ]
    for formula, color in badge_rules:
        ws.conditional_formatting.add("V7:Y8", FormulaRule(formula=[formula], fill=fill(color), font=Font(name=FONT, bold=True, color="FFFFFF", size=13), stopIfTrue=True))

    # ---- KPIタイル
    ws.row_dimensions[9].height = 8
    for r, h in ((10, 14), (11, 17), (12, 17), (13, 13)):
        ws.row_dimensions[r].height = h
    all_rate = f"{ros}!$AY$6"
    tiles = [
        ("出勤日数", f"={V('M')}", '0"日"', f'=IF(${HC}$4="","","確定シフト "&{V("O")}&"日 のうち")'),
        ("出勤率", f"={V('P')}", "0.0%", f'=IF(${HC}$6="","",IF({all_rate}="","","全体平均 "&TEXT({all_rate},"0.0%")&"｜"&{V("W")}&"位/"&{ros}!$AY$8&"人"))'),
        ("欠勤日数", f"={V('N')}", '0"日"', '="シフト当日に休みへ変更した日数"'),
        ("欠勤率", f"={V('Q')}", "0.0%", f'=IF(${HC}$6="","",IF({ros}!$AY$7="","","全体平均 "&TEXT({ros}!$AY$7,"0.0%")))'),
        ("総勤務時間", f"={V('R')}", '0.0"h"', f'=IF(${HC}$4="","",IF({V("T")}="","","平均 "&TEXT({V("T")},"0.0")&" h／出勤日"))'),
        ("深夜勤務時間", f"={V('S')}", '0.0"h"', f'=IF(${HC}$4="","",IF(N({V("R")})=0,"","総勤務時間の "&TEXT({V("S")}/{V("R")},"0%")&"（22時〜翌5時）"))'),
    ]
    for i, (label, formula, fmt, sub) in enumerate(tiles):
        c0 = GRID_FIRST + i * 4
        a, b = L(c0), L(c0 + 3)
        fill_range(ws, f"{a}10:{b}13", "FFFFFF")
        ws[f"{a}10"] = label
        style(ws[f"{a}10"], size=9, color=C_INK2, bg="FFFFFF", align="left")
        ws.merge_cells(f"{a}11:{b}12")
        ws[f"{a}11"] = formula
        style(ws[f"{a}11"], size=22, bold=True, bg="FFFFFF", align="left", fmt=fmt)
        ws.merge_cells(f"{a}13:{b}13")
        ws[f"{a}13"] = sub
        style(ws[f"{a}13"], size=8, color=C_MUTED, bg="FFFFFF", align="left")
        box_range(ws, f"{a}10:{b}13")
        # タイル左端のアクセントバー（欠勤系は赤）
        accent = C_RED if "欠勤" in label else C_BLUE
        for r in range(10, 14):
            ws[f"{a}{r}"].border = Border(left=Side(style="thick", color=accent), top=ws[f"{a}{r}"].border.top, bottom=ws[f"{a}{r}"].border.bottom)
    rate_rules = [
        (f'AND(ISNUMBER(${HC}$6),${HC}$6>=${HC}$7)', C_GOOD_TXT),
        (f'AND(ISNUMBER(${HC}$6),${HC}$6>=${HC}$8)', C_WARN_TXT),
        (f'ISNUMBER(${HC}$6)', C_CRIT),
    ]
    for formula, color in rate_rules:
        ws.conditional_formatting.add("F11:I12", FormulaRule(formula=[formula], font=Font(name=FONT, bold=True, size=22, color=color), stopIfTrue=True))

    # ---- グラフ行1
    ws.row_dimensions[14].height = 8
    ws.row_dimensions[15].height = 16
    for r in range(16, 30):
        ws.row_dimensions[r].height = 15
    titles = [("B", "出勤率（出勤日 vs 欠勤日）"), ("J", "月別推移（出勤日数・欠勤日数）"), ("R", "職種別 勤務時間の構成")]
    for c, t in titles:
        ws[f"{c}15"] = t
        style(ws[f"{c}15"], size=10, bold=True)
    for a, b in (("B", "I"), ("J", "Q"), ("R", "Y")):
        fill_range(ws, f"{a}16:{b}29", "FFFFFF")
        box_range(ws, f"{a}16:{b}29")

    def gp(color):
        g = GraphicalProperties(solidFill=color)
        g.line.solidFill = "FFFFFF"
        return g

    def doughnut(label_rng, data_rng, colors, hole=58):
        ch = DoughnutChart()
        ch.holeSize = hole
        ch.add_data(Reference(ws, range_string=f"{q(S_DASH)}!{data_rng}"), titles_from_data=False)
        ch.set_categories(Reference(ws, range_string=f"{q(S_DASH)}!{label_rng}"))
        s = ch.series[0]
        for i, color in enumerate(colors):
            pt = DataPoint(idx=i)
            pt.graphicalProperties = gp(color)
            s.dPt.append(pt)
        ch.dataLabels = DataLabelList()
        ch.dataLabels.showPercent = True
        ch.dataLabels.showVal = False
        ch.dataLabels.showCatName = False
        ch.dataLabels.showSerName = False
        ch.dataLabels.showLeaderLines = False
        ch.legend.position = "b"
        ch.width, ch.height = 7.7, 7.0
        return ch

    ws.add_chart(doughnut(f"${HL}$12:${HL}$13", f"${HC}$12:${HC}$13", [C_BLUE, C_RED], hole=62), "B16")
    ws.add_chart(doughnut(f"${HL}$16:${HL}$22", f"${HC}$16:${HC}$22", CAT_COLORS), "R16")

    # ---- 月別サマリー表（グラフのデータ元にもなる）
    ws.row_dimensions[46].height = 8
    ws["B47"] = "月別サマリー"
    style(ws["B47"], size=10, bold=True)
    tbl_cols = [("月", 2, 5), ("出勤日数", 6, 7), ("欠勤日数", 8, 9), ("確定シフト日数", 10, 12), ("出勤率", 13, 15),
                ("勤務時間", 16, 18), ("平均 h／日", 19, 21), ("深夜時間", 22, 23), ("却下", 24, 25)]
    for title, a, b in tbl_cols:
        ws.merge_cells(f"{L(a)}48:{L(b)}48")
        ws[f"{L(a)}48"] = title
        style(ws[f"{L(a)}48"], size=9, bold=True, color="FFFFFF", bg=C_INK2, align="center")
    for k in range(1, NSHEETS + 1):
        r = 48 + k
        mw, ma, mh = MONTH_WORK[k - 1], MONTH_ABS[k - 1], MONTH_HRS[k - 1]
        vals = [
            (f"={ros}!$AY${21 + k}", None, "left"),
            (f"={V(mw)}", '0"日"', "right"),
            (f"={V(ma)}", '0"日"', "right"),
            (f'=IF(${HC}$4="","",N({V(mw)})+N({V(ma)}))', '0"日"', "right"),
            (f'=IF(${HC}$4="","",IF(N(J{r})=0,"－",N(F{r})/N(J{r})))', "0.0%", "right"),
            (f"={V(mh)}", '0.0"h"', "right"),
            (f'=IF(${HC}$4="","",IF(N(F{r})=0,"－",N(P{r})/N(F{r})))', "0.0", "right"),
            (f'=IF({sel}="","",{sum6sel_k("N", k, maxrows, sel)})', '0.0"h"', "right"),
            (f'=IF({sel}="","",{sum6sel_k("Q", k, maxrows, sel)})', '0"回"', "right"),
        ]
        for (title, a, b), (formula, fmt, align) in zip(tbl_cols, vals):
            ws.merge_cells(f"{L(a)}{r}:{L(b)}{r}")
            ws[f"{L(a)}{r}"] = formula
            style(ws[f"{L(a)}{r}"], size=10, bg="FFFFFF", align=align, fmt=fmt)
            for c in range(a, b + 1):
                ws[f"{L(c)}{r}"].border = Border(bottom=hair)
    r = 55
    totals = [
        ('="合計"', None, "left"),
        (f'=IF(${HC}$4="","",SUM(F49:F54))', '0"日"', "right"),
        (f'=IF(${HC}$4="","",SUM(H49:H54))', '0"日"', "right"),
        (f'=IF(${HC}$4="","",SUM(J49:J54))', '0"日"', "right"),
        (f'=IF(${HC}$4="","",IF(N(J55)=0,"－",N(F55)/N(J55)))', "0.0%", "right"),
        (f'=IF(${HC}$4="","",SUM(P49:P54))', '0.0"h"', "right"),
        (f'=IF(${HC}$4="","",IF(N(F55)=0,"－",N(P55)/N(F55)))', "0.0", "right"),
        (f'=IF(${HC}$4="","",SUM(V49:V54))', '0.0"h"', "right"),
        (f'=IF(${HC}$4="","",SUM(X49:X54))', '0"回"', "right"),
    ]
    for (title, a, b), (formula, fmt, align) in zip(tbl_cols, totals):
        ws.merge_cells(f"{L(a)}{r}:{L(b)}{r}")
        ws[f"{L(a)}{r}"] = formula
        style(ws[f"{L(a)}{r}"], size=10, bold=True, bg="F3F3F0", align=align, fmt=fmt)
        for c in range(a, b + 1):
            ws[f"{L(c)}{r}"].border = Border(top=thin, bottom=thin)
    ws.conditional_formatting.add("F49:F54", DataBarRule(start_type="num", start_value=0, end_type="max", color=C_BLUE, showValue=True))
    ws.conditional_formatting.add("H49:H54", DataBarRule(start_type="num", start_value=0, end_type="max", color=C_RED, showValue=True))
    for formula, color in [(f'AND(ISNUMBER(M49),M49>=${HC}$7)', C_GOOD_TXT), (f'AND(ISNUMBER(M49),M49>=${HC}$8)', C_WARN_TXT), ('ISNUMBER(M49)', C_CRIT)]:
        ws.conditional_formatting.add("M49:M55", FormulaRule(formula=[formula], font=Font(name=FONT, bold=True, size=10, color=color), stopIfTrue=True))

    # 月別推移（積み上げ縦棒）: 月別サマリー表を参照
    ch = BarChart()
    ch.type, ch.grouping, ch.overlap, ch.gapWidth = "col", "stacked", 100, 55
    ch.add_data(Reference(ws, range_string=f"{q(S_DASH)}!$F$48:$F$54"), titles_from_data=True)
    ch.add_data(Reference(ws, range_string=f"{q(S_DASH)}!$H$48:$H$54"), titles_from_data=True)
    ch.set_categories(Reference(ws, range_string=f"{q(S_DASH)}!$B$49:$B$54"))
    ch.series[0].graphicalProperties = gp(C_BLUE)
    ch.series[1].graphicalProperties = gp(C_RED)
    ch.series[0].dLbls = DataLabelList()
    ch.series[0].dLbls.showVal = True
    ch.series[0].dLbls.showSerName = False
    ch.series[0].dLbls.showCatName = False
    ch.series[0].dLbls.showLegendKey = False
    ch.y_axis.majorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill=C_GRID))
    ch.x_axis.delete = False
    ch.y_axis.delete = False
    ch.y_axis.number_format = "0"
    ch.legend.position = "b"
    ch.width, ch.height = 7.7, 7.0
    ws.add_chart(ch, "J16")

    # ---- グラフ行2
    ws.row_dimensions[30].height = 8
    ws.row_dimensions[31].height = 16
    for r in range(32, 46):
        ws.row_dimensions[r].height = 15
    for c, t in (("B", "曜日別 出勤日数"), ("J", "出勤率の比較（本人・全体・同所属）"), ("R", "休みへの変更タイミング（日数）")):
        ws[f"{c}31"] = t
        style(ws[f"{c}31"], size=10, bold=True)
    for a, b in (("B", "I"), ("J", "Q"), ("R", "Y")):
        fill_range(ws, f"{a}32:{b}45", "FFFFFF")
        box_range(ws, f"{a}32:{b}45")

    ch = BarChart()
    ch.type, ch.gapWidth = "col", 40
    ch.add_data(Reference(ws, range_string=f"{q(S_DASH)}!${HC}$25:${HC}$31"), titles_from_data=False)
    ch.set_categories(Reference(ws, range_string=f"{q(S_DASH)}!${HL}$25:${HL}$31"))
    ch.series[0].graphicalProperties = gp(C_BLUE)
    for i in (0, 6):
        pt = DataPoint(idx=i)
        pt.graphicalProperties = gp(C_BLUE_D)
        ch.series[0].dPt.append(pt)
    ch.dataLabels = DataLabelList()
    ch.dataLabels.showVal = True
    ch.dataLabels.showSerName = False
    ch.dataLabels.showCatName = False
    ch.dataLabels.showLegendKey = False
    ch.y_axis.majorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill=C_GRID))
    ch.x_axis.delete = False
    ch.y_axis.delete = False
    ch.y_axis.number_format = "0"
    ch.legend = None
    ch.width, ch.height = 7.7, 7.0
    ws.add_chart(ch, "B32")

    ch = BarChart()
    ch.type, ch.gapWidth = "bar", 45
    ch.add_data(Reference(ws, range_string=f"{q(S_DASH)}!${HC}$34:${HC}$36"), titles_from_data=False)
    ch.set_categories(Reference(ws, range_string=f"{q(S_DASH)}!${HL}$34:${HL}$36"))
    ch.series[0].graphicalProperties = gp(C_GRAY_BAR)
    pt = DataPoint(idx=0)
    pt.graphicalProperties = gp(C_BLUE)
    ch.series[0].dPt.append(pt)
    ch.dataLabels = DataLabelList()
    ch.dataLabels.showVal = True
    ch.dataLabels.showSerName = False
    ch.dataLabels.showCatName = False
    ch.dataLabels.showLegendKey = False
    ch.dataLabels.numFmt = "0.0%"
    ch.x_axis.scaling.orientation = "maxMin"
    ch.y_axis.scaling.min, ch.y_axis.scaling.max = 0, 1
    ch.y_axis.number_format = "0%"
    ch.y_axis.majorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill=C_GRID))
    ch.x_axis.delete = False
    ch.y_axis.delete = False
    ch.legend = None
    ch.width, ch.height = 7.7, 7.0
    ws.add_chart(ch, "J32")

    # 休みへの変更タイミング（表）
    for j, (a, b, t) in enumerate([("R", "V", "区分"), ("W", "X", "日数"), ("Y", "Y", "")]):
        ws.merge_cells(f"{a}33:{b}33")
        ws[f"{a}33"] = t
        style(ws[f"{a}33"], size=9, bold=True, color="FFFFFF", bg=C_INK2, align="center")
    for i, (code, label) in enumerate(REST_CATS):
        r = 34 + i * 2
        ws.merge_cells(f"R{r}:V{r + 1}")
        ws[f"R{r}"] = label
        style(ws[f"R{r}"], size=10, bg="FFFFFF", align="left")
        ws.merge_cells(f"W{r}:X{r + 1}")
        ws[f"W{r}"] = f'=IF({sel}="","",${HC}${39 + i})'
        style(ws[f"W{r}"], size=12, bold=True, bg="FFFFFF", align="right", fmt='0"日"', color=(C_RED if code == "当日" else C_INK))
        for c in "RSTUVWXY":
            ws[f"{c}{r + 1}"].border = Border(bottom=hair)
    ws.merge_cells("R42:Y45")
    ws["R42"] = "確定していたシフトを「休み」に変更したタイミング別の日数。「当日」が欠勤としてカウントされます（同じ日に勤務した区分がある場合を除く）。"
    style(ws["R42"], size=8, color=C_MUTED, bg="FFFFFF", align="left", valign="top", wrap=True)
    ws.conditional_formatting.add("W34:W41", DataBarRule(start_type="num", start_value=0, end_type="max", color=C_GRAY_BAR, showValue=True))

    # ---- 指標の定義
    ws.row_dimensions[56].height = 8
    ws["B57"] = "指標の定義・注意事項"
    style(ws["B57"], size=10, bold=True)
    notes = [
        "出勤日数：ステータスが「確定」系で勤務種別が勤務（1）のシフトがある日数。同じ日に複数の区分（例：調理→コンセ回し）があっても1日と数えます。",
        "欠勤日数：確定していたシフトが、シフト当日に「休み」（勤務種別4）へ変更された日数（更新時刻は日本時間で判定）。前日以前の変更は欠勤に含めず、「休みへの変更タイミング」に表示します。",
        "確定シフト日数 ＝ 出勤日数 ＋ 欠勤日数。出勤率 ＝ 出勤日数 ÷ 確定シフト日数、欠勤率 ＝ 欠勤日数 ÷ 確定シフト日数。事前に休みへ変更した日は分母に含めません。",
        "勤務時間：変更後の開始〜終了時間から休憩を引いた予定ベースの時間（打刻データではありません）。深夜勤務時間は設定シートの時間帯（既定 22:00〜翌5:00）との重なりです。",
        "遅刻・早退は本CSVに記録がないため算出していません（打刻データ連携で追加予定）。却下回数は店舗側の判断による応募却下の件数で、本人評価の指標ではなく参考情報です。",
        "総合判定は出勤率のみを基準にした目安です（◎ 欠勤なし／○ 設定シートの基準以上／△ 注意／✕ 要改善）。確定シフト日数が少ない場合は「参考値」と表示されます。",
    ]
    for i, t in enumerate(notes):
        r = 58 + i
        ws.row_dimensions[r].height = 24
        ws.merge_cells(f"B{r}:Y{r}")
        ws[f"B{r}"] = "・" + t
        style(ws[f"B{r}"], size=8, color=C_INK2, align="left", valign="top", wrap=True)

    # ---- 印刷設定（A4縦・1ページ）
    ws.print_area = "A1:Z64"
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = ws.page_margins.bottom = 0.4
    ws.sheet_view.zoomScale = 100
    return ws


def sum6sel_k(colref, k, maxrows, sel):
    return f"SUMIFS({calc_rng(k, colref, maxrows)},{calc_rng(k, 'A', maxrows)},{sel})"


# ---------------------------------------------------------------- シート: スタッフ一覧
def build_staff_list(wb):
    ws = wb.create_sheet(S_LIST)
    ws.sheet_properties.tabColor = C_BLUE
    ws.sheet_view.showGridLines = False
    ros, sets = q(S_ROSTER), q(S_SET)
    ML = MAXSTAFF + 1

    ws["A1"] = "スタッフ一覧（半年集計）"
    style(ws["A1"], size=16, bold=True)
    ws["A2"] = f'="対象期間　"&{ros}!$AY$29&"　｜　名前順（先頭の部門記号でまとまります）。フィルターで所属や判定を絞り込めます。並べ替えはせず、順位列をご利用ください。"'
    style(ws["A2"], size=9, color=C_INK2)

    # 全体サマリー
    tiles = [("スタッフ数", f"={ros}!$AY$2", '0"名"'), ("評価対象（確定シフトあり）", f"={ros}!$AY$8", '0"名"'),
             ("全体出勤率", f"={ros}!$AY$6", "0.0%"), ("全体欠勤率", f"={ros}!$AY$7", "0.0%"),
             ("総出勤日数", f"={ros}!$AY$3", '#,##0"日"'), ("総欠勤日数", f"={ros}!$AY$4", '#,##0"日"')]
    for i, (label, formula, fmt) in enumerate(tiles):
        c = 1 + i * 2
        a, b = L(c), L(c + 1)
        ws[f"{a}4"] = label
        style(ws[f"{a}4"], size=8, color=C_INK2, bg="FFFFFF")
        ws.merge_cells(f"{a}5:{b}5")
        ws[f"{a}5"] = formula
        style(ws[f"{a}5"], size=16, bold=True, bg="FFFFFF", fmt=fmt, align="left")
        style(ws[f"{b}4"], bg="FFFFFF")
        box_range(ws, f"{a}4:{b}5")
    ws.row_dimensions[5].height = 24

    # 所属別
    ws["A7"] = "所属別"
    style(ws["A7"], size=10, bold=True)
    for j, h in enumerate(["所属", "人数", "出勤日数", "欠勤日数", "確定シフト日数", "出勤率", "欠勤率"]):
        c = ws.cell(row=8, column=1 + j, value=h)
        style(c, size=9, bold=True, color="FFFFFF", bg=C_INK2, align="center")
    for i in range(len(DEPTS)):
        r = 9 + i
        src = 14 + i
        for j, (colref, fmt) in enumerate([("AY", None), ("AZ", '0"名"'), ("BA", '#,##0"日"'), ("BB", '#,##0"日"'), ("BC", '#,##0"日"'), ("BD", "0.0%"), ("BE", "0.0%")]):
            c = ws.cell(row=r, column=1 + j, value=f"={ros}!${colref}${src}")
            style(c, size=10, fmt=fmt, align=("left" if j == 0 else "right"), border=Border(bottom=hair))

    # ワースト
    ws["J7"] = f'="出勤率 ワースト10（確定シフト日数 "&{sets}!$B$5&"日以上の人が対象）"'
    style(ws["J7"], size=10, bold=True)
    for j, h in enumerate(["名前", "所属", "確定シフト日数", "欠勤日数", "出勤率"]):
        c = ws.cell(row=8, column=10 + j, value=h)
        style(c, size=9, bold=True, color="FFFFFF", bg=C_INK2, align="center")
    for n in range(1, 11):
        r = 8 + n
        m = f"IFERROR(MATCH({n},{ros}!$Y$2:$Y${ML},0),\"\")"
        ws[f"J{r}"] = f'=IF({m}="","",INDEX({ros}!$J$2:$J${ML},{m}))'
        ws[f"K{r}"] = f'=IF({m}="","",IFERROR(INDEX({ros}!$AY$14:$AY$17,MATCH(INDEX({ros}!$K$2:$K${ML},{m}),{ros}!$AX$14:$AX$17,0)),INDEX({ros}!$K$2:$K${ML},{m})))'
        ws[f"L{r}"] = f'=IF({m}="","",INDEX({ros}!$O$2:$O${ML},{m}))'
        ws[f"M{r}"] = f'=IF({m}="","",INDEX({ros}!$N$2:$N${ML},{m}))'
        ws[f"N{r}"] = f'=IF({m}="","",INDEX({ros}!$P$2:$P${ML},{m}))'
        for c, fmt, al in (("J", None, "left"), ("K", None, "left"), ("L", '0"日"', "right"), ("M", '0"日"', "right"), ("N", "0.0%", "right")):
            style(ws[f"{c}{r}"], size=10, fmt=fmt, align=al, border=Border(bottom=hair))
    ws.conditional_formatting.add("N9:N18", FormulaRule(formula=[f'AND(ISNUMBER(N9),N9<{sets}!$B$4)'], font=Font(name=FONT, bold=True, color=C_CRIT, size=10)))

    # スタッフ別テーブル
    HR = 21
    ws[f"A{HR - 1}"] = "スタッフ別 集計（半年）"
    style(ws[f"A{HR - 1}"], size=10, bold=True)
    headers = ["順位", "名前", "従業員番号", "所属", "資格", "出勤日数", "欠勤日数", "確定シフト日数", "出勤率", "欠勤率", "判定",
               "勤務時間", "平均 h／日", "深夜時間", "却下回数", "在籍月数"]
    month_hdr_w = [f'="出勤 "&{ros}!$AY${21 + k}' for k in range(1, NSHEETS + 1)]
    month_hdr_a = [f'="欠勤 "&{ros}!$AY${21 + k}' for k in range(1, NSHEETS + 1)]
    for j, h in enumerate(headers + month_hdr_w + month_hdr_a):
        c = ws.cell(row=HR, column=1 + j, value=h)
        style(c, size=9, bold=True, color="FFFFFF", bg=C_INK2, align="center", wrap=True)
    ws.row_dimensions[HR].height = 30
    widths = [6, 24, 11, 9, 11, 9, 9, 11, 9, 9, 13, 9, 10, 9, 9, 8] + [9] * 12
    for j, w in enumerate(widths):
        ws.column_dimensions[L(1 + j)].width = w

    grade = lambda x: f'SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({x},"01アルバイト","アルバイト"),"02サブリーダー","サブリーダー"),"03リーダー","リーダー")'
    for n in range(1, MAXSTAFF + 1):
        r = HR + n
        m = f"{ros}!$AV${n + 1}"
        def rv(colref):
            return f"INDEX({ros}!${colref}$2:${colref}${ML},{m})"
        cells = [
            (f'=IF({m}="","",{rv("W")})', "0", "center"),
            (f'=IF({m}="","",{rv("J")})', None, "left"),
            (f'=IF({m}="","",{rv("I")})', "0", "right"),
            (f'=IF({m}="","",IFERROR(INDEX({ros}!$AY$14:$AY$17,MATCH({rv("K")},{ros}!$AX$14:$AX$17,0)),{rv("K")}))', None, "left"),
            (f'=IF({m}="","",{grade(rv("L"))})', None, "left"),
            (f'=IF({m}="","",{rv("M")})', '0"日"', "right"),
            (f'=IF({m}="","",{rv("N")})', '0"日"', "right"),
            (f'=IF({m}="","",{rv("O")})', '0"日"', "right"),
            (f'=IF({m}="","",{rv("P")})', "0.0%", "right"),
            (f'=IF({m}="","",{rv("Q")})', "0.0%", "right"),
            (f'=IF({m}="","",IF({rv("P")}="","－",IF({rv("P")}>=1,"◎ 欠勤なし",IF({rv("P")}>={sets}!$B$3,"○ 優良",IF({rv("P")}>={sets}!$B$4,"△ 注意","✕ 要改善")))&IF({rv("O")}<{sets}!$B$5,"（参考値）","")))', None, "left"),
            (f'=IF({m}="","",{rv("R")})', '0.0"h"', "right"),
            (f'=IF({m}="","",{rv("T")})', "0.0", "right"),
            (f'=IF({m}="","",{rv("S")})', '0.0"h"', "right"),
            (f'=IF({m}="","",{rv("U")})', '0"回"', "right"),
            (f'=IF({m}="","",{rv("AR")})', '0"ヶ月"', "right"),
        ]
        cells += [(f'=IF({m}="","",{rv(MONTH_WORK[k])})', "0", "right") for k in range(NSHEETS)]
        cells += [(f'=IF({m}="","",{rv(MONTH_ABS[k])})', "0", "right") for k in range(NSHEETS)]
        for j, (formula, fmt, al) in enumerate(cells):
            c = ws.cell(row=r, column=1 + j, value=formula)
            style(c, size=10, fmt=fmt, align=al, border=Border(bottom=hair))
    last = HR + MAXSTAFF
    ws.auto_filter.ref = f"A{HR}:{L(16 + 2 * NSHEETS)}{last}"
    ws.freeze_panes = f"C{HR + 1}"
    ws.conditional_formatting.add(f"F{HR + 1}:F{last}", DataBarRule(start_type="num", start_value=0, end_type="max", color=C_BLUE, showValue=True))
    ws.conditional_formatting.add(f"G{HR + 1}:G{last}", FormulaRule(formula=[f"AND(ISNUMBER(G{HR + 1}),G{HR + 1}>0)"], font=Font(name=FONT, bold=True, color=C_CRIT, size=10)))
    for formula, color in [(f'AND(ISNUMBER(I{HR + 1}),I{HR + 1}>={sets}!$B$3)', C_GOOD_TXT), (f'AND(ISNUMBER(I{HR + 1}),I{HR + 1}>={sets}!$B$4)', C_WARN_TXT), (f'ISNUMBER(I{HR + 1})', C_CRIT)]:
        ws.conditional_formatting.add(f"I{HR + 1}:I{last}", FormulaRule(formula=[formula], font=Font(name=FONT, bold=True, size=10, color=color), stopIfTrue=True))
    for formula, color in [(f'LEFT(K{HR + 1},1)="◎"', C_GOOD_TXT), (f'LEFT(K{HR + 1},1)="○"', C_GOOD_TXT), (f'LEFT(K{HR + 1},1)="△"', C_WARN_TXT), (f'LEFT(K{HR + 1},1)="✕"', C_CRIT)]:
        ws.conditional_formatting.add(f"K{HR + 1}:K{last}", FormulaRule(formula=[formula], font=Font(name=FONT, bold=True, size=10, color=color), stopIfTrue=True))
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{HR}:{HR}"
    return ws


# ---------------------------------------------------------------- シート: 使い方
def build_howto(wb, maxrows):
    ws = wb.create_sheet(S_HOWTO)
    ws.sheet_properties.tabColor = "EDA100"
    ws.sheet_view.showGridLines = False
    ros = q(S_ROSTER)
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 70
    ws["B2"] = "勤務実績ダッシュボード　使い方"
    style(ws["B2"], size=18, bold=True)
    ws["B3"] = "シェアフルシフトの月次シフトCSVを貼り付けるだけで、スタッフごとの出勤日数・出勤率・欠勤率などを集計します。"
    style(ws["B3"], size=10, color=C_INK2)

    r = 5
    ws[f"B{r}"] = "手順"
    style(ws[f"B{r}"], size=12, bold=True)
    steps = [
        ("1", "シェアフルシフトから1ヶ月分のシフトCSVを出力し、Excelで開きます（ダブルクリックで開けます）。"),
        ("2", "CSVの全体（1行目のヘッダーを含む・列はそのまま）をコピーします。Ctrl+A → Ctrl+C。"),
        ("3", "このブックの「CSV_1」シートのA1セルを選択して貼り付けます（Ctrl+V）。2ヶ月目は「CSV_2」、以降「CSV_3」…「CSV_6」へ。順番は古い月から新しい月の順が見やすいです。"),
        ("4", "「ダッシュボード」シートで、スタッフ名をドロップダウンから選ぶ（または氏名を入力する）と、その人の実績が表示されます。印刷はA4縦1ページに収まります。"),
        ("5", "全員の一覧・順位・所属別の集計は「スタッフ一覧」シートで確認できます。判定の基準値や深夜時間帯は「設定」シートで変更できます。"),
        ("★", "貼り直すときは、貼付シートの古いデータをすべて削除（Ctrl+A → Delete）してから貼り付けてください。行数が前より少ない月を上書きすると、古い行が残ってしまいます。"),
    ]
    for i, (n, t) in enumerate(steps):
        rr = r + 1 + i
        ws[f"B{rr}"] = n
        style(ws[f"B{rr}"], size=11, bold=True, color=C_BLUE, align="center")
        ws.merge_cells(f"C{rr}:E{rr}")
        ws[f"C{rr}"] = t
        style(ws[f"C{rr}"], size=10, align="left", wrap=True)
        ws.row_dimensions[rr].height = 30

    r = 13
    ws[f"B{r}"] = "貼付状況"
    style(ws[f"B{r}"], size=12, bold=True)
    for j, h in enumerate(["シート", "月", "貼付行数", "状態"]):
        c = ws.cell(row=r + 1, column=2 + j, value=h)
        style(c, size=9, bold=True, color="FFFFFF", bg=C_INK2, align="center")
    for k in range(1, NSHEETS + 1):
        rr = r + 1 + k
        ws[f"B{rr}"] = S_CSV.format(k)
        ws[f"C{rr}"] = f"={ros}!$AY${21 + k}"
        ws[f"D{rr}"] = f"={ros}!$AZ${21 + k}"
        ws[f"E{rr}"] = f"={ros}!$BA${21 + k}"
        for c in "BCDE":
            style(ws[f"{c}{rr}"], size=10, border=Border(bottom=hair), align=("right" if c == "D" else "left"))
        ws[f"D{rr}"].number_format = "#,##0"
    ws.conditional_formatting.add(f"E{r + 2}:E{r + 1 + NSHEETS}", FormulaRule(formula=[f'LEFT(E{r + 2},1)="⚠"'], font=Font(name=FONT, bold=True, color=C_CRIT, size=10)))
    ws.conditional_formatting.add(f"E{r + 2}:E{r + 1 + NSHEETS}", FormulaRule(formula=[f'E{r + 2}="OK"'], font=Font(name=FONT, bold=True, color=C_GOOD_TXT, size=10)))

    r = 22
    ws[f"B{r}"] = "指標の定義"
    style(ws[f"B{r}"], size=12, bold=True)
    defs = [
        ("出勤日数", "ステータスが「確定」系（確定／確定（シフト作成）／確定（アサイン））で、勤務種別が勤務（1）のシフトがある日数。同じ日の複数区分は1日と数えます。"),
        ("欠勤日数", "確定していたシフトが、シフト当日に「休み」（勤務種別4）へ変更された日数。CSVの「更新時間」を日本時間に直してシフト日と比較します。前日までの変更は欠勤に含めません。"),
        ("確定シフト日数", "出勤日数 ＋ 欠勤日数。事前に休みへ変更した日は含めません。"),
        ("出勤率／欠勤率", "出勤日数 ÷ 確定シフト日数 ／ 欠勤日数 ÷ 確定シフト日数。"),
        ("勤務時間", "「変更後の開始・終了時間」（無ければ募集時間）から休憩1〜3を引いた、シフト予定ベースの時間。打刻（実績）ではありません。"),
        ("深夜勤務時間", "勤務時間のうち、設定シートの深夜時間帯（既定 22:00〜翌5:00）に重なる時間。"),
        ("却下回数", "応募ステータスが「却下」系の行数。店舗側の判断で却下された件数なので、本人評価ではなく参考情報です。"),
        ("総合判定", "出勤率のみを基準にした目安。◎ 欠勤なし（100%）／○ 優良（設定の基準以上）／△ 注意／✕ 要改善。確定シフト日数が設定の日数未満の人は「参考値」と付記します。"),
        ("遅刻・早退", "本CSVには打刻情報がないため算出していません。打刻データの連携で追加予定です。"),
    ]
    for i, (k_, t) in enumerate(defs):
        rr = r + 1 + i
        ws[f"B{rr}"] = k_
        style(ws[f"B{rr}"], size=10, bold=True, align="left", valign="top")
        ws.merge_cells(f"C{rr}:E{rr}")
        ws[f"C{rr}"] = t
        style(ws[f"C{rr}"], size=10, align="left", valign="top", wrap=True)
        ws.row_dimensions[rr].height = 30

    r = 33
    ws[f"B{r}"] = "注意事項"
    style(ws[f"B{r}"], size=12, bold=True)
    cautions = [
        f"1ヶ月あたり {maxrows:,} 行、スタッフは半年で {MAXSTAFF} 名まで集計できます。超えた場合は「貼付状況」に警告が出ます。",
        "スタッフは「応募者の従業員番号」で同一人物を判定し、名前は最新月のものを表示します（名前の前後の記号が月によって変わっても同じ人として集計されます）。",
        "CSVの列名（1行目）で列を探すため、列の順番が変わっても動作します。列名が変わった場合は「貼付状況」に警告が出ます。",
        "開いたときに計算に数秒かかることがあります。「ダッシュボード」「スタッフ一覧」以外のシート（設定・名簿・計算1〜6）の数式は編集しないでください。",
        "このファイルには個人の勤務情報が含まれます。取り扱いにご注意ください。",
    ]
    for i, t in enumerate(cautions):
        rr = r + 1 + i
        ws.merge_cells(f"B{rr}:E{rr}")
        ws[f"B{rr}"] = "・" + t
        style(ws[f"B{rr}"], size=10, align="left", valign="top", wrap=True)
        ws.row_dimensions[rr].height = 28
    return ws


# ---------------------------------------------------------------- main
def build(output, csv_paths=(), maxrows=6000, select=None):
    wb = Workbook()
    wb.remove(wb.active)
    build_howto(wb, maxrows)
    build_dashboard(wb, maxrows, select=select)
    build_staff_list(wb)
    for k in range(1, NSHEETS + 1):
        rows = read_csv(csv_paths[k - 1]) if k - 1 < len(csv_paths) else None
        build_csv_sheet(wb, k, rows)
    build_settings(wb)
    build_roster(wb, maxrows)
    for k in range(1, NSHEETS + 1):
        build_calc_sheet(wb, k, maxrows)

    ML = MAXSTAFF + 1
    wb.defined_names["StaffNames"] = DefinedName(
        "StaffNames", attr_text=f"OFFSET({q(S_ROSTER)}!$AT$2,0,0,MAX(1,COUNTIF({q(S_ROSTER)}!$AT$2:$AT${ML},\"?*\")),1)")
    wb.calculation = CalcProperties(fullCalcOnLoad=True)
    wb.active = wb.sheetnames.index(S_DASH)
    wb.save(output)
    return output


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("output")
    ap.add_argument("--csv", nargs="*", default=[], help="CSV_1, CSV_2 … に貼り付けた状態で生成するCSVファイル")
    ap.add_argument("--maxrows", type=int, default=6000, help="1ヶ月あたりの最大行数")
    ap.add_argument("--select", default=None, help="ダッシュボードで初期選択するスタッフ名（検証用）")
    a = ap.parse_args()
    print(build(a.output, a.csv, a.maxrows, a.select))
