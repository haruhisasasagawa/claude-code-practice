# -*- coding: utf-8 -*-
"""再計算(LibreOffice)後にシート保護・ブック保護を書き戻す仕上げスクリプト。

LibreOffice で開いて保存し直すと、ブック構成のロック(lockStructure)が落ち、
シート保護も sheet="true" だけに簡略化されてしまう。数式の計算結果を埋めるには
再計算が要るため、再計算のあとに xlsx(=zip)のXMLを直接書き換えて保護を復元する。
セルのロック/ロック解除(locked属性)は再計算後も保たれるので触らない。

  python seal_protection.py <xlsx> [<xlsx> ...] [--password PW] [--check]
"""
import argparse
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from openpyxl.utils.protection import hash_password

# lock_workbook(upgrade_v2.py) が掛けるのと同じ内容を使う(二重管理でズレないように)
from upgrade_v2 import SHEET_PROTECTION

SHEET_ATTRS = [(k, "1" if v else "0") for k, v in SHEET_PROTECTION.items()]
SHEET_RE = re.compile(rb"<sheetProtection\b[^>]*/>"
                     rb"|<sheetProtection\b[^>]*>.*?</sheetProtection>", re.S)
WB_RE = re.compile(rb"<workbookProtection\b[^>]*/>|<workbookProtection\b[^>]*>.*?</workbookProtection>",
                   re.S)


def _attrs(pairs):
    return "".join(f' {k}="{v}"' for k, v in pairs).encode()


def _sheet_xml(password):
    pairs = list(SHEET_ATTRS)
    if password:
        pairs.insert(1, ("password", hash_password(password)))
    return b"<sheetProtection" + _attrs(pairs) + b"/>"


def _wb_xml(password):
    pairs = [("lockStructure", "1"), ("lockWindows", "0")]
    if password:
        pairs.insert(0, ("workbookPassword", hash_password(password)))
    return b"<workbookProtection" + _attrs(pairs) + b"/>"


def _patch_sheet(data, password):
    new = _sheet_xml(password)
    if SHEET_RE.search(data):
        return SHEET_RE.sub(new, data, count=1)
    # 保護要素が無いシートには挿入する。スキーマ上 sheetData(→sheetCalcPr)の直後
    m = re.search(rb"<sheetCalcPr\b[^>]*/>", data) or re.search(rb"</sheetData>", data)
    if not m:
        return data
    return data[:m.end()] + new + data[m.end():]


def _patch_workbook(data, password):
    new = _wb_xml(password)
    if WB_RE.search(data):
        return WB_RE.sub(new, data, count=1)
    # スキーマ上 workbookPr/fileVersion のあと、bookViews/sheets の前
    m = re.search(rb"<bookViews\b", data) or re.search(rb"<sheets\b", data)
    if not m:
        return data
    return data[:m.start()] + new + data[m.start():]


def seal(path, password=None):
    """xlsx内のXMLを直接書き換えて保護を復元する。書き換えた要素数を返す"""
    path = Path(path)
    sheets = 0
    with zipfile.ZipFile(path) as zin:
        items = [(i, zin.read(i.filename)) for i in zin.infolist()]
    out = []
    wb_done = False
    for info, data in items:
        name = info.filename
        if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
            data = _patch_sheet(data, password)
            sheets += 1
        elif name == "xl/workbook.xml":
            data = _patch_workbook(data, password)
            wb_done = True
        out.append((info, data))
    tmp = Path(tempfile.mkstemp(suffix=".xlsx", dir=str(path.parent))[1])
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for info, data in out:
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = info.external_attr
            zout.writestr(zi, data)
    shutil.move(str(tmp), str(path))
    return sheets, wb_done


def check(path):
    """保護が効いているかをXMLレベルで確認する。(問題の一覧)を返す"""
    bad = []
    with zipfile.ZipFile(path) as z:
        wbx = z.read("xl/workbook.xml")
        m = WB_RE.search(wbx)
        if not m or b'lockStructure="1"' not in m.group(0):
            bad.append("ブック構成がロックされていません")
        for name in z.namelist():
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                m = SHEET_RE.search(z.read(name))
                if not m or (b'sheet="1"' not in m.group(0) and b'sheet="true"' not in m.group(0)):
                    bad.append(f"{name}: シート保護なし")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--password", default=None, help="保護解除に必要なパスワード")
    ap.add_argument("--check", action="store_true", help="書き換えずに確認だけする")
    a = ap.parse_args()
    ng = 0
    for f in a.files:
        if not a.check:
            sheets, wb_done = seal(f, a.password)
            print(f"seal: {f} sheets={sheets} workbook={'ok' if wb_done else 'NG'}")
        bad = check(f)
        if bad:
            ng += 1
            print(f"NG {f}: " + " / ".join(bad))
        else:
            print(f"OK {f}: 全シート＋ブック構成が保護されています")
    sys.exit(1 if ng else 0)


if __name__ == "__main__":
    main()
