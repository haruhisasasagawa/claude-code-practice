/*
 * 保存・読込
 * ----------------------------------------------------------------------
 * - 劇場プロファイル: localStorage に保存。JSON ファイルで書き出し／読み込み。
 * - 応募者レコード  : 人が読めるHTMLレポートとして保存し、同じファイルに
 *                    <script type="application/json" id="recruit-record"> で元データを埋め込む。
 *                    読み込み時はこのJSONを取り出すだけなので、見た目を変えても壊れない。
 */
;(function (global) {
  'use strict';

  const U = global.RecruitUtil;
  const PROFILE_KEY = 'recruit.profile.v1';
  const THEME_KEY = 'recruit.theme';
  const RECORD_KIND = 'recruit-applicant-record';

  function defaults() {
    return U.deepClone(global.RECRUIT_DEFAULT_PROFILE);
  }

  // 既定値に不足キーを補う。既定に追加された新ルールも末尾に追加する。
  function normalizeProfile(p) {
    const base = defaults();
    const merged = U.deepMerge(base, p || {});
    merged.handoffRules = Array.isArray(merged.handoffRules) ? merged.handoffRules : [];
    const ids = {};
    merged.handoffRules.forEach(function (r) { if (r && r.id) ids[r.id] = true; });
    base.handoffRules.forEach(function (r) { if (!ids[r.id]) merged.handoffRules.push(U.deepClone(r)); });
    if (!Array.isArray(merged.evaluation.items) || !merged.evaluation.items.length) {
      merged.evaluation.items = U.deepClone(base.evaluation.items);
    }
    return merged;
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return defaults();
      return normalizeProfile(JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }

  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* 保存不可環境 */ }
  }

  function resetProfile() {
    try { localStorage.removeItem(PROFILE_KEY); } catch (e) { /* noop */ }
    return defaults();
  }

  function parseProfileJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !obj.meta || !obj.handoffRules) {
      throw new Error('劇場プロファイルの形式ではありません。');
    }
    return normalizeProfile(obj);
  }

  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) || ''; } catch (e) { return ''; }
  }

  function saveTheme(t) {
    try { if (t) localStorage.setItem(THEME_KEY, t); else localStorage.removeItem(THEME_KEY); } catch (e) { /* noop */ }
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || '応募者';
  }

  // ---------- 応募者レコード ----------
  function buildRecord(state) {
    const h = state.handoff;
    return {
      kind: RECORD_KIND,
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      profile: { theaterName: state.profile.meta.theaterName, version: state.profile.meta.version },
      step: state.step,
      applicant: U.deepClone(state.applicant),
      handoff: {
        items: h ? h.items.map(function (i) { return { id: i.id, severity: i.severity, category: i.category, text: i.text }; }) : [],
        strengths: h ? h.strengths.map(function (s) { return s.text; }) : [],
        checks: U.deepClone(state.handoffChecks || {}),
        note: state.handoffNote || ''
      },
      scores: U.deepClone(state.scores || {}),
      interviewNotes: state.interviewNotes || '',
      judgment: state.judgment ? U.deepClone(state.judgment) : null
    };
  }

  function parseRecordFromHTML(html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const node = doc.querySelector('script#recruit-record[type="application/json"]');
      if (!node) return null;
      const rec = JSON.parse(node.textContent);
      return rec && rec.kind === RECORD_KIND ? rec : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- HTMLレポート生成 ----------
  function generateReportHTML(record, profile) {
    const R = global.RecruitRules;
    const esc = U.esc;
    const a = record.applicant;
    const meta = profile.meta;
    const name = a.name ? a.name + 'さん' : '応募者';
    const savedAt = U.fmtDateTime(record.savedAt);

    const rows = R.describeApplicant(a, profile).map(function (r) {
      return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>';
    }).join('');

    const sevLabel = function (s) { return (R.SEVERITY[s] || R.SEVERITY.info).label; };
    const handoffItems = (record.handoff.items || []).map(function (i) {
      const done = !!record.handoff.checks[i.id];
      return '<li class="h ' + esc(i.severity) + (done ? ' done' : '') + '">' +
        '<span class="box">' + (done ? '☑' : '☐') + '</span>' +
        '<span class="sev">' + esc(sevLabel(i.severity)) + '</span>' +
        '<span class="cat">' + esc(R.CATEGORY_LABELS[i.category] || i.category) + '</span>' +
        '<span class="txt">' + esc(i.text) + '</span></li>';
    }).join('');
    const strengths = (record.handoff.strengths || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

    const ev = profile.evaluation;
    const scoreRows = (ev.items || []).map(function (it) {
      const s = record.scores[it.id];
      return '<tr><td>' + esc(it.label) + '</td><td class="num">' + (s == null || s === '' ? '-' : esc(s) + '点') + '</td></tr>';
    }).join('');
    const hasScores = Object.keys(record.scores || {}).length > 0;

    const j = record.judgment;
    const judgmentHtml = j ? (
      '<div class="result ' + esc(j.result) + '">' +
      '<div class="result-title">' + esc(j.title) + '</div>' +
      '<div class="result-body">' + esc(j.body) + '</div>' +
      '<div class="result-score">合計 ' + esc(j.total) + ' / ' + esc(j.max) + '点（' + esc(j.pct) + '%）　' +
      '採用推奨 ' + esc(j.thresholds.recommendPts) + '点以上 ／ 上長判断 ' + esc(j.thresholds.reviewPts) + '点以上</div>' +
      (j.warnings && j.warnings.length ? '<ul class="warn-list">' + j.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="disclaimer">' + esc(j.disclaimer) + '</div>' +
      '</div>'
    ) : '<p class="muted">採用可否判定は未実施です。</p>';

    const json = JSON.stringify(record).replace(/<\//g, '<\\/');
    const SCRIPT_END = '</scr' + 'ipt>';

    return '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>応募者情報 - ' + esc(name) + ' | ' + esc(meta.theaterName) + '</title>\n' +
      '<style>\n' +
      'body{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif;max-width:860px;margin:0 auto;padding:24px;color:#1a2233;background:#fff;line-height:1.6}\n' +
      '.head{border-bottom:3px solid #1f5fbf;padding-bottom:12px;margin-bottom:20px}\n' +
      '.head h1{font-size:20px;margin:0 0 4px}\n.head p{margin:0;color:#5b6675;font-size:13px}\n' +
      'h2{font-size:15px;margin:28px 0 10px;padding-left:10px;border-left:4px solid #1f5fbf}\n' +
      'table{width:100%;border-collapse:collapse;font-size:14px}\n' +
      'th,td{border:1px solid #dde3ea;padding:7px 10px;text-align:left;vertical-align:top}\n' +
      'th{width:9em;background:#f3f5f8;font-weight:600;color:#5b6675}\ntd.num{text-align:right;width:6em}\n' +
      'ul{padding-left:0;list-style:none;margin:0}\n' +
      'li.h{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid #dde3ea;border-left-width:4px;border-radius:6px;margin-bottom:6px;font-size:14px}\n' +
      'li.h.block{border-left-color:#dc2626}li.h.warn{border-left-color:#d97706}li.h.info{border-left-color:#2563eb}\n' +
      'li.h.done{background:#f3faf6}\n.box{font-size:16px}\n' +
      '.sev{font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;background:#eef2f7;white-space:nowrap}\n' +
      '.cat{font-size:11px;color:#5b6675;white-space:nowrap;padding-top:2px}\n.txt{flex:1}\n' +
      '.strengths li{padding:4px 0 4px 1.2em;position:relative}.strengths li:before{content:"✓";position:absolute;left:0;color:#0e9f6e;font-weight:700}\n' +
      '.result{border-radius:10px;padding:18px 20px;border:2px solid}\n' +
      '.result.recommend{background:#e3f6ee;border-color:#0e9f6e}.result.review{background:#fdf1dc;border-color:#d97706}.result.reject{background:#fde8e8;border-color:#dc2626}\n' +
      '.result-title{font-size:20px;font-weight:800;margin-bottom:6px}\n.result-score{margin-top:8px;font-weight:600}\n' +
      '.warn-list{margin-top:10px;padding-left:1.2em;list-style:disc;font-size:13px}\n' +
      '.disclaimer{margin-top:10px;font-size:12px;color:#5b6675}\n.note{white-space:pre-wrap;background:#f8fafc;border:1px solid #dde3ea;border-radius:6px;padding:10px;font-size:14px}\n' +
      '.muted{color:#5b6675}\n.foot{margin-top:36px;padding-top:12px;border-top:1px solid #dde3ea;font-size:11px;color:#5b6675}\n' +
      '@media print{body{padding:0}}\n' +
      '</style>\n</head>\n<body>\n' +
      '<div class="head"><h1>' + esc(meta.theaterName) + '　応募者情報</h1>' +
      '<p>応募者: ' + esc(name) + '　｜　保存日時: ' + esc(savedAt) + '　｜　' + esc(meta.appTitle) + ' ' + esc(meta.version) + '</p></div>\n' +
      '<h2>応募情報</h2>\n<table>' + rows + '</table>\n' +
      '<h2>面接者への申し送り（留意点）</h2>\n' +
      (handoffItems ? '<ul>' + handoffItems + '</ul>' : '<p class="muted">留意点はありません。</p>') +
      (strengths ? '<h2>強み</h2>\n<ul class="strengths">' + strengths + '</ul>' : '') +
      (record.handoff.note ? '<h2>担当者からの追記</h2>\n<div class="note">' + esc(record.handoff.note) + '</div>' : '') +
      '<h2>面接評価</h2>\n' +
      (hasScores ? '<table>' + scoreRows + '</table>' : '<p class="muted">面接評価は未入力です。</p>') +
      (record.interviewNotes ? '<h2>面接所見</h2>\n<div class="note">' + esc(record.interviewNotes) + '</div>' : '') +
      '<h2>採用可否判定</h2>\n' + judgmentHtml + '\n' +
      '<div class="foot">' + esc(meta.footer) + '<br>このファイルはアプリの「読み込み」から再度開けます。ファイル内の埋め込みデータを編集しないでください。</div>\n' +
      '<script type="application/json" id="recruit-record">' + json + SCRIPT_END + '\n' +
      '</body>\n</html>\n';
  }

  global.RecruitStorage = {
    PROFILE_KEY: PROFILE_KEY,
    defaults: defaults,
    normalizeProfile: normalizeProfile,
    loadProfile: loadProfile,
    saveProfile: saveProfile,
    resetProfile: resetProfile,
    parseProfileJSON: parseProfileJSON,
    loadTheme: loadTheme,
    saveTheme: saveTheme,
    download: download,
    safeName: safeName,
    buildRecord: buildRecord,
    parseRecordFromHTML: parseRecordFromHTML,
    generateReportHTML: generateReportHTML
  };
})(window);
