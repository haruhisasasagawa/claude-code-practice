#!/usr/bin/env node
'use strict';
/* Unit tests for engine layer 1 (ingest / calc / holidays / settings) — behaviour the golden workbooks do not reach:
 * generator crashes (impossible dates), Excel-only error cases (10:Q3, Q11), decoding, coercion helpers.
 *   node test/unit_ingest.js
 * Synthetic data only.
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
const X = AE.calc.xl;

let n = 0, failed = 0;
function test(name, fn) {
  n++;
  try { fn(); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e && e.message ? e.message.split('\n').join('\n     ') : e}`); }
}
const code = (v) => (X.isErr(v) ? v.code : v);

// ---------------------------------------------------------------- helpers to build synthetic CSV text
const H = AE.csv.CSV_HEADERS;
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
function csvText(rows, header) {
  header = header || H;
  const lines = [header.map(q).join(',')];
  for (const r of rows) lines.push(header.map((h) => q(r[h] == null ? '' : r[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}
function rec(o) {
  return Object.assign({
    '募集シフトの日付': '2026/09/01', '応募ステータス': '確定（シフト作成）', '募集シフトの開始時間': '10:00',
    '募集シフトの終了時間': '18:00', '募集シフトの職種': '02コンセ', '応募者の名前': 'テスト一郎T',
    '応募者の従業員番号': '9000001', '応募者の職種': '02コンセ', '更新時間': '1787141961390', '勤務種別': '1',
  }, o);
}
const sheetOf = (text, settings, hol) => AE.calc.buildSheet(1, { name: 't.csv', text }, settings || AE.api.defaultSettings(), hol || new Set());

// ---------------------------------------------------------------- decode / parse / paste
test('decode: UTF-8 with BOM, UTF-8, Shift_JIS fallback', () => {
  const s = '募集シフトの日付,a\r\n';
  const utf8 = Buffer.from(s, 'utf8');
  assert.strictEqual(AE.api.decode(new Uint8Array(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), utf8]))), s);
  assert.strictEqual(AE.api.decode(new Uint8Array(utf8)), s);
  // "確定" in Shift_JIS = 8A 6D 92 E8
  assert.strictEqual(AE.api.decode(new Uint8Array([0x8A, 0x6D, 0x92, 0xE8])), '確定');
  // only one BOM is stripped (utf-8-sig)
  assert.strictEqual(AE.api.decode(new Uint8Array([0xEF, 0xBB, 0xBF, 0xEF, 0xBB, 0xBF, 0x61])), '﻿a');
});

test('parse: empty lines are [] records, no extra record for the final newline, quoted newlines kept', () => {
  assert.deepStrictEqual(AE.csv.parse('a,b\r\n\r\n"x\ny",z\n'), [['a', 'b'], [], ['x\ny', 'z']]);
  assert.deepStrictEqual(AE.csv.parse(''), []);
  assert.deepStrictEqual(AE.csv.parse('a,"b"c,"d""e"\r'), [['a', 'bc', 'd"e']]);
  assert.deepStrictEqual(AE.csv.parse('"open'), [['open']]);
});

test('pasteValue: dates, times, numbers, text (generator regexes)', () => {
  assert.strictEqual(AE.csv.pasteValue(''), null);
  assert.strictEqual(AE.csv.pasteValue('2026/09/01'), 46266);
  assert.strictEqual(AE.csv.pasteValue('２０２６/9/1'), 46266);            // Python \d matches full-width digits
  assert.strictEqual(AE.csv.pasteValue('2026/09/01\n'), 46266);           // "$" matches before a final \n
  assert.strictEqual(AE.csv.pasteValue('2026/02/30'), '2026/02/30');      // impossible date: text (generator crashes)
  assert.strictEqual(AE.csv.pasteValue('29:00'), 29 / 24);
  assert.strictEqual(AE.csv.pasteValue('5:00:00'), '5:00:00');
  assert.strictEqual(AE.csv.pasteValue('0561306'), 561306);
  assert.strictEqual(AE.csv.pasteValue('1.50'), 1.5);
  assert.strictEqual(AE.csv.pasteValue(' 12'), ' 12');
});

// ---------------------------------------------------------------- coercion helpers
test('xl helpers: VALUE, DATEVALUE, General text, ROUND, WEEKDAY', () => {
  assert.strictEqual(X.value(' 561306'), 561306);
  assert.strictEqual(X.value('1,234'), 1234);
  assert.strictEqual(X.value('12%'), 0.12);
  assert.strictEqual(X.value('5:00:00'), 5 / 24);
  assert.strictEqual(X.value('2026-09-01'), 46266);
  assert.strictEqual(X.value(null), 0);
  assert.throws(() => X.value('abc'));
  assert.strictEqual(X.dateValue('2026年9月1日'), 46266);
  assert.strictEqual(X.dateValue('2026/9/1 10:00'), 46266);
  assert.throws(() => X.dateValue('2026/02/30'));
  assert.throws(() => X.dateValue(null));
  assert.strictEqual(X.text(2), '2');
  assert.strictEqual(X.text(0.1 + 0.2), '0.3');
  assert.strictEqual(X.text(1 / 3), '0.333333333333333');
  assert.strictEqual(X.text(1e20), '1E+20');
  assert.strictEqual(X.text(null), '');
  assert.strictEqual(X.round(2.5), 3);
  assert.strictEqual(X.round(-2.5), -3);
  assert.strictEqual(X.round(29.999999999999996), 30);
  assert.strictEqual(X.weekday(46266, 1), 3);           // 2026-09-01 is a Tuesday
  assert.strictEqual(X.weekday(46266, 2), 2);
  assert.strictEqual(X.weekday(0, 1), 7);               // Excel: serial 0 is a Saturday
  assert.throws(() => X.weekday(20260901, 1));          // beyond 9999-12-31 → #NUM! (10:Q11)
});

// ---------------------------------------------------------------- calc sheet behaviour
test('per-row: rows below the data carry T; empty CSV keeps the template header (AA2 TRUE)', () => {
  const sh = AE.calc.buildSheet(2, null, AE.api.defaultSettings(), new Set());
  assert.strictEqual(sh.colmap_ok, true);
  assert.strictEqual(sh.rows.length, 0);
  assert.strictEqual(sh.staffCount, 0);
  assert.deepStrictEqual([sh.checks.AA6, sh.checks.AA7, sh.checks.AA8, sh.checks.AA9], ['', 0, 0, 0]);
});

test('impossible date stays text → B "", counted by AA8, key "n_" (10:Q20)', () => {
  const sh = sheetOf(csvText([rec({ '募集シフトの日付': '2026/02/30' }), rec({})]));
  const r = sh.rows[0];
  assert.strictEqual(r.B, '');
  assert.strictEqual(r.E, 0);
  assert.strictEqual(r.O, '');
  assert.strictEqual(r.BC, 0);
  assert.strictEqual(r.BL, '9000001_');
  assert.strictEqual(sh.checks.AA8, 1);
  assert.strictEqual(sh.rows[1].H, 1);
});

test('numeric out-of-range date: O and BC are errors, H still 1 (10:Q11)', () => {
  const sh = sheetOf(csvText([rec({ '募集シフトの日付': '20260901' })]));
  const r = sh.rows[0];
  assert.strictEqual(r.B, 20260901);
  assert.strictEqual(code(r.O), '#NUM!');
  assert.strictEqual(code(r.BC), '#NUM!');
  assert.strictEqual(r.H, 1);
  assert.strictEqual(sh.checks.AA6, '');                // median beyond 9999-12-31 → YEAR fails → ""
});

test('missing needed header → whole month blank (10:Q1)', () => {
  const hdr = H.slice(); hdr[33] = '区分';
  const sh = sheetOf(csvText([rec({})], hdr));
  assert.strictEqual(sh.colmap_ok, false);
  assert.strictEqual(sh.map.AT, 0);
  assert.strictEqual(sh.rows[0].A, '');
  assert.strictEqual(sh.rows[0].T, 0);
  assert.deepStrictEqual([sh.checks.AA6, sh.checks.AA7, sh.checks.AA8, sh.checks.AA9], ['', 0, 0, 0]);
});

test('needed column beyond AZ → #REF! (10:Q3)', () => {
  const pad = Array.from({ length: 30 }, (_, i) => 'x' + i);
  const hdr = H.map((h) => (h === '応募者の従業員番号' ? 'old' : h)).concat(pad, ['応募者の従業員番号']);   // column 65
  const r0 = rec({}); r0['応募者の従業員番号'] = '9000001';
  const sh = sheetOf(csvText([r0], hdr));
  assert.strictEqual(sh.colmap['応募者の従業員番号'], 65);
  assert.strictEqual(code(sh.rows[0].A), '#REF!');
  assert.strictEqual(code(sh.rows[0].B), '#REF!');
  assert.strictEqual(code(sh.checks.AA8), '#REF!');
});

test('wildcard header match, short header keeps template defaults (10 §3.1, Q2)', () => {
  const hdr = H.slice(0, 33); hdr[2] = ' 応募ステータス ';
  const sh = sheetOf(csvText([rec({ '勤務種別': '1' })], hdr));
  assert.strictEqual(sh.map.AC, 3);
  assert.strictEqual(sh.map.AT, 34);                    // template header 勤務種別 at AH1
  assert.strictEqual(sh.rows[0].D, 0);                  // …over empty data
  assert.strictEqual(sh.rows[0].E, 0);
});

test('night hours: blank 設定!B7/B8 are ignored by MIN/MAX (10:Q6); integer-minute hours (Q17)', () => {
  const r = rec({ '募集シフトの開始時間': '21:00', '募集シフトの終了時間': '29:00', '休憩1開始時間': '25:00', '休憩1終了時間': '26:00' });
  const s1 = sheetOf(csvText([r]));
  assert.strictEqual(s1.rows[0].N, 6);
  assert.strictEqual(s1.rows[0].M, 7);
  assert.strictEqual(s1.rows[0].BK, 8);
  const st = Object.assign(AE.api.defaultSettings(), { nightStart: '', nightEnd: null });
  const s2 = sheetOf(csvText([r]), st);
  assert.strictEqual(s2.rows[0].N, 7);
  const s3 = sheetOf(csvText([rec({ '募集シフトの開始時間': '14:00', '募集シフトの終了時間': '16:00' })]));
  assert.strictEqual(s3.rows[0].M, 2);                  // not 1.9999999999999982
});

test('busy day: weekend or a numeric holiday entry; text entries never match', () => {
  const hol = AE.holidays.prepare([{ date: 46268, name: 'x' }, { date: '2026/9/2', name: 'text' }]);
  const sh = sheetOf(csvText([rec({ '募集シフトの日付': '2026/09/01' }), rec({ '募集シフトの日付': '2026/09/02' }),
    rec({ '募集シフトの日付': '2026/09/03' }), rec({ '募集シフトの日付': '2026/09/05' })]), null, hol.dates);
  assert.deepStrictEqual(sh.rows.map((r) => r.BC), [0, 0, 1, 1]);
});

test('selection hook: sel "" gives AA11 0 and no W; offsets accumulate over sheets', () => {
  const rest = { '勤務種別': '4', '更新時間': String(Date.UTC(2026, 8, 2, 3)) };   // updated on the shift day (JST)
  const text = csvText([rec(Object.assign({ '募集シフトの日付': '2026/09/02' }, rest)),
    rec(Object.assign({ '募集シフトの日付': '2026/09/01' }, rest, { '更新時間': String(Date.UTC(2026, 8, 1, 3)) }))]);
  const WB = AE.api.build([{ name: 'a', text }, { name: 'b', text }], null, null);
  const none = AE.api.selectionColumns(WB, '');
  assert.deepStrictEqual(none.map((s) => s.AA11), [0, 0, 0, 0, 0, 0]);
  assert.ok(none.every((s) => s.W.every((w) => w === '')));
  const sel = AE.api.selectionColumns(WB, 9000001);
  assert.deepStrictEqual(sel.map((s) => s.AA11), [2, 2, 0, 0, 0, 0]);
  assert.deepStrictEqual(sel.map((s) => s.AA12), [0, 2, 4, 4, 4, 4]);
  assert.deepStrictEqual(sel[0].W, [2, 1]);             // chronological within the sheet
  assert.deepStrictEqual(sel[1].W, [4, 3]);
});

// ---------------------------------------------------------------- holidays / settings / API
test('default holiday list = 263 entries 2025/1/1..2033/1/4 with the documented labels', () => {
  const l = AE.api.defaultHolidays();
  assert.strictEqual(l.length, 263);
  assert.deepStrictEqual(l[0], { date: 45658, name: '元日' });
  assert.deepStrictEqual(l[262], { date: 48583, name: '年末年始' });
  const by = new Map(l.map((e) => [e.date, e.name]));
  assert.strictEqual(by.get(46287), '国民の休日');      // 2026/09/22
  assert.strictEqual(by.get(48580), '年末年始');        // 2033/01/01 (10:Q14)
  assert.strictEqual(by.get(46148), '振替休日');        // 2026/05/06
});

test('holiday checks: text rows, rows below 416, empty list, uncovered year', () => {
  const list = AE.api.defaultHolidays();
  const p1 = AE.holidays.prepare(list.concat([{ date: 'abc', name: '' }]));
  const c1 = AE.holidays.checks(p1, [46266]);
  assert.strictEqual(c1.msg_format, '※ 日付として読めない行が 1 行あります。yyyy/mm/dd の形式で入力し直してください。');
  assert.strictEqual(c1.msg_coverage, '貼付月との対応　2025/1/1 〜 2033/1/4 を登録済み：OK');
  const long = list.concat(Array.from({ length: 140 }, () => ({ date: '', name: '' })), [{ date: 49000, name: 'x' }]);
  const c2 = AE.holidays.checks(AE.holidays.prepare(long), []);
  assert.strictEqual(c2.msg_range, '※ 416行目より下に入力があります。この範囲は集計されません。上の空いている行に移してください。');
  assert.strictEqual(c2.msg_count, '登録されている日付　263件（土日はこの一覧に無くても繁忙日として数えます）');
  const c3 = AE.holidays.checks(AE.holidays.prepare([]), [46266]);
  assert.strictEqual(c3.msg_coverage, '※ 日付が1件も登録されていません。土日だけの集計になります。');
  const c4 = AE.holidays.checks(AE.holidays.prepare(list), ['', 49400]);   // a 2035 month
  assert.strictEqual(c4.msg_coverage, '※ 貼り付けた月の年の祝日が登録されていません。その年の祝日を追加してください（いまは土日だけで数えています）。');
});

test('settings defaults and the order warning (設定!A9)', () => {
  const s = AE.api.defaultSettings();
  assert.strictEqual(s.theatre, 'TOHOシネマズ新宿');
  assert.deepStrictEqual([s.rateGood, s.rateWarn, s.minDays, s.alertRate], [0.95, 0.9, 20, 0.05]);
  assert.strictEqual(s.nightEnd, 29 / 24);
  assert.strictEqual(s.jobs.length, 20);
  assert.strictEqual(s.depts.length, 20);
  assert.deepStrictEqual(s.jobs[5], { code: '07トレーニー', label: 'トレーニー' });
  assert.deepStrictEqual(s.jobs[6], { code: '', label: '' });
  assert.strictEqual(AE.calc.settingsChecks(s).order_warning, '');
  assert.strictEqual(AE.calc.settingsChecks(Object.assign(s, { rateWarn: 0.95 })).order_warning,
    '※ △注意の基準（B4）は ◎良好の基準（B3）より小さくしてください');
});

test('detectMonth: median shift date month, null without readable dates', () => {
  assert.deepStrictEqual(AE.api.detectMonth(csvText([rec({ '募集シフトの日付': '2026/08/31' }), rec({ '募集シフトの日付': '2026/09/02' }),
    rec({ '募集シフトの日付': '2026/09/03' })])), { year: 2026, month: 9 });
  assert.strictEqual(AE.api.detectMonth('a,b\r\n1,2\r\n'), null);
  assert.strictEqual(AE.api.detectMonth(''), null);
});

console.log(`${n - failed}/${n} unit tests passed`);
process.exitCode = failed ? 1 : 0;
