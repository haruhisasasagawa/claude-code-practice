#!/usr/bin/env node
'use strict';
/* Unit tests for engine layer 3 (view.js: DB計算 + ダッシュボード for one selected staff) — behaviour the golden
 * workbooks do not reach: the B7 selection rules (default, blank, case, duplicates, keys, refs, literal numbers, stale
 * names), the empty workbook, the O = 0 state, blank settings (DB-Q5 / DB-Q20), the filter message, the job legend cap,
 * the その他 float residue, the "すべて表示" arrays beyond the A4 caps, and the style flags.
 *   node test/unit_view.js
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

let n = 0, failed = 0;
function test(name, fn) {
  n++;
  try { fn(); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n     ") : e}`); }
}
const eq = assert.strictEqual, deq = assert.deepStrictEqual;

// ---------------------------------------------------------------- synthetic CSV helpers (same shape as unit_roster.js)
const H = AE.csv.CSV_HEADERS;
const qq = (s) => '"' + String(s).replace(/"/g, '""') + '"';
function csvText(rows) {
  const lines = [H.map(qq).join(',')];
  for (const r of rows) lines.push(H.map((h) => qq(r[h] == null ? '' : r[h])).join(','));
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
function person(no, name, y, m, nWork, nAbs, o) {
  const rows = [];
  for (let i = 0; i < nWork; i++) rows.push(work(no, name, [y, m, 1 + i], o));
  for (let i = 0; i < nAbs; i++) rows.push(absent(no, name, [y, m, 1 + nWork + i], o));
  return rows;
}
function wb(sheets, settings) {
  const files = sheets.map((rows, i) => (rows == null ? null : { name: `m${i + 1}.csv`, text: csvText(rows) }));
  while (files.length < 6) files.push(null);
  const S = Object.assign(AE.api.defaultSettings(), settings || {});
  return AE.api.build(files, S, AE.api.defaultHolidays());
}
const view = (W, staff, opts) => AE.api.view(W, staff, opts);
const NOT_FOUND = (t) => `「${t}」は名簿にありません。▼から選ぶか、上の黄色い欄に名前か従業員番号の一部を入れてください。`;

// a small theatre: three named staff (one pair with the same name) in September 2026
const THEATRE = [
  ...person('300', 'テスト乙', 2026, 9, 18, 2),
  ...person('100', 'テスト甲', 2026, 9, 20, 0),
  ...person('201', 'テスト同名', 2026, 9, 10, 0),
  ...person('202', 'テスト同名', 2026, 9, 5, 5, { '応募者の職種': '03フロア' }),
];

// ================================================================ §3 selection (B7 → AC3 → AC4)
test('default selection (null / undefined / "") = the first staff in name order', () => {
  const W = wb([THEATRE]);
  const first = W.roster.named[0];
  for (const s of [null, undefined, '']) {
    const v = view(W, s);
    eq(v.dbcalc_sel_input, first.name);
    eq(v.dashtop_staff_box, first.name);
    eq(v.dbcalc_sel_emp_no, first.emp_no);
    eq(v.dbcalc_sel_master_idx, first.n);
    assert.ok(v.dashtop_warning.charAt(0) !== '「');           // never the not-found message
  }
});
test('a typed name matches case-insensitively and keeps the typed text in B7', () => {
  const W = wb([[...person('500', 'Test Alpha', 2026, 9, 3, 0)]]);
  const v = view(W, 'TEST ALPHA');
  eq(v.dbcalc_sel_emp_no, 500);
  eq(v.dashtop_staff_box, 'TEST ALPHA');
  eq(v.dashtop_warning, '');
});
test('duplicate names: the first in name order wins; a 従業員番号 / filter ref selects the other one', () => {
  const W = wb([THEATRE]);
  const dups = W.roster.named.filter((s) => s.name === 'テスト同名');
  eq(dups.length, 2);
  const byName = view(W, 'テスト同名');
  eq(byName.dbcalc_sel_emp_no, dups[0].emp_no);
  const other = dups[1];
  const byKey = view(W, other.emp_no);
  eq(byKey.dbcalc_sel_emp_no, other.emp_no);
  eq(byKey.dbcalc_sel_master_idx, other.n);
  eq(byKey.dashtop_staff_box, 'テスト同名');
  assert.ok(byKey.dashtop_warning.charAt(0) !== '「');
  const ref = AE.api.filter(W, '同名').find((r) => r.key === other.emp_no);
  eq(view(W, ref).dbcalc_sel_emp_no, other.emp_no);
  eq(view(W, { key: other.emp_no }).dbcalc_sel_emp_no, other.emp_no);
  eq(view(W, { name: 'テスト同名' }).dbcalc_sel_emp_no, dups[0].emp_no);
  // the two views really differ (different staff behind the same name)
  assert.notStrictEqual(byName.dbcalc_work_days, byKey.dbcalc_work_days);
});
test('a name not in 名簿, a literal numeric B7 and an unknown 従業員番号 select nobody (B16 message)', () => {
  const W = wb([THEATRE]);
  const v = view(W, '存在しないテスト');
  eq(v.dbcalc_sel_emp_no, '');
  eq(v.dbcalc_sel_master_idx, '');
  eq(v.dashtop_warning, NOT_FOUND('存在しないテスト'));
  eq(v.dashtop_badge, '－');
  eq(v.dashtop_badge_criteria, '');
  eq(v.dashtop_badge_style, '');
  eq(v.dashtop_summary, '');
  eq(v.dashtop_kpi_work_days_text, '');
  eq(v.dashtop_kpi_busy_rate_sub, '');
  eq(v.dashtop_ring_center_value, '－');
  eq(v.dashtop_job_center_value, '－');
  eq(v.dashtop_ring_legend_work, '');
  deq(v.dashtop_radar_table.self, ['', '', '', '', '']);
  deq(v.dashtop_radar_table.all, ['', '', '', '', '']);        // table values blank, …
  assert.ok(v.dbcalc_band_total_all > 0);                       // … but the 全体 series is still computed (40:Q7)
  eq(v.dbcalc_busy_reg_days, v.dbcalc_day.filter((g) => g.reg_busy === 1).length);   // AC96 ignores the selection
  eq(v.dbcalc_busy_worked, 0);
  eq(v.dashbottom_month_label[0], '2026年9月');                 // month labels and 合計 always show (50:Q6)
  eq(v.dashbottom_month_work_days[0], '');
  eq(v.dashbottom_month_total_label, '合計');
  eq(v.dashbottom_month_total_work_days, '');
  eq(v.dashbottom_abs_row[0].date, '');                          // no 該当なし without a selection (50:Q14)
  eq(v.dashbottom_busy_summary_line, '');
  eq(v.dashbottom_abs_footnote, AE.view.TEXT.absFoot);
  // a number in B7 never matches (DB-Q1)
  eq(view(W, { b7: 100 }).dbcalc_sel_emp_no, '');
  eq(view(W, { b7: 100 }).dashtop_warning, NOT_FOUND('100'));
  eq(view(W, { b7: '' }).dashtop_warning, '');                   // a blank B7: nobody, no message (30 OQ2)
  eq(view(W, 99999).dashtop_warning, NOT_FOUND('99999'));
});
test('the selection never depends on the filter (D5 only narrows the dropdown)', () => {
  const W = wb([THEATRE]);
  const v = view(W, 'テスト甲', { filter: '乙' });
  eq(v.dbcalc_sel_emp_no, 100);
  eq(v.dashtop_filter_msg, '　「乙」に一致 1名　― 下の▼から選んでください（空欄にすると全員に戻ります）');
  eq(v.dashtop_filter_msg_bad, false);
  const z = view(W, 'テスト甲', { filter: 'zzz' });
  eq(z.dashtop_filter_msg, '　「zzz」に一致するスタッフはいません。▼は全員を表示しています');
  eq(z.dashtop_filter_msg_bad, true);
  eq(view(W, null, { filter: '0100' }).dashtop_filter_input, '100');   // D5 digits become a number (R-Q13 / 40:Q22)
  eq(view(W, null).dashtop_filter_msg, '');
});

// ================================================================ empty workbook / O = 0 (40 §11)
test('no CSV at all: prompt in B7, the no-data sentence, 0名 / 0ヶ月, empty charts', () => {
  const W = wb([]);
  const v = view(W, null);
  eq(v.dashtop_staff_box, AE.view.PROMPT);
  eq(v.dbcalc_sel_emp_no, '');
  eq(v.dashtop_summary, AE.view.TEXT.noData);
  eq(v.dashtop_warning, '');                                    // AT2 = "" suppresses the not-found message
  eq(v.dashtop_status, '集計対象 0名　　貼付済み 0ヶ月');
  eq(v.dashtop_period, '対象期間　（CSV未貼付）');
  eq(v.dashtop_subtitle, 'TOHOシネマズ新宿　アルバイトスタッフ（シェアフルシフト実績）');
  eq(v.dbcalc_period_start, '');
  eq(v.dbcalc_period_end, '');
  eq(v.dbcalc_day[0].date, '');
  eq(v.dbcalc_busy_reg_days, 0);
  eq(v.dbcalc_band_total_all, 0);
  deq(v.dbcalc_month_label, ['', '', '', '', '', '']);
  deq(v.dashbottom_month_label, ['月1（未貼付）', '月2（未貼付）', '月3（未貼付）', '月4（未貼付）', '月5（未貼付）', '月6（未貼付）']);
  eq(v.dashtop_badge, '－');
  eq(v.dashtop_ring_center_value_text, '－');
  eq(view(W, '').dashtop_staff_box, AE.view.PROMPT);
});
test('selected staff with no confirmed shift (O = 0): 0日 tiles, blank rates, 対象期間に確定シフトがありません。', () => {
  const W = wb([[
    ...person('100', 'テスト甲', 2026, 9, 10, 0),
    work('700', 'テスト却下のみ', [2026, 9, 5], { '応募ステータス': '却下（シフト作成）' }),
  ]]);
  const v = view(W, 'テスト却下のみ');
  eq(v.dbcalc_sel_emp_no, 700);
  eq(v.dbcalc_sel_confirmed_days, 0);
  eq(v.dashtop_kpi_work_days_text, '0日');
  eq(v.dashtop_kpi_att_rate_text, '');
  eq(v.dashtop_kpi_abs_days_text, '0日');
  eq(v.dashtop_kpi_abs_rate_text, '');
  eq(v.dashtop_kpi_hours_text, '0.0h');
  eq(v.dashtop_kpi_busy_rate_text, '');
  eq(v.dashtop_kpi_work_days_sub, '確定シフト 0日');
  eq(v.dashtop_kpi_att_rate_sub, '');
  eq(v.dashtop_kpi_abs_days_sub, '当日の休み変更');
  eq(v.dashtop_kpi_hours_sub, '');
  assert.ok(/^0日／平均 /.test(v.dashtop_kpi_busy_rate_sub));   // shown although the tile is blank (40:Q23)
  eq(v.dashtop_summary, '対象期間に確定シフトがありません。');
  eq(v.dashtop_ring_legend_work, '● 出勤 0%');
  eq(v.dashtop_ring_legend_abs, '● 欠勤 0%');
  eq(v.dashtop_badge, '－');
  eq(v.dashtop_info_months, '1/1ヶ月');
  eq(v.dashtop_timing_late, '0日 0.0%');
  eq(v.dashtop_rest_count_text['当日'], '0日');
  eq(v.dashbottom_month_work_days_text[0], '0日');               // the staff has a row in the month (50:Q7)
  eq(v.dashbottom_month_att_rate[0], '－');
  eq(v.dashbottom_month_avg_hours_text[0], '－');
  eq(v.dashbottom_month_work_days[1], '—');                      // no row in an unpasted month
  eq(v.dashbottom_month_total_att_rate, '－');
  eq(v.dashbottom_abs_row[0].date, '該当なし');
  eq(v.dashbottom_abs_row[0].weekday, '');
});

// ================================================================ settings quirks
test('blank その他 label (B33) becomes the number 0 (DB-Q5); blank thresholds read as 0 (DB-Q20)', () => {
  const W = wb([[...person('100', 'テスト甲', 2026, 9, 20, 2, { '募集シフトの職種': '99テスト謎' })]],
    { jobOtherLabel: '', rateGood: '', alertRate: '' });
  const v = view(W, 'テスト甲');
  eq(v.dbcalc_job_label[20], 0);
  eq(v.dbcalc_job_top_label, 0);
  eq(v.dashtop_job_center_value, 0);
  eq(v.dashtop_job_center_value_text, '0');
  eq(v.dashtop_job_legend_slot[0], '0 100%');
  eq(v.dashtop_job_legend_slot_color[0], AE.view.CAT_TXT[20]);
  eq(v.dbcalc_thr_good, 0);
  eq(v.dbcalc_alert_thr, 0);
  eq(v.dashtop_badge, '◎ 良好');                                 // every rate ≥ 0
  eq(v.dashtop_badge_criteria, '◎ 0%以上／△ 90%以上');
  eq(v.dashtop_warning, '⚠ 当日欠勤率 9.1% が基準（0%以上）に達しています。');
  eq(v.dashtop_kpi_abs_alert, true);
  // the list shows an unregistered job code raw, not as その他 (50:Q5)
  eq(v.dashbottom_abs_row[0].job_label, '99テスト謎');
});
test('job legend: the first 6 positive categories in 設定 order, その他 last (DB-Q6); zero shares unlabeled', () => {
  const codes = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8'];
  const jobs = AE.api.defaultSettings().jobs.map((j, i) => (i < 8 ? { code: codes[i], label: 'ラベル' + (i + 1) } : { code: '', label: '' }));
  const rows = [];
  codes.forEach((c, i) => { for (let d = 0; d <= i; d++) rows.push(work('100', 'テスト甲', [2026, 9, 1 + (rows.length % 28)], { '募集シフトの職種': c })); });
  const W = wb([rows], { jobs });
  const v = view(W, 'テスト甲');
  deq(v.dbcalc_job_legend_idx.slice(0, 9), [1, 2, 3, 4, 5, 6, 7, 8, '']);
  eq(v.dashtop_job_legend_slot.length, 6);
  eq(v.dashtop_job_legend_slot[0], 'ラベル1 3%');
  eq(v.dashtop_job_legend_slot[5], 'ラベル6 17%');
  eq(v.dbcalc_job_top_label, 'ラベル8');                         // top = the most hours, even outside the legend
  eq(v.dbcalc_job_hours[20], 0);
  eq(v.dashtop_job_share_text[20], '');                          // 0%;;; hides exact zero
  eq(v.dashtop_job_share_text[0], '3%');
});
test('その他 = MAX(0, R − Σ categories) has no float residue (DB-Q4 / OQ3)', () => {
  // 7:50 shifts with 13-minute breaks split over three codes: hours are not binary fractions
  const rows = [];
  const cs = ['02コンセ', '03フロア', '04ストア'];
  for (let d = 1; d <= 27; d++) {
    rows.push(work('100', 'テスト甲', [2026, 9, d], { '募集シフトの職種': cs[d % 3], '募集シフトの開始時間': '9:10',
      '募集シフトの終了時間': '17:00', '休憩1開始時間': '12:00', '休憩1終了時間': '12:13' }));
  }
  const W = wb([rows]);
  const v = view(W, 'テスト甲');
  eq(v.dbcalc_job_other_hours, 0);
  eq(v.dbcalc_job_pos_seq[20], '');
  assert.ok(!v.dashtop_job_legend_slot.some((t) => /^その他 /.test(t)));
  const sum = v.dbcalc_job_hours.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - W.roster.master[0].work_hours) < 1e-9);
});

// ================================================================ arrays beyond the A4 caps (scope decision 1)
test('more than 12 list items: every item is in dashbottom_abs_row, the page note says ほか N 件', () => {
  const W = wb([[...person('100', 'テスト甲', 2026, 9, 5, 15)]]);
  const v = view(W, 'テスト甲');
  eq(v.dbcalc_list_count, 15);
  eq(v.dbcalc_list.length, 12);
  eq(v.dbcalc_list_all.length, 15);
  eq(v.dashbottom_abs_row.length, 15);
  eq(v.dashbottom_abs_row[11].extra, false);
  eq(v.dashbottom_abs_row[12].extra, true);
  eq(v.dashbottom_abs_row[14].kind_label, '欠勤');
  eq(v.dashbottom_abs_row[14].red, true);
  eq(v.dashbottom_abs_row[14].new_time, '休み');
  eq(v.dashbottom_abs_row[14].date_text, '9/20');
  eq(v.dashbottom_abs_footnote.indexOf('ほか 3 件（表示は最初の12件）。'), 0);
  // W / AA11 / AA12 of the view = the layer-1 hook for the same AC3
  const hook = AE.api.selectionColumns(W, v.dbcalc_sel_emp_no);
  deq(v.ingest_chk_sel_list_count, hook.map((s) => s.AA11));
  deq(v.ingest_chk_sel_list_offset, hook.map((s) => s.AA12));
  deq(v.ingest_row_sel_list_seq[0], hook[0].W);
});
test('busy days: every 連休 / missed date is kept, the sheet arrays stay 6 / 24, rows / cells are padded', () => {
  // Sep 2026 – Feb 2027 with nobody working on any registered day
  const months = [[2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1], [2027, 2]];
  const W = wb(months.map(([y, m]) => [work('100', 'テスト甲', [y, m, 6])]));     // the 6th is never a registered day
  const v = view(W, 'テスト甲');
  eq(v.dbcalc_long_run.length, 6);
  eq(v.dbcalc_missed_busy.length, 24);
  eq(v.dbcalc_long_run_all.length, v.dbcalc_long_run_count);
  eq(v.dbcalc_missed_busy_all.length, v.dbcalc_busy_not_worked);
  eq(v.dashbottom_busy_run_row.length, Math.max(6, v.dbcalc_long_run_count));
  eq(v.dashbottom_busy_missed_cell.length, Math.max(24, v.dbcalc_busy_not_worked));
  eq(v.dashbottom_busy_missed_grid[0].length, 3);
  eq(v.dbcalc_busy_worked, 0);
  eq(v.dbcalc_busy_not_worked, v.dbcalc_busy_reg_days);
  assert.ok(/^9\/21（月） 敬老の日$/.test(v.dashbottom_busy_missed_cell[0]));
  eq(v.dashbottom_busy_run_row[0].period, '9/19（土）〜9/23（水）');
  eq(v.dashbottom_busy_run_row[0].names, '敬老の日 ほか');
  eq(v.dashbottom_busy_run_row[0].len_text, '5日');
  eq(v.dashbottom_busy_run_row[0].worked_text, '0日');
});

// ================================================================ style flags (40 §5.5, §6, §8.1; 50 §3.4)
test('style flags: badge ref / good / warn / crit, KPI rate colour, alert tile, month CF', () => {
  const W = wb([[
    ...person('100', 'テスト良', 2026, 9, 20, 0),
    ...person('200', 'テスト注', 2026, 9, 19, 1),          // 95% → ◎
    ...person('300', 'テスト悪', 2026, 9, 17, 3),          // 85% → ✕
    ...person('400', 'テスト少', 2026, 9, 3, 1),           // O = 4 < 20 → 参考値
    ...person('500', 'テスト中', 2026, 9, 37, 3, { '募集シフトの日付': undefined }).map((r, i) =>
      Object.assign(r, { '募集シフトの日付': `2026/9/${1 + (i % 30)}` })),
  ]]);
  const good = view(W, 'テスト良'), bad = view(W, 'テスト悪'), few = view(W, 'テスト少'), ok = view(W, 'テスト注');
  eq(good.dashtop_badge_style, 'good'); eq(good.dashtop_badge, '◎ 良好'); eq(good.dashtop_badge_fill, '8FCBA3');
  eq(ok.dashtop_badge_style, 'good');                       // 19/20 = 0.95 ≥ 0.95 exactly (50 §3.4)
  eq(bad.dashtop_badge_style, 'crit'); eq(bad.dashtop_badge, '✕ 要改善'); eq(bad.dashtop_badge_font, 'FFFFFF');
  eq(few.dashtop_badge_style, 'ref'); eq(few.dashtop_badge, '参考値'); eq(few.dashtop_badge_criteria, '確定 4日（20日未満）');
  eq(few.dashtop_kpi_att_rate_color, 'crit');               // the rate colour ignores 参考値 (40:Q2)
  eq(bad.dashtop_kpi_abs_alert, true);
  eq(good.dashtop_kpi_abs_alert, false);
  eq(bad.dashtop_warning, '⚠ 当日欠勤率 15.0% が基準（5%以上）に達しています。');
  eq(bad.dashtop_ring_center_color, 'crit');
  eq(good.dashtop_ring_center_color, 'good');
  eq(bad.dashbottom_month_att_rate_color[0], 'crit');
  eq(bad.dashbottom_month_total_att_rate_color, 'crit');
  eq(bad.dashbottom_month_abs_red[0], true);
  eq(good.dashbottom_month_abs_red[0], false);
  eq(bad.dashbottom_month_bar_pct[0], 10 + 80 * 17 / 31);
  eq(bad.dashbottom_month_bar_pct[1], null);
  eq(AE.view.STATE_COLORS[bad.dashtop_kpi_att_rate_color], 'C9575A');
});
test('chart data: ring / month / job / weekday / radar arrays and colours', () => {
  const W = wb([THEATRE]);
  const v = view(W, 'テスト乙');
  deq(v.dashtop_chart_ring.values, [18, 2]);
  deq(v.dashtop_chart_ring.colors, ['7EB2E6', 'DC8E8E']);
  eq(v.dashtop_chart_month.categories[0], '9月');
  eq(v.dashtop_chart_month.series[0].values[0], 18);
  eq(v.dashtop_chart_month.series[0].labels[1], '');            // 0;;; hides zero
  eq(v.dashtop_chart_job.values.length, 21);
  eq(v.dashtop_chart_job.colors[20], 'A9B4C2');
  eq(v.dashtop_chart_weekday.colors[5], '4E8CD6');
  eq(v.dashtop_chart_weekday.labels.length, 7);
  eq(v.dashtop_chart_radar.series.length, 3);
  const s = v.dashtop_chart_radar.series[0].values.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s - 1) < 1e-12);
  eq(v.dashtop_radar_table.self.length, 5);
  assert.ok(v.dashtop_radar_table.self.every((t) => /^\d+%$/.test(t)));
});

console.log(`unit_view: ${n - failed}/${n} passed`);
process.exitCode = failed ? 1 : 0;
