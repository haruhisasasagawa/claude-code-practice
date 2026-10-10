/*
 * 判定エンジンの単体テスト（外部依存なし）
 *   node tests/rules.test.js
 * src/util.js, config.default.js, rules.js, storage.js を vm で読み込み、境界値を検証する。
 * 失敗が 1 件でもあれば exit 1。
 */
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');

const ctx = vm.createContext({ console: console });
ctx.window = ctx;
['util.js', 'config.default.js', 'rules.js', 'storage.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), ctx, { filename: f });
});
const R = ctx.RecruitRules, S = ctx.RecruitStorage;
// vm 内のオブジェクトは別 realm なので、比較用に JSON で持ち出す
const plain = function (o) { return JSON.parse(JSON.stringify(o)); };
const P = function () { return S.defaults(); };
const NOW = new Date(2026, 9, 10); // 2026-10-10 固定
const OPTS = { now: NOW };
const FIX = path.join(__dirname, 'fixtures');

let fails = 0, passes = 0;
function test(name, fn) {
  try { fn(); passes++; console.log('PASS ' + name); }
  catch (e) { fails++; console.log('FAIL ' + name + '\n     ' + (e && e.message ? e.message.split('\n').join('\n     ') : e)); }
}

// ---------- 入力ヘルパー ----------
function emptyApplicant(profile) {
  const shifts = {};
  R.DAYS.forEach(function (d) { shifts[d.key] = { start: '', end: '', nextDay: false }; });
  shifts.any = { start: '', end: '', nextDay: false };
  const vacation = {}, vacationDays = {};
  ((profile.options || {}).vacationItems || []).forEach(function (v) { vacation[v.id] = ''; vacationDays[v.id] = ''; });
  return {
    name: '', gender: '', age: '', category: '', graduationDate: '',
    commuteMethod: '', commuteMinutes: '', nearestStation: '',
    workDays: [], anyDay: false, daysMin: '', daysMax: '',
    shifts: shifts,
    workPeriod: '', sideJob: '', sideJobDetail: '',
    vacation: vacation, vacationDays: vacationDays,
    holidayWork: '', weekendFreq: '',
    allNight: { availability: '', frequency: '', note: '' },
    highschool: { careerDecided: '', careerPath: '', destination: '' },
    continueAfterGraduation: '', sideJobHoursPerWeek: '',
    lateNight: { availability: '', returnMethod: '', lastTrain: '', taxiFare: '' },
    foreign: { isForeign: '', residenceStatus: '', workPermit: '', residenceExpiry: '', japaneseLevel: '' },
    department: '', applicationRoute: '',
    reviewerNotes: ''
  };
}
function merge(base, over) {
  Object.keys(over || {}).forEach(function (k) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], v);
    else base[k] = v;
  });
  return base;
}
// shifts: { mon: ['17:00', '23:30'], ... } を受け取り workDays も設定
function A(over, profile) {
  const a = emptyApplicant(profile || P());
  const o = Object.assign({}, over || {});
  if (o.sh) {
    Object.keys(o.sh).forEach(function (k) {
      a.shifts[k] = { start: o.sh[k][0], end: o.sh[k][1], nextDay: false };
      if (k !== 'any' && a.workDays.indexOf(k) < 0) a.workDays.push(k);
    });
    delete o.sh;
  }
  return merge(a, o);
}
// 繁忙期・祝日・オールナイト・深夜帯などを全部回答済みにする
function allAnswered(over) {
  const base = {
    vacation: { threeday: 'ok', gw: 'ok', summer: 'ok', obon: 'ok', silver: 'ok', yearend: 'ok', spring: 'ok' },
    vacationDays: { threeday: '2', gw: '5', summer: '4', obon: '3', silver: '3', yearend: '4', spring: '3' },
    holidayWork: 'ok', weekendFreq: 'every_both',
    allNight: { availability: 'ok', frequency: 'weekly' },
    lateNight: { availability: 'ok', returnMethod: 'walk_bike' },
    daysMin: '3', daysMax: '4', workPeriod: 'long'
  };
  return merge(base, over || {});
}
function ids(h) { return plain(h.items.map(function (i) { return i.id; })); }
function has(h, id) { return ids(h).indexOf(id) >= 0; }
function item(h, id) { return h.items.find(function (i) { return i.id === id; }); }
function HO(a, p) { return R.buildHandoff(a, p || P(), OPTS); }
function CC(a, p) { return R.computeContribution(a, p || P(), OPTS); }
function part(c, id) { return c.parts.find(function (x) { return x.id === id; }); }
function allChecks(h) { const c = {}; h.items.forEach(function (i) { c[i.id] = true; }); return c; }
function scoresAll(v, p) { const s = {}; (p || P()).evaluation.items.forEach(function (it) { s[it.id] = v; }); return s; }
function scoresTotal(total, p) { // 10 項目 × 5 点で合計 total になる配点
  const s = {}, items = (p || P()).evaluation.items; let rest = total;
  items.forEach(function (it) { const v = Math.min(5, rest); s[it.id] = v; rest -= v; });
  return s;
}
function judge(a, scores, p, checksFn) {
  p = p || P();
  const h = HO(a, p);
  const checks = checksFn ? checksFn(h) : allChecks(h);
  return R.evaluateHiring(a, scores, p, h, checks, OPTS);
}

// 例A（SPEC 4-4。e2e 主シナリオ）
function exampleA() {
  return A({
    name: '佐藤 花子', age: '21', category: '大学3年生', graduationDate: '2027-03', workPeriod: 'mid',
    sh: { mon: ['17:00', '23:30'], wed: ['10:00', '12:00'], fri: ['18:00', '01:00'], sat: ['08:00', '17:00'] },
    daysMin: '2', daysMax: '4',
    lateNight: { availability: 'ok', returnMethod: 'taxi', taxiFare: '3800' },
    vacation: { threeday: 'ok', gw: 'ok', summer: 'ok', obon: 'consult', silver: 'ng', yearend: 'ok', spring: 'consult' },
    vacationDays: { threeday: '2', gw: '5', summer: '3', obon: '2', yearend: '4', spring: '2' },
    holidayWork: 'ok', weekendFreq: 'every_one',
    allNight: { availability: 'consult', frequency: 'monthly' }
  });
}
// 例B（面接高 × 貢献低）
function exampleB() {
  return A({
    name: '例B', age: '25', category: 'フリーター', workPeriod: 'long',
    sh: { mon: ['10:00', '16:00'], tue: ['10:00', '16:00'], wed: ['10:00', '16:00'] },
    daysMin: '2', daysMax: '3',
    lateNight: { availability: 'ng' },
    vacation: { threeday: 'consult', gw: 'ng', summer: 'ng', obon: 'ng', silver: 'ng', yearend: 'ng', spring: 'ng' },
    vacationDays: { threeday: '1' },
    holidayWork: 'ng',
    allNight: { availability: 'ng' }
  });
}
// 面接高 × 貢献高（全回答・土日・オープン/クローズあり）
function strongApplicant(over) {
  return A(merge(allAnswered({
    age: '21', category: 'フリーター',
    sh: { fri: ['17:00', '23:00'], sat: ['08:00', '23:00'], sun: ['08:00', '23:00'] }
  }), over || {}));
}

// ======================================================================
test('01 法定深夜の境界 17:00-22:00 / 22:01', function () {
  assert.strictEqual(R.analyzeShifts(A({ sh: { mon: ['17:00', '22:00'] } }), P()).hasLegalNight, false);
  assert.strictEqual(R.analyzeShifts(A({ sh: { mon: ['17:00', '22:01'] } }), P()).hasLegalNight, true);
});

test('02 早朝勤務の検出（isLateNight の回帰）', function () {
  const s1 = R.analyzeShifts(A({ sh: { mon: ['05:00', '09:00'] } }), P());
  const s2 = R.analyzeShifts(A({ sh: { mon: ['04:59', '09:00'] } }), P());
  const s3 = R.analyzeShifts(A({ sh: { mon: ['00:30', '05:00'] } }), P());
  assert.deepStrictEqual([s1.hasLegalNight, s2.hasLegalNight, s3.hasLegalNight], [false, true, true]);
  assert.strictEqual(s3.isLateNight, true);
  assert.strictEqual(s1.isLateNight, false);
});

test('03 年少者の深夜（17歳 大学1年 18:00-22:30 / 18歳）', function () {
  const h = HO(A({ age: '17', category: '大学1年生', sh: { mon: ['18:00', '22:30'] } }));
  assert.ok(has(h, 'minor_late_night'), ids(h).join(','));
  assert.ok(has(h, 'age_category_mismatch'));
  assert.ok(item(h, 'minor_late_night').text.indexOf('17歳') >= 0);
  const h2 = HO(A({ age: '18', category: '大学1年生', sh: { mon: ['18:00', '22:30'] } }));
  assert.ok(!has(h2, 'minor_late_night'));
  assert.ok(!has(h2, 'age_category_mismatch'));
});

test('04 年少者の深夜帯希望のみ（シフト〜21:00・深夜帯△）', function () {
  const h = HO(A({ age: '17', category: 'フリーター', sh: { mon: ['17:00', '21:00'] }, lateNight: { availability: 'consult' } }));
  assert.ok(has(h, 'minor_late_night'));
  assert.ok(item(h, 'minor_late_night').text.indexOf('『△ 要相談』') >= 0);
  assert.ok(!has(h, 'late_night_consult'));
});

test('05 高校2年は原則対象外の要判断だけ', function () {
  const h = HO(A({ age: '16', category: '高校2年生' }));
  const hsIds = ids(h).filter(function (id) { return /^hs_|^highschool_/.test(id); });
  assert.deepStrictEqual(hsIds, ['hs_out_of_policy']);
  assert.strictEqual(item(h, 'hs_out_of_policy').severity, 'block');
  assert.strictEqual(R.highschoolStatus(A({ category: '高校1年生' }), P()).status, 'excluded');
});

test('06 高3 例外充足', function () {
  const a = A({ age: '17', category: '高校3年生', highschool: { careerDecided: 'yes', careerPath: 'university', destination: '〇〇大学' }, continueAfterGraduation: 'yes' });
  const st = R.highschoolStatus(a, P());
  assert.strictEqual(st.status, 'exception_met');
  assert.strictEqual(st.unmet.length, 0);
  const h = HO(a);
  assert.ok(has(h, 'hs_exception_ok'));
  assert.ok(!has(h, 'hs_exception_unmet'));
  assert.ok(item(h, 'hs_exception_ok').text.indexOf('大学・短大へ進学') >= 0);
});

test('07 高3 例外未充足（未決定／就職／継続未定／全部空）', function () {
  const base = { age: '17', category: '高校3年生' };
  const cases = [
    [{ highschool: { careerDecided: 'no' }, continueAfterGraduation: 'yes' }, '進路が未決定', 'exception_unmet'],
    [{ highschool: { careerDecided: 'yes', careerPath: 'employment' }, continueAfterGraduation: 'yes' }, '進路が『就職』（例外の対象外）', 'exception_unmet'],
    [{ highschool: { careerDecided: 'yes', careerPath: 'university' }, continueAfterGraduation: 'undecided' }, '卒業後の継続が未定', 'exception_unmet'],
    [{}, '進路決定の有無が未入力', 'exception_incomplete']
  ];
  cases.forEach(function (cs) {
    const a = A(Object.assign({}, base, cs[0]));
    assert.strictEqual(R.highschoolStatus(a, P()).status, cs[2]);
    const h = HO(a);
    assert.ok(has(h, 'hs_exception_unmet'), JSON.stringify(cs[0]));
    assert.ok(item(h, 'hs_exception_unmet').text.indexOf(cs[1]) >= 0, item(h, 'hs_exception_unmet').text);
    assert.ok(!has(h, 'hs_exception_ok'));
  });
  const all = R.highschoolStatus(A(base), P());
  assert.strictEqual(all.reasonsText, '進路決定の有無が未入力・卒業後の継続意思が未入力');
});

test('08 mode allow / deny', function () {
  const p = P(); p.highschoolPolicy.mode = 'allow';
  const h = HO(A({ age: '16', category: '高校2年生' }), p);
  assert.ok(!ids(h).some(function (id) { return /^hs_/.test(id); }), ids(h).join(','));
  assert.ok(has(h, 'highschool_permission'));
  const p2 = P(); p2.highschoolPolicy.mode = 'deny';
  const a = A({ age: '17', category: '高校3年生', highschool: { careerDecided: 'yes', careerPath: 'university' }, continueAfterGraduation: 'yes' });
  const h2 = HO(a, p2);
  assert.ok(has(h2, 'hs_out_of_policy'));
  assert.ok(!has(h2, 'hs_exception_ok'));
});

test('09 例外要件 OFF（requireContinue=false・継続空）', function () {
  const p = P(); p.highschoolPolicy.requireContinue = false;
  const a = A({ age: '17', category: '高校3年生', highschool: { careerDecided: 'yes', careerPath: 'vocational' } });
  assert.strictEqual(R.highschoolStatus(a, p).status, 'exception_met');
});

test('10 18歳の高3（深夜帯○・オールナイト○）', function () {
  const a = A({ age: '18', category: '高校3年生', allNight: { availability: 'ok', frequency: 'weekly' }, lateNight: { availability: 'ok', returnMethod: 'train' } });
  const h = HO(a);
  assert.ok(has(h, 'hs_night_policy'));
  assert.strictEqual(item(h, 'hs_night_policy').severity, 'block');
  assert.ok(item(h, 'hs_night_policy').text.indexOf('深夜帯の希望が『○ 可能』、オールナイトの希望が『○ 可能』') >= 0);
  ['allnight_minor', 'allnight_ok', 'minor_late_night'].forEach(function (id) { assert.ok(!has(h, id), id); });
  assert.ok(!ids(h).some(function (id) { return /^late_night_/.test(id); }), ids(h).join(','));
  const an = part(CC(a), 'allNight');
  assert.strictEqual(an.score, 0);
  assert.ok(an.flags.indexOf('restricted') >= 0);
  const p = P(); p.highschoolPolicy.nightRestricted = false;
  const h2 = HO(a, p);
  assert.ok(has(h2, 'allnight_ok'));
  assert.ok(!has(h2, 'hs_night_policy'));
  assert.ok(part(CC(a, p), 'allNight').score > 0);
});

test('11 年少者のオールナイト・クローズは22:00まで加点', function () {
  const a = A({ age: '17', category: '高校3年生', allNight: { availability: 'ok', frequency: 'weekly' }, sh: { mon: ['17:00', '22:00'] } });
  const h = HO(a);
  assert.ok(has(h, 'allnight_minor'));
  assert.strictEqual(item(h, 'allnight_minor').severity, 'block');
  const c = CC(a);
  assert.strictEqual(part(c, 'allNight').score, 0);
  assert.ok(part(c, 'allNight').flags.indexOf('restricted') >= 0);
  assert.strictEqual(part(c, 'close').ratio, 0.5);  // 1日 / 目標2日
  const c2 = CC(A({ age: '17', category: '高校3年生', sh: { mon: ['17:00', '23:00'] } }));
  assert.strictEqual(part(c2, 'close').ratio, 0);
  // 18歳以上の大学生なら 23:00 終了もクローズに数える
  const c3 = CC(A({ age: '20', category: '大学2年生', sh: { mon: ['17:00', '23:00'] } }));
  assert.strictEqual(part(c3, 'close').ratio, 0.5);
});

test('12 深夜帯× × オールナイト○', function () {
  const h = HO(A({ age: '21', category: '大学3年生', lateNight: { availability: 'ng' }, allNight: { availability: 'ok', frequency: 'monthly' } }));
  assert.ok(has(h, 'allnight_latenight_conflict'));
  assert.ok(has(h, 'allnight_ok'));
});

test('13 終電 × 最も遅い終了（23:30・余裕15分）', function () {
  const expect = { '23:45': false, '23:44': true, '00:20': false, '04:59': false, '05:00': true };
  Object.keys(expect).forEach(function (lt) {
    const a = A({ age: '21', category: '大学3年生', sh: { mon: ['17:00', '23:30'] }, lateNight: { availability: 'ok', returnMethod: 'train', lastTrain: lt } });
    assert.strictEqual(R.lastTrainCheck(a, P()).conflict, expect[lt], lt);
    assert.strictEqual(has(HO(a), 'late_night_last_train_early'), expect[lt], lt);
  });
  const h = HO(A({ age: '21', category: '大学3年生', sh: { mon: ['17:00', '23:30'] }, lateNight: { availability: 'ok', returnMethod: 'train', lastTrain: '23:40' } }));
  assert.ok(item(h, 'late_night_last_train_early').text.indexOf('（23:30）から終電（23:40）まで15分') >= 0);
  // 標準終了時刻（P1）
  const p = P(); p.params.closeShiftStandardEnd = '00:30';
  const a2 = A({ age: '21', category: '大学3年生', sh: { mon: ['17:00', '22:00'] }, lateNight: { availability: 'ok', returnMethod: 'train', lastTrain: '00:35' } });
  assert.strictEqual(R.lastTrainCheck(a2, P()).conflict, false);
  assert.strictEqual(R.lastTrainCheck(a2, p).conflict, true);
});

test('14 曜日数 × 週日数', function () {
  const w = function (o) { return plain(R.weeklyDaysCheck(A(o))); };
  const c1 = w({ workDays: ['mon', 'tue', 'wed'], daysMax: '3' });
  const c2 = w({ workDays: ['mon', 'tue', 'wed'], daysMax: '4' });
  const c3 = w({ anyDay: true, daysMax: '7' });
  const c4 = w({ workDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], daysMin: '5', daysMax: '3' });
  assert.deepStrictEqual([c1.mismatch, c1.order], [false, false]);
  assert.deepStrictEqual([c2.mismatch, c2.order], [true, false]);
  assert.deepStrictEqual([c3.mismatch, c3.order], [false, false]);
  assert.deepStrictEqual([c4.mismatch, c4.order], [false, true]);
  const h = HO(A({ workDays: ['mon', 'tue', 'wed'], daysMin: '2', daysMax: '4' }));
  assert.ok(item(h, 'weekly_days_mismatch').text.indexOf('勤務可能曜日 3日分・週2〜4日') >= 0);
});

test('15 卒業までの残月数 × 勤務期間（graduation_midterm 一般化）', function () {
  const cases = [['2027-03', 'mid', '', true], ['2027-04', 'mid', '', false], ['2027-09', 'long', '', true], ['2027-10', 'long', '', false], ['2027-03', 'mid', 'yes', false]];
  cases.forEach(function (cs) {
    const h = HO(A({ age: '21', category: '大学3年生', graduationDate: cs[0], workPeriod: cs[1], continueAfterGraduation: cs[2] }));
    assert.strictEqual(has(h, 'graduation_midterm'), cs[3], cs.join(' '));
  });
  const h = HO(A({ age: '21', category: '大学3年生', graduationDate: '2027-03', workPeriod: 'mid' }));
  assert.ok(item(h, 'graduation_midterm').text.indexOf('卒業予定（2027-03）まで約5か月で、希望の勤務期間「中期（半年以上〜1年未満）」（6か月以上）') >= 0);
  // 非学生には出さない
  assert.ok(!has(HO(A({ age: '25', category: 'フリーター', graduationDate: '2027-03', workPeriod: 'mid' })), 'graduation_midterm'));
});

test('16 年齢 × 区分', function () {
  const cases = [['14', '高校1年生', true], ['15', '高校1年生', false], ['19', '高校3年生', false], ['20', '高校3年生', true], ['17', '大学1年生', true]];
  cases.forEach(function (cs) {
    assert.strictEqual(R.ageCategoryCheck(A({ age: cs[0], category: cs[1] }), P()).mismatch, cs[2], cs.join(' '));
  });
  const h = HO(A({ age: '20', category: '高校3年生' }));
  assert.ok(item(h, 'age_category_mismatch').text.indexOf('想定 15〜19歳') >= 0);
  assert.strictEqual(R.ageCategoryCheck(A({ age: '17', category: '大学1年生' }), P()).ageRange, '18歳以上');
});

test('17 繁忙期 critical（夏休み× → vacation_ng / SW× → busy_optional_ng）', function () {
  const h1 = HO(A({ vacation: { summer: 'ng' } }));
  assert.ok(has(h1, 'vacation_ng'));
  assert.ok(!has(h1, 'busy_optional_ng'));
  assert.ok(item(h1, 'vacation_ng').text.indexOf('繁忙期（夏休み期間）') >= 0);
  assert.strictEqual(item(h1, 'vacation_ng').category, 'busy');
  const h2 = HO(A({ vacation: { silver: 'ng' } }));
  assert.ok(has(h2, 'busy_optional_ng'));
  assert.ok(!has(h2, 'vacation_ng'));
  // △ は vacation_consult
  assert.ok(has(HO(A({ vacation: { gw: 'consult' } })), 'vacation_consult'));
});

test('18 外国籍 週24h＋かけもち4h / 5h', function () {
  const base = { age: '22', category: '大学4年生', foreign: { isForeign: 'yes', workPermit: 'yes', residenceExpiry: '2030-01' },
    sh: { mon: ['10:00', '18:00'], tue: ['10:00', '18:00'], wed: ['10:00', '18:00'] }, daysMax: '3', sideJob: 'yes' };
  const h1 = HO(A(Object.assign({}, base, { sideJobHoursPerWeek: '4' })));
  assert.ok(!has(h1, 'foreign_hour_cap_exceeded'));
  const h2 = HO(A(Object.assign({}, base, { sideJobHoursPerWeek: '5' })));
  assert.ok(has(h2, 'foreign_hour_cap_exceeded'));
  assert.ok(item(h2, 'foreign_hour_cap_exceeded').text.indexOf('週29時間目安。うちかけもち5時間') >= 0, item(h2, 'foreign_hour_cap_exceeded').text);
});

test('18b かけもち「なし」に戻したら残った時間を合算しない', function () {
  const base = { age: '22', category: '大学4年生', foreign: { isForeign: 'yes', workPermit: 'yes', residenceExpiry: '2030-01' },
    sh: { mon: ['10:00', '18:00'], tue: ['10:00', '18:00'], wed: ['10:00', '18:00'] }, daysMax: '3', sideJobHoursPerWeek: '10' };
  assert.ok(has(HO(A(Object.assign({}, base, { sideJob: 'yes' }))), 'foreign_hour_cap_exceeded'));
  assert.ok(!has(HO(A(Object.assign({}, base, { sideJob: 'no' }))), 'foreign_hour_cap_exceeded'));
  assert.ok(!has(HO(A(Object.assign({}, base, { sideJob: '' }))), 'foreign_hour_cap_exceeded'));
});

test('18c 深夜帯の帰宅手段が空欄なら late_night_return_unknown（要確認）', function () {
  const base = { age: '22', category: 'フリーター', sh: { fri: ['15:00', '00:30'], sat: ['15:00', '00:30'], sun: ['15:00', '00:30'] } };
  const h0 = HO(A(allAnswered(Object.assign({}, base, { lateNight: { availability: 'ok', returnMethod: '' } }))));
  assert.ok(has(h0, 'late_night_return_unknown'), ids(h0).join(','));
  assert.strictEqual(item(h0, 'late_night_return_unknown').severity, 'warn');
  assert.ok(!has(HO(A(allAnswered(Object.assign({}, base, { lateNight: { availability: 'ok', returnMethod: 'walk_bike' } })))), 'late_night_return_unknown'));
  assert.ok(!has(HO(A(allAnswered(Object.assign({}, base, { lateNight: { availability: 'ok', returnMethod: 'taxi' } })))), 'late_night_return_unknown'));
  // 深夜帯 × かつ 22時以降のシフトなし → 出さない
  assert.ok(!has(HO(A({ age: '22', category: 'フリーター', sh: { mon: ['10:00', '16:00'] }, lateNight: { availability: 'ng' } })), 'late_night_return_unknown'));
  // 18歳未満は法令ルールだけ
  assert.ok(!has(HO(A({ age: '17', category: 'フリーター', sh: { mon: ['17:00', '21:00'] }, lateNight: { availability: 'consult' } })), 'late_night_return_unknown'));
});

test('19 貢献度 例A = 65.4（高）', function () {
  const c = CC(exampleA());
  const got = ['busy', 'weekend', 'holiday', 'allNight', 'close', 'open', 'weeklyDays', 'period'].map(function (id) { return part(c, id).score; });
  assert.deepStrictEqual(got, [20.9, 9, 5, 3.8, 10, 5, 7.5, 4.2]);
  assert.strictEqual(c.total, 65.4);
  assert.strictEqual(c.max, 100);
  assert.strictEqual(c.pct, 65.4);
  assert.strictEqual(c.band, 'high');
  assert.strictEqual(c.incomplete, false);
  assert.strictEqual(c.enabled, true);
});

test('20 貢献度 例B = 17.6（低）', function () {
  const c = CC(exampleB());
  assert.strictEqual(part(c, 'busy').score, 1.3);
  assert.strictEqual(part(c, 'weeklyDays').score, 6.3);
  assert.strictEqual(part(c, 'period').score, 10);
  assert.strictEqual(c.total, 17.6);
  assert.strictEqual(c.band, 'low');
  assert.strictEqual(c.incomplete, false, c.missing.join(','));
});

test('21 繁忙期の比率・未確認', function () {
  const p = P();
  const only = function (over) { // GW 以外は weight 0 にして GW の比率だけを見る
    const q = P();
    q.options.vacationItems.forEach(function (v) { if (v.id !== 'gw') v.weight = 0; });
    return CC(A(over, q), q);
  };
  assert.strictEqual(part(only({ vacation: { gw: 'ok' }, vacationDays: { gw: '5' } }), 'busy').ratio, 1);
  assert.strictEqual(part(only({ vacation: { gw: 'ok' }, vacationDays: { gw: '10' } }), 'busy').ratio, 1);
  assert.strictEqual(part(only({ vacation: { gw: 'ng' }, vacationDays: { gw: '5' } }), 'busy').ratio, 0);
  const c = only({ vacation: { gw: 'ok' } });
  assert.strictEqual(part(c, 'busy').ratio, 0);
  assert.ok(part(c, 'busy').flags.indexOf('unanswered') >= 0);
  assert.ok(c.missing.some(function (m) { return m.indexOf('繁忙期の日数') === 0; }), c.missing.join(','));
  const q = P();
  q.options.vacationItems.forEach(function (v) { v.weight = 0; });
  const c2 = CC(A({}, q), q);
  assert.strictEqual(part(c2, 'busy').applicable, false);
  assert.strictEqual(c2.max, 70);
  assert.ok(!c2.missing.some(function (m) { return m.indexOf('繁忙期') === 0; }));
  void p;
});

test('22 貢献度の帯（丸めた pct で判定）', function () {
  const b = function (pct) { return R.bandOf(pct, 60, 35); };
  assert.deepStrictEqual([b(60.0), b(59.9), b(35.0), b(34.9)], ['high', 'mid', 'mid', 'low']);
  // 59.96% → 表示 60.0% → 高
  const p = P();
  p.contribution.items.forEach(function (it) { it.enabled = it.id === 'weeklyDays'; });
  p.contribution.items.find(function (it) { return it.id === 'weeklyDays'; }).max = 100;
  p.contribution.targets.weeklyDaysFull = 5;
  const c = CC(A({ daysMax: '3' }), p);
  assert.strictEqual(c.pct, 60);
  assert.strictEqual(c.band, 'high');
});

test('23 面接の境界 35/50 34/50 20/50 19/50', function () {
  const p = P();
  p.features.contribution = false;
  const r = [35, 34, 20, 19].map(function (t) { return R.evaluateHiring(A(), scoresTotal(t, p), p, { items: [] }, {}, OPTS).interview.band; });
  assert.deepStrictEqual(r, ['high', 'mid', 'mid', 'low']);
});

test('24 機能 OFF（オールナイト OFF ／ 全項目 OFF）', function () {
  const p = P(); p.features.allNight = false;
  const c = CC(exampleA(), p);
  assert.strictEqual(c.max, 85);
  assert.strictEqual(part(c, 'allNight').applicable, false);
  assert.ok(!c.missing.some(function (m) { return m.indexOf('オールナイト') === 0; }));
  const p2 = P(); p2.contribution.items.forEach(function (it) { it.enabled = false; });
  const c2 = CC(exampleA(), p2);
  assert.strictEqual(c2.enabled, false);
  assert.strictEqual(c2.band, null);
  const j = judge(exampleA(), scoresAll(5, p2), p2);
  assert.strictEqual(j.mode, 'interviewOnly');
  assert.strictEqual(j.result, 'recommend');
  assert.ok(j.body.indexOf('面接評価が優秀') >= 0, j.body);
});

test('25 マトリクス 面接高 × 貢献低 = 上長最終判断要', function () {
  const j = judge(exampleB(), scoresAll(5));
  assert.strictEqual(j.mode, 'matrix');
  assert.strictEqual(j.result, 'review');
  assert.strictEqual(j.matrix.cellKey, 'high_low');
  assert.strictEqual(j.matrix.cellResult, 'review');
  assert.ok(j.matrix.note.length > 0);
  assert.strictEqual(j.adjustments.length, 0);
  assert.strictEqual(j.adjusted, false);
  assert.strictEqual(j.baseResult, 'review');
  assert.strictEqual(j.contribution.total, 17.6);
  assert.ok(j.warnings.some(function (w) { return w.indexOf('シフト貢献度が17.6%と低めです（主な不足: 土日・祝日）') === 0; }), j.warnings.join('\n'));
  assert.ok(j.body.indexOf('面接評価100%（高）・シフト貢献度17.6%（低）') >= 0, j.body);
  assert.strictEqual(j.matrix.table.high_low, 'review');
  assert.deepStrictEqual(plain(j.matrix.bands), { interview: { high: 70, mid: 40 }, contribution: { high: 60, mid: 35 } });
});

test('25b マトリクスの各セル（既定）', function () {
  const p = P();
  const cells = p.matrix.cells;
  // 面接 高/中/低 × 貢献 高/中/低 の組合せを作る
  const contribs = {
    high: strongApplicant(),                                                                  // 高
    mid: strongApplicant({ allNight: { availability: 'ng' }, holidayWork: 'ng', weekendFreq: 'monthly',
      vacation: { gw: 'ng', summer: 'ng', obon: 'ng', yearend: 'consult' } }),               // 中
    low: exampleB()                                                                           // 低
  };
  const interviews = { high: scoresAll(5), mid: scoresAll(3), low: scoresAll(1) };
  Object.keys(interviews).forEach(function (ib) {
    Object.keys(contribs).forEach(function (cb) {
      const a = contribs[cb];
      const c = CC(a);
      assert.strictEqual(c.band, cb, cb + ' contrib ' + c.pct);
      const j = judge(a, interviews[ib], p);
      assert.strictEqual(j.matrix.cellKey, ib + '_' + cb);
      assert.strictEqual(j.baseResult, cells[ib + '_' + cb], ib + '_' + cb);
      assert.strictEqual(j.result, cells[ib + '_' + cb], ib + '_' + cb + ' ' + j.adjustments.map(function (x) { return x.code; }));
    });
  });
});

test('26 入力不足（繁忙期1期間未回答）', function () {
  const a = strongApplicant({ vacation: { spring: '' } });
  const j = judge(a, scoresAll(5));
  assert.strictEqual(j.mode, 'incomplete');
  assert.strictEqual(j.baseResult, 'recommend');
  assert.strictEqual(j.result, 'review');
  assert.strictEqual(j.adjustments[0].code, 'contribution_incomplete');
  assert.ok(j.body.indexOf('（未確定）') >= 0, j.body);
  assert.ok(j.warnings.some(function (w) { return w.indexOf('シフト貢献度の入力が不足しているため（繁忙期の可否（春休み期間））') === 0; }), j.warnings.join('\n'));
  const j2 = judge(a, scoresAll(1));
  assert.strictEqual(j2.mode, 'incomplete');
  assert.strictEqual(j2.result, 'reject');
  assert.strictEqual(j2.adjustments.length, 0);
  assert.ok(j2.warnings.some(function (w) { return w.indexOf('シフト貢献度の入力が不足') === 0; }));
  // requireComplete=false なら未確認は 0 点でマトリクスに当てる
  const p = P(); p.contribution.requireComplete = false;
  assert.strictEqual(judge(a, scoresAll(5), p).mode, 'matrix');
});

test('27 高校生ホールド（高2・面接高×貢献高・全確認済み）', function () {
  const p = P();
  p.matrix.cells.high_high = 'recommend';
  const a = A(merge(allAnswered({ age: '16', category: '高校2年生', sh: { fri: ['17:00', '22:00'], sat: ['08:00', '22:00'], sun: ['08:00', '22:00'] } }), {}));
  const c = CC(a, p);
  assert.strictEqual(c.band, 'high', 'pct ' + c.pct);
  const j = judge(a, scoresAll(5), p);
  assert.strictEqual(j.baseResult, 'recommend');
  assert.strictEqual(j.result, 'review');
  assert.ok(j.adjustments.some(function (x) { return x.code === 'highschool_hold'; }));
  assert.strictEqual(j.highschool.status, 'excluded');
  const p2 = P(); p2.evaluation.holdOnHighschoolException = false;
  assert.strictEqual(judge(a, scoresAll(5), p2).result, 'recommend');
  // 例外充足の高3はホールドしない
  const a3 = A(merge(allAnswered({ age: '17', category: '高校3年生', continueAfterGraduation: 'yes',
    highschool: { careerDecided: 'yes', careerPath: 'university' },
    sh: { fri: ['17:00', '22:00'], sat: ['08:00', '22:00'], sun: ['08:00', '22:00'] } }), {}));
  assert.strictEqual(judge(a3, scoresAll(5), p).result, 'recommend');
  // 理由文は状態ごとに分ける（原則対象外／例外条件が未入力／例外条件を満たさない）
  const reason = function (j) { return j.adjustments.find(function (x) { return x.code === 'highschool_hold'; }).reason; };
  assert.ok(reason(j).indexOf('高校2年生は原則対象外') >= 0, reason(j));
  const aIncomplete = A(merge(allAnswered({ age: '17', category: '高校3年生',
    sh: { fri: ['17:00', '22:00'], sat: ['08:00', '22:00'], sun: ['08:00', '22:00'] } }), {}));
  const jI = judge(aIncomplete, scoresAll(5), p);
  assert.strictEqual(jI.highschool.status, 'exception_incomplete');
  assert.ok(reason(jI).indexOf('例外条件（進路決定の有無・卒業後の継続意思）が未入力') >= 0, reason(jI));
  const aUnmet = A(merge(allAnswered({ age: '17', category: '高校3年生', continueAfterGraduation: 'yes',
    highschool: { careerDecided: 'no' },
    sh: { fri: ['17:00', '22:00'], sat: ['08:00', '22:00'], sun: ['08:00', '22:00'] } }), {}));
  const jU = judge(aUnmet, scoresAll(5), p);
  assert.ok(reason(jU).indexOf('例外条件を満たしていない（進路が未決定）') >= 0, reason(jU));
  assert.ok(reason(jU).indexOf('未入力のため') < 0);
});

test('28 法令ホールド（17歳の深夜シフト・minor_late_night 未確認・holdOnUnresolvedBlock=false）', function () {
  const p = P(); p.evaluation.holdOnUnresolvedBlock = false;
  const a = strongApplicant({ age: '17' });
  const c = CC(a, p);
  assert.strictEqual(c.band, 'high', 'pct ' + c.pct);
  const j = judge(a, scoresAll(5), p, function (h) { const ch = allChecks(h); delete ch.minor_late_night; return ch; });
  assert.strictEqual(j.baseResult, 'recommend');
  assert.strictEqual(j.result, 'review');
  assert.deepStrictEqual(plain(j.adjustments.map(function (x) { return x.code; })), ['legal_hold']);
  // 確認済みなら推奨
  assert.strictEqual(judge(a, scoresAll(5), p).result, 'recommend');
});

test('28b 要判断未確認（unresolved_block）の維持', function () {
  const a = strongApplicant({ workPeriod: 'short', vacation: {} });
  const j = judge(a, scoresAll(5), P(), function () { return {}; });
  assert.ok(j.adjustments.some(function (x) { return x.code === 'unresolved_block'; }), JSON.stringify(plain(j.adjustments)));
  assert.notStrictEqual(j.result, 'recommend');
  assert.ok(j.warnings.indexOf('「要判断」の留意点が未確認のため、採用推奨ではなく上長最終判断要として扱います。') >= 0);
});

test('29 調整は下げる方向だけ（low_low=recommend＋高2）', function () {
  const p = P(); p.matrix.cells.low_low = 'recommend';
  const a = merge(exampleB(), { age: '16', category: '高校2年生' });
  const j = judge(a, scoresAll(1), p);
  assert.strictEqual(j.matrix.cellKey, 'low_low');
  assert.strictEqual(j.baseResult, 'recommend');
  assert.strictEqual(j.result, 'review');
  j.adjustments.forEach(function (x) { assert.ok(R.RESULT_RANK[x.to] < R.RESULT_RANK[x.from]); });
});

test('30 不正なマトリクスのセル', function () {
  const raw = P(); raw.matrix.cells.high_high = 'xxx';
  assert.strictEqual(S.normalizeProfile(raw).matrix.cells.high_high, 'recommend');
  const j = judge(strongApplicant(), scoresAll(5), raw);
  assert.strictEqual(j.matrix.cellKey, 'high_high');
  assert.strictEqual(j.result, 'recommend');
  assert.strictEqual(j.matrix.cellResult, null);
  assert.ok(j.warnings.indexOf('マトリクス設定が不正なため面接評価のみで判定しました。') >= 0);
});

test('31 0 の扱い（reviewPct=0・面接0点 → 中）', function () {
  const p = P(); p.evaluation.thresholds.reviewPct = 0;
  const j = R.evaluateHiring(A(), scoresAll(0, p), p, { items: [] }, {}, OPTS);
  assert.strictEqual(j.interview.band, 'mid');
  assert.strictEqual(j.thresholds.reviewPct, 0);
});

test('32 normalize v1（新宿）', function () {
  const rep = {};
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'v1-profile-shinjuku.json'), 'utf8'));
  const n = plain(S.normalizeProfile(raw, rep));
  assert.strictEqual(n.schemaVersion, 2);
  assert.deepStrictEqual(n.options.vacationItems.map(function (v) { return v.id; }), ['threeday', 'gw', 'summer', 'obon', 'silver', 'yearend', 'spring']);
  assert.deepStrictEqual(n.options.vacationItems, plain(P().options.vacationItems));
  const vng = n.handoffRules.find(function (r) { return r.id === 'vacation_ng'; });
  assert.strictEqual(vng.text, P().handoffRules.find(function (r) { return r.id === 'vacation_ng'; }).text);
  assert.strictEqual(vng.category, 'busy');
  assert.strictEqual(n.handoffRules.find(function (r) { return r.id === 'weekend_missing'; }).category, 'busy');
  assert.strictEqual(n.texts.strengths.vacationOk, '繁忙期すべてに対応可能です');
  assert.strictEqual(n.highschoolPolicy.mode, 'exceptionOnly');
  assert.strictEqual(n.features.contribution, true);
  assert.strictEqual(rep.migratedFrom, 1);
  assert.strictEqual(n.options.workPeriods[1].minMonths, 6);
  // 新規ルールがすべて入っている
  P().handoffRules.forEach(function (r) { assert.ok(n.handoffRules.some(function (x) { return x.id === r.id; }), r.id); });
});

test('33 normalize v1（他劇場）', function () {
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'v1-profile-other.json'), 'utf8'));
  const n = plain(S.normalizeProfile(raw));
  assert.strictEqual(n.handoffRules.find(function (r) { return r.id === 'commute_warn'; }).text, '独自文言 {commuteTime}分');
  assert.strictEqual(n.highschoolPolicy.mode, 'allow');
  assert.strictEqual(n.features.contribution, false);
  assert.strictEqual(n.features.allNight, false);
  // 編集済みの v1 文言は置き換えない
  raw.handoffRules.find(function (r) { return r.id === 'vacation_ng'; }).text = '独自の繁忙期文言';
  assert.strictEqual(plain(S.normalizeProfile(raw)).handoffRules.find(function (r) { return r.id === 'vacation_ng'; }).text, '独自の繁忙期文言');
  // v1 に無かった入力欄・期間は出さない（他劇場の従来動作を黙って変えない）
  assert.strictEqual(n.features.vacationDays, false);
  assert.strictEqual(n.features.holidayWork, false);
  assert.strictEqual(n.features.weekendFreq, false);
  assert.strictEqual(n.handoffRules.find(function (r) { return r.id === 'shift_unanswered'; }).enabled, false);
  const v1Ids = raw.options.vacationItems.map(function (v) { return v.id; });
  assert.deepStrictEqual(n.options.vacationItems.map(function (v) { return v.id; }), v1Ids);
  // 他劇場の典型的な応募者（v1 の項目＝繁忙期4期間・深夜帯・週日数を回答）で shift_unanswered が出ない
  const vac = {}; v1Ids.forEach(function (id) { vac[id] = 'ok'; });
  const typical = A({ name: '他劇場', age: '20', category: '大学2年生', commuteMethod: '徒歩', commuteMinutes: '10',
    sh: { sat: ['10:00', '18:00'], sun: ['10:00', '18:00'] }, daysMin: '2', daysMax: '3', workPeriod: 'long',
    vacation: vac, lateNight: { availability: 'ng' } }, n);
  const hT = HO(typical, n);
  assert.ok(!has(hT, 'shift_unanswered'), ids(hT).join(','));
  // 2軸 OFF・未確認の留意点 OFF なので、空欄の応募者でも shift_unanswered は出ない
  assert.ok(!has(HO(A({ age: '20', category: '大学2年生', sh: { sat: ['10:00', '18:00'] } }, n), n), 'shift_unanswered'));
  // 新宿の既定（新規）では従来どおり出る
  assert.ok(has(HO(A({ age: '20', category: '大学2年生', sh: { sat: ['10:00', '18:00'] } })), 'shift_unanswered'));
});

test('34 冪等・削除した期間は復活しない', function () {
  ['v1-profile-shinjuku.json', 'v1-profile-other.json'].forEach(function (f) {
    const once = S.normalizeProfile(JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')));
    assert.deepStrictEqual(plain(S.normalizeProfile(plain(once))), plain(once), f);
  });
  assert.deepStrictEqual(plain(S.normalizeProfile(P())), plain(P()));
  const p = P();
  p.options.vacationItems = p.options.vacationItems.filter(function (v) { return v.id !== 'silver'; });
  const n = plain(S.normalizeProfile(p));
  assert.ok(!n.options.vacationItems.some(function (v) { return v.id === 'silver'; }));
  // 追加した期間は補完される
  const p2 = P();
  p2.options.vacationItems.push({ id: 'busy_x', label: '話題作の公開週' });
  const v = plain(S.normalizeProfile(p2)).options.vacationItems.find(function (x) { return x.id === 'busy_x'; });
  assert.deepStrictEqual(v, { id: 'busy_x', label: '話題作の公開週', periodNote: '', unit: 'total', maxDays: 7, refDays: 3, weight: 1, critical: false });
});

test('35 法令ルールは OFF・重要度変更不可', function () {
  const p = P();
  const r = p.handoffRules.find(function (x) { return x.id === 'minor_late_night'; });
  r.enabled = false; r.severity = 'info';
  const n = S.normalizeProfile(p).handoffRules.find(function (x) { return x.id === 'minor_late_night'; });
  assert.strictEqual(n.enabled, true);
  assert.strictEqual(n.severity, 'block');
});

test('36 validateProfile', function () {
  assert.deepStrictEqual(plain(S.validateProfile(P())), { errors: [], warnings: [] });
  const p1 = P(); p1.contribution.bands.highPct = 30;
  assert.strictEqual(S.validateProfile(p1).errors.length, 1);
  const p2 = P(); p2.options.vacationItems[0].refDays = 9;
  assert.strictEqual(S.validateProfile(p2).errors.length, 1);
  const p3 = P(); p3.options.vacationItems[1].id = 'threeday';
  assert.strictEqual(S.validateProfile(p3).errors.length, 1);
  const p4 = P(); p4.contribution.items.forEach(function (it) { it.enabled = false; });
  assert.strictEqual(S.validateProfile(p4).warnings.length, 1);
  const p5 = P(); p5.matrix.cells.mid_mid = 'maybe';
  assert.strictEqual(S.validateProfile(p5).errors.length, 1);
  // SPEC 4-5 の範囲（1 件ずつ壊してエラー 1 件）
  const one = function (mut, label) {
    const px = P(); mut(px);
    const r = plain(S.validateProfile(px));
    assert.strictEqual(r.errors.length, 1, label + ': ' + JSON.stringify(r.errors));
  };
  one(function (x) { x.contribution.items[0].max = -5; }, 'items.max=-5');
  one(function (x) { x.contribution.items[0].max = 1000; }, 'items.max=1000');
  one(function (x) { x.contribution.items[0].max = 2.5; }, 'items.max=2.5');
  one(function (x) { x.contribution.targets.closeDaysPerWeek = 0; }, 'closeDaysPerWeek=0');
  one(function (x) { x.contribution.targets.openDaysPerWeek = 8; }, 'openDaysPerWeek=8');
  one(function (x) { x.contribution.targets.weeklyDaysFull = 0; }, 'weeklyDaysFull=0');
  one(function (x) { x.contribution.busyStrongPct = 300; }, 'busyStrongPct=300');
  one(function (x) { x.contribution.busyStrongPct = -1; }, 'busyStrongPct=-1');
  one(function (x) { x.options.workPeriods[0].minMonths = -3; }, 'minMonths=-3');
  one(function (x) { x.options.workPeriods[0].minMonths = 61; }, 'minMonths=61');
  one(function (x) { const v = x.options.vacationItems.find(function (i) { return i.unit === 'total'; }); v.maxDays = 500; v.refDays = 400; }, 'maxDays=500');
  one(function (x) { const v = x.options.vacationItems.find(function (i) { return i.unit === 'total'; }); v.maxDays = 0; }, 'maxDays=0');
  // 境界値は通る
  const ok = P();
  ok.contribution.items[0].max = 0; ok.contribution.items[1].max = 100;
  ok.contribution.targets.closeDaysPerWeek = 7; ok.contribution.targets.openDaysPerWeek = 1;
  ok.contribution.busyStrongPct = 0; ok.options.workPeriods[0].minMonths = 60;
  const vt = ok.options.vacationItems.find(function (i) { return i.unit === 'total'; }); vt.maxDays = 62;
  assert.strictEqual(S.validateProfile(ok).errors.length, 0, JSON.stringify(plain(S.validateProfile(ok).errors)));
});

test('37 既存回帰（現行 e2e の応募者で旧ルールの id 集合が同じ）', function () {
  // 32a643e の rules.js / config を別コンテキストで読み、同じ応募者で比べる
  const cp = require('child_process');
  let oldRules, oldCfg;
  try {
    oldRules = cp.execSync('git show 32a643e:recruit-system/src/rules.js', { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    oldCfg = cp.execSync('git show 32a643e:recruit-system/src/config.default.js', { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { console.log('     (skip: git 履歴なし)'); return; }
  const octx = vm.createContext({}); octx.window = octx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/util.js'), 'utf8'), octx);
  vm.runInContext(oldCfg, octx); vm.runInContext(oldRules, octx);
  const OP = JSON.parse(JSON.stringify(octx.RECRUIT_DEFAULT_PROFILE));
  const applicant = {
    name: '佐藤 花子', gender: '女性', age: '21', category: '大学3年生', graduationDate: '2027-03',
    commuteMethod: '公共交通機関', commuteMinutes: '40', nearestStation: '高田馬場',
    workDays: ['mon', 'wed', 'fri', 'sat'], anyDay: false, daysMin: '2', daysMax: '4',
    shifts: { mon: { start: '17:00', end: '23:30' }, wed: { start: '10:00', end: '12:00' }, fri: { start: '18:00', end: '01:00' }, sat: { start: '08:00', end: '17:00' } },
    workPeriod: 'mid', sideJob: 'yes', sideJobDetail: 'カフェ 週1日',
    vacation: { summer: 'ok', obon: 'consult', yearend: 'ok', gw: 'ok' },
    lateNight: { availability: 'ok', returnMethod: 'taxi', lastTrain: '', taxiFare: '3800' },
    foreign: { isForeign: 'yes', residenceStatus: '留学', workPermit: 'unknown', residenceExpiry: '2027-01', japaneseLevel: '日常会話（N2相当）' }
  };
  const oldIds = plain(octx.RecruitRules.buildHandoff(JSON.parse(JSON.stringify(applicant)), OP).items.map(function (i) { return i.id; }));
  const newH = HO(merge(A(), JSON.parse(JSON.stringify(applicant))));
  const oldSet = {}; oldIds.forEach(function (id) { oldSet[id] = true; });
  const newOnlyOld = ids(newH).filter(function (id) { return OP.handoffRules.some(function (r) { return r.id === id; }); });
  const skip = { graduation_midterm: true };
  const a1 = oldIds.filter(function (id) { return !skip[id]; }).sort();
  const a2 = newOnlyOld.filter(function (id) { return !skip[id]; }).sort();
  assert.deepStrictEqual(a2, a1);
  assert.ok(has(newH, 'shift_unanswered'));
  assert.ok(has(newH, 'graduation_midterm'));
});

test('38 申し送りの並び（重要度 → カテゴリ順）・強み・バッジ', function () {
  const h = HO(A({ age: '17', category: '高校2年生', sh: { mon: ['17:00', '23:00'] }, workPeriod: 'short', allNight: { availability: 'ok' } }));
  const blocks = plain(h.items.filter(function (i) { return i.severity === 'block'; }).map(function (i) { return i.category; }));
  assert.deepStrictEqual(blocks.slice(0, 2), ['legal', 'legal']);
  const order = R.CATEGORY_ORDER;
  ['block', 'warn', 'info'].forEach(function (sev) {
    const cats = h.items.filter(function (i) { return i.severity === sev; }).map(function (i) { return order.indexOf(i.category); });
    for (let k = 1; k < cats.length; k++) assert.ok(cats[k - 1] <= cats[k], sev + ' ' + cats.join(','));
  });
  const labels = h.badges.map(function (b) { return b.label; });
  ['高校生 原則対象外', '18歳未満', 'オールナイト不可(法令/運用)'].forEach(function (l) { assert.ok(labels.indexOf(l) >= 0, labels.join(',')); });
  assert.ok(labels.indexOf('深夜帯') < 0);
  // 強み: 例A → 祝日・オールナイトなし（△）・深夜帯○
  const hA = HO(exampleA());
  const keys = hA.strengths.map(function (s) { return s.key; });
  assert.ok(keys.indexOf('holidayOk') >= 0 && keys.indexOf('lateNightOk') >= 0 && keys.indexOf('allNightOk') < 0, keys.join(','));
  assert.strictEqual(hA.contribution.total, 65.4);
  // 強い応募者: 繁忙期◎・vacationOk・allNightOk
  const hS = HO(strongApplicant());
  const ks = hS.strengths.map(function (s) { return s.key; });
  ['vacationOk', 'busyStrong', 'allNightOk', 'holidayOk'].forEach(function (k) { assert.ok(ks.indexOf(k) >= 0, k); });
  assert.ok(hS.strengths.find(function (s) { return s.key === 'busyStrong'; }).text.indexOf('（100%）') >= 0);
  assert.ok(hS.strengths.find(function (s) { return s.key === 'allNightOk'; }).text.indexOf('毎週でも可') >= 0);
  // 18歳未満には深夜帯の強みを出さない
  const hM = HO(A({ age: '17', category: 'フリーター', lateNight: { availability: 'ok' } }));
  assert.ok(!hM.strengths.some(function (s) { return s.key === 'lateNightOk'; }));
});

test('39 describeApplicant（高校生の例外・繁忙期・オールナイト・終電）', function () {
  const p = P();
  const row = function (rows, label) { const r = rows.find(function (x) { return x.label === label; }); return r ? r.value : undefined; };
  const a = A({ age: '17', category: '高校3年生', highschool: { careerDecided: 'yes', careerPath: 'university', destination: '〇〇大学' }, continueAfterGraduation: 'yes', allNight: { availability: 'ok' } });
  const rows = R.describeApplicant(a, p);
  assert.strictEqual(row(rows, '高校生の例外'), '例外対象（条件充足）：大学・短大へ進学（〇〇大学）／卒業後 継続する');
  assert.strictEqual(row(rows, '卒業後の継続'), '継続する');
  assert.strictEqual(row(rows, 'オールナイト'), '対象外（18歳未満（17歳））');
  const rA = R.describeApplicant(merge(exampleA(), { sideJob: 'yes', sideJobHoursPerWeek: '6' }), p);
  assert.strictEqual(row(rA, '繁忙期'), '3連休（祝日を含む連休）:○2日/回　GW:○5日　夏休み期間:○3日/週　お盆:△2日　シルバーウィーク:×　年末年始:○4日　春休み期間:△2日/週');
  assert.strictEqual(row(rA, '祝日'), '○ 可能');
  assert.strictEqual(row(rA, '土日の頻度'), '毎週 土日どちらか');
  assert.strictEqual(row(rA, 'オールナイト'), '△ 要相談 / 月1回程度');
  assert.strictEqual(row(rA, 'かけもち'), 'あり（週6時間）');
  const rB = R.describeApplicant(A({ age: '20', category: '大学2年生', sh: { mon: ['17:00', '23:50'] }, lateNight: { availability: 'ok', returnMethod: 'train', lastTrain: '00:00' } }), p);
  assert.ok(/（終電に間に合わない可能性）$/.test(row(rB, '深夜帯（22時以降）')), row(rB, '深夜帯（22時以降）'));
  assert.ok(row(R.describeApplicant(A({ age: '16', category: '高校2年生' }), p), '高校生の例外') === '原則対象外');
});

test('40 P1 ルール（就労年齢・年少者の時間・書類・卒業過去日・深夜2-5時×オールナイト×）', function () {
  assert.ok(has(HO(A({ age: '14', category: '高校1年生' })), 'under_working_age'));
  assert.ok(!has(HO(A({ age: '15', category: '高校1年生' })), 'under_working_age'));
  const hm = HO(A({ age: '17', category: 'フリーター', sh: { sat: ['08:00', '18:00'] } }));
  assert.ok(has(hm, 'minor_hours'));          // 拘束10h → 実働9h
  assert.ok(has(hm, 'minor_documents'));
  assert.ok(!has(HO(A({ age: '17', category: 'フリーター', sh: { sat: ['09:00', '18:00'] } })), 'minor_hours')); // 拘束9h → 実働8h
  assert.ok(has(HO(A({ age: '21', category: '大学3年生', graduationDate: '2026-03' })), 'graduation_past'));
  assert.ok(has(HO(A({ age: '21', category: '大学3年生', sh: { fri: ['22:00', '03:00'] }, allNight: { availability: 'ng' } })), 'allnight_shift_conflict'));
  const p = P(); p.evaluation.overallRejectAtOrBelow = 2;
  const s = scoresAll(5); s.overall_judgment = 2;
  const j = judge(strongApplicant(), s, p);
  assert.strictEqual(j.result, 'reject');
  assert.strictEqual(j.adjustments[0].code, 'overall_cutoff');
});

test('42 保存レポートの繁忙期表（重点は重み>0 のときだけ・重み0は「記録のみ」）', function () {
  const p = P();
  const sp = p.options.vacationItems.find(function (v) { return v.id === 'spring'; });
  sp.weight = 0; sp.critical = true;
  const a = exampleA();
  const h = R.buildHandoff(a, p, OPTS);
  const state = { applicant: a, profile: p, handoff: h, handoffChecks: allChecks(h), handoffNote: '', scores: scoresAll(4, p), interviewNotes: '',
    judgment: R.evaluateHiring(a, scoresAll(4, p), p, h, allChecks(h), OPTS), history: [] };
  const html = S.generateReportHTML(S.buildRecord(state), p);
  const row = function (label) {
    const m = html.match(new RegExp('<tr[^>]*><td>' + label + '[^<]*(<span class="tag">[^<]*</span>)*</td>'));
    return m ? m[0] : '';
  };
  const springLabel = sp.label.replace(/[()（）]/g, '.');
  assert.ok(row(springLabel).indexOf('記録のみ') >= 0 && row(springLabel).indexOf('重点') < 0, row(springLabel));
  const gw = p.options.vacationItems.find(function (v) { return v.id === 'gw'; });
  assert.ok(row(gw.label.replace(/[()（）]/g, '.')).indexOf('重点') >= 0, row(gw.label));
});

test('41 buildHandoff / evaluateHiring は applicant を書き換えない', function () {
  const a = exampleA(); delete a.lateNight; delete a.foreign;
  const before = JSON.stringify(a);
  HO(a); R.evaluateHiring(a, scoresAll(4), P(), HO(a), {}, OPTS); R.describeApplicant(a, P());
  assert.strictEqual(JSON.stringify(a), before);
});

console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
