/*
 * 画面制御
 * ----------------------------------------------------------------------
 * 3 ステップ（docs/SPEC-script-mode.md）: Step1 応募者 → Step3 面接チェックリスト → Step4 報告書（表示は ①②③）。
 * state.step・data-step・record.step の内部キーは 1・3・4 のまま（2 は 1 に読み替え。docs/SPEC-slim.md D1）。
 * 2026-10-14 の面接特化で削除した機能は docs/SPEC-slim.md と docs/HANDOFF.md の「削除済み機能」を参照。
 * 右側のサマリーパネルは入力のたびに更新する。
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

  // n は内部キー（state.step）、no は表示番号
  const STEPS = [
    { n: 1, no: 1, label: '応募者', hint: '名前と属性・台本のヘッダー' },
    { n: 3, no: 2, label: '面接チェックリスト', hint: '台本のとおりに確認' },
    { n: 4, no: 3, label: '報告書', hint: '押印・最終合否・保存' }
  ];

  const state = {
    view: 'judge',
    step: 1,
    maxStepReached: 1,
    profile: null,
    applicant: null,       // { name, gender, age, category, graduationDate, reviewerNotes }（すべて文字列）
    checklist: null,       // 面接チェックリストの回答（docs/SPEC-checklist.md 1-4）。init / newRecord / applyRecord で作る
    interviewNotes: '',
    judgment: null,
    judgmentStale: false,  // 判定後に入力・設定が変わり、判定のやり直しが必要（state.judgment は null）
    management: {},        // 応募者の管理（押印）: { interviewer: { name, short, title, date, at }, final: { ... } }
    decision: null,        // 最終合否（人の決定）: { result, label, date, at, by }。判定とは独立。再判定で消さない（「取消」でだけ消える）
    savedAt: null,
    dirty: false
  };

  const RESULT_TONE = { recommend: 'ok', review: 'warn', reject: 'danger' };
  const BAND_TONE = { high: 'ok', mid: 'warn', low: 'danger' };
  const V1_RESET_MSG = '古い形式のため既定の設定を使います（劇場名・名簿などは設定画面で入れ直してください）。';
  const FULL_MODE_REMOVED_MSG = '詳細モードは終了しました。面接チェックリストの 3 ステップで開きます。';
  // 保存済みの設定を読み込んだときの案内（docs/SPEC-slim.md 3-1）
  function profileNotice(rep) {
    const msgs = [];
    if (rep.v1Reset) msgs.push(V1_RESET_MSG);
    if (rep.fullModeRemoved) msgs.push(FULL_MODE_REMOVED_MSG);
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
    if (rep.v1Reset || rep.fullModeRemoved || rep.stripped) S.saveProfile(state.profile);
    const notice = profileNotice(rep);
    if (notice) toast(notice);
  }

  function injectChecklistSheetCss() {
    if (typeof S.checklistSheetCss !== 'function' || document.getElementById('clSheetCss')) return;
    const st = document.createElement('style');
    st.id = 'clSheetCss';
    st.textContent = S.checklistSheetCss();
    document.head.appendChild(st);
  }

  function emptyApplicant() {
    return { name: '', gender: '', age: '', category: '', graduationDate: '', reviewerNotes: '' };
  }

  // ---------- 小さなヘルパー ----------
  function fmtNum(n) { return n == null || n === '' || isNaN(Number(n)) ? '—' : String(R.round1(Number(n))); }
  function resultTitle(r) { const t = (state.profile.texts || {})[r]; return (t && t.title) || r || ''; }
  function setText(sel, text) { const el = $(sel); if (el) el.textContent = text; }

  function bindGlobal() {
    // 画面幅が変わったら報告書（③）の紙プレビューの縮小を合わせ直す
    let paperRaf = 0;
    window.addEventListener('resize', function () {
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

    window.addEventListener('beforeunload', function (e) {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    // ブラウザの印刷（Ctrl+P）も A4 面接チェックリスト報告にする（保存 HTML の報告書表示と同じ考え方）
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

  function showView(view) {
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
      Settings.render($('#view-settings'), state.profile, {
        current: function () { return state.profile; },
        onSave: function (p) {
          state.profile = S.normalizeProfile(p);
          S.saveProfile(state.profile);
          onProfileChanged();
          toast('設定を保存しました', 'ok');
          Settings.render($('#view-settings'), state.profile, this);
        },
        onExport: function (p) {
          S.download('劇場プロファイル_' + S.safeName(p.meta.theaterName) + '_' + U.fmtDate(new Date()) + '.json', JSON.stringify(p, null, 2), 'application/json');
          toast('プロファイルを書き出しました');
        },
        onImport: function () { const f = $('#profileFileInput'); f.value = ''; f.click(); },
        onReset: function () {
          state.profile = S.resetProfile();
          S.saveProfile(state.profile);
          onProfileChanged();
          toast('初期設定に戻しました', 'ok');
          showView('settings');
        },
        onToast: toast
      });
    } else if (view === 'help') {
      $('#view-help').innerHTML = helpHtml();
    }
    window.scrollTo(0, 0);
  }

  // =====================================================================
  // ステップ制御
  // =====================================================================
  // 判定の呼び出しはここ 1 か所（総合判断が基準。docs/SPEC-script-mode.md 1-3-2）
  function evaluateNow() {
    return R.evaluateScript(state.applicant, ensureChecklist(), state.profile);
  }

  function goStep(n) {
    if (n === 2) n = 1;   // 内部キー 2 のステップは無い（旧レコードの 2 は ① に読み替え）
    if (n === 4) {
      state.judgment = evaluateNow();
      state.judgmentStale = false;
    }
    state.step = n;
    state.maxStepReached = Math.max(state.maxStepReached, n);
    renderStepNav(); renderStep(); renderSummary();
    const top = Math.max(0, $('#view-judge').getBoundingClientRect().top + window.scrollY - 70);
    // 面接チェックリスト（②）は縦に長いので、遠くからはすぐに移動する（長いスムーズスクロールを避ける）
    window.scrollTo({ top: top, behavior: Math.abs(window.scrollY - top) > 1500 ? 'auto' : 'smooth' });
  }

  // 判定が無い（③ を開いていない・判定後に入力が変わった）ときは現在の入力で判定する。
  // ② から保存・A4 印刷（トップバー 🖨・② の印刷ボタン・Ctrl+P）しても報告書に結果が入るようにする（チェックリストが未入力でも走らせる）。
  // 副作用は state.judgment（と judgmentStale）だけ。③ を開くと goStep(4) が同じ入力で判定し直すので結果は同じ
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
    // 右サマリーを紙の下に回すのは報告書（③）だけ（fitReportPaper が付け直す）
    const layout = $('#view-judge .judge-layout');
    if (layout) layout.classList.remove('paper-stack');
    switch (state.step) {
      case 1:
        fillChecklistDefaults(); c.innerHTML = scriptApplicantStepHtml(); applyVisibility(); break;
      case 3:
        fillChecklistDefaults(); c.innerHTML = interviewStepHtml(); updateChecklistUI(true); break;
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
    if (o.bare || label === '') return '';
    return '<label>' + esc(label) + (o.required ? '<span class="req">*</span>' : '') + '</label>';
  }

  function fSelect(path, label, options, o) {
    o = o || {};
    const value = U.getPath(state.applicant, path) || '';
    return '<div class="field"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' + labelHtml(label, o) +
      '<select data-field="' + esc(path) + '"' + (o.required ? ' data-required' : '') + (o.bare ? ' aria-label="' + esc(label) + '"' : '') + '><option value="">' + esc(o.placeholder || '選択してください') + '</option>' + optHtml(options, value) + '</select>' +
      (o.hint ? '<div class="hint">' + esc(o.hint) + '</div>' : '') + '</div>';
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
      o.list ? 'list="' + o.list + '"' : '',
      o.autocomplete ? 'autocomplete="' + o.autocomplete + '"' : '',
      (o.bare || label === '') && o.ariaLabel ? 'aria-label="' + esc(o.ariaLabel) + '"' : ''
    ].filter(Boolean).join(' ');
    const input = '<input ' + attrs + '>';
    return '<div class="field"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' + labelHtml(label, o) +
      (o.suffix ? '<div class="inline">' + input + '<span class="suffix">' + esc(o.suffix) + '</span></div>' : input) +
      (o.hint ? '<div class="hint">' + esc(o.hint) + '</div>' : '') + '</div>';
  }

  function fTextarea(path, label, o) {
    o = o || {};
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<textarea data-field="' + esc(path) + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.placeholder || '') + '">' + esc(U.getPath(state.applicant, path) || '') + '</textarea></div>';
  }

  // ラジオ風セグメント。options: [{value,label,tone}]
  //   o.required … ラベルに * を出し、.field に data-required-seg を付ける（checkRequired の対象）

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
  // Step① 応募者（docs/SPEC-script-mode.md 2-2・12 章）
  //   1 枚のカード・3 行: ① 氏名*・年齢・性別・区分（学生は卒業予定年月）／② 面接日・面接担当者・応募した求人／③ タクシー可否・料金・メモ
  //   キーは applicant.* と checklist.header.*（消極属性は 2026-10-13 に削除）
  // =====================================================================

  function scriptApplicantStepHtml() {
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
    return '<div class="card" id="scriptApplicantCard">' +
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
    '<div class="actions end"><button type="button" class="btn primary" id="saNext" data-action="script-next">面接チェックリストへ進む →</button></div>';
  }

  // Step① → ②: 氏名（必須）と年齢の形式だけ止める
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
      if (t.type === 'checkbox') {
        clSet(path, t.checked);
        const lb = t.closest('.cl-check');
        if (lb) lb.classList.toggle('on', t.checked);
      } else {
        clSet(path, t.value);
      }
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
        if (validateScriptApplicant()) goStep(3);
        break;
      case 'to-step':
        goStep(Number(b.dataset.step));
        break;
      case 'judge':
        // 入力チェックで止めない（未入力は報告書に警告を出す。Y8）
        goStep(4);
        break;
      case 'cl-set': {
        const path = b.dataset.cl;
        const v = b.dataset.value || '';
        ensureChecklist();
        clSet(path, String(clGet(path)) === v ? '' : v);
        touchChecklist();
        if (path.indexOf('header.') === 0) rerenderClHeader();
        const row = b.closest('.cl-row');
        if (row && clGet(path)) row.classList.remove('missing');
        syncClButtons(path);   // Step①（応募した求人）は updateChecklistUI の対象外のため
        updateChecklistUI();
        break;
      }
      case 'explain-all': {
        ensureChecklist();
        const blk = clBlockFind(b.dataset.block);
        if (!blk || !clAllTargets(blk).length) break;
        const clear = clAllDone(blk);
        // 外すときはブロックの全項目（求人が通常のときに付いていた「※短期求人のみ」も）、付けるときは対象だけ
        (clear ? blk.items : clAllTargets(blk)).forEach(function (it) {
          if (!U.isObj(it) || !it.id) return;
          clSet('values.' + it.id, !clear);
          $$('#stepContent input[type="checkbox"][data-cl]').forEach(function (cb) { if (cb.dataset.cl === 'values.' + it.id) cb.checked = !clear; });
        });
        touchChecklist();
        updateChecklistUI();
        break;
      }
      case 'cl-jump': {
        const sec = b.dataset.sec;
        const el = sec === '__overall' ? $('#clOverall') : document.getElementById('cl-' + sec);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'print-checklist':
        printChecklistSheet();
        break;
      case 'save':
        saveRecord();
        break;
      case 'stamp': {
        const box = b.closest('.stamp-box');
        const fid = box && box.dataset.fieldId;
        if (!fid) break;
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
        const box = b.closest('.stamp-box');
        const fid = box && box.dataset.fieldId;
        if (fid && state.management[fid]) { delete state.management[fid]; state.dirty = true; rerenderManagementCard(); rerenderReportPaper(); renderSummary(); }
        break;
      }
      case 'decide':
        decide(b.dataset.value);
        break;
      case 'undecide':
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

  function focusFirst(el, msg) {
    toast(msg, 'error');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el.focus) el.focus();
  }

  function isIntText(v) { return /^\d+$/.test(String(v).trim()); }

  // =====================================================================
  // Step② 面接チェックリスト（面接台本。docs/SPEC-checklist.md 2 章）
  // =====================================================================
  // 台本は profile.checklist、回答は state.checklist（項目 id をキーにしたフラットな values / notes ＋ overall ＋ header）。
  // 入力で全体を再描画しない（フォーカスを保つ）。表示の更新は updateChecklistUI() に集約する
  function clDefNow() { return (state.profile && U.isObj(state.profile.checklist)) ? state.profile.checklist : {}; }
  function clSummary() {
    return R.checklistSummary(state.applicant, state.checklist, state.profile, { management: state.management });
  }
  function ensureChecklist() {
    if (!U.isObj(state.checklist)) state.checklist = R.emptyChecklist();
    const cl = state.checklist;
    ['header', 'values', 'notes'].forEach(function (k) { if (!U.isObj(cl[k])) cl[k] = k === 'header' ? R.emptyChecklist().header : {}; });
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

  // ボタン式の選択の押下状態を現在値に合わせる（path のボタンだけ。Step① の「応募した求人」用）
  function syncClButtons(path) {
    $$('[data-action="cl-set"]').forEach(function (b) {
      if (b.dataset.cl !== path) return;
      const on = String(clGet(path)) === b.dataset.value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // ② のヘッダー（読み取り専用・1 行。① の入力から。docs/SPEC-script-mode.md 2-3・12 章）
  //   氏名・区分・年齢・求人・タクシー・面接日・担当 のチップと「応募者を編集」だけ（台本の題名・説明文・目安時間は出さない）
  const SCRIPT_HEAD_KEYS = ['category', 'age', 'posting', 'taxi', 'date', 'interviewer'];
  const SCRIPT_HEAD_SHORT = { taxi: 'タクシー', interviewer: '担当' };   // 値だけで分かる区分・年齢・求人・面接日（日付）はラベルを付けない（title に項目名）
  function scriptClHeaderHtml() {
    const a = state.applicant;
    const rows = R.scriptApplicantRows(a, state.checklist, state.profile, state.management);
    const chips = SCRIPT_HEAD_KEYS.map(function (k) { return rows.find(function (r) { return r.key === k; }); }).filter(Boolean).map(function (r) {
      const k = SCRIPT_HEAD_SHORT[r.key];
      return '<span class="cl-attr" data-attr="' + esc(r.key) + '" title="' + esc(r.label) + '">' + (k ? '<small>' + esc(k) + '</small>' : '') + esc(r.value) + '</span>';
    });
    return '<div class="card cl-head-line" id="clHeader"><div class="cl-head-attrs" id="clHeaderAttrs">' +
        '<span class="cl-attr cl-attr-name" data-attr="name">' + (a.name ? esc(a.name) + '<small>さん</small>' : '<span class="muted">氏名未入力</span>') + '</span>' +
        chips.join('') +
        '<button type="button" class="btn sm ghost cl-head-edit" data-action="to-step" data-step="1">応募者を編集</button>' +
      '</div></div>';
  }

  function clNavHtml(sum) {
    return '<nav class="cl-nav" id="clNav" aria-label="面接チェックリストの目次">' + sum.sections.map(function (s) {
      return '<button type="button" class="cl-chip" id="clChip-' + esc(s.id) + '" data-action="cl-jump" data-sec="' + esc(s.id) + '">' +
        '<span class="cl-chip-mark" aria-hidden="true"></span>' + s.noMark + esc(s.title) + (s.minutesText ? ' <small>' + esc(s.minutesText) + '</small>' : '') + '</button>';
    }).join('') +
      '<button type="button" class="cl-chip" data-action="cl-jump" data-sec="__overall">総合判断</button>' +
      '<span class="spacer"></span><span class="cl-nav-score" id="clNavScore"></span></nav>';
  }

  function clPageHeadHtml(no, sum) {
    const pg = (sum.pages || []).find(function (x) { return U.isObj(x) && Number(x.no) === no; });
    return '<div class="cl-page-head" data-page="' + no + '"><div><b>' + no + '枚目</b>' + (pg && pg.title ? '　' + esc(pg.title) : '') + '</div>' +
      (pg && pg.lead ? '<div class="hint">' + esc(pg.lead) + '</div>' : '') + '</div>';
  }

  // ブロックの見出し【…】（title は【】なしで書く。必須条件・確認点・合否連絡は空でも既定の見出しを出す）
  const CL_DEFAULT_TITLE = { must: '必須条件', rating: '確認点', notify: '合否連絡' };
  function clBlockTitleHtml(b, extra) {
    const t = b.title || CL_DEFAULT_TITLE[b.type] || '';
    const note = b.note && b.type !== 'note' && b.type !== 'notify' ? b.note : '';
    if (!t && !note && !extra) return '';
    return '<div class="cl-block-title">' + (t ? '<span>【' + esc(t) + '】</span>' : '') +
      (note ? '<span class="cl-block-note' + (b.type === 'explain' ? ' strong' : '') + '">' + esc(note) + '</span>' : '') + (extra || '') + '</div>';
  }

  // 【説明】【合否連絡】の「すべて説明した」（data-action="explain-all"。docs/SPEC-script-mode.md 12 章）
  //   対象はブロックの全項目。ただし「※短期求人のみ」（shortOnly）の項目は求人が短期のときだけ。対象が全部チェック済みなら「すべて外す」
  function clBlockFind(id) {
    let hit = null;
    (Array.isArray(clDefNow().sections) ? clDefNow().sections : []).forEach(function (s) {
      (U.isObj(s) && Array.isArray(s.blocks) ? s.blocks : []).forEach(function (b) { if (!hit && U.isObj(b) && b.id === id) hit = b; });
    });
    return hit;
  }
  function clAllTargets(b) {
    const short = String(state.checklist.header.posting || '') === 'short';
    return (Array.isArray(b.items) ? b.items : []).filter(function (it) { return U.isObj(it) && it.id && (!it.shortOnly || short); });
  }
  function clAllDone(b) {
    const t = clAllTargets(b);
    return t.length > 0 && t.every(function (it) { return clGet('values.' + it.id) === true; });
  }
  function clAllBtnHtml(b) {
    if (!b.items.length) return '';
    const done = clAllDone(b);
    return '<button type="button" class="btn sm ghost cl-all-btn' + (clAllTargets(b).length ? '' : ' hidden') + '" data-action="explain-all" data-block="' + esc(b.id) + '" aria-pressed="' + (done ? 'true' : 'false') + '">' +
      (done ? 'すべて外す' : 'すべて説明した') + '</button>';
  }

  function clMustAlertHtml(sum) {
    const def = sum.def;
    const jump = sum.sections.find(function (s) { return s.id === def.mustFailJumpTo; });
    return '<div class="alert danger hidden cl-must-alert" id="clMustAlert"><span class="ico">⚠</span><span><span id="clMustAlertText"></span>' +
      (jump ? ' <button type="button" class="btn sm" data-action="cl-jump" data-sec="' + esc(jump.id) + '">' + jump.noMark + ' ' + esc(jump.title) + 'へ</button>' : '') + '</span></div>';
  }

  function clBlockHtml(b, sum, ctx) {
    let body = '';
    let extraTitle = '';
    switch (b.type) {
      case 'must':
        body = b.items.map(function (it) {
          return '<div class="cl-row cl-must-row" data-item="' + esc(it.id) + '">' +
            '<div class="cl-row-main"><div class="cl-label">' + esc(it.label) + '</div></div>' +
            clSegHtml('values.' + it.id, [{ value: 'match', label: '一致', cls: 'wide match' }, { value: 'mismatch', label: '不一致', cls: 'wide mismatch' }], { aria: it.label }) +
            '<span class="badge muted cl-unknown' + (it.value ? ' is-off' : '') + '" data-unknown="' + esc(it.id) + '">未確認</span>' +
          '</div>';
        }).join('');
        if (!ctx.mustAlert) { ctx.mustAlert = true; body += clMustAlertHtml(sum); }
        break;
      case 'fields':
        body = '<div class="cl-fields">' + b.items.map(function (it) {
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
        break;
      case 'explain':
      case 'notify':
        extraTitle = clAllBtnHtml(b);
        body = (b.type === 'notify' && b.note ? '<div class="hint cl-notify-note">' + esc(b.note) + '</div>' : '') +
          '<div class="cl-checks' + (b.type === 'notify' ? ' one-col' : '') + '">' + b.items.map(function (it) {
            const on = clGet('values.' + it.id) === true;
            return '<label class="cl-check' + (it.shortOnly ? ' short-only' : '') + (on ? ' on' : '') + '" data-item="' + esc(it.id) + '">' +
              '<input type="checkbox" data-cl="values.' + esc(it.id) + '"' + (on ? ' checked' : '') + '><span>' + esc(it.label) + '</span>' +
              (it.shortOnly ? '<span class="tag">※短期求人のみ</span>' : '') + '</label>';
          }).join('') + '</div>';
        break;
      case 'question':
        body = b.items.length ? '<ol class="cl-questions">' + b.items.map(function (it) { return '<li data-item="' + esc(it.id) + '">' + esc(it.label) + '</li>'; }).join('') + '</ol>' : '';
        break;
      case 'rating':
        extraTitle = '<span class="cl-legend">○ できている／△ やや不安／× できていない</span>';
        body = b.items.map(function (it) {
          return '<div class="cl-row cl-rate-row" data-item="' + esc(it.id) + '">' +
            '<div class="cl-row-main"><div class="cl-label b">' + esc(it.label) + '</div>' + (it.hint ? '<div class="hint">' + esc(it.hint) + '</div>' : '') + '</div>' +
            clSegHtml('values.' + it.id, ['good', 'fair', 'poor'].map(function (k) {
              return { value: k, label: R.RATING_MARKS[k].mark, cls: 'cl-mark ' + k, title: R.RATING_MARKS[k].label };
            }), { aria: it.label }) +
            '<input type="text" class="cl-note" data-cl="notes.' + esc(it.id) + '" value="' + esc(clGet('notes.' + it.id)) + '" placeholder="メモ（任意）" aria-label="' + esc(it.label) + ' のメモ">' +
          '</div>';
        }).join('');
        break;
      case 'note':
        return b.note ? '<p class="cl-flow" data-block="' + esc(b.id) + '">→ ' + esc(b.note) + '</p>' : '';
      default:
        return '';
    }
    if (b.memo) {
      body += '<div class="field cl-memo"><label>' + esc(b.memoLabel || 'メモ') + '</label>' +
        '<textarea rows="3" data-cl="notes.' + esc(b.id) + '">' + esc(clGet('notes.' + b.id)) + '</textarea></div>';
    }
    return '<div class="cl-block cl-block-' + esc(b.type) + '" data-block="' + esc(b.id) + '">' + clBlockTitleHtml(b, extraTitle) + body + '</div>';
  }

  function clSectionHtml(s, sum, ctx) {
    return '<div class="card cl-sec" id="cl-' + esc(s.id) + '" data-sec="' + esc(s.id) + '">' +
      '<div class="card-head"><h2><span class="cl-no">' + s.noMark + '</span>' + esc(s.title) + '</h2>' +
        (s.minutesText ? '<span class="badge info">' + esc(s.minutesText) + '</span>' : '') +
        '<span class="cl-sec-state" id="clState-' + esc(s.id) + '"></span>' +
        '<span class="cl-skip-note">必須条件不一致のため省略可</span>' +
        (s.lead ? '<p>' + esc(s.lead) + '</p>' : '') +
      '</div>' +
      s.blocks.map(function (b) { return clBlockHtml(b, sum, ctx); }).join('') +
    '</div>';
  }

  function clOverallHtml(sum) {
    const def = sum.def;
    const oo = U.isObj(def.overallOptions) ? def.overallOptions : {};
    // 総合判断がそのまま結果になる（必須条件の不一致は除く）
    const hint = [def.overallHint || '', '「' + (oo.hire || overallLabelNow('hire')) + '」は' + resultTitle('recommend') + '、「' + (oo.hold || overallLabelNow('hold')) + '」は' + resultTitle('review') +
      '、「' + (oo.reject || overallLabelNow('reject')) + '」は' + resultTitle('reject') + 'として報告します（必須条件が不一致なら' + resultTitle(def.mustFailResult === 'review' ? 'review' : 'reject') + '）。'].filter(Boolean).join(' ');
    return '<div class="card" id="clOverall"><div class="card-head"><h2>総合判断・面接所見</h2></div>' +
      '<div class="cl-overall-row"><div class="cl-label b">' + esc(def.overallLabel || '面接者の総合判断') + '</div>' +
        clSegHtml('overall', ['hire', 'hold', 'reject'].map(function (k) { return { value: k, label: oo[k] || overallLabelNow(k), cls: 'wide ' + k }; }), { cls: 'lg', aria: def.overallLabel }) +
      '</div>' +
      (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') +
      '<div class="cl-score" id="clScore">面接評価 <b class="num" id="clScoreTotal">—</b> / <span class="num" id="clScoreMax">' + sum.score.max + '</span>点' +
        '<span class="num cl-score-pct" id="clScorePct"></span><span class="badge" id="clScoreBand"></span><span class="muted" id="clScoreDetail"></span></div>' +
      '<div class="cl-must-summary" id="clMustSummary"></div>' +
      '<div class="alert warn hidden" id="overallWarn"><span class="ico">⚠</span><span id="overallWarnText"></span></div>' +
      '<div class="field cl-notes-field"><label>面接所見</label>' +
        '<textarea data-note="interview" rows="4" placeholder="特記事項、受け答えの印象など">' + esc(state.interviewNotes) + '</textarea></div>' +
    '</div>';
  }

  function interviewStepHtml() {
    ensureChecklist();
    const sum = clSummary();
    // ヘッダーは ① の入力から（読み取り専用）
    let html = scriptClHeaderHtml();
    html += clNavHtml(sum);
    const ctx = {};
    let page = null;
    sum.sections.forEach(function (s) {
      if (s.page !== page) { page = s.page; html += clPageHeadHtml(page, sum); }
      html += clSectionHtml(s, sum, ctx);
    });
    html += clOverallHtml(sum);
    html += '<div class="actions between">' +
      '<button type="button" class="btn" id="backToApplicant" data-action="to-step" data-step="1">← 応募者に戻る</button>' +
      '<div class="actions"><button type="button" class="btn" id="clPrintBtn" data-action="print-checklist" title="結果・必須条件・確認点・面接メモ・押印を A4 1 枚に印刷">🖨 面接チェックリスト報告（A4）</button>' +
      '<button type="button" class="btn primary" id="toReportBtn" data-action="judge">報告書へ進む →</button></div></div>';
    return html;
  }

  // 面接日が空なら今日を入れる（dirty にしない）
  function fillChecklistDefaults() {
    ensureChecklist();
    if (!state.checklist.header.date) state.checklist.header.date = U.fmtDate(new Date());
  }

  // ヘッダーだけ作り直す（応募した求人の切り替え）
  function rerenderClHeader() {
    const card = $('#clHeader');
    if (!card) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = scriptClHeaderHtml();
    card.replaceWith(tmp.firstElementChild);
  }

  function clBadge(tone, text, id) {
    return '<span class="badge ' + (tone || '') + '"' + (id ? ' id="' + id + '"' : '') + '>' + esc(text) + '</span>';
  }

  function updateChecklistUI(noSummary) {
    const root = $('#stepContent');
    if (state.step !== 3 || !$('#clOverall', root)) { if (!noSummary) renderSummary(); return; }
    ensureChecklist();
    const sum = clSummary();
    const def = sum.def;

    $$('[data-action="cl-set"]', root).forEach(function (b) {
      const on = String(clGet(b.dataset.cl)) === b.dataset.value;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $$('.cl-check', root).forEach(function (l) { const cb = l.querySelector('input'); l.classList.toggle('on', !!(cb && cb.checked)); });
    // 「すべて説明した」⇔「すべて外す」（求人の切り替え・個別のチェックに追従）
    $$('[data-action="explain-all"]', root).forEach(function (btn) {
      const blk = clBlockFind(btn.dataset.block);
      const done = !!blk && clAllDone(blk);
      btn.textContent = done ? 'すべて外す' : 'すべて説明した';
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      show(btn, !!blk && clAllTargets(blk).length > 0);
    });

    // 必須条件：未確認バッジ
    sum.must.items.forEach(function (m) {
      const row = $('.cl-must-row[data-item="' + m.id + '"]', root);
      if (!row) return;
      const unk = $('[data-unknown]', row);
      if (unk) unk.classList.toggle('is-off', !!m.value);   // 場所は残す（ボタンの位置を揃える）
    });
    // 確認点：入力済みなら .missing を外す
    sum.ratings.forEach(function (r) {
      const row = $('.cl-rate-row[data-item="' + r.id + '"]', root);
      if (row && r.value) row.classList.remove('missing');
    });
    if (sum.overall.value) $('#clOverall').classList.remove('missing');

    // 「※短期求人のみ」の説明は求人が短期のときだけ強調する
    const posting = String(state.checklist.header.posting || '');
    $$('.cl-check.short-only', root).forEach(function (l) {
      l.classList.toggle('dim', posting !== 'short');
      l.classList.toggle('emph', posting === 'short');
    });

    // セクションの状態・目次
    sum.sections.forEach(function (s) {
      const stEl = $('#clState-' + s.id);
      if (stEl) {
        stEl.innerHTML = s.mustMismatch ? clBadge('danger', '不一致あり')
          : s.gradable ? (s.answered === s.gradable ? clBadge('ok', '済') : s.answered ? clBadge('warn', '入力中 ' + s.answered + '/' + s.gradable) : clBadge('', '未入力'))
            : (s.done ? clBadge('ok', '済') : '');
      }
      const chip = $('#clChip-' + s.id);
      if (chip) {
        chip.classList.toggle('done', !!s.done && !s.mustMismatch);
        chip.classList.toggle('ng', s.mustMismatch > 0);
        const mk = $('.cl-chip-mark', chip);
        if (mk) mk.textContent = s.mustMismatch ? '●' : s.done ? '✓' : '';
      }
    });
    const sc = sum.score;
    setText('#clNavScore', '面接評価 ' + (sc.rated ? sc.total : '—') + '/' + sc.max + (sc.rated ? '（' + fmtNum(sc.pct) + '%・' + sc.bandLabel + '）' : ''));

    // 必須条件の不一致：案内と、打ち切りで省略できるセクション（必須条件のセクションより後〜案内先より前）
    const ms = sum.must;
    const mm = ms.mismatch > 0;
    // 不一致で打ち切ってよいのは不採用推奨に固定するときだけ（review のときは ②〜④ も評価が必要）
    const gateReject = mm && def.mustFailResult !== 'review';
    const alert = $('#clMustAlert');
    if (alert) {
      show(alert, mm);
      if (mm) {
        const jump = sum.sections.find(function (s) { return s.id === def.mustFailJumpTo; });
        const head = '必須条件が一致しません（' + ms.mismatchLabels.join('、') + '）。';
        if (gateReject) {
          setText('#clMustAlertText', head +
            (jump ? '追加質問して解消しなければ ' + jump.noMark + ' ' + jump.title + 'へ進み、' + (jump.minutesText ? jump.minutesText + 'で' : '') + '終了してください'
              : '追加質問して解消しなければ面接を終了してください') +
            '（判定は' + resultTitle('reject') + 'になります）。');
        } else {
          // mustFailResult='review': ほかのセクションの確認点・総合判断も評価してから判定する
          setText('#clMustAlertText', head + '追加質問で確認し、ほかのセクションの確認点も評価してから判定してください（判定は' + resultTitle('review') + '以下になります）。');
        }
        const jb = $('[data-action="cl-jump"]', alert);
        if (jb) show(jb, gateReject);
      }
    }
    const mustIdx = sum.sections.findIndex(function (s) { return s.blocks.some(function (b) { return b.type === 'must'; }); });
    const jumpIdx = sum.sections.findIndex(function (s) { return s.id === def.mustFailJumpTo; });
    sum.sections.forEach(function (s, i) {
      const el = $('#cl-' + s.id);
      if (el) el.classList.toggle('cl-skippable', gateReject && mustIdx >= 0 && jumpIdx >= 0 && i > mustIdx && i < jumpIdx);
    });

    // 総合判断・面接評価・必須条件のまとめ
    const c = sc.counts || { good: 0, fair: 0, poor: 0, blank: 0 };
    setText('#clScoreTotal', sc.rated ? String(sc.total) : '—');
    setText('#clScoreMax', String(sc.max));
    setText('#clScorePct', sc.rated ? fmtNum(sc.pct) + '%' : '');
    const bandEl = $('#clScoreBand');
    if (bandEl) { bandEl.className = 'badge ' + (BAND_TONE[sc.band] || ''); bandEl.textContent = sc.bandLabel || ''; show(bandEl, !!sc.bandLabel); }
    setText('#clScoreDetail', '（○' + c.good + ' △' + c.fair + ' ×' + c.poor + (c.blank ? '・未入力 ' + c.blank : '') + '・総合判断 ' + (sum.overall.label || '未入力') + '）');
    const msEl = $('#clMustSummary');
    if (msEl) {
      msEl.innerHTML = ms.total ? '<span class="cl-ms-label">必須条件</span>' +
        (ms.match ? clBadge('ok', '一致 ' + ms.match) : '') + (ms.mismatch ? clBadge('danger', '不一致 ' + ms.mismatch) : '') + (ms.unknown ? clBadge('muted', '未確認 ' + ms.unknown) : '') +
        (ms.mismatch ? '<span class="hint">不一致: ' + esc(ms.mismatchLabels.join('、')) + '</span>' : '') +
        (ms.unknown ? '<span class="hint">未確認: ' + esc(ms.unknownLabels.join('、')) + '</span>' : '') : '';
    }
    const ov = sum.overall.value;
    show('#overallWarn', ov === 'hold' || ov === 'reject');
    if (ov === 'hold' || ov === 'reject') setText('#overallWarnText', '面接者の総合判断が「' + sum.overall.label + '」です。');

    if (!noSummary) renderSummary();
  }
  // =====================================================================
  // Step③ 報告書（docs/SPEC-script-mode.md 2-4）
  //   紙プレビュー（保存 HTML の報告書表示と同じ A4 シート）→ 押印 → 最終合否 → 保存・印刷
  // =====================================================================
  function reportPaperInnerHtml() {
    return S.checklistSheetHtml(S.buildRecord(state), state.profile, { mode: 'sheet', stamps: '', decisionId: 'appPaperDecision', decisionSvgId: 'vdAppPaper' });
  }

  // 入力・押印・合否の変更で紙プレビューを描き直す（Step③ を開いていないときは何もしない）
  function rerenderReportPaper() {
    const el = $('#appPaper');
    if (el) { el.innerHTML = reportPaperInnerHtml(); fitReportPaper(); }
  }

  // 紙プレビューにも印刷と同じ 1 ページ保証のクラス（.cl-compact / .cl-compact-q1 / .cl-compact-2）を付ける（storage.fitChecklistSheet。画面に出ているときだけ計れる）。
  //   紙は等倍（本文 9.5px）で見せる: 右サマリーの横で紙が入らない幅（1280px・1366px など）は右サマリーを紙の下に回す（.judge-layout.paper-stack）。
  //   それでも列が紙より狭いときだけ縮小し、縮小は 0.95 倍まで（本文 9px 以上）。それより狭い画面（タブレット縦・スマホ）は等倍で紙だけ横スクロール。
  //   計測は縮小を外した状態で行う（縮小したままだと高さが変わる）
  const PAPER_MIN_ZOOM = 0.95;
  function checklistSheetLimit() {
    const mg = state.profile.management || {};
    const n = Array.isArray(mg.fields) ? mg.fields.length : 0;
    return typeof S.checklistSheetLimit === 'function' ? S.checklistSheetLimit(n) : undefined;
  }
  function fitReportPaper() {
    const paper = $('#appPaper');
    const layout = $('#view-judge .judge-layout');
    if (!paper) { if (layout) layout.classList.remove('paper-stack'); return; }
    paper.style.zoom = '';
    const sh = $('.cl-sheet', paper);
    if (sh && typeof S.fitChecklistSheet === 'function') S.fitChecklistSheet(sh, checklistSheetLimit());
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
    let html = '';
    if (j && j.warnings && j.warnings.length) {
      html += '<div class="card" id="scriptWarnings"><div class="card-head"><h3>確認事項</h3></div><ul class="list-x">' +
        j.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
        (ovMissing ? '<div class="actions"><button type="button" class="btn sm" data-action="to-step" data-step="3">面接チェックリストで入力する</button></div>' : '') +
      '</div>';
    }
    html += '<div class="report-paper-wrap" id="appPaperWrap">' +
      '<div class="report-paper-cap"><b>面接チェックリスト報告（A4 プレビュー）</b><span>保存した HTML も同じ表示で開きます。印刷は「A4 で印刷」で 1 枚</span></div>' +
      '<div class="report-paper" id="appPaper">' + reportPaperInnerHtml() + '</div></div>';
    html += managementCardHtml();
    html += decisionCardHtml();
    html += '<div class="actions between no-print">' +
      '<button type="button" class="btn" id="backToChecklist" data-action="to-step" data-step="3">← 面接チェックリストに戻る</button>' +
      '<div class="actions"><button type="button" class="btn" id="reportPrintBtn" data-action="print-checklist">🖨 A4 で印刷</button>' +
      '<button type="button" class="btn primary" id="reportSaveBtn" data-action="save">💾 報告書を保存（HTML）</button></div></div>';
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
    // 判定済み（③・保存・印刷で state.judgment がある）ならそれを、無いときだけ入力中の内容で評価して表示する
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
    // 判定後に入力・設定が変わっていたら、古い判定を記録に残さず現在の内容で再判定する。③ を開かずに保存しても判定を記録する
    const rejudged = state.judgmentStale && !state.judgment;
    ensureJudgment();
    const rec = S.buildRecord(state);
    const html = S.generateReportHTML(rec, state.profile);
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
      const rec = S.parseRecordFromHTML(text);
      if (!rec) { toast('このアプリで保存したファイルではないか、データが見つかりません', 'error'); return; }
      if (state.dirty && !window.confirm('入力中の内容を破棄して読み込みますか？')) return;
      applyRecord(rec);
    };
    reader.readAsText(file, 'utf-8');
  }

  // 保存した HTML の記録を読み込む（旧い形式の記録も S.normalizeRecord で読む。docs/SPEC-slim.md 3-2）
  function applyRecord(rec) {
    const p = state.profile;
    const n = S.normalizeRecord(rec);
    state.applicant = n.applicant;
    state.checklist = n.checklist;
    ensureChecklist();
    state.interviewNotes = n.interviewNotes;
    state.management = n.management;
    state.decision = n.decision;
    state.judgment = null;
    state.judgmentStale = false;
    state.savedAt = n.savedAt;
    state.dirty = false;
    const sj = n.judgment;
    const hasCl = R.checklistHasInput(state.checklist);
    let target;
    // 旧い形式の記録（v1・mode: 'full'）は評価を入れ直す前提で ② を開く（回答と判定があれば ③）
    if (n.legacy.full || n.legacy.v1) target = hasCl && sj ? 4 : 3;
    else if (sj && n.step === 4) target = 4;
    else target = hasCl ? 3 : 1;   // ② で保存した記録は ② から再開（判定が入っていても ③ に飛ばない）
    state.step = target;
    state.maxStepReached = target;
    showView('judge');
    goStep(target);

    const msgs = [];
    if (n.theaterName && n.theaterName !== p.meta.theaterName) msgs.push('このファイルは「' + n.theaterName + '」の設定で保存されています。現在の設定で判定し直します');
    else msgs.push((state.applicant.name || '応募者') + ' さんのデータを読み込みました');
    if (n.legacy.full) msgs.push('詳細モードで保存された記録です。面接前の詳細（勤務条件・留意点・シフト貢献度など）は読み込みません（元のファイルはそのまま残ります）');
    if (n.legacy.scores) msgs.push('旧形式の面接評価（10 項目×5 点）は読み込みません。面接チェックリストで評価し直してください');
    if (n.legacy.initial) msgs.push('初期対応者の押印欄は廃止したため表示しません');
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
    state.profile = p;
    S.saveProfile(p);
    onProfileChanged();
    toast(profileNotice(rep) || 'プロファイルを読み込みました', 'ok');
    showView('settings');
  }

  function newRecord() {
    if (state.dirty && !window.confirm('入力中の内容を破棄して新規作成しますか？')) return;
    state.applicant = emptyApplicant();
    state.checklist = R.emptyChecklist(); state.interviewNotes = ''; state.judgment = null; state.judgmentStale = false;
    state.management = {};
    state.decision = null;
    state.savedAt = null; state.dirty = false;
    state.step = 1; state.maxStepReached = 1;
    showView('judge');
    toast('新規の応募者を開始しました');
  }

  // =====================================================================
  // 面接チェックリスト報告（A4 1 枚）の印刷（docs/SPEC-checklist.md 4-4）
  //   body.print-checklist を付けて印刷する。描画は storage.checklistSheetHtml（保存レポートと共通）で、
  //   入力 UI ではなく専用のホスト #clSheet に描く（画面では非表示）
  // =====================================================================
  // 押印欄（静的・小さめ。操作部品なし）。押印欄が 2 つのときは 2 列（docs/SPEC-slim.md D10）
  function checklistStampsHtml() {
    const mg = state.profile.management || {};
    const fields = Array.isArray(mg.fields) ? mg.fields : [];
    if (!fields.length || !Stamp) return '';
    return '<div class="stamp-row cl-stamps-row' + (fields.length === 2 ? ' cols-2' : '') + '">' + fields.map(function (fld, idx) {
      const e = state.management[fld.id];
      return '<div class="stamp-box" data-field-id="' + esc(fld.id) + '"><div class="stamp-label">' + esc(fld.label) + '</div>' +
        '<div class="stamp-area">' + (e && e.name ? Stamp.render(e, { size: 46, id: 'cl' + idx }) : '<div class="stamp-empty">未押印</div>') + '</div>' +
        '<div class="stamp-meta">' + (e && e.name ? esc(e.name + (e.title ? '（' + e.title + '）' : '') + '　' + (e.date || '')) : '') + '</div></div>';
    }).join('') + '</div>';
  }

  // 1 ページ保証: 押印行を除いた高さが上限（storage.checklistSheetLimit。押印欄の件数で決まる）を超えたら
  //   .cl-compact → .cl-compact-q1 → .cl-compact-2 → 縮小（storage.fitChecklistSheet）。紙プレビューと同じ上限
  function fitChecklistSheet() {
    const sheet = $('#clSheet .cl-sheet');
    if (sheet && typeof S.fitChecklistSheet === 'function') S.fitChecklistSheet(sheet, checklistSheetLimit());
  }

  function prepareChecklistSheet(on) {
    const host = $('#clSheet');
    if (!host) return false;
    if (on) {
      if (typeof S.checklistSheetHtml !== 'function') {
        toast('面接チェックリスト報告を作成できません（印刷用の描画が見つかりません）', 'error');
        return false;
      }
      injectChecklistSheetCss();
      // ③ を開かずに印刷しても結果が入るよう、判定が無ければ現在の入力で判定する
      if (ensureJudgment() && state.view === 'judge') renderSummary();
      const rec = S.buildRecord(state);
      host.innerHTML = S.checklistSheetHtml(rec, state.profile, { mode: 'sheet', stamps: checklistStampsHtml() });
      document.body.classList.add('print-checklist');
      fitChecklistSheet();
    } else {
      document.body.classList.remove('print-checklist');
      host.innerHTML = '';
    }
    return true;
  }

  function printChecklistSheet() {
    if (!prepareChecklistSheet(true)) return;
    const done = function () { prepareChecklistSheet(false); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(done, 3000);
    window.print();
  }

  // =====================================================================
  // 応募者の管理（押印）
  // =====================================================================
  const Stamp = global.RecruitStamp;

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
      '<p>担当者を選んで押印してください。押印は保存ファイル（HTML）に入り、レポート上でも押印できます。名簿は設定の「応募者の管理」で編集します。</p></div>' +
      '<div class="stamp-row' + (fields.length === 2 ? ' cols-2' : '') + '">' + fields.map(function (fld, idx) {
        const e = state.management[fld.id];
        const svg = e && e.name ? Stamp.render(e, { size: 88, id: 'app' + idx }) : '';
        return '<div class="stamp-box" data-field-id="' + esc(fld.id) + '">' +
          '<div class="stamp-label">' + esc(fld.label) + '</div>' +
          '<div class="stamp-hint">' + esc(fld.hint || '') + '</div>' +
          '<div class="stamp-area">' + (svg || '<div class="stamp-empty">未押印</div>') + '</div>' +
          '<div class="stamp-meta">' + (e && e.name ? esc(e.name + (e.title ? '（' + e.title + '）' : '') + '　' + (e.date || '')) : '') + '</div>' +
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
          '</div></div>';
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
          '<div class="decision-ctl no-print">' +
            '<select id="decisionManager" data-decision-select aria-label="' + esc(dcfg.label) + ' 担当者"><option value="">担当者を選択</option>' +
              managers.map(function (m, i) { return '<option value="' + i + '"' + (i === selIdx ? ' selected' : '') + '>' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>'; }).join('') +
              (allowFree ? '<option value="__free"' + (useFree ? ' selected' : '') + '>名簿にない担当者（手入力）</option>' : '') +
            '</select>' +
            (allowFree ? '<input type="text" id="decisionFree" class="stamp-free' + (useFree ? '' : ' hidden') + '" placeholder="氏名（例：山田 太郎）" value="' + (useFree ? esc(selName) : '') + '">' : '') +
            btn('hire', dcfg.hireLabel, dcfg.hireColor) + btn('reject', dcfg.rejectLabel, dcfg.rejectColor) +
            (d ? '<button type="button" class="btn sm ghost" data-action="undecide">取消</button>' : '') +
          '</div>' +
          (linked ? '<div class="hint no-print">「' + esc(dcfg.hireLabel) + '」「' + esc(dcfg.rejectLabel) + '」を押すと、押印欄「' + esc(linked.label) + '」が未押印なら同じ担当者の印も押します。</div>' : '') +
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
    if (!dcfg.enabled || !Stamp || (r !== 'hire' && r !== 'reject')) return;
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

  // 使い方（docs/SPEC-script-mode.md 5 章）
  function helpHtml() {
    const m = state.profile.meta;
    return '<div class="card"><div class="card-head"><h2>' + esc(m.appTitle) + ' の使い方</h2><p>面接台本（スタッフ面接チェックリスト）のとおりに面接し、その内容をそのまま A4 の報告書にします。応募者の名前と属性を入れたら、あとは台本の順に入力するだけです。</p></div>' +
      '<div class="help-steps">' +
        '<div class="help-step"><span class="n">1</span><h3>応募者</h3><p>1 枚のカードに 3 行だけ。氏名（必須）・年齢・性別・区分（学生は卒業予定年月）、面接日・面接担当者・応募した求人（通常／短期）、タクシー可否・料金とメモを、分かる範囲で入力します。</p></div>' +
        '<div class="help-step"><span class="n">2</span><h3>面接チェックリスト</h3><p>①勤務条件 → ②継続性・報連相 → ③仕事内容の説明 → ④集団行動特性 → ⑤逆質問 の順に、必須条件（一致／不一致）・説明のチェック・質問のメモ・確認点の ○△×・総合判断（採用／保留／不採用）を入力します。必須条件が 1 つでも不一致なら不採用推奨です。</p></div>' +
        '<div class="help-step"><span class="n">3</span><h3>報告書</h3><p>A4「面接チェックリスト報告」のプレビューを確認し、押印欄（面接対応者／最終確認）に電子印を押して「報告書を保存（HTML）」します。「A4 で印刷」で 1 枚（結果・必須条件・確認点・面接メモ・押印）に印刷できます。台本の全文は保存 HTML の「詳細」に残ります。</p></div>' +
      '</div></div>' +
      '<div class="card" id="helpScriptFlow"><div class="card-head"><h3>報告書（HTML）の流れ</h3></div><ol class="list-plain">' +
        '<li>面接者が「面接対応者」に押印して保存し、社内スレッドに添付します。</li>' +
        '<li>副支配人がファイルをブラウザで開きます（報告書の表示で開きます。「詳細」で全体を表示）。</li>' +
        '<li><b>最終合否</b>：担当者を選んで「採用」または「不採用」を押し（最終確認の印も自動で押されます）、「押印を保存」で再出力します（ファイル名の末尾に _採用 / _不採用）。</li>' +
        '<li>再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。</li></ol></div>' +
      '<div class="card"><div class="card-head"><h3>結果（推奨）の決まり方</h3></div><ul class="list-plain">' +
        '<li>必須条件に不一致がある → 不採用推奨（設定で上長最終判断要に変更可）。</li>' +
        '<li>それ以外は面接者の総合判断のとおり（採用 → 採用推奨、保留 → 上長最終判断要、不採用 → 不採用推奨）。総合判断が未入力なら上長最終判断要です。</li>' +
        '<li>確認点の ○△× は面接評価（点数）として報告書に載ります。最終合否（採用／不採用のスタンプ）はこの推奨とは別の、最終確認者の決定です。</li></ul></div>' +
      '<div class="card"><div class="card-head"><h3>保存と読み込み</h3></div><ul class="list-plain">' +
        '<li>応募者ごとに 1 ファイル（HTML）。途中で保存しても、読み込むと続きから再開できます。</li>' +
        '<li>応募者データはこの端末のブラウザには残りません（保存したファイルのみが記録です）。</li></ul></div>' +
      '<div class="card"><div class="card-head"><h3>設定（劇場プロファイル）</h3></div><ul class="list-plain">' +
        '<li>劇場情報・応募者の区分と性別・面接チェックリスト（台本の文言・項目・確認点）・押印欄と担当者名簿・最終合否を画面から変更できます。</li>' +
        '<li>設定は端末のブラウザに保存されます。他の劇場・端末へ展開するときは JSON を書き出して読み込んでください。</li></ul></div>' +
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
    prepareChecklistSheet: prepareChecklistSheet, evaluateNow: evaluateNow
  };
})(window);
