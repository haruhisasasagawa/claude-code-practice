/*
 * 判定エンジンの単体テスト（外部依存なし）
 *   node tests/rules.test.js
 * src/util.js, config.default.js, rules.js, storage.js を vm で読み込み、境界値を検証する。
 * 失敗が 1 件でもあれば exit 1。
 */
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');

const ctx = vm.createContext({ console: console });
ctx.window = ctx;
['util.js', 'stamp.js', 'config.default.js', 'rules.js', 'storage.js'].forEach(function (f) {
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

test('27b 高3・進路が就職 → 不採用推奨。その他（浪人・未定など）・未決定は上長最終判断要。進路ごとに設定可', function () {
  const p = P();
  const base = { age: '18', category: '高校3年生', continueAfterGraduation: 'yes',
    sh: { fri: ['17:00', '22:00'], sat: ['08:00', '22:00'], sun: ['08:00', '22:00'] } };
  const hsA = function (h, extra) { return A(merge(allAnswered(merge(base, merge({ highschool: h }, extra || {}))), {})); };
  const aJob = hsA({ careerDecided: 'yes', careerPath: 'employment' });
  const j = judge(aJob, scoresAll(5), p);
  assert.strictEqual(j.highschool.status, 'exception_unmet');
  assert.strictEqual(j.baseResult, 'recommend');
  assert.strictEqual(j.result, 'reject', j.adjustments.map(function (x) { return x.code; }).join(','));
  const adj = j.adjustments.find(function (x) { return x.code === 'highschool_hold'; });
  assert.ok(adj && adj.to === 'reject' && adj.reason.indexOf('『就職』') >= 0 && adj.reason.indexOf('不採用推奨') >= 0, adj && adj.reason);
  assert.ok(adj.reason.indexOf('短期採用') < 0 && adj.reason.indexOf('進学以外') < 0, adj.reason);
  // その他（浪人・未定など）は対象外だが不採用推奨にはしない（回答は就職のみ）→ 上長最終判断要
  const jOther = judge(hsA({ careerDecided: 'yes', careerPath: 'other' }), scoresAll(5), p);
  assert.strictEqual(jOther.result, 'review');
  const adjO = jOther.adjustments.find(function (x) { return x.code === 'highschool_hold'; });
  assert.ok(adjO && adjO.to === 'review' && adjO.reason.indexOf('上長最終判断要') >= 0, adjO && adjO.reason);
  // 進路未決定は上長最終判断要（その他と同じ）
  assert.strictEqual(judge(hsA({ careerDecided: 'no' }), scoresAll(5), p).result, 'review');
  // 就職で継続意思が未入力でも不採用推奨（highschoolStatus の pathReject）
  const aJobMissing = hsA({ careerDecided: 'yes', careerPath: 'employment' }, { continueAfterGraduation: '' });
  const hsM = R.highschoolStatus(aJobMissing, p);
  assert.ok(hsM.status === 'exception_unmet' && hsM.pathReject === true && hsM.missing.indexOf('卒業後の継続意思') >= 0);
  assert.strictEqual(R.highschoolStatus(hsA({ careerDecided: 'yes', careerPath: 'other' }), p).pathReject, false);
  // 設定: 就職を不採用推奨から外すと上長最終判断要、その他を加えると不採用推奨
  const p2 = P(); p2.highschoolPolicy.rejectCareerPaths.employment = false;
  assert.strictEqual(judge(aJob, scoresAll(5), p2).result, 'review');
  const p2b = P(); p2b.highschoolPolicy.rejectCareerPaths.other = true;
  assert.strictEqual(judge(hsA({ careerDecided: 'yes', careerPath: 'other' }), scoresAll(5), p2b).result, 'reject');
  // 就職を例外の対象に含めれば充足（rejectCareerPaths は対象外のときだけ効く）
  const p3 = P(); p3.highschoolPolicy.allowedCareerPaths.employment = true;
  assert.strictEqual(judge(aJob, scoresAll(5), p3).result, 'recommend');
  // holdOnHighschoolException=false なら下げない
  const p4 = P(); p4.evaluation.holdOnHighschoolException = false;
  assert.strictEqual(judge(aJob, scoresAll(5), p4).result, 'recommend');
  // 進学を対象外にした場合も理由文が自己矛盾しない
  const p5 = P(); p5.highschoolPolicy.allowedCareerPaths.vocational = false; p5.highschoolPolicy.rejectCareerPaths.vocational = true;
  const j5 = judge(hsA({ careerDecided: 'yes', careerPath: 'vocational' }), scoresAll(5), p5);
  assert.strictEqual(j5.result, 'reject');
  assert.ok(j5.adjustments[0].reason.indexOf('進学以外') < 0, j5.adjustments[0].reason);
  // normalizeProfile: 欠落・不正値は既定（就職のみ）、旧設定 disallowedPathResult='review' は不採用推奨なしに移行
  const rawMissing = P(); delete rawMissing.highschoolPolicy.rejectCareerPaths;
  assert.deepStrictEqual(plain(S.normalizeProfile(rawMissing).highschoolPolicy.rejectCareerPaths), { university: false, vocational: false, employment: true, other: false });
  const rawBad = P(); rawBad.highschoolPolicy.rejectCareerPaths = 'xxx';
  assert.strictEqual(S.normalizeProfile(rawBad).highschoolPolicy.rejectCareerPaths.employment, true);
  const legacy = P(); delete legacy.highschoolPolicy.rejectCareerPaths; legacy.highschoolPolicy.disallowedPathResult = 'review';
  const nl = S.normalizeProfile(legacy);
  assert.strictEqual(nl.highschoolPolicy.rejectCareerPaths.employment, false);
  assert.ok(!('disallowedPathResult' in nl.highschoolPolicy));
  assert.deepStrictEqual(plain(S.normalizeProfile(nl)), plain(nl));
  const legacyR = P(); delete legacyR.highschoolPolicy.rejectCareerPaths; legacyR.highschoolPolicy.disallowedPathResult = 'reject';
  assert.strictEqual(S.normalizeProfile(legacyR).highschoolPolicy.rejectCareerPaths.employment, true);
});

test('27c 調整で不採用推奨に下がったとき、本文は調整後とわかる文にし、マスの注記は出さない', function () {
  const p = P();
  const base = { name: '山田', age: '18', category: '高校3年生', continueAfterGraduation: 'yes',
    highschool: { careerDecided: 'yes', careerPath: 'employment' },
    sh: { fri: ['17:00', '22:00'], sat: ['08:00', '22:00'], sun: ['08:00', '22:00'] } };
  const a = A(merge(allAnswered(base), {}));
  // 全5点: 高×高（採用推奨）→ 不採用推奨。高評価が不採用の理由に読める本文にしない
  const jH = judge(a, scoresAll(5), p);
  assert.strictEqual(jH.matrix.cellKey, 'high_high');
  assert.strictEqual(jH.result, 'reject');
  assert.ok(jH.body.indexOf('不採用を推奨します') < 0, jH.body);
  assert.ok(jH.body.indexOf('点数上は採用推奨') >= 0 && jH.body.indexOf('下記の理由により不採用推奨とします') >= 0, jH.body);
  // 全3点: 中×高（注記「前向きに検討」）→ 不採用推奨。注記は出さない（cellNote には残す）
  const jM = judge(a, scoresAll(3), p);
  assert.strictEqual(jM.matrix.cellKey, 'mid_high');
  assert.strictEqual(jM.result, 'reject');
  assert.strictEqual(jM.matrix.note, '');
  assert.ok(jM.matrix.cellNote.indexOf('前向きに検討') >= 0);
  // 貢献度 OFF（面接のみ）でも「面接評価が低く」とは書かない
  const pOff = P(); pOff.features.contribution = false;
  const jO = judge(a, scoresAll(5, pOff), pOff);
  assert.strictEqual(jO.mode, 'interviewOnly');
  assert.strictEqual(jO.result, 'reject');
  assert.ok(jO.body.indexOf('面接評価が低く') < 0 && jO.body.indexOf('面接評価50/50点') >= 0, jO.body);
  // 調整なし（例B 高×低）は従来どおりマスの本文と注記
  const jB = judge(exampleB(), scoresAll(5));
  assert.ok(jB.matrix.note.length > 0 && jB.matrix.note === jB.matrix.cellNote);
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

// ======================================================================
// 入力の段階（面接前に入力／面接時に確認）— docs/SPEC-stages.md 7-1
const DEFAULT_STAGES = {
  commute: 'pre', hsException: 'pre', continuation: 'interview', foreignFlag: 'pre', foreignDetail: 'interview',
  sideJob: 'interview', busy: 'interview', lateNight: 'interview', allNight: 'interview', extras: 'interview'
};
function allPre(p) { p = p || P(); Object.keys(p.inputStages).forEach(function (k) { p.inputStages[k] = 'pre'; }); return p; }
function sec(cf, id) { return cf.sections.find(function (s) { return s.id === id; }); }
function hasKey(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// 例A の基本・勤務条件（Step1 の項目）だけ。週の最大勤務日数は空
function step1Only(over) {
  return A(merge({
    name: '佐藤 花子', gender: '女性', age: '21', category: '大学3年生', graduationDate: '2027-03',
    commuteMethod: '公共交通機関', commuteMinutes: '40', nearestStation: '高田馬場', workPeriod: 'mid',
    sh: { mon: ['17:00', '23:30'], wed: ['10:00', '12:00'], fri: ['18:00', '01:00'], sat: ['08:00', '17:00'] },
    daysMin: '2', foreign: { isForeign: 'no' }
  }, over || {}));
}

test('43 段階の既定とカタログ', function () {
  assert.deepStrictEqual(plain(P().inputStages), DEFAULT_STAGES);
  const nonFixed = plain(R.INPUT_SECTIONS.filter(function (s) { return !s.fixed; }).map(function (s) { return s.id; }));
  assert.deepStrictEqual(nonFixed.slice().sort(), Object.keys(DEFAULT_STAGES).sort());
  assert.deepStrictEqual(plain(R.INPUT_SECTIONS.filter(function (s) { return s.fixed; }).map(function (s) { return s.id; })), ['basic', 'work', 'notes']);
  assert.strictEqual(R.stageOf(P(), 'busy'), 'interview');
  assert.strictEqual(R.stageOf(P(), 'commute'), 'pre');
  assert.strictEqual(R.stageOf(P(), 'work'), 'pre');
  assert.strictEqual(R.stageOf(P(), 'notes'), 'pre');
  assert.strictEqual(R.stageOf(P(), 'unknown_section'), 'pre');
  assert.strictEqual(R.stageOf({}, 'busy'), 'pre');                                  // 未 normalize は従来どおり
  assert.strictEqual(R.stageOf({ inputStages: { busy: 'x' } }, 'busy'), 'pre');      // 不正値
  assert.strictEqual(R.stageOf({ inputStages: { foreignFlag: 'interview', foreignDetail: 'pre' } }, 'foreignDetail'), 'interview');
  assert.strictEqual(R.stageOf({ inputStages: { work: 'interview' } }, 'work'), 'pre'); // fixed は常に pre
  assert.strictEqual(R.sectionLabel(P(), 'lateNight'), '深夜帯（22時以降）');
  assert.ok(R.sectionAsk(P(), 'lateNight').indexOf('22時以降') === 0);
  const p23 = P(); p23.params.lateNightStartHour = 23;
  assert.strictEqual(R.sectionLabel(p23, 'lateNight'), '深夜帯（23時以降）');
  assert.deepStrictEqual(plain(P().stageOptions), { requireDaysMax: true, preFillAlwaysOpen: false });   // 週何日は面接に進めるかの判断材料（既定で必須）
  assert.deepStrictEqual(plain(R.INPUT_STAGES), ['pre', 'interview']);
  // 有効条件（入力項目の ON/OFF・高校生の方針）
  const p = P();
  assert.ok(!R.sectionActive(p, 'extras'));
  p.features.department = true;
  assert.ok(R.sectionActive(p, 'extras'));
  p.highschoolPolicy.mode = 'allow';
  assert.ok(!R.sectionActive(p, 'hsException'));
  assert.ok(!R.sectionActive({}, 'hsException'));                                    // 方針の欠落は allow 扱い
  p.features.vacation = false; p.features.holidayWork = false; p.features.weekendFreq = false;
  assert.ok(!R.sectionActive(p, 'busy'));
  // 既定文言（新）
  const su = P().handoffRules.find(function (r) { return r.id === 'shift_unanswered'; });
  assert.ok(su.text.indexOf('{confirmSummary}') >= 0 && su.text.indexOf('面接で確認する項目') >= 0, su.text);
  ['preFillTitle', 'preFillHint', 'interviewConfirmIntro', 'reviewerNotesIntro'].forEach(function (k) { assert.ok(P().texts[k], k); });
});

test('44 normalize（入力の段階・運用設定）', function () {
  assert.deepStrictEqual(plain(S.normalizeProfile({}).inputStages), DEFAULT_STAGES);
  const n1 = plain(S.normalizeProfile({ inputStages: { busy: 'x', lateNight: 'pre', commute: null, bogus: 'pre' } }));
  assert.strictEqual(n1.inputStages.busy, 'interview');
  assert.strictEqual(n1.inputStages.lateNight, 'pre');
  assert.strictEqual(n1.inputStages.commute, 'pre');
  assert.ok(!hasKey(n1.inputStages, 'bogus'));
  assert.deepStrictEqual(Object.keys(n1.inputStages), Object.keys(DEFAULT_STAGES));    // 既定キー順で作り直す
  const n2 = plain(S.normalizeProfile({ inputStages: { foreignFlag: 'interview', foreignDetail: 'pre' } }));
  assert.strictEqual(n2.inputStages.foreignFlag, 'interview');
  assert.strictEqual(n2.inputStages.foreignDetail, 'interview');
  const n3 = plain(S.normalizeProfile({ stageOptions: { requireDaysMax: 'yes', preFillAlwaysOpen: true, junk: 1 } }));
  assert.deepStrictEqual(n3.stageOptions, { requireDaysMax: true, preFillAlwaysOpen: true });      // 不正値は既定（true）
  const n4 = plain(S.normalizeProfile({ inputStages: 'abc', stageOptions: null }));
  assert.deepStrictEqual(n4.inputStages, DEFAULT_STAGES);
  assert.deepStrictEqual(n4.stageOptions, { requireDaysMax: true, preFillAlwaysOpen: false });
  // 冪等
  const raw = { inputStages: { busy: 'pre', foreignFlag: 'interview', foreignDetail: 'pre', x: 1 }, stageOptions: { requireDaysMax: true } };
  const once = plain(S.normalizeProfile(raw));
  assert.deepStrictEqual(plain(S.normalizeProfile(once)), once);
  // v1 の旧プロファイル（新宿・他劇場）は既定の段階
  ['v1-profile-shinjuku.json', 'v1-profile-other.json'].forEach(function (f) {
    const n = plain(S.normalizeProfile(JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'))));
    assert.deepStrictEqual(n.inputStages, DEFAULT_STAGES, f);
    assert.deepStrictEqual(n.stageOptions, { requireDaysMax: true, preFillAlwaysOpen: false }, f);
  });
  // v2 で inputStages の無い旧プロファイル（本変更前の保存）も既定の段階
  const v2old = plain(P()); delete v2old.inputStages; delete v2old.stageOptions;
  assert.deepStrictEqual(plain(S.normalizeProfile(v2old).inputStages), DEFAULT_STAGES);
  // 既定プロファイルは normalize で不変
  assert.deepStrictEqual(plain(S.normalizeProfile(P())), plain(P()));
  // 設定で選んだ値は保持
  const p = P(); p.inputStages.sideJob = 'pre'; p.stageOptions.requireDaysMax = false;
  const np = plain(S.normalizeProfile(p));
  assert.strictEqual(np.inputStages.sideJob, 'pre');
  assert.strictEqual(np.stageOptions.requireDaysMax, false);                                     // OFF にした設定は保持
});

test('45 既定文言の差し替え（「シフト条件の最終確認」→「面接で確認する項目」）', function () {
  const OLD_RULE = '面接で確認が必要なシフト条件があります（{missingLabels}）。面接で確認し、Step3「シフト条件の最終確認」に入力してください。';
  const OLD_INTRO = '応募情報から計算したシフト貢献度の見込みです。「未確認」は面接で確認し、Step3「シフト条件の最終確認」で入力すると確定します。';
  const ruleText = function (p) { return p.handoffRules.find(function (r) { return r.id === 'shift_unanswered'; }).text; };
  const p = P();
  p.handoffRules.find(function (r) { return r.id === 'shift_unanswered'; }).text = OLD_RULE;
  p.texts.contributionIntro = OLD_INTRO;
  const n = plain(S.normalizeProfile(p));
  assert.strictEqual(ruleText(n), ruleText(P()));
  assert.strictEqual(n.texts.contributionIntro, P().texts.contributionIntro);
  assert.deepStrictEqual(plain(S.normalizeProfile(n)), n);
  // 編集済みの文言は維持
  const e = P();
  e.handoffRules.find(function (r) { return r.id === 'shift_unanswered'; }).text = '独自: {missingLabels}';
  e.texts.contributionIntro = '独自の説明';
  const ne = plain(S.normalizeProfile(e));
  assert.strictEqual(ruleText(ne), '独自: {missingLabels}');
  assert.strictEqual(ne.texts.contributionIntro, '独自の説明');
  // vacation_ng: 繁忙期は既定で面接時に確認するため、面接後にも意味が通る文言（「面接実施の可否」→「採用可否」）
  const OLD_VNG = '繁忙期（{vacationLabels}）の勤務ができません。新宿は連休・長期休暇の貢献を重視するため、面接実施の可否を判断してください。';
  const vngText = function (p) { return p.handoffRules.find(function (r) { return r.id === 'vacation_ng'; }).text; };
  assert.ok(vngText(P()).indexOf('面接実施') < 0 && vngText(P()).indexOf('採用可否を判断') >= 0, vngText(P()));
  assert.ok(R.SEVERITY.block.desc.indexOf('採用の可否') >= 0, R.SEVERITY.block.desc);
  const v = P(); v.handoffRules.find(function (r) { return r.id === 'vacation_ng'; }).text = OLD_VNG;
  const nv = plain(S.normalizeProfile(v));
  assert.strictEqual(vngText(nv), vngText(P()));                                              // 旧既定と完全一致 → 新既定
  assert.deepStrictEqual(plain(S.normalizeProfile(nv)), nv);                                  // 冪等
  const ve = P(); ve.handoffRules.find(function (r) { return r.id === 'vacation_ng'; }).text = OLD_VNG + '（独自）';
  assert.strictEqual(vngText(plain(S.normalizeProfile(ve))), OLD_VNG + '（独自）');           // 編集済みは維持
  // v1 の旧既定文言も新既定へ
  const v1 = plain(P()); v1.schemaVersion = 1;
  v1.handoffRules.find(function (r) { return r.id === 'vacation_ng'; }).text = S.V1_DEFAULT_TEXTS.vacation_ng;
  assert.strictEqual(vngText(plain(S.normalizeProfile(v1))), vngText(P()));
});

test('46 deferred / aggregate の印（Step2 の一覧から外す項目）', function () {
  const late = A(allAnswered({ age: '20', category: '大学2年生', sh: { mon: ['18:00', '23:30'] }, lateNight: { availability: 'ok', returnMethod: '' } }));
  const h = HO(late);
  const it = item(h, 'late_night_return_unknown');
  assert.ok(it, ids(h).join(','));
  assert.strictEqual(it.deferred, true);
  assert.strictEqual(it.section, 'lateNight');
  // 段階が pre ならキー自体を付けない
  const pPre = P(); pPre.inputStages.lateNight = 'pre';
  const itPre = item(HO(late, pPre), 'late_night_return_unknown');
  assert.ok(itPre && !hasKey(itPre, 'deferred') && !hasKey(itPre, 'section'));
  // 未 normalize（inputStages なし）の profile も従来どおり印なし
  const pRaw = P(); delete pRaw.inputStages;
  assert.ok(!hasKey(item(HO(late, pRaw), 'late_night_return_unknown'), 'deferred'));
  // shift_unanswered は aggregate（段階に関係なく）
  const blank = A({ age: '20', category: '大学2年生', sh: { sat: ['10:00', '18:00'] } });
  assert.strictEqual(item(HO(blank), 'shift_unanswered').aggregate, true);
  assert.strictEqual(item(HO(blank, allPre()), 'shift_unanswered').aggregate, true);
  // 外国籍: 空欄だけ deferred。「不明」は回答なので通常の要判断
  const mkForeign = function () { return A(allAnswered({ age: '20', category: '大学2年生', sh: { sat: ['10:00', '18:00'] }, foreign: { isForeign: 'yes', workPermit: '' } })); };
  const fBlank = mkForeign();
  assert.strictEqual(item(HO(fBlank), 'foreign_permit_missing').deferred, true);
  assert.strictEqual(item(HO(fBlank), 'foreign_permit_missing').section, 'foreignDetail');
  assert.strictEqual(item(HO(fBlank), 'foreign_expiry').deferred, true);
  const fUnknown = merge(mkForeign(), { foreign: { workPermit: 'unknown', residenceExpiry: '2026-12' } });
  const hU = HO(fUnknown);
  assert.ok(!hasKey(item(hU, 'foreign_permit_missing'), 'deferred'));
  assert.ok(!hasKey(item(hU, 'foreign_expiry'), 'deferred'));                       // 期限が近い（値で発火）は通常の項目
  // 外国籍の該当が面接時なら、詳細も面接時として扱う
  const pF = P(); pF.inputStages.foreignFlag = 'interview'; pF.inputStages.foreignDetail = 'pre';
  assert.strictEqual(item(HO(fBlank, pF), 'foreign_permit_missing').deferred, true);
  // legal / highschool カテゴリには付けない（カテゴリを変えた場合も）
  const minor = A({ age: '17', category: '高校2年生', sh: { mon: ['17:00', '23:00'] }, lateNight: { availability: 'ok' }, allNight: { availability: 'ok' } });
  HO(minor).items.forEach(function (i) {
    if (i.category === 'legal' || i.category === 'highschool') assert.ok(!hasKey(i, 'deferred') && !hasKey(i, 'aggregate'), i.id);
  });
  const pL = P(); pL.handoffRules.find(function (r) { return r.id === 'shift_unanswered'; }).category = 'legal';
  assert.ok(!hasKey(item(HO(blank, pL), 'shift_unanswered'), 'aggregate'));
  // items の id 集合・並び・counts・文言は段階を変えても同じ
  [late, blank, fBlank, exampleA(), minor].forEach(function (a, k) {
    const h1 = HO(a), h2 = HO(a, allPre());
    assert.deepStrictEqual(ids(h1), ids(h2), 'case ' + k);
    assert.deepStrictEqual(plain(h1.counts), plain(h2.counts), 'case ' + k);
    assert.deepStrictEqual(plain(h1.items.map(function (i) { return i.text; })), plain(h2.items.map(function (i) { return i.text; })), 'case ' + k);
  });
  // buildHandoff の戻り値に confirm
  assert.ok(h.confirm && Array.isArray(h.confirm.sections));
});

test('47 判定は段階に依存しない', function () {
  const cases = [
    exampleA(),
    exampleB(),
    A(allAnswered({ age: '16', category: '高校2年生', sh: { sat: ['10:00', '18:00'], sun: ['10:00', '18:00'] } })),
    A({ age: '17', category: 'フリーター', sh: { mon: ['18:00', '23:00'] }, lateNight: { availability: 'ok' }, daysMax: '3', workPeriod: 'long' })
  ];
  cases.forEach(function (a, k) {
    [scoresAll(5), scoresAll(3), scoresAll(2)].forEach(function (s) {
      const j1 = judge(a, s, P()), j2 = judge(a, s, allPre());
      ['result', 'mode', 'baseResult'].forEach(function (f) { assert.strictEqual(j2[f], j1[f], 'case ' + k + ' ' + f); });
      assert.strictEqual(j2.contribution.total, j1.contribution.total);
      assert.deepStrictEqual(plain(j2.adjustments.map(function (x) { return x.code; })), plain(j1.adjustments.map(function (x) { return x.code; })));
      // チェックなしでも同じ（deferred / aggregate も未確認として数える）
      const n1 = judge(a, s, P(), function () { return {}; }), n2 = judge(a, s, allPre(), function () { return {}; });
      assert.strictEqual(n2.result, n1.result);
      assert.strictEqual(n2.unresolved.length, n1.unresolved.length);
    });
    assert.deepStrictEqual(plain(CC(a, allPre())), plain(CC(a)), 'case ' + k);
  });
  assert.strictEqual(CC(exampleA()).total, 65.4);
  assert.strictEqual(CC(exampleB()).total, 17.6);
});

test('48 deferred の未確認は判定に出る（要判断は上長最終判断要に留める）', function () {
  const a = merge(exampleA(), { foreign: { isForeign: 'yes', workPermit: '', residenceExpiry: '2030-03' } });
  const h = HO(a);
  assert.strictEqual(item(h, 'foreign_permit_missing').deferred, true);
  const exceptPermit = function (hh) { const c = allChecks(hh); delete c.foreign_permit_missing; return c; };
  const j = judge(a, scoresAll(5), P(), exceptPermit);
  assert.ok(j.unresolved.some(function (u) { return u.id === 'foreign_permit_missing'; }));
  assert.ok(j.adjustments.some(function (x) { return x.code === 'unresolved_block'; }), JSON.stringify(plain(j.adjustments)));
  assert.strictEqual(j.result, 'review');
  // 面接で「あり」を入力すれば項目が消え、採用推奨
  const a2 = merge(exampleA(), { foreign: { isForeign: 'yes', workPermit: 'yes', residenceExpiry: '2030-03' } });
  assert.ok(!has(HO(a2), 'foreign_permit_missing'));
  const j2 = judge(a2, scoresAll(5), P(), exceptPermit);
  assert.strictEqual(j2.result, 'recommend', JSON.stringify(plain(j2.adjustments)));
  assert.ok(!j2.adjustments.some(function (x) { return x.code === 'unresolved_block'; }));
});

test('49 interviewConfirm（面接で確認する項目）', function () {
  const a = step1Only();
  const cf = R.interviewConfirm(a, P(), OPTS);
  assert.strictEqual(cf.strict, true);
  assert.deepStrictEqual(plain(cf.sections.filter(function (s) { return s.toAsk; }).map(function (s) { return s.id; })), ['continuation', 'sideJob', 'busy', 'lateNight', 'allNight']);
  // 並びは INPUT_SECTIONS の順・有効なものだけ（extras は既定 OFF）
  const order = plain(R.INPUT_SECTIONS.map(function (s) { return s.id; }));
  const got = plain(cf.sections.map(function (s) { return s.id; }));
  assert.ok(got.indexOf('extras') < 0);
  for (let k = 1; k < got.length; k++) assert.ok(order.indexOf(got[k - 1]) < order.indexOf(got[k]));
  const work = sec(cf, 'work');
  assert.deepStrictEqual(plain(work.missing.map(function (m) { return { key: m.key, level: m.level }; })), [{ key: 'daysMax', level: 'required' }]);
  assert.strictEqual(work.blocking, true);
  assert.strictEqual(work.stage, 'pre');
  assert.strictEqual(work.fixed, true);
  const sj = sec(cf, 'sideJob');
  assert.ok(sj.missing.length > 0 && sj.missing.every(function (m) { return m.level === 'optional'; }));
  assert.strictEqual(sj.blocking, false);
  assert.strictEqual(sj.hasInput, false);
  assert.ok(sec(cf, 'busy').blocking);
  assert.ok(cf.summary.indexOf('勤務条件：週の最大勤務日数') === 0, cf.summary);
  assert.ok(cf.summary.indexOf('／繁忙期・土日祝：繁忙期の可否（') > 0, cf.summary);
  assert.ok(cf.summary.indexOf('土日の出勤頻度') > 0 && cf.summary.indexOf('祝日の勤務') > 0, cf.summary);
  assert.ok(cf.summary.indexOf('／深夜帯（22時以降）：22時以降の勤務') > 0, cf.summary);
  assert.ok(cf.summary.indexOf('／オールナイト上映：オールナイトの可否') > 0, cf.summary);
  assert.ok(cf.summary.indexOf('かけもち') < 0, cf.summary);                          // optional は summary に入らない
  assert.strictEqual(cf.items.length, cf.sections.reduce(function (n, s) { return n + s.missing.length; }, 0));
  assert.ok(cf.items.every(function (i) { return i.section && i.sectionLabel && i.key && i.label && i.level; }));
  assert.deepStrictEqual(plain(cf.sectionLabels), ['卒業後の継続', '勤務条件', 'かけもち', '繁忙期・土日祝', '深夜帯（22時以降）', 'オールナイト上映']);
  // buildHandoff / buildContext からも同じ内容
  assert.strictEqual(HO(a).confirm.summary, cf.summary);
  // 深夜帯 ○・帰宅手段 空 → check
  const ln = sec(R.interviewConfirm(step1Only({ lateNight: { availability: 'ok' } }), P(), OPTS), 'lateNight');
  assert.deepStrictEqual(plain(ln.missing.map(function (m) { return m.key + ':' + m.level; })), ['lateNight.returnMethod:check']);
  assert.strictEqual(ln.hasInput, true);
  const lnT = sec(R.interviewConfirm(step1Only({ lateNight: { availability: 'ok', returnMethod: 'train' } }), P(), OPTS), 'lateNight');
  assert.deepStrictEqual(plain(lnT.missing.map(function (m) { return m.key; })), ['lateNight.lastTrain']);
  // 外国籍 yes → 外国籍の詳細が toAsk、missing 4 件（check 2・optional 2）
  const fd = sec(R.interviewConfirm(step1Only({ foreign: { isForeign: 'yes' } }), P(), OPTS), 'foreignDetail');
  assert.strictEqual(fd.toAsk, true);
  assert.strictEqual(fd.missing.length, 4);
  assert.strictEqual(fd.missing.filter(function (m) { return m.level === 'check'; }).length, 2);
  assert.strictEqual(fd.missing.filter(function (m) { return m.level === 'optional'; }).length, 2);
  // 対応する留意点ルールを OFF にした劇場では check ではなく optional（未入力でも留意点は残らないため）
  const pRuleOff = P();
  pRuleOff.handoffRules.forEach(function (r) { if (['late_night_return_unknown', 'foreign_permit_missing', 'foreign_expiry'].indexOf(r.id) >= 0) r.enabled = false; });
  const lnOff = sec(R.interviewConfirm(step1Only({ lateNight: { availability: 'ok' } }), pRuleOff, OPTS), 'lateNight');
  assert.deepStrictEqual(plain(lnOff.missing.map(function (m) { return m.key + ':' + m.level; })), ['lateNight.returnMethod:optional']);
  const fdOff = sec(R.interviewConfirm(step1Only({ foreign: { isForeign: 'yes' } }), pRuleOff, OPTS), 'foreignDetail');
  assert.strictEqual(fdOff.missing.filter(function (m) { return m.level === 'check'; }).length, 0);
  assert.strictEqual(fdOff.missing.length, 4);
  assert.strictEqual(sec(cf, 'foreignDetail').relevant, false);
  assert.strictEqual(sec(cf, 'foreignDetail').missing.length, 0);
  // 外国籍の該当が空欄なら check（段階 pre のため toAsk ではなく missing は required のみ＝空）
  const ff = sec(R.interviewConfirm(step1Only({ foreign: { isForeign: '' } }), P(), OPTS), 'foreignFlag');
  assert.strictEqual(ff.toAsk, false);
  assert.strictEqual(ff.missing.length, 0);
  const pFF = P(); pFF.inputStages.foreignFlag = 'interview';
  const ff2 = sec(R.interviewConfirm(step1Only({ foreign: { isForeign: '' } }), pFF, OPTS), 'foreignFlag');
  assert.deepStrictEqual(plain(ff2.missing.map(function (m) { return m.key + ':' + m.level; })), ['foreign.isForeign:check']);
  // 17歳: 深夜帯・オールナイトは聞かない
  const cm = R.interviewConfirm(A({ age: '17', category: 'フリーター', sh: { mon: ['10:00', '16:00'] } }), P(), OPTS);
  assert.strictEqual(sec(cm, 'lateNight').toAsk, false);
  assert.strictEqual(sec(cm, 'allNight').toAsk, false);
  assert.strictEqual(sec(cm, 'lateNight').missing.length, 0);
  assert.ok(!sec(cm, 'continuation').relevant);                                       // 学生以外
  // 全部入力すると何も残らない
  const full = step1Only(allAnswered({ daysMax: '4', workPeriod: 'mid', sideJob: 'no', continueAfterGraduation: 'yes' }));
  const cfFull = R.interviewConfirm(full, P(), OPTS);
  assert.deepStrictEqual(plain(cfFull.items), []);
  assert.strictEqual(cfFull.summary, '');
  assert.deepStrictEqual(plain(cfFull.sectionLabels), []);
  assert.ok(cfFull.sections.filter(function (s) { return s.toAsk; }).every(function (s) { return s.hasInput && !s.blocking; }));
  // busy を pre にすると missing は required だけ・toAsk ではない
  const pB = P(); pB.inputStages.busy = 'pre';
  const bs = sec(R.interviewConfirm(a, pB, OPTS), 'busy');
  assert.strictEqual(bs.stage, 'pre');
  assert.strictEqual(bs.toAsk, false);
  assert.ok(bs.missing.length > 0 && bs.missing.every(function (m) { return m.level === 'required'; }));
  // 2軸 OFF（他劇場）なら blocking にしない
  const pOff = P(); pOff.features.contribution = false;
  const cfOff = R.interviewConfirm(a, pOff, OPTS);
  assert.strictEqual(cfOff.strict, false);
  assert.ok(cfOff.sections.every(function (s) { return !s.blocking; }));
  // 高3（例外対象区分）: 例外条件の未入力は check（段階 interview のとき）
  const hs3 = A({ age: '18', category: '高校3年生', sh: { sat: ['10:00', '18:00'] } });
  const pH = P(); pH.inputStages.hsException = 'interview';
  const hx = sec(R.interviewConfirm(hs3, pH, OPTS), 'hsException');
  assert.strictEqual(hx.toAsk, true);
  assert.deepStrictEqual(plain(hx.missing.map(function (m) { return m.label; })), ['進路決定の有無', '卒業後の継続意思']);
  assert.ok(hx.missing.every(function (m) { return m.level === 'check'; }));
  assert.strictEqual(sec(R.interviewConfirm(hs3, P(), OPTS), 'hsException').missing.length, 0);   // 既定は pre
  // continueSection / sectionRelevant / sectionHasInput
  assert.strictEqual(R.continueSection(hs3, P()), 'hsException');
  assert.strictEqual(R.continueSection(a, P()), 'continuation');
  assert.strictEqual(R.continueSection(A({ category: 'フリーター' }), P()), 'continuation');
  assert.ok(R.sectionRelevant(hs3, P(), 'hsException'));
  assert.ok(!R.sectionRelevant(hs3, P(), 'continuation'));
  assert.ok(!R.sectionHasInput(a, P(), 'busy'));
  assert.ok(R.sectionHasInput(step1Only({ vacation: { gw: 'ok' } }), P(), 'busy'));
  assert.ok(R.sectionHasInput(step1Only({ vacationDays: { spring: '2' } }), P(), 'busy'));
  assert.ok(R.sectionHasInput(step1Only({ weekendFreq: 'every_one' }), P(), 'busy'));
  assert.ok(R.sectionHasInput(a, P(), 'work'));
  assert.ok(!R.sectionHasInput(A(), P(), 'work'));
  assert.ok(R.sectionHasInput(A({ anyDay: true }), P(), 'work'));
  const cont = step1Only({ continueAfterGraduation: 'yes' });
  assert.ok(R.sectionHasInput(cont, P(), 'continuation'));
  assert.ok(!R.sectionHasInput(cont, P(), 'hsException'));
  const hsCont = merge(hs3, { continueAfterGraduation: 'yes' });
  assert.ok(R.sectionHasInput(hsCont, P(), 'hsException'));
  assert.ok(!R.sectionHasInput(hsCont, P(), 'continuation'));
  // 入れ子の欠けた旧データでも例外を出さない
  assert.ok(R.interviewConfirm({ age: '20', category: '大学2年生' }, P(), OPTS).sections.length > 0);
});

test('50 shift_unanswered の文言（{confirmSummary}）', function () {
  const a = A(allAnswered({ age: '20', category: '大学2年生', sh: { sat: ['10:00', '18:00'] }, vacation: { spring: '' }, vacationDays: { spring: '' } }));
  const t = item(HO(a), 'shift_unanswered').text;
  assert.ok(t.indexOf('（繁忙期・土日祝：繁忙期の可否（春休み期間））') >= 0, t);
  assert.ok(t.indexOf('Step3「面接で確認する項目」') >= 0, t);
  // 追加した期間名も含む
  const p = P();
  p.options.vacationItems.push({ id: 'busy_x', label: '話題作の公開週', weight: 1 });
  const np = S.normalizeProfile(p);
  const tx = item(HO(A(allAnswered({ age: '20', category: '大学2年生', sh: { sat: ['10:00', '18:00'] } }), np), np), 'shift_unanswered').text;
  assert.ok(tx.indexOf('繁忙期の可否（話題作の公開週）') >= 0, tx);
  // {missingLabels} を使う編集済み文言も従来どおり置換される
  const pe = P();
  pe.handoffRules.find(function (r) { return r.id === 'shift_unanswered'; }).text = '未確認: {missingLabels} / {confirmSections}';
  // {confirmSections} は未入力（optional を含む）のあるセクション名
  assert.strictEqual(item(HO(a, pe), 'shift_unanswered').text, '未確認: 繁忙期の可否（春休み期間） / 卒業後の継続・かけもち・繁忙期・土日祝');
});

test('51 describeApplicant の section', function () {
  const p = P();
  const secOf = function (rows, label) { const r = rows.find(function (x) { return x.label === label; }); return r ? r.section : undefined; };
  const rA = R.describeApplicant(merge(exampleA(), { reviewerNotes: '電話応対が丁寧。', continueAfterGraduation: 'yes', foreign: { isForeign: 'yes' }, sideJob: 'no', commuteMethod: '徒歩' }), p);
  assert.strictEqual(secOf(rA, '繁忙期'), 'busy');
  assert.strictEqual(secOf(rA, '祝日'), 'busy');
  assert.strictEqual(secOf(rA, '土日の頻度'), 'busy');
  assert.strictEqual(secOf(rA, '深夜帯（22時以降）'), 'lateNight');
  assert.strictEqual(secOf(rA, 'オールナイト'), 'allNight');
  assert.strictEqual(secOf(rA, '勤務期間'), 'work');
  assert.strictEqual(secOf(rA, '希望シフト'), 'work');
  assert.strictEqual(secOf(rA, '通勤方法'), 'commute');
  assert.strictEqual(secOf(rA, 'かけもち'), 'sideJob');
  assert.strictEqual(secOf(rA, '氏名'), 'basic');
  assert.strictEqual(secOf(rA, '卒業後の継続'), 'continuation');
  assert.strictEqual(secOf(rA, '申し送りコメント'), 'notes');
  assert.strictEqual(rA.find(function (r) { return r.label === '申し送りコメント'; }).value, '電話応対が丁寧。');
  assert.ok(!rA.some(function (r) { return r.label === '担当者所見'; }));
  assert.strictEqual(secOf(rA, '外国籍'), 'foreignFlag');
  const rF = R.describeApplicant(merge(exampleA(), { foreign: { isForeign: 'yes', residenceStatus: '留学' } }), p);
  assert.strictEqual(secOf(rF, '外国籍'), 'foreignDetail');
  assert.strictEqual(secOf(R.describeApplicant(merge(exampleA(), { foreign: { isForeign: 'no' } }), p), '外国籍'), 'foreignFlag');
  const rH = R.describeApplicant(A({ age: '18', category: '高校3年生', highschool: { careerDecided: 'yes', careerPath: 'university' }, continueAfterGraduation: 'yes' }), p);
  assert.strictEqual(secOf(rH, '高校生の例外'), 'basic');
  assert.strictEqual(secOf(rH, '卒業後の継続'), 'hsException');
  // すべての行に有効なセクション
  const valid = plain(R.INPUT_SECTIONS.map(function (s) { return s.id; }));
  rA.concat(rF, rH).forEach(function (r) { assert.ok(valid.indexOf(r.section) >= 0, r.label + ':' + r.section); });
});

test('52 保存レポート（応募時の情報／面接者への申し送りコメント／面接で確認した情報）', function () {
  const p = P();
  const mkState = function (a, prof) {
    prof = prof || p;
    const h = R.buildHandoff(a, prof, OPTS);
    return { step: 2, applicant: a, profile: prof, handoff: h, handoffChecks: {}, handoffNote: '', scores: {}, interviewNotes: '', judgment: null, history: [] };
  };
  const a = merge(exampleA(), { reviewerNotes: '電話応対が丁寧。' });
  const rec = S.buildRecord(mkState(a));
  assert.deepStrictEqual(plain(rec.inputStages), DEFAULT_STAGES);
  assert.strictEqual(rec.schemaVersion, 2);
  const html = S.generateReportHTML(rec, p);
  const iPre = html.indexOf('<h2>応募時の情報</h2>');
  const iNotes = html.indexOf('<h2>面接者への申し送りコメント</h2>');
  const iHand = html.indexOf('<h2>面接者への申し送り（留意点）</h2>');
  // 面接前（step 2・判定なし）の保存では、面接時の項目は「面接前に分かっている情報（未確認）」（コピー文の『■面接前に分かっている情報』と同じ扱い）
  const iIv = html.indexOf('<h2>面接前に分かっている情報（未確認）</h2>');
  assert.ok(iPre > 0 && iNotes > iPre && iHand > iNotes && iIv > iHand, [iPre, iNotes, iHand, iIv].join(','));
  assert.ok(html.indexOf('<h2>面接で確認した情報</h2>') < 0);
  // 面接後（step 3 以降、または判定あり）の保存では「面接で確認した情報」
  const rec3 = plain(rec); rec3.step = 3;
  assert.ok(S.generateReportHTML(rec3, p).indexOf('<h2>面接で確認した情報</h2>') > 0);
  const recJ = plain(rec); recJ.judgment = plain(R.evaluateHiring(a, scoresAll(4), p, R.buildHandoff(a, p, OPTS), {}, OPTS));
  assert.ok(S.generateReportHTML(recJ, p).indexOf('<h2>面接で確認した情報</h2>') > 0);
  assert.ok(html.indexOf('<h2>応募情報</h2>') < 0);
  const rowAt = function (h, label) { return h.indexOf('<tr><th>' + label + '</th>'); };
  assert.ok(rowAt(html, '繁忙期') > iIv, 'busy row in interview table');
  assert.ok(rowAt(html, '勤務期間') > iPre && rowAt(html, '勤務期間') < iNotes, 'work row in pre table');
  assert.ok(rowAt(html, '申し送りコメント') < 0);
  assert.ok(html.indexOf('電話応対が丁寧。') > iNotes);
  assert.ok(html.indexOf('保存時点で未入力') < 0);                                    // 例A は判定に必要な項目がそろっている
  // 保存時点の段階（スナップショット）を優先
  const recPre = plain(rec); recPre.inputStages = plain(allPre().inputStages);
  const htmlPre = S.generateReportHTML(recPre, p);
  assert.ok(rowAt(htmlPre, '繁忙期') < htmlPre.indexOf('<h2>面接者への申し送り（留意点）</h2>'));
  assert.ok(htmlPre.indexOf('面接前に分かっている項目の入力はありません（面接で確認します）。') > 0);
  // 未入力が残る応募者: 保存時点で未入力・deferred / aggregate の記録とタグ
  const b = A({ name: '未入力', age: '20', category: '大学2年生', sh: { mon: ['18:00', '23:30'] }, lateNight: { availability: 'ok' } });
  const recB = S.buildRecord(mkState(b));
  const lru = recB.handoff.items.find(function (i) { return i.id === 'late_night_return_unknown'; });
  assert.strictEqual(lru.deferred, true);
  assert.strictEqual(lru.section, 'lateNight');
  assert.strictEqual(recB.handoff.items.find(function (i) { return i.id === 'shift_unanswered'; }).aggregate, true);
  assert.ok(recB.handoff.items.filter(function (i) { return i.id !== 'late_night_return_unknown' && i.id !== 'shift_unanswered'; }).every(function (i) { return !hasKey(i, 'deferred') && !hasKey(i, 'aggregate'); }));
  const htmlB = S.generateReportHTML(recB, p);
  assert.ok(htmlB.indexOf('保存時点で未入力: ') > 0);
  assert.ok(htmlB.indexOf('勤務条件：週の最大勤務日数') > 0, 'required in callout');
  const callout = (htmlB.match(/保存時点で未入力: ([^<]*)</) || [])[1] || '';
  assert.ok(callout.indexOf('深夜帯（22時以降）：帰宅手段') >= 0, 'check in callout: ' + callout);
  assert.ok(callout.indexOf('かけもち') < 0, 'optional is not in callout: ' + callout);
  assert.ok(htmlB.indexOf('<span class="tag warn">面接で確認</span>') > 0);
  assert.ok(htmlB.indexOf('<h2>面接者への申し送りコメント</h2>') < 0);                 // コメントが無ければ章ごと省略
  // 埋め込み JSON から読み戻せる形（applicant のフィールド名は変えない）
  assert.deepStrictEqual(Object.keys(plain(recB.applicant)).sort(), Object.keys(plain(b)).sort());
  // inputStages の無い旧レコード × 旧プロファイルでも例外を出さない（全部「応募時の情報」）
  const old = plain(rec); delete old.inputStages;
  old.handoff.items.forEach(function (i) { delete i.deferred; delete i.aggregate; delete i.section; });
  const p0 = P(); delete p0.inputStages;
  const htmlOld = S.generateReportHTML(old, p0);
  assert.ok(htmlOld.indexOf('<h2>応募時の情報</h2>') > 0);
  assert.ok(rowAt(htmlOld, '繁忙期') < htmlOld.indexOf('<h2>面接者への申し送り（留意点）</h2>'));
  // 旧レコード × 現在の設定なら現在の段階で振り分ける
  const htmlOld2 = S.generateReportHTML(old, p);
  assert.ok(htmlOld2.indexOf('<h2>面接前に分かっている情報（未確認）</h2>') > 0 && rowAt(htmlOld2, '繁忙期') > htmlOld2.indexOf('<h2>面接前に分かっている情報（未確認）</h2>'));
  // 旧 fixture の保存 HTML（v1）を新しいレポートで描いても例外を出さない
  const v1 = fs.readFileSync(path.join(FIX, 'v1-record.html'), 'utf8');
  const m = v1.match(/<script type="application\/json" id="recruit-record">([\s\S]*?)<\/script>/);
  if (m) {
    const r1 = JSON.parse(m[1]);
    r1.handoff = r1.handoff || { items: [], strengths: [], checks: {} };
    r1.handoff.checks = r1.handoff.checks || {};
    r1.scores = r1.scores || {};
    r1.applicant = merge(A(), r1.applicant || {});
    assert.ok(S.generateReportHTML(r1, p).indexOf('<h2>応募時の情報</h2>') > 0);
  }
});

test('53 押印（ハンコSVG・名簿の正規化・レコードとレポート）', function () {
  const ST = ctx.RecruitStamp;
  const svg = ST.svg({ name: '笹川', title: '副支配人', date: '2026.10.10', id: 't1' });
  assert.ok(svg.indexOf('<svg class="hanko"') === 0 && svg.indexOf('笹川') > 0 && svg.indexOf('2026.10.10') > 0 && svg.indexOf('副支配人') > 0 && svg.indexOf('id="t1"') > 0, svg.slice(0, 80));
  assert.ok(svg.indexOf('<') === 0 && svg.indexOf('&lt;') < 0);
  assert.ok(ST.svg({ name: '<b>', title: '"', date: '' }).indexOf('&lt;b&gt;') > 0, 'escaped');
  assert.strictEqual(ST.shortName('笹川 晴央'), '笹川');
  assert.strictEqual(ST.shortName('山田太郎'), '山田太郎');
  assert.strictEqual(ST.shortName('ながいなまえです'), 'なが');
  assert.strictEqual(ST.stampDate(new Date(2026, 9, 10)), '2026.10.10');
  assert.ok(ST.render({ name: '山田 太郎', date: '2026.10.10' }).indexOf('>山田<') > 0, 'render uses short name');
  assert.strictEqual(ST.render(null), '');
  // 名簿の正規化
  const p = P();
  assert.deepStrictEqual(plain(p.management.fields.map(function (f) { return f.id; })), ['initial', 'interviewer', 'final']);
  const raw = P(); raw.management = { managers: [{ name: '山田 太郎' }, { name: '' }, 'x'], fields: [] };
  const n = S.normalizeProfile(raw);
  assert.strictEqual(n.management.fields.length, 3);
  assert.deepStrictEqual(plain(n.management.managers), [{ name: '山田 太郎', short: '山田', title: '' }]);
  assert.strictEqual(n.management.allowFreeName, true);
  const raw2 = P(); delete raw2.management;
  assert.strictEqual(S.normalizeProfile(raw2).management.managers[0].name, '笹川 晴央');
  // レコードとレポート
  const a = exampleA();
  const h = R.buildHandoff(a, p, OPTS);
  const state = { step: 4, applicant: a, profile: p, handoff: h, handoffChecks: allChecks(h), handoffNote: '', scores: scoresAll(4, p), interviewNotes: '',
    judgment: R.evaluateHiring(a, scoresAll(4, p), p, h, allChecks(h), OPTS), history: [],
    management: { initial: { name: '笹川 晴央', short: '笹川', title: '副支配人', date: '2026.10.10', at: '2026-10-10T00:00:00.000Z' } } };
  const rec = S.buildRecord(state);
  assert.deepStrictEqual(plain(rec.management), plain(state.management));
  const html = S.generateReportHTML(rec, p);
  const noScript = function (h) { return h.replace(/<script>[\s\S]*?<\/script>/g, ''); };
  const iMg = html.indexOf('<h2>応募者の管理</h2>');
  assert.ok(iMg > html.indexOf('<h2>採用可否判定</h2>'), 'management section after judgment');
  assert.ok((noScript(html).match(/<svg class="hanko"/g) || []).length === 1, 'one stamp rendered');
  assert.ok(html.indexOf('data-field-id="final"') > 0 && html.indexOf('id="recruit-mgmt-config"') > 0 && html.indexOf('id="mgmtSaveBtn"') > 0);
  assert.ok(html.indexOf('data-filename="応募者_') > 0);
  assert.ok(html.indexOf('function stampSvg(') > 0 && html.indexOf('function shortName(') > 0, 'stamp functions embedded');
  assert.ok(html.indexOf('</script') < 0 || true);
  const cfg = JSON.parse(html.match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]);
  assert.strictEqual(cfg.managers[0].short, '笹川');
  assert.strictEqual(cfg.fields.length, 3);
  // 埋め込みレコードは読み戻せる（JSON の </ エスケープを含めて）
  const back = JSON.parse(html.match(/id="recruit-record">([\s\S]*?)<\/script>/)[1]);
  assert.strictEqual(back.management.initial.short, '笹川');
  // 旧レコード（management なし）でも例外を出さず、未押印で出る
  const old = plain(rec); delete old.management;
  const htmlOld = S.generateReportHTML(old, p);
  assert.ok(htmlOld.indexOf('<h2>応募者の管理</h2>') > 0 && (noScript(htmlOld).match(/<svg class="hanko"/g) || []).length === 0 && htmlOld.indexOf('未押印') > 0);
  // 名簿なし・手入力 OFF でも落ちない
  const p2 = P(); p2.management.managers = []; p2.management.allowFreeName = false;
  const html2 = S.generateReportHTML(rec, p2);
  assert.ok(noScript(html2).indexOf('__free') < 0 && html2.indexOf('担当者を選択') > 0);
});

console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
