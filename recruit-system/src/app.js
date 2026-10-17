/*
 * 画面制御
 * ----------------------------------------------------------------------
 * 4 ステップ（docs/SPEC-flow.md）: 1 準備 → 2 面接（台本の ①〜⑤ を 1 段階ずつ。話す・聞く・メモ・タイマー）→ 3 評価（面接のあとに ○△×・人物像・総合判断）→ 4 報告書。
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

  // n は内部キー（state.step）、no は表示番号（docs/SPEC-flow.md 1-1。同じ値）
  const STEPS = [
    { n: 1, no: 1, label: '準備', hint: '応募者の名前と面接の情報' },
    { n: 2, no: 2, label: '面接', hint: '台本どおりに話す・聞く・メモ' },
    { n: 3, no: 3, label: '評価', hint: '面接のあとに ○△×・人物像・総合判断' },
    { n: 4, no: 4, label: '報告書', hint: '押印・合否・保存' }
  ];
  // 各ステップの最上部の「この画面ですること」（1 行）
  const STEP_LEAD = {
    1: '応募者の名前と面接の情報を入れて、「面接を始める」を押します。',
    2: '台本どおりに話す・聞く・メモ。○△× などの評価は面接のあとで付けます。',
    3: '面接のメモを見ながら、○△×・人物像・総合判断を付けます。',
    4: '用紙を確かめて押印し、報告書を保存（HTML）します。'
  };
  function stepLeadHtml(n) {
    return '<p class="step-lead" id="stepLead"><b>この画面ですること</b><span>' + esc(STEP_LEAD[n] || '') + '</span></p>';
  }

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
    let paperRaf = 0;
    window.addEventListener('resize', function () {
      syncFlowLayout();
      if (paperRaf || !$('#appPaper')) return;
      paperRaf = requestAnimationFrame(function () { paperRaf = 0; fitReportPaper(); });
    });
    $$('.nav-item').forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });
    $('#stepNav').addEventListener('click', function (e) {
      const li = e.target.closest('[data-step]');
      if (!li || li.classList.contains('disabled')) return;
      goStep(Number(li.dataset.step));
    });
    $('#btnNew').addEventListener('click', newRecord);
    $('#btnLoad').addEventListener('click', function () { const f = $('#fileInput'); f.value = ''; f.click(); });
    $('#fileInput').addEventListener('change', onFileChosen);
    $('#profileFileInput').addEventListener('change', onProfileFileChosen);
    $('#btnSave').addEventListener('click', saveRecord);
    // 印刷は A4 面接チェックリスト報告（docs/SPEC-script-mode.md Y9）
    $('#btnPrint').addEventListener('click', printChecklistSheet);
    $('#btnTheme').addEventListener('click', toggleTheme);

    const content = $('#stepContent');
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
    $('#brandVersion').textContent = 'Version ' + (m.version || '') + '　判定ルール: ' + (m.theaterName || '');
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
    $('#btnTheme').textContent = isDark ? '☀ ライトモード' : '🌙 ダークモード';
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
    $('#topTitle').textContent = view === 'judge' ? JUDGE_VIEW_TITLE : view === 'settings' ? '設定（劇場プロファイル）' : '使い方';

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

  // 面接・評価の上の帯（sticky）はトップバーの下に付ける（--topbar-h）。面接・評価では scroll-padding（html.flow-pad）で
  //   Tab のフォーカスやクリックの先が上の帯・下の操作行に隠れないようにする（付録 A。docs/SPEC-flow.md 1-1）
  function syncFlowLayout() {
    const html = document.documentElement;
    html.classList.toggle('flow-pad', state.view === 'judge' && (state.step === 2 || state.step === 3));
    const tb = $('.topbar');
    if (tb && tb.offsetHeight) html.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
  }

  // =====================================================================
  // ステップ制御
  // =====================================================================
  // 判定の呼び出しはここ 1 か所（総合判断が基準。docs/SPEC-script-mode.md 1-3-2）
  function evaluateNow() {
    return R.evaluateScript(state.applicant, ensureChecklist(), state.profile);
  }

  // ステップの移動（docs/SPEC-flow.md 1-2）。内部の step は 1〜4 そのまま（2 → 1 の読み替えはしない）
  function goStep(n) {
    n = [1, 2, 3, 4].indexOf(Number(n)) >= 0 ? Number(n) : 1;
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
    const top = Math.max(0, $('#view-judge').getBoundingClientRect().top + window.scrollY - 70);
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
      return '<li class="' + cls.join(' ') + '" data-step="' + s.n + '" role="button" tabindex="0">' +
        '<span class="step-num">' + (s.n < state.step ? '✓' : s.no) + '</span>' +
        '<span><span class="step-label">' + esc(s.label) + '</span><br><span class="step-hint">' + esc(s.hint) + '</span></span></li>';
    }).join('');
  }

  function renderStep() {
    const c = $('#stepContent');
    // 右サマリーは準備と報告書だけ（面接・評価は 1 列で広く使う。docs/SPEC-flow.md F2）。紙の下に回すのは報告書だけ（fitReportPaper が付け直す）
    const layout = $('#view-judge .judge-layout');
    if (layout) {
      layout.classList.remove('paper-stack');
      layout.classList.toggle('no-summary', state.step === 2 || state.step === 3);
    }
    syncFlowLayout();
    switch (state.step) {
      case 1:
        fillChecklistDefaults(); c.innerHTML = prepStepHtml(); applyVisibility(); break;
      case 2: {
        fillChecklistDefaults();
        const sec = ivCurrentSec();
        if (sec && state.view === 'judge') ivStart(sec);
        c.innerHTML = interviewStepHtml(sec);
        ivAfterRender();
        updateChecklistUI(true);
        break;
      }
      case 3:
        fillChecklistDefaults(); c.innerHTML = evalStepHtml(); updateChecklistUI(true); break;
      case 4:
        if (!state.judgment) { state.judgment = evaluateNow(); state.judgmentStale = false; }
        c.innerHTML = reportStepHtml();
        fitReportPaper();
        break;
      default: c.innerHTML = '';
    }
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

  function labelHtml(label, o) {
    return '<label>' + esc(label) + (o.required ? '<span class="req">*</span>' : '') + '</label>';
  }

  // 準備の応募者の入力部品（呼び出しは prepStepHtml だけ）。o: fSelect { placeholder }／fInput { type, required, placeholder, min, max, step, autocomplete, suffix, id }
  function fSelect(path, label, options, o) {
    o = o || {};
    const value = U.getPath(state.applicant, path) || '';
    return '<div class="field">' + labelHtml(label, o) +
      '<select data-field="' + esc(path) + '"><option value="">' + esc(o.placeholder || '選択してください') + '</option>' + optHtml(options, value) + '</select></div>';
  }

  function fInput(path, label, o) {
    o = o || {};
    const value = U.getPath(state.applicant, path);
    const attrs = [
      'type="' + (o.type || 'text') + '"',
      'data-field="' + esc(path) + '"',
      'value="' + esc(value == null ? '' : value) + '"',
      o.required ? 'data-required' : '',
      o.placeholder ? 'placeholder="' + esc(o.placeholder) + '"' : '',
      o.min !== undefined ? 'min="' + o.min + '"' : '',
      o.max !== undefined ? 'max="' + o.max + '"' : '',
      o.step !== undefined ? 'step="' + o.step + '"' : '',
      o.autocomplete ? 'autocomplete="' + o.autocomplete + '"' : ''
    ].filter(Boolean).join(' ');
    const input = '<input ' + attrs + '>';
    return '<div class="field"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' + labelHtml(label, o) +
      (o.suffix ? '<div class="inline">' + input + '<span class="suffix">' + esc(o.suffix) + '</span></div>' : input) + '</div>';
  }

  function fTextarea(path, label, o) {
    o = o || {};
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<textarea data-field="' + esc(path) + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.placeholder || '') + '">' + esc(U.getPath(state.applicant, path) || '') + '</textarea></div>';
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
    return '<section class="intro no-print" id="introCard" aria-labelledby="introH">' +
      '<h2 id="introH">はじめての方へ</h2>' +
      '<p class="intro-lead">面接台本のとおりに 4 つの手順で進めると、A4 1 枚の報告書ができます。</p>' +
      '<ol class="intro-steps">' +
        '<li><b>準備</b><span>応募者の名前と面接の情報を入れる（氏名だけ必須）</span></li>' +
        '<li><b>面接</b><span>台本の ①〜⑤ を 1 段階ずつ。話す・聞く・メモだけ</span></li>' +
        '<li><b>評価</b><span>面接のあとに、メモを見ながら ○△×・人物像・総合判断</span></li>' +
        '<li><b>報告書</b><span>用紙を確かめて押印し、保存（HTML）</span></li>' +
      '</ol>' +
      '<div class="intro-foot"><button type="button" class="btn sm ghost" data-action="show-help">使い方を見る</button>' +
        '<button type="button" class="btn sm primary" id="introOk" data-action="intro-ok">わかった</button></div>' +
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
    const pBtn = function (x) { const full = String(x.label || x.value); return { value: x.value, label: full.replace(/求人$/, '') || full, title: full, cls: 'wide' }; };
    const started = !!(U.isObj(state.checklist.timing) && state.checklist.timing.startedAt);
    return stepLeadHtml(1) + (introShown() ? introHtml() : '') +
      '<div class="card" id="scriptApplicantCard">' +
      '<div class="card-head"><h2>応募者</h2><p>氏名だけ必須です。あとは分かる範囲で入力してください。</p></div>' +
      '<div class="field-row sa-row sa-row1">' +
        fInput('name', '氏名', { required: true, placeholder: '例：山田 太郎', autocomplete: 'off' }) +
        fInput('age', '年齢', { type: 'number', min: 15, max: 99, step: 1, suffix: '歳' }) +
        fSelect('gender', '性別', o.genders, { placeholder: '選択' }) +   // 1 行目は狭いので未選択の文言は短く（「選択してください」は PC 幅で切れる）
        fSelect('category', '区分', cats) +
        (f.graduationDate ? fInput('graduationDate', '卒業予定年月', { type: 'month', id: 'grp-graduation' }) : '') +
      '</div>' +
      '<div class="field-row cols-3 sa-row sa-row2">' +
        '<div class="field"><label for="saDate">面接日</label><input type="date" id="saDate" data-cl="header.date" value="' + esc(h.date || '') + '"></div>' +
        '<div class="field"><label for="saInterviewer">面接担当者</label>' +
          '<select id="saInterviewer" data-cl="header.interviewer" title="名簿は設定の「応募者の管理（押印）」で編集します。報告書の押印欄「面接対応者」の初期選択になります。"><option value="">選択してください</option>' +
            managers.filter(function (m) { return m && m.name; }).map(function (m) {
              return '<option value="' + esc(m.name) + '"' + (m.name === iv ? ' selected' : '') + '>' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>';
            }).join('') +
            (iv && !inRoster ? '<option value="' + esc(iv) + '" selected>' + esc(iv) + '（名簿外）</option>' : '') +
          '</select></div>' +
        (pOpts.length ? '<div class="field" id="saPosting"><label>' + esc(posting.label || '応募した求人') + '</label>' +
          clSegHtml('header.posting', pOpts.map(pBtn), { aria: posting.label || '応募した求人' }) + '</div>' : '') +
      '</div>' +
      '<div class="field-row sa-row sa-row3">' +
        '<div class="field"><label for="saTaxi">タクシー可否・料金</label><input type="text" id="saTaxi" data-cl="header.taxi" value="' + esc(h.taxi || '') + '" placeholder="例: 可・2,500円" title="深夜帯の帰宅にタクシーを使えるか・料金の目安"></div>' +
        fTextarea('reviewerNotes', 'メモ（任意）', { rows: 2, placeholder: '例：電話の受け答えが丁寧。' }) +
      '</div>' +
    '</div>' +
    // 記入シート（手書き用。docs/SPEC-flow.md 5-3）: 氏名が空でも印刷できる（紙に書いて面接し、あとでアプリに転記する）。主ボタンは右下
    '<div class="flow-foot" id="saActions"><button type="button" class="btn" id="saPaperBtn" data-action="print-paper" title="' + esc(PAPER_BTN_TITLE) + '">🖨 記入シート（手書き用）</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn primary lg" id="saNext" data-action="script-next">' + (started ? '面接に戻る →' : '面接を始める →') + '</button></div>';
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
    switch (b.dataset.action) {
      case 'script-next':
        // 準備 → 面接（面接の表示でタイマーが始まる。docs/SPEC-flow.md 2-2）
        if (validateScriptApplicant()) goStep(2);
        break;
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
        else { ivTiming().stage = sec; goStep(2); }
        break;
      }
      case 'iv-next':
      case 'iv-prev': {
        const ss = ivSections(), i = ss.findIndex(function (x) { return x.id === ivCurrentSec(); });
        const to = ss[i + (b.dataset.action === 'iv-next' ? 1 : -1)];
        if (to) ivShow(to.id);
        else if (b.dataset.action === 'iv-prev') goStep(1);
        else goStep(3);
        break;
      }
      case 'iv-end':
        // 面接を終えて評価へ（面接の終了時刻を入れてタイマーを止める）
        goStep(3);
        break;
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
        clSet(path, String(clGet(path)) === v ? '' : v);
        touchChecklist();
        syncClButtons(path);   // 準備（応募した求人）は updateChecklistUI の対象外のため
        updateChecklistUI();
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
  function onContentKey(e) {
    const t = e.target;
    if (state.step === 2 && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing && e.keyCode !== 229) {
      const nx = $('#ivNext');
      if (nx) { e.preventDefault(); nx.click(); }
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

  // ボタン式の選択（data-action="cl-set"。押下中を再度押すと解除）
  function clSegHtml(path, options, o) {
    o = o || {};
    const cur = String(clGet(path));
    return '<div class="score-seg cl-seg' + (o.cls ? ' ' + o.cls : '') + '" role="group"' + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + '>' + options.map(function (op) {
      const on = cur === String(op.value);
      return '<button type="button" class="seg-btn' + (op.cls ? ' ' + op.cls : '') + (on ? ' active' : '') + '" data-action="cl-set" data-cl="' + esc(path) + '" data-value="' + esc(op.value) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '"' + (op.title ? ' title="' + esc(op.title) + '"' : '') + '>' + esc(op.label) + '</button>';
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

  // 必須条件のボタンの行（面接の「確かめること」と評価の段階のカードで同じ部品）
  function mustRowHtml(it, withBadge) {
    return '<div class="cl-must-row" data-item="' + esc(it.id) + '"><div class="cl-label">' + esc(it.label) + '</div>' +
      clSegHtml('values.' + it.id, [{ value: 'match', label: '一致', cls: 'wide match' }, { value: 'mismatch', label: '不一致', cls: 'wide mismatch' }], { aria: it.label }) +
      (withBadge ? '<span class="badge warn ev-miss">未確認</span>' : '') + '</div>';
  }
  // 台本の編集でメモを付けたブロック（質問以外）のメモ欄
  function blockMemoHtml(b) {
    return '<div class="field iv-memo" data-block="' + esc(b.id) + '"><label for="ivMemo-' + esc(b.id) + '">' + esc(b.memoLabel || 'メモ') + '</label>' +
      '<textarea id="ivMemo-' + esc(b.id) + '" rows="2" data-cl="notes.' + esc(b.id) + '">' + esc(clGet('notes.' + b.id)) + '</textarea></div>';
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
  function ivShow(sec) { ivTiming().stage = sec; renderStep(); ivFocusHead(); }
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
  // 面接の段階 sec を数え始める（面接を初めて表示したら startedAt。「面接を始める」以外の経路〔サイドバー・読み込み〕でも）
  function ivStart(sec) {
    ivStop(false);
    const t = ivTiming();
    if (!t.startedAt) t.startedAt = new Date(Date.now()).toISOString();
    t.stage = sec;
    if (!Object.prototype.hasOwnProperty.call(t.perStage, sec)) t.perStage[sec] = 0;
    ivClock = { sec: sec, since: Date.now(), iv: setInterval(ivTick, 1000) };
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
  function ivPartLabel(kind, open) { return (kind === 'notify' ? '一部伝えなかった' : '一部説明しなかった') + (open ? ' ▴' : ' ▾'); }
  // 読み上げ用のリスト（閉じているときはタブ位置・クリックの処理を付けない）／項目ごとのチェックボックス（.is-items）
  function ivSayListHtml(sec, kind) {
    const x = ivSayItems(sec, kind);
    const open = ivItemsOpen(sec, kind);
    return '<ul class="iv-say-list' + (open ? ' is-items' : '') + '" data-sec="' + esc(sec) + '" data-kind="' + esc(kind) + '">' + x.shown.map(function (it) {
      const so = kind === 'explain' && it.shortOnly === true;
      const tag = so && x.mark ? '<span class="tag">短期のみ</span>' : '';
      const cls = 'iv-say-i' + (so ? ' short-only' : '');
      if (!open) return '<li class="' + cls + '" data-item="' + esc(it.id) + '">' + esc(it.label) + tag + '</li>';
      const on = ivSaidOn(it);
      return '<li class="' + cls + (on ? ' is-on' : '') + '" data-item="' + esc(it.id) + '"><label><input type="checkbox" data-cl="values.' + esc(it.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(it.label) + tag + '</span></label></li>';
    }).join('') + '</ul>';
  }
  // 段階×種類の「話すこと」（最初の説明〔合否連絡〕ブロックの位置に、段階のその種類の全項目を 1 つのリストで。ブロックの注記・メモも）
  function ivSayGroupHtml(s, kind) {
    const blocks = s.blocks.filter(function (b) { return b.type === kind; });
    const posting = String((ensureChecklist().header || {}).posting || '');
    const open = ivItemsOpen(s.id, kind);
    //   説明の注記（既定「※は短期求人に応募の場合のみご説明ください」）は短期のみの項目に印を付けて出すとき（求人が未選択）だけ。短期のみの項目が無いブロックの注記・合否連絡の注記は常に
    const notes = blocks.filter(function (b) {
      if (!b.note) return false;
      return kind === 'notify' || !b.items.some(function (it) { return it.shortOnly === true; }) || posting === '';
    }).map(function (b) { return '<p class="iv-note">' + esc(b.note) + '</p>'; }).join('');
    const nb = blocks.find(function (b) { return b.title; });
    return '<div class="iv-grp k-say" data-kind="say" data-say="' + esc(kind) + '">' +
      '<h3 class="iv-k"><span>話すこと</span>' + (kind === 'notify' ? '<small>' + esc((nb && nb.title) || '合否連絡') + '</small>' : '') +
        '<span class="iv-k-act"><button type="button" class="btn iv-said" data-action="iv-said" data-sec="' + esc(s.id) + '" data-kind="' + esc(kind) + '" aria-pressed="false">' + (kind === 'notify' ? '伝えた' : '説明した') + '</button>' +
          '<button type="button" class="btn sm ghost iv-said-part" data-action="iv-said-items" data-sec="' + esc(s.id) + '" data-kind="' + esc(kind) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' + ivPartLabel(kind, open) + '</button></span></h3>' +
      notes + ivSayListHtml(s.id, kind) +
      blocks.filter(function (b) { return b.memo; }).map(blockMemoHtml).join('') +
    '</div>';
  }
  // 項目ごとの表示を切り替えたとき: そのリストと開くボタンだけ描き直す
  function ivRerenderSay(sec, kind) {
    const sel = '[data-sec="' + sec + '"][data-kind="' + kind + '"]';
    const ul = $('.iv-say-list' + sel);
    if (ul) { const tmp = document.createElement('div'); tmp.innerHTML = ivSayListHtml(sec, kind); ul.replaceWith(tmp.firstElementChild); }
    const pb = $('[data-action="iv-said-items"]' + sel);
    if (pb) { const open = ivItemsOpen(sec, kind); pb.setAttribute('aria-expanded', open ? 'true' : 'false'); pb.textContent = ivPartLabel(kind, open); }
    updateChecklistUI(true);
  }

  // ---------- 聞くこと（質問ごとのカード。docs/SPEC-flow.md 3-5・F8） ----------
  function ivQText(label) { const t = String(label == null ? '' : label).trim(); return /^「/.test(t) ? t : '「' + t + '」'; }
  function ivAskGroupHtml(blocks) {
    return '<div class="iv-grp k-ask" data-kind="ask"><h3 class="iv-k"><span>聞くこと</span></h3>' + blocks.map(function (b) {
      return (b.note ? '<p class="iv-note">' + esc(b.note) + '</p>' : '') + b.items.map(function (it) {
        //   カードの中のタブ位置はメモ欄だけ（Tab で次の質問のメモへ）。メモを取らない質問ブロック（memo: false）は質問文だけ
        return '<div class="iv-q" data-item="' + esc(it.id) + '"><div class="iv-q-text">' + esc(ivQText(it.label)) + '</div>' +
          (b.memo ? '<textarea class="iv-q-memo" data-cl="notes.' + esc(it.id) + '" rows="1" placeholder="答えをメモ" aria-label="' + esc(shortLabel(it) + ' の答え') + '">' + esc(clGet('notes.' + it.id)) + '</textarea>' : '') + '</div>';
      }).join('') +
      //   2026-10-16 より前の記録の質問ブロックのメモ（値があるときだけ。直せる）
      (String(b.memoText || '').trim() ? '<div class="field iv-oldmemo" data-block="' + esc(b.id) + '"><label for="ivOld-' + esc(b.id) + '">（以前のメモ）</label>' +
        '<textarea id="ivOld-' + esc(b.id) + '" rows="2" data-cl="notes.' + esc(b.id) + '">' + esc(clGet('notes.' + b.id)) + '</textarea></div>' : '');
    }).join('') + '</div>';
  }
  // ---------- 確かめること（必須条件・記入欄） ----------
  function ivCheckGroupHtml(blocks) {
    const mustNotes = blocks.filter(function (b) { return b.type === 'must' && b.note; }).map(function (b) { return b.note; }).join('　');
    return '<div class="iv-grp k-check" data-kind="check"><h3 class="iv-k"><span>確かめること</span>' + (mustNotes ? '<small>' + esc(mustNotes) + '</small>' : '') + '</h3>' + blocks.map(function (b) {
      let h = '';
      if (b.type === 'must') h = b.items.map(function (it) { return mustRowHtml(it, false); }).join('');
      else {
        h = '<div class="iv-fields" data-block="' + esc(b.id) + '">' + b.items.map(function (it) {
          const path = 'values.' + it.id;
          let ctl;
          if (it.kind === 'choice') {
            ctl = clSegHtml(path, (Array.isArray(it.options) ? it.options : []).map(function (o) { return { value: o.value, label: o.label || o.value, cls: 'wide' }; }), { aria: it.label });
          } else {
            const type = it.kind === 'date' ? 'date' : it.kind === 'month' ? 'month' : 'text';
            ctl = '<input type="' + type + '" data-cl="' + esc(path) + '" value="' + esc(clGet(path)) + '" aria-label="' + esc(it.label) + '">';
          }
          return '<div class="field cl-field" data-item="' + esc(it.id) + '"><label>' + esc(it.label) + '</label>' + ctl + '</div>';
        }).join('') + '</div>';
      }
      return h + (b.memo ? blockMemoHtml(b) : '');
    }).join('') + '</div>';
  }

  // ---------- 段階の本文（列の分け方・見出し。docs/SPEC-flow.md 3-3・F4・F5） ----------
  //   rating（確認点）は出さない。最初の質問ブロックより前を左の列、それ以降を右の列（1100px 以上。台本の順のまま「左 → 右」）。
  //   続けて同じ種類（確かめる・聞く）なら見出しは 1 つ。話すことは段階×種類に 1 つ（説明と合否連絡はボタンが別なので分ける）。note は流れの 1 行
  const IV_KIND = { must: 'check', fields: 'check', explain: 'say', notify: 'say', question: 'ask', note: 'flow' };
  function ivColsHtml(s) {
    const blocks = s.blocks.filter(function (b) { return IV_KIND[b.type] && (b.type === 'note' || b.items.length || b.memo); });
    const qi = blocks.findIndex(function (b) { return b.type === 'question'; });
    const cols = qi > 0 ? [blocks.slice(0, qi), blocks.slice(qi)] : [blocks];
    const said = {};
    const colHtml = function (bl) {
      let h = '', grp = null;
      const flush = function () {
        if (!grp) return;
        h += grp.kind === 'check' ? ivCheckGroupHtml(grp.blocks) : ivAskGroupHtml(grp.blocks);
        grp = null;
      };
      bl.forEach(function (b) {
        const k = IV_KIND[b.type];
        if (k === 'flow') { flush(); if (b.note) h += '<p class="iv-flow" data-block="' + esc(b.id) + '">→ ' + esc(b.note) + '</p>'; return; }
        if (k === 'say') {
          if (said[b.type]) return;   // 同じ種類の 2 つ目以降のブロックは最初のブロックのリストに入れた
          said[b.type] = true;
          flush();
          h += ivSayGroupHtml(s, b.type);
          return;
        }
        if (!grp || grp.kind !== k) { flush(); grp = { kind: k, blocks: [] }; }
        grp.blocks.push(b);
      });
      flush();
      return '<div class="iv-col">' + h + '</div>';
    };
    return '<div class="iv-cols' + (cols.length > 1 ? ' is-two' : '') + '">' + cols.map(colHtml).join('') + '</div>';
  }

  function interviewStepHtml(sec) {
    ensureChecklist();
    const sum = clSummary();
    const ss = sum.sections;
    if (!ss.length) return stepLeadHtml(2) + '<div class="card"><p>台本に段階がありません。設定の「面接チェックリスト」で台本を確かめてください。</p></div>';
    const s = ss.find(function (x) { return x.id === sec; }) || ss[0];
    const i = ss.indexOf(s);
    const def = sum.def;
    const a = state.applicant;
    // 上の帯: 段階のチップ（状態は updateInterviewUI）・タイマー・必須条件の案内
    const goal = s.minutes > 0 ? (s.minutesMax ? '/ 最大 ' : '/ 目安 ') + s.minutes + '分' : '';
    const jump = ss.find(function (x) { return x.id === def.mustFailJumpTo; });
    const top = '<div class="iv-top" id="ivTop"><div class="iv-bar" id="ivBar">' +
        '<nav class="iv-chips" id="ivChips" aria-label="面接の段階">' + ss.map(function (x) {
          return '<button type="button" class="iv-chip" data-action="iv-go" data-sec="' + esc(x.id) + '"><span class="iv-chip-no">' + x.noMark + '</span><span class="iv-chip-t">' + esc(x.title) + '</span><span class="iv-chip-s"></span></button>';
        }).join('') + '</nav>' +
        '<div class="iv-timer" id="ivTimer" role="timer" aria-live="off">' +
          '<span class="iv-t-stage" id="ivTStage">この段階 <b class="num" id="ivTStageVal">' + fmtClock(ivStageSec(s.id)) + '</b> <small id="ivTStageGoal">' + esc(goal) + '</small></span>' +
          '<span class="iv-t-total">合計 <b class="num" id="ivTTotal">' + fmtClock(ivTotalSec()) + '</b></span></div>' +
      '</div>' +
      '<div class="iv-must hidden" id="ivMustAlert" role="alert"><span class="ico" aria-hidden="true">⚠</span><span id="ivMustAlertText"></span>' +
        (jump ? '<button type="button" class="btn sm" id="ivMustJump" data-action="iv-go" data-sec="' + esc(jump.id) + '">' + esc(jump.noMark + ' ' + jump.title + 'へ') + '</button>' : '') + '</div>' +
    '</div>';
    // 見出し・応募者（氏名・区分・年齢・求人。空の項目は省く）・前書き（台本のページの最初の段階ならページの前書き＋段階の前書き。1 行・…）
    const who = [a.category, String(a.age == null ? '' : a.age).trim() ? String(a.age).trim() + '歳' : '', sum.header.postingLabel].filter(Boolean);
    const firstOfPage = ss.filter(function (x) { return x.page === s.page; })[0] === s;
    const pg = firstOfPage ? (sum.pages || []).find(function (p) { return U.isObj(p) && Number(p.no) === s.page; }) : null;
    const lead = [pg && pg.lead ? String(pg.lead) : '', s.lead].filter(Boolean).join('　');
    const stage = '<section class="iv-stage" id="ivStage" data-sec="' + esc(s.id) + '" aria-labelledby="ivStageH">' +
      '<header class="iv-stage-head"><h2 id="ivStageH" tabindex="-1"><span class="iv-no">' + s.noMark + '</span>' + esc(s.title) + '</h2>' +
        '<span class="iv-who" id="ivWho">' + (a.name ? '<b>' + esc(a.name) + '</b>さん' : '<b>氏名未入力</b>') + (who.length ? '・' + esc(who.join('・')) : '') + '</span>' +
        (lead ? '<p class="iv-lead" title="' + esc(lead) + '">' + esc(lead) + '</p>' : '') + '</header>' +
      ivColsHtml(s) + '</section>';
    // 下の操作行: 左に戻る・右端に主ボタン（最後の段階は「面接を終えて評価へ →」）。面接を一度終えた後は「評価に戻る」も
    const next = ss[i + 1];
    const foot = '<div class="flow-foot is-sticky" id="ivFoot">' +
      '<button type="button" class="btn" id="ivPrev" data-action="iv-prev">' + (i > 0 ? '← 前の段階' : '← 準備に戻る') + '</button><span class="spacer"></span>' +
      (ivTimingRead().endedAt && next ? '<button type="button" class="btn" id="ivToEval" data-action="iv-end">評価に戻る</button>' : '') +
      (next ? '<button type="button" class="btn primary lg" id="ivNext" data-action="iv-next">' + esc('次へ：' + next.noMark + ' ' + next.title + ' →') + '</button>'
        : '<button type="button" class="btn primary lg" id="ivNext" data-action="iv-end">面接を終えて評価へ →</button>') +
    '</div>';
    return stepLeadHtml(2) + top + stage + foot;
  }

  // 質問のメモの高さを内容に合わせる（1 行から。168px を超えたらスクロール）
  function ivAutosize(el) {
    if (!el || !el.style) return;
    el.style.height = 'auto';
    const h = Math.max(42, el.scrollHeight + 2);
    el.style.height = Math.min(h, 168) + 'px';
    el.style.overflowY = h > 168 ? 'auto' : 'hidden';
  }
  // 描いた直後: メモの高さ・トップバーの高さ・タイマーの表示（00:00 から始めない）
  function ivAfterRender() {
    $$('#stepContent textarea.iv-q-memo').forEach(ivAutosize);
    syncFlowLayout();
    ivTick();
  }

  // 面接の画面の表示の更新（ボタンの押下・「説明した」・必須条件の案内・チップ。段階の中身は描き直さない。3-10）
  function updateInterviewUI() {
    const root = $('#stepContent');
    ensureChecklist();
    const sum = clSummary();
    syncSegButtons(root);
    // 「説明した」: off「説明した」／on「✓ 説明した」／mixed「✓ 一部説明した（n/m）」。対象が無ければ出さない
    $$('[data-action="iv-said"]', root).forEach(function (btn) {
      const kind = btn.dataset.kind, x = ivSayItems(btn.dataset.sec, kind), st = ivSayState(x);
      const verb = kind === 'notify' ? '伝えた' : '説明した';
      btn.textContent = st === 'on' ? '✓ ' + verb : st === 'mixed' ? '✓ 一部' + verb + '（' + x.targets.filter(ivSaidOn).length + '/' + x.targets.length + '）' : verb;
      btn.setAttribute('aria-pressed', st === 'on' ? 'true' : st === 'mixed' ? 'mixed' : 'false');
      show(btn, x.targets.length > 0);
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
        let txt;
        if (!g.gateReject) txt = '必須条件が合いません。追加で確認してください（このまま続けると、結果は' + resultTitle('review') + '以下になります）';
        else if (g.jump) {
          const mt = String(g.jump.minutesText || '').replace(/(\d+)分/, ' $1 分').trim();
          txt = '必須条件が合いません。追加で確認し、解消しなければ ' + g.jump.noMark + ' ' + g.jump.title + 'へ進んで' + (mt ? mt + 'で' : '') + '終了します';
        } else txt = '必須条件が合いません。追加で確認し、解消しなければ面接を終了します';
        setText('#ivMustAlertText', txt);
        alert.title = '不一致: ' + sum.must.mismatchLabels.join('、');
      } else alert.removeAttribute('title');
    }
    const jb = $('#ivMustJump');
    if (jb) show(jb, g.mm && g.gateReject && !!g.jump && cur !== g.jump.id);
    // 段階のチップ: 今の段階 ＞ 省略可 ＞ 済み（表示したことがある＝perStage にキーがある）
    const ps = ivTimingRead().perStage || {};
    sum.sections.forEach(function (x, i) {
      const chip = $('#ivChips [data-sec="' + x.id + '"]');
      if (!chip) return;
      const isCur = x.id === cur, skip = !isCur && g.skippable(i), done = !isCur && !skip && Object.prototype.hasOwnProperty.call(ps, x.id);
      chip.classList.toggle('is-current', isCur);
      chip.classList.toggle('is-skip', skip);
      chip.classList.toggle('is-done', done);
      if (isCur) chip.setAttribute('aria-current', 'step'); else chip.removeAttribute('aria-current');
      chip.title = x.noMark + ' ' + x.title + (skip ? '（必須条件不一致のため省略可）' : done ? '（済み）' : '');
      const sEl = $('.iv-chip-s', chip);
      if (sEl) sEl.textContent = skip ? '省略可' : done ? '✓' : '';
    });
  }

  // =====================================================================
  // 評価（step 3。面接のあとに付ける。docs/SPEC-flow.md 4 章）
  //   上の結果カード（いまの結果・理由・未入力の数）→ 面接時間 → 段階のカード（面接のメモ＋確認点 ○△×）→ 総評（人物像・総合判断・面接所見）→ 下の操作行
  // =====================================================================
  function evalStepHtml() {
    ensureChecklist();
    const sum = clSummary();
    return stepLeadHtml(3) +
      '<div class="ev-top" id="evTop"><div class="ev-result" id="evResult" data-result="">' +
        '<span class="ev-res-k">いまの結果</span><span class="badge lg" id="evResultTitle"></span>' +
        '<span class="ev-res-why" id="evResultWhy"></span><span class="ev-res-miss" id="evMissing"></span>' +
        '<span class="ev-res-score" id="clNavScore"></span></div></div>' +
      evTimeHtml(sum) +
      sum.sections.map(function (s) { return evSecHtml(s, sum); }).join('') +
      clOverallHtml(sum) +
      '<div class="flow-foot is-sticky" id="evFoot"><button type="button" class="btn" id="evBack" data-action="to-step" data-step="2">← 面接に戻る</button>' +
        '<span class="spacer"></span><button type="button" class="btn primary lg" id="toReportBtn" data-action="judge">報告書へ →</button></div>';
  }
  // 面接時間の行（docs/SPEC-flow.md 4-5）: 手入力の分（空ならタイマーの値）・タイマーの合計・目安・段階ごとの時間（表示したことのない段階は「—」）
  function evTimeHtml(sum) {
    const tm = sum.timing;
    const t = ivTimingRead();
    const ps = U.isObj(t.perStage) ? t.perStage : {};
    const total = tm ? tm.totalSec : 0;
    const sub = tm && tm.startedAt ? '（タイマー ' + Math.floor(total / 60) + '分' + pad2(total % 60) + '秒・目安 ' + sum.minutesTotal + '分）' : '（タイマーの記録なし・目安 ' + sum.minutesTotal + '分）';
    return '<div class="ev-time" id="evTime"><label class="ev-time-k" for="evTimeMin">面接時間</label>' +
      '<input type="number" id="evTimeMin" data-cl="timing.min" min="1" max="600" step="1" inputmode="numeric" placeholder="' + (tm && tm.timerMin != null ? tm.timerMin : '') + '"' +
        ' value="' + (t.min != null ? esc(t.min) : '') + '" aria-label="面接時間（分）" title="紙から転記したときなどは、実際の時間（分）を入れてください。空にするとタイマーの値を使います"><span>分</span>' +
      '<span class="ev-time-sub" id="evTimeSub">' + esc(sub) + '</span>' +
      '<span class="ev-time-st">' + sum.sections.map(function (s) {
        const v = Object.prototype.hasOwnProperty.call(ps, s.id);
        return '<span class="ev-t-i" data-sec="' + esc(s.id) + '">' + s.noMark + ' ' + (v ? fmtMs(ps[s.id]) : '—') + '</span>';
      }).join('') + '</span></div>';
  }
  // 記入欄の値（日付は 2026/10/10・月は 2026年10月・選択肢は表示名・空は —）
  function evFieldVal(it) {
    let v = String(it.effectiveLabel != null ? it.effectiveLabel : (it.effective == null ? '' : it.effective)).trim();
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v), m = /^(\d{4})-(\d{2})$/.exec(v);
    if (it.kind === 'date' && d) v = d[1] + '/' + d[2] + '/' + d[3];
    else if (it.kind === 'month' && m) v = m[1] + '年' + Number(m[2]) + '月';
    return v ? esc(v) : '<span class="muted">—</span>';
  }
  // 説明・合否連絡の 1 行（数え方は A4 と同じ: 短期のみの説明は求人が短期のときだけ数える。項目が無ければ出さない）
  function evSaidHtml(s, kind, posting) {
    const its = [];
    s.blocks.forEach(function (b) {
      if (b.type !== kind) return;
      b.items.forEach(function (it) { if (!(kind === 'explain' && it.shortOnly === true && posting !== 'short')) its.push(it); });
    });
    if (!its.length) return '';
    const off = its.filter(function (it) { return !it.value; });
    const k = kind === 'notify' ? '合否連絡' : '説明';
    const text = !off.length ? k + '：✓ ' + (kind === 'notify' ? '伝えた' : '説明した（' + its.length + '/' + its.length + '）')
      : off.length === its.length ? k + '：' + (kind === 'notify' ? '伝えていない' : 'していない')
        : k + '：一部' + (kind === 'notify' ? '伝えていない' : '説明していない') + '（' + off.map(shortLabel).join('、') + '）';
    return '<p class="ev-said' + (off.length ? ' is-off' : '') + '" data-kind="' + kind + '">' + esc(text) + '</p>';
  }
  function rateRowHtml(it) {
    return '<div class="cl-row cl-rate-row" data-item="' + esc(it.id) + '">' +
      '<div class="cl-row-main"><div class="cl-label b">' + esc(it.label) + '</div>' + (it.hint ? '<div class="hint">' + esc(it.hint) + '</div>' : '') + '<span class="badge warn ev-miss">未入力</span></div>' +
      clSegHtml('values.' + it.id, ['good', 'fair', 'poor'].map(function (k) {
        return { value: k, label: R.RATING_MARKS[k].mark, cls: 'cl-mark ' + k, title: R.RATING_MARKS[k].label };
      }), { aria: it.label }) +
      '<input type="text" class="cl-note" data-cl="notes.' + esc(it.id) + '" value="' + esc(clGet('notes.' + it.id)) + '" placeholder="メモ（任意）" aria-label="' + esc(it.label) + ' のメモ">' +
    '</div>';
  }
  // 段階のカード: 面接のメモ（必須条件〔ここでも直せる〕・記入欄・説明・質問ごとのメモ・以前のメモ）→ 確認点 ○△×（未入力は updateEvalUI が強調）
  function evSecHtml(s, sum) {
    const ps = U.isObj(ivTimingRead().perStage) ? ivTimingRead().perStage : {};
    const visited = Object.prototype.hasOwnProperty.call(ps, s.id);
    const goal = s.minutes ? '（' + (s.minutesMax ? '最大 ' : '目安 ') + s.minutes + '分）' : '';
    const musts = [], kv = [], qa = [], extra = [], rates = [];
    s.blocks.forEach(function (b) {
      if (b.type === 'must') b.items.forEach(function (it) { musts.push(mustRowHtml(it, true)); });
      else if (b.type === 'fields') b.items.forEach(function (it) { kv.push('<div data-item="' + esc(it.id) + '"><dt>' + esc(shortLabel(it)) + '</dt><dd>' + evFieldVal(it) + '</dd></div>'); });
      else if (b.type === 'question') {
        b.items.forEach(function (it) {
          const v = String(it.note || '').trim();
          if (!b.memo && !v) return;
          qa.push('<div data-item="' + esc(it.id) + '"' + (v ? '' : ' class="is-empty"') + '><dt>' + esc(shortLabel(it)) + '</dt><dd>' + (v ? esc(v) : '（メモなし）') + '</dd></div>');
        });
        if (String(b.memoText || '').trim()) extra.push('<div class="ev-oldmemo" data-block="' + esc(b.id) + '"><span class="ev-memo-k">（以前のメモ）</span><div class="ev-memo-v">' + esc(b.memoText) + '</div></div>');
      } else if (b.type === 'rating') {
        b.items.forEach(function (it) { rates.push(rateRowHtml(it)); });
        if (b.memo) rates.push(blockMemoHtml(b));
      } else if (b.memo && String(b.memoText || '').trim()) {
        extra.push('<div class="ev-bmemo" data-block="' + esc(b.id) + '"><span class="ev-memo-k">' + esc(b.memoLabel || 'メモ') + '</span><div class="ev-memo-v">' + esc(b.memoText) + '</div></div>');
      }
    });
    const posting = String(sum.header.posting || '');
    const memo = (musts.length ? '<div class="ev-must">' + musts.join('') + '</div>' : '') + (kv.length ? '<dl class="ev-kv">' + kv.join('') + '</dl>' : '') +
      evSaidHtml(s, 'explain', posting) + evSaidHtml(s, 'notify', posting) + (qa.length ? '<dl class="ev-qa">' + qa.join('') + '</dl>' : '') + extra.join('');
    return '<section class="card cl-sec ev-sec" id="cl-' + esc(s.id) + '" data-sec="' + esc(s.id) + '">' +
      '<div class="card-head"><h2><span class="cl-no">' + s.noMark + '</span>' + esc(s.title) + '</h2>' +
        '<span class="ev-sec-time">' + esc((visited ? fmtMs(ps[s.id]) : '—') + goal) + '</span><span class="cl-sec-state" id="clState-' + esc(s.id) + '"></span>' +
        '<span class="cl-skip-note">必須条件不一致のため省略可</span>' +
        '<button type="button" class="btn sm ghost ev-fix" data-action="iv-go" data-sec="' + esc(s.id) + '">✎ 面接の画面で直す</button></div>' +
      (memo ? '<div class="ev-memo">' + memo + '</div>' : '') +
      (rates.length ? '<div class="ev-rate"><div class="ev-rate-h">確認点<span class="cl-legend">○ できている／△ やや不安／× できていない</span></div>' + rates.join('') + '</div>' : '') +
    '</section>';
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
    // 未入力の数
    const ps = sum.persona;
    const rBlank = sum.ratings.filter(function (r) { return !r.value; }).length;
    const parts = [];
    if (!gate) {
      if (sum.must.unknown) parts.push('必須条件 ' + sum.must.unknown);
      if (rBlank) parts.push('確認点 ' + rBlank);
      if (ps && ps.unscored) parts.push('人物像 ' + ps.unscored);
      if (!sum.overall.value) parts.push('総合判断');
    }
    const mEl = $('#evMissing');
    if (mEl) {
      mEl.textContent = gate ? '必須条件の不一致のため、ほかの入力は任意です' : parts.length ? '未入力：' + parts.join('・') : '未入力はありません';
      mEl.classList.toggle('is-none', !gate && !parts.length);
      mEl.classList.toggle('is-gate', gate);
    }
    // 未入力の行の強調（必須条件の不一致で不採用推奨に固定したときは付けない）
    sum.must.items.forEach(function (m) {
      const row = $('.ev-memo .cl-must-row[data-item="' + m.id + '"]', root);
      if (row) row.classList.toggle('is-missing', !gate && !m.value);
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
    // 段階の状態（不一致あり／確認点が全部入力「済」／一部「未入力 n」。確認点の無い段階は空）・省略可
    sum.sections.forEach(function (s, i) {
      const stEl = $('#clState-' + s.id);
      if (stEl) {
        const rs = sum.ratings.filter(function (r) { return r.sectionId === s.id; });
        const blank = rs.filter(function (r) { return !r.value; }).length;
        stEl.innerHTML = s.mustMismatch ? clBadge('danger', '不一致あり') : !rs.length ? '' : !blank ? clBadge('ok', '済') : gate ? '' : clBadge('warn', '未入力 ' + blank);
      }
      const el = $('#cl-' + s.id);
      if (el) el.classList.toggle('cl-skippable', g.skippable(i));
    });
    const sc = sum.score;
    setText('#clNavScore', '面接評価 ' + (sc.rated ? sc.total : '—') + '/' + sc.max + (sc.rated ? '（' + fmtNum(sc.pct) + '%・' + sc.bandLabel + '）' : '') +
      (ps ? '　人物像 ' + (ps.scored ? ps.total : '—') + '/' + ps.max : ''));
    updatePersonaUI(ps, root);
    const ov = sum.overall.value;
    show('#overallWarn', ov === 'hold' || ov === 'reject');
    if (ov === 'hold' || ov === 'reject') setText('#overallWarnText', '面接者の総合判断が「' + sum.overall.label + '」です。');
  }

  // 総評の人物像（1〜5 点。docs/SPEC-persona.md 3-2）。各行は 1 つのタブ位置（押下中のボタン、無ければ 1。updatePersonaUI が付け直す）
  function clPersonaHtml(ps, sum) {
    //   凡例は「点 意味」ごとに折り返さない span（狭い画面でも「5 とても／良い」と語の途中で割れない。文字は全角空白でつなぐ）
    const legend = ps.scaleLabels.map(function (l, i) { return '<span>' + esc((i + 1) + ' ' + l) + '</span>'; }).join('　');
    return '<section class="cl-persona" id="clPersona" aria-labelledby="clPersonaH">' +
      '<div class="cl-ps-head"><h3 id="clPersonaH">' + esc(ps.title) + '</h3><span class="cl-ps-legend" id="clPsLegend">' + legend + '</span></div>' +
      clLeadPsHtml(sum) +
      '<div class="cl-ps-rows">' + ps.items.map(function (it, i) {
        let btns = '';
        for (let n = 1; n <= ps.scaleMax; n++) {
          const on = it.score === n, tab = it.score != null ? on : n === 1;
          btns += '<button type="button" class="seg-btn cl-ps-btn s' + n + (on ? ' active' : '') + '" data-action="ps-set" data-persona="' + esc(it.id) + '" data-score="' + n + '"' +
            ' aria-pressed="' + (on ? 'true' : 'false') + '" tabindex="' + (tab ? '0' : '-1') + '" title="' + esc(n + ' ' + ps.scaleLabels[n - 1]) + '">' + n + '</button>';
        }
        return '<div class="cl-ps-row' + (it.score != null ? ' is-set' : '') + (it.score === 1 ? ' is-one' : '') + '" data-ps-row="' + esc(it.id) + '">' +
          '<div class="cl-ps-main"><span class="cl-ps-no">' + (i + 1) + '</span><span class="cl-label b">' + esc(it.label) + '</span>' + (it.hint ? '<span class="hint">' + esc(it.hint) + '</span>' : '') +
            '<span class="badge warn ev-miss">未入力</span></div>' +
          '<div class="score-seg cl-seg cl-ps-seg" role="group" aria-label="' + esc(it.label) + '">' + btns + '</div></div>';
      }).join('') + '</div>' +
      '<div class="cl-ps-total" id="clPsTotal" aria-live="polite">合計 <b class="num" id="clPsSum">—</b> / <span class="num" id="clPsMax">' + ps.max + '</span>点<span class="num" id="clPsPct"></span><span class="badge" id="clPsState"></span></div>' +
      '<div class="alert warn hidden" id="clPsWarn"><span class="ico">⚠</span><span id="clPsWarnText"></span></div>' +
    '</section>';
  }
  // 台本 1 枚目の前書きの「最低限の話し方、敬語が可能か」は、確認点から外して人物像の「言葉遣い・説明のわかりやすさ」で付ける（2026-10-16。台本の文言は変えない）。
  //   前書きが話し方・敬語に触れ、確認点に話し方・敬語の項目が無く、人物像に言葉遣いの項目があるとき、付ける場所を人物像の見出しの下に 1 行で示す（docs/SPEC-flow.md 4-6）
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
    return '<div class="hint cl-lead-ps" data-ps-ref="' + esc(it.id) + '">→ 台本 1 枚目の「' + esc(phrase) + '」は、この' + esc(ps.title) + '「' + esc(it.label) + '」で 1〜5 点を付けます。</div>';
  }
  // 設定で人物像を使うか（ON・項目あり）
  function personaOnNow() { return !!R.personaModel(clDefNow(), { persona: {} }); }

  // 総評（docs/SPEC-persona.md 3-2・docs/SPEC-flow.md 4-6）: 上から 人物像 → 総合判断 → 説明 → 面接所見。人物像を使わない記録（cl.persona === null）は 1 行の注記。
  //   面接評価の点・必須条件のまとめは上の結果カード（#clNavScore・#evMissing）にある
  function clOverallHtml(sum) {
    const def = sum.def;
    const oo = U.isObj(def.overallOptions) ? def.overallOptions : {};
    const ps = sum.persona;
    // 総合判断がそのまま結果になる（必須条件の不一致は除く）。人物像があれば、結果が下がる条件（合計・1 点・未入力。設定から）も書く（docs/SPEC-persona.md 11-9 補完 4）
    const hint = [def.overallHint || '', '「' + (oo.hire || overallLabelNow('hire')) + '」は' + resultTitle('recommend') + '、「' + (oo.hold || overallLabelNow('hold')) + '」は' + resultTitle('review') +
      '、「' + (oo.reject || overallLabelNow('reject')) + '」は' + resultTitle('reject') + 'として報告します（必須条件が不一致なら' + resultTitle(def.mustFailResult === 'review' ? 'review' : 'reject') + '）。',
      ps ? personaRuleText() + '。' : ''].filter(Boolean).join(' ');
    const off = !ps && ensureChecklist().persona === null && personaOnNow();
    return '<div class="card" id="clOverall"><div class="card-head"><h2>総評</h2></div>' +
      (ps ? clPersonaHtml(ps, sum) : '') +
      (off ? '<p class="hint cl-ps-off" id="clPersonaOff">この記録は人物像（1〜5 点）の導入前に保存されたため、人物像は判定に使いません。</p>' : '') +
      '<div class="cl-overall-row"><div class="cl-label b">' + esc(def.overallLabel || '面接者の総合判断') + '<span class="badge warn ev-miss">未入力</span></div>' +
        clSegHtml('overall', ['hire', 'hold', 'reject'].map(function (k) { return { value: k, label: oo[k] || overallLabelNow(k), cls: 'wide ' + k }; }), { cls: 'lg', aria: def.overallLabel }) +
      '</div>' +
      (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') +
      '<div class="alert warn hidden" id="overallWarn"><span class="ico">⚠</span><span id="overallWarnText"></span></div>' +
      '<div class="field cl-notes-field"><label for="clIvNotes">面接所見</label>' +
        '<textarea id="clIvNotes" data-note="interview" rows="4" placeholder="特記事項、受け答えの印象など">' + esc(state.interviewNotes) + '</textarea></div>' +
    '</div>';
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
  // 行ごとの押下・タブ位置・合計・得点率・状態・1 点の警告
  function updatePersonaUI(ps, root) {
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
    if (stEl) {
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
      setText('#clPsWarnText', '1 点の項目があります（' + ps.ones.join('、') + '）。' +
        (ps.onePointResult === 'review' ? '結果は' + resultTitle('review') + '以下になります。' : ps.onePointResult === 'reject' ? '結果は' + resultTitle('reject') + 'になります。' : ''));
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
    const val = !ps.scored ? '<span class="badge muted">未入力 ' + ps.unscored + '</span>'
      : ps.complete ? esc(ps.total + '/' + ps.max + '点・' + ps.pct + '%') + ones
        : esc(ps.total + '/' + ps.max + '点') + ' <span class="badge muted">未入力 ' + ps.unscored + '</span>' + ones;
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
  //   紙は等倍（本文 9.5px）で見せる: 右サマリーの横で紙が入らない幅（1280px・1366px など）は右サマリーを紙の下に回す（.judge-layout.paper-stack）。
  //   それでも列が紙より狭いときだけ縮小し、縮小は 0.95 倍まで（本文 9px 以上）。それより狭い画面（タブレット縦・スマホ）は等倍で紙だけ横スクロール。
  //   計測は縮小を外した状態で行う（縮小したままだと高さが変わる）
  const PAPER_MIN_ZOOM = 0.95;
  function fitReportPaper() {
    const paper = $('#appPaper');
    const layout = $('#view-judge .judge-layout');
    if (!paper) { if (layout) layout.classList.remove('paper-stack'); return; }
    paper.style.zoom = '';
    const sh = $('.cl-sheet', paper);
    if (sh && typeof S.fitChecklistSheet === 'function') S.fitChecklistSheet(sh);
    const wrap = $('#appPaperWrap');
    if (!wrap || !paper.offsetWidth) return;
    const room = function () { return (wrap.clientWidth - 4) / paper.offsetWidth; };
    if (layout) {
      layout.classList.remove('paper-stack');
      if (room() < 1 && getComputedStyle(layout).gridTemplateColumns.trim().split(/\s+/).length > 1) layout.classList.add('paper-stack');
    }
    const z = room();
    if (z < 1 && z >= PAPER_MIN_ZOOM) paper.style.zoom = String(Math.floor(z * 1000) / 1000);
  }

  function reportStepHtml() {
    const j = state.judgment;
    const ovMissing = !R.OVERALL_POINTS.hasOwnProperty(ensureChecklist().overall);
    let html = stepLeadHtml(4);
    if (j && j.warnings && j.warnings.length) {
      // 「評価で入力する」: 総合判断が未入力、または人物像に未入力があるとき（docs/SPEC-persona.md 3-4）
      const psm = R.personaModel(clDefNow(), ensureChecklist());
      const psMissing = !!(psm && psm.unscored) && j.warnings.some(function (w) { return w.indexOf('人物像に未入力') === 0; });
      html += '<div class="card" id="scriptWarnings"><div class="card-head"><h3>確認事項</h3></div><ul class="list-x">' +
        j.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
        (ovMissing || psMissing ? '<div class="actions"><button type="button" class="btn sm" data-action="to-step" data-step="3">評価で入力する</button></div>' : '') +
      '</div>';
    }
    html += '<div class="report-paper-wrap" id="appPaperWrap">' +
      '<div class="report-paper-cap"><b>面接チェックリスト報告（A4）</b><span>保存した HTML はこの用紙 1 枚で開きます。押印・合否は下のカードで（保存した HTML では用紙の欄をクリック）</span></div>' +
      '<div class="a4" id="appPaper">' + reportPaperInnerHtml() + '</div></div>';
    html += managementCardHtml();
    html += decisionCardHtml();
    // 操作行（左に戻る・右端に主ボタン。印刷・押印カードのクリックと重ねないよう固定しない。docs/SPEC-flow.md 5-1）
    html += '<div class="flow-foot no-print" id="rpFoot">' +
      '<button type="button" class="btn" id="backToChecklist" data-action="to-step" data-step="3">← 評価に戻る</button><span class="spacer"></span>' +
      '<button type="button" class="btn" id="reportPrintBtn" data-action="print-checklist">🖨 A4 で印刷</button>' +
      '<button type="button" class="btn primary lg" id="reportSaveBtn" data-action="save">💾 報告書を保存（HTML）</button></div>';
    return html;
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
    // 「応募者」は 氏名・区分/年齢/性別・面接日・担当 の 4 行。求人は短期のときだけ「短期求人」のチップを区分の行に添える（消極属性は 2026-10-13 に削除）
    const attrs = cl.header.posting === 'short' && rv('posting') ? '<span class="badge info">' + esc(rv('posting')) + '</span>' : '';
    const model = R.interviewModel(p, cl);
    const c = model.counts || { good: 0, fair: 0, poor: 0, blank: 0 };
    const ms = R.mustSummary(def, cl);
    const mustBd = !ms.total ? '<span class="muted">—</span>'
      : ms.mismatch || ms.unknown
        ? (ms.mismatch ? '<span class="badge danger">不一致 ' + ms.mismatch + '</span>' : '') + (ms.unknown ? '<span class="badge muted">未確認 ' + ms.unknown + '</span>' : '')
        : '<span class="badge ok">すべて一致</span>';
    const ov = R.OVERALL_POINTS.hasOwnProperty(cl.overall) ? cl.overall : '';
    // 判定済み（報告書・保存・印刷で state.judgment がある）ならそれを、無いときだけ入力中の内容で評価して表示する
    const live = state.judgment ? state.judgment : R.checklistHasInput(cl) ? R.evaluateScript(a, cl, p) : null;
    const mg = p.management || {};
    const fields = Array.isArray(mg.fields) ? mg.fields : [];
    const stamps = fields.map(function (f) {
      const e = state.management[f.id];
      return esc(f.label) + (e && e.name ? ' ✓ ' + esc(e.short || (Stamp ? Stamp.shortName(e.name) : e.name)) : ' 未押印');
    }).join('／');
    const row = function (id, label, val) { return '<div class="sum-row" id="' + id + '"><span class="sum-label">' + esc(label) + '</span><span class="sum-val">' + val + '</span></div>'; };
    return '<div class="summary-card" id="sumApplicant"><h4>応募者</h4>' +
        '<div class="sum-name">' + (a.name ? esc(a.name) + ' <span class="muted" style="font-size:13px;font-weight:600">さん</span>' : '<span class="muted">未入力</span>') + '</div>' +
        '<div class="sum-sub">' + esc([a.category, String(a.age || '').trim() ? String(a.age).trim() + '歳' : '', a.gender].filter(Boolean).join('・') || '区分・年齢未入力') +
          ' <span class="sum-attrs" id="sumAttrs">' + attrs + '</span></div>' +
        row('sumDate', '面接日', esc(rv('date') || '—')) +
        row('sumInterviewer', '担当', esc(rv('interviewer') || '—')) +
      '</div>' +
      '<div class="summary-card" id="sumChecklist"><h4>面接チェックリスト</h4>' +
        row('sumMust', '必須条件', mustBd) +
        row('sumMarks', '採点', esc('○' + c.good + ' △' + c.fair + ' ×' + c.poor + (c.blank ? '（未入力 ' + c.blank + '）' : '') + '・' + model.total + '/' + model.max + '点')) +
        personaSummaryRow(R.personaModel(def, cl), row) +
        row('sumOverall', '総合判断', esc(ov ? overallLabelNow(ov) : '未入力')) +
      '</div>' +
      '<div class="summary-card" id="sumJudgment"><h4>報告書</h4>' +
        row('sumResult', '結果', live ? '<span class="badge lg ' + RESULT_TONE[live.result] + '">' + esc(live.title) + '</span>' : '—') +
        (stamps ? row('sumStamps', '押印', '<span class="sum-stamps">' + stamps + '</span>') : '') +
        decisionSummaryHtml() +
        '<div class="sum-sub" id="sumSaved" style="margin-top:8px">' + esc(state.dirty ? '未保存の変更あり' : state.savedAt ? '最終保存 ' + U.fmtDateTime(state.savedAt) : '未保存') + '</div>' +
      '</div>';
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
    state.savedAt = n.savedAt;
    state.dirty = false;
    const sj = n.judgment;
    const hasCl = R.checklistHasInput(state.checklist);
    const tm = U.isObj(state.checklist.timing) ? state.checklist.timing : null;
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

  // =====================================================================
  // 面接記入シート（手書き用。A4 縦 1 枚。docs/SPEC-persona.md 5-5）の印刷
  //   報告書の印刷と同じ仕組み（印刷ホスト #clSheet・body.print-checklist・@page a4sheet の余白 0）。判定は走らせない・保存しない。
  //   印字するのは準備の応募者だけ（面接・評価の回答は印字しない）。Ctrl+P は従来どおり報告書
  // =====================================================================
  const PAPER_BTN_TITLE = '紙に書くときの A4 1 枚（面接・評価の画面と同じ並び）を印刷';
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
  function finalLockRowHtml(where) {
    return '<div class="final-lock no-print" data-lock-for="' + esc(where) + '">' +
      '<div class="final-lock-msg">🔒 最終承認にはパスワードが必要です</div>' +
      '<div class="final-lock-ctl"><input type="password" class="final-lock-pw" autocomplete="off" aria-label="最終承認のパスワード" placeholder="パスワード">' +
      '<button type="button" class="btn sm primary" data-action="unlock-final">確認</button></div>' +
      '<div class="final-lock-err" role="alert"></div></div>';
  }
  // ［確認］・Enter: 正しければ解錠して報告書のカードを描き直す（パスワード欄が消え、担当者の選択と押印・合否のボタンが出る）。違えば 1 行出して何もしない
  function unlockFinal(row) {
    const lk = stepLockNow();
    if (!row || !lk) return;
    const inp = row.querySelector('.final-lock-pw'), err = row.querySelector('.final-lock-err');
    const fail = function (msg) { if (err) err.textContent = msg; if (inp) { inp.focus(); inp.select(); } };
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
      back.className = 'pw-dialog-back';
      back.id = 'pwDialog';
      back.innerHTML = '<div class="pw-dialog" role="dialog" aria-modal="true" aria-labelledby="pwDialogH">' +
        '<h3 id="pwDialogH">最終承認のパスワード</h3><p>' + esc(msg) + '</p>' +
        '<input type="password" id="pwDialogInput" autocomplete="off" aria-label="現在のパスワード" placeholder="現在のパスワード">' +
        '<div class="pw-dialog-err" id="pwDialogErr" role="alert"></div>' +
        '<div class="actions"><button type="button" class="btn" data-pw="cancel">キャンセル</button><button type="button" class="btn primary" data-pw="ok">確認</button></div></div>';
      document.body.appendChild(back);
      const inp = $('#pwDialogInput'), err = $('#pwDialogErr');
      const onKey = function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); done(false); }
        else if (e.key === 'Enter' && e.target === inp) { e.preventDefault(); tryOk(); }
      };
      const done = function (ok) { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(ok); };
      const tryOk = function () {
        if (!inp.value) { err.textContent = 'パスワードを入力してください'; inp.focus(); return; }
        if (!Lock.verify(lk, inp.value)) { err.textContent = 'パスワードが違います'; inp.focus(); inp.select(); return; }
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
    return '<div class="card" id="mgmtCard"><div class="card-head"><h2>応募者の管理（押印）</h2>' +
      '<p>担当者を選んで押印してください。押印は保存ファイル（HTML）に入り、保存した HTML でも用紙の欄をクリックして押印できます。名簿は設定の「応募者の管理」で編集します。</p></div>' +
      '<div class="stamp-row' + (fields.length === 2 ? ' cols-2' : '') + '">' + fields.map(function (fld, idx) {
        const e = state.management[fld.id];
        const svg = e && e.name ? Stamp.render(e, { size: 88, id: 'app' + idx }) : '';
        return '<div class="stamp-box" data-field-id="' + esc(fld.id) + '">' +
          '<div class="stamp-label">' + esc(fld.label) + '</div>' +
          '<div class="stamp-hint">' + esc(fld.hint || '') + '</div>' +
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
            (mg.allowFreeName !== false ? '<input type="text" class="stamp-free hidden" placeholder="氏名（例：山田 太郎）">' : '') +
            '<button type="button" class="btn sm primary" data-action="stamp">押印</button>' +
            (e && e.name ? '<button type="button" class="btn sm ghost" data-action="unstamp">取消</button>' : '') +
          '</div></div>');
      }).join('') + '</div></div>';
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
    const btn = function (r, lbl, col) {
      const on = !!d && d.result === r;
      return '<button type="button" class="btn sm decide-btn decide-' + r + (on ? ' on' : '') + '" data-action="decide" data-value="' + r + '" aria-pressed="' + (on ? 'true' : 'false') + '" style="--dec:' + esc(col) + '">' + esc(lbl) + '</button>';
    };
    const stamp = d
      ? Stamp.verdict({ label: decisionLabelOf(d, dcfg), date: d.date, color: d.result === 'hire' ? dcfg.hireColor : dcfg.rejectColor, size: 120, id: 'vdApp', sub: dcfg.sub })
      : '<div class="verdict-empty">未押印</div>';
    const meta = d ? decisionLabelOf(d, dcfg) + '・' + d.by.name + (d.by.title ? '（' + d.by.title + '）' : '') + '　' + (d.date || '') : 'まだ押されていません';
    return '<div class="card decision-card ' + (d ? 'is-' + d.result : 'is-none') + '" id="decisionCard" data-result="' + (d ? d.result : '') + '">' +
      '<div class="card-head"><h2>' + esc(dcfg.label) + '</h2><p>' + (dcfg.hint ? esc(dcfg.hint) + '。' : '') +
        'アプリの判定（推奨）とは別に、最終確認者が「' + esc(dcfg.hireLabel) + '」「' + esc(dcfg.rejectLabel) + '」を決めて押します。保存した HTML 上でも押せます。</p></div>' +
      '<div class="decision-body">' +
        '<div class="decision-stamp" id="decisionStamp">' + stamp + '</div>' +
        '<div class="decision-main">' +
          '<div class="decision-meta" id="decisionMeta">' + esc(meta) + '</div>' +
          (note ? '<div class="decision-note" id="decisionNote">' + esc(note) + '</div>' : '') +
          (finalNeedsPw('') ? finalLockRowHtml('decision') :
          '<div class="decision-ctl no-print">' +
            '<select id="decisionManager" data-decision-select aria-label="' + esc(dcfg.label) + ' 担当者"><option value="">担当者を選択</option>' +
              managers.map(function (m, i) { return '<option value="' + i + '"' + (i === selIdx ? ' selected' : '') + '>' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>'; }).join('') +
              (allowFree ? '<option value="__free"' + (useFree ? ' selected' : '') + '>名簿にない担当者（手入力）</option>' : '') +
            '</select>' +
            (allowFree ? '<input type="text" id="decisionFree" class="stamp-free' + (useFree ? '' : ' hidden') + '" placeholder="氏名（例：山田 太郎）" value="' + (useFree ? esc(selName) : '') + '">' : '') +
            btn('hire', dcfg.hireLabel, dcfg.hireColor) + btn('reject', dcfg.rejectLabel, dcfg.rejectColor) +
            (d ? '<button type="button" class="btn sm ghost" data-action="undecide">取消</button>' : '') +
          '</div>') +
          // 連動の案内は「採用」「不採用」のボタンを出しているときだけ（パスワード欄のときはボタンが無い）
          (linked && !finalNeedsPw('') ? '<div class="hint no-print">「' + esc(dcfg.hireLabel) + '」「' + esc(dcfg.rejectLabel) + '」を押すと、押印欄「' + esc(linked.label) + '」が未押印なら同じ担当者の印も押します。</div>' : '') +
        '</div>' +
      '</div></div>';
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
    return '<div class="sum-row" id="sumDecision" style="margin-top:8px"><span class="sum-label">' + esc(dcfg.label) + '</span><span class="sum-val"><span class="badge dec-' + d.result + '">' +
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
    return '<div class="card" id="helpPersona"><div class="card-head"><h3>人物像（1〜5 点）と記入シート</h3></div><ol class="list-plain">' +
      (ps ? '' : '<li id="helpPersonaOff"><b>いまの設定では人物像を使いません</b>（設定「面接チェックリスト」の「人物像を使う」で ON にできます）。評価の画面・報告書・記入シートに人物像は出ず、判定にも使いません。</li>') +
      '<li><b>人物像</b>：評価の画面の総評で、' + (ps ? ps.items.length + ' 項目（' + esc(ps.items.map(function (it) { return it.name; }).join('、')) + '）' : '接客の項目') + 'に 1〜5 点を付けます（' +
        esc(labels.map(function (l, i) { return (i + 1) + ' ' + l; }).join('・')) + '）。' + (ps ? '満点は ' + ps.max + ' 点です。' : '') + 'クリックのほか、数字キー 1〜5 でも入力できます（次の行へ進みます）。</li>' +
      '<li><b>判定への反映</b>：得点率 ' + keep + '% 以上はそのまま・' + rej + '% 以上 ' + keep + '% 未満は' + esc(resultTitle('review')) + 'まで・' + rej + '% 未満は' + esc(resultTitle('reject')) + '。1 点の項目が 1 つでもあれば' +
        esc(capName(pd.onePointResult || 'review')) + '、未入力があれば' + esc(capName(pd.unscoredResult || 'review')) + '（下げる方向だけ。上げることはありません。設定の「面接チェックリスト」で変更できます）。</li>' +
      '<li><b>記入シート（手書き用）</b>：準備の画面の「🖨 記入シート（手書き用）」（「面接を始める →」の左）で A4 1 枚を印刷できます（面接 → 評価の画面と同じ並び・質問ごとに答えの線。準備に入力した氏名などは印字）。紙に書いて面接し、終わったらアプリに転記します。</li>' +
      '<li>確認点「最低限の話し方、敬語が可能か」は人物像の「言葉遣い・説明のわかりやすさ」と重なるため、既定の台本から外しました（台本 1 枚目の前書きにある話し方・敬語は、この人物像の項目で付けます）。</li></ol></div>';
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
    const sName = function (x) { return x ? x.noMark + ' ' + x.title : ''; };
    return '<div class="card"><div class="card-head"><h2>' + esc(m.appTitle) + ' の使い方</h2><p>面接台本のとおりに 準備 → 面接 → 評価 → 報告書 の 4 つの手順で進めると、A4 1 枚の報告書ができます。</p></div>' +
      '<div class="help-steps">' +
        '<div class="help-step"><span class="n">1</span><h3>準備</h3><p>応募者の名前（必須）・年齢・性別・区分、面接日・面接担当者・応募した求人、タクシー可否とメモを入れて「面接を始める」。紙に書いて面接するときは「🖨 記入シート（手書き用）」を印刷します。</p></div>' +
        '<div class="help-step"><span class="n">2</span><h3>面接</h3><p>台本の ①〜⑤ を 1 段階ずつ表示します。上から 確かめること（必須条件は［一致］［不一致］）・話すこと（読み上げたら［説明した］）・聞くこと（答えを短くメモ）。［次へ］で次の段階へ。</p></div>' +
        '<div class="help-step"><span class="n">3</span><h3>評価</h3><p>面接のあとに、段階ごとのメモを見ながら 確認点の ○△×・人物像（1〜5 点）・総合判断（採用／保留／不採用）・面接所見を付けます。上の「いまの結果」で推奨と未入力が分かります。</p></div>' +
        '<div class="help-step"><span class="n">4</span><h3>報告書</h3><p>A4 1 枚の用紙を確かめ、「面接対応者」に押印して「報告書を保存（HTML）」。最終確認と最終合否は副支配人が保存した HTML で押します（最終承認のパスワードがあるときはその入力が必要です）。</p></div>' +
      '</div></div>' +
      '<div class="card" id="helpInterview"><div class="card-head"><h3>面接の進め方（1 分で読めます）</h3></div><ol class="list-plain">' +
        '<li>「面接を始める」でタイマーが動き、' + esc(first ? sName(first) + 'から ' : '') + '1 段階ずつ表示します。</li>' +
        '<li>1 つの段階は上から順に進めます：確かめること → 話すこと → 聞くこと（2 列の画面では左の列のあと右の列）。</li>' +
        '<li>話すことは読み上げたら［説明した］を 1 回。言わなかった項目があるときだけ「一部説明しなかった」から外します（※短期求人のみの項目は、求人が短期のときだけ出ます）。</li>' +
        '<li>聞くことは質問の下に答えを短くメモします（Tab で次の質問のメモへ）。○△× などの評価は面接のあとでまとめて付けます。</li>' +
        '<li>上の帯に、この段階の経過時間と目安（過ぎると色が変わります。止まりません）・合計が出ます。段階の番号を押すとその段階へ移れます。</li>' +
        '<li>必須条件が 1 つでも［不一致］になると赤い案内が出ます。' + esc(jump ? '追加で確認して解消しなければ ' + sName(jump) + 'へ進み、' + (jumpMin ? jumpMin + 'で' : '') + '終えます。' : '追加で確認して解消しなければ面接を終えます。') + '</li>' +
        '<li>' + esc(last && lastNotify ? last.noMark + ' の最後に合否連絡を伝えて［伝えた］を押し、「面接を終えて評価へ」。' : '最後の段階で「面接を終えて評価へ」。') + 'Ctrl＋Enter でも次へ進めます。</li>' +
        '<li>1 対 1 でない面接は記入シートに書き、終わったら面接の画面に転記してください（報告書の面接時間は評価の画面で直せます）。</li></ol></div>' +
      '<div class="card" id="helpScriptFlow"><div class="card-head"><h3>報告書（HTML）の流れ</h3></div><ol class="list-plain">' +
        '<li>面接者が「面接対応者」に押印して保存し、社内スレッドに添付します。</li>' +
        '<li>副支配人がファイルをブラウザで開きます（A4 縦の用紙 1 枚。そのまま印刷しても同じ 1 枚です。「…」で切れたメモはクリックすると全文を表示）。</li>' +
        '<li><b>最終合否</b>：用紙の「最終合否」の欄をクリックし（最終承認のパスワードがあるときは、最初にパスワードを入力します）、担当者を選んで「採用」または「不採用」を押します（最終確認の印も自動で押されます）。押印欄もクリックで押せます。右下の「押印を保存」で再出力します（ファイル名の末尾に _採用 / _不採用）。</li>' +
        '<li>再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。</li></ol></div>' +
      helpPersonaHtml() +
      '<div class="card"><div class="card-head"><h3>結果（推奨）の決まり方</h3></div><ul class="list-plain">' +
        '<li>必須条件に不一致がある → 不採用推奨（設定で上長最終判断要に変更可）。</li>' +
        '<li>それ以外は面接者の総合判断のとおり（採用 → 採用推奨、保留 → 上長最終判断要、不採用 → 不採用推奨）。総合判断が未入力なら上長最終判断要です。</li>' +
        helpPersonaRuleLi() +
        '<li>確認点の ○△× は面接評価（点数）として報告書に載ります。最終合否（採用／不採用のスタンプ）はこの推奨とは別の、最終確認者の決定です。</li></ul></div>' +
      '<div class="card"><div class="card-head"><h3>保存と読み込み</h3></div><ul class="list-plain">' +
        '<li>応募者ごとに 1 ファイル（HTML）。途中で保存しても、読み込むと続きの段階から再開できます（面接の途中なら同じ段階から）。</li>' +
        '<li>応募者データはこの端末のブラウザには残りません（保存したファイルのみが記録です）。</li></ul></div>' +
      '<div class="card"><div class="card-head"><h3>設定（劇場プロファイル）</h3></div><ul class="list-plain">' +
        '<li>劇場情報・応募者の区分と性別・面接チェックリスト（台本の文言・項目・確認点・人物像）・押印欄と担当者名簿・最終合否を画面から変更できます。台本を変えると面接・評価の画面と記入シートにそのまま反映されます。</li>' +
        '<li>設定は端末のブラウザに保存されます。他の劇場・端末へ展開するときは JSON を書き出して読み込んでください。</li></ul></div>' +
      '<div class="card" id="helpFinalLock"><div class="card-head"><h3>最終承認のパスワード</h3></div><ul class="list-plain">' +
        '<li>設定の「応募者の管理（押印）」でパスワードを決めると、最終確認の押印・取消と最終合否（採用／不採用）の決定・取消の前に求めます（報告書の画面と保存した HTML の両方。面接対応者の押印には要りません）。一度正しく入れると、そのページを閉じる（読み込み直す）まで続けて押せます。</li>' +
        '<li>誤操作を防ぐための鍵です。HTML をテキストで開いて書き換える人までは防げません。</li>' +
        '<li>パスワードそのものは保存しません（照合用の値〔ハッシュ〕だけを設定と保存した HTML に入れます）。保存した HTML は保存した時点のパスワードで照合します。</li>' +
        '<li>変更・解除・JSON の読み込み・初期化でパスワードが変わるときは、現在のパスワードが必要です。ロゴ・名簿入りの版（ローカル版）の初期パスワードは管理者に確認してください（公開版には初期パスワードはありません）。</li>' +
        '<li>最終確認の欄は「押印欄と連動」を「連動しない」や別の欄に変えてもパスワードの対象のままです（連動する欄もパスワードの対象）。パスワードがあるときに「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成・押印欄の表示名を変えて保存（JSON の読み込みを含む）するには、現在のパスワードが必要です。押印欄の説明・名簿だけの変更には要りません。</li></ul></div>' +
      '<div class="view-footer">' + esc(m.footer) + '</div>';
  }

  // =====================================================================
  // トースト
  // =====================================================================
  let toastTimer = null;
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  document.addEventListener('DOMContentLoaded', init);
  global.RecruitApp = {
    state: state, goStep: goStep, showView: showView, emptyApplicant: emptyApplicant,
    prepareChecklistSheet: prepareChecklistSheet, preparePaperSheet: preparePaperSheet, evaluateNow: evaluateNow
  };
})(window);
