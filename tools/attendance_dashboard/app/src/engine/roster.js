/* 勤務実績ダッシュボード — engine: 名簿 (spec 20) and every whole-theatre surface built on it:
 * スタッフ一覧 / 全体サマリー / 使い方 paste-status table (spec 60 §B–§D.2) and the 設定 C-column row counts (spec 10 §7.4).
 *
 *   AE.roster.build(WB, opts)      → the roster object (also stored as WB.roster by attach())
 *   AE.roster.attach(WB, opts)     → build + flat spec-identifier aliases on WB (called by AE.api.build)
 *   AE.roster.filter(WB, query)    → [staffRef] for the dashboard dropdown (AE.api.filter), see filterInfo()
 *   AE.roster.filterInfo(WB, query)→ the 名簿!CG:CJ columns for that query (+ StaffNames)
 *   AE.roster.findByName(WB, text) → staff of MATCH(text, AT, 0) (first in name order) or null   (DB計算!AC3)
 *   AE.roster.findByKey(WB, key)   → staff of MATCH(key, I, 0) or null                           (DB計算!AC4)
 *   AE.roster.deptLabel(WB, code)  → IFERROR(INDEX(BQ14:BQ33, MATCH(code, BP14:BP33, 0)), code)
 *   AE.roster.colValue(staff, col) → 名簿 column `col` of that staff ('' for an unknown column)
 *   AE.roster.format(v, fmt)       → Excel display text for the number formats of these sheets
 *
 * Roster object (WB.roster):
 *   limits                {maxrows, maxstaff, pasteRows}; default = no caps (CONTRACT scope decision 1).
 *                         AE.roster.EXCEL_LIMITS reproduces the workbook (6000 rows, 400 staff, row 200000).
 *   stack[]               名簿!A:G — {k, i, r, pos (A), no (B), name (C), dept (D), qual (E), first (F), cum (G)}
 *                         in stack order (CSV_6 first; i = 1.. within the sheet); r = stack position (6-k)*block+i
 *                         (block = 400 as in the workbook unless a sheet has more distinct staff). Excel row = r+1.
 *   stack_distinct        MAX(G) (distinct employees in the stack)
 *   master[]              名簿 rows 2.. (master order). Each staff object carries the 名簿 values keyed by column
 *                         letter (H..T, V, W, X, Y, Z..AQ, AR, AS, AW, BG..BL, BM, BN, BX, BY, BZ, CB, CC, CD, CE)
 *                         and by spec name (n, row, emp_no, name, dept_code, qual, work_days, abs_days,
 *                         confirmed_days, att_rate, abs_rate, work_hours, night_hours, avg_hours_per_day,
 *                         name_key, att_rank, att_order_desc, worst_key, month_work[6], month_abs[6], month_hrs[6],
 *                         month_has[6], months_with_data, att_rate_key, tie_count, late_days, early_days, late_rate,
 *                         early_rate, busy_work_days, busy_rate, extra_apps, extra_apps_confirmed, extra_apps_busy,
 *                         dept_label (display name used by スタッフ一覧 / ワースト10)).
 *   named[]               staff with a non-empty name, in name order (AT/AU/AV = name_sorted / no_sorted / row_sorted)
 *   worst_order[]         master indices in ワースト order (Y = 1..)
 *   total_*               名簿!AY2..AY11, dept[20] (BP..BW), sheet_name / month_label / paste_rows / paste_status [6],
 *                         period_label, month_order_warning, has_warning, staff_cap_warning, paste_ok_count
 *   filter                filterInfo(WB, '') (名簿!CG:CJ with an empty ダッシュボード!D5)
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});
  const NSHEETS = 6, NDEPT = 20, NJOB = 20, WORST_N = 10;
  const DEFAULT_LIMITS = Object.freeze({ maxrows: Infinity, maxstaff: Infinity, pasteRows: Infinity });
  const EXCEL_LIMITS = Object.freeze({ maxrows: 6000, maxstaff: 400, pasteRows: 199999 });

  const X = () => AE.calc.xl;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const isErr = (v) => v instanceof AE.calc.xl.XLError;
  const blank = (v) => v === null || v === undefined || v === '';

  // ================================================================== Excel semantics helpers
  // MATCH(…,0) equality (scope decision 3: no wildcards): same type; text case-insensitive.
  function matchEq(a, b) {
    if (typeof a === 'string' && typeof b === 'string') return a === b || a.toLowerCase() === b.toLowerCase();
    return typeof a === typeof b && a === b;
  }
  // COUNTIF / SUMIFS criterion equality (roster_crit_eq): a number criterion also matches numeric text and a
  // numeric-text criterion also matches numbers (Excel coercion, 20 §6); text is case-insensitive; no wildcards.
  function critEq(cellV, crit) {
    if (isErr(cellV)) return false;
    if (blank(crit)) return blank(cellV);
    if (typeof crit === 'number') {
      if (typeof cellV === 'number') return cellV === crit;
      if (typeof cellV === 'string') { const n = X().parseNumberText(cellV); return n !== null && n === crit; }
      return false;
    }
    if (typeof crit === 'string') {
      if (typeof cellV === 'string') return cellV === crit || cellV.toLowerCase() === crit.toLowerCase();
      if (typeof cellV === 'number') { const n = X().parseNumberText(crit); return n !== null && n === cellV; }
      return false;
    }
    return cellV === crit;
  }
  // Excel comparison of a cell value with a setting in a formula (`O<設定!B5`, `P>=設定!B3`):
  // blank → 0 against a number; numbers sort before text, text before booleans.
  const TYPE_RANK = { number: 0, string: 1, boolean: 2 };
  function xlCompare(a, b) {
    if (blank(a) && blank(b)) return 0;
    if (blank(a)) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (blank(b)) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    const ta = TYPE_RANK[typeof a], tb = TYPE_RANK[typeof b];
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (typeof a === 'string') { a = a.toLowerCase(); b = b.toLowerCase(); }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  // A criterion built as ">="&B6: the setting goes through its General text (15 significant digits).
  function critNumber(v) {
    if (blank(v)) return 0;                                   // blank setting → 0 (00_index §5.3, OQ4)
    if (typeof v === 'number') return Number(X().generalText(v));
    const n = X().parseNumberText(v);
    return n === null ? null : n;                             // text criterion: no number matches
  }
  // Excel TRIM: strip U+0020 at both ends and collapse inner runs (U+3000 untouched).
  const excelTrim = (s) => String(s).replace(/ {2,}/g, ' ').replace(/^ +| +$/g, '');
  function codePointCompare(a, b) {
    const ia = a[Symbol.iterator](), ib = b[Symbol.iterator]();
    for (;;) {
      const x = ia.next(), y = ib.next();
      if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
      const cx = x.value.codePointAt(0), cy = y.value.codePointAt(0);
      if (cx !== cy) return cx < cy ? -1 : 1;
    }
  }
  // Scope decision 4: Intl.Collator('ja'), then code point (then master order, applied by the caller).
  let COLLATOR = null;
  function nameCompare(a, b) {
    if (!COLLATOR) {
      try { COLLATOR = new Intl.Collator('ja'); } catch (e) { COLLATOR = { compare: () => 0 }; }
    }
    return COLLATOR.compare(a, b) || codePointCompare(a, b);
  }

  // ================================================================== display formats (60 §F)
  function roundTo(x, d) {
    const f = Math.pow(10, d);
    const r = Math.floor(Number((Math.abs(x) * f).toPrecision(15)) + 0.5) / f;
    return x < 0 && r !== 0 ? -r : r;
  }
  const comma = (s) => s.replace(/^(-?)(\d+)/, (m, sg, d) => sg + d.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  const FORMATS = {
    'General': null,
    '0': { d: 0 }, '#,##0': { d: 0, comma: true },
    '0"日"': { d: 0, suf: '日' }, '#,##0"日"': { d: 0, comma: true, suf: '日' },
    '0"名"': { d: 0, suf: '名' }, '0"ヶ月"': { d: 0, suf: 'ヶ月' }, '0"件"': { d: 0, suf: '件' },
    '0.0': { d: 1 }, '0.0"h"': { d: 1, suf: 'h' },
    '0%': { d: 0, pct: true }, '0.0%': { d: 1, pct: true },
  };
  const ROWCOUNT_ZERO = '※ 貼付データに無い値です（表記を確認）';
  function format(v, fmt) {
    if (v === null || v === undefined) return '';
    if (isErr(v)) return v.code;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v !== 'number') return String(v);
    if (!isFinite(v)) return '#NUM!';
    if (fmt === 'rowcount') return v === 0 ? ROWCOUNT_ZERO : comma(roundTo(v, 0).toFixed(0)) + '行';
    const f = FORMATS[fmt];
    if (!f) return X().generalText(v);
    const x = f.pct ? v * 100 : v;
    let s = roundTo(x, f.d).toFixed(f.d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    if (f.comma) s = comma(s);
    return s + (f.pct ? '%' : '') + (f.suf || '');
  }

  // ================================================================== fixed strings
  const T_PERIOD_NONE = '（CSV未貼付）';
  const STATUS = {
    none: '未貼付',
    noHeader: '※ 列名が見つかりません（1行目にヘッダーを含めて貼り付けてください）',
    tooMany: (maxrows) => `※ ${comma(String(maxrows))}行を超えています（超過分は集計されません）`,
    otherMonth: (n) => `※ 対象月以外の日付の行が ${n} 行あります（前のデータが残っている可能性。全選択→削除してから貼り直し）`,
    unreadable: (d, t) => `※ 読み取れない値があります（日付 ${d} 行／番号 ${t} 行）`,
    ok: 'OK',
  };
  const ORDER_WARNING = '※ CSV_1→CSV_6 が古い月から順に並んでいません（月別推移の並びと最新の名前の採用が崩れます）';
  const capWarning = (cap, n) => `※ スタッフが半年で${cap}名を超えています（${n}名）。超えた分は集計されません`;

  // Literal labels of the hidden 名簿 sheet (header row 1 and the AX / BP / CJ blocks).
  const ROSTER_HEADERS = {
    A: '一致行', B: '番号', C: '名前', D: '所属', E: '資格', F: '初出', G: '累積',
    H: '名簿行', I: '従業員番号', J: '名前', K: '所属', L: '資格', M: '出勤日数', N: '欠勤日数',
    O: '確定シフト日数', P: '出勤率', Q: '当欠率', R: '勤務時間', S: '深夜時間', T: '平均/日',
    V: '名前順キー', W: '出勤率順位', X: '出勤率順キー(降順)', Y: 'ワーストキー(昇順)',
    AR: '在籍月数', AS: '出勤率整数キー', AW: '同率人数', AT: '名前(名前順)', AU: '番号(名前順)', AV: '名簿行(名前順)',
    BM: '当日遅出日数', BN: '当日早退日数', BX: '当日遅出率', BY: '当日早退率',
    BZ: '土日祝出勤日数', CB: '土日祝出勤率', CC: '追加応募件数', CD: '追加応募・確定', CE: '追加応募・繁忙日',
  };
  const MONTH_WORK = ['Z', 'AA', 'AB', 'AC', 'AD', 'AE'];
  const MONTH_ABS = ['AF', 'AG', 'AH', 'AI', 'AJ', 'AK'];
  const MONTH_HRS = ['AL', 'AM', 'AN', 'AO', 'AP', 'AQ'];
  const MONTH_HAS = ['BG', 'BH', 'BI', 'BJ', 'BK', 'BL'];
  MONTH_WORK.forEach((c, i) => { ROSTER_HEADERS[c] = `出勤日数 月${i + 1}`; });
  MONTH_ABS.forEach((c, i) => { ROSTER_HEADERS[c] = `欠勤日数 月${i + 1}`; });
  MONTH_HRS.forEach((c, i) => { ROSTER_HEADERS[c] = `勤務時間 月${i + 1}`; });
  MONTH_HAS.forEach((c, i) => { ROSTER_HEADERS[c] = `データ有無 月${i + 1}`; });
  const SHEET_TEXT = {
    headers: ROSTER_HEADERS,
    AX1: '全体サマリー', CJ1: '絞り込み', AX20: '月ラベル / 貼付状況', BP12: '所属別（設定シートの所属の一覧。空欄の行は空）',
    totalLabels: { 2: 'スタッフ数', 3: '総出勤日数', 4: '総欠勤日数', 5: '総確定シフト日数', 6: '全体出勤率', 7: '全体当欠率',
      8: '評価対象人数(確定日数>0)', 9: '総勤務時間', 10: '当欠アラート該当者数', 11: '全体の土日祝出勤率' },
    pasteHeaders: ['シート', '月', '貼付行数', '状態'],                         // AX21:BA21
    deptHeaders: ['所属コード', '表示名', '人数', '出勤日数', '欠勤日数', '確定日数', '出勤率', '当欠率'],   // BP13:BW13
    AX29: '対象期間', AX30: '月順チェック', AX31: '警告あり', AX32: '人数チェック',
  };
  // 名簿 column letter → staff field (families: [field, k-index])
  const COL_FIELD = {
    H: 'row', I: 'emp_no', J: 'name', K: 'dept_code', L: 'qual', M: 'work_days', N: 'abs_days', O: 'confirmed_days',
    P: 'att_rate', Q: 'abs_rate', R: 'work_hours', S: 'night_hours', T: 'avg_hours_per_day', V: 'name_key',
    W: 'att_rank', X: 'att_order_desc', Y: 'worst_key', AR: 'months_with_data', AS: 'att_rate_key', AW: 'tie_count',
    BM: 'late_days', BN: 'early_days', BX: 'late_rate', BY: 'early_rate', BZ: 'busy_work_days', CB: 'busy_rate',
    CC: 'extra_apps', CD: 'extra_apps_confirmed', CE: 'extra_apps_busy',
  };
  MONTH_WORK.forEach((c, i) => { COL_FIELD[c] = ['month_work', i]; });
  MONTH_ABS.forEach((c, i) => { COL_FIELD[c] = ['month_abs', i]; });
  MONTH_HRS.forEach((c, i) => { COL_FIELD[c] = ['month_hrs', i]; });
  MONTH_HAS.forEach((c, i) => { COL_FIELD[c] = ['month_has', i]; });
  const MASTER_COLS = Object.keys(COL_FIELD);
  function colValue(s, col) {
    if (!s) return '';
    const f = COL_FIELD[col];
    if (!f) return '';
    const v = Array.isArray(f) ? s[f[0]][f[1]] : s[f];
    return v === undefined ? '' : v;
  }

  // スタッフ一覧 / 全体サマリー / 使い方 fixed strings (60 §B–§D, verbatim)
  const LIST_TEXT = {
    staffTitle: 'スタッフ一覧（半年集計）',
    staffPeriod: (p) => `対象期間　${p}　　名前順（先頭の部門記号でまとまります）。フィルターで所属や判定を絞り込めます。印刷は順位〜在籍月数の列です。`,
    staffLink: '→ 個人のページはダッシュボードで（従業員番号をコピーして、上の黄色い絞り込み欄に貼ると早く探せます）',
    staffLinkTarget: "#'ダッシュボード'!D5",
    staffTableTitle: 'スタッフ別 集計（半年）',
    staffHeaders: ['順位', '名前', '従業員番号', '所属', '資格', '出勤日数', '当日欠勤', '確定シフト日数', '出勤率', '当欠率', '判定',
      'シフト勤務時間', '平均 h／日', '深夜時間', '在籍月数', '当日遅出', '当日遅出率', '当日早退', '当日早退率', '土日祝出勤',
      '土日祝出勤率', '追加応募', '追加応募\n（繁忙日）'],
    sumTitle: '全体サマリー（半年集計）',
    sumPeriod: (p) => `対象期間　${p}　　一人ずつの数字は「スタッフ一覧」、個人のページは「ダッシュボード」で見られます。`,
    sumDeptTitle: '所属別',
    sumDeptHeaders: ['所属', '人数', '出勤日数', '欠勤', '確定シフト', '出勤率', '当欠率'],
    sumWorstHeaders: ['名前', '所属', '確定シフト', '欠勤', '当欠率'],
    sumWorstTitle: (b5, b6) => `当欠率 ワースト10（確定シフト日数 ${b5}日以上の人が対象。基準 ${b6}以上は赤）`,
    howtoPasteTitle: '貼付状況',
    howtoPasteHeaders: ['シート', '月', '貼付行数', '状態'],
  };
  // 全体サマリー tiles (60 §B.2): [id, label, roster total field, format, span, accent]
  const SUM_TILES = [
    ['staff_count', 'スタッフ数', 'total_staff', '0"名"', ['A', 'B']],
    ['eval_count', '評価対象（確定シフトあり）', 'total_evaluated', '0"名"', ['C', 'D']],
    ['attend_rate', '全体出勤率', 'total_att_rate', '0.0%', ['E', 'F']],
    ['absent_rate', '全体当欠率', 'total_abs_rate', '0.0%', ['G', 'I']],
    ['work_days', '総出勤日数', 'total_work_days', '#,##0"日"', ['J', 'J']],
    ['alert_count', '当欠アラート該当', 'total_alert_count', '0"名"', ['K', 'L']],
  ].map(([id, label, src, fmt, span]) => ({
    id, label, src, fmt, span,
    accent: label.indexOf('欠') >= 0 ? '#DC8E8E' : label.indexOf('出勤') >= 0 ? '#7EB2E6' : '#9AA7B8',
  }));
  // スタッフ一覧 columns A..W (60 §C.3): [key, letter, format]
  const STAFF_COLS = [
    ['rank', 'A', '0'], ['name', 'B', 'General'], ['id', 'C', '0'], ['dept', 'D', 'General'], ['qual', 'E', 'General'],
    ['work_days', 'F', '0"日"'], ['absent_days', 'G', '0"日"'], ['shift_days', 'H', '0"日"'], ['attend_rate', 'I', '0.0%'],
    ['absent_rate', 'J', '0.0%'], ['judgement', 'K', 'General'], ['work_hours', 'L', '0.0"h"'], ['avg_hours', 'M', '0.0'],
    ['night_hours', 'N', '0.0"h"'], ['months', 'O', '0"ヶ月"'], ['late_days', 'P', '0"日"'], ['late_rate', 'Q', '0.0%'],
    ['early_days', 'R', '0"日"'], ['early_rate', 'S', '0.0%'], ['busy_days', 'T', '0"日"'], ['busy_rate', 'U', '0.0%'],
    ['extra_apps', 'V', '0"件"'], ['extra_apps_busy', 'W', '0"件"'],
  ];
  const STAFF_MONTH_WORK_COLS = ['X', 'Y', 'Z', 'AA', 'AB', 'AC'];
  const STAFF_MONTH_ABS_COLS = ['AD', 'AE', 'AF', 'AG', 'AH', 'AI'];
  const JUDGE = { none: '－', ref: '参考値', good: '◎ 良好', warn: '△ 注意', bad: '✕ 要改善' };
  const RANK_NONE = '－', RANK_REF = '参考';
  const grade = (x) => (typeof x === 'string'
    ? x.split('01アルバイト').join('アルバイト').split('02サブリーダー').join('サブリーダー').split('03リーダー').join('リーダー')
    : x);

  // ================================================================== per-sheet scan (計算k rows 1..maxrows)
  function scanSheet(sh, limits) {
    const xl = X();
    const rows = sh.rows || [];
    const nrows = Math.min(rows.length, limits.maxrows);
    const byKey = new Map();
    const distinct = [];                       // MATCH(i, T, 0) for i = 1..: {pos (1-based), key}
    const jobCount = new Map(), deptCount = new Map();   // distinct R / BF text → rows (設定 C column)
    let nextT = 1;
    const add = (a, f, v) => {
      if (typeof v === 'number') a[f] += v;
      else if (isErr(v) && !a.err[f]) a.err[f] = v;          // SUMIFS: an error in a matching row propagates
    };
    for (let r = 0; r < nrows; r++) {
      const o = rows[r];
      if (o.T === nextT) { distinct.push({ pos: r + 1, key: o.A }); nextT++; }
      if (typeof o.R === 'string' && o.R !== '') jobCount.set(o.R, (jobCount.get(o.R) || 0) + 1);
      if (typeof o.BF === 'string' && o.BF !== '') deptCount.set(o.BF, (deptCount.get(o.BF) || 0) + 1);
      const A = o.A;
      if (!xl.isKey(A)) continue;
      const kk = xl.keyOf(A);
      let a = byKey.get(kk);
      if (!a) {
        a = { count: 0, H: 0, I: 0, M: 0, N: 0, BD: 0, BE: 0, BZ: 0, CE: 0, BM: 0, BN: 0, err: {} };
        byKey.set(kk, a);
      }
      a.count++;
      add(a, 'H', o.H); add(a, 'I', o.I); add(a, 'M', o.M); add(a, 'N', o.N); add(a, 'BD', o.BD); add(a, 'BE', o.BE);
      if (o.BC === 1) { add(a, 'BZ', o.H); add(a, 'CE', o.BD); }
      if (o.BB === 1 && o.AY === 1) a.BM++;
      if (o.BB === 1 && o.AZ === 1) a.BN++;
    }
    // COUNTA('CSV_k'!$A$2:$A$200000): data rows whose first CSV field is non-empty (20 §7, R-Q15)
    let pasteRows = 0;
    const data = sh.data || [];
    const pn = Math.min(data.length, limits.pasteRows);
    for (let i = 0; i < pn; i++) { const d = data[i]; if (d && !blank(d[0])) pasteRows++; }
    return { byKey, distinct, jobCount, deptCount, pasteRows };
  }

  // ================================================================== build
  function build(WB, opts) {
    const xl = X();
    const cell = xl.cell, val = xl.val;
    const limits = Object.assign({}, DEFAULT_LIMITS, (opts && opts.limits) || WB.limits || {});
    const S = WB.settings || AE.calc.defaultSettings();
    const sheets = WB.sheets || [];
    const scans = [];
    for (let k = 1; k <= NSHEETS; k++) scans.push(sheets[k - 1] ? scanSheet(sheets[k - 1], limits) : scanSheet({}, limits));

    // ---------------- §3 stack (sheet 6 first) and §4 master
    // Stack layout: one block per sheet (CSV_6 first). The block is 400 rows in the workbook (MAXSTAFF), so the
    // stack position H = (6-k)*block + i matches Excel whenever no sheet has more than 400 distinct employees.
    const block = isFinite(limits.maxstaff) ? limits.maxstaff
      : Math.max(400, ...scans.map((sc) => sc.distinct.length));
    const stack = [];
    for (let k = NSHEETS; k >= 1; k--) {
      const sh = sheets[k - 1], sc = scans[k - 1];
      const lim = Math.min(sc.distinct.length, limits.maxstaff);
      const txt = (di, name) => cell(() => xl.text(AE.calc.raw(sh, di, name)));
      for (let i = 0; i < lim; i++) {
        const d = sc.distinct[i];
        stack.push({ k, i: i + 1, r: (NSHEETS - k) * block + i + 1, pos: d.pos, no: d.key,
          name: txt(d.pos - 1, '応募者の名前'), dept: txt(d.pos - 1, '応募者の職種'), qual: txt(d.pos - 1, '応募者の資格') });
      }
    }
    const firstAt = new Map();                 // MATCH(B, $B$2:$B$2401, 0)
    let cum = 0;
    const masterRows = [];
    stack.forEach((e, idx) => {
      const kk = xl.isKey(e.no) ? xl.keyOf(e.no) : null;
      if (kk !== null && !firstAt.has(kk)) firstAt.set(kk, idx);
      e.first = kk === null ? '' : (firstAt.get(kk) === idx ? 1 : 0);
      if (e.first === 1) { cum++; masterRows.push(idx); }
      e.cum = cum;
    });
    const stackDistinct = cum;

    const B3 = S.rateGood, B4 = S.rateWarn, B5 = S.minDays, B6 = S.alertRate;
    const master = [];
    const nMaster = Math.min(masterRows.length, limits.maxstaff);
    for (let n = 1; n <= nMaster; n++) {
      const e = stack[masterRows[n - 1]];
      const kk = xl.keyOf(e.no);
      const s = { n, row: e.r, emp_no: e.no, name: e.name, dept_code: e.dept, qual: e.qual };
      const per = scans.map((sc) => sc.byKey.get(kk));
      const sumOf = (f) => cell(() => {
        let t = 0;
        for (const a of per) { if (!a) continue; if (a.err[f]) throw a.err[f]; t = t + a[f]; }
        return t;
      });
      const monthOf = (f) => per.map((a) => cell(() => { if (!a) return 0; if (a.err[f]) throw a.err[f]; return a[f]; }));
      s.month_work = monthOf('H');
      s.month_abs = monthOf('I');
      s.month_hrs = monthOf('M');
      s.month_has = per.map((a) => (a && a.count > 0 ? 1 : 0));
      s.work_days = sumOf('H');
      s.abs_days = sumOf('I');
      s.confirmed_days = cell(() => val(s.work_days) + val(s.abs_days));
      s.att_rate = cell(() => (val(s.confirmed_days) === 0 ? '' : val(s.work_days) / val(s.confirmed_days)));
      s.abs_rate = cell(() => (val(s.confirmed_days) === 0 ? '' : val(s.abs_days) / val(s.confirmed_days)));
      s.work_hours = sumOf('M');
      s.night_hours = sumOf('N');
      s.avg_hours_per_day = cell(() => (val(s.work_days) === 0 ? '' : val(s.work_hours) / val(s.work_days)));
      s.late_days = per.reduce((t, a) => t + (a ? a.BM : 0), 0);
      s.early_days = per.reduce((t, a) => t + (a ? a.BN : 0), 0);
      s.late_rate = cell(() => (val(s.confirmed_days) === 0 ? '' : s.late_days / val(s.confirmed_days)));
      s.early_rate = cell(() => (val(s.confirmed_days) === 0 ? '' : s.early_days / val(s.confirmed_days)));
      s.busy_work_days = sumOf('BZ');
      s.busy_rate = cell(() => (val(s.work_days) === 0 ? '' : val(s.busy_work_days) / val(s.work_days)));
      s.extra_apps = sumOf('BD');
      s.extra_apps_confirmed = sumOf('BE');
      s.extra_apps_busy = sumOf('CE');
      s.months_with_data = s.month_has.reduce((t, v) => t + v, 0);
      s.att_rate_key = cell(() => (val(s.att_rate) === '' ? '' : xl.round(val(s.att_rate) * 100000)));
      master.push(s);
    }

    // ---------------- §4.2 rank / order keys / worst key
    const rated = master.filter((s) => isNum(s.att_rate_key));
    const keysDesc = rated.map((s) => s.att_rate_key).sort((a, b) => b - a);
    const countGreater = (v) => { let lo = 0, hi = keysDesc.length; while (lo < hi) { const m = (lo + hi) >> 1; if (keysDesc[m] > v) lo = m + 1; else hi = m; } return lo; };
    const eqCount = new Map(), eqSoFar = new Map();
    for (const s of rated) eqCount.set(s.att_rate_key, (eqCount.get(s.att_rate_key) || 0) + 1);
    for (const s of master) {
      if (isErr(s.att_rate_key)) { s.att_rank = s.att_order_desc = s.tie_count = s.att_rate_key; continue; }
      if (s.att_rate_key === '') { s.att_rank = s.att_order_desc = s.tie_count = ''; continue; }
      s.att_rank = countGreater(s.att_rate_key) + 1;                                   // W
      const c = (eqSoFar.get(s.att_rate_key) || 0) + 1;
      eqSoFar.set(s.att_rate_key, c);
      s.att_order_desc = s.att_rank + c - 1;                                           // X (unused, R-Q10)
      s.tie_count = eqCount.get(s.att_rate_key);                                       // AW (unused, R-Q10)
    }
    const minDaysCrit = critNumber(B5);
    const eligible = (s) => isNum(s.att_rate_key) && isNum(s.confirmed_days) &&
      xlCompare(s.confirmed_days, B5) >= 0 && minDaysCrit !== null && s.confirmed_days >= minDaysCrit;
    const worst = master.filter(eligible).sort((a, b) => a.att_rate_key - b.att_rate_key || b.confirmed_days - a.confirmed_days || a.n - b.n);
    for (const s of master) s.worst_key = isErr(s.att_rate_key) ? s.att_rate_key : '';
    worst.forEach((s, i) => { s.worst_key = i + 1; });                                 // Y

    // name order (V, AT/AU/AV) — scope decision 4
    const named = master.filter((s) => typeof s.name === 'string' && s.name !== '')
      .sort((a, b) => nameCompare(a.name, b.name) || a.n - b.n);
    for (const s of master) s.name_key = isErr(s.name) ? s.name : '';
    named.forEach((s, i) => { s.name_key = i + 1; });

    // ---------------- §6 departments
    const dept = [];
    for (let i = 0; i < NDEPT; i++) {
      const d = (S.depts && S.depts[i]) || {};
      const code = blank(d.code) ? '' : d.code;
      if (code === '') {
        dept.push({ i, code: '', label: '', headcount: '', work_days: '', abs_days: '', confirmed_days: '', att_rate: '', abs_rate: '' });
        continue;
      }
      const label = blank(d.label) ? code : d.label;
      const mem = master.filter((s) => critEq(s.dept_code, code));
      const sum = (f) => cell(() => mem.reduce((t, s) => (typeof val(s[f]) === 'number' ? t + s[f] : t), 0));
      const r = { i, code, label, headcount: mem.length, work_days: sum('work_days'), abs_days: sum('abs_days'), confirmed_days: sum('confirmed_days') };
      r.att_rate = cell(() => (val(r.confirmed_days) === 0 ? '' : val(r.work_days) / val(r.confirmed_days)));
      r.abs_rate = cell(() => (val(r.confirmed_days) === 0 ? '' : val(r.abs_days) / val(r.confirmed_days)));
      dept.push(r);
    }
    const deptLabelOf = (code) => {
      if (isErr(code)) return code;
      if (blank(code)) return '';
      for (const r of dept) if (r.code !== '' && matchEq(r.code, code)) return r.label;
      return code;
    };
    for (const s of master) s.dept_label = deptLabelOf(s.dept_code);

    // ---------------- §5 theatre totals
    const SUM = (f) => cell(() => master.reduce((t, s) => { const v = val(s[f]); return typeof v === 'number' ? t + v : t; }, 0));
    const tot = {};
    tot.total_staff = master.length;                                                   // AY2
    tot.total_work_days = SUM('work_days');                                            // AY3
    tot.total_abs_days = SUM('abs_days');                                              // AY4
    tot.total_confirmed_days = SUM('confirmed_days');                                  // AY5
    tot.total_att_rate = cell(() => (val(tot.total_confirmed_days) === 0 ? '' : val(tot.total_work_days) / val(tot.total_confirmed_days)));
    tot.total_abs_rate = cell(() => (val(tot.total_confirmed_days) === 0 ? '' : val(tot.total_abs_days) / val(tot.total_confirmed_days)));
    tot.total_evaluated = master.filter((s) => isNum(s.att_rate)).length;              // AY8 = COUNT(P)
    tot.total_work_hours = SUM('work_hours');                                          // AY9 (unused, R-Q10)
    const alertCrit = critNumber(B6);
    tot.total_alert_count = alertCrit === null ? 0 : master.filter((s) => isNum(s.abs_rate) && s.abs_rate >= alertCrit).length;   // AY10
    tot.total_busy_rate = cell(() => (val(tot.total_work_days) === 0 ? '' : val(SUM('busy_work_days')) / val(tot.total_work_days)));   // AY11

    // ---------------- §7 month labels / paste status / period / warnings
    const sheet_name = [], month_label = [], paste_rows = [], paste_status = [];
    for (let k = 1; k <= NSHEETS; k++) {
      const sh = sheets[k - 1] || {};
      const ch = sh.checks || { AA2: false, AA6: '', AA7: 0, AA8: 0, AA9: 0 };
      sheet_name.push('CSV_' + k);
      month_label.push(cell(() => {
        const m1 = val(ch.AA6);
        if (blank(m1)) return `月${k}（未貼付）`;
        const p = xl.ymd(m1);
        return `${p.y}年${p.m}月`;
      }));
      const az = scans[k - 1].pasteRows;
      paste_rows.push(az);
      paste_status.push(cell(() => {
        if (az === 0) return STATUS.none;
        if (!val(ch.AA2)) return STATUS.noHeader;
        if (az > limits.maxrows) return STATUS.tooMany(limits.maxrows);
        if (val(ch.AA7) > 0) return STATUS.otherMonth(xl.text(ch.AA7));
        if (val(ch.AA8) + val(ch.AA9) > 0) return STATUS.unreadable(xl.text(ch.AA8), xl.text(ch.AA9));
        return STATUS.ok;
      }));
    }
    const pastedIdx = paste_rows.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
    const period_label = pastedIdx.length === 0 ? T_PERIOD_NONE : cell(() =>
      xl.text(month_label[pastedIdx[0]]) + ' 〜 ' + xl.text(month_label[pastedIdx[pastedIdx.length - 1]]));
    let inv = 0;
    for (let k = 2; k <= NSHEETS; k++) {
      const a = sheets[k - 1] && sheets[k - 1].checks ? sheets[k - 1].checks.AA6 : '';
      const b = sheets[k - 2] && sheets[k - 2].checks ? sheets[k - 2].checks.AA6 : '';
      if (!blank(a) && !blank(b) && isNum(a) && isNum(b) && a <= b) inv++;
    }
    const month_order_warning = inv > 0 ? ORDER_WARNING : '';
    const staff_cap_warning = stackDistinct > limits.maxstaff ? capWarning(limits.maxstaff, stackDistinct) : '';
    const has_warning = (paste_status.some((s) => typeof s === 'string' && s.charAt(0) === '※') ||
      month_order_warning !== '' || staff_cap_warning !== '') ? 1 : 0;
    const paste_ok_count = paste_status.filter((s) => s === STATUS.ok).length;

    const R = Object.assign({
      limits, stack, stack_distinct: stackDistinct, master, named,
      name_sorted: named.map((s) => s.name), no_sorted: named.map((s) => s.emp_no), row_sorted: named.map((s) => s.n),
      worst_order: worst.map((s) => s.n),
      dept,
      dept_code: dept.map((d) => d.code), dept_label: dept.map((d) => d.label), dept_headcount: dept.map((d) => d.headcount),
      dept_work_days: dept.map((d) => d.work_days), dept_abs_days: dept.map((d) => d.abs_days),
      dept_confirmed_days: dept.map((d) => d.confirmed_days), dept_att_rate: dept.map((d) => d.att_rate), dept_abs_rate: dept.map((d) => d.abs_rate),
      sheet_name, month_label, paste_rows, paste_status, period_label, month_order_warning, has_warning, staff_cap_warning,
      paste_ok_count,
    }, tot);
    // letter-keyed 名簿 values on every staff object (for DB計算 V(col), spec 30 §1.2)
    for (const s of master) for (const c of MASTER_COLS) s[c] = colValue(s, c);
    R.filter = filterInfo({ roster: R }, '');
    R.settings_counts = settingsCounts(S, scans, master.length);
    R.lists = buildLists(R, S, B3, B4, B5, B6);
    return R;
  }

  // ================================================================== §8 filter (名簿!CG:CJ, StaffNames)
  function filterQueryText(q) {
    if (q === null || q === undefined) return '';
    if (typeof q === 'number') return X().generalText(q);
    q = String(q);
    // D5 is a General cell: typed digits become a number (leading zeros lost, R-Q13)
    if (/^-?\d+(\.\d+)?$/.test(q)) return X().generalText(Number(q));
    return q;
  }
  function filterInfo(WB, query) {
    const R = WB.roster;
    const named = R.named;
    const q = filterQueryText(query);
    const ql = q.toLowerCase();
    const hit = named.map((s) => {
      if (q === '') return 1;
      const nm = s.name.toLowerCase();
      const no = String(X().text(s.emp_no)).toLowerCase();
      return nm.indexOf(ql) >= 0 || no.indexOf(ql) >= 0 ? 1 : 0;            // SEARCH: case-insensitive substring
    });
    let run = 0;
    const seq = hit.map((h) => (h === 1 ? ++run : ''));
    const match_count = run;                                                    // CJ2
    const candidate_count = match_count === 0 ? R.total_staff : match_count;    // CJ3 (R-Q5)
    const hits = [];
    named.forEach((s, i) => { if (hit[i] === 1) hits.push(s); });
    const src = match_count === 0 ? named : hits;
    const len = Math.max(named.length, candidate_count);
    const list = [];
    for (let n = 0; n < len; n++) list.push(n < src.length ? src[n].name : '');  // CI
    const staffnames = list.slice(0, Math.max(1, candidate_count));
    if (!staffnames.length) staffnames.push('');
    const refs = src.map((s) => ({ n: s.name_key, name: s.name, key: s.emp_no, master: s.n }));
    return { query: q, hit, seq, list, match_count, candidate_count, staffnames, refs, fallback: q !== '' && match_count === 0 };
  }
  // AE.api.filter: the dropdown candidates as staff refs {n (name order), name, key (従業員番号), master (名簿 index)}.
  // When nothing matches the whole list comes back (Excel fallback); matchCount = CJ2 tells the two apart.
  function filter(WB, query) {
    if (!WB || !WB.roster) return [];
    const f = filterInfo(WB, query);
    const out = f.refs.slice();
    out.matchCount = f.match_count;
    out.candidateCount = f.candidate_count;
    out.fallback = f.fallback;
    out.query = f.query;
    return out;
  }

  // ================================================================== 設定 C13:C32 / C38:C57 (10 §7.4)
  function settingsCounts(S, scans, staffCount) {
    const count = (code, field) => {
      if (blank(code)) return '';
      if (staffCount === 0) return '';
      let t = 0;
      for (const sc of scans) for (const [v, c] of sc[field]) if (critEq(v, code)) t += c;
      return t;
    };
    const job = [], dept = [];
    for (let i = 0; i < NJOB; i++) job.push(count(S.jobs && S.jobs[i] ? S.jobs[i].code : '', 'jobCount'));
    for (let i = 0; i < NDEPT; i++) dept.push(count(S.depts && S.depts[i] ? S.depts[i].code : '', 'deptCount'));
    return { job, dept, job_text: job.map((v) => format(v, 'rowcount')), dept_text: dept.map((v) => format(v, 'rowcount')) };
  }

  // ================================================================== スタッフ一覧 / 全体サマリー / 使い方 (spec 60)
  function withText(o, fields) {
    for (const [k, f] of fields) o[k + '_text'] = format(o[k], f);
    return o;
  }
  function buildLists(R, S, B3, B4, B5, B6) {
    const xl = X();
    const lt = (a, b) => xlCompare(a, b) < 0, ge = (a, b) => xlCompare(a, b) >= 0;
    // ---- スタッフ一覧 rows (60 §C.3), name order
    const pasted = R.paste_rows.map((n) => n > 0);
    const staff_rows = R.named.map((s) => {
      const P = s.att_rate, O = s.confirmed_days;
      const row = {
        n: s.name_key, master: s.n, key: s.emp_no,
        rank: P === '' ? RANK_NONE : lt(O, B5) ? RANK_REF : s.att_rank,
        name: s.name, id: s.emp_no, dept: s.dept_label, qual: grade(s.qual),
        work_days: s.work_days, absent_days: s.abs_days, shift_days: O, attend_rate: P, absent_rate: s.abs_rate,
        judgement: P === '' ? JUDGE.none : lt(O, B5) ? JUDGE.ref : ge(P, B3) ? JUDGE.good : ge(P, B4) ? JUDGE.warn : JUDGE.bad,
        work_hours: s.work_hours, avg_hours: s.avg_hours_per_day, night_hours: s.night_hours, months: s.months_with_data,
        late_days: s.late_days, late_rate: s.late_rate, early_days: s.early_days, early_rate: s.early_rate,
        busy_days: s.busy_work_days, busy_rate: s.busy_rate, extra_apps: s.extra_apps, extra_apps_busy: s.extra_apps_busy,
        month_work: s.month_work.map((v, k) => (pasted[k] ? v : '')),
        month_absent: s.month_abs.map((v, k) => (pasted[k] ? v : '')),
      };
      withText(row, STAFF_COLS.map(([k, , f]) => [k, f]));
      row.month_work_text = row.month_work.map((v) => format(v, '0'));
      row.month_absent_text = row.month_absent.map((v) => format(v, '0'));
      return row;
    });
    const period = xl.text(R.period_label);
    const staff = {
      title: LIST_TEXT.staffTitle,
      period_text: LIST_TEXT.staffPeriod(period),
      link: LIST_TEXT.staffLink,
      link_target: LIST_TEXT.staffLinkTarget,
      table_title: LIST_TEXT.staffTableTitle,
      headers: LIST_TEXT.staffHeaders.slice(),
      hdr_work: R.month_label.map((l) => '出勤\n' + xl.text(l)),
      hdr_absent: R.month_label.map((l) => '欠勤\n' + xl.text(l)),
      rows: staff_rows,
      print_last_row: Math.max(6, 5 + staff_rows.filter((r) => typeof r.name === 'string' && r.name !== '').length),
    };
    // ---- 全体サマリー (60 §B)
    const tiles = SUM_TILES.map((t) => ({ id: t.id, label: t.label, value: R[t.src], text: format(R[t.src], t.fmt), fmt: t.fmt, span: t.span, accent: t.accent }));
    const dept_rows = R.dept.map((d) => (d.code === ''
      ? { name: '', headcount: '', work_days: '', absent_days: '', shift_days: '', attend_rate: '', absent_rate: '', code: '',
        name_text: '', headcount_text: '', work_days_text: '', absent_days_text: '', shift_days_text: '', attend_rate_text: '', absent_rate_text: '' }
      : withText({ name: d.label, code: d.code, headcount: d.headcount, work_days: d.work_days, absent_days: d.abs_days,
        shift_days: d.confirmed_days, attend_rate: d.att_rate, absent_rate: d.abs_rate },
      [['name', 'General'], ['headcount', '0"名"'], ['work_days', '#,##0"日"'], ['absent_days', '#,##0"日"'],
        ['shift_days', '#,##0"日"'], ['attend_rate', '0.0%'], ['absent_rate', '0.0%']])));
    const byN = new Map(R.master.map((s) => [s.n, s]));
    const worstRow = (n) => {
      const s = R.worst_order.length >= n ? byN.get(R.worst_order[n - 1]) : null;
      if (!s) return { name: '', dept: '', shift_days: '', absent_days: '', absent_rate: '', master: '', key: '',
        name_text: '', dept_text: '', shift_days_text: '', absent_days_text: '', absent_rate_text: '' };
      return withText({ name: s.name, dept: s.dept_label, shift_days: s.confirmed_days, absent_days: s.abs_days,
        absent_rate: s.abs_rate, master: s.n, key: s.emp_no },
      [['name', 'General'], ['dept', 'General'], ['shift_days', '0"日"'], ['absent_days', '0"日"'], ['absent_rate', '0.0%']]);
    };
    const worst_rows = [];
    for (let n = 1; n <= WORST_N; n++) worst_rows.push(worstRow(n));
    const b6text = (() => {                    // TEXT(B6,"0%")
      if (blank(B6)) return '0%';
      if (typeof B6 === 'number') return format(B6, '0%');
      const v = xl.parseNumberText(B6);
      return v === null ? String(B6) : format(v, '0%');
    })();
    const summary = {
      title: LIST_TEXT.sumTitle,
      period_text: LIST_TEXT.sumPeriod(period),
      tiles,
      dept_title: LIST_TEXT.sumDeptTitle,
      dept_headers: LIST_TEXT.sumDeptHeaders.slice(),
      dept_rows,
      worst_title: LIST_TEXT.sumWorstTitle(xl.text(B5), b6text),
      worst_headers: LIST_TEXT.sumWorstHeaders.slice(),
      worst_rows,
    };
    // ---- 使い方 貼付状況 (60 §D.2)
    const howto = {
      paste_title: LIST_TEXT.howtoPasteTitle,
      paste_headers: LIST_TEXT.howtoPasteHeaders.slice(),
      paste_rows: R.sheet_name.map((nm, k) => ({ k: k + 1, sheet: nm, month: R.month_label[k], rows: R.paste_rows[k],
        rows_text: format(R.paste_rows[k], '#,##0'), status: R.paste_status[k] })),
      warning: excelTrim(R.month_order_warning + ' ' + R.staff_cap_warning),
    };
    return { staff, summary, howto };
  }

  // ================================================================== lookups for the view layer
  function findByName(WB, text) {                   // MATCH(B7, 名簿!AT, 0) → the first in name order
    if (!WB || !WB.roster || blank(text)) return null;
    for (const s of WB.roster.named) if (matchEq(s.name, text)) return s;
    return null;
  }
  function findByKey(WB, key) {                     // MATCH(AC3, 名簿!I, 0)
    if (!WB || !WB.roster || blank(key)) return null;
    for (const s of WB.roster.master) if (matchEq(s.emp_no, key)) return s;
    return null;
  }
  function deptLabel(WB, code) {
    if (isErr(code)) return code;
    if (blank(code)) return '';
    for (const r of WB.roster.dept) if (r.code !== '' && matchEq(r.code, code)) return r.label;
    return code;
  }

  // ================================================================== attach (flat spec identifiers on WB)
  const TOTAL_FMT = { total_staff: '0', total_work_days: '0', total_abs_days: '0', total_confirmed_days: '0',
    total_att_rate: '0.0%', total_abs_rate: '0.0%', total_evaluated: '0', total_work_hours: '0.0', total_alert_count: '0',
    total_busy_rate: '0.0%' };
  function attach(WB, opts) {
    const R = build(WB, opts);
    WB.roster = R;
    const L = R.lists;
    const a = (id, v) => { WB[id] = v; };
    for (const f of ['stack', 'master', 'named', 'name_sorted', 'no_sorted', 'row_sorted', 'worst_order', 'dept',
      'dept_code', 'dept_label', 'dept_headcount', 'dept_work_days', 'dept_abs_days', 'dept_confirmed_days', 'dept_att_rate',
      'dept_abs_rate', 'sheet_name', 'month_label', 'paste_rows', 'paste_status', 'period_label', 'month_order_warning',
      'has_warning', 'staff_cap_warning', 'paste_ok_count']) a('roster_' + f, R[f]);
    for (const f of Object.keys(TOTAL_FMT)) { a('roster_' + f, R[f]); a('roster_' + f + '_text', format(R[f], TOTAL_FMT[f])); }
    a('roster_dept_att_rate_text', R.dept_att_rate.map((v) => format(v, '0.0%')));
    a('roster_dept_abs_rate_text', R.dept_abs_rate.map((v) => format(v, '0.0%')));
    a('roster_paste_rows_text', R.paste_rows.map((v) => format(v, '#,##0')));
    a('roster_filter_hit', R.filter.hit); a('roster_filter_seq', R.filter.seq); a('roster_filter_list', R.filter.list);
    a('roster_filter_match_count', R.filter.match_count); a('roster_filter_candidate_count', R.filter.candidate_count);
    a('roster_staffnames', R.filter.staffnames);
    // スタッフ一覧
    a('lists_staff_title', L.staff.title); a('lists_staff_period_text', L.staff.period_text);
    a('lists_staff_link', L.staff.link); a('lists_staff_table_title', L.staff.table_title);
    a('lists_staff_headers', L.staff.headers); a('lists_staff_hdr_work', L.staff.hdr_work); a('lists_staff_hdr_absent', L.staff.hdr_absent);
    a('lists_staff_rows', L.staff.rows); a('lists_staff_order', L.staff.rows.map((r) => r.master));
    a('lists_staff_print_last_row', L.staff.print_last_row);
    // 全体サマリー
    a('lists_sum_title', L.summary.title); a('lists_sum_period_text', L.summary.period_text);
    for (const t of L.summary.tiles) { a('lists_sum_tile_' + t.id, t.value); a('lists_sum_tile_' + t.id + '_text', t.text); a('lists_sum_tile_' + t.id + '_label', t.label); }
    a('lists_sum_tiles', L.summary.tiles);
    a('lists_sum_dept_title', L.summary.dept_title); a('lists_sum_dept_headers', L.summary.dept_headers);
    a('lists_sum_dept_rows', L.summary.dept_rows);
    a('lists_sum_worst_title', L.summary.worst_title); a('lists_sum_worst_headers', L.summary.worst_headers);
    a('lists_sum_worst_rows', L.summary.worst_rows);
    // 使い方 (paste-status table)
    a('lists_howto_paste_rows', L.howto.paste_rows); a('lists_howto_warning', L.howto.warning);
    // 設定 C column
    const sc = R.settings_counts;
    if (WB.set) { WB.set.job_rowcount = sc.job; WB.set.dept_rowcount = sc.dept; WB.set.job_rowcount_text = sc.job_text; WB.set.dept_rowcount_text = sc.dept_text; }
    a('ingest_set_job_rowcount', sc.job); a('ingest_set_dept_rowcount', sc.dept);
    a('ingest_set_job_rowcount_text', sc.job_text); a('ingest_set_dept_rowcount_text', sc.dept_text);
    return R;
  }

  AE.roster = {
    NSHEETS, NDEPT, NJOB, WORST_N, DEFAULT_LIMITS, EXCEL_LIMITS,
    SHEET_TEXT, LIST_TEXT, STATUS, ORDER_WARNING, T_PERIOD_NONE, JUDGE, RANK_NONE, RANK_REF,
    MONTH_WORK, MONTH_ABS, MONTH_HRS, MONTH_HAS, COL_FIELD, MASTER_COLS, STAFF_COLS, STAFF_MONTH_WORK_COLS, STAFF_MONTH_ABS_COLS,
    SUM_TILES,
    build, attach, filter, filterInfo, findByName, findByKey, deptLabel, colValue, format,
    _h: { matchEq, critEq, xlCompare, critNumber, excelTrim, nameCompare, codePointCompare, filterQueryText, grade },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
