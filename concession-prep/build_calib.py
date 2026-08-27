# -*- coding: utf-8 -*-
"""
時間帯係数 較正シート（金曜4週分のMSO商品CSVから5段階の高低差を算出）生成スクリプト

MSO商品CSV(注文明細・28列): K=売店売上日付, M=注文時間, S=ステータス, T=取消区分,
Z=販売数量, AB=商品区分。金曜1日分で出力したCSVを貼付①〜④にそのまま貼ると、
時間帯(5段階)ごとの販売ペースから時間帯係数の候補を自動算出する。

使い方:
  python build_calib.py                          # 未入力テンプレート
  python build_calib.py --csv1 0717MSO.csv       # 貼付①にサンプル投入
  python build_calib.py --show-notes <xlsx>      # 再計算後にメモ常時表示化
"""
import argparse
import csv

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Border, Font
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

from build_tool import (AMBER, BORDER_HAIR, BORDER_INPUT, BORDER_LIGHT, CHIP_AMBER,
                        CHIP_CORAL, CHIP_NAVY, CORAL, F_AUTO, F_INPUT, F_ZEBRA, FONT_NAME,
                        GRAY, GREEN, INK, NAVY, RED, TEAL, WEEKDAY_JA, align, chip,
                        coral_side, fill, fnt, note, show_paste_comments, style_range,
                        title_band)

MSO_HEADERS = ["操作モード", "伝票番号", "伝票枝番", "サイトコード", "サイト名",
               "劇場コード", "劇場名", "販売場所コード", "販売場所名", "端末番号",
               "売店売上日付", "注文日付", "注文時間", "受付時間", "提供時間", "提供済時間",
               "注文金額", "注文番号", "ステータス", "取消区分", "会員番号", "商品明細番号",
               "商品コード", "商品名", "販売単価", "販売数量", "販売金額", "商品区分"]
NCOL = len(MSO_HEADERS)          # 28列: K=日付(11), M=時間(13), S=状態(19), T=取消(20),
#                                        Z=数量(26), AB=区分(28)
MSO_MAX = 12000                  # 貼付データ最大行数(金曜1日分を想定。5〜12004行目)
MSO_END = 4 + MSO_MAX
SHEETS = ["貼付①", "貼付②", "貼付③", "貼付④"]
BANDS = ["① 朝一", "② 昼ピーク", "③ 夕方", "④ 夜ピーク", "⑤ レイト"]

OUT_DEFAULT = "/home/user/claude-code-practice/concession-prep/TOHO新宿_時間帯係数_較正シート.xlsx"


def read_mso_rows(path):
    raw = open(path, "rb").read()
    for enc in ("cp932", "utf-8-sig", "utf-8"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    rows = [r for r in csv.reader(text.splitlines()) if len(r) == NCOL]
    out = []
    for r in rows[1:]:
        conv = []
        for v in r:
            v = v.strip()
            if v == "":
                conv.append(None)
                continue
            try:
                f = float(v)
                conv.append(int(f) if f == int(f) else f)
            except ValueError:
                conv.append(v)
        out.append(conv)
    return out


def build(out_path, csvs=(None, None, None, None)):
    wb = Workbook()

    # ============================================================ 使い方 =====
    ws = wb.active
    ws.title = "使い方"
    ws.sheet_properties.tabColor = NAVY
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.paperSize = 9
    for c, w in {"A": 2.5, "B": 6, "C": 13, "D": 13, "E": 13, "F": 13, "G": 13,
                 "H": 13, "I": 13, "J": 13}.items():
        ws.column_dimensions[c].width = w

    ws.row_dimensions[1].height = 38
    title_band(ws, "A1:J1", "　⏱ 時間帯係数 較正シート")
    ws.row_dimensions[2].height = 20
    note(ws, "B2:J2", "金曜4週分の注文明細（MSO商品CSV）から、時間帯5段階の高低差（係数）を実測で算出します。月1回の更新を想定。", 9.5)

    ws.row_dimensions[4].height = 22
    chip(ws, "B4:D4", "  つかいかた（3ステップ）", CHIP_NAVY, NAVY)
    steps = [
        ("①", AMBER, "先月の金曜4日分のMSO商品CSVを、貼付①〜④に1日ずつ貼る",
         "金曜1日分で出力したCSVを全選択コピー→各シートのオレンジのA4セルへ『値の貼り付け』（ヘッダー行ごとでOK）。｜担当：社員"),
        ("②", TEAL, "「係数算出」シートで 4週の波と係数候補 を確認",
         "時間帯ごとの販売個数・1時間あたりペース・係数候補が自動で出ます。貼った週だけで平均します（4週未満でも動作）。"),
        ("③", CORAL, "転記テーブルの5つの値を、準備数ツールのプリセット表へ写す",
         "「準備数計算」シート右上の時間帯プリセット表（J4:J8）に、①〜⑤の係数を手で入力すれば較正完了。"),
    ]
    r = 6
    for mark, color, head, desc in steps:
        ws.row_dimensions[r].height = 24
        ws.row_dimensions[r + 1].height = 20
        chip(ws, f"B{r}:B{r + 1}", mark, "FFFFFF", color, 16, True, "center")
        from openpyxl.styles import Side
        style_range(ws, f"B{r}:B{r + 1}", border=Border(left=Side(style="medium", color=color),
                                                        top=Side(style="medium", color=color),
                                                        bottom=Side(style="medium", color=color)))
        ws.merge_cells(f"C{r}:J{r}")
        style_range(ws, f"C{r}:J{r}", font=fnt(11, True, INK), alignment=align("left", "bottom"))
        ws[f"C{r}"] = head
        note(ws, f"C{r + 1}:J{r + 1}", desc, 9)
        r += 3

    r += 1
    ws.row_dimensions[r].height = 22
    chip(ws, f"B{r}:D{r}", "  注意メモ", CHIP_NAVY, NAVY)
    notes = [
        "・貼るのは「金曜1日分」で出力したCSVです（最大12,000行）。複数日が混ざった場合は先頭の日付だけを集計し、状態表示に注意が出ます。",
        "・集計ルール: セット親（セットの親行）は除外し、単品と構成品の実個数を数えます。注文取消・払戻も除外します。",
        "・係数候補 ＝ その時間帯の1時間あたり販売個数 ÷ 全時間帯平均の1時間あたり販売個数。時間の区切りは係数算出シートで変更できます。",
        "・金曜以外の日付を貼ると状態表示に「※金曜ではありません」と出ます（集計はされます）。",
        "・このレポートがセルフ/モバイルオーダーのみか、対面レジ分も含むかは本社仕様をご確認ください（波の形はどちらでも概ね有効です）。",
        "・算出された係数はあくまで候補です。現場の体感と大きくずれる場合は、転記時に丸めて調整してください。",
    ]
    for t in notes:
        r += 1
        ws.row_dimensions[r].height = 18
        note(ws, f"C{r}:J{r}", t, 9.5, INK)
    r += 2
    note(ws, f"C{r}:J{r}", "較正シート v1.0（2026/8）｜本体: TOHO新宿_コンセッション準備数ツール.xlsx", 8.5)

    # ========================================================== 係数算出 =====
    ws = wb.create_sheet("係数算出")
    ws.sheet_properties.tabColor = CORAL
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.paperSize = 9
    ws.print_area = "A1:L26"

    for c, w in {"A": 2.5, "B": 15, "C": 13, "D": 10, "E": 10, "F": 10, "G": 10,
                 "H": 11, "I": 10, "J": 11, "K": 11, "L": 13}.items():
        ws.column_dimensions[c].width = w

    ws.row_dimensions[1].height = 34
    title_band(ws, "B1:L1", "　⏱ 係数算出｜金曜4週分の時間帯の波")
    ws.row_dimensions[2].height = 18
    note(ws, "B2:L2", "係数候補 ＝ 帯の1時間あたり販売個数 ÷ 全帯平均の1時間あたり販売個数（セット親・取消・払戻は除外）", 9)

    # 時間の区切り(編集OK)
    ws.row_dimensions[3].height = 20
    chip(ws, "B3", "  ⏰ 時間の区切り", CHIP_AMBER, INK, 9)
    tb = [("C3", "開店", 8 / 24), ("D3", "朝→昼", 11 / 24), ("E3", "昼→夕", 15 / 24),
          ("F3", "夕→夜", 18 / 24), ("G3", "夜→レイト", 21 / 24), ("H3", "閉店(翌)", 2 / 24)]
    ws.row_dimensions[4].height = 18
    for ref, label, val in tb:
        note(ws, ref, label, 8, GRAY, h="center")
        vref = ref[0] + "4"
        ws[vref] = val
        style_range(ws, vref, font=fnt(9, True), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT, num="h:mm")
    ws["H3"].comment = Comment("最終レイトの終わり(翌日側)。翌2:00なら 2:00 と入力。", "較正シート")

    # 帯ごとの窓: ①[開店,朝→昼) ②[朝→昼,昼→夕) ③[昼→夕,夕→夜) ④[夕→夜,夜→レイト)
    #             ⑤[夜→レイト,24:00)+[0:00,閉店)
    ws.row_dimensions[6].height = 26
    heads = [("B6", "時間帯"), ("C6", "時間の目安"), ("D6", "1週目"), ("E6", "2週目"),
             ("F6", "3週目"), ("G6", "4週目"), ("H6", "平均個数"), ("I6", "帯の長さ"),
             ("J6", "1h当り"), ("K6", "係数候補"), ("L6", "転記用(丸め)")]
    for ref, text in heads:
        style_range(ws, ref, font=fnt(9, True, "FFFFFF"), fl=fill(NAVY),
                    alignment=align("center", "center", True), border=BORDER_LIGHT)
        ws[ref] = text
    style_range(ws, "K6:L6", font=fnt(9, True, "FFFFFF"), fl=fill(CORAL),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws["K6"] = "係数候補"
    ws["L6"] = "転記用(丸め)"

    starts = ["$C$4", "$D$4", "$E$4", "$F$4", "$G$4"]
    ends = ["$D$4", "$E$4", "$F$4", "$G$4", None]      # ⑤は21時〜24時+0時〜閉店
    for bi, name in enumerate(BANDS):
        r = 7 + bi
        ws.row_dimensions[r].height = 20
        ws[f"B{r}"] = name
        ws[f"C{r}"] = (f'=TEXT({starts[bi]},"h:mm")&"〜"&' +
                       (f'TEXT({ends[bi]},"h:mm")' if ends[bi] else 'TEXT($H$4,"h:mm")&"(翌)"'))
        for wi, sheet in enumerate(SHEETS):
            col = get_column_letter(4 + wi)
            rng_t = f"{sheet}!$AE$5:$AE${MSO_END}"
            rng_q = f"{sheet}!$AF$5:$AF${MSO_END}"
            if ends[bi]:
                ws[f"{col}{r}"] = (f'=SUMIFS({rng_q},{rng_t},">="&{starts[bi]},'
                                   f'{rng_t},"<"&{ends[bi]})')
            else:
                ws[f"{col}{r}"] = (f'=SUMIFS({rng_q},{rng_t},">="&{starts[bi]})'
                                   f'+SUMIFS({rng_q},{rng_t},"<"&$H$4)')
        ws[f"H{r}"] = f'=IF($H$13=0,"",SUM(D{r}:G{r})/$H$13)'
        if ends[bi]:
            ws[f"I{r}"] = f'=({ends[bi]}-{starts[bi]})*24'
        else:
            ws[f"I{r}"] = f'=(1-{starts[bi]})*24+$H$4*24'
        ws[f"J{r}"] = f'=IF(OR($H{r}="",$I{r}<=0),"",$H{r}/$I{r})'
        ws[f"K{r}"] = f'=IF(OR($J{r}="",$J$12=""),"",IF($J$12<=0,"",$J{r}/$J$12))'
        ws[f"L{r}"] = f'=IF($K{r}="","—",ROUND($K{r}/0.05,0)*0.05)'
        style_range(ws, f"B{r}", font=fnt(9.5, True), alignment=align("left"))
        style_range(ws, f"C{r}", font=fnt(8.5, False, GRAY), alignment=align("center"))
        style_range(ws, f"D{r}:G{r}", font=fnt(9.5, False, "5B6472"),
                    alignment=align("center"), num="#,##0")
        style_range(ws, f"H{r}", font=fnt(9.5, False, "5B6472"), alignment=align("center"), num="#,##0.0")
        style_range(ws, f"I{r}", font=fnt(9.5, False, GRAY), alignment=align("center"), num='0.0"h"')
        style_range(ws, f"J{r}", font=fnt(9.5, False, "5B6472"), alignment=align("center"), num="#,##0.0")
        style_range(ws, f"K{r}", font=fnt(10.5, True, CORAL), fl=fill("FFF1EE"),
                    alignment=align("center"), num="0.00")
        style_range(ws, f"L{r}", font=fnt(10.5, True, CORAL), fl=fill("FFF1EE"),
                    alignment=align("center"), num='0.00"倍"')
        if bi % 2:
            for col in "BCDEFGHIJ":
                ws[f"{col}{r}"].fill = fill(F_ZEBRA)
        for col in "BCDEFGHIJ":
            ws[f"{col}{r}"].border = Border(bottom=BORDER_HAIR.bottom, left=BORDER_HAIR.left,
                                            right=BORDER_HAIR.right)
        ws[f"K{r}"].border = Border(left=coral_side, right=BORDER_HAIR.right, bottom=BORDER_HAIR.bottom)
        ws[f"L{r}"].border = Border(right=coral_side, bottom=BORDER_HAIR.bottom)

    # 合計行・全日ペース
    ws.row_dimensions[12].height = 20
    style_range(ws, "B12", font=fnt(9.5, True), alignment=align("left"))
    ws["B12"] = "帯内合計 / 全日ペース"
    for wi in range(4):
        col = get_column_letter(4 + wi)
        ws[f"{col}12"] = f"=SUM({col}7:{col}11)"
        style_range(ws, f"{col}12", font=fnt(9.5, True, "5B6472"), alignment=align("center"), num="#,##0")
    ws["H12"] = '=IF($H$13=0,"",SUM(H7:H11))'
    ws["I12"] = "=SUM(I7:I11)"
    ws["J12"] = '=IF(OR($H$12="",$I$12<=0),"",$H$12/$I$12)'
    style_range(ws, "H12", font=fnt(9.5, True, "5B6472"), alignment=align("center"), num="#,##0.0")
    style_range(ws, "I12", font=fnt(9.5, True, GRAY), alignment=align("center"), num='0.0"h"')
    style_range(ws, "J12", font=fnt(9.5, True, "5B6472"), alignment=align("center"), num="#,##0.0")
    style_range(ws, "B12:L12", border=Border(top=BORDER_LIGHT.top))

    # 使った週数
    ws.row_dimensions[13].height = 16
    note(ws, "B13", "集計に使った週数", 8.5, GRAY)
    ws["H13"] = "=SUMPRODUCT((D12:G12>0)*1)"
    style_range(ws, "H13", font=fnt(9, True, TEAL), alignment=align("center"), num='0"週"')

    # 週ごとの状態表示
    ws.row_dimensions[15].height = 18
    chip(ws, "B15:L15", "  各週の貼付状況", CHIP_NAVY, NAVY, 9)
    for wi, sheet in enumerate(SHEETS):
        r = 16 + wi
        ws.row_dimensions[r].height = 16
        note(ws, f"B{r}", f"  {wi + 1}週目（{sheet}）", 8.5, GRAY)
        ws.merge_cells(f"C{r}:L{r}")
        ws[f"C{r}"] = f"={sheet}!$A$3"
        style_range(ws, f"C{r}:L{r}", font=fnt(8.5, False, "5B6472"), alignment=align("left"))

    # 転記案内
    ws.row_dimensions[21].height = 22
    chip(ws, "B21:L21", "  📋 転記のしかた", CHIP_CORAL, INK, 9.5)
    ws.row_dimensions[22].height = 30
    note(ws, "B22:L22",
         "上の表の「転記用(丸め)」①〜⑤の5つの値を、本体ツール「準備数計算」シート右上の"
         "時間帯プリセット表（J4:J8）に手で入力してください。平常（基準）は 1.0倍 のままでOKです。",
         9, INK, wrap=True)
    warn_rule = FormulaRule(formula=['$H$13=0'], font=Font(name=FONT_NAME, size=9, bold=True, color=RED))
    ws.row_dimensions[23].height = 16
    ws["B23"] = '=IF($H$13=0,"⚠ まだデータが貼られていません。貼付①〜④にMSO商品CSVを貼ってください。","")'
    ws.merge_cells("B23:L23")
    style_range(ws, "B23:L23", font=fnt(8.5, True, RED), alignment=align("left"))

    # ========================================================== 貼付①〜④ ====
    for si, sheet_name in enumerate(SHEETS):
        ws = wb.create_sheet(sheet_name)
        ws.sheet_properties.tabColor = AMBER
        ws.sheet_view.showGridLines = False
        ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.page_setup.paperSize = 9
        ws.print_area = "A1:N40"

        ws.column_dimensions["A"].width = 11
        for c_idx in range(2, NCOL + 1):
            ws.column_dimensions[get_column_letter(c_idx)].width = 11
        ws.column_dimensions["X"].width = 26          # 商品名
        ws.column_dimensions["AC"].width = 2.5        # 緩衝
        ws.column_dimensions["AD"].width = 10
        ws.column_dimensions["AE"].width = 9
        ws.column_dimensions["AF"].width = 9

        ws.row_dimensions[1].height = 34
        title_band(ws, f"A1:{get_column_letter(NCOL)}1",
                   f"　📋 {sheet_name}｜{si + 1}週目の金曜のMSO商品CSV")
        ws.row_dimensions[2].height = 30
        note(ws, "A2:N2",
             "① 金曜1日分で出力したMSO商品CSVを開いて全選択→コピー（Ctrl+A → Ctrl+C）　"
             "② 下のオレンジのセル（A4）を選択　③ 右クリック→『値の貼り付け』。"
             "ヘッダー行ごと貼ってOKです（最大12,000行）。貼り替える前に5行目以降を削除してください。",
             9, GRAY, wrap=True)

        ws.row_dimensions[3].height = 18
        ws.merge_cells("A3:P3")
        ws["A3"] = (f'=IF($M$5="","（未貼付）",'
                    f'"貼付 "&COUNTA($M$5:$M${MSO_END})&"行"&'
                    f'IF($AD$2="","｜⚠ 日付を読み取れません",'
                    f'"｜対象日: "&TEXT($AD$2,"m/d")&"（"&CHOOSE(WEEKDAY($AD$2),{WEEKDAY_JA})&"）'
                    f'｜対象個数 "&TEXT(SUM($AF$5:$AF${MSO_END}),"#,##0")&"個"&'
                    f'IF(WEEKDAY($AD$2)<>6,"｜※金曜ではありません","")&'
                    f'IF(SUMPRODUCT(($K$5:$K${MSO_END}<>"")*($K$5:$K${MSO_END}<>$K$5))>0,'
                    f'"｜⚠ 複数日が混在（対象日以外は無視）","")))'
                    )
        style_range(ws, "A3:P3", font=fnt(9, True, "5B6472"), alignment=align("left"))
        note(ws, "Q3:R3", "対象日(空欄=自動):", 8, GRAY, h="right")
        style_range(ws, "S3", font=fnt(9, True), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT, num="m/d")
        ws["AD2"] = ('=IF($S$3<>"",$S$3,IF($K$5="","",'
                     'IF(ISNUMBER($K$5),INT($K$5),IFERROR(DATE(VALUE(LEFT($K$5,4)),VALUE(MID($K$5,6,2)),VALUE(MID($K$5,9,2))),IFERROR(DATEVALUE($K$5),"")))))')
        note(ws, "AD1", "⚙対象日", 8, GRAY)
        style_range(ws, "AD2", font=fnt(8.5, False, GRAY), alignment=align("center"), num="m/d")

        ws.row_dimensions[4].height = 20
        for c_idx, h in enumerate(MSO_HEADERS, start=1):
            ref = f"{get_column_letter(c_idx)}4"
            ws[ref] = h
            style_range(ws, ref, font=fnt(8.5, True, "FFFFFF"), fl=fill(NAVY),
                        alignment=align("center"), border=BORDER_LIGHT)
        style_range(ws, "A4", font=fnt(9, True, "7A4A00"), fl=fill("FFB84C"),
                    alignment=align("center"),
                    border=Border(left=coral_side, right=coral_side,
                                  top=coral_side, bottom=coral_side))
        ws["A4"].comment = Comment("👉 貼り付けはここから！\n"
                                   "金曜1日分のMSO商品CSVを全選択コピーして、このセル（A4）を選択し、\n"
                                   "右クリック→「値の貼り付け」。ヘッダー行ごと貼ってOKです。",
                                   "較正シート", height=95, width=270)
        for ref, text in [("AD4", "⚙時刻"), ("AE4", "⚙時刻値"), ("AF4", "⚙個数")]:
            note(ws, ref, text, 8, GRAY, h="center")
        ws["AE4"] = "⚙時刻値"
        ws["AF4"] = "⚙対象個数"

        # ヘルパー列: AE=時刻値, AF=集計対象個数(日付・状態・区分・数量のフィルタ込み)
        for i in range(MSO_MAX):
            rr = 5 + i
            ws[f"AE{rr}"] = (f'=IF($M{rr}="","",IFERROR(IF(ISNUMBER($M{rr}),MOD($M{rr},1),'
                             f'TIMEVALUE($M{rr})),""))')
            ws[f"AF{rr}"] = (f'=IF(OR($M{rr}="",$AE{rr}=""),0,'
                             f'IF(IF(ISNUMBER($K{rr}),INT($K{rr}),'
                             f'IFERROR(DATE(VALUE(LEFT($K{rr},4)),VALUE(MID($K{rr},6,2)),VALUE(MID($K{rr},9,2))),'
                             f'IFERROR(DATEVALUE($K{rr}),-1)))<>$AD$2,0,'
                             f'IF(OR($AB{rr}="セット親",$S{rr}<>"提供済",$T{rr}<>"販売"),0,'
                             f'IF(ISNUMBER($Z{rr}),MAX(0,$Z{rr}),0))))')

        for i in range(200):                      # 目安の枠線
            rr = 5 + i
            for c_idx in range(1, NCOL + 1):
                cell = ws.cell(row=rr, column=c_idx)
                cell.border = BORDER_HAIR
                cell.font = fnt(9)

        rows = read_mso_rows(csvs[si]) if csvs[si] else []
        for i, row in enumerate(rows[:MSO_MAX]):
            rr = 5 + i
            for c_idx, v in enumerate(row[:NCOL], start=1):
                ws.cell(row=rr, column=c_idx).value = v

        ws.freeze_panes = "A5"

    wb.properties.title = "時間帯係数 較正シート"
    wb.properties.creator = "TOHOシネマズ新宿 コンセッション"
    wb.save(out_path)
    print("saved:", out_path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT_DEFAULT)
    for k in range(1, 5):
        ap.add_argument(f"--csv{k}")
    ap.add_argument("--show-notes", metavar="XLSX")
    a = ap.parse_args()
    if a.show_notes:
        n = show_paste_comments(a.show_notes, sheets=tuple(SHEETS))
        print(f"notes patched: {n} vml file(s)")
        raise SystemExit(0)
    build(a.out, csvs=(a.csv1, a.csv2, a.csv3, a.csv4))
