/*
 * 配布ファイル（dist/toho-recruit-judge.html）のブラウザ通しテスト。
 *   node build.js && node tests/e2e.js
 * Playwright と Chromium が必要（npx playwright install chromium）。
 * スクリーンショットは tests/shots/ に出力（git 管理外）。
 * 失敗した確認（FAIL）が 1 つでもあれば exit 1。
 *
 * シナリオ（docs/SPEC.md 9-2）
 *   E1  主シナリオ（大学3年・例A）: Step1 は空欄ありで進める → Step3 で確定 → 2軸判定 → 全チェックで採用推奨
 *   E12 保存 → 読込（新項目の復元・schemaVersion 2・シフト貢献度セクション）
 *   既存 設定画面（劇場名・評価項目追加・書き出し・初期化）、使い方・ダークモード・狭い画面
 *   E5  例B（面接高×貢献低）→ 上長最終判断要 → 設定でマスを不採用推奨に変更 → 再判定
 *   E8  設定: 繁忙期の期間追加・貢献度 OFF の合計・LOCKED ルール・保存時の検証エラー
 *   E11 features.contribution=false で従来の面接のみ判定
 *   E2  高校2年（原則対象外） E3 高校3年の例外（条件充足・17歳のオールナイト）
 *   E4  高校3年 18歳・進路未決定・深夜帯○ E6 終電と最遅終了の突合 E10 入力の整合・ボタン
 *   E9  旧プロファイルの移行 E7 旧形式（v1）の保存ファイルの読み込み
 *   E13 高校3年・例外条件を面接で確認（Step3 で入力 → 採用推奨 → 保存・読込）
 *   E14 showBeforeInterview=OFF（面接前は貢献度の点数を出さない）
 */
const { chromium } = (function(){ try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
const FIX = path.join(__dirname, 'fixtures');
const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'toho-recruit-judge.html');
const NOW = new Date('2026-10-10T09:00:00+09:00');

const fails = [];
const expect = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch().catch(async e => {
    console.log('fallback launch', e.message.split('\n')[0]);
    return chromium.launch();
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  // ---------- helpers ----------
  const shot = (name, full) => page.screenshot({ path: path.join(OUT, name), fullPage: !!full });
  const wait = (ms) => page.waitForTimeout(ms || 200);
  const st = (fn, arg) => page.evaluate(fn, arg);
  const pick = async (field, value) => { await page.click('label:has(input[data-field="' + field + '"][value="' + value + '"])'); };
  const visible = (sel) => page.evaluate(s => { const el = document.querySelector(s); return !!el && !el.closest('.hidden') && el.offsetParent !== null; }, sel);
  const step = () => st(() => window.RecruitApp.state.step);
  const toastText = () => page.textContent('#toast');
  const handoffIds = () => st(() => window.RecruitApp.state.handoff.items.map(i => i.id));
  const handoffItem = (id) => st(x => window.RecruitApp.state.handoff.items.find(i => i.id === x) || null, id);
  const judgment = () => st(() => {
    const j = window.RecruitApp.state.judgment;
    return j && { result: j.result, title: j.title, mode: j.mode, cellKey: j.matrix && j.matrix.cellKey, note: j.matrix && j.matrix.note,
      baseResult: j.baseResult, contribution: j.contribution && j.contribution.total, contribBand: j.contribution && j.contribution.band,
      interviewBand: j.interview && j.interview.band, adjustments: (j.adjustments || []).map(a => a.code), total: j.total, max: j.max, pct: j.pct };
  });
  const contribution = () => st(() => {
    const c = window.RecruitRules.computeContribution(window.RecruitApp.state.applicant, window.RecruitApp.state.profile);
    return { total: c.total, max: c.max, band: c.band, missing: c.missing, incomplete: c.incomplete, parts: c.parts.map(p => ({ id: p.id, score: p.score, flags: p.flags, applicable: p.applicable })) };
  });
  const fresh = async () => {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();
    await wait(300);
  };
  const toView = async (v) => { await page.click('.nav-item[data-view="' + v + '"]'); await wait(300); };
  const navStep = async (n) => { await page.click('#stepNav [data-step="' + n + '"]'); await wait(300); };
  const fillBasic = async (o) => {
    await page.fill('[data-field="name"]', o.name);
    if (o.gender) await page.selectOption('[data-field="gender"]', o.gender);
    await page.fill('[data-field="age"]', String(o.age));
    await page.selectOption('[data-field="category"]', o.category);
    if (o.graduationDate) await page.fill('[data-field="graduationDate"]', o.graduationDate);
    await page.selectOption('[data-field="commuteMethod"]', o.commuteMethod || '公共交通機関');
    await page.fill('[data-field="commuteMinutes"]', String(o.commuteMinutes || 30));
    if (o.nearestStation) await page.fill('[data-field="nearestStation"]', o.nearestStation);
    for (const [d] of o.shifts) await pick('workDays', d);
    for (const [d, s, e] of o.shifts) {
      await page.fill('[data-field="shifts.' + d + '.start"]', s);
      await page.fill('[data-field="shifts.' + d + '.end"]', e);
    }
    if (o.daysMin) await page.fill('[data-field="daysMin"]', String(o.daysMin));
    if (o.daysMax) await page.fill('[data-field="daysMax"]', String(o.daysMax));
    await page.selectOption('[data-field="workPeriod"]', o.workPeriod || 'long');
    await wait(100);
  };
  // 繁忙期をすべて ○ にし、満点の日数を入れる
  const busyAllFull = async () => {
    await page.click('[data-action="busy-all-ok"]');
    await wait(150);
    const items = await st(() => window.RecruitRules.busyItems(window.RecruitApp.state.profile).map(v => [v.id, v.refDays]));
    for (const [id, d] of items) await page.fill('[data-field="vacationDays.' + id + '"]', String(d));
  };
  const scoreAll = async (v) => {
    const ids = await st(() => window.RecruitApp.state.profile.evaluation.items.map(i => i.id));
    for (const id of ids) await page.click('[data-action="score"][data-item="' + id + '"][data-value="' + v + '"]');
  };
  // スムーズスクロール中のクリック取りこぼしを防ぐため、check()（状態を検証する）で入れ、最後に全件を確認する
  const checkAll = async () => {
    await page.waitForFunction(() => { const y = window.scrollY; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(window.scrollY === y)))); });
    for (const cb of await page.$$('input[data-check]')) {
      for (let k = 0; k < 3 && !(await cb.isChecked()); k++) await cb.check({ force: true }).catch(() => {});
    }
    await wait(100);
    const ok = await st(() => window.RecruitApp.state.handoff.items.every(i => window.RecruitApp.state.handoffChecks[i.id]));
    if (!ok) throw new Error('checkAll: 留意点のチェックが入りきっていません');
  };
  const toHandoff = async () => { await page.click('[data-action="generate-handoff"]'); await wait(400); };
  const judge = async () => { await page.click('[data-action="judge"]'); await wait(400); };
  const saveSettings = async () => { await page.click('#view-settings [data-action="save"]'); await wait(300); };
  const storedProfile = () => st(() => JSON.parse(localStorage.getItem('recruit.profile.v1') || 'null'));
  const parseRecord = (html) => JSON.parse(html.match(/<script type="application\/json" id="recruit-record">([\s\S]*?)<\/script>/)[1].replace(/<\\\/script/gi, '</script'));

  await page.clock.setFixedTime(NOW);
  await page.goto(FILE);
  await wait(300);
  await shot('01-step1-empty.png');

  // =====================================================================
  // E1 主シナリオ（大学3年・21歳・SPEC 4-4 例A）
  // =====================================================================
  console.log('\n== E1 主シナリオ ==');
  await page.fill('[data-field="name"]', '佐藤 花子');
  await page.selectOption('[data-field="gender"]', '女性');
  await page.fill('[data-field="age"]', '21');
  await page.selectOption('[data-field="category"]', '大学3年生');
  await page.fill('[data-field="graduationDate"]', '2027-03');
  await page.selectOption('[data-field="commuteMethod"]', '公共交通機関');
  await page.fill('[data-field="commuteMinutes"]', '40');
  await page.fill('[data-field="nearestStation"]', '高田馬場');
  for (const d of ['mon', 'wed', 'fri', 'sat']) await pick('workDays', d);
  await page.fill('[data-field="daysMin"]', '2');
  await page.fill('[data-field="daysMax"]', '4');
  await page.fill('[data-field="shifts.mon.start"]', '17:00');
  await page.fill('[data-field="shifts.mon.end"]', '23:30');
  await page.fill('[data-field="shifts.wed.start"]', '10:00');
  await page.fill('[data-field="shifts.wed.end"]', '12:00');
  await page.fill('[data-field="shifts.fri.start"]', '18:00');
  await page.fill('[data-field="shifts.fri.end"]', '01:00');
  await page.fill('[data-field="shifts.sat.start"]', '08:00');
  await page.fill('[data-field="shifts.sat.end"]', '17:00');
  await page.selectOption('[data-field="workPeriod"]', 'mid');
  await pick('sideJob', 'yes');
  await page.fill('[data-field="sideJobDetail"]', 'カフェ 週1日');
  // 繁忙期は Step1 では GW○5・年末年始○4 だけ（他は面接で確認）
  await pick('vacation.gw', 'ok');
  await pick('vacation.yearend', 'ok');
  await wait(100);
  expect(await visible('#grp-vdays-gw') && !(await visible('#grp-vdays-summer')), 'E1 日数欄は ○△ の期間だけ表示');
  await page.fill('[data-field="vacationDays.gw"]', '5');
  await page.fill('[data-field="vacationDays.yearend"]', '4');
  await page.fill('[data-field="vacationDays.gw"]', '12');
  await wait(100);
  expect(await page.inputValue('[data-field="vacationDays.gw"]') === '9', 'E1 繁忙期の日数は上限（GW 9日）に丸める');
  await page.fill('[data-field="vacationDays.gw"]', '5');
  await pick('lateNight.availability', 'ok');
  await page.selectOption('[data-field="lateNight.returnMethod"]', 'taxi');
  await page.fill('[data-field="lateNight.taxiFare"]', '3800');
  await pick('foreign.isForeign', 'yes');
  await page.selectOption('[data-field="foreign.residenceStatus"]', '留学');
  await page.selectOption('[data-field="foreign.workPermit"]', 'unknown');
  await page.fill('[data-field="foreign.residenceExpiry"]', '2027-01');
  await page.selectOption('[data-field="foreign.japaneseLevel"]', '日常会話（N2相当）');
  await page.fill('[data-field="reviewerNotes"]', '電話応対が丁寧。');
  await wait(200);
  await shot('02-step1-filled.png', true);
  await page.locator('#busyCard').scrollIntoViewIfNeeded();
  await shot('13-step1-busy-allnight.png');
  const meterBusy = await page.textContent('#busyCard [data-meter]');
  expect(/繁忙期 [\d.]+\/30/.test(meterBusy), 'E1 繁忙期カードに貢献度のライブ表示: ' + meterBusy);
  fs.writeFileSync(path.join(OUT, 'applicant.json'), await st(() => JSON.stringify(window.RecruitApp.state.applicant)));

  // ---- Step2 ----
  await toHandoff();
  expect(await step() === 2, 'E1 Step1→2 は繁忙期が空欄でも止まらない');
  await shot('03-step2-handoff.png', true);
  const handoff = await st(() => window.RecruitApp.state.handoff.items.map(i => i.severity + ':' + i.id));
  console.log('HANDOFF ITEMS: ' + handoff.join(', '));
  expect(handoff.includes('warn:shift_unanswered'), 'E1 Step2 に shift_unanswered（要確認）');
  expect(handoff.includes('block:late_night_taxi_over') && handoff.includes('block:foreign_permit_missing'), 'E1 Step2 に要判断 late_night_taxi_over / foreign_permit_missing');
  expect(handoff.includes('warn:graduation_midterm'), 'E1 Step2 に graduation_midterm（卒業まで5か月 < 中期6か月）');
  const preview = await page.textContent('#contribPreview');
  expect(preview.includes('未確認') && preview.includes('暫定'), 'E1 貢献度カード（面接前の見込み）に「未確認」「暫定」');
  const sumE1 = await page.textContent('#sumContrib');
  expect(/[\d.]+ \/ 100/.test(sumE1) && sumE1.includes('暫定') && sumE1.includes('未確認'), 'E1 右サマリー #sumContrib に点数・暫定・未確認: ' + sumE1.replace(/\s+/g, ' '));
  expect(!(await page.textContent('#summaryPanel')).includes('高校生') && !(await page.textContent('#summaryPanel')).includes('18歳未満'), 'E1 大学生・21歳には高校生／18歳未満バッジを出さない');
  console.log('STRENGTHS: ' + JSON.stringify(await st(() => window.RecruitApp.state.handoff.strengths.map(s => s.text))));
  // 要判断以外だけチェック（要判断は未確認のまま）
  for (const cb of await page.$$('.handoff-item.sev-info input[data-check]')) await cb.click({ force: true });
  await page.fill('textarea[data-note="handoff"]', '土曜は月2回程度なら可能とのこと。');
  await page.click('[data-action="copy-handoff"]');
  await wait(200);
  const copied = await st(() => window.RecruitApp.state.lastHandoffText);
  expect(copied.includes('■シフト貢献度（面接前の見込み）') && copied.includes('■面接で確認すること'), 'E1 申し送りコピー文に貢献度と確認事項');

  // ---- Step3 ----
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await shot('04-step3-empty.png');
  await judge();
  expect(await step() === 3, 'E1 採点未入力では判定に進まない');
  await scoreAll(4);
  for (const [k, v] of Object.entries({ greeting: 5, eye_contact: 3, appearance: 5, explanation: 3, self_analysis: 3 })) await page.click(`[data-action="score"][data-item="${k}"][data-value="${v}"]`);
  await page.fill('textarea[data-note="interview"]', '笑顔が良く、受け答えも明瞭。');
  await wait(200);
  await shot('05-step3-scored.png', true);
  await judge();
  expect(await step() === 3, 'E1 シフト条件が未確定なら判定に進まない（step 3 のまま）');
  const t1 = await toastText();
  expect(t1.includes('シフト条件を確定'), 'E1 未確定の toast: ' + t1);
  expect((await page.$$('#shiftConfirm .invalid')).length > 0, 'E1 未確認の欄に .invalid');
  const staleCount = Number(await page.textContent('#unresolvedCount'));
  // Step3「シフト条件の最終確認」で例Aの残りを入力
  for (const [id, v] of [['threeday', 'ok'], ['summer', 'ok'], ['obon', 'consult'], ['silver', 'ng'], ['spring', 'consult']]) await pick('vacation.' + id, v);
  for (const [id, d] of [['threeday', '2'], ['summer', '3'], ['obon', '2'], ['spring', '2']]) await page.fill('[data-field="vacationDays.' + id + '"]', d);
  await page.selectOption('[data-field="weekendFreq"]', 'every_one');
  await pick('holidayWork', 'ok');
  await pick('allNight.availability', 'consult');
  await page.selectOption('[data-field="allNight.frequency"]', 'monthly');
  await wait(200);
  const cA = await contribution();
  console.log('CONTRIBUTION A: ' + JSON.stringify({ total: cA.total, band: cA.band, missing: cA.missing, parts: cA.parts.map(p => p.id + '=' + p.score) }));
  expect(cA.total === 65.4 && cA.band === 'high' && cA.missing.length === 0, 'E1 例A 貢献度 65.4（高）・未確認なし');
  expect((await page.textContent('#shiftConfirmStatus')).includes('すべて確認済み'), 'E1 確認カードが「すべて確認済み」');
  const liveCount = Number(await page.textContent('#unresolvedCount'));
  expect((await page.textContent('#shiftConfirm [data-meter="total"]')).startsWith('65.4 / 100'), 'E1 確認カードの合計表示 65.4 / 100');
  await shot('14-step3-shift-confirm.png', true);

  // ---- Step4 ----
  await judge();
  await shot('06-step4-result.png', true);
  let j = await judgment();
  console.log('JUDGMENT: ' + JSON.stringify(j));
  expect(await step() === 4, 'E1 判定に進む');
  expect(j.total === 39 && j.max === 50 && j.pct === 78, 'E1 面接 39/50（78%）');
  expect(j.contribution === 65.4 && j.cellKey === 'high_high' && j.baseResult === 'recommend', 'E1 マトリクス high_high = 採用推奨');
  expect(j.result === 'review' && j.adjustments.includes('unresolved_block'), 'E1 要判断未確認で上長最終判断要（unresolved_block）');
  expect(!(await handoffIds()).includes('shift_unanswered'), 'E1 Step3 で確定後、handoff に shift_unanswered が残らない（stale 再生成）');
  const judgedUnresolved = await st(() => window.RecruitApp.state.judgment.unresolved.length);
  expect(liveCount === judgedUnresolved, 'E1 Step3 上部の未確認件数は入力に追従し、判定時と一致: ' + staleCount + ' → ' + liveCount + '（判定 ' + judgedUnresolved + '）');
  expect(await page.$eval('.result-card [data-axis="interview"]', el => el.textContent.includes('39')) && await page.$eval('.result-card [data-axis="contribution"]', el => el.textContent.includes('65.4')), 'E1 Step4 に両軸の点数');
  expect(await page.$eval('table.matrix td.current', el => el.dataset.cell) === 'high_high', 'E1 Step4 マトリクスの該当セル high_high');
  expect((await page.textContent('.adjust-box')).includes('マトリクス: 採用推奨 → 最終: 上長最終判断要'), 'E1 調整の経緯を表示');
  expect((await page.$$('.bars.contrib .bar-row[data-part]')).length === 8, 'E1 シフト貢献度の内訳 8 項目');
  // Step2 に戻って全チェック → 再判定
  await navStep(2);
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await judge();
  j = await judgment();
  expect(j.result === 'recommend' && j.adjustments.length === 0, 'E1 全チェック後は採用推奨: ' + j.result);
  await shot('06b-step4-recommend.png', true);

  // ---- 保存（E12）----
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const savedPath = path.join(OUT, 'saved.html');
  await download.saveAs(savedPath);
  const savedHtml = fs.readFileSync(savedPath, 'utf8');
  console.log('saved download:', download.suggestedFilename(), savedHtml.length, 'bytes');
  const rec = parseRecord(savedHtml);
  expect(savedHtml.includes('<h2>シフト貢献度</h2>') && /<table class="mx"/.test(savedHtml), 'E12 保存 HTML に「シフト貢献度」セクションと .mx 表');
  expect(rec.schemaVersion === 2 && rec.profile.schemaVersion === 2, 'E12 埋め込み JSON が schemaVersion 2');
  expect(rec.contribution && rec.contribution.total === 65.4, 'E12 埋め込み JSON に contribution（65.4）');
  expect(rec.judgment && rec.judgment.matrix && rec.judgment.matrix.cellKey === 'high_high', 'E12 埋め込み JSON に 2軸判定');
  expect(rec.applicant.vacationDays.gw === '5' && rec.applicant.allNight.frequency === 'monthly', 'E12 埋め込み JSON に新項目');

  // ---- 新規 → 読込 ----
  await page.click('#btnNew');
  await wait(200);
  expect(await st(() => window.RecruitApp.state.applicant.name) === '', '新規で応募者がクリアされる');
  await page.setInputFiles('#fileInput', savedPath);
  await wait(500);
  const loaded = await st(() => { const s = window.RecruitApp.state; const a = s.applicant; return { name: a.name, step: s.step, scores: Object.keys(s.scores).length, note: s.handoffNote, vd: a.vacationDays, vac: a.vacation, holiday: a.holidayWork, wf: a.weekendFreq, an: a.allNight, legacy: s.legacyRecord }; });
  console.log('LOADED: ' + JSON.stringify(loaded));
  expect(loaded.name === '佐藤 花子' && loaded.step === 4 && loaded.scores === 10 && loaded.note === '土曜は月2回程度なら可能とのこと。', '読込で氏名・ステップ・採点・追記が復元');
  expect(loaded.vd.gw === '5' && loaded.vd.threeday === '2' && loaded.vac.silver === 'ng' && loaded.vac.obon === 'consult', '読込で繁忙期の可否・日数が復元');
  expect(loaded.holiday === 'ok' && loaded.wf === 'every_one' && loaded.an.availability === 'consult' && loaded.an.frequency === 'monthly', '読込で祝日・土日頻度・オールナイトが復元');
  expect(loaded.legacy === null && !(await page.$('.legacy-banner')), '新形式のファイルでは旧形式バナーを出さない');
  j = await judgment();
  expect(j.result === 'recommend' && j.contribution === 65.4 && j.cellKey === 'high_high', '読込後の再判定が保存時と同じ（採用推奨・65.4）');
  await shot('07-loaded.png');

  // ---- 設定（既存）----
  await toView('settings');
  await shot('08-settings.png');
  await page.fill('[data-bind="meta.theaterName"]', 'TOHOシネマズ テスト');
  await saveSettings();
  expect(await page.textContent('#brandTheater') === 'TOHOシネマズ テスト', '設定保存で劇場名が反映');
  const sp = await storedProfile();
  expect(!!sp && sp.schemaVersion === 2, 'プロファイルが localStorage に schemaVersion 2 で保存');
  await page.click('[data-action="item-add"]');
  await wait(100);
  expect(await st(() => document.querySelectorAll('.item-row').length) === 11, '評価項目を追加できる（11 件）');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  console.log('profile export:', dl2.suggestedFilename());
  await page.click('[data-action="reset"]');
  await wait(300);
  expect(await page.textContent('#brandTheater') === 'TOHOシネマズ新宿', '初期化で新宿既定に戻る');

  // ---- 使い方・ダークモード・狭い画面 ----
  await toView('help');
  await page.click('#btnTheme');
  await wait(200);
  await shot('09-help-dark.png');
  await toView('judge');
  await shot('10-judge-dark.png');
  await page.setViewportSize({ width: 1000, height: 900 });
  await wait(200);
  await shot('11-narrow.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#btnTheme');

  // =====================================================================
  // E5 例B（面接高 × 貢献低）と、設定でマスの判定を変更
  // =====================================================================
  console.log('\n== E5 例B ==');
  await fresh();
  await fillBasic({ name: '鈴木 一郎', age: 25, category: 'フリーター', shifts: [['mon', '10:00', '16:00'], ['tue', '10:00', '16:00'], ['wed', '10:00', '16:00']], daysMin: 2, daysMax: 3, workPeriod: 'long' });
  await pick('lateNight.availability', 'ng');
  await pick('vacation.threeday', 'consult');
  await page.fill('[data-field="vacationDays.threeday"]', '1');
  for (const id of ['gw', 'summer', 'obon', 'silver', 'yearend', 'spring']) await pick('vacation.' + id, 'ng');
  await pick('holidayWork', 'ng');
  await pick('allNight.availability', 'ng');
  await wait(100);
  expect(!(await visible('#grp-weekend-freq')), 'E5 土日を選んでいなければ土日頻度は非表示');
  await toHandoff();
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await scoreAll(5);
  await judge();
  j = await judgment();
  console.log('JUDGMENT B: ' + JSON.stringify(j));
  expect(j.contribution === 17.6 && j.contribBand === 'low', 'E5 例B 貢献度 17.6（低）');
  expect(j.cellKey === 'high_low' && j.result === 'review' && j.adjustments.length === 0, 'E5 high_low = 上長最終判断要（調整なし）');
  expect(await page.$eval('table.matrix td.current', el => el.dataset.cell + ':' + el.textContent) === 'high_low:▶ 上長', 'E5 Step4 マトリクスの該当セルが 高×低');
  const noteB = await st(() => window.RecruitApp.state.profile.matrix.cellNotes.high_low);
  expect((await page.textContent('.result-note')) === noteB, 'E5 cellNotes.high_low の文言を表示');
  await shot('15-step4-matrix.png', true);
  // 設定でマス「高×低」を不採用推奨に
  await toView('settings');
  await page.selectOption('[data-bind="matrix.cells.high_low"]', 'reject');
  await wait(200);
  await saveSettings();
  expect((await storedProfile()).matrix.cells.high_low === 'reject', 'E5 マスの判定変更が保存される');
  await toView('judge');
  // Step3 を経由せず、判定画面に戻っただけで現在の設定で再判定される（古い判定を表示・保存しない）
  j = await judgment();
  expect(await step() === 4 && !!j && j.cellKey === 'high_low' && j.result === 'reject', 'E5 設定保存後に判定画面へ戻ると再判定（不採用推奨）: ' + (j && j.result));
  expect(!(await page.$eval('table.matrix td.current', el => el.textContent)).includes('上長'), 'E5 マトリクスの強調セルも現在の設定');
  const [dlB] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const recB = parseRecord(fs.readFileSync(await dlB.path(), 'utf8'));
  expect(recB.judgment.result === 'reject' && recB.judgment.matrix.table.high_low === 'reject', 'E5 保存レコードの判定も現在の設定（不採用推奨）');
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await judge();
  j = await judgment();
  expect(j.cellKey === 'high_low' && j.result === 'reject', 'E5 設定変更後の再判定で不採用推奨: ' + j.result);
  // 判定後に Step3 の入力を変えたら判定を無効にし、保存時は現在の内容で再判定する
  await navStep(3);
  await pick('holidayWork', 'ok');
  await wait(100);
  expect(await st(() => window.RecruitApp.state.judgment === null && window.RecruitApp.state.judgmentStale === true), 'E5 判定後に入力を変えると判定を無効化');
  expect(await visible('#sumJudgmentStale'), 'E5 サマリーに「再判定してください」');
  const [dlC] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const recC = parseRecord(fs.readFileSync(await dlC.path(), 'utf8'));
  expect(!!recC.judgment && recC.judgment.contribution.total === recC.contribution.total && recC.contribution.total === 22.6, 'E5 保存時に再判定し、判定と貢献度が一致: ' + (recC.judgment && recC.judgment.contribution.total) + '/' + recC.contribution.total);
  // Step3 の週日数も Step1 と同じ検証で止める
  await page.fill('#shiftConfirm [data-field="daysMin"]', '2');
  await page.fill('#shiftConfirm [data-field="daysMax"]', '2.5');
  await judge();
  expect(await step() === 3 && (await page.$$eval('#shiftConfirm .invalid', els => els.length)) > 0, 'E5 Step3 の週日数 2.5 は判定に進まない');
  await page.fill('#shiftConfirm [data-field="daysMin"]', '6');
  await page.fill('#shiftConfirm [data-field="daysMax"]', '3');
  await wait(100);
  expect(await visible('#daysError'), 'E5 Step3 最低6＞最大3 で #daysError');
  await judge();
  expect(await step() === 3, 'E5 Step3 最低＞最大は判定に進まない');
  await page.fill('#shiftConfirm [data-field="daysMin"]', '2');
  await page.fill('#shiftConfirm [data-field="daysMax"]', '3');
  await judge();
  j = await judgment();
  expect(await step() === 4 && j.result === 'reject', 'E5 週日数を直すと判定できる');

  // =====================================================================
  // E8 設定画面（繁忙期の追加・貢献度の合計・LOCKED・検証エラー）
  // =====================================================================
  console.log('\n== E8 設定画面 ==');
  await toView('settings');
  const nBusy = await page.$$eval('[data-busy-index]', els => els.length);
  await page.click('[data-action="busy-add"]');
  await wait(200);
  await page.fill('[data-bind="options.vacationItems[' + nBusy + '].label"]', '話題作の公開週');
  await saveSettings();
  const newId = await st(n => window.RecruitApp.state.profile.options.vacationItems[n].id, nBusy);
  expect(!!newId && (await storedProfile()).options.vacationItems.length === nBusy + 1, 'E8 繁忙期の期間を追加して保存');
  await toView('judge');
  await navStep(1);
  const busyRows = await page.$$eval('#busyCard .busy-row', els => els.map(e => e.textContent));
  expect(busyRows.length === nBusy + 1 && busyRows[nBusy].includes('話題作の公開週'), 'E8 Step1 の繁忙期に行が増える');
  await navStep(2);
  const su = await handoffItem('shift_unanswered');
  expect(!!su && su.text.includes('話題作の公開週'), 'E8 未回答の追加期間が shift_unanswered に含まれる');
  await navStep(3);
  await judge();
  expect(await step() === 3, 'E8 追加期間が未回答なら判定に進まない');
  await pick('vacation.' + newId, 'ok');
  await page.fill('[data-field="vacationDays.' + newId + '"]', '2');
  await judge();
  expect(await step() === 4, 'E8 追加期間を入力すると判定できる');
  // 貢献度の合計・LOCKED・検証エラー
  await toView('settings');
  const allNightIdx = await st(() => window.RecruitApp.state.profile.contribution.items.findIndex(i => i.id === 'allNight'));
  expect((await page.textContent('#contribSum')).includes('100'), 'E8 シフト貢献度の合計 100');
  await page.click('label.switch:has([data-bind="contribution.items[' + allNightIdx + '].enabled"])');
  await wait(200);
  expect((await page.textContent('#contribSum')).includes('85'), 'E8 オールナイトを OFF にすると合計 85');
  await page.locator('#s-contrib').scrollIntoViewIfNeeded();
  await shot('16-settings-contrib.png');
  expect(await page.$eval('.rule-row[data-rule-id="minor_late_night"] input[type="checkbox"]', el => el.disabled), 'E8 法令（LOCKED）ルールのスイッチは無効');
  await page.fill('[data-bind="contribution.bands.highPct"]', '30');
  await wait(100);
  await saveSettings();
  const t8 = await st(() => { const el = document.getElementById('toast'); return el.className + '|' + el.textContent; });
  expect(/\berror\b/.test(t8) && t8.includes('シフト貢献度の境界'), 'E8 高 ≤ 中 の帯で保存するとエラー toast: ' + t8);
  expect(await visible('#settingsIssues'), 'E8 エラー一覧を表示');
  const spE8 = await storedProfile();
  expect(spE8.contribution.bands.highPct === 60 && spE8.contribution.items[allNightIdx].enabled !== false, 'E8 エラー時は保存されない');
  await page.click('#view-settings [data-action="discard"]');
  await wait(200);

  // =====================================================================
  // E11 features.contribution=false で従来の面接のみ判定
  // =====================================================================
  console.log('\n== E11 2軸 OFF ==');
  await page.click('label:has([data-bind="features.contribution"])');
  await wait(200);
  await saveSettings();
  expect((await storedProfile()).features.contribution === false, 'E11 2軸判定 OFF を保存');
  await toView('judge');
  await navStep(3);
  expect(!(await page.$('#shiftConfirm [data-meter="total"]')), 'E11 Step3 に貢献度の点数を出さない');
  await judge();
  j = await judgment();
  expect(j.mode === 'interviewOnly' && j.result === 'recommend', 'E11 面接のみで判定（採用推奨）: ' + j.mode + '/' + j.result);
  expect((await page.$$('.result-card .metrics .metric')).length === 4 && !(await page.$('.result-card table.matrix')), 'E11 Step4 は従来の 4 metrics・マトリクスなし');

  // =====================================================================
  // E2 高校2年・16歳（原則対象外）
  // =====================================================================
  console.log('\n== E2 高校2年 ==');
  await fresh();
  const hsOpt = await page.$eval('[data-field="category"] option[value="高校2年生"]', el => el.textContent);
  expect(hsOpt.includes('原則対象外'), 'E2 区分の選択肢に「原則対象外」: ' + hsOpt);
  expect((await page.$eval('[data-field="category"] option[value="高校3年生"]', el => el.textContent)).includes('条件付き'), 'E2 高校3年生は「条件付き」');
  await fillBasic({ name: '高橋 二葉', age: 16, category: '高校2年生', shifts: [['thu', '17:00', '22:00'], ['fri', '17:00', '22:00'], ['sat', '08:00', '17:00'], ['sun', '08:00', '17:00']], daysMin: 3, daysMax: 4, workPeriod: 'long' });
  expect(await visible('#hsPolicyAlert') && await page.$eval('#hsPolicyAlert', el => el.classList.contains('danger')), 'E2 #hsPolicyAlert（赤）を表示');
  expect((await page.textContent('#hsPolicyAlert')).includes('原則対象外'), 'E2 アラートに「原則対象外」');
  expect(!(await visible('#grp-hs-exception')), 'E2 例外条件の欄は非表示');
  expect(await visible('#minorNotice'), 'E2 18歳未満の注意を表示');
  const sumE2 = await page.textContent('#summaryPanel');
  expect(sumE2.includes('高校生 原則対象外') && sumE2.includes('18歳未満'), 'E2 右サマリーに「高校生 原則対象外」「18歳未満」バッジ');
  await busyAllFull();
  await page.selectOption('[data-field="weekendFreq"]', 'every_both');
  await pick('holidayWork', 'ok');
  await wait(100);
  await page.locator('#hsPolicyAlert').scrollIntoViewIfNeeded();
  await shot('12-step1-highschool.png');
  await toHandoff();
  expect(await step() === 2, 'E2 原則対象外でも Step2 に進める（止めない）');
  const idsE2 = await handoffIds();
  const hsItem = await handoffItem('hs_out_of_policy');
  expect(!!hsItem && hsItem.severity === 'block', 'E2 hs_out_of_policy（要判断）');
  expect(!idsE2.includes('highschool_permission') && !idsE2.some(i => i.indexOf('hs_exception_') === 0), 'E2 highschool_permission・hs_exception_* は出ない');
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await scoreAll(5);
  await judge();
  j = await judgment();
  console.log('JUDGMENT E2: ' + JSON.stringify(j));
  expect(j.cellKey === 'high_high' && j.result === 'review' && j.adjustments.includes('highschool_hold'), 'E2 全5点・全チェックでも上長最終判断要（highschool_hold）');
  // Step2 で設定（高校生の扱い）を変えて戻ると、留意点の一覧が作り直される
  await navStep(2);
  await toView('settings');
  await page.selectOption('[data-bind="highschoolPolicy.mode"]', 'allow');
  await wait(100);
  await saveSettings();
  await toView('judge');
  const domIdsE2 = await page.$$eval('[data-item-id]', els => els.map(e => e.dataset.itemId));
  expect(await step() === 2 && !domIdsE2.includes('hs_out_of_policy') && domIdsE2.includes('highschool_permission'), 'E2 設定変更後に判定画面へ戻ると Step2 の留意点を作り直す: ' + domIdsE2.join(','));
  expect(await st(() => window.RecruitApp.state.handoffStale === false), 'E2 handoffStale が解消');

  // =====================================================================
  // E3 高校3年・17歳・例外条件充足・オールナイト○
  // =====================================================================
  console.log('\n== E3 高校3年（例外充足） ==');
  await fresh();
  await fillBasic({ name: '田中 三咲', age: 17, category: '高校3年生', graduationDate: '2027-03', shifts: [['sat', '10:00', '18:00'], ['sun', '10:00', '18:00']], daysMin: 2, daysMax: 2, workPeriod: 'long' });
  expect(await visible('#grp-hs-exception') && !(await visible('#hsPolicyAlert')), 'E3 高3は例外条件の欄を表示（原則対象外アラートなし）');
  expect(await page.$eval('#hsExceptionStatus', el => el.classList.contains('warn')), 'E3 未入力のときは「未入力あり」');
  await pick('highschool.careerDecided', 'yes');
  await page.selectOption('[data-field="highschool.careerPath"]', 'university');
  await page.fill('[data-field="highschool.destination"]', '〇〇大学 文学部');
  await pick('continueAfterGraduation', 'yes');
  await pick('allNight.availability', 'ok');
  await wait(100);
  expect(await page.$eval('#hsExceptionStatus', el => el.classList.contains('ok') && el.textContent.includes('例外対象')), 'E3 #hsExceptionStatus が 例外対象（ok）');
  expect(await visible('#allNightLegal'), 'E3 #allNightLegal を表示');
  expect(!(await visible('#grp-allnight-freq')), 'E3 年少者はオールナイトの頻度欄を出さない');
  await page.locator('#grp-hs-exception').scrollIntoViewIfNeeded();
  await shot('12b-step1-hs-exception.png');
  await toHandoff();
  const idsE3 = await handoffIds();
  expect(idsE3.includes('hs_exception_ok') && idsE3.includes('allnight_minor'), 'E3 Step2 に hs_exception_ok と allnight_minor');
  expect((await handoffItem('allnight_minor')).severity === 'block', 'E3 allnight_minor は要判断');
  await page.click('[data-action="copy-handoff"]');
  await wait(200);
  const copiedE3 = await st(() => window.RecruitApp.state.lastHandoffText);
  expect(copiedE3.includes('[法令]') && copiedE3.includes('[高校生]') && /高校生の例外：.*例外対象/.test(copiedE3), 'E3 申し送りコピー文に [法令]・[高校生] と「高校生の例外」行');
  const sumE3 = await page.textContent('#summaryPanel');
  expect(sumE3.includes('高3 例外対象') && sumE3.includes('18歳未満'), 'E3 右サマリーに「高3 例外対象」「18歳未満」バッジ');
  const anPart = (await contribution()).parts.find(p => p.id === 'allNight');
  expect(anPart.score === 0 && anPart.flags.includes('restricted'), 'E3 貢献度のオールナイトは 0 点・restricted');

  // 卒業予定年月を OFF にしても「卒業後も当劇場で継続」を入力でき、例外条件を満たせる
  await fresh();
  await page.evaluate(() => { const p = window.RecruitStorage.defaults(); p.features.graduationDate = false; window.RecruitStorage.saveProfile(p); });
  await page.reload();
  await wait(300);
  await fillBasic({ name: '田中 三咲', age: 17, category: '高校3年生', shifts: [['sat', '10:00', '18:00']], daysMin: 1, daysMax: 1, workPeriod: 'long' });
  await pick('highschool.careerDecided', 'yes');
  await page.selectOption('[data-field="highschool.careerPath"]', 'university');
  expect(!(await page.$('[data-field="graduationDate"]')) && await visible('#grp-continue'), 'E3 卒業予定年月 OFF でも「卒業後も当劇場で継続」を表示');
  await pick('continueAfterGraduation', 'yes');
  await wait(100);
  expect(await page.$eval('#hsExceptionStatus', el => el.classList.contains('ok')), 'E3 卒業予定年月 OFF でも例外条件を満たせる');

  // =====================================================================
  // E4 高校3年・18歳・進路未決定・深夜帯○
  // =====================================================================
  console.log('\n== E4 高校3年（18歳・未決定） ==');
  await fresh();
  await fillBasic({ name: '伊藤 四郎', age: 18, category: '高校3年生', shifts: [['sat', '17:00', '21:00']], daysMin: 1, daysMax: 1, workPeriod: 'long' });
  await pick('highschool.careerDecided', 'no');
  await pick('lateNight.availability', 'ok');
  await wait(100);
  expect(await page.$eval('#hsExceptionStatus', el => el.classList.contains('danger')), 'E4 例外条件 未充足（赤）');
  expect(!(await visible('#minorNotice')) && await visible('#lateNightLegal'), 'E4 18歳は年少者の注意なし・高校在学中の深夜帯注意あり');
  await toHandoff();
  const idsE4 = await handoffIds();
  const unmet = await handoffItem('hs_exception_unmet');
  expect(!!unmet && unmet.text.includes('進路が未決定'), 'E4 hs_exception_unmet に「進路が未決定」');
  expect(idsE4.includes('hs_night_policy') && !idsE4.includes('minor_late_night'), 'E4 hs_night_policy あり・minor_late_night なし');

  // =====================================================================
  // E6 終電と最遅終了時刻の突合
  // =====================================================================
  console.log('\n== E6 終電 ==');
  await fresh();
  await fillBasic({ name: '渡辺 六花', age: 20, category: '大学2年生', shifts: [['mon', '17:00', '23:50']], daysMin: 1, daysMax: 1, workPeriod: 'long' });
  await pick('lateNight.availability', 'ok');
  await page.selectOption('[data-field="lateNight.returnMethod"]', 'train');
  await page.fill('[data-field="lateNight.lastTrain"]', '00:00');
  await wait(100);
  expect(await visible('#lastTrainWarn'), 'E6 終電 0:00 で #lastTrainWarn を表示');
  await toHandoff();
  expect((await handoffIds()).includes('late_night_last_train_early'), 'E6 Step2 に late_night_last_train_early');
  await page.click('[data-action="to-step"][data-step="1"]');
  await wait(300);
  await page.fill('[data-field="lateNight.lastTrain"]', '00:05');
  await wait(100);
  expect(!(await visible('#lastTrainWarn')), 'E6 終電 0:05 で警告が消える');
  await toHandoff();
  expect(!(await handoffIds()).includes('late_night_last_train_early'), 'E6 終電 0:05 で留意点が消える');
  // クローズ勤務の標準終了時刻（P1）を 0:30 にすると、深夜帯○の人は 0:30 まで働く前提で突合する
  await toView('settings');
  await page.fill('[data-bind="params.closeShiftStandardEnd"]', '00:30');
  await page.dispatchEvent('[data-bind="params.closeShiftStandardEnd"]', 'change');
  await wait(100);
  await saveSettings();
  expect((await storedProfile()).params.closeShiftStandardEnd === '00:30', 'E6 クローズ標準終了 0:30 を保存');
  await toView('judge');
  expect((await handoffIds()).includes('late_night_last_train_early'), 'E6 クローズ標準終了 0:30 で終電 0:05 に余裕なし（留意点）');
  await navStep(1);
  expect(await visible('#lastTrainWarn') && (await page.textContent('#lastTrainWarnText')).includes('翌0:30'), 'E6 Step1 の警告もクローズ標準終了（翌0:30）で比較');

  // =====================================================================
  // E10 入力の整合・ボタン
  // =====================================================================
  console.log('\n== E10 入力の整合 ==');
  await fresh();
  await fillBasic({ name: '山本 十和', age: 17, category: '大学1年生', shifts: [['mon', '10:00', '15:00'], ['tue', '10:00', '15:00']], daysMax: 4, workPeriod: 'long' });
  expect(await visible('#daysWarn'), 'E10 曜日2つ＋最大4日で #daysWarn');
  expect(await visible('#ageCategoryWarn'), 'E10 17歳＋大学1年で #ageCategoryWarn');
  await page.fill('[data-field="daysMin"]', '5');
  await page.fill('[data-field="daysMax"]', '3');
  await wait(100);
  await toHandoff();
  expect(await step() === 1 && await visible('#daysError'), 'E10 最低5／最大3 は Step1 に留まり #daysError');
  await page.fill('[data-field="daysMin"]', '2');
  await page.fill('[data-field="daysMax"]', '2');
  await page.click('[data-action="busy-all-ok"]');
  await wait(200);
  const allOk = await st(() => { const s = window.RecruitApp.state; return window.RecruitRules.busyItems(s.profile).every(v => s.applicant.vacation[v.id] === 'ok'); });
  const daysShown = await st(() => window.RecruitRules.busyItems(window.RecruitApp.state.profile).every(v => { const el = document.getElementById('grp-vdays-' + v.id); return el && !el.classList.contains('hidden'); }));
  expect(allOk && daysShown, 'E10 「すべて ○ にする」で全期間 ○・日数欄を表示');
  await page.click('[data-action="busy-clear"]');
  await wait(200);
  expect(await st(() => Object.values(window.RecruitApp.state.applicant.vacation).every(v => v === '')), 'E10 「未確認に戻す」で全期間が空');

  // =====================================================================
  // E9 旧プロファイルの移行
  // =====================================================================
  console.log('\n== E9 プロファイル移行 ==');
  await fresh();
  const v1Shinjuku = fs.readFileSync(path.join(FIX, 'v1-profile-shinjuku.json'), 'utf8');
  await page.evaluate(t => localStorage.setItem('recruit.profile.v1', t), v1Shinjuku);
  await page.reload();
  await wait(300);
  expect((await toastText()).includes('新しい形式に更新'), 'E9 旧プロファイルの移行 toast');
  const migrated = await st(() => { const p = window.RecruitApp.state.profile; return { v: p.schemaVersion, mode: p.highschoolPolicy.mode, n: p.options.vacationItems.length }; });
  expect(migrated.v === 2 && migrated.mode === 'exceptionOnly' && migrated.n === 7, 'E9 新宿の旧プロファイルは新宿既定で移行: ' + JSON.stringify(migrated));
  await toView('settings');
  const ruleHeads = await page.$$eval('#s-rules h3.sub', els => els.map(e => e.textContent));
  expect(ruleHeads.includes('繁忙期・休日') && ruleHeads.includes('オールナイト') && ruleHeads.includes('法令'), 'E9 設定画面に「法令」「繁忙期・休日」「オールナイト」カテゴリ');
  await page.setInputFiles('#profileFileInput', path.join(FIX, 'v1-profile-other.json'));
  await wait(400);
  const other = await st(() => { const p = window.RecruitApp.state.profile; return { name: p.meta.theaterName, mode: p.highschoolPolicy.mode, contrib: p.features.contribution, allNight: p.features.allNight }; });
  expect(other.mode === 'allow' && other.contrib === false && other.allNight === false, 'E9 他劇場の旧プロファイルは従来動作（高校生 allow・2軸 OFF）: ' + JSON.stringify(other));

  // =====================================================================
  // E7 旧形式（v1）の保存ファイル
  // =====================================================================
  console.log('\n== E7 旧形式ファイル ==');
  await fresh();
  const errsBefore = errors.length;
  const before = await st(() => Date.now());
  await page.setInputFiles('#fileInput', path.join(FIX, 'v1-record.html'));
  await wait(500);
  expect(errors.length === errsBefore, 'E7 読み込みでエラーなし');
  expect(await visible('.legacy-banner') && (await page.textContent('.legacy-banner')).includes('採用推奨'), 'E7 旧形式バナー（保存時の判定「採用推奨」を含む）');
  const gen = await st(() => window.RecruitApp.state.handoff.generatedAt);
  expect(new Date(gen).getTime() >= before, 'E7 handoff を読込時に再生成');
  j = await judgment();
  expect(j.mode === 'incomplete' && j.result !== 'recommend', 'E7 シフト条件未確定で mode=incomplete・採用推奨にしない: ' + j.result);
  expect((await toastText()).includes('異なります'), 'E7 保存時と再判定の差分 toast');
  await shot('17-legacy-banner.png');

  // =====================================================================
  // E13 高校3年・17歳・例外条件を Step1 では未入力 → 面接で確認して Step3 で入力
  // =====================================================================
  console.log('\n== E13 高校3年（例外条件を Step3 で入力） ==');
  await fresh();
  await fillBasic({ name: '小林 三奈', age: 17, category: '高校3年生', graduationDate: '2027-03', shifts: [['fri', '17:00', '22:00'], ['sat', '08:00', '22:00'], ['sun', '08:00', '22:00']], daysMin: 3, daysMax: 3, workPeriod: 'long' });
  await busyAllFull();
  await page.selectOption('[data-field="weekendFreq"]', 'every_both');
  await pick('holidayWork', 'ok');
  await wait(100);
  await toHandoff();
  expect(await step() === 2 && (await handoffIds()).includes('hs_exception_unmet'), 'E13 例外条件が未入力でも Step2 に進み hs_exception_unmet（要判断）');
  await page.click('[data-action="copy-handoff"]');
  await wait(200);
  const copiedE13 = await st(() => window.RecruitApp.state.lastHandoffText);
  expect(copiedE13.includes('[高校生]') && copiedE13.includes('高校生の例外：'), 'E13 申し送りコピー文に [高校生] と「高校生の例外」行');
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  expect(!!(await page.$('#shiftConfirm [data-field="highschool.careerDecided"]')) && !!(await page.$('#shiftConfirm [data-field="continueAfterGraduation"]')), 'E13 Step3 の確認カードに高3例外の入力欄');
  const stE13 = await page.textContent('#shiftConfirmStatus');
  expect(stE13.includes('高3例外') && stE13.includes('進路決定の有無') && stE13.includes('未入力'), 'E13 #shiftConfirmStatus に「高3例外: …が未入力」: ' + stE13);
  expect((await page.textContent('#unresolvedAlert')).trim() === '', 'E13 全チェック済みなら上部の未確認アラートなし');
  await scoreAll(5);
  await judge();
  j = await judgment();
  expect(await step() === 4 && j.result === 'review' && j.adjustments.includes('highschool_hold'), 'E13 未入力のまま判定すると上長最終判断要（止めない・highschool_hold）: ' + j.result);
  expect((await page.textContent('.adjust-box')).includes('例外条件（進路決定の有無・卒業後の継続意思）が未入力'), 'E13 調整理由が「未入力」を示す');
  await navStep(3);
  await pick('highschool.careerDecided', 'yes');
  await wait(100);
  await page.selectOption('#shiftConfirm [data-field="highschool.careerPath"]', 'university');
  await page.fill('#shiftConfirm [data-field="highschool.destination"]', '〇〇大学 経済学部（指定校推薦で合格）');
  await pick('continueAfterGraduation', 'yes');
  await wait(150);
  expect(await page.$eval('#hsExceptionStatus', el => el.classList.contains('ok')), 'E13 Step3 で入力すると例外対象（ok）');
  expect(!(await page.textContent('#shiftConfirmStatus')).includes('高3例外'), 'E13 入力後は #shiftConfirmStatus から高3例外の未入力が消える');
  const cntE13 = await page.$eval('#unresolvedCount', el => el.textContent).catch(() => '');
  expect(cntE13 === '1', 'E13 Step3 で条件を変えると上部の未確認件数が更新される（hs_exception_ok の 1 件）: ' + cntE13);
  await navStep(2);
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await judge();
  j = await judgment();
  expect(j.result === 'recommend' && j.cellKey === 'high_high' && j.adjustments.length === 0, 'E13 例外条件を満たし全チェックで採用推奨: ' + j.result + '/' + j.adjustments.join(','));
  const [dlE13] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const savedE13 = path.join(OUT, 'saved-hs.html');
  await dlE13.saveAs(savedE13);
  const htmlE13 = fs.readFileSync(savedE13, 'utf8');
  const recE13 = parseRecord(htmlE13);
  expect(recE13.applicant.highschool.careerDecided === 'yes' && recE13.applicant.highschool.careerPath === 'university' && recE13.applicant.continueAfterGraduation === 'yes', 'E13 保存 JSON に高3例外の入力');
  expect(htmlE13.includes('高校生の採用方針') && htmlE13.includes('<h3>繁忙期（3連休・長期休暇）</h3>') && htmlE13.includes('<h3>祝日・土日・オールナイト</h3>'), 'E13 保存レポートに高校生の採用方針・繁忙期表・祝日/土日/オールナイト表');
  expect(!htmlE13.includes('記録のみ'), 'E13 既定（重み>0）の繁忙期に「記録のみ」は付かない');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', savedE13);
  await wait(500);
  const loadedE13 = await st(() => { const a = window.RecruitApp.state.applicant; return { hs: a.highschool, cont: a.continueAfterGraduation }; });
  expect(loadedE13.hs.careerDecided === 'yes' && loadedE13.hs.careerPath === 'university' && loadedE13.hs.destination.includes('〇〇大学') && loadedE13.cont === 'yes', 'E13 読込で highschool.*・continueAfterGraduation が復元');
  j = await judgment();
  expect(j.result === recE13.judgment.result && j.result === 'recommend' && j.contribution === recE13.contribution.total, 'E13 読込後の再判定が保存時と一致');

  // =====================================================================
  // E14 showBeforeInterview=OFF（面接前は貢献度の点数を出さない）
  // =====================================================================
  console.log('\n== E14 面接前は点数を出さない ==');
  await fresh();
  await toView('settings');
  await page.click('label:has([data-bind="contribution.showBeforeInterview"])');
  await wait(200);
  await saveSettings();
  expect((await storedProfile()).contribution.showBeforeInterview === false, 'E14 showBeforeInterview=OFF を保存');
  await toView('judge');
  await fillBasic({ name: '中村 五月', age: 22, category: '大学4年生', graduationDate: '2028-03', shifts: [['sat', '08:00', '17:00'], ['sun', '08:00', '17:00']], daysMin: 2, daysMax: 2, workPeriod: 'long' });
  await pick('vacation.gw', 'ok');
  await page.fill('[data-field="vacationDays.gw"]', '5');
  await wait(100);
  const pts = /[\d.]+ ?\/ ?(100|30|15|10|5)\b/;
  expect(!(await page.$('#busyCard [data-meter]')) && !(await page.$('#allNightCard [data-meter]')), 'E14 Step1 のカード見出しに点数を出さない');
  let sumE14 = await page.textContent('#sumContrib');
  expect(!pts.test(sumE14) && !(await page.$('#sumContrib .contrib-gauge')) && sumE14.includes('未確認'), 'E14 Step1 の右サマリーは点数・ゲージなし（未確認のみ）: ' + sumE14.replace(/\s+/g, ' '));
  await toHandoff();
  const prevE14 = await page.textContent('#contribPreview');
  expect(!pts.test(prevE14) && !(await page.$('#contribPreview .bars')) && prevE14.includes('面接で確認すること'), 'E14 Step2 の貢献度カードに点数・内訳バーなし');
  sumE14 = await page.textContent('#sumContrib');
  expect(!pts.test(sumE14) && !(await page.$('#sumContrib .contrib-gauge')), 'E14 Step2 の右サマリーに点数なし');
  await page.click('[data-action="copy-handoff"]');
  await wait(200);
  const copiedE14 = await st(() => window.RecruitApp.state.lastHandoffText);
  expect(!copiedE14.includes('■シフト貢献度') && copiedE14.includes('■面接で確認すること'), 'E14 申し送りコピー文に点数を出さない（確認事項は出す）');
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  sumE14 = await page.textContent('#sumContrib');
  expect(/[\d.]+ \/ 100/.test(sumE14) && !!(await page.$('#sumContrib .contrib-gauge')), 'E14 Step3 からは右サマリーに点数を表示: ' + sumE14.replace(/\s+/g, ' '));

  expect(errors.length === 0, 'ERRORS: ' + (errors.length ? JSON.stringify(errors) : 'none'));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  console.log('\n' + (fails.length ? fails.length + ' FAILED:\n - ' + fails.join('\n - ') : 'ALL PASSED'));
  if (fails.length) process.exit(1);
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
