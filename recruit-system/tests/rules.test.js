/*
 * 判定エンジン・保存の単体テスト（外部依存なし）
 *   node tests/rules.test.js
 * src/util.js, stamp.js, lock.js, config.default.js, rules.js, storage.js を vm で読み込み、境界値を検証する。
 * 失敗が 1 件でもあれば exit 1。
 * 2026-10-14 の面接特化（docs/SPEC-slim.md 5-1）で、削除した機能のテスト（#01〜#52・#56〜#60・#62・#72）は外した（番号は振り直さない）。
 */
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');

const ctx = vm.createContext({ console: console });
ctx.window = ctx;
['util.js', 'stamp.js', 'lock.js', 'config.default.js', 'rules.js', 'storage.js'].forEach(function (f) {
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
function merge(base, over) {
  Object.keys(over || {}).forEach(function (k) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], v);
    else base[k] = v;
  });
  return base;
}
// 応募者（6 キー。docs/SPEC-slim.md D3）
function SA(over) {
  return merge({ name: '', gender: '', age: '', category: '', graduationDate: '', reviewerNotes: '' }, over || {});
}
// 保存 HTML の埋め込みレコード
function recordOf(html) { return JSON.parse(html.match(/id="recruit-record">([\s\S]*?)<\/script>/)[1]); }
function fixtureRecord(f) { return recordOf(fs.readFileSync(path.join(FIX, f), 'utf8')); }
const noScript = function (h) { return h.replace(/<script>[\s\S]*?<\/script>/g, ''); };

// ======================================================================
// 面接チェックリスト（docs/SPEC-checklist.md 7-1。#54〜#66）
// mark: 'good'|'fair'|'poor'（全確認点）、overall: 既定 'hire'（総合判断の上限を混ぜない）
function clAll(mark, overall, over, p) {
  const def = (p || P()).checklist, cl = R.emptyChecklist();
  R.checklistItems(def, 'must').forEach(function (x) { cl.values[x.item.id] = 'match'; });
  R.checklistItems(def, 'rating').forEach(function (x) { cl.values[x.item.id] = mark; });
  cl.overall = overall || 'hire';
  return merge(cl, over || {});
}
// 確認点を台本順に marks（'good'|'fair'|'poor'|''）で入れる
function clMarks(marks, overall, p) {
  const cl = clAll('good', overall, null, p);
  R.checklistItems((p || P()).checklist, 'rating').forEach(function (x, i) {
    if (marks[i]) cl.values[x.item.id] = marks[i]; else delete cl.values[x.item.id];
  });
  return cl;
}
function judgeS(cl, p) { return R.evaluateScript({ name: 'テスト 太郎' }, cl, p || P(), OPTS); }
const CL_ID = /^[A-Za-z][\w-]{0,40}$/;
function clAllIds(def) {
  const out = [];
  def.sections.forEach(function (s) { out.push(s.id); s.blocks.forEach(function (b) { out.push(b.id); b.items.forEach(function (it) { out.push(it.id); }); }); });
  return out;
}
function hasWarn(j, s) { return j.warnings.some(function (w) { return w.indexOf(s) >= 0; }); }
// buildRecord に渡す state（回答あり・判定あり・面接対応者の押印あり）
function scriptState(over) {
  const p = P();
  const a = SA({ name: '台本 花子', age: '20', gender: '女性', category: '大学2年生', graduationDate: '2029-03', reviewerNotes: '電話の受け答えが丁寧。' });
  const cl = clAll('good', 'hire', null, p);
  // negatives は旧レコード（消極属性入り）を兼ねる。2026-10-13 に削除したので読み飛ばす（docs/SPEC-script-mode.md 12 章）
  cl.header = { date: '2026-10-10', interviewer: '笹川 晴央', posting: 'short', taxi: '可・2,500円', negatives: { short: 'on' } };
  const j = R.evaluateScript(a, cl, p, OPTS);
  return Object.assign({ step: 4, applicant: a, profile: p, checklist: cl, interviewNotes: '受け答えが丁寧', judgment: j,
    management: { interviewer: { name: '笹川 晴央', short: '笹川', title: '副支配人', date: '2026.10.10', at: '' } }, decision: null }, over || {});
}

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
  // ハンコの文字は外周の内側に収める（長い印字名・役職は textLength で詰める）
  const tl = function (svgText, word) { const m = svgText.match(new RegExp('<text([^>]*)>' + word + '</text>')); if (!m) return -1; const t = m[1].match(/textLength="([\d.]+)"/); return t ? Number(t[1]) : 0; };
  assert.strictEqual(tl(svg, '笹川'), 0, '2 文字は詰めない');
  assert.strictEqual(tl(svg, '副支配人'), 0, '4 文字の役職は詰めない');
  const longSvg = ST.svg({ name: '佐々木小次郎', title: 'アシスタントマネージャー', date: '2026.10.10' });
  const tlTitle = tl(longSvg, 'アシスタントマネージャー');
  const tlName = tl(longSvg, '佐々木小次郎');
  assert.ok(tlTitle > 0 && tlTitle <= 54 && tlName > 0 && tlName <= 58, 'long: ' + tlTitle + ' / ' + tlName);
  // 名簿の正規化
  const p = P();
  assert.deepStrictEqual(plain(p.management.fields.map(function (f) { return f.id; })), ['interviewer', 'final']);
  const raw = P(); raw.management = { managers: [{ name: '山田 太郎' }, { name: '' }, 'x'], fields: [] };
  const n = S.normalizeProfile(raw);
  assert.strictEqual(n.management.fields.length, 2);
  assert.deepStrictEqual(plain(n.management.managers), [{ name: '山田 太郎', short: '山田', title: '' }]);
  assert.strictEqual(n.management.allowFreeName, true);
  const raw2 = P(); delete raw2.management;
  const defMg = S.normalizeProfile(raw2).management.managers;
  const sasagawa = defMg.find(function (m) { return m.name === '笹川 晴央'; });
  assert.ok(sasagawa && sasagawa.short === '笹川' && sasagawa.title === '副支配人' && sasagawa.grade === 'S3', JSON.stringify(plain(defMg)));
  // レコードとレポート
  const state = scriptState({ management: { interviewer: { name: '笹川 晴央', short: '笹川', title: '副支配人', date: '2026.10.10', at: '2026-10-10T00:00:00.000Z' } } });
  const rec = S.buildRecord(state);
  assert.deepStrictEqual(plain(rec.management), plain(state.management));
  const html = S.generateReportHTML(rec, p);
  // 押印行は用紙（main.a4#a4）の中の最下段（docs/SPEC-a4.md 1-2）。保存バーはスクリプトが作る（生成 HTML には無い）
  const iSt = html.indexOf('<div class="cl-stamps"><div class="stamp-row cl-stamps-row cols-2">');
  assert.ok(iSt > html.indexOf('<main class="a4" id="a4">') && iSt < html.indexOf('</main>'), '押印行は用紙の中');
  assert.ok((noScript(html).match(/<svg class="hanko"/g) || []).length === 1, 'one stamp rendered');
  assert.ok(html.indexOf('data-field-id="final"') > 0 && html.indexOf('id="recruit-mgmt-config"') > 0 && html.indexOf('saveBarBtn') > 0 && noScript(html).indexOf('id="saveBarBtn"') < 0);
  assert.ok(html.indexOf('data-filename="応募者_') > 0);
  assert.ok(html.indexOf('function stampSvg(') > 0 && html.indexOf('function shortName(') > 0, 'stamp functions embedded');
  // 埋め込み JSON は </script> や <!--<script> を含む名前でも要素を閉じ損ねない（< > & は \\u 形式）
  const closeCount = function (h) { return (h.match(/<\/script/gi) || []).length; };
  const pEvil = P();
  pEvil.management.managers = [{ name: 'x</script><script>alert(1)</script>', short: 'a</script>b', title: '<!--<script>' }];
  const evilMg = { final: { name: 'Y<!--<script>', short: 'Y', title: '', date: '2026.10.10', at: '2026-10-10T00:00:00.000Z' } };
  const recEvil = plain(rec); recEvil.management = evilMg; recEvil.applicant.reviewerNotes = '<!-- <script> & </script>';
  const htmlEvil = S.generateReportHTML(recEvil, pEvil);
  assert.strictEqual(closeCount(htmlEvil), closeCount(html), 'script 要素の数が変わらない');
  const jsonBlock = function (h, id) { return h.match(new RegExp('id="' + id + '">([\\s\\S]*?)<\\/script>'))[1]; };
  ['recruit-record', 'recruit-mgmt-config'].forEach(function (id) {
    assert.ok(!/[<>&]/.test(jsonBlock(htmlEvil, id)), id + ' に生の < > & が無い');
  });
  const cfgEvil = JSON.parse(jsonBlock(htmlEvil, 'recruit-mgmt-config'));
  assert.deepStrictEqual(plain(cfgEvil.managers), plain(pEvil.management.managers));
  const recBack = JSON.parse(jsonBlock(htmlEvil, 'recruit-record'));
  assert.deepStrictEqual(plain(recBack.management), evilMg);
  assert.strictEqual(recBack.applicant.reviewerNotes, '<!-- <script> & </script>');
  // レポート内の「押印を保存」も同じエスケープで書き戻す
  assert.ok(html.indexOf('recNode.textContent=JSON.stringify(rec).replace(/[<>&') > 0 && html.indexOf('addEventListener("beforeunload"') > 0);
  const cfg = JSON.parse(html.match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]);
  assert.ok(cfg.managers.some(function (m) { return m.short === '笹川'; }));
  assert.strictEqual(cfg.fields.length, 2);
  assert.strictEqual(cfg.interviewerField, 'interviewer', '担当と連動する押印欄（窓の担当者の初期選択）');
  // 埋め込みレコードは読み戻せる（JSON の </ エスケープを含めて）
  const back = JSON.parse(html.match(/id="recruit-record">([\s\S]*?)<\/script>/)[1]);
  assert.strictEqual(back.management.interviewer.short, '笹川');
  // 旧レコード（management なし）でも例外を出さず、未押印で出る
  const old = plain(rec); delete old.management;
  const htmlOld = S.generateReportHTML(old, p);
  assert.ok(htmlOld.indexOf('<div class="cl-stamps">') > 0 && (noScript(htmlOld).match(/<svg class="hanko"/g) || []).length === 0 && noScript(htmlOld).indexOf('<div class="stamp-empty">未押印</div>') > 0);
  // 名簿なし・手入力 OFF でも落ちない（選択肢は窓を開いたときにスクリプトが作る）
  const p2 = P(); p2.management.managers = []; p2.management.allowFreeName = false;
  const html2 = S.generateReportHTML(rec, p2);
  assert.ok(noScript(html2).indexOf('__free') < 0 && html2.indexOf('担当者を選択') > 0);
  assert.strictEqual(JSON.parse(html2.match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]).allowFreeName, false);
});

test('54 既定の台本（面接チェックリスト 2026-10-08 版）', function () {
  const def = P().checklist;
  assert.strictEqual(def.version, '2026-10-08');
  assert.deepStrictEqual(plain(def.sections.map(function (s) { return s.id; })), ['conditions', 'continuity', 'job', 'teamwork', 'reverse']);
  assert.deepStrictEqual(plain(def.sections.map(function (s) { return s.minutes; })), [10, 3, 10, 8, 10]);
  assert.deepStrictEqual(plain(def.sections.map(function (s) { return s.minutesMax; })), [false, false, false, false, true]);
  assert.deepStrictEqual(plain(def.sections.map(function (s) { return s.page; })), [1, 1, 2, 2, 2]);
  const cnt = {};
  R.CHECKLIST_BLOCK_TYPES.forEach(function (t) { cnt[t] = R.checklistItems(def, t).length; });
  assert.deepStrictEqual(plain(cnt), { must: 2, fields: 6, explain: 14, question: 13, rating: 7, notify: 2, note: 0 });
  // 台本 PPTX の配置どおり: ① の必須条件は左列の 2 件、② の【説明】に提出・連絡・欠勤の 3 件、③④⑤ は各列の中身
  const blockIds = function (sid) { return plain(def.sections.find(function (s) { return s.id === sid; }).blocks.map(function (b) { return b.id; })); };
  assert.deepStrictEqual(plain(R.checklistItems(def, 'must').map(function (x) { return x.item.id; })), ['must_weekly', 'must_busy']);
  assert.deepStrictEqual(blockIds('continuity'), ['continuity_explain', 'continuity_q', 'continuity_rate']);
  assert.deepStrictEqual(blockIds('job'), ['job_explain', 'job_q', 'job_rate']);
  assert.deepStrictEqual(blockIds('teamwork'), ['teamwork_explain', 'teamwork_q', 'teamwork_rate']);
  assert.deepStrictEqual(blockIds('reverse'), ['reverse_q', 'reverse_notify', 'reverse_rate']);
  const qOf = function (sid) { return plain(R.checklistItems(def, 'question').filter(function (x) { return x.section.id === sid; }).map(function (x) { return x.item.id; })); };
  assert.deepStrictEqual(qOf('job'), ['q_value', 'q_failure', 'q_unsure']);
  assert.deepStrictEqual(qOf('teamwork'), ['q_feedback', 'q_unknown', 'q_busy_mind']);
  assert.deepStrictEqual(qOf('reverse'), ['q_concerns']);
  const ids = clAllIds(def);
  ids.forEach(function (id) { assert.ok(CL_ID.test(id), id); });
  assert.strictEqual(ids.length, new Set(ids).size, '一意');
  assert.strictEqual(R.interviewModel(P(), R.emptyChecklist()).max, 16);
  assert.strictEqual(R.circled(1), '①');
  assert.strictEqual(R.circled(5), '⑤');
  const x = R.checklistItems(def, 'rating')[6];
  assert.strictEqual(x.item.id, 'rt_mismatch');
  assert.strictEqual(x.no, 5);
  assert.strictEqual(x.noMark, '⑤');
  // 台本の文言が入っている
  assert.ok(R.checklistItems(def, 'question').some(function (q) { return q.item.label.indexOf('歌舞伎町ですので') >= 0; }));
  // 旧 10 項目（evaluation.items）と自動表示（auto / autoParams）は 2026-10-14 に削除（docs/SPEC-slim.md K3・D8）
  assert.deepStrictEqual(Object.keys(P().evaluation), ['thresholds']);
  R.checklistItems(def).forEach(function (x) { assert.ok(!('auto' in x.item) && !('autoParams' in x.item), x.item.id); });
});

test('55 得点率と帯（○△×＋総合判断）', function () {
  const cases = [
    [clAll('good'), 16, 100, 'high'],
    [clMarks(['good', 'good', 'good', 'good', 'good', 'fair', 'fair']), 14, 87.5, 'high'],
    [clMarks(['good', 'fair', 'good', 'fair', 'good', 'fair', 'good']), 13, 81.3, 'high'],
    [clMarks(['good', 'good', 'good', 'good', 'fair', 'fair', 'poor']), 12, 75, 'high'],
    [clMarks(['good', 'good', 'good', 'fair', 'fair', 'fair', 'poor']), 11, 68.8, 'mid'],
    [clAll('fair'), 9, 56.3, 'mid'],
    [clMarks(['good', 'fair', 'fair', 'fair', 'poor', 'poor', 'poor'], 'hold'), 6, 37.5, 'low'],
    [clAll('poor'), 2, 12.5, 'low']
  ];
  cases.forEach(function (c, i) {
    const j = judgeS(c[0]);
    assert.strictEqual(j.total, c[1], 'case ' + i);
    assert.strictEqual(j.max, 16, 'case ' + i);
    assert.strictEqual(j.pct, c[2], 'case ' + i);
    assert.strictEqual(j.interview.band, c[3], 'case ' + i);
    assert.strictEqual(j.interviewMode, 'checklist');
    assert.strictEqual(j.scaleMax, 2);
    const m = R.interviewModel(P(), c[0]);
    assert.strictEqual(m.total, c[1]); assert.strictEqual(m.pct, c[2]); assert.strictEqual(m.band, c[3]);
  });
  const j = judgeS(clAll('good'));
  assert.strictEqual(j.thresholds.recommendPts, 12);
  assert.strictEqual(j.thresholds.reviewPts, 7);
  assert.strictEqual(j.breakdown.length, 8);
  const last = j.breakdown[7];
  assert.ok(last.isOverall && last.id === '__overall' && last.mark === 'hire' && last.markLabel === '採用' && last.label === '面接者の総合判断');
  assert.strictEqual(j.breakdown[0].mark, 'good');
  assert.strictEqual(j.breakdown[0].markLabel, '○');
  assert.strictEqual(j.breakdown[0].sectionNo, 1);
  assert.strictEqual(j.breakdown[0].sectionId, 'conditions');
  assert.deepStrictEqual(plain(j.checklist.counts), { good: 7, fair: 0, poor: 0, blank: 0 });
  assert.strictEqual(j.checklist.version, '2026-10-08');
  assert.deepStrictEqual(plain(j.checklist.overall), { value: 'hire', label: '採用', points: 2 });
  assert.strictEqual(j.result, 'recommend');
  // 確認点 1 件未入力 → 2 点減・警告
  const cl1 = clAll('good'); delete cl1.values.rt_team;
  const j1 = judgeS(cl1);
  assert.strictEqual(j1.total, 14);
  assert.ok(hasWarn(j1, '未入力の確認点が1件あります（0点として集計）'), j1.warnings.join('\n'));
  assert.ok(!hasWarn(j1, '未入力の評価項目'));
  assert.strictEqual(j1.checklist.counts.blank, 1);
  // 総合判断が未入力
  const cl2 = clAll('good'); cl2.overall = '';
  const j2 = judgeS(cl2);
  assert.strictEqual(j2.total, 14);
  assert.ok(hasWarn(j2, '面接者の総合判断が未入力です（結果は上長最終判断要として扱います）'), j2.warnings.join('\n'));
  // 不正な値は未入力扱い
  const cl3 = clAll('good'); cl3.values.rt_team = 'excellent'; cl3.overall = 'maybe';
  assert.strictEqual(judgeS(cl3).total, 12);
  // 引数は (profile, cl)。cl がオブジェクトでなければ空の回答（D7）
  assert.strictEqual(R.interviewModel(P(), null).max, 16);
  assert.strictEqual(R.interviewModel(P(), null).mode, 'checklist');
});

test('63 checklistSummary（ビューモデル）', function () {
  const p = P();
  const a = SA({ name: 'テスト 太郎' });
  const cl = R.emptyChecklist();
  const s0 = R.checklistSummary(a, cl, p, {});
  assert.strictEqual(s0.sections.length, 5);
  assert.strictEqual(s0.ratings.length, 7);
  assert.strictEqual(s0.must.items.length, 2);
  assert.strictEqual(s0.must.unknown, 2);
  assert.strictEqual(s0.minutesTotal, 41);
  assert.ok(!('mode' in s0) && !('autos' in s0), 'mode・autos は返さない（D8）');
  assert.strictEqual(s0.hasInput, false);
  assert.strictEqual(s0.score.max, 16);
  assert.strictEqual(s0.sections[0].noMark, '①');
  assert.strictEqual(s0.sections[4].minutesText, '最大10分');
  assert.strictEqual(s0.sections[0].minutesText, '10分');
  assert.strictEqual(s0.sections[0].done, false);
  assert.strictEqual(s0.pages.length, 2);
  // ① の done = 必須条件すべて回答 ＋ 確認点すべて入力
  R.checklistItems(p.checklist, 'must').forEach(function (x) { cl.values[x.item.id] = 'match'; });
  cl.values.rt_concrete = 'good';
  assert.strictEqual(R.checklistSummary(a, cl, p, {}).sections[0].done, false);
  cl.values.rt_manner = 'fair';
  cl.values.must_busy = 'mismatch';
  const s1 = R.checklistSummary(a, cl, p, {});
  assert.strictEqual(s1.sections[0].done, true);
  assert.strictEqual(s1.sections[0].mustMismatch, 1);
  assert.strictEqual(s1.must.mismatch, 1);
  const mp = s1.must.items.find(function (m) { return m.id === 'must_busy'; });
  assert.ok(mp.valueLabel === '不一致' && mp.mark === '×' && mp.tone === 'danger');
  assert.ok(!('autoText' in s1.must.items[0]), '必須条件に応募情報からの見込みを付けない');
  // effective（記入欄は手入力の値だけ）・dim（短期求人のみの説明）
  const f1 = s1.sections[0].blocks.find(function (b) { return b.id === 'conditions_f1'; });
  const wk = f1.items.find(function (x) { return x.id === 'weekend'; });
  assert.ok(wk.effective === '' && !('fromAuto' in wk) && wk.value === '' && wk.effectiveLabel === '', JSON.stringify(plain(wk)));
  cl.values.weekend = 'one';
  const wk2 = R.checklistSummary(a, cl, p, {}).sections[0].blocks[1].items[0];
  assert.ok(wk2.effective === 'one' && wk2.effectiveLabel === 'いずれか');
  assert.deepStrictEqual(plain(s1.header.taxi), { text: '', tone: 'muted' }, 'タクシーは手入力の値だけ');
  const ex = s1.sections[0].blocks.find(function (b) { return b.type === 'explain'; });
  assert.deepStrictEqual(plain(ex.items.map(function (x) { return x.dim; })), [false, false, true, true]);
  cl.header.posting = 'short';
  const s2 = R.checklistSummary(a, cl, p, {});
  assert.deepStrictEqual(plain(s2.sections[0].blocks[2].items.map(function (x) { return x.dim; })), [false, false, false, false]);
  assert.strictEqual(s2.header.postingLabel, '短期求人');
  // interviewer: 空なら押印「面接対応者」の氏名
  const s3 = R.checklistSummary(a, cl, p, { management: { interviewer: { name: '笹川 晴央' } } });
  assert.strictEqual(s3.header.interviewer, '笹川 晴央');
  assert.strictEqual(s3.header.interviewerFromStamp, true);
  cl.header.interviewer = '山田 太郎';
  const s4 = R.checklistSummary(a, cl, p, { management: { interviewer: { name: '笹川 晴央' } } });
  assert.strictEqual(s4.header.interviewer, '山田 太郎');
  assert.strictEqual(s4.header.interviewerFromStamp, false);
  // タクシーの上書き・メモ・総合判断
  cl.header.taxi = '可・2,000円（本人申告）';
  cl.notes.conditions_q = '長期希望';
  cl.overall = 'hold';
  const s5 = R.checklistSummary(a, cl, p, {});
  assert.deepStrictEqual(plain(s5.header.taxi), { text: '可・2,000円（本人申告）', tone: 'info' });
  assert.strictEqual(s5.sections[0].blocks.find(function (b) { return b.id === 'conditions_q'; }).memoText, '長期希望');
  assert.deepStrictEqual(plain(s5.overall), { value: 'hold', label: '保留', points: 1, tone: 'warn' });
  assert.strictEqual(s5.score.total, 2 + 1 + 1);
  // checklistDiff
  const d2 = plain(p.checklist);
  d2.sections[0].blocks[5].items.splice(1, 1);                                 // rt_manner を削除
  d2.sections[3].blocks[2].items.push({ id: 'rt_new', label: '新しい確認点' });   // ④ に追加
  assert.deepStrictEqual(plain(R.checklistDiff(p.checklist, d2)), { added: ['rt_new'], removed: ['rt_manner'] });
  assert.strictEqual(R.interviewModel(merge(P(), { checklist: d2 }), R.emptyChecklist()).max, 16);
  // 壊れた引数でも落ちない
  assert.strictEqual(R.checklistSummary({}, null, { checklist: null }, null).sections.length, 0);
});

test('64 normalize（面接チェックリスト）', function () {
  const base = plain(P().checklist);
  // checklist なし → 既定の台本
  const v2 = P(); delete v2.checklist;
  assert.deepStrictEqual(plain(S.normalizeProfile(v2).checklist), base);
  // 既定は変わらない
  assert.deepStrictEqual(plain(S.normalizeProfile(P()).checklist), base);
  // 壊れた checklist → 既定
  const bad = P(); bad.checklist = { sections: 'x', mustFailResult: 'xxx' };
  const nb = S.normalizeProfile(bad);
  assert.deepStrictEqual(plain(nb.checklist), base);
  assert.strictEqual(nb.checklist.mustFailResult, 'reject');
  const bad2 = P(); bad2.checklist = 'x';
  assert.deepStrictEqual(plain(S.normalizeProfile(bad2).checklist), base);
  const bad3 = P(); bad3.checklist.sections = [null, 3];
  assert.deepStrictEqual(plain(S.normalizeProfile(bad3).checklist), base);
  // 部分的に壊れた値
  const p = P();
  const c = p.checklist;
  c.sections[0].blocks.splice(1, 0, { id: 'zzz', type: 'video', items: [] });           // 不正な block type → 除去
  delete c.sections[0].blocks[0].items[1].id;                                           // id 欠落 → conditions_must_2
  c.sections[1].blocks[2].items[1].id = 'rt_hourensou';                                 // 重複 → rt_hourensou_2
  c.sections[0].blocks[2].items[0].options = [];                                        // choice の選択肢なし → text
  c.mustFailResult = 'xxx';
  c.overallCaps.hold = 'up';
  c.sections[0].blocks[0].items[0].auto = 'weeklyCondition';                            // 自動表示（2026-10-14 に削除）→ 外す
  c.sections[0].blocks[0].items[0].autoParams = { minDays: 3 };
  c.sections[1].title = 7;
  c.sections[1].minutes = 99;
  c.sections[2].page = 0;
  c.sections[0].blocks[0].items[0].label = '土日を含む週3日以上（各5時間以上）';          // 編集した文言は保持
  c.sections[2].blocks[0].items.push({ text: '旧キーの説明' });                           // text → label・id 採番
  c.sections[0].blocks[4].items[2].auto = 'firstEnd';                                   // 自動表示 → 外す（splice で 1 つずれている）
  c.sections[0].blocks[4].items[2].autoParams = { monthsAfter: 99 };
  c.header.negatives = [{ id: 'short', label: '短期希望', auto: 'shortTerm' }, { label: '平日のみ', auto: 'weekdayOnly' }];   // 旧い設定の消極属性 → 外す
  c.header.morningOnlyEnd = '25:00';
  c.print.showQuestions = 'yes';
  c.title = 'スタッフ面接チェックリスト'; c.intro = '台本の順に確認し…';                  // 台本の題名・説明文（2026-10-14 に削除。どこにも表示しない）→ 外す
  c.myExtension = { keep: true };                                                       // 未知のキーは残す
  const n = S.normalizeProfile(p).checklist;
  assert.ok(!n.sections[0].blocks.some(function (b) { return b.type === 'video'; }));
  assert.strictEqual(n.sections[0].blocks[0].items[1].id, 'conditions_must_2');
  assert.strictEqual(n.sections[1].blocks[2].items[1].id, 'rt_hourensou_2');
  assert.strictEqual(n.sections[0].blocks[1].items[0].kind, 'text');
  assert.strictEqual(n.mustFailResult, 'reject');
  assert.strictEqual(n.overallCaps.hold, 'review');
  assert.strictEqual(n.sections[0].blocks[0].items[0].auto, undefined);
  assert.strictEqual(n.sections[0].blocks[0].items[0].autoParams, undefined);
  assert.strictEqual(n.sections[1].title, '7');
  assert.strictEqual(n.sections[1].minutes, 0);
  assert.strictEqual(n.sections[2].page, 1);
  assert.strictEqual(n.sections[0].blocks[0].items[0].label, '土日を含む週3日以上（各5時間以上）');
  const added = n.sections[2].blocks[0].items[4];
  assert.ok(added.label === '旧キーの説明' && added.text === undefined && added.id === 'job_explain_5', JSON.stringify(added));
  assert.strictEqual(n.sections[0].blocks[3].items[2].id, 'first_end');
  assert.ok(!('auto' in n.sections[0].blocks[3].items[2]) && !('autoParams' in n.sections[0].blocks[3].items[2]));
  R.checklistItems(n).forEach(function (x) { assert.ok(!('auto' in x.item) && !('autoParams' in x.item), '自動表示を外す: ' + x.item.id); });
  assert.ok(!('negatives' in n.header) && !('morningOnlyEnd' in n.header), '消極属性（negatives・morningOnlyEnd）は正規化で外す: ' + JSON.stringify(plain(n.header)));
  assert.deepStrictEqual(Object.keys(n.header).sort(), ['interviewerField', 'posting']);
  assert.strictEqual(n.print.showQuestions, true);
  assert.ok(!('title' in n) && !('intro' in n) && n.version === '2026-10-08', '台本の題名・説明文は正規化で外す（版は残す）');
  assert.ok(!('title' in base) && !('intro' in base), '既定の台本に題名・説明文は無い');
  assert.deepStrictEqual(plain(n.myExtension), { keep: true });
  // mustFailJumpTo が存在しないセクション → ''
  const pj = P(); pj.checklist.mustFailJumpTo = 'nowhere';
  assert.strictEqual(S.normalizeProfile(pj).checklist.mustFailJumpTo, '');
  const pj2 = P(); pj2.checklist.sections.pop();
  assert.strictEqual(S.normalizeProfile(pj2).checklist.mustFailJumpTo, '');
  // 冪等
  const once = S.normalizeProfile(p);
  assert.deepStrictEqual(plain(S.normalizeProfile(once)), plain(once));
  // id は全体で一意・形式どおり
  const ids2 = clAllIds(n);
  assert.strictEqual(ids2.length, new Set(ids2).size);
  ids2.forEach(function (id) { assert.ok(CL_ID.test(id), id); });
  // evaluation は帯の境界だけ
  assert.deepStrictEqual(Object.keys(once.evaluation), ['thresholds']);
  // 正規化後の台本で判定できる（編集した文言が理由文に出る）
  const cl = clAll('good', 'hire', null, once);
  cl.values.must_weekly = 'mismatch';
  assert.ok(judgeS(cl, once).adjustments[0].reason.indexOf('土日を含む週3日以上（各5時間以上）') >= 0);
  // normalizeChecklistDef 単体（レポート用）
  assert.deepStrictEqual(plain(S.normalizeChecklistDef(null, P().checklist)), base);
  assert.deepStrictEqual(plain(S.normalizeChecklistDef(P().checklist, P().checklist)), base);
});

test('65 validateProfile（面接チェックリスト）', function () {
  assert.deepStrictEqual(plain(S.validateProfile(P())), { errors: [], warnings: [] });
  const one = function (mut, label) {
    const px = P(); mut(px.checklist, px);
    const r = plain(S.validateProfile(px));
    assert.strictEqual(r.errors.length, 1, label + ': ' + JSON.stringify(r.errors));
    return r;
  };
  const r1 = one(function (c) { c.sections[0].blocks[0].items[1].label = ''; }, 'label 空');
  assert.strictEqual(r1.errors[0], '面接チェックリスト ① 勤務条件【必須条件】の2行目が空です。');
  one(function (c) { c.sections[1].blocks[2].items[1].id = 'rt_hourensou'; }, 'id 重複');
  one(function (c) { c.sections[1].blocks[2].items[1].id = '1abc'; }, 'id 形式');
  one(function (c) { c.sections[0].blocks[1].items[0].options = [{ value: 'one', label: 'いずれか' }]; }, 'choice 1 件');
  one(function (c) { c.sections[0].blocks[1].items[0].options = [{ value: 'one', label: 'a' }, { value: 'one', label: 'b' }]; }, 'choice 重複');
  one(function (c) { c.overallLabel = ''; }, 'overallLabel 空');
  one(function (c) { c.overallOptions.hold = ' '; }, 'overallOptions 空');
  one(function (c) { c.sections[0].minutes = 61; }, 'minutes 61');
  one(function (c) { c.sections[0].page = 0; }, 'page 0');
  one(function (c) { c.sections[2].title = ''; }, 'セクション名 空');
  one(function (c) { c.sections[0].blocks[0].type = 'video'; }, 'block type');
  one(function (c) { c.mustFailResult = 'xxx'; }, 'mustFailResult');
  one(function (c) { c.mustUnknownResult = 'reject'; }, 'mustUnknownResult');
  one(function (c) { c.overallCaps.reject = 'up'; }, 'overallCaps');
  // 自動表示（auto / autoParams）は 2026-10-14 に削除したので、旧い値が残っていても検査しない（正規化で外れる）
  const pa = P(); pa.checklist.sections[0].blocks[0].items[0].auto = 'magic'; pa.checklist.sections[0].blocks[0].items[0].autoParams = { minDays: 8 };
  assert.deepStrictEqual(plain(S.validateProfile(pa)), { errors: [], warnings: [] });
  // 消極属性の「朝～12時のみ」の終了時刻（morningOnlyEnd）は削除したので、旧い値が壊れていてもエラーにしない
  const pm = P(); pm.checklist.header.morningOnlyEnd = '12時'; pm.checklist.header.negatives = 'x';
  assert.deepStrictEqual(plain(S.validateProfile(pm)), { errors: [], warnings: [] });
  const r0 = plain(S.validateProfile((function () { const px = P(); px.checklist.sections = []; return px; })()));
  assert.ok(r0.errors.some(function (e) { return e.indexOf('セクションがありません') >= 0; }), JSON.stringify(r0));
  // warnings: 確認点 0・必須条件 0・押印欄なし
  const pw = P();
  pw.checklist.sections.forEach(function (s) { s.blocks = s.blocks.filter(function (b) { return b.type !== 'rating' && b.type !== 'must'; }); });
  pw.checklist.header.interviewerField = 'nobody';
  const rw = plain(S.validateProfile(pw));
  assert.strictEqual(rw.errors.length, 0, JSON.stringify(rw.errors));
  assert.deepStrictEqual(rw.warnings, ['確認点がありません。面接評価は総合判断だけで決まります。', '必須条件がないため、不一致による不採用推奨は働きません。', '担当と連動する押印欄が見つかりません。']);
  // 確認点 0 件でも判定できる（面接評価は総合判断だけ）
  assert.strictEqual(R.interviewModel(pw, R.emptyChecklist()).max, 2);
  const jw = judgeS({ values: {}, notes: {}, overall: 'hire' }, pw);
  assert.strictEqual(jw.pct, 100);
});

test('66 保存レコード（checklist・checklistDef・旧 scores の互換）', function () {
  const p = P();
  const a = SA({ name: '山田 花子' });
  const cl = clAll('good');
  cl.values.rt_team = 'fair';
  cl.notes.conditions_q = '長期希望 </script><!--x <script>';
  cl.header.date = '2026-10-10';
  const j = R.evaluateScript(a, cl, p, OPTS);
  const state = { step: 4, applicant: a, profile: p, checklist: cl, interviewNotes: '受け答えが丁寧', judgment: j, management: {} };
  const rec = S.buildRecord(state);
  assert.strictEqual(rec.schemaVersion, 2);
  assert.deepStrictEqual(plain(rec.checklist), plain(cl));
  assert.strictEqual(rec.checklistDef.version, '2026-10-08');
  assert.deepStrictEqual(plain(rec.checklistDef), plain(p.checklist));
  assert.ok(!('scores' in rec), '旧形式の面接評価は書かない');
  assert.strictEqual(rec.judgment.interviewMode, 'checklist');
  assert.strictEqual(rec.judgment.total, 15);
  // state.checklist が無い（旧 state）→ 空の回答
  const recOld = S.buildRecord(Object.assign({}, state, { checklist: undefined }));
  assert.deepStrictEqual(plain(recOld.checklist), plain(R.emptyChecklist()));
  // レポートの埋め込み JSON は閉じタグ・コメント開始を含むメモでも同じ値に戻る
  const html = S.generateReportHTML(rec, p);
  const block = html.match(/id="recruit-record">([\s\S]*?)<\/script>/)[1];
  assert.ok(!/[<>&]/.test(block));
  const back = JSON.parse(block);
  assert.deepStrictEqual(back.checklist, plain(cl));
  // 旧レコード（scores のみ・checklist なし）でもレポートが作れる（旧形式の面接評価は出さない。K3）。用紙は白紙の台本（結果「未実施」）
  const html2 = S.generateReportHTML(plain(Object.assign({}, recOld, { checklist: undefined, checklistDef: undefined, scores: { greeting: 4 }, judgment: null })), p);
  assert.ok(html2.indexOf('data-sec="scores"') < 0 && html2.indexOf('面接評価（旧形式') < 0 && html2.indexOf('<main class="a4" id="a4"><div class="cl-sheet cl-mode-sheet">') > 0 &&
    html2.indexOf('<span class="cl-tile-k">結果</span><span class="cl-tile-v">未実施</span>') > 0);
  // 旧プロファイル（checklist なし）で判定しても落ちない（normalize で既定の台本が入る）
  const pOld = P(); delete pOld.checklist;
  const jOld = R.evaluateScript(a, cl, pOld, OPTS);
  assert.strictEqual(jOld.interviewMode, 'checklist');
  assert.strictEqual(jOld.max, 2);   // 台本が無い profile は確認点 0 ＋総合判断のみ
  assert.strictEqual(S.normalizeProfile(pOld).checklist.version, '2026-10-08');

  // ---- 保存 HTML の用紙（A4 1 枚の要約。docs/SPEC-a4.md。台本の全文の節は 2026-10-14 に削除）----
  assert.ok(html.indexOf('data-sec=') < 0 && html.indexOf('cl-mode-section') < 0, '節（section.sec）・台本の全文は無い');
  ['①', '②', '③', '④', '⑤'].forEach(function (c) { assert.ok(html.indexOf('<td class="cl-rt-no">' + c + '</td>') > 0, c); });
  ['勤務条件', '継続性・報連相', '合否連絡'].forEach(function (t) { assert.ok(html.indexOf(t) > 0, t); });
  assert.ok(html.indexOf('長期希望 &lt;/script&gt;&lt;!--x') > 0, 'メモはエスケープして用紙に出す');
  assert.ok(html.indexOf('○一致') > 0 && html.indexOf('<span class="cl-mark m-good">○</span>') > 0 && html.indexOf('<span class="cl-mark m-fair">△</span>') > 0);
  assert.ok(html.indexOf('cl-mode-sheet') > 0 && html.indexOf('<div class="cl-judge" data-result="recommend">') > 0 && html.indexOf('面接チェックリスト報告') > 0);
  assert.ok(html.indexOf('受け答えが丁寧') > 0);
  assert.ok(html.indexOf('<span class="cl-tile-k">必須条件</span><span class="cl-tile-v">すべて一致</span>') > 0, '結果ストリップに必須条件');
  // 閉じタグ・コメント開始を含むメモでも埋め込みスクリプトが壊れない（script 要素は 3 つ: record・押印設定・用紙の操作）
  assert.strictEqual((html.match(/<\/script>/g) || []).length, 3);
  assert.strictEqual((html.match(/<\/script>/g) || []).length, (html.match(/<script[ >]/g) || []).length);
  assert.strictEqual(S.checklistSheetCss().indexOf('</' + 'script'), -1);
  // 不一致 → 「×不一致」と結果
  const clNg = clAll('good'); clNg.values.must_weekly = 'mismatch';
  clNg.header.date = '2026-10-10';
  const jNg = R.evaluateScript(a, clNg, p, OPTS);
  const recNg = S.buildRecord(Object.assign({}, state, { checklist: clNg, judgment: jNg }));
  const sheetNg = S.checklistSheetHtml(recNg, p, {});
  // 1 ページの A4（2026-10-14）: 旧 .cl-s-ng（不一致のセクション）の代わりに【必須条件】ブロックの .cl-must-ng と行の .m-mismatch
  assert.ok(sheetNg.indexOf('×不一致') > 0 && sheetNg.indexOf('cl-must-ng') > 0 && sheetNg.indexOf('class="m-mismatch" data-cl-item="must_weekly"') > 0 && sheetNg.indexOf('不採用推奨') > 0 && sheetNg.indexOf('不一致 1') > 0);
  // 必須条件の不一致の理由は A4 の判定サマリー（.cl-adj）にも出る
  assert.ok(/<ul class="cl-adj"><li><b>[^<]*<\/b>：必須条件が一致しないため（土日を含む週3日以上、5時間以上）、不採用推奨とします。/.test(sheetNg), 'cl-adj に必須条件の理由');
  // ヘッダーの「ラベル 値」は Step3 の目次（.cl-chip）と別クラス（アプリの印刷規則で消えない）。1 ページの A4 は dl.cl-sh-kv
  assert.ok(sheetNg.indexOf('<dl class="cl-sh-kv">') > 0 && sheetNg.indexOf('class="cl-chip') < 0 && sheetNg.indexOf('cl-flow') < 0);
  // 【説明】ブロックのメモ欄を ON にしたときはメモも出力する
  const pm = P(); pm.checklist.sections[2].blocks[0].memo = true; pm.checklist.sections[2].blocks[0].memoLabel = '反応';
  const clM = clAll('good'); clM.notes.job_explain = 'EXPLAIN_MEMO 汚物清掃は難しいと回答';
  const recM = S.buildRecord(Object.assign({}, state, { checklist: clM, judgment: null }));
  const recMd = Object.assign({}, recM, { checklistDef: pm.checklist });
  // 1 ページの A4 は【面接メモ】の 1 行（セクション番号＋メモ欄の名前：本文）
  const hmSheet = S.checklistSheetHtml(recMd, pm, {});
  assert.ok(hmSheet.indexOf('<div class="cl-nm-k"><span class="cl-nm-no">③</span>反応</div><div class="cl-nm-v">EXPLAIN_MEMO 汚物清掃は難しいと回答</div>') > 0, 'sheet');
  // 判定前（judgment なし）は未実施と書く（判定を走らせない）
  const sheetNoJ = S.checklistSheetHtml(Object.assign({}, rec, { judgment: null }), p, {});
  //   1 ページの A4: 結果タイルに「未実施」、確認点タイルはその時点の点（15/16）。押印行は押印欄の設定から（押印なしなら未押印 2 つ）
  assert.ok(sheetNoJ.indexOf('<div class="cl-judge cl-judge-none">') > 0 && sheetNoJ.indexOf('<span class="cl-tile-k">結果</span><span class="cl-tile-v">未実施</span>') > 0 &&
    sheetNoJ.indexOf('<span class="cl-tile-k">確認点</span><span class="cl-tile-v">15<small>/16点</small></span>') > 0 && (sheetNoJ.match(/<div class="stamp-empty">未押印<\/div>/g) || []).length === 2);
  // 担当は押印（面接対応者）から。タクシーは手入力の値だけ（「（手入力）」「（自動）」は付けない）。旧レコードの消極属性（header.negatives）は出さない
  const clH = plain(cl); clH.header.interviewer = ''; clH.header.taxi = '否（手入力）'; clH.header.negatives = { morningOnly: 'on' };
  const recH = Object.assign({}, rec, { checklist: clH, management: { interviewer: { name: '笹川 晴央' } } });
  const shHd = S.checklistSheetHtml(recH, p, {});
  assert.ok(shHd.indexOf('<dt>担当</dt><dd>笹川 晴央</dd>') > 0, '用紙の担当（押印より）');
  assert.ok(shHd.indexOf('<dt>タクシー可否・料金</dt><dd>否（手入力）</dd>') > 0 && shHd.indexOf('<small>（手入力）</small>') < 0, '用紙のタクシー');
  assert.ok(shHd.indexOf('消極属性') < 0 && shHd.indexOf('朝～12時のみ') < 0, '旧レコードの消極属性（朝～12時のみ）は用紙に出さない');
  // {mode:'section'} を渡しても 1 ページの要約（台本の全文の描画は削除。docs/SPEC-a4.md S1）
  const secOnly = S.checklistSheetHtml(rec, p, { mode: 'section' });
  assert.strictEqual(secOnly, S.checklistSheetHtml(rec, p, {}));
  assert.ok(secOnly.indexOf('cl-mode-section') < 0 && secOnly.indexOf('cl-mode-sheet') > 0 && secOnly.indexOf('台本1枚目') < 0);
  //   1 ページの A4（2026-10-14）は確認点の名前だけ（補足＝説明文は載せない）
  const sheetH = S.checklistSheetHtml(rec, p, {});
  assert.ok(sheetH.indexOf('cl-hint') < 0 && sheetH.indexOf('「大丈夫です」のみ連呼は特に要注意。') < 0 && sheetH.indexOf('○＝不安・不明点を解消できた') < 0 && sheetH.indexOf('勤務条件の一致に「具体性」があるか') > 0, 'sheet に hint なし');
  // 保存時点の台本（checklistDef）の文言で出す: 現在の profile の確認点・必須条件の文言を変えても用紙は保存時の文言
  const p2 = P();
  R.checklistItems(p2.checklist, 'rating')[0].item.label = '具体性（変更後の文言）';
  R.checklistItems(p2.checklist, 'must')[0].item.label = '週4日以上（変更後の文言）';
  const html3 = S.generateReportHTML(rec, p2);
  assert.ok(html3.indexOf('勤務条件の一致に「具体性」があるか') > 0 && html3.indexOf('土日を含む週3日以上、5時間以上') > 0 && html3.indexOf('変更後の文言') < 0);
  // checklistDef が無い（保存前の旧データ）なら現在の台本
  const html3b = S.generateReportHTML(Object.assign({}, rec, { checklistDef: null }), p2);
  assert.ok(html3b.indexOf('具体性（変更後の文言）') > 0 && html3b.indexOf('週4日以上（変更後の文言）') > 0);
  // print.showQuestions（効き先だった「詳細」表示は 2026-10-14 に削除）: キーは互換のため正規化で残るが、用紙の出力は true／false で変わらない。
  //   用紙は設定に関係なく質問文・hint を載せず、メモは載せる
  const pq = P(); pq.checklist.print.showQuestions = false;
  const pqT = P(); pqT.checklist.print.showQuestions = true;
  assert.strictEqual(S.normalizeChecklistDef(pq.checklist, S.defaults().checklist).print.showQuestions, false, 'showQuestions は正規化で残る（互換）');
  const sheetQ = S.checklistSheetHtml(Object.assign({}, rec, { checklistDef: pq.checklist }), pq, {});
  const sheetQT = S.checklistSheetHtml(Object.assign({}, rec, { checklistDef: pqT.checklist }), pqT, {});
  assert.strictEqual(sheetQ, sheetQT, 'showQuestions の true／false で用紙は同じ');
  assert.ok(sheetQT.indexOf('cl-qs') < 0 && sheetQT.indexOf('歌舞伎町ですので') < 0 && sheetQT.indexOf('cl-hint') < 0 && sheetQT.indexOf('長期希望 &lt;/script&gt;') > 0, 'true でも質問文・hint は出さない（メモは出る）');
  // 旧 scores ＋チェックリスト入力 → チェックリストの用紙だけ（旧評価の「参考」も出さない）
  const html4 = S.generateReportHTML(Object.assign({}, rec, { scores: { greeting: 4, overall_judgment: 4 } }), p);
  assert.ok(html4.indexOf('id="a4"') > 0 && html4.indexOf('面接評価（旧形式') < 0 && html4.indexOf('data-sec="scores"') < 0);
  // 入力なし（① で保存）→ 白紙の台本の用紙（結果「未実施」・確認点はすべて「—」）
  const html5 = S.generateReportHTML(Object.assign({}, rec, { checklist: R.emptyChecklist(), judgment: null, step: 1 }), p);
  assert.ok(html5.indexOf('<span class="cl-tile-k">結果</span><span class="cl-tile-v">未実施</span>') > 0 && (html5.match(/<span class="cl-mark m-none">—<\/span>/g) || []).length === 7 && html5.indexOf('data-sec="scores"') < 0);
});
// ======================================================================
// 報告書表示・最終合否スタンプ（docs/SPEC-report.md 8-1。#67〜#71）
const DEC_DEFAULT = { enabled: true, label: '最終合否', hireLabel: '採用', rejectLabel: '不採用', hireColor: '#c8232c', rejectColor: '#1f4e8c',
  stampField: 'final', autoStampFinal: true, filenameSuffix: true, hint: '最終確認者が合否を決めて押します' };
const DEC_HIRE = { result: 'hire', label: '採用', date: '2026.10.10', at: '2026-10-10T00:00:00.000Z', by: { name: '笹川 晴央', short: '笹川', title: '副支配人' } };
const DEC_REJECT = { result: 'reject', label: '不採用', date: '2026.10.10', at: '2026-10-10T00:00:00.000Z', by: { name: '笹川 晴央', short: '笹川', title: '副支配人' } };
// #66 と同じ形の state（回答あり・判定あり・押印なし）
function decisionState(over) {
  return scriptState(Object.assign({ applicant: SA({ name: '山田 花子' }), management: {} }, over || {}));
}

test('67 最終合否スタンプ（verdictSvg・decisionSheetHtml・source）', function () {
  const ST = ctx.RecruitStamp;
  const v = ST.verdict({ label: '採用', date: '2026.10.10', color: '#c8232c', size: 120, id: 'vt1' });
  assert.ok(v.indexOf('<svg class="verdict-stamp"') === 0, v.slice(0, 60));
  ['role="img"', 'aria-label="採用 2026.10.10"', '>採用</text>', '>2026.10.10</text>', 'stroke="#c8232c"', 'feTurbulence', 'id="vt1"', 'url(#vt1)', 'rotate(-3 ', 'width="120"', 'height="76"']
    .forEach(function (t) { assert.ok(v.indexOf(t) > 0, 'verdict に ' + t); });
  assert.ok(v.indexOf('class="hanko"') < 0, 'hanko クラスを含まない');
  const vr = ST.verdict({ label: '不採用', date: '2026.10.10', color: '#1f4e8c' });
  assert.ok(vr.indexOf('>不採用</text>') > 0 && vr.indexOf('stroke="#1f4e8c"') > 0 && vr.indexOf('width="120"') > 0, '不採用・藍・既定サイズ');
  const vs = ST.verdict({ label: '採用', date: '2026.10.10', sub: '新宿' });
  assert.ok(vs.indexOf('aria-label="採用 2026.10.10 新宿"') > 0 && vs.indexOf('>2026.10.10 新宿</text>') > 0, 'sub');
  const ve = ST.verdict({ label: '<b>', date: '"x' });
  assert.ok(ve.indexOf('&lt;b&gt;') > 0 && ve.indexOf('<b>') < 0, 'escape');
  assert.ok(ST.verdict({ label: 'アルバイト採用決定' }).indexOf('textLength="88"') > 0, '長いラベルは詰める');
  assert.ok(ST.verdict({ label: '採用', date: '2026.10.10' }).indexOf('textLength="88"') < 0 && ST.verdict({ label: '採用' }).indexOf('textLength') < 0, '2 文字は詰めない');
  const none = ST.decisionSheet(null, { id: 'clDecision' });
  assert.ok(none.indexOf('class="cl-decision is-none"') >= 0 && none.indexOf('id="clDecision"') > 0 && none.indexOf('未押印') > 0 && none.indexOf('verdict-stamp') < 0, none);
  const hire = ST.decisionSheet({ result: 'hire', label: '採用', date: '2026.10.10', at: '', by: { name: '笹川 晴央', short: '笹川', title: '副支配人' } }, { id: 'x', hireColor: '#c8232c' });
  ['is-hire', 'data-result="hire"', 'verdict-stamp', '笹川 晴央（副支配人）', '2026.10.10', 'style="color:#c8232c"'].forEach(function (t) { assert.ok(hire.indexOf(t) > 0, 'decisionSheet に ' + t); });
  const src = ST.source();
  ['function verdictSvg(', 'function decisionSheetHtml(', 'function decisionFilename(', 'function stampSvg(', 'function shortName('].forEach(function (t) { assert.ok(src.indexOf(t) >= 0, 'source に ' + t); });
  assert.ok(src.indexOf('</' + 'script') < 0 && src.indexOf('<!--') < 0, 'source に閉じタグ・コメント開始が無い');
  // 外部参照なし（空の vm で動く）
  const out = vm.runInNewContext(ST.source() + '\n;[verdictSvg({label:"採用",date:"2026.10.10"}).indexOf("<svg class=\\"verdict-stamp\\""), decisionSheetHtml({result:"reject",label:"不採用",date:"2026.10.10",by:{name:"笹川 晴央",title:""}},{}).indexOf("is-reject") > 0, decisionFilename("a.html",{result:"hire",label:"採用"},{})]', {});
  assert.deepStrictEqual(plain(out), [0, true, 'a_採用.html']);
});

test('68 decisionFilename（_採用 / _不採用 の付け外し・冪等）', function () {
  const F = ctx.RecruitStamp.decisionFilename;
  const cases = [
    ['応募者_A_2026-10-10.html', { result: 'hire', label: '採用' }, { filenameSuffix: true }, '応募者_A_2026-10-10_採用.html'],
    ['応募者_A_2026-10-10_採用.html', { result: 'reject', label: '不採用' }, {}, '応募者_A_2026-10-10_不採用.html'],
    ['応募者_A_2026-10-10_不採用.html', null, {}, '応募者_A_2026-10-10.html'],
    ['応募者_A_2026-10-10_採用.html', { result: 'hire', label: '採用' }, { filenameSuffix: false }, '応募者_A_2026-10-10.html'],
    ['x_OK.html', { result: 'hire', label: '合格 A' }, { hireLabel: 'OK', rejectLabel: 'NG' }, 'x_合格_A.html']
  ];
  cases.forEach(function (c) {
    const r1 = F(c[0], c[1], c[2]);
    assert.strictEqual(r1, c[3], c[0]);
    assert.strictEqual(F(r1, c[1], c[2]), r1, '冪等: ' + c[0]);
  });
});

test('69 normalizeProfile（management.decision）・validateProfile', function () {
  assert.deepStrictEqual(plain(P().management.decision), DEC_DEFAULT);
  const raw = P(); delete raw.management.decision;
  assert.deepStrictEqual(plain(S.normalizeProfile(raw).management.decision), DEC_DEFAULT);
  // v1 プロファイルは既定の設定になる（docs/SPEC-slim.md D6）
  const oldP = S.parseProfileJSON(fs.readFileSync(path.join(FIX, 'v1-profile-other.json'), 'utf8'));
  assert.deepStrictEqual(plain(oldP.management.decision), DEC_DEFAULT);
  const bad = P();
  bad.management.decision = { enabled: 'x', label: '  ', hireLabel: '', rejectLabel: 5, hireColor: 'red', rejectColor: '#1F4E8C', stampField: 'nope', autoStampFinal: false, filenameSuffix: 0, hint: null };
  const nb = S.normalizeProfile(bad).management.decision;
  assert.deepStrictEqual(plain(nb), { enabled: true, label: '最終合否', hireLabel: '採用', rejectLabel: '不採用', hireColor: '#c8232c', rejectColor: '#1F4E8C',
    stampField: 'final', autoStampFinal: false, filenameSuffix: true, hint: '最終確認者が合否を決めて押します' });
  const nf = P(); nf.management.fields = [{ id: 'a', label: 'A' }]; nf.management.decision = Object.assign({}, DEC_DEFAULT, { enabled: false, stampField: 'final' });
  const nfd = S.normalizeProfile(nf).management.decision;
  assert.ok(nfd.stampField === '' && nfd.enabled === false, JSON.stringify(plain(nfd)));
  [bad, nf, raw].forEach(function (x, i) {
    const once = S.normalizeProfile(x);
    assert.deepStrictEqual(plain(S.normalizeProfile(once).management.decision), plain(once.management.decision), '冪等 ' + i);
  });
  assert.strictEqual(S.decisionConfig(P()).sub, '新宿');
  const v1 = P(); v1.management.decision.hireLabel = '';
  assert.ok(S.validateProfile(v1).errors.indexOf('最終合否の「採用」「不採用」の表示名を入力してください。') >= 0, JSON.stringify(plain(S.validateProfile(v1).errors)));
  const v2 = P(); v2.management.decision.hireLabel = '採用'; v2.management.decision.rejectLabel = '採用';
  assert.ok(S.validateProfile(v2).errors.indexOf('最終合否の「採用」と「不採用」の表示名が同じです。') >= 0);
  assert.ok(!S.validateProfile(P()).errors.some(function (e) { return e.indexOf('最終合否') >= 0; }), '既定は最終合否のエラーなし');
});

test('70 record.decision の正規化と往復（buildRecord・parseRecordFromHTML）', function () {
  [null, {}, 'hire', { result: 'maybe', by: { name: 'x' } }, { result: 'hire' }, { result: 'hire', by: { name: '  ' } }].forEach(function (x) {
    assert.strictEqual(S.normalizeDecision(x), null, JSON.stringify(x));
  });
  assert.deepStrictEqual(plain(S.normalizeDecision({ result: 'hire', label: '', date: '2026/10/10', at: 5, by: { name: ' 笹川 晴央 ', title: '副支配人', x: 1 }, extra: 1 })),
    { result: 'hire', label: '採用', date: '', at: '', by: { name: '笹川 晴央', short: '笹川', title: '副支配人' } });
  const st = decisionState({ decision: DEC_HIRE });
  const rec = S.buildRecord(st);
  assert.deepStrictEqual(plain(rec.decision), DEC_HIRE);
  assert.strictEqual(rec.schemaVersion, 2);
  assert.strictEqual(S.buildRecord(decisionState()).decision, null);
  // parseRecordFromHTML（vm には DOMParser が無いので、このテストの中だけスタブを置く）
  ctx.DOMParser = function () {};
  ctx.DOMParser.prototype.parseFromString = function (h) {
    const m = h.match(/<script type="application\/json" id="recruit-record">([\s\S]*?)<\/script>/);
    return { querySelector: function () { return m ? { textContent: m[1] } : null; } };
  };
  try {
    const p = st.profile;
    assert.deepStrictEqual(plain(S.parseRecordFromHTML(S.generateReportHTML(rec, p)).decision), DEC_HIRE);
    const old = plain(rec); delete old.decision;
    assert.strictEqual(S.parseRecordFromHTML(S.generateReportHTML(old, p)).decision, null, '旧レコード');
    const badRec = plain(rec); badRec.decision = { result: 'x' };
    assert.strictEqual(S.parseRecordFromHTML(S.generateReportHTML(badRec, p)).decision, null, '不正値');
    const evil = plain(rec); evil.decision.by.name = 'Y<!--<script>';
    const htmlEvil = S.generateReportHTML(evil, p);
    const block = htmlEvil.match(/id="recruit-record">([\s\S]*?)<\/script>/)[1];
    assert.ok(!/[<>&]/.test(block), '#recruit-record に生の < > & が無い');
    assert.strictEqual(S.parseRecordFromHTML(htmlEvil).decision.by.name, 'Y<!--<script>');
  } finally {
    delete ctx.DOMParser;
  }
});

test('71 保存 HTML の用紙と最終合否（generateReportHTML・checklistSheetHtml。docs/SPEC-a4.md）', function () {
  const st = decisionState();
  const p = st.profile;
  assert.strictEqual(st.judgment.result, 'recommend', 'state の判定は採用推奨');
  const rec = S.buildRecord(st);
  const recH = Object.assign({}, rec, { decision: DEC_HIRE });
  const htmlH = S.generateReportHTML(recH, p);
  assert.ok(htmlH.indexOf('<body class="a4-doc" data-filename="応募者_山田_花子_') > 0 && htmlH.indexOf('_採用.html">') > 0, 'body の class と合否付きファイル名');
  ['id="a4"', 'id="a4Decision"'].forEach(function (t) { assert.ok(htmlH.indexOf(t) > 0, t); });
  ['rtViewReport', 'rtViewFull', 'reportPaper', 'clPaper', 'clPaperDecision', 'clDecision', 'decision', 'rhDecision', 'mgmt', 'mgmtSave'].forEach(function (id) {
    assert.ok(htmlH.indexOf('id="' + id + '"') < 0, '無い: #' + id);
  });
  assert.ok(htmlH.indexOf('id="a4Decision"') > htmlH.indexOf('<main class="a4" id="a4">') && htmlH.indexOf('id="a4Decision"') < htmlH.indexOf('</main>'), '最終合否は用紙の中');
  assert.strictEqual((noScript(htmlH).match(/<svg class="verdict-stamp"/g) || []).length, 1, '合否スタンプは用紙の 1 つ');
  assert.ok(noScript(htmlH).indexOf('<div class="cl-decision is-hire" id="a4Decision" data-result="hire">') > 0 && noScript(htmlH).indexOf('id="vdA4"') > 0);
  assert.strictEqual((noScript(htmlH).match(/<svg class="hanko"/g) || []).length, 0, 'state の management どおり（押印なし）');
  const cfg = JSON.parse(htmlH.match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]);
  assert.ok(cfg.decision.hireLabel === '採用' && cfg.decision.sub === '新宿' && cfg.decision.stampField === 'final', JSON.stringify(cfg.decision));
  assert.ok(htmlH.indexOf('beforeprint') < 0 && htmlH.indexOf('afterprint') < 0 && htmlH.indexOf('function verdictSvg(') > 0 && htmlH.indexOf('function decisionSheetHtml(') > 0);
  assert.strictEqual((htmlH.match(/<\/script>/g) || []).length, (htmlH.match(/<script[ >]/g) || []).length, 'script 要素の開始・終了の数が同じ');
  // 食い違い注記（X10）は用紙・生成 HTML の要素には出さない（窓の中だけ。注記の有無の分岐は e2e E3・E9・E12 で確かめる。
  //   スクリプトのソースには文言が常にあるので、ここでは noScript の側だけを見る）
  const htmlR = S.generateReportHTML(Object.assign({}, rec, { decision: DEC_REJECT }), p);
  assert.ok(noScript(htmlR).indexOf('アプリの判定「') < 0 && noScript(htmlR).indexOf('と異なる最終合否です') < 0, '不採用 × 採用推奨 → 用紙には注記を出さない');
  assert.ok(noScript(htmlH).indexOf('アプリの判定「') < 0 && noScript(htmlH).indexOf('と異なる最終合否です') < 0);
  // 回答なし（① で保存）→ 白紙の台本の用紙・最終合否の欄あり
  const html0 = S.generateReportHTML(Object.assign({}, rec, { checklist: R.emptyChecklist(), judgment: null, step: 1 }), p);
  assert.ok(html0.indexOf('<body class="a4-doc" data-filename=') > 0 && html0.indexOf('id="a4"') > 0 && html0.indexOf('id="a4Decision"') > 0, '回答なし');
  // 無効（enabled=false）: 合否の欄を出さない・ファイル名に付けない・データは残す
  const pOff = P(); pOff.management.decision.enabled = false;
  const htmlOff = S.generateReportHTML(recH, pOff);
  assert.ok(htmlOff.indexOf('id="a4Decision"') < 0 && noScript(htmlOff).indexOf('class="cl-decision') < 0, '無効なら欄なし');
  assert.strictEqual(JSON.parse(htmlOff.match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]).decision, null, '無効なら埋め込み設定の decision は null');
  assert.ok(htmlOff.match(/data-filename="([^"]*)"/)[1].indexOf('_採用') < 0, '無効ならファイル名に付けない');
  assert.strictEqual(JSON.parse(htmlOff.match(/id="recruit-record">([\s\S]*?)<\/script>/)[1]).decision.result, 'hire', '無効でも埋め込みデータの decision は残す');
  // checklistSheetHtml: {mode:'section'} を渡しても 1 ページの要約（未押印の枠つき）
  const shSec = S.checklistSheetHtml(recH, p, { mode: 'section' });
  assert.ok(shSec.indexOf('cl-mode-sheet') > 0 && shSec.indexOf('cl-decision is-hire') > 0, 'section を渡しても 1 ページの要約');
  const sh = S.checklistSheetHtml(rec, p, {});
  ['cl-decision is-none', '未押印', 'class="cl-judge"', 'cl-judge-row', 'id="clDecision"'].forEach(function (t) { assert.ok(sh.indexOf(t) > 0, 'sheet に ' + t); });
  assert.ok(sh.indexOf('<svg class="hanko"') < 0, '押印なしの記録はハンコなし');
  // 押印した記録: ハンコの SVG の id は o.stampSvgPrefix（既定 'cl'）＋番号
  const recS = Object.assign({}, rec, { management: { final: { name: '笹川 晴央', short: '笹川', title: '副支配人', date: '2026.10.10', at: '' } } });
  assert.ok(S.checklistSheetHtml(recS, p, {}).indexOf('id="cl1"') > 0 && S.checklistSheetHtml(recS, p, { stampSvgPrefix: 'ap' }).indexOf('id="ap1"') > 0);
  assert.ok(S.reportCss().indexOf('</' + 'script') < 0 && S.checklistSheetCss().indexOf('</' + 'script') < 0);
});

// ======================================================================
// 判定（docs/SPEC-script-mode.md 7-1。#73〜#81）
test('73 evaluateScript（総合判断で結果・mode=script・判定の形）', function () {
  const p = P();
  const a = SA({ name: '台本 花子', age: '20', category: '大学2年生' });
  const j = R.evaluateScript(a, clAll('good', 'hire', null, p), p, OPTS);
  assert.strictEqual(j.result, 'recommend');
  assert.strictEqual(j.title, '採用推奨');
  assert.strictEqual(j.mode, 'script');
  assert.strictEqual(j.interviewMode, 'checklist');
  assert.strictEqual(j.scaleMax, 2);
  assert.strictEqual(j.total, 16);
  assert.strictEqual(j.max, 16);
  assert.strictEqual(j.pct, 100);
  assert.deepStrictEqual(plain(j.interview), { total: 16, max: 16, pct: 100, band: 'high', bandLabel: '高' });
  assert.ok(j.contribution === null && j.matrix === null && j.highschool === null, 'contribution / matrix / highschool は null');
  assert.strictEqual(j.unresolved.length, 0);
  assert.strictEqual(j.adjustments.length, 0);
  assert.strictEqual(j.adjusted, false);
  assert.deepStrictEqual(plain(j.warnings), []);
  assert.strictEqual(j.baseResult, 'recommend');
  assert.strictEqual(j.evaluatedAt, NOW.toISOString());
  assert.strictEqual(j.checklist.must.match, 2);
  assert.deepStrictEqual(plain(j.checklist.overall), { value: 'hire', label: '採用', points: 2 });
  assert.strictEqual(j.must.total, 2);
  assert.strictEqual(j.breakdown.length, 8);
  assert.strictEqual(j.strengths.length, 7);
  assert.strictEqual(j.concerns.length, 0);
  assert.strictEqual(j.thresholds.recommendPts, 12);
  assert.strictEqual(j.thresholds.reviewPts, 7);
  assert.ok(j.body.indexOf('台本 花子さん') >= 0 && j.body.indexOf('「採用」') >= 0 && j.body.indexOf('シフト貢献度') < 0, j.body);
  const jh = R.evaluateScript(a, clAll('good', 'hold', null, p), p, OPTS);
  assert.ok(jh.result === 'review' && jh.adjustments.length === 0 && jh.body.indexOf('「保留」') >= 0, JSON.stringify(plain([jh.result, jh.adjustments, jh.body])));
  const jr = R.evaluateScript(a, clAll('good', 'reject', null, p), p, OPTS);
  assert.ok(jr.result === 'reject' && jr.adjustments.length === 0, JSON.stringify(plain([jr.result, jr.adjustments])));
  // 旧レコードの詳細項目が残っていても判定に使わない（応募情報との食い違いの警告を出さない）
  const jd = R.evaluateScript({ name: 'x', workPeriod: 'short', shifts: { mon: { start: '10:00', end: '11:00' } } }, clAll('good', 'hire', null, p), p, OPTS);
  assert.ok(jd.result === 'recommend' && jd.warnings.length === 0, JSON.stringify(plain(jd.warnings)));
  // 強み・懸念（○ = 強み、× = 懸念。総合判断は除く。旧 #61）
  const cs = clMarks(['good', 'fair', 'poor', 'good', 'fair', 'poor', 'good']);
  cs.notes.rt_concrete = '曜日・時間を具体的に回答';
  const js = judgeS(cs);
  // 台本順: rt_concrete ○ / rt_manner △ / rt_hourensou × / rt_turnover ○ / rt_understand △ / rt_team × / rt_mismatch ○
  assert.deepStrictEqual(plain(js.strengths), ['勤務条件の一致に「具体性」があるか（曜日・時間を具体的に回答）', '離職要因はないか', '採用後のミスマッチを低減']);
  assert.deepStrictEqual(plain(js.concerns), ['報連相できるか', '自己判断せずチームで動けるか']);
  assert.ok(js.strengths.indexOf('面接者の総合判断') < 0);
  assert.strictEqual(js.breakdown.find(function (b) { return b.id === 'rt_concrete'; }).note, '曜日・時間を具体的に回答');
});

test('74 evaluateScript（必須条件: 不一致・未確認・設定）', function () {
  const p = P();
  const a = SA({ name: '台本 花子', age: '20', category: '大学2年生' });
  const ML = '土日を含む週3日以上、5時間以上';
  const cl = clAll('good', 'hire', null, p); cl.values.must_weekly = 'mismatch';
  const j = R.evaluateScript(a, cl, p, OPTS);
  const reason = '必須条件が一致しないため（' + ML + '）、不採用推奨とします。';
  assert.strictEqual(j.result, 'reject');
  assert.deepStrictEqual(plain(j.adjustments), [{ code: 'must_conditions', from: 'recommend', to: 'reject', reason: reason }]);
  assert.strictEqual(j.warnings[0], reason);
  assert.ok(j.body.indexOf('必須条件（' + ML + '）') >= 0 && j.body.indexOf('面接者の総合判断・面接評価にかかわらず不採用推奨とします') >= 0 && j.body.indexOf('シフト貢献度') < 0, j.body);
  // 打ち切り（確認点・総合判断は未入力）
  const cl2 = R.emptyChecklist(); cl2.values.must_weekly = 'mismatch';
  const j2 = R.evaluateScript(a, cl2, p, OPTS);
  assert.ok(j2.result === 'reject' && j2.adjustments[0].from === 'review', JSON.stringify(plain(j2.adjustments)));
  assert.ok(!hasWarn(j2, '未入力の確認点') && !hasWarn(j2, '総合判断が未入力'), JSON.stringify(plain(j2.warnings)));
  // mustFailResult = review
  const p2 = P(); p2.checklist.mustFailResult = 'review';
  const j3 = R.evaluateScript(a, cl, p2, OPTS);
  assert.strictEqual(j3.result, 'review');
  assert.deepStrictEqual(plain(j3.adjustments), [{ code: 'must_conditions', from: 'recommend', to: 'review', reason: '必須条件が一致しないため（' + ML + '）、採用推奨ではなく上長最終判断要として扱います。' }]);
  // 未確認（既定は警告のみ）
  const cl3 = clAll('good', 'hire', null, p); delete cl3.values.must_busy;
  const j4 = R.evaluateScript(a, cl3, p, OPTS);
  assert.ok(j4.result === 'recommend' && j4.adjustments.length === 0, JSON.stringify(plain([j4.result, j4.adjustments])));
  assert.ok(j4.warnings.indexOf('必須条件に未確認が1件あります（指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆））。面接で確認してください。') >= 0, JSON.stringify(plain(j4.warnings)));
  // mustUnknownResult = review
  const p3 = P(); p3.checklist.mustUnknownResult = 'review';
  const j5 = R.evaluateScript(a, cl3, p3, OPTS);
  assert.strictEqual(j5.result, 'review');
  assert.ok(j5.adjustments[0].code === 'must_unconfirmed' && j5.adjustments[0].from === 'recommend' && j5.adjustments[0].to === 'review' &&
    j5.adjustments[0].reason.indexOf('面接チェックリストの ① で一致／不一致を入力してください。') >= 0, JSON.stringify(plain(j5.adjustments)));
});

test('75 evaluateScript（総合判断の未入力・overallCaps・× の警告・壊れた入力・本文の設定）', function () {
  const p = P();
  const a = SA({ name: '台本 花子', age: '20', category: '大学2年生' });
  // 総合判断が未入力
  const c1 = clAll('good', 'hire', null, p); c1.overall = '';
  const j1 = R.evaluateScript(a, c1, p, OPTS);
  assert.ok(j1.result === 'review' && j1.adjustments.length === 0 && j1.total === 14, JSON.stringify(plain([j1.result, j1.adjustments, j1.total])));
  assert.ok(j1.warnings.indexOf('面接者の総合判断が未入力です（結果は上長最終判断要として扱います）。') >= 0, JSON.stringify(plain(j1.warnings)));
  assert.ok(j1.body.indexOf('未入力') >= 0, j1.body);
  // 確認点の未入力
  const c2 = clAll('good', 'hire', null, p); delete c2.values.rt_team;
  const j2 = R.evaluateScript(a, c2, p, OPTS);
  assert.ok(j2.result === 'recommend' && j2.warnings.indexOf('未入力の確認点が1件あります（0点として集計）。') >= 0, JSON.stringify(plain(j2.warnings)));
  // overallCaps（厳しくしたときだけ下がる）
  const p4 = P(); p4.checklist.overallCaps.hold = 'reject';
  const j3 = R.evaluateScript(a, clAll('good', 'hold', null, p4), p4, OPTS);
  assert.strictEqual(j3.result, 'reject');
  assert.deepStrictEqual(plain(j3.adjustments), [{ code: 'overall_hold', from: 'review', to: 'reject', reason: '面接者の総合判断が「保留」のため、不採用推奨とします。' }]);
  assert.ok(j3.body.indexOf('下記の理由により不採用推奨とします') >= 0, j3.body);
  ['none', 'review'].forEach(function (cap) {
    const pc = P(); pc.checklist.overallCaps.reject = cap;
    const jc = R.evaluateScript(a, clAll('good', 'reject', null, pc), pc, OPTS);
    assert.ok(jc.result === 'reject' && jc.adjustments.length === 0, cap + ': ' + JSON.stringify(plain([jc.result, jc.adjustments])));
  });
  // × の警告（結果は変えない）
  const c4 = clAll('good', 'hire', null, p); c4.values.rt_team = 'poor';
  const j4 = R.evaluateScript(a, c4, p, OPTS);
  assert.strictEqual(j4.result, 'recommend');
  assert.ok(j4.warnings.indexOf('確認点に × が1件あります（自己判断せずチームで動けるか）。総合判断「採用」と合わせて確認してください。') >= 0, JSON.stringify(plain(j4.warnings)));
  assert.ok(j4.concerns.some(function (c) { return c.indexOf('自己判断せずチームで動けるか') >= 0; }), JSON.stringify(plain(j4.concerns)));
  // 壊れた入力
  let jb;
  assert.doesNotThrow(function () { jb = R.evaluateScript({}, null, P()); });
  assert.ok(jb.result === 'review' && jb.total === 0, JSON.stringify(plain([jb.result, jb.total])));
  let jn;
  assert.doesNotThrow(function () { jn = R.evaluateScript({}, R.emptyChecklist(), { checklist: null }); });
  assert.strictEqual(jn.max, 2);
  // 本文の設定（空なら既定の文）
  const p5 = P(); p5.texts.script.recommend = 'OK {name} {overallLabel}';
  assert.strictEqual(R.evaluateScript(a, clAll('good', 'hire', null, p5), p5, OPTS).body, 'OK 台本 花子さん 採用');
  const p6 = P(); p6.texts.script.recommend = '';
  assert.ok(R.evaluateScript(a, clAll('good', 'hire', null, p6), p6, OPTS).body.indexOf('採用を推奨します。') >= 0);
});

test('76 保存レコードと保存 HTML', function () {
  const rec = S.buildRecord(scriptState());
  assert.ok(!('mode' in rec), 'mode は書かない');
  assert.strictEqual(rec.schemaVersion, 2);
  const html = S.generateReportHTML(rec, P());
  const ns = noScript(html);
  assert.ok(html.indexOf('<body class="a4-doc" data-filename="応募者_台本_花子_') > 0, 'body の class');
  // 用紙の部品（docs/SPEC-a4.md 1-2）: 見出し・応募者 → 結果ストリップ → 必須条件｜勤務条件 → 確認点 → 面接メモ → 説明・連絡 → 押印行。用紙の後ろに埋め込みデータ
  const at = function (t) { return html.indexOf(t); };
  const order = ['<main class="a4" id="a4">', '<div class="cl-sheet-head">', '<div class="cl-judge', 'cl-blk-must', 'cl-blk-rate', '<section class="cl-blk cl-blk-notes">', 'class="cl-exline"', '<div class="cl-stamps">', '</main>', '<footer class="a4-foot"', 'id="recruit-record"', 'id="recruit-mgmt-config"'];
  order.forEach(function (t, i) { assert.ok(at(t) > 0 && (i === 0 || at(order[i - 1]) < at(t)), '並び: ' + t); });
  ['<section class="sec"', 'class="rh"', 'class="rtool', 'class="kv script-judge"', '<div class="result ', '<h2>', 'id="clSheet"', 'id="rtPrintChecklist"',
    '<h2>応募時の情報</h2>', '<h2>面接者への申し送りコメント</h2>', '<h2>シフト貢献度</h2>', 'id="rtPrintSheet"', 'id="rtPrintAll"', 'class="dash"', 'data-tile=']
    .forEach(function (t) { assert.ok(html.indexOf(t) < 0, '含まない: ' + t); });
  assert.ok(ns.indexOf('シフト貢献度') < 0 && ns.indexOf('2軸') < 0, 'script 要素以外に「シフト貢献度」「2軸」が無い');
  // 応募者の項目は用紙の見出し（.cl-who）と面接メモ（Step① のメモは「メモ」。「備考」は出さない）
  const head = html.slice(at('<div class="cl-sheet-head">'), at('<div class="cl-judge'));
  ['台本 花子', '2029年3月', '短期求人', '可・2,500円', '2026/10/10', '笹川 晴央'].forEach(function (t) { assert.ok(head.indexOf(t) > 0, '見出しに ' + t); });
  assert.ok(html.indexOf('<div class="cl-nm-k">メモ</div><div class="cl-nm-v">電話の受け答えが丁寧。</div>') > 0 && ns.indexOf('備考') < 0, '① のメモは「メモ」');
  // 消極属性（旧レコードの header.negatives）は出さない
  ['短期希望', '消極属性'].forEach(function (t) { assert.ok(head.indexOf(t) < 0, '見出しに無い: ' + t); });
  assert.ok(html.indexOf('消極属性') < 0 && html.indexOf('朝～12時のみ') < 0, '保存 HTML に消極属性・朝～12時のみ が無い');
  assert.strictEqual((html.match(/<\/script>/g) || []).length, (html.match(/<script[ >]/g) || []).length, 'script 要素の開始・終了の数が同じ');
  // 回答なし: 白紙の台本の用紙（結果「未実施」）
  const rec0 = S.buildRecord(scriptState({ checklist: (function () { const c = R.emptyChecklist(); c.header.date = '2026-10-10'; return c; })(), judgment: null, step: 1 }));
  const html0 = S.generateReportHTML(rec0, P());
  ['class="a4-doc"', 'id="a4"', '<span class="cl-tile-v">未実施</span>', '<div class="cl-stamps">'].forEach(function (t) { assert.ok(html0.indexOf(t) > 0, '回答なし: ' + t); });
});

test('77 scriptApplicantRows・checklistSheetHtml', function () {
  // scriptApplicantRows
  const st = scriptState();
  const rows = R.scriptApplicantRows(st.applicant, st.checklist, P(), st.management);
  assert.deepStrictEqual(plain(rows.map(function (r) { return r.key; })), ['name', 'age', 'gender', 'category', 'graduation', 'posting', 'taxi', 'date', 'interviewer', 'notes']);
  assert.strictEqual((rows.find(function (r) { return r.key === 'notes'; }) || {}).label, 'メモ', 'notes の見出しは Step① の入力欄「メモ（任意）」と同じ「メモ」');
  const rv = function (rs, k) { return (rs.find(function (r) { return r.key === k; }) || {}).value; };
  assert.ok(rv(rows, 'age') === '20歳' && rv(rows, 'graduation') === '2029年3月' && rv(rows, 'posting') === '短期求人' && rv(rows, 'negatives') === undefined && rv(rows, 'date') === '2026/10/10',
    JSON.stringify(plain(rows)));
  const cl2 = plain(st.checklist); cl2.header.interviewer = '';
  assert.strictEqual(rv(R.scriptApplicantRows(st.applicant, cl2, P(), st.management), 'interviewer'), '笹川 晴央', '担当が空なら押印（面接対応者）から');
  assert.deepStrictEqual(plain(R.scriptApplicantRows(SA(), R.emptyChecklist(), P(), {})), []);
  // checklistSheetHtml（旧い詳細の項目が state に残っていても、記録は 6 キーだけ）
  const rec2 = S.buildRecord(scriptState({ applicant: { name: '台本 花子', age: '20', category: '大学2年生', workPeriod: 'long', daysMin: '3', daysMax: '4', shifts: { sat: { start: '10:00', end: '18:00' } }, reviewerNotes: '電話の受け答えが丁寧。' } }));
  assert.deepStrictEqual(Object.keys(rec2.applicant), ['name', 'gender', 'age', 'category', 'graduationDate', 'reviewerNotes']);
  const sh = S.checklistSheetHtml(rec2, P(), {});
  //   1 ページの A4（2026-10-14）: 結果ストリップは 結果・総合判断・必須条件・確認点、Step① のメモは【面接メモ】の「メモ」
  ['<span class="cl-tile-k">確認点</span>', '<span class="cl-tile-k">必須条件</span>', '<span class="cl-tile-k">総合判断</span>', '<span class="cl-tile-k">結果</span>', 'class="cl-judge"',
    '可・2,500円', '短期求人', '<div class="cl-nm-k">メモ</div><div class="cl-nm-v">電話の受け答えが丁寧。</div>'].forEach(function (t) { assert.ok(sh.indexOf(t) > 0, 'sheet に ' + t); });
  // Step① の入力欄「メモ（任意）」と報告書の呼び名をそろえる（旧「備考」「備考（面接者メモ）」は出さない）
  assert.ok(sh.indexOf('備考') < 0, 'sheet に「備考」が無い');
  ['シフト貢献度', '（自動）', '（応募情報より）', '（手入力）', '<b>希望シフト</b>', '<b>勤務期間</b>', '<dt>希望シフト</dt>', '<dt>勤務期間</dt>', '面接で確認した勤務条件', '消極属性', '朝～12時のみ'].forEach(function (t) { assert.ok(sh.indexOf(t) < 0, 'sheet に無い: ' + t); });
  // A4 のヘッダー（台本モード）: 氏名・区分・年齢・性別・卒業予定・求人・タクシー・面接日・担当（消極属性・目安は出さない。「短期希望」は台本の質問文にだけ出る）
  //   1 ページの A4（2026-10-14）: ヘッダー（.cl-sheet-head）は結果ストリップ（.cl-judge）の前まで。1 行目に氏名・属性・卒業予定、2 行目が dl.cl-sh-kv
  const headOf = function (h) { return h.slice(h.indexOf('cl-sheet-head'), h.indexOf('<div class="cl-judge')); };
  const kvKeys = function (h) { return (h.match(/<div><dt>([^<]+)<\/dt>/g) || []).map(function (x) { return x.replace(/.*<dt>/, '').replace('</dt>', ''); }); };
  const shHead = headOf(sh);
  assert.ok(shHead.length > 0 && shHead.indexOf('短期希望') < 0 && shHead.indexOf('<dt>目安</dt>') < 0, 'A4 ヘッダーに短期希望・目安なし');
  assert.deepStrictEqual(kvKeys(shHead), ['面接日', '担当', '応募した求人', 'タクシー可否・料金'], 'A4 ヘッダー 2 行目（卒業予定が無い記録）: ' + kvKeys(shHead).join(','));
  assert.ok(shHead.indexOf('卒業予定') < 0, '卒業予定が無い記録は 1 行目にも出さない');
  const shG = S.checklistSheetHtml(S.buildRecord(scriptState()), P(), {});
  const shGHead = headOf(shG);
  assert.deepStrictEqual(kvKeys(shGHead), ['面接日', '担当', '応募した求人', 'タクシー可否・料金'], 'A4 ヘッダー 2 行目の順: ' + kvKeys(shGHead).join(','));
  assert.ok(shGHead.indexOf('<span class="cl-sh-grad"><b>卒業予定</b>2029年3月</span>') > 0 && shGHead.indexOf('<span class="cl-sh-grad">') < shGHead.indexOf('<dl class="cl-sh-kv">'), 'A4 ヘッダー 1 行目に卒業予定');
  ['台本 花子', '大学2年生・20歳・女性', '2029年3月', '短期求人', '可・2,500円', '<dt>面接日</dt><dd>2026/10/10</dd>', '<dt>担当</dt><dd>笹川 晴央'].forEach(function (t) { assert.ok(shGHead.indexOf(t) > 0, 'A4 ヘッダーに ' + t); });
});

test('78 用紙の調整の行（必須条件の不一致は from / to に関係なく固定）・押印欄の説明', function () {
  // 保存 HTML の用紙の結果ストリップの下（.cl-adj）。1 件 1 行の見出し（太字）
  const head = function (html) { const m = html.match(/<ul class="cl-adj">[\s\S]*?<\/ul>/); return m ? (m[0].match(/<li><b>([\s\S]*?)<\/b>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); }) : []; };
  const mk = function (cl, prof) {
    prof = prof || P();
    const s0 = scriptState();
    const st = scriptState({ profile: prof, checklist: cl, judgment: R.evaluateScript(s0.applicant, cl, prof, OPTS) });
    return { j: st.judgment, heads: head(S.generateReportHTML(S.buildRecord(st), prof)) };
  };
  // 総合判断「採用」＋必須条件の不一致（採用推奨 → 不採用推奨。from と to が違っても「調整」ではなく「固定」）
  const cl1 = clAll('good', 'hire', null, P()); cl1.values.must_weekly = 'mismatch';
  const r1 = mk(cl1);
  assert.ok(r1.j.adjustments[0].code === 'must_conditions' && r1.j.adjustments[0].from === 'recommend' && r1.j.adjustments[0].to === 'reject', JSON.stringify(plain(r1.j.adjustments)));
  assert.deepStrictEqual(r1.heads, ['必須条件の不一致により「不採用推奨」に固定']);
  // 面接の打ち切り（総合判断は未入力。上長最終判断要 → 不採用推奨）
  const cl2 = R.emptyChecklist(); cl2.values.must_weekly = 'mismatch';
  const r2 = mk(cl2);
  assert.ok(r2.j.adjustments[0].from === 'review' && r2.j.adjustments[0].to === 'reject', JSON.stringify(plain(r2.j.adjustments)));
  assert.deepStrictEqual(r2.heads, ['必須条件の不一致により「不採用推奨」に固定']);
  // 総合判断「不採用」＋不一致（from = to = reject）
  const cl3 = clAll('good', 'reject', null, P()); cl3.values.must_weekly = 'mismatch';
  assert.deepStrictEqual(mk(cl3).heads, ['必須条件の不一致により「不採用推奨」に固定']);
  // mustFailResult = review（採用推奨 → 上長最終判断要）
  const p4 = P(); p4.checklist.mustFailResult = 'review';
  const r4 = mk(cl1, p4);
  assert.ok(r4.j.result === 'review' && r4.j.adjustments[0].code === 'must_conditions', JSON.stringify(plain(r4.j.adjustments)));
  assert.deepStrictEqual(r4.heads, ['必須条件の不一致により「上長最終判断要」に固定']);
  // 必須条件以外の調整（総合判断の上限）は従来どおり「調整」
  const p5 = P(); p5.checklist.overallCaps.hold = 'reject';
  assert.deepStrictEqual(mk(clAll('good', 'hold', null, p5), p5).heads, ['上長最終判断要 → 不採用推奨']);
  // 調整なしなら見出しなし
  assert.deepStrictEqual(mk(clAll('good', 'hire', null, P())).heads, []);
  // 押印欄の説明（既定）。書き換えた説明は残す
  assert.deepStrictEqual(plain(P().management.fields.map(function (f) { return f.hint; })), ['面接を行った担当者', '採用可否を最終確認した上長']);
  const pCus = P(); pCus.management.fields[0].hint = '一次面接の担当者';
  assert.strictEqual(S.normalizeProfile(pCus).management.fields[0].hint, '一次面接の担当者');
});

test('79 消極属性の削除（旧設定・旧レコードの互換。docs/SPEC-script-mode.md 12 章）', function () {
  // 既定の台本に消極属性（negatives・morningOnlyEnd）が無い
  const def = P().checklist;
  assert.ok(!('negatives' in def.header) && !('morningOnlyEnd' in def.header), JSON.stringify(plain(def.header)));
  // 旧い設定（消極属性入り）を正規化すると外れる。冪等
  const pOld = P(); pOld.checklist.header.negatives = [{ id: 'short', label: '短期希望', auto: 'shortTerm' }, { id: 'morningOnly', label: '朝～12時のみ', auto: 'morningOnly' }];
  pOld.checklist.header.morningOnlyEnd = '12:00';
  const nOld = S.normalizeProfile(pOld);
  assert.ok(!('negatives' in nOld.checklist.header) && !('morningOnlyEnd' in nOld.checklist.header));
  assert.deepStrictEqual(plain(S.normalizeProfile(nOld)), plain(nOld));
  assert.deepStrictEqual(plain(S.validateProfile(pOld)).errors, []);
  // 旧レコード（checklist.header.negatives・checklistDef.header.negatives 入り）: 保存 HTML の生成・読み込み・判定でエラーにならず、消極属性は出さない
  const st = scriptState();
  const rec = S.buildRecord(st);
  const old = plain(rec);
  old.checklist.header.negatives = { short: 'on', morningOnly: 'on' };
  old.checklistDef = plain(pOld.checklist);
  const html = S.generateReportHTML(old, P());
  // 埋め込みの記録（JSON）には旧データがそのまま残る（読み込みの往復用）。表示部分にだけ出さない
  const shown = html.replace(/<script type="application\/json" id="recruit-record">[\s\S]*?<\/script>/, '');
  assert.ok(shown.length < html.length, 'JSON ブロックを除いた');
  ['消極属性', '朝～12時のみ'].forEach(function (t) { assert.ok(shown.indexOf(t) < 0, '保存 HTML（表示部分）に無い: ' + t); });
  ['id="a4"', '<div class="cl-who">', '短期求人', '可・2,500円'].forEach(function (t) { assert.ok(html.indexOf(t) > 0, '保存 HTML に ' + t); });
  const sheet = S.checklistSheetHtml(old, P(), {});
  const head = sheet.slice(sheet.indexOf('cl-sheet-head'), sheet.indexOf('<div class="cl-judge'));
  assert.ok(head.indexOf('短期希望') < 0 && head.indexOf('消極属性') < 0 && head.indexOf('短期求人') > 0, 'A4 ヘッダー');
  ctx.DOMParser = function () {};
  ctx.DOMParser.prototype.parseFromString = function (h) {
    const m = h.match(/<script type="application\/json" id="recruit-record">([\s\S]*?)<\/script>/);
    return { querySelector: function () { return m ? { textContent: m[1] } : null; } };
  };
  try {
    const back = S.parseRecordFromHTML(html);
    assert.ok(back && back.checklist && back.checklist.header.posting === 'short', '読み込める');
    assert.deepStrictEqual(plain(back.checklist.header.negatives), { short: 'on', morningOnly: 'on' }, '旧データは落とさない（読み飛ばすだけ）');
    const j = R.evaluateScript(back.applicant, back.checklist, P(), OPTS);
    assert.strictEqual(j.result, st.judgment.result, '判定は消極属性に左右されない');
    assert.ok(R.scriptApplicantRows(back.applicant, back.checklist, P(), back.management).every(function (r) { return r.key !== 'negatives' && r.value.indexOf('短期希望') < 0; }));
    const sum = R.checklistSummary(back.applicant, back.checklist, P(), {});
    assert.ok(!('negatives' in sum.header) && !('autos' in sum), 'ビューモデルに消極属性なし');
    // アプリの読み込み（normalizeRecord）では外す
    assert.ok(!('negatives' in S.normalizeRecord(back).checklist.header));
  } finally { delete ctx.DOMParser; }
});

test('80 A4 面接チェックリスト報告（1 ページの要約。docs/SPEC-checklist.md 4-2・docs/SPEC-a4.md 1-2）', function () {
  const escH = ctx.RecruitUtil ? ctx.RecruitUtil.esc : function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  const st = scriptState();
  const p = st.profile;
  const def = p.checklist;
  // 回答: 説明すべて☑・合否連絡は採用時だけ・質問のメモは ② だけ・確認点のメモ 1 件
  const cl = plain(st.checklist);
  R.checklistItems(def, 'explain').forEach(function (x) { cl.values[x.item.id] = true; });
  cl.values.nt_hire = true;
  cl.notes = { continuity_q: '前職は飲食で2年。学業との両立のため退職。', rt_concrete: '土日両日可と具体的に回答' };
  const rec = S.buildRecord(Object.assign({}, st, { checklist: cl }));
  const sh = S.checklistSheetHtml(rec, p, {});
  // (1) 台本の説明文・質問文（「」で始まる質問ラベル）・確認点の補足・ブロックの注記・ページの前書きを載せない
  R.checklistItems(def, 'explain').forEach(function (x) { assert.ok(sh.indexOf(escH(x.item.label)) < 0, '説明文なし: ' + x.item.label); });
  R.checklistItems(def, 'question').forEach(function (x) {
    assert.ok(x.item.label.charAt(0) === '「' && sh.indexOf(escH(x.item.label)) < 0 && sh.indexOf(escH(x.item.label.slice(0, 8))) < 0, '質問文なし: ' + x.item.label);
  });
  assert.ok(sh.indexOf('「') < 0 || sh.indexOf('「') === sh.indexOf('「具体性」'), '「 は確認点の名前（勤務条件の一致に「具体性」があるか）だけ');
  R.checklistItems(def, 'rating').forEach(function (x) { if (x.item.hint) assert.ok(sh.indexOf(escH(x.item.hint)) < 0, '補足なし: ' + x.item.hint); });
  def.sections.forEach(function (s) { s.blocks.forEach(function (b) { if (b.note) assert.ok(sh.indexOf(escH(b.note)) < 0, '注記なし: ' + b.note); }); });
  def.pages.forEach(function (pg) { if (pg.lead) assert.ok(sh.indexOf(escH(pg.lead)) < 0, '前書きなし'); });
  assert.ok(sh.indexOf('ol class="cl-qs"') < 0 && sh.indexOf('cl-page') < 0 && sh.indexOf('class="cl-s ') < 0 && sh.indexOf('cl-overall') < 0, '旧レイアウトの部品なし');
  // (2) 確認点 7 行（台本順・セクション番号つき）・必須条件 2 行
  const rows = sh.match(/<tr data-cl-item="(rt_[a-z_]+)"><td class="cl-rt-no">(.)<\/td>/g) || [];
  assert.strictEqual(rows.length, 7, rows.join('\n'));
  assert.deepStrictEqual(rows.map(function (r) { return r.replace(/.*cl-rt-no">/, '').replace('</td>', ''); }), ['①', '①', '②', '②', '③', '④', '⑤']);
  assert.ok(sh.indexOf('<span class="cl-mark m-good">○</span>') > 0 && sh.indexOf('<td class="cl-rt-nt">土日両日可と具体的に回答</td>') > 0);
  const must = sh.match(/<tr class="m-[a-z]+" data-cl-item="must_[a-z]+">/g) || [];
  assert.deepStrictEqual(must, ['<tr class="m-match" data-cl-item="must_weekly">', '<tr class="m-match" data-cl-item="must_busy">']);
  // 未入力の確認点も行は出す（灰色の「—」）
  const cl2 = plain(cl); delete cl2.values.rt_team; delete cl2.values.rt_mismatch;
  const sh2 = S.checklistSheetHtml(S.buildRecord(Object.assign({}, st, { checklist: cl2 })), p, {});
  assert.strictEqual((sh2.match(/<tr data-cl-item="rt_/g) || []).length, 7);
  assert.strictEqual((sh2.match(/<span class="cl-mark m-none">—<\/span>/g) || []).length, 2);
  assert.ok(sh2.indexOf('○5 △0 ×0 未入力2') > 0, '確認点タイルに未入力');
  // 必須条件の直後の記入欄は左（土日勤務可否・出勤不可な繁忙）、ほかの記入欄は右「勤務条件の確認」（短い名前）
  const left = sh.slice(sh.indexOf('cl-blk-must'), sh.indexOf('cl-blk-terms'));
  const right = sh.slice(sh.indexOf('cl-blk-terms'), sh.indexOf('cl-blk-rate'));
  assert.ok(left.indexOf('<dt>土日勤務可否</dt>') > 0 && left.indexOf('<dt>出勤不可な繁忙</dt>') > 0 && left.indexOf('<dt>短期／長期の希望</dt>') < 0, left);
  ['<dt>短期／長期の希望</dt>', '<dt>契約開始日の希望</dt>', '<dt>初回契約終了</dt>', '<dt>OPEN／25時の可否</dt>'].forEach(function (t) { assert.ok(right.indexOf(t) > 0, '右: ' + t); });
  assert.ok(right.indexOf('<span class="cl-blank">—</span>') > 0, '空の記入欄は「—」');
  // (3) 説明済みの分母: ※短期求人のみ は求人が短期のときだけ数える
  assert.ok(sh.indexOf('<span class="cl-ex-i">①' + ' 4/4</span>') > 0 && sh.indexOf('② 3/3') > 0 && sh.indexOf('③ 4/4') > 0 && sh.indexOf('④ 3/3') > 0, '短期求人: ① 4/4');
  ['regular', ''].forEach(function (pst) {
    const c3 = plain(cl); c3.header.posting = pst;
    const h3 = S.checklistSheetHtml(S.buildRecord(Object.assign({}, st, { checklist: c3 })), p, {});
    assert.ok(h3.indexOf('<span class="cl-ex-i">① 2/2</span>') > 0 && h3.indexOf('① 4/4') < 0, '求人「' + pst + '」: ① 2/2');
    c3.values.ex_fare = false;
    const h4 = S.checklistSheetHtml(S.buildRecord(Object.assign({}, st, { checklist: c3 })), p, {});
    assert.ok(h4.indexOf('<span class="cl-ex-i is-off">① 1/2</span>') > 0, '未説明があれば強調: ' + pst);
  });
  assert.ok(sh.indexOf('<span class="cl-ex-k">合否連絡</span><span class="cl-ex-i">採用時 ☑</span><span class="cl-ex-sep">／</span><span class="cl-ex-i is-off">不合格 ☐</span>') > 0, '合否連絡は短い名前と☑/☐');
  // (4) 面接メモ・所見の枠: 記入があるものだけを上から（質問の回答は「短い名前：回答」・面接所見・Step① のメモ）、その下は手書き用の罫線（docs/SPEC-a4.md 12 章）
  const nm = sh.match(/<div class="cl-nm-row [^"]+"/g) || [];
  assert.deepStrictEqual(nm, ['<div class="cl-nm-row cl-nm-q"', '<div class="cl-nm-row cl-nm-iv"', '<div class="cl-nm-row cl-nm-memo"'], nm.join(','));
  // 質問の回答の名前は 1 問目の短い名前＋「ほか n 問」（3 問の名前を並べない。1 問だけのブロックは「ほか」なし）
  assert.ok(sh.indexOf('<div class="cl-nm-k"><span class="cl-nm-no">②</span>前のバイトの期間・退職理由 ほか2問</div><div class="cl-nm-v">前職は飲食で2年。学業との両立のため退職。</div>') > 0, '② の回答');
  assert.ok(sh.indexOf('週3日出せないと分かったら') < 0 && sh.indexOf('当日急に出られなくなったら') < 0, '2 問目以降の名前は並べない');
  const clQ = plain(cl); clQ.notes = { reverse_q: '時給と交通費の上限を質問' };
  const shQ = S.checklistSheetHtml(S.buildRecord(Object.assign({}, st, { checklist: clQ })), p, {});
  assert.ok(shQ.indexOf('<div class="cl-nm-k"><span class="cl-nm-no">⑤</span>気になる点（逆質問）</div><div class="cl-nm-v">時給と交通費の上限を質問</div>') > 0, '1 問だけのブロック');
  assert.ok(sh.indexOf('<div class="cl-nm-k">面接所見</div><div class="cl-nm-v">受け答えが丁寧</div>') > 0 && sh.indexOf('<div class="cl-nm-k">メモ</div><div class="cl-nm-v">電話の受け答えが丁寧。</div>') > 0);
  // 案内行: 「…」で切れたメモがある（.cl-nm-cut）／質問の回答を省いた（.cl-compact-2・質問の回答があるときだけ .has-q）ときに表示
  assert.ok(sh.indexOf('<p class="cl-nm-ref has-q"><span class="cl-nm-ref-c">「…」で切れたメモは、画面でクリックすると全文を表示します</span>' +
    '<span class="cl-nm-ref-q">質問の回答は省略（画面でこの行をクリックすると、回答と「…」で切れたメモの全文を表示します）</span></p>') > 0, '質問の回答があるときの案内行');
  assert.ok(sh.indexOf('詳細') < 0, '「詳細」表示の案内は無い');
  //   アプリ ③ の紙（クリックしても窓を出さない）は o.refWhere で「保存した HTML の画面で」に言い換える（文言以外は同じ）
  const shApp = S.checklistSheetHtml(rec, p, { refWhere: '保存した HTML の画面で' });
  assert.ok(shApp.indexOf('<span class="cl-nm-ref-c">「…」で切れたメモは、保存した HTML の画面でクリックすると全文を表示します</span>' +
    '<span class="cl-nm-ref-q">質問の回答は省略（保存した HTML の画面でこの行をクリックすると、回答と「…」で切れたメモの全文を表示します）</span>') > 0, '③ の紙の案内行');
  assert.strictEqual(shApp.split('保存した HTML の').join(''), sh, '③ の紙は案内の文言だけが違う');
  const clNoQ = plain(cl); clNoQ.notes = {};
  const shNoQ = S.checklistSheetHtml(S.buildRecord(Object.assign({}, st, { checklist: clNoQ })), p, {});
  assert.ok(shNoQ.indexOf('<p class="cl-nm-ref"><span class="cl-nm-ref-c">') > 0 && shNoQ.indexOf('cl-nm-ref-q') < 0 && shNoQ.indexOf('has-q') < 0, '質問の回答が無ければ「…」の案内だけ（面接所見・メモが切れたとき用）');
  const empty = plain(cl); empty.notes = {};
  const shE = S.checklistSheetHtml(S.buildRecord(Object.assign({}, st, { checklist: empty, interviewNotes: '', applicant: Object.assign({}, st.applicant, { reviewerNotes: '' }) })), p, {});
  assert.ok(shE.indexOf('<section class="cl-blk cl-blk-notes"><h3 class="cl-h">面接メモ・所見</h3><div class="cl-nm-box is-empty"><div class="cl-nm-lines" aria-hidden="true"><i></i>') > 0 &&
    shE.indexOf('cl-nm-row') < 0 && shE.indexOf('cl-nm-ref') < 0 && (shE.match(/<i><\/i>/g) || []).length === 38, '何も無ければ空の枠（手書き用の罫線 38 本・案内なし）');
  assert.ok(sh.indexOf('<section class="cl-blk cl-blk-notes"><h3 class="cl-h">面接メモ・所見</h3><div class="cl-nm-box"><div class="cl-nm">') > 0 &&
    sh.indexOf('</p><div class="cl-nm-lines" aria-hidden="true">') > 0, '記入があれば上から並べ、案内の行の下に罫線');
  // 押印行は「説明・連絡」の後ろ（用紙の最下段）。枠は残りの高さいっぱい・押印行は内寸の下端（CSS）
  assert.ok(sh.indexOf('</section><div class="cl-exline">') > 0 && sh.indexOf('</div><div class="cl-stamps">') > sh.indexOf('<div class="cl-exline">'), '枠 → 説明・連絡 → 押印行');
  // (5) 短い名前: short → 既定の short（文言が既定と同じ旧い台本）→ 文言の先頭 14 文字＋「…」（前後の「」は外す）
  const pS = P();
  const qb = pS.checklist.sections[1].blocks[1];
  qb.items[0].label = '「アルバイトを続けるうえで一番大事にしたいことは何ですか？」'; delete qb.items[0].short;   // 文言を変えた（short なし）
  delete qb.items[1].short;                                                                                        // 文言は既定のまま（旧い台本）
  qb.items[2].short = '  当日欠勤の連絡  ';                                                                         // 設定した short（前後の空白は正規化で外す）
  const nS = S.normalizeProfile(pS);
  assert.strictEqual(nS.checklist.sections[1].blocks[1].items[2].short, '当日欠勤の連絡');
  assert.ok(!('short' in nS.checklist.sections[1].blocks[1].items[0]), '正規化では short を補わない（文言を後から変えても古い short が残らない）');
  const pBad = P(); pBad.checklist.sections[1].blocks[1].items[0].short = '   '; pBad.checklist.sections[1].blocks[1].items[1].short = 3;
  const nBad = S.normalizeProfile(pBad).checklist.sections[1].blocks[1].items;
  assert.ok(!('short' in nBad[0]) && !('short' in nBad[1]), '空・文字列以外の short は外す');
  assert.deepStrictEqual(plain(S.normalizeProfile(nS)), plain(nS), '冪等');
  const recS = S.buildRecord(Object.assign({}, st, { profile: nS, checklist: cl }));
  const shS = S.checklistSheetHtml(recS, nS, {});
  assert.ok(shS.indexOf('<span class="cl-nm-no">②</span>アルバイトを続けるうえで一番… ほか2問</div>') > 0, shS.match(/<span class="cl-nm-no">②<\/span>[^<]*/));
  const nQ = nS.checklist.sections[1].blocks[1].items;
  assert.strictEqual(S.checklistShortLabel(nQ[1]), '週3日出せないと分かったら', '文言が既定と同じ旧い台本は既定の short');
  assert.strictEqual(S.checklistShortLabel(nQ[2]), '当日欠勤の連絡', '設定した short');
  assert.strictEqual(S.checklistShortLabel({ id: 'x', label: '「短い質問？」' }), '短い質問？');
  assert.strictEqual(S.checklistShortLabel({ id: 'x', label: '12345678901234567890' }), '12345678901234…');
  assert.strictEqual(S.checklistShortLabel({ id: 'q_family', label: def.sections[0].blocks[4].items[2].label }), '家族の反対');
  // (6) 判定なしは結果タイルに「未実施」。判定ありは結果・総合判断・必須条件・確認点の順。既存の .cl-judge・.cl-tile-res・.cl-decision を残す
  const tiles = (sh.match(/<span class="cl-tile-k">[^<]+<\/span>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); });
  assert.deepStrictEqual(tiles, ['結果', '総合判断', '必須条件', '確認点']);
  ['<div class="cl-judge" data-result="recommend">', '<div class="cl-tile cl-tile-res t-ok"><span class="cl-tile-k">結果</span><span class="cl-tile-v">採用推奨</span>', '<span class="cl-tile-v">すべて一致</span>',
    '<span class="cl-tile-v">16<small>/16点</small></span>', '○7 △0 ×0', 'class="cl-decision is-none"', 'cl-judge-row'].forEach(function (t) { assert.ok(sh.indexOf(t) > 0, 'sheet に ' + t); });
  assert.ok(sh.indexOf('<div class="cl-judge') < sh.indexOf('cl-blk-must') && sh.indexOf('class="cl-decision') < sh.indexOf('cl-blk-must'), '最終合否は結果ストリップの右端（必須条件より前）');
  const shN = S.checklistSheetHtml(Object.assign({}, rec, { judgment: null }), p, {});
  assert.ok(shN.indexOf('<div class="cl-tile cl-tile-res t-none"><span class="cl-tile-k">結果</span><span class="cl-tile-v">未実施</span>') > 0 && shN.indexOf('cl-adj') < 0);
  // 必須条件の不一致: 結果は不採用推奨・.cl-adj に「必須条件の不一致により「不採用推奨」に固定」の 1 行
  const clNg = plain(cl); clNg.values.must_busy = 'mismatch';
  const stNg = scriptState({ checklist: clNg }); stNg.judgment = R.evaluateScript(stNg.applicant, clNg, p, OPTS);
  const shNg = S.checklistSheetHtml(S.buildRecord(stNg), p, {});
  assert.ok(/<ul class="cl-adj"><li><b>必須条件の不一致により「不採用推奨」に固定<\/b>：必須条件が一致しないため/.test(shNg) && shNg.indexOf('<div class="cl-tile cl-tile-must is-ng"><span class="cl-tile-k">必須条件</span><span class="cl-tile-v">不一致 1</span>') > 0 &&
    shNg.indexOf('<div class="cl-judge" data-result="reject">') > 0 && shNg.indexOf('<tr class="m-mismatch" data-cl-item="must_busy"><td class="cl-mm-c"><span class="cl-mm">×不一致</span>') > 0, shNg.slice(0, 200));
  // 押印行は用紙の最下段の .cl-stamps（record.management から描く。o.stamps の文字列は使わない）。押印 1 件 → ハンコ 1・欄 2・2 列
  const shSt = S.checklistSheetHtml(rec, p, { stamps: '<div class="stamp-row">S</div>' });
  const stRow = shSt.slice(shSt.indexOf('<div class="cl-stamps">'));
  assert.ok(stRow.indexOf('<div class="cl-stamps"><div class="stamp-row cl-stamps-row cols-2">') === 0 && /<\/div><\/div><\/div><\/div>$/.test(stRow) && shSt.indexOf('>S<') < 0, '最下段・o.stamps は使わない');
  assert.ok((stRow.match(/<svg class="hanko"/g) || []).length === 1 && (stRow.match(/data-field-id="/g) || []).length === 2 && stRow.indexOf('笹川 晴央（副支配人）　2026.10.10') > 0);
  //   押印欄 4 件は 3 列（cols-2 なし）
  const p4s = P(); p4s.management.fields.push({ id: 'extra3', label: '追加確認3', hint: '' }, { id: 'extra4', label: '追加確認4', hint: '' });
  const sh4s = S.checklistSheetHtml(rec, S.normalizeProfile(p4s), {});
  assert.ok((sh4s.match(/data-field-id="/g) || []).length === 4 && sh4s.indexOf('cols-2') < 0 && sh4s.indexOf('<div class="stamp-row cl-stamps-row">') > 0);
  // 見出し（白地＋下線。題名・台本の版・劇場名・作成日。ロゴが無ければ題名だけ）
  assert.ok(sh.indexOf('<div class="cl-title"><span class="cl-title-t">面接チェックリスト報告</span><span class="cl-title-r">台本 2026-10-08 版 ／ TOHOシネマズ新宿 ／ 作成 ') > 0 && sh.indexOf('cl-band') < 0);
  // (7) 旧い形式の記録（mode: 'full'・2 軸の判定・勤務条件の項目入り）でも 4 タイル・応募者は ① の項目だけ
  const shF = S.checklistSheetHtml(fixtureRecord('legacy-full-checklist.html'), P(), {});
  assert.ok(shF.indexOf('<span class="cl-tile-k">シフト貢献度</span>') < 0 && shF.indexOf('cl-tiles n5') < 0 && shF.indexOf('<dt>勤務期間</dt>') < 0 && shF.indexOf('<dt>希望シフト</dt>') < 0 && shF.indexOf('<div class="cl-tiles">') > 0);
  // (8) 1 ページ保証: CSS（.cl-compact・.cl-compact-2）と保存 HTML の計測（アプリと同じ関数のソース）
  const css = S.checklistSheetCss();
  ['.cl-mode-sheet.cl-compact{font-size:9px', '.cl-mode-sheet.cl-compact-2 .cl-nm-q{display:none}', '.cl-mode-sheet.cl-nm-cut .cl-nm-ref,.cl-mode-sheet.cl-compact-2 .cl-nm-ref.has-q{display:block}', '-webkit-line-clamp:2',
    // A4 縦の用紙（210×297mm・内側の余白 8mm／10mm）。用紙のハンコはアプリのダークテーマの明るさ補正を受けない
    '.a4{display:block;box-sizing:border-box;width:210mm;height:297mm;padding:8mm 10mm;', '.cl-sheet .hanko,.cl-sheet .verdict-stamp{filter:none !important}',
    '.cl-mode-sheet .cl-title{display:flex;align-items:center;gap:8px;min-height:7mm;padding:0 1px 3px;border-bottom:2px solid #24324a}',
    // 面接所見は行数の上限を固定（.cl-compact 10 行 → .cl-compact-q1 6 行 → .cl-compact-2 4 行）。質問の回答は .cl-compact では 2 行のまま、.cl-compact-q1 で 1 行
    '.cl-mode-sheet.cl-compact .cl-nm-iv .cl-nm-v,.cl-mode-sheet.cl-compact .cl-nm-memo .cl-nm-v{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:10;overflow:hidden}',
    '.cl-mode-sheet.cl-compact-q1 .cl-nm-q .cl-nm-v,.cl-mode-sheet.cl-compact-q1 .cl-nm-b .cl-nm-v{-webkit-line-clamp:1}', '.cl-mode-sheet.cl-compact-q1 .cl-nm-iv .cl-nm-v{-webkit-line-clamp:6}', '.cl-mode-sheet.cl-compact-2 .cl-nm-iv .cl-nm-v{-webkit-line-clamp:4}',
    // 用紙を埋める（docs/SPEC-a4.md 12 章）: シートは用紙の内寸いっぱい（計測は .cl-measure で内容の高さ）・面接メモ・所見の枠が残りの高さ・罫線 7.5mm・ゆったり（.cl-roomy 本文 10.5px）
    'display:flex;flex-direction:column;min-height:100%}', '.cl-sheet.cl-mode-sheet.cl-measure{min-height:0 !important}', '.cl-mode-sheet .cl-blk-notes{flex:1 1 auto;',
    '.cl-mode-sheet .cl-nm-lines{flex:1 1 0;min-height:0;overflow:hidden}', '.cl-mode-sheet .cl-nm-lines i{display:block;height:7.5mm;border-bottom:1px dotted', '.cl-mode-sheet.cl-roomy{font-size:10.5px;',
    '.cl-mode-sheet.cl-roomy.cl-measure .cl-nm-box .cl-nm-lines{min-height:38mm}'
  ].forEach(function (t) { assert.ok(css.indexOf(t) >= 0, 'CSS に ' + t); });
  // 罫線の最低 38mm は計測中（.cl-measure）だけ。表示中も付けると、狭い画面の --a4-zoom で内容が数 % 伸びたとき押印行が用紙の下端より下に押し出される
  assert.ok(css.indexOf('.cl-mode-sheet.cl-roomy .cl-nm-box .cl-nm-lines{min-height:38mm}') < 0, '表示中は罫線に最低の高さ 38mm を付けない');
  assert.ok(css.indexOf('.cl-mode-sheet.cl-compact .cl-nm-q .cl-nm-v') < 0, '.cl-compact では質問の回答を 1 行にしない（面接所見から先に削る）');
  assert.ok(css.indexOf('cl-fit') < 0 && css.indexOf('break-before:page') < 0, '2 ページ用の規則なし');
  ['@page clsheet', '.cl-band', 'cl-sheet-print', 'print-checklist', 'cl-mode-section', '.cl-s-h', '@media'].forEach(function (x) { assert.ok(css.indexOf(x) < 0, 'CSS に無い: ' + x); });   // 用紙の中に画面幅で変わる規則を置かない
  // 保存 HTML の計測: アプリと同じ関数のソース・上限は用紙の内寸の高さ（押印行込み）。印刷のための切替なし
  const html = S.generateReportHTML(rec, p);
  assert.ok(html.indexOf('function clFitSheet(sheet, limit)') > 0 && html.indexOf('var LIMIT=1052,') > 0 && html.indexOf('window.__a4Fit = fit;') > 0 && html.indexOf('cl-fit') < 0);
  assert.ok(html.indexOf('webkitLineClamp') < 0, '面接所見を残りの高さまで広げない（行数の上限は CSS で固定）');
  assert.ok(S.CL_SHEET_LIMIT_PX === 1052 && S.checklistSheetLimit === undefined && S.CL_SHEET_BODY_PX === undefined, '上限は定数 1 つ（押印欄の件数による見積もりは無い）');
  const p4 = P(); p4.management.fields.push({ id: 'extra3', label: '追加確認3', hint: '' }, { id: 'extra4', label: '追加確認4', hint: '' });
  const n4 = S.normalizeProfile(p4);
  assert.strictEqual(n4.management.fields.length, 4);
  const html4 = S.generateReportHTML(S.buildRecord(Object.assign({}, st, { profile: n4, checklist: cl })), n4);
  assert.ok(html4.indexOf('var LIMIT=1052,') > 0 && (noScript(html4).match(/class="stamp-box" data-field-id="/g) || []).length === 4, '押印欄 4 件も同じ上限（押印行を含めて計る）');
  assert.strictEqual((html.match(/<\/script>/g) || []).length, (html.match(/<script[ >]/g) || []).length);
  // 台本の全文（質問文・説明文・補足）は保存 HTML にも出さない（「詳細」表示は 2026-10-14 に削除）
  const shownH = noScript(html).replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');
  assert.ok(shownH.length > 1000 && shownH.indexOf('ol class="cl-qs"') < 0 && shownH.indexOf('歌舞伎町ですので') < 0 && shownH.indexOf('シフト提出は木曜23時、確定は水曜') < 0 && shownH.indexOf('cl-hint') < 0);
});

test('81 1 ページ保証の詰め方（fitChecklistSheet: 段階の順・「…」の案内と .cl-cut・押印行込みの高さ・縮小の測り直し）', function () {
  // 疑似 DOM: 高さは付いているクラスと縮小率で決める。縮小は Chromium と同じく比例しない（小さくするほど縮み切らない）ものとする
  function classes() {
    const c = {};
    return { c: c, list: { add: function (x) { c[x] = true; }, remove: function (x) { delete c[x]; }, contains: function (x) { return !!c[x]; } } };
  }
  function mock(base, opts) {
    opts = opts || {};
    const sc = classes(), cls = sc.c;
    // メモの要素: 表示されていて切れるもの・表示されていて切れないもの・非表示（切れる寸法でも数えない）。classList の無い要素は飛ばす
    const vCut = classes(), vOk = classes(), vHidden = classes();
    const els = [
      { classList: vCut.list, getClientRects: function () { return [1]; }, get scrollHeight() { return (typeof opts.cut === 'function' ? opts.cut(cls) : !!opts.cut) ? 40 : 20; }, clientHeight: 20, scrollWidth: 100, clientWidth: 100 },
      { classList: vOk.list, getClientRects: function () { return [1]; }, scrollHeight: 20, clientHeight: 20, scrollWidth: 100, clientWidth: 100 },
      { classList: vHidden.list, getClientRects: function () { return []; }, scrollHeight: 99, clientHeight: 1, scrollWidth: 1, clientWidth: 1 },
      { getClientRects: function () { return []; }, scrollHeight: 1, clientHeight: 1, scrollWidth: 1, clientWidth: 1 }
    ];
    vOk.c['cl-cut'] = true;   // 前回の計測の残り（切れなくなったら外す）
    const sheet = {
      style: { zoom: '' },
      classList: sc.list,
      querySelector: function (sel) { return sel === '.cl-stamps' && opts.stamps ? opts.stamps(sheet) : null; },
      querySelectorAll: function () { return els; },
      __els: { cut: vCut.c, ok: vOk.c, hidden: vHidden.c },
      // opts.fill: 計測中（.cl-measure）でなければ用紙の内寸いっぱい（1062px）に伸びている（docs/SPEC-a4.md 12 章）
      getBoundingClientRect: function () { const h = opts.hidden ? 0 : opts.fill && !cls['cl-measure'] ? 1062 : sheet.__h(); return { top: 0, height: h, bottom: h }; },
      __h: function () {
        let h = base.v;
        if (cls['cl-roomy']) h += opts.roomy || 80;   // ゆったり（本文 10.5px・罫線 38mm を残す）
        if (cls['cl-compact']) h -= 60;
        if (cls['cl-compact-q1']) h -= 40;
        if (cls['cl-compact-2']) h -= 60;
        if (cls['cl-nm-cut']) h += 12;   // 案内 1 行の高さ
        const z = parseFloat(sheet.style.zoom || '1');
        return z === 1 ? h : 300 + (h - 300) * z;
      }
    };
    return { sheet: sheet, cls: cls };
  }
  const L = 950;
  const cutOf = function (m) { return ['cut', 'ok', 'hidden'].filter(function (k) { return !!m.sheet.__els[k]['cl-cut']; }).join(','); };
  const on = function (m) { return ['cl-compact', 'cl-compact-q1', 'cl-compact-2', 'cl-nm-cut'].filter(function (c) { return m.cls[c]; }).join(' '); };
  let m = mock({ v: 900 });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), '');
  assert.strictEqual(on(m), '');
  assert.strictEqual(cutOf(m), '', '切れていなければ .cl-cut は付かない（前回の残りも外す）');
  m = mock({ v: 900 }, { cut: true });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), '');
  assert.strictEqual(on(m), 'cl-nm-cut', '「…」で切れたメモがあれば案内を出す（詰めなくても）');
  assert.strictEqual(cutOf(m), 'cut', '切れた要素だけに .cl-cut（非表示の要素には付けない。保存 HTML ではクリックで全文）');
  m = mock({ v: 1000 });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'cl-compact');
  // 案内 1 行の高さも含めて計る: .cl-compact だと 952px（案内込み）→ .cl-compact-q1
  m = mock({ v: 1000 }, { cut: true });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'cl-compact-q1');
  assert.strictEqual(on(m), 'cl-compact cl-compact-q1 cl-nm-cut');
  m = mock({ v: 1060 });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'cl-compact-2');
  assert.strictEqual(on(m), 'cl-compact cl-compact-q1 cl-compact-2');
  // 縮小: 1 回で決めず、縮小後の高さを測り直して上限に収まるまで下げる（比例しないので 1 回目の倍率では超える）
  const big = { v: 2000 };
  m = mock(big);
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'zoom');
  const z = parseFloat(m.sheet.style.zoom);
  const first = Math.floor(L / 1840 * 1000) / 1000;
  assert.ok(z < first && z >= 0.3 && m.sheet.__h() <= L, JSON.stringify({ z: z, first: first, h: m.sheet.__h() }));
  // 測り直すたびに付け直す（内容が減ったら縮小・クラスを外す）
  big.v = 940;
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), '');
  assert.ok(m.sheet.style.zoom === '' && on(m) === '', on(m));
  // 押印行（.cl-stamps）があってもシート全体の高さで計る（押印行は用紙の中。docs/SPEC-a4.md S3）
  m = mock({ v: 1000 }, { stamps: function () { return { previousElementSibling: { getBoundingClientRect: function () { return { bottom: 930 }; } } }; } });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'cl-compact', '押印行込みの 1000px は上限超え');
  // 上限を省略すると用紙の内寸の高さの上限（CL_SHEET_LIMIT_PX = 1052）
  m = mock({ v: S.CL_SHEET_LIMIT_PX + 1 });
  assert.strictEqual(S.fitChecklistSheet(m.sheet), 'cl-compact');
  m = mock({ v: S.CL_SHEET_LIMIT_PX });
  assert.strictEqual(S.fitChecklistSheet(m.sheet), '');
  // ゆったり（.cl-roomy。docs/SPEC-a4.md 12 章 F3）: まず .cl-roomy を試し、収まれば 'cl-roomy'。収まらなければ外して通常 → .cl-compact…
  //   計測は .cl-measure（用紙いっぱいに伸ばさない）を付けた内容の高さ。計測のあとは .cl-measure を残さない
  const roomyOf = function (mm) { return !!mm.cls['cl-roomy']; };
  const small = { v: 800 };
  m = mock(small, { fill: true });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'cl-roomy', '内容が少なければゆったり（用紙いっぱいに伸びた高さではなく内容の高さで計る）');
  assert.ok(roomyOf(m) && on(m) === '' && !m.cls['cl-measure'] && m.sheet.style.zoom === '', JSON.stringify(m.cls));
  small.v = 900;   // 980px（ゆったり）は上限超え → 通常
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), '');
  assert.ok(!roomyOf(m) && on(m) === '' && !m.cls['cl-measure'], '収まらなければ .cl-roomy を外す');
  small.v = 1000;
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'cl-compact');
  assert.ok(!roomyOf(m) && on(m) === 'cl-compact', '詰める段階では .cl-roomy なし');
  small.v = 700;
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'cl-roomy');
  assert.ok(roomyOf(m) && on(m) === '', '内容が減ればゆったりに戻す（.cl-compact を外す）');
  m = mock({ v: 800 }, { cut: function (c) { return !!c['cl-roomy']; }, fill: true });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), 'cl-roomy');
  assert.ok(m.cls['cl-nm-cut'] && cutOf(m) === 'cut', 'ゆったりでも「…」の案内と .cl-cut を付ける（その段階で測り直す）');
  m = mock({ v: 860 }, { cut: function (c) { return !!c['cl-roomy']; } });   // ゆったり 952px（案内込み）→ 通常は切れない 860px
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), '');
  assert.ok(!m.cls['cl-nm-cut'] && cutOf(m) === '', '段階を戻したら案内と .cl-cut も測り直す');
  // 表示されていない用紙（高さ 0）は何も付けない
  m = mock({ v: 500 }, { hidden: true });
  assert.strictEqual(S.fitChecklistSheet(m.sheet, L), '');
  assert.ok(!roomyOf(m) && on(m) === '');
});
// ======================================================================
// 面接特化（docs/SPEC-slim.md 5-1。#82〜#88）
test('82 既定プロファイル（8 キー・押印欄 2 つ・features・options・台本に自動表示なし・texts）', function () {
  const p = P();
  assert.deepStrictEqual(Object.keys(p), ['schemaVersion', 'meta', 'features', 'management', 'options', 'evaluation', 'checklist', 'texts']);
  assert.deepStrictEqual(plain(p.management.fields.map(function (f) { return f.id; })), ['interviewer', 'final']);
  assert.deepStrictEqual(plain(p.management.fields.map(function (f) { return f.label; })), ['面接対応者', '最終確認']);
  assert.deepStrictEqual(plain(p.features), { graduationDate: true });
  assert.deepStrictEqual(Object.keys(p.options), ['genders', 'categories']);
  assert.deepStrictEqual(plain(p.evaluation), { thresholds: { recommendPct: 70, reviewPct: 40 } });
  R.checklistItems(p.checklist).forEach(function (x) { assert.ok(!('auto' in x.item) && !('autoParams' in x.item), x.item.id); });
  assert.deepStrictEqual(Object.keys(p.texts), ['recommend', 'review', 'reject', 'disclaimer', 'bandLabels', 'script']);
  ['recommend', 'review', 'reject'].forEach(function (k) { assert.deepStrictEqual(Object.keys(p.texts[k]), ['title'], k); });
  assert.deepStrictEqual(Object.keys(p.texts.script), ['recommend', 'review', 'reject', 'missing', 'mustGate', 'adjusted']);
  Object.keys(p.texts.script).forEach(function (k) { assert.ok(p.texts.script[k].indexOf('シフト貢献度') < 0 && p.texts.script[k].indexOf('2軸') < 0, k); });
  assert.strictEqual(p.checklist.header.interviewerField, 'interviewer');
  assert.strictEqual(p.management.decision.stampField, 'final');
  // 既定は正規化しても変わらない・検証エラーなし
  assert.deepStrictEqual(plain(S.normalizeProfile(P())), plain(P()));
  assert.deepStrictEqual(plain(S.validateProfile(P())), { errors: [], warnings: [] });
  const rep = {};
  S.normalizeProfile(P(), rep);
  assert.deepStrictEqual(plain(rep), {}, '既定の設定は report なし');
});

test('83 normalizeProfile（押印欄 initial を外す・独自の欄は残す・削除したキーを落とす・冪等）', function () {
  const ids = function (p) { return plain(p.management.fields.map(function (f) { return f.id; })); };
  // 3 欄（初期対応者の表示名を変更・面接対応者／最終確認の表示名も変更）→ 2 欄・表示名は保存値を維持
  const p3 = P();
  p3.management.fields = [{ id: 'initial', label: '受付担当', hint: '応募受付を行った担当者' }, { id: 'interviewer', label: '面接担当', hint: '' }, { id: 'final', label: '店長確認', hint: 'x' }];
  const n3 = S.normalizeProfile(p3);
  assert.deepStrictEqual(ids(n3), ['interviewer', 'final']);
  assert.deepStrictEqual(plain(n3.management.fields), [{ id: 'interviewer', label: '面接担当', hint: '' }, { id: 'final', label: '店長確認', hint: 'x' }]);
  // JSON で足した独自の欄は残す
  const px = P(); px.management.fields.push({ id: 'extra3', label: '追加確認', hint: '' });
  assert.deepStrictEqual(ids(S.normalizeProfile(px)), ['interviewer', 'final', 'extra3']);
  // 空・initial だけ → 既定の 2 欄
  const p0 = P(); p0.management.fields = [];
  assert.deepStrictEqual(ids(S.normalizeProfile(p0)), ['interviewer', 'final']);
  const pi = P(); pi.management.fields = [{ id: 'initial', label: '初期' }];
  assert.deepStrictEqual(ids(S.normalizeProfile(pi)), ['interviewer', 'final']);
  // 担当と連動する押印欄・最終合否と連動する押印欄に initial が入っていた旧設定
  const pv = P(); pv.management.fields.unshift({ id: 'initial', label: '初期', hint: '' });
  pv.checklist.header.interviewerField = 'initial'; pv.management.decision.stampField = 'initial';
  const nv = S.normalizeProfile(pv);
  assert.strictEqual(nv.checklist.header.interviewerField, 'interviewer');
  assert.strictEqual(nv.management.decision.stampField, 'final');
  const pn = P(); pn.management.fields = [{ id: 'initial', label: '初期' }, { id: 'boss', label: '上長' }]; pn.checklist.header.interviewerField = 'initial';
  const nn = S.normalizeProfile(pn);
  assert.ok(nn.checklist.header.interviewerField === '' && nn.management.decision.stampField === '', JSON.stringify([nn.checklist.header.interviewerField, nn.management.decision.stampField]));
  // full-mode-last の保存済み設定（mode:'full'・初期対応者の表示名「受付担当」）
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'legacy-profile-full.json'), 'utf8'));
  assert.strictEqual(raw.mode, 'full');
  const rep = {};
  const nf = S.normalizeProfile(raw, rep);
  assert.ok(rep.fullModeRemoved === true && rep.stripped === true && !rep.v1Reset, JSON.stringify(plain(rep)));
  assert.deepStrictEqual(Object.keys(nf), Object.keys(P()));
  ['mode', 'inputStages', 'stageOptions', 'highschoolPolicy', 'params', 'handoffRules', 'contribution', 'matrix'].forEach(function (k) { assert.ok(!(k in nf), '削除キー: ' + k); });
  assert.deepStrictEqual(plain(nf.features), { graduationDate: true });
  assert.deepStrictEqual(Object.keys(nf.options), ['genders', 'categories']);
  assert.deepStrictEqual(plain(nf.evaluation), { thresholds: { recommendPct: 70, reviewPct: 40 } });
  assert.deepStrictEqual(Object.keys(nf.texts), Object.keys(P().texts));
  assert.deepStrictEqual(ids(nf), ['interviewer', 'final']);
  assert.strictEqual(nf.meta.theaterName, 'TOHOシネマズ テスト');
  assert.ok(JSON.stringify(plain(nf)).indexOf('受付担当') < 0 && JSON.stringify(plain(nf)).indexOf('"auto"') < 0);
  // 冪等（2 回目は report なし）
  assert.deepStrictEqual(plain(S.normalizeProfile(nf)), plain(nf));
  const rep2 = {};
  S.normalizeProfile(plain(nf), rep2);
  assert.deepStrictEqual(plain(rep2), {}, '正規化済みの設定は report なし');
  [p3, px, pv, pn].forEach(function (x, i) { const once = S.normalizeProfile(x); assert.deepStrictEqual(plain(S.normalizeProfile(once)), plain(once), '冪等 ' + i); });
  // mode だけ（詳細モード）は fullModeRemoved
  const rm = {}; S.normalizeProfile(Object.assign(P(), { mode: 'full' }), rm);
  assert.ok(rm.fullModeRemoved && rm.stripped);
  const rs = {}; S.normalizeProfile(Object.assign(P(), { mode: 'script' }), rs);
  assert.ok(!rs.fullModeRemoved && rs.stripped, '台本モードの mode も落とす（toast は出さない）');
  // 値の型が壊れていても既定で補う
  const pb = P(); pb.meta.theaterName = 5; pb.options.genders = 'x'; pb.options.categories = [{ value: '' }, 'x', { value: 'A' }]; pb.evaluation.thresholds = { recommendPct: '80', reviewPct: 'x' };
  pb.features.graduationDate = false; pb.texts.recommend = { title: 3 }; pb.texts.bandLabels = null;
  const nb = S.normalizeProfile(pb);
  assert.strictEqual(nb.meta.theaterName, 'TOHOシネマズ新宿');
  assert.deepStrictEqual(plain(nb.options.genders), plain(P().options.genders));
  assert.deepStrictEqual(plain(nb.options.categories), [{ value: 'A', group: 'other' }]);
  assert.deepStrictEqual(plain(nb.evaluation.thresholds), { recommendPct: 80, reviewPct: 40 });
  assert.strictEqual(nb.features.graduationDate, false);
  assert.strictEqual(nb.texts.recommend.title, '採用推奨');
  assert.deepStrictEqual(plain(nb.texts.bandLabels), { high: '高', mid: '中', low: '低' });
});

test('84 v1 プロファイル → 既定・parseProfileJSON（書き出した JSON を読める・形式でない JSON は拒否）', function () {
  const v1 = JSON.parse(fs.readFileSync(path.join(FIX, 'v1-profile-other.json'), 'utf8'));
  assert.strictEqual(v1.schemaVersion, 1);
  const rep = {};
  const n = S.normalizeProfile(v1, rep);
  assert.deepStrictEqual(plain(n), plain(P()), 'v1 は移行せず既定（劇場名も既定）');
  assert.ok(rep.v1Reset === true && !rep.fullModeRemoved, JSON.stringify(plain(rep)));
  const repV = {};
  S.normalizeProfile({ meta: { theaterName: 'x' } }, repV);   // schemaVersion なし = v1
  assert.strictEqual(repV.v1Reset, true);
  // {}（保存済みの設定なし）は report なし
  const r0 = {};
  assert.deepStrictEqual(plain(S.normalizeProfile({}, r0)), plain(P()));
  assert.deepStrictEqual(plain(r0), {});
  // parseProfileJSON: 書き出した JSON（handoffRules なし）・v1・full-mode-last の JSON を読む
  const exported = JSON.stringify(P(), null, 2);
  assert.ok(exported.indexOf('handoffRules') < 0 && exported.indexOf('"mode"') < 0);
  assert.deepStrictEqual(plain(S.parseProfileJSON(exported)), plain(P()));
  const rp = {};
  assert.deepStrictEqual(plain(S.parseProfileJSON(fs.readFileSync(path.join(FIX, 'v1-profile-other.json'), 'utf8'), rp)), plain(P()));
  assert.strictEqual(rp.v1Reset, true);
  const rf = {};
  assert.strictEqual(S.parseProfileJSON(fs.readFileSync(path.join(FIX, 'legacy-profile-full.json'), 'utf8'), rf).meta.theaterName, 'TOHOシネマズ テスト');
  assert.strictEqual(rf.fullModeRemoved, true);
  // 台本だけ・押印だけの JSON も受け付ける（meta は必須）
  assert.doesNotThrow(function () { S.parseProfileJSON(JSON.stringify({ schemaVersion: 2, meta: { theaterName: 'A' }, management: {} })); });
  ['{}', '{"foo":1}', '[]', 'null', '{"checklist":{},"management":{}}', '{"meta":{"theaterName":"A"}}', '{"meta":"x","checklist":{}}'].forEach(function (t) {
    assert.throws(function () { S.parseProfileJSON(t); }, /劇場プロファイルの形式ではありません/, t);
  });
  assert.throws(function () { S.parseProfileJSON('{x'); });
});

test('85 normalizeRecord（旧レコードの読み込み: v1・詳細モード・初期対応者の押印・壊れた値）', function () {
  const KEYS = ['name', 'gender', 'age', 'category', 'graduationDate', 'reviewerNotes'];
  // v1-record.html（schemaVersion 1・旧 10 項目の点数）
  const v1 = fixtureRecord('v1-record.html');
  const n1 = S.normalizeRecord(v1);
  assert.deepStrictEqual(Object.keys(n1.applicant), KEYS);
  assert.strictEqual(n1.applicant.name, v1.applicant.name);
  assert.ok(n1.legacy.v1 && n1.legacy.scores && n1.legacy.full && !n1.legacy.initial, JSON.stringify(plain(n1.legacy)));
  assert.ok(!R.checklistHasInput(n1.checklist) && n1.judgment && n1.judgment.result === v1.judgment.result && n1.step === 4);
  // legacy-full-checklist.html（詳細モード・回答 16 件・2 軸の判定）
  const f = fixtureRecord('legacy-full-checklist.html');
  assert.strictEqual(f.mode, 'full');
  const nf = S.normalizeRecord(f);
  assert.ok(nf.legacy.full && !nf.legacy.v1 && !nf.legacy.scores && !nf.legacy.initial, JSON.stringify(plain(nf.legacy)));
  assert.strictEqual(Object.keys(nf.checklist.values).length, Object.keys(f.checklist.values).length, '回答の件数が同じ');
  assert.deepStrictEqual(plain(nf.checklist.values), plain(f.checklist.values));
  assert.deepStrictEqual(Object.keys(nf.applicant), KEYS);
  assert.ok(nf.applicant.name === '面接 花子' && nf.step === 4 && nf.interviewNotes === f.interviewNotes, JSON.stringify(plain(nf.applicant)));
  ['workDays', 'shifts', 'vacation', 'lateNight'].forEach(function (k) { assert.ok(!(k in nf.applicant), '詳細の項目を捨てる: ' + k); });
  // legacy-full-stamps3.html（初期対応者／面接対応者／最終確認の 3 印・申し送りの段階で保存）
  const s3 = fixtureRecord('legacy-full-stamps3.html');
  assert.deepStrictEqual(Object.keys(s3.management), ['initial', 'interviewer', 'final']);
  const ns = S.normalizeRecord(s3);
  assert.deepStrictEqual(Object.keys(ns.management), ['interviewer', 'final']);
  assert.ok(ns.legacy.initial && ns.legacy.full && ns.step === 1, JSON.stringify(plain([ns.legacy, ns.step])));
  // 今の形式の記録（mode・handoff を書かない）は旧扱いにしない（D12）
  const now = S.normalizeRecord(S.buildRecord(scriptState()));
  assert.deepStrictEqual(plain(now.legacy), { v1: false, scores: false, full: false, initial: false });
  assert.ok(!S.normalizeRecord({ schemaVersion: 2, mode: 'script', handoff: { items: [] } }).legacy.full, 'mode: script は handoff があっても旧扱いにしない');
  assert.ok(S.normalizeRecord({ schemaVersion: 2, handoff: { items: [] } }).legacy.full, 'mode なし＋handoff は詳細モードの記録');
  // 年齢が数値 → 文字列、step 2 → 1、押印の無い欄は捨てる
  const nx = S.normalizeRecord({ schemaVersion: 2, step: 2, applicant: { name: 'x', age: 21, gender: null }, management: { interviewer: { name: '' }, final: 'x', extra: { name: 'A' } } });
  assert.ok(nx.applicant.age === '21' && nx.applicant.gender === '' && nx.step === 1, JSON.stringify(plain(nx)));
  assert.deepStrictEqual(Object.keys(nx.management), ['extra']);
  assert.ok(!nx.legacy.v1 && !nx.legacy.scores);
  // 壊れた値でも例外を出さない
  [null, undefined, {}, 'x', { applicant: 'x', checklist: 3, management: [], judgment: 'x', decision: 'hire', step: 'x' }, { checklist: { header: 'x', values: null } }].forEach(function (r) {
    let n;
    assert.doesNotThrow(function () { n = S.normalizeRecord(r); }, JSON.stringify(r));
    assert.deepStrictEqual(Object.keys(n.applicant), KEYS);
    assert.ok(n.step === 1 && n.judgment === null && n.decision === null && n.checklistDef === null, JSON.stringify(plain(n)));
    assert.ok(n.checklist.header && n.checklist.values && n.checklist.notes, '空の回答で補う');
  });
});

test('86 buildRecord（書くキー・応募者 6 キー）', function () {
  const st = scriptState({ applicant: { name: '台本 花子', age: 20, workDays: ['mon'], foreign: {}, reviewerNotes: 'x' } });
  st.handoff = { items: [] }; st.scores = { greeting: 5 }; st.handoffChecks = {};
  const rec = S.buildRecord(st);
  assert.deepStrictEqual(Object.keys(rec), ['kind', 'schemaVersion', 'savedAt', 'profile', 'step', 'applicant', 'checklist', 'checklistDef', 'interviewNotes', 'management', 'decision', 'judgment']);
  ['mode', 'inputStages', 'handoff', 'scores', 'contribution', 'highschool'].forEach(function (k) { assert.ok(!(k in rec), '書かない: ' + k); });
  assert.deepStrictEqual(plain(rec.applicant), { name: '台本 花子', gender: '', age: '20', category: '', graduationDate: '', reviewerNotes: 'x' });
  assert.deepStrictEqual(plain(rec.profile), { theaterName: 'TOHOシネマズ新宿', version: '5.0.0-alpha', schemaVersion: 2 });
  assert.ok(rec.judgment.mode === 'script' && rec.judgment.contribution === null && rec.judgment.matrix === null, '判定の形は変えない（B2）');
  // 往復: buildRecord → normalizeRecord で同じ値
  const n = S.normalizeRecord(plain(rec));
  assert.deepStrictEqual(plain(n.applicant), plain(rec.applicant));
  assert.deepStrictEqual(plain(n.management), plain(rec.management));
  assert.strictEqual(n.step, 4);
});

test('87 保存 HTML に削除した機能が無い（.dash・申し送りシート・レポート全体・初期対応者・詳細表示・印刷の切替）', function () {
  const st = scriptState({ management: { interviewer: { name: '笹川 晴央', short: '笹川', title: '副支配人', date: '2026.10.10', at: '' } } });
  const rec = plain(S.buildRecord(st));
  rec.scores = { greeting: 5, overall_judgment: 4 };   // 旧評価の点数があっても旧評価は出さない
  const html = S.generateReportHTML(rec, P());
  const shown = html.replace(/<script type="application\/json" id="recruit-record">[\s\S]*?<\/script>/, '');
  ['class="dash"', 'rtPrintSheet', 'rtPrintAll', '__prepareHandoffSheet', 'print-handoff', 'printingAll', '初期対応者', '詳細モード', 'シフト貢献度', '留意点', 'data-sec="scores"', '面接評価（旧形式', 'data-tile=', 'レポート全体',
    // 2026-10-14 に削除（docs/SPEC-a4.md 1-6）: 報告書／詳細の切替・印刷ボタン・印刷専用の複製・詳細表示の節とヘッダー・押印カード・合否パネル
    'rtViewFull', 'rtViewReport', 'rtPrintChecklist', 'print-checklist', '__prepareChecklistSheet', '__setReportView', '__fitChecklistPaper', 'data-sec=', 'class="rh"', 'class="rtool',
    'id="clSheet"', 'id="clPaper"', 'id="mgmt"', 'id="decision"', 'mgmtSave', 'view-report', 'view-full', 'cl-mode-section', 'beforeprint', 'afterprint']
    .forEach(function (t) { assert.ok(shown.indexOf(t) < 0, '保存 HTML に無い: ' + t); });
  assert.ok(html.indexOf('<body class="a4-doc"') > 0);
  // 用紙の押印欄は 2 つ・2 列
  const mg = html.slice(html.indexOf('<div class="cl-stamps">'), html.indexOf('</main>'));
  assert.ok(mg.indexOf('<div class="cl-stamps"><div class="stamp-row cl-stamps-row cols-2">') === 0, mg.slice(0, 80));
  assert.deepStrictEqual((mg.match(/data-field-id="([a-z]+)"/g) || []), ['data-field-id="interviewer"', 'data-field-id="final"']);
  assert.ok(html.indexOf('data-field-id="initial"') < 0);
  // 旧レコード（初期対応者の押印入り）から作っても初期対応者の欄は出ない（欄は設定の 2 つ）
  const s3 = fixtureRecord('legacy-full-stamps3.html');
  const h3 = S.generateReportHTML(s3, P());
  assert.ok(noScript(h3).indexOf('data-field-id="initial"') < 0 && noScript(h3).replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '').indexOf('初期対応者') < 0);
  assert.strictEqual((html.match(/<\/script>/g) || []).length, (html.match(/<script[ >]/g) || []).length, 'script 要素の開始・終了の数が同じ');
  // CSS: 削除した部品の規則が無い・用紙の押印行は 2 列のまま（狭い画面でも 1 列にしない。用紙ごと縮小する）
  const css = S.reportCss() + S.checklistSheetCss();
  ['print-handoff', '.dash', '.tile', 'li.h', '.mx', '.axes', '@page sheet', 'cl-tiles.n5', '.rtool', '.paper-wrap', '.rh-', '.sec{', '.decision{', '.mgmt-save', 'print-checklist'].forEach(function (t) { assert.ok(css.indexOf(t) < 0, 'CSS に無い: ' + t); });
  assert.ok(css.indexOf('.cl-sheet .stamp-row.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}') >= 0, 'CSS に用紙の押印行の 2 列');
  assert.ok(css.indexOf('@media (max-width:720px){.stamp-row') < 0 && css.indexOf('@media (max-width') < 0, '画面幅で押印行を 1 列にする規則は無い');
});

test('88 公開 API（削除した関数が無い・interviewModel の新しい引数）', function () {
  ['buildHandoff', 'evaluateHiring', 'computeContribution', 'isScriptMode', 'isScriptRecord', 'checklistAuto', 'hasNumericScore', 'firstContractEnd', 'CHECKLIST_AUTO',
    'analyzeShifts', 'highschoolStatus', 'nightStatus', 'describeApplicant', 'stageOf', 'interviewConfirm', 'CONDITIONS', 'LOCKED_RULES', 'INPUT_SECTIONS', 'DAYS']
    .forEach(function (k) { assert.strictEqual(R[k], undefined, 'R.' + k); });
  ['V1_DEFAULT_TEXTS', 'checklistSheetLimit', 'CL_SHEET_BODY_PX'].forEach(function (k) { assert.strictEqual(S[k], undefined, 'S.' + k); });
  ['RESULT_RANK', 'num', 'round1', 'bandOf', 'categoryGroup', 'isStudentGroup', 'emptyChecklist', 'checklistHasInput', 'checklistItems', 'interviewModel', 'mustSummary',
    'checklistSummary', 'checklistDiff', 'scriptApplicantRows', 'evaluateScript', 'circled'].forEach(function (k) { assert.ok(R[k] !== undefined, 'R.' + k); });
  ['normalizeRecord', 'normalizeProfile', 'parseProfileJSON', 'buildRecord', 'generateReportHTML', 'checklistSheetHtml', 'checklistSheetCss', 'fitChecklistSheet', 'brandLogo', 'reportCss'].forEach(function (k) { assert.strictEqual(typeof S[k], 'function', 'S.' + k); });
  assert.strictEqual(S.CL_SHEET_LIMIT_PX, 1052);
  // interviewModel(profile, cl): #55 と同じ点（旧い 3 引数の呼び方だと cl が {} になり 0 点になる）
  const cl = clMarks(['good', 'good', 'good', 'good', 'fair', 'fair', 'poor']);
  const m = R.interviewModel(P(), cl);
  assert.ok(m.total === 12 && m.max === 16 && m.pct === 75 && m.band === 'high' && m.mode === 'checklist', JSON.stringify(plain([m.total, m.pct, m.band])));
  assert.strictEqual(R.interviewModel(P(), {}).total, 0);
  assert.strictEqual(R.categoryGroup(P(), '大学2年生'), 'university');
  assert.ok(R.isStudentGroup('highschool') && !R.isStudentGroup('freeter'));
});

test('89 ロゴ（brand.js）: 用紙の見出し（アプリ ③・印刷・保存 HTML）は、ロゴがあれば画像・無ければ題名だけ', function () {
  const rec = S.buildRecord({ profile: P(), applicant: SA({ name: 'ロゴ 確認' }), checklist: R.emptyChecklist(), management: {}, step: 1 });
  const head = function (h) { return (h.match(/<div class="cl-title">[\s\S]*?<\/div>/) || [''])[0]; };
  const TITLE = '<span class="cl-title-t">面接チェックリスト報告</span>';
  // 公開版（RecruitBrand なし・空）: 題名だけ（1 文字のマークも出さない）
  ctx.RecruitBrand = undefined;
  let h = head(S.generateReportHTML(rec, P()));
  assert.ok(h.indexOf('<div class="cl-title">' + TITLE) === 0 && h.indexOf('<img') < 0 && h.indexOf('rh-mark') < 0, h);
  assert.strictEqual(S.brandLogo('x'), null);
  ctx.RecruitBrand = { logo: '', logoAlt: '' };
  h = head(S.generateReportHTML(rec, P()));
  assert.ok(h.indexOf('<img') < 0 && h.indexOf(TITLE) > 0, h);
  // ロゴあり: img（代替テキストはエスケープ）を題名の左に。保存 HTML とアプリの紙（checklistSheetHtml）で同じ
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  ctx.RecruitBrand = { logo: png, logoAlt: 'TOHO "CINEMAS" <x>' };
  h = head(S.generateReportHTML(rec, P()));
  assert.ok(h.indexOf('<div class="cl-title"><img class="cl-title-logo" src="' + png + '" alt="TOHO &quot;CINEMAS&quot; &lt;x&gt;">' + TITLE) === 0, h);
  assert.strictEqual(head(S.checklistSheetHtml(rec, P(), {})), h, 'アプリの紙・印刷と同じ見出し');
  assert.deepStrictEqual(plain(S.brandLogo('劇場')), { src: png, alt: 'TOHO "CINEMAS" <x>' });
  // 代替テキストが空なら劇場名
  ctx.RecruitBrand = { logo: png, logoAlt: '' };
  assert.ok(head(S.generateReportHTML(rec, P())).indexOf('alt="TOHOシネマズ新宿"') >= 0);
  // data URL の画像以外・不正な文字を含むものは使わない（題名だけ）
  ['javascript:alert(1)', 'https://example.com/logo.png', 'data:text/html;base64,PGI+', 'data:image/png;base64,AAA" onerror="x', 'data:image/svg+xml,<svg/>'].forEach(function (bad) {
    ctx.RecruitBrand = { logo: bad, logoAlt: '' };
    const hb = head(S.generateReportHTML(rec, P()));
    assert.ok(hb.indexOf('<img') < 0 && hb.indexOf(TITLE) > 0 && S.brandLogo('x') === null, bad + ' → ' + hb);
  });
  ctx.RecruitBrand = undefined;
  // CSS（高さ 7mm）
  assert.ok(S.checklistSheetCss().indexOf('.cl-mode-sheet .cl-title-logo{flex:none;display:block;height:7mm;width:auto;max-width:50mm;object-fit:contain}') >= 0);
  assert.ok(S.reportCss().indexOf('.rh-logo') < 0);
});

test('90 保存 HTML の構成（A4 縦の用紙 1 枚。docs/SPEC-a4.md 1-1）', function () {
  const rec = S.buildRecord(scriptState());
  const html = S.generateReportHTML(rec, P());
  // body の最初の要素が用紙 main.a4#a4、続いて用紙の外の 1 行（footer.a4-foot に meta.footer）・埋め込みデータ 2 つ・スクリプト 1 つ
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  assert.ok(/^<body class="a4-doc" data-filename="[^"]+">\n<main class="a4" id="a4"><div class="cl-sheet cl-mode-sheet">/.test(body), body.slice(0, 120));
  const foot = (html.match(/<footer class="a4-foot" id="a4Foot">([^<]*)<\/footer>/) || [])[1] || '';
  assert.ok(foot.indexOf(P().meta.footer) === 0 && foot.indexOf('このファイルはアプリの「読み込み」で再度開けます。埋め込みデータは編集しないでください。') > 0, foot);
  assert.ok(html.indexOf('<title>面接チェックリスト報告 - 台本 花子さん | TOHOシネマズ新宿</title>') > 0);
  assert.deepStrictEqual((body.match(/<script[^>]*>/g) || []), ['<script type="application/json" id="recruit-record">', '<script type="application/json" id="recruit-mgmt-config">', '<script>']);
  const tags = body.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.ok(/<\/main>\n<footer class="a4-foot" id="a4Foot">[^<]*<\/footer>\s*$/.test(tags), tags.slice(-200));
  // 窓・保存バー・押せる欄の印はスクリプトが作る（生成 HTML の要素には無い）
  const shown = html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
  ['class="pop', 'id="a4Pop"', 'class="savebar', 'id="saveBar"', 'data-a4-t=', 'a4-live', '--a4-zoom', 'tabindex=', 'role="button"'].forEach(function (t) { assert.ok(shown.indexOf(t) < 0, '生成 HTML に無い: ' + t); });
  // CSS: 印刷は用紙そのもの（@page の余白 0）。狭い画面の縮小は画面だけ
  const css = S.reportCss();
  ['@page{size:A4 portrait;margin:0}', '@media screen{\n.a4{zoom:var(--a4-zoom,1)}', 'body>.a4{margin:24px auto}', 'body>.a4{margin:0;box-shadow:none}', '.a4-foot,.pop,.savebar{display:none !important}',
    'body.a4-live .a4 [data-a4-t="stamp"]:hover::after{content:"クリックで押印"}'].forEach(function (t) { assert.ok(css.indexOf(t) >= 0, 'reportCss に ' + t); });
  assert.ok(html.indexOf('</' + 'script') === html.indexOf('</script>') && (html.match(/<\/script/gi) || []).length === 3, 'script の閉じタグは 3 つだけ');
  assert.ok(S.reportCss().indexOf('</' + 'script') < 0);
  // 押印欄 0・合否 OFF でも押印設定は出す（長いメモの窓は常に使う）
  const p0 = P(); p0.management.decision.enabled = false;
  const h0 = S.generateReportHTML(rec, p0);
  assert.ok(h0.indexOf('id="recruit-mgmt-config"') > 0 && JSON.parse(h0.match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]).decision === null);
  // 埋め込みスクリプトは構文として正しい（vm で解釈できる）
  const code = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
  assert.doesNotThrow(function () { new vm.Script(code); });
});

// ======================================================================
// 最終承認のパスワード（docs/SPEC-a4.md 11 章。#91〜#92）
test('91 最終承認のパスワード（lock.js: sha256Hex の既知ベクタ・hashPassword・verify・isLocked・newSalt・makeLock・source）', function () {
  const L = ctx.RecruitLock;
  // SHA-256 の既知ベクタ（FIPS 180-2 の '' と 'abc'・UTF-8 の多バイト文字）
  assert.strictEqual(L.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(L.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(L.sha256Hex('あ'), 'dc5a4d3d82f7e15792959dc661538ae0e541ce66494516f5c9cfd9cd3308494d');
  // Node の crypto と一致（ブロック境界 55・56・64 バイト・絵文字〔サロゲートペア〕・長い文字列）
  const crypto = require('crypto');
  ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), '😀絵文字', 'パスワード:sample-pass', 'x'.repeat(1000)].forEach(function (t) {
    assert.strictEqual(L.sha256Hex(t), crypto.createHash('sha256').update(t, 'utf8').digest('hex'), JSON.stringify(t.slice(0, 12)));
  });
  // hash = sha256Hex(salt + ':' + パスワード)
  const salt = '0123456789abcdef0123456789abcdef';
  assert.strictEqual(L.hashPassword(salt, 'sample-pass'), crypto.createHash('sha256').update(salt + ':sample-pass', 'utf8').digest('hex'));
  const lock = { salt: salt, hash: L.hashPassword(salt, 'sample-pass') };
  assert.ok(L.isLocked(lock) && L.verify(lock, 'sample-pass'));
  ['', 'sample-pas', 'Sample-pass', 'sample-pass ', null, undefined].forEach(function (w) { assert.ok(!L.verify(lock, w), '違うパスワード: ' + JSON.stringify(w)); });
  // ロックなし（hash が空・形が違う）は照合しない（パスワード不要）
  [{ salt: '', hash: '' }, null, undefined, 'x', { salt: salt, hash: '' }, { salt: '', hash: lock.hash }, { salt: salt, hash: lock.hash.slice(1) }, { salt: salt.toUpperCase(), hash: lock.hash }].forEach(function (l) {
    assert.ok(!L.isLocked(l) && L.verify(l, 'なんでも'), JSON.stringify(l));
  });
  // salt は 16 進 32 文字の乱数・makeLock（空ならロックなし）
  const s1 = L.newSalt(), s2 = L.newSalt();
  assert.ok(/^[0-9a-f]{32}$/.test(s1) && /^[0-9a-f]{32}$/.test(s2) && s1 !== s2, s1 + ' ' + s2);
  const mk = L.makeLock('sample-pass');
  assert.ok(L.isLocked(mk) && L.verify(mk, 'sample-pass') && !L.verify(mk, 'x') && mk.salt !== L.makeLock('sample-pass').salt);
  assert.deepStrictEqual(plain(L.makeLock('')), { salt: '', hash: '' });
  // 保存 HTML に埋め込む関数ソース: 外部参照なし（新しい vm で動く）・閉じタグ・関数内のコメントなし
  const src = L.source();
  const c2 = vm.createContext({});
  vm.runInContext(src, c2);
  assert.ok(c2.verify(lock, 'sample-pass') && !c2.verify(lock, 'x') && c2.isLocked(lock) && c2.sha256Hex('abc') === L.sha256Hex('abc'));
  assert.ok(src.indexOf('</' + 'script') < 0 && !/\/\/|\/\*/.test(src.replace(/"[^"]*"|'[^']*'/g, '')) && src.indexOf('newSalt') < 0, '埋め込むのは照合の関数だけ');
});

test('92 プロファイルの finalLock（normalizeProfile・validateProfile・JSON）と保存 HTML のロック（平文なし・保存時のロックで照合）', function () {
  const L = ctx.RecruitLock;
  const lock = L.makeLock('sample-pass');
  // 公開版の既定はロックなし
  assert.deepStrictEqual(plain(P().management.finalLock), { salt: '', hash: '' });
  // 正規化: 形が正しければ小文字にして残す・不正なら空（パスワードなし）
  const withLock = function (l) { const p = P(); p.management.finalLock = l; return p; };
  assert.deepStrictEqual(plain(S.normalizeProfile(withLock(lock)).management.finalLock), plain(lock));
  assert.deepStrictEqual(plain(S.normalizeProfile(withLock({ salt: lock.salt.toUpperCase(), hash: lock.hash.toUpperCase(), extra: 1 })).management.finalLock), plain(lock), '大文字の 16 進は小文字に・余分なキーは落とす');
  [{ salt: lock.salt, hash: lock.hash.slice(2) }, { salt: '', hash: lock.hash }, { salt: lock.salt + 'zz', hash: lock.hash }, { hash: lock.hash }, 'sample-pass', 123, null, [lock.salt, lock.hash]].forEach(function (l) {
    assert.deepStrictEqual(plain(S.normalizeProfile(withLock(l)).management.finalLock), { salt: '', hash: '' }, JSON.stringify(l));
  });
  // キーが無ければ既定（ローカル版ならローカルのロック）。キーが無いだけでは保存し直さない（report.stripped なし）
  const D = ctx.RECRUIT_DEFAULT_PROFILE.management;
  const keep = D.finalLock;
  try {
    D.finalLock = plain(lock);
    const raw = plain(S.normalizeProfile(P()));
    delete raw.management.finalLock;
    const rep = {};
    assert.deepStrictEqual(plain(S.normalizeProfile(raw, rep).management.finalLock), plain(lock), '保存済みの設定に finalLock が無ければ既定のロック');
    assert.deepStrictEqual(plain(rep), {}, 'finalLock が無いだけでは report.stripped を立てない（既定のロックを localStorage に固定しない）');
    raw.management.finalLock = { salt: '', hash: '' };
    assert.deepStrictEqual(plain(S.normalizeProfile(raw).management.finalLock), { salt: '', hash: '' }, '明示的に外した設定は外したまま');
  } finally { D.finalLock = keep; }
  // 冪等・JSON の書き出し／読み込みに含める（平文は持たない）
  const n1 = S.normalizeProfile(withLock(lock));
  assert.deepStrictEqual(plain(S.normalizeProfile(n1)), plain(n1));
  const json = JSON.stringify(n1);
  assert.deepStrictEqual(plain(S.parseProfileJSON(json).management.finalLock), plain(lock));
  assert.ok(json.indexOf('sample-pass') < 0);
  // validateProfile: hash があれば salt（16 進 32 文字）と 16 進 64 文字の hash を要求
  assert.deepStrictEqual(plain(S.validateProfile(n1)), { errors: [], warnings: [] });
  const bad = function (l) { return S.validateProfile(withLock(l)).errors.filter(function (e) { return e.indexOf('最終承認のパスワード') >= 0; }).length; };
  assert.strictEqual(bad({ salt: '', hash: '' }), 0);
  assert.strictEqual(bad({ salt: lock.salt, hash: lock.hash }), 0);
  assert.strictEqual(bad({ salt: '', hash: lock.hash }), 1, 'salt なし');
  assert.strictEqual(bad({ salt: lock.salt, hash: 'xyz' }), 1, 'hash が 16 進 64 文字でない');
  assert.strictEqual(bad('sample-pass'), 1, 'オブジェクトでない');
  // 保存 HTML: 保存時のロック（salt・hash）と、パスワードが要る押印欄（decision.stampField）を #recruit-mgmt-config に入れる。平文は無い
  const st = scriptState({ profile: n1 });
  const html = S.generateReportHTML(S.buildRecord(st), n1);
  const cfg = JSON.parse(html.match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]);
  assert.deepStrictEqual(plain(cfg.finalLock), plain(lock));
  assert.strictEqual(cfg.lockField, 'final');
  assert.ok(html.indexOf('sample-pass') < 0, '保存 HTML に平文が無い');
  ['function sha256Hex(str)', 'function hashPassword(salt, pw)', 'function isLocked(lock)', 'function verify(lock, pw)', '最終承認にはパスワードが必要です', 'パスワードが違います', 'type=\\"password\\" autocomplete=\\"off\\"'].forEach(function (t) {
    assert.ok(html.indexOf(t) > 0, '保存 HTML のスクリプトに ' + t);
  });
  const code = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
  assert.doesNotThrow(function () { new vm.Script(code); });
  assert.strictEqual((html.match(/<\/script/gi) || []).length, 3);
  // ロックなし（公開版）は null。保存したあとでパスワードを変えても、出したファイルは出した時点のロック
  const cfg0 = JSON.parse(S.generateReportHTML(S.buildRecord(scriptState()), P()).match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]);
  assert.strictEqual(cfg0.finalLock, null);
  const lock2 = L.makeLock('new-pass');
  const n2 = S.normalizeProfile(withLock(lock2));
  const cfg2 = JSON.parse(S.generateReportHTML(S.buildRecord(scriptState({ profile: n2 })), n2).match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]);
  assert.ok(cfg2.finalLock.hash === lock2.hash && cfg2.finalLock.hash !== cfg.finalLock.hash);
  // 連動する押印欄を「連動しない」にすると、パスワードが要るのは最終合否だけ（lockField が空）
  const n3 = S.normalizeProfile(withLock(lock)); n3.management.decision.stampField = '';
  const cfg3 = JSON.parse(S.generateReportHTML(S.buildRecord(scriptState({ profile: n3 })), n3).match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]);
  assert.ok(cfg3.lockField === '' && cfg3.finalLock.hash === lock.hash);
  // 公開 API
  assert.ok(typeof L.sha256Hex === 'function' && typeof L.hashPassword === 'function' && typeof L.verify === 'function' && typeof L.isLocked === 'function' && typeof L.newSalt === 'function' && typeof L.source === 'function');
});

console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
