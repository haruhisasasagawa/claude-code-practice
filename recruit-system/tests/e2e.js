/*
 * 配布ファイル（dist/toho-recruit-judge.html）のブラウザ通しテスト。
 *   node build.js && node tests/e2e.js
 * Playwright と Chromium が必要（npx playwright install chromium）。
 * スクリーンショットは tests/shots/ に出力（git 管理外）。
 * 失敗した確認（FAIL）が 1 つでもあれば exit 1。
 *
 * シナリオ（docs/SPEC.md 9-2、入力の段階分けは docs/SPEC-stages.md 7-2）
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
 *   E15 Step1 は面接前の項目だけ → Step2「面接で確認すること」→ Step3 で面接時の項目を入力して判定
 *   E16 折りたたみ（#preFill）で面接時の項目を先行入力・区分の変更で「卒業後の継続」の置き場所が移る
 *   E17 設定で段階を切り替える（Step1 に出る／外国籍の制約／一括ボタン／不正値の normalize）
 *   E18 外国籍は「該当する／しない」だけ面接前（詳細は Step3・未入力の留意点は #deferredItems）
 *   E19 保存 → 読込（応募時の情報／面接で確認した情報・inputStages のスナップショット・段階情報の無い旧 v2 レコード）
 *   E20 面接で確認する項目の表示（外国籍「該当しない」・#preFill の summary・strict の #deferredItems・他劇場の旧プロファイル）
 *   E21 Step3 で入力した内容から出た留意点（GW× → vacation_ng 等）を Step3 でチェックし、Step2 に戻らずに 2軸判定
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
  // 閉じた <details> の中身は Chromium では offsetParent・getClientRects が残るため checkVisibility() でも確かめる
  const visible = (sel) => page.evaluate(s => { const el = document.querySelector(s); return !!el && !el.closest('.hidden') && el.offsetParent !== null && (!el.checkVisibility || el.checkVisibility()); }, sel);
  // radio・checkbox は見た目上 label が表示を担うので label で判定する
  const shown = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el || el.closest('.hidden')) return false; const t = el.closest('label') || el; return t.getClientRects().length > 0 && (!t.checkVisibility || t.checkVisibility()); }, sel);
  const inPreFill = (sel) => page.evaluate(s => { const el = document.querySelector(s); return !!el && !!el.closest('#preFill'); }, sel);
  const preFillOpen = () => page.evaluate(() => { const d = document.getElementById('preFill'); return d ? d.open : null; });
  // 「面接前に分かっている項目があれば入力（任意）」を開く（閉じた <details> の中の欄は fill / click できない）
  const openPreFill = async () => { const d = await page.$('#preFill'); if (d && !(await d.evaluate(el => el.open))) { await page.click('#preFill > summary'); await wait(150); } };
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
    // 既定では折りたたみを開き、以降のシナリオが Step1 で繁忙期・深夜帯・オールナイトに入力できるようにする
    if (o.preFill !== false) await openPreFill();
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
    // Step2 の一覧に出ない項目（面接時の未入力が原因の deferred・「面接で確認すること」に集約した aggregate）は対象外
    const ok = await st(() => window.RecruitApp.state.handoff.items.filter(i => !i.deferred && !i.aggregate).every(i => window.RecruitApp.state.handoffChecks[i.id]));
    if (!ok) throw new Error('checkAll: 留意点のチェックが入りきっていません');
  };
  const toHandoff = async () => { await page.click('[data-action="generate-handoff"]'); await wait(400); };
  const judge = async () => { await page.click('[data-action="judge"]'); await wait(400); };
  const saveSettings = async () => { await page.click('#view-settings [data-action="save"]'); await wait(300); };
  const storedProfile = () => st(() => JSON.parse(localStorage.getItem('recruit.profile.v1') || 'null'));
  // Step3「未入力のまま判定する場合の留意点」をすべてチェック
  const checkDeferred = async () => { for (const cb of await page.$$('#deferredItems input[data-check]')) if (!(await cb.isChecked())) await cb.check({ force: true }); await wait(100); };
  // 設定画面で入力セクションの段階を切り替えて保存し、判定画面に戻る
  const setStage = async (id, stage) => { await toView('settings'); await page.selectOption('[data-bind="inputStages.' + id + '"]', stage); await wait(150); await saveSettings(); await toView('judge'); };
  const copyHandoff = async () => { await page.click('[data-action="copy-handoff"]'); await wait(200); return st(() => window.RecruitApp.state.lastHandoffText); };
  const saveRecord = async (name) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    const file = path.join(OUT, name);
    await dl.saveAs(file);
    const html = fs.readFileSync(file, 'utf8');
    return { file, html, rec: parseRecord(html) };
  };
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
  // 繁忙期・かけもち・深夜帯などは面接時の項目（SPEC-stages）。Step1 では閉じた折りたたみの中にある
  expect(!(await visible('#busyCard')) && await preFillOpen() === false && await inPreFill('#busyCard'), 'E1 繁忙期カードは閉じた #preFill の中（Step1 には出ない）');
  await openPreFill();
  expect(await visible('#busyCard'), 'E1 折りたたみを開くと繁忙期カードを表示');
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
  expect(!(await inPreFill('[data-field="foreign.isForeign"]')) && await inPreFill('[data-field="foreign.workPermit"]'), 'E1 外国籍の該当は基本情報、詳細は折りたたみ');
  await page.selectOption('[data-field="foreign.residenceStatus"]', '留学');
  await page.selectOption('[data-field="foreign.workPermit"]', 'unknown');
  await page.fill('[data-field="foreign.residenceExpiry"]', '2027-01');
  await page.selectOption('[data-field="foreign.japaneseLevel"]', '日常会話（N2相当）');
  await page.fill('#notesCard [data-field="reviewerNotes"]', '電話応対が丁寧。');
  await wait(200);
  await shot('02-step1-filled.png', true);
  await page.locator('#busyCard').scrollIntoViewIfNeeded();
  await shot('13-step1-busy-allnight.png');
  // 折りたたみの中には貢献度メーターを出さない（繁忙期カードのライブ表示の確認は E17 で段階を pre にして行う）
  expect(!(await page.$('#busyCard [data-meter]')), 'E1 折りたたみ内の繁忙期カードに点数メーターを出さない');
  fs.writeFileSync(path.join(OUT, 'applicant.json'), await st(() => JSON.stringify(window.RecruitApp.state.applicant)));

  // ---- Step2 ----
  await toHandoff();
  expect(await step() === 2, 'E1 Step1→2 は繁忙期が空欄でも止まらない');
  await shot('03-step2-handoff.png', true);
  const handoff = await st(() => window.RecruitApp.state.handoff.items.map(i => i.severity + ':' + i.id));
  console.log('HANDOFF ITEMS: ' + handoff.join(', '));
  expect(handoff.includes('warn:shift_unanswered'), 'E1 Step2 に shift_unanswered（要確認）');
  expect(!(await page.$('.handoff-item[data-item-id="shift_unanswered"]')), 'E1 shift_unanswered は留意点の一覧に出さない（「面接で確認すること」に集約）');
  expect((await page.textContent('#handoffComment')).includes('電話応対が丁寧。'), 'E1 Step2 の冒頭に申し送りコメント');
  const todoE1 = await page.textContent('#interviewTodo');
  expect(todoE1.includes('繁忙期・土日祝') && todoE1.includes('オールナイト上映'), 'E1 「面接で確認すること」に繁忙期・土日祝／オールナイト上映');
  expect(handoff.includes('block:late_night_taxi_over') && handoff.includes('block:foreign_permit_missing'), 'E1 Step2 に要判断 late_night_taxi_over / foreign_permit_missing');
  expect(handoff.includes('warn:graduation_midterm'), 'E1 Step2 に graduation_midterm（卒業まで5か月 < 中期6か月）');
  // 面接時に聞くセクション（繁忙期など）に未回答があるうちは、0 点で数えた見込みの点数・帯を出さない（SPEC-stages D17）
  const preview = await page.textContent('#contribPreview');
  expect(preview.includes('面接後に確定') && !/[\d.]+ \/ 100/.test(preview) && !preview.includes('暫定'), 'E1 貢献度カード（面接前の見込み）は「面接後に確定」で点数・帯を出さない: ' + preview.replace(/\s+/g, ' '));
  const sumE1 = await page.textContent('#sumContrib');
  expect(sumE1.includes('面接後に確定') && sumE1.includes('面接で確認') && !/[\d.]+ \/ 100/.test(sumE1), 'E1 右サマリー #sumContrib は「面接後に確定」・未回答は「面接で確認」: ' + sumE1.replace(/\s+/g, ' '));
  // 右サマリーの件数は Step2 の一覧と同じ数え方。面接で確認する項目の未入力による要判断は内訳で示す
  const sumCntE1 = await st(() => { const h = window.RecruitApp.state.handoff; const shown = h.items.filter(i => !i.deferred && !i.aggregate); return { block: Number(document.querySelector('.sum-count.block b').textContent), shownBlock: shown.filter(i => i.severity === 'block').length, later: (document.getElementById('sumLater') || {}).textContent || '' }; });
  expect(sumCntE1.block === sumCntE1.shownBlock && sumCntE1.later.includes('面接で確認する項目の未入力'), 'E1 右サマリーの要判断は Step2 の一覧と一致し、面接で確認する分は内訳に: ' + JSON.stringify(sumCntE1));
  expect(await page.evaluate(() => { const b = document.querySelector('#handoffComment .btn'); return !!b && b.classList.contains('no-print'); }), 'E1 申し送りコメントの「編集」は印刷しない（no-print）');
  expect(!(await page.textContent('#summaryPanel')).includes('高校生') && !(await page.textContent('#summaryPanel')).includes('18歳未満'), 'E1 大学生・21歳には高校生／18歳未満バッジを出さない');
  console.log('STRENGTHS: ' + JSON.stringify(await st(() => window.RecruitApp.state.handoff.strengths.map(s => s.text))));
  // 要判断以外だけチェック（要判断は未確認のまま）
  for (const cb of await page.$$('.handoff-item.sev-info input[data-check]')) await cb.click({ force: true });
  // 追記（申し送りコメントの補足）は空なら閉じた折りたたみ。開いて記入する
  expect(await page.$eval('#handoffNoteCard', el => el.tagName === 'DETAILS' && !el.open && el.textContent.includes('追記（申し送りコメントの補足・任意）')), 'E1 追記は空のとき閉じた折りたたみ「追記（申し送りコメントの補足・任意）」');
  await page.click('#handoffNoteCard > summary');
  await wait(100);
  await page.fill('textarea[data-note="handoff"]', '土曜は月2回程度なら可能とのこと。');
  await page.click('[data-action="copy-handoff"]');
  await wait(200);
  const copied = await st(() => window.RecruitApp.state.lastHandoffText);
  expect(!copied.includes('■シフト貢献度') && copied.includes('■面接で確認すること'), 'E1 申し送りコピー文は面接時の未回答があるうちは貢献度の点数を出さず、確認事項は出す');
  const posE1 = (k) => copied.indexOf(k);
  expect(posE1('■申し送りコメント') >= 0 && posE1('■申し送りコメント') < posE1('■面接で確認すること') && posE1('■面接で確認すること') < posE1('■要判断'), 'E1 コピー文の並び: 申し送りコメント → 面接で確認すること → 要判断');
  expect(!copied.includes('■担当者所見'), 'E1 コピー文に「■担当者所見」を出さない（申し送りコメントと重複させない）');

  // ---- Step3 ----
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await shot('04-step3-empty.png');
  expect((await page.textContent('#shiftConfirm h2')).includes('面接で確認する項目'), 'E1 Step3 のカード見出し「面接で確認する項目」');
  expect(await page.inputValue('#shiftConfirm [data-field="vacationDays.gw"]') === '5', 'E1 Step1 で先に入力した値（GW 5日）を Step3 に表示');
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
  // 卒業後の継続（記録用）が空のうちは「すべて確認済み」にしない
  const stE1 = await page.textContent('#shiftConfirmStatus');
  expect(!stE1.includes('すべて確認済み') && stE1.includes('まだ入力のない項目') && stE1.includes('卒業後の継続'), 'E1 卒業後の継続が空なら「まだ入力のない項目」: ' + stE1);
  await pick('continueAfterGraduation', 'undecided');
  await wait(150);
  // 外国籍・かけもちありで「かけもち先の週あたり時間」（週28時間の判定に使う・記録用）が空なので、まだ「すべて確認済み」にはしない
  // （「すべて確認済み」になることは E15 で確認する）
  const stE1b = await page.textContent('#shiftConfirmStatus');
  expect(!stE1b.includes('すべて確認済み') && !stE1b.includes('卒業後の継続') && stE1b.includes('かけもち先の週あたり時間') && !stE1b.includes('未確認：'), 'E1 シフト条件の未確認は解消し、残りは記録用の「かけもち先の週あたり時間」だけ: ' + stE1b);
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
  expect(savedHtml.includes('<h2>応募時の情報</h2>') && savedHtml.includes('<h2>面接で確認した情報</h2>') && !savedHtml.includes('<h2>応募情報</h2>'), 'E12 保存レポートは「応募時の情報」「面接で確認した情報」に分ける');
  expect(rec.inputStages && rec.inputStages.busy === 'interview' && rec.inputStages.commute === 'pre', 'E12 埋め込み JSON に保存時点の inputStages');

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
  expect(await st(() => window.RecruitApp.state.applicant.reviewerNotes) === '電話応対が丁寧。', 'E12 読込で申し送りコメント（reviewerNotes）が復元');
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
  const stagesE9 = await st(() => JSON.stringify(window.RecruitApp.state.profile.inputStages) === JSON.stringify(window.RecruitStorage.defaults().inputStages));
  expect(stagesE9, 'E9 inputStages の無い旧プロファイルは既定の段階');
  await toView('judge');
  expect(!!(await page.$('#preFill')), 'E9 旧プロファイルでも Step1 に「面接前に分かっている項目」の折りたたみ');

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
  // 旧ファイルは段階の情報を持たない。表示は現在の設定（既定の段階）で行う
  await navStep(3);
  expect(await page.$eval('#shiftConfirm input[data-field="sideJob"][value="yes"]', el => el.checked) && await page.inputValue('#shiftConfirm [data-field="lateNight.taxiFare"]') === '3800', 'E7 旧ファイルの面接時の項目（かけもち・タクシー料金）を Step3 に表示');
  await navStep(1);
  expect(await preFillOpen() === true && await page.inputValue('#preFill [data-field="sideJobDetail"]') === 'カフェ 週1日', 'E7 面接時の項目に値があるので Step1 の #preFill は自動で開く');
  const v1Saved = await saveRecord('saved-v1-resaved.html');
  expect(v1Saved.html.includes('<h2>応募時の情報</h2>') && v1Saved.html.includes('<h2>面接で確認した情報</h2>') && v1Saved.rec.inputStages.busy === 'interview', 'E7 旧ファイルを読み込んで保存すると新しいレポート構成・inputStages 付き');

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
  // 進路=就職（不採用推奨の対象）なら、継続意思が未入力でも案内文は「上長最終判断要」ではなく「不採用推奨」
  await page.selectOption('#shiftConfirm [data-field="highschool.careerPath"]', 'employment');
  await wait(150);
  const stJob = await page.textContent('#shiftConfirmStatus');
  expect(stJob.includes('卒業後の継続意思') && stJob.includes('不採用推奨') && !stJob.includes('上長最終判断要'), 'E13 就職＋継続未入力の案内文は不採用推奨: ' + stJob);
  expect((await page.textContent('#hsExceptionStatus')).includes('不採用推奨'), 'E13 就職は例外条件バッジに不採用推奨');
  await page.selectOption('#shiftConfirm [data-field="highschool.careerPath"]', 'other');
  await wait(150);
  const stOther = await page.textContent('#shiftConfirmStatus');
  expect(stOther.includes('上長最終判断要') && !stOther.includes('不採用推奨'), 'E13 その他＋継続未入力の案内文は上長最終判断要: ' + stOther);
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
  expect(!(await page.$('#contribPreview')), 'E14 Step2 に貢献度の見込みカード（#contribPreview）を出さない');
  expect((await page.textContent('#interviewTodo')).includes('繁忙期・土日祝'), 'E14 Step2「面接で確認すること」に繁忙期・土日祝');
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

  // =====================================================================
  // E15 Step1 は面接前の項目だけ → Step2「面接で確認すること」→ Step3 で面接時の項目を入力して判定
  // =====================================================================
  console.log('\n== E15 Step1 の絞り込み → Step3 で入力して判定 ==');
  await fresh();
  await fillBasic({ name: '木村 一馬', age: 20, category: '大学2年生', graduationDate: '2029-03', shifts: [['sat', '10:00', '18:00'], ['sun', '10:00', '18:00']], daysMin: 2, daysMax: 3, workPeriod: 'long', preFill: false });
  const preSel = ['[data-field="name"]', '[data-field="age"]', '[data-field="category"]', '[data-field="commuteMethod"]', '[data-field="daysMax"]', '[data-field="workPeriod"]', '[data-field="foreign.isForeign"]', '#notesCard textarea[data-field="reviewerNotes"]'];
  const preMiss = [];
  for (const s of preSel) if (!(await shown(s))) preMiss.push(s);
  expect(preMiss.length === 0, 'E15 Step1 に面接前の項目（氏名・年齢・区分・通勤・週日数・勤務期間・外国籍の該当・申し送りコメント）を表示: ' + (preMiss.join(' ') || 'all'));
  const intSel = ['[data-field="weekendFreq"]', '[data-field="allNight.availability"]', '[data-field="sideJob"]', '[data-field="lateNight.returnMethod"]'];
  const intShown = [];
  for (const s of intSel) if (await shown(s)) intShown.push(s);
  expect(intShown.length === 0, 'E15 Step1 に面接時の項目（土日頻度・オールナイト・かけもち・帰宅手段）を表示しない: ' + (intShown.join(' ') || 'none'));
  expect(await preFillOpen() === false && (await page.textContent('#preFill > summary')).includes('繁忙期・土日祝'), 'E15 #preFill は閉じていて、summary に「繁忙期・土日祝」');
  const reqE15 = await page.$$eval('#stepContent [data-required], #stepContent [data-required-seg]', els => els.map(e => e.getAttribute('data-field') || e.getAttribute('data-required-seg')));
  expect(!reqE15.some(f => /^(vacation|weekendFreq|holidayWork|lateNight|allNight|sideJob|foreign\.)/.test(f || '')) && reqE15.includes('name') && reqE15.includes('workPeriod'), 'E15 Step1 の必須に繁忙期・深夜帯などを含めない: ' + reqE15.join(','));
  await page.fill('[data-field="name"]', '');
  await toHandoff();
  expect(await step() === 1, 'E15 氏名が空なら Step1 に留まる');
  await page.fill('[data-field="name"]', '木村 一馬');
  await toHandoff();
  expect(await step() === 2, 'E15 繁忙期などが空でも Step2 へ進める');
  const todoE15 = await page.textContent('#interviewTodo');
  const todoMiss = ['繁忙期・土日祝', '深夜帯（22時以降）', 'オールナイト上映', 'かけもち', '判定前に入力が必要'].filter(x => !todoE15.includes(x));
  expect(todoMiss.length === 0, 'E15 「面接で確認すること」に面接時のセクションと「判定前に入力が必要」: 不足 ' + (todoMiss.join(',') || 'なし'));
  expect(!(await page.$('[data-item-id="shift_unanswered"]')) && (await handoffIds()).includes('shift_unanswered'), 'E15 shift_unanswered は state にあり、留意点の一覧には出さない');
  const copiedE15 = await copyHandoff();
  expect(copiedE15.includes('■面接で確認すること') && /・繁忙期・土日祝：未入力/.test(copiedE15), 'E15 コピー文の「■面接で確認すること」に「繁忙期・土日祝：未入力」');
  await shot('18-step2-interview-todo.png', true);
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  const cfMiss = [];
  for (const f of ['sideJob', 'lateNight.returnMethod', 'weekendFreq', 'allNight.availability']) if (!(await page.$('#shiftConfirm [data-field="' + f + '"]'))) cfMiss.push(f);
  expect(cfMiss.length === 0, 'E15 Step3「面接で確認する項目」に面接時の欄（かけもち・帰宅手段・土日頻度・オールナイト）: 不足 ' + (cfMiss.join(',') || 'なし'));
  await scoreAll(5);
  await judge();
  expect(await step() === 3 && (await toastText()).includes('シフト条件を確定'), 'E15 面接時の項目が未入力なら判定に進まない');
  await busyAllFull();
  await page.selectOption('#shiftConfirm [data-field="weekendFreq"]', 'every_both');
  await pick('holidayWork', 'ok');
  await pick('allNight.availability', 'ng');
  await pick('lateNight.availability', 'ng');
  await pick('sideJob', 'no');
  await wait(200);
  const stE15 = await page.textContent('#shiftConfirmStatus');
  expect(!stE15.includes('すべて確認済み') && stE15.includes('卒業後の継続') && !stE15.includes('かけもち'), 'E15 卒業後の継続だけ空なら「まだ入力のない項目：卒業後の継続」: ' + stE15);
  await pick('continueAfterGraduation', 'undecided');
  await wait(150);
  expect((await page.textContent('#shiftConfirmStatus')).includes('すべて確認済み'), 'E15 Step3 で入力すると「すべて確認済み」');
  await shot('19-step3-interview-confirm.png', true);
  await navStep(2);
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await judge();
  j = await judgment();
  expect(await step() === 4 && j.mode === 'matrix' && j.adjustments.length === 0, 'E15 Step3 の入力で 2軸判定（調整なし）: ' + j.mode + '/' + j.result);
  const savedE15 = await saveRecord('saved-e15.html');
  expect(savedE15.rec.applicant.weekendFreq === 'every_both' && savedE15.rec.applicant.sideJob === 'no', 'E15 Step3 で入力した値を保存');

  // =====================================================================
  // E16 折りたたみで先行入力・区分の変更で「卒業後の継続」の置き場所が移る
  // =====================================================================
  console.log('\n== E16 折りたたみで先行入力 ==');
  await fresh();
  await fillBasic({ name: '石井 十六', age: 20, category: '大学2年生', graduationDate: '2029-03', shifts: [['fri', '18:00', '23:30'], ['sat', '10:00', '18:00']], daysMin: 1, daysMax: 2, workPeriod: 'long', preFill: false });
  await page.fill('#notesCard [data-field="reviewerNotes"]', '土曜は月2回なら可');
  await openPreFill();
  expect(await preFillOpen() === true, 'E16 summary をクリックすると #preFill が開く');
  await pick('vacation.gw', 'ok');
  await page.fill('[data-field="vacationDays.gw"]', '5');
  await pick('lateNight.availability', 'ok');
  await wait(150);
  const cntE16 = await page.textContent('#preFillCount');
  expect(cntE16.includes('入力あり') && cntE16.includes('繁忙期・土日祝'), 'E16 #preFillCount に入力済みのセクション: ' + cntE16);
  await shot('20-step1-prefill.png', true);
  await toHandoff();
  expect((await page.textContent('#handoffComment')).includes('土曜は月2回なら可'), 'E16 Step2 の冒頭に申し送りコメント');
  const lnRow = await page.textContent('#interviewTodo li[data-section="lateNight"]');
  const busyHint = await page.textContent('#interviewTodo li[data-section="busy"] .hint').catch(() => '');
  expect(lnRow.includes('帰宅手段') && busyHint.includes('GW:○5日'), 'E16 「面接で確認すること」: 深夜帯に「帰宅手段」・繁忙期に先行入力の値「GW:○5日」: ' + lnRow + ' | ' + busyHint);
  const lrE16 = await handoffItem('late_night_return_unknown');
  expect(!!lrE16 && lrE16.deferred === true && lrE16.section === 'lateNight' && !(await page.$('.handoff-item[data-item-id="late_night_return_unknown"]')), 'E16 帰宅手段の未入力（deferred）は留意点の一覧に出さない');
  const copiedE16 = await copyHandoff();
  expect(copiedE16.includes('■面接前に分かっている情報') && copiedE16.includes('GW:○5日') && copiedE16.indexOf('■申し送りコメント') < copiedE16.indexOf('■面接で確認すること'), 'E16 コピー文に「■面接前に分かっている情報」（GW:○5日）');
  // E19 で使う保存ファイル（Step2 の状態）
  const savedE16 = await saveRecord('saved-e16.html');
  await navStep(1);
  expect(await preFillOpen() === true, 'E16 Step1 に戻ると #preFill は開いたまま');
  const contPlace = () => st(() => { const els = [...document.querySelectorAll('[data-field="continueAfterGraduation"]')]; return { n: els.length, inPre: els.filter(e => !!e.closest('#preFill')).length }; });
  let cp = await contPlace();
  expect(cp.n === 3 && cp.inPre === 3, 'E16 大学2年の「卒業後の継続」は #preFill 内に 1 組: ' + JSON.stringify(cp));
  await page.selectOption('[data-field="category"]', '高校3年生');
  await wait(300);
  cp = await contPlace();
  expect(cp.n === 3 && cp.inPre === 0, 'E16 高校3年に変えると「卒業後の継続」は基本情報（例外条件）に 1 組: ' + JSON.stringify(cp));
  await page.selectOption('[data-field="category"]', '大学2年生');
  await wait(300);
  cp = await contPlace();
  expect(cp.n === 3 && cp.inPre === 3, 'E16 大学2年に戻すと再び #preFill 内: ' + JSON.stringify(cp));

  // =====================================================================
  // E17 設定で段階を切り替える
  // =====================================================================
  console.log('\n== E17 設定で段階を切り替える ==');
  await fresh();
  await toView('settings');
  expect(await visible('#s-stages') && !!(await page.$('[data-bind="inputStages.busy"]')), 'E17 設定画面に「入力の段階」（#s-stages）');
  await page.locator('#s-stages').scrollIntoViewIfNeeded();
  await shot('21-settings-stages.png');
  await toView('judge');
  await setStage('busy', 'pre');
  await setStage('lateNight', 'pre');
  expect((await storedProfile()).inputStages.busy === 'pre', 'E17 段階（busy=pre）を保存');
  await navStep(1);
  expect(!(await inPreFill('#busyCard')) && await visible('#busyCard'), 'E17 busy=pre で繁忙期カードは折りたたみの外（開かずに表示）');
  const meterBusy = await page.textContent('#busyCard [data-meter]');
  expect(/繁忙期 [\d.]+\/30/.test(meterBusy), 'E17 Step1 の繁忙期カードに貢献度のライブ表示: ' + meterBusy);
  await fillBasic({ name: '大野 十七', age: 20, category: '大学2年生', graduationDate: '2029-03', shifts: [['fri', '18:00', '23:30']], daysMin: 1, daysMax: 1, workPeriod: 'long', preFill: false });
  await pick('lateNight.availability', 'ok');
  await wait(100);
  await toHandoff();
  const lrE17 = await handoffItem('late_night_return_unknown');
  expect(await visible('.handoff-item[data-item-id="late_night_return_unknown"]') && !!lrE17 && !lrE17.deferred, 'E17 深夜帯を面接前にすると帰宅手段の未入力は留意点の一覧に出る（deferred なし）');
  // 段階 pre のセクションの Step3 見出し：応募時に入力があったかで書き分ける
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  const hBusyE17 = await page.textContent('#cf-busy h3');
  const hLateE17 = await page.textContent('#cf-lateNight h3');
  expect(hBusyE17.includes('応募時は未入力') && hLateE17.includes('応募時に入力済み'), 'E17 Step3 の見出し：繁忙期（空）は「応募時は未入力」、深夜帯（入力あり）は「応募時に入力済み」: ' + hBusyE17 + ' / ' + hLateE17);
  await toView('settings');
  await page.selectOption('[data-bind="inputStages.foreignFlag"]', 'interview');
  await wait(200);
  expect(await page.$eval('[data-bind="inputStages.foreignDetail"]', el => el.disabled), 'E17 外国籍を面接時にすると「外国籍の詳細」の選択は無効');
  await saveSettings();
  expect((await storedProfile()).inputStages.foreignDetail === 'interview', 'E17 外国籍が面接時なら詳細も面接時で保存');
  await page.click('[data-action="stages-all-pre"]');
  await wait(200);
  await saveSettings();
  await toView('judge');
  await navStep(1);
  expect(!(await page.$('#preFill')) && await shown('[data-field="sideJob"]') && await shown('[data-field="foreign.isForeign"]'), 'E17 「すべて面接前に入力」で #preFill なし・かけもち／外国籍を Step1 に表示');
  await toView('settings');
  await page.click('[data-action="stages-default"]');
  await wait(200);
  await saveSettings();
  const spDef = await storedProfile();
  const defStages = await st(() => window.RecruitStorage.defaults().inputStages);
  expect(JSON.stringify(spDef.inputStages) === JSON.stringify(defStages), 'E17 「既定に戻す」で既定の段階に戻る');
  // 週の最大勤務日数は既定で Step1 の必須（週何日は時間帯・勤務期間と並ぶ面接に進めるかの判断材料）
  expect((await storedProfile()).stageOptions.requireDaysMax === true, 'E17 requireDaysMax は既定 ON');
  await toView('judge');
  await page.click('#btnNew');
  await wait(200);
  await fillBasic({ name: '大野 十七', age: 20, category: '大学2年生', shifts: [['sat', '10:00', '18:00']], daysMin: 1, workPeriod: 'long', preFill: false });
  expect(await page.$eval('[data-field="daysMax"]', el => el.hasAttribute('data-required')), 'E17 既定では週の最大勤務日数に必須の印');
  await toHandoff();
  expect(await step() === 1, 'E17 requireDaysMax=ON（既定）なら週の最大勤務日数が空だと Step1 に留まる');
  await page.fill('[data-field="daysMax"]', '1');
  await toHandoff();
  expect(await step() === 2, 'E17 週の最大勤務日数を入れると Step2 へ');
  // 設定で OFF にすると空欄でも進める
  await toView('settings');
  await page.click('label:has([data-bind="stageOptions.requireDaysMax"])');
  await wait(100);
  await saveSettings();
  expect((await storedProfile()).stageOptions.requireDaysMax === false, 'E17 requireDaysMax を OFF にして保存');
  await toView('judge');
  await page.click('#btnNew');
  await wait(200);
  await fillBasic({ name: '大野 十七', age: 20, category: '大学2年生', shifts: [['sat', '10:00', '18:00']], daysMin: 1, workPeriod: 'long', preFill: false });
  await toHandoff();
  expect(await step() === 2, 'E17 requireDaysMax=OFF なら週の最大勤務日数が空でも Step2 へ');
  // 不正な段階は読み込み時に既定へ戻る
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1')); p.inputStages = { busy: 'foo', lateNight: 'pre' }; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); });
  await page.reload();
  await wait(300);
  const nrm = await st(() => window.RecruitApp.state.profile.inputStages);
  expect(nrm.busy === 'interview' && nrm.lateNight === 'pre' && nrm.sideJob === 'interview', 'E17 不正値・欠落は既定に戻す（busy=foo → interview、lateNight=pre は維持）: ' + JSON.stringify(nrm));

  // =====================================================================
  // E18 外国籍は「該当する／しない」だけ面接前
  // =====================================================================
  console.log('\n== E18 外国籍 ==');
  await fresh();
  await fillBasic({ name: 'リー ミン', age: 22, category: '大学4年生', graduationDate: '2027-03', shifts: [['sat', '10:00', '18:00']], daysMin: 1, daysMax: 1, workPeriod: 'long', preFill: false });
  await pick('foreign.isForeign', 'yes');
  await wait(100);
  expect(await visible('#foreignStageHint') && !(await shown('[data-field="foreign.workPermit"]')), 'E18 外国籍「該当する」で #foreignStageHint（詳細は面接時）');
  await toHandoff();
  const todoE18 = await page.textContent('#interviewTodo');
  expect(todoE18.includes('外国籍の詳細') && todoE18.includes('資格外活動許可'), 'E18 「面接で確認すること」に外国籍の詳細（資格外活動許可）');
  const fpE18 = await handoffItem('foreign_permit_missing');
  expect(!!fpE18 && fpE18.deferred === true && !(await page.$('.handoff-item[data-item-id="foreign_permit_missing"]')), 'E18 資格外活動許可の未入力（deferred）は留意点の一覧に出さない');
  expect(!!(await page.$('.handoff-item[data-item-id="foreign_hour_cap"]')), 'E18 foreign_hour_cap（要確認）は一覧に出す');
  expect((await page.textContent('#handoffCard .table.kv')).includes('該当（詳細は面接で確認）'), 'E18 詳細が未入力なら応募者表は「該当（詳細は面接で確認）」');
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  expect(!!(await page.$('#deferredItems [data-check="foreign_permit_missing"]')), 'E18 Step3 の #deferredItems に資格外活動許可の未入力');
  await busyAllFull();
  await page.selectOption('#shiftConfirm [data-field="weekendFreq"]', 'every_one');
  await pick('holidayWork', 'ok');
  await pick('allNight.availability', 'ng');
  await pick('lateNight.availability', 'ng');
  await pick('sideJob', 'no');
  await scoreAll(5);
  await judge();
  j = await judgment();
  expect(await step() === 4 && j.result === 'review' && j.adjustments.includes('unresolved_block'), 'E18 未入力・未チェックのまま判定すると上長最終判断要（unresolved_block）: ' + j.result);
  const warnE18 = await page.textContent('#judgeWarnings');
  expect(warnE18.includes('面接で確認') && !!(await page.$('#judgeWarnings [data-action="to-step"][data-step="3"]')), 'E18 Step4 の未確認一覧に「面接で確認」タグと「面接で確認する項目へ」ボタン');
  await shot('22-step4-deferred.png', true);
  // 入力せずに確認済みにする（#deferredItems のチェック）
  await navStep(3);
  await checkDeferred();
  await judge();
  j = await judgment();
  expect(!j.adjustments.includes('unresolved_block') && (await handoffIds()).includes('foreign_permit_missing'), 'E18 #deferredItems をチェックすると未確認が解消（項目は残る）');
  // 面接で入力する
  await navStep(3);
  await page.selectOption('#shiftConfirm [data-field="foreign.workPermit"]', 'yes');
  await page.fill('#shiftConfirm [data-field="foreign.residenceExpiry"]', '2028-03');
  await wait(200);
  expect(!(await visible('#deferredItems')), 'E18 入力すると #deferredItems は空（非表示）');
  await judge();
  j = await judgment();
  expect(!(await handoffIds()).includes('foreign_permit_missing') && !j.adjustments.includes('unresolved_block'), 'E18 資格外活動許可を入力すると留意点から消え unresolved_block なし: ' + j.result);

  // =====================================================================
  // E19 保存 → 読込
  // =====================================================================
  console.log('\n== E19 保存 → 読込 ==');
  const r16 = savedE16.rec;
  const lr16 = (r16.handoff.items || []).find(i => i.id === 'late_night_return_unknown');
  expect(r16.applicant.vacationDays.gw === '5' && r16.applicant.reviewerNotes === '土曜は月2回なら可' && r16.inputStages.busy === 'interview' && !!lr16 && lr16.deferred === true, 'E19 埋め込み JSON（GW 5日・申し送りコメント・inputStages・deferred）');
  // 面接前（Step2）に保存したので、面接時の項目は「面接前に分かっている情報（未確認）」（コピー文の『■面接前に分かっている情報』と同じ扱い）
  const headsMiss = ['<h2>応募時の情報</h2>', '<h2>面接者への申し送りコメント</h2>', '<h2>面接前に分かっている情報（未確認）</h2>', '保存時点で未入力'].filter(x => !savedE16.html.includes(x));
  expect(headsMiss.length === 0 && !savedE16.html.includes('<h2>面接で確認した情報</h2>'), 'E19 保存レポートの章（応募時の情報・申し送りコメント・面接前に分かっている情報（未確認）・保存時点で未入力）: 不足 ' + (headsMiss.join(',') || 'なし'));
  const ivHead = savedE16.html.indexOf('<h2>面接前に分かっている情報（未確認）</h2>');
  expect(ivHead > 0 && savedE16.html.indexOf('<tr><th>繁忙期</th>') > ivHead, 'E19 折りたたみで先に入れた繁忙期は「面接前に分かっている情報（未確認）」の下');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', savedE16.file);
  await wait(500);
  const l16 = await st(() => { const s = window.RecruitApp.state; return { step: s.step, gw: s.applicant.vacationDays.gw, ln: s.applicant.lateNight.availability, notes: s.applicant.reviewerNotes }; });
  expect(l16.step === 2 && l16.gw === '5' && l16.ln === 'ok' && l16.notes === '土曜は月2回なら可', 'E19 読込で値が復元・Step2 から再開: ' + JSON.stringify(l16));
  await navStep(1);
  expect(await preFillOpen() === true, 'E19 面接時の項目に値があるので #preFill は自動で開く');
  // E15 の判定後のファイル → 再判定が保存時と一致
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', savedE15.file);
  await wait(500);
  j = await judgment();
  expect(!!j && j.result === savedE15.rec.judgment.result && j.contribution === savedE15.rec.contribution.total && await step() === 4, 'E19 E15 の保存ファイルを読み込むと再判定が保存時と一致: ' + (j && j.result));
  // 段階分け導入前の v2 レコード（inputStages・deferred の印なし）
  const oldRec = JSON.parse(JSON.stringify(r16));
  delete oldRec.inputStages;
  oldRec.handoff.items = oldRec.handoff.items.map(i => { const o = Object.assign({}, i); delete o.deferred; delete o.aggregate; delete o.section; return o; });
  const oldJson = JSON.stringify(oldRec).replace(/<\/script/gi, '<\\/script');
  const oldHtml = savedE16.html.replace(/(<script type="application\/json" id="recruit-record">)[\s\S]*?(<\/script>)/, (m, a, b) => a + oldJson + b);
  const oldFile = path.join(OUT, 'saved-v2-nostages.html');
  fs.writeFileSync(oldFile, oldHtml);
  await page.click('#btnNew');
  await wait(200);
  const errsOld = errors.length;
  await page.setInputFiles('#fileInput', oldFile);
  await wait(500);
  const lOld = await handoffItem('late_night_return_unknown');
  expect(errors.length === errsOld && await step() === 2 && await st(() => window.RecruitApp.state.applicant.vacationDays.gw) === '5', 'E19 段階情報の無い旧 v2 レコードもエラーなく読める');
  expect(!!lOld && lOld.deferred === true && !(await page.$('.handoff-item[data-item-id="late_night_return_unknown"]')) && (await page.textContent('#interviewTodo')).includes('深夜帯（22時以降）'), 'E19 旧 v2 レコードは現在の段階の設定で表示（deferred を付け直す）');
  const reSaved = await saveRecord('saved-v2-resaved.html');
  expect(reSaved.rec.inputStages && reSaved.rec.inputStages.busy === 'interview', 'E19 旧 v2 レコードを保存し直すと inputStages が付く');

  // 狭い画面（390px）で Step1 が横にはみ出さない
  await page.click('#btnNew');
  await wait(200);
  await page.setViewportSize({ width: 390, height: 900 });
  await wait(200);
  await openPreFill();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, 'E19 390px 幅の Step1（折りたたみを開いた状態）で横スクロールなし: ' + overflow);
  await shot('23-step1-narrow-prefill.png', true);
  await toView('settings');
  const overflowS = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflowS <= 1, 'E19 390px 幅の設定画面（下部の保存バー）で横スクロールなし: ' + overflowS);
  await toView('judge');
  await page.setViewportSize({ width: 1440, height: 1000 });

  // =====================================================================
  // E20 面接で確認する項目の表示（外国籍「該当しない」・折りたたみの summary・他劇場の旧プロファイル）
  // =====================================================================
  console.log('\n== E20 面接で確認する項目の表示 ==');
  await fresh();
  await fillBasic({ name: '森 二十', age: 25, category: 'フリーター', shifts: [['mon', '10:00', '16:00'], ['tue', '10:00', '16:00']], daysMin: 2, daysMax: 2, workPeriod: 'long', preFill: false });
  await pick('foreign.isForeign', 'no');
  await wait(150);
  const pfSumE20 = await page.textContent('#preFill .prefill-list');
  expect(!pfSumE20.includes('外国籍の詳細') && !pfSumE20.includes('卒業後の継続') && pfSumE20.includes('かけもち'), 'E20 フリーター・外国籍「該当しない」の #preFill summary に関係のないセクションを出さない: ' + pfSumE20);
  await pick('foreign.isForeign', 'yes');
  await wait(150);
  expect((await page.textContent('#preFill .prefill-list')).includes('外国籍の詳細'), 'E20 外国籍「該当する」にすると summary に「外国籍の詳細」');
  // 外国籍の詳細が空のまま Step2：資格外活動許可の未入力（要判断・deferred）は一覧に出ないが、右サマリーの内訳と「面接で確認すること」で要判断と分かる
  await toHandoff();
  const sumE20 = await st(() => ({ block: Number(document.querySelector('.sum-count.block b').textContent), later: (document.getElementById('sumLater') || {}).textContent || '' }));
  expect(sumE20.block === 0 && sumE20.later.includes('要判断 1 件'), 'E20 右サマリー：一覧に無い要判断は件数に入れず「うち要判断 1 件」と内訳で示す: ' + JSON.stringify(sumE20));
  expect((await page.textContent('#interviewTodo [data-section="foreignDetail"]')).includes('要判断'), 'E20 「面接で確認すること」の外国籍の詳細に要判断の印');
  expect(/・外国籍の詳細：.*［要判断］/.test(await copyHandoff()), 'E20 コピー文の「外国籍の詳細」に［要判断］');
  await navStep(1);
  await pick('foreign.isForeign', 'no');
  await wait(150);
  await toHandoff();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  expect(!(await page.$('#cf-foreign')), 'E20 外国籍「該当しない」なら Step3 に中身のない「外国籍」見出しを出さない');
  expect(!(await page.$('#deferredItems [data-check="shift_unanswered"]')), 'E20 判定前にシフト条件が必須の設定では、shift_unanswered を「未入力のまま判定する場合の留意点」に出さない');
  const stE20 = await page.textContent('#shiftConfirmStatus');
  expect(!stE20.includes('すべて確認済み') && stE20.includes('かけもち'), 'E20 かけもちが空なら「すべて確認済み」にしない: ' + stE20);
  // 外国籍を空のまま Step3 へ → 該当の有無の欄は、選んだ後の再描画でも残る
  await page.click('#btnNew');
  await wait(200);
  await fillBasic({ name: '森 二十', age: 25, category: 'フリーター', shifts: [['sat', '10:00', '18:00']], daysMin: 1, daysMax: 1, workPeriod: 'long', preFill: false });
  await toHandoff();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await pick('foreign.isForeign', 'no');
  await page.click('[data-action="busy-all-ok"]');
  await wait(200);
  expect(await shown('#cf-foreign [data-field="foreign.isForeign"]'), 'E20 Step3 で選んだ外国籍の該当欄は再描画後も残る');
  // 他劇場の旧プロファイル（2軸 OFF・shift_unanswered なし）
  await page.setInputFiles('#profileFileInput', path.join(FIX, 'v1-profile-other.json'));
  await wait(400);
  // 旧プロファイルも既定どおり週の最大勤務日数は必須。ここでは空欄のときの Step3 の欄を確かめるため OFF にする
  expect(await st(() => window.RecruitApp.state.profile.stageOptions.requireDaysMax === true), 'E20 他劇場の旧プロファイルも requireDaysMax は既定 ON');
  await page.click('label:has([data-bind="stageOptions.requireDaysMax"])');
  await wait(100);
  await saveSettings();
  await toView('judge');
  await page.click('#btnNew');
  await wait(200);
  await fillBasic({ name: '他 二十', age: 21, category: '大学3年生', graduationDate: '2028-03', shifts: [['sat', '10:00', '18:00']], daysMin: 1, workPeriod: 'long', preFill: false });
  await toHandoff();
  expect(await step() === 2, 'E20 他劇場：Step2 へ');
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  const stOther20 = await page.textContent('#shiftConfirmStatus');
  expect(!stOther20.includes('すべて確認済み') && stOther20.includes('まだ入力のない項目') && stOther20.includes('繁忙期'), 'E20 他劇場：空欄の面接時の項目があるうちは「すべて確認済み」にしない: ' + stOther20);
  const daysOther = await st(() => window.RecruitRules.interviewConfirm(window.RecruitApp.state.applicant, window.RecruitApp.state.profile).sections.some(s => s.missing.some(m => m.key === 'daysMax')));
  expect(!daysOther || !!(await page.$('#shiftConfirm [data-field="daysMax"]')), 'E20 他劇場：週の最大勤務日数が未入力なら Step3 に欄を出す');
  await shot('24-step3-other-theater.png', true);

  // =====================================================================
  // E21 Step3 で入力した内容から出た留意点を Step3 でチェックして、Step2 に戻らずに判定
  // =====================================================================
  console.log('\n== E21 Step3 の入力から出た留意点 ==');
  await fresh();
  await fillBasic({ name: '岡田 二一', age: 25, category: 'フリーター', shifts: [['sat', '10:00', '18:00'], ['sun', '10:00', '18:00']], daysMin: 2, daysMax: 2, workPeriod: 'long', preFill: false });
  await pick('foreign.isForeign', 'no');
  await toHandoff();
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await busyAllFull();
  await pick('vacation.gw', 'ng');
  await page.selectOption('#shiftConfirm [data-field="weekendFreq"]', 'every_both');
  await pick('holidayWork', 'ok');
  await pick('allNight.availability', 'ng');
  await pick('lateNight.availability', 'ng');
  await pick('sideJob', 'no');
  await wait(200);
  const newIds = await page.$$eval('#interviewNewItems [data-check]', els => els.map(e => e.dataset.check));
  expect(['vacation_ng', 'allnight_ng', 'late_night_ng'].every(id => newIds.includes(id)) && await visible('#interviewNewItems'), 'E21 Step3 に「面接で入力した内容から出た留意点」（vacation_ng・allnight_ng・late_night_ng）: ' + newIds.join(','));
  expect((await page.textContent('#interviewNewItems')).includes('面接で入力した内容から出た留意点'), 'E21 見出し「面接で入力した内容から出た留意点」');
  const alertE21 = await page.textContent('#unresolvedAlert');
  expect(/うち \d+ 件は下の『面接で確認する項目』/.test(alertE21) && !alertE21.includes('申し送りを確認する'), 'E21 上部の件数は「下で確認」に含め、Step2 へ戻るボタンは出さない: ' + alertE21);
  await scoreAll(5);
  // 未チェックのまま判定すると要判断（vacation_ng）が残り上長最終判断要
  await judge();
  j = await judgment();
  expect(await step() === 4 && j.adjustments.includes('unresolved_block'), 'E21 未チェックのまま判定すると unresolved_block: ' + JSON.stringify(j.adjustments));
  expect(!!(await page.$('#judgeWarnings [data-action="to-step"][data-step="3"]')), 'E21 Step4 の未確認一覧に「面接で確認する項目へ」');
  await navStep(3);
  for (const cb of await page.$$('#interviewNewItems input[data-check]')) if (!(await cb.isChecked())) await cb.check({ force: true });
  await wait(150);
  expect(!(await visible('#unresolvedAlert .alert')), 'E21 Step3 でチェックすると上部の未確認アラートが消える');
  await shot('25-step3-interview-new-items.png', true);
  await judge();
  j = await judgment();
  const unrE21 = await st(() => window.RecruitApp.state.judgment.unresolved.map(i => i.id));
  expect(await step() === 4 && j.mode === 'matrix' && !!j.cellKey && !j.adjustments.includes('unresolved_block') && unrE21.length === 0, 'E21 Step2 に戻らずに判定して 2軸（matrix）判定・未確認なし: ' + JSON.stringify({ mode: j.mode, cell: j.cellKey, result: j.result, adj: j.adjustments, unr: unrE21 }));
  // 面接前に外国籍の詳細を折りたたみで入れていれば、Step2 の応募者表はその値を出す
  await page.click('#btnNew');
  await wait(200);
  await fillBasic({ name: 'グエン 二一', age: 22, category: 'フリーター', shifts: [['sat', '10:00', '18:00']], daysMin: 1, daysMax: 1, workPeriod: 'long' });
  await pick('foreign.isForeign', 'yes');
  await wait(100);
  await page.selectOption('#preFill [data-field="foreign.residenceStatus"]', '永住者');
  await wait(100);
  await toHandoff();
  const rowE21 = await page.textContent('#handoffCard .table.kv');
  expect(rowE21.includes('在留資格: 永住者') && !rowE21.includes('詳細は面接で確認'), 'E21 折りたたみで入れた外国籍の詳細を Step2 の応募者表に出す: ' + rowE21.replace(/\s+/g, ' '));

  // =====================================================================
  // E22 応募者の管理（押印）: アプリで押印 → 保存 → レポート上で押印・保存 → 読込
  // =====================================================================
  console.log('\n== E22 応募者の管理（押印） ==');
  await page.click('#btnNew');
  await wait(200);
  await fillBasic({ name: '押印 太郎', age: 24, category: 'フリーター', shifts: [['sat', '10:00', '18:00'], ['sun', '10:00', '18:00']], daysMin: 2, daysMax: 3, workPeriod: 'long', preFill: false });
  await toHandoff();
  expect(!!(await page.$('#mgmtCard')) && (await page.$$('#mgmtCard .stamp-box')).length === 3, 'E22 Step2 に押印カード（3枠）');
  const boxSel = (id) => '#mgmtCard .stamp-box[data-field-id="' + id + '"]';
  const hankoCount = (h) => (h.replace(/<script>[\s\S]*?<\/script>/g, '').match(/<svg class="hanko"/g) || []).length;
  await page.selectOption(boxSel('initial') + ' select', { label: '笹川 晴央（副支配人）' });
  await page.click(boxSel('initial') + ' [data-action="stamp"]');
  await wait(200);
  const m1 = await st(() => window.RecruitApp.state.management.initial);
  expect(!!m1 && m1.name === '笹川 晴央' && m1.short === '笹川' && m1.title === '副支配人' && m1.date === '2026.10.10', 'E22 初期対応者に名簿の担当者で押印: ' + JSON.stringify(m1));
  expect(!!(await page.$(boxSel('initial') + ' svg.hanko')) && (await page.textContent(boxSel('initial') + ' .stamp-meta')).includes('2026.10.10'), 'E22 ハンコ SVG と氏名・日付が表示');
  await page.click(boxSel('interviewer') + ' [data-action="stamp"]');
  await wait(100);
  expect(!(await st(() => window.RecruitApp.state.management.interviewer)), 'E22 担当者未選択では押印されない');
  await page.selectOption(boxSel('interviewer') + ' select', '__free');
  await wait(100);
  expect(await visible(boxSel('interviewer') + ' .stamp-free'), 'E22 手入力を選ぶと氏名欄が出る');
  await page.fill(boxSel('interviewer') + ' .stamp-free', '山田 太郎');
  await page.click(boxSel('interviewer') + ' [data-action="stamp"]');
  await wait(200);
  const m2 = await st(() => window.RecruitApp.state.management.interviewer);
  expect(!!m2 && m2.name === '山田 太郎' && m2.short === '山田' && m2.title === '', 'E22 手入力の担当者で押印（印字名は姓）: ' + JSON.stringify(m2));
  await page.click(boxSel('interviewer') + ' [data-action="unstamp"]');
  await wait(150);
  expect(!(await st(() => window.RecruitApp.state.management.interviewer)) && !(await page.$(boxSel('interviewer') + ' svg.hanko')), 'E22 取消で押印が消える');
  await shot('26-step2-stamps.png', true);
  const savedE22 = await saveRecord('saved-stamps.html');
  expect(!!savedE22.rec.management && savedE22.rec.management.initial.name === '笹川 晴央' && !savedE22.rec.management.interviewer, 'E22 保存レコードに management');
  expect(savedE22.html.includes('<h2>応募者の管理</h2>') && savedE22.html.includes('id="recruit-mgmt-config"') && savedE22.html.includes('data-filename="応募者_押印_太郎_2026-10-10.html"') && hankoCount(savedE22.html) === 1, 'E22 レポートに押印欄・名簿・ファイル名・ハンコ1個');
  // レポート上で押印 → 「押印を保存」で再出力
  const rp = await ctx.newPage();
  const rpErrors = [];
  rp.on('pageerror', e => rpErrors.push(e.message));
  rp.on('dialog', d => d.accept());
  await rp.clock.setFixedTime(NOW);
  await rp.goto('file://' + savedE22.file);
  await wait(300);
  const rbox = (id) => '#mgmt .stamp-box[data-field-id="' + id + '"]';
  expect((await rp.$$('#mgmt .stamp-box')).length === 3 && !!(await rp.$(rbox('initial') + ' svg.hanko')) && !(await rp.$eval('#mgmtSave', el => el.classList.contains('show'))), 'E22 レポート: 3枠・初期対応者は押印済み・保存バーは非表示');
  await rp.selectOption(rbox('interviewer') + ' select', { label: '笹川 晴央（副支配人）' });
  await rp.click(rbox('interviewer') + ' [data-act="stamp"]');
  await wait(200);
  expect(!!(await rp.$(rbox('interviewer') + ' svg.hanko')) && (await rp.textContent(rbox('interviewer') + ' .stamp-meta')).includes('笹川 晴央') && (await rp.$eval('#mgmtSave', el => el.classList.contains('show'))), 'E22 レポート上で押印すると SVG と保存バーが出る');
  await rp.selectOption(rbox('final') + ' select', '__free');
  await rp.fill(rbox('final') + ' input', '鈴木 花子');
  await rp.click(rbox('final') + ' [data-act="stamp"]');
  await wait(150);
  await rp.screenshot({ path: path.join(OUT, '27-report-stamps.png'), fullPage: true });
  const [dl22] = await Promise.all([rp.waitForEvent('download'), rp.click('#mgmtSaveBtn')]);
  const file22b = path.join(OUT, 'saved-stamps-2.html');
  await dl22.saveAs(file22b);
  const html22b = fs.readFileSync(file22b, 'utf8');
  const rec22b = parseRecord(html22b);
  expect(dl22.suggestedFilename() === '応募者_押印_太郎_2026-10-10.html' || dl22.suggestedFilename() === 'download', 'E22 再出力のファイル名: ' + dl22.suggestedFilename());
  expect(html22b.startsWith('<!DOCTYPE html>') && rec22b.management.initial.name === '笹川 晴央' && rec22b.management.interviewer.name === '笹川 晴央' && rec22b.management.final.name === '鈴木 花子' && rec22b.management.final.short === '鈴木' && rec22b.management.final.date === '2026.10.10', 'E22 再出力したファイルの埋め込みデータに 3 つの押印: ' + JSON.stringify(rec22b.management));
  expect(hankoCount(html22b) === 3 && html22b.includes('id="recruit-mgmt-config"') && html22b.includes('id="mgmtSaveBtn"') && !/class="mgmt-save show"/.test(html22b), 'E22 再出力したファイルにも押印 UI と 3 個のハンコ・保存バーは閉じた状態');
  expect(rec22b.applicant.name === '押印 太郎' && rec22b.kind === 'recruit-applicant-record', 'E22 再出力しても応募者データは維持');
  // 再出力したファイルを開いても動く（押印の取消 → 保存バー）
  await rp.goto('file://' + file22b);
  await wait(300);
  expect((await rp.$$('#mgmt svg.hanko')).length === 3, 'E22 再出力したファイルを開くと 3 個のハンコ');
  await rp.click(rbox('final') + ' [data-act="unstamp"]');
  await wait(150);
  expect((await rp.$$('#mgmt svg.hanko')).length === 2 && (await rp.$eval('#mgmtSave', el => el.classList.contains('show'))), 'E22 再出力ファイル上で取消できる');
  await rp.emulateMedia({ media: 'print' });
  expect((await rp.$eval('.stamp-ctl', el => getComputedStyle(el).display)) === 'none' && (await rp.$eval('#mgmtSave', el => getComputedStyle(el).display)) === 'none' && (await rp.$eval('#mgmt svg.hanko', el => getComputedStyle(el).display)) !== 'none', 'E22 印刷時は操作部品を隠しハンコは出す');
  expect(rpErrors.length === 0, 'E22 レポートのページエラーなし: ' + (rpErrors.join(' / ') || 'none'));
  await rp.close();
  // 再出力したファイルをアプリで読み込む → 押印が引き継がれる
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file22b);
  await wait(500);
  const m22 = await st(() => window.RecruitApp.state.management);
  expect(await st(() => window.RecruitApp.state.applicant.name) === '押印 太郎' && m22.initial && m22.interviewer && m22.final && m22.final.name === '鈴木 花子', 'E22 読込で押印を引き継ぐ: ' + JSON.stringify(Object.keys(m22)));
  await navStep(2);
  expect((await page.$$('#mgmtCard svg.hanko')).length === 3, 'E22 読込後の Step2 に 3 個のハンコ');
  await page.click('#btnNew');
  await wait(200);
  expect(Object.keys(await st(() => window.RecruitApp.state.management)).length === 0, 'E22 新規で押印がリセットされる');

  expect(errors.length === 0, 'ERRORS: ' + (errors.length ? JSON.stringify(errors) : 'none'));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  console.log('\n' + (fails.length ? fails.length + ' FAILED:\n - ' + fails.join('\n - ') : 'ALL PASSED'));
  if (fails.length) process.exit(1);
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
