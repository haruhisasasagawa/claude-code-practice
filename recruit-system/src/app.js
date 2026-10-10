/*
 * 画面制御
 * ----------------------------------------------------------------------
 * Step1 応募情報 → Step2 面接者への申し送り（留意点） → Step3 面接評価 → Step4 採用可否判定
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

  const STEPS = [
    { n: 1, label: '応募情報', hint: '採用担当が入力' },
    { n: 2, label: '面接者への申し送り', hint: '留意点を確認・共有' },
    { n: 3, label: '面接評価', hint: '面接者が採点・面接で確認' },
    { n: 4, label: '採用可否判定', hint: '判定結果・保存' }
  ];

  const state = {
    view: 'judge',
    step: 1,
    maxStepReached: 1,
    profile: null,
    applicant: null,
    handoff: null,
    handoffStale: false,   // 応募情報・設定が変わり、handoff の作り直しが必要
    judgmentStale: false,  // 判定後に入力・設定が変わり、判定のやり直しが必要（state.judgment は null）
    handoffChecks: {},
    handoffNote: '',
    scores: {},
    interviewNotes: '',
    judgment: null,
    legacyRecord: null,    // 旧形式（v1）のファイルを読み込んだときの保存時判定
    lastHandoffText: '',   // 最後にコピーした申し送り文（確認用）
    preFillOpen: null,     // Step1「面接前に分かっている項目」の開閉（null=自動：面接時の項目に入力があれば開く）
    continueAt: '',        // Step1 で「卒業後も当劇場で継続」を描いた場所（区分の変更で場所が変わるときだけ描き直す）
    cfSnap: null,          // Step3「面接で確認する項目」を開いた時点の状態（外国籍の該当欄を出すか・応募時に入力があったか）。goStep で作り直す
    handoffBase: null,     // Step2 までに作った留意点の文言 { id: text }（Step3 で入力して新しく出た留意点を見分ける。Step3 以降の作り直しでは更新しない）
    management: {},        // 応募者の管理（押印）: { initial: { name, short, title, date, at }, ... }
    savedAt: null,
    dirty: false
  };

  // 表示用の短い名前（設定のラベルは長いことがあるため）
  const PART_SHORT = { busy: '繁忙期', weekend: '土日', holiday: '祝日', allNight: 'オールナイト', close: 'クローズ/深夜', open: 'オープン', weeklyDays: '週日数', period: '勤務期間' };
  // 「面接で確認すること」に出す問いかけ（得点率が低い項目）
  const CONFIRM_HINT = {
    busy: '繁忙期（3連休・長期休暇）に出られる日数を増やせるか',
    weekend: '土日の出勤頻度を増やせるか',
    holiday: '祝日に入れる日があるか',
    allNight: 'オールナイトの可否と頻度',
    close: 'クローズ（夜遅く）の勤務に入れるか',
    open: 'オープン（朝）の勤務に入れるか',
    weeklyDays: '週の勤務日数を増やせるか',
    period: '勤務期間（卒業後も継続できるか）'
  };
  const RESULT_SHORT = { recommend: '推奨', review: '上長', reject: '不採用' };
  const RESULT_TONE = { recommend: 'ok', review: 'warn', reject: 'danger' };
  const BAND_TONE = { high: 'ok', mid: 'warn', low: 'danger' };
  const ADJUST_SHORT = {
    contribution_incomplete: 'シフト条件が未確定のため調整',
    overall_cutoff: '総合判断の足切りで調整',
    highschool_hold: '高校生の採用方針のため調整',
    legal_hold: '法令の要判断が未確認のため調整',
    unresolved_block: '要判断未確認のため調整'
  };
  const CONTINUE_OPTS = [
    { value: 'yes', label: '継続する', tone: 'ok' },
    { value: 'undecided', label: '未定', tone: 'warn' },
    { value: 'no', label: '継続しない', tone: 'danger' }
  ];
  const MIGRATION_MSG = '劇場ルールを新しい形式に更新しました（高校生の扱い・繁忙期・オールナイト・2軸判定を追加）。設定画面で確認してください。';

  // =====================================================================
  // 初期化
  // =====================================================================
  function init() {
    const rep = {};
    state.profile = S.loadProfile(rep);
    state.applicant = emptyApplicant(state.profile);
    applyTheme(S.loadTheme());
    renderBrand();
    bindGlobal();
    showView('judge');
    if (rep.migratedFrom) {
      S.saveProfile(state.profile);
      toast(MIGRATION_MSG);
    }
  }

  function emptyApplicant(profile) {
    const shifts = {};
    R.DAYS.forEach(function (d) { shifts[d.key] = { start: '', end: '', nextDay: false }; });
    shifts.any = { start: '', end: '', nextDay: false };
    const vacation = {}, vacationDays = {};
    ((profile.options || {}).vacationItems || []).forEach(function (v) {
      if (!v || !v.id) return;
      vacation[v.id] = ''; vacationDays[v.id] = '';
    });
    return {
      name: '', gender: '', age: '', category: '', graduationDate: '',
      commuteMethod: '', commuteMinutes: '', nearestStation: '',
      workDays: [], anyDay: false, daysMin: '', daysMax: '',
      shifts: shifts,
      workPeriod: '', sideJob: '', sideJobDetail: '',
      vacation: vacation,
      vacationDays: vacationDays,
      holidayWork: '',
      weekendFreq: '',
      allNight: { availability: '', frequency: '', note: '' },
      highschool: { careerDecided: '', careerPath: '', destination: '' },
      continueAfterGraduation: '',
      sideJobHoursPerWeek: '',
      lateNight: { availability: '', returnMethod: '', lastTrain: '', taxiFare: '' },
      foreign: { isForeign: '', residenceStatus: '', workPermit: '', residenceExpiry: '', japaneseLevel: '' },
      department: '', applicationRoute: '',
      reviewerNotes: ''
    };
  }

  // ---------- 小さなヘルパー ----------
  function feat() { return (state.profile && state.profile.features) || {}; }
  function contribOn() { return feat().contribution !== false; }
  // Step3「面接で確認する項目」でシフト条件（繁忙期・オールナイト・週の勤務日数）を確定させるか：
  // 2軸判定・オールナイト、または「シフト条件の未確認」留意点が ON のとき
  // （旧プロファイルから移行した他劇場＝2軸 OFF・留意点 OFF では従来どおり出さない）
  function shiftConfirmOn() {
    const rule = ((state.profile && state.profile.handoffRules) || []).find(function (r) { return r.id === 'shift_unanswered'; });
    return contribOn() || !!feat().allNight || !!(rule && rule.enabled !== false && (feat().vacation || feat().holidayWork || feat().weekendFreq));
  }
  // 面接前（Step1・2）は貢献度の点数を出さない設定か（採点者のバイアス対策。Step3 以降は表示）
  function hidePointsBeforeInterview() {
    return ((state.profile && state.profile.contribution) || {}).showBeforeInterview === false && state.step <= 2;
  }
  function fmtNum(n) { return n == null || n === '' || isNaN(Number(n)) ? '—' : String(R.round1(Number(n))); }
  function partShort(pt) { return PART_SHORT[pt.id] || pt.label; }
  function resultTitle(r) { const t = (state.profile.texts || {})[r]; return (t && t.title) || r || ''; }
  function lateHour() { return R.num((state.profile.params || {}).lateNightStartHour, 22); }
  function adjustSummary(j) {
    return (j.adjustments || []).map(function (ad) { return ADJUST_SHORT[ad.code] || ad.code; }).join('・');
  }
  function liveRuleText(live, id) {
    const hit = ((live && live.items) || []).find(function (i) { return i.id === id; });
    return hit ? hit.text : '';
  }
  function setText(sel, text) { const el = $(sel); if (el) el.textContent = text; }

  // ---------- 入力の段階（docs/SPEC-stages.md。面接前に入力／面接時に確認） ----------
  function stageOf(id) { return R.stageOf(state.profile, id); }
  function isInterview(id) { return stageOf(id) === 'interview'; }
  function sectionOn(id) { return R.sectionActive(state.profile, id); }
  // 段階が「面接時」で、劇場の設定で使われているセクション（INPUT_SECTIONS の順。固定のセクションは含まない）
  function interviewSectionIds() {
    return R.INPUT_SECTIONS.filter(function (s) { return !s.fixed && isInterview(s.id) && sectionOn(s.id); }).map(function (s) { return s.id; });
  }
  // Step2 の留意点一覧に出す項目（面接時の項目の未入力が原因のもの・シフト条件の未確認の集約は「面接で確認すること」で表す）
  function shownItems(h) { return ((h && h.items) || []).filter(function (i) { return !i.deferred && !i.aggregate; }); }
  function laterItems(h) { return ((h && h.items) || []).filter(function (i) { return i.deferred || i.aggregate; }); }
  // 留意点のカテゴリ → 入力セクション（面接時のセクションに属する留意点を Step3 でチェックできるようにする）
  const CATEGORY_SECTION = { busy: 'busy', allNight: 'allNight', lateNight: 'lateNight', foreign: 'foreignDetail' };
  // Step3「面接で入力した内容から出た留意点」：deferred / aggregate 以外で、
  // Step2 までに無かった（または文言が変わった）項目と、段階が面接時のセクションのカテゴリの項目。
  // Step2 に戻らずに Step3 で確認済みにできるようにする（Step2 の一覧と同じ handoffChecks を使う）
  function interviewNewItems(h) {
    const base = state.handoffBase;
    return ((h && h.items) || []).filter(function (i) {
      if (i.deferred || i.aggregate) return false;
      if (base && (!Object.prototype.hasOwnProperty.call(base, i.id) || base[i.id] !== i.text)) return true;
      const sec = CATEGORY_SECTION[i.category];
      return !!sec && isInterview(sec) && sectionOn(sec);
    });
  }
  // 「卒業後も当劇場で継続」の置き場所（'<section>:<stage>'）
  function continueKey() {
    const cs = R.continueSection(state.applicant, state.profile);
    return cs + ':' + stageOf(cs);
  }
  // Step1 で「卒業後も当劇場で継続」を折りたたみ（#preFill）側に置くか
  function continueInPreFill() {
    const cs = R.continueSection(state.applicant, state.profile);
    return isInterview(cs) && sectionOn(cs);
  }

  function bindGlobal() {
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
    $('#btnPrint').addEventListener('click', function () { window.print(); });
    $('#btnTheme').addEventListener('click', toggleTheme);

    const content = $('#stepContent');
    content.addEventListener('input', onFieldEvent);
    content.addEventListener('change', onFieldEvent);
    content.addEventListener('click', onContentClick);

    window.addEventListener('beforeunload', function (e) {
      if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

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
  function showView(view) {
    state.view = view;
    $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    ['judge', 'settings', 'help'].forEach(function (v) { $('#view-' + v).classList.toggle('hidden', v !== view); });
    $('#stepSection').classList.toggle('hidden', view !== 'judge');
    $('#topActions').classList.toggle('hidden', view !== 'judge');
    $('#applicantChip').classList.toggle('hidden', view !== 'judge');
    $('#topTitle').textContent = view === 'judge' ? '応募者判定' : view === 'settings' ? '設定（劇場プロファイル）' : '使い方';

    if (view === 'judge') {
      renderStepNav(); renderStep(); renderSummary();
    } else if (view === 'settings') {
      Settings.render($('#view-settings'), state.profile, {
        current: function () { return state.profile; },
        onSave: function (p) {
          state.profile = S.normalizeProfile(p);
          S.saveProfile(state.profile);
          renderBrand();
          // 新しい繁忙期の項目などに合わせて応募者データのキーを補う
          state.applicant = U.deepMerge(emptyApplicant(state.profile), state.applicant);
          state.handoffStale = true;
          invalidateJudgment();
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
          renderBrand();
          state.applicant = U.deepMerge(emptyApplicant(state.profile), state.applicant);
          state.handoffStale = true;
          invalidateJudgment();
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
  function goStep(n) {
    if (n >= 2 && (!state.handoff || state.handoffStale)) rebuildHandoff();
    if (n === 4) {
      state.judgment = R.evaluateHiring(state.applicant, state.scores, state.profile, state.handoff, state.handoffChecks);
      state.judgmentStale = false;
    }
    state.step = n;
    state.maxStepReached = Math.max(state.maxStepReached, n);
    state.cfSnap = null;   // Step3 を開くたびに「応募時の状態」を取り直す（入力中の再描画では変えない）
    renderStepNav(); renderStep(); renderSummary();
    const top = $('#view-judge').getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  // 判定後に入力・チェック・面接点・設定が変わったら判定を無効にする。
  // Step4 を開くと再判定し、保存時は保存前に再判定する（古い判定を記録に残さない）
  function invalidateJudgment() {
    if (state.judgment) {
      state.judgment = null;
      state.judgmentStale = true;
    }
  }

  // 留意点を作り直す。文言が変わった項目・消えた項目のチェックは外す
  function rebuildHandoff() {
    const old = state.handoff;
    state.handoff = R.buildHandoff(state.applicant, state.profile);
    const now = {};
    state.handoff.items.forEach(function (i) { now[i.id] = i.text; });
    let changed = 0;
    if (old) {
      old.items.forEach(function (i) {
        if (Object.prototype.hasOwnProperty.call(now, i.id) && now[i.id] !== i.text && state.handoffChecks[i.id]) {
          delete state.handoffChecks[i.id];
          changed++;
        }
      });
    }
    Object.keys(state.handoffChecks).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(now, id)) delete state.handoffChecks[id];
    });
    state.handoffStale = false;
    // Step2 までの留意点を基準として覚える（Step3 で入力して新しく出た項目を Step3 でチェックできるようにするため）
    if (state.step < 3 || !state.handoffBase) {
      state.handoffBase = {};
      state.handoff.items.forEach(function (i) { state.handoffBase[i.id] = i.text; });
    }
    if (changed > 0) toast('内容が変わった留意点のチェックを外しました（' + changed + '件）');
  }

  function renderStepNav() {
    $('#stepNav').innerHTML = STEPS.map(function (s) {
      const cls = ['step'];
      if (s.n === state.step) cls.push('current');
      else if (s.n < state.step) cls.push('done');
      if (s.n > state.maxStepReached) cls.push('disabled');
      return '<li class="' + cls.join(' ') + '" data-step="' + s.n + '" role="button" tabindex="0">' +
        '<span class="step-num">' + (s.n < state.step ? '✓' : s.n) + '</span>' +
        '<span><span class="step-label">' + esc(s.label) + '</span><br><span class="step-hint">' + esc(s.hint) + '</span></span></li>';
    }).join('');
  }

  function renderStep() {
    const c = $('#stepContent');
    switch (state.step) {
      case 1: {
        c.innerHTML = inputStepHtml(); applyVisibility(); updateTimeDisplays(); updateContribMeters();
        // toggle はバブリングしないため #preFill に直接付ける（「すべて ○ にする」などの再描画で閉じないよう開閉を覚える）
        const pf = $('#preFill');
        if (pf) pf.addEventListener('toggle', function () { state.preFillOpen = pf.open; });
        break;
      }
      case 2:
        if (!state.handoff || state.handoffStale) rebuildHandoff();
        c.innerHTML = handoffStepHtml(); renderHandoffProgress(); break;
      case 3:
        if (!state.handoff || state.handoffStale) rebuildHandoff();
        c.innerHTML = interviewStepHtml(); updateScoreUI(); applyVisibility(); updateContribMeters(); refreshDeferredItems(); break;
      case 4:
        if (!state.handoff || state.handoffStale) rebuildHandoff();
        if (!state.judgment) {
          state.judgment = R.evaluateHiring(state.applicant, state.scores, state.profile, state.handoff, state.handoffChecks);
          state.judgmentStale = false;
        }
        c.innerHTML = resultStepHtml(); break;
      default: c.innerHTML = '';
    }
  }

  // =====================================================================
  // Step1: 応募情報（フォーム部品）
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
  //   o.bare     … ラベルを出さない（表の行内用）
  function fSeg(path, label, options, o) {
    o = o || {};
    const cur = U.getPath(state.applicant, path) || '';
    return '<div class="field"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + (o.required ? ' data-required-seg="' + esc(path) + '"' : '') + '>' + labelHtml(label, o) +
      '<div class="seg" data-seg="' + esc(path) + '" role="radiogroup" aria-label="' + esc(label) + '">' + options.map(function (op) {
        return '<label class="seg-opt' + (op.tone ? ' tone-' + op.tone : '') + (cur === op.value ? ' on' : '') + '">' +
          '<input type="radio" name="seg-' + esc(path) + '" value="' + esc(op.value) + '" data-field="' + esc(path) + '"' + (cur === op.value ? ' checked' : '') + '><span>' + esc(op.label) + '</span></label>';
      }).join('') + '</div>' +
      (o.hint ? '<div class="hint">' + esc(o.hint) + '</div>' : '') + '</div>';
  }

  const TRI = [{ value: 'ok', label: '○ 可能', tone: 'ok' }, { value: 'consult', label: '△ 要相談', tone: 'warn' }, { value: 'ng', label: '× 不可', tone: 'danger' }];

  function alertHtml(id, tone, ico, textId, html) {
    return '<div class="alert ' + tone + ' hidden" id="' + id + '"><span class="ico">' + ico + '</span><span' + (textId ? ' id="' + textId + '"' : '') + '>' + (html || '') + '</span></div>';
  }

  // 見出し右の「貢献度に反映」＋現在点（ids はカンマ区切りの貢献度項目 id、または total）
  function meterHtml(ids) {
    if (!contribOn()) return '';
    // 面接前に点数を見せない設定（showBeforeInterview=false）では Step1 の見出しにも点数を出さない
    if (hidePointsBeforeInterview()) return '<span class="badge info">貢献度に反映</span>';
    return '<span class="badge info">貢献度に反映</span><span class="contrib-meter" data-meter="' + esc(ids) + '"></span>';
  }

  // 可視の必須欄を検査し、未入力に .invalid を付ける（Step1 と Step3 で共用）
  function checkRequired(scopeSel) {
    const missing = [];
    $$(scopeSel + ' [data-required]').forEach(function (el) {
      const visible = !el.closest('.hidden');
      if (visible && !String(el.value || '').trim()) { el.classList.add('invalid'); missing.push(el); }
      else el.classList.remove('invalid');
    });
    $$(scopeSel + ' [data-required-seg]').forEach(function (fld) {
      const visible = !fld.closest('.hidden');
      const v = U.getPath(state.applicant, fld.getAttribute('data-required-seg'));
      if (visible && !v) { fld.classList.add('invalid'); missing.push(fld); }
      else fld.classList.remove('invalid');
    });
    missing.sort(function (x, y) { return (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1; });
    return missing;
  }

  function timeRowHtml(key, label) {
    const s = state.applicant.shifts[key] || { start: '', end: '', nextDay: false };
    return '<div class="time-row" data-day="' + key + '">' +
      '<div class="time-label">' + esc(label) + '</div>' +
      '<input type="time" data-field="shifts.' + key + '.start" value="' + esc(s.start) + '" aria-label="' + esc(label) + ' 開始">' +
      '<span class="tilde">〜</span>' +
      '<input type="time" data-field="shifts.' + key + '.end" value="' + esc(s.end) + '" aria-label="' + esc(label) + ' 終了">' +
      '<label class="chip chip-sm' + (s.nextDay ? ' on' : '') + '"><input type="checkbox" data-field="shifts.' + key + '.nextDay"' + (s.nextDay ? ' checked' : '') + '><span>翌日</span></label>' +
      '<span class="time-dur" data-dur="' + key + '"></span>' +
    '</div>';
  }

  // 区分プルダウンの表示ラベル（value は変えない）
  function categoryOptions() {
    const p = state.profile;
    return (p.options.categories || []).map(function (c) {
      const st = R.highschoolStatus({ category: c.value }, p);
      let suffix = '';
      if (st.applicable && st.status === 'excluded') suffix = '（原則対象外）';
      else if (st.isExceptionCategory) suffix = '（条件付き）';
      return { value: c.value, label: c.value + suffix };
    });
  }

  // 進路が不採用推奨の対象（rejectCareerPaths）で、判定が不採用推奨まで下がるか（rules.evaluateHiring の highschool_hold と同じ条件）
  function hsRejectsByPath(hs, p) {
    return hs.status === 'exception_unmet' && !!hs.pathReject && ((p || {}).evaluation || {}).holdOnHighschoolException !== false;
  }

  // 高校3年生の例外条件
  function hsExceptionHtml() {
    const p = state.profile;
    const hp = p.highschoolPolicy || {};
    if (hp.mode === 'allow') return '';
    const allowed = hp.allowedCareerPaths || {};
    const rejects = hp.rejectCareerPaths || {};
    const paths = ((p.options || {}).careerPaths || []).map(function (c) {
      return { value: c.value, label: c.label + (allowed[c.value] !== true ? (rejects[c.value] === true ? '（例外対象外・不採用推奨）' : '（例外対象外）') : '') };
    });
    return '<div class="subpanel hidden" id="grp-hs-exception">' +
      '<div class="subpanel-head"><h3>高校3年生の例外条件</h3><span class="badge warn" id="hsExceptionStatus">未入力あり</span></div>' +
      '<div class="field-row">' +
        fSeg('highschool.careerDecided', '進路', [{ value: 'yes', label: '決定済み', tone: 'ok' }, { value: 'no', label: '未決定', tone: 'danger' }]) +
        fSelect('highschool.careerPath', '進路の種別', paths, { id: 'grp-hs-path' }) +
      '</div>' +
      fInput('highschool.destination', '進学先（任意）', { placeholder: '例：〇〇大学 文学部（指定校推薦で合格）', id: 'grp-hs-dest' }) +
      '<div class="hint">進路決定済み（進学）・卒業後も継続する（上の「卒業後も当劇場で継続」）の両方がそろった場合のみ例外として選考対象です。満たさない場合も入力は続けられ、採用担当が判断します。</div>' +
      '<div class="hint hs-reasons" id="hsExceptionReasons"></div>' +
    '</div>';
  }

  // 繁忙期・土日祝の入力欄（Step1 と Step3 で共用。req=true で判定前の必須扱い）
  function busyFieldsHtml(req) {
    const p = state.profile;
    const f = p.features || {};
    const o = p.options || {};
    let html = '';
    const row = [];
    if (f.weekendFreq) row.push(fSelect('weekendFreq', '土日の出勤頻度', o.weekendFrequencies || [], { id: 'grp-weekend-freq', required: req }));
    if (f.holidayWork) row.push(fSeg('holidayWork', '祝日（平日の祝日・振替休日）の勤務', TRI, { id: 'grp-holiday', required: req }));
    if (row.length) html += '<div class="field-row">' + row.join('') + '</div>';

    const items = R.busyItems(p);
    if (f.vacation && items.length) {
      html += '<div class="busy-head"><h4>繁忙期ごとの可否' + (f.vacationDays ? 'と出られる日数の目安' : '') + '</h4><div class="spacer"></div>' +
          '<button type="button" class="btn sm" data-action="busy-all-ok">すべて ○ にする</button>' +
          '<button type="button" class="btn sm ghost" data-action="busy-clear">未確認に戻す</button>' +
        '</div>' +
        '<div class="busy-table' + (f.vacationDays ? '' : ' no-days') + '">' + items.map(function (v) {
          const r = !!req && v.weight > 0;
          return '<div class="busy-row" data-busy="' + esc(v.id) + '">' +
            '<div class="busy-label"><div><b>' + esc(v.label) + '</b>' +
              (v.critical && v.weight > 0 ? ' <span class="badge warn">重点</span>' : '') +
              (v.weight <= 0 ? ' <span class="badge">記録のみ</span>' : '') +
              (r ? '<span class="req">*</span>' : '') + '</div>' +
              (v.periodNote ? '<div class="hint">' + esc(v.periodNote) + '</div>' : '') + '</div>' +
            fSeg('vacation.' + v.id, v.label, TRI, { bare: true, required: r }) +
            (f.vacationDays
              ? fInput('vacationDays.' + v.id, '', { type: 'number', min: 0, max: v.maxDays, step: 1, suffix: R.UNIT_LABEL[v.unit] + '（満点' + v.refDays + '）', id: 'grp-vdays-' + v.id, placeholder: '日数', required: r, ariaLabel: v.label + ' の日数' })
              : '') +
          '</div>';
        }).join('') + '</div>';
    }
    return html;
  }

  // オールナイト上映の入力欄（Step1 と Step3 で共用）
  function allNightFieldsHtml(req) {
    const p = state.profile;
    const o = p.options || {};
    const night = R.nightStatus(state.applicant, p);
    return alertHtml('allNightLegal', 'danger', '⚠', 'allNightLegalText') +
      fSeg('allNight.availability', 'オールナイトのシフト', TRI, { id: 'grp-allnight-avail', required: !!req && !night.restricted }) +
      '<div class="field-row">' +
        fSelect('allNight.frequency', '入れる頻度', o.allNightFrequencies || [], { id: 'grp-allnight-freq', required: req }) +
        fInput('allNight.note', '条件・メモ', { id: 'grp-allnight-note', placeholder: '例：金曜のみ、始発で帰宅' }) +
      '</div>' +
      alertHtml('allNightConflict', 'warn', '⚠', 'allNightConflictText');
  }

  function allNightIntroText() {
    const p = state.profile;
    const prm = p.params || {};
    return U.fill((p.texts || {}).allNightIntro || '', {
      allNightShiftStart: prm.allNightShiftStart, allNightShiftEnd: prm.allNightShiftEnd, lateNightStartHour: lateHour()
    });
  }

  // ---------- 入力部品（Step1 本体・Step1 の折りたたみ・Step3 で共用。副作用なし） ----------
  // 1 画面に同じ data-field・同じ id を 2 回描かない（描画場所は inputStepHtml / preFillHtml / interviewConfirmHtml の規則で一意）
  function commuteFieldsHtml(req) {
    const o = state.profile.options || {};
    return '<div class="field-row cols-3">' +
        fSelect('commuteMethod', '通勤方法', o.commuteMethods, { required: req }) +
        fInput('commuteMinutes', '通勤時間', { type: 'number', min: 1, max: 240, suffix: '分', required: req }) +
        fInput('nearestStation', '最寄り駅／バス停', { id: 'grp-station', list: 'stationHints', placeholder: '例：新宿', hint: '乗換案内で所要時間・終電も確認しておくと面接がスムーズです。' }) +
      '</div>' +
      '<datalist id="stationHints">' + (o.stationHints || []).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>';
  }

  function continueFieldHtml() {
    return fSeg('continueAfterGraduation', '卒業後も当劇場で継続', CONTINUE_OPTS, { id: 'grp-continue', hint: '進学・就職後もアルバイトを続ける意思（任意）。高校3年生の例外判定と勤務期間の見込みに使います。' });
  }

  function foreignFlagHtml() {
    return fSeg('foreign.isForeign', '外国籍', [{ value: 'no', label: '該当しない' }, { value: 'yes', label: '該当する', tone: 'warn' }], { id: 'grp-foreign-flag' });
  }

  function foreignDetailHtml() {
    const o = state.profile.options || {};
    return '<div id="grp-foreign-detail">' +
        '<div class="field-row">' +
          fSelect('foreign.residenceStatus', '在留資格', o.residenceStatuses) +
          fSelect('foreign.workPermit', '資格外活動許可', o.workPermitStates) +
        '</div>' +
        '<div class="field-row">' +
          fInput('foreign.residenceExpiry', '在留期限', { type: 'month' }) +
          fSelect('foreign.japaneseLevel', '日本語レベル', o.japaneseLevels) +
        '</div>' +
      '</div>';
  }

  function sideJobFieldsHtml() {
    const prm = state.profile.params || {};
    return fSeg('sideJob', 'かけもち', [{ value: 'no', label: 'なし' }, { value: 'yes', label: 'あり', tone: 'warn' }]) +
      '<div id="grp-sidejob-detail"><div class="field-row">' +
        fInput('sideJobDetail', 'かけもち先・勤務内容など', { placeholder: '例：コンビニ 週2日' }) +
        fInput('sideJobHoursPerWeek', 'かけもち先の週あたり時間', { type: 'number', min: 0, max: 60, step: 1, suffix: '時間/週', hint: '外国籍の方は週' + esc(prm.foreignWeeklyHourCap || 28) + '時間の判定に合算します' }) +
      '</div></div>';
  }

  // 深夜帯の入力欄（req=true で可否を判定前の必須扱い。法令・運用で対象外のときは必須にしない）
  function lateNightFieldsHtml(req) {
    const p = state.profile;
    const f = p.features || {};
    const o = p.options || {};
    const prm = p.params || {};
    const night = R.nightStatus(state.applicant, p);
    return alertHtml('lateNightLegal', 'danger', '⚠', 'lateNightLegalText') +
      '<div class="field-row">' +
        fSeg('lateNight.availability', lateHour() + '時以降の勤務', TRI, { required: !!req && !night.restricted }) +
        fSelect('lateNight.returnMethod', '深夜帯の帰宅手段', o.returnMethods) +
      '</div>' +
      '<div class="field-row">' +
        fInput('lateNight.lastTrain', '終電時刻（劇場最寄り駅 → 自宅方面の最終）', { type: 'time', id: 'grp-lasttrain', hint: R.num(prm.dayBoundaryHour, 5) + ':00 より前の時刻は翌日として扱います。' }) +
        (f.taxi ? fInput('lateNight.taxiFare', 'タクシー料金の目安（自宅まで）', { type: 'number', min: 0, step: 100, suffix: '円', id: 'grp-taxi', hint: '規定金額: ' + Number(prm.taxiLimitYen || 0).toLocaleString('ja-JP') + '円' }) : '') +
      '</div>' +
      alertHtml('lastTrainWarn', 'warn', '⚠', 'lastTrainWarnText');
  }

  function lateNightIntroText() {
    return 'クローズ要員の見込みと、帰宅手段を確認します。' + (feat().allNight ? 'オールナイト（翌朝までの通し）は「オールナイト上映」で別に確認します。' : '');
  }

  function extrasFieldsHtml() {
    const f = feat();
    const o = state.profile.options || {};
    const extras = [];
    if (f.department) extras.push(fSelect('department', '希望部署', o.departments));
    if (f.applicationRoute) extras.push(fSelect('applicationRoute', '応募経路', o.applicationRoutes));
    return extras.length ? '<div class="field-row">' + extras.join('') + '</div>' : '';
  }

  // Step1 の折りたたみ「面接前に分かっている項目があれば入力（任意）」。段階が面接時のセクションを同じ部品で（必須なし・メーターなし）
  function preFillHtml() {
    const p = state.profile;
    const a = state.applicant;
    const texts = p.texts || {};
    const ids = interviewSectionIds();
    if (!ids.length) return '';
    const cs = R.continueSection(a, p);
    // title が空なら見出しを省く（1 項目だけのセクションは欄のラベルが見出しを兼ねる）
    const sec = function (id, domId, title, body) {
      return '<div class="prefill-sec' + (title ? '' : ' single') + '" data-section="' + esc(id) + '" id="' + esc(domId) + '">' +
        (title ? '<h3 class="sub">' + esc(title) + '</h3>' : '') + body + '</div>';
    };
    const blocks = [];
    ids.forEach(function (id) {
      const label = R.sectionLabel(p, id);
      switch (id) {
        case 'hsException':
          blocks.push(sec(id, 'pf-hsException', label, (cs === 'hsException' ? continueFieldHtml() : '') + hsExceptionHtml()));
          break;
        case 'continuation':
          if (cs === 'continuation') blocks.push(sec(id, 'pf-continuation', '', continueFieldHtml()));
          break;
        case 'foreignFlag':
          // 該当の有無が面接時なら詳細も面接時（1 ブロックにまとめる）
          blocks.push(sec('foreign', 'pf-foreign', '', foreignFlagHtml() + foreignDetailHtml()));
          break;
        case 'foreignDetail':
          if (!isInterview('foreignFlag')) blocks.push(sec(id, 'pf-foreignDetail', label, foreignDetailHtml()));
          break;
        case 'commute':
          blocks.push(sec(id, 'pf-commute', label, commuteFieldsHtml(false)));
          break;
        case 'sideJob':
          blocks.push(sec(id, 'pf-sideJob', '', sideJobFieldsHtml()));
          break;
        case 'busy':
          blocks.push(sec(id, 'busyCard', label, '<p class="hint">' + esc(texts.busyIntro || '') + '</p>' + busyFieldsHtml(false)));
          break;
        case 'lateNight':
          blocks.push(sec(id, 'lateNightCard', label, '<p class="hint">' + esc(lateNightIntroText()) + '</p>' + lateNightFieldsHtml(false)));
          break;
        case 'allNight':
          blocks.push(sec(id, 'allNightCard', label, '<p class="hint">' + esc(allNightIntroText()) + '</p>' + allNightFieldsHtml(false)));
          break;
        case 'extras':
          blocks.push(sec(id, 'pf-extras', label, extrasFieldsHtml()));
          break;
        default:
          break;
      }
    });
    const hasInput = ids.some(function (id) { return R.sectionHasInput(a, p, id); });
    const so = p.stageOptions || {};
    const open = so.preFillAlwaysOpen === true || (state.preFillOpen != null ? state.preFillOpen : hasInput);
    const names = preFillNames();
    return '<details class="card prefill" id="preFill"' + (open ? ' open' : '') + '>' +
      '<summary><span class="prefill-title">' + esc(texts.preFillTitle || '面接前に分かっている項目があれば入力（任意）') + '</span>' +
        '<span class="badge info hidden" id="preFillCount"></span>' +
        '<span class="hint prefill-list">' + esc(names.join('／')) + '</span></summary>' +
      '<div class="prefill-body"><p class="hint">' + esc(texts.preFillHint || '') + '</p>' + blocks.join('') + '</div>' +
    '</details>';
  }

  // #preFill の summary に出すセクション名（この応募者に関係するものだけ。applyVisibility で入力に合わせて更新）
  function preFillNames() {
    const p = state.profile;
    const a = state.applicant;
    return interviewSectionIds().filter(function (id) {
      if (id === 'foreignDetail' && isInterview('foreignFlag')) return false;   // 「外国籍」のブロックにまとめる
      return id === 'foreignFlag' || R.sectionRelevant(a, p, id);
    }).map(function (id) { return id === 'foreignFlag' ? '外国籍' : R.sectionLabel(p, id); });
  }

  function inputStepHtml() {
    const a = state.applicant;
    const p = state.profile;
    const o = p.options;
    const f = p.features;
    const prm = p.params;
    const texts = p.texts || {};
    const so = p.stageOptions || {};
    const hasLater = interviewSectionIds().length > 0;
    state.continueAt = continueKey();
    const continueHere = !continueInPreFill();

    let html = '';

    // 基本情報（固定）＋ 面接前の高校生の例外条件・外国籍（該当の有無）
    let foreignHtml = '';
    if (f.foreignNational && !isInterview('foreignFlag')) {
      foreignHtml = foreignFlagHtml() +
        (isInterview('foreignDetail')
          ? alertHtml('foreignStageHint', 'info', 'ℹ', '', '在留資格・資格外活動許可・在留期限・日本語レベルは面接で確認します。在留カードの持参を依頼してください（分かっていれば下の折りたたみに入力できます）。')
          : foreignDetailHtml());
    }
    html += '<div class="card" id="basicCard"><div class="card-head"><h2>基本情報</h2><p>面接に進めるかを判断するための項目です（目安 2〜3 分）。<span class="req">*</span> は必須です。' +
        (hasLater ? esc(laterSummaryText()) + 'は面接で確認します（分かっていれば下の折りたたみから入力できます）。' : '分からない項目は空欄のまま進めれば、面接での確認事項として申し送られます。') + '</p></div>' +
      '<div class="field-row">' +
        fInput('name', '応募者名', { required: true, placeholder: '例：山田 太郎', autocomplete: 'off' }) +
        fSelect('gender', '性別', o.genders) +
      '</div>' +
      '<div class="field-row cols-3">' +
        fInput('age', '年齢', { type: 'number', min: 15, max: 99, step: 1, suffix: '歳', required: true }) +
        fSelect('category', '区分', categoryOptions(), { required: true }) +
        (f.graduationDate ? fInput('graduationDate', '卒業予定年月', { type: 'month', id: 'grp-graduation' }) : '') +
      '</div>' +
      alertHtml('hsPolicyAlert', 'danger', '⛔', 'hsPolicyAlertText') +
      alertHtml('minorNotice', 'info', 'ℹ', '', '18歳未満：22:00〜翌5:00の勤務・オールナイトはできません（労働基準法第61条）。') +
      alertHtml('ageCategoryWarn', 'warn', '⚠', 'ageCategoryWarnText') +
      // 高3の例外判定（決定事項 B）に必須のため、卒業予定年月の ON/OFF に関係なく描画する（表示条件は applyVisibility）。
      // 段階が面接時のセクションに属するときは折りたたみ側に置く（state.continueAt）
      (continueHere ? continueFieldHtml() : '') +
      (!isInterview('hsException') ? hsExceptionHtml() : '') +
      foreignHtml +
    '</div>';

    if (!isInterview('commute')) {
      html += '<div class="card" id="commuteCard"><div class="card-head"><h2>通勤</h2></div>' + commuteFieldsHtml(true) + '</div>';
    }

    html += '<div class="card" id="workCard"><div class="card-head"><h2>勤務条件</h2></div>' +
      '<div class="field"><label>勤務可能曜日<span class="req">*</span></label>' +
        '<div class="chip-group" id="dayChips">' +
          R.DAYS.map(function (d) {
            const on = a.workDays.indexOf(d.key) >= 0;
            return '<label class="chip' + (on ? ' on' : '') + '"><input type="checkbox" data-field="workDays" data-array value="' + d.key + '"' + (on ? ' checked' : '') + '><span>' + d.label + '</span></label>';
          }).join('') +
          '<label class="chip chip-any' + (a.anyDay ? ' on' : '') + '"><input type="checkbox" data-field="anyDay"' + (a.anyDay ? ' checked' : '') + '><span>曜日問わず</span></label>' +
        '</div></div>' +
      '<div class="field-row">' +
        fInput('daysMin', '週の最低勤務日数', { type: 'number', min: 1, max: 7, step: 1, suffix: '日' }) +
        fInput('daysMax', '週の最大勤務日数', { type: 'number', min: 1, max: 7, step: 1, suffix: '日', required: so.requireDaysMax === true }) +
      '</div>' +
      alertHtml('daysError', 'danger', '⚠', '', '週の最低勤務日数が最大勤務日数を上回っています。') +
      alertHtml('daysWarn', 'warn', '⚠', 'daysWarnText') +
      '<div class="field"><label>勤務希望時間<span class="req">*</span></label>' +
        '<div class="time-rows" id="timeRows">' +
          timeRowHtml('any', '曜日問わず') +
          R.DAYS.map(function (d) { return timeRowHtml(d.key, d.label + '曜'); }).join('') +
          '<div class="time-empty" id="timeEmpty">勤務可能曜日を選ぶと、曜日ごとの時間入力欄が表示されます。</div>' +
        '</div>' +
        '<div class="hint">終了時間が開始時間より早い場合は自動的に「翌日」扱いになります。</div>' +
        alertHtml('hsWarn', 'danger', '⚠', '', '高校生は ' + esc(prm.highschoolLatestEnd || '22:00') + ' を超える勤務はできません。入力内容を確認してください。') +
      '</div>' +
      '<div class="field-row">' +
        fSelect('workPeriod', '勤務期間', o.workPeriods, { required: true }) +
      '</div>' +
      (!isInterview('sideJob') ? sideJobFieldsHtml() : '') +
    '</div>';

    if (sectionOn('busy') && !isInterview('busy')) {
      html += '<div class="card" id="busyCard"><div class="card-head"><h2>繁忙期・土日祝</h2><div class="spacer"></div>' + meterHtml('busy,weekend,holiday') +
        '<p>' + esc(texts.busyIntro || '') + '</p></div>' +
        busyFieldsHtml(false) +
      '</div>';
    }

    if (sectionOn('lateNight') && !isInterview('lateNight')) {
      html += '<div class="card" id="lateNightCard"><div class="card-head"><h2>' + esc(R.sectionLabel(p, 'lateNight')) + '</h2><div class="spacer"></div>' + meterHtml('close') +
        '<p>' + esc(lateNightIntroText()) + '</p></div>' +
        lateNightFieldsHtml(false) +
      '</div>';
    }

    if (sectionOn('allNight') && !isInterview('allNight')) {
      html += '<div class="card" id="allNightCard"><div class="card-head"><h2>オールナイト上映</h2><div class="spacer"></div>' + meterHtml('allNight') +
        '<p>' + esc(allNightIntroText()) + '</p></div>' +
        allNightFieldsHtml(false) +
      '</div>';
    }

    if (sectionOn('extras') && !isInterview('extras')) {
      html += '<div class="card" id="extrasCard"><div class="card-head"><h2>' + esc(R.sectionLabel(p, 'extras')) + '</h2></div>' + extrasFieldsHtml() + '</div>';
    }

    html += preFillHtml();

    html += '<div class="card notes-card" id="notesCard"><div class="card-head"><h2>面接者への申し送りコメント</h2><p>' + esc(texts.reviewerNotesIntro || '') + '</p></div>' +
      fTextarea('reviewerNotes', 'コメント（任意）', { rows: 4, placeholder: '例：電話の受け答えが丁寧。土曜は月2回なら可と話していた。家族の介護で急な休みがあり得るとのこと。通勤経路を面接で確認してほしい。' }) +
    '</div>';

    html += '<div class="actions end"><button type="button" class="btn primary" data-action="generate-handoff">留意点を生成して申し送りへ →</button></div>';
    return html;
  }

  // Step1 見出しの説明に使う「面接で確認する項目」の要約（例: 繁忙期・土日祝・深夜帯（22時以降）・オールナイト上映・かけもちなど）
  function laterSummaryText() {
    const p = state.profile;
    const names = interviewSectionIds().filter(function (id) { return ['busy', 'lateNight', 'allNight', 'sideJob'].indexOf(id) >= 0; })
      .map(function (id) { return R.sectionLabel(p, id); });
    if (!names.length) names.push.apply(names, interviewSectionIds().slice(0, 3).map(function (id) { return R.sectionLabel(p, id); }));
    return names.join('・') + 'など';
  }

  function show(sel, on) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (el) el.classList.toggle('hidden', !on);
  }

  // 表示/非表示と、入力に応じて変わる注意書きをここに集約する（Step1・Step3 共通。無い要素は無視）
  function applyVisibility() {
    const a = state.applicant;
    const p = state.profile;
    const f = p.features || {};
    const prm = p.params || {};
    const group = R.categoryGroup(p, a.category);
    const isStudent = R.isStudentGroup(group);
    const ln = a.lateNight || {};
    const an = a.allNight || {};
    const hsA = a.highschool || {};

    show('#grp-graduation', !!f.graduationDate && isStudent);
    show('#grp-station', a.commuteMethod === '公共交通機関');
    show('#grp-sidejob-detail', a.sideJob === 'yes');
    $$('.time-row[data-day]').forEach(function (row) {
      const k = row.dataset.day;
      show(row, k === 'any' ? a.anyDay : (!a.anyDay && a.workDays.indexOf(k) >= 0));
    });
    show('#timeEmpty', !a.anyDay && a.workDays.length === 0);
    show('#grp-lasttrain', ln.returnMethod === 'train');
    show('#grp-taxi', !!f.taxi && ln.returnMethod === 'taxi');
    show('#grp-foreign-detail', (a.foreign || {}).isForeign === 'yes');
    show('#foreignStageHint', (a.foreign || {}).isForeign === 'yes' && R.stageOf(p, 'foreignDetail') === 'interview');
    // 折りたたみ（Step1）・面接で確認する項目（Step3）のセクションごとのブロック：この応募者に関係するものだけ
    $$('.prefill-sec[data-section], .confirm-sec[data-section]').forEach(function (el) {
      const id = el.getAttribute('data-section');
      // 外国籍：該当の有無の欄があるか、該当する（詳細を聞く）ときだけ
      const vis = id === 'foreign' ? (!!el.querySelector('[data-field="foreign.isForeign"]') || (a.foreign || {}).isForeign === 'yes')
        : id === 'days' || R.sectionRelevant(a, p, id);
      show(el, vis);
    });
    const pfList = $('#preFill .prefill-list');
    if (pfList) pfList.textContent = preFillNames().join('／');
    const pfCount = $('#preFillCount');
    if (pfCount) {
      const filled = interviewSectionIds().filter(function (id) { return R.sectionHasInput(a, p, id); })
        .map(function (id) { return R.sectionLabel(p, id); });
      pfCount.textContent = filled.length ? '入力あり：' + filled.join('・') : '';
      show(pfCount, filled.length > 0);
    }

    const sh = R.analyzeShifts(a, p);
    const hs = R.highschoolStatus(a, p);
    const night = R.nightStatus(a, p);
    const limit = R.toMinutes(prm.highschoolLatestEnd || '22:00');
    show('#hsWarn', group === 'highschool' && sh.latestEndAbs != null && limit != null && sh.latestEndAbs > limit);

    // 高校生の方針
    show('#hsPolicyAlert', hs.status === 'excluded');
    if (hs.status === 'excluded') {
      const el = $('#hsPolicyAlertText');
      if (el) el.innerHTML = '<b>原則対象外</b>：' + esc(a.category) + 'は当劇場の採用対象外です。' + esc((p.highschoolPolicy || {}).notice || '') +
        ' 入力は続けられます（申し送りに「要判断」として記載されます）。';
    }
    show('#minorNotice', night.isMinor);
    const ac = R.ageCategoryCheck(a, p);
    show('#ageCategoryWarn', ac.mismatch);
    if (ac.mismatch) setText('#ageCategoryWarnText', '年齢' + a.age + '歳と区分「' + a.category + '」が一致しません（想定 ' + ac.ageRange + '）。入力を確認してください。');
    show('#grp-hs-exception', hs.isExceptionCategory);
    // 卒業後の継続：卒業予定年月が OFF でも、高3例外の対象区分なら必ず表示する
    show('#grp-continue', isStudent && (f.graduationDate !== false || hs.isExceptionCategory));
    show('#grp-hs-path', hsA.careerDecided === 'yes');
    show('#grp-hs-dest', hsA.careerDecided === 'yes');
    const pill = $('#hsExceptionStatus');
    if (pill) {
      const m = { exception_met: ['ok', '例外対象（条件充足）'], exception_unmet: ['danger', hsRejectsByPath(hs, p) ? '例外の対象外（不採用推奨）' : '例外条件 未充足（要判断）'], exception_incomplete: ['warn', '未入力あり'] }[hs.status] || ['', ''];
      pill.className = 'badge ' + m[0];
      pill.textContent = m[1];
    }
    setText('#hsExceptionReasons', hs.isExceptionCategory && hs.reasonsText ? '不足・未充足: ' + hs.reasonsText : '');

    // 週の勤務日数
    const dc = R.weeklyDaysCheck(a);
    show('#daysError', dc.order);
    show('#daysWarn', dc.mismatch && !dc.order);
    if (dc.mismatch) setText('#daysWarnText', '勤務可能曜日は' + dc.dayCount + '日分ですが、週の最大勤務日数が' + dc.claimDays + '日です。実際に入れる曜日と日数を確認してください。');

    // 繁忙期・土日祝
    show('#grp-weekend-freq', !!f.weekendFreq && sh.weekendCount > 0);
    R.busyItems(p).forEach(function (v) {
      show(document.getElementById('grp-vdays-' + v.id), !!f.vacationDays && R.isTri((a.vacation || {})[v.id]));
    });

    // 深夜帯・オールナイト
    show('#lateNightLegal', night.restricted);
    if (night.restricted) {
      setText('#lateNightLegalText', night.isMinor
        ? '18歳未満は22:00〜翌5:00の勤務ができません（労働基準法第61条）。'
        : '高校在学中は当劇場の運用で' + (prm.highschoolLatestEnd || '22:00') + '以降の勤務はできません（卒業まで）。');
    }
    show('#allNightLegal', night.restricted);
    if (night.restricted) {
      setText('#allNightLegalText', night.reason + 'のため、オールナイト勤務はできません（貢献度は0点で計算）。' +
        (R.isTri(an.availability) ? '入力済みの「' + R.TRI_LABELS[an.availability] + '」は無効として扱います。' : ''));
    }
    show('#grp-allnight-freq', R.isTri(an.availability) && !night.restricted);
    show('#grp-allnight-note', R.isTri(an.availability) && !night.restricted);

    // ルールと同じ条件・文言の注意書き（ルールが OFF でも表示する）
    if ($('#allNightConflict') || $('#lastTrainWarn')) {
      const ctx = R.buildContext(a, p);
      const live = R.buildHandoff(a, p);
      let conflict = false;
      try { conflict = !!R.CONDITIONS.allnight_latenight_conflict(ctx); } catch (e) { conflict = false; }
      show('#allNightConflict', conflict);
      if (conflict) {
        setText('#allNightConflictText', liveRuleText(live, 'allnight_latenight_conflict') ||
          'オールナイトは「' + R.TRI_LABELS[an.availability] + '」ですが、' + lateHour() + '時以降の勤務は「× 不可」です。終電の都合による不可であれば、始発帰宅のオールナイトは可能か確認してください。');
      }
      const lt = ctx.lastTrain;
      show('#lastTrainWarn', !!lt.conflict);
      if (lt.conflict) {
        setText('#lastTrainWarnText', liveRuleText(live, 'late_night_last_train_early') ||
          '希望シフトの最も遅い終了（' + R.fmtAbs(lt.compareEndAbs) + '）から終電（' + ln.lastTrain + '）まで' + R.num(prm.lastTrainBufferMinutes, 15) + '分の余裕がありません。クローズ後に帰宅できるか、終了時刻の調整・帰宅手段を確認してください。');
      }
    }
  }

  function updateTimeDisplays() {
    const late = lateHour() * 60;
    $$('.time-row[data-day]').forEach(function (row) {
      const k = row.dataset.day;
      const s = state.applicant.shifts[k];
      const out = row.querySelector('[data-dur]');
      if (!s || !out) return;
      const sm = R.toMinutes(s.start), em = R.toMinutes(s.end);
      // 終了<開始なら自動で翌日に
      if (sm != null && em != null && em < sm && !s.nextDay) {
        s.nextDay = true;
        const cb = row.querySelector('input[type="checkbox"]');
        if (cb) { cb.checked = true; cb.closest('.chip').classList.add('on'); }
      }
      const min = R.duration(s.start, s.end, s.nextDay);
      if (min == null) { out.textContent = ''; out.classList.remove('late'); return; }
      const endAbs = sm + min;
      // 深夜帯（劇場の開始時刻〜翌5:00）と重なるか。早朝勤務（0:30〜5:00 など）も検出する
      const isLate = R.periodicOverlap(sm, endAbs, late, 1440 + R.LAW.NIGHT_END) > 0;
      let txt = R.fmtDuration(min);
      if (s.nextDay) txt += '（翌' + s.end + 'まで）';
      if (isLate) txt += ' ・深夜帯あり';
      out.textContent = txt;
      out.classList.toggle('late', isLate);
    });
  }

  // 貢献度のライブ表示（Step1 のカード見出し・Step3 の確認カード）
  function updateContribMeters() {
    const meters = $$('[data-meter]');
    const status = $('#shiftConfirmStatus');
    if (!meters.length && !status) return;
    const p = state.profile;
    const c = R.computeContribution(state.applicant, p);
    meters.forEach(function (el) {
      const key = el.getAttribute('data-meter');
      if (key === 'total') {
        el.textContent = fmtNum(c.total) + ' / ' + fmtNum(c.max) + '（' + (c.bandLabel || '—') + (c.incomplete ? '・暫定' : '') + '）';
        el.className = 'contrib-meter ' + (BAND_TONE[c.band] || '');
        return;
      }
      const txt = key.split(',').map(function (id) {
        const pt = c.parts.find(function (x) { return x.id === id; });
        return pt && pt.applicable ? partShort(pt) + ' ' + fmtNum(pt.score) + '/' + fmtNum(pt.max) : '';
      }).filter(Boolean).join('・');
      el.textContent = txt;
      show(el, !!txt);
    });
    if (status) {
      const co = p.contribution || {};
      const strict = contribOn() && c.enabled && co.requireComplete !== false;
      const shiftOn = shiftConfirmOn();
      const hs = R.highschoolStatus(state.applicant, p);
      const hsMissing = hs.isExceptionCategory ? hs.missing : [];
      const lines = [];
      if (shiftOn && c.missing.length) {
        lines.push('未確認：' + esc(c.missing.join('・')) + '。' + (strict ? '判定の前に入力してください。' : '面接で確認できた項目を入力してください。'));
      }
      // 面接時の項目のうち、空欄のままだと留意点（確認事項）が残るもの（判定は止めない）
      const cf = R.interviewConfirm(state.applicant, p);
      const bySec = [];
      cf.sections.forEach(function (s) {
        if (!s.toAsk || s.id === 'hsException') return;
        const chk = s.missing.filter(function (m) { return m.level === 'check'; });
        if (chk.length) bySec.push(s.label + '：' + chk.map(function (m) { return m.label; }).join('、'));
      });
      if (bySec.length) {
        lines.push('未入力（判定は止めません）：' + esc(bySec.join('／')) + '。未入力のまま判定すると確認事項として残ります。');
      }
      // 上の 2 行に出ない、面接で確認する項目の空欄（記録用の項目・シフト条件を確定しない劇場の繁忙期など）。
      // 「すべて確認済み」はこれらが無くなったときだけにする（Step2「面接で確認すること」と食い違わないように）
      const notYet = [];
      cf.sections.forEach(function (s) {
        if (!s.toAsk || s.id === 'hsException') return;
        const rest = s.missing.filter(function (m) { return m.level === 'optional' || (m.level === 'required' && !shiftOn); });
        if (!rest.length) return;
        notYet.push(s.hasInput ? s.label + '（' + rest.map(function (m) { return m.label; }).join('、') + '）' : s.label);
      });
      const noteLine = notYet.length ? 'まだ入力のない項目（判定は止めません）：' + esc(notYet.join('／')) + '。面接で確認して入力してください。' : '';
      if (hsMissing.length) {
        // 高校生の例外は判定を止めない（決定事項 B）。未入力のままだと上長最終判断要になる旨を示す。
        // ただし進路が不採用推奨の対象（就職など）なら、入力に関係なく不採用推奨になる
        lines.push('高3例外: ' + esc(hsMissing.join('・')) + 'が未入力です' + (hsRejectsByPath(hs, p)
          ? '（進路『' + esc(hs.pathLabel) + '』は例外の対象外のため、入力に関係なく判定は不採用推奨になります）。'
          : '（未入力のまま判定すると上長最終判断要になります）。'));
      }
      if (lines.length) {
        if (noteLine) lines.push(noteLine);
        status.className = 'alert warn';
        status.innerHTML = '<span class="ico">⚠</span><span>' + lines.join('<br>') + '</span>';
      } else if (noteLine) {
        status.className = 'alert info';
        status.innerHTML = '<span class="ico">ℹ</span><span>' + noteLine + '</span>';
      } else {
        status.className = 'alert ok';
        const hsOnly = status.getAttribute('data-mode') === 'hs';
        status.innerHTML = '<span class="ico">✓</span><span>' + (hsOnly ? '例外条件はすべて入力済みです。' : '面接で確認する項目はすべて確認済みです。') + '</span>';
      }
    }
  }

  function onFieldEvent(e) {
    const t = e.target;
    if (!t || !t.dataset) return;

    if (t.hasAttribute && t.hasAttribute('data-stamp-select')) {
      const inp = t.closest('.stamp-box').querySelector('.stamp-free');
      if (inp) { inp.classList.toggle('hidden', t.value !== '__free'); if (t.value === '__free') inp.focus(); }
      return;
    }

    if (t.dataset.field) {
      const path = t.dataset.field;
      if (t.type === 'checkbox' && t.hasAttribute('data-array')) {
        const arr = (U.getPath(state.applicant, path) || []).slice();
        const i = arr.indexOf(t.value);
        if (t.checked && i < 0) arr.push(t.value);
        if (!t.checked && i >= 0) arr.splice(i, 1);
        U.setPath(state.applicant, path, arr);
      } else if (t.type === 'checkbox') {
        U.setPath(state.applicant, path, t.checked);
      } else if (t.type === 'radio') {
        if (!t.checked) return;
        U.setPath(state.applicant, path, t.value);
        const seg = t.closest('.seg');
        if (seg) $$('.seg-opt', seg).forEach(function (l) { l.classList.toggle('on', l.contains(t)); });
      } else {
        let val = t.value;
        // 繁忙期の日数は 0〜上限の整数に丸める（変わったら入力欄にも書き戻す）
        if (path.indexOf('vacationDays.') === 0 && val !== '') {
          const id = path.slice('vacationDays.'.length);
          const it = R.busyItems(state.profile).find(function (v) { return v.id === id; });
          const n = Number(val);
          if (it && !isNaN(n)) {
            const c = String(Math.min(it.maxDays, Math.max(0, Math.floor(n))));
            if (c !== val) { val = c; t.value = c; }
          }
        }
        U.setPath(state.applicant, path, val);
      }
      const chip = t.closest('.chip');
      if (chip && t.type === 'checkbox') chip.classList.toggle('on', t.checked);
      if (t.hasAttribute('data-required') || path === 'daysMin' || path === 'daysMax') t.classList.remove('invalid');
      const fld = t.closest('.field.invalid');
      if (fld && U.getPath(state.applicant, path)) fld.classList.remove('invalid');
      state.dirty = true;
      state.handoffStale = true;
      invalidateJudgment();
      // 区分の変更で「卒業後も当劇場で継続」の置き場所（基本情報／折りたたみ）が変わるときだけ Step1 を描き直す
      if (state.step === 1 && path === 'category' && continueKey() !== state.continueAt) {
        const y = window.scrollY;
        renderStep();
        window.scrollTo(0, y);
        const el = $('[data-field="category"]');
        if (el) el.focus();
        renderSummary();
        return;
      }
      applyVisibility();
      updateTimeDisplays();
      updateContribMeters();
      if (state.step === 3) { refreshUnresolvedAlert(); refreshDeferredItems(); }
      renderSummary();
      return;
    }

    if (t.dataset.check) {
      // Step3 で入力した直後のチェックが古い文言に付き、判定時の作り直しで外れるのを防ぐ
      if (state.step === 3 && state.handoffStale) rebuildHandoff();
      state.handoffChecks[t.dataset.check] = t.checked;
      const item = t.closest('.handoff-item');
      if (item) item.classList.toggle('done', t.checked);
      state.dirty = true;
      invalidateJudgment();
      renderHandoffProgress();
      if (state.step === 3) refreshUnresolvedAlert();
      renderSummary();
      return;
    }

    if (t.dataset.note === 'handoff') { state.handoffNote = t.value; state.dirty = true; return; }
    if (t.dataset.note === 'interview') { state.interviewNotes = t.value; state.dirty = true; return; }
  }

  function onContentClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    switch (b.dataset.action) {
      case 'generate-handoff':
        if (validateInput()) goStep(2);
        break;
      case 'to-step':
        goStep(Number(b.dataset.step));
        break;
      case 'print-handoff':
        printHandoffSheet();
        break;
      case 'copy-handoff':
        copyHandoffText();
        break;
      case 'judge':
        if (validateScores() && validateDays() && validateContribution()) goStep(4);
        break;
      case 'score': {
        const id = b.dataset.item;
        const v = Number(b.dataset.value);
        state.scores[id] = state.scores[id] === v ? undefined : v;
        if (state.scores[id] === undefined) delete state.scores[id];
        state.dirty = true;
        invalidateJudgment();
        updateScoreUI();
        renderSummary();
        break;
      }
      case 'busy-all-ok':
      case 'busy-clear': {
        const a = state.applicant;
        a.vacation = a.vacation || {};
        a.vacationDays = a.vacationDays || {};
        R.busyItems(state.profile).forEach(function (v) {
          if (b.dataset.action === 'busy-all-ok') a.vacation[v.id] = 'ok';
          else { a.vacation[v.id] = ''; a.vacationDays[v.id] = ''; }
        });
        state.dirty = true;
        state.handoffStale = true;
        invalidateJudgment();
        renderStep();
        renderSummary();
        break;
      }
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
        renderSummary();
        toast(m.name + ' さんの印を押しました', 'ok');
        break;
      }
      case 'unstamp': {
        const box = b.closest('.stamp-box');
        const fid = box && box.dataset.fieldId;
        if (fid && state.management[fid]) { delete state.management[fid]; state.dirty = true; rerenderManagementCard(); renderSummary(); }
        break;
      }
      case 'print':
        window.print();
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

  function validateInput() {
    const missing = checkRequired('#stepContent');
    const a = state.applicant;
    if (!a.anyDay && a.workDays.length === 0) {
      toast('勤務可能曜日を1つ以上選んでください', 'error');
      $('#dayChips').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    const sh = R.analyzeShifts(a, state.profile);
    if (!sh.hasAnyEntry) {
      toast('勤務希望時間を1つ以上入力してください', 'error');
      $('#timeRows').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (missing.length) {
      focusFirst(missing[0], '必須項目（' + missing.length + '件）が未入力です');
      return false;
    }
    // 明らかな入力ミスだけ止める（高校生方針・繁忙期の未入力などは止めない）
    if (String(a.age).trim() !== '' && !isIntText(a.age)) {
      const el = $('[data-field="age"]'); if (el) el.classList.add('invalid');
      focusFirst(el, '年齢は整数で入力してください');
      return false;
    }
    return validateDays();
  }

  function isIntText(v) { return /^\d+$/.test(String(v).trim()); }

  // 週の勤務日数（Step1 と Step3「面接で確認する項目」で共用）：1〜7の整数・最低≦最大
  function validateDays() {
    const a = state.applicant;
    const isInt = isIntText;
    const badDays = ['daysMin', 'daysMax'].filter(function (k) {
      const v = String(a[k] == null ? '' : a[k]).trim();
      return v !== '' && (!isInt(v) || Number(v) < 1 || Number(v) > 7);
    });
    if (badDays.length) {
      badDays.forEach(function (k) { const el = $('[data-field="' + k + '"]'); if (el) el.classList.add('invalid'); });
      focusFirst($('[data-field="' + badDays[0] + '"]'), '週の勤務日数は1〜7の整数で入力してください');
      return false;
    }
    if (R.weeklyDaysCheck(a).order) {
      ['daysMin', 'daysMax'].forEach(function (k) { const el = $('[data-field="' + k + '"]'); if (el) el.classList.add('invalid'); });
      focusFirst($('#daysError'), '週の最低勤務日数が最大勤務日数を上回っています');
      return false;
    }
    return true;
  }

  // Step3→4: 判定の前にシフト条件（貢献度の未確認）をゼロにする
  function validateContribution() {
    const p = state.profile;
    const co = p.contribution || {};
    if (!contribOn() || co.requireComplete === false) return true;
    const c = R.computeContribution(state.applicant, p);
    if (!c.enabled || !c.incomplete) return true;
    const missing = checkRequired('#shiftConfirm');
    toast('判定の前にシフト条件を確定してください：' + c.missing.join('・'), 'error');
    const card = $('#shiftConfirm');
    const target = missing[0] || card;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  // =====================================================================
  // 共通の表示部品（Step2・Step4）
  // =====================================================================
  function flagBadges(flags) {
    return (flags || []).map(function (fl) {
      if (fl === 'unanswered') return '<span class="badge warn">未確認</span>';
      if (fl === 'restricted') return '<span class="badge danger">法令/運用で対象外</span>';
      if (fl === 'estimated') return '<span class="badge">推定</span>';
      return '';
    }).join('');
  }

  // シフト貢献度の内訳バー（ラベル・内容｜バー｜点数）
  function contribBarsHtml(c) {
    const tone = function (r) { return r < 0.35 ? 'lo' : r < 0.6 ? 'mid' : 'hi'; };
    return '<div class="bars contrib">' + c.parts.map(function (pt) {
      return '<div class="bar-row' + (pt.applicable ? '' : ' na') + '" data-part="' + esc(pt.id) + '">' +
        '<div class="bar-label"><div class="bar-name">' + esc(pt.label) + ' ' + flagBadges(pt.flags) + '</div>' +
          (pt.detail ? '<div class="bar-detail">' + esc(pt.detail) + '</div>' : '') + '</div>' +
        '<div class="bar-track"><div class="bar-fill ' + (pt.applicable ? tone(pt.ratio) : '') + '" style="width:' + Math.round((pt.applicable ? pt.ratio : 0) * 100) + '%"></div></div>' +
        '<div class="bar-val num">' + (pt.applicable ? fmtNum(pt.score) + '<small>/' + fmtNum(pt.max) + '</small>' : '<small>対象外</small>') + '</div>' +
      '</div>';
    }).join('') +
      '<div class="bar-row total"><div class="bar-label"><b>合計</b>' + (c.bandLabel ? ' <span class="badge ' + (BAND_TONE[c.band] || '') + '">' + esc(c.bandLabel) + '</span>' : '') + '</div>' +
        '<div class="bar-track"><div class="bar-fill ' + (c.band === 'high' ? 'hi' : c.band === 'mid' ? 'mid' : 'lo') + '" style="width:' + Math.min(100, Math.round(c.pct)) + '%"></div></div>' +
        '<div class="bar-val num">' + fmtNum(c.total) + '<small>/' + fmtNum(c.max) + '</small></div></div>' +
    '</div>';
  }

  // 繁忙期の表（期間｜○△×｜日数）。未確認のセルは色を付ける
  function busyTableHtml(c) {
    const f = feat();
    const rows = (c && c.busyRows) || [];
    if (!rows.length) return '<p class="empty">繁忙期の設定がありません。</p>';
    return '<table class="table busy-mini"><thead><tr><th>期間</th><th>可否</th>' + (f.vacationDays ? '<th>日数</th>' : '') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        const unk = !r.avail;
        const tri = R.isTri(r.avail);
        const daysUnk = f.vacationDays && tri && r.days == null;
        const daysTxt = !tri ? '—' : r.days == null ? '未確認' : r.days + R.UNIT_LABEL[r.unit] + ' ／ 満点' + r.refDays;
        return '<tr data-busy="' + esc(r.id) + '"' + (r.weight <= 0 ? ' class="muted"' : '') + '><td>' + esc(r.label) +
            (r.critical && r.weight > 0 ? ' <span class="badge warn">重点</span>' : '') + (r.weight <= 0 ? ' <span class="badge">記録のみ</span>' : '') + '</td>' +
          '<td class="' + (unk ? 'unk' : 'tri-' + esc(r.avail)) + '">' + esc(unk ? '未確認' : (R.TRI_LABELS[r.avail] || r.avail)) + '</td>' +
          (f.vacationDays ? '<td class="' + (daysUnk ? 'unk' : '') + '">' + esc(daysTxt) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  // 「回答から確認したいこと」: 得点率の低い項目の問いかけ（未回答・法令/運用で対象外の項目は除く）
  function lowRatioHints(c, withPoints) {
    const out = [];
    ((c && c.parts) || []).forEach(function (pt) {
      if (!pt.applicable || pt.ratio >= 0.5) return;
      const fl = pt.flags || [];
      if (fl.indexOf('unanswered') >= 0 || fl.indexOf('restricted') >= 0) return;
      out.push((CONFIRM_HINT[pt.id] || pt.label) + (withPoints ? '（現在 ' + fmtNum(pt.score) + '/' + fmtNum(pt.max) + '点）' : ''));
    });
    return out;
  }

  // 旧形式（v1）の保存ファイルを読み込んだときのバナー（Step2〜4）
  function legacyBannerHtml() {
    const lr = state.legacyRecord;
    if (!lr) return '';
    let msg = '旧形式（v1）で保存されたデータです。';
    if (contribOn()) {
      const c = R.computeContribution(state.applicant, state.profile);
      msg += c.incomplete
        ? '繁忙期の日数・祝日・オールナイト等が未入力のため、シフト貢献度は未確定です（採用推奨には留めません）。'
        : 'シフト条件は入力済みです。';
    }
    const sj = lr.savedJudgment;
    if (sj) msg += '保存時の判定: ' + (sj.title || resultTitle(sj.result)) + '（' + sj.total + '/' + sj.max + '点・面接評価のみ）';
    return '<div class="alert warn legacy-banner"><span class="ico">ℹ</span><span>' + esc(msg) +
      (state.step !== 3 ? ' <button type="button" class="btn link" data-action="to-step" data-step="3">面接で確認する項目を入力する</button>' : '') + '</span></div>';
  }

  // =====================================================================
  // Step2: 面接者への申し送り
  // =====================================================================
  // 面接前（Step2・コピー文）に貢献度の点数を見せるか
  //   面接時に聞くセクション（繁忙期・深夜帯・オールナイトなど）に判定に使う未回答が残る間は出さない：
  //   未回答は 0 点で数えるため、面接前の見込みがほぼ全員「低」に偏る（SPEC-stages D5・D17）
  function showPointsBeforeInterview(c) {
    return pointsAllowedBeforeInterview(c) && !pendingInterviewContrib().length;
  }
  function pointsAllowedBeforeInterview(c) {
    return contribOn() && !!c && !!c.enabled && ((state.profile.contribution || {}).showBeforeInterview !== false);
  }
  // 面接時に聞くセクションのうち、貢献度の計算に使う未回答（level 'required'）があるもの
  function pendingInterviewContrib() {
    return R.interviewConfirm(state.applicant, state.profile).sections.filter(function (s) {
      return s.toAsk && s.missing.some(function (m) { return m.level === 'required'; });
    });
  }

  function contribPreviewHtml(c) {
    const p = state.profile;
    // 面接前に点数を出さない設定（showBeforeInterview=false）ではカードごと出さない
    if (!pointsAllowedBeforeInterview(c)) return '';
    const pending = pendingInterviewContrib();
    if (pending.length) {
      return '<div class="card" id="contribPreview"><div class="card-head"><h2>シフト貢献度（面接前の見込み）</h2><div class="spacer"></div>' +
          '<span class="badge lg info">面接後に確定</span>' +
          '<p>' + esc(pending.map(function (s) { return s.label; }).join('・')) + 'を面接で確認してから点数を出します（未回答を 0 点で数えると低く見えるため、面接前は点数を出しません）。</p></div>' +
      '</div>';
    }
    const answered = ((c.busyRows) || []).some(function (r) { return !!r.avail; });
    return '<div class="card" id="contribPreview"><div class="card-head"><h2>シフト貢献度（面接前の見込み）</h2><div class="spacer"></div>' +
        '<span class="badge lg ' + (BAND_TONE[c.band] || '') + '">' + fmtNum(c.total) + ' / ' + fmtNum(c.max) + '点（' + esc(c.bandLabel) + '・暫定）</span>' +
        '<p>' + esc((p.texts || {}).contributionIntro || '') + '</p></div>' +
      contribBarsHtml(c) +
      (feat().vacation && answered ? '<h3 class="sub">繁忙期</h3>' + busyTableHtml(c) : '') +
    '</div>';
  }

  // 「面接で確認すること」の 1 セクション分（Step2 のカード・コピー文で共用）
  function todoSectionInfo(s) {
    const missing = s.missing.map(function (m) { return m.label; });
    return {
      status: !s.hasInput ? 'empty' : missing.length ? 'partial' : 'done',
      missing: missing
    };
  }

  // そのセクションの未入力が原因の要判断（deferred・block）があるか（右サマリーの「うち要判断」と対応させる）
  function deferredBlockIn(h, sid) {
    return ((h && h.items) || []).some(function (i) { return i.deferred && i.severity === 'block' && i.section === sid; });
  }

  // Step2「面接で確認すること」（interviewConfirm から。貢献度の ON/OFF に関係なく出す）
  function interviewTodoHtml(h) {
    const a = state.applicant;
    const p = state.profile;
    const cf = h.confirm || R.interviewConfirm(a, p);
    const desc = R.describeApplicant(a, p);
    const lis = cf.sections.filter(function (s) { return s.toAsk; }).map(function (s) {
      const info = todoSectionInfo(s);
      let head = '<b>' + esc(s.label) + '</b>';
      if (info.status === 'empty') head += '　<span class="hint">' + esc(s.ask) + '</span> <span class="badge warn">未入力</span>';
      else if (info.status === 'partial') head += ' <span class="badge warn">未入力: ' + esc(info.missing.join('、')) + '</span>';
      else head += ' <span class="badge ok">入力済み（面接で再確認）</span>';
      if (s.blocking) head += ' <span class="badge danger">判定前に入力が必要</span>';
      if (deferredBlockIn(h, s.id)) head += ' <span class="badge danger">要判断</span>';
      const vals = s.hasInput ? desc.filter(function (r) { return r.section === s.id; }).map(function (r) { return r.label + '：' + r.value; }).join(' / ') : '';
      return '<li data-section="' + esc(s.id) + '">' + head + (vals ? '<div class="hint">' + esc(vals) + '</div>' : '') + '</li>';
    });
    const pre = cf.sections.filter(function (s) { return !s.toAsk && s.missing.length; });
    if (pre.length) {
      const labels = [];
      pre.forEach(function (s) { s.missing.forEach(function (m) { labels.push(m.label); }); });
      lis.push('<li data-section="pre"><b>応募時に未入力</b> ' + esc(labels.join('、')) +
        (pre.some(function (s) { return s.blocking; }) ? ' <span class="badge danger">判定前に入力が必要</span>' : '') + '</li>');
    }
    const c = h.contribution || R.computeContribution(a, p);
    const hints = contribOn() && c && c.enabled ? lowRatioHints(c, showPointsBeforeInterview(c)) : [];
    let body = '';
    if (lis.length) body += '<ul class="todo-list">' + lis.join('') + '</ul>';
    if (hints.length) body += '<h3 class="sub">回答から確認したいこと</h3><ul class="list-plain confirm-list">' + hints.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (!body) body = '<p class="empty">面接で確認が必要な未入力の項目はありません。</p>';
    return '<div class="card" id="interviewTodo"><div class="card-head"><h2>面接で確認すること</h2>' +
        '<p>面接で次の項目を確認し、Step3「面接で確認する項目」に入力してください。</p></div>' + body + '</div>';
  }

  // コピー文の「■面接で確認すること」の行
  function interviewTodoLines(h) {
    const a = state.applicant;
    const p = state.profile;
    const cf = h.confirm || R.interviewConfirm(a, p);
    const out = [];
    cf.sections.filter(function (s) { return s.toAsk; }).forEach(function (s) {
      const info = todoSectionInfo(s);
      const st = info.status === 'empty' ? '未入力（' + s.ask + '）'
        : info.status === 'partial' ? '未入力（' + info.missing.join('、') + '）' : '入力済み（面接で再確認）';
      out.push('・' + s.label + '：' + st + (s.blocking ? '［判定前に入力が必要］' : '') + (deferredBlockIn(h, s.id) ? '［要判断］' : ''));
    });
    const pre = cf.sections.filter(function (s) { return !s.toAsk && s.missing.length; });
    if (pre.length) {
      const labels = [];
      pre.forEach(function (s) { s.missing.forEach(function (m) { labels.push(m.label); }); });
      out.push('・応募時に未入力：' + labels.join('、') + (pre.some(function (s) { return s.blocking; }) ? '［判定前に入力が必要］' : ''));
    }
    const c = h.contribution || R.computeContribution(a, p);
    if (contribOn() && c && c.enabled) lowRatioHints(c, false).forEach(function (x) { out.push('・（回答から）' + x); });
    return out;
  }

  // 留意点のチェック項目（Step2 の一覧・Step3 の #deferredItems で共用）
  function handoffItemHtml(i, done) {
    const catTone = i.category === 'legal' ? ' tag-danger' : i.category === 'highschool' ? ' tag-warn' : '';
    return '<label class="handoff-item sev-' + i.severity + (done ? ' done' : '') + '" data-item-id="' + esc(i.id) + '">' +
      '<input type="checkbox" data-check="' + esc(i.id) + '"' + (done ? ' checked' : '') + '>' +
      '<div><div class="handoff-meta"><span class="tag' + catTone + '">' + esc(i.categoryLabel) + '</span>' +
        (i.deferred || i.aggregate ? '<span class="tag tag-warn">面接で確認</span>' : '') + '</div><div class="handoff-text">' + esc(i.text) + '</div></div>' +
    '</label>';
  }

  function handoffCommentHtml() {
    const notes = state.applicant.reviewerNotes || '';
    const edit = '<button type="button" class="btn link no-print" data-action="to-step" data-step="1">編集</button>';
    if (!String(notes).trim()) return '<p class="muted handoff-comment empty-comment" id="handoffComment">申し送りコメントはありません（Step1 で入力できます）。' + edit + '</p>';
    return '<div class="alert info handoff-comment" id="handoffComment"><span class="ico">✎</span>' +
      '<div class="handoff-comment-body"><b>申し送りコメント</b><div style="white-space:pre-wrap">' + esc(notes) + '</div></div>' + edit + '</div>';
  }

  function handoffStepHtml() {
    const h = state.handoff;
    const a = state.applicant;
    const p = state.profile;
    const sev = R.SEVERITY;
    const shown = shownItems(h);
    const later = h.items.length - shown.length;
    const groups = ['block', 'warn', 'info'].map(function (k) {
      return { key: k, meta: sev[k], items: shown.filter(function (i) { return i.severity === k; }) };
    });
    const shiftRows = R.describeShifts(a, p);
    const desc = R.describeApplicant(a, p);
    const hsRow = desc.find(function (r) { return r.label === '高校生の例外'; });
    const hs = h.hs || R.highschoolStatus(a, p);
    const fo = a.foreign || {};
    let foreignRow = null;
    if (feat().foreignNational && fo.isForeign === 'yes') {
      const fr = desc.find(function (r) { return r.label === '外国籍'; });
      // 詳細が面接時でも、Step1 の折りたたみで先に入力していればその値を出す（空のときだけ「詳細は面接で確認」）
      const later = stageOf('foreignDetail') === 'interview';
      const known = !later || R.sectionHasInput(a, p, 'foreignDetail');
      foreignRow = ['外国籍', known ? (fr ? fr.value : '該当') + (later ? '（面接で再確認）' : '') : '該当（詳細は面接で確認）', 'danger'];
    }

    let html = legacyBannerHtml();
    const mgInit = (state.management || {}).initial;
    html += '<div class="sheet-head print-only"><div class="sheet-title">面接者への申し送りシート</div>' +
      '<div class="sheet-meta">' + esc(p.meta.theaterName) + '　応募者: ' + esc(a.name) + ' さん　作成日: ' + esc(U.fmtDate(new Date()).replace(/-/g, '/')) +
      (mgInit && mgInit.name ? '　初期対応: ' + esc(mgInit.name) : '') + '</div></div>';
    html += '<div class="card" id="handoffCard"><div class="card-head"><h2>面接者への申し送り</h2>' +
      '<div class="spacer"></div><span class="badge accent lg">' + esc(a.name) + ' さん</span>' +
      '<p>' + esc(p.texts.handoffIntro || '') + '</p></div>' +
      handoffCommentHtml() +
      '<div class="grid-2">' +
        '<div><h3 class="sub">応募者</h3><table class="table kv">' +
          [['区分', a.category + (a.age ? '（' + a.age + '歳）' : '')],
           hsRow ? ['高校生', hsRow.value + (hs.status === 'excluded' ? '（' + a.category + '）' : ''), hs.status === 'exception_met' ? 'ok' : 'danger'] : null,
           ['通勤', [a.commuteMethod, a.commuteMinutes ? a.commuteMinutes + '分' : '', a.nearestStation].filter(Boolean).join(' / ')],
           ['勤務期間', R.labelOf(p.options.workPeriods, a.workPeriod)],
           ['週勤務日数', (a.daysMin || a.daysMax) ? (a.daysMin || '?') + '〜' + (a.daysMax || '?') + '日' : '未入力'],
           foreignRow
          ].filter(Boolean).map(function (r) {
            return '<tr' + (r[2] ? ' class="row-' + r[2] + '"' : '') + '><th>' + esc(r[0]) + '</th><td>' + esc(r[1] || '未入力') + '</td></tr>';
          }).join('') +
        '</table></div>' +
        '<div><h3 class="sub">希望シフト</h3>' +
          (shiftRows.length ? '<ul class="list-plain">' + shiftRows.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="empty">未入力</p>') +
          '<div class="badges" style="margin-top:10px">' + h.badges.map(function (b) { return '<span class="badge ' + b.tone + '">' + esc(b.label) + '</span>'; }).join('') + '</div>' +
        '</div>' +
      '</div>' +
      (h.strengths.length ? '<h3 class="sub">強み（面接者へ共有）</h3><ul class="strength-list">' + h.strengths.map(function (s) { return '<li>' + esc(s.text) + '</li>'; }).join('') + '</ul>' : '') +
    '</div>';

    html += interviewTodoHtml(h);

    html += '<div class="card" id="handoffItems"><div class="card-head"><h2>留意点 <span class="muted" style="font-weight:500">' + shown.length + '件</span></h2>' +
      '<div class="spacer"></div><div class="progress" id="handoffProgress" style="min-width:220px"></div>' +
      '<p>確認が済んだ項目にチェックを入れてください。チェック状況は保存ファイルと採用可否判定に反映されます。</p></div>' +
      (later > 0 ? '<p class="hint later-note">面接で確認する項目の未入力に関する留意点（' + later + ' 件）は「面接で確認すること」にまとめています。Step3 で入力するか、未入力のまま確認してチェックしてください。</p>' : '');

    if (!shown.length) {
      html += '<div class="alert ok"><span class="ico">✓</span><span>自動抽出された留意点はありません。面接者には応募者の強みと希望シフトを共有してください。</span></div>';
    }
    groups.forEach(function (g) {
      if (!g.items.length) return;
      const tone = g.key === 'block' ? 'danger' : g.key === 'warn' ? 'warn' : 'info';
      html += '<div class="handoff-group"><div class="handoff-group-head"><span class="badge ' + tone + '">' + esc(g.meta.label) + '</span><h3>' + g.items.length + '件</h3><span class="desc">' + esc(g.meta.desc) + '</span></div>' +
        '<div class="handoff-list">' + g.items.map(function (i) { return handoffItemHtml(i, !!state.handoffChecks[i.id]); }).join('') + '</div></div>';
    });
    html += '</div>';

    html += contribPreviewHtml(h.contribution || R.computeContribution(a, p));

    // 面接者向けの自由記述は Step1 の「申し送りコメント」が基本。ここは補足用（保存データ handoff.note の互換のため残す）。
    // 空のときは閉じた折りたたみにして目立たせない
    const noteTitle = '追記（申し送りコメントの補足・任意）';
    const noteBody = '<p class="hint">面接者への申し送りは、基本は Step1 の「面接者への申し送りコメント」に書いてください。申し送りを作った後に補足したいことがあればここに記入します。</p>' +
      '<textarea data-note="handoff" rows="3" placeholder="例：土曜は月2回程度なら可能とのこと（電話で追加確認）。">' + esc(state.handoffNote) + '</textarea>';
    if (String(state.handoffNote || '').trim()) {
      html += '<div class="card" id="handoffNoteCard"><div class="card-head"><h2>' + esc(noteTitle) + '</h2></div>' + noteBody + '<div class="note-print print-only">' + esc(state.handoffNote) + '</div></div>';
    } else {
      html += '<details class="card prefill" id="handoffNoteCard"><summary><span class="prefill-title">' + esc(noteTitle) + '</span></summary>' +
        '<div class="prefill-body">' + noteBody + '</div></details>';
    }

    html += managementCardHtml();
    html += '<div class="actions between">' +
      '<button type="button" class="btn" data-action="to-step" data-step="1">← 応募情報に戻る</button>' +
      '<div class="actions"><button type="button" class="btn" data-action="print-handoff" title="留意点・申し送りを A4 1枚に印刷">🖨 申し送りシート（A4）</button>' +
      '<button type="button" class="btn" data-action="copy-handoff">📋 申し送り文をコピー</button>' +
      '<button type="button" class="btn primary" data-action="to-step" data-step="3">面接評価へ進む →</button></div></div>';
    return html;
  }

  // Step2 の進捗（Step2 に出る項目＝shownItems で数える）
  function renderHandoffProgress() {
    const el = $('#handoffProgress');
    if (!el || !state.handoff) return;
    const items = shownItems(state.handoff);
    const total = items.length;
    const done = items.filter(function (i) { return state.handoffChecks[i.id]; }).length;
    const pct = total ? Math.round(done / total * 100) : 100;
    el.innerHTML = '<span>確認済み ' + done + ' / ' + total + '</span><div class="progress-bar"><span style="width:' + pct + '%"></span></div>';
  }

  function buildHandoffText() {
    if (!state.handoff || state.handoffStale) {
      rebuildHandoff();
      // 画面の一覧とコピー文を一致させる
      if (state.view === 'judge' && (state.step === 2 || state.step === 3)) { renderStep(); renderSummary(); }
    }
    const h = state.handoff;
    const a = state.applicant;
    const p = state.profile;
    const lines = [];
    const section = function (title, rows) {
      if (!rows.length) return;
      lines.push('');
      lines.push(title);
      rows.forEach(function (x) { lines.push(x); });
    };
    lines.push('【面接者への申し送り】' + p.meta.theaterName);
    lines.push('応募者：' + a.name + ' さん（' + [a.category, a.age ? a.age + '歳' : ''].filter(Boolean).join('・') + '）');
    // 申し送りコメントは冒頭に（面接者が最初に読む）
    if (String(a.reviewerNotes || '').trim()) section('■申し送りコメント', [a.reviewerNotes]);
    const desc = R.describeApplicant(a, p);
    section('■応募時の情報', desc.filter(function (r) {
      return stageOf(r.section) === 'pre' && r.section !== 'notes' && ['氏名', '年齢', '区分'].indexOf(r.label) < 0;
    }).map(function (r) { return r.label + '：' + r.value; }));
    section('■面接前に分かっている情報', desc.filter(function (r) {
      return stageOf(r.section) === 'interview' && R.sectionHasInput(a, p, r.section);
    }).map(function (r) { return r.label + '：' + r.value; }));
    section('■面接で確認すること', interviewTodoLines(h));
    const shown = shownItems(h);
    ['block', 'warn', 'info'].forEach(function (k) {
      const items = shown.filter(function (i) { return i.severity === k; });
      section('■' + R.SEVERITY[k].label + '（' + R.SEVERITY[k].desc + '）', items.map(function (i) {
        const prefix = i.category === 'legal' ? '[法令]' : i.category === 'highschool' ? '[高校生]' : '';
        return (state.handoffChecks[i.id] ? '☑ ' : '☐ ') + prefix + i.text;
      }));
    });
    section('■強み', h.strengths.map(function (s) { return '・' + s.text; }));
    const c = h.contribution || R.computeContribution(a, p);
    if (showPointsBeforeInterview(c)) {
      section('■シフト貢献度（面接前の見込み）' + fmtNum(c.total) + '/' + fmtNum(c.max) + '点（' + c.bandLabel + '・暫定）', [
        c.parts.filter(function (pt) { return pt.applicable; }).map(function (pt) {
          return partShort(pt) + ' ' + fmtNum(pt.score) + '/' + fmtNum(pt.max);
        }).join('・')
      ]);
    }
    if (state.handoffNote) section('■追記（申し送りコメントの補足）', [state.handoffNote]);
    return lines.join('\n');
  }

  function copyHandoffText() {
    const text = buildHandoffText();
    state.lastHandoffText = text; // テスト・確認用
    const done = function () { toast('申し送り文をコピーしました', 'ok'); };
    const fallback = function () {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした', 'error'); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // =====================================================================
  // Step3: 面接評価
  // =====================================================================
  // 面接で確認する項目（面接で確認した内容を入力し、シフト条件を確定させる）。
  // 段階が面接時のセクションは全項目を表示する（Step1 で先に入力した値もそのまま出る）。どのブロックを描くかは描画時に決める
  function interviewConfirmHtml() {
    const p = state.profile;
    const a = state.applicant;
    const f = feat();
    const hs = R.highschoolStatus(a, p);
    const shiftOn = shiftConfirmOn();
    const night = R.nightStatus(a, p);
    const strict = contribOn() && (p.contribution || {}).requireComplete !== false;
    const cs = R.continueSection(a, p);
    const isF0 = (a.foreign || {}).isForeign || '';
    // 開いた時点の状態（入力中の再描画で見出しや欄が入れ替わらないように）
    if (!state.cfSnap) {
      state.cfSnap = { foreignFlag: isF0 === '', input: {} };
      ['busy', 'lateNight', 'allNight'].forEach(function (id) { state.cfSnap.input[id] = R.sectionHasInput(a, p, id); });
    }
    const snap = state.cfSnap;
    const fixedNote = function (id) { return snap.input[id] ? '（応募時に入力済み・変更があれば修正）' : '（応募時は未入力）'; };
    const blocks = [];
    // title が空なら見出しを省く（1 項目だけのセクションは欄のラベルが見出しを兼ねる）
    const block = function (id, title, body) {
      if (!body) return;
      blocks.push('<div class="confirm-sec' + (title ? '' : ' single') + '" data-section="' + esc(id) + '" id="cf-' + esc(id) + '">' +
        (title ? '<h3 class="sub">' + esc(title) + '</h3>' : '') + body + '</div>');
    };
    let foreignDone = false;
    R.INPUT_SECTIONS.forEach(function (sec) {
      const id = sec.id;
      if (sec.fixed || id === 'hsException' || !sectionOn(id)) return;
      const later = isInterview(id);
      const label = R.sectionLabel(p, id);
      switch (id) {
        case 'continuation':
          if (later && cs === 'continuation') block(id, '', continueFieldHtml());
          break;
        case 'foreignFlag':
        case 'foreignDetail': {
          if (foreignDone) break;
          foreignDone = true;
          const isF = isF0;
          // Step1 で空欄なら、面接で該当の有無も入れられるようにする（開いた時点で空欄なら、選んだ後も欄を残す）
          const flagHere = isInterview('foreignFlag') || isF === '' || snap.foreignFlag;
          if (flagHere) {
            // 1 項目のセクションは見出しを省き、欄のラベル（外国籍）に任せる
            block('foreign', '', foreignFlagHtml() + foreignDetailHtml());
          } else if (isInterview('foreignDetail') && isF === 'yes') {
            // 該当の有無は応募時に入力済み（該当しない なら何も描かない）
            block('foreign', R.sectionLabel(p, 'foreignDetail'), foreignDetailHtml());
          }
          break;
        }
        case 'commute':
          if (later) block(id, label, commuteFieldsHtml(false));
          break;
        case 'sideJob':
          if (later) block(id, '', sideJobFieldsHtml());
          break;
        case 'busy':
          if (later) block(id, label, busyFieldsHtml(strict));
          else if (shiftOn) block(id, label + fixedNote(id), busyFieldsHtml(strict));
          break;
        case 'lateNight':
          if (later) block(id, label, lateNightFieldsHtml(strict));
          else if (shiftOn) {
            block(id, label + fixedNote(id), fSeg('lateNight.availability', lateHour() + '時以降の勤務', TRI, {
              required: strict && !night.restricted,
              hint: night.restricted ? night.reason + 'のため、' + lateHour() + '時以降の勤務は貢献度に数えません。' : ''
            }));
          }
          break;
        case 'allNight':
          if (later) block(id, label, allNightFieldsHtml(strict));
          else if (shiftOn) block(id, label + fixedNote(id), allNightFieldsHtml(strict));
          break;
        case 'extras':
          if (later) block(id, label, extrasFieldsHtml());
          break;
        default:
          break;
      }
    });
    // 週の勤務日数：シフト条件を確定する劇場では常に。そうでない劇場でも、判定に使う週の最大勤務日数が空なら
    // （Step2 の「応募時に未入力」から Step3 へ案内するため）
    const cf0 = R.interviewConfirm(a, p);
    const daysHere = shiftOn || cf0.sections.some(function (s) { return s.missing.some(function (m) { return m.key === 'daysMax'; }); });
    if (!shiftOn && !hs.isExceptionCategory && !blocks.length && !daysHere) return '';

    // 高3の例外条件（合格通知など面接で確認した結果をここで記録できるように。段階に関係なく。Step1 と同じ data-field）
    const hsOnly = !shiftOn && !blocks.length && !daysHere;
    let body = '<div id="shiftConfirmStatus" class="alert"' + (hsOnly ? ' data-mode="hs"' : '') + '></div>';
    if (hs.isExceptionCategory) {
      body += '<h3 class="sub">高校3年生の例外条件</h3><div id="shiftConfirmHs">' + continueFieldHtml() + hsExceptionHtml() + '</div>';
    }
    body += blocks.join('');
    if (daysHere) {
      body += '<div class="confirm-sec" data-section="days" id="cf-days"><h3 class="sub">週の勤務日数（確認）</h3><div class="field-row">' +
          fInput('daysMin', '週の最低勤務日数', { type: 'number', min: 1, max: 7, step: 1, suffix: '日' }) +
          fInput('daysMax', '週の最大勤務日数', { type: 'number', min: 1, max: 7, step: 1, suffix: '日', required: strict }) +
        '</div>' +
        alertHtml('daysError', 'danger', '⚠', '', '週の最低勤務日数が最大勤務日数を上回っています。') +
        alertHtml('daysWarn', 'warn', '⚠', 'daysWarnText') +
      '</div>';
    }
    body += '<div id="interviewNewItems" class="deferred-items hidden"></div>';
    body += '<div id="deferredItems" class="deferred-items hidden"></div>';
    return '<div class="card" id="shiftConfirm"><div class="card-head"><h2>面接で確認する項目</h2><div class="spacer"></div>' +
        (contribOn() ? '<span class="badge info">シフト貢献度</span><span class="contrib-meter" data-meter="total"></span>' : '') +
        '<p>' + esc((p.texts || {}).interviewConfirmIntro || '') + '</p></div>' +
      body + '</div>';
  }

  // 「未入力のまま判定する場合の留意点」：面接時の項目の未入力が原因の留意点（deferred）とシフト条件の未確認（aggregate）。
  // Step2 の一覧に出さないため、確認済みにする場所としてここでチェックできる（入力すると消える）
  function deferredItemsHtml(h) {
    const p = state.profile;
    // 判定前にシフト条件の入力が必須（strict）なら、シフト条件の未確認（aggregate）はチェックしても判定できないので出さない
    // （上部の件数と #shiftConfirmStatus の 1 行目で示す。validateContribution と同じ条件）
    const strict = contribOn() && (p.contribution || {}).requireComplete !== false && !!R.computeContribution(state.applicant, p).enabled;
    const items = laterItems(h).filter(function (i) { return !(strict && i.aggregate); });
    if (!items.length) return '';
    const prevText = {};
    if (state.handoff) state.handoff.items.forEach(function (i) { prevText[i.id] = i.text; });
    return '<h3 class="sub">未入力のまま判定する場合の留意点</h3>' +
      '<p class="hint">面接で確認できなかった項目です。確認した上でチェックしてください（入力すると消えます）。</p>' +
      '<div class="handoff-list">' + items.map(function (i) {
        return handoffItemHtml(i, !!state.handoffChecks[i.id] && prevText[i.id] === i.text);
      }).join('') + '</div>';
  }

  // 「面接で入力した内容から出た留意点」（interviewNewItems）。Step3 で入力して出た「要判断」などを、Step2 に戻らずにここでチェックできる
  function interviewNewItemsHtml(h) {
    const items = interviewNewItems(h);
    if (!items.length) return '';
    const prevText = {};
    if (state.handoff) state.handoff.items.forEach(function (i) { prevText[i.id] = i.text; });
    return '<h3 class="sub">面接で入力した内容から出た留意点</h3>' +
      '<p class="hint">面接時の項目（繁忙期・深夜帯・オールナイト・かけもち・外国籍の詳細など）の回答に関する留意点です。面接で確認した上でチェックしてください（チェックは Step2 の一覧と共通です）。</p>' +
      '<div class="handoff-list">' + items.map(function (i) {
        return handoffItemHtml(i, !!state.handoffChecks[i.id] && prevText[i.id] === i.text);
      }).join('') + '</div>';
  }

  function refreshDeferredItems() {
    const h = R.buildHandoff(state.applicant, state.profile);
    const nbox = $('#interviewNewItems');
    if (nbox) {
      const nhtml = interviewNewItemsHtml(h);
      nbox.innerHTML = nhtml;
      show(nbox, !!nhtml);
    }
    const box = $('#deferredItems');
    if (!box) return;
    const html = deferredItemsHtml(h);
    box.innerHTML = html;
    show(box, !!html);
  }

  // Step3 上部「未確認の留意点 N 件」。h の各項目について、チェック済みでも文言が変わった項目は未確認として数える
  // （rebuildHandoff と同じ扱い。state は書き換えない）。件数は判定時と同じ全件（面接時の項目の未入力・シフト条件の未確認を含む）
  function unresolvedAlertHtml(h) {
    const prevText = {};
    if (state.handoff) state.handoff.items.forEach(function (i) { prevText[i.id] = i.text; });
    const unresolved = h ? h.items.filter(function (i) { return !(state.handoffChecks[i.id] && prevText[i.id] === i.text); }) : [];
    if (!unresolved.length) return '';
    const unresolvedBlock = unresolved.filter(function (i) { return i.severity === 'block'; });
    // 下の『面接で確認する項目』で解消できるもの（deferred / aggregate と、面接で入力した内容から出た留意点）
    const hereIds = {};
    interviewNewItems(h).forEach(function (i) { hereIds[i.id] = true; });
    const later = unresolved.filter(function (i) { return i.deferred || i.aggregate || hereIds[i.id]; }).length;
    return '<div class="alert ' + (unresolvedBlock.length ? 'danger' : 'warn') + '"><span class="ico">⚠</span><span>未確認の留意点が <b class="num" id="unresolvedCount">' + unresolved.length + '</b> 件あります' +
      (unresolvedBlock.length ? '（うち要判断 ' + unresolvedBlock.length + ' 件）' : '') + '。' +
      (later ? '（うち ' + later + ' 件は下の『面接で確認する項目』で入力・確認すると解消します）' : '') +
      (unresolved.length - later > 0 ? '<button type="button" class="btn link no-print" data-action="to-step" data-step="2">申し送りを確認する</button>' : '') + '</span></div>';
  }

  // Step3 でシフト条件などを変えたとき、上部の件数だけ作り直す（全体の再描画は入力中のフォーカスを失うため）
  function refreshUnresolvedAlert() {
    const box = $('#unresolvedAlert');
    if (!box) return;
    box.innerHTML = unresolvedAlertHtml(R.buildHandoff(state.applicant, state.profile));
  }

  function interviewStepHtml() {
    const ev = state.profile.evaluation;
    const scale = Number(ev.scaleMax) || 5;

    let html = legacyBannerHtml();
    html += '<div id="unresolvedAlert">' + unresolvedAlertHtml(state.handoff) + '</div>';

    html += '<div class="card"><div class="card-head"><h2>面接評価</h2><div class="spacer"></div><span class="badge accent lg">' + esc(state.applicant.name) + ' さん</span>' +
      '<p>各項目を 1〜' + scale + ' 点で評価してください。同じ点を再度押すと取り消せます。</p></div>' +
      '<div class="scale-legend"><span>1 悪い</span><span>' + Math.ceil(scale / 2) + ' 普通</span><span>' + scale + ' 良い</span></div>' +
      '<div class="eval-list">' + (ev.items || []).map(function (it, idx) {
        const isOverall = it.id === ev.overallItemId;
        const cur = state.scores[it.id];
        return '<div class="eval-item' + (isOverall ? ' overall' : '') + '" data-eval="' + esc(it.id) + '">' +
          '<div><div class="eval-label"><span class="n">' + (idx + 1) + '.</span>' + esc(it.label) + '</div>' +
          (isOverall ? '<div class="eval-sub">1 = 不採用 … ' + scale + ' = 採用。' + (Number(ev.overallWarnBelow) || 3) + '点未満で警告が出ます。</div>' : '') + '</div>' +
          '<div class="score-seg">' + Array.from({ length: scale }, function (_, i) { return i + 1; }).map(function (v) {
            return '<button type="button" class="seg-btn s' + v + (cur === v ? ' active' : '') + '" data-action="score" data-item="' + esc(it.id) + '" data-value="' + v + '" aria-label="' + v + '点">' + v + '</button>';
          }).join('') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="score-total">合計 <strong id="scoreTotal">0</strong><span class="max">/ ' + ((ev.items || []).length * scale) + '点</span><span class="pct" id="scorePct"></span></div>' +
      '<div class="alert warn hidden" id="overallWarn" style="margin-top:10px"><span class="ico">⚠</span><span>面接者の総合判断が低評価です。採用可否は慎重に判断してください。</span></div>' +
    '</div>';

    html += interviewConfirmHtml();

    html += '<div class="card"><div class="card-head"><h2>面接所見</h2></div>' +
      '<textarea data-note="interview" rows="4" placeholder="特記事項、面接での受け答えの印象、確認できた事項など">' + esc(state.interviewNotes) + '</textarea></div>';

    html += '<div class="actions between">' +
      '<button type="button" class="btn" data-action="to-step" data-step="2">← 申し送りに戻る</button>' +
      '<button type="button" class="btn primary" data-action="judge">採用可否判定を実行 →</button></div>';
    return html;
  }

  function updateScoreUI() {
    const ev = state.profile.evaluation;
    const scale = Number(ev.scaleMax) || 5;
    let total = 0;
    (ev.items || []).forEach(function (it) {
      const v = state.scores[it.id];
      if (v != null) total += Number(v);
      const row = $('.eval-item[data-eval="' + it.id + '"]');
      if (row) {
        $$('.seg-btn', row).forEach(function (b) { b.classList.toggle('active', Number(b.dataset.value) === v); });
        row.classList.remove('missing');
      }
    });
    const max = (ev.items || []).length * scale;
    const t = $('#scoreTotal'); if (t) t.textContent = total;
    const pctEl = $('#scorePct'); if (pctEl) pctEl.textContent = max ? R.round1(total / max * 100) + '%' : '';
    const ov = state.scores[ev.overallItemId];
    show('#overallWarn', ov != null && ov < (Number(ev.overallWarnBelow) || 3));
  }

  function validateScores() {
    const ev = state.profile.evaluation;
    const missing = (ev.items || []).filter(function (it) { return state.scores[it.id] == null; });
    if (!missing.length) return true;
    missing.forEach(function (it) { const row = $('.eval-item[data-eval="' + it.id + '"]'); if (row) row.classList.add('missing'); });
    toast('未入力の評価項目が ' + missing.length + ' 件あります', 'error');
    const first = $('.eval-item.missing'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  // =====================================================================
  // Step4: 採用可否判定（面接評価 × シフト貢献度）
  // =====================================================================
  function bandLabelOf(k) {
    const bl = (state.profile.texts || {}).bandLabels || {};
    return bl[k] || { high: '高', mid: '中', low: '低' }[k] || '';
  }

  function matrixTableHtml(j) {
    const m = j.matrix || {};
    const t = m.table || {};
    const b = m.bands || {};
    const bi = b.interview || {}, bc = b.contribution || {};
    const keys = ['high', 'mid', 'low'];
    const range = function (bb, k) { return k === 'high' ? bb.high + '%以上' : k === 'mid' ? bb.mid + '〜' + bb.high + '%' : bb.mid + '%未満'; };
    return '<table class="matrix"><caption>面接評価 × シフト貢献度</caption>' +
      '<thead><tr><th class="corner">面接＼貢献度</th>' + keys.map(function (k) {
        return '<th scope="col">' + esc(bandLabelOf(k)) + '<small>' + esc(range(bc, k)) + '</small></th>';
      }).join('') + '</tr></thead><tbody>' +
      keys.map(function (ik) {
        return '<tr><th scope="row">' + esc(bandLabelOf(ik)) + '<small>' + esc(range(bi, ik)) + '</small></th>' + keys.map(function (ck) {
          const key = ik + '_' + ck;
          const r = t[key];
          const cur = m.cellKey === key;
          return '<td class="' + esc(r || '') + (cur ? ' current' : '') + '" data-cell="' + key + '" title="' + esc(resultTitle(r)) + '">' + (cur ? '▶ ' : '') + esc(RESULT_SHORT[r] || '—') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>' +
      (j.mode === 'incomplete' ? '<div class="hint">シフト貢献度が未確定のため、マトリクスは適用していません（面接評価のみで判定）。</div>' : '');
  }

  function adjustmentsHtml(j) {
    if (!j.adjustments || !j.adjustments.length) return '';
    const head = (j.mode === 'matrix' ? 'マトリクス' : '面接評価のみ') + ': ' + resultTitle(j.baseResult) + ' → 最終: ' + resultTitle(j.result);
    return '<div class="adjust-box"><div class="adjust-head">' + esc(head) + '</div><ul class="list-plain">' +
      j.adjustments.map(function (ad) { return '<li>' + esc(resultTitle(ad.from) + ' → ' + resultTitle(ad.to) + '：' + ad.reason) + '</li>'; }).join('') +
    '</ul></div>';
  }

  function axisMetricsHtml(j) {
    const c = j.contribution;
    const iv = j.interview;
    const cBand = j.mode === 'incomplete' ? ['warn', '未確定'] : [BAND_TONE[c.band] || '', c.bandLabel || '—'];
    return '<div class="axis-grid">' +
      '<div class="metric axis" data-axis="interview"><div class="metric-lbl">面接評価</div>' +
        '<div class="metric-val num">' + iv.total + ' <small>/ ' + iv.max + '点</small></div>' +
        '<div class="metric-sub"><span class="num">' + fmtNum(iv.pct) + '%</span> <span class="badge ' + (BAND_TONE[iv.band] || '') + '">' + esc(iv.bandLabel) + '</span></div></div>' +
      '<div class="metric axis" data-axis="contribution"><div class="metric-lbl">シフト貢献度</div>' +
        '<div class="metric-val num">' + fmtNum(c.total) + ' <small>/ ' + fmtNum(c.max) + '点</small></div>' +
        '<div class="metric-sub"><span class="num">' + fmtNum(c.pct) + '%</span> <span class="badge ' + cBand[0] + '">' + esc(cBand[1]) + '</span></div></div>' +
      '<div class="metric matrix-wrap">' + matrixTableHtml(j) + '</div>' +
    '</div>' + adjustmentsHtml(j);
  }

  function legacyMetricsHtml(j) {
    const p = state.profile;
    return '<div class="metrics">' +
      '<div class="metric"><div class="metric-val num">' + j.total + ' <small>/ ' + j.max + '点</small></div><div class="metric-lbl">面接評価 合計</div></div>' +
      '<div class="metric"><div class="metric-val num">' + j.pct + '<small>%</small></div><div class="metric-lbl">得点率</div></div>' +
      '<div class="metric"><div class="metric-val num">' + j.thresholds.recommendPts + '<small>点以上</small></div><div class="metric-lbl">' + esc(p.texts.recommend.title) + '（' + j.thresholds.recommendPct + '%）</div></div>' +
      '<div class="metric"><div class="metric-val num">' + j.thresholds.reviewPts + '<small>点以上</small></div><div class="metric-lbl">' + esc(p.texts.review.title) + '（' + j.thresholds.reviewPct + '%）</div></div>' +
    '</div>' + adjustmentsHtml(j);
  }

  function interviewBarsHtml(j) {
    const scale = Number(state.profile.evaluation.scaleMax) || 5;
    return '<div class="bars">' + j.breakdown.map(function (b) {
      const s = b.score == null ? 0 : b.score;
      const pct = Math.round(s / scale * 100);
      const tone = s <= 2 ? 'lo' : s === 3 ? 'mid' : 'hi';
      return '<div class="bar-row' + (b.isOverall ? ' overall' : '') + '"><div class="bar-label">' + esc(b.label) + '</div><div class="bar-track"><div class="bar-fill ' + tone + '" style="width:' + pct + '%"></div></div><div class="bar-val num">' + (b.score == null ? '-' : b.score) + '</div></div>';
    }).join('') + '</div>';
  }

  function resultStepHtml() {
    const j = state.judgment;
    const a = state.applicant;
    const p = state.profile;
    const f = feat();
    const icon = j.result === 'recommend' ? '🎉' : j.result === 'review' ? '⚖' : '✖';
    const twoAxis = !!j.mode && j.mode !== 'interviewOnly';
    const c = j.contribution || null;

    let html = legacyBannerHtml();
    html += '<div class="result-card ' + j.result + '" data-mode="' + esc(j.mode || 'interviewOnly') + '">' +
      '<div class="result-kicker">採用可否判定 ・ ' + esc(a.name) + ' さん</div>' +
      '<div class="result-title"><span>' + icon + '</span><span>' + esc(j.title) + '</span></div>' +
      '<div class="result-body">' + esc(j.body) + '</div>' +
      (j.matrix && j.matrix.note ? '<div class="result-note">' + esc(j.matrix.note) + '</div>' : '') +
      (twoAxis && c ? axisMetricsHtml(j) : legacyMetricsHtml(j)) +
      '<div class="result-disclaimer">' + esc(j.disclaimer) + '</div>' +
    '</div>';

    if (j.warnings.length) {
      // 面接時の項目の未入力が原因の留意点・シフト条件の未確認には「面接で確認」の印（Step3 で入力・確認すると解消）
      const laterIds = {};
      laterItems(state.handoff).forEach(function (i) { laterIds[i.id] = true; });
      // 面接で入力した内容から出た留意点も Step3 でチェックできるので「面接で確認する項目へ」を出す
      const hereIds = {};
      interviewNewItems(state.handoff).forEach(function (i) { hereIds[i.id] = true; });
      const anyLater = j.unresolved.some(function (i) { return laterIds[i.id] || hereIds[i.id]; });
      html += '<div class="card" id="judgeWarnings"><div class="card-head"><h3>確認事項</h3></div><ul class="list-x">' + j.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
        (j.unresolved.length ? '<h3 class="sub">未確認の留意点</h3><div class="handoff-list">' + j.unresolved.map(function (i) {
          return '<div class="handoff-item sev-' + i.severity + '" data-item-id="' + esc(i.id) + '" style="grid-template-columns:1fr;cursor:default"><div><div class="handoff-meta"><span class="badge ' + (i.severity === 'block' ? 'danger' : i.severity === 'warn' ? 'warn' : 'info') + '">' + esc(R.SEVERITY[i.severity].label) + '</span>' +
            (laterIds[i.id] ? '<span class="tag tag-warn">面接で確認</span>' : '') + '</div><div class="handoff-text">' + esc(i.text) + '</div></div></div>';
        }).join('') + '</div><div class="actions" style="margin-top:10px"><button type="button" class="btn sm" data-action="to-step" data-step="2">申し送りを確認する</button>' +
          (anyLater ? '<button type="button" class="btn sm" data-action="to-step" data-step="3">面接で確認する項目へ</button>' : '') + '</div>' : '') +
      '</div>';
    }

    if (contribOn() && c && c.parts && c.parts.length) {
      html += '<div class="grid-2">' +
        '<div class="card"><div class="card-head"><h3>面接評価の内訳</h3><div class="spacer"></div><span class="badge ' + (BAND_TONE[(j.interview || {}).band] || '') + '">' + fmtNum(j.pct) + '%</span></div>' + interviewBarsHtml(j) + '</div>' +
        '<div class="card"><div class="card-head"><h3>シフト貢献度の内訳</h3><div class="spacer"></div><span class="badge ' + (j.mode === 'incomplete' ? 'warn' : (BAND_TONE[c.band] || '')) + '">' + fmtNum(c.pct) + '%' + (j.mode === 'incomplete' ? '・未確定' : '') + '</span></div>' +
          contribBarsHtml(c) +
          (c.missing && c.missing.length ? '<div class="alert warn" style="margin-top:10px"><span class="ico">⚠</span><span>未確認：' + esc(c.missing.join('・')) + '</span></div>' : '') +
        '</div>' +
      '</div>';
    } else {
      html += '<div class="card"><div class="card-head"><h3>評価内訳</h3></div>' + interviewBarsHtml(j) + '</div>';
    }

    if (f.vacation || f.allNight || f.holidayWork || f.weekendFreq) {
      const desc = R.describeApplicant(a, p).filter(function (r) {
        return ['祝日', '土日の頻度', 'オールナイト'].indexOf(r.label) >= 0 || r.label.indexOf('深夜帯') === 0;
      });
      const cc = c || R.computeContribution(a, p);
      html += '<div class="card" id="busyAllNightResult"><div class="card-head"><h3>繁忙期・オールナイト</h3></div><div class="grid-2">' +
        '<div>' + (f.vacation ? busyTableHtml(cc) : '<p class="empty">繁忙期の入力は OFF です。</p>') + '</div>' +
        '<div><table class="table kv">' + (desc.length ? desc.map(function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; }).join('') : '<tr><td class="empty">未入力</td></tr>') + '</table></div>' +
      '</div></div>';
    }

    html += '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>面接での強み</h3></div>' + (j.strengths.length ? '<ul class="list-check">' + j.strengths.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="empty">4点以上の項目はありません。</p>') + '</div>' +
      '<div class="card"><div class="card-head"><h3>面接での懸念</h3></div>' + (j.concerns.length ? '<ul class="list-x">' + j.concerns.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="empty">2点以下の項目はありません。</p>') + '</div>' +
    '</div>';

    if (state.interviewNotes) {
      html += '<div class="card"><div class="card-head"><h3>面接所見</h3></div><p style="white-space:pre-wrap">' + esc(state.interviewNotes) + '</p></div>';
    }

    // 応募情報サマリー：応募時の情報（面接前に入力・申し送りコメントは末尾）／面接で確認した情報 の 2 表
    const rowsHtml = function (rows) { return rows.map(function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; }).join(''); };
    const descRows = R.describeApplicant(a, p);
    const preRows = descRows.filter(function (r) { return stageOf(r.section) === 'pre' && r.section !== 'notes'; })
      .concat(descRows.filter(function (r) { return r.section === 'notes'; }));
    const laterRows = descRows.filter(function (r) { return stageOf(r.section) === 'interview'; });
    html += '<div class="card" id="applicantSummary"><div class="card-head"><h3>応募情報サマリー</h3></div>' +
      '<h3 class="sub">応募時の情報</h3><table class="table kv">' + rowsHtml(preRows) + '</table>' +
      '<h3 class="sub">面接で確認した情報</h3>' +
      (laterRows.length ? '<table class="table kv">' + rowsHtml(laterRows) + '</table>' : '<p class="empty">面接で確認した項目の入力はありません。</p>') +
    '</div>';

    const h = state.handoff;
    const adj = adjustSummary(j);
    const axisTxt = twoAxis && c ? '　面接' + (j.interview || {}).bandLabel + '×貢献' + (j.mode === 'incomplete' ? '未確定' : c.bandLabel) : '';
    html += '<div class="card"><div class="card-head"><h3>判定履歴</h3></div><ul class="timeline">' +
      '<li class="tl-item"><div><div>Step 2　留意点 ' + (h ? h.items.length : 0) + ' 件（要判断 ' + (h ? h.counts.block : 0) + '・要確認 ' + (h ? h.counts.warn : 0) + '・共有 ' + (h ? h.counts.info : 0) + '）／確認済み ' + (h ? h.items.filter(function (i) { return state.handoffChecks[i.id]; }).length : 0) + ' 件</div><div class="when">' + esc(U.fmtDateTime(h ? h.generatedAt : '')) + '</div></div></li>' +
      '<li class="tl-item"><div><div>Step 3　面接評価 合計 ' + j.total + ' / ' + j.max + ' 点</div></div></li>' +
      (contribOn() && c ? '<li class="tl-item"><div><div>Step 3　シフト貢献度 ' + fmtNum(c.total) + ' / ' + fmtNum(c.max) + '（' + esc(j.mode === 'incomplete' ? '未確定' : (c.bandLabel || '—')) + '）</div></div></li>' : '') +
      '<li class="tl-item"><div><div>Step 4　' + esc(j.title) + esc(axisTxt) + (adj ? '（' + esc(adj) + '）' : '') + '</div><div class="when">' + esc(U.fmtDateTime(j.evaluatedAt)) + '</div></div></li>' +
      (state.savedAt ? '<li class="tl-item"><div><div>保存済み</div><div class="when">' + esc(U.fmtDateTime(state.savedAt)) + '</div></div></li>' : '') +
    '</ul></div>';

    html += managementCardHtml();
    html += '<div class="actions between no-print">' +
      '<button type="button" class="btn" data-action="to-step" data-step="3">← 面接評価に戻る</button>' +
      '<div class="actions"><button type="button" class="btn" data-action="print">🖨 印刷</button>' +
      '<button type="button" class="btn primary" data-action="save">💾 保存（HTML）</button></div></div>';
    return html;
  }

  // =====================================================================
  // 右サマリー
  // =====================================================================
  function contribSummaryHtml(live) {
    const p = state.profile;
    const co = live.contribution;
    const shiftBadges = live.badges.filter(function (b) { return b.key !== 'hs' && b.key !== 'minor'; });
    const badgesHtml = shiftBadges.length
      ? '<div class="badges">' + shiftBadges.map(function (b) { return '<span class="badge ' + b.tone + '">' + esc(b.label) + '</span>'; }).join('') + '</div>'
      : '';
    if (!contribOn() || !co || !co.enabled) {
      return '<div class="summary-card"><h4>シフト適合</h4>' +
        (badgesHtml || '<p class="empty">勤務曜日・時間を入力すると表示されます。</p>') + '</div>';
    }
    // 面接前（Step1・2）は、面接時に聞くセクションの未回答を「面接で確認」として分けて出す（Step1 で聞く項目に見えないように）
    const before = state.step <= 2;
    const pending = before ? pendingInterviewContrib() : [];
    const laterLabels = {};
    pending.forEach(function (s) { s.missing.forEach(function (m) { if (m.level === 'required') laterLabels[m.label] = true; }); });
    const laterMissing = co.missing.filter(function (x) { return laterLabels[x]; });
    const nowMissing = co.missing.filter(function (x) { return !laterLabels[x]; });
    const missingHtml =
      (nowMissing.length ? '<div class="sum-missing"><span class="badge warn">未確認 ' + nowMissing.length + '</span><span>' + esc(nowMissing.join('・')) + '</span></div>' : '') +
      (laterMissing.length ? '<div class="sum-missing" id="sumContribLater"><span class="badge info">面接で確認 ' + laterMissing.length + '</span><span>' + esc(pending.map(function (s) { return s.label; }).join('・')) + '</span></div>' : '');
    if (hidePointsBeforeInterview()) {
      return '<div class="summary-card" id="sumContrib"><h4>シフト貢献度</h4>' +
        '<p class="empty" id="sumContribHidden">点数は面接評価（Step3）から表示します。</p>' +
        missingHtml + badgesHtml + '</div>';
    }
    if (pending.length) {
      // 未回答を 0 点で数えた点数・帯は出さない（面接前の見込みが低い方へ偏るため。SPEC-stages D17）
      return '<div class="summary-card" id="sumContrib"><h4>シフト貢献度</h4>' +
        '<p class="empty" id="sumContribPending">面接後に確定（面接で確認する項目の回答後に点数を出します）</p>' +
        missingHtml + badgesHtml + '</div>';
    }
    const bands = (p.contribution || {}).bands || {};
    const hi = Math.max(0, Math.min(100, R.num(bands.highPct, 60)));
    const mid = Math.max(0, Math.min(100, R.num(bands.midPct, 35)));
    return '<div class="summary-card" id="sumContrib"><h4>シフト貢献度</h4>' +
      '<div class="contrib-sum"><span class="num big">' + fmtNum(co.total) + '</span><span class="muted"> / ' + fmtNum(co.max) + '</span>' +
        '<span class="badge ' + (BAND_TONE[co.band] || '') + '">' + esc(co.bandLabel) + (co.incomplete ? '・暫定' : '') + '</span>' +
        '<span class="pct num">' + fmtNum(co.pct) + '%</span></div>' +
      '<div class="contrib-gauge" title="中 ' + mid + '% / 高 ' + hi + '%"><span class="fill ' + esc(co.band || '') + '" style="width:' + Math.min(100, Math.max(0, co.pct)) + '%"></span>' +
        '<i style="left:' + mid + '%"></i><i style="left:' + hi + '%"></i></div>' +
      missingHtml +
      badgesHtml +
    '</div>';
  }

  function renderSummary() {
    const a = state.applicant;
    const p = state.profile;
    const ev = p.evaluation;
    const scale = Number(ev.scaleMax) || 5;
    const max = (ev.items || []).length * scale;
    let total = 0, scored = 0;
    (ev.items || []).forEach(function (it) { const v = state.scores[it.id]; if (v != null) { total += Number(v); scored++; } });
    const pct = max ? R.round1(total / max * 100) : 0;
    const th = ev.thresholds || {};
    const iBand = scored ? R.bandOf(pct, R.num(th.recommendPct, 70), R.num(th.reviewPct, 40)) : null;

    const live = R.buildHandoff(a, p); // 入力途中でもバッジ・件数・貢献度をライブ表示
    // 面接前（Step1・2）は Step2 の一覧に出る項目（shownItems）で数え、面接で確認する項目の未入力によるもの
    // （deferred・aggregate）は内訳として別に出す（要判断が隠れないように件数と要判断の数を示す）。Step3 以降は判定時と同じ全件
    const before = state.step <= 2;
    const countOf = function (items) {
      const o = { block: 0, warn: 0, info: 0 };
      items.forEach(function (i) { if (o[i.severity] != null) o[i.severity]++; });
      return o;
    };
    const counts = before ? countOf(shownItems(live)) : live.counts;
    const laterLive = before ? laterItems(live) : [];
    const laterBlock = laterLive.filter(function (i) { return i.severity === 'block'; }).length;
    const attrBadges = live.badges.filter(function (b) { return b.key === 'hs' || b.key === 'minor'; });
    // 「確認済み x/y」は Step2 に出る項目（shownItems）で数える
    const sumItems = state.handoff ? shownItems(state.handoff) : [];
    const checked = sumItems.filter(function (i) { return state.handoffChecks[i.id]; }).length;
    const j = state.judgment;

    const chip = $('#applicantChip');
    chip.className = 'chip-applicant' + (state.dirty ? ' dirty' : state.savedAt ? ' saved' : '');
    chip.innerHTML = '<span class="dot"></span><span>' + (a.name ? '<strong>' + esc(a.name) + '</strong> さん' : '未入力') + (state.dirty ? '・未保存' : state.savedAt ? '・保存済み' : '') + '</span>';

    const r = 36, c = 2 * Math.PI * r;
    const dash = (Math.min(100, pct) / 100) * c;
    const gaugeCls = j ? j.result : '';
    const twoAxis = j && j.mode && j.mode !== 'interviewOnly';

    $('#summaryPanel').innerHTML =
      '<div class="summary-card"><h4>応募者</h4>' +
        '<div class="sum-name">' + (a.name ? esc(a.name) + ' <span class="muted" style="font-size:13px;font-weight:600">さん</span>' : '<span class="muted">未入力</span>') + '</div>' +
        '<div class="sum-sub">' + esc([a.category, a.age ? a.age + '歳' : '', a.gender].filter(Boolean).join('・') || '区分・年齢未入力') + '</div>' +
        (attrBadges.length ? '<div class="badges" style="margin-top:6px">' + attrBadges.map(function (b) { return '<span class="badge ' + b.tone + '">' + esc(b.label) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="sum-row"><span class="sum-label">通勤</span><span class="sum-val">' + esc([a.commuteMethod, a.commuteMinutes ? a.commuteMinutes + '分' : ''].filter(Boolean).join(' ') || '—') + '</span></div>' +
        '<div class="sum-row"><span class="sum-label">勤務期間</span><span class="sum-val">' + esc(R.labelOf(p.options.workPeriods, a.workPeriod) || '—') + '</span></div>' +
        '<div class="sum-row"><span class="sum-label">週日数</span><span class="sum-val">' + esc((a.daysMin || a.daysMax) ? (a.daysMin || '?') + '〜' + (a.daysMax || '?') + '日' : '—') + '</span></div>' +
      '</div>' +
      contribSummaryHtml(live) +
      '<div class="summary-card"><h4>留意点</h4>' +
        '<div class="sum-counts">' +
          '<div class="sum-count block"><b>' + counts.block + '</b><span>要判断</span></div>' +
          '<div class="sum-count warn"><b>' + counts.warn + '</b><span>要確認</span></div>' +
          '<div class="sum-count info"><b>' + counts.info + '</b><span>共有</span></div>' +
        '</div>' +
        (laterLive.length ? '<p class="hint sum-later" id="sumLater">ほかに面接で確認する項目の未入力による留意点 ' + laterLive.length + ' 件' +
          (laterBlock ? '（うち<b class="sev-block-text">要判断 ' + laterBlock + ' 件</b>）' : '') + '</p>' : '') +
        (state.handoff ? '<div class="progress" style="margin-top:10px"><span>確認済み ' + checked + '/' + sumItems.length + '</span><div class="progress-bar"><span style="width:' + (sumItems.length ? Math.round(checked / sumItems.length * 100) : 100) + '%"></span></div></div>' : '') +
      '</div>' +
      '<div class="summary-card"><h4>面接評価</h4><div class="gauge-wrap">' +
        '<svg class="gauge" viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="' + r + '" fill="none" stroke-width="8"/>' +
        '<circle class="fill ' + gaugeCls + '" cx="42" cy="42" r="' + r + '" fill="none" stroke-width="8" stroke-linecap="round" transform="rotate(-90 42 42)" stroke-dasharray="' + dash.toFixed(1) + ' ' + c.toFixed(1) + '"/>' +
        '<text x="42" y="40" text-anchor="middle">' + total + '</text><text class="small" x="42" y="54" text-anchor="middle">/ ' + max + '点</text></svg>' +
        '<div><div class="sum-row" style="border:none;padding:2px 0"><span class="sum-label">入力</span><span class="sum-val">' + scored + ' / ' + (ev.items || []).length + ' 項目</span></div>' +
        '<div class="sum-row" style="border:none;padding:2px 0"><span class="sum-label">得点率</span><span class="sum-val">' + pct + '%' +
          (iBand ? ' <span class="badge ' + BAND_TONE[iBand] + '">' + esc(bandLabelOf(iBand)) + '</span>' : '') + '</span></div></div>' +
      '</div></div>' +
      '<div class="summary-card" id="sumJudgment"><h4>判定</h4>' +
        (j
          ? '<span class="badge lg ' + RESULT_TONE[j.result] + '">' + esc(j.title) + '</span>' +
            (twoAxis ? '<div class="sum-sub" style="margin-top:6px">面接 ' + esc((j.interview || {}).bandLabel) + ' × 貢献 ' + esc(j.mode === 'incomplete' ? '未確定' : (j.contribution || {}).bandLabel) + '</div>' : '') +
            (j.adjusted ? '<div class="sum-sub">（' + esc(adjustSummary(j) || '調整あり') + '）</div>' : '')
          : state.judgmentStale
            ? '<p class="empty" id="sumJudgmentStale">判定後に入力・設定が変わりました。Step4 で再判定してください（保存時は現在の内容で再判定して記録します）。</p>'
            : '<p class="empty">' + (contribOn() ? '面接評価とシフト貢献度の2軸で判定します。' : '面接評価を入力後に判定します。') + '</p>') +
        (state.savedAt ? '<div class="sum-sub" style="margin-top:8px">最終保存 ' + esc(U.fmtDateTime(state.savedAt)) + '</div>' : '') +
      '</div>';
  }

  // =====================================================================
  // 保存・読込・新規
  // =====================================================================
  function saveRecord() {
    const a = state.applicant;
    if (!a.name) { toast('応募者名を入力してから保存してください', 'error'); return; }
    if (!state.handoff || state.handoffStale) {
      rebuildHandoff();
      if (state.step === 2 || state.step === 3) renderStep();
    }
    // 判定後に入力・設定が変わっていたら、古い判定を記録に残さず現在の内容で再判定する
    let rejudged = false;
    if (state.judgmentStale && !state.judgment) {
      state.judgment = R.evaluateHiring(state.applicant, state.scores, state.profile, state.handoff, state.handoffChecks);
      state.judgmentStale = false;
      rejudged = true;
    }
    const rec = S.buildRecord(state);
    const html = S.generateReportHTML(rec, state.profile);
    S.download('応募者_' + S.safeName(a.name) + '_' + U.fmtDate(new Date()) + '.html', html, 'text/html;charset=utf-8');
    state.savedAt = rec.savedAt;
    state.dirty = false;
    renderSummary();
    if (state.step === 4) renderStep();
    toast(a.name + ' さんの情報を保存しました' + (rejudged ? '（判定後に入力・設定が変わったため、現在の内容で再判定しました：' + state.judgment.title + '）' : ''), 'ok');
  }

  function onFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
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

  function applyRecord(rec) {
    const p = state.profile;
    // 新しい項目（繁忙期の日数・オールナイト等）は空で補われる
    state.applicant = U.deepMerge(emptyApplicant(p), rec.applicant || {});
    const ver = Number(rec.schemaVersion) || 1;
    const isLegacy = ver < 2 && !(rec.applicant && rec.applicant.vacationDays);
    const sj = rec.judgment || null;
    state.legacyRecord = isLegacy
      ? { savedJudgment: sj ? { result: sj.result, title: sj.title, total: sj.total, max: sj.max, pct: sj.pct } : null }
      : null;
    state.handoffChecks = U.deepClone((rec.handoff && rec.handoff.checks) || {});
    state.handoffNote = (rec.handoff && rec.handoff.note) || '';
    state.scores = U.deepClone(rec.scores || {});
    state.interviewNotes = rec.interviewNotes || '';
    state.management = U.isObj(rec.management) ? U.deepClone(rec.management) : {};
    state.judgment = null;
    state.judgmentStale = false;
    state.savedAt = rec.savedAt || null;
    state.dirty = false;
    state.preFillOpen = null;   // 段階は現在の設定で表示（面接時の項目に値があれば Step1 の折りたたみは自動で開く）
    // 前の応募者の留意点が残らないよう、必ず作り直す
    state.handoff = R.buildHandoff(state.applicant, p);
    state.handoffStale = false;
    state.handoffBase = {};
    state.handoff.items.forEach(function (i) { state.handoffBase[i.id] = i.text; });
    const target = sj ? 4 : Object.keys(state.scores).length ? 3 : 2;
    state.step = target;
    state.maxStepReached = target;
    showView('judge');
    goStep(target);

    let msg = (state.applicant.name || '応募者') + ' さんのデータを読み込みました';
    if (rec.profile && rec.profile.theaterName && rec.profile.theaterName !== p.meta.theaterName) {
      msg = 'このファイルは「' + rec.profile.theaterName + '」の設定で保存されています。現在の設定で再判定します。';
    }
    if (target === 4 && sj && state.judgment && sj.result !== state.judgment.result) {
      msg = '保存時の判定（' + (sj.title || resultTitle(sj.result)) + '）と現在の設定での再判定（' + state.judgment.title + '）が異なります';
    }
    toast(msg, 'ok');
  }

  function onProfileFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
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
    renderBrand();
    state.applicant = U.deepMerge(emptyApplicant(p), state.applicant);
    state.handoffStale = true;
    invalidateJudgment();
    toast(rep.migratedFrom ? MIGRATION_MSG : 'プロファイルを読み込みました', 'ok');
    showView('settings');
  }

  function newRecord() {
    if (state.dirty && !window.confirm('入力中の内容を破棄して新規作成しますか？')) return;
    state.applicant = emptyApplicant(state.profile);
    state.handoff = null; state.handoffStale = false; state.handoffChecks = {}; state.handoffNote = ''; state.handoffBase = null;
    state.scores = {}; state.interviewNotes = ''; state.judgment = null; state.judgmentStale = false;
    state.management = {};
    state.legacyRecord = null;
    state.savedAt = null; state.dirty = false;
    state.preFillOpen = null;
    state.step = 1; state.maxStepReached = 1;
    showView('judge');
    toast('新規の応募者を開始しました');
  }

  // =====================================================================
  // 使い方
  // =====================================================================
  // =====================================================================
  // 申し送りシート（A4 1枚）の印刷
  // =====================================================================
  // 留意点が多いときは 2 段組みにして 1 枚に収める
  function prepareHandoffSheet(on) {
    const items = $('#handoffItems');
    if (on) {
      const n = items ? $$('.handoff-item', items).length : 0;
      if (items) items.classList.toggle('sheet-2col', n >= 9);
      document.body.classList.add('print-handoff');
    } else {
      document.body.classList.remove('print-handoff');
      if (items) items.classList.remove('sheet-2col');
    }
  }

  function printHandoffSheet() {
    if (state.step !== 2) { goStep(2); }
    prepareHandoffSheet(true);
    const done = function () { prepareHandoffSheet(false); window.removeEventListener('afterprint', done); };
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
    return '<div class="card" id="mgmtCard"><div class="card-head"><h2>応募者の管理（押印）</h2>' +
      '<p>担当者を選んで押印してください。押印は保存ファイル（HTML）に入り、レポート上でも押印できます。名簿は設定の「応募者の管理」で編集します。</p></div>' +
      '<div class="stamp-row">' + fields.map(function (fld, idx) {
        const e = state.management[fld.id];
        const svg = e && e.name ? Stamp.render(e, { size: 88, id: 'app' + idx }) : '';
        return '<div class="stamp-box" data-field-id="' + esc(fld.id) + '">' +
          '<div class="stamp-label">' + esc(fld.label) + '</div>' +
          '<div class="stamp-hint">' + esc(fld.hint || '') + '</div>' +
          '<div class="stamp-area">' + (svg || '<div class="stamp-empty">未押印</div>') + '</div>' +
          '<div class="stamp-meta">' + (e && e.name ? esc(e.name + (e.title ? '（' + e.title + '）' : '') + '　' + (e.date || '')) : '') + '</div>' +
          '<div class="stamp-ctl no-print">' +
            '<select data-stamp-select aria-label="' + esc(fld.label) + ' 担当者"><option value="">担当者を選択</option>' +
              managers.map(function (m, i) { return '<option value="' + i + '">' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>'; }).join('') +
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

  function helpHtml() {
    const m = state.profile.meta;
    return '<div class="card"><div class="card-head"><h2>' + esc(m.appTitle) + ' の使い方</h2><p>アルバイト採用の判断基準を統一するためのツールです。面接前は「留意点の申し送り」、面接後は「採用可否の判定」を行います。</p></div>' +
      '<div class="help-steps">' +
        '<div class="help-step"><span class="n">1</span><h3>応募情報を入力</h3><p>採用担当が応募書類・連絡内容をもとに入力します。必須は氏名・年齢・区分・通勤・曜日・時間・週の最大勤務日数・勤務期間です（週の最大勤務日数は設定で任意にもできます）。繁忙期・深夜帯・オールナイト・かけもちなどは面接で確認します（分かっていれば折りたたみから先に入力できます）。面接者への申し送りコメントは申し送りの冒頭に表示されます。</p></div>' +
        '<div class="help-step"><span class="n">2</span><h3>面接者へ申し送り</h3><p>申し送りコメント、面接で確認すること、留意点（要判断・要確認・共有）と強みが自動で出ます。「申し送り文をコピー」でチャット等に貼り付けて共有できます。</p></div>' +
        '<div class="help-step"><span class="n">3</span><h3>面接評価・面接で確認</h3><p>面接者が各項目を採点し、「面接で確認する項目」に面接で聞いた内容を入力します。判定に必要なシフト条件（*）が未確認だと判定に進めません。</p></div>' +
        '<div class="help-step"><span class="n">4</span><h3>採用可否判定</h3><p>面接評価とシフト貢献度の2軸（マトリクス）で「採用推奨／上長最終判断要／不採用推奨」を判定します。「要判断」の留意点が未確認・高校生の採用方針に該当する場合は採用推奨に留めません。</p></div>' +
      '</div></div>' +
      '<div class="card"><div class="card-head"><h3>保存と読み込み</h3></div>' +
        '<ul class="list-plain"><li><b>保存（HTML）</b>：応募者ごとに1ファイル。ブラウザで開けば判定レポートとして読め、アプリの「読み込み」でそのまま再開できます。</li>' +
        '<li>途中段階でも保存できます。読み込むと保存時点のステップに戻ります。</li>' +
        '<li>旧形式のファイルも読み込めます。繁忙期の日数などは未確認になるため、Step3 で入力してから再判定してください。</li>' +
        '<li>応募者データはこの端末のブラウザには残りません（保存したファイルのみが記録です）。</li></ul></div>' +
      '<div class="card"><div class="card-head"><h3>設定（劇場プロファイル）</h3></div>' +
        '<ul class="list-plain"><li>留意点の文言・ON/OFF・重要度、しきい値、評価項目、結果文言を画面から変更できます。</li>' +
        '<li>設定は端末のブラウザに保存されます。他の劇場・端末へ展開するときは JSON を書き出して読み込んでください。</li>' +
        '<li>区分の「グループ」が学生・高校生などの判定に使われます。</li>' +
        '<li>応募情報（Step1）で入力する項目と、面接で確認して Step3 で入力する項目（面接前／面接時）は、設定画面の「入力の段階」で切り替えられます。</li></ul></div>' +
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
  global.RecruitApp = { state: state, goStep: goStep, showView: showView, buildHandoffText: buildHandoffText, emptyApplicant: emptyApplicant, prepareHandoffSheet: prepareHandoffSheet };
})(window);
