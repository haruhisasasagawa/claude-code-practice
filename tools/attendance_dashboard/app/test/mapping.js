'use strict';
/* Golden cell ↔ engine field mapping used by test/parity.js.
 *
 * SHEETS[sheetName] is an array of SECTIONS. Each layer appends its sections to the sheet it owns
 * (the empty arrays below are the placeholders for the later layers). A section is either
 *
 *   cell mode  {id, owner, cases?, owns(addr, ctx), cells(ctx), skip?(addr, ctx)}
 *     owns(addr)  → true for every golden cell of this sheet the section is responsible for
 *     cells(ctx)  → Map addr → engine value for the section's domain (blank values may be omitted)
 *     The harness compares the union of the owned golden cells and the engine cells:
 *     '' / null / missing are the same blank; numbers within 1e-9 relative (absolute floor 1e-9);
 *     anything else must be identical (=== after XLError → its code string).
 *
 *   custom mode {id, owner, cases?, compare(ctx)} → {compared, mismatches:[{addr, expected, actual, note?}], info?:[string]}
 *     (e.g. name-ordered lists: compare order-independent content, report order differences in `info`).
 *
 * cases(cfg) → false skips the section for that case (default: every case). The harness also applies the case
 * scope (cfg.sheets, cfg.numbersOnly — see parity.js CASES).
 *
 * ctx = {caseName, cfg, golden, g (this sheet's golden cells), WB, AE, select (golden ダッシュボード!B7),
 *        sel (golden DB計算!AC3), memo (per-case cache object), view() (lazy AE.api.view(WB, select))}
 *
 * EXCEPTIONS: documented, accepted mismatches. Each entry {case?: RegExp, sheet: string, addr: RegExp, reason}
 * MUST cite the spec quirk or the CONTRACT scope decision that justifies it.
 */

// ---------------------------------------------------------------- helpers
function parseAddr(addr) {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  return m ? { col: m[1], row: +m[2] } : { col: '', row: 0 };
}
function colIndex(col) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function colLetter(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

const MAXROWS = 6000;                       // ingest_const_maxrows: Excel evaluates calc rows 2..6001
const SHEET_ORDER = ['使い方', 'ダッシュボード', 'DB計算', 'スタッフ一覧', '全体サマリー', '設定', '祝日・繁忙日', '名簿',
  '計算1', '計算2', '計算3', '計算4', '計算5', '計算6'];

// ================================================================ layer 1 — 計算1..計算6 (spec 10 §3–§5)
function calcSections(k) {
  const main = {
    id: `calc${k}`,
    owner: 'layer1 ingest/calc',
    // every per-row column we own (A..Y except W, AV..BL), the AB:AU name/mapping rows, and Z/AA except AA11/AA12
    owns(addr, ctx) {
      const { col, row } = parseAddr(addr);
      const AE = ctx.AE;
      if (col === 'W') return false;                                       // selection hook (below)
      if (AE.calc.ROW_COLS.includes(col)) return row >= 1;
      if (col === 'Z') return true;
      if (col === 'AA') return row !== 11 && row !== 12;                    // selection hook (below)
      const ci = colIndex(col);
      if (ci >= colIndex('AB') && ci <= colIndex('AU')) return row <= 2;
      return false;
    },
    // ns_job was produced by an older generator: column BL is not comparable (CONTRACT golden-case table)
    skip(addr, ctx) { return !!ctx.cfg.older && parseAddr(addr).col === 'BL'; },
    cells(ctx) {
      const AE = ctx.AE, sh = ctx.WB.sheets[k - 1], m = new Map();
      for (let i = 0; i < sh.rows.length; i++) {
        const r = sh.rows[i], rowNo = i + 2;
        for (const c of AE.calc.ROW_COLS) m.set(c + rowNo, r[c]);
      }
      // Rows below the data are blank except T, which carries the running count (10 §4.6, T is not blank-guarded).
      const lastRow = Math.max((ctx.cfg.maxrows || MAXROWS) + 1, sh.rows.length + 1);
      for (let rowNo = sh.rows.length + 2; rowNo <= lastRow; rowNo++) m.set('T' + rowNo, sh.staffCount);
      for (const [col, name] of AE.calc.NEEDED) { m.set(col + '1', name); m.set(col + '2', sh.map[col]); }
      for (const [a, t] of Object.entries(AE.calc.SHEET_TEXT)) m.set(a, t);
      for (const a of ['AA2', 'AA6', 'AA7', 'AA8', 'AA9']) m.set(a, sh.checks[a]);
      return m;
    },
  };
  // Hook check: W / AA11 / AA12 depend on the dashboard selection. Here the selection input is taken from the
  // golden (DB計算!AC3), so this checks AE.calc.selectionColumns() independently of the view layer.
  const hook = {
    id: `calc${k}-selection-hook`,
    owner: 'layer1 hook (input = golden DB計算!AC3)',
    owns(addr) {
      const { col, row } = parseAddr(addr);
      return (col === 'W' && row >= 1) || (col === 'AA' && (row === 11 || row === 12));
    },
    cells(ctx) {
      const memo = ctx.memo;
      if (!memo.selCols) memo.selCols = ctx.AE.calc.selectionColumns(ctx.WB, ctx.sel);
      const s = memo.selCols[k - 1], m = new Map();
      s.W.forEach((v, i) => m.set('W' + (i + 2), v));
      m.set('AA11', s.AA11);
      m.set('AA12', s.AA12);
      return m;
    },
  };
  return [main, hook];
}

// ================================================================ layer 1 — 祝日・繁忙日 (spec 10 §6)
const holidaySections = [{
  id: 'holidays',
  owner: 'layer1 ingest/holidays',
  owns() { return true; },
  cells(ctx) {
    const AE = ctx.AE, T = AE.holidays.TEXT, hol = ctx.WB.hol, m = new Map();
    m.set('A1', T.title);
    m.set('A2', T.howto);
    T.tips.forEach((t, i) => m.set('A' + (3 + i), t));
    m.set('A11', T.status);
    m.set('A12', hol.msg_count);
    m.set('A13', hol.msg_format);
    m.set('A14', hol.msg_range);
    m.set('A15', hol.msg_coverage);
    m.set('A16', T.headerDate);
    m.set('B16', T.headerName);
    hol.rows.forEach((e, i) => { m.set('A' + (AE.holidays.HOL_R0 + i), e.date); m.set('B' + (AE.holidays.HOL_R0 + i), e.name); });
    return m;
  },
}];

// ================================================================ layer 1 — 設定 (spec 10 §7; the C-column row counts belong to the roster layer)
const settingsSections = [{
  id: 'settings',
  owner: 'layer1 ingest/settings',
  owns(addr, ctx) {
    const { col, row } = parseAddr(addr);
    const L = ctx.AE.calc.SETTINGS_TEXT.layout;
    if (col === 'C' && row >= L.jobRow0 && row < L.jobRow0 + L.njob) return false;      // roster: ingest_set_job_rowcount
    if (col === 'C' && row >= L.deptRow0 && row < L.deptRow0 + L.ndept) return false;   // roster: ingest_set_dept_rowcount
    return true;
  },
  cells(ctx) {
    const ST = ctx.AE.calc.SETTINGS_TEXT, S = ctx.WB.settings, L = ST.layout, m = new Map();
    for (const s of ST.scalars) { m.set('A' + s.row, s.label); m.set('B' + s.row, S[s.key]); m.set('C' + s.row, s.note); }
    m.set('A9', ctx.WB.set.order_warning);
    m.set('A11', ST.jobTitle); m.set('C11', ST.jobNote);
    ['A', 'B', 'C'].forEach((c, i) => m.set(c + '12', ST.jobHeaders[i]));
    for (let i = 0; i < L.njob; i++) {
      const j = S.jobs[i] || {};
      m.set('A' + (L.jobRow0 + i), j.code); m.set('B' + (L.jobRow0 + i), j.label);
    }
    m.set('A' + L.jobOtherRow, ST.jobOtherCode); m.set('B' + L.jobOtherRow, S.jobOtherLabel);
    m.set('A' + (L.deptRow0 - 2), ST.deptTitle); m.set('C' + (L.deptRow0 - 2), ST.deptNote);
    ['A', 'B', 'C'].forEach((c, i) => m.set(c + (L.deptRow0 - 1), ST.deptHeaders[i]));
    for (let i = 0; i < L.ndept; i++) {
      const d = S.depts[i] || {};
      m.set('A' + (L.deptRow0 + i), d.code); m.set('B' + (L.deptRow0 + i), d.label);
    }
    return m;
  },
}];

// ================================================================ layer 2 — 名簿 / スタッフ一覧 / 全体サマリー / 使い方 / 設定 C (specs 20, 60, 10 §7.4)
// Helpers for the custom (order-independent) sections. Same comparison rule as parity.js.
const isBlankV = (v) => v === undefined || v === null || v === '';
function normV(v) { return v && typeof v === 'object' && typeof v.code === 'string' ? v.code : v; }
function sameV(e, a) {
  e = normV(e); a = normV(a);
  if (isBlankV(e) && isBlankV(a)) return true;
  if (typeof e === 'number' && typeof a === 'number') return Math.abs(e - a) <= 1e-9 * Math.max(1, Math.abs(e), Math.abs(a));
  return e === a;
}
// employee-number key: MATCH equality (numbers by value, text case-insensitive)
const empKey = (v) => (typeof v === 'number' ? 'n:' + v : 's:' + String(v).toLowerCase());
function cmpCollector(ctx) {
  const res = { compared: 0, mismatches: [], info: [] };
  const numbersOnly = !!ctx.cfg.numbersOnly;
  res.check = (addr, e, a, note) => {
    e = normV(e); a = normV(a);
    if (numbersOnly && typeof e !== 'number' && typeof a !== 'number') return;
    res.compared++;
    if (!sameV(e, a)) res.mismatches.push({ addr, expected: e, actual: a, note });
  };
  return res;
}
const rosterOf = (ctx) => ctx.WB.roster;
const XL_STACK_PER_SHEET = 400, XL_MAXSTAFF = 400;          // the workbook layout (parity data is below these caps)
const NAME_ORDER_COLS = ['V', 'AT', 'AU', 'AV', 'CG', 'CH', 'CI'];

// ---- 名簿!A:G stack (20 §3). Excel row of stack entry (k, i) = 2 + (6-k)*400 + (i-1).
const rosterStackSection = {
  id: 'roster-stack',
  owner: 'layer2 roster',
  owns(addr) { const { col } = parseAddr(addr); return col.length === 1 && col >= 'A' && col <= 'G'; },
  cells(ctx) {
    const R = rosterOf(ctx), H = ctx.AE.roster.SHEET_TEXT.headers, m = new Map();
    for (const c of 'ABCDEFG') m.set(c + '1', H[c]);
    const at = new Map();
    for (const e of R.stack) if (e.i <= XL_STACK_PER_SHEET) at.set(2 + (6 - e.k) * XL_STACK_PER_SHEET + (e.i - 1), e);
    let cum = 0;
    for (let r = 2; r <= 1 + 6 * XL_STACK_PER_SHEET; r++) {
      const e = at.get(r);
      if (e) {
        m.set('A' + r, e.pos); m.set('B' + r, e.no); m.set('C' + r, e.name); m.set('D' + r, e.dept); m.set('E' + r, e.qual);
        m.set('F' + r, e.first);
        cum = e.cum;
      }
      m.set('G' + r, cum);                                   // G runs through every stack row (N(G above) + F)
    }
    return m;
  },
};
// ---- 名簿 master rows 2..401 (20 §4): every column except the name-ordered ones (below). Row 1 = all headers.
const rosterMasterSection = {
  id: 'roster-master',
  owner: 'layer2 roster',
  owns(addr, ctx) {
    const { col, row } = parseAddr(addr);
    const AE = ctx.AE;
    if (row === 1) return col in AE.roster.SHEET_TEXT.headers && !(col.length === 1 && col <= 'G');
    if (row > XL_MAXSTAFF + 1) return false;
    return AE.roster.MASTER_COLS.includes(col) && col !== 'V';
  },
  cells(ctx) {
    const R = rosterOf(ctx), AE = ctx.AE, H = AE.roster.SHEET_TEXT.headers, m = new Map();
    for (const [c, t] of Object.entries(H)) if (!(c.length === 1 && c <= 'G')) m.set(c + '1', t);
    for (const s of R.master) {
      if (s.n > XL_MAXSTAFF) break;
      for (const c of AE.roster.MASTER_COLS) if (c !== 'V') m.set(c + (s.n + 1), AE.roster.colValue(s, c));
    }
    return m;
  },
};
// ---- 名簿 name-ordered columns V, AT/AU/AV, CG/CH/CI (20 §4.2, §8). CONTRACT scope decision 4: the name order
// (Intl.Collator('ja') + code point) may differ from LibreOffice's, so these are compared order-independently:
// per employee (AT name, AV master index, CG hit flag, V present or not), CH / CI as multisets; the number of rows
// whose position differs is reported as info, not as a failure.
const rosterNameOrderSection = {
  id: 'roster-name-order',
  owner: 'layer2 roster (order-independent, scope decision 4)',
  owns(addr) {
    const { col, row } = parseAddr(addr);
    return NAME_ORDER_COLS.includes(col) && row >= 2 && row <= XL_MAXSTAFF + 1;
  },
  compare(ctx) {
    const res = cmpCollector(ctx), g = ctx.g, R = rosterOf(ctx), F = R.filter;
    const gRows = [];
    for (let r = 2; r <= XL_MAXSTAFF + 1; r++) {
      if (isBlankV(g['AU' + r]) && isBlankV(g['AT' + r])) continue;
      gRows.push({ r, AT: g['AT' + r], AU: g['AU' + r], AV: g['AV' + r], CG: g['CG' + r] });
    }
    const eRows = R.named.map((s, i) => ({ pos: i + 1, AT: s.name, AU: s.emp_no, AV: s.n, CG: F.hit[i] }));
    res.check('AT(count)', gRows.length, eRows.length, 'number of named staff (AT/AU/AV rows)');
    const eBy = new Map(eRows.map((x) => [empKey(x.AU), x]));
    const gBy = new Map();
    let moved = 0;
    for (const x of gRows) {
      gBy.set(empKey(x.AU), x);
      const y = eBy.get(empKey(x.AU));
      if (!y) { res.check('AU' + x.r, x.AU, undefined, 'employee missing from the engine name order'); continue; }
      res.check('AU' + x.r, x.AU, y.AU);
      res.check('AT' + x.r, x.AT, y.AT, 'name of this employee');
      res.check('AV' + x.r, x.AV, y.AV, 'master index of this employee');
      res.check('CG' + x.r, x.CG, y.CG, 'filter hit of this employee');
      if (y.pos !== x.r - 1) moved++;
    }
    for (const y of eRows) if (!gBy.has(empKey(y.AU))) res.check('AU?', undefined, y.AU, 'engine employee not in the golden name order');
    // V on the master rows: present for the same employees; values are a permutation of 1..count
    let vMoved = 0;
    for (const s of R.master) {
      if (s.n > XL_MAXSTAFF) break;
      const gv = g['V' + (s.n + 1)];
      res.check('V' + (s.n + 1) + '(present)', isBlankV(gv) ? 0 : 1, s.name_key === '' ? 0 : 1, 'V blank vs non-blank');
      if (!isBlankV(gv) && gv !== s.name_key) vMoved++;
    }
    // multiset comparison: one compared item; a mismatch lists only the values missing / extra on the engine side
    const multiset = (id, gv, ev) => {
      const count = new Map(), tag = (v) => (typeof v === 'number' ? 'n:' : 's:') + String(normV(v));
      for (const v of gv) if (!isBlankV(v)) count.set(tag(v), (count.get(tag(v)) || 0) + 1);
      for (const v of ev) if (!isBlankV(v)) count.set(tag(v), (count.get(tag(v)) || 0) - 1);
      const missing = [], extra = [];
      for (const [t, c] of count) { for (let i = 0; i < c; i++) missing.push(t.slice(2)); for (let i = 0; i < -c; i++) extra.push(t.slice(2)); }
      res.compared++;
      if (missing.length || extra.length) {
        res.mismatches.push({ addr: id, expected: 'missing [' + missing.slice(0, 5).join(', ') + ']', actual: 'extra [' + extra.slice(0, 5).join(', ') + ']',
          note: `multiset: ${missing.length} missing, ${extra.length} extra` });
      }
    };
    const gCol = (c) => { const out = []; for (let r = 2; r <= XL_MAXSTAFF + 1; r++) out.push(g[c + r]); return out; };
    if (!ctx.cfg.numbersOnly) multiset('CI(multiset)', gCol('CI'), F.list);
    multiset('V(multiset)', gCol('V'), R.master.map((s) => s.name_key));
    multiset('CH(multiset)', gCol('CH'), F.seq);
    res.info.push(`name order: ${moved} of ${gRows.length} rows at a different position than the golden, V differs on ${vMoved} ` +
      'master rows (scope decision 4, not a failure)');
    return res;
  },
};
// ---- 名簿 theatre totals, month labels / paste status / period / warnings, departments, filter counts (20 §5–§8)
const rosterTotalsSection = {
  id: 'roster-totals',
  owner: 'layer2 roster',
  owns(addr) {
    const { col, row } = parseAddr(addr), ci = colIndex(col);
    if (ci >= colIndex('AX') && ci <= colIndex('BA')) return row <= 32;
    if (ci >= colIndex('BP') && ci <= colIndex('BW')) return row >= 12 && row <= 33;
    return col === 'CJ' && row <= 3;
  },
  cells(ctx) {
    const R = rosterOf(ctx), T = ctx.AE.roster.SHEET_TEXT, m = new Map();
    m.set('AX1', T.AX1);
    const tot = { 2: 'total_staff', 3: 'total_work_days', 4: 'total_abs_days', 5: 'total_confirmed_days', 6: 'total_att_rate',
      7: 'total_abs_rate', 8: 'total_evaluated', 9: 'total_work_hours', 10: 'total_alert_count', 11: 'total_busy_rate' };
    for (const [r, f] of Object.entries(tot)) { m.set('AX' + r, T.totalLabels[r]); m.set('AY' + r, R[f]); }
    m.set('AX20', T.AX20);
    ['AX', 'AY', 'AZ', 'BA'].forEach((c, j) => m.set(c + '21', T.pasteHeaders[j]));
    for (let k = 1; k <= 6; k++) {
      const r = 21 + k;
      m.set('AX' + r, R.sheet_name[k - 1]); m.set('AY' + r, R.month_label[k - 1]);
      m.set('AZ' + r, R.paste_rows[k - 1]); m.set('BA' + r, R.paste_status[k - 1]);
    }
    m.set('AX29', T.AX29); m.set('AY29', R.period_label);
    m.set('AX30', T.AX30); m.set('AY30', R.month_order_warning);
    m.set('AX31', T.AX31); m.set('AY31', R.has_warning);
    m.set('AX32', T.AX32); m.set('AY32', R.staff_cap_warning);
    m.set('BP12', T.BP12);
    const DC = ['BP', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BV', 'BW'];
    DC.forEach((c, j) => m.set(c + '13', T.deptHeaders[j]));
    const DF = ['code', 'label', 'headcount', 'work_days', 'abs_days', 'confirmed_days', 'att_rate', 'abs_rate'];
    R.dept.forEach((d, i) => DC.forEach((c, j) => m.set(c + (14 + i), d[DF[j]])));
    m.set('CJ1', T.CJ1); m.set('CJ2', R.filter.match_count); m.set('CJ3', R.filter.candidate_count);
    return m;
  },
};
const rosterSections = [rosterStackSection, rosterMasterSection, rosterNameOrderSection, rosterTotalsSection];

// ---- スタッフ一覧 (60 §C). Rows 6..405 are name-ordered: matched by 従業員番号 (column C), order reported as info.
const STAFF_LIST_ROW0 = 6;
function staffListColumns(AE) {
  const cols = AE.roster.STAFF_COLS.map(([key, letter]) => ({ letter, get: (r) => r[key] }));
  AE.roster.STAFF_MONTH_WORK_COLS.forEach((letter, k) => cols.push({ letter, get: (r) => r.month_work[k] }));
  AE.roster.STAFF_MONTH_ABS_COLS.forEach((letter, k) => cols.push({ letter, get: (r) => r.month_absent[k] }));
  return cols;
}
const staffListFixedSection = {
  id: 'staff-list-fixed',
  owner: 'layer2 lists',
  owns(addr) { return parseAddr(addr).row < STAFF_LIST_ROW0; },
  cells(ctx) {
    const W = ctx.WB, AE = ctx.AE, m = new Map();
    m.set('A1', W.lists_staff_title); m.set('A2', W.lists_staff_period_text);
    m.set('A3', W.lists_staff_link); m.set('A4', W.lists_staff_table_title);
    W.lists_staff_headers.forEach((h, j) => m.set(colLetter(1 + j) + '5', h));
    AE.roster.STAFF_MONTH_WORK_COLS.forEach((c, k) => m.set(c + '5', W.lists_staff_hdr_work[k]));
    AE.roster.STAFF_MONTH_ABS_COLS.forEach((c, k) => m.set(c + '5', W.lists_staff_hdr_absent[k]));
    return m;
  },
};
const staffListRowsSection = {
  id: 'staff-list-rows',
  owner: 'layer2 lists (matched by 従業員番号, scope decision 4)',
  owns(addr) { const { row } = parseAddr(addr); return row >= STAFF_LIST_ROW0 && row < STAFF_LIST_ROW0 + XL_MAXSTAFF; },
  compare(ctx) {
    const res = cmpCollector(ctx), g = ctx.g, rows = ctx.WB.lists_staff_rows, cols = staffListColumns(ctx.AE);
    const gRows = [];
    for (let r = STAFF_LIST_ROW0; r < STAFF_LIST_ROW0 + XL_MAXSTAFF; r++) {
      if (cols.every((c) => isBlankV(g[c.letter + r]))) continue;
      gRows.push(r);
    }
    res.check('C(count)', gRows.length, rows.length, 'number of staff rows');
    const eBy = new Map(rows.map((x, i) => [empKey(x.id), { x, pos: i }]));
    const seen = new Set();
    let moved = 0;
    for (const r of gRows) {
      const key = empKey(g['C' + r]);
      const hit = eBy.get(key);
      if (!hit) { res.check('C' + r, g['C' + r], undefined, 'employee missing from the engine list'); continue; }
      seen.add(key);
      if (hit.pos !== r - STAFF_LIST_ROW0) moved++;
      for (const c of cols) res.check(c.letter + r, g[c.letter + r], c.get(hit.x), 'employee ' + g['C' + r]);
    }
    for (const x of rows) if (!seen.has(empKey(x.id))) res.check('C?', undefined, x.id, 'engine row not in the golden list');
    res.info.push(`row order: ${moved} of ${gRows.length} rows at a different position than the golden (scope decision 4, not a failure)`);
    return res;
  },
};
const staffListSections = [staffListFixedSection, staffListRowsSection];

// ---- 全体サマリー (60 §B): every cell.
const summarySections = [{
  id: 'summary',
  owner: 'layer2 lists',
  owns() { return true; },
  cells(ctx) {
    const W = ctx.WB, m = new Map();
    m.set('A1', W.lists_sum_title); m.set('A2', W.lists_sum_period_text);
    for (const t of W.lists_sum_tiles) { m.set(t.span[0] + '4', t.label); m.set(t.span[0] + '5', t.value); }
    m.set('A7', W.lists_sum_dept_title);
    W.lists_sum_dept_headers.forEach((h, j) => m.set(colLetter(1 + j) + '8', h));
    const DK = ['name', 'headcount', 'work_days', 'absent_days', 'shift_days', 'attend_rate', 'absent_rate'];
    W.lists_sum_dept_rows.forEach((d, i) => DK.forEach((k, j) => m.set(colLetter(1 + j) + (9 + i), d[k])));
    m.set('J7', W.lists_sum_worst_title);
    W.lists_sum_worst_headers.forEach((h, j) => m.set(colLetter(10 + j) + '8', h));
    const WK = ['name', 'dept', 'shift_days', 'absent_days', 'absent_rate'];
    W.lists_sum_worst_rows.forEach((w, n) => WK.forEach((k, j) => m.set(colLetter(10 + j) + (9 + n), w[k])));
    return m;
  },
}];

// ---- 使い方 貼付状況 table B14:E22 (60 §D.2). The static help text around it is not computed (not owned here).
const howtoSections = [{
  id: 'howto-paste-status',
  owner: 'layer2 lists',
  owns(addr) {
    const { col, row } = parseAddr(addr);
    return row >= 14 && row <= 22 && ['B', 'C', 'D', 'E'].includes(col);
  },
  cells(ctx) {
    const W = ctx.WB, R = W.roster, m = new Map();
    m.set('B14', R.lists.howto.paste_title);
    ['B', 'C', 'D', 'E'].forEach((c, j) => m.set(c + '15', R.lists.howto.paste_headers[j]));
    W.lists_howto_paste_rows.forEach((p, i) => {
      const r = 16 + i;
      m.set('B' + r, p.sheet); m.set('C' + r, p.month); m.set('D' + r, p.rows); m.set('E' + r, p.status);
    });
    m.set('B22', W.lists_howto_warning);
    return m;
  },
}];

// ---- 設定 C13:C32 / C38:C57 row counts (10 §7.4)
const settingsCountSection = {
  id: 'settings-rowcounts',
  owner: 'layer2 roster',
  owns(addr, ctx) {
    const { col, row } = parseAddr(addr);
    const L = ctx.AE.calc.SETTINGS_TEXT.layout;
    return col === 'C' && ((row >= L.jobRow0 && row < L.jobRow0 + L.njob) || (row >= L.deptRow0 && row < L.deptRow0 + L.ndept));
  },
  cells(ctx) {
    const W = ctx.WB, L = ctx.AE.calc.SETTINGS_TEXT.layout, m = new Map();
    W.ingest_set_job_rowcount.forEach((v, i) => m.set('C' + (L.jobRow0 + i), v));
    W.ingest_set_dept_rowcount.forEach((v, i) => m.set('C' + (L.deptRow0 + i), v));
    return m;
  },
};

// ================================================================ layer 3 — DB計算 (spec 30) and ダッシュボード (specs 40, 50)
// The selection input is the golden ダッシュボード!B7 text (ctx.view() = AE.api.view(WB, B7)), so AC3 / AC4 and everything
// after them are checked through the view layer's B7 semantics.
const LIST_ROW0 = 60, JB0 = 72, BUSY_R0 = 100, HB0 = 306;
function dbcalcCells(AE, V) {
  const m = new Map(), set = (a, v) => m.set(a, v);
  for (const [a, t] of Object.entries(AE.view.TEXT.dbcalc)) set(a, t);
  set('AC3', V.dbcalc_sel_emp_no); set('AC4', V.dbcalc_sel_master_idx); set('AC5', V.dbcalc_sel_dept_code);
  set('AC6', V.dbcalc_sel_att_rate); set('AC7', V.dbcalc_thr_good); set('AC8', V.dbcalc_thr_warn); set('AC9', V.dbcalc_min_days);
  set('AC10', V.dbcalc_sel_confirmed_days); set('AC12', V.dbcalc_work_days); set('AC13', V.dbcalc_abs_days);
  set('AC23', V.dbcalc_job_top_label); set('AD23', V.dbcalc_job_top_share);
  V.dbcalc_wd_label.forEach((l, i) => { set('AB' + (25 + i), l); set('AC' + (25 + i), V.dbcalc_wd_days[i]); });
  set('AC34', V.dbcalc_cmp_self_rate); set('AC35', V.dbcalc_cmp_all_rate); set('AB36', V.dbcalc_cmp_dept_label);
  set('AC36', V.dbcalc_cmp_dept_rate);
  AE.calc.REST_CATS.forEach(([code], i) => set('AC' + (39 + i), V.dbcalc_rest_days[code]));
  set('AC43', V.dbcalc_late_days); set('AC44', V.dbcalc_early_days);
  for (let k = 0; k < 6; k++) {
    set('AB' + (46 + k), V.dbcalc_month_label[k]); set('AC' + (46 + k), V.dbcalc_month_work[k]); set('AD' + (46 + k), V.dbcalc_month_abs[k]);
  }
  set('AC52', V.dbcalc_late_rate); set('AC53', V.dbcalc_early_rate); set('AC54', V.dbcalc_list_count);
  set('AC56', V.dbcalc_alert_thr); set('AC57', V.dbcalc_sel_abs_rate); set('AC58', V.dbcalc_busy_not_worked);
  set('AC60', V.dbcalc_long_run_count);
  set('AC63', V.dbcalc_extra_apps); set('AC64', V.dbcalc_extra_apps_confirmed); set('AC65', V.dbcalc_extra_apps_busy);
  const LC = [['AF', 'date'], ['AG', 'kind'], ['AH', 'updated'], ['AI', 'orig_start'], ['AJ', 'orig_end'], ['AK', 'start'], ['AL', 'end'], ['AM', 'job']];
  V.dbcalc_list.forEach((L, i) => { for (const [c, f] of LC) set(c + (LIST_ROW0 + i), L[f]); });
  for (let c = 0; c < 21; c++) {
    const r = JB0 + c;
    set('AB' + r, V.dbcalc_job_label[c]); set('AC' + r, V.dbcalc_job_hours[c]); set('AD' + r, V.dbcalc_job_share[c]);
    set('AE' + r, V.dbcalc_job_pos_seq[c]); set('AF' + r, V.dbcalc_job_legend_idx[c]);
  }
  set('AC93', V.dbcalc_busy_work_days); set('AC94', V.dbcalc_period_start); set('AC95', V.dbcalc_period_end);
  set('AC96', V.dbcalc_busy_reg_days); set('AC97', V.dbcalc_busy_worked); set('AC98', V.dbcalc_busy_sameday_abs);
  set('AC99', V.dbcalc_busy_advance_off);
  const GC = [['AN', 'date'], ['AO', 'name'], ['AP', 'reg_busy'], ['AQ', 'rows'], ['AR', 'work_rows'], ['AS', 'sameday_abs_rows'],
    ['AT', 'status'], ['AU', 'miss_seq'], ['AV', 'cand'], ['AW', 'run_start'], ['AX', 'run_no'], ['AY', 'run_len'],
    ['BC', 'long_run_seq'], ['BI', 'worked'], ['BJ', 'run_worked'], ['BM', 'named_run_no']];
  V.dbcalc_day.forEach((g, i) => { for (const [c, f] of GC) set(c + (BUSY_R0 + i), g[f]); });
  V.dbcalc_missed_busy.forEach((x, j) => { set('BD' + (BUSY_R0 + j), x.date); set('BE' + (BUSY_R0 + j), x.name); });
  V.dbcalc_long_run.forEach((x, j) => {
    const r = BUSY_R0 + j;
    set('BF' + r, x.start); set('BG' + r, x.len); set('BK' + r, x.worked); set('BL' + r, x.name);
  });
  for (let b = 0; b < 5; b++) {
    const r = HB0 + b;
    set('AB' + r, V.dbcalc_band_label[b]); set('AC' + r, V.dbcalc_band_share_self[b]);
    set('AD' + r, V.dbcalc_band_share_all[b]); set('AE' + r, V.dbcalc_band_share_dept[b]);
  }
  set('AC311', V.dbcalc_band_total_self); set('AD311', V.dbcalc_band_total_all); set('AE311', V.dbcalc_band_total_dept);
  return m;
}
const dbcalcSections = [{
  id: 'dbcalc',
  owner: 'layer3 view (input = golden ダッシュボード!B7)',
  owns() { return true; },
  cells(ctx) { return dbcalcCells(ctx.AE, ctx.view()); },
}];

function dashboardCells(AE, V) {
  const m = new Map(), set = (a, v) => m.set(a, v), T = AE.view.TEXT;
  // rows 1–8 (40 §4, §5)
  set('B2', V.dashtop_title); set('O2', V.dashtop_period); set('B3', V.dashtop_subtitle); set('O3', V.dashtop_status);
  set('B5', T.labels.filter); set('D5', V.dashtop_filter_input); set('G5', V.dashtop_filter_msg);
  set('B6', T.labels.staff); set('J6', T.labels.empNo); set('N6', T.labels.dept); set('R6', T.labels.months); set('V6', T.labels.badge);
  set('B7', V.dashtop_staff_box); set('J7', V.dashtop_info_emp_no); set('N7', V.dashtop_info_dept); set('R7', V.dashtop_info_months);
  set('V7', V.dashtop_badge); set('V8', V.dashtop_badge_criteria);
  // KPI tiles rows 10–13 (40 §6)
  const KPI = ['work_days', 'att_rate', 'abs_days', 'abs_rate', 'hours', 'busy_rate'];
  KPI.forEach((id, i) => {
    const c = colLetter(2 + 4 * i);
    set(c + '10', V['dashtop_kpi_' + id + '_label']); set(c + '11', V['dashtop_kpi_' + id]); set(c + '13', V['dashtop_kpi_' + id + '_sub']);
  });
  set('B15', V.dashtop_summary); set('B16', V.dashtop_warning);
  // charts row 1 (40 §8)
  ['B', 'J', 'R'].forEach((c, i) => set(c + '17', T.chartTitles1[i]));
  set('D22', V.dashtop_ring_center_label); set('D23', V.dashtop_ring_center_value);
  set('T22', V.dashtop_job_center_label); set('T23', V.dashtop_job_center_value);
  set('C30', V.dashtop_ring_legend_work); set('F30', V.dashtop_ring_legend_abs);
  set('K30', V.dashtop_month_legend_work); set('N30', V.dashtop_month_legend_abs);
  ['R30', 'T30', 'V30', 'R31', 'T31', 'V31'].forEach((a, j) => set(a, V.dashtop_job_legend_slot[j]));
  // charts row 2 (40 §9)
  ['B', 'J', 'R'].forEach((c, i) => set(c + '33', T.chartTitles2[i]));
  T.radarHeader.forEach((t, b) => set(colLetter(12 + b) + '43', t));
  const RV = [V.dashtop_radar_values.self, V.dashtop_radar_values.all, V.dashtop_radar_values.dept];
  T.radarRows.forEach((t, i) => {
    set('J' + (44 + i), t);
    for (let b = 0; b < 5; b++) set(colLetter(12 + b) + (44 + i), RV[i][b]);
  });
  set('R35', T.timingHeader[0]); set('V35', T.timingHeader[1]);
  T.timingLabels.forEach((t, i) => set('R' + (36 + 2 * i), t));
  set('V36', V.dashtop_timing_values['事前']); set('V38', V.dashtop_timing_values['前日']); set('V40', V.dashtop_timing_values['当日']);
  set('V42', V.dashtop_timing_late); set('V44', V.dashtop_timing_early); set('R46', V.dashtop_timing_note);
  // 月別の実績 rows 49–58 (50 §3)
  set('B49', V.dashbottom_month_title);
  const MC = ['B', 'F', 'H', 'J', 'M', 'P', 'S', 'U', 'W'];
  const MF = ['work_days', 'abs_days', 'confirmed_days', 'att_rate', 'work_hours', 'avg_hours', 'busy_work_days', 'prevday_rest_days'];
  V.dashbottom_month_header.forEach((t, i) => set(MC[i] + '51', t));
  for (let k = 0; k < 6; k++) {
    set('B' + (52 + k), V.dashbottom_month_label[k]);
    MF.forEach((f, i) => set(MC[i + 1] + (52 + k), V['dashbottom_month_' + f][k]));
  }
  set('B58', V.dashbottom_month_total_label);
  MF.forEach((f, i) => set(MC[i + 1] + '58', V['dashbottom_month_total_' + f]));
  // 一覧 rows 60–75 (50 §4): the A4 page holds the first 12 rows
  set('B60', V.dashbottom_abs_title);
  const AC = ['B', 'E', 'F', 'J', 'M', 'Q', 'U'];
  const AF = ['date', 'weekday', 'kind_label', 'updated', 'orig_time', 'new_time', 'job_label'];
  V.dashbottom_abs_header.forEach((t, i) => set(AC[i] + '62', t));
  V.dashbottom_abs_row.slice(0, AE.view.ABS_ROWS).forEach((row, i) => AF.forEach((f, j) => set(AC[j] + (63 + i), row[f])));
  set('B75', V.dashbottom_abs_footnote);
  // 繁忙日 rows 77–98 (50 §5)
  set('B77', V.dashbottom_busy_title); set('B79', V.dashbottom_busy_summary_line);
  set('B80', V.dashbottom_busy_extra_apps_line); set('B81', V.dashbottom_busy_runs_label);
  const RC = ['B', 'M', 'S', 'V'], RF = ['period', 'names', 'len', 'worked'];
  V.dashbottom_busy_runs_header.forEach((t, i) => set(RC[i] + '82', t));
  V.dashbottom_busy_run_row.slice(0, AE.view.RUN_SHOW).forEach((row, m) => RF.forEach((f, j) => set(RC[j] + (83 + m), row[f])));
  set('B89', V.dashbottom_busy_missed_label);
  V.dashbottom_busy_missed_cell.slice(0, AE.view.BUSY_ROWS).forEach((t, j) => set(['B', 'J', 'R'][j % 3] + (90 + Math.floor(j / 3)), t));
  set('B98', V.dashbottom_busy_footnote);
  return m;
}
const dashboardSections = [{
  id: 'dashboard',
  owner: 'layer3 view (input = golden ダッシュボード!B7)',
  owns() { return true; },
  cells(ctx) { return dashboardCells(ctx.AE, ctx.view()); },
}];

// 計算k W / AA11 / AA12 through the view layer's selection (golden B7 → AC3), complementing the layer-1 hook check
function calcSelectionViewSection(k) {
  return {
    id: `calc${k}-selection-view`,
    owner: 'layer3 view (input = golden ダッシュボード!B7)',
    owns(addr) {
      const { col, row } = parseAddr(addr);
      return (col === 'W' && row >= 1) || (col === 'AA' && (row === 11 || row === 12));
    },
    cells(ctx) {
      const V = ctx.view(), m = new Map();
      V.ingest_row_sel_list_seq[k - 1].forEach((v, i) => m.set('W' + (i + 2), v));
      m.set('AA11', V.ingest_chk_sel_list_count[k - 1]);
      m.set('AA12', V.ingest_chk_sel_list_offset[k - 1]);
      return m;
    },
  };
}

// ================================================================ the mapping, by sheet
const SHEETS = {
  '使い方': howtoSections,             // layer 2: paste-status table (spec 60 §D.2); static help text not owned yet
  'ダッシュボード': dashboardSections,   // layer 3 view (specs 40, 50)
  'DB計算': dbcalcSections,              // layer 3 view (spec 30)
  'スタッフ一覧': staffListSections,   // layer 2 (spec 60 §C)
  '全体サマリー': summarySections,     // layer 2 (spec 60 §B)
  '設定': settingsSections.concat([settingsCountSection]),   // layer 1 + layer 2 C13:C32, C38:C57 row counts
  '祝日・繁忙日': holidaySections,
  '名簿': rosterSections,              // layer 2 (spec 20)
};
for (let k = 1; k <= 6; k++) SHEETS['計算' + k] = calcSections(k).concat([calcSelectionViewSection(k)]);

const EXCEPTIONS = [
  // {case: /^ns_aug$/, sheet: '名簿', addr: /^V\d+$/, reason: 'scope decision 4 (name collation)'},
];

module.exports = { SHEETS, EXCEPTIONS, SHEET_ORDER, MAXROWS, parseAddr, colIndex, colLetter, dbcalcCells, dashboardCells };
