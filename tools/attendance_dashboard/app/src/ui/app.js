/* 勤務実績ダッシュボード — UI (DOM only).
 *
 * The UI calls only AE.api.* (decode, defaultSettings, defaultHolidays, detectMonth, build, filter, view)
 * and renders the fields named by the spec identifiers. It never re-implements a computation:
 * numbers and display strings come from the engine (the `*_text` siblings when present). The only
 * local logic is presentation: Excel number-format rendering as a fallback when an engine field has
 * no `*_text`, the conditional-format colour rules of the specs, layout, printing and storage.
 *
 * Field access is tolerant of the engine's object layout (see pick()):
 *   obj[id] | obj[camelCase(id)] | obj[prefix][rest] | obj[prefix][id]   (e.g. WB.roster.period_label)
 * Families are arrays (0-based; a 1-based array with an empty [0] is accepted).
 * Each value may also be an object {value|v, text}.
 *
 * Fields read (spec identifiers):
 *   WB   roster_month_label[6] roster_paste_rows[6] roster_paste_status[6] (or lists_howto_paste_rows[6])
 *        lists_howto_warning  roster_total_*  lists_staff_period_text  lists_staff_hdr_work[6]
 *        lists_staff_hdr_absent[6]  lists_staff_rows[] {rank,name,id,dept,qual,work_days,absent_days,
 *        shift_days,attend_rate,absent_rate,judgement,work_hours,avg_hours,night_hours,months,late_days,
 *        late_rate,early_days,early_rate,busy_days,busy_rate,extra_apps,extra_apps_busy,month_work[6],
 *        month_absent[6]} (row keys may also carry the lists_staff_ prefix; column arrays are accepted)
 *        lists_sum_title lists_sum_period_text lists_sum_tile_*  lists_sum_dept_rows[20]
 *        {name,headcount,work_days,absent_days,shift_days,attend_rate,absent_rate}
 *        lists_sum_worst_title lists_sum_worst_rows[10] {name,dept,shift_days,absent_days,absent_rate}
 *        ingest_set_job_rowcount[20] ingest_set_dept_rowcount[20] ingest_set_order_warning
 *        ingest_hol_msg_count ingest_hol_msg_format ingest_hol_msg_range ingest_hol_msg_coverage
 *   View dashtop_* and dashbottom_* (40 / 50 specs): title, subtitle, period, status, staff_box,
 *        info_emp_no/dept/months, badge, badge_criteria, kpi_*(+_sub), summary, warning, ring_*,
 *        month_label/work/abs[6], job_label/hours/share[21], job_center_value, job_legend_slot[6],
 *        job_legend_idx[21], wd_label/work_days[7], band_label/self/all/dept[5], radar_table,
 *        rest_count, timing_late, timing_early, timing_note, th_good/warn/min_days/alert,
 *        sel_no, sel_att_rate, sel_abs_rate, sel_confirmed_days;
 *        dashbottom_month_*[6] + month_total_*, abs_row[] {date,weekday,kind_label,updated,orig_time,
 *        new_time,job_label}, abs_footnote, busy_summary_line, busy_extra_apps_line, busy_runs_label,
 *        busy_run_row[] {period,names,len,worked}, busy_missed_label, busy_missed_cell[], busy_footnote.
 *        Colours: dashtop_cat_colors (job slices). The filter uses AE.api.filter's matchCount / query.
 *
 * Every element that shows a workbook cell carries data-cell="<cell>" (ダッシュボード, 全体サマリー, 設定) or
 * data-col="<column>" (スタッフ一覧 rows), so test/ui_check.py can compare the page with the golden workbooks.
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});
  const C = () => AE.charts;

  /* ================================================================ constants */
  const MAX_FILES = 6;
  const ABS_ROWS = 12, RUN_ROWS = 6, BUSY_CELLS = 24;
  const LS_SETTINGS = 'attendanceDashboard.settings.v1';
  const LS_HOLIDAYS = 'attendanceDashboard.holidays.v1';
  // chart / tile colours of the workbook (spec 40 §1.1: C_BLUE 7EB2E6, C_RED DC8E8E, C_BLUE_D 4E8CD6 for 土日;
  // job slices = ingest_cat_colors, read from the view's dashtop_cat_colors when present)
  const COL_WORK = '#7EB2E6', COL_ABS = '#DC8E8E';
  const COL_WEEKDAY = '#7EB2E6', COL_WEEKEND = '#4E8CD6';
  const CAT_COLORS_DEFAULT = ['7EB2E6', '8FCBA3', 'F1D46A', 'B5A3DE', 'F2B27A', 'DC8E8E', '98CBE1', 'AF98E1', 'E198C8',
    'E1B298', 'C5E198', '98E1B5', '98C2E1', 'B898E1', 'E198BF', 'E1BB98', 'BCE198', '98E1BE', '98B9E1', 'C198E1', 'A9B4C2'];
  let catColors = CAT_COLORS_DEFAULT;
  const JOB_OTHER = '#A9B4C2';
  const R_SELF = '#1B4F9E', R_ALL = '#2F9A6A', R_DEPT = '#E08A1E';
  const ACC_WORK = '#7EB2E6', ACC_ABS = '#DC8E8E', ACC_NEUTRAL = '#9AA7B8';
  const WD_DEFAULT = ['月', '火', '水', '木', '金', '土', '日'];
  const BAND_DEFAULT = ['朝 〜10時', '午前 10〜13時', '午後 13〜17時', '夕 17〜21時', '夜 21時〜'];
  const BAND_SHORT = ['朝', '午前', '午後', '夕', '夜'];
  const DASH_W = 1240;

  /* ================================================================ small DOM helpers */
  function h(tag, props) {
    const e = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = String(v);
        else if (k === 'style') { for (const sk of Object.keys(v)) e.style.setProperty(sk, v[sk]); }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (let i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(e, kid) {
    if (kid === undefined || kid === null || kid === false) return;
    if (Array.isArray(kid)) { for (const k of kid) append(e, k); return; }
    if (typeof kid === 'string' || typeof kid === 'number') e.appendChild(document.createTextNode(String(kid)));
    else e.appendChild(kid);
  }
  const $ = id => document.getElementById(id);
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  /** grid-column for Excel letters B..X (B = grid line 1) */
  function gc(a, b) {
    const n = L => L.charCodeAt(0) - 65;
    return { 'grid-column': n(a) + ' / ' + (n(b || a) + 1) };
  }

  /* ================================================================ tolerant field access */
  const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  const camel = s => s.replace(/_([a-z0-9])/g, (m, c) => c.toUpperCase());
  const SPEC_PREFIX = /^(ingest|roster|lists|dashtop|dashbottom|dbcalc|index)_(.+)$/;
  const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  /** resolve a snake_case id in o: o[id], o[camel], or nested o[head][rest] for every split point */
  function pickPath(o, id, depth) {
    if (!isObj(o) || depth > 3) return undefined;
    if (hasOwn(o, id)) return o[id];
    const cc = camel(id);
    if (cc !== id && hasOwn(o, cc)) return o[cc];
    const segs = id.split('_');
    for (let i = 1; i < segs.length; i++) {
      const head = segs.slice(0, i).join('_'), rest = segs.slice(i).join('_');
      for (const hk of [head, camel(head), head + 's']) {
        const sub = o[hk];
        if (isObj(sub)) {
          if (hasOwn(sub, id)) return sub[id];
          const v = pickPath(sub, rest, depth + 1);
          if (v !== undefined) return v;
        }
      }
    }
    return undefined;
  }
  /* same cell, other identifier (00_index §5.1 dashtop_* ↔ dbcalc_*, §5.2 lists_src_* ↔ roster_*) */
  const ALIAS = {
    dashtop_sel_no: 'dbcalc_sel_emp_no', dashtop_sel_idx: 'dbcalc_sel_master_idx', dashtop_staff_box: 'dbcalc_sel_input',
    dashtop_sel_dept_code: 'dbcalc_sel_dept_code', dashtop_sel_att_rate: 'dbcalc_sel_att_rate',
    dashtop_th_good: 'dbcalc_thr_good', dashtop_th_warn: 'dbcalc_thr_warn', dashtop_th_min_days: 'dbcalc_min_days',
    dashtop_th_alert: 'dbcalc_alert_thr', dashtop_sel_abs_rate: 'dbcalc_sel_abs_rate',
    dashtop_sel_confirmed_days: 'dbcalc_sel_confirmed_days', dashtop_ring_work: 'dbcalc_work_days',
    dashtop_ring_abs: 'dbcalc_abs_days', dashtop_job_top_label: 'dbcalc_job_top_label',
    dashtop_wd_label: 'dbcalc_wd_label', dashtop_wd_work_days: 'dbcalc_wd_days',
    dashtop_cmp_all_rate: 'dbcalc_cmp_all_rate', dashtop_cmp_dept_rate: 'dbcalc_cmp_dept_rate',
    dashtop_rest_count: 'dbcalc_rest_days', dashtop_late_days: 'dbcalc_late_days', dashtop_early_days: 'dbcalc_early_days',
    dashtop_month_label: 'dbcalc_month_label', dashtop_month_work: 'dbcalc_month_work', dashtop_month_abs: 'dbcalc_month_abs',
    dashtop_late_rate: 'dbcalc_late_rate', dashtop_early_rate: 'dbcalc_early_rate', dashtop_busy_work_days: 'dbcalc_busy_work_days',
    dashtop_job_label: 'dbcalc_job_label', dashtop_job_hours: 'dbcalc_job_hours', dashtop_job_share: 'dbcalc_job_share',
    dashtop_job_seq: 'dbcalc_job_pos_seq', dashtop_job_legend_idx: 'dbcalc_job_legend_idx',
    dashtop_band_self: 'dbcalc_band_share_self', dashtop_band_all: 'dbcalc_band_share_all', dashtop_band_dept: 'dbcalc_band_share_dept',
    dashtop_band_total_self: 'dbcalc_band_total_self', dashtop_band_total_all: 'dbcalc_band_total_all', dashtop_band_total_dept: 'dbcalc_band_total_dept',
  };
  /** a field by spec identifier (or the first of several identifiers that exists) */
  function pick(o, id) {
    if (!isObj(o)) return undefined;
    let ids = Array.isArray(id) ? id.slice() : [id];
    for (const i of ids.slice()) if (ALIAS[i] && ids.indexOf(ALIAS[i]) < 0) ids.push(ALIAS[i]);
    let v;
    for (const i of ids) { v = pickPath(o, i, 0); if (v !== undefined) return v; }
    const ms = ids.map(i => SPEC_PREFIX.exec(i));
    for (const m of ms) if (m) { v = pickPath(o, m[2], 0); if (v !== undefined) return v; }
    // one level deeper (e.g. WB.roster.staff_rows for lists_staff_rows): full id, or the
    // unprefixed id when it is specific enough (two or more words)
    for (const k of Object.keys(o)) {
      const sub = o[k];
      if (!isObj(sub) || k === 'sheets') continue;
      for (let j = 0; j < ids.length; j++) {
        v = pickPath(sub, ids[j], 2);
        if (v !== undefined) return v;
        const m = ms[j];
        if (m && m[2].indexOf('_') > 0) { v = pickPath(sub, m[2], 2); if (v !== undefined) return v; }
      }
    }
    return undefined;
  }
  /** raw value of a field that may be {value, text} */
  function raw(x) {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      if (hasOwn(x, 'value')) return x.value;
      if (hasOwn(x, 'v')) return x.v;
      if (hasOwn(x, 'raw')) return x.raw;
    }
    return x;
  }
  function textOf(x) {
    if (x && typeof x === 'object' && !Array.isArray(x) && hasOwn(x, 'text')) return x.text;
    return undefined;
  }
  /** a family array normalised to 0-based, length n (or natural length when n omitted) */
  function fam(o, id, n) {
    let v = pick(o, id);
    if (v && !Array.isArray(v) && typeof v === 'object') {
      const keys = Object.keys(v).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
      if (keys.length) {
        const base = keys[0] === 0 ? 0 : 1;
        const arr = [];
        for (const k of keys) arr[k - base] = v[k];
        v = arr;
      } else v = undefined;
    }
    if (!Array.isArray(v)) return n ? new Array(n).fill(undefined) : [];
    if (n && v.length === n + 1 && (v[0] === undefined || v[0] === null)) v = v.slice(1);
    if (!n) return v.slice();
    const out = v.slice(0, n);
    while (out.length < n) out.push(undefined);
    return out;
  }
  /** display text of a scalar field: id_text, {text}, else Excel-format the raw value */
  function T(o, id, fmt) {
    const ids = Array.isArray(id) ? id : [id];
    for (const i of ids) {
      const t = pick(o, i + '_text');
      if (t !== undefined && t !== null && typeof t !== 'object') return String(t);
      const v = pick(o, i);
      if (v !== undefined) {
        const tt = textOf(v);
        if (tt !== undefined && tt !== null) return String(tt);
        return fmtCell(raw(v), fmt);
      }
    }
    return '';
  }
  function TA(o, id, n, fmt) {
    const ta = fam(o, id + '_text', n);
    const va = fam(o, id, n);
    return va.map((v, i) => {
      if (ta[i] !== undefined && ta[i] !== null && typeof ta[i] !== 'object') return String(ta[i]);
      const tt = textOf(v);
      if (tt !== undefined && tt !== null) return String(tt);
      return fmtCell(raw(v), fmt);
    });
  }
  const R = (o, id) => raw(pick(o, id));
  /** a row object field: full id, then suffix after the given prefix, then camelCase */
  function rf(row, key, prefix) {
    if (row == null || typeof row !== 'object') return undefined;
    const cands = [key, prefix + key, camel(key), camel(prefix + key)];
    for (const c of cands) if (hasOwn(row, c)) return row[c];
    return undefined;
  }
  function rft(row, key, prefix, fmt) {
    const t = rf(row, key + '_text', prefix);
    if (t !== undefined && t !== null && typeof t !== 'object') return String(t);
    const v = rf(row, key, prefix);
    const tt = textOf(v);
    if (tt !== undefined && tt !== null) return String(tt);
    return fmtCell(raw(v), fmt);
  }
  const isNum = v => typeof v === 'number' && isFinite(v);
  const N0 = v => (isNum(v) ? v : 0);

  /* ================================================================ Excel display formats (fallback) */
  function xlRound(x, d) {
    const s = Math.sign(x);
    const a = Number((Math.abs(x) * Math.pow(10, d)).toPrecision(15));
    return s * Math.round(a) / Math.pow(10, d);
  }
  function fmtFixed(x, d) { const r = xlRound(x, d); return (r === 0 ? 0 : r).toFixed(d); }
  function fmtPct(x, d) {
    const s = Math.sign(x);
    const v = s * Math.round(Number((Math.abs(x) * Math.pow(10, d + 2)).toPrecision(15))) / Math.pow(10, d);
    return (v === 0 ? 0 : v).toFixed(d) + '%';
  }
  function comma(str) { return str.replace(/^(-?\d+)/, m => m.replace(/\B(?=(\d{3})+(?!\d))/g, ',')); }
  function xlText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (!isNum(v)) return String(v);
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(15)));
  }
  function serialToYMD(s) {
    const d = new Date((Math.floor(s) - 25569) * 86400000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() };
  }
  function ymdToSerial(y, m, d) { return Date.UTC(y, m - 1, d) / 86400000 + 25569; }
  const pad2 = n => (n < 10 ? '0' : '') + n;
  function fmtMD(s) { const t = serialToYMD(s); return t.m + '/' + t.d; }
  function fmtMDHM(s) {
    const secs = Math.round(s * 86400);
    const day = Math.floor(secs / 86400);
    const rem = secs - day * 86400;
    const t = serialToYMD(day);
    return t.m + '/' + t.d + ' ' + pad2(Math.floor(rem / 3600)) + ':' + pad2(Math.floor((rem % 3600) / 60));
  }
  function fmtElapsedHM(x) {
    const secs = Math.round(x * 86400);
    return Math.floor(secs / 3600) + ':' + pad2(Math.floor((secs % 3600) / 60));
  }
  function fmtYMD(s) { const t = serialToYMD(s); return t.y + '/' + pad2(t.m) + '/' + pad2(t.d); }
  function fmtCell(v, fmt) {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'string') return v;
    if (!isNum(v)) return xlText(v);
    switch (fmt) {
      case '0': return fmtFixed(v, 0);
      case 'd': return fmtFixed(v, 0) + '日';
      case 'pct1': return fmtPct(v, 1);
      case 'pct0': return fmtPct(v, 0);
      case 'h1': return fmtFixed(v, 1) + 'h';
      case 'f1': return fmtFixed(v, 1);
      case 'mei': return fmtFixed(v, 0) + '名';
      case 'kdays': return comma(fmtFixed(v, 0)) + '日';
      case 'comma': return comma(fmtFixed(v, 0));
      case 'months': return fmtFixed(v, 0) + 'ヶ月';
      case 'ken': return fmtFixed(v, 0) + '件';
      case 'md': return fmtMD(v);
      case 'mdhm': return fmtMDHM(v);
      case 'hm': return fmtElapsedHM(v);
      case 'ymd': return fmtYMD(v);
      case 'rows': return v === 0 ? '※ 貼付データに無い値です（表記を確認）' : comma(fmtFixed(v, 0)) + '行';
      default: return xlText(v);
    }
  }

  /* ================================================================ storage (guarded) */
  const store = {
    ok: null,
    test() {
      if (this.ok !== null) return this.ok;
      try {
        const k = '__ad_probe__';
        root.localStorage.setItem(k, '1');
        root.localStorage.removeItem(k);
        this.ok = true;
      } catch (e) { this.ok = false; }
      return this.ok;
    },
    get(k) { try { return this.test() ? root.localStorage.getItem(k) : null; } catch (e) { return null; } },
    set(k, v) {
      try { if (!this.test()) return false; root.localStorage.setItem(k, v); return true; } catch (e) { return false; }
    },
    del(k) { try { if (this.test()) root.localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  /* ================================================================ state */
  const state = {
    files: [],            // [{name, size, text, ym:{year,month}|null}] oldest first, max 6
    settings: null,
    holidays: [],         // [{date: serial | string | null, name: string}]
    WB: null,
    view: null,
    selName: null,        // B7 text chosen by the user (null = default: first name in name order)
    filterQ: '',
    tab: 'howto',
    dirty: { dash: true, list: true, sum: true, set: true, hol: true },
    allNames: null,
    cands: [],
    matchCount: 0,
    list: { sortKey: null, sortDir: 0, q: '', dept: '', judge: '' },
    engineOk: false,
    printPrepared: false,
  };

  /* ================================================================ engine wrappers */
  function api() { return AE.api && typeof AE.api === 'object' ? AE.api : null; }
  function engineCall(name, args, fallback) {
    const a = api();
    if (!a || typeof a[name] !== 'function') return fallback;
    try { return a[name].apply(a, args); } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (/is not loaded/.test(msg)) banner('集計エンジンの一部がこのファイルに組み込まれていません（' + msg + '）。この部分の集計は表示できません。', true);
      else banner('集計処理でエラーが発生しました（' + name + '）：' + msg, true);
      return fallback;
    }
  }
  function banner(msg, isError) {
    const b = $('banner');
    if (!b) return;
    if (!msg) { b.hidden = true; b.textContent = ''; return; }
    b.textContent = msg;
    b.classList.toggle('error', !!isError);
    b.hidden = false;
  }

  /* ================================================================ settings model */
  const SET_KEYS = ['theatre', 'rateGood', 'rateWarn', 'minDays', 'alertRate', 'nightStart', 'nightEnd', 'jobOtherLabel'];
  function defaultSettings() {
    const d = engineCall('defaultSettings', [], null);
    return d ? normSettings(d, null) : null;
  }
  function normRow(r) {
    if (Array.isArray(r)) return { code: r[0] == null ? '' : String(r[0]), label: r[1] == null ? '' : String(r[1]) };
    return { code: r && r.code != null ? String(r.code) : '', label: r && r.label != null ? String(r.label) : '' };
  }
  function normNum(v, d) {
    if (v === '' || v === null) return '';
    if (isNum(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    return d;
  }
  function normSettings(x, base) {
    const d = base || {};
    const src = x && typeof x === 'object' ? x : {};
    const out = {};
    for (const k of SET_KEYS) out[k] = hasOwn(src, k) ? src[k] : d[k];
    out.theatre = out.theatre == null ? '' : String(out.theatre);
    out.jobOtherLabel = out.jobOtherLabel == null ? '' : String(out.jobOtherLabel);
    for (const k of ['rateGood', 'rateWarn', 'minDays', 'alertRate']) out[k] = normNum(out[k], d[k] === undefined ? '' : d[k]);
    for (const k of ['nightStart', 'nightEnd']) {
      const v = out[k];
      out[k] = (v === '' || v === null || v === undefined) ? '' : (isNum(v) ? v : (parseTime(String(v)) ?? String(v)));
    }
    const jobs = Array.isArray(src.jobs) ? src.jobs : (d.jobs || []);
    const depts = Array.isArray(src.depts) ? src.depts : (d.depts || []);
    out.jobs = []; out.depts = [];
    for (let i = 0; i < 20; i++) { out.jobs.push(normRow(jobs[i])); out.depts.push(normRow(depts[i])); }
    return out;
  }
  function loadSettings() {
    const def = defaultSettings();
    let s = null;
    const txt = store.get(LS_SETTINGS);
    if (txt) { try { s = JSON.parse(txt); } catch (e) { s = null; } }
    if (def) return s ? normSettings(s, def) : def;
    return s ? normSettings(s, null) : normSettings({}, null);
  }
  function saveSettings() { return store.set(LS_SETTINGS, JSON.stringify(state.settings)); }

  /* holidays model */
  function defaultHolidays() {
    const d = engineCall('defaultHolidays', [], null);
    return Array.isArray(d) ? d.map(x => ({ date: x && x.date !== undefined ? x.date : null, name: x && x.name != null ? String(x.name) : '' })) : [];
  }
  function holToStore(list) {
    return list.map(x => ({ d: isNum(x.date) ? fmtYMD(x.date) : (x.date == null ? '' : String(x.date)), n: x.name || '' }));
  }
  function holFromStore(arr) {
    if (!Array.isArray(arr)) return null;
    return arr.map(x => {
      const dt = x && (x.d !== undefined ? x.d : x.date);
      const nm = x && (x.n !== undefined ? x.n : x.name);
      return { date: parseHolDate(dt), name: nm == null ? '' : String(nm) };
    });
  }
  function parseHolDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (isNum(v)) return v;
    const t = String(v).normalize('NFKC').trim();
    if (t === '') return null;
    const m = /^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?$/.exec(t);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return ymdToSerial(y, mo, d);
    }
    return t;      // unreadable text: kept so the engine's self-check can flag it
  }
  function loadHolidays() {
    const txt = store.get(LS_HOLIDAYS);
    if (txt) {
      try { const l = holFromStore(JSON.parse(txt)); if (l) return l; } catch (e) { /* fall through */ }
    }
    return defaultHolidays();
  }
  function saveHolidays() { return store.set(LS_HOLIDAYS, JSON.stringify(holToStore(state.holidays))); }

  function parseTime(t) {
    const s = String(t).normalize('NFKC').trim();
    const m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) return null;
    const mm = +m[2], ss = m[3] ? +m[3] : 0;
    if (mm > 59 || ss > 59) return null;
    return (+m[1]) / 24 + mm / 1440 + ss / 86400;
  }
  function thr(key) {     // a blank setting reads as 0 (reference to an empty cell)
    const v = state.settings ? state.settings[key] : '';
    return isNum(v) ? v : 0;
  }

  /* ================================================================ recompute */
  let recomputeTimer = null;
  function slots() {
    const out = [];
    for (let i = 0; i < MAX_FILES; i++) {
      const f = state.files[i];
      out.push(f ? { name: f.name, text: f.text } : null);
    }
    return out;
  }
  function showBusy(msg) { $('busy-text').textContent = msg || '集計しています…'; $('busy').hidden = false; }
  function hideBusy() { $('busy').hidden = true; }
  function scheduleRecompute(delay) {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => { recomputeTimer = null; recompute(); }, delay == null ? 350 : delay);
  }
  function recompute(after) {
    showBusy();
    // let the overlay paint before the (synchronous) engine run; no rAF (paused in background tabs)
    setTimeout(() => {
      try {
        const wb = api() && typeof api().build === 'function'
          ? engineCall('build', [slots(), state.settings, state.holidays], null) : null;
        state.WB = wb;
        state.allNames = null;
        clear($('print-root'));
        const names = allNames();
        if (state.selName !== null && names.indexOf(state.selName) < 0) state.selName = null;
        updateFilter();
        state.dirty.dash = state.dirty.list = state.dirty.sum = true;
        document.body.classList.toggle('no-data', state.files.length === 0);
        renderPasteTable();
        updateSetCounts();
        if (!state.dirty.hol) renderHolMsgs();
        renderActive();
      } catch (e) {
        banner('画面の更新中にエラーが発生しました：' + (e && e.message ? e.message : String(e)), true);
      } finally { hideBusy(); }
      if (typeof after === 'function') after();
    }, 20);
  }

  /* ================================================================ staff names / filter */
  function refName(r) {
    if (r == null) return '';
    if (typeof r === 'string') return r;
    if (typeof r === 'number') return String(r);
    const v = r.name !== undefined ? r.name : (r.roster_name !== undefined ? r.roster_name : (r.label !== undefined ? r.label : r.text));
    return v == null ? '' : String(v);
  }
  function refKey(r) {
    if (r == null || typeof r !== 'object') return undefined;
    for (const k of ['key', 'emp_no', 'empNo', 'roster_emp_no', 'id', 'no']) if (r[k] !== undefined) return r[k];
    return undefined;
  }
  function normFilterResult(res) {
    let list = [], match = null, query = null;
    if (Array.isArray(res)) {
      // AE.roster.filter: an array of refs carrying matchCount (名簿!CJ2) and query (D5 as Excel stores it)
      list = res;
      if (isNum(res.matchCount)) match = res.matchCount;
      if (typeof res.query === 'string') query = res.query;
    } else if (res && typeof res === 'object') {
      list = res.list || res.roster_filter_list || res.names || res.staff || [];
      const m = res.matchCount !== undefined ? res.matchCount : (res.roster_filter_match_count !== undefined ? res.roster_filter_match_count : res.match_count);
      if (isNum(m)) match = m;
    }
    // refs given as name-order positions → names via roster_name_sorted
    if (list.length && list.every(x => typeof x === 'number')) {
      const ns = pick(state.WB, ['roster_name_sorted', 'roster_names']);
      if (Array.isArray(ns)) {
        const oneBasedArr = ns[0] === '' || ns[0] === null || ns[0] === undefined;
        const zeroRefs = list.indexOf(0) >= 0;
        list = list.map(r => refName(ns[oneBasedArr || zeroRefs ? r : r - 1]));
      }
    }
    return { refs: list, match, query };
  }
  function allNames() {
    if (state.allNames) return state.allNames;
    if (!state.WB) return (state.allNames = []);
    const r = normFilterResult(engineCall('filter', [state.WB, ''], []));
    state.allRefs = r.refs;
    state.allNames = r.refs.map(refName).filter(n => n !== '');
    return state.allNames;
  }
  function updateFilter() {
    const q = state.filterQ;
    const all = allNames();
    state.filterShown = q;
    if (!state.WB) { state.cands = []; state.matchCount = 0; return; }
    if (q === '') { state.cands = all.slice(); state.matchCount = all.length; return; }
    const r = normFilterResult(engineCall('filter', [state.WB, q], []));
    if (r.query !== null) state.filterShown = r.query;     // e.g. "05616" is shown as 5616 (typed digits become a number)
    let names = r.refs.map(refName).filter(n => n !== '');
    let match = r.match;
    if (match === null) {
      match = names.length;
      // an engine that already applied the Excel fallback (all names when nothing matches)
      if (names.length && names.length === all.length) {
        const ql = q.toLowerCase();
        const hit = r.refs.some(x => refName(x).toLowerCase().indexOf(ql) >= 0 ||
          String(refKey(x) === undefined ? '' : refKey(x)).toLowerCase().indexOf(ql) >= 0);
        if (!hit) match = 0;
      }
    }
    state.matchCount = match;
    state.cands = match === 0 ? all.slice() : names;
  }
  function filterMessage() {   // ダッシュボード!G5 (spec 40 §5.2)
    if (state.filterQ === '') return { text: '', bad: false };
    const q = state.filterShown !== undefined ? state.filterShown : state.filterQ;
    if (state.matchCount === 0) return { text: '　「' + q + '」に一致するスタッフはいません。▼は全員を表示しています', bad: true };
    return { text: '　「' + q + '」に一致 ' + state.matchCount + '名　― 下の▼から選んでください（空欄にすると全員に戻ります）', bad: false };
  }
  function currentName() {
    if (state.selName !== null) return state.selName;
    const all = allNames();
    return all.length ? all[0] : '';
  }

  /* ================================================================ file loading */
  function setLoadMsg(msg, warn) {
    const el = $('load-msg');
    el.textContent = msg || '';
    el.classList.toggle('warn', !!warn);
  }
  function ymKey(ym) { return ym ? ym.year * 12 + (ym.month - 1) : null; }
  function ymLabel(ym) { return ym ? ym.year + '年' + ym.month + '月' : '月不明'; }
  async function loadFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f && f.size >= 0);
    if (!files.length) return;
    if (!api()) { setLoadMsg('集計エンジンが読み込まれていないため、CSVを読み込めません。', true); return; }
    showBusy('ファイルを読み込んでいます…');
    const msgs = [];
    let warn = false;
    const loaded = [];
    for (const f of files) {
      if (!/\.(csv|txt)$/i.test(f.name) && f.type && !/csv|text\/plain|excel/i.test(f.type)) {
        msgs.push('「' + f.name + '」はCSVファイルではないため読み込みませんでした。');
        warn = true;
        continue;
      }
      try {
        const buf = await f.arrayBuffer();
        const text = engineCall('decode', [new Uint8Array(buf)], null);
        if (typeof text !== 'string') { msgs.push('「' + f.name + '」を読み取れませんでした。'); warn = true; continue; }
        const ym = engineCall('detectMonth', [text], null);
        const okYm = ym && isNum(ym.year) && isNum(ym.month) ? { year: ym.year, month: ym.month } : null;
        loaded.push({ name: f.name, size: f.size, text, ym: okYm, added: Date.now() });
      } catch (e) {
        msgs.push('「' + f.name + '」を読み取れませんでした（' + (e && e.message ? e.message : e) + '）。');
        warn = true;
      }
    }
    // merge: a newly read file replaces an already loaded file of the same detected month
    let files2 = state.files.slice();
    for (const nf of loaded) {
      const k = ymKey(nf.ym);
      const idx = k === null ? -1 : files2.findIndex(of => ymKey(of.ym) === k);
      if (idx >= 0) {
        msgs.push(ymLabel(nf.ym) + ' は「' + nf.name + '」に置き換えました（前のファイル「' + files2[idx].name + '」）。');
        files2.splice(idx, 1);
      }
      files2.push(nf);
    }
    // oldest first; files whose month could not be read go first (treated as the oldest)
    files2 = files2.map((f, i) => ({ f, i })).sort((a, b) => {
      const ka = ymKey(a.f.ym), kb = ymKey(b.f.ym);
      if (ka === null && kb === null) return a.i - b.i;
      if (ka === null) return -1;
      if (kb === null) return 1;
      return ka - kb || a.i - b.i;
    }).map(x => x.f);
    if (files2.length > MAX_FILES) {
      const dropped = files2.slice(0, files2.length - MAX_FILES);
      files2 = files2.slice(files2.length - MAX_FILES);
      msgs.push('7ヶ月分以上あるため、新しい6ヶ月分（' + ymLabel(files2[0].ym) + '〜' + ymLabel(files2[files2.length - 1].ym) +
        '）だけを使います。使わなかったファイル：' + dropped.map(d => '「' + d.name + '」').join('、'));
      warn = true;
    }
    const noMonth = files2.filter(f => !f.ym);
    if (noMonth.length) { msgs.push('月を読み取れなかったファイル：' + noMonth.map(d => '「' + d.name + '」').join('、') + '（貼付状況を確認してください）'); warn = true; }
    state.files = files2;
    if (loaded.length) msgs.unshift(loaded.length + '件のファイルを読み込みました。古い月から順に並べています。');
    setLoadMsg(msgs.join('\n'), warn);
    hideBusy();
    const first = state.files.length > 0 && !state.loadedOnce;
    state.loadedOnce = state.loadedOnce || state.files.length > 0;
    recompute(() => { if (first && state.WB) switchTab('dash'); });
  }
  function clearData() {
    if (!state.files.length) { setLoadMsg('読み込んだデータはありません。'); return; }
    if (!root.confirm('読み込んだCSVのデータを消去します。よろしいですか？\n（設定と祝日・繁忙日の一覧は消えません）')) return;
    state.files = [];
    state.selName = null;
    state.filterQ = '';
    if (state.ui && state.ui.filterInput) state.ui.filterInput.value = '';
    setLoadMsg('読み込んだデータを消去しました。');
    recompute();
  }
  function removeFile(i) {
    const f = state.files[i];
    if (!f) return;
    state.files.splice(i, 1);
    setLoadMsg('「' + f.name + '」を外しました。');
    recompute();
  }

  /* ================================================================ 使い方: paste status table */
  function renderPasteTable() {
    const tb = clear($('paste-body'));
    const W = state.WB;
    let labels = fam(W, 'roster_month_label', 6).map(raw);
    let rows = fam(W, 'roster_paste_rows', 6).map(raw);
    let stats = fam(W, 'roster_paste_status', 6).map(raw);
    const howto = fam(W, 'lists_howto_paste_rows', 6);
    for (let k = 0; k < 6; k++) {
      const hr = howto[k];
      if (labels[k] === undefined && hr) labels[k] = raw(rf(hr, 'month', 'lists_howto_paste_'));
      if (rows[k] === undefined && hr) rows[k] = raw(rf(hr, 'rows', 'lists_howto_paste_'));
      if (stats[k] === undefined && hr) stats[k] = raw(rf(hr, 'status', 'lists_howto_paste_'));
    }
    for (let k = 0; k < 6; k++) {
      const f = state.files[k];
      const st = stats[k] === undefined ? (f ? '' : '未貼付') : xlText(stats[k]);
      const cls = st.charAt(0) === '※' ? 'st-bad' : (st === 'OK' ? 'st-ok' : '');
      const del = f ? h('button', { type: 'button', class: 'btn btn-small', title: 'このファイルを外す', 'aria-label': 'CSV_' + (k + 1) + ' のファイルを外す', onclick: () => removeFile(k) }, '外す') : '';
      tb.appendChild(h('tr', null,
        h('td', null, 'CSV_' + (k + 1)),
        h('td', { class: 'file-name' }, f ? f.name : ''),
        h('td', null, labels[k] === undefined ? (f ? '' : '月' + (k + 1) + '（未貼付）') : xlText(labels[k])),
        h('td', { class: 'r' }, rows[k] === undefined ? (f ? '' : '0') : fmtCell(rows[k], 'comma')),
        h('td', { class: cls }, st),
        h('td', { class: 'c' }, del)));
    }
    $('howto-warning').textContent = T(W, 'lists_howto_warning');
  }

  /* ================================================================ dashboard */
  function hasSel(view) {
    const s = pick(view, ['dashtop_sel_no', 'dbcalc_sel_emp_no', 'dbcalc_sel']);
    if (s !== undefined) return raw(s) !== '' && raw(s) !== null;
    return T(view, 'dashtop_info_months') !== '';
  }
  function thresholds(view) {
    const g = (ids, key) => { const v = R(view, ids[0]) !== undefined ? R(view, ids[0]) : R(view, ids[1]); return isNum(v) ? v : (v === undefined ? thr(key) : 0); };
    return {
      good: g(['dashtop_th_good', 'dbcalc_thr_good'], 'rateGood'),
      warn: g(['dashtop_th_warn', 'dbcalc_thr_warn'], 'rateWarn'),
      min: g(['dashtop_th_min_days', 'dbcalc_min_days'], 'minDays'),
      alert: g(['dashtop_th_alert', 'dbcalc_alert_thr'], 'alertRate'),
    };
  }
  function rateClass(v, th) {
    if (!isNum(v)) return '';
    return v >= th.good ? 'c-good' : (v >= th.warn ? 'c-warn' : 'c-crit');
  }
  function badgeClass(text) {
    if (text === '参考値') return 'ref';
    if (text.charAt(0) === '◎') return 'good';
    if (text.charAt(0) === '△') return 'warn';
    if (text.charAt(0) === '✕') return 'crit';
    return '';
  }
  function jobColor(i) { return i >= 0 && i < catColors.length && catColors[i] ? '#' + String(catColors[i]).replace(/^#/, '') : JOB_OTHER; }
  function stripMark(s) { return String(s || '').replace(/^[●■―]\s*/, ''); }

  /**
   * Build one A4 dashboard page for a view.
   * opts.live: interactive (filter input + staff select attached); otherwise static (print).
   */
  function buildDashboard(view, opts) {
    view = view || {};
    opts = opts || {};
    const live = !!opts.live;
    const th = thresholds(view);
    const sel = hasSel(view);
    const page = h('div', { class: 'dash-page', role: 'document', 'aria-label': 'ダッシュボード' });

    /* ---- rows 1–8 */
    const top = h('div', { class: 'd-top' });
    const status = T(view, 'dashtop_status');
    top.appendChild(h('div', { class: 'd-band' },
      h('div', { class: 'd-title', 'data-cell': 'B2' }, T(view, 'dashtop_title') || '勤務実績ダッシュボード'),
      h('div', { class: 'd-period', 'data-cell': 'O2' }, T(view, 'dashtop_period')),
      h('div', { class: 'd-sub', 'data-cell': 'B3' }, T(view, 'dashtop_subtitle')),
      h('div', { class: 'd-status' + (status.charAt(0) === '※' ? ' warn' : ''), 'data-cell': 'O3' }, status)));
    top.appendChild(h('div', { class: 'd-r4' }));
    const fm = opts.filterMsg || { text: '', bad: false };
    const filterBox = h('div', { class: 'd-filter-box', style: gc('D', 'F') });
    if (live && state.ui.filterInput) filterBox.appendChild(state.ui.filterInput);
    else filterBox.appendChild(h('span', { class: 'ell', style: { padding: '0 4px', 'font-size': '10pt', 'line-height': '17pt' } }, opts.filterText || ''));
    const msgEl = h('div', { class: 'd-filter-msg' + (fm.bad ? ' bad' : ''), style: gc('G', 'X'), id: live ? 'd-filter-msg' : null, 'data-cell': 'G5' }, fm.text);
    top.appendChild(h('div', { class: 'g23 d-filter' },
      h('label', { class: 'lab', style: gc('B', 'C'), for: live ? 'filter-input' : null, 'data-cell': 'B5' }, '絞り込み'), filterBox, msgEl));
    top.appendChild(h('div', { class: 'g23 d-labels' },
      h('div', { style: gc('B', 'H'), 'data-cell': 'B6' }, 'スタッフ'), h('div', { style: gc('J', 'L'), 'data-cell': 'J6' }, '従業員番号'),
      h('div', { style: gc('N', 'P'), 'data-cell': 'N6' }, '所属'), h('div', { style: gc('R', 'T'), 'data-cell': 'R6' }, 'データのある月数'),
      h('div', { style: gc('V', 'X'), 'data-cell': 'V6' }, '総合判定')));
    const staffBox = h('div', { class: 'd-staff', style: gc('B', 'H'), 'data-cell': 'B7' });
    const boxText = T(view, ['dashtop_staff_box', 'dashtop_sel_name_input', 'dbcalc_sel_input']) || opts.staffText || '';
    if (live && state.ui.staffSelect) staffBox.appendChild(state.ui.staffSelect);
    else staffBox.appendChild(h('span', { class: 'ell' }, boxText));
    const badgeText = T(view, 'dashtop_badge');
    const bstyle = R(view, 'dashtop_badge_style');
    const bcls = (typeof bstyle === 'string' && /^(ref|good|warn|crit)$/.test(bstyle)) ? bstyle : badgeClass(badgeText);
    top.appendChild(h('div', { class: 'g23 d-boxes' },
      staffBox,
      h('div', { class: 'd-info', style: gc('J', 'L'), 'data-cell': 'J7' }, T(view, 'dashtop_info_emp_no', '0')),
      h('div', { class: 'd-info', style: gc('N', 'P'), 'data-cell': 'N7' }, T(view, 'dashtop_info_dept')),
      h('div', { class: 'd-info months', style: gc('R', 'T'), 'data-cell': 'R7' }, T(view, 'dashtop_info_months')),
      h('div', { class: 'd-badge ' + bcls, style: gc('V', 'X') },
        h('div', { class: 'b1', 'data-cell': 'V7' }, badgeText), h('div', { class: 'b2', 'data-cell': 'V8' }, T(view, 'dashtop_badge_criteria')))));
    page.appendChild(top);

    /* ---- KPI tiles rows 9–13 */
    page.appendChild(h('div', { class: 'd-r9' }));
    const kpis = h('div', { class: 'g23 d-kpis' });
    const KP = [
      ['dashtop_kpi_work_days', '出勤日数', 'd', ACC_WORK, 'B', 'D'],
      ['dashtop_kpi_att_rate', '出勤率', 'pct1', ACC_WORK, 'F', 'H'],
      ['dashtop_kpi_abs_days', '欠勤日数', 'd', ACC_ABS, 'J', 'L'],
      ['dashtop_kpi_abs_rate', '当日欠勤率', 'pct1', ACC_ABS, 'N', 'P'],
      ['dashtop_kpi_hours', '勤務時間', 'h1', ACC_NEUTRAL, 'R', 'T'],
      ['dashtop_kpi_busy_rate', '土日祝出勤率', 'pct1', ACC_WORK, 'V', 'X'],
    ];
    const absRate = R(view, 'dashtop_kpi_abs_rate') !== undefined ? R(view, 'dashtop_kpi_abs_rate') : R(view, 'dashtop_sel_abs_rate');
    let alert = R(view, 'dashtop_kpi_abs_alert');
    alert = typeof alert === 'boolean' ? alert : (isNum(absRate) && absRate >= th.alert);
    for (const [id, label, fmt, acc, a, b] of KP) {
      let vcls = 'val';
      if (id === 'dashtop_kpi_att_rate') { const c = rateClass(R(view, id), th); if (c) vcls += ' ' + c; }
      const tile = h('div', { class: 'kpi' + (id === 'dashtop_kpi_abs_rate' && alert ? ' alert' : ''), style: Object.assign({ '--acc': acc }, gc(a, b)) },
        h('div', { class: 'lab', 'data-cell': a + '10' }, label),
        h('div', { class: vcls, 'data-cell': a + '11' }, T(view, id, fmt)),
        h('div', { class: 'sub', 'data-cell': a + '13' }, T(view, id + '_sub')));
      kpis.appendChild(tile);
    }
    page.appendChild(kpis);

    /* ---- sentences rows 14–16 */
    page.appendChild(h('div', { class: 'd-r14' }));
    page.appendChild(h('div', { class: 'd-summary', 'data-cell': 'B15' }, T(view, 'dashtop_summary')));
    page.appendChild(h('div', { class: 'd-warning', 'data-cell': 'B16' }, T(view, 'dashtop_warning')));

    /* ---- charts row 1 */
    page.appendChild(h('div', { class: 'g23 d-r17' },
      h('div', { class: 'd-sec-title', style: gc('B', 'H'), 'data-cell': 'B17' }, '出勤率'),
      h('div', { class: 'd-sec-title', style: gc('J', 'P'), 'data-cell': 'J17' }, '月別の出勤日数・欠勤日数'),
      h('div', { class: 'd-sec-title', style: gc('R', 'X'), 'data-cell': 'R17' }, '職種別の勤務時間')));
    const row1 = h('div', { class: 'g23 d-cards1' });
    row1.appendChild(ringCard(view, th, sel));
    row1.appendChild(monthCard(view));
    row1.appendChild(jobCard(view));
    page.appendChild(row1);

    /* ---- charts row 2 */
    page.appendChild(h('div', { class: 'd-r32' }));
    page.appendChild(h('div', { class: 'g23 d-r17' },
      h('div', { class: 'd-sec-title', style: gc('B', 'H'), 'data-cell': 'B33' }, '曜日別の出勤日数'),
      h('div', { class: 'd-sec-title', style: gc('J', 'P'), 'data-cell': 'J33' }, '出勤時間帯（1日を5つに分けた割合）'),
      h('div', { class: 'd-sec-title', style: gc('R', 'X'), 'data-cell': 'R33' }, '休み・時間変更のタイミング')));
    const row2 = h('div', { class: 'g23 d-cards2' });
    row2.appendChild(weekdayCard(view));
    row2.appendChild(radarCard(view, sel));
    row2.appendChild(timingCard(view, sel));
    page.appendChild(row2);

    /* ---- bottom */
    page.appendChild(monthTable(view, th));
    page.appendChild(absList(view, page, live));
    page.appendChild(busyBlock(view, page, live));
    page.appendChild(h('div', { class: 'd-r99' }));
    return page;
  }

  const CARD_W = Math.round((DASH_W - 42) / 23 * 7);   // ≈ 365px
  const PT = 96 / 72;

  function ringCard(view, th, sel) {
    const card = h('div', { class: 'card', style: gc('B', 'H') });
    const area = h('div', { class: 'chart-area area1' });
    const w = CARD_W, hh = Math.round(198 * PT);
    const work = N0(R(view, ['dashtop_ring_work', 'dbcalc_work_days']));
    const abs = N0(R(view, ['dashtop_ring_abs', 'dbcalc_abs_days']));
    const tot = work + abs;
    const share = v => (tot > 0 ? fmtPct(v / tot, 1) : '');
    const svg = C().ring({
      w, h: hh, R: hh * 0.43, hole: 0.7, ariaLabel: '出勤率のドーナツグラフ',
      slices: [
        { value: work, color: COL_WORK, tip: { title: '出勤', rows: [{ color: COL_WORK, value: work + '日', label: share(work) }] } },
        { value: abs, color: COL_ABS, tip: { title: '欠勤', rows: [{ color: COL_ABS, value: abs + '日', label: share(abs) }] } },
      ],
    });
    area.appendChild(svg);
    const cv = T(view, 'dashtop_ring_center_value', 'pct1') || '－';
    const rc = rateClass(R(view, ['dashtop_ring_center_value', 'dashtop_sel_att_rate', 'dashtop_kpi_att_rate']), th);
    area.appendChild(h('div', { class: 'ring-center', style: { top: (198 / 2) + 'pt' } },
      h('div', { class: 'cl', 'data-cell': 'D22' }, T(view, 'dashtop_ring_center_label') || '出勤率'),
      h('div', { class: 'cv' + (rc ? ' ' + rc : ''), 'data-cell': 'D23' }, cv)));
    card.appendChild(area);
    const lw = stripMark(T(view, 'dashtop_ring_legend_work'));
    const la = stripMark(T(view, 'dashtop_ring_legend_abs'));
    const items = [];
    if (lw) items.push({ label: lw, color: COL_WORK, kind: 'dot', cell: 'C30' });
    if (la) items.push({ label: la, color: COL_ABS, kind: 'dot', cell: 'F30' });
    const lr = h('div', { class: 'legend-row' });
    if (items.length) lr.appendChild(C().legend(items));
    card.appendChild(lr);
    return card;
  }

  function monthCard(view) {
    const card = h('div', { class: 'card', style: gc('J', 'P') });
    const area = h('div', { class: 'chart-area area1' });
    const labels = TA(view, 'dashtop_month_label', 6);
    const work = fam(view, 'dashtop_month_work', 6).map(raw).map(N0);
    const abs = fam(view, 'dashtop_month_abs', 6).map(raw).map(N0);
    area.appendChild(C().stacked({
      w: CARD_W, h: Math.round(198 * PT), categories: labels, labelSeries: 0, step: 5,
      fmt: v => fmtFixed(v, 0), ariaLabel: '月別の出勤日数・欠勤日数の積み上げ棒グラフ',
      series: [{ name: '出勤日数', color: COL_WORK, values: work }, { name: '欠勤日数', color: COL_ABS, values: abs }],
      tip: i => ({ title: labels[i] || ('CSV_' + (i + 1)), rows: [
        { color: COL_WORK, value: work[i] + '日', label: '出勤日数' }, { color: COL_ABS, value: abs[i] + '日', label: '欠勤日数' }] }),
    }));
    card.appendChild(area);
    const lr = h('div', { class: 'legend-row' });
    lr.appendChild(C().legend([
      { label: stripMark(T(view, 'dashtop_month_legend_work')) || '出勤日数', color: COL_WORK, kind: 'rect', cell: 'K30' },
      { label: stripMark(T(view, 'dashtop_month_legend_abs')) || '欠勤日数', color: COL_ABS, kind: 'rect', cell: 'N30' }]));
    card.appendChild(lr);
    return card;
  }

  function jobCard(view) {
    const card = h('div', { class: 'card', style: gc('R', 'X') });
    const area = h('div', { class: 'chart-area area1' });
    const cc = pick(view, 'dashtop_cat_colors');
    catColors = Array.isArray(cc) && cc.length >= 21 ? cc : CAT_COLORS_DEFAULT;
    const labels = TA(view, 'dashtop_job_label', 21);
    const hours = fam(view, 'dashtop_job_hours', 21).map(raw).map(N0);
    const shareT = TA(view, 'dashtop_job_share', 21, 'pct0');
    const tot = hours.reduce((a, b) => a + b, 0);
    const slices = hours.map((v, i) => ({
      value: v, color: jobColor(i), label: shareT[i] || (tot > 0 ? fmtPct(v / tot, 0) : ''),
      tip: { title: labels[i] || (i === 20 ? 'その他' : ''), rows: [{ color: jobColor(i), value: fmtFixed(v, 1) + 'h', label: shareT[i] || '' }] },
    }));
    const hh = Math.round(198 * PT);
    area.appendChild(C().ring({ w: CARD_W, h: hh, R: hh * 0.43, hole: 0.7, slices, ariaLabel: '職種別の勤務時間のドーナツグラフ', minLabelShare: 0.04 }));
    area.appendChild(h('div', { class: 'ring-center', style: { top: (198 / 2) + 'pt' } },
      h('div', { class: 'cl', 'data-cell': 'T22' }, T(view, 'dashtop_job_center_label') || '主に担当'),
      h('div', { class: 'cv job', 'data-cell': 'T23' }, T(view, 'dashtop_job_center_value') || '－')));
    card.appendChild(area);
    const slots = TA(view, 'dashtop_job_legend_slot', 6);
    const idx = fam(view, 'dashtop_job_legend_idx', 21).map(raw);
    const lg = h('div', { class: 'job-legend' });
    const SLOT_CELLS = ['R30', 'T30', 'V30', 'R31', 'T31', 'V31'];
    slots.forEach((txt, j) => {
      const li = h('div', { class: 'li', 'data-cell': SLOT_CELLS[j] });
      if (txt) {
        let ci = isNum(idx[j]) ? idx[j] - 1 : -1;
        if (ci < 0) ci = labels.findIndex(l => l !== '' && txt.indexOf(l + ' ') === 0);
        li.appendChild(C().swatch('rect', ci >= 0 ? jobColor(ci) : JOB_OTHER));
        li.appendChild(h('span', { class: 't' }, txt));
      }
      lg.appendChild(li);
    });
    const lr = h('div', { class: 'legend-row' }, lg);
    card.appendChild(lr);
    return card;
  }

  function weekdayCard(view) {
    const card = h('div', { class: 'card weekday-card', style: gc('B', 'H') });
    const area = h('div', { class: 'chart-area area2b' });
    let labels = TA(view, 'dashtop_wd_label', 7);
    if (!labels.some(x => x)) labels = WD_DEFAULT.slice();
    const vals = fam(view, 'dashtop_wd_work_days', 7).map(raw).map(N0);
    const colors = labels.map((_, i) => (i >= 5 ? COL_WEEKEND : COL_WEEKDAY));
    area.appendChild(C().bars({
      w: CARD_W, h: Math.round(213 * PT), categories: labels, values: vals, colors, step: 5, fmt: v => String(v),
      ariaLabel: '曜日別の出勤日数の棒グラフ',
      tip: i => ({ title: labels[i] + '曜日', rows: [{ color: colors[i], value: vals[i] + '日', label: '出勤日数' }] }),
    }));
    card.appendChild(area);
    card.appendChild(C().legend([{ label: '平日', color: COL_WEEKDAY, kind: 'rect' }, { label: '土日', color: COL_WEEKEND, kind: 'rect' }], 'weekday-legend'));
    return card;
  }

  function radarCard(view, sel) {
    const card = h('div', { class: 'card', style: gc('J', 'P') });
    const area = h('div', { class: 'chart-area area2' });
    let labels = TA(view, 'dashtop_band_label', 5);
    if (!labels.some(x => x)) labels = BAND_DEFAULT.slice();
    const self = fam(view, 'dashtop_band_self', 5).map(raw).map(N0);
    const all = fam(view, 'dashtop_band_all', 5).map(raw).map(N0);
    const dept = fam(view, 'dashtop_band_dept', 5).map(raw).map(N0);
    area.appendChild(C().radar({
      w: CARD_W, h: Math.round(162 * PT), labels, ariaLabel: '出勤時間帯のレーダーチャート（本人・全体・同所属）',
      series: [
        { name: '本人', color: R_SELF, width: 2.5, values: self, dots: true },
        { name: '全体', color: R_ALL, width: 2, values: all },
        { name: '同所属', color: R_DEPT, width: 2, values: dept }],
      tip: i => ({ title: labels[i], rows: [
        { color: R_SELF, value: sel ? fmtPct(self[i], 1) : '－', label: '本人' },
        { color: R_ALL, value: fmtPct(all[i], 1), label: '全体' },
        { color: R_DEPT, value: sel ? fmtPct(dept[i], 1) : '－', label: '同所属' }] }),
    }));
    card.appendChild(area);
    // number table (rows 43–46)
    const tbl = pick(view, 'dashtop_radar_table');
    const rowsT = [null, null, null];
    if (tbl && typeof tbl === 'object') {
      const keys = [['self', 0], ['all', 1], ['dept', 2]];
      if (Array.isArray(tbl) && tbl.length >= 3 && Array.isArray(tbl[0])) { rowsT[0] = tbl[0]; rowsT[1] = tbl[1]; rowsT[2] = tbl[2]; }
      else for (const [k, i] of keys) if (Array.isArray(tbl[k])) rowsT[i] = tbl[k];
    }
    const vals = [self, all, dept];
    const t = h('table', { class: 'radar-tbl' });
    const hr = h('tr', null, h('th', { colspan: 2 }, ''));
    const BAND_COLS = ['L', 'M', 'N', 'O', 'P'];
    BAND_SHORT.forEach((b, i) => hr.appendChild(h('th', { 'data-cell': BAND_COLS[i] + '43' }, b)));
    t.appendChild(h('thead', null, hr));
    const tb = h('tbody');
    const RL = [['● 本人', '本人', R_SELF, 'dotline', 'self'], ['― 全体', '全体', R_ALL, 'line', 'all'], ['― 同所属', '同所属', R_DEPT, 'line', 'dept']];
    RL.forEach((rl, ri) => {
      const tr = h('tr', { class: rl[4] });
      tr.appendChild(h('td', { class: 'rl', colspan: 2, 'data-cell': 'J' + (44 + ri) }, C().swatch(rl[3], rl[2]), rl[1]));
      for (let b = 0; b < 5; b++) {
        let s = '';
        if (rowsT[ri]) { const x = rowsT[ri][b]; s = textOf(x) !== undefined ? String(textOf(x)) : fmtCell(raw(x), 'pct0'); }
        else s = sel ? fmtPct(vals[ri][b], 0) : '';
        tr.appendChild(h('td', { 'data-cell': BAND_COLS[b] + (44 + ri) }, s));
      }
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    card.appendChild(t);
    return card;
  }

  function timingCard(view, sel) {
    const card = h('div', { class: 'card', style: gc('R', 'X') });
    const box = h('div', { class: 'timing' });
    const rc = pick(view, ['dashtop_rest_count', 'dbcalc_rest_days']);
    const rct = pick(view, 'dashtop_rest_count_text');
    const CODES = ['事前', '前日', '当日', '事後'];
    const restText = ci => {
      const code = CODES[ci];
      if (rct !== undefined && rct !== null) {
        const x = Array.isArray(rct) ? rct[ci] : rct[code];
        if (x !== undefined && x !== null) return String(x);
      }
      if (!sel) return '';
      let v = rc === undefined || rc === null ? undefined : (Array.isArray(rc) ? rc[ci] : rc[code]);
      v = raw(v);
      return fmtCell(isNum(v) ? v : 0, 'd');
    };
    box.appendChild(h('div', { class: 'r34' }));
    const cellSpan = (cell, cls, text) => h('span', { class: cls || null, 'data-cell': cell }, text);
    box.appendChild(h('div', { class: 'th' }, cellSpan('R35', null, '区分'), cellSpan('V35', null, '日数')));
    box.appendChild(h('div', { class: 'it' }, cellSpan('R36', null, '事前（2日以上前）'), cellSpan('V36', 'v', restText(0))));
    box.appendChild(h('div', { class: 'it' }, cellSpan('R38', null, '前日'), cellSpan('V38', 'v', restText(1))));
    box.appendChild(h('div', { class: 'it sep' }, cellSpan('R40', null, '当日（＝欠勤）'), cellSpan('V40', 'v today', restText(2))));
    box.appendChild(h('div', { class: 'it' }, cellSpan('R42', null, '当日遅出'), cellSpan('V42', 'v chg', T(view, 'dashtop_timing_late'))));
    box.appendChild(h('div', { class: 'it' }, cellSpan('R44', null, '当日早退'), cellSpan('V44', 'v chg', T(view, ['dashtop_timing_early', 'dashtop_timing_early_leave']))));
    box.appendChild(h('div', { class: 'note', 'data-cell': 'R46' }, T(view, 'dashtop_timing_note')));
    card.appendChild(box);
    return card;
  }

  function colgroup(spans) {
    const cg = h('colgroup');
    for (const s of spans) cg.appendChild(h('col', { style: { width: (s / 23 * 100).toFixed(4) + '%' } }));
    return cg;
  }

  function monthTable(view, th) {
    const wrap = h('div');
    wrap.appendChild(h('div', { class: 'd-r48' }));
    wrap.appendChild(h('div', { class: 'd-sec-title r49', 'data-cell': 'B49' }, T(view, 'dashbottom_month_title') || '月別の実績'));
    wrap.appendChild(h('div', { class: 'd-r50' }));
    const t = h('table', { class: 'dtbl month-tbl' });
    t.appendChild(colgroup([4, 2, 2, 3, 3, 3, 2, 2, 2]));
    const HD = [['月', 'l'], ['出勤日数', 'r'], ['欠勤日数', 'r'], ['確定シフト', 'r'], ['出勤率', 'r'], ['勤務時間', 'r'], ['1日平均', 'r'], ['土日祝', 'r'], ['前日変更', 'r']];
    const MC = ['B', 'F', 'H', 'J', 'M', 'P', 'S', 'U', 'W'];      // workbook columns of the 9 table columns
    t.appendChild(h('thead', null, h('tr', null, HD.map(([x, a], i) => h('th', { class: a, 'data-cell': MC[i] + '51' }, x)))));
    const COLS = [['work_days', 'd'], ['abs_days', 'd'], ['confirmed_days', 'd'], ['att_rate', 'pct1'], ['work_hours', 'h1'], ['avg_hours', 'h1'], ['busy_work_days', 'd'], ['prevday_rest_days', 'd']];
    const labels = TA(view, 'dashbottom_month_label', 6);
    const vals = COLS.map(([k]) => fam(view, 'dashbottom_month_' + k, 6).map(raw));
    const txts = COLS.map(([k, f]) => TA(view, 'dashbottom_month_' + k, 6, f));
    const tb = h('tbody');
    for (let r = 0; r < 6; r++) {
      const tr = h('tr', null, h('td', { class: 'l', 'data-cell': 'B' + (52 + r) }, labels[r]));
      COLS.forEach(([k], ci) => {
        const v = vals[ci][r];
        const td = h('td', { class: 'r', 'data-cell': MC[ci + 1] + (52 + r) });
        if (k === 'work_days' && isNum(v)) {
          td.classList.add('databar');
          td.appendChild(h('span', { class: 'bar', style: { width: (10 + 80 * Math.min(Math.max(v, 0), 31) / 31).toFixed(2) + '%' } }));
          td.appendChild(h('span', { class: 'v' }, txts[ci][r]));
        } else td.textContent = txts[ci][r];
        if (k === 'abs_days' && isNum(v) && v > 0) td.classList.add('cf-red');
        if (k === 'att_rate') { const c = rateClass(v, th); if (c) td.classList.add(c, 'cf-bold'); }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
    const tr = h('tr', { class: 'total' }, h('td', { class: 'l', 'data-cell': 'B58' }, T(view, 'dashbottom_month_total_label') || '合計'));
    COLS.forEach(([k, f], ci) => {
      const v = R(view, 'dashbottom_month_total_' + k);
      const td = h('td', { class: 'r', 'data-cell': MC[ci + 1] + '58' }, T(view, 'dashbottom_month_total_' + k, f));
      if (k === 'att_rate') { const c = rateClass(v, th); if (c) td.classList.add(c); }
      tr.appendChild(td);
    });
    tb.appendChild(tr);
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }

  function showAllButton(page, label) {
    return h('div', { class: 'show-all-row screen-only' },
      h('button', { type: 'button', class: 'btn btn-small', 'aria-expanded': 'false', onclick: ev => {
        const on = !page.classList.contains('show-all');
        page.classList.toggle('show-all', on);
        page.querySelectorAll('.show-all-row button').forEach(b => {
          b.setAttribute('aria-expanded', on ? 'true' : 'false');
          b.textContent = on ? '印刷と同じ件数に戻す' : b.dataset.label;
        });
        ev.currentTarget.focus();
      }, 'data-label': label }, label));
  }

  function absList(view, page, live) {
    const wrap = h('div');
    wrap.appendChild(h('div', { class: 'd-r59' }));
    wrap.appendChild(h('div', { class: 'd-sec-title r60', 'data-cell': 'B60' }, T(view, 'dashbottom_abs_title') || '欠勤（当日に休みへ変更）・当日の時間変更の一覧'));
    wrap.appendChild(h('div', { class: 'd-r61' }));
    const t = h('table', { class: 'dtbl abs-tbl' });
    t.appendChild(colgroup([3, 1, 4, 3, 4, 4, 4]));
    const HD = [['日付', 'l'], ['曜', 'c'], ['区分', 'l'], ['変更した日時', 'l'], ['元のシフト時間', 'l'], ['変更後', 'l'], ['募集の職種', 'l']];
    const AC = ['B', 'E', 'F', 'J', 'M', 'Q', 'U'];
    t.appendChild(h('thead', null, h('tr', null, HD.map(([x, a], i) => h('th', { class: a, 'data-cell': AC[i] + '62' }, x)))));
    const rows = fam(view, 'dashbottom_abs_row');
    const P = 'dashbottom_abs_row_';
    const n = Math.max(ABS_ROWS, rows.length);
    const tb = h('tbody');
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      const kind = r ? rft(r, 'kind_label', P) : '';
      const dc = c => (i < ABS_ROWS ? c + (63 + i) : null);
      const tr = h('tr', { class: i >= ABS_ROWS ? 'extra-row' : null },
        h('td', { class: 'l', 'data-cell': dc('B') }, r ? rft(r, 'date', P, 'md') : ''),
        h('td', { class: 'c', 'data-cell': dc('E') }, r ? rft(r, 'weekday', P) : ''),
        h('td', { class: 'l' + (kind === '欠勤' ? ' kind-red' : ''), 'data-cell': dc('F') }, kind),
        h('td', { class: 'l', 'data-cell': dc('J') }, r ? rft(r, 'updated', P, 'mdhm') : ''),
        h('td', { class: 'l', 'data-cell': dc('M') }, r ? rft(r, 'orig_time', P) : ''),
        h('td', { class: 'l', 'data-cell': dc('Q') }, r ? rft(r, 'new_time', P) : ''),
        h('td', { class: 'l', 'data-cell': dc('U') }, r ? rft(r, 'job_label', P) : ''));
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    wrap.appendChild(t);
    wrap.appendChild(h('div', { class: 'd-foot r75', 'data-cell': 'B75' }, T(view, 'dashbottom_abs_footnote')));
    if (live && rows.length > ABS_ROWS) wrap.appendChild(showAllButton(page, 'すべて表示（' + rows.length + '件）'));
    return wrap;
  }

  function busyBlock(view, page, live) {
    const wrap = h('div');
    wrap.appendChild(h('div', { class: 'd-r76' }));
    wrap.appendChild(h('div', { class: 'd-sec-title r77', 'data-cell': 'B77' }, T(view, 'dashbottom_busy_title') || '繁忙日（祝日・GW・お盆・年末年始）の出勤状況'));
    wrap.appendChild(h('div', { class: 'd-r78' }));
    wrap.appendChild(h('div', { class: 'd-busy-sum', 'data-cell': 'B79' }, T(view, 'dashbottom_busy_summary_line')));
    wrap.appendChild(h('div', { class: 'd-extra', 'data-cell': 'B80' }, T(view, 'dashbottom_busy_extra_apps_line')));
    wrap.appendChild(h('div', { class: 'd-sublab r81', 'data-cell': 'B81' }, T(view, 'dashbottom_busy_runs_label')));
    const t = h('table', { class: 'dtbl runs-tbl' });
    t.appendChild(colgroup([11, 6, 3, 3]));
    t.appendChild(h('thead', null, h('tr', null, h('th', { class: 'l', 'data-cell': 'B82' }, '期間'), h('th', { class: 'c', 'data-cell': 'M82' }, '繁忙日'),
      h('th', { class: 'c', 'data-cell': 'S82' }, '日数'), h('th', { class: 'c', 'data-cell': 'V82' }, '出勤'))));
    const runs = fam(view, 'dashbottom_busy_run_row');
    const P = 'dashbottom_busy_run_row_';
    const tb = h('tbody');
    const n = Math.max(RUN_ROWS, runs.length);
    for (let m = 0; m < n; m++) {
      const r = runs[m];
      const dc = c => (m < RUN_ROWS ? c + (83 + m) : null);
      tb.appendChild(h('tr', { class: m >= RUN_ROWS ? 'extra-row' : null },
        h('td', { class: 'l', 'data-cell': dc('B') }, r ? rft(r, 'period', P) : ''),
        h('td', { class: 'l', 'data-cell': dc('M') }, r ? rft(r, 'names', P) : ''),
        h('td', { class: 'c', 'data-cell': dc('S') }, r ? rft(r, 'len', P, 'd') : ''),
        h('td', { class: 'c', 'data-cell': dc('V') }, r ? rft(r, 'worked', P, 'd') : '')));
    }
    t.appendChild(tb);
    wrap.appendChild(t);
    wrap.appendChild(h('div', { class: 'd-sublab r89', 'data-cell': 'B89' }, T(view, 'dashbottom_busy_missed_label') || '出勤していない繁忙日'));
    const cells = fam(view, 'dashbottom_busy_missed_cell').map(x => (textOf(x) !== undefined ? String(textOf(x)) : fmtCell(raw(x))));
    const nc = Math.max(BUSY_CELLS, Math.ceil(cells.length / 3) * 3);
    const grid = h('div', { class: 'missed-grid' });
    const BL = [['B', 'H'], ['J', 'P'], ['R', 'X']];
    for (let r0 = 0; r0 < nc; r0 += 3) {
      const row = h('div', { class: 'g23' + (r0 >= BUSY_CELLS ? ' extra-row' : '') });
      for (let b = 0; b < 3; b++) {
        row.appendChild(h('div', { class: 'mc', style: gc(BL[b][0], BL[b][1]), 'data-cell': r0 < BUSY_CELLS ? BL[b][0] + (90 + r0 / 3) : null }, cells[r0 + b] || ''));
      }
      grid.appendChild(row);
    }
    wrap.appendChild(grid);
    wrap.appendChild(h('div', { class: 'd-foot r98', 'data-cell': 'B98' }, T(view, 'dashbottom_busy_footnote')));
    if (live && (runs.length > RUN_ROWS || cells.filter(x => x).length > BUSY_CELLS)) wrap.appendChild(showAllButton(page, 'すべて表示（連休 ' + runs.length + '件・繁忙日 ' + cells.filter(x => x).length + '日）'));
    return wrap;
  }

  function computeView(name) {
    if (!state.WB) return {};
    return engineCall('view', [state.WB, name], {}) || {};
  }

  function renderDash() {
    const host = clear($('dash-host'));
    const name = currentName();
    state.view = computeView(name);
    fillStaffSelect();
    const page = buildDashboard(state.view, { live: true, filterMsg: filterMessage(), staffText: name });
    host.appendChild(page);
    fitDash();
    updateNav();
    state.dirty.dash = false;
  }
  function fitDash() {
    const page = $('dash-host').firstChild;
    if (!page) return;
    const avail = $('dash-fit').clientWidth;
    const z = avail > 0 && avail < DASH_W ? Math.max(0.5, avail / DASH_W) : 1;
    page.style.zoom = z === 1 ? '' : String(z);
  }
  function fillStaffSelect() {
    const sel = state.ui.staffSelect;
    clear(sel);
    const name = currentName();
    const cands = state.cands;
    if (!cands.length && !name) {
      sel.appendChild(h('option', { value: '' }, state.files.length ? 'スタッフがいません' : 'まずCSVを読み込んでください'));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    if (name && cands.indexOf(name) < 0) sel.appendChild(h('option', { value: name }, name));
    const seen = new Set();
    for (const n of cands) {
      const o = h('option', { value: n }, n);
      if (seen.has(n)) o.setAttribute('data-dup', '1');
      seen.add(n);
      sel.appendChild(o);
    }
    sel.value = name;
  }
  function updateNav() {
    const name = currentName();
    const list = state.cands;
    const i = list.indexOf(name);
    $('btn-prev').disabled = !(i > 0);
    $('btn-next').disabled = !(i >= 0 && i < list.length - 1) && !(i < 0 && list.length > 0);
    $('nav-pos').textContent = list.length ? (i >= 0 ? (i + 1) + ' / ' + list.length + ' 名' : list.length + ' 名') : '';
    $('btn-print-all').disabled = allNames().length === 0;
  }
  function selectStaff(name) {
    state.selName = name;
    renderDash();
  }
  function step(d) {
    const list = state.cands;
    const name = currentName();
    let i = list.indexOf(name);
    if (i < 0) i = d > 0 ? -1 : list.length;
    const j = i + d;
    if (j >= 0 && j < list.length) selectStaff(list[j]);
  }
  function onFilterInput() {
    state.filterQ = state.ui.filterInput.value;
    updateFilter();
    const m = filterMessage();
    const el = $('d-filter-msg');
    if (el) { el.textContent = m.text; el.classList.toggle('bad', m.bad); }
    fillStaffSelect();
    updateNav();
  }

  /* ================================================================ スタッフ一覧 */
  const LP = 'lists_staff_';
  const LIST_COLS = [
    { k: 'rank', h: '順位', fmt: '0', cls: 'ctr', sticky: 1 },
    { k: 'name', h: '名前', link: true, sticky: 2 },
    { k: 'id', h: '従業員番号', fmt: '0', cls: 'ctr' },
    { k: 'dept', h: '所属' },
    { k: 'qual', h: '資格' },
    { k: 'work_days', h: '出勤日数', fmt: 'd', cls: 'num', cf: 'bar' },
    { k: 'absent_days', h: '当日欠勤', fmt: 'd', cls: 'num', cf: 'red' },
    { k: 'shift_days', h: '確定シフト日数', fmt: 'd', cls: 'num' },
    { k: 'attend_rate', h: '出勤率', fmt: 'pct1', cls: 'num', cf: 'rate' },
    { k: 'absent_rate', h: '当欠率', fmt: 'pct1', cls: 'num', cf: 'alert' },
    { k: 'judgement', h: '判定', cls: 'ctr', cf: 'judge' },
    { k: 'work_hours', h: 'シフト勤務時間', fmt: 'h1', cls: 'num' },
    { k: 'avg_hours', h: '平均 h／日', fmt: 'f1', cls: 'num' },
    { k: 'night_hours', h: '深夜時間', fmt: 'h1', cls: 'num' },
    { k: 'months', h: '在籍月数', fmt: 'months', cls: 'num mut' },
    { k: 'late_days', h: '当日遅出', fmt: 'd', cls: 'num', extra: true },
    { k: 'late_rate', h: '当日遅出率', fmt: 'pct1', cls: 'num', extra: true },
    { k: 'early_days', h: '当日早退', fmt: 'd', cls: 'num', extra: true },
    { k: 'early_rate', h: '当日早退率', fmt: 'pct1', cls: 'num', extra: true },
    { k: 'busy_days', h: '土日祝出勤', fmt: 'd', cls: 'num', extra: true },
    { k: 'busy_rate', h: '土日祝出勤率', fmt: 'pct1', cls: 'num', extra: true },
    { k: 'extra_apps', h: '追加応募', fmt: 'ken', cls: 'num', extra: true },
    { k: 'extra_apps_busy', h: '追加応募\n（繁忙日）', fmt: 'ken', cls: 'num', extra: true },
  ];
  const JUDGE_ORDER = ['◎ 良好', '△ 注意', '✕ 要改善', '参考値', '－'];

  function staffRows() {
    const W = state.WB;
    let rows = pick(W, ['lists_staff_rows', 'lists_staff_list', 'lists_staff_table']);
    if (Array.isArray(rows)) return rows.filter(r => r && typeof r === 'object');
    // column arrays (lists_staff_name[n], ...)
    const names = fam(W, 'lists_staff_name');
    if (!names.length) return [];
    const cols = {};
    for (const c of LIST_COLS) cols[c.k] = fam(W, LP + c.k);
    const mw = fam(W, 'lists_staff_month_work'), ma = fam(W, 'lists_staff_month_absent');
    const out = [];
    for (let i = 0; i < names.length; i++) {
      const r = {};
      for (const c of LIST_COLS) r[c.k] = cols[c.k][i];
      r.month_work = mw[i]; r.month_absent = ma[i];
      if (refName(raw(r.name)) === '' && raw(r.name) === undefined) continue;
      out.push(r);
    }
    return out;
  }
  function monthCells(row, key) {
    let v = rf(row, key, LP);
    if (v && !Array.isArray(v) && typeof v === 'object') v = fam({ x: v }, 'x', 6);
    const arr = Array.isArray(v) ? (v.length === 7 && v[0] == null ? v.slice(1) : v) : [];
    const out = [];
    for (let k = 0; k < 6; k++) {
      let x = arr[k];
      if (x === undefined) x = rf(row, key + '_' + (k + 1), LP);
      out.push(x);
    }
    return out;
  }
  /** 0 → A, 25 → Z, 26 → AA (the スタッフ一覧 column of the i-th table column) */
  function colLetter(i) { return (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26)); }
  function judgeClass(t) {
    return t === '参考値' ? 'jd-ref' : (t === '◎ 良好' ? 'jd-good' : (t === '△ 注意' ? 'jd-warn' : (t === '✕ 要改善' ? 'jd-crit' : '')));
  }
  function renderList() {
    const W = state.WB;
    $('list-period').textContent = T(W, 'lists_staff_period_text');
    const hw = TA(W, 'lists_staff_hdr_work', 6), ha = TA(W, 'lists_staff_hdr_absent', 6);
    const labels = TA(W, 'roster_month_label', 6);
    const monthCols = [];
    for (let k = 0; k < 6; k++) monthCols.push({ k: 'mw' + k, h: hw[k] || ('出勤\n' + (labels[k] || '月' + (k + 1) + '（未貼付）')), fmt: '0', cls: 'num', extra: true, month: ['month_work', k] });
    for (let k = 0; k < 6; k++) monthCols.push({ k: 'ma' + k, h: ha[k] || ('欠勤\n' + (labels[k] || '月' + (k + 1) + '（未貼付）')), fmt: '0', cls: 'num', extra: true, month: ['month_absent', k] });
    const cols = LIST_COLS.concat(monthCols);     // = スタッフ一覧 columns A..AI in order
    state.listCols = cols;
    // header
    const thead = clear($('staff-head'));
    const tr = h('tr');
    cols.forEach((c, ci) => {
      const st = state.list.sortKey === c.k ? state.list.sortDir : 0;
      const th = h('th', { scope: 'col', tabindex: '0', 'data-col': colLetter(ci), class: (c.extra ? 'col-extra' : '') + (c.sticky ? ' sticky-' + c.sticky : ''),
        'aria-sort': st === 1 ? 'ascending' : (st === -1 ? 'descending' : 'none'), title: 'クリックで並べ替え' },
        c.h, h('span', { class: 'sort-ind', 'aria-hidden': 'true' }, st === 1 ? '▲' : (st === -1 ? '▼' : '')));
      th.addEventListener('click', () => sortBy(c.k));
      th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(c.k); } });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    // rows (prepared once per WB)
    const rows = staffRows().map((r, i) => {
      const o = { i, r, raw: {}, txt: {} };
      for (const c of cols) {
        if (c.month) {
          const mv = monthCells(r, c.month[0])[c.month[1]];
          o.raw[c.k] = raw(mv);
          o.txt[c.k] = textOf(mv) !== undefined ? String(textOf(mv)) : fmtCell(raw(mv), c.fmt);
        } else {
          o.raw[c.k] = raw(rf(r, c.k, LP));
          o.txt[c.k] = rft(r, c.k, LP, c.fmt);
        }
      }
      return o;
    });
    state.listRows = rows;
    // filter choices
    const deptSel = $('list-dept'), judgeSel = $('list-judge');
    const depts = [];
    for (const o of rows) { const d = o.txt.dept; if (d !== '' && depts.indexOf(d) < 0) depts.push(d); }
    refillSelect(deptSel, depts, state.list.dept);
    const js = JUDGE_ORDER.filter(j => rows.some(o => o.txt.judgement === j));
    refillSelect(judgeSel, js, state.list.judge);
    drawListBody();
    state.dirty.list = false;
  }
  function refillSelect(sel, values, cur) {
    clear(sel);
    sel.appendChild(h('option', { value: '' }, 'すべて'));
    for (const v of values) sel.appendChild(h('option', { value: v }, v));
    sel.value = values.indexOf(cur) >= 0 ? cur : '';
  }
  const collator = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('ja') : null;
  function cmpVals(a, b) {
    const na = isNum(a), nb = isNum(b);
    if (na && nb) return a - b;
    if (na) return -1;
    if (nb) return 1;
    const sa = a == null ? '' : String(a), sb = b == null ? '' : String(b);
    if (sa === '' && sb !== '') return 1;
    if (sb === '' && sa !== '') return -1;
    return collator ? collator.compare(sa, sb) : (sa < sb ? -1 : sa > sb ? 1 : 0);
  }
  function sortBy(k) {
    const L = state.list;
    if (L.sortKey !== k) { L.sortKey = k; L.sortDir = 1; }
    else if (L.sortDir === 1) L.sortDir = -1;
    else { L.sortKey = null; L.sortDir = 0; }
    renderList();
  }
  function drawListBody() {
    const L = state.list;
    const cols = state.listCols;
    let rows = state.listRows.slice();
    const q = L.q.trim().toLowerCase();
    if (q) rows = rows.filter(o => (o.txt.name || '').toLowerCase().indexOf(q) >= 0 || (o.txt.id || '').toLowerCase().indexOf(q) >= 0 ||
      xlText(o.raw.id).toLowerCase().indexOf(q) >= 0);
    if (L.dept) rows = rows.filter(o => o.txt.dept === L.dept);
    if (L.judge) rows = rows.filter(o => o.txt.judgement === L.judge);
    if (L.sortKey) {
      const k = L.sortKey, d = L.sortDir;
      rows.sort((a, b) => {
        const x = cmpVals(a.raw[k] !== undefined ? a.raw[k] : a.txt[k], b.raw[k] !== undefined ? b.raw[k] : b.txt[k]);
        if (x !== 0) {
          const ea = a.raw[k] === '' || a.raw[k] == null, eb = b.raw[k] === '' || b.raw[k] == null;
          if (ea !== eb) return ea ? 1 : -1;   // blanks stay last either way
          return d * x;
        }
        return a.i - b.i;
      });
    }
    const maxF = state.listRows.reduce((m, o) => (isNum(o.raw.work_days) && o.raw.work_days > m ? o.raw.work_days : m), 0);
    const tb = clear($('staff-body'));
    const frag = document.createDocumentFragment();
    for (const o of rows) {
      const tr = h('tr');
      for (let ci = 0; ci < cols.length; ci++) {
        const c = cols[ci];
        const v = o.raw[c.k], t = o.txt[c.k];
        const td = h('td', { class: (c.cls || '') + (c.extra ? ' col-extra' : '') + (c.sticky ? ' sticky-' + c.sticky : ''), 'data-col': colLetter(ci) });
        if (c.link && t !== '') {
          const a = h('a', { href: '#', class: 'name-link', title: 'この人のダッシュボードを開く' }, t);
          a.addEventListener('click', e => { e.preventDefault(); openStaff(t); });
          td.appendChild(a);
        } else if (c.cf === 'bar' && isNum(v)) {
          td.classList.add('databar');
          const pct = maxF > 0 ? 10 + 80 * Math.max(0, v) / maxF : 10;
          td.appendChild(h('span', { class: 'bar', style: { width: pct.toFixed(2) + '%' } }));
          td.appendChild(h('span', { class: 'v' }, t));
        } else td.textContent = t;
        if (c.cf === 'red' && isNum(v) && v > 0) td.classList.add('cf-red');
        if (c.cf === 'alert' && isNum(v) && v >= thr('alertRate')) td.classList.add('cf-alert');
        if (c.cf === 'rate' && isNum(v)) td.classList.add(v >= thr('rateGood') ? 'cf-bold' : (v >= thr('rateWarn') ? 'cf-amber' : 'cf-red'));
        if (c.cf === 'judge') { const jc = judgeClass(t); if (jc) td.classList.add(jc); }
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
    $('list-count').textContent = state.listRows.length ? '表示 ' + rows.length + ' / ' + state.listRows.length + ' 名' : 'データがありません';
  }
  function openStaff(name) {
    state.selName = name;
    state.dirty.dash = true;
    switchTab('dash');
  }

  /* ================================================================ 全体サマリー */
  function renderSum() {
    const W = state.WB;
    const host = clear($('sum-host'));
    host.appendChild(h('h1', { class: 'sheet-title', 'data-cell': 'A1' }, T(W, 'lists_sum_title') || '全体サマリー（半年集計）'));
    host.appendChild(h('p', { class: 'sheet-sub', 'data-cell': 'A2' }, T(W, 'lists_sum_period_text')));
    const TILES = [
      ['lists_sum_tile_staff_count', 'roster_total_staff', 'スタッフ数', 'mei', ACC_NEUTRAL, 'A'],
      ['lists_sum_tile_eval_count', 'roster_total_evaluated', '評価対象（確定シフトあり）', 'mei', ACC_NEUTRAL, 'C'],
      ['lists_sum_tile_attend_rate', 'roster_total_att_rate', '全体出勤率', 'pct1', ACC_WORK, 'E'],
      ['lists_sum_tile_absent_rate', 'roster_total_abs_rate', '全体当欠率', 'pct1', ACC_ABS, 'G'],
      ['lists_sum_tile_work_days', 'roster_total_work_days', '総出勤日数', 'kdays', ACC_WORK, 'J'],
      ['lists_sum_tile_alert_count', 'roster_total_alert_count', '当欠アラート該当', 'mei', ACC_ABS, 'K'],
    ];
    const tiles = h('div', { class: 'sum-tiles' });
    for (const [id, alt, label, fmt, acc, col] of TILES) {
      tiles.appendChild(h('div', { class: 'sum-tile', style: { '--acc': acc } },
        h('div', { class: 'lab', 'data-cell': col + '4' }, label), h('div', { class: 'val', 'data-cell': col + '5' }, T(W, [id, alt], fmt))));
    }
    host.appendChild(tiles);
    const grid = h('div', { class: 'sum-tables' });
    // 所属別
    const dl = h('div');
    dl.appendChild(h('h3', { 'data-cell': 'A7' }, '所属別'));
    const t = h('table', { class: 'tbl sum-tbl' });
    const DC = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    t.appendChild(h('thead', null, h('tr', null, ['所属', '人数', '出勤日数', '欠勤', '確定シフト', '出勤率', '当欠率'].map((x, i) => h('th', { 'data-cell': DC[i] + '8' }, x)))));
    const tb = h('tbody');
    let drows = fam(W, 'lists_sum_dept_rows', 20);
    const DP = 'lists_sum_dept_rows_';
    const DK = [['name', null, 'l'], ['headcount', 'mei', 'num'], ['work_days', 'kdays', 'num'], ['absent_days', 'kdays', 'num'], ['shift_days', 'kdays', 'num'], ['attend_rate', 'pct1', 'num'], ['absent_rate', 'pct1', 'num']];
    if (!drows.some(x => x)) {
      // fall back to the roster dept arrays
      const RK = { name: 'roster_dept_label', headcount: 'roster_dept_headcount', work_days: 'roster_dept_work_days', absent_days: 'roster_dept_abs_days', shift_days: 'roster_dept_confirmed_days', attend_rate: 'roster_dept_att_rate', absent_rate: 'roster_dept_abs_rate' };
      const arrs = {};
      for (const k of Object.keys(RK)) arrs[k] = fam(W, RK[k], 20);
      drows = [];
      for (let i = 0; i < 20; i++) { const o = {}; for (const k of Object.keys(RK)) o[k] = arrs[k][i]; drows.push(o); }
    }
    let last = -1;
    drows.forEach((r, i) => { if (r && rft(r, 'name', DP) !== '') last = i; });
    for (let i = 0; i <= last; i++) {
      const r = drows[i];
      const blank = !r || rft(r, 'name', DP) === '';
      const tr = h('tr', { class: blank ? 'blank' : null });
      DK.forEach(([k, f, cls], ci) => tr.appendChild(h('td', { class: cls, 'data-cell': DC[ci] + (9 + i) }, blank ? '' : rft(r, k, DP, f))));
      tb.appendChild(tr);
    }
    if (last < 0) tb.appendChild(h('tr', null, h('td', { colspan: 7, class: 'l' }, '（「設定」タブの所属の一覧が空です）')));
    t.appendChild(tb);
    dl.appendChild(t);
    grid.appendChild(dl);
    // ワースト10
    const wl = h('div');
    const wt = T(W, 'lists_sum_worst_title') || '当欠率 ワースト10';
    wl.appendChild(h('h3', { 'data-cell': 'J7' }, wt));
    const t2 = h('table', { class: 'tbl sum-tbl' });
    const WC = ['J', 'K', 'L', 'M', 'N'];
    t2.appendChild(h('thead', null, h('tr', null, ['名前', '所属', '確定シフト', '欠勤', '当欠率'].map((x, i) => h('th', { 'data-cell': WC[i] + '8' }, x)))));
    const tb2 = h('tbody');
    const wrows = fam(W, 'lists_sum_worst_rows', 10);
    const WP = 'lists_sum_worst_rows_';
    const alertT = thr('alertRate');
    for (let n = 0; n < 10; n++) {
      const r = wrows[n];
      const rate = r ? raw(rf(r, 'absent_rate', WP)) : '';
      tb2.appendChild(h('tr', null,
        h('td', { class: 'l', 'data-cell': 'J' + (9 + n) }, r ? rft(r, 'name', WP) : ''),
        h('td', { class: 'l', 'data-cell': 'K' + (9 + n) }, r ? rft(r, 'dept', WP) : ''),
        h('td', { class: 'num', 'data-cell': 'L' + (9 + n) }, r ? rft(r, 'shift_days', WP, 'd') : ''),
        h('td', { class: 'num', 'data-cell': 'M' + (9 + n) }, r ? rft(r, 'absent_days', WP, 'd') : ''),
        h('td', { class: 'num' + (isNum(rate) && rate >= alertT ? ' cf-alert' : ''), 'data-cell': 'N' + (9 + n) }, r ? rft(r, 'absent_rate', WP, 'pct1') : '')));
    }
    t2.appendChild(tb2);
    wl.appendChild(t2);
    grid.appendChild(wl);
    host.appendChild(grid);
    state.dirty.sum = false;
  }

  /* ================================================================ 設定 */
  const PCT_ERR = ['割合で入力してください', '0〜1 の値で入力してください（95% は 95% または 0.95）'];
  const DAY_ERR = ['日数で入力してください', '0〜60 の整数で入力してください'];
  function fmtSetting(key, v) {
    if (v === '' || v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (key === 'alertRate' || key === 'rateGood' || key === 'rateWarn') {
      // the 設定 cell format (0% / 0.0% for B6) — unless that would hide what was typed (99.5% must not read 100%)
      const t = fmtPct(v, key === 'alertRate' ? 1 : 0);
      return Math.abs(parseFloat(t) / 100 - v) < 1e-12 ? t : Number((v * 100).toPrecision(12)) + '%';
    }
    if (key === 'minDays') return fmtFixed(v, 0);
    if (key === 'nightStart' || key === 'nightEnd') return fmtElapsedHM(v);
    return xlText(v);
  }
  function parseSetting(key, text) {
    const t = String(text).normalize('NFKC').trim();
    if (key === 'theatre') return { ok: true, v: String(text) };
    if (t === '') return { ok: true, v: '' };
    if (key === 'rateGood' || key === 'rateWarn' || key === 'alertRate') {
      const pct = /%$/.test(t);
      const num = Number(t.replace(/%$/, '').replace(/,/g, ''));
      if (!isFinite(num)) return { ok: false, err: PCT_ERR };
      const v = pct || num > 1 ? num / 100 : num;
      if (!(v >= 0 && v <= 1)) return { ok: false, err: PCT_ERR };
      return { ok: true, v: Number(v.toPrecision(15)) };
    }
    if (key === 'minDays') {
      const num = Number(t.replace(/日$/, ''));
      if (!Number.isInteger(num) || num < 0 || num > 60) return { ok: false, err: DAY_ERR };
      return { ok: true, v: num };
    }
    if (key === 'nightStart' || key === 'nightEnd') {
      const v = parseTime(t);
      if (v === null) return { ok: false, err: ['時刻で入力してください', '22:00 のように「時:分」で入力してください（翌5時は 29:00）'] };
      return { ok: true, v };
    }
    return { ok: true, v: t };
  }
  function renderSet() {
    const host = clear($('set-host'));
    const S = state.settings;
    if (!S) { host.appendChild(h('p', null, '集計エンジンが読み込まれていないため、設定を表示できません。')); return; }
    const W = state.WB;
    const g = h('div', { class: 'set-grid' });
    const SET_ROW = { theatre: 1, rateGood: 3, rateWarn: 4, minDays: 5, alertRate: 6, nightStart: 7, nightEnd: 8 };   // 設定 sheet rows
    const scalar = (key, label, note, right) => {
      const r = SET_ROW[key];
      const inp = h('input', { type: 'text', class: 'inp' + (right ? ' right' : ''), value: fmtSetting(key, S[key]), 'aria-label': label, autocomplete: 'off', spellcheck: 'false', 'data-cell': 'B' + r });
      const err = h('span', { class: 'set-err', role: 'alert' });
      inp.addEventListener('change', () => {
        const p = parseSetting(key, inp.value);
        if (!p.ok) {
          inp.classList.add('invalid');
          err.textContent = p.err[0] + '：' + p.err[1];
          inp.value = fmtSetting(key, S[key]);
          root.setTimeout(() => inp.classList.remove('invalid'), 2500);
          return;
        }
        inp.classList.remove('invalid');
        err.textContent = '';
        S[key] = p.v;
        inp.value = fmtSetting(key, p.v);
        settingsChanged();
      });
      g.appendChild(h('div', { class: 'lab', 'data-cell': 'A' + r }, label));
      g.appendChild(h('div', null, h('div', { style: { width: '100%' } }, inp, err)));
      g.appendChild(h('div', { class: 'note', 'data-cell': 'C' + r }, note));
    };
    scalar('theatre', '劇場名（ダッシュボードの見出しに表示）', '他の劇場で使う場合はここを変更');
    g.appendChild(h('div', { style: { 'grid-column': '1 / 4', 'min-height': '14px', padding: 0 } }));
    scalar('rateGood', '出勤率 ◎良好 の基準（この値以上）', '総合判定に使用。既定 95%', true);
    scalar('rateWarn', '出勤率 △注意 の基準（この値以上）', 'この値未満は「✕要改善」。既定 90%', true);
    scalar('minDays', '判定を保留する確定シフト日数（この日数未満は「参考値」）', 'シフト日数が少ないと欠勤1日で出勤率が大きく動くため、判定は出さず出勤率のみ表示。既定 20日', true);
    scalar('alertRate', '当欠率（当日欠勤率）のアラート基準（この値以上で警告）', '当日に休みへ変更した日数 ÷ 確定シフト日数 がこの値以上のスタッフに警告を出す。既定 5%', true);
    scalar('nightStart', '深夜勤務の開始時刻', '深夜勤務時間の集計範囲（開始）', true);
    scalar('nightEnd', '深夜勤務の終了時刻', '同（終了）。翌5時は 29:00 と入力', true);
    host.appendChild(g);
    host.appendChild(h('div', { class: 'set-warning', id: 'set-order-warning', role: 'status', 'data-cell': 'A9' }, orderWarning()));

    state.ui.cnt = { jobs: [], depts: [] };
    const jobCounts = TA(W, 'ingest_set_job_rowcount', 20, 'rows');
    const deptCounts = TA(W, 'ingest_set_dept_rowcount', 20, 'rows');
    // r0 = the 設定 sheet row of the section title (11 jobs / 36 depts): header r0+1, data rows r0+2 …
    const table = (title, note, hdrA, rowsKey, counts, other, r0) => {
      host.appendChild(h('div', { class: 'set-section-title' }, h('span', { 'data-cell': 'A' + r0 }, title), h('span', { class: 'note', 'data-cell': 'C' + r0 }, note)));
      const gg = h('div', { class: 'set-grid' });
      gg.appendChild(h('div', { class: 'hd', 'data-cell': 'A' + (r0 + 1) }, hdrA));
      gg.appendChild(h('div', { class: 'hd', 'data-cell': 'B' + (r0 + 1) }, '表示名'));
      gg.appendChild(h('div', { class: 'hd', 'data-cell': 'C' + (r0 + 1) }, '貼付データでの行数（自動）'));
      S[rowsKey].forEach((row, i) => {
        for (const f of ['code', 'label']) {
          const inp = h('input', { type: 'text', class: 'inp', value: row[f], 'aria-label': (f === 'code' ? hdrA : '表示名') + ' ' + (i + 1) + '行目', autocomplete: 'off', spellcheck: 'false', 'data-cell': (f === 'code' ? 'A' : 'B') + (r0 + 2 + i) });
          inp.addEventListener('change', () => { row[f] = inp.value; settingsChanged(); });
          gg.appendChild(h('div', null, inp));
        }
        const ce = h('div', { class: 'cnt', 'data-cell': 'C' + (r0 + 2 + i) }, row.code === '' ? '' : (counts[i] || ''));
        state.ui.cnt[rowsKey][i] = ce;
        gg.appendChild(ce);
      });
      if (other) {
        gg.appendChild(h('div', { 'data-cell': 'A' + (r0 + 22) }, '（上記以外）'));
        const inp = h('input', { type: 'text', class: 'inp', value: S.jobOtherLabel, 'aria-label': '上記以外の表示名', autocomplete: 'off', 'data-cell': 'B' + (r0 + 22) });
        inp.addEventListener('change', () => { S.jobOtherLabel = inp.value; settingsChanged(); });
        gg.appendChild(h('div', null, inp));
        gg.appendChild(h('div', { class: 'cnt' }, ''));
      }
      host.appendChild(gg);
    };
    table('職種の区分（ダッシュボードの「職種別の勤務時間」に使用）', '最大20件。使わない行は空欄のままにしてください（空欄の行は集計しません）', 'CSVの職種名', 'jobs', jobCounts, true, 11);
    table('所属（CSVの「応募者の職種」）の一覧（スタッフ一覧の所属別集計に使用）', '最大20件。使わない行は空欄のままにしてください', 'CSVの所属名', 'depts', deptCounts, false, 36);
    state.dirty.set = false;
  }
  function updateSetCounts() {
    if (!state.ui || !state.ui.cnt || !state.settings) return;
    const W = state.WB;
    const sets = { jobs: TA(W, 'ingest_set_job_rowcount', 20, 'rows'), depts: TA(W, 'ingest_set_dept_rowcount', 20, 'rows') };
    for (const key of ['jobs', 'depts']) {
      (state.ui.cnt[key] || []).forEach((el, i) => {
        const row = state.settings[key][i];
        el.textContent = !row || row.code === '' ? '' : (sets[key][i] || '');
      });
    }
    const ow = $('set-order-warning');
    if (ow) ow.textContent = orderWarning();
    if ($('set-msg').textContent.indexOf('集計し直しています') >= 0) {
      $('set-msg').textContent = state.lastSaveOk === false ? '変更を集計に反映しました（このブラウザには保存できません）。' : '保存しました。集計に反映しました。';
    }
  }
  function orderWarning() {
    const w = pick(state.WB, 'ingest_set_order_warning');
    if (w !== undefined) return xlText(raw(w));
    const S = state.settings || {};
    return isNum(S.rateGood) && isNum(S.rateWarn) && S.rateWarn >= S.rateGood ? '※ △注意の基準（B4）は ◎良好の基準（B3）より小さくしてください' : '';
  }
  function settingsChanged() {
    const saved = saveSettings();
    state.lastSaveOk = saved;
    $('set-msg').textContent = saved ? '保存しました。集計し直しています…' : '変更しました（このブラウザには保存できません）。集計し直しています…';
    const ow = $('set-order-warning');
    if (ow && !pick(state.WB, 'ingest_set_order_warning')) ow.textContent = orderWarning();
    scheduleRecompute(250);
  }
  function exportSettings() {
    const S = state.settings;
    if (!S) return;
    const data = {
      format: '勤務実績ダッシュボード設定',
      version: 1,
      exported: todayText(),
      settings: S,
      holidays: holToStore(state.holidays),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: '勤務実績ダッシュボード_設定_' + (S.theatre || '劇場').replace(/[\\/:*?"<>|\s]+/g, '_') + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    $('set-msg').textContent = '設定をファイルに書き出しました（祝日・繁忙日の一覧も含みます）。';
  }
  function importSettingsText(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { $('set-msg').textContent = '読み込めませんでした：JSONの形式ではありません。'; return; }
    const src = data && data.settings ? data.settings : data;
    if (!src || typeof src !== 'object' || !('jobs' in src || 'rateGood' in src || 'theatre' in src)) {
      $('set-msg').textContent = '読み込めませんでした：設定のファイルではありません。';
      return;
    }
    if (!root.confirm('今の設定を、読み込んだファイルの内容に置き換えます。よろしいですか？')) return;
    const def = defaultSettings();
    state.settings = normSettings(src, def || state.settings);
    let msg = '設定を読み込みました。';
    if (data && Array.isArray(data.holidays)) {
      const l = holFromStore(data.holidays);
      if (l) { state.holidays = l; saveHolidays(); state.dirty.hol = true; msg = '設定と祝日・繁忙日の一覧を読み込みました。'; }
    }
    saveSettings();
    $('set-msg').textContent = msg;
    renderSet();
    scheduleRecompute(50);
  }
  function restoreDefaults() {
    if (!root.confirm('設定（劇場名・基準値・深夜時間帯・職種・所属）を既定値に戻します。よろしいですか？')) return;
    const def = defaultSettings();
    if (!def) return;
    state.settings = def;
    saveSettings();
    $('set-msg').textContent = '既定値に戻しました。';
    renderSet();
    scheduleRecompute(50);
  }

  /* ================================================================ 祝日・繁忙日 */
  const WD_JA = ['日', '月', '火', '水', '木', '金', '土'];
  function holDateText(d) { return isNum(d) ? fmtYMD(d) : (d == null ? '' : String(d)); }
  function holWd(d) { return isNum(d) ? WD_JA[serialToYMD(d).wd] : ''; }
  function renderHol() {
    const tb = clear($('hol-body'));
    const frag = document.createDocumentFragment();
    state.holidays.forEach((row, i) => {
      const di = h('input', { type: 'text', class: 'inp' + (typeof row.date === 'string' ? ' invalid' : ''), value: holDateText(row.date), placeholder: 'yyyy/mm/dd', 'aria-label': (i + 1) + '行目の日付', inputmode: 'numeric', autocomplete: 'off' });
      const wd = h('td', { class: 'c' }, holWd(row.date));
      const ni = h('input', { type: 'text', class: 'inp', value: row.name, 'aria-label': (i + 1) + '行目の名称', autocomplete: 'off' });
      di.addEventListener('change', () => {
        row.date = parseHolDate(di.value);
        if (isNum(row.date)) di.value = fmtYMD(row.date);
        di.classList.toggle('invalid', typeof row.date === 'string');
        wd.textContent = holWd(row.date);
        holidaysChanged();
      });
      ni.addEventListener('change', () => { row.name = ni.value; holidaysChanged(); });
      const del = h('button', { type: 'button', class: 'btn btn-small', 'aria-label': (i + 1) + '行目を削除' }, '削除');
      del.addEventListener('click', () => { state.holidays.splice(i, 1); renderHol(); holidaysChanged(); });
      frag.appendChild(h('tr', null, h('td', { class: 'c' }, String(i + 1)), h('td', null, di), wd, h('td', null, ni), h('td', { class: 'c' }, del)));
    });
    tb.appendChild(frag);
    renderHolMsgs();
    state.dirty.hol = false;
  }
  function renderHolMsgs() {
    const ul = clear($('hol-msgs'));
    const W = state.WB;
    for (const id of ['ingest_hol_msg_count', 'ingest_hol_msg_format', 'ingest_hol_msg_range', 'ingest_hol_msg_coverage']) {
      const t = T(W, id);
      if (t === '') continue;
      ul.appendChild(h('li', { class: t.charAt(0) === '※' ? 'bad' : null }, t));
    }
    if (!ul.firstChild) ul.appendChild(h('li', null, '（集計すると、ここに登録状況のチェック結果が出ます）'));
    $('hol-count').textContent = state.holidays.filter(x => isNum(x.date)).length + '件の日付';
  }
  function holidaysChanged() {
    saveHolidays();
    $('hol-count').textContent = state.holidays.filter(x => isNum(x.date)).length + '件の日付';
    scheduleRecompute(400);
  }

  /* ================================================================ tabs */
  const TABS = ['howto', 'dash', 'list', 'sum', 'set', 'hol'];
  function switchTab(t) {
    if (TABS.indexOf(t) < 0) t = 'howto';
    state.tab = t;
    for (const x of TABS) {
      const b = $('tabbtn-' + x), p = $('tab-' + x);
      const on = x === t;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      p.hidden = !on;
    }
    renderActive();
  }
  function renderActive() {
    const t = state.tab;
    try {
      if (t === 'dash' && state.dirty.dash) renderDash();
      else if (t === 'dash') fitDash();
      if (t === 'list' && state.dirty.list) renderList();
      if (t === 'sum' && state.dirty.sum) renderSum();
      if (t === 'set' && state.dirty.set) renderSet();
      if (t === 'hol') { if (state.dirty.hol) renderHol(); else renderHolMsgs(); }
    } catch (e) {
      banner('画面の表示中にエラーが発生しました：' + (e && e.message ? e.message : String(e)), true);
    }
  }

  /* ================================================================ printing */
  let pxPerMm = null;
  function mm(v) {
    if (!pxPerMm) {
      const p = h('div', { style: { position: 'absolute', left: '-9999px', top: '0', width: '100mm', height: '1px' } });
      document.body.appendChild(p);
      pxPerMm = p.getBoundingClientRect().width / 100 || 3.7795;
      p.remove();
    }
    return v * pxPerMm;
  }
  function todayText() {
    const d = new Date();
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate());
  }
  function setPageSize(orient) {
    $('page-style').textContent = '@page { size: A4 ' + orient + '; margin: 7.62mm 6.35mm; }';
  }
  function setPrintTarget(kind) {
    document.body.classList.remove('pt-sheet', 'pt-tab');
    document.body.classList.add(kind === 'sheet' ? 'pt-sheet' : 'pt-tab');
  }
  function makeSheet(view, opts) {
    const sheet = h('div', { class: 'print-sheet' });
    const body = h('div', { class: 'sheet-body' });
    const page = buildDashboard(view, Object.assign({ live: false }, opts || {}));
    body.appendChild(page);
    sheet.appendChild(body);
    sheet.appendChild(h('div', { class: 'sheet-foot' }, '出力日 ' + todayText()));
    return { sheet, page };
  }
  function fitSheets(pairs) {
    const pr = $('print-root');
    pr.classList.add('measuring');
    const availW = mm(197), availH = mm(280 - 6);
    // read all heights first, then write (one layout pass)
    const dims = pairs.map(p => ({ w: p.page.offsetWidth, hgt: p.page.offsetHeight }));
    pairs.forEach((p, i) => {
      const d = dims[i];
      const z = Math.min(availW / Math.max(1, d.w), availH / Math.max(1, d.hgt)) * 0.985;
      p.page.style.zoom = String(Math.min(1, z));
    });
    pr.classList.remove('measuring');
  }
  function prepareDashPrint() {
    const pr = clear($('print-root'));
    const view = state.view || computeView(currentName());
    const pair = makeSheet(view, { filterText: state.filterQ === '' ? '' : (state.filterShown !== undefined ? state.filterShown : state.filterQ), filterMsg: filterMessage(), staffText: currentName() });
    pr.appendChild(pair.sheet);
    fitSheets([pair]);
    setPageSize('portrait');
    setPrintTarget('sheet');
  }
  function prepareTabPrint(t) {
    const pr = clear($('print-root'));
    void pr;
    const landscape = t === 'list' || t === 'sum';
    setPageSize(landscape ? 'landscape' : 'portrait');
    setPrintTarget('tab');
    const availW = mm(297 - 12.7), availH = mm(210 - 15.24);
    if (t === 'list') {
      if (state.dirty.list) renderList();
      const tbl = $('staff-tbl');
      let w = 0;
      tbl.querySelectorAll('thead th').forEach(th => { if (!th.classList.contains('col-extra')) w += th.offsetWidth; });
      const doc = $('tab-list').querySelector('.doc');
      doc.classList.add('print-zoom');
      doc.style.setProperty('--pz', String(w > 0 ? Math.min(1, availW / (w + 4)) : 1));
    }
    if (t === 'sum') {
      if (state.dirty.sum) renderSum();
      const doc = $('sum-doc');
      const prev = doc.style.width;
      doc.style.width = availW + 'px';
      const hh = doc.offsetHeight;
      doc.style.width = prev;
      doc.classList.add('print-zoom');
      doc.style.setProperty('--pz', String(Math.min(1, availH / Math.max(1, hh)) * 0.98));
    }
  }
  function preparePrint(kind) {
    state.printPrepared = true;
    if (kind === 'dash') prepareDashPrint();
    else prepareTabPrint(kind);
  }
  function doPrint(kind) {
    preparePrint(kind);
    setTimeout(() => { try { root.print(); } catch (e) { /* ignore */ } }, 30);
  }
  function printAll() {
    const names = Array.from(new Set(allNames()));
    if (!names.length) return;
    if (!root.confirm(names.length + '名分のダッシュボードを、1人1ページ（A4縦）で印刷します。\n作成に少し時間がかかります。よろしいですか？')) return;
    const pr = clear($('print-root'));
    const pairs = [];
    let i = 0;
    showBusy('印刷用のページを作成しています… 0 / ' + names.length);
    const chunk = () => {
      const end = Math.min(names.length, i + 4);
      for (; i < end; i++) {
        const v = computeView(names[i]);
        const p = makeSheet(v, { filterText: '', filterMsg: { text: '', bad: false }, staffText: names[i] });
        pr.appendChild(p.sheet);
        pairs.push(p);
      }
      $('busy-text').textContent = '印刷用のページを作成しています… ' + i + ' / ' + names.length;
      if (i < names.length) { setTimeout(chunk, 0); return; }
      fitSheets(pairs);
      setPageSize('portrait');
      setPrintTarget('sheet');
      state.printPrepared = true;
      hideBusy();
      setTimeout(() => { try { root.print(); } catch (e) { /* ignore */ } }, 50);
    };
    setTimeout(chunk, 30);
  }

  /* ================================================================ init */
  function initControls() {
    state.ui = {};
    const fi = h('input', { type: 'text', id: 'filter-input', autocomplete: 'off', spellcheck: 'false', 'aria-label': '絞り込み（名前か従業員番号の一部）', placeholder: '' });
    fi.addEventListener('input', onFilterInput);
    state.ui.filterInput = fi;
    const ss = h('select', { id: 'staff-select', 'aria-label': 'スタッフを選ぶ' });
    ss.addEventListener('change', () => { if (ss.value !== '') selectStaff(ss.value); });
    state.ui.staffSelect = ss;

    document.querySelectorAll('.tab').forEach(b => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
      b.addEventListener('keydown', e => {
        const i = TABS.indexOf(b.dataset.tab);
        let j = -1;
        if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
        if (e.key === 'ArrowLeft') j = (i + TABS.length - 1) % TABS.length;
        if (e.key === 'Home') j = 0;
        if (e.key === 'End') j = TABS.length - 1;
        if (j >= 0) { e.preventDefault(); switchTab(TABS[j]); $('tabbtn-' + TABS[j]).focus(); }
      });
    });

    const dz = $('dropzone'), inp = $('file-input');
    dz.addEventListener('click', () => inp.click());
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', () => { const fl = Array.from(inp.files || []); inp.value = ''; loadFiles(fl); });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'dragend'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('over')));
    dz.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('over'); loadFiles(e.dataTransfer ? e.dataTransfer.files : []); });
    // a file dropped anywhere else must not navigate away from the page
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); });

    $('btn-clear-data').addEventListener('click', clearData);
    $('btn-go-dash').addEventListener('click', () => switchTab('dash'));
    $('btn-prev').addEventListener('click', () => step(-1));
    $('btn-next').addEventListener('click', () => step(1));
    $('btn-print-dash').addEventListener('click', () => doPrint('dash'));
    $('btn-print-all').addEventListener('click', printAll);
    $('btn-print-list').addEventListener('click', () => doPrint('list'));
    $('btn-print-sum').addEventListener('click', () => doPrint('sum'));

    $('list-q').addEventListener('input', e => { state.list.q = e.target.value; drawListBody(); });
    $('list-dept').addEventListener('change', e => { state.list.dept = e.target.value; drawListBody(); });
    $('list-judge').addEventListener('change', e => { state.list.judge = e.target.value; drawListBody(); });

    $('btn-set-export').addEventListener('click', exportSettings);
    $('btn-set-import').addEventListener('click', () => $('set-import-file').click());
    $('set-import-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      f.text().then(importSettingsText, () => { $('set-msg').textContent = 'ファイルを読み込めませんでした。'; });
    });
    $('btn-set-default').addEventListener('click', restoreDefaults);

    $('btn-hol-add').addEventListener('click', () => {
      state.holidays.unshift({ date: null, name: '' });
      renderHol();
      const first = $('hol-body').querySelector('input');
      if (first) first.focus();
    });
    $('btn-hol-sort').addEventListener('click', () => {
      state.holidays = state.holidays.map((x, i) => ({ x, i })).sort((a, b) => {
        const da = a.x.date, db = b.x.date;
        const na = isNum(da), nb = isNum(db);
        if (na && nb) return da - db || a.i - b.i;
        if (na) return -1;
        if (nb) return 1;
        return a.i - b.i;
      }).map(o => o.x);
      renderHol();
      holidaysChanged();
    });
    $('btn-hol-default').addEventListener('click', () => {
      if (!root.confirm('祝日・繁忙日の一覧を既定（2025年〜2032年の祝日とGW・お盆・年末年始）に戻します。よろしいですか？')) return;
      state.holidays = defaultHolidays();
      renderHol();
      holidaysChanged();
    });

    window.addEventListener('resize', () => { if (state.tab === 'dash') fitDash(); });
    window.addEventListener('beforeprint', () => {
      if (state.printPrepared) return;
      preparePrint(state.tab === 'dash' ? 'dash' : state.tab);
    });
    window.addEventListener('afterprint', () => {
      state.printPrepared = false;
      document.body.classList.remove('pt-sheet', 'pt-tab');
      document.querySelectorAll('.print-zoom').forEach(el => { el.classList.remove('print-zoom'); el.style.removeProperty('--pz'); });
    });
    C().installTooltips();
  }

  function init() {
    try {
      initControls();
    } catch (e) {
      banner('画面の準備中にエラーが発生しました：' + (e && e.message ? e.message : String(e)), true);
      return;
    }
    const okStore = store.test();
    const stText = okStore ? '保存できます' : 'このブラウザでは保存できないため、ページを閉じると元に戻ります';
    $('storage-state').textContent = stText;
    $('storage-state-2').textContent = stText;
    const a = api();
    const need = ['decode', 'defaultSettings', 'defaultHolidays', 'detectMonth', 'build', 'filter', 'view'];
    const missing = a ? need.filter(n => typeof a[n] !== 'function') : need;
    state.engineOk = missing.length === 0;
    if (!a) banner('集計エンジン（AE.api）が見つかりません。このファイルは正しく作られていない可能性があります。', true);
    else if (missing.length) banner('集計エンジンの一部の機能がありません：' + missing.join(', '), true);
    state.settings = loadSettings();
    state.holidays = loadHolidays();
    switchTab('howto');
    recompute();
  }

  AE.ui = { state, preparePrint, switchTab, selectStaff, loadFiles, buildDashboard, recompute,
    _fmt: { fmtCell, fmtPct, fmtFixed, xlRound } };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
