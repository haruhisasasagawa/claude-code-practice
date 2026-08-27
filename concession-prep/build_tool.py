# -*- coding: utf-8 -*-
"""
TOHOシネマズ新宿 コンセッション事前準備数ツール（v4）生成スクリプト

TOHOの営業週(金曜開始)に合わせ、本社集計「売上・在庫・原価」CSV(34列/cp932)を
期間A(直近 金土日)・期間B(前週 金〜木)の2本貼り付けて使う構成。

シート構成:
  使い方      … 3ステップの利用ガイド・凡例・注意点
  準備数計算  … 参照期間(A/B)の購買率 × ピーク動員数 × 時間帯プリセット倍率 →「作る数」
  印刷用      … A4縦1枚の仕込み指示書(自動連動・チェック欄付き)
  期間データ  … 期間A/Bの日付・動員数を入力。商品別販売数はCSVから自動集計
  CSV貼付A/B  … 集計CSVをそのまま貼るだけの貼り付けシート(数式なし)

使い方:
  python build_tool.py                            # 未入力テンプレートを生成
  python build_tool.py --out サンプル.xlsx \
      --csv-a A期間.csv --csv-b B期間.csv \
      --select A --att-a 9000,13000,12000 --att-b 8500,... --peak 1200 --preset 昼ピーク
"""
import argparse
import csv
import datetime as dt

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import DataBarRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import column_index_from_string, get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.properties import PageSetupProperties

# ---------------------------------------------------------------- palette ----
FONT_NAME = "BIZ UDPゴシック"   # Win10以降標準のUDフォント。無い環境では自動代替

NAVY = "2E3A59"
INK = "333B4A"
GRAY = "8A93A3"
CORAL = "E8604C"
TEAL = "1F9E92"
AMBER = "E9A13B"
AMBER2 = "C77E23"
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


# ------------------------------------------------------------- constants -----
CSV_HEADERS = ["タイトル", "劇場コード", "劇場名", "対象期間開始", "対象期間終了",
               "大分類コード", "小分類コード", "小分類名", "作品コード", "作品名",
               "支払先コード", "支払先名", "商品コード", "商品名", "買取区分", "買取区分名",
               "前日残数", "仕入数", "移動入庫数", "返品数", "廃棄数", "移動出庫数",
               "差異数", "資産廃棄数", "減算数", "残数", "売上数", "売上金額（税込）",
               "軽減売上数", "軽減売上金額（税込）", "売上金額（税抜）", "平均単価（税抜）",
               "売上原価（税抜）", "仕入先商品コード"]
NCOL = len(CSV_HEADERS)          # 34列: N=商品名(14), AA=売上数(27), D/E=対象期間(4/5)
CSV_MAX = 1000                   # 貼付データ最大行数(5〜1004行目)
CSV_END = 4 + CSV_MAX
LIST_MAX = CSV_MAX               # 期間ごとの商品リスト最大件数(全行ユニークでも切れない)
N_SLOTS = 20                     # 商品枠
ROW_P0 = 14                      # 期間データ: 商品1行目(14〜33)
ROW_M0 = 11                      # 準備数計算: 商品1行目(11〜30)

# 事前準備(調理・仕込み)対象になりやすい実売上位の商品(実CSVの商品名と完全一致)
DEFAULT_PRODUCTS = [
    "ハーフ＆ハーフ（塩／キャラメル）",
    "ポップコーン　キャラメルＭ",
    "ポップコーン　塩Ｍ",
    "ポップコーン　キャラメルＳ",
    "ポップコーン　塩Ｓ",
    "ポップコーン　キャラメルＬ",
    "ポップコーン　塩Ｌ",
    "北海道濃厚バターしょうゆ味",
    "トリュフソルト＆バター味",
    "シネマイク　ハッピーターン味",
    "パーティーポップ　キャラメル",
    "スパイシー！ポップチキン",
    "スナックじゃがトリュフソルトバタ",
    "スナックじゃが　シチリアハーブ",
    "ケチャップ＆マスタード",
    "４種のチーズ",
    "プレミアム　ハラペーニョ",
    "チュリトス　シナモンシュガー",
    "チュリトス　チョコクリーム",
]

PRESETS = [("平常", 1.0), ("朝いち", 0.8), ("昼ピーク", 1.2),
           ("夕方", 1.1), ("夜ピーク", 1.3), ("レイト", 0.9)]

# プルダウン検索から既定で除外する小分類(実CSVのH列の表記に完全一致・シート上で編集可)
EXCLUDE_CATS = ["コールド", "コーヒー", "アルコール", "その他ドリンク", "ホット",
                "ドリンク調味料", "フード調味料", "ＳＥＴ作品コンボ", "引換券", "コンセ包材"]
EXC_SLOTS = 12                   # 除外リストの枠数(期間データ!B37:B48)
EXC_TOP = 37
EXC_END = EXC_TOP + EXC_SLOTS - 1

SEL_A = "期間A（金土日）"
SEL_B = "期間B（金〜木）"

WEEKDAY_JA = '"日","月","火","水","木","金","土"'


def parse_ymd(x):
    """yyyymmdd数値/文字列・日付型セルのどれでも日付シリアルに解釈する式。
    2000〜2100年の範囲外(0・空欄・壊れた値)は-1を返す。"""
    inner = (f'IF(VALUE({x})<19000101,INT(VALUE({x})),'
             f'DATEVALUE(TEXT(VALUE({x}),"0000-00-00")))')
    return f'IFERROR(IF(AND({inner}>=36526,{inner}<=73415),{inner},-1),-1)'


def read_csv_rows(path):
    """cp932/utf-8のCSVを読み、値を数値化して返す(ヘッダー行は除く)"""
    raw = open(path, "rb").read()
    for enc in ("cp932", "utf-8-sig", "utf-8"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    rows = list(csv.reader(text.splitlines()))
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


# ---------------------------------------------------------------- build ------
def build(out_path, csv_a=None, csv_b=None, select="A",
          att_a=None, att_b=None, peak=None, preset="平常", adjust=1.0,
          products=DEFAULT_PRODUCTS):
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
    title_band(ws, "A1:J1", "　🍿 コンセッション 事前準備数ツール")
    ws.row_dimensions[2].height = 20
    note(ws, "B2:J2", "TOHOシネマズ新宿｜期間A(直近 金土日)・期間B(前週 金〜木)の購買率から、ピーク前の仕込み数を自動計算", 9.5)

    ws.row_dimensions[4].height = 22
    chip(ws, "B4:D4", "  つかいかた（3ステップ）", CHIP_NAVY, NAVY)
    steps = [
        ("①", AMBER, "「CSV貼付A」「CSV貼付B」に 売上・在庫・原価CSV を貼り付け",
         "期間A＝直近の金土日、期間B＝前週の金〜木で出力したCSVを、5行目のA列からそのまま貼り付け"
         "（1行目のヘッダーは不要）。日付は自動で入ります。｜担当：社員"),
        ("②", CORAL, "「期間データ」シートに 動員数 を入力",
         "期間A＝3日分、期間B＝7日分の動員数。日付・販売数は自動表示。CSVの行数・日数チェック（✔／⚠）も確認。｜担当：社員"),
        ("③", TEAL, "「準備数計算」で 参照期間・ピーク動員数・時間帯・調整倍率 を選ぶ",
         "ピーク動員数＝これから準備する回（例：1時間後のピーク）の合計動員数。「印刷用」をA4で刷って現場へ。｜担当：社員（確認：スタッフ）"),
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

    r += 1
    ws.row_dimensions[r].height = 22
    chip(ws, f"B{r}:D{r}", "  セルの色のルール", CHIP_NAVY, NAVY)
    r += 1
    ws.row_dimensions[r].height = 20
    chip(ws, f"C{r}:D{r}", "✏️ 黄色 ＝ 入力するセル", F_INPUT, INK, 9.5, False, "center")
    style_range(ws, f"C{r}:D{r}", border=BORDER_INPUT)
    chip(ws, f"F{r}:G{r}", "🔒 グレー ＝ 自動計算", F_AUTO, "5B6472", 9.5, False, "center")
    style_range(ws, f"F{r}:G{r}", border=BORDER_LIGHT)

    r += 2
    ws.row_dimensions[r].height = 22
    chip(ws, f"B{r}:D{r}", "  計算のしくみ", CHIP_NAVY, NAVY)
    r += 1
    note(ws, f"C{r}:J{r}", "購買率 ＝ 参照期間の販売数（CSVの「売上数」列） ÷ 参照期間の動員数合計", 10, INK)
    r += 1
    note(ws, f"C{r}:J{r}", "作る数 ＝ ピーク動員数 × 購買率 × 時間帯係数 × 調整倍率（小数点以下は切り上げ）", 10, INK)

    r += 2
    ws.row_dimensions[r].height = 22
    chip(ws, f"B{r}:D{r}", "  注意メモ", CHIP_NAVY, NAVY)
    notes = [
        "・商品の選択・入れ替えは「期間データ」シートの商品名欄（B14〜B33）のプルダウンで行います"
        "（貼られたCSVの商品名から自動でリスト化）。手入力も可能ですが完全一致が必要です。",
        "・ドリンク類・調味料・ＳＥＴ作品コンボ・引換券・包材はプルダウンに出ません"
        "（期間データシート下部の除外リストで自由に変更できます）。",
        "・ピーク動員数には「これから準備する回」の合計動員数を入れます（例：1時間後のピークの回の計）。",
        "・倍率は二段構えです：時間帯係数（朝いち0.8倍/昼ピーク1.2倍…の固定の型・右上の表で編集）×"
        "調整倍率（大作初日や雨など、その日の状況での上乗せ/控えめ）。どちらも 1.2 ＝ 1.2倍 の形で入力します。",
        "・CSVは各期間 最大1000行。貼り替える前に、5行目以降のデータだけを選択して削除してください"
        "（1〜4行目の見出し・状態表示は消さないこと）。",
        "・期間の日付は貼られたCSVの「対象期間」から自動表示されます。貼付後は「期間データ」の"
        "CSV行数・日数チェック（✔／⚠）を確認してください。日数違い・貼付位置ズレ・旧データ残存は⚠が出ます。",
        "・別の期間（連休比較など）を見たいときは、その期間で出力したCSVを貼り替えてください。"
        "日付は自動で切り替わります（期間A=3日・期間B=7日の枠。日付セルは数式のため手入力しないこと）。",
        "・販売数を手入力したい場合は「期間データ」の販売数セルに直接数値を入れても使えます（数式は上書きされます）。",
        "・時間帯別の購買率（朝昼夕夜で率を変える）は、CSVに時刻情報が無いため今後の課題です。当面は時間帯係数で調整します。",
        "・毎週の作業は「CSV2本の貼り替え」と「動員数の入力」だけです。日付・商品リストは自動で追随します。",
    ]
    for t in notes:
        r += 1
        ws.row_dimensions[r].height = 18
        note(ws, f"C{r}:J{r}", t, 9.5, INK)
    r += 2
    note(ws, f"C{r}:J{r}", "雛形版 v4.0（2026/8）｜数式・レイアウトは自由に調整してください", 8.5)

    # ======================================================== 準備数計算 =====
    ws = wb.create_sheet("準備数計算")
    ws.sheet_properties.tabColor = CORAL
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.paperSize = 9
    ws.print_area = "A1:H31"

    for c, w in {"A": 2.5, "B": 6, "C": 32, "D": 14, "E": 11, "F": 16,
                 "G": 13, "H": 8, "I": 12, "J": 9, "K": 2.5, "L": 12, "M": 10}.items():
        ws.column_dimensions[c].width = w

    ws.row_dimensions[1].height = 34
    title_band(ws, "B1:H1", "　🍿 準備数計算｜ピーク前の仕込み数")
    ws.row_dimensions[2].height = 18
    note(ws, "B2:H2", "参照期間(A/B)の購買率 × ピーク動員数 × 時間帯係数 × 調整倍率 で「作る数」を自動計算します", 9)
    ws.row_dimensions[3].height = 6

    # 時間帯プリセット表(編集OK) I3:J9
    chip(ws, "I3:J3", " ⏰ 時間帯プリセット（編集OK）", CHIP_AMBER, INK, 8.5)
    for i, (name, mult) in enumerate(PRESETS):
        rr = 4 + i
        ws.row_dimensions[rr].height = 18
        ws[f"I{rr}"] = name
        style_range(ws, f"I{rr}", font=fnt(9, True), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT)
        ws[f"J{rr}"] = mult
        # ％を含む表示形式だとExcelの「パーセント自動入力」で 1.2 が 1.2% になるため「倍」表記にする
        style_range(ws, f"J{rr}", font=fnt(9, True, CORAL), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT, num='0.0"倍"')
    ws["I4"].comment = Comment("時間帯ごとの高低差はこの6枠で管理します。名前(例:18時台)も係数も"
                               "自由に書き換えできます(枠の追加は不可)。係数は 1.2 ＝ 1.2倍(×120%) の"
                               "形で入力してください。", "準備数ツール")

    # 計算用ヘルパー L3:M6
    chip(ws, "L3:M3", " ⚙ 計算用（さわらない）", "F7F8FA", GRAY, 8, False)
    helpers = [
        ("L4", "選択期間", "M4", f'=IF(TRIM($D$4)="{SEL_B}",2,IF(TRIM($D$4)="{SEL_A}",1,0))'),
        ("L5", "動員合計", "M5", "=IF($M$4=2,SUM(期間データ!$C$10:$I$10),SUM(期間データ!$C$6:$E$6))"),
        ("L6", "他方動員", "M6", "=IF($M$4=2,SUM(期間データ!$C$6:$E$6),SUM(期間データ!$C$10:$I$10))"),
        ("L7", "時間帯係数", "M7", "=IFERROR(INDEX($J$4:$J$9,MATCH($D$6,$I$4:$I$9,0)),1)"),
    ]
    for lref, ltext, vref, formula in helpers:
        note(ws, lref, ltext, 8.5, GRAY, h="right")
        ws[vref] = formula
        style_range(ws, vref, font=fnt(8.5, False, GRAY), alignment=align("left"), num="#,##0")
    style_range(ws, "L3:M7", border=BORDER_HAIR)

    # コントロール
    ws.row_dimensions[4].height = 24
    chip(ws, "B4:C4", "  ① 参照期間", CHIP_CORAL, INK, 10)
    ws["D4"] = SEL_A if select == "A" else SEL_B
    style_range(ws, "D4", font=fnt(10.5, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT)
    ws.merge_cells("E4:H4")
    ws["E4"] = ('=IF($M$4=2,'
                '"参照: "&IF(期間データ!$C$8="","—",TEXT(期間データ!$C$8,"m/d"))&"〜"&'
                'IF(期間データ!$I$8="","—",TEXT(期間データ!$I$8,"m/d"))&"（期間B 金〜木）",'
                '"参照: "&IF(期間データ!$C$4="","—",TEXT(期間データ!$C$4,"m/d"))&"〜"&'
                'IF(期間データ!$E$4="","—",TEXT(期間データ!$E$4,"m/d"))&"（期間A 金土日）")'
                '&"｜動員合計 "&TEXT($M$5,"#,##0")&"人"')
    style_range(ws, "E4:H4", font=fnt(9.5, False, "5B6472"), alignment=align("left"))

    ws.row_dimensions[5].height = 24
    chip(ws, "B5:C5", "  ② ピーク動員数", CHIP_CORAL, INK, 10)
    if peak is not None:
        ws["D5"] = peak
    ws["D5"].comment = Comment("これから準備する回（例：1時間後のピークの回）の合計動員数を"
                               "入力してください。", "準備数ツール")
    style_range(ws, "D5", font=fnt(10.5, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT, num="#,##0")
    note(ws, "E5:H5", "← これから準備する回の合計動員数（例：1時間後のピークの回の計）", 9)

    ws.row_dimensions[6].height = 24
    chip(ws, "B6:C6", "  ③ 時間帯", CHIP_CORAL, INK, 10)
    ws["D6"] = preset
    style_range(ws, "D6", font=fnt(10.5, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT)
    ws.merge_cells("E6:H6")
    ws["E6"] = '="→ 時間帯係数 ×"&TEXT($M$7*100,"0")&"%（右上の表で名前・係数を編集できます）"'
    style_range(ws, "E6:H6", font=fnt(9, False, GRAY), alignment=align("left"))

    ws.row_dimensions[7].height = 24
    chip(ws, "B7:C7", "  ④ 調整倍率", CHIP_CORAL, INK, 10)
    ws["D7"] = adjust
    ws["D7"].comment = Comment("その日の状況（大作初日・雨・イベント等）に合わせた上乗せ/控えめの調整です。"
                               "時間帯係数に掛け合わされます。1.1 ＝ 1.1倍(×110%) の形で入力してください。",
                               "準備数ツール")
    style_range(ws, "D7", font=fnt(10.5, True), fl=fill(F_INPUT),
                alignment=align("center"), border=BORDER_INPUT, num='0.0"倍"')
    ws.merge_cells("E7:H7")
    ws["E7"] = ('="→ 合計適用倍率 ×"&TEXT($M$7*IF(ISNUMBER($D$7),$D$7,1)*100,"0")&'
                '"%（時間帯係数 × 調整倍率）"')
    style_range(ws, "E7:H7", font=fnt(9, True, "5B6472"), alignment=align("left"))

    ws.row_dimensions[8].height = 14
    ws.merge_cells("B8:H8")
    ws["B8"] = ('=TRIM('
                'IF($M$4=0,"⚠ 参照期間の選択が不正です（現在は期間A扱い）。リストから選び直してください。","")&" "&'
                'IF(IF($M$4=2,CSV貼付B!$N$5,CSV貼付A!$N$5)="",'
                '"⚠ 選択した期間のCSVが未貼付です（CSV貼付"&IF($M$4=2,"B","A")&"シート）。","")&" "&'
                'IF(ISNUMBER(SEARCH("⚠",IF($M$4=2,期間データ!$B$11,期間データ!$G$4))),'
                '"⚠ 選択した期間のCSVに問題があります（期間データシートの表示を確認）。","")&" "&'
                'IF(IF($M$4=2,COUNT(期間データ!$C$10:$I$10)<7,COUNT(期間データ!$C$6:$E$6)<3),'
                '"⚠ 選択した期間の動員数がそろっていません。","")&" "&'
                'IF(AND(IF($M$4=2,COUNT(期間データ!$C$10:$I$10)=7,COUNT(期間データ!$C$6:$E$6)=3),$M$5<=0),'
                '"⚠ 参照期間の動員数合計が0です（期間データシートを確認）。","")&" "&'
                'IF(SUMPRODUCT((期間データ!$B$14:$B$33<>"")*'
                '(COUNTIF(期間データ!$B$14:$B$33,期間データ!$B$14:$B$33)>1))>0,'
                '"⚠ 商品名が重複しています（集計が二重になります）。","")&" "&'
                'IF(AND(IF($M$4=2,CSV貼付B!$N$5,CSV貼付A!$N$5)<>"",'
                'SUMPRODUCT((期間データ!$B$14:$B$33<>"")*'
                f'(IF($M$4=2,COUNTIF(CSV貼付B!$N$5:$N${CSV_END},期間データ!$B$14:$B$33),'
                f'COUNTIF(CSV貼付A!$N$5:$N${CSV_END},期間データ!$B$14:$B$33))=0))>0),'
                '"⚠ 参照期間のCSVに無い商品名があります（別期間のみの商品か、表記を確認。期間販売数0扱い）。","")&" "&'
                'IF(COUNTIF($D$11:$D$30,"<0")>0,'
                '"⚠ 期間販売数がマイナスの商品があります（返品超過）。作る数は0扱いです。","")&" "&'
                'IF(AND($D$6<>"",ISNA(MATCH($D$6,$I$4:$I$9,0))),'
                '"⚠ 時間帯プリセット名が表にありません（係数100%扱い）。","")&" "&'
                'IF(OR($D$5="",$D$5=0,NOT(ISNUMBER($D$5))),"⚠ ピーク動員数が未入力か数値ではありません。","")&" "&'
                'IF($M$7=0,"⚠ 時間帯係数が0です。","")&" "&'
                'IF(AND($D$7<>"",NOT(ISNUMBER($D$7))),"⚠ 調整倍率が数値ではありません（1倍扱いで計算します）。","")&" "&'
                'IF(AND($D$7<>"",ISNUMBER($D$7),$D$7=0),"⚠ 調整倍率が0です。","")&" "&'
                'IF(AND($M$7*IF(ISNUMBER($D$7),$D$7,1)>0,'
                'OR($M$7*IF(ISNUMBER($D$7),$D$7,1)<0.5,$M$7*IF(ISNUMBER($D$7),$D$7,1)>5)),'
                '"⚠ 合計適用倍率が×50%〜×500%の範囲外です。係数・調整倍率の入力を確認してください。",""))')
    style_range(ws, "B8:H8", font=fnt(8.5, True, RED), alignment=align("left"))
    ws.row_dimensions[9].height = 6

    # 表ヘッダー
    ws.row_dimensions[10].height = 34
    for ref, text in [("B10", "No."), ("C10", "商品名"), ("D10", "期間販売数"),
                      ("E10", "購買率"), ("G10", "（参考）\nもう一方の期間")]:
        style_range(ws, ref, font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                    alignment=align("center", "center", True), border=BORDER_LIGHT)
        ws[ref] = text
    ws["C10"].comment = Comment("商品の選択・入れ替えは「期間データ」シートの商品名欄"
                                "(B14〜B33)のプルダウンで行ってください。ここは自動表示です。", "準備数ツール")
    style_range(ws, "F10", font=fnt(11, True, "FFFFFF"), fl=fill(CORAL),
                alignment=align("center", "center", True), border=BORDER_LIGHT)
    ws["F10"] = "👉 作る数\n(この数を準備)"

    for i in range(N_SLOTS):
        r = ROW_M0 + i
        dr = ROW_P0 + i
        ws.row_dimensions[r].height = 21
        ws[f"B{r}"] = i + 1
        ws[f"C{r}"] = f'=IF(期間データ!B{dr}="","",期間データ!B{dr})'
        ws[f"D{r}"] = f'=IF($C{r}="","",IF($M$4=2,期間データ!D{dr},期間データ!C{dr}))'
        ws[f"E{r}"] = f'=IF($C{r}="","",IF($M$5<=0,"要確認",D{r}/$M$5))'
        ws[f"F{r}"] = (f'=IF(OR($C{r}="",NOT(ISNUMBER($D$5))),"",'
                       f'IF(ISNUMBER($E{r}),'
                       f'MAX(0,ROUNDUP($D$5*$E{r}*$M$7*IF(ISNUMBER($D$7),$D$7,1),0)),"—"))')
        ws[f"G{r}"] = (f'=IF($C{r}="","",'
                       f'IF(ISNUMBER(SEARCH("⚠",IF($M$4=2,期間データ!$G$4,期間データ!$B$11))),"要確認",'
                       f'IF($M$6<=0,"－",IF($M$4=2,期間データ!C{dr},期間データ!D{dr})/$M$6)))')
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
         "※ 作る数 ＝ ピーク動員数 × 購買率 × 時間帯係数 × 調整倍率（小数点以下切り上げ）｜購買率 ＝ 参照期間の販売数 ÷ 動員数合計", 8.5)

    bar = DataBarRule(start_type="num", start_value=0, end_type="max", color=CORAL, showValue=True)
    ws.conditional_formatting.add(f"F{ROW_M0}:F{last}", bar)
    rate_warn = FormulaRule(formula=[f"ISTEXT(E{ROW_M0})"],
                            font=Font(name=FONT_NAME, size=9, bold=True, color=RED))
    ws.conditional_formatting.add(f"E{ROW_M0}:E{last}", rate_warn)
    ref_warn = FormulaRule(formula=[f'ISNUMBER(SEARCH("要確認",G{ROW_M0}))'],
                           font=Font(name=FONT_NAME, size=9, bold=True, color=RED))
    ws.conditional_formatting.add(f"G{ROW_M0}:G{last}", ref_warn)

    dv_period = DataValidation(type="list", formula1=f'"{SEL_A},{SEL_B}"',
                               allow_blank=False, showErrorMessage=True)
    dv_period.error = f"リストから選んでください（{SEL_A}／{SEL_B}）"
    dv_period.errorTitle = "参照期間"
    ws.add_data_validation(dv_period)
    dv_period.add("D4")

    dv_peak = DataValidation(type="whole", operator="between", formula1="0", formula2="999999",
                             showErrorMessage=True)
    dv_peak.error = "ピーク動員数は 0〜999,999 の整数で入力してください"
    dv_peak.errorTitle = "ピーク動員数"
    ws.add_data_validation(dv_peak)
    dv_peak.add("D5")

    dv_preset = DataValidation(type="list", formula1="=$I$4:$I$9", allow_blank=True,
                               showErrorMessage=False)
    ws.add_data_validation(dv_preset)
    dv_preset.add("D6")

    dv_adjust = DataValidation(type="decimal", operator="between", formula1="0", formula2="5",
                               showErrorMessage=True)
    dv_adjust.error = "調整倍率は 0〜5 の数値で入力してください（1.1 ＝ 1.1倍・×110%）"
    dv_adjust.errorTitle = "調整倍率"
    ws.add_data_validation(dv_adjust)
    dv_adjust.add("D7")

    ws.freeze_panes = "A11"

    # ========================================================== 印刷用 =======
    ws = wb.create_sheet("印刷用")
    ws.sheet_properties.tabColor = GREEN
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.paperSize = 9
    ws.print_area = "A1:F28"

    for c, w in {"A": 2.5, "B": 7, "C": 32, "D": 16, "E": 13, "F": 2.5}.items():
        ws.column_dimensions[c].width = w

    ws.row_dimensions[1].height = 36
    title_band(ws, "B1:E1", "　🍿 仕込み指示書（コンセッション）")
    ws.row_dimensions[2].height = 24
    chip(ws, "B2:E2", "  👇 この数を作ってください", CHIP_CORAL, CORAL, 12, True)

    ws.row_dimensions[3].height = 22
    ws.merge_cells("B3:E3")
    ws["B3"] = ('="参照期間: "&IF(準備数計算!$M$4=2,"期間B（金〜木）","期間A（金土日）")&'
                '"　｜　ピーク動員数: "&IF(準備数計算!$D$5="","（未入力）",'
                'TEXT(準備数計算!$D$5,"#,##0")&"人")')
    style_range(ws, "B3:E3", font=fnt(11, True, INK), alignment=align("left"))
    ws.row_dimensions[4].height = 20
    ws.merge_cells("B4:E4")
    ws["B4"] = ('="時間帯: "&準備数計算!$D$6&"（係数 ×"&TEXT(準備数計算!$M$7*100,"0")&'
                '"% × 調整 ×"&TEXT(IF(ISNUMBER(準備数計算!$D$7),準備数計算!$D$7,1)*100,"0")&'
                '"% ＝ ×"&TEXT(準備数計算!$M$7*IF(ISNUMBER(準備数計算!$D$7),準備数計算!$D$7,1)*100,"0")&"%）'
                '　｜　"&準備数計算!$E$4')
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
        style_range(ws, f"C{r}", font=fnt(11), alignment=align("left"))
        style_range(ws, f"D{r}", font=fnt(14, True, CORAL), fl=fill(F_BASE),
                    alignment=align("center"), num="#,##0")
        style_range(ws, f"E{r}", font=fnt(12, False, "B9C0CC"), alignment=align("center"))
        for col in "BCE":
            ws[f"{col}{r}"].border = BORDER_LIGHT
        ws[f"D{r}"].border = Border(bottom=thin, top=thin, left=coral_side, right=coral_side)

    ws.row_dimensions[28].height = 16
    note(ws, "B28:E28", "※ 数字は「準備数計算」シートから自動で入ります｜A4縦・1ページ印刷", 8)

    # ======================================================== 期間データ =====
    ws = wb.create_sheet("期間データ")
    ws.sheet_properties.tabColor = TEAL
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.paperSize = 9
    ws.print_area = "A1:K34"

    ws.column_dimensions["A"].width = 5
    ws.column_dimensions["B"].width = 30
    for c in "CDEFGHI":
        ws.column_dimensions[c].width = 10.5
    ws.column_dimensions["J"].width = 11
    ws.column_dimensions["K"].width = 14
    ws.column_dimensions["L"].width = 2.5
    for c, w in {"M": 6, "N": 28, "O": 6, "P": 28, "Q": 28}.items():
        ws.column_dimensions[c].width = w
        ws.column_dimensions[c].hidden = True

    ws.row_dimensions[1].height = 34
    title_band(ws, "A1:K1", "　📅 期間データ（動員数・販売実績）")
    ws.row_dimensions[2].height = 20
    note(ws, "A2", "凡例:", 8.5, GRAY, h="right")
    chip(ws, "B2", "✏️ 入力セル", F_INPUT, INK, 8.5, False, "center")
    style_range(ws, "B2", border=BORDER_INPUT)
    chip(ws, "C2:D2", "🔒 自動計算", F_AUTO, "5B6472", 8.5, False, "center")
    style_range(ws, "C2:D2", border=BORDER_LIGHT)
    note(ws, "F2:K2", "販売数は「CSV貼付A/B」から自動集計。商品名はプルダウンで選択（手入力も可）。", 8.5)
    ws.row_dimensions[3].height = 6

    # 期間A(金土日) — 日付はCSVの対象期間から自動表示
    pa_s = parse_ymd("CSV貼付A!$D$5")
    pa_e = parse_ymd("CSV貼付A!$E$5")
    ws.row_dimensions[4].height = 22
    chip(ws, "B4", "  期間A（直近 金土日）｜日付(自動)", CHIP_TEAL, INK, 10)
    ws.row_dimensions[5].height = 16
    note(ws, "B5", "  曜日", 8.5, GRAY)
    ws.row_dimensions[6].height = 22
    chip(ws, "B6", "  動員数（人）", CHIP_TEAL, INK, 10)
    ws["C4"] = f'=IF(CSV貼付A!$N$5="","",IF({pa_s}=-1,"",{pa_s}))'
    ws["D4"] = '=IF(OR($C$4="",$E$4="",$E$4<$C$4),"",$C$4+1)'
    ws["E4"] = f'=IF(CSV貼付A!$N$5="","",IF({pa_e}=-1,"",{pa_e}))'
    for j in range(3):
        col = get_column_letter(3 + j)
        style_range(ws, f"{col}4", font=fnt(10, True), fl=fill(F_AUTO),
                    alignment=align("center"), border=BORDER_LIGHT, num="m/d")
        ws[f"{col}5"] = f'=IF({col}$4="","",CHOOSE(WEEKDAY({col}$4),{WEEKDAY_JA}))'
        style_range(ws, f"{col}5", font=fnt(8.5, False, GRAY), alignment=align("center"))
        if att_a:
            ws[f"{col}6"] = att_a[j]
        style_range(ws, f"{col}6", font=fnt(10.5), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT, num="#,##0")
    ws["F6"] = '=IF(COUNT(C6:E6)=0,"",SUM(C6:E6))'
    style_range(ws, "F6", font=fnt(10.5, True, TEAL), fl=fill(F_AUTO),
                alignment=align("center"), border=BORDER_LIGHT, num="#,##0")
    note(ws, "F5", "A計", 8, GRAY, h="center")
    ws.merge_cells("G4:K4")
    ws["G4"] = ('=IF(CSV貼付A!$N$5="","（CSV貼付Aにデータを貼り付けてください）",'
                '"CSV "&COUNTA(CSV貼付A!$N$5:$N$' + str(CSV_END) + ')&"行｜"&'
                'IF(CSV貼付A!$N$4<>"商品名","⚠ 貼付位置ズレ（5行目のA列から貼り直し）",'
                'IF(CSV貼付A!$A$5="タイトル","⚠ ヘッダー行ごと貼付（1行目を除いて貼り直し）",'
                'IF(OR($C$4="",$E$4=""),"⚠ 対象期間を読み取れません（CSVのD/E列を確認）",'
                'IF($E$4<$C$4,"⚠ 対象期間が逆転しています（CSVのD/E列を確認）",'
                'TRIM('
                'IF($E$4-$C$4<>2,"⚠ "&($E$4-$C$4+1)&"日分のCSVです（期間Aは金土日3日想定）",'
                '"✔ "&($E$4-$C$4+1)&"日間")&" "&'
                'IF(SUMPRODUCT((CSV貼付A!$D$5:$D$' + str(CSV_END) + '<>"")*(CSV貼付A!$D$5:$D$' + str(CSV_END) + '<>CSV貼付A!$D$5))+'
                'SUMPRODUCT((CSV貼付A!$E$5:$E$' + str(CSV_END) + '<>"")*(CSV貼付A!$E$5:$E$' + str(CSV_END) + '<>CSV貼付A!$E$5))>0,'
                '"⚠ 別期間の行が混ざっています（前回分を削除して貼り直し）","")&" "&'
                'IF(WEEKDAY($C$4)<>6,"※開始が金曜以外","")'
                '))))))')
    style_range(ws, "G4:K4", font=fnt(9, False, "5B6472"), alignment=align("left"))
    ws["C4"].comment = Comment("貼られたCSVの対象期間から自動表示されます（入力不要）。", "準備数ツール")

    ws.row_dimensions[7].height = 6
    # 期間B(前週 金〜木) — 日付はCSVの対象期間から自動表示
    pb_s = parse_ymd("CSV貼付B!$D$5")
    pb_e = parse_ymd("CSV貼付B!$E$5")
    ws.row_dimensions[8].height = 22
    chip(ws, "B8", "  期間B（前週 金〜木）｜日付(自動)", CHIP_TEAL, INK, 10)
    ws.row_dimensions[9].height = 16
    note(ws, "B9", "  曜日", 8.5, GRAY)
    ws.row_dimensions[10].height = 22
    chip(ws, "B10", "  動員数（人）", CHIP_TEAL, INK, 10)
    ws["C8"] = f'=IF(CSV貼付B!$N$5="","",IF({pb_s}=-1,"",{pb_s}))'
    for j in range(1, 6):
        ws[f"{get_column_letter(3 + j)}8"] = f'=IF(OR($C$8="",$I$8="",$I$8<$C$8),"",$C$8+{j})'
    ws["I8"] = f'=IF(CSV貼付B!$N$5="","",IF({pb_e}=-1,"",{pb_e}))'
    for j in range(7):
        col = get_column_letter(3 + j)
        style_range(ws, f"{col}8", font=fnt(10, True), fl=fill(F_AUTO),
                    alignment=align("center"), border=BORDER_LIGHT, num="m/d")
        ws[f"{col}9"] = f'=IF({col}$8="","",CHOOSE(WEEKDAY({col}$8),{WEEKDAY_JA}))'
        style_range(ws, f"{col}9", font=fnt(8.5, False, GRAY), alignment=align("center"))
        if att_b:
            ws[f"{col}10"] = att_b[j]
        style_range(ws, f"{col}10", font=fnt(10.5), fl=fill(F_INPUT),
                    alignment=align("center"), border=BORDER_INPUT, num="#,##0")
    ws["J10"] = '=IF(COUNT(C10:I10)=0,"",SUM(C10:I10))'
    style_range(ws, "J10", font=fnt(10.5, True, TEAL), fl=fill(F_AUTO),
                alignment=align("center"), border=BORDER_LIGHT, num="#,##0")
    note(ws, "J9", "B計", 8, GRAY, h="center")
    ws.row_dimensions[11].height = 16
    ws.merge_cells("B11:K11")
    ws["B11"] = ('=IF(CSV貼付B!$N$5="","CSV貼付B:（未貼付）",'
                 '"CSV貼付B: "&COUNTA(CSV貼付B!$N$5:$N$' + str(CSV_END) + ')&"行｜"&'
                 'IF(CSV貼付B!$N$4<>"商品名","⚠ 貼付位置ズレ（5行目のA列から貼り直し）",'
                 'IF(CSV貼付B!$A$5="タイトル","⚠ ヘッダー行ごと貼付（1行目を除いて貼り直し）",'
                 'IF(OR($C$8="",$I$8=""),"⚠ 対象期間を読み取れません（CSVのD/E列を確認）",'
                 'IF($I$8<$C$8,"⚠ 対象期間が逆転しています（CSVのD/E列を確認）",'
                 'TRIM('
                 'IF($I$8-$C$8<>6,"⚠ "&($I$8-$C$8+1)&"日分のCSVです（期間Bは金〜木7日想定）",'
                 '"✔ "&($I$8-$C$8+1)&"日間")&" "&'
                 'IF(SUMPRODUCT((CSV貼付B!$D$5:$D$' + str(CSV_END) + '<>"")*(CSV貼付B!$D$5:$D$' + str(CSV_END) + '<>CSV貼付B!$D$5))+'
                 'SUMPRODUCT((CSV貼付B!$E$5:$E$' + str(CSV_END) + '<>"")*(CSV貼付B!$E$5:$E$' + str(CSV_END) + '<>CSV貼付B!$E$5))>0,'
                 '"⚠ 別期間の行が混ざっています（前回分を削除して貼り直し）","")&" "&'
                 'IF(WEEKDAY($C$8)<>6,"※開始が金曜以外","")'
                 '))))))')
    style_range(ws, "B11:K11", font=fnt(9, False, "5B6472"), alignment=align("left"))

    # 週末色分け
    for rng, drow in [("C4:E5", 4), ("C8:I9", 8)]:
        sun = FormulaRule(formula=[f'WEEKDAY(C${drow})=1'],
                          font=Font(name=FONT_NAME, color=RED, bold=True))
        sat = FormulaRule(formula=[f'WEEKDAY(C${drow})=7'],
                          font=Font(name=FONT_NAME, color="3B6FD4", bold=True))
        ws.conditional_formatting.add(rng, sun)
        ws.conditional_formatting.add(rng, sat)

    ws.row_dimensions[12].height = 6
    ws.row_dimensions[13].height = 30
    for ref, text in [("A13", "No."), ("B13", "商品名（プルダウンで選択）"),
                      ("C13", "期間A\n販売数"), ("D13", "期間B\n販売数"), ("K13", "メモ")]:
        style_range(ws, ref, font=fnt(9.5, True, "FFFFFF"), fl=fill(NAVY),
                    alignment=align("center", "center", True), border=BORDER_LIGHT)
        ws[ref] = text

    for i in range(N_SLOTS):
        r = ROW_P0 + i
        ws.row_dimensions[r].height = 20
        ws[f"A{r}"] = i + 1
        style_range(ws, f"A{r}", font=fnt(9, False, GRAY), alignment=align("center"))
        if i < len(products):
            ws[f"B{r}"] = products[i]
        style_range(ws, f"B{r}", font=fnt(10), fl=fill(F_INPUT),
                    alignment=align("left"), border=BORDER_INPUT)
        ws[f"C{r}"] = (f'=IF($B{r}="","",SUMIF(CSV貼付A!$N$5:$N${CSV_END},$B{r},'
                       f'CSV貼付A!$AA$5:$AA${CSV_END}))')
        ws[f"D{r}"] = (f'=IF($B{r}="","",SUMIF(CSV貼付B!$N$5:$N${CSV_END},$B{r},'
                       f'CSV貼付B!$AA$5:$AA${CSV_END}))')
        for col, zebra in (("C", i % 2), ("D", i % 2)):
            style_range(ws, f"{col}{r}", font=fnt(10, False, "5B6472"),
                        fl=fill(F_ZEBRA if zebra else F_AUTO),
                        alignment=align("center"), num="#,##0")
        style_range(ws, f"K{r}", font=fnt(9), alignment=align("left"))
        for col in "ABCDK":
            ws[f"{col}{r}"].border = Border(bottom=hair, left=hair, right=hair)
        ws[f"B{r}"].border = BORDER_INPUT

    ws[f"B{ROW_P0}"].comment = Comment("商品は最大20枠(B14〜B33)まで登録できます。プルダウンには"
                                       "CSV貼付A/Bの商品名が自動で並びます(項目数の上限はありません)。"
                                       "ドリンク・包材などはシート下部の除外リストで検索対象外です。"
                                       "手入力する場合はCSVの商品名と完全一致させてください。", "準備数ツール")
    dup_rule = FormulaRule(
        formula=[f'AND($B{ROW_P0}<>"",COUNTIF($B${ROW_P0}:$B${ROW_P0 + N_SLOTS - 1},$B{ROW_P0})>1)'],
        font=Font(name=FONT_NAME, bold=True, color=RED), fill=fill("FDECEC"))
    ws.conditional_formatting.add(f"B{ROW_P0}:B{ROW_P0 + N_SLOTS - 1}", dup_rule)

    dv_att = DataValidation(type="whole", operator="between", formula1="0", formula2="999999",
                            showErrorMessage=True)
    dv_att.error = "動員数は 0〜999,999 の整数で入力してください（文字や記号は不可）"
    dv_att.errorTitle = "動員数"
    ws.add_data_validation(dv_att)
    dv_att.add("C6:E6")
    dv_att.add("C10:I10")

    dv_name = DataValidation(type="list", formula1="商品リスト", allow_blank=True,
                             showErrorMessage=False)
    ws.add_data_validation(dv_name)
    dv_name.add(f"B{ROW_P0}:B{ROW_P0 + N_SLOTS - 1}")

    last = ROW_P0 + N_SLOTS - 1
    ws.row_dimensions[last + 1].height = 26
    note(ws, f"A{last + 1}:K{last + 1}",
         "※ 販売数のセルは自動計算です（CSVの「売上数」列を商品名で集計）。CSVを使わず手入力したい場合は、"
         "数値を直接入力しても使えます（自動集計に戻すには、同じ列の上下のセルの数式をコピーしてください。"
         "となりの列はもう一方の期間を参照しているため使わないでください）。",
         8.5, GRAY, wrap=True)

    # プルダウン検索から除外する小分類(編集OK)
    ws.row_dimensions[EXC_TOP - 1].height = 22
    chip(ws, f"B{EXC_TOP - 1}:E{EXC_TOP - 1}", "  🔎 プルダウン検索から除外する小分類（編集OK）",
         CHIP_NAVY, NAVY, 9.5)
    for i in range(EXC_SLOTS):
        r = EXC_TOP + i
        ws.row_dimensions[r].height = 18
        if i < len(EXCLUDE_CATS):
            ws[f"B{r}"] = EXCLUDE_CATS[i]
        style_range(ws, f"B{r}", font=fnt(9.5), fl=fill(F_INPUT),
                    alignment=align("left"), border=BORDER_INPUT)
        # CSVに実在する小分類名かの照合(タイポ・表記ゆれの空振り検知)
        ws[f"C{r}"] = (f'=IF(OR(TRIM($B{r})="",AND(CSV貼付A!$N$5="",CSV貼付B!$N$5="")),"",'
                       f'IF(COUNTIF(CSV貼付A!$H$5:$H${CSV_END},$B{r})+'
                       f'COUNTIF(CSV貼付B!$H$5:$H${CSV_END},$B{r})=0,"⚠該当なし","✔"))')
        style_range(ws, f"C{r}", font=fnt(8.5, False, GRAY), alignment=align("center"))
    exc_ok = FormulaRule(formula=[f'C{EXC_TOP}="✔"'],
                         font=Font(name=FONT_NAME, size=8.5, color=GREEN))
    exc_ng = FormulaRule(formula=[f'ISNUMBER(SEARCH("⚠",C{EXC_TOP}))'],
                         font=Font(name=FONT_NAME, size=8.5, bold=True, color=RED))
    ws.conditional_formatting.add(f"C{EXC_TOP}:C{EXC_END}", exc_ok)
    ws.conditional_formatting.add(f"C{EXC_TOP}:C{EXC_END}", exc_ng)
    note(ws, f"D{EXC_TOP}:K{EXC_TOP + 3}",
         "← ここに書いた小分類（CSVのH列「小分類名」と完全一致）の商品は、商品名プルダウンに"
         "出なくなります。集計からは除外されないため、手入力すれば集計できます。"
         "不要になった名前はセルの値をDeleteで消し、追加は空き枠に入力してください（最大12件）。"
         "行そのものの挿入・削除はしないでください（内部の自動計算が壊れます）。"
         "左の✔/⚠は、CSVに実在する小分類名かの照合結果です。", 8.5, GRAY, wrap=True)
    ws[f"B{EXC_TOP}"].comment = Comment("既定: ドリンク類(コールド/コーヒー/アルコール/その他ドリンク/ホット)、"
                                        "調味料類、ＳＥＴ作品コンボ、引換券、コンセ包材。", "準備数ツール")

    # 商品リスト抽出ヘルパー(非表示列 M〜Q)
    for ref, text in [("M4", "⚙A順"), ("N4", "⚙Aリスト"), ("O4", "⚙B順"),
                      ("P4", "⚙Bリスト"), ("Q4", "⚙商品リスト")]:
        note(ws, ref, text, 8, GRAY)
    exc = f"$B${EXC_TOP}:$B${EXC_END}"
    for i in range(CSV_MAX):
        r = 5 + i
        # 重複判定は非除外カテゴリの先行行のみ数える(除外行で先に出た同名商品が消えないように)
        ws[f"M{r}"] = (f'=IF(CSV貼付A!$N{r}="","",'
                       f'IF(COUNTIF({exc},CSV貼付A!$H{r})>0,"",'
                       f'IF(SUMPRODUCT((CSV貼付A!$N$5:$N{r}=CSV貼付A!$N{r})*'
                       f'(COUNTIF({exc},CSV貼付A!$H$5:$H{r})=0))>1,"",'
                       f'MAX($M$4:M{r - 1})+1)))')
        ws[f"O{r}"] = (f'=IF(CSV貼付B!$N{r}="","",'
                       f'IF(COUNTIF({exc},CSV貼付B!$H{r})>0,"",'
                       f'IF(SUMPRODUCT((CSV貼付B!$N$5:$N{r}=CSV貼付B!$N{r})*'
                       f'(COUNTIF({exc},CSV貼付B!$H$5:$H{r})=0))>1,"",'
                       f'MAX($O$4:O{r - 1})+1)))')
    for i in range(LIST_MAX):
        r = 5 + i
        ws[f"N{r}"] = (f'=IFERROR(INDEX(CSV貼付A!$N$5:$N${CSV_END},MATCH(ROW()-4,$M$5:$M${CSV_END},0)),"")')
        ws[f"P{r}"] = (f'=IFERROR(INDEX(CSV貼付B!$N$5:$N${CSV_END},MATCH(ROW()-4,$O$5:$O${CSV_END},0)),"")')
    for i in range(2 * LIST_MAX):
        r = 5 + i
        ws[f"Q{r}"] = (f'=IF(ROW()-4<=MAX($M$5:$M${CSV_END}),'
                       f'IFERROR(INDEX($N$5:$N${4 + LIST_MAX},ROW()-4),""),'
                       f'IFERROR(INDEX($P$5:$P${4 + LIST_MAX},ROW()-4-MAX($M$5:$M${CSV_END})),""))')

    wb.defined_names["商品リスト"] = DefinedName(
        "商品リスト",
        attr_text=(f"OFFSET(期間データ!$Q$5,0,0,"
                   f"MAX(MAX(期間データ!$M$5:$M${CSV_END})+MAX(期間データ!$O$5:$O${CSV_END}),1),1)"))

    ws.freeze_panes = "C14"

    # ======================================================== CSV貼付A/B =====
    for sheet_name, tab, label, csv_path in [
            ("CSV貼付A", AMBER, "期間A（直近 金土日）", csv_a),
            ("CSV貼付B", AMBER2, "期間B（前週 金〜木）", csv_b)]:
        ws = wb.create_sheet(sheet_name)
        ws.sheet_properties.tabColor = tab
        ws.sheet_view.showGridLines = False
        ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
        ws.page_setup.orientation = "landscape"
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 1
        ws.page_setup.paperSize = 9
        ws.print_area = "A1:N45"        # 印刷用途は想定しないため先頭部のみ

        ws.column_dimensions["A"].width = 13
        for c_idx in range(2, NCOL + 1):
            ws.column_dimensions[get_column_letter(c_idx)].width = 11
        ws.column_dimensions["N"].width = 28

        ws.row_dimensions[1].height = 34
        title_band(ws, f"A1:{get_column_letter(NCOL)}1",
                   f"　📋 {sheet_name}｜{label}の「売上・在庫・原価」CSV")
        ws.row_dimensions[2].height = 30
        note(ws, "A2:J2",
             "本社集計ソフトの「売上・在庫・原価」CSVを、5行目のA列を選択してそのまま貼り付けてください"
             "（1行目のヘッダー行は不要、最大1000行）。貼り替えるときは、先に前回のデータ"
             "（5行目以降）だけを選択して削除してください。1〜4行目は消さないこと。",
             9, GRAY, wrap=True)
        ws.row_dimensions[3].height = 18
        ws.merge_cells("A3:J3")
        ps, pe = parse_ymd("$D$5"), parse_ymd("$E$5")
        ws["A3"] = (f'="貼付行数: "&COUNTA($N$5:$N${CSV_END})&"行"&IF($N$5="","",'
                    f'"｜対象期間: "&IF(OR({ps}=-1,{pe}=-1),"—",'
                    f'TEXT({ps},"m/d")&"〜"&TEXT({pe},"m/d")))')
        style_range(ws, "A3:J3", font=fnt(9, True, "5B6472"), alignment=align("left"))

        ws.row_dimensions[4].height = 20
        for c_idx, h in enumerate(CSV_HEADERS, start=1):
            ref = f"{get_column_letter(c_idx)}4"
            ws[ref] = h
            style_range(ws, ref, font=fnt(8.5, True, "FFFFFF"), fl=fill(NAVY),
                        alignment=align("center"), border=BORDER_LIGHT)

        for i in range(350):                     # 目安の枠線(貼付は1000行まで有効)
            r = 5 + i
            for c_idx in range(1, NCOL + 1):
                cell = ws.cell(row=r, column=c_idx)
                cell.border = BORDER_HAIR
                cell.font = fnt(9)

        if csv_path:
            rows = read_csv_rows(csv_path)[:CSV_MAX]
            for i, row in enumerate(rows):
                r = 5 + i
                for c_idx, v in enumerate(row[:NCOL], start=1):
                    ws.cell(row=r, column=c_idx).value = v
        else:
            ws["A5"].comment = Comment("ここに集計CSVのデータ部分を貼り付けます。", "準備数ツール")

        ws.freeze_panes = "A5"

    # ------------------------------------------------------------------ save -
    wb.properties.title = "コンセッション事前準備数ツール"
    wb.properties.creator = "TOHOシネマズ新宿 コンセッション"
    wb.save(out_path)
    print("saved:", out_path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/home/user/claude-code-practice/concession-prep/TOHO新宿_コンセッション準備数ツール.xlsx")
    ap.add_argument("--csv-a")
    ap.add_argument("--csv-b")
    ap.add_argument("--select", choices=["A", "B"], default="A")
    ap.add_argument("--att-a", help="期間Aの動員数3日分(カンマ区切り)")
    ap.add_argument("--att-b", help="期間Bの動員数7日分(カンマ区切り)")
    ap.add_argument("--peak", type=int)
    ap.add_argument("--preset", default="平常")
    ap.add_argument("--adjust", type=float, default=1.0)
    a = ap.parse_args()
    build(a.out, csv_a=a.csv_a, csv_b=a.csv_b, select=a.select,
          att_a=[int(x) for x in a.att_a.split(",")] if a.att_a else None,
          att_b=[int(x) for x in a.att_b.split(",")] if a.att_b else None,
          peak=a.peak, preset=a.preset, adjust=a.adjust)
