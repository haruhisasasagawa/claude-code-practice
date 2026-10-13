/*
 * 設定画面（劇場プロファイル編集）
 * ----------------------------------------------------------------------
 * data-bind="path.to.value" を持つ入力をプロファイルの下書き（draft）に双方向バインドする。
 * 構造が変わる操作（面接チェックリストの項目・繁忙期の追加・削除・並べ替え）は draft を変更してから再描画する。
 * data-repaint を持つ入力は change で再描画する（合計点・境界値の表示更新用）。
 * 「設定を保存」で RecruitStorage.validateProfile を通し、エラーが無ければ app 側の onSave に draft を渡す。
 */
;(function (global) {
  'use strict';

  const U = global.RecruitUtil;
  const esc = U.esc;

  let root = null;
  let draft = null;
  let handlers = null;
  let issues = null;   // 直近の保存時チェック結果 { errors, warnings }
  // 再描画の遅延: 入力欄の change（フォーカスが外れたとき）で即座に描き直すと、
  // 「設定を保存」などのボタンを押した瞬間（mousedown〜mouseup の間）にボタンが作り直され、クリックが失われる。
  // マウスを押している間は再描画を待ち、クリックの処理が終わってから描き直す。
  let pointerDown = false;
  let downInRoot = false;
  let repaintPending = false;
  let pointerBound = false;

  function R() { return global.RecruitRules || {}; }
  function categoryLabels() { return R().CATEGORY_LABELS || {}; }
  function categoryOrder() { return R().CATEGORY_ORDER || ['general']; }
  function lockedRules() { return R().LOCKED_RULES || {}; }

  const GROUP_HINT = 'highschool（高校生）/ university（大学・大学院）/ vocational（専門学校）/ freeter / homemaker / doubleworker / other';
  const VARS_HINT = '{name} {age} {ageText} {maxAge} {category} {commuteTime} {nearestStation} {minDays} {maxDays} {dayCount} {claimDays} {minShiftHours} ' +
    '{graduationDate} {monthsLeft} {workPeriodLabel} {periodMinMonths} {ageRange} {highschoolLatestEnd} {hsUnmet} {hsExceptionCategories} {careerPathLabel} {destination} ' +
    '{foreignWeeklyHourCap} {foreignVacationWeeklyHourCap} {weeklyHours} {sideJobHours} {residenceExpiry} {japaneseLevel} ' +
    '{taxiFare} {taxiLimitYen} {closeEndHour} {lateNightStartHour} {latestEnd} {lastTrain} {lastTrainBufferMinutes} {nightReason} {nightWish} ' +
    '{allNightAvail} {allNightFreq} {allNightShiftStart} {allNightShiftEnd} {weekendFreqLabel} {vacationLabels} {missingLabels} {confirmSummary} {confirmSections} {contribPct} {busyPct}';
  const RESULT_VARS_HINT = '{name} {total} {max} {pct} {interviewPct} {interviewBand} {contribTotal} {contribMax} {contribPct} {contribBand}';
  const UNIT_OPTIONS = [
    { value: 'total', label: '期間の合計日数' },
    { value: 'perWeek', label: '週あたり日数' },
    { value: 'perEvent', label: '1回あたり日数' }
  ];
  const BANDS = ['high', 'mid', 'low'];

  // ---------- 描画ヘルパー ----------
  function val(path) {
    const v = U.getPath(draft, path);
    return v === undefined || v === null ? '' : v;
  }

  function n(v, def) { const x = Number(v); return v === '' || v == null || isNaN(x) ? def : x; }

  function inputTag(path, opts) {
    opts = opts || {};
    const attrs = [
      'type="' + (opts.type || 'text') + '"',
      'data-bind="' + esc(path) + '"',
      'value="' + esc(val(path)) + '"',
      opts.min !== undefined ? 'min="' + opts.min + '"' : '',
      opts.max !== undefined ? 'max="' + opts.max + '"' : '',
      opts.step !== undefined ? 'step="' + opts.step + '"' : '',
      opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '"' : '',
      opts.repaint ? 'data-repaint' : '',
      opts.disabled ? 'disabled' : '',
      opts.cls ? 'class="' + esc(opts.cls) + '"' : '',
      opts.aria ? 'aria-label="' + esc(opts.aria) + '"' : ''
    ].filter(Boolean).join(' ');
    return '<input ' + attrs + '>';
  }

  function sInput(path, label, opts) {
    opts = opts || {};
    const tag = inputTag(path, opts);
    return '<div class="field"><label>' + esc(label) + '</label>' +
      (opts.suffix ? '<div class="inline">' + tag + '<span class="suffix">' + esc(opts.suffix) + '</span></div>' : tag) +
      (opts.hint ? '<div class="hint">' + esc(opts.hint) + '</div>' : '') + '</div>';
  }

  function sTextarea(path, label, opts) {
    opts = opts || {};
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<textarea data-bind="' + esc(path) + '" rows="' + (opts.rows || 3) + '">' + esc(val(path)) + '</textarea>' +
      (opts.hint ? '<div class="hint">' + esc(opts.hint) + '</div>' : '') + '</div>';
  }

  function sLines(path, label, opts) {
    opts = opts || {};
    const arr = U.getPath(draft, path) || [];
    let text;
    if (opts.type === 'categories') text = arr.map(function (c) { return c.value + '|' + (c.group || 'other'); }).join('\n');
    else if (opts.type === 'managers') text = arr.map(function (c) { return [c.name, c.short || '', c.title || ''].concat(c.grade ? [c.grade] : []).join('|'); }).join('\n');
    else text = arr.join('\n');
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<textarea data-bind="' + esc(path) + '" data-type="' + (opts.type || 'lines') + '" rows="' + (opts.rows || Math.min(Math.max(arr.length + 1, 3), 12)) + '">' + esc(text) + '</textarea>' +
      '<div class="hint">1行に1項目。' + (opts.hint ? esc(opts.hint) : '') + '</div></div>';
  }

  function sCheck(path, label, hint, opts) {
    opts = opts || {};
    return '<label class="check-row"><input type="checkbox" data-bind="' + esc(path) + '"' + (val(path) ? ' checked' : '') +
      (opts.repaint ? ' data-repaint' : '') + '>' +
      '<div><div class="lbl">' + esc(label) + '</div>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div></label>';
  }

  function selectTag(path, options, opts) {
    opts = opts || {};
    const cur = String(val(path));
    return '<select data-bind="' + esc(path) + '"' + (opts.cls ? ' class="' + esc(opts.cls) + '"' : '') +
      (opts.repaint ? ' data-repaint' : '') + (opts.aria ? ' aria-label="' + esc(opts.aria) + '"' : '') + (opts.disabled ? ' disabled' : '') + '>' +
      options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (String(o.value) === cur ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
      '</select>';
  }

  function sSelect(path, label, options, hint, opts) {
    return '<div class="field"><label>' + esc(label) + '</label>' + selectTag(path, options, opts) +
      (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
  }

  function section(id, title, desc, body) {
    return '<section class="card" id="' + id + '"><div class="card-head"><h2>' + esc(title) + '</h2>' + (desc ? '<p>' + esc(desc) + '</p>' : '') + '</div>' + body + '</section>';
  }

  function offNotice(featureOn, msg) {
    return featureOn ? '' : '<div class="alert warn s-off">' + esc(msg) + '</div>';
  }

  function resultTitle(r) {
    const t = (draft.texts || {})[r] || {};
    return t.title || { recommend: '採用推奨', review: '上長最終判断要', reject: '不採用推奨' }[r] || r;
  }

  function bandLabel(b) {
    const bl = (draft.texts || {}).bandLabels || {};
    return bl[b] || { high: '高', mid: '中', low: '低' }[b];
  }

  // ---------- テンプレート ----------
  function template() {
    return '' +
    '<div class="settings-layout">' +
      '<nav class="settings-nav">' +
        '<a href="#s-meta">劇場情報</a><a href="#s-features">入力項目のON/OFF</a><a href="#s-stages">面接前／面接時</a><a href="#s-options">選択肢</a>' +
        '<a href="#s-busy">繁忙期・オールナイト</a><a href="#s-params">判定パラメータ</a><a href="#s-hs">高校生の扱い</a>' +
        '<a href="#s-rules">申し送りルール</a><a href="#s-checklist">面接チェックリスト</a><a href="#s-contrib">シフト貢献度</a>' +
        '<a href="#s-matrix">2軸判定</a><a href="#s-texts">結果文言</a><a href="#s-mgmt">応募者の管理（押印）</a><a href="#s-io">書き出し／読み込み</a>' +
      '</nav>' +
      '<div class="settings-body">' +
        issuesHtml() +
        metaHtml() + featuresHtml() + stagesHtml() + optionsHtml() + busyHtml() + paramsHtml() + hsHtml() +
        section('s-rules', '面接者への申し送りルール',
          '応募情報が条件に合致したときに表示される留意点です。ON/OFF・重要度・文言を変更できます（条件そのものはコードで定義）。',
          '<div class="legend"><span class="badge danger">要判断</span>採用担当が面接実施・採用の可否を判断　<span class="badge warn">要確認</span>面接時に確認　<span class="badge info">共有</span>面接者へ共有　<span class="badge danger">法令（OFF不可）</span>労働基準法に関わるため OFF・重要度変更不可（文言は編集可）</div>' +
          '<div class="hint" style="margin-bottom:10px">文言で使える変数: <code>' + esc(VARS_HINT) + '</code></div>' +
          rulesHtml()) +
        checklistHtml() + contribHtml() + matrixHtml() + textsHtml() + mgmtHtml() + ioHtml() +
      '</div>' +
    '</div>' +
    '<div class="save-bar"><span class="note">変更は「設定を保存」で反映されます。</span>' +
      '<button type="button" class="btn ghost" data-action="discard">変更を破棄</button>' +
      '<button type="button" class="btn primary" data-action="save">設定を保存</button></div>';
  }

  function issuesHtml() {
    if (!issues || !issues.errors.length) return '';
    return '<div class="alert danger s-issues" id="settingsIssues"><div><b>保存できません。次の項目を直してください。</b><ul>' +
      issues.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div></div>';
  }

  function metaHtml() {
    return section('s-meta', '劇場情報', '画面上部・保存ファイルに表示されます。',
      '<div class="field-row">' + sInput('meta.theaterName', '劇場名') + sInput('meta.appTitle', 'アプリ名') + '</div>' +
      '<div class="field-row">' + sInput('meta.version', 'バージョン表記') + '</div>' +
      sTextarea('meta.footer', 'フッター（著作権表記など）', { rows: 2 }));
  }

  function featuresHtml() {
    return section('s-features', '入力項目のON/OFF', '劇場で不要な項目はOFFにすると入力画面・判定から除外されます。',
      sCheck('features.graduationDate', '卒業予定年月（学生）', '卒業までの残り月数と勤務期間の確認、勤務期間の貢献度の上限に使います。OFF にしても「卒業後も当劇場で継続」の欄は高校3年生の例外判定のために表示されます。') +
      sCheck('features.vacation', '繁忙期（連休・長期休暇）の勤務可否', '3連休・GW・お盆・年末年始など。期間は「繁忙期・オールナイト」で編集。', { repaint: true }) +
      sCheck('features.vacationDays', '繁忙期ごとの出られる日数', '○△の期間に「何日出られるか」を入力させ、貢献度に反映します（繁忙期の勤務可否が前提）。') +
      sCheck('features.holidayWork', '祝日の勤務可否', '平日の祝日・振替休日に勤務できるか。') +
      sCheck('features.weekendFreq', '土日の出勤頻度', 'OFFのときは勤務可能曜日から推定します。') +
      sCheck('features.allNight', 'オールナイト上映のシフト', '終映後〜翌朝の通し勤務の可否と頻度。22時以降の勤務（深夜帯）とは別に確認します。', { repaint: true }) +
      sCheck('features.lateNight', '深夜帯（22時以降）勤務可否・帰宅手段', 'クローズ要員の見込み、終電確認に使います。') +
      sCheck('features.taxi', 'タクシー帰宅時の規定金額チェック', '深夜帯がONのときのみ有効。') +
      sCheck('features.foreignNational', '外国籍・在留資格・日本語レベル', '資格外活動許可、週28時間上限、在留期限の確認を自動で出します。') +
      sCheck('features.contribution', 'シフト貢献度と2軸判定', 'OFFにすると従来どおり面接評価のみで採用可否を判定します。', { repaint: true }) +
      sCheck('features.department', '希望部署', '記録用。判定には使いません。') +
      sCheck('features.applicationRoute', '応募経路', '記録用。判定には使いません。'));
  }

  // 入力の段階（面接前に入力／面接時に確認）。docs/SPEC-stages.md 2-3
  const STAGE_OPTIONS = [{ value: 'pre', label: '面接前に入力（Step1）' }, { value: 'interview', label: '面接時に確認（Step3）' }];
  const STAGE_NOTE = {
    commute: '（面接時にすると、通勤方法・通勤時間を Step1 で必須にしません）',
    hsException: '（高校3年生のみ）',
    continuation: '（高校3年生以外の学生）'
  };
  function stagesHtml() {
    const Rr = R();
    const sections = Rr.INPUT_SECTIONS || [];
    if (!sections.length || !Rr.stageOf) return '';
    if (!U.isObj(draft.inputStages)) draft.inputStages = U.deepClone(global.RECRUIT_DEFAULT_PROFILE.inputStages || {});
    if (!U.isObj(draft.stageOptions)) draft.stageOptions = U.deepClone(global.RECRUIT_DEFAULT_PROFILE.stageOptions || {});
    const flagLater = draft.inputStages.foreignFlag === 'interview';
    // 該当の有無が面接時なら詳細も面接時（normalize・rules.stageOf と同じ制約）
    if (flagLater) draft.inputStages.foreignDetail = 'interview';
    const fixedRows = [
      '基本情報（氏名・性別・年齢・区分・卒業予定年月）',
      '勤務条件（曜日・時間・週の勤務日数・勤務期間）',
      '面接者への申し送りコメント'
    ].map(function (t) {
      return '<div class="s-stage-row fixed"><div><div class="lbl">' + esc(t) + '</div></div><div><span class="badge">常に面接前</span></div></div>';
    }).join('');
    const rows = sections.filter(function (s) { return !s.fixed; }).map(function (s) {
      const id = s.id;
      const active = Rr.sectionActive(draft, id);
      const label = Rr.sectionLabel(draft, id);
      const lockDetail = id === 'foreignDetail' && flagLater;
      return '<div class="s-stage-row' + (active ? '' : ' off') + '" data-stage-id="' + esc(id) + '">' +
        '<div><div class="lbl">' + esc(label) + '</div>' +
          '<div class="hint">含む項目: ' + esc(Rr.sectionAsk(draft, id)) + esc(STAGE_NOTE[id] || '') + '</div>' +
          (lockDetail ? '<div class="hint">外国籍（該当の有無）が面接時のため、詳細も面接時になります</div>' : '') +
          (active ? '' : offNotice(false, id === 'hsException' ? '高校生の扱いが「制限なし」のため使われません' : '入力項目が OFF のため使われません')) +
        '</div>' +
        '<div>' + selectTag('inputStages.' + id, STAGE_OPTIONS, { aria: label, repaint: id === 'foreignFlag', disabled: lockDetail }) + '</div>' +
      '</div>';
    }).join('');
    return section('s-stages', '入力の段階（面接前に入力／面接時に確認）',
      '応募情報（Step1）に出す項目と、面接で確認して Step3「面接で確認する項目」で入力する項目を分けます。「面接時に確認」の項目も、分かっていれば Step1 下部の折りたたみから先に入力できます。判定の計算は段階に関係なく同じです。',
      '<div class="s-stage-table">' + fixedRows + rows + '</div>' +
      sCheck('stageOptions.requireDaysMax', '週の最大勤務日数を Step1 の必須にする', '既定は ON（週何日勤務できるかは、時間帯・勤務期間と並んで面接に進めるかの判断材料のため）。OFF のときは空欄でも Step1 から進め、面接で確認します（判定の前には Step3 で必須）。') +
      sCheck('stageOptions.preFillAlwaysOpen', '「面接前に分かっている項目」を常に開いて表示する', 'OFF のときは閉じて表示し、入力済みの項目があるときだけ自動で開きます。') +
      '<div class="actions" style="margin-top:10px">' +
        '<button type="button" class="btn sm" data-action="stages-default">既定に戻す</button>' +
        '<button type="button" class="btn sm ghost" data-action="stages-all-pre">すべて面接前に入力（従来の並び）</button>' +
      '</div>');
  }

  function optionsHtml() {
    const wps = (draft.options.workPeriods || []);
    const cps = (draft.options.careerPaths || []);
    return section('s-options', '選択肢', '入力画面のプルダウンに表示される項目です。繁忙期の期間・土日／オールナイトの頻度は「繁忙期・オールナイト」で編集します。',
      '<div class="field-row">' +
        sLines('options.categories', '区分', { type: 'categories', hint: '「値|グループ」の形式。グループ: ' + GROUP_HINT }) +
        sLines('options.genders', '性別') +
      '</div>' +
      '<div class="field-row">' +
        sLines('options.commuteMethods', '通勤方法') +
        sLines('options.stationHints', '最寄り駅の候補', { hint: '入力補完に使います。' }) +
      '</div>' +
      '<h3 class="sub">勤務期間</h3>' +
      '<div class="hint" style="margin-bottom:6px">「最低月数」は卒業までの残り月数との比較に、「貢献度の割合」はシフト貢献度「勤務期間」の点数（満点に対する割合 0〜1）に使います。</div>' +
      wps.map(function (w, i) {
        return '<div class="field-row cols-3">' +
          sInput('options.workPeriods[' + i + '].label', '表示名（値: ' + w.value + '）') +
          sInput('options.workPeriods[' + i + '].minMonths', '最低月数', { type: 'number', min: 0, max: 60, suffix: 'か月' }) +
          sInput('options.workPeriods[' + i + '].contributionRatio', '貢献度の割合', { type: 'number', min: 0, max: 1, step: 0.05 }) +
        '</div>';
      }).join('') +
      '<h3 class="sub">高校生の進路の種別</h3>' +
      '<div class="field-row cols-4">' +
        cps.map(function (c, i) { return sInput('options.careerPaths[' + i + '].label', '値: ' + c.value); }).join('') +
      '</div>' +
      '<div class="field-row">' +
        sLines('options.japaneseLevels', '日本語レベル', { hint: '最後の行が最も低いレベルとして「要確認」の判定に使われます。' }) +
        sLines('options.residenceStatuses', '在留資格') +
      '</div>' +
      '<div class="field-row">' +
        sLines('options.departments', '希望部署') +
        sLines('options.applicationRoutes', '応募経路') +
      '</div>');
  }

  function busyHtml() {
    const items = draft.options.vacationItems || [];
    const wsum = items.reduce(function (s, v) { return s + Math.max(0, n(v.weight, 0)); }, 0);
    const f = draft.features || {};
    const rows = items.map(function (v, i) {
      const base = 'options.vacationItems[' + i + ']';
      const perWeek = v.unit === 'perWeek';
      return '<div class="s-busy-row' + (n(v.weight, 0) <= 0 ? ' s-muted-row' : '') + '" data-busy-index="' + i + '">' +
        '<div class="s-busy-head"><span class="idx">' + (i + 1) + '</span><code title="内部ID（保存データのキー）">' + esc(v.id) + '</code>' +
          inputTag(base + '.label', { aria: '期間の表示名', cls: 's-busy-label' }) +
          '<div class="row-actions">' +
            '<button type="button" class="btn ghost" data-action="busy-up" data-index="' + i + '" title="上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="btn ghost" data-action="busy-down" data-index="' + i + '" title="下へ"' + (i === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="btn ghost danger" data-action="busy-del" data-index="' + i + '" title="削除"' + (items.length <= 1 ? ' disabled' : '') + '>削除</button>' +
          '</div></div>' +
        '<div class="s-busy-grid">' +
          '<div class="field span-2"><label>期間の説明（入力画面に表示）</label>' + inputTag(base + '.periodNote', { placeholder: '例: 4月末〜5月上旬' }) + '</div>' +
          '<div class="field"><label>日数の単位</label>' + selectTag(base + '.unit', UNIT_OPTIONS, { repaint: true }) + '</div>' +
          '<div class="field"><label>入力の上限</label><div class="inline">' +
            inputTag(base + '.maxDays', { type: 'number', min: 1, max: 62, disabled: perWeek, repaint: true }) + '<span class="suffix">日</span></div>' +
            (perWeek ? '<div class="hint">週あたりは7日固定</div>' : '') + '</div>' +
          '<div class="field"><label>満点の日数</label><div class="inline">' +
            inputTag(base + '.refDays', { type: 'number', min: 1, max: perWeek ? 7 : 62 }) + '<span class="suffix">日以上</span></div></div>' +
          '<div class="field"><label>重み</label>' + inputTag(base + '.weight', { type: 'number', min: 0, max: 10, step: 1, repaint: true }) + '</div>' +
          '<label class="check-row s-busy-critical"><input type="checkbox" data-bind="' + base + '.critical"' + (v.critical ? ' checked' : '') + '>' +
            '<div><div class="lbl">重点（×で要判断）</div><div class="hint">OFFの期間の×は要確認止まり</div></div></label>' +
        '</div>' +
      '</div>';
    }).join('');

    const freqRows = function (key, title) {
      const arr = draft.options[key] || [];
      return '<h3 class="sub">' + esc(title) + '</h3>' +
        '<div class="s-freq-table">' + arr.map(function (x, i) {
          return '<div class="s-freq-row"><code>' + esc(x.value) + '</code>' +
            inputTag('options.' + key + '[' + i + '].label', { aria: '表示名' }) +
            '<div class="inline"><span class="suffix">割合</span>' + inputTag('options.' + key + '[' + i + '].ratio', { type: 'number', min: 0, max: 1, step: 0.05, aria: '割合' }) + '</div>' +
          '</div>';
        }).join('') + '</div>';
    };

    return section('s-busy', '繁忙期・土日・オールナイト',
      '新宿は土日祝、特に3連休以上の連休・長期休暇とオールナイト上映の貢献を重視します。期間ごとに「○△×」と「出られる日数」を入力させ、シフト貢献度に反映します。',
      offNotice(f.vacation !== false, '「繁忙期（連休・長期休暇）の勤務可否」がOFFのため、繁忙期は入力・判定に使われません。') +
      '<h3 class="sub">繁忙期の期間（上から順に入力画面に表示）</h3>' +
      '<div class="hint" style="margin-bottom:8px">満点の日数: この日数以上出られれば、その期間は満点。重み: 繁忙期の小計の中での重さ（0 は記録のみ・点数と未確認判定に使わない）。</div>' +
      rows +
      '<div class="actions s-busy-foot"><button type="button" class="btn sm" data-action="busy-add">＋ 期間を追加</button>' +
        '<span class="hint" id="busyWeightSum">重みの合計 <b>' + wsum + '</b>　｜　3連休以上の期間を重くするのがおすすめです。</span></div>' +
      '<div class="grid-2 s-freq">' +
        '<div>' + freqRows('weekendFrequencies', '土日の出勤頻度（割合 = 土日の点数の満点に対する割合）') +
          '<div class="params-grid" style="margin-top:10px">' +
            sInput('params.weekendFreqWarnBelow', '土日頻度の割合がこの値未満で要確認', { type: 'number', min: 0, max: 1, step: 0.05 }) +
          '</div></div>' +
        '<div>' + freqRows('allNightFrequencies', 'オールナイトに入れる頻度（割合）') + '</div>' +
      '</div>' +
      '<h3 class="sub">オールナイト上映のシフト</h3>' +
      offNotice(f.allNight !== false, '「オールナイト上映のシフト」がOFFのため、入力・判定に使われません。') +
      '<div class="params-grid">' +
        sInput('params.allNightShiftStart', 'オールナイト勤務の開始目安', { type: 'time' }) +
        sInput('params.allNightShiftEnd', '同 終了目安（翌日）', { type: 'time' }) +
      '</div>' +
      '<div class="hint" style="margin-top:6px">18歳未満は労働基準法によりオールナイト・22時以降の勤務ができません（設定で変更不可）。18歳以上の高校生の扱いは「高校生の扱い」で設定します。</div>');
  }

  function paramsHtml() {
    return section('s-params', '判定パラメータ', '留意点ルールやシフト貢献度が参照するしきい値です。',
      '<div class="params-grid">' +
        sInput('params.maxAge', '年齢基準（この歳以上で要判断）', { type: 'number', min: 0, suffix: '歳' }) +
        sInput('params.minShiftMinutes', '1日の最低勤務時間', { type: 'number', min: 0, step: 30, suffix: '分' }) +
        sInput('params.lowMaxDays', '週最大日数がこの値以下で要確認', { type: 'number', min: 1, max: 7, suffix: '日' }) +
        sInput('params.commuteWarnMinutes', '通勤時間（これを超えると要確認）', { type: 'number', min: 0, suffix: '分' }) +
        sInput('params.commuteBlockMinutes', '通勤時間（これ以上で要判断）', { type: 'number', min: 0, suffix: '分' }) +
        sInput('params.openStartFrom', 'オープン要員: 開始時刻の下限', { type: 'number', min: 0, max: 23, suffix: '時' }) +
        sInput('params.openStartTo', 'オープン要員: 開始時刻の上限', { type: 'number', min: 0, max: 23, suffix: '時' }) +
        sInput('params.closeEndHour', 'クローズ要員: この時刻以降まで勤務', { type: 'number', min: 0, max: 30, suffix: '時' }) +
        sInput('params.daytimeStartBefore', '平日日中帯: この時刻より前の開始', { type: 'number', min: 0, max: 23, suffix: '時' }) +
        sInput('params.lateNightStartHour', '深夜帯の開始時刻（表示・運用）', { type: 'number', min: 0, max: 23, suffix: '時', hint: '法令上の深夜（22:00〜翌5:00）の判定はこの値に関係なく行います。' }) +
        sInput('params.taxiLimitYen', 'タクシー帰宅の規定金額', { type: 'number', min: 0, step: 100, suffix: '円' }) +
        sInput('params.lastTrainBufferMinutes', '勤務終了〜終電に必要な余裕', { type: 'number', min: 0, max: 120, suffix: '分', hint: '着替え・移動の時間。最も遅い終了時刻＋この分数より終電が早いと要確認。' }) +
        sInput('params.dayBoundaryHour', '終電の日付の区切り', { type: 'number', min: 0, max: 12, suffix: '時', hint: 'これより前の終電は翌日扱い（0:35 → 翌0:35）。' }) +
        sInput('params.closeShiftStandardEnd', 'クローズ勤務の標準終了時刻', { type: 'time', hint: '空欄 = 使わない（希望シフトの終了時刻で終電を突合）。' }) +
        sInput('params.highschoolLatestEnd', '高校生の勤務終了上限（当劇場運用）', { type: 'time' }) +
        sInput('params.foreignWeeklyHourCap', '資格外活動の週上限', { type: 'number', min: 0, suffix: '時間' }) +
        sInput('params.foreignVacationWeeklyHourCap', '同・長期休暇中の週上限', { type: 'number', min: 0, suffix: '時間' }) +
        sInput('params.residenceExpiryWarnMonths', '在留期限が何か月以内で要確認', { type: 'number', min: 0, suffix: 'か月' }) +
      '</div>' +
      '<h3 class="sub">区分と年齢の整合（範囲外なら「入力の整合」の要確認）</h3>' +
      '<div class="hint" style="margin-bottom:6px">空欄 = 制限なし。</div>' +
      '<div class="field-row cols-3">' +
        [['highschool', '高校生'], ['university', '大学・大学院'], ['vocational', '専門学校']].map(function (g) {
          return '<div class="field"><label>' + esc(g[1]) + '</label><div class="inline">' +
            inputTag('params.groupAgeRanges.' + g[0] + '.min', { type: 'number', min: 0, max: 99, aria: g[1] + ' 下限' }) + '<span class="suffix">〜</span>' +
            inputTag('params.groupAgeRanges.' + g[0] + '.max', { type: 'number', min: 0, max: 99, aria: g[1] + ' 上限' }) + '<span class="suffix">歳</span></div></div>';
        }).join('') +
      '</div>');
  }

  function hsHtml() {
    const cps = draft.options.careerPaths || [];
    const mode = (draft.highschoolPolicy || {}).mode;
    return section('s-hs', '高校生の扱い', '高校生を採用対象にするかと、例外として選考を進める条件です。条件に合わない場合も入力は止めず、申し送りの「要判断」として採用担当が最終決定します。',
      '<div class="field-row">' +
        sSelect('highschoolPolicy.mode', '高校生の採用方針', [
          { value: 'allow', label: '制限なし（従来どおり）' },
          { value: 'exceptionOnly', label: '原則対象外・例外のみ選考（新宿）' },
          { value: 'deny', label: '高校生は対象外' }
        ], '「原則対象外」は、下の例外条件をすべて満たす場合のみ選考を進めます。', { repaint: true }) +
        sLines('highschoolPolicy.exceptionCategories', '例外を検討できる区分', { hint: '区分の選択肢の値と完全一致で書いてください（例: 高校3年生）。', rows: 3 }) +
      '</div>' +
      (mode === 'exceptionOnly' ? '' : '<div class="hint" style="margin:4px 0 8px">※ 例外条件は方針が「原則対象外・例外のみ選考」のときに使われます。</div>') +
      '<h3 class="sub">例外の条件</h3>' +
      sCheck('highschoolPolicy.requireCareerDecided', '進路が決定済みであること', '指定校推薦・AO入試などで進路が確定していることを条件にします。') +
      '<div class="check-grid">' +
        cps.map(function (c) { return sCheck('highschoolPolicy.allowedCareerPaths.' + c.value, (c.label || c.value) + 'は例外の対象'); }).join('') +
      '</div>' +
      '<div class="field"><label>例外の対象外の進路のうち、不採用推奨にする進路</label>' +
        '<div class="check-grid">' +
          cps.map(function (c) { return sCheck('highschoolPolicy.rejectCareerPaths.' + c.value, (c.label || c.value) + 'は不採用推奨'); }).join('') +
        '</div>' +
        '<div class="hint">例外の対象外の進路のときだけ使います。既定は就職のみ（ほぼ短期採用となるため）。チェックの無い対象外の進路と、進路が未決定・未入力の場合は上長最終判断要です。</div>' +
      '</div>' +
      sCheck('highschoolPolicy.requireContinue', '卒業後（進学後）も当劇場で継続する意思があること', '「継続する」と答えた場合のみ例外の対象にします。') +
      '<h3 class="sub">深夜帯・オールナイト</h3>' +
      sCheck('highschoolPolicy.nightRestricted', '18歳以上でも高校在学中は深夜帯・オールナイト不可として扱う', '18歳以上の高3も卒業まで深夜帯・オールナイト不可として扱います（18歳未満は法令により常に不可）。') +
      sTextarea('highschoolPolicy.notice', '入力画面に表示する方針の説明', { rows: 3 }) +
      '<div class="hint">関連する留意点の文言は「申し送りルール」の「高校生」「法令」で編集できます。採用推奨に留めない設定は「面接チェックリスト」の「判定」にあります。</div>');
  }

  function rulesHtml() {
    const rules = draft.handoffRules || [];
    const labels = categoryLabels();
    const order = categoryOrder().slice();
    const locked = lockedRules();
    const sevOpts = [['block', '要判断'], ['warn', '要確認'], ['info', '共有']];
    // order に無いカテゴリは末尾に「その他」としてまとめる
    const known = {};
    order.forEach(function (c) { known[c] = true; });
    const groups = order.map(function (cat) { return { title: labels[cat] || cat, idx: [] }; });
    const other = { title: 'その他', idx: [] };
    rules.forEach(function (r, i) {
      const cat = r.category || 'general';
      if (known[cat]) groups[order.indexOf(cat)].idx.push(i); else other.idx.push(i);
    });
    groups.push(other);
    return groups.map(function (g) {
      if (!g.idx.length) return '';
      return '<h3 class="sub">' + esc(g.title) + '</h3>' + g.idx.map(function (i) {
        const r = rules[i];
        const isLocked = !!locked[r.id];
        return '<div class="rule-row' + (r.enabled === false ? ' off' : '') + (isLocked ? ' locked' : '') + '" data-rule-id="' + esc(r.id) + '">' +
          '<label class="switch"><input type="checkbox" data-bind="handoffRules[' + i + '].enabled"' + (r.enabled !== false ? ' checked' : '') + (isLocked ? ' disabled' : '') + '><span></span></label>' +
          '<div class="rule-main"><div class="rule-meta"><code>' + esc(r.id) + '</code>' +
            '<select class="sel-sm" data-bind="handoffRules[' + i + '].severity"' + (isLocked ? ' disabled' : '') + '>' +
              sevOpts.map(function (o) { return '<option value="' + o[0] + '"' + (r.severity === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
            '</select>' +
            (isLocked ? '<span class="badge danger">法令（OFF不可）</span>' : '') +
            '<button type="button" class="btn link" data-action="rule-default" data-index="' + i + '">既定の文言に戻す</button>' +
          '</div>' +
          '<textarea data-bind="handoffRules[' + i + '].text" rows="2">' + esc(r.text) + '</textarea></div>' +
        '</div>';
      }).join('');
    }).join('');
  }

  // ---------- 面接チェックリスト（面接台本。docs/SPEC-checklist.md 5 章） ----------
  const CL_TYPE_NAMES = { must: '必須条件', fields: '記入欄', explain: '説明', question: '質問', rating: '確認点（○△×）', notify: '合否連絡', note: '注記' };
  const CL_NEW_TITLE = { must: '必須条件', fields: '', explain: '説明', question: '質問', rating: '確認点', notify: '合否連絡', note: '' };
  const CL_MUST_AUTO = [
    { value: '', label: '自動表示なし' },
    { value: 'weeklyCondition', label: '週の日数・時間・土日（応募情報から見込み）' },
    { value: 'busyAll', label: '繁忙期すべて可（応募情報から見込み）' }
  ];
  const CL_FIELD_AUTO = {   // 記入欄の自動表示（入力の種類ごとに選べるもの）
    text: [{ value: 'busyNg', label: '出勤不可な繁忙期（繁忙期が × の期間）' }, { value: 'openLate', label: 'OPEN／深夜帯の可否（希望シフト・深夜帯）' }],
    choice: [{ value: 'weekend', label: '土日勤務可否（値 one / both）' }, { value: 'term', label: '短期／長期の希望（値 short / long。勤務期間から）' }],
    month: [{ value: 'firstEnd', label: '初回契約終了（契約開始日から月末締め）' }],
    date: []
  };
  const CL_KINDS = [{ value: 'text', label: '文字' }, { value: 'date', label: '日付' }, { value: 'month', label: '年月' }, { value: 'choice', label: '選択式' }];
  let clOpen = {};   // 台本のセクション（<details>）の開閉。再描画で閉じないように覚える

  function clR() { return R(); }
  function clCirc(n) { const f = clR().circled; return f ? f(n) : '(' + n + ')'; }
  function clDraft() {
    if (!U.isObj(draft.checklist) || !Array.isArray(draft.checklist.sections)) {
      draft.checklist = U.deepClone(global.RECRUIT_DEFAULT_PROFILE.checklist);
    }
    return draft.checklist;
  }
  // 満点（確認点 n＋総合判断）= 2(n+1)。設定画面の 2 軸判定の境界の表示にも使う
  function clMax() {
    const Rr = clR();
    if (Rr.interviewModel && Rr.emptyChecklist) return Rr.interviewModel(draft, {}, Rr.emptyChecklist()).max;
    const ev = draft.evaluation || {};
    return (ev.items || []).length * n(ev.scaleMax, 5);
  }
  function clRatingCount() {
    const Rr = clR();
    return Rr.checklistItems ? Rr.checklistItems(clDraft(), 'rating').length : 0;
  }
  function rowBtns(prefix, attrs, idx, len, opts) {
    opts = opts || {};
    return '<div class="row-actions">' +
      '<button type="button" class="btn ghost" data-action="' + prefix + '-up" ' + attrs + ' title="上へ"' + (idx === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="btn ghost" data-action="' + prefix + '-down" ' + attrs + ' title="下へ"' + (idx === len - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button type="button" class="btn ghost danger" data-action="' + prefix + '-del" ' + attrs + ' title="削除"' + (opts.noDelete ? ' disabled' : '') + '>削除</button>' +
    '</div>';
  }
  function checkTag(path, label, opts) {
    opts = opts || {};
    return '<label class="s-cl-check"><input type="checkbox" data-bind="' + esc(path) + '"' + (val(path) ? ' checked' : '') + (opts.repaint ? ' data-repaint' : '') + '><span>' + esc(label) + '</span></label>';
  }

  function clItemHtml(b, ip, i, j, k, len) {
    const it = b.items[k];
    const attrs = 'data-sec="' + i + '" data-block="' + j + '" data-index="' + k + '"';
    const label = b.type === 'question'
      ? '<textarea data-bind="' + esc(ip + '.label') + '" rows="2" aria-label="質問文">' + esc(it.label || '') + '</textarea>'
      : inputTag(ip + '.label', { aria: b.type === 'fields' ? '欄の名前' : '文言' });
    let extra = '';
    if (b.type === 'rating') {
      extra = inputTag(ip + '.hint', { aria: '補足', placeholder: '補足（任意。例: 「大丈夫です」のみ連呼は要注意）' });
    } else if (b.type === 'explain') {
      extra = checkTag(ip + '.shortOnly', '※短期求人のみ（応募した求人が短期求人のとき強調）');
    } else if (b.type === 'must') {
      extra = '<div class="inline">' + selectTag(ip + '.auto', CL_MUST_AUTO, { repaint: true, aria: '応募情報からの見込み' }) + '</div>';
      if (it.auto === 'weeklyCondition') {
        extra += '<div class="inline"><span class="suffix">週</span>' + inputTag(ip + '.autoParams.minDays', { type: 'number', min: 1, max: 7, step: 1, aria: '週の日数' }) +
          '<span class="suffix">日以上・1回</span>' + inputTag(ip + '.autoParams.minHours', { type: 'number', min: 1, max: 12, step: 0.5, aria: '1回の時間' }) + '<span class="suffix">時間以上</span></div>';
      } else if (it.auto === 'busyAll') {
        const ps = (U.isObj(it.autoParams) && Array.isArray(it.autoParams.periods)) ? it.autoParams.periods : [];
        extra += '<div class="s-cl-periods">' + (draft.options.vacationItems || []).map(function (v) {
          return '<label class="s-cl-check"><input type="checkbox" data-action="cl-period" ' + attrs + ' data-period="' + esc(v.id) + '"' + (ps.indexOf(v.id) >= 0 ? ' checked' : '') + '><span>' + esc(v.label || v.id) + '</span></label>';
        }).join('') + '</div>';
      }
    } else if (b.type === 'fields') {
      const kind = CL_FIELD_AUTO[it.kind] ? it.kind : 'text';
      const autos = [{ value: '', label: '自動表示なし' }].concat(CL_FIELD_AUTO[kind]);
      extra = '<div class="inline">' + selectTag(ip + '.kind', CL_KINDS, { repaint: true, aria: '入力の種類' }) +
        (autos.length > 1 ? selectTag(ip + '.auto', autos, { repaint: true, aria: '自動表示' }) : '') + '</div>';
      if (kind === 'choice') {
        const text = (Array.isArray(it.options) ? it.options : []).map(function (o) { return o.value + '|' + (o.label || ''); }).join('\n');
        extra += '<div class="field s-cl-options"><label>選択肢（1行に「値|表示名」）</label><textarea data-bind="' + esc(ip + '.options') + '" data-type="options" rows="2">' + esc(text) + '</textarea></div>';
      }
      if (it.auto === 'firstEnd') {
        extra += '<div class="inline"><span class="suffix">契約開始日の</span>' + inputTag(ip + '.autoParams.monthsAfter', { type: 'number', min: 0, max: 12, step: 1, aria: '何か月後' }) + '<span class="suffix">か月後の月末</span></div>';
      }
    }
    return '<div class="s-cl-item" data-item-id="' + esc(it.id) + '"><span class="idx">' + (k + 1) + '</span>' +
      '<div class="s-cl-item-main">' + label + (extra ? '<div class="s-cl-item-extra">' + extra + '</div>' : '') + '</div>' +
      rowBtns('cl-item', attrs, k, len) + '</div>';
  }

  function clBlockHtml(b, bp, i, j, len) {
    const attrs = 'data-sec="' + i + '" data-block="' + j + '"';
    const items = Array.isArray(b.items) ? b.items : (b.items = []);
    const memoable = b.type === 'question' || b.type === 'explain';
    return '<div class="s-cl-block" data-block-type="' + esc(b.type) + '">' +
      '<div class="s-cl-block-head"><span class="badge info">' + esc(CL_TYPE_NAMES[b.type] || b.type) + '</span>' +
        (b.type === 'note' ? '' : inputTag(bp + '.title', { aria: '見出し', placeholder: '見出し（【】は自動で付きます）' })) +
        inputTag(bp + '.note', { aria: b.type === 'note' ? '注記の本文' : '注記', placeholder: b.type === 'note' ? '注記の本文（例: 条件一致：2へ）' : '注記（任意）' }) +
        rowBtns('cl-block', attrs, j, len) +
      '</div>' +
      (memoable ? '<div class="s-cl-memo">' + checkTag(bp + '.memo', 'メモ欄を出す', { repaint: true }) +
        (b.memo ? inputTag(bp + '.memoLabel', { aria: 'メモ欄の名前', placeholder: 'メモ' }) : '') + '</div>' : '') +
      (b.type === 'note' ? '' : items.map(function (it, k) { return clItemHtml(b, bp + '.items[' + k + ']', i, j, k, items.length); }).join('') +
        '<div class="actions s-cl-item-add"><button type="button" class="btn sm ghost" data-action="cl-item-add" ' + attrs + '>＋ 項目を追加</button></div>') +
    '</div>';
  }

  function clSectionHtml(sec, i, len, pageOpts) {
    const sp = 'checklist.sections[' + i + ']';
    const blocks = Array.isArray(sec.blocks) ? sec.blocks : (sec.blocks = []);
    const counts = {};
    blocks.forEach(function (b) { counts[b.type] = (counts[b.type] || 0) + (Array.isArray(b.items) ? b.items.length : 0); });
    const sumText = ['must', 'rating'].filter(function (t) { return counts[t]; }).map(function (t) { return (t === 'must' ? '必須条件 ' : '確認点 ') + counts[t]; }).join('・');
    const open = Object.prototype.hasOwnProperty.call(clOpen, sec.id) ? clOpen[sec.id] : i === 0;
    return '<details class="s-details s-cl-sec" data-sec-id="' + esc(sec.id) + '"' + (open ? ' open' : '') + '>' +
      '<summary><span class="s-cl-no">' + clCirc(i + 1) + '</span> ' + esc(sec.title || '（名前なし）') +
        (sec.minutes ? ' <span class="hint">' + (sec.minutesMax ? '最大' : '') + sec.minutes + '分</span>' : '') +
        (sumText ? ' <span class="hint">' + esc(sumText) + '</span>' : '') + '</summary>' +
      '<div class="s-cl-sec-row">' +
        '<div class="field"><label>セクション名</label>' + inputTag(sp + '.title', { aria: 'セクション名' }) + '</div>' +
        '<div class="field"><label>目安時間</label><div class="inline">' + inputTag(sp + '.minutes', { type: 'number', min: 0, max: 60, step: 1, aria: '目安時間' }) + '<span class="suffix">分</span>' +
          checkTag(sp + '.minutesMax', '最大') + '</div></div>' +
        '<div class="field"><label>ページ（印刷）</label>' + selectTag(sp + '.page', pageOpts, { repaint: true, aria: 'ページ' }) + '</div>' +
        '<div class="field"><label>並び・削除</label>' + rowBtns('cl-sec', 'data-sec="' + i + '"', i, len, { noDelete: len <= 1 }) + '</div>' +
      '</div>' +
      sTextarea(sp + '.lead', 'セクションの説明（任意）', { rows: 1 }) +
      blocks.map(function (b, j) { return clBlockHtml(b, sp + '.blocks[' + j + ']', i, j, blocks.length); }).join('') +
      '<div class="actions s-cl-add"><select data-cl-newtype aria-label="追加するブロックの種類">' +
        Object.keys(CL_TYPE_NAMES).map(function (t) { return '<option value="' + t + '"' + (t === 'rating' ? ' selected' : '') + '>' + esc(CL_TYPE_NAMES[t]) + '</option>'; }).join('') +
        '</select><button type="button" class="btn sm" data-action="cl-block-add" data-sec="' + i + '">＋ ブロックを追加</button></div>' +
    '</details>';
  }

  function legacyEvalHtml() {
    const ev = draft.evaluation || {};
    const items = ev.items || [];
    const ov = items.find(function (it) { return it.id === ev.overallItemId; });
    return '<details class="s-details s-cl-legacy"><summary>旧形式の面接評価（' + items.length + '項目×' + n(ev.scaleMax, 5) + '点）— 2026-10 以前の保存データの表示・再判定にだけ使います</summary>' +
      '<ol class="s-cl-legacy-list">' + items.map(function (it) { return '<li>' + esc(it.label) + '</li>'; }).join('') + '</ol>' +
      '<div class="hint">1項目の満点 ' + n(ev.scaleMax, 5) + '点／総合判断の項目: ' + esc(ov ? ov.label : '—') + '（' + n(ev.overallWarnBelow, 3) + '点未満で警告' +
        (n(ev.overallRejectAtOrBelow, 0) > 0 ? '・' + n(ev.overallRejectAtOrBelow, 0) + '点以下で不採用推奨' : '') + '）。読み取り専用です（新しい面接は上の面接チェックリストで評価します）。</div>' +
    '</details>';
  }

  function checklistHtml() {
    const cl = clDraft();
    const secs = cl.sections;
    const pages = Array.isArray(cl.pages) ? cl.pages : (cl.pages = []);
    const oo = U.isObj(cl.overallOptions) ? cl.overallOptions : (cl.overallOptions = {});
    const hd = U.isObj(cl.header) ? cl.header : (cl.header = {});
    const negs = Array.isArray(hd.negatives) ? hd.negatives : (hd.negatives = []);
    const posting = U.isObj(hd.posting) ? hd.posting : (hd.posting = { label: '', options: [] });
    const nRating = clRatingCount();
    const capOpts = [{ value: 'none', label: '調整しない' }, { value: 'review', label: resultTitle('review') + 'まで' }, { value: 'reject', label: resultTitle('reject') }];
    const maxPage = Math.max(pages.length, secs.reduce(function (m, s) { return Math.max(m, n(s.page, 1)); }, 1), 1);
    const pageOpts = [];
    for (let k = 1; k <= maxPage; k++) {
      const pg = pages.find(function (x) { return U.isObj(x) && Number(x.no) === k; });
      pageOpts.push({ value: k, label: k + '枚目' + (pg && pg.title ? '（' + pg.title + '）' : '') });
    }
    const mfields = ((draft.management || {}).fields || []).filter(function (f) { return f && f.id; });
    const negAuto = [
      { value: '', label: '自動判定なし' },
      { value: 'shortTerm', label: '短期希望（勤務期間・短期／長期の希望が短期）' },
      { value: 'morningOnly', label: '朝～12時のみ（勤務の終了がすべて ' + (hd.morningOnlyEnd || '12:00') + ' まで）' }
    ];
    const pOpts = Array.isArray(posting.options) ? posting.options : [];

    return section('s-checklist', '面接チェックリスト',
      '面接台本のチェックリストです。必須条件（一致／不一致）と確認点（○△×）・総合判断で面接評価を計算します。文言・項目の増減・確認点の有無を編集できます。高・中の境界（%）は「2軸判定」で設定します。',
      '<div class="s-cl-max" id="clMaxNote">確認点 <b>' + nRating + '</b> 項目＋総合判断 ＝ 満点 <b>' + clMax() + '</b> 点<span class="hint">（○2・△1・×0、総合判断 採用2・保留1・不採用0）</span></div>' +

      '<h3 class="sub">判定</h3>' +
      '<div class="field-row">' +
        sSelect('checklist.mustFailResult', '必須条件に不一致があるとき', [{ value: 'reject', label: resultTitle('reject') }, { value: 'review', label: resultTitle('review') }],
          '台本どおりなら「' + resultTitle('reject') + '」。不一致のときは確認点・総合判断が未入力でも判定に進めます（' + resultTitle('review') + 'のときは入力が必要）。') +
        sSelect('checklist.mustUnknownResult', '必須条件に未確認が残るとき', [{ value: 'none', label: '警告のみ（判定は変えない）' }, { value: 'review', label: '採用推奨に留めない（' + resultTitle('review') + 'まで）' }]) +
      '</div>' +
      '<div class="field-row">' +
        sSelect('checklist.overallCaps.hold', '総合判断「' + (oo.hold || '保留') + '」のとき', capOpts) +
        sSelect('checklist.overallCaps.reject', '総合判断「' + (oo.reject || '不採用') + '」のとき', capOpts) +
      '</div>' +
      '<div class="field-row">' +
        sSelect('checklist.mustFailJumpTo', '不一致のとき案内するセクション', [{ value: '', label: '案内しない' }].concat(secs.map(function (s, i) { return { value: s.id, label: clCirc(i + 1) + ' ' + (s.title || '') }; }))) +
      '</div>' +
      sCheck('evaluation.holdOnUnresolvedBlock', '「要判断」の留意点が未確認のまま採用推奨になった場合、上長最終判断要に留める', '採用担当の判断が済んでいない状態で「採用推奨」が出るのを防ぎます。法令に関わる要判断は、この設定に関係なく常に留めます。') +
      sCheck('evaluation.holdOnHighschoolException', '高校生の「原則対象外」「例外条件の未充足・未入力」は、確認済みでも採用推奨にしない', '高校生の方針（基本NG）と判定表示を一致させます。OFFにするとチェックで外せます。') +

      '<h3 class="sub">総合判断</h3>' +
      '<div class="field-row">' + sInput('checklist.overallLabel', '見出し') + sInput('checklist.overallHint', '説明（Step3 に表示）') + '</div>' +
      '<div class="field-row cols-3">' +
        sInput('checklist.overallOptions.hire', '「採用」の表示名') + sInput('checklist.overallOptions.hold', '「保留」の表示名') + sInput('checklist.overallOptions.reject', '「不採用」の表示名') +
      '</div>' +
      '<div class="hint" style="margin:-6px 0 8px">点は 採用 2・保留 1・不採用 0 で固定です。</div>' +

      '<h3 class="sub">ヘッダー</h3>' +
      '<div class="field"><label>消極属性（応募情報から自動表示し、Step3 で上書きできます）</label>' +
        negs.map(function (ng, i) {
          return '<div class="s-cl-neg">' + inputTag('checklist.header.negatives[' + i + '].label', { aria: '消極属性の名前' }) +
            selectTag('checklist.header.negatives[' + i + '].auto', negAuto, { aria: '自動判定' }) +
            '<button type="button" class="btn ghost danger" data-action="cl-neg-del" data-index="' + i + '">削除</button></div>';
        }).join('') +
        '<div class="actions" style="margin-top:6px"><button type="button" class="btn sm" data-action="cl-neg-add">＋ 消極属性を追加</button></div></div>' +
      '<div class="field-row">' +
        sInput('checklist.header.morningOnlyEnd', '「朝～12時のみ」の判定の終了時刻', { type: 'time', repaint: true }) +
        sSelect('checklist.header.interviewerField', '担当と連動する押印欄', [{ value: '', label: '連動しない' }].concat(mfields.map(function (f) { return { value: f.id, label: f.label || f.id }; })),
          '担当が空欄のときは、この押印欄の氏名を報告書の担当に使います（自動で押印はしません）。') +
      '</div>' +
      '<div class="field-row">' + sInput('checklist.header.posting.label', '「応募した求人」の見出し') +
        '<div class="field"><label>選択肢の表示名</label><div class="inline">' + pOpts.map(function (o, m) {
          return inputTag('checklist.header.posting.options[' + m + '].label', { aria: '表示名（値: ' + o.value + '）' });
        }).join('') + '</div><div class="hint">値 short（短期求人）のとき「※短期求人のみ」の説明を強調します。</div></div>' +
      '</div>' +

      '<h3 class="sub">印刷</h3>' +
      sCheck('checklist.print.showQuestions', 'A4 報告・保存レポートに質問文も載せる', 'OFF にするとメモだけになり、報告書が短くなります。') +

      '<h3 class="sub">台本</h3>' +
      '<div class="field-row">' + sInput('checklist.title', 'タイトル') + sInput('checklist.version', '版（例: 2026-10-08）') + '</div>' +
      sTextarea('checklist.intro', 'Step3 の説明文', { rows: 2 }) +
      '<div class="field-row">' + pages.map(function (pg, k) {
        return '<div>' + sInput('checklist.pages[' + k + '].title', (pg.no || k + 1) + '枚目の見出し') + sTextarea('checklist.pages[' + k + '].lead', (pg.no || k + 1) + '枚目の説明', { rows: 2 }) + '</div>';
      }).join('') + '</div>' +
      '<div class="s-cl-secs">' + secs.map(function (sec, i) { return clSectionHtml(sec, i, secs.length, pageOpts); }).join('') + '</div>' +
      '<div class="actions" style="margin-top:10px">' +
        '<button type="button" class="btn sm" data-action="cl-sec-add">＋ セクションを追加</button>' +
        '<button type="button" class="btn sm ghost" data-action="cl-default">既定の台本（2026-10-08 版）に戻す</button>' +
      '</div>' +

      '<h3 class="sub">旧形式</h3>' + legacyEvalHtml());
  }

  function clNewItem(type) {
    if (type === 'fields') return { id: U.uid('cl'), label: '新しい欄', kind: 'text' };
    return { id: U.uid('cl'), label: type === 'rating' ? '新しい確認点' : '新しい項目' };
  }
  function clNewBlock(type) {
    return {
      id: U.uid('blk'), type: type, title: CL_NEW_TITLE[type] || '', note: type === 'note' ? '新しい注記' : '',
      memo: type === 'question', memoLabel: type === 'question' ? 'メモ' : '',
      items: type === 'note' ? [] : [clNewItem(type)]
    };
  }
  function clDelConfirm(what) {
    return window.confirm('この' + what + 'を削除します。保存済みの応募者データのこの回答は表示・判定に使われなくなります（データは残ります）。よろしいですか？');
  }

  // 台本の構造の変更（追加・削除・並べ替え）。処理したら true
  function clOnClick(act, b, y) {
    if (act.indexOf('cl-') !== 0) return false;
    const cl = clDraft();
    const secs = cl.sections;
    const si = Number(b.dataset.sec), bi = Number(b.dataset.block), ki = Number(b.dataset.index);
    const sec = secs[si];
    const blocks = sec && Array.isArray(sec.blocks) ? sec.blocks : null;
    const blk = blocks ? blocks[bi] : null;
    const items = blk && Array.isArray(blk.items) ? blk.items : null;
    switch (act) {
      case 'cl-sec-add': {
        const lastPage = secs.reduce(function (m, s) { return Math.max(m, n(s.page, 1)); }, 1);
        const id = U.uid('sec');
        secs.push({ id: id, title: '新しいセクション', minutes: 0, minutesMax: false, page: lastPage, lead: '', blocks: [clNewBlock('rating')] });
        clOpen[id] = true;
        break;
      }
      case 'cl-sec-del':
        if (!sec || secs.length <= 1 || !clDelConfirm('セクション')) return true;
        if (cl.mustFailJumpTo === sec.id) cl.mustFailJumpTo = '';
        secs.splice(si, 1);
        break;
      case 'cl-sec-up': if (!swap(secs, si - 1, si)) return true; break;
      case 'cl-sec-down': if (!swap(secs, si, si + 1)) return true; break;
      case 'cl-block-add': {
        if (!sec) return true;
        const box = b.closest('.s-cl-add');
        const sel = box && box.querySelector('select[data-cl-newtype]');
        const type = sel && CL_TYPE_NAMES[sel.value] ? sel.value : 'rating';
        if (!Array.isArray(sec.blocks)) sec.blocks = [];
        sec.blocks.push(clNewBlock(type));
        clOpen[sec.id] = true;
        break;
      }
      case 'cl-block-del':
        if (!blk || !clDelConfirm('ブロック')) return true;
        blocks.splice(bi, 1);
        break;
      case 'cl-block-up': if (!blocks || !swap(blocks, bi - 1, bi)) return true; break;
      case 'cl-block-down': if (!blocks || !swap(blocks, bi, bi + 1)) return true; break;
      case 'cl-item-add':
        if (!blk) return true;
        if (!Array.isArray(blk.items)) blk.items = [];
        blk.items.push(clNewItem(blk.type));
        break;
      case 'cl-item-del':
        if (!items || !items[ki] || !clDelConfirm('項目')) return true;
        items.splice(ki, 1);
        break;
      case 'cl-item-up': if (!items || !swap(items, ki - 1, ki)) return true; break;
      case 'cl-item-down': if (!items || !swap(items, ki, ki + 1)) return true; break;
      case 'cl-period': {
        // チェックボックスの見た目はそのまま（再描画しない）
        const it = items && items[ki];
        if (!it) return true;
        if (!U.isObj(it.autoParams)) it.autoParams = {};
        const ps = Array.isArray(it.autoParams.periods) ? it.autoParams.periods.slice() : [];
        const pid = b.dataset.period;
        const at = ps.indexOf(pid);
        if (b.checked && at < 0) ps.push(pid);
        if (!b.checked && at >= 0) ps.splice(at, 1);
        // 繁忙期の並び順に揃える
        const order = (draft.options.vacationItems || []).map(function (v) { return v.id; });
        it.autoParams.periods = ps.sort(function (x, z) { return order.indexOf(x) - order.indexOf(z); });
        return true;
      }
      case 'cl-neg-add':
        if (!U.isObj(cl.header)) cl.header = {};
        if (!Array.isArray(cl.header.negatives)) cl.header.negatives = [];
        cl.header.negatives.push({ id: U.uid('neg'), label: '新しい消極属性', auto: '' });
        break;
      case 'cl-neg-del': {
        const ng = ((cl.header || {}).negatives || []);
        const i2 = Number(b.dataset.index);
        if (!ng[i2] || !window.confirm('消極属性「' + (ng[i2].label || ng[i2].id) + '」を削除します。よろしいですか？')) return true;
        ng.splice(i2, 1);
        break;
      }
      case 'cl-default':
        if (!window.confirm('面接チェックリストを既定の台本（2026-10-08 版）に戻します。編集した文言・項目は失われます。保存済みの応募者ファイルのレポートは保存時点の台本で表示されます。よろしいですか？')) return true;
        draft.checklist = U.deepClone(global.RECRUIT_DEFAULT_PROFILE.checklist);
        clOpen = {};
        break;
      default:
        return false;
    }
    paint(y);
    return true;
  }

  // 自動表示・入力の種類を変えたときの既定値（自動表示の設定値・選択肢）
  function clOnBindChange(path, value) {
    const m = /^checklist\.sections\[(\d+)\]\.blocks\[(\d+)\]\.items\[(\d+)\]\.(auto|kind)$/.exec(path);
    if (!m) return;
    const sec = clDraft().sections[Number(m[1])];
    const blk = sec && sec.blocks && sec.blocks[Number(m[2])];
    const it = blk && blk.items && blk.items[Number(m[3])];
    if (!it) return;
    if (m[4] === 'auto') {
      if (!value) { delete it.auto; delete it.autoParams; return; }
      const ap = U.isObj(it.autoParams) ? it.autoParams : {};
      if (value === 'weeklyCondition') it.autoParams = { minDays: n(ap.minDays, 3), minHours: n(ap.minHours, 5) };
      else if (value === 'busyAll') it.autoParams = { periods: Array.isArray(ap.periods) ? ap.periods : (draft.options.vacationItems || []).map(function (v) { return v.id; }) };
      else if (value === 'firstEnd') it.autoParams = { monthsAfter: n(ap.monthsAfter, 1) };
      else delete it.autoParams;
      if (value === 'weekend' && !(it.options || []).length) it.options = [{ value: 'one', label: 'いずれか' }, { value: 'both', label: '両日' }];
      if (value === 'term' && !(it.options || []).length) it.options = [{ value: 'short', label: '短期希望' }, { value: 'long', label: '長期希望' }];
    } else {
      // 入力の種類に合わない自動表示は外す。選択式にしたら選択肢の見本を入れる
      const ok = (CL_FIELD_AUTO[value] || []).some(function (o) { return o.value === it.auto; });
      if (!ok) { delete it.auto; delete it.autoParams; }
      if (value === 'choice' && !(Array.isArray(it.options) && it.options.length >= 2)) it.options = [{ value: 'a', label: '選択肢1' }, { value: 'b', label: '選択肢2' }];
    }
  }

  function contribHtml() {
    const co = draft.contribution || {};
    const items = co.items || [];
    const f = draft.features || {};
    const featureOff = { busy: f.vacation === false, holiday: f.holidayWork === false, allNight: f.allNight === false };
    const sum = items.reduce(function (s, it) { return s + (it.enabled !== false && !featureOff[it.id] ? Math.max(0, n(it.max, 0)) : 0); }, 0);
    return section('s-contrib', 'シフト貢献度', '繁忙期・土日祝・オールナイト・クローズなど、シフトへの貢献の見込みを面接評価とは別に点数化します。得点率（%）で 高／中／低 の帯に分け、「2軸判定」に使います。',
      offNotice(f.contribution !== false, '「シフト貢献度と2軸判定」がOFFのため、採用可否は面接評価のみで判定されます。') +
      '<h3 class="sub">項目と配点</h3>' +
      '<div class="s-contrib-table">' +
        items.map(function (it, i) {
          const off = featureOff[it.id];
          return '<div class="s-contrib-row' + (it.enabled === false ? ' off' : '') + '">' +
            '<label class="switch"><input type="checkbox" data-bind="contribution.items[' + i + '].enabled"' + (it.enabled !== false ? ' checked' : '') + ' data-repaint><span></span></label>' +
            '<code>' + esc(it.id) + '</code>' +
            inputTag('contribution.items[' + i + '].label', { aria: '項目名' }) +
            '<div class="inline">' + inputTag('contribution.items[' + i + '].max', { type: 'number', min: 0, max: 100, step: 1, repaint: true, aria: '満点' }) + '<span class="suffix">点</span></div>' +
            (off ? '<span class="badge">入力項目OFFのため対象外</span>' : '<span></span>') +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="s-contrib-sum" id="contribSum">合計 <b>' + sum + '</b> 点<span class="hint">（得点率で判定するので 100 でなくても可）</span></div>' +
      '<h3 class="sub">判定の前提</h3>' +
      sCheck('contribution.requireComplete', '判定の前にシフト条件の未確認をゼロにする', '未確認があると Step3 から判定に進めません。OFFにすると未確認は 0 点として2軸判定に当てます。') +
      sCheck('contribution.showBeforeInterview', '申し送り（面接前）に貢献度の点数を表示する', 'OFFにすると面接前（Step1・Step2・申し送りコピー文・右サマリー）は点数を出さず、未確認項目だけを表示します（採点者のバイアス対策）。Step3 以降は点数を表示します。') +
      '<details class="s-details"><summary>詳細設定（係数・目標日数）</summary>' +
        '<div class="params-grid">' +
          sInput('contribution.consultFactor', '△（要相談）を満点の何割として数えるか', { type: 'number', min: 0, max: 1, step: 0.05 }) +
          sInput('contribution.weekendDerived.both', '土日の推定割合（土日とも選択）', { type: 'number', min: 0, max: 1, step: 0.05, hint: '「土日の出勤頻度」がOFFのときに使います。' }) +
          sInput('contribution.weekendDerived.one', '土日の推定割合（片方のみ選択）', { type: 'number', min: 0, max: 1, step: 0.05 }) +
          sInput('contribution.weekendOneDayCap', '土日の片方のみのときの上限', { type: 'number', min: 0, max: 1, step: 0.05 }) +
          sInput('contribution.lateNightAvailFactor', '「22時以降○」をクローズで何割として数えるか', { type: 'number', min: 0, max: 1, step: 0.05 }) +
          sInput('contribution.targets.closeDaysPerWeek', 'クローズの満点日数', { type: 'number', min: 1, max: 7, suffix: '日/週' }) +
          sInput('contribution.targets.openDaysPerWeek', 'オープンの満点日数', { type: 'number', min: 1, max: 7, suffix: '日/週' }) +
          sInput('contribution.targets.weeklyDaysFull', '週の勤務日数の満点', { type: 'number', min: 1, max: 7, suffix: '日' }) +
          sInput('contribution.busyStrongPct', '繁忙期の強みを出す得点率', { type: 'number', min: 0, max: 100, suffix: '% 以上' }) +
        '</div>' +
      '</details>');
  }

  function matrixHtml() {
    const ev = draft.evaluation || {};
    const th = ev.thresholds || {};
    const co = draft.contribution || {};
    const bands = co.bands || {};
    const max = clMax();   // 面接チェックリストの満点（確認点＋総合判断）× 2
    const recPct = n(th.recommendPct, 70), revPct = n(th.reviewPct, 40);
    const hi = n(bands.highPct, 60), mid = n(bands.midPct, 35);
    const recPts = Math.ceil(max * recPct / 100);
    const revPts = Math.ceil(max * revPct / 100);
    const iRange = { high: recPct + '%以上（' + recPts + '点〜）', mid: revPct + '〜' + recPct + '%', low: revPct + '%未満' };
    const cRange = { high: hi + '%以上', mid: mid + '〜' + hi + '%', low: mid + '%未満' };
    const resOpts = ['recommend', 'review', 'reject'].map(function (r) { return { value: r, label: resultTitle(r) }; });
    const cells = (draft.matrix || {}).cells || {};
    const f = draft.features || {};

    const table = '<table class="matrix mx-edit"><thead><tr><th class="corner">面接評価 ＼ シフト貢献度</th>' +
      BANDS.map(function (c) { return '<th>' + esc(bandLabel(c)) + '<small>' + esc(cRange[c]) + '</small></th>'; }).join('') +
      '</tr></thead><tbody>' +
      BANDS.map(function (i) {
        return '<tr><th>' + esc(bandLabel(i)) + '<small>' + esc(iRange[i]) + '</small></th>' +
          BANDS.map(function (c) {
            const k = i + '_' + c;
            return '<td class="' + esc(cells[k] || '') + '">' + selectTag('matrix.cells.' + k, resOpts, { repaint: true, cls: 'sel-sm', aria: '面接' + bandLabel(i) + '×貢献' + bandLabel(c) }) + '</td>';
          }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>';

    const notes = BANDS.map(function (i) {
      return BANDS.map(function (c) {
        const k = i + '_' + c;
        return sInput('matrix.cellNotes.' + k, '面接' + bandLabel(i) + ' × 貢献' + bandLabel(c) + '（' + resultTitle(cells[k]) + '）', { placeholder: '空欄 = 表示しない' });
      }).join('');
    }).join('');

    return section('s-matrix', '2軸判定（面接評価 × シフト貢献度）', '面接評価とシフト貢献度をそれぞれ 高／中／低 の帯に分け、組み合わせ（マス）ごとに判定を決めます。境界値ちょうどは上の帯に含めます。',
      offNotice(f.contribution !== false, '「シフト貢献度と2軸判定」がOFFのため、面接評価の境界（採用推奨／上長最終判断要）だけが使われます。') +
      '<h3 class="sub">帯の境界</h3>' +
      '<div class="field-row">' +
        sInput('evaluation.thresholds.recommendPct', '面接評価: 高（採用推奨の目安）', { type: 'number', min: 0, max: 100, repaint: true, suffix: '% 以上（現在の満点 ' + max + '点では ' + recPts + '点以上）' }) +
        sInput('evaluation.thresholds.reviewPct', '面接評価: 中（上長最終判断要の目安）', { type: 'number', min: 0, max: 100, repaint: true, suffix: '% 以上（' + revPts + '点以上。未満は 低）' }) +
      '</div>' +
      '<div class="field-row">' +
        sInput('contribution.bands.highPct', 'シフト貢献度: 高', { type: 'number', min: 0, max: 100, repaint: true, suffix: '% 以上' }) +
        sInput('contribution.bands.midPct', 'シフト貢献度: 中', { type: 'number', min: 0, max: 100, repaint: true, suffix: '% 以上（未満は 低）' }) +
      '</div>' +
      '<h3 class="sub">マスごとの判定</h3>' +
      '<div class="matrix-wrap">' + table + '</div>' +
      '<div class="hint" style="margin-top:6px">判定のあと、要判断の未確認・高校生の方針・シフト条件の未確認などで「下げる方向」にだけ調整されます（上げる調整はしません）。</div>' +
      '<details class="s-details"><summary>マスごとの判定メモ（結果の本文の下に表示）</summary>' +
        '<div class="field-row cols-3">' + notes + '</div>' +
      '</details>');
  }

  function textsHtml() {
    return section('s-texts', '結果文言', '',
      '<div class="hint" style="margin:-6px 0 10px">変数: <code>' + esc(RESULT_VARS_HINT) + '</code></div>' +
      '<h3 class="sub">判定のタイトルと本文（面接評価のみで判定するとき）</h3>' +
      '<div class="field-row">' + sInput('texts.recommend.title', '採用推奨: タイトル') + sInput('texts.recommend.body', '採用推奨: 本文') + '</div>' +
      '<div class="field-row">' + sInput('texts.review.title', '上長最終判断要: タイトル') + sInput('texts.review.body', '上長最終判断要: 本文') + '</div>' +
      '<div class="field-row">' + sInput('texts.reject.title', '不採用推奨: タイトル') + sInput('texts.reject.body', '不採用推奨: 本文') + '</div>' +
      '<h3 class="sub">2軸判定の本文</h3>' +
      sInput('texts.matrix.recommend', '採用推奨（2軸）') +
      sInput('texts.matrix.review', '上長最終判断要（2軸）') +
      sInput('texts.matrix.reject', '不採用推奨（2軸）') +
      sInput('texts.adjusted', '調整で結果が下がったときの本文', { hint: '変数: {name} {scoreSummary} {baseTitle} {resultTitle}。このときマスの注記は表示しません。' }) +
      sInput('texts.mustGate', '必須条件の不一致で不採用推奨に固定したときの本文', { hint: '変数: {name} {mustLabels} {scoreSummary} {resultTitle}。このときマスの注記は表示しません。' }) +
      '<div class="field-row cols-3">' +
        sInput('texts.bandLabels.high', '帯の表示: 高') + sInput('texts.bandLabels.mid', '帯の表示: 中') + sInput('texts.bandLabels.low', '帯の表示: 低') +
      '</div>' +
      sTextarea('texts.disclaimer', '判定結果の注記', { rows: 2 }) +
      sTextarea('texts.handoffIntro', '申し送り画面の説明文', { rows: 2 }) +
      sTextarea('texts.busyIntro', '繁忙期カードの説明文', { rows: 2 }) +
      sTextarea('texts.allNightIntro', 'オールナイトカードの説明文', { rows: 2, hint: '変数: {allNightShiftStart} {allNightShiftEnd} {lateNightStartHour}' }) +
      sTextarea('texts.contributionIntro', 'シフト貢献度（面接前の見込み）の説明文', { rows: 2 }) +
      sTextarea('texts.preFillTitle', 'Step1 折りたたみの見出し', { rows: 1 }) +
      sTextarea('texts.preFillHint', 'Step1 折りたたみの説明文', { rows: 2 }) +
      sTextarea('texts.interviewConfirmIntro', 'Step3「面接で確認する項目」の説明文', { rows: 2 }) +
      sTextarea('texts.reviewerNotesIntro', 'Step1 申し送りコメントの説明文', { rows: 2 }) +
      '<h3 class="sub">強みの文言（面接者への共有）</h3>' +
      '<div class="field-row">' +
        sInput('texts.strengths.open', 'オープン要員') + sInput('texts.strengths.close', 'クローズ要員') +
        sInput('texts.strengths.weekend', '土日両日可') + sInput('texts.strengths.longTerm', '長期希望') +
        sInput('texts.strengths.days3', '週3日以上（{minDays}）') + sInput('texts.strengths.longShift', '1日の勤務時間が十分（{minShiftHours}）') +
        sInput('texts.strengths.commuteNear', '通勤が近い（{commuteTime}）') + sInput('texts.strengths.vacationOk', '繁忙期すべて可') +
        sInput('texts.strengths.busyStrong', '繁忙期の貢献が高い（{busyPct}）') + sInput('texts.strengths.holidayOk', '祝日も勤務可') +
        sInput('texts.strengths.allNightOk', 'オールナイト可（{allNightFreq}）') + sInput('texts.strengths.lateNightOk', '深夜帯可（{lateNightStartHour}）') +
      '</div>');
  }

  function mgmtHtml() {
    const mg = draft.management || {};
    const fields = Array.isArray(mg.fields) ? mg.fields : [];
    const preview = global.RecruitStamp ? global.RecruitStamp.svg({ name: ((mg.managers || [])[0] || {}).short || '笹川', title: ((mg.managers || [])[0] || {}).title || '副支配人', date: global.RecruitStamp.stampDate(new Date()), size: 76, id: 'stPreview' }) : '';
    return section('s-mgmt', '応募者の管理（押印）', '保存レポートの末尾に押印欄を出します。名簿から担当者を選ぶと日付入りのハンコが押され、レポート上でも押印・保存できます。',
      '<div class="field-row">' +
        '<div>' + fields.map(function (fl, i) {
          return sInput('management.fields[' + i + '].label', '押印欄 ' + (i + 1) + '（' + esc(fl.id) + '）') +
            sInput('management.fields[' + i + '].hint', '　説明（任意）', { placeholder: '例：応募受付・申し送りを行った担当者' });
        }).join('') + '</div>' +
        '<div><div class="field"><label>ハンコのプレビュー</label><div class="stamp-preview">' + preview + '</div><div class="hint">印字名・日付・役職の 3 段。印字名は 2〜4 文字が目安です。</div></div></div>' +
      '</div>' +
      sLines('management.managers', '担当者名簿（氏名|印字名|役職|等級）', { type: 'managers', hint: '例: 笹川 晴央|笹川|副支配人|S3 。印字名を省略すると姓（スペースの前）を使います。等級は任意（押印には使いません）。', rows: 17 }) +
      sCheck('management.allowFreeName', '名簿にない担当者を手入力で押せるようにする', 'OFF にすると名簿の担当者だけ選べます。') +
      decisionSettingsHtml(fields));
  }

  // 最終合否（採用／不採用のスタンプ。docs/SPEC-report.md 7 章）
  function decisionSettingsHtml(fields) {
    const St = global.RecruitStamp;
    const dc = global.RecruitStorage && global.RecruitStorage.decisionConfig ? global.RecruitStorage.decisionConfig(draft) : null;
    const today = St ? St.stampDate(new Date()) : '';
    const preview = St && dc
      ? St.verdict({ label: dc.hireLabel, date: today, color: dc.hireColor, size: 96, id: 'stVdHire', sub: dc.sub }) +
        St.verdict({ label: dc.rejectLabel, date: today, color: dc.rejectColor, size: 96, id: 'stVdReject', sub: dc.sub })
      : '';
    return '<h3 class="sub">最終合否（採用／不採用のスタンプ）</h3>' +
      sCheck('management.decision.enabled', '最終合否のスタンプを使う', '保存ファイル（HTML）と Step4 に「採用」「不採用」のボタンを出します。アプリの判定（推奨）とは別の、最終確認者の決定として記録します。') +
      '<div class="field-row">' +
        '<div>' + sInput('management.decision.label', '表示名') +
          sInput('management.decision.hireLabel', '「採用」の表示名', { repaint: true }) +
          sInput('management.decision.rejectLabel', '「不採用」の表示名', { repaint: true }) +
          sInput('management.decision.hint', '説明（任意）') + '</div>' +
        '<div><div class="field"><label>スタンプのプレビュー</label><div class="stamp-preview verdict-preview">' + preview + '</div>' +
          '<div class="hint">採用は朱、不採用は藍。日付と劇場名が入ります。</div></div></div>' +
      '</div>' +
      sSelect('management.decision.stampField', '押印欄と連動', fields.filter(function (fl) { return fl && fl.id; }).map(function (fl) { return { value: fl.id, label: fl.label + '（' + fl.id + '）' }; }).concat([{ value: '', label: '連動しない' }]),
        '合否を押したとき、この押印欄にも同じ担当者の印を押せます。') +
      sCheck('management.decision.autoStampFinal', '合否を押すと、連動する押印欄にも同じ担当者の印を押す（未押印のときだけ）') +
      sCheck('management.decision.filenameSuffix', '合否を付けて保存するとき、ファイル名の末尾に「_採用」「_不採用」を付ける');
  }

  function ioHtml() {
    return section('s-io', 'プロファイルの書き出し／読み込み', '他劇場へ展開するときは JSON を書き出して、相手側で読み込みます。',
      '<div class="actions">' +
        '<button type="button" class="btn" data-action="export">⬇ JSONを書き出す</button>' +
        '<button type="button" class="btn" data-action="import">⬆ JSONを読み込む</button>' +
        '<button type="button" class="btn danger" data-action="reset">初期設定（新宿既定）に戻す</button>' +
      '</div>' +
      '<div class="hint" style="margin-top:10px">設定はこのブラウザ（端末）内に保存されます。別の端末で使う場合は JSON を書き出して持ち運んでください。古い形式の JSON を読み込んだ場合は、新しい項目（高校生の扱い・繁忙期・オールナイト・2軸判定）が既定値で補われます。</div>');
  }

  // ---------- イベント ----------
  function coerce(t) {
    if (t.type === 'checkbox') return t.checked;
    if (t.type === 'number') return t.value === '' ? '' : Number(t.value);
    const dt = t.dataset.type;
    if (dt === 'lines') return t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (dt === 'managers') {
      return t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
        const parts = line.split(/[|｜]/).map(function (x) { return x.trim(); }); // 全角の「｜」も区切りとして受け付ける
        const name = parts[0] || '';
        const short = parts[1] || (global.RecruitStamp ? global.RecruitStamp.shortName(name) : name);
        const m = { name: name, short: short, title: parts[2] || '' };
        if (parts[3]) m.grade = parts[3];
        return m;
      }).filter(function (m) { return m.name; });
    }
    if (dt === 'options') {
      // 面接チェックリストの選択肢: 1 行に「値|表示名」（全角の「｜」も可。表示名を省略すると値）
      return t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
        const parts = line.split(/[|｜]/).map(function (x) { return x.trim(); });
        return { value: parts[0], label: parts[1] || parts[0] };
      }).filter(function (o) { return o.value; });
    }
    if (dt === 'categories') {
      return t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
        const parts = line.split('|');
        return { value: parts[0].trim(), group: (parts[1] || 'other').trim() || 'other' };
      });
    }
    return t.value;
  }

  function onEdit(e) {
    const t = e.target.closest('[data-bind]');
    if (!t) return;
    const v = coerce(t);
    U.setPath(draft, t.dataset.bind, v);
    clOnBindChange(t.dataset.bind, v);
    const row = t.closest('.rule-row, .s-contrib-row');
    if (row && t.type === 'checkbox') row.classList.toggle('off', !t.checked);
    if (e.type === 'change' && t.hasAttribute('data-repaint')) requestRepaint();
  }

  function requestRepaint() {
    repaintPending = true;
    // 設定画面の中でマウスを押している最中（ボタン・チェックボックス等のクリック途中）だけ待つ
    if (pointerDown && downInRoot) {
      setTimeout(function () { flushRepaint(true); }, 1500); // mouseup が届かない場合の保険
      return;
    }
    setTimeout(flushRepaint, 0);
  }

  function flushRepaint(force) {
    if (!repaintPending || !root) return;
    if (pointerDown && downInRoot && !force) return;
    paint(window.scrollY);
  }

  function bindPointer() {
    if (pointerBound) return;
    pointerBound = true;
    document.addEventListener('mousedown', function (e) {
      pointerDown = true;
      downInRoot = !!(root && e.target && root.contains(e.target));
    }, true);
    // click は mouseup と同じタスクで発火するので、setTimeout で click の処理後に描き直す
    document.addEventListener('mouseup', function () {
      pointerDown = false; downInRoot = false;
      setTimeout(flushRepaint, 0);
    }, true);
  }

  function swap(arr, i, j) {
    if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return false;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    return true;
  }

  function doSave() {
    const S = global.RecruitStorage;
    const res = S && S.validateProfile ? S.validateProfile(draft) : { errors: [], warnings: [] };
    if (res.errors.length) {
      issues = res;
      paint(window.scrollY);
      const box = root.querySelector('#settingsIssues');
      if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center' });
      handlers.onToast && handlers.onToast(res.errors[0] + (res.errors.length > 1 ? '（ほか' + (res.errors.length - 1) + '件）' : ''), 'error');
      return;
    }
    issues = null;
    handlers.onSave(U.deepClone(draft));
    if (res.warnings.length && handlers.onToast) handlers.onToast('設定を保存しました。注意: ' + res.warnings.join(' / '));
  }

  function onClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const act = b.dataset.action;
    const i = Number(b.dataset.index);
    const busy = draft.options.vacationItems = draft.options.vacationItems || [];
    const y = window.scrollY;
    if (clOnClick(act, b, y)) return;

    switch (act) {
      case 'save':
        doSave();
        break;
      case 'discard':
        draft = U.deepClone(handlers.current());
        issues = null;
        paint(y);
        handlers.onToast && handlers.onToast('変更を破棄しました');
        break;
      case 'export':
        handlers.onExport(U.deepClone(draft));
        break;
      case 'import':
        handlers.onImport();
        break;
      case 'reset':
        if (window.confirm('すべての設定を初期状態（新宿の既定値）に戻します。よろしいですか？')) { issues = null; handlers.onReset(); }
        break;
      case 'busy-add':
        busy.push({ id: U.uid('busy'), label: '新しい期間', periodNote: '', unit: 'total', maxDays: 7, refDays: 3, weight: 1, critical: false });
        paint(y);
        break;
      case 'busy-del':
        if (busy.length <= 1) return;
        if (!window.confirm('繁忙期「' + (busy[i].label || busy[i].id) + '」を削除します。保存済みの応募者データのこの期間は表示・判定に使われなくなります。よろしいですか？')) return;
        busy.splice(i, 1);
        paint(y);
        break;
      case 'busy-up':
        if (swap(busy, i - 1, i)) paint(y);
        break;
      case 'busy-down':
        if (swap(busy, i, i + 1)) paint(y);
        break;
      case 'stages-default':
        draft.inputStages = U.deepClone(global.RECRUIT_DEFAULT_PROFILE.inputStages);
        paint(y);
        break;
      case 'stages-all-pre': {
        const out = {};
        Object.keys(global.RECRUIT_DEFAULT_PROFILE.inputStages || {}).forEach(function (k) { out[k] = 'pre'; });
        draft.inputStages = out;
        paint(y);
        break;
      }
      case 'rule-default': {
        const def = (global.RECRUIT_DEFAULT_PROFILE.handoffRules || []).find(function (r) { return r.id === draft.handoffRules[i].id; });
        if (def) { draft.handoffRules[i].text = def.text; paint(y); }
        break;
      }
      default:
        break;
    }
  }

  function paint(scrollY) {
    repaintPending = false;
    // 面接チェックリストのセクション（<details>）の開閉を覚えておく
    if (root) Array.prototype.forEach.call(root.querySelectorAll('details.s-cl-sec[data-sec-id]'), function (d) { clOpen[d.getAttribute('data-sec-id')] = d.open; });
    root.innerHTML = template();
    root.oninput = onEdit;
    root.onchange = onEdit;
    root.onclick = onClick;
    if (typeof scrollY === 'number') window.scrollTo(0, scrollY);
  }

  function render(container, profile, h) {
    root = container;
    handlers = h;
    draft = U.deepClone(profile);
    issues = null;
    clOpen = {};
    bindPointer();
    paint();
  }

  global.RecruitSettings = { render: render };
})(window);
