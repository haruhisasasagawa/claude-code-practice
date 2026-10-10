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
    var nl = chars(name);
    var nameSize = nl <= 2 ? 22 : nl === 3 ? 18 : nl === 4 ? 15 : nl <= 6 ? 12 : 10;
    var tl = chars(title);
    var titleSize = tl <= 3 ? 11 : tl <= 5 ? 9.5 : tl <= 7 ? 8 : 7;
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
          '<text x="50" y="' + (22 + nameSize * 0.36).toFixed(1) + '" font-size="' + nameSize + '"' + (nl >= 5 ? ' textLength="70" lengthAdjust="spacingAndGlyphs"' : '') + '>' + esc(name) + '</text>' +
          '<text x="50" y="54" font-size="11.5" letter-spacing="0.4">' + esc(date) + '</text>' +
          '<text x="50" y="' + (78 + titleSize * 0.36).toFixed(1) + '" font-size="' + titleSize + '">' + esc(title) + '</text>' +
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
