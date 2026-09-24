#!/usr/bin/env python3
"""Bundle src/ into one self-contained HTML file (images, CSS, JS and
subsetted web fonts inlined) so the deck opens offline on any PC.

    python3 build.py            # -> TOHO_Shinjuku_Summit2026.html
    python3 build.py --no-fonts # skip font download (falls back to system fonts)
"""
import base64
import hashlib
import pathlib
import re
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "TOHO_Shinjuku_Summit2026.html"
CACHE = ROOT / ".fontcache"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# family -> weights to embed
FONTS = {
    "Noto Sans JP": [400, 700, 900],
    "Inter Tight": [500, 700, 800],
    "JetBrains Mono": [500],
}
ASCII = "".join(chr(c) for c in range(0x20, 0x7F))
LATIN_EXTRA = "→←×®©·—–’“”•…°％"


def data_uri(path: pathlib.Path) -> str:
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[path.suffix[1:].lower()]
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def font_css(family: str, weights, chars: str) -> str:
    """Download subset fonts from the Google Fonts CSS2 API (text= subsetting),
    chunked so URLs stay short; each chunk gets its own unicode-range."""
    CACHE.mkdir(exist_ok=True)
    chars = "".join(sorted(set(chars)))
    chunks = [chars[i:i + 220] for i in range(0, len(chars), 220)]
    out = []
    for w in weights:
        for chunk in chunks:
            q = urllib.parse.urlencode({"family": f"{family}:wght@{w}", "text": chunk, "display": "block"})
            css = fetch("https://fonts.googleapis.com/css2?" + q).decode()
            m = re.search(r"src:\s*url\((.+?)\)\s*format\('(\w+)'\)", css)
            if not m:
                raise RuntimeError(f"no font url for {family} {w}")
            url, fmt = m.group(1), m.group(2)
            key = hashlib.sha256(url.encode()).hexdigest()[:32] + ".woff2"
            cached = CACHE / key
            if not cached.exists():
                cached.write_bytes(fetch(url))
            b64 = base64.b64encode(cached.read_bytes()).decode()
            ranges = ",".join(f"U+{ord(c):X}" for c in chunk)
            out.append(
                f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{w};font-display:block;"
                f"src:url(data:font/{fmt};base64,{b64}) format('{fmt}');unicode-range:{ranges};}}"
            )
    return "\n".join(out)


def main():
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    talk = (SRC / "script-data.js").read_text(encoding="utf-8")
    app = (SRC / "app.js").read_text(encoding="utf-8")

    # fonts: subset to every character used anywhere in the deck
    font_block = ""
    if "--no-fonts" not in sys.argv:
        text = re.sub(r"<[^>]+>", " ", html) + talk + app + css
        jp_chars = set(text) | set(ASCII) | set(LATIN_EXTRA)
        jp_chars = "".join(c for c in jp_chars if ord(c) >= 0x20 and c not in "　")
        parts = [font_css("Noto Sans JP", FONTS["Noto Sans JP"], jp_chars + "　")]
        latin = ASCII + LATIN_EXTRA
        parts.append(font_css("Inter Tight", FONTS["Inter Tight"], latin))
        parts.append(font_css("JetBrains Mono", FONTS["JetBrains Mono"], latin))
        font_block = '<style id="font-data">\n' + "\n".join(parts) + "\n</style>"
    html = html.replace("<!--FONTS-->", font_block)

    # images -> data URIs (HTML src and CSS url())
    def img_sub(m):
        return m.group(1) + data_uri(SRC / m.group(2)) + m.group(3)
    html = re.sub(r'(src=")(img/[^"]+)(")', img_sub, html)
    css = re.sub(r"(url\()(img/[^)]+)(\))", img_sub, css)

    html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "\n</style>")
    html = html.replace('<script src="script-data.js"></script>', "<script>\n" + talk + "\n</script>")
    html = html.replace('<script src="app.js"></script>', "<script>\n" + app + "\n</script>")

    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.name}: {OUT.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
