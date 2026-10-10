/* 共通ユーティリティ（DOM非依存） */
;(function (global) {
  'use strict';

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  // base をベースに inc を再帰マージ。配列は inc 側で丸ごと置き換える。
  function deepMerge(base, inc) {
    if (!isObj(base) || !isObj(inc)) return inc === undefined ? base : inc;
    const out = Object.assign({}, base);
    Object.keys(inc).forEach(function (k) {
      out[k] = isObj(base[k]) && isObj(inc[k]) ? deepMerge(base[k], inc[k]) : inc[k];
    });
    return out;
  }

  function tokens(path) {
    return String(path).match(/[^.\[\]]+/g) || [];
  }

  function getPath(obj, path) {
    return tokens(path).reduce(function (o, k) {
      return o == null ? undefined : o[k];
    }, obj);
  }

  function setPath(obj, path, val) {
    const t = tokens(path);
    let o = obj;
    for (let i = 0; i < t.length - 1; i++) {
      const k = t[i];
      if (o[k] == null || typeof o[k] !== 'object') {
        o[k] = /^\d+$/.test(t[i + 1]) ? [] : {};
      }
      o = o[k];
    }
    o[t[t.length - 1]] = val;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // "{name}" 形式のプレースホルダーを置換。未定義は「未入力」にする。
  function fill(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, function (m, k) {
      const v = vars ? vars[k] : undefined;
      return v === undefined || v === null || v === '' ? '未入力' : String(v);
    });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtDate(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
  }

  function fmtDateTime(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x.getTime())) return '';
    return x.getFullYear() + '/' + pad2(x.getMonth() + 1) + '/' + pad2(x.getDate()) +
      ' ' + pad2(x.getHours()) + ':' + pad2(x.getMinutes());
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  global.RecruitUtil = {
    deepClone: deepClone,
    deepMerge: deepMerge,
    isObj: isObj,
    getPath: getPath,
    setPath: setPath,
    esc: esc,
    fill: fill,
    fmtDate: fmtDate,
    fmtDateTime: fmtDateTime,
    uid: uid
  };
})(window);
