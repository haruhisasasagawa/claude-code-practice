/*
 * 日付印（ハンコ）の SVG
 * ----------------------------------------------------------------------
 * アプリ（Step2/Step4 の「応募者の管理」）と保存レポート（レポート上でも押印できる）の両方で使う。
 * レポートには stampSvg の関数ソースをそのまま埋め込むため、stampSvg は外部参照を持たない純関数にしておくこと。
 */
;(function (global) {
  'use strict';

  // opts: { name, title, date, size, color, id }
  function stampSvg(opts) {
    opts = opts || {};
    var esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    };
    var chars = function (s) { return Array.from ? Array.from(String(s)).length : String(s).length; };
    var name = String(opts.name || '').trim();
    var title = String(opts.title || '').trim();
    var date = String(opts.date || '').trim();
    var size = Number(opts.size) || 88;
    var color = opts.color || '#c8232c';
    var id = String(opts.id || ('hk' + chars(name) + chars(title) + date.replace(/\D/g, '')));
    // 文字幅の目安（em）。ASCII・半角カナは約 0.6em、それ以外（漢字・かな）は 1em
    var units = function (str) {
      var u = 0;
      (Array.from ? Array.from(str) : String(str).split('')).forEach(function (ch) {
        var c = ch.charCodeAt(0);
        u += c < 0x80 || (c >= 0xff61 && c <= 0xff9f) ? 0.62 : 1;
      });
      return u;
    };
    // 外周（r=42・線幅3 → 内側の縁 40.5）の内側に、にじみ分の余白を取った半径
    var R = 38.5;
    // 文字の上端・下端の高さで使える弦の幅を超えるときだけ textLength で詰める
    var fitAttr = function (str, s, base) {
      var top = base - 0.88 * s, bottom = base + 0.12 * s;
      var dy = Math.max(Math.abs(50 - top), Math.abs(bottom - 50));
      var cap = 2 * Math.sqrt(Math.max(0, R * R - dy * dy));
      return units(str) * s > cap ? ' textLength="' + cap.toFixed(1) + '" lengthAdjust="spacingAndGlyphs"' : '';
    };
    var nu = units(name);
    var nameSize = nu <= 2 ? 18 : nu <= 3 ? 15 : nu <= 4 ? 12 : nu <= 6 ? 10 : 9;
    var nameBase = 32;
    var tu = units(title);
    var titleSize = tu <= 3 ? 11 : tu <= 5 ? 9.5 : tu <= 7 ? 8 : tu <= 9 ? 7 : 6;
    var titleBase = 75 + titleSize * 0.38;
    var font = "'Hiragino Mincho ProN','Hiragino Mincho Pro','Yu Mincho','YuMincho','MS Mincho','Noto Serif JP',serif";
    return '<svg class="hanko" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(name + ' ' + date + ' ' + title) + '">' +
      '<defs><filter id="' + esc(id) + '" x="-10%" y="-10%" width="120%" height="120%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter></defs>' +
      '<g filter="url(#' + esc(id) + ')" transform="rotate(-6 50 50)" opacity="0.93">' +
        '<circle cx="50" cy="50" r="42" fill="none" stroke="' + esc(color) + '" stroke-width="3"/>' +
        '<line x1="11" y1="36" x2="89" y2="36" stroke="' + esc(color) + '" stroke-width="1.5"/>' +
        '<line x1="11" y1="64" x2="89" y2="64" stroke="' + esc(color) + '" stroke-width="1.5"/>' +
        '<g fill="' + esc(color) + '" font-family="' + font + '" font-weight="700" text-anchor="middle">' +
          '<text x="50" y="' + nameBase + '" font-size="' + nameSize + '"' + fitAttr(name, nameSize, nameBase) + '>' + esc(name) + '</text>' +
          '<text x="50" y="54" font-size="11.5" letter-spacing="0.4">' + esc(date) + '</text>' +
          '<text x="50" y="' + titleBase.toFixed(1) + '" font-size="' + titleSize + '"' + fitAttr(title, titleSize, titleBase) + '>' + esc(title) + '</text>' +
        '</g>' +
      '</g></svg>';
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // 押印の日付表記（YYYY.MM.DD）
  function stampDate(d) {
    var x = d instanceof Date ? d : new Date(d || Date.now());
    return x.getFullYear() + '.' + pad2(x.getMonth() + 1) + '.' + pad2(x.getDate());
  }

  // 氏名から印字名（姓）を作る。「笹川 晴央」→「笹川」、スペースが無ければ 4 文字まで
  function shortName(name) {
    var s = String(name || '').trim();
    var head = s.split(/[\s　]+/)[0] || '';
    if (!head) return '';
    var arr = Array.from ? Array.from(head) : head.split('');
    return arr.length <= 4 ? head : arr.slice(0, 2).join('');
  }

  // 押印エントリ { name, short, title, date, at } → SVG
  function render(entry, opts) {
    if (!entry || !entry.name) return '';
    return stampSvg(Object.assign({ name: entry.short || shortName(entry.name), title: entry.title || '', date: entry.date || '' }, opts || {}));
  }

  global.RecruitStamp = {
    svg: stampSvg,
    render: render,
    stampDate: stampDate,
    shortName: shortName,
    // レポートに埋め込む関数ソース（stampSvg は外部参照なし）
    source: function () { return stampSvg.toString() + '\n' + shortName.toString(); }
  };
})(window);
