# -*- coding: utf-8 -*-
"""
安定版の MGRシフトライン ブック(12月データ入り)から、データを空にした「原本」を作る。
openpyxl を通すと x14 条件付き書式・入力規則・図形が落ちるため、xlsx 内の XML を直接編集する。

使い方: python make_master.py <安定版.xlsx> <原本.xlsx>

やること(MGR貼付シート):
  - D3 を月初の入力セル(黄色・空欄)にし、E3:AH3 の日付、D4:AH4 の曜日、D1 の表題を D3 からの数式にする
  - 行事(D5:AH6)、記号(D7:AH65)、必要人数(D66:AH66)、イベント欄の文字を空にする
  - 氏名欄の空き枠(0 が入っている C47 以降)を空にする
  - イベント欄の日付(B69:B83, S69:S84)と「/日」表示を D3 からの数式にする
その他: ブックを開いたときに全再計算させる。設定シートの手順文を更新する。
"""
import sys, re, zipfile, shutil
from openpyxl.utils import get_column_letter as L, column_index_from_string as CI

args = [a for a in sys.argv[1:] if not a.startswith("--")]
KEEP = "--keep-data" in sys.argv
SRC, OUT = args[:2]

def cell_re(ref):
    return re.compile(r'<c r="%s"(?P<attrs>[^>]*?)(?:/>|>(?P<body>.*?)</c>)' % ref, re.S)

def style_of(attrs):
    m = re.search(r'\ss="(\d+)"', attrs)
    return m.group(1) if m else None

def set_cell(xml, ref, *, formula=None, text=None, blank=False, style=None, row_hint=None):
    """ref のセルを置き換える。無いセルは行に挿入する(列順を保つ)。"""
    m = cell_re(ref).search(xml)
    s = style if style is not None else (style_of(m.group("attrs")) if m else None)
    sattr = f' s="{s}"' if s is not None else ""
    if blank:
        new = f'<c r="{ref}"{sattr}/>'
    elif formula is not None:
        new = f'<c r="{ref}"{sattr} t="str"><f>{formula}</f></c>'
    elif text is not None:
        new = f'<c r="{ref}"{sattr} t="inlineStr"><is><t>{text}</t></is></c>'
    else:
        raise ValueError
    if m:
        return xml[:m.start()] + new + xml[m.end():]
    # 行に挿入
    rown = int(re.sub(r"[A-Z]", "", ref)); col = CI(re.sub(r"\d", "", ref))
    rm = re.search(r'<row r="%d"[^>]*>(.*?)</row>' % rown, xml, re.S)
    if not rm:
        raise RuntimeError(f"row {rown} not found for {ref}")
    body = rm.group(1)
    cells = list(re.finditer(r'<c r="([A-Z]+)\d+"[^>]*?(?:/>|>.*?</c>)', body, re.S))
    pos = len(body)
    for c in cells:
        if CI(c.group(1)) > col:
            pos = c.start(); break
    body2 = body[:pos] + new + body[pos:]
    return xml[:rm.start(1)] + body2 + xml[rm.end(1):]

def ensure_row(xml, rown, ht=None):
    """行が無ければ順序を保って挿入する"""
    if re.search(r'<row r="%d"[\s>]' % rown, xml):
        return xml
    attrs = f' ht="{ht}" customHeight="1"' if ht else ""
    new = f'<row r="{rown}"{attrs}></row>'
    pos = None
    for m in re.finditer(r'<row r="(\d+)"', xml):
        if int(m.group(1)) > rown:
            pos = m.start(); break
    if pos is None:
        pos = xml.find("</sheetData>")
    return xml[:pos] + new + xml[pos:]

def add_merge(xml, ref):
    m = re.search(r'<mergeCells count="(\d+)">(.*?)</mergeCells>', xml, re.S)
    n = int(m.group(1))
    return xml[:m.start()] + f'<mergeCells count="{n+1}">' + m.group(2) + f'<mergeCell ref="{ref}"/>' + "</mergeCells>" + xml[m.end():]

def add_xf(st, xf_xml):
    m = re.search(r'<cellXfs count="(\d+)">(.*?)</cellXfs>', st, re.S)
    n = int(m.group(1))
    return st[:m.start()] + f'<cellXfs count="{n+1}">' + m.group(2) + xf_xml + "</cellXfs>" + st[m.end():], n

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

zin = zipfile.ZipFile(SRC)
names = zin.namelist()
parts = {n: zin.read(n) for n in names}

# シート名 → パート
wbx = parts["xl/workbook.xml"].decode("utf-8")
rels = parts["xl/_rels/workbook.xml.rels"].decode("utf-8")
rid2t = {m.group(1): m.group(2) for m in re.finditer(r'<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels)}
rid2t.update({m.group(2): m.group(1) for m in re.finditer(r'<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"', rels)})
sheet_part = {}
for m in re.finditer(r'<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wbx):
    t = rid2t[m.group(2)]
    sheet_part[m.group(1)] = "xl/" + t.lstrip("/").replace("xl/", "", 1) if not t.startswith("/") else t.lstrip("/")

# ---------------------------------------------------------------- styles: 黄色塗りの入力用スタイルを追加
st = parts["xl/styles.xml"].decode("utf-8")
fills_m = re.search(r'<fills count="(\d+)">(.*?)</fills>', st, re.S)
nfill = int(fills_m.group(1))
st = st[:fills_m.start()] + f'<fills count="{nfill+1}">' + fills_m.group(2) + \
     '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill></fills>' + st[fills_m.end():]
YELLOW_FILL = nfill

def add_xf_like(st, base_idx, **over):
    """cellXfs の base_idx をコピーして属性を上書きした xf を追加し、新しい index を返す"""
    xfs_m = re.search(r'<cellXfs count="(\d+)">(.*?)</cellXfs>', st, re.S)
    xfs = list(re.finditer(r'<xf [^>]*?(?:/>|>.*?</xf>)', xfs_m.group(2), re.S))
    base = xfs[base_idx].group(0)
    head = re.match(r'<xf [^>]*?(/?)>', base).group(0)
    attrs = dict(re.findall(r'(\w+)="([^"]*)"', head))
    attrs.update({k: str(v) for k, v in over.items()})
    new = "<xf " + " ".join(f'{k}="{v}"' for k, v in attrs.items()) + base[len(head)-1:]
    if not new.endswith("/>") and not new.endswith("</xf>"):
        new = new  # pragma: no cover
    n = int(xfs_m.group(1))
    body = xfs_m.group(2) + new
    st2 = st[:xfs_m.start()] + f'<cellXfs count="{n+1}">' + body + "</cellXfs>" + st[xfs_m.end():]
    return st2, n

# ---------------------------------------------------------------- MGR貼付
p = sheet_part["MGR貼付"]
x = parts[p].decode("utf-8")
d3_style = style_of(cell_re("D3").search(x).group("attrs"))
st, S_D3 = add_xf_like(st, int(d3_style), fillId=YELLOW_FILL, applyFill=1)

# 表題・月初入力・日付・曜日
x = set_cell(x, "D1", formula=esc('IF($D$3="","",TEXT($D$3,"m")&"月シフト")'))
if not KEEP:
    x = set_cell(x, "D3", blank=True, style=S_D3)
else:
    x = x.replace('<c r="D3" s="%s"' % d3_style, '<c r="D3" s="%d"' % S_D3)
for n in range(1, 31):
    col = L(4 + n)
    x = set_cell(x, f"{col}3", formula=esc(f'IF($D$3="","",IF($D$3+{n}>EOMONTH($D$3,0),"",$D$3+{n}))'))
    # 数式セルは t="str" にしているが日付は数値なので t を外す
    x = x.replace(f'<c r="{col}3" s="{d3_style}" t="str">', f'<c r="{col}3" s="{d3_style}">')
for n in range(0, 31):
    col = L(4 + n)
    x = set_cell(x, f"{col}4", formula=esc(f'IF({col}$3="","",CHOOSE(WEEKDAY({col}$3,2),"月","火","水","木","金","土","日"))'))
x = set_cell(x, "E1", text="← D3 に月初の日付を入力(例 2026/12/1)。日付・曜日・年月は自動で更新。", style=style_of(cell_re("B3").search(x).group("attrs")))
x = set_cell(x, "B6", text="イベント", style=style_of(cell_re("B5").search(x).group("attrs")))

# 行事・記号・必要人数・空き枠の氏名を空に
for r in ([] if KEEP else list(range(5, 7)) + list(range(7, 66)) + [66]):
    for c in range(4, 35):
        ref = f"{L(c)}{r}"
        if cell_re(ref).search(x):
            x = set_cell(x, ref, blank=True)
for r in ([] if KEEP else range(7, 66, 2)):
    m = cell_re(f"C{r}").search(x)
    if m and m.group("body") and re.search(r"<v>0</v>", m.group("body")) and 't="s"' not in m.group("attrs"):
        x = set_cell(x, f"C{r}", blank=True)

# イベント欄: 日付を数式に、文字を空に
for i in range(15):                      # B69:B83
    r = 69 + i
    f = 'IF($D$3="","",$D$3)' if i == 0 else f'IF(B{r-1}="","",IF(B{r-1}+1>EOMONTH($D$3,0),"",B{r-1}+1))'
    x = set_cell(x, f"B{r}", formula=esc(f)); x = x.replace(f'<c r="B{r}" s="{style_of(cell_re("B"+str(r)).search(x).group("attrs"))}" t="str">', f'<c r="B{r}" s="{style_of(cell_re("B"+str(r)).search(x).group("attrs"))}">')
    x = set_cell(x, f"C{r}", formula=esc(f'IF(B{r}="","","/"&DAY(B{r}))'))
for i in range(16):                      # S69:S84
    r = 69 + i
    f = 'IF(B83="","",IF(B83+1>EOMONTH($D$3,0),"",B83+1))' if i == 0 else f'IF(S{r-1}="","",IF(S{r-1}+1>EOMONTH($D$3,0),"",S{r-1}+1))'
    x = set_cell(x, f"S{r}", formula=esc(f)); x = x.replace(f'<c r="S{r}" s="{style_of(cell_re("S"+str(r)).search(x).group("attrs"))}" t="str">', f'<c r="S{r}" s="{style_of(cell_re("S"+str(r)).search(x).group("attrs"))}">')
    x = set_cell(x, f"T{r}", formula=esc(f'IF(S{r}="","","/"&DAY(S{r}))'))
for r in ([] if KEEP else range(69, 85)):
    for c in list(range(4, 18)) + list(range(21, 35)):
        ref = f"{L(c)}{r}"
        m = cell_re(ref).search(x)
        if m and m.group("body") and "<f" not in m.group("body"):
            x = set_cell(x, ref, blank=True)
parts[p] = x.encode("utf-8")

# ---------------------------------------------------------------- シフトライン: 日を 1 に、行事2行とイベント欄を表示
p = sheet_part["シフトライン"]
x = parts[p].decode("utf-8")
if not KEEP:
    m = cell_re("B5").search(x)
    x = x[:m.start()] + f'<c r="B5" s="{style_of(m.group("attrs"))}"><v>1</v></c>' + x[m.end():]

def guard(expr):
    return f'IF(OR({expr}="",{expr}=0),"",TRIM({expr}&""))'
G1 = guard("INDEX(MGR貼付!$D$5:$AH$5,$B$5)")
G2 = guard("INDEX(MGR貼付!$D$6:$AH$6,$B$5)")
GYOJI = G1
DATEX = 'DATE(YEAR(設定!$C$6),MONTH(設定!$C$6),$B$5)'
E1 = guard(f'IFERROR(INDEX(MGR貼付!$D$69:$D$84,MATCH({DATEX},MGR貼付!$B$69:$B$84,0)),"")')
E2 = guard(f'IFERROR(INDEX(MGR貼付!$U$69:$U$84,MATCH({DATEX},MGR貼付!$S$69:$S$84,0)),"")')
EV0 = f'{E1}&IF(AND({E1}<>"",{E2}<>"")," ／ ","")&{E2}'
EVENT = f'{G2}&IF(AND({G2}<>"",{EV0}<>"")," ／ ","")&{EV0}'
# 見出し横の行事表示は使わず、6行目(表のすぐ上)に 行事とイベントを2行で表示する
x = set_cell(x, "AF5", blank=True)
s_label = style_of(cell_re("B39").search(x).group("attrs"))
xfs_all = re.findall(r'<xf [^>]*?(?:/>|>.*?</xf>)', re.search(r'<cellXfs count="\d+">(.*?)</cellXfs>', st, re.S).group(1), re.S)
font_id = re.search(r'fontId="(\d+)"', xfs_all[int(style_of(cell_re("C9").search(x).group("attrs")))]).group(1)
st, S_WRAP = add_xf(st, f'<xf numFmtId="0" fontId="{font_id}" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>')
x = ensure_row(x, 6)
rm = re.search(r'<row r="6"([^>]*)>', x)
attrs = re.sub(r'\s(ht|customHeight)="[^"]*"', "", rm.group(1))
x = x[:rm.start()] + f'<row r="6"{attrs} ht="34" customHeight="1">' + x[rm.end():]
x = set_cell(x, "B6", text="行事・イベント", style=s_label)
x = set_cell(x, "E6", formula=esc(
    f'IF($D$5="","",IF({GYOJI}="","行事： なし","行事： "&{GYOJI})&CHAR(10)&IF({EVENT}="","イベント： なし","イベント： "&{EVENT}))'), style=S_WRAP)
x = add_merge(x, "B6:D6")
x = add_merge(x, "E6:BB6")

# 出勤計を、その日の最後の社員行のすぐ下に出す(39行目の固定表示はやめる)
for r in range(9, 39):
    prev = "TRUE" if r == 9 else f'$BE{r-1}<>""'
    x = set_cell(x, f"B{r}", formula=esc(f'IF($BE{r}<>"",INDEX(計算!$C$2:$C$931,$BE{r}),IF(AND($D$5<>"",{prev}),"出勤計",""))'))
    x = set_cell(x, f"C{r}", formula=esc(f'IF($BE{r}<>"",INDEX(計算!$D$2:$D$931,$BE{r}),IF($B{r}="出勤計",COUNT($BE$9:$BE$38)&"名",""))'))
for ref in ("B39", "C39", "D39"):
    x = re.sub(r'<c r="%s"[^>]*?(?:/>|>.*?</c>)' % ref, "", x, count=1, flags=re.S)
x = x.replace('<mergeCell ref="C39:D39"/>', "")
x = re.sub(r'<mergeCells count="(\d+)">', lambda m: f'<mergeCells count="{int(m.group(1))-1}">', x, count=1)
x = x.replace('COUNTIF($B$9:$B$38,"?*")', "COUNT($BE$9:$BE$38)")
# 既存の「名前がある行」の書式ルールから出勤計の行を外し、出勤計の行用の書式を足す
x = x.replace('<formula>$B9&lt;&gt;""</formula>', '<formula>AND($B9&lt;&gt;"",$B9&lt;&gt;"出勤計")</formula>')
dm = re.search(r'<dxfs count="(\d+)">(.*?)</dxfs>', st, re.S)
ndxf = int(dm.group(1))
st = st[:dm.start()] + f'<dxfs count="{ndxf+1}">' + dm.group(2) + \
     '<dxf><font><b/><color rgb="FFFFFFFF"/></font><fill><patternFill patternType="solid"><fgColor rgb="FF2F6597"/><bgColor rgb="FF2F6597"/></patternFill></fill></dxf></dxfs>' + st[dm.end():]
last_cf = x.rfind("</conditionalFormatting>") + len("</conditionalFormatting>")
x = x[:last_cf] + f'<conditionalFormatting sqref="B9:C38"><cfRule type="expression" dxfId="{ndxf}" priority="30"><formula>$B9="出勤計"</formula></cfRule></conditionalFormatting>' + x[last_cf:]
parts[p] = x.encode("utf-8")

# ---------------------------------------------------------------- 月間: 行事は5行目と6行目をつなぐ
p = sheet_part["月間"]
x = parts[p].decode("utf-8")
x = set_cell(x, "E5", text="行事・イベント")
for d in range(1, 32):
    r = 5 + d
    g1 = guard(f"INDEX(MGR貼付!$D$5:$AH$5,{d})"); g2 = guard(f"INDEX(MGR貼付!$D$6:$AH$6,{d})")
    x = set_cell(x, f"E{r}", formula=esc(f'IF($C{r}="","",{g1}&IF(AND({g1}<>"",{g2}<>"")," ／ ","")&{g2})'))
parts[p] = x.encode("utf-8")

# ---------------------------------------------------------------- 設定: 手順文
p = sheet_part["設定"]
x = parts[p].decode("utf-8")
steps = {
    "B14": "1. 「MGR貼付」の D3 に月初の日付を入力(例 2026/12/1)。日付・曜日・対象年月は自動で更新されます。",
    "B15": "2. 社員ごとの行(C7, C9, …の右)に記号を入力。MGRシフト表の月シートから「値の貼り付け」(A1 を選んで Ctrl+Alt+V → 値)でも可。",
    "B16": "3. 行事(5〜6行目)と必要人数(66行目)を入れると、シフトライン・月間にそのまま表示されます。",
    "B17": "4. 出勤記号や時刻が変わったときは「MGRマスタ」(A列=出勤、B列=記号、C列=退勤、D列=区分)を直します。",
}
for ref, t in steps.items():
    x = set_cell(x, ref, text=esc(t))
parts[p] = x.encode("utf-8")

# ---------------------------------------------------------------- 太枠(thick)の罫線を周囲と同じ細線に戻す
# シフト記号のマスに残っていた強調用の太枠。色も周囲の細線(theme 0, tint -0.5)に合わせる
st = st.replace('style="thick"><color theme="1"/>', 'style="thin"><color theme="0" tint="-0.499984740745262"/>')
st = st.replace('style="thick"', 'style="thin"')

# ---------------------------------------------------------------- 開いたときに全再計算
wbx = re.sub(r"<calcPr ", '<calcPr fullCalcOnLoad="1" ', wbx, count=1)
parts["xl/workbook.xml"] = wbx.encode("utf-8")
parts["xl/styles.xml"] = st.encode("utf-8")

# ---------------------------------------------------------------- 計算チェーンは捨てる(消した数式を指したままだと Excel が修復を求める。Excel が開くときに作り直す)
if "xl/calcChain.xml" in parts:
    del parts["xl/calcChain.xml"]
    names = [n for n in names if n != "xl/calcChain.xml"]
    rels2 = parts["xl/_rels/workbook.xml.rels"].decode("utf-8")
    rels2 = re.sub(r'<Relationship [^>]*calcChain[^>]*/>', "", rels2)
    parts["xl/_rels/workbook.xml.rels"] = rels2.encode("utf-8")
    ct = parts["[Content_Types].xml"].decode("utf-8")
    ct = re.sub(r'<Override [^>]*calcChain[^>]*/>', "", ct)
    parts["[Content_Types].xml"] = ct.encode("utf-8")

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(zin.getinfo(n), parts[n])
print("saved", OUT)
