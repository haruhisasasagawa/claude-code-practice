/*
 * 配布ファイル（dist/toho-recruit-judge.html）のブラウザ通しテスト。
 *   node build.js && node tests/e2e.js
 * Playwright と Chromium が必要（npx playwright install chromium）。
 * スクリーンショットは tests/shots/ に出力（git 管理外）。
 * 失敗した確認（FAIL）が 1 つでもあれば exit 1。
 *
 * シナリオ（docs/SPEC-script-mode.md 7-3・docs/SPEC-slim.md 5-2・docs/SPEC-a4.md 7 章。2026-10-14 の面接特化で E1〜E39 → E1〜E11 に振り直し、E12〜E14 を追加）
 *   E1  4 ステップ・準備（詳細モードの保存済み設定は 4 ステップで開く・詳細項目なし・はじめての方へ・390px）
 *   E2  面接（①〜⑤ を 1 段階ずつ・応募者の 1 行・説明した）→ 評価（段階のカード・人物像・総合判断・面接所見・面接時間）→ 報告書（A4 の紙・見出し・押印行・判定サマリー・必須条件・総合判断・押印 2 欄）
 *   E3  押印 → 保存 → 保存 HTML（A4 縦の用紙 1 枚・用紙の「最終合否」をクリックして窓で採用・右下の保存バーで再出力・そのまま印刷で 1 枚）→ アプリで読込 → 再保存 → 開く
 *   E4  旧レコードの読み込み（詳細モードの記録・初期対応者の押印入り・v1）
 *   E5  ダークモードの紙（白地・ハンコの明るさ補正なし）・390px
 *   E6  報告書を開かずに評価から保存・印刷しても判定が入る・評価で保存した記録は評価から・面接で保存した記録は面接の同じ段階から再開・印刷の経路（🖨・beforeprint）・総合判断未入力の保存
 *   E7  旧レコード（消極属性入り）の読み込み
 *   E8  A4 報告（1 ページの要約）: 紙に質問文なし・結果が上部・1280/1440px で横スクロールなし・重いサンプル（質問ごとのメモ 13 個）でも 1 ページ（.cl-compact。押印行込みで 1052px 以内）・
 *       面接メモは質問ごとの行・面接時間の行・PDF の本文
 *   E9  押印欄 2 つ（初期対応者なし）: アプリ・紙・印刷用・保存 HTML の用紙（390px でも 2 列のまま用紙ごと縮小）・右サマリー・設定・旧い 3 欄の設定
 *   E10 設定画面（5 節・data-bind の許可リスト・保存／破棄／初期化・書き出し・v1／詳細モードの JSON の読み込み）・使い方
 *   E11 保存 HTML の印刷（印刷のための切替なし・ボタンなし・そのまま A4 1 枚・台本の全文なし）・アプリの A4 印刷（押印 2 欄・1 ページ）
 *   E12 設定の反映（必須条件の不一致を上長最終判断要に・台本の文言と確認点の増減・満点・空の文言・既定に戻す・壊れた台本）・読み込みの toast（確認点の差・他劇場）・
 *       手入力の押印と最終合否・保存 HTML の用紙の窓での取消・手入力・未選択のエラー・最終合否の ON/OFF（旧 E22・E26・E28・E31 のうち残した機能）
 *   E13 ロゴ（brand.js）と、ロゴ・名簿入りの版（node build.js --local）: サイドバー・報告書の紙・保存 HTML の用紙の見出し
 *   E14 A4 用紙（docs/SPEC-a4.md 7-3）: 寸法 210×297mm・画面と印刷が同じ様式（スクリーンショットと PDF の画像）・欄クリックの窓（Esc・外のクリック・印刷に出ない・書き出しに残らない）・
 *       長いメモの全文・390px の縮小表示・アプリの印刷と保存 HTML の印刷が同じ見出しの 1 ページ
 *   E15 最終承認のパスワード（docs/SPEC-a4.md 11 章）: 公開版はロックなし・ローカル版（tests/fixtures/local-sample の架空のパスワード）で 報告書の最終確認・最終合否・保存 HTML の窓・
 *       設定の変更／外す（現在のパスワード）・変えた後の保存 HTML・JSON の読み込み・初期化。dist にパスワード・ハッシュが無いこと。
 *       ロックの迂回を塞ぐ（「押印欄と連動」・最終合否の ON/OFF・押印欄の構成を変える保存／JSON は現在のパスワード。「連動しない」でも最終確認欄はロックのまま）
 *   E16 用紙を埋めるレイアウト（docs/SPEC-a4.md 12 章）: 押印行は用紙の内寸の下端（上限近くのゆったりを狭い画面で開いても）・面接メモ・所見の枠（記入なしでも）・ゆったり（.cl-roomy）の付け外し・重いサンプルも 1 ページ・
 *       切れたメモを罫線の空きまで広げる（重いサンプル・面接所見 4,000 字。狭い画面・書き出して開き直しても同じ行数）・
 *       スクリーンショット a4-form.png・a4-form-heavy.png・a4-form-print.png・a4-form-heavy-print.png
 *   E17 人物像（1〜5 点）・面接記入シート（手書き用）（docs/SPEC-persona.md 7-2）: 評価の人物像のカード（クリック・数字キー・合計・1 点の警告・前書きの 1 行）・
 *       判定（1 点・40% 未満・全部 3・全部 4・未入力）・A4（5 タイル・確認点｜人物像・1 ページ）・右サマリー・記入シートの印刷（PDF 1 ページ・面接日を空にすると線・本物の window.print の経路・
 *       afterprint が来ないときの 3 秒の片付け）・設定・旧い記録（準備だけ保存した導入前の記録は人物像を使う）・使い方。
 *       スクリーンショット p12-step2-persona.png（評価の人物像のカード）・p12-report.png・p12-report-print.png・p12-paper-sheet.png・p12-paper-sheet-filled.png
 *   2026-10-16 から既定の確認点は 6 項目（面接評価 14 点満点。rt_manner を人物像と重なるため外した）。rateAll・mk39 は人物像を 4 点で埋める（未入力だと上長最終判断要になるため）
 *   必須条件の不一致の案内（⑤ 逆質問へ・省略可。旧 E26）は E2・E18 で確かめる
 *   E18 面接の流れ（docs/SPEC-flow.md 9-4。2026-10-16「実際の面接を想定したかたちに」）: 準備 → 面接（1 段階ずつ・タイマー）→ 評価 → 報告書の通し（画面の操作だけ）・段階のチップとタイマー（page.clock）・
 *       必須条件の不一致の案内・説明した（段階に 1 つ）・質問ごとのメモ・評価の画面・はじめての方へ・旧レコード・記入シートの新しい並び・画面の大きさ・ダーク・Ctrl+Enter。
 *       スクリーンショット p13-prep.png・p13-interview-1.png・p13-interview-2.png・p13-interview-must-ng.png・p13-evaluate.png・p13-report.png・p13-paper.png・p13-interview-390.png
 *   E19 初見の操作の補完（docs/SPEC-flow.md 15 章。2026-10-17）: 下見してからの「面接を始める」（タイマーは 0 から・① から）・評価／報告書まで進んだ記録の準備の主ボタン・評価から面接に戻ったときのタイマー（再開・endedAt の上書き）・
 *       面接時間を確かめる（紙からの転記・スリープ）・4 つの画面の主ボタンの位置・① の縦一列の順・必須条件の案内が出たままの ⑤・操作行の Tab の順（段階の見出しから 話す → 聞く → 確かめる → 主ボタン）・狭い画面のタイマーと案内・報告書の 1 行・トップバーの「🖨 報告書を印刷」
 *   E20 画面の統一（docs/SPEC-flow.md 16 章・docs/DESIGN.md v2。2026-10-18）: どの段階も 話す → 聞く → 確かめる・帯は同じ色・［説明した］［伝えた］は 3 つの状態とも操作列と同じ端・
 *       面接と評価の［一致｜不一致］は同じ x・上の帯は 1 段（1366×768・1280×720）・「該当の行へ」・設定の［設定を保存］も主ボタンと同じ座標
 *   E21 レビュー修正 A（docs/SPEC-flow.md 16-7。2026-10-19）: メモ欄・文字の欄に書いた直後の 1 回目のクリック（説明した・伝えた・下にあと n 項目・面接時間の欄へ・未入力の数）・
 *       必須条件を確かめないまま［次へ］（1 回目は未確認の行へ）・⑤ の合否連絡の順番の 1 行・評価の未入力の数のボタンと戻り先・390px の操作行・841〜960px のチップ・481〜840px の「該当の行へ」。
 *       E1 の準備の高さは「1 画面に収まる」（操作行が固定なので常に真だった）から「隠れている欄があれば ▼ 下にあと n 項目・押すと最後まで出る」に書き換えた
 *   E22 レビュー修正 B（docs/SPEC-flow.md 16-8。2026-10-19）: ○△× の和文のフォント（全画面）・面接所見の欄の枠と最後の警告の箱の余白・帯のアイコンと題が同じ行（390・360px・長いアプリ名）・
 *       右サマリーの押印の ✓（SVG）・評価の「していない」の ⚠・設定の呼び方・勤務条件の確認の注記・話す → 聞く → 確かめる・記入シートの並びの案内。
 *       保存 HTML の最終合否の窓の色（アプリのセグメントと同じ・インクの色にしない）・文字・フォーカスの輪は E9 に足した
 *   E23 レビュー修正 C（docs/SPEC-flow.md 16-9。2026-10-19）: SVG のアイコン（全画面の <use> の参照先・描かれるか・スプライトのアイコンはどれも使う・主なボタンのアイコン）・
 *       390px の行（操作はラベルの下で全幅・トグルは帯の幅）・記入欄の見本・サイドバーの手順の Enter／Space・⑤ の必須条件の案内の文・全画面のコントラストと文字の段階（ライト／ダーク・1440／390px）。
 *       ボタンなどのラベルは見える文字とアイコン（__lbl。「[arrow-left] 準備に戻る」）で比べ、見えない .sym の記号では確かめない（E1・E2・E6・E17〜E19・E21 を書き換えた）。
 *       E19 (5) に段階の見出しからの Tab の順（話すことのトグル）、E18 (13) に目安の太さ 400、E20 (1) に 説明 → 合否連絡 の 2 枚の話すこと、E20 (4) にタイマーの位置と帯の高さを足した
 *   E24 レビュー修正 D（docs/SPEC-flow.md 16-10。2026-10-19 の最終確認の抜け）: アプリの用紙（報告書の紙・印刷ホスト）と保存 HTML の用紙の計算されたスタイルが同じ（ライト／ダーク）・
 *       用紙の最終合否の文字は意味の色（スタンプの絵だけインク）・トーストの幅と位置（390・841・1366・1440px）・評価の結果カードの 390／360px の折り返し・［次へ］の文字と氏名の「さん」・
 *       準備の選択の文字（1181〜1440px）・省略できる段階の「していない」は中立・打ち切りのときの人物像の札・設定の単位とコロンとチェックの文・最終合否の［取消］の位置・
 *       キーボードで［次へ］を 2 回／押しっぱなし（確かめていない必須条件を一致にしない）。保存 HTML の窓の部品の枠とホバーは E9 に足した
 *   2026-10-18 の画面の見直し（縦一列の 3 枚のカード・本文の枠の操作行・見出し帯つきのカード）で E1・E2・E8・E10・E12・E14・E17〜E19 の確かめ方を書き換えた
 *   （docs/SPEC-flow.md 16-6 の対応表。決定で変えた性質〔1 画面に収まる → 最後まで届く・【質問】の記入欄は 1 問目の上 → 確かめることに Q1 のタグ・右サマリーは紙の横 → 下・目安の太字 → 400〕は
 *   対応表に書いた。書き換えで確かめなくなっていた性質〔話すことのトグルに Tab で届く・目安の太さ・上の帯のタイマーの位置〕は 2026-10-19 のレビュー修正 C で足した）
 *   2026-10-16 の面接の流れで画面は 準備（step 1）→ 面接（2）→ 評価（3）→ 報告書（4）の 4 ステップになった。ヘルパ（setCl・setPs・rateAll・judge）は押すボタンが今の画面に無ければ
 *   その画面へ移ってから押す（docs/SPEC-flow.md 9-2）。E1・E2・E4〜E8・E10・E12・E17 は新しい画面に合わせて書き直した（落とした性質は無い。9-3 の対応表）
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
  // ボタンなどのラベル（見える文字とアイコン。docs/DESIGN.md 2 章）: .sym（textContent の互換のために残す記号 ✓ ← → ▾ ▼ 🖨 など。見た目は消す・aria-hidden）を除いた文字と、
  //   SVG のアイコン（svg.ico の <use> の参照先 id。「i-」は外す）を DOM の順に「[id]」で並べる。参照先の <symbol> が無ければ「[id?]」。
  //   例「[arrow-left] 準備に戻る」「次へ：② 継続性・報連相 [arrow-right]」「[check] 説明した」「[printer] A4 で印刷」。
  //   見えない .sym の文字では確かめない（2026-10-19。それまでは textContent を比べていたので、アイコンを壊しても通った。docs/SPEC-flow.md 16-9）。
  //   window.__lbl(el) としてページに置く（BrowserContext の init script。別の BrowserContext では LBL_INIT を足す）
  const LBL_INIT = () => {
    window.__lbl = function (el) {
      if (!el) return '';
      let out = '';
      (function walk(n) {
        if (n.nodeType === 3) { out += n.nodeValue; return; }
        if (n.nodeType !== 1 || n.classList.contains('sym')) return;
        if (n.namespaceURI === 'http://www.w3.org/2000/svg') {
          if (!n.classList.contains('ico')) return;
          const u = n.querySelector('use'), id = u ? String(u.getAttribute('href') || '').replace(/^#i-/, '') : '', s = id ? document.getElementById('i-' + id) : null;
          out += ' [' + id + (s && s.tagName.toLowerCase() === 'symbol' ? '' : '?') + '] ';
          return;
        }
        n.childNodes.forEach(walk);
      })(el);
      return out.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, '');   // 半角の空白・改行だけを 1 つにまとめる（台本の全角の空白「　」はそのまま）
    };
  };
  await ctx.addInitScript(LBL_INIT);
  const lblOf = (sel, pg) => (pg || page).$eval(sel, el => window.__lbl(el));
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
  // ステップの移動（サイドバーの無効〔まだ進んでいないステップ〕を通らない。docs/SPEC-flow.md 9-2）・面接の段階のチップ
  const goTo = async (n) => { await st(n => window.RecruitApp.goStep(n), n); await wait(250); };
  const ivGo = async (sec) => { await page.click('#ivChips [data-action="iv-go"][data-sec="' + sec + '"]'); await wait(150); };
  // 面接の段階が見えるか（2026-10-18 から縦一列のカードなので、段階は 1 画面に収まるとは限らない。docs/DESIGN.md 4-3。E18・E19 で使う）:
  //   先頭で操作行に隠れている項目の数（hidden）とそのときの「▼ 下にあと n 項目」（more。ラベルは __lbl）・カードの種類の並び（kinds）・必須条件の案内（alert）、
  //   いちばん下までスクロールしたときの最後の要素の下端と操作行の上端の差（over）・隠れている項目（endHidden）・案内（endMore）・操作行の下端と画面の下端の差（footBottom）。
  //   数える要素 IV_ITEMS は src/app.js の IV_MORE_SEL（「▼ 下にあと n 項目」が数える要素）に #ivStage を付けたもの（数える対象を変えるときは両方を直す）
  const IV_ITEMS = '#ivStage .row, #ivStage .iv-say-i, #ivStage .iv-q, #ivStage .iv-oldmemo, #ivStage .iv-memo, #ivStage .iv-flow';
  const ivFit = (pg) => pg.evaluate(async (sel) => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const st = document.getElementById('ivStage'), ft = document.getElementById('ivFoot'), mb = document.getElementById('ivMore');
    const hiddenNow = () => { const t = ft.getBoundingClientRect().top; return Array.from(document.querySelectorAll(sel)).filter(e => e.offsetParent !== null && e.getBoundingClientRect().bottom > t + 2).length; };
    const moreNow = () => mb && !mb.classList.contains('hidden') ? window.__lbl(mb) : '';
    //   「▼ 下にあと n 項目」はスクロールのあとの描画のフレームで数え直す（1 フレームに 1 回）。案内の出し入れが落ち着くまで待つ（最大 30 回）
    const settle = async () => { for (let k = 0; k < 30; k++) { await frame(); if ((hiddenNow() > 0) === (!!mb && !mb.classList.contains('hidden'))) break; } };
    window.scrollTo(0, 0);
    await settle();
    const o = { sec: st.dataset.sec, hidden: hiddenNow(), more: moreNow(), kinds: Array.from(st.querySelectorAll(':scope > section.card')).map(c => c.dataset.kind).join('+'),
      alert: !document.getElementById('ivMustAlert').classList.contains('hidden') };
    window.scrollTo(0, document.documentElement.scrollHeight);
    await settle();
    const f = ft.getBoundingClientRect();
    Object.assign(o, { over: Math.round(st.lastElementChild.getBoundingClientRect().bottom - f.top), endHidden: hiddenNow(), endMore: moreNow(), footBottom: Math.round(innerHeight - f.bottom) });
    window.scrollTo(0, 0);
    await settle();
    return o;
  }, IV_ITEMS);
  //   見える: 最後の要素まで操作行の上に出せる・隠れている項目があるときだけ「▼ 下にあと n 項目」（n は隠れている数・アイコンは i-chevron-down）・いちばん下では出さない
  const ivSeen = (o) => o.over <= 0 && o.endHidden === 0 && !o.endMore && (o.hidden > 0 ? o.more === '[chevron-down] 下にあと ' + o.hidden + ' 項目' : o.more === '');
  //   今の「▼ 下にあと n 項目」（出ていなければ ''）と、今のスクロールで操作行に隠れている項目の数
  const ivMoreNow = () => page.evaluate(() => { const b = document.getElementById('ivMore'); return b && !b.classList.contains('hidden') ? window.__lbl(b) : ''; });
  const ivHiddenNow = () => page.evaluate((sel) => { const t = document.getElementById('ivFoot').getBoundingClientRect().top;
    return Array.from(document.querySelectorAll(sel)).filter(e => e.offsetParent !== null && e.getBoundingClientRect().bottom > t + 2).length; }, IV_ITEMS);
  const clWhere = (id) => st(id => { const x = window.RecruitRules.checklistItems(window.RecruitApp.state.profile.checklist).find(x => x.item.id === id); return x ? { type: x.block.type, sec: x.section.id } : null; }, id);
  // 面接チェックリスト（docs/SPEC-checklist.md 7-2）。既に同じ値なら押さない（再押下で解除されるため）。
  //   押すボタンが今の画面に無ければ出す（header.* → 準備・必須条件／確認点／総合判断 → 評価・記入欄 → 面接のその段階。docs/SPEC-flow.md 9-2）
  const setCl = async (path, v) => {
    const cur = await st(p => window.RecruitUtil.getPath(window.RecruitApp.state.checklist, p) || '', path);
    if (cur === v) return;
    const sel = `[data-action="cl-set"][data-cl="${path}"][data-value="${v}"]`;
    if (!(await page.$(sel))) {
      if (path.indexOf('header.') === 0) await goTo(1);
      else {
        const w = path === 'overall' ? { type: 'rating' } : await clWhere(path.replace(/^values\./, ''));
        if (!w || w.type === 'rating' || w.type === 'must') await goTo(3); else { await goTo(2); await ivGo(w.sec); }
      }
    }
    await page.click(sel);
  };
  // 人物像の点（docs/SPEC-persona.md 3-2）。今の値と違うときだけ押す（同じ点を押すと未入力に戻るため）。n=0 で未入力に戻す。ボタンが無ければ評価へ
  const setPs = async (id, n) => {
    const cur = await st(id => { const p = window.RecruitApp.state.checklist.persona; return p && p[id] ? Number(p[id]) : 0; }, id);
    if (cur === n) return;
    const sel = `[data-action="ps-set"][data-persona="${id}"][data-score="${n || cur}"]`;
    if (!(await page.$(sel))) await goTo(3);
    await page.click(sel);
  };
  // 面接の「説明した」（段階に 1 つ。kind: explain／notify）。ボタンが無ければ面接のその段階へ
  const said = async (sec, kind = 'explain') => {
    const sel = `[data-action="iv-said"][data-sec="${sec}"][data-kind="${kind}"]`;
    if (!(await page.$(sel))) { if (await step() !== 2) await goTo(2); await ivGo(sec); }
    await page.click(sel);
    await wait(120);
  };
  // 面接の全段階の質問のメモ（と台本の編集で付けたメモ）を text に・評価の確認点のメモを rtText に（重いサンプル）
  const fillMemos = async (text, rtText) => {
    await goTo(2);
    for (const sec of await st(() => window.RecruitApp.state.profile.checklist.sections.map(s => s.id))) {
      await ivGo(sec);
      for (const c of await page.$$eval('#ivStage textarea[data-cl^="notes."]', els => els.map(e => e.getAttribute('data-cl')))) await page.fill('#ivStage textarea[data-cl="' + c + '"]', text);
    }
    await goTo(3);
    for (const c of await page.$$eval('#stepContent input.cl-note[data-cl]', els => els.map(e => e.getAttribute('data-cl')))) await page.fill('#stepContent input.cl-note[data-cl="' + c + '"]', rtText == null ? text : rtText);
  };
  // 別のページ（ローカル版・公開版のタブ）で面接 → 評価 → 報告書へ（画面の操作で: 最後の段階のチップ →「面接を終えて評価へ」→「報告書へ」）
  const ivToReport = async (pg) => {
    const last = await pg.$$eval('#ivChips [data-action="iv-go"]', els => els.length ? els[els.length - 1].dataset.sec : '');
    if (last) { await pg.click('#ivChips [data-action="iv-go"][data-sec="' + last + '"]'); await pg.waitForTimeout(150); }
    await pg.click('#ivNext');
    await pg.waitForTimeout(250);
    await pg.click('#toReportBtn');
    await pg.waitForTimeout(400);
  };
  const psIds = () => st(() => { const p = window.RecruitApp.state.profile.checklist.persona; return p && p.enabled !== false ? (p.items || []).map(it => it.id) : []; });
  // 人物像を台本順に scores（配列）で入れる
  const setPsAll = async (scores) => { const ids = await psIds(); for (let i = 0; i < ids.length; i++) await setPs(ids[i], scores[i] || 0); await wait(80); };
  // 必須条件すべて一致（o.must=false で触らない）・確認点すべて level・総合判断 o.overall（既定 hire）・人物像すべて o.ps（既定 4。false で触らない）
  //   必須条件・確認点・総合判断・人物像は全部評価の画面にあるので、先に評価へ（docs/SPEC-flow.md 9-2）
  const rateAll = async (level = 'good', o = {}) => {
    if (await step() !== 3) await goTo(3);
    const ids = await st(() => { const d = window.RecruitApp.state.profile.checklist, R = window.RecruitRules;
      return { must: R.checklistItems(d, 'must').map(x => x.item.id), rate: R.checklistItems(d, 'rating').map(x => x.item.id) }; });
    if (o.must !== false) for (const id of ids.must) await setCl('values.' + id, 'match');
    for (const id of ids.rate) await setCl('values.' + id, level);
    await setCl('overall', o.overall || 'hire');
    if (o.ps !== false && await st(() => !!window.RecruitApp.state.checklist.persona && typeof window.RecruitApp.state.checklist.persona === 'object')) {
      for (const id of await psIds()) await setPs(id, o.ps || 4);
    }
    await wait(100);
  };
  // 報告書へ（評価の「報告書へ →」。ほかの画面からは goTo(4)）
  const judge = async () => { if (await page.$('#toReportBtn')) await page.click('#toReportBtn'); else await goTo(4); await wait(400); };
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
  // E1 4 ステップ・準備（docs/SPEC-flow.md 1 章・2 章・docs/SPEC-script-mode.md 7-3・docs/SPEC-slim.md 3-4）
  // =====================================================================
  console.log('\n== E1 4 ステップ・準備 ==');
  // 1. 詳細モード（mode:'full'＋handoffRules）の保存済みの設定（full-mode-last の利用者）
  const legacyProfile = fs.readFileSync(path.join(FIX, 'legacy-profile-full.json'), 'utf8');
  await page.evaluate((t) => { localStorage.clear(); localStorage.setItem('recruit.profile.v1', t); }, legacyProfile);
  await page.reload();
  await wait(300);
  const t1a = await toastText();
  const sp1 = await storedProfile();
  const nav1a = await stepLabels();
  expect(JSON.stringify(nav1a) === JSON.stringify(['準備', '面接', '評価', '報告書']) && !!(await page.$('#scriptApplicantCard')) && t1a.includes('詳細モードは終了しました') && t1a.includes('準備 → 面接 → 評価 → 報告書の 4 ステップで開きます') &&
    !('mode' in sp1) && !('handoffRules' in sp1) && !('contribution' in sp1) && !('inputStages' in sp1) && JSON.stringify(sp1.management.fields.map(f => f.id)) === JSON.stringify(['interviewer', 'final']) &&
    sp1.meta.theaterName === 'TOHOシネマズ テスト',
    'E1 詳細モードの保存済みの設定は 4 ステップで開き（toast「詳細モードは終了しました。準備 → 面接 → 評価 → 報告書の 4 ステップで開きます。」）、保存済みの設定から mode・handoffRules・初期対応者の欄を消す: ' + JSON.stringify({ t1a, keys: Object.keys(sp1) }));
  // 確認点 rt_manner の移行（docs/SPEC-persona.md 1-6）: 直前の既定と同じ台本の保存済みの設定は、rt_manner を外した新しい既定の台本に（人物像も入る。toast 1 回）
  expect(!JSON.stringify(sp1.checklist).includes('rt_manner') && !!sp1.checklist.persona && sp1.checklist.persona.enabled === true && sp1.checklist.persona.items.length === 7 &&
    t1a.includes('確認点「最低限の話し方、敬語が可能か」は人物像の「言葉遣い・説明のわかりやすさ」と重なるため、既定の台本から外しました'),
    'E1 直前の既定の台本の保存済みの設定は rt_manner を外した既定の台本になり、人物像が入る（toast で案内）: ' + JSON.stringify({ t1a, persona: !!sp1.checklist.persona }));
  await page.reload();
  await wait(300);
  const t1b = await toastText();
  expect(!t1b.includes('詳細モード') && !t1b.includes('既定の台本から外しました'), 'E1 正規化した設定は保存し直す（再読込で toast を出さない）: ' + t1b);
  // 2. 既定
  await fresh();
  expect(await st(() => !('mode' in window.RecruitApp.state.profile) && window.RecruitApp.state.profile.management.fields.length === 2) && !(await toastText()).trim(),
    'E1 既定（設定なし）: 設定に mode は無く、押印欄は 2 つ・toast なし');
  // 3. サイドバー
  const nav32 = await stepNav();
  const hint32 = await page.$$eval('#stepNav .step-hint', els => els.map(e => e.textContent));
  expect(JSON.stringify(nav32) === JSON.stringify([['1', '1', '準備'], ['2', '2', '面接'], ['3', '3', '評価'], ['4', '4', '報告書']]) && (await page.textContent('#stepSectionTitle')) === '手順' &&
    JSON.stringify(hint32) === JSON.stringify(['応募者の名前と面接の情報', '話す → 聞く → 確かめる', '面接のあとに ○△×・人物像・総合判断', '押印・合否・保存']),
    'E1 サイドバーは 4 ステップ（準備／面接／評価／報告書・内部キーと表示番号は同じ）＋各ステップの 1 行の説明・見出し「手順」: ' + JSON.stringify({ nav32, hint32 }));
  // まだ進んでいないステップは押せない（面接・評価・報告書は無効）・最上部に「この画面ですること」
  const dis32 = await page.$$eval('#stepNav li', els => els.map(e => e.classList.contains('disabled')));
  const lead32 = await page.evaluate(() => { const l = document.getElementById('stepLead'); return l ? { b: l.querySelector('b').textContent, t: l.querySelector('span').textContent, first: l === document.getElementById('stepContent').firstElementChild } : null; });
  expect(JSON.stringify(dis32) === JSON.stringify([false, true, true, true]) && !!lead32 && lead32.first && lead32.b === 'この画面ですること' && lead32.t === '応募者の名前と面接の情報を入れて、「面接を始める」を押します。',
    'E1 まだ進んでいないステップ（面接・評価・報告書）は無効・準備の最上部に「この画面ですること」の 1 行: ' + JSON.stringify({ dis32, lead32 }));
  // はじめての方へ（docs/SPEC-flow.md 2-1・F16）: 初回は準備の上にカード（4 つの手順・「使い方を見る」「わかった」）
  const intro32 = await page.evaluate(() => { const c = document.getElementById('introCard'); return c ? { h: c.querySelector('h2').textContent, li: Array.from(c.querySelectorAll('.intro-steps li b')).map(e => e.textContent),
    btns: Array.from(c.querySelectorAll('button')).map(b => b.textContent), before: !!(c.compareDocumentPosition(document.getElementById('scriptApplicantCard')) & Node.DOCUMENT_POSITION_FOLLOWING) } : null; });
  expect(!!intro32 && intro32.h === 'はじめての方へ' && JSON.stringify(intro32.li) === JSON.stringify(['準備', '面接', '評価', '報告書']) && JSON.stringify(intro32.btns) === JSON.stringify(['使い方を見る', 'わかった']) && intro32.before,
    'E1 初回は応募者のカードの上に「はじめての方へ」（準備・面接・評価・報告書の 4 つ・使い方を見る・わかった）: ' + JSON.stringify(intro32));
  const names32 = await page.evaluate(() => ({ nav: document.querySelector('.nav-item[data-view="judge"]').textContent.trim(), top: document.getElementById('topTitle').textContent }));
  expect(names32.nav.endsWith('報告書の作成') && !names32.nav.includes('応募者判定') && names32.top === '面接チェックリスト報告',
    'E1 画面名: ナビ「報告書の作成」・トップバー「面接チェックリスト報告」: ' + JSON.stringify(names32));
  // 4. 準備の項目
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
    'E1 準備に氏名（必須）・年齢・性別・区分・応募した求人・タクシー可否・料金・面接日（今日）・面接担当者（名簿）・メモ（任意・2 行）。消極属性は無い: ' + JSON.stringify(f32));
  // 1 枚のカード・3 行（docs/SPEC-script-mode.md 12 章）。説明文は冒頭の 1 行だけ・各入力の下の補足文なし
  //   （2026-10-18 の見直しで見出し帯つきのカードに: 行は .card-body の子・説明文は .card-note。docs/DESIGN.md 4-2）
  const lay32 = await page.evaluate(() => {
    const card = document.getElementById('scriptApplicantCard');
    const rows = Array.from(card.querySelectorAll(':scope > .card-body > .field-row'));
    const sel = (row) => Array.from(row.children).map(f => { const c = f.querySelector('[data-field], [data-cl], [id^="sa"]'); return f.id || (c ? (c.dataset.field || c.id) : ''); });
    const btns = Array.from(document.querySelectorAll('#saPosting .seg-btn')).map(b => b.textContent);
    return {
      cards: document.querySelectorAll('#stepContent .card').length, rows: rows.length, r: rows.map(sel),
      lead: Array.from(card.querySelectorAll(':scope > .card-body > .card-note')).map(e => e.textContent), hints: card.querySelectorAll('.hint').length, subs: card.querySelectorAll('h3.sub, .group-h').length,
      ivTitle: (document.getElementById('saInterviewer').title || '').includes('応募者の管理（押印）'), taxiPh: document.getElementById('saTaxi').placeholder,
      btns, postLabel: (document.querySelector('#saPosting > label, #saPosting > .field-label') || {}).textContent
    };
  });
  expect(lay32.cards === 1 && lay32.rows === 3 && JSON.stringify(lay32.r) === JSON.stringify([['name', 'age', 'gender', 'category', 'grp-graduation'], ['saDate', 'saInterviewer', 'saPosting'], ['saTaxi', 'reviewerNotes']]) &&
    JSON.stringify(lay32.lead) === JSON.stringify(['氏名だけ必須です。あとは分かる範囲で入力してください。']) && lay32.hints === 0 && lay32.subs === 0 && lay32.ivTitle && lay32.taxiPh === '例：可・2,500円' &&
    JSON.stringify(lay32.btns) === JSON.stringify(['通常', '短期']) && lay32.postLabel === '応募した求人',
    'E1 準備は 1 枚・3 行（氏名・年齢・性別・区分〔卒業予定〕／面接日・面接担当者・求人〔通常・短期〕／タクシー・メモ）・説明は冒頭 1 行・補足文なし（名簿の案内は title）: ' + JSON.stringify(lay32));
  // 5. 詳細項目なし
  const absent32 = [];
  for (const sel of ['[data-field="workDays"]', '[data-field="anyDay"]', '[data-field="shifts.mon.start"]', '[data-field="daysMin"]', '[data-field="daysMax"]', '[data-field="workPeriod"]', '[data-field="commuteMethod"]',
    '[data-field="nearestStation"]', '[data-field="sideJob"]', '[data-field="foreign.isForeign"]', '[data-field="vacation.gw"]', '[data-field="lateNight.availability"]', '[data-field="allNight.availability"]',
    '#preFill', '#notesCard', '[data-action="generate-handoff"]']) if (await page.$(sel)) absent32.push(sel);
  expect(absent32.length === 0, 'E1 準備に詳細項目（曜日・時間帯・週日数・勤務期間・通勤・かけもち・外国籍・繁忙期・深夜帯・オールナイト・申し送り）が無い: ' + absent32.join(' '));
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
    'E1 準備の入力は applicant と checklist.header に入る: ' + JSON.stringify(s32.h));
  // 9. 右サマリー
  const sum32 = await page.textContent('#summaryPanel');
  expect(['台本 花子', '大学2年生', '20歳', '短期求人', '笹川 晴央'].every(t => sum32.includes(t)) && !['シフト貢献度', '留意点', '通勤', '消極属性', '短期希望', '朝～12時のみ'].some(t => sum32.includes(t)),
    'E1 右サマリーに氏名・属性・短期求人・担当。消極属性・貢献度・留意点・通勤は出さない');
  const sa32 = await page.evaluate(() => { const c = document.getElementById('sumApplicant'); return { kids: Array.from(c.querySelector('.card-body').children).map(e => e.id || e.className), badges: Array.from(c.querySelectorAll('.badge')).map(b => b.textContent) }; });
  expect(JSON.stringify(sa32.kids) === JSON.stringify(['sum-name', 'sum-sub', 'sumDate', 'sumInterviewer']) && JSON.stringify(sa32.badges) === JSON.stringify(['短期求人']),
    'E1 右サマリーの「応募者」は 氏名・区分/年齢/性別・面接日・担当 の 4 行（チップは短期求人 1 つだけ）: ' + JSON.stringify(sa32));
  await setCl('header.posting', 'regular');
  await wait(100);
  const sa32b = await page.$$eval('#sumApplicant .badge', els => els.map(b => b.textContent));
  expect(sa32b.length === 0 && !(await page.textContent('#sumApplicant')).includes('通常求人'), 'E1 求人が通常なら右サマリーに求人のチップを出さない: ' + JSON.stringify(sa32b));
  await setCl('header.posting', 'short');
  await wait(100);
  // 1440×900・1280×800・ノート PC の実際の表示の高さ（1366×768 の画面でブラウザの枠とタスクバーを除いた 1366×657・ブックマークバーありの 1366×625・1280×800 の画面の 1280×680。14 章）で
  //   「はじめての方へ」を出したまま: 右下の「面接を始める →」（主ボタン。記入シートは左）は操作行（画面の下に固定）でいつも見える。応募者の欄が操作行に隠れているときは操作行に
  //   「▼ 下にあと n 項目」（n は隠れている欄の数）が出て、押すと最後の欄まで操作行の上に出る（隠れたまま知らせないことはない）。入力欄はカードからはみ出さない。
  //   区分が未選択と学生（卒業予定年月が出て 1 行目が折り返す）の両方（2026-10-19。それまでの「スクロールなしに収まる」の確かめは操作行が固定なので常に真だった。docs/SPEC-flow.md 16-7）
  const fit32 = [];
  const hid32 = () => page.evaluate(() => { const ft = document.getElementById('saActions').getBoundingClientRect().top, b = document.getElementById('saMore');
    const ctl = Array.from(document.querySelectorAll('#scriptApplicantCard input, #scriptApplicantCard select, #scriptApplicantCard textarea, #scriptApplicantCard .seg-btn')).filter(e => e.offsetParent !== null);
    //   欄（.field）は入力部品が隠れていたら数える（同じ行の高いメモ欄に合わせて枠が伸びた欄は、入力欄が見えていれば数えない）
    return { ctl: ctl.filter(e => e.getBoundingClientRect().bottom > ft + 2).length,
      fields: Array.from(document.querySelectorAll('#scriptApplicantCard .field')).filter(e => e.offsetParent !== null && (e.querySelector('input, select, textarea, .seg') || e).getBoundingClientRect().bottom > ft + 2).length,
      more: b && !b.classList.contains('hidden') && b.offsetParent !== null ? window.__lbl(b) : '' }; });
  for (const cat of ['', '大学2年生']) {
    await page.selectOption('[data-field="category"]', cat);
    for (const [w, h] of [[1440, 900], [1280, 800], [1366, 657], [1366, 625], [1280, 680]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.scrollTo(0, 0));
      await wait(200);
      const o = Object.assign({ cat: cat || '未選択' }, await page.evaluate(([w, h]) => { const r = document.getElementById('saNext').getBoundingClientRect();
        const cardR = document.getElementById('scriptApplicantCard').getBoundingClientRect();
        const inCard = Array.from(document.querySelectorAll('#scriptApplicantCard input, #scriptApplicantCard select, #scriptApplicantCard textarea, #scriptApplicantCard .seg-btn')).filter(el => el.offsetParent !== null)
          .every(el => { const b = el.getBoundingClientRect(); return b.left >= cardR.left - 1 && b.right <= cardR.right + 1; });
        const foot = document.getElementById('saActions').getBoundingClientRect(), btn = document.getElementById('saNext');
        return { w, bottom: Math.round(r.bottom), h: innerHeight, inCard, intro: !!document.getElementById('introCard'), label: window.__lbl(btn), primary: btn.classList.contains('primary'),
          right: Math.abs(foot.right - r.right) <= 2, paperLeft: document.getElementById('saPaperBtn').getBoundingClientRect().left < r.left }; }, [w, h]), { top: await hid32() });
      o.clicks = 0;
      while (o.clicks < 4 && (await hid32()).more) { await page.click('#saMore'); await wait(200); o.clicks++; }
      o.end = await hid32();
      fit32.push(o);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(150);
  expect(fit32.every(x => x.bottom <= x.h && x.inCard && x.intro && x.label === '面接を始める [arrow-right]' && x.primary && x.right && x.paperLeft &&
      (x.top.ctl > 0 ? x.top.more === '[chevron-down] 下にあと ' + x.top.fields + ' 項目' && x.clicks >= 1 && x.end.ctl === 0 && !x.end.more : x.top.more === '')) &&
    fit32.some(x => x.top.ctl > 0) && fit32.some(x => x.top.ctl === 0),
    'E1 1440×900・1280×800・ノート PC の表示の高さ（1366×657・1366×625・1280×680）で「はじめての方へ」を出したまま: 右下の「面接を始める →」（主ボタン。記入シートは左）は見え、' +
    '操作行に隠れている欄があれば「▼ 下にあと n 項目」・押すと最後の欄まで操作行の上に出る（区分が未選択・学生の両方）・入力欄はカードからはみ出さない: ' + JSON.stringify(fit32));
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
  expect(ov32 <= 1 && col32.every(x => x === col32[0]), 'E1 390px 幅の準備は 1 列・横スクロールなし: ' + ov32 + ' ' + col32.join(','));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  await sshot('40-script-step1.png');
  // 11. 面接へ（「はじめての方へ」は閉じずに進んでもよい）
  await page.click('[data-action="script-next"]');
  await wait(400);
  expect(await step() === 2 && !!(await page.$('#ivStage[data-sec="conditions"]')) && await st(() => !!window.RecruitApp.state.checklist.timing.startedAt),
    'E1 「面接を始める →」で面接（内部キー 2）の ① へ・面接の開始時刻が入る');

  // =====================================================================
  // E2 面接（1 段階ずつ）→ 評価 → 報告書（判定）（docs/SPEC-flow.md 3 章・4 章）
  // =====================================================================
  console.log('\n== E2 面接 → 評価 → 報告書 ==');
  // 面接の画面: 上の帯（段階のチップ 5 つ・タイマー）→ 1 段階（① 勤務条件）→ 下の操作行。○△×・人物像・総合判断・旧ヘッダー（#clHeader）は出さない
  const ivNow = () => page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      chips: Array.from(document.querySelectorAll('#ivChips .iv-chip')).map(c => c.dataset.sec + ':' + c.querySelector('.iv-chip-no').textContent + c.querySelector('.iv-chip-t').textContent),
      cur: Array.from(document.querySelectorAll('#ivChips .iv-chip.is-current')).map(c => c.dataset.sec + ':' + c.getAttribute('aria-current')),
      stage: q('#ivStage') ? q('#ivStage').dataset.sec : '', h: (q('#ivStageH') || {}).textContent,
      //   応募者: 1 行目（氏名・さん）｜2 行目（区分・年齢・求人。.iv-who-sub）の見える文字（2 行目の頭の「・」は .sym なので数えない）
      who: q('#ivWho') ? Array.from(q('#ivWho').childNodes).map(n => n.nodeType === 1 && n.classList.contains('iv-who-sub') ? '｜' + window.__lbl(n) : n.nodeType === 1 ? window.__lbl(n) : n.nodeValue).join('') : '',
      groups: Array.from(document.querySelectorAll('#ivStage .iv-grp')).map(g => g.dataset.kind + ':' + g.querySelector('.iv-k > span').textContent),
      //   縦一列（2026-10-18。docs/DESIGN.md 4-3）: 段階のカードは同じ左端・同じ幅で上から順に積む（2 列・高さそろえは無い）
      oneCol: (() => { const r = Array.from(document.querySelectorAll('#ivStage > section.card')).map(c => c.getBoundingClientRect());
        return r.length > 0 && r.every((x, i) => Math.abs(x.left - r[0].left) <= 1 && Math.abs(x.width - r[0].width) <= 1 && (i === 0 || x.top >= r[i - 1].bottom)) && !document.querySelector('#ivStage .iv-cols, #ivStage .iv-col'); })(),
      qs: Array.from(document.querySelectorAll('#ivStage .iv-q')).map(e => e.dataset.item),
      must: Array.from(document.querySelectorAll('#ivStage .cl-must-row')).map(e => e.dataset.item),
      timer: [q('#ivTStageVal'), q('#ivTStageGoal'), q('#ivTTotal')].map(e => e ? e.textContent : '?').join(' '),
      flow: window.__lbl(q('#ivStage .iv-flow')),
      //   操作行のボタンは見える文字とアイコン（window.__lbl。.sym の記号では比べない）
      prev: window.__lbl(q('#ivPrev')), next: window.__lbl(q('#ivNext')), nextAct: q('#ivNext') ? q('#ivNext').dataset.action : '', toEval: !!q('#ivToEval'),
      no: ['.cl-rate-row', '#clPersona', '#clOverall', '[data-action="ps-set"]', '[data-cl="overall"]', '#clHeader', '[data-action="explain-all"]', '.cl-auto', '.cl-auto-hint'].filter(s => !!document.querySelector('#stepContent ' + s)),
      noSummary: document.querySelector('#view-judge .judge-layout').classList.contains('no-summary') && getComputedStyle(document.getElementById('summaryPanel')).display === 'none', lead: (q('#stepLead span') || {}).textContent
    };
  });
  const iv33 = await ivNow();
  expect(JSON.stringify(iv33.chips) === JSON.stringify(['conditions:①勤務条件', 'continuity:②継続性・報連相', 'job:③仕事内容の説明', 'teamwork:④集団行動特性', 'reverse:⑤逆質問']) &&
    JSON.stringify(iv33.cur) === JSON.stringify(['conditions:step']) && iv33.stage === 'conditions' && iv33.h === '①勤務条件' && iv33.no.length === 0 && iv33.noSummary &&
    iv33.lead === '台本どおりに 話す → 聞く → 確かめる（答えはメモ）。○△× などの評価は面接のあとで付けます。',
    'E2 面接は上の帯（段階のチップ ①〜⑤・今の段階 ①）と 1 段階だけ。○△×・人物像・総合判断・旧ヘッダー・自動表示・右サマリーは出さない: ' + JSON.stringify(iv33));
  expect(iv33.who === '台本 花子さん｜大学2年生・20歳・短期求人' && !iv33.who.includes('消極属性') && !iv33.who.includes('短期希望'),
    'E2 段階の見出しの右に応募者の 1 行（氏名・区分・年齢・求人。消極属性なし）: ' + iv33.who);
  // ① は縦一列の 3 枚のカード（2026-10-18。docs/DESIGN.md 4-3）: 話すこと → 聞くこと（質問 3 つ）→ 確かめること（いつも最後＝［次へ］のすぐ上）→ 流れの注記（小さく）。
  //   確かめることの行は 2 つのまとまり: 「必須条件」（必須条件の行＋直後の記入欄）・「勤務条件の確認」（台本の【質問】の記入欄〔短期／長期の希望・契約開始日の希望など〕。
  //   注記「応募者に聞いて選ぶ・記入する（Q1 は聞くことの答え）」〔Q のタグの付いた欄だけが聞くことの答え。2026-10-19〕・質問と同じ短い名前の欄には Q 番号のタグ）。行の操作は右の固定幅の列（同じ左端）
  const chk33 = await page.evaluate(() => {
    const c = document.querySelector('#ivStage .k-check');
    const cards = Array.from(document.querySelectorAll('#ivStage > section.card'));
    if (!c) return null;
    const ctl = Array.from(c.querySelectorAll('.row > .row-ctl')).map(e => Math.round(e.getBoundingClientRect().left));
    return { last: cards[cards.length - 1] === c, flowAfter: !!document.querySelector('#ivStage > .k-check ~ .iv-flow'),
      groups: Array.from(c.querySelectorAll('.group-h')).map(h => h.firstChild.textContent + '|' + ((h.querySelector('small') || {}).textContent || '')),
      rows: Array.from(c.querySelectorAll('.row')).map(e => e.dataset.item + ((e.querySelector('.q-no') || {}).textContent ? ':' + e.querySelector('.q-no').textContent : '')),
      ctlSame: ctl.length > 0 && ctl.every(x => x === ctl[0]) };
  });
  expect(JSON.stringify(iv33.groups) === JSON.stringify(['say:話すこと', 'ask:聞くこと', 'check:確かめること']) && iv33.oneCol &&
    JSON.stringify(iv33.qs) === JSON.stringify(['q_term', 'q_two_months', 'q_family']) && JSON.stringify(iv33.must) === JSON.stringify(['must_weekly', 'must_busy']) &&
    iv33.flow === '[arrow-right] 条件一致：2へ　／　必須条件不一致：追加質問してみて、解消しなければ「５」へ' && iv33.timer === '00:00 / 目安 10分 00:00' &&
    !!chk33 && chk33.last && chk33.flowAfter && chk33.ctlSame &&
    JSON.stringify(chk33.groups) === JSON.stringify(['必須条件|1つでも不一致なら不採用（追加質問して解消しなければ「⑤」へ）', '勤務条件の確認|応募者に聞いて選ぶ・記入する（Q1 は聞くことの答え）']) &&
    JSON.stringify(chk33.rows) === JSON.stringify(['must_weekly', 'must_busy', 'weekend', 'busy_ng', 'term:Q1', 'start_date', 'first_end', 'open_late']),
    'E2 ① は縦一列（話すこと → 聞くこと〔質問 3 つ〕→ 確かめること〔必須条件 2・記入欄 2｜勤務条件の確認: 【質問】の記入欄 4 つ・短期／長期の希望に Q1〕）・確かめることは最後のカード・その下に流れの注記・操作の列は同じ左端・タイマー「00:00 / 目安 10分」（固定時計）: ' + JSON.stringify({ g: iv33.groups, oneCol: iv33.oneCol, timer: iv33.timer, chk33 }));
  expect(iv33.prev === '[arrow-left] 準備に戻る' && iv33.next === '次へ：② 継続性・報連相 [arrow-right]' && iv33.nextAct === 'iv-next' && !iv33.toEval,
    'E2 ① の操作行は「← 準備に戻る」（左向きの矢印のアイコン）と右端の「次へ：② 継続性・報連相 →」（右向きの矢印）: ' + JSON.stringify({ prev: iv33.prev, next: iv33.next }));
  // 本文が狭い 1366px・1280px でもチップは 1 行・タイマーと重ならない
  const ch33 = [];
  for (const [w, h] of [[1366, 768], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(150);
    ch33.push(await page.evaluate((w) => {
      const rs = Array.from(document.querySelectorAll('#ivChips .iv-chip')).map(c => c.getBoundingClientRect()), tr = document.getElementById('ivTimer').getBoundingClientRect();
      const mids = rs.map(r => r.top + r.height / 2);
      return { w, spread: Math.round(Math.max(...mids) - Math.min(...mids)), noOverlap: rs.every(r => r.right <= tr.left || r.bottom <= tr.top || r.top >= tr.bottom), h: Math.round(rs[0].height) };
    }, w));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(150);
  expect(ch33.every(x => x.spread <= 2 && x.noOverlap && x.h >= 34), 'E2 1366px・1280px でも段階のチップは 1 行（高さ 34px 以上）・タイマーと重ならない: ' + JSON.stringify(ch33));
  // 「説明した」（段階に 1 つ。docs/SPEC-flow.md 3-4）。求人が短期なので ① の 4 項目（短期のみ 2 つも）が対象
  const exVals = (ids) => st(ids => { const v = window.RecruitApp.state.checklist.values; return ids.map(id => v[id] === true); }, ids);
  const saidBtn = (sec, kind = 'explain') => page.$eval(`[data-action="iv-said"][data-sec="${sec}"][data-kind="${kind}"]`, b => ({ t: window.__lbl(b), p: b.getAttribute('aria-pressed') }));
  const EX1 = ['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch'];
  const sb33 = await page.$$eval('#stepContent [data-action="iv-said"]', els => els.map(e => e.dataset.sec + ':' + e.dataset.kind + ':' + window.__lbl(e)));
  const li33 = await page.$$eval('#ivStage .iv-say-list li', els => els.map(e => e.dataset.item + (e.querySelector('.tag') ? '*' : '')));
  expect(JSON.stringify(sb33) === JSON.stringify(['conditions:explain:[circle] 説明した']) && JSON.stringify(li33) === JSON.stringify(EX1) && !(await page.$('#ivStage .iv-say-list input')) && !(await page.$('#ivStage .iv-note')),
    'E2 ① の「話すこと」は 4 項目を読むだけのリスト（チェックボックスなし・短期求人なので「短期のみ」の印と注記なし）と「説明した」1 つ: ' + JSON.stringify({ sb33, li33 }));
  await said('conditions');
  const ea33a = { v: await exVals(EX1), b: await saidBtn('conditions'), other: await exVals(['ex_submit']) };
  expect(ea33a.v.every(Boolean) && ea33a.b.t === '[check] 説明した' && ea33a.b.p === 'true' && !ea33a.other[0], 'E2 「説明した」で ① の説明 4 項目（短期求人なので短期のみも）が済み・ボタンは「✓ 説明した」（✓ のアイコン）・他の段階は触らない: ' + JSON.stringify(ea33a));
  await said('conditions');
  const ea33b = { v: await exVals(EX1), b: await saidBtn('conditions') };
  expect(ea33b.v.every(x => !x) && ea33b.b.t === '[circle] 説明した' && ea33b.b.p === 'false' && await st(() => !Object.keys(window.RecruitApp.state.checklist.values).some(k => k.indexOf('ex_') === 0)),
    'E2 もう一度押すと全部外す（values から消える）・ボタンは「○ 説明した」（○ のアイコン）: ' + JSON.stringify(ea33b));
  // ② へ（［次へ］）: ① のチップは ✓（必須条件を 2 つとも確かめた）・「← 前の段階」。「一部説明しなかった ▾」で項目ごとのチェック → 全部付けると「✓ 説明した」
  await setCl('values.must_weekly', 'match');
  await setCl('values.must_busy', 'match');
  await page.click('#ivNext');
  await wait(200);
  const iv33b = await ivNow();
  const done33 = await page.$eval('#ivChips [data-sec="conditions"]', c => c.classList.contains('is-done') && c.querySelector('.iv-chip-s').textContent === '✓');
  //   ② も縦一列: 話すこと → 聞くこと（質問 3 つを 1 枚のカードに台本の順で。確かめることの無い段階はそのカードを出さない）
  expect(iv33b.stage === 'continuity' && iv33b.prev === '[arrow-left] 前の段階' && iv33b.next === '次へ：③ 仕事内容の説明 [arrow-right]' && done33 && iv33b.oneCol &&
    JSON.stringify(iv33b.groups) === JSON.stringify(['say:話すこと', 'ask:聞くこと']) && JSON.stringify(iv33b.qs) === JSON.stringify(['q_prev_job', 'q_cant_3days', 'q_sudden_absence']) &&
    await page.evaluate(() => document.activeElement === document.getElementById('ivStageH') && window.scrollY === 0),
    'E2 ［次へ］で ②（縦一列: 話すこと → 聞くこと〔3 問〕。確かめることのカードは無い）・① のチップに ✓・見出しにフォーカスして先頭へ: ' + JSON.stringify({ stage: iv33b.stage, prev: iv33b.prev, next: iv33b.next, done33, g: iv33b.groups, qs: iv33b.qs, oneCol: iv33b.oneCol }));
  await page.click('[data-action="iv-said-items"][data-sec="continuity"][data-kind="explain"]');
  await wait(120);
  const items33 = await page.$$eval('#ivStage .iv-say-list.is-items input[type="checkbox"]', els => els.map(e => e.dataset.cl));
  const part33 = await page.$eval('[data-action="iv-said-items"][data-sec="continuity"]', b => window.__lbl(b) + ':' + b.getAttribute('aria-expanded'));
  for (const c of items33) await page.click('#ivStage .iv-say-list input[data-cl="' + c + '"]');
  await wait(120);
  const ea33c = { b: await saidBtn('continuity'), v: await exVals(['ex_submit', 'ex_phone', 'ex_absence']) };
  expect(JSON.stringify(items33) === JSON.stringify(['values.ex_submit', 'values.ex_phone', 'values.ex_absence']) && part33 === '一部説明しなかった [chevron-up]:true' && ea33c.v.every(Boolean) && ea33c.b.t === '[check] 説明した',
    'E2 「一部説明しなかった ▾」で項目ごとのチェック（3 つ）・全部付けるとボタンは「✓ 説明した」: ' + JSON.stringify({ items33, part33, ea33c }));
  await said('continuity');
  expect((await exVals(['ex_submit', 'ex_phone', 'ex_absence'])).every(x => !x) && (await saidBtn('continuity')).t === '[circle] 説明した', 'E2 済みの「✓ 説明した」を押すと ② の説明を全部外す');
  // ⑤（チップ）: どの段階も同じ順（2026-10-18。docs/DESIGN.md 4-3）＝ 話すこと〔合否連絡の［伝えた］〕→ 聞くこと・「面接を終えて評価へ →」
  await ivGo('reverse');
  const iv33c = await ivNow();
  expect(iv33c.stage === 'reverse' && iv33c.oneCol && JSON.stringify(iv33c.groups) === JSON.stringify(['say:話すこと', 'ask:聞くこと']) &&
    iv33c.next === '面接を終えて評価へ [arrow-right]' && iv33c.nextAct === 'iv-end' && iv33c.timer === '00:00 / 最大 10分 00:00' && (await page.textContent('#ivStage .k-say .iv-k small')) === '合否連絡 2 項目',
    'E2 ⑤ も縦一列で 話すこと〔合否連絡 2 項目〕→ 聞くこと の順（どの段階も同じ順）・目安「/ 最大 10分」・主ボタン「面接を終えて評価へ →」: ' + JSON.stringify({ g: iv33c.groups, oneCol: iv33c.oneCol, next: iv33c.next, timer: iv33c.timer }));
  await said('reverse', 'notify');
  const nt33 = { v: await exVals(['nt_hire', 'nt_reject']), b: await saidBtn('reverse', 'notify') };
  expect(nt33.v.every(Boolean) && nt33.b.t === '[check] 伝えた' && nt33.b.p === 'true', 'E2 ⑤ の［伝えた］で合否連絡 2 項目が済み・「✓ 伝えた」（✓ のアイコン）: ' + JSON.stringify(nt33));
  await said('reverse', 'notify');
  await said('conditions');   // ① の説明だけ済みにしておく
  // 評価へ（⑤ の「面接を終えて評価へ →」）: 段階のカード 5 枚＋人物像・総合判断・面接所見・面接時間のカード。「← 面接に戻る」「報告書へ →」
  await ivGo('reverse');
  await page.click('#ivNext');
  await wait(300);
  const ev33 = await page.evaluate(() => ({
    secs: Array.from(document.querySelectorAll('#stepContent section.ev-sec')).map(e => e.id), overall: !!document.getElementById('clOverall'),
    old: ['#shiftConfirm', '#unresolvedAlert', '.cl-group-label', '.cl-auto', '.cl-auto-hint', '#clHeader', '#ivStage'].filter(s => !!document.querySelector('#stepContent ' + s)),
    back: window.__lbl(document.getElementById('evBack')), next: window.__lbl(document.getElementById('toReportBtn')),
    ended: !!(window.RecruitApp.state.checklist.timing || {}).endedAt, lead: (document.querySelector('#stepLead span') || {}).textContent
  }));
  expect(await step() === 3 && JSON.stringify(ev33.secs) === JSON.stringify(['cl-conditions', 'cl-continuity', 'cl-job', 'cl-teamwork', 'cl-reverse']) && ev33.overall && ev33.old.length === 0 &&
    ev33.back === '[arrow-left] 面接に戻る' && ev33.next === '報告書へ [arrow-right]' && ev33.ended && ev33.lead === '面接のメモを見ながら、○△×・人物像・総合判断を付けます。',
    'E2 「面接を終えて評価へ →」で評価（段階のカード ①〜⑤＋人物像・総合判断・面接所見・面接時間・面接の終了時刻）。「← 面接に戻る」「報告書へ →」（矢印のアイコン）: ' + JSON.stringify(ev33));
  await rateAll('good');
  await sshot('41-flow-evaluate.png');
  await judge();
  const j33 = await judgment();
  expect(await step() === 4 && j33.mode === 'script' && j33.result === 'recommend' && j33.adjustments.length === 0, 'E2 必須条件すべて一致・確認点すべて○・総合判断「採用」→ 採用推奨（mode=script）: ' + JSON.stringify(j33));
  const paper33 = await page.evaluate(() => ({
    sheet: !!document.querySelector('#appPaper .cl-sheet.cl-mode-sheet'), tiles: Array.from(document.querySelectorAll('#appPaper .cl-tile .cl-tile-k')).map(e => e.textContent),
    judge: (document.querySelector('#appPaper .cl-judge') || {}).textContent || '', dec: !!document.querySelector('#appPaper .cl-decision.is-none#appPaperDecision') }));
  expect(paper33.sheet && JSON.stringify(paper33.tiles) === JSON.stringify(['結果', '総合判断', '必須条件', '確認点', '人物像']) && paper33.judge.includes('採用推奨') && !paper33.judge.includes('シフト貢献度') && paper33.dec,
    'E2 報告書の紙プレビュー: 結果ストリップは 結果・総合判断・必須条件・確認点・人物像（貢献度タイルなし）＋最終合否（未押印）: ' + JSON.stringify(paper33.tiles));
  // 報告書の紙は保存 HTML と同じ A4 縦の用紙（210×297mm・白地＋下線の見出し・押印行は用紙の中。docs/SPEC-a4.md 5 章）。公開版はロゴなし
  const a4p33 = await page.evaluate(() => { const p = document.getElementById('appPaper'), r = p.getBoundingClientRect(), z = parseFloat(p.style.zoom || '1');
    return { a4: p.classList.contains('a4'), w: +(r.width / z).toFixed(1), h: +(r.height / z).toFixed(1), title: (document.querySelector('#appPaper .cl-title .cl-title-t') || {}).textContent, logo: !!document.querySelector('#appPaper .cl-title-logo'),
      band: !!document.querySelector('#appPaper .cl-band'), stamps: Array.from(document.querySelectorAll('#appPaper .cl-stamps .stamp-box')).map(b => b.dataset.fieldId), cap: (document.querySelector('.report-paper-cap') || {}).textContent }; });
  expect(a4p33.a4 && Math.abs(a4p33.w - 793.7) <= 1 && Math.abs(a4p33.h - 1122.5) <= 1 && a4p33.title === '面接チェックリスト報告' && !a4p33.logo && !a4p33.band && JSON.stringify(a4p33.stamps) === JSON.stringify(['interviewer', 'final']) &&
    a4p33.cap.includes('保存した HTML はこの用紙 1 枚で開きます'),
    'E2 報告書の紙は A4 縦の用紙（210×297mm・見出しは白地＋下線・公開版はロゴなし・押印行 2 欄は用紙の中）: ' + JSON.stringify(a4p33));
  const lay33 = await page.evaluate(() => { const t = (s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top : null; };
    return { paper: t('#appPaperWrap'), mgmt: t('#mgmtCard'), dec: t('#decisionCard'), boxes: Array.from(document.querySelectorAll('#mgmtCard .stamp-box')).map(b => b.dataset.fieldId),
      cols: document.querySelector('#mgmtCard .stamp-row').classList.contains('cols-2'), grid: getComputedStyle(document.querySelector('#mgmtCard .stamp-row')).gridTemplateColumns.split(' ').length,
      save: window.__lbl(document.querySelector('#reportSaveBtn')), print: window.__lbl(document.querySelector('#reportPrintBtn')) }; });
  expect(lay33.paper != null && lay33.paper < lay33.mgmt && lay33.mgmt < lay33.dec && JSON.stringify(lay33.boxes) === JSON.stringify(['interviewer', 'final']) && lay33.cols && lay33.grid === 2 &&
    lay33.save === '[download] 報告書を保存（HTML）' && lay33.print === '[printer] A4 で印刷',
    'E2 報告書: 紙プレビュー → 押印（面接対応者・最終確認の 2 欄・2 列）→ 最終合否 → 「報告書を保存（HTML）」「A4 で印刷」: ' + JSON.stringify(lay33));
  const no33 = [];
  for (const sel of ['.result-card', '#clBreakdown', '.axis-grid', '#busyAllNightResult', '#applicantSummary', '#judgeWarnings']) if (await page.$('#stepContent ' + sel)) no33.push(sel);
  expect(no33.length === 0 && !(await page.textContent('#stepContent')).includes('シフト貢献度'), 'E2 報告書ステップに 2軸判定・貢献度・応募情報サマリーを出さない: ' + no33.join(' '));
  expect(await page.$eval('#mgmtCard .stamp-box[data-field-id="interviewer"] select', el => el.value) === '0', 'E2 準備の面接担当者が押印欄「面接対応者」の初期選択');
  // 必須条件を不一致に（面接の ①。docs/SPEC-flow.md 3-8）: 赤い案内・②〜④ のチップに「省略可」・「⑤ 逆質問へ」で ⑤ へ
  await navStep(2);
  await ivGo('conditions');
  await setCl('values.must_weekly', 'mismatch');
  await wait(150);
  const ma33 = await st(() => ({ text: document.getElementById('ivMustLead').textContent + document.getElementById('ivMustAlertText').textContent, title: document.getElementById('ivMustAlert').title,
    skip: Array.from(document.querySelectorAll('#ivChips .iv-chip.is-skip')).map(c => c.dataset.sec + ':' + c.querySelector('.iv-chip-s').textContent),
    jump: (document.getElementById('ivMustJump') || {}).textContent }));
  //   案内は上の帯の 2 行目に 1 行（1 文目「必須条件が不一致です。」＋続き。docs/DESIGN.md 3-11 の文）
  expect(await visible('#ivMustAlert') && ma33.text === '必須条件が不一致です。追加で確認し、解消しなければ ⑤ 逆質問へ（最大 10 分で終了）' && ma33.title === '不一致: 土日を含む週3日以上、5時間以上' &&
    JSON.stringify(ma33.skip) === JSON.stringify(['continuity:省略可', 'job:省略可', 'teamwork:省略可']) && await visible('#ivMustJump') && ma33.jump === '⑤ 逆質問へ',
    'E2 必須条件の不一致: 赤い案内「必須条件が不一致です。追加で確認し、解消しなければ ⑤ 逆質問へ（最大 10 分で終了）」（title に不一致の項目）・②〜④ のチップに省略可（⑤ は対象外）・「⑤ 逆質問へ」ボタン: ' + JSON.stringify(ma33));
  await page.click('#ivMustJump');
  await wait(250);
  expect(await st(() => document.getElementById('ivStage').dataset.sec) === 'reverse' && await visible('#ivMustAlert') && !(await visible('#ivMustJump')),
    'E2 「⑤ 逆質問へ」で ⑤ が今の段階に（⑤ では案内だけ残り、ボタンは出さない）');
  await navStep(3);
  const ev33b = await st(() => ({ skip: ['conditions', 'continuity', 'job', 'teamwork', 'reverse'].filter(id => document.getElementById('cl-' + id).classList.contains('cl-skippable')),
    state: document.getElementById('clState-conditions').textContent, miss: document.getElementById('evMissing').textContent, res: document.getElementById('evResultTitle').textContent }));
  expect(JSON.stringify(ev33b.skip) === JSON.stringify(['continuity', 'job', 'teamwork']) && ev33b.state.includes('不一致あり') && ev33b.miss === '必須条件の不一致のため、ほかの入力は任意です' && ev33b.res === '不採用推奨',
    'E2 評価: ① に「不一致あり」・②〜④ のカードは省略可・結果は不採用推奨（ほかの入力は任意）: ' + JSON.stringify(ev33b));
  await judge();
  const j33b = await judgment();
  expect(j33b.result === 'reject' && j33b.adjustments[0] === 'must_conditions' && (await page.textContent('#appPaper .cl-tile-res')).includes('不採用推奨'), 'E2 必須条件を「不一致」にすると不採用推奨（紙の結果タイルも）: ' + JSON.stringify(j33b));
  // 保留（評価の必須条件の行でも直せる）
  await navStep(3);
  await setCl('values.must_weekly', 'match');
  await wait(100);
  expect(await st(() => !document.querySelector('.cl-skippable') && !document.getElementById('clState-conditions').textContent.includes('不一致')), 'E2 評価で必須条件を一致に戻すと省略可・「不一致あり」が消える');
  await navStep(2);
  expect(!(await visible('#ivMustAlert')) && !(await page.$('#ivChips .iv-chip.is-skip')), 'E2 面接の案内・チップの「省略可」も消える');
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
  expect(await step() === 4 && j33d.result === 'review' && await st(() => window.RecruitApp.state.checklist.overall) === '' && (await txtIn(page, '#scriptWarnings')).includes('総合判断が未入力') &&
    (await page.textContent('#scriptWarnings [data-action="to-step"][data-step="3"]')) === '評価で入力する',
    'E2 総合判断が未入力でも報告書へ進め、上長最終判断要＋警告（#scriptWarnings・「評価で入力する」）: ' + JSON.stringify(j33d));
  await page.click('#scriptWarnings [data-action="to-step"][data-step="3"]');
  await wait(250);
  expect(await step() === 3, 'E2 「評価で入力する」で評価へ');
  await setCl('overall', 'hire');
  await judge();
  expect((await judgment()).result === 'recommend' && !(await page.$('#scriptWarnings')), 'E2 総合判断「採用」に戻すと採用推奨・警告なし');
  const sm33 = { result: await txtIn(page, '#sumResult'), must: await txtIn(page, '#sumMust'), marks: await txtIn(page, '#sumMarks'), ov: await txtIn(page, '#sumOverall'), stamps: await txtIn(page, '#sumStamps') };
  expect(sm33.result.includes('採用推奨') && sm33.must.includes('すべて一致') && sm33.marks.includes('○6') && sm33.ov.includes('採用') && sm33.stamps.includes('面接対応者'),
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
    'E3 「面接対応者」に押印（初期選択のまま押せる）・報告書の紙の押印行にもハンコ');
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
  // 「詳細」表示は無い（2026-10-14）。準備の項目は用紙の見出し、準備の「メモ（任意）」は面接メモの「メモ」
  const who34 = await txtIn(rp34, '#a4 .cl-who');
  const memo34 = await rp34.evaluate(() => ({ keys: Array.from(document.querySelectorAll('#a4 .cl-nm-row .cl-nm-k')).map(e => e.textContent.trim()), memo: (document.querySelector('#a4 .cl-nm-memo .cl-nm-v') || {}).textContent }));
  expect(!(await rp34.$('#rtViewFull')) && !(await rp34.$('section.sec')) && !(await rp34.$('.rh')) && !(await rp34.$('.rtool')) &&
    ['台本 花子', '20歳', '女性', '大学2年生', '2029年3月', '短期求人', '可・2,500円', '2026/10/10', '笹川 晴央'].every(t => who34.includes(t)) && !who34.includes('通勤') && !who34.includes('勤務期間') &&
    memo34.memo === '電話の受け答えが丁寧。' && memo34.keys.includes('メモ') && !memo34.keys.some(t => t.includes('備考')),
    'E3 「詳細」表示なし。応募者の項目は用紙の見出し・準備のメモは面接メモの「メモ」（「備考」は出さない）: ' + JSON.stringify({ who34, memo34 }));
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
  expect(s34.step === 4 && (await page.$$('#stepNav li')).length === 4 && s34.d === 'hire' && s34.final === '笹川 晴央' && !!(await page.$('#decisionCard svg.verdict-stamp')) &&
    !!(await page.$('#appPaper .cl-decision svg.verdict-stamp')) && (await txtIn(page, '#sumDecision')).includes('採用・笹川') && (await page.$$('#appPaper .cl-stamps svg.hanko')).length === 2,
    'E3 アプリで読み込むと報告書（step 4）に合否・押印を引き継ぐ（紙の押印行にハンコ 2 つ）: ' + JSON.stringify(s34));
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
  expect(s4a.step === 4 && (await page.$$('#stepNav li')).length === 4 && s4a.name === '面接 花子' && s4a.n === Object.keys(rFull.checklist.values).length && s4a.j === 'script' &&
    t4a.includes('詳細モードで保存された記録です') && !(await page.textContent('#stepContent')).includes('シフト貢献度'),
    'E4 詳細モードの記録（回答・判定あり）はエラーなく報告書で開き、回答は保持・toast で案内: ' + JSON.stringify(s4a) + ' ' + t4a);
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
  expect(s4b.step === 2 && !!(await page.$('#ivStage')) && s4b.name === '押印 太郎' && JSON.stringify(s4b.mg) === JSON.stringify(['interviewer', 'final']) && t4b.includes('初期対応者の押印欄は廃止したため表示しません') && t4b.includes('詳細モードで保存された記録です'),
    'E4 初期対応者の印がある記録（回答なし）: state.management に initial が無い・面接から再開・toast で案内: ' + JSON.stringify(s4b) + ' ' + t4b);
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
  expect(s4c.step === 2 && !!(await page.$('#ivStage')) && s4c.name === parseRecord(fs.readFileSync(fxV1, 'utf8')).applicant.name && s4c.keys === 6 && s4c.j === null &&
    t4c.includes('旧形式の面接評価（10 項目×5 点）は読み込みません。評価の画面で評価し直してください') &&
    !(await page.$('#legacyScores')) && !(await page.textContent('#stepContent')).includes('旧形式'),
    'E4 v1 の記録（回答なし）はエラーなく面接で開く（旧評価は読み込まず、評価の画面で評価し直す）: ' + JSON.stringify(s4c) + ' ' + t4c);

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
  await goTo(2);
  await ivGo('conditions');
  const ov36i = await overflowX();
  await ivGo('reverse');
  const ov36r = await overflowX();
  await goTo(3);
  const ov36b = await overflowX();
  await goTo(1);
  const ov36c = await overflowX();
  expect(nw36.sw > nw36.cw && nw36.ov <= 1 && ov36i <= 1 && ov36r <= 1 && ov36b <= 1 && ov36c <= 1,
    'E5 390px 幅で横スクロールなし（報告書は紙だけ横スクロール・面接の ① と ⑤・評価・準備も）: ' + JSON.stringify({ nw36, ov36i, ov36r, ov36b, ov36c }));
  await sshot('47-script-narrow.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);

  // =====================================================================
  // E6 報告書を開かずに評価から保存・印刷しても判定が入る・再開先・印刷の経路・総合判断未入力の保存（docs/SPEC-flow.md 6-5・9-3）
  // =====================================================================
  console.log('\n== E6 評価・面接から保存・印刷 ==');
  const names37 = await page.evaluate(() => ({ nav: document.querySelector('.nav-item[data-view="judge"]').textContent.trim(), top: document.getElementById('topTitle').textContent, side: document.getElementById('stepSectionTitle').textContent }));
  expect(names37.nav.endsWith('報告書の作成') && names37.top === '面接チェックリスト報告' && names37.side === '手順', 'E6 画面名は 報告書の作成／面接チェックリスト報告／手順: ' + JSON.stringify(names37));
  await page.click('#btnNew');
  await wait(200);
  await fillScript({ name: '台本 次郎', age: 22, gender: '男性', category: 'フリーター', interviewer: '笹川 晴央' });
  await setCl('header.posting', 'regular');
  await page.click('[data-action="script-next"]');
  await wait(400);
  // 「説明した」: 求人が通常なら短期のみの項目は出さず、対象にもしない（docs/SPEC-flow.md 3-4）
  const li37 = await page.$$eval('#ivStage .iv-say-list li', els => els.map(e => e.dataset.item));
  await said('conditions');
  const ex37 = await st(() => { const v = window.RecruitApp.state.checklist.values; return { fare: v.ex_fare === true, hours: v.ex_hours === true, contract: v.ex_contract === true, sw: v.ex_switch === true,
    t: window.__lbl(document.querySelector('[data-action="iv-said"][data-sec="conditions"]')) }; });
  expect(JSON.stringify(li37) === JSON.stringify(['ex_fare', 'ex_hours']) && ex37.fare && ex37.hours && !ex37.contract && !ex37.sw && ex37.t === '[check] 説明した',
    'E6 求人が通常なら ① の話すことは 2 項目（短期のみは出さない）・「説明した」で 2 つとも済み（短期のみは付かない）・「✓ 説明した」: ' + JSON.stringify({ li37, ex37 }));
  await said('conditions');
  // 短期で 4 つとも説明 → 求人を通常に直す → ① は「✓ 説明した」のまま・押すと短期のみも含めて全部外す
  //   回答（必須条件）を入れてから準備へ: 主ボタンは「面接に戻る →」（回答が無ければ「面接を始める →」のまま。docs/SPEC-flow.md 15 章・E19 (1)）
  await setCl('values.must_weekly', 'match');
  await goTo(1);
  const back37 = await lblOf('#saNext');
  await setCl('header.posting', 'short');
  await goTo(2);
  await said('conditions');
  const sh37 = await st(() => ['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch'].map(id => window.RecruitApp.state.checklist.values[id] === true));
  await goTo(1);
  await setCl('header.posting', 'regular');
  await goTo(2);
  const re37 = await lblOf('[data-action="iv-said"][data-sec="conditions"]');
  await said('conditions');
  expect(back37 === '面接に戻る [arrow-right]' && sh37.every(Boolean) && re37 === '[check] 説明した' && await st(() => !['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch'].some(id => window.RecruitApp.state.checklist.values[id] === true)),
    'E6 面接を始めた後の準備は「面接に戻る →」・短期で付けた短期のみの説明も、通常求人の「✓ 説明した」を押すと全部外れる: ' + JSON.stringify({ back37, sh37, re37 }));
  await rateAll('good');
  expect(await step() === 3 && await st(() => window.RecruitApp.state.judgment) === null, 'E6 評価では未判定（state.judgment なし。結果カードは表示のためだけに計算）');
  // 1. 評価から保存（報告書は開かない）
  const saved37 = await saveRecord('script-step2-save.html');
  const r37 = saved37.rec;
  expect(await step() === 3 && r37.step === 3 && !!r37.judgment && r37.judgment.mode === 'script' && r37.judgment.result === 'recommend',
    'E6 評価から保存しても判定（mode=script・採用推奨）を記録する（報告書は開かない）: ' + JSON.stringify(r37.judgment && [r37.judgment.mode, r37.judgment.result, r37.step]));
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
  // 2. 保存後に報告書を開いても同じ判定
  await judge();
  const j37 = await judgment();
  expect(await step() === 4 && j37.result === r37.judgment.result && j37.title === r37.judgment.title && (await txtIn(page, '#appPaper .cl-tile-res')).includes(r37.judgment.title),
    'E6 保存後に報告書を開いても同じ判定: ' + JSON.stringify([j37.result, r37.judgment.result]));
  // 3. 評価で保存した記録は読み込むと評価から再開する（判定が入っていても報告書に飛ばない）
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved37.file);
  await wait(500);
  expect(await step() === 3 && !!(await page.$('#clOverall')) && await st(() => window.RecruitApp.state.applicant.name) === '台本 次郎' && await st(() => window.RecruitApp.state.judgment) === null,
    'E6 評価で保存した記録は読み込むと評価から再開');
  // 3-2. 面接の ② で保存した記録は読み込むと面接の ② から再開する
  await navStep(2);
  await ivGo('continuity');
  const saved37i = await saveRecord('script-interview-save.html');
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', saved37i.file);
  await wait(500);
  expect(saved37i.rec.step === 2 && saved37i.rec.checklist.timing.stage === 'continuity' && await step() === 2 && await st(() => document.getElementById('ivStage').dataset.sec) === 'continuity' &&
    await st(() => document.querySelector('#ivChips .iv-chip.is-current').dataset.sec) === 'continuity',
    'E6 面接の ② で保存した記録（step 2・timing.stage）は読み込むと面接の ② から再開: ' + JSON.stringify({ step: saved37i.rec.step, stage: saved37i.rec.checklist.timing.stage }));
  await navStep(3);
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
  // 4-3. 面接の画面からトップバー 🖨（今の段階の秒を記録に入れてから印刷。タイマーは止めない）
  await setCl('overall', 'hire');
  await wait(100);
  await goTo(2);
  await page.click('#btnPrint');
  await wait(150);
  const ip37 = await prState();
  expect(ip37.calls.length === 2 && ip37.calls[1].cls && ip37.calls[1].res.includes('採用推奨') && await step() === 2 && !!(await page.$('#ivStage')),
    'E6 面接の画面からもトップバー 🖨 で A4 報告（判定を入れて）を印刷・面接の画面のまま: ' + JSON.stringify(ip37.calls));
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await wait(100);
  // 5. 総合判断が未入力のまま保存すると警告（保存は止めない）
  await goTo(3);
  await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hire"]');
  await wait(100);
  const saved37b = await saveRecord('script-overall-missing.html');
  const t37 = await toastText();
  expect(t37.includes('総合判断が未入力です') && saved37b.rec.checklist.overall === '' && saved37b.rec.judgment && saved37b.rec.judgment.result === 'review',
    'E6 総合判断が未入力のまま保存すると toast に「総合判断が未入力です」（保存はする）: ' + t37);
  // 回答が無くても（準備だけで保存）総合判断の警告を出す
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
  await navStep(2);
  const hd38 = await page.textContent('#ivWho');
  const iv38 = await page.textContent('#stepContent');
  expect(await step() === 2 && hd38.includes('短期求人') && !['短期希望', '消極属性', '朝～12時のみ'].some(t => hd38.includes(t) || iv38.includes(t)), 'E7 面接の応募者の 1 行（#ivWho）・画面に消極属性を出さない: ' + hd38);
  await navStep(3);
  const ev38 = await page.textContent('#stepContent');
  expect(await step() === 3 && !['短期希望', '消極属性', '朝～12時のみ'].some(t => ev38.includes(t)), 'E7 評価の画面にも消極属性を出さない');
  await navStep(1);
  expect(!(await page.$('#saNegatives, [data-cl^="header.negatives"]')) && !(await page.textContent('#scriptApplicantCard')).includes('短期希望'), 'E7 準備にも消極属性の入力・表示なし');
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
  // 1. 標準の記録（E3 の再出力ファイル: 採用・押印あり）をアプリで開く → 報告書の紙プレビュー
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#btnNew');
  await wait(200);
  await page.setInputFiles('#fileInput', file34b);
  await wait(500);
  const QS39 = ['歌舞伎町ですので', '前のアルバイトの期間と退職理由は', '忙しいときこそ心掛けたいことは', '何か気になる点はありますか', 'シフト提出は木曜23時', '多忙・立ち仕事・汚物清掃の可否', '「大丈夫です」のみ連呼', '条件一致：2へ', '採用を検討できる人には不安解消の時間を取る'];
  // 紙プレビューの計測（page.evaluate に渡す関数。引数 [紙のセレクタ, 出てはいけない文言]）
  //   h は内容の高さ（.cl-measure を付けて用紙いっぱいに伸ばさない状態。docs/SPEC-a4.md 12 章）。用紙では内寸いっぱいに伸びる
  const paperOf = ([sel, qs]) => {
    const sh = document.querySelector(sel + ' .cl-sheet'), t = sh.textContent, top = sh.getBoundingClientRect().top, z = sh.getBoundingClientRect().width / sh.offsetWidth || 1;
    sh.classList.add('cl-measure'); const nat = sh.getBoundingClientRect().height; sh.classList.remove('cl-measure');
    return { qs: qs.filter(q => t.includes(q)), res: Math.round((document.querySelector(sel + ' .cl-tile-res').getBoundingClientRect().top - top) / z),
      rows: sh.querySelectorAll('.cl-rt tr[data-cl-item]').length, must: sh.querySelectorAll('.cl-mtab tr[data-cl-item]').length, h: Math.round(nat / z), cls: sh.className,
      order: Array.from(sh.children).map(el => el.className.split(' ').slice(0, 2).join('.')), res2: (sh.querySelector('.cl-tile-res .cl-tile-v') || {}).textContent };
  };
  const pv39 = await page.evaluate(paperOf, ['#appPaper', QS39]);
  expect(await step() === 4 && pv39.qs.length === 0 && pv39.res >= 0 && pv39.res <= 160 && pv39.rows === 6 && pv39.must === 2 && pv39.res2 === '採用推奨' && !pv39.cls.includes('cl-compact') && pv39.h <= 1052,
    'E8 報告書の紙プレビュー: 質問文・説明文・補足・注記なし・結果バッジは紙の上端から 160px 以内・確認点 6 行・必須条件 2 行（標準のサンプルは .cl-compact なし）: ' + JSON.stringify(Object.assign({}, pv39, { order: undefined })));
  expect(JSON.stringify(pv39.order) === JSON.stringify(['cl-sheet-head', 'cl-judge', 'cl-cols', 'cl-cols.cl-cols-eval', 'cl-blk.cl-blk-notes', 'cl-exline', 'cl-stamps']),
    'E8 紙の並び: 見出し → 結果ストリップ → 必須条件｜勤務条件の確認 → 確認点｜人物像 → 面接メモ → 説明・連絡 → 押印行: ' + JSON.stringify(pv39.order));
  // 2. 1280px・1366px・1440px で横スクロールなし（アプリの報告書の紙・保存 HTML の用紙。保存 HTML は 1280px 以上なら縮小しない）。
  //   アプリの報告書は紙を縮小しない（本文 9.5px のまま）。報告書は 920px の 1 列（.page.reading）なので、右サマリーはどの幅でも紙の下（.page.reading .summary。docs/DESIGN.md 4-5）
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
      return { zoom: z, body: px('.cl-rt-lbl'), label: px('dl.cl-kv dt'), res: px('.cl-tile-res .cl-tile-v'),
        below: document.getElementById('summaryPanel').getBoundingClientRect().top >= p.getBoundingClientRect().bottom };
    });
    const rep = await rp39.evaluate(() => ({ doc: document.documentElement.scrollWidth - window.innerWidth, wrap: 0, zoom: getComputedStyle(document.documentElement).getPropertyValue('--a4-zoom').trim() }));
    wide39.push({ w, app: await ov(page, '#appPaperWrap'), rep, res: (await page.evaluate(paperOf, ['#appPaper', QS39])).res, fz });
    if (w === 1280) await sshot('49-script-step3-1280.png');
  }
  expect(wide39.every(x => x.app.doc <= 1 && x.app.wrap <= 1 && x.rep.doc <= 1 && x.rep.zoom === '' && x.res <= 160), 'E8 1280px・1366px・1440px で横スクロールなし（アプリの報告書の紙・保存 HTML の用紙は縮小しない）: ' + JSON.stringify(wide39.map(x => ({ w: x.w, app: x.app, rep: x.rep, res: x.res }))));
  //   （2026-10-18 から報告書は 920 の 1 列〔.page.reading〕なので、右サマリーはどの幅でも紙の下。docs/DESIGN.md 4-5）
  expect(wide39.every(x => x.fz.zoom === 1 && x.fz.body >= 9.5 && x.fz.label >= 8.5 && x.fz.res >= 14 && x.fz.below),
    'E8 アプリの報告書の紙は 1280px・1366px・1440px でも等倍（本文 9.5px・ラベル 8.5px・結果 14px）。右サマリーは紙の横に並べず紙の下: ' + JSON.stringify(wide39.map(x => Object.assign({ w: x.w }, x.fz))));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await rp39.setViewportSize({ width: 1440, height: 1000 });
  await wait(200);
  const rv39 = await rp39.evaluate(paperOf, ['#a4', QS39]);
  expect(rv39.qs.length === 0 && rv39.res <= 160 && rv39.rows === 6 && rv39.res2 === '採用推奨' && !!(await rp39.$('#a4 .cl-decision svg.verdict-stamp')) && JSON.stringify(rv39.order) === JSON.stringify(pv39.order),
    'E8 保存 HTML の用紙も同じ 1 ページの要約（質問文なし・結果が上部・最終合否の採用スタンプ・同じ並び）: ' + JSON.stringify(Object.assign({}, rv39, { order: undefined })));
  await rp39.close();
  // 3. 重いサンプル（docs/SPEC-flow.md 9-3）: 面接の質問ごとのメモ 13 個・確認点のメモ・準備のメモに 300 字・面接所見 1,500 字 → .cl-compact で 1 ページ
  //   質問ごとの行が 13 行になるので、質問の回答は 1 行（.cl-compact-q1）に詰め、残りの空きまで面接所見を広げる（実測。2026-10-16）
  await page.click('#btnNew');
  await wait(200);
  await fillScript({ name: '台本 四郎', age: 21, gender: '男性', category: '大学3年生', posting: 'short', taxi: '可・2,500円', interviewer: '笹川 晴央', notes: L(300) });
  await page.click('[data-action="script-next"]');
  await wait(400);
  await fillMemos(L(300));
  await page.fill('textarea[data-note="interview"]', L(1500));
  for (const sec of ['conditions', 'continuity', 'job', 'teamwork']) await said(sec);
  await said('reverse', 'notify');
  await rateAll('good');
  await judge();
  const hv39 = await page.evaluate(paperOf, ['#appPaper', QS39]);
  const qn39 = await st(() => Object.keys(window.RecruitApp.state.checklist.notes).filter(k => k.indexOf('q_') === 0).length);
  expect(await step() === 4 && qn39 === 13 && hv39.cls.includes('cl-compact') && hv39.h <= 1052 && hv39.res <= 160 && hv39.rows === 6 && hv39.qs.length === 0,
    'E8 重いサンプル（質問ごとのメモ 13 個・全メモ 300 字・面接所見 1,500 字）: 紙プレビューに .cl-compact・押印行込みで上限（1052px）以内・結果は上部: ' + JSON.stringify(Object.assign({ qn39 }, hv39, { order: undefined })));
  const nm39 = await page.evaluate(() => {
    const sh = document.querySelector('#appPaper .cl-sheet'), q = sh.querySelector('.cl-nm-q .cl-nm-v'), iv = sh.querySelector('.cl-nm-iv .cl-nm-v'), ref = sh.querySelector('.cl-nm-ref');
    const cq = getComputedStyle(q), ci = getComputedStyle(iv);
    const lw = sh.querySelector('.cl-nm-lines');
    return { qClamp: cq.webkitLineClamp, qh: Math.round(q.getBoundingClientRect().height), qlh: parseFloat(cq.lineHeight),
      ivClamp: ci.webkitLineClamp, ivh: Math.round(iv.getBoundingClientRect().height), ivlh: parseFloat(ci.lineHeight), sheetH: Math.round(sh.getBoundingClientRect().height),
      ivCut: iv.classList.contains('cl-cut'), linesMm: +(lw.getBoundingClientRect().height / (96 / 25.4)).toFixed(2), q1: sh.classList.contains('cl-compact-q1'),
      ref: ref && ref.getClientRects().length ? ref.innerText.trim() : '', cut: sh.classList.contains('cl-nm-cut'),
      rows: Array.from(sh.querySelectorAll('.cl-nm-row')).map(r => r.dataset.clNote || r.className.replace('cl-nm-row ', '')),
      //   名前は 1 行（見えている高さ。長い名前は 1 行で「…」）
      keys: Array.from(sh.querySelectorAll('.cl-nm-q .cl-nm-k')).map(k => ({ t: k.textContent, h: Math.round(k.getBoundingClientRect().height), lh: parseFloat(getComputedStyle(k).lineHeight) })) };
  });
  expect(String(nm39.qClamp) === '1' && nm39.q1 && nm39.qh <= nm39.qlh * 1.5,
    'E8 質問ごとの行が 13 行なので .cl-compact-q1 で質問の回答は 1 行: ' + JSON.stringify({ qClamp: nm39.qClamp, qh: nm39.qh, qlh: nm39.qlh, q1: nm39.q1 }));
  // 面接所見は .cl-compact の 10 行で「…」になるが、面接メモ・所見の枠に罫線の空きが残るので、その分まで行数を広げる（docs/SPEC-a4.md 12 章 F5。
  //   まだ切れているので罫線の空きは 1 行分〔7.5mm〕未満）
  expect(Number(nm39.ivClamp) > 10 && nm39.ivh >= nm39.ivlh * 10.5 && nm39.ivCut && nm39.linesMm < 7 && hv39.h <= 1052,
    'E8 面接所見は罫線の空きまで広げる（10 行より多い・まだ切れているので罫線の空きは 7mm 未満・上限 1052px 以内）: ' + JSON.stringify({ ivClamp: nm39.ivClamp, ivh: nm39.ivh, ivlh: nm39.ivlh, ivCut: nm39.ivCut, linesMm: nm39.linesMm, sheetH: nm39.sheetH }));
  const QIDS39 = ['q_term', 'q_two_months', 'q_family', 'q_prev_job', 'q_cant_3days', 'q_sudden_absence', 'q_value', 'q_failure', 'q_unsure', 'q_feedback', 'q_unknown', 'q_busy_mind', 'q_concerns'];
  expect(JSON.stringify(nm39.rows) === JSON.stringify(QIDS39.concat(['cl-nm-b cl-nm-rt', 'cl-nm-iv', 'cl-nm-memo'])) && nm39.keys.length === 13 && nm39.keys.every(k => k.h <= k.lh * 1.5) &&
    nm39.keys[0].t === '①短期／長期の希望' && nm39.keys[3].t === '②前のバイトの期間・退職理由' && nm39.keys[12].t === '⑤気になる点（逆質問）',
    'E8 面接メモは質問ごとの行（段階の順・キー「①短い名前」・1 行）→ 確認点のメモ → 面接所見 → メモ: ' + JSON.stringify({ rows: nm39.rows.length, keys: nm39.keys.map(k => k.t) }));
  // 報告書の紙はクリックしても窓を出さないので「保存した HTML の画面で」（アプリの印刷・保存 HTML は「画面で」。下の PDF で確かめる）
  const cut39 = await page.evaluate(() => document.querySelectorAll('#appPaper .cl-cut').length);
  await page.click('#appPaper .cl-nm-iv .cl-nm-v');
  await wait(100);
  const pop39 = !!(await page.$('.pop,#a4Pop,[role="dialog"]:not([hidden])'));
  expect(nm39.cut && nm39.ref === '「…」で切れたメモは、保存した HTML の画面でクリックすると全文を表示します' && cut39 >= 1 && !pop39,
    'E8 「…」で切れたメモがあれば案内 1 行（報告書の紙は「保存した HTML の画面でクリックすると全文」。報告書の紙のクリックでは窓は出ない）: ' + JSON.stringify({ cut: nm39.cut, ref: nm39.ref, cut39, pop39 }));
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
    R.checklistItems(prof.checklist, 'rating').forEach(x => { cl.values[x.item.id] = o.rate || 'good'; });
    R.checklistItems(prof.checklist, 'must').forEach(x => { cl.values[x.item.id] = 'match'; });
    R.checklistItems(prof.checklist, 'explain').forEach(x => { cl.values[x.item.id] = true; });
    cl.overall = o.overall || 'hire';
    // 人物像（o.ps。既定は全部 4 点＝規則に掛からない。null で未入力のまま。配列なら台本順の点）
    const psv = o.ps === undefined ? 4 : o.ps;
    if (psv != null && prof.checklist.persona) prof.checklist.persona.items.forEach((it, i) => { const v = Array.isArray(psv) ? psv[i] : psv; if (v) cl.persona[it.id] = v; });
    cl.notes = {};
    // o.qRaw・o.ivTail: そのままの文字列（折り返せない幅広の書記素など。E16）
    if (o.q || o.qRaw) R.checklistItems(prof.checklist, 'question').forEach(x => { cl.notes[x.block.id] = o.qRaw != null ? o.qRaw : Lx(o.q); });
    if (o.rn) R.checklistItems(prof.checklist, 'rating').forEach(x => { cl.notes[x.item.id] = Lx(o.rn); });   // 確認点のメモ
    //   o.qi: 質問ごとのメモ（2026-10-16 の形 cl.notes[質問 id]）・o.tm: 面接の時間（cl.timing。docs/SPEC-flow.md 6-2）
    if (o.qi) R.checklistItems(prof.checklist, 'question').forEach(x => { cl.notes[x.item.id] = Lx(o.qi); });
    if (o.tm) cl.timing = o.tm;
    const applicant = { name: '台本 五郎', age: '21', gender: '男性', category: '大学3年生', reviewerNotes: o.memo ? Lx(o.memo) : '' };
    // o.stamp: 全欄に押印済み／o.dec: 最終合否（'hire'・'reject'）
    const who = { name: '笹川 晴央', short: '笹川', title: '副支配人', date: '2026/10/10', at: '2026-10-10T00:00:00.000Z' };
    const management = {};
    if (o.stamp) prof.management.fields.forEach(f => { management[f.id] = Object.assign({}, who); });
    const decision = o.dec ? { result: o.dec, label: o.dec === 'hire' ? '採用' : '不採用', date: who.date, at: who.at, by: { name: who.name, short: who.short, title: who.title } } : null;
    const rec = { kind: 'recruit-applicant-record', schemaVersion: 2, step: 4, savedAt: new Date().toISOString(), profile: { theaterName: prof.meta.theaterName }, applicant, checklist: cl, checklistDef: prof.checklist,
      interviewNotes: (o.iv ? Lx(o.iv) : '') + (o.ivTail || ''), management, decision, judgment: R.evaluateScript(applicant, cl, prof, {}) };
    return S.generateReportHTML(rec, prof);
  };
  const fit39 = [];
  //   zoomNotes: 確認点 +46 件＋長いメモ（縮小の段階でも、切れたメモを縮小後の空きまで広げる。12 章 F5）
  //     縮小後の空きは zoom の刻みしだいで 1 行に満たないことがある。確認点のメモが面接メモ・所見の枠に移った（docs/SPEC-persona.md D11）ので、
  //     空きが 1 行を超える件数（+46）と、.cl-compact-2（4 行）で確実に切れる面接所見（600 字）に選び直した（以前は +40 件・400 字）
  //   qi: 質問ごとのメモ 13 個（300 字）・面接時間（40 分）の新しい形の重い記録
  const TM39 = { startedAt: '2026-10-10T00:00:00.000Z', endedAt: '2026-10-10T00:41:00.000Z', stage: 'reverse', perStage: { conditions: 720, continuity: 200, job: 600, teamwork: 480, reverse: 400 } };
  for (const c of [{ key: 'iv4000', iv: 4000 }, { key: 'stamps4', fields: 4, q: 300, memo: 500, iv: 1600 }, { key: 'zoom', extra: 65 }, { key: 'zoomNotes', extra: 46, q: 100, memo: 100, iv: 600, rn: 50 },
    { key: 'qi', qi: 300, rn: 300, memo: 300, iv: 1500, tm: TM39 }]) {
    const f39 = path.join(OUT, 'script-report-fit-' + c.key + '.html');
    fs.writeFileSync(f39, await page.evaluate(mk39, c));
    const rp = await newReportPage(rp39Err);
    //   開いたときの計測（clFitSheet。始めに用紙へ .cl-roomy を付ける）の回数を数える
    await rp.addInitScript(() => {
      window.__fitN = 0;
      const add = DOMTokenList.prototype.add;
      DOMTokenList.prototype.add = function () { if (arguments[0] === 'cl-roomy' && this.contains('cl-sheet')) window.__fitN++; return add.apply(this, arguments); };
    });
    await rp.goto('file://' + f39);
    await rp.waitForTimeout(300);
    await rp.evaluate(() => document.fonts.ready.then(() => 0));
    await rp.waitForTimeout(100);
    const fitN = await rp.evaluate(() => window.__fitN);
    await rp.mouse.move(0, 0);
    const m = await rp.evaluate(() => {
      const a4 = document.getElementById('a4'), sh = a4.querySelector('.cl-sheet'), st = a4.querySelector('.cl-stamps'), top = a4.getBoundingClientRect().top;
      const mm = 96 / 25.4;
      sh.classList.add('cl-measure'); const nat = sh.getBoundingClientRect().height; sh.classList.remove('cl-measure');
      // 縦に切れたまま残ったメモ（面接メモ・所見の枠）と、その縮小後の 1 行の高さ
      const z = parseFloat(sh.style.zoom) || 1;
      const cutV = Array.from(sh.querySelectorAll('.cl-nm-v')).filter(e => e.getClientRects().length && e.scrollHeight > e.clientHeight + 1);
      const iv = sh.querySelector('.cl-nm-iv .cl-nm-v');
      return { cls: sh.className.replace('cl-sheet cl-mode-sheet', '').trim(), zoom: sh.style.zoom, h: Math.round(nat), boxes: a4.querySelectorAll('.cl-stamps .stamp-box').length,
        stampsBottom: st ? Math.round(st.getBoundingClientRect().bottom - top) : -1, innerBottom: Math.round((8 + 281) * mm),
        room: +(1052 - nat).toFixed(1), cutLineH: cutV.length ? +Math.min.apply(null, cutV.map(e => parseFloat(getComputedStyle(e).lineHeight) * z)).toFixed(1) : 0,
        ivInline: iv ? iv.style.getPropertyValue('-webkit-line-clamp') : '' };
    });
    m.fitN = fitN;
    const pdf = path.join(OUT, 'script-report-fit-' + c.key + '.pdf');
    await rp.pdf({ path: pdf, format: 'A4', preferCSSPageSize: true, printBackground: true });
    const t = pdfTextOf(pdf);
    fit39.push(Object.assign({ key: c.key, pages: pdfPagesOf(pdf), ref: t === null ? null : t.includes('「…」で切れたメモは、画面でクリックすると全文を表示します'), name: t === null ? null : t.includes('台本五郎'),
      tm: t === null ? null : t.includes('面接時間40分（目安41分）'), qRows: await rp.evaluate(() => document.querySelectorAll('#a4 .cl-nm-q[data-cl-note]').length) }, m));
    await rp.close();
  }
  const fit39k = (k) => fit39.find(x => x.key === k);
  expect(fit39.every(x => x.pages === -1 || x.pages === 1) && fit39.every(x => x.name !== false) && fit39.every(x => x.h <= 1052 && x.stampsBottom > 0 && x.stampsBottom <= x.innerBottom && x.stampsBottom >= x.innerBottom - 8),
    'E8 保存 HTML の用紙は境界の記録でも押印行込みの内容が 1052px 以内・押印行の下端は用紙の内寸の下端（2mm 以内。縮小しても）・そのまま印刷して 1 ページ（面接所見 4,000 字・押印欄 4 件・確認点 +65 件）: ' + JSON.stringify(fit39));
  expect(/\bcl-compact\b/.test(fit39k('iv4000').cls) && !fit39k('iv4000').cls.includes('cl-compact-2') && fit39k('iv4000').ref !== false,
    'E8 面接所見 4,000 字: .cl-compact で所見が切れても「…」の案内 1 行（画面でクリックすると全文）: ' + JSON.stringify(fit39k('iv4000')));
  expect(fit39k('stamps4').boxes === 4 && fit39k('stamps4').h <= 1052, 'E8 押印欄 4 件（押印行 2 段）も押印行込みの上限（1052px）で詰める: ' + JSON.stringify(fit39k('stamps4')));
  const z39 = fit39k('zoom');
  expect(z39.cls.includes('cl-compact-2') && parseFloat(z39.zoom) > 0 && parseFloat(z39.zoom) < 1 && z39.h <= 1052, 'E8 確認点 +65 件: 縮小後の高さを測り直して上限（1052px）以内: ' + JSON.stringify(z39));
  const zn39 = fit39k('zoomNotes');
  expect(zn39.cls.includes('cl-compact-2') && parseFloat(zn39.zoom) < 1 && zn39.ivInline !== '' && zn39.h <= 1052 && (zn39.cutLineH === 0 || zn39.room < zn39.cutLineH),
    'E8 縮小の段階（確認点 +46 件＋長いメモ）でも、切れたメモを縮小後の空きまで広げる（面接所見の行数を広げる・切れたメモが残るなら空きは 1 行未満・上限 1052px 以内）: ' + JSON.stringify(zn39));
  const qi39 = fit39k('qi');
  expect(qi39.qRows === 13 && qi39.tm !== false && qi39.h <= 1052 && (qi39.pages === -1 || qi39.pages === 1) && fit39.filter(x => x.key !== 'qi').every(x => x.qRows === 0 && x.tm !== true),
    'E8 質問ごとのメモ 13 個・面接時間ありの重い記録も保存 HTML の用紙 1 ページ（質問ごとの行 13・「面接時間 40分（目安 41分）」）。旧い形の記録は質問ごとの行・面接時間なし: ' + JSON.stringify(qi39));
  expect(fit39.every(x => x.fitN === 1),
    'E8 保存 HTML を開いたときの計測は 1 回（load・フォントの読み込み後に同じ計測を繰り返さない）: ' + JSON.stringify(fit39.map(x => [x.key, x.fitN])));
  //   アプリで読み込んだときも 報告書の紙の計測は 1 回（読み込みで 報告書を 2 回描かない）
  await page.evaluate(() => { const S = window.RecruitStorage; window.__fitOrig = S.fitChecklistSheet; window.__fitApp = 0; S.fitChecklistSheet = function () { window.__fitApp++; return window.__fitOrig.apply(this, arguments); }; });
  await page.setInputFiles('#fileInput', path.join(OUT, 'script-report-fit-zoom.html'));
  await wait(600);
  const app39n = await page.evaluate(() => { const n = window.__fitApp; window.RecruitStorage.fitChecklistSheet = window.__fitOrig; return { n: n, step: window.RecruitApp.state.step, paper: !!document.querySelector('#appPaper .cl-sheet') }; });
  expect(app39n.step === 4 && app39n.paper && app39n.n === 1, 'E8 アプリで保存 HTML を読み込むと 報告書の紙の計測は 1 回: ' + JSON.stringify(app39n));
  //   最終合否の担当者名が改行できない長い文字列でも、最終合否欄は結果ストリップの 36% まで（左の 5 枚のタイルを「…」で潰さない・用紙からはみ出さない。docs/SPEC-persona.md D10）。
  //   結果が「上長最終判断要」（7 文字）・人物像のタイルが「未入力 3・1点あり」・確認点のタイルが「○3 △1 ×0 未入力2」でも同じ（タイルは中身の幅より狭くならず、足りなければ最終合否欄が縮む）。
  //   名簿の氏名＋役職 18 文字（「試験 長名美子（エリアマネージャー）」）は、どちらの状態でも最終合否欄で切れない（c0d20ce と同じく収まる）。
  //   人物像のタイルが無い 4 枚（人物像の導入前の記録＝persona: null・設定で人物像を OFF）も同じ（c0d20ce の E8 が確かめていた 4 タイル。最終合否欄の上限 36% と
  //   .cl-judge-main／.cl-decision の flex は 4 タイルにも効く。docs/SPEC-persona.md 11-9 補完 8）: rec4・rev4（persona: null）・off4（OFF）
  const dec39 = await page.evaluate(() => {
    const S = window.RecruitStorage, R = window.RecruitRules;
    const prof = S.normalizeProfile(S.defaults());
    const profOff = JSON.parse(JSON.stringify(prof)); profOff.checklist.persona.enabled = false;
    const applicant = { name: '台本 五郎', age: '21', gender: '男性', category: '大学3年生', reviewerNotes: '' };
    const states = {
      rec: function (cl) {   // 採用推奨のまま（人物像は全部 4 点）
        R.checklistItems(prof.checklist, 'rating').forEach(x => { cl.values[x.item.id] = 'good'; });
        prof.checklist.persona.items.forEach(it => { cl.persona[it.id] = 4; });
        cl.overall = 'hire';
      },
      rev: function (cl) {   // 上長最終判断要（総合判断「保留」）・人物像は一部入力で 1 点あり・確認点は 2 件未入力と △
        R.checklistItems(prof.checklist, 'rating').forEach((x, i) => { if (i < 4) cl.values[x.item.id] = i === 1 ? 'fair' : 'good'; });
        prof.checklist.persona.items.forEach((it, i) => { const v = [1, 4, 0, 3, 0, 0, 4][i]; if (v) cl.persona[it.id] = v; });
        cl.overall = 'hold';
      }
    };
    const out = [];
    //   [記録の種類, 回答の状態, 設定, persona を null にするか]
    for (const [k, base, pf, nul] of [['rec', 'rec', prof, false], ['rev', 'rev', prof, false], ['rec4', 'rec', prof, true], ['rev4', 'rev', prof, true], ['off4', 'rev', profOff, false]]) {
      for (const by of [{ name: '笹川 晴央', title: '' }, { name: '試験 長名美子', title: 'エリアマネージャー' }, { name: 'https://example.com/recruit/abcdefghij0123456789abcdefghij0123456789abcdefghij01', title: '' },
        { name: '笹川' + '\u{1F468}' + '\u200D\u{1F468}'.repeat(60), title: '' }]) {
        const cl = R.emptyChecklist();
        cl.header = { date: '2026-10-10', interviewer: '笹川 晴央', posting: 'short', taxi: '可' };
        R.checklistItems(prof.checklist, 'must').forEach(x => { cl.values[x.item.id] = 'match'; });
        states[base](cl);
        if (nul) cl.persona = null;
        const decision = { result: 'hire', label: '採用', date: '2026.10.10', at: '2026-10-10T00:00:00.000Z', by: { name: by.name, short: '笹川', title: by.title } };
        const rec = { applicant, checklist: cl, checklistDef: pf.checklist, interviewNotes: '', management: {}, decision, judgment: R.evaluateScript(applicant, cl, pf, {}) };
        const host = document.createElement('div'); host.className = 'a4'; host.style.cssText = 'position:absolute;left:0;top:0';
        host.innerHTML = S.checklistSheetHtml(rec, pf, {}); document.body.appendChild(host);
        S.fitChecklistSheet(host.querySelector('.cl-sheet'));
        const padR = host.getBoundingClientRect().right - parseFloat(getComputedStyle(host).paddingRight);
        const d = host.querySelector('.cl-decision').getBoundingClientRect(), row = host.querySelector('.cl-judge-row').getBoundingClientRect();
        const tilesR = Math.max.apply(null, Array.from(host.querySelectorAll('.cl-tile')).map(t => t.getBoundingClientRect().right));
        const byEl = host.querySelector('.cl-dec-by');
        out.push({ k, len: (by.name + (by.title ? '（' + by.title + '）' : '')).length, decW: Math.round(d.width), rowW: Math.round(row.width), rowH: Math.round(row.height), over: Math.round(d.right - padR), gap: Math.round(d.left - tilesR),
          tiles: host.querySelectorAll('.cl-tile').length, hasPs: host.querySelector('.cl-tiles').classList.contains('has-ps'), res: rec.judgment.result, byCut: !!byEl && byEl.scrollWidth > byEl.clientWidth + 1,
          vals: Array.from(host.querySelectorAll('.cl-tile-v,.cl-tile-s')).map(e => e.textContent).join('|'),
          trunc: Array.from(host.querySelectorAll('.cl-tile-v,.cl-tile-s')).filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent) });
        host.remove();
      }
    }
    return out;
  });
  const dec39k = (k, len) => dec39.find(x => x.k === k && x.len === len) || {};
  const dec39five = dec39.filter(x => x.k === 'rec' || x.k === 'rev'), dec39four = dec39.filter(x => /4$/.test(x.k));
  expect(dec39five.length === 8 && dec39five.every(x => x.trunc.length === 0 && x.over <= 0 && x.gap >= 5 && x.decW <= x.rowW * 0.36 + 1 && x.tiles === 5 && x.hasPs && x.rowH === 58 && x.res === (x.k === 'rec' ? 'recommend' : 'review')) &&
    dec39k('rec', 5).decW < dec39k('rec', 80).decW && dec39.filter(x => x.k === 'rev').every(x => x.vals.includes('上長最終判断要') && x.vals.includes('未入力 3・1点あり') && x.vals.includes('○3 △1 ×0 未入力2')) &&
    !dec39k('rec', 18).byCut && !dec39k('rev', 18).byCut,
    'E8 最終合否の担当者名が長くても（名簿の氏名＋役職 18 文字・URL 80 字・ZWJ でつながった絵文字）、最終合否欄は結果ストリップの 36% まで・5 枚のタイルは切れない（結果「上長最終判断要」・人物像「未入力 3・1点あり」・確認点「○3 △1 ×0 未入力2」でも）・用紙からはみ出さない・18 文字の担当者名は切れない: ' + JSON.stringify(dec39five));
  expect(dec39four.length === 12 && dec39four.every(x => x.trunc.length === 0 && x.over <= 0 && x.gap >= 5 && x.decW <= x.rowW * 0.36 + 1 && x.tiles === 4 && !x.hasPs && x.rowH === 58 &&
      x.res === (x.k === 'rec4' ? 'recommend' : 'review') && !x.vals.includes('/35点') && (x.k === 'rec4' || (x.vals.includes('上長最終判断要') && x.vals.includes('○3 △1 ×0 未入力2')))) &&
    dec39k('rec4', 5).decW < dec39k('rec4', 80).decW && ['rec4', 'rev4', 'off4'].every(k => !dec39k(k, 18).byCut),
    'E8 人物像のタイルが無い 4 枚（人物像の導入前の記録・設定で OFF）でも、長い担当者名で最終合否欄は 36% まで・タイルは切れない（結果「上長最終判断要」・確認点「○3 △1 ×0 未入力2」でも）・用紙からはみ出さない・18 文字の担当者名は切れない: ' + JSON.stringify(dec39four));
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
    'E9 アプリの報告書の押印欄は 面接対応者・最終確認 の 2 つ（2 列・初期対応者なし）: ' + JSON.stringify(Object.assign({}, app9, { txt: undefined })));
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
  //   窓の色・文字・フォーカスの輪（docs/DESIGN.md 3-4・4-9。2026-10-19 レビュー修正 B）: 計算されたスタイル（ボタン・題・補足・ラベル・フォーカスのある部品）
  const pop9 = () => rp9.evaluate(() => {
    const p = document.getElementById('a4Pop');
    if (!p) return null;
    const cs = (e) => { if (!e) return null; const s = getComputedStyle(e); return { bg: s.backgroundColor, fg: s.color, bd: s.borderTopColor, fs: s.fontSize, fw: s.fontWeight, ol: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor }; };
    const a = document.activeElement;
    //   部品の枠（2026-10-19 レビュー修正 D）: 担当者の欄と、紺でも押した状態でもないボタン（押していない方の合否・［取消］・［閉じる］）は アプリの入力欄・副ボタンと同じ #848fa1・角丸 8
    const sel = p.querySelector('select'), ss = sel && getComputedStyle(sel);
    return { hire: cs(p.querySelector('.pop-hire')), reject: cs(p.querySelector('.pop-reject')), h: cs(p.querySelector('.pop-h')), sub: cs(p.querySelector('.pop-sub')), ref: cs(p.querySelector('.pop-ref')),
      l: cs(p.querySelector('.pop-l')), act: p.contains(a) ? Object.assign({ cls: a.className }, cs(a)) : null,
      selBd: ss ? ss.borderTopColor + ' ' + ss.borderTopLeftRadius : null, selFocus: sel === a,
      btns: Array.from(p.querySelectorAll('.pop-f button:not(.primary):not(.on)')).map(b => b.textContent + ':' + getComputedStyle(b).borderTopColor + ' ' + getComputedStyle(b).borderTopLeftRadius) };
  });
  //   アプリの報告書の最終合否（.seg-btn.hire／.reject）の押した色・押していない色（同じ部品を写して測る）
  const seg9 = await page.evaluate(() => {
    const out = {};
    for (const [k, r, on] of [['hireOn', 'hire', true], ['rejectOn', 'reject', true], ['off', 'reject', false]]) {
      const real = document.querySelector('#decisionCard [data-action="decide"][data-value="' + r + '"]');
      if (!real) return null;
      const c = real.cloneNode(true);
      c.removeAttribute('data-action'); c.classList.remove('active'); c.setAttribute('aria-pressed', on ? 'true' : 'false');
      real.parentNode.appendChild(c);
      const s = getComputedStyle(c); out[k] = { bg: s.backgroundColor, fg: s.color, bd: s.borderTopColor };
      c.remove();
    }
    return out;
  });
  const pc9a = await pop9();   // 「採用」が押された記録で開いた窓（マウスで開くと担当者の欄にフォーカス）
  await rp9.keyboard.press('Tab');   // → ［採用］
  const pc9t = await pop9();
  await popSel(rp9, SASA);
  await popAct(rp9, 'decide', 'reject');
  const note9 = await rp9.evaluate(() => { const p = document.getElementById('a4Pop'); return p && { note: (p.querySelector('.pop-note') || {}).textContent || '', on: (p.querySelector('.pop-dec.on') || {}).textContent, undo: !!p.querySelector('[data-act="undecide"]') }; });
  await rp9.mouse.move(0, 0);   // ホバーを外して測る
  const pc9b = await pop9();   // 「不採用」を押した後（食い違いの注記で窓は開いたまま）
  expect(!!pre9 && pre9.sel === SASA && pre9.undo && pre9.on === '採用' && !!note9 && note9.note === '※ アプリの判定「採用推奨」と異なる最終合否です（記録はそのまま残ります）。' && note9.on === '不採用' && note9.undo,
    'E9 窓の担当者は最終確認の押印者を初期選択・押された合否のボタンが on・不採用×採用推奨は窓を開いたまま注記: ' + JSON.stringify({ pre9, note9 }));
  const ink9 = ['rgb(200, 35, 44)', 'rgb(31, 78, 140)'];   // スタンプのインク（朱 #c8232c・藍 #1f4e8c）
  expect(!!seg9 && !!pc9a && !!pc9b && pc9a.hire.bg === seg9.hireOn.bg && pc9a.hire.fg === seg9.hireOn.fg && pc9b.reject.bg === seg9.rejectOn.bg && pc9b.reject.fg === seg9.rejectOn.fg &&
    [pc9a.reject, pc9b.hire].every(x => x.bg === seg9.off.bg && x.fg === seg9.off.fg && x.bd === seg9.off.bd) &&
    ![pc9a.hire, pc9a.reject, pc9b.hire, pc9b.reject].some(x => ink9.includes(x.bg) || ink9.includes(x.fg) || ink9.includes(x.bd)),
    'E9 保存 HTML の最終合否の窓の［採用］［不採用］はアプリの報告書のセグメントと同じ色（押した採用＝緑・押した不採用＝赤の塗り・押していない方は中立。スタンプのインクの朱・藍は使わない）: ' +
    JSON.stringify({ seg9, a: pc9a && [pc9a.hire, pc9a.reject], b: pc9b && [pc9b.hire, pc9b.reject] }));
  expect(!!pc9a && pc9a.h.fs === '13px' && pc9a.h.fw === '700' && pc9a.sub.fs === '12px' && pc9a.ref.fs === '12px' && pc9a.l.fs === '12px' && pc9a.l.fw === '700' &&
    !!pc9a.act && pc9a.act.cls === 'pop-sel' && pc9a.act.ol === 'solid 2px rgb(59, 87, 145)' && !!pc9t && !!pc9t.act && /pop-hire/.test(pc9t.act.cls) && pc9t.act.ol === 'solid 2px rgb(59, 87, 145)',
    'E9 保存 HTML の窓の文字はアプリの段階（題 13/700・補足とラベル 12）・フォーカスの輪は 2px の紺 #3b5791（開いた窓の担当者の欄・Tab で移った［採用］。ブラウザ既定の黒い輪にしない）: ' +
    JSON.stringify({ h: pc9a && pc9a.h, sub: pc9a && pc9a.sub, l: pc9a && pc9a.l, act: pc9a && pc9a.act, tab: pc9t && pc9t.act }));
  //   部品の枠とホバー（docs/DESIGN.md 4-9。2026-10-19 レビュー修正 D）: フォーカスの無い担当者の欄（Tab で［採用］へ移った後）は枠 #848fa1・角丸 8、
  //   押していない合否・［取消］・［閉じる］の枠も #848fa1・角丸 8（1 行の副ボタンを 1 つの見た目に）。［閉じる］のホバーはアプリの副ボタンと同じ淡い灰 #eef1f5
  await rp9.hover('#a4Pop [data-act="close"]');
  const hov9 = await rp9.$eval('#a4Pop [data-act="close"]', b => getComputedStyle(b).backgroundColor);
  await rp9.mouse.move(0, 0);
  const CTL9 = 'rgb(132, 143, 161) 8px';
  expect(!!pc9t && !pc9t.selFocus && pc9t.selBd === CTL9 && !!pc9a && !!pc9b && pc9a.btns.length === 3 && pc9b.btns.length === 3 &&
    pc9a.btns.concat(pc9b.btns).every(x => x.endsWith(':' + CTL9)) && hov9 === 'rgb(238, 241, 245)',
    'E9 保存 HTML の窓の担当者の欄と副ボタン（押していない合否・取消・閉じる）の枠は #848fa1・角丸 8（地に 3:1。#c7d0db にしない）・［閉じる］のホバーは #eef1f5: ' +
    JSON.stringify({ sel: pc9t && pc9t.selBd, a: pc9a && pc9a.btns, b: pc9b && pc9b.btns, hov9 }));
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
  // アプリの報告書の 390px
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
    /^management\.fields\[\d+\]\.(label|hint)$/, /^management\.(managers|allowFreeName)$/, /^management\.decision\.(enabled|label|hireLabel|rejectLabel|hint|stampField|autoStampFinal|filenameSuffix)$/,
    /^checklist\.persona\.(enabled|title|items|keepPct|rejectBelowPct|onePointResult|unscoredResult)$/
  ];
  const badBind10 = set10.binds.filter(b => !ALLOW.some(re => re.test(b)));
  const dup10 = set10.binds.filter((b, i) => set10.binds.indexOf(b) !== i);
  expect(set10.binds.length > 50 && !badBind10.length && !dup10.length, 'E10 data-bind は許可リストだけ・重複なし（' + set10.binds.length + ' 件）: ' + JSON.stringify({ bad: badBind10, dup: dup10 }));
  // 「詳細」表示（保存 HTML）は 2026-10-14 に削除（docs/SPEC-a4.md）。その表示だけに効いた「質問文も載せる」の行も無い
  const words10 = ['詳細モード', '2軸', '2 軸', '貢献度', '留意点', '初期対応者', '運用モード', '申し送り', '自動表示', 'Step3', 'Step4', '応募情報から', '旧形式', '「詳細」', '質問文も載せる'].filter(w => set10.txt.includes(w));
  expect(!words10.length, 'E10 設定画面に削除した機能の文言が無い: ' + words10.join(','));
  // 最終承認のパスワード（2026-10-14 追加。公開版はロックなしなので［設定する］だけ。docs/SPEC-a4.md 11 章）
  expect(JSON.stringify(set10.actions) === JSON.stringify(['cl-block-add', 'cl-block-del', 'cl-block-down', 'cl-block-up', 'cl-default', 'cl-item-add', 'cl-item-del', 'cl-item-down', 'cl-item-up', 'cl-sec-add', 'cl-sec-del', 'cl-sec-down', 'cl-sec-up', 'discard', 'export', 'import', 'lock-change', 'reset', 'save']),
    'E10 data-action は台本の編集・保存／破棄／書き出し／読み込み／初期化・最終承認のパスワードの設定だけ: ' + set10.actions.join(','));
  const txt10 = await page.evaluate(() => ({ cl: document.getElementById('s-checklist').textContent, mgmt: document.getElementById('s-mgmt').textContent, io: document.getElementById('s-io').textContent,
    band: !!document.querySelector('#clBandInputs [data-bind="evaluation.thresholds.recommendPct"]') && !!document.getElementById('clCapsScriptHint') }));
  expect(txt10.cl.includes('説明（「評価」に表示）') && txt10.cl.includes('「面接」では「不一致のとき案内する段階」へ進んで面接を終えるよう案内します') && txt10.band &&
    txt10.mgmt.includes('保存ファイル（HTML）と「報告書」に「採用」「不採用」のボタン') && txt10.mgmt.includes('（「報告書」の画面と保存した HTML の両方') && !/Step[①②③]/.test(txt10.cl + txt10.mgmt) &&
    txt10.io.includes('v1 形式の JSON は読み込むと既定の設定になります') && !txt10.io.includes('新しい設定項目が既定値で補われます'),
    'E10 文言: 画面は「準備」「面接」「評価」「報告書」で呼ぶ（総合判断の説明は「評価」・必須条件の案内は「面接」・最終合否は「報告書」。Step① などは使わない）・帯の境界は面接チェックリストの節・書き出しの注記');
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
  const hs10 = await page.$$eval('#view-help .help-step h3', els => els.map(e => e.textContent));
  expect(JSON.stringify(hs10) === JSON.stringify(['準備', '面接', '評価', '報告書']) && ['準備 → 面接 → 評価 → 報告書 の 4 つの手順', '最終合否', '「面接対応者」に押印', '最終確認と最終合否'].every(t => help10.includes(t)) &&
    !['詳細モード', '初期対応者', '2軸', '貢献度', '留意点', '申し送り', '面接チェックリストへ進む', 'Step②'].some(t => help10.includes(t)) && !(await page.$('#helpFullMode')),
    'E10 使い方は 4 ステップ（準備・面接・評価・報告書。押印は面接対応者 → 最終確認・最終合否。詳細モード・初期対応者・2軸の記述なし）: ' + JSON.stringify(hs10));
  // 面接の進め方（1 分で読める 8 行。段階の名前・必須条件の案内先・最後の段階は台本から）
  const hiv10 = await page.$$eval('#helpInterview li', els => els.map(e => e.textContent));
  expect(hiv10.length === 8 && hiv10[0] === '「面接を始める」でタイマーが動き、① 勤務条件から 1 段階ずつ表示します（回答を入れる前なら、下見して準備に戻っても「面接を始める」で 0 から数え直します）。' &&
    hiv10[5] === '必須条件が 1 つでも［不一致］になると赤い案内が出ます。追加で確認して解消しなければ ⑤ 逆質問へ進み、最大 10 分で終えます。確かめないまま［次へ］を押すと、1 回目は進まずに確かめていない必須条件の行へ移ります（もう一度押すとそのまま進みます）。' &&
    hiv10[6] === '⑤ の聞くこと（逆質問）が終わったら、上の合否連絡を伝えて［伝えた］を押し、「面接を終えて評価へ」。Ctrl＋Enter でも次へ進めます。' &&
    hiv10[1].endsWith('⑤ の合否連絡（話すこと）だけは、下の聞くこと（逆質問）が終わってから、面接の最後に伝えます。') && hiv10[2].includes('［説明した］を 1 回') && hiv10[3].includes('○△× などの評価は面接のあとでまとめて付けます') &&
    hiv10[2].includes('求人が短期なら出し、通常求人では出しません。求人が未選択なら「短期のみ」の印つきで出し、［説明した］の対象にしません') && hiv10[4].includes('入力した段階には ✓（必須条件が未確認なら「未確認」）'),
    'E10 使い方の「面接の進め方」は 8 行（タイマー・段階の順〔⑤ の合否連絡は下の逆質問のあと〕・説明した〔短期のみの項目は 短期 → 出す・通常 → 出さない・未選択 → 印つきで対象外〕・メモ・目安とチップの ✓／未確認・' +
    '必須条件の案内〔確かめないまま［次へ］は 1 回目は必須条件の行へ〕・合否連絡〔逆質問のあと〕と Ctrl＋Enter・記入シート）: ' + JSON.stringify(hiv10));
  const helpLock10 = await page.textContent('#helpFinalLock').catch(() => '');
  expect(['最終承認のパスワード', '誤操作を防ぐための鍵', 'HTML をテキストで開いて書き換える人までは防げません', 'パスワードそのものは保存しません', '初期パスワードは管理者に確認してください', '押印欄の表示名'].every(t => helpLock10.includes(t)) &&
    !helpLock10.includes('local/') && !helpLock10.includes('final-password'),
    'E10 使い方に最終承認のパスワード（誤操作を防ぐ鍵・書き換えは防げない・平文は保存しない・ローカル版の初期パスワードは管理者に確認〔リポジトリ内のパスは出さない〕・押印欄の表示名の変更にも要る）');
  //   報告書（HTML）の流れ・ステップ 3 にパスワードの手順（最終合否の欄はパスワードの入力から・最終確認と最終合否は副支配人が保存した HTML で）
  const helpFlow10 = await page.textContent('#helpScriptFlow').catch(() => '');
  const helpStep4 = await page.evaluate(() => { const s = document.querySelectorAll('#view-help .help-step'); return s[3] ? s[3].textContent : ''; });
  expect(helpFlow10.includes('パスワードがあるときは、最初にパスワードを入力します') && helpStep4.includes('最終確認と最終合否は副支配人が保存した HTML で押します（最終承認のパスワードがあるときはその入力が必要です）') &&
    helpLock10.includes('報告書の画面と保存した HTML の両方'),
    'E10 使い方の「報告書（HTML）の流れ」とステップ 4（報告書）にパスワードの手順: ' + JSON.stringify({ flow: helpFlow10.length, step4: helpStep4.length }));
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
  // アプリの報告書の「A4 で印刷」も 1 ページ（押印 2 欄）
  await page.setInputFiles('#fileInput', saved9.file);
  await wait(500);
  expect(await step() === 4, 'E11 保存した記録を報告書で開く');
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
  // 1. 必須条件に不一致があるとき「上長最終判断要」: 打ち切りの案内・省略可・⑤ へのボタンを出さず、未入力でも報告書へ進める（面接の案内は docs/SPEC-flow.md 3-8）
  await toView('settings');
  await page.selectOption('[data-bind="checklist.mustFailResult"]', 'review');
  await saveSettings();
  await toView('judge');
  await fillScript({ name: '設定 一郎' });
  await page.click('[data-action="script-next"]');
  await wait(400);
  await setCl('values.must_weekly', 'mismatch');
  await wait(150);
  const rv12 = await st(() => ({ text: document.getElementById('ivMustLead').textContent + document.getElementById('ivMustAlertText').textContent, skip: document.querySelectorAll('#ivChips .iv-chip.is-skip').length,
    jump: !!document.getElementById('ivMustJump') && !document.getElementById('ivMustJump').classList.contains('hidden') }));
  expect(await visible('#ivMustAlert') && rv12.text === '必須条件が不一致です。追加で確認してください（このまま続けると、結果は上長最終判断要以下）' && rv12.skip === 0 && !rv12.jump,
    'E12 mustFailResult=review の面接の案内（追加で確認・続けると上長最終判断要以下。省略可のチップ・「⑤ 逆質問へ」は出さない）: ' + JSON.stringify(rv12));
  await setCl('overall', 'hire');
  await wait(150);
  const ev12 = await st(() => ({ skip: document.querySelectorAll('.cl-skippable').length, miss: document.getElementById('evMissing').textContent, res: document.getElementById('evResultTitle').textContent, why: document.getElementById('evResultWhy').textContent }));
  expect(await step() === 3 && ev12.skip === 0 && ev12.miss.startsWith('未入力：') && ev12.res === '上長最終判断要' && ev12.why.startsWith('必須条件が不一致') && ev12.why.endsWith('のため'),
    'E12 mustFailResult=review の評価: 省略可なし・未入力の数を出す（打ち切りではない）・いまの結果は上長最終判断要（必須条件が不一致のため）: ' + JSON.stringify(ev12));
  await judge();
  const j12a = await judgment();
  expect(await step() === 4 && j12a.result === 'review' && j12a.adjustments.includes('must_conditions'), 'E12 mustFailResult=review: 確認点が未入力でも報告書へ進み、採用 → 上長最終判断要（must_conditions）: ' + JSON.stringify(j12a));
  await toView('settings');
  await page.selectOption('[data-bind="checklist.mustFailResult"]', 'reject');
  await saveSettings();
  // 2. 台本の編集: 文言を変える・② の確認点（離職要因 rt_turnover）を削除（確認点 5 項目・満点 12）・④ に確認点を追加（満点 14）。
  //    既定の確認点は 2026-10-16 から 6 項目（14 点満点。rt_manner を人物像と重なるため外した。docs/SPEC-persona.md 1-2）
  const NEW_BUSY = '指定繁忙期間すべて出勤可（年末年始・GW・お盆）';
  await page.fill('[data-bind="checklist.sections[0].blocks[0].items[1].label"]', NEW_BUSY);
  await page.click('details.s-cl-sec[data-sec-id="continuity"] > summary');
  await wait(100);
  await page.click('.s-cl-item[data-item-id="rt_turnover"] [data-action="cl-item-del"]');
  await wait(150);
  await saveSettings();
  const sp12 = await storedProfile();
  const max12a = { note: await txtIn(page, '#clMaxNote'), band: await txtIn(page, '#clBandInputs') };
  expect(sp12.checklist.sections[0].blocks[0].items[1].label === NEW_BUSY && !JSON.stringify(sp12.checklist).includes('rt_turnover') && max12a.note.includes('確認点 5 項目') && max12a.note.includes('満点 12 点') && max12a.band.includes('現在の満点 12点'),
    'E12 文言の変更・確認点の削除を保存し、設定の満点表示は 12 点（帯の境界も 12 点で計算）: ' + JSON.stringify(max12a));
  await toView('judge');
  expect((await txtIn(page, '#sumMarks')).includes('/12点'), 'E12 右サマリーの満点 12 点: ' + await txtIn(page, '#sumMarks'));
  await toView('settings');
  await page.click('details.s-cl-sec[data-sec-id="teamwork"] > summary');
  await wait(100);
  await page.click('details.s-cl-sec[data-sec-id="teamwork"] [data-action="cl-item-add"][data-block="2"]');
  await wait(150);
  await saveSettings();
  expect((await txtIn(page, '#clMaxNote')).includes('満点 14 点'), 'E12 ④ に確認点を追加すると設定の満点表示は 14 点');
  await toView('judge');
  await page.click('#btnNew');
  await wait(200);
  await fillScript({ name: '設定 二郎' });
  await page.click('[data-action="script-next"]');
  await wait(400);
  const busy12 = await page.textContent('#ivStage .cl-must-row[data-item="must_busy"] .cl-label');
  await goTo(3);
  const cl12 = await st(() => ({ busy: (document.querySelector('#cl-conditions .cl-must-row[data-item="must_busy"] .cl-label') || {}).textContent, rows: document.querySelectorAll('.cl-rate-row').length,
    c1: document.querySelectorAll('#cl-conditions .cl-rate-row').length, c2: document.querySelectorAll('#cl-continuity .cl-rate-row').length, c4: document.querySelectorAll('#cl-teamwork .cl-rate-row').length,
    turnover: !!document.querySelector('.cl-rate-row[data-item="rt_turnover"]') }));
  //   （c0d20ce では削除したのが rt_manner だったので「rt_manner が無い」を見ていた。いまは削除したのが rt_turnover で、rt_manner は既定に無い〔単体 #54〕ので見ない）
  expect(busy12 === NEW_BUSY && cl12.busy === NEW_BUSY && cl12.rows === 6 && cl12.c1 === 1 && cl12.c2 === 1 && cl12.c4 === 2 && !cl12.turnover && (await txtIn(page, '#sumMarks')).includes('/14点'),
    'E12 面接 ①・評価の必須条件に新しい文言・評価の確認点は ① 1 件／② 1 件／④ 2 件（計 6 件・rt_turnover なし・満点 14 点）: ' + JSON.stringify(Object.assign({ busy12 }, cl12)));
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
  expect(sp12b.checklist.sections[0].blocks[0].items[1].label === '指定繁忙期間すべて可（クリスマス・年末年始・春休み・GW・お盆）' && !JSON.stringify(sp12b.checklist).includes('rt_manner') &&
    JSON.stringify(sp12b.checklist).includes('rt_turnover') && sp12b.checklist.persona && sp12b.checklist.persona.items.length === 7 &&
    (await txtIn(page, '#clMaxNote')).includes('満点 14 点') && await st(() => window.RecruitRules.interviewModel(window.RecruitApp.state.profile, window.RecruitRules.emptyChecklist()).max) === 14,
    'E12 「既定の台本に戻す」で既定の文言・確認点（rt_manner なし・rt_turnover あり）・人物像 7 項目・満点 14');
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
  // 7. 名簿にない担当者（手入力）の押印・取消（アプリの報告書）
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
    'E12 最終合否を OFF にすると 報告書のカード・紙の合否欄・右サマリーを出さない（記録は保持）');
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
  expect(!!(await page.$('#decisionCard svg.verdict-stamp')) && (await txtIn(page, '#sumDecision')).includes('不採用・鈴木'), 'E12 ON に戻すと 報告書のカード（記録した合否）が戻る');
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
    // 用紙の見出しにもロゴ（報告書の紙・保存 HTML。高さ 7mm ≒ 26.5px。docs/SPEC-a4.md A3）
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
    await ivToReport(lp);
    const app13 = await lp.evaluate(logoOf, '#appPaper .cl-title-logo');
    expect(!!app13 && app13.alt === 'SAMPLE LOGO' && Math.abs(app13.h - 26.5) <= 1 && app13.first, 'E13 アプリの報告書の紙の見出しにも同じロゴ: ' + JSON.stringify(app13));
    //   面接記入シート（手書き用）の見出しも同じ部品（docs/SPEC-persona.md D13）
    await lp.evaluate(() => window.RecruitApp.preparePaperSheet(true));
    await lp.waitForTimeout(200);
    const pp13 = await lp.evaluate(logoOf, '#clSheet .pp-sheet .cl-title-logo');
    await lp.evaluate(() => window.RecruitApp.preparePaperSheet(false));
    expect(!!pp13 && pp13.alt === 'SAMPLE LOGO' && Math.abs(pp13.h - 26.5) <= 1 && pp13.first && pp13.title === '面接記入シート', 'E13 面接記入シートの見出しにも同じロゴ（題名の左・高さ 7mm）: ' + JSON.stringify(pp13));
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
  // 段階のクラス・縮小・切れたメモを広げたインラインの行数（docs/SPEC-a4.md 12 章 F5）
  const a4State = (pg) => pg.evaluate(() => { const sh = document.querySelector('#a4 .cl-sheet');
    return { cls: sh.className, zoom: sh.style.zoom, clamps: Array.from(sh.querySelectorAll('.cl-nm-v')).map(v => v.style.getPropertyValue('-webkit-line-clamp')).join(',') }; });
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
  //   キーボード操作の直後（Esc で欄に戻った・Shift+Tab で「最終合否」に移った）に印刷しても、欄のフォーカス枠は紙に出ない（画面では紺の枠。2026-10-18 に #1f5fbf から --focus の #3b5791 へ。docs/DESIGN.md 4-9）
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
  expect(ringF14.id === 'final' && ringF14.style === 'solid' && ringF14.color === 'rgb(59, 87, 145)' && ringF14.print === 'none' &&
    ringD14.id === 'a4Decision' && ringD14.style === 'solid' && ringD14.print === 'none' && (ringP14 === null || (ringP14.size && ringP14.n === 0)),
    'E14 (3) キーボード操作の直後に印刷しても欄のフォーカス枠は出ない（画面は紺の枠・印刷は outline なし・PDF の画像はフォーカスなしの印刷と画素単位で同じ）: ' + JSON.stringify({ ringF14, ringD14, ringP14 }));
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
  // アプリの報告書の紙の欄はクリックしても何もしない（操作は下のカード。docs/SPEC-a4.md A10）
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
    'E14 (3) アプリの報告書の紙の押印欄・最終合否をクリックしても窓は出ず、押印・合否は変わらない');
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
  //   確認点のメモは面接メモ・所見の枠の 1 行（.cl-nm-rt。docs/SPEC-persona.md 4-3）: 窓の見出しは「確認点のメモ」・本文は 1 項目 1 行の全文（①具体性：…）
  const rtCut14 = await p14c.evaluate(() => !!document.querySelector('#a4 .cl-nm-rt .cl-nm-v.cl-cut'));
  if (rtCut14) await p14c.click('#a4 .cl-nm-rt .cl-nm-v.cl-cut');
  const rt14 = rtCut14 ? { h: await txtIn(p14c, '#a4PopH'), t: await txtIn(p14c, '#a4Pop .pop-text') } : null;
  await p14c.keyboard.press('Escape');
  const RT14 = [['rt_concrete', '①具体性'], ['rt_hourensou', '②報連相'], ['rt_turnover', '②離職要因'], ['rt_understand', '③業務理解'], ['rt_team', '④チーム行動'], ['rt_mismatch', '⑤ミスマッチ']];
  const rtWant14 = RT14.filter(x => String(rec14.checklist.notes[x[0]] || '').trim()).map(x => x[1] + '：' + String(rec14.checklist.notes[x[0]]).trim()).join('\n');
  expect(nMemo14 >= 1 && ul14.includes('underline') && iv14.kind === 'memo' && iv14.h === '面接所見' && iv14.t === rec14.interviewNotes && iv14.t.length === 1500 && !!rt14 && rt14.h === '確認点のメモ' &&
    rt14.t === rtWant14 && rt14.t.split('\n').length === 6 && !(await p14c.$('#a4 .cl-rt-nt')),
    'E14 (4) 「…」で切れた面接所見・確認点のメモ（面接メモ・所見の枠の 1 行）はホバーで下線・クリックで窓に全文（記録の値と一致・確認点は 1 項目 1 行）: ' +
    JSON.stringify({ nMemo14, ul14, iv: [iv14.h, iv14.t.length], rt: rt14 && [rt14.h, rt14.t.length, rt14.t.split('\n').length] }));
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
  //   質問の回答を省いた用紙（.cl-compact-2）: 案内の行をクリックすると全メモ（省いた質問の回答を含む）。確認点のメモ（rn）も入れて「確認点のメモ」の行（.cl-nm-rt）も並ぶことを確かめる
  let m14 = null;
  for (const extra of [20, 30, 45]) {
    const f = path.join(OUT, 'a4-memos.html');
    fs.writeFileSync(f, await page.evaluate(mk39, { q: 300, iv: 2000, rn: 40, extra }));
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
      return { rows: rows.map(r => r.getAttribute('data-cl-block') || (r.classList.contains('cl-nm-iv') ? 'iv' : r.classList.contains('cl-nm-rt') ? 'rt' : 'memo')), hidden: rows.filter(r => !r.getClientRects().length).length,
        dd: Array.from(document.querySelectorAll('#a4Pop .pop-memos dd')).map(e => e.textContent), dt: Array.from(document.querySelectorAll('#a4Pop .pop-memos dt')).map(e => e.textContent), h: document.getElementById('a4PopH').textContent }; });
    //   確認点のメモの行（rt）の期待値: 台本順に「番号＋短い名前：メモ」を 1 項目 1 行（既定の 6 項目は RT14、mk39 が ② に足した確認点は「②追加の確認点 n」＝項目名が 14 文字以内なのでそのまま）
    const rtNames14 = Object.fromEntries(RT14);
    const rtWantM14 = [];
    recM14.checklistDef.sections.forEach((sec, si) => sec.blocks.forEach(b => { if (b.type === 'rating') b.items.forEach(it => { const n = String(recM14.checklist.notes[it.id] || '').trim();
      if (n) rtWantM14.push((rtNames14[it.id] || '①②③④⑤'[si] + it.label) + '：' + n); }); }));
    const want14 = ms14.rows.map(k => k === 'iv' ? recM14.interviewNotes : k === 'memo' ? recM14.applicant.reviewerNotes : k === 'rt' ? rtWantM14.join('\n') : recM14.checklist.notes[k]);
    expect(ref14.mark === 'memos' && ref14.role === 'button' && ref14.t === '質問の回答は省略（画面でこの行をクリックすると、回答と「…」で切れたメモの全文を表示します）' && ms14.h === '面接メモ（全文）' &&
      ms14.hidden >= 1 && ms14.dd.length === ms14.rows.length && JSON.stringify(ms14.dd) === JSON.stringify(want14) && ms14.dt[ms14.dt.length - 1] === '面接所見' &&
      ms14.rows.includes('rt') && ms14.dt[ms14.rows.indexOf('rt')] === '確認点のメモ' && rtWantM14.length === 6 + m14.extra && want14[ms14.rows.indexOf('rt')].split('\n').length === 6 + m14.extra,
      'E14 (4) 質問の回答を省いた用紙（.cl-compact-2）は案内の行のクリックで全メモ（省いた回答・確認点のメモ〔1 項目 1 行〕を含む・記録の値と一致）: ' + JSON.stringify({ extra: m14.extra, ref14, rows: ms14.rows, hidden: ms14.hidden, dt: ms14.dt }));
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
    const el = document.querySelector('#a4 .cl-sheet'); el.classList.add('cl-measure'); const nat = el.getBoundingClientRect().height; el.classList.remove('cl-measure');
    return { sheetH: Math.round(nat), fillH: Math.round(sh.height), stampsB: Math.round(stp.bottom), innerB: Math.round(a.bottom - pad) }; });
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
  expect(st14h.cls.includes('cl-compact') && JSON.stringify(st14w) === JSON.stringify(st14h) && Math.abs(parseFloat(zw14) - 0.451) <= 0.01 && fp14.sheetH <= 1052 && fp14.stampsB <= fp14.innerB + 1 && fp14.stampsB >= fp14.innerB - 8 &&
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

  // =====================================================================
  // E15 最終承認のパスワード（docs/SPEC-a4.md 11 章。指示「最終承認の押印はパスワードが必要な感じの方がいい」）
  //   公開版（dist）はロックなし。ローカル版はテスト用の架空のパスワード（tests/fixtures/local-sample/final-password.txt）で確かめる。
  //   local/final-password.txt（利用者の実際のパスワード）は中身を出力せず、公開版に入っていないことだけを確かめる
  // =====================================================================
  console.log('\n== E15 最終承認のパスワード ==');
  {
    const cp = require('child_process');
    const ROOT = path.join(__dirname, '..');
    const DISTF = path.join(ROOT, 'dist', 'toho-recruit-judge.html');
    const PW = fs.readFileSync(path.join(FIX, 'local-sample', 'final-password.txt'), 'utf8').split(/\r?\n/)[0].trim();
    const NEWPW = 'e2e-new-pass', PW3 = 'e2e-third-pass';
    const e15 = [];
    const cfgOf = (html) => JSON.parse(html.match(/id="recruit-mgmt-config">([\s\S]*?)<\/script>/)[1]);
    // (1) 公開版の dist にパスワード・ハッシュが無い（ロックの既定は空）
    const distHtml = fs.readFileSync(DISTF, 'utf8');
    const realPwFile = path.join(ROOT, 'local', 'final-password.txt');
    const realPw = fs.existsSync(realPwFile) ? (fs.readFileSync(realPwFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0] || '').trim() : '';
    expect(/finalLock: \{ salt: '', hash: '' \}/.test(distHtml) && !/finalLock: \{"salt"/.test(distHtml) && !distHtml.includes(PW) && (!realPw || !distHtml.includes(realPw)),
      'E15 公開版（dist）の最終承認のロックは空（テスト用・local のパスワードもハッシュも入っていない）' + (realPw ? '' : '（local/final-password.txt なし）'));
    // (2) 公開版: ロックなしで従来どおり押せる（報告書にパスワード欄なし・保存 HTML の窓にもなし）
    await fresh();
    await fillScript({ name: '鍵 公開' });
    await page.click('[data-action="script-next"]');
    await wait(300);
    await judge();
    const pub = await st(() => ({ lock: document.querySelectorAll('.final-lock').length, dec: !!document.querySelector('#decisionCard [data-action="decide"]'), fin: !!document.querySelector('#mgmtCard .stamp-box[data-field-id="final"] [data-action="stamp"]') }));
    await page.selectOption('#decisionManager', { label: SASA });
    await page.click('#decisionCard [data-action="decide"][data-value="hire"]');
    await wait(200);
    const pubDec = await st(() => ({ dec: (window.RecruitApp.state.decision || {}).result || '', fin: !!(window.RecruitApp.state.management.final || {}).name }));
    const pubSaved = await saveRecord('lock-public.html');
    const pubCfg = cfgOf(pubSaved.html);
    const pp = await newReportPage(e15);
    await pp.goto('file://' + pubSaved.file);
    await pp.waitForTimeout(300);
    const popOf = (pg) => pg.evaluate(() => { const p = document.getElementById('a4Pop'), pw = p && p.querySelector('.pop-pw');
      return p ? { pw: !!pw, type: pw ? pw.type : '', ac: pw ? pw.autocomplete : '', sel: !!p.querySelector('.pop-sel'), act: !!p.querySelector('[data-act="stamp"],[data-act="decide"],[data-act="unstamp"]'),
        err: (p.querySelector('.pop-err') || {}).textContent || '', focus: (document.activeElement && document.activeElement.className) || '' } : null; });
    await openStamp(pp, 'final');
    const pubPop = await popOf(pp);
    await pp.keyboard.press('Escape');
    await openDecision(pp);
    const pubPop2 = await popOf(pp);
    await pp.close();
    expect(pub.lock === 0 && pub.dec && pub.fin && pubDec.dec === 'hire' && pubDec.fin && pubCfg.finalLock === null && pubCfg.lockField === 'final' &&
      !!pubPop && !pubPop.pw && pubPop.sel && !!pubPop2 && !pubPop2.pw && pubPop2.act,
      'E15 公開版はロックなし: 報告書の最終確認・最終合否はパスワードなしで押せる・保存 HTML の窓にもパスワード欄なし: ' + JSON.stringify({ pub, pubDec, pubPop, pubPop2 }));
    // (3) ローカル版（テスト用の架空のパスワード）: build が salt と hash を差し込む（平文は出さない）
    const OUTL = path.join(OUT, 'local-lock.html');
    const logL = cp.execSync('node build.js --local tests/fixtures/local-sample --out ' + JSON.stringify(OUTL), { cwd: ROOT }).toString();
    const builtL = fs.readFileSync(OUTL, 'utf8');
    const lockL = JSON.parse((builtL.match(/finalLock: (\{"salt":"[0-9a-f]{32}","hash":"[0-9a-f]{64}"\})/) || [])[1] || 'null');
    expect(logL.includes('最終承認のパスワード') && !!lockL && !builtL.includes(PW) && fs.readFileSync(DISTF, 'utf8') === distHtml,
      'E15 node build.js --local は final-password.txt から salt と hash を作って既定のロックに差し込む（平文は出力しない・公開版の dist は変わらない）: ' + logL.trim().split('\n').join(' / '));
    const lp = await newReportPage(e15);   // ローカル版のアプリ（同じ file:// の localStorage を使うので先に消す）
    await lp.goto('file://' + OUTL);
    await lp.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await lp.reload();
    await lp.waitForTimeout(300);
    await lp.fill('[data-field="name"]', '鍵 確認');
    await lp.click('[data-action="script-next"]');
    await lp.waitForTimeout(300);
    await ivToReport(lp);
    const cards = () => lp.evaluate(() => ({
      ivSel: !!document.querySelector('#mgmtCard .stamp-box[data-field-id="interviewer"] select'),
      finLock: !!document.querySelector('#mgmtCard .stamp-box[data-field-id="final"] .final-lock'), finBtn: !!document.querySelector('#mgmtCard .stamp-box[data-field-id="final"] [data-action="stamp"]'),
      decLock: !!document.querySelector('#decisionCard .final-lock'), decBtn: !!document.querySelector('#decisionCard [data-action="decide"]'),
      pwType: Array.from(document.querySelectorAll('.final-lock-pw')).map(i => i.type + '/' + i.autocomplete).join(','),
      err: Array.from(document.querySelectorAll('.final-lock-err')).map(e => e.textContent).join('|'),
      mg: Object.keys(window.RecruitApp.state.management).sort().join(','), finName: (window.RecruitApp.state.management.final || {}).name || '', dec: (window.RecruitApp.state.decision || {}).result || '',
      linkHint: Array.from(document.querySelectorAll('#decisionCard .hint')).some(h => h.textContent.includes('同じ担当者の印も押します')) }));
    const c0 = await cards();
    expect(c0.ivSel && c0.finLock && !c0.finBtn && c0.decLock && !c0.decBtn && c0.pwType === 'password/off,password/off',
      'E15 ローカル版の報告書: 最終確認の押印欄と最終合否はパスワード欄（type=password・autocomplete=off）と［確認］だけ・面接対応者は従来どおり: ' + JSON.stringify(c0));
    await lp.selectOption('#mgmtCard .stamp-box[data-field-id="interviewer"] select', { index: 1 });
    await lp.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
    await lp.waitForTimeout(200);
    await lp.fill('#mgmtCard .final-lock-pw', 'wrong-pass');
    await lp.click('#mgmtCard [data-action="unlock-final"]');
    await lp.waitForTimeout(150);
    const c1 = await cards();
    expect(c1.mg === 'interviewer' && c1.finLock && c1.decLock && !c1.decBtn && c1.err.split('|')[0] === 'パスワードが違います' && c1.dec === '',
      'E15 面接対応者はパスワードなしで押せる・違うパスワードでは「パスワードが違います」の 1 行だけで押せない: ' + JSON.stringify(c1));
    // 正しいパスワード（Enter）→ 解錠され、続けて押せる（最終合否 → 最終確認にも押印 → 最終確認の取消・押し直し）
    await lp.fill('#decisionCard .final-lock-pw', PW);
    await lp.press('#decisionCard .final-lock-pw', 'Enter');
    await lp.waitForTimeout(200);
    const c2 = await cards();
    const foc2 = await lp.evaluate(() => document.activeElement && document.activeElement.id);
    await lp.selectOption('#decisionManager', { index: 1 });
    await lp.click('#decisionCard [data-action="decide"][data-value="hire"]');
    await lp.waitForTimeout(200);
    const c3 = await cards();
    await lp.click('#mgmtCard .stamp-box[data-field-id="final"] [data-action="unstamp"]');
    await lp.waitForTimeout(200);
    await lp.selectOption('#mgmtCard .stamp-box[data-field-id="final"] select', { index: 2 });
    await lp.click('#mgmtCard .stamp-box[data-field-id="final"] [data-action="stamp"]');
    await lp.waitForTimeout(200);
    const c4 = await cards();
    const ls4 = await lp.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    expect(!c2.finLock && !c2.decLock && c2.decBtn && c2.finBtn && foc2 === 'decisionManager' && c3.dec === 'hire' && c3.mg === 'final,interviewer' && c4.finName === '試験 花子' && !ls4.includes(PW),
      'E15 正しいパスワード（Enter）で解錠: パスワード欄が消え、最終合否・最終確認の押印・取消を続けて押せる（localStorage に平文なし）: ' + JSON.stringify({ c2, foc2, c3, c4 }));
    expect(!c0.linkHint && !c1.linkHint && c2.linkHint,
      'E15 報告書の最終合否カード: パスワード欄のあいだは「採用」「不採用」の連動の案内を出さない（ボタンが無い）・解錠すると出す: ' + JSON.stringify({ c0: c0.linkHint, c1: c1.linkHint, c2: c2.linkHint }));
    // (4) 保存 HTML: 保存時のロックで照合。最終確認・最終合否の窓はパスワード欄だけ（面接対応者は不要）→ 正しいと解錠され、続けて押せる
    const [dlA] = await Promise.all([lp.waitForEvent('download'), lp.click('#btnSave')]);
    const fA = path.join(OUT, 'lock-local-a.html');
    await dlA.saveAs(fA);
    const hA = fs.readFileSync(fA, 'utf8');
    const cfgA = cfgOf(hA);
    expect(JSON.stringify(cfgA.finalLock) === JSON.stringify(lockL) && cfgA.lockField === 'final' && JSON.stringify(cfgA.lockFields) === '["final"]' && !hA.includes(PW), 'E15 保存 HTML に保存時のロック（salt・hash）と対象の押印欄を入れる・平文は無い');
    const rA = await newReportPage(e15);
    await rA.goto('file://' + fA);
    await rA.waitForTimeout(300);
    await openStamp(rA, 'interviewer');
    const pA0 = await popOf(rA);
    await rA.keyboard.press('Escape');
    await openStamp(rA, 'final');
    const pA1 = await popOf(rA);
    await rA.fill('#a4Pop .pop-pw', 'wrong-pass');
    await rA.press('#a4Pop .pop-pw', 'Enter');
    await rA.waitForTimeout(100);
    const pA2 = await popOf(rA);
    await rA.fill('#a4Pop .pop-pw', PW);
    await rA.click('#a4Pop [data-act="unlock"]');
    await rA.waitForTimeout(100);
    const pA3 = await popOf(rA);
    await popAct(rA, 'unstamp');
    const unA = await rA.evaluate(() => !document.querySelector('#a4 .stamp-box[data-field-id="final"] svg.hanko'));
    await openDecision(rA);
    const pA4 = await popOf(rA);
    await popAct(rA, 'decide', 'reject');
    const decA = await rA.evaluate(() => ({ dec: document.getElementById('a4Decision').classList.contains('is-reject'), fin: !!document.querySelector('#a4 .stamp-box[data-field-id="final"] svg.hanko') }));
    expect(!!pA0 && !pA0.pw && pA0.sel && !!pA1 && pA1.pw && pA1.type === 'password' && pA1.ac === 'off' && !pA1.sel && !pA1.act && pA1.focus === 'pop-pw' &&
      !!pA2 && pA2.pw && pA2.err === 'パスワードが違います' && !pA2.act && !!pA3 && !pA3.pw && pA3.sel && pA3.act && pA3.focus === 'pop-sel' && unA && !!pA4 && !pA4.pw && pA4.act && decA.dec && decA.fin,
      'E15 保存 HTML: 最終確認の窓はパスワード欄だけ（面接対応者は不要）・違うと「パスワードが違います」・正しいと担当者と押印が出て、取消・最終合否も続けて押せる: ' + JSON.stringify({ pA0, pA1, pA2, pA3, pA4, decA }));
    const [dlB] = await Promise.all([rA.waitForEvent('download'), rA.click('#saveBarBtn')]);
    const fB = path.join(OUT, 'lock-local-b.html');
    await dlB.saveAs(fB);
    await rA.close();
    const hB = fs.readFileSync(fB, 'utf8');
    const rB = await newReportPage(e15);
    await rB.goto('file://' + fB);
    await rB.waitForTimeout(300);
    await openDecision(rB);
    const pB = await popOf(rB);
    const decB = await rB.evaluate(() => document.getElementById('a4Decision').classList.contains('is-reject'));
    await rB.close();
    expect(!!pB && pB.pw && !pB.act && decB && !hB.includes(PW) && !shownHtml(hB).includes('pop-pw') && cfgOf(hB).finalLock.hash === lockL.hash,
      'E15 書き出したファイルを開き直すとまたパスワードが要る（書き出しに解錠状態・パスワード欄・平文なし。ロックはそのまま）: ' + JSON.stringify(pB));
    // (5) 設定: パスワードの変更には現在のパスワードが要る → 保存 → 報告書はまた求める（前のパスワードは違う）→ 変えた後の保存 HTML は新しいパスワード
    await lp.click('.nav-item[data-view="settings"]');
    await lp.waitForTimeout(300);
    const lst = () => lp.evaluate(() => { const f = document.getElementById('finalLockForm');
      return { status: (document.getElementById('finalLockStatus') || {}).textContent || '', form: f ? f.getAttribute('data-lock-form') : '', err: (document.getElementById('finalLockErr') || {}).textContent || '',
        binds: f ? f.querySelectorAll('[data-bind]').length : 0, pw: f ? Array.from(f.querySelectorAll('input')).map(i => i.id + ':' + i.type + ':' + i.autocomplete).join(',') : '',
        stored: (JSON.parse(localStorage.getItem('recruit.profile.v1') || 'null') || { management: {} }).management.finalLock || null }; });
    const s0 = await lst();
    await lp.click('#finalLockChange');
    await lp.waitForTimeout(100);
    const s1 = await lst();
    await lp.fill('#lockCur', 'wrong-pass');
    await lp.fill('#lockNew', NEWPW);
    await lp.fill('#lockNew2', NEWPW);
    await lp.click('#finalLockApply');
    await lp.waitForTimeout(100);
    const s2 = await lst();
    await lp.fill('#lockCur', PW);
    await lp.fill('#lockNew2', NEWPW + 'x');
    await lp.click('#finalLockApply');
    await lp.waitForTimeout(100);
    const s3 = await lst();
    await lp.fill('#lockNew2', NEWPW);
    await lp.press('#lockNew2', 'Enter');
    await lp.waitForTimeout(150);
    const s4 = await lst();
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    const s5 = await lst();
    const ls5 = await lp.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    expect(s0.status.includes('設定済み') && s1.form === 'change' && s1.binds === 0 && s1.pw === 'lockCur:password:off,lockNew:password:off,lockNew2:password:off' &&
      s2.err === '現在のパスワードが違います' && s3.err === '新しいパスワード（確認）が一致しません' && s4.form === '' && s4.status.includes('未保存の変更') && !(s4.stored && s4.stored.hash && s4.stored.hash !== lockL.hash) &&
      !!s5.stored && /^[0-9a-f]{64}$/.test(s5.stored.hash) && s5.stored.hash !== lockL.hash && !s5.status.includes('未保存') && !ls5.includes(NEWPW) && !ls5.includes(PW),
      'E15 設定でパスワードを変更: 現在のパスワードが要る・確認の不一致は止める・変更は「設定を保存」で確定（入力欄は data-bind なし・localStorage に平文なし）: ' + JSON.stringify({ s0: s0.status, s1, s2: s2.err, s3: s3.err, s4: s4.status, s5: s5.status }));
    await lp.click('.nav-item[data-view="judge"]');
    await lp.waitForTimeout(300);
    const c5 = await cards();
    await lp.fill('#decisionCard .final-lock-pw', PW);
    await lp.press('#decisionCard .final-lock-pw', 'Enter');
    await lp.waitForTimeout(150);
    const c6 = await cards();
    await lp.fill('#decisionCard .final-lock-pw', NEWPW);
    await lp.press('#decisionCard .final-lock-pw', 'Enter');
    await lp.waitForTimeout(150);
    const c7 = await cards();
    expect(c5.finLock && c5.decLock && c6.decLock && c6.err.includes('パスワードが違います') && !c7.decLock && !c7.finLock && c7.decBtn,
      'E15 パスワードを変えると報告書はまた求める（前のパスワードは違う・新しいパスワードで解錠）: ' + JSON.stringify({ c5, c6: c6.err, c7 }));
    const [dlC] = await Promise.all([lp.waitForEvent('download'), lp.click('#btnSave')]);
    const fC = path.join(OUT, 'lock-local-c.html');
    await dlC.saveAs(fC);
    const hC = fs.readFileSync(fC, 'utf8');
    const tryPw = async (file, pw) => { const r = await newReportPage(e15); await r.goto('file://' + file); await r.waitForTimeout(300); await openDecision(r);
      await r.fill('#a4Pop .pop-pw', pw); await r.press('#a4Pop .pop-pw', 'Enter'); await r.waitForTimeout(100); const o = await popOf(r); await r.close(); return o.pw ? o.err || 'locked' : 'unlocked'; };
    const tC = { oldPw: await tryPw(fC, PW), newPw: await tryPw(fC, NEWPW), fileA_new: await tryPw(fA, NEWPW), fileA_old: await tryPw(fA, PW) };
    expect(cfgOf(hC).finalLock.hash === s5.stored.hash && !hC.includes(NEWPW) && tC.oldPw === 'パスワードが違います' && tC.newPw === 'unlocked' && tC.fileA_new === 'パスワードが違います' && tC.fileA_old === 'unlocked',
      'E15 変えた後の保存 HTML は新しいパスワード（前のパスワードは違う）・先に出したファイルは出した時点のパスワードのまま: ' + JSON.stringify(tC));
    // (6) JSON の読み込みでロックを外そうとすると現在のパスワードが要る（同じロックの JSON はそのまま読める。違えば・キャンセルなら読み込まない）
    await lp.click('.nav-item[data-view="settings"]');
    await lp.waitForTimeout(300);
    const profJ = await lp.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')));
    await lp.setInputFiles('#profileFileInput', { name: 'profile-same.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profJ)) });
    await lp.waitForTimeout(300);
    const j0 = await lp.evaluate(() => ({ dlg: !!document.getElementById('pwDialog'), toast: document.getElementById('toast').textContent }));
    //   空のロック（{ salt: '', hash: '' }。公開版が書き出す）・キーなしの JSON はロックを変えない（ダイアログなし・いまのパスワードのまま。11 章 L6c）
    const jE = {};
    for (const [k, l] of [['empty', { salt: '', hash: '' }], ['none', undefined]]) {
      const pj = JSON.parse(JSON.stringify(profJ));
      if (l) pj.management.finalLock = l; else delete pj.management.finalLock;
      pj.meta.footer = 'JSON ' + k;
      await lp.setInputFiles('#profileFileInput', { name: 'profile-' + k + '.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pj)) });
      await lp.waitForTimeout(300);
      jE[k] = await lp.evaluate(() => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1')); return { dlg: !!document.getElementById('pwDialog'), footer: p.meta.footer, hash: p.management.finalLock.hash }; });
    }
    expect(['empty', 'none'].every(k => !jE[k].dlg && jE[k].footer === 'JSON ' + k && jE[k].hash === s5.stored.hash),
      'E15 JSON の読み込み: ロックの無い JSON（空のロック・キーなし。公開版が書き出したもの）はロックを変えない（ダイアログなし・いまのパスワードのまま）: ' + JSON.stringify(jE));
    //   パスワードを外す JSON は「外した」印（off: true）の入ったもの（設定の［パスワードを外す］で保存した設定を書き出したもの）
    profJ.management.finalLock = { salt: '', hash: '', off: true };
    const jsonJ = Buffer.from(JSON.stringify(profJ));
    await lp.setInputFiles('#profileFileInput', { name: 'profile-nolock.json', mimeType: 'application/json', buffer: jsonJ });
    await lp.waitForTimeout(300);
    const j1 = await lp.evaluate(() => { const d = document.getElementById('pwDialog'), i = document.getElementById('pwDialogInput');
      return d ? { text: d.textContent, type: i.type, ac: i.autocomplete, focus: document.activeElement && document.activeElement.id } : null; });
    await lp.fill('#pwDialogInput', PW);
    await lp.press('#pwDialogInput', 'Enter');
    await lp.waitForTimeout(100);
    const j2 = await lp.evaluate(() => ({ open: !!document.getElementById('pwDialog'), err: (document.getElementById('pwDialogErr') || {}).textContent }));
    await lp.keyboard.press('Escape');
    await lp.waitForTimeout(200);
    const j3 = await lp.evaluate(() => ({ open: !!document.getElementById('pwDialog'), hash: JSON.parse(localStorage.getItem('recruit.profile.v1')).management.finalLock.hash, toast: document.getElementById('toast').textContent }));
    await lp.setInputFiles('#profileFileInput', { name: 'profile-nolock.json', mimeType: 'application/json', buffer: jsonJ });
    await lp.waitForTimeout(300);
    await lp.fill('#pwDialogInput', NEWPW);
    await lp.click('#pwDialog [data-pw="ok"]');
    await lp.waitForTimeout(300);
    const j4 = await lst();
    expect(!j0.dlg && j0.toast.includes('プロファイルを読み込みました') && !!j1 && j1.text.includes('外れます') && j1.type === 'password' && j1.ac === 'off' && j1.focus === 'pwDialogInput' &&
      j2.open && j2.err === 'パスワードが違います' && !j3.open && j3.hash === s5.stored.hash && j3.toast.includes('読み込みませんでした') && !!j4.stored && j4.stored.hash === '' && j4.status.includes('未設定'),
      'E15 JSON の読み込み: 同じロックはそのまま・ロックを外す JSON は現在のパスワードが要る（違えば「パスワードが違います」、キャンセルなら読み込まない、正しければ読み込む）: ' + JSON.stringify({ j0, j1: j1 && j1.focus, j2, j3: { open: j3.open, toast: j3.toast }, j4: j4.status }));
    // (7) 未設定からの設定（現在のパスワードは不要）→ 外すには現在のパスワードが要る → 報告書にパスワード欄なし
    await lp.click('#finalLockChange');
    await lp.waitForTimeout(100);
    const s6 = await lst();
    await lp.fill('#lockNew', PW3);
    await lp.fill('#lockNew2', PW3);
    await lp.click('#finalLockApply');
    await lp.waitForTimeout(100);
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    const s7 = await lst();
    await lp.click('#finalLockRemove');
    await lp.waitForTimeout(100);
    await lp.fill('#lockCur', NEWPW);
    await lp.click('#finalLockRemoveApply');
    await lp.waitForTimeout(100);
    const s8 = await lst();
    await lp.fill('#lockCur', PW3);
    await lp.press('#lockCur', 'Enter');
    await lp.waitForTimeout(100);
    const s9 = await lst();
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    const s10 = await lst();
    await lp.click('.nav-item[data-view="judge"]');
    await lp.waitForTimeout(300);
    const c8 = await cards();
    expect(s6.form === 'change' && s6.pw === 'lockNew:password:off,lockNew2:password:off' && s7.status.includes('設定済み') && s7.stored.hash.length === 64 &&
      s8.form === 'remove' && s8.err === '現在のパスワードが違います' && s9.form === '' && s9.status.includes('未設定') && s9.status.includes('未保存') && s10.stored.hash === '' && s10.stored.off === true &&
      !c8.finLock && !c8.decLock && c8.finBtn && c8.decBtn,
      'E15 設定: 未設定からは現在のパスワードなしで設定・外すには現在のパスワードが要る・外して保存すると報告書にパスワード欄なし: ' + JSON.stringify({ s6: s6.pw, s7: s7.status, s8: s8.err, s9: s9.status, c8 }));
    // (8) 初期化でロックが変わるときも現在のパスワードが要る（ローカル版の初期は local のロック）
    await lp.click('.nav-item[data-view="settings"]');
    await lp.waitForTimeout(300);
    await lp.click('#view-settings [data-action="reset"]');
    await lp.waitForTimeout(300);
    const r0 = await lst();
    await lp.click('#finalLockChange');
    await lp.waitForTimeout(100);
    await lp.fill('#lockCur', PW);
    await lp.fill('#lockNew', PW3);
    await lp.fill('#lockNew2', PW3);
    await lp.click('#finalLockApply');
    await lp.waitForTimeout(100);
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    await lp.click('#view-settings [data-action="reset"]');
    await lp.waitForTimeout(300);
    const r1 = await lp.evaluate(() => { const d = document.getElementById('pwDialog'); return d ? d.textContent : ''; });
    await lp.click('#pwDialog [data-pw="cancel"]');
    await lp.waitForTimeout(200);
    const r2 = await lst();
    await lp.click('#view-settings [data-action="reset"]');
    await lp.waitForTimeout(300);
    await lp.fill('#pwDialogInput', PW3);
    await lp.press('#pwDialogInput', 'Enter');
    await lp.waitForTimeout(300);
    const r3 = await lst();
    expect(!!r0.stored && r0.stored.hash === lockL.hash && r1.includes('初期設定に戻すと最終承認のパスワードが初期のパスワードに変わります') && r2.stored.hash !== lockL.hash && r2.stored.hash.length === 64 &&
      r3.stored.hash === lockL.hash && r3.status.includes('設定済み'),
      'E15 初期化: ロックが無ければそのまま初期のロック（local）に戻す・別のパスワードのときは現在のパスワードが要る（キャンセルなら戻さない）: ' + JSON.stringify({ r1, r2: r2.status, r3: r3.status }));
    // (9) ロックの迂回を塞ぐ（docs/SPEC-a4.md 11 章 L1b・L5c）: 「押印欄と連動」を「連動しない」に変えて保存するには現在のパスワードが要る（違えば・キャンセルなら保存しない）。
    //     正しければ保存でき、その後も最終確認欄の押印・取消にはパスワードが要る（報告書・保存 HTML。解錠前）。表示名だけの変更は不要。最終合否の ON/OFF・押印欄の構成（JSON）も求める
    await lp.reload();
    await lp.waitForTimeout(300);
    await lp.click('.nav-item[data-view="settings"]');
    await lp.waitForTimeout(300);
    const sfOf = () => lp.evaluate(() => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1') || 'null'); return p ? p.management.decision.stampField : null; });
    const g0 = await sfOf();
    await lp.selectOption('[data-bind="management.decision.stampField"]', '');
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    const g1 = await lp.evaluate(() => { const d = document.getElementById('pwDialog'); return d ? { text: d.textContent, focus: document.activeElement && document.activeElement.id } : null; });
    if (g1) { await lp.fill('#pwDialogInput', 'wrong-pass'); await lp.press('#pwDialogInput', 'Enter'); await lp.waitForTimeout(100); }
    const g2 = await lp.evaluate(() => ({ open: !!document.getElementById('pwDialog'), err: (document.getElementById('pwDialogErr') || {}).textContent }));
    if (g2.open) await lp.click('#pwDialog [data-pw="cancel"]');
    await lp.waitForTimeout(200);
    const g3 = { sf: await sfOf(), toast: await lp.textContent('#toast'), draft: await lp.$eval('[data-bind="management.decision.stampField"]', el => el.value), open: !!(await lp.$('#pwDialog')) };
    expect(g0 === 'final' && !!g1 && g1.text.includes('押印欄と連動') && g1.focus === 'pwDialogInput' && g2.open && g2.err === 'パスワードが違います' && !g3.open && g3.sf === 'final' && g3.toast.includes('保存しませんでした') && g3.draft === '',
      'E15 ロックの迂回: 「押印欄と連動」を「連動しない」に変えて保存しようとするとパスワードを求める・違うと「パスワードが違います」で保存されない（キャンセルで閉じても下書きは残る）: ' + JSON.stringify({ g0, g1: g1 && g1.focus, g2, g3 }));
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    if (await lp.$('#pwDialogInput')) { await lp.fill('#pwDialogInput', PW); await lp.press('#pwDialogInput', 'Enter'); await lp.waitForTimeout(300); }
    const g4 = { sf: await sfOf(), open: !!(await lp.$('#pwDialog')), toast: await lp.textContent('#toast') };
    await lp.fill('[data-bind="management.fields[1].hint"]', '店長が確認');
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    const g5 = { open: !!(await lp.$('#pwDialog')), hint: await lp.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).management.fields[1].hint) };
    //   押印欄の表示名を変える保存（面接対応者の欄を「最終確認」・最終確認の欄を「面接対応者」に入れ替える）もパスワードを求める（パスワードなしに押した印を最終確認に見せない。11 章 L5c）
    await lp.fill('[data-bind="management.fields[0].label"]', '最終確認');
    await lp.fill('[data-bind="management.fields[1].label"]', '面接対応者');
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    const g5b = await lp.evaluate(() => { const d = document.getElementById('pwDialog'); return d ? d.textContent : ''; });
    if (g5b) await lp.click('#pwDialog [data-pw="cancel"]');
    await lp.waitForTimeout(200);
    g5.swap = { dlg: g5b.includes('押印欄の表示名'), labels: await lp.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).management.fields.map(f => f.label).join(',')) };
    await lp.fill('[data-bind="management.fields[0].label"]', '面接対応者');
    await lp.fill('[data-bind="management.fields[1].label"]', '最終確認（店長）');
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    g5.relabel = !!(await lp.$('#pwDialog'));
    if (g5.relabel) { await lp.fill('#pwDialogInput', PW); await lp.press('#pwDialogInput', 'Enter'); await lp.waitForTimeout(300); }
    g5.label = await lp.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).management.fields[1].label);
    await lp.uncheck('[data-bind="management.decision.enabled"]');
    await lp.click('#view-settings [data-action="save"]');
    await lp.waitForTimeout(300);
    const g6 = !!(await lp.$('#pwDialog'));
    if (g6) await lp.keyboard.press('Escape');
    await lp.waitForTimeout(200);
    const g7 = await lp.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).management.decision.enabled);
    expect(g4.sf === '' && !g4.open && g4.toast.includes('設定を保存しました') && !g5.open && g5.hint === '店長が確認' && g5.swap.dlg && g5.swap.labels === '面接対応者,最終確認' &&
      g5.relabel && g5.label === '最終確認（店長）' && g6 && g7 === true,
      'E15 ロックの迂回: 正しいパスワードなら「連動しない」を保存できる・押印欄の説明だけの変更はパスワード不要・押印欄の表示名の変更（入れ替え）は求める（キャンセルで保存しない・正しければ保存）・最終合否の ON/OFF も求める（Esc でやめると保存しない）: ' + JSON.stringify({ g4, g5, g6, g7 }));
    const profG = await lp.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')));
    profG.management.fields.push({ id: 'extra', label: '追加確認', hint: '' });
    await lp.setInputFiles('#profileFileInput', { name: 'profile-scope.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profG)) });
    await lp.waitForTimeout(300);
    const g8 = await lp.evaluate(() => { const d = document.getElementById('pwDialog'); return d ? d.textContent : ''; });
    if (g8) await lp.click('#pwDialog [data-pw="cancel"]');
    await lp.waitForTimeout(200);
    const g9 = await lp.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).management.fields.map(f => f.id).join(','));
    expect(g8.includes('押印欄の構成') && g9 === 'interviewer,final',
      'E15 ロックの迂回: 同じパスワードでも押印欄の構成が変わる JSON の読み込みは現在のパスワードが要る（キャンセルなら読み込まない）: ' + JSON.stringify({ g8: !!g8, g9 }));
    // 報告書: 「連動しない」でも最終確認欄はパスワード欄。最終合否もパスワード（読み込み直したので解錠していない）
    await lp.click('.nav-item[data-view="judge"]');
    await lp.waitForTimeout(300);
    await lp.fill('[data-field="name"]', '鍵 迂回');
    await lp.click('[data-action="script-next"]');
    await lp.waitForTimeout(300);
    await ivToReport(lp);
    const c9 = await cards();
    const [dlD] = await Promise.all([lp.waitForEvent('download'), lp.click('#btnSave')]);
    const fD = path.join(OUT, 'lock-local-d.html');
    await dlD.saveAs(fD);
    const cfgD = cfgOf(fs.readFileSync(fD, 'utf8'));
    const rD = await newReportPage(e15);
    await rD.goto('file://' + fD);
    await rD.waitForTimeout(300);
    await openStamp(rD, 'final');
    const pD1 = await popOf(rD);
    if (pD1 && pD1.pw) { await rD.fill('#a4Pop .pop-pw', PW); await rD.press('#a4Pop .pop-pw', 'Enter'); await rD.waitForTimeout(100); }
    const pD2 = await popOf(rD);
    await rD.close();
    expect(c9.ivSel && c9.finLock && !c9.finBtn && c9.decLock && !c9.decBtn && cfgD.lockField === '' && JSON.stringify(cfgD.lockFields) === '["final"]' &&
      !!pD1 && pD1.pw && !pD1.act && !!pD2 && !pD2.pw && pD2.act,
      'E15 ロックの迂回: 「連動しない」を保存したあとも最終確認欄の押印・取消はパスワードが要る（報告書と保存 HTML。保存 HTML の lockFields は ["final"]・正しいと解錠）: ' + JSON.stringify({ c9, lockFields: cfgD.lockFields, pD1, pD2 }));
    // (10) 同じ file:// の localStorage を公開版と共有する（docs/SPEC-a4.md 11 章 L6c）: 公開版で設定を保存しても（空のロックを書いても）・公開版で「外した」印の
    //      JSON を読み込んでも、ローカル版のロックは外れない。ローカル版の［パスワードを外す］で外したとき（「外した」印）だけ外れたまま（公開版で保存しても）
    const toJ15 = async (pg, name) => {
      await pg.click('.nav-item[data-view="judge"]');
      await pg.waitForTimeout(250);
      if (await pg.evaluate(() => window.RecruitApp.state.step) !== 4) {
        await pg.fill('[data-field="name"]', name);
        await pg.click('[data-action="script-next"]');
        await pg.waitForTimeout(300);
        await ivToReport(pg);
      }
    };
    const cardsOf = (pg) => pg.evaluate(() => ({ finLock: !!document.querySelector('#mgmtCard .stamp-box[data-field-id="final"] .final-lock'), decLock: !!document.querySelector('#decisionCard .final-lock'),
      finBtn: !!document.querySelector('#mgmtCard .stamp-box[data-field-id="final"] [data-action="stamp"]'), decBtn: !!document.querySelector('#decisionCard [data-action="decide"]'),
      fin: !!(window.RecruitApp.state.management.final || {}).name }));
    const storedLock = (pg) => pg.evaluate(() => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1') || 'null'); return p ? (p.management || {}).finalLock : '(なし)'; });
    const toSet15 = async (pg) => { await pg.click('.nav-item[data-view="settings"]'); await pg.waitForTimeout(300); };
    const save15 = async (pg) => { await pg.click('#view-settings [data-action="save"]'); await pg.waitForTimeout(300); };
    await lp.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await lp.reload();
    await lp.waitForTimeout(300);
    await toJ15(lp, '共有 一郎');
    const k0 = { cards: await cardsOf(lp), stored: await storedLock(lp) };
    const pubP = await newReportPage(e15);
    await pubP.goto(FILE);
    await pubP.waitForTimeout(300);
    await toSet15(pubP);
    await save15(pubP);
    const k1 = await storedLock(pubP);
    const offJ = await pubP.evaluate(() => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1')); p.management.finalLock = { salt: '', hash: '', off: true }; p.meta.footer = 'off JSON'; return p; });
    await pubP.setInputFiles('#profileFileInput', { name: 'profile-off.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(offJ)) });
    await pubP.waitForTimeout(300);
    const k2 = { dlg: !!(await pubP.$('#pwDialog')), stored: await storedLock(pubP), footer: await pubP.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).meta.footer) };
    await lp.reload();
    await lp.waitForTimeout(300);
    await toJ15(lp, '共有 二郎');
    const k3 = await cardsOf(lp);
    expect(k0.cards.finLock && k0.cards.decLock && k0.stored === '(なし)' && !!k1 && k1.hash === '' && !k1.off && !k2.dlg && k2.footer === 'off JSON' && !(k2.stored || {}).off &&
      k3.finLock && k3.decLock && !k3.finBtn && !k3.decBtn,
      'E15 公開版と localStorage を共有: 公開版で設定を保存しても（空のロック）・公開版で「外した」印の JSON を読み込んでも、ローカル版の最終確認・最終合否はパスワード欄のまま: ' + JSON.stringify({ k0, k1, k2, k3 }));
    //   公開版でロックの無い状態から（現在のパスワードなしに）付けたパスワード・読み込んだ JSON のパスワードは、ローカル版では使わない（初期パスワードのまま。11 章 L6d）。
    //   公開版は自分で付けたパスワードで施錠される。ローカル版は開いただけでは公開版のロックを消さない
    const unlock15 = async (pg, pw) => {
      if (!(await pg.$('#mgmtCard .final-lock-pw'))) return 'no-field';
      await pg.fill('#mgmtCard .final-lock-pw', pw);
      await pg.press('#mgmtCard .final-lock-pw', 'Enter');
      await pg.waitForTimeout(200);
      return (await pg.$('#mgmtCard .final-lock-pw')) ? await pg.textContent('#mgmtCard .final-lock-err') : 'unlocked';
    };
    const isPw15 = (l, pw) => !!l && /^[0-9a-f]{64}$/.test(l.hash || '') && l.hash === require('crypto').createHash('sha256').update(l.salt + ':' + pw, 'utf8').digest('hex');
    await pubP.click('#finalLockChange');
    await pubP.waitForTimeout(100);
    const m0 = { cur: !!(await pubP.$('#lockCur')) };
    await pubP.fill('#lockNew', 'e2e-pub-pass');
    await pubP.fill('#lockNew2', 'e2e-pub-pass');
    await pubP.click('#finalLockApply');
    await pubP.waitForTimeout(100);
    await save15(pubP);
    m0.dlg = !!(await pubP.$('#pwDialog'));
    m0.stored = await storedLock(pubP);
    await toJ15(pubP, '共有 公開');
    const m1 = { pubCards: await cardsOf(pubP), pubOwn: await unlock15(pubP, 'e2e-pub-pass') };
    await lp.reload();
    await lp.waitForTimeout(300);
    await toJ15(lp, '共有 四郎');
    m1.cards = await cardsOf(lp);
    m1.pubPw = await unlock15(lp, 'e2e-pub-pass');
    m1.localPw = await unlock15(lp, PW);
    m1.kept = isPw15(await storedLock(lp), 'e2e-pub-pass');
    await lp.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await pubP.reload();
    await pubP.waitForTimeout(300);
    await toSet15(pubP);
    const jP = await pubP.evaluate(() => JSON.parse(JSON.stringify(window.RecruitApp.state.profile)));
    jP.management.finalLock = { salt: '0123456789abcdef0123456789abcdef', hash: 'ccba4209d4c619c1c04b48ed3af6126fedf36100a746aa78aed32d96b3d9ead0', chain: true };
    await pubP.setInputFiles('#profileFileInput', { name: 'profile-pub-lock.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(jP)) });
    await pubP.waitForTimeout(300);
    const m2 = { dlg: !!(await pubP.$('#pwDialog')), stored: await storedLock(pubP) };
    await lp.reload();
    await lp.waitForTimeout(300);
    await toJ15(lp, '共有 五郎');
    m2.cards = await cardsOf(lp);
    m2.jsonPw = await unlock15(lp, 'e2e-json-pass');
    m2.localPw = await unlock15(lp, PW);
    expect(!m0.cur && !m0.dlg && isPw15(m0.stored, 'e2e-pub-pass') && !m0.stored.chain && m1.pubCards.finLock && m1.pubOwn === 'unlocked' &&
      m1.cards.finLock && m1.cards.decLock && m1.pubPw === 'パスワードが違います' && m1.localPw === 'unlocked' && m1.kept &&
      !m2.dlg && isPw15(m2.stored, 'e2e-json-pass') && !m2.stored.chain && m2.cards.finLock && m2.jsonPw === 'パスワードが違います' && m2.localPw === 'unlocked',
      'E15 公開版と localStorage を共有: 公開版でロックの無い状態から付けたパスワード・読み込んだ JSON のパスワードでは、ローカル版は解錠できない（初期パスワードのまま。公開版は自分のパスワードで施錠）: ' +
      JSON.stringify({ m0: { cur: m0.cur, dlg: m0.dlg }, m1, m2: { dlg: m2.dlg, cards: m2.cards, jsonPw: m2.jsonPw, localPw: m2.localPw } }));
    await toSet15(lp);
    if (await lp.$('#finalLockRemove')) {   // （ロックが外れてしまっていると［パスワードを外す］は無い。上の確認が FAIL になる）
      await lp.click('#finalLockRemove');
      await lp.waitForTimeout(100);
      await lp.fill('#lockCur', PW);
      await lp.click('#finalLockRemoveApply');
      await lp.waitForTimeout(100);
    }
    await save15(lp);
    const k4 = await storedLock(lp);
    await pubP.reload();
    await pubP.waitForTimeout(300);
    await toSet15(pubP);
    await save15(pubP);
    const k5 = await storedLock(pubP);
    await pubP.close();
    await lp.reload();
    await lp.waitForTimeout(300);
    await toJ15(lp, '共有 三郎');
    const k6 = await cardsOf(lp);
    expect(!!k4 && k4.off === true && k4.hash === '' && !!k5 && k5.off === true && !k6.finLock && !k6.decLock && k6.finBtn && k6.decBtn,
      'E15 ローカル版の［パスワードを外す］で外した設定（「外した」印 off: true）は、公開版で保存しても外れたまま: ' + JSON.stringify({ k4, k5, k6 }));
    // (11) 古いタブ（docs/SPEC-a4.md 11 章 L5d）: ロックが無いときに開いたタブ B は、タブ A（lp）でパスワードを付けると読み込み直し（storage イベント）、
    //      報告書の最終確認・最終合否はパスワード欄になる。B で表示名だけ変えて保存しても A のロックを上書きしない。B の下書きで変えていたパスワードは取り消す。
    //      storage イベントが届かなくても、保存・押印の直前に localStorage と比べる
    const tabB = await newReportPage(e15);
    await tabB.goto('file://' + OUTL);
    await tabB.waitForTimeout(300);
    await toJ15(tabB, '古い タブ');
    const t0 = await cardsOf(tabB);
    await toSet15(lp);
    await lp.click('#finalLockChange');
    await lp.waitForTimeout(100);
    await lp.fill('#lockNew', PW3);
    await lp.fill('#lockNew2', PW3);
    await lp.click('#finalLockApply');
    await lp.waitForTimeout(100);
    await save15(lp);
    const lkA = await storedLock(lp);
    await tabB.waitForTimeout(300);
    const t1 = { cards: await cardsOf(tabB), toast: await tabB.textContent('#toast') };
    await toSet15(tabB);
    await tabB.fill('[data-bind="management.fields[0].hint"]', '面接対応者（B）');
    await save15(tabB);
    const t2 = { dlg: !!(await tabB.$('#pwDialog')), stored: await storedLock(tabB), label: await tabB.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).management.fields[0].hint) };
    expect(!t0.finLock && t0.finBtn && !!lkA && /^[0-9a-f]{64}$/.test(lkA.hash) && t1.cards.finLock && t1.cards.decLock && !t1.cards.finBtn && !t1.cards.decBtn && t1.toast.includes('別のタブ') &&
      !t2.dlg && t2.stored.hash === lkA.hash && t2.label === '面接対応者（B）',
      'E15 古いタブ: A でパスワードを付けると B は読み込み直して報告書はパスワード欄・B で押印欄の説明だけ変えて保存しても A のパスワードは外れない: ' + JSON.stringify({ t0, t1, t2: { dlg: t2.dlg, same: t2.stored.hash === lkA.hash, label: t2.label } }));
    //   B の下書きでパスワードを変えている間に、A で別のパスワード（NEWPW）に変えて保存 → B の下書きのパスワードの変更は取り消す（ほかの下書きは残る）→ B で保存しても A のパスワードのまま
    await tabB.click('#finalLockChange');
    await tabB.waitForTimeout(100);
    if (await tabB.$('#lockCur')) await tabB.fill('#lockCur', PW3);   // （B が古いロックのままだと現在のパスワードの欄が無い。上の確認が FAIL になる）
    await tabB.fill('#lockNew', 'e2e-b-pass');
    await tabB.fill('#lockNew2', 'e2e-b-pass');
    await tabB.click('#finalLockApply');
    await tabB.waitForTimeout(100);
    await tabB.fill('[data-bind="meta.footer"]', 'B の変更');
    await tabB.locator('[data-bind="meta.footer"]').blur();
    await tabB.waitForTimeout(100);
    const t3a = await tabB.textContent('#finalLockStatus');
    await toSet15(lp);
    await lp.click('#finalLockChange');
    await lp.waitForTimeout(100);
    if (await lp.$('#lockCur')) await lp.fill('#lockCur', PW3);
    await lp.fill('#lockNew', NEWPW);
    await lp.fill('#lockNew2', NEWPW);
    await lp.click('#finalLockApply');
    await lp.waitForTimeout(100);
    await save15(lp);
    const lkA2 = await storedLock(lp);
    await tabB.waitForTimeout(300);
    const t3 = { toast: await tabB.textContent('#toast'), status: await tabB.textContent('#finalLockStatus'), footer: await tabB.inputValue('[data-bind="meta.footer"]') };
    await save15(tabB);
    const t4 = { dlg: !!(await tabB.$('#pwDialog')), stored: await storedLock(tabB), footer: await tabB.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).meta.footer) };
    expect(t3a.includes('未保存') && lkA2.hash !== lkA.hash && t3.toast.includes('パスワードの変更を取り消しました') && !t3.status.includes('未保存') && t3.footer === 'B の変更' &&
      !t4.dlg && t4.stored.hash === lkA2.hash && t4.footer === 'B の変更',
      'E15 古いタブ: B の下書きで変えていたパスワードは、A でパスワードが変わると取り消す（ほかの下書きは残る）・B で保存しても A のパスワードのまま: ' + JSON.stringify({ t3a, t3, t4: { dlg: t4.dlg, same: t4.stored.hash === lkA2.hash, footer: t4.footer } }));
    //   storage イベントが届かない場合（B 自身のページで localStorage を書き換えて再現。B には storage イベントが来ない）: 保存の直前に比べて最新のロックを上書きしない
    //   （別のタブのローカル版が書くロック・「外した」印には chain: true が付く。11 章 L6d）
    const putLock = (pg, l) => pg.evaluate((lk) => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1')); p.management.finalLock = lk; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); }, l);
    const lockLc = Object.assign({}, lockL, { chain: true });
    await putLock(tabB, lockLc);
    await tabB.fill('[data-bind="meta.footer"]', 'B の変更 2');
    await save15(tabB);
    const t5 = { dlg: !!(await tabB.$('#pwDialog')), stored: await storedLock(tabB), footer: await tabB.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).meta.footer) };
    //   別のタブでロック以外だけが変わったときは、B の下書きのパスワードの変更（現在のパスワードで確かめたもの）は取り消さない（保存すると B のパスワード）
    await tabB.click('#finalLockChange');
    await tabB.waitForTimeout(100);
    if (await tabB.$('#lockCur')) await tabB.fill('#lockCur', PW);
    await tabB.fill('#lockNew', 'e2e-b-pass');
    await tabB.fill('#lockNew2', 'e2e-b-pass');
    await tabB.click('#finalLockApply');
    await tabB.waitForTimeout(100);
    await toSet15(lp);
    await lp.fill('[data-bind="meta.footer"]', 'A の変更');
    await lp.locator('[data-bind="meta.footer"]').blur();
    await save15(lp);
    await tabB.waitForTimeout(300);
    const t5b = { status: await tabB.textContent('#finalLockStatus'), toast: await tabB.textContent('#toast') };
    await save15(tabB);
    const lkB = await storedLock(tabB);
    const isB = !!lkB && lkB.hash === require('crypto').createHash('sha256').update(lkB.salt + ':e2e-b-pass', 'utf8').digest('hex');
    expect(t5b.status.includes('未保存') && t5b.toast.includes('別のタブ') && !t5b.toast.includes('取り消しました') && isB,
      'E15 古いタブ: 別のタブでロック以外だけが変わったときは、B の下書きのパスワードの変更は残り、保存すると B のパスワード: ' + JSON.stringify({ t5b, isB }));
    //   B でパスワードのダイアログを出しているあいだに A でロックが変わったら、B で（古い）正しいパスワードを入れても保存しない（A の新しいロックを古い設定で上書きしない）
    await toSet15(tabB);
    await tabB.selectOption('[data-bind="management.decision.stampField"]', '');
    await save15(tabB);
    const d0 = !!(await tabB.$('#pwDialog'));
    await toSet15(lp);
    await lp.click('#finalLockChange');
    await lp.waitForTimeout(100);
    if (await lp.$('#lockCur')) await lp.fill('#lockCur', 'e2e-b-pass');
    await lp.fill('#lockNew', PW3);
    await lp.fill('#lockNew2', PW3);
    await lp.click('#finalLockApply');
    await lp.waitForTimeout(100);
    await save15(lp);
    const lkA3 = await storedLock(lp);
    await tabB.waitForTimeout(300);
    if (await tabB.$('#pwDialogInput')) { await tabB.fill('#pwDialogInput', 'e2e-b-pass'); await tabB.press('#pwDialogInput', 'Enter'); await tabB.waitForTimeout(300); }
    const d1 = { open: !!(await tabB.$('#pwDialog')), same: (await storedLock(tabB)).hash === lkA3.hash, sf: await tabB.evaluate(() => JSON.parse(localStorage.getItem('recruit.profile.v1')).management.decision.stampField), toast: await tabB.textContent('#toast') };
    expect(d0 && !!lkA3 && lkA3.hash !== lkB.hash && !d1.open && d1.same && d1.sf === 'final' && d1.toast.includes('やめました'),
      'E15 古いタブ: B でパスワードのダイアログを出しているあいだに A でパスワードが変わると、B で前のパスワードを入れても保存しない（A のロックのまま）: ' + JSON.stringify({ d0, d1 }));
    //   報告書の押印の直前にも比べる: B を「外した」状態で開き直して 報告書を出したあと、B のページで localStorage にロックを書く → 最終確認の［押印］は押さずに描き直す（パスワード欄）
    await putLock(tabB, { salt: '', hash: '', off: true, chain: true });
    await tabB.reload();
    await tabB.waitForTimeout(300);
    await toJ15(tabB, '古い タブ');
    const t6 = await cardsOf(tabB);
    await tabB.selectOption('#mgmtCard .stamp-box[data-field-id="final"] select', { index: 1 });
    await putLock(tabB, lockLc);
    await tabB.click('#mgmtCard .stamp-box[data-field-id="final"] [data-action="stamp"]');
    await tabB.waitForTimeout(300);
    const t7 = await cardsOf(tabB);
    //   報告書の［報告書を保存（HTML）］の直前にも比べる: 「外した」状態で開いた B のページで localStorage にロックを書いてから（storage イベントなし）保存すると、
    //   書き出したファイルは最新のロック（ロックなし〔null〕で書き出さない）
    await putLock(tabB, { salt: '', hash: '', off: true, chain: true });
    await tabB.reload();
    await tabB.waitForTimeout(300);
    await toJ15(tabB, '古い 保存');
    const t8 = { cards: await cardsOf(tabB) };
    await putLock(tabB, lockLc);
    const [dl8] = await Promise.all([tabB.waitForEvent('download'), tabB.click('#reportSaveBtn')]);
    const f8 = path.join(OUT, 'lock-stale-save.html');
    await dl8.saveAs(f8);
    t8.cfg = cfgOf(fs.readFileSync(f8, 'utf8')).finalLock;
    t8.after = await cardsOf(tabB);
    expect(!t8.cards.finLock && t8.cards.finBtn && !!t8.cfg && t8.cfg.hash === lockL.hash && t8.cfg.salt === lockL.salt && t8.after.finLock && t8.after.decLock,
      'E15 古いタブ: storage イベントが届かなくても、報告書の保存（HTML）の直前に比べて最新のロックで書き出す（報告書もパスワード欄に描き直す）: ' + JSON.stringify({ cards: t8.cards, cfg: !!t8.cfg, after: t8.after }));
    //   設定画面で入力中のパスワードの欄（［変更］。下書きには入らない）は、別のタブでロック以外だけが保存されても閉じず、入力も残る（下書きは最新の設定）。
    //   別のタブでパスワードが変わったときは閉じる
    await toSet15(tabB);
    await tabB.click('#finalLockChange');
    await tabB.waitForTimeout(100);
    if (await tabB.$('#lockCur')) await tabB.fill('#lockCur', PW);   // （B が古いロックのままだと現在のパスワードの欄が無い。下の確認が FAIL になる）
    await tabB.fill('#lockNew', 'e2e-b-form');
    await tabB.fill('#lockNew2', 'e2e-b-form');
    await toSet15(lp);
    await lp.fill('[data-bind="meta.footer"]', 'A の変更 3');
    await lp.locator('[data-bind="meta.footer"]').blur();
    await save15(lp);
    await tabB.waitForTimeout(300);
    const t9 = await tabB.evaluate(() => ({ form: (document.getElementById('finalLockForm') || { getAttribute: () => '' }).getAttribute('data-lock-form'),
      cur: (document.getElementById('lockCur') || {}).value || '', nw: (document.getElementById('lockNew') || {}).value || '', nw2: (document.getElementById('lockNew2') || {}).value || '',
      footer: (document.querySelector('[data-bind="meta.footer"]') || {}).value || '', toast: document.getElementById('toast').textContent }));
    if (await tabB.$('#finalLockApply')) await tabB.click('#finalLockApply');   // （入力欄が閉じてしまっていると無い。下の確認が FAIL になる）
    await tabB.waitForTimeout(100);
    await save15(tabB);
    t9.saved = await tabB.evaluate(() => { const p = JSON.parse(localStorage.getItem('recruit.profile.v1')); return { footer: p.meta.footer, lock: p.management.finalLock }; });
    t9.isB = isPw15(t9.saved.lock, 'e2e-b-form') && t9.saved.lock.chain === true;
    await tabB.click('#finalLockChange');
    await tabB.waitForTimeout(100);
    if (await tabB.$('#lockCur')) await tabB.fill('#lockCur', 'e2e-b-form');
    await toSet15(lp);
    await lp.click('#finalLockChange');
    await lp.waitForTimeout(100);
    if (await lp.$('#lockCur')) await lp.fill('#lockCur', 'e2e-b-form');
    await lp.fill('#lockNew', PW);
    await lp.fill('#lockNew2', PW);
    await lp.click('#finalLockApply');
    await lp.waitForTimeout(100);
    await save15(lp);
    await tabB.waitForTimeout(300);
    const t10 = await tabB.evaluate(() => ({ form: !!document.getElementById('finalLockForm'), toast: document.getElementById('toast').textContent }));
    await tabB.close();
    expect(t9.form === 'change' && t9.cur === PW && t9.nw === 'e2e-b-form' && t9.nw2 === 'e2e-b-form' && t9.footer === 'A の変更 3' && t9.toast.includes('別のタブ') &&
      t9.saved.footer === 'A の変更 3' && t9.isB && !t10.form && t10.toast.includes('入力中のパスワードの欄を閉じました'),
      'E15 古いタブ: 入力中のパスワードの欄は、別のタブでロック以外だけが保存されても閉じない（入力が残り、下書きは最新・続けて変更して保存できる）・パスワードが変わったときは閉じる: ' +
      JSON.stringify({ t9: { form: t9.form, footer: t9.footer, saved: t9.saved.footer, isB: t9.isB }, t10 }));
    expect(!t5.dlg && t5.stored.hash === lockL.hash && t5.footer === 'B の変更 2' && !t6.finLock && t6.finBtn && !t7.fin && t7.finLock && t7.decLock && !t7.finBtn,
      'E15 古いタブ: storage イベントが届かなくても、保存の直前に比べて最新のロックを上書きしない・報告書の押印の直前にも比べる（押さずにパスワード欄で描き直す）: ' + JSON.stringify({ t5: { dlg: t5.dlg, same: t5.stored.hash === lockL.hash, footer: t5.footer }, t6, t7 }));
    // (12) ロックの無いアプリ（公開版）で、ロック付きで保存した記録を読み込むと、その記録の最終確認・最終合否はファイルのロックで守り、保存し直すファイルにも入れる（11 章 L7b）。
    //      fA（ローカル版で保存。面接対応者・最終確認の押印と最終合否「採用」入り）を、ロックの無い公開版で読み込む
    const pubR = await newReportPage(e15);
    await pubR.goto(FILE);
    await pubR.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await pubR.reload();
    await pubR.waitForTimeout(300);
    await pubR.setInputFiles('#fileInput', fA);
    await pubR.waitForTimeout(500);
    const q0 = await cardsOf(pubR);
    Object.assign(q0, await pubR.evaluate(() => ({ step: window.RecruitApp.state.step, toast: document.getElementById('toast').textContent,
      unstamp: !!document.querySelector('#mgmtCard .stamp-box[data-field-id="final"] [data-action="unstamp"]'), undecide: !!document.querySelector('#decisionCard [data-action="undecide"]'),
      ivSel: !!document.querySelector('#mgmtCard .stamp-box[data-field-id="interviewer"] select') })));
    const [dlQ] = await Promise.all([pubR.waitForEvent('download'), pubR.click('#btnSave')]);
    const fQ = path.join(OUT, 'lock-public-resave.html');
    await dlQ.saveAs(fQ);
    const cfgQ = cfgOf(fs.readFileSync(fQ, 'utf8'));
    const q1 = { wrong: await unlock15(pubR, 'wrong-pass'), right: await unlock15(pubR, PW) };
    if (await pubR.$('#decisionCard [data-action="undecide"]')) await pubR.click('#decisionCard [data-action="undecide"]');
    await pubR.waitForTimeout(200);
    q1.dec = await pubR.evaluate(() => (window.RecruitApp.state.decision || {}).result || '');
    await pubR.click('#btnNew');
    await pubR.waitForTimeout(200);
    await toJ15(pubR, '公開 新規');
    const q2 = await cardsOf(pubR);
    await pubR.close();
    const rQ = await newReportPage(e15);
    await rQ.goto('file://' + fQ);
    await rQ.waitForTimeout(300);
    await openDecision(rQ);
    const pQ = await popOf(rQ);
    await rQ.close();
    expect(q0.step === 4 && q0.fin && q0.finLock && q0.decLock && !q0.finBtn && !q0.decBtn && !q0.unstamp && !q0.undecide && q0.ivSel && q0.toast.includes('最終承認のパスワード付き') &&
      !!cfgQ.finalLock && cfgQ.finalLock.hash === lockL.hash && cfgQ.finalLock.salt === lockL.salt && !!pQ && pQ.pw && !pQ.act &&
      q1.wrong === 'パスワードが違います' && q1.right === 'unlocked' && q1.dec === '' && !q2.finLock && !q2.decLock && q2.finBtn && q2.decBtn,
      'E15 ロックの無いアプリ（公開版）でロック付きの記録を読み込む: 最終確認・最終合否はファイルのパスワード欄（取消もできない）・保存し直したファイルにもそのロック・正しいパスワードで取消できる・新規にすると外れる: ' +
      JSON.stringify({ q0, cfgQ: !!cfgQ.finalLock, pQ, q1, q2 }));
    await lp.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await lp.close();
    expect(e15.length === 0, 'E15 ページエラー・console error なし: ' + (e15.join(' / ') || 'none'));
  }
  await fresh();

  // =====================================================================
  // E16 用紙を埋めるレイアウト（docs/SPEC-a4.md 12 章。ユーザー「印刷すると空白が多くなる」）
  //   押印行は用紙の内寸の下端・その上の「面接メモ・所見」の枠が残りの高さいっぱい（記入なしでも枠と点線の罫線）・内容が少なければゆったり（.cl-roomy）
  // =====================================================================
  console.log('\n== E16 用紙を埋めるレイアウト ==');
  {
    const e16 = [];
    const formOf = (pg, sel) => pg.evaluate((s) => {
      const a = document.querySelector(s), sh = a.querySelector('.cl-sheet'), st = a.querySelector('.cl-stamps'), box = a.querySelector('.cl-nm-box'), ex = a.querySelector('.cl-exline');
      const z = sh.getBoundingClientRect().width / sh.offsetWidth || 1, mm = 96 / 25.4;
      const ar = a.getBoundingClientRect(), innerB = ar.bottom - parseFloat(getComputedStyle(a).paddingBottom) * z;
      sh.classList.add('cl-measure'); const nat = sh.getBoundingClientRect().height / z; sh.classList.remove('cl-measure');
      const lw = box && box.querySelector('.cl-nm-lines'), lines = lw ? Array.from(lw.querySelectorAll('i')) : [];
      const lb = lw ? lw.getBoundingClientRect().bottom : 0;
      // 面接所見の表示行数・「…」で切れたメモ（.cl-nm-v）の数・罫線の部分（空き）の高さ（docs/SPEC-a4.md 12 章 F5）
      const iv = a.querySelector('.cl-nm-iv .cl-nm-v');
      return { cls: sh.className.replace('cl-sheet cl-mode-sheet', '').trim(), zoom: sh.style.zoom, nat: Math.round(nat), fill: Math.round(sh.getBoundingClientRect().height / z),
        ivLines: iv ? Math.round(iv.getBoundingClientRect().height / parseFloat(getComputedStyle(iv).lineHeight) / z) : 0, nmCut: a.querySelectorAll('.cl-nm-v.cl-cut').length,
        linesMm: lw ? +(lw.getBoundingClientRect().height / z / mm).toFixed(2) : 0, ref: !!a.querySelector('.cl-nm-ref') && a.querySelector('.cl-nm-ref').getClientRects().length > 0,
        gapMm: +((innerB - st.getBoundingClientRect().bottom) / z / mm).toFixed(2), boxMm: box ? +(box.getBoundingClientRect().height / z / mm).toFixed(1) : 0,
        empty: !!box && box.classList.contains('is-empty'), rows: a.querySelectorAll('.cl-nm-row').length, lines: lines.filter(i => i.getBoundingClientRect().bottom <= lb + 0.5).length,
        pitchMm: lines.length > 1 ? +((lines[1].getBoundingClientRect().top - lines[0].getBoundingClientRect().top) / z / mm).toFixed(2) : 0, dotted: lines.length ? getComputedStyle(lines[0]).borderBottomStyle : '',
        order: !!ex && !!box && box.closest('.cl-blk-notes').nextElementSibling === ex && ex.nextElementSibling === st && st === sh.lastElementChild,
        body: parseFloat(getComputedStyle(sh).fontSize), h3: (a.querySelector('.cl-blk-notes .cl-h') || {}).textContent };
    }, sel);
    const okGap = (f) => f.gapMm >= 0 && f.gapMm <= 2;
    const p16 = await newReportPage(e16);
    await p16.setViewportSize({ width: 1440, height: 1300 });
    // (1) 通常の記録（E3 の採用・押印済みの保存 HTML）
    await p16.goto('file://' + file34b);
    await p16.waitForTimeout(400);
    await p16.mouse.move(0, 0);
    const n16 = await formOf(p16, '#a4');
    await p16.locator('#a4').screenshot({ path: path.join(OUT, 'a4-form.png') });
    const pdf16 = path.join(OUT, 'a4-form.pdf');
    await p16.pdf({ path: pdf16, format: 'A4', printBackground: true });
    const np16 = pdfPagesOf(pdf16);
    expect(n16.cls.includes('cl-roomy') && !n16.cls.includes('cl-compact') && n16.body === 10.5 && n16.nat <= 1052 && okGap(n16) && n16.boxMm >= 30 && n16.rows > 0 && n16.lines >= 3 &&
      Math.abs(n16.pitchMm - 7.5) <= 0.1 && n16.dotted === 'dotted' && n16.order && n16.h3 === '面接メモ・所見' && (np16 === -1 || np16 === 1),
      'E16 通常の記録: ゆったり（本文 10.5px）・押印行の下端は用紙の内寸の下端から 2mm 以内・面接メモ・所見の枠は 30mm 以上（記入の下に 7.5mm 間隔の点線）・説明・連絡は枠の下・印刷 1 ページ: ' + JSON.stringify(Object.assign({ pages: np16 }, n16)));
    if (hasPpm14) {
      const prn16 = png14(pdf16, path.join(OUT, 'a4-form-print'));
      const c16 = await cmp14(path.join(OUT, 'a4-form.png'), prn16);
      expect(c16.diff.every(d => d <= 0.02) && c16.mean <= 4 && c16.a[3] >= 0.95 && c16.b[3] >= 0.95,
        'E16 画面の用紙と印刷（PDF の 1 ページ目 a4-form-print.png）が同じ・どちらも用紙の下端（95% 以上）まで使う: ' + JSON.stringify(c16));
    } else console.log('SKIP pdftoppm が使えないため a4-form-print.png の比較を省略');
    // (2) 重いサンプル（全メモ 300 字・面接所見 1,500 字）: ゆったりにしない・1 ページ・押印行は下端
    await p16.goto('file://' + saved39.file);
    await p16.waitForTimeout(400);
    await p16.mouse.move(0, 0);
    const h16 = await formOf(p16, '#a4');
    await p16.locator('#a4').screenshot({ path: path.join(OUT, 'a4-form-heavy.png') });
    const pdf16h = path.join(OUT, 'a4-form-heavy.pdf');
    await p16.pdf({ path: pdf16h, format: 'A4', printBackground: true });
    const np16h = pdfPagesOf(pdf16h);
    expect(h16.cls.includes('cl-compact') && !h16.cls.includes('cl-roomy') && h16.nat <= 1052 && okGap(h16) && h16.order && (np16h === -1 || np16h === 1),
      'E16 重いサンプル: .cl-compact（ゆったりにしない）・内容は 1052px 以内・1 ページで押印行は用紙の内寸の下端: ' + JSON.stringify(Object.assign({ pages: np16h }, h16)));
    //   切れたメモは罫線の空きまで広げる（docs/SPEC-a4.md 12 章 F5）: 面接所見は .cl-compact の 10 行より多く、まだ切れているメモがあるので罫線の空きは 1 行分（7.5mm）未満
    expect(h16.ivLines > 10 && h16.nmCut > 0 && h16.linesMm < 7 && h16.ref,
      'E16 重いサンプル: 「…」で切れたメモは面接メモ・所見の枠の空きまで広げる（面接所見 ' + h16.ivLines + ' 行＞10 行・切れたメモが残るので罫線の空きは 7mm 未満・「…」の案内は残す）: ' + JSON.stringify({ ivLines: h16.ivLines, nmCut: h16.nmCut, linesMm: h16.linesMm, ref: h16.ref }));
    if (hasPpm14) {
      const c16h = await cmp14(path.join(OUT, 'a4-form-heavy.png'), png14(pdf16h, path.join(OUT, 'a4-form-heavy-print')));
      expect(c16h.diff.every(d => d <= 0.02) && c16h.mean <= 4 && c16h.a[3] >= 0.95 && c16h.b[3] >= 0.95,
        'E16 重いサンプル: 画面の用紙と印刷（PDF の 1 ページ目）が同じ（広げた行数のまま印刷する）: ' + JSON.stringify(c16h));
    } else console.log('SKIP pdftoppm が使えないため a4-form-heavy-print.png の比較を省略');
    //   狭い画面（390px・--a4-zoom 0.45 前後）で開いても同じ行数（縮小を外して計測）・押印行は用紙の内寸の下端（縮小で内容が伸びた分は枠が縮んで吸収）
    const st16h = await p16.evaluate(() => Array.from(document.querySelectorAll('#a4 .cl-nm-v')).map(v => v.style.getPropertyValue('-webkit-line-clamp')).join(','));
    await p16.setViewportSize({ width: 390, height: 844 });
    await p16.goto('file://' + saved39.file);
    await p16.waitForTimeout(400);
    const h16n = await formOf(p16, '#a4');
    const st16n = await p16.evaluate(() => Array.from(document.querySelectorAll('#a4 .cl-nm-v')).map(v => v.style.getPropertyValue('-webkit-line-clamp')).join(','));
    await p16.setViewportSize({ width: 1440, height: 1300 });
    expect(st16h === st16n && /\d/.test(st16h) && h16n.cls === h16.cls && h16n.gapMm >= -0.1 && h16n.gapMm <= 2,
      'E16 重いサンプルを 390px で開いても同じ行数・押印行は用紙の内寸の下端: ' + JSON.stringify({ st16h, st16n, gapMm: h16n.gapMm, cls: h16n.cls }));
    //   書き出したファイルを開き直しても同じ（インラインの行数は測り直す前に外す）: 押印して書き出す → 開き直す
    await p16.goto('file://' + saved39.file);
    await p16.waitForTimeout(400);
    await openStamp(p16, 'interviewer');
    await popAct(p16, 'unstamp');
    const st16a = await p16.evaluate(() => Array.from(document.querySelectorAll('#a4 .cl-nm-v')).map(v => v.style.getPropertyValue('-webkit-line-clamp')).join(','));
    const [dl16] = await Promise.all([p16.waitForEvent('download'), p16.click('#saveBarBtn')]);
    const f16x = path.join(OUT, 'a4-form-heavy-exported.html');
    await dl16.saveAs(f16x);
    await p16.goto('file://' + f16x);
    await p16.waitForTimeout(400);
    const h16x = await formOf(p16, '#a4');
    const st16x = await p16.evaluate(() => Array.from(document.querySelectorAll('#a4 .cl-nm-v')).map(v => v.style.getPropertyValue('-webkit-line-clamp')).join(','));
    const lv16x = await p16.evaluate(() => window.__a4Fit());
    const st16y = await p16.evaluate(() => Array.from(document.querySelectorAll('#a4 .cl-nm-v')).map(v => v.style.getPropertyValue('-webkit-line-clamp')).join(','));
    //   （2026-10-16 から重いサンプルは質問ごとのメモ 13 個。質問の回答を 1 行に詰める .cl-compact-q1 の段階になる）
    expect(/\d/.test(st16a) && st16x === st16a && st16y === st16a && lv16x === 'cl-compact-q1' && h16x.cls === h16.cls && okGap(h16x),
      'E16 重いサンプル: 書き出したファイルを開き直しても・測り直しても同じ行数（インラインの行数を外してから測る）: ' + JSON.stringify({ st16h, st16a, st16x, st16y, lv16x }));
    //   極端な例（面接所見 4,000 字・全メモ 300 字）でも 1 ページ・押印行は下端・罫線の空きは 1 行分未満
    const f16k = path.join(OUT, 'a4-form-iv4000.html');
    fs.writeFileSync(f16k, await page.evaluate(mk39, { q: 300, iv: 4000, memo: 300 }));
    await p16.goto('file://' + f16k);
    await p16.waitForTimeout(400);
    const k16 = await formOf(p16, '#a4');
    const pdf16k = path.join(OUT, 'a4-form-iv4000.pdf');
    await p16.pdf({ path: pdf16k, format: 'A4', printBackground: true });
    const np16k = pdfPagesOf(pdf16k);
    expect(k16.nat <= 1052 && okGap(k16) && k16.ivLines > 10 && k16.linesMm < 7 && (np16k === -1 || np16k === 1),
      'E16 面接所見 4,000 字・全メモ 300 字でも 1 ページ・押印行は下端・罫線の空きは 7mm 未満: ' + JSON.stringify({ pages: np16k, cls: k16.cls, nat: k16.nat, gapMm: k16.gapMm, ivLines: k16.ivLines, linesMm: k16.linesMm }));
    //   狭い画面（540〜320px）でも記入が切れない（docs/SPEC-a4.md 12 章 F7）: 縮小は transform:scale なのでレイアウト（行の高さ・折り返し）は 1440px と同じ。
    //   面接メモ・所見の枠（.cl-nm）の中身が隠れない（scrollHeight ≦ clientHeight + 1）・行数と各行の高さ（縮小前の値）が 1440px と同じ・押印行は下端・横スクロールなし。
    //   重いサンプル（押印あり）・質問の回答 600 字×5・面接所見 4,000 字・押印欄 4 件
    const nw16 = (pg) => pg.evaluate(() => {
      const a = document.getElementById('a4'), z = a.getBoundingClientRect().width / a.offsetWidth, mm = 96 / 25.4;
      const ar = a.getBoundingClientRect(), innerB = ar.bottom - parseFloat(getComputedStyle(a).paddingBottom) * z, stp = a.querySelector('.cl-stamps');
      return { z: +z.toFixed(3), cssZoom: getComputedStyle(a).zoom, clip: Math.max(0, ...Array.from(a.querySelectorAll('.cl-nm')).map(n => n.scrollHeight - n.clientHeight)),
        clamps: Array.from(a.querySelectorAll('.cl-nm-v')).map(v => v.style.getPropertyValue('-webkit-line-clamp')).join(','),
        hs: Array.from(a.querySelectorAll('.cl-blk-notes .cl-h,.cl-nm-k,.cl-nm-v,.cl-nm-ref')).map(v => +(v.getBoundingClientRect().height / z).toFixed(1)),
        gapMm: +((innerB - stp.getBoundingClientRect().bottom) / z / mm).toFixed(2), ov: document.documentElement.scrollWidth - window.innerWidth };
    });
    const fq16 = path.join(OUT, 'a4-form-q600.html'), fs16 = path.join(OUT, 'a4-form-stamps4.html');
    fs.writeFileSync(fq16, await page.evaluate(mk39, { q: 600 }));
    fs.writeFileSync(fs16, await page.evaluate(mk39, { fields: 4, q: 300, memo: 500, iv: 1600, stamp: true }));
    const nwBad16 = [], nwAll16 = {};
    for (const [k, f] of [['heavy', saved39.file], ['q600', fq16], ['iv4000', f16k], ['stamps4', fs16]]) {
      await p16.setViewportSize({ width: 1440, height: 1300 });
      await p16.goto('file://' + f);
      await p16.waitForTimeout(300);
      const w0 = await nw16(p16);
      nwAll16[k] = { w1440: { z: w0.z, clip: w0.clip, clamps: w0.clamps } };
      for (const w of [540, 430, 390, 360, 320]) {
        await p16.setViewportSize({ width: w, height: 844 });
        await p16.goto('file://' + f);
        await p16.waitForTimeout(300);
        const m = await nw16(p16);
        nwAll16[k][w] = { z: m.z, clip: m.clip, gapMm: m.gapMm };
        const dh = Math.max(...m.hs.map((h, i) => Math.abs(h - (w0.hs[i] == null ? -99 : w0.hs[i]))));
        if (!(m.z < 0.8 && m.cssZoom === '1' && m.clip <= 1 && m.clamps === w0.clamps && m.hs.length === w0.hs.length && dh <= 0.6 && m.gapMm >= -0.1 && m.gapMm <= 2 && m.ov <= 1)) nwBad16.push({ k, w, m: Object.assign({ dh }, m, { hs: undefined }) });
      }
    }
    await p16.setViewportSize({ width: 1440, height: 1300 });
    expect(!nwBad16.length && Object.keys(nwAll16).every(k => nwAll16[k].w1440.clip <= 1),
      'E16 狭い画面（540・430・390・360・320px）でも面接メモ・所見の枠の記入が切れない（.cl-nm の scrollHeight ≦ clientHeight + 1）・行数と各行の高さは 1440px と同じ（縮小は transform）・押印行は下端・横スクロールなし（重いサンプル・質問の回答 600 字×5・面接所見 4,000 字・押印欄 4 件）: ' +
      JSON.stringify(nwBad16.length ? nwBad16 : nwAll16));
    //   折り返せない幅広の書記素（ZWJ でつながった絵文字 1 つ。overflow-wrap:anywhere でも折り返せない）で横にはみ出すメモ: 「…」の印（.cl-cut）は付くが、
    //   広げる処理は縦のはみ出しだけを見るので固まらない（保存 HTML・アプリの報告書の読み込みの両方。10 秒で打ち切る）
    const zwj16 = '\u{1F468}' + '‍\u{1F468}'.repeat(60);
    const zr16 = {};
    const within16 = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('10 秒以上応答なし')), ms))]);
    const zwjState16 = () => {
      const sh = document.querySelector('#a4 .cl-sheet, #appPaper .cl-sheet'), vs = Array.from(sh.querySelectorAll('.cl-nm-v'));
      const iv = sh.querySelector('.cl-nm-iv .cl-nm-v'), q = sh.querySelector('.cl-nm-q .cl-nm-v');
      sh.classList.add('cl-measure'); const nat = Math.round(sh.getBoundingClientRect().height); sh.classList.remove('cl-measure');
      return { cls: sh.className.replace('cl-sheet cl-mode-sheet', '').trim(), nat, cutW: vs.filter(v => v.classList.contains('cl-cut') && v.scrollWidth > v.clientWidth + 1).length,
        q: q ? { clamp: q.style.getPropertyValue('-webkit-line-clamp'), cut: q.classList.contains('cl-cut') } : null,
        iv: iv ? { clamp: +iv.style.getPropertyValue('-webkit-line-clamp') || 0, cut: iv.classList.contains('cl-cut'), hid: iv.scrollHeight - iv.clientHeight } : null };
    };
    for (const [k, o] of [['q', { qRaw: 'メモ' + zwj16 }], ['iv', { q: 300, memo: 300, iv: 800, ivTail: zwj16 }]]) {
      const f = path.join(OUT, 'a4-form-zwj-' + k + '.html');
      fs.writeFileSync(f, await page.evaluate(mk39, o));
      for (const where of ['report', 'app']) {
        const zc = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP' });
        const zp = await zc.newPage();
        zp.on('pageerror', e => e16.push(e.message));
        zp.on('dialog', d => d.accept());
        const t0 = Date.now();
        let r, hung = false;
        try {
          if (where === 'report') {
            await zp.goto('file://' + f, { timeout: 10000 });
          } else {
            await zp.goto(FILE, { timeout: 10000 });
            await zp.waitForTimeout(200);
            await zp.setInputFiles('#fileInput', f, { timeout: 10000 });
            await within16(zp.waitForFunction(() => window.RecruitApp.state.step === 4 && !!document.querySelector('#appPaper .cl-sheet'), null, { timeout: 10000 }), 10000);
          }
          r = await within16(zp.evaluate(zwjState16), 10000);
        } catch (e) { r = { err: e.message.split('\n')[0] }; hung = true; }
        zr16[k + '-' + where] = Object.assign({ ms: Date.now() - t0 }, r);
        if (hung) zc.close().catch(() => {}); else await zc.close();
      }
    }
    const zq16 = (r) => !r.err && r.ms < 10000 && r.cutW >= 1 && !!r.q && r.q.cut && r.q.clamp === '' && r.nat <= 1052;
    const ziv16 = (r) => !r.err && r.ms < 10000 && r.cls.includes('cl-compact') && !!r.iv && r.iv.cut && r.iv.clamp > 10 && r.iv.hid <= 1 && r.nat <= 1052;
    expect(zq16(zr16['q-report']) && zq16(zr16['q-app']) && ziv16(zr16['iv-report']) && ziv16(zr16['iv-app']),
      'E16 横にはみ出す（折り返せない幅広の書記素の）メモがあっても保存 HTML・アプリの報告書が固まらない（「…」の印は付く・縦に全部見えた面接所見はそこで広げるのをやめる）: ' + JSON.stringify(zr16));
    // (3) 記入なし（面接メモ・所見・質問の回答・準備のメモが空）: 空の枠（点線の罫線＝手書きのメモ欄）
    const f16e = path.join(OUT, 'a4-form-empty.html');
    fs.writeFileSync(f16e, await page.evaluate(mk39, {}));
    await p16.goto('file://' + f16e);
    await p16.waitForTimeout(400);
    const m16 = await formOf(p16, '#a4');
    expect(m16.empty && m16.rows === 0 && m16.boxMm >= 30 && m16.lines >= 4 && m16.dotted === 'dotted' && okGap(m16) && m16.cls.includes('cl-roomy'),
      'E16 記入なし: 空の面接メモ・所見の枠（30mm 以上・点線の罫線）・押印行は下端: ' + JSON.stringify(m16));
    // (3b) 上限近くまで内容がある .cl-roomy の記録を狭い画面（--a4-zoom 0.45 前後）で開く: 縮小で行の高さが丸められて内容が数 % 伸びても、
    //   罫線の部分が縮んで吸収し、押印行は用紙の内寸の下端のまま（罫線の最低 38mm は計測中＝.cl-measure のときだけ）
    //   見本は面接所見の長さ（40〜600 字・20 字刻み）を変えて、ゆったりのまま内容が 1030〜1052px になるものを探す（用紙のレイアウトが変わったら選び直す。docs/SPEC-persona.md 7-2）
    let near16 = null;
    for (let iv = 40; iv <= 600; iv += 20) {
      const f = path.join(OUT, 'a4-form-near.html');
      fs.writeFileSync(f, await page.evaluate(mk39, { q: 40, iv, stamp: true, dec: 'reject', overall: 'reject', rate: 'poor' }));
      await p16.goto('file://' + f);
      await p16.waitForTimeout(200);
      const m = await formOf(p16, '#a4');
      if (m.cls.includes('cl-roomy') && (!near16 || m.nat > near16.m.nat)) { near16 = { iv, f: path.join(OUT, 'a4-form-near-' + iv + '.html'), m }; fs.copyFileSync(f, near16.f); }
      if (!m.cls.includes('cl-roomy')) break;   // ゆったりでなくなったらそれより長い見本は要らない
    }
    const nr16 = {};
    if (near16) {
      for (const w of [430, 390, 360]) {
        await p16.setViewportSize({ width: w, height: 844 });
        await p16.goto('file://' + near16.f);
        await p16.waitForTimeout(300);
        nr16[w] = Object.assign({ a4zoom: await p16.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--a4-zoom').trim()) }, await formOf(p16, '#a4'));
      }
      await p16.setViewportSize({ width: 1440, height: 1300 });
    }
    expect(!!near16 && near16.m.nat >= 1030 && near16.m.nat <= 1052 && okGap(near16.m) && Object.keys(nr16).length === 3 &&
      Object.keys(nr16).every(w => nr16[w].a4zoom !== '' && +nr16[w].a4zoom < 0.6 && nr16[w].cls === near16.m.cls && nr16[w].gapMm >= -0.1 && nr16[w].gapMm <= 2 && nr16[w].fill <= 1063 && nr16[w].boxMm >= 25),
      'E16 上限近くの .cl-roomy（内容 1030〜1052px）を狭い画面（430・390・360px）で開いても押印行は用紙の内寸の下端から 2mm 以内（縮小の丸めの誤差 0.1mm まで。シートが用紙の内寸を超えない）: ' +
      JSON.stringify({ iv: near16 && near16.iv, w1440: near16 && { cls: near16.m.cls, nat: near16.m.nat, gapMm: near16.m.gapMm, boxMm: near16.m.boxMm },
        narrow: Object.keys(nr16).map(w => ({ w, a4zoom: nr16[w].a4zoom, cls: nr16[w].cls, fill: nr16[w].fill, gapMm: nr16[w].gapMm, boxMm: nr16[w].boxMm })) }));
    await p16.close();
    // (4) ゆったりの付け外し（アプリの印刷ホストで面接所見を長くしていく: ゆったり → 通常 → .cl-compact。印刷のときに計測し直さない＝描いたときに決まる）
    const tog16 = await page.evaluate(() => {
      const A = window.RecruitApp, out = [];
      for (const n of [0, 300, 1000, 3000]) {
        A.state.interviewNotes = 'あいうえおかきくけこさしすせそ'.repeat(Math.ceil(n / 15)).slice(0, n);
        A.prepareChecklistSheet(true);
        const sh = document.querySelector('#clSheet .cl-sheet');
        out.push({ n, roomy: sh.classList.contains('cl-roomy'), compact: sh.classList.contains('cl-compact'), body: parseFloat(getComputedStyle(sh).fontSize) });
        A.prepareChecklistSheet(false);
      }
      A.state.interviewNotes = '';
      return out;
    });
    expect(tog16[0].roomy && tog16[0].body === 10.5 && tog16.some(x => !x.roomy && !x.compact && x.body === 9.5) && tog16[tog16.length - 1].compact && !tog16[tog16.length - 1].roomy &&
      tog16.every((x, i) => i === 0 || !(x.roomy && !tog16[i - 1].roomy)),
      'E16 ゆったりの付け外し: 内容が少なければ .cl-roomy（10.5px）、増えると外して通常（9.5px）、さらに .cl-compact: ' + JSON.stringify(tog16));
    // (5) アプリの報告書の紙・アプリの印刷も同じ（押印行は下端・枠は 30mm 以上・同じ段階）
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', file34b);
    await wait(500);
    const a16 = await formOf(page, '#appPaper');
    await page.evaluate(() => window.RecruitApp.prepareChecklistSheet(true));
    const pr16 = await formOf(page, '#clSheet .a4');
    await page.evaluate(() => window.RecruitApp.prepareChecklistSheet(false));
    expect(await step() === 4 && okGap(a16) && a16.boxMm >= 30 && a16.cls === n16.cls && okGap(pr16) && pr16.boxMm >= 30 && pr16.cls === n16.cls,
      'E16 アプリの報告書の紙・アプリの印刷も同じ用紙（ゆったり・押印行は下端・面接メモ・所見の枠 30mm 以上）: ' + JSON.stringify({ a16, pr16 }));
    //   アプリの報告書の紙は少しだけ縮める（zoom 0.95〜1。それより狭い画面は横スクロール）: 重いサンプルでも面接メモ・所見の枠の記入は切れない
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', saved39.file);
    await wait(500);
    const az16 = {};
    for (const w of [1080, 800]) {
      await page.setViewportSize({ width: w, height: 1000 });
      await wait(300);
      az16[w] = await page.evaluate(() => { const a = document.getElementById('appPaper');
        return { zoom: a.style.zoom, clip: Math.max(0, ...Array.from(a.querySelectorAll('.cl-nm')).map(n => n.scrollHeight - n.clientHeight)), cut: a.querySelectorAll('.cl-nm-v.cl-cut').length }; });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(300);
    expect(Object.keys(az16).every(w => +az16[w].zoom >= 0.95 && +az16[w].zoom < 1 && az16[w].clip <= 1 && az16[w].cut > 0),
      'E16 アプリの報告書の紙を少し縮めた幅（zoom 0.95〜1）でも重いサンプルの面接メモ・所見の枠の記入は切れない: ' + JSON.stringify(az16));
    expect(e16.length === 0, 'E16 ページエラー・console error なし: ' + (e16.join(' / ') || 'none'));
  }
  await fresh();

  // =====================================================================
  // E17 人物像（1〜5 点）・面接記入シート（手書き用）（docs/SPEC-persona.md 7-2・docs/SPEC-flow.md 9-3）
  //   フィードバック: ① 1 対 1 なら面接中はメモを中心に（1 対 1 でなければ面接しながらの入力は苦しい）② 紙で書いて面接後に転記 ③ 接客の人物像（1〜5 点）を総評に・内容をコンパクトに
  //   2026-10-16 の面接の流れで ② の案内・目次・質問の 1 行表示は無くなった（面接は 1 段階ずつ・評価は面接のあと。E18）。人物像・総評は評価の画面で確かめる
  // =====================================================================
  console.log('\n== E17 人物像・記入シート ==');
  {
    const e17 = [];
    const PS17 = ['ps_greeting', 'ps_impression', 'ps_smile', 'ps_voice', 'ps_eye', 'ps_speech', 'ps_motivation'];
    const PSL17 = ['挨拶ができていたか', '第一印象・身だしなみ', '笑顔・表情', '声のトーン・ハキハキさ', '目を見て話していたか', '言葉遣い・説明のわかりやすさ', '志望動機・接客で大切にしたいこと'];
    const psState17 = () => st(() => { const p = window.RecruitApp.state.checklist.persona; return p ? JSON.parse(JSON.stringify(p)) : p; });
    //   評価の要素のスクリーンショット: 撮るあいだだけトップバー・上の帯・下の操作行の sticky を外す（要素の上端〔見出し〕に重ならない。sticky は流れの中にあるので配置は変わらない）。
    //   マウスは要素の外へ（ホバーの色を写さない）・要素の中のフォーカスは外す（入力欄のフォーカス枠を写さない）・toast は消す
    const shotEl17 = async (sel, file) => {
      await page.mouse.move(1, 1);
      await page.evaluate((q) => { const s = document.createElement('style'); s.id = 'e2eNoSticky'; s.textContent = '.topbar,.iv-top,.ev-top,.iv-timer,.iv-must,.flow-foot{position:static !important}'; document.head.appendChild(s);
        const a = document.activeElement, el = document.querySelector(q); if (a && el && el.contains(a) && a.blur) a.blur();
        const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }, sel);
      await wait(80);
      await page.locator(sel).screenshot({ path: path.join(OUT, file) });
      await page.evaluate(() => { const s = document.getElementById('e2eNoSticky'); if (s) s.remove(); });
    };
    //   点の比べ方（キーの順は問わない。未入力に戻すとキーを消し、入れ直すと最後に付くため）
    const keyed17 = (o) => o ? JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])) : String(o);
    const activePs17 = () => st(() => { const a = document.activeElement; return a && a.dataset && a.dataset.persona ? a.dataset.persona + ':' + a.dataset.score : (a ? a.tagName : ''); });
    const psUi17 = () => st(() => ({ sum: document.getElementById('clPsSum').textContent, max: document.getElementById('clPsMax').textContent, pct: document.getElementById('clPsPct').textContent,
      state: document.getElementById('clPsState').textContent, stateCls: document.getElementById('clPsState').className, warn: document.getElementById('clPsWarn').classList.contains('hidden') ? '' : document.getElementById('clPsWarnText').textContent,
      nav: document.getElementById('clNavScore').textContent, sum2: (document.getElementById('sumPersona') || {}).textContent || '' }));
    const gap17 = (pg, sel) => pg.evaluate((q) => { const a = document.querySelector(q), stp = a.querySelector('.cl-stamps'), z = a.getBoundingClientRect().width / a.offsetWidth || 1, mm = 96 / 25.4;
      const innerB = a.getBoundingClientRect().bottom - parseFloat(getComputedStyle(a).paddingBottom) * z; return +((innerB - stp.getBoundingClientRect().bottom) / z / mm).toFixed(2); }, sel);
    const natOf17 = (pg, sel) => pg.evaluate((q) => { const sh = document.querySelector(q); sh.classList.add('cl-measure'); const h = sh.getBoundingClientRect().height; sh.classList.remove('cl-measure'); return { h: Math.round(h), cls: sh.className.replace('cl-sheet cl-mode-sheet', '').trim() }; }, sel);
    //   印刷のスタブ（印刷の瞬間の状態を __pp に記録）。__ppDate: 記入シートの「面接日」の欄（記入用の線なら 'LINE'、印字ならその文字）
    const stubPrint17 = () => page.evaluate(() => {
      window.__pp = [];
      window.__ppDate = (sh) => { const f = sh && Array.from(sh.querySelectorAll('.pp-who .pp-f')).find(x => (x.querySelector('dt') || {}).textContent === '面接日');
        return f ? (f.querySelector('dd .pp-line') ? 'LINE' : f.querySelector('dd').textContent) : null; };
      window.print = function () { const sh = document.querySelector('#clSheet .pp-sheet'); window.__pp.push({ cls: document.body.classList.contains('print-checklist'), sheet: !!sh, a4: !!document.querySelector('#clSheet .a4.pp-a4'),
        report: !!document.querySelector('#clSheet .cl-sheet'), who: sh ? sh.querySelector('.pp-who').textContent : '', nameLine: !!(sh && sh.querySelector('.pp-f-name .pp-line')), date: window.__ppDate(sh) }); };
    });
    await fresh();
    // (1) 準備に記入シートのボタン・評価の総評の構成
    const sa17 = await page.evaluate(() => { const b = document.getElementById('saPaperBtn'), n = document.getElementById('saNext'), c = document.getElementById('scriptApplicantCard');
      return b && { act: b.dataset.action, text: window.__lbl(b), row: b.parentNode.id, next: !!b.parentNode.querySelector('#saNext'),
        left: !!n && b.getBoundingClientRect().right <= n.getBoundingClientRect().left, below: !!c && b.getBoundingClientRect().top >= c.getBoundingClientRect().bottom }; });
    expect(!!sa17 && sa17.act === 'print-paper' && sa17.text === '[printer] 記入シート（手書き用）' && sa17.row === 'saActions' && sa17.next && sa17.left && sa17.below,
      'E17 (1) 準備の操作行（カードの下）に「🖨 記入シート（手書き用）」（#saPaperBtn）と、その右に「面接を始める →」（使い方の説明どおりの場所）: ' + JSON.stringify(sa17));
    await fillScript({ name: '人物 一郎', interviewer: '笹川 晴央' });
    await page.click('[data-action="script-next"]');
    await wait(400);
    expect(!(await page.$('#clPersona')) && !(await page.$('[data-action="ps-set"]')) && !(await page.$('#stepContent [data-action="print-paper"]')),
      'E17 (1) 面接の画面に人物像・記入シートのボタンは無い（人物像は評価の画面・記入シートは準備）');
    await goTo(3);
    const s17 = await page.evaluate(() => {
      const ov = document.getElementById('clOverall');
      const rows = Array.from(document.querySelectorAll('#clPersona .cl-ps-row'));
      //   総評は 3 枚のカード（2026-10-18。docs/DESIGN.md 4-4）: 人物像（#clPersona）→ 総合判断（#clOverall）→ 面接所見（#clNotes）が続けて並ぶ
      const trio = ['clPersona', 'clOverall', 'clNotes'].map(id => document.getElementById(id));
      return {
        old: ['#clGuide', '.cl-chip', '.cl-page-head', '#clNav', '#clPaperBtn'].filter(q => !!document.querySelector(q)),
        cards: trio.every(c => !!c && c.matches('section.card') && !!c.querySelector(':scope > .card-band .card-title')) && trio[0].nextElementSibling === trio[1] && trio[1].nextElementSibling === trio[2],
        order: Array.from(document.querySelectorAll('#clPersona, #clOverall .cl-overall-row, #clNotes textarea[data-note="interview"]')).map(e => e.id === 'clPersona' ? 'clPersona' : e.classList.contains('cl-overall-row') ? 'overall' : 'notes'),
        rows: rows.map(r => r.dataset.psRow), btns: rows.map(r => Array.from(r.querySelectorAll('button.cl-ps-btn[data-action="ps-set"]')).map(b => b.dataset.persona === r.dataset.psRow ? b.dataset.score : 'x').join('')),
        legend: (document.getElementById('clPsLegend') || {}).textContent, h3: (document.getElementById('clPersonaH') || {}).textContent, hint: (document.querySelector('[data-ps-row="ps_impression"] .hint') || {}).textContent,
        tabs: rows.map(r => Array.from(r.querySelectorAll('.cl-ps-btn')).filter(b => b.tabIndex === 0).map(b => b.dataset.score).join('')),
        off: !!document.getElementById('clPersonaOff'), ovHint: Array.from(ov.querySelectorAll('.card-note')).map(h => h.textContent).join(' '),
        lead: Array.from(document.querySelectorAll('.cl-lead-ps')).map(n => n.dataset.psRef + ':' + window.__lbl(n)),
        //   見出し帯の下（凡例のすぐ下・行の前）
        leadAfter: (() => { const n = document.querySelector('#clPersona .cl-lead-ps'); return !!n && !!n.previousElementSibling && n.previousElementSibling.id === 'clPsLegend' && !!n.nextElementSibling && n.nextElementSibling.classList.contains('cl-ps-rows'); })()
      };
    });
    expect(s17.old.length === 0 && s17.cards && JSON.stringify(s17.order) === JSON.stringify(['clPersona', 'overall', 'notes']) && JSON.stringify(s17.rows) === JSON.stringify(PS17) &&
      s17.btns.every(b => b === '12345') && s17.legend === '1 不採用レベル　2 やや不安　3 普通　4 良い　5 とても良い' && s17.h3 === '人物像（接客）' && s17.hint === '服装・清潔感' &&
      s17.tabs.every(t => t === '1') && !s17.off && s17.ovHint.includes('人物像（1〜5 点）の合計が低い・1 点の項目がある・未入力があると、結果を上長最終判断要（合計が 40% 未満なら不採用推奨）まで下げます。'),
      'E17 (1) 評価の総評は 人物像 → 総合判断 → 面接所見 の 3 枚の見出し帯つきのカード（7 行×1〜5・凡例・行ごとに 1 つのタブ位置）・総合判断の説明に人物像で下がる条件（合計・1 点・未入力）。旧 ② の案内・目次・ページの見出しは無い: ' + JSON.stringify(s17));
    //   台本 1 枚目の前書き「…最低限の話し方、敬語が可能か。…」（台本の文言は変えない）の付ける場所（人物像の「言葉遣い・説明のわかりやすさ」）を人物像の見出しの下に 1 行（docs/SPEC-flow.md 4-6）
    expect(JSON.stringify(s17.lead) === JSON.stringify(['ps_speech:[arrow-right] 台本 1 枚目の「最低限の話し方、敬語が可能か」は、この人物像（接客）「言葉遣い・説明のわかりやすさ」で 1〜5 点を付けます。']) && s17.leadAfter,
      'E17 (1) 台本 1 枚目の前書きの「最低限の話し方、敬語が可能か」は、人物像のカードの凡例の下（行の前）に「言葉遣い・説明のわかりやすさ」で付ける旨の 1 行（1 つだけ）: ' + JSON.stringify(s17.lead));
    const u17a = await psUi17();
    expect(u17a.sum === '—' && u17a.max === '35' && u17a.pct === '' && u17a.state === '未入力 7・上長最終判断要まで' && u17a.stateCls.includes('warn') && u17a.warn === '' && u17a.nav.includes('人物像 —/35') && u17a.sum2.includes('未入力 7'),
      'E17 (1) 入力前: 合計 —/35・琥珀「未入力 7・上長最終判断要まで」（このまま報告書に進むと上長最終判断要）・結果カードに「人物像 —/35」・右サマリーの人物像「未入力 7」: ' + JSON.stringify(u17a));
    // (2) クリック: 4 → 同じ 4 をもう一度で未入力に戻す
    await page.click('[data-action="ps-set"][data-persona="ps_greeting"][data-score="4"]');
    await wait(100);
    const c17a = await page.evaluate(() => { const b = document.querySelector('[data-persona="ps_greeting"][data-score="4"]');
      return { v: window.RecruitApp.state.checklist.persona.ps_greeting, pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('active'), set: document.querySelector('[data-ps-row="ps_greeting"]').classList.contains('is-set'),
        tab: Array.from(document.querySelectorAll('[data-ps-row="ps_greeting"] .cl-ps-btn')).filter(x => x.tabIndex === 0).map(x => x.dataset.score).join(''), dirty: window.RecruitApp.state.dirty }; });
    const u17b = await psUi17();
    await page.click('[data-action="ps-set"][data-persona="ps_greeting"][data-score="4"]');
    await wait(100);
    const c17b = { v: (await psState17()).ps_greeting, ui: await psUi17() };
    expect(c17a.v === 4 && c17a.pressed === 'true' && c17a.active && c17a.set && c17a.tab === '4' && c17a.dirty && u17b.sum === '4' && u17b.state === '未入力 6・上長最終判断要まで' && u17b.sum2.includes('4/35点') && u17b.sum2.includes('未入力 6') &&
      c17b.v === undefined && c17b.ui.sum === '—' && c17b.ui.state === '未入力 7・上長最終判断要まで',
      'E17 (2) クリックで 4 点（aria-pressed・タブ位置・合計 4・「未入力 6・上長最終判断要まで」・右サマリー）・同じ点をもう一度押すと未入力に戻る: ' + JSON.stringify({ c17a, u17b, c17b }));
    // (3) キーボード: 1 行目の「1」にフォーカス → 数字キーで入力して次の行へ（7 行）・Tab は 1 行 1 タブ位置・矢印はフォーカスだけ・Enter／Space は押下（同じ点で未入力）
    await page.focus('[data-ps-row="ps_greeting"] .cl-ps-btn[data-score="1"]');
    await page.keyboard.press('4');
    await wait(60);
    const k17a = { v: (await psState17()).ps_greeting, f: await activePs17() };
    for (const k of ['5', '4', '4', '3', '4', '5']) { await page.keyboard.press(k); await wait(60); }
    const k17b = { ps: await psState17(), ui: await psUi17(), f: await activePs17() };
    expect(k17a.v === 4 && k17a.f === 'ps_impression:1' && JSON.stringify(k17b.ps) === JSON.stringify({ ps_greeting: 4, ps_impression: 5, ps_smile: 4, ps_voice: 4, ps_eye: 3, ps_speech: 4, ps_motivation: 5 }) &&
      k17b.ui.sum === '29' && k17b.ui.pct === '（82%）' && k17b.ui.state === '70% 以上' && k17b.ui.stateCls.includes('ok') && k17b.ui.nav.includes('人物像 29/35') && k17b.f === 'ps_motivation:5',
      'E17 (3) 数字キー 4 で入力して 2 行目へ・「5 4 4 3 4 5」で 7 行（合計 29・（82%）・「70% 以上」・最後の行は押した点にフォーカス）: ' + JSON.stringify({ k17a, k17b }));
    await page.focus('[data-ps-row="ps_greeting"] .cl-ps-btn[tabindex="0"]');
    await page.keyboard.press('Tab');
    const tab17 = await activePs17();
    await page.keyboard.press('ArrowLeft');
    const left17 = await activePs17();
    await page.keyboard.press('ArrowDown');
    const down17 = await activePs17();
    await page.keyboard.press('ArrowRight');
    const right17 = await activePs17();
    const same17 = keyed17(await psState17()) === keyed17(k17b.ps);
    await page.focus('[data-ps-row="ps_eye"] .cl-ps-btn[data-score="3"]');
    await page.keyboard.press('Enter');
    await wait(60);
    const en17 = (await psState17()).ps_eye;
    await page.keyboard.press(' ');
    await wait(60);
    const sp17 = (await psState17()).ps_eye;
    //   テキスト欄の数字は入力のまま（人物像のボタンにフォーカスがあるときだけ数字キーを使う）
    await page.fill('textarea[data-note="interview"]', '');
    await page.focus('textarea[data-note="interview"]');
    await page.keyboard.type('笑顔123');
    const tx17 = { v: await page.inputValue('textarea[data-note="interview"]'), same: keyed17(await psState17()) === keyed17(k17b.ps) };
    expect(tab17 === 'ps_impression:5' && left17 === 'ps_impression:4' && down17 === 'ps_smile:4' && right17 === 'ps_smile:5' && same17 && en17 === undefined && sp17 === 3 && tx17.v === '笑顔123' && tx17.same,
      'E17 (3) Tab で次の行（押下中の点）・←→ は行内・↑↓ は上下の行の同じ点へフォーカスだけ（点は変わらない）・Enter で未入力・Space で入力・テキスト欄の数字は奪わない: ' + JSON.stringify({ tab17, left17, down17, right17, same17, en17, sp17, tx17 }));
    // (4) 1 点の項目: 全部 4＋笑顔・表情 1 → 警告・行の .is-one → 報告書で上長最終判断要（persona_one）・理由は報告書の確認事項と A4 の調整の行・タイルは赤（1点あり）
    await setPsAll([4, 4, 1, 4, 4, 4, 4]);
    await page.fill('textarea[data-note="interview"]', '受け答えは丁寧。笑顔が少なく表情が硬い。');
    const one17 = { ui: await psUi17(), row: await st(() => document.querySelector('[data-ps-row="ps_smile"]').className), btn: await st(() => getComputedStyle(document.querySelector('[data-persona="ps_smile"][data-score="1"]')).backgroundColor) };
    await shotEl17('#clPersona', 'p12-step2-persona.png');
    expect(one17.ui.warn === '1 点の項目があります（笑顔・表情）。結果は上長最終判断要以下になります。' && one17.row.includes('is-one') && one17.ui.sum === '25' && one17.ui.pct === '（71%）' &&
      one17.ui.state === '上長最終判断要まで' && one17.ui.stateCls.includes('warn') && !one17.ui.stateCls.includes('ok') && one17.ui.sum2.includes('25/35点・71%') && one17.ui.sum2.includes('1点あり'),
      'E17 (4) 1 点の項目: 警告「1 点の項目があります（笑顔・表情）。…」・行は赤（.is-one）・合計が 70% 以上でも状態は琥珀「上長最終判断要まで」（緑「70% 以上」にしない）・右サマリーに「1点あり」: ' + JSON.stringify(one17));
    await rateAll('good', { ps: false });
    await judge();
    const j17a = await judgment();
    const why17 = await st(() => (window.RecruitApp.state.judgment.adjustments[0] || {}).reason || '');
    const a17a = await page.evaluate(() => { const t = document.querySelector('#appPaper .cl-tile-ps');
      return { warn: (document.getElementById('scriptWarnings') || {}).textContent || '', adj: (document.querySelector('#appPaper .cl-adj') || {}).textContent || '', ng: !!t && t.classList.contains('is-ng'),
        v: t ? t.querySelector('.cl-tile-v').textContent : '', s: t ? (t.querySelector('.cl-tile-s') || {}).textContent : '', s1: !!document.querySelector('#appPaper tr.s-1[data-ps-item="ps_smile"]'),
        btn: !!document.querySelector('#scriptWarnings [data-action="to-step"][data-step="3"]') }; });
    expect(j17a.result === 'review' && JSON.stringify(j17a.adjustments) === '["persona_one"]' && why17 === '人物像に 1 点の項目（笑顔・表情）があるため、採用推奨ではなく上長最終判断要として扱います。' &&
      a17a.warn.includes(why17) && a17a.adj.includes('採用推奨 → 上長最終判断要') && a17a.adj.includes(why17) && a17a.ng && a17a.v === '25/35点' && a17a.s === '71%・1点あり' && a17a.s1 && !a17a.btn,
      'E17 (4) 報告書: 上長最終判断要（persona_one）・理由は報告書の確認事項と A4 の調整の行・人物像のタイルは赤（25/35点・71%・1点あり）・tr.s-1: ' + JSON.stringify({ j17a, why17, a17a }));
    // (5) 合計 40% 未満 → 不採用推奨・全部 3 → 上長最終判断要・全部 4 以上 → 採用推奨（調整・警告なし）
    const totals17 = {};
    for (const [k, sc] of [['lt40', [1, 1, 2, 2, 2, 2, 2]], ['all3', [3, 3, 3, 3, 3, 3, 3]], ['all4', [4, 4, 4, 4, 4, 4, 4]]]) {
      await navStep(3);
      await setPsAll(sc);
      await judge();
      totals17[k] = Object.assign(await judgment(), await st(() => ({ reasons: window.RecruitApp.state.judgment.adjustments.map(a => a.reason), warnings: window.RecruitApp.state.judgment.warnings.slice(), card: !!document.getElementById('scriptWarnings') })));
    }
    expect(totals17.lt40.result === 'reject' && JSON.stringify(totals17.lt40.adjustments) === '["persona_total"]' && totals17.lt40.reasons[0] === '人物像の合計 12/35（34%）のため、不採用推奨とします。' &&
      totals17.all3.result === 'review' && JSON.stringify(totals17.all3.adjustments) === '["persona_total"]' && totals17.all3.reasons[0] === '人物像の合計 21/35（60%）のため、採用推奨ではなく上長最終判断要として扱います。' &&
      totals17.all4.result === 'recommend' && totals17.all4.adjustments.length === 0 && totals17.all4.warnings.length === 0 && !totals17.all4.card,
      'E17 (5) 合計 40% 未満（1,1,2,2,2,2,2）→ 不採用推奨・全部 3 → 上長最終判断要・全部 4 → 採用推奨（調整・警告なし）: ' + JSON.stringify(totals17));
    // (7) A4: 確認点 6 行｜人物像 7 行・タイル 28/35点・80%・右サマリー
    const a17 = await page.evaluate(() => { const ev = document.querySelector('#appPaper .cl-cols-eval'), t = document.querySelector('#appPaper .cl-tile-ps');
      return { rt: ev ? ev.querySelectorAll('.cl-blk-rate tr[data-cl-item]').length : 0, ps: ev ? ev.querySelectorAll('.cl-blk-persona tr[data-ps-item]').length : 0, first: !!ev && ev.firstElementChild.classList.contains('cl-blk-rate'),
        v: t && t.querySelector('.cl-tile-v').textContent, s: t && t.querySelector('.cl-tile-s').textContent, ng: !!t && t.classList.contains('is-ng'), on: ev ? ev.querySelectorAll('.cl-ps-bar i.on').length : 0,
        sum: (document.querySelector('#appPaper .cl-ps-sum') || {}).textContent, side: (document.getElementById('sumPersona') || {}).textContent || '',
        colsW: ev ? Array.from(ev.children).map(c => Math.round(c.getBoundingClientRect().width)) : [] }; });
    expect(a17.rt === 6 && a17.ps === 7 && a17.first && a17.v === '28/35点' && a17.s === '80%' && !a17.ng && a17.on === 28 && a17.sum === '28/35点・80%' && a17.side.includes('28/35点・80%') && !a17.side.includes('1点あり') &&
      a17.colsW.length === 2 && Math.abs(a17.colsW[0] - a17.colsW[1]) <= 2,
      'E17 (7)(8) A4 は 確認点 6 行｜人物像 7 行（50:50）・タイル 28/35点・80%・目盛り 28・右サマリー「28/35点・80%」: ' + JSON.stringify(a17));
    //   保存 HTML とアプリの印刷: どちらも 1 ページ・押印行は下端・画面と印刷の画像が同じ様式
    await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
    await wait(150);
    const saved17 = await saveRecord('p12-persona-report.html');
    const rp17 = await newReportPage(e17);
    await rp17.setViewportSize({ width: 1440, height: 1300 });
    await rp17.goto('file://' + saved17.file);
    await rp17.waitForTimeout(400);
    await rp17.mouse.move(0, 0);
    const r17 = { nat: await natOf17(rp17, '#a4 .cl-sheet'), gap: await gap17(rp17, '#a4'), tiles: await rp17.$$eval('#a4 .cl-tile-k', els => els.map(e => e.textContent)), ps: (await rp17.$$('#a4 .cl-blk-persona tr[data-ps-item]')).length };
    await rp17.locator('#a4').screenshot({ path: path.join(OUT, 'p12-report.png') });
    const pdf17r = path.join(OUT, 'p12-report.pdf');
    await rp17.pdf({ path: pdf17r, format: 'A4', printBackground: true });
    const n17r = pdfPagesOf(pdf17r), t17r = pdfTextOf(pdf17r);
    let c17r = null;
    if (hasPpm14) c17r = await cmp14(path.join(OUT, 'p12-report.png'), png14(pdf17r, path.join(OUT, 'p12-report-print')));
    await rp17.close();
    expect(JSON.stringify(r17.tiles) === JSON.stringify(['結果', '総合判断', '必須条件', '確認点', '人物像']) && r17.ps === 7 && r17.nat.h <= 1052 && r17.gap >= 0 && r17.gap <= 2 && (n17r === -1 || n17r === 1) &&
      (t17r === null || ['人物像（接客）', '28/35点', '挨拶ができていたか', '確認点'].every(t => t17r.includes(t))) && (c17r === null || (c17r.diff.every(d => d <= 0.02) && c17r.mean <= 4)),
      'E17 (7) 保存 HTML: 5 タイル・人物像 7 行・内容 1052px 以内・押印行は用紙の内寸の下端・印刷して 1 ページ・画面と印刷が同じ様式（p12-report.png / p12-report-print.png）: ' + JSON.stringify({ r17, pages: n17r, c17r }));
    await st(() => window.RecruitApp.prepareChecklistSheet(true));
    const ap17 = { nat: await natOf17(page, '#clSheet .cl-sheet'), gap: await gap17(page, '#clSheet .a4'), ps: await st(() => document.querySelectorAll('#clSheet .cl-blk-persona tr[data-ps-item]').length) };
    await page.emulateMedia({ media: 'print' });
    const pdf17a = path.join(OUT, 'p12-report-app.pdf');
    await page.pdf({ path: pdf17a, format: 'A4', preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: null });
    await st(() => window.RecruitApp.prepareChecklistSheet(false));
    const n17a = pdfPagesOf(pdf17a);
    expect(ap17.ps === 7 && ap17.nat.h <= 1052 && ap17.gap >= 0 && ap17.gap <= 2 && ap17.nat.cls === r17.nat.cls && (n17a === -1 || n17a === 1),
      'E17 (7) アプリの A4 印刷も 1 ページ・人物像 7 行・押印行は下端・保存 HTML と同じ段階: ' + JSON.stringify({ ap17, pages: n17a }));
    //   重いサンプル（全メモ 300 字・確認点のメモ 300 字・面接所見 1,500 字・人物像入り）も 1 ページ
    const fh17 = path.join(OUT, 'p12-persona-heavy.html');
    fs.writeFileSync(fh17, await page.evaluate(mk39, { q: 300, iv: 1500, memo: 300, rn: 300, stamp: true, ps: [4, 5, 1, 3, 4, 2, 5] }));
    const rh17 = await newReportPage(e17);
    await rh17.goto('file://' + fh17);
    await rh17.waitForTimeout(400);
    const h17 = { nat: await natOf17(rh17, '#a4 .cl-sheet'), gap: await gap17(rh17, '#a4'), rt: await rh17.evaluate(() => { const r = document.querySelector('#a4 .cl-nm-rt'); return r ? { cut: !!r.querySelector('.cl-nm-v.cl-cut'), k: r.querySelector('.cl-nm-k').textContent } : null; }),
      tile: await rh17.evaluate(() => { const t = document.querySelector('#a4 .cl-tile-ps'); return t ? t.textContent : ''; }) };
    const pdf17h = path.join(OUT, 'p12-persona-heavy.pdf');
    await rh17.pdf({ path: pdf17h, format: 'A4', printBackground: true });
    await rh17.close();
    const n17h = pdfPagesOf(pdf17h);
    expect(h17.nat.h <= 1052 && h17.nat.cls.includes('cl-compact') && h17.gap >= 0 && h17.gap <= 2 && (n17h === -1 || n17h === 1) && !!h17.rt && h17.rt.k === '確認点のメモ' && h17.rt.cut && h17.tile.includes('24/35点') && h17.tile.includes('1点あり'),
      'E17 (7) 重いサンプル（確認点のメモ 300 字×6・人物像 4,5,1,3,4,2,5）も 1 ページ（.cl-compact・押印行は下端・確認点のメモは面接メモ・所見の枠で「…」）: ' + JSON.stringify({ h17, pages: n17h }));
    // (6) 未入力: 人物像を入れずに総合判断「採用」→ 上長最終判断要・警告・「評価で入力する」
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '人物 二郎' });
    await page.click('[data-action="script-next"]');
    await wait(400);
    await rateAll('good', { ps: false });
    await judge();
    const j17u = await judgment();
    const u17 = await page.evaluate(() => ({ w: window.RecruitApp.state.judgment.warnings.slice(), btn: !!document.querySelector('#scriptWarnings [data-action="to-step"][data-step="3"]'), side: (document.getElementById('sumPersona') || {}).textContent || '',
      tile: (document.querySelector('#appPaper .cl-tile-ps') || {}).textContent || '' }));
    expect(j17u.result === 'review' && JSON.stringify(j17u.adjustments) === '["persona_unscored"]' && u17.w.includes('人物像に未入力が 7 項目あります（挨拶、身だしなみ、笑顔・表情、声のトーン、目線、言葉遣い、志望動機）。') &&
      u17.btn && u17.side.includes('未入力 7') && u17.tile === '人物像未入力',
      'E17 (6) 人物像が未入力で総合判断「採用」→ 上長最終判断要（persona_unscored）・警告（7 項目の名前）・「評価で入力する」・タイル「未入力」: ' + JSON.stringify({ j17u, u17 }));
    await page.click('#scriptWarnings [data-action="to-step"][data-step="3"]');
    await wait(300);
    expect(await step() === 3 && !!(await page.$('#clPersona')), 'E17 (6) 「評価で入力する」で評価（人物像のある画面）に戻る');
    // (10) 評価の画面の幅: 390px でも横スクロールなし（人物像の行は 1 列）・人物像の凡例（「点 意味」ごとの span）は語の途中で折り返さない
    const lay17 = () => page.evaluate(() => ({ legendItems: document.querySelectorAll('#clPsLegend > span').length,
      //   折り返したかは行の数（上端の違う矩形）で見る（2026-10-18 から点の数字は <b>。同じ行でも子の要素の前後で矩形が分かれるため、矩形の数では数えない）
      legendSplit: Array.from(document.querySelectorAll('#clPsLegend > span')).filter(sp => new Set(Array.from(sp.getClientRects()).map(r => Math.round(r.top))).size > 1).map(sp => sp.textContent) }));
    await page.setViewportSize({ width: 390, height: 900 });
    await wait(250);
    const nw17 = await page.evaluate(() => ({ ov: document.documentElement.scrollWidth - window.innerWidth, row: getComputedStyle(document.querySelector('.cl-ps-row')).gridTemplateColumns.split(' ').length,
      btnIn: Array.from(document.querySelectorAll('.cl-ps-btn')).every(b => b.getBoundingClientRect().right <= window.innerWidth) }));
    const ly17 = { w390: await lay17() };
    await page.setViewportSize({ width: 1280, height: 900 });
    await wait(200);
    ly17.w1280 = await lay17();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(200);
    ly17.w1440 = await lay17();
    expect(nw17.ov <= 1 && nw17.row === 1 && nw17.btnIn, 'E17 (10) 390px でも横スクロールなし（人物像の行は 1 列・ボタンは画面の中）: ' + JSON.stringify(nw17));
    expect([ly17.w390, ly17.w1280, ly17.w1440].every(x => x.legendItems === 5 && x.legendSplit.length === 0),
      'E17 (10) 人物像の凡例は「5 とても良い」などの途中で折り返さない（390・1280・1440px）: ' + JSON.stringify(ly17));
    //   ダークモード: 押下中の ○△×・一致・総合判断・人物像の点の文字と地のコントラストは 4.5:1 以上（白字では 2.0〜3.1:1 だった。--on-status）。アプリの「ダークモード」（data-theme）と OS の設定（prefers-color-scheme）の両方。ライトは白字のまま
    await setPsAll([1, 2, 3, 4, 5, 4, 3]);
    await setCl('values.rt_hourensou', 'fair');
    await setCl('values.rt_turnover', 'poor');
    await setCl('overall', 'hold');
    //   ボタンの文字・地の色は transition（.12s）で変わるので、テーマを切り替えた直後に測るときは transition を止める（E18 の con18 と同じ。途中の色を測らない）
    const con17 = () => st(() => {
      if (!document.getElementById('e2eNoTr17')) { const s = document.createElement('style'); s.id = 'e2eNoTr17'; s.textContent = '*{transition:none !important}'; document.head.appendChild(s); }
      const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const out = {};
      Array.from(document.querySelectorAll('#view-judge .cl-sec .seg-btn.active, #clPersona .seg-btn.active, #clOverall .seg-btn.active')).forEach(b => { const cs = getComputedStyle(b), a = lum(cs.color), c = lum(cs.backgroundColor);
        out[b.dataset.persona ? 'ps' + b.dataset.score : b.dataset.value] = { r: +((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(2), color: cs.color }; });
      return out;
    });
    const theme17 = await st(() => document.documentElement.getAttribute('data-theme'));
    await st(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const dk17a = await con17();
    await st(() => document.documentElement.removeAttribute('data-theme'));
    await page.emulateMedia({ colorScheme: 'dark' });
    const dk17b = await con17();
    await page.emulateMedia({ colorScheme: 'light' });
    await st((t) => { if (t) document.documentElement.setAttribute('data-theme', t); }, theme17);
    const lt17 = await con17();
    await st(() => { const s = document.getElementById('e2eNoTr17'); if (s) s.remove(); });
    const KINDS17 = ['ps1', 'ps2', 'ps3', 'ps4', 'ps5', 'good', 'fair', 'poor', 'match', 'hold'];
    //   （2026-10-18 から琥珀の塗り〔△・保留・2 点〕は濃い文字。docs/DESIGN.md 1-2。ライトも文字の色ではなくコントラストで確かめる）
    expect([dk17a, dk17b, lt17].every(d => KINDS17.every(k => d[k] && d[k].r >= 4.5)) && ['ps1', 'ps4', 'good', 'poor', 'match'].every(k => lt17[k].color === 'rgb(255, 255, 255)'),
      'E17 (10) ライト・ダークとも押下中のボタン（人物像 1〜5・○△×・一致・総合判断）の文字は 4.5:1 以上（ダークは data-theme・prefers-color-scheme の両方。緑・赤の塗りは白字）: ' + JSON.stringify({ dk17a, dk17b, lt17 }));
    // (9) 記入シート（手書き用）: 準備で氏名が空でも印刷できる（印刷の瞬間だけ body.print-checklist と #clSheet .pp-sheet）・判定は走らない・保存しない
    await page.click('#btnNew');
    await wait(200);
    await stubPrint17();
    await page.click('#saPaperBtn');
    await wait(150);
    const pr17 = await page.evaluate(() => ({ calls: window.__pp.slice(), j: window.RecruitApp.state.judgment, step: window.RecruitApp.state.step, toast: document.getElementById('toast').textContent }));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await wait(100);
    const af17 = await page.evaluate(() => ({ cls: document.body.classList.contains('print-checklist'), host: document.getElementById('clSheet').innerHTML.length }));
    expect(pr17.calls.length === 1 && pr17.calls[0].cls && pr17.calls[0].sheet && pr17.calls[0].a4 && !pr17.calls[0].report && pr17.calls[0].nameLine && pr17.j === null && pr17.step === 1 && !af17.cls && af17.host === 0 &&
      pr17.calls[0].date === '2026/10/10',
      'E17 (9) 準備の「記入シート」（氏名が空でも）: 印刷の瞬間に body.print-checklist と #clSheet .a4.pp-a4 .pp-sheet（氏名は線・面接日は準備の欄のとおり）・判定は走らない・afterprint で外す: ' + JSON.stringify({ pr17, af17 }));
    //   準備で面接日を空にすると記入シートの面接日は記入用の線（前もって刷っておく白紙）。印刷で今日の日付を入れない（記録・準備の欄・右サマリーは空のまま。docs/SPEC-persona.md 11-9 補完 3）
    await page.fill('#saDate', '');
    await wait(150);
    const pdt17a = await st(() => ({ date: window.RecruitApp.state.checklist.header.date, dirty: window.RecruitApp.state.dirty }));
    await stubPrint17();
    await page.click('#saPaperBtn');
    await wait(150);
    const pdt17 = await page.evaluate(() => ({ calls: window.__pp.slice(), date: window.RecruitApp.state.checklist.header.date, input: document.getElementById('saDate').value,
      side: (document.querySelector('#sumDate .sum-val') || {}).textContent, dirty: window.RecruitApp.state.dirty, j: window.RecruitApp.state.judgment }));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await wait(100);
    const pdt17b = await st(() => ({ date: window.RecruitApp.state.checklist.header.date, input: document.getElementById('saDate').value, side: (document.querySelector('#sumDate .sum-val') || {}).textContent }));
    expect(pdt17a.date === '' && pdt17.calls.length === 1 && pdt17.calls[0].sheet && pdt17.calls[0].date === 'LINE' && !pdt17.calls[0].who.includes('2026/10/10') && pdt17.date === '' && pdt17.input === '' && pdt17.side === '—' &&
      pdt17.dirty === pdt17a.dirty && pdt17.j === null && pdt17b.date === '' && pdt17b.input === '' && pdt17b.side === '—',
      'E17 (9) 準備で面接日を空にした記入シートは面接日が記入用の線（今日の日付を印字しない）・印刷の前後で記録・準備の欄・右サマリーの面接日は空のまま: ' + JSON.stringify({ pdt17a, pdt17, pdt17b }));
    //   記入欄（.pp-fields の 1 欄）の中身の右端が欄の右端を越える量（Range で文字・□ の右端を測る。越えた欄だけ [id, px]）
    const defFieldsOver17 = () => page.evaluate(() => { window.__ppFieldsOver = (sh) => Array.from(sh.querySelectorAll('.pp-fields > div')).map(d => {
      const rg = document.createRange(); rg.selectNodeContents(d.querySelector('dd'));
      return [d.dataset.ppItem, +(Math.max.apply(null, Array.from(rg.getClientRects()).map(x => x.right)) - d.getBoundingClientRect().right).toFixed(1)]; }).filter(x => x[1] > 0.5); });
    await defFieldsOver17();
    await st(() => window.RecruitApp.preparePaperSheet(true));
    const pd17 = await page.evaluate(() => { const sh = document.querySelector('#clSheet .pp-sheet'); sh.classList.add('pp-measure'); const h = sh.getBoundingClientRect().height; sh.classList.remove('pp-measure');
      const lines = sh.querySelector('.pp-notes .pp-lines'), lb = lines.getBoundingClientRect().bottom, a4 = document.querySelector('#clSheet .a4'), mm = 96 / 25.4;
      return { cls: sh.className, h: Math.round(h), fill: Math.round(sh.getBoundingClientRect().height), a4w: +(a4.getBoundingClientRect().width / mm).toFixed(1), a4h: +(a4.getBoundingClientRect().height / mm).toFixed(1),
        nameLine: !!sh.querySelector('.pp-f-name .pp-line'), date: window.__ppDate(sh), ps: sh.querySelectorAll('tr[data-pp-ps]').length, psCells: Array.from(sh.querySelectorAll('tr[data-pp-ps] .pp-sc')).every(td => td.textContent === '12345'),
        rate: sh.querySelectorAll('.pp-rate tr[data-pp-item]').length, rateMk: Array.from(sh.querySelectorAll('.pp-rate .pp-mk')).every(td => td.textContent === '○△×'), must: sh.querySelectorAll('.pp-must tr[data-pp-item]').length,
        notes: Array.from(lines.querySelectorAll('i')).filter(i => i.getBoundingClientRect().bottom <= lb + 0.5).length, ov: Array.from(sh.querySelectorAll('.pp-ov-o')).map(e => e.textContent),
        cols: Array.from(sh.querySelectorAll('.pp-col')).map(c => Array.from(c.querySelectorAll('.pp-sec')).map(x => x.dataset.sec).join(',')), title: (sh.querySelector('.cl-title-t') || {}).textContent,
        fieldsOver: window.__ppFieldsOver(sh), termWrap: (() => { const d = sh.querySelector('[data-pp-item="term"]'); return d ? d.querySelector('dd').getBoundingClientRect().top - d.querySelector('dt').getBoundingClientRect().bottom >= -1 : null; })() }; });
    await page.emulateMedia({ media: 'print' });
    const pdf17p = path.join(OUT, 'p12-paper-sheet.pdf');
    await page.pdf({ path: pdf17p, format: 'A4', preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: null });
    await st(() => window.RecruitApp.preparePaperSheet(false));
    const n17p = pdfPagesOf(pdf17p), t17p = pdfTextOf(pdf17p);
    if (hasPpm14) png14(pdf17p, path.join(OUT, 'p12-paper-sheet'));
    const want17p = ['面接記入シート', '人物像（接客）', '12345', '○', '△', '×', '一致', '不一致', '面接者の総合判断', '採用', '保留', '不採用', '面接所見', '指定繁忙期間すべて可', '面接', '評価', '面接のあとに付ける', '面接時間'].concat(PSL17);
    //   記入欄（2 列）の中身は欄の中（右端を越えない）。見出しと □選択肢 が 1 行に入らない「短期／長期の希望」は □短期希望 □長期希望 を次の行へ（隣の「契約開始日の希望」とつながって見えない）
    expect(pd17.fieldsOver.length === 0 && pd17.termWrap === true, 'E17 (9) 記入シートの記入欄は欄からはみ出さない（「短期／長期の希望」の □選択肢 は次の行）: ' + JSON.stringify({ over: pd17.fieldsOver, termWrap: pd17.termWrap }));
    expect(pd17.h <= 1052 && Math.abs(pd17.a4w - 210) <= 0.5 && Math.abs(pd17.a4h - 297) <= 0.5 && pd17.nameLine && pd17.date === 'LINE' && pd17.ps === 7 && pd17.psCells && pd17.rate === 6 && pd17.rateMk && pd17.must === 2 && pd17.notes >= 3 &&
      JSON.stringify(pd17.ov) === '["採用","保留","不採用"]' && JSON.stringify(pd17.cols) === JSON.stringify(['conditions,continuity', 'job,teamwork,reverse']) && pd17.title === '面接記入シート' &&
      (n17p === -1 || n17p === 1) && (t17p === null || want17p.filter(t => !t17p.includes(t)).length === 0),
      'E17 (9) 記入シート（白紙）: A4 縦 1 枚（210×297mm・内容 1052px 以内）・氏名と面接日は線・人物像 7 行×1〜5・確認点 6 行（○△×）・必須条件 2 行・総合判断 3 つ・面接所見の罫線 3 本以上・2 段（①② ｜ ③④⑤）・PDF 1 ページ: ' +
      JSON.stringify({ pd17, pages: n17p, missing: t17p === null ? null : want17p.filter(t => !t17p.includes(t)) }));
    //   準備に入力 → 面接でメモ・評価で人物像を付けたあと、準備に戻って「記入シート」: 氏名・区分/年齢/性別・担当・短期求人・タクシーを印字（面接・評価の回答は印字しない）
    await fillScript({ name: '記入 太郎', age: 21, gender: '男性', category: '大学3年生', posting: 'short', taxi: '可・2,500円', interviewer: '笹川 晴央' });
    await page.click('[data-action="script-next"]');
    await wait(400);
    await page.fill('#ivStage textarea[data-cl="notes.q_term"]', '回答メモは記入シートに印字しない');
    await setPs('ps_smile', 2);
    await goTo(1);
    await stubPrint17();
    await page.click('#saPaperBtn');
    await wait(150);
    const pr17b = await page.evaluate(() => window.__pp.slice());
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await wait(100);
    await st(() => window.RecruitApp.preparePaperSheet(true));
    const pf17 = await page.evaluate(() => { const sh = document.querySelector('#clSheet .pp-sheet'); sh.classList.add('pp-measure'); const h = sh.getBoundingClientRect().height; sh.classList.remove('pp-measure');
      return { h: Math.round(h), who: sh.querySelector('.pp-who').textContent, txt: sh.textContent.includes('回答メモは記入シートに印字しない'), fieldsOver: window.__ppFieldsOver(sh) }; });
    await page.emulateMedia({ media: 'print' });
    const pdf17f = path.join(OUT, 'p12-paper-sheet-filled.pdf');
    await page.pdf({ path: pdf17f, format: 'A4', preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: null });
    await st(() => window.RecruitApp.preparePaperSheet(false));
    const n17f = pdfPagesOf(pdf17f), t17f = pdfTextOf(pdf17f);
    if (hasPpm14) png14(pdf17f, path.join(OUT, 'p12-paper-sheet-filled'));
    expect(pr17b.length === 1 && pr17b[0].cls && pr17b[0].sheet && pr17b[0].who.includes('記入 太郎') && pf17.h <= 1052 && pf17.fieldsOver.length === 0 && ['記入 太郎', '大学3年生・21歳・男性', '2026/10/10', '笹川 晴央', '短期求人', '可・2,500円'].every(t => pf17.who.includes(t)) &&
      !pf17.txt && (n17f === -1 || n17f === 1) && (t17f === null || ['記入太郎', '大学3年生・21歳・男性', '笹川晴央', '短期求人', '可・2,500円'].every(t => t17f.includes(t))),
      'E17 (9) 準備に入力した記入シート（面接・評価のあとに準備から）: 氏名・区分/年齢/性別・面接日・担当・短期求人・タクシーを印字・面接のメモ・評価の点は印字しない・PDF 1 ページ: ' + JSON.stringify({ pr17b: pr17b.length, pf17, pages: n17f }));
    //   本物の印刷の経路（window.print をスタブにしない。docs/SPEC-persona.md 11-9 補完 9）: ヘッドレスの Chromium の window.print はダイアログを出さずに beforeprint → afterprint を送る。
    //   beforeprint の時点の印刷ホストは記入シート（beforeprint の自動切替で報告書に替えない）・afterprint で片付ける・判定は走らない・面接日は変えない。
    //   afterprint が来ないとき（スタブ）は 3 秒で片付け、片付けは印刷ごとに 1 回だけ（前の印刷の 3 秒のタイマーが次の印刷の用紙を消さない）。時計は page.clock で進める
    const rp17p = await ctx.newPage();
    const e17p = [];
    rp17p.on('pageerror', e => e17p.push(e.message));
    rp17p.on('console', m => { if (m.type() === 'error') e17p.push('console: ' + m.text()); });
    rp17p.on('dialog', d => d.accept());
    await rp17p.clock.install({ time: NOW });
    await rp17p.goto(FILE);
    await rp17p.clock.runFor(500);
    const snap17p = () => rp17p.evaluate(() => ({ cls: document.body.classList.contains('print-checklist'), pp: !!document.querySelector('#clSheet .a4.pp-a4 .pp-sheet'), host: document.getElementById('clSheet').innerHTML.length }));
    await rp17p.evaluate(() => {
      window.__ev = [];
      const snap = (k) => window.__ev.push({ k, cls: document.body.classList.contains('print-checklist'), pp: !!document.querySelector('#clSheet .a4.pp-a4 .pp-sheet'), report: !!document.querySelector('#clSheet .cl-sheet'),
        nameLine: !!document.querySelector('#clSheet .pp-f-name .pp-line') });
      addEventListener('beforeprint', () => snap('before'));
      addEventListener('afterprint', () => snap('after'));
    });
    await rp17p.click('#saPaperBtn');
    const real17 = { ev: await rp17p.evaluate(() => window.__ev.slice()), now: await snap17p(), st: await rp17p.evaluate(() => ({ j: window.RecruitApp.state.judgment, date: window.RecruitApp.state.checklist.header.date, step: window.RecruitApp.state.step })) };
    //   スタブ（afterprint を送らない）の 2 回目: 1 回目の 1 秒後に印刷 → 1 回目の 3 秒（3.1 秒時点）では消えない → 2 回目の 3 秒（4.1 秒時点）で片付け
    await rp17p.clock.runFor(1000);
    await rp17p.evaluate(() => { window.print = function () {}; });
    await rp17p.click('#saPaperBtn');
    const g17 = { on: await snap17p() };
    await rp17p.clock.runFor(2100);
    g17.t3 = await snap17p();
    await rp17p.clock.runFor(800);
    g17.t39 = await snap17p();
    await rp17p.clock.runFor(200);
    g17.t41 = await snap17p();
    await rp17p.close();
    expect(real17.ev.length === 2 && real17.ev[0].k === 'before' && real17.ev[0].cls && real17.ev[0].pp && !real17.ev[0].report && real17.ev[0].nameLine && real17.ev[1].k === 'after' && real17.ev[1].pp &&
      !real17.now.cls && real17.now.host === 0 && real17.st.j === null && real17.st.date === '2026-10-10' && real17.st.step === 1,
      'E17 (9) 本物の window.print（スタブなし）: beforeprint の時点の印刷ホストは記入シート（報告書に替えない・氏名は線）・afterprint で片付け・判定は走らない・面接日はそのまま: ' + JSON.stringify(real17));
    expect(g17.on.cls && g17.on.pp && g17.t3.cls && g17.t3.pp && g17.t39.cls && g17.t39.pp && !g17.t41.cls && g17.t41.host === 0 && e17p.length === 0,
      'E17 (9) afterprint が来ない印刷は 3 秒で片付ける・前の印刷の 3 秒のタイマーは次の印刷の用紙を消さない（片付けは印刷ごとに 1 回）・ページエラーなし: ' + JSON.stringify({ g17, e17p }));
    // (11) 設定: 人物像の節（data-bind 7 種）・項目を 3 行にして保存 → 評価の行 3・満点 15・A4・記入シート。並べ替えても点が残る・検証エラー・OFF
    await setPs('ps_greeting', 4);
    await setPs('ps_smile', 5);
    await toView('settings');
    const set17 = await page.evaluate(() => ({ h: (document.getElementById('s-persona') || {}).textContent, binds: Array.from(document.querySelectorAll('#view-settings [data-bind^="checklist.persona."]')).map(e => e.dataset.bind).sort(),
      note: (document.getElementById('clPsMaxNote') || {}).textContent, items: (document.querySelector('[data-bind="checklist.persona.items"]') || {}).value,
      keep: (document.querySelector('[data-bind="checklist.persona.keepPct"]') || {}).closest('.field').textContent, rej: (document.querySelector('[data-bind="checklist.persona.rejectBelowPct"]') || {}).closest('.field').textContent,
      opts: Array.from(document.querySelectorAll('[data-bind="checklist.persona.onePointResult"] option')).map(o => o.value), enabled: (document.querySelector('[data-bind="checklist.persona.enabled"]') || {}).checked,
      inChecklist: !!document.querySelector('#s-checklist #s-persona') }));
    expect(set17.h === '人物像（1〜5 点）' && set17.inChecklist && JSON.stringify(set17.binds) === JSON.stringify(['checklist.persona.enabled', 'checklist.persona.items', 'checklist.persona.keepPct', 'checklist.persona.onePointResult', 'checklist.persona.rejectBelowPct', 'checklist.persona.title', 'checklist.persona.unscoredResult']) &&
      set17.note.includes('人物像 7 項目') && set17.note.includes('満点 35 点') && set17.items.split('\n')[1] === '第一印象・身だしなみ|身だしなみ|服装・清潔感' && set17.items.split('\n').length === 7 &&
      set17.keep.includes('25 点以上') && set17.rej.includes('14 点未満') && JSON.stringify(set17.opts) === '["none","review","reject"]' && set17.enabled,
      'E17 (11) 設定の「面接チェックリスト」に人物像の節（data-bind 7 種・1 行「項目名|短い名前|説明」・満点 35・25 点以上／14 点未満）: ' + JSON.stringify(set17));
    await page.fill('[data-bind="checklist.persona.items"]', '笑顔・表情|笑顔\n挨拶ができていたか|挨拶\n清潔感のある身だしなみ||髪型・爪');
    await page.locator('[data-bind="checklist.persona.items"]').blur();
    await wait(150);
    const note17 = await txtIn(page, '#clPsMaxNote');
    await saveSettings();
    const spr17 = (await storedProfile()).checklist.persona;
    await toView('judge');
    await navStep(3);
    const r17s = await page.evaluate(() => ({ rows: Array.from(document.querySelectorAll('#clPersona .cl-ps-row')).map(r => r.dataset.psRow), max: document.getElementById('clPsMax').textContent,
      ps: JSON.parse(JSON.stringify(window.RecruitApp.state.checklist.persona)), pressed: Array.from(document.querySelectorAll('#clPersona .cl-ps-btn.active')).map(b => b.dataset.persona + ':' + b.dataset.score),
      hint: (document.querySelector('#clPersona .cl-ps-row:nth-child(3) .hint') || {}).textContent }));
    await judge();
    const a17s = await page.evaluate(() => ({ ps: document.querySelectorAll('#appPaper .cl-blk-persona tr[data-ps-item]').length, tile: (document.querySelector('#appPaper .cl-tile-ps') || {}).textContent }));
    await st(() => window.RecruitApp.preparePaperSheet(true));
    const pp17s = await st(() => ({ ps: document.querySelectorAll('#clSheet tr[data-pp-ps]').length, sum: (document.querySelector('#clSheet .pp-ps-sum') || {}).textContent }));
    await st(() => window.RecruitApp.preparePaperSheet(false));
    expect(note17.includes('人物像 3 項目') && note17.includes('満点 15 点') && spr17.items.length === 3 && spr17.items[0].id === 'ps_smile' && spr17.items[1].id === 'ps_greeting' && /^ps_/.test(spr17.items[2].id) &&
      spr17.items[2].hint === '髪型・爪' && !('short' in spr17.items[2]) && JSON.stringify(r17s.rows) === JSON.stringify(spr17.items.map(it => it.id)) && r17s.max === '15' &&
      r17s.ps.ps_smile === 5 && r17s.ps.ps_greeting === 4 && JSON.stringify(r17s.pressed) === JSON.stringify(['ps_smile:5', 'ps_greeting:4']) && r17s.hint === '髪型・爪' &&
      a17s.ps === 3 && a17s.tile.includes('未入力 1') && a17s.tile.includes('9/15点') && pp17s.ps === 3 && pp17s.sum.includes('/ 15 点'),
      'E17 (11) 項目を 3 行（並べ替え＋新しい項目）にして保存: 評価の行 3・満点 15・入力済みの点は項目名が同じなら残る・A4 の人物像 3 行・記入シート 3 行: ' + JSON.stringify({ note17, items: spr17.items, r17s, a17s, pp17s }));
    //   検証エラー（境界・項目なし）は保存しない・OFF にすると評価に人物像なし・判定にも使わない
    await toView('settings');
    await page.fill('[data-bind="checklist.persona.keepPct"]', '30');
    await page.fill('[data-bind="checklist.persona.rejectBelowPct"]', '50');
    await page.locator('[data-bind="checklist.persona.rejectBelowPct"]').blur();
    await saveSettings();
    const v17a = { issues: await txtIn(page, '#settingsIssues'), stored: (await storedProfile()).checklist.persona.keepPct, toast: await st(() => document.getElementById('toast').className) };
    await page.click('#view-settings [data-action="discard"]');
    await wait(200);
    await page.fill('[data-bind="checklist.persona.items"]', '');
    await page.locator('[data-bind="checklist.persona.items"]').blur();
    await saveSettings();
    const v17b = { issues: await txtIn(page, '#settingsIssues'), stored: (await storedProfile()).checklist.persona.items.length };
    await page.click('#view-settings [data-action="discard"]');
    await wait(200);
    expect(v17a.issues.includes('人物像の得点率の境界（0 ≦ 不採用推奨 ＜ そのまま ≦ 100%）が正しくありません') && v17a.stored === 70 && /\berror\b/.test(v17a.toast) &&
      v17b.issues.includes('人物像の項目がありません') && v17b.stored === 3,
      'E17 (11) 得点率の境界（そのまま 30%・不採用推奨 50%）・項目なしは検証エラーで保存しない: ' + JSON.stringify({ v17a, v17b }));
    await page.click('label:has([data-bind="checklist.persona.enabled"])');
    await wait(100);
    await saveSettings();
    await toView('judge');
    await navStep(3);
    const off17 = await page.evaluate(() => ({ ps: !!document.getElementById('clPersona'), off: !!document.getElementById('clPersonaOff'), lead: !!document.querySelector('.cl-lead-ps'), side: !!document.getElementById('sumPersona'),
      nav: document.getElementById('clNavScore').textContent, miss: document.getElementById('evMissing').textContent, stepLead: document.querySelector('#stepLead span').textContent,
      hint: document.querySelector('#stepNav [data-step="3"] .step-hint').textContent }));
    await rateAll('good');
    await judge();
    const j17off = await judgment();
    const w17off = await st(() => window.RecruitApp.state.judgment.warnings.filter(w => w.indexOf('人物像') >= 0).length);
    const t17off = await page.$$eval('#appPaper .cl-tile-k', els => els.map(e => e.textContent));
    expect(!off17.ps && !off17.off && !off17.lead && !off17.side && !off17.nav.includes('人物像') && !off17.miss.includes('人物像') && j17off.result === 'recommend' && w17off === 0 &&
      JSON.stringify(t17off) === JSON.stringify(['結果', '総合判断', '必須条件', '確認点']) &&
      off17.stepLead === '面接のメモを見ながら、○△×・総合判断を付けます。' && off17.hint === '面接のあとに ○△×・総合判断',
      'E17 (11) 人物像を OFF にして保存すると評価に人物像（注記・前書きの 1 行・未入力の数も・「この画面ですること」・サイドバーの説明も）なし・右サマリーなし・総合判断「採用」で採用推奨（人物像の警告なし・A4 は 4 タイル）: ' + JSON.stringify({ off17, j17off, w17off, t17off }));
    //   使い方も設定に合わせる（OFF なら人物像のカードの先頭と「結果（推奨）の決まり方」の 1 行に「いまの設定では人物像を使いません」）
    await toView('help');
    const help17off = await page.evaluate(() => ({ off: (document.getElementById('helpPersonaOff') || {}).textContent || '',
      rule: Array.from(document.querySelectorAll('#view-help li')).map(li => li.textContent).find(t => t.indexOf('人物像（1〜5 点）の合計が低い') === 0) || '',
      step3: (Array.from(document.querySelectorAll('#view-help .help-step')).find(e => e.querySelector('h3').textContent === '評価') || { textContent: '' }).textContent }));
    expect(help17off.off.includes('いまの設定では人物像を使いません') && help17off.rule.includes('いまの設定では人物像を使いません') && !help17off.step3.includes('人物像') && help17off.step3.includes('総合判断'),
      'E17 (11) 人物像を OFF にすると使い方にも「いまの設定では人物像を使いません」（人物像のカード・結果の決まり方の 1 行。手順 3 評価の説明は人物像を言わない）: ' + JSON.stringify(help17off));
    await toView('settings');
    await page.click('#view-settings [data-action="cl-default"]');
    await wait(150);
    await saveSettings();
    const def17 = (await storedProfile()).checklist.persona;
    expect(def17.enabled === true && def17.items.length === 7 && def17.items[0].id === 'ps_greeting', 'E17 (11) 「既定の台本に戻す」で人物像も既定（ON・7 項目）: ' + JSON.stringify({ enabled: def17.enabled, n: def17.items.length }));
    await toView('judge');
    // (12) 旧い記録（人物像の導入前）: 人物像を使わない（null）・保存時と同じ判定・人物像の警告なし・toast・評価は 1 行の注記・報告書は 4 タイル。保存し直しても null のまま
    const old17 = {};
    for (const f of ['legacy-full-checklist.html', 'legacy-report-view.html', 'legacy-pre-persona.html']) {
      const saved = parseRecord(fs.readFileSync(path.join(FIX, f), 'utf8')).judgment.result;
      await page.click('#btnNew');
      await wait(200);
      await page.setInputFiles('#fileInput', path.join(FIX, f));
      await wait(500);
      const o = await st(() => { const s = window.RecruitApp.state; return { ps: s.checklist.persona, step: s.step, res: s.judgment && s.judgment.result,
        w: ((s.judgment || {}).warnings || []).filter(w => w.indexOf('人物像') >= 0).length, adj: ((s.judgment || {}).adjustments || []).length }; });
      o.saved = saved;
      o.toast = (await toastText()).includes('人物像（1〜5 点）の導入前に保存された記録のため、人物像は使いません');
      o.tiles = await page.$$eval('#appPaper .cl-tile-k', els => els.map(e => e.textContent)).catch(() => []);
      o.psBlk = !!(await page.$('#appPaper .cl-blk-persona'));
      o.side = !!(await page.$('#sumPersona'));
      await navStep(3);
      o.off = !!(await page.$('#clPersonaOff'));
      o.psUi = !!(await page.$('#clPersona'));
      old17[f] = o;
    }
    expect(Object.keys(old17).every(f => { const o = old17[f]; return o.ps === null && o.step === 4 && o.res === o.saved && o.res === 'recommend' && o.w === 0 && o.adj === 0 && o.toast &&
      JSON.stringify(o.tiles) === JSON.stringify(['結果', '総合判断', '必須条件', '確認点']) && !o.psBlk && !o.side && o.off && !o.psUi; }),
      'E17 (12) 旧い記録（詳細モード・報告書／詳細の切替つき・人物像の導入前）: persona は null・保存時と同じ採用推奨・人物像の警告なし・toast・報告書は 4 タイル・評価は 1 行の注記: ' + JSON.stringify(old17));
    await page.click('#toReportBtn');   // 報告書で保存する（評価で保存した記録は読み込んでも評価のまま＝判定前）
    await wait(400);
    const sv17 = await saveRecord('p12-legacy-pre-persona-resaved.html');
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', sv17.file);
    await wait(500);
    const re17 = await st(() => { const s = window.RecruitApp.state; return { ps: s.checklist.persona, res: s.judgment && s.judgment.result, w: ((s.judgment || {}).warnings || []).length }; });
    expect(sv17.rec.checklist.persona === null && !!sv17.rec.checklistDef.persona && sv17.rec.step === 4 && re17.ps === null && re17.res === 'recommend' && re17.w === 0,
      'E17 (12) 人物像の導入前の記録を保存し直しても persona は null のまま（もう一度読み込んでも採用推奨・警告なし）: ' + JSON.stringify({ rec: sv17.rec.checklist.persona, re17 }));
    //   人物像の導入前に準備だけ保存した記録（回答なし。fixture を準備の段階に戻したもの）は、これから面接するので人物像を使う（{}。docs/SPEC-persona.md 11-9 補完 1）:
    //   導入前の toast・注記は出さず、評価に人物像 7 行（記入シートと同じ並び）→ 点を入れれば採用推奨（5 タイル）→ 保存し直しても点が残る
    const fx17 = fs.readFileSync(path.join(FIX, 'legacy-pre-persona.html'), 'utf8');
    const lp17 = parseRecord(fx17);
    Object.assign(lp17, { step: 1, judgment: null, management: {}, decision: null, interviewNotes: '' });
    Object.assign(lp17.checklist, { values: {}, notes: {}, overall: '' });
    const f17s1 = path.join(OUT, 'p12-legacy-pre-persona-step1.html');
    fs.writeFileSync(f17s1, fx17.replace(/(<script type="application\/json" id="recruit-record">)[\s\S]*?(<\/script>)/,
      (m, a, b) => a + JSON.stringify(lp17).replace(/[<>&\u2028\u2029]/g, ch => '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4)) + b));
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', f17s1);
    await wait(500);
    const s1x17 = Object.assign({ toast: await toastText(), defPs: 'persona' in lp17.checklistDef, keyPs: 'persona' in lp17.checklist },
      await st(() => { const s = window.RecruitApp.state; return { ps: s.checklist.persona, step: s.step, name: s.applicant.name }; }));
    await page.click('[data-action="script-next"]');
    await wait(400);
    s1x17.iv = await step();
    await goTo(3);
    Object.assign(s1x17, await st(() => ({ rows: document.querySelectorAll('#clPersona .cl-ps-row').length, off: !!document.getElementById('clPersonaOff'),
      lead: !!document.querySelector('#clPersona .cl-lead-ps') })));
    await st(() => window.RecruitApp.preparePaperSheet(true));
    s1x17.paper = await st(() => document.querySelectorAll('#clSheet tr[data-pp-ps]').length);
    await st(() => window.RecruitApp.preparePaperSheet(false));
    await rateAll('good');
    await judge();
    s1x17.res = (await judgment()).result;
    s1x17.tiles = await page.$$eval('#appPaper .cl-tile-k', els => els.map(e => e.textContent));
    const sv17s1 = await saveRecord('p12-legacy-pre-persona-step1-resaved.html');
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', sv17s1.file);
    await wait(500);
    s1x17.re = await st(() => { const s = window.RecruitApp.state; return { ps: s.checklist.persona, res: s.judgment && s.judgment.result }; });
    expect(!s1x17.defPs && !s1x17.keyPs && s1x17.step === 1 && s1x17.name === '保存 花子' && JSON.stringify(s1x17.ps) === '{}' && !s1x17.toast.includes('人物像（1〜5 点）の導入前') &&
      s1x17.iv === 2 && s1x17.rows === 7 && !s1x17.off && s1x17.lead && s1x17.paper === 7 && s1x17.res === 'recommend' && JSON.stringify(s1x17.tiles) === JSON.stringify(['結果', '総合判断', '必須条件', '確認点', '人物像']) &&
      PS17.every(id => sv17s1.rec.checklist.persona[id] === 4) && keyed17(s1x17.re.ps) === keyed17(sv17s1.rec.checklist.persona) && s1x17.re.res === 'recommend',
      'E17 (12) 人物像の導入前に準備だけ保存した記録（回答なし）は人物像を使う（{}・導入前の toast と注記なし）・面接を経て評価に人物像 7 行（記入シートと同じ）・点を入れれば採用推奨（5 タイル）・保存し直しても点が残る: ' + JSON.stringify(s1x17));
    //   人物像の項目が保存時と違う記録（両方に人物像あり。docs/SPEC-persona.md 1-7・D19）: 志望動機を外して「電話応対の丁寧さ」を足した設定で、既定の 7 項目すべて 4 点の保存 HTML（(7) の p12-persona-report.html）を読み込む
    //   → toast「保存時と人物像の項目が異なります（追加 1・削除 1）。現在の項目で再判定します」・現在の項目で再判定（足した項目は未入力 → 上長最終判断要）。既定の項目に戻すと同じ記録でも出ない
    await toView('settings');
    const it17d = (await page.inputValue('[data-bind="checklist.persona.items"]')).split('\n');
    await page.fill('[data-bind="checklist.persona.items"]', it17d.slice(0, 6).concat(['電話応対の丁寧さ|電話']).join('\n'));
    await page.locator('[data-bind="checklist.persona.items"]').blur();
    await wait(150);
    await saveSettings();
    const ids17d = (await storedProfile()).checklist.persona.items.map(it => it.id);
    await toView('judge');
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', saved17.file);
    await wait(500);
    const d19 = Object.assign({ toast: await toastText() }, await st(() => { const s = window.RecruitApp.state, j = s.judgment || {};
      return { step: s.step, res: j.result, adj: (j.adjustments || []).map(a => a.code), w: (j.warnings || []).slice(), motivation: s.checklist.persona && s.checklist.persona.ps_motivation }; }));
    expect(it17d.length === 7 && ids17d.length === 7 && ids17d.slice(0, 6).join() === PS17.slice(0, 6).join() && !ids17d.includes('ps_motivation') &&
      d19.toast.includes('保存時と人物像の項目が異なります（追加 1・削除 1）。現在の項目で再判定します') && d19.toast.includes('保存時の判定（採用推奨）と現在の設定での再判定（上長最終判断要）が異なります') &&
      d19.step === 4 && d19.res === 'review' && JSON.stringify(d19.adj) === '["persona_unscored"]' && d19.w.includes('人物像に未入力が 1 項目あります（電話）。') && d19.motivation === 4,
      'E17 (12) 人物像の項目が保存時と違う記録: toast「保存時と人物像の項目が異なります（追加 1・削除 1）。現在の項目で再判定します」・現在の項目で再判定（足した「電話」は未入力 → 上長最終判断要。記録の点はそのまま）: ' + JSON.stringify({ ids17d, d19 }));
    await toView('settings');
    await page.click('#view-settings [data-action="cl-default"]');
    await wait(150);
    await saveSettings();
    await toView('judge');
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', saved17.file);
    await wait(500);
    const d19b = { toast: await toastText(), res: await st(() => (window.RecruitApp.state.judgment || {}).result) };
    expect(!d19b.toast.includes('人物像の項目が異なります') && d19b.res === 'recommend', 'E17 (12) 既定の項目に戻すと同じ記録でも人物像の項目の toast は出ない（採用推奨）: ' + JSON.stringify(d19b));
    // (13) 使い方
    await toView('help');
    const help17 = await page.evaluate(() => ({ card: (document.getElementById('helpPersona') || {}).textContent || '', steps: document.querySelectorAll('#view-help .help-step').length,
      step3: (document.querySelectorAll('#view-help .help-step')[2] || {}).textContent || '', iv: Array.from(document.querySelectorAll('#helpInterview li')).map(li => li.textContent),
      rule: Array.from(document.querySelectorAll('#view-help .card')).map(c => c.textContent).find(t => t.includes('結果（推奨）の決まり方')) || '',
      settings: (document.getElementById('helpSettings') || {}).textContent || '',
      off: !!document.getElementById('helpPersonaOff') }));
    expect(help17.steps === 4 && ['人物像（1〜5 点）と記入シート', '評価の画面の人物像のカードで', '記入シート（手書き用）', '70% 以上はそのまま', '40% 未満は不採用推奨', '最低限の話し方、敬語が可能か'].every(t => help17.card.includes(t)) &&
      help17.step3.includes('人物像（1〜5 点）') && help17.step3.includes('面接のあとに') && help17.rule.includes('人物像（1〜5 点）の合計が低い') &&
      help17.rule.includes('40% 未満なら不採用推奨') && !help17.off && !help17.rule.includes('いまの設定では人物像を使いません') && !help17.card.includes('面接中はメモを中心に'),
      'E17 (13) 使い方に「人物像（1〜5 点）と記入シート」（評価の画面の人物像・判定への反映・記入シート・rt_manner を外した理由）・ステップ 3（評価）と結果の決まり方にも 1 行（.help-step は 4 つ。面接中のメモの案内は「面接の進め方」へ）: ' + JSON.stringify({ steps: help17.steps, len: help17.card.length }));
    //   面接中はメモを中心に（評価は面接のあと）・1 対 1 でない面接は記入シートに書いて面接後に転記（フィードバック ①②。「1 対 1 でなくても回せます」と逆に案内しない。docs/SPEC-persona.md 11-9 補完 2・docs/SPEC-flow.md 7-1）
    expect(help17.iv.includes('聞くことは質問の下に答えを短くメモします（Tab で次の質問のメモへ）。○△× などの評価は面接のあとでまとめて付けます。') &&
      help17.iv.includes('1 対 1 でない面接は記入シートに書き、終わったら面接の画面に転記してください。転記にかかった時間は面接時間ではないので、評価の画面の「面接時間」に記入シートの分を入れます（目安から大きく外れていると「面接時間を確かめてください」と出ます）。') && !help17.card.includes('1 対 1 でなくても') && !help17.iv.some(t => t.includes('1 対 1 でなくても')),
      'E17 (13) 使い方の「面接の進め方」: 面接中はメモ・評価は面接のあとでまとめて・1 対 1 でない面接は記入シートに書いて転記（転記の時間は面接時間ではないので評価で分を入れる。docs/SPEC-flow.md 15-2）: ' + JSON.stringify(help17.iv));
    //   使い方のほかの箇所も人物像・記入シートに合わせる（記入シートのボタンの場所は準備・設定のカード・前書きの話し方・敬語の付け先。docs/SPEC-persona.md 11-9 補完 5）
    //   （ボタンの 🖨 は 2026-10-18 から SVG のアイコン。文の中ではボタンの名前だけを書く）
    expect(help17.card.includes('準備の画面の「記入シート（手書き用）」（「面接を始める →」の左）で A4 1 枚を印刷できます（面接 ①〜⑤ → 評価の順・質問ごとに答えの線。') &&
      !help17.card.includes('Step①') && !help17.card.includes('Step②') &&
      help17.settings.includes('面接チェックリスト（台本の文言・項目・確認点・人物像）') && help17.settings.includes('台本を変えると面接・評価の画面と記入シートにそのまま反映されます') &&
      help17.card.includes('台本 1 枚目の前書きにある話し方・敬語は、この人物像の項目で付けます'),
      'E17 (13) 使い方の記入シートのボタンの場所（準備の「面接を始める →」の左）・並び（面接 ①〜⑤ → 評価）・設定のカード（人物像・台本の反映）・前書きの話し方・敬語の付け先: ' + JSON.stringify({ settings: help17.settings }));
    //   項目名は「、」でつなぐ（「笑顔・表情」の「・」と区別。D6）・「結果（推奨）の決まり方」の人物像の 1 行は既定ではこの文言
    const lis17 = () => page.evaluate(() => Array.from(document.querySelectorAll('#view-help li')).map(li => li.textContent));
    const RULE17 = '人物像（1〜5 点）の合計が低い・1 点の項目がある・未入力があると、結果を上長最終判断要（合計が 40% 未満なら不採用推奨）まで下げます（下げる方向だけ。設定で変更可）。';
    const hl17a = await lis17();
    expect(hl17a.some(t => t.includes('7 項目（挨拶、身だしなみ、笑顔・表情、声のトーン、目線、言葉遣い、志望動機）に 1〜5 点を付けます（1 不採用レベル・2 やや不安・3 普通・4 良い・5 とても良い）')) && hl17a.includes(RULE17),
      'E17 (13) 使い方の人物像の項目名は「、」でつなぐ（7 項目が 8 つに読めない）・結果の決まり方の人物像の 1 行（既定）: ' + JSON.stringify(hl17a.filter(t => t.includes('人物像'))));
    //   1 点・未入力・境界の設定を変えると、「判定への反映」と「結果（推奨）の決まり方」の 1 行が同じ内容になる（1 点＝不採用推奨・未入力＝調整しない・境界 60/30）
    await toView('settings');
    await page.selectOption('[data-bind="checklist.persona.onePointResult"]', 'reject');
    await page.selectOption('[data-bind="checklist.persona.unscoredResult"]', 'none');
    //   境界の欄は change で設定画面を描き直す（data-repaint）ので、1 欄ずつ入れて描き直しを待つ
    for (const [k, v] of [['keepPct', '60'], ['rejectBelowPct', '30']]) {
      await page.fill('[data-bind="checklist.persona.' + k + '"]', v);
      await page.locator('[data-bind="checklist.persona.' + k + '"]').blur();
      await wait(150);
    }
    await saveSettings();
    const sp17r = (await storedProfile()).checklist.persona;
    await toView('help');
    const hl17b = await lis17();
    expect(sp17r.onePointResult === 'reject' && sp17r.unscoredResult === 'none' && sp17r.keepPct === 60 && sp17r.rejectBelowPct === 30 &&
      hl17b.some(t => t.includes('得点率 60% 以上はそのまま・30% 以上 60% 未満は上長最終判断要まで・30% 未満は不採用推奨。1 点の項目が 1 つでもあれば不採用推奨、未入力があれば下げない')) &&
      hl17b.includes('人物像（1〜5 点）の合計が低いと、結果を上長最終判断要（合計が 30% 未満・1 点の項目があるなら不採用推奨）まで下げます（下げる方向だけ。設定で変更可）。') && !hl17b.includes(RULE17),
      'E17 (13) 1 点＝不採用推奨・未入力＝調整しない・境界 60/30 にすると、結果の決まり方の人物像の 1 行も「判定への反映」と同じ内容: ' + JSON.stringify(hl17b.filter(t => t.includes('人物像'))));
    //   評価の総合判断の説明・人物像の状態も同じ設定から（docs/SPEC-persona.md 11-9 補完 4）: 読み込んだ記録（7 項目すべて 4 点＝80%）→ 緑「60% 以上」・
    //   1 項目を未入力に戻す（未入力＝調整しない）→ 灰「未入力 1」（下がらない）・笑顔・表情を 1 点（1 点＝不採用推奨）→ 赤「未入力 1・不採用推奨」と警告
    await toView('judge');
    await navStep(3);
    const ov17r = async () => Object.assign(await psUi17(), { hint: await st(() => Array.from(document.querySelectorAll('#clOverall .card-note')).map(h => h.textContent).join(' ')) });
    const ov17a = await ov17r();
    await setPs('ps_greeting', 0);
    await wait(80);
    const ov17b = await ov17r();
    await setPs('ps_smile', 1);
    await wait(80);
    const ov17c = await ov17r();
    expect(ov17a.hint.includes('人物像（1〜5 点）の合計が低いと、結果を上長最終判断要（合計が 30% 未満・1 点の項目があるなら不採用推奨）まで下げます。') && !ov17a.hint.includes('未入力がある') &&
      ov17a.state === '60% 以上' && ov17a.stateCls.includes('ok') && ov17b.state === '未入力 1' && ov17b.stateCls.includes('muted') &&
      ov17c.state === '未入力 1・不採用推奨' && ov17c.stateCls.includes('danger') && ov17c.warn === '1 点の項目があります（笑顔・表情）。結果は不採用推奨になります。',
      'E17 (13) 1 点＝不採用推奨・未入力＝調整しない・境界 60/30 の設定では、評価の総合判断の説明と人物像の状態もその設定どおり（未入力だけなら灰・1 点ありは赤「不採用推奨」）: ' + JSON.stringify({ ov17a, ov17b, ov17c }));
    //   人物像の項目名・目盛りの文言・結果の表示名は設定（画面・JSON の読み込み）から入る → 使い方・設定・② では文字として出す（img を作らない・onerror は走らない）
    await toView('settings');
    await page.click('#view-settings [data-action="cl-default"]');
    await wait(150);
    const xi17 = (await page.inputValue('[data-bind="checklist.persona.items"]')).split('\n');
    xi17[0] = '<img src=x onerror="window.__x17a=1">';
    await page.fill('[data-bind="checklist.persona.items"]', xi17.join('\n'));
    await page.locator('[data-bind="checklist.persona.items"]').blur();
    await wait(150);
    await saveSettings();
    await toView('help');
    await wait(200);
    const xs17a = await page.evaluate(() => ({ ran: window.__x17a === 1, img: document.querySelectorAll('#view-help img').length,
      txt: ((document.getElementById('helpPersona') || {}).textContent || '').includes('<img src=x onerror="window.__x17a=1">') }));
    //   JSON の読み込み: 人物像の短い名前・目盛りの文言・結果の表示名（texts.review.title）に img。あわせて境界 keepPct 500（範囲外）は既定（70/40）に戻す
    const xj17 = await page.evaluate(() => { const p = window.RecruitStorage.defaults();
      p.checklist.persona.items[2].short = '<img src=x onerror="window.__x17b=1">'; p.checklist.persona.scaleLabels[0] = '<img src=x onerror="window.__x17c=1">';
      p.texts.review.title = '<img src=x onerror="window.__x17d=1">'; p.checklist.persona.keepPct = 500; return JSON.stringify(p); });
    const xf17 = path.join(OUT, 'p12-xss-profile.json');
    fs.writeFileSync(xf17, xj17);
    await toView('settings');
    await page.setInputFiles('#profileFileInput', xf17);
    await wait(600);
    const xs17b = await page.evaluate(() => ({ view: ['judge', 'settings', 'help'].find(v => !document.getElementById('view-' + v).classList.contains('hidden')), img: document.querySelectorAll('#view-settings img').length,
      keep: (document.querySelector('[data-bind="checklist.persona.keepPct"]') || {}).value, issues: !!document.getElementById('settingsIssues') }));
    const sp17x = (await storedProfile()).checklist.persona;
    await toView('help');
    await wait(200);
    const xs17c = await page.evaluate(() => ({ img: document.querySelectorAll('#view-help img').length, txt: ((document.getElementById('helpPersona') || {}).textContent || '') }));
    await toView('judge');
    await navStep(3);
    await wait(200);
    const xs17d = await page.evaluate(() => ({ img: document.querySelectorAll('#view-judge img').length, ran: [window.__x17a, window.__x17b, window.__x17c, window.__x17d].filter(Boolean).length }));
    expect(!xs17a.ran && xs17a.img === 0 && xs17a.txt && xs17b.view === 'settings' && xs17b.img === 0 && xs17b.keep === '70' && !xs17b.issues && sp17x.keepPct === 70 && sp17x.rejectBelowPct === 40 &&
      xs17c.img === 0 && ['<img src=x onerror="window.__x17b=1">', '1 <img src=x onerror="window.__x17c=1">', '<img src=x onerror="window.__x17d=1">'].every(t => xs17c.txt.includes(t)) && xs17d.img === 0 && xs17d.ran === 0,
      'E17 (13) 人物像の項目名（設定の画面）・短い名前・目盛りの文言・結果の表示名（JSON の読み込み）に img を入れても、使い方・設定・② では文字のまま（onerror は走らない）。読み込んだ境界 500% は既定（70/40）に戻す: ' + JSON.stringify({ xs17a, xs17b, keep: [sp17x.keepPct, sp17x.rejectBelowPct], xs17c: xs17c.img, xs17d }));
    await toView('judge');
    expect(e17.length === 0, 'E17 保存 HTML のページエラー・console error なし: ' + (e17.join(' / ') || 'none'));
  }
  // =====================================================================
  // E18 面接の流れ（docs/SPEC-flow.md 9-4。2026-10-16 副支配人「実際の面接を想定したかたちにしてほしい」）
  //   準備 → 面接（1 段階ずつ・タイマー）→ 評価 → 報告書。画面の操作だけで通す・タイマーは別の BrowserContext の page.clock で進める
  // =====================================================================
  console.log('\n== E18 面接の流れ ==');
  {
    const e18 = [];
    const PS18 = ['ps_greeting', 'ps_impression', 'ps_smile', 'ps_voice', 'ps_eye', 'ps_speech', 'ps_motivation'];
    const SECS18 = ['conditions', 'continuity', 'job', 'teamwork', 'reverse'];
    const NOSTICKY18 = '.topbar,.iv-top,.ev-top,.iv-timer,.iv-must,.flow-foot{position:static !important}';   // 準備・報告書の操作行（固定）・狭い画面のタイマーと案内（固定）も
    // 全体のスクリーンショット（撮るあいだだけ sticky を外す・先頭へ・toast とフォーカスを外す）／見えている範囲のスクリーンショット
    const full18 = async (pg, name) => {
      await pg.mouse.move(1, 1);
      await pg.evaluate((css) => { const s = document.createElement('style'); s.id = 'e2eNoSticky18'; s.textContent = css + '#toast{transition:none !important}'; document.head.appendChild(s); window.scrollTo(0, 0);
        const t = document.getElementById('toast'); if (t) t.classList.remove('show'); const a = document.activeElement; if (a && a.blur) a.blur(); }, NOSTICKY18);
      await pg.waitForTimeout(150);
      await pg.screenshot({ path: path.join(OUT, name), fullPage: true });
      await pg.evaluate(() => { const s = document.getElementById('e2eNoSticky18'); if (s) s.remove(); });
    };
    const view18 = async (pg, name) => {
      await pg.mouse.move(1, 1);
      await pg.evaluate(() => { window.scrollTo(0, 0); const s = document.createElement('style'); s.id = 'e2eNoToast18'; s.textContent = '#toast{transition:none !important}'; document.head.appendChild(s);
        const t = document.getElementById('toast'); if (t) t.classList.remove('show'); const a = document.activeElement; if (a && a.blur && a.tagName !== 'BODY') a.blur(); });
      await pg.waitForTimeout(150);
      await pg.screenshot({ path: path.join(OUT, name) });
      await pg.evaluate(() => { const s = document.getElementById('e2eNoToast18'); if (s) s.remove(); });
    };
    // 面接の段階が見えるか: ivFit・ivSeen（共通のヘルパ。E19 (4) と同じ）
    // 今の段階のメモ（質問ごと）を埋める（スクリーンショット用に答えらしい文。無い質問は「（段階）の答え」）
    const ANS18 = { q_term: '長期希望。卒業まで続けたい', q_two_months: '問題なし。試験期間も週3日は出せる', q_family: '反対なし。終電の時間も家族と確認済み',
      q_prev_job: '飲食で1年。学業との両立のため退職', q_cant_3days: '分かった時点で早めに相談する', q_sudden_absence: 'すぐ電話で連絡する',
      q_value: '笑顔と提供のスピード', q_failure: 'オーダーを間違えた。復唱するようにした', q_unsure: '清掃。やり方を教われば大丈夫',
      q_feedback: '声が小さいと言われ、意識して改善した', q_unknown: '近くのスタッフに確認する', q_busy_mind: '周りを見て声をかけ合う', q_concerns: '研修の期間と制服の貸し出し' };
    const memo18 = async (pg, tag) => {
      for (const c of await pg.$$eval('#ivStage textarea.iv-q-memo', els => els.map(e => e.getAttribute('data-cl')))) await pg.fill('#ivStage textarea[data-cl="' + c + '"]', ANS18[c.replace('notes.', '')] || tag + 'の答え');
    };
    const saidOf18 = (pg, sec, kind) => pg.$eval(`[data-action="iv-said"][data-sec="${sec}"][data-kind="${kind || 'explain'}"]`, b => window.__lbl(b) + '|' + b.getAttribute('aria-pressed'));
    const vals18 = (pg, ids) => pg.evaluate(ids => { const v = window.RecruitApp.state.checklist.values; return ids.map(id => v[id] === true); }, ids);

    // (1) 初見の通し（画面のボタンだけ。st で状態を書き換えない）: はじめての方へ → 氏名 → 面接を始める → ①〜⑤ → 評価 → 報告書 → 押印 → 保存
    //   時計は止めておく（E17 の install で動いている。数秒で通すと評価に「面接時間を確かめてください」が出て、p13-evaluate.png の通しの画面に写るため。タイマーは (2)・E19 の別の BrowserContext で確かめる）
    await page.clock.setFixedTime(NOW);
    await page.setViewportSize({ width: 1440, height: 900 });
    await fresh();
    const in18 = await page.evaluate(() => ({ intro: !!document.getElementById('introCard'), stored: (() => { try { return localStorage.getItem('recruit.intro.v1'); } catch (e) { return 'x'; } })() }));
    await view18(page, 'p13-prep.png');
    await page.click('#introOk');
    await wait(150);
    const in18b = await page.evaluate(() => ({ intro: !!document.getElementById('introCard'), stored: localStorage.getItem('recruit.intro.v1'), focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.field : '' }));
    expect(in18.intro && in18.stored === null && !in18b.intro && in18b.stored === '1' && in18b.focus === 'name',
      'E18 (1)(7) 初回は「はじめての方へ」・［わかった］で閉じて localStorage に覚える（recruit.intro.v1 = 1）・氏名の欄にフォーカス: ' + JSON.stringify({ in18, in18b }));
    await page.fill('[data-field="name"]', '流れ 太郎');
    await page.fill('[data-field="age"]', '20');
    await page.selectOption('[data-field="category"]', '大学2年生');
    await page.click('[data-action="cl-set"][data-cl="header.posting"][data-value="short"]');
    await page.selectOption('#saInterviewer', '笹川 晴央');
    await page.click('#saNext');
    await wait(300);
    // ① 勤務条件: 必須条件 一致×2・記入欄・［説明した］・メモ 3
    await page.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="match"]');
    await page.click('[data-action="cl-set"][data-cl="values.weekend"][data-value="both"]');
    await page.fill('#ivStage input[data-cl="values.busy_ng"]', 'なし');
    await page.click('[data-action="cl-set"][data-cl="values.term"][data-value="long"]');   // 1 問目のメモ（長期希望）と同じ答え
    await page.fill('#ivStage input[data-cl="values.start_date"]', '2026-11-01');
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    await memo18(page, '①');
    await wait(150);
    const f18 = { conditions: await ivFit(page) };
    await view18(page, 'p13-interview-1.png');
    const s18a = { said: await saidOf18(page, 'conditions'), v: await vals18(page, ['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch']) };
    // ② 以降: ［次へ］・［説明した］・メモ（③ から ④ へは Ctrl+Enter）
    await page.click('#ivNext');
    await wait(250);
    await page.click('[data-action="iv-said"][data-sec="continuity"][data-kind="explain"]');
    await memo18(page, '②');
    await wait(150);
    f18.continuity = await ivFit(page);
    await view18(page, 'p13-interview-2.png');
    await page.click('#ivNext');
    await wait(250);
    await page.click('[data-action="iv-said"][data-sec="job"][data-kind="explain"]');
    await memo18(page, '③');
    f18.job = await ivFit(page);
    await page.focus('#ivStage textarea[data-cl="notes.q_unsure"]');
    await page.keyboard.press('Control+Enter');
    await wait(250);
    const ce18 = await page.evaluate(() => ({ sec: document.getElementById('ivStage').dataset.sec, focus: document.activeElement && document.activeElement.id }));
    await page.click('[data-action="iv-said"][data-sec="teamwork"][data-kind="explain"]');
    await memo18(page, '④');
    f18.teamwork = await ivFit(page);
    await page.click('#ivNext');
    await wait(250);
    await page.click('[data-action="iv-said"][data-sec="reverse"][data-kind="notify"]');
    await memo18(page, '⑤');
    await wait(150);
    f18.reverse = await ivFit(page);
    const end18 = await lblOf('#ivNext');
    await page.click('#ivNext');
    await wait(300);
    expect(s18a.said === '[check] 説明した|true' && s18a.v.every(Boolean) && ce18.sec === 'teamwork' && ce18.focus === 'ivStageH' && end18 === '面接を終えて評価へ [arrow-right]' && await step() === 3,
      'E18 (1) 面接: ① で［説明した］（短期求人なので 4 項目）・Ctrl+Enter で次の段階（④・見出しにフォーカス）・⑤ の「面接を終えて評価へ →」で評価へ: ' + JSON.stringify({ s18a, ce18, end18 }));
    // 1440×900: ①〜⑤ とも、隠れている項目は「▼ 下にあと n 項目」で知らせ、いちばん下までスクロールすれば最後の要素（流れの注記・最後のカード）が操作行の上に見える。操作行は画面の下端
    //   （2026-10-18 に 2 列 → 縦一列。「1 画面に収まる」は「操作行が中身を隠さない・最後の項目までスクロールで届く」に置き換え。docs/DESIGN.md 4-3）
    expect(SECS18.every(k => ivSeen(f18[k])) && Object.keys(f18).every(k => Math.abs(f18[k].footBottom) <= 1),
      'E18 1440×900: ①〜⑤ とも操作行が中身を隠さない（隠れている項目は「▼ 下にあと n 項目」・いちばん下までスクロールすると最後の要素は操作行の上）・操作行は画面の下端: ' + JSON.stringify(f18));
    // 評価: 確認点 6 つに ○・人物像 7 つに 4・総合判断「採用」・面接所見 → 報告書へ
    for (const b of await page.$$('#stepContent .cl-rate-row [data-action="cl-set"][data-value="good"]')) await b.click();
    for (const id of PS18) await page.click('[data-action="ps-set"][data-persona="' + id + '"][data-score="4"]');
    await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hire"]');
    await page.fill('#clIvNotes', '受け答えが丁寧で、具体的に話せていた。');
    await wait(150);
    const ev18 = await page.evaluate(() => ({ res: document.getElementById('evResultTitle').textContent, why: document.getElementById('evResultWhy').textContent, miss: document.getElementById('evMissing').textContent,
      qa: Array.from(document.querySelectorAll('#cl-conditions .ev-qa > div')).map(d => d.querySelector('dt').textContent + '=' + d.querySelector('dd').textContent),
      said: Array.from(document.querySelectorAll('.ev-said')).map(d => d.querySelector('dt').textContent + '=' + window.__lbl(d.querySelector('dd'))), kv: Array.from(document.querySelectorAll('#cl-conditions .ev-kv > div')).map(d => d.querySelector('dt').textContent + '=' + d.querySelector('dd').textContent) }));
    await full18(page, 'p13-evaluate.png');
    expect(ev18.res === '採用推奨' && ev18.why === '総合判断「採用」のとおり' && ev18.miss === '未入力はありません' &&
      //   （2026-10-18 から面接のメモは値の行〔左にラベル・右に値〕。質問には面接の画面と同じ Q 番号。docs/DESIGN.md 4-4）
      JSON.stringify(ev18.qa) === JSON.stringify(['Q1短期／長期の希望=' + ANS18.q_term, 'Q2最初の2か月で条件を満たせない可能性=' + ANS18.q_two_months, 'Q3家族の反対=' + ANS18.q_family]) &&
      JSON.stringify(ev18.said) === JSON.stringify(['説明=[check] 説明した（4/4）', '説明=[check] 説明した（3/3）', '説明=[check] 説明した（4/4）', '説明=[check] 説明した（3/3）', '合否連絡=[check] 伝えた']) &&
      ev18.kv.includes('土日勤務可否=両日') && ev18.kv.includes('短期／長期の希望=長期希望') && ev18.kv.includes('契約開始日の希望=2026/11/01') && ev18.kv.includes('初回契約終了=—'),
      'E18 (1) 評価: 段階のカードに面接のメモ（質問ごと・記入欄・説明）・いまの結果「採用推奨」（総合判断「採用」のとおり・未入力はありません）: ' + JSON.stringify(ev18));
    await page.click('#toReportBtn');
    await wait(400);
    const rp18 = await page.evaluate(() => ({ step: window.RecruitApp.state.step, res: (document.querySelector('#appPaper .cl-tile-res') || {}).textContent || '',
      rows: Array.from(document.querySelectorAll('#appPaper .cl-nm-q[data-cl-note]')).map(r => r.dataset.clNote), back: window.__lbl(document.getElementById('backToChecklist')),
      save: window.__lbl(document.getElementById('reportSaveBtn')), lead: (document.querySelector('#stepLead span') || {}).textContent }));
    await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
    await wait(150);
    const sv18 = await saveRecord('p13-flow.html');
    const r18 = sv18.rec, tmg18 = r18.checklist.timing || {};
    expect(rp18.step === 4 && rp18.res.includes('採用推奨') && rp18.rows.length === 13 && rp18.back === '[arrow-left] 評価に戻る' && rp18.save === '[download] 報告書を保存（HTML）' &&
      rp18.lead === '「面接対応者」に押印して、報告書を保存（HTML）します（最終確認・最終合否は副支配人が押します）。' && r18.step === 4 && Object.keys(r18.checklist.notes).filter(k => /^q_/.test(k)).length === 13 &&
      !!tmg18.startedAt && !!tmg18.endedAt && JSON.stringify(Object.keys(tmg18.perStage || {}).sort()) === JSON.stringify(SECS18.slice().sort()) && tmg18.stage === 'reverse' &&
      r18.management.interviewer.name === '笹川 晴央' && r18.judgment.result === 'recommend',
      'E18 (1) 報告書: 採用推奨・A4 に質問ごとのメモ 13 行・押印して保存（step 4・notes の質問 13・timing の開始／終了・5 段階・最後は ⑤）: ' + JSON.stringify({ rp18, timing: tmg18 }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);

    // (2) 段階のチップとタイマー（別の BrowserContext・page.clock で時計を進める。docs/SPEC-flow.md 3-7・F10〜F12）
    const ctx18 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ja-JP', acceptDownloads: true });
    const tp = await ctx18.newPage();
    tp.on('pageerror', e => e18.push('timer: ' + e.message));
    tp.on('console', m => { if (m.type() === 'error') e18.push('timer console: ' + m.text()); });
    tp.on('dialog', d => d.accept());
    await tp.clock.install({ time: NOW });
    await tp.goto(FILE);
    await tp.waitForTimeout(300);
    const T0 = +NOW + 60000;
    await tp.clock.pauseAt(new Date(T0));
    const tm18 = () => tp.evaluate(() => { const g = (id) => (document.getElementById(id) || {}).textContent || ''; const s = document.getElementById('ivTStage');
      return { stage: document.getElementById('ivStage') ? document.getElementById('ivStage').dataset.sec : '', val: g('ivTStageVal'), goal: g('ivTStageGoal'), total: g('ivTTotal'),
        over: !!s && s.classList.contains('is-over'), late: !!s && s.classList.contains('is-late'),
        chips: Array.from(document.querySelectorAll('#ivChips .iv-chip')).map(c => (c.classList.contains('is-current') ? '*' : '') + c.querySelector('.iv-chip-no').textContent + c.querySelector('.iv-chip-s').textContent) }; });
    const tming18 = () => tp.evaluate(() => JSON.parse(JSON.stringify(window.RecruitApp.state.checklist.timing || null)));
    await tp.fill('[data-field="name"]', '時計 花子');
    await tp.click('[data-action="cl-set"][data-cl="header.posting"][data-value="short"]');
    await tp.click('#saNext');
    await tp.waitForTimeout(200);
    const t18a = await tm18(), st18a = await tming18();
    const dirty18 = await tp.evaluate(() => { window.RecruitApp.state.dirty = false; return true; });
    await tp.fill('#ivStage textarea[data-cl="notes.q_term"]', '短期希望。2か月のあとは長期も相談したい');
    await tp.fill('#ivStage textarea[data-cl="notes.q_two_months"]', '試験期間の1月は週2日になる可能性あり');
    await tp.click('[data-action="cl-set"][data-cl="values.term"][data-value="short"]');   // 1 問目の答えは【質問】の記入欄にも（確かめることの勤務条件の確認。Q1 のタグの欄）
    await tp.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');
    await tp.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="match"]');
    await tp.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    await tp.evaluate(() => { window.RecruitApp.state.dirty = false; });
    await tp.clock.runFor(372000);
    const t18b = await tm18();
    const clean18 = await tp.evaluate(() => window.RecruitApp.state.dirty === false && window.RecruitApp.state.judgment === null);
    await tp.clock.runFor(229000);
    const t18c = await tm18();
    await tp.clock.runFor(299000);
    const t18d = await tm18();
    expect(dirty18 && t18a.stage === 'conditions' && t18a.val === '00:00' && t18a.goal === '/ 目安 10分' && t18a.total === '00:00' && !!st18a && st18a.startedAt === new Date(T0).toISOString() &&
      st18a.stage === 'conditions' && st18a.perStage.conditions === 0 && t18b.val === '06:12' && !t18b.over && !t18b.late && t18b.total === '06:12' && clean18 &&
      t18c.val === '10:01' && t18c.over && !t18c.late && t18d.val === '15:00' && t18d.over && t18d.late && t18d.total === '15:00',
      'E18 (2) タイマー: 開始は 00:00「/ 目安 10分」（startedAt・stage・perStage）→ 6 分 12 秒で「06:12」（色なし。毎秒の表示で記録の変更・判定を起こさない）→ 601 秒で琥珀（.is-over）→ 900 秒で赤（.is-late）・合計 15:00: ' +
      JSON.stringify({ t18a, st18a, t18b, t18c, t18d, clean18 }));
    // ダークでもタイマーの超過・「✓ 説明した」・今のチップの文字は 4.5:1 以上（data-theme・prefers-color-scheme の両方）
    const con18 = () => tp.evaluate(() => {
      const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, m = c.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.5)) return c; } return getComputedStyle(document.body).backgroundColor; };
      const ratio = (el) => { if (!el) return 0; const a = lum(getComputedStyle(el).color), b = lum(bg(el)); return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2); };
      const st = document.getElementById('ivTStage');
      const late = ratio(document.getElementById('ivTStageVal'));
      st.classList.remove('is-late');
      const over = ratio(document.getElementById('ivTStageVal'));
      st.classList.add('is-late');
      return { late, over, said: ratio(document.querySelector('.iv-said[aria-pressed="true"]')), chip: ratio(document.querySelector('.iv-chip.is-current .iv-chip-t')), chipNo: ratio(document.querySelector('.iv-chip.is-current .iv-chip-no')) };
    });
    //   ボタンの地の色は transition（.15s）で変わるので、測るあいだは transition を止める（切り替えた直後の途中の色を測らない）
    await tp.evaluate(() => { const s = document.createElement('style'); s.id = 'e2eNoTr18'; s.textContent = '*{transition:none !important}'; document.head.appendChild(s); });
    const lt18 = await con18();
    await tp.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const dk18a = await con18();
    await tp.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await tp.emulateMedia({ colorScheme: 'dark' });
    const dk18b = await con18();
    await tp.emulateMedia({ colorScheme: 'light' });
    await tp.evaluate(() => { const s = document.getElementById('e2eNoTr18'); if (s) s.remove(); });
    expect([lt18, dk18a, dk18b].every(d => d.late >= 4.5 && d.over >= 4.5 && d.said >= 4.5 && d.chip >= 4.5 && d.chipNo >= 4.5),
      'E18 タイマーの超過（琥珀・赤）・「✓ 説明した」・今のチップの文字のコントラストはライト・ダーク（data-theme・prefers-color-scheme）とも 4.5:1 以上: ' + JSON.stringify({ lt18, dk18a, dk18b }));
    // ［次へ］で ② は 00:00 から・① のチップに ✓・使い方・設定を開いているあいだは数えない
    await tp.click('#ivNext');
    await tp.waitForTimeout(150);
    const t18e = await tm18();
    await tp.fill('#ivStage textarea[data-cl="notes.q_prev_job"]', '前職は飲食で1年。学業のため退職');
    await tp.click('.nav-item[data-view="help"]');
    await tp.clock.runFor(30000);
    await tp.click('.nav-item[data-view="settings"]');
    await tp.clock.runFor(30000);
    await tp.click('.nav-item[data-view="judge"]');
    await tp.waitForTimeout(150);
    const t18f = await tm18();
    await tp.clock.runFor(185000);
    const t18g = await tm18();
    await tp.click('#ivChips [data-sec="conditions"]');
    await tp.waitForTimeout(150);
    const t18h = await tm18();
    await tp.click('#ivChips [data-sec="reverse"]');
    await tp.waitForTimeout(150);
    const t18i = await tm18();
    await tp.fill('#ivStage textarea[data-cl="notes.q_concerns"]', '終電に間に合うか');
    await tp.click('[data-action="iv-said"][data-sec="reverse"][data-kind="notify"]');
    expect(t18e.stage === 'continuity' && t18e.val === '00:00' && t18e.goal === '/ 目安 3分' && t18e.total === '15:00' && JSON.stringify(t18e.chips) === JSON.stringify(['①✓', '*②', '③', '④', '⑤']) &&
      t18f.stage === 'continuity' && t18f.val === '00:00' && t18f.total === '15:00' && t18g.val === '03:05' && t18g.over && !t18g.late && t18g.total === '18:05' &&
      t18h.stage === 'conditions' && t18h.val === '15:00' && t18h.total === '18:05' && t18i.stage === 'reverse' && t18i.goal === '/ 最大 10分' && t18i.val === '00:00' &&
      JSON.stringify(t18i.chips) === JSON.stringify(['①✓', '②✓', '③', '④', '*⑤']),
      'E18 (2) ［次へ］で ② は 00:00（目安 3分）・① のチップに ✓・使い方／設定の 60 秒は数えない・185 秒で 03:05（超過）・合計 18:05・① のチップで戻ると 15:00 から・⑤ は「/ 最大 10分」: ' +
      JSON.stringify({ t18e, t18f, t18g, t18h, t18i }));
    await tp.click('#ivNext');
    await tp.waitForTimeout(300);
    const st18b = await tming18();
    const ev18t = await tp.evaluate(() => ({ step: window.RecruitApp.state.step, sub: document.getElementById('evTimeSub').textContent, ph: document.getElementById('evTimeMin').placeholder, val: document.getElementById('evTimeMin').value,
      st: Array.from(document.querySelectorAll('#evTime .ev-t-i')).map(e => e.textContent), sec: Array.from(document.querySelectorAll('.ev-sec .ev-sec-time')).map(e => e.textContent) }));
    expect(ev18t.step === 3 && st18b.endedAt === new Date(T0 + 372000 + 229000 + 299000 + 60000 + 185000).toISOString() && st18b.startedAt === new Date(T0).toISOString() &&
      JSON.stringify(st18b.perStage) === JSON.stringify({ conditions: 900, continuity: 185, reverse: 0 }) && st18b.stage === 'reverse' &&
      ev18t.sub === 'タイマー 18分05秒・目安 41分' && ev18t.ph === '18' && ev18t.val === '' && JSON.stringify(ev18t.st) === JSON.stringify(['① 15:00', '② 3:05', '③ —', '④ —', '⑤ 0:00']) &&
      JSON.stringify(ev18t.sec) === JSON.stringify(['15:00（目安 10分）', '3:05（目安 3分）', '—（目安 10分）', '—（目安 8分）', '0:00（最大 10分）']),
      'E18 (2) 面接を終えると endedAt・perStage（① 900・② 185・⑤ 0）。評価の面接時間は「タイマー 18分05秒・目安 41分」・入力欄の placeholder 18・段階ごとの時間（表示しなかった段階は —）: ' + JSON.stringify({ st18b, ev18t }));
    // 評価を付けて報告書へ: A4 の面接時間「18分（目安 41分）」→ 評価で 35 分と入れると「35分（目安 41分）」
    for (const b of await tp.$$('#stepContent .cl-rate-row [data-action="cl-set"][data-value="good"]')) await b.click();
    for (const id of PS18) await tp.click('[data-action="ps-set"][data-persona="' + id + '"][data-score="4"]');
    await tp.click('[data-action="cl-set"][data-cl="overall"][data-value="hire"]');
    await tp.fill('#clIvNotes', '笑顔があり、質問にも具体的に答えていた。');
    await tp.click('#toReportBtn');
    await tp.waitForTimeout(400);
    const kv18 = (pg) => pg.evaluate(() => { const d = Array.from(document.querySelectorAll('#appPaper dl.cl-sh-kv > div')).find(x => (x.querySelector('dt') || {}).textContent === '面接時間'); return d ? d.querySelector('dd').textContent : null; });
    const a18 = { time: await kv18(tp), q: await tp.$$eval('#appPaper .cl-nm-q[data-cl-note] .cl-nm-k', els => els.map(e => e.textContent)) };
    await tp.mouse.move(1, 1);
    await tp.evaluate((css) => { const s = document.createElement('style'); s.id = 'e2eNoSticky18'; s.textContent = css; document.head.appendChild(s); }, NOSTICKY18);
    await tp.locator('#appPaper').screenshot({ path: path.join(OUT, 'p13-report.png') });
    await tp.evaluate(() => { const s = document.getElementById('e2eNoSticky18'); if (s) s.remove(); });
    await tp.click('#backToChecklist');
    await tp.waitForTimeout(250);
    await tp.fill('#evTimeMin', '35');
    await tp.waitForTimeout(100);
    await tp.click('#toReportBtn');
    await tp.waitForTimeout(400);
    a18.manual = await kv18(tp);
    const [dl18] = await Promise.all([tp.waitForEvent('download'), tp.click('#btnSave')]);
    const f18s = path.join(OUT, 'p13-timer.html');
    await dl18.saveAs(f18s);
    const rt18 = parseRecord(fs.readFileSync(f18s, 'utf8')).checklist.timing;
    await tp.click('#btnNew');
    await tp.waitForTimeout(200);
    await tp.setInputFiles('#fileInput', f18s);
    await tp.waitForTimeout(500);
    const lt18b = { step: await tp.evaluate(() => window.RecruitApp.state.step), timing: await tming18(), time: await kv18(tp) };
    const canon18 = (o) => JSON.stringify(o && Object.keys(o).sort().map(k => [k, o[k]]));   // キーの順は問わない（読み込みの正規化で並びが変わる）
    expect(a18.time === '18分（目安 41分）' && JSON.stringify(a18.q) === JSON.stringify(['①短期／長期の希望', '①最初の2か月で条件を満たせない可能性', '②前のバイトの期間・退職理由', '⑤気になる点（逆質問）']) &&
      a18.manual === '35分（目安 41分）' && rt18.min === 35 && JSON.stringify(rt18.perStage) === JSON.stringify(st18b.perStage) && rt18.endedAt === st18b.endedAt &&
      lt18b.step === 4 && canon18(lt18b.timing) === canon18(rt18) && lt18b.time === '35分（目安 41分）',
      'E18 (2) 報告書の A4 に「面接時間 18分（目安 41分）」と質問ごとのメモ・評価で 35 分と入れると「35分（目安 41分）」・保存 → 読み込みで timing が同じ: ' + JSON.stringify({ a18, rt18, lt18b }));
    // 面接を表示したままの印刷（A4・記入シート）・保存は、今の段階の秒を記録に入れてから（ivCommit。タイマーは止めない。docs/SPEC-flow.md 1-2・F10）
    const tp2 = await ctx18.newPage();
    tp2.on('pageerror', e => e18.push('timer2: ' + e.message));
    tp2.on('dialog', d => d.accept());
    await tp2.clock.install({ time: NOW });
    await tp2.goto(FILE);
    await tp2.waitForTimeout(300);
    await tp2.clock.pauseAt(new Date(T0));
    await tp2.evaluate(() => { window.__p18 = 0; window.print = function () { window.__p18++; }; });
    await tp2.fill('[data-field="name"]', '途中 保存');
    await tp2.click('#saNext');
    await tp2.waitForTimeout(150);
    await tp2.clock.runFor(125000);
    await tp2.click('#btnPrint');
    const cm18a = await tp2.evaluate(() => { const d = Array.from(document.querySelectorAll('#clSheet dl.cl-sh-kv > div')).find(x => (x.querySelector('dt') || {}).textContent === '面接時間');
      return { time: d ? d.querySelector('dd').textContent : null, printed: window.__p18, ps: window.RecruitApp.state.checklist.timing.perStage.conditions }; });
    await tp2.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await tp2.clock.runFor(65000);
    const [dl18c] = await Promise.all([tp2.waitForEvent('download'), tp2.click('#btnSave')]);
    const f18c = path.join(OUT, 'p13-timer-mid.html');
    await dl18c.saveAs(f18c);
    const cm18b = { saved: parseRecord(fs.readFileSync(f18c, 'utf8')).checklist.timing.perStage.conditions };
    await tp2.clock.runFor(10000);
    await tp2.evaluate(() => { window.RecruitApp.preparePaperSheet(true); window.RecruitApp.preparePaperSheet(false); });
    Object.assign(cm18b, await tp2.evaluate(() => ({ ps: window.RecruitApp.state.checklist.timing.perStage.conditions, step: window.RecruitApp.state.step, val: document.getElementById('ivTStageVal').textContent })));
    await tp2.clock.runFor(5000);
    cm18b.val2 = await tp2.evaluate(() => document.getElementById('ivTStageVal').textContent);
    expect(cm18a.time === '2分（目安 41分）' && cm18a.printed === 1 && cm18a.ps === 125 && cm18b.saved === 190 && cm18b.ps === 200 && cm18b.step === 2 && cm18b.val === '03:20' && cm18b.val2 === '03:25',
      'E18 (2) 面接を表示したままの印刷（A4 に「2分」・perStage 125）・保存（記録の perStage 190）・記入シート（200）は今の段階の秒を入れてから。タイマーは止めない: ' + JSON.stringify({ cm18a, cm18b }));
    // タイマー導入前（2026-10-16 より前）に回答した記録: 評価の「✎ 面接の画面で直す」で面接を 40 秒開いても数えない（報告書の A4 に面接時間を出さない・timing に startedAt を入れない）
    await tp2.setInputFiles('#fileInput', path.join(FIX, 'legacy-pre-persona.html'));
    await tp2.waitForTimeout(500);
    await tp2.evaluate(() => window.RecruitApp.goStep(3));
    await tp2.waitForTimeout(200);
    await tp2.click('#cl-continuity .ev-fix[data-action="iv-go"]');
    await tp2.waitForTimeout(200);
    await tp2.clock.runFor(40000);
    const lg18 = await tp2.evaluate(() => ({ step: window.RecruitApp.state.step, val: document.getElementById('ivTStageVal').textContent, title: document.getElementById('ivTimer').title }));
    await tp2.click('#ivToEval');
    await tp2.waitForTimeout(200);
    await tp2.click('#toReportBtn');
    await tp2.waitForTimeout(400);
    Object.assign(lg18, await tp2.evaluate(() => { const d = Array.from(document.querySelectorAll('#appPaper dl.cl-sh-kv > div')).find(x => (x.querySelector('dt') || {}).textContent === '面接時間');
      const t = window.RecruitApp.state.checklist.timing || {};
      return { a4: d ? d.querySelector('dd').textContent : null, startedAt: t.startedAt || '', ps: JSON.stringify(t.perStage || {}), report: window.RecruitApp.state.step }; }));
    await tp2.close();
    expect(lg18.step === 2 && lg18.val === '—' && lg18.title.includes('数えません') && lg18.a4 === null && !lg18.startedAt && lg18.ps === '{}' && lg18.report === 4,
      'E18 (2) タイマー導入前に回答した記録は、面接の画面で 40 秒直しても面接時間を数えない（タイマーは「—」・A4 に面接時間なし・startedAt なし）: ' + JSON.stringify(lg18));
    await ctx18.close();

    // (3) 必須条件の不一致（docs/SPEC-flow.md 3-8）: 赤い案内・②〜④ は省略可・「⑤ 逆質問へ」・評価は不採用推奨で未入力の強調なし・一致に戻すと消える
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '不一致 次郎', posting: 'short' });
    await page.click('#saNext');
    await wait(300);
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="match"]');
    await page.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="mismatch"]');
    await wait(150);
    const mm18 = await page.evaluate(() => ({ shown: !document.getElementById('ivMustAlert').classList.contains('hidden'), text: document.getElementById('ivMustLead').textContent + document.getElementById('ivMustAlertText').textContent,
      chips: Array.from(document.querySelectorAll('#ivChips .iv-chip')).map(c => c.querySelector('.iv-chip-no').textContent + c.querySelector('.iv-chip-s').textContent),
      jump: !document.getElementById('ivMustJump').classList.contains('hidden') }));
    await view18(page, 'p13-interview-must-ng.png');
    await page.click('#ivMustJump');
    await wait(250);
    const mm18b = await page.evaluate(() => ({ sec: document.getElementById('ivStage').dataset.sec, shown: !document.getElementById('ivMustAlert').classList.contains('hidden'), jump: !document.getElementById('ivMustJump').classList.contains('hidden') }));
    await page.click('#ivNext');
    await wait(300);
    const mm18c = await page.evaluate(() => ({ step: window.RecruitApp.state.step, skip: Array.from(document.querySelectorAll('.ev-sec.cl-skippable')).map(e => e.dataset.sec), missing: document.querySelectorAll('.is-missing').length,
      res: document.getElementById('evResultTitle').textContent, why: document.getElementById('evResultWhy').textContent, miss: document.getElementById('evMissing').textContent,
      note: Array.from(document.querySelectorAll('.ev-sec.cl-skippable .cl-skip-note')).map(e => getComputedStyle(e).display !== 'none') }));
    expect(mm18.shown && mm18.text === '必須条件が不一致です。追加で確認し、解消しなければ ⑤ 逆質問へ（最大 10 分で終了）' && JSON.stringify(mm18.chips) === JSON.stringify(['①', '②省略可', '③省略可', '④省略可', '⑤']) && mm18.jump &&
      mm18b.sec === 'reverse' && mm18b.shown && !mm18b.jump && mm18c.step === 3 && JSON.stringify(mm18c.skip) === JSON.stringify(['continuity', 'job', 'teamwork']) && mm18c.missing === 0 &&
      mm18c.res === '不採用推奨' && mm18c.why === '必須条件が不一致のため' && mm18c.miss === '必須条件の不一致のため、ほかの入力は任意です' && mm18c.note.length === 3 && mm18c.note.every(Boolean),
      'E18 (3) 必須条件の不一致: 案内（⑤ 逆質問へ・最大 10 分）・②〜④ のチップに省略可・「⑤ 逆質問へ」で ⑤（案内は残りボタンは消える）・評価は ②〜④ が省略可・未入力の強調なし・不採用推奨: ' + JSON.stringify({ mm18, mm18b, mm18c }));
    await page.click('#cl-conditions .ev-fix[data-action="iv-go"]');
    await wait(250);
    const fix18 = await page.evaluate(() => ({ step: window.RecruitApp.state.step, sec: document.getElementById('ivStage').dataset.sec }));
    await page.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');
    await wait(150);
    const mm18d = await page.evaluate(() => ({ shown: !document.getElementById('ivMustAlert').classList.contains('hidden'), skip: document.querySelectorAll('#ivChips .iv-chip.is-skip').length, toEval: (document.getElementById('ivToEval') || {}).textContent || '' }));
    expect(fix18.step === 2 && fix18.sec === 'conditions' && !mm18d.shown && mm18d.skip === 0 && mm18d.toEval === '評価に戻る',
      'E18 (3) 評価の「✎ 面接の画面で直す」で ① へ・一致に戻すと案内と省略可が消える・面接を終えた後は「評価に戻る」も出る: ' + JSON.stringify({ fix18, mm18d }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);

    // (4) 説明した（docs/SPEC-flow.md 3-4）: 通常求人 2 項目・一部説明しなかった・mixed／短期求人 4 項目／未選択は 4 項目（短期のみ 2 つに印）で対象は 2 つ／⑤［伝えた］
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '説明 三郎', posting: 'regular' });
    await page.click('#saNext');
    await wait(300);
    const EX18 = ['ex_fare', 'ex_hours', 'ex_contract', 'ex_switch'];
    const li18 = () => page.$$eval('#ivStage .iv-say-list[data-kind="explain"] li', els => els.map(e => e.dataset.item + (e.querySelector('.tag') ? '*' : '')));
    const x18 = { regular: await li18() };
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    x18.on = { b: await saidOf18(page, 'conditions'), v: await vals18(page, EX18) };
    await page.click('[data-action="iv-said-items"][data-sec="conditions"][data-kind="explain"]');
    await wait(100);
    x18.items = await page.$$eval('#ivStage .iv-say-list.is-items input[type="checkbox"]', els => els.map(e => e.dataset.cl + ':' + e.checked));
    await page.click('#ivStage .iv-say-list input[data-cl="values.ex_hours"]');
    await wait(100);
    x18.mixed = { b: await saidOf18(page, 'conditions'), v: await vals18(page, EX18), li: await page.$$eval('#ivStage .iv-say-list li.is-on', els => els.map(e => e.dataset.item)) };
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    x18.all = { b: await saidOf18(page, 'conditions'), v: await vals18(page, EX18) };
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    x18.off = { b: await saidOf18(page, 'conditions'), keys: await st(() => Object.keys(window.RecruitApp.state.checklist.values).filter(k => k.indexOf('ex_') === 0)) };
    expect(JSON.stringify(x18.regular) === JSON.stringify(['ex_fare', 'ex_hours']) && x18.on.b === '[check] 説明した|true' && JSON.stringify(x18.on.v) === JSON.stringify([true, true, false, false]) &&
      JSON.stringify(x18.items) === JSON.stringify(['values.ex_fare:true', 'values.ex_hours:true']) && x18.mixed.b === '[check] 一部説明した（1/2）|mixed' && JSON.stringify(x18.mixed.v) === JSON.stringify([true, false, false, false]) &&
      JSON.stringify(x18.mixed.li) === JSON.stringify(['ex_fare']) && x18.all.b === '[check] 説明した|true' && JSON.stringify(x18.all.v) === JSON.stringify([true, true, false, false]) && x18.off.b === '[circle] 説明した|false' && x18.off.keys.length === 0,
      'E18 (4) 通常求人: ① の説明は 2 項目（短期のみなし）・［説明した］で 2 つ・「一部説明しなかった ▾」で 2 つのチェック・1 つ外すと「✓ 一部説明した（1/2）」（mixed）・押すと全部・もう一度で全部外れる（キーが消える）: ' + JSON.stringify(x18));
    await goTo(1);
    await setCl('header.posting', 'short');
    await goTo(2);
    x18.short = await li18();
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    x18.shortV = await vals18(page, EX18);
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    await goTo(1);
    await page.click('[data-action="cl-set"][data-cl="header.posting"][data-value="short"]');   // 押し直して未選択に
    await wait(100);
    await goTo(2);
    x18.none = { li: await li18(), note: await page.$$eval('#ivStage .k-say .iv-note', els => els.map(e => e.textContent)) };
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    x18.noneV = { v: await vals18(page, EX18), b: await saidOf18(page, 'conditions') };
    await ivGo('reverse');
    await page.click('[data-action="iv-said"][data-sec="reverse"][data-kind="notify"]');
    x18.nt = { v: await vals18(page, ['nt_hire', 'nt_reject']), b: await saidOf18(page, 'reverse', 'notify'), part: await lblOf('[data-action="iv-said-items"][data-sec="reverse"][data-kind="notify"]'),
      note: await page.$$eval('#ivStage .k-say .iv-note', els => els.map(e => e.textContent)) };
    expect(JSON.stringify(x18.short) === JSON.stringify(EX18) && x18.shortV.every(Boolean) && JSON.stringify(x18.none.li) === JSON.stringify(['ex_fare', 'ex_hours', 'ex_contract*', 'ex_switch*']) &&
      JSON.stringify(x18.none.note) === JSON.stringify(['※は短期求人に応募の場合のみご説明ください']) && JSON.stringify(x18.noneV.v) === JSON.stringify([true, true, false, false]) && x18.noneV.b === '[check] 説明した|true' &&
      x18.nt.v.every(Boolean) && x18.nt.b === '[check] 伝えた|true' && x18.nt.part === '一部伝えなかった [chevron-down]' &&
      JSON.stringify(x18.nt.note) === JSON.stringify(['逆質問（下の「聞くこと」）が終わったら、面接の最後に伝えて［伝えた］を押します', '面接の最後に伝えたらチェック']),
      'E18 (4) 短期求人は 4 項目とも対象・求人が未選択なら 4 項目（短期のみ 2 つに印と注記）で［説明した］は 2 つだけ・⑤［伝えた］で合否連絡 2 項目（「一部伝えなかった」・' +
      '注記は順番の 1 行〔逆質問のあと面接の最後に。2026-10-19〕と台本の注記）: ' + JSON.stringify(x18));

    // (5) 質問ごとのメモ（docs/SPEC-flow.md 3-5・5-2）: notes に入る・Tab で次の質問のメモ・メモが伸びる・評価のカード・A4 の行・保存 HTML の窓（全文）・XSS は文字のまま
    await ivGo('conditions');
    const XSS18 = '<img src=x onerror="window.__x18=1">短期希望';
    await page.fill('#ivStage textarea[data-cl="notes.q_term"]', XSS18);
    await page.focus('#ivStage textarea[data-cl="notes.q_term"]');
    await page.keyboard.press('Tab');
    const tab18 = await page.evaluate(() => (document.activeElement || {}).dataset ? document.activeElement.dataset.cl : '');
    const h18a = await page.evaluate(() => Math.round(document.querySelector('#ivStage textarea[data-cl="notes.q_family"]').getBoundingClientRect().height));
    await page.fill('#ivStage textarea[data-cl="notes.q_family"]', '反対はない\n親には伝えてある\n終電の時間も話した');
    const h18b = await page.evaluate(() => Math.round(document.querySelector('#ivStage textarea[data-cl="notes.q_family"]').getBoundingClientRect().height));
    await page.fill('#ivStage textarea[data-cl="notes.q_two_months"]', L(2500));
    const n18 = await st(() => { const n = window.RecruitApp.state.checklist.notes; return { term: n.q_term, family: n.q_family, two: (n.q_two_months || '').length }; });   // 2,500 字は用紙の空きまで広げても切れる
    await goTo(3);
    const qa18 = await page.evaluate(() => { const d = document.querySelector('#cl-conditions .ev-qa > div[data-item="q_term"]'); return d ? { k: d.querySelector('dt').textContent, v: d.querySelector('dd').textContent, img: document.querySelectorAll('#stepContent img').length } : null; });
    await rateAll('good');
    await judge();
    const nm18 = await page.evaluate(() => { const r = document.querySelector('#appPaper .cl-nm-q[data-cl-note="q_term"]'); return r ? { k: r.querySelector('.cl-nm-k').textContent, v: r.querySelector('.cl-nm-v').textContent, img: document.querySelectorAll('#appPaper img').length, x: window.__x18 === 1 } : null; });
    expect(tab18 === 'notes.q_two_months' && h18b > h18a + 15 && n18.term === XSS18 && n18.family.split('\n').length === 3 && n18.two === 2500 && !!qa18 && qa18.k === 'Q1短期／長期の希望' && qa18.v === XSS18 && qa18.img === 0 &&
      !!nm18 && nm18.k === '①短期／長期の希望' && nm18.v === XSS18 && nm18.img === 0 && !nm18.x,
      'E18 (5) 質問ごとのメモ: notes.q_term に入る・Tab で次の質問のメモ・3 行で高さが増える・評価の ① のカードに「Q1 短期／長期の希望」と答え・A4 に「①短期／長期の希望」の行・<img onerror> は文字のまま: ' +
      JSON.stringify({ tab18, h18a, h18b, n18, qa18, nm18 }));
    const sv18b = await saveRecord('p13-memo.html');
    const rp18b = await newReportPage(e18);
    await rp18b.goto('file://' + sv18b.file);
    await rp18b.waitForTimeout(300);
    const cut18 = await rp18b.evaluate(() => { const v = document.querySelector('#a4 .cl-nm-q[data-cl-note="q_two_months"] .cl-nm-v'); return v ? v.classList.contains('cl-cut') : null; });
    await rp18b.click('#a4 .cl-nm-q[data-cl-note="q_two_months"] .cl-nm-v');
    await rp18b.waitForTimeout(150);
    const pop18 = await rp18b.evaluate(() => { const p = document.getElementById('a4Pop'); return p ? { kind: p.dataset.kind, h: p.querySelector('.pop-h').textContent, len: p.querySelector('.pop-text').textContent.length } : null; });
    const x18b = await rp18b.evaluate(() => ({ img: document.querySelectorAll('#a4 img').length, x: window.__x18 === 1, v: (document.querySelector('#a4 .cl-nm-q[data-cl-note="q_term"] .cl-nm-v') || {}).textContent }));
    await rp18b.close();
    expect(cut18 === true && !!pop18 && pop18.kind === 'memo' && pop18.h === '①最初の2か月で条件を満たせない可能性' && pop18.len === 2500 && x18b.img === 0 && !x18b.x && x18b.v === XSS18,
      'E18 (5) 保存 HTML: 切れた質問のメモ（「…」）をクリックすると窓に全文（見出しは「①最初の2か月…」）・<img onerror> は文字のまま: ' + JSON.stringify({ cut18, pop18, x18b }));

    // (6) 評価の画面（docs/SPEC-flow.md 4-3〜4-6）: 未入力の数と強調 → 入れると減る → 全部で採用推奨 → 保留・必須条件の未確認のバッジ
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '評価 四郎' });
    await page.click('#saNext');
    await wait(300);
    await page.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="match"]');
    await ivGo('reverse');
    await page.click('#ivNext');
    await wait(300);
    const evs18 = () => page.evaluate(() => ({ res: document.getElementById('evResultTitle').textContent, why: document.getElementById('evResultWhy').textContent, miss: document.getElementById('evMissing').textContent,
      none: document.getElementById('evMissing').classList.contains('is-none'), rt: document.querySelectorAll('.cl-rate-row.is-missing').length, ps: document.querySelectorAll('#clPersona .cl-ps-row.is-missing').length,
      ov: document.querySelectorAll('.cl-overall-row.is-missing').length, must: document.querySelectorAll('.ev-must .cl-must-row.is-missing').length, score: document.getElementById('clNavScore').textContent,
      badge: Array.from(document.querySelectorAll('.is-missing .ev-miss')).filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent),
      state: Array.from(document.querySelectorAll('.cl-sec-state')).map(e => e.textContent) }));
    const ev18a = await evs18();
    await page.click('[data-action="cl-set"][data-cl="values.rt_concrete"][data-value="good"]');
    const ev18b = await evs18();
    for (const b of await page.$$('#stepContent .cl-rate-row [data-action="cl-set"][data-value="good"]:not(.active)')) await b.click();
    for (const id of PS18) await page.click('[data-action="ps-set"][data-persona="' + id + '"][data-score="4"]');
    await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hire"]');
    const ev18c = await evs18();
    await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hold"]');
    const ev18d = await evs18();
    await page.click('.ev-must [data-action="cl-set"][data-cl="values.must_busy"][data-value="match"]');   // 押し直して未確認に
    const ev18e = await evs18();
    expect(ev18a.res === '上長最終判断要' && ev18a.miss === '未入力：確認点 6・人物像 7・総合判断' && ev18a.rt === 6 && ev18a.ps === 7 && ev18a.ov === 1 && ev18a.must === 0 && ev18a.why === '総合判断が未入力のため' &&
      ev18b.miss === '未入力：確認点 5・人物像 7・総合判断' && ev18b.rt === 5 &&
      ev18c.res === '採用推奨' && ev18c.miss === '未入力はありません' && ev18c.none && ev18c.why === '総合判断「採用」のとおり' && ev18c.rt + ev18c.ps + ev18c.ov === 0 &&
      ev18c.score.includes('面接評価 14/14') && ev18c.score.includes('人物像 28/35') && JSON.stringify(ev18c.state) === JSON.stringify(['済', '済', '済', '済', '済']) &&
      ev18d.res === '上長最終判断要' && ev18d.why === '総合判断「保留」のため' &&
      ev18e.must === 1 && ev18e.miss === '未入力：必須条件 1' && ev18e.badge.includes('未確認') && JSON.stringify(ev18e.state) === JSON.stringify(['未確認 1', '済', '済', '済', '済']),
      'E18 (6) 評価: 入力前は上長最終判断要・「未入力：確認点 6・人物像 7・総合判断」と行の強調（6・7・1）→ 確認点 1 つで 5 → 全部で採用推奨（総合判断「採用」のとおり・未入力はありません・面接評価 14/14・人物像 28/35）→ 保留は「総合判断「保留」のため」・必須条件の未確認は「未確認」（段階の見出しも「済」でなく「未確認 1」）: ' +
      JSON.stringify({ ev18a, ev18b, ev18c, ev18d, ev18e }));

    // (7) はじめての方へ（docs/SPEC-flow.md F16）: 閉じたら再読込で出ない・fresh() で出る・localStorage が使えなくても閉じられる・「使い方を見る」
    await page.reload();
    await wait(300);
    const in18c = !!(await page.$('#introCard'));
    await fresh();
    const in18d = !!(await page.$('#introCard'));
    await page.click('#introCard [data-action="show-help"]');
    await wait(200);
    const help18 = await page.evaluate(() => !document.getElementById('view-help').classList.contains('hidden') && !!document.getElementById('helpInterview'));
    await toView('judge');
    const ctx18b = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
    const np = await ctx18b.newPage();
    const ne18 = [];
    np.on('pageerror', e => ne18.push(e.message));
    await np.addInitScript(() => { Storage.prototype.getItem = function () { throw new Error('denied'); }; Storage.prototype.setItem = function () { throw new Error('denied'); }; });
    await np.addInitScript(LBL_INIT);
    await np.clock.setFixedTime(NOW);
    await np.goto(FILE);
    await np.waitForTimeout(300);
    const ns18 = { intro: !!(await np.$('#introCard')) };
    await np.click('#introOk');
    await np.waitForTimeout(150);
    ns18.after = !!(await np.$('#introCard'));
    await np.fill('[data-field="name"]', '鍵なし');
    await np.click('#saNext');
    await np.waitForTimeout(250);
    await np.click('#ivChips [data-sec="conditions"]');
    await np.click('#ivPrev');
    await np.waitForTimeout(250);
    ns18.back = !!(await np.$('#introCard'));
    ns18.saNext = await lblOf('#saNext', np);
    await ctx18b.close();
    //   面接を開いただけ（回答なし）で準備へ戻ったので、主ボタンは「面接を始める →」のまま（docs/SPEC-flow.md 15 章）
    expect(!in18c && in18d && help18 && ns18.intro && !ns18.after && !ns18.back && ns18.saNext === '面接を始める [arrow-right]' && ne18.length === 0,
      'E18 (7) 「はじめての方へ」: 閉じたら再読込で出ない・localStorage を消すと出る・「使い方を見る」で使い方・localStorage が例外でも閉じられる（このページでは閉じたまま・エラーなし）: ' + JSON.stringify({ in18c, in18d, help18, ns18, ne18 }));

    // (8) 旧レコード（2026-10-16 より前の質問ブロックのメモ・timing なし）: 評価で開く・② に「（以前のメモ）」・面接で直せる・A4 は「ほか 2 問」の行・面接時間なし／回答なしの step 3 は面接で開く
    const fx18 = fs.readFileSync(path.join(FIX, 'legacy-pre-persona.html'), 'utf8');
    const old18 = parseRecord(fx18);
    const mini18 = (rec) => '<!doctype html><meta charset="utf-8"><title>old</title><script type="application/json" id="recruit-record">' + JSON.stringify(rec).replace(/</g, '\\u003c') + '</script>';
    const fo18 = path.join(OUT, 'p13-legacy-step3.html');
    fs.writeFileSync(fo18, mini18(Object.assign({}, old18, { step: 3 })));
    const fo18b = path.join(OUT, 'p13-legacy-step3-empty.html');
    fs.writeFileSync(fo18b, mini18(Object.assign({}, old18, { step: 3, judgment: null, interviewNotes: '', checklist: Object.assign({}, old18.checklist, { values: {}, notes: {}, overall: '' }) })));
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', fo18);
    await wait(500);
    //   ② のカードは「（以前のメモ）」を先に出し、質問ごとの「（メモなし）」は出さない（答えが無いと読み違えない。14 章）
    const ol18 = await page.evaluate(() => { const m = document.querySelector('#cl-continuity .ev-oldmemo[data-block="continuity_q"]');
      return { step: window.RecruitApp.state.step, k: m ? m.querySelector('.ev-memo-k').textContent : '', v: m ? m.querySelector('.ev-memo-v').textContent : '', sub: document.getElementById('evTimeSub').textContent,
        timing: window.RecruitApp.state.checklist.timing === undefined, first: !!m && m === document.querySelector('#cl-continuity .ev-qa > div'),
        none: Array.from(document.querySelectorAll('#cl-continuity .ev-qa dd')).filter(d => d.textContent === '（メモなし）').length }; });
    //   A4 の面接時間は応募者の 2 行目（dl.cl-sh-kv）に出る（面接時間が出れば見つかることも確かめる）
    const time18 = () => page.evaluate(() => { const d = Array.from(document.querySelectorAll('#appPaper dl.cl-sh-kv > div')).find(x => (x.querySelector('dt') || {}).textContent === '面接時間'); return d ? d.querySelector('dd').textContent : null; });
    await goTo(4);
    const ol18a4 = await page.evaluate(() => ({ k: Array.from(document.querySelectorAll('#appPaper .cl-nm-q[data-cl-block] .cl-nm-k')).map(e => e.textContent), q: document.querySelectorAll('#appPaper .cl-nm-q[data-cl-note]').length,
      kv: document.querySelectorAll('#appPaper dl.cl-sh-kv > div').length }));
    ol18a4.time = await time18();
    //   評価の「✎ 面接の画面で直す」で ② へ: 「評価に戻る」が出る（評価から来た）・タイマーは数えない（タイマー導入前の記録。直した時間を面接時間にしない）
    await goTo(3);
    await page.click('#cl-continuity .ev-fix[data-action="iv-go"]');
    await wait(250);
    const ol18iv = await page.evaluate(() => { const t = document.querySelector('#ivStage .iv-oldmemo textarea[data-cl="notes.continuity_q"]');
      return t ? { v: t.value, label: t.closest('.iv-oldmemo').querySelector('label').textContent, sec: document.getElementById('ivStage').dataset.sec,
        foot: Array.from(document.querySelectorAll('#ivFoot .btn:not(.hidden):not(.iv-more)')).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(b => window.__lbl(b)), val: document.getElementById('ivTStageVal').textContent, total: document.getElementById('ivTTotal').textContent,
        started: !!(window.RecruitApp.state.checklist.timing || {}).startedAt } : null; });
    await page.click('#ivToEval');
    await wait(250);
    ol18iv.back = await step();
    await goTo(1);
    ol18iv.prep = { btn: await lblOf('#saNext'), lead: await page.textContent('#stepLead span') };
    await goTo(4);
    ol18iv.time = await time18();
    await page.click('#btnNew');
    await wait(200);
    await page.setInputFiles('#fileInput', fo18b);
    await wait(500);
    const ol18e = await page.evaluate(() => ({ step: window.RecruitApp.state.step, stage: document.getElementById('ivStage') ? document.getElementById('ivStage').dataset.sec : '' }));
    expect(ol18.step === 3 && ol18.k === '（以前のメモ）' && ol18.v === '前職は飲食で2年。学業との両立のため退職。' && ol18.sub === 'タイマーの記録なし・目安 41分' && ol18.timing && ol18.first && ol18.none === 0 &&
      JSON.stringify(ol18a4.k) === JSON.stringify(['②前のバイトの期間・退職理由 ほか2問']) && ol18a4.q === 0 && ol18a4.kv > 0 && ol18a4.time === null &&
      !!ol18iv && ol18iv.v === '前職は飲食で2年。学業との両立のため退職。' && ol18iv.label === '（以前のメモ）' && ol18iv.sec === 'continuity' &&
      JSON.stringify(ol18iv.foot) === JSON.stringify(['[arrow-left] 前の段階', '評価に戻る', '次へ：③ 仕事内容の説明 [arrow-right]']) && ol18iv.val === '—' && ol18iv.total === '—' && !ol18iv.started && ol18iv.back === 3 &&
      ol18iv.prep.btn === '報告書に戻る [arrow-right]' && ol18iv.prep.lead === '応募者の名前と面接の情報を確かめて、「報告書に戻る」を押します。' && ol18iv.time === null &&
      ol18e.step === 2 && ol18e.stage === 'conditions',
      'E18 (8) 旧レコード（質問ブロックのメモ・timing なし）: 評価で開き ② に「（以前のメモ）」を先に（「（メモなし）」なし）・タイマーの記録なし・A4 は「②前のバイトの期間・退職理由 ほか2問」の行・面接時間なし（応募者の 2 行目）・' +
      '「✎ 面接の画面で直す」で ②（操作行は左から 前の段階・評価に戻る・次へ。タイマーは「—」で数えない）・準備は「報告書に戻る →」（判定のある記録。docs/SPEC-flow.md 15 章）・回答なしの step 3 は面接で開く: ' +
      JSON.stringify({ ol18, ol18a4, ol18iv, ol18e }));

    // (9) 記入シート（docs/SPEC-flow.md 5-3）: 準備の「🖨 記入シート」→ 面接 → 評価の並び・質問ごとに答えの線 13・既定の白紙は pp-a2・確認点 6 行は評価の部分・人物像 7 行・PDF 1 ページ（入力ありも）
    await page.click('#btnNew');
    await wait(200);
    await page.evaluate(() => { window.__pp18 = 0; window.print = function () { window.__pp18++; }; });
    await page.click('#saPaperBtn');
    await wait(150);
    const pc18 = await page.evaluate(() => window.__pp18);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await wait(100);
    const pp18 = async (name) => {
      await st(() => window.RecruitApp.preparePaperSheet(true));
      const m = await page.evaluate(() => { const sh = document.querySelector('#clSheet .pp-sheet');
        return { cls: sh.className, parts: Array.from(sh.querySelectorAll('.pp-part')).map(e => e.dataset.part), qa: sh.querySelectorAll('.pp-qa[data-pp-q]').length, ql: sh.querySelectorAll('.pp-qa[data-pp-q] .pp-ql').length,
          ask: sh.querySelectorAll('.pp-qa .pp-qk').length, rateSum: sh.querySelectorAll('.pp-sum .pp-rate tr[data-pp-item]').length, rateSec: sh.querySelectorAll('.pp-sec .pp-rate, .pp-sec tr[data-pp-item^="rt_"]').length,
          ps: sh.querySelectorAll('.pp-sum tr[data-pp-ps]').length, time: !!sh.querySelector('.pp-ov .pp-ov-time'), ex: Array.from(sh.querySelectorAll('.pp-ex .pp-k')).map(e => e.textContent) }; });
      await page.emulateMedia({ media: 'print' });
      const pdf = path.join(OUT, name + '.pdf');
      await page.pdf({ path: pdf, format: 'A4', preferCSSPageSize: true, printBackground: true });
      await page.emulateMedia({ media: null });
      await st(() => window.RecruitApp.preparePaperSheet(false));
      m.pages = pdfPagesOf(pdf);
      m.pdf = pdf;
      return m;
    };
    const pb18 = await pp18('p13-paper');
    if (hasPpm14) png14(pb18.pdf, path.join(OUT, 'p13-paper'));
    await fillScript({ name: '記入 五郎', age: 19, gender: '女性', category: '大学1年生', posting: 'short', taxi: '可・2,000円', interviewer: '笹川 晴央' });
    const pf18 = await pp18('p13-paper-filled');
    expect(pc18 === 1 && pb18.cls === 'pp-sheet pp-a2' && JSON.stringify(pb18.parts) === JSON.stringify(['iv', 'ev']) && pb18.qa === 13 && pb18.ql === 13 && pb18.ask === 13 && pb18.rateSum === 6 && pb18.rateSec === 0 &&
      pb18.ps === 7 && pb18.time && (pb18.pages === -1 || pb18.pages === 1) && pf18.qa === 13 && (pf18.pages === -1 || pf18.pages === 1) && pf18.cls.includes('pp-a2'),
      'E18 (9) 記入シート: 「面接」→「評価」の順・質問ごとの答えの線 13・既定の白紙は pp-a2・確認点 6 行は評価の部分（段階の中に無い）・人物像 7 行・面接時間の欄・PDF 1 ページ（準備に入力しても）: ' +
      JSON.stringify({ pc18, pb18: Object.assign({}, pb18, { pdf: undefined }), pf18: { cls: pf18.cls, pages: pf18.pages } }));

    // 画面の大きさ: 1280×800 で ①〜⑤ とも操作行が中身を隠さない（▼ 下にあと n 項目・最後まで届く）・390px で面接・評価の横スクロールなし（p13-interview-390.png）
    await page.click('[data-action="script-next"]');
    await wait(300);
    await page.setViewportSize({ width: 1280, height: 800 });
    await wait(200);
    const f18b = {};
    for (const sec of SECS18) { await ivGo(sec); f18b[sec] = await ivFit(page); }
    expect(SECS18.every(k => ivSeen(f18b[k])),
      'E18 1280×800: ①〜⑤ とも操作行が中身を隠さない（隠れている項目は「▼ 下にあと n 項目」・いちばん下までスクロールすると最後の要素は操作行の上）: ' + JSON.stringify(f18b));
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(250);
    await ivGo('conditions');
    //   主ボタンは操作行が 2 段に折り返しても右端（①・②〔ラベルが長い〕と ③〜⑤ で同じ右下）
    const nextR18 = () => page.evaluate(() => { const n = document.getElementById('ivNext').getBoundingClientRect(), f = document.getElementById('ivFoot').getBoundingClientRect();
      return { right: Math.round(innerWidth - n.right), bottom: Math.round(f.bottom - n.bottom) }; });
    const w18 = { iv: await overflowX(), cols: await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#ivStage > section.card')).map(c => c.getBoundingClientRect()); return r.length && r.every(x => Math.abs(x.left - r[0].left) <= 1) ? 1 : r.length; }),
      foot: await page.evaluate(() => { const f = document.getElementById('ivFoot').getBoundingClientRect(); return Math.round(innerHeight - f.bottom); }), next1: await nextR18() };
    await full18(page, 'p13-interview-390.png');
    //   ［不一致］で必須条件の案内が本文の上に出ても、押した行は同じ位置のまま（狭い画面は上の帯が固定でない）
    const mb18 = '[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]';
    await page.$eval(mb18, b => b.scrollIntoView({ block: 'center' }));
    await wait(100);
    const y18a = await page.$eval(mb18, b => Math.round(b.getBoundingClientRect().top));
    await page.click(mb18);
    await wait(150);
    w18.tap = { before: y18a, after: await page.$eval(mb18, b => Math.round(b.getBoundingClientRect().top)), alert: await visible('#ivMustAlert') };
    await page.click(mb18);
    await wait(150);
    w18.tap.cleared = await page.$eval(mb18, b => Math.round(b.getBoundingClientRect().top));
    await ivGo('job');
    w18.next3 = await nextR18();
    await goTo(3);
    w18.ev = await overflowX();
    //   評価・報告書へ移ると「この画面ですること」はトップバー（狭い画面では折り返して高い）の下に見える
    w18.evLead = await page.evaluate(() => Math.round(document.getElementById('stepLead').getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().bottom));
    await goTo(1);
    w18.prep = await overflowX();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(200);
    expect(w18.iv <= 1 && w18.cols === 1 && Math.abs(w18.foot) <= 1 && w18.ev <= 1 && w18.prep <= 1 && w18.next1.right === 16 && w18.next3.right === 16 && Math.abs(w18.next1.bottom - w18.next3.bottom) <= 1 &&
      w18.tap.alert && Math.abs(w18.tap.after - w18.tap.before) <= 2 && Math.abs(w18.tap.cleared - w18.tap.before) <= 2 && w18.evLead >= 0,
      'E18 390px: 面接（1 列・操作行は画面の下・主ボタンは ① でも ③ でも右下）・［不一致］で案内が出ても押した行は動かない・評価の「この画面ですること」はトップバーの下・評価・準備に横スクロールなし: ' + JSON.stringify(w18));

    // (10) ダブルクリック（docs/SPEC-flow.md 14 章）: 右下の主ボタン・前の段階をダブルクリックしても 1 段階・1 画面だけ（2 回目は次の画面の同じ位置のボタンに当たる）。Ctrl+Enter の押しっぱなしも 1 回。
    //   ① は必須条件が未確認なので、1 回目の［次へ］は進まずに必須条件の行へ（16-7）: ダブルクリックでも ① のまま（2 回目は捨てる）→ もう一度押すと ②。Ctrl+Enter の押しっぱなしは ② から
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '二度押し 六郎' });
    await page.click('#saNext');
    await wait(300);
    const dbl18 = async (sel) => { const b = await page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await page.mouse.dblclick(b.x, b.y); await wait(300); };
    const where18 = () => page.evaluate(() => ({ step: window.RecruitApp.state.step, sec: document.getElementById('ivStage') ? document.getElementById('ivStage').dataset.sec : '',
      chips: Array.from(document.querySelectorAll('#ivChips .iv-chip')).map(c => (c.classList.contains('is-current') ? '*' : '') + c.querySelector('.iv-chip-no').textContent + c.querySelector('.iv-chip-s').textContent) }));
    const d18 = {};
    await dbl18('#ivNext');
    d18.hold = await where18();
    await page.click('#ivNext');
    await wait(300);
    d18.next = await where18();
    await ivGo('job');
    await dbl18('#ivPrev');
    d18.prev = await where18();
    await ivGo('continuity');
    await dbl18('#ivPrev');
    d18.prev1 = await where18();
    await ivGo('continuity');
    await page.focus('#ivStage textarea[data-cl="notes.q_prev_job"]');
    await page.keyboard.down('Control');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await page.keyboard.up('Control');
    await wait(200);
    d18.repeat = await where18();
    await ivGo('reverse');
    await dbl18('#ivNext');
    d18.end = await where18();
    await dbl18('#evBack');
    d18.back = await where18();
    await ivGo('reverse');
    await page.click('#ivNext');
    await wait(300);
    await dbl18('#toReportBtn');
    d18.report = await where18();
    d18.must = await st(() => Object.keys(window.RecruitApp.state.checklist.values).filter(k => k.indexOf('must_') === 0).length);
    expect(d18.hold.step === 2 && d18.hold.sec === 'conditions' && d18.next.step === 2 && d18.next.sec === 'continuity' && d18.prev.sec === 'continuity' && d18.prev1.step === 2 && d18.prev1.sec === 'conditions' && d18.repeat.sec === 'job' &&
      d18.end.step === 3 && d18.back.step === 2 && d18.report.step === 4 && d18.must === 0 &&
      JSON.stringify(d18.next.chips) === JSON.stringify(['①未確認', '*②', '③', '④', '⑤']),
      'E18 (10) ダブルクリックしても 1 段階だけ: ①の［次へ］は必須条件が未確認なので ① のまま（2 回目は捨てる）・もう一度押すと ②（③ へ飛ばない。① は ✓ でなく「未確認」）・③の［← 前の段階］→ ②・' +
      '②の［← 前の段階］→ ①（準備へ飛ばない）・② で Ctrl+Enter の押しっぱなし → ③ だけ・⑤の［面接を終えて評価へ］→ 評価（報告書へ飛ばない）・評価の［← 面接に戻る］→ 面接・［報告書へ］→ 報告書: ' + JSON.stringify(d18));

    // (11) 段階のチップの ✓ は入力した段階だけ（チップで見ただけ・前へ／次へで通っただけの段階には付けない）。必須条件が未確認のまま離れた段階は「未確認」。評価の段階の時間も「—」（14 章）
    //   時計は止めておく（page.clock は BrowserContext ごと。E17 の install で動いている。見ただけの段階が 1 秒を超えて「0:01」にならないように）
    await page.clock.setFixedTime(NOW);
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '見るだけ 七子' });
    await page.click('#saNext');
    await wait(300);
    for (const sec of ['continuity', 'job', 'teamwork', 'reverse', 'conditions']) await ivGo(sec);
    const c18 = { preview: (await where18()).chips };
    await ivGo('continuity');
    await page.fill('#ivStage textarea[data-cl="notes.q_prev_job"]', '飲食で1年');
    await ivGo('job');
    c18.memo = (await where18()).chips;
    await ivGo('conditions');
    await page.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
    await page.click('#ivMustJump');
    await wait(200);
    for (let k = 0; k < 4; k++) { await page.click('#ivPrev'); await wait(150); }
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="match"]');
    await wait(100);
    c18.back = (await where18()).chips;
    await ivGo('continuity');
    c18.done = (await where18()).chips;
    await goTo(3);
    c18.ev = await page.evaluate(() => Array.from(document.querySelectorAll('#evTime .ev-t-i')).map(e => e.textContent));
    expect(JSON.stringify(c18.preview) === JSON.stringify(['*①', '②', '③', '④', '⑤']) && JSON.stringify(c18.memo) === JSON.stringify(['①未確認', '②✓', '*③', '④', '⑤']) &&
      JSON.stringify(c18.back) === JSON.stringify(['*①', '②✓', '③', '④', '⑤']) && JSON.stringify(c18.done) === JSON.stringify(['①✓', '*②', '③', '④', '⑤']) &&
      JSON.stringify(c18.ev) === JSON.stringify(['① 0:00', '② 0:00', '③ —', '④ —', '⑤ —']),
      'E18 (11) チップで ②〜⑤ を見ただけでは ✓ なし・② にメモ → ② ✓・① は必須条件が未確認のまま離れると「未確認」・不一致で ⑤ へ移って前へ ×4 で戻っても ③〜⑤ に ✓ なし・必須条件を確かめると ① ✓・評価の段階の時間は見ただけの段階は「—」: ' + JSON.stringify(c18));

    // (12) ノート PC の実際の表示の高さ（1366×768 の画面でブラウザの枠・タスクバーを除いた 1366×657、1280×800 の画面の 1280×680）: ①〜⑤ とも操作行が中身を隠さない
    //   （隠れている項目があれば「▼ 下にあと n 項目」で数を出し、いちばん下までスクロールすると最後の要素は操作行の上）。① は押すと全部見える（隠れたまま［次へ］の横に何も出ないことはない）。
    //   2026-10-18 から縦一列（docs/DESIGN.md 4-3）なので「②〜⑤ はスクロールなし」は無くなった。【質問】の記入欄の場所（確かめることの勤務条件の確認・Q1 のタグ）は E2・E19 (4)
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '台本 花子', posting: 'short' });
    await page.click('#saNext');
    await wait(300);
    const vp18 = {};
    for (const [w, h] of [[1366, 657], [1280, 680]]) {
      await page.setViewportSize({ width: w, height: h });
      await wait(200);
      const o = {};
      for (const sec of SECS18) { await ivGo(sec); o[sec] = await ivFit(page); }
      await ivGo('conditions');
      if (w === 1366) await view18(page, 'p13-interview-1366x657.png');
      o.clicks = 0;
      while ((await ivMoreNow()) && o.clicks < 6) { await page.click('#ivMore'); await wait(150); o.clicks++; }
      o.after = { more: await ivMoreNow(), hidden: await ivHiddenNow() };
      vp18[w + 'x' + h] = o;
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(200);
    expect(Object.keys(vp18).every(k => SECS18.every(sec => ivSeen(vp18[k][sec])) &&
      vp18[k].conditions.hidden > 0 && vp18[k].clicks >= 1 && !vp18[k].after.more && vp18[k].after.hidden === 0),
      'E18 (12) 1366×657・1280×680: ①〜⑤ とも隠れている項目の数「▼ 下にあと n 項目」が出て（隠れていなければ出ない）、最後の要素までスクロールで届く・① は押すと全部見える: ' + JSON.stringify(vp18));

    // (13) タイマーの目安（/ 目安 10分）は経過と並べて読めるように 15px 以上・太さ 400・経過と同じ本文の色（超過で琥珀・赤。docs/DESIGN.md 3-11）。
    //   必須条件の案内が出て上の帯が高くなっても、キーボードで戻ったときの［一致］［不一致］は上の帯に隠れない（1280×600。scroll-padding に上の帯の高さ）
    await page.setViewportSize({ width: 1280, height: 800 });
    await wait(200);
    const goal18 = await page.evaluate(() => { const g = getComputedStyle(document.getElementById('ivTStageGoal')), v = getComputedStyle(document.getElementById('ivTStageVal'));
      return { size: parseFloat(g.fontSize), color: g.color === v.color, weight: Number(g.fontWeight) }; });
    await page.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="mismatch"]');
    await wait(150);
    //   本文の見える高さがいちばん小さい、1280×720 の画面のブラウザの表示の高さ（600px 前後）で確かめる（案内で上の帯が高くなり、帯の下に隠れた行へ Shift+Tab で戻る）
    await page.setViewportSize({ width: 1280, height: 600 });
    await wait(200);
    //   必須条件の行が上の帯の下に隠れた状態（帯の下端より 12px 上に対象の上端）から、次のボタンにフォーカスして Shift+Tab で［不一致］へ戻る
    const kb18 = async (target, nextSel) => {
      await page.evaluate(() => window.scrollTo(0, 200));   // 上の帯をトップバーの下に固定させる
      await wait(80);
      await page.evaluate((t) => { const el = document.querySelector(t), band = document.getElementById('ivTop').getBoundingClientRect();
        window.scrollBy(0, Math.round(el.getBoundingClientRect().top - band.bottom + 12)); }, target);
      await wait(80);
      const hidden = await page.evaluate((t) => { const r = document.querySelector(t).getBoundingClientRect(); return Math.round(r.top) < Math.round(document.getElementById('ivTop').getBoundingClientRect().bottom); }, target);
      await page.$eval(nextSel, e => e.focus({ preventScroll: true }));
      await page.keyboard.press('Shift+Tab');
      await wait(80);
      return Object.assign({ hidden }, await page.evaluate((t) => { const a = document.activeElement, band = document.getElementById('ivTop').getBoundingClientRect();
        return { focus: a === document.querySelector(t), top: Math.round(a.getBoundingClientRect().top), band: Math.round(band.bottom) }; }, target));
    };
    const sp18 = {
      weekly: await kb18('[data-cl="values.must_weekly"][data-value="mismatch"]', '[data-cl="values.must_busy"][data-value="match"]'),
      busy: await kb18('[data-cl="values.must_busy"][data-value="mismatch"]', '[data-cl="values.weekend"][data-value="one"]')
    };
    await page.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="mismatch"]');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(200);
    //   （2026-10-18 から目安は 15px・400〔太さは 400 と 700 だけ。経過の 24px・700 と並べて読む。太字にしない〕。docs/DESIGN.md 3-11）
    expect(goal18.size >= 15 && goal18.weight === 400 && goal18.color && Object.keys(sp18).every(k => sp18[k].hidden && sp18[k].focus && sp18[k].top >= sp18[k].band),
      'E18 (13) 目安は 15px 以上・太さ 400・経過と同じ本文の色。必須条件の案内が出ていても Shift+Tab で戻った［不一致］は上の帯の下に見える: ' + JSON.stringify({ goal18, sp18 }));

    // (14) 使い方の上と下に「← （いまの手順）の画面に戻る」（サイドバーの手順は使い方では隠れる）。面接から開けば面接へ戻る
    await toView('help');
    const hb18 = await page.evaluate(() => Array.from(document.querySelectorAll('#view-help [data-action="back-to-judge"]')).map(b => window.__lbl(b) + '@' + b.closest('.help-back').dataset.where));
    await page.click('#view-help .help-back[data-where="bottom"] [data-action="back-to-judge"]');
    await wait(250);
    const hb18b = await page.evaluate(() => ({ view: window.RecruitApp.state.view, step: window.RecruitApp.state.step, iv: !!document.getElementById('ivStage') }));
    expect(JSON.stringify(hb18) === JSON.stringify(['[arrow-left] 面接の画面に戻る@top', '[arrow-left] 面接の画面に戻る@bottom']) && hb18b.view === 'judge' && hb18b.step === 2 && hb18b.iv,
      'E18 (14) 使い方の上と下に「← 面接の画面に戻る」・押すと面接の画面へ: ' + JSON.stringify({ hb18, hb18b }));

    // (15) 必須条件の不一致で不採用推奨に固定（評価は「ほかの入力は任意です」）なら、報告書の確認事項に「評価で入力する」を出さない
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
    await page.click('#ivMustJump');
    await wait(200);
    await page.click('#ivNext');
    await wait(300);
    const gm18 = { miss: await page.textContent('#evMissing') };
    await page.click('#toReportBtn');
    await wait(400);
    Object.assign(gm18, await page.evaluate(() => ({ res: window.RecruitApp.state.judgment.result, warn: !!document.getElementById('scriptWarnings'),
      btn: !!document.querySelector('#scriptWarnings [data-action="to-step"][data-step="3"]'), ov: window.RecruitApp.state.checklist.overall })));
    expect(gm18.miss === '必須条件の不一致のため、ほかの入力は任意です' && gm18.res === 'reject' && gm18.warn && !gm18.btn && gm18.ov === '',
      'E18 (15) 必須条件の不一致（不採用推奨に固定）: 総合判断が未入力でも報告書の確認事項に「評価で入力する」を出さない: ' + JSON.stringify(gm18));

    // (16) 台本（設定）から入る段階名・質問文・説明・記入欄名・流れの 1 行の <img onerror> は、面接・評価の画面で文字のまま（XSS）
    await page.evaluate(() => {
      const p = window.RecruitStorage.defaults();
      const s0 = p.checklist.sections[0];
      s0.title = '<img src=x onerror="window.__x18a=1">勤務条件';
      s0.blocks.find(b => b.type === 'question').items[0].label = '<img src=x onerror="window.__x18b=1">質問';
      s0.blocks.find(b => b.type === 'explain').items[0].label = '<img src=x onerror="window.__x18c=1">説明';
      s0.blocks.find(b => b.type === 'fields').items[0].label = '<img src=x onerror="window.__x18d=1">記入欄';
      s0.blocks.find(b => b.type === 'note').note = '<img src=x onerror="window.__x18e=1">流れ';
      localStorage.setItem('recruit.profile.v1', JSON.stringify(p));
    });
    await page.reload();
    await wait(300);
    await fillScript({ name: 'XSS 確認' });
    await page.click('#saNext');
    await wait(300);
    const xs18 = { iv: await page.evaluate(() => ({ img: document.querySelectorAll('#stepContent img').length, txt: ['__x18a', '__x18b', '__x18c', '__x18d', '__x18e'].filter(k => document.getElementById('stepContent').textContent.includes(k)).length })) };
    await goTo(3);
    //   評価の段階のカードは段階名と短い名前（質問は台本の short・記入欄は short が無いので文言の先頭 14 文字）
    xs18.ev = await page.evaluate(() => { const t = document.getElementById('stepContent').textContent;
      return { img: document.querySelectorAll('#stepContent img').length, title: t.includes('<img src=x onerror="window.__x18a=1">勤務条件'), field: t.includes('<img src=x one…') }; });
    xs18.ran = await page.evaluate(() => [window.__x18a, window.__x18b, window.__x18c, window.__x18d, window.__x18e].filter(Boolean).length);
    await fresh();
    expect(xs18.iv.img === 0 && xs18.iv.txt === 5 && xs18.ev.img === 0 && xs18.ev.title && xs18.ev.field && xs18.ran === 0,
      'E18 (16) 段階名・質問文・説明・記入欄名・流れの 1 行の <img onerror> は面接（5 つ）・評価（段階名・記入欄の短い名前）で文字のまま・実行されない: ' + JSON.stringify(xs18));
    expect(e18.length === 0, 'E18 ページエラー・console error なし（タイマーのページ・保存 HTML）: ' + (e18.join(' / ') || 'none'));
  }

  // =====================================================================
  // E19 初見の操作の補完（docs/SPEC-flow.md 15 章。2026-10-17。副支配人「初見でも分かりやすい感じで」）
  //   (1) 下見してから「面接を始める」（タイマーは 0 から・① から）／(2) 評価・報告書まで進んだ記録の準備の主ボタン・評価から面接に戻ったときのタイマー（再開・endedAt の上書き）・
  //   面接時間を確かめる（紙からの転記・スリープ）／(3) 4 つの画面の主ボタンが同じ右下・報告書の最後のカードが操作行に隠れない／(4) ① の縦一列の順・必須条件の案内が出たままの ⑤／
  //   (5) Tab の順（段階の見出しから 話す → 聞く → 確かめる → 主ボタン・操作行は主ボタンが先）／(6) 狭い画面のタイマーと必須条件の案内（固定）／(7) 報告書の 1 行・はじめての方への手順 4／(8) トップバーの「🖨 報告書を印刷」
  // =====================================================================
  console.log('\n== E19 初見の操作の補完 ==');
  {
    const e19 = [];
    const ctx19 = await browser.newContext({ viewport: { width: 1366, height: 657 }, locale: 'ja-JP', acceptDownloads: true });
    await ctx19.addInitScript(LBL_INIT);   // ラベル（見える文字とアイコン）の __lbl
    const mk19 = async (dialogs) => {
      const p = await ctx19.newPage();
      p.on('pageerror', e => e19.push(e.message));
      p.on('console', m => { if (m.type() === 'error') e19.push('console: ' + m.text()); });
      if (!dialogs) p.on('dialog', d => d.accept());
      return p;
    };
    const tv19 = (pg) => pg.evaluate(() => ({ step: window.RecruitApp.state.step, sec: document.getElementById('ivStage') ? document.getElementById('ivStage').dataset.sec : '',
      val: (document.getElementById('ivTStageVal') || {}).textContent || '', total: (document.getElementById('ivTTotal') || {}).textContent || '',
      timing: JSON.parse(JSON.stringify(window.RecruitApp.state.checklist.timing || null)) }));
    const prep19 = (pg) => pg.evaluate(() => ({ btn: window.__lbl(document.getElementById('saNext')), lead: document.querySelector('#stepLead span').textContent }));
    //   見えている範囲のスクリーンショット（toast を消す・マウスを外す。top: 先頭へスクロールしてから）
    const snap19 = async (pg, name, top) => {
      await pg.mouse.move(1, 1);
      await pg.evaluate((top) => { if (top) window.scrollTo(0, 0); const s = document.createElement('style'); s.id = 'e2eNoToast19'; s.textContent = '#toast{transition:none !important}'; document.head.appendChild(s);
        const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }, !!top);
      await pg.waitForTimeout(150);
      await pg.screenshot({ path: path.join(OUT, name) });
      await pg.evaluate(() => { const s = document.getElementById('e2eNoToast19'); if (s) s.remove(); });
    };

    // (1) 本番の前に ①〜⑤ と評価を下見して準備に戻る → 主ボタンは「面接を始める →」のまま。8 分後に押すと下見のタイマー・段階・終了時刻を捨てて ① の 00:00 から（docs/SPEC-flow.md 15 章）
    const p1 = await mk19();
    await p1.clock.install({ time: NOW });
    await p1.goto(FILE);
    await p1.waitForTimeout(300);
    const T19 = +NOW + 60000;
    await p1.clock.pauseAt(new Date(T19));
    await p1.click('#introOk');
    await p1.fill('[data-field="name"]', '下見 花子');
    await p1.click('#saNext');
    await p1.waitForTimeout(200);
    //   （① は必須条件が未確認なので 1 回目の［次へ］は必須条件の行へ・もう一度押すと ②。16-7）
    for (let k = 0; k < 4; k++) { await p1.clock.runFor(30000); await p1.click('#ivNext'); await p1.waitForTimeout(150); if (k === 0) { await p1.click('#ivNext'); await p1.waitForTimeout(150); } }
    await p1.clock.runFor(30000);
    await p1.click('#ivNext');   // 面接を終えて評価へ（下見）
    await p1.waitForTimeout(250);
    const pv19 = { step: (await tv19(p1)).step, ended: !!((await tv19(p1)).timing || {}).endedAt };
    await p1.click('#stepNav [data-step="1"]');
    await p1.waitForTimeout(200);
    Object.assign(pv19, await prep19(p1));
    await p1.clock.runFor(8 * 60000);
    await p1.click('#saNext');
    await p1.waitForTimeout(250);
    const st19 = Object.assign(await tv19(p1), await p1.evaluate(() => ({ chips: Array.from(document.querySelectorAll('#ivChips .iv-chip-s')).map(e => e.textContent).join(''),
      nav: Array.from(document.querySelectorAll('#stepNav li')).map(l => l.classList.contains('disabled')), toEval: !!document.getElementById('ivToEval') })));
    expect(pv19.step === 3 && pv19.ended && pv19.btn === '面接を始める [arrow-right]' && pv19.lead === '応募者の名前と面接の情報を入れて、「面接を始める」を押します。下見で動いたタイマーは 0 に戻り、① 勤務条件から始まります。' &&
      st19.step === 2 && st19.sec === 'conditions' && st19.val === '00:00' && st19.total === '00:00' && !!st19.timing && st19.timing.startedAt === new Date(T19 + 150000 + 480000).toISOString() &&
      JSON.stringify(st19.timing.perStage) === '{"conditions":0}' && !st19.timing.endedAt && st19.chips === '' && JSON.stringify(st19.nav) === JSON.stringify([false, false, true, true]) && !st19.toEval,
      'E19 (1) ①〜⑤ と評価を下見して準備へ戻ると主ボタンは「面接を始める →」（下見のタイマーは 0 に戻る旨の 1 行）。8 分後に押すと ① の 00:00 から（開始時刻は押した時刻・下見の秒と終了時刻は残らない・' +
      'チップに「未確認」なし・評価と報告書はまた進むまで押せない・「評価に戻る」なし）: ' + JSON.stringify({ pv19, st19 }));
    //   回答を入れてから準備へ戻ると「面接に戻る →」で同じ段階・同じタイマーから（数え直さない）
    await p1.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');
    await p1.clock.runFor(20000);
    await p1.click('#ivPrev');   // ① の「← 準備に戻る」
    await p1.waitForTimeout(150);
    const rs19 = await prep19(p1);
    await p1.clock.runFor(60000);   // 準備を見ているあいだは数えない
    await p1.click('#saNext');
    await p1.waitForTimeout(150);
    Object.assign(rs19, await tv19(p1));
    expect(rs19.btn === '面接に戻る [arrow-right]' && rs19.lead === '応募者の名前と面接の情報を確かめて、「面接に戻る」を押します。' && rs19.step === 2 && rs19.sec === 'conditions' && rs19.val === '00:20' &&
      rs19.timing.startedAt === st19.timing.startedAt,
      'E19 (1) 回答を入れてから準備へ戻ると「面接に戻る →」（この画面ですることも）・押すと同じ段階の 00:20 から（数え直さない）: ' + JSON.stringify(rs19));

    // (2) 評価まで進んだ記録の準備は「評価に戻る →」・報告書までなら「報告書に戻る →」（面接のタイマーを動かさない）。評価から面接に戻って直すと、その段階に秒を足して endedAt を上書き
    await p1.click('#ivChips [data-sec="reverse"]');
    await p1.waitForTimeout(150);
    await p1.clock.runFor(60000);
    await p1.click('#ivNext');   // 面接を終えて評価へ
    await p1.waitForTimeout(250);
    const ev19a = await tv19(p1);
    //   面接時間を確かめる（手入力なし・タイマーの合計 1分20秒 < 目安 41分 の 1/4）: 結果カードに 1 行・面接時間の欄は琥珀・常に見える 1 行
    const tw19 = () => p1.evaluate(() => { const w = document.getElementById('evTimeWarn'), h = document.getElementById('evTimeHint');
      return { shown: !!w && !w.classList.contains('hidden') && w.offsetParent !== null, text: window.__lbl(w), check: document.getElementById('evTime').classList.contains('is-check'),
        hint: h && h.offsetParent !== null ? h.textContent : '', ph: document.getElementById('evTimeMin').placeholder }; });
    const tw19a = await tw19();
    await snap19(p1, 'p13-evaluate-time-check.png', true);
    await p1.clock.runFor(120000);   // 評価を付けている時間（数えない）
    await p1.click('#evBack');   // ← 面接に戻る
    await p1.waitForTimeout(200);
    const bk19 = await tv19(p1);
    await p1.clock.runFor(30000);
    await p1.click('#ivNext');   // ⑤ の「面接を終えて評価へ →」
    await p1.waitForTimeout(250);
    const ev19b = await tv19(p1);
    await p1.clock.runFor(45000);
    await p1.click('#cl-conditions .ev-fix[data-action="iv-go"]');   // ✎ 面接の画面で直す（①）
    await p1.waitForTimeout(200);
    await p1.clock.runFor(10000);
    await p1.click('#ivToEval');   // 評価に戻る
    await p1.waitForTimeout(250);
    const ev19c = await tv19(p1);
    const E1 = T19 + 150000 + 480000 + 20000 + 60000 + 60000;   // 下見のあとの開始 → ① 20 秒 → 準備 60 秒 → ⑤ 60 秒で評価へ
    expect(ev19a.step === 3 && ev19a.timing.endedAt === new Date(E1).toISOString() && JSON.stringify(ev19a.timing.perStage) === JSON.stringify({ conditions: 20, reverse: 60 }) &&
      bk19.step === 2 && bk19.sec === 'reverse' && bk19.val === '01:00' && bk19.total === '01:20' &&
      ev19b.timing.perStage.reverse === 90 && ev19b.timing.endedAt === new Date(E1 + 120000 + 30000).toISOString() &&
      ev19c.timing.perStage.conditions === 30 && ev19c.timing.perStage.reverse === 90 && ev19c.timing.endedAt === new Date(E1 + 120000 + 30000 + 45000 + 10000).toISOString() && ev19c.timing.startedAt === st19.timing.startedAt,
      'E19 (2) 評価の「← 面接に戻る」で ⑤ の 01:00 から再開（評価の 2 分は数えない）・30 秒で評価へ戻ると ⑤ は 90 秒・endedAt はその時刻に上書き。「✎ 面接の画面で直す」→「評価に戻る」も ① に 10 秒足して上書き: ' +
      JSON.stringify({ ev19a: ev19a.timing, bk19: [bk19.sec, bk19.val, bk19.total], ev19b: ev19b.timing, ev19c: ev19c.timing }));
    await p1.click('#stepNav [data-step="1"]');
    await p1.waitForTimeout(200);
    const pe19 = await prep19(p1);
    await p1.clock.runFor(30000);
    await p1.click('#saNext');
    await p1.waitForTimeout(250);
    const pe19b = await tv19(p1);
    await p1.click('#toReportBtn');
    await p1.waitForTimeout(400);
    const rp19 = await p1.evaluate(() => ({ warn: (document.getElementById('rpTimeWarn') || {}).textContent || '', fix: !!document.getElementById('rpTimeFix') }));
    await p1.click('#stepNav [data-step="1"]');
    await p1.waitForTimeout(200);
    const pr19 = await prep19(p1);
    await p1.click('#saNext');
    await p1.waitForTimeout(400);
    pr19.step = (await tv19(p1)).step;
    expect(pe19.btn === '評価に戻る [arrow-right]' && pe19.lead === '応募者の名前と面接の情報を確かめて、「評価に戻る」を押します。' && pe19b.step === 3 &&
      JSON.stringify(pe19b.timing) === JSON.stringify(ev19c.timing) && pr19.btn === '報告書に戻る [arrow-right]' && pr19.lead === '応募者の名前と面接の情報を確かめて、「報告書に戻る」を押します。' && pr19.step === 4,
      'E19 (2) 評価まで進んだ記録の準備は「評価に戻る →」（押すと評価へ。面接のタイマー・endedAt は変わらない）・報告書まで進めば「報告書に戻る →」（押すと報告書へ）: ' + JSON.stringify({ pe19, pe19b: pe19b.step, pr19 }));
    //   報告書の確認事項にも「面接時間を確かめてください」→「評価で面接時間を直す」で評価の面接時間の欄へ → 25 分と入れると消え、A4 は「25分」
    await p1.click('#rpTimeFix');
    await p1.waitForTimeout(400);
    const fx19 = await p1.evaluate(() => ({ step: window.RecruitApp.state.step, focus: (document.activeElement || {}).id }));
    await p1.fill('#evTimeMin', '25');
    await p1.waitForTimeout(100);
    const tw19b = await tw19();
    await p1.click('#toReportBtn');
    await p1.waitForTimeout(400);
    const rp19b = await p1.evaluate(() => { const d = Array.from(document.querySelectorAll('#appPaper dl.cl-sh-kv > div')).find(x => (x.querySelector('dt') || {}).textContent === '面接時間');
      return { warn: !!document.getElementById('rpTimeWarn'), fix: !!document.getElementById('rpTimeFix'), a4: d ? d.querySelector('dd').textContent : null }; });
    expect(tw19a.shown && tw19a.text === '[alert] 面接時間を確かめてください（タイマー 1分20秒・目安 41分） [arrow-right] 面接時間の欄へ' && tw19a.check && tw19a.ph === '1' &&
      tw19a.hint === '紙（記入シート）から転記した面接・中断した面接は、実際の分を入れてください（空欄ならタイマーの分を使います）' &&
      rp19.warn.indexOf('面接時間を確かめてください（タイマー 2分00秒・目安 41分）') === 0 && rp19.fix && fx19.step === 3 && fx19.focus === 'evTimeMin' &&
      !tw19b.shown && !tw19b.check && !!tw19b.hint && !rp19b.warn && !rp19b.fix && rp19b.a4 === '25分（目安 41分）',
      'E19 (2) 面接時間（紙から転記した 1〜2 分）: 評価の結果カードに「面接時間を確かめてください」・欄は琥珀・欄の下に常に「紙から転記した面接・中断した面接は、実際の分を…」・報告書の確認事項にも出て ' +
      '「評価で面接時間を直す」で評価の欄へ。25 分と入れると消え、A4 は「25分（目安 41分）」: ' + JSON.stringify({ tw19a, rp19, fx19, tw19b, rp19b }));
    //   PC のスリープなどで ⑤ に 85 分足された（手入力なし・目安の 2 倍を超える）・必須条件の不一致で打ち切ったときの目安は省略できる段階を除く（① 10 分＋⑤ 10 分）
    await p1.click('#backToChecklist');
    await p1.waitForTimeout(250);
    await p1.fill('#evTimeMin', '');
    await p1.click('#evBack');   // 面接は最後に見た ① から
    await p1.waitForTimeout(200);
    await p1.click('#ivChips [data-sec="reverse"]');
    await p1.waitForTimeout(150);
    await p1.clock.runFor(85 * 60000);
    await p1.click('#ivNext');
    await p1.waitForTimeout(250);
    const tw19c = await tw19();
    await p1.click('#cl-conditions .ev-must [data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
    await p1.waitForTimeout(150);
    const tw19d = await tw19();
    expect(tw19c.shown && tw19c.text === '[alert] 面接時間を確かめてください（タイマー 87分00秒・目安 41分） [arrow-right] 面接時間の欄へ' && tw19c.check &&
      tw19d.shown && tw19d.text === '[alert] 面接時間を確かめてください（タイマー 87分00秒・目安 20分） [arrow-right] 面接時間の欄へ',
      'E19 (2) ⑤ に 85 分足された（スリープなど。目安の 2 倍を超える）ときも確かめる・必須条件の不一致で打ち切ったときの目安は ① と ⑤ の 20 分: ' + JSON.stringify({ tw19c, tw19d }));
    await p1.close();

    // (3) 主ボタンは 4 つの画面とも画面の右下の同じ位置（準備・報告書も固定。docs/SPEC-flow.md 15 章）。報告書の最後（最終合否・右サマリー・著作権の行）は操作行に隠れない・押印のボタンは操作行の下にならない
    const pos19 = {};
    for (const [w, h] of [[1440, 900], [1366, 657], [1280, 800]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.click('#btnNew');
      await wait(200);
      const rr = (sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return Math.round(innerWidth - r.right) + ',' + Math.round(innerHeight - r.bottom); });
      const o = { prep: await rr('#saNext') };
      if (w === 1366) await snap19(page, 'p13-prep-1366x657.png', true);
      await fillScript({ name: '位置 確認' });
      await page.click('#saNext');
      await wait(250);
      o.iv = await rr('#ivNext');
      await ivGo('reverse');
      await page.click('#ivNext');
      await wait(250);
      o.ev = await rr('#toReportBtn');
      await page.click('#toReportBtn');
      await wait(400);
      o.rp = await rr('#reportSaveBtn');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await wait(100);
      o.end = await page.evaluate(() => { const ft = document.getElementById('rpFoot').getBoundingClientRect().top;
        return ['#decisionCard', '#summaryPanel', '#footerText'].filter(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.height > 0 && r.bottom > ft + 1; }); });
      o.rpEnd = await rr('#reportSaveBtn');
      //   押印のボタンを画面の下端に出しても（scrollIntoView block:end）、操作行の上に見えてそのまま押せる（scroll-padding-bottom）
      o.hit = await page.$eval('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]', b => { b.scrollIntoView({ block: 'end' }); const r = b.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);   // ボタンの中のアイコン・文字の要素でもよい（2026-10-18 から SVG のアイコン＋文字）
        return !!at && b.contains(at) && r.bottom <= document.getElementById('rpFoot').getBoundingClientRect().top + 1; });
      pos19[w + 'x' + h] = o;
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    //   （2026-10-18 から操作行のボタンは本文の枠〔1120px〕の右端。1440px は右から 36px・1366／1280px はガターの 32px。下は操作行の内側 12px。docs/DESIGN.md 3-10）
    expect(Object.keys(pos19).every(k => { const o = pos19[k]; return o.prep === (k.indexOf('1440') === 0 ? '36,12' : '32,12') && o.iv === o.prep && o.ev === o.prep && o.rp === o.prep && o.rpEnd === o.prep && o.end.length === 0 && o.hit; }),
      'E19 (3) 主ボタン（面接を始める・次へ・報告書へ・報告書を保存）は 4 つの画面とも同じ位置（1440×900 は右から 36px・1366×657・1280×800 は 32px、下から 12px）・報告書の最後まで操作行に隠れない・押印のボタンは操作行の上: ' + JSON.stringify(pos19));

    // (4) 縦一列の段階（2026-10-18。docs/DESIGN.md 4-3）: ① は 話すこと → 聞くこと（質問は台本の順）→ 確かめること（【質問】の記入欄は「勤務条件の確認」に・1 問目と同じ欄に Q1）。
    //   どの段階も操作行は中身を隠さない（隠れている項目の数「▼ 下にあと n 項目」・いちばん下までスクロールすると最後の要素は操作行の上）。必須条件の案内が出たままの ⑤ も合否連絡・逆質問まで届く
    const cw19 = {};
    for (const [w, h] of [[1440, 789], [1280, 800]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.click('#btnNew');
      await wait(200);
      await fillScript({ name: '列 確認', posting: 'short' });
      await page.click('#saNext');
      await wait(300);
      cw19[w + 'x' + h] = Object.assign(await ivFit(page), await page.evaluate(() => ({
        order: Array.from(document.querySelectorAll('#ivStage .iv-q')).map(e => e.dataset.item).join(','),
        term: (() => { const r = document.querySelector('#ivStage .k-check .cl-field[data-item="term"]'); return r ? (r.querySelector('.q-no') || {}).textContent || '' : null; })() })));
    }
    const r5 = {};
    for (const [w, h] of [[1366, 657], [1366, 625], [1280, 680]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.click('#btnNew');
      await wait(200);
      await fillScript({ name: '案内 確認', posting: 'regular' });
      await page.click('#saNext');
      await wait(250);
      await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
      await page.click('#ivMustJump');
      await wait(250);
      if (h === 625) await snap19(page, 'p13-interview-5-must-ng-1366x625.png', true);
      r5[w + 'x' + h] = await ivFit(page);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    expect(Object.keys(cw19).every(k => { const o = cw19[k]; return o.sec === 'conditions' && o.kinds === 'say+ask+check' && o.order === 'q_term,q_two_months,q_family' && o.term === 'Q1' && ivSeen(o) && o.hidden > 0; }) &&
      Object.keys(r5).every(k => { const o = r5[k]; return o.sec === 'reverse' && o.alert && o.kinds === 'say+ask' && ivSeen(o); }),
      'E19 (4) ① は縦一列（話すこと → 聞くこと〔台本の順〕→ 確かめること〔短期／長期の希望に Q1〕）で、隠れている項目は「▼ 下にあと n 項目」・最後まで操作行の上に出せる。必須条件の案内が出たままの ⑤（話すこと〔合否連絡〕→ 聞くこと）も ' +
      '1366×657・1366×625・1280×680 で最後まで届く（隠れたままにならない）: ' + JSON.stringify({ cw19, r5 }));

    // (5) Tab の順（見た目の順。docs/DESIGN.md 6 章）: 段階の見出し（［次へ］・チップで移ったときのフォーカス先）から 話すこと（「一部説明しなかった」→［説明した］）→ 聞くこと（質問のメモ）→
    //   確かめること（行の操作）→ 主ボタン。見出し帯のトグルにもキーボードで届き、Space で押せる（⑤ の［伝えた］）。
    //   操作行: 最後の入力欄の次は主ボタン（DOM は主ボタンが先・見た目の左右は CSS の order）。② の最後のメモ → Tab → Enter で ③（前に戻らない）
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: 'タブ 確認', posting: 'short' });
    const act19 = () => page.evaluate(() => { const a = document.activeElement; return a ? a.id || (a.dataset && (a.dataset.cl || a.dataset.action)) || a.tagName : ''; });
    const tab19 = {};
    await page.focus('[data-field="reviewerNotes"]');
    await page.keyboard.press('Tab');
    tab19.prep = await act19();
    await page.click('#saNext');
    await wait(250);
    //   見出しから Tab で主ボタンまで（同じ要素の中を進む Tab〔日付の欄の年・月・日〕は 1 つにまとめる）。kind はその要素のカードの種類（操作行は foot）
    const head19 = {};
    for (const sec of ['conditions', 'continuity', 'reverse']) {
      await ivGo(sec);
      await page.focus('#ivStageH');
      const seq = [];
      for (let k = 0; k < 60; k++) {
        await page.keyboard.press('Tab');
        const a = await page.evaluate(() => { const a = document.activeElement, c = a && a.closest('#ivStage > section.card');
          return { id: a ? a.id || (a.dataset && (a.dataset.cl ? a.dataset.cl + (a.dataset.value ? ':' + a.dataset.value : '') : a.dataset.action)) || a.tagName : '', kind: c ? c.dataset.kind : a && a.closest('#ivFoot') ? 'foot' : 'other' }; });
        if (!seq.length || seq[seq.length - 1].id !== a.id) seq.push(a);
        if (a.id === 'ivNext' || a.kind === 'other') break;
      }
      head19[sec] = { ids: seq.map(x => x.id), kinds: seq.map(x => x.kind).filter((x, i, arr) => i === 0 || arr[i - 1] !== x).join('>'),
        check: await page.$$eval('#ivStage .k-check button, #ivStage .k-check input, #ivStage .k-check select, #ivStage .k-check textarea', els => els.filter(e => e.offsetParent !== null).length) };
    }
    //   ⑤: 見出しから Tab 2 回で［伝えた］・Space で押す（合否連絡 2 項目が済み）・もう一度 Space で外す
    await ivGo('reverse');
    await page.focus('#ivStageH');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const sp19 = { focus: await act19() };
    if (sp19.focus === 'iv-said') {   // （届いていなければ押さない。主ボタンで Space を押すと評価へ進むため。確かめで落とす）
      await page.keyboard.press('Space');
      await wait(120);
      sp19.on = await page.$eval('[data-action="iv-said"][data-sec="reverse"][data-kind="notify"]', b => b.getAttribute('aria-pressed'));
      sp19.vals = await st(() => ['nt_hire', 'nt_reject'].map(k => window.RecruitApp.state.checklist.values[k] === true));
      await page.keyboard.press('Space');
      await wait(120);
      sp19.off = await page.$eval('[data-action="iv-said"][data-sec="reverse"][data-kind="notify"]', b => b.getAttribute('aria-pressed'));
    }
    const H19 = ['iv-said-items', 'iv-said'];
    expect(JSON.stringify(head19.conditions.ids) === JSON.stringify(H19.concat(['notes.q_term', 'notes.q_two_months', 'notes.q_family', 'values.must_weekly:match', 'values.must_weekly:mismatch',
      'values.must_busy:match', 'values.must_busy:mismatch', 'values.weekend:one', 'values.weekend:both', 'ivF-busy_ng', 'values.term:short', 'values.term:long', 'ivF-start_date', 'ivF-first_end', 'ivF-open_late', 'ivNext'])) &&
      head19.conditions.kinds === 'say>ask>check>foot' && head19.conditions.check === head19.conditions.ids.length - 6 &&
      JSON.stringify(head19.continuity.ids) === JSON.stringify(H19.concat(['notes.q_prev_job', 'notes.q_cant_3days', 'notes.q_sudden_absence', 'ivNext'])) && head19.continuity.kinds === 'say>ask>foot' &&
      JSON.stringify(head19.reverse.ids) === JSON.stringify(H19.concat(['notes.q_concerns', 'ivNext'])) && head19.reverse.kinds === 'say>ask>foot' &&
      sp19.focus === 'iv-said' && sp19.on === 'true' && !!sp19.vals && sp19.vals.every(Boolean) && sp19.off === 'false',
      'E19 (5) 段階の見出しから Tab で 話すこと（「一部説明しなかった」→［説明した］）→ 聞くこと（質問のメモ・台本の順）→ 確かめること（① は行の操作をすべて）→ 主ボタン（①②⑤）・' +
      '⑤ の［伝えた］は Tab で届き Space で押せる（もう一度で外す）: ' + JSON.stringify({ head19, sp19 }));
    //   段階の最後の入力欄（① は確かめることの最後の記入欄・②⑤ は最後の質問のメモ。どの段階も 話す → 聞く → 確かめる の順なので最後の欄が［次へ］のすぐ前）
    for (const sec of ['conditions', 'continuity', 'reverse']) {
      await ivGo(sec);
      const last = await page.evaluate(() => { const els = Array.from(document.querySelectorAll('#ivStage textarea, #ivStage input')).filter(e => e.offsetParent !== null); const e = els[els.length - 1];
        return e.id ? '#' + e.id : '#ivStage [data-cl="' + e.getAttribute('data-cl') + '"]'; });
      await page.focus(last);
      const seq = [last];
      for (let k = 0; k < 2; k++) { await page.keyboard.press('Tab'); seq.push(await act19()); }
      tab19[sec] = seq;
    }
    await ivGo('continuity');
    await page.focus('#ivStage textarea[data-cl="notes.q_sudden_absence"]');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await wait(250);
    tab19.enter = await st(() => document.getElementById('ivStage').dataset.sec);
    tab19.vis = await page.evaluate(() => Array.from(document.querySelectorAll('#ivFoot .btn:not(.iv-more)')).filter(b => b.offsetParent).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(b => b.id));
    await ivGo('reverse');
    await page.click('#ivNext');
    await wait(250);
    await page.focus('#evTimeMin');   // 評価の最後の入力欄は面接時間（2026-10-18 から面接所見の下。docs/DESIGN.md 4-4）
    await page.keyboard.press('Tab');
    tab19.ev = await act19();
    await page.click('#toReportBtn');
    await wait(400);
    tab19.rp = await page.evaluate(() => ({ dom: Array.from(document.querySelectorAll('#rpFoot .btn')).map(b => b.id), vis: Array.from(document.querySelectorAll('#rpFoot .btn')).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(b => b.id) }));
    expect(tab19.prep === 'saNext' && JSON.stringify(tab19.conditions) === JSON.stringify(['#ivF-open_late', 'ivNext', 'ivPrev']) && JSON.stringify(tab19.continuity) === JSON.stringify(['#ivStage [data-cl="notes.q_sudden_absence"]', 'ivNext', 'ivPrev']) &&
      JSON.stringify(tab19.reverse) === JSON.stringify(['#ivStage [data-cl="notes.q_concerns"]', 'ivNext', 'ivPrev']) && tab19.enter === 'job' && JSON.stringify(tab19.vis) === JSON.stringify(['ivPrev', 'ivNext']) && tab19.ev === 'toReportBtn' &&
      JSON.stringify(tab19.rp.dom) === JSON.stringify(['reportSaveBtn', 'reportPrintBtn', 'backToChecklist']) && JSON.stringify(tab19.rp.vis) === JSON.stringify(['backToChecklist', 'reportPrintBtn', 'reportSaveBtn']),
      'E19 (5) 最後の入力欄から Tab で主ボタン（準備のメモ → 面接を始める・① の最後の記入欄（OPEN／25時）・②⑤ の最後のメモ → 次へ／面接を終えて評価へ → 戻る・面接時間 → 報告書へ）・② で Tab → Enter は ③ へ（戻らない）・' +
      '見た目は左に戻る・右端に主ボタンのまま: ' + JSON.stringify(tab19));

    // (6) 狭い画面（タブレット縦・スマホ）: 段階のチップは流し、タイマーと必須条件の案内は見えている上端に固定（840px 以下はトップバーが流れるので、スクロールすると画面の上端。
    //   質問のメモまで進んでも見える）。スマホの幅は短い文
    const nw19 = {};
    for (const [w, h] of [[390, 844], [768, 1024]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.click('#btnNew');
      await wait(200);
      await fillScript({ name: '狭い 確認', posting: 'short' });
      await page.click('#saNext');
      await wait(300);
      await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
      await wait(150);
      await page.click('#ivStage textarea[data-cl="notes.q_family"]');
      await wait(200);
      if (w === 768) await snap19(page, 'p13-interview-768-scrolled.png');
      nw19[w] = await page.evaluate(() => { const tb = document.querySelector('.topbar').getBoundingClientRect().bottom;
        //   top: 見えている上端（トップバーが見えていればその下端・流れて見えなければ画面の上端。840px 以下のトップバーは固定しない。docs/DESIGN.md 3-9）からの位置
        const box = (s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return { pos: getComputedStyle(e).position, top: Math.round(r.top - Math.max(0, tb)), seen: r.top >= Math.max(0, tb) - 1 && r.bottom <= innerHeight && r.height > 0 }; };
        const t = box('#ivTimer'), a = box('#ivMustAlert'), c = box('#ivChips'), m = box('#ivStage textarea[data-cl="notes.q_family"]');
        const lead = document.getElementById('ivMustLead'), full = document.getElementById('ivMustAlertText'), short = document.getElementById('ivMustShort');
        return { sy: Math.round(scrollY), timer: t, alert: a, chips: c.pos + (c.seen ? ':seen' : ':gone'), memo: m.seen, full: full.offsetParent !== null ? lead.textContent + full.textContent : '', short: short.offsetParent !== null ? short.textContent : '',
          jump: !document.getElementById('ivMustJump').classList.contains('hidden'), ov: document.documentElement.scrollWidth - innerWidth }; });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    expect([390, 768].every(w => { const o = nw19[w]; return o.sy > 300 && o.timer.pos === 'sticky' && o.timer.seen && o.timer.top === 0 && o.alert.pos === 'sticky' && o.alert.seen && o.chips === 'static:gone' && o.memo && o.jump && o.ov <= 1; }) &&
      nw19[390].short === '必須条件が不一致' && nw19[390].full === '' && nw19[768].full === '必須条件が不一致です。追加で確認し、解消しなければ ⑤ 逆質問へ（最大 10 分で終了）' && nw19[768].short === '',
      'E19 (6) 390×844・768×1024: 最後の質問のメモまでスクロールしても、タイマー（見えている上端。トップバーは流れる）と必須条件の案内（「⑤ 逆質問へ」つき）は固定で見える・チップは流れる・横スクロールなし。390px の案内は短い文: ' + JSON.stringify(nw19));

    // (7) 報告書の「この画面ですること」・はじめての方への手順 4: 面接者が押すのは「面接対応者」だけ（最終確認・最終合否は副支配人）
    await fresh();
    const in19 = await page.evaluate(() => Array.from(document.querySelectorAll('#introCard .intro-steps li')).map(li => li.textContent));
    await page.click('#introOk');
    await fillScript({ name: '押印 確認' });
    await goTo(4);
    const ld19 = await page.textContent('#stepLead span');
    expect(in19[3] === '報告書「面接対応者」だけ押印して保存' && ld19 === '「面接対応者」に押印して、報告書を保存（HTML）します（最終確認・最終合否は副支配人が押します）。',
      'E19 (7) はじめての方への手順 4「「面接対応者」だけ押印して保存」・報告書の 1 行「「面接対応者」に押印して…（最終確認・最終合否は副支配人が押します）」: ' + JSON.stringify({ in19: in19[3], ld19 }));

    // (8) トップバーは「🖨 報告書を印刷」（記入シートとの違いを title に）。回答が無いうちに押すと確かめる（［キャンセル］なら印刷せず記入シートのボタンへ）。回答があれば確かめずに印刷
    const p8 = await mk19(true);
    await p8.clock.setFixedTime(NOW);
    await p8.goto(FILE);
    await p8.waitForTimeout(300);
    await p8.evaluate(() => { window.__p19 = 0; window.print = function () { window.__p19++; }; });
    const dl19 = [];
    p8.on('dialog', d => { dl19.push(d.type() + ':' + d.message()); if (dl19.length === 1) d.dismiss(); else d.accept(); });
    const tb19 = await p8.evaluate(() => ({ text: window.__lbl(document.getElementById('btnPrint')), title: document.getElementById('btnPrint').title }));
    if (await p8.$('#introOk')) await p8.click('#introOk');   // 同じ BrowserContext の (1) で閉じていれば出ない
    await p8.fill('[data-field="name"]', '印刷 確認');
    await p8.click('#btnPrint');
    await p8.waitForTimeout(150);
    const pc19a = await p8.evaluate(() => ({ printed: window.__p19, focus: (document.activeElement || {}).id, host: document.getElementById('clSheet').innerHTML.length }));
    await p8.click('#btnPrint');
    await p8.waitForTimeout(150);
    const pc19b = await p8.evaluate(() => ({ printed: window.__p19, report: !!document.querySelector('#clSheet .cl-sheet') }));
    await p8.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await p8.click('#saNext');
    await p8.waitForTimeout(200);
    await p8.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');
    await p8.click('#btnPrint');
    await p8.waitForTimeout(150);
    const pc19c = await p8.evaluate(() => window.__p19);
    await p8.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await p8.close();
    expect(tb19.text === '[printer] 報告書を印刷' && tb19.title.includes('記入シート（手書き用）') && dl19.length === 2 && dl19[0].indexOf('confirm:まだ面接の回答がありません。報告書（A4 の面接チェックリスト報告）を印刷しますか？') === 0 &&
      dl19[0].includes('「記入シート（手書き用）」') && pc19a.printed === 0 && pc19a.focus === 'saPaperBtn' && pc19a.host === 0 && pc19b.printed === 1 && pc19b.report && pc19c === 2,
      'E19 (8) トップバーは「🖨 報告書を印刷」（title に記入シートの案内）・回答が無いうちは確かめる（［キャンセル］で印刷せず「🖨 記入シート」にフォーカス・［OK］で報告書を印刷）・回答があれば確かめずに印刷: ' +
      JSON.stringify({ tb19, dl19: dl19.map(x => x.slice(0, 40)), pc19a, pc19b, pc19c }));
    await ctx19.close();
    expect(e19.length === 0, 'E19 ページエラー・console error なし: ' + (e19.join(' / ') || 'none'));
  }


  // =====================================================================
  // E20 画面の統一（2026-10-18。docs/DESIGN.md v2・docs/SPEC-flow.md 16 章。副支配人「境目がわかりにくい・ヒアリングや確認ボタンの位置にばらつき・もう少し全体的に統一感を」）
  //   (1) どの段階も 話す → 聞く → 確かめる の順・見出しの帯は同じ色（色は意味のある所だけ）(2) ［説明した］［伝えた］は 3 つの状態とも確かめることの行の操作列と同じ左端・右端
  //   (3) 面接と評価の［一致｜不一致］は同じ x (4) 面接の上の帯は 1 段（必須条件の案内は 2 行目の 1 行）(5) 「該当の行へ」で不一致の行の［不一致］が帯の下・操作行の上に見える
  //   (6) 設定の［設定を保存］も 4 画面の主ボタンと同じ座標
  // =====================================================================
  console.log('\n== E20 画面の統一 ==');
  {
    const SECS20 = ['conditions', 'continuity', 'job', 'teamwork', 'reverse'];
    await page.setViewportSize({ width: 1440, height: 900 });
    await fresh();
    if (await page.$('#introOk')) await page.click('#introOk');
    await fillScript({ name: '統一 確認', posting: 'short' });
    await page.click('#saNext');
    await wait(300);
    // (1) カードの順と帯の色。順は 話すこと（説明 → 合否連絡。種類ごとに 1 枚）→ 聞くこと → 確かめること（無い種類は飛ばす。docs/DESIGN.md 4-3・SPEC-flow 16-3「段階×種類に 1 枚」）。
    //   カードの種類は data-kind（話すことは data-say の explain／notify も）で、前のカードより後ろの順位であること（2026-10-19。それまでの正規表現は 説明 → 合否連絡 の 2 枚の話すことを落とした）
    const RANK20 = { 'say:explain': 0, 'say:notify': 1, ask: 2, check: 3 };
    const inOrder20 = (ks) => ks.length > 0 && ks.every((k, j) => k in RANK20 && (j === 0 || RANK20[ks[j - 1]] < RANK20[k]));
    const ord20of = () => page.evaluate(() => { const cards = Array.from(document.querySelectorAll('#ivStage > section.card'));
      return { ks: cards.map(c => c.dataset.kind + (c.dataset.say ? ':' + c.dataset.say : '')), band: Array.from(new Set(cards.map(c => getComputedStyle(c.querySelector(':scope > .card-band')).backgroundColor))).join('|'),
        icon: cards.every(c => !!c.querySelector(':scope > .card-band > svg.ico')) }; });
    const ord20 = {};
    for (const sec of SECS20) { await ivGo(sec); ord20[sec] = await ord20of(); }
    const bands20 = new Set(SECS20.map(k => ord20[k].band));
    expect(SECS20.every(k => inOrder20(ord20[k].ks) && ord20[k].icon && ord20[k].band.indexOf('|') < 0) && bands20.size === 1 &&
      ord20.conditions.ks.join('+') === 'say:explain+ask+check' && ord20.reverse.ks.join('+') === 'say:notify+ask',
      'E20 (1) どの段階もカードは 話す → 聞く → 確かめる の順（無い種類は飛ばす）・帯はアイコンつきで同じ色: ' + JSON.stringify(ord20));
    // (2) ［説明した］［伝えた］と操作列（オフ・オン・一部）
    await ivGo('conditions');
    const col20 = await page.evaluate(() => { const cs = Array.from(document.querySelectorAll('#ivStage .k-check .row-ctl')).map(c => c.getBoundingClientRect());
      return cs.length ? { l: Math.round(cs[0].left), r: Math.round(cs[0].right), same: cs.every(c => Math.abs(c.left - cs[0].left) <= 1 && Math.abs(c.right - cs[0].right) <= 1) } : null; });
    const tg20 = (sec, kind) => page.$eval(`[data-action="iv-said"][data-sec="${sec}"][data-kind="${kind}"]`, b => { const r = b.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), p: b.getAttribute('aria-pressed') }; });
    const t20 = { off: await tg20('conditions', 'explain') };
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    await wait(100);
    t20.on = await tg20('conditions', 'explain');
    await page.click('[data-action="iv-said-items"][data-sec="conditions"][data-kind="explain"]');
    await wait(100);
    await page.click('#ivStage .iv-say-list input[data-cl="values.ex_hours"]');
    await wait(100);
    t20.mixed = await tg20('conditions', 'explain');
    await ivGo('reverse');
    t20.notify = await tg20('reverse', 'notify');
    expect(!!col20 && col20.same && Math.abs(col20.r - col20.l - 280) <= 1 && ['off', 'on', 'mixed', 'notify'].every(k => Math.abs(t20[k].l - col20.l) <= 1 && Math.abs(t20[k].r - col20.r) <= 1) &&
      t20.off.p === 'false' && t20.on.p === 'true' && t20.mixed.p === 'mixed',
      'E20 (2) ［説明した］［伝えた］は 3 つの状態（オフ・オン・一部）とも確かめることの行の操作列（幅 280px）と同じ左端・右端: ' + JSON.stringify({ col20, t20 }));
    // (3) 面接と評価の［一致｜不一致］は同じ x
    await goTo(3);
    const ev20 = await page.evaluate(() => { const c = document.querySelector('#cl-conditions .ev-must .row-ctl'); if (!c) return null; const r = c.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; });
    expect(!!ev20 && Math.abs(ev20.l - col20.l) <= 1 && Math.abs(ev20.r - col20.r) <= 1,
      'E20 (3) 評価の必須条件の［一致｜不一致］は面接の確かめることと同じ位置（左端・右端）: ' + JSON.stringify({ ev20, col20 }));
    // (4) 上の帯は 1 段（ノート PC の幅。必須条件の案内が出たままの ① と ⑤。docs/DESIGN.md 3-11「タイマーはチップの下に回らない」・7 章 8）:
    //   チップは 1 行（中心の高さのばらつき 2px 以下）・タイマーはチップの並びの右（左端がチップの並びの右端より右）で、中心の高さがチップと同じ・
    //   帯の 1 行目（.iv-bar-main）の高さはチップとタイマーの高いほう＋上下の内側 16px（2 段になれば高くなる。2026-10-19。それまでのタイマーの条件は 1 行目の矩形に入っているかだけで常に真だった）
    await goTo(2);
    await ivGo('conditions');
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
    await wait(150);
    const band20 = {};
    for (const [w, h] of [[1366, 768], [1280, 720]]) {
      await page.setViewportSize({ width: w, height: h });
      await wait(200);
      for (const sec of ['conditions', 'reverse']) {
        await ivGo(sec);
        await wait(100);
        band20[w + ':' + sec] = await page.evaluate(() => {
          const chips = Array.from(document.querySelectorAll('#ivChips .iv-chip')).map(c => c.getBoundingClientRect()), mids = chips.map(r => r.top + r.height / 2);
          const nav = document.getElementById('ivChips').getBoundingClientRect(), tm = document.getElementById('ivTimer').getBoundingClientRect(), main = document.querySelector('#ivBar .iv-bar-main').getBoundingClientRect(), al = document.getElementById('ivMustAlert').getBoundingClientRect();
          return { chips: Math.round(Math.max(...mids) - Math.min(...mids)), timer: tm.left >= nav.right - 1 && Math.abs((tm.top + tm.bottom) / 2 - mids[0]) <= 2,
            mainH: Math.round(main.height), rowH: Math.round(Math.max(tm.height, chips[0].height)), alert: Math.round(al.height), inBar: !!document.querySelector('#ivBar #ivMustAlert') };
        });
      }
    }
    expect(Object.keys(band20).every(k => { const o = band20[k]; return o.chips <= 2 && o.timer && o.mainH <= o.rowH + 16 + 2 && o.alert > 0 && o.alert <= 48 && o.inBar; }),
      'E20 (4) 1366×768・1280×720 でも面接の上の帯は 1 段（チップは 1 行・タイマーはチップの右で中心の高さが同じ・1 行目の高さは〔チップかタイマーの高さ〕＋16px・必須条件の案内は帯の 2 行目の 1 行〔48px 以下〕）。' +
      '不一致のままの ① と ⑤: ' + JSON.stringify(band20));
    // (5) 「該当の行へ」（⑤ から押すと ① へ移り、不一致の行の［不一致］が上の帯の下・操作行の上に見える）
    await page.setViewportSize({ width: 1366, height: 768 });
    await wait(150);
    await ivGo('reverse');
    await page.click('#ivMustAlert [data-action="iv-must-row"]');
    await wait(300);
    const go20 = await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), band = document.getElementById('ivTop').getBoundingClientRect(), ft = document.getElementById('ivFoot').getBoundingClientRect();
      return { sec: document.getElementById('ivStage').dataset.sec, act: a && a.dataset ? a.dataset.cl + ':' + a.dataset.value : '', ng: !!a.closest('.row.is-ng'), below: r.top >= band.bottom - 1, above: r.bottom <= ft.top + 1 }; });
    expect(go20.sec === 'conditions' && go20.act === 'values.must_busy:mismatch' && go20.ng && go20.below && go20.above,
      'E20 (5) 案内の「該当の行へ」（⑤ から）で ① へ移り、不一致の行（淡い赤）の［不一致］にフォーカス（上の帯の下・操作行の上に見える）: ' + JSON.stringify(go20));
    // (6) 設定の［設定を保存］も主ボタンと同じ座標（ページの先頭・末尾とも）
    await page.setViewportSize({ width: 1440, height: 900 });
    await wait(150);
    const at20 = (sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return Math.round(innerWidth - r.right) + ',' + Math.round(innerHeight - r.bottom); });
    const pos20 = { iv: await at20('#ivNext') };
    await toView('settings');
    pos20.settings = await at20('#view-settings .save-bar [data-action="save"]');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await wait(150);
    pos20.settingsEnd = await at20('#view-settings .save-bar [data-action="save"]');
    pos20.nav = await page.evaluate(() => Array.from(document.querySelectorAll('.settings-nav a.active')).map(a => a.getAttribute('href')).join(','));
    await toView('judge');
    expect(pos20.iv === '36,12' && pos20.settings === pos20.iv && pos20.settingsEnd === pos20.iv && pos20.nav === '#s-io',
      'E20 (6) 設定の［設定を保存］も 4 画面の主ボタンと同じ位置（1440×900 で右から 36px・下から 12px。ページの末尾でも）・末尾までスクロールすると節のメニューは「書き出し／読み込み」: ' + JSON.stringify(pos20));
    // (1) の続き: 台本で ② に合否連絡のブロックを足しても（設定の台本の編集で足せる。検証のエラー・警告なし）、② は 話すこと（説明）→ 話すこと（合否連絡）→ 聞くこと の順（#32）
    await page.evaluate(() => { const p = window.RecruitStorage.defaults(), sec = p.checklist.sections.find(x => x.id === 'continuity');
      sec.blocks.push({ id: 'cont_notify', type: 'notify', title: '合否連絡', note: '', memo: false, memoLabel: '', items: [{ id: 'nt_cont', label: '結果は 1 週間以内に連絡します', short: '連絡' }] });
      localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); });
    await page.reload();
    await wait(300);
    if (await page.$('#introOk')) await page.click('#introOk');
    await fillScript({ name: '合否 確認' });
    await page.click('#saNext');
    await wait(300);
    await ivGo('continuity');
    const nt20 = Object.assign(await ord20of(), await st(() => { const v = window.RecruitStorage.validateProfile(window.RecruitApp.state.profile);
      return { errors: v.errors.length, warnings: v.warnings.length, title: Array.from(document.querySelectorAll('#ivStage > section.card .card-title small')).map(e => e.textContent).join('|') }; }));
    await fresh();
    expect(nt20.ks.join('+') === 'say:explain+say:notify+ask' && inOrder20(nt20.ks) && nt20.icon && nt20.errors === 0 && nt20.warnings === 0,
      'E20 (1) 台本で ② に合否連絡を足すと ② は 話すこと（説明）→ 話すこと（合否連絡）→ 聞くこと（話すことは種類ごとに 1 枚・同じ順の決まりで確かめる）: ' + JSON.stringify(nt20));
  }

  // =====================================================================
  // E21 レビュー修正（docs/SPEC-flow.md 16-7。2026-10-19）: 入力の直後の 1 回目のクリック（説明した・伝えた・下にあと n 項目・面接時間の欄へ・未入力の数）・
  //     必須条件を確かめないまま［次へ］・⑤ の合否連絡の順番・評価の戻り先と未入力の数・390px の操作行・841〜960px の帯のチップ・481〜840px の「該当の行へ」
  // =====================================================================
  console.log('\n== E21 レビュー修正 ==');
  {
    await page.clock.setFixedTime(NOW);
    await page.setViewportSize({ width: 1366, height: 768 });
    await fresh();
    if (await page.$('#introOk')) await page.click('#introOk');
    await fillScript({ name: '修正 確認', posting: 'regular' });
    await page.click('#saNext');
    await wait(300);
    const on21 = (re) => st(re => { const v = window.RecruitApp.state.checklist.values || {}; return Object.keys(v).filter(k => new RegExp(re).test(k) && v[k] === true).sort().join(','); }, re);
    // (1) メモ欄・文字の欄に書いた直後（フォーカスを残したまま）に押しても 1 回目で記録・移動する（#11・#18。押した瞬間にメモ欄の change で表示を直しても、ボタンの中身〔押した要素〕を作り直さない）
    const k21 = {};
    await page.evaluate(() => { window.__mut21 = 0; const b = document.querySelector('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
      new MutationObserver(ms => { window.__mut21 += ms.length; }).observe(b, { childList: true, subtree: true, characterData: true }); });
    await page.click('#ivStage textarea[data-cl="notes.q_two_months"]');
    await page.keyboard.type('問題なし');
    await page.evaluate(() => document.activeElement.blur());   // change（説明したの状態は変わらない）
    await wait(100);
    k21.mut = await st(() => window.__mut21);
    //   ① の Q1 のメモ →［説明した］（通常求人なので 2 項目）
    await page.click('#ivStage textarea[data-cl="notes.q_term"]');
    await page.keyboard.type('長期希望');
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    await wait(150);
    k21.said = await on21('^ex_');
    //   確かめることの文字の欄（出勤不可な繁忙）→［説明した］（もう一度押すと外れる）
    await page.click('#ivStage input[data-cl="values.busy_ng"]');
    await page.keyboard.type('12/24');
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    await wait(150);
    k21.unsaid = await on21('^ex_');
    //   1366×657 で ① のメモ →「▼ 下にあと n 項目」（押すとスクロールする）
    await page.setViewportSize({ width: 1366, height: 657 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(200);
    await page.click('#ivStage textarea[data-cl="notes.q_term"]');
    await page.keyboard.type('。卒業まで');
    k21.more = { text: await ivMoreNow(), y0: await st(() => Math.round(scrollY)) };
    //   （page.click は固定の操作行の中のボタンでもページをスクロールすることがあるので、中央をマウスで押す。動いた量は押した処理の分だけ）
    const mb21 = await page.$eval('#ivMore', b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(mb21.x, mb21.y);
    await wait(200);
    k21.more.y1 = await st(() => Math.round(scrollY));
    await page.setViewportSize({ width: 1366, height: 768 });
    //   ⑤ の逆質問のメモ →［伝えた］（合否連絡 2 項目）
    await ivGo('reverse');
    await page.click('#ivStage textarea[data-cl="notes.q_concerns"]');
    await page.keyboard.type('特になし');
    await page.click('[data-action="iv-said"][data-sec="reverse"][data-kind="notify"]');
    await wait(150);
    k21.notify = await on21('^nt_');
    //   評価（タイマー 1分30秒 ＜ 目安 41分 の 1/4 で「面接時間を確かめてください」）: 確認点のメモ →「面接時間の欄へ」・別のメモ →「未入力：確認点 n」
    await page.clock.setFixedTime(new Date(+NOW + 90000));
    await page.click('#ivNext');   // 面接を終えて評価へ
    await wait(300);
    await page.click('#stepContent input.cl-note[data-cl="notes.rt_concrete"]');
    await page.keyboard.type('具体的');
    await page.click('#evTimeWarn');
    await wait(200);
    k21.time = await st(() => document.activeElement && document.activeElement.id);
    await page.click('#stepContent input.cl-note[data-cl="notes.rt_hourensou"]');
    await page.keyboard.type('報連相あり');
    const mr21 = await page.$('#evMissing [data-miss="rate"]');   // （無ければ押さずに確かめで落とす）
    if (mr21) await mr21.click();
    await wait(200);
    k21.miss = await st(() => { const a = document.activeElement; return a && a.dataset ? a.dataset.cl + ':' + a.dataset.value : ''; });
    await page.clock.setFixedTime(NOW);
    expect(k21.mut === 0 && k21.said === 'ex_fare,ex_hours' && k21.unsaid === '' && /^\[chevron-down\] 下にあと \d+ 項目$/.test(k21.more.text) && k21.more.y1 > k21.more.y0 && k21.notify === 'nt_hire,nt_reject' &&
      k21.time === 'evTimeMin' && k21.miss === 'values.rt_concrete:good',
      'E21 (1) メモ欄・文字の欄に書いた直後（フォーカスを残したまま）でも 1 回目のクリックが届く: ① Q1 のメモ →［説明した］で 2 項目・文字の欄 → もう一度で外れる・「▼ 下にあと n 項目」でスクロール・' +
      '⑤ 逆質問のメモ →［伝えた］で合否連絡 2 つ・評価の確認点のメモ →「面接時間の欄へ」で面接時間の欄・「未入力：確認点 n」で最初の未入力の行の ○。押した瞬間の change ではボタンの中身を作り直さない: ' + JSON.stringify(k21));

    // (2) 必須条件を確かめないまま［次へ］（#15）: 1 回目は進まずに ① の確かめることの最初の未確認の行へ（［一致］にフォーカス・帯の下と操作行の上に見える・未確認の行は琥珀・短い案内）。
    //   1 つ確かめると残りだけ琥珀・もう一度押すと ② へ（案内は消え、① のチップは「未確認」）。Ctrl+Enter も 1 回目は止まり 2 回目で進む。
    //   不一致で打ち切り（不採用推奨に固定。残りの必須条件は任意）のときと、必須条件の無い段階は止めない
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '必須 確認' });
    await page.click('#saNext');
    await wait(300);
    const at21 = () => page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), band = document.getElementById('ivTop').getBoundingClientRect(), ft = document.getElementById('ivFoot').getBoundingClientRect(), t = document.getElementById('toast');
      return { sec: document.getElementById('ivStage').dataset.sec, act: a && a.dataset && a.dataset.cl ? a.dataset.cl + ':' + a.dataset.value : (a.id || a.tagName), seen: r.top >= band.bottom - 1 && r.bottom <= ft.top + 1,
        amber: Array.from(document.querySelectorAll('#ivStage .cl-must-row.is-missing')).map(e => e.dataset.item).join(','), toast: t.classList.contains('show') ? t.textContent : '',
        chips: Array.from(document.querySelectorAll('#ivChips .iv-chip')).map(c => (c.classList.contains('is-current') ? '*' : '') + c.querySelector('.iv-chip-no').textContent + c.querySelector('.iv-chip-s').textContent).join(' ') }; });
    const g21 = {};
    await page.click('#ivNext');
    await wait(300);
    g21.first = await at21();
    const mw21 = await page.$('#ivStage [data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');   // （① に残っていなければ押さずに確かめで落とす）
    if (mw21) await mw21.click();
    await wait(150);
    g21.one = await at21();
    await page.click('#ivNext');
    await wait(300);
    g21.second = await at21();
    await ivGo('conditions');
    await page.focus('#ivStage textarea[data-cl="notes.q_term"]');
    await page.keyboard.press('Control+Enter');
    await wait(300);
    g21.ce1 = await at21();
    await page.keyboard.press('Control+Enter');
    await wait(300);
    g21.ce2 = await at21();
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '打ち切り 確認' });
    await page.click('#saNext');
    await wait(300);
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
    await page.click('#ivNext');
    await wait(300);
    g21.gate = await at21();
    await page.click('#ivNext');
    await wait(300);
    g21.noMust = await at21();
    expect(g21.first.sec === 'conditions' && g21.first.act === 'values.must_weekly:match' && g21.first.seen && g21.first.amber === 'must_weekly,must_busy' &&
      g21.first.toast === '必須条件がまだです。確かめてから進んでください（もう一度押すとそのまま進みます）' &&
      g21.one.sec === 'conditions' && g21.one.amber === 'must_busy' && g21.second.sec === 'continuity' && !g21.second.toast && g21.second.chips === '①未確認 *② ③ ④ ⑤' &&
      g21.ce1.sec === 'conditions' && g21.ce1.act === 'values.must_busy:match' && g21.ce1.seen && g21.ce2.sec === 'continuity' && g21.gate.sec === 'continuity' && g21.noMust.sec === 'job',
      'E21 (2) 必須条件を確かめないまま［次へ］: 1 回目は進まずに最初の未確認の行の［一致］へ（帯の下・操作行の上に見える・未確認の行は琥珀・短い案内）・1 つ確かめると残りだけ琥珀・' +
      'もう一度押すと ②（案内は消え、① は「未確認」）・Ctrl+Enter も 1 回目は止まり 2 回目で進む・不一致で打ち切りのときと必須条件の無い段階は止めない: ' + JSON.stringify(g21));

    // (3) ⑤ の合否連絡（#12）: 話す → 聞く の並びのまま、合否連絡のカードの本文の先頭に順番の 1 行（台本の注記はそのまま・聞くことのカードは下）。説明のカードには出さない
    await ivGo('reverse');
    const n21 = await page.evaluate(() => { const say = document.querySelector('#ivStage .k-say[data-say="notify"]'), ask = document.querySelector('#ivStage .k-ask'), body = say.querySelector('.card-body');
      return { first: body.firstElementChild.className + '|' + body.firstElementChild.textContent, notes: Array.from(body.querySelectorAll('.iv-note')).map(e => e.textContent),
        below: !!ask && ask.getBoundingClientRect().top > say.getBoundingClientRect().bottom, n: document.querySelectorAll('#ivStage .iv-order').length }; });
    await ivGo('conditions');
    n21.cond = await page.$$eval('#ivStage .iv-order', els => els.length);
    expect(n21.first === 'iv-note iv-order|逆質問（下の「聞くこと」）が終わったら、面接の最後に伝えて［伝えた］を押します' &&
      JSON.stringify(n21.notes) === JSON.stringify(['逆質問（下の「聞くこと」）が終わったら、面接の最後に伝えて［伝えた］を押します', '面接の最後に伝えたらチェック']) && n21.below && n21.n === 1 && n21.cond === 0,
      'E21 (3) ⑤ の合否連絡のカードの先頭に「逆質問（下の「聞くこと」）が終わったら、面接の最後に伝えて［伝えた］を押します」（台本の注記「面接の最後に伝えたらチェック」はその下・聞くことのカードは下）・① の説明には出さない: ' + JSON.stringify(n21));

    // (4) 評価（#13）: 結果のカードの未入力の数は押せる（文字だけのボタン。文は「未入力：…」のまま）。押すとその種類の最初の未入力の行へ（その操作にフォーカス・結果のカードの下と操作行の上に見える）。
    //   「✎ 面接の画面で直す」→［評価に戻る］（⑤ は［面接を終えて評価へ］）で、直しに行った段階のカードが元の高さに戻り、その「面接の画面で直す」にフォーカス（評価の先頭へ戻さない）
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '評価 戻り' });
    await page.click('#saNext');
    await wait(300);
    await ivGo('reverse');
    await page.click('#ivNext');
    await wait(300);
    const e21 = { miss: await page.textContent('#evMissing'), btns: await page.$$eval('#evMissing [data-action="ev-miss"]', els => els.map(b => b.tagName + ':' + b.dataset.miss + ':' + b.textContent)) };
    const foc21 = () => page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), top = document.getElementById('evTop').getBoundingClientRect(), ft = document.getElementById('evFoot').getBoundingClientRect();
      return (a.dataset.cl || a.dataset.persona || '') + ':' + (a.dataset.value || a.dataset.score || '') + (r.top >= top.bottom - 1 && r.bottom <= ft.top + 1 ? '' : ':hidden'); });
    for (const k of ['must', 'rate', 'ps', 'overall']) { const b = await page.$('#evMissing [data-miss="' + k + '"]'); if (b) await b.click(); await wait(200); e21[k] = await foc21(); }
    const back21 = async (sec, via) => {
      await page.evaluate((sec) => { const c = document.getElementById('cl-' + sec); window.scrollTo(0, Math.round(c.getBoundingClientRect().top + scrollY - 320)); }, sec);
      await wait(150);
      const o = { before: await page.$eval('#cl-' + sec, c => Math.round(c.getBoundingClientRect().top)), sy0: await st(() => Math.round(scrollY)) };
      await page.click('#cl-' + sec + ' .ev-fix');
      await wait(250);
      o.iv = await st(() => window.RecruitApp.state.step + ':' + document.getElementById('ivStage').dataset.sec);
      await page.fill('#ivStage textarea.iv-q-memo', '直した');
      await page.click(via);
      await wait(300);
      Object.assign(o, await page.evaluate((sec) => ({ step: window.RecruitApp.state.step, after: Math.round(document.getElementById('cl-' + sec).getBoundingClientRect().top), sy: Math.round(scrollY),
        focus: document.activeElement.classList.contains('ev-fix') ? document.activeElement.closest('.ev-sec').dataset.sec : '' }), sec));
      return o;
    };
    e21.job = await back21('job', '#ivToEval');
    e21.reverse = await back21('reverse', '#ivNext');
    expect(e21.miss === '未入力：必須条件 2・確認点 6・人物像 7・総合判断' && JSON.stringify(e21.btns) === JSON.stringify(['BUTTON:must:必須条件 2', 'BUTTON:rate:確認点 6', 'BUTTON:ps:人物像 7', 'BUTTON:overall:総合判断']) &&
      e21.must === 'values.must_weekly:match' && e21.rate === 'values.rt_concrete:good' && e21.ps === 'ps_greeting:1' && e21.overall === 'overall:hire' &&
      ['job', 'reverse'].every(k => { const o = e21[k]; return o.iv === '2:' + k && o.step === 3 && o.sy0 > 0 && o.sy > 0 && Math.abs(o.after - o.before) <= 2 && o.focus === k; }),
      'E21 (4) 評価の結果カードの未入力の数はボタン（必須条件 → ［一致］・確認点 → ○・人物像 → 1・総合判断 → 採用。結果のカードの下・操作行の上に見える）。「✎ 面接の画面で直す」→［評価に戻る］・⑤ は［面接を終えて評価へ］で、' +
      '直しに行ったカードが元の高さに戻り「面接の画面で直す」にフォーカス: ' + JSON.stringify(e21));

    // (5) 390×844 の操作行は 1 段（高さ 64。#0）: 準備・面接 ①②⑤・評価・評価から直しに来た ②（［評価に戻る］つき。主ボタンは「次へ：③ →」）・報告書。
    //   戻るは「← 戻る」（「準備に」「面接に」「評価に」は隠す・「前の段階」は短い文字に替える。textContent はそのまま）・主ボタンは右下（右から 16px）
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '狭い 操作行' });
    const ft21 = (id) => page.evaluate((id) => { const f = document.getElementById(id), p = f.querySelector('.btn.primary').getBoundingClientRect(), b = f.querySelector('.btn.ff-start');
      const s = b.querySelector('.lbl-s'), gen = s && getComputedStyle(s).display !== 'none' ? getComputedStyle(s, '::before').content.replace(/^"|"$/g, '') : '';
      return { h: Math.round(f.getBoundingClientRect().height), right: Math.round(innerWidth - p.right), back: b.innerText.replace(/[←\s]/g, '') + gen, text: window.__lbl(b) }; }, id);
    const w21 = { prep: await ft21('saActions') };
    await page.click('#saNext');
    await wait(300);
    w21.iv1 = await ft21('ivFoot');
    await ivGo('continuity');
    w21.iv2 = await ft21('ivFoot');
    await ivGo('reverse');
    w21.iv5 = await ft21('ivFoot');
    await page.click('#ivNext');
    await wait(300);
    w21.ev = await ft21('evFoot');
    await page.click('#cl-continuity .ev-fix');
    await wait(300);
    w21.iv2ev = Object.assign(await ft21('ivFoot'), { next: await page.$eval('#ivNext', b => b.innerText.replace(/\s+/g, '')), toEval: await visible('#ivToEval') });
    await page.click('#ivToEval');
    await wait(300);
    await page.click('#toReportBtn');
    await wait(400);
    w21.rp = await ft21('rpFoot');
    const BACK21 = { iv1: '[arrow-left] 準備に戻る', iv2: '[arrow-left] 前の段階', iv5: '[arrow-left] 前の段階', ev: '[arrow-left] 面接に戻る', iv2ev: '[arrow-left] 前の段階', rp: '[arrow-left] 評価に戻る' };
    expect(Object.keys(w21).every(k => w21[k].h === 64 && w21[k].right === 16) && Object.keys(BACK21).every(k => w21[k].back === '戻る' && w21[k].text === BACK21[k]) &&
      w21.iv2ev.toEval && w21.iv2ev.next.indexOf('次へ：③') === 0 && w21.iv2ev.next.indexOf('仕事内容の説明') < 0,
      'E21 (5) 390×844 の操作行は 1 段（64px）・主ボタンは右から 16px: 準備・面接 ①②⑤・評価・評価から直しに来た ②（［評価に戻る］つき・主ボタンは「次へ：③ →」）・報告書。戻るは「← 戻る」（左向きの矢印のアイコン。DOM の文字は「準備に戻る」などのまま〔.lbl-x を隠す・前の段階は .lbl-s の文字〕）: ' + JSON.stringify(w21));

    // (6) 841〜960px（チップが番号だけになる幅）: 必須条件を不一致にしても（省略可）・① を確かめないまま先へ進んでも（未確認）、上の帯のチップは 1 行・帯の高さは変わらない（#5。状態は枠と title に残す）
    const b21 = {};
    const row21 = () => page.evaluate(() => { const cs = Array.from(document.querySelectorAll('#ivChips .iv-chip')).map(c => c.getBoundingClientRect()), mids = cs.map(r => r.top + r.height / 2);
      return { spread: Math.round(Math.max(...mids) - Math.min(...mids)), h: Math.round(document.querySelector('#ivBar .iv-bar-main').getBoundingClientRect().height),
        titles: Array.from(document.querySelectorAll('#ivChips .iv-chip.is-skip, #ivChips .iv-chip.is-unconf')).map(c => c.title).join('|') }; });
    for (const w of [841, 900, 960]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.click('#btnNew');
      await wait(200);
      await fillScript({ name: '帯 確認' });
      await page.click('#saNext');
      await wait(300);
      const o = { plain: await row21() };
      await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
      await wait(200);
      o.ng1 = await row21();
      await ivGo('reverse');
      o.ng5 = await row21();
      await page.click('#btnNew');
      await wait(200);
      await fillScript({ name: '帯 確認 2' });
      await page.click('#saNext');
      await wait(300);
      await ivGo('continuity');
      await page.fill('#ivStage textarea[data-cl="notes.q_prev_job"]', '飲食で1年');
      await ivGo('job');
      o.unconf = await row21();
      b21[w] = o;
    }
    expect(Object.keys(b21).every(w => { const o = b21[w]; return ['plain', 'ng1', 'ng5', 'unconf'].every(k => o[k].spread <= 2 && o[k].h === o.plain.h) &&
      o.ng1.titles.includes('（必須条件不一致のため省略可）') && o.unconf.titles.includes('（必須条件が未確認）'); }),
      'E21 (6) 841・900・960px: 必須条件の不一致（① と ⑤。②〜④ は省略可）・① の未確認のまま ③ でも、上の帯のチップは 1 行で帯の高さは同じ（状態は title に残る）: ' + JSON.stringify(b21));

    // (7) 必須条件の案内の「該当の行へ」は 481〜840px でも出す（480px 以下だけ隠す。600px 以下の案内は短い文。#20）。768px で ⑤ から押すと ① の不一致の行の［不一致］へ（固定の案内の下・操作行の上に見える）
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '該当 確認' });
    await page.click('#saNext');
    await wait(300);
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
    await wait(150);
    const l21 = {};
    for (const w of [390, 480, 481, 600, 768, 840]) {
      await page.setViewportSize({ width: w, height: 900 });
      await wait(200);
      l21[w] = await page.evaluate(() => { const l = document.querySelector('#ivMustAlert [data-action="iv-must-row"]'), r = l.getBoundingClientRect(), a = document.getElementById('ivMustAlert').getBoundingClientRect();
        return { link: getComputedStyle(l).display !== 'none' && r.width > 0, short: getComputedStyle(document.getElementById('ivMustShort')).display !== 'none', h: Math.round(a.height), ov: document.documentElement.scrollWidth - innerWidth }; });
    }
    await page.setViewportSize({ width: 768, height: 900 });
    await wait(150);
    await ivGo('reverse');
    if (await visible('#ivMustAlert [data-action="iv-must-row"]')) await page.click('#ivMustAlert [data-action="iv-must-row"]');   // （出ていなければ押さずに確かめで落とす）
    await wait(300);
    l21.go = await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), al = document.getElementById('ivMustAlert').getBoundingClientRect(), ft = document.getElementById('ivFoot').getBoundingClientRect();
      return { sec: document.getElementById('ivStage').dataset.sec, act: a.dataset.cl + ':' + a.dataset.value, seen: r.top >= al.bottom - 1 && r.bottom <= ft.top + 1 }; });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    expect(!l21[390].link && !l21[480].link && [481, 600, 768, 840].every(w => l21[w].link && l21[w].h <= 48 && l21[w].ov <= 1) && l21[481].short && l21[600].short && !l21[768].short && !l21[840].short &&
      l21.go.sec === 'conditions' && l21.go.act === 'values.must_busy:mismatch' && l21.go.seen,
      'E21 (7) 「該当の行へ」は 481〜840px でも出る（480px 以下は出さない）・案内は 2 行まで（600px 以下は短い文）・768px で ⑤ から押すと ① の不一致の行の［不一致］（固定の案内の下・操作行の上）: ' + JSON.stringify(l21));
  }

  // =====================================================================
  // E22 レビュー修正 B（docs/SPEC-flow.md 16-8。2026-10-19）: 見た目と文言（○△× の和文のフォント・面接所見の欄の枠・帯のアイコンと題・右サマリーの押印の ✓・
  //     評価の「していない」の ⚠・設定の呼び方・勤務条件の確認の注記・話す → 聞く → 確かめる・記入シートの並びの案内）。保存 HTML の窓（最終合否の色・文字・フォーカス）は E9
  // =====================================================================
  console.log('\n== E22 レビュー修正 B ==');
  {
    await page.clock.setFixedTime(NOW);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fresh();
    // (1) の道具: 見えている文字のうち ○ △ ×（台本の記号。掛け算の「× 1〜5 点」は除く）を含むものの font-family の先頭が --font-ja の先頭か（.ja・.seg-btn.mark。A4 の用紙は除く）
    const ja22 = await st(() => getComputedStyle(document.documentElement).getPropertyValue('--font-ja').split(',')[0].replace(/["']/g, '').trim());
    const marks22 = () => page.evaluate((ja) => {
      const bad = []; let n = 0;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!/[○△]|×(?!\s*\d)/.test(t.nodeValue)) continue;
        const el = t.parentElement;
        if (!el || el.closest('.a4, #clSheet, .sym, script, style, option, #toast') || !el.checkVisibility()) continue;
        n++;
        const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
        if (f !== ja) bad.push(t.nodeValue.trim().slice(0, 24) + '〔' + f + '〕');
      }
      return { n, bad };
    }, ja22);
    // (2) の道具: 本文のカードの中の入力欄・選択・メモ欄は 4 辺とも枠がある（上の枠だけ消えていない）
    const frame22 = () => page.evaluate(() => Array.from(document.querySelectorAll('#stepContent .card-body input:not([type="checkbox"]):not([type="hidden"]), #stepContent .card-body select, #stepContent .card-body textarea'))
      .filter(e => e.checkVisibility()).filter(e => { const s = getComputedStyle(e); return s.borderTopWidth === '0px' || s.borderTopWidth !== s.borderBottomWidth; }).map(e => e.id || e.dataset.cl || e.dataset.field || e.className));
    const box22 = (sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return ''; const c = getComputedStyle(e); return [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth, c.paddingTop, c.paddingBottom].join(' '); }, sel);
    // (3) の道具: 見出し帯のアイコン（番号）と題が同じ行（縦の範囲が重なる）。重ならない帯の題を返す
    const band22 = () => page.evaluate(() => { const out = { n: 0, bad: [] };
      document.querySelectorAll('.card-band').forEach(b => { if (!b.checkVisibility()) return; const i = b.querySelector(':scope > .ico, :scope > .nb'), t = b.querySelector(':scope > .card-title'); if (!i || !t) return;
        out.n++; const a = i.getBoundingClientRect(), c = t.getBoundingClientRect(); if (!(a.top < c.bottom && c.top < a.bottom)) out.bad.push(t.textContent.slice(0, 20) + ' ' + Math.round(b.getBoundingClientRect().height) + 'px'); });
      return out; });
    // (8)(9) の道具: 文の中の「確かめる」「話す」「聞く」の順
    const stems22 = (t) => ['確かめる', '話す', '聞く'].map(k => ({ k, i: String(t || '').indexOf(k) })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i).map(x => x.k).join(' → ');
    const m22 = {}, fr22 = {};
    m22.prep = await marks22();
    fr22.prep = await frame22();
    const ref22 = await box22('textarea[data-field="reviewerNotes"]');   // 準備のメモ欄（同じ部品 textarea.notes）
    const intro22 = await st(() => (document.querySelectorAll('#introCard .intro-steps li')[1] || {}).textContent || '');
    await fillScript({ name: '修正 確認B', interviewer: '笹川 晴央' });
    await page.click('#saNext');
    await wait(300);
    const ord22 = await page.evaluate(() => ({ cards: Array.from(document.querySelectorAll('#ivStage > section.card .card-title > span:first-child')).map(e => e.textContent),
      lead: (document.querySelector('#stepLead span') || {}).textContent || '', side: (document.querySelector('#stepNav li[data-step="2"] .step-hint') || {}).textContent || '' }));
    fr22.iv = await frame22();
    for (const sec of await page.$$eval('#ivChips [data-action="iv-go"]', els => els.map(e => e.dataset.sec))) { await ivGo(sec); m22['iv-' + sec] = await marks22(); }
    //   説明: ① は［説明した］・② は［説明した］のあと 1 項目を外す（一部）・③④ と ⑤ の合否連絡は押さない（していない・伝えていない）
    await said('conditions');
    await said('continuity');
    await page.click('[data-action="iv-said-items"][data-sec="continuity"]');
    await wait(100);
    await page.click('#ivStage .iv-say-list input[type="checkbox"]');
    await wait(100);
    await goTo(3);
    m22.eval = await marks22();
    fr22.eval = await frame22();
    const notes22 = await box22('#clIvNotes');
    //   本文の最後の要素が警告の箱のとき（総合判断が保留）も箱の内側の余白は上下同じ
    await page.click('[data-action="cl-set"][data-cl="overall"][data-value="hold"]');
    await wait(150);
    const warn22 = (await box22('#overallWarn')).split(' ');
    const said22 = await page.evaluate(() => Array.from(document.querySelectorAll('.ev-said')).map(e => ({ off: e.classList.contains('is-off'), use: Array.from(e.querySelectorAll('.kv-v use')).map(u => u.getAttribute('href')).join('+'),
      t: e.querySelector('.kv-v').textContent, col: e.querySelector('.kv-v svg.ico') ? getComputedStyle(e.querySelector('.kv-v svg.ico')).color : '' })));
    const warnCol22 = await st(() => { const d = document.createElement('div'); d.style.color = 'var(--warn-strong)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    // 報告書: 面接対応者に押印 → 右サマリーの押印の行
    await goTo(4);
    await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
    await wait(200);
    m22.report = await marks22();
    const ss22 = await page.evaluate(() => { const e = document.querySelector('#sumStamps .sum-stamps'); if (!e) return null;
      const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let raw = 0; for (let t = w.nextNode(); t; t = w.nextNode()) if (t.nodeValue.includes('✓') && !t.parentElement.closest('.sym')) raw++;
      const i = e.querySelector('svg.ico'), d = document.createElement('span'); d.style.color = 'var(--accent-text)'; document.body.appendChild(d); const acc = getComputedStyle(d).color; d.remove();
      return { t: e.textContent, use: Array.from(e.querySelectorAll('svg.ico use')).map(u => u.getAttribute('href')), raw, navy: !!i && getComputedStyle(i).color === acc }; });
    // 使い方: ○△×・設定のカードの題・記入シートの並び・帯（390・360px）
    await toView('help');
    m22.help = await marks22();
    const set22 = await page.evaluate(() => ({ help: (document.querySelector('#helpSettings .card-title > span') || {}).textContent || '', nav: document.querySelector('.nav-item[data-view="settings"]').textContent.trim(),
      old: document.getElementById('view-help').textContent.includes('劇場プロファイル') }));
    const pp22 = await page.evaluate(() => ({ help: (Array.from(document.querySelectorAll('#helpPersona li')).find(li => li.textContent.includes('記入シート（手書き用）')) || {}).textContent || '' }));
    const bd22 = {};
    for (const w of [390, 360]) { await page.setViewportSize({ width: w, height: 844 }); await wait(250); bd22[w] = await band22(); }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(200);
    await toView('settings');
    set22.top = await page.textContent('#topTitle');
    await toView('judge');
    //   記入シートの用紙の見出し（段階の中の並び）と準備の［記入シート］の title
    pp22.paper = await st(() => { window.RecruitApp.preparePaperSheet(true); const h = (document.querySelector('#clSheet .pp-part[data-part="iv"] small') || {}).textContent || ''; window.RecruitApp.preparePaperSheet(false); return h; });
    await goTo(1);
    pp22.title = (await page.getAttribute('#saPaperBtn', 'title')) || '';
    //   アプリ名が長いとき（設定で変えられる）: 題は題の中で折り返し、アイコンと同じ行のまま（600・390px）
    await page.evaluate(() => { const p = window.RecruitStorage.defaults(); p.meta.appTitle = 'リクルート判定システム（TOHOシネマズ テスト アルバイト採用 面接用）'; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); });
    await page.reload();
    await wait(300);
    await toView('help');
    for (const w of [600, 390]) { await page.setViewportSize({ width: w, height: 844 }); await wait(250); bd22['long' + w] = await band22(); }
    await page.setViewportSize({ width: 1440, height: 1000 });
    // 勤務条件の確認の注記（既定の台本の文は E2）: Q のタグの付く欄が無い台本（質問の短い名前を変えた）では「（Q… は聞くことの答え）」を付けない
    await page.evaluate(() => { const p = window.RecruitStorage.defaults(); const q = p.checklist.sections[0].blocks.find(b => b.type === 'question'); q.items[0].short = '勤務の希望'; localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); });
    await page.reload();
    await wait(300);
    await fillScript({ name: '注記 確認' });
    await page.click('#saNext');
    await wait(300);
    const nt22 = await page.evaluate(() => { const h = Array.from(document.querySelectorAll('#ivStage .k-check .group-h')).find(e => e.firstChild.textContent === '勤務条件の確認');
      return { note: h ? ((h.querySelector('small') || {}).textContent || '') : null, tags: document.querySelectorAll('#ivStage .k-check .q-no').length }; });

    const badMarks22 = Object.keys(m22).filter(k => m22[k].bad.length).map(k => k + ': ' + m22[k].bad.join(' / '));
    expect(badMarks22.length === 0 && Object.keys(m22).reduce((a, k) => a + m22[k].n, 0) >= 15 && m22['iv-conditions'].n >= 1 && m22.eval.n >= 3 && m22.help.n >= 3,
      'E22 (1) ○△×（台本の記号）は和文のフォント（--font-ja）: 準備・面接 ①〜⑤（この画面ですること）・評価（この画面ですること・凡例・確認点の補足）・報告書・使い方（面接の進め方・結果の決まり方）の見えている文字すべて: ' +
      JSON.stringify({ bad: badMarks22, n: Object.keys(m22).map(k => k + ':' + m22[k].n).join(' ') }));
    expect(fr22.prep.length === 0 && fr22.iv.length === 0 && fr22.eval.length === 0 && !!ref22 && notes22 === ref22 && /^1px 1px 1px 1px [1-9]/.test(notes22) &&
      warn22.length === 6 && warn22[4] === warn22[5] && warn22[4] !== '0px',
      'E22 (2) 評価の面接所見の欄（カードの本文がこの欄だけ）も 4 辺の枠と上下の内側の余白が準備のメモ欄と同じ・準備・面接 ①・評価のカードの入力欄で上の枠が消えたものは無い・' +
      '本文の最後の警告の箱（総合判断が保留）も内側の余白は上下同じ: ' + JSON.stringify({ notes22, ref22, fr22, warn22 }));
    expect(bd22[390].n >= 8 && bd22[360].n >= 8 && !bd22[390].bad.length && !bd22[360].bad.length && bd22.long600.n >= 8 && !bd22.long600.bad.length && !bd22.long390.bad.length,
      'E22 (3) 見出し帯のアイコン（番号）と題は同じ行: 使い方を 390・360px で（1 枚目「… の使い方」も）・アプリ名が長いときも 600・390px で（題の中で折り返す）: ' + JSON.stringify(bd22));
    expect(!!ss22 && ss22.t === '面接対応者 ✓ 笹川／最終確認 未押印' && JSON.stringify(ss22.use) === JSON.stringify(['#i-check']) && ss22.raw === 0 && ss22.navy,
      'E22 (4) 右サマリーの押印の ✓ は SVG のアイコン（i-check・紺。記号の文字 ✓ は見た目に出さず textContent は「面接対応者 ✓ 笹川」のまま）: ' + JSON.stringify(ss22));
    const offAll22 = said22.filter(x => x.off && !/^一部/.test(x.t)), offPart22 = said22.filter(x => x.off && /^一部/.test(x.t)), on22 = said22.filter(x => !x.off);
    expect(said22.length === 5 && offAll22.length === 3 && offPart22.length === 1 && on22.length === 1 && said22.filter(x => x.off).every(x => x.use === '#i-alert' && x.col === warnCol22) && on22.every(x => x.use === '#i-check') &&
      JSON.stringify(offAll22.map(x => x.t)) === JSON.stringify(['していない', 'していない', '伝えていない']),
      'E22 (5) 評価の面接のメモの「説明」「合否連絡」: していない・伝えていない（全部）も 一部説明していない と同じ注意の形（琥珀＋i-alert）・説明した は ✓: ' + JSON.stringify(said22));
    expect(set22.help === '設定（劇場ルール）' && set22.help === set22.nav && set22.help === set22.top && !set22.old,
      'E22 (6) 設定の画面の呼び方は使い方のカード・サイドバー・トップバーで同じ「設定（劇場ルール）」（使い方に「劇場プロファイル」は出ない）: ' + JSON.stringify(set22));
    expect(!!nt22 && nt22.note === '応募者に聞いて選ぶ・記入する' && nt22.tags === 0,
      'E22 (7) 勤務条件の確認の注記は Q のタグの付いた欄だけを「聞くことの答え」と言う（タグの付く欄が無い台本では「応募者に聞いて選ぶ・記入する」だけ）: ' + JSON.stringify(nt22));
    const scr22 = ord22.cards.map(c => c.replace(/こと$/, '')).join(' → ');
    expect(scr22 === '話す → 聞く → 確かめる' && stems22(ord22.lead) === scr22 && stems22(ord22.side) === scr22 && stems22(intro22) === scr22 && !/メモ$|・メモ/.test(ord22.side + intro22),
      'E22 (8) 面接の「この画面ですること」・サイドバーの手順のヒント・はじめての方への手順 2 は、カードの名前と同じ 話す → 聞く → 確かめる: ' + JSON.stringify({ scr22, ord22, intro22 }));
    const paperOrd22 = stems22(pp22.paper.split('：').pop());
    expect(paperOrd22 === '確かめる → 話す → 聞く' && pp22.help.includes(paperOrd22) && pp22.help.includes(scr22) && !pp22.help.includes('同じ並び') && !pp22.title.includes('同じ並び') && pp22.title.includes('段階の中は台本の順'),
      'E22 (9) 記入シートの並びの案内（使い方・準備の［記入シート］の title）は「画面と同じ並び」と言わない: 段階の中は用紙の見出しと同じ台本の順（確かめる → 話す → 聞く）で、面接の画面（話す → 聞く → 確かめる）と違うこと: ' + JSON.stringify(pp22));
  }

  // =====================================================================
  // E23 レビュー修正 C（docs/SPEC-flow.md 16-9。2026-10-19）: テストが確かめていなかった性質 —
  //     (1) SVG のアイコン（参照先・描かれるか・主なボタンのアイコン）(2) 390px の行（操作はラベルの下で全幅・トグルは帯の幅）(3) 記入欄の見本（FIELD_EXAMPLES）
  //     (4) サイドバーの手順の Enter／Space (5) ⑤ の必須条件の案内の文 (6) 全画面のコントラストと文字の段階（ライト／ダーク・1440／390px）
  // =====================================================================
  console.log('\n== E23 レビュー修正 C ==');
  {
    await page.clock.setFixedTime(NOW);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fresh();
    // (1) アイコン（docs/DESIGN.md 2 章）: 各画面のすべての <use> の参照先が index.html の <symbol id="i-…"> にあり、見えているものは描かれる（getBBox の幅と高さが 0 より大きい。
    //   参照先が無いと 16px の空の箱だけが残り、位置の確認では分からない）。スプライトのアイコンはどれもどこかの画面で描かれる（使っていないアイコンを残さない）。主なボタンのアイコンの id
    const icons23 = () => page.evaluate(() => { const out = { n: 0, vis: 0, missing: [], zero: [], ids: [] };
      document.querySelectorAll('svg use').forEach(u => { const h = u.getAttribute('href') || u.getAttribute('xlink:href') || ''; out.n++;
        const t = h.charAt(0) === '#' ? document.getElementById(h.slice(1)) : null;
        if (!t || t.tagName.toLowerCase() !== 'symbol') { out.missing.push(h); return; }
        const svg = u.ownerSVGElement; if (!svg || !svg.checkVisibility()) return;
        out.vis++; if (out.ids.indexOf(h.slice(3)) < 0) out.ids.push(h.slice(3));
        const b = u.getBBox(); if (!(b.width > 0 && b.height > 0)) out.zero.push(h); });
      return out; });
    const btnIco23 = (sels) => page.evaluate((sels) => { const o = {}; sels.forEach(k => { const e = document.querySelector(k); o[k] = e ? Array.from(e.querySelectorAll('svg.ico use')).map(u => (u.getAttribute('href') || '').replace(/^#i-/, '')).join('+') : null; }); return o; }, sels);
    const ic23 = {}, bi23 = {};
    ic23.prep = await icons23();
    Object.assign(bi23, await btnIco23(['#saNext', '#saPaperBtn', '#btnPrint', '#btnSave', '#btnNew', '#btnLoad', '#btnTheme']));
    await fillScript({ name: 'アイコン 確認', posting: 'short' });
    await page.click('#saNext');
    await wait(300);
    //   ① は［説明した］を押し・「一部説明しなかった」を開き（▴）・必須条件を［不一致］（帯の案内）にした状態
    await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
    await page.click('[data-action="iv-said-items"][data-sec="conditions"][data-kind="explain"]');
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
    await wait(150);
    ic23.iv1 = await icons23();
    Object.assign(bi23, await btnIco23(['#ivNext', '#ivPrev', '[data-action="iv-said"][data-sec="conditions"]', '[data-action="iv-said-items"][data-sec="conditions"]', '#ivMustAlert']));
    for (const sec of ['continuity', 'job', 'teamwork', 'reverse']) { await ivGo(sec); ic23['iv-' + sec] = await icons23(); }
    bi23['#ivNext（⑤）'] = (await btnIco23(['#ivNext']))['#ivNext'];
    bi23['#ivPrev（⑤）'] = (await btnIco23(['#ivPrev']))['#ivPrev'];
    await page.click('#ivNext');   // 面接を終えて評価へ
    await wait(300);
    ic23.ev = await icons23();
    Object.assign(bi23, await btnIco23(['#toReportBtn', '#evBack', '#cl-conditions .ev-fix']));
    await page.click('#toReportBtn');
    await wait(400);
    ic23.rp = await icons23();
    Object.assign(bi23, await btnIco23(['#reportSaveBtn', '#reportPrintBtn', '#backToChecklist']));
    await toView('settings');
    await page.evaluate(() => document.querySelectorAll('#view-settings details').forEach(d => { d.open = true; }));
    await wait(150);
    ic23.settings = await icons23();
    await toView('help');
    ic23.help = await icons23();
    bi23['使い方の戻る'] = (await btnIco23(['#view-help [data-action="back-to-judge"]']))['#view-help [data-action="back-to-judge"]'];
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(250);
    ic23.help390 = await icons23();
    await toView('judge');
    ic23.rp390 = await icons23();
    await page.click('#btnTheme');   // ダーク（i-sun）
    await wait(150);
    ic23.dark390 = await icons23();
    bi23['#btnTheme（ダーク）'] = (await btnIco23(['#btnTheme']))['#btnTheme'];
    await page.click('#btnTheme');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    const sprite23 = await page.evaluate(() => Array.from(document.querySelectorAll('svg symbol[id^="i-"]')).map(x => x.id.slice(2)).sort());
    const drawn23 = Array.from(new Set([].concat(...Object.keys(ic23).map(k => ic23[k].ids)))).sort();
    const BI23 = { '#saNext': 'arrow-right', '#saPaperBtn': 'printer', '#btnPrint': 'printer', '#btnSave': 'download', '#btnNew': 'plus', '#btnLoad': 'folder', '#btnTheme': 'moon',
      '#ivNext': 'arrow-right', '#ivPrev': 'arrow-left', '[data-action="iv-said"][data-sec="conditions"]': 'check', '[data-action="iv-said-items"][data-sec="conditions"]': 'chevron-up', '#ivMustAlert': 'alert',
      '#ivNext（⑤）': 'arrow-right', '#ivPrev（⑤）': 'arrow-left', '#toReportBtn': 'arrow-right', '#evBack': 'arrow-left', '#cl-conditions .ev-fix': 'pencil',
      '#reportSaveBtn': 'download', '#reportPrintBtn': 'printer', '#backToChecklist': 'arrow-left', '使い方の戻る': 'arrow-left', '#btnTheme（ダーク）': 'sun' };
    expect(Object.keys(ic23).every(k => ic23[k].vis > 0 && ic23[k].missing.length === 0 && ic23[k].zero.length === 0) && JSON.stringify(drawn23) === JSON.stringify(sprite23) && sprite23.length >= 28 &&
      Object.keys(BI23).every(k => bi23[k] === BI23[k]),
      'E23 (1) アイコン: 準備・面接 ①〜⑤・評価・報告書・設定・使い方・390px・ダークのすべての <use> の参照先があり、見えているものは描かれる（幅と高さが 0 より大きい）・スプライトのアイコンはどれも描かれる・' +
      '主なボタンのアイコン（次へ・面接を始める・報告書へ → arrow-right／戻る → arrow-left／説明した → check／記入シート・印刷 → printer／保存 → download ほか）: ' +
      JSON.stringify({ ic23: Object.keys(ic23).map(k => k + ':' + ic23[k].vis + '/' + ic23[k].n + (ic23[k].missing.length ? ' missing ' + ic23[k].missing.join(',') : '') + (ic23[k].zero.length ? ' zero ' + ic23[k].zero.join(',') : '')),
        notDrawn: sprite23.filter(x => drawn23.indexOf(x) < 0), bad: Object.keys(BI23).filter(k => bi23[k] !== BI23[k]).map(k => k + '=' + bi23[k]) }));

    // (2) 390px（docs/DESIGN.md 3-3・4-3「600px 以下: 項目の行は縦〔操作はラベルの下で全幅〕・トグルも全幅・ゴーストはその上の行の右」）: 面接 ① の確かめることと評価の必須条件の行は、
    //   操作の列（.row-ctl）がラベルの下で、行の内側の幅いっぱい（左端も同じ。不一致の行の地のはみ出しは除く）。話すことの見出し帯の［説明した］は帯の内側の幅いっぱい・「一部説明しなかった」はその上の行の右端
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: '狭い 行' });
    await page.click('#saNext');
    await wait(300);
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');   // 不一致の行（地が左右に 12px はみ出す）も
    await wait(150);
    const rows23 = (sel) => page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).filter(r => r.offsetParent !== null).map(r => {
      const cs = getComputedStyle(r), rr = r.getBoundingClientRect(), l = r.querySelector('.row-label').getBoundingClientRect(), c = r.querySelector('.row-ctl').getBoundingClientRect();
      const left = rr.left + parseFloat(cs.paddingLeft), w = rr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { item: r.dataset.item, below: c.top >= l.bottom - 1, full: Math.abs(c.width - w) <= 1 && Math.abs(c.left - left) <= 1, w: Math.round(c.width) }; }), sel);
    const tg23 = () => page.evaluate(() => { const card = document.querySelector('#ivStage .k-say'), band = card.querySelector('.card-band'), cs = getComputedStyle(band), br = band.getBoundingClientRect();
      const t = card.querySelector('[data-action="iv-said"]').getBoundingClientRect(), pt = card.querySelector('[data-action="iv-said-items"]').getBoundingClientRect();
      const inL = br.left + parseFloat(cs.paddingLeft), inR = br.right - parseFloat(cs.paddingRight);
      return { full: Math.abs(t.left - inL) <= 1 && Math.abs(t.right - inR) <= 1, partAbove: pt.bottom <= t.top + 1, partRight: Math.abs(pt.right - inR) <= 1, w: Math.round(t.width), inner: Math.round(inR - inL) }; });
    const r23 = { iv: await rows23('#ivStage .k-check .row'), tog: await tg23() };
    await goTo(3);
    r23.ev = await rows23('#cl-conditions .ev-must .row');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    expect(r23.iv.length === 8 && r23.ev.length === 2 && r23.iv.concat(r23.ev).every(x => x.below && x.full) && r23.tog.full && r23.tog.partAbove && r23.tog.partRight,
      'E23 (2) 390px: 面接 ① の確かめること（8 行）と評価の必須条件（2 行）の操作の列はラベルの下で行の幅いっぱい（不一致の行も）・［説明した］は帯の内側の幅いっぱい・「一部説明しなかった」はその上の行の右端: ' + JSON.stringify(r23));

    // (3) 記入欄の見本（docs/DESIGN.md 3-5・SPEC-flow 16-3。FIELD_EXAMPLES）: 既定の台本の 出勤不可な繁忙「例：12/24〜12/26」・OPEN／25時「例：タクシー可・25時まで可」。
    //   文言を変えた欄は「記入」（既定の文言のときだけ例を出す）・台本の欄に placeholder があればそれ
    await goTo(2);
    await ivGo('conditions');
    const ph23 = () => page.$$eval('#ivStage .k-check input[type="text"]', els => els.map(e => e.id + '=' + e.placeholder));
    const f23 = { def: await ph23() };
    await page.evaluate(() => { const p = window.RecruitStorage.defaults(), fl = p.checklist.sections[0].blocks.filter(b => b.type === 'fields').map(b => b.items).reduce((a, b) => a.concat(b), []);
      fl.find(it => it.id === 'busy_ng').label += '（変更）'; fl.find(it => it.id === 'open_late').placeholder = '例：自由に書く';
      localStorage.setItem('recruit.profile.v1', JSON.stringify(p)); });
    await page.reload();
    await wait(300);
    if (await page.$('#introOk')) await page.click('#introOk');
    await fillScript({ name: '見本 確認' });
    await page.click('#saNext');
    await wait(300);
    f23.mod = await ph23();
    await fresh();
    expect(JSON.stringify(f23.def) === JSON.stringify(['ivF-busy_ng=例：12/24〜12/26', 'ivF-open_late=例：タクシー可・25時まで可']) &&
      JSON.stringify(f23.mod) === JSON.stringify(['ivF-busy_ng=記入', 'ivF-open_late=例：自由に書く']),
      'E23 (3) 記入欄の見本: 既定の台本は「例：12/24〜12/26」「例：タクシー可・25時まで可」・文言を変えた欄は「記入」・台本の欄の placeholder はそのまま: ' + JSON.stringify(f23));

    // (4) サイドバーの手順（role="button"・tabindex 0）は Enter・Space でも押せる（まだ進めない手順は動かない。Space でページがスクロールしない）
    if (await page.$('#introOk')) await page.click('#introOk');
    await fillScript({ name: '手順 キー' });
    await page.click('#saNext');
    await wait(300);
    const k23 = {};
    await page.focus('#stepNav li[data-step="1"]');
    await page.keyboard.press('Enter');
    await wait(250);
    k23.enter = await step();
    await page.focus('#stepNav li[data-step="2"]');
    await page.keyboard.press(' ');
    await wait(250);
    k23.space = await step();
    await page.evaluate(() => window.scrollTo(0, 120));
    await wait(100);
    const y23 = await st(() => Math.round(scrollY));
    await page.focus('#stepNav li[data-step="4"]');
    await page.keyboard.press(' ');
    await wait(150);
    await page.keyboard.press('Enter');
    await wait(250);
    Object.assign(k23, { disabled: await step(), aria: await page.getAttribute('#stepNav li[data-step="4"]', 'aria-disabled'), y0: y23, y1: await st(() => Math.round(scrollY)) });
    expect(k23.enter === 1 && k23.space === 2 && k23.disabled === 2 && k23.aria === 'true' && k23.y0 > 0 && k23.y1 === k23.y0,
      'E23 (4) サイドバーの手順は Enter（面接 → 準備）・Space（準備 → 面接）で移れる・まだ進めない手順（報告書）は Enter・Space で動かず、Space でページもスクロールしない: ' + JSON.stringify(k23));

    // (5) 必須条件の案内の文（docs/DESIGN.md 3-11 の表「同・今が ⑤」）: ⑤ では「必須条件が不一致です。⑤ 逆質問は最大 10 分で終了します」（［⑤ 逆質問へ］は出さない）・
    //   600px 以下は短い文「必須条件が不一致（最大 10 分で終了）」（390px）
    await page.click('[data-action="cl-set"][data-cl="values.must_weekly"][data-value="mismatch"]');
    await wait(100);
    await ivGo('reverse');
    const m23 = { wide: await page.evaluate(() => ({ text: document.getElementById('ivMustLead').textContent + document.getElementById('ivMustAlertText').textContent, jump: !document.getElementById('ivMustJump').classList.contains('hidden') })) };
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(200);
    m23.narrow = await page.evaluate(() => { const s = document.getElementById('ivMustShort'), f = document.getElementById('ivMustAlertText');
      return { short: s.offsetParent !== null ? s.textContent : '', full: f.offsetParent !== null }; });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    expect(m23.wide.text === '必須条件が不一致です。⑤ 逆質問は最大 10 分で終了します' && !m23.wide.jump && m23.narrow.short === '必須条件が不一致（最大 10 分で終了）' && !m23.narrow.full,
      'E23 (5) ⑤ の必須条件の案内は「必須条件が不一致です。⑤ 逆質問は最大 10 分で終了します」（［⑤ 逆質問へ］なし）・390px は短い文「必須条件が不一致（最大 10 分で終了）」: ' + JSON.stringify(m23));

    // (6) コントラストと文字の段階（docs/DESIGN.md 0-3 の 5・1-3・1-4・6 章）: 準備（はじめての方へ）・面接 ①（不一致の案内・説明した）・⑤・評価・報告書・設定（台本の編集を開く）・使い方を
    //   ライト／ダーク × 1440／390px で。見えている文字（A4 の用紙・無効は除く）は背景とのコントラスト 4.5:1 以上（24px 以上・18.66px 以上の太字は 3:1）・番号の丸の数字と入力欄の見本も 4.5:1 以上・
    //   文字の大きさは 12・13・15・17・20・24px・太さは 400・700 だけ
    const audit23 = () => page.evaluate(() => {
      const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
      const bgOf = (el) => { const stack = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } }
        let base = parse(getComputedStyle(document.body).backgroundColor); if (!base || base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
      const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      const SIZES = [12, 13, 15, 17, 20, 24], WEIGHTS = [400, 700];
      const out = { n: 0, low: [], size: [], weight: [] }, seen = new Set();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!t.nodeValue.trim()) continue;
        const el = t.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        if (el.closest('[hidden], .hidden, svg, script, style, option, .a4, .sym, .sr-only, .cl-sheet-host, #toast') || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10);
        if (fs < 1) continue;   // 番号の丸の中の丸数字（大きさ 0。数字は ::before）
        out.n++;
        if (SIZES.indexOf(fs) < 0) out.size.push(t.nodeValue.trim().slice(0, 16) + '〔' + fs + '〕');
        if (WEIGHTS.indexOf(fw) < 0) out.weight.push(t.nodeValue.trim().slice(0, 16) + '〔' + fw + '〕');
        if (el.closest(':disabled, .disabled, [aria-disabled="true"]')) continue;   // 無効（透明度 .45〜.5）は 1-3 の例外
        let fg = parse(cs.color); const bg = bgOf(el); if (fg.a < 1) fg = over(fg, bg);
        const k = ratio(fg, bg);
        if (k < (fs >= 24 || (fs >= 18.66 && fw >= 700) ? 3 : 4.5)) out.low.push(t.nodeValue.trim().slice(0, 16) + '〔' + k.toFixed(2) + '〕');
      }
      document.querySelectorAll('.nb').forEach(el => { if (!el.checkVisibility() || el.closest('.disabled, [aria-disabled="true"], .a4')) return; const cs = getComputedStyle(el, '::before'), fs = parseFloat(cs.fontSize); if (!fs) return;
        const own = parse(getComputedStyle(el).backgroundColor), k = ratio(parse(cs.color), own && own.a >= 1 ? own : bgOf(el));
        if (k < 4.5) out.low.push('番号 ' + el.dataset.no + '〔' + k.toFixed(2) + '〕');
        if (SIZES.indexOf(fs) < 0) out.size.push('番号 ' + el.dataset.no + '〔' + fs + '〕'); });
      document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => { if (el.closest('[hidden], .hidden, .a4') || !el.checkVisibility() || el.value || !el.placeholder) return;
        const k = ratio(parse(getComputedStyle(el, '::placeholder').color), bgOf(el)); if (k < 4.5) out.low.push('見本 ' + el.placeholder.slice(0, 12) + '〔' + k.toFixed(2) + '〕'); });
      return out;
    });
    const au23 = {};
    for (const theme of ['light', 'dark']) {
      for (const w of [1440, 390]) {
        await page.setViewportSize({ width: w, height: 900 });
        await fresh();
        //   測るあいだは色の変化（transition .12s）を止める（ダークに切り替えた直後の途中の色を測らない。E17 (10) と同じ）
        await page.evaluate((t) => { const x = document.createElement('style'); x.id = 'e2eNoTransition23'; x.textContent = '*, *::before, *::after { transition: none !important; }'; document.head.appendChild(x);
          document.documentElement.setAttribute('data-theme', t); }, theme);
        await wait(100);
        const k = theme + w, o = {};
        o.prep = await audit23();
        await fillScript({ name: '監査 花子', posting: 'short' });
        await page.click('#saNext');
        await wait(300);
        await page.click('[data-action="iv-said"][data-sec="conditions"][data-kind="explain"]');
        await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
        await wait(150);
        o.iv1 = await audit23();
        await ivGo('reverse');
        o.iv5 = await audit23();
        await goTo(3);
        o.ev = await audit23();
        await goTo(4);
        await wait(200);
        o.rp = await audit23();
        await toView('settings');
        await page.evaluate(() => document.querySelectorAll('#view-settings details').forEach(d => { d.open = true; }));
        await wait(100);
        o.settings = await audit23();
        await toView('help');
        o.help = await audit23();
        await toView('judge');
        au23[k] = o;
      }
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fresh();
    const bad23 = [];
    Object.keys(au23).forEach(k => Object.keys(au23[k]).forEach(sc => { const o = au23[k][sc]; if (o.low.length || o.size.length || o.weight.length || o.n < 20) bad23.push(k + ' ' + sc + ' ' + JSON.stringify({ n: o.n, low: o.low.slice(0, 6), size: o.size.slice(0, 6), weight: o.weight.slice(0, 6) })); }));
    expect(Object.keys(au23).length === 4 && bad23.length === 0,
      'E23 (6) 準備・面接 ①⑤・評価・報告書・設定・使い方をライト／ダーク × 1440／390px で: 見えている文字のコントラストは 4.5:1 以上（大きい文字 3:1）・番号の丸と入力欄の見本も・文字は 12／13／15／17／20／24px・太さは 400／700 だけ: ' +
      (bad23.join(' / ') || Object.keys(au23).map(k => k + ':' + Object.keys(au23[k]).map(sc => sc + '=' + au23[k][sc].n).join(',')).join(' ')));
  }


  // =====================================================================
  // E24 レビュー修正 D（docs/SPEC-flow.md 16-10。2026-10-19 の最終確認で挙がった抜け）:
  //     (1) アプリの用紙（報告書の紙・印刷ホスト）と保存 HTML の用紙の計算されたスタイルが同じ（押印行が縦並びにならない）・最終合否の文字は意味の色
  //     (2) トーストの幅と位置 (3) 評価の結果カードの 390px の折り返し (4)［次へ］の文字・氏名と「さん」(5) 準備の選択の文字が切れない
  //     (6) 省略できる段階の「していない」は中立 (7) 打ち切りのときの人物像の札 (8) 設定の単位・コロン・チェックの文 (9) 最終合否の［取消］の位置
  //     (10) キーボードで［次へ］を 2 回・押しっぱなし（確かめていない必須条件を一致にしない）
  // =====================================================================
  console.log('\n== E24 レビュー修正 D ==');
  {
    await page.clock.setFixedTime(NOW);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await fresh();
    const e24 = [];
    // (1) 用紙の同じ見た目（docs/DESIGN.md 4-9・docs/SPEC-a4.md S13・A10）: アプリの報告書の紙 #appPaper・印刷ホスト #clSheet の用紙と、保存 HTML の用紙 #a4 の
    //   すべての要素の計算されたスタイル（並び・文字・色・余白・枠・大きさ）が同じ。アプリの部品の規則（押印の欄のカード .stamp-box の縦並び・中央寄せなど）が用紙に漏れない。
    //   ダークでも同じ（用紙は白地）。最終合否の「採用」「不採用」の文字は意味の色（採用＝緑・不採用＝赤）で、スタンプの絵だけがインクの朱・藍
    if (await page.$('#introOk')) await page.click('#introOk');
    await fillScript({ name: '用紙 花子', age: 20, category: '大学2年生', posting: 'short', interviewer: '笹川 晴央' });
    await page.click('#saNext');
    await wait(300);
    await page.fill('#ivStage textarea[data-cl="notes.q_term"]', '短期希望。2か月のあとは長期も相談したい');
    await rateAll('good');
    await page.fill('#clIvNotes', '受け答えがはっきりしている。');
    await judge();
    await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
    await wait(150);
    await page.selectOption('#decisionManager', { label: SASA });
    await page.click('#decisionCard [data-action="decide"][data-value="hire"]');
    await wait(300);
    const PROPS24 = ['display', 'position', 'flexDirection', 'flexWrap', 'alignItems', 'justifyContent', 'textAlign', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderLeftWidth', 'borderTopLeftRadius', 'whiteSpace', 'gridTemplateColumns', 'columnGap', 'rowGap', 'minWidth', 'minHeight'];
    const sheet24 = (pg, sel) => pg.evaluate(([sel, props]) => {
      const root = document.querySelector(sel);
      if (!root) return null;
      return [root].concat(Array.from(root.querySelectorAll('*'))).map(e => {
        const cs = getComputedStyle(e), r = e.getBoundingClientRect();
        return e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || '') + ' ' + props.map(p => p + '=' + cs[p]).join(';') + ';w=' + Math.round(r.width) + ';h=' + Math.round(r.height);
      });
    }, [sel, PROPS24]);
    const diff24 = (a, b) => { if (!a || !b) return ['missing ' + !!a + '/' + !!b]; const out = []; if (a.length !== b.length) out.push('count ' + a.length + '/' + b.length);
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) { const pa = a[i].split(';'), pb = b[i].split(';'); out.push(i + ' ' + a[i].split(' ')[0] + ' ' + pa.filter((x, k) => x !== pb[k]).join(';') + ' ≠ ' + pb.filter((x, k) => x !== pa[k]).join(';')); }
      return out; };
    const app24 = { light: await sheet24(page, '#appPaper .cl-sheet') };
    app24.host = await st(() => { window.RecruitApp.prepareChecklistSheet(true); return true; }) && await sheet24(page, '#clSheet .cl-sheet');
    await st(() => window.RecruitApp.prepareChecklistSheet(false));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await wait(150);
    app24.dark = await sheet24(page, '#appPaper .cl-sheet');
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await wait(150);
    const box24 = await page.evaluate(() => { const b = document.querySelector('#appPaper .cl-stamps .stamp-box'); const cs = getComputedStyle(b);
      return { dir: cs.flexDirection, h: Math.round(b.getBoundingClientRect().height), meta: getComputedStyle(b.querySelector('.stamp-meta')).textAlign }; });
    const dec24 = await page.evaluate(() => { const v = document.querySelector('#appPaper .cl-dec-v'), rc = document.querySelector('#appPaper .cl-decision svg rect');
      return { text: v.textContent, color: getComputedStyle(v).color, style: v.getAttribute('style'), stroke: rc && rc.getAttribute('stroke') }; });
    const saved24 = await saveRecord('review-d-paper.html');
    const rp24 = await newReportPage(e24);
    await rp24.setViewportSize({ width: 1440, height: 1000 });
    await rp24.goto('file://' + saved24.file);
    await rp24.waitForTimeout(400);
    const sv24 = await sheet24(rp24, '#a4 .cl-sheet');
    //   保存 HTML の窓で「不採用」に変えると、用紙の文字は赤（スタンプは藍）
    await openDecision(rp24);
    await popSel(rp24, SASA);
    await popAct(rp24, 'decide', 'reject');
    if (await rp24.$('#a4Pop')) await popAct(rp24, 'close');
    const decR24 = await rp24.evaluate(() => { const v = document.querySelector('#a4Decision .cl-dec-v'), rc = document.querySelector('#a4Decision svg rect');
      return { text: v.textContent, color: getComputedStyle(v).color, style: v.getAttribute('style'), stroke: rc && rc.getAttribute('stroke'), tile: getComputedStyle(document.querySelector('#a4 .cl-tile-res .cl-tile-v')).color }; });
    await rp24.close();
    const d24 = { light: diff24(app24.light, sv24), host: diff24(app24.host, sv24), dark: diff24(app24.dark, sv24) };
    expect(!!sv24 && sv24.length > 200 && !d24.light.length && !d24.host.length && !d24.dark.length && box24.dir === 'row' && box24.meta === 'left',
      'E24 (1) アプリの報告書の紙・印刷ホストの用紙は、保存 HTML の用紙とすべての要素の計算されたスタイルが同じ（押印行は横並び・左寄せのまま。ダークでも同じ）: ' +
      JSON.stringify({ n: sv24 && sv24.length, box24, light: d24.light.slice(0, 5), host: d24.host.slice(0, 5), dark: d24.dark.slice(0, 5) }));
    expect(dec24.text === '採用' && dec24.color === 'rgb(20, 108, 67)' && !dec24.style && dec24.stroke === '#c8232c' &&
      decR24.text === '不採用' && decR24.color === 'rgb(180, 35, 24)' && !decR24.style && decR24.stroke === '#1f4e8c' && e24.length === 0,
      'E24 (1) 用紙の最終合否の文字は意味の色（採用＝緑 #146c43・不採用＝赤 #b42318。style で色を付けない）・スタンプの絵だけがインク（朱 #c8232c・藍 #1f4e8c）: ' + JSON.stringify({ dec24, decR24, e24 }));

    // (2) トースト（docs/DESIGN.md 3-13）: 幅は文に合わせて最大 560・狭い画面は左右 16 の余白まで広がる（390px で画面の半分の幅・4 行にしない）。
    //   中心は本文の列（.main。サイドバーを除いた範囲）の中心（サイドバーに掛からない）。必須条件を確かめずに［次へ］を押したときの案内（40 字）で測る
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: 'トースト 確認' });
    await page.click('#saNext');
    await wait(300);
    const t24 = {};
    for (const [w, h] of [[390, 844], [841, 900], [1366, 768], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      await wait(150);
      await ivGo('continuity');
      await ivGo('conditions');
      await page.click('#ivNext');
      await wait(250);
      t24[w] = await page.evaluate(() => { const t = document.getElementById('toast'), r = t.getBoundingClientRect(), m = document.querySelector('.main').getBoundingClientRect(), lh = parseFloat(getComputedStyle(t).lineHeight);
        const pad = parseFloat(getComputedStyle(t).paddingTop) + parseFloat(getComputedStyle(t).paddingBottom);
        return { sec: document.getElementById('ivStage').dataset.sec, show: t.classList.contains('show'), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), lines: Math.round((r.height - pad) / lh),
          mid: Math.round(r.left + r.width / 2), mainMid: Math.round(m.left + m.width / 2), mainL: Math.round(m.left), vw: innerWidth }; });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
    expect(Object.keys(t24).length === 4 && Object.values(t24).every(x => x.sec === 'conditions' && x.show && Math.abs(x.mid - x.mainMid) <= 1 && x.l >= x.mainL + 16 && x.r <= x.vw - 16 && x.w <= 560) &&
      t24[390].w >= 390 - 32 - 1 && t24[390].lines <= 2 && t24[1440].w === 560 && t24[1366].lines <= 2,
      'E24 (2) トーストは本文の列の下中央（サイドバーに掛からない）・幅は最大 560・390px では左右 16 の余白まで広がって 2 行（画面の半分の幅・4 行にしない）: ' + JSON.stringify(t24));

    // (3) 評価の結果カード（docs/DESIGN.md 4-4・1-5）: 390・360px でも「⚠ 面接時間を確かめてください（タイマー 6分12秒・目安 41分）→ 面接時間の欄へ」は 1 つの文として流れる
    //   （行き先「面接時間の欄へ」は割れない・行の頭に長音「ー」を置かない・⚠ は 1 行目）。未入力の数が 2 行に折れても ⚠ は 1 行目（文字だけのボタンの行の中央）
    await st(() => { const t = window.RecruitApp.state.checklist.timing; t.perStage = { conditions: 372 }; t.stage = 'conditions'; });
    const ev24 = {};
    for (const w of [390, 360, 1366]) {
      await page.setViewportSize({ width: w, height: 844 });
      await goTo(3);
      await page.evaluate(() => window.scrollTo(0, 0));
      await wait(150);
      ev24[w] = await page.evaluate(() => {
        const tw = document.getElementById('evTimeWarn'), t = tw.querySelector('.ev-tw-t'), to = tw.lastElementChild, al = tw.querySelector('svg.ico');
        //   1 文字ずつの位置で行を数える: 行（上端）ごとの最初の文字と上端・左端（flex の項目に分かれていても数えられる）
        const lines = (el) => { const tn = el.firstChild, out = [];
          for (let i = 0; tn && i < tn.length; i++) { const rg = document.createRange(); rg.setStart(tn, i); rg.setEnd(tn, i + 1); const rr = rg.getBoundingClientRect();
            if (!out.length || rr.top > out[out.length - 1].top + 8) out.push({ ch: tn.data[i], top: rr.top, bottom: rr.bottom, left: rr.left }); }   // 次の行（欧文と和文の字の箱の高さの差は 8px 未満）
          return out; };
        const tl = lines(t), ol = lines(to), ar = al.getBoundingClientRect();
        const m = document.getElementById('evMissing'), mi = m.querySelector('svg.ico').getBoundingClientRect(), mb = m.querySelector('.link-btn');
        const mbR = mb ? mb.getBoundingClientRect() : null;
        return { text: t.textContent, to: to.textContent, lines: tl.length, heads: tl.slice(1).map(x => x.ch).join(''), toLines: ol.length,
          //   行き先は文の最後の行の続き（同じ行の右か、次の行。文の 1 行目の横の別の列にしない）
          flow: ol.length === 1 && ol[0].top >= tl[tl.length - 1].top - 1,
          alertFirst: Math.abs((ar.top + ar.height / 2) - (tl[0].top + tl[0].bottom) / 2) <= 2,
          missIcoMid: Math.round(mi.top + mi.height / 2), missFirstMid: mbR ? Math.round(mbR.top + mbR.height / 2) : null };
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    expect(Object.keys(ev24).length === 3 && Object.values(ev24).every(x => /^面接時間を確かめてください（タイマー 6分12秒・目安 41分）$/.test(x.text) && x.to === '面接時間の欄へ' && x.toLines === 1 && x.flow &&
      x.heads.indexOf('ー') < 0 && x.alertFirst && x.missFirstMid !== null && Math.abs(x.missIcoMid - x.missFirstMid) <= 1) && ev24[390].lines >= 2 && ev24[1366].lines === 1,
      'E24 (3) 評価の結果カード（390・360・1366px）: 面接時間の案内は 1 つの文（「面接時間の欄へ」は割れない・行の頭に「ー」なし・⚠ は 1 行目）・未入力の数の ⚠ は 1 行目の中央: ' + JSON.stringify(ev24));

    // (4) ［次へ：② 継続性・報連相 →］の文字は 1 つのまとまり（docs/DESIGN.md 3-1）: 「：」の直後に番号の丸・丸と段階の名前の間 4・丸と名前の縦の中心が同じ。
    //   面接の見出しの応募者は氏名と「さん」の間 4（右サマリー・トップバーと同じ）。ラベル（見える文字）は同じ
    await goTo(2);
    await ivGo('conditions');
    const nx24 = await page.evaluate(() => {
      const b = document.getElementById('ivNext'), lbl = b.querySelector('.lbl-nb'), nb = b.querySelector('.nb'), t = b.querySelector('.lbl-t'), r = (e) => e.getBoundingClientRect();
      const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let cn = tw.nextNode(); while (cn && cn.nodeValue.indexOf('次へ：') < 0) cn = tw.nextNode();
      const rg = document.createRange(); rg.selectNodeContents(cn); const colon = rg.getBoundingClientRect();
      const wb = document.querySelector('#ivWho b'), ws = wb && wb.nextElementSibling;
      return { lbl: window.__lbl(b), one: !!lbl && lbl.contains(nb) && lbl.contains(t) && lbl.firstChild === cn, colonGap: +(r(nb).left - colon.right).toFixed(1), nbGap: +(r(t).left - r(nb).right).toFixed(1),
        mid: +Math.abs((r(nb).top + r(nb).height / 2) - (r(t).top + r(t).height / 2)).toFixed(1),
        who: window.__lbl(document.getElementById('ivWho')), whoGap: ws ? +(ws.getBoundingClientRect().left - wb.getBoundingClientRect().right).toFixed(1) : null };
    });
    expect(nx24.lbl === '次へ：② 継続性・報連相 [arrow-right]' && nx24.one && nx24.colonGap >= -0.5 && nx24.colonGap <= 1 && Math.abs(nx24.nbGap - 4) <= 0.5 && nx24.mid <= 1 &&
      nx24.who === 'トースト 確認さん' && Math.abs(nx24.whoGap - 4) <= 0.5,
      'E24 (4) ［次へ：② 継続性・報連相 →］は「：」の直後に番号の丸・丸と名前の間 4・縦の中心が同じ／面接の見出しの氏名と「さん」の間 4: ' + JSON.stringify(nx24));

    // (5) 準備の選択の文字は 1181〜1440px でも切れない（docs/DESIGN.md 0-4・4-2）: 面接担当者（名簿の「笹川 晴央（副支配人）」）・性別と区分の未選択の文言「選択」。
    //   2 行目は 面接日・面接担当者（広い）・応募した求人（［通常｜短期］がはみ出さない）
    await goTo(1);
    await page.selectOption('[data-cl="header.interviewer"]', { label: SASA });
    const sel24 = [];
    for (const [w, h] of [[1181, 800], [1280, 800], [1366, 768], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      await wait(150);
      sel24.push(await page.evaluate((w) => {
        const sp = document.createElement('span'); sp.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'; document.body.appendChild(sp);
        const fit = (s) => { const cs = getComputedStyle(s); sp.style.font = cs.font; sp.textContent = s.selectedOptions[0].text; const tw = sp.getBoundingClientRect().width;
          const room = s.getBoundingClientRect().width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return { t: s.selectedOptions[0].text, ok: tw <= room + 0.5, tw: Math.round(tw), room: Math.round(room) }; };
        const seg = document.querySelector('#saPosting .seg');
        const o = { w, iv: fit(document.getElementById('saInterviewer')), gender: fit(document.querySelector('select[data-field="gender"]')), cat: fit(document.querySelector('select[data-field="category"]')),
          seg: !!seg && seg.scrollWidth <= seg.clientWidth + 1 && Array.from(seg.children).every(b => b.scrollWidth <= b.clientWidth + 1),
          oneRow: (() => { const t = Array.from(document.querySelectorAll('.sa-row2 > .field')).map(f => Math.round(f.getBoundingClientRect().top)); return t.length === 3 && t.every(x => x === t[0]); })() };
        sp.remove();
        return o;
      }, w));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    expect(sel24.every(x => x.iv.t === SASA && x.iv.ok && x.gender.t === '選択' && x.gender.ok && x.cat.t === '選択' && x.cat.ok && x.seg && x.oneRow),
      'E24 (5) 準備の選択は 1181・1280・1366・1440px で文字が切れない（面接担当者「笹川 晴央（副支配人）」・性別と区分の「選択」）・2 行目は 1 行で［通常｜短期］もはみ出さない: ' + JSON.stringify(sel24));

    // (6) 必須条件の不一致で打ち切ったとき（docs/DESIGN.md 3-3・0-3 の 2・7-4）: 省略できる段階（②〜④。点線の枠・「省略可」）の「説明：していない」は中立（--text-2・400・⚠ なし）。
    //   実際に行う段階（① と案内先の ⑤）の「していない」「伝えていない」は琥珀＋⚠ のまま。評価で必須条件を一致に戻すと ②〜④ も琥珀に戻る
    // (7) 同じ記録の人物像（docs/SPEC-flow.md F15）: 打ち切りのときは人物像を判定に使わない（任意）ので、合計の札は中立の「未入力 n（任意）」（琥珀の「上長最終判断要まで」を出さない）・
    //   1 点の警告に「結果は…になります」を付けない。一致に戻すと「未入力 n・上長最終判断要まで」（琥珀）と「結果は上長最終判断要以下になります」に戻る
    await goTo(2);
    await ivGo('conditions');
    await page.click('[data-action="cl-set"][data-cl="values.must_busy"][data-value="mismatch"]');
    await wait(150);
    await goTo(3);
    const skip24 = () => page.evaluate(() => {
      const ref = (v) => { const x = document.createElement('span'); x.style.color = 'var(' + v + ')'; document.body.appendChild(x); const c = getComputedStyle(x).color; x.remove(); return c; };
      const T2 = ref('--text-2'), W = ref('--warn-text');
      const said = (sec) => Array.from(document.querySelectorAll('#cl-' + sec + ' .ev-said .kv-v')).map(v => { const cs = getComputedStyle(v), ic = v.querySelector('svg.ico');
        return (cs.color === T2 ? 'neutral' : cs.color === W ? 'warn' : cs.color) + ':' + cs.fontWeight + ':' + (ic && ic.checkVisibility() ? 'ico' : 'noico'); }).join(',');
      const ps = document.getElementById('clPsState');
      return { skip: Array.from(document.querySelectorAll('.cl-skippable')).map(e => e.dataset.sec).join(','), s1: said('conditions'), s2: said('continuity'), s3: said('job'), s4: said('teamwork'), s5: said('reverse'),
        ps: (ps.classList.contains('hidden') ? 'hidden|' : '') + ps.className.replace('hidden', '').trim() + '|' + ps.textContent,
        warnBadges: Array.from(document.querySelectorAll('#stepContent .badge.warn')).filter(b => b.checkVisibility()).map(b => b.textContent).join(','),
        psWarn: document.getElementById('clPsWarn').classList.contains('hidden') ? '' : document.getElementById('clPsWarnText').textContent };
    });
    const sk24 = { gate: await skip24() };
    await page.click('#clPersona [data-action="ps-set"][data-score="1"]');
    await wait(150);
    sk24.gateOne = await skip24();
    await st(() => { const A = window.RecruitApp, p = A.state.profile.checklist.persona; p.items.forEach(it => { A.state.checklist.persona[it.id] = 4; }); });
    await page.click('#clPersona [data-action="ps-set"][data-score="3"]');   // 1 行目を 3 に（描き直し）
    await wait(150);
    sk24.gateAll = await skip24();
    await st(() => { const A = window.RecruitApp; A.state.checklist.persona = {}; });
    await page.click('#cl-conditions [data-action="cl-set"][data-cl="values.must_busy"][data-value="match"]');
    await wait(150);
    await page.click('#clPersona [data-action="ps-set"][data-score="1"]');
    await wait(150);
    sk24.match = await skip24();
    expect(sk24.gate.skip === 'continuity,job,teamwork' && sk24.gate.s1 === 'warn:700:ico' && ['s2', 's3', 's4'].every(k => sk24.gate[k] === 'neutral:400:noico') && sk24.gate.s5 === 'warn:700:ico' &&
      sk24.match.skip === '' && ['s2', 's3', 's4'].every(k => sk24.match[k] === 'warn:700:ico'),
      'E24 (6) 打ち切りのとき、省略できる段階（②〜④）の「していない」は中立（--text-2・400・⚠ なし）・① と ⑤ は琥珀＋⚠・一致に戻すと ②〜④ も琥珀＋⚠: ' + JSON.stringify(sk24));
    expect(sk24.gate.ps === 'badge|未入力 7（任意）' && sk24.gate.warnBadges === '' && sk24.gateOne.ps === 'badge|未入力 6（任意）' && sk24.gateOne.psWarn === '1 点の項目があります（挨拶）。' &&
      sk24.gateAll.ps.indexOf('hidden|') === 0 && sk24.gateAll.warnBadges === '' &&
      sk24.match.ps === 'badge warn|未入力 6・上長最終判断要まで' && sk24.match.psWarn === '1 点の項目があります（挨拶）。結果は上長最終判断要以下になります。',
      'E24 (7) 打ち切りのときの人物像の札は中立の「未入力 n（任意）」（全部入れたら出さない・琥珀の札なし）・1 点の警告に結果を書かない／一致に戻すと「未入力 n・上長最終判断要まで」（琥珀）: ' + JSON.stringify(sk24));

    // (8) 設定（docs/DESIGN.md 3-5・1-4）: 得点率・帯の境界の欄も単位「%」は欄の中の右（.input-unit。目安の「分」と同じ）・説明は欄の右。
    //   見本・ラベルのコロンは全角（「例：」「面接評価の帯：高」。サイドバーの「判定ルール：」も）・チェックボックスの文は本文と同じ 15/400
    await toView('settings');
    await page.evaluate(() => document.querySelectorAll('#view-settings details').forEach(d => { d.open = true; }));
    await wait(150);
    const set24 = await page.evaluate(() => {
      const unit = (b) => { const i = document.querySelector('[data-bind="' + b + '"]'), u = i && i.closest('.input-unit'), un = u && u.querySelector('.unit'), f = i && i.closest('.field');
        if (!un) return { b, ok: false };
        const ir = i.getBoundingClientRect(), ur = un.getBoundingClientRect(), suf = (f.querySelector('.suffix') || {}).textContent || '';
        return { b, ok: un.textContent === '%' && ur.left >= ir.left && ur.right <= ir.right && ur.top >= ir.top && ur.bottom <= ir.bottom, label: f.querySelector('label').textContent, suf: suf.slice(0, 4) }; };
      const txt = [], v = document.getElementById('view-settings');
      const w = document.createTreeWalker(v, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) if (/例: |帯: /.test(n.nodeValue)) txt.push(n.nodeValue.trim().slice(0, 20));
      v.querySelectorAll('[placeholder]').forEach(e => { if (/例: /.test(e.placeholder)) txt.push('ph:' + e.placeholder.slice(0, 20)); });
      return { units: ['checklist.persona.keepPct', 'checklist.persona.rejectBelowPct', 'evaluation.thresholds.recommendPct', 'evaluation.thresholds.reviewPct'].map(unit), half: txt,
        ver: (document.querySelector('[data-bind="checklist.version"]').closest('.field').querySelector('label') || {}).textContent,
        checks: Array.from(v.querySelectorAll('.check-row .lbl')).map(e => getComputedStyle(e).fontSize + '/' + getComputedStyle(e).fontWeight), side: document.getElementById('brandVersion').textContent };
    });
    await toView('judge');
    expect(set24.units.every(x => x.ok && !/^%/.test(x.suf)) && set24.units[2].label === '面接評価の帯：高' && set24.units[3].label === '面接評価の帯：中' && set24.half.length === 0 &&
      set24.ver === '版（例：2026-10-08）' && set24.checks.length >= 5 && set24.checks.every(x => x === '15px/400') && set24.side.includes('判定ルール：'),
      'E24 (8) 設定: 得点率・帯の境界の「%」は欄の中の右・コロンは全角（「例：」「面接評価の帯：高」・サイドバー「判定ルール：」）・チェックボックスの文は 15/400: ' + JSON.stringify(set24));

    // (9) 報告書の［取消］の位置（docs/DESIGN.md 3-14・0-3 の 8）: 最終合否の［取消］は見出し帯ではなく［採用｜不採用］の下の行の右端（押印の欄の［押印］の下の［取消］と同じ関係: 8px 下・右端がそろう）。
    //   Tab は 担当者 → 採用 → 不採用 → 取消。390px でも帯は 1 行（押印のカードと同じ高さ）
    await goTo(4);
    await page.click('#mgmtCard .stamp-box[data-field-id="interviewer"] [data-action="stamp"]');
    await wait(150);
    await page.selectOption('#decisionManager', { label: SASA });
    await page.click('#decisionCard [data-action="decide"][data-value="hire"]');
    await wait(300);
    const undo24 = async () => page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const u = document.querySelector('#decisionCard [data-action="undecide"]'), seg = document.querySelector('#decisionCard .decision-ctl .seg');
      const sb = document.querySelector('#mgmtCard .stamp-box[data-field-id="interviewer"]'), su = sb.querySelector('[data-action="unstamp"]'), sbtn = sb.querySelector('[data-action="stamp"]'), sctl = sb.querySelector('.stamp-ctl');
      return { inBand: !!u.closest('.card-band'), dy: Math.round(r(u).top - r(seg).bottom), dr: Math.round(r(u).right - r(seg).right), sdy: Math.round(r(su).top - r(sbtn).bottom), sdr: Math.round(r(su).right - r(sctl).right),
        band: Math.round(r(document.querySelector('#decisionCard .card-band')).height), mband: Math.round(r(document.querySelector('#mgmtCard .card-band')).height) };
    });
    const un24 = { w1440: await undo24() };
    await page.focus('#decisionManager');
    un24.tab = [];
    for (let k = 0; k < 3; k++) { await page.keyboard.press('Tab'); un24.tab.push(await page.evaluate(() => { const a = document.activeElement; return a.dataset.action + (a.dataset.value ? ':' + a.dataset.value : ''); })); }
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(250);
    un24.w390 = await undo24();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await wait(150);
    expect(!un24.w1440.inBand && un24.w1440.dy >= 8 && un24.w1440.dy <= 12 && Math.abs(un24.w1440.dr) <= 1 && un24.w1440.sdy === 8 && Math.abs(un24.w1440.sdr) <= 1 &&
      un24.tab.join(' ') === 'decide:hire decide:reject undecide' && !un24.w390.inBand && un24.w390.band === un24.w390.mband && un24.w390.dy >= 8 && Math.abs(un24.w390.dr) <= 1,
      'E24 (9) 最終合否の［取消］は［採用｜不採用］の下の行の右端（押印の欄の［取消］と同じ関係・見出し帯の中に置かない）・Tab は 採用 → 不採用 → 取消・390px でも帯は 1 行: ' + JSON.stringify(un24));

    // (10) キーボードで［次へ］（docs/SPEC-flow.md 16-10）: 確かめていない必須条件が残っているとき、Enter（Space）で押した 1 回目は進まずに未確認の行を出して琥珀・案内を出すが、
    //   フォーカスは［次へ］に残る（［一致］へ移さない）。もう一度 Enter（Space）で ② へ進み、必須条件は未確認のまま（一致にならない）。
    //   面接のボタンの上の Enter の押しっぱなし（キーリピート）は 1 回だけ: ［次へ］は 1 回目の案内で止まったまま・［一致］は付いたまま（付いたり外れたりしない）
    await page.click('#btnNew');
    await wait(200);
    await fillScript({ name: 'キー 確認' });
    await page.click('#saNext');
    await wait(300);
    const kb24 = () => page.evaluate(() => { const a = document.activeElement, v = window.RecruitApp.state.checklist.values;
      return { sec: document.getElementById('ivStage').dataset.sec, act: a.id || ((a.dataset || {}).cl + ':' + (a.dataset || {}).value), weekly: v.must_weekly || '', busy: v.must_busy || '',
        amber: Array.from(document.querySelectorAll('#ivStage .cl-must-row.is-missing')).map(e => e.dataset.item).join(','), toast: document.getElementById('toast').classList.contains('show') }; });
    //   毎回 ① の必須条件を未確認に戻し、段階を移って案内を出し直してから（ivMustHold は段階を表示しているあいだ 1 回）
    const reset24 = async () => { await st(() => { const v = window.RecruitApp.state.checklist.values; delete v.must_weekly; delete v.must_busy; }); await ivGo('continuity'); await ivGo('conditions'); };
    const k24 = {};
    for (const key of ['Enter', ' ']) {
      await reset24();
      await page.focus('#ivNext');
      await page.keyboard.press(key);
      await wait(250);
      k24[key === ' ' ? 'space1' : 'enter1'] = await kb24();
      await page.keyboard.press(key);
      await wait(250);
      k24[key === ' ' ? 'space2' : 'enter2'] = await kb24();
    }
    await reset24();
    await page.focus('#ivNext');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');   // キーリピート（押しっぱなし）
    await page.keyboard.up('Enter');
    await wait(250);
    k24.hold = await kb24();
    await reset24();
    await page.focus('#ivStage [data-action="cl-set"][data-cl="values.must_weekly"][data-value="match"]');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');   // キーリピート
    await page.keyboard.up('Enter');
    await wait(200);
    k24.holdMatch = await kb24();
    expect(k24.enter1.sec === 'conditions' && k24.enter1.act === 'ivNext' && k24.enter1.weekly === '' && k24.enter1.amber === 'must_weekly,must_busy' && k24.enter1.toast &&
      k24.enter2.sec === 'continuity' && k24.enter2.weekly === '' && k24.enter2.busy === '' &&
      k24.space1.sec === 'conditions' && k24.space1.act === 'ivNext' && k24.space1.weekly === '' && k24.space2.sec === 'continuity' && k24.space2.weekly === '' &&
      k24.hold.sec === 'conditions' && k24.hold.act === 'ivNext' && k24.hold.weekly === '' && k24.hold.toast &&
      k24.holdMatch.sec === 'conditions' && k24.holdMatch.weekly === 'match' && k24.holdMatch.busy === '',
      'E24 (10) キーボードで［次へ］: 1 回目は進まずに未確認の行を琥珀・案内（フォーカスは［次へ］のまま）・もう一度で ② へ（必須条件は未確認のまま。Enter・Space）・' +
      'Enter の押しっぱなしは 1 回だけ（［次へ］は案内で止まったまま・［一致］は付いたまま）: ' + JSON.stringify(k24));
    await page.evaluate(() => document.getElementById('toast').classList.remove('show'));
  }

  await fresh();

  expect(errors.length === 0, 'ERRORS: ' + (errors.length ? JSON.stringify(errors) : 'none'));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  console.log('\n' + (fails.length ? fails.length + ' FAILED:\n - ' + fails.join('\n - ') : 'ALL PASSED'));
  if (fails.length) process.exit(1);
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
