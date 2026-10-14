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
 *   E22 応募者の管理（押印） E23 申し送りシート（A4 1枚） E24 全体印刷の改ページ
 * 面接チェックリスト（docs/SPEC-checklist.md 7-2）
 *   E25 Step3 でチェックリストを入力 → 判定 → Step4 の内訳 → 保存 → 読込 → レポートの節
 *   E26 必須条件ゲート（不一致 → 不採用推奨・設定で上長最終判断要・面接の打ち切り）
 *   E27 A4「面接チェックリスト報告」（アプリ・レポート。PDF 1〜2 ページ・重いサンプル・質問文 OFF）
 *   E28 設定で台本を変更（文言・項目の追加・確認点の削除で満点が変わる・既定に戻す・壊れた設定）
 *   E29 旧データ（v1・checklist なし v2）・他劇場の旧プロファイル・390px・ダークモード
 *   E30 報告書表示・最終合否（アプリで面接 → 保存 → 保存 HTML で採用＋最終確認の自動押印 → 押印を保存 → 印刷 → 読込 → 再判定・再保存）
 *   E31 不採用・取消・チェックリスト無しの報告書表示・詳細からの全体印刷・ダーク・画面幅・アプリの取消／不採用・設定の ON/OFF
 * 台本モード（docs/SPEC-script-mode.md 7-3）。E1〜E31 は詳細モードの検証（fresh() が詳細モードの設定を書き込む）
 *   E32 台本モード（既定）・3 ステップ・Step① 応募者（mode の無い設定は台本モード・詳細項目なし・390px）
 *   E33 Step② 面接チェックリスト（①〜⑤ のみ・読み取り専用ヘッダー）→ Step③ 報告書（紙プレビュー・判定サマリー・必須条件・総合判断）
 *   E34 押印 → 保存 → 保存 HTML（報告書表示・詳細・最終合否・押印を保存・A4 印刷）→ アプリで読込
 *   E35 詳細モードの記録の読み込み・設定の運用モード（畳み込み・切替）・使い方
 *   E36 台本モードの記録を詳細モードで読む・ダークモードの紙・390px
 *   E37 ③ を開かずに ② から保存・印刷しても判定が入る・② で保存した記録は ② から再開・印刷の経路（🖨・② の印刷ボタン・beforeprint）・総合判断未入力の保存
 *   （画面名〔E32・E35〕、設定の「面接チェックリスト」節・「詳細モードの設定」リンク〔E35〕も確認）
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
// PDF のページ数・本文（poppler の pdfinfo / pdftotext）。使えない環境では -1 / null を返す。
// その場合の確認は省略になるため、無言で PASS にせず SKIP を出す
const pdfPagesOf = (f) => {
  try { return Number((require('child_process').execSync('pdfinfo "' + f + '"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().match(/Pages:\s+(\d+)/) || [])[1]); }
  catch (e) { console.log('SKIP pdfinfo が使えないため ' + path.basename(f) + ' のページ数の確認を省略'); return -1; }
};
const pdfTextOf = (f) => {
  try { return require('child_process').execSync('pdftotext -layout "' + f + '" -', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/\s+/g, ''); }
  catch (e) { console.log('SKIP pdftotext が使えないため ' + path.basename(f) + ' の本文の確認を省略'); return null; }
};

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
  // 詳細モード（既存 E1〜E31 の前提）で始める: localStorage を空にし、詳細モードの既定プロファイルを書き込んで 1 回だけ再読込（docs/SPEC-script-mode.md 7-2）
  const fresh = async () => {
    await page.evaluate(() => { try { localStorage.clear(); const p = window.RecruitStorage.defaults(); p.mode = 'full'; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); } catch (e) {} });
    await page.reload();
    await wait(300);
  };
  // 台本モード（既定）で始める: localStorage を空にして再読込
  const freshScript = async () => { await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await page.reload(); await wait(300); };
  // 保存済みの設定を詳細モードにする（既に詳細なら何もしない）。旧プロファイルの取り込み・初期化の後に使う
  const ensureFullMode = async () => {
    if (await st(() => window.RecruitApp.state.profile.mode) === 'full') return;
    await page.evaluate(() => { const S = window.RecruitStorage; const p = S.loadProfile(); p.mode = 'full'; S.saveProfile(p); });
    await page.reload(); await wait(300);
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
  // 面接チェックリスト（docs/SPEC-checklist.md 7-2）。既に同じ値なら押さない（再押下で解除されるため）
  const setCl = async (path, v) => {
    const cur = await st(p => window.RecruitUtil.getPath(window.RecruitApp.state.checklist, p) || '', path);
    if (cur !== v) await page.click(`[data-action="cl-set"][data-cl="${path}"][data-value="${v}"]`);
  };
  // 必須条件すべて一致（o.must=false で触らない）・確認点すべて level・総合判断 o.overall（既定 hire）
  const rateAll = async (level = 'good', o = {}) => {
    const ids = await st(() => { const d = window.RecruitApp.state.profile.checklist, R = window.RecruitRules;
      return { must: R.checklistItems(d, 'must').map(x => x.item.id), rate: R.checklistItems(d, 'rating').map(x => x.item.id) }; });
    if (o.must !== false) for (const id of ids.must) await setCl('values.' + id, 'match');
    for (const id of ids.rate) await setCl('values.' + id, level);
    await setCl('overall', o.overall || 'hire');
    await wait(100);
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
  await ensureFullMode();
  await shot('01-step1-empty.png');
  const names0 = await page.evaluate(() => ({ nav: document.querySelector('.nav-item[data-view="judge"]').textContent.trim(), top: document.getElementById('topTitle').textContent, side: document.getElementById('stepSectionTitle').textContent }));
  expect(names0.nav.endsWith('応募者判定') && names0.top === '応募者判定' && names0.side === '判定ステップ', '詳細モードの画面名は従来どおり（ナビ・トップバー「応募者判定」・サイドバー「判定ステップ」）: ' + JSON.stringify(names0));

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
  expect(await step() === 3, 'E1 確認点未入力では判定に進まない');
  expect((await toastText()).includes('未入力の確認点') && (await page.$$('.cl-rate-row.missing')).length === 7 && !!(await page.$('#clOverall.missing')), 'E1 未入力の確認点 7 件と総合判断に .missing・toast「未入力の確認点」');
  // ○4 △3＋採用（13/16 = 81.3%・高）
  await rateAll('good');
  for (const id of ['rt_manner', 'rt_turnover', 'rt_team']) await setCl('values.' + id, 'fair');
  await page.fill('textarea[data-note="interview"]', '笑顔が良く、受け答えも明瞭。');
  await wait(200);
  await shot('05-step3-checklist.png', true);
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
  expect(j.total === 13 && j.max === 16 && j.pct === 81.3, 'E1 面接チェックリスト 13/16（81.3%）');
  expect(j.contribution === 65.4 && j.cellKey === 'high_high' && j.baseResult === 'recommend', 'E1 マトリクス high_high = 採用推奨');
  expect(j.result === 'review' && j.adjustments.includes('unresolved_block'), 'E1 要判断未確認で上長最終判断要（unresolved_block）');
  expect(!(await handoffIds()).includes('shift_unanswered'), 'E1 Step3 で確定後、handoff に shift_unanswered が残らない（stale 再生成）');
  const judgedUnresolved = await st(() => window.RecruitApp.state.judgment.unresolved.length);
  expect(liveCount === judgedUnresolved, 'E1 Step3 上部の未確認件数は入力に追従し、判定時と一致: ' + staleCount + ' → ' + liveCount + '（判定 ' + judgedUnresolved + '）');
  expect(await page.$eval('.result-card [data-axis="interview"]', el => el.textContent.includes('13')) && await page.$eval('.result-card [data-axis="contribution"]', el => el.textContent.includes('65.4')), 'E1 Step4 に両軸の点数');
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
  const loaded = await st(() => { const s = window.RecruitApp.state; const a = s.applicant; return { name: a.name, step: s.step, scores: Object.keys(s.scores).length, ratings: window.RecruitRules.checklistItems(s.profile.checklist, 'rating').filter(x => s.checklist.values[x.item.id]).length, overall: s.checklist.overall, note: s.handoffNote, vd: a.vacationDays, vac: a.vacation, holiday: a.holidayWork, wf: a.weekendFreq, an: a.allNight, legacy: s.legacyRecord }; });
  console.log('LOADED: ' + JSON.stringify(loaded));
  expect(loaded.name === '佐藤 花子' && loaded.step === 4 && loaded.ratings === 7 && loaded.overall === 'hire' && loaded.scores === 0 && loaded.note === '土曜は月2回程度なら可能とのこと。', '読込で氏名・ステップ・採点・追記が復元');
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
  // 面接チェックリスト ③ の説明に項目を追加できる
  await page.click('details.s-cl-sec[data-sec-id="job"] > summary');
  await wait(100);
  const clItemsBefore = await st(() => document.querySelectorAll('details.s-cl-sec[data-sec-id="job"] .s-cl-item').length);
  await page.click('details.s-cl-sec[data-sec-id="job"] [data-action="cl-item-add"][data-block="0"]');
  await wait(100);
  expect(await st(() => document.querySelectorAll('details.s-cl-sec[data-sec-id="job"] .s-cl-item').length) === clItemsBefore + 1, '面接チェックリスト ③ の説明に項目を追加できる（.s-cl-item が 1 件増える）');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  console.log('profile export:', dl2.suggestedFilename());
  await page.click('[data-action="reset"]');
  await wait(300);
  expect(await page.textContent('#brandTheater') === 'TOHOシネマズ新宿', '初期化で新宿既定に戻る');
  await ensureFullMode();

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
  await rateAll('good');
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
  await rateAll('good');
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
  await ensureFullMode();
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
  await ensureFullMode();
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
  // 旧形式の面接評価（10項目×5点）は旧方式のまま再判定し、レポートも旧形式の表（SPEC-checklist 6-2）
  const j7 = await st(() => { const x = window.RecruitApp.state.judgment; return x && { mode: x.interviewMode, max: x.max, total: x.total }; });
  expect(!!j7 && j7.mode === 'legacy' && j7.max === 50 && j7.total === 39, 'E7 旧ファイルの判定は旧方式（39 / 50）: ' + JSON.stringify(j7));
  await navStep(3);
  expect(await visible('#legacyScores') && (await page.textContent('#legacyScores')).includes('39 / 50'), 'E7 Step3 に旧形式の面接評価（39 / 50）');
  expect(v1Saved.html.includes('data-sec="scores"') && v1Saved.html.includes('面接評価（旧形式・10項目×5点）') && !v1Saved.html.includes('data-sec="checklist"') && !v1Saved.html.includes('id="rtPrintChecklist"') && !v1Saved.html.includes('id="clSheet"'),
    'E7 旧ファイルを保存し直したレポートは旧形式の面接評価の節だけ（チェックリスト節・A4 報告なし）');

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
  await rateAll('good');
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
  await rateAll('good');
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
  await rateAll('good');
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
  await ensureFullMode();
  await toView('settings');
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
  await rateAll('good');
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
  const rpDialogs = [];
  rp.on('dialog', d => { rpDialogs.push(d.type()); d.accept(); });
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
  await wait(150);
  expect((await rp.$eval('#mgmtSave', el => el.classList.contains('show'))) && (await rp.textContent('#mgmtSaveBtn')).trim() === '再保存', 'E22 保存後も「再保存」できるよう保存バーを残す');
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
  await rp.emulateMedia({ media: 'screen' });
  // 「<!--<script>」を含む手入力名でも、再出力したファイルの埋め込みデータが壊れない
  await rp.selectOption(rbox('final') + ' select', '__free');
  await rp.fill(rbox('final') + ' input', 'Y<!--<script>');
  await rp.click(rbox('final') + ' [data-act="stamp"]');
  await wait(150);
  const [dl22c] = await Promise.all([rp.waitForEvent('download'), rp.click('#mgmtSaveBtn')]);
  const file22c = path.join(OUT, 'saved-stamps-3.html');
  await dl22c.saveAs(file22c);
  const html22c = fs.readFileSync(file22c, 'utf8');
  const rec22c = parseRecord(html22c);
  expect(!!rec22c && rec22c.management.final.name === 'Y<!--<script>' && html22c.includes('id="recruit-mgmt-config"') && !/<!--/.test(html22c.match(/id="recruit-record">([\s\S]*?)<\/script>/)[1]), 'E22 特殊な文字列の手入力名でも再出力ファイルを読み戻せる');
  // 未保存の押印があるまま閉じようとすると確認が出る
  await rp.click(rbox('final') + ' [data-act="unstamp"]');
  await wait(100);
  rpDialogs.length = 0;
  await rp.goto('about:blank').catch(() => {});
  await wait(200);
  expect(rpDialogs.includes('beforeunload'), 'E22 未保存の押印があるとページを離れる前に確認: ' + JSON.stringify(rpDialogs));
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

  // =====================================================================
  // E23 申し送りシート（A4 1枚）: アプリ Step2 とレポートの印刷モード
  // =====================================================================
  console.log('\n== E23 申し送りシート（A4 1枚） ==');
  const pdfPages = pdfPagesOf;
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', path.join(OUT, 'saved.html'));   // E1 の応募者（留意点 13 件・外国籍・深夜帯）＝最も重いケース
  await wait(500);
  await navStep(2);
  expect(!!(await page.$('[data-action="print-handoff"]')) && !(await visible('.sheet-head')), 'E23 Step2 に「申し送りシート（A4）」ボタン・画面ではシート見出しは非表示');
  const nItems = await page.$$eval('#handoffItems .handoff-item', els => els.length);
  await st(() => window.RecruitApp.prepareHandoffSheet(true));
  expect(await st(() => document.body.classList.contains('print-handoff') && document.getElementById('handoffItems').classList.contains('sheet-2col')), 'E23 留意点 ' + nItems + ' 件 → 2 段組み');
  await page.emulateMedia({ media: 'print' });
  const hiddenE23 = await st(() => ['.summary', '#contribPreview', '.actions', '#mgmtCard .stamp-ctl', '#handoffItems .progress'].map(s => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'none'; }));
  expect(hiddenE23.every(d => d === 'none') && (await st(() => getComputedStyle(document.querySelector('.sheet-head')).display)) === 'flex', 'E23 印刷時はサマリー・貢献度・操作部品を隠しシート見出しを出す: ' + hiddenE23.join(','));
  const pdfApp = path.join(OUT, 'sheet-app.pdf');
  await page.pdf({ path: pdfApp, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const pagesApp = pdfPages(pdfApp);
  expect(pagesApp === 1 || pagesApp === -1, 'E23 アプリの申し送りシートは A4 1 枚: ' + (pagesApp === -1 ? 'pdfinfo なし（省略）' : pagesApp + ' ページ'));
  await page.emulateMedia({ media: 'screen' });
  await st(() => window.RecruitApp.prepareHandoffSheet(false));
  expect(await st(() => !document.body.classList.contains('print-handoff') && !document.getElementById('handoffItems').classList.contains('sheet-2col')), 'E23 印刷後に通常表示へ戻る');
  // レポート側
  const savedE23 = await saveRecord('saved-sheet.html');
  expect(savedE23.html.includes('id="rtPrintSheet"') && savedE23.html.includes('section class="sec" data-sec="handoff"') && savedE23.html.includes('data-sec="mgmt"'), 'E23 レポートに印刷ツールバーと data-sec');
  const rp23 = await ctx.newPage();
  rp23.on('dialog', d => d.accept());
  await rp23.goto('file://' + savedE23.file);
  await wait(300);
  expect(await rp23.$eval('.rtool', el => getComputedStyle(el).display) !== 'none' && await rp23.$eval('.sheet-title', el => getComputedStyle(el).display) === 'none', 'E23 レポート画面ではツールバー表示・シート見出し非表示');
  await rp23.evaluate(() => window.__prepareHandoffSheet(true));
  await rp23.emulateMedia({ media: 'print' });
  const shownSecs = await rp23.$$eval('section.sec', els => els.filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.sec));
  expect(shownSecs.join(',') === 'pre,comment,handoff,interview,mgmt' && await rp23.$eval('.dash', el => getComputedStyle(el).display) === 'none' && await rp23.$eval('.rtool', el => getComputedStyle(el).display) === 'none', 'E23 レポートのシート印刷は 応募時・コメント・留意点・面接で確認・押印 だけ: ' + shownSecs.join(','));
  const pdfRep = path.join(OUT, 'sheet-report.pdf');
  await rp23.pdf({ path: pdfRep, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const pagesRep = pdfPages(pdfRep);
  expect(pagesRep === 1 || pagesRep === -1, 'E23 レポートの申し送りシートは A4 1 枚: ' + (pagesRep === -1 ? 'pdfinfo なし（省略）' : pagesRep + ' ページ'));
  await rp23.evaluate(() => window.__prepareHandoffSheet(false));
  expect(await rp23.evaluate(() => !document.body.classList.contains('print-handoff')), 'E23 レポート側も印刷後に通常表示へ戻る');
  await rp23.close();

  // =====================================================================
  // E24 全体印刷の改ページ（大きなブロックで次ページへ送られて空白が出ないこと）
  // =====================================================================
  console.log('\n== E24 全体印刷 ==');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', path.join(OUT, 'saved.html'));
  await wait(500);
  await page.emulateMedia({ media: 'print' });
  const pdfFullApp = path.join(OUT, 'full-app.pdf');
  await page.pdf({ path: pdfFullApp, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const pFullApp = pdfPages(pdfFullApp);
  expect(pFullApp === -1 || pFullApp <= 5, 'E24 アプリ Step4 の全体印刷は 5 ページ以内（旧 7 ページ）: ' + (pFullApp === -1 ? 'pdfinfo なし' : pFullApp));
  await page.emulateMedia({ media: 'screen' });
  const rp24 = await ctx.newPage();
  await rp24.goto('file://' + savedE23.file);
  await wait(300);
  await rp24.emulateMedia({ media: 'print' });
  const pdfFullRep = path.join(OUT, 'full-report.pdf');
  await rp24.pdf({ path: pdfFullRep, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const pFullRep = pdfPages(pdfFullRep);
  expect(pFullRep === -1 || pFullRep <= 6, 'E24 レポートの全体印刷は 6 ページ以内（「面接チェックリスト」節が増えた分 +1）: ' + (pFullRep === -1 ? 'pdfinfo なし' : pFullRep));
  expect(await rp24.$eval('#clSheet', el => getComputedStyle(el).display) === 'none' && await rp24.$eval('section.sec[data-sec="checklist"]', el => getComputedStyle(el).display) !== 'none', 'E24 全体印刷では A4 報告（#clSheet）を出さず、本文の「面接チェックリスト」節を出す');
  expect(await rp24.$eval('section.sec[data-sec="judgment"] .result', el => getComputedStyle(el).breakInside) === 'auto', 'E24 判定カードは途中で改ページ可（丸ごと次ページへ送らない）');
  await rp24.close();

  // =====================================================================
  // E25 面接チェックリスト: Step3 で入力 → 判定 → Step4 → 保存 → 読込 → レポート（docs/SPEC-checklist.md 7-2）
  // =====================================================================
  console.log('\n== E25 面接チェックリスト ==');
  const sortedJson = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((o, kk) => { o[kk] = v[kk]; return o; }, {}) : v);
  const clModeNow = () => st(() => { const s = window.RecruitApp.state; return window.RecruitRules.interviewModel(s.profile, s.scores, s.checklist).mode; });
  const MEMO25 = '長期希望。土日は毎週どちらか可。</script><!--x';
  await fresh();
  await fillBasic({ name: '面接 花子', age: 20, category: '大学2年生', graduationDate: '2029-03', shifts: [['sat', '10:00', '18:00'], ['sun', '10:00', '18:00']], daysMin: 2, daysMax: 3, workPeriod: 'long', preFill: false });
  await toHandoff();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  const order25 = await st(() => {
    const ids = ['clHeader', 'clNav', 'cl-conditions', 'shiftConfirm', 'cl-continuity', 'cl-job', 'cl-teamwork', 'cl-reverse', 'clOverall'];
    const els = ids.map(id => document.getElementById(id));
    if (els.some(e => !e)) return 'missing: ' + ids.filter((id, i) => !els[i]).join(',');
    for (let i = 1; i < els.length; i++) if (!(els[i - 1].compareDocumentPosition(els[i]) & Node.DOCUMENT_POSITION_FOLLOWING)) return 'order: ' + ids[i - 1] + ' > ' + ids[i];
    return 'ok';
  });
  expect(order25 === 'ok', 'E25 Step3 の並び（ヘッダー → 目次 → ① → 面接で確認する項目 → ② → ③ → ④ → ⑤ → 総合判断）: ' + order25);
  const heads25 = await st(() => ({
    pages: document.querySelectorAll('.cl-page-head').length,
    c1: document.querySelector('#cl-conditions .card-head').textContent,
    c5: document.querySelector('#cl-reverse .card-head').textContent,
    total: (document.getElementById('clMinutesTotal') || {}).textContent || '',
    q: (document.querySelector('#cl-conditions .cl-questions') || {}).textContent || ''
  }));
  expect(heads25.pages === 2 && heads25.c1.includes('①') && heads25.c1.includes('勤務条件') && heads25.c1.includes('10分') && heads25.c5.includes('最大10分') && heads25.total.includes('合計 41分') && heads25.q.includes('歌舞伎町ですので'),
    'E25 ページ見出し 2・「① 勤務条件 10分」「最大10分」「合計 41分」・質問文を表示: ' + JSON.stringify({ pages: heads25.pages, total: heads25.total }));
  expect(await page.inputValue('#clDate') === '2026-10-10', 'E25 面接日は今日（2026-10-10）が自動で入る');
  expect(await st(() => Array.from(document.querySelectorAll('#clManagers option')).some(o => o.value === '笹川 晴央')), 'E25 担当の候補（datalist）に名簿の「笹川 晴央」');
  // 「面接で確認する項目」を入力（深夜帯○・タクシー 2,500円）→ ヘッダーのタクシーが自動で追従
  await busyAllFull();
  await page.selectOption('#shiftConfirm [data-field="weekendFreq"]', 'every_both');
  await pick('holidayWork', 'ok');
  await pick('allNight.availability', 'ng');
  await pick('lateNight.availability', 'ok');
  await wait(150);
  await page.selectOption('#shiftConfirm [data-field="lateNight.returnMethod"]', 'taxi');
  await page.fill('#shiftConfirm [data-field="lateNight.taxiFare"]', '2500');
  await pick('sideJob', 'no');
  await pick('continueAfterGraduation', 'undecided');
  await wait(200);
  expect((await page.textContent('#clTaxiAuto')).includes('可・2,500円'), 'E25 タクシー可否・料金を応募情報から自動表示: ' + await page.textContent('#clTaxiAuto'));
  // 消極属性は 2026-10-13 に削除（docs/SPEC-script-mode.md 12 章）: 詳細モードのヘッダーにも出さない
  await setCl('values.term', 'short');
  await wait(150);
  expect(!(await page.$('#clNeg-short, .cl-negs, [data-cl^="header.negatives"]')) && !(await page.textContent('#clHeader')).includes('消極属性'), 'E25 詳細モードのヘッダーに消極属性（自動・該当・該当しない）が無い');
  expect((await page.textContent('.cl-field[data-item="term"] .cl-auto-hint')).includes('異なります'), 'E25 短期／長期の希望が応募情報（長期）と食い違うと hint');
  await setCl('values.term', 'long');
  // 「すべて説明した」は詳細モードの【説明】【合否連絡】にも出る
  expect(await st(() => document.querySelectorAll('#stepContent .cl-block-explain [data-action="explain-all"], #stepContent .cl-block-notify [data-action="explain-all"]').length) === 5,
    'E25 詳細モードの【説明】4 ブロック・【合否連絡】に「すべて説明した」');
  // 必須条件「週3日」一致・指定繁忙期は未確認のまま・① の説明 2 件・② の説明 3 件・契約開始日・メモ・○4 △3 ＋採用
  await setCl('values.must_weekly', 'match');
  await page.click('label.cl-check[data-item="ex_fare"]');
  await page.click('label.cl-check[data-item="ex_hours"]');
  // 台本 PPTX どおり、シフト提出・電話連絡・欠勤連絡は ② 継続性・報連相の【説明】（必須条件ではない）
  expect(await st(() => ['ex_submit', 'ex_phone', 'ex_absence'].every(id => !!document.querySelector('#cl-continuity label.cl-check[data-item="' + id + '"]')) && document.querySelectorAll('#cl-conditions .cl-must-row').length === 2),
    'E25 ① の必須条件は 2 件・② に【説明】（提出・電話・欠勤）');
  for (const id of ['ex_submit', 'ex_phone', 'ex_absence']) await page.click('label.cl-check[data-item="' + id + '"]');
  await page.fill('[data-cl="values.start_date"]', '2026-11-01');
  await wait(150);
  expect((await page.textContent('[data-auto-field="first_end"]')).includes('2026-12'), 'E25 契約開始日 2026-11-01 → 初回契約終了の自動表示 2026-12: ' + await page.textContent('[data-auto-field="first_end"]'));
  await page.fill('textarea[data-cl="notes.conditions_q"]', MEMO25);
  await page.fill('textarea[data-cl="notes.continuity_q"]', '前職は飲食で2年。退職理由は引っ越し。');
  await page.fill('input[data-cl="notes.rt_concrete"]', '曜日と時間を具体的に回答');
  await rateAll('good', { must: false });
  for (const id of ['rt_manner', 'rt_turnover', 'rt_team']) await setCl('values.' + id, 'fair');
  await page.fill('textarea[data-note="interview"]', '受け答えが丁寧。');
  await wait(200);
  const sc25 = await st(() => ({ t: document.getElementById('clScoreTotal').textContent, p: document.getElementById('clScorePct').textContent, n: document.getElementById('clNavScore').textContent }));
  expect(sc25.t === '13' && sc25.p === '81.3%' && sc25.n.includes('13/16'), 'E25 ○4 △3 ＋採用 → 13 / 16点・81.3%・目次の「13/16」: ' + JSON.stringify(sc25));
  expect((await page.textContent('#clState-conditions')).includes('入力中'), 'E25 ① は必須条件が未確認のあいだ「入力中」');
  await shot('28-step3-checklist.png', true);
  await navStep(2);
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await judge();
  const t25 = await toastText();
  j = await judgment();
  expect(await step() === 4 && t25.includes('必須条件に未確認が 1 件'), 'E25 必須条件の未確認は警告して判定に進む: ' + t25);
  expect(j.total === 13 && j.max === 16 && j.pct === 81.3, 'E25 判定の面接評価 13/16（81.3%）');
  expect((await page.textContent('#judgeWarnings')).includes('必須条件に未確認が1件'), 'E25 判定の確認事項に必須条件の未確認');
  const bd25 = await st(() => ({ must: document.querySelectorAll('#clBreakdown .cl-must-table tr').length, unk: document.querySelectorAll('#clBreakdown .cl-must-table tr.must-unknown').length,
    rate: document.querySelectorAll('#clBreakdown .cl-rate-table tbody tr[data-item]').length, text: document.getElementById('clBreakdown').textContent }));
  expect(bd25.must === 2 && bd25.unk === 1 && bd25.rate === 8 && bd25.text.includes('13/16'), 'E25 Step4「面接チェックリストの結果」: 必須条件 2 行（未確認 1）・確認点 7 行＋総合判断・合計 13/16: ' + JSON.stringify({ must: bd25.must, unk: bd25.unk, rate: bd25.rate }));
  expect((await page.textContent('#sumMust')).includes('未確認 1'), 'E25 右サマリーの必須条件「未確認 1」');
  await navStep(3);
  await setCl('values.must_busy', 'match');
  await judge();
  j = await judgment();
  expect(await step() === 4 && (await page.textContent('#sumMust')).includes('すべて一致'), 'E25 必須条件をすべて一致にして再判定 → 「すべて一致」');
  expect((await page.textContent('#judgeStrengths')).includes('面接での強み（○ の確認点）') && (await page.textContent('#judgeStrengths')).includes('報連相できるか'), 'E25 強みに ○ の確認点');
  await shot('30-step4-checklist.png', true);
  const saved25 = await saveRecord('saved-checklist.html');
  const r25 = saved25.rec;
  expect(r25.checklist.values.rt_team === 'fair' && r25.checklistDef && r25.checklistDef.version === '2026-10-08' && Object.keys(r25.scores).length === 0, 'E25 保存レコードに checklist（rt_team=fair）・checklistDef（2026-10-08）・scores は空');
  expect(r25.checklist.notes.conditions_q === MEMO25, 'E25 閉じタグ・コメント開始を含むメモも埋め込みデータで一致');
  expect(saved25.html.includes('data-sec="checklist"') && saved25.html.includes('cl-s-no">①</span><span class="cl-s-title">勤務条件') && saved25.html.includes('前職は飲食で2年') && !saved25.html.includes('面接評価（旧形式') && saved25.html.includes('id="rtPrintChecklist"'),
    'E25 レポートに「面接チェックリスト」節（① 勤務条件・メモ）と A4 報告のボタン・旧形式の節なし');
  // 節（画面表示部分。印刷専用の #clSheet を除く）にも台本ヘッダー（面接日・担当・タクシー・応募した求人）とページ題名・確認点の補足が出る（消極属性は削除）
  const sec25 = await (async () => {
    const pg = await browser.newPage();
    await pg.setContent(saved25.html, { waitUntil: 'load' });
    const t = await pg.$eval('section.sec[data-sec="checklist"]', el => el.textContent);
    await pg.close();
    return t;
  })();
  expect(['面接日', '2026/10/10', '担当', 'タクシー可否・料金', '可・2,500円', '応募した求人', '必須条件一致・継続性', '人物確認・逆質問', '「大丈夫です」のみ連呼は特に要注意。'].every(k => sec25.includes(k)) && !sec25.includes('消極属性') && !sec25.includes('朝～12時のみ'),
    'E25 レポートの節に面接日・担当・タクシー・応募した求人・ページ題名・確認点の補足（消極属性なし）: ' + ['面接日', '2026/10/10', '担当', 'タクシー可否・料金', '可・2,500円', '応募した求人', '必須条件一致・継続性', '人物確認・逆質問', '「大丈夫です」のみ連呼は特に要注意。'].filter(k => !sec25.includes(k)).join('・'));
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved25.file);
  await wait(500);
  const l25 = await st(() => window.RecruitApp.state.checklist);
  expect(sortedJson(l25) === sortedJson(r25.checklist), 'E25 読込で state.checklist が保存時と一致');
  j = await judgment();
  expect(j.result === r25.judgment.result && j.total === r25.judgment.total && j.cellKey === r25.judgment.matrix.cellKey, 'E25 読込後の再判定が保存時と一致: ' + j.result);
  await navStep(3);
  expect(await page.$eval('[data-action="cl-set"][data-cl="values.rt_team"][data-value="fair"]', el => el.classList.contains('active')) && await page.inputValue('[data-cl="values.start_date"]') === '2026-11-01' && await page.inputValue('textarea[data-cl="notes.conditions_q"]') === MEMO25,
    'E25 読込で Step3 のボタン・契約開始日・メモが復元');

  // =====================================================================
  // E26 必須条件ゲート（不一致 → 不採用推奨。台本の「5へ」）
  // =====================================================================
  console.log('\n== E26 必須条件ゲート ==');
  await setCl('values.must_busy', 'mismatch');
  await wait(150);
  expect((await page.textContent('#clMustAlertText')).includes('⑤ 逆質問へ進み') && await visible('#clMustAlert [data-action="cl-jump"]'), 'E26 不採用推奨の設定では「⑤ 逆質問へ進み…終了」と案内');
  expect(await visible('#clMustAlert') && (await page.textContent('#clState-conditions')).includes('不一致あり'), 'E26 不一致で #clMustAlert と「不一致あり」');
  expect(await st(() => ['continuity', 'job', 'teamwork'].every(id => document.getElementById('cl-' + id).classList.contains('cl-skippable')) && !document.getElementById('cl-reverse').classList.contains('cl-skippable')), 'E26 ②〜④ に「省略可」（⑤ は対象外）');
  await page.click('#clMustAlert [data-action="cl-jump"]');
  await wait(900);
  expect(await st(() => { const r = document.getElementById('cl-reverse').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }), 'E26 「⑤ 逆質問へ」で ⑤ へ移動');
  await shot('29-step3-must-ng.png');
  await judge();
  j = await judgment();
  expect(await step() === 4 && j.result === 'reject' && j.adjustments[0] === 'must_conditions', 'E26 必須条件の不一致で不採用推奨（must_conditions）: ' + j.result + '/' + j.adjustments.join(','));
  expect((await page.textContent('.result-body')).includes('必須条件（' + '指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆）' + '）が一致しないため') && !(await page.textContent('.result-body')).includes('点数上は') && (await page.textContent('.adjust-box')).includes('→ 最終: 不採用推奨'), 'E26 本文は必須条件の不一致を理由にし、調整の経緯を出す');
  expect((await page.textContent('#sumMust')).includes('不一致 1') && (await page.textContent('.result-card .result-must')).includes('不一致 1'), 'E26 右サマリーと結果カードに「不一致 1」');
  // 設定で「上長最終判断要」に → 確認点・総合判断は必須のまま → 入力すれば review
  await toView('settings');
  await page.selectOption('[data-bind="checklist.mustFailResult"]', 'review');
  await saveSettings();
  await toView('judge');
  await navStep(3);
  // review では ②〜④ も評価が必要: 「省略可」「⑤へ進み終了」の案内を出さない
  const rv26 = await st(() => ({ text: document.getElementById('clMustAlertText').textContent, skip: document.querySelectorAll('.cl-sec.cl-skippable').length,
    jump: !document.querySelector('#clMustAlert [data-action="cl-jump"]').classList.contains('hidden') }));
  expect(rv26.text.includes('確認点も評価') && rv26.text.includes('上長最終判断要以下') && !rv26.text.includes('終了してください') && rv26.skip === 0 && !rv26.jump, 'E26 mustFailResult=review の案内（省略可・⑤へ を出さない）: ' + JSON.stringify(rv26));
  await page.click('[data-action="cl-set"][data-cl="values.rt_team"][data-value="fair"]');   // 押下中を再度押すと未入力に戻る
  await wait(100);
  await judge();
  expect(await step() === 3 && (await toastText()).includes('未入力の確認点'), 'E26 mustFailResult=review では確認点の未入力で止まる');
  await setCl('values.rt_team', 'fair');
  await judge();
  j = await judgment();
  expect(await step() === 4 && j.result === 'review' && j.adjustments.includes('must_conditions'), 'E26 mustFailResult=review → 上長最終判断要: ' + j.result);
  await toView('settings');
  await page.selectOption('[data-bind="checklist.mustFailResult"]', 'reject');
  await saveSettings();
  await toView('judge');
  // 新しい応募者（シフト条件は未確定のまま）: 必須条件 1 件不一致なら確認点・総合判断・シフト条件が空でも判定へ進める
  await page.click('#btnNew');
  await wait(200);
  await fillBasic({ name: '打切 次郎', age: 22, category: 'フリーター', shifts: [['mon', '10:00', '15:00']], daysMin: 1, daysMax: 2, workPeriod: 'long', preFill: false });
  await toHandoff();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await setCl('values.must_weekly', 'mismatch');
  await judge();
  j = await judgment();
  const w26 = await st(() => (window.RecruitApp.state.judgment.warnings || []).join(' / '));
  // 確認点が空（0 点）なので点数上も不採用推奨。それでも結論の理由は必須条件（adjustments・本文・A4 の判定サマリー。SPEC-checklist 3-3）
  expect(await step() === 4 && j.result === 'reject' && j.adjustments[0] === 'must_conditions' && w26.indexOf('必須条件が一致しないため（土日を含む週3日以上') === 0 && !w26.includes('未入力の確認点'), 'E26 不一致なら確認点・総合判断・シフト条件が未入力でも判定へ進み不採用推奨（理由は先頭）: ' + (j && j.result) + ' / ' + w26);
  const b26 = await st(() => ({ body: document.querySelector('.result-body').textContent, adj: (document.querySelector('.adjust-box') || {}).textContent || '', note: (document.querySelector('.result-card .result-note') || {}).textContent || '' }));
  expect(b26.body.includes('必須条件（土日を含む週3日以上、5時間以上）が一致しないため') && !b26.body.includes('0%') && b26.adj.includes('不採用推奨（固定）') && !b26.note, 'E26 打ち切りでも本文・調整欄の理由は必須条件（面接評価 0% を理由にしない）: ' + JSON.stringify(b26));
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  const adj26 = await st(() => (document.querySelector('#clSheet .cl-adj') || {}).textContent || '');
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  expect(adj26.includes('必須条件が一致しないため'), 'E26 A4 の判定サマリーにも必須条件の理由: ' + adj26);

  // =====================================================================
  // E27 A4「面接チェックリスト報告」（アプリ・レポート）
  // =====================================================================
  console.log('\n== E27 面接チェックリスト報告（A4） ==');
  const pdfPages27 = pdfPagesOf;
  const pagesOk = (n) => n === -1 || (n >= 1 && n <= 2);
  const pagesTxt = (n) => n === -1 ? 'pdfinfo なし（省略）' : n + ' ページ';
  const pdfText27 = pdfTextOf;
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved25.file);
  await wait(500);
  expect(await visible('.result-card') && !!(await page.$('#stepContent [data-action="print-checklist"]')), 'E27 Step4 に「面接チェックリスト報告（A4）」');
  await navStep(3);
  expect(await visible('#clPrintBtn'), 'E27 Step3 に「面接チェックリスト報告（A4）」');
  expect(await st(() => getComputedStyle(document.getElementById('clSheet')).display) === 'none' && !!(await st(() => document.getElementById('clSheetCss'))), 'E27 画面では #clSheet は非表示・CSS は 1 回だけ注入');
  // 標準のサンプル（E25）
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  await page.emulateMedia({ media: 'print' });
  const p27 = await st(() => ({
    app: getComputedStyle(document.querySelector('.app')).display, sheet: getComputedStyle(document.querySelector('#clSheet .cl-sheet')).display,
    pages: document.querySelectorAll('#clSheet .cl-page').length, judge: (document.querySelector('#clSheet .cl-judge') || {}).textContent || '',
    stamps: document.querySelectorAll('#clSheet .cl-stamps .stamp-box').length, head: (document.querySelector('#clSheet .cl-sheet-head') || {}).textContent || ''
  }));
  expect(p27.app === 'none' && p27.sheet === 'block' && p27.pages === 2 && p27.stamps === 3, 'E27 印刷時はアプリを隠し、報告（2 ページ構成・押印 3 枠）を出す: ' + JSON.stringify({ app: p27.app, sheet: p27.sheet, pages: p27.pages, stamps: p27.stamps }));
  expect(p27.judge.includes(r25.judgment.title) && p27.head.includes('面接 花子') && p27.head.includes('2026/10/10') && p27.head.includes('可・2,500円'), 'E27 ヘッダー（応募者・面接日・タクシー）と判定サマリーの結果');
  // ヘッダーのチップ（タクシー可否・料金／応募した求人／勤務期間…）は印刷でも見える（Step3 の目次 .cl-chip の印刷規則に巻き込まれない）
  const chips27 = await st(() => Array.from(document.querySelectorAll('#clSheet .cl-sh-chips > *')).map(el => getComputedStyle(el).display));
  expect(chips27.length >= 3 && chips27.every(d => d !== 'none') && !p27.head.includes('消極属性'), 'E27 印刷時もヘッダーのチップ（タクシー・求人など。消極属性なし）を表示: ' + chips27.join(','));
  const pdf27a = path.join(OUT, 'checklist-app.pdf');
  await page.pdf({ path: pdf27a, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const n27a = pdfPages27(pdf27a);
  expect(pagesOk(n27a), 'E27 アプリの面接チェックリスト報告は A4 1〜2 枚: ' + pagesTxt(n27a));
  const txt27a = pdfText27(pdf27a);
  expect(txt27a === null || (txt27a.includes('タクシー可否') && !txt27a.includes('消極属性')), 'E27 アプリの報告 PDF にタクシー可否（消極属性なし）: ' + (txt27a === null ? 'pdftotext なし（省略）' : 'ok'));
  await page.emulateMedia({ media: 'screen' });
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  expect(await st(() => !document.body.classList.contains('print-checklist') && document.getElementById('clSheet').innerHTML === ''), 'E27 印刷後に通常表示へ戻る（#clSheet は空）');
  // 重いサンプル: 全メモ 150 字・確認点メモ 40 字・説明すべて☑・面接所見 200 字・総合判断「保留」
  const L = (n) => 'あいうえおかきくけこさしすせそ'.repeat(Math.ceil(n / 15)).slice(0, n);
  for (const sel of await page.$$eval('#stepContent textarea[data-cl]', els => els.map(e => e.getAttribute('data-cl')))) await page.fill('textarea[data-cl="' + sel + '"]', L(150));
  for (const sel of await page.$$eval('#stepContent input.cl-note[data-cl]', els => els.map(e => e.getAttribute('data-cl')))) await page.fill('input[data-cl="' + sel + '"]', L(40));
  for (const lb of await page.$$('#stepContent label.cl-check')) if (!(await lb.evaluate(el => el.querySelector('input').checked))) await lb.click();
  await page.fill('textarea[data-note="interview"]', L(200));
  await setCl('overall', 'hold');
  await judge();
  j = await judgment();
  expect(await step() === 4 && j.adjustments.includes('overall_hold'), 'E27 重いサンプル（総合判断 保留 → 調整あり）で判定: ' + j.result);
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  await page.emulateMedia({ media: 'print' });
  const pdf27b = path.join(OUT, 'checklist-app-heavy.pdf');
  await page.pdf({ path: pdf27b, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const n27b = pdfPages27(pdf27b);
  expect(pagesOk(n27b), 'E27 重いサンプルでもアプリの報告は A4 1〜2 枚: ' + pagesTxt(n27b));
  await page.emulateMedia({ media: 'screen' });
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  // レポート側（重いサンプル）
  const saved27 = await saveRecord('saved-checklist-heavy.html');
  const rp27 = await ctx.newPage();
  const rp27Err = [];
  rp27.on('pageerror', e => rp27Err.push(e.message));
  rp27.on('dialog', d => d.accept());
  await rp27.goto('file://' + saved27.file);
  await wait(300);
  expect(!!(await rp27.$('#rtPrintChecklist')) && await rp27.$eval('#clSheet', el => getComputedStyle(el).display) === 'none', 'E27 レポート: ツールバーに「面接チェックリスト報告（A4）」・画面では #clSheet 非表示');
  await rp27.selectOption('#mgmt .stamp-box[data-field-id="interviewer"] select', { label: '笹川 晴央（副支配人）' });
  await rp27.click('#mgmt .stamp-box[data-field-id="interviewer"] [data-act="stamp"]');
  await wait(150);
  await rp27.evaluate(() => window.__prepareChecklistSheet(true));
  await rp27.emulateMedia({ media: 'print' });
  const vis27 = await rp27.$$eval('.page > *', els => els.filter(el => getComputedStyle(el).display !== 'none').map(el => el.id || el.dataset.sec || el.className));
  expect(vis27.join(',') === 'clSheet,mgmt', 'E27 レポートの報告印刷で見えるのは #clSheet と押印の節だけ: ' + vis27.join(','));
  expect(await rp27.$eval('.rtool', el => getComputedStyle(el).display) === 'none' && await rp27.$eval('.dash', el => getComputedStyle(el).display) === 'none' && (await rp27.$$('section[data-sec="mgmt"] svg.hanko')).length === 1 && await rp27.$eval('section[data-sec="mgmt"] svg.hanko', el => getComputedStyle(el).display) !== 'none', 'E27 ツールバー・ダッシュボードは隠し、レポート上で押した印は出す');
  const pdf27c = path.join(OUT, 'checklist-report-heavy.pdf');
  await rp27.pdf({ path: pdf27c, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const n27c = pdfPages27(pdf27c);
  expect(pagesOk(n27c), 'E27 重いサンプルでもレポートの報告は A4 1〜2 枚: ' + pagesTxt(n27c));
  await rp27.emulateMedia({ media: 'screen' });
  await rp27.evaluate(() => window.__prepareChecklistSheet(false));
  expect(await rp27.evaluate(() => !document.body.classList.contains('print-checklist')), 'E27 レポート側も印刷後に通常表示へ戻る');
  // 申し送りシートの印刷には #clSheet を混ぜない
  await rp27.evaluate(() => window.__prepareHandoffSheet(true));
  await rp27.emulateMedia({ media: 'print' });
  const vis27h = await rp27.$$eval('section.sec', els => els.filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.sec));
  const hs27 = vis27h.join(',');
  expect(await rp27.$eval('#clSheet', el => getComputedStyle(el).display) === 'none' && (hs27 === 'pre,comment,handoff,interview,mgmt' || hs27 === 'pre,handoff,interview,mgmt'), 'E27 申し送りシートの印刷に #clSheet・チェックリスト節は出さない: ' + hs27);
  await rp27.emulateMedia({ media: 'screen' });
  await rp27.evaluate(() => window.__prepareHandoffSheet(false));
  // 標準のサンプル（E25 の保存ファイル）もレポートで 1〜2 枚
  await rp27.goto('file://' + saved25.file);
  await wait(300);
  await rp27.evaluate(() => window.__prepareChecklistSheet(true));
  await rp27.emulateMedia({ media: 'print' });
  const pdf27d = path.join(OUT, 'checklist-report.pdf');
  await rp27.pdf({ path: pdf27d, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const n27d = pdfPages27(pdf27d);
  expect(pagesOk(n27d), 'E27 レポートの報告（標準のサンプル）は A4 1〜2 枚: ' + pagesTxt(n27d));
  expect(rp27Err.length === 0, 'E27 レポートのページエラーなし: ' + (rp27Err.join(' / ') || 'none'));
  await rp27.close();
  // 2 ページ目（③〜⑤・所見・判定・押印）だけが重いサンプル: 全体で 2 枚に収まるなら 2 枚目の強制改ページを外す
  await navStep(3);
  for (const sel of await page.$$eval('#stepContent textarea[data-cl]', els => els.map(e => e.getAttribute('data-cl')))) await page.fill('textarea[data-cl="' + sel + '"]', L(40));
  await page.fill('textarea[data-cl="notes.teamwork_q"]', L(800));
  await page.fill('textarea[data-note="interview"]', L(1200));
  await wait(150);
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  await page.emulateMedia({ media: 'print' });
  const fit27 = await st(() => document.querySelector('#clSheet .cl-sheet').classList.contains('cl-fit'));
  const pdf27e = path.join(OUT, 'checklist-app-page2-heavy.pdf');
  await page.pdf({ path: pdf27e, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const n27e = pdfPages27(pdf27e);
  expect(fit27 && pagesOk(n27e), 'E27 2 ページ目が重いサンプル（④ 回答 800 字・所見 1,200 字）も A4 1〜2 枚（.cl-fit）: ' + pagesTxt(n27e) + ' fit=' + fit27);
  await page.emulateMedia({ media: 'screen' });
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  // 設定「質問文も載せる」を OFF にすると報告に質問文を出さない
  await toView('settings');
  await page.click('label:has([data-bind="checklist.print.showQuestions"])');
  await wait(100);
  await saveSettings();
  await toView('judge');
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  const q27 = await st(() => ({ qs: document.querySelectorAll('#clSheet .cl-qs').length, memo: document.querySelectorAll('#clSheet .cl-memo').length }));
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  expect(q27.qs === 0 && q27.memo > 0, 'E27 print.showQuestions=OFF で質問文を出さない（メモは出す）: ' + JSON.stringify(q27));
  await toView('settings');
  await page.click('label:has([data-bind="checklist.print.showQuestions"])');
  await wait(100);
  await saveSettings();
  await toView('judge');

  // =====================================================================
  // E28 設定で台本を変更（文言・項目の追加・確認点の削除・既定に戻す・壊れた設定）
  // =====================================================================
  console.log('\n== E28 設定で台本を変更 ==');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved25.file);
  await wait(500);
  await toView('settings');
  await page.locator('#s-checklist').scrollIntoViewIfNeeded();
  await shot('31-settings-checklist.png');
  await page.fill('[data-bind="checklist.sections[0].blocks[0].items[1].label"]', '指定繁忙期間すべて出勤可（年末年始・GW・お盆）');
  await wait(100);
  await page.click('details.s-cl-sec[data-sec-id="job"] > summary');
  await wait(100);
  await page.click('details.s-cl-sec[data-sec-id="job"] [data-action="cl-item-add"][data-block="0"]');
  await wait(100);
  await saveSettings();
  expect((await storedProfile()).checklist.sections[0].blocks[0].items[1].label === '指定繁忙期間すべて出勤可（年末年始・GW・お盆）', 'E28 文言を変えて保存');
  await toView('judge');
  await navStep(3);
  expect((await page.textContent('.cl-must-row[data-item="must_busy"] .cl-label')) === '指定繁忙期間すべて出勤可（年末年始・GW・お盆）' && (await page.$$('#cl-job label.cl-check')).length === 5, 'E28 Step3 に新しい文言と追加した説明の行');
  await setCl('values.must_busy', 'mismatch');
  await judge();
  expect(await st(() => (window.RecruitApp.state.judgment.adjustments[0] || {}).reason || '').then(r => r.includes('すべて出勤可')), 'E28 判定の理由文に新しい文言');
  await navStep(3);
  await setCl('values.must_busy', 'match');
  // ① の確認点「最低限の話し方、敬語が可能か」を削除 → 満点 14
  await toView('settings');
  await page.click('.s-cl-item[data-item-id="rt_manner"] [data-action="cl-item-del"]');
  await wait(150);
  await saveSettings();
  expect((await page.textContent('#s-checklist')).includes('満点 14 点') || (await page.textContent('#s-checklist')).includes('満点 14点'), 'E28 設定の満点表示 14 点');
  expect((await page.textContent('#view-settings')).includes('現在の満点 14点'), 'E28 2軸判定の節「現在の満点 14点」');
  await toView('judge');
  expect((await page.textContent('#sumInterview')).includes('/ 14点'), 'E28 右サマリーの満点 14 点');
  // ④ に確認点を追加 → 満点 16
  await toView('settings');
  await page.click('details.s-cl-sec[data-sec-id="teamwork"] > summary');
  await wait(100);
  await page.click('details.s-cl-sec[data-sec-id="teamwork"] [data-action="cl-item-add"][data-block="2"]');
  await wait(100);
  await saveSettings();
  await toView('judge');
  expect((await page.textContent('#sumInterview')).includes('/ 16点'), 'E28 ④ に確認点を追加すると満点 16 点');
  // 保存時と確認点が違うファイルを読むと toast で知らせる。保存済みレポートは保存時の文言のまま
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved25.file);
  await wait(500);
  expect((await toastText()).includes('確認点が異なります（追加 1・削除 1）'), 'E28 読込 toast「確認点が異なります（追加 1・削除 1）」: ' + await toastText());
  expect(saved25.html.includes('指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆）') && !saved25.html.includes('すべて出勤可'), 'E28 保存済みレポートは保存時の文言のまま');
  // 空の文言は保存できない
  await toView('settings');
  await page.fill('[data-bind="checklist.sections[0].blocks[0].items[0].label"]', '');
  await wait(100);
  await saveSettings();
  const t28 = await st(() => { const el = document.getElementById('toast'); return el.className + '|' + el.textContent; });
  expect(/\berror\b/.test(t28) && (await storedProfile()).checklist.sections[0].blocks[0].items[0].label === '土日を含む週3日以上、5時間以上', 'E28 空の文言は検証エラーで保存されない: ' + t28);
  await page.click('#view-settings [data-action="discard"]');
  await wait(200);
  // 既定の台本に戻す
  await page.click('#view-settings [data-action="cl-default"]');
  await wait(150);
  await saveSettings();
  const sp28 = await storedProfile();
  expect(sp28.checklist.sections[0].blocks[0].items[1].label === '指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆）' && await st(() => { const s = window.RecruitApp.state; return window.RecruitRules.interviewModel(s.profile, {}, window.RecruitRules.emptyChecklist()).max; }) === 16, 'E28 「既定の台本に戻す」で既定の文言・満点 16');
  await toView('judge');
  // 壊れた checklist を持つプロファイル → 既定の台本で動く
  const errs28 = errors.length;
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1')); p.checklist.sections = 'x'; p.checklist.mustFailResult = 'xxx'; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); });
  await page.reload();
  await wait(300);
  const c28 = await st(() => { const c = window.RecruitApp.state.profile.checklist; return { n: c.sections.length, m: c.mustFailResult }; });
  expect(c28.n === 5 && c28.m === 'reject' && errors.length === errs28, 'E28 壊れた checklist（sections:"x"・mustFailResult:"xxx"）は既定の台本・reject に戻る: ' + JSON.stringify(c28));

  // =====================================================================
  // E29 旧データ・他劇場・狭い画面・ダークモード
  // =====================================================================
  console.log('\n== E29 旧データ・他劇場・狭い画面 ==');
  await fresh();
  await page.setInputFiles('#fileInput', path.join(FIX, 'v1-record.html'));
  await wait(500);
  const j29 = await st(() => { const x = window.RecruitApp.state.judgment; return { mode: x.interviewMode, total: x.total, max: x.max }; });
  expect(j29.mode === 'legacy' && j29.total === 39 && j29.max === 50, 'E29 v1 ファイルは旧方式で再判定（39/50）: ' + JSON.stringify(j29));
  await navStep(3);
  expect(await visible('#legacyScores') && (await page.textContent('#legacyScores')).includes('39 / 50') && (await page.textContent('#legacyScoresMsg')).includes('判定はこの点数で行います') && !(await visible('#clPrintBtn')), 'E29 Step3 に旧形式の点数（39 / 50）・旧形式では報告ボタンを出さない');
  await setCl('values.rt_concrete', 'good');
  await wait(150);
  expect(await clModeNow() === 'checklist' && (await page.textContent('#legacyScoresMsg')).includes('切り替わりました') && await visible('#clPrintBtn'), 'E29 確認点を 1 つ入れるとチェックリスト方式に切り替わる（報告ボタンも出る）');
  // チェックリスト導入前の v2 レコード（checklist キーなし）
  const oldRec29 = JSON.parse(JSON.stringify(r25));
  delete oldRec29.checklist;
  delete oldRec29.checklistDef;
  const oldHtml29 = saved25.html.replace(/(<script type="application\/json" id="recruit-record">)[\s\S]*?(<\/script>)/, (m, a, b) => a + JSON.stringify(oldRec29).replace(/[<>&]/g, c => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4)) + b);
  const oldFile29 = path.join(OUT, 'saved-v2-nochecklist.html');
  fs.writeFileSync(oldFile29, oldHtml29);
  await page.click('#btnNew');
  await wait(200);
  const errs29 = errors.length;
  await page.setInputFiles('#fileInput', oldFile29);
  await wait(500);
  expect(errors.length === errs29 && await st(() => window.RecruitApp.state.applicant.name) === '面接 花子' && await st(() => Object.keys(window.RecruitApp.state.checklist.values).length) === 0, 'E29 checklist の無い旧 v2 レコードもエラーなく読める（回答は空）');
  // 他劇場の旧プロファイル → 既定の台本を補って toast
  await toView('settings');
  await page.setInputFiles('#profileFileInput', path.join(FIX, 'v1-profile-other.json'));
  await wait(400);
  expect((await toastText()).includes('面接チェックリスト（新宿の台本 2026-10-08 版）を既定で追加'), 'E29 他劇場の旧プロファイルには既定の台本を補い toast で知らせる');
  await saveSettings();
  await ensureFullMode();
  await toView('judge');
  await page.setInputFiles('#fileInput', saved25.file);
  await wait(500);
  await navStep(3);
  expect(!!(await page.$('#cl-conditions')) && !!(await page.$('#cl-reverse')), 'E29 他劇場でも Step3 に既定の台本');
  // 390px 幅の Step3 で横スクロールなし
  await page.setViewportSize({ width: 390, height: 900 });
  await wait(300);
  const ov29 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(ov29 <= 1, 'E29 390px 幅の Step3（面接チェックリスト）で横スクロールなし: ' + ov29);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  await page.click('#btnTheme');
  await wait(200);
  await shot('32-step3-checklist-dark.png');
  await page.click('#btnTheme');
  await wait(100);

  // =====================================================================
  // E30 報告書表示・最終合否スタンプ: アプリで面接 → 面接対応者の押印 → 保存 → 保存 HTML で合否＋最終確認 → 押印を保存 → 読込（docs/SPEC-report.md 8-2）
  // =====================================================================
  console.log('\n== E30 報告書表示・最終合否 ==');
  const pdfPages30 = pdfPagesOf;
  const pdfText30 = pdfTextOf;
  const shownIn = (pg, sel) => pg.evaluate(s => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0 && (!el.checkVisibility || el.checkVisibility()); }, sel);
  const txtIn = (pg, sel) => pg.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);
  const dispIn = (pg, sel) => pg.evaluate(s => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'missing'; }, sel);
  const SASA = '笹川 晴央（副支配人）';
  const newReportPage = async (errs) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.clock.setFixedTime(NOW);
    return p;
  };
  // 1. 入力 → 判定
  await fresh();
  await fillBasic({ name: '合否 太郎', age: 20, category: '大学2年生', graduationDate: '2029-03', shifts: [['sat', '10:00', '18:00'], ['sun', '10:00', '18:00']], daysMin: 2, daysMax: 3, workPeriod: 'long', preFill: false });
  await toHandoff();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await busyAllFull();
  await page.selectOption('#shiftConfirm [data-field="weekendFreq"]', 'every_both');
  await pick('holidayWork', 'ok');
  await pick('allNight.availability', 'ng');
  await pick('lateNight.availability', 'ok');
  await wait(150);
  await page.selectOption('#shiftConfirm [data-field="lateNight.returnMethod"]', 'taxi');
  await page.fill('#shiftConfirm [data-field="lateNight.taxiFare"]', '2500');
  await pick('sideJob', 'no');
  await pick('continueAfterGraduation', 'undecided');
  await wait(200);
  await rateAll('good');
  await navStep(2);
  await checkAll();
  await page.click('[data-action="to-step"][data-step="3"]');
  await wait(300);
  await judge();
  const j30 = await judgment();
  expect(await step() === 4 && !!(await page.$('#decisionCard')) && (await page.textContent('#decisionCard')).includes('未押印') && !(await page.$('#decisionCard svg.verdict-stamp')) && !(await page.$('#sumDecision')),
    'E30 判定後の Step4 に「最終合否」カード（未押印）: ' + (j30 && j30.result));
  // 2. Step4 で面接対応者に押印 → 保存
  await page.selectOption('#mgmtCard .stamp-box[data-field-id="interviewer"] select', { label: SASA });
  await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
  await wait(150);
  const saved30 = await saveRecord('saved-decision.html');
  expect(saved30.rec.decision == null && saved30.rec.management.interviewer && saved30.rec.management.interviewer.name === '笹川 晴央' &&
    saved30.html.includes('<body class="view-report has-cl" data-filename="応募者_合否_太郎_2026-10-10.html">') && saved30.html.includes('id="clPaper"') && saved30.html.includes('id="decision"') && saved30.html.includes('id="rtViewReport"'),
    'E30 保存（面接対応者の押印あり・合否なし）: body.view-report.has-cl・紙プレビュー・最終合否パネル');
  // 3. 保存 HTML を file:// で開く → 報告書表示
  const rp30Err = [];
  const rp30 = await newReportPage(rp30Err);
  await rp30.goto('file://' + saved30.file);
  await rp30.waitForTimeout(300);
  const v30 = await rp30.evaluate(() => ({ report: document.body.classList.contains('view-report'), full: document.body.classList.contains('view-full') }));
  expect(v30.report && !v30.full && await shownIn(rp30, '#clPaper .cl-sheet') && !(await shownIn(rp30, '.rh')) && !(await shownIn(rp30, 'section.sec[data-sec="judgment"]')) &&
    await dispIn(rp30, '.dash') === 'none' && await shownIn(rp30, '#decision') && await shownIn(rp30, '#mgmt') && await dispIn(rp30, '#clSheet') === 'none',
    'E30 保存HTMLは報告書表示で開く（紙の報告シート・最終合否・押印だけ。ヘッダー・ダッシュ・判定の節は隠し、印刷用 #clSheet は非表示のまま）');
  const paper30 = await rp30.evaluate(() => { const p = document.getElementById('clPaper'), cs = getComputedStyle(p); return { bg: cs.backgroundColor, shadow: cs.boxShadow, w: document.querySelector('#clPaper .cl-sheet').getBoundingClientRect().width }; });
  expect(paper30.bg === 'rgb(255, 255, 255)' && paper30.shadow !== 'none' && Math.abs(paper30.w - 718.1) <= 2, 'E30 紙プレビュー（白地・影・シート幅 190mm）: ' + JSON.stringify(paper30));
  // 4〜5. 表示切替
  await rp30.click('#rtViewFull');
  await rp30.waitForTimeout(150);
  const vf30 = await rp30.evaluate(() => ({ report: document.body.classList.contains('view-report'), full: document.body.classList.contains('view-full'), pressed: document.getElementById('rtViewFull').getAttribute('aria-pressed') }));
  expect(vf30.full && !vf30.report && vf30.pressed === 'true' && await shownIn(rp30, '.rh') && await shownIn(rp30, '.dash') && await shownIn(rp30, 'section.sec[data-sec="judgment"]') && !(await shownIn(rp30, '#clPaper')) && await shownIn(rp30, '#decision'),
    'E30 「詳細」で全体レポート（ヘッダー・ダッシュ・全節）に切り替わる');
  await rp30.click('#rtViewReport');
  await rp30.waitForTimeout(150);
  expect(await rp30.evaluate(() => document.body.classList.contains('view-report') && !document.body.classList.contains('view-full')) && await shownIn(rp30, '#clPaper .cl-sheet'), 'E30 「報告書」で報告書表示に戻る');
  // 6. 最終合否: 担当者（笹川）を選んで「採用」
  await rp30.selectOption('#decision select', { label: SASA });
  await rp30.click('#decision [data-act="decide"][data-value="hire"]');
  await rp30.waitForTimeout(200);
  const d30 = await rp30.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const pv = q('#clPaper .cl-decision'), ps = q('#clPaper .cl-decision svg.verdict-stamp'), sh = q('#clSheet .cl-decision');
    return { paperTxt: pv ? pv.textContent : '', paperSvg: !!ps, aria: ps ? ps.getAttribute('aria-label') : '', stroke: ps && ps.querySelector('rect') ? ps.querySelector('rect').getAttribute('stroke') : '',
      sheetId: sh ? sh.id : '', sheetSvg: !!(sh && sh.querySelector('svg.verdict-stamp')), panelSvg: !!q('#decision svg.verdict-stamp'), meta: (q('#decision .dec-meta') || {}).textContent || '', head: !!q('#rhDecision svg.verdict-stamp') };
  });
  expect(d30.paperSvg && d30.paperTxt.includes('採用') && d30.paperTxt.includes('笹川 晴央') && d30.aria.indexOf('採用') === 0 && d30.stroke === '#c8232c' && d30.sheetId === 'clDecision' && d30.sheetSvg && d30.panelSvg && d30.meta.includes('採用・笹川 晴央') && d30.head,
    'E30 「採用」で報告シート（紙・印刷用）・最終合否パネル・ヘッダーに朱の採用スタンプ: ' + JSON.stringify(Object.assign({}, d30, { paperTxt: undefined })));
  expect(!!(await rp30.$('#mgmt .stamp-box[data-field-id="final"] svg.hanko')) && (await txtIn(rp30, '#mgmt .stamp-box[data-field-id="final"] .stamp-meta')).includes('笹川 晴央') &&
    await rp30.$eval('#mgmtSave', el => el.classList.contains('show')) && await dispIn(rp30, '#decision [data-act="undecide"]') !== 'none',
    'E30 最終確認欄に同じ担当者の電子印が自動で押され、保存バーと「取消」が出る');
  expect(await rp30.evaluate(() => document.body.getAttribute('data-filename')) === '応募者_合否_太郎_2026-10-10_採用.html', 'E30 ファイル名（data-filename）が _採用.html になる');
  await rp30.screenshot({ path: path.join(OUT, '33-report-view.png'), fullPage: true });
  // 7. 「詳細」のまま「押印を保存」（保存時の表示に関係なく報告書表示で開くことの確認を兼ねる）
  await rp30.click('#rtViewFull');
  await rp30.waitForTimeout(100);
  await rp30.screenshot({ path: path.join(OUT, '35-report-full.png'), fullPage: true });
  const [dl30] = await Promise.all([rp30.waitForEvent('download'), rp30.click('#mgmtSaveBtn')]);
  const file30b = path.join(OUT, 'saved-decision-hire.html');
  await dl30.saveAs(file30b);
  const html30b = fs.readFileSync(file30b, 'utf8');
  const rec30b = parseRecord(html30b);
  expect((dl30.suggestedFilename() === '応募者_合否_太郎_2026-10-10_採用.html' || dl30.suggestedFilename() === 'download') && html30b.includes('data-filename="応募者_合否_太郎_2026-10-10_採用.html"'),
    'E30 押印を保存したファイル名は 基本名_採用.html: ' + dl30.suggestedFilename());
  const dec30b = rec30b.decision || {};
  expect(dec30b.result === 'hire' && dec30b.label === '採用' && dec30b.date === '2026.10.10' && typeof dec30b.at === 'string' && !!dec30b.at &&
    JSON.stringify(dec30b.by) === JSON.stringify({ name: '笹川 晴央', short: '笹川', title: '副支配人' }) &&
    rec30b.management.final && rec30b.management.final.name === '笹川 晴央' && rec30b.management.interviewer.name === '笹川 晴央' && rec30b.schemaVersion === 2,
    'E30 再出力ファイルの埋め込みデータに decision（採用・笹川・2026.10.10）と最終確認の押印: ' + JSON.stringify(dec30b));
  // 8. 再出力ファイルを開く
  await rp30.goto('file://' + file30b);
  await rp30.waitForTimeout(300);
  const re30 = await rp30.evaluate(() => { const s = document.querySelector('#decision select'); return { report: document.body.classList.contains('view-report'), full: document.body.classList.contains('view-full'),
    show: document.getElementById('mgmtSave').classList.contains('show'), sel: s && s.selectedOptions[0] ? s.selectedOptions[0].textContent : '' }; });
  expect(re30.report && !re30.full && !!(await rp30.$('#clPaper .cl-decision svg.verdict-stamp')) && !!(await rp30.$('#mgmt .stamp-box[data-field-id="final"] svg.hanko')) && !re30.show && re30.sel.includes('笹川 晴央'),
    'E30 再出力ファイルは報告書表示で開き、合否・押印が残る（担当者は最終確認の人を初期選択）: ' + JSON.stringify(re30));
  // 9. 面接チェックリスト報告の印刷（A4 1〜2 枚）
  await rp30.evaluate(() => window.__prepareChecklistSheet(true));
  await rp30.emulateMedia({ media: 'print' });
  const vis30 = await rp30.$$eval('.page > *', els => els.filter(el => getComputedStyle(el).display !== 'none').map(el => el.id || el.dataset.sec || el.className));
  const pr30 = await rp30.evaluate(() => { const sv = document.querySelector('#clSheet .cl-decision svg.verdict-stamp'); return { svg: sv ? getComputedStyle(sv).display : 'missing', panel: getComputedStyle(document.getElementById('decision')).display }; });
  const pdf30 = path.join(OUT, 'checklist-report-decision.pdf');
  await rp30.pdf({ path: pdf30, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const n30 = pdfPages30(pdf30);
  const t30 = pdfText30(pdf30);
  expect(vis30.join(',') === 'clSheet,mgmt' && pr30.svg !== 'none' && pr30.svg !== 'missing' && pr30.panel === 'none' && (n30 === -1 || (n30 >= 1 && n30 <= 2)) && (t30 === null || (t30.includes('最終合否') && t30.includes('笹川晴央'))),
    'E30 面接チェックリスト報告の印刷（A4 1〜2 枚）に合否スタンプ・パネルは出さない: ' + JSON.stringify({ vis: vis30.join(','), svg: pr30.svg, panel: pr30.panel, pages: n30 }));
  // media を 'screen' に固定すると page.pdf も screen で描く（印刷用 CSS が効かない）ため、エミュレートを解除して戻す
  await rp30.emulateMedia({ media: null });
  await rp30.evaluate(() => window.__prepareChecklistSheet(false));
  // 10. 報告書表示のまま印刷（Ctrl+P 相当。page.pdf が beforeprint / afterprint を発火する）
  const pdf30v = path.join(OUT, 'report-view-print.pdf');
  await rp30.pdf({ path: pdf30v, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await rp30.waitForTimeout(100);
  const n30v = pdfPages30(pdf30v);
  const t30v = pdfText30(pdf30v);
  const after30 = await rp30.evaluate(() => ({ pc: document.body.classList.contains('print-checklist'), report: document.body.classList.contains('view-report') }));
  expect((n30v === -1 || (n30v >= 1 && n30v <= 2)) && (t30v === null || t30v.includes('面接チェックリスト報告')) && !after30.pc && after30.report,
    'E30 報告書表示のまま印刷すると面接チェックリスト報告（A4 1〜2 枚）・印刷後は報告書表示に戻る: ' + JSON.stringify({ pages: n30v, after: after30 }));
  // 11. アプリの「読み込み」で引き継ぐ
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file30b);
  await wait(500);
  const s30 = await st(() => { const s = window.RecruitApp.state; return { step: s.step, d: s.decision, final: (s.management.final || {}).name }; });
  expect(s30.step === 4 && s30.d && s30.d.result === 'hire' && s30.d.by.name === '笹川 晴央' && s30.final === '笹川 晴央' &&
    (await txtIn(page, '#decisionCard')).includes('採用・笹川') && !!(await page.$('#decisionCard svg.verdict-stamp')) && (await txtIn(page, '#sumDecision')).includes('採用・笹川'),
    'E30 アプリの「読み込み」で Step4 の最終合否カードと右サマリーに「採用・笹川」');
  // 12. 再判定しても消えない
  await navStep(3);
  await judge();
  expect(await step() === 4 && await st(() => (window.RecruitApp.state.decision || {}).result) === 'hire', 'E30 再判定しても最終合否は消えない');
  // 13. 再保存
  const saved30c = await saveRecord('saved-decision-resave.html');
  const dc30 = saved30c.rec.decision || {};
  expect(dc30.result === 'hire' && (dc30.by || {}).name === '笹川 晴央' && dc30.date === '2026.10.10' && saved30c.html.includes('data-filename="応募者_合否_太郎_2026-10-10_採用.html"'),
    'E30 アプリで再保存しても decision が残り、ファイル名に _採用');
  await shot('36-step4-decision.png', true);
  expect(rp30Err.length === 0, 'E30 レポートのページエラー・console error なし: ' + (rp30Err.join(' / ') || 'none'));
  await rp30.close();

  // =====================================================================
  // E31 不採用・取消・チェックリスト無しの報告書表示・詳細の全体印刷・ダーク・画面幅・アプリ・設定（docs/SPEC-report.md 8-3）
  // =====================================================================
  console.log('\n== E31 不採用・取消・表示 ==');
  const rp31Err = [];
  const rp31 = await newReportPage(rp31Err);
  await rp31.goto('file://' + file30b);
  await rp31.waitForTimeout(300);
  const hanko31 = (await rp31.$$('#mgmt svg.hanko')).length;
  await rp31.selectOption('#decision select', { label: SASA });
  await rp31.click('#decision [data-act="decide"][data-value="reject"]');
  await rp31.waitForTimeout(200);
  const r31 = await rp31.evaluate(() => {
    const pv = document.querySelector('#clPaper .cl-decision'), sv = pv && pv.querySelector('svg.verdict-stamp');
    return { txt: pv ? pv.textContent : '', aria: sv ? sv.getAttribute('aria-label') : '', stroke: sv && sv.querySelector('rect') ? sv.querySelector('rect').getAttribute('stroke') : '',
      fn: document.body.getAttribute('data-filename'), pressed: document.querySelector('#decision [data-act="decide"][data-value="reject"]').getAttribute('aria-pressed') };
  });
  expect(r31.txt.includes('不採用') && r31.aria.indexOf('不採用') === 0 && r31.stroke === '#1f4e8c' && (await rp31.$$('#mgmt svg.hanko')).length === hanko31 && r31.fn === '応募者_合否_太郎_2026-10-10_不採用.html' && r31.pressed === 'true',
    'E31 「不採用」に切り替え（藍のスタンプ・最終確認の印は増えない・ファイル名の接尾辞を置き換え）: ' + JSON.stringify(r31));
  const note31 = (await shownIn(rp31, '#decision .dec-note')) && (await txtIn(rp31, '#decision .dec-note')).trim().length > 0;
  expect(note31 === (j30.result === 'recommend'), 'E31 判定（' + j30.result + '）と食い違う合否には注記を出す（止めない）: ' + note31);
  await rp31.click('#decision [data-act="undecide"]');
  await rp31.waitForTimeout(200);
  const u31 = await rp31.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return { paperSvg: !!q('#clPaper .cl-decision svg'), paperTxt: (q('#clPaper .cl-decision') || {}).textContent || '', sheetSvg: !!q('#clSheet .cl-decision svg'), panelSvg: !!q('#decision svg'),
      head: q('#rhDecision').innerHTML, undo: getComputedStyle(q('#decision [data-act="undecide"]')).display, fn: document.body.getAttribute('data-filename'), show: q('#mgmtSave').classList.contains('show') };
  });
  expect(!u31.paperSvg && u31.paperTxt.includes('未押印') && !u31.sheetSvg && !u31.panelSvg && u31.head === '' && u31.undo === 'none' && (await rp31.$$('#mgmt svg.hanko')).length === hanko31 && u31.fn === '応募者_合否_太郎_2026-10-10.html' && u31.show,
    'E31 「取消」で未押印に戻る（最終確認の印は残る・ファイル名の接尾辞も外れる）: ' + JSON.stringify(u31));
  const [dl31] = await Promise.all([rp31.waitForEvent('download'), rp31.click('#mgmtSaveBtn')]);
  const file31 = path.join(OUT, 'saved-decision-undone.html');
  await dl31.saveAs(file31);
  const html31 = fs.readFileSync(file31, 'utf8');
  const rec31 = parseRecord(html31);
  expect(rec31.decision === null && rec31.management.final && rec31.management.final.name === '笹川 晴央' && html31.includes('data-filename="応募者_合否_太郎_2026-10-10.html"'),
    'E31 取消して保存すると decision は null・最終確認の印は残る');
  // チェックリスト無しの記録（E22 の Step2 保存）
  await rp31.goto('file://' + savedE22.file);
  await rp31.waitForTimeout(300);
  const nc31 = await rp31.evaluate(() => ({ report: document.body.classList.contains('view-report'), hasCl: document.body.classList.contains('has-cl'),
    secs: Array.from(document.querySelectorAll('section.sec')).filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.sec).join(','),
    dash: getComputedStyle(document.querySelector('.dash')).display, paper: !!document.getElementById('clPaper') }));
  expect(nc31.report && !nc31.hasCl && (nc31.secs === 'pre,comment,handoff,interview,mgmt' || nc31.secs === 'pre,handoff,interview,mgmt') && nc31.dash === 'none' && !nc31.paper && await shownIn(rp31, '.rh') && await shownIn(rp31, '#decision'),
    'E31 チェックリスト無しの記録の報告書表示は申し送りシート相当（応募時・コメント・留意点・面接で確認・押印＋最終合否）: ' + JSON.stringify(nc31));
  await rp31.click('#rtViewFull');
  await rp31.waitForTimeout(150);
  const secsFull31 = await rp31.$$eval('section.sec', els => els.filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.sec));
  expect(secsFull31.includes('contrib') && secsFull31.includes('judgment') && await shownIn(rp31, '.dash'), 'E31 チェックリスト無しの記録も「詳細」で全節: ' + secsFull31.join(','));
  // 「詳細」表示から全体印刷（E23 の保存ファイル）
  await rp31.goto('file://' + savedE23.file);
  await rp31.waitForTimeout(300);
  await rp31.click('#rtViewFull');
  await rp31.waitForTimeout(150);
  await rp31.emulateMedia({ media: 'print' });
  const pdf31 = path.join(OUT, 'full-report-detail-view.pdf');
  await rp31.pdf({ path: pdf31, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const n31 = pdfPages30(pdf31);
  const full31 = { sheet: await dispIn(rp31, '#clSheet'), cl: await dispIn(rp31, 'section.sec[data-sec="checklist"]') };
  expect((n31 === -1 || (n31 >= 3 && n31 <= 6)) && full31.sheet === 'none' && full31.cl !== 'none', 'E31 「詳細」表示の印刷は全体レポート（3〜6 ページ・#clSheet なし）: ' + JSON.stringify(Object.assign({ pages: n31 }, full31)));
  await rp31.emulateMedia({ media: 'screen' });
  // ダークモードでも紙は白地
  await rp31.emulateMedia({ colorScheme: 'dark' });
  await rp31.goto('file://' + file30b);
  await rp31.waitForTimeout(300);
  const dk31 = await rp31.evaluate(() => ({ bg: getComputedStyle(document.getElementById('clPaper')).backgroundColor, color: getComputedStyle(document.querySelector('#clPaper .cl-sheet')).color }));
  expect(dk31.bg === 'rgb(255, 255, 255)' && dk31.color === 'rgb(17, 17, 17)' && await shownIn(rp31, '#clPaper .cl-decision svg.verdict-stamp'), 'E31 ダークモードでも紙プレビューは白地・黒字: ' + JSON.stringify(dk31));
  await rp31.screenshot({ path: path.join(OUT, '34-report-view-dark.png'), fullPage: true });
  await rp31.emulateMedia({ colorScheme: 'light' });
  // 画面幅
  for (const w of [1280, 1440]) {
    await rp31.setViewportSize({ width: w, height: 900 });
    await rp31.waitForTimeout(150);
    const fit = await rp31.evaluate(() => { const r = document.getElementById('clPaper').getBoundingClientRect(); return { ov: document.documentElement.scrollWidth - window.innerWidth, left: r.left, right: r.right, iw: window.innerWidth }; });
    expect(fit.ov <= 1 && fit.left >= 0 && fit.right <= fit.iw, 'E31 ' + w + 'px 幅で紙プレビューが画面内に収まる: ' + JSON.stringify(fit));
  }
  await rp31.setViewportSize({ width: 390, height: 900 });
  await rp31.waitForTimeout(200);
  const nw31 = await rp31.evaluate(() => { const w = document.querySelector('.paper-wrap'); return { ov: document.documentElement.scrollWidth - window.innerWidth, sw: w.scrollWidth, cw: w.clientWidth, ox: getComputedStyle(w).overflowX }; });
  expect(nw31.ov <= 1 && nw31.sw > nw31.cw && nw31.ox === 'auto', 'E31 390px 幅では紙プレビューだけ横スクロール（ページ全体は横スクロールしない）: ' + JSON.stringify(nw31));
  await rp31.screenshot({ path: path.join(OUT, '37-report-view-narrow.png'), fullPage: true });
  expect(rp31Err.length === 0, 'E31 レポートのページエラー・console error なし: ' + (rp31Err.join(' / ') || 'none'));
  await rp31.close();
  // アプリ Step4（E30 の再保存の後: 採用・最終確認は押印済み）
  await page.click('#decisionCard [data-action="undecide"]');
  await wait(150);
  expect(await st(() => window.RecruitApp.state.decision) === null && (await txtIn(page, '#decisionCard')).includes('未押印') && !(await page.$('#sumDecision')), 'E31 アプリの「取消」で未押印に戻る');
  await page.click('#mgmtCard .stamp-box[data-field-id="final"] [data-action="unstamp"]');
  await wait(150);
  await page.selectOption('#decisionManager', { label: SASA });
  await page.click('#decisionCard [data-action="decide"][data-value="reject"]');
  await wait(200);
  const a31 = await st(() => { const s = window.RecruitApp.state; return { d: s.decision, final: s.management.final || null, dirty: s.dirty }; });
  expect(a31.d && a31.d.result === 'reject' && a31.d.label === '不採用' && a31.d.by.name === '笹川 晴央' && a31.final && a31.final.name === '笹川 晴央' && a31.final.date === '2026.10.10' && a31.dirty === true &&
    !!(await page.$('#decisionCard svg.verdict-stamp')) && !!(await page.$('#mgmtCard .stamp-box[data-field-id="final"] svg.hanko')) && (await txtIn(page, '#sumDecision')).includes('不採用・笹川'),
    'E31 アプリ Step4 で「不採用」→ 未押印の最終確認欄にも自動で押印・右サマリーに「不採用・笹川」');
  // 設定
  await toView('settings');
  const set31 = await st(() => { const q = (p) => document.querySelector('[data-bind="management.decision.' + p + '"]'); return q('enabled') && {
    enabled: q('enabled').checked, label: q('label').value, hire: q('hireLabel').value, reject: q('rejectLabel').value, field: q('stampField').value, auto: q('autoStampFinal').checked, suffix: q('filenameSuffix').checked }; });
  expect(!!set31 && set31.enabled && set31.label === '最終合否' && set31.hire === '採用' && set31.reject === '不採用' && set31.field === 'final' && set31.auto && set31.suffix,
    'E31 設定「応募者の管理」に最終合否（有効・表示名・採用／不採用・押印欄と連動・ファイル名）: ' + JSON.stringify(set31));
  await page.click('label:has([data-bind="management.decision.enabled"])');
  await wait(100);
  await saveSettings();
  await toView('judge');
  expect(await step() === 4 && !(await page.$('#decisionCard')) && !(await page.$('#sumDecision')) && await st(() => (window.RecruitApp.state.decision || {}).result) === 'reject',
    'E31 最終合否を OFF にすると Step4 のカード・サマリーを出さない（記録は保持）');
  await toView('settings');
  await page.click('label:has([data-bind="management.decision.enabled"])');
  await wait(100);
  await saveSettings();
  await toView('judge');
  expect(!!(await page.$('#decisionCard svg.verdict-stamp')), 'E31 ON に戻すと Step4 のカードが戻る');

  // =====================================================================
  // E32 台本モード（既定）: 3 ステップ・Step① 応募者（docs/SPEC-script-mode.md 7-3）
  // =====================================================================
  console.log('\n== E32 台本モード（既定）: 3 ステップ・Step① 応募者 ==');
  const stepNav = () => page.$$eval('#stepNav li', els => els.map(e => [e.dataset.step, e.querySelector('.step-num').textContent, e.querySelector('.step-label').textContent]));
  const stepLabels = () => page.$$eval('#stepNav .step-label', els => els.map(e => e.textContent));
  const fillScript = async (o) => {
    await page.fill('[data-field="name"]', o.name);
    if (o.age) await page.fill('[data-field="age"]', String(o.age));
    if (o.gender) await page.selectOption('[data-field="gender"]', o.gender);
    if (o.category) await page.selectOption('[data-field="category"]', o.category);
    if (o.graduationDate) await page.fill('[data-field="graduationDate"]', o.graduationDate);
    if (o.posting) await setCl('header.posting', o.posting);
    if (o.taxi) await page.fill('[data-cl="header.taxi"]', o.taxi);
    if (o.interviewer) await page.selectOption('[data-cl="header.interviewer"]', o.interviewer);
    if (o.notes) await page.fill('[data-field="reviewerNotes"]', o.notes);
    await wait(100);
  };
  const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  // 台本モードのスクリーンショット（先頭までスクロールし、toast を隠してから全体を撮る）
  const sshot = async (name) => { await page.evaluate(() => { window.scrollTo(0, 0); const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }); await wait(250); await shot(name, true); };
  // 1. mode の無い保存済みの設定（既存ユーザー）
  await page.evaluate(() => { localStorage.clear(); const p = window.RecruitStorage.defaults(); delete p.mode; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); });
  await page.reload();
  await wait(300);
  const m32 = await st(() => window.RecruitApp.state.profile.mode);
  const t32 = await toastText();
  expect(m32 === 'script' && t32.includes('台本モード') && (await storedProfile()).mode === 'script', 'E32 mode の無い保存済みの設定は台本モードで開き、mode を書き込む（toast で案内）: ' + JSON.stringify({ m32, t32 }));
  // 2. 既定
  await freshScript();
  expect(await st(() => window.RecruitApp.state.profile.mode === 'script' && window.RecruitRules.isScriptMode(window.RecruitApp.state.profile)), 'E32 既定（設定なし）は台本モード');
  // 3. サイドバー
  const nav32 = await stepNav();
  expect(JSON.stringify(nav32) === JSON.stringify([['1', '1', '応募者'], ['3', '2', '面接チェックリスト'], ['4', '3', '報告書']]) && (await page.textContent('#stepSectionTitle')) === '手順',
    'E32 サイドバーは 3 ステップ（応募者／面接チェックリスト／報告書）・見出し「手順」: ' + JSON.stringify(nav32));
  const names32 = await page.evaluate(() => ({ nav: document.querySelector('.nav-item[data-view="judge"]').textContent.trim(), top: document.getElementById('topTitle').textContent }));
  expect(names32.nav.endsWith('報告書の作成') && !names32.nav.includes('応募者判定') && names32.top === '面接チェックリスト報告',
    'E32 台本モードの画面名: ナビ「報告書の作成」・トップバー「面接チェックリスト報告」: ' + JSON.stringify(names32));
  // 4. Step① の項目
  const f32 = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const iv = q('#saInterviewer');
    const notes = q('textarea[data-field="reviewerNotes"]');
    return {
      card: !!q('#scriptApplicantCard'), name: !!q('#scriptApplicantCard [data-field="name"][data-required]'), age: !!q('[data-field="age"]'),
      gender: !!q('select[data-field="gender"]'), category: !!q('select[data-field="category"]'),
      posting: document.querySelectorAll('#saPosting [data-action="cl-set"][data-cl="header.posting"]').length,
      noNeg: !q('#saNegatives') && !q('[data-cl^="header.negatives"]') && !q('#scriptApplicantCard').textContent.includes('消極属性'),
      taxi: !!q('#saTaxi[data-cl="header.taxi"]'), date: q('#saDate[data-cl="header.date"]') ? q('#saDate').value : null,
      ivOpts: iv ? Array.from(iv.options).map(o => o.value) : [], notes: notes ? notes.closest('.field').textContent.includes('メモ（任意）') && notes.rows === 2 : false
    };
  });
  expect(f32.card && f32.name && f32.age && f32.gender && f32.category && f32.posting === 2 && f32.noNeg && f32.taxi && f32.date === '2026-10-10' && f32.ivOpts.includes('笹川 晴央') && f32.notes,
    'E32 Step① に氏名（必須）・年齢・性別・区分・応募した求人・タクシー可否・料金・面接日（今日）・面接担当者（名簿）・メモ（任意・2 行）。消極属性は無い: ' + JSON.stringify(f32));
  // 1 枚のカード・3 行（docs/SPEC-script-mode.md 12 章）。説明文は冒頭の 1 行だけ・各入力の下の補足文なし
  const lay32 = await page.evaluate(() => {
    const card = document.getElementById('scriptApplicantCard');
    const rows = Array.from(card.querySelectorAll(':scope > .field-row'));
    const sel = (row) => Array.from(row.children).map(f => { const c = f.querySelector('[data-field], [data-cl], [id^="sa"]'); return f.id || (c ? (c.dataset.field || c.id) : ''); });
    const btns = Array.from(document.querySelectorAll('#saPosting .seg-btn')).map(b => b.textContent);
    return {
      cards: document.querySelectorAll('#stepContent .card').length, rows: rows.length, r: rows.map(sel),
      lead: Array.from(card.querySelectorAll('.card-head p')).map(e => e.textContent), hints: card.querySelectorAll('.hint').length, subs: card.querySelectorAll('h3.sub').length,
      ivTitle: (document.getElementById('saInterviewer').title || '').includes('応募者の管理（押印）'), taxiPh: document.getElementById('saTaxi').placeholder,
      btns, postLabel: (document.querySelector('#saPosting > label') || {}).textContent
    };
  });
  expect(lay32.cards === 1 && lay32.rows === 3 && JSON.stringify(lay32.r) === JSON.stringify([['name', 'age', 'gender', 'category', 'grp-graduation'], ['saDate', 'saInterviewer', 'saPosting'], ['saTaxi', 'reviewerNotes']]) &&
    JSON.stringify(lay32.lead) === JSON.stringify(['氏名だけ必須です。あとは分かる範囲で入力してください。']) && lay32.hints === 0 && lay32.subs === 0 && lay32.ivTitle && lay32.taxiPh === '例: 可・2,500円' &&
    JSON.stringify(lay32.btns) === JSON.stringify(['通常', '短期']) && lay32.postLabel === '応募した求人',
    'E32 Step① は 1 枚・3 行（氏名・年齢・性別・区分〔卒業予定〕／面接日・面接担当者・求人〔通常・短期〕／タクシー・メモ）・説明は冒頭 1 行・補足文なし（名簿の案内は title）: ' + JSON.stringify(lay32));
  // 5. 詳細項目なし
  const absent32 = [];
  for (const sel of ['[data-field="workDays"]', '[data-field="anyDay"]', '[data-field="shifts.mon.start"]', '[data-field="daysMin"]', '[data-field="daysMax"]', '[data-field="workPeriod"]', '[data-field="commuteMethod"]',
    '[data-field="nearestStation"]', '[data-field="sideJob"]', '[data-field="foreign.isForeign"]', '[data-field="vacation.gw"]', '[data-field="lateNight.availability"]', '[data-field="allNight.availability"]',
    '#preFill', '#notesCard', '[data-action="generate-handoff"]']) if (await page.$(sel)) absent32.push(sel);
  expect(absent32.length === 0, 'E32 Step① に詳細項目（曜日・時間帯・週日数・勤務期間・通勤・かけもち・外国籍・繁忙期・深夜帯・オールナイト・申し送り）が無い: ' + absent32.join(' '));
  // 6. 卒業予定年月
  await page.selectOption('[data-field="category"]', '大学2年生');
  await wait(100);
  const grad32a = await visible('#grp-graduation');
  await page.selectOption('[data-field="category"]', 'フリーター');
  await wait(100);
  const grad32b = await visible('#grp-graduation');
  expect(grad32a && !grad32b, 'E32 卒業予定年月は学生の区分のときだけ表示');
  await page.selectOption('[data-field="category"]', '大学2年生');
  await wait(100);
  const row32 = await page.evaluate(() => ['name', 'age', 'gender', 'category', 'graduationDate'].map(k => Math.round(document.querySelector('[data-field="' + k + '"]').getBoundingClientRect().top)));
  expect(row32.every(t => Math.abs(t - row32[0]) <= 2), 'E32 1440px では卒業予定年月も 1 行目（氏名・年齢・性別・区分と同じ行）の末尾: ' + row32.join(','));
  await page.selectOption('[data-field="category"]', '');
  await wait(100);
  // 7. 氏名が空
  await page.click('[data-action="script-next"]');
  await wait(300);
  expect(await step() === 1 && (await toastText()).includes('必須'), 'E32 氏名が空なら面接チェックリストへ進めない');
  // 8. 入力
  await fillScript({ name: '台本 花子', age: 20, gender: '女性', category: '大学2年生', graduationDate: '2029-03', posting: 'short', taxi: '可・2,500円', interviewer: '笹川 晴央', notes: '電話の受け答えが丁寧。' });
  const s32 = await st(() => { const s = window.RecruitApp.state; return { a: s.applicant, h: s.checklist.header }; });
  expect(s32.a.name === '台本 花子' && s32.a.age === '20' && s32.a.gender === '女性' && s32.a.category === '大学2年生' && s32.a.graduationDate === '2029-03' && s32.a.reviewerNotes === '電話の受け答えが丁寧。' &&
    s32.h.posting === 'short' && s32.h.negatives === undefined && s32.h.taxi === '可・2,500円' && s32.h.interviewer === '笹川 晴央' && s32.h.date === '2026-10-10',
    'E32 Step① の入力は applicant と checklist.header に入る: ' + JSON.stringify(s32.h));
  // 9. 右サマリー
  const sum32 = await page.textContent('#summaryPanel');
  expect(['台本 花子', '大学2年生', '20歳', '短期求人', '笹川 晴央'].every(t => sum32.includes(t)) && !['シフト貢献度', '留意点', '通勤', '消極属性', '短期希望', '朝～12時のみ'].some(t => sum32.includes(t)),
    'E32 右サマリー（台本モード）に氏名・属性・短期求人・担当。消極属性・貢献度・留意点・通勤は出さない');
  const sa32 = await page.evaluate(() => { const c = document.getElementById('sumApplicant'); return { kids: Array.from(c.children).filter(e => e.tagName !== 'H4').map(e => e.id || e.className), badges: Array.from(c.querySelectorAll('.badge')).map(b => b.textContent) }; });
  expect(JSON.stringify(sa32.kids) === JSON.stringify(['sum-name', 'sum-sub', 'sumDate', 'sumInterviewer']) && JSON.stringify(sa32.badges) === JSON.stringify(['短期求人']),
    'E32 右サマリーの「応募者」は 氏名・区分/年齢/性別・面接日・担当 の 4 行（チップは短期求人 1 つだけ）: ' + JSON.stringify(sa32));
  await setCl('header.posting', 'regular');
  await wait(100);
  const sa32b = await page.$$eval('#sumApplicant .badge', els => els.map(b => b.textContent));
  expect(sa32b.length === 0 && !(await page.textContent('#sumApplicant')).includes('通常求人'), 'E32 求人が通常なら右サマリーに求人のチップを出さない: ' + JSON.stringify(sa32b));
  await setCl('header.posting', 'short');
  await wait(100);
  // 1440px・1280px で 1 画面に収まる（スクロールなしで「面接チェックリストへ進む →」まで見える）
  const fit32 = [];
  for (const [w, h] of [[1440, 900], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(200);
    fit32.push(await page.evaluate(([w, h]) => { window.scrollTo(0, 0); const r = document.getElementById('saNext').getBoundingClientRect();
      const cardR = document.getElementById('scriptApplicantCard').getBoundingClientRect();
      const inCard = Array.from(document.querySelectorAll('#scriptApplicantCard input, #scriptApplicantCard select, #scriptApplicantCard textarea, #scriptApplicantCard .seg-btn')).every(el => { const b = el.getBoundingClientRect(); return b.left >= cardR.left - 1 && b.right <= cardR.right + 1; });
      return { w, bottom: Math.round(r.bottom), h: innerHeight, sy: window.scrollY, inCard }; }, [w, h]));
  }
  expect(fit32.every(x => x.bottom <= x.h && x.sy === 0 && x.inCard), 'E32 1440×900・1280×800 でスクロールなしに「面接チェックリストへ進む →」まで見え、入力欄はカードからはみ出さない: ' + JSON.stringify(fit32));
  // 性別のセレクトは PC 幅（卒業予定年月も出る学生の区分＝1 行目が最も詰まる状態）でも文言が切れない。未選択の文言は「選択」（「選択してください」は狭くて切れる）
  const gen32 = [];
  for (const [w, h] of [[1440, 900], [1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(150);
    gen32.push(await page.evaluate((w) => {
      const g = document.querySelector('select[data-field="gender"]'); const cs = getComputedStyle(g);
      const sp = document.createElement('span'); sp.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + cs.font; document.body.appendChild(sp);
      const tw = Math.max.apply(null, Array.from(g.options).map(o => { sp.textContent = o.text; return sp.getBoundingClientRect().width; })); sp.remove();
      // 文字の領域 = 幅 − 枠 − 左右の余白（右は ▼ の領域。Chromium の ▼ は最大 24px として見積もる）
      const room = g.getBoundingClientRect().width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - Math.max(parseFloat(cs.paddingRight), 24);
      const grad = document.getElementById('grp-graduation'); const name = document.querySelector('[data-field="name"]');
      return { w, width: Math.round(g.getBoundingClientRect().width), text: Math.round(tw), room: Math.round(room), ph: g.options[0].text,
        oneRow: !!grad && grad.offsetParent !== null && Math.abs(grad.getBoundingClientRect().top - name.closest('.field').getBoundingClientRect().top) <= 2 };
    }, w));
  }
  expect(gen32.every(x => x.ph === '選択' && x.text <= x.room) && gen32.find(x => x.w === 1440).oneRow,
    'E32 性別のセレクトは 1440・1366・1280px（学生の区分）でも文言（選択／男性／女性／回答しない）が切れない幅: ' + JSON.stringify(gen32));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  // 10. 390px
  await page.setViewportSize({ width: 390, height: 900 });
  await wait(300);
  const ov32 = await overflowX();
  const col32 = await page.evaluate(() => ['name', 'age', 'gender', 'category'].map(k => Math.round(document.querySelector('[data-field="' + k + '"]').closest('.field').getBoundingClientRect().left)));
  expect(ov32 <= 1 && col32.every(x => x === col32[0]), 'E32 390px 幅の Step① は 1 列・横スクロールなし: ' + ov32 + ' ' + col32.join(','));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  await sshot('40-script-step1.png');
  // 11. 面接チェックリストへ
  await page.click('[data-action="script-next"]');
  await wait(400);
  expect(await step() === 3, 'E32 「面接チェックリストへ進む」で面接チェックリスト（内部キー 3）へ');

  // =====================================================================
  // E33 台本モード: 面接チェックリスト → 報告書（判定）
  // =====================================================================
  console.log('\n== E33 台本モード: 面接チェックリスト → 報告書 ==');
  const has33 = {};
  for (const sel of ['#cl-conditions', '#cl-continuity', '#cl-job', '#cl-teamwork', '#cl-reverse', '#clOverall', '#shiftConfirm', '#unresolvedAlert', '.cl-group-label']) has33[sel] = !!(await page.$(sel));
  expect(has33['#cl-conditions'] && has33['#cl-continuity'] && has33['#cl-job'] && has33['#cl-teamwork'] && has33['#cl-reverse'] && has33['#clOverall'] && !has33['#shiftConfirm'] && !has33['#unresolvedAlert'] && !has33['.cl-group-label'],
    'E33 Step② は ①〜⑤ と総合判断だけ（「面接で確認する項目」・未確認の留意点は出さない）: ' + JSON.stringify(has33));
  const hd33 = await page.textContent('#clHeader');
  expect(['台本 花子', '大学2年生', '20歳', '短期求人', '可・2,500円', '笹川 晴央', '2026/10/10', '応募者を編集'].every(t => hd33.includes(t)) && !hd33.includes('自動') && !(await page.$('#clHeader input, #clHeader select')),
    'E33 #clHeader の属性は Step① の入力から（読み取り専用・自動の表示なし）');
  // 1 行に圧縮（氏名・区分・年齢・求人・タクシー・面接日・担当 のチップと「応募者を編集」だけ。題名・説明文・目安時間・消極属性は出さない。docs/SPEC-script-mode.md 12 章）
  const hl33 = await page.evaluate(() => {
    const hd = document.getElementById('clHeader');
    const kids = Array.from(document.querySelectorAll('#clHeaderAttrs > *'));
    const mids = kids.map(e => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
    return { attrs: Array.from(document.querySelectorAll('#clHeaderAttrs .cl-attr')).map(e => e.dataset.attr), mids, h: Math.round(hd.getBoundingClientRect().height),
      h2: !!hd.querySelector('h2'), min: !!document.getElementById('clMinutesTotal'), edit: !!hd.querySelector('[data-action="to-step"][data-step="1"]') };
  });
  expect(JSON.stringify(hl33.attrs) === JSON.stringify(['name', 'category', 'age', 'posting', 'taxi', 'date', 'interviewer']) && Math.max(...hl33.mids) - Math.min(...hl33.mids) <= 4 && hl33.h <= 60 &&
    !hl33.h2 && !hl33.min && hl33.edit && !['消極属性', '短期希望', '朝～12時のみ', '目安', '台本の順に確認し'].some(t => hd33.includes(t)),
    'E33 #clHeader は 1 行（氏名・区分・年齢・求人・タクシー・面接日・担当＋応募者を編集。題名・説明文・目安・消極属性なし）: ' + JSON.stringify(hl33));
  // 本文が狭い 1366px・1280px でもチップは 1 行（チップを一段詰め、「応募者を編集」はカード上端の枠線上・右に出してチップの行から外す）
  const hn33 = [];
  for (const [w, h] of [[1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(150);
    hn33.push(await page.evaluate((w) => {
      const hd = document.getElementById('clHeader'); hd.scrollIntoView({ block: 'center' }); const cr = hd.getBoundingClientRect();
      const chips = Array.from(hd.querySelectorAll('.cl-attr')).map(e => e.getBoundingClientRect());
      const mids = chips.map(r => r.top + r.height / 2);
      const ed = hd.querySelector('.cl-head-edit'); const er = ed.getBoundingClientRect();
      const hit = document.elementFromPoint(er.left + er.width / 2, er.top + er.height / 2);
      return { w, h: Math.round(cr.height), spread: Math.round(Math.max(...mids) - Math.min(...mids)), label: hd.querySelector('[data-attr="date"]').textContent,
        edit: ed.textContent, editIn: er.width > 0 && er.left >= cr.left && er.right <= cr.right && er.top >= cr.top - 12 && er.bottom <= cr.bottom,
        noOverlap: chips.every(r => r.right <= er.left || r.left >= er.right || r.bottom <= er.top || r.top >= er.bottom), clickable: !!hit && (hit === ed || ed.contains(hit)) };
    }, w));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(150);
  expect(hn33.every(x => x.h <= 60 && x.spread <= 4 && x.edit === '応募者を編集' && x.editIn && x.noOverlap && x.clickable && x.label === '2026/10/10'),
    'E33 1366px・1280px でも #clHeader のチップは 1 行（面接日はラベルなしの日付）・「応募者を編集」はカードの右上でチップと重ならず押せる: ' + JSON.stringify(hn33));
  // 「すべて説明した」（docs/SPEC-script-mode.md 12 章）。求人が短期なので「※短期求人のみ」も付く
  const ea33 = await page.$$eval('#stepContent [data-action="explain-all"]', els => els.map(e => e.dataset.block + ':' + e.textContent));
  expect(JSON.stringify(ea33) === JSON.stringify(['conditions_explain:すべて説明した', 'continuity_explain:すべて説明した', 'job_explain:すべて説明した', 'teamwork_explain:すべて説明した', 'reverse_notify:すべて説明した']),
    'E33 【説明】4 ブロックと⑤【合否連絡】の見出しの右に「すべて説明した」: ' + JSON.stringify(ea33));
  const exVals = (ids) => st(ids => { const v = window.RecruitApp.state.checklist.values; return ids.map(id => v[id] === true); }, ids);
  const exUi = (ids) => st(ids => ids.map(id => { const l = document.querySelector('label.cl-check[data-item="' + id + '"]'); return !!l && l.classList.contains('on') && l.querySelector('input').checked; }), ids);
  const EX1 = ['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch'];
  const exAll = (blk) => page.click('[data-action="explain-all"][data-block="' + blk + '"]').then(() => wait(120));
  const exTxt = (blk) => page.textContent('[data-action="explain-all"][data-block="' + blk + '"]');
  await exAll('conditions_explain');
  const ea33a = { v: await exVals(EX1), ui: await exUi(EX1), t: await exTxt('conditions_explain'), other: await exVals(['ex_submit']) };
  expect(ea33a.v.every(Boolean) && ea33a.ui.every(Boolean) && ea33a.t === 'すべて外す' && !ea33a.other[0], 'E33 1 クリックで ① の【説明】を全部チェック（短期求人なので ※ の 2 項目も）・ボタンは「すべて外す」・他のブロックは触らない: ' + JSON.stringify(ea33a));
  await exAll('conditions_explain');
  const ea33b = { v: await exVals(EX1), ui: await exUi(EX1), t: await exTxt('conditions_explain') };
  expect(ea33b.v.every(x => !x) && ea33b.ui.every(x => !x) && ea33b.t === 'すべて説明した' && await st(() => !Object.keys(window.RecruitApp.state.checklist.values).some(k => k.indexOf('ex_') === 0)),
    'E33 もう一度押すと全部外す（values から消える）・ボタンは「すべて説明した」: ' + JSON.stringify(ea33b));
  for (const id of ['ex_submit', 'ex_phone', 'ex_absence']) await page.click('label.cl-check[data-item="' + id + '"]');
  await wait(120);
  expect(await exTxt('continuity_explain') === 'すべて外す', 'E33 個別に全部チェックしてもボタンは「すべて外す」に変わる');
  await exAll('continuity_explain');
  expect((await exVals(['ex_submit', 'ex_phone', 'ex_absence'])).every(x => !x), 'E33 「すべて外す」で ② の【説明】を全部外す');
  await exAll('reverse_notify');
  const nt33 = await st(() => { const d = window.RecruitApp.state.profile.checklist; const b = d.sections.find(s => s.id === 'reverse').blocks.find(b => b.type === 'notify'); const v = window.RecruitApp.state.checklist.values; return b.items.map(it => v[it.id] === true); });
  expect(nt33.length >= 2 && nt33.every(Boolean) && await exTxt('reverse_notify') === 'すべて外す', 'E33 ⑤【合否連絡】も「すべて説明した」で全部チェック: ' + JSON.stringify(nt33));
  await exAll('reverse_notify');
  await exAll('conditions_explain');   // 撮影用に ① の【説明】だけチェックしておく
  const auto33 = await page.$$eval('#stepContent .cl-auto, #stepContent .cl-auto-hint', els => els.map(e => e.textContent.trim()).filter(Boolean));
  expect(auto33.length === 0, 'E33 必須条件・記入欄に応募情報からの自動表示（見込み・自動: …）を出さない: ' + auto33.join(' / '));
  expect((await page.textContent('#backToApplicant')).trim() === '← 応募者に戻る' && (await page.textContent('#toReportBtn')).trim() === '報告書へ進む →' && !(await page.$('#stepContent [data-action="to-step"][data-step="2"]')),
    'E33 戻る＝「← 応募者に戻る」・進む＝「報告書へ進む →」（申し送りへの導線なし）');
  await rateAll('good');
  await sshot('41-script-step2.png');
  await judge();
  const j33 = await judgment();
  expect(await step() === 4 && j33.mode === 'script' && j33.result === 'recommend' && j33.adjustments.length === 0, 'E33 必須条件すべて一致・確認点すべて○・総合判断「採用」→ 採用推奨（mode=script）: ' + JSON.stringify(j33));
  const paper33 = await page.evaluate(() => ({
    sheet: !!document.querySelector('#appPaper .cl-sheet.cl-mode-sheet'), tiles: Array.from(document.querySelectorAll('#appPaper .cl-tile .cl-tile-k')).map(e => e.textContent),
    judge: (document.querySelector('#appPaper .cl-judge') || {}).textContent || '', dec: !!document.querySelector('#appPaper .cl-decision.is-none#appPaperDecision') }));
  expect(paper33.sheet && JSON.stringify(paper33.tiles) === JSON.stringify(['面接評価（確認点）', '必須条件', '総合判断', '結果']) && paper33.judge.includes('採用推奨') && !paper33.judge.includes('シフト貢献度') && paper33.dec,
    'E33 報告書の紙プレビュー: 判定サマリーは 面接評価（確認点）・必須条件・総合判断・結果（貢献度タイルなし）＋最終合否（未押印）: ' + JSON.stringify(paper33.tiles));
  const lay33 = await page.evaluate(() => { const t = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top : null; };
    return { paper: t('#appPaperWrap'), mgmt: t('#mgmtCard'), dec: t('#decisionCard'), boxes: document.querySelectorAll('#mgmtCard .stamp-box').length,
      save: (document.querySelector('#reportSaveBtn') || {}).textContent, print: (document.querySelector('#reportPrintBtn') || {}).textContent }; });
  expect(lay33.paper != null && lay33.paper < lay33.mgmt && lay33.mgmt < lay33.dec && lay33.boxes === 3 && lay33.save === '💾 報告書を保存（HTML）' && lay33.print === '🖨 A4 で印刷',
    'E33 報告書: 紙プレビュー → 押印（3 欄）→ 最終合否 → 「報告書を保存（HTML）」「A4 で印刷」: ' + JSON.stringify(lay33));
  const no33 = [];
  for (const sel of ['.result-card', '#clBreakdown', '.axis-grid', '#busyAllNightResult', '#applicantSummary', '#judgeWarnings']) if (await page.$('#stepContent ' + sel)) no33.push(sel);
  expect(no33.length === 0 && !(await page.textContent('#stepContent')).includes('シフト貢献度'), 'E33 報告書ステップに 2軸判定・貢献度・応募情報サマリーを出さない: ' + no33.join(' '));
  expect(await page.$eval('#mgmtCard .stamp-box[data-field-id="interviewer"] select', el => el.value) === '0', 'E33 Step① の面接担当者が押印欄「面接対応者」の初期選択');
  // 必須条件を不一致
  await navStep(3);
  await setCl('values.must_weekly', 'mismatch');
  await judge();
  const j33b = await judgment();
  expect(j33b.result === 'reject' && j33b.adjustments[0] === 'must_conditions' && (await page.textContent('#appPaper .cl-tile-res')).includes('不採用推奨'), 'E33 必須条件を「不一致」にすると不採用推奨（紙の結果タイルも）: ' + JSON.stringify(j33b));
  // 保留
  await navStep(3);
  await setCl('values.must_weekly', 'match');
  await setCl('overall', 'hold');
  await judge();
  const j33c = await judgment();
  expect(j33c.result === 'review' && j33c.adjustments.length === 0, 'E33 総合判断「保留」→ 上長最終判断要: ' + JSON.stringify(j33c));
  // 総合判断を未入力に
  await navStep(3);
  await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hold"]');
  await wait(100);
  await judge();
  const j33d = await judgment();
  expect(await step() === 4 && j33d.result === 'review' && await st(() => window.RecruitApp.state.checklist.overall) === '' && (await txtIn(page, '#scriptWarnings')).includes('総合判断が未入力'),
    'E33 総合判断が未入力でも報告書へ進め、上長最終判断要＋警告（#scriptWarnings）: ' + JSON.stringify(j33d));
  await navStep(3);
  await setCl('overall', 'hire');
  await judge();
  expect((await judgment()).result === 'recommend' && !(await page.$('#scriptWarnings')), 'E33 総合判断「採用」に戻すと採用推奨・警告なし');
  const sm33 = { result: await txtIn(page, '#sumResult'), must: await txtIn(page, '#sumMust'), marks: await txtIn(page, '#sumMarks'), ov: await txtIn(page, '#sumOverall'), stamps: await txtIn(page, '#sumStamps') };
  expect(sm33.result.includes('採用推奨') && sm33.must.includes('すべて一致') && sm33.marks.includes('○7') && sm33.ov.includes('採用') && sm33.stamps.includes('面接対応者'),
    'E33 右サマリーに必須条件・採点・総合判断・結果・押印状況: ' + JSON.stringify(sm33));
  await sshot('42-script-step3.png');

  // =====================================================================
  // E34 台本モード: 押印 → 保存 → 保存 HTML（報告書表示・詳細・最終合否）→ 読込
  // =====================================================================
  console.log('\n== E34 台本モード: 押印 → 保存 HTML → 最終合否 → 読込 ==');
  await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
  await wait(150);
  expect(!!(await page.$('#mgmtCard .stamp-box[data-field-id="interviewer"] svg.hanko')) && await st(() => (window.RecruitApp.state.management.interviewer || {}).name) === '笹川 晴央',
    'E34 「面接対応者」に押印（初期選択のまま押せる）');
  await page.selectOption('#decisionManager', { label: SASA });
  await page.click('#decisionCard [data-action="decide"][data-value="hire"]');
  await wait(200);
  const hire34 = !!(await page.$('#appPaper .cl-decision.is-hire svg.verdict-stamp'));
  await page.click('#decisionCard [data-action="undecide"]');
  await wait(150);
  const none34 = !!(await page.$('#appPaper .cl-decision.is-none'));
  await page.click('#mgmtCard .stamp-box[data-field-id="final"] [data-action="unstamp"]');
  await wait(150);
  expect(hire34 && none34 && !(await st(() => window.RecruitApp.state.management.final)), 'E34 アプリの最終合否で紙プレビューの合否欄も描き直す（採用 → 取消で未押印）');
  const saved34 = await saveRecord('script-report.html');
  const r34 = saved34.rec;
  expect(r34.mode === 'script' && r34.decision == null && r34.step === 4 && r34.management.interviewer.name === '笹川 晴央' && r34.checklist.header.taxi === '可・2,500円' && r34.judgment.mode === 'script' &&
    saved34.html.includes('<body class="view-report has-cl mode-script" data-filename="応募者_台本_花子_2026-10-10.html">'),
    'E34 保存: record.mode=script・判定（mode=script）・body.view-report.has-cl.mode-script');
  const in34 = ['<h2>応募者情報</h2>', '<h2>面接チェックリスト</h2>', '<h2>採用可否判定</h2>', '<h2>応募者の管理</h2>', 'id="rtPrintChecklist"', 'id="rtPrintAll"', 'id="clPaper"', 'id="clSheet"'].filter(t => !saved34.html.includes(t));
  // 節（section.sec）は要素の形で調べる（reportCss のセレクタに data-sec="handoff" の文字列が残るため）
  const out34 = ['<h2>面接者への申し送り（留意点）</h2>', '<h2>シフト貢献度</h2>', '<h2>面接で確認した情報</h2>', '<h2>面接前に分かっている情報（未確認）</h2>', '<h2>応募時の情報</h2>', '<h2>面接者への申し送りコメント</h2>',
    'id="rtPrintSheet"', '<section class="sec" data-sec="contrib"', '<section class="sec" data-sec="handoff"'].filter(t => saved34.html.includes(t));
  expect(!in34.length && !out34.length, 'E34 保存 HTML は台本モードの節だけ（留意点・面接で確認した情報・シフト貢献度・申し送りの節と申し送りシートの印刷ボタンなし）: ' + JSON.stringify({ missing: in34, extra: out34 }));
  // 消極属性は 2026-10-13 に削除: 保存 HTML（埋め込みの記録を含む）に「消極属性」「朝～12時のみ」が無い（「短期希望」は台本の質問文にだけ出るので、ヘッダー・応募者情報・A4 のヘッダーで調べる）
  expect(!saved34.html.includes('消極属性') && !saved34.html.includes('朝～12時のみ') && r34.checklist.header.negatives === undefined && !('negatives' in r34.checklistDef.header),
    'E34 保存 HTML・記録に消極属性が無い');
  const rp34Err = [];
  const rp34 = await newReportPage(rp34Err);
  await rp34.goto('file://' + saved34.file);
  await rp34.waitForTimeout(300);
  const cls34 = await rp34.evaluate(() => document.body.className);
  expect(cls34.includes('view-report') && cls34.includes('mode-script') && await shownIn(rp34, '#clPaper .cl-sheet') && !(await shownIn(rp34, '.rh')) && await shownIn(rp34, '#decision') && await shownIn(rp34, '#mgmt') && await dispIn(rp34, '#clSheet') === 'none',
    'E34 保存 HTML は報告書表示で開く（紙プレビュー・最終合否・押印。印刷用 #clSheet は非表示）: ' + cls34);
  const hd34 = await rp34.evaluate(() => ({ paper: (document.querySelector('#clPaper .cl-sheet-head') || {}).textContent || '', sheet: (document.querySelector('#clSheet .cl-sheet-head') || {}).textContent || '', rh: (document.querySelector('.rh') || {}).textContent || '' }));
  expect(['台本 花子', '大学2年生・20歳・女性', '2029年3月', '短期求人', '可・2,500円', '2026/10/10', '笹川 晴央'].every(t => hd34.paper.includes(t) && hd34.sheet.includes(t)) &&
    [hd34.paper, hd34.sheet, hd34.rh].every(t => !t.includes('短期希望') && !t.includes('消極属性')) && !hd34.paper.includes('目安') && hd34.rh.includes('短期求人'),
    'E34 A4 のヘッダーは 氏名・区分・年齢・性別・卒業予定・求人・タクシー・面接日・担当（消極属性・短期希望・目安なし）: ' + JSON.stringify(hd34));
  const pj34 = await txtIn(rp34, '#clPaper .cl-judge');
  expect(pj34.includes('総合判断') && pj34.includes('採用推奨') && !pj34.includes('シフト貢献度'), 'E34 紙プレビューの判定サマリー（総合判断・結果。貢献度なし）');
  await rp34.screenshot({ path: path.join(OUT, '44-script-report.png'), fullPage: true });
  await rp34.click('#rtViewFull');
  await rp34.waitForTimeout(150);
  const secs34 = await rp34.$$eval('section.sec', els => els.filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.sec));
  const dash34 = await txtIn(rp34, '.dash');
  expect(JSON.stringify(secs34) === JSON.stringify(['applicant', 'checklist', 'judgment', 'mgmt']) && await shownIn(rp34, '.rh') && !dash34.includes('シフト貢献度') && !dash34.includes('留意点'),
    'E34 「詳細」は ヘッダー・ダッシュ・応募者情報・面接チェックリスト・採用可否判定・応募者の管理 だけ: ' + secs34.join(','));
  const app34 = await txtIn(rp34, 'section.sec[data-sec="applicant"]');
  expect(['台本 花子', '20歳', '女性', '大学2年生', '2029年3月', '短期求人', '可・2,500円', '2026/10/10', '笹川 晴央', '電話の受け答えが丁寧。'].every(t => app34.includes(t)) && !app34.includes('通勤') && !app34.includes('勤務期間') &&
    !app34.includes('短期希望') && !app34.includes('消極属性'),
    'E34 「応募者情報」は Step① の項目だけ（消極属性なし）');
  const memo34 = await rp34.evaluate(() => Array.from(document.querySelectorAll('section.sec[data-sec="applicant"] th')).map(e => e.textContent.trim()));
  const paperMemo34 = await rp34.evaluate(() => Array.from(document.querySelectorAll('#clSheet .cl-ov-notes .cl-ov-k')).map(e => e.textContent.trim()));
  expect(memo34.includes('メモ') && !memo34.some(t => t.includes('備考')) && paperMemo34.includes('メモ') && !paperMemo34.includes('備考'),
    'E34 Step① の「メモ（任意）」は保存 HTML の応募者情報・A4 でも「メモ」（「備考」の見出しは出さない）: ' + JSON.stringify({ memo34, paperMemo34 }));
  const jd34 = await txtIn(rp34, 'section.sec[data-sec="judgment"]');
  expect(['必須条件', '面接評価（確認点）', '総合判断', '採用推奨'].every(t => jd34.includes(t)) && !jd34.includes('2軸') && !jd34.includes('シフト貢献度'), 'E34 「採用可否判定」は台本モードの要約（必須条件・採点・総合判断・結果）');
  const pb34 = await rp34.$$eval('.rtool button[id^="rtPrint"]', els => els.map(e => e.id));
  expect(JSON.stringify(pb34) === JSON.stringify(['rtPrintChecklist', 'rtPrintAll']), 'E34 印刷ボタンは「面接チェックリスト報告（A4）」「レポート全体」: ' + pb34.join(','));
  await rp34.screenshot({ path: path.join(OUT, '45-script-report-full.png'), fullPage: true });
  await rp34.click('#rtViewReport');
  await rp34.waitForTimeout(150);
  await rp34.selectOption('#decision select', { label: SASA });
  await rp34.click('#decision [data-act="decide"][data-value="hire"]');
  await rp34.waitForTimeout(200);
  const fn34 = await rp34.evaluate(() => document.body.getAttribute('data-filename'));
  expect(!!(await rp34.$('#clPaper .cl-decision svg.verdict-stamp')) && !!(await rp34.$('#mgmt .stamp-box[data-field-id="final"] svg.hanko')) && fn34 === '応募者_台本_花子_2026-10-10_採用.html',
    'E34 保存 HTML で「採用」→ 紙に採用スタンプ・最終確認に自動押印・ファイル名 _採用: ' + fn34);
  const [dl34] = await Promise.all([rp34.waitForEvent('download'), rp34.click('#mgmtSaveBtn')]);
  const file34b = path.join(OUT, 'script-report-hire.html');
  await dl34.saveAs(file34b);
  const r34b = parseRecord(fs.readFileSync(file34b, 'utf8'));
  expect(r34b.mode === 'script' && r34b.decision && r34b.decision.result === 'hire' && r34b.management.final && r34b.management.final.name === '笹川 晴央' && r34b.management.interviewer.name === '笹川 晴央',
    'E34 押印を保存した再出力ファイルに decision（採用）・最終確認・mode=script');
  await rp34.goto('file://' + file34b);
  await rp34.waitForTimeout(300);
  const pdf34 = path.join(OUT, 'script-report.pdf');
  await rp34.pdf({ path: pdf34, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await rp34.waitForTimeout(100);
  const n34 = pdfPages30(pdf34);
  const t34 = pdfText30(pdf34);
  console.log('script-report.pdf pages:', n34);
  expect((n34 === -1 || (n34 >= 1 && n34 <= 2)) && (t34 === null || (t34.includes('面接チェックリスト報告') && !t34.includes('シフト貢献度') && !t34.includes('消極属性'))),
    'E34 報告書表示のまま印刷すると面接チェックリスト報告（A4 2 ページ以内・貢献度なし）: ' + n34);
  expect(rp34Err.length === 0, 'E34 保存 HTML のページエラー・console error なし: ' + (rp34Err.join(' / ') || 'none'));
  await rp34.close();
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  const s34 = await st(() => { const s = window.RecruitApp.state; return { step: s.step, d: s.decision && s.decision.result, final: (s.management.final || {}).name }; });
  expect(s34.step === 4 && (await page.$$('#stepNav li')).length === 3 && s34.d === 'hire' && s34.final === '笹川 晴央' && !!(await page.$('#decisionCard svg.verdict-stamp')) &&
    !!(await page.$('#appPaper .cl-decision svg.verdict-stamp')) && (await txtIn(page, '#sumDecision')).includes('採用・笹川'),
    'E34 アプリで読み込むと台本モードの報告書（Step③）に合否・押印を引き継ぐ: ' + JSON.stringify(s34));
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  await page.emulateMedia({ media: 'print' });
  const pdf34a = path.join(OUT, 'script-report-app.pdf');
  await page.pdf({ path: pdf34a, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: null });
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  const n34a = pdfPages30(pdf34a);
  expect(n34a === -1 || (n34a >= 1 && n34a <= 2), 'E34 アプリの A4 印刷（面接チェックリスト報告）も 2 ページ以内: ' + n34a);
  await sshot('46-script-report-loaded.png');

  // =====================================================================
  // E35 台本モード: 詳細モードの記録の読み込み・運用モードの切替・使い方
  // =====================================================================
  console.log('\n== E35 詳細モードの記録・運用モードの切替・使い方 ==');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved25.file);
  await wait(500);
  const t35 = await toastText();
  expect(t35.includes('詳細モードで保存された記録です（表示されない項目も保持されます）') && await step() === 4 && (await page.$$('#stepNav li')).length === 3 &&
    await st(() => window.RecruitApp.state.applicant.workDays.length > 0) && !(await page.textContent('#stepContent')).includes('シフト貢献度'),
    'E35 詳細モードの記録を台本モードで読むと 3 ステップの報告書で表示（詳細項目は保持・toast）: ' + t35);
  const saved35 = await saveRecord('script-from-full.html');
  const r35 = saved35.rec;
  expect(r35.mode === 'script' && JSON.stringify(r35.applicant.workDays) === JSON.stringify(r25.applicant.workDays) && JSON.stringify(r35.applicant.shifts) === JSON.stringify(r25.applicant.shifts) &&
    Object.keys(r35.handoff.checks).length === Object.keys(r25.handoff.checks).length,
    'E35 台本モードで保存し直しても応募情報の詳細・留意点のチェックは保持（mode=script）');
  await toView('settings');
  const set35 = await page.evaluate(() => {
    const body = document.querySelector('#view-settings .settings-body');
    const first = body.querySelector(':scope > section.card');
    const adv = document.querySelector('details.settings-advanced');
    const inAdv = ['s-features', 's-stages', 's-options', 's-busy', 's-params', 's-hs', 's-rules', 's-contrib', 's-matrix', 's-texts'].every(id => { const el = document.getElementById(id); return !!el && !!adv && adv.contains(el); });
    const outAdv = ['s-mode', 's-meta', 's-applicant', 's-checklist', 's-texts-script', 's-mgmt', 's-io'].every(id => { const el = document.getElementById(id); return !!el && !(adv && adv.contains(el)); });
    const chk = document.querySelector('[data-bind="mode"]:checked');
    return { first: first ? first.id : '', mode: chk ? chk.value : '', adv: !!adv, open: adv ? adv.open : null, inAdv, outAdv, cats: !!document.querySelector('#s-applicant [data-bind="options.categories"]') };
  });
  expect(set35.first === 's-mode' && set35.mode === 'script' && set35.adv && set35.open === false && set35.inAdv && set35.outAdv && set35.cats,
    'E35 設定の先頭に「運用モード」（台本）・詳細モードの節は「詳細モードの設定」に畳む（台本・押印・劇場情報・区分・書き出しは常に表示）: ' + JSON.stringify(set35));
  const cl35 = await page.evaluate(() => {
    const sc = document.getElementById('s-checklist');
    const adv = document.getElementById('s-advanced');
    const t = sc.textContent;
    const binds = Array.from(document.querySelectorAll('#view-settings [data-bind]')).map(e => e.dataset.bind + (e.type === 'radio' ? '=' + e.value : ''));
    const io = document.getElementById('s-io').textContent;
    return {
      holdIn: !!sc.querySelector('[data-bind="evaluation.holdOnUnresolvedBlock"], [data-bind="evaluation.holdOnHighschoolException"]'),
      holdAdv: !!adv.querySelector('#s-checklist-full [data-bind="evaluation.holdOnUnresolvedBlock"]') && !!adv.querySelector('#s-checklist-full [data-bind="evaluation.holdOnHighschoolException"]'),
      autos: sc.querySelectorAll('[data-bind$=".auto"], [data-bind="checklist.header.morningOnlyEnd"]').length,
      words: ['自動表示', '自動判定', 'Step3', 'Step4', '2軸判定', '応募情報から'].filter(w => t.includes(w)),
      band: !!sc.querySelector('[data-bind="evaluation.thresholds.recommendPct"]') && !!sc.querySelector('[data-bind="evaluation.thresholds.reviewPct"]'),
      mxNote: !document.querySelector('#s-matrix [data-bind^="evaluation.thresholds."]') && ((document.getElementById('mxBandNote') || {}).textContent || '').includes('「面接チェックリスト」の節'),
      dup: binds.filter((b, i) => binds.indexOf(b) !== i),
      steps: t.includes('説明（Step② に表示）') && t.includes('Step② の説明文') && !t.includes('消極属性') && !sc.querySelector('[data-bind^="checklist.header.negatives"], [data-action="cl-neg-add"]'),
      mgmt: document.getElementById('s-mgmt').textContent.includes('Step③ に「採用」「不採用」のボタン'),
      io: io.includes('新しい設定項目が既定値で補われます') && !io.includes('2軸判定'),
      hint: document.querySelector('[data-bind="management.fields[0].hint"]').value
    };
  });
  expect(!cl35.holdIn && cl35.holdAdv && cl35.autos === 0 && !cl35.words.length && cl35.band && cl35.mxNote && !cl35.dup.length && cl35.steps && cl35.mgmt && cl35.io && cl35.hint === '応募受付を行った担当者',
    'E35 台本モードの「面接チェックリスト」節に詳細モード専用の設定・自動表示・Step3/Step4・2軸判定の文言が無く、帯の境界を同じ節に出す（同じ data-bind は 1 回だけ）: ' + JSON.stringify(cl35));
  await page.click('.settings-nav a[href="#s-advanced"]');
  await wait(400);
  const adv35 = await page.evaluate(() => { const d = document.getElementById('s-advanced'); return { open: d.open, top: Math.round(d.getBoundingClientRect().top), y: window.scrollY }; });
  expect(adv35.open && adv35.y > 0 && adv35.top < 500, 'E35 設定ナビ「詳細モードの設定」で畳みを開いてから移動: ' + JSON.stringify(adv35));
  await page.click('label:has([data-bind="mode"][value="full"])');
  await wait(300);
  expect(!(await page.$('details.settings-advanced')), 'E35 詳細モードを選ぶと設定の節を畳まずに表示');
  const clF35 = await page.evaluate(() => {
    const sc = document.getElementById('s-checklist');
    const t = sc.textContent;
    return {
      hold: !!sc.querySelector('[data-bind="evaluation.holdOnUnresolvedBlock"]') && !!sc.querySelector('[data-bind="evaluation.holdOnHighschoolException"]'),
      autos: sc.querySelectorAll('select[data-bind$=".auto"]').length,
      texts: ['説明（Step3 に表示）', 'Step3 の説明文', '高・中の境界（%）は「2軸判定」で設定します'].filter(w => !t.includes(w)),
      noNeg: !t.includes('消極属性') && !t.includes('朝～12時のみ') && !sc.querySelector('[data-bind^="checklist.header.negatives"], [data-bind="checklist.header.morningOnlyEnd"], [data-action="cl-neg-add"]'),
      band: !sc.querySelector('[data-bind^="evaluation.thresholds."]') && !!document.querySelector('#s-matrix [data-bind="evaluation.thresholds.recommendPct"]'),
      mgmt: document.getElementById('s-mgmt').textContent.includes('Step4 に「採用」「不採用」のボタン'),
      full: !document.getElementById('s-checklist-full')
    };
  });
  expect(clF35.hold && clF35.autos > 0 && !clF35.texts.length && clF35.band && clF35.mgmt && clF35.full && clF35.noNeg,
    'E35 詳細モードの「面接チェックリスト」節は従来どおり（要判断・高校生の設定・自動表示・Step3/Step4・境界は「2軸判定」。消極属性の行・自動判定・終了時刻は削除）: ' + JSON.stringify(clF35));
  await saveSettings();
  const t35b = await toastText();
  await toView('judge');
  expect(JSON.stringify(await stepLabels()) === JSON.stringify(['応募情報', '面接者への申し送り', '面接チェックリスト', '採用可否判定']) && await step() === 1 && !!(await page.$('[data-field="workDays"]')) &&
    (await storedProfile()).mode === 'full' && t35b.includes('詳細モード'),
    'E35 詳細モードに切り替えると 4 ステップ・Step1（詳細の応募情報）に戻る: ' + t35b);
  const names35 = await page.evaluate(() => ({ nav: document.querySelector('.nav-item[data-view="judge"]').textContent.trim(), top: document.getElementById('topTitle').textContent, side: document.getElementById('stepSectionTitle').textContent }));
  expect(names35.nav.endsWith('応募者判定') && names35.top === '応募者判定' && names35.side === '判定ステップ', 'E35 詳細モードに切り替えると画面名も従来どおり（応募者判定・判定ステップ）: ' + JSON.stringify(names35));
  await toView('settings');
  await page.click('label:has([data-bind="mode"][value="script"])');
  await wait(300);
  await saveSettings();
  await toView('judge');
  expect(JSON.stringify(await stepLabels()) === JSON.stringify(['応募者', '面接チェックリスト', '報告書']) && await step() === 1 && !!(await page.$('#scriptApplicantCard')) && (await storedProfile()).mode === 'script',
    'E35 台本モードに戻すと 3 ステップ・Step① 応募者');
  await toView('help');
  const help35 = await page.textContent('#view-help');
  expect((await page.$$('#view-help .help-step')).length === 3 && ['応募者', '面接チェックリスト', '報告書', '最終合否', '詳細モード'].every(t => help35.includes(t)) && !help35.includes('2軸（マトリクス）'),
    'E35 使い方は台本モード向け（3 ステップ・報告書 HTML の往復・詳細モードは末尾）');
  await toView('judge');

  // =====================================================================
  // E36 台本モードの記録を詳細モードで読む・ダークモード・390px
  // =====================================================================
  console.log('\n== E36 台本モードの記録を詳細モードで・ダーク・390px ==');
  await toView('settings');
  await page.click('label:has([data-bind="mode"][value="full"])');
  await wait(300);
  await saveSettings();
  await toView('judge');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  const t36 = await toastText();
  const s36 = await st(() => { const s = window.RecruitApp.state; return { name: s.applicant.name, wd: s.applicant.workDays.length, step: s.step, d: s.decision && s.decision.result }; });
  expect((await page.$$('#stepNav li')).length === 4 && s36.name === '台本 花子' && s36.wd === 0 && s36.step === 4 && s36.d === 'hire' && t36.includes('台本モードで保存された記録です'),
    'E36 台本モードの記録も詳細モードで読める（詳細項目は空・合否は保持）: ' + JSON.stringify(s36) + ' ' + t36);
  await toView('settings');
  await page.click('label:has([data-bind="mode"][value="script"])');
  await wait(300);
  await saveSettings();
  await toView('judge');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  await page.click('#btnTheme');
  await wait(200);
  const dk36 = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.getElementById('appPaper')).backgroundColor,
    color: getComputedStyle(document.querySelector('#appPaper .cl-sheet')).color }));
  expect(await step() === 4 && dk36.theme === 'dark' && dk36.bg === 'rgb(255, 255, 255)' && dk36.color === 'rgb(17, 17, 17)', 'E36 ダークモードでも報告書の紙プレビューは白地・黒字: ' + JSON.stringify(dk36));
  await sshot('43-script-step3-dark.png');
  await page.click('#btnTheme');
  await wait(150);
  await page.setViewportSize({ width: 390, height: 900 });
  await wait(300);
  const nw36 = await page.evaluate(() => { const w = document.getElementById('appPaperWrap'); return { sw: w.scrollWidth, cw: w.clientWidth, ov: document.documentElement.scrollWidth - window.innerWidth }; });
  await st(() => window.RecruitApp.goStep(3));
  await wait(300);
  const ov36b = await overflowX();
  await st(() => window.RecruitApp.goStep(1));
  await wait(300);
  const ov36c = await overflowX();
  expect(nw36.sw > nw36.cw && nw36.ov <= 1 && ov36b <= 1 && ov36c <= 1, 'E36 390px 幅で横スクロールなし（報告書は紙だけ横スクロール・面接チェックリスト・応募者も）: ' + JSON.stringify({ nw36, ov36b, ov36c }));
  await sshot('47-script-narrow.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);

  // =====================================================================
  // E37 台本モード: ③ を開かずに ② から保存・印刷しても判定が入る・印刷の経路・総合判断未入力の保存
  // =====================================================================
  console.log('\n== E37 台本モード: ② から保存・印刷 ==');
  const names37 = await page.evaluate(() => ({ nav: document.querySelector('.nav-item[data-view="judge"]').textContent.trim(), top: document.getElementById('topTitle').textContent, side: document.getElementById('stepSectionTitle').textContent }));
  expect(names37.nav.endsWith('報告書の作成') && names37.top === '面接チェックリスト報告' && names37.side === '手順', 'E37 詳細モード → 台本モードに戻すと画面名も台本モード: ' + JSON.stringify(names37));
  await page.click('#btnNew');
  await wait(200);
  await fillScript({ name: '台本 次郎', age: 22, gender: '男性', category: 'フリーター', interviewer: '笹川 晴央' });
  await setCl('header.posting', 'regular');
  await page.click('[data-action="script-next"]');
  await wait(400);
  // 「すべて説明した」: 求人が通常なら「※短期求人のみ」の項目は付けない（docs/SPEC-script-mode.md 12 章）
  await page.click('[data-action="explain-all"][data-block="conditions_explain"]');
  await wait(120);
  const ex37 = await st(() => { const v = window.RecruitApp.state.checklist.values; return { fare: v.ex_fare === true, hours: v.ex_hours === true, contract: v.ex_contract === true, sw: v.ex_switch === true,
    t: document.querySelector('[data-action="explain-all"][data-block="conditions_explain"]').textContent }; });
  expect(ex37.fare && ex37.hours && !ex37.contract && !ex37.sw && ex37.t === 'すべて外す', 'E37 求人が通常なら「すべて説明した」で ※短期求人のみ の項目は付かない（それ以外で全部 → 「すべて外す」）: ' + JSON.stringify(ex37));
  await page.click('label.cl-check[data-item="ex_contract"]');   // 通常求人でも手で付けた ※ の項目は「すべて外す」で外れる
  await wait(100);
  await page.click('[data-action="explain-all"][data-block="conditions_explain"]');
  await wait(120);
  expect(await st(() => !['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch'].some(id => window.RecruitApp.state.checklist.values[id] === true)), 'E37 「すべて外す」はブロックの全項目（手で付けた ※ の項目も）を外す');
  await rateAll('good');
  expect(await step() === 3 && await st(() => window.RecruitApp.state.judgment) === null, 'E37 ② では未判定（state.judgment なし）');
  // 1. ② から保存（③ は開かない）
  const saved37 = await saveRecord('script-step2-save.html');
  const r37 = saved37.rec;
  expect(await step() === 3 && r37.step === 3 && !!r37.judgment && r37.judgment.mode === 'script' && r37.judgment.result === 'recommend',
    'E37 ② から保存しても判定（mode=script・採用推奨）を記録する（③ は開かない）: ' + JSON.stringify(r37.judgment && [r37.judgment.mode, r37.judgment.result, r37.step]));
  expect((await txtIn(page, '#sumResult')).includes('採用推奨'), 'E37 右サマリーの結果も記録した判定');
  const rp37Err = [];
  const rp37 = await newReportPage(rp37Err);
  await rp37.goto('file://' + saved37.file);
  await rp37.waitForTimeout(300);
  const tile37 = await txtIn(rp37, '#clPaper .cl-tile-res');
  await rp37.click('#rtViewFull');
  await rp37.waitForTimeout(150);
  const jd37 = await txtIn(rp37, 'section.sec[data-sec="judgment"]');
  const vd37 = await txtIn(rp37, '.rh .verdict');
  const dr37 = await txtIn(rp37, '.dash [data-tile="result"]');
  expect(tile37.includes('採用推奨') && jd37.includes('採用推奨') && !jd37.includes('未実施') && vd37.includes('採用推奨') && !dr37.includes('未実施'),
    'E37 保存 HTML の紙に結果タイル（採用推奨）・「詳細」の採用可否判定・ヘッダー・ダッシュに結果（「未実施」なし）: ' + JSON.stringify({ tile37, vd37, dr37 }));
  expect(rp37Err.length === 0, 'E37 保存 HTML のページエラー・console error なし: ' + (rp37Err.join(' / ') || 'none'));
  await rp37.close();
  // 2. 保存後に ③ を開いても同じ判定
  await judge();
  const j37 = await judgment();
  expect(await step() === 4 && j37.result === r37.judgment.result && j37.title === r37.judgment.title && (await txtIn(page, '#appPaper .cl-tile-res')).includes(r37.judgment.title),
    'E37 保存後に ③ を開いても同じ判定: ' + JSON.stringify([j37.result, r37.judgment.result]));
  // 3. ② で保存した記録は読み込むと ② から再開する（判定が入っていても ③ に飛ばない）
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved37.file);
  await wait(500);
  expect(await step() === 3 && await st(() => window.RecruitApp.state.applicant.name) === '台本 次郎' && await st(() => window.RecruitApp.state.judgment) === null,
    'E37 ② で保存した記録は読み込むと ② 面接チェックリストから再開');
  // 4. 印刷の経路（window.print はスタブ。印刷の瞬間の body.print-checklist と A4 報告の結果タイルを記録する）
  await page.evaluate(() => {
    window.__pr = [];
    window.print = function () { window.__pr.push({ cls: document.body.classList.contains('print-checklist'), res: (document.querySelector('#clSheet .cl-tile-res') || {}).textContent || '' }); };
  });
  const prState = () => st(() => ({ cls: document.body.classList.contains('print-checklist'), host: document.getElementById('clSheet').innerHTML.length, res: (document.querySelector('#clSheet .cl-tile-res') || {}).textContent || '',
    j: window.RecruitApp.state.judgment && window.RecruitApp.state.judgment.result, calls: window.__pr.slice() }));
  // 4-1. ブラウザの印刷（Ctrl+P）: beforeprint で A4 報告に切り替え、判定が無ければ入れる。afterprint で戻す
  await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hire"]');   // 総合判断を外す（未入力）
  await wait(100);
  expect(await st(() => window.RecruitApp.state.checklist.overall) === '' && await st(() => window.RecruitApp.state.judgment) === null, 'E37 総合判断を外す（未入力・未判定）');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await wait(100);
  const bp37 = await prState();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await wait(100);
  const ap37 = await prState();
  expect(bp37.cls && bp37.host > 0 && bp37.res.includes('上長最終判断要') && bp37.j === 'review' && !ap37.cls && ap37.host === 0,
    'E37 beforeprint で body.print-checklist（A4 報告に結果: 総合判断未入力 → 上長最終判断要）・afterprint で外す: ' + JSON.stringify({ bp37, ap37 }));
  // 4-2. トップバー 🖨（判定を無効にしてから）
  await setCl('overall', 'reject');
  await wait(100);
  expect(await st(() => window.RecruitApp.state.judgment) === null, 'E37 入力を変えると判定は無効');
  await page.click('#btnPrint');
  await wait(150);
  const tp37 = await prState();
  expect(tp37.calls.length === 1 && tp37.calls[0].cls && tp37.calls[0].res.includes('不採用推奨') && tp37.j === 'reject',
    'E37 トップバー 🖨: body.print-checklist を付けて window.print（A4 報告に現在の入力の結果: 不採用推奨）: ' + JSON.stringify(tp37));
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await wait(100);
  expect(!(await prState()).cls, 'E37 印刷後（afterprint）に body.print-checklist を外す');
  // 4-3. ② の「🖨 面接チェックリスト報告（A4）」
  await setCl('overall', 'hire');
  await wait(100);
  await page.click('#clPrintBtn');
  await wait(150);
  const cp37 = await prState();
  expect(cp37.calls.length === 2 && cp37.calls[1].cls && cp37.calls[1].res.includes('採用推奨') && cp37.j === 'recommend',
    'E37 ② の「面接チェックリスト報告（A4）」も判定を入れて印刷: ' + JSON.stringify(cp37.calls));
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await wait(100);
  // 5. 総合判断が未入力のまま保存すると警告（保存は止めない）
  await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hire"]');
  await wait(100);
  const saved37b = await saveRecord('script-overall-missing.html');
  const t37 = await toastText();
  expect(t37.includes('総合判断が未入力です') && saved37b.rec.checklist.overall === '' && saved37b.rec.judgment && saved37b.rec.judgment.result === 'review',
    'E37 総合判断が未入力のまま保存すると toast に「総合判断が未入力です」（保存はする）: ' + t37);
  // 回答が無くても（① だけで保存）総合判断の警告を出す
  await page.click('#btnNew');
  await wait(200);
  await fillScript({ name: '台本 三郎' });
  await saveRecord('script-step1-save.html');
  const t37c = await toastText();
  expect(t37c.includes('総合判断が未入力です'), 'E37 チェックリストが未入力でも総合判断が空なら保存時に警告: ' + t37c);

  // =====================================================================
  // E38 入力の簡素化: 旧レコード（消極属性入り）の読み込み（docs/SPEC-script-mode.md 12 章）
  // =====================================================================
  console.log('\n== E38 旧レコード（消極属性入り）の読み込み ==');
  const old38 = parseRecord(fs.readFileSync(file34b, 'utf8'));
  old38.checklist.header.negatives = { short: 'on', morningOnly: 'on' };
  old38.checklistDef.header.negatives = [{ id: 'short', label: '短期希望', auto: 'shortTerm' }, { id: 'morningOnly', label: '朝～12時のみ', auto: 'morningOnly' }];
  old38.checklistDef.header.morningOnlyEnd = '12:00';
  const html38 = await st(r => window.RecruitStorage.generateReportHTML(r, window.RecruitApp.state.profile), old38);
  const file38 = path.join(OUT, 'script-old-negatives.html');
  fs.writeFileSync(file38, html38);
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file38);
  await wait(500);
  const s38 = await st(() => { const s = window.RecruitApp.state; return { step: s.step, name: s.applicant.name, posting: s.checklist.header.posting, neg: s.checklist.header.negatives, d: s.decision && s.decision.result }; });
  const sum38 = await page.textContent('#sumApplicant');
  expect(s38.step === 4 && s38.name === '台本 花子' && s38.posting === 'short' && s38.d === 'hire' && !['短期希望', '消極属性', '朝～12時のみ'].some(t => sum38.includes(t)) && sum38.includes('短期求人'),
    'E38 消極属性入りの旧レコードもエラーなく読め、右サマリーに消極属性を出さない: ' + JSON.stringify(s38));
  const paper38 = (await txtIn(page, '#appPaper .cl-sheet-head'));
  expect(paper38.includes('短期求人') && !['短期希望', '消極属性', '朝～12時のみ'].some(t => paper38.includes(t)), 'E38 報告書の紙（A4 ヘッダー）に消極属性を出さない: ' + paper38);
  await navStep(3);
  const hd38 = await page.textContent('#clHeader');
  expect(await step() === 3 && hd38.includes('短期求人') && !['短期希望', '消極属性', '朝～12時のみ'].some(t => hd38.includes(t)), 'E38 ② のヘッダーに消極属性を出さない: ' + hd38);
  await navStep(1);
  expect(!(await page.$('#saNegatives, [data-cl^="header.negatives"]')) && !(await page.textContent('#scriptApplicantCard')).includes('短期希望'), 'E38 ① にも消極属性の入力・表示なし');
  const saved38 = await saveRecord('script-old-negatives-resaved.html');
  const shown38 = saved38.html.replace(/<script type="application\/json" id="recruit-record">[\s\S]*?<\/script>/, '');
  expect(!shown38.includes('消極属性') && !shown38.includes('朝～12時のみ') && saved38.rec.checklist.header.posting === 'short' && !('negatives' in saved38.rec.checklistDef.header),
    'E38 保存し直した HTML の表示部分に消極属性なし・台本（checklistDef）からは外れる');
  const rp38Err = [];
  const rp38 = await newReportPage(rp38Err);
  await rp38.goto('file://' + file38);
  await rp38.waitForTimeout(300);
  const p38 = await rp38.evaluate(() => document.body.innerText);
  expect(rp38Err.length === 0 && !['消極属性', '朝～12時のみ'].some(t => p38.includes(t)) && p38.includes('短期求人'), 'E38 旧レコードから作った保存 HTML もエラーなし・消極属性なし: ' + (rp38Err.join(' / ') || 'ok'));
  await rp38.close();

  expect(errors.length === 0, 'ERRORS: ' + (errors.length ? JSON.stringify(errors) : 'none'));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  console.log('\n' + (fails.length ? fails.length + ' FAILED:\n - ' + fails.join('\n - ') : 'ALL PASSED'));
  if (fails.length) process.exit(1);
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
