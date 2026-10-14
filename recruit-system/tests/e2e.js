/*
 * 配布ファイル（dist/toho-recruit-judge.html）のブラウザ通しテスト。
 *   node build.js && node tests/e2e.js
 * Playwright と Chromium が必要（npx playwright install chromium）。
 * スクリーンショットは tests/shots/ に出力（git 管理外）。
 * 失敗した確認（FAIL）が 1 つでもあれば exit 1。
 *
 * シナリオ（docs/SPEC-script-mode.md 7-3・docs/SPEC-slim.md 5-2・docs/SPEC-a4.md 7 章。2026-10-14 の面接特化で E1〜E39 → E1〜E11 に振り直し、E12〜E14 を追加）
 *   E1  3 ステップ・① 応募者（詳細モードの保存済み設定は 3 ステップで開く・詳細項目なし・390px）
 *   E2  ② 面接チェックリスト（①〜⑤ のみ・読み取り専用ヘッダー）→ ③ 報告書（A4 の紙・見出し・押印行・判定サマリー・必須条件・総合判断・押印 2 欄）
 *   E3  押印 → 保存 → 保存 HTML（A4 縦の用紙 1 枚・用紙の「最終合否」をクリックして窓で採用・右下の保存バーで再出力・そのまま印刷で 1 枚）→ アプリで読込 → 再保存 → 開く
 *   E4  旧レコードの読み込み（詳細モードの記録・初期対応者の押印入り・v1）
 *   E5  ダークモードの紙（白地・ハンコの明るさ補正なし）・390px
 *   E6  ③ を開かずに ② から保存・印刷しても判定が入る・② で保存した記録は ② から再開・印刷の経路（🖨・② の印刷ボタン・beforeprint）・総合判断未入力の保存
 *   E7  旧レコード（消極属性入り）の読み込み
 *   E8  A4 報告（1 ページの要約）: 紙に質問文なし・結果が上部・1280/1440px で横スクロールなし・重いサンプルでも 1 ページ（.cl-compact。押印行込みで 1052px 以内）・PDF の本文
 *   E9  押印欄 2 つ（初期対応者なし）: アプリ・紙・印刷用・保存 HTML の用紙（390px でも 2 列のまま用紙ごと縮小）・右サマリー・設定・旧い 3 欄の設定
 *   E10 設定画面（5 節・data-bind の許可リスト・保存／破棄／初期化・書き出し・v1／詳細モードの JSON の読み込み）・使い方
 *   E11 保存 HTML の印刷（印刷のための切替なし・ボタンなし・そのまま A4 1 枚・台本の全文なし）・アプリの A4 印刷（押印 2 欄・1 ページ）
 *   E12 設定の反映（必須条件の不一致を上長最終判断要に・台本の文言と確認点の増減・満点・空の文言・既定に戻す・壊れた台本）・読み込みの toast（確認点の差・他劇場）・
 *       手入力の押印と最終合否・保存 HTML の用紙の窓での取消・手入力・未選択のエラー・最終合否の ON/OFF（旧 E22・E26・E28・E31 のうち残した機能）
 *   E13 ロゴ（brand.js）と、ロゴ・名簿入りの版（node build.js --local）: サイドバー・③ の紙・保存 HTML の用紙の見出し
 *   E14 A4 用紙（docs/SPEC-a4.md 7-3）: 寸法 210×297mm・画面と印刷が同じ様式（スクリーンショットと PDF の画像）・欄クリックの窓（Esc・外のクリック・印刷に出ない・書き出しに残らない）・
 *       長いメモの全文・390px の縮小表示・アプリの印刷と保存 HTML の印刷が同じ見出しの 1 ページ
 *   必須条件の不一致の案内（⑤ 逆質問へ・省略可。旧 E26）は E2 で確かめる
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
  // 閉じた <details> の中身は Chromium では offsetParent・getClientRects が残るため checkVisibility() でも確かめる
  const visible = (sel) => page.evaluate(s => { const el = document.querySelector(s); return !!el && !el.closest('.hidden') && el.offsetParent !== null && (!el.checkVisibility || el.checkVisibility()); }, sel);
  const step = () => st(() => window.RecruitApp.state.step);
  const toastText = () => page.textContent('#toast');
  const judgment = () => st(() => {
    const j = window.RecruitApp.state.judgment;
    return j && { result: j.result, title: j.title, mode: j.mode, baseResult: j.baseResult, interviewBand: j.interview && j.interview.band,
      adjustments: (j.adjustments || []).map(a => a.code), total: j.total, max: j.max, pct: j.pct };
  });
  // 既定の設定で始める: localStorage を空にして再読込（docs/SPEC-slim.md K8）
  const fresh = async () => { await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await page.reload(); await wait(300); };
  const toView = async (v) => { await page.click('.nav-item[data-view="' + v + '"]'); await wait(300); };
  const navStep = async (n) => { await page.click('#stepNav [data-step="' + n + '"]'); await wait(300); };
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
  const judge = async () => { await page.click('[data-action="judge"]'); await wait(400); };
  const saveSettings = async () => { await page.click('#view-settings [data-action="save"]'); await wait(300); };
  const storedProfile = () => st(() => JSON.parse(localStorage.getItem('recruit.profile.v1') || 'null'));
  const saveRecord = async (name) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    const file = path.join(OUT, name);
    await dl.saveAs(file);
    const html = fs.readFileSync(file, 'utf8');
    return { file, html, rec: parseRecord(html) };
  };
  const parseRecord = (html) => JSON.parse(html.match(/<script type="application\/json" id="recruit-record">([\s\S]*?)<\/script>/)[1].replace(/<\\\/script/gi, '</script'));
  // 保存 HTML を別のページで開く（ページエラー・console error を errs に集める）
  const shownIn = (pg, sel) => pg.evaluate(s => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0 && (!el.checkVisibility || el.checkVisibility()); }, sel);
  const txtIn = (pg, sel) => pg.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);
  const dispIn = (pg, sel) => pg.evaluate(s => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'missing'; }, sel);
  const SASA = '笹川 晴央（副支配人）';
  // 保存 HTML の用紙の操作（docs/SPEC-a4.md 7-2）: 用紙の欄をクリック → 窓（#a4Pop）で担当者を選んで押す → 右下の保存バー（#saveBarBtn）で書き出す
  const openStamp = async (pg, id) => { await pg.click('#a4 .stamp-box[data-field-id="' + id + '"]'); await pg.waitForTimeout(80); };
  const openDecision = async (pg) => { await pg.click('#a4Decision'); await pg.waitForTimeout(80); };
  const popSel = (pg, label) => pg.selectOption('#a4Pop select', label === '__free' ? '__free' : { label });
  const popAct = async (pg, act, v) => { await pg.click('#a4Pop [data-act="' + act + '"]' + (v ? '[data-value="' + v + '"]' : '')); await pg.waitForTimeout(150); };
  // 書き出したファイルの「要素」部分（<style>・<script> の中の文字列を除く。CSS・スクリプトには .pop・savebar・data-a4-t の文字列があるため）
  const shownHtml = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const newReportPage = async (errs) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.clock.setFixedTime(NOW);
    return p;
  };
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
  // スクリーンショット（先頭までスクロールし、toast を隠してから全体を撮る）
  const sshot = async (name) => { await page.evaluate(() => { window.scrollTo(0, 0); const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }); await wait(250); await shot(name, true); };
  // 長いメモの見本
  const L = (n) => 'あいうえおかきくけこさしすせそ'.repeat(Math.ceil(n / 15)).slice(0, n);

  await page.clock.setFixedTime(NOW);
  await page.goto(FILE);
  await wait(300);

  // =====================================================================
  // E1 3 ステップ・① 応募者（docs/SPEC-script-mode.md 7-3・docs/SPEC-slim.md 3-4）
  // =====================================================================
  console.log('\n== E1 3 ステップ・① 応募者 ==');
  // 1. 詳細モード（mode:'full'＋handoffRules）の保存済みの設定（full-mode-last の利用者）
  const legacyProfile = fs.readFileSync(path.join(FIX, 'legacy-profile-full.json'), 'utf8');
  await page.evaluate((t) => { localStorage.clear(); localStorage.setItem('recruit.profile.v1', t); }, legacyProfile);
  await page.reload();
  await wait(300);
  const t1a = await toastText();
  const sp1 = await storedProfile();
  const nav1a = await stepLabels();
  expect(JSON.stringify(nav1a) === JSON.stringify(['応募者', '面接チェックリスト', '報告書']) && !!(await page.$('#scriptApplicantCard')) && t1a.includes('詳細モードは終了しました') &&
    !('mode' in sp1) && !('handoffRules' in sp1) && !('contribution' in sp1) && !('inputStages' in sp1) && JSON.stringify(sp1.management.fields.map(f => f.id)) === JSON.stringify(['interviewer', 'final']) &&
    sp1.meta.theaterName === 'TOHOシネマズ テスト',
    'E1 詳細モードの保存済みの設定は 3 ステップで開き（toast「詳細モードは終了しました」）、保存済みの設定から mode・handoffRules・初期対応者の欄を消す: ' + JSON.stringify({ t1a, keys: Object.keys(sp1) }));
  await page.reload();
  await wait(300);
  expect(!(await toastText()).includes('詳細モード'), 'E1 正規化した設定は保存し直す（再読込で toast を出さない）');
  // 2. 既定
  await fresh();
  expect(await st(() => !('mode' in window.RecruitApp.state.profile) && window.RecruitApp.state.profile.management.fields.length === 2) && !(await toastText()).trim(),
    'E1 既定（設定なし）: 設定に mode は無く、押印欄は 2 つ・toast なし');
  // 3. サイドバー
  const nav32 = await stepNav();
  expect(JSON.stringify(nav32) === JSON.stringify([['1', '1', '応募者'], ['3', '2', '面接チェックリスト'], ['4', '3', '報告書']]) && (await page.textContent('#stepSectionTitle')) === '手順',
    'E1 サイドバーは 3 ステップ（応募者／面接チェックリスト／報告書）・見出し「手順」: ' + JSON.stringify(nav32));
  const names32 = await page.evaluate(() => ({ nav: document.querySelector('.nav-item[data-view="judge"]').textContent.trim(), top: document.getElementById('topTitle').textContent }));
  expect(names32.nav.endsWith('報告書の作成') && !names32.nav.includes('応募者判定') && names32.top === '面接チェックリスト報告',
    'E1 画面名: ナビ「報告書の作成」・トップバー「面接チェックリスト報告」: ' + JSON.stringify(names32));
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
    'E1 Step① に氏名（必須）・年齢・性別・区分・応募した求人・タクシー可否・料金・面接日（今日）・面接担当者（名簿）・メモ（任意・2 行）。消極属性は無い: ' + JSON.stringify(f32));
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
    'E1 Step① は 1 枚・3 行（氏名・年齢・性別・区分〔卒業予定〕／面接日・面接担当者・求人〔通常・短期〕／タクシー・メモ）・説明は冒頭 1 行・補足文なし（名簿の案内は title）: ' + JSON.stringify(lay32));
  // 5. 詳細項目なし
  const absent32 = [];
  for (const sel of ['[data-field="workDays"]', '[data-field="anyDay"]', '[data-field="shifts.mon.start"]', '[data-field="daysMin"]', '[data-field="daysMax"]', '[data-field="workPeriod"]', '[data-field="commuteMethod"]',
    '[data-field="nearestStation"]', '[data-field="sideJob"]', '[data-field="foreign.isForeign"]', '[data-field="vacation.gw"]', '[data-field="lateNight.availability"]', '[data-field="allNight.availability"]',
    '#preFill', '#notesCard', '[data-action="generate-handoff"]']) if (await page.$(sel)) absent32.push(sel);
  expect(absent32.length === 0, 'E1 Step① に詳細項目（曜日・時間帯・週日数・勤務期間・通勤・かけもち・外国籍・繁忙期・深夜帯・オールナイト・申し送り）が無い: ' + absent32.join(' '));
  // 6. 卒業予定年月
  await page.selectOption('[data-field="category"]', '大学2年生');
  await wait(100);
  const grad32a = await visible('#grp-graduation');
  await page.selectOption('[data-field="category"]', 'フリーター');
  await wait(100);
  const grad32b = await visible('#grp-graduation');
  expect(grad32a && !grad32b, 'E1 卒業予定年月は学生の区分のときだけ表示');
  await page.selectOption('[data-field="category"]', '大学2年生');
  await wait(100);
  const row32 = await page.evaluate(() => ['name', 'age', 'gender', 'category', 'graduationDate'].map(k => Math.round(document.querySelector('[data-field="' + k + '"]').getBoundingClientRect().top)));
  expect(row32.every(t => Math.abs(t - row32[0]) <= 2), 'E1 1440px では卒業予定年月も 1 行目（氏名・年齢・性別・区分と同じ行）の末尾: ' + row32.join(','));
  await page.selectOption('[data-field="category"]', '');
  await wait(100);
  // 7. 氏名が空
  await page.click('[data-action="script-next"]');
  await wait(300);
  expect(await step() === 1 && (await toastText()).includes('必須'), 'E1 氏名が空なら面接チェックリストへ進めない');
  // 8. 入力
  await fillScript({ name: '台本 花子', age: 20, gender: '女性', category: '大学2年生', graduationDate: '2029-03', posting: 'short', taxi: '可・2,500円', interviewer: '笹川 晴央', notes: '電話の受け答えが丁寧。' });
  const s32 = await st(() => { const s = window.RecruitApp.state; return { a: s.applicant, h: s.checklist.header }; });
  expect(s32.a.name === '台本 花子' && s32.a.age === '20' && s32.a.gender === '女性' && s32.a.category === '大学2年生' && s32.a.graduationDate === '2029-03' && s32.a.reviewerNotes === '電話の受け答えが丁寧。' &&
    s32.h.posting === 'short' && s32.h.negatives === undefined && s32.h.taxi === '可・2,500円' && s32.h.interviewer === '笹川 晴央' && s32.h.date === '2026-10-10',
    'E1 Step① の入力は applicant と checklist.header に入る: ' + JSON.stringify(s32.h));
  // 9. 右サマリー
  const sum32 = await page.textContent('#summaryPanel');
  expect(['台本 花子', '大学2年生', '20歳', '短期求人', '笹川 晴央'].every(t => sum32.includes(t)) && !['シフト貢献度', '留意点', '通勤', '消極属性', '短期希望', '朝～12時のみ'].some(t => sum32.includes(t)),
    'E1 右サマリーに氏名・属性・短期求人・担当。消極属性・貢献度・留意点・通勤は出さない');
  const sa32 = await page.evaluate(() => { const c = document.getElementById('sumApplicant'); return { kids: Array.from(c.children).filter(e => e.tagName !== 'H4').map(e => e.id || e.className), badges: Array.from(c.querySelectorAll('.badge')).map(b => b.textContent) }; });
  expect(JSON.stringify(sa32.kids) === JSON.stringify(['sum-name', 'sum-sub', 'sumDate', 'sumInterviewer']) && JSON.stringify(sa32.badges) === JSON.stringify(['短期求人']),
    'E1 右サマリーの「応募者」は 氏名・区分/年齢/性別・面接日・担当 の 4 行（チップは短期求人 1 つだけ）: ' + JSON.stringify(sa32));
  await setCl('header.posting', 'regular');
  await wait(100);
  const sa32b = await page.$$eval('#sumApplicant .badge', els => els.map(b => b.textContent));
  expect(sa32b.length === 0 && !(await page.textContent('#sumApplicant')).includes('通常求人'), 'E1 求人が通常なら右サマリーに求人のチップを出さない: ' + JSON.stringify(sa32b));
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
  expect(fit32.every(x => x.bottom <= x.h && x.sy === 0 && x.inCard), 'E1 1440×900・1280×800 でスクロールなしに「面接チェックリストへ進む →」まで見え、入力欄はカードからはみ出さない: ' + JSON.stringify(fit32));
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
    'E1 性別のセレクトは 1440・1366・1280px（学生の区分）でも文言（選択／男性／女性／回答しない）が切れない幅: ' + JSON.stringify(gen32));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  // 10. 390px
  await page.setViewportSize({ width: 390, height: 900 });
  await wait(300);
  const ov32 = await overflowX();
  const col32 = await page.evaluate(() => ['name', 'age', 'gender', 'category'].map(k => Math.round(document.querySelector('[data-field="' + k + '"]').closest('.field').getBoundingClientRect().left)));
  expect(ov32 <= 1 && col32.every(x => x === col32[0]), 'E1 390px 幅の Step① は 1 列・横スクロールなし: ' + ov32 + ' ' + col32.join(','));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  await sshot('40-script-step1.png');
  // 11. 面接チェックリストへ
  await page.click('[data-action="script-next"]');
  await wait(400);
  expect(await step() === 3, 'E1 「面接チェックリストへ進む」で面接チェックリスト（内部キー 3）へ');

  // =====================================================================
  // E2 ② 面接チェックリスト → ③ 報告書（判定）
  // =====================================================================
  console.log('\n== E2 ② 面接チェックリスト → ③ 報告書 ==');
  const has33 = {};
  for (const sel of ['#cl-conditions', '#cl-continuity', '#cl-job', '#cl-teamwork', '#cl-reverse', '#clOverall', '#shiftConfirm', '#unresolvedAlert', '.cl-group-label']) has33[sel] = !!(await page.$(sel));
  expect(has33['#cl-conditions'] && has33['#cl-continuity'] && has33['#cl-job'] && has33['#cl-teamwork'] && has33['#cl-reverse'] && has33['#clOverall'] && !has33['#shiftConfirm'] && !has33['#unresolvedAlert'] && !has33['.cl-group-label'],
    'E2 Step② は ①〜⑤ と総合判断だけ（「面接で確認する項目」・未確認の留意点は出さない）: ' + JSON.stringify(has33));
  const hd33 = await page.textContent('#clHeader');
  expect(['台本 花子', '大学2年生', '20歳', '短期求人', '可・2,500円', '笹川 晴央', '2026/10/10', '応募者を編集'].every(t => hd33.includes(t)) && !hd33.includes('自動') && !(await page.$('#clHeader input, #clHeader select')),
    'E2 #clHeader の属性は Step① の入力から（読み取り専用・自動の表示なし）');
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
    'E2 #clHeader は 1 行（氏名・区分・年齢・求人・タクシー・面接日・担当＋応募者を編集。題名・説明文・目安・消極属性なし）: ' + JSON.stringify(hl33));
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
    'E2 1366px・1280px でも #clHeader のチップは 1 行（面接日はラベルなしの日付）・「応募者を編集」はカードの右上でチップと重ならず押せる: ' + JSON.stringify(hn33));
  // 「すべて説明した」（docs/SPEC-script-mode.md 12 章）。求人が短期なので「※短期求人のみ」も付く
  const ea33 = await page.$$eval('#stepContent [data-action="explain-all"]', els => els.map(e => e.dataset.block + ':' + e.textContent));
  expect(JSON.stringify(ea33) === JSON.stringify(['conditions_explain:すべて説明した', 'continuity_explain:すべて説明した', 'job_explain:すべて説明した', 'teamwork_explain:すべて説明した', 'reverse_notify:すべて説明した']),
    'E2 【説明】4 ブロックと⑤【合否連絡】の見出しの右に「すべて説明した」: ' + JSON.stringify(ea33));
  const exVals = (ids) => st(ids => { const v = window.RecruitApp.state.checklist.values; return ids.map(id => v[id] === true); }, ids);
  const exUi = (ids) => st(ids => ids.map(id => { const l = document.querySelector('label.cl-check[data-item="' + id + '"]'); return !!l && l.classList.contains('on') && l.querySelector('input').checked; }), ids);
  const EX1 = ['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch'];
  const exAll = (blk) => page.click('[data-action="explain-all"][data-block="' + blk + '"]').then(() => wait(120));
  const exTxt = (blk) => page.textContent('[data-action="explain-all"][data-block="' + blk + '"]');
  await exAll('conditions_explain');
  const ea33a = { v: await exVals(EX1), ui: await exUi(EX1), t: await exTxt('conditions_explain'), other: await exVals(['ex_submit']) };
  expect(ea33a.v.every(Boolean) && ea33a.ui.every(Boolean) && ea33a.t === 'すべて外す' && !ea33a.other[0], 'E2 1 クリックで ① の【説明】を全部チェック（短期求人なので ※ の 2 項目も）・ボタンは「すべて外す」・他のブロックは触らない: ' + JSON.stringify(ea33a));
  await exAll('conditions_explain');
  const ea33b = { v: await exVals(EX1), ui: await exUi(EX1), t: await exTxt('conditions_explain') };
  expect(ea33b.v.every(x => !x) && ea33b.ui.every(x => !x) && ea33b.t === 'すべて説明した' && await st(() => !Object.keys(window.RecruitApp.state.checklist.values).some(k => k.indexOf('ex_') === 0)),
    'E2 もう一度押すと全部外す（values から消える）・ボタンは「すべて説明した」: ' + JSON.stringify(ea33b));
  for (const id of ['ex_submit', 'ex_phone', 'ex_absence']) await page.click('label.cl-check[data-item="' + id + '"]');
  await wait(120);
  expect(await exTxt('continuity_explain') === 'すべて外す', 'E2 個別に全部チェックしてもボタンは「すべて外す」に変わる');
  await exAll('continuity_explain');
  expect((await exVals(['ex_submit', 'ex_phone', 'ex_absence'])).every(x => !x), 'E2 「すべて外す」で ② の【説明】を全部外す');
  await exAll('reverse_notify');
  const nt33 = await st(() => { const d = window.RecruitApp.state.profile.checklist; const b = d.sections.find(s => s.id === 'reverse').blocks.find(b => b.type === 'notify'); const v = window.RecruitApp.state.checklist.values; return b.items.map(it => v[it.id] === true); });
  expect(nt33.length >= 2 && nt33.every(Boolean) && await exTxt('reverse_notify') === 'すべて外す', 'E2 ⑤【合否連絡】も「すべて説明した」で全部チェック: ' + JSON.stringify(nt33));
  await exAll('reverse_notify');
  await exAll('conditions_explain');   // 撮影用に ① の【説明】だけチェックしておく
  const auto33 = await page.$$eval('#stepContent .cl-auto, #stepContent .cl-auto-hint', els => els.map(e => e.textContent.trim()).filter(Boolean));
  expect(auto33.length === 0, 'E2 必須条件・記入欄に応募情報からの自動表示（見込み・自動: …）を出さない: ' + auto33.join(' / '));
  expect((await page.textContent('#backToApplicant')).trim() === '← 応募者に戻る' && (await page.textContent('#toReportBtn')).trim() === '報告書へ進む →' && !(await page.$('#stepContent [data-action="to-step"][data-step="2"]')),
    'E2 戻る＝「← 応募者に戻る」・進む＝「報告書へ進む →」（申し送りへの導線なし）');
  await rateAll('good');
  await sshot('41-script-step2.png');
  await judge();
  const j33 = await judgment();
  expect(await step() === 4 && j33.mode === 'script' && j33.result === 'recommend' && j33.adjustments.length === 0, 'E2 必須条件すべて一致・確認点すべて○・総合判断「採用」→ 採用推奨（mode=script）: ' + JSON.stringify(j33));
  const paper33 = await page.evaluate(() => ({
    sheet: !!document.querySelector('#appPaper .cl-sheet.cl-mode-sheet'), tiles: Array.from(document.querySelectorAll('#appPaper .cl-tile .cl-tile-k')).map(e => e.textContent),
    judge: (document.querySelector('#appPaper .cl-judge') || {}).textContent || '', dec: !!document.querySelector('#appPaper .cl-decision.is-none#appPaperDecision') }));
  expect(paper33.sheet && JSON.stringify(paper33.tiles) === JSON.stringify(['結果', '総合判断', '必須条件', '確認点']) && paper33.judge.includes('採用推奨') && !paper33.judge.includes('シフト貢献度') && paper33.dec,
    'E2 報告書の紙プレビュー: 結果ストリップは 結果・総合判断・必須条件・確認点（貢献度タイルなし）＋最終合否（未押印）: ' + JSON.stringify(paper33.tiles));
  // ③ の紙は保存 HTML と同じ A4 縦の用紙（210×297mm・白地＋下線の見出し・押印行は用紙の中。docs/SPEC-a4.md 5 章）。公開版はロゴなし
  const a4p33 = await page.evaluate(() => { const p = document.getElementById('appPaper'), r = p.getBoundingClientRect(), z = parseFloat(p.style.zoom || '1');
    return { a4: p.classList.contains('a4'), w: +(r.width / z).toFixed(1), h: +(r.height / z).toFixed(1), title: (document.querySelector('#appPaper .cl-title .cl-title-t') || {}).textContent, logo: !!document.querySelector('#appPaper .cl-title-logo'),
      band: !!document.querySelector('#appPaper .cl-band'), stamps: Array.from(document.querySelectorAll('#appPaper .cl-stamps .stamp-box')).map(b => b.dataset.fieldId), cap: (document.querySelector('.report-paper-cap') || {}).textContent }; });
  expect(a4p33.a4 && Math.abs(a4p33.w - 793.7) <= 1 && Math.abs(a4p33.h - 1122.5) <= 1 && a4p33.title === '面接チェックリスト報告' && !a4p33.logo && !a4p33.band && JSON.stringify(a4p33.stamps) === JSON.stringify(['interviewer', 'final']) &&
    a4p33.cap.includes('保存した HTML はこの用紙 1 枚で開きます'),
    'E2 ③ の紙は A4 縦の用紙（210×297mm・見出しは白地＋下線・公開版はロゴなし・押印行 2 欄は用紙の中）: ' + JSON.stringify(a4p33));
  const lay33 = await page.evaluate(() => { const t = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top : null; };
    return { paper: t('#appPaperWrap'), mgmt: t('#mgmtCard'), dec: t('#decisionCard'), boxes: Array.from(document.querySelectorAll('#mgmtCard .stamp-box')).map(b => b.dataset.fieldId),
      cols: document.querySelector('#mgmtCard .stamp-row').classList.contains('cols-2'), grid: getComputedStyle(document.querySelector('#mgmtCard .stamp-row')).gridTemplateColumns.split(' ').length,
      save: (document.querySelector('#reportSaveBtn') || {}).textContent, print: (document.querySelector('#reportPrintBtn') || {}).textContent }; });
  expect(lay33.paper != null && lay33.paper < lay33.mgmt && lay33.mgmt < lay33.dec && JSON.stringify(lay33.boxes) === JSON.stringify(['interviewer', 'final']) && lay33.cols && lay33.grid === 2 &&
    lay33.save === '💾 報告書を保存（HTML）' && lay33.print === '🖨 A4 で印刷',
    'E2 報告書: 紙プレビュー → 押印（面接対応者・最終確認の 2 欄・2 列）→ 最終合否 → 「報告書を保存（HTML）」「A4 で印刷」: ' + JSON.stringify(lay33));
  const no33 = [];
  for (const sel of ['.result-card', '#clBreakdown', '.axis-grid', '#busyAllNightResult', '#applicantSummary', '#judgeWarnings']) if (await page.$('#stepContent ' + sel)) no33.push(sel);
  expect(no33.length === 0 && !(await page.textContent('#stepContent')).includes('シフト貢献度'), 'E2 報告書ステップに 2軸判定・貢献度・応募情報サマリーを出さない: ' + no33.join(' '));
  expect(await page.$eval('#mgmtCard .stamp-box[data-field-id="interviewer"] select', el => el.value) === '0', 'E2 Step① の面接担当者が押印欄「面接対応者」の初期選択');
  // 必須条件を不一致
  await navStep(3);
  await setCl('values.must_weekly', 'mismatch');
  await wait(150);
  // 打ち切りの案内（旧 E26。app.js の clMustAlertHtml・updateChecklistUI）: 「⑤ 逆質問へ進み…終了」・不一致あり・②〜④ は省略可（⑤ は対象外）・⑤ へ移動
  const ma33 = await st(() => ({ text: document.getElementById('clMustAlertText').textContent, state: document.getElementById('clState-conditions').textContent,
    skip: ['conditions', 'continuity', 'job', 'teamwork', 'reverse'].filter(id => document.getElementById('cl-' + id).classList.contains('cl-skippable')),
    jump: (document.querySelector('#clMustAlert [data-action="cl-jump"]') || {}).textContent }));
  expect(await visible('#clMustAlert') && ma33.text === '必須条件が一致しません（土日を含む週3日以上、5時間以上）。追加質問して解消しなければ ⑤ 逆質問へ進み、最大10分で終了してください（判定は不採用推奨になります）。' &&
    ma33.state.includes('不一致あり') && JSON.stringify(ma33.skip) === JSON.stringify(['continuity', 'job', 'teamwork']) && await visible('#clMustAlert [data-action="cl-jump"]') && ma33.jump === '⑤ 逆質問へ',
    'E2 必須条件の不一致: 赤い案内「⑤ 逆質問へ進み、最大10分で終了」・① に「不一致あり」・②〜④ に省略可（⑤ は対象外）・「⑤ 逆質問へ」ボタン: ' + JSON.stringify(ma33));
  const inView33 = () => st(() => { const r = document.getElementById('cl-reverse').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(100);
  const before33 = await inView33();
  await page.click('#clMustAlert [data-action="cl-jump"]');
  await wait(900);
  expect(!before33 && await inView33(), 'E2 「⑤ 逆質問へ」で ⑤ 逆質問へ移動（押す前は画面外）');
  await judge();
  const j33b = await judgment();
  expect(j33b.result === 'reject' && j33b.adjustments[0] === 'must_conditions' && (await page.textContent('#appPaper .cl-tile-res')).includes('不採用推奨'), 'E2 必須条件を「不一致」にすると不採用推奨（紙の結果タイルも）: ' + JSON.stringify(j33b));
  // 保留
  await navStep(3);
  await setCl('values.must_weekly', 'match');
  await wait(100);
  expect(!(await visible('#clMustAlert')) && await st(() => !document.querySelector('.cl-skippable') && !document.getElementById('clState-conditions').textContent.includes('不一致')),
    'E2 必須条件を一致に戻すと案内・省略可・「不一致あり」が消える');
  await setCl('overall', 'hold');
  await judge();
  const j33c = await judgment();
  expect(j33c.result === 'review' && j33c.adjustments.length === 0, 'E2 総合判断「保留」→ 上長最終判断要: ' + JSON.stringify(j33c));
  // 総合判断を未入力に
  await navStep(3);
  await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hold"]');
  await wait(100);
  await judge();
  const j33d = await judgment();
  expect(await step() === 4 && j33d.result === 'review' && await st(() => window.RecruitApp.state.checklist.overall) === '' && (await txtIn(page, '#scriptWarnings')).includes('総合判断が未入力'),
    'E2 総合判断が未入力でも報告書へ進め、上長最終判断要＋警告（#scriptWarnings）: ' + JSON.stringify(j33d));
  await navStep(3);
  await setCl('overall', 'hire');
  await judge();
  expect((await judgment()).result === 'recommend' && !(await page.$('#scriptWarnings')), 'E2 総合判断「採用」に戻すと採用推奨・警告なし');
  const sm33 = { result: await txtIn(page, '#sumResult'), must: await txtIn(page, '#sumMust'), marks: await txtIn(page, '#sumMarks'), ov: await txtIn(page, '#sumOverall'), stamps: await txtIn(page, '#sumStamps') };
  expect(sm33.result.includes('採用推奨') && sm33.must.includes('すべて一致') && sm33.marks.includes('○7') && sm33.ov.includes('採用') && sm33.stamps.includes('面接対応者'),
    'E2 右サマリーに必須条件・採点・総合判断・結果・押印状況: ' + JSON.stringify(sm33));
  await sshot('42-script-step3.png');

  // =====================================================================
  // E3 押印 → 保存 → 保存 HTML（報告書表示・詳細・最終合否）→ 読込
  // =====================================================================
  console.log('\n== E3 押印 → 保存 HTML → 最終合否 → 読込 ==');
  await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
  await wait(150);
  expect(!!(await page.$('#mgmtCard .stamp-box[data-field-id="interviewer"] svg.hanko')) && await st(() => (window.RecruitApp.state.management.interviewer || {}).name) === '笹川 晴央' &&
    !!(await page.$('#appPaper .cl-stamps .stamp-box[data-field-id="interviewer"] svg.hanko')),
    'E3 「面接対応者」に押印（初期選択のまま押せる）・③ の紙の押印行にもハンコ');
  await page.selectOption('#decisionManager', { label: SASA });
  await page.click('#decisionCard [data-action="decide"][data-value="hire"]');
  await wait(200);
  const hire34 = !!(await page.$('#appPaper .cl-decision.is-hire svg.verdict-stamp'));
  await page.click('#decisionCard [data-action="undecide"]');
  await wait(150);
  const none34 = !!(await page.$('#appPaper .cl-decision.is-none'));
  await page.click('#mgmtCard .stamp-box[data-field-id="final"] [data-action="unstamp"]');
  await wait(150);
  expect(hire34 && none34 && !(await st(() => window.RecruitApp.state.management.final)), 'E3 アプリの最終合否で紙プレビューの合否欄も描き直す（採用 → 取消で未押印）');
  const saved34 = await saveRecord('script-report.html');
  const r34 = saved34.rec;
  expect(!('mode' in r34) && !('handoff' in r34) && !('scores' in r34) && !('contribution' in r34) && r34.decision == null && r34.step === 4 && r34.management.interviewer.name === '笹川 晴央' &&
    !('initial' in r34.management) && r34.checklist.header.taxi === '可・2,500円' && r34.judgment.mode === 'script' && Object.keys(r34.applicant).length === 6 &&
    saved34.html.includes('<body class="a4-doc" data-filename="応募者_台本_花子_2026-10-10.html">'),
    'E3 保存: 記録に mode・handoff・scores・contribution が無い・応募者 6 キー・判定（mode=script）・body.a4-doc: ' + Object.keys(r34).join(','));
  // 保存 HTML は A4 縦の用紙 1 枚そのもの（docs/SPEC-a4.md 1 章）。詳細表示・印刷用の複製・押印カード・合否パネルは無い
  const in34 = ['<main class="a4" id="a4">', 'class="cl-title"', 'id="a4Decision"', 'class="cl-stamps"'].filter(t => !saved34.html.includes(t));
  const out34 = ['<h2>面接者への申し送り（留意点）</h2>', '<h2>シフト貢献度</h2>', '<h2>面接で確認した情報</h2>', '<h2>面接前に分かっている情報（未確認）</h2>', '<h2>応募時の情報</h2>', '<h2>面接者への申し送りコメント</h2>',
    'id="rtPrintSheet"', 'id="rtPrintAll"', 'class="dash"', 'data-tile=', '<section class="sec" data-sec="contrib"', '<section class="sec" data-sec="handoff"', '初期対応者', 'data-field-id="initial"',
    'id="rtViewFull"', 'id="rtPrintChecklist"', 'id="clPaper"', 'id="clSheet"', 'id="mgmt"', 'id="decision"', '<section class="sec"', 'class="rh"', '<h2>'].filter(t => saved34.html.includes(t));
  expect(!in34.length && !out34.length, 'E3 保存 HTML は A4 の用紙 1 枚（見出し・最終合否・押印行は用紙の中。詳細表示・印刷用の複製・押印カード・合否パネル・留意点・申し送り・ダッシュ・初期対応者なし）: ' + JSON.stringify({ missing: in34, extra: out34 }));
  // 消極属性は 2026-10-13 に削除: 保存 HTML（埋め込みの記録を含む）に「消極属性」「朝～12時のみ」が無い
  expect(!saved34.html.includes('消極属性') && !saved34.html.includes('朝～12時のみ') && r34.checklist.header.negatives === undefined && !('negatives' in r34.checklistDef.header),
    'E3 保存 HTML・記録に消極属性が無い');
  const rp34Err = [];
  const rp34 = await newReportPage(rp34Err);
  await rp34.goto('file://' + saved34.file);
  await rp34.waitForTimeout(300);
  const cls34 = await rp34.evaluate(() => document.body.className);
  expect(cls34 === 'a4-doc a4-live' && await shownIn(rp34, '#a4 .cl-sheet') && await shownIn(rp34, '#a4Decision') && (await rp34.$$('#a4 .cl-stamps .stamp-box')).length === 2 &&
    await shownIn(rp34, '#a4 .cl-stamps .stamp-box[data-field-id="final"]') && !(await rp34.$('.pop')) && !(await rp34.$('.savebar')) && rp34Err.length === 0,
    'E3 保存 HTML は A4 の用紙 1 枚で開く（最終合否・押印行 2 欄は用紙の中。窓・保存バーなし・エラーなし）: ' + cls34);
  const hd34 = await txtIn(rp34, '#a4 .cl-sheet-head');
  expect(['面接チェックリスト報告', '台本 花子', '大学2年生・20歳・女性', '2029年3月', '短期求人', '可・2,500円', '2026/10/10', '笹川 晴央'].every(t => hd34.includes(t)) &&
    !hd34.includes('短期希望') && !hd34.includes('消極属性') && !hd34.includes('目安') && !(await rp34.$('#a4 .cl-title-logo')),
    'E3 用紙の見出しは 題名・氏名・区分・年齢・性別・卒業予定・求人・タクシー・面接日・担当（消極属性・短期希望・目安なし。公開版はロゴなし）: ' + hd34);
  const pj34 = await txtIn(rp34, '#a4 .cl-judge');
  expect(['必須条件', '総合判断', '確認点', '採用推奨'].every(t => pj34.includes(t)) && !pj34.includes('シフト貢献度') && !pj34.includes('2軸'), 'E3 用紙の結果ストリップ（必須条件・総合判断・確認点・結果。貢献度・2軸なし）');
  // 「詳細」表示は無い（2026-10-14）。① の項目は用紙の見出し、Step① の「メモ（任意）」は面接メモの「メモ」
  const who34 = await txtIn(rp34, '#a4 .cl-who');
  const memo34 = await rp34.evaluate(() => ({ keys: Array.from(document.querySelectorAll('#a4 .cl-nm-row .cl-nm-k')).map(e => e.textContent.trim()), memo: (document.querySelector('#a4 .cl-nm-memo .cl-nm-v') || {}).textContent }));
  expect(!(await rp34.$('#rtViewFull')) && !(await rp34.$('section.sec')) && !(await rp34.$('.rh')) && !(await rp34.$('.rtool')) &&
    ['台本 花子', '20歳', '女性', '大学2年生', '2029年3月', '短期求人', '可・2,500円', '2026/10/10', '笹川 晴央'].every(t => who34.includes(t)) && !who34.includes('通勤') && !who34.includes('勤務期間') &&
    memo34.memo === '電話の受け答えが丁寧。' && memo34.keys.includes('メモ') && !memo34.keys.some(t => t.includes('備考')),
    'E3 「詳細」表示なし。応募者の項目は用紙の見出し・① のメモは面接メモの「メモ」（「備考」は出さない）: ' + JSON.stringify({ who34, memo34 }));
  await rp34.mouse.move(0, 0);
  await rp34.screenshot({ path: path.join(OUT, '44-script-report.png'), fullPage: true });
  // 最終合否: 用紙の欄をクリック → 窓で担当者を選んで「採用」（docs/SPEC-a4.md 3-6）
  await openDecision(rp34);
  const pop34 = await rp34.evaluate(() => { const p = document.getElementById('a4Pop'); return p && { h: p.querySelector('.pop-h').textContent, sel: p.querySelector('select').value, ref: (p.querySelector('.pop-ref') || {}).textContent || '',
    btns: Array.from(p.querySelectorAll('[data-act]')).map(b => b.getAttribute('data-act') + (b.getAttribute('data-value') ? ':' + b.getAttribute('data-value') : '')) }; });
  expect(!!pop34 && pop34.h === '最終合否' && pop34.sel === '' && pop34.ref === 'アプリの判定：採用推奨' && JSON.stringify(pop34.btns) === JSON.stringify(['decide:hire', 'decide:reject', 'close']),
    'E3 用紙の「最終合否」をクリックすると窓（担当者・アプリの判定・採用／不採用・閉じる。合否が無いので取消なし）: ' + JSON.stringify(pop34));
  await popSel(rp34, SASA);
  await popAct(rp34, 'decide', 'hire');
  const fn34 = await rp34.evaluate(() => document.body.getAttribute('data-filename'));
  expect(!(await rp34.$('#a4Pop')) && !!(await rp34.$('#a4Decision.is-hire svg.verdict-stamp')) && !!(await rp34.$('#a4 .stamp-box[data-field-id="final"] svg.hanko')) && fn34 === '応募者_台本_花子_2026-10-10_採用.html' &&
    (await txtIn(rp34, '#saveBarMsg')) === '押印・合否を変更しました' && (await txtIn(rp34, '#saveBarBtn')) === '押印を保存',
    'E3 「採用」→ 窓が閉じる（判定と一致するので注記なし）・用紙に採用スタンプ・最終確認に自動押印・ファイル名 _採用・右下に保存バー: ' + fn34);
  const [dl34] = await Promise.all([rp34.waitForEvent('download'), rp34.click('#saveBarBtn')]);
  const file34b = path.join(OUT, 'script-report-hire.html');
  await dl34.saveAs(file34b);
  const r34b = parseRecord(fs.readFileSync(file34b, 'utf8'));
  expect(!('mode' in r34b) && r34b.decision && r34b.decision.result === 'hire' && r34b.management.final && r34b.management.final.name === '笹川 晴央' && r34b.management.interviewer.name === '笹川 晴央' &&
    (await txtIn(rp34, '#saveBarMsg')) === '保存しました（保存できなかったときは再保存）' && (await txtIn(rp34, '#saveBarBtn')) === '再保存',
    'E3 「押印を保存」で再出力したファイルに decision（採用）・最終確認（mode は書かない）。バーは「保存しました…」「再保存」');
  await rp34.goto('file://' + file34b);
  await rp34.waitForTimeout(300);
  const pdf34 = path.join(OUT, 'script-report.pdf');
  await rp34.pdf({ path: pdf34, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await rp34.waitForTimeout(100);
  const n34 = pdfPagesOf(pdf34);
  const t34 = pdfTextOf(pdf34);
  console.log('script-report.pdf pages:', n34);
  expect((n34 === -1 || n34 === 1) && (t34 === null || (t34.includes('面接チェックリスト報告') && !t34.includes('シフト貢献度') && !t34.includes('消極属性'))),
    'E3 保存 HTML をそのまま印刷すると面接チェックリスト報告（A4 1 枚・貢献度なし）: ' + n34);
  // PDF の本文に 結果・氏名・最終合否・押した人（笹川晴央）。説明文・質問文は載せない（pdftotext の空白は詰めて比べる）
  expect(t34 === null || (['採用推奨', '台本花子', '最終合否', '笹川晴央', '確認点', '必須条件', '面接メモ', '面接対応者', '最終確認'].every(t => t34.includes(t)) && !t34.includes('歌舞伎町ですので') && !t34.includes('シフト提出は木曜23時')),
    'E3 A4 報告の PDF に 結果・氏名・最終合否・笹川晴央・押印欄（質問文・説明文なし）: ' + (t34 === null ? 'pdftotext なし（省略）' : 'ok'));
  expect(rp34Err.length === 0, 'E3 保存 HTML のページエラー・console error なし: ' + (rp34Err.join(' / ') || 'none'));
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  const s34 = await st(() => { const s = window.RecruitApp.state; return { step: s.step, d: s.decision && s.decision.result, final: (s.management.final || {}).name }; });
  expect(s34.step === 4 && (await page.$$('#stepNav li')).length === 3 && s34.d === 'hire' && s34.final === '笹川 晴央' && !!(await page.$('#decisionCard svg.verdict-stamp')) &&
    !!(await page.$('#appPaper .cl-decision svg.verdict-stamp')) && (await txtIn(page, '#sumDecision')).includes('採用・笹川') && (await page.$$('#appPaper .cl-stamps svg.hanko')).length === 2,
    'E3 アプリで読み込むと報告書（③）に合否・押印を引き継ぐ（紙の押印行にハンコ 2 つ）: ' + JSON.stringify(s34));
  // 往復（docs/SPEC-a4.md A11）: 書き出したファイルをアプリで読み込み → 保存し直し → 開く
  const saved34c = await saveRecord('script-report-hire-resaved.html');
  await rp34.goto('file://' + saved34c.file);
  await rp34.waitForTimeout(300);
  expect(!!(await rp34.$('#a4Decision.is-hire svg.verdict-stamp')) && (await rp34.$$('#a4 .cl-stamps svg.hanko')).length === 2 && saved34c.html.includes('_採用.html">') && rp34Err.length === 0,
    'E3 往復: 保存 HTML → アプリで読込 → 再保存 → 開くと採用スタンプ・押印 2 つ（エラーなし）');
  await rp34.close();
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  await page.emulateMedia({ media: 'print' });
  const pdf34a = path.join(OUT, 'script-report-app.pdf');
  await page.pdf({ path: pdf34a, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: null });
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  const n34a = pdfPagesOf(pdf34a);
  expect(n34a === -1 || n34a === 1, 'E3 アプリの A4 印刷（面接チェックリスト報告）も 1 ページ: ' + n34a);
  await sshot('46-script-report-loaded.png');

  // =====================================================================
  // E4 旧レコードの読み込み（docs/SPEC-slim.md 3-4。full-mode-last で保存した記録・v1）
  // =====================================================================
  console.log('\n== E4 旧レコードの読み込み ==');
  // 1. 詳細モードで回答・2 軸判定まで済んだ記録
  const fxFull = path.join(FIX, 'legacy-full-checklist.html');
  const rFull = parseRecord(fs.readFileSync(fxFull, 'utf8'));
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', fxFull);
  await wait(500);
  const t4a = await toastText();
  const s4a = await st(() => { const s = window.RecruitApp.state; return { step: s.step, keys: Object.keys(s.applicant), name: s.applicant.name, n: Object.keys(s.checklist.values).length, j: s.judgment && s.judgment.mode, mg: Object.keys(s.management) }; });
  expect(s4a.step === 4 && (await page.$$('#stepNav li')).length === 3 && s4a.name === '面接 花子' && s4a.n === Object.keys(rFull.checklist.values).length && s4a.j === 'script' &&
    t4a.includes('詳細モードで保存された記録です') && !(await page.textContent('#stepContent')).includes('シフト貢献度'),
    'E4 詳細モードの記録（回答・判定あり）はエラーなく ③ 報告書で開き、回答は保持・toast で案内: ' + JSON.stringify(s4a) + ' ' + t4a);
  expect(JSON.stringify(s4a.keys) === JSON.stringify(['name', 'gender', 'age', 'category', 'graduationDate', 'reviewerNotes']), 'E4 応募者データは 6 キー（勤務条件・通勤などの詳細は読み込まない）: ' + s4a.keys.join(','));
  const saved4 = await saveRecord('legacy-full-resaved.html');
  const r4 = saved4.rec;
  expect(['mode', 'handoff', 'scores', 'contribution', 'highschool', 'inputStages'].every(k => !(k in r4)) && Object.keys(r4.applicant).length <= 6 &&
    JSON.stringify(r4.checklist.values) === JSON.stringify(rFull.checklist.values) && r4.judgment.mode === 'script',
    'E4 保存し直すと mode・handoff・scores・contribution・highschool・inputStages が無く、応募者は 6 キー以内・回答は同じ: ' + Object.keys(r4).join(','));
  // 2. 初期対応者／面接対応者／最終確認の 3 印が押された記録（申し送りの段階で保存）
  const fxSt = path.join(FIX, 'legacy-full-stamps3.html');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', fxSt);
  await wait(500);
  const t4b = await toastText();
  const s4b = await st(() => { const s = window.RecruitApp.state; return { step: s.step, name: s.applicant.name, mg: Object.keys(s.management) }; });
  expect(s4b.step === 3 && s4b.name === '押印 太郎' && JSON.stringify(s4b.mg) === JSON.stringify(['interviewer', 'final']) && t4b.includes('初期対応者の押印欄は廃止したため表示しません') && t4b.includes('詳細モードで保存された記録です'),
    'E4 初期対応者の印がある記録: state.management に initial が無い・② から再開・toast で案内: ' + JSON.stringify(s4b) + ' ' + t4b);
  await judge();
  const st4 = await page.evaluate(() => Array.from(document.querySelectorAll('#mgmtCard .stamp-box')).map(b => b.dataset.fieldId + ':' + !!b.querySelector('svg.hanko')));
  expect(JSON.stringify(st4) === JSON.stringify(['interviewer:true', 'final:true']) && !(await page.textContent('#mgmtCard')).includes('初期対応者'), 'E4 押印欄は 2 つ（面接対応者・最終確認に印。初期対応者の欄なし）: ' + st4.join(','));
  const saved4b = await saveRecord('legacy-stamps3-resaved.html');
  expect(!saved4b.html.includes('data-field-id="initial"') && !saved4b.html.includes('初期対応者') && JSON.stringify(Object.keys(saved4b.rec.management)) === JSON.stringify(['interviewer', 'final']),
    'E4 保存し直した HTML に初期対応者の欄・印が無い');
  const rp4Err = [];
  const rp4 = await newReportPage(rp4Err);
  for (const f of [fxFull, fxSt, saved4.file, saved4b.file]) { await rp4.goto('file://' + f); await rp4.waitForTimeout(250); }
  expect(rp4Err.length === 0, 'E4 旧い保存 HTML・保存し直した HTML もブラウザでエラーなく開く: ' + (rp4Err.join(' / ') || 'none'));
  await rp4.close();
  // 3. v1 の記録（schemaVersion 1・旧 10 項目の点数）
  const fxV1 = path.join(FIX, 'v1-record.html');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', fxV1);
  await wait(500);
  const t4c = await toastText();
  const s4c = await st(() => { const s = window.RecruitApp.state; return { step: s.step, name: s.applicant.name, keys: Object.keys(s.applicant).length, j: s.judgment }; });
  expect(s4c.step === 3 && s4c.name === parseRecord(fs.readFileSync(fxV1, 'utf8')).applicant.name && s4c.keys === 6 && s4c.j === null && t4c.includes('旧形式の面接評価（10 項目×5 点）は読み込みません') &&
    !(await page.$('#legacyScores')) && !(await page.textContent('#stepContent')).includes('旧形式'),
    'E4 v1 の記録はエラーなく ② で開く（旧評価は読み込まず、面接チェックリストで評価し直す）: ' + JSON.stringify(s4c) + ' ' + t4c);

  // =====================================================================
  // E5 ダークモードの紙・390px
  // =====================================================================
  console.log('\n== E5 ダーク・390px ==');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  await page.click('#btnTheme');
  await wait(200);
  const dk36 = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.getElementById('appPaper')).backgroundColor,
    color: getComputedStyle(document.querySelector('#appPaper .cl-sheet')).color,
    hanko: Array.from(document.querySelectorAll('#appPaper .cl-stamps svg.hanko')).map(e => getComputedStyle(e).filter), card: getComputedStyle(document.querySelector('#mgmtCard svg.hanko')).filter }));
  expect(await step() === 4 && dk36.theme === 'dark' && dk36.bg === 'rgb(255, 255, 255)' && dk36.color === 'rgb(17, 17, 17)', 'E5 ダークモードでも報告書の紙プレビューは白地・黒字: ' + JSON.stringify(dk36));
  expect(dk36.hanko.length === 2 && dk36.hanko.every(f => f === 'none') && dk36.card !== 'none', 'E5 ダークモードでも紙の押印行のハンコは明るさ補正なし（filter: none。押印カードのハンコは従来どおり補正）: ' + JSON.stringify({ hanko: dk36.hanko, card: dk36.card }));
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
  expect(nw36.sw > nw36.cw && nw36.ov <= 1 && ov36b <= 1 && ov36c <= 1, 'E5 390px 幅で横スクロールなし（報告書は紙だけ横スクロール・面接チェックリスト・応募者も）: ' + JSON.stringify({ nw36, ov36b, ov36c }));
  await sshot('47-script-narrow.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);

  // =====================================================================
  // E6 ③ を開かずに ② から保存・印刷しても判定が入る・印刷の経路・総合判断未入力の保存
  // =====================================================================
  console.log('\n== E6 ② から保存・印刷 ==');
  const names37 = await page.evaluate(() => ({ nav: document.querySelector('.nav-item[data-view="judge"]').textContent.trim(), top: document.getElementById('topTitle').textContent, side: document.getElementById('stepSectionTitle').textContent }));
  expect(names37.nav.endsWith('報告書の作成') && names37.top === '面接チェックリスト報告' && names37.side === '手順', 'E6 画面名は 報告書の作成／面接チェックリスト報告／手順: ' + JSON.stringify(names37));
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
  expect(ex37.fare && ex37.hours && !ex37.contract && !ex37.sw && ex37.t === 'すべて外す', 'E6 求人が通常なら「すべて説明した」で ※短期求人のみ の項目は付かない（それ以外で全部 → 「すべて外す」）: ' + JSON.stringify(ex37));
  await page.click('label.cl-check[data-item="ex_contract"]');   // 通常求人でも手で付けた ※ の項目は「すべて外す」で外れる
  await wait(100);
  await page.click('[data-action="explain-all"][data-block="conditions_explain"]');
  await wait(120);
  expect(await st(() => !['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch'].some(id => window.RecruitApp.state.checklist.values[id] === true)), 'E6 「すべて外す」はブロックの全項目（手で付けた ※ の項目も）を外す');
  await rateAll('good');
  expect(await step() === 3 && await st(() => window.RecruitApp.state.judgment) === null, 'E6 ② では未判定（state.judgment なし）');
  // 1. ② から保存（③ は開かない）
  const saved37 = await saveRecord('script-step2-save.html');
  const r37 = saved37.rec;
  expect(await step() === 3 && r37.step === 3 && !!r37.judgment && r37.judgment.mode === 'script' && r37.judgment.result === 'recommend',
    'E6 ② から保存しても判定（mode=script・採用推奨）を記録する（③ は開かない）: ' + JSON.stringify(r37.judgment && [r37.judgment.mode, r37.judgment.result, r37.step]));
  expect((await txtIn(page, '#sumResult')).includes('採用推奨'), 'E6 右サマリーの結果も記録した判定');
  const rp37Err = [];
  const rp37 = await newReportPage(rp37Err);
  await rp37.goto('file://' + saved37.file);
  await rp37.waitForTimeout(300);
  const tile37 = await txtIn(rp37, '#a4 .cl-tile-res');
  const dash37 = !!(await rp37.$('.dash'));
  expect(tile37.includes('採用推奨') && !tile37.includes('未実施') && !dash37,
    'E6 保存 HTML の用紙の結果タイルに採用推奨（「未実施」なし。ダッシュ .dash は無い）: ' + JSON.stringify({ tile37, dash37 }));
  expect(rp37Err.length === 0, 'E6 保存 HTML のページエラー・console error なし: ' + (rp37Err.join(' / ') || 'none'));
  await rp37.close();
  // 2. 保存後に ③ を開いても同じ判定
  await judge();
  const j37 = await judgment();
  expect(await step() === 4 && j37.result === r37.judgment.result && j37.title === r37.judgment.title && (await txtIn(page, '#appPaper .cl-tile-res')).includes(r37.judgment.title),
    'E6 保存後に ③ を開いても同じ判定: ' + JSON.stringify([j37.result, r37.judgment.result]));
  // 3. ② で保存した記録は読み込むと ② から再開する（判定が入っていても ③ に飛ばない）
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved37.file);
  await wait(500);
  expect(await step() === 3 && await st(() => window.RecruitApp.state.applicant.name) === '台本 次郎' && await st(() => window.RecruitApp.state.judgment) === null,
    'E6 ② で保存した記録は読み込むと ② 面接チェックリストから再開');
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
  expect(await st(() => window.RecruitApp.state.checklist.overall) === '' && await st(() => window.RecruitApp.state.judgment) === null, 'E6 総合判断を外す（未入力・未判定）');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await wait(100);
  const bp37 = await prState();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await wait(100);
  const ap37 = await prState();
  expect(bp37.cls && bp37.host > 0 && bp37.res.includes('上長最終判断要') && bp37.j === 'review' && !ap37.cls && ap37.host === 0,
    'E6 beforeprint で body.print-checklist（A4 報告に結果: 総合判断未入力 → 上長最終判断要）・afterprint で外す: ' + JSON.stringify({ bp37, ap37 }));
  // 4-2. トップバー 🖨（判定を無効にしてから）
  await setCl('overall', 'reject');
  await wait(100);
  expect(await st(() => window.RecruitApp.state.judgment) === null, 'E6 入力を変えると判定は無効');
  await page.click('#btnPrint');
  await wait(150);
  const tp37 = await prState();
  expect(tp37.calls.length === 1 && tp37.calls[0].cls && tp37.calls[0].res.includes('不採用推奨') && tp37.j === 'reject',
    'E6 トップバー 🖨: body.print-checklist を付けて window.print（A4 報告に現在の入力の結果: 不採用推奨）: ' + JSON.stringify(tp37));
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await wait(100);
  expect(!(await prState()).cls, 'E6 印刷後（afterprint）に body.print-checklist を外す');
  // 4-3. ② の「🖨 面接チェックリスト報告（A4）」
  await setCl('overall', 'hire');
  await wait(100);
  await page.click('#clPrintBtn');
  await wait(150);
  const cp37 = await prState();
  expect(cp37.calls.length === 2 && cp37.calls[1].cls && cp37.calls[1].res.includes('採用推奨') && cp37.j === 'recommend',
    'E6 ② の「面接チェックリスト報告（A4）」も判定を入れて印刷: ' + JSON.stringify(cp37.calls));
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await wait(100);
  // 5. 総合判断が未入力のまま保存すると警告（保存は止めない）
  await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hire"]');
  await wait(100);
  const saved37b = await saveRecord('script-overall-missing.html');
  const t37 = await toastText();
  expect(t37.includes('総合判断が未入力です') && saved37b.rec.checklist.overall === '' && saved37b.rec.judgment && saved37b.rec.judgment.result === 'review',
    'E6 総合判断が未入力のまま保存すると toast に「総合判断が未入力です」（保存はする）: ' + t37);
  // 回答が無くても（① だけで保存）総合判断の警告を出す
  await page.click('#btnNew');
  await wait(200);
  await fillScript({ name: '台本 三郎' });
  await saveRecord('script-step1-save.html');
  const t37c = await toastText();
  expect(t37c.includes('総合判断が未入力です'), 'E6 チェックリストが未入力でも総合判断が空なら保存時に警告: ' + t37c);

  // =====================================================================
  // E7 旧レコード（消極属性入り）の読み込み（docs/SPEC-script-mode.md 12 章）
  // =====================================================================
  console.log('\n== E7 旧レコード（消極属性入り）の読み込み ==');
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
    'E7 消極属性入りの旧レコードもエラーなく読め、右サマリーに消極属性を出さない: ' + JSON.stringify(s38));
  const paper38 = (await txtIn(page, '#appPaper .cl-sheet-head'));
  expect(paper38.includes('短期求人') && !['短期希望', '消極属性', '朝～12時のみ'].some(t => paper38.includes(t)), 'E7 報告書の紙（A4 ヘッダー）に消極属性を出さない: ' + paper38);
  await navStep(3);
  const hd38 = await page.textContent('#clHeader');
  expect(await step() === 3 && hd38.includes('短期求人') && !['短期希望', '消極属性', '朝～12時のみ'].some(t => hd38.includes(t)), 'E7 ② のヘッダーに消極属性を出さない: ' + hd38);
  await navStep(1);
  expect(!(await page.$('#saNegatives, [data-cl^="header.negatives"]')) && !(await page.textContent('#scriptApplicantCard')).includes('短期希望'), 'E7 ① にも消極属性の入力・表示なし');
  const saved38 = await saveRecord('script-old-negatives-resaved.html');
  const shown38 = saved38.html.replace(/<script type="application\/json" id="recruit-record">[\s\S]*?<\/script>/, '');
  expect(!shown38.includes('消極属性') && !shown38.includes('朝～12時のみ') && saved38.rec.checklist.header.posting === 'short' && !('negatives' in saved38.rec.checklistDef.header),
    'E7 保存し直した HTML の表示部分に消極属性なし・台本（checklistDef）からは外れる');
  const rp38Err = [];
  const rp38 = await newReportPage(rp38Err);
  await rp38.goto('file://' + file38);
  await rp38.waitForTimeout(300);
  const p38 = await rp38.evaluate(() => document.body.innerText);
  expect(rp38Err.length === 0 && !['消極属性', '朝～12時のみ'].some(t => p38.includes(t)) && p38.includes('短期求人'), 'E7 旧レコードから作った保存 HTML もエラーなし・消極属性なし: ' + (rp38Err.join(' / ') || 'ok'));
  await rp38.close();

  // =====================================================================
  // E8 A4 報告（1 ページの要約。2026-10-14。docs/SPEC-checklist.md 4-2・4-5）
  //   副支配人「出力される報告書が煩雑すぎて頭に入ってこない。わかりやすく、かつ1ページで」
  // =====================================================================
  console.log('\n== E8 A4 報告（1 ページの要約） ==');
  // 1. 標準の記録（E3 の再出力ファイル: 採用・押印あり）をアプリで開く → ③ の紙プレビュー
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  const QS39 = ['歌舞伎町ですので', '前のアルバイトの期間と退職理由は', '忙しいときこそ心掛けたいことは', '何か気になる点はありますか', 'シフト提出は木曜23時', '多忙・立ち仕事・汚物清掃の可否', '「大丈夫です」のみ連呼', '条件一致：2へ', '採用を検討できる人には不安解消の時間を取る'];
  // 紙プレビューの計測（page.evaluate に渡す関数。引数 [紙のセレクタ, 出てはいけない文言]）
  const paperOf = ([sel, qs]) => {
    const sh = document.querySelector(sel + ' .cl-sheet'), t = sh.textContent, top = sh.getBoundingClientRect().top, z = sh.getBoundingClientRect().width / sh.offsetWidth || 1;
    return { qs: qs.filter(q => t.includes(q)), res: Math.round((document.querySelector(sel + ' .cl-tile-res').getBoundingClientRect().top - top) / z),
      rows: sh.querySelectorAll('.cl-rt tr[data-cl-item]').length, must: sh.querySelectorAll('.cl-mtab tr[data-cl-item]').length, h: Math.round(sh.getBoundingClientRect().height / z), cls: sh.className,
      order: Array.from(sh.children).map(el => el.className.split(' ').slice(0, 2).join('.')), res2: (sh.querySelector('.cl-tile-res .cl-tile-v') || {}).textContent };
  };
  const pv39 = await page.evaluate(paperOf, ['#appPaper', QS39]);
  expect(await step() === 4 && pv39.qs.length === 0 && pv39.res >= 0 && pv39.res <= 160 && pv39.rows === 7 && pv39.must === 2 && pv39.res2 === '採用推奨' && !pv39.cls.includes('cl-compact') && pv39.h <= 1052,
    'E8 ③ の紙プレビュー: 質問文・説明文・補足・注記なし・結果バッジは紙の上端から 160px 以内・確認点 7 行・必須条件 2 行（標準のサンプルは .cl-compact なし）: ' + JSON.stringify(Object.assign({}, pv39, { order: undefined })));
  expect(JSON.stringify(pv39.order) === JSON.stringify(['cl-sheet-head', 'cl-judge', 'cl-cols', 'cl-blk.cl-blk-rate', 'cl-blk.cl-blk-notes', 'cl-exline', 'cl-stamps']),
    'E8 紙の並び: 見出し → 結果ストリップ → 必須条件｜勤務条件の確認 → 確認点 → 面接メモ → 説明・連絡 → 押印行: ' + JSON.stringify(pv39.order));
  // 2. 1280px・1366px・1440px で横スクロールなし（アプリ ③ の紙・保存 HTML の用紙。保存 HTML は 1280px 以上なら縮小しない）。
  //   アプリ ③ は紙を縮小しない（本文 9.5px のまま）: 右サマリーの横に紙が等倍で入らない幅は右サマリーを紙の下に回す（.judge-layout.paper-stack）
  const rp39Err = [];
  const rp39 = await newReportPage(rp39Err);
  await rp39.goto('file://' + file34b);
  await rp39.waitForTimeout(300);
  const wide39 = [];
  for (const w of [1280, 1366, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await rp39.setViewportSize({ width: w, height: 900 });
    await wait(250);
    const ov = (pg, wrapSel) => pg.evaluate((ws) => { const el = document.querySelector(ws); return { doc: document.documentElement.scrollWidth - window.innerWidth, wrap: el.scrollWidth - el.clientWidth }; }, wrapSel);
    const fz = await page.evaluate(() => {
      const p = document.getElementById('appPaper'), z = parseFloat(p.style.zoom || '1');
      const px = (sel) => +(parseFloat(getComputedStyle(document.querySelector('#appPaper ' + sel)).fontSize) * z).toFixed(2);
      return { zoom: z, body: px('.cl-rt-lbl'), label: px('dl.cl-kv dt'), res: px('.cl-tile-res .cl-tile-v'), stack: document.querySelector('#view-judge .judge-layout').classList.contains('paper-stack'),
        below: document.getElementById('summaryPanel').getBoundingClientRect().top >= p.getBoundingClientRect().bottom };
    });
    const rep = await rp39.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, wrap: 0, zoom: getComputedStyle(document.documentElement).getPropertyValue('--a4-zoom').trim() }));
    wide39.push({ w, app: await ov(page, '#appPaperWrap'), rep, res: (await page.evaluate(paperOf, ['#appPaper', QS39])).res, fz });
    if (w === 1280) await sshot('49-script-step3-1280.png');
  }
  expect(wide39.every(x => x.app.doc <= 1 && x.app.wrap <= 1 && x.rep.doc <= 1 && x.rep.zoom === '' && x.res <= 160), 'E8 1280px・1366px・1440px で横スクロールなし（アプリ ③ の紙・保存 HTML の用紙は縮小しない）: ' + JSON.stringify(wide39.map(x => ({ w: x.w, app: x.app, rep: x.rep, res: x.res }))));
  expect(wide39.every(x => x.fz.zoom === 1 && x.fz.body >= 9.5 && x.fz.label >= 8.5 && x.fz.res >= 14 && x.fz.stack === (x.w < 1440) && x.fz.below === x.fz.stack),
    'E8 アプリ ③ の紙は 1280px・1366px でも等倍（本文 9.5px・ラベル 8.5px・結果 14px）。右サマリーの横に入らない幅は右サマリーを紙の下へ: ' + JSON.stringify(wide39.map(x => Object.assign({ w: x.w }, x.fz))));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await rp39.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  const rv39 = await rp39.evaluate(paperOf, ['#a4', QS39]);
  expect(rv39.qs.length === 0 && rv39.res <= 160 && rv39.rows === 7 && rv39.res2 === '採用推奨' && !!(await rp39.$('#a4 .cl-decision svg.verdict-stamp')) && JSON.stringify(rv39.order) === JSON.stringify(pv39.order),
    'E8 保存 HTML の用紙も同じ 1 ページの要約（質問文なし・結果が上部・最終合否の採用スタンプ・同じ並び）: ' + JSON.stringify(Object.assign({}, rv39, { order: undefined })));
  await rp39.close();
  // 3. 重いサンプル: 全メモ（質問の回答・確認点のメモ・Step① のメモ）に 300 字・面接所見 1,500 字 → .cl-compact で 1 ページ
  //   （質問の回答は 2 行・確認点のメモは 1 行で打ち切るので、本文が A4 を超えるのは際限なく長くなる面接所見が長いとき）
  await page.click('#btnNew');
  await wait(200);
  await fillScript({ name: '台本 四郎', age: 21, gender: '男性', category: '大学3年生', posting: 'short', taxi: '可・2,500円', interviewer: '笹川 晴央', notes: L(300) });
  await page.click('[data-action="script-next"]');
  await wait(400);
  for (const sel of await page.$$eval('#stepContent textarea[data-cl]', els => els.map(e => e.getAttribute('data-cl')))) await page.fill('textarea[data-cl="' + sel + '"]', L(300));
  for (const sel of await page.$$eval('#stepContent input.cl-note[data-cl]', els => els.map(e => e.getAttribute('data-cl')))) await page.fill('input[data-cl="' + sel + '"]', L(300));
  await page.fill('textarea[data-note="interview"]', L(1500));
  for (const b of ['conditions_explain', 'continuity_explain', 'job_explain', 'teamwork_explain', 'reverse_notify']) await page.click('[data-action="explain-all"][data-block="' + b + '"]');
  await rateAll('good');
  await judge();
  const hv39 = await page.evaluate(paperOf, ['#appPaper', QS39]);
  expect(await step() === 4 && hv39.cls.includes('cl-compact') && hv39.h <= 1052 && hv39.res <= 160 && hv39.rows === 7 && hv39.qs.length === 0,
    'E8 重いサンプル（全メモ 300 字・面接所見 1,500 字）: 紙プレビューに .cl-compact・押印行込みで上限（1052px）以内・結果は上部: ' + JSON.stringify(Object.assign({}, hv39, { order: undefined })));
  const nm39 = await page.evaluate(() => {
    const sh = document.querySelector('#appPaper .cl-sheet'), q = sh.querySelector('.cl-nm-q .cl-nm-v'), iv = sh.querySelector('.cl-nm-iv .cl-nm-v'), ref = sh.querySelector('.cl-nm-ref');
    const cq = getComputedStyle(q), ci = getComputedStyle(iv);
    // 名前の行数（Range の行の上端を数える）
    const linesOf = (el) => { const r = document.createRange(); r.selectNodeContents(el); const tops = []; Array.from(r.getClientRects()).forEach(x => { if (!tops.some(t => Math.abs(t - x.top) < 4)) tops.push(x.top); }); return tops.length; };
    return { qClamp: cq.webkitLineClamp, qh: Math.round(q.getBoundingClientRect().height), qlh: parseFloat(cq.lineHeight),
      ivClamp: ci.webkitLineClamp, ivh: Math.round(iv.getBoundingClientRect().height), ivlh: parseFloat(ci.lineHeight), sheetH: Math.round(sh.getBoundingClientRect().height),
      ref: ref && ref.getClientRects().length ? ref.innerText.trim() : '', cut: sh.classList.contains('cl-nm-cut'),
      keys: Array.from(sh.querySelectorAll('.cl-nm-q .cl-nm-k')).map(k => ({ t: k.textContent, lines: linesOf(k) })) };
  });
  expect(String(nm39.qClamp) === '2' && nm39.qh > nm39.qlh * 1.5 && nm39.qh <= nm39.qlh * 2.5,
    'E8 .cl-compact でも質問の回答は 2 行のまま（超えた分は面接所見から先に削る）: ' + JSON.stringify({ qClamp: nm39.qClamp, qh: nm39.qh, qlh: nm39.qlh }));
  expect(String(nm39.ivClamp) === '10' && nm39.ivh <= nm39.ivlh * 10.5 && nm39.ivh / nm39.sheetH < 0.2,
    'E8 面接所見は 10 行まで（残りの高さまで広げない。紙の 2 割未満）: ' + JSON.stringify({ ivClamp: nm39.ivClamp, ivh: nm39.ivh, ivlh: nm39.ivlh, sheetH: nm39.sheetH }));
  expect(nm39.keys.length === 5 && nm39.keys.every(k => k.lines === 1 && k.t.length <= 22) && nm39.keys[1].t === '②前のバイトの期間・退職理由 ほか2問' && nm39.keys[4].t === '⑤気になる点（逆質問）',
    'E8 質問の回答の名前は 1 行（1 問目の短い名前＋「ほか n 問」）: ' + JSON.stringify(nm39.keys));
  // ③ の紙はクリックしても窓を出さないので「保存した HTML の画面で」（アプリの印刷・保存 HTML は「画面で」。下の PDF で確かめる）
  const cut39 = await page.evaluate(() => document.querySelectorAll('#appPaper .cl-cut').length);
  await page.click('#appPaper .cl-nm-iv .cl-nm-v');
  await wait(100);
  const pop39 = !!(await page.$('.pop,#a4Pop,[role="dialog"]:not([hidden])'));
  expect(nm39.cut && nm39.ref === '「…」で切れたメモは、保存した HTML の画面でクリックすると全文を表示します' && cut39 >= 1 && !pop39,
    'E8 「…」で切れたメモがあれば案内 1 行（③ の紙は「保存した HTML の画面でクリックすると全文」。③ の紙のクリックでは窓は出ない）: ' + JSON.stringify({ cut: nm39.cut, ref: nm39.ref, cut39, pop39 }));
  await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
  await wait(150);
  await sshot('48-script-report-heavy.png');
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  const hp39 = await st(() => document.querySelector('#clSheet .cl-sheet').className);
  await page.emulateMedia({ media: 'print' });
  const pdf39a = path.join(OUT, 'script-report-app-heavy.pdf');
  await page.pdf({ path: pdf39a, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: null });
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  const n39a = pdfPagesOf(pdf39a);
  const t39a = pdfTextOf(pdf39a);
  expect(hp39.includes('cl-compact') && (n39a === -1 || n39a === 1) && (t39a === null || (t39a.includes('「…」で切れたメモは、画面でクリックすると全文を表示します') && !t39a.includes('保存したHTMLの画面で'))),
    'E8 重いサンプルのアプリの A4 印刷は 1 ページ（.cl-compact）・案内は保存 HTML と同じ「画面でクリックすると全文」: ' + JSON.stringify({ pages: n39a, cls: hp39 }));
  const saved39 = await saveRecord('script-report-heavy.html');
  const rp39b = await newReportPage(rp39Err);
  await rp39b.goto('file://' + saved39.file);
  await rp39b.waitForTimeout(300);
  const rh39 = await rp39b.evaluate(() => document.querySelector('#a4 .cl-sheet').className);
  const pdf39 = path.join(OUT, 'script-report-heavy.pdf');
  await rp39b.pdf({ path: pdf39, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await rp39b.waitForTimeout(100);
  const n39 = pdfPagesOf(pdf39);
  const t39 = pdfTextOf(pdf39);
  console.log('script-report-heavy.pdf pages:', n39);
  expect(rh39.includes('cl-compact') && (n39 === -1 || n39 === 1) && (t39 === null || ['採用推奨', '台本四郎', '最終合否', '笹川晴央', '面接所見', '「…」で切れたメモは、画面でクリックすると全文を表示します'].every(t => t39.includes(t))),
    'E8 重いサンプルの保存 HTML: 用紙に .cl-compact・そのまま印刷して A4 1 ページ（結果・氏名・最終合否・笹川晴央・「…」の案内）: ' + JSON.stringify({ pages: n39, cls: rh39 }));
  await rp39b.close();
  // アプリの印刷: 押印欄 4 件（既定の 2 件に 2 件足す。押印行が 2 段）でも 1 ページ（上限を押印欄の件数で決める）
  const app39s = await st(() => {
    const flds = window.RecruitApp.state.profile.management.fields;
    flds.push({ id: 'extra39', label: '追加確認', hint: '' }, { id: 'extra39b', label: '追加確認2', hint: '' });
    window.RecruitApp.prepareChecklistSheet(true);
    const sh = document.querySelector('#clSheet .cl-sheet');
    return { cls: sh.className, boxes: sh.querySelectorAll('.cl-stamps .stamp-box').length };
  });
  await page.emulateMedia({ media: 'print' });
  const pdf39s = path.join(OUT, 'script-report-app-stamps4.pdf');
  await page.pdf({ path: pdf39s, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: null });
  await st(() => { window.RecruitApp.prepareChecklistSheet(false); window.RecruitApp.state.profile.management.fields.splice(2, 2); });
  const n39s = pdfPagesOf(pdf39s);
  expect(app39s.boxes === 4 && (n39s === -1 || n39s === 1), 'E8 アプリの A4 印刷: 押印欄 4 件（2 段）でも 1 ページ: ' + JSON.stringify({ pages: n39s, app39s }));

  // 4. 保存 HTML の 1 ページ保証の境界（記録を直接作って保存 HTML を開き、読み込んだままの用紙を計り、そのまま印刷）
  //   面接所見 4,000 字（.cl-compact のまま所見が切れる → 案内 1 行）・押印欄 4 件（押印行が 2 段）・確認点を 65 件追加（縮小。縮小後の高さを測り直す）
  const mk39 = (o) => {
    const Lx = (n) => 'あいうえおかきくけこさしすせそ'.repeat(Math.ceil(n / 15)).slice(0, n);
    const S = window.RecruitStorage, R = window.RecruitRules;
    const p = S.defaults();
    for (let i = p.management.fields.length; i < (o.fields || 0); i++) p.management.fields.push({ id: 'extra' + i, label: '追加確認' + i, hint: '' });
    if (o.extra) { const rb = p.checklist.sections[1].blocks.find(b => b.type === 'rating'); for (let i = 0; i < o.extra; i++) rb.items.push({ id: 'rt_x' + i, label: '追加の確認点 ' + i }); }
    const prof = S.normalizeProfile(p);
    const cl = R.emptyChecklist();
    cl.header = { date: '2026-10-10', interviewer: '笹川 晴央', posting: 'short', taxi: '可・2,500円' };
    R.checklistItems(prof.checklist, 'rating').forEach(x => { cl.values[x.item.id] = 'good'; });
    R.checklistItems(prof.checklist, 'must').forEach(x => { cl.values[x.item.id] = 'match'; });
    R.checklistItems(prof.checklist, 'explain').forEach(x => { cl.values[x.item.id] = true; });
    cl.overall = 'hire';
    cl.notes = {};
    if (o.q) R.checklistItems(prof.checklist, 'question').forEach(x => { cl.notes[x.block.id] = Lx(o.q); });
    const applicant = { name: '台本 五郎', age: '21', gender: '男性', category: '大学3年生', reviewerNotes: o.memo ? Lx(o.memo) : '' };
    const rec = { kind: 'recruit-applicant-record', schemaVersion: 2, step: 4, savedAt: new Date().toISOString(), profile: { theaterName: prof.meta.theaterName }, applicant, checklist: cl, checklistDef: prof.checklist,
      interviewNotes: o.iv ? Lx(o.iv) : '', management: {}, decision: null, judgment: R.evaluateScript(applicant, cl, prof, {}) };
    return S.generateReportHTML(rec, prof);
  };
  const fit39 = [];
  for (const c of [{ key: 'iv4000', iv: 4000 }, { key: 'stamps4', fields: 4, q: 300, memo: 500, iv: 1600 }, { key: 'zoom', extra: 65 }]) {
    const f39 = path.join(OUT, 'script-report-fit-' + c.key + '.html');
    fs.writeFileSync(f39, await page.evaluate(mk39, c));
    const rp = await newReportPage(rp39Err);
    await rp.goto('file://' + f39);
    await rp.waitForTimeout(300);
    await rp.mouse.move(0, 0);
    const m = await rp.evaluate(() => {
      const a4 = document.getElementById('a4'), sh = a4.querySelector('.cl-sheet'), st = a4.querySelector('.cl-stamps'), top = a4.getBoundingClientRect().top;
      const mm = 96 / 25.4;
      return { cls: sh.className.replace('cl-sheet cl-mode-sheet', '').trim(), zoom: sh.style.zoom, h: Math.round(sh.getBoundingClientRect().height), boxes: a4.querySelectorAll('.cl-stamps .stamp-box').length,
        stampsBottom: st ? Math.round(st.getBoundingClientRect().bottom - top) : -1, innerBottom: Math.round((8 + 281) * mm) };
    });
    const pdf = path.join(OUT, 'script-report-fit-' + c.key + '.pdf');
    await rp.pdf({ path: pdf, format: 'A4', preferCSSPageSize: true, printBackground: true });
    const t = pdfTextOf(pdf);
    fit39.push(Object.assign({ key: c.key, pages: pdfPagesOf(pdf), ref: t === null ? null : t.includes('「…」で切れたメモは、画面でクリックすると全文を表示します'), name: t === null ? null : t.includes('台本五郎') }, m));
    await rp.close();
  }
  const fit39k = (k) => fit39.find(x => x.key === k);
  expect(fit39.every(x => x.pages === -1 || x.pages === 1) && fit39.every(x => x.name !== false) && fit39.every(x => x.h <= 1052 && x.stampsBottom > 0 && x.stampsBottom <= x.innerBottom),
    'E8 保存 HTML の用紙は境界の記録でも押印行込みで 1052px 以内・押印行の下端は用紙の内寸の下端より上・そのまま印刷して 1 ページ（面接所見 4,000 字・押印欄 4 件・確認点 +65 件）: ' + JSON.stringify(fit39));
  expect(/\bcl-compact\b/.test(fit39k('iv4000').cls) && !fit39k('iv4000').cls.includes('cl-compact-2') && fit39k('iv4000').ref !== false,
    'E8 面接所見 4,000 字: .cl-compact で所見が切れても「…」の案内 1 行（画面でクリックすると全文）: ' + JSON.stringify(fit39k('iv4000')));
  expect(fit39k('stamps4').boxes === 4 && fit39k('stamps4').h <= 1052, 'E8 押印欄 4 件（押印行 2 段）も押印行込みの上限（1052px）で詰める: ' + JSON.stringify(fit39k('stamps4')));
  const z39 = fit39k('zoom');
  expect(z39.cls.includes('cl-compact-2') && parseFloat(z39.zoom) > 0 && parseFloat(z39.zoom) < 1 && z39.h <= 1052, 'E8 確認点 +65 件: 縮小後の高さを測り直して上限（1052px）以内: ' + JSON.stringify(z39));
  expect(rp39Err.length === 0, 'E8 保存 HTML のページエラーなし: ' + (rp39Err.join(' / ') || 'none'));

  // =====================================================================
  // E9 押印欄 2 つ（初期対応者なし。docs/SPEC-slim.md K1・D4・D10）
  // =====================================================================
  console.log('\n== E9 押印欄 2 つ ==');
  await fresh();
  await fillScript({ name: '押印 二郎', age: 23, gender: '男性', category: 'フリーター', posting: 'regular', interviewer: '笹川 晴央' });
  await page.click('[data-action="script-next"]');
  await wait(400);
  await rateAll('good');
  await judge();
  const ids9 = (pg, sel) => pg.$$eval(sel, els => els.map(e => e.dataset.fieldId));
  const app9 = { ids: await ids9(page, '#mgmtCard .stamp-box'), cols: await page.$eval('#mgmtCard .stamp-row', e => e.classList.contains('cols-2') && getComputedStyle(e).gridTemplateColumns.split(' ').length),
    labels: await page.$$eval('#mgmtCard .stamp-label', els => els.map(e => e.textContent)), txt: await page.textContent('#stepContent') };
  expect(JSON.stringify(app9.ids) === JSON.stringify(['interviewer', 'final']) && app9.cols === 2 && JSON.stringify(app9.labels) === JSON.stringify(['面接対応者', '最終確認']) && !app9.txt.includes('初期対応者'),
    'E9 アプリ ③ の押印欄は 面接対応者・最終確認 の 2 つ（2 列・初期対応者なし）: ' + JSON.stringify(Object.assign({}, app9, { txt: undefined })));
  const sum9 = await txtIn(page, '#sumStamps');
  expect(sum9.includes('面接対応者') && sum9.includes('最終確認') && !sum9.includes('初期対応者'), 'E9 右サマリーの押印状況も 2 欄: ' + sum9);
  expect(!(await page.textContent('#appPaper')).includes('初期対応者'), 'E9 紙プレビューに初期対応者が無い');
  // 最終合否「採用」で最終確認に自動押印
  await page.selectOption('#decisionManager', { label: SASA });
  await page.click('#decisionCard [data-action="decide"][data-value="hire"]');
  await wait(200);
  const t9 = await toastText();
  expect(await st(() => (window.RecruitApp.state.management.final || {}).name) === '笹川 晴央' && t9.includes('最終確認にも押印') && !!(await page.$('#mgmtCard .stamp-box[data-field-id="final"] svg.hanko')),
    'E9 最終合否で「最終確認」に自動押印: ' + t9);
  await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
  await wait(150);
  // 印刷用（#clSheet）の用紙の押印行も 2 つ・2 列
  const cs9 = await st(() => { window.RecruitApp.prepareChecklistSheet(true); const r = document.querySelector('#clSheet .a4 .cl-stamps .stamp-row');
    const out = { ids: Array.from(document.querySelectorAll('#clSheet .a4 .cl-stamps .stamp-box')).map(b => b.dataset.fieldId), cols: !!r && r.classList.contains('cols-2'), grid: r ? getComputedStyle(r).gridTemplateColumns.split(' ').length : 0,
      hanko: document.querySelectorAll('#clSheet .cl-stamps svg.hanko').length, txt: document.getElementById('clSheet').textContent.includes('初期対応者') };
    window.RecruitApp.prepareChecklistSheet(false); return out; });
  expect(JSON.stringify(cs9.ids) === JSON.stringify(['interviewer', 'final']) && cs9.cols && cs9.grid === 2 && cs9.hanko === 2 && !cs9.txt, 'E9 A4 印刷用の用紙の押印行（.cl-stamps）も 2 つ・2 列・印 2 つ: ' + JSON.stringify(cs9));
  // 保存 HTML の用紙の押印行
  const saved9 = await saveRecord('stamps-2.html');
  expect(saved9.html.includes('<div class="cl-stamps"><div class="stamp-row cl-stamps-row cols-2">') && !saved9.html.includes('初期対応者') && !saved9.html.includes('data-field-id="initial"') &&
    JSON.stringify(Object.keys(saved9.rec.management)) === JSON.stringify(['final', 'interviewer']) && saved9.html.endsWith('</html>\n'),
    'E9 保存 HTML の押印欄は用紙の中の 2 つ（.cl-stamps .stamp-row.cols-2・初期対応者なし）: ' + Object.keys(saved9.rec.management).join(','));
  const rp9Err = [];
  const rp9 = await newReportPage(rp9Err);
  await rp9.goto('file://' + saved9.file);
  await rp9.waitForTimeout(300);
  const g9 = async () => rp9.evaluate(() => { const r = document.querySelector('#a4 .cl-stamps .stamp-row'); return { n: r.querySelectorAll('.stamp-box').length, cols: getComputedStyle(r).gridTemplateColumns.split(' ').length, ov: document.documentElement.scrollWidth - window.innerWidth,
    zoom: getComputedStyle(document.documentElement).getPropertyValue('--a4-zoom').trim() }; });
  const g9a = await g9();
  await rp9.setViewportSize({ width: 390, height: 900 });
  await rp9.waitForTimeout(200);
  const g9b = await g9();
  expect(g9a.n === 2 && g9a.cols === 2 && g9b.cols === 2 && g9b.ov <= 1 && g9a.zoom === '' && parseFloat(g9b.zoom) > 0.4 && parseFloat(g9b.zoom) < 0.5,
    'E9 保存 HTML の用紙の押印行は 2 列（390px でも 2 列のまま用紙ごと縮小・横スクロールなし）: ' + JSON.stringify({ g9a, g9b }));
  await rp9.setViewportSize({ width: 1440, height: 1000 });
  await rp9.waitForTimeout(150);
  // 保存 HTML の用紙で最終合否を「不採用」に（採用推奨と食い違うので窓は開いたまま注記を見せる。docs/SPEC-a4.md S11）
  await openDecision(rp9);
  const pre9 = await rp9.evaluate(() => { const p = document.getElementById('a4Pop'); return p && { sel: p.querySelector('select').selectedOptions[0].textContent, undo: !!p.querySelector('[data-act="undecide"]'), on: (p.querySelector('.pop-dec.on') || {}).textContent }; });
  await popSel(rp9, SASA);
  await popAct(rp9, 'decide', 'reject');
  const note9 = await rp9.evaluate(() => { const p = document.getElementById('a4Pop'); return p && { note: (p.querySelector('.pop-note') || {}).textContent || '', on: (p.querySelector('.pop-dec.on') || {}).textContent, undo: !!p.querySelector('[data-act="undecide"]') }; });
  expect(!!pre9 && pre9.sel === SASA && pre9.undo && pre9.on === '採用' && !!note9 && note9.note === '※ アプリの判定「採用推奨」と異なる最終合否です（記録はそのまま残ります）。' && note9.on === '不採用' && note9.undo,
    'E9 窓の担当者は最終確認の押印者を初期選択・押された合否のボタンが on・不採用×採用推奨は窓を開いたまま注記: ' + JSON.stringify({ pre9, note9 }));
  await popAct(rp9, 'close');
  expect(rp9Err.length === 0 && !(await rp9.$('#a4Pop')) && !!(await rp9.$('#a4 .stamp-box[data-field-id="final"] svg.hanko')) && !!(await rp9.$('#a4Decision.is-reject')) &&
    (await rp9.evaluate(() => document.body.getAttribute('data-filename'))).endsWith('_不採用.html'),
    'E9 保存 HTML で最終合否を変えられる（［閉じる］で窓が閉じる・押印欄 2 つのまま・ファイル名 _不採用・エラーなし）: ' + (rp9Err.join(' / ') || 'ok'));
  //   もう一方の食い違い（採用×不採用推奨）: 判定が不採用推奨の記録で「採用」→ 注記を出して窓は開いたまま。続けて「不採用」（一致）→ 注記なしで窓が閉じる
  const recRj9 = Object.assign({}, saved9.rec, { judgment: Object.assign({}, saved9.rec.judgment, { result: 'reject', title: '不採用推奨' }), decision: null });
  const fileRj9 = path.join(OUT, 'stamps-2-reject.html');
  fs.writeFileSync(fileRj9, await st(r => window.RecruitStorage.generateReportHTML(r, window.RecruitApp.state.profile), recRj9));
  await rp9.goto('file://' + fileRj9);
  await rp9.waitForTimeout(300);
  await openDecision(rp9);
  await popSel(rp9, SASA);
  await popAct(rp9, 'decide', 'hire');
  const noteRj9 = await rp9.evaluate(() => { const p = document.getElementById('a4Pop'); return p && { note: (p.querySelector('.pop-note') || {}).textContent || '', ref: (p.querySelector('.pop-ref') || {}).textContent || '', on: (p.querySelector('.pop-dec.on') || {}).textContent }; });
  const hireRj9 = !!(await rp9.$('#a4Decision.is-hire'));
  if (!(await rp9.$('#a4Pop'))) await openDecision(rp9);   // 注記が出ず窓が閉じたときも先へ進める（確認は下の expect）
  await popAct(rp9, 'decide', 'reject');
  const okRj9 = { pop: !!(await rp9.$('#a4Pop')), reject: !!(await rp9.$('#a4Decision.is-reject')) };
  expect(!!noteRj9 && noteRj9.note === '※ アプリの判定「不採用推奨」と異なる最終合否です（記録はそのまま残ります）。' && noteRj9.ref === 'アプリの判定：不採用推奨' && noteRj9.on === '採用' && hireRj9 &&
    !okRj9.pop && okRj9.reject && rp9Err.length === 0,
    'E9 採用×不採用推奨も窓を開いたまま注記・判定と同じ「不採用」なら注記なしで窓が閉じる: ' + JSON.stringify({ noteRj9, hireRj9, okRj9 }));
  await rp9.close();
  // アプリ ③ の 390px
  await page.setViewportSize({ width: 390, height: 900 });
  await wait(300);
  const n9 = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('#mgmtCard .stamp-row')).gridTemplateColumns.split(' ').length, ov: document.documentElement.scrollWidth - window.innerWidth }));
  expect(n9.cols === 1 && n9.ov <= 1, 'E9 アプリの押印欄は 390px で 1 列・横スクロールなし: ' + JSON.stringify(n9));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  // 設定「応募者の管理（押印）」は 2 欄
  await toView('settings');
  const set9 = await page.evaluate(() => ({ labels: Array.from(document.querySelectorAll('#s-mgmt [data-bind^="management.fields["][data-bind$="].label"]')).map(e => e.value),
    txt: document.getElementById('s-mgmt').textContent, ph: (document.querySelector('[data-bind="management.fields[0].hint"]') || {}).placeholder,
    stampOpts: Array.from(document.querySelectorAll('[data-bind="management.decision.stampField"] option')).map(o => o.value),
    ivOpts: Array.from(document.querySelectorAll('[data-bind="checklist.header.interviewerField"] option')).map(o => o.value) }));
  expect(JSON.stringify(set9.labels) === JSON.stringify(['面接対応者', '最終確認']) && !set9.txt.includes('初期対応者') && !set9.txt.includes('initial') && set9.ph === '例：面接を行った担当者' &&
    JSON.stringify(set9.stampOpts) === JSON.stringify(['interviewer', 'final', '']) && JSON.stringify(set9.ivOpts) === JSON.stringify(['', 'interviewer', 'final']),
    'E9 設定の押印欄は 2 つ（初期対応者なし・連動の選択肢も 2 欄）: ' + JSON.stringify(Object.assign({}, set9, { txt: undefined })));
  // 旧い 3 欄の保存済み設定（初期対応者の表示名を変更・面接対応者の表示名も変更）→ 2 欄・表示名は維持
  await page.evaluate(() => {
    const p = window.RecruitStorage.defaults();
    p.management.fields = [{ id: 'initial', label: '受付担当', hint: '応募受付を行った担当者' }, { id: 'interviewer', label: '面接担当', hint: '面接した人' }, { id: 'final', label: '最終確認', hint: '' }];
    p.checklist.header.interviewerField = 'initial'; p.management.decision.stampField = 'initial';
    localStorage.setItem('recruit.profile.v1', JSON.stringify(p));
  });
  await page.reload();
  await wait(300);
  const p9 = await st(() => { const m = window.RecruitApp.state.profile; return { f: m.management.fields.map(f => f.id + ':' + f.label), iv: m.checklist.header.interviewerField, sf: m.management.decision.stampField }; });
  const sp9 = await storedProfile();
  expect(JSON.stringify(p9.f) === JSON.stringify(['interviewer:面接担当', 'final:最終確認']) && p9.iv === 'interviewer' && p9.sf === 'final' &&
    JSON.stringify(sp9.management.fields.map(f => f.id)) === JSON.stringify(['interviewer', 'final']) && !JSON.stringify(sp9).includes('受付担当'),
    'E9 旧い 3 欄の設定は 2 欄（表示名は維持）・連動先 initial は面接対応者／最終確認に直し、保存し直す: ' + JSON.stringify(p9));
  await fresh();

  // =====================================================================
  // E10 設定画面（5 節・data-bind の許可リスト・保存／破棄／初期化・書き出し・旧い JSON の読み込み）・使い方（docs/SPEC-slim.md 4 章）
  // =====================================================================
  console.log('\n== E10 設定画面・使い方 ==');
  await toView('settings');
  const set10 = await page.evaluate(() => {
    const body = document.querySelector('#view-settings .settings-body');
    const binds = Array.from(document.querySelectorAll('#view-settings [data-bind]')).map(e => e.dataset.bind);
    return {
      secs: Array.from(body.querySelectorAll(':scope > section.card')).map(s => s.id), nav: Array.from(document.querySelectorAll('.settings-nav a')).map(a => a.getAttribute('href')),
      binds, details: !!document.querySelector('#view-settings details.settings-advanced, #s-advanced, #s-mode'), txt: document.getElementById('view-settings').textContent,
      actions: Array.from(new Set(Array.from(document.querySelectorAll('#view-settings [data-action]')).map(e => e.dataset.action))).sort()
    };
  });
  expect(JSON.stringify(set10.secs) === JSON.stringify(['s-meta', 's-applicant', 's-checklist', 's-mgmt', 's-io']) && JSON.stringify(set10.nav) === JSON.stringify(set10.secs.map(x => '#' + x)) && !set10.details,
    'E10 設定の節は 劇場情報／応募者の属性／面接チェックリスト／応募者の管理（押印）／書き出し・読み込み の 5 つ（ナビも同じ順）: ' + JSON.stringify(set10.secs));
  const ALLOW = [
    /^meta\.(theaterName|appTitle|version|footer)$/, /^options\.(categories|genders)$/, /^features\.graduationDate$/,
    /^checklist\.(mustFailResult|mustUnknownResult|mustFailJumpTo|overallLabel|overallHint|version)$/, /^checklist\.overallCaps\.(hold|reject)$/, /^checklist\.overallOptions\.(hire|hold|reject)$/,
    /^evaluation\.thresholds\.(recommendPct|reviewPct)$/, /^checklist\.header\.interviewerField$/, /^checklist\.header\.posting\.label$/, /^checklist\.header\.posting\.options\[\d+\]\.label$/,
    /^checklist\.pages\[\d+\]\.(title|lead)$/, /^checklist\.sections\[\d+\]\.(title|minutes|minutesMax|page|lead)$/, /^checklist\.sections\[\d+\]\.blocks\[\d+\]\.(title|note|memo|memoLabel)$/,
    /^checklist\.sections\[\d+\]\.blocks\[\d+\]\.items\[\d+\]\.(label|hint|shortOnly|short|kind|options)$/,
    /^management\.fields\[\d+\]\.(label|hint)$/, /^management\.(managers|allowFreeName)$/, /^management\.decision\.(enabled|label|hireLabel|rejectLabel|hint|stampField|autoStampFinal|filenameSuffix)$/
  ];
  const badBind10 = set10.binds.filter(b => !ALLOW.some(re => re.test(b)));
  const dup10 = set10.binds.filter((b, i) => set10.binds.indexOf(b) !== i);
  expect(set10.binds.length > 50 && !badBind10.length && !dup10.length, 'E10 data-bind は許可リストだけ・重複なし（' + set10.binds.length + ' 件）: ' + JSON.stringify({ bad: badBind10, dup: dup10 }));
  // 「詳細」表示（保存 HTML）は 2026-10-14 に削除（docs/SPEC-a4.md）。その表示だけに効いた「質問文も載せる」の行も無い
  const words10 = ['詳細モード', '2軸', '2 軸', '貢献度', '留意点', '初期対応者', '運用モード', '申し送り', '自動表示', 'Step3', 'Step4', '応募情報から', '旧形式', '「詳細」', '質問文も載せる'].filter(w => set10.txt.includes(w));
  expect(!words10.length, 'E10 設定画面に削除した機能の文言が無い: ' + words10.join(','));
  expect(JSON.stringify(set10.actions) === JSON.stringify(['cl-block-add', 'cl-block-del', 'cl-block-down', 'cl-block-up', 'cl-default', 'cl-item-add', 'cl-item-del', 'cl-item-down', 'cl-item-up', 'cl-sec-add', 'cl-sec-del', 'cl-sec-down', 'cl-sec-up', 'discard', 'export', 'import', 'reset', 'save']),
    'E10 data-action は台本の編集・保存／破棄／書き出し／読み込み／初期化だけ: ' + set10.actions.join(','));
  const txt10 = await page.evaluate(() => ({ cl: document.getElementById('s-checklist').textContent, mgmt: document.getElementById('s-mgmt').textContent, io: document.getElementById('s-io').textContent,
    band: !!document.querySelector('#clBandInputs [data-bind="evaluation.thresholds.recommendPct"]') && !!document.getElementById('clCapsScriptHint') }));
  expect(txt10.cl.includes('説明（Step② に表示）') && txt10.band && txt10.mgmt.includes('Step③ に「採用」「不採用」のボタン') &&
    txt10.io.includes('v1 形式の JSON は読み込むと既定の設定になります') && !txt10.io.includes('新しい設定項目が既定値で補われます'),
    'E10 文言: 面接チェックリストは Step②・最終合否は Step③・帯の境界は面接チェックリストの節・書き出しの注記');
  // どこにも表示しない台本の題名・説明文（checklist.title / intro）の欄は無い。必須条件の不一致の補足は削除した入力チェック（「入力が必要」）を案内しない
  //   区分のグループは学生かどうかだけを説明する（freeter・homemaker などを選ばせない）
  const ap10 = await page.evaluate(() => (document.querySelector('#s-applicant [data-bind="options.categories"]').closest('.field').querySelector('.hint') || {}).textContent || '');
  expect(!set10.binds.includes('checklist.title') && !set10.binds.includes('checklist.intro') && !txt10.cl.includes('Step② の説明文') && !txt10.cl.includes('タイトル') &&
    !txt10.cl.includes('入力が必要') && txt10.cl.includes('どちらも未入力のまま報告書へ進めます') &&
    ap10.includes('学生は highschool') && ap10.includes('それ以外は other') && !ap10.includes('homemaker') && !ap10.includes('doubleworker'),
    'E10 台本の題名・説明文の欄なし・必須条件の不一致の補足に「入力が必要」なし・区分のグループは学生／それ以外の説明だけ: ' + ap10);
  // 保存・破棄・初期化
  await page.fill('[data-bind="meta.theaterName"]', 'TOHOシネマズ 保存テスト');
  await saveSettings();
  expect((await storedProfile()).meta.theaterName === 'TOHOシネマズ 保存テスト' && (await toastText()).includes('設定を保存しました') && (await page.textContent('#brandTheater')) === 'TOHOシネマズ 保存テスト',
    'E10 「設定を保存」で保存・画面に反映');
  await page.fill('[data-bind="meta.theaterName"]', '破棄する名前');
  await page.click('#view-settings [data-action="discard"]');
  await wait(200);
  expect(await page.inputValue('[data-bind="meta.theaterName"]') === 'TOHOシネマズ 保存テスト', 'E10 「変更を破棄」で保存済みの値に戻る');
  const sp10 = await storedProfile();
  expect(JSON.stringify(Object.keys(sp10)) === JSON.stringify(['schemaVersion', 'meta', 'features', 'management', 'options', 'evaluation', 'checklist', 'texts']),
    'E10 保存した設定は 8 キーだけ: ' + Object.keys(sp10).join(','));
  // 書き出し
  const [dl10] = await Promise.all([page.waitForEvent('download'), page.click('#view-settings [data-action="export"]')]);
  const exp10 = path.join(OUT, 'profile-export.json');
  await dl10.saveAs(exp10);
  const ej10 = JSON.parse(fs.readFileSync(exp10, 'utf8'));
  expect(['mode', 'handoffRules', 'contribution', 'matrix', 'inputStages', 'stageOptions', 'highschoolPolicy', 'params'].every(k => !(k in ej10)) && ej10.management.fields.length === 2 &&
    !JSON.stringify(ej10).includes('"auto"') && ej10.meta.theaterName === 'TOHOシネマズ 保存テスト',
    'E10 書き出した JSON に mode・handoffRules など削除した設定が無い（押印欄 2 つ）: ' + Object.keys(ej10).join(','));
  // 初期化
  await page.click('#view-settings [data-action="reset"]');
  await wait(300);
  expect((await storedProfile()).meta.theaterName === 'TOHOシネマズ新宿' && (await toastText()).includes('初期設定に戻しました'), 'E10 「初期設定（新宿既定）に戻す」');
  // 書き出した JSON を読み込める（handoffRules が無くても）
  await page.setInputFiles('#profileFileInput', exp10);
  await wait(400);
  expect((await storedProfile()).meta.theaterName === 'TOHOシネマズ 保存テスト' && (await toastText()).includes('プロファイルを読み込みました'), 'E10 書き出した JSON（handoffRules なし）を読み込める');
  // v1 の JSON → 既定の設定（toast）
  await page.setInputFiles('#profileFileInput', path.join(FIX, 'v1-profile-other.json'));
  await wait(400);
  const t10a = await toastText();
  const sp10a = await storedProfile();
  expect(t10a.startsWith('古い形式のため既定の設定を使います') && sp10a.meta.theaterName === 'TOHOシネマズ新宿' && sp10a.management.fields.length === 2,
    'E10 v1 の JSON は既定の設定になる（toast「古い形式のため既定の設定を使います」）: ' + t10a);
  // 詳細モードの JSON → 2 欄・toast
  await page.setInputFiles('#profileFileInput', path.join(FIX, 'legacy-profile-full.json'));
  await wait(400);
  const t10b = await toastText();
  const sp10b = await storedProfile();
  expect(t10b.includes('詳細モードは終了しました') && sp10b.meta.theaterName === 'TOHOシネマズ テスト' && JSON.stringify(sp10b.management.fields.map(f => f.id)) === JSON.stringify(['interviewer', 'final']) && !('mode' in sp10b),
    'E10 詳細モードの JSON を読み込むと押印欄 2 つ・mode なし（toast で案内）: ' + t10b);
  const ids10 = await page.$$eval('#s-mgmt [data-bind$="].label"][data-bind^="management.fields"]', els => els.map(e => e.value));
  expect(JSON.stringify(ids10) === JSON.stringify(['面接対応者', '最終確認']), 'E10 読み込んだ設定の画面も押印欄 2 つ: ' + ids10.join(','));
  // 使い方
  await toView('help');
  const help10 = await page.textContent('#view-help');
  expect((await page.$$('#view-help .help-step')).length === 3 && ['応募者', '面接チェックリスト', '報告書', '最終合否', '面接対応者／最終確認'].every(t => help10.includes(t)) &&
    !['詳細モード', '初期対応者', '2軸', '貢献度', '留意点', '申し送り'].some(t => help10.includes(t)) && !(await page.$('#helpFullMode')),
    'E10 使い方は 3 ステップ（押印欄は 面接対応者／最終確認。詳細モード・初期対応者・2軸の記述なし）');
  await toView('judge');
  await fresh();

  // =====================================================================
  // E11 保存 HTML の印刷（A4 で印刷だけ）・アプリの A4 印刷（docs/SPEC-slim.md K4）
  // =====================================================================
  console.log('\n== E11 保存 HTML の印刷・アプリの A4 印刷 ==');
  const rp11Err = [];
  const rp11 = await newReportPage(rp11Err);
  await rp11.goto('file://' + saved9.file);
  await rp11.waitForTimeout(300);
  // 保存 HTML は用紙そのものを印刷する（印刷ボタン・表示の切替・印刷用の複製・印刷のための切替なし。docs/SPEC-a4.md S8）
  const ui11 = await rp11.evaluate(() => ({ gone: ['.rtool', '#rtPrintChecklist', '#rtViewFull', '#clSheet', '#clPaper', '.dash', '#rtPrintSheet', '#rtPrintAll'].filter(s => !!document.querySelector(s)),
    handoff: typeof window.__prepareHandoffSheet, cl: typeof window.__prepareChecklistSheet, view: typeof window.__setReportView, fit: typeof window.__a4Fit }));
  expect(!ui11.gone.length && ui11.handoff === 'undefined' && ui11.cl === 'undefined' && ui11.view === 'undefined' && ui11.fit === 'function',
    'E11 保存 HTML に印刷ボタン・表示の切替・印刷用の複製が無い（.rtool・#rtPrintChecklist・__prepareChecklistSheet なし）: ' + JSON.stringify(ui11));
  // beforeprint / afterprint を投げても body・用紙の class・縮小は変わらない（読み込み時に確定した状態のまま印刷する）
  const snap11 = () => rp11.evaluate(() => { const sh = document.querySelector('#a4 .cl-sheet'); return [document.body.className, sh.className, sh.style.zoom, document.documentElement.getAttribute('style') || ''].join('|'); });
  const s11a = await snap11();
  const bp11 = await rp11.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); return document.body.className + '|' + document.querySelector('#a4 .cl-sheet').className; });
  await rp11.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  const s11b = await snap11();
  expect(s11a === s11b && bp11 === s11a.split('|').slice(0, 2).join('|') && !s11a.includes('print-checklist'), 'E11 beforeprint／afterprint で切り替えない（印刷のための切替なし）: ' + JSON.stringify({ s11a, bp11, s11b }));
  const pdf11a = path.join(OUT, 'report-a4-1page.pdf');
  await rp11.pdf({ path: pdf11a, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await rp11.waitForTimeout(100);
  const n11a = pdfPagesOf(pdf11a);
  const t11a = pdfTextOf(pdf11a);
  expect((n11a === -1 || n11a === 1) && (t11a === null || (['面接チェックリスト報告', '押印二郎', '面接対応者', '最終確認'].every(t => t11a.includes(t)) && !t11a.includes('初期対応者') && !t11a.includes('歌舞伎町ですので'))),
    'E11 保存 HTML をそのまま印刷して A4 1 ページ（押印 2 欄・初期対応者なし・台本の全文なし）: ' + n11a);
  expect((await snap11()) === s11a, 'E11 印刷（PDF）の前後で用紙の状態は変わらない');
  expect(rp11Err.length === 0, 'E11 保存 HTML のページエラーなし: ' + (rp11Err.join(' / ') || 'none'));
  await rp11.close();
  // アプリ ③ の「A4 で印刷」も 1 ページ（押印 2 欄）
  await page.setInputFiles('#fileInput', saved9.file);
  await wait(500);
  expect(await step() === 4, 'E11 保存した記録を ③ で開く');
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  const a11 = await st(() => document.querySelectorAll('#clSheet .a4 .cl-stamps .stamp-box').length);
  await page.emulateMedia({ media: 'print' });
  const pdf11c = path.join(OUT, 'app-a4-1page.pdf');
  await page.pdf({ path: pdf11c, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: null });
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  const n11c = pdfPagesOf(pdf11c);
  expect(a11 === 2 && (n11c === -1 || n11c === 1), 'E11 アプリの A4 印刷は 1 ページ（押印行 2 欄）: ' + JSON.stringify({ pages: n11c, stamps: a11 }));

  // =====================================================================
  // E12 設定の反映・読み込みの案内・手入力の押印・保存 HTML 上の取消・最終合否の ON/OFF
  //   （旧 E22・E26・E28・E31 のうち、面接特化後も残した機能。2026-10-14 の削除で検証ごと消えていたもの）
  // =====================================================================
  console.log('\n== E12 設定の反映・読み込みの案内・手入力の押印・最終合否の ON/OFF ==');
  await fresh();
  // 1. 必須条件に不一致があるとき「上長最終判断要」: 打ち切りの案内・省略可・⑤ へのボタンを出さず、未入力でも報告書へ進める
  await toView('settings');
  await page.selectOption('[data-bind="checklist.mustFailResult"]', 'review');
  await saveSettings();
  await toView('judge');
  await fillScript({ name: '設定 一郎' });
  await page.click('[data-action="script-next"]');
  await wait(400);
  await setCl('values.must_weekly', 'mismatch');
  await setCl('overall', 'hire');
  await wait(150);
  const rv12 = await st(() => ({ text: document.getElementById('clMustAlertText').textContent, skip: document.querySelectorAll('.cl-skippable').length,
    jump: !document.querySelector('#clMustAlert [data-action="cl-jump"]').classList.contains('hidden') }));
  expect(await visible('#clMustAlert') && rv12.text.includes('ほかのセクションの確認点も評価してから判定してください') && rv12.text.includes('上長最終判断要以下') && !rv12.text.includes('終了してください') && rv12.skip === 0 && !rv12.jump,
    'E12 mustFailResult=review の案内（確認点も評価・上長最終判断要以下。省略可・「⑤ 逆質問へ」は出さない）: ' + JSON.stringify(rv12));
  await judge();
  const j12a = await judgment();
  expect(await step() === 4 && j12a.result === 'review' && j12a.adjustments.includes('must_conditions'), 'E12 mustFailResult=review: 確認点が未入力でも報告書へ進み、採用 → 上長最終判断要（must_conditions）: ' + JSON.stringify(j12a));
  await toView('settings');
  await page.selectOption('[data-bind="checklist.mustFailResult"]', 'reject');
  await saveSettings();
  // 2. 台本の編集: 文言を変える・① の確認点を削除（満点 14）・④ に確認点を追加（満点 16）
  const NEW_BUSY = '指定繁忙期間すべて出勤可（年末年始・GW・お盆）';
  await page.fill('[data-bind="checklist.sections[0].blocks[0].items[1].label"]', NEW_BUSY);
  await page.click('.s-cl-item[data-item-id="rt_manner"] [data-action="cl-item-del"]');
  await wait(150);
  await saveSettings();
  const sp12 = await storedProfile();
  const max12a = { note: await txtIn(page, '#clMaxNote'), band: await txtIn(page, '#clBandInputs') };
  expect(sp12.checklist.sections[0].blocks[0].items[1].label === NEW_BUSY && !JSON.stringify(sp12.checklist).includes('rt_manner') && max12a.note.includes('確認点 6 項目') && max12a.note.includes('満点 14 点') && max12a.band.includes('現在の満点 14点'),
    'E12 文言の変更・確認点の削除を保存し、設定の満点表示は 14 点（帯の境界も 14 点で計算）: ' + JSON.stringify(max12a));
  await toView('judge');
  expect((await txtIn(page, '#sumMarks')).includes('/14点'), 'E12 右サマリーの満点 14 点: ' + await txtIn(page, '#sumMarks'));
  await toView('settings');
  await page.click('details.s-cl-sec[data-sec-id="teamwork"] > summary');
  await wait(100);
  await page.click('details.s-cl-sec[data-sec-id="teamwork"] [data-action="cl-item-add"][data-block="2"]');
  await wait(150);
  await saveSettings();
  expect((await txtIn(page, '#clMaxNote')).includes('満点 16 点'), 'E12 ④ に確認点を追加すると設定の満点表示は 16 点');
  await toView('judge');
  await page.click('#btnNew');
  await wait(200);
  await fillScript({ name: '設定 二郎' });
  await page.click('[data-action="script-next"]');
  await wait(400);
  const cl12 = await st(() => ({ busy: (document.querySelector('.cl-must-row[data-item="must_busy"] .cl-label') || {}).textContent, rows: document.querySelectorAll('.cl-rate-row').length,
    c1: document.querySelectorAll('#cl-conditions .cl-rate-row').length, c4: document.querySelectorAll('#cl-teamwork .cl-rate-row').length, manner: !!document.querySelector('.cl-rate-row[data-item="rt_manner"]') }));
  expect(cl12.busy === NEW_BUSY && cl12.rows === 7 && cl12.c1 === 1 && cl12.c4 === 2 && !cl12.manner && (await txtIn(page, '#sumMarks')).includes('/16点'),
    'E12 ② に新しい文言・確認点は ① 1 件／④ 2 件（計 7 件・満点 16 点）: ' + JSON.stringify(cl12));
  await setCl('values.must_busy', 'mismatch');
  await judge();
  const why12 = await st(() => (window.RecruitApp.state.judgment.adjustments[0] || {}).reason || '');
  expect(why12.includes('すべて出勤可'), 'E12 判定の理由文も新しい文言: ' + why12);
  // 3. 保存時と確認点が違う記録を読むと toast で知らせる（保存済みの報告書は保存時の文言のまま）
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  const t12a = await toastText();
  const html12a = fs.readFileSync(file34b, 'utf8');
  expect(t12a.includes('保存時と面接チェックリストの確認点が異なります（追加 1・削除 1）。現在の台本で再判定します') && t12a.includes('台本 花子 さんのデータを読み込みました'),
    'E12 読込の toast「確認点が異なります（追加 1・削除 1）」: ' + t12a);
  expect(html12a.includes('指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆）') && !html12a.includes('すべて出勤可'), 'E12 保存済みの報告書は保存時の文言のまま');
  // 4. 空の文言は検証エラーで保存されない →「変更を破棄」→「既定の台本に戻す」
  await toView('settings');
  await page.fill('[data-bind="checklist.sections[0].blocks[0].items[0].label"]', '');
  await saveSettings();
  const t12b = await st(() => { const el = document.getElementById('toast'); return el.className + '|' + el.textContent; });
  expect(/\berror\b/.test(t12b) && (await storedProfile()).checklist.sections[0].blocks[0].items[0].label === '土日を含む週3日以上、5時間以上' && !!(await page.$('#settingsIssues')),
    'E12 空の文言は検証エラーで保存されない（保存済みの文言のまま・エラーの一覧）: ' + t12b);
  await page.click('#view-settings [data-action="discard"]');
  await wait(200);
  await page.click('#view-settings [data-action="cl-default"]');
  await wait(150);
  await saveSettings();
  const sp12b = await storedProfile();
  expect(sp12b.checklist.sections[0].blocks[0].items[1].label === '指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆）' && JSON.stringify(sp12b.checklist).includes('rt_manner') &&
    (await txtIn(page, '#clMaxNote')).includes('満点 16 点') && await st(() => window.RecruitRules.interviewModel(window.RecruitApp.state.profile, window.RecruitRules.emptyChecklist()).max) === 16,
    'E12 「既定の台本に戻す」で既定の文言・確認点・満点 16');
  // 5. 壊れた台本（sections:"x"・mustFailResult:"xxx"）の保存済み設定は既定の台本・reject に戻る
  const errs12 = errors.length;
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1')); p.checklist.sections = 'x'; p.checklist.mustFailResult = 'xxx'; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); });
  await page.reload();
  await wait(300);
  const c12 = await st(() => { const c = window.RecruitApp.state.profile.checklist; return { n: c.sections.length, m: c.mustFailResult }; });
  expect(c12.n === 5 && c12.m === 'reject' && errors.length === errs12, 'E12 壊れた台本の設定は既定の台本・reject に戻る（エラーなし）: ' + JSON.stringify(c12));
  // 6. 他劇場の設定で保存された記録 → toast
  const rec12 = parseRecord(fs.readFileSync(file34b, 'utf8'));
  rec12.profile.theaterName = 'TOHOシネマズ 他劇場';
  const file12 = path.join(OUT, 'other-theater.html');
  fs.writeFileSync(file12, await st(r => window.RecruitStorage.generateReportHTML(r, window.RecruitApp.state.profile), rec12));
  await page.setInputFiles('#fileInput', file12);
  await wait(500);
  const t12c = await toastText();
  expect(await step() === 4 && t12c.includes('このファイルは「TOHOシネマズ 他劇場」の設定で保存されています。現在の設定で判定し直します') && !t12c.includes('確認点が異なります'),
    'E12 他劇場の設定で保存された記録は toast で知らせる: ' + t12c);
  // 7. 名簿にない担当者（手入力）の押印・取消（アプリ ③）
  const box12 = (id) => '#mgmtCard .stamp-box[data-field-id="' + id + '"]';
  await page.click(box12('interviewer') + ' [data-action="unstamp"]');
  await wait(150);
  expect(!(await st(() => window.RecruitApp.state.management.interviewer)) && !(await page.$(box12('interviewer') + ' svg.hanko')), 'E12 押印欄の「取消」で印が消える');
  await page.selectOption(box12('interviewer') + ' select', '__free');
  await wait(100);
  expect(await visible(box12('interviewer') + ' .stamp-free'), 'E12 「名簿にない担当者（手入力）」を選ぶと氏名欄が出る');
  await page.click(box12('interviewer') + ' [data-action="stamp"]');
  await wait(150);
  expect(!(await st(() => window.RecruitApp.state.management.interviewer)) && (await toastText()).includes('氏名を入力してください'), 'E12 手入力の氏名が空なら押印しない（toast）');
  await page.fill(box12('interviewer') + ' .stamp-free', '山田 太郎');
  await page.click(box12('interviewer') + ' [data-action="stamp"]');
  await wait(200);
  const m12 = await st(() => window.RecruitApp.state.management.interviewer);
  expect(!!m12 && m12.name === '山田 太郎' && m12.short === '山田' && m12.title === '' && m12.date === '2026.10.10' && !!(await page.$(box12('interviewer') + ' svg.hanko')) &&
    (await txtIn(page, box12('interviewer') + ' .stamp-meta')).includes('山田 太郎'),
    'E12 手入力の担当者で押印（印字名は姓）: ' + JSON.stringify(m12));
  // 最終合否も手入力の担当者で押せる（最終確認が未押印なら同じ担当者の印も押す）
  await page.click('#decisionCard [data-action="undecide"]');
  await wait(150);
  await page.click(box12('final') + ' [data-action="unstamp"]');
  await wait(150);
  await page.selectOption('#decisionManager', '__free');
  await wait(100);
  expect(await visible('#decisionFree'), 'E12 最終合否でも「手入力」を選ぶと氏名欄が出る');
  await page.fill('#decisionFree', '鈴木 花子');
  await page.click('#decisionCard [data-action="decide"][data-value="reject"]');
  await wait(200);
  const d12 = await st(() => { const s = window.RecruitApp.state; return { d: s.decision && s.decision.result, by: s.decision && s.decision.by.name, short: s.decision && s.decision.by.short, final: (s.management.final || {}).name }; });
  expect(d12.d === 'reject' && d12.by === '鈴木 花子' && d12.short === '鈴木' && d12.final === '鈴木 花子' && (await txtIn(page, '#sumDecision')).includes('不採用・鈴木'),
    'E12 手入力の担当者で「不採用」→ 最終確認にも同じ担当者の印: ' + JSON.stringify(d12));
  // 8. 保存 HTML 上の取消・手入力の押印・合否の取消 → 押印を保存
  const saved12 = await saveRecord('free-stamps.html');
  expect(saved12.rec.management.interviewer.name === '山田 太郎' && saved12.rec.decision.by.name === '鈴木 花子' && saved12.html.includes('data-filename="応募者_台本_花子_2026-10-10_不採用.html"'),
    'E12 手入力の押印・合否を保存（ファイル名 _不採用）');
  const rp12Err = [];
  const rp12 = await newReportPage(rp12Err);
  await rp12.goto('file://' + saved12.file);
  await rp12.waitForTimeout(300);
  const rbox12 = (id) => '#a4 .stamp-box[data-field-id="' + id + '"]';
  const popErr12 = () => rp12.evaluate(() => { const e = document.querySelector('#a4Pop .pop-err'); return e ? e.textContent : null; });
  // 押印の取消: 用紙の押印欄 → 窓の［取消］（docs/SPEC-a4.md 3-5）
  await openStamp(rp12, 'interviewer');
  await popAct(rp12, 'unstamp');
  expect(!(await rp12.$(rbox12('interviewer') + ' svg.hanko')) && !(await rp12.$('#a4Pop')) && await shownIn(rp12, '#saveBar') && (await txtIn(rp12, '#saveBarMsg')) === '押印・合否を変更しました',
    'E12 保存 HTML の用紙の押印欄 → 窓の「取消」で印が消える（窓は閉じ、右下に保存バー）');
  // 未押印の「面接対応者」（担当と連動する押印欄 interviewerField）の窓は、台本の担当（header.interviewer）を名簿から初期選択（docs/SPEC-a4.md 1-4）。
  //   そのまま［押印］で名簿の担当者の印（役職つき）→ 書き出したファイルにも名簿の値
  await openStamp(rp12, 'interviewer');
  const ini12 = await rp12.evaluate(() => { const s = document.querySelector('#a4Pop select'); return { v: s.value, t: s.selectedOptions[0].textContent, free: !!document.querySelector('#a4Pop .pop-free:not([hidden])') }; });
  await popAct(rp12, 'stamp');
  if (await rp12.$('#a4Pop')) await rp12.keyboard.press('Escape');   // 初期選択が無く押印できなかったときも先へ進める（確認は下の expect）
  const mg12r = await txtIn(rp12, rbox12('interviewer') + ' .stamp-meta');
  const [dl12r] = await Promise.all([rp12.waitForEvent('download'), rp12.click('#saveBarBtn')]);
  const file12r = path.join(OUT, 'free-stamps-roster.html');
  await dl12r.saveAs(file12r);
  const r12r = parseRecord(fs.readFileSync(file12r, 'utf8')).management.interviewer;
  expect(saved12.rec.checklist.header.interviewer === '笹川 晴央' && ini12.v === '0' && ini12.t === SASA && !ini12.free && !(await rp12.$('#a4Pop')) && mg12r.includes(SASA) &&
    r12r.name === '笹川 晴央' && r12r.short === '笹川' && r12r.title === '副支配人' && r12r.date === '2026.10.10',
    'E12 未押印の面接対応者の窓は台本の担当（笹川 晴央）を名簿から初期選択・そのまま押印すると名簿の担当者（役職つき）で、書き出したファイルにも入る: ' + JSON.stringify({ ini12, mg12r, r12r }));
  // 担当者が未選択・手入力の氏名が空なら押印しない（窓の中に 1 行のエラー。alert は出さない）。もう一度取り消して未押印から確かめる
  await openStamp(rp12, 'interviewer');
  if (await rp12.$('#a4Pop [data-act="unstamp"]')) await popAct(rp12, 'unstamp'); else await rp12.keyboard.press('Escape');
  await openStamp(rp12, 'interviewer');
  await rp12.selectOption('#a4Pop select', '');
  await popAct(rp12, 'stamp');
  const e12a = await popErr12();
  await popSel(rp12, '__free');
  await rp12.waitForTimeout(80);
  const free12 = await shownIn(rp12, '#a4Pop .pop-free');
  await popAct(rp12, 'stamp');
  const e12b = await popErr12();
  expect(e12a === '担当者を選んでください' && free12 && e12b === '氏名を入力してください' && !!(await rp12.$('#a4Pop')) && !(await rp12.$(rbox12('interviewer') + ' svg.hanko')),
    'E12 窓で担当者が未選択 →「担当者を選んでください」・手入力で氏名が空 →「氏名を入力してください」（どちらも押印しない・窓は開いたまま）: ' + JSON.stringify({ e12a, free12, e12b }));
  await rp12.fill('#a4Pop .pop-free', '佐藤 次郎');
  await popAct(rp12, 'stamp');
  expect(!(await rp12.$('#a4Pop')) && !!(await rp12.$(rbox12('interviewer') + ' svg.hanko')) && (await txtIn(rp12, rbox12('interviewer') + ' .stamp-meta')).includes('佐藤 次郎'), 'E12 保存 HTML の窓で手入力の担当者で押印');
  // 合否の取消: 用紙の「最終合否」→ 窓の［取消］（押印は消さない）。キーボード（Tab で欄 → Enter → Tab で［取消］→ Enter）でも、取消のあとはフォーカスが新しい欄に戻る
  await rp12.focus('#a4Decision');
  await rp12.keyboard.press('Enter');
  await rp12.waitForTimeout(80);
  const kb12 = await rp12.evaluate(() => Array.from(document.querySelectorAll('#a4Pop [data-act]')).map(b => b.getAttribute('data-act')));
  await rp12.focus('#a4Pop [data-act="undecide"]');
  await rp12.keyboard.press('Enter');
  await rp12.waitForTimeout(150);
  const fn12 = await rp12.evaluate(() => document.body.getAttribute('data-filename'));
  const fc12 = await rp12.evaluate(() => ({ id: document.activeElement && document.activeElement.id, tag: document.activeElement && document.activeElement.tagName, exp: document.getElementById('a4Decision').getAttribute('aria-expanded') }));
  expect(kb12.includes('undecide') && await rp12.$eval('#a4Decision', el => el.classList.contains('is-none')) && !(await rp12.$('#a4Pop')) && !(await rp12.$('#a4 .cl-decision svg.verdict-stamp')) && !!(await rp12.$(rbox12('final') + ' svg.hanko')) &&
    fn12 === '応募者_台本_花子_2026-10-10.html' && fc12.id === 'a4Decision' && fc12.exp === null,
    'E12 保存 HTML 上で合否を取り消すと用紙の合否スタンプとファイル名の _不採用 が外れる（最終確認の印は残る・フォーカスは描き直した「最終合否」の欄に戻る）: ' + JSON.stringify({ fn12, fc12 }));
  const [dl12] = await Promise.all([rp12.waitForEvent('download'), rp12.click('#saveBarBtn')]);
  const file12b = path.join(OUT, 'free-stamps-resaved.html');
  await dl12.saveAs(file12b);
  const r12b = parseRecord(fs.readFileSync(file12b, 'utf8'));
  expect(r12b.decision == null && r12b.management.interviewer.name === '佐藤 次郎' && r12b.management.interviewer.short === '佐藤' && r12b.management.final.name === '鈴木 花子',
    'E12 押印を保存した再出力ファイル: 合否なし・面接対応者は手入力の担当者・最終確認の印は残る: ' + JSON.stringify(r12b.management));
  expect(rp12Err.length === 0, 'E12 保存 HTML のページエラーなし: ' + (rp12Err.join(' / ') || 'none'));
  // 9. 最終合否の ON/OFF（設定「応募者の管理（押印）」）
  await toView('settings');
  const set12 = await st(() => { const q = (p) => document.querySelector('[data-bind="management.decision.' + p + '"]'); return q('enabled') && {
    enabled: q('enabled').checked, label: q('label').value, hire: q('hireLabel').value, reject: q('rejectLabel').value, field: q('stampField').value, auto: q('autoStampFinal').checked, suffix: q('filenameSuffix').checked }; });
  expect(!!set12 && set12.enabled && set12.label === '最終合否' && set12.hire === '採用' && set12.reject === '不採用' && set12.field === 'final' && set12.auto && set12.suffix,
    'E12 設定に最終合否（有効・表示名・採用／不採用・連動する押印欄・ファイル名）: ' + JSON.stringify(set12));
  await page.click('label:has([data-bind="management.decision.enabled"])');
  await wait(100);
  await saveSettings();
  await toView('judge');
  expect(await step() === 4 && !(await page.$('#decisionCard')) && !(await page.$('#sumDecision')) && !(await page.$('#appPaper .cl-decision')) && await st(() => (window.RecruitApp.state.decision || {}).result) === 'reject',
    'E12 最終合否を OFF にすると ③ のカード・紙の合否欄・右サマリーを出さない（記録は保持）');
  const saved12c = await saveRecord('decision-off.html');
  const rp12c = await newReportPage(rp12Err);
  await rp12c.goto('file://' + saved12c.file);
  await rp12c.waitForTimeout(300);
  await rp12c.click('#a4 .cl-judge');
  await rp12c.waitForTimeout(100);
  const off12 = { dec: !!(await rp12c.$('#a4Decision')), cl: !!(await rp12c.$('.cl-decision')), pop: !!(await rp12c.$('#a4Pop')), stamps: (await rp12c.$$('#a4 .cl-stamps .stamp-box[data-a4-t="stamp"]')).length,
    cfg: await rp12c.evaluate(() => JSON.parse(document.getElementById('recruit-mgmt-config').textContent).decision) };
  expect(!off12.dec && !off12.cl && !off12.pop && off12.stamps === 2 && off12.cfg === null && rp12Err.length === 0,
    'E12 最終合否 OFF で保存した HTML に合否の欄が無い（結果ストリップをクリックしても窓は出ない・押印欄は押せる・エラーなし）: ' + JSON.stringify(off12) + ' ' + (rp12Err.join(' / ') || 'ok'));
  await rp12c.close();
  await rp12.close();
  await toView('settings');
  await page.click('label:has([data-bind="management.decision.enabled"])');
  await wait(100);
  await saveSettings();
  await toView('judge');
  expect(!!(await page.$('#decisionCard svg.verdict-stamp')) && (await txtIn(page, '#sumDecision')).includes('不採用・鈴木'), 'E12 ON に戻すと ③ のカード（記録した合否）が戻る');
  await fresh();

  // =====================================================================
  // E13 ロゴ（brand.js）と、ロゴ・名簿入りの版（node build.js --local）
  //   公開版の dist はロゴなし（1 文字のマーク）。--local はテスト用の架空のロゴ・名簿（tests/fixtures/local-sample）で確認する
  // =====================================================================
  await fresh();
  expect(!(await visible('#brandLogo')) && await visible('#brandMark') && (await page.textContent('#brandMark')) === '新' && !(await page.$eval('#brand', el => el.classList.contains('has-logo'))),
    'E13 公開版（dist）はロゴなし・1 文字のマーク「新」');
  expect(!saved34.html.includes('<img class="cl-title-logo"') && saved34.html.includes('<div class="cl-title"><span class="cl-title-t">面接チェックリスト報告</span>'),
    'E13 公開版の保存 HTML の用紙の見出しはロゴなし（題名だけ）');
  {
    const cp = require('child_process');
    const ROOT13 = path.join(__dirname, '..');
    const DIST13 = path.join(ROOT13, 'dist', 'toho-recruit-judge.html');
    const OUT13 = path.join(OUT, 'local-build.html');
    const before13 = fs.readFileSync(DIST13, 'utf8');
    const log13 = cp.execSync('node build.js --local tests/fixtures/local-sample --out ' + JSON.stringify(OUT13), { cwd: ROOT13 }).toString();
    const built13 = fs.readFileSync(OUT13, 'utf8');
    expect(log13.includes('ロゴ・名簿 2 名') && built13.includes('見本 一郎') && built13.includes('data:image/png;base64,') && fs.readFileSync(DIST13, 'utf8') === before13,
      'E13 node build.js --local でロゴ・名簿入りの版を別のファイルに作る（公開版の dist は変わらない）: ' + log13.trim().split('\n').join(' / '));
    let refused13 = false;
    try { cp.execSync('node build.js --local tests/fixtures/local-sample --out dist/toho-recruit-judge.html', { cwd: ROOT13, stdio: 'pipe' }); } catch (e) { refused13 = true; }
    expect(refused13 && fs.readFileSync(DIST13, 'utf8') === before13, 'E13 --local の出力で公開版の dist を上書きしようとすると止まる');
    // ロゴ入りの版を開く（同じ file:// の localStorage を使うので先に消す）
    const lerr13 = [];
    const lp = await newReportPage(lerr13);
    await lp.goto('file://' + OUT13);
    await lp.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await lp.reload();
    await lp.waitForTimeout(300);
    const side13 = await lp.evaluate(() => { const i = document.getElementById('brandLogo'); const r = i.getBoundingClientRect(); return { hidden: i.hidden, alt: i.alt, natural: i.naturalWidth, w: Math.round(r.width), mark: document.getElementById('brandMark').hidden, cls: document.getElementById('brand').classList.contains('has-logo'), bg: getComputedStyle(i).backgroundColor }; });
    expect(!side13.hidden && side13.alt === 'SAMPLE LOGO' && side13.natural === 220 && side13.w > 100 && side13.w <= 200 && side13.mark && side13.cls,
      'E13 ロゴ入りの版: サイドバーにロゴ（代替テキスト・幅 200px 以内）、1 文字のマークは出さない: ' + JSON.stringify(side13));
    await lp.click('#btnTheme');
    await lp.waitForTimeout(200);
    const dark13 = await lp.evaluate(() => getComputedStyle(document.getElementById('brandLogo')).backgroundColor);
    await lp.click('#btnTheme');
    await lp.waitForTimeout(100);
    expect(side13.bg === 'rgba(0, 0, 0, 0)' && dark13 === 'rgb(255, 255, 255)', 'E13 ダークモードではロゴを白い台紙に載せる（ライトは透明）: ' + side13.bg + ' / ' + dark13);
    const opts13 = await lp.$$eval('#saInterviewer option', els => els.map(e => e.textContent));
    expect(opts13.some(t => t.includes('見本 一郎')) && opts13.some(t => t.includes('試験 花子')) && !opts13.some(t => t.includes('笹川')),
      'E13 名簿は local の managers.txt に置き換わる: ' + JSON.stringify(opts13));
    // 用紙の見出しにもロゴ（③ の紙・保存 HTML。高さ 7mm ≒ 26.5px。docs/SPEC-a4.md A3）
    await lp.fill('[data-field="name"]', 'ロゴ 確認');
    const [dl13] = await Promise.all([lp.waitForEvent('download'), lp.click('#btnSave')]);
    const rf13 = path.join(OUT, 'local-build-report.html');
    await dl13.saveAs(rf13);
    const logoOf = (sel) => ((s) => { const i = document.querySelector(s); if (!i) return null; const r = i.getBoundingClientRect(), z = r.width / (i.offsetWidth || 1) || 1;
      return { alt: i.alt, natural: i.naturalWidth, h: +(r.height / z).toFixed(1), first: i.parentNode.firstElementChild === i, title: (i.parentNode.querySelector('.cl-title-t') || {}).textContent }; })(sel);
    const rp13 = await newReportPage(lerr13);
    await rp13.goto('file://' + rf13);
    await rp13.waitForTimeout(300);
    const head13 = await rp13.evaluate(logoOf, '#a4 .cl-title-logo');
    expect(!!head13 && head13.alt === 'SAMPLE LOGO' && head13.natural === 220 && Math.abs(head13.h - 26.5) <= 1 && head13.first && head13.title === '面接チェックリスト報告',
      'E13 保存 HTML の用紙の見出しにロゴ（題名の左・高さ 7mm）: ' + JSON.stringify(head13));
    await lp.click('[data-action="script-next"]');
    await lp.waitForTimeout(300);
    await lp.click('[data-action="judge"]');
    await lp.waitForTimeout(400);
    const app13 = await lp.evaluate(logoOf, '#appPaper .cl-title-logo');
    expect(!!app13 && app13.alt === 'SAMPLE LOGO' && Math.abs(app13.h - 26.5) <= 1 && app13.first, 'E13 アプリ ③ の紙の見出しにも同じロゴ: ' + JSON.stringify(app13));
    expect(lerr13.length === 0, 'E13 ロゴ入りの版・保存レポートでページエラーなし: ' + (lerr13.join(' / ') || 'none'));
    await rp13.close();
    await lp.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await lp.close();
  }
  await fresh();

  // =====================================================================
  // E14 A4 用紙（docs/SPEC-a4.md 7-3。指示「出力の HTML は A4 たてがた。その様式で印刷もしたい（別にしない）」）
  //   (1) 寸法 (2) 画面と印刷が同じ様式 (3) 欄クリックの窓・印刷に出ない・書き出しに残らない・アプリの紙は押せない
  //   (4) 長いメモの全文 (5) 390px の縮小表示 (6) ロゴは E13 (7) アプリの印刷と保存 HTML の印刷 (A11) 旧い保存 HTML
  // =====================================================================
  console.log('\n== E14 A4 用紙 ==');
  const cp14 = require('child_process');
  const hasPpm14 = (() => { try { cp14.execSync('pdftoppm -v', { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
  const png14 = (pdf, base) => { cp14.execSync('pdftoppm -r 96 -png -singlefile -f 1 -l 1 ' + JSON.stringify(pdf) + ' ' + JSON.stringify(base)); return base + '.png'; };
  // 2 枚の画像を同じ大きさ（400×566）に縮め、灰度 < 235 の外接矩形（幅・高さで割った値）と 8×8 ブロックの平均差を出す
  const cmp14 = async (fa, fb) => {
    const cpg = await ctx.newPage();
    const url = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const r = await cpg.evaluate(async ([ua, ub]) => {
      const W = 400, H = 566;
      const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
      const gray = async (u) => {
        const i = await load(u), c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(i, 0, 0, W, H);
        const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
        for (let k = 0; k < W * H; k++) g[k] = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
        return { g, size: [i.naturalWidth, i.naturalHeight] };
      };
      const box = (g) => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] < 235) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H]; };
      const A = await gray(ua), B = await gray(ub);
      let sum = 0, n = 0, max = 0;
      for (let by = 0; by + 8 <= H; by += 8) for (let bx = 0; bx + 8 <= W; bx += 8) {
        let sa = 0, sb = 0;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { sa += A.g[(by + y) * W + bx + x]; sb += B.g[(by + y) * W + bx + x]; }
        const df = Math.abs(sa - sb) / 64; sum += df; n++; max = Math.max(max, df);
      }
      return { sizeA: A.size, sizeB: B.size, a: box(A.g), b: box(B.g), mean: +(sum / n).toFixed(2), max: +max.toFixed(1) };
    }, [url(fa), url(fb)]);
    await cpg.close();
    r.diff = r.a.map((v, i) => +Math.abs(v - r.b[i]).toFixed(4));
    return r;
  };
  // 2 枚の PNG を原寸のまま比べ、どれかの色が 16 を超えて違う画素の数と外接矩形を出す（同じ用紙を同じ設定で印刷した 2 つの PDF の比較用）
  const diff14 = async (fa, fb) => {
    const cpg = await ctx.newPage();
    const url = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const r = await cpg.evaluate(async ([ua, ub]) => {
      const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
      const px = (i) => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
      const A = await load(ua), B = await load(ub);
      if (A.naturalWidth !== B.naturalWidth || A.naturalHeight !== B.naturalHeight) return { size: false, n: -1 };
      const W = A.naturalWidth, da = px(A), db = px(B);
      let n = 0, x0 = W, y0 = 1e9, x1 = -1, y1 = -1;
      for (let k = 0; k < da.length; k += 4) {
        if (Math.abs(da[k] - db[k]) > 16 || Math.abs(da[k + 1] - db[k + 1]) > 16 || Math.abs(da[k + 2] - db[k + 2]) > 16) {
          const p = k / 4, x = p % W, y = (p - x) / W; n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
      return { size: true, n, box: n ? [x0, y0, x1, y1] : null };
    }, [url(fa), url(fb)]);
    await cpg.close();
    return r;
  };
  const e14 = [];
  const a4State = (pg) => pg.evaluate(() => { const sh = document.querySelector('#a4 .cl-sheet'); return { cls: sh.className, zoom: sh.style.zoom }; });
  // (1) 寸法: 画面の用紙は 210×297mm（96dpi で 793.7×1122.5px）・内側の余白 8mm／10mm
  const p14 = await newReportPage(e14);
  await p14.setViewportSize({ width: 1440, height: 1300 });
  await p14.goto('file://' + saved9.file);
  await p14.waitForTimeout(300);
  await p14.mouse.move(0, 0);
  const dim14 = await p14.evaluate(() => { const a = document.getElementById('a4'), r = a.getBoundingClientRect(), cs = getComputedStyle(a);
    return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), zoom: getComputedStyle(document.documentElement).getPropertyValue('--a4-zoom').trim(), pt: +parseFloat(cs.paddingTop).toFixed(2), pl: +parseFloat(cs.paddingLeft).toFixed(2),
      live: document.body.classList.contains('a4-live'), first: document.body.firstElementChild === a, bg: getComputedStyle(document.body).backgroundColor, paper: cs.backgroundColor }; });
  expect(Math.abs(dim14.w - 793.7) <= 1 && Math.abs(dim14.h - 1122.5) <= 1 && dim14.zoom === '' && Math.abs(dim14.pt - 30.24) <= 0.2 && Math.abs(dim14.pl - 37.8) <= 0.2 && dim14.live && dim14.first &&
    dim14.bg === 'rgb(230, 233, 238)' && dim14.paper === 'rgb(255, 255, 255)',
    'E14 (1) 画面の用紙は body の最初の要素・210×297mm（793.7×1122.5px）・内側の余白 8mm／10mm・灰色の背景に白い用紙・1440px では縮小なし: ' + JSON.stringify(dim14));
  await p14.screenshot({ path: path.join(OUT, 'a4-screen.png') });
  // (2) 画面と印刷が同じ様式: 用紙の要素のスクリーンショットと PDF の 1 ページ目の画像を同じ大きさに縮めて重ねる
  const scr14 = path.join(OUT, 'a4-screen-paper.png');
  await p14.locator('#a4').screenshot({ path: scr14 });
  const st14a = await a4State(p14);
  const pdf14 = path.join(OUT, 'a4-print.pdf');
  await p14.pdf({ path: pdf14, format: 'A4', printBackground: true });
  const n14 = pdfPagesOf(pdf14);
  expect((n14 === -1 || n14 === 1) && JSON.stringify(await a4State(p14)) === JSON.stringify(st14a), 'E14 (2) 保存 HTML をそのまま印刷して 1 ページ（印刷の前後で用紙の状態は変わらない）: ' + n14);
  let prn14 = null;
  if (hasPpm14) {
    prn14 = png14(pdf14, path.join(OUT, 'a4-print'));
    const c14 = await cmp14(scr14, prn14);
    expect(c14.diff.every(d => d <= 0.02) && c14.mean <= 4, 'E14 (2) 画面の用紙と印刷（PDF の画像）が同じ様式: 白以外の外接矩形の差が ±2% 以内・8×8 ブロックの平均差 4 以下: ' + JSON.stringify(c14));
  } else console.log('SKIP pdftoppm が使えないため画面と印刷の画像の比較を省略');
  // (3) 窓: 用紙の押印欄をクリック → 窓（role=dialog・欄名・担当者にフォーカス）→ Esc で閉じて欄にフォーカスが戻る
  await openStamp(p14, 'final');
  const pp14 = await p14.evaluate(() => { const p = document.getElementById('a4Pop'), b = document.querySelector('#a4 .stamp-box[data-field-id="final"]');
    return p && { role: p.getAttribute('role'), h: document.getElementById('a4PopH').textContent, focus: document.activeElement === p.querySelector('select'), exp: b.getAttribute('aria-expanded'),
      body: p.parentNode === document.body, shown: p.getClientRects().length > 0, label: b.getAttribute('aria-label') }; });
  await p14.keyboard.press('Escape');
  await p14.waitForTimeout(80);
  const esc14 = await p14.evaluate(() => ({ pop: !!document.getElementById('a4Pop'), focus: document.activeElement && document.activeElement.getAttribute('data-field-id'), exp: document.querySelector('#a4 .stamp-box[data-field-id="final"]').getAttribute('aria-expanded') }));
  expect(!!pp14 && pp14.role === 'dialog' && pp14.h === '最終確認' && pp14.focus && pp14.exp === 'true' && pp14.body && pp14.shown && pp14.label === '最終確認の押印' && !esc14.pop && esc14.focus === 'final' && esc14.exp === null,
    'E14 (3) 用紙の押印欄をクリックすると窓（role=dialog・欄名・担当者にフォーカス・body 直下）・Esc で閉じて欄にフォーカスが戻る: ' + JSON.stringify({ pp14, esc14 }));
  //   キーボード操作の直後（Esc で欄に戻った・Shift+Tab で「最終合否」に移った）に印刷しても、欄のフォーカス枠は紙に出ない（画面では青い枠）
  const ring14 = async () => {
    const scr = await p14.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { id: a.id || a.getAttribute('data-field-id'), style: cs.outlineStyle, color: cs.outlineColor }; });
    await p14.emulateMedia({ media: 'print' });
    const prn = await p14.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    await p14.emulateMedia({ media: null });
    return Object.assign(scr, { print: prn });
  };
  const ringF14 = await ring14();
  await p14.keyboard.press('Shift+Tab');
  await p14.keyboard.press('Shift+Tab');
  await p14.waitForTimeout(50);
  const ringD14 = await ring14();
  let ringP14 = null;
  if (hasPpm14 && prn14) {
    const pdf = path.join(OUT, 'a4-print-focus.pdf');
    await p14.pdf({ path: pdf, format: 'A4', printBackground: true });
    ringP14 = await diff14(png14(pdf, path.join(OUT, 'a4-print-focus')), prn14);
  }
  expect(ringF14.id === 'final' && ringF14.style === 'solid' && ringF14.color === 'rgb(31, 95, 191)' && ringF14.print === 'none' &&
    ringD14.id === 'a4Decision' && ringD14.style === 'solid' && ringD14.print === 'none' && (ringP14 === null || (ringP14.size && ringP14.n === 0)),
    'E14 (3) キーボード操作の直後に印刷しても欄のフォーカス枠は出ない（画面は青い枠・印刷は outline なし・PDF の画像はフォーカスなしの印刷と画素単位で同じ）: ' + JSON.stringify({ ringF14, ringD14, ringP14 }));
  await p14.focus('#a4 .stamp-box[data-field-id="final"]');
  await p14.keyboard.press('Enter');
  await p14.waitForTimeout(80);
  const ent14 = !!(await p14.$('#a4Pop'));
  await p14.keyboard.press('Escape');
  await p14.waitForTimeout(80);
  await p14.keyboard.press('Space');
  await p14.waitForTimeout(80);
  const spc14 = !!(await p14.$('#a4Pop'));
  await p14.mouse.click(8, 8);
  await p14.waitForTimeout(80);
  expect(ent14 && spc14 && !(await p14.$('#a4Pop')), 'E14 (3) Enter・Space でも窓が開き、窓の外のクリックで閉じる: ' + JSON.stringify({ ent14, spc14 }));
  // ホバーの案内（画面だけ。印刷では出ない。寸法を変えない）
  const boxSz14 = () => p14.evaluate(() => { const r = document.querySelector('#a4 .stamp-box[data-field-id="final"]').getBoundingClientRect(); return r.width + 'x' + r.height + '|' + document.querySelector('#a4 .cl-sheet').getBoundingClientRect().height; });
  const sz14a = await boxSz14();
  await p14.hover('#a4 .stamp-box[data-field-id="final"]');
  const hv14 = await p14.evaluate(() => { const b = document.querySelector('#a4 .stamp-box[data-field-id="final"]'); return { after: getComputedStyle(b, '::after').content, outline: getComputedStyle(b).outlineStyle, cursor: getComputedStyle(b).cursor }; });
  const sz14b = await boxSz14();
  await p14.emulateMedia({ media: 'print' });
  const hp14 = await p14.evaluate(() => getComputedStyle(document.querySelector('#a4 .stamp-box[data-field-id="final"]'), '::after').content);
  await p14.emulateMedia({ media: null });
  expect(hv14.after.includes('クリックで押印') && hv14.outline === 'solid' && hv14.cursor === 'pointer' && !hp14.includes('クリックで押印') && sz14a === sz14b,
    'E14 (3) ホバーで薄い枠と「クリックで押印」（印刷の表示では出ない・欄と用紙の寸法は変わらない）: ' + JSON.stringify({ hv14, hp14, sz14a, sz14b }));
  //   案内は 1 行（折り返さない）。最終合否の欄（未押印で 86×58px と小さい）の案内は欄の上の辺の外に出し、「未押印」・押した日付を隠さない
  const hint14 = async (pg, sel) => { await pg.hover(sel); return pg.evaluate((q) => { const el = document.querySelector(q), a = getComputedStyle(el, '::after');
    return { c: a.content, ws: a.whiteSpace, h: parseFloat(a.height), bottom: parseFloat(a.bottom), ch: el.clientHeight, w: Math.round(el.getBoundingClientRect().width) }; }, sel); };
  const hD14 = await hint14(p14, '#a4Decision');
  const hS14 = await hint14(p14, '#a4 .stamp-box[data-field-id="final"]');
  const p14h = await newReportPage(e14);
  await p14h.goto('file://' + path.join(OUT, 'stamps-2-reject.html'));
  await p14h.waitForTimeout(300);
  const hN14 = await hint14(p14h, '#a4Decision.is-none');
  await p14h.close();
  const above14 = (x) => x.c.includes('クリックで合否を押す') && x.ws === 'nowrap' && x.h <= 13 && x.bottom >= x.ch - 0.5;
  expect(above14(hD14) && above14(hN14) && hN14.w < 100 && hS14.c.includes('クリックで押印') && hS14.ws === 'nowrap' && hS14.h <= 13 && hS14.bottom < hS14.ch,
    'E14 (3) 案内は 1 行。最終合否の欄（押した後・未押印）の案内は欄の上の辺の外（欄の中の文字を隠さない）・押印欄は欄の右下: ' + JSON.stringify({ hD14, hN14, hS14 }));
  await p14.mouse.move(0, 0);
  // 押印を 1 つ変えて保存バーを出し、窓も開いたまま印刷 → 窓・バー・案内は PDF に出ない
  await openStamp(p14, 'interviewer');
  await popAct(p14, 'unstamp');
  await openStamp(p14, 'final');
  await p14.hover('#a4 .stamp-box[data-field-id="interviewer"]');
  await p14.screenshot({ path: path.join(OUT, 'a4-popover.png') });
  const vis14 = { pop: await shownIn(p14, '#a4Pop'), bar: await shownIn(p14, '#saveBar') };
  const pdf14b = path.join(OUT, 'a4-print-popover.pdf');
  await p14.pdf({ path: pdf14b, format: 'A4', printBackground: true });
  const n14b = pdfPagesOf(pdf14b);
  const t14b = pdfTextOf(pdf14b);
  const leak14 = t14b === null ? [] : ['閉じる', '押印を保存', '押印・合否を変更しました', 'クリックで押印', '担当者を選択', '名簿にない担当者'].filter(w => t14b.includes(w));
  expect(vis14.pop && vis14.bar && (n14b === -1 || n14b === 1) && !leak14.length && (t14b === null || t14b.includes('押印二郎')),
    'E14 (3) 窓と保存バーを出したまま印刷しても 1 ページ・窓・バー・ホバーの案内は印刷されない: ' + JSON.stringify({ vis14, pages: n14b, leak14 }));
  // 書き出し: 窓・バー・押せる欄の印・縮小の変数を外した複製を書き出す（生きているページはそのまま）
  const [dl14] = await Promise.all([p14.waitForEvent('download'), p14.click('#saveBarBtn')]);
  const f14 = path.join(OUT, 'a4-exported.html');
  await dl14.saveAs(f14);
  const h14 = fs.readFileSync(f14, 'utf8');
  const left14 = ['class="pop', 'id="a4Pop"', 'class="savebar', 'id="saveBar"', 'a4-live', 'data-a4-t=', '--a4-zoom', 'aria-expanded', 'tabindex=', 'role="button"'].filter(w => shownHtml(h14).includes(w));
  const r14 = parseRecord(h14);
  expect(!left14.length && h14.startsWith('<!DOCTYPE html>\n<html') && !r14.management.interviewer && !!r14.management.final && (await p14.evaluate(() => document.body.classList.contains('a4-live'))),
    'E14 (3) 書き出したファイルに窓・保存バー・a4-live・押せる欄の印・--a4-zoom が残らない（埋め込みデータは変更どおり）: ' + JSON.stringify(left14));
  const p14b = await newReportPage(e14);
  await p14b.goto('file://' + f14);
  await p14b.waitForTimeout(300);
  const re14 = await p14b.evaluate(() => { const r = document.getElementById('a4').getBoundingClientRect(); return { pop: !!document.querySelector('.pop'), bar: !!document.querySelector('.savebar'), live: document.body.classList.contains('a4-live'),
    w: +r.width.toFixed(1), h: +r.height.toFixed(1), hanko: document.querySelectorAll('#a4 svg.hanko').length, marks: document.querySelectorAll('#a4 [data-a4-t="stamp"]').length }; });
  expect(!re14.pop && !re14.bar && re14.live && Math.abs(re14.w - 793.7) <= 1 && Math.abs(re14.h - 1122.5) <= 1 && re14.hanko === 1 && re14.marks === 2,
    'E14 (3) 書き出したファイルを開くと窓・バーなし・同じ寸法の用紙・押せる欄はスクリプトが付け直す: ' + JSON.stringify(re14));
  await p14b.close();
  // 保存バーは右下（用紙の上部＝見出し・氏名・最終合否を隠さない）。出ているあいだは下に余白を足し、いちばん下までスクロールすれば用紙・注記に重ならない。
  //   保存後は［×］で閉じられる（変更中は閉じられない）。1280×768 と 390×844（用紙が 1 画面に収まる幅）で確かめる
  const bar14 = (pg) => pg.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };
    const hit = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const el = document.getElementById('saveBar'), bar = R(el), x = document.getElementById('saveBarClose');
    return { bar, vh: window.innerHeight, vw: document.documentElement.clientWidth, cls: document.body.className, pad: parseFloat(getComputedStyle(document.body).paddingBottom), bh: el ? el.offsetHeight : 0,
      x: !!x && !x.hidden && x.getClientRects().length > 0, msg: (document.getElementById('saveBarMsg') || {}).textContent || '',
      hitDec: hit(bar, R(document.getElementById('a4Decision'))), hitTitle: hit(bar, R(document.querySelector('#a4 .cl-title'))), hitName: hit(bar, R(document.querySelector('#a4 .cl-sh-name'))),
      hitPaper: hit(bar, R(document.getElementById('a4'))), hitFoot: hit(bar, R(document.getElementById('a4Foot'))) };
  });
  const scr14s = (pg, y) => pg.evaluate((v) => window.scrollTo(0, v === 'end' ? document.documentElement.scrollHeight : v), y);
  const p14s = await newReportPage(e14);
  await p14s.setViewportSize({ width: 1280, height: 768 });
  await p14s.goto('file://' + saved9.file);
  await p14s.waitForTimeout(300);
  await openStamp(p14s, 'interviewer');
  await popAct(p14s, 'unstamp');
  const bs14 = {};
  for (const y of [0, 120, 'end']) { await scr14s(p14s, y); bs14['dirty' + y] = await bar14(p14s); }
  await scr14s(p14s, 0);
  const [dl14s] = await Promise.all([p14s.waitForEvent('download'), p14s.click('#saveBarBtn')]);
  const f14s = path.join(OUT, 'a4-exported-bar.html');
  await dl14s.saveAs(f14s);
  for (const y of [0, 120, 'end']) { await scr14s(p14s, y); bs14['saved' + y] = await bar14(p14s); }
  const low14 = (b) => !!b.bar && Math.abs(b.bar.b - (b.vh - 12)) <= 1 && b.bar.r <= b.vw - 11 && b.cls.split(' ').includes('a4-sb') && Math.abs(b.pad - (b.bh + 12)) <= 1;
  const top14 = (b) => !b.hitDec && !b.hitTitle && !b.hitName;
  await p14s.click('#saveBarClose');
  await p14s.waitForTimeout(80);
  const cl14s = await p14s.evaluate(() => ({ bar: !!document.getElementById('saveBar'), cls: document.body.className, style: document.body.getAttribute('style'), pad: getComputedStyle(document.body).paddingBottom }));
  const h14s = fs.readFileSync(f14s, 'utf8');
  expect(['dirty0', 'dirty120', 'dirtyend', 'saved0', 'saved120', 'savedend'].every(k => low14(bs14[k])) &&
    top14(bs14.dirty0) && top14(bs14.dirty120) && top14(bs14.saved0) && top14(bs14.saved120) &&
    !bs14.dirtyend.hitPaper && !bs14.dirtyend.hitFoot && !bs14.savedend.hitPaper && !bs14.savedend.hitFoot &&
    !bs14.dirty0.x && bs14.saved0.x && bs14.saved0.msg === '保存しました（保存できなかったときは再保存）' &&
    !cl14s.bar && cl14s.cls === 'a4-doc a4-live' && cl14s.style === null && cl14s.pad === '0px' &&
    /<body class="a4-doc" data-filename="[^"]+">/.test(h14s) && !shownHtml(h14s).includes('a4-sb') && !shownHtml(h14s).includes('saveBarClose'),
    'E14 (3) 1280×768: 保存バーは右下で見出し・氏名・最終合否を隠さない（スクロール 0／120px）・いちばん下までスクロールすれば用紙と注記に重ならない・保存後は［×］で閉じる・書き出しに余白の印が残らない: ' +
    JSON.stringify({ d0: bs14.dirty0.bar, dEnd: [bs14.dirtyend.hitPaper, bs14.dirtyend.hitFoot], s0: bs14.saved0.bar, pad: bs14.saved0.pad, bh: bs14.saved0.bh, cl14s }));
  await p14s.setViewportSize({ width: 390, height: 844 });
  await p14s.waitForTimeout(250);
  await openStamp(p14s, 'final');
  await popAct(p14s, 'unstamp');
  const bn14 = await bar14(p14s);
  await Promise.all([p14s.waitForEvent('download'), p14s.click('#saveBarBtn')]);
  const bn14s = await bar14(p14s);
  const in14 = (b) => !!b.bar && b.bar.l >= 0 && b.bar.r <= 390 && b.bar.b <= b.vh && !b.hitPaper && !b.hitTitle && !b.hitName && !b.hitDec;
  expect(in14(bn14) && in14(bn14s) && bn14s.x && (await p14s.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1,
    'E14 (5) 390×844: 保存バー（変更中・保存後）は縮小した用紙の下に出て、見出し・氏名・最終合否・用紙に重ならない（保存後は［×］あり・横スクロールなし）: ' + JSON.stringify({ bn14: bn14.bar, bn14s: bn14s.bar }));
  await p14s.close();
  // アプリ ③ の紙の欄はクリックしても何もしない（操作は下のカード。docs/SPEC-a4.md A10）
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved9.file);
  await wait(500);
  const mg14 = () => st(() => JSON.stringify([window.RecruitApp.state.management, window.RecruitApp.state.decision]));
  const mg14a = await mg14();
  await page.click('#appPaper .stamp-box[data-field-id="final"]');
  await page.click('#appPaperDecision');
  await wait(150);
  expect(await step() === 4 && !(await page.$('.pop')) && !(await page.$('#a4Pop')) && (await mg14()) === mg14a && !(await page.$('#appPaper [data-a4-t]')),
    'E14 (3) アプリ ③ の紙の押印欄・最終合否をクリックしても窓は出ず、押印・合否は変わらない');
  await sshot('a4-app.png');
  // (7) アプリの A4 印刷と保存 HTML の印刷: どちらも 1 ページ・同じ見出し・同じ様式（同じ記録）
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  await page.emulateMedia({ media: 'print' });
  const pdf14app = path.join(OUT, 'a4-app-print.pdf');
  await page.pdf({ path: pdf14app, format: 'A4', printBackground: true });
  await page.emulateMedia({ media: null });
  await st(() => window.RecruitApp.prepareChecklistSheet(false));
  const nA14 = pdfPagesOf(pdf14app), tA14 = pdfTextOf(pdf14app), tS14 = pdfTextOf(pdf14);
  const HEAD14 = ['面接チェックリスト報告', '台本2026-10-08版／TOHOシネマズ新宿／作成2026/10/10'];
  expect((nA14 === -1 || nA14 === 1) && (n14 === -1 || n14 === 1) && (tA14 === null || tS14 === null || HEAD14.every(h => tA14.includes(h) && tS14.includes(h))),
    'E14 (7) アプリの A4 印刷と保存 HTML の印刷はどちらも 1 ページ・同じ見出し（題名・台本の版／劇場／作成日）: ' + JSON.stringify({ app: nA14, saved: n14 }));
  if (hasPpm14 && prn14) {
    const c14b = await cmp14(png14(pdf14app, path.join(OUT, 'a4-app-print')), prn14);
    expect(c14b.diff.every(d => d <= 0.02) && c14b.mean <= 4, 'E14 (7) アプリの印刷と保存 HTML の印刷の画像が同じ様式（外接矩形 ±2%・平均差 4 以下）: ' + JSON.stringify(c14b));
  }
  // (4) 長いメモ: 「…」で切れたメモはクリックで全文（埋め込みの記録の値。textContent で入れる）
  const p14c = await newReportPage(e14);
  await p14c.goto('file://' + saved39.file);
  await p14c.waitForTimeout(300);
  const st14h = await a4State(p14c);
  const rec14 = saved39.rec;
  const nMemo14 = await p14c.evaluate(() => document.querySelectorAll('#a4 [data-a4-t="memo"]').length);
  await p14c.hover('#a4 .cl-nm-iv .cl-nm-v.cl-cut');
  const ul14 = await p14c.evaluate(() => getComputedStyle(document.querySelector('#a4 .cl-nm-iv .cl-nm-v')).textDecorationLine);
  await p14c.click('#a4 .cl-nm-iv .cl-nm-v.cl-cut');
  const iv14 = { h: await txtIn(p14c, '#a4PopH'), t: await txtIn(p14c, '#a4Pop .pop-text'), kind: await p14c.evaluate(() => document.getElementById('a4Pop').getAttribute('data-kind')) };
  await p14c.keyboard.press('Escape');
  const rtId14 = await p14c.evaluate(() => { const el = document.querySelector('#a4 .cl-rt-nt.cl-cut'); return el ? el.closest('tr').getAttribute('data-cl-item') : null; });
  if (rtId14) await p14c.click('#a4 tr[data-cl-item="' + rtId14 + '"] .cl-rt-nt');
  const rt14 = rtId14 ? { h: await txtIn(p14c, '#a4PopH'), t: await txtIn(p14c, '#a4Pop .pop-text') } : null;
  await p14c.keyboard.press('Escape');
  expect(nMemo14 >= 1 && ul14.includes('underline') && iv14.kind === 'memo' && iv14.h === '面接所見' && iv14.t === rec14.interviewNotes && iv14.t.length === 1500 && !!rt14 && rt14.t === rec14.checklist.notes[rtId14] && rt14.h.endsWith(' のメモ'),
    'E14 (4) 「…」で切れた面接所見・確認点のメモはホバーで下線・クリックで窓に全文（記録の値と一致）: ' + JSON.stringify({ nMemo14, ul14, iv: [iv14.h, iv14.t.length], rt: rt14 && [rtId14, rt14.h, rt14.t.length] }));
  //   窓が欄の上にも下にも入らないとき（1366×768 で欄が画面の上から 300px）は画面の中に収める（［閉じる］が見える）
  await p14c.setViewportSize({ width: 1366, height: 768 });
  await p14c.waitForTimeout(200);
  await p14c.evaluate(() => { const r = document.querySelector('#a4 .cl-nm-iv .cl-nm-v').getBoundingClientRect(); window.scrollBy(0, r.top - 300); });
  await p14c.waitForTimeout(80);
  await p14c.click('#a4 .cl-nm-iv .cl-nm-v.cl-cut');
  const pl14 = await p14c.evaluate(() => { const p = document.getElementById('a4Pop').getBoundingClientRect(), c = document.querySelector('#a4Pop [data-act="close"]').getBoundingClientRect(), f = document.querySelector('#a4 .cl-nm-iv .cl-nm-v').getBoundingClientRect();
    const b = document.querySelector('#a4Pop .pop-b');
    return { top: Math.round(p.top), bottom: Math.round(p.bottom), h: Math.round(p.height), closeB: Math.round(c.bottom), fieldT: Math.round(f.top), fieldB: Math.round(f.bottom), vh: window.innerHeight, scroll: b.scrollHeight > b.clientHeight + 1 }; });
  await p14c.keyboard.press('Escape');
  expect(pl14.fieldT - 6 - pl14.h < 8 && pl14.fieldB + 6 + pl14.h > pl14.vh - 8 && pl14.top >= 8 && pl14.bottom <= pl14.vh - 7 && pl14.closeB <= pl14.bottom && pl14.scroll,
    'E14 (4) 全文の窓が欄の上にも下にも入らないときは画面の中に収める（本文だけがスクロールし、［閉じる］は窓の中に見えている）: ' + JSON.stringify(pl14));
  await p14c.close();
  //   質問の回答を省いた用紙（.cl-compact-2）: 案内の行をクリックすると全メモ（省いた質問の回答を含む）
  let m14 = null;
  for (const extra of [20, 30, 45]) {
    const f = path.join(OUT, 'a4-memos.html');
    fs.writeFileSync(f, await page.evaluate(mk39, { q: 300, iv: 2000, extra }));
    const pg = await newReportPage(e14);
    await pg.goto('file://' + f);
    await pg.waitForTimeout(300);
    if ((await a4State(pg)).cls.includes('cl-compact-2')) { m14 = { pg, f, extra }; break; }
    await pg.close();
  }
  if (!m14) expect(false, 'E14 (4) .cl-compact-2 になる記録を作れない');
  else {
    const recM14 = parseRecord(fs.readFileSync(m14.f, 'utf8'));
    const ref14 = await m14.pg.evaluate(() => { const r = document.querySelector('#a4 .cl-nm-ref'); return { t: r.innerText.trim(), mark: r.getAttribute('data-a4-t'), role: r.getAttribute('role') }; });
    await m14.pg.click('#a4 .cl-nm-ref');
    const ms14 = await m14.pg.evaluate(() => { const rows = Array.from(document.querySelectorAll('#a4 .cl-nm-row'));
      return { rows: rows.map(r => r.getAttribute('data-cl-block') || (r.classList.contains('cl-nm-iv') ? 'iv' : 'memo')), hidden: rows.filter(r => !r.getClientRects().length).length,
        dd: Array.from(document.querySelectorAll('#a4Pop .pop-memos dd')).map(e => e.textContent), dt: Array.from(document.querySelectorAll('#a4Pop .pop-memos dt')).map(e => e.textContent), h: document.getElementById('a4PopH').textContent }; });
    const want14 = ms14.rows.map(k => k === 'iv' ? recM14.interviewNotes : k === 'memo' ? recM14.applicant.reviewerNotes : recM14.checklist.notes[k]);
    expect(ref14.mark === 'memos' && ref14.role === 'button' && ref14.t === '質問の回答は省略（画面でこの行をクリックすると、回答と「…」で切れたメモの全文を表示します）' && ms14.h === '面接メモ（全文）' &&
      ms14.hidden >= 1 && ms14.dd.length === ms14.rows.length && JSON.stringify(ms14.dd) === JSON.stringify(want14) && ms14.dt[ms14.dt.length - 1] === '面接所見',
      'E14 (4) 質問の回答を省いた用紙（.cl-compact-2）は案内の行のクリックで全メモ（省いた回答を含む・記録の値と一致）: ' + JSON.stringify({ extra: m14.extra, ref14, rows: ms14.rows, hidden: ms14.hidden, dt: ms14.dt }));
    await m14.pg.close();
  }
  // (5) 390px: 用紙ごと縮小（横スクロールなし・縦横比はそのまま・押印行は 2 列のまま）。窓は画面の中。印刷は変わらず 1 ページ
  const p14e = await newReportPage(e14);
  await p14e.goto('file://' + saved9.file);
  await p14e.waitForTimeout(300);
  await p14e.setViewportSize({ width: 390, height: 844 });
  await p14e.waitForTimeout(250);
  const nr14f = () => p14e.evaluate(() => { const a = document.getElementById('a4'), r = a.getBoundingClientRect(), row = document.querySelector('#a4 .cl-stamps .stamp-row');
    return { ov: document.documentElement.scrollWidth - window.innerWidth, zoom: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--a4-zoom')), w: +r.width.toFixed(1), ratio: +(r.height / r.width).toFixed(4),
      cols: getComputedStyle(row).gridTemplateColumns.split(' ').length }; });
  const nr14 = await nr14f();
  const st14n = await a4State(p14e);
  expect(nr14.ov <= 1 && Math.abs(nr14.zoom - 0.451) <= 0.01 && Math.abs(nr14.w - 358) <= 2 && Math.abs(nr14.ratio - 297 / 210) <= 0.01 && nr14.cols === 2,
    'E14 (5) 390px は用紙ごと縮小（--a4-zoom≒0.451・幅 358px・縦横比 297/210・押印行 2 列・横スクロールなし）: ' + JSON.stringify(nr14));
  await p14e.mouse.move(0, 0);
  await p14e.screenshot({ path: path.join(OUT, 'a4-narrow.png'), fullPage: true });
  await openStamp(p14e, 'interviewer');
  const pr14 = await p14e.evaluate(() => { const r = document.getElementById('a4Pop').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; });
  await p14e.keyboard.press('Escape');
  await openDecision(p14e);
  const pd14 = await p14e.evaluate(() => { const r = document.getElementById('a4Pop').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; });
  await p14e.keyboard.press('Escape');
  expect(pr14.l >= 0 && pr14.r <= 390 && pd14.l >= 0 && pd14.r <= 390, 'E14 (5) 390px でも窓は画面の中（押印・最終合否）: ' + JSON.stringify({ pr14, pd14 }));
  const pdf14n = path.join(OUT, 'a4-narrow.pdf');
  await p14e.pdf({ path: pdf14n, format: 'A4', printBackground: true });
  const n14n = pdfPagesOf(pdf14n);
  expect((n14n === -1 || n14n === 1) && JSON.stringify(await a4State(p14e)) === JSON.stringify(st14n) && JSON.stringify(st14n) === JSON.stringify(st14a),
    'E14 (5) 390px で印刷しても 1 ページ（計測し直さない・1440px と同じ詰め方）: ' + JSON.stringify({ pages: n14n, st14n }));
  if (hasPpm14 && prn14) {
    const c14n = await cmp14(png14(pdf14n, path.join(OUT, 'a4-narrow-print')), prn14);
    expect(c14n.diff.every(d => d <= 0.02) && c14n.mean <= 4, 'E14 (5) 390px の画面から印刷しても 1440px と同じ用紙: ' + JSON.stringify(c14n));
  }
  await p14e.close();
  //   重いサンプル（.cl-compact が付く）を 390px で最初から開く: 計測は縮小（--a4-zoom）を外して行うので、1440px で開いたときと同じ詰め方・同じ zoom。
  //   印刷の表示でも用紙の内寸（押印行まで）に収まる。この幅で押印を変えて書き出したファイルに --a4-zoom が残らない（生きているページは縮小のまま）
  const p14n = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', acceptDownloads: true }).then(c => c.newPage());
  p14n.on('pageerror', e => e14.push(e.message));
  p14n.on('console', m => { if (m.type() === 'error') e14.push('console: ' + m.text()); });
  await p14n.clock.setFixedTime(NOW);
  await p14n.goto('file://' + saved39.file);
  await p14n.waitForTimeout(400);
  const st14w = await a4State(p14n);
  const zw14 = await p14n.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--a4-zoom').trim());
  await p14n.emulateMedia({ media: 'print' });
  const fp14 = await p14n.evaluate(() => { const a = document.getElementById('a4').getBoundingClientRect(), sh = document.querySelector('#a4 .cl-sheet').getBoundingClientRect(), stp = document.querySelector('#a4 .cl-stamps').getBoundingClientRect(), pad = parseFloat(getComputedStyle(document.getElementById('a4')).paddingBottom);
    return { sheetH: Math.round(sh.height), stampsB: Math.round(stp.bottom), innerB: Math.round(a.bottom - pad) }; });
  const pdf14w = path.join(OUT, 'a4-narrow-heavy.pdf');
  await p14n.pdf({ path: pdf14w, format: 'A4', printBackground: true });
  await p14n.emulateMedia({ media: null });
  const n14w = pdfPagesOf(pdf14w);
  await openStamp(p14n, 'interviewer');
  await popAct(p14n, 'unstamp');
  const [dl14w] = await Promise.all([p14n.waitForEvent('download'), p14n.click('#saveBarBtn')]);
  const f14w = path.join(OUT, 'a4-exported-narrow.html');
  await dl14w.saveAs(f14w);
  const h14w = fs.readFileSync(f14w, 'utf8');
  const zw14b = await p14n.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--a4-zoom').trim());
  await p14n.context().close();
  expect(st14h.cls.includes('cl-compact') && JSON.stringify(st14w) === JSON.stringify(st14h) && Math.abs(parseFloat(zw14) - 0.451) <= 0.01 && fp14.sheetH <= 1052 && fp14.stampsB <= fp14.innerB + 1 &&
    (n14w === -1 || n14w === 1) && !shownHtml(h14w).includes('--a4-zoom') && h14w.includes('<html lang="ja">') && zw14b === zw14,
    'E14 (5) 重いサンプルを 390px で最初から開いても 1440px と同じ詰め方（縮小を外して計測）・印刷で押印行まで内寸に収まる・この幅で書き出したファイルに --a4-zoom が残らない: ' +
    JSON.stringify({ st14h, st14w, zw14, fp14, pages: n14w }));
  await p14.close();
  // (A11) 旧い保存 HTML（A4 化の前に出力したもの）はそのまま開け（自分のスクリプトで動く）、アプリで読み込んで保存し直すと A4 の用紙になる
  const fx14 = path.join(FIX, 'legacy-report-view.html');
  const p14f = await newReportPage(e14);
  await p14f.goto('file://' + fx14);
  await p14f.waitForTimeout(300);
  const old14 = await p14f.evaluate(() => ({ body: document.body.className, full: !!document.getElementById('rtViewFull'), paper: !!document.getElementById('clPaper') }));
  await p14f.click('#rtViewFull');
  await p14f.waitForTimeout(150);
  const old14b = await p14f.evaluate(() => document.body.className);
  await p14f.close();
  expect(old14.body.includes('view-report') && old14.full && old14.paper && old14b.includes('view-full'), 'E14 (A11) 旧い保存 HTML（報告書／詳細の切替つき）はそのまま開いて動く: ' + JSON.stringify({ old14, old14b }));
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', fx14);
  await wait(500);
  const s14 = await st(() => { const s = window.RecruitApp.state; return { step: s.step, name: s.applicant.name, iv: (s.management.interviewer || {}).name }; });
  const sv14 = await saveRecord('legacy-report-view-resaved.html');
  const p14g = await newReportPage(e14);
  await p14g.goto('file://' + sv14.file);
  await p14g.waitForTimeout(300);
  const new14 = await p14g.evaluate(() => ({ body: document.body.className, a4: !!document.getElementById('a4'), hanko: document.querySelectorAll('#a4 svg.hanko').length, name: (document.querySelector('#a4 .cl-sh-name') || {}).textContent }));
  await p14g.close();
  expect(s14.step === 4 && s14.name === '旧版 花子' && s14.iv === '笹川 晴央' && new14.body === 'a4-doc a4-live' && new14.a4 && new14.hanko === 1 && new14.name === '旧版 花子さん',
    'E14 (A11) 旧い保存 HTML をアプリで読み込み → 保存し直すと A4 の用紙（押印を引き継ぐ）: ' + JSON.stringify({ s14, new14 }));
  expect(e14.length === 0, 'E14 保存 HTML のページエラー・console error なし: ' + (e14.join(' / ') || 'none'));
  await fresh();

  expect(errors.length === 0, 'ERRORS: ' + (errors.length ? JSON.stringify(errors) : 'none'));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  console.log('\n' + (fails.length ? fails.length + ' FAILED:\n - ' + fails.join('\n - ') : 'ALL PASSED'));
  if (fails.length) process.exit(1);
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
