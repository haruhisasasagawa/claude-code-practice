# -*- coding: utf-8 -*-
"""
シフト・人員配置表テンプレートに「MGRシフト貼り付け → 自動変換」機能を組み込む。

使い方:
  python build.py <テンプレート.xlsx> <MGRシフト.xlsx> <月シート名(例:12)> <出力.xlsx>

組み込む内容:
  - MGR設定   : 表示開始時刻・出勤判定(分)・必要人数(区分×時間)・使い方
  - MGR貼付   : MGRシフト表の月シートを「値貼り付け」する場所(初期値として指定月を転記)
  - MGRマスタ : MGRシフト表の「マスタ」シートの値(記号→出勤・退勤・区分)
  - 設定      : 対象年月/社員名を貼付内容から自動取得、配置先=早番/中番/遅番/夜番
  - 日別1〜31 : C9:P28 と C34:P43 を数式化(貼付内容から自動反映)
"""
import sys, datetime as dt
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L

TEMPLATE, MGR, MONTH_SHEET, OUT = sys.argv[1:5]

FONT = "Meiryo UI"
BLUE = Font(name=FONT, size=10, color="0000FF")
BLACK = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
TITLE = Font(name=FONT, size=14, bold=True)
GREY = Font(name=FONT, size=9, color="66727A")
YELLOW = PatternFill("solid", fgColor="FFFF00")
HEAD = PatternFill("solid", fgColor="DDEBF7")
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = openpyxl.load_workbook(TEMPLATE)
mgr_v = openpyxl.load_workbook(MGR, data_only=True)   # 値のみ
src = mgr_v[MONTH_SHEET]
master = mgr_v["マスタ"]

def hours(v):
    """マスタの時刻セル → 0:00起点の時間(翌日は+24)。数値以外は None"""
    if isinstance(v, dt.datetime):          # 1900-01-01 hh:mm = 翌日
        return 24 + v.hour + v.minute / 60
    if isinstance(v, dt.time):
        return v.hour + v.minute / 60
    if isinstance(v, (int, float)):
        return v * 24
    return None

# ---------------------------------------------------------------- 新シート
idx = wb.sheetnames.index("設定") + 1
ws_set = wb.create_sheet("MGR設定", idx)
ws_paste = wb.create_sheet("MGR貼付", idx + 1)
ws_mst = wb.create_sheet("MGRマスタ", idx + 2)
for w in (ws_set, ws_paste, ws_mst):
    w.sheet_view.showGridLines = False
    w.sheet_properties.tabColor = "2F6597"

# --- MGR貼付: 月シートの値をそのまま転記(同じ座標)
for row in src.iter_rows():
    for c in row:
        if c.value is None:
            continue
        t = ws_paste.cell(c.row, c.column, c.value)
        t.font = Font(name=FONT, size=9)
        if c.row == 3 and isinstance(c.value, (dt.datetime, dt.date)):
            t.number_format = "m/d"
            t.font = Font(name=FONT, size=9, bold=True)
        elif c.row == 1 and isinstance(c.value, (dt.datetime, dt.date)):
            t.number_format = "yyyy/m"
ws_paste.column_dimensions["A"].width = 6
ws_paste.column_dimensions["B"].width = 6
ws_paste.column_dimensions["C"].width = 8
for col in range(4, 35):
    ws_paste.column_dimensions[L(col)].width = 4.2
ws_paste.freeze_panes = "D7"
for r in range(7, 66, 2):           # 氏名行を軽く塗る
    for col in range(3, 35):
        ws_paste.cell(r, col).fill = PatternFill("solid", fgColor="F3F6FA")

# --- MGRマスタ: 値を転記。時刻は 0:00起点の数値(翌日は+1)
for row in master.iter_rows():
    for c in row:
        if c.value is None:
            continue
        v = c.value
        t = ws_mst.cell(c.row, c.column)
        if c.column in (1, 3) and 6 <= c.row <= 53 and hours(v) is not None:
            t.value = hours(v) / 24
            t.number_format = "h:mm"
        else:
            t.value = v
        t.font = Font(name=FONT, size=9)
ws_mst["A1"] = "MGRシフト表の「マスタ」シートを値貼り付けする場所です(A1に貼り付け)。A列=出勤、B列=記号、C列=退勤、D列=区分(早番/中番/遅番/夜番)。退勤が翌日の場合は 1 を足した時刻(例 2:00 → 26:00)で持ちます。"
ws_mst["A1"].font = GREY
for col, w in zip("ABCDEFGHIJKLM", [8, 6, 8, 7, 3, 7, 9, 3, 10, 3, 10, 3, 10]):
    ws_mst.column_dimensions[col].width = w

# --- MGR設定
S = ws_set
S.column_dimensions["A"].width = 2
S.column_dimensions["B"].width = 18
for col in range(3, 17):
    S.column_dimensions[L(col)].width = 7.5
S.column_dimensions["Q"].width = 3
S.column_dimensions["R"].width = 60

S["B2"] = "≡　MGRシフト連携 設定"; S["B2"].font = TITLE
S["B4"] = "表示開始時刻"; S["B4"].font = BOLD
S["C4"] = 7 / 24; S["C4"].number_format = "h:mm"; S["C4"].font = BLUE; S["C4"].fill = YELLOW; S["C4"].border = BOX
S["D4"] = "← 日別シート左端の時刻。ここから14時間を1時間単位で表示します(例 7:00 → 7〜20時)。"; S["D4"].font = GREY
S["B5"] = "出勤判定(分)"; S["B5"].font = BOLD
S["C5"] = 30; S["C5"].font = BLUE; S["C5"].fill = YELLOW; S["C5"].border = BOX
S["D5"] = "← 1時間マスのうち、この分数以上勤務していれば「配置あり」。30=半端な30分も表示、60=まるごと1時間のみ。"; S["D5"].font = GREY

S["B7"] = "必要人数(配置先 × 時間)　全日共通"; S["B7"].font = BOLD
S["B8"] = "配置先"; S["B8"].font = BOLD; S["B8"].fill = HEAD; S["B8"].border = BOX
for k in range(14):
    c = S.cell(8, 3 + k, f"=MOD($C$4+{k}/24,1)")
    c.number_format = "h:mm"; c.font = BOLD; c.fill = HEAD; c.border = BOX; c.alignment = Alignment(horizontal="center")
for i in range(10):                      # 設定!H10:H19 に対応
    r = 9 + i
    c = S.cell(r, 2, f'=IF(設定!$H${10+i}="","",設定!$H${10+i})'); c.font = BLACK; c.border = BOX
    for k in range(14):
        c = S.cell(r, 3 + k, 0); c.font = BLUE; c.border = BOX; c.alignment = Alignment(horizontal="center")
S["B19"] = "青字=入力欄。登録済みの配置先(行に名前があるもの)は 0〜99 の整数を入れてください。各日の必要人数欄(C34:P43)はこの表を参照します。"
S["B19"].font = GREY

guide = [
    ("B21", "■ 使い方(毎月)", BOLD),
    ("B22", "1. MGRシフト表のファイルで月のシート(例「12」)を開き、Ctrl+A で全選択 → Ctrl+C でコピー。", BLACK),
    ("B23", "2. このファイルの「MGR貼付」シートの A1 を選び、「値の貼り付け」(右クリック → 貼り付けのオプション → 値 / Ctrl+Alt+V → 値)。", BLACK),
    ("B24", "3. これだけで完了。対象年月は貼付シートの D3 の日付、社員名は C列(C7,C9,…C45 の20人)から自動で設定され、日別1〜31に配置が反映されます。", BLACK),
    ("B25", "4. 出勤記号や時刻が変わったときは、MGRシフト表の「マスタ」シートも同じ手順で「MGRマスタ」シートの A1 に値貼り付けします。", BLACK),
    ("B27", "■ 変換ルール", BOLD),
    ("B28", "・記号(A〜X、A'など)はマスタの出勤〜退勤(8.5時間)に展開し、配置先には区分(早番/中番/遅番/夜番)を入れます。", BLACK),
    ("B29", "・休・有・リフ・特・外・出・Ｂ半・出勤 など出勤時刻のない記号は「勤務なし(空欄)」になります。休憩は反映しません。", BLACK),
    ("B30", "・表示は14時間分のみ。表示時間帯の外(深夜など)の勤務は日別シートの予定hに含まれません。前日からの持ち越し(0時以降)は表示しません。", BLACK),
    ("B31", "・日別シートの黄色いマスを直接書き換えると数式が消え、その日は自動反映されなくなります(元に戻すには他の日のセルをコピー)。", BLACK),
    ("B32", "・設定シートの社員名はMGRマスタ順で先頭20人まで。配置先名(早番/中番/遅番/夜番)はMGRマスタのD列と同じ表記にしてください。", BLACK),
]
for addr, text, f in guide:
    S[addr] = text; S[addr].font = f
S["B34"] = '=IFERROR(HYPERLINK("#\'ダッシュボード\'!B2","▦ ダッシュボードへ"),"▦ ダッシュボードへ")'
S["B34"].font = Font(name=FONT, size=10, bold=True, color="2F6597")
S["B35"] = '=IFERROR(HYPERLINK("#\'MGR貼付\'!A1","MGR貼付シートへ"),"MGR貼付シートへ")'
S["B35"].font = Font(name=FONT, size=10, bold=True, color="2F6597")

# ---------------------------------------------------------------- 設定
st = wb["設定"]
st["C6"] = "=IF(ISNUMBER(MGR貼付!$D$3),YEAR(MGR貼付!$D$3),2026)"
st["F6"] = "=IF(ISNUMBER(MGR貼付!$D$3),MONTH(MGR貼付!$D$3),12)"
for i in range(20):
    st.cell(10 + i, 3, f'=TRIM(MGR貼付!$C${7 + 2*i}&"")')
for i, name in enumerate(["早番", "中番", "遅番", "夜番"]):
    st.cell(10 + i, 8, name)
for r in range(14, 20):
    st.cell(r, 8).value = None
st["B45"] = "MGRシフト表の月シートを「MGR貼付」に値貼り付けすると、年月・社員名・日別の配置が自動で反映されます(設定は「MGR設定」シート)。"

# ダッシュボードの社員数は空文字の数式セルを数えないようにする
wb["ダッシュボード"]["P6"] = '=COUNTIF(設定!C10:C29,"?*")'

# ---------------------------------------------------------------- 日別シート
COUNTA_OLD = "COUNTA($C$9:$P$28,$C$34:$P$43)"
COUNTA_NEW = '(COUNTIF($C$9:$P$28,"?*")+COUNT($C$34:$P$43))'

for n in range(1, 32):
    ws = wb[str(n)]
    # 時刻ラベル(表示開始時刻から14時間)
    for k in range(14):
        col = 3 + k
        for r in (8,):
            c = ws.cell(r, col, f"=MOD(MGR設定!$C$4+{k}/24,1)"); c.number_format = "h:mm"
        for r in (9 + k, 29 + k):
            c = ws.cell(r, 19, f"=MOD(MGR設定!$C$4+{k}/24,1)"); c.number_format = "h:mm"
    # 補助列 Z:AC (記号 / 出勤h / 退勤h / 区分)
    for i in range(20):
        r = 9 + i
        ws.cell(r, 26, f'=IF(OR($B$3="",$B{r}=""),"",IFERROR(TRIM(INDEX(MGR貼付!$D$7:$AH$65,MATCH($B{r},MGR貼付!$C$7:$C$65,0),{n})&""),""))')
        m = f'MATCH($Z{r},MGRマスタ!$B$6:$B$53,0)'
        raw_s = f'INDEX(MGRマスタ!$A$6:$A$53,{m})*24'
        raw_e = f'INDEX(MGRマスタ!$C$6:$C$53,{m})*24'
        # 区分
        ws.cell(r, 29, f'=IF($Z{r}="","",IFERROR(INDEX(MGRマスタ!$D$6:$D$53,{m})&"",""))')
        # 出勤h: マスタで 24:00 以降(翌日)として持つ時刻は、夜番以外なら当日の時刻に戻す(W=5:00 など早番)
        ws.cell(r, 27, f'=IF($Z{r}="","",IFERROR(ROUND(IF(AND({raw_s}>=24,$AC{r}<>"夜番"),{raw_s}-24,{raw_s}),4),""))')
        # 退勤h = 出勤h + 勤務時間(退勤が出勤以前なら翌日扱い)
        ws.cell(r, 28, f'=IF($AA{r}="","",IFERROR(ROUND($AA{r}+IF({raw_e}<={raw_s},{raw_e}+24-{raw_s},{raw_e}-{raw_s}),4),""))')
        for col in (26, 27, 28, 29):
            ws.cell(r, col).font = GREY
        # 配置マス
        for k in range(14):
            h0 = f"(MGR設定!$C$4*24+{k})"
            f = (f'=IF(OR($AA{r}="",$AB{r}="",$AC{r}=""),"",'
                 f'IF(ROUND((MIN($AB{r},{h0}+1)-MAX($AA{r},{h0}))*60,6)>=MGR設定!$C$5,$AC{r},""))')
            ws.cell(r, 3 + k, f)
        # 予定h: COUNTA → 文字列セルのみ数える
        q = ws.cell(r, 17)
        q.value = q.value.replace(f"COUNTA(C{r}:P{r})", f'COUNTIF(C{r}:P{r},"?*")')
    ws.cell(8, 25, "記号"); ws.cell(8, 26, "記号"); ws.cell(8, 27, "出勤h"); ws.cell(8, 28, "退勤h"); ws.cell(8, 29, "区分")
    ws.cell(8, 25).value = None
    for col in ("Z", "AA", "AB", "AC"):
        ws.column_dimensions[col].hidden = True
        ws.column_dimensions[col].width = 6
    # 入力状況・必要人時の COUNTA 置換
    ws["I3"] = ws["I3"].value.replace(COUNTA_OLD, COUNTA_NEW)
    for r in range(34, 44):
        ws.cell(r, 17).value = ws.cell(r, 17).value.replace(COUNTA_OLD, COUNTA_NEW)
        for k in range(14):
            ws.cell(r, 3 + k, f'=IF(OR($B$3="",$B{r}=""),"",MGR設定!{L(3+k)}{r - 25})')
    # 注記
    ws["B4"] = "1マス＝表示時刻から1時間。配置は「MGR貼付」の記号から自動反映(区分＝早番/中番/遅番/夜番)。表示時間帯は「MGR設定」で変更できます。"
    ws["B45"] = "必要人数は「MGR設定」シートの表(配置先×時間)から自動反映。空欄は「人数確認」と表示します。"

wb.save(OUT)
print("saved", OUT)
