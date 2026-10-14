/*
 * 日付印（ハンコ）と最終合否スタンプの SVG
 * ----------------------------------------------------------------------
 * アプリ（③ 報告書の「応募者の管理」「最終合否」）と保存レポート（レポート上でも押印・合否を押せる）の両方で使う。
 * レポートには stampSvg / shortName / verdictSvg / decisionSheetHtml / decisionFilename の関数ソースをそのまま埋め込むため、
 * これらは外部参照を持たない純関数（ES5）にしておくこと（decisionSheetHtml が verdictSvg を呼ぶことだけ許す）。
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

  // 最終合否スタンプ（採用／不採用）。opts: { label, date, color, size, id, sub }
  // 角丸の長方形・二重枠・太字ゴシックの表示名・下段に日付（＋副文）・わずかな回転・にじみ
  function verdictSvg(opts) {
    opts = opts || {};
    var esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    };
    var list = function (str) { return Array.from ? Array.from(String(str)) : String(str).split(''); };
    // 文字幅の目安（em）。ASCII・半角カナは約 0.62em、それ以外は 1em
    var units = function (str) {
      var u = 0;
      list(str).forEach(function (ch) {
        var c = ch.charCodeAt(0);
        u += c < 0x80 || (c >= 0xff61 && c <= 0xff9f) ? 0.62 : 1;
      });
      return u;
    };
    var label = String(opts.label == null ? '採用' : opts.label).trim();
    var date = String(opts.date || '').trim();
    var sub = String(opts.sub || '').trim();
    var size = Number(opts.size) || 120;
    var color = opts.color || '#c8232c';
    var id = String(opts.id || ('vd' + list(label).length + date.replace(/\D/g, '')));
    var W = size, H = Math.round(size * 76 / 120);
    var lower = [date, sub].filter(function (x) { return !!x; }).join(' ');
    var aria = [label, date, sub].filter(function (x) { return !!x; }).join(' ');
    var lu = units(label);
    var fs = lu <= 2 ? 28 : lu <= 3 ? 24 : lu <= 4 ? 20 : 18;
    var ls = lu <= 2 ? 4 : lu <= 3 ? 2 : lu <= 4 ? 1 : 0;
    var fit = lu * fs + ls * Math.max(0, list(label).length - 1) > 88 ? ' textLength="88" lengthAdjust="spacingAndGlyphs"' : '';
    var fit2 = units(lower) * 10 > 86 ? ' textLength="86" lengthAdjust="spacingAndGlyphs"' : '';
    var font = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','YuGothic',Meiryo,'Noto Sans JP',sans-serif";
    var c = esc(color);
    return '<svg class="verdict-stamp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 76" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(aria) + '">' +
      '<defs><filter id="' + esc(id) + '" x="-10%" y="-10%" width="120%" height="120%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter></defs>' +
      '<g filter="url(#' + esc(id) + ')" transform="rotate(-3 60 38)" opacity="0.93">' +
        '<rect x="6" y="6" width="108" height="64" rx="9" fill="none" stroke="' + c + '" stroke-width="3.2"/>' +
        '<rect x="11" y="11" width="98" height="54" rx="6" fill="none" stroke="' + c + '" stroke-width="1.2"/>' +
        (lower ? '<line x1="18" y1="50" x2="102" y2="50" stroke="' + c + '" stroke-width="1"/>' : '') +
        '<g fill="' + c + '" font-family="' + font + '" font-weight="800" text-anchor="middle">' +
          '<text x="60" y="' + (lower ? '42.5' : '48') + '" font-size="' + fs + '" letter-spacing="' + ls + '"' + fit + '>' + esc(label) + '</text>' +
          (lower ? '<text x="60" y="61" font-size="10" letter-spacing="0.4"' + fit2 + '>' + esc(lower) + '</text>' : '') +
        '</g>' +
      '</g></svg>';
  }

  // A4 報告（面接チェックリスト報告）の【判定サマリー】右端に置く最終合否のブロック（外側の div を含む）
  // dec: 正規化済みの decision または null / o: { id, svgId, title, hireLabel, rejectLabel, hireColor, rejectColor, sub, size }
  function decisionSheetHtml(dec, o) {
    o = o || {};
    var esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    };
    var title = o.title || '最終合否';
    var idAttr = o.id ? ' id="' + esc(o.id) + '"' : '';
    if (!dec || (dec.result !== 'hire' && dec.result !== 'reject')) {
      return '<div class="cl-decision is-none"' + idAttr + ' data-result=""><div class="cl-dec-empty"><span>' + esc(title) + '</span><span>未押印</span></div></div>';
    }
    var hire = dec.result === 'hire';
    var color = hire ? (o.hireColor || '#c8232c') : (o.rejectColor || '#1f4e8c');
    var label = dec.label || (hire ? (o.hireLabel || '採用') : (o.rejectLabel || '不採用'));
    var by = dec.by || {};
    var name = String(by.name || '').trim();
    var btitle = String(by.title || '').trim();
    var svg = verdictSvg({ label: label, date: dec.date || '', color: color, size: o.size || 64, id: o.svgId || ((o.id || 'cl') + 'Svg'), sub: o.sub || '' });
    return '<div class="cl-decision is-' + dec.result + '"' + idAttr + ' data-result="' + dec.result + '">' +
      '<div class="cl-dec-stamp">' + svg + '</div>' +
      '<div class="cl-dec-meta">' +
        '<span class="cl-dec-kv"><span class="cl-dec-k">' + esc(title) + '</span><b class="cl-dec-v" style="color:' + esc(color) + '">' + esc(label) + '</b></span>' +
        (name ? '<span class="cl-dec-by">' + esc(name) + (btitle ? '（' + esc(btitle) + '）' : '') + '</span>' : '') +
        '<span class="cl-dec-date">' + esc(dec.date || '') + '</span>' +
      '</div></div>';
  }

  // 合否付きの保存ファイル名。基本名_採用.html / 基本名_不採用.html（既に付いている接尾辞は置き換える。冪等）
  // o: { filenameSuffix, hireLabel, rejectLabel }
  function decisionFilename(fn, dec, o) {
    o = o || {};
    var clean = function (s) { return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_'); };
    var name = String(fn || '');
    var m = name.match(/\.html?$/i);
    var ext = m ? m[0] : '.html';
    var base = m ? name.slice(0, name.length - ext.length) : name;
    var ok = !!dec && (dec.result === 'hire' || dec.result === 'reject');
    var cands = ['不採用', '採用', o.rejectLabel, o.hireLabel, ok ? dec.label : '']
      .map(function (x) { return clean(x); })
      .filter(function (x, i, arr) { return !!x && arr.indexOf(x) === i; })
      .sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < cands.length; i++) {
      var suf = '_' + cands[i];
      if (base.length > suf.length && base.slice(base.length - suf.length) === suf) { base = base.slice(0, base.length - suf.length); break; }
    }
    if (o.filenameSuffix !== false && ok) {
      base += '_' + clean(dec.label || (dec.result === 'hire' ? (o.hireLabel || '採用') : (o.rejectLabel || '不採用')));
    }
    return base + ext;
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
    verdict: verdictSvg,
    decisionSheet: decisionSheetHtml,
    decisionFilename: decisionFilename,
    // レポートに埋め込む関数ソース（いずれも外部参照なし。decisionSheetHtml → verdictSvg のみ）
    source: function () {
      return [stampSvg, shortName, verdictSvg, decisionSheetHtml, decisionFilename].map(function (f) { return f.toString(); }).join('\n');
    }
  };
})(window);
