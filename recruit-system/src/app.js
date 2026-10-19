/*
 * 画面制御
 * ----------------------------------------------------------------------
 * 4 ステップ（docs/SPEC-flow.md）: 1 準備 → 2 面接（台本の ①〜⑤ を 1 段階ずつ。話す → 聞く → 確かめる・タイマー）→ 3 評価（面接のあとに ○△×・人物像・総合判断）→ 4 報告書。
 * state.step・data-step・record.step の内部キーは表示番号と同じ 1〜4（2026-10-16 より前の記録の step 3 は旧 ②＝面接チェックリスト。再開先は applyRecord が決める）。
 * 2026-10-14 の面接特化で削除した機能は docs/SPEC-slim.md と docs/HANDOFF.md の「削除済み機能」を参照。
 * 右側のサマリーパネルは準備と報告書だけに出し、入力のたびに更新する（面接・評価は 1 列で広く使う）。
 * 判定ロジックは rules.js の公開関数を使い、UI 側に重複させない。
 */
;(function (global) {
  'use strict';

  const U = global.RecruitUtil;
  const R = global.RecruitRules;
  const S = global.RecruitStorage;
  const Settings = global.RecruitSettings;
  const esc = U.esc;
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------- デザインシステムの部品（docs/DESIGN.md 2〜3 章） ----------
  //   アイコン（index.html の <symbol id="i-…">）・テストと読み上げの互換のために textContent に残す記号（.sym。見た目は消す）・番号の丸（.nb。中の丸数字は見た目だけ消す）。
  //   <use> は閉じタグで書く（ブラウザが返す innerHTML と同じ形。比べて同じなら入れ直さない所があるため）
  function ico(id, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + id + '"></use></svg>'; }
  function sym(s) { return '<span class="sym" aria-hidden="true">' + s + '</span>'; }
  //   台本の記号 ○△× は和文のフォントで描く（.ja。Segoe UI には × だけがあり、× だけ小さい欧文の形になるため。docs/DESIGN.md 1-4）。esc 済みの文に使う
  function jaMarks(h) { return String(h).replace(/[○△×]+/g, function (m) { return '<span class="ja">' + m + '</span>'; }); }
  //   deco: 飾り（リストの番号など。読み上げない・中の文字なし）
  function nbHtml(n, mark, cls, deco) { return '<span class="nb' + (cls ? ' ' + cls : '') + '" data-no="' + esc(n) + '"' + (deco ? ' aria-hidden="true"' : '') + '>' + esc(mark) + '</span>'; }
  // 丸数字（①）→ 番号の丸の部品（文の中の丸数字はそのまま。画面の部品の番号だけ）
  function nbOf(mark, cls) { const k = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.indexOf(String(mark)); return nbHtml(k >= 0 ? k + 1 : String(mark).replace(/\D/g, '') || '?', mark, cls); }
  // カード（見出し帯＋本文。docs/DESIGN.md 3-2）。o: { id, cls, attrs, icon, no（帯の番号の部品の HTML）, title（HTML）, titleId, titleCls, titleInner, small, meta（HTML）, metaCls, badge（HTML）, actions（HTML）, actCls }
  function cardHtml(o, body) {
    const hid = o.titleId || (o.id ? o.id + 'H' : '');
    return '<section class="card' + (o.cls ? ' ' + o.cls : '') + '"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + (o.attrs || '') + (hid ? ' aria-labelledby="' + esc(hid) + '"' : '') + '>' +
      '<header class="card-band">' + (o.icon ? ico(o.icon) : '') + (o.no || '') +
        '<h3 class="card-title' + (o.titleCls ? ' ' + o.titleCls : '') + '"' + (hid && !o.titleInner ? ' id="' + esc(hid) + '"' : '') + '>' +
          (o.titleInner ? '<span id="' + esc(hid) + '">' + o.title + '</span>' : '<span>' + o.title + '</span>') + (o.small ? '<small>' + o.small + '</small>' : '') + '</h3>' +
        (o.meta ? '<span class="card-meta' + (o.metaCls ? ' ' + o.metaCls : '') + '">' + o.meta + '</span>' : '') + (o.badge || '') +
        (o.actions ? '<div class="card-actions' + (o.actCls ? ' ' + o.actCls : '') + '">' + o.actions + '</div>' : '') +
      '</header><div class="card-body">' + body + '</div></section>';
  }

  // n は内部キー（state.step）、no は表示番号（docs/SPEC-flow.md 1-1。同じ値）
  const STEPS = [
    { n: 1, no: 1, label: '準備', hint: '応募者の名前と面接の情報' },
    { n: 2, no: 2, label: '面接', hint: '話す → 聞く → 確かめる' },   // カードの名前と順番（サイドバーで 1 行に入る長さ）
    { n: 3, no: 3, label: '評価', hint: '面接のあとに ○△×・人物像・総合判断' },
    { n: 4, no: 4, label: '報告書', hint: '押印・合否・保存' }
  ];
  // 各ステップの最上部の「この画面ですること」（1 行）。準備・評価・報告書は stepLeadText が今の記録・設定に合わせる
  const STEP_LEAD = {
    1: '応募者の名前と面接の情報を入れて、「面接を始める」を押します。',
    2: '台本どおりに 話す → 聞く → 確かめる（答えはメモ）。○△× などの評価は面接のあとで付けます。',
    3: '面接のメモを見ながら、○△×・人物像・総合判断を付けます。',
    4: '「面接対応者」に押印して、報告書を保存（HTML）します（最終確認・最終合否は副支配人が押します）。'
  };
  // 画面のボタン名・設定に合わせる: 準備は主ボタンの名前（面接を始める／面接に戻る／評価に戻る／報告書に戻る。docs/SPEC-flow.md 15 章）、
  //   評価は人物像を使わない設定・記録では人物像を言わない（14 章）、報告書は押印欄・最終合否の名前を設定から（15 章）
  function stepLeadText(n) {
    if (n === 1) {
      const x = prepNext();
      if (!x.fresh) return '応募者の名前と面接の情報を確かめて、「' + x.label + '」を押します。';
      const s0 = ivSections()[0];
      return STEP_LEAD[1] + (x.preview && s0 ? '下見で動いたタイマーは 0 に戻り、' + s0.noMark + ' ' + s0.title + 'から始まります。' : '');
    }
    if (n === 3) return '面接のメモを見ながら、' + evalWhatText(true) + 'を付けます。';
    if (n === 4) return reportLeadText();
    return STEP_LEAD[n] || '';
  }
  // 報告書の 1 行・はじめての方への手順 4（docs/SPEC-flow.md 15 章）: 面接者が押すのは「面接対応者」の欄だけ（最終確認・最終合否は副支配人が保存した HTML で押す）。
  //   名前は設定の押印欄（台本の interviewerField の欄）と最終合否から。short: はじめての方へ用の短い文（4 つの手順は各 2 行まで）
  function reportLeadText(short) {
    const mg = state.profile.management || {};
    const fields = (Array.isArray(mg.fields) ? mg.fields : []).filter(function (f) { return U.isObj(f) && f.id; });
    const ivId = (clDefNow().header || {}).interviewerField || 'interviewer';
    const ivF = fields.find(function (f) { return f.id === ivId; });
    const ivName = ivF ? '「' + String(ivF.label || ivF.id) + '」' : '';
    if (short) return ivName ? ivName + 'だけ押印して保存' : '押印して保存';
    const others = fields.filter(function (f) { return f !== ivF; }).map(function (f) { return String(f.label || f.id); });
    const d = decisionCfg();
    if (d.enabled) others.push(String(d.label || '最終合否'));
    return (ivName ? ivName + 'に押印して' : '押印して') + '、報告書を保存（HTML）します' + (others.length ? '（' + others.join('・') + 'は副支配人が押します）' : '') + '。';
  }
  function stepLeadHtml(n) {
    return '<p class="step-lead" id="stepLead"><b>この画面ですること</b><span>' + jaMarks(esc(stepLeadText(n))) + '</span></p>';
  }
  // 評価の画面で付けるもの（○△×・人物像・総合判断）。forRecord: 今の記録で人物像を使うか（人物像の導入前の記録は使わない）。それ以外は設定で使うか
  function evalWhatText(forRecord) {
    const ps = forRecord ? !!R.personaModel(clDefNow(), ensureChecklist()) : personaOnNow();
    return '○△×・' + (ps ? '人物像・' : '') + '総合判断';
  }
  // 準備の主ボタンの行き先と名前（docs/SPEC-flow.md 15 章）。
  //   回答（面接・評価の入力と面接所見）が無ければ「面接を始める」: 本番の前に面接の画面を下見して戻っても、押すと下見のタイマーを 0 に戻して最初の段階から数える（fresh。preview は下見したか）。
  //   回答があれば 報告書まで進んだ →「報告書に戻る」／評価まで →「評価に戻る」（氏名を直しに来ても面接のタイマーを動かさない）／面接の途中 →「面接に戻る」
  function prepNext() {
    if (!ivHasAnswers()) return { step: 2, label: '面接を始める', fresh: true, preview: !!ivTimingRead().startedAt };
    if (state.maxStepReached >= 4) return { step: 4, label: '報告書に戻る' };
    if (state.maxStepReached >= 3) return { step: 3, label: '評価に戻る' };
    return { step: 2, label: '面接に戻る' };
  }
  function ivHasAnswers() { return R.checklistHasInput(state.checklist) || !!String(state.interviewNotes || '').trim(); }

  const state = {
    view: 'judge',
    step: 1,
    maxStepReached: 1,
    profile: null,
    applicant: null,       // { name, gender, age, category, graduationDate, reviewerNotes }（すべて文字列）
    checklist: null,       // 面接チェックリストの回答（docs/SPEC-checklist.md 1-4・docs/SPEC-flow.md 6 章）。init / newRecord / applyRecord で作る
    interviewNotes: '',
    judgment: null,
    judgmentStale: false,  // 判定後に入力・設定が変わり、判定のやり直しが必要（state.judgment は null）
    management: {},        // 応募者の管理（押印）: { interviewer: { name, short, title, date, at }, final: { ... } }
    decision: null,        // 最終合否（人の決定）: { result, label, date, at, by }。判定とは独立。再判定で消さない（「取消」でだけ消える）
    fileLock: null,        // 読み込んだ保存 HTML の最終承認のロック（{ salt, hash }）。アプリにロックが無いとき、この記録の最終確認・最終合否と保存し直すファイルに使う（docs/SPEC-a4.md 11 章 L7b）
    ivItems: {},           // 面接の「一部説明しなかった」を開いているか（段階 id + ':' + explain|notify → true/false。画面の状態だけ。記録に入れない）
    ivNoTimer: false,      // タイマー導入前（2026-10-16 より前）に回答して保存した記録を読み込んだ: 面接の画面を開いても面接時間を数えない（直した時間を面接時間にしない。docs/SPEC-flow.md 14 章）
    savedAt: null,
    dirty: false
  };

  const RESULT_TONE = { recommend: 'ok', review: 'warn', reject: 'danger' };
  const BAND_TONE = { high: 'ok', mid: 'warn', low: 'danger' };
  const V1_RESET_MSG = '古い形式のため既定の設定を使います（劇場名・名簿などは設定画面で入れ直してください）。';
  const FULL_MODE_REMOVED_MSG = '詳細モードは終了しました。準備 → 面接 → 評価 → 報告書の 4 ステップで開きます。';
  const MANNER_MOVED_MSG = '確認点「最低限の話し方、敬語が可能か」は人物像の「言葉遣い・説明のわかりやすさ」と重なるため、既定の台本から外しました。';
  // 保存済みの設定を読み込んだときの案内（docs/SPEC-slim.md 3-1・docs/SPEC-persona.md 1-6）
  function profileNotice(rep) {
    const msgs = [];
    if (rep.v1Reset) msgs.push(V1_RESET_MSG);
    if (rep.fullModeRemoved) msgs.push(FULL_MODE_REMOVED_MSG);
    if (rep.mannerMoved) msgs.push(MANNER_MOVED_MSG);
    return msgs.join(' ');
  }

  // =====================================================================
  // 初期化
  // =====================================================================
  function init() {
    const rep = {};
    state.profile = S.loadProfile(rep);
    state.applicant = emptyApplicant();
    state.checklist = R.emptyChecklist();
    injectChecklistSheetCss();
    applyTheme(S.loadTheme());
    renderBrand();
    bindGlobal();
    showView('judge');
    // 正規化した設定を保存し直す（削除した機能のキーを localStorage から消す。毎回 toast を出さないため）
    if (rep.v1Reset || rep.fullModeRemoved || rep.stripped) persistProfile(state.profile);
    else storedRaw = readStoredRaw();
    const notice = profileNotice(rep);
    if (notice) toast(notice);
  }

  // 用紙のスタイル（報告書 #clSheetCss・面接記入シート #paperSheetCss）を 1 回だけ <style> に入れる
  function injectChecklistSheetCss() {
    [['clSheetCss', S.checklistSheetCss], ['paperSheetCss', S.paperSheetCss]].forEach(function (x) {
      if (typeof x[1] !== 'function' || document.getElementById(x[0])) return;
      const st = document.createElement('style');
      st.id = x[0];
      st.textContent = x[1]();
      document.head.appendChild(st);
    });
  }

  function emptyApplicant() {
    return { name: '', gender: '', age: '', category: '', graduationDate: '', reviewerNotes: '' };
  }

  // ---------- 小さなヘルパー ----------
  function fmtNum(n) { return n == null || n === '' || isNaN(Number(n)) ? '—' : String(R.round1(Number(n))); }
  function resultTitle(r) { const t = (state.profile.texts || {})[r]; return (t && t.title) || r || ''; }
  function setText(sel, text) { const el = $(sel); if (el) el.textContent = text; }

  function bindGlobal() {
    // 画面幅が変わったら報告書の紙プレビューの縮小を合わせ直す。面接・評価の上の帯（sticky）の位置はトップバーの高さ（折り返しで変わる）に合わせる
    let paperRaf = 0, moreRaf = 0;
    window.addEventListener('resize', function () {
      syncFlowLayout();
      updateMore();
      if (paperRaf || !$('#appPaper')) return;
      paperRaf = requestAnimationFrame(function () { paperRaf = 0; fitReportPaper(); });
    });
    // 上の帯・操作行の高さが変わったら（必須条件の案内・結果カードの折り返し・メモの伸び）scroll-padding を測り直す（docs/DESIGN.md 3-11）
    if (window.ResizeObserver) {
      let roRaf = 0;
      const ro = new ResizeObserver(function () {
        if (roRaf) return;
        roRaf = requestAnimationFrame(function () { roRaf = 0; measureFlow(); updateMore(); });
      });
      ['.topbar', '#stepContent', '#stepFoot', '#view-settings'].forEach(function (s) { const el = $(s); if (el) ro.observe(el); });
    }
    // Tab の移動先が上の帯・操作行に少しでも掛かったら、帯の下（scroll-padding）まで送る（ブラウザは一部が見えていると動かさないことがあるため。docs/DESIGN.md 3-11）
    document.addEventListener('focusin', onFocusIn);
    // 面接・準備の「▼ 下にあと n 項目」はスクロールで見えたら消す（1 フレームに 1 回）
    window.addEventListener('scroll', function () {
      if (moreRaf || state.view !== 'judge' || (state.step !== 1 && state.step !== 2)) return;
      moreRaf = requestAnimationFrame(function () { moreRaf = 0; updateMore(); });
    }, { passive: true });
    $$('.nav-item').forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });
    $('#stepNav').addEventListener('click', function (e) {
      const li = e.target.closest('[data-step]');
      if (!li || li.classList.contains('disabled')) return;
      goStep(Number(li.dataset.step));
    });
    //   手順は role="button"（Tab で移れる）なので Enter・Space でも押せる
    $('#stepNav').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const li = e.target.closest('[data-step]');
      if (!li) return;
      e.preventDefault();
      if (!li.classList.contains('disabled')) goStep(Number(li.dataset.step));
    });
    // 使い方の「← （手順）の画面に戻る」
    $('#view-help').addEventListener('click', function (e) { if (e.target.closest('[data-action="back-to-judge"]')) showView('judge'); });
    $('#btnNew').addEventListener('click', newRecord);
    $('#btnLoad').addEventListener('click', function () { const f = $('#fileInput'); f.value = ''; f.click(); });
    $('#fileInput').addEventListener('change', onFileChosen);
    $('#profileFileInput').addEventListener('change', onProfileFileChosen);
    $('#btnSave').addEventListener('click', saveRecord);
    // 印刷は A4 面接チェックリスト報告（docs/SPEC-script-mode.md Y9）。ボタン名は「🖨 報告書を印刷」（記入シートと取り違えない。docs/SPEC-flow.md 15 章）
    $('#btnPrint').addEventListener('click', onTopPrint);
    $('#btnTheme').addEventListener('click', toggleTheme);

    //   本文（#stepContent）と操作行（#stepFoot。.page の最後の子）の両方の操作を受ける
    const content = $('#view-judge');
    content.addEventListener('input', onFieldEvent);
    content.addEventListener('change', onFieldEvent);
    content.addEventListener('click', onContentClick);
    content.addEventListener('keydown', onContentKey);

    window.addEventListener('beforeunload', function (e) {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    // 別のタブ（ウィンドウ）で設定が保存・初期化されたら読み込み直す（古いタブのまま最終承認のパスワードを迂回・上書きしない。docs/SPEC-a4.md 11 章 L5d）。
    //   storage イベントが届かない環境のため、タブに戻ったとき・保存や押印の直前にも localStorage と比べる（refreshProfileFromStorage）
    window.addEventListener('storage', function (e) { if (e.key === null || e.key === S.PROFILE_KEY) refreshProfileFromStorage(); });
    window.addEventListener('focus', function () { refreshProfileFromStorage(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshProfileFromStorage(); });

    // ブラウザの印刷（Ctrl+P）も A4 面接チェックリスト報告にする（報告書の紙と同じ用紙 1 枚。保存 HTML の印刷と同じ様式）
    let autoClPrint = false;
    window.addEventListener('beforeprint', function () {
      if (state.view !== 'judge' || document.body.classList.contains('print-checklist')) return;
      if (prepareChecklistSheet(true)) autoClPrint = true;
    });
    window.addEventListener('afterprint', function () { if (autoClPrint) { autoClPrint = false; prepareChecklistSheet(false); } });
  }

  // 画面名（ナビ「報告書の作成」・トップバー「面接チェックリスト報告」・サイドバー「手順」は index.html に直書き。docs/SPEC-slim.md D13）
  const JUDGE_VIEW_TITLE = '面接チェックリスト報告';

  function renderBrand() {
    const m = state.profile.meta;
    $('#brandTitle').textContent = m.appTitle || 'リクルート判定システム';
    $('#brandTheater').textContent = m.theaterName || '';
    $('#brandMark').textContent = (m.theaterName || 'R').replace(/^TOHOシネマズ/, '').charAt(0) || 'R';
    // ロゴ（brand.js）があれば 1 文字のマークの代わりに出す。公開版は空なのでマークのまま
    const logo = $('#brandLogo');
    if (logo) {
      // 用紙の見出し（storage.checklistSheetHtml）と同じ条件: base64 の data URL の画像だけ（storage.brandLogo）
      const bl = typeof S.brandLogo === 'function' ? S.brandLogo(m.theaterName) : null;
      const hasLogo = !!bl;
      if (hasLogo) { logo.src = bl.src; logo.alt = bl.alt; }
      logo.hidden = !hasLogo;
      $('#brandMark').hidden = hasLogo;
      $('#brand').classList.toggle('has-logo', hasLogo);
    }
    $('#brandVersion').textContent = 'Version ' + (m.version || '') + '　判定ルール：' + (m.theaterName || '');
    $('#footerText').textContent = m.footer || '';
    document.title = (m.appTitle || 'リクルート判定システム') + ' | ' + (m.theaterName || '');
  }

  // =====================================================================
  // テーマ
  // =====================================================================
  function applyTheme(t) {
    const html = document.documentElement;
    if (t === 'dark' || t === 'light') html.setAttribute('data-theme', t); else html.removeAttribute('data-theme');
    const isDark = t === 'dark' || (!t && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    //   アイコン（i-sun／i-moon）＋文字。840px 以下は文字を隠すので aria-label にも同じ名前
    const b = $('#btnTheme'), label = isDark ? 'ライトモード' : 'ダークモード';
    b.innerHTML = ico(isDark ? 'sun' : 'moon') + '<span class="theme-label">' + label + '</span>';
    b.setAttribute('aria-label', label);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const isDark = cur === 'dark' || (!cur && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    S.saveTheme(next);
    applyTheme(next);
  }

  // =====================================================================
  // ビュー切替
  // =====================================================================
  // 設定の保存・初期化・JSON 読み込みのあと（応募者の入力は保持し、判定だけやり直す）
  function onProfileChanged() {
    renderBrand();
    invalidateJudgment();
  }

  // ---------- 設定の保存（localStorage）と、別のタブ（ウィンドウ）での変更の取り込み（docs/SPEC-a4.md 11 章 L5d） ----------
  //   storedRaw: このタブが最後に見た（読んだ・書いた）localStorage の設定の文字列。違っていれば別のタブで保存・初期化された
  let storedRaw = null;
  function readStoredRaw() { try { return localStorage.getItem(S.PROFILE_KEY); } catch (e) { return null; } }
  function persistProfile(p) { S.saveProfile(p); storedRaw = readStoredRaw(); }
  function lockSig(p) {
    const l = ((p || {}).management || {}).finalLock;
    return Lock && Lock.isLocked(l) ? l.salt + ':' + l.hash : (U.isObj(l) && l.off === true ? 'off' : '');
  }
  // 別のタブで保存された設定を読み込み、画面を描き直す。変わっていなければ null。
  //   変わっていれば { prev, lockMoved（最終承認のロックが変わった）, draftClean（設定画面に未保存の変更が無かった）, lockReverted（設定画面の下書きで変えていたパスワードを取り消した） }。
  //   報告書は描き直す（最終確認・最終合否のパスワード欄は最新のロックで出す）。設定画面は、未保存の変更が無ければ最新の設定で描き直し、
  //   あれば下書きを残して最終承認のロックだけ最新に合わせる（下書きでパスワードを変えていたら取り消す）
  function refreshProfileFromStorage() {
    const raw = readStoredRaw();
    if (raw === storedRaw) return null;
    storedRaw = raw;
    const fresh = S.loadProfile();
    if (JSON.stringify(fresh) === JSON.stringify(state.profile)) return null;
    const prev = state.profile;
    const out = { prev: prev, lockMoved: lockSig(prev) !== lockSig(fresh), draftClean: false, lockReverted: false };
    state.profile = fresh;
    onProfileChanged();
    let msg = '別のタブ（ウィンドウ）で保存された最新の設定を読み込みました';
    if (state.view === 'judge') {
      if (state.step === 4) { renderStepNav(); renderStep(); }
      renderSummary();
    } else if (state.view === 'settings') {
      out.draftClean = Settings.isDraftOf(prev);
      // 未保存の変更が無ければ最新の設定で描き直す。最終承認のロックが変わっていなければ、入力中のパスワードの欄（［変更］［パスワードを外す］。下書きには入らない）は残す
      if (out.draftClean) {
        if (Settings.reload(fresh, !out.lockMoved)) msg = '別のタブ（ウィンドウ）で最終承認のパスワードが変わったため、最新の設定を読み込み、入力中のパスワードの欄を閉じました';
      } else {
        out.lockReverted = Settings.syncLock(prev, fresh);
        msg = out.lockReverted
          ? '別のタブ（ウィンドウ）で最終承認のパスワードが変わったため、このタブでのパスワードの変更を取り消しました。必要ならもう一度変更してください'
          : '別のタブ（ウィンドウ）で設定が保存されました' + (out.lockMoved ? '（最終承認のパスワードは最新のものを使います）' : '') + '。このタブの変更を保存すると、ほかの項目はこのタブの内容になります';
      }
    }
    toast(msg, out.lockReverted ? 'error' : 'warn');
    return out;
  }
  // パスワードのダイアログを出しているあいだに別のタブでロックが変わったら（sig は始めたときのロック）、保存・読み込み・初期化をやめる（古いロックで確かめたため）
  function lockMovedSince(sig) {
    refreshProfileFromStorage();
    if (lockSig(state.profile) === sig) return false;
    toast('別のタブ（ウィンドウ）で最終承認のパスワードが変わったため、やめました（最新の設定を読み込みました）。もう一度操作してください', 'error');
    return true;
  }
  // 「外した」印（finalLock.off）を書けるのは、いま有効なロックを外すとき（現在のパスワードを確かめる）か、すでに外してあるときだけ。
  //   ロックの無い版（公開版）で off の入った JSON を読み込んでも、同じ localStorage を使うローカル版のロックを外せないよう未設定に戻す（docs/SPEC-a4.md 11 章 L6c）
  function keepLockOff(next) {
    const nx = ((next || {}).management || {}).finalLock;
    if (!U.isObj(nx) || nx.off !== true || finalLockNow() || lockSig(state.profile) === 'off') return next;
    next.management.finalLock = { salt: '', hash: '' };
    return next;
  }
  // 書き込むロック・「外した」印の chain（既定のロックから、現在のパスワードを確かめてつながっている印）は、いまのロックのものを引き継ぐ
  //   （同じロック・現在のパスワードを確かめた変更・すでに外してある状態からの設定）。ロックの無い状態（公開版の未設定）から付けた・外したもの、
  //   JSON から読んだものには chain を付けない＝既定のロックを持つ版（ローカル版）はそれを使わない（docs/SPEC-a4.md 11 章 L6d）。p は正規化の前でも後でもよい
  function inheritChain(p) {
    const l = ((p || {}).management || {}).finalLock;
    if (!U.isObj(l)) return p;
    const cur = ((state.profile || {}).management || {}).finalLock;
    if (U.isObj(cur) && cur.chain === true) l.chain = true; else delete l.chain;
    return p;
  }

  // 設定画面（settings.js）に渡す処理。onSave の戻り値: 保存したら true、やめたら false（パスワードを確かめるときは Promise。settings.js が注意の toast をこのあとに出す）
  const settingsHandlers = {
    current: function () { return state.profile; },
    onSave: function (p) {
      // 別のタブ（ウィンドウ）で設定が保存されていたら、先に最新の設定を読み込む（古いタブの保存で最新のロックを上書きしない。docs/SPEC-a4.md 11 章 L5d）
      //   このタブで変更していなければ最新の設定を表示し直すだけ（保存しない）。別のタブでロックが変わっていて、このタブでもパスワードを変えていたら
      //   （古いロックで確かめた変更なので）取り消して保存しない。それ以外は保存する（別のタブでロックが変わっていればロックは最新のもの）
      const moved = refreshProfileFromStorage();
      if (moved && (moved.draftClean || moved.lockReverted)) return false;
      if (moved && moved.lockMoved && U.isObj(p.management)) p.management.finalLock = U.deepClone(state.profile.management.finalLock);
      const next = keepLockOff(S.normalizeProfile(inheritChain(p)));
      const sig0 = lockSig(state.profile);
      const commit = function () {
        if (lockMovedSince(sig0)) return false;
        state.profile = next;
        persistProfile(state.profile);
        onProfileChanged();
        toast('設定を保存しました', 'ok');
        renderSettings();
        return true;
      };
      // 最終承認のパスワードがあるとき、ロックの対象（押印欄と連動・最終合否の ON/OFF・押印欄の構成）を変える保存は現在のパスワードを求める
      //   （違えば・キャンセルなら保存しない。下書きはそのまま残す。押印欄の説明・名簿だけの変更は求めない。docs/SPEC-a4.md 11 章 L5c）
      if (!finalScopeChanges(next)) return commit();
      return askFinalPassword('「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成・押印欄の表示名を変えると、最終承認のパスワードで守る欄が変わります。保存するには現在のパスワードを入力してください。')
        .then(function (ok) {
          if (ok) return commit();
          toast('設定を保存しませんでした（最終承認のパスワードを確認できません）', 'error');
          return false;
        });
    },
    onExport: function (p) {
      S.download('劇場プロファイル_' + S.safeName(p.meta.theaterName) + '_' + U.fmtDate(new Date()) + '.json', JSON.stringify(p, null, 2), 'application/json');
      toast('プロファイルを書き出しました');
    },
    onImport: function () { const f = $('#profileFileInput'); f.value = ''; f.click(); },
    onReset: function () {
      let sig0 = '';
      const doReset = function () {
        if (lockMovedSince(sig0)) return;
        state.profile = S.resetProfile();
        persistProfile(state.profile);
        onProfileChanged();
        toast('初期設定に戻しました', 'ok');
        showView('settings');
      };
      refreshProfileFromStorage();
      sig0 = lockSig(state.profile);
      // 初期設定で最終承認のパスワードが変わる／外れるときは、現在のパスワードを求める（違えば・キャンセルなら初期化しない）
      if (!finalLockChanges(S.normalizeProfile(S.defaults()))) { doReset(); return; }
      askFinalPassword('初期設定に戻すと最終承認のパスワードが' + (Lock.isLocked(S.normalizeProfile(S.defaults()).management.finalLock) ? '初期のパスワードに変わります' : '外れます') + '。現在のパスワードを入力してください。')
        .then(function (ok) { if (ok) doReset(); else toast('初期設定に戻しませんでした（最終承認のパスワードを確認できません）', 'error'); });
    },
    onToast: toast
  };
  function renderSettings() { Settings.render($('#view-settings'), state.profile, settingsHandlers); }

  function showView(view) {
    // 設定・使い方を見ているあいだは面接のタイマーを数えない（面接の画面に戻れば renderStep が再開する。docs/SPEC-flow.md 1-2）
    if (view !== 'judge') ivStop(false);
    state.view = view;
    $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    ['judge', 'settings', 'help'].forEach(function (v) { $('#view-' + v).classList.toggle('hidden', v !== view); });
    $('#stepSection').classList.toggle('hidden', view !== 'judge');
    $('#topActions').classList.toggle('hidden', view !== 'judge');
    $('#applicantChip').classList.toggle('hidden', view !== 'judge');
    $('#topTitle').textContent = view === 'judge' ? JUDGE_VIEW_TITLE : view === 'settings' ? '設定（劇場ルール）' : '使い方';

    if (view === 'judge') {
      renderStepNav(); renderStep(); renderSummary();
    } else if (view === 'settings') {
      renderSettings();
    } else if (view === 'help') {
      $('#view-help').innerHTML = helpHtml();
    }
    syncFlowLayout();
    window.scrollTo(0, 0);
    if (view === 'judge' && state.step === 2) ivFocusHead();
  }

  // 本文の枠（#judgePage）の形と、固定の部分の高さ（docs/DESIGN.md 3-10・3-11・4-1）。
  //   面接・評価・報告書は 920 の 1 列（.page.reading）・面接と評価は著作権の行を出さない（.no-footer）。操作行は .page の最後の子（sticky。4 画面と設定で同じ座標）。
  //   面接の段階のチップが 1 行に入らなければ番号だけにする（fitChips）。固定の部分の高さを測って scroll-padding に入れる（measureFlow）
  function syncFlowLayout() {
    const pg = $('#judgePage');
    if (pg) {
      pg.classList.toggle('reading', state.step >= 2);
      pg.classList.toggle('no-footer', state.step === 2 || state.step === 3);
    }
    if (state.view === 'judge' && state.step === 2) fitChips();
    measureFlow();
  }
  function isNarrow() { return !!(window.matchMedia && window.matchMedia('(max-width: 840px)').matches); }
  // 固定の部分の高さ: --topbar-h（トップバー。固定していない 840px 以下は 0）・--flow-top-h（固定している帯の下端のいちばん下。トップバー＋面接の上の帯〔狭い画面はタイマー＋案内〕・評価の結果）・
  //   --flow-foot-h（操作行）・--iv-timer-h（狭い画面で案内を固定する位置）。html の scroll-padding と上の帯の位置に使う
  function measureFlow() {
    const html = document.documentElement;
    const tb = $('.topbar');
    const tbFixed = !!tb && getComputedStyle(tb).position === 'sticky';
    html.style.setProperty('--topbar-h', (tbFixed ? tb.offsetHeight : 0) + 'px');
    const judge = state.view === 'judge';
    const timer = judge ? $('#ivTimer') : null;
    if (timer && timer.offsetHeight) html.style.setProperty('--iv-timer-h', timer.offsetHeight + 'px');
    let edge = 0;
    [tb].concat(judge ? $$('#ivTop, #evTop, #ivTimer, #ivMustAlert') : []).forEach(function (el) {
      if (!el) return;
      const cs = getComputedStyle(el);
      if (cs.position !== 'sticky' || cs.display === 'contents' || cs.display === 'none') return;
      edge = Math.max(edge, (parseFloat(cs.top) || 0) + el.getBoundingClientRect().height);
    });
    html.style.setProperty('--flow-top-h', Math.round(edge) + 'px');
    const vw = $('#view-' + state.view);
    const foot = vw ? $('.flow-foot', vw) : null;
    html.style.setProperty('--flow-foot-h', (foot && foot.offsetHeight ? foot.offsetHeight : 0) + 'px');
  }
  // 段階のチップが 1 行に入らないとき（列が狭い・台本の段階の名前が長い）は、今の段階以外を番号だけにする（.is-compact。状態の文字「省略可」「未確認」も隠す）。
  //   それでも入らなければ今の段階も番号だけ（.is-tight。名前は段階の見出しにある）。帯は 1 段のまま。840px 以下は流れるので付けない（docs/DESIGN.md 3-8）
  function fitChips() {
    const nav = $('#ivChips');
    if (!nav) return;
    nav.classList.remove('is-compact', 'is-tight');
    if (isNarrow()) return;
    const rows = function () {
      const tops = {};
      Array.prototype.forEach.call(nav.children, function (c) { if (c.offsetParent !== null) tops[Math.round(c.getBoundingClientRect().top)] = 1; });
      return Object.keys(tops).length;
    };
    if (rows() > 1) nav.classList.add('is-compact');
    if (nav.classList.contains('is-compact') && rows() > 1) nav.classList.add('is-tight');
  }
  // キーボードで移った先（Tab・Shift+Tab・プログラムのフォーカス）が上の帯・操作行に少しでも掛かっていたら、帯の下・操作行の上まで送る。
  //   マウス・タッチで押した直後は動かさない（押している最中にボタンが動くと、押した位置が別の要素になってクリックが届かない）
  let lastPointerAt = 0;
  document.addEventListener('pointerdown', function () { lastPointerAt = Date.now(); }, true);
  function onFocusIn(e) {
    const el = e.target;
    if (!el || !el.closest || !el.getBoundingClientRect || Date.now() - lastPointerAt < 600) return;
    const view = el.closest('.view');
    if (!view || el.closest('.topbar, .iv-top, .ev-top, .flow-foot, .iv-timer, .iv-must, .dlg-back')) return;
    const r = el.getBoundingClientRect();
    if (!r.height) return;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--flow-top-h')) || 0;
    const foot = $('.flow-foot', view);
    const fb = foot && getComputedStyle(foot).position === 'sticky' ? foot.getBoundingClientRect().top : window.innerHeight;
    if (r.top < top + 4 || r.bottom > fb - 4) el.scrollIntoView({ block: 'nearest' });
  }

  // =====================================================================
  // ステップ制御
  // =====================================================================
  // 判定の呼び出しはここ 1 か所（総合判断が基準。docs/SPEC-script-mode.md 1-3-2）
  function evaluateNow() {
    return R.evaluateScript(state.applicant, ensureChecklist(), state.profile);
  }

  // ステップの移動（docs/SPEC-flow.md 1-2）。内部の step は 1〜4 そのまま（2 → 1 の読み替えはしない）
  //   評価の「✎ 面接の画面で直す」から面接へ行き、評価へ戻るとき（evReturn）は、直しに行ったカードを元の高さに出す（16-7）
  let evReturn = null;   // { sec, top: 押したときのカードの上端（画面の上から） }
  function goStep(n) {
    n = [1, 2, 3, 4].indexOf(Number(n)) >= 0 ? Number(n) : 1;
    ivMustUnwarn();   // 必須条件の案内（ivMustHold）は画面を移ると出し直す
    const back = n === 3 && state.step === 2 ? evReturn : null;
    if (n !== 2) evReturn = null;
    // 面接を離れる: 数えた秒を足して止める。評価・報告書へ進むなら面接の終了時刻（endedAt）を入れる
    if (state.step === 2 && n !== 2) ivStop(n >= 3);
    if (n === 4) {
      state.judgment = evaluateNow();
      state.judgmentStale = false;
    }
    state.step = n;
    state.maxStepReached = Math.max(state.maxStepReached, n);
    renderStepNav(); renderStep(); renderSummary();
    // 面接は段階の見出しにフォーカスしてページの先頭へ（3-9）
    if (n === 2) { ivFocusHead(); return; }
    //   評価へ戻る: 直しに行った段階のカードを元の高さ（上の結果カードの下より上には出さない）に出し、その「✎ 面接の画面で直す」にフォーカス
    const card = back ? $('#cl-' + (window.CSS && CSS.escape ? CSS.escape(back.sec) : back.sec)) : null;
    if (card) {
      const minTop = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--flow-top-h')) || 0) + 8;
      window.scrollTo(0, Math.max(0, Math.round(card.getBoundingClientRect().top + window.scrollY - Math.max(back.top, minTop))));
      const fx = $('.ev-fix', card);
      if (fx) fx.focus({ preventScroll: true });
      return;
    }
    //   ほかは本文の先頭（「この画面ですること」）がトップバー（固定。狭い画面では折り返して高くなる）の下に見える位置へ
    const tb = $('.topbar');
    const top = Math.max(0, $('#view-judge').getBoundingClientRect().top + window.scrollY - (tb ? tb.offsetHeight : 57) - 8);
    // 評価は縦に長いので、遠くからはすぐに移動する（長いスムーズスクロールを避ける）
    window.scrollTo({ top: top, behavior: Math.abs(window.scrollY - top) > 1500 ? 'auto' : 'smooth' });
  }

  // 判定が無い（報告書を開いていない・判定後に入力が変わった）ときは現在の入力で判定する。
  // 準備・面接・評価から保存・A4 印刷（トップバー 🖨・Ctrl+P）しても報告書に結果が入るようにする（チェックリストが未入力でも走らせる）。
  // 副作用は state.judgment（と judgmentStale）だけ。報告書を開くと goStep(4) が同じ入力で判定し直すので結果は同じ
  function ensureJudgment() {
    if (state.judgment && !state.judgmentStale) return false;
    state.judgment = evaluateNow();
    state.judgmentStale = false;
    return true;
  }

  function invalidateJudgment() {
    if (state.judgment) {
      state.judgment = null;
      state.judgmentStale = true;
    }
  }

  function renderStepNav() {
    $('#stepNav').innerHTML = STEPS.map(function (s) {
      const cls = ['step'];
      if (s.n === state.step) cls.push('current');
      else if (s.n < state.step) cls.push('done');
      if (s.n > state.maxStepReached) cls.push('disabled');
      const hint = s.n === 3 ? '面接のあとに ' + evalWhatText(false) : s.hint;   // 人物像を使わない設定では人物像を言わない
      //   番号は丸の部品（今＝紺の塗り・済み＝淡い紺に ✓・まだ＝枠。docs/DESIGN.md 3-7）。ヒントの ○△× は和文のフォント（.ja）
      return '<li class="' + cls.join(' ') + '" data-step="' + s.n + '" role="button" tabindex="0"' + (s.n === state.step ? ' aria-current="step"' : '') + (s.n > state.maxStepReached ? ' aria-disabled="true"' : '') + '>' +
        '<span class="step-num nb lg' + (s.n === state.step ? ' fill' : s.n < state.step ? ' done' : '') + '" data-no="' + s.no + '">' + (s.n < state.step ? '✓' : s.no) + '</span>' +
        '<span><span class="step-label">' + esc(s.label) + '</span><span class="step-hint">' + esc(hint).replace('○△×', '<span class="ja">○△×</span>') + '</span></span></li>';
    }).join('');
  }

  function renderStep() {
    const c = $('#stepContent'), f = $('#stepFoot');
    c.setAttribute('data-step', String(state.step));
    // 右サマリーは準備と報告書だけ（面接・評価は 1 列で広く使う。docs/SPEC-flow.md F2）。報告書は紙の下（.page.reading の 1 列。styles.css の .page.reading .summary）
    const layout = $('#view-judge .judge-layout');
    if (layout) layout.classList.toggle('no-summary', state.step === 2 || state.step === 3);
    syncFlowLayout();
    // 本文（#stepContent）と操作行（#stepFoot。.page の最後の子）を描く。操作行は「下にあと n 項目」の計算に要るので本文の直後に入れる
    switch (state.step) {
      case 1:
        fillChecklistDefaults(); c.innerHTML = prepStepHtml(); f.innerHTML = prepFootHtml(); applyVisibility(); updateMore(); break;
      case 2: {
        fillChecklistDefaults();
        const sec = ivCurrentSec();
        if (sec && state.view === 'judge') ivStart(sec);
        c.innerHTML = interviewStepHtml(sec);
        f.innerHTML = ivFootHtml(sec);
        ivAfterRender();
        updateChecklistUI(true);
        break;
      }
      case 3:
        fillChecklistDefaults(); c.innerHTML = evalStepHtml(); f.innerHTML = evFootHtml(); updateChecklistUI(true); break;
      case 4:
        if (!state.judgment) { state.judgment = evaluateNow(); state.judgmentStale = false; }
        c.innerHTML = reportStepHtml();
        f.innerHTML = rpFootHtml();
        fitReportPaper();
        break;
      default: c.innerHTML = ''; f.innerHTML = '';
    }
    syncFlowLayout();   // 描いた画面の操作行・上の帯の高さ（--flow-foot-h・--flow-top-h）
  }

  // =====================================================================
  // フォーム部品
  // =====================================================================

  function optHtml(options, value) {
    return (options || []).map(function (o) {
      const v = typeof o === 'string' ? o : o.value;
      const l = typeof o === 'string' ? o : o.label;
      return '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }

  // ラベルが上の欄（.field。docs/DESIGN.md 3-5）。必須は紺の小さいバッジ「必須」
  function labelHtml(label, o, forId) {
    return '<label' + (forId ? ' for="' + esc(forId) + '"' : '') + '>' + esc(label) + (o.required ? '<span class="req">必須</span>' : '') + '</label>';
  }

  // 準備の応募者の入力部品（呼び出しは prepStepHtml だけ）。o: fSelect { placeholder }／fInput { type, required, placeholder, min, max, step, autocomplete, suffix（欄の中の単位）, id }
  function fSelect(path, label, options, o) {
    o = o || {};
    const value = U.getPath(state.applicant, path) || '';
    const fid = 'f-' + path;
    return '<div class="field">' + labelHtml(label, o, fid) +
      '<select id="' + esc(fid) + '" data-field="' + esc(path) + '"><option value="">' + esc(o.placeholder || '選択してください') + '</option>' + optHtml(options, value) + '</select></div>';
  }

  function fInput(path, label, o) {
    o = o || {};
    const value = U.getPath(state.applicant, path);
    const fid = 'f-' + path;
    const attrs = [
      'type="' + (o.type || 'text') + '"',
      'id="' + esc(fid) + '"',
      'data-field="' + esc(path) + '"',
      'value="' + esc(value == null ? '' : value) + '"',
      o.required ? 'data-required' : '',
      o.placeholder ? 'placeholder="' + esc(o.placeholder) + '"' : '',
      o.min !== undefined ? 'min="' + o.min + '"' : '',
      o.max !== undefined ? 'max="' + o.max + '"' : '',
      o.step !== undefined ? 'step="' + o.step + '"' : '',
      o.autocomplete ? 'autocomplete="' + o.autocomplete + '"' : '',
      o.type === 'number' ? 'class="no-spin" inputmode="numeric"' : ''
    ].filter(Boolean).join(' ');
    const input = '<input ' + attrs + '>';
    return '<div class="field"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' + labelHtml(label, o, fid) +
      (o.suffix ? '<span class="input-unit">' + input + '<span class="unit">' + esc(o.suffix) + '</span></span>' : input) + '</div>';
  }

  function fTextarea(path, label, o) {
    o = o || {};
    const fid = 'f-' + path;
    return '<div class="field"><label for="' + esc(fid) + '">' + esc(label) + '</label>' +
      '<textarea id="' + esc(fid) + '" data-field="' + esc(path) + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.placeholder || '') + '">' + esc(U.getPath(state.applicant, path) || '') + '</textarea></div>';
  }

  // 可視の必須欄を検査し、未入力に .invalid を付ける
  function checkRequired(scopeSel) {
    const missing = [];
    $$(scopeSel + ' [data-required]').forEach(function (el) {
      const visible = !el.closest('.hidden');
      if (visible && !String(el.value || '').trim()) { el.classList.add('invalid'); missing.push(el); }
      else el.classList.remove('invalid');
    });
    missing.sort(function (x, y) { return (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1; });
    return missing;
  }

  // =====================================================================
  // 準備（step 1。docs/SPEC-flow.md 2 章・docs/SPEC-script-mode.md 12 章）
  //   はじめての方へ（初回だけ）→ 応募者のカード（1 枚・3 行: 氏名*・年齢・性別・区分〔学生は卒業予定年月〕／面接日・面接担当者・応募した求人／タクシー可否・料金・メモ）→
  //   操作行（左に記入シート・右下に「面接を始める →」）。キーは applicant.* と checklist.header.*（消極属性は 2026-10-13 に削除）
  // =====================================================================
  // 「はじめての方へ」を閉じたことは localStorage に覚える（使えない環境ではこのページの変数で覚える。docs/SPEC-flow.md F16）
  const INTRO_KEY = 'recruit.intro.v1';
  let introClosed = false;
  function introShown() {
    if (introClosed) return false;
    try { return localStorage.getItem(INTRO_KEY) !== '1'; } catch (e) { return true; }
  }
  function closeIntro() {
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* 保存できない環境でもこのページでは閉じたまま */ }
    introClosed = true;
    const card = $('#introCard');
    if (card) card.remove();
    const nm = $('[data-field="name"]');
    if (nm) nm.focus();
  }
  function introHtml() {
    //   見出し・説明・ボタンは 1 行、4 つの手順は短い文（操作行は画面の下に固定なので「面接を始める →」はいつも見える。ノート PC の高さで応募者の欄が操作行に隠れるときは
    //   操作行の「▼ 下にあと n 項目」で知らせる。docs/SPEC-flow.md 16-7）。
    //   地は淡い紺（.intro。docs/DESIGN.md 4-2）・［わかった］は副ボタン（紺の塗りは操作行の主ボタンだけ）。手順の番号は丸の部品（リストの番号なので読み上げない）
    const step = function (n, name, text) { return '<li><b>' + nbHtml(n, '', '', true) + '<span>' + name + '</span></b><span>' + text + '</span></li>'; };
    return '<section class="intro no-print" id="introCard" aria-labelledby="introH">' +
      '<div class="intro-head">' + ico('info') + '<h2 id="introH">はじめての方へ</h2>' +
        '<p class="intro-lead">4 つの手順で、A4 1 枚の報告書ができます。</p>' +
        '<div class="intro-foot"><button type="button" class="btn sm ghost" data-action="show-help">使い方を見る</button>' +
          '<button type="button" class="btn sm" id="introOk" data-action="intro-ok">わかった</button></div></div>' +
      '<ol class="intro-steps">' +
        step(1, '準備', '名前と面接の情報を入れる（氏名だけ必須）') +
        step(2, '面接', '台本の ①〜⑤ を 1 段階ずつ 話す → 聞く → 確かめる') +
        step(3, '評価', esc('面接のあとに ' + evalWhatText()).replace('○△×', '<span class="ja">○△×</span>')) +
        step(4, '報告書', esc(reportLeadText(true))) +   // 面接者が押すのは「面接対応者」だけ（docs/SPEC-flow.md 15 章）
      '</ol>' +
    '</section>';
  }

  function prepStepHtml() {
    ensureChecklist();
    const p = state.profile;
    const o = p.options || {};
    const f = p.features || {};
    const def = clDefNow();
    const dh = U.isObj(def.header) ? def.header : {};
    const posting = U.isObj(dh.posting) ? dh.posting : {};
    const pOpts = Array.isArray(posting.options) ? posting.options : [];
    const mg = p.management || {};
    const managers = Array.isArray(mg.managers) ? mg.managers : [];
    const h = state.checklist.header;
    const iv = String(h.interviewer || '');
    const inRoster = managers.some(function (m) { return m && m.name === iv; });
    const cats = (o.categories || []).filter(function (c) { return c && c.value; }).map(function (c) { return { value: c.value, label: c.value }; });
    // 求人のボタンは「通常」「短期」（表示名の末尾の「求人」を省く。報告書では表示名のまま）
    const pBtn = function (x) { const full = String(x.label || x.value); return { value: x.value, label: full.replace(/求人$/, '') || full, title: full }; };
    const nItems = 8 + (pOpts.length ? 1 : 0);   // 氏名・年齢・性別・区分・面接日・面接担当者・（応募した求人）・タクシー・メモ（卒業予定年月は学生だけ）
    //   カード（帯: 応募者・項目数）の本文は 3 行（docs/DESIGN.md 4-2・docs/SPEC-script-mode.md 12 章）。欄はラベルが上
    return stepLeadHtml(1) + (introShown() ? introHtml() : '') +
      cardHtml({ id: 'scriptApplicantCard', icon: 'user', title: '応募者', small: nItems + ' 項目' },
        '<p class="card-note">氏名だけ必須です。あとは分かる範囲で入力してください。</p>' +
        '<div class="field-row sa-row sa-row1">' +
          fInput('name', '氏名', { required: true, placeholder: '例：山田 太郎', autocomplete: 'off' }) +
          fInput('age', '年齢', { type: 'number', min: 15, max: 99, step: 1, suffix: '歳' }) +
          fSelect('gender', '性別', o.genders, { placeholder: '選択' }) +   // 1 行目は狭いので未選択の文言は短く（「選択してください」は PC 幅で切れる。区分も同じ）
          fSelect('category', '区分', cats, { placeholder: '選択' }) +
          (f.graduationDate ? fInput('graduationDate', '卒業予定年月', { type: 'month', id: 'grp-graduation' }) : '') +
        '</div>' +
        '<div class="field-row sa-row sa-row2">' +
          '<div class="field"><label for="saDate">面接日</label><input type="date" id="saDate" data-cl="header.date" value="' + esc(h.date || '') + '"></div>' +
          '<div class="field"><label for="saInterviewer">面接担当者</label>' +
            '<select id="saInterviewer" data-cl="header.interviewer" title="名簿は設定の「応募者の管理（押印）」で編集します。報告書の押印欄「面接対応者」の初期選択になります。"><option value="">選択してください</option>' +
              managers.filter(function (m) { return m && m.name; }).map(function (m) {
                return '<option value="' + esc(m.name) + '"' + (m.name === iv ? ' selected' : '') + '>' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>';
              }).join('') +
              (iv && !inRoster ? '<option value="' + esc(iv) + '" selected>' + esc(iv) + '（名簿外）</option>' : '') +
            '</select></div>' +
          (pOpts.length ? '<div class="field" id="saPosting"><span class="field-label" id="saPostingL">' + esc(posting.label || '応募した求人') + '</span>' +
            clSegHtml('header.posting', pOpts.map(pBtn), { labelledby: 'saPostingL' }) + '</div>' : '') +
        '</div>' +
        '<div class="field-row sa-row sa-row3">' +
          '<div class="field"><label for="saTaxi">タクシー可否・料金</label><input type="text" id="saTaxi" data-cl="header.taxi" value="' + esc(h.taxi || '') + '" placeholder="例：可・2,500円" title="深夜帯の帰宅にタクシーを使えるか・料金の目安"></div>' +
          fTextarea('reviewerNotes', 'メモ（任意）', { rows: 2, placeholder: '例：電話の受け答えが丁寧。' }) +
        '</div>');
  }
  // 準備の操作行（docs/SPEC-flow.md 5-3・15 章）: 左に記入シート（手書き用。氏名が空でも印刷できる）と「▼ 下にあと n 項目」（欄が操作行に隠れているときだけ。16-7）・
  //   右端に主ボタン（面接を始める／面接・評価・報告書に戻る）。DOM は主ボタンが先（Tab で最後の入力欄の次は主ボタン。見た目の左右は CSS の order）
  function prepFootHtml() {
    const nx = prepNext();
    return '<div class="flow-foot" id="saActions">' +
      '<button type="button" class="btn primary" id="saNext" data-action="script-next"><span>' + esc(nx.label) + '</span>' + sym(' →') + ico('arrow-right') + '</button>' +
      '<button type="button" class="btn ff-start" id="saPaperBtn" data-action="print-paper" title="' + esc(PAPER_BTN_TITLE) + '">' + ico('printer') + sym('🖨 ') + '<span>記入シート<span class="lbl-x">（手書き用）</span></span></button>' +
      moreBtnHtml('saMore', 'scriptApplicantCard') + '<span class="spacer"></span></div>';
  }

  // 準備 → 面接: 氏名（必須）と年齢の形式だけ止める
  function validateScriptApplicant() {
    const missing = checkRequired('#stepContent');
    if (missing.length) {
      focusFirst(missing[0], '必須項目（' + missing.length + '件）が未入力です');
      return false;
    }
    const a = state.applicant;
    if (String(a.age == null ? '' : a.age).trim() !== '' && !isIntText(a.age)) {
      const el = $('[data-field="age"]'); if (el) el.classList.add('invalid');
      focusFirst(el, '年齢は整数で入力してください');
      return false;
    }
    return true;
  }

  function show(sel, on) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (el) el.classList.toggle('hidden', !on);
  }

  // 表示/非表示（卒業予定年月は学生の区分のときだけ）
  function applyVisibility() {
    const a = state.applicant;
    const p = state.profile;
    const f = p.features || {};
    show('#grp-graduation', !!f.graduationDate && R.isStudentGroup(R.categoryGroup(p, a.category)));
  }

  function onFieldEvent(e) {
    const t = e.target;
    if (!t || !t.dataset) return;

    if (t.hasAttribute && t.hasAttribute('data-stamp-select')) {
      const inp = t.closest('.stamp-box').querySelector('.stamp-free');
      if (inp) { inp.classList.toggle('hidden', t.value !== '__free'); if (t.value === '__free') inp.focus(); }
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-decision-select')) {
      const inp = $('#decisionFree');
      if (inp) { inp.classList.toggle('hidden', t.value !== '__free'); if (t.value === '__free') inp.focus(); }
      return;
    }

    // 面接チェックリスト（data-field より先に処理する。チェックボックス → true／外すと消す、それ以外 → 値）
    if (t.dataset.cl) {
      const path = t.dataset.cl;
      if (path === 'timing.min') {
        // 評価の画面の面接時間（分）: 1〜600 の整数なら手入力の分、空・それ以外ならタイマーの値に戻す（docs/SPEC-flow.md 4-5）
        const v = String(t.value || '').trim();
        const nmin = /^\d+$/.test(v) ? Number(v) : NaN;
        if (nmin >= 1 && nmin <= 600) ivTiming().min = nmin;
        else if (U.isObj(state.checklist.timing)) delete state.checklist.timing.min;
      } else if (t.type === 'checkbox') {
        clSet(path, t.checked);
      } else {
        clSet(path, t.value);
      }
      // 質問の答えのメモは内容に合わせて伸ばす（段階は描き直さない＝フォーカス・変換中の文字を保つ）
      if (t.classList && t.classList.contains('iv-q-memo')) ivAutosize(t);
      touchChecklist();
      updateChecklistUI();
      return;
    }

    if (t.dataset.field) {
      const path = t.dataset.field;
      U.setPath(state.applicant, path, t.value);
      if (t.hasAttribute('data-required')) t.classList.remove('invalid');
      state.dirty = true;
      invalidateJudgment();
      applyVisibility();
      renderSummary();
      return;
    }

    if (t.dataset.note === 'interview') { state.interviewNotes = t.value; state.dirty = true; return; }
  }

  function onContentClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    // ダブルクリック（e.detail は続けたクリックの回数）の 2 回目以降は押さなかったことにする。［次へ］などは押すと画面を描き直し、
    //   次のボタンが同じ位置（右下）に出るため、2 回目が次の画面のボタンに当たって段階・画面を飛ばす。トグル（一致・説明した・1〜5 点）も 2 回目で戻さない。
    //   キーボード（Enter・Space）と click() は 0 なので止めない
    if (e.detail > 1) return;
    switch (b.dataset.action) {
      case 'script-next': {
        // 準備の主ボタン（docs/SPEC-flow.md 2-2・15 章）: 面接を始める（下見のタイマーは 0 に戻して最初の段階から）／面接・評価・報告書に戻る
        if (!validateScriptApplicant()) break;
        const nx = prepNext();
        if (nx.fresh) ivRestart();
        goStep(nx.step);
        break;
      }
      case 'intro-ok':
        closeIntro();
        break;
      case 'show-help':
        showView('help');
        break;
      case 'to-step':
        goStep(Number(b.dataset.step));
        break;
      case 'judge':
        // 入力チェックで止めない（未入力は報告書に警告を出す。Y8）
        goStep(4);
        break;
      case 'iv-go': {
        // 段階のチップ・必須条件の案内の「⑤ 逆質問へ」・評価の「✎ 面接の画面で直す」（docs/SPEC-flow.md 3-6）
        const sec = b.dataset.sec;
        if (!ivSections().some(function (x) { return x.id === sec; })) break;
        if (state.step === 2) ivShow(sec);
        else {
          //   評価の「✎ 面接の画面で直す」: 評価に戻ったら、このカードを同じ高さに出す（評価の先頭へ戻さない。goStep・docs/SPEC-flow.md 16-7）
          const card = state.step === 3 ? b.closest('.ev-sec') : null;
          evReturn = card ? { sec: sec, top: Math.round(card.getBoundingClientRect().top) } : null;
          ivTiming().stage = sec;
          goStep(2);
        }
        break;
      }
      case 'iv-next':
      case 'iv-prev': {
        // 未確認の必須条件が残っていれば 1 回目の［次へ］は進まずにその行へ（もう一度押すと進む。ivMustHold）。
        //   キーボード（Enter・Space。e.detail 0）で［次へ］そのものを押したときはフォーカスを［次へ］に残す（Ctrl＋Enter の経路〔ivShortcut〕は除く）
        if (b.id === 'ivNext' && ivMustHold(e.detail === 0 && !ivShortcut)) break;
        const ss = ivSections(), i = ss.findIndex(function (x) { return x.id === ivCurrentSec(); });
        const to = ss[i + (b.dataset.action === 'iv-next' ? 1 : -1)];
        if (to) ivShow(to.id);
        else if (b.dataset.action === 'iv-prev') goStep(1);
        else goStep(3);
        break;
      }
      case 'iv-end':
        // 面接を終えて評価へ（面接の終了時刻を入れてタイマーを止める）。右下の主ボタンのときは［次へ］と同じく未確認の必須条件で 1 回止まる（台本の最後の段階に必須条件があるとき）
        if (b.id === 'ivNext' && ivMustHold(e.detail === 0 && !ivShortcut)) break;
        goStep(3);
        break;
      case 'iv-more':
        // 「▼ 下にあと n 項目」（面接・準備）: 操作行に隠れている分を見せる
        showMore();
        break;
      case 'iv-must-row': {
        // 必須条件の案内の「該当の行へ」（docs/DESIGN.md 3-11）: 不一致の最初の行を帯の下に出し、その［不一致］にフォーカス。その行が今の段階に無ければ（⑤ など）その段階へ移ってから
        const ng = R.checklistItems(clDefNow(), 'must').find(function (x) { return clGet('values.' + x.item.id) === 'mismatch'; });
        if (!ng) break;
        if (ivCurrentSec() !== ng.section.id) ivShow(ng.section.id);
        const row = $('#ivStage .cl-must-row[data-item="' + (window.CSS && CSS.escape ? CSS.escape(ng.item.id) : ng.item.id) + '"]');
        if (!row) break;
        row.scrollIntoView({ block: 'start' });
        const nb = $('[data-value="mismatch"]', row);
        if (nb) nb.focus({ preventScroll: true });
        break;
      }
      case 'ev-miss': {
        // 評価の結果カードの未入力の数（必須条件 n・確認点 n・人物像 n・総合判断）: その種類の最初の未入力の行を帯の下に出し、その行の操作（一致・○・1 点・採用）にフォーカス（16-7）
        const sel = { must: '.ev-must .cl-must-row.is-missing', rate: '.cl-rate-row.is-missing', ps: '#clPersona .cl-ps-row.is-missing', overall: '.cl-overall-row.is-missing' }[b.dataset.miss];
        const row = sel ? $(sel, $('#stepContent')) : null;
        if (!row) break;
        const ctl = b.dataset.miss === 'ps' ? ($('.cl-ps-btn[tabindex="0"]', row) || $('.cl-ps-btn', row)) : $('.seg-btn', row);
        row.scrollIntoView({ block: 'center' });
        if (ctl) ctl.focus({ preventScroll: true });
        break;
      }
      case 'ev-time': {
        // 「面接時間を確かめてください」（評価の結果カード・報告書の確認事項）: 評価の面接時間の欄へ（docs/SPEC-flow.md 15 章。面接時間のカードは評価の最後）
        if (state.step !== 3) goStep(3);
        const tm = $('#evTimeMin');
        if (tm) { tm.scrollIntoView({ block: 'center', behavior: 'auto' }); tm.focus({ preventScroll: true }); tm.select(); }
        break;
      }
      case 'iv-said':
        ivSaid(b.dataset.sec, b.dataset.kind);
        break;
      case 'iv-said-items': {
        // 「一部説明しなかった ▾」: 項目ごとのチェックボックスを出す／たたむ（そのリストだけ描き直す。画面の状態だけ）
        const key = b.dataset.sec + ':' + b.dataset.kind;
        state.ivItems[key] = !ivItemsOpen(b.dataset.sec, b.dataset.kind);
        ivRerenderSay(b.dataset.sec, b.dataset.kind);
        const nb = $('[data-action="iv-said-items"][data-sec="' + b.dataset.sec + '"][data-kind="' + b.dataset.kind + '"]');
        if (nb) nb.focus();
        break;
      }
      case 'cl-set': {
        const path = b.dataset.cl;
        const v = b.dataset.value || '';
        ensureChecklist();
        // 面接で必須条件の案内が出る・消えると、その分だけ本文が上下にずれる（狭い画面では上の帯が固定でないので、押した行が画面の外へ出る）。押したボタンを同じ位置に保つ
        const y0 = b.getBoundingClientRect().top;
        clSet(path, String(clGet(path)) === v ? '' : v);
        touchChecklist();
        syncClButtons(path);   // 準備（応募した求人）は updateChecklistUI の対象外のため
        updateChecklistUI();
        if (state.step === 2 && b.isConnected) {
          const dy = b.getBoundingClientRect().top - y0;
          if (Math.abs(dy) > 1) window.scrollBy(0, dy);
        }
        break;
      }
      case 'print-checklist':
        printChecklistSheet();
        break;
      case 'print-paper':
        // 面接記入シート（手書き用）。氏名が空でも印刷できる（必須チェックをしない。docs/SPEC-persona.md 3-1）
        printPaperSheet();
        break;
      case 'ps-set': {
        // 人物像の点（もう一度押すと未入力に戻す。全体は描き直さない＝フォーカスを保つ）
        const id = b.dataset.persona, n = Number(b.dataset.score);
        if (!id || !(n >= 1 && n <= R.PERSONA_SCALE)) break;
        psSet(id, psGet(id) === n ? 0 : n);
        break;
      }
      case 'save':
        saveRecord();
        break;
      case 'unlock-final':
        if (refreshProfileFromStorage()) break;
        unlockFinal(b.closest('.final-lock'));
        break;
      case 'stamp': {
        // 別のタブで設定（最終承認のパスワード）が変わっていたら、最新の設定で描き直すだけ（押さない）
        if (refreshProfileFromStorage()) break;
        const box = b.closest('.stamp-box');
        const fid = box && box.dataset.fieldId;
        if (!fid || finalNeedsPw(fid)) break;
        const sel = box.querySelector('select');
        const v = sel ? sel.value : '';
        const mg = state.profile.management || {};
        let m = null;
        if (v === '__free') {
          const inp = box.querySelector('input[type="text"]');
          const nm = inp ? inp.value.trim() : '';
          if (!nm) { toast('氏名を入力してください', 'error'); if (inp) inp.focus(); break; }
          m = { name: nm, short: Stamp.shortName(nm), title: '' };
        } else {
          m = (mg.managers || [])[Number(v)];
          if (v === '' || !m) { toast('担当者を選んでください', 'error'); break; }
        }
        state.management[fid] = { name: m.name, short: m.short || Stamp.shortName(m.name), title: m.title || '', date: Stamp.stampDate(new Date()), at: new Date().toISOString() };
        state.dirty = true;
        rerenderManagementCard();
        rerenderReportPaper();
        renderSummary();
        toast(m.name + ' さんの印を押しました', 'ok');
        break;
      }
      case 'unstamp': {
        if (refreshProfileFromStorage()) break;
        const box = b.closest('.stamp-box');
        const fid = box && box.dataset.fieldId;
        if (fid && state.management[fid] && !finalNeedsPw(fid)) { delete state.management[fid]; state.dirty = true; rerenderManagementCard(); rerenderReportPaper(); renderSummary(); }
        break;
      }
      case 'decide':
        if (refreshProfileFromStorage()) break;
        decide(b.dataset.value);
        break;
      case 'undecide':
        if (refreshProfileFromStorage() || finalNeedsPw('')) break;
        state.decision = null;
        state.dirty = true;
        rerenderDecisionCard();
        rerenderReportPaper();
        renderSummary();
        toast('最終合否を取り消しました');
        break;
      default:
        break;
    }
  }

  // 面接の Ctrl＋Enter（Mac は ⌘＋Enter）＝右下の主ボタン（変換中は無視。docs/SPEC-flow.md 3-9）・
  //   最終承認のパスワード欄で Enter（［確認］と同じ）・人物像のボタンのキーボード操作（onPersonaKey）
  let ivShortcut = false;   // Ctrl＋Enter から［次へ］を押しているあいだ（ivMustHold は［一致］へフォーカスを移す。キーボードで［次へ］そのものを押したときと分ける）
  function onContentKey(e) {
    const t = e.target;
    // 面接のボタンの上の Enter・Space の押しっぱなし（キーリピート）は捨てる（［一致］［説明した］などが付いたり外れたりしない・［次へ］の 1 回目の案内を飛ばして進まない。
    //   docs/SPEC-flow.md 16-10）。Ctrl＋Enter のキーリピートは下で捨てる
    if (state.step === 2 && e.repeat && (e.key === 'Enter' || e.key === ' ') && !(e.ctrlKey || e.metaKey) && t && t.closest && t.closest('button')) { e.preventDefault(); return; }
    if (state.step === 2 && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing && e.keyCode !== 229) {
      const nx = $('#ivNext');
      if (nx) {
        e.preventDefault();
        if (!e.repeat) { ivShortcut = true; try { nx.click(); } finally { ivShortcut = false; } }   // 押しっぱなし（キーリピート）で段階を飛ばさない
      }
      return;
    }
    if (t && t.dataset && t.dataset.persona) { onPersonaKey(e, t); return; }
    if (e.key !== 'Enter' || !t || !t.classList || !t.classList.contains('final-lock-pw')) return;
    e.preventDefault();
    if (refreshProfileFromStorage()) return;
    unlockFinal(t.closest('.final-lock'));
  }

  function focusFirst(el, msg) {
    toast(msg, 'error');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el.focus) el.focus();
  }

  function isIntText(v) { return /^\d+$/.test(String(v).trim()); }

  // =====================================================================
  // 面接チェックリストの回答（面接台本。docs/SPEC-checklist.md 2 章・docs/SPEC-flow.md 6 章）
  // =====================================================================
  // 台本は profile.checklist、回答は state.checklist（項目 id をキーにしたフラットな values / notes ＋ overall ＋ header ＋ persona ＋ timing）。
  // 入力で全体を再描画しない（フォーカス・変換中の文字を保つ）。表示の更新は updateChecklistUI() に集約する（面接 → updateInterviewUI・評価 → updateEvalUI）
  function clDefNow() { return (state.profile && U.isObj(state.profile.checklist)) ? state.profile.checklist : {}; }
  function clSummary() {
    return R.checklistSummary(state.applicant, state.checklist, state.profile, { management: state.management });
  }
  function ensureChecklist() {
    if (!U.isObj(state.checklist)) state.checklist = R.emptyChecklist();
    const cl = state.checklist;
    ['header', 'values', 'notes'].forEach(function (k) { if (!U.isObj(cl[k])) cl[k] = k === 'header' ? R.emptyChecklist().header : {}; });
    // 人物像の回答。null（人物像の導入前に保存した記録）は {} に戻さない（読み込み直しても判定を変えない。docs/SPEC-persona.md D2）
    if (cl.persona !== null && !U.isObj(cl.persona)) cl.persona = {};
    return cl;
  }
  function clGet(path) { const v = U.getPath(state.checklist, path); return v == null ? '' : v; }
  // values.* / notes.* は空にするとき消す（回答なし＝未入力）。header.* / overall は '' にする
  function clSet(path, v) {
    ensureChecklist();
    const m = /^(values|notes)\.(.+)$/.exec(path);
    if (m && (v === '' || v === false)) { delete state.checklist[m[1]][m[2]]; return; }
    U.setPath(state.checklist, path, v);
  }
  // チェックリストの変更
  function touchChecklist() {
    state.checklist.updatedAt = new Date().toISOString();
    state.dirty = true;
    invalidateJudgment();
  }
  function overallLabelNow(v) {
    const oo = clDefNow().overallOptions || {};
    return v ? (oo[v] || { hire: '採用', hold: '保留', reject: '不採用' }[v] || v) : '';
  }
  // 1 ページの報告書・記入シートと同じ短い名前（short → 既定の台本の short → 文言の先頭 14 文字）
  function shortLabel(it) { return S.checklistShortLabel(it); }

  // ボタン式の選択（セグメントボタン .seg。data-action="cl-set"。押下中を再度押すと解除。docs/DESIGN.md 3-4）。
  //   押下中の色は値の class で決まる（一致・○・採用＝緑／△・保留＝琥珀／不一致・×・不採用＝赤／ほか＝紺）。o: { cls, aria, labelledby }
  function clSegHtml(path, options, o) {
    o = o || {};
    const cur = String(clGet(path));
    return '<div class="seg' + (o.cls ? ' ' + o.cls : '') + '" role="group"' + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + (o.labelledby ? ' aria-labelledby="' + esc(o.labelledby) + '"' : '') + '>' + options.map(function (op) {
      const on = cur === String(op.value);
      return '<button type="button" class="seg-btn' + (op.cls ? ' ' + op.cls : '') + (on ? ' active' : '') + '" data-action="cl-set" data-cl="' + esc(path) + '" data-value="' + esc(op.value) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '"' + (op.title ? ' title="' + esc(op.title) + '"' : '') + '>' + (op.html || esc(op.label)) + '</button>';
    }).join('') + '</div>';
  }

  // ボタン式の選択の押下状態を現在値に合わせる（path のボタンだけ。準備の「応募した求人」用）
  function syncClButtons(path) {
    $$('[data-action="cl-set"]').forEach(function (b) {
      if (b.dataset.cl !== path) return;
      const on = String(clGet(path)) === b.dataset.value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  // root の中のボタン式の選択を全部合わせる
  function syncSegButtons(root) {
    $$('[data-action="cl-set"]', root).forEach(function (b) {
      const on = String(clGet(b.dataset.cl)) === b.dataset.value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // 面接日が空なら今日を入れる（dirty にしない）
  function fillChecklistDefaults() {
    ensureChecklist();
    if (!state.checklist.header.date) state.checklist.header.date = U.fmtDate(new Date());
  }

  function clBadge(tone, text, id) {
    return '<span class="badge ' + (tone || '') + '"' + (id ? ' id="' + id + '"' : '') + '>' + esc(text) + '</span>';
  }

  // 必須条件の行（面接の「確かめること」と評価の段階のカードで同じ部品。左にラベル・右の操作列に［一致｜不一致］。docs/DESIGN.md 3-3）。
  //   ［不一致］にした行は .is-ng（地を淡い赤。updateInterviewUI・updateEvalUI）。withBadge: 評価の「未確認」の印（未入力の行だけ見える）
  function mustRowHtml(it, withBadge) {
    const ng = clGet('values.' + it.id) === 'mismatch';
    return '<div class="row cl-must-row' + (ng ? ' is-ng' : '') + '" data-item="' + esc(it.id) + '"><div class="row-label"><span class="cl-label">' + esc(it.label) + '</span>' +
        (withBadge ? '<span class="badge warn ev-miss">未確認</span>' : '') + '</div>' +
      '<div class="row-ctl">' + clSegHtml('values.' + it.id, [{ value: 'match', label: '一致', cls: 'match' }, { value: 'mismatch', label: '不一致', cls: 'mismatch' }], { aria: it.label }) + '</div></div>';
  }
  // 台本の編集でメモを付けたブロック（質問以外）のメモ欄（そのブロックのカードの本文の末尾。ラベルが上の欄）
  function blockMemoHtml(b) {
    return '<div class="field iv-memo" data-block="' + esc(b.id) + '"><label for="ivMemo-' + esc(b.id) + '">' + esc(b.memoLabel || 'メモ') + '</label>' +
      '<textarea id="ivMemo-' + esc(b.id) + '" rows="2" data-cl="notes.' + esc(b.id) + '">' + esc(clGet('notes.' + b.id)) + '</textarea></div>';
  }
  // 文字の記入欄の見本（空の欄が無効に見えないよう。docs/DESIGN.md 3-5）: 台本の placeholder（任意）→ 既定の台本の例（文言が既定のままの欄だけ）→「記入」
  const FIELD_EXAMPLES = { busy_ng: '例：12/24〜12/26', open_late: '例：タクシー可・25時まで可' };
  function fieldPlaceholder(it) {
    if (typeof it.placeholder === 'string' && it.placeholder.trim()) return it.placeholder.trim();
    const ex = FIELD_EXAMPLES[it.id];
    if (ex) {
      let d = null;
      ((((global.RECRUIT_DEFAULT_PROFILE || {}).checklist || {}).sections) || []).forEach(function (s) {
        (s.blocks || []).forEach(function (b) { (b.items || []).forEach(function (x) { if (x.id === it.id) d = x; }); });
      });
      if (d && d.label === it.label) return ex;
    }
    return '記入';
  }
  // 記入欄の行（面接の「確かめること」。選択肢は紺のセグメントボタン、日付・月・文字は入力欄。qTag: 聞くことの質問と同じ短い名前なら「Q1」のタグ）
  function fieldRowHtml(it, qTag) {
    const path = 'values.' + it.id;
    let ctl, fid = '';
    if (it.kind === 'choice') {
      ctl = clSegHtml(path, (Array.isArray(it.options) ? it.options : []).map(function (o) { return { value: o.value, label: o.label || o.value }; }), { aria: it.label });
    } else {
      const type = it.kind === 'date' ? 'date' : it.kind === 'month' ? 'month' : 'text';
      fid = 'ivF-' + it.id;
      ctl = '<input type="' + type + '" id="' + esc(fid) + '" data-cl="' + esc(path) + '" value="' + esc(clGet(path)) + '"' + (type === 'text' ? ' placeholder="' + esc(fieldPlaceholder(it)) + '"' : '') + '>';
    }
    const tag = qTag ? '<span class="q-no" title="聞くことの ' + esc(qTag) + ' の答え">' + esc(qTag) + '</span>' : '';
    return '<div class="row cl-field" data-item="' + esc(it.id) + '">' +
      (fid ? '<label class="row-label" for="' + esc(fid) + '">' + esc(it.label) + tag + '</label>' : '<div class="row-label">' + esc(it.label) + tag + '</div>') +
      '<div class="row-ctl">' + ctl + '</div></div>';
  }
  // 必須条件の不一致と打ち切り（docs/SPEC-flow.md 3-8・F14）。gateReject: 不採用推奨に固定（設定 mustFailResult が review でない）。
  //   省略できる段階 = 必須条件の段階より後〜案内先より前
  function mustGateInfo(sum) {
    const def = sum.def;
    const mm = sum.must.mismatch > 0;
    const gateReject = mm && def.mustFailResult !== 'review';
    const mustIdx = sum.sections.findIndex(function (s) { return s.blocks.some(function (b) { return b.type === 'must'; }); });
    const jumpIdx = sum.sections.findIndex(function (s) { return s.id === def.mustFailJumpTo; });
    return {
      mm: mm, gateReject: gateReject, jump: jumpIdx >= 0 ? sum.sections[jumpIdx] : null,
      skippable: function (i) { return gateReject && mustIdx >= 0 && jumpIdx >= 0 && i > mustIdx && i < jumpIdx; }
    };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // 06:12（タイマー。60 分以上は「61:05」）・6:12（評価の画面の段階ごとの時間）
  function fmtClock(sec) { sec = Math.max(0, Math.floor(Number(sec) || 0)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }
  function fmtMs(sec) { sec = Math.max(0, Math.floor(Number(sec) || 0)); return Math.floor(sec / 60) + ':' + pad2(sec % 60); }

  // =====================================================================
  // 面接（step 2。1 段階ずつの進行画面。docs/SPEC-flow.md 3 章）
  //   上の帯（段階のチップ・タイマー・必須条件の案内）→ 1 段階だけ（確かめること・話すこと・聞くこと。1100px 以上は 2 列）→ 下の操作行（前へ／次へ）。
  //   ○△×・人物像・総合判断は出さない（評価の画面で付ける）。必須条件だけは面接中に付ける
  // =====================================================================
  // 台本の段階（設定の編集が反映される。表示に要る分だけ台本から作る＝タイマーの毎秒の表示で checklistSummary を作らない）
  function ivSections() {
    return (Array.isArray(clDefNow().sections) ? clDefNow().sections : []).filter(function (s) { return U.isObj(s); }).map(function (s, i) {
      return { id: s.id, noMark: R.circled(i + 1), title: String(s.title == null ? '' : s.title), minutes: Math.max(0, Math.floor(R.num(s.minutes, 0))), minutesMax: s.minutesMax === true };
    });
  }
  // 今の段階（最後に表示した段階。台本の編集で無くなっていれば最初の段階）
  function ivCurrentSec() {
    const t = ivTimingRead(), ss = ivSections();
    return ss.some(function (s) { return s.id === t.stage; }) ? t.stage : (ss[0] || {}).id;
  }
  function ivShow(sec) { ivMustUnwarn(); ivTiming().stage = sec; renderStep(); ivFocusHead(); }
  // 右下の主ボタン（［次へ］・最後の段階の［面接を終えて評価へ］。Ctrl＋Enter も）の前の必須条件（docs/SPEC-flow.md 16-7）: 今の段階に未確認の必須条件が残っていれば
  //   （不一致で打ち切り〔不採用推奨に固定〕のときは残りは任意なので除く）、1 回目は進まずに確かめることの最初の未確認の行を出してその［一致］にフォーカスし、短い案内を出す。
  //   続けてもう一度押したら進む（案内はその段階を表示しているあいだ 1 回。段階を移る・画面を移ると消える）。案内のあいだ未確認の行は琥珀の地（.is-missing。確かめると消える）
  let ivMustWarned = '';   // 案内を出した段階の id
  const IV_MUST_MSG = '必須条件がまだです。確かめてから進んでください（もう一度押すとそのまま進みます）';
  //   段階・画面を移ったら案内を消す（出したままの案内〔トースト〕も）
  function ivMustUnwarn() {
    if (ivMustWarned) { const t = $('#toast'); if (t && t.textContent === IV_MUST_MSG) t.classList.remove('show'); }
    ivMustWarned = '';
  }
  function ivMustOpen(sec) {
    if (mustGateInfo(clSummary()).gateReject) return [];
    return R.checklistItems(clDefNow(), 'must').filter(function (x) { return x.section.id === sec && !clGet('values.' + x.item.id); }).map(function (x) { return x.item.id; });
  }
  //   keepFocus: キーボード（Enter・Space）で［次へ］そのものを押した（docs/SPEC-flow.md 16-10）。フォーカスは［次へ］に残す（行を出す・琥珀・案内は同じ）。
  //   ［一致］へ移すと、案内どおり「もう一度押す」次の Enter が［一致］に当たり、確かめていない必須条件が一致として記録されたため。マウス・Ctrl＋Enter は［一致］へ移す
  function ivMustHold(keepFocus) {
    const sec = ivCurrentSec();
    if (ivMustWarned === sec) return false;
    const open = ivMustOpen(sec);
    const row = open.length ? $('#ivStage .cl-must-row[data-item="' + (window.CSS && CSS.escape ? CSS.escape(open[0]) : open[0]) + '"]') : null;
    if (!row) return false;
    ivMustWarned = sec;
    updateInterviewUI();
    row.scrollIntoView({ block: 'center' });
    const mb = keepFocus ? null : $('[data-value="match"]', row);
    if (mb) mb.focus({ preventScroll: true });
    toast(IV_MUST_MSG, 'warn', 4500);
    return true;
  }
  // 段階を出したら見出しにフォーカスしてページの先頭へ（見出しはフォーカス枠を出さない。3-9）。
  //   840px 以下はサイドバーが本文の上に並ぶので、本文（トップバー）の先頭へ（［次へ］のたびにサイドバーまで戻さない）
  function ivFocusHead() {
    const main = $('.main');
    const narrow = !!(window.matchMedia && window.matchMedia('(max-width: 840px)').matches);
    window.scrollTo(0, narrow && main ? Math.max(0, Math.round(main.getBoundingClientRect().top + window.scrollY)) : 0);
    const h = $('#ivStageH');
    if (!h) return;
    try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
  }

  // ---------- タイマー（docs/SPEC-flow.md 3-7・F10〜F12） ----------
  //   Date.now() の差分で、面接の段階を表示しているあいだだけ数える。段階の切り替え・面接を離れる・保存・印刷のときに perStage[段階 id] へ秒を足す
  //   （1 秒未満は持ち越す）。時計が戻ったら 0 とみなす（負にしない）。記録の変更（dirty）・判定のやり直し・右サマリーの描き直しはしない。
  //   数えているのは常に 1 つ（ivStart が先に ivStop）。renderStep を何度呼んでも二重に数えない
  let ivClock = null;   // { sec, since: Date.now() の値, iv: setInterval の id }
  function ivTiming() {
    const cl = ensureChecklist();
    if (!U.isObj(cl.timing)) cl.timing = {};
    if (!U.isObj(cl.timing.perStage)) cl.timing.perStage = {};
    return cl.timing;
  }
  // 読むだけ（記録が無ければ作らない＝面接を開いていない記録の形を変えない）
  function ivTimingRead() { const cl = state.checklist; return U.isObj(cl) && U.isObj(cl.timing) ? cl.timing : {}; }
  function ivElapsed() { return ivClock ? Math.max(0, Math.floor((Date.now() - ivClock.since) / 1000)) : 0; }
  function ivCommit() {
    if (!ivClock) return;
    const now = Date.now();
    if (now < ivClock.since) { ivClock.since = now; return; }
    const add = Math.floor((now - ivClock.since) / 1000);
    if (!add) return;
    const t = ivTiming();
    t.perStage[ivClock.sec] = (Number(t.perStage[ivClock.sec]) || 0) + add;
    ivClock.since += add * 1000;
  }
  // ended: 評価・報告書へ進むとき（面接の終了時刻 endedAt を最後に離れた時刻で上書き）
  function ivStop(ended) {
    if (ivClock) { ivCommit(); clearInterval(ivClock.iv); ivClock = null; }
    const cl = state.checklist;
    if (ended && U.isObj(cl) && U.isObj(cl.timing) && cl.timing.startedAt) cl.timing.endedAt = new Date(Date.now()).toISOString();
  }
  // 面接の段階 sec を数え始める（面接を初めて表示したら startedAt。「面接を始める」以外の経路〔サイドバー・読み込み〕でも）。
  //   タイマー導入前に回答して保存した記録（state.ivNoTimer）は数えない（段階の移動だけ。直した時間を面接時間として報告書に載せない）
  function ivStart(sec) {
    ivStop(false);
    const t = ivTiming();
    t.stage = sec;
    if (state.ivNoTimer) return;   // タイマー導入前の記録（読み込んだ回答のある記録で timing が無い）は数えない
    if (!t.startedAt) t.startedAt = new Date(Date.now()).toISOString();
    if (!Object.prototype.hasOwnProperty.call(t.perStage, sec)) t.perStage[sec] = 0;
    ivClock = { sec: sec, since: Date.now(), iv: setInterval(ivTick, 1000) };
  }
  // 準備の「面接を始める」（回答がまだ無いとき。docs/SPEC-flow.md 15 章）: 本番の前に面接・評価の画面を下見していても、その時間・最後に見た段階・終了時刻を捨てて
  //   最初の段階から数え直す（goStep(2) の ivStart が startedAt を入れ直す）。評価・報告書は下見の前と同じく、また進むまで押せない
  function ivRestart() {
    ivStop(false);
    const cl = ensureChecklist();
    if (U.isObj(cl.timing)) delete cl.timing;
    state.ivItems = {};
    state.ivNoTimer = false;
    state.maxStepReached = 1;
  }
  function ivStageSec(sec) { const p = ivTimingRead().perStage || {}; return (Number(p[sec]) || 0) + (ivClock && ivClock.sec === sec ? ivElapsed() : 0); }
  function ivTotalSec() { const p = ivTimingRead().perStage || {}; return Object.keys(p).reduce(function (a, k) { return a + (Number(p[k]) || 0); }, 0) + ivElapsed(); }
  // 表示だけ（この段階の経過・目安を過ぎたら琥珀〔.is-over〕・1.5 倍で赤〔.is-late〕・合計）。止めない・音を出さない・toast を出さない
  function ivTick() {
    if (!ivClock || !$('#ivTimer')) return;
    const s = ivSections().find(function (x) { return x.id === ivClock.sec; }) || {};
    const sec = ivStageSec(ivClock.sec), lim = (s.minutes || 0) * 60;
    setText('#ivTStageVal', fmtClock(sec));
    setText('#ivTTotal', fmtClock(ivTotalSec()));
    const st = $('#ivTStage');
    if (st) { st.classList.toggle('is-over', lim > 0 && sec > lim); st.classList.toggle('is-late', lim > 0 && sec >= lim * 1.5); }
  }

  // ---------- 話すこと（説明・合否連絡。docs/SPEC-flow.md 3-4・F6・F7） ----------
  //   段階×種類（explain／notify）の項目。all: 全項目／shown: 画面に出す項目／targets: 「説明した」の対象／mark: 「短期のみ」の印を付ける（求人が未選択）。
  //   短期のみ（shortOnly）の項目は 求人「短期」→ 出す（対象）／未選択 → 印つきで出す（対象外）／それ以外（通常）→ 出さない
  function ivSayItems(sec, kind) {
    const posting = String((ensureChecklist().header || {}).posting || '');
    const sd = (Array.isArray(clDefNow().sections) ? clDefNow().sections : []).find(function (s) { return U.isObj(s) && s.id === sec; });
    const its = [];
    (sd && Array.isArray(sd.blocks) ? sd.blocks : []).forEach(function (b) {
      if (!U.isObj(b) || b.type !== kind) return;
      (Array.isArray(b.items) ? b.items : []).forEach(function (it) { if (U.isObj(it) && it.id) its.push(it); });
    });
    const so = function (it) { return kind === 'explain' && it.shortOnly === true; };
    return {
      all: its.map(function (it) { return it.id; }),
      shown: its.filter(function (it) { return !so(it) || posting === 'short' || posting === ''; }),
      targets: its.filter(function (it) { return !so(it) || posting === 'short'; }),
      mark: posting === ''
    };
  }
  function ivSaidOn(it) { return clGet('values.' + it.id) === true; }
  // on（対象が全部済み）／mixed（一部）／off
  function ivSayState(x) {
    if (x.targets.length && x.targets.every(ivSaidOn)) return 'on';
    return x.targets.some(ivSaidOn) || x.shown.some(ivSaidOn) ? 'mixed' : 'off';
  }
  // ［説明した］: 済みなら全項目を外す（通常求人のときに付けていた短期のみも）、それ以外は対象を全部付ける
  function ivSaid(sec, kind) {
    const x = ivSayItems(sec, kind);
    if (!x.targets.length) return;
    const clear = ivSayState(x) === 'on';
    (clear ? x.all : x.targets.map(function (it) { return it.id; })).forEach(function (id) { clSet('values.' + id, !clear); });
    touchChecklist();
    updateChecklistUI();
  }
  // 「一部説明しなかった ▾」を開いているか（開け閉めしていなければ、一部だけ済みのときに開く）
  function ivItemsOpen(sec, kind) {
    const v = state.ivItems[sec + ':' + kind];
    return typeof v === 'boolean' ? v : ivSayState(ivSayItems(sec, kind)) === 'mixed';
  }
  // 「一部説明しなかった ▾」のボタンの中身（文字と ▾▴ は textContent に残し、見た目は SVG。docs/DESIGN.md 2 章）
  function ivPartInner(kind, open) {
    return '<span>' + (kind === 'notify' ? '一部伝えなかった' : '一部説明しなかった') + '</span>' + sym(open ? ' ▴' : ' ▾') + ico(open ? 'chevron-up' : 'chevron-down');
  }
  // 読み上げ用のリスト（閉じているときはタブ位置・クリックの処理を付けない）／項目ごとのチェックボックス（.is-items）
  function ivSayListHtml(sec, kind) {
    const x = ivSayItems(sec, kind);
    const open = ivItemsOpen(sec, kind);
    return '<ul class="iv-say-list' + (open ? ' is-items' : '') + '" data-sec="' + esc(sec) + '" data-kind="' + esc(kind) + '">' + x.shown.map(function (it) {
      const so = kind === 'explain' && it.shortOnly === true;
      const tag = so && x.mark ? '<span class="badge tag">短期のみ</span>' : '';
      const cls = 'iv-say-i' + (so ? ' short-only' : '');
      if (!open) return '<li class="' + cls + '" data-item="' + esc(it.id) + '">' + esc(it.label) + tag + '</li>';
      const on = ivSaidOn(it);
      return '<li class="' + cls + (on ? ' is-on' : '') + '" data-item="' + esc(it.id) + '"><label><input type="checkbox" data-cl="values.' + esc(it.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(it.label) + tag + '</span></label></li>';
    }).join('') + '</ul>';
  }
  // 話すことのカード（段階×種類〔説明・合否連絡〕に 1 枚。docs/DESIGN.md 4-3）: 帯の右端に「一部説明しなかった ▾」（ゴースト）と［説明した］（トグル。操作列と同じ 280px）。
  //   本文は 注記（台本の ※）→ 読み上げる項目（段階のその種類の全項目を 1 つのリストで）→ ブロックのメモ
  function ivSayCardHtml(s, kind) {
    const blocks = s.blocks.filter(function (b) { return b.type === kind; });
    const posting = String((ensureChecklist().header || {}).posting || '');
    const open = ivItemsOpen(s.id, kind);
    const x = ivSayItems(s.id, kind);
    //   説明の注記（既定「※は短期求人に応募の場合のみご説明ください」）は短期のみの項目に印を付けて出すとき（求人が未選択）だけ。短期のみの項目が無いブロックの注記・合否連絡の注記は常に
    const notes = blocks.filter(function (b) {
      if (!b.note) return false;
      return kind === 'notify' || !b.items.some(function (it) { return it.shortOnly === true; }) || posting === '';
    }).map(function (b) { return '<p class="iv-note">' + ico('info') + '<span>' + esc(b.note) + '</span></p>'; }).join('');
    //   合否連絡はどの段階とも同じ 話す → 聞く の並びで上に来るが、伝えるのは聞くこと（逆質問）のあと＝面接の最後。その段階に質問があれば、本文の先頭に順番を 1 行（アプリの文。台本の注記はそのまま。
    //   docs/SPEC-flow.md 16-7）
    const ss = ivSections();
    const askBelow = kind === 'notify' && s.blocks.some(function (b) { return b.type === 'question' && b.items.length; });
    const order = askBelow ? '<p class="iv-note iv-order">' + ico('arrow-down') + '<span>' + esc((s.title ? s.title + '（下の「聞くこと」）' : '下の「聞くこと」') + 'が終わったら、' +
      (ss.length && ss[ss.length - 1].id === s.id ? '面接の最後に' : '') + '伝えて［伝えた］を押します') + '</span></p>' : '';
    const nb = blocks.find(function (b) { return b.title; });
    const kindName = kind === 'notify' ? ((nb && nb.title) || '合否連絡') : '説明';
    const verb = kind === 'notify' ? '伝えた' : '説明した';
    //   トグルの中身（アイコン・✓ の .sym・文字）は作り直さない（updateInterviewUI が href と文字だけ替える）。メモ欄に書いた直後に押すと、押した瞬間の change で中身が
    //   差し替わり、押していた要素が外れてクリックが届かなかったため（2026-10-19）
    const actions = '<button type="button" class="btn sm ghost iv-said-part" data-action="iv-said-items" data-sec="' + esc(s.id) + '" data-kind="' + esc(kind) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' + ivPartInner(kind, open) + '</button>' +
      '<button type="button" class="btn toggle iv-said" data-action="iv-said" data-sec="' + esc(s.id) + '" data-kind="' + esc(kind) + '" aria-pressed="false">' + ico('circle') + sym('') + '<span class="iv-said-t">' + verb + '</span></button>';
    return cardHtml({ id: 'ivSay-' + kind, cls: 'iv-grp k-say', attrs: ' data-kind="say" data-say="' + esc(kind) + '"', icon: 'say', title: '話すこと', titleCls: 'iv-k',
      small: esc(kindName + ' ' + x.shown.length + ' 項目'), actions: actions, actCls: 'iv-k-act' },
      order + notes + ivSayListHtml(s.id, kind) + blocks.filter(function (b) { return b.memo; }).map(blockMemoHtml).join(''));
  }
  // 項目ごとの表示を切り替えたとき: そのリストと開くボタンだけ描き直す
  function ivRerenderSay(sec, kind) {
    const sel = '[data-sec="' + sec + '"][data-kind="' + kind + '"]';
    const ul = $('.iv-say-list' + sel);
    if (ul) { const tmp = document.createElement('div'); tmp.innerHTML = ivSayListHtml(sec, kind); ul.replaceWith(tmp.firstElementChild); }
    const pb = $('[data-action="iv-said-items"]' + sel);
    if (pb) { const open = ivItemsOpen(sec, kind); pb.setAttribute('aria-expanded', open ? 'true' : 'false'); pb.innerHTML = ivPartInner(kind, open); }
    updateChecklistUI(true);
  }

  // ---------- 聞くこと（全段階で同じ形: Q 番号・質問文〔17/400〕・すぐ下に答えのメモ。docs/DESIGN.md 3-12・docs/SPEC-flow.md 3-5） ----------
  function ivQText(label) { const t = String(label == null ? '' : label).trim(); return /^「/.test(t) ? t : '「' + t + '」'; }
  //   qBlocks: その段階の質問ブロック（台本の順）・qs: 質問（{ it, no }。Q の番号は段階の中で通し）。ブロックの注記はそのブロックの質問の前、
  //   2026-10-16 より前の記録の「（以前のメモ）」はそのブロックの質問のあと（値があるときだけ。直せる）
  function ivAskCardHtml(qBlocks, qs) {
    let k = 0;
    const body = qBlocks.map(function (b) {
      return (b.note ? '<p class="iv-note">' + ico('info') + '<span>' + esc(b.note) + '</span></p>' : '') + b.items.map(function (it) {
        const no = qs[k++].no;
        //   カードの中のタブ位置はメモ欄だけ（Tab で次の質問のメモへ）。メモを取らない質問ブロック（memo: false）は質問文だけ
        return '<div class="iv-q" data-item="' + esc(it.id) + '"><span class="q-no">Q' + no + '</span><div class="iv-q-main"><p class="iv-q-text">' + esc(ivQText(it.label)) + '</p>' +
          (b.memo ? '<textarea class="memo iv-q-memo" data-cl="notes.' + esc(it.id) + '" rows="1" placeholder="答えをメモ" aria-label="' + esc('Q' + no + ' ' + shortLabel(it) + ' の答え') + '">' + esc(clGet('notes.' + it.id)) + '</textarea>' : '') +
        '</div></div>';
      }).join('') +
      (String(b.memoText || '').trim() ? '<div class="field iv-oldmemo" data-block="' + esc(b.id) + '"><label for="ivOld-' + esc(b.id) + '">（以前のメモ）</label>' +
        '<textarea id="ivOld-' + esc(b.id) + '" rows="2" data-cl="notes.' + esc(b.id) + '">' + esc(clGet('notes.' + b.id)) + '</textarea></div>' : '');
    }).join('');
    return cardHtml({ id: 'ivAsk', cls: 'iv-grp k-ask', attrs: ' data-kind="ask"', icon: 'ask', title: '聞くこと', titleCls: 'iv-k', small: qs.length + ' 問' }, body);
  }

  // ---------- 確かめること（必須条件・記入欄。いつも最後のカード＝［次へ］のすぐ上） ----------
  //   行は「左にラベル・右に固定幅の操作列」。グループは A4 の用紙と同じ分け方: 「必須条件」＝ 必須条件の行＋その直後の記入欄（① の 土日勤務可否・出勤不可な繁忙）／
  //   「勤務条件の確認」＝ ほかの記入欄（台本の【質問】の記入欄〔短期／長期の希望・契約開始日の希望など〕もここ。質問ブロックの直前の記入欄があれば注記「応募者に聞いて選ぶ・記入する」）。
  //   質問と同じ短い名前の記入欄には Q 番号のタグ（既定の台本では「短期／長期の希望」と Q1）。タグのある欄だけ注記の後ろに「（Q1 は聞くことの答え）」
  //   （質問の無い欄〔契約開始日の希望・初回契約終了・OPEN／25時〕まで聞くことの答えと読ませない。docs/DESIGN.md 4-3）
  function ivCheckCardHtml(s, qs) {
    const must = [], terms = [], memos = [], mustNotes = [], termQs = [];
    let afterMust = false, askTerms = false, n = 0;
    const qOf = function (it) { const sl = shortLabel(it); const q = qs.find(function (x) { return shortLabel(x.it) === sl; }); return q ? 'Q' + q.no : ''; };
    s.blocks.forEach(function (b, j) {
      if (b.type === 'must') {
        b.items.forEach(function (it) { must.push(mustRowHtml(it, false)); n++; });
        if (b.note) mustNotes.push(b.note);
        if (b.memo) memos.push(blockMemoHtml(b));
        afterMust = true;
        return;
      }
      if (b.type === 'fields') {
        const qn = b.items.map(qOf);
        const rows = b.items.map(function (it, k) { n++; return fieldRowHtml(it, qn[k]); });
        if (afterMust) Array.prototype.push.apply(must, rows);
        else {
          Array.prototype.push.apply(terms, rows);
          Array.prototype.push.apply(termQs, qn.filter(Boolean));
          if (rows.length && s.blocks[j + 1] && s.blocks[j + 1].type === 'question') askTerms = true;
        }
        if (b.memo) memos.push(blockMemoHtml(b));
      }
      afterMust = false;
    });
    if (!n && !memos.length) return '';
    const body = (n ? '<div class="rows">' +
        (must.length ? '<p class="group-h">必須条件' + (mustNotes.length ? '<small>' + esc(mustNotes.join('　')) + '</small>' : '') + '</p>' + must.join('') : '') +
        (terms.length ? '<p class="group-h">勤務条件の確認' + (askTerms ? '<small>' + esc('応募者に聞いて選ぶ・記入する' + (termQs.length ? '（' + termQs.join('・') + ' は聞くことの答え）' : '')) + '</small>' : '') + '</p>' + terms.join('') : '') +
      '</div>' : '') + memos.join('');
    return cardHtml({ id: 'ivCheck', cls: 'iv-grp k-check', attrs: ' data-kind="check"', icon: 'check-list', title: '確かめること', titleCls: 'iv-k', small: n + ' 項目' }, body);
  }

  // ---------- 段階の本文（docs/DESIGN.md 4-3。2026-10-18 に 2 列から縦一列の 3 枚のカードへ） ----------
  //   カードはいつも 話すこと（説明 → 合否連絡）→ 聞くこと → 確かめること の順・1 列（920px の列）・間 24。その段階に無い種類のカードは出さない。
  //   確認点（rating）は出さない（評価で付ける）。流れの注記（note）は最後のカードの下に小さく
  function ivCardsHtml(s) {
    const blocks = s.blocks;
    const qBlocks = blocks.filter(function (b) { return b.type === 'question' && (b.items.length || String(b.memoText || '').trim()); });
    const qs = [];
    qBlocks.forEach(function (b) { b.items.forEach(function (it) { qs.push({ it: it, no: qs.length + 1 }); }); });
    const say = ['explain', 'notify'].filter(function (k) { return blocks.some(function (b) { return b.type === k && (b.items.length || b.memo); }); })
      .map(function (k) { return ivSayCardHtml(s, k); }).join('');
    const ask = qBlocks.length ? ivAskCardHtml(qBlocks, qs) : '';
    const flow = blocks.filter(function (b) { return b.type === 'note' && b.note; }).map(function (b) {
      return '<p class="iv-flow" data-block="' + esc(b.id) + '">' + ico('arrow-right') + sym('→ ') + '<span>' + esc(b.note) + '</span></p>';
    }).join('');
    return say + ask + ivCheckCardHtml(s, qs) + flow;
  }

  function interviewStepHtml(sec) {
    ensureChecklist();
    const sum = clSummary();
    const ss = sum.sections;
    if (!ss.length) return stepLeadHtml(2) + cardHtml({ icon: 'alert', title: '台本に段階がありません' }, '<p class="card-note">設定の「面接チェックリスト」で台本を確かめてください。</p>');
    const s = ss.find(function (x) { return x.id === sec; }) || ss[0];
    const def = sum.def;
    const a = state.applicant;
    // 上の帯（1 行目: 段階のチップ〔状態は updateInterviewUI〕＋タイマー。2 行目: 必須条件の不一致の案内。docs/DESIGN.md 3-11）
    const goal = s.minutes > 0 ? (s.minutesMax ? '/ 最大 ' : '/ 目安 ') + s.minutes + '分' : '';
    const noT = !!state.ivNoTimer;   // タイマー導入前の記録（数えない）
    const jump = ss.find(function (x) { return x.id === def.mustFailJumpTo; });
    const top = '<div class="iv-top" id="ivTop"><div class="iv-bar" id="ivBar"><div class="iv-bar-main">' +
        '<nav class="iv-chips" id="ivChips" aria-label="面接の段階">' + ss.map(function (x) {
          const name = x.noMark + ' ' + x.title;
          return '<button type="button" class="iv-chip" data-action="iv-go" data-sec="' + esc(x.id) + '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' +
            nbOf(x.noMark, 'iv-chip-no') + '<span class="iv-chip-t">' + esc(x.title) + '</span><span class="iv-chip-s"></span></button>';
        }).join('') + '</nav>' +
        '<div class="iv-timer" id="ivTimer" role="timer" aria-live="off"' + (noT ? ' title="タイマーの導入前に保存した記録のため、面接時間は数えません（評価の画面で分を入れられます）"' : '') + '>' +
          '<span class="iv-t-stage" id="ivTStage"><span class="iv-t-k lbl-x">この段階</span><span class="iv-t-v"><b class="num" id="ivTStageVal">' + (noT ? '—' : fmtClock(ivStageSec(s.id))) + '</b><small id="ivTStageGoal">' + esc(goal) + '</small></span></span>' +
          '<span class="iv-t-total"><span class="iv-t-k">合計</span><span class="iv-t-v"><b class="num" id="ivTTotal">' + (noT ? '—' : fmtClock(ivTotalSec())) + '</b></span></span></div>' +
      '</div>' +
      //   必須条件の案内（帯の 2 行目。1 文目＋続き。600px 以下は短い文 #ivMustShort。右端に「該当の行へ」〔480px 以下は出さない〕と［⑤ 逆質問へ］。docs/DESIGN.md 3-11）
      '<div class="iv-must hidden" id="ivMustAlert" role="alert">' + ico('alert') +
        '<span class="iv-must-txt"><b id="ivMustLead">必須条件が不一致です。</b><span id="ivMustAlertText"></span><span class="iv-must-short" id="ivMustShort"></span></span>' +
        '<button type="button" class="link-btn" data-action="iv-must-row">該当の行へ</button>' +
        (jump ? '<button type="button" class="btn sm" id="ivMustJump" data-action="iv-go" data-sec="' + esc(jump.id) + '">' + nbOf(jump.noMark) + ' <span>' + esc(jump.title + 'へ') + '</span></button>' : '') + '</div>' +
    '</div></div>';
    // 段階の見出し（番号・名前・目安・応募者〔氏名・区分・年齢・求人。空の項目は省く〕）・前書き（台本のページの最初の段階ならページの前書き＋段階の前書き。全文）
    const who = [a.category, String(a.age == null ? '' : a.age).trim() ? String(a.age).trim() + '歳' : '', sum.header.postingLabel].filter(Boolean);
    const firstOfPage = ss.filter(function (x) { return x.page === s.page; })[0] === s;
    const pg = firstOfPage ? (sum.pages || []).find(function (p) { return U.isObj(p) && Number(p.no) === s.page; }) : null;
    const lead = [pg && pg.lead ? String(pg.lead) : '', s.lead].filter(Boolean).join('　');
    const goalText = s.minutes > 0 ? (s.minutesMax ? '最大 ' : '目安 ') + s.minutes + ' 分' : '';
    const stage = '<section class="iv-stage" id="ivStage" data-sec="' + esc(s.id) + '" aria-labelledby="ivStageH">' +
      '<header class="iv-stage-head"><h2 id="ivStageH" tabindex="-1">' + nbOf(s.noMark, 'lg fill iv-no') + esc(s.title) + '</h2>' +
        (goalText ? '<span class="iv-goal">' + esc(goalText) + '</span>' : '') +
        '<span class="iv-who" id="ivWho">' + (a.name ? '<b>' + esc(a.name) + '</b><span class="iv-who-san">さん</span>' : '<b>氏名未入力</b>') + (who.length ? '<span class="iv-who-sub">' + sym('・') + esc(who.join('・')) + '</span>' : '') + '</span>' +
        (lead ? '<p class="iv-lead">' + esc(lead) + '</p>' : '') + '</header>' +
      ivCardsHtml(s) + '</section>';
    return stepLeadHtml(2) + top + stage;
  }
  // 面接の操作行: 左に戻る（① は「準備に戻る」）・右端に主ボタン（最後の段階は「面接を終えて評価へ →」）。評価まで進んだことがあれば（面接を終えた・評価から直しに来た・旧い記録）「評価に戻る」も。
  //   段階の下の部分が操作行に隠れているあいだは「▼ 下にあと n 項目」（ゴースト sm。押すとその分スクロール。updateMore）。
  //   DOM は主ボタン → 評価に戻る → 前の段階（最後の入力から Tab で主ボタンへ。Enter で戻らない）。見た目の左右は CSS の order（docs/SPEC-flow.md 15 章）
  function ivFootHtml(sec) {
    const ss = ivSections();
    if (!ss.length) return '';
    const i = Math.max(0, ss.findIndex(function (x) { return x.id === sec; }));
    const next = ss[i + 1];
    //   評価に戻るも出すとき（.has-sub）は、1099px 以下で主ボタンの段階の名前（.lbl-t）を隠す（1 段に収める。番号は残す。docs/DESIGN.md 3-10）
    const sub = state.maxStepReached >= 3 && !!next;
    return '<div class="flow-foot' + (sub ? ' has-sub' : '') + '" id="ivFoot">' +
      //   文字は 1 つの span（.lbl-nb。docs/DESIGN.md 3-1）: 「次へ：」の直後に番号の丸・番号と段階の名前の間は 4（ボタンの部品の間 8 を文字の途中に入れない）
      (next ? '<button type="button" class="btn primary" id="ivNext" data-action="iv-next"><span class="lbl-nb">次へ：' + nbOf(next.noMark) + ' <span class="lbl-t">' + esc(next.title) + '</span></span>' + sym(' →') + ico('arrow-right') + '</button>'
        : '<button type="button" class="btn primary" id="ivNext" data-action="iv-end"><span>面接を終えて評価へ</span>' + sym(' →') + ico('arrow-right') + '</button>') +
      (sub ? '<button type="button" class="btn" id="ivToEval" data-action="iv-end">評価に戻る</button>' : '') +
      //   戻るの文字は 480px 以下で「← 戻る」（.lbl-x を隠す。「前の段階」は CSS の文字〔.lbl-s〕に替える＝textContent は変えない。docs/DESIGN.md 3-10）
      '<button type="button" class="btn ff-start" id="ivPrev" data-action="iv-prev">' + ico('arrow-left') + sym('← ') + '<span>' + (i > 0 ? '<span class="lbl-x">前の段階</span><span class="lbl-s" data-lbl="戻る"></span>' : '<span class="lbl-x">準備に</span>戻る') + '</span></button>' +
      moreBtnHtml('ivMore', 'ivStage') + '<span class="spacer"></span>' +
    '</div>';
  }
  // 「▼ 下にあと n 項目」のボタン（面接・準備の操作行。ゴースト sm）。中身は作り直さない（数は .iv-more-t の文字だけ替える。updateMore）
  function moreBtnHtml(id, controls) {
    return '<button type="button" class="btn sm ghost iv-more ff-start hidden" id="' + id + '" data-action="iv-more" aria-controls="' + controls + '">' + ico('chevron-down') + sym('▼ ') + '<span class="iv-more-t"></span></button>';
  }

  // 質問のメモの高さを内容に合わせる（1 行〔40px〕から。168px を超えたらスクロール）
  function ivAutosize(el) {
    if (!el || !el.style) return;
    el.style.height = 'auto';
    const h = Math.max(40, el.scrollHeight + 2);
    el.style.height = Math.min(h, 168) + 'px';
    el.style.overflowY = h > 168 ? 'auto' : 'hidden';
  }
  // 描いた直後: メモの高さ・チップ（入らなければ番号だけ）とトップバー・上の帯の高さ・タイマーの表示（00:00 から始めない）・「▼ 下にあと n 項目」
  function ivAfterRender() {
    $$('#stepContent textarea.iv-q-memo').forEach(ivAutosize);
    syncFlowLayout();
    ivTick();
    updateMore();
  }
  // 本文の下の部分が下の操作行に隠れているとき、操作行の左に「▼ 下にあと n 項目」（押すと隠れている分だけスクロール）。見えたら消す。
  //   面接（段階の項目の行・読み上げる項目・質問・メモ欄・流れの注記）と準備（応募者のカードの欄。はじめての方へを出したままのノート PC の高さ。docs/SPEC-flow.md 16-7）。
  //   描いたとき・入力でメモが伸びたとき・スクロール・画面の大きさが変わったとき（docs/SPEC-flow.md 14 章）
  const IV_MORE_SEL = '.row, .iv-say-i, .iv-q, .iv-oldmemo, .iv-memo, .iv-flow';
  function moreCfg() {
    if (state.view !== 'judge') return null;
    if (state.step === 2) return { root: $('#ivStage'), foot: $('#ivFoot'), btn: $('#ivMore'), sel: IV_MORE_SEL, top: $('#ivTop') };
    //   準備は欄（.field）ごとに数える。隠れているかは欄の入力部品で見る（同じ行の高いメモ欄に合わせて欄の枠が伸びても、入力欄が見えていれば数えない）
    if (state.step === 1) return { root: $('#scriptApplicantCard'), foot: $('#saActions'), btn: $('#saMore'), sel: '.field', ctl: 'input, select, textarea, .seg', top: $('.topbar') };
    return null;
  }
  function hiddenBelow(c) {
    if (!c || !c.root || !c.foot || getComputedStyle(c.foot).position !== 'sticky') return [];
    const ft = c.foot.getBoundingClientRect().top;
    return $$(c.sel, c.root).filter(function (el) { return ((c.ctl && $(c.ctl, el)) || el).getBoundingClientRect().bottom > ft + 2 && el.offsetParent !== null; });
  }
  function updateMore() {
    const c = moreCfg();
    if (!c || !c.btn) return;
    const n = hiddenBelow(c).length, t = $('.iv-more-t', c.btn), txt = '下にあと ' + n + ' 項目';
    if (n && t && t.textContent !== txt) t.textContent = txt;
    show(c.btn, n > 0);
  }
  function showMore() {
    const c = moreCfg(), hid = hiddenBelow(c);
    if (!hid.length) return;
    // 隠れている最後の項目の下端が操作行の上に来るまで（上の帯〔準備はトップバー〕の下から見えなくなる量を超えない＝読み飛ばさない）
    const ft = c.foot.getBoundingClientRect().top;
    const room = ft - (c.top && getComputedStyle(c.top).position === 'sticky' ? c.top.getBoundingClientRect().bottom : 0) - 40;
    const need = Math.max.apply(null, hid.map(function (el) { return el.getBoundingClientRect().bottom; })) - ft + 12;
    window.scrollBy(0, Math.max(40, Math.min(need, room)));
    updateMore();
  }

  // 面接の画面の表示の更新（ボタンの押下・「説明した」・必須条件の案内・チップ。段階の中身は描き直さない。3-10）
  function updateInterviewUI() {
    const root = $('#stepContent');
    ensureChecklist();
    const sum = clSummary();
    syncSegButtons(root);
    // 「説明した」（トグル。幅は操作列と同じ 280px で 3 つの状態とも同じ。docs/DESIGN.md 3-1）: off「○ 説明した」／on「✓ 説明した」（淡い紺）／mixed「✓ 一部説明した（n/m）」（淡い琥珀）。
    //   ✓ は SVG（textContent には「✓ 」を .sym で残す）。対象が無ければ出さない。
    //   中身の要素は差し替えない（アイコンの href・.sym と文字の textContent だけ。押した瞬間のメモ欄の change でここが走っても、押している要素が外れないように）
    $$('[data-action="iv-said"]', root).forEach(function (btn) {
      const kind = btn.dataset.kind, x = ivSayItems(btn.dataset.sec, kind), st = ivSayState(x);
      const verb = kind === 'notify' ? '伝えた' : '説明した';
      const label = st === 'mixed' ? '一部' + verb + '（' + x.targets.filter(ivSaidOn).length + '/' + x.targets.length + '）' : verb;
      const use = $('use', btn), sy = $('.sym', btn), t = $('.iv-said-t', btn), href = '#i-' + (st === 'off' ? 'circle' : 'check');
      if (use && use.getAttribute('href') !== href) use.setAttribute('href', href);
      if (sy && sy.textContent !== (st === 'off' ? '' : '✓ ')) sy.textContent = st === 'off' ? '' : '✓ ';
      if (t && t.textContent !== label) t.textContent = label;
      btn.setAttribute('aria-pressed', st === 'on' ? 'true' : st === 'mixed' ? 'mixed' : 'false');
      show(btn, x.targets.length > 0);
    });
    // 必須条件を［不一致］にした行は地を淡い赤（案内の「該当の行へ」の行き先）。未確認のまま［次へ］を押して案内した段階の未確認の行は琥珀（ivMustHold。確かめると消える）
    const warnOpen = ivMustWarned && ivMustWarned === ivCurrentSec() ? ivMustOpen(ivMustWarned) : [];
    $$('#ivStage .cl-must-row[data-item]', root).forEach(function (row) {
      row.classList.toggle('is-ng', clGet('values.' + row.dataset.item) === 'mismatch');
      row.classList.toggle('is-missing', warnOpen.indexOf(row.dataset.item) >= 0);
    });
    $$('.iv-say-list input[type="checkbox"][data-cl]', root).forEach(function (cb) {
      const on = clGet(cb.dataset.cl) === true;
      cb.checked = on;
      const li = cb.closest('.iv-say-i');
      if (li) li.classList.toggle('is-on', on);
    });
    // 必須条件の案内（docs/SPEC-flow.md 3-8・F14）
    const g = mustGateInfo(sum);
    const cur = ivCurrentSec();
    const alert = $('#ivMustAlert');
    if (alert) {
      show(alert, g.mm);
      if (g.mm) {
        //   1 文目「必須条件が不一致です。」（#ivMustLead）＋続き（1100px で 1 行に入る長さ。docs/DESIGN.md 3-11 の表）。不一致の条件の名前は title
        let txt, short;
        if (!g.gateReject) {
          txt = '追加で確認してください（このまま続けると、結果は' + resultTitle('review') + '以下）';
          short = '必須条件が不一致（追加で確認）';
        } else if (g.jump) {
          const mt = String(g.jump.minutesText || '').replace(/(\d+)分/, ' $1 分').trim();
          txt = cur === g.jump.id ? g.jump.noMark + ' ' + g.jump.title + (mt ? 'は' + mt + 'で終了します' : 'で面接を終えます')
            : '追加で確認し、解消しなければ ' + g.jump.noMark + ' ' + g.jump.title + 'へ' + (mt ? '（' + mt + 'で終了）' : '');
          short = '必須条件が不一致' + (cur === g.jump.id ? '（' + (mt ? mt + 'で' : '') + '終了）' : '');   // 案内先へのボタンが横に並ぶ
        } else {
          txt = '追加で確認し、解消しなければ面接を終了します';
          short = '必須条件が不一致（解消しなければ終了）';
        }
        setText('#ivMustAlertText', txt);
        setText('#ivMustShort', short);
        alert.title = '不一致: ' + sum.must.mismatchLabels.join('、');
      } else alert.removeAttribute('title');
    }
    const jb = $('#ivMustJump');
    if (jb) show(jb, g.mm && g.gateReject && !!g.jump && cur !== g.jump.id);
    // 段階のチップ: 今の段階 ＞ 省略可 ＞ 未確認（必須条件が未確認のまま離れた・入力した段階。琥珀）＞ 済み ✓（その段階で入力した＝必須条件・説明・記入欄・メモが 1 つでもあり、
    //   未確認の必須条件が無い）。表示しただけ（チップで見た・前へ／次へで通った）の段階には付けない（docs/SPEC-flow.md 14 章）
    const ps = ivTimingRead().perStage || {};
    sum.sections.forEach(function (x, i) {
      const chip = $('#ivChips [data-sec="' + x.id + '"]');
      if (!chip) return;
      const isCur = x.id === cur, skip = !isCur && g.skippable(i);
      const mustOpen = x.mustUnknown > 0 && !g.gateReject;   // 不一致で打ち切り（不採用推奨に固定）なら残りの必須条件は任意
      const unconf = !isCur && !skip && mustOpen && (Object.prototype.hasOwnProperty.call(ps, x.id) || x.input);
      const done = !isCur && !skip && !mustOpen && x.input;
      chip.classList.toggle('is-current', isCur);
      chip.classList.toggle('is-skip', skip);
      chip.classList.toggle('is-unconf', unconf);
      chip.classList.toggle('is-done', done);
      if (isCur) chip.setAttribute('aria-current', 'step'); else chip.removeAttribute('aria-current');
      //   名前を隠したとき（省略可・番号だけ）も読めるよう、title と aria-label に番号・名前・状態（docs/DESIGN.md 3-8）
      chip.title = x.noMark + ' ' + x.title + (skip ? '（必須条件不一致のため省略可）' : unconf ? '（必須条件が未確認）' : done ? '（記録あり）' : '');
      chip.setAttribute('aria-label', chip.title);
      const sEl = $('.iv-chip-s', chip);
      if (sEl) sEl.textContent = skip ? '省略可' : unconf ? '未確認' : done ? '✓' : '';
    });
    syncFlowLayout();   // チップの幅が変わる（省略可・未確認）→ 入らなければ番号だけ・帯の高さ（案内の出し入れ）
    updateMore();
  }

  // =====================================================================
  // 評価（step 3。面接のあとに付ける。docs/SPEC-flow.md 4 章・docs/DESIGN.md 4-4）
  //   上の結果カード（固定。いまの結果・理由・未入力の数）→ 段階のカード（面接のメモ＋必須条件＋確認点 ○△×）→ 人物像 → 総合判断 → 面接所見 → 面接時間 → 下の操作行
  // =====================================================================
  function evalStepHtml() {
    ensureChecklist();
    const sum = clSummary();
    return stepLeadHtml(3) +
      '<div class="ev-top" id="evTop"><div class="card ev-result" id="evResult" data-result="">' +
        '<span class="ev-res-k">いまの結果</span><span class="badge lg" id="evResultTitle"></span>' +
        '<span class="ev-res-why" id="evResultWhy"></span><span class="ev-res-miss" id="evMissing"></span>' +
        '<span class="ev-res-score" id="clNavScore"></span>' +
        //   面接時間が目安から大きく外れているとき（ivTimeCheck）。押すと下の面接時間の欄へ。中身は作り直さない（文は .ev-tw-t の文字だけ替える。updateEvalUI）
        '<button type="button" class="ev-res-time hidden" id="evTimeWarn" data-action="ev-time">' + ico('alert') + sym('⚠ ') + '<span class="ev-tw-t"></span>' + sym(' → ') + ico('arrow-right') + '<span>面接時間の欄へ</span></button></div></div>' +
      sum.sections.map(function (s) { return evSecHtml(s, sum); }).join('') +
      clOverallHtml(sum) +
      evTimeHtml(sum);
  }
  // 評価の操作行（DOM は主ボタンが先。面接時間の欄から Tab で「報告書へ →」。docs/SPEC-flow.md 15 章）
  function evFootHtml() {
    return '<div class="flow-foot" id="evFoot"><button type="button" class="btn primary" id="toReportBtn" data-action="judge"><span>報告書へ</span>' + sym(' →') + ico('arrow-right') + '</button>' +
      '<button type="button" class="btn ff-start" id="evBack" data-action="to-step" data-step="2">' + ico('arrow-left') + sym('← ') + '<span><span class="lbl-x">面接に</span>戻る</span></button><span class="spacer"></span></div>';
  }
  // 面接時間のカード（評価の最後。docs/SPEC-flow.md 4-5・15 章・docs/DESIGN.md 4-4）: 手入力の分（空ならタイマーの値。単位は欄の中）・帯にタイマーの合計と目安・段階ごとの時間（表示したことのない段階は「—」）。
  //   欄の下に常に見える 1 行「紙から転記した面接・中断した面接は、実際の分を入れてください」（記入シートの「面接時間 ___分」を写す欄。title だけにしない）
  function fmtMinSec(sec) { sec = Math.max(0, Math.floor(Number(sec) || 0)); return Math.floor(sec / 60) + '分' + pad2(sec % 60) + '秒'; }
  function evTimeHtml(sum) {
    const tm = sum.timing;
    const t = ivTimingRead();
    const ps = U.isObj(t.perStage) ? t.perStage : {};
    const total = tm ? tm.totalSec : 0;
    const sub = tm && tm.startedAt ? 'タイマー ' + fmtMinSec(total) + '・目安 ' + sum.minutesTotal + '分' : 'タイマーの記録なし・目安 ' + sum.minutesTotal + '分';
    return cardHtml({ id: 'evTime', icon: 'clock', title: '面接時間', small: '1 項目', meta: '<span id="evTimeSub">' + esc(sub) + '</span>' },
      '<div class="rows"><div class="row ev-time-row"><div class="row-label"><label for="evTimeMin">面接時間（分）</label>' +
        '<span class="row-hint" id="evTimeHint">紙（記入シート）から転記した面接・中断した面接は、実際の分を入れてください（空欄ならタイマーの分を使います）</span></div>' +
        '<div class="row-ctl"><span class="input-unit"><input type="number" id="evTimeMin" class="no-spin" data-cl="timing.min" min="1" max="600" step="1" inputmode="numeric" placeholder="' + (tm && tm.timerMin != null ? tm.timerMin : '') + '"' +
          ' value="' + (t.min != null ? esc(t.min) : '') + '" aria-describedby="evTimeHint" title="紙から転記したときなどは、実際の時間（分）を入れてください。空にするとタイマーの値を使います"><span class="unit">分</span></span></div></div></div>' +
      '<p class="ev-time-st">' + sum.sections.map(function (s) {
        return '<span class="ev-t-i" data-sec="' + esc(s.id) + '">' + nbOf(s.noMark) + ' <b>' + evSecTime(s, ps) + '</b></span>';
      }).join('') + '</p>');
  }
  // 面接時間を確かめる（docs/SPEC-flow.md 15 章）: 手入力の分が無く、タイマーの合計が目安の 1/4 未満か 2 倍を超えるとき（紙からの転記で数分・PC のスリープで何十分も、など）。
  //   目安は段階の分の合計（必須条件の不一致で打ち切ったときは省略できる段階を除く）。報告書に面接時間を出さない（タイマーの記録なし・0 秒）ときは確かめない。
  //   → null か { text: '面接時間を確かめてください（タイマー 1分30秒・目安 41分）' }
  function ivTimeCheck(sum) {
    const tm = sum && sum.timing;
    if (!tm || tm.manualMin != null || !tm.text || !(tm.totalSec > 0)) return null;
    const g = mustGateInfo(sum);
    const goal = sum.sections.reduce(function (a, s, i) { return a + (g.skippable(i) ? 0 : s.minutes || 0); }, 0);
    if (!goal || (tm.totalSec * 4 >= goal * 60 && tm.totalSec <= goal * 120)) return null;
    return { text: '面接時間を確かめてください（タイマー ' + fmtMinSec(tm.totalSec) + '・目安 ' + goal + '分）' };
  }
  // 段階ごとの時間（6:12）。表示しただけ（0 秒で入力なし＝チップで見た・前へ／次へで通った）の段階・表示したことのない段階は「—」
  function evSecTime(s, ps) {
    const v = Object.prototype.hasOwnProperty.call(ps, s.id), sec = Number(ps[s.id]) || 0;
    return v && (sec > 0 || s.input) ? fmtMs(sec) : '—';
  }
  // 記入欄の値（日付は 2026/10/10・月は 2026年10月・選択肢は表示名・空は —）
  function evFieldVal(it) {
    let v = String(it.effectiveLabel != null ? it.effectiveLabel : (it.effective == null ? '' : it.effective)).trim();
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v), m = /^(\d{4})-(\d{2})$/.exec(v);
    if (it.kind === 'date' && d) v = d[1] + '/' + d[2] + '/' + d[3];
    else if (it.kind === 'month' && m) v = m[1] + '年' + Number(m[2]) + '月';
    return v ? esc(v) : '<span class="is-empty">—</span>';
  }
  // 値の行（読み取り専用。左にラベル・右に値。docs/DESIGN.md 3-3）
  function kvHtml(attrs, k, v, vCls, kCls) {
    return '<div class="kv' + (attrs.cls ? ' ' + attrs.cls : '') + '"' + (attrs.item ? ' data-item="' + esc(attrs.item) + '"' : '') + (attrs.block ? ' data-block="' + esc(attrs.block) + '"' : '') + (attrs.kind ? ' data-kind="' + esc(attrs.kind) + '"' : '') + '>' +
      '<dt class="kv-k' + (kCls ? ' ' + kCls : '') + '">' + k + '</dt><dd class="kv-v' + (vCls ? ' ' + vCls : '') + '">' + v + '</dd></div>';
  }
  // 説明・合否連絡の値の行（数え方は A4 と同じ: 短期のみの説明は求人が短期のときだけ数える。項目が無ければ出さない）。✓ は SVG（textContent には「✓ 」を残す）。
  //   していない・一部していない は同じ注意の形（琥珀 700＋i-alert。docs/DESIGN.md 3-3）
  function evSaidHtml(s, kind, posting) {
    const its = [];
    s.blocks.forEach(function (b) {
      if (b.type !== kind) return;
      b.items.forEach(function (it) { if (!(kind === 'explain' && it.shortOnly === true && posting !== 'short')) its.push(it); });
    });
    if (!its.length) return '';
    const off = its.filter(function (it) { return !it.value; });
    const k = kind === 'notify' ? '合否連絡' : '説明';
    const v = !off.length ? ico('check') + sym('✓ ') + esc(kind === 'notify' ? '伝えた' : '説明した（' + its.length + '/' + its.length + '）')
      : off.length === its.length ? ico('alert') + esc(kind === 'notify' ? '伝えていない' : 'していない')
        : ico('alert') + esc('一部' + (kind === 'notify' ? '伝えていない' : '説明していない') + '（' + off.map(shortLabel).join('、') + '）');
    return kvHtml({ cls: 'ev-said' + (off.length ? ' is-off' : ''), kind: kind }, esc(k), v, off.length ? 'is-off' : '');
  }
  // 確認点の行（左に項目・右の操作列に ○△×。メモは行の下〔ラベルの列〕の小さい欄。未入力は updateEvalUI が .is-missing）
  function rateRowHtml(it) {
    return '<div class="row has-memo cl-rate-row" data-item="' + esc(it.id) + '">' +
      '<div class="row-label">' + esc(it.label) + '<span class="badge warn ev-miss">未入力</span>' + (it.hint ? '<span class="row-hint">' + jaMarks(esc(it.hint)) + '</span>' : '') + '</div>' +
      '<div class="row-ctl">' + clSegHtml('values.' + it.id, ['good', 'fair', 'poor'].map(function (k) {
        return { value: k, label: R.RATING_MARKS[k].mark, cls: 'mark ' + k, title: R.RATING_MARKS[k].label };
      }), { aria: it.label }) + '</div>' +
      '<div class="row-memo"><input type="text" class="cl-note" data-cl="notes.' + esc(it.id) + '" value="' + esc(clGet('notes.' + it.id)) + '" placeholder="メモ（任意）" aria-label="' + esc(it.label) + ' のメモ"></div>' +
    '</div>';
  }
  const RATE_LEGEND = '<span class="legend"><span class="ja">○</span> できている／<span class="ja">△</span> やや不安／<span class="ja">×</span> できていない</span>';
  // 段階のカード（docs/DESIGN.md 4-4）: 帯に番号・名前・時間・状態のバッジ・［✎ 面接の画面で直す］。
  //   本文は「面接のメモ」（読み取り専用の値の行: 記入欄 → 説明・合否連絡 → 質問ごとのメモ〔以前のメモを先に〕→ ブロックのメモ）→「必須条件」（ここでも直せる行）→「確認点」（○△× とメモ）
  function evSecHtml(s, sum) {
    const ps = U.isObj(ivTimingRead().perStage) ? ivTimingRead().perStage : {};
    const goal = s.minutes ? '（' + (s.minutesMax ? '最大 ' : '目安 ') + s.minutes + '分）' : '';
    const musts = [], mustNotes = [], kv = [], qa = [], extra = [], rates = [], rateMemos = [];
    let qn = 0;
    s.blocks.forEach(function (b) {
      if (b.type === 'must') { b.items.forEach(function (it) { musts.push(mustRowHtml(it, true)); }); if (b.note) mustNotes.push(b.note); }
      else if (b.type === 'fields') b.items.forEach(function (it) { kv.push(kvHtml({ item: it.id }, esc(shortLabel(it)), evFieldVal(it))); });
      else if (b.type === 'question') {
        //   2026-10-16 より前の記録はブロックにメモが 1 つ（以前のメモ）。そのブロックは以前のメモを先に出し、質問ごとの「（メモなし）」は出さない（答えが無いと読み違えないように）
        const old = String(b.memoText || '').trim();
        if (old) qa.push(kvHtml({ cls: 'ev-oldmemo', block: b.id }, '（以前のメモ）', esc(b.memoText), 'ev-memo-v', 'ev-memo-k'));
        b.items.forEach(function (it) {
          const no = ++qn;
          const v = String(it.note || '').trim();
          if ((!b.memo || old) && !v) return;
          qa.push(kvHtml({ item: it.id, cls: v ? '' : 'is-empty' }, '<span class="q">Q' + no + '</span>' + esc(shortLabel(it)), v ? esc(v) : '（メモなし）', v ? '' : 'is-empty'));
        });
      } else if (b.type === 'rating') {
        b.items.forEach(function (it) { rates.push(rateRowHtml(it)); });
        if (b.memo) rateMemos.push(blockMemoHtml(b));
      } else if (b.memo && String(b.memoText || '').trim()) {
        extra.push(kvHtml({ cls: 'ev-bmemo', block: b.id }, esc(b.memoLabel || 'メモ'), esc(b.memoText), 'ev-memo-v', 'ev-memo-k'));
      }
    });
    const posting = String(sum.header.posting || '');
    const said = evSaidHtml(s, 'explain', posting) + evSaidHtml(s, 'notify', posting);
    const memo = (kv.length ? '<dl class="ev-kv">' + kv.join('') + '</dl>' : '') + (said ? '<dl class="ev-says">' + said + '</dl>' : '') +
      (qa.length ? '<dl class="ev-qa">' + qa.join('') + '</dl>' : '') + (extra.length ? '<dl class="ev-extra">' + extra.join('') + '</dl>' : '');
    const body = '<div class="rows">' +
        (memo ? '<p class="group-h">面接のメモ</p><div class="panel ev-memo">' + memo + '</div>' : '') +
        (musts.length ? '<p class="group-h">必須条件' + (mustNotes.length ? '<small>' + esc(mustNotes.join('　')) + '</small>' : '') + '</p><div class="row-group ev-must">' + musts.join('') + '</div>' : '') +
        (rates.length ? '<p class="group-h">確認点' + RATE_LEGEND + '</p><div class="row-group ev-rate">' + rates.join('') + '</div>' : '') +
      '</div>' + rateMemos.join('');
    return cardHtml({ id: 'cl-' + s.id, cls: 'cl-sec ev-sec', attrs: ' data-sec="' + esc(s.id) + '"', no: nbOf(s.noMark), title: esc(s.title),
      meta: esc(evSecTime(s, ps) + goal), metaCls: 'ev-sec-time',
      badge: '<span class="cl-sec-state" id="clState-' + esc(s.id) + '"></span><span class="badge cl-skip-note" title="必須条件不一致のため省略可">省略可</span>',
      actions: '<button type="button" class="btn sm ghost ev-fix" data-action="iv-go" data-sec="' + esc(s.id) + '">' + ico('pencil') + sym('✎ ') + '<span>面接の画面で直す</span></button>' }, body);
  }

  // 結果の理由（調整があれば短い言い方を「・」でつなぎ「…のため」。無ければ総合判断から。title は理由の全文）
  function evReason(j) {
    const ovl = (j.overall && j.overall.label) || '';
    const ps = j.persona || {};
    const SHORT = {
      must_conditions: '必須条件が不一致', must_unconfirmed: '必須条件に未確認',
      overall_cutoff: '総合判断「' + ovl + '」', overall_hold: '総合判断「' + ovl + '」',
      persona_unscored: '人物像に未入力', persona_total: '人物像の合計 ' + ps.total + '/' + ps.max, persona_one: '人物像に 1 点'
    };
    const adj = j.adjustments || [];
    if (adj.length) {
      const parts = [];
      adj.forEach(function (x) { const t = SHORT[x.code] || ''; if (t && parts.indexOf(t) < 0) parts.push(t); });
      return { text: (parts.join('・') || adj[0].reason) + 'のため', title: adj.map(function (x) { return x.reason; }).join('\n') };
    }
    const text = !ovl ? '総合判断が未入力のため' : j.result === 'recommend' ? '総合判断「' + ovl + '」のとおり' : '総合判断「' + ovl + '」のため';
    return { text: text, title: text };
  }
  // 評価の画面の表示の更新（結果カード・未入力の数と強調・段階の状態・省略可・人物像・総合判断の注意）。
  //   判定は表示のためだけに計算する（state.judgment には入れない。報告書へ進むときに goStep(4) が判定する）
  function updateEvalUI() {
    const root = $('#stepContent');
    ensureChecklist();
    const sum = clSummary();
    syncSegButtons(root);
    const j = R.evaluateScript(state.applicant, state.checklist, state.profile);
    const g = mustGateInfo(sum);
    const gate = g.gateReject;   // 必須条件の不一致で不採用推奨に固定（ほかの入力は任意＝未入力を強調しない。F15）
    const res = $('#evResult');
    if (res) res.setAttribute('data-result', j.result);
    const tt = $('#evResultTitle');
    if (tt) { tt.className = 'badge lg ' + (RESULT_TONE[j.result] || ''); tt.textContent = j.title; }
    const why = evReason(j);
    const wEl = $('#evResultWhy');
    if (wEl) { wEl.textContent = why.text; wEl.title = why.title; }
    // 未入力の数（琥珀の文字＋⚠。無ければ「未入力はありません」〔--text-2＋紺の ✓。緑にしない〕）。
    //   数は文字だけのボタン（.link-btn。押すとその種類の最初の未入力の行へ。ev-miss・docs/SPEC-flow.md 16-7）。中身は変わったときだけ入れ直す（押した瞬間のメモ欄の change で押した要素を外さない）
    const ps = sum.persona;
    const rBlank = sum.ratings.filter(function (r) { return !r.value; }).length;
    const parts = [];
    if (!gate) {
      if (sum.must.unknown) parts.push({ k: 'must', t: '必須条件 ' + sum.must.unknown, h: '確かめていない最初の必須条件へ' });
      if (rBlank) parts.push({ k: 'rate', t: '確認点 ' + rBlank, h: '未入力の最初の確認点へ' });
      if (ps && ps.unscored) parts.push({ k: 'ps', t: '人物像 ' + ps.unscored, h: '未入力の最初の人物像の項目へ' });
      if (!sum.overall.value) parts.push({ k: 'overall', t: '総合判断', h: '総合判断の欄へ' });
    }
    const mEl = $('#evMissing');
    const mKey = gate ? 'gate' : parts.map(function (x) { return x.t; }).join('・');
    if (mEl && mEl.getAttribute('data-k') !== mKey) {
      mEl.setAttribute('data-k', mKey);
      mEl.innerHTML = gate ? ico('info') + '<span>必須条件の不一致のため、ほかの入力は任意です</span>'
        : parts.length ? ico('alert') + '<span class="ev-miss-t">未入力：' + parts.map(function (x, i) {
          return (i ? '・' : '') + '<button type="button" class="link-btn" data-action="ev-miss" data-miss="' + x.k + '" title="' + esc(x.h) + '">' + esc(x.t) + '</button>';
        }).join('') + '</span>' : ico('check') + '<span>未入力はありません</span>';
      mEl.classList.toggle('is-none', !gate && !parts.length);
      mEl.classList.toggle('is-gate', gate);
    }
    // 面接時間を確かめる（紙からの転記・中断など。docs/SPEC-flow.md 15 章）: 結果カードに 1 行・面接時間の欄を琥珀に。分を入れると消える
    const tc = ivTimeCheck(sum);
    const twEl = $('#evTimeWarn'), twT = $('#evTimeWarn .ev-tw-t');
    if (twEl) {
      show(twEl, !!tc);
      if (tc && twT && twT.textContent !== tc.text) twT.textContent = tc.text;
    }
    const etEl = $('#evTime');
    if (etEl) etEl.classList.toggle('is-check', !!tc);
    // 未入力の行の強調（必須条件の不一致で不採用推奨に固定したときは付けない）・必須条件を［不一致］にした行は赤（.is-ng）
    sum.must.items.forEach(function (m) {
      const row = $('.ev-must .cl-must-row[data-item="' + m.id + '"]', root);
      if (row) { row.classList.toggle('is-missing', !gate && !m.value); row.classList.toggle('is-ng', m.value === 'mismatch'); }
    });
    sum.ratings.forEach(function (r) {
      const row = $('.cl-rate-row[data-item="' + r.id + '"]', root);
      if (row) row.classList.toggle('is-missing', !gate && !r.value);
    });
    if (ps) ps.items.forEach(function (it) {
      const row = $('#clPersona .cl-ps-row[data-ps-row="' + it.id + '"]', root);
      if (row) row.classList.toggle('is-missing', !gate && it.score == null);
    });
    const ovRow = $('.cl-overall-row', root);
    if (ovRow) ovRow.classList.toggle('is-missing', !gate && !sum.overall.value);
    // 段階の状態（不一致あり〔赤〕／必須条件の「未確認 n」・確認点の「未入力 n」〔琥珀〕／必須条件・確認点が全部入力「✓ 済」〔紺〕。どちらも無い段階は空）・省略可（点線の枠）。
    //   必須条件の不一致で不採用推奨に固定（gate）したときは、未確認・未入力を出さない（ほかの入力は任意）
    sum.sections.forEach(function (s, i) {
      const stEl = $('#clState-' + s.id);
      if (stEl) {
        const rs = sum.ratings.filter(function (r) { return r.sectionId === s.id; });
        const blank = rs.filter(function (r) { return !r.value; }).length;
        const hasMust = s.blocks.some(function (b) { return b.type === 'must' && b.items.length; });
        const open = gate ? [] : [s.mustUnknown ? '未確認 ' + s.mustUnknown : '', blank ? '未入力 ' + blank : ''].filter(Boolean);
        const html = s.mustMismatch ? clBadge('danger', '不一致あり') : open.length ? clBadge('warn', open.join('・'))
          : (rs.length || hasMust) && !blank && !s.mustUnknown ? '<span class="badge navy">' + ico('check') + '済</span>' : '';
        if (stEl.innerHTML !== html) stEl.innerHTML = html;
      }
      const el = $('#cl-' + s.id);
      if (el) el.classList.toggle('cl-skippable', g.skippable(i));
    });
    const sc = sum.score;
    const nav = $('#clNavScore');
    if (nav) nav.innerHTML = '面接評価 <b>' + esc((sc.rated ? sc.total : '—') + '/' + sc.max) + '</b>' + esc(sc.rated ? '（' + fmtNum(sc.pct) + '%・' + sc.bandLabel + '）' : '') +
      (ps ? '　人物像 <b>' + esc((ps.scored ? ps.total : '—') + '/' + ps.max) + '</b>' : '');
    updatePersonaUI(ps, root, gate);
    const ov = sum.overall.value;
    show('#overallWarn', ov === 'hold' || ov === 'reject');
    if (ov === 'hold' || ov === 'reject') setText('#overallWarnText', '面接者の総合判断が「' + sum.overall.label + '」です。');
    syncFlowLayout();   // 結果カード（上の帯）の高さが変わったら scroll-padding も合わせる
  }

  // 人物像のカード（1〜5 点。docs/SPEC-persona.md 3-2・docs/DESIGN.md 4-4）: 凡例 → 前書きの 1 行 → 行（左に番号と項目・右の操作列に 1〜5）→ 合計とバッジ → 1 点の警告。
  //   各行は 1 つのタブ位置（押下中のボタン、無ければ 1。updatePersonaUI が付け直す）
  function clPersonaHtml(ps, sum) {
    //   凡例は「点 意味」ごとに折り返さない span（狭い画面でも「5 とても／良い」と語の途中で割れない。文字は全角空白でつなぐ）
    const legend = ps.scaleLabels.map(function (l, i) { return '<span><b>' + (i + 1) + '</b> ' + esc(l) + '</span>'; }).join('　');
    const tone = function (n) { return n === 1 ? ' s1' : n === 2 ? ' s2' : n >= 4 ? ' s' + n : ' s3'; };
    return cardHtml({ id: 'clPersona', titleId: 'clPersonaH', titleInner: true, icon: 'user', title: esc(ps.title), small: esc(ps.items.length + ' 項目 × 1〜' + ps.scaleMax + ' 点') },
      '<p class="ps-legend" id="clPsLegend">' + legend + '</p>' +
      clLeadPsHtml(sum) +
      '<div class="rows cl-ps-rows">' + ps.items.map(function (it, i) {
        let btns = '';
        for (let n = 1; n <= ps.scaleMax; n++) {
          const on = it.score === n, tab = it.score != null ? on : n === 1;
          btns += '<button type="button" class="seg-btn cl-ps-btn' + tone(n) + (on ? ' active' : '') + '" data-action="ps-set" data-persona="' + esc(it.id) + '" data-score="' + n + '"' +
            ' aria-pressed="' + (on ? 'true' : 'false') + '" tabindex="' + (tab ? '0' : '-1') + '" title="' + esc(n + ' ' + ps.scaleLabels[n - 1]) + '">' + n + '</button>';
        }
        return '<div class="row cl-ps-row' + (it.score != null ? ' is-set' : '') + (it.score === 1 ? ' is-one' : '') + '" data-ps-row="' + esc(it.id) + '">' +
          '<div class="row-label"><span class="row-no">' + (i + 1) + '</span>' + esc(it.label) + '<span class="badge warn ev-miss">未入力</span>' + (it.hint ? '<span class="row-hint hint">' + esc(it.hint) + '</span>' : '') + '</div>' +
          '<div class="row-ctl"><div class="seg cl-ps-seg" role="group" aria-label="' + esc(it.label) + '">' + btns + '</div></div></div>';
      }).join('') + '</div>' +
      '<div class="ps-total" id="clPsTotal" aria-live="polite">合計 <b class="num" id="clPsSum">—</b> / <span class="num" id="clPsMax">' + ps.max + '</span> 点<span class="num" id="clPsPct"></span><span class="badge" id="clPsState"></span></div>' +
      '<div class="alert warn hidden" id="clPsWarn">' + ico('alert') + '<span id="clPsWarnText"></span></div>');
  }
  // 台本 1 枚目の前書きの「最低限の話し方、敬語が可能か」は、確認点から外して人物像の「言葉遣い・説明のわかりやすさ」で付ける（2026-10-16。台本の文言は変えない）。
  //   前書きが話し方・敬語に触れ、確認点に話し方・敬語の項目が無く、人物像に言葉遣いの項目があるとき、付ける場所を人物像の凡例の下に 1 行で示す（docs/SPEC-flow.md 4-6）。→ は SVG（textContent には残す）
  const CL_MANNER_RE = /敬語|話し方/;
  function clLeadPsHtml(sum) {
    const ps = sum.persona;
    const pg = (sum.pages || []).find(function (x) { return U.isObj(x) && Number(x.no) === 1; });
    const lead = pg ? String(pg.lead || '') : '';
    if (!ps || !CL_MANNER_RE.test(lead)) return '';
    if (R.checklistItems(sum.def, 'rating').some(function (x) { return CL_MANNER_RE.test(String(x.item.label || '')); })) return '';
    const it = ps.items.find(function (x) { return x.id === 'ps_speech'; }) || ps.items.find(function (x) { return /言葉遣い|敬語/.test(x.label); });
    if (!it) return '';
    const phrase = (lead.split(/[。\n]/).find(function (x) { return CL_MANNER_RE.test(x); }) || '').trim() || '最低限の話し方、敬語が可能か';
    return '<p class="ps-ref cl-lead-ps" data-ps-ref="' + esc(it.id) + '">' + ico('arrow-right') + sym('→ ') + '<span>台本 1 枚目の「' + esc(phrase) + '」は、この' + esc(ps.title) + '「' + esc(it.label) + '」で 1〜5 点を付けます。</span></p>';
  }
  // 設定で人物像を使うか（ON・項目あり）
  function personaOnNow() { return !!R.personaModel(clDefNow(), { persona: {} }); }

  // 総評（docs/SPEC-persona.md 3-2・docs/SPEC-flow.md 4-6）は 3 枚のカード: 人物像（#clPersona）→ 総合判断（#clOverall）→ 面接所見（#clNotes）。続けて面接時間（#evTime。evalStepHtml）。
  //   人物像を使わない記録（cl.persona === null）は総合判断のカードの先頭に 1 行の注記。面接評価の点・必須条件のまとめは上の結果カード（#clNavScore・#evMissing）
  function clOverallHtml(sum) {
    const def = sum.def;
    const oo = U.isObj(def.overallOptions) ? def.overallOptions : {};
    const ps = sum.persona;
    // 総合判断がそのまま結果になる（必須条件の不一致は除く）。人物像があれば、結果が下がる条件（合計・1 点・未入力。設定から）も書く（docs/SPEC-persona.md 11-9 補完 4）
    const hint = [def.overallHint || '', '「' + (oo.hire || overallLabelNow('hire')) + '」は' + resultTitle('recommend') + '、「' + (oo.hold || overallLabelNow('hold')) + '」は' + resultTitle('review') +
      '、「' + (oo.reject || overallLabelNow('reject')) + '」は' + resultTitle('reject') + 'として報告します（必須条件が不一致なら' + resultTitle(def.mustFailResult === 'review' ? 'review' : 'reject') + '）。',
      ps ? personaRuleText() + '。' : ''].filter(Boolean).join(' ');
    const off = !ps && ensureChecklist().persona === null && personaOnNow();
    return (ps ? clPersonaHtml(ps, sum) : '') +
      cardHtml({ id: 'clOverall', icon: 'check', title: '総合判断', small: '1 項目' },
        (off ? '<p class="card-note" id="clPersonaOff">この記録は人物像（1〜5 点）の導入前に保存されたため、人物像は判定に使いません。</p>' : '') +
        '<div class="rows"><div class="row cl-overall-row"><div class="row-label">' + esc(def.overallLabel || '面接者の総合判断') + '<span class="badge warn ev-miss">未入力</span></div>' +
          '<div class="row-ctl">' + clSegHtml('overall', ['hire', 'hold', 'reject'].map(function (k) { return { value: k, label: oo[k] || overallLabelNow(k), cls: k }; }), { aria: def.overallLabel || '面接者の総合判断' }) + '</div></div></div>' +
        (hint ? '<p class="card-note">' + esc(hint) + '</p>' : '') +
        '<div class="alert warn hidden" id="overallWarn">' + ico('alert') + '<span id="overallWarnText"></span></div>') +
      cardHtml({ id: 'clNotes', icon: 'pencil', title: '<label for="clIvNotes">面接所見</label>', small: '任意' },
        '<textarea class="notes" id="clIvNotes" data-note="interview" rows="4" placeholder="特記事項、受け答えの印象など">' + esc(state.interviewNotes) + '</textarea>');
  }

  // ---------- 人物像（docs/SPEC-persona.md 3-2〜3-4） ----------
  function psGet(id) { return R.personaScore(state.checklist, id) || 0; }
  // n: 1〜5（0 で未入力に戻す）。人物像を使わない記録（persona === null）では何もしない。全体は描き直さない（フォーカスを保つ）
  function psSet(id, n) {
    const cl = ensureChecklist();
    if (!U.isObj(cl.persona)) return;
    if (n >= 1 && n <= R.PERSONA_SCALE) cl.persona[id] = n; else delete cl.persona[id];
    touchChecklist();
    updateChecklistUI();
  }
  // 行ごとの押下・タブ位置・合計・得点率・状態・1 点の警告。
  //   gate: 必須条件の不一致で不採用推奨に固定（人物像は判定に使わない＝任意。rules.js・docs/SPEC-flow.md F15）。下がる上限（琥珀・赤）を出さず、
  //   未入力があれば中立の「未入力 n（任意）」・全部入れたら札を出さない。1 点の警告は事実だけ（「結果は…になります」を付けない）
  function updatePersonaUI(ps, root, gate) {
    if (!ps || !$('#clPersona', root)) return;
    const byId = {};
    ps.items.forEach(function (it) { byId[it.id] = it; });
    $$('#clPersona .cl-ps-row', root).forEach(function (row) {
      const it = byId[row.dataset.psRow];
      const score = it ? it.score : null;
      row.classList.toggle('is-set', score != null);
      row.classList.toggle('is-one', score === 1);
      $$('.cl-ps-btn', row).forEach(function (b) {
        const n = Number(b.dataset.score), on = score === n;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('tabindex', (score != null ? on : n === 1) ? '0' : '-1');
      });
    });
    setText('#clPsSum', ps.scored ? String(ps.total) : '—');
    setText('#clPsMax', String(ps.max));
    setText('#clPsPct', ps.complete ? '（' + ps.pct + '%）' : '');
    const stEl = $('#clPsState');
    if (stEl && gate) {
      stEl.className = 'badge' + (ps.unscored ? '' : ' hidden');
      stEl.textContent = ps.unscored ? '未入力 ' + ps.unscored + '（任意）' : '';
    } else if (stEl) {
      // 人物像で下がる結果の上限（未入力・合計・1 点の項目のうちいちばん低いもの。設定で「調整しない」のものは数えない）。
      //   下がるなら 琥珀「上長最終判断要まで」／赤「不採用推奨」（未入力があれば「未入力 n・」を前に）、下がらなければ 緑「70% 以上」／灰「未入力 n」（docs/SPEC-persona.md 11-9 補完 4）
      const caps = [];
      if (ps.unscored && ps.unscoredResult !== 'none') caps.push(ps.unscoredResult);
      if (ps.complete && ps.band !== 'keep') caps.push(ps.band);
      if (ps.ones.length && ps.onePointResult !== 'none') caps.push(ps.onePointResult);
      const cap = caps.indexOf('reject') >= 0 ? 'reject' : caps.length ? 'review' : '';
      const capText = cap === 'reject' ? resultTitle('reject') : cap ? resultTitle('review') + 'まで' : '';
      const tone = cap === 'reject' ? 'danger' : cap ? 'warn' : ps.unscored ? 'muted' : 'ok';
      const st = ps.unscored ? '未入力 ' + ps.unscored + (cap ? '・' + capText : '') : cap ? capText : ps.keepPct + '% 以上';
      stEl.className = 'badge ' + tone;
      stEl.textContent = st;
    }
    show('#clPsWarn', ps.ones.length > 0);
    if (ps.ones.length) {
      setText('#clPsWarnText', '1 点の項目があります（' + ps.ones.join('、') + '）。' + (gate ? '' :
        ps.onePointResult === 'review' ? '結果は' + resultTitle('review') + '以下になります。' : ps.onePointResult === 'reject' ? '結果は' + resultTitle('reject') + 'になります。' : ''));
    }
  }
  // キーボード（D8）: 各行は 1 つのタブ位置。数字キー 1〜5 で入力して次の行へ・←→ で行内・↑↓ で上下の行の同じ点へ（入力しない）。
  //   Enter／Space はボタンの押下（click。同じ点なら未入力に戻す）。Ctrl・Alt・Meta 付きは触らない（Ctrl+P など）
  function onPersonaKey(e, t) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const row = t.closest('.cl-ps-row');
    if (!row) return;
    const rows = $$('#clPersona .cl-ps-row');
    const ri = rows.indexOf(row);
    const btns = $$('.cl-ps-btn', row);
    const bi = btns.indexOf(t);
    const np = /^Numpad([0-9])$/.exec(e.code || '');
    const digit = /^[0-9]$/.test(e.key) ? Number(e.key) : np ? Number(np[1]) : 0;
    const tabStop = function (r) { return $('.cl-ps-btn[tabindex="0"]', r) || $('.cl-ps-btn', r); };
    if (digit >= 1 && digit <= R.PERSONA_SCALE) {
      e.preventDefault();
      psSet(row.dataset.psRow, digit);
      const next = ri >= 0 && ri < rows.length - 1 ? rows[ri + 1] : null;
      const f = next ? tabStop(next) : $('.cl-ps-btn[data-score="' + digit + '"]', row);
      if (f) f.focus();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const to = btns[bi + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (to) to.focus();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const r = rows[ri + (e.key === 'ArrowUp' ? -1 : 1)];
      const to = r ? $('.cl-ps-btn[data-score="' + t.dataset.score + '"]', r) : null;
      if (to) to.focus();
    }
  }
  // 右サマリーの「人物像」（合計・得点率・1 点の有無・未入力数。人物像を使わない記録・OFF は行を出さない。docs/SPEC-persona.md 6-1）
  function personaSummaryRow(ps, row) {
    if (!ps) return '';
    const ones = ps.ones.length ? ' <span class="badge danger">1点あり</span>' : '';
    const val = !ps.scored ? '<span class="badge">未入力 ' + ps.unscored + '</span>'
      : ps.complete ? esc(ps.total + '/' + ps.max + '点・' + ps.pct + '%') + ones
        : esc(ps.total + '/' + ps.max + '点') + ' <span class="badge">未入力 ' + ps.unscored + '</span>' + ones;
    return row('sumPersona', '人物像', val);
  }
  // 表示の更新（面接 → updateInterviewUI・評価 → updateEvalUI。noSummary でなければ右サマリーも。docs/SPEC-flow.md 3-10）
  function updateChecklistUI(noSummary) {
    if (state.view === 'judge' && state.step === 2 && $('#ivStage')) updateInterviewUI();
    else if (state.view === 'judge' && state.step === 3 && $('#clOverall')) updateEvalUI();
    if (!noSummary) renderSummary();
  }
  // =====================================================================
  // 報告書（step 4。docs/SPEC-script-mode.md 2-4・docs/SPEC-a4.md 5 章・docs/SPEC-flow.md 5-1）
  //   紙プレビュー（保存 HTML と同じ A4 縦の用紙。押印行も用紙の中）→ 押印 → 最終合否 → 保存・印刷。
  //   紙の欄はクリックしても何もしない（操作は下のカード。保存 HTML では用紙の欄をクリックして押す）
  // =====================================================================
  function reportPaperInnerHtml() {
    // 面接メモの案内は「保存した HTML の画面でクリックすると全文」（報告書の紙はクリックしても窓を出さない。アプリの印刷は保存 HTML と同じ「画面で」）
    return S.checklistSheetHtml(S.buildRecord(state), state.profile, { decisionId: 'appPaperDecision', decisionSvgId: 'vdAppPaper', stampSvgPrefix: 'ap', refWhere: '保存した HTML の画面で' });
  }

  // 入力・押印・合否の変更で紙プレビューを描き直す（報告書を開いていないときは何もしない）
  function rerenderReportPaper() {
    const el = $('#appPaper');
    if (el) { el.innerHTML = reportPaperInnerHtml(); fitReportPaper(); }
  }

  // 紙プレビューにも印刷と同じ 1 ページ保証のクラス（.cl-compact / .cl-compact-q1 / .cl-compact-2）を付ける（storage.fitChecklistSheet。押印行込みの用紙で計る。画面に出ているときだけ計れる）。
  //   紙は等倍（本文 9.5px）で見せる。報告書は 920px の 1 列（.page.reading）で、右サマリーはどの幅でも紙の下（styles.css の .page.reading .summary。docs/DESIGN.md 4-5）。
  //   列が紙より狭いときだけ縮小し、縮小は 0.95 倍まで（本文 9px 以上）。それより狭い画面（タブレット縦・スマホ）は等倍で紙だけ横スクロール。
  //   計測は縮小を外した状態で行う（縮小したままだと高さが変わる）。列の幅から紙の枠の余裕（.report-paper-wrap の左右 2px）を引いて比べる
  const PAPER_MIN_ZOOM = 0.95;
  function fitReportPaper() {
    const paper = $('#appPaper');
    if (!paper) return;
    paper.style.zoom = '';
    const sh = $('.cl-sheet', paper);
    if (sh && typeof S.fitChecklistSheet === 'function') S.fitChecklistSheet(sh);
    const wrap = $('#appPaperWrap');
    if (!wrap || !paper.offsetWidth) return;
    const z = (wrap.clientWidth - 4) / paper.offsetWidth;
    if (z < 1 && z >= PAPER_MIN_ZOOM) paper.style.zoom = String(Math.floor(z * 1000) / 1000);
  }

  function reportStepHtml() {
    const j = state.judgment;
    const ovMissing = !R.OVERALL_POINTS.hasOwnProperty(ensureChecklist().overall);
    let html = stepLeadHtml(4);
    const sum = clSummary();
    const tc = ivTimeCheck(sum);   // 面接時間が目安から大きく外れている（紙からの転記・中断など。docs/SPEC-flow.md 15 章）
    const warns = j && j.warnings ? j.warnings : [];
    if (warns.length || tc) {
      // 「評価で入力する」: 総合判断が未入力、または人物像に未入力があるとき（docs/SPEC-persona.md 3-4）。
      //   必須条件の不一致で不採用推奨に固定したときは出さない（評価の画面は「ほかの入力は任意です」。docs/SPEC-flow.md F15・14 章）
      const psm = R.personaModel(clDefNow(), ensureChecklist());
      const psMissing = !!(psm && psm.unscored) && warns.some(function (w) { return w.indexOf('人物像に未入力') === 0; });
      const gate = mustGateInfo(sum).gateReject;
      const acts = ((ovMissing || psMissing) && !gate ? '<button type="button" class="btn sm" data-action="to-step" data-step="3">評価で入力する</button>' : '') +
        (tc ? '<button type="button" class="btn sm" id="rpTimeFix" data-action="ev-time">評価で面接時間を直す</button>' : '');
      //   確認事項は注意の警告（.alert.warn。docs/DESIGN.md 3-9・4-5）
      html += '<div class="alert warn" id="scriptWarnings">' + ico('alert') + '<div class="alert-body"><p class="alert-title">確認事項</p><ul class="alert-list">' +
        warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') +
        (tc ? '<li id="rpTimeWarn">' + esc(tc.text + '。紙（記入シート）から転記した面接・中断した面接は、評価の画面で実際の分を入れてください。') + '</li>' : '') + '</ul>' +
        (acts ? '<div class="alert-actions">' + acts + '</div>' : '') +
      '</div></div>';
    }
    html += '<div class="report-paper-cap"><b>面接チェックリスト報告（A4）</b><span>保存した HTML はこの用紙 1 枚で開きます。押印・合否は下のカードで（保存した HTML では用紙の欄をクリック）</span></div>' +
      '<div class="report-paper-wrap" id="appPaperWrap"><div class="a4" id="appPaper">' + reportPaperInnerHtml() + '</div></div>';
    html += managementCardHtml();
    html += decisionCardHtml();
    return html;
  }
  // 報告書の操作行（左に戻る・右端に主ボタン。副は「A4 で印刷」）。DOM は主ボタンが先（Tab の順）。見た目の左右は CSS の order（docs/SPEC-flow.md 15 章）
  function rpFootHtml() {
    return '<div class="flow-foot no-print" id="rpFoot">' +
      '<button type="button" class="btn primary" id="reportSaveBtn" data-action="save">' + ico('download') + sym('💾 ') + '<span>報告書を保存<span class="lbl-x">（HTML）</span></span></button>' +
      '<button type="button" class="btn" id="reportPrintBtn" data-action="print-checklist">' + ico('printer') + sym('🖨 ') + '<span><span class="lbl-x">A4 で</span>印刷</span></button>' +
      '<button type="button" class="btn ff-start" id="backToChecklist" data-action="to-step" data-step="3">' + ico('arrow-left') + sym('← ') + '<span><span class="lbl-x">評価に</span>戻る</span></button><span class="spacer"></span></div>';
  }

  // =====================================================================
  // 右サマリー（docs/SPEC-script-mode.md 2-5）
  // =====================================================================
  function summaryHtml() {
    const a = state.applicant;
    const p = state.profile;
    const cl = ensureChecklist();
    const def = clDefNow();
    const rows = R.scriptApplicantRows(a, cl, p, state.management);
    const rv = function (k) { const r = rows.find(function (x) { return x.key === k; }); return r ? r.value : ''; };
    // 「応募者」は 氏名・区分/年齢/性別・面接日・担当 の 4 行。求人は短期のときだけ「短期求人」の紺のバッジを区分の行に添える（消極属性は 2026-10-13 に削除）
    const attrs = cl.header.posting === 'short' && rv('posting') ? '<span class="badge navy">' + esc(rv('posting')) + '</span>' : '';
    const model = R.interviewModel(p, cl);
    const c = model.counts || { good: 0, fair: 0, poor: 0, blank: 0 };
    const ms = R.mustSummary(def, cl);
    const mustBd = !ms.total ? '<span class="muted">—</span>'
      : ms.mismatch || ms.unknown
        ? (ms.mismatch ? '<span class="badge danger">不一致 ' + ms.mismatch + '</span>' : '') + (ms.unknown ? '<span class="badge">未確認 ' + ms.unknown + '</span>' : '')
        : '<span class="badge ok">すべて一致</span>';
    const ov = R.OVERALL_POINTS.hasOwnProperty(cl.overall) ? cl.overall : '';
    // 判定済み（報告書・保存・印刷で state.judgment がある）ならそれを、無いときだけ入力中の内容で評価して表示する
    const live = state.judgment ? state.judgment : R.checklistHasInput(cl) ? R.evaluateScript(a, cl, p) : null;
    const mg = p.management || {};
    const fields = Array.isArray(mg.fields) ? mg.fields : [];
    const stamps = fields.map(function (f) {
      const e = state.management[f.id];
      //   ✓ は SVG（textContent には「✓ 」を .sym で残す。docs/DESIGN.md 2 章）
      return esc(f.label) + (e && e.name ? ' ' + ico('check') + sym('✓ ') + esc(e.short || (Stamp ? Stamp.shortName(e.name) : e.name)) : ' 未押印');
    }).join('／');
    const row = function (id, label, val) { return '<div class="sum-row" id="' + id + '"><span class="sum-label">' + esc(label) + '</span><span class="sum-val">' + val + '</span></div>'; };
    // 小さいカード 3 枚（帯の高さ 44・題 15/700。docs/DESIGN.md 4-8）。採点の ○△× は和文のフォント（.ja）
    const sm = function (id, title, body) { return '<section class="card sm" id="' + id + '" aria-labelledby="' + id + 'H"><header class="card-band"><h3 class="card-title" id="' + id + 'H">' + title + '</h3></header><div class="card-body">' + body + '</div></section>'; };
    const mk = function (m, n) { return '<span class="ja">' + m + '</span>' + n; };
    return sm('sumApplicant', '応募者',
        '<div class="sum-name">' + (a.name ? esc(a.name) + '<small>さん</small>' : '<span class="muted">未入力</span>') + '</div>' +
        '<div class="sum-sub">' + esc([a.category, String(a.age || '').trim() ? String(a.age).trim() + '歳' : '', a.gender].filter(Boolean).join('・') || '区分・年齢未入力') +
          ' <span class="sum-attrs" id="sumAttrs">' + attrs + '</span></div>' +
        row('sumDate', '面接日', '<span class="num">' + esc(rv('date') || '—') + '</span>') +
        row('sumInterviewer', '担当', esc(rv('interviewer') || '—'))) +
      sm('sumChecklist', '面接チェックリスト',
        row('sumMust', '必須条件', mustBd) +
        row('sumMarks', '採点', mk('○', c.good) + ' ' + mk('△', c.fair) + ' ' + mk('×', c.poor) + esc((c.blank ? '（未入力 ' + c.blank + '）' : '') + '・' + model.total + '/' + model.max + '点')) +
        personaSummaryRow(R.personaModel(def, cl), row) +
        row('sumOverall', '総合判断', esc(ov ? overallLabelNow(ov) : '未入力'))) +
      sm('sumJudgment', '報告書',
        row('sumResult', '結果', live ? '<span class="badge lg ' + RESULT_TONE[live.result] + '">' + esc(live.title) + '</span>' : '—') +
        (stamps ? row('sumStamps', '押印', '<span class="sum-stamps">' + stamps + '</span>') : '') +
        decisionSummaryHtml() +
        '<div class="sum-saved" id="sumSaved">' + esc(state.dirty ? '未保存の変更あり' : state.savedAt ? '最終保存 ' + U.fmtDateTime(state.savedAt) : '未保存') + '</div>');
  }

  function renderSummary() {
    const a = state.applicant;
    const chip = $('#applicantChip');
    chip.className = 'chip-applicant' + (state.dirty ? ' dirty' : state.savedAt ? ' saved' : '');
    chip.innerHTML = '<span class="dot"></span><span>' + (a.name ? '<strong>' + esc(a.name) + '</strong> さん' : '未入力') + (state.dirty ? '・未保存' : state.savedAt ? '・保存済み' : '') + '</span>';
    $('#summaryPanel').innerHTML = summaryHtml();
  }

  // =====================================================================
  // 保存・読込・新規
  // =====================================================================
  function saveRecord() {
    const a = state.applicant;
    if (!a.name) { toast('応募者名を入力してから保存してください', 'error'); return; }
    // 面接中なら今の段階の秒も記録に入れる（タイマーは止めない。docs/SPEC-flow.md 1-2）
    ivCommit();
    // 別のタブ（ウィンドウ）で保存された設定を先に読み込む（storage イベントが届かなくても、書き出すファイルに古いロック〔ロックなし・前のパスワード〕を入れない。
    //   docs/SPEC-a4.md 11 章 L5d）。読み込み直したら判定もやり直す（下の rejudged）
    refreshProfileFromStorage();
    // 判定後に入力・設定が変わっていたら、古い判定を記録に残さず現在の内容で再判定する。報告書を開かずに保存しても判定を記録する
    const rejudged = state.judgmentStale && !state.judgment;
    ensureJudgment();
    const rec = S.buildRecord(state);
    // アプリにロックが無く、読み込んだファイルにロックがあれば、書き出すファイルにもそのロックを入れる（パスワードで押した承認の保護を外さない。11 章 L7b）
    const fl = finalLockNow() ? null : stepLockNow();
    const html = S.generateReportHTML(rec, fl ? Object.assign({}, state.profile, { management: Object.assign({}, state.profile.management, { finalLock: fl }) }) : state.profile);
    // 合否ありのときはファイル名の末尾に _採用 / _不採用（設定 management.decision.filenameSuffix）
    const dcfg = decisionCfg();
    const fname = Stamp.decisionFilename('応募者_' + S.safeName(a.name) + '_' + U.fmtDate(new Date()) + '.html', dcfg.enabled ? S.normalizeDecision(state.decision) : null, dcfg);
    S.download(fname, html, 'text/html;charset=utf-8');
    state.savedAt = rec.savedAt;
    state.dirty = false;
    renderSummary();
    if (state.step === 4) renderStep();
    // 総合判断が未入力なら警告つき（保存は止めない。docs/SPEC-script-mode.md M5）
    const ovMissing = !R.OVERALL_POINTS.hasOwnProperty(ensureChecklist().overall);
    toast(a.name + ' さんの情報を保存しました' + (rejudged ? '（判定後に入力・設定が変わったため、現在の内容で再判定しました：' + state.judgment.title + '）' : '') +
      (ovMissing ? '（総合判断が未入力です）' : ''), ovMissing ? 'warn' : 'ok');
  }

  function onFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = '';   // 同じファイルをもう一度選んでも change が起きるように空にする（読み込みボタン以外の経路でも）
    const reader = new FileReader();
    reader.onload = function (ev) {
      const text = String(ev.target.result || '');
      if (/\.json$/i.test(file.name)) { importProfileText(text); return; }
      const info = {};
      const rec = S.parseRecordFromHTML(text, info);
      if (!rec) { toast('このアプリで保存したファイルではないか、データが見つかりません', 'error'); return; }
      if (state.dirty && !window.confirm('入力中の内容を破棄して読み込みますか？')) return;
      applyRecord(rec, info.finalLock);
    };
    reader.readAsText(file, 'utf-8');
  }

  // 保存した HTML の記録を読み込む（旧い形式の記録も S.normalizeRecord で読む。docs/SPEC-slim.md 3-2）。
  //   fileLock: そのファイルの保存時の最終承認のロック（無ければ null）。アプリにロックが無いとき（公開版・外した設定）はこの記録にそのロックを使う（11 章 L7b）
  function applyRecord(rec, fileLock) {
    const p = state.profile;
    ivStop(false);
    const n = S.normalizeRecord(rec);
    state.fileLock = fileLock && Lock && Lock.isLocked(fileLock) ? { salt: fileLock.salt, hash: fileLock.hash } : null;
    state.applicant = n.applicant;
    state.checklist = n.checklist;
    ensureChecklist();
    state.interviewNotes = n.interviewNotes;
    state.management = n.management;
    state.decision = n.decision;
    state.judgment = null;
    state.judgmentStale = false;
    state.ivItems = {};
    evReturn = null; ivMustWarned = '';   // 画面の状態（評価へ戻る位置・必須条件の案内）は記録ごと
    state.savedAt = n.savedAt;
    state.dirty = false;
    const sj = n.judgment;
    const hasCl = R.checklistHasInput(state.checklist);
    const tm = U.isObj(state.checklist.timing) ? state.checklist.timing : null;
    //   回答があるのにタイマーの記録が無い（タイマー導入前に面接した記録）: 面接の画面で直しても面接時間を数えない
    state.ivNoTimer = hasCl && !(tm && tm.startedAt);
    // 再開先（docs/SPEC-flow.md 6-5）。2026-10-16 より前の記録の step 3 は旧 ②（面接チェックリスト）＝回答があれば評価・無ければ面接
    let target;
    if (n.legacy.full || n.legacy.v1) target = hasCl && sj ? 4 : hasCl ? 3 : 2;   // 旧い形式の記録は評価を入れ直す前提
    else if (n.step === 4) target = sj ? 4 : hasCl ? 3 : 2;
    else if (n.step === 3) target = hasCl ? 3 : 2;
    else if (n.step === 2) target = 2;
    else target = !hasCl ? 1 : tm && tm.startedAt && !tm.endedAt ? 2 : 3;
    state.step = target;
    state.maxStepReached = Math.max(target, sj ? 4 : 0, hasCl ? 3 : 0, tm && tm.startedAt ? 2 : 0);
    // 判定は goStep(4) と同じく読み込んだ内容でやり直す。描画は showView の 1 回だけ（報告書の紙の計測〔fitReportPaper〕を 2 回続けて行わない。docs/SPEC-a4.md 12 章 F8）
    if (target === 4) { state.judgment = evaluateNow(); state.judgmentStale = false; }
    showView('judge');

    const msgs = [];
    if (n.theaterName && n.theaterName !== p.meta.theaterName) msgs.push('このファイルは「' + n.theaterName + '」の設定で保存されています。現在の設定で判定し直します');
    else msgs.push((state.applicant.name || '応募者') + ' さんのデータを読み込みました');
    if (n.legacy.full) msgs.push('詳細モードで保存された記録です。面接前の詳細（勤務条件・留意点・シフト貢献度など）は読み込みません（元のファイルはそのまま残ります）');
    if (n.legacy.scores) msgs.push('旧形式の面接評価（10 項目×5 点）は読み込みません。評価の画面で評価し直してください');
    if (n.legacy.initial) msgs.push('初期対応者の押印欄は廃止したため表示しません');
    if (state.fileLock && !finalLockNow()) msgs.push('このファイルは最終承認のパスワード付きで保存されています。最終確認・最終合否はそのパスワードで押せます（保存し直したファイルにも引き継ぎます）');
    const old = n.legacy.full || n.legacy.v1 || n.legacy.scores;
    if (!old && target === 4 && sj && state.judgment && sj.result !== state.judgment.result) {
      msgs[0] = '保存時の判定（' + (sj.title || resultTitle(sj.result)) + '）と現在の設定での再判定（' + state.judgment.title + '）が異なります';
    }
    // 保存時と現在の台本で確認点が違うとき（追加分は未入力＝0 点になるため）
    if (U.isObj(n.checklistDef) && hasCl) {
      const d = R.checklistDiff(n.checklistDef, p.checklist);
      if (d.added.length || d.removed.length) {
        msgs.push('保存時と面接チェックリストの確認点が異なります（追加 ' + d.added.length + '・削除 ' + d.removed.length + '）。現在の台本で再判定します');
      }
    }
    // 人物像（docs/SPEC-persona.md 1-7・D18・D19）: 導入前に保存した記録は人物像を使わない（判定を変えない）／保存時と人物像の項目が違う記録は現在の項目で再判定
    if (state.checklist.persona === null && hasCl && personaOnNow()) msgs.push('人物像（1〜5 点）の導入前に保存された記録のため、人物像は使いません');
    if (U.isObj(n.checklistDef) && hasCl && state.checklist.persona !== null) {
      const pd = R.personaDiff(n.checklistDef, p.checklist);
      if (pd.added.length || pd.removed.length) msgs.push('保存時と人物像の項目が異なります（追加 ' + pd.added.length + '・削除 ' + pd.removed.length + '）。現在の項目で再判定します');
    }
    toast(msgs.join('。') + '。', 'ok');
  }

  function onProfileFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = function (ev) { importProfileText(String(ev.target.result || '')); };
    reader.readAsText(file, 'utf-8');
  }

  function importProfileText(text) {
    let p;
    const rep = {};
    try { p = S.parseProfileJSON(text, rep); } catch (err) { toast('読み込めません: ' + err.message, 'error'); return; }
    if (!window.confirm('「' + p.meta.theaterName + '」のプロファイルを読み込み、現在の設定を置き換えます。よろしいですか？')) return;
    // 別のタブで保存された最新のロックと比べる（docs/SPEC-a4.md 11 章 L5d）。JSON に最終承認のロック（salt・hash）も「外した」印も無ければ
    //   （公開版が書き出した空のロック・キーなし）、いまのロックのまま（読み込んでもパスワードは変わらない）。「外した」印は有効なロックを外すときだけ（L6c）
    refreshProfileFromStorage();
    let rawLock;
    try { rawLock = ((JSON.parse(text) || {}).management || {}).finalLock; } catch (err) { rawLock = undefined; }
    //   JSON の chain は使わず、いまのロックのものを引き継ぐ（ロックの無い状態で読み込んだロックは、既定のロックを持つ版〔ローカル版〕では使わない。L6d）
    if (S.lockUnset(rawLock)) p.management.finalLock = U.deepClone(state.profile.management.finalLock);
    else { p.management.finalLock = S.normalizeLock(rawLock); inheritChain(p); }
    p = keepLockOff(p);
    const sig0 = lockSig(state.profile);
    const apply = function () {
      if (lockMovedSince(sig0)) return;
      state.profile = p;
      persistProfile(p);
      onProfileChanged();
      toast(profileNotice(rep) || 'プロファイルを読み込みました', 'ok');
      showView('settings');
    };
    // 読み込むと最終承認のパスワードが変わる／外れるとき、またはロックの対象（押印欄と連動・最終合否の ON/OFF・押印欄の構成）が変わるときは、
    //   現在のパスワードを求める（違えば・キャンセルなら読み込まない。docs/SPEC-a4.md 11 章 L5b・L5c）
    const lockCh = finalLockChanges(p);
    if (!lockCh && !finalScopeChanges(p)) { apply(); return; }
    askFinalPassword(lockCh
      ? '読み込むプロファイルでは最終承認のパスワードが' + (Lock.isLocked(p.management.finalLock) ? '別のパスワードに変わります' : '外れます') + '。現在のパスワードを入力してください。'
      : '読み込むプロファイルでは「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成・押印欄の表示名が変わり、最終承認のパスワードで守る欄が変わります。現在のパスワードを入力してください。')
      .then(function (ok) { if (ok) apply(); else toast('プロファイルを読み込みませんでした（最終承認のパスワードを確認できません）', 'error'); });
  }

  function newRecord() {
    if (state.dirty && !window.confirm('入力中の内容を破棄して新規作成しますか？')) return;
    ivStop(false);
    state.ivItems = {};
    evReturn = null; ivMustWarned = '';
    state.ivNoTimer = false;
    state.applicant = emptyApplicant();
    state.checklist = R.emptyChecklist(); state.interviewNotes = ''; state.judgment = null; state.judgmentStale = false;
    state.management = {};
    state.decision = null;
    state.fileLock = null;
    state.savedAt = null; state.dirty = false;
    state.step = 1; state.maxStepReached = 1;
    showView('judge');
    toast('新規の応募者を開始しました');
  }

  // =====================================================================
  // 面接チェックリスト報告（A4 縦 1 枚）の印刷（docs/SPEC-a4.md 5 章）
  //   body.print-checklist を付けて印刷する。印刷ホスト #clSheet（画面では非表示）に報告書の紙と同じ部品（div.a4 ＋ storage.checklistSheetHtml）を
  //   描き、同じ計測（storage.fitChecklistSheet。押印行込みの用紙）をしてから、用紙そのものを 1 ページ（@page の余白 0）で印刷する。
  //   どのステップ・トップバー・Ctrl+P からでも印刷できるようホストは報告書の紙と別に持つ（報告書を開いていなくても描ける）
  // =====================================================================
  function prepareChecklistSheet(on) {
    const host = $('#clSheet');
    if (!host) return false;
    if (on) {
      if (typeof S.checklistSheetHtml !== 'function') {
        toast('面接チェックリスト報告を作成できません（印刷用の描画が見つかりません）', 'error');
        return false;
      }
      injectChecklistSheetCss();
      ivCommit();
      // 報告書を開かずに印刷しても結果が入るよう、判定が無ければ現在の入力で判定する
      if (ensureJudgment() && state.view === 'judge') renderSummary();
      const rec = S.buildRecord(state);
      host.innerHTML = '<div class="a4">' + S.checklistSheetHtml(rec, state.profile, {}) + '</div>';
      document.body.classList.add('print-checklist');
      const sheet = $('#clSheet .cl-sheet');
      if (sheet && typeof S.fitChecklistSheet === 'function') S.fitChecklistSheet(sheet);
    } else {
      document.body.classList.remove('print-checklist');
      host.innerHTML = '';
    }
    return true;
  }

  // 印刷後の片付け（afterprint か 3 秒後の早い方で 1 回だけ。遅れて来たほうが次の印刷の用紙を消さない）
  function afterPrintOnce(cleanup) {
    let done = false;
    const run = function () { if (done) return; done = true; window.removeEventListener('afterprint', run); cleanup(); };
    window.addEventListener('afterprint', run);
    setTimeout(run, 3000);
  }
  function printChecklistSheet() {
    if (!prepareChecklistSheet(true)) return;
    afterPrintOnce(function () { prepareChecklistSheet(false); });
    window.print();
  }
  // トップバーの「🖨 報告書を印刷」（docs/SPEC-flow.md 15 章）: まだ回答が無い（面接の前・下見の）ときは、紙に書いて面接するための記入シートと取り違えていないか確かめる。
  //   ［キャンセル］なら印刷せず、準備の画面なら「🖨 記入シート（手書き用）」にフォーカス。回答があれば確かめずに印刷する（Ctrl+P は確かめない）
  const TOP_PRINT_ASK = 'まだ面接の回答がありません。報告書（A4 の面接チェックリスト報告）を印刷しますか？\n\n紙に書いて面接するときは［キャンセル］を押して、準備の画面の「記入シート（手書き用）」を印刷してください。';
  function onTopPrint() {
    if (!ivHasAnswers() && !window.confirm(TOP_PRINT_ASK)) {
      const pb = $('#saPaperBtn');
      if (pb) pb.focus();
      return;
    }
    printChecklistSheet();
  }

  // =====================================================================
  // 面接記入シート（手書き用。A4 縦 1 枚。docs/SPEC-persona.md 5-5）の印刷
  //   報告書の印刷と同じ仕組み（印刷ホスト #clSheet・body.print-checklist・@page a4sheet の余白 0）。判定は走らせない・保存しない。
  //   印字するのは準備の応募者だけ（面接・評価の回答は印字しない）。Ctrl+P は従来どおり報告書
  // =====================================================================
  //   並びは 面接 ①〜⑤ → 評価。段階の中は台本の順（確かめる → 話す → 聞く。面接の画面の 話す → 聞く → 確かめる とは違う。用紙は変えない。docs/DESIGN.md 4-9）
  const PAPER_BTN_TITLE = '紙に書くときの A4 1 枚（面接 ①〜⑤ → 評価の順。段階の中は台本の順）を印刷';
  function preparePaperSheet(on) {
    const host = $('#clSheet');
    if (!host) return false;
    if (on) {
      if (typeof S.paperSheetHtml !== 'function') {
        toast('記入シートを作成できません（印刷用の描画が見つかりません）', 'error');
        return false;
      }
      injectChecklistSheetCss();
      ivCommit();
      // 準備の入力をそのまま印字する（面接日を空にしていれば記入用の線。今日の日付で埋めない＝印刷で記録を書き換えない。docs/SPEC-persona.md 11-9 補完 3）
      ensureChecklist();
      host.innerHTML = '<div class="a4 pp-a4">' + S.paperSheetHtml(S.buildRecord(state), state.profile, {}) + '</div>';
      document.body.classList.add('print-checklist');
      const sh = $('#clSheet .pp-sheet');
      if (sh && typeof S.fitPaperSheet === 'function') S.fitPaperSheet(sh);
    } else {
      document.body.classList.remove('print-checklist');
      host.innerHTML = '';
    }
    return true;
  }

  function printPaperSheet() {
    if (!preparePaperSheet(true)) return;
    afterPrintOnce(function () { preparePaperSheet(false); });
    window.print();
  }

  // =====================================================================
  // 応募者の管理（押印）
  // =====================================================================
  const Stamp = global.RecruitStamp;

  // =====================================================================
  // 最終承認のパスワード（docs/SPEC-a4.md 11 章）
  //   最終確認（既定の最終確認欄 'final' と decision.stampField の押印欄。storage.finalLockFields）の押印・取消と最終合否の決定・取消の前に求める（面接対応者の押印には要らない）。
  //   「押印欄と連動」を「連動しない」や別の欄に変えても最終確認欄はロックの対象のまま。ロックの対象を変える設定（押印欄と連動・最終合否の ON/OFF・押印欄の構成）の
  //   保存・JSON の読み込みには現在のパスワードが要る（finalScopeChanges）
  //   ロック（profile.management.finalLock = { salt, hash }）があり、このページでまだ解錠していないとき、報告書のカードの操作の代わりにパスワード欄と［確認］を出す。
  //   正しければこのページを閉じる／読み込み直すまで解錠（変数だけ。localStorage・書き出すファイルには残さない）。ロックが変わったら（設定の保存・JSON・初期化）また求める
  // =====================================================================
  const Lock = global.RecruitLock;
  let finalUnlockedKey = '';
  function finalLockNow() {
    const lk = ((state.profile || {}).management || {}).finalLock;
    return Lock && Lock.isLocked(lk) ? lk : null;
  }
  // 報告書の最終確認・最終合否で照合するロック: アプリのロック。無ければ（公開版・外した設定）読み込んだファイルの保存時のロック（state.fileLock。11 章 L7b）。
  //   設定の変更・JSON・初期化で確かめるのはアプリのロックだけ（finalLockNow）
  function stepLockNow() {
    return finalLockNow() || (state.fileLock && Lock && Lock.isLocked(state.fileLock) ? state.fileLock : null);
  }
  function lockKey(lk) { return lk ? lk.salt + ':' + lk.hash : ''; }
  // fid: 押印欄の id（'' = 最終合否）。パスワードが要るのは最終合否と、最終確認欄 'final'・decision.stampField の欄だけ
  function finalNeedsPw(fid) {
    const lk = stepLockNow();
    if (!lk || finalUnlockedKey === lockKey(lk)) return false;
    return fid === '' || (!!fid && S.finalLockFields(state.profile).indexOf(fid) >= 0);
  }
  //   パスワードが要る欄（docs/DESIGN.md 3-14）: 鍵のアイコン＋1 行・パスワード（40）＋［確認］（副。紺の塗りは操作行の主ボタンだけ）・エラーの 1 行
  function finalLockRowHtml(where) {
    return '<div class="final-lock no-print" data-lock-for="' + esc(where) + '">' +
      '<p class="final-lock-msg">' + ico('lock') + '<span>最終承認にはパスワードが必要です</span></p>' +
      '<div class="final-lock-ctl"><input type="password" class="final-lock-pw" autocomplete="off" aria-label="最終承認のパスワード" placeholder="パスワード">' +
      '<button type="button" class="btn" data-action="unlock-final">確認</button></div>' +
      '<div class="final-lock-err" role="alert"></div></div>';
  }
  // ［確認］・Enter: 正しければ解錠して報告書のカードを描き直す（パスワード欄が消え、担当者の選択と押印・合否のボタンが出る）。違えば 1 行出して何もしない
  function unlockFinal(row) {
    const lk = stepLockNow();
    if (!row || !lk) return;
    const inp = row.querySelector('.final-lock-pw'), err = row.querySelector('.final-lock-err');
    const fail = function (msg) { if (err) err.innerHTML = ico('alert') + '<span>' + esc(msg) + '</span>'; if (inp) { inp.focus(); inp.select(); } };
    if (!inp || !inp.value) { fail('パスワードを入力してください'); return; }
    if (!Lock.verify(lk, inp.value)) { fail('パスワードが違います'); return; }
    finalUnlockedKey = lockKey(lk);
    const where = row.getAttribute('data-lock-for');
    rerenderManagementCard();
    rerenderDecisionCard();
    const next = where === 'decision' ? $('#decisionManager') : $('#mgmtCard .stamp-box[data-field-id="' + (window.CSS && CSS.escape ? CSS.escape(where) : where) + '"] select');
    if (next) next.focus();
    toast('最終承認のパスワードを確認しました（このページを閉じるまで有効）', 'ok');
  }
  // JSON の読み込み・初期化でロックが変わる／外れるとき、現在のロックがあれば現在のパスワードを求める（小さなダイアログ。キャンセル・Esc で中止）
  function finalLockChanges(nextProfile) {
    const cur = finalLockNow();
    if (!cur) return false;
    const nx = ((nextProfile || {}).management || {}).finalLock;
    return !(Lock.isLocked(nx) && nx.salt === cur.salt && nx.hash === cur.hash);
  }
  // 設定の保存・JSON の読み込みでロックの対象（押印欄と連動・最終合否の ON/OFF・押印欄の追加・削除・id・表示名）が変わるとき（現在のロックがあれば）。
  //   押印欄の説明（hint）・最終合否の表示名・名簿だけの変更は含めない。nextProfile は正規化したもの
  function finalScopeChanges(nextProfile) {
    return !!finalLockNow() && S.finalLockScope(nextProfile) !== S.finalLockScope(state.profile);
  }
  function askFinalPassword(msg) {
    const lk = finalLockNow();
    return new Promise(function (resolve) {
      if (!lk) { resolve(true); return; }
      const old = $('#pwDialog');
      if (old) old.remove();
      const back = document.createElement('div');
      //   ダイアログ（docs/DESIGN.md 3-13）: 覆い・題（鍵のアイコン）・本文・パスワード・エラーの 1 行・右寄せの［キャンセル］（副）［確認］（主。覆いの上なので 1 画面に 1 つのまま）
      back.className = 'dlg-back';
      back.id = 'pwDialog';
      back.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="pwDialogH">' +
        '<h3 id="pwDialogH">' + ico('lock') + '<span>最終承認のパスワード</span></h3><p>' + esc(msg) + '</p>' +
        '<input type="password" id="pwDialogInput" autocomplete="off" aria-label="現在のパスワード" placeholder="現在のパスワード">' +
        '<div class="dlg-err" id="pwDialogErr" role="alert"></div>' +
        '<div class="dlg-actions"><button type="button" class="btn" data-pw="cancel">キャンセル</button><button type="button" class="btn primary" data-pw="ok">確認</button></div></div>';
      document.body.appendChild(back);
      const inp = $('#pwDialogInput'), err = $('#pwDialogErr');
      const onKey = function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); done(false); }
        else if (e.key === 'Enter' && e.target === inp) { e.preventDefault(); tryOk(); }
      };
      const done = function (ok) { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(ok); };
      const fail = function (msg) { err.innerHTML = ico('alert') + '<span>' + esc(msg) + '</span>'; };
      const tryOk = function () {
        if (!inp.value) { fail('パスワードを入力してください'); inp.focus(); return; }
        if (!Lock.verify(lk, inp.value)) { fail('パスワードが違います'); inp.focus(); inp.select(); return; }
        done(true);
      };
      back.addEventListener('click', function (e) {
        const b = e.target.closest('[data-pw]');
        if (b) { if (b.dataset.pw === 'ok') tryOk(); else done(false); }
      });
      document.addEventListener('keydown', onKey, true);
      inp.focus();
    });
  }

  function managementCardHtml() {
    const mg = state.profile.management || {};
    const fields = Array.isArray(mg.fields) ? mg.fields : [];
    if (!fields.length || !Stamp) return '';
    const managers = Array.isArray(mg.managers) ? mg.managers : [];
    // 面接チェックリストの担当が名簿にあれば、未押印の「面接対応者」の選択の初期値にする（自動で押印はしない）
    const ivField = (clDefNow().header || {}).interviewerField || '';
    const ivName = String(((state.checklist || {}).header || {}).interviewer || '').trim();
    const ivIdx = ivName ? managers.findIndex(function (m) { return m && m.name === ivName; }) : -1;
    //   カード（帯: 押印・欄の数）の本文は 説明 → 押印の欄（2 列〔760px 以下は 1 列〕）。欄は 名前と説明 → 印の場所 → 押した人と日付 → 担当者の選択＋［押印］（副）→ 押した後は［取消］（ゴースト）。docs/DESIGN.md 3-14
    return cardHtml({ id: 'mgmtCard', icon: 'stamp', title: '応募者の管理（押印）', small: fields.length + ' 欄' },
      '<p class="card-note">担当者を選んで押印してください。押印は保存ファイル（HTML）に入り、保存した HTML でも用紙の欄をクリックして押印できます。名簿は設定の「応募者の管理」で編集します。</p>' +
      '<div class="stamp-row' + (fields.length === 2 ? ' cols-2' : '') + '">' + fields.map(function (fld, idx) {
        const e = state.management[fld.id];
        const svg = e && e.name ? Stamp.render(e, { size: 88, id: 'app' + idx }) : '';
        return '<div class="stamp-box" data-field-id="' + esc(fld.id) + '">' +
          '<div class="stamp-head"><span class="stamp-label">' + esc(fld.label) + '</span>' + (fld.hint ? '<span class="stamp-hint">' + esc(fld.hint) + '</span>' : '') + '</div>' +
          '<div class="stamp-area">' + (svg || '<div class="stamp-empty">未押印</div>') + '</div>' +
          '<div class="stamp-meta">' + (e && e.name ? esc(e.name + (e.title ? '（' + e.title + '）' : '') + '　' + (e.date || '')) : '') + '</div>' +
          (finalNeedsPw(fld.id) ? finalLockRowHtml(fld.id) + '</div>' :
          '<div class="stamp-ctl no-print">' +
            '<select data-stamp-select aria-label="' + esc(fld.label) + ' 担当者"><option value="">担当者を選択</option>' +
              managers.map(function (m, i) {
                const pre = !(e && e.name) && fld.id === ivField && i === ivIdx;
                return '<option value="' + i + '"' + (pre ? ' selected' : '') + '>' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>';
              }).join('') +
              (mg.allowFreeName !== false ? '<option value="__free">名簿にない担当者（手入力）</option>' : '') +
            '</select>' +
            (mg.allowFreeName !== false ? '<input type="text" class="stamp-free hidden" placeholder="氏名（例：山田 太郎）" aria-label="' + esc(fld.label) + ' 担当者の氏名">' : '') +
            '<button type="button" class="btn" data-action="stamp">' + ico('stamp') + '<span>押印</span></button>' +
            (e && e.name ? '<button type="button" class="btn sm ghost" data-action="unstamp">取消</button>' : '') +
          '</div></div>');
      }).join('') + '</div>');
  }

  function rerenderManagementCard() {
    const card = $('#mgmtCard');
    if (!card) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = managementCardHtml();
    card.replaceWith(tmp.firstElementChild);
  }

  // =====================================================================
  // 最終合否（採用／不採用のスタンプ。docs/SPEC-report.md 6 章）
  //   アプリの判定（推奨）とは別の「人の決定」。保存 HTML の「最終合否」パネルと同じ振る舞い
  // =====================================================================
  function decisionCfg() { return S.decisionConfig(state.profile); }

  // 判定と食い違う合否の注記（採用 × 不採用推奨、不採用 × 採用推奨のときだけ。止めない）
  function decisionNoteText(d, j) {
    if (!d || !j) return '';
    if ((d.result === 'hire' && j.result === 'reject') || (d.result === 'reject' && j.result === 'recommend')) {
      return '※ アプリの判定「' + (j.title || '') + '」と異なる最終合否です（記録はそのまま残ります）。';
    }
    return '';
  }

  function decisionLabelOf(d, dcfg) { return d.label || (d.result === 'hire' ? dcfg.hireLabel : dcfg.rejectLabel); }

  function decisionCardHtml() {
    const dcfg = decisionCfg();
    if (!dcfg.enabled || !Stamp) return '';
    const mg = state.profile.management || {};
    const managers = Array.isArray(mg.managers) ? mg.managers : [];
    const fields = Array.isArray(mg.fields) ? mg.fields : [];
    const allowFree = mg.allowFreeName !== false;
    const d = S.normalizeDecision(state.decision);
    // 担当者の初期選択: 連動する押印欄（最終確認）の押印者 → 合否を押した人
    const st = dcfg.stampField ? (state.management || {})[dcfg.stampField] : null;
    const selName = (st && st.name) || (d ? d.by.name : '') || '';
    const selIdx = selName ? managers.findIndex(function (m) { return m && m.name === selName; }) : -1;
    const useFree = !!selName && selIdx < 0 && allowFree;
    const note = decisionNoteText(d, state.judgment);
    const linked = dcfg.autoStampFinal && dcfg.stampField ? fields.find(function (f) { return f.id === dcfg.stampField; }) : null;
    //   最終合否はセグメントボタン［採用（緑）｜不採用（赤）］（押下中は aria-pressed。スタンプのインクの色〔朱・藍〕はボタンに使わない。docs/DESIGN.md 3-14）
    const btn = function (r, lbl) {
      const on = !!d && d.result === r;
      return '<button type="button" class="seg-btn ' + r + (on ? ' active' : '') + '" data-action="decide" data-value="' + r + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(lbl) + '</button>';
    };
    const stamp = d
      ? Stamp.verdict({ label: decisionLabelOf(d, dcfg), date: d.date, color: d.result === 'hire' ? dcfg.hireColor : dcfg.rejectColor, size: 120, id: 'vdApp', sub: dcfg.sub })
      : '<div class="verdict-empty">未押印</div>';
    const meta = d ? decisionLabelOf(d, dcfg) + '・' + d.by.name + (d.by.title ? '（' + d.by.title + '）' : '') + '　' + (d.date || '') : 'まだ押されていません';
    const locked = finalNeedsPw('');
    //   カード（帯: 最終合否・採用／不採用）の本文: 説明 → 左にスタンプ・右に状態の 1 行と項目の行 2 つ（担当者＋選択／最終合否＋［採用｜不採用］）。
    //   押した後は［採用｜不採用］の下の行の右端に［取消］（ゴースト sm。押印の欄の［押印］の下の［取消］と同じ位置関係。docs/DESIGN.md 3-14）。
    //   パスワードが要るときは項目の行の代わりにパスワードの欄
    return cardHtml({ id: 'decisionCard', cls: 'decision-card ' + (d ? 'is-' + d.result : 'is-none'), attrs: ' data-result="' + (d ? d.result : '') + '"', icon: 'check', title: esc(dcfg.label),
      small: esc(dcfg.hireLabel + '／' + dcfg.rejectLabel) },
      '<p class="card-note">' + (dcfg.hint ? esc(dcfg.hint) + '。' : '') +
        'アプリの判定（推奨）とは別に、最終確認者が「' + esc(dcfg.hireLabel) + '」「' + esc(dcfg.rejectLabel) + '」を決めて押します。保存した HTML 上でも押せます。</p>' +
      '<div class="decision-body">' +
        '<div class="decision-stamp" id="decisionStamp">' + stamp + '</div>' +
        '<div class="decision-main">' +
          '<p class="decision-meta" id="decisionMeta">' + esc(meta) + '</p>' +
          (note ? '<div class="alert warn" id="decisionNote">' + ico('alert') + '<span>' + esc(note) + '</span></div>' : '') +
          (locked ? finalLockRowHtml('decision') :
          '<div class="rows decision-ctl no-print">' +
            '<div class="row"><label class="row-label" for="decisionManager">担当者</label><div class="row-ctl">' +
              '<select id="decisionManager" data-decision-select><option value="">担当者を選択</option>' +
                managers.map(function (m, i) { return '<option value="' + i + '"' + (i === selIdx ? ' selected' : '') + '>' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>'; }).join('') +
                (allowFree ? '<option value="__free"' + (useFree ? ' selected' : '') + '>名簿にない担当者（手入力）</option>' : '') +
              '</select>' +
              (allowFree ? '<input type="text" id="decisionFree" class="stamp-free' + (useFree ? '' : ' hidden') + '" placeholder="氏名（例：山田 太郎）" aria-label="' + esc(dcfg.label) + ' 担当者の氏名" value="' + (useFree ? esc(selName) : '') + '">' : '') +
            '</div></div>' +
            //   連動の案内は「採用」「不採用」のボタンを出しているときだけ（パスワード欄のときはボタンが無い）
            '<div class="row' + (d ? ' has-undo' : '') + '"><div class="row-label">' + esc(dcfg.label) +
              (linked ? '<span class="row-hint hint">押すと、押印欄「' + esc(linked.label) + '」が未押印なら同じ担当者の印も押します</span>' : '') + '</div>' +
              '<div class="row-ctl"><div class="seg" role="group" aria-label="' + esc(dcfg.label) + '">' + btn('hire', dcfg.hireLabel) + btn('reject', dcfg.rejectLabel) + '</div></div>' +
              (d ? '<div class="row-undo"><button type="button" class="btn sm ghost no-print" data-action="undecide">取消</button></div>' : '') + '</div>' +
          '</div>') +
        '</div>' +
      '</div>');
  }

  function rerenderDecisionCard() {
    const card = $('#decisionCard');
    if (!card) return;
    const html = decisionCardHtml();
    if (!html) { card.remove(); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    card.replaceWith(tmp.firstElementChild);
  }

  // 「採用」「不採用」を押す（担当者は押印と同じ規則。autoStampFinal なら連動する押印欄も押す）
  function decide(r) {
    const dcfg = decisionCfg();
    if (!dcfg.enabled || !Stamp || (r !== 'hire' && r !== 'reject') || finalNeedsPw('')) return;
    const mg = state.profile.management || {};
    const sel = $('#decisionManager');
    const v = sel ? sel.value : '';
    let m = null;
    if (v === '__free') {
      const inp = $('#decisionFree');
      const nm = inp ? inp.value.trim() : '';
      if (!nm) { toast('氏名を入力してください', 'error'); if (inp) inp.focus(); return; }
      m = { name: nm, short: Stamp.shortName(nm), title: '' };
    } else {
      m = (mg.managers || [])[Number(v)];
      if (v === '' || !m) { toast('担当者を選んでください', 'error'); return; }
    }
    const who = { name: m.name, short: m.short || Stamp.shortName(m.name), title: m.title || '' };
    const dt = Stamp.stampDate(new Date()), at = new Date().toISOString();
    const label = r === 'hire' ? dcfg.hireLabel : dcfg.rejectLabel;
    state.decision = { result: r, label: label, date: dt, at: at, by: who };
    let auto = null;
    if (dcfg.autoStampFinal && dcfg.stampField) {
      const fld = (mg.fields || []).find(function (f) { return f.id === dcfg.stampField; });
      const cur = state.management[dcfg.stampField];
      if (fld && !(cur && cur.name)) {
        state.management[dcfg.stampField] = { name: who.name, short: who.short, title: who.title, date: dt, at: at };
        auto = fld;
      }
    }
    state.dirty = true;
    rerenderDecisionCard();
    rerenderManagementCard();
    rerenderReportPaper();
    renderSummary();
    toast(who.name + ' さんが「' + label + '」を押しました' + (auto ? '（' + auto.label + 'にも押印）' : ''), 'ok');
  }

  // 右サマリーの「最終合否」（有効かつ押印済みのときだけ）
  function decisionSummaryHtml() {
    const dcfg = decisionCfg();
    const d = dcfg.enabled ? S.normalizeDecision(state.decision) : null;
    if (!d) return '';
    //   採用＝緑・不採用＝赤のバッジ（スタンプのインクの色は使わない）
    return '<div class="sum-row" id="sumDecision"><span class="sum-label">' + esc(dcfg.label) + '</span><span class="sum-val"><span class="badge ' + (d.result === 'hire' ? 'ok' : 'danger') + ' dec-' + d.result + '">' +
      esc(decisionLabelOf(d, dcfg) + '・' + (d.by.short || Stamp.shortName(d.by.name))) + '</span></span></div>';
  }

  // 使い方の「人物像（1〜5 点）と記入シート」（docs/SPEC-persona.md 6-3・docs/SPEC-flow.md 7-1）。境界・結果は現在の設定から。設定で OFF ならそのことも書く。
  //   項目名・目盛りの文言・結果の表示名は設定（JSON の読み込みを含む）から入るので esc を通す。項目名は「、」でつなぐ（「笑顔・表情」の「・」と区別。D6）
  function helpPersonaHtml() {
    const pd = (clDefNow().persona) || {};
    const ps = R.personaModel(clDefNow(), { persona: {} });
    const capName = function (c) { return c === 'reject' ? resultTitle('reject') : c === 'review' ? resultTitle('review') + 'まで' : '下げない'; };
    const keep = R.num(pd.keepPct, 70), rej = R.num(pd.rejectBelowPct, 40);
    const labels = ps ? ps.scaleLabels : ['不採用レベル', 'やや不安', '普通', '良い', 'とても良い'];
    const n = (ps ? 4 : 5);
    return helpCard('helpPersona', 'user', '人物像（1〜5 点）と記入シート', n + ' 項目', '<ol class="help-list">' +
      (ps ? '' : '<li id="helpPersonaOff"><b>いまの設定では人物像を使いません</b>（設定「面接チェックリスト」の「人物像を使う」で ON にできます）。評価の画面・報告書・記入シートに人物像は出ず、判定にも使いません。</li>') +
      '<li><b>人物像</b>：評価の画面の人物像のカードで、' + (ps ? ps.items.length + ' 項目（' + esc(ps.items.map(function (it) { return it.name; }).join('、')) + '）' : '接客の項目') + 'に 1〜5 点を付けます（' +
        esc(labels.map(function (l, i) { return (i + 1) + ' ' + l; }).join('・')) + '）。' + (ps ? '満点は ' + ps.max + ' 点です。' : '') + 'クリックのほか、数字キー 1〜5 でも入力できます（次の行へ進みます）。</li>' +
      '<li><b>判定への反映</b>：得点率 ' + keep + '% 以上はそのまま・' + rej + '% 以上 ' + keep + '% 未満は' + esc(resultTitle('review')) + 'まで・' + rej + '% 未満は' + esc(resultTitle('reject')) + '。1 点の項目が 1 つでもあれば' +
        esc(capName(pd.onePointResult || 'review')) + '、未入力があれば' + esc(capName(pd.unscoredResult || 'review')) + '（下げる方向だけ。上げることはありません。設定の「面接チェックリスト」で変更できます）。</li>' +
      '<li><b>記入シート（手書き用）</b>：準備の画面の「記入シート（手書き用）」（「面接を始める →」の左）で A4 1 枚を印刷できます（面接 ①〜⑤ → 評価の順・質問ごとに答えの線。準備に入力した氏名などは印字）。' +
        '段階の中は台本の順（確かめる → 話す → 聞く）で、面接の画面（話す → 聞く → 確かめる）とは並びが違うので、転記は項目の名前で合わせます。紙に書いて面接し、終わったらアプリに転記します。</li>' +
      '<li>確認点「最低限の話し方、敬語が可能か」は人物像の「言葉遣い・説明のわかりやすさ」と重なるため、既定の台本から外しました（台本 1 枚目の前書きにある話し方・敬語は、この人物像の項目で付けます）。</li></ol>');
  }
  // 人物像で結果が下がる条件の文（文字列。HTML にするときは esc）。上長最終判断要まで下げる条件と不採用推奨にする条件を、1 点・未入力の設定（onePointResult・unscoredResult）と境界から組み立てる。
  //   使い方の「結果（推奨）の決まり方」と評価の画面の総評の説明で共用（既定: 「人物像（1〜5 点）の合計が低い・1 点の項目がある・未入力があると、結果を上長最終判断要（合計が 40% 未満なら不採用推奨）まで下げます」）
  function personaRuleText() {
    const pd = (clDefNow().persona) || {};
    const one = R.PERSONA_RESULTS.indexOf(pd.onePointResult) >= 0 ? pd.onePointResult : 'review';
    const uns = R.PERSONA_RESULTS.indexOf(pd.unscoredResult) >= 0 ? pd.unscoredResult : 'review';
    const toReview = ['合計が低い'], toReject = ['合計が ' + R.num(pd.rejectBelowPct, 40) + '% 未満'];
    (one === 'review' ? toReview : one === 'reject' ? toReject : []).push('1 点の項目がある');
    (uns === 'review' ? toReview : uns === 'reject' ? toReject : []).push('未入力がある');
    return '人物像（1〜5 点）の' + toReview.join('・') + 'と、結果を' + resultTitle('review') + '（' + toReject.join('・') + 'なら' + resultTitle('reject') + '）まで下げます';
  }
  function helpPersonaRuleLi() {
    return '<li>' + esc(personaRuleText()) + '（下げる方向だけ。設定で変更可' + (R.personaModel(clDefNow(), { persona: {} }) ? '' : '。いまの設定では人物像を使いません') + '）。</li>';
  }

  // 使い方（docs/SPEC-flow.md 7-1）: 4 つの手順 → 面接の進め方（1 分で読める長さ）→ 報告書（HTML）の流れ → 人物像と記入シート → 結果の決まり方・保存と読み込み・設定・最終承認のパスワード
  function helpHtml() {
    const m = state.profile.meta;
    const ss = ivSections();
    const def = clDefNow();
    const first = ss[0], last = ss[ss.length - 1];
    const jump = ss.find(function (x) { return x.id === def.mustFailJumpTo; });
    const jumpMin = jump && jump.minutes ? (jump.minutesMax ? '最大 ' : '') + jump.minutes + ' 分' : '';
    const lastDef = last ? (def.sections || []).find(function (x) { return U.isObj(x) && x.id === last.id; }) : null;
    const lastNotify = !!lastDef && (lastDef.blocks || []).some(function (b) { return U.isObj(b) && b.type === 'notify'; });
    //   最後の段階に質問がある（合否連絡のカードの下に聞くこと〔逆質問〕がある）: 合否連絡は聞くことのあと＝面接の最後に伝える（docs/SPEC-flow.md 16-7）
    const lastAsk = !!lastDef && (lastDef.blocks || []).some(function (b) { return U.isObj(b) && b.type === 'question' && Array.isArray(b.items) && b.items.length; });
    const sName = function (x) { return x ? x.noMark + ' ' + x.title : ''; };
    // 読み終えたら元の画面へ（サイドバーの手順は使い方では隠れるので、上と下にボタン。docs/SPEC-flow.md 14 章）
    const cur = STEPS.find(function (x) { return x.n === state.step; }) || STEPS[0];
    const back = function (where) { return '<div class="help-back" data-where="' + where + '"><button type="button" class="btn" data-action="back-to-judge">' + ico('arrow-left') + sym('← ') + '<span>' + esc(cur.label + 'の画面に戻る') + '</span></button></div>'; };
    //   4 つの手順は小さい箱（地 --surface-2・番号の丸）。手順の番号はリストの番号なので読み上げない（docs/DESIGN.md 4-7）
    const step = function (n, name, text) { return '<li class="help-step"><h3>' + nbHtml(n, '', '', true) + '<span>' + name + '</span></h3><p>' + text + '</p></li>'; };
    //   ページは 920 の 1 列（.page.reading）。カードの帯は アイコン＋題＋数
    return '<div class="page reading"><div class="judge-layout"><div class="work">' + back('top') +
      helpCard('', 'book', esc(m.appTitle) + ' の使い方', '4 つの手順',
        '<p class="card-note">面接台本のとおりに 準備 → 面接 → 評価 → 報告書 の 4 つの手順で進めると、A4 1 枚の報告書ができます。</p>' +
        '<ol class="help-steps">' +
          step(1, '準備', '応募者の名前（必須）・年齢・性別・区分、面接日・面接担当者・応募した求人、タクシー可否とメモを入れて「面接を始める」。紙に書いて面接するときは「記入シート（手書き用）」を印刷します（上の「報告書を印刷」は報告書の用紙です）。') +
          step(2, '面接', '台本の ①〜⑤ を 1 段階ずつ表示します。上から 話すこと（読み上げたら［説明した］）・聞くこと（答えを短くメモ）・確かめること（必須条件は［一致］［不一致］）。［次へ］で次の段階へ。') +
          step(3, '評価', '面接のあとに、段階ごとのメモを見ながら 確認点の <span class="ja">○△×</span>・' + (personaOnNow() ? '人物像（1〜5 点）・' : '') + '総合判断（採用／保留／不採用）・面接所見を付けます。上の「いまの結果」で推奨と未入力が分かります。') +
          step(4, '報告書', 'A4 1 枚の用紙を確かめ、「面接対応者」に押印して「報告書を保存（HTML）」。最終確認と最終合否は副支配人が保存した HTML で押します（最終承認のパスワードがあるときはその入力が必要です）。') +
        '</ol>') +
      helpCard('helpInterview', 'say', '面接の進め方', '1 分で読めます', '<ol class="help-list">' +
        '<li>「面接を始める」でタイマーが動き、' + esc(first ? sName(first) + 'から ' : '') + '1 段階ずつ表示します（回答を入れる前なら、下見して準備に戻っても「面接を始める」で 0 から数え直します）。</li>' +
        '<li>1 つの段階は上から順に進めます：話すこと → 聞くこと → 確かめること（どの段階も同じ順番。一致／不一致や選択のボタンはいつも最後のカードにあります）。' +
          esc(last && lastNotify && lastAsk ? last.noMark + ' の合否連絡（話すこと）だけは、下の聞くこと' + (last.title ? '（' + last.title + '）' : '') + 'が終わってから、面接の最後に伝えます。' : '') + '</li>' +
        '<li>話すことは読み上げたら［説明した］を 1 回。言わなかった項目があるときだけ「一部説明しなかった」から外します（※短期求人のみの項目は、求人が短期なら出し、通常求人では出しません。求人が未選択なら「短期のみ」の印つきで出し、［説明した］の対象にしません）。</li>' +
        '<li>聞くことは質問の下に答えを短くメモします（Tab で次の質問のメモへ）。<span class="ja">○△×</span> などの評価は面接のあとでまとめて付けます。</li>' +
        '<li>上の帯に、この段階の経過時間と目安（過ぎると色が変わります。止まりません）・合計が出ます。段階の番号を押すとその段階へ移れます。入力した段階には ✓（必須条件が未確認なら「未確認」）が付きます。</li>' +
        '<li>必須条件が 1 つでも［不一致］になると赤い案内が出ます。' + esc(jump ? '追加で確認して解消しなければ ' + sName(jump) + 'へ進み、' + (jumpMin ? jumpMin + 'で' : '') + '終えます。' : '追加で確認して解消しなければ面接を終えます。') +
          '確かめないまま［次へ］を押すと、1 回目は進まずに確かめていない必須条件の行へ移ります（もう一度押すとそのまま進みます）。</li>' +
        '<li>' + esc(last && lastNotify ? (lastAsk ? last.noMark + ' の聞くこと' + (last.title ? '（' + last.title + '）' : '') + 'が終わったら、上の合否連絡を伝えて［伝えた］を押し、「面接を終えて評価へ」。'
          : last.noMark + ' の最後に合否連絡を伝えて［伝えた］を押し、「面接を終えて評価へ」。') : '最後の段階で「面接を終えて評価へ」。') + 'Ctrl＋Enter でも次へ進めます。</li>' +
        '<li>1 対 1 でない面接は記入シートに書き、終わったら面接の画面に転記してください。転記にかかった時間は面接時間ではないので、評価の画面の「面接時間」に記入シートの分を入れます（目安から大きく外れていると「面接時間を確かめてください」と出ます）。</li></ol>') +
      helpCard('helpScriptFlow', 'report', '報告書（HTML）の流れ', '4 項目', '<ol class="help-list">' +
        '<li>面接者が「面接対応者」に押印して保存し、社内スレッドに添付します。</li>' +
        '<li>副支配人がファイルをブラウザで開きます（A4 縦の用紙 1 枚。そのまま印刷しても同じ 1 枚です。「…」で切れたメモはクリックすると全文を表示）。</li>' +
        '<li><b>最終合否</b>：用紙の「最終合否」の欄をクリックし（最終承認のパスワードがあるときは、最初にパスワードを入力します）、担当者を選んで「採用」または「不採用」を押します（最終確認の印も自動で押されます）。押印欄もクリックで押せます。右下の「押印を保存」で再出力します（ファイル名の末尾に _採用 / _不採用）。</li>' +
        '<li>再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。</li></ol>') +
      helpPersonaHtml() +
      helpCard('', 'check', '結果（推奨）の決まり方', '4 項目', '<ul class="help-list dots">' +
        '<li>必須条件に不一致がある → 不採用推奨（設定で上長最終判断要に変更可）。</li>' +
        '<li>それ以外は面接者の総合判断のとおり（採用 → 採用推奨、保留 → 上長最終判断要、不採用 → 不採用推奨）。総合判断が未入力なら上長最終判断要です。</li>' +
        helpPersonaRuleLi() +
        '<li>確認点の <span class="ja">○△×</span> は面接評価（点数）として報告書に載ります。最終合否（採用／不採用のスタンプ）はこの推奨とは別の、最終確認者の決定です。</li></ul>') +
      helpCard('', 'download', '保存と読み込み', '2 項目', '<ul class="help-list dots">' +
        '<li>応募者ごとに 1 ファイル（HTML）。途中で保存しても、読み込むと続きの段階から再開できます（面接の途中なら同じ段階から）。</li>' +
        '<li>応募者データはこの端末のブラウザには残りません（保存したファイルのみが記録です）。</li></ul>') +
      helpCard('helpSettings', 'settings', '設定（劇場ルール）', '2 項目', '<ul class="help-list dots">' +   // 画面の名前はサイドバー・トップバーと同じ（docs/DESIGN.md 4-1）
        '<li>劇場情報・応募者の区分と性別・面接チェックリスト（台本の文言・項目・確認点・人物像）・押印欄と担当者名簿・最終合否を画面から変更できます。台本を変えると面接・評価の画面と記入シートにそのまま反映されます。</li>' +
        '<li>設定は端末のブラウザに保存されます。他の劇場・端末へ展開するときは JSON を書き出して読み込んでください。</li></ul>') +
      helpCard('helpFinalLock', 'lock', '最終承認のパスワード', '5 項目', '<ul class="help-list dots">' +
        '<li>設定の「応募者の管理（押印）」でパスワードを決めると、最終確認の押印・取消と最終合否（採用／不採用）の決定・取消の前に求めます（報告書の画面と保存した HTML の両方。面接対応者の押印には要りません）。一度正しく入れると、そのページを閉じる（読み込み直す）まで続けて押せます。</li>' +
        '<li>誤操作を防ぐための鍵です。HTML をテキストで開いて書き換える人までは防げません。</li>' +
        '<li>パスワードそのものは保存しません（照合用の値〔ハッシュ〕だけを設定と保存した HTML に入れます）。保存した HTML は保存した時点のパスワードで照合します。</li>' +
        '<li>変更・解除・JSON の読み込み・初期化でパスワードが変わるときは、現在のパスワードが必要です。ロゴ・名簿入りの版（ローカル版）の初期パスワードは管理者に確認してください（公開版には初期パスワードはありません）。</li>' +
        '<li>最終確認の欄は「押印欄と連動」を「連動しない」や別の欄に変えてもパスワードの対象のままです（連動する欄もパスワードの対象）。パスワードがあるときに「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成・押印欄の表示名を変えて保存（JSON の読み込みを含む）するには、現在のパスワードが必要です。押印欄の説明・名簿だけの変更には要りません。</li></ul>') +
      back('bottom') + '<div class="view-footer">' + esc(m.footer) + '</div></div></div></div>';
  }
  // 使い方のカード（帯: アイコン＋題＋数）
  function helpCard(id, icon, title, small, body) { return cardHtml({ id: id, icon: icon, title: title, small: small }, body); }

  // =====================================================================
  // トースト
  // =====================================================================
  let toastTimer = null;
  // ms: 出しておく時間（既定 2.8 秒。長い案内は長めに）
  function toast(msg, kind, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2800);
  }

  document.addEventListener('DOMContentLoaded', init);
  global.RecruitApp = {
    state: state, goStep: goStep, showView: showView, emptyApplicant: emptyApplicant,
    prepareChecklistSheet: prepareChecklistSheet, preparePaperSheet: preparePaperSheet, evaluateNow: evaluateNow
  };
})(window);
