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

SRC, OUT = sys.argv[1:3]

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
x = set_cell(x, "D3", blank=True, style=S_D3)
for n in range(1, 31):
    col = L(4 + n)
    x = set_cell(x, f"{col}3", formula=esc(f'IF($D$3="","",IF($D$3+{n}>EOMONTH($D$3,0),"",$D$3+{n}))'))
    # 数式セルは t="str" にしているが日付は数値なので t を外す
    x = x.replace(f'<c r="{col}3" s="{d3_style}" t="str">', f'<c r="{col}3" s="{d3_style}">')
for n in range(0, 31):
    col = L(4 + n)
    x = set_cell(x, f"{col}4", formula=esc(f'IF({col}$3="","",CHOOSE(WEEKDAY({col}$3,2),"月","火","水","木","金","土","日"))'))
x = set_cell(x, "E1", text="← D3 に月初の日付を入力(例 2026/12/1)。日付・曜日・年月は自動で更新。", style=style_of(cell_re("B3").search(x).group("attrs")))

# 行事・記号・必要人数・空き枠の氏名を空に
for r in list(range(5, 7)) + list(range(7, 66)) + [66]:
    for c in range(4, 35):
        ref = f"{L(c)}{r}"
        if cell_re(ref).search(x):
            x = set_cell(x, ref, blank=True)
for r in range(7, 66, 2):
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
for r in range(69, 85):
    for c in list(range(4, 18)) + list(range(21, 35)):
        ref = f"{L(c)}{r}"
        m = cell_re(ref).search(x)
        if m and m.group("body") and "<f" not in m.group("body"):
            x = set_cell(x, ref, blank=True)
parts[p] = x.encode("utf-8")

# ---------------------------------------------------------------- シフトライン: 日を 1 に
p = sheet_part["シフトライン"]
x = parts[p].decode("utf-8")
m = cell_re("B5").search(x)
x = x[:m.start()] + f'<c r="B5" s="{style_of(m.group("attrs"))}"><v>1</v></c>' + x[m.end():]
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

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(zin.getinfo(n), parts[n])
print("saved", OUT)
