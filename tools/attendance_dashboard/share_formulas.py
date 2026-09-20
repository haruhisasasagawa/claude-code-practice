#!/usr/bin/env python3
"""同じ形の数式が縦に並ぶ範囲を OOXML の共有数式（shared formula）に書き換えてファイルを小さくする.

openpyxl は数式を1セルずつ書き出すため、計算シート（1列 5,000 行）のXMLが大きくなる。
相対参照の行オフセットが同じ数式が連続している範囲を、先頭セルだけ本文を持つ共有数式に変換する。
計算結果・意味は変わらない（Excel / LibreOffice とも共有数式を通常の数式として展開する）。

使い方: python share_formulas.py 入力.xlsx 出力.xlsx

注意: この書き換えを行ったブックは Excel が「名簿」「計算1〜6」の数式を修復で削除する（LibreOffice では開ける）。
配布用ファイルには使わないこと。原因の切り分けが済むまで参考として残している。
"""
import collections
import os
import re
import shutil
import sys
import tempfile
import zipfile

REF = re.compile(r'(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(])')
CELL = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*)>(.*?)</c>', re.S)
FORMULA = re.compile(r'<f>(.*?)</f>', re.S)


def template(formula, row):
    """相対参照の行番号を「この行からのオフセット」に置き換えた形（同じ形なら共有できる）."""
    def sub(m):
        if m.group(3) == "$":
            return m.group(0)
        return f"{m.group(1)}{m.group(2)}[{int(m.group(4)) - row}]"
    return REF.sub(sub, formula)


def rewrite(xml):
    cells = []
    for m in CELL.finditer(xml):
        fm = FORMULA.search(m.group(4))
        if fm:
            cells.append((m.group(1), int(m.group(2)), m.start(), m.end(), m.group(3), m.group(4), fm.group(1)))
    bycol = collections.defaultdict(list)
    for c in cells:
        bycol[c[0]].append(c)
    repl = {}
    si = masters = children = 0
    for col, lst in bycol.items():
        i = 0
        while i < len(lst):
            j = i
            t0 = template(lst[i][6], lst[i][1])
            while j + 1 < len(lst) and lst[j + 1][1] == lst[j][1] + 1 and template(lst[j + 1][6], lst[j + 1][1]) == t0:
                j += 1
            if j > i:
                master = lst[i]
                body = master[5].replace("<f>", f'<f t="shared" ref="{col}{master[1]}:{col}{lst[j][1]}" si="{si}">', 1)
                repl[master[2]] = (master[3], f'<c r="{col}{master[1]}"{master[4]}>{body}</c>')
                for k in range(i + 1, j + 1):
                    c = lst[k]
                    body = FORMULA.sub(f'<f t="shared" si="{si}"/>', c[5], count=1)
                    repl[c[2]] = (c[3], f'<c r="{col}{c[1]}"{c[4]}>{body}</c>')
                si += 1
                masters += 1
                children += j - i
            i = j + 1
    out, pos = [], 0
    for start in sorted(repl):
        end, text = repl[start]
        out.append(xml[pos:start])
        out.append(text)
        pos = end
    out.append(xml[pos:])
    return "".join(out), masters, children


def share(src, dst, verbose=True):
    tmp = tempfile.mkdtemp()
    tmp_out = os.path.join(tmp, "out.xlsx")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp_out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith("xl/worksheets/sheet") and item.filename.endswith(".xml"):
                xml = data.decode("utf-8")
                new, masters, children = rewrite(xml)
                if verbose and masters:
                    print(f"{item.filename}: {len(xml) / 1e6:.1f}MB -> {len(new) / 1e6:.1f}MB, shared blocks {masters}, cells {children}")
                data = new.encode("utf-8")
            zout.writestr(item, data)
    shutil.move(tmp_out, dst)
    shutil.rmtree(tmp, ignore_errors=True)
    if verbose:
        print(f"size: {os.path.getsize(src):,} -> {os.path.getsize(dst):,} bytes")
    return dst


if __name__ == "__main__":
    share(sys.argv[1], sys.argv[2])
