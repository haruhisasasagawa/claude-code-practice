/*
 * 設定画面（劇場プロファイル編集）
 * ----------------------------------------------------------------------
 * data-bind="path.to.value" を持つ入力をプロファイルの下書き（draft）に双方向バインドする。
 * 構造が変わる操作（面接チェックリストのセクション・ブロック・項目の追加・削除・並べ替え）は draft を変更してから再描画する。
 * data-repaint を持つ入力は change で再描画する（満点・境界値の表示更新用）。
 * 「設定を保存」で RecruitStorage.validateProfile を通し、エラーが無ければ app 側の onSave に draft を渡す。
 * 節は 劇場情報／応募者の属性／面接チェックリスト／応募者の管理（押印）／書き出し・読み込み の 5 つ（docs/SPEC-slim.md 4 章）。
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

  // 区分のグループで変わるのは、学生かどうか（Step① の卒業予定年月の欄）だけ（rules.isStudentGroup）
  const GROUP_HINT = '学生は highschool（高校）/ university（大学・大学院）/ vocational（専門学校）で、Step① に卒業予定年月の欄を出します。それ以外は other（freeter などほかの値も学生以外として扱います）';

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

  function sCheck(path, label, hint) {
    return '<label class="check-row"><input type="checkbox" data-bind="' + esc(path) + '"' + (val(path) ? ' checked' : '') + '>' +
      '<div><div class="lbl">' + esc(label) + '</div>' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div></label>';
  }

  function selectTag(path, options, opts) {
    opts = opts || {};
    const cur = String(val(path));
    return '<select data-bind="' + esc(path) + '"' + (opts.repaint ? ' data-repaint' : '') + (opts.aria ? ' aria-label="' + esc(opts.aria) + '"' : '') + '>' +
      options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (String(o.value) === cur ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
      '</select>';
  }

  function sSelect(path, label, options, hint) {
    return '<div class="field"><label>' + esc(label) + '</label>' + selectTag(path, options) +
      (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
  }

  function section(id, title, desc, body) {
    return '<section class="card" id="' + id + '"><div class="card-head"><h2>' + esc(title) + '</h2>' + (desc ? '<p>' + esc(desc) + '</p>' : '') + '</div>' + body + '</section>';
  }

  function resultTitle(r) {
    const t = (draft.texts || {})[r] || {};
    return t.title || { recommend: '採用推奨', review: '上長最終判断要', reject: '不採用推奨' }[r] || r;
  }

  // 画面のステップの呼び方（内部キー 1/3/4 → ①②③）
  function stepRef(n) { return 'Step' + ({ 1: '①', 3: '②', 4: '③' }[n] || n); }

  // ① 応募者で選ぶ区分・性別と卒業予定年月の表示
  function applicantHtml() {
    return section('s-applicant', '応募者の属性', 'Step① 応募者で選ぶ区分・性別と、学生の卒業予定年月の表示です。',
      '<div class="field-row">' +
        sLines('options.categories', '区分', { type: 'categories', hint: '「値|グループ」の形式。' + GROUP_HINT }) +
        sLines('options.genders', '性別') +
      '</div>' +
      sCheck('features.graduationDate', '卒業予定年月（学生）', '学生の区分のとき Step① に卒業予定年月の欄を出します。'));
  }

  // ---------- テンプレート ----------
  function template() {
    return '' +
    '<div class="settings-layout">' +
      '<nav class="settings-nav">' +
        '<a href="#s-meta">劇場情報</a><a href="#s-applicant">応募者の属性</a><a href="#s-checklist">面接チェックリスト</a>' +
        '<a href="#s-mgmt">応募者の管理（押印）</a><a href="#s-io">書き出し／読み込み</a>' +
      '</nav>' +
      '<div class="settings-body">' +
        issuesHtml() +
        metaHtml() + applicantHtml() + checklistHtml() + mgmtHtml() + ioHtml() +
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

  // ---------- 面接チェックリスト（面接台本。docs/SPEC-checklist.md 5 章） ----------
  const CL_TYPE_NAMES = { must: '必須条件', fields: '記入欄', explain: '説明', question: '質問', rating: '確認点（○△×）', notify: '合否連絡', note: '注記' };
  const CL_NEW_TITLE = { must: '必須条件', fields: '', explain: '説明', question: '質問', rating: '確認点', notify: '合否連絡', note: '' };
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
  // 満点（確認点 n＋総合判断）= 2(n+1)。面接評価の帯の境界の表示にも使う
  function clMax() {
    const Rr = clR();
    return Rr.interviewModel && Rr.emptyChecklist ? Rr.interviewModel(draft, Rr.emptyChecklist()).max : 0;
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
    // A4「面接チェックリスト報告」（1 枚）で使う短い名前（質問・合否連絡・記入欄。空なら文言の先頭 14 文字）
    const shortTag = b.type === 'question' || b.type === 'notify' || b.type === 'fields'
      ? '<div class="inline s-cl-short">' + inputTag(ip + '.short', { aria: '報告書での短い名前', placeholder: '報告書（A4 1 枚）での短い名前（任意。空なら文言の先頭 14 文字）' }) + '</div>' : '';
    if (b.type === 'rating') {
      extra = inputTag(ip + '.hint', { aria: '補足', placeholder: '補足（任意。例: 「大丈夫です」のみ連呼は要注意）' });
    } else if (b.type === 'explain') {
      extra = checkTag(ip + '.shortOnly', '※短期求人のみ（応募した求人が短期求人のとき強調）');
    } else if (b.type === 'fields') {
      const kind = CL_KINDS.some(function (o) { return o.value === it.kind; }) ? it.kind : 'text';
      extra = '<div class="inline">' + selectTag(ip + '.kind', CL_KINDS, { repaint: true, aria: '入力の種類' }) + '</div>';
      if (kind === 'choice') {
        const text = (Array.isArray(it.options) ? it.options : []).map(function (o) { return o.value + '|' + (o.label || ''); }).join('\n');
        extra += '<div class="field s-cl-options"><label>選択肢（1行に「値|表示名」）</label><textarea data-bind="' + esc(ip + '.options') + '" data-type="options" rows="2">' + esc(text) + '</textarea></div>';
      }
    }
    return '<div class="s-cl-item" data-item-id="' + esc(it.id) + '"><span class="idx">' + (k + 1) + '</span>' +
      '<div class="s-cl-item-main">' + label + (extra || shortTag ? '<div class="s-cl-item-extra">' + extra + shortTag + '</div>' : '') + '</div>' +
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

  function checklistHtml() {
    const cl = clDraft();
    const secs = cl.sections;
    const pages = Array.isArray(cl.pages) ? cl.pages : (cl.pages = []);
    const oo = U.isObj(cl.overallOptions) ? cl.overallOptions : (cl.overallOptions = {});
    const hd = U.isObj(cl.header) ? cl.header : (cl.header = {});
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
    const pOpts = Array.isArray(posting.options) ? posting.options : [];
    // 面接評価の帯（高・中・低）の境界 evaluation.thresholds
    const th = (draft.evaluation || {}).thresholds || {};
    const bMax = clMax();
    const bandHtml = '<div class="field-row" id="clBandInputs">' +
          sInput('evaluation.thresholds.recommendPct', '面接評価の帯: 高', { type: 'number', min: 0, max: 100, repaint: true, suffix: '% 以上（現在の満点 ' + bMax + '点では ' + Math.ceil(bMax * n(th.recommendPct, 70) / 100) + '点以上）' }) +
          sInput('evaluation.thresholds.reviewPct', '面接評価の帯: 中', { type: 'number', min: 0, max: 100, repaint: true, suffix: '% 以上（' + Math.ceil(bMax * n(th.reviewPct, 40) / 100) + '点以上。未満は 低）' }) +
        '</div>' +
        '<div class="hint" style="margin:-6px 0 8px">報告書の「面接評価（確認点）」に出す 高・中・低 の境界です。結果（推奨）は総合判断で決まり、この境界では変わりません。</div>';

    return section('s-checklist', '面接チェックリスト',
      '面接台本のチェックリストです。必須条件（一致／不一致）と確認点（○△×）・総合判断で面接評価を計算します。文言・項目の増減・確認点の有無を編集できます。面接評価の帯（高・中・低）の境界もこの節で設定します。',
      '<div class="s-cl-max" id="clMaxNote">確認点 <b>' + nRating + '</b> 項目＋総合判断 ＝ 満点 <b>' + clMax() + '</b> 点<span class="hint">（○2・△1・×0、総合判断 採用2・保留1・不採用0）</span></div>' +

      '<h3 class="sub">判定</h3>' +
      '<div class="field-row">' +
        sSelect('checklist.mustFailResult', '必須条件に不一致があるとき', [{ value: 'reject', label: resultTitle('reject') }, { value: 'review', label: resultTitle('review') }],
          '台本どおりなら「' + resultTitle('reject') + '」。' + stepRef(3) + ' では「不一致のとき案内するセクション」へ進んで面接を終えるよう案内します。「' + resultTitle('review') + '」にすると、ほかのセクションの確認点も評価するよう案内します（どちらも未入力のまま報告書へ進めます）。') +
        sSelect('checklist.mustUnknownResult', '必須条件に未確認が残るとき', [{ value: 'none', label: '警告のみ（判定は変えない）' }, { value: 'review', label: '採用推奨に留めない（' + resultTitle('review') + 'まで）' }]) +
      '</div>' +
      '<div class="field-row">' +
        sSelect('checklist.overallCaps.hold', '総合判断「' + (oo.hold || '保留') + '」のとき', capOpts) +
        sSelect('checklist.overallCaps.reject', '総合判断「' + (oo.reject || '不採用') + '」のとき', capOpts) +
      '</div>' +
      '<div class="hint" id="clCapsScriptHint" style="margin:-6px 0 8px">総合判断がそのまま結果になります（採用→採用推奨・保留→上長最終判断要・不採用→不採用推奨）。ここで厳しくした場合だけ結果が下がります。</div>' +
      '<div class="field-row">' +
        sSelect('checklist.mustFailJumpTo', '不一致のとき案内するセクション', [{ value: '', label: '案内しない' }].concat(secs.map(function (s, i) { return { value: s.id, label: clCirc(i + 1) + ' ' + (s.title || '') }; }))) +
      '</div>' +
      bandHtml +

      '<h3 class="sub">総合判断</h3>' +
      '<div class="field-row">' + sInput('checklist.overallLabel', '見出し') + sInput('checklist.overallHint', '説明（' + stepRef(3) + ' に表示）') + '</div>' +
      '<div class="field-row cols-3">' +
        sInput('checklist.overallOptions.hire', '「採用」の表示名') + sInput('checklist.overallOptions.hold', '「保留」の表示名') + sInput('checklist.overallOptions.reject', '「不採用」の表示名') +
      '</div>' +
      '<div class="hint" style="margin:-6px 0 8px">点は 採用 2・保留 1・不採用 0 で固定です。</div>' +

      // 消極属性（negatives・morningOnlyEnd）の行は 2026-10-13 に削除（docs/SPEC-script-mode.md 12 章）
      '<h3 class="sub">ヘッダー</h3>' +
      '<div class="field-row">' +
        sSelect('checklist.header.interviewerField', '担当と連動する押印欄', [{ value: '', label: '連動しない' }].concat(mfields.map(function (f) { return { value: f.id, label: f.label || f.id }; })),
          '担当が空欄のときは、この押印欄の氏名を報告書の担当に使います（自動で押印はしません）。') +
      '</div>' +
      '<div class="field-row">' + sInput('checklist.header.posting.label', '「応募した求人」の見出し') +
        '<div class="field"><label>選択肢の表示名</label><div class="inline">' + pOpts.map(function (o, m) {
          return inputTag('checklist.header.posting.options[' + m + '].label', { aria: '表示名（値: ' + o.value + '）' });
        }).join('') + '</div><div class="hint">値 short（短期求人）のとき「※短期求人のみ」の説明を強調します。</div></div>' +
      '</div>' +

      // 「印刷」の行（checklist.print.showQuestions＝保存 HTML の「詳細」に質問文を載せる）は 2026-10-14 に削除（「詳細」表示ごと削除。docs/SPEC-a4.md）。
      //   報告書は常に A4 1 枚の要約（質問文・説明文は載せない）。キーは旧い設定・記録の互換のため正規化で残す

      '<h3 class="sub">台本</h3>' +
      '<div class="field-row">' + sInput('checklist.version', '版（例: 2026-10-08）', { hint: '報告書（A4）の「台本 … 版」に表示します。' }) + '</div>' +
      '<div class="field-row">' + pages.map(function (pg, k) {
        return '<div>' + sInput('checklist.pages[' + k + '].title', (pg.no || k + 1) + '枚目の見出し') + sTextarea('checklist.pages[' + k + '].lead', (pg.no || k + 1) + '枚目の説明', { rows: 2 }) + '</div>';
      }).join('') + '</div>' +
      '<div class="s-cl-secs">' + secs.map(function (sec, i) { return clSectionHtml(sec, i, secs.length, pageOpts); }).join('') + '</div>' +
      '<div class="actions" style="margin-top:10px">' +
        '<button type="button" class="btn sm" data-action="cl-sec-add">＋ セクションを追加</button>' +
        '<button type="button" class="btn sm ghost" data-action="cl-default">既定の台本（2026-10-08 版）に戻す</button>' +
      '</div>');
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

  // 記入欄の入力の種類を選択式にしたら選択肢の見本を入れる
  function clOnBindChange(path, value) {
    const m = /^checklist\.sections\[(\d+)\]\.blocks\[(\d+)\]\.items\[(\d+)\]\.kind$/.exec(path);
    if (!m) return;
    const sec = clDraft().sections[Number(m[1])];
    const blk = sec && sec.blocks && sec.blocks[Number(m[2])];
    const it = blk && blk.items && blk.items[Number(m[3])];
    if (!it) return;
    if (value === 'choice' && !(Array.isArray(it.options) && it.options.length >= 2)) it.options = [{ value: 'a', label: '選択肢1' }, { value: 'b', label: '選択肢2' }];
  }

  function mgmtHtml() {
    const mg = draft.management || {};
    const fields = Array.isArray(mg.fields) ? mg.fields : [];
    const preview = global.RecruitStamp ? global.RecruitStamp.svg({ name: ((mg.managers || [])[0] || {}).short || '笹川', title: ((mg.managers || [])[0] || {}).title || '副支配人', date: global.RecruitStamp.stampDate(new Date()), size: 76, id: 'stPreview' }) : '';
    return section('s-mgmt', '応募者の管理（押印）', '報告書（A4 の用紙）の最下段に押印欄を出します。名簿から担当者を選ぶと日付入りのハンコが押され、保存した HTML でも用紙の欄をクリックして押印・保存できます。',
      '<div class="field-row">' +
        '<div>' + fields.map(function (fl, i) {
          return sInput('management.fields[' + i + '].label', '押印欄 ' + (i + 1) + '（' + esc(fl.id) + '）') +
            sInput('management.fields[' + i + '].hint', '　説明（任意）', { placeholder: '例：面接を行った担当者' });
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
      sCheck('management.decision.enabled', '最終合否のスタンプを使う', '保存ファイル（HTML）と ' + stepRef(4) + ' に「採用」「不採用」のボタンを出します。アプリの判定（推奨）とは別の、最終確認者の決定として記録します。') +
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
      '<div class="hint" style="margin-top:10px">設定はこのブラウザ（端末）内に保存されます。別の端末で使う場合は JSON を書き出して持ち運んでください。v1 形式の JSON は読み込むと既定の設定になります。削除した機能の設定は読み飛ばします。</div>');
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
