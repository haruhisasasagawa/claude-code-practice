/*
 * 配布ファイル（dist/toho-recruit-judge.html）のブラウザ通しテスト。
 *   node build.js && node tests/e2e.js
 * Playwright と Chromium が必要（npx playwright install chromium）。
 * スクリーンショットは tests/shots/ に出力（git 管理外）。
 */
const { chromium } = (function(){ try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots');
const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'toho-recruit-judge.html');

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

  await page.goto(FILE);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '01-step1-empty.png'), fullPage: false });

  // ---- Step1 入力 ----
  await page.fill('[data-field="name"]', '佐藤 花子');
  await page.selectOption('[data-field="gender"]', '女性');
  await page.fill('[data-field="age"]', '21');
  await page.selectOption('[data-field="category"]', '大学3年生');
  await page.fill('[data-field="graduationDate"]', '2027-03');
  await page.selectOption('[data-field="commuteMethod"]', '公共交通機関');
  await page.fill('[data-field="commuteMinutes"]', '40');
  await page.fill('[data-field="nearestStation"]', '高田馬場');
  const pick = async (sel) => { await page.click('label:has(' + sel + ')'); };
  for (const d of ['mon', 'wed', 'fri', 'sat']) await pick('input[data-field="workDays"][value="' + d + '"]');
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
  await pick('input[data-field="sideJob"][value="yes"]');
  await page.fill('[data-field="sideJobDetail"]', 'カフェ 週1日');
  await pick('input[data-field="vacation.summer"][value="ok"]');
  await pick('input[data-field="vacation.obon"][value="consult"]');
  await pick('input[data-field="vacation.yearend"][value="ok"]');
  await pick('input[data-field="vacation.gw"][value="ok"]');
  await pick('input[data-field="lateNight.availability"][value="ok"]');
  await page.selectOption('[data-field="lateNight.returnMethod"]', 'taxi');
  await page.fill('[data-field="lateNight.taxiFare"]', '3800');
  await pick('input[data-field="foreign.isForeign"][value="yes"]');
  await page.selectOption('[data-field="foreign.residenceStatus"]', '留学');
  await page.selectOption('[data-field="foreign.workPermit"]', 'unknown');
  await page.fill('[data-field="foreign.residenceExpiry"]', '2027-01');
  await page.selectOption('[data-field="foreign.japaneseLevel"]', '日常会話（N2相当）');
  await page.fill('[data-field="reviewerNotes"]', '電話応対が丁寧。');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '02-step1-filled.png'), fullPage: true });

  const st1 = await page.evaluate(() => JSON.stringify(window.RecruitApp.state.applicant));
  fs.writeFileSync(path.join(OUT, 'applicant.json'), st1);

  // ---- Step2 ----
  await page.click('[data-action="generate-handoff"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '03-step2-handoff.png'), fullPage: true });
  const handoff = await page.evaluate(() => JSON.stringify(window.RecruitApp.state.handoff.items.map(i => i.severity + ':' + i.id + ':' + i.text), null, 1));
  console.log('HANDOFF ITEMS:\n' + handoff);
  const strengths = await page.evaluate(() => JSON.stringify(window.RecruitApp.state.handoff.strengths.map(s => s.text)));
  console.log('STRENGTHS: ' + strengths);
  // check a few items
  const checks = await page.$$('input[data-check]');
  for (let i = 0; i < Math.min(3, checks.length); i++) await checks[i].click({ force: true });
  await page.fill('textarea[data-note="handoff"]', '土曜は月2回程度なら可能とのこと。');
  await page.click('[data-action="copy-handoff"]');
  await page.waitForTimeout(200);

  // ---- Step3 ----
  await page.click('[data-action="to-step"][data-step="3"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '04-step3-empty.png'), fullPage: false });
  // try judge with missing scores -> should block
  await page.click('[data-action="judge"]');
  await page.waitForTimeout(200);
  const stepAfter = await page.evaluate(() => window.RecruitApp.state.step);
  console.log('step after judge with missing scores (expect 3):', stepAfter);
  const scores = { greeting: 5, first_impression: 4, communication: 4, eye_contact: 3, appearance: 5, explanation: 3, motivation: 4, self_analysis: 3, service_mindset: 4, overall_judgment: 4 };
  for (const [k, v] of Object.entries(scores)) await page.click(`[data-action="score"][data-item="${k}"][data-value="${v}"]`);
  await page.fill('textarea[data-note="interview"]', '笑顔が良く、受け答えも明瞭。');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '05-step3-scored.png'), fullPage: true });

  // ---- Step4 ----
  await page.click('[data-action="judge"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '06-step4-result.png'), fullPage: true });
  const judgment = await page.evaluate(() => { const j = window.RecruitApp.state.judgment; return JSON.stringify({ result: j.result, total: j.total, max: j.max, pct: j.pct, adjusted: j.adjusted, warnings: j.warnings, thresholds: j.thresholds }, null, 1); });
  console.log('JUDGMENT: ' + judgment);

  // ---- Save (download) ----
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const savedPath = path.join(OUT, 'saved.html');
  await download.saveAs(savedPath);
  console.log('saved download:', download.suggestedFilename(), fs.statSync(savedPath).size, 'bytes');

  // ---- New, then load the saved file ----
  await page.click('#btnNew');
  await page.waitForTimeout(200);
  const nameAfterNew = await page.evaluate(() => window.RecruitApp.state.applicant.name);
  console.log('name after new (expect empty):', JSON.stringify(nameAfterNew));
  await page.setInputFiles('#fileInput', savedPath);
  await page.waitForTimeout(500);
  const loaded = await page.evaluate(() => { const s = window.RecruitApp.state; return JSON.stringify({ name: s.applicant.name, step: s.step, scores: Object.keys(s.scores).length, checks: Object.keys(s.handoffChecks).length, note: s.handoffNote, result: s.judgment && s.judgment.result }); });
  console.log('LOADED: ' + loaded);
  await page.screenshot({ path: path.join(OUT, '07-loaded.png'), fullPage: false });

  // ---- Settings ----
  await page.click('.nav-item[data-view="settings"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '08-settings.png'), fullPage: false });
  // change theater name and save
  await page.fill('[data-bind="meta.theaterName"]', 'TOHOシネマズ テスト');
  await page.click("#view-settings [data-action=\"save\"]");
  await page.waitForTimeout(200);
  const brand = await page.textContent('#brandTheater');
  console.log('brand after save:', brand);
  const ls = await page.evaluate(() => !!localStorage.getItem('recruit.profile.v1'));
  console.log('profile persisted:', ls);
  // add eval item, then save
  await page.click('[data-action="item-add"]');
  await page.waitForTimeout(100);
  const itemCount = await page.evaluate(() => document.querySelectorAll('.item-row').length);
  console.log('eval item count after add (expect 11):', itemCount);
  // export json
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  console.log('profile export:', dl2.suggestedFilename());
  // reset
  await page.click('[data-action="reset"]');
  await page.waitForTimeout(300);
  console.log('brand after reset:', await page.textContent('#brandTheater'));

  // ---- Help + dark mode ----
  await page.click('.nav-item[data-view="help"]');
  await page.waitForTimeout(200);
  await page.click('#btnTheme');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '09-help-dark.png'), fullPage: false });
  await page.click('.nav-item[data-view="judge"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '10-judge-dark.png'), fullPage: false });

  // narrow viewport
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '11-narrow.png'), fullPage: false });

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
