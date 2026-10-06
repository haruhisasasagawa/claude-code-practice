#!/usr/bin/env python3
"""Bundle src/ into dist/勤務実績ダッシュボード.html — one self-contained file, no external requests.

    python3 build.py            # build
    python3 build.py --check    # build and fail on any warning (missing engine file, external URL)

The page template src/ui/index.html carries two markers:
    <!--STYLE-->   replaced by <style>…src/ui/style.css…</style>
    <!--SCRIPT-->  replaced by one <script> per source file, engine first (order below), then the UI
Each file gets its own <script> element so a syntax error in one engine file cannot stop the UI from
starting (the UI then reports the missing engine function on screen).
"""
import datetime
import pathlib
import re
import sys

APP = pathlib.Path(__file__).resolve().parent
SRC = APP / 'src'
DIST = APP / 'dist'
OUT = DIST / '勤務実績ダッシュボード.html'

ENGINE = ['csv.js', 'holidays.js', 'calc.js', 'roster.js', 'view.js', 'index.js']
UI_JS = ['charts.js', 'app.js']

# strings that are not requests (SVG namespace used with createElementNS)
ALLOWED_URLS = {'http://www.w3.org/2000/svg'}


def read(p: pathlib.Path) -> str:
    return p.read_text(encoding='utf-8')


def script_safe(code: str, name: str, problems: list) -> str:
    """Make a JS source safe to sit inside <script>…</script>."""
    if '<!--' in code:
        problems.append(f'{name}: contains "<!--" — rewrite it (it can confuse the HTML script parser)')
    # "</script" would close the element early; "<\/script" is the same string / regex in JS
    return re.sub(r'</(script)', r'<\\/\1', code, flags=re.I)


def main(argv):
    strict = '--check' in argv
    problems, warnings = [], []
    tpl = read(SRC / 'ui' / 'index.html')
    for marker in ('<!--STYLE-->', '<!--SCRIPT-->'):
        if tpl.count(marker) != 1:
            problems.append(f'index.html must contain {marker} exactly once')
    css = read(SRC / 'ui' / 'style.css')
    if re.search(r'</style', css, re.I):
        problems.append('style.css contains "</style"')
    if re.search(r'@import|url\(\s*["\']?(?!data:)', css, re.I):
        problems.append('style.css references an external resource (@import / url())')

    parts = []
    for name in ENGINE:
        p = SRC / 'engine' / name
        if not p.exists():
            warnings.append(f'engine file missing: src/engine/{name} (bundled without it)')
            continue
        parts.append((f'engine/{name}', read(p)))
    for name in UI_JS:
        p = SRC / 'ui' / name
        if not p.exists():
            problems.append(f'ui file missing: src/ui/{name}')
            continue
        parts.append((f'ui/{name}', read(p)))

    scripts = []
    for label, code in parts:
        code = script_safe(code, label, problems)
        scripts.append(f'<script>/* {label} */\n{code}\n</script>')

    build_id = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    html = tpl.replace('<!--STYLE-->', '<style>\n' + css + '\n</style>', 1)
    html = html.replace('<!--SCRIPT-->', '\n'.join(scripts), 1)
    html = html.replace('<!--BUILD-->', build_id)

    # offline guarantee: no external URLs in attributes, CSS or code
    for m in re.finditer(r'(?:https?:)?//[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"\'<>)]*', html):
        url = m.group(0)
        if url in ALLOWED_URLS:
            continue
        ctx = html[max(0, m.start() - 40):m.end() + 10].replace('\n', ' ')
        # protocol-relative matches inside JS comments / regexes are not requests, but flag them anyway
        warnings.append(f'URL-like text in output: {url!r} … {ctx!r}')
    if re.search(r'\s(src|href)\s*=\s*["\']?(?!#|data:|blob:)[a-z]+:', html, re.I):
        problems.append('an element references an external resource (src/href with a scheme)')
    if 'Content-Security-Policy' not in html:
        problems.append('CSP meta tag missing from index.html')

    for w in warnings:
        print('WARNING:', w)
    if problems:
        for p in problems:
            print('ERROR:', p)
        return 1
    DIST.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    size = OUT.stat().st_size
    print(f'wrote {OUT.relative_to(APP)} ({size:,} bytes; {len(parts)} scripts; build {build_id})')
    if strict and warnings:
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
