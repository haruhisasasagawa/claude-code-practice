/*
 * 設定画面（劇場プロファイル編集）
 * ----------------------------------------------------------------------
 * data-bind="path.to.value" を持つ入力をプロファイルの下書き（draft）に双方向バインドする。
 * 構造が変わる操作（評価項目の追加・削除・並べ替え）は draft を変更してから再描画する。
 * 「設定を保存」で app 側の onSave に draft を渡す。
 */
;(function (global) {
  'use strict';

  const U = global.RecruitUtil;
  const esc = U.esc;

  let root = null;
  let draft = null;
  let handlers = null;

  const CATEGORY_LABELS = { general: '全般', highschool: '高校生', vocational: '専門学校生', foreign: '外国籍', lateNight: '深夜帯' };
  const GROUP_HINT = 'highschool（高校生）/ university（大学・大学院）/ vocational（専門学校）/ freeter / homemaker / doubleworker / other';
  const VARS_HINT = '{name} {age} {maxAge} {commuteTime} {nearestStation} {minDays} {maxDays} {minShiftHours} {highschoolLatestEnd} {foreignWeeklyHourCap} {foreignVacationWeeklyHourCap} {weeklyHours} {taxiFare} {taxiLimitYen} {closeEndHour} {lateNightStartHour} {residenceExpiry} {japaneseLevel} {vacationLabels}';

  // ---------- 描画ヘルパー ----------
  function val(path) {
    const v = U.getPath(draft, path);
    return v === undefined || v === null ? '' : v;
  }

  function sInput(path, label, opts) {
    opts = opts || {};
    const type = opts.type || 'text';
    const attrs = [
      'type="' + type + '"',
      'data-bind="' + esc(path) + '"',
      'value="' + esc(val(path)) + '"',
      opts.min !== undefined ? 'min="' + opts.min + '"' : '',
      opts.max !== undefined ? 'max="' + opts.max + '"' : '',
      opts.step !== undefined ? 'step="' + opts.step + '"' : '',
      opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '"' : ''
    ].filter(Boolean).join(' ');
    return '<div class="field"><label>' + esc(label) + '</label>' +
      (opts.suffix ? '<div class="inline"><input ' + attrs + '><span class="suffix">' + esc(opts.suffix) + '</span></div>' : '<input ' + attrs + '>') +
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
    else if (opts.type === 'pairs') text = arr.map(function (c) { return c.id + '|' + c.label; }).join('\n');
    else text = arr.join('\n');
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<textarea data-bind="' + esc(path) + '" data-type="' + (opts.type || 'lines') + '" rows="' + (opts.rows || Math.min(Math.max(arr.length + 1, 3), 12)) + '">' + esc(text) + '</textarea>' +
      '<div class="hint">1行に1項目。' + (opts.hint ? esc(opts.hint) : '') + '</div></div>';
  }

  function sCheck(path, label, hint) {
    return '<label class="check-row"><input type="checkbox" data-bind="' + esc(path) + '"' + (val(path) ? ' checked' : '') + '>' +
      '<div><div class="lbl">' + esc(label) + '</div>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div></label>';
  }

  function sSelect(path, label, options, hint) {
    const cur = val(path);
    return '<div class="field"><label>' + esc(label) + '</label><select data-bind="' + esc(path) + '">' +
      options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === cur ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
      '</select>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
  }

  // ---------- テンプレート ----------
  function template() {
    const p = draft;
    const items = p.evaluation.items || [];
    const max = items.length * (Number(p.evaluation.scaleMax) || 5);
    const recPts = Math.ceil(max * (Number(p.evaluation.thresholds.recommendPct) || 0) / 100);
    const revPts = Math.ceil(max * (Number(p.evaluation.thresholds.reviewPct) || 0) / 100);

    return '' +
    '<div class="settings-layout">' +
      '<nav class="settings-nav">' +
        '<a href="#s-meta">劇場情報</a><a href="#s-features">入力項目のON/OFF</a><a href="#s-options">選択肢</a>' +
        '<a href="#s-params">判定パラメータ</a><a href="#s-rules">申し送りルール</a><a href="#s-eval">面接評価・閾値</a>' +
        '<a href="#s-texts">結果文言</a><a href="#s-io">書き出し／読み込み</a>' +
      '</nav>' +
      '<div class="settings-body">' +

        '<section class="card" id="s-meta"><div class="card-head"><h2>劇場情報</h2><p>画面上部・保存ファイルに表示されます。</p></div>' +
          '<div class="field-row">' + sInput('meta.theaterName', '劇場名') + sInput('meta.appTitle', 'アプリ名') + '</div>' +
          '<div class="field-row">' + sInput('meta.version', 'バージョン表記') + '</div>' +
          sTextarea('meta.footer', 'フッター（著作権表記など）', { rows: 2 }) +
        '</section>' +

        '<section class="card" id="s-features"><div class="card-head"><h2>入力項目のON/OFF</h2><p>劇場で不要な項目はOFFにすると入力画面・判定から除外されます。</p></div>' +
          sCheck('features.graduationDate', '卒業予定年月（学生）', '来年3月卒業×中期希望の確認に使います。') +
          sCheck('features.vacation', '長期休暇の対応可否', '夏休み・お盆・年末年始・GWなど。項目は「選択肢」で編集。') +
          sCheck('features.lateNight', '深夜帯（22時以降）勤務可否・帰宅手段', 'クローズ要員の見込み、終電確認に使います。') +
          sCheck('features.taxi', 'タクシー帰宅時の規定金額チェック', '深夜帯がONのときのみ有効。') +
          sCheck('features.foreignNational', '外国籍・在留資格・日本語レベル', '資格外活動許可、週28時間上限、在留期限の確認を自動で出します。') +
          sCheck('features.department', '希望部署', '記録用。判定には使いません。') +
          sCheck('features.applicationRoute', '応募経路', '記録用。判定には使いません。') +
        '</section>' +

        '<section class="card" id="s-options"><div class="card-head"><h2>選択肢</h2><p>入力画面のプルダウンに表示される項目です。</p></div>' +
          '<div class="field-row">' +
            sLines('options.categories', '区分', { type: 'categories', hint: '「値|グループ」の形式。グループ: ' + GROUP_HINT }) +
            sLines('options.genders', '性別') +
          '</div>' +
          '<div class="field-row">' +
            sLines('options.commuteMethods', '通勤方法') +
            sLines('options.stationHints', '最寄り駅の候補', { hint: '入力補完に使います。' }) +
          '</div>' +
          '<h3 class="sub">勤務期間のラベル</h3>' +
          '<div class="field-row cols-3">' +
            sInput('options.workPeriods[0].label', '長期（値: long）') + sInput('options.workPeriods[1].label', '中期（値: mid）') + sInput('options.workPeriods[2].label', '短期（値: short）') +
          '</div>' +
          '<div class="field-row">' +
            sLines('options.vacationItems', '長期休暇の項目', { type: 'pairs', hint: '「id|表示名」の形式。idは英数字。' }) +
            sLines('options.japaneseLevels', '日本語レベル', { hint: '最後の行が最も低いレベルとして「要確認」の判定に使われます。' }) +
          '</div>' +
          '<div class="field-row">' +
            sLines('options.residenceStatuses', '在留資格') +
            sLines('options.departments', '希望部署') +
          '</div>' +
          '<div class="field-row">' + sLines('options.applicationRoutes', '応募経路') + '</div>' +
        '</section>' +

        '<section class="card" id="s-params"><div class="card-head"><h2>判定パラメータ</h2><p>留意点ルールやシフト適合バッジが参照するしきい値です。</p></div>' +
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
            sInput('params.lateNightStartHour', '深夜帯の開始時刻', { type: 'number', min: 0, max: 23, suffix: '時' }) +
            sInput('params.taxiLimitYen', 'タクシー帰宅の規定金額', { type: 'number', min: 0, step: 100, suffix: '円' }) +
            sInput('params.highschoolLatestEnd', '高校生の勤務終了上限（当劇場運用）', { type: 'time' }) +
            sInput('params.foreignWeeklyHourCap', '資格外活動の週上限', { type: 'number', min: 0, suffix: '時間' }) +
            sInput('params.foreignVacationWeeklyHourCap', '同・長期休暇中の週上限', { type: 'number', min: 0, suffix: '時間' }) +
            sInput('params.residenceExpiryWarnMonths', '在留期限が何か月以内で要確認', { type: 'number', min: 0, suffix: 'か月' }) +
          '</div>' +
        '</section>' +

        '<section class="card" id="s-rules"><div class="card-head"><h2>面接者への申し送りルール</h2>' +
          '<p>応募情報が条件に合致したときに表示される留意点です。ON/OFF・重要度・文言を変更できます（条件そのものはコードで定義）。</p></div>' +
          '<div class="legend"><span class="badge danger">要判断</span>採用担当が面接実施の可否を判断　<span class="badge warn">要確認</span>面接時に確認　<span class="badge info">共有</span>面接者へ共有</div>' +
          '<div class="hint" style="margin-bottom:10px">文言で使える変数: <code>' + esc(VARS_HINT) + '</code></div>' +
          rulesHtml() +
        '</section>' +

        '<section class="card" id="s-eval"><div class="card-head"><h2>面接評価項目と閾値</h2><p>面接後の採用可否判定の中核です。項目を増減すると満点が変わるため、閾値は割合（%）で管理します。</p></div>' +
          '<h3 class="sub">評価項目（上から順に表示）</h3>' +
          items.map(function (it, i) {
            return '<div class="item-row"><span class="idx">' + (i + 1) + '</span>' +
              '<input type="text" data-bind="evaluation.items[' + i + '].label" value="' + esc(it.label) + '">' +
              '<div class="row-actions">' +
                '<button type="button" class="btn ghost" data-action="item-up" data-index="' + i + '" title="上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
                '<button type="button" class="btn ghost" data-action="item-down" data-index="' + i + '" title="下へ"' + (i === items.length - 1 ? ' disabled' : '') + '>↓</button>' +
                '<button type="button" class="btn ghost danger" data-action="item-del" data-index="' + i + '" title="削除"' + (items.length <= 1 ? ' disabled' : '') + '>削除</button>' +
              '</div></div>';
          }).join('') +
          '<div class="actions" style="margin-top:8px"><button type="button" class="btn sm" data-action="item-add">＋ 評価項目を追加</button></div>' +
          '<h3 class="sub">採点・判定</h3>' +
          '<div class="field-row cols-3">' +
            sInput('evaluation.scaleMax', '1項目の満点', { type: 'number', min: 2, max: 10, suffix: '点' }) +
            sSelect('evaluation.overallItemId', '「総合判断」として扱う項目', items.map(function (it) { return { value: it.id, label: it.label }; }), '低評価のとき警告を出す項目です。') +
            sInput('evaluation.overallWarnBelow', '総合判断の警告しきい値', { type: 'number', min: 1, max: 10, suffix: '点未満で警告' }) +
          '</div>' +
          '<div class="field-row">' +
            sInput('evaluation.thresholds.recommendPct', '採用推奨', { type: 'number', min: 0, max: 100, suffix: '% 以上（現在の満点 ' + max + '点では ' + recPts + '点以上）' }) +
            sInput('evaluation.thresholds.reviewPct', '上長最終判断要', { type: 'number', min: 0, max: 100, suffix: '% 以上（' + revPts + '点以上。未満は不採用推奨）' }) +
          '</div>' +
          sCheck('evaluation.holdOnUnresolvedBlock', '「要判断」の留意点が未確認のまま採用推奨になった場合、上長最終判断要に留める', '採用担当の判断が済んでいない状態で「採用推奨」が出るのを防ぎます。') +
        '</section>' +

        '<section class="card" id="s-texts"><div class="card-head"><h2>結果文言</h2><p>変数: {name} {total} {max} {pct}</p></div>' +
          '<div class="field-row">' + sInput('texts.recommend.title', '採用推奨: タイトル') + sInput('texts.recommend.body', '採用推奨: 本文') + '</div>' +
          '<div class="field-row">' + sInput('texts.review.title', '上長最終判断要: タイトル') + sInput('texts.review.body', '上長最終判断要: 本文') + '</div>' +
          '<div class="field-row">' + sInput('texts.reject.title', '不採用推奨: タイトル') + sInput('texts.reject.body', '不採用推奨: 本文') + '</div>' +
          sTextarea('texts.disclaimer', '判定結果の注記', { rows: 2 }) +
          sTextarea('texts.handoffIntro', '申し送り画面の説明文', { rows: 2 }) +
          '<h3 class="sub">強みの文言（面接者への共有）</h3>' +
          '<div class="field-row">' +
            sInput('texts.strengths.open', 'オープン要員') + sInput('texts.strengths.close', 'クローズ要員') +
            sInput('texts.strengths.weekend', '土日両日可') + sInput('texts.strengths.longTerm', '長期希望') +
            sInput('texts.strengths.days3', '週3日以上（{minDays}）') + sInput('texts.strengths.longShift', '1日の勤務時間が十分（{minShiftHours}）') +
            sInput('texts.strengths.commuteNear', '通勤が近い（{commuteTime}）') + sInput('texts.strengths.vacationOk', '長期休暇すべて可') +
            sInput('texts.strengths.lateNightOk', '深夜帯可（{lateNightStartHour}）') +
          '</div>' +
        '</section>' +

        '<section class="card" id="s-io"><div class="card-head"><h2>プロファイルの書き出し／読み込み</h2><p>他劇場へ展開するときは JSON を書き出して、相手側で読み込みます。</p></div>' +
          '<div class="actions">' +
            '<button type="button" class="btn" data-action="export">⬇ JSONを書き出す</button>' +
            '<button type="button" class="btn" data-action="import">⬆ JSONを読み込む</button>' +
            '<button type="button" class="btn danger" data-action="reset">初期設定（新宿既定）に戻す</button>' +
          '</div>' +
          '<div class="hint" style="margin-top:10px">設定はこのブラウザ（端末）内に保存されます。別の端末で使う場合は JSON を書き出して持ち運んでください。</div>' +
        '</section>' +

      '</div>' +
    '</div>' +
    '<div class="save-bar"><span class="note">変更は「設定を保存」で反映されます。</span>' +
      '<button type="button" class="btn ghost" data-action="discard">変更を破棄</button>' +
      '<button type="button" class="btn primary" data-action="save">設定を保存</button></div>';
  }

  function rulesHtml() {
    const rules = draft.handoffRules || [];
    const order = ['general', 'highschool', 'vocational', 'foreign', 'lateNight'];
    const sevOpts = [['block', '要判断'], ['warn', '要確認'], ['info', '共有']];
    return order.map(function (cat) {
      const idx = [];
      rules.forEach(function (r, i) { if ((r.category || 'general') === cat) idx.push(i); });
      if (!idx.length) return '';
      return '<h3 class="sub">' + esc(CATEGORY_LABELS[cat] || cat) + '</h3>' + idx.map(function (i) {
        const r = rules[i];
        return '<div class="rule-row' + (r.enabled === false ? ' off' : '') + '">' +
          '<label class="switch"><input type="checkbox" data-bind="handoffRules[' + i + '].enabled"' + (r.enabled !== false ? ' checked' : '') + '><span></span></label>' +
          '<div class="rule-main"><div class="rule-meta"><code>' + esc(r.id) + '</code>' +
            '<select class="sel-sm" data-bind="handoffRules[' + i + '].severity">' +
              sevOpts.map(function (o) { return '<option value="' + o[0] + '"' + (r.severity === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
            '</select>' +
            '<button type="button" class="btn link" data-action="rule-default" data-index="' + i + '">既定の文言に戻す</button>' +
          '</div>' +
          '<textarea data-bind="handoffRules[' + i + '].text" rows="2">' + esc(r.text) + '</textarea></div>' +
        '</div>';
      }).join('');
    }).join('');
  }

  // ---------- イベント ----------
  function coerce(t) {
    if (t.type === 'checkbox') return t.checked;
    if (t.type === 'number') return t.value === '' ? '' : Number(t.value);
    const dt = t.dataset.type;
    if (dt === 'lines') return t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (dt === 'categories') {
      return t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
        const parts = line.split('|');
        return { value: parts[0].trim(), group: (parts[1] || 'other').trim() || 'other' };
      });
    }
    if (dt === 'pairs') {
      return t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
        const parts = line.split('|');
        const id = parts[0].trim().replace(/[^A-Za-z0-9_]/g, '_');
        return { id: id, label: (parts[1] || parts[0]).trim() };
      });
    }
    return t.value;
  }

  function onEdit(e) {
    const t = e.target.closest('[data-bind]');
    if (!t) return;
    U.setPath(draft, t.dataset.bind, coerce(t));
    const row = t.closest('.rule-row');
    if (row && t.type === 'checkbox') row.classList.toggle('off', !t.checked);
  }

  function onClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const act = b.dataset.action;
    const i = Number(b.dataset.index);
    const items = draft.evaluation.items;
    const y = window.scrollY;

    switch (act) {
      case 'save':
        handlers.onSave(U.deepClone(draft));
        break;
      case 'discard':
        draft = U.deepClone(handlers.current());
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
        if (window.confirm('すべての設定を初期状態（新宿の既定値）に戻します。よろしいですか？')) handlers.onReset();
        break;
      case 'item-add':
        items.push({ id: U.uid('item'), label: '新しい評価項目' });
        paint(y);
        break;
      case 'item-del':
        if (items.length <= 1) return;
        if (draft.evaluation.overallItemId === items[i].id) draft.evaluation.overallItemId = items[items.length - 1 === i ? 0 : items.length - 1].id;
        items.splice(i, 1);
        paint(y);
        break;
      case 'item-up':
        if (i > 0) { const tmp = items[i - 1]; items[i - 1] = items[i]; items[i] = tmp; paint(y); }
        break;
      case 'item-down':
        if (i < items.length - 1) { const tmp2 = items[i + 1]; items[i + 1] = items[i]; items[i] = tmp2; paint(y); }
        break;
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
    paint();
  }

  global.RecruitSettings = { render: render };
})(window);
