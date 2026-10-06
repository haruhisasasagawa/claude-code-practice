#!/usr/bin/env node
'use strict';
/* Unit tests for engine layer 2 (roster.js: 名簿, スタッフ一覧, 全体サマリー, 使い方 paste status, 設定 C counts) —
 * behaviour the golden workbooks do not reach: blank names, text / case-variant staff numbers, ties, 参考 ranks,
 * the worst-10 tie-breaks, department code matching, every paste-status branch, period / order / cap warnings,
 * the Excel caps (opt-in), the filter, the display formats.
 *   node test/unit_roster.js
 * Synthetic data only (fake names).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
for (const f of ['csv.js', 'holidays.js', 'calc.js', 'roster.js', 'view.js', 'index.js']) {
  const p = path.join(APP, 'src', 'engine', f);
  if (fs.existsSync(p)) require(p);
}
const AE = globalThis.AE;
const RO = AE.roster;

let n = 0, failed = 0;
function test(name, fn) {
  n++;
  try { fn(); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e}`); }
}
const eq = assert.strictEqual, deq = assert.deepStrictEqual;

// ---------------------------------------------------------------- synthetic CSV helpers
const H = AE.csv.CSV_HEADERS;
const qq = (s) => '"' + String(s).replace(/"/g, '""') + '"';
function csvText(rows, header) {
  header = header || H;
  const lines = [header.map(qq).join(',')];
  for (const r of rows) lines.push(header.map((h) => qq(r[h] == null ? '' : r[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}
const ms = (y, m, d, hh) => String(Date.UTC(y, m - 1, d, (hh === undefined ? 12 : hh) - 9));   // JST hh:00
function work(no, name, ymd, o) {
  const [y, m, d] = ymd;
  return Object.assign({
    '募集シフトの日付': `${y}/${m}/${d}`, '応募ステータス': '確定（シフト作成）', '募集シフトの開始時間': '10:00',
    '募集シフトの終了時間': '18:00', '募集シフトの職種': '02コンセ', '応募者の名前': name, '応募者の従業員番号': no,
    '応募者の職種': '02コンセ', '応募者の資格': '01アルバイト', '更新時間': ms(y, m - 1 || 12, 20), '勤務種別': '1',
  }, o || {});
}
function absent(no, name, ymd, o) {
  const [y, m, d] = ymd;
  return work(no, name, ymd, Object.assign({ '勤務種別': '4', '変更後の開始時間': '5:00', '変更後の終了時間': '29:00',
    '更新時間': ms(y, m, d, 8) }, o || {}));
}
// n work days (and a absent days) for one person in month (y, m), days 1..
function person(no, name, y, m, nWork, nAbs, o) {
  const rows = [];
  for (let i = 0; i < nWork; i++) rows.push(work(no, name, [y, m, 1 + i], o));
  for (let i = 0; i < nAbs; i++) rows.push(absent(no, name, [y, m, 1 + nWork + i], o));
  return rows;
}
function wb(sheets, settings, opts) {
  const files = sheets.map((rows, i) => (rows == null ? null
    : { name: `m${i + 1}.csv`, text: typeof rows === 'string' ? rows : csvText(rows) }));
  while (files.length < 6) files.push(null);
  const S = Object.assign(AE.api.defaultSettings(), settings || {});
  return AE.api.build(files, S, AE.api.defaultHolidays(), opts);
}
const byNo = (W, no) => W.roster.master.find((s) => s.emp_no === no);
const listRow = (W, no) => W.lists_staff_rows.find((r) => r.id === no);

// ================================================================ identity (20 §3, R-Q1, R-Q11, R-Q18)
test('latest name / 所属 / 資格 come from the first row of the highest-numbered sheet (any status)', () => {
  const W = wb([
    [work('100', '旧名A', [2026, 9, 1], { '応募者の職種': '03フロア' })],
    [work('100', '新名A', [2026, 10, 2], { '応募ステータス': '却下', '応募者の資格': '03リーダー' }),
      work('100', '別名A', [2026, 10, 3])],
  ]);
  const s = byNo(W, 100);
  eq(W.roster.total_staff, 1);
  eq(s.name, '新名A');
  eq(s.dept_code, '02コンセ');
  eq(s.qual, '03リーダー');
  eq(listRow(W, 100).qual, 'リーダー');                          // grade() replacement
  deq(s.month_has, [1, 1, 0, 0, 0, 0]);
  eq(s.months_with_data, 2);                                     // R-Q18: the rejected-only month still counts
  eq(s.work_days, 2);                                            // 9/1 + 10/3 (the rejected row is not work)
  // stack: CSV_2 block first, H = (6-k)*400 + i
  eq(W.roster.stack[0].k, 2);
  eq(s.row, 4 * 400 + 1);
});
test('text staff numbers differing only in case are one person; numbers and numeric text are one person', () => {
  const W = wb([[work('ab12', '甲', [2026, 9, 1]), work('AB12', '甲', [2026, 9, 2]), work('0123', '乙', [2026, 9, 1]),
    work('123', '乙', [2026, 9, 2])]]);
  eq(W.roster.total_staff, 2);
  eq(byNo(W, 'ab12').work_days, 2);
  eq(byNo(W, 123).work_days, 2);
  eq(W.roster.paste_status[0], '※ 読み取れない値があります（日付 0 行／番号 2 行）');   // AA9: text numbers
});
test('master order: CSV_6 staff first, then staff first seen in lower sheets', () => {
  const W = wb([[work('1', 'い', [2026, 9, 1]), work('2', 'ろ', [2026, 9, 1])], null, null, null, null,
    [work('3', 'は', [2027, 2, 1]), work('1', 'い', [2027, 2, 2])]]);
  deq(W.roster.master.map((s) => s.emp_no), [3, 1, 2]);
  deq(W.roster.stack.map((e) => [e.k, e.i, e.first, e.cum]), [[6, 1, 1, 1], [6, 2, 1, 2], [1, 1, 0, 2], [1, 2, 1, 3]]);
});

// ================================================================ aggregates
test('per-staff aggregates, rates and blank handling (20 §4)', () => {
  const W = wb([[...person('7', '丙', 2026, 9, 3, 1), work('7', '丙', [2026, 9, 1], { '相談応募の開始時間': '10:00' }),
    // a person with only a previous-day rest: O = 0 → rates ''
    absent('8', '丁', [2026, 9, 10], { '更新時間': ms(2026, 9, 9, 20) })]]);
  const s = byNo(W, 7), t = byNo(W, 8);
  eq(s.work_days, 3); eq(s.abs_days, 1); eq(s.confirmed_days, 4);
  eq(s.att_rate, 0.75); eq(s.abs_rate, 0.25);
  eq(s.work_hours, 32); eq(s.avg_hours_per_day, 32 / 3);          // R-Q20: two work rows on 9/1 both add hours
  eq(s.extra_apps, 1); eq(s.extra_apps_confirmed, 1);
  eq(t.confirmed_days, 0); eq(t.att_rate, ''); eq(t.abs_rate, ''); eq(t.avg_hours_per_day, ''); eq(t.busy_rate, '');
  eq(t.att_rate_key, ''); eq(t.att_rank, ''); eq(t.worst_key, '');
  const r = listRow(W, 8);
  eq(r.rank, '－'); eq(r.judgement, '－'); eq(r.attend_rate, ''); eq(r.attend_rate_text, '');
  eq(W.roster.total_evaluated, 1);                                 // COUNT(P)
});

// ================================================================ rank / 参考 / judgement (R-Q6, 60 §C.3)
test('competition ranking includes 参考 staff; 参考 shows text; judgement ladder', () => {
  const W = wb([[
    ...person('1', 'A', 2026, 9, 25, 0),        // 100%            O=25
    ...person('2', 'B', 2026, 9, 5, 0),         // 100% (参考)      O=5
    ...person('3', 'C', 2026, 9, 19, 1),        // 95.0%           O=20 → ◎ (P>=B3)
    ...person('4', 'D', 2026, 9, 23, 2),        // 92.0%           → △
    ...person('5', 'E', 2026, 9, 17, 3),        // 85.0%           → ✕
  ]]);
  const rk = (no) => byNo(W, no).att_rank;
  deq([1, 2, 3, 4, 5].map(rk), [1, 1, 3, 4, 5]);
  deq([1, 2, 3, 4, 5].map((no) => listRow(W, no).rank), [1, '参考', 3, 4, 5]);
  deq([1, 2, 3, 4, 5].map((no) => listRow(W, no).judgement), ['◎ 良好', '参考値', '◎ 良好', '△ 注意', '✕ 要改善']);
  eq(byNo(W, 1).tie_count, 2);
  deq([1, 2].map((no) => byNo(W, no).att_order_desc), [1, 2]);
  eq(listRow(W, 1).rank_text, '1');
});

// ================================================================ worst-10 (20 §4.2, R-Q8, Q-S2)
test('worst order: rate key asc, then O desc, then master order; needs O >= B5; no Q>0 filter', () => {
  const W = wb([[
    ...person('1', 'A', 2026, 9, 18, 2),        // 90.0%  O=20
    ...person('2', 'B', 2026, 9, 27, 3),        // 90.0%  O=30  → before A (more days)
    ...person('3', 'C', 2026, 9, 9, 1),         // 90.0%  O=10  → ineligible (参考)
    ...person('4', 'D', 2026, 9, 25, 0),        // 100%   O=25  → listed although no absences
    ...person('5', 'E', 2026, 9, 20, 0),        // 100%   O=20  → after D
  ]]);
  deq(W.roster.worst_order.map((n) => W.roster.master[n - 1].emp_no), [2, 1, 4, 5]);
  eq(byNo(W, 3).worst_key, '');
  const rows = W.lists_sum_worst_rows;
  eq(rows.length, 10);
  deq(rows.slice(0, 4).map((r) => [r.name, r.dept, r.shift_days, r.absent_days, r.absent_rate_text]),
    [['B', 'コンセ', 30, 3, '10.0%'], ['A', 'コンセ', 20, 2, '10.0%'], ['D', 'コンセ', 25, 0, '0.0%'], ['E', 'コンセ', 20, 0, '0.0%']]);
  eq(rows[4].name, ''); eq(rows[4].absent_rate_text, '');
  eq(W.roster.total_alert_count, 3);                               // R-Q9: the 参考 staff C (10%) counts too
  eq(W.lists_sum_worst_title, '当欠率 ワースト10（確定シフト日数 20日以上の人が対象。基準 5%以上は赤）');
});
test('worst title and thresholds follow 設定 B5 / B6', () => {
  const W = wb([[...person('1', 'A', 2026, 9, 9, 1)]], { minDays: 10, alertRate: 0.075 });
  eq(W.lists_sum_worst_title, '当欠率 ワースト10（確定シフト日数 10日以上の人が対象。基準 8%以上は赤）');
  eq(W.roster.worst_order.length, 1);
  eq(W.roster.total_alert_count, 1);
  const B = wb([[...person('1', 'A', 2026, 9, 9, 1)]], { minDays: '', alertRate: '' });   // blank → 0 (OQ4)
  eq(B.roster.worst_order.length, 1);
  eq(B.lists_sum_worst_title, '当欠率 ワースト10（確定シフト日数 日以上の人が対象。基準 0%以上は赤）');
  eq(listRow(B, 1).rank, 1);
});

// ================================================================ blank names (R-Q4, R-Q5)
test('blank-name staff: counted in totals and departments, absent from name lists, can be in the worst list', () => {
  const W = wb([[...person('1', '', 2026, 9, 18, 2), ...person('2', 'B', 2026, 9, 20, 0)]]);
  eq(W.roster.total_staff, 2);
  eq(W.roster.named.length, 1);
  eq(W.lists_staff_rows.length, 1);
  eq(byNo(W, 1).name_key, '');
  eq(W.roster.dept[0].headcount, 2);
  eq(W.lists_sum_worst_rows[0].name, '');
  eq(W.lists_sum_worst_rows[0].shift_days, 20);
  const f = AE.roster.filterInfo(W, 'zzz');
  eq(f.match_count, 0);
  eq(f.candidate_count, 2);                                        // CJ3 = AY2 (incl. the blank-name staff)
  deq(f.staffnames, ['B', '']);                                    // trailing blank entry, as in StaffNames
  eq(W.lists_staff_print_last_row, 6);
});

// ================================================================ name order (scope decision 4, R-Q14)
test('name order: Intl.Collator ja, then code point, then master order; findByName takes the first', () => {
  const W = wb([[work('1', 'さとう', [2026, 9, 1]), work('2', 'あべ', [2026, 9, 1]), work('3', 'さとう', [2026, 9, 1]),
    work('4', 'Abe', [2026, 9, 1]), work('5', 'abe', [2026, 9, 1])]]);
  const names = W.roster.name_sorted;
  eq(names.length, 5);
  eq(names.indexOf('さとう'), names.lastIndexOf('さとう') - 1);
  const dup = W.roster.named.filter((s) => s.name === 'さとう').map((s) => s.emp_no);
  deq(dup, [1, 3]);                                                // equal names: master order
  eq(AE.roster.findByName(W, 'サトウ'), null);
  eq(AE.roster.findByName(W, 'さとう').emp_no, 1);
  eq(AE.roster.findByName(W, 'ABE').emp_no, AE.roster.findByName(W, 'abe').emp_no);   // case-insensitive MATCH
  eq(AE.roster.findByKey(W, 3).n, byNo(W, 3).n);
  deq(W.lists_staff_order, W.roster.row_sorted);
});

// ================================================================ departments (20 §6, R-Q22)
test('departments: latest 所属, label fallback, blank / duplicate / numeric codes, deptLabel', () => {
  const depts = AE.api.defaultSettings().depts.map((d) => Object.assign({}, d));
  depts[1] = { code: '03フロア', label: '' };                     // label falls back to the code
  depts[4] = { code: 2, label: '数値' };                           // number criterion vs K text "2"
  depts[6] = { code: '02コンセ', label: '重複' };                  // duplicate code: same totals, first label wins
  const W = wb([
    [...person('1', 'A', 2026, 9, 4, 1, { '応募者の職種': '03フロア' })],
    [...person('1', 'A', 2026, 10, 2, 0), ...person('2', 'B', 2026, 10, 3, 0, { '応募者の職種': '02' }),
      ...person('3', 'C', 2026, 10, 1, 0, { '応募者の職種': '99未登録' })],
  ], { depts });
  const D = W.roster.dept;
  deq([D[0].headcount, D[0].work_days, D[0].abs_days, D[0].confirmed_days], [1, 6, 1, 7]);   // all months → latest 所属
  eq(D[1].label, '03フロア'); eq(D[1].headcount, 0); eq(D[1].att_rate, '');
  deq([D[4].label, D[4].headcount, D[4].work_days], ['数値', 1, 3]);
  deq([D[6].label, D[6].headcount, D[6].work_days], ['重複', 1, 6]);
  eq(D[5].code, ''); eq(D[5].headcount, '');
  eq(listRow(W, 1).dept, 'コンセ');
  eq(listRow(W, 2).dept, '2');                                     // MATCH does not coerce: raw code shown
  eq(listRow(W, 3).dept, '99未登録');
  eq(AE.roster.deptLabel(W, '02コンセ'), 'コンセ');
  const rows = W.lists_sum_dept_rows;
  eq(rows.length, 20);
  deq([rows[1].name, rows[1].headcount_text, rows[1].work_days_text, rows[1].attend_rate_text], ['03フロア', '0名', '0日', '']);
  deq([rows[5].name, rows[5].headcount_text], ['', '']);
});

// ================================================================ paste status / labels / period / warnings (20 §7)
test('paste-status ladder, month labels, period by sheet position, order warning, has_warning, 使い方 rows', () => {
  const noHeader = csvText([work('1', 'A', [2026, 9, 1])], H.filter((h) => h !== '更新時間'));
  const W = wb([
    [work('1', 'A', [2026, 9, 1]), work('1', 'A', [2026, 9, 2]), work('1', 'A', [2026, 10, 1])],   // other-month row
    noHeader,
    null,
    [work('2', 'B', [2026, 8, 1]), work('3', 'C', [2026, 8, 2], { '募集シフトの日付': 'xyz' })],   // unreadable date
    [{ '募集シフトの日付': '2026/12/1' }],                                                         // column A only, no staff
  ]);
  const R = W.roster;
  deq(R.paste_status, [
    '※ 対象月以外の日付の行が 1 行あります（前のデータが残っている可能性。全選択→削除してから貼り直し）',
    '※ 列名が見つかりません（1行目にヘッダーを含めて貼り付けてください）',
    '未貼付',
    '※ 読み取れない値があります（日付 1 行／番号 0 行）',
    'OK',
    '未貼付',
  ]);
  deq(R.month_label, ['2026年9月', '月2（未貼付）', '月3（未貼付）', '2026年8月', '月5（未貼付）', '月6（未貼付）']);
  deq(R.paste_rows, [3, 1, 0, 2, 1, 0]);
  eq(R.period_label, '2026年9月 〜 月5（未貼付）');                 // R-Q16 / Q-S4
  eq(R.month_order_warning, '');                                    // blank AA6 in between hides the 9月 → 8月 inversion (R-Q17)
  eq(R.has_warning, 1);
  eq(R.paste_ok_count, 1);
  deq(W.lists_howto_paste_rows.map((p) => [p.sheet, p.rows_text]), [['CSV_1', '3'], ['CSV_2', '1'], ['CSV_3', '0'],
    ['CSV_4', '2'], ['CSV_5', '1'], ['CSV_6', '0']]);
  eq(W.lists_howto_warning, '');
  eq(W.lists_staff_hdr_work[1], '出勤\n月2（未貼付）');
  // month columns of スタッフ一覧: '' for unpasted sheets, 0 for pasted sheets without the staff (Q-L9)
  deq(listRow(W, 1).month_work, [3, 0, '', 0, 0, '']);              // the other-month row is still a work day
  deq(listRow(W, 1).month_work_text, ['3', '0', '', '0', '0', '']);
  eq(byNo(W, 3).name, 'C');                                         // an unreadable-date row still identifies (10:Q20)
});
test('order warning on adjacent equal / inverted months; TRIM joins the 使い方 warning line', () => {
  const W = wb([[work('1', 'A', [2026, 10, 1])], [work('1', 'A', [2026, 10, 2])]]);
  eq(W.roster.month_order_warning, AE.roster.ORDER_WARNING);
  eq(W.roster.has_warning, 1);
  eq(W.lists_howto_warning, AE.roster.ORDER_WARNING);
  eq(W.roster.period_label, '2026年10月 〜 2026年10月');
  const E = wb([]);
  eq(E.roster.period_label, '（CSV未貼付）');
  eq(E.roster.total_staff, 0);
  eq(E.roster.has_warning, 0);
  eq(E.lists_sum_period_text, '対象期間　（CSV未貼付）　　一人ずつの数字は「スタッフ一覧」、個人のページは「ダッシュボード」で見られます。');
  deq(E.lists_sum_tiles.map((t) => t.text), ['0名', '0名', '', '', '0日', '0名']);
  deq(E.roster.filter.staffnames, ['']);
  eq(AE.api.filter(E, '').length, 0);
  eq(E.lists_staff_print_last_row, 6);
  eq(AE.roster._h.excelTrim('  a  b  '), 'a b');
  eq(AE.roster._h.excelTrim('a　 '), 'a　');
});

// ================================================================ caps (scope decision 1; Excel layout opt-in)
test('default build has no caps; EXCEL_LIMITS-style caps reproduce R-Q2 / R-Q3 / AY32 / the >maxrows status', () => {
  const rows = [];
  for (let i = 1; i <= 5; i++) rows.push(work(String(i), 'N' + i, [2026, 9, i]));
  const sheets = [rows, [work('9', 'N9', [2026, 10, 1]), work('1', 'N1', [2026, 10, 1])]];
  const D = wb(sheets);
  eq(D.roster.total_staff, 6);
  eq(D.roster.staff_cap_warning, '');
  eq(D.roster.paste_status[0], 'OK');
  const C = wb(sheets, null, { limits: { maxrows: 4, maxstaff: 3, pasteRows: Infinity } });
  const R = C.roster;
  eq(R.paste_status[0], '※ 4行を超えています（超過分は集計されません）');
  eq(R.stack.length, 2 + 3);                                       // CSV_1 contributes only its first 3 distinct ids
  deq(R.master.map((s) => s.emp_no), [9, 1, 2]);                   // master capped at 3
  eq(R.stack_distinct, 4);
  eq(R.staff_cap_warning, '※ スタッフが半年で3名を超えています（4名）。超えた分は集計されません');
  eq(byNo(C, 2).row, 5 * 3 + 2);                                   // H with a 3-row block per sheet
  eq(C.lists_howto_warning, R.staff_cap_warning);
  eq(R.stack.some((e) => e.no === 5), false);                      // id 5 sits on data row 5 > maxrows
  eq(byNo(C, 1).month_work[0], 1);
  const X = wb([rows], null, { limits: AE.roster.EXCEL_LIMITS });
  eq(X.roster.paste_status[0], 'OK');
  eq(AE.roster.STATUS.tooMany(6000), '※ 6,000行を超えています（超過分は集計されません）');
});

// ================================================================ filter (20 §8, scope decision 3, R-Q13)
test('filter: substring on name or number, case-insensitive, numeric query loses leading zeros, fallback', () => {
  const W = wb([[work('5616', '山田Taro', [2026, 9, 1]), work('1234', '鈴木', [2026, 9, 1]), work('77', '田中', [2026, 9, 1])]]);
  const names = (r) => r.map((x) => x.name).sort();
  deq(names(AE.api.filter(W, '')), ['山田Taro', '田中', '鈴木'].sort());
  deq(names(AE.api.filter(W, 'taro')), ['山田Taro']);
  deq(names(AE.api.filter(W, '田')), ['山田Taro', '田中']);
  const f = AE.api.filter(W, '0999');                              // typed 0999 → 999: no match → whole list
  eq(f.matchCount, 0); eq(f.fallback, true); eq(f.length, 3);
  const g = AE.api.filter(W, '056');
  eq(g.query, '56'); eq(g.matchCount, 1); eq(g[0].key, 5616);
  eq(AE.api.filter(W, 7).matchCount, 1);
  const r = AE.api.filter(W, '鈴木')[0];
  eq(r.master, byNo(W, 1234).n);
  eq(r.n, byNo(W, 1234).name_key);
  const fi = AE.roster.filterInfo(W, '田');
  deq(fi.hit.reduce((a, b) => a + b, 0), 2);
  eq(fi.match_count, 2); eq(fi.candidate_count, 2); eq(fi.staffnames.length, 2);
  eq(fi.list.filter((x) => x !== '').length, 2);
  eq(AE.api.filter(W, '*').matchCount, 0);                         // no wildcard semantics (scope decision 3)
});

// ================================================================ 設定 C-column counts (10 §7.4)
test('settings row counts: every row (any status), case-insensitive, blank code / no staff → blank, text format', () => {
  const jobs = AE.api.defaultSettings().jobs.map((j) => Object.assign({}, j));
  jobs[6] = { code: 'abc', label: 'x' };
  const W = wb([[work('1', 'A', [2026, 9, 1]), work('1', 'A', [2026, 9, 2], { '応募ステータス': '却下' }),
    work('1', 'A', [2026, 9, 3], { '募集シフトの職種': 'ABC' })]], { jobs });
  deq(W.ingest_set_job_rowcount.slice(0, 8), [2, 0, 0, 0, 0, 0, 1, '']);
  eq(W.ingest_set_job_rowcount_text[0], '2行');
  eq(W.ingest_set_job_rowcount_text[1], '※ 貼付データに無い値です（表記を確認）');
  eq(W.ingest_set_job_rowcount_text[7], '');
  deq(W.ingest_set_dept_rowcount.slice(0, 5), [3, 0, 0, 0, '']);
  eq(W.set.dept_rowcount[0], 3);
  const E = wb([]);
  deq(E.ingest_set_job_rowcount.slice(0, 2), ['', '']);             // 名簿!AY2 = 0 → blank
  eq(AE.roster.format(9226, 'rowcount'), '9,226行');
});

// ================================================================ display formats (60 §F)
test('display formats: half away from zero on 15 significant digits, separators, suffixes, text passthrough', () => {
  const F = AE.roster.format;
  eq(F(0.15, '0.0'), '0.2');
  eq(F(2.675, '0.0'), '2.7');
  eq(F(0.0005, '0.0%'), '0.1%');
  eq(F(0.9854550691244239, '0.0%'), '98.5%');
  eq(F(0.0145, '0.0%'), '1.5%');
  eq(F(1234.5, '#,##0"日"'), '1,235日');
  eq(F(13686, '#,##0"日"'), '13,686日');
  eq(F(199, '0"名"'), '199名');
  eq(F(209.25, '0.0"h"'), '209.3h');
  eq(F(6, '0"ヶ月"'), '6ヶ月');
  eq(F(3, '0"件"'), '3件');
  eq(F(0.05, '0%'), '5%');
  eq(F(0.075, '0%'), '8%');
  eq(F(-0.04, '0.0'), '0.0');
  eq(F(-1.25, '0.0'), '-1.3');
  eq(F(1234567, '#,##0'), '1,234,567');
  eq(F(712399, '0'), '712399');
  eq(F(12.5, '0'), '13');
  eq(F('参考', '0'), '参考');
  eq(F('', '0.0%'), '');
  eq(F(20, 'General'), '20');
  eq(F(0.1 + 0.2, 'General'), '0.3');
});

// ================================================================ スタッフ一覧 fixed texts (60 §C.1–C.2)
test('スタッフ一覧 / 全体サマリー fixed texts', () => {
  const W = wb([[work('1', 'A', [2026, 9, 1])]]);
  eq(W.lists_staff_period_text, '対象期間　2026年9月 〜 2026年9月　　名前順（先頭の部門記号でまとまります）。フィルターで所属や判定を絞り込めます。印刷は順位〜在籍月数の列です。');
  eq(W.lists_staff_headers.length, 23);
  eq(W.lists_staff_headers[12], '平均 h／日');
  eq(W.lists_staff_hdr_absent[0], '欠勤\n2026年9月');
  deq(W.lists_sum_tiles.map((t) => t.accent), ['#9AA7B8', '#9AA7B8', '#7EB2E6', '#DC8E8E', '#7EB2E6', '#DC8E8E']);
  eq(W.lists_sum_tile_attend_rate_text, '100.0%');
});

console.log(`\nunit_roster: ${n - failed}/${n} passed`);
process.exitCode = failed ? 1 : 0;
