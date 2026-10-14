/*
 * 配布ファイル（dist/toho-recruit-judge.html）のブラウザ通しテスト。
 *   node build.js && node tests/e2e.js
 * Playwright と Chromium が必要（npx playwright install chromium）。
 * スクリーンショットは tests/shots/ に出力（git 管理外）。
 * 失敗した確認（FAIL）が 1 つでもあれば exit 1。
 *
 * シナリオ（docs/SPEC-script-mode.md 7-3・docs/SPEC-slim.md 5-2。2026-10-14 の面接特化で E1〜E39 → E1〜E11 に振り直し、E12 を追加）
 *   E1  3 ステップ・① 応募者（詳細モードの保存済み設定は 3 ステップで開く・詳細項目なし・390px）
 *   E2  ② 面接チェックリスト（①〜⑤ のみ・読み取り専用ヘッダー）→ ③ 報告書（紙プレビュー・判定サマリー・必須条件・総合判断・押印 2 欄）
 *   E3  押印 → 保存 → 保存 HTML（報告書表示・詳細・最終合否・押印を保存・A4 印刷）→ アプリで読込
 *   E4  旧レコードの読み込み（詳細モードの記録・初期対応者の押印入り・v1）
 *   E5  ダークモードの紙・390px
 *   E6  ③ を開かずに ② から保存・印刷しても判定が入る・② で保存した記録は ② から再開・印刷の経路（🖨・② の印刷ボタン・beforeprint）・総合判断未入力の保存
 *   E7  旧レコード（消極属性入り）の読み込み
 *   E8  A4 報告（1 ページの要約）: 紙プレビューに質問文なし・結果が上部・1280/1440px で横スクロールなし・重いサンプルでも 1 ページ（.cl-compact）・PDF の本文
 *   E9  押印欄 2 つ（初期対応者なし）: アプリ・紙・印刷用・保存 HTML・右サマリー・設定・旧い 3 欄の設定
 *   E10 設定画面（5 節・data-bind の許可リスト・保存／破棄／初期化・書き出し・v1／詳細モードの JSON の読み込み）・使い方
 *   E11 保存 HTML の印刷（A4 で印刷だけ・報告書表示の Ctrl+P は A4・詳細表示はブラウザ既定）・アプリの A4 印刷（押印 2 欄・1 ページ）
 *   E12 設定の反映（必須条件の不一致を上長最終判断要に・台本の文言と確認点の増減・満点・空の文言・既定に戻す・壊れた台本）・読み込みの toast（確認点の差・他劇場）・
 *       手入力の押印と最終合否・保存 HTML 上の取消・最終合否の ON/OFF（旧 E22・E26・E28・E31 のうち残した機能）
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
  expect(!!(await page.$('#mgmtCard .stamp-box[data-field-id="interviewer"] svg.hanko')) && await st(() => (window.RecruitApp.state.management.interviewer || {}).name) === '笹川 晴央',
    'E3 「面接対応者」に押印（初期選択のまま押せる）');
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
    saved34.html.includes('<body class="view-report has-cl mode-script" data-filename="応募者_台本_花子_2026-10-10.html">'),
    'E3 保存: 記録に mode・handoff・scores・contribution が無い・応募者 6 キー・判定（mode=script）・body.view-report.has-cl.mode-script: ' + Object.keys(r34).join(','));
  const in34 = ['<h2>応募者情報</h2>', '<h2>面接チェックリスト</h2>', '<h2>採用可否判定</h2>', '<h2>応募者の管理</h2>', 'id="rtPrintChecklist"', 'id="clPaper"', 'id="clSheet"'].filter(t => !saved34.html.includes(t));
  // 節（section.sec）は要素の形で調べる（reportCss のセレクタに data-sec="handoff" の文字列が残るため）
  const out34 = ['<h2>面接者への申し送り（留意点）</h2>', '<h2>シフト貢献度</h2>', '<h2>面接で確認した情報</h2>', '<h2>面接前に分かっている情報（未確認）</h2>', '<h2>応募時の情報</h2>', '<h2>面接者への申し送りコメント</h2>',
    'id="rtPrintSheet"', 'id="rtPrintAll"', 'class="dash"', 'data-tile=', '<section class="sec" data-sec="contrib"', '<section class="sec" data-sec="handoff"', '初期対応者', 'data-field-id="initial"'].filter(t => saved34.html.includes(t));
  expect(!in34.length && !out34.length, 'E3 保存 HTML は 応募者情報・面接チェックリスト・採用可否判定・応募者の管理 の節だけ（留意点・シフト貢献度の節・申し送りシート・レポート全体の印刷ボタン・ダッシュ・初期対応者なし）: ' + JSON.stringify({ missing: in34, extra: out34 }));
  // 消極属性は 2026-10-13 に削除: 保存 HTML（埋め込みの記録を含む）に「消極属性」「朝～12時のみ」が無い（「短期希望」は台本の質問文にだけ出るので、ヘッダー・応募者情報・A4 のヘッダーで調べる）
  expect(!saved34.html.includes('消極属性') && !saved34.html.includes('朝～12時のみ') && r34.checklist.header.negatives === undefined && !('negatives' in r34.checklistDef.header),
    'E3 保存 HTML・記録に消極属性が無い');
  const rp34Err = [];
  const rp34 = await newReportPage(rp34Err);
  await rp34.goto('file://' + saved34.file);
  await rp34.waitForTimeout(300);
  const cls34 = await rp34.evaluate(() => document.body.className);
  expect(cls34.includes('view-report') && cls34.includes('mode-script') && await shownIn(rp34, '#clPaper .cl-sheet') && !(await shownIn(rp34, '.rh')) && await shownIn(rp34, '#decision') && await shownIn(rp34, '#mgmt') && await dispIn(rp34, '#clSheet') === 'none',
    'E3 保存 HTML は報告書表示で開く（紙プレビュー・最終合否・押印。印刷用 #clSheet は非表示）: ' + cls34);
  const hd34 = await rp34.evaluate(() => ({ paper: (document.querySelector('#clPaper .cl-sheet-head') || {}).textContent || '', sheet: (document.querySelector('#clSheet .cl-sheet-head') || {}).textContent || '', rh: (document.querySelector('.rh') || {}).textContent || '' }));
  expect(['台本 花子', '大学2年生・20歳・女性', '2029年3月', '短期求人', '可・2,500円', '2026/10/10', '笹川 晴央'].every(t => hd34.paper.includes(t) && hd34.sheet.includes(t)) &&
    [hd34.paper, hd34.sheet, hd34.rh].every(t => !t.includes('短期希望') && !t.includes('消極属性')) && !hd34.paper.includes('目安') && hd34.rh.includes('短期求人'),
    'E3 A4 のヘッダーは 氏名・区分・年齢・性別・卒業予定・求人・タクシー・面接日・担当（消極属性・短期希望・目安なし）: ' + JSON.stringify(hd34));
  const pj34 = await txtIn(rp34, '#clPaper .cl-judge');
  expect(pj34.includes('総合判断') && pj34.includes('採用推奨') && !pj34.includes('シフト貢献度'), 'E3 紙プレビューの判定サマリー（総合判断・結果。貢献度なし）');
  await rp34.screenshot({ path: path.join(OUT, '44-script-report.png'), fullPage: true });
  await rp34.click('#rtViewFull');
  await rp34.waitForTimeout(150);
  const secs34 = await rp34.$$eval('section.sec', els => els.filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.sec));
  expect(JSON.stringify(secs34) === JSON.stringify(['applicant', 'checklist', 'judgment', 'mgmt']) && await shownIn(rp34, '.rh') && !(await rp34.$('.dash')),
    'E3 「詳細」は ヘッダー・応募者情報・面接チェックリスト・採用可否判定・応募者の管理 だけ（ダッシュ .dash なし）: ' + secs34.join(','));
  const app34 = await txtIn(rp34, 'section.sec[data-sec="applicant"]');
  expect(['台本 花子', '20歳', '女性', '大学2年生', '2029年3月', '短期求人', '可・2,500円', '2026/10/10', '笹川 晴央', '電話の受け答えが丁寧。'].every(t => app34.includes(t)) && !app34.includes('通勤') && !app34.includes('勤務期間') &&
    !app34.includes('短期希望') && !app34.includes('消極属性'),
    'E3 「応募者情報」は Step① の項目だけ（消極属性なし）');
  const memo34 = await rp34.evaluate(() => Array.from(document.querySelectorAll('section.sec[data-sec="applicant"] th')).map(e => e.textContent.trim()));
  const paperMemo34 = await rp34.evaluate(() => Array.from(document.querySelectorAll('#clSheet .cl-nm-row .cl-nm-k')).map(e => e.textContent.trim()));
  expect(memo34.includes('メモ') && !memo34.some(t => t.includes('備考')) && paperMemo34.includes('メモ') && !paperMemo34.includes('備考'),
    'E3 Step① の「メモ（任意）」は保存 HTML の応募者情報・A4 でも「メモ」（「備考」の見出しは出さない）: ' + JSON.stringify({ memo34, paperMemo34 }));
  const jd34 = await txtIn(rp34, 'section.sec[data-sec="judgment"]');
  expect(['必須条件', '面接評価（確認点）', '総合判断', '採用推奨'].every(t => jd34.includes(t)) && !jd34.includes('2軸') && !jd34.includes('シフト貢献度'), 'E3 「採用可否判定」は台本モードの要約（必須条件・採点・総合判断・結果）');
  const pb34 = await rp34.$$eval('.rtool button[id^="rtPrint"]', els => els.map(e => e.id + ':' + e.textContent));
  expect(JSON.stringify(pb34) === JSON.stringify(['rtPrintChecklist:A4 で印刷（1 ページ）']), 'E3 印刷ボタンは「A4 で印刷（1 ページ）」だけ: ' + pb34.join(','));
  await rp34.screenshot({ path: path.join(OUT, '45-script-report-full.png'), fullPage: true });
  await rp34.click('#rtViewReport');
  await rp34.waitForTimeout(150);
  await rp34.selectOption('#decision select', { label: SASA });
  await rp34.click('#decision [data-act="decide"][data-value="hire"]');
  await rp34.waitForTimeout(200);
  const fn34 = await rp34.evaluate(() => document.body.getAttribute('data-filename'));
  expect(!!(await rp34.$('#clPaper .cl-decision svg.verdict-stamp')) && !!(await rp34.$('#mgmt .stamp-box[data-field-id="final"] svg.hanko')) && fn34 === '応募者_台本_花子_2026-10-10_採用.html',
    'E3 保存 HTML で「採用」→ 紙に採用スタンプ・最終確認に自動押印・ファイル名 _採用: ' + fn34);
  const [dl34] = await Promise.all([rp34.waitForEvent('download'), rp34.click('#mgmtSaveBtn')]);
  const file34b = path.join(OUT, 'script-report-hire.html');
  await dl34.saveAs(file34b);
  const r34b = parseRecord(fs.readFileSync(file34b, 'utf8'));
  expect(!('mode' in r34b) && r34b.decision && r34b.decision.result === 'hire' && r34b.management.final && r34b.management.final.name === '笹川 晴央' && r34b.management.interviewer.name === '笹川 晴央',
    'E3 押印を保存した再出力ファイルに decision（採用）・最終確認（mode は書かない）');
  await rp34.goto('file://' + file34b);
  await rp34.waitForTimeout(300);
  const pdf34 = path.join(OUT, 'script-report.pdf');
  await rp34.pdf({ path: pdf34, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await rp34.waitForTimeout(100);
  const n34 = pdfPagesOf(pdf34);
  const t34 = pdfTextOf(pdf34);
  console.log('script-report.pdf pages:', n34);
  expect((n34 === -1 || n34 === 1) && (t34 === null || (t34.includes('面接チェックリスト報告') && !t34.includes('シフト貢献度') && !t34.includes('消極属性'))),
    'E3 報告書表示のまま印刷すると面接チェックリスト報告（A4 1 枚・貢献度なし）: ' + n34);
  // PDF の本文に 結果・氏名・最終合否・押した人（笹川晴央）。説明文・質問文は載せない（pdftotext の空白は詰めて比べる）
  expect(t34 === null || (['採用推奨', '台本花子', '最終合否', '笹川晴央', '確認点', '必須条件', '面接メモ'].every(t => t34.includes(t)) && !t34.includes('歌舞伎町ですので') && !t34.includes('シフト提出は木曜23時')),
    'E3 A4 報告の PDF に 結果・氏名・最終合否・笹川晴央（質問文・説明文なし）: ' + (t34 === null ? 'pdftotext なし（省略）' : 'ok'));
  expect(rp34Err.length === 0, 'E3 保存 HTML のページエラー・console error なし: ' + (rp34Err.join(' / ') || 'none'));
  await rp34.close();
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  const s34 = await st(() => { const s = window.RecruitApp.state; return { step: s.step, d: s.decision && s.decision.result, final: (s.management.final || {}).name }; });
  expect(s34.step === 4 && (await page.$$('#stepNav li')).length === 3 && s34.d === 'hire' && s34.final === '笹川 晴央' && !!(await page.$('#decisionCard svg.verdict-stamp')) &&
    !!(await page.$('#appPaper .cl-decision svg.verdict-stamp')) && (await txtIn(page, '#sumDecision')).includes('採用・笹川'),
    'E3 アプリで読み込むと報告書（③）に合否・押印を引き継ぐ: ' + JSON.stringify(s34));
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
    color: getComputedStyle(document.querySelector('#appPaper .cl-sheet')).color }));
  expect(await step() === 4 && dk36.theme === 'dark' && dk36.bg === 'rgb(255, 255, 255)' && dk36.color === 'rgb(17, 17, 17)', 'E5 ダークモードでも報告書の紙プレビューは白地・黒字: ' + JSON.stringify(dk36));
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
  const tile37 = await txtIn(rp37, '#clPaper .cl-tile-res');
  await rp37.click('#rtViewFull');
  await rp37.waitForTimeout(150);
  const jd37 = await txtIn(rp37, 'section.sec[data-sec="judgment"]');
  const vd37 = await txtIn(rp37, '.rh .verdict');
  const dash37 = !!(await rp37.$('.dash'));
  expect(tile37.includes('採用推奨') && jd37.includes('採用推奨') && !jd37.includes('未実施') && vd37.includes('採用推奨') && !dash37,
    'E6 保存 HTML の紙に結果タイル（採用推奨）・「詳細」の採用可否判定・ヘッダーに結果（「未実施」なし。ダッシュ .dash は無い）: ' + JSON.stringify({ tile37, vd37, dash37 }));
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
  expect(await step() === 4 && pv39.qs.length === 0 && pv39.res >= 0 && pv39.res <= 160 && pv39.rows === 7 && pv39.must === 2 && pv39.res2 === '採用推奨' && !pv39.cls.includes('cl-compact') && pv39.h <= 950,
    'E8 ③ の紙プレビュー: 質問文・説明文・補足・注記なし・結果バッジは紙の上端から 160px 以内・確認点 7 行・必須条件 2 行（標準のサンプルは .cl-compact なし）: ' + JSON.stringify(Object.assign({}, pv39, { order: undefined })));
  expect(JSON.stringify(pv39.order) === JSON.stringify(['cl-sheet-head', 'cl-judge', 'cl-cols', 'cl-blk.cl-blk-rate', 'cl-blk.cl-blk-notes', 'cl-exline']),
    'E8 紙の並び: ヘッダー → 結果ストリップ → 必須条件｜勤務条件の確認 → 確認点 → 面接メモ → 説明・連絡: ' + JSON.stringify(pv39.order));
  // 2. 1280px・1366px・1440px で横スクロールなし（アプリ ③ の紙・保存 HTML の報告書表示）。
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
    wide39.push({ w, app: await ov(page, '#appPaperWrap'), rep: await ov(rp39, '#reportPaper'), res: (await page.evaluate(paperOf, ['#appPaper', QS39])).res, fz });
    if (w === 1280) await sshot('49-script-step3-1280.png');
  }
  expect(wide39.every(x => x.app.doc <= 1 && x.app.wrap <= 1 && x.rep.doc <= 1 && x.rep.wrap <= 1 && x.res <= 160), 'E8 1280px・1366px・1440px の紙プレビューで横スクロールなし（アプリ ③・保存 HTML）: ' + JSON.stringify(wide39.map(x => ({ w: x.w, app: x.app, rep: x.rep, res: x.res }))));
  expect(wide39.every(x => x.fz.zoom === 1 && x.fz.body >= 9.5 && x.fz.label >= 8.5 && x.fz.res >= 14 && x.fz.stack === (x.w < 1440) && x.fz.below === x.fz.stack),
    'E8 アプリ ③ の紙は 1280px・1366px でも等倍（本文 9.5px・ラベル 8.5px・結果 14px）。右サマリーの横に入らない幅は右サマリーを紙の下へ: ' + JSON.stringify(wide39.map(x => Object.assign({ w: x.w }, x.fz))));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await rp39.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  const rv39 = await rp39.evaluate(paperOf, ['#clPaper', QS39]);
  expect(rv39.qs.length === 0 && rv39.res <= 160 && rv39.rows === 7 && rv39.res2 === '採用推奨' && !!(await rp39.$('#clPaper .cl-decision svg.verdict-stamp')),
    'E8 保存 HTML の報告書表示も同じ 1 ページの要約（質問文なし・結果が上部・最終合否の採用スタンプ）: ' + JSON.stringify(Object.assign({}, rv39, { order: undefined })));
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
  expect(await step() === 4 && hv39.cls.includes('cl-compact') && hv39.h <= 950 && hv39.res <= 160 && hv39.rows === 7 && hv39.qs.length === 0,
    'E8 重いサンプル（全メモ 300 字・面接所見 1,500 字）: 紙プレビューに .cl-compact・本文は上限（950px）以内・結果は上部: ' + JSON.stringify(Object.assign({}, hv39, { order: undefined })));
  const nm39 = await page.evaluate(() => {
    const sh = document.querySelector('#appPaper .cl-sheet'), q = sh.querySelector('.cl-nm-q .cl-nm-v'), iv = sh.querySelector('.cl-nm-iv .cl-nm-v'), ref = sh.querySelector('.cl-nm-ref');
    const cq = getComputedStyle(q), ci = getComputedStyle(iv);
    // 名前の行数（Range の行の上端を数える）
    const linesOf = (el) => { const r = document.createRange(); r.selectNodeContents(el); const tops = []; Array.from(r.getClientRects()).forEach(x => { if (!tops.some(t => Math.abs(t - x.top) < 4)) tops.push(x.top); }); return tops.length; };
    return { qClamp: cq.webkitLineClamp, qh: Math.round(q.getBoundingClientRect().height), qlh: parseFloat(cq.lineHeight),
      ivClamp: ci.webkitLineClamp, ivh: Math.round(iv.getBoundingClientRect().height), ivlh: parseFloat(ci.lineHeight), sheetH: Math.round(sh.getBoundingClientRect().height),
      ref: ref && ref.getClientRects().length ? ref.textContent : '', cut: sh.classList.contains('cl-nm-cut'),
      keys: Array.from(sh.querySelectorAll('.cl-nm-q .cl-nm-k')).map(k => ({ t: k.textContent, lines: linesOf(k) })) };
  });
  expect(String(nm39.qClamp) === '2' && nm39.qh > nm39.qlh * 1.5 && nm39.qh <= nm39.qlh * 2.5,
    'E8 .cl-compact でも質問の回答は 2 行のまま（超えた分は面接所見から先に削る）: ' + JSON.stringify({ qClamp: nm39.qClamp, qh: nm39.qh, qlh: nm39.qlh }));
  expect(String(nm39.ivClamp) === '10' && nm39.ivh <= nm39.ivlh * 10.5 && nm39.ivh / nm39.sheetH < 0.2,
    'E8 面接所見は 10 行まで（残りの高さまで広げない。紙の 2 割未満）: ' + JSON.stringify({ ivClamp: nm39.ivClamp, ivh: nm39.ivh, ivlh: nm39.ivlh, sheetH: nm39.sheetH }));
  expect(nm39.keys.length === 5 && nm39.keys.every(k => k.lines === 1 && k.t.length <= 22) && nm39.keys[1].t === '②前のバイトの期間・退職理由 ほか2問' && nm39.keys[4].t === '⑤気になる点（逆質問）',
    'E8 質問の回答の名前は 1 行（1 問目の短い名前＋「ほか n 問」）: ' + JSON.stringify(nm39.keys));
  expect(nm39.cut && nm39.ref.includes('「…」で切れたメモの全文は、保存 HTML の「詳細」表示にあります'), 'E8 「…」で切れたメモがあれば全文の場所の案内 1 行: ' + JSON.stringify({ cut: nm39.cut, ref: nm39.ref }));
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
  expect(hp39.includes('cl-compact') && (n39a === -1 || n39a === 1), 'E8 重いサンプルのアプリの A4 印刷は 1 ページ（.cl-compact）: ' + JSON.stringify({ pages: n39a, cls: hp39 }));
  const saved39 = await saveRecord('script-report-heavy.html');
  const rp39b = await newReportPage(rp39Err);
  await rp39b.goto('file://' + saved39.file);
  await rp39b.waitForTimeout(300);
  const rh39 = await rp39b.evaluate(() => document.querySelector('#clPaper .cl-sheet').className);
  const pdf39 = path.join(OUT, 'script-report-heavy.pdf');
  await rp39b.pdf({ path: pdf39, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await rp39b.waitForTimeout(100);
  const n39 = pdfPagesOf(pdf39);
  const t39 = pdfTextOf(pdf39);
  console.log('script-report-heavy.pdf pages:', n39);
  expect(rh39.includes('cl-compact') && (n39 === -1 || n39 === 1) && (t39 === null || ['採用推奨', '台本四郎', '最終合否', '笹川晴央', '面接所見', '「…」で切れたメモの全文は'].every(t => t39.includes(t))),
    'E8 重いサンプルの保存 HTML: 紙プレビューに .cl-compact・報告書表示のまま印刷して A4 1 ページ（結果・氏名・最終合否・笹川晴央・「…」の案内）: ' + JSON.stringify({ pages: n39, cls: rh39 }));
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

  // 4. 保存 HTML の 1 ページ保証の境界（記録を直接作って保存 HTML を開き、報告書表示のまま印刷）
  //   面接所見 4,000 字（.cl-compact のまま所見が切れる → 案内 1 行）・押印欄 4 件（押印の節が 2 段）・確認点を 65 件追加（縮小。縮小後の高さを測り直す）
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
    const m = await rp.evaluate(() => {
      window.__prepareChecklistSheet(true);
      const sh = document.querySelector('#clSheet .cl-sheet');
      const out = { cls: sh.className.replace('cl-sheet cl-mode-sheet', '').trim(), zoom: sh.style.zoom, h: Math.round(sh.getBoundingClientRect().height), boxes: document.querySelectorAll('section[data-sec="mgmt"] .stamp-box').length };
      window.__prepareChecklistSheet(false);
      return out;
    });
    const pdf = path.join(OUT, 'script-report-fit-' + c.key + '.pdf');
    await rp.pdf({ path: pdf, format: 'A4', preferCSSPageSize: true, printBackground: true });
    const t = pdfTextOf(pdf);
    fit39.push(Object.assign({ key: c.key, pages: pdfPagesOf(pdf), ref: t === null ? null : t.includes('「…」で切れたメモの全文は、保存HTMLの「詳細」表示にあります'), name: t === null ? null : t.includes('台本五郎') }, m));
    await rp.close();
  }
  const fit39k = (k) => fit39.find(x => x.key === k);
  expect(fit39.every(x => x.pages === -1 || x.pages === 1) && fit39.every(x => x.name !== false), 'E8 保存 HTML の A4 印刷は境界の記録でも 1 ページ（面接所見 4,000 字・押印欄 4 件・確認点 +65 件）: ' + JSON.stringify(fit39));
  expect(/\bcl-compact\b/.test(fit39k('iv4000').cls) && !fit39k('iv4000').cls.includes('cl-compact-2') && fit39k('iv4000').ref !== false,
    'E8 面接所見 4,000 字: .cl-compact で所見が切れても「…」の案内 1 行（全文は「詳細」）: ' + JSON.stringify(fit39k('iv4000')));
  expect(fit39k('stamps4').boxes === 4 && fit39k('stamps4').h <= 890, 'E8 押印欄 4 件: 押印の節 2 段の分を除いた上限（890px）で詰める: ' + JSON.stringify(fit39k('stamps4')));
  const z39 = fit39k('zoom');
  expect(z39.cls.includes('cl-compact-2') && parseFloat(z39.zoom) > 0 && parseFloat(z39.zoom) < 1 && z39.h <= 950, 'E8 確認点 +65 件: 縮小後の高さを測り直して上限（950px）以内: ' + JSON.stringify(z39));
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
  // 印刷用（#clSheet）の押印行も 2 つ・2 列
  const cs9 = await st(() => { window.RecruitApp.prepareChecklistSheet(true); const r = document.querySelector('#clSheet .cl-stamps .stamp-row');
    const out = { ids: Array.from(document.querySelectorAll('#clSheet .cl-stamps .stamp-box')).map(b => b.dataset.fieldId), cols: !!r && r.classList.contains('cols-2'), grid: r ? getComputedStyle(r).gridTemplateColumns.split(' ').length : 0,
      hanko: document.querySelectorAll('#clSheet .cl-stamps svg.hanko').length, txt: document.getElementById('clSheet').textContent.includes('初期対応者') };
    window.RecruitApp.prepareChecklistSheet(false); return out; });
  expect(JSON.stringify(cs9.ids) === JSON.stringify(['interviewer', 'final']) && cs9.cols && cs9.grid === 2 && cs9.hanko === 2 && !cs9.txt, 'E9 A4 印刷用の押印行（.cl-stamps）も 2 つ・2 列・印 2 つ: ' + JSON.stringify(cs9));
  // 保存 HTML の #mgmt
  const saved9 = await saveRecord('stamps-2.html');
  expect(saved9.html.includes('<div class="stamp-row cols-2" id="mgmt">') && !saved9.html.includes('初期対応者') && !saved9.html.includes('data-field-id="initial"') &&
    JSON.stringify(Object.keys(saved9.rec.management)) === JSON.stringify(['final', 'interviewer']) && saved9.html.endsWith('</html>\n'),
    'E9 保存 HTML の押印欄は 2 つ（#mgmt.stamp-row.cols-2・初期対応者なし）: ' + Object.keys(saved9.rec.management).join(','));
  const rp9Err = [];
  const rp9 = await newReportPage(rp9Err);
  await rp9.goto('file://' + saved9.file);
  await rp9.waitForTimeout(300);
  const g9 = async () => rp9.evaluate(() => { const r = document.getElementById('mgmt'); return { n: r.querySelectorAll('.stamp-box').length, cols: getComputedStyle(r).gridTemplateColumns.split(' ').length, ov: document.documentElement.scrollWidth - window.innerWidth }; });
  const g9a = await g9();
  await rp9.setViewportSize({ width: 390, height: 900 });
  await rp9.waitForTimeout(200);
  const g9b = await g9();
  expect(g9a.n === 2 && g9a.cols === 2 && g9b.cols === 1 && g9b.ov <= 1, 'E9 保存 HTML の押印欄は 2 列（390px では 1 列・横スクロールなし）: ' + JSON.stringify({ g9a, g9b }));
  await rp9.setViewportSize({ width: 1440, height: 1000 });
  // 保存 HTML 上の押印・最終合否
  await rp9.selectOption('#decision select', { label: SASA });
  await rp9.click('#decision [data-act="decide"][data-value="reject"]');
  await rp9.waitForTimeout(150);
  expect(rp9Err.length === 0 && !!(await rp9.$('#mgmt .stamp-box[data-field-id="final"] svg.hanko')) && (await rp9.evaluate(() => document.body.getAttribute('data-filename'))).endsWith('_不採用.html'),
    'E9 保存 HTML で最終合否を変えられる（押印欄 2 つのまま・エラーなし）: ' + (rp9Err.join(' / ') || 'ok'));
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
    /^evaluation\.thresholds\.(recommendPct|reviewPct)$/, /^checklist\.header\.interviewerField$/, /^checklist\.header\.posting\.label$/, /^checklist\.header\.posting\.options\[\d+\]\.label$/, /^checklist\.print\.showQuestions$/,
    /^checklist\.pages\[\d+\]\.(title|lead)$/, /^checklist\.sections\[\d+\]\.(title|minutes|minutesMax|page|lead)$/, /^checklist\.sections\[\d+\]\.blocks\[\d+\]\.(title|note|memo|memoLabel)$/,
    /^checklist\.sections\[\d+\]\.blocks\[\d+\]\.items\[\d+\]\.(label|hint|shortOnly|short|kind|options)$/,
    /^management\.fields\[\d+\]\.(label|hint)$/, /^management\.(managers|allowFreeName)$/, /^management\.decision\.(enabled|label|hireLabel|rejectLabel|hint|stampField|autoStampFinal|filenameSuffix)$/
  ];
  const badBind10 = set10.binds.filter(b => !ALLOW.some(re => re.test(b)));
  const dup10 = set10.binds.filter((b, i) => set10.binds.indexOf(b) !== i);
  expect(set10.binds.length > 50 && !badBind10.length && !dup10.length, 'E10 data-bind は許可リストだけ・重複なし（' + set10.binds.length + ' 件）: ' + JSON.stringify({ bad: badBind10, dup: dup10 }));
  const words10 = ['詳細モード', '2軸', '2 軸', '貢献度', '留意点', '初期対応者', '運用モード', '申し送り', '自動表示', 'Step3', 'Step4', '応募情報から', '旧形式'].filter(w => set10.txt.includes(w));
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
  const ui11 = await rp11.evaluate(() => ({ btns: Array.from(document.querySelectorAll('.rtool button[id^="rtPrint"]')).map(b => b.id + ':' + b.textContent),
    gone: ['.dash', '#rtPrintSheet', '#rtPrintAll'].filter(s => !!document.querySelector(s)), handoff: typeof window.__prepareHandoffSheet, cl: typeof window.__prepareChecklistSheet,
    hint: (document.querySelector('.rtool-hint') || {}).textContent || '' }));
  expect(JSON.stringify(ui11.btns) === JSON.stringify(['rtPrintChecklist:A4 で印刷（1 ページ）']) && !ui11.gone.length && ui11.handoff === 'undefined' && ui11.cl === 'function' && !ui11.hint.includes('レポート全体'),
    'E11 保存 HTML の印刷は「A4 で印刷（1 ページ）」だけ（.dash・#rtPrintSheet・#rtPrintAll・__prepareHandoffSheet なし）: ' + JSON.stringify(ui11));
  // 報告書表示の Ctrl+P（beforeprint）→ A4 報告
  const bp11 = async () => rp11.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); const on = document.body.classList.contains('print-checklist'); window.dispatchEvent(new Event('afterprint')); return { on, after: document.body.classList.contains('print-checklist') }; });
  const bp11a = await bp11();
  expect(bp11a.on && !bp11a.after, 'E11 報告書表示のままブラウザで印刷すると A4 報告（print-checklist）・印刷後に外す: ' + JSON.stringify(bp11a));
  const pdf11a = path.join(OUT, 'report-a4-1page.pdf');
  await rp11.pdf({ path: pdf11a, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await rp11.waitForTimeout(100);
  const n11a = pdfPagesOf(pdf11a);
  const t11a = pdfTextOf(pdf11a);
  expect((n11a === -1 || n11a === 1) && (t11a === null || (['面接チェックリスト報告', '押印二郎', '面接対応者', '最終確認'].every(t => t11a.includes(t)) && !t11a.includes('初期対応者'))),
    'E11 報告書表示の印刷は A4 1 ページ（押印 2 欄・初期対応者なし）: ' + n11a);
  // 詳細表示の Ctrl+P はブラウザの既定（A4 報告にしない）
  await rp11.click('#rtViewFull');
  await rp11.waitForTimeout(150);
  const bp11b = await bp11();
  expect(!bp11b.on, 'E11 詳細表示でブラウザの印刷をしても A4 報告にしない（全文を印刷）');
  const pdf11b = path.join(OUT, 'report-full-view.pdf');
  await rp11.pdf({ path: pdf11b, format: 'A4', preferCSSPageSize: true, printBackground: true });
  const t11b = pdfTextOf(pdf11b);
  expect(t11b === null || (t11b.includes('応募者情報') && t11b.includes('採用可否判定') && t11b.includes('歌舞伎町ですので')), 'E11 詳細表示の印刷は全文（応募者情報・台本の全文・採用可否判定）: ' + (t11b === null ? 'pdftotext なし（省略）' : 'ok'));
  // 「A4 で印刷（1 ページ）」ボタン（window.print はスタブ）
  await rp11.evaluate(() => { window.__p = []; window.print = function () { window.__p.push(document.body.classList.contains('print-checklist')); }; });
  await rp11.click('#rtPrintChecklist');
  await rp11.waitForTimeout(100);
  expect(JSON.stringify(await rp11.evaluate(() => window.__p)) === '[true]', 'E11 「A4 で印刷（1 ページ）」は詳細表示からでも A4 報告を印刷');
  await rp11.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(rp11Err.length === 0, 'E11 保存 HTML のページエラーなし: ' + (rp11Err.join(' / ') || 'none'));
  await rp11.close();
  // アプリ ③ の「A4 で印刷」も 1 ページ（押印 2 欄）
  await page.setInputFiles('#fileInput', saved9.file);
  await wait(500);
  expect(await step() === 4, 'E11 保存した記録を ③ で開く');
  await st(() => window.RecruitApp.prepareChecklistSheet(true));
  const a11 = await st(() => document.querySelectorAll('#clSheet .cl-stamps .stamp-box').length);
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
  const rbox12 = (id) => '#mgmt .stamp-box[data-field-id="' + id + '"]';
  await rp12.click(rbox12('interviewer') + ' [data-act="unstamp"]');
  await rp12.waitForTimeout(150);
  expect(!(await rp12.$(rbox12('interviewer') + ' svg.hanko')) && await rp12.$eval('#mgmtSave', el => el.classList.contains('show')), 'E12 保存 HTML 上で押印を取り消せる（保存バーが出る）');
  await rp12.selectOption(rbox12('interviewer') + ' select', '__free');
  await rp12.fill(rbox12('interviewer') + ' input', '佐藤 次郎');
  await rp12.click(rbox12('interviewer') + ' [data-act="stamp"]');
  await rp12.waitForTimeout(150);
  expect(!!(await rp12.$(rbox12('interviewer') + ' svg.hanko')) && (await txtIn(rp12, rbox12('interviewer') + ' .stamp-meta')).includes('佐藤 次郎'), 'E12 保存 HTML 上で手入力の担当者で押印');
  await rp12.click('#decision [data-act="undecide"]');
  await rp12.waitForTimeout(150);
  const fn12 = await rp12.evaluate(() => document.body.getAttribute('data-filename'));
  expect(await rp12.$eval('#decision', el => el.classList.contains('is-none')) && !(await rp12.$('#clPaper .cl-decision svg.verdict-stamp')) && fn12 === '応募者_台本_花子_2026-10-10.html',
    'E12 保存 HTML 上で合否を取り消すと紙の合否スタンプとファイル名の _不採用 が外れる: ' + fn12);
  const [dl12] = await Promise.all([rp12.waitForEvent('download'), rp12.click('#mgmtSaveBtn')]);
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
  expect(!(await rp12c.$('#decision')) && !(await rp12c.$('[data-act="decide"]')) && !!(await rp12c.$('#mgmt')) && rp12Err.length === 0,
    'E12 最終合否 OFF で保存した HTML に合否パネルが無い（押印欄はある・エラーなし）: ' + (rp12Err.join(' / ') || 'ok'));
  await rp12c.close();
  await rp12.close();
  await toView('settings');
  await page.click('label:has([data-bind="management.decision.enabled"])');
  await wait(100);
  await saveSettings();
  await toView('judge');
  expect(!!(await page.$('#decisionCard svg.verdict-stamp')) && (await txtIn(page, '#sumDecision')).includes('不採用・鈴木'), 'E12 ON に戻すと ③ のカード（記録した合否）が戻る');
  await fresh();

  expect(errors.length === 0, 'ERRORS: ' + (errors.length ? JSON.stringify(errors) : 'none'));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  console.log('\n' + (fails.length ? fails.length + ' FAILED:\n - ' + fails.join('\n - ') : 'ALL PASSED'));
  if (fails.length) process.exit(1);
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
