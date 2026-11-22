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
from openpyxl.formatting.rule import ColorScaleRule

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
    ("B28", "・記号(A〜X、A'など)はマスタの出勤〜退勤(8.5時間)に展開し、配置先には下の「配置先グループ」の名前(記号の範囲と出勤時刻)を入れます。", BLACK),
    ("B29", "・休・有・リフ・特・外・出・Ｂ半・出勤 など出勤時刻のない記号は「勤務なし(空欄)」になります。休憩は反映しません。", BLACK),
    ("B30", "・日別シートの社員はその日の出勤者だけを出勤時刻の早い順に並べます(休みの人は出ません)。表示は14時間分のみ。表示時間帯の外(深夜など)の勤務は日別シートの予定hに含まれません。前日からの持ち越し(0時以降)は表示しません。", BLACK),
    ("B31", "・日別シートの黄色いマスを直接書き換えると数式が消え、その日は自動反映されなくなります(元に戻すには他の日のセルをコピー)。", BLACK),
    ("B32", "・設定シートの社員名はMGRマスタ順で先頭20人まで。配置先は10か所までのため、出勤時刻が近い記号を1つの配置先にまとめています(下の表で変更可)。", BLACK),
]
for addr, text, f in guide:
    S[addr] = text; S[addr].font = f
# --- 配置先グループ表 (記号を出勤時刻で10グループに分け、配置先名にする)
def hm(h):
    h = h % 24
    return f"{int(h)}:{int(round((h - int(h)) * 60)):02d}"

codes = []   # (記号, 出勤h, 退勤h, 区分)
for r in range(6, 54):
    code = master.cell(r, 2).value
    if code is None:
        continue
    s_h, e_h, kb = hours(master.cell(r, 1).value), hours(master.cell(r, 3).value), master.cell(r, 4).value
    if s_h is None:
        continue
    if s_h >= 24 and kb != "夜番":
        s_h -= 24; e_h -= 24
    if e_h <= s_h:
        e_h += 24
    codes.append((str(code), s_h, e_h, kb or ""))
# 出勤時刻の境界(時)で10グループ。最後の行は 0:00〜4:30 出勤(24〜29h)
BOUNDS = [(5, 7), (7, 9), (9, 11), (11, 13), (13, 15), (15, 17), (17, 18), (18, 21), (21, 24), (24, 29)]
groups = []
for lo, hi in BOUNDS:
    members = [c for c in codes if lo <= c[1] < hi]
    if not members:
        groups.append(None); continue
    first, last = members[0], members[-1]
    name = f"{first[0]}〜{last[0]} {hm(first[1])}-{hm(last[1])}" if len(members) > 1 else f"{first[0]} {hm(first[1])}"
    note = f"出勤 {hm(min(m[1] for m in members))}〜{hm(max(m[1] for m in members))} ／ 退勤 {hm(min(m[2] for m in members))}〜{hm(max(m[2] for m in members))} ／ {'・'.join(sorted(set(m[3] for m in members if m[3])))}"
    groups.append((name, note, [m[0] for m in members]))
code2group = {}
for gi, g in enumerate(groups):
    if g:
        for c in g[2]:
            code2group[c] = gi + 1

S["B37"] = "■ 配置先グループ(設定シートの配置先名になります。名前は書き換え可。10か所まで)"; S["B37"].font = BOLD
for col, text in zip("BCH", ["No", "配置先名(記号 出勤時刻)", "内容"]):
    c = S[f"{col}38"]; c.value = text; c.font = BOLD; c.fill = HEAD; c.border = BOX
S.merge_cells("C38:G38"); S.merge_cells("H38:P38")
for gi in range(10):
    r = 39 + gi
    S.cell(r, 2, gi + 1).font = BLACK; S.cell(r, 2).border = BOX; S.cell(r, 2).alignment = Alignment(horizontal="center")
    g = groups[gi]
    c = S.cell(r, 3, g[0] if g else None); c.font = BLUE; c.fill = YELLOW; c.border = BOX
    S.merge_cells(start_row=r, start_column=3, end_row=r, end_column=7)
    c = S.cell(r, 8, g[1] if g else None); c.font = GREY
    S.merge_cells(start_row=r, start_column=8, end_row=r, end_column=16)

S["B50"] = "■ 記号ごとの配置先(No列を書き換えるとグループを変えられます。記号・時刻はMGRマスタから自動)"; S["B50"].font = BOLD
for col, text in zip("BCDEFG", ["記号", "出勤", "退勤", "区分", "No", "配置先名"]):
    c = S[f"{col}51"]; c.value = text; c.font = BOLD; c.fill = HEAD; c.border = BOX
S.merge_cells("G51:K51")
for i in range(48):
    r = 52 + i; mr = 6 + i
    S.cell(r, 2, f'=IF(MGRマスタ!$B${mr}="","",MGRマスタ!$B${mr})').font = BLACK
    c = S.cell(r, 3, f'=IF(MGRマスタ!$A${mr}="","",MGRマスタ!$A${mr})'); c.number_format = "h:mm"; c.font = BLACK
    c = S.cell(r, 4, f'=IF(MGRマスタ!$C${mr}="","",MGRマスタ!$C${mr})'); c.number_format = "h:mm"; c.font = BLACK
    S.cell(r, 5, f'=IF(MGRマスタ!$D${mr}="","",MGRマスタ!$D${mr})').font = BLACK
    code = master.cell(mr, 2).value
    c = S.cell(r, 6, code2group.get(str(code)) if code is not None else None); c.font = BLUE; c.fill = YELLOW; c.alignment = Alignment(horizontal="center")
    S.cell(r, 7, f'=IF(OR($B{r}="",$F{r}=""),"",IFERROR(INDEX($C$39:$C$48,$F{r}),""))').font = BLACK
    S.merge_cells(start_row=r, start_column=7, end_row=r, end_column=11)
    for col in range(2, 8):
        S.cell(r, col).border = BOX

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
for i in range(10):
    st.cell(10 + i, 8, f'=IF(MGR設定!$C${39 + i}="","",MGR設定!$C${39 + i})')
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
    # 補助列 AE:AH (設定の社員順: 記号 / 区分 / 出勤h / 並べ替えキー)
    for i in range(20):
        r = 9 + i
        m2 = f'MATCH($AE{r},MGRマスタ!$B$6:$B$53,0)'
        raw2 = f'INDEX(MGRマスタ!$A$6:$A$53,{m2})*24'
        ws.cell(r, 31, f'=IF(OR($B$3="",設定!$C${10+i}=""),"",IFERROR(TRIM(INDEX(MGR貼付!$D$7:$AH$65,MATCH(設定!$C${10+i},MGR貼付!$C$7:$C$65,0),{n})&""),""))')
        ws.cell(r, 32, f'=IF($AE{r}="","",IFERROR(INDEX(MGRマスタ!$D$6:$D$53,{m2})&"",""))')
        ws.cell(r, 33, f'=IF($AE{r}="","",IFERROR(ROUND(IF(AND({raw2}>=24,$AF{r}<>"夜番"),{raw2}-24,{raw2}),4),""))')
        ws.cell(r, 34, f'=IF($AG{r}="","",$AG{r}*100+{i+1})')
        for col in (31, 32, 33, 34):
            ws.cell(r, col).font = GREY
    # 社員名: 出勤時刻の早い順(同時刻は設定の順)。出勤者のみ表示
    for k in range(20):
        r = 9 + k
        ws.cell(r, 2, f'=IFERROR(INDEX(設定!$C$10:$C$29,MATCH(SMALL($AH$9:$AH$28,{k+1}),$AH$9:$AH$28,0)),"")')
    # 補助列 Z:AD (表示行の社員: 記号 / 出勤h / 退勤h / 配置先 / 区分)
    for i in range(20):
        r = 9 + i
        ws.cell(r, 26, f'=IF(OR($B$3="",$B{r}=""),"",IFERROR(TRIM(INDEX(MGR貼付!$D$7:$AH$65,MATCH($B{r},MGR貼付!$C$7:$C$65,0),{n})&""),""))')
        m = f'MATCH($Z{r},MGRマスタ!$B$6:$B$53,0)'
        raw_s = f'INDEX(MGRマスタ!$A$6:$A$53,{m})*24'
        raw_e = f'INDEX(MGRマスタ!$C$6:$C$53,{m})*24'
        # 区分(マスタ) → AD、配置先名(MGR設定の記号表) → AC
        ws.cell(r, 30, f'=IF($Z{r}="","",IFERROR(INDEX(MGRマスタ!$D$6:$D$53,{m})&"",""))')
        ws.cell(r, 29, f'=IF($Z{r}="","",IFERROR(INDEX(MGR設定!$G$52:$G$99,MATCH($Z{r},MGR設定!$B$52:$B$99,0))&"",""))')
        # 出勤h: マスタで 24:00 以降(翌日)として持つ時刻は、夜番以外なら当日の時刻に戻す(W=5:00 など早番)
        ws.cell(r, 27, f'=IF($Z{r}="","",IFERROR(ROUND(IF(AND({raw_s}>=24,$AD{r}<>"夜番"),{raw_s}-24,{raw_s}),4),""))')
        # 退勤h = 出勤h + 勤務時間(退勤が出勤以前なら翌日扱い)
        ws.cell(r, 28, f'=IF($AA{r}="","",IFERROR(ROUND($AA{r}+IF({raw_e}<={raw_s},{raw_e}+24-{raw_s},{raw_e}-{raw_s}),4),""))')
        for col in (26, 27, 28, 29, 30):
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
    for col, t in zip((26, 27, 28, 29, 30, 31, 32, 33, 34), ("記号", "出勤h", "退勤h", "配置先", "区分", "設定順:記号", "区分", "出勤h", "並替キー")):
        ws.cell(8, col, t).font = GREY
    for col in ("Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"):
        ws.column_dimensions[col].hidden = True
        ws.column_dimensions[col].width = 6
    # 配置先名が長くなるので列幅を広げる
    for col in range(3, 17):
        ws.column_dimensions[L(col)].width = 15
    for col in ("T", "U", "V", "W", "X"):
        ws.column_dimensions[col].width = 13
    # 入力状況・必要人時の COUNTA 置換
    ws["I3"] = ws["I3"].value.replace(COUNTA_OLD, COUNTA_NEW)
    for r in range(34, 44):
        ws.cell(r, 17).value = ws.cell(r, 17).value.replace(COUNTA_OLD, COUNTA_NEW)
        for k in range(14):
            ws.cell(r, 3 + k, f'=IF(OR($B$3="",$B{r}=""),"",MGR設定!{L(3+k)}{r - 25})')
    # 29行目: 時間帯ごとの人数(配置あり・休憩を除く)と出勤者数
    HFILL = PatternFill("solid", fgColor="EAF0F3"); HFONT = Font(name=FONT, size=10, bold=True, color="30363B")
    ws.row_dimensions[29].height = 20
    c = ws["B29"]; c.value = '=IF($B$3="","人数",IF(COUNTIF($B$9:$B$28,"?*")=0,"人数","人数（出勤 "&COUNTIF($B$9:$B$28,"?*")&"名）"))'
    c.font = HFONT; c.fill = HFILL; c.border = BOX; c.alignment = Alignment(horizontal="center", vertical="center")
    for k in range(14):
        col = L(3 + k)
        c = ws.cell(29, 3 + k, f'=IF($B$3="","",COUNTIF({col}$9:{col}$28,"?*")-COUNTIF({col}$9:{col}$28,"休憩"))')
        c.font = HFONT; c.fill = HFILL; c.border = BOX; c.alignment = Alignment(horizontal="center", vertical="center")
    c = ws["Q29"]; c.value = '=IF($B$3="","",COUNTIF($B$9:$B$28,"?*"))'
    c.font = HFONT; c.fill = HFILL; c.border = BOX; c.alignment = Alignment(horizontal="center", vertical="center"); c.number_format = '0"名"'
    ws.conditional_formatting.add("C29:P29", ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF", end_type="max", end_color="5B9BD5"))
    # 注記
    ws["B4"] = "1マス＝表示時刻から1時間。配置は「MGR貼付」の記号から自動反映(配置先＝記号グループと出勤時刻)。表示時間帯・グループは「MGR設定」で変更できます。"
    ws["B45"] = "必要人数は「MGR設定」シートの表(配置先×時間)から自動反映。空欄は「人数確認」と表示します。"

# ---------------------------------------------------------------- 時間帯人数(月間一覧)
H = wb.create_sheet("時間帯人数", wb.sheetnames.index("ダッシュボード") + 1)
H.sheet_view.showGridLines = False
H.sheet_properties.tabColor = "8DBCAF"
H.column_dimensions["A"].width = 2; H.column_dimensions["B"].width = 5; H.column_dimensions["C"].width = 9
H.column_dimensions["D"].width = 5; H.column_dimensions["E"].width = 8
for k in range(14):
    H.column_dimensions[L(6 + k)].width = 7
H.column_dimensions["T"].width = 3
H["B2"] = "▦　時間帯別の人数（月間）"; H["B2"].font = TITLE
H["B3"] = "各日の配置表(29行目)の人数を一覧にしたものです。色が濃いほど人数が多い時間帯です。休憩は含みません。"; H["B3"].font = GREY
H["U2"] = '=IFERROR(HYPERLINK("#\'ダッシュボード\'!B2","▦ ダッシュボードへ"),"▦ ダッシュボードへ")'
H["U2"].font = Font(name=FONT, size=10, bold=True, color="2F6597")
HFILL = PatternFill("solid", fgColor="EAF0F3"); HFONT = Font(name=FONT, size=10, bold=True, color="30363B")
CENTER = Alignment(horizontal="center", vertical="center")
for col, t in zip("BCDE", ["日", "日付", "曜日", "出勤者"]):
    c = H[f"{col}5"]; c.value = t; c.font = HFONT; c.fill = HFILL; c.border = BOX; c.alignment = CENTER
for k in range(14):
    c = H.cell(5, 6 + k, f"=MOD(MGR設定!$C$4+{k}/24,1)"); c.number_format = "h:mm"
    c.font = HFONT; c.fill = HFILL; c.border = BOX; c.alignment = CENTER
H.row_dimensions[5].height = 22
for d in range(31):
    r = 6 + d; n = d + 1
    H.cell(r, 2, n)
    c = H.cell(r, 3, f"=IF(LEN('{n}'!$B$3)=0,\"\",'{n}'!$B$3)"); c.number_format = "m/d"
    H.cell(r, 4, f'=IF(C{r}="","",CHOOSE(WEEKDAY(C{r},2),"月","火","水","木","金","土","日"))')
    c = H.cell(r, 5, f"=IF(LEN('{n}'!$Q$29)=0,\"\",'{n}'!$Q$29)"); c.number_format = '0"名"'
    for k in range(14):
        col = L(3 + k)
        H.cell(r, 6 + k, f"=IF(LEN('{n}'!{col}$29)=0,\"\",'{n}'!{col}$29)")
    for col in range(2, 20):
        c = H.cell(r, col); c.font = BLACK; c.border = BOX; c.alignment = CENTER
    H.row_dimensions[r].height = 18
r = 37
H.cell(r, 2, "平均").font = HFONT
H.merge_cells("B37:E37"); H["B37"].fill = HFILL; H["B37"].border = BOX; H["B37"].alignment = CENTER
for k in range(14):
    col = L(6 + k)
    c = H.cell(r, 6 + k, f'=IF(COUNT({col}6:{col}36)=0,"",ROUND(AVERAGE({col}6:{col}36),1))')
    c.font = HFONT; c.fill = HFILL; c.border = BOX; c.alignment = CENTER
H.conditional_formatting.add("F6:S36", ColorScaleRule(start_type="num", start_value=0, start_color="FFFFFF", end_type="max", end_color="5B9BD5"))
# 土日は日付を色分け
from openpyxl.formatting.rule import FormulaRule
H.conditional_formatting.add("B6:E36", FormulaRule(formula=['AND(ISNUMBER($C6),WEEKDAY($C6,2)=7)'], font=Font(color="C00000")))
H.conditional_formatting.add("B6:E36", FormulaRule(formula=['AND(ISNUMBER($C6),WEEKDAY($C6,2)=6)'], font=Font(color="2F6597")))
H.freeze_panes = "F6"

# ---------------------------------------------------------------- シフトライン(30分単位・日付選択)
from openpyxl.formatting.rule import FormulaRule, Rule
from openpyxl.styles.differential import DifferentialStyle
from openpyxl.worksheet.datavalidation import DataValidation

SL = wb.create_sheet("シフトライン", wb.sheetnames.index("ダッシュボード") + 1)
SL.sheet_view.showGridLines = False
SL.sheet_properties.tabColor = "2F6597"
SLOT0, NSLOT = 5.0, 50                       # 5:00 〜 29:30 を30分刻み(翌6:00まで)
FIRST = 5                                    # バーの先頭列(E)
HFILL = PatternFill("solid", fgColor="2F6597"); HFONT = Font(name=FONT, size=9, bold=True, color="FFFFFF")
CENTER = Alignment(horizontal="center", vertical="center")
SL.column_dimensions["A"].width = 2; SL.column_dimensions["B"].width = 9
SL.column_dimensions["C"].width = 4.5; SL.column_dimensions["D"].width = 11.5
for j in range(NSLOT):
    SL.column_dimensions[L(FIRST + j)].width = 2.9
# 補助列(非表示)
HC = FIRST + NSLOT + 1                       # 表示行用: pos / 出勤h / 退勤h
HS = HC + 4                                  # 設定順: 記号 / 区分 / 出勤h / 退勤h / キー
for col in list(range(HC, HC + 3)) + list(range(HS, HS + 5)):
    SL.column_dimensions[L(col)].hidden = True
SL.column_dimensions[L(FIRST + NSLOT)].width = 2

SL["B2"] = '="【"&MGR貼付!$B$1&"】シフトライン人数確認表"'; SL["B2"].font = Font(name=FONT, size=16, bold=True, color="2F6597")
SL["B4"] = "↓ 日を選ぶ(1〜31)"; SL["B4"].font = Font(name=FONT, size=9, color="2F6597")
c = SL["B5"]; c.value = 1; c.font = Font(name=FONT, size=16, bold=True); c.fill = YELLOW; c.alignment = CENTER; c.border = BOX
SL.merge_cells("B5:C5")
dv = DataValidation(type="whole", operator="between", formula1="1", formula2="31", allow_blank=False)
SL.add_data_validation(dv); dv.add("B5")
c = SL["D5"]; c.value = '=IF(AND(ISNUMBER($B$5),$B$5>=1,$B$5<=集計!$F$5),TEXT(DATE(設定!$C$6,設定!$F$6,$B$5),"yyyy/m/d")&"（"&CHOOSE(WEEKDAY(DATE(設定!$C$6,設定!$F$6,$B$5),2),"月","火","水","木","金","土","日")&"）","")'
c.font = Font(name=FONT, size=16, bold=True); c.alignment = Alignment(horizontal="left", vertical="center")
SL.merge_cells(start_row=5, start_column=4, end_row=5, end_column=FIRST + 9)
c = SL.cell(5, FIRST + 11, '=IF($D$5="","対象月にこの日はありません","出勤 "&COUNTIF($B$9:$B$28,"?*")&" 名")')
c.font = Font(name=FONT, size=12, bold=True, color="2F6597")
SL.row_dimensions[5].height = 30
SL["B6"] = "名前・記号・勤務時間はMGR貼付から自動。バーは30分単位(5:00〜翌6:00)。上段の数字はその30分にいる人数。"; SL["B6"].font = GREY

# 見出し行(7) と 人数行(8)
for col, t in zip((2, 3, 4), ("名前", "記号", "勤務時間")):
    c = SL.cell(7, col, t); c.font = HFONT; c.fill = HFILL; c.alignment = CENTER
for j in range(NSLOT):
    c = SL.cell(7, FIRST + j); c.fill = HFILL; c.font = HFONT; c.alignment = Alignment(horizontal="left", vertical="center")
    if j % 2 == 0:
        c.value = f"{int(SLOT0 + j * 0.5)}:00"
SL.row_dimensions[7].height = 18
c = SL.cell(8, 4, "人数 →"); c.font = Font(name=FONT, size=8, bold=True, color="30363B"); c.alignment = Alignment(horizontal="right")
for j in range(NSLOT):
    col = L(FIRST + j)
    c = SL.cell(8, FIRST + j, f'=IF($D$5="","",COUNTIF({col}$9:{col}$28,1))')
    c.font = Font(name=FONT, size=8, bold=True, color="30363B"); c.alignment = CENTER
    c.fill = PatternFill("solid", fgColor="EAF0F3")
SL.row_dimensions[8].height = 15

# 設定順の補助(記号/区分/出勤/退勤/キー) と 表示行
for i in range(20):
    r = 9 + i
    cS, cK, cB, cE, cKey = (L(HS + k) for k in range(5))
    m2 = f'MATCH(${cS}{r},MGRマスタ!$B$6:$B$53,0)'
    raw_s = f'INDEX(MGRマスタ!$A$6:$A$53,{m2})*24'; raw_e = f'INDEX(MGRマスタ!$C$6:$C$53,{m2})*24'
    SL.cell(r, HS,     f'=IF(OR($D$5="",設定!$C${10+i}=""),"",IFERROR(TRIM(INDEX(MGR貼付!$D$7:$AH$65,MATCH(設定!$C${10+i},MGR貼付!$C$7:$C$65,0),$B$5)&""),""))')
    SL.cell(r, HS + 1, f'=IF(${cS}{r}="","",IFERROR(INDEX(MGRマスタ!$D$6:$D$53,{m2})&"",""))')
    SL.cell(r, HS + 2, f'=IF(${cS}{r}="","",IFERROR(ROUND(IF(AND({raw_s}>=24,${cK}{r}<>"夜番"),{raw_s}-24,{raw_s}),4),""))')
    SL.cell(r, HS + 3, f'=IF(${cB}{r}="","",IFERROR(ROUND(${cB}{r}+IF({raw_e}<={raw_s},{raw_e}+24-{raw_s},{raw_e}-{raw_s}),4),""))')
    SL.cell(r, HS + 4, f'=IF(${cB}{r}="","",${cB}{r}*100+{i+1})')
for k in range(20):
    r = 9 + k
    cP, cB2, cE2 = L(HC), L(HC + 1), L(HC + 2)
    cS, cK, cB, cE, cKey = (L(HS + x) for x in range(5))
    SL.cell(r, HC,     f'=IFERROR(MATCH(SMALL(${cKey}$9:${cKey}$28,{k+1}),${cKey}$9:${cKey}$28,0),"")')
    SL.cell(r, HC + 1, f'=IF(${cP}{r}="","",INDEX(${cB}$9:${cB}$28,${cP}{r}))')
    SL.cell(r, HC + 2, f'=IF(${cP}{r}="","",INDEX(${cE}$9:${cE}$28,${cP}{r}))')
    c = SL.cell(r, 2, f'=IF(${cP}{r}="","",INDEX(設定!$C$10:$C$29,${cP}{r}))'); c.font = Font(name=FONT, size=10, bold=True); c.alignment = CENTER
    c = SL.cell(r, 3, f'=IF(${cP}{r}="","",INDEX(${cS}$9:${cS}$28,${cP}{r}))'); c.font = Font(name=FONT, size=10); c.alignment = CENTER
    c = SL.cell(r, 4, f'=IF(${cP}{r}="","",TEXT(${cB2}{r}/24,"[h]:mm")&"-"&TEXT(${cE2}{r}/24,"[h]:mm"))'); c.font = Font(name=FONT, size=9); c.alignment = CENTER
    for j in range(NSLOT):
        t = SLOT0 + j * 0.5
        c = SL.cell(r, FIRST + j, f'=IF(${cB2}{r}="","",IF(AND({t}>=${cB2}{r},{t}<${cE2}{r}),1,""))')
        c.number_format = ";;;"
    SL.row_dimensions[r].height = 18
# 出勤計
c = SL.cell(29, 2, "出勤計"); c.font = HFONT; c.fill = HFILL; c.alignment = CENTER
c = SL.cell(29, 3, '=IF($D$5="","",COUNTIF($B$9:$B$28,"?*"))'); c.number_format = '0"名"'; c.font = Font(name=FONT, size=10, bold=True); c.alignment = CENTER
SL.merge_cells("C29:D29")

# 条件付き書式: 名前のある行だけ罫線・塗り、バーは青
last = L(FIRST + NSLOT - 1)
body = f"B9:{last}28"
bar_fill = PatternFill("solid", fgColor="5B9BD5", bgColor="5B9BD5")
SL.conditional_formatting.add(f"{L(FIRST)}9:{last}28",
    Rule(type="expression", formula=[f"{L(FIRST)}9=1"], dxf=DifferentialStyle(fill=bar_fill), stopIfTrue=False))
grid = Border(left=Side(style="hair", color="9AA5AE"), right=Side(style="hair", color="9AA5AE"),
              top=Side(style="thin", color="9AA5AE"), bottom=Side(style="thin", color="9AA5AE"))
SL.conditional_formatting.add(body, Rule(type="expression", formula=['$B9<>""'], dxf=DifferentialStyle(border=grid)))
SL.conditional_formatting.add("B9:D28", Rule(type="expression", formula=['$B9<>""'],
    dxf=DifferentialStyle(fill=PatternFill("solid", fgColor="EAF0F3", bgColor="EAF0F3"))))
# 毎正時の左側に薄い縦線
for j in range(0, NSLOT, 2):
    rng = f"{L(FIRST + j)}9:{L(FIRST + j)}28"
    SL.conditional_formatting.add(rng, Rule(type="expression", formula=['$B9<>""'],
        dxf=DifferentialStyle(border=Border(left=Side(style="thin", color="6B7780")))))
    SL.cell(8, FIRST + j).border = Border(left=Side(style="thin", color="6B7780"))
SL.freeze_panes = "E9"
SL.sheet_view.zoomScale = 90
SL.print_area = f"B2:{last}29"
SL.page_setup.orientation = "landscape"; SL.page_setup.paperSize = SL.PAPERSIZE_A4
SL.page_setup.fitToWidth = 1; SL.page_setup.fitToHeight = 1; SL.sheet_properties.pageSetUpPr.fitToPage = True

# ---------------------------------------------------------------- 集計: 社員名で日別シートを参照
sk = wb["集計"]
for e in range(20):                       # 社員別の勤務予定時間(日別)
    r = 47 + e
    for d in range(31):
        col = 6 + d; n = d + 1
        sk.cell(r, col, f'=IF(OR($B{r}="",{L(col)}$45=""),"",IFERROR(INDEX(\'{n}\'!$Q$9:$Q$28,MATCH($B{r},\'{n}\'!$B$9:$B$28,0)),IF(\'{n}\'!$I$3="未入力","",0)))')
for r in range(99, 719):                  # 日別・社員別・配置先別
    n = sk.cell(r, 2).value
    if not isinstance(n, int):
        continue
    for col in range(5, 15):
        sk.cell(r, col, f'=IF(OR({L(col)}$98="",$D{r}=""),"",IFERROR(COUNTIF(INDEX(\'{n}\'!$C$9:$P$28,MATCH($D{r},\'{n}\'!$B$9:$B$28,0),0),{L(col)}$98),0))')

wb.save(OUT)
print("saved", OUT)
