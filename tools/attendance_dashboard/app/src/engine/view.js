/* 勤務実績ダッシュボード — engine: the selected-staff view = DB計算 (spec 30) + every value / text of ダッシュボード
 * (spec 40 rows 1–47, spec 50 rows 48–99).
 *
 *   AE.view.view(WB, staff[, opts]) → View   (AE.api.view)
 *     staff   the ダッシュボード!B7 selection:
 *               string                 a typed / picked name: MATCH(B7, 名簿!AT, 0) — plain case-insensitive equality
 *                                      (scope decision 3); the FIRST staff in name order wins for duplicate names
 *               null / undefined / ''  not chosen → the B7 default formula: the first staff in name order, or
 *                                      「まずCSVを貼り付けてください」 when there is no named staff
 *               number                 an employee number (従業員番号) → that staff directly (HTML convenience, so a
 *                                      second staff with a duplicate name can be shown); B7 then shows the name
 *               {key} / staffRef       same as a number (AE.api.filter refs {n, name, key, master} work as is)
 *               {name}                 same as a string
 *               {b7: value}            the literal B7 cell content (Excel emulation: a number or a blank never matches)
 *     opts    {filter: D5 text}  optional; fills dashtop_filter_input / _msg / _msg_bad (ダッシュボード!D5 / G5)
 *   AE.view.TEXT                     fixed texts: DB計算 labels (by cell), ダッシュボード static labels
 *   AE.view.COLORS, CAT_COLORS, CAT_TXT, STATE_COLORS   colours the specs name (hex, no '#')
 *   AE.view.fmt                      display helpers (pct, fixed, md, mdhm, hm, ymd, weekdayJa, cellText)
 *
 * View fields (spec identifiers; raw value + `*_text` = what the Excel cell displays):
 *   selection    dbcalc_sel_input (= dashtop_staff_box, dashtop_sel_name_input; B7), dbcalc_sel_emp_no (= dashtop_sel_no;
 *                AC3), dbcalc_sel_master_idx (= dashtop_sel_idx; AC4), staff (the roster record or null),
 *                selection_columns (calc W / AA11 / AA12 per sheet, = AE.calc.selectionColumns(WB, AC3)),
 *                ingest_chk_sel_list_count[6] (AA11), ingest_chk_sel_list_offset[6] (AA12), ingest_row_sel_list_seq[6][] (W)
 *   DB計算        every dbcalc_* of spec 30 (scalars, wd / month / job / band families, rest_days, list[12] (+ list_all),
 *                period, day[200], busy summary, missed_busy[24] (+ _all), long_run[6] (+ _all)); dashtop_* aliases (00 §5.1)
 *   rows 1–47    dashtop_title … dashtop_timing_note (spec 40), chart data dashtop_chart_ring / _month / _job / _weekday /
 *                _radar, style flags: dashtop_status_warn, dashtop_filter_msg_bad, dashtop_badge_style ('ref' | 'good' |
 *                'warn' | 'crit' | ''), dashtop_badge_fill / _font, dashtop_kpi_att_rate_color, dashtop_kpi_abs_alert,
 *                dashtop_ring_center_color, dashtop_job_legend_slot_color[6]  (state names → STATE_COLORS)
 *   rows 48–99   dashbottom_month_* [6] + _text, dashbottom_month_total_*, CF dashbottom_month_att_rate_color[6],
 *                _abs_red[6], _bar_pct[6]; dashbottom_abs_row[] (≥ 12 rows; every item, the first 12 = the sheet) with
 *                *_text and `red`; dashbottom_busy_* lines, run_row[] (≥ 6), missed_cell[] (≥ 24), footnotes.
 *                Scope decision 1: arrays carry every item; the print/A4 page shows the first 12 / 6 / 24 (the
 *                footnotes keep Excel's 「ほか N 件」 wording).
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});

  // ================================================================== constants (spec 30 §0, 40 §1, 50 §1)
  const NSHEETS = 6, NJOB = 20, NCAT = 21, ABS_ROWS = 12, BUSY_DAYS = 200, BUSY_ROWS = 24, RUN_MIN = 3, RUN_SHOW = 6;
  const WD_ORDER = [[2, '月'], [3, '火'], [4, '水'], [5, '木'], [6, '金'], [7, '土'], [1, '日']];
  const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
  const PROMPT = 'まずCSVを貼り付けてください';
  const CAT_COLORS = ['7EB2E6', '8FCBA3', 'F1D46A', 'B5A3DE', 'F2B27A', 'DC8E8E', '98CBE1', 'AF98E1', 'E198C8', 'E1B298',
    'C5E198', '98E1B5', '98C2E1', 'B898E1', 'E198BF', 'E1BB98', 'BCE198', '98E1BE', '98B9E1', 'C198E1', 'A9B4C2'];
  const CAT_TXT = ['3B78C4', '2F8F5B', 'A67C00', '7B5FC2', 'C97A2B', 'C0504D', '2D6E89', '4B2D89', '892D6A', '894E2D',
    '66892D', '2D8952', '2D6389', '562D89', '892D5F', '89592D', '5B892D', '2D895D', '2D5889', '612D89', '6B7684'];
  const COLORS = {
    navy: '1B4F9E', darkTxt: 'C7D7F2', page: 'F3F5F8', ink: '1F2D3D', ink2: '4A5568', muted: '7A8494', grid: 'DCE2EA',
    head: 'DCE6F5', total: 'EEF2F8', input: 'FFF9C4', blue: '7EB2E6', blueD: '4E8CD6', red: 'DC8E8E', blueTxt: '3B78C4',
    redTxt: 'C0504D', good: '8FCBA3', warn: 'F1D46A', crit: 'C9575A', goodTxt: '2F8F5B', warnTxt: 'A67C00',
    badgeNone: 'EDF0F4', badgeRef: 'D5DBE5', alertFill: 'FBE9E9', neutral: '9AA7B8', all: '2F9A6A', dept: 'E08A1E',
  };
  // state name → font colour (rate CF rules of 40 §5.5 / §6 / §8.1 and 50 §3.4)
  const STATE_COLORS = { good: COLORS.goodTxt, warn: COLORS.warnTxt, crit: COLORS.crit };
  const BADGE_STYLE = {          // 40 §5.5 dashtop_badge_style
    ref: { fill: COLORS.badgeRef, font: COLORS.ink }, good: { fill: COLORS.good, font: COLORS.ink },
    warn: { fill: COLORS.warn, font: COLORS.ink }, crit: { fill: COLORS.crit, font: 'FFFFFF' },
    '': { fill: COLORS.badgeNone, font: COLORS.ink2 },
  };

  const TEXT = {
    prompt: PROMPT,
    // DB計算 fixed labels (spec 30 §4–§13; AB99 = the overwriting label, DB-Q19)
    dbcalc: {
      AB1: '内部計算（このブロックは触らないでください）',
      AB3: '選択スタッフの従業員番号', AB4: '名簿の行', AB5: '所属コード', AB6: '出勤率', AB7: '◎の基準', AB8: '△の基準',
      AB9: '判定保留の日数', AB10: '確定シフト日数', AB12: '出勤', AB13: '欠勤', AB23: '職種トップ（名前／割合）',
      AB34: '本人', AB35: '全体平均',
      AB39: '事前（2日以上前）', AB40: '前日', AB41: '当日（＝欠勤）', AB42: 'シフト日より後',
      AB43: '当日遅出（当日の開始変更）', AB44: '当日早退（当日の終了変更）',
      AB45: '月（グラフ用）', AC45: '出勤日数', AD45: '欠勤日数',
      AB52: '当日遅出率（÷確定シフト日数）', AB53: '当日早退率（÷確定シフト日数）', AB54: '一覧の件数（欠勤＋当日時間変更）',
      AB56: '当欠率アラート基準', AB57: '当欠率', AB58: '　うち出勤していない',
      AB59: '一覧用（AF 日付, AG 区分, AH 更新時刻, AI 元開始, AJ 元終了, AK 開始, AL 終了, AM 職種）',
      AB60: `${RUN_MIN}連休以上の連休（全件）`,
      AB63: '追加応募（自分から手を挙げた件数）', AB64: '　うち確定', AB65: '　うち繁忙日',
      AB71: '職種（グラフ用）', AC71: '時間', AD71: '割合', AE71: '表示順（AFは凡例j→職種行）',
      AB93: '土日祝の出勤日数', AB94: '対象期間の開始', AB95: '対象期間の終了', AB96: '繁忙日（対象期間内）',
      AB97: '　うち出勤', AB98: '　うち当日欠勤', AB99: '　うち事前に休み等',
      AB305: '出勤時間帯（勤務時間の割合）', AC305: '本人', AD305: '全体', AE305: '同所属',
      AB311: '時間帯の合計h（分母: 本人／全体／同所属）',
    },
    dbcalcGridHeader: '日別（AN 日付, AP 繁忙日, AT 区分, AU 未出勤の連番, AV 連休候補, AX 連休番号, AY 日数, BM 名称用）',
    // ダッシュボード fixed labels
    title: '勤務実績ダッシュボード',
    subtitleSuffix: '　アルバイトスタッフ（シェアフルシフト実績）',
    labels: { filter: '絞り込み', staff: 'スタッフ', empNo: '従業員番号', dept: '所属', months: 'データのある月数', badge: '総合判定' },
    kpiLabels: ['出勤日数', '出勤率', '欠勤日数', '当日欠勤率', '勤務時間', '土日祝出勤率'],
    chartTitles1: ['出勤率', '月別の出勤日数・欠勤日数', '職種別の勤務時間'],
    chartTitles2: ['曜日別の出勤日数', '出勤時間帯（1日を5つに分けた割合）', '休み・時間変更のタイミング'],
    ringCenterLabel: '出勤率', jobCenterLabel: '主に担当',
    monthLegend: ['■ 出勤日数', '■ 欠勤日数'],
    radarHeader: ['朝', '午前', '午後', '夕', '夜'],
    radarRows: ['● 本人', '― 全体', '― 同所属'],
    timingHeader: ['区分', '日数'],
    timingLabels: ['事前（2日以上前）', '前日', '当日（＝欠勤）', '当日遅出', '当日早退'],
    noData: 'データがまだありません。下のタブ「CSV_1」にシェアフルシフトのシフトCSVを貼り付けると、ここに集計が出ます（手順は「使い方」シート）。',
    monthTitle: '月別の実績',
    monthHeader: ['月', '出勤日数', '欠勤日数', '確定シフト', '出勤率', '勤務時間', '1日平均', '土日祝', '前日変更'],
    monthTotal: '合計',
    absTitle: '欠勤（当日に休みへ変更）・当日の時間変更の一覧',
    absHeader: ['日付', '曜', '区分', '変更した日時', '元のシフト時間', '変更後', '募集の職種'],
    absFoot: '日時はシェアフルシフト上で変更された時刻です。当日遅出・当日早退はシフトの時間変更で、打刻の遅刻・早退ではありません。',
    busyTitle: '繁忙日（祝日・GW・お盆・年末年始）の出勤状況',
    runsHeader: ['期間', '繁忙日', '日数', '出勤'],
    missedLabel: '出勤していない繁忙日',
    none: '該当なし',
  };

  // ================================================================== Excel helpers
  const X = () => AE.calc.xl;
  const RH = () => AE.roster._h;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const isErr = (v) => v instanceof AE.calc.xl.XLError;
  const blank = (v) => v === null || v === undefined || v === '';
  const val = (v) => X().val(v);                     // read inside a formula: an error value is thrown
  const cell = (fn) => X().cell(fn);                 // cell boundary: a thrown error becomes the cell value
  function N(v) {                                    // N()
    v = val(v);
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return 0;
  }
  const txt = (v) => X().text(v);                    // v&""
  const critEq = (a, b) => RH().critEq(a, b);        // COUNTIF / SUMIFS criterion equality (no wildcards, scope 3)
  const matchEq = (a, b) => RH().matchEq(a, b);      // MATCH(…,0) equality
  const cmp = (a, b) => RH().xlCompare(val(a), val(b));
  const ge = (a, b) => cmp(a, b) >= 0;
  const lt = (a, b) => cmp(a, b) < 0;
  const isText = (v) => typeof v === 'string';
  // a direct reference to a settings cell: a blank cell reads as 0 (30:DB-Q20)
  const ref = (v) => (blank(v) ? 0 : v);
  // "=" comparison of a text cell with a literal (case-insensitive, no wildcards)
  const eqText = (a, b) => X().eq(a, b);

  // ---------------------------------------------------------------- display formats (40 §0, 50 §0.2)
  const fmtNum = (v, f) => AE.roster.format(v, f);   // '0', '0"日"', '0.0%', '0%', '0.0"h"', 'General', …
  function fmtPct(x, d) { return fmtNum(x, d === 0 ? '0%' : '0.0%'); }
  function fmtFixed(x, d) { return fmtNum(x, d === 0 ? '0' : '0.0'); }
  // TEXT(v, fmt) for the number formats above; text stays text (a numeric text is converted first)
  function TEXTF(v, f) {
    v = val(v);
    if (v === null || v === '') return '';
    if (typeof v === 'string') { const n = X().parseNumberText(v); return n === null ? v : fmtNum(n, f); }
    return fmtNum(v, f);
  }
  const ymdOf = (s) => X().ymd(s);
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  function fmtMD(s) {                                // m/d (TEXT(x,"m/d") and the cell format)
    const t = Math.round(val(s) * 86400);
    const p = ymdOf(Math.floor(t / 86400));
    return p.m + '/' + p.d;
  }
  function fmtMDHM(s) {                              // m/d hh:mm: round to the second, then drop the seconds (50 OQ1)
    const secs = Math.round(val(s) * 86400);
    const day = Math.floor(secs / 86400), rem = secs - day * 86400;
    const p = ymdOf(day);
    return p.m + '/' + p.d + ' ' + pad2(Math.floor(rem / 3600)) + ':' + pad2(Math.floor((rem % 3600) / 60));
  }
  function fmtHM(x) {                                // TEXT(x,"[h]:mm")
    x = val(x);
    if (typeof x === 'string') { const n = X().parseNumberText(x); if (n === null) return x; x = n; }
    if (x === null) x = 0;
    const neg = x < 0, s = Math.round(Math.abs(x) * 86400);
    return (neg ? '-' : '') + Math.floor(s / 3600) + ':' + pad2(Math.floor((s % 3600) / 60));
  }
  function fmtYMD(s) {
    const p = ymdOf(Math.floor(Math.round(val(s) * 86400) / 86400));
    return p.y + '/' + pad2(p.m) + '/' + pad2(p.d);
  }
  const weekdayJa = (s) => WEEKDAY_JA[X().weekday(s, 1) - 1];   // CHOOSE(WEEKDAY(s),"日",…,"土")
  // the text a cell shows: '' blank, text as is, an error code, else the number format
  function cellText(v, f) {
    if (v === null || v === undefined || v === '') return '';
    if (isErr(v)) return v.code;
    if (typeof v === 'string') return v;
    if (typeof v !== 'number') return txt(v);
    try {
      switch (f) {
        case 'md': return fmtMD(v);
        case 'mdhm': return fmtMDHM(v);
        case 'hm': return fmtHM(v);
        case 'ymd': return fmtYMD(v);
        case '0;;;': return v > 0 ? fmtNum(v, '0') : '';
        case '0%;;;': return v > 0 ? fmtNum(v, '0%') : '';
        default: return fmtNum(v, f || 'General');
      }
    } catch (e) { if (isErr(e)) return '#####'; throw e; }   // a date outside Excel's range shows #####
  }

  // ================================================================== per-WB caches (selection independent)
  const CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;
  function wbCache(WB) {
    if (!CACHE) return {};
    let c = CACHE.get(WB);
    if (!c) { c = { dept: new Map() }; CACHE.set(WB, c); }
    return c;
  }
  // Σ_k SUMIFS(計算k!col, …) with per-sheet partial sums (Excel adds the six SUMIFS); an error in a matching row propagates
  function sum6(rowsBySheet, col, pred) {
    let t = 0;
    for (const rows of rowsBySheet) {
      let s = 0;
      for (const r of rows) {
        if (pred && !pred(r)) continue;
        const v = r[col];
        if (isErr(v)) throw v;
        if (typeof v === 'number') s += v;
      }
      t += s;
    }
    return t;
  }
  const isWork = (r) => critEq(r.E, 1);
  function bandSums(rowsBySheet, pred) {             // [Σ BG, Σ BH, Σ BI, Σ BJ, Σ BK] over E=1 rows (each a cell value)
    return AE.calc.BAND_COLS.map((c) => cell(() => sum6(rowsBySheet, c, (r) => isWork(r) && (!pred || pred(r)))));
  }
  function allRows(WB) { return WB.sheets.map((sh) => sh.rows || []); }
  function bandAll(WB) {
    const c = wbCache(WB);
    if (!c.bandAll) c.bandAll = bandSums(allRows(WB));
    return c.bandAll;
  }
  function bandDept(WB, dept) {
    const c = wbCache(WB);
    const k = typeof dept === 'string' ? 's:' + dept.toLowerCase() : 'n:' + String(dept);
    if (c.dept && c.dept.has(k)) return c.dept.get(k);
    const v = bandSums(allRows(WB), (r) => critEq(r.BF, dept));
    if (c.dept) c.dept.set(k, v);
    return v;
  }

  // ================================================================== §3 selection (B7 → AC3 → AC4)
  function resolveSelection(WB, staff) {
    const R = WB.roster;
    const named = R.named || [];
    const dflt = () => (named.length ? named[0].name : PROMPT);   // =IF(名簿!AT2="","まずCSVを…",名簿!AT2)
    let b7, key = null, byKey = false;
    if (staff === null || staff === undefined || staff === '') b7 = dflt();
    else if (typeof staff === 'number') { byKey = true; key = staff; }
    else if (typeof staff === 'object') {
      if (Object.prototype.hasOwnProperty.call(staff, 'b7')) b7 = staff.b7 === undefined ? '' : staff.b7;
      else if (!blank(staff.key)) { byKey = true; key = staff.key; }
      else if (!blank(staff.name)) b7 = String(staff.name);
      else b7 = dflt();
    } else b7 = String(staff);
    let hit = null;
    if (byKey) {
      hit = named.find((s) => matchEq(s.emp_no, key)) || null;
      b7 = hit ? hit.name : txt(key);
    } else if (typeof b7 === 'string') {
      hit = AE.roster.findByName(WB, b7);           // MATCH(B7, AT, 0): first in name order; a number never matches
    }
    const sel = hit ? hit.emp_no : '';                                  // AC3
    const rec = sel === '' ? null : AE.roster.findByKey(WB, sel);       // AC4 = MATCH(AC3, 名簿!I, 0)
    return { b7, sel, idx: rec ? rec.n : '', staff: rec };
  }

  // ================================================================== DB計算 (spec 30)
  function buildDbCalc(WB, S) {
    const R = WB.roster, settings = WB.settings, sheets = WB.sheets, sel = S.sel, idx = S.idx;
    const D = {};
    const V = (col) => (idx === '' ? '' : AE.roster.colValue(S.staff, col));
    const NV = (col) => cell(() => N(V(col)));
    const selRows = sheets.map((sh) => (sel === '' ? [] : (sh.rows || []).filter((r) => !isErr(r.A) && critEq(r.A, sel))));
    const sum6sel = (col, cc, cr) => cell(() => sum6(selRows, col, cc === undefined ? null : (r) => critEq(r[cc], cr)));

    // §3 / §4 scalars
    D.dbcalc_sel_input = S.b7;
    D.dbcalc_sel_emp_no = sel;
    D.dbcalc_sel_master_idx = idx;
    D.dbcalc_sel_dept_code = V('K');
    D.dbcalc_sel_att_rate = V('P');
    D.dbcalc_thr_good = ref(settings.rateGood);
    D.dbcalc_thr_warn = ref(settings.rateWarn);
    D.dbcalc_min_days = ref(settings.minDays);
    D.dbcalc_sel_confirmed_days = V('O');
    D.dbcalc_work_days = NV('M');
    D.dbcalc_abs_days = NV('N');
    D.dbcalc_late_days = NV('BM');
    D.dbcalc_early_days = NV('BN');
    D.dbcalc_late_rate = NV('BX');
    D.dbcalc_early_rate = NV('BY');
    D.dbcalc_alert_thr = ref(settings.alertRate);
    D.dbcalc_sel_abs_rate = V('Q');
    D.dbcalc_extra_apps = NV('CC');
    D.dbcalc_extra_apps_confirmed = NV('CD');
    D.dbcalc_extra_apps_busy = NV('CE');
    D.dbcalc_busy_work_days = NV('BZ');
    // calc W / AA11 / AA12 (layer-1 hook) and AC54 = Σ AA11
    const selCols = AE.calc.selectionColumns(WB, sel);
    D.selection_columns = selCols;
    D.ingest_chk_sel_list_count = selCols.map((s) => s.AA11);
    D.ingest_chk_sel_list_offset = selCols.map((s) => s.AA12);
    D.ingest_row_sel_list_seq = selCols.map((s) => s.W);
    D.dbcalc_list_count = selCols.reduce((t, s) => t + s.AA11, 0);

    // §5 comparison
    D.dbcalc_cmp_self_rate = cell(() => N(D.dbcalc_sel_att_rate));
    D.dbcalc_cmp_all_rate = cell(() => N(R.total_att_rate));
    const dept = D.dbcalc_sel_dept_code;
    D.dbcalc_cmp_dept_label = cell(() => (blank(val(dept)) ? '同所属' : '同所属（' + txt(AE.roster.deptLabel(WB, dept)) + '）'));
    D.dbcalc_cmp_dept_rate = (() => {
      if (isErr(dept)) return 0;                                       // IFERROR(…, 0)
      const row = blank(dept) ? null : R.dept.find((d) => d.code !== '' && matchEq(d.code, dept));
      if (!row) return 0;
      return isErr(row.att_rate) ? 0 : N(row.att_rate);
    })();

    // §6 weekday work days
    D.dbcalc_wd_label = WD_ORDER.map(([, l]) => l);
    D.dbcalc_wd_days = WD_ORDER.map(([code]) => (sel === '' ? 0 : sum6sel('H', 'O', code)));

    // §7 months (sheet order)
    D.dbcalc_month_label = sheets.map((sh) => cell(() => {
      const m1 = val(sh.checks ? sh.checks.AA6 : '');
      return blank(m1) ? '' : ymdOf(m1).m + '月';
    }));
    D.dbcalc_month_work = AE.roster.MONTH_WORK.map((c) => NV(c));
    D.dbcalc_month_abs = AE.roster.MONTH_ABS.map((c) => NV(c));

    // §8 jobs (rows 72..92)
    const jobs = settings.jobs || [];
    D.dbcalc_job_label = [];
    D.dbcalc_job_hours = [];
    for (let c = 0; c < NJOB; c++) {
      const j = jobs[c] || {};
      const code = blank(j.code) ? '' : j.code, name = blank(j.label) ? '' : j.label;
      D.dbcalc_job_label.push(code === '' ? '' : (name === '' ? code : name));
      D.dbcalc_job_hours.push(sel === '' || code === '' ? 0 : sum6sel('M', 'R', code));
    }
    D.dbcalc_job_label.push(ref(settings.jobOtherLabel));                // AB92 = 設定!B33 (blank → 0, DB-Q5)
    D.dbcalc_job_other_hours = cell(() => {
      if (sel === '') return 0;
      let s = 0;
      for (const h of D.dbcalc_job_hours) s += N(h);
      let x = N(V('R')) - s;
      if (Math.abs(x) < 1e-9) x = 0;                                     // float residue of the subtraction (DB-Q4, OQ3)
      return Math.max(0, x);
    });
    D.dbcalc_job_hours.push(D.dbcalc_job_other_hours);
    const H = D.dbcalc_job_hours;
    const jobTotal = cell(() => H.reduce((t, h) => t + N(h), 0));       // SUM(AC72:AC92)
    D.dbcalc_job_share = H.map((h) => cell(() => (val(jobTotal) === 0 ? 0 : val(h) / val(jobTotal))));
    let seq = 0;
    D.dbcalc_job_pos_seq = H.map((h) => cell(() => (N(h) > 0 ? ++seq : '')));
    // AF{71+j} = MATCH(j, AE72:AE92, 0) (j = 1..21), stored 0-based: dbcalc_job_legend_idx[j-1]
    D.dbcalc_job_legend_idx = [];
    for (let j = 1; j <= NCAT; j++) {
      const i = D.dbcalc_job_pos_seq.findIndex((x) => x === j);
      D.dbcalc_job_legend_idx.push(i < 0 ? '' : i + 1);
    }
    D.dbcalc_job_top_label = cell(() => {
      const tot = val(jobTotal);
      if (tot === 0) return '';
      let max = -Infinity;
      for (const h of H) { const v = val(h); if (typeof v === 'number' && v > max) max = v; }
      const i = H.findIndex((h) => h === max);
      return val(D.dbcalc_job_label[i]);
    });
    D.dbcalc_job_top_share = cell(() => {
      const tot = val(jobTotal);
      if (tot === 0) return '';
      let max = -Infinity;
      for (const h of H) { const v = val(h); if (typeof v === 'number' && v > max) max = v; }
      return max / tot;
    });

    // §9 rest timing
    D.dbcalc_rest_days = {};
    for (const [code] of AE.calc.REST_CATS) D.dbcalc_rest_days[code] = sel === '' ? 0 : sum6sel('U', 'P', code);

    // §10 time bands
    const bSelf = sel === '' ? [0, 0, 0, 0, 0] : bandSums(selRows);
    const bAll = bandAll(WB);
    const bDept = blank(dept) || isErr(dept) ? [0, 0, 0, 0, 0] : bandDept(WB, dept);
    const tot = (arr) => cell(() => arr.reduce((t, v) => t + val(v), 0));
    D.dbcalc_band_label = AE.calc.TIME_BANDS.map((b) => b[0]);
    D.dbcalc_band_total_self = sel === '' ? 0 : tot(bSelf);
    D.dbcalc_band_total_all = tot(bAll);
    D.dbcalc_band_total_dept = blank(dept) ? 0 : (isErr(dept) ? dept : tot(bDept));
    const share = (arr, total, off) => arr.map((v) => cell(() => (off || N(total) === 0 ? 0 : val(v) / val(total))));
    D.dbcalc_band_share_self = share(bSelf, D.dbcalc_band_total_self, sel === '');
    D.dbcalc_band_share_all = share(bAll, D.dbcalc_band_total_all, false);
    D.dbcalc_band_share_dept = blank(dept) ? [0, 0, 0, 0, 0] : share(bDept, D.dbcalc_band_total_dept, false);

    // §11 list (calc W order: sheet index, then date)
    const firstBySeq = new Map();                    // seq → [{k, i}] first row per sheet, in sheet order
    selCols.forEach((s, k) => {
      const seen = new Set();
      s.W.forEach((w, i) => {
        if (typeof w !== 'number' || seen.has(w)) return;
        seen.add(w);
        if (!firstBySeq.has(w)) firstBySeq.set(w, []);
        firstBySeq.get(w).push({ k, i });
      });
    });
    const lk = (src, i) => {                         // IFERROR(INDEX(計算1!src, MATCH(i, 計算1!W, 0)), IFERROR(… 計算6 …, ""))
      for (const p of firstBySeq.get(i) || []) {
        const v = sheets[p.k].rows[p.i][src];
        if (!isErr(v)) return v === undefined || v === null ? '' : v;
      }
      return '';
    };
    const LIST_SRC = [['date', 'B'], ['kind', 'P'], ['updated', 'V'], ['orig_start', 'X'], ['orig_end', 'Y'], ['start', 'J'],
      ['end', 'K'], ['job', 'R']];
    const item = (i) => { const o = { i }; for (const [f, src] of LIST_SRC) o[f] = lk(src, i); return o; };
    const nAll = Math.max(ABS_ROWS, D.dbcalc_list_count);
    D.dbcalc_list_all = [];
    for (let i = 1; i <= nAll; i++) D.dbcalc_list_all.push(item(i));
    D.dbcalc_list = D.dbcalc_list_all.slice(0, ABS_ROWS);

    // §12 period
    const mons = sheets.map((sh) => (sh.checks ? sh.checks.AA6 : ''));
    D.dbcalc_period_start = cell(() => {
      let mn = null;
      for (const m of mons) { const v = val(m); if (typeof v === 'number' && (mn === null || v < mn)) mn = v; }
      return mn === null || mn === 0 ? '' : mn;
    });
    D.dbcalc_period_end = cell(() => {
      if (val(D.dbcalc_period_start) === '') return '';
      let mx = null;
      for (const m of mons) { const v = val(m); if (typeof v === 'number' && (mx === null || v > mx)) mx = v; }
      return edate(mx, 1) - 1;
    });

    // §13 day grid
    buildGrid(WB, D, selRows, sel);
    return D;
  }

  function edate(s, months) {                        // EDATE(s, months)
    const p = ymdOf(Math.floor(s));
    let y = p.y, m = p.m + months;
    y += Math.floor((m - 1) / 12);
    m = ((((m - 1) % 12) + 12) % 12) + 1;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return X().date(y, m, Math.min(p.d, dim));
  }

  function buildGrid(WB, D, selRows, sel) {
    const S0 = D.dbcalc_period_start, E0 = D.dbcalc_period_end;
    const holRows = (WB.hol && WB.hol.rows) || [];
    const holDates = (WB.hol && WB.hol.dates) || new Set();
    const firstName = new Map();                     // MATCH(AN, 祝日・繁忙日!A, 0) → the first row's name
    for (const h of holRows) if (typeof h.date === 'number' && !firstName.has(h.date)) firstName.set(h.date, h.name);
    // busy_count(): rows of sel per date (any status), E=1 rows, G=1 rows
    const byDate = new Map();
    for (const rows of selRows) {
      for (const r of rows) {
        if (typeof r.B !== 'number') continue;
        let e = byDate.get(r.B);
        if (!e) byDate.set(r.B, (e = { rows: 0, work: 0, g: 0 }));
        e.rows++;
        if (critEq(r.E, 1)) e.work++;
        if (critEq(r.G, 1)) e.g++;
      }
    }
    const noSel = sel === '';
    const grid = [];
    let cum = 0, prevCand = null;
    for (let i = 0; i < BUSY_DAYS; i++) {
      const g = {};
      g.date = isErr(S0) ? S0 : (S0 === '' || isErr(E0) || S0 + i > E0 ? '' : S0 + i);
      const d = g.date, has = typeof d === 'number';
      g.name = has && firstName.has(d) ? cell(() => txt(firstName.get(d))) : '';
      g.reg_busy = has && holDates.has(d) ? 1 : 0;
      g.cand = has && (X().weekday(d, 2) >= 6 || g.reg_busy === 1) ? 1 : 0;
      const e = has ? byDate.get(d) : null;
      g.rows = g.cand === 0 || noSel ? '' : (e ? e.rows : 0);
      g.work_rows = g.cand === 0 || noSel ? '' : (e ? e.work : 0);
      g.sameday_abs_rows = g.reg_busy === 0 || noSel ? '' : (e ? e.g : 0);
      g.status = g.reg_busy === 0 || noSel ? '' : (N(g.rows) === 0 ? 0 : N(g.work_rows) > 0 ? 3 : N(g.sameday_abs_rows) > 0 ? 2 : 1);
      g.run_start = i === 0 ? (g.cand === 0 ? 0 : 1) : (g.cand === 1 && prevCand !== 1 ? 1 : 0);
      prevCand = g.cand;
      cum += g.run_start;
      g.run_no = g.cand === 0 ? '' : cum;
      g.worked = g.cand === 0 || noSel ? '' : (N(g.work_rows) > 0 ? 1 : 0);
      grid.push(g);
    }
    let miss = 0;
    const runLen = new Map(), runWorked = new Map();
    for (const g of grid) {
      g.miss_seq = g.status === '' || g.status === 3 ? '' : ++miss;
      if (g.run_no !== '') {
        runLen.set(g.run_no, (runLen.get(g.run_no) || 0) + 1);
        runWorked.set(g.run_no, (runWorked.get(g.run_no) || 0) + (typeof g.worked === 'number' ? g.worked : 0));
      }
    }
    let lr = 0;
    for (const g of grid) {
      g.run_len = g.run_no === '' ? '' : runLen.get(g.run_no);
      g.named_run_no = g.run_no === '' ? '' : (g.name === '' ? '' : g.run_no);
      g.run_worked = g.run_no === '' ? '' : runWorked.get(g.run_no);
      g.long_run_seq = g.run_start === 1 && N(g.run_len) >= RUN_MIN ? ++lr : '';
    }
    D.dbcalc_day = grid;
    // §13.1 summary
    const countStatus = (f) => grid.reduce((t, g) => t + (typeof g.status === 'number' && f(g.status) ? 1 : 0), 0);
    D.dbcalc_busy_reg_days = grid.reduce((t, g) => t + (g.reg_busy === 1 ? 1 : 0), 0);
    D.dbcalc_busy_worked = countStatus((s) => s === 3);
    D.dbcalc_busy_sameday_abs = countStatus((s) => s === 2);
    D.dbcalc_busy_advance_off = countStatus((s) => s === 1);
    D.dbcalc_busy_not_worked = countStatus((s) => s < 3);
    D.dbcalc_long_run_count = lr;
    // §13.2 display arrays (all items; the sheet holds the first 24 / 6)
    D.dbcalc_missed_busy_all = grid.filter((g) => g.miss_seq !== '').map((g) => ({ date: g.date, name: g.name }));
    D.dbcalc_long_run_all = grid.filter((g) => g.long_run_seq !== '').map((g) => {
      const named = grid.filter((x) => x.named_run_no === g.run_no);
      let name = '';
      if (named.length) {
        const nm = named[0].name;
        name = nm === '' ? '' : nm + (named.some((x) => !eqText(x.name, nm)) ? ' ほか' : '');
      }
      return { start: g.date, len: g.run_len, worked: g.run_worked, name };
    });
    const pad = (arr, n, mk) => { const out = arr.slice(0, n); while (out.length < n) out.push(mk()); return out; };
    D.dbcalc_missed_busy = pad(D.dbcalc_missed_busy_all, BUSY_ROWS, () => ({ date: '', name: '' }));
    D.dbcalc_long_run = pad(D.dbcalc_long_run_all, RUN_SHOW, () => ({ start: '', len: '', worked: '', name: '' }));
  }

  // ================================================================== ダッシュボード rows 1–47 (spec 40)
  function rateState(rate, D) {                      // the three stop-if-true rate rules (ISNUMBER(AC6), ≥ ◎, ≥ △)
    if (!isNum(rate)) return '';
    return ge(rate, D.dbcalc_thr_good) ? 'good' : ge(rate, D.dbcalc_thr_warn) ? 'warn' : 'crit';
  }

  function buildTop(WB, D, S, opts) {
    const R = WB.roster, settings = WB.settings;
    const sel = D.dbcalc_sel_emp_no, idx = D.dbcalc_sel_master_idx, rec = S.staff;
    const V = (col) => (idx === '' ? '' : AE.roster.colValue(rec, col));
    const anyNamed = (R.named || []).length > 0;     // 名簿!AT2<>""
    const rate = D.dbcalc_sel_att_rate, O = D.dbcalc_sel_confirmed_days;
    const T = {};
    // §4 header
    T.dashtop_title = TEXT.title;
    T.dashtop_subtitle = cell(() => txt(settings.theatre === undefined ? '' : settings.theatre) + TEXT.subtitleSuffix);
    T.dashtop_period = cell(() => '対象期間　' + txt(R.period_label));
    T.dashtop_status = R.has_warning === 1 ? '※ 貼付データに問題があります。「使い方」の貼付状況をご確認ください'
      : (blank(R.total_staff) ? '' : '集計対象 ' + txt(R.total_staff) + '名　　貼付済み ' + R.paste_ok_count + 'ヶ月');
    T.dashtop_status_warn = T.dashtop_status.charAt(0) === '※';
    // §5.2 filter (optional input)
    const hasFilter = opts && opts.filter !== undefined && opts.filter !== null && opts.filter !== '';
    if (hasFilter) {
      const fi = AE.roster.filterInfo(WB, opts.filter);
      T.dashtop_filter_input = fi.query;
      T.dashtop_filter_match_count = fi.match_count;
      T.dashtop_filter_msg = fi.query === '' ? '' : fi.match_count === 0
        ? '　「' + fi.query + '」に一致するスタッフはいません。▼は全員を表示しています'
        : '　「' + fi.query + '」に一致 ' + fi.match_count + '名　― 下の▼から選んでください（空欄にすると全員に戻ります）';
      T.dashtop_filter_msg_bad = fi.query !== '' && fi.match_count === 0;
    } else {
      T.dashtop_filter_input = '';
      T.dashtop_filter_match_count = R.filter ? R.filter.match_count : 0;
      T.dashtop_filter_msg = '';
      T.dashtop_filter_msg_bad = false;
    }
    // §5.3 / §5.4 staff box and info boxes
    T.dashtop_staff_box = S.b7;
    T.dashtop_sel_name_input = S.b7;
    T.dashtop_info_emp_no = V('I');
    T.dashtop_info_emp_no_text = cellText(T.dashtop_info_emp_no, '0');
    const dept = D.dbcalc_sel_dept_code;
    T.dashtop_info_dept = cell(() => (blank(val(dept)) ? '' : AE.roster.deptLabel(WB, dept)));
    T.dashtop_info_months = cell(() => (idx === '' ? '' : txt(V('AR')) + '/' + R.paste_ok_count + 'ヶ月'));
    // §5.5 badge
    T.dashtop_badge = cell(() => (blank(val(rate)) ? '－' : lt(O, D.dbcalc_min_days) ? '参考値'
      : ge(rate, D.dbcalc_thr_good) ? '◎ 良好' : ge(rate, D.dbcalc_thr_warn) ? '△ 注意' : '✕ 要改善'));
    T.dashtop_badge_criteria = cell(() => (blank(val(rate)) ? '' : lt(O, D.dbcalc_min_days)
      ? '確定 ' + txt(O) + '日（' + txt(D.dbcalc_min_days) + '日未満）'
      : '◎ ' + TEXTF(D.dbcalc_thr_good, '0%') + '以上／△ ' + TEXTF(D.dbcalc_thr_warn, '0%') + '以上'));
    T.dashtop_badge_style = !isNum(rate) ? '' : lt(O, D.dbcalc_min_days) ? 'ref' : rateState(rate, D);
    T.dashtop_badge_fill = BADGE_STYLE[T.dashtop_badge_style].fill;
    T.dashtop_badge_font = BADGE_STYLE[T.dashtop_badge_style].font;
    // §6 KPI tiles
    const KPI = [['work_days', 'M', '0"日"'], ['att_rate', 'P', '0.0%'], ['abs_days', 'N', '0"日"'], ['abs_rate', 'Q', '0.0%'],
      ['hours', 'R', '0.0"h"'], ['busy_rate', 'CB', '0.0%']];
    KPI.forEach(([id, col, f], i) => {
      const v = V(col);
      T['dashtop_kpi_' + id] = v;
      T['dashtop_kpi_' + id + '_text'] = cellText(v, f);
      T['dashtop_kpi_' + id + '_label'] = TEXT.kpiLabels[i];
    });
    T.dashtop_kpi_labels = TEXT.kpiLabels.slice();
    const AY6 = R.total_att_rate, AY7 = R.total_abs_rate, AY11 = R.total_busy_rate;
    T.dashtop_kpi_work_days_sub = cell(() => (idx === '' ? '' : '確定シフト ' + txt(V('O')) + '日'));
    T.dashtop_kpi_att_rate_sub = cell(() => (blank(val(rate)) ? '' : blank(val(AY6)) ? '' : '全体平均 ' + TEXTF(AY6, '0.0%')));
    T.dashtop_kpi_abs_days_sub = idx === '' ? '' : '当日の休み変更';
    T.dashtop_kpi_abs_rate_sub = cell(() => (blank(val(rate)) ? '' : blank(val(AY7)) ? '' : '全体平均 ' + TEXTF(AY7, '0.0%')));
    T.dashtop_kpi_hours_sub = cell(() => (idx === '' ? '' : blank(val(V('T'))) ? '' : '1日あたり ' + TEXTF(V('T'), '0.0') + 'h'));
    T.dashtop_kpi_busy_rate_sub = cell(() => (idx === '' ? '' : txt(D.dbcalc_busy_work_days) + '日' +
      (blank(val(AY11)) ? '' : '／平均 ' + TEXTF(AY11, '0.0%'))));
    T.dashtop_kpi_att_rate_color = rateState(rate, D);
    const absRate = D.dbcalc_sel_abs_rate;
    T.dashtop_kpi_abs_alert = isNum(absRate) && ge(absRate, D.dbcalc_alert_thr);
    // §7 sentences
    T.dashtop_summary = cell(() => {
      if (!anyNamed) return TEXT.noData;
      if (idx === '') return '';
      if (N(O) === 0) return '対象期間に確定シフトがありません。';
      return '確定シフト ' + txt(O) + '日のうち出勤 ' + txt(V('M')) + '日、当日欠勤 ' + txt(V('N')) + '日。出勤率 ' +
        TEXTF(rate, '0.0%') + '（全体平均 ' + TEXTF(D.dbcalc_cmp_all_rate, '0.0%') +
        (blank(val(dept)) ? '' : '・同所属 ' + TEXTF(D.dbcalc_cmp_dept_rate, '0.0%')) +
        '、' + txt(R.total_evaluated) + '人中 ' + txt(V('W')) + '位）';
    });
    T.dashtop_warning = cell(() => {
      if (anyNamed && !blank(S.b7) && sel === '') {
        return '「' + txt(S.b7) + '」は名簿にありません。▼から選ぶか、上の黄色い欄に名前か従業員番号の一部を入れてください。';
      }
      if (blank(val(absRate)) || blank(val(O))) return '';
      return ge(absRate, D.dbcalc_alert_thr)
        ? '⚠ 当日欠勤率 ' + TEXTF(absRate, '0.0%') + ' が基準（' + TEXTF(D.dbcalc_alert_thr, '0%') + '以上）に達しています。' : '';
    });
    // §8.1 attendance ring
    const w = D.dbcalc_work_days, a = D.dbcalc_abs_days;
    T.dashtop_ring_work = w;
    T.dashtop_ring_abs = a;
    T.dashtop_ring_center_label = TEXT.ringCenterLabel;
    T.dashtop_ring_center_value = blank(rate) ? '－' : rate;
    T.dashtop_ring_center_value_text = cellText(T.dashtop_ring_center_value, '0.0%');
    T.dashtop_ring_center_color = rateState(rate, D);
    const ringPct = (x) => cell(() => TEXTF(val(w) + val(a) === 0 ? 0 : val(x) / (val(w) + val(a)), '0%'));
    T.dashtop_ring_legend_work = sel === '' ? '' : cell(() => '● 出勤 ' + val(ringPct(w)));
    T.dashtop_ring_legend_abs = sel === '' ? '' : cell(() => '● 欠勤 ' + val(ringPct(a)));
    T.dashtop_chart_ring = { categories: ['出勤', '欠勤'], values: [w, a], colors: [COLORS.blue, COLORS.red] };
    // §8.2 monthly stacked bars
    T.dashtop_month_label = D.dbcalc_month_label.slice();
    T.dashtop_month_work = D.dbcalc_month_work.slice();
    T.dashtop_month_abs = D.dbcalc_month_abs.slice();
    T.dashtop_month_work_text = T.dashtop_month_work.map((v) => cellText(v, '0;;;'));
    T.dashtop_month_abs_text = T.dashtop_month_abs.map((v) => cellText(v, '0;;;'));
    T.dashtop_month_legend_work = TEXT.monthLegend[0];
    T.dashtop_month_legend_abs = TEXT.monthLegend[1];
    T.dashtop_chart_month = {
      categories: T.dashtop_month_label.map((l) => cellText(l)),
      series: [{ name: '出勤日数', values: T.dashtop_month_work, color: COLORS.blue, labels: T.dashtop_month_work_text },
        { name: '欠勤日数', values: T.dashtop_month_abs, color: COLORS.red, labels: null }],
      stacked: true, majorUnit: 5,
    };
    // §8.3 job ring, centre, legend
    T.dashtop_job_label = D.dbcalc_job_label.slice();
    T.dashtop_job_label_text = T.dashtop_job_label.map((l) => cellText(l));
    T.dashtop_job_hours = D.dbcalc_job_hours.slice();
    T.dashtop_job_share = D.dbcalc_job_share.slice();
    T.dashtop_job_share_text = T.dashtop_job_share.map((v) => cellText(v, '0%;;;'));
    T.dashtop_job_seq = D.dbcalc_job_pos_seq.slice();
    T.dashtop_job_legend_idx = D.dbcalc_job_legend_idx.slice();
    T.dashtop_job_top_label = D.dbcalc_job_top_label;
    T.dashtop_job_center_label = TEXT.jobCenterLabel;
    T.dashtop_job_center_value = cell(() => (val(D.dbcalc_job_top_label) === '' ? '－' : val(D.dbcalc_job_top_label)));
    T.dashtop_job_center_value_text = cellText(T.dashtop_job_center_value);
    T.dashtop_job_legend_slot = [];
    T.dashtop_job_legend_slot_color = [];
    for (let j = 0; j < 6; j++) {
      const ix = T.dashtop_job_legend_idx[j];
      T.dashtop_job_legend_slot.push(ix === '' ? '' : cell(() => txt(D.dbcalc_job_label[ix - 1]) + ' ' + TEXTF(D.dbcalc_job_share[ix - 1], '0%')));
      T.dashtop_job_legend_slot_color.push(ix === '' ? '' : CAT_TXT[ix - 1]);
    }
    T.dashtop_cat_colors = CAT_COLORS.slice();
    T.dashtop_cat_txt = CAT_TXT.slice();
    T.dashtop_chart_job = { categories: T.dashtop_job_label_text, values: T.dashtop_job_hours, colors: CAT_COLORS.slice(),
      labels: T.dashtop_job_share_text, hole: 0.7 };
    // §9.1 weekday bars
    T.dashtop_wd_label = D.dbcalc_wd_label.slice();
    T.dashtop_wd_work_days = D.dbcalc_wd_days.slice();
    T.dashtop_chart_weekday = { categories: T.dashtop_wd_label, values: T.dashtop_wd_work_days,
      colors: T.dashtop_wd_label.map((_, i) => (i >= 5 ? COLORS.blueD : COLORS.blue)),
      labels: T.dashtop_wd_work_days.map((v) => cellText(v)), majorUnit: 5 };
    // §9.2 radar + table
    T.dashtop_band_label = D.dbcalc_band_label.slice();
    T.dashtop_band_self = D.dbcalc_band_share_self.slice();
    T.dashtop_band_all = D.dbcalc_band_share_all.slice();
    T.dashtop_band_dept = D.dbcalc_band_share_dept.slice();
    T.dashtop_band_total_self = D.dbcalc_band_total_self;
    T.dashtop_band_total_all = D.dbcalc_band_total_all;
    T.dashtop_band_total_dept = D.dbcalc_band_total_dept;
    const tblVals = (arr) => arr.map((v) => (sel === '' ? '' : v));            // =IF(sel="","",DB計算!…)
    T.dashtop_radar_values = { self: tblVals(T.dashtop_band_self), all: tblVals(T.dashtop_band_all), dept: tblVals(T.dashtop_band_dept) };
    T.dashtop_radar_table = {
      header: TEXT.radarHeader.slice(), labels: TEXT.radarRows.slice(),
      colors: [COLORS.navy, COLORS.all, COLORS.dept],
      self: T.dashtop_radar_values.self.map((v) => cellText(v, '0%')),
      all: T.dashtop_radar_values.all.map((v) => cellText(v, '0%')),
      dept: T.dashtop_radar_values.dept.map((v) => cellText(v, '0%')),
    };
    T.dashtop_chart_radar = { categories: T.dashtop_band_label, series: [
      { name: '本人', values: T.dashtop_band_self, color: COLORS.navy, width: 2.5, marker: true },
      { name: '全体', values: T.dashtop_band_all, color: COLORS.all, width: 1.75, marker: false },
      { name: '同所属', values: T.dashtop_band_dept, color: COLORS.dept, width: 1.75, marker: false }] };
    // §9.3 timing panel
    T.dashtop_rest_count = Object.assign({}, D.dbcalc_rest_days);
    T.dashtop_timing_values = {};
    T.dashtop_rest_count_text = {};
    for (const code of ['事前', '前日', '当日', '事後']) {
      const v = sel === '' ? '' : D.dbcalc_rest_days[code];
      T.dashtop_timing_values[code] = v;
      T.dashtop_rest_count_text[code] = cellText(v, '0"日"');
    }
    T.dashtop_late_days = D.dbcalc_late_days;
    T.dashtop_early_days = D.dbcalc_early_days;
    T.dashtop_late_rate = D.dbcalc_late_rate;
    T.dashtop_early_rate = D.dbcalc_early_rate;
    T.dashtop_timing_late = sel === '' ? '' : cell(() => txt(D.dbcalc_late_days) + '日 ' + TEXTF(D.dbcalc_late_rate, '0.0%'));
    T.dashtop_timing_early = sel === '' ? '' : cell(() => txt(D.dbcalc_early_days) + '日 ' + TEXTF(D.dbcalc_early_rate, '0.0%'));
    T.dashtop_timing_note = cell(() => (N(D.dbcalc_rest_days['事後']) > 0
      ? '※ シフト日より後に更新された休みが ' + txt(D.dbcalc_rest_days['事後']) + '日あります（欠勤には含めていません）' : ''));
    return T;
  }

  // ================================================================== ダッシュボード rows 48–99 (spec 50)
  function buildBottom(WB, D, S) {
    const R = WB.roster, settings = WB.settings, sheets = WB.sheets;
    const sel = D.dbcalc_sel_emp_no, idx = D.dbcalc_sel_master_idx, rec = S.staff;
    const B = {};
    // §3 月別の実績
    B.dashbottom_month_title = TEXT.monthTitle;
    B.dashbottom_month_header = TEXT.monthHeader.slice();
    B.dashbottom_month_label = R.month_label.slice();
    const F = ['work_days', 'abs_days', 'confirmed_days', 'att_rate', 'work_hours', 'avg_hours', 'busy_work_days', 'prevday_rest_days'];
    const FMT = ['0"日"', '0"日"', '0"日"', '0.0%', '0.0"h"', '0.0"h"', '0"日"', '0"日"'];
    for (const f of F) B['dashbottom_month_' + f] = [];
    for (let k = 0; k < NSHEETS; k++) {
      let v;
      if (idx === '') v = F.map(() => '');
      else {
        const has = cell(() => N(rec.month_has[k]) === 1);
        if (isErr(has)) v = F.map(() => has);
        else if (!has) v = F.map(() => '—');
        else {
          const mw = rec.month_work[k], ma = rec.month_abs[k], mh = rec.month_hrs[k];
          const J = cell(() => N(mw) + N(ma));
          const M = cell(() => (N(J) === 0 ? '－' : N(mw) / N(J)));
          const Sx = cell(() => (N(mw) === 0 ? '－' : N(mh) / N(mw)));
          const rows = (sheets[k] && sheets[k].rows) || [];
          const mine = rows.filter((r) => !isErr(r.A) && critEq(r.A, sel));
          const U = cell(() => sum6([mine], 'H', (r) => critEq(r.BC, 1)));
          const W = cell(() => sum6([mine], 'U', (r) => critEq(r.P, '前日')));
          v = [mw, ma, J, M, mh, Sx, U, W];
        }
      }
      F.forEach((f, i) => B['dashbottom_month_' + f].push(v[i]));
    }
    F.forEach((f, i) => { B['dashbottom_month_' + f + '_text'] = B['dashbottom_month_' + f].map((x) => cellText(x, FMT[i])); });
    B.dashbottom_month_total_label = TEXT.monthTotal;
    const SUM = (f) => cell(() => B['dashbottom_month_' + f].reduce((t, x) => { const y = val(x); return typeof y === 'number' ? t + y : t; }, 0));
    if (idx === '') for (const f of F) B['dashbottom_month_total_' + f] = '';
    else {
      for (const f of ['work_days', 'abs_days', 'confirmed_days', 'work_hours', 'busy_work_days', 'prevday_rest_days']) B['dashbottom_month_total_' + f] = SUM(f);
      const tF = B.dashbottom_month_total_work_days, tJ = B.dashbottom_month_total_confirmed_days, tP = B.dashbottom_month_total_work_hours;
      B.dashbottom_month_total_att_rate = cell(() => (N(tJ) === 0 ? '－' : N(tF) / N(tJ)));
      B.dashbottom_month_total_avg_hours = cell(() => (N(tF) === 0 ? '－' : N(tP) / N(tF)));
    }
    F.forEach((f, i) => { B['dashbottom_month_total_' + f + '_text'] = cellText(B['dashbottom_month_total_' + f], FMT[i]); });
    // §3.4 conditional formats
    const rs = (v) => rateState(v, D);
    B.dashbottom_month_att_rate_color = B.dashbottom_month_att_rate.map(rs);
    B.dashbottom_month_total_att_rate_color = rs(B.dashbottom_month_total_att_rate);
    B.dashbottom_month_abs_red = B.dashbottom_month_abs_days.map((v) => isNum(v) && v > 0);
    B.dashbottom_month_bar_pct = B.dashbottom_month_work_days.map((v) => (isNum(v) ? 10 + 80 * Math.min(Math.max(v, 0), 31) / 31 : null));

    // §4 absence / time-change list
    B.dashbottom_abs_title = TEXT.absTitle;
    B.dashbottom_abs_header = TEXT.absHeader.slice();
    const jobs = settings.jobs || [];
    const jobLabel = (code) => {                      // MATCH(L.job, 設定!A13:A32, 0) → B (blank B → the code); no match → the code
      if (isErr(code)) return code;
      const hit = jobs.slice(0, NJOB).find((j) => !blank(j.code) && matchEq(j.code, code));
      return !hit || blank(hit.label) ? code : hit.label;
    };
    const noItems = sel !== '' && N(D.dbcalc_list_count) === 0;
    B.dashbottom_abs_row = D.dbcalc_list_all.map((L, i) => {
      const date = i === 0 && noItems ? TEXT.none : L.date;
      const kind = L.kind;
      const isAbs = !blank(kind) && !isErr(kind) && eqText(kind, '当日');
      const row = {
        date,
        weekday: cell(() => (isNum(date) ? weekdayJa(date) : '')),
        kind_label: cell(() => (blank(val(kind)) ? '' : isAbs ? '欠勤' : kind)),
        updated: L.updated,
        orig_time: cell(() => (blank(val(kind)) ? '' : N(L.orig_start) === 0 ? '' : fmtHM(L.orig_start) + '〜' + fmtHM(L.orig_end))),
        new_time: cell(() => (blank(val(kind)) ? '' : isAbs ? '休み' : fmtHM(L.start) + '〜' + fmtHM(L.end))),
        job_label: cell(() => (blank(val(L.job)) ? '' : jobLabel(L.job))),
      };
      row.date_text = cellText(row.date, 'md');
      row.weekday_text = cellText(row.weekday);
      row.kind_label_text = cellText(row.kind_label);
      row.updated_text = cellText(row.updated, 'mdhm');
      row.orig_time_text = cellText(row.orig_time);
      row.new_time_text = cellText(row.new_time);
      row.job_label_text = cellText(row.job_label);
      row.red = row.kind_label === '欠勤';            // dashbottom_abs_cf_kind_red
      row.extra = i >= ABS_ROWS;                      // beyond the A4 page (scope decision 1)
      return row;
    });
    B.dashbottom_abs_footnote = (sel === '' ? '' : (N(D.dbcalc_list_count) > ABS_ROWS
      ? 'ほか ' + (D.dbcalc_list_count - ABS_ROWS) + ' 件（表示は最初の' + ABS_ROWS + '件）。' : '')) + TEXT.absFoot;

    // §5 busy days
    const n = (x) => cell(() => N(x));
    const r96 = n(D.dbcalc_busy_reg_days), r97 = n(D.dbcalc_busy_worked), r98 = n(D.dbcalc_busy_sameday_abs),
      r99 = n(D.dbcalc_busy_advance_off), r58 = n(D.dbcalc_busy_not_worked), r60 = n(D.dbcalc_long_run_count),
      r63 = n(D.dbcalc_extra_apps), r64 = n(D.dbcalc_extra_apps_confirmed), r65 = n(D.dbcalc_extra_apps_busy);
    const SP = '　';
    B.dashbottom_busy_title = TEXT.busyTitle;
    B.dashbottom_busy_summary_line = sel === '' ? '' : r96 === 0
      ? '対象期間に登録された繁忙日がありません（「祝日・繁忙日」シートで追加できます）。'
      : `対象期間の繁忙日 ${r96}日${SP}／${SP}出勤 ${r97}日・当日欠勤 ${r98}日・事前に休み等 ${r99}日・シフトなし ${r96 - r97 - r98 - r99}日`;
    const ea = `自分から手を挙げた応募（募集を見てあとから応募したもの）${SP}`;
    B.dashbottom_busy_extra_apps_line = sel === '' ? '' : r63 === 0 ? ea + '対象期間にはありません'
      : ea + `${txt(r63)}件（うち確定 ${txt(r64)}件／繁忙日 ${txt(r65)}件）`;
    const rl = `連休の入り方（土日・祝日・繁忙日が連続する${RUN_MIN}日以上）${SP}― `;
    B.dashbottom_busy_runs_label = sel === '' ? '' : r60 === 0 ? rl + '対象期間にはありません'
      : rl + `どの連休に何日出勤したか${SP}${SP}${r60} 件`;
    B.dashbottom_busy_runs_header = TEXT.runsHeader.slice();
    const runs = D.dbcalc_long_run_all.slice();
    while (runs.length < RUN_SHOW) runs.push({ start: '', len: '', worked: '', name: '' });
    B.dashbottom_busy_run_row = runs.map((Rn, m) => {
      const blankRow = sel === '' || Rn.start === '';
      const row = {
        period: sel === '' ? '' : r60 === 0 ? TEXT.none : Rn.start === '' ? '' : cell(() =>
          fmtMD(Rn.start) + '（' + weekdayJa(Rn.start) + '）〜' + fmtMD(Rn.start + Rn.len - 1) + '（' + weekdayJa(Rn.start + Rn.len - 1) + '）'),
        names: blankRow ? '' : Rn.name,
        len: blankRow ? '' : Rn.len,
        worked: blankRow ? '' : cell(() => N(Rn.worked)),
      };
      row.period_text = cellText(row.period);
      row.names_text = cellText(row.names);
      row.len_text = cellText(row.len, '0"日"');
      row.worked_text = cellText(row.worked, '0"日"');
      row.extra = m >= RUN_SHOW;
      return row;
    });
    B.dashbottom_busy_missed_label = TEXT.missedLabel;
    const missed = D.dbcalc_missed_busy_all.slice();
    while (missed.length < BUSY_ROWS) missed.push({ date: '', name: '' });
    B.dashbottom_busy_missed_cell = missed.map((M, j) => {
      const body = M.date === '' ? '' : cell(() => fmtMD(M.date) + '（' + weekdayJa(M.date) + '）' + (M.name === '' ? ' ' : ' ' + txt(M.name)));
      if (j > 0) return body;
      return sel === '' ? '' : (r96 > 0 && r58 === 0) ? '該当なし（対象期間の繁忙日はすべて出勤しています）' : body;
    });
    // cell j (0-based) of the 3 × 8 grid: row 90 + floor(j / 3), block j % 3 ∈ {B:H, J:P, R:X}
    B.dashbottom_busy_missed_grid = [];
    for (let r0 = 0; r0 < B.dashbottom_busy_missed_cell.length; r0 += 3) B.dashbottom_busy_missed_grid.push(B.dashbottom_busy_missed_cell.slice(r0, r0 + 3));
    B.dashbottom_busy_footnote = (sel === '' ? '' : (r58 > BUSY_ROWS ? `日付は最初の${BUSY_ROWS}日まで（ほか ${r58 - BUSY_ROWS} 日）。` : ''))
      + (r60 > RUN_SHOW ? `連休は ほか ${r60 - RUN_SHOW} 件。` : '')
      + `連休＝土日・祝日・繁忙日が${RUN_MIN}日以上連続する期間（土日も日数に数えます）。`
      + '出勤していない繁忙日には、当日欠勤・事前の休み・そもそもシフトが無かった日が含まれます（理由はこの表からは分かりません）。';
    return B;
  }

  // ================================================================== public
  function view(WB, staff, opts) {
    if (!WB || !WB.roster) throw new Error('AE.view.view needs a WB built with the roster layer');
    const S = resolveSelection(WB, staff);
    const D = buildDbCalc(WB, S);
    const T = buildTop(WB, D, S, opts || {});
    const B = buildBottom(WB, D, S);
    const out = Object.assign({ staff: S.staff }, D, T, B);
    // dashtop_* restatements of DB計算 cells (00_index §5.1)
    out.dashtop_sel_no = D.dbcalc_sel_emp_no;
    out.dashtop_sel_idx = D.dbcalc_sel_master_idx;
    out.dashtop_sel_dept_code = D.dbcalc_sel_dept_code;
    out.dashtop_sel_att_rate = D.dbcalc_sel_att_rate;
    out.dashtop_sel_att_rate_text = cellText(D.dbcalc_sel_att_rate, '0.0%');
    out.dashtop_sel_abs_rate = D.dbcalc_sel_abs_rate;
    out.dashtop_sel_abs_rate_text = cellText(D.dbcalc_sel_abs_rate, '0.0%');
    out.dashtop_sel_confirmed_days = D.dbcalc_sel_confirmed_days;
    out.dashtop_th_good = D.dbcalc_thr_good;
    out.dashtop_th_warn = D.dbcalc_thr_warn;
    out.dashtop_th_min_days = D.dbcalc_min_days;
    out.dashtop_th_alert = D.dbcalc_alert_thr;
    out.dashtop_cmp_all_rate = D.dbcalc_cmp_all_rate;
    out.dashtop_cmp_dept_rate = D.dbcalc_cmp_dept_rate;
    out.dashtop_busy_work_days = D.dbcalc_busy_work_days;
    // display caps of the A4 page (scope decision 1)
    out.limits = { absRows: ABS_ROWS, runShow: RUN_SHOW, busyRows: BUSY_ROWS, busyDays: BUSY_DAYS, runMin: RUN_MIN };
    return out;
  }

  AE.view = {
    NSHEETS, NJOB, NCAT, ABS_ROWS, BUSY_DAYS, BUSY_ROWS, RUN_MIN, RUN_SHOW, WD_ORDER, PROMPT,
    TEXT, COLORS, CAT_COLORS, CAT_TXT, STATE_COLORS, BADGE_STYLE,
    view, resolveSelection,
    fmt: { pct: fmtPct, fixed: fmtFixed, md: fmtMD, mdhm: fmtMDHM, hm: fmtHM, ymd: fmtYMD, weekdayJa, cellText, text: TEXTF },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
