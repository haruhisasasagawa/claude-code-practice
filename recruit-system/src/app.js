/*
 * 画面制御
 * ----------------------------------------------------------------------
 * Step1 応募情報 → Step2 面接者への申し送り（留意点） → Step3 面接評価 → Step4 採用可否判定
 * 右側のサマリーパネルは入力のたびに更新する。
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
    { n: 3, label: '面接評価', hint: '面接者が採点' },
    { n: 4, label: '採用可否判定', hint: '判定結果・保存' }
  ];

  const state = {
    view: 'judge',
    step: 1,
    maxStepReached: 1,
    profile: null,
    applicant: null,
    handoff: null,
    handoffChecks: {},
    handoffNote: '',
    scores: {},
    interviewNotes: '',
    judgment: null,
    savedAt: null,
    dirty: false
  };

  // =====================================================================
  // 初期化
  // =====================================================================
  function init() {
    state.profile = S.loadProfile();
    state.applicant = emptyApplicant(state.profile);
    applyTheme(S.loadTheme());
    renderBrand();
    bindGlobal();
    showView('judge');
  }

  function emptyApplicant(profile) {
    const shifts = {};
    R.DAYS.forEach(function (d) { shifts[d.key] = { start: '', end: '', nextDay: false }; });
    shifts.any = { start: '', end: '', nextDay: false };
    const vacation = {};
    ((profile.options || {}).vacationItems || []).forEach(function (v) { vacation[v.id] = ''; });
    return {
      name: '', gender: '', age: '', category: '', graduationDate: '',
      commuteMethod: '', commuteMinutes: '', nearestStation: '',
      workDays: [], anyDay: false, daysMin: '', daysMax: '',
      shifts: shifts,
      workPeriod: '', sideJob: '', sideJobDetail: '',
      vacation: vacation,
      lateNight: { availability: '', returnMethod: '', lastTrain: '', taxiFare: '' },
      foreign: { isForeign: '', residenceStatus: '', workPermit: '', residenceExpiry: '', japaneseLevel: '' },
      department: '', applicationRoute: '',
      reviewerNotes: ''
    };
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
          // 新しい長期休暇項目などに合わせて応募者データのキーを補う
          state.applicant = U.deepMerge(emptyApplicant(state.profile), state.applicant);
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
    if (n === 2) state.handoff = R.buildHandoff(state.applicant, state.profile);
    if (n === 4) {
      if (!state.handoff) state.handoff = R.buildHandoff(state.applicant, state.profile);
      state.judgment = R.evaluateHiring(state.applicant, state.scores, state.profile, state.handoff, state.handoffChecks);
    }
    state.step = n;
    state.maxStepReached = Math.max(state.maxStepReached, n);
    renderStepNav(); renderStep(); renderSummary();
    const top = $('#view-judge').getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
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
      case 1: c.innerHTML = inputStepHtml(); applyVisibility(); updateTimeDisplays(); break;
      case 2: c.innerHTML = handoffStepHtml(); break;
      case 3: c.innerHTML = interviewStepHtml(); updateScoreUI(); break;
      case 4: c.innerHTML = resultStepHtml(); break;
      default: c.innerHTML = '';
    }
  }

  // =====================================================================
  // Step1: 応募情報
  // =====================================================================
  function optHtml(options, value) {
    return (options || []).map(function (o) {
      const v = typeof o === 'string' ? o : o.value;
      const l = typeof o === 'string' ? o : o.label;
      return '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }

  function fSelect(path, label, options, o) {
    o = o || {};
    const value = U.getPath(state.applicant, path) || '';
    return '<div class="field"' + (o.id ? ' id="' + o.id + '"' : '') + '><label>' + esc(label) + (o.required ? '<span class="req">*</span>' : '') + '</label>' +
      '<select data-field="' + path + '"' + (o.required ? ' data-required' : '') + '><option value="">' + esc(o.placeholder || '選択してください') + '</option>' + optHtml(options, value) + '</select>' +
      (o.hint ? '<div class="hint">' + esc(o.hint) + '</div>' : '') + '</div>';
  }

  function fInput(path, label, o) {
    o = o || {};
    const value = U.getPath(state.applicant, path);
    const attrs = [
      'type="' + (o.type || 'text') + '"',
      'data-field="' + path + '"',
      'value="' + esc(value == null ? '' : value) + '"',
      o.required ? 'data-required' : '',
      o.placeholder ? 'placeholder="' + esc(o.placeholder) + '"' : '',
      o.min !== undefined ? 'min="' + o.min + '"' : '',
      o.max !== undefined ? 'max="' + o.max + '"' : '',
      o.step !== undefined ? 'step="' + o.step + '"' : '',
      o.list ? 'list="' + o.list + '"' : '',
      o.autocomplete ? 'autocomplete="' + o.autocomplete + '"' : ''
    ].filter(Boolean).join(' ');
    const input = '<input ' + attrs + '>';
    return '<div class="field"' + (o.id ? ' id="' + o.id + '"' : '') + '><label>' + esc(label) + (o.required ? '<span class="req">*</span>' : '') + '</label>' +
      (o.suffix ? '<div class="inline">' + input + '<span class="suffix">' + esc(o.suffix) + '</span></div>' : input) +
      (o.hint ? '<div class="hint">' + esc(o.hint) + '</div>' : '') + '</div>';
  }

  function fTextarea(path, label, o) {
    o = o || {};
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<textarea data-field="' + path + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.placeholder || '') + '">' + esc(U.getPath(state.applicant, path) || '') + '</textarea></div>';
  }

  // ラジオ風セグメント。options: [{value,label,tone}]
  function fSeg(path, label, options, o) {
    o = o || {};
    const cur = U.getPath(state.applicant, path) || '';
    return '<div class="field"' + (o.id ? ' id="' + o.id + '"' : '') + '><label>' + esc(label) + (o.required ? '<span class="req">*</span>' : '') + '</label>' +
      '<div class="seg" data-seg="' + path + '">' + options.map(function (op) {
        return '<label class="seg-opt' + (op.tone ? ' tone-' + op.tone : '') + (cur === op.value ? ' on' : '') + '">' +
          '<input type="radio" name="seg-' + path + '" value="' + esc(op.value) + '" data-field="' + path + '"' + (cur === op.value ? ' checked' : '') + '><span>' + esc(op.label) + '</span></label>';
      }).join('') + '</div>' +
      (o.hint ? '<div class="hint">' + esc(o.hint) + '</div>' : '') + '</div>';
  }

  const TRI = [{ value: 'ok', label: '○ 可能', tone: 'ok' }, { value: 'consult', label: '△ 要相談', tone: 'warn' }, { value: 'ng', label: '× 不可', tone: 'danger' }];

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

  function inputStepHtml() {
    const a = state.applicant;
    const p = state.profile;
    const o = p.options;
    const f = p.features;
    const prm = p.params;

    let html = '';

    html += '<div class="card"><div class="card-head"><h2>基本情報</h2><p>応募書類・応募フォームの内容を入力してください。<span class="req">*</span> は必須です。</p></div>' +
      '<div class="field-row">' +
        fInput('name', '応募者名', { required: true, placeholder: '例：山田 太郎', autocomplete: 'off' }) +
        fSelect('gender', '性別', o.genders) +
      '</div>' +
      '<div class="field-row cols-3">' +
        fInput('age', '年齢', { type: 'number', min: 15, max: 99, suffix: '歳', required: true }) +
        fSelect('category', '区分', o.categories.map(function (c) { return c.value; }), { required: true }) +
        (f.graduationDate ? fInput('graduationDate', '卒業予定年月', { type: 'month', id: 'grp-graduation' }) : '') +
      '</div>' +
    '</div>';

    html += '<div class="card"><div class="card-head"><h2>通勤</h2></div>' +
      '<div class="field-row cols-3">' +
        fSelect('commuteMethod', '通勤方法', o.commuteMethods, { required: true }) +
        fInput('commuteMinutes', '通勤時間', { type: 'number', min: 1, max: 240, suffix: '分', required: true }) +
        fInput('nearestStation', '最寄り駅／バス停', { id: 'grp-station', list: 'stationHints', placeholder: '例：新宿', hint: '乗換案内で所要時間・終電も確認しておくと面接がスムーズです。' }) +
      '</div>' +
      '<datalist id="stationHints">' + (o.stationHints || []).map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
    '</div>';

    html += '<div class="card"><div class="card-head"><h2>勤務条件</h2></div>' +
      '<div class="field"><label>勤務可能曜日<span class="req">*</span></label>' +
        '<div class="chip-group" id="dayChips">' +
          R.DAYS.map(function (d) {
            const on = a.workDays.indexOf(d.key) >= 0;
            return '<label class="chip' + (on ? ' on' : '') + '"><input type="checkbox" data-field="workDays" data-array value="' + d.key + '"' + (on ? ' checked' : '') + '><span>' + d.label + '</span></label>';
          }).join('') +
          '<label class="chip chip-any' + (a.anyDay ? ' on' : '') + '"><input type="checkbox" data-field="anyDay"' + (a.anyDay ? ' checked' : '') + '><span>曜日問わず</span></label>' +
        '</div></div>' +
      '<div class="field-row">' +
        fInput('daysMin', '週の最低勤務日数', { type: 'number', min: 1, max: 7, suffix: '日' }) +
        fInput('daysMax', '週の最大勤務日数', { type: 'number', min: 1, max: 7, suffix: '日' }) +
      '</div>' +
      '<div class="field"><label>勤務希望時間<span class="req">*</span></label>' +
        '<div class="time-rows" id="timeRows">' +
          timeRowHtml('any', '曜日問わず') +
          R.DAYS.map(function (d) { return timeRowHtml(d.key, d.label + '曜'); }).join('') +
          '<div class="time-empty" id="timeEmpty">勤務可能曜日を選ぶと、曜日ごとの時間入力欄が表示されます。</div>' +
        '</div>' +
        '<div class="hint">終了時間が開始時間より早い場合は自動的に「翌日」扱いになります。</div>' +
        '<div class="alert danger hidden" id="hsWarn"><span class="ico">⚠</span><span>高校生は ' + esc(prm.highschoolLatestEnd || '22:00') + ' を超える勤務はできません。入力内容を確認してください。</span></div>' +
      '</div>' +
      '<div class="field-row">' +
        fSelect('workPeriod', '勤務期間', o.workPeriods, { required: true }) +
        fSeg('sideJob', 'かけもち', [{ value: 'no', label: 'なし' }, { value: 'yes', label: 'あり', tone: 'warn' }]) +
      '</div>' +
      '<div id="grp-sidejob-detail">' + fInput('sideJobDetail', 'かけもち先・週の勤務時間など', { placeholder: '例：コンビニ 週2日 10時間程度' }) + '</div>' +
      (f.vacation && (o.vacationItems || []).length ? (
        '<h3 class="sub">長期休暇の対応</h3><div class="field-row cols-' + Math.min(o.vacationItems.length, 4) + '">' +
          o.vacationItems.map(function (v) { return fSeg('vacation.' + v.id, v.label, TRI); }).join('') +
        '</div>') : '') +
    '</div>';

    if (f.lateNight) {
      html += '<div class="card"><div class="card-head"><h2>深夜帯（' + esc(prm.lateNightStartHour || 22) + '時以降）</h2><p>クローズ要員の見込みと、帰宅手段を確認します。</p></div>' +
        '<div class="field-row">' +
          fSeg('lateNight.availability', esc(prm.lateNightStartHour || 22) + '時以降の勤務', TRI) +
          fSelect('lateNight.returnMethod', '深夜帯の帰宅手段', o.returnMethods) +
        '</div>' +
        '<div class="field-row">' +
          fInput('lateNight.lastTrain', '終電時刻（最寄り駅発）', { type: 'time', id: 'grp-lasttrain', hint: 'クローズ後に間に合うか確認します。' }) +
          (f.taxi ? fInput('lateNight.taxiFare', 'タクシー料金の目安（自宅まで）', { type: 'number', min: 0, step: 100, suffix: '円', id: 'grp-taxi', hint: '規定金額: ' + Number(prm.taxiLimitYen || 0).toLocaleString('ja-JP') + '円' }) : '') +
        '</div>' +
      '</div>';
    }

    if (f.foreignNational) {
      html += '<div class="card"><div class="card-head"><h2>外国籍・在留資格</h2><p>該当する場合、資格外活動許可と週' + esc(prm.foreignWeeklyHourCap || 28) + '時間上限の確認事項を自動で申し送ります。</p></div>' +
        fSeg('foreign.isForeign', '外国籍', [{ value: 'no', label: '該当なし' }, { value: 'yes', label: '該当する', tone: 'warn' }]) +
        '<div id="grp-foreign-detail">' +
          '<div class="field-row">' +
            fSelect('foreign.residenceStatus', '在留資格', o.residenceStatuses) +
            fSelect('foreign.workPermit', '資格外活動許可', o.workPermitStates) +
          '</div>' +
          '<div class="field-row">' +
            fInput('foreign.residenceExpiry', '在留期限', { type: 'month' }) +
            fSelect('foreign.japaneseLevel', '日本語レベル', o.japaneseLevels) +
          '</div>' +
        '</div>' +
      '</div>';
    }

    const extras = [];
    if (f.department) extras.push(fSelect('department', '希望部署', o.departments));
    if (f.applicationRoute) extras.push(fSelect('applicationRoute', '応募経路', o.applicationRoutes));
    html += '<div class="card"><div class="card-head"><h2>その他</h2></div>' +
      (extras.length ? '<div class="field-row">' + extras.join('') + '</div>' : '') +
      fTextarea('reviewerNotes', '担当者所見（応募時点）', { placeholder: '応募書類や連絡時の印象、気になった点など' }) +
    '</div>';

    html += '<div class="actions end"><button type="button" class="btn primary" data-action="generate-handoff">留意点を生成して申し送りへ →</button></div>';
    return html;
  }

  function show(sel, on) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (el) el.classList.toggle('hidden', !on);
  }

  function applyVisibility() {
    const a = state.applicant;
    const f = state.profile.features;
    const group = R.categoryGroup(state.profile, a.category);
    show('#grp-graduation', !!f.graduationDate && R.isStudentGroup(group));
    show('#grp-station', a.commuteMethod === '公共交通機関');
    show('#grp-sidejob-detail', a.sideJob === 'yes');
    $$('.time-row[data-day]').forEach(function (row) {
      const k = row.dataset.day;
      show(row, k === 'any' ? a.anyDay : (!a.anyDay && a.workDays.indexOf(k) >= 0));
    });
    show('#timeEmpty', !a.anyDay && a.workDays.length === 0);
    show('#grp-lasttrain', a.lateNight.returnMethod === 'train');
    show('#grp-taxi', !!f.taxi && a.lateNight.returnMethod === 'taxi');
    show('#grp-foreign-detail', a.foreign.isForeign === 'yes');

    const sh = R.analyzeShifts(a, state.profile);
    const limit = R.toMinutes(state.profile.params.highschoolLatestEnd || '22:00');
    show('#hsWarn', group === 'highschool' && sh.latestEndAbs != null && limit != null && sh.latestEndAbs > limit);
  }

  function updateTimeDisplays() {
    const late = (Number(state.profile.params.lateNightStartHour) || 22) * 60;
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
      let txt = R.fmtDuration(min);
      if (s.nextDay) txt += '（翌' + s.end + 'まで）';
      if (endAbs > late) txt += ' ・深夜帯あり';
      out.textContent = txt;
      out.classList.toggle('late', endAbs > late);
    });
  }

  function onFieldEvent(e) {
    const t = e.target;
    if (!t || !t.dataset) return;

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
        U.setPath(state.applicant, path, t.value);
      }
      const chip = t.closest('.chip');
      if (chip && t.type === 'checkbox') chip.classList.toggle('on', t.checked);
      if (t.hasAttribute('data-required')) t.classList.remove('invalid');
      state.dirty = true;
      applyVisibility();
      updateTimeDisplays();
      renderSummary();
      return;
    }

    if (t.dataset.check) {
      state.handoffChecks[t.dataset.check] = t.checked;
      const item = t.closest('.handoff-item');
      if (item) item.classList.toggle('done', t.checked);
      state.dirty = true;
      renderHandoffProgress();
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
      case 'copy-handoff':
        copyHandoffText();
        break;
      case 'judge':
        if (validateScores()) goStep(4);
        break;
      case 'score': {
        const id = b.dataset.item;
        const v = Number(b.dataset.value);
        state.scores[id] = state.scores[id] === v ? undefined : v;
        if (state.scores[id] === undefined) delete state.scores[id];
        state.dirty = true;
        updateScoreUI();
        renderSummary();
        break;
      }
      case 'save':
        saveRecord();
        break;
      case 'print':
        window.print();
        break;
      default:
        break;
    }
  }

  function validateInput() {
    const missing = [];
    $$('#stepContent [data-required]').forEach(function (el) {
      const visible = !el.closest('.hidden');
      if (visible && !String(el.value || '').trim()) { el.classList.add('invalid'); missing.push(el); }
      else el.classList.remove('invalid');
    });
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
      toast('必須項目（' + missing.length + '件）が未入力です', 'error');
      missing[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      missing[0].focus();
      return false;
    }
    return true;
  }

  // =====================================================================
  // Step2: 面接者への申し送り
  // =====================================================================
  function handoffStepHtml() {
    const h = state.handoff;
    const a = state.applicant;
    const p = state.profile;
    const sev = R.SEVERITY;
    const groups = ['block', 'warn', 'info'].map(function (k) {
      return { key: k, meta: sev[k], items: h.items.filter(function (i) { return i.severity === k; }) };
    });
    const shiftRows = R.describeShifts(a, p);

    let html = '<div class="card"><div class="card-head"><h2>面接者への申し送り</h2>' +
      '<div class="spacer"></div><span class="badge accent lg">' + esc(a.name) + ' さん</span>' +
      '<p>' + esc(p.texts.handoffIntro || '') + '</p></div>' +
      '<div class="grid-2">' +
        '<div><h3 class="sub">応募者</h3><table class="table kv">' +
          [['区分', a.category + (a.age ? '（' + a.age + '歳）' : '')],
           ['通勤', [a.commuteMethod, a.commuteMinutes ? a.commuteMinutes + '分' : '', a.nearestStation].filter(Boolean).join(' / ')],
           ['勤務期間', R.labelOf(p.options.workPeriods, a.workPeriod)],
           ['週勤務日数', (a.daysMin || a.daysMax) ? (a.daysMin || '?') + '〜' + (a.daysMax || '?') + '日' : '未入力']
          ].map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1] || '未入力') + '</td></tr>'; }).join('') +
        '</table></div>' +
        '<div><h3 class="sub">希望シフト</h3>' +
          (shiftRows.length ? '<ul class="list-plain">' + shiftRows.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="empty">未入力</p>') +
          '<div class="badges" style="margin-top:10px">' + h.badges.map(function (b) { return '<span class="badge ' + b.tone + '">' + esc(b.label) + '</span>'; }).join('') + '</div>' +
        '</div>' +
      '</div>' +
      (h.strengths.length ? '<h3 class="sub">強み（面接者へ共有）</h3><ul class="strength-list">' + h.strengths.map(function (s) { return '<li>' + esc(s.text) + '</li>'; }).join('') + '</ul>' : '') +
    '</div>';

    html += '<div class="card"><div class="card-head"><h2>留意点 <span class="muted" style="font-weight:500">' + h.items.length + '件</span></h2>' +
      '<div class="spacer"></div><div class="progress" id="handoffProgress" style="min-width:220px"></div>' +
      '<p>確認が済んだ項目にチェックを入れてください。チェック状況は保存ファイルと採用可否判定に反映されます。</p></div>';

    if (!h.items.length) {
      html += '<div class="alert ok"><span class="ico">✓</span><span>自動抽出された留意点はありません。面接者には応募者の強みと希望シフトを共有してください。</span></div>';
    }
    groups.forEach(function (g) {
      if (!g.items.length) return;
      const tone = g.key === 'block' ? 'danger' : g.key === 'warn' ? 'warn' : 'info';
      html += '<div class="handoff-group"><div class="handoff-group-head"><span class="badge ' + tone + '">' + esc(g.meta.label) + '</span><h3>' + g.items.length + '件</h3><span class="desc">' + esc(g.meta.desc) + '</span></div>' +
        '<div class="handoff-list">' + g.items.map(function (i) {
          const done = !!state.handoffChecks[i.id];
          return '<label class="handoff-item sev-' + i.severity + (done ? ' done' : '') + '">' +
            '<input type="checkbox" data-check="' + esc(i.id) + '"' + (done ? ' checked' : '') + '>' +
            '<div><div class="handoff-meta"><span class="tag">' + esc(i.categoryLabel) + '</span></div><div class="handoff-text">' + esc(i.text) + '</div></div>' +
          '</label>';
        }).join('') + '</div></div>';
    });
    html += '</div>';

    html += '<div class="card"><div class="card-head"><h2>担当者からの追記</h2><p>自動抽出に含まれない申し送り事項があれば記入してください（面接者向け）。</p></div>' +
      '<textarea data-note="handoff" rows="3" placeholder="例：電話での受け答えがとても丁寧でした。土曜は月2回程度なら可能とのこと。">' + esc(state.handoffNote) + '</textarea></div>';

    html += '<div class="actions between">' +
      '<button type="button" class="btn" data-action="to-step" data-step="1">← 応募情報に戻る</button>' +
      '<div class="actions"><button type="button" class="btn" data-action="copy-handoff">📋 申し送り文をコピー</button>' +
      '<button type="button" class="btn primary" data-action="to-step" data-step="3">面接評価へ進む →</button></div></div>';
    return html;
  }

  function renderHandoffProgress() {
    const el = $('#handoffProgress');
    if (!el || !state.handoff) return;
    const total = state.handoff.items.length;
    const done = state.handoff.items.filter(function (i) { return state.handoffChecks[i.id]; }).length;
    const pct = total ? Math.round(done / total * 100) : 100;
    el.innerHTML = '<span>確認済み ' + done + ' / ' + total + '</span><div class="progress-bar"><span style="width:' + pct + '%"></span></div>';
  }

  function buildHandoffText() {
    const h = state.handoff;
    const a = state.applicant;
    const p = state.profile;
    const lines = [];
    lines.push('【面接者への申し送り】' + p.meta.theaterName);
    lines.push('応募者：' + a.name + ' さん（' + [a.category, a.age ? a.age + '歳' : ''].filter(Boolean).join('・') + '）');
    R.describeApplicant(a, p).forEach(function (r) {
      if (['氏名', '年齢', '区分', '担当者所見'].indexOf(r.label) >= 0) return;
      lines.push(r.label + '：' + r.value);
    });
    ['block', 'warn', 'info'].forEach(function (k) {
      const items = h.items.filter(function (i) { return i.severity === k; });
      if (!items.length) return;
      lines.push('');
      lines.push('■' + R.SEVERITY[k].label + '（' + R.SEVERITY[k].desc + '）');
      items.forEach(function (i) { lines.push((state.handoffChecks[i.id] ? '☑ ' : '☐ ') + i.text); });
    });
    if (h.strengths.length) {
      lines.push('');
      lines.push('■強み');
      h.strengths.forEach(function (s) { lines.push('・' + s.text); });
    }
    if (a.reviewerNotes) { lines.push(''); lines.push('■担当者所見'); lines.push(a.reviewerNotes); }
    if (state.handoffNote) { lines.push(''); lines.push('■担当者からの追記'); lines.push(state.handoffNote); }
    return lines.join('\n');
  }

  function copyHandoffText() {
    const text = buildHandoffText();
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
  function interviewStepHtml() {
    const ev = state.profile.evaluation;
    const scale = Number(ev.scaleMax) || 5;
    const h = state.handoff;
    const unresolved = h ? h.items.filter(function (i) { return !state.handoffChecks[i.id]; }) : [];
    const unresolvedBlock = unresolved.filter(function (i) { return i.severity === 'block'; });

    let html = '';
    if (unresolved.length) {
      html += '<div class="alert ' + (unresolvedBlock.length ? 'danger' : 'warn') + '"><span class="ico">⚠</span><span>未確認の留意点が ' + unresolved.length + ' 件あります' +
        (unresolvedBlock.length ? '（うち要判断 ' + unresolvedBlock.length + ' 件）' : '') + '。' +
        '<button type="button" class="btn link" data-action="to-step" data-step="2">申し送りを確認する</button></span></div>';
    }

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
    const pctEl = $('#scorePct'); if (pctEl) pctEl.textContent = max ? Math.round(total / max * 100) + '%' : '';
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
  // Step4: 採用可否判定
  // =====================================================================
  function resultStepHtml() {
    const j = state.judgment;
    const a = state.applicant;
    const p = state.profile;
    const scale = Number(p.evaluation.scaleMax) || 5;
    const icon = j.result === 'recommend' ? '🎉' : j.result === 'review' ? '⚖' : '✖';

    let html = '<div class="result-card ' + j.result + '">' +
      '<div class="result-kicker">採用可否判定 ・ ' + esc(a.name) + ' さん</div>' +
      '<div class="result-title"><span>' + icon + '</span><span>' + esc(j.title) + '</span></div>' +
      '<div class="result-body">' + esc(j.body) + '</div>' +
      '<div class="metrics">' +
        '<div class="metric"><div class="metric-val num">' + j.total + ' <small>/ ' + j.max + '点</small></div><div class="metric-lbl">面接評価 合計</div></div>' +
        '<div class="metric"><div class="metric-val num">' + j.pct + '<small>%</small></div><div class="metric-lbl">得点率</div></div>' +
        '<div class="metric"><div class="metric-val num">' + j.thresholds.recommendPts + '<small>点以上</small></div><div class="metric-lbl">' + esc(p.texts.recommend.title) + '（' + j.thresholds.recommendPct + '%）</div></div>' +
        '<div class="metric"><div class="metric-val num">' + j.thresholds.reviewPts + '<small>点以上</small></div><div class="metric-lbl">' + esc(p.texts.review.title) + '（' + j.thresholds.reviewPct + '%）</div></div>' +
      '</div>' +
      '<div class="result-disclaimer">' + esc(j.disclaimer) + '</div>' +
    '</div>';

    if (j.warnings.length) {
      html += '<div class="card"><div class="card-head"><h3>確認事項</h3></div><ul class="list-x">' + j.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' +
        (j.unresolved.length ? '<h3 class="sub">未確認の留意点</h3><div class="handoff-list">' + j.unresolved.map(function (i) {
          return '<div class="handoff-item sev-' + i.severity + '" style="grid-template-columns:1fr;cursor:default"><div><div class="handoff-meta"><span class="badge ' + (i.severity === 'block' ? 'danger' : i.severity === 'warn' ? 'warn' : 'info') + '">' + esc(R.SEVERITY[i.severity].label) + '</span></div><div class="handoff-text">' + esc(i.text) + '</div></div></div>';
        }).join('') + '</div><div class="actions" style="margin-top:10px"><button type="button" class="btn sm" data-action="to-step" data-step="2">申し送りを確認する</button></div>' : '') +
      '</div>';
    }

    html += '<div class="card"><div class="card-head"><h3>評価内訳</h3></div><div class="bars">' + j.breakdown.map(function (b) {
      const s = b.score == null ? 0 : b.score;
      const pct = Math.round(s / scale * 100);
      const tone = s <= 2 ? 'lo' : s === 3 ? 'mid' : 'hi';
      return '<div class="bar-row' + (b.isOverall ? ' overall' : '') + '"><div class="bar-label">' + esc(b.label) + '</div><div class="bar-track"><div class="bar-fill ' + tone + '" style="width:' + pct + '%"></div></div><div class="bar-val num">' + (b.score == null ? '-' : b.score) + '</div></div>';
    }).join('') + '</div></div>';

    html += '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><h3>面接での強み</h3></div>' + (j.strengths.length ? '<ul class="list-check">' + j.strengths.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="empty">4点以上の項目はありません。</p>') + '</div>' +
      '<div class="card"><div class="card-head"><h3>面接での懸念</h3></div>' + (j.concerns.length ? '<ul class="list-x">' + j.concerns.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="empty">2点以下の項目はありません。</p>') + '</div>' +
    '</div>';

    if (state.interviewNotes) {
      html += '<div class="card"><div class="card-head"><h3>面接所見</h3></div><p style="white-space:pre-wrap">' + esc(state.interviewNotes) + '</p></div>';
    }

    html += '<div class="card"><div class="card-head"><h3>応募情報サマリー</h3></div><table class="table kv">' +
      R.describeApplicant(a, p).map(function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; }).join('') + '</table></div>';

    const h = state.handoff;
    html += '<div class="card"><div class="card-head"><h3>判定履歴</h3></div><ul class="timeline">' +
      '<li class="tl-item"><div><div>Step 2　留意点 ' + (h ? h.items.length : 0) + ' 件（要判断 ' + (h ? h.counts.block : 0) + '・要確認 ' + (h ? h.counts.warn : 0) + '・共有 ' + (h ? h.counts.info : 0) + '）／確認済み ' + (h ? h.items.filter(function (i) { return state.handoffChecks[i.id]; }).length : 0) + ' 件</div><div class="when">' + esc(U.fmtDateTime(h ? h.generatedAt : '')) + '</div></div></li>' +
      '<li class="tl-item"><div><div>Step 3　面接評価 合計 ' + j.total + ' / ' + j.max + ' 点</div></div></li>' +
      '<li class="tl-item"><div><div>Step 4　' + esc(j.title) + (j.adjusted ? '（要判断未確認のため調整）' : '') + '</div><div class="when">' + esc(U.fmtDateTime(j.evaluatedAt)) + '</div></div></li>' +
      (state.savedAt ? '<li class="tl-item"><div><div>保存済み</div><div class="when">' + esc(U.fmtDateTime(state.savedAt)) + '</div></div></li>' : '') +
    '</ul></div>';

    html += '<div class="actions between no-print">' +
      '<button type="button" class="btn" data-action="to-step" data-step="3">← 面接評価に戻る</button>' +
      '<div class="actions"><button type="button" class="btn" data-action="print">🖨 印刷</button>' +
      '<button type="button" class="btn primary" data-action="save">💾 保存（HTML）</button></div></div>';
    return html;
  }

  // =====================================================================
  // 右サマリー
  // =====================================================================
  function renderSummary() {
    const a = state.applicant;
    const p = state.profile;
    const ev = p.evaluation;
    const scale = Number(ev.scaleMax) || 5;
    const max = (ev.items || []).length * scale;
    let total = 0, scored = 0;
    (ev.items || []).forEach(function (it) { const v = state.scores[it.id]; if (v != null) { total += Number(v); scored++; } });
    const pct = max ? Math.round(total / max * 100) : 0;

    const live = R.buildHandoff(a, p); // 入力途中でもバッジ・件数をライブ表示
    const badges = live.badges;
    const counts = live.counts;
    const checked = state.handoff ? state.handoff.items.filter(function (i) { return state.handoffChecks[i.id]; }).length : 0;
    const j = state.judgment;

    const chip = $('#applicantChip');
    chip.className = 'chip-applicant' + (state.dirty ? ' dirty' : state.savedAt ? ' saved' : '');
    chip.innerHTML = '<span class="dot"></span><span>' + (a.name ? '<strong>' + esc(a.name) + '</strong> さん' : '未入力') + (state.dirty ? '・未保存' : state.savedAt ? '・保存済み' : '') + '</span>';

    const r = 36, c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    const gaugeCls = j ? j.result : '';

    $('#summaryPanel').innerHTML =
      '<div class="summary-card"><h4>応募者</h4>' +
        '<div class="sum-name">' + (a.name ? esc(a.name) + ' <span class="muted" style="font-size:13px;font-weight:600">さん</span>' : '<span class="muted">未入力</span>') + '</div>' +
        '<div class="sum-sub">' + esc([a.category, a.age ? a.age + '歳' : '', a.gender].filter(Boolean).join('・') || '区分・年齢未入力') + '</div>' +
        '<div class="sum-row"><span class="sum-label">通勤</span><span class="sum-val">' + esc([a.commuteMethod, a.commuteMinutes ? a.commuteMinutes + '分' : ''].filter(Boolean).join(' ') || '—') + '</span></div>' +
        '<div class="sum-row"><span class="sum-label">勤務期間</span><span class="sum-val">' + esc(R.labelOf(p.options.workPeriods, a.workPeriod) || '—') + '</span></div>' +
        '<div class="sum-row"><span class="sum-label">週日数</span><span class="sum-val">' + esc((a.daysMin || a.daysMax) ? (a.daysMin || '?') + '〜' + (a.daysMax || '?') + '日' : '—') + '</span></div>' +
      '</div>' +
      '<div class="summary-card"><h4>シフト適合</h4>' +
        (badges.length ? '<div class="badges">' + badges.map(function (b) { return '<span class="badge ' + b.tone + '">' + esc(b.label) + '</span>'; }).join('') + '</div>' : '<p class="empty">勤務曜日・時間を入力すると表示されます。</p>') +
      '</div>' +
      '<div class="summary-card"><h4>留意点</h4>' +
        '<div class="sum-counts">' +
          '<div class="sum-count block"><b>' + counts.block + '</b><span>要判断</span></div>' +
          '<div class="sum-count warn"><b>' + counts.warn + '</b><span>要確認</span></div>' +
          '<div class="sum-count info"><b>' + counts.info + '</b><span>共有</span></div>' +
        '</div>' +
        (state.handoff ? '<div class="progress" style="margin-top:10px"><span>確認済み ' + checked + '/' + state.handoff.items.length + '</span><div class="progress-bar"><span style="width:' + (state.handoff.items.length ? Math.round(checked / state.handoff.items.length * 100) : 100) + '%"></span></div></div>' : '') +
      '</div>' +
      '<div class="summary-card"><h4>面接評価</h4><div class="gauge-wrap">' +
        '<svg class="gauge" viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="' + r + '" fill="none" stroke-width="8"/>' +
        '<circle class="fill ' + gaugeCls + '" cx="42" cy="42" r="' + r + '" fill="none" stroke-width="8" stroke-linecap="round" transform="rotate(-90 42 42)" stroke-dasharray="' + dash.toFixed(1) + ' ' + c.toFixed(1) + '"/>' +
        '<text x="42" y="40" text-anchor="middle">' + total + '</text><text class="small" x="42" y="54" text-anchor="middle">/ ' + max + '点</text></svg>' +
        '<div><div class="sum-row" style="border:none;padding:2px 0"><span class="sum-label">入力</span><span class="sum-val">' + scored + ' / ' + (ev.items || []).length + ' 項目</span></div>' +
        '<div class="sum-row" style="border:none;padding:2px 0"><span class="sum-label">得点率</span><span class="sum-val">' + pct + '%</span></div></div>' +
      '</div></div>' +
      '<div class="summary-card"><h4>判定</h4>' +
        (j ? '<span class="badge lg ' + (j.result === 'recommend' ? 'ok' : j.result === 'review' ? 'warn' : 'danger') + '">' + esc(j.title) + '</span>' : '<p class="empty">面接評価を入力後に判定します。</p>') +
        (state.savedAt ? '<div class="sum-sub" style="margin-top:8px">最終保存 ' + esc(U.fmtDateTime(state.savedAt)) + '</div>' : '') +
      '</div>';
  }

  // =====================================================================
  // 保存・読込・新規
  // =====================================================================
  function saveRecord() {
    const a = state.applicant;
    if (!a.name) { toast('応募者名を入力してから保存してください', 'error'); return; }
    if (!state.handoff) state.handoff = R.buildHandoff(a, state.profile);
    const rec = S.buildRecord(state);
    const html = S.generateReportHTML(rec, state.profile);
    S.download('応募者_' + S.safeName(a.name) + '_' + U.fmtDate(new Date()) + '.html', html, 'text/html;charset=utf-8');
    state.savedAt = rec.savedAt;
    state.dirty = false;
    renderSummary();
    if (state.step === 4) renderStep();
    toast(a.name + ' さんの情報を保存しました', 'ok');
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
      toast((rec.applicant.name || '応募者') + ' さんのデータを読み込みました', 'ok');
    };
    reader.readAsText(file, 'utf-8');
  }

  function applyRecord(rec) {
    state.applicant = U.deepMerge(emptyApplicant(state.profile), rec.applicant || {});
    state.handoffChecks = (rec.handoff && rec.handoff.checks) || {};
    state.handoffNote = (rec.handoff && rec.handoff.note) || '';
    state.scores = rec.scores || {};
    state.interviewNotes = rec.interviewNotes || '';
    state.judgment = null;
    state.savedAt = rec.savedAt || null;
    state.dirty = false;
    const target = rec.judgment ? 4 : Object.keys(state.scores).length ? 3 : 2;
    state.maxStepReached = target;
    if (rec.profile && rec.profile.theaterName && rec.profile.theaterName !== state.profile.meta.theaterName) {
      toast('このファイルは「' + rec.profile.theaterName + '」の設定で保存されています。現在の設定で再判定します。');
    }
    showView('judge');
    goStep(target);
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
    try { p = S.parseProfileJSON(text); } catch (err) { toast('読み込めません: ' + err.message, 'error'); return; }
    if (!window.confirm('「' + p.meta.theaterName + '」のプロファイルを読み込み、現在の設定を置き換えます。よろしいですか？')) return;
    state.profile = p;
    S.saveProfile(p);
    renderBrand();
    state.applicant = U.deepMerge(emptyApplicant(p), state.applicant);
    toast('プロファイルを読み込みました', 'ok');
    showView('settings');
  }

  function newRecord() {
    if (state.dirty && !window.confirm('入力中の内容を破棄して新規作成しますか？')) return;
    state.applicant = emptyApplicant(state.profile);
    state.handoff = null; state.handoffChecks = {}; state.handoffNote = '';
    state.scores = {}; state.interviewNotes = ''; state.judgment = null;
    state.savedAt = null; state.dirty = false;
    state.step = 1; state.maxStepReached = 1;
    showView('judge');
    toast('新規の応募者を開始しました');
  }

  // =====================================================================
  // 使い方
  // =====================================================================
  function helpHtml() {
    const m = state.profile.meta;
    return '<div class="card"><div class="card-head"><h2>' + esc(m.appTitle) + ' の使い方</h2><p>アルバイト採用の判断基準を統一するためのツールです。面接前は「留意点の申し送り」、面接後は「採用可否の判定」を行います。</p></div>' +
      '<div class="help-steps">' +
        '<div class="help-step"><span class="n">1</span><h3>応募情報を入力</h3><p>採用担当が応募書類・連絡内容をもとに入力します。必須は氏名・年齢・区分・通勤・曜日・時間・勤務期間です。</p></div>' +
        '<div class="help-step"><span class="n">2</span><h3>面接者へ申し送り</h3><p>条件に応じた留意点（要判断・要確認・共有）と強みが自動で出ます。「申し送り文をコピー」でチャット等に貼り付けて共有できます。</p></div>' +
        '<div class="help-step"><span class="n">3</span><h3>面接評価</h3><p>面接者が各項目を採点します。総合判断が低いときは警告が出ます。</p></div>' +
        '<div class="help-step"><span class="n">4</span><h3>採用可否判定</h3><p>得点率で「採用推奨／上長最終判断要／不採用推奨」を判定します。「要判断」の留意点が未確認なら採用推奨に留めません。</p></div>' +
      '</div></div>' +
      '<div class="card"><div class="card-head"><h3>保存と読み込み</h3></div>' +
        '<ul class="list-plain"><li><b>保存（HTML）</b>：応募者ごとに1ファイル。ブラウザで開けば判定レポートとして読め、アプリの「読み込み」でそのまま再開できます。</li>' +
        '<li>途中段階でも保存できます。読み込むと保存時点のステップに戻ります。</li>' +
        '<li>応募者データはこの端末のブラウザには残りません（保存したファイルのみが記録です）。</li></ul></div>' +
      '<div class="card"><div class="card-head"><h3>設定（劇場プロファイル）</h3></div>' +
        '<ul class="list-plain"><li>留意点の文言・ON/OFF・重要度、しきい値、評価項目、結果文言を画面から変更できます。</li>' +
        '<li>設定は端末のブラウザに保存されます。他の劇場・端末へ展開するときは JSON を書き出して読み込んでください。</li>' +
        '<li>区分の「グループ」が学生・高校生などの判定に使われます。</li></ul></div>' +
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
  global.RecruitApp = { state: state, goStep: goStep, showView: showView };
})(window);
