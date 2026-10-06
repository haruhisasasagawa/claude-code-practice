#!/usr/bin/env python3
"""Browser check of the bundled page against the golden workbook values (Playwright + Chromium).

    python3 test/ui_check.py [--csv-dir DIR] [--golden FILE.json] [--out DIR] [--print-all]

    --csv-dir    the monthly CSVs to load (default: <scratch>/sample6, the synthetic 6-month sample)
    --golden     golden values of the same CSVs with default settings (default: <scratch>/htmlapp/golden/ns_s6.json)
    --out        screenshots and PDFs (default: <scratch>/htmlapp/shots) — keep it outside the repository
    --print-all  also print 全員分 (one A4 page per staff) and check the page count

<scratch> comes from $AE_SCRATCH, test/parity.local.json {"scratch"} or the session default (as in parity.js).

What it does (every check prints a line; the exit code is 0 only when all pass):
  * opens dist/勤務実績ダッシュボード.html via file:// and records console errors, page errors, failed requests and
    every request; the only allowed request is the page itself (no network at all)
  * loads every CSV through the file input and checks the 貼付状況 table against 使い方 B16:E21 of the golden
  * selects the golden's dashboard staff (ダッシュボード!B7, read from the golden at run time — no names in this file)
    and compares every workbook cell the page shows (elements with data-cell="B15" …) with the golden value, formatted
    with the cell's Excel number format; the same for 全体サマリー and that person's スタッフ一覧 row
  * screenshots every tab, prints the dashboard (must be exactly 1 A4 portrait page), スタッフ一覧 and 全体サマリー
    (page counts reported; both A4 landscape)
  * the filter box (a name fragment, a 4-digit number fragment, a leading-zero number, no match), a settings change
    (◎ 判定基準) that must recompute the page, persistence of that setting across a reload, and 既定値に戻す
"""
import argparse
import datetime
import json
import os
import pathlib
import re
import sys
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import unquote

from playwright.sync_api import sync_playwright

APP = pathlib.Path(__file__).resolve().parent.parent   # app/
DIST = APP / 'dist' / '勤務実績ダッシュボード.html'
CHROMIUM = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']


def scratch_dir():
    if os.environ.get('AE_SCRATCH'):
        return pathlib.Path(os.environ['AE_SCRATCH'])
    lp = APP / 'test' / 'parity.local.json'
    if lp.exists():
        try:
            s = json.loads(lp.read_text(encoding='utf-8')).get('scratch')
            if s:
                return pathlib.Path(s)
        except ValueError:
            pass
    return pathlib.Path('/tmp/claude-0/-home-user-claude-code-practice/80f78731-7e64-5797-98bb-bc409f51a97b/scratchpad')


# ------------------------------------------------------------------ Excel display formats (half away from zero)
def _dec(x):
    return Decimal(format(x, '.15g'))          # Excel works on the 15-significant-digit value


def _round(d, places):
    return d.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)


def _fixed(x, places):
    s = str(_round(_dec(x), places))
    return '0' + s[2:] if s.startswith('-0') and set(s[1:]) <= set('0.') else s


def _serial_date(v):
    return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v // 1))


def xl_format(v, fmt):
    """The text Excel shows for value v with number format fmt (only the formats these sheets use)."""
    if v is None or v == '':
        return ''
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if fmt in (None, 'General'):
        if float(v).is_integer():
            return str(int(v))
        return format(float(format(v, '.15g')), 'g') if abs(v) < 1e-4 else str(float(format(v, '.15g')))
    m = re.fullmatch(r'(#,##)?0(\.0+)?(%)?(?:"(.*)")?', fmt)
    if m:
        places = len(m.group(2)) - 1 if m.group(2) else 0
        d = _dec(v) * 100 if m.group(3) else _dec(v)
        s = str(_round(d, places))
        if m.group(1):
            ip, _, fp = s.partition('.')
            ip = '{:,}'.format(int(ip))
            s = ip + ('.' + fp if fp else '')
        return s + (m.group(3) or '') + (m.group(4) or '')
    if fmt == '[h]:mm':
        mins = int(_round(_dec(v) * 1440, 0))
        return f'{mins // 60}:{mins % 60:02d}'
    if fmt == 'rowcount':                        # [=0]"※ 貼付データに無い値です（表記を確認）";#,##0"行"
        return '※ 貼付データに無い値です（表記を確認）' if v == 0 else xl_format(v, '#,##0"行"')
    if fmt == 'm/d':
        d = _serial_date(v)
        return f'{d.month}/{d.day}'
    if fmt == 'm/d hh:mm':
        secs = int(_round(_dec(v) * 86400, 0))       # round to the second, then show hh:mm (30 OQ1)
        d = _serial_date(secs // 86400)
        rem = secs % 86400
        return f'{d.month}/{d.day} {rem // 3600:02d}:{rem % 3600 // 60:02d}'
    raise ValueError('unsupported format ' + fmt)


def cell_rc(a):
    m = re.fullmatch(r'([A-Z]+)(\d+)', a)
    col = 0
    for ch in m.group(1):
        col = col * 26 + ord(ch) - 64
    return int(m.group(2)), col


# number formats of the cells that hold numbers (spec 40 / 50 / 60); everything else is General / text
def dash_format(a):
    r, _ = cell_rc(a)
    c = re.match(r'[A-Z]+', a).group(0)
    if a == 'J7':
        return '0'
    if a in ('B11', 'J11'):
        return '0"日"'
    if a in ('F11', 'N11', 'V11', 'D23'):
        return '0.0%'
    if a == 'R11':
        return '0.0"h"'
    if a in ('V36', 'V38', 'V40'):
        return '0"日"'
    if 44 <= r <= 46 and c in 'LMNOP':
        return '0%'
    if 52 <= r <= 58:
        return {'F': '0"日"', 'H': '0"日"', 'J': '0"日"', 'U': '0"日"', 'W': '0"日"', 'M': '0.0%',
                'P': '0.0"h"', 'S': '0.0"h"'}.get(c)
    if 63 <= r <= 74:
        return {'B': 'm/d', 'J': 'm/d hh:mm'}.get(c)
    if 83 <= r <= 88 and c in ('S', 'V'):
        return '0"日"'
    return None


def sum_format(a):
    r, _ = cell_rc(a)
    c = re.match(r'[A-Z]+', a).group(0)
    if r == 5:
        return {'A': '0"名"', 'C': '0"名"', 'K': '0"名"', 'E': '0.0%', 'G': '0.0%', 'J': '#,##0"日"'}.get(c)
    if 9 <= r <= 28:
        return {'B': '0"名"', 'C': '#,##0"日"', 'D': '#,##0"日"', 'E': '#,##0"日"', 'F': '0.0%', 'G': '0.0%',
                'L': '0"日"', 'M': '0"日"', 'N': '0.0%'}.get(c)
    return None


def set_format(a):
    r, _ = cell_rc(a)
    if a in ('B3', 'B4'):
        return '0%'
    if a == 'B6':
        return '0.0%'
    if a in ('B7', 'B8'):
        return '[h]:mm'
    if a[0] == 'C' and (13 <= r <= 32 or 38 <= r <= 57):
        return 'rowcount'
    return None


LIST_FORMATS = {'A': '0', 'C': '0', 'F': '0"日"', 'G': '0"日"', 'H': '0"日"', 'I': '0.0%', 'J': '0.0%', 'L': '0.0"h"',
                'M': '0.0', 'N': '0.0"h"', 'O': '0"ヶ月"', 'P': '0"日"', 'Q': '0.0%', 'R': '0"日"', 'S': '0.0%',
                'T': '0"日"', 'U': '0.0%', 'V': '0"件"', 'W': '0"件"'}
LIST_FORMATS.update({c: '0' for c in ['X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI']})

# Cells whose leading legend glyph (● ■ ―) the page draws as a coloured swatch next to the text instead.
GLYPH_AS_SWATCH = {'C30', 'F30', 'K30', 'N30', 'J44', 'J45', 'J46'}


def strip_glyph(s):
    return re.sub(r'^[●■―]\s*', '', s)


# ------------------------------------------------------------------ PDF helpers
def _pymupdf():
    """PyMuPDF when installed (exact page count and sizes, PNG previews of the PDFs); else None."""
    try:
        import pymupdf
        return pymupdf
    except ImportError:
        try:
            import fitz
            return fitz
        except ImportError:
            return None


def pdf_info(data: bytes):
    fitz = _pymupdf()
    if fitz:
        doc = fitz.open(stream=data, filetype='pdf')
        sizes = sorted({(round(p.rect.width), round(p.rect.height)) for p in doc})
        return doc.page_count, sizes
    else:
        pages = len(re.findall(rb'/Type\s*/Page(?![s\w])', data))
        boxes = re.findall(rb'/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]', data)
        return pages, sorted({(round(float(b[2]) - float(b[0])), round(float(b[3]) - float(b[1]))) for b in boxes})


def pdf_to_png(data: bytes, path: pathlib.Path, page=0):
    fitz = _pymupdf()
    if not fitz:
        return False
    doc = fitz.open(stream=data, filetype='pdf')
    doc[page].get_pixmap(dpi=110).save(str(path))
    return True


# ------------------------------------------------------------------ the check
class Check:
    def __init__(self):
        self.fails = []
        self.n = 0

    def ok(self, cond, label, detail=''):
        self.n += 1
        print(('  ok   ' if cond else '  FAIL ') + label + (('  — ' + detail) if detail and not cond else ''))
        if not cond:
            self.fails.append(label + (': ' + detail if detail else ''))
        return cond

    def compare(self, label, expected: dict, actual: dict, max_show=12):
        # a cell the page does not draw counts as blank ('' / missing are equivalent, as in parity.js)
        bad = [(k, expected[k], actual.get(k)) for k in sorted(expected, key=cell_rc) if expected[k] != actual.get(k, '')]
        self.ok(not bad, f'{label}: {len(expected) - len(bad)}/{len(expected)} cells match',
                '; '.join(f'{k}: expected {e!r} got {a!r}' for k, e, a in bad[:max_show]))
        return not bad


def wait_until(page, js, timeout_ms=20000, step=100):
    """Poll a JS expression (page.wait_for_function needs eval, which the page CSP forbids)."""
    t = 0
    while t < timeout_ms:
        if page.evaluate(js):
            return True
        page.wait_for_timeout(step)
        t += step
    return False


def settled(page, timeout_ms=30000):
    page.wait_for_timeout(50)
    return wait_until(page, "document.getElementById('busy').hidden", timeout_ms)


def wait_text(page, selector, expected, timeout_ms=10000):
    js = f"(() => {{ const e = document.querySelector({json.dumps(selector)}); return !!e && e.textContent === {json.dumps(expected)}; }})()"
    return wait_until(page, js, timeout_ms)


DOM_CELLS = """(root) => {
  const out = {};
  for (const e of document.querySelectorAll(root + ' [data-cell]')) {
    const sel = e.querySelector('select');
    out[e.dataset.cell] = e.tagName === 'INPUT' ? e.value : (sel ? sel.value : e.textContent);
  }
  return out;
}"""


def golden_expected(gsheet, dom: dict, fmt_of, glyph=frozenset(), only_rows=None):
    """Expected text for every cell the page shows (data-cell) and every golden cell in the same rows."""
    exp = {}
    keys = set(dom)
    for k in gsheet:
        r, _ = cell_rc(k)
        if only_rows is None or only_rows(r):
            keys.add(k)
    for k in keys:
        v = gsheet.get(k, '')
        t = xl_format(v, fmt_of(k)) if not isinstance(v, str) else v
        exp[k] = strip_glyph(t) if k in glyph else t
    return exp


def roster_names(golden):
    """[(name, emp_no_text)] of the 名簿 master rows (I = 従業員番号, J = 名前)."""
    m = golden.get('名簿', {})
    out = []
    r = 2
    while f'I{r}' in m or f'J{r}' in m:
        no, nm = m.get(f'I{r}', ''), m.get(f'J{r}', '')
        if nm != '':
            out.append((str(nm), xl_format(no, None) if not isinstance(no, str) else no))
        r += 1
    return out


def main():
    sc = scratch_dir()
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv-dir', default=str(sc / 'sample6'))
    ap.add_argument('--golden', default=str(sc / 'htmlapp' / 'golden' / 'ns_s6.json'))
    ap.add_argument('--out', default=str(sc / 'htmlapp' / 'shots'))
    ap.add_argument('--print-all', action='store_true')
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    csvs = sorted(str(p) for p in pathlib.Path(a.csv_dir).glob('*.csv'))
    G = json.loads(pathlib.Path(a.golden).read_text(encoding='utf-8'))
    GD, GS, GL, GH = G['ダッシュボード'], G['全体サマリー'], G['スタッフ一覧'], G['使い方']
    staff = GD['B7']
    ck = Check()
    console_errors, requests, failed = [], [], []
    page_url = DIST.as_uri()
    print(f'page: {DIST.name} ({DIST.stat().st_size:,} bytes)   CSVs: {len(csvs)}   golden: {pathlib.Path(a.golden).name}')

    with sync_playwright() as pw:
        exe = next((x for x in CHROMIUM if pathlib.Path(x).exists()), None)
        br = pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()
        ctx = br.new_context(viewport={'width': 1440, 'height': 1000}, locale='ja-JP')
        ctx.on('request', lambda r: requests.append(r.url))
        ctx.on('requestfailed', lambda r: failed.append(f'{r.url} {r.failure}'))
        page = ctx.new_page()
        page.on('console', lambda m: console_errors.append(f'[console.{m.type}] {m.text}') if m.type == 'error' else None)
        page.on('pageerror', lambda e: console_errors.append(f'[pageerror] {e}'))
        page.on('dialog', lambda d: d.accept())

        # ---------------------------------------------------------------- open, empty state
        print('\n[open]')
        page.goto(page_url)
        settled(page)
        ck.ok(not page.locator('#banner').is_visible(), 'no error banner on load',
              page.locator('#banner').inner_text() if page.locator('#banner').is_visible() else '')
        ck.ok(page.locator('#tab-howto').is_visible(), 'lands on 使い方')
        page.screenshot(path=str(out / '01_howto_empty.png'), full_page=True)
        page.click('#tabbtn-dash')
        settled(page)
        b15 = page.evaluate("(document.querySelector('#dash-host [data-cell=\"B15\"]') || {}).textContent || ''")
        ck.ok(b15.startswith('データがまだありません'), 'empty dashboard shows the no-data sentence (B15)', b15[:60])
        page.screenshot(path=str(out / '01b_dashboard_empty.png'), full_page=False)
        page.click('#tabbtn-howto')
        settled(page)

        # ---------------------------------------------------------------- load the CSVs
        print('\n[load CSVs]')
        page.set_input_files('#file-input', csvs)
        ck.ok(wait_until(page, "!document.getElementById('tab-dash').hidden && document.getElementById('busy').hidden "
                               "&& !!document.querySelector('#dash-host [data-cell=\"B15\"]')", 60000),
              'switches to the dashboard after loading')
        settled(page)
        rows = page.eval_on_selector_all('#paste-body tr', 'trs => trs.map(tr => Array.from(tr.cells).map(td => td.textContent))')
        ck.ok(len(rows) == 6, '貼付状況 has 6 rows', str(len(rows)))
        exp_rows = []
        for k in range(6):
            r = 16 + k
            exp_rows.append([GH.get(f'B{r}', ''), GH.get(f'C{r}', ''), xl_format(GH.get(f'D{r}', ''), '#,##0'), GH.get(f'E{r}', '')])
        got_rows = [[x[0], x[2], x[3], x[4]] for x in rows]
        ck.ok(got_rows == exp_rows, '貼付状況 sheet / month / rows / status = golden 使い方 B16:E21',
              f'expected {exp_rows} got {got_rows}')
        n_ok = sum(1 for x in rows if x[4] == 'OK')
        ck.ok(n_ok == len(csvs) == sum(1 for x in exp_rows if x[3] == 'OK'), f'{len(csvs)} month(s) OK', str(n_ok))
        ck.ok(sum(1 for x in rows if x[1].endswith('.csv')) == len(csvs), 'each loaded slot shows its file name')

        # ---------------------------------------------------------------- the golden staff on the dashboard
        print('\n[dashboard vs golden ダッシュボード]')
        opts = page.eval_on_selector_all('#staff-select option', 'os => os.map(o => o.value)')
        ck.ok(len(opts) == len([1 for _ in roster_names(G)]), f'drop-down lists every named staff ({len(opts)})')
        page.select_option('#staff-select', staff)
        settled(page)
        dom = page.evaluate(DOM_CELLS, '#dash-host')
        exp = golden_expected(GD, dom, dash_format, GLYPH_AS_SWATCH)
        missing = sorted((k for k in GD if k not in dom), key=cell_rc)
        ck.ok(not missing, 'every golden dashboard cell is on the page', ', '.join(missing[:20]))
        ck.compare('dashboard cells', exp, dom)
        for k, label in [('B11', '出勤日数'), ('F11', '出勤率'), ('B15', 'summary sentence'), ('V7', '総合判定')]:
            ck.ok(dom.get(k) == exp[k], f'headline {label} ({k}) = {exp[k]!r}', repr(dom.get(k)))
        page.screenshot(path=str(out / '02_dashboard.png'), full_page=True)

        # ---------------------------------------------------------------- print the dashboard
        print('\n[print: dashboard]')
        page.evaluate("dispatchEvent(new Event('beforeprint'))")           # what Ctrl+P / the 印刷 button prepare
        pdom = page.evaluate(DOM_CELLS, '#print-root')
        pexp = golden_expected(GD, pdom, dash_format, GLYPH_AS_SWATCH)
        ck.compare('printed sheet cells', pexp, pdom)
        data = page.pdf(prefer_css_page_size=True, print_background=True)
        (out / 'dashboard.pdf').write_bytes(data)
        n, sizes = pdf_info(data)
        print(f'  dashboard PDF: {n} page(s), sizes {sizes} pt')
        ck.ok(n == 1 and sizes == [(595, 842)], 'dashboard prints to exactly 1 A4 portrait page', f'{n} pages {sizes}')
        pdf_to_png(data, out / '02p_dashboard_print.png')
        page.evaluate("dispatchEvent(new Event('afterprint'))")

        # ---------------------------------------------------------------- filter box
        print('\n[filter]')
        roster = roster_names(G)
        emp = xl_format(GD['J7'], '0')
        frag_name = staff.split(')')[-1][:2] if ')' in staff else staff[:2]
        # a 4-digit piece of the 従業員番号 (not starting with 0), and the same typed with a leading zero: D5 is a
        # General cell, so typed digits become a number and the message shows it without the zero (R-Q13)
        starts = [i for i in range(len(emp) - 3) if emp[i] != '0']
        num_frag = emp[starts[min(2, len(starts) - 1)]:][:4] if starts else emp
        tests = [frag_name, num_frag, '0' + num_frag, 'zzzz-no-match']
        for typed in tests:
            shown = str(int(typed)) if typed.isdigit() else typed
            page.fill('#filter-input', typed)
            page.wait_for_timeout(100)
            ql = shown.lower()
            hits = [nm for nm, no in roster if ql in nm.lower() or ql in no.lower()]
            if hits:
                want = f'　「{shown}」に一致 {len(hits)}名　― 下の▼から選んでください（空欄にすると全員に戻ります）'
            else:
                want = f'　「{shown}」に一致するスタッフはいません。▼は全員を表示しています'
            msg = page.inner_text('#d-filter-msg')
            ck.ok(msg == want, f'filter {typed!r}: message {want!r}', repr(msg))
            o = page.eval_on_selector_all('#staff-select option', 'os => os.map(o => o.value)')
            cur = page.eval_on_selector('#staff-select', 's => s.value')
            listed = [x for x in o if not (x == cur and x not in hits)] if hits else o
            if hits:
                ck.ok(sorted(listed) == sorted(hits), f'filter {typed!r}: drop-down = the {len(hits)} matching staff',
                      f'{len(listed)} listed')
            else:
                ck.ok(len(o) == len(roster), 'no match: drop-down falls back to everyone', str(len(o)))
            red = page.eval_on_selector('#d-filter-msg', 'e => e.classList.contains("bad")')
            ck.ok(red == (not hits), f'filter {typed!r}: message red only when nothing matches')
            if typed == frag_name:
                page.screenshot(path=str(out / '03_dashboard_filter.png'), clip={'x': 0, 'y': 0, 'width': 1440, 'height': 420})
        page.fill('#filter-input', '')
        page.wait_for_timeout(100)
        ck.ok(page.inner_text('#d-filter-msg') == '', 'clearing the filter clears the message')
        ck.ok(len(page.eval_on_selector_all('#staff-select option', 'os => os')) == len(roster), 'clearing the filter lists everyone again')

        # ---------------------------------------------------------------- other tabs (+ print)
        print('\n[tabs]')
        page.click('#tabbtn-howto')
        settled(page)
        page.screenshot(path=str(out / '04_howto_loaded.png'), full_page=True)

        page.click('#tabbtn-list')
        settled(page)
        page.screenshot(path=str(out / '05_list.png'), full_page=False)
        nrows = page.eval_on_selector_all('#staff-body tr', 'trs => trs.length')
        glist_rows = len([k for k in GL if re.fullmatch(r'B\d+', k) and cell_rc(k)[0] >= 6 and GL[k] != ''])
        ck.ok(nrows == glist_rows, f'スタッフ一覧 shows {glist_rows} staff', str(nrows))
        row = page.evaluate("""(name) => {
          for (const tr of document.querySelectorAll('#staff-body tr')) {
            const b = tr.querySelector('[data-col="B"]');
            if (b && b.textContent === name) { const o = {}; for (const td of tr.cells) o[td.dataset.col] = td.textContent; return o; }
          }
          return null; }""", staff)
        grow = next(cell_rc(k)[0] for k in GL if re.fullmatch(r'B\d+', k) and GL[k] == staff)
        lexp = {}
        for k, v in GL.items():
            m = re.fullmatch(r'([A-Z]+)(\d+)', k)
            if int(m.group(2)) == grow:
                lexp[m.group(1)] = xl_format(v, LIST_FORMATS.get(m.group(1))) if not isinstance(v, str) else v
        lact = {c: (row or {}).get(c) for c in lexp}
        bad = [(c, lexp[c], lact[c]) for c in lexp if lexp[c] != lact[c]]
        ck.ok(row is not None and not bad, f'スタッフ一覧 row of the selected staff: {len(lexp) - len(bad)}/{len(lexp)} columns match',
              '; '.join(f'{c}: expected {e!r} got {g!r}' for c, e, g in bad[:10]))
        hdr = page.eval_on_selector_all('#staff-head th', 'ths => ths.map(th => [th.dataset.col, th.firstChild.textContent])')
        hexp = [[re.match(r'[A-Z]+', k).group(0), GL[k]] for k in sorted((k for k in GL if re.fullmatch(r'[A-Z]+5', k)), key=cell_rc)]
        ck.ok(hdr == hexp, 'スタッフ一覧 header row = golden row 5', f'{hdr[:3]} … vs {hexp[:3]} …')
        ck.ok(page.inner_text('#list-period') == GL['A2'], 'スタッフ一覧 period line = golden A2')
        page.fill('#list-q', emp)
        page.wait_for_timeout(100)
        ck.ok(page.inner_text('#list-count') == f'表示 1 / {glist_rows} 名', 'スタッフ一覧 search by 従業員番号 finds 1 row',
              page.inner_text('#list-count'))
        page.fill('#list-q', '')
        page.evaluate("dispatchEvent(new Event('beforeprint'))")
        data = page.pdf(prefer_css_page_size=True, print_background=True)
        (out / 'staff_list.pdf').write_bytes(data)
        n_list, sizes = pdf_info(data)
        print(f'  スタッフ一覧 PDF: {n_list} page(s), sizes {sizes} pt')
        ck.ok(n_list >= 1 and sizes == [(842, 595)], 'スタッフ一覧 prints on A4 landscape', f'{n_list} pages {sizes}')
        pdf_to_png(data, out / '05p_list_print_p1.png')
        page.evaluate("dispatchEvent(new Event('afterprint'))")

        page.click('#tabbtn-sum')
        settled(page)
        page.screenshot(path=str(out / '06_summary.png'), full_page=True)
        sdom = page.evaluate(DOM_CELLS, '#sum-host')
        sexp = golden_expected(GS, sdom, sum_format)
        ck.compare('全体サマリー cells', sexp, sdom)
        page.evaluate("dispatchEvent(new Event('beforeprint'))")
        data = page.pdf(prefer_css_page_size=True, print_background=True)
        (out / 'summary.pdf').write_bytes(data)
        n_sum, sizes = pdf_info(data)
        print(f'  全体サマリー PDF: {n_sum} page(s), sizes {sizes} pt')
        ck.ok(n_sum == 1 and sizes == [(842, 595)], '全体サマリー prints to 1 A4 landscape page', f'{n_sum} pages {sizes}')
        pdf_to_png(data, out / '06p_summary_print.png')
        page.evaluate("dispatchEvent(new Event('afterprint'))")

        page.click('#tabbtn-hol')
        settled(page)
        page.screenshot(path=str(out / '08_holidays.png'), full_page=False)
        msgs = page.eval_on_selector_all('#hol-msgs li', 'ls => ls.map(l => l.textContent)')
        hexp = [G['祝日・繁忙日'].get(f'A{r}', '') for r in (12, 13, 14, 15)]
        ck.ok(msgs == [x for x in hexp if x != ''], '祝日・繁忙日 self-checks = golden A12:A15', f'{msgs} vs {hexp}')

        # ---------------------------------------------------------------- change a setting → recompute
        print('\n[settings]')
        page.click('#tabbtn-set')
        settled(page)
        page.screenshot(path=str(out / '07_settings.png'), full_page=True)
        tdom = page.evaluate(DOM_CELLS, '#set-host')
        ck.compare('設定 cells (labels, values as displayed, row counts)', golden_expected(G['設定'], tdom, set_format), tdom)
        att = GD['F11']
        good_t, warn_t = 0.95, 0.9                          # default ◎ / △ 基準 (設定!B3 / B4)
        if GD['V7'] == '参考値':
            # the golden staff is below 判定保留の日数 → change that setting (0 = always judge) instead
            label, default_text, new_text = '判定を保留する確定シフト日数（この日数未満は「参考値」）', '20', '0'
        elif att < warn_t:
            # ✕ 要改善 → lower the △ 基準 to this person's 出勤率 (whole percent, rounded down)
            warn_t = int(att * 100) / 100
            label, default_text, new_text = '出勤率 △注意 の基準（この値以上）', '90%', xl_format(warn_t, '0%')
        else:
            # raise the ◎ 基準 above this person's 出勤率
            good_t = 0.995 if att < 0.995 else 0.999
            label, default_text, new_text = '出勤率 ◎良好 の基準（この値以上）', '95%', xl_format(good_t, '0.0%')
        good = page.locator(f'input[aria-label="{label}"]')
        ck.ok(good.input_value() == default_text, f'設定 「{label}」 shows the default {default_text}', good.input_value())
        good.fill(new_text)
        good.press('Enter')
        ck.ok(wait_until(page, "document.getElementById('set-msg').textContent.indexOf('反映') >= 0", 10000),
              'settings message confirms the recompute', page.inner_text('#set-msg'))
        settled(page)
        page.click('#tabbtn-dash')
        settled(page)
        badge = '◎ 良好' if att >= good_t else ('△ 注意' if att >= warn_t else '✕ 要改善')
        crit = f'◎ {xl_format(good_t, "0%")}以上／△ {xl_format(warn_t, "0%")}以上'
        ck.ok(badge != GD['V7'], f'the change moves 総合判定 from {GD["V7"]!r}')
        ck.ok(wait_text(page, '#dash-host [data-cell="V7"]', badge), f'dashboard recomputed: 総合判定 → {badge!r}',
              page.inner_text('#dash-host [data-cell="V7"]'))
        ck.ok(page.inner_text('#dash-host [data-cell="V8"]') == crit, f'dashboard recomputed: criteria → {crit!r}',
              page.inner_text('#dash-host [data-cell="V8"]'))
        ck.ok(page.inner_text('#dash-host [data-cell="B11"]') == xl_format(GD['B11'], '0"日"'), '出勤日数 unchanged by the threshold')
        page.screenshot(path=str(out / '09_dashboard_after_setting.png'), clip={'x': 0, 'y': 0, 'width': 1440, 'height': 480})
        page.click('#tabbtn-list')
        settled(page)
        jd = page.evaluate("""(name) => { for (const tr of document.querySelectorAll('#staff-body tr')) {
            const b = tr.querySelector('[data-col="B"]'); if (b && b.textContent === name) return tr.querySelector('[data-col="K"]').textContent; } return null; }""", staff)
        ck.ok(jd == badge, f'スタッフ一覧 判定 recomputed → {badge!r}', repr(jd))

        # ---------------------------------------------------------------- persistence across a reload
        print('\n[reload]')
        page.reload()
        settled(page)
        ck.ok(page.locator('#tab-howto').is_visible(), 'after reload: lands on 使い方 (no data kept)')
        st = page.eval_on_selector_all('#paste-body tr', 'trs => trs.map(tr => tr.cells[4].textContent)')
        ck.ok(all(x == '未貼付' for x in st), 'after reload: the CSV data is gone (memory only)', str(st))
        page.click('#tabbtn-set')
        settled(page)
        ck.ok(good.input_value() == new_text, f'after reload: 「{label}」 kept as {new_text}', good.input_value())
        page.set_input_files('#file-input', csvs)
        wait_until(page, "!document.getElementById('tab-dash').hidden && document.getElementById('busy').hidden", 60000)
        settled(page)
        page.select_option('#staff-select', staff)
        settled(page)
        ck.ok(page.inner_text('#dash-host [data-cell="V7"]') == badge, 'after reload + re-load of the CSVs: the kept setting is used',
              page.inner_text('#dash-host [data-cell="V7"]'))
        page.click('#tabbtn-set')
        settled(page)
        page.click('#btn-set-default')                     # confirm() is accepted by the dialog handler
        settled(page)
        page.wait_for_timeout(300)
        settled(page)
        ck.ok(good.input_value() == default_text, f'既定値に戻す restores {default_text}', good.input_value())
        page.click('#tabbtn-dash')
        settled(page)
        ck.ok(wait_text(page, '#dash-host [data-cell="V7"]', GD['V7']), f'… and the dashboard is back to {GD["V7"]!r}')
        dom = page.evaluate(DOM_CELLS, '#dash-host')
        ck.compare('dashboard cells after restoring defaults', golden_expected(GD, dom, dash_format, GLYPH_AS_SWATCH), dom)

        if a.print_all:
            print('\n[print all]')
            page.click('#btn-print-all')
            wait_until(page, "document.body.classList.contains('pt-sheet') && document.getElementById('busy').hidden", 600000, 500)
            cnt = page.evaluate("document.querySelectorAll('#print-root .print-sheet').length")
            data = page.pdf(prefer_css_page_size=True, print_background=True)
            (out / 'all.pdf').write_bytes(data)
            n_all, sizes = pdf_info(data)
            print(f'  全員分 PDF: {cnt} sheets, {n_all} page(s), sizes {sizes} pt')
            ck.ok(n_all == cnt == len(set(opts)) and sizes == [(595, 842)], '全員分を印刷: one A4 portrait page per staff',
                  f'{cnt} sheets {n_all} pages {sizes}')
            page.evaluate("dispatchEvent(new Event('afterprint'))")
        br.close()

    print('\n[network / console]')
    others = [u for u in requests if unquote(u) != unquote(page_url)]
    ck.ok(not others, f'no network requests (only the page itself was loaded; {len(requests)} request(s) in total)', str(others[:5]))
    ck.ok(not failed, 'no failed requests', str(failed[:5]))
    ck.ok(not console_errors, 'no console errors / page errors', ' | '.join(console_errors[:10]))
    print(f'\nscreenshots and PDFs: {out}')
    print(f'RESULT: {"OK" if not ck.fails else "FAIL"}  ({ck.n - len(ck.fails)}/{ck.n} checks passed)')
    for f in ck.fails:
        print('  -', f[:400])
    return 0 if not ck.fails else 1


if __name__ == '__main__':
    sys.exit(main())
