/*
 * 設定画面（劇場プロファイル編集）
 * ----------------------------------------------------------------------
 * data-bind="path.to.value" を持つ入力をプロファイルの下書き（draft）に双方向バインドする。
 * 構造が変わる操作（面接チェックリストの段階・ブロック・項目の追加・削除・並べ替え）は draft を変更してから再描画する。
 * data-repaint を持つ入力は change で再描画する（満点・境界値の表示更新用）。
 * 「設定を保存」で RecruitStorage.validateProfile を通し、エラーが無ければ app 側の onSave に draft を渡す。
 * 節は 劇場情報／応募者の属性／面接チェックリスト／応募者の管理（押印）／書き出し・読み込み の 5 つ（docs/SPEC-slim.md 4 章）。
 * 見た目は docs/DESIGN.md 4-6（節ごとに見出し帯つきのカード・台本の編集は 段階 → ブロック → 項目 の入れ子・下に保存バー〔操作行と同じ部品〕）。
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
  let lockForm = '';   // 最終承認のパスワードの入力欄: '' | 'change'（変更・設定）| 'remove'（外す）

  function R() { return global.RecruitRules || {}; }

  // 区分のグループで変わるのは、学生かどうか（準備の卒業予定年月の欄）だけ（rules.isStudentGroup）
  const GROUP_HINT = '学生は highschool（高校）/ university（大学・大学院）/ vocational（専門学校）で、「準備」に卒業予定年月の欄を出します。それ以外は other（freeter などほかの値も学生以外として扱います）';

  // 節のメニュー（左。今見ている節に .active）
  const NAV = [['s-meta', '劇場情報'], ['s-applicant', '応募者の属性'], ['s-checklist', '面接チェックリスト'], ['s-mgmt', '応募者の管理（押印）'], ['s-io', '書き出し／読み込み']];
  let navCur = NAV[0][0];
  let navHoldUntil = 0;   // メニューを押した直後は、押した節を今の節にしておく（末尾の短い節はページの上まで来ないため）
  let spyBound = false;

  // ---------- 描画ヘルパー ----------
  function val(path) {
    const v = U.getPath(draft, path);
    return v === undefined || v === null ? '' : v;
  }

  function n(v, def) { const x = Number(v); return v === '' || v == null || isNaN(x) ? def : x; }

  // アイコン（index.html のスプライト。docs/DESIGN.md 2 章）
  function ico(id, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>'; }
  // 文の中の ○△× は和文のフォントで描く（docs/DESIGN.md 1-4）
  function marks(s) { return esc(s).replace(/[○△×]/g, function (m) { return '<span class="ja">' + m + '</span>'; }); }
  // 欄の id（ラベルの for に使う）。data-bind のパスから作る
  function fid(path) { return 'sb-' + String(path).replace(/[^A-Za-z0-9_-]+/g, '-'); }
  function hintHtml(h) { return h ? '<div class="field-hint hint">' + esc(h) + '</div>' : ''; }

  function inputTag(path, opts) {
    opts = opts || {};
    const attrs = [
      'type="' + (opts.type || 'text') + '"',
      'id="' + fid(path) + '"',
      opts.cls ? 'class="' + opts.cls + '"' : '',
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

  // ラベルが上の欄（.field。docs/DESIGN.md 3-5）。opts.unit: 欄の中の右の単位（「%」。.input-unit・目安の「分」と同じ部品）・opts.suffix: 欄の右の説明（折り返す）
  function sInput(path, label, opts) {
    opts = opts || {};
    const tag = opts.unit ? '<span class="input-unit">' + inputTag(path, opts) + '<span class="unit">' + esc(opts.unit) + '</span></span>' : inputTag(path, opts);
    return '<div class="field"><label for="' + fid(path) + '">' + esc(label) + '</label>' +
      (opts.suffix ? '<div class="inline">' + tag + '<span class="suffix">' + esc(opts.suffix) + '</span></div>' : tag) +
      hintHtml(opts.hint) + '</div>';
  }

  function sTextarea(path, label, opts) {
    opts = opts || {};
    return '<div class="field"><label for="' + fid(path) + '">' + esc(label) + '</label>' +
      '<textarea id="' + fid(path) + '" data-bind="' + esc(path) + '" rows="' + (opts.rows || 3) + '">' + esc(val(path)) + '</textarea>' +
      hintHtml(opts.hint) + '</div>';
  }

  function sLines(path, label, opts) {
    opts = opts || {};
    const arr = U.getPath(draft, path) || [];
    let text;
    if (opts.type === 'categories') text = arr.map(function (c) { return c.value + '|' + (c.group || 'other'); }).join('\n');
    else if (opts.type === 'managers') text = arr.map(function (c) { return [c.name, c.short || '', c.title || ''].concat(c.grade ? [c.grade] : []).join('|'); }).join('\n');
    else text = arr.join('\n');
    return '<div class="field"><label for="' + fid(path) + '">' + esc(label) + '</label>' +
      '<textarea id="' + fid(path) + '" data-bind="' + esc(path) + '" data-type="' + (opts.type || 'lines') + '" rows="' + (opts.rows || Math.min(Math.max(arr.length + 1, 3), 12)) + '">' + esc(text) + '</textarea>' +
      '<div class="field-hint hint">1行に1項目。' + (opts.hint ? esc(opts.hint) : '') + '</div></div>';
  }

  // チェックボックスの行（ラベル全体を押せる。名前〔本文の 15/400〕＋補足）
  function sCheck(path, label, hint) {
    return '<label class="check-row"><input type="checkbox" id="' + fid(path) + '" data-bind="' + esc(path) + '"' + (val(path) ? ' checked' : '') + '>' +
      '<span class="check-text"><span class="lbl">' + esc(label) + '</span>' + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</span></label>';
  }

  function selectTag(path, options, opts) {
    opts = opts || {};
    const cur = String(val(path));
    return '<select id="' + fid(path) + '" data-bind="' + esc(path) + '"' + (opts.repaint ? ' data-repaint' : '') + (opts.aria ? ' aria-label="' + esc(opts.aria) + '"' : '') + '>' +
      options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (String(o.value) === cur ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
      '</select>';
  }

  function sSelect(path, label, options, hint, opts) {
    return '<div class="field"><label for="' + fid(path) + '">' + esc(label) + '</label>' + selectTag(path, options, opts) + hintHtml(hint) + '</div>';
  }

  // 横に並べる小さいラベル＋欄（台本の項目の「補足」「報告書での短い名前」など）
  function sPair(path, label, opts) {
    opts = opts || {};
    return '<span class="s-pair' + (opts.pairCls ? ' ' + opts.pairCls : '') + '"><label for="' + fid(path) + '">' + esc(label) + '</label>' +
      (opts.select ? selectTag(path, opts.select, opts) : inputTag(path, opts)) + '</span>';
  }

  // 節のカード（見出し帯: アイコン＋題＋数。本文の先頭に .card-note。docs/DESIGN.md 3-3・4-6）
  function section(id, icon, title, small, noteHtml, body) {
    return '<section class="card" id="' + id + '" aria-labelledby="' + id + '-h">' +
      '<header class="card-band">' + ico(icon) + '<h2 class="card-title" id="' + id + '-h"><span>' + esc(title) + '</span>' + (small ? '<small>' + esc(small) + '</small>' : '') + '</h2></header>' +
      '<div class="card-body">' + (noteHtml ? '<p class="card-note">' + noteHtml + '</p>' : '') + body + '</div></section>';
  }
  // カードの中の小見出し（15/700 紺。2 つ目からは上に区切りの線。docs/DESIGN.md 3-4）
  function groupH(title, opts) {
    opts = opts || {};
    return '<h3 class="group-h"' + (opts.id ? ' id="' + opts.id + '"' : '') + '>' + esc(title) + (opts.small ? '<small>' + esc(opts.small) + '</small>' : '') + '</h3>';
  }

  function resultTitle(r) {
    const t = (draft.texts || {})[r] || {};
    return t.title || { recommend: '採用推奨', review: '上長最終判断要', reject: '不採用推奨' }[r] || r;
  }

  // 画面のステップの呼び方（内部キー 1〜4 → 「準備」「面接」「評価」「報告書」。docs/SPEC-flow.md 8 章）
  function stepRef(n) { return '「' + ({ 1: '準備', 2: '面接', 3: '評価', 4: '報告書' }[n] || n) + '」'; }

  // 準備で選ぶ区分・性別と卒業予定年月の表示
  function applicantHtml() {
    return section('s-applicant', 'user', '応募者の属性', '3 項目', esc(stepRef(1) + 'で選ぶ区分・性別と、学生の卒業予定年月の表示です。'),
      '<div class="field-row">' +
        sLines('options.categories', '区分', { type: 'categories', hint: '「値|グループ」の形式。' + GROUP_HINT }) +
        sLines('options.genders', '性別') +
      '</div>' +
      sCheck('features.graduationDate', '卒業予定年月（学生）', '学生の区分のとき' + stepRef(1) + 'に卒業予定年月の欄を出します。'));
  }

  // ---------- テンプレート ----------
  //   .page（1120 の枠）の中に 左の節のメニュー＋右の節のカード、最後の子に保存バー（.flow-foot。4 画面の操作行と同じ座標。docs/DESIGN.md 3-10）。
  //   保存バーの DOM は主ボタンが先（Tab で最後の入力の次が［設定を保存］）。見た目は 左に注記・右に［変更を破棄］［設定を保存］
  function template() {
    return '' +
    '<div class="page settings-page">' +
      '<div class="settings-layout">' +
        '<nav class="settings-nav" aria-label="設定の節">' + NAV.map(function (x) {
          return '<a href="#' + x[0] + '"' + (x[0] === navCur ? ' class="active" aria-current="true"' : '') + '>' + esc(x[1]) + '</a>';
        }).join('') + '</nav>' +
        '<div class="settings-body">' +
          issuesHtml() +
          metaHtml() + applicantHtml() + checklistHtml() + mgmtHtml() + ioHtml() +
        '</div>' +
      '</div>' +
      '<div class="flow-foot save-bar">' +
        '<button type="button" class="btn primary" data-action="save">設定を保存</button>' +
        '<button type="button" class="btn" data-action="discard">変更を破棄</button>' +
        '<span class="ff-note">変更は「設定を保存」で反映されます。</span><span class="spacer"></span>' +
      '</div>' +
    '</div>';
  }

  function issuesHtml() {
    if (!issues || !issues.errors.length) return '';
    return '<div class="alert danger s-issues" id="settingsIssues" role="alert">' + ico('alert') + '<div class="alert-body"><p class="alert-title">保存できません。次の項目を直してください。</p><ul class="alert-list">' +
      issues.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div></div>';
  }

  function metaHtml() {
    return section('s-meta', 'settings', '劇場情報', '4 項目', '画面上部・保存ファイルに表示されます。',
      '<div class="field-row">' + sInput('meta.theaterName', '劇場名') + sInput('meta.appTitle', 'アプリ名') + '</div>' +
      '<div class="field-row">' + sInput('meta.version', 'バージョン表記') + '</div>' +
      sTextarea('meta.footer', 'フッター（著作権表記など）', { rows: 2 }));
  }

  // ---------- 面接チェックリスト（面接台本。docs/SPEC-checklist.md 5 章） ----------
  const CL_TYPE_NAMES = { must: '必須条件', fields: '記入欄', explain: '説明', question: '質問', rating: '確認点（○△×）', notify: '合否連絡', note: '注記' };
  const CL_NEW_TITLE = { must: '必須条件', fields: '', explain: '説明', question: '質問', rating: '確認点', notify: '合否連絡', note: '' };
  const CL_KINDS = [{ value: 'text', label: '文字' }, { value: 'date', label: '日付' }, { value: 'month', label: '年月' }, { value: 'choice', label: '選択式' }];
  let clOpen = {};   // 台本の段階（<details>）の開閉。再描画で閉じないように覚える

  function clR() { return R(); }
  function clCirc(n) { const f = clR().circled; return f ? f(n) : '(' + n + ')'; }
  // 番号の部品（丸に数字。中の丸数字の文字は見た目だけ消す。docs/DESIGN.md 3-7）
  function nb(k) { return '<span class="nb" data-no="' + k + '">' + esc(clCirc(k)) + '</span>'; }
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
  // 並べ替え・削除（アイコンだけの sm ボタン。aria-label 必須。削除は赤の文字。docs/DESIGN.md 3-1）
  function rowBtns(prefix, attrs, idx, len, opts) {
    opts = opts || {};
    const what = opts.what || '';
    return '<span class="s-item-ops">' +
      '<button type="button" class="btn sm icon" data-action="' + prefix + '-up" ' + attrs + ' aria-label="' + esc(what) + 'を上へ" title="上へ"' + (idx === 0 ? ' disabled' : '') + '>' + ico('arrow-up') + '</button>' +
      '<button type="button" class="btn sm icon" data-action="' + prefix + '-down" ' + attrs + ' aria-label="' + esc(what) + 'を下へ" title="下へ"' + (idx === len - 1 ? ' disabled' : '') + '>' + ico('arrow-down') + '</button>' +
      '<button type="button" class="btn sm icon danger" data-action="' + prefix + '-del" ' + attrs + ' aria-label="' + esc(what) + 'を削除" title="削除"' + (opts.noDelete ? ' disabled' : '') + '>' + ico('trash') + '</button>' +
    '</span>';
  }
  function checkTag(path, label, opts) {
    opts = opts || {};
    return '<label class="s-check"><input type="checkbox" id="' + fid(path) + '" data-bind="' + esc(path) + '"' + (val(path) ? ' checked' : '') + (opts.repaint ? ' data-repaint' : '') + '><span>' + esc(label) + '</span></label>';
  }

  // 項目の行: 番号・文の入力（質問は 2 行）・補足など・↑↓削除（docs/DESIGN.md 4-6）
  function clItemHtml(b, ip, i, j, k, len) {
    const it = b.items[k];
    const attrs = 'data-sec="' + i + '" data-block="' + j + '" data-index="' + k + '"';
    const label = b.type === 'question'
      ? '<textarea id="' + fid(ip + '.label') + '" data-bind="' + esc(ip + '.label') + '" rows="2" aria-label="質問文">' + esc(it.label || '') + '</textarea>'
      : inputTag(ip + '.label', { aria: b.type === 'fields' ? '欄の名前' : '文言' });
    let extra = '';
    // A4「面接チェックリスト報告」（1 枚）と面接記入シートで使う短い名前（質問・合否連絡・記入欄・説明・確認点。空なら文言の先頭 14 文字。docs/SPEC-persona.md D16）
    const shortTag = b.type === 'question' || b.type === 'notify' || b.type === 'fields' || b.type === 'explain' || b.type === 'rating'
      ? sPair(ip + '.short', '報告書での短い名前', { pairCls: 's-short', placeholder: '任意。空なら文言の先頭 14 文字' }) : '';
    if (b.type === 'rating') {
      extra = sPair(ip + '.hint', '補足', { pairCls: 's-hint', placeholder: '任意。例：「大丈夫です」のみ連呼は要注意' });
    } else if (b.type === 'explain') {
      extra = checkTag(ip + '.shortOnly', '※短期求人のみ（応募した求人が短期求人のとき強調）');
    } else if (b.type === 'fields') {
      const kind = CL_KINDS.some(function (o) { return o.value === it.kind; }) ? it.kind : 'text';
      extra = sPair(ip + '.kind', '入力の種類', { pairCls: 's-kind', select: CL_KINDS, repaint: true });
      if (kind === 'choice') {
        const text = (Array.isArray(it.options) ? it.options : []).map(function (o) { return o.value + '|' + (o.label || ''); }).join('\n');
        extra += '<div class="field s-cl-options"><label for="' + fid(ip + '.options') + '">選択肢（1行に「値|表示名」）</label><textarea id="' + fid(ip + '.options') + '" data-bind="' + esc(ip + '.options') + '" data-type="options" rows="2">' + esc(text) + '</textarea></div>';
      }
    }
    return '<div class="s-item s-cl-item" data-item-id="' + esc(it.id) + '"><span class="row-no">' + (k + 1) + '</span>' +
      '<div class="s-item-main">' + label + (extra || shortTag ? '<div class="s-item-extra">' + extra + shortTag + '</div>' : '') + '</div>' +
      rowBtns('cl-item', attrs, k, len, { what: '項目' }) + '</div>';
  }

  // ブロック（地 --surface-2）: 種類のバッジ（紺）・見出し・↑↓削除 → 注記 → メモ欄 → 項目の行 → ［＋ 項目を追加］
  function clBlockHtml(b, bp, i, j, len) {
    const attrs = 'data-sec="' + i + '" data-block="' + j + '"';
    const items = Array.isArray(b.items) ? b.items : (b.items = []);
    const memoable = b.type === 'question' || b.type === 'explain';
    const isNote = b.type === 'note';
    return '<div class="s-block s-cl-block" data-block-type="' + esc(b.type) + '">' +
      '<div class="s-block-head"><span class="badge navy">' + marks(CL_TYPE_NAMES[b.type] || b.type) + '</span>' +
        (isNote
          ? inputTag(bp + '.note', { aria: '注記の本文', placeholder: '注記の本文（例：条件一致：2へ）' })
          : inputTag(bp + '.title', { aria: '見出し', placeholder: '見出し（【】は自動で付きます）' })) +
        rowBtns('cl-block', attrs, j, len, { what: 'ブロック' }) +
      '</div>' +
      (isNote ? '' : sPair(bp + '.note', '注記', { pairCls: 's-block-note', placeholder: '任意' })) +
      (memoable ? '<div class="s-block-memo">' + checkTag(bp + '.memo', 'メモ欄を出す', { repaint: true }) +
        (b.memo ? sPair(bp + '.memoLabel', 'メモ欄の名前', { placeholder: 'メモ' }) : '') + '</div>' : '') +
      (isNote ? '' : '<div class="s-items">' + items.map(function (it, k) { return clItemHtml(b, bp + '.items[' + k + ']', i, j, k, items.length); }).join('') + '</div>' +
        '<div class="s-add s-cl-item-add"><button type="button" class="btn sm ghost" data-action="cl-item-add" ' + attrs + '>' + ico('plus') + '<span>項目を追加</span></button></div>') +
    '</div>';
  }

  // 段階（details.s-stage。summary に番号・名前・目安とブロックの数・▾）→ 開いた中に 名前・目安・ページ・並び → 説明 → ブロック → ［種類］［＋ ブロックを追加］
  function clSectionHtml(sec, i, len, pageOpts) {
    const sp = 'checklist.sections[' + i + ']';
    const blocks = Array.isArray(sec.blocks) ? sec.blocks : (sec.blocks = []);
    const counts = {};
    blocks.forEach(function (b) { counts[b.type] = (counts[b.type] || 0) + (Array.isArray(b.items) ? b.items.length : 0); });
    const meta = [sec.minutes ? (sec.minutesMax ? '最大 ' : '目安 ') + sec.minutes + ' 分' : '', blocks.length + ' ブロック']
      .concat(['must', 'rating'].filter(function (t) { return counts[t]; }).map(function (t) { return (t === 'must' ? '必須条件 ' : '確認点 ') + counts[t]; }))
      .filter(Boolean).join('・');
    const open = Object.prototype.hasOwnProperty.call(clOpen, sec.id) ? clOpen[sec.id] : i === 0;
    return '<details class="s-stage s-cl-sec" data-sec-id="' + esc(sec.id) + '"' + (open ? ' open' : '') + '>' +
      '<summary>' + nb(i + 1) + '<span class="s-stage-t"><span class="s-stage-name">' + esc(sec.title || '（名前なし）') + '</span><span class="s-stage-meta">' + esc(meta) + '</span></span>' + ico('chevron-down', 'chev') + '</summary>' +
      '<div class="s-stage-body">' +
        '<div class="s-stage-row">' +
          sInput(sp + '.title', '段階の名前') +
          '<div class="field"><label for="' + fid(sp + '.minutes') + '">目安</label><div class="s-min">' +
            '<span class="input-unit">' + inputTag(sp + '.minutes', { type: 'number', min: 0, max: 60, step: 1, cls: 'no-spin' }) + '<span class="unit">分</span></span>' +
            checkTag(sp + '.minutesMax', '最大') + '</div></div>' +
          sSelect(sp + '.page', 'ページ（印刷）', pageOpts, '', { repaint: true }) +
          '<div class="field s-ops-field"><span class="field-label">並び・削除</span>' + rowBtns('cl-sec', 'data-sec="' + i + '"', i, len, { noDelete: len <= 1, what: '段階' }) + '</div>' +
        '</div>' +
        sTextarea(sp + '.lead', '段階の説明（任意）', { rows: 1 }) +
        blocks.map(function (b, j) { return clBlockHtml(b, sp + '.blocks[' + j + ']', i, j, blocks.length); }).join('') +
        '<div class="s-add s-cl-add"><select data-cl-newtype aria-label="追加するブロックの種類">' +
          Object.keys(CL_TYPE_NAMES).map(function (t) { return '<option value="' + t + '"' + (t === 'rating' ? ' selected' : '') + '>' + esc(CL_TYPE_NAMES[t]) + '</option>'; }).join('') +
          '</select><button type="button" class="btn sm" data-action="cl-block-add" data-sec="' + i + '">' + ico('plus') + '<span>ブロックを追加</span></button></div>' +
      '</div>' +
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
    // 人物像（1〜5 点。docs/SPEC-persona.md 6-2）
    const pd = U.isObj(cl.persona) ? cl.persona : (cl.persona = U.deepClone(global.RECRUIT_DEFAULT_PROFILE.checklist.persona));
    const psItems = Array.isArray(pd.items) ? pd.items.filter(function (it) { return U.isObj(it); }) : [];
    const psMax = psItems.length * 5;
    const psLabels = Array.isArray(pd.scaleLabels) ? pd.scaleLabels : [];
    const psText = psItems.map(function (it) {
      const parts = [it.label || '', it.short || '', it.hint || ''];
      while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
      return parts.join('|');
    }).join('\n');
    const personaHtml = groupH('人物像（1〜5 点）', { id: 's-persona' }) +
      '<p class="hint">' + stepRef(3) + 'の総評で項目ごとに 1〜5 点（' + esc([0, 1, 2, 3, 4].map(function (i) { return (i + 1) + ' ' + (psLabels[i] || ''); }).join('・')) + '）を付けます。結果（推奨）は下げる方向にだけ使います（上げることはありません）。</p>' +
      sCheck('checklist.persona.enabled', '人物像を使う', 'OFF にすると' + stepRef(3) + 'に出さず、判定にも使いません。保存済みの報告書（HTML）は保存したときのままです。') +
      '<div class="s-max" id="clPsMaxNote">人物像 <b>' + psItems.length + '</b> 項目 × 5 点 ＝ 満点 <b>' + psMax + '</b> 点</div>' +
      '<div class="field-row">' + sInput('checklist.persona.title', '見出し（' + stepRef(3) + 'と報告書）') + '</div>' +
      '<div class="field"><label for="' + fid('checklist.persona.items') + '">項目（1 行に「項目名|短い名前|説明」）</label><textarea id="' + fid('checklist.persona.items') + '" data-bind="checklist.persona.items" data-type="persona" data-repaint rows="8">' + esc(psText) + '</textarea>' +
        '<div class="field-hint hint">短い名前（判定の理由・記入シート）と説明（' + stepRef(3) + 'に小さく表示）は省略できます。上から表示の順です。項目名を変えなければ、並べ替えても入力済みの点は引き継ぎます。</div></div>' +
      '<div class="field-row">' +
        sInput('checklist.persona.keepPct', 'そのまま（得点率）', { type: 'number', min: 0, max: 100, repaint: true, unit: '%', suffix: '以上（満点 ' + psMax + ' 点では ' + Math.ceil(psMax * n(pd.keepPct, 70) / 100) + ' 点以上）' }) +
        sInput('checklist.persona.rejectBelowPct', '不採用推奨（得点率）', { type: 'number', min: 0, max: 100, repaint: true, unit: '%', suffix: '未満（' + Math.ceil(psMax * n(pd.rejectBelowPct, 40) / 100) + ' 点未満。その間は' + resultTitle('review') + 'まで）' }) +
      '</div>' +
      '<div class="field-row">' +
        sSelect('checklist.persona.onePointResult', '1 点の項目があるとき', capOpts) +
        sSelect('checklist.persona.unscoredResult', '未入力の項目があるとき', capOpts) +
      '</div>';
    // 面接評価の帯（高・中・低）の境界 evaluation.thresholds
    const th = (draft.evaluation || {}).thresholds || {};
    const bMax = clMax();
    const bandHtml = '<div class="field-row" id="clBandInputs">' +
          sInput('evaluation.thresholds.recommendPct', '面接評価の帯：高', { type: 'number', min: 0, max: 100, repaint: true, unit: '%', suffix: '以上（現在の満点 ' + bMax + '点では ' + Math.ceil(bMax * n(th.recommendPct, 70) / 100) + '点以上）' }) +
          sInput('evaluation.thresholds.reviewPct', '面接評価の帯：中', { type: 'number', min: 0, max: 100, repaint: true, unit: '%', suffix: '以上（' + Math.ceil(bMax * n(th.reviewPct, 40) / 100) + '点以上。未満は 低）' }) +
        '</div>' +
        '<p class="hint s-note">報告書の「面接評価（確認点）」に出す 高・中・低 の境界です。結果（推奨）は総合判断で決まり、この境界では変わりません。</p>';

    return section('s-checklist', 'check-list', '面接チェックリスト（台本）', secs.length + ' 段階',
      marks('面接台本のチェックリストです。必須条件（一致／不一致）と確認点（○△×）・総合判断で面接評価を計算します。文言・項目の増減・確認点の有無を編集できます。面接評価の帯（高・中・低）の境界と、人物像（1〜5 点）の項目・結果を下げる境界もこの節で設定します。'),
      '<div class="s-max" id="clMaxNote">確認点 <b>' + nRating + '</b> 項目＋総合判断 ＝ 満点 <b>' + clMax() + '</b> 点<span class="hint">' + marks('（○2・△1・×0、総合判断 採用2・保留1・不採用0）') + '</span></div>' +

      groupH('判定') +
      '<div class="field-row">' +
        sSelect('checklist.mustFailResult', '必須条件に不一致があるとき', [{ value: 'reject', label: resultTitle('reject') }, { value: 'review', label: resultTitle('review') }],
          '台本どおりなら「' + resultTitle('reject') + '」。' + stepRef(2) + 'では「不一致のとき案内する段階」へ進んで面接を終えるよう案内します。「' + resultTitle('review') + '」にすると、ほかの段階の確認点も評価するよう案内します（どちらも未入力のまま報告書へ進めます）。') +
        sSelect('checklist.mustUnknownResult', '必須条件に未確認が残るとき', [{ value: 'none', label: '警告のみ（判定は変えない）' }, { value: 'review', label: '採用推奨に留めない（' + resultTitle('review') + 'まで）' }]) +
      '</div>' +
      '<div class="field-row">' +
        sSelect('checklist.overallCaps.hold', '総合判断「' + (oo.hold || '保留') + '」のとき', capOpts) +
        sSelect('checklist.overallCaps.reject', '総合判断「' + (oo.reject || '不採用') + '」のとき', capOpts) +
      '</div>' +
      '<p class="hint s-note" id="clCapsScriptHint">総合判断がそのまま結果になります（採用→採用推奨・保留→上長最終判断要・不採用→不採用推奨）。ここで厳しくした場合だけ結果が下がります。</p>' +
      '<div class="field-row">' +
        sSelect('checklist.mustFailJumpTo', '不一致のとき案内する段階', [{ value: '', label: '案内しない' }].concat(secs.map(function (s, i) { return { value: s.id, label: clCirc(i + 1) + ' ' + (s.title || '') }; }))) +
      '</div>' +
      bandHtml +

      groupH('総合判断', { small: '点は 採用 2・保留 1・不採用 0 で固定です。' }) +
      '<div class="field-row">' + sInput('checklist.overallLabel', '見出し') + sInput('checklist.overallHint', '説明（' + stepRef(3) + 'に表示）') + '</div>' +
      '<div class="field-row cols-3">' +
        sInput('checklist.overallOptions.hire', '「採用」の表示名') + sInput('checklist.overallOptions.hold', '「保留」の表示名') + sInput('checklist.overallOptions.reject', '「不採用」の表示名') +
      '</div>' +

      personaHtml +

      // 消極属性（negatives・morningOnlyEnd）の行は 2026-10-13 に削除（docs/SPEC-script-mode.md 12 章）
      groupH('ヘッダー') +
      '<div class="field-row">' +
        sSelect('checklist.header.interviewerField', '担当と連動する押印欄', [{ value: '', label: '連動しない' }].concat(mfields.map(function (f) { return { value: f.id, label: f.label || f.id }; })),
          '担当が空欄のときは、この押印欄の氏名を報告書の担当に使います（自動で押印はしません）。') +
      '</div>' +
      '<div class="field-row">' + sInput('checklist.header.posting.label', '「応募した求人」の見出し') +
        '<div class="field"><span class="field-label">選択肢の表示名</span><div class="s-opts">' + pOpts.map(function (o, m) {
          return inputTag('checklist.header.posting.options[' + m + '].label', { aria: '表示名（値: ' + o.value + '）' });
        }).join('') + '</div><div class="field-hint hint">値 short（短期求人）のとき「※短期求人のみ」の説明を強調します。</div></div>' +
      '</div>' +

      // 「印刷」の行（checklist.print.showQuestions＝保存 HTML の「詳細」に質問文を載せる）は 2026-10-14 に削除（「詳細」表示ごと削除。docs/SPEC-a4.md）。
      //   報告書は常に A4 1 枚の要約（質問文・説明文は載せない）。キーは旧い設定・記録の互換のため正規化で残す

      groupH('台本') +
      '<p class="hint">段階を開いて、ブロック（必須条件・記入欄・説明・質問・確認点・合否連絡・注記）と項目を編集します。面接の画面・評価の画面・A4 の報告書・記入シートに、この台本がそのまま使われます。</p>' +
      '<div class="field-row">' + sInput('checklist.version', '版（例：2026-10-08）', { hint: '報告書（A4）の「台本 … 版」に表示します。' }) + '</div>' +
      '<div class="field-row">' + pages.map(function (pg, k) {
        return '<div class="s-page">' + sInput('checklist.pages[' + k + '].title', (pg.no || k + 1) + '枚目の見出し') + sTextarea('checklist.pages[' + k + '].lead', (pg.no || k + 1) + '枚目の説明', { rows: 2 }) + '</div>';
      }).join('') + '</div>' +
      '<div class="s-stages">' + secs.map(function (sec, i) { return clSectionHtml(sec, i, secs.length, pageOpts); }).join('') + '</div>' +
      '<div class="actions">' +
        '<button type="button" class="btn sm" data-action="cl-sec-add">' + ico('plus') + '<span>段階を追加</span></button>' +
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
        secs.push({ id: id, title: '新しい段階', minutes: 0, minutesMax: false, page: lastPage, lead: '', blocks: [clNewBlock('rating')] });
        clOpen[id] = true;
        break;
      }
      case 'cl-sec-del':
        if (!sec || secs.length <= 1 || !clDelConfirm('段階')) return true;
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
        if (!window.confirm('面接チェックリストを既定の台本（2026-10-08 版）に戻します（人物像の項目・境界も既定に戻ります）。編集した文言・項目は失われます。保存済みの応募者ファイルのレポートは保存時点の台本で表示されます。よろしいですか？')) return true;
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
    return section('s-mgmt', 'stamp', '応募者の管理（押印）', fields.length + ' 欄', esc('報告書（A4 の用紙）の最下段に押印欄を出します。名簿から担当者を選ぶと日付入りのハンコが押され、保存した HTML でも用紙の欄をクリックして押印・保存できます。'),
      '<div class="s-split">' +
        '<div class="s-split-main">' + fields.map(function (fl, i) {
          return '<div class="field-row">' + sInput('management.fields[' + i + '].label', '押印欄 ' + (i + 1) + '（' + fl.id + '）') +
            sInput('management.fields[' + i + '].hint', '押印欄 ' + (i + 1) + ' の説明（任意）', { placeholder: '例：面接を行った担当者' }) + '</div>';
        }).join('') + '</div>' +
        '<div class="field s-split-side"><span class="field-label">ハンコのプレビュー</span><div class="stamp-preview">' + preview + '</div><div class="field-hint hint">印字名・日付・役職の 3 段。印字名は 2〜4 文字が目安です。</div></div>' +
      '</div>' +
      sLines('management.managers', '担当者名簿（氏名|印字名|役職|等級）', { type: 'managers', hint: '例：笹川 晴央|笹川|副支配人|S3 。印字名を省略すると姓（スペースの前）を使います。等級は任意（押印には使いません）。', rows: Math.min(Math.max((Array.isArray(mg.managers) ? mg.managers.length : 0) + 1, 4), 17) }) +
      sCheck('management.allowFreeName', '名簿にない担当者を手入力で押せるようにする', 'OFF にすると名簿の担当者だけ選べます。') +
      decisionSettingsHtml(fields) + finalLockHtml());
  }

  // ---------- 最終承認のパスワード（docs/SPEC-a4.md 11 章） ----------
  //   下書きの management.finalLock（{ salt, hash }。平文は持たない）を変える。変更は下書きに入り、「設定を保存」で確定する。
  //   入力欄は data-bind を持たない（下書きに平文を入れない）。変更・外すには現在のパスワードが要る（設定済みのとき）
  function lockOf(p) { return ((p || {}).management || {}).finalLock; }
  function lockIsOn(l) { const L = global.RecruitLock; return !!(L && L.isLocked(l)); }
  function pwField(id, label) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><input type="password" id="' + id + '" class="lock-pw" autocomplete="off"></div>';
  }
  function finalLockHtml() {
    const lk = lockOf(draft), on = lockIsOn(lk);
    const saved = handlers && handlers.current ? lockOf(handlers.current()) : null;
    const key = function (l) { return lockIsOn(l) ? l.salt + ':' + l.hash : ''; };
    const pending = key(lk) !== key(saved);
    let body = '';
    // 確定のボタンは副（主ボタンは保存バーの［設定を保存］だけ。docs/DESIGN.md 3-1）
    if (lockForm === 'change') {
      body = '<div class="lock-form" id="finalLockForm" data-lock-form="change">' +
        (on ? pwField('lockCur', '現在のパスワード') : '') + pwField('lockNew', '新しいパスワード') + pwField('lockNew2', '新しいパスワード（確認）') +
        '<div class="lock-err" id="finalLockErr" role="alert"></div>' +
        '<div class="actions"><button type="button" class="btn sm" data-action="lock-apply" id="finalLockApply">' + ico('lock') + '<span>' + (on ? '変更する' : '設定する') + '</span></button>' +
        '<button type="button" class="btn sm ghost" data-action="lock-cancel">キャンセル</button></div></div>';
    } else if (lockForm === 'remove') {
      body = '<div class="lock-form" id="finalLockForm" data-lock-form="remove">' + pwField('lockCur', '現在のパスワード') +
        '<div class="lock-err" id="finalLockErr" role="alert"></div>' +
        '<div class="actions"><button type="button" class="btn sm danger" data-action="lock-remove-apply" id="finalLockRemoveApply">パスワードを外す</button>' +
        '<button type="button" class="btn sm ghost" data-action="lock-cancel">キャンセル</button></div></div>';
    } else {
      body = '<div class="actions"><button type="button" class="btn sm" data-action="lock-change" id="finalLockChange">' + ico('lock') + '<span>' + (on ? '変更' : '設定する') + '</span></button>' +
        (on ? '<button type="button" class="btn sm danger" data-action="lock-remove" id="finalLockRemove">パスワードを外す</button>' : '') + '</div>';
    }
    return groupH('最終承認のパスワード', { id: 's-finalLock' }) +
      '<p class="hint">最終確認の押印・取消と最終合否（採用／不採用）の決定・取消の前に求めます（' + stepRef(4) + 'の画面と保存した HTML の両方。面接対応者の押印には要りません）。' +
        '誤操作を防ぐための鍵で、HTML をテキストで開いて書き換える人までは防げません。パスワードそのものは保存せず、照合用の値（ハッシュ）だけを設定に持ちます。' +
        '保存した HTML は保存した時点のパスワードで照合します。パスワードがあるとき、「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成・押印欄の表示名を変えて保存するには現在のパスワードが要ります（押印欄の説明・名簿だけなら不要）。</p>' +
      '<div class="lock-status" id="finalLockStatus"><span class="badge' + (on ? ' navy' : '') + '">' + (on ? ico('lock') : '') + (on ? '設定済み' : '未設定') + '</span>' +
        (pending ? '<span class="s-pending">' + ico('alert') + '<span>未保存の変更です。「設定を保存」で確定します。</span></span>' : '') + '</div>' + body;
  }
  function lockFocus() {
    const el = root && root.querySelector('#finalLockForm .lock-pw');
    if (el) el.focus();
  }
  // 「変更する」「設定する」「パスワードを外す」（フォームの確定。Enter も同じ）
  function lockApply(kind, y) {
    const L = global.RecruitLock;
    if (!L || !draft) return;
    const lk = lockOf(draft), on = lockIsOn(lk);
    const v = function (id) { const el = root.querySelector('#' + id); return el ? el.value : ''; };
    const err = function (msg, id) {
      const e = root.querySelector('#finalLockErr');
      if (e) e.textContent = msg;
      const el = root.querySelector('#' + id);
      if (el) { el.focus(); if (el.select) el.select(); }
    };
    if (on && !v('lockCur')) { err('現在のパスワードを入力してください', 'lockCur'); return; }
    if (on && !L.verify(lk, v('lockCur'))) { err('現在のパスワードが違います', 'lockCur'); return; }
    if (!U.isObj(draft.management)) draft.management = {};
    if (kind === 'remove') {
      // 「外した」印（off）。空のロック（{ salt: '', hash: '' }）は未設定＝既定のロック（ローカル版の初期パスワード）に戻る扱い（docs/SPEC-a4.md 11 章 L6c）
      draft.management.finalLock = { salt: '', hash: '', off: true };
    } else {
      if (!v('lockNew')) { err('新しいパスワードを入力してください', 'lockNew'); return; }
      if (v('lockNew') !== v('lockNew2')) { err('新しいパスワード（確認）が一致しません', 'lockNew2'); return; }
      draft.management.finalLock = L.makeLock(v('lockNew'));
    }
    lockForm = '';
    paint(y);
    if (handlers.onToast) handlers.onToast(kind === 'remove' ? '最終承認のパスワードを外しました。「設定を保存」で確定します' : '最終承認のパスワードを' + (on ? '変更' : '設定') + 'しました。「設定を保存」で確定します');
  }
  function onKey(e) {
    const t = e.target;
    if (e.key !== 'Enter' || !t || !t.classList || !t.classList.contains('lock-pw')) return;
    e.preventDefault();
    const f = t.closest('[data-lock-form]');
    if (f) lockApply(f.getAttribute('data-lock-form') === 'remove' ? 'remove' : 'change', window.scrollY);
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
    return groupH('最終合否（採用／不採用のスタンプ）') +
      sCheck('management.decision.enabled', '最終合否のスタンプを使う', '保存ファイル（HTML）と' + stepRef(4) + 'に「採用」「不採用」のボタンを出します。アプリの判定（推奨）とは別の、最終確認者の決定として記録します。') +
      '<div class="s-split s-split-wide">' +
        '<div class="s-split-main">' +
          '<div class="field-row">' + sInput('management.decision.label', '表示名') + sInput('management.decision.hint', '説明（任意）') + '</div>' +
          '<div class="field-row">' + sInput('management.decision.hireLabel', '「採用」の表示名', { repaint: true }) + sInput('management.decision.rejectLabel', '「不採用」の表示名', { repaint: true }) + '</div>' +
        '</div>' +
        '<div class="field s-split-side"><span class="field-label">スタンプのプレビュー</span><div class="stamp-preview verdict-preview">' + preview + '</div>' +
          '<div class="field-hint hint">採用は朱、不採用は藍。日付と劇場名が入ります。</div></div>' +
      '</div>' +
      sSelect('management.decision.stampField', '押印欄と連動', fields.filter(function (fl) { return fl && fl.id; }).map(function (fl) { return { value: fl.id, label: fl.label + '（' + fl.id + '）' }; }).concat([{ value: '', label: '連動しない' }]),
        '合否を押したとき、この押印欄にも同じ担当者の印を押せます。最終承認のパスワードがあるときは、最終確認の欄（final）とこの欄の押印にパスワードが要ります。また、この「押印欄と連動」・最終合否のスタンプの ON/OFF・押印欄の構成（追加・削除）・押印欄の表示名を変えて保存するには、現在のパスワードが要ります。') +
      sCheck('management.decision.autoStampFinal', '合否を押すと、連動する押印欄にも同じ担当者の印を押す（未押印のときだけ）') +
      sCheck('management.decision.filenameSuffix', '合否を付けて保存するとき、ファイル名の末尾に「_採用」「_不採用」を付ける');
  }

  function ioHtml() {
    return section('s-io', 'download', '書き出し／読み込み', '3 操作', esc('他劇場へ展開するときは JSON を書き出して、相手側で読み込みます。'),
      '<div class="actions s-io-actions">' +
        '<button type="button" class="btn" data-action="export">' + ico('download') + '<span>JSON を書き出す</span></button>' +
        '<button type="button" class="btn" data-action="import">' + ico('upload') + '<span>JSON を読み込む</span></button>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn danger" data-action="reset">' + ico('trash') + '<span>初期設定（新宿既定）に戻す</span></button>' +
      '</div>' +
      '<p class="hint">設定はこのブラウザ（端末）内に保存されます。別の端末で使う場合は JSON を書き出して持ち運んでください。v1 形式の JSON は読み込むと既定の設定になります。削除した機能の設定は読み飛ばします。</p>');
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
    if (dt === 'persona') {
      // 人物像の項目: 1 行に「項目名|短い名前|説明」（全角の「｜」も可。説明は残りを | でつなぐ）。空行は捨てる。
      //   id は項目名が同じ既存の項目（下書き・保存済みの設定）のものを引き継ぐ（並べ替え・短い名前の変更では点が消えない。docs/SPEC-persona.md D20）。無ければ新しい id
      const cur = handlers && handlers.current ? U.getPath(handlers.current(), t.dataset.bind) : null;
      const old = [].concat(U.getPath(draft, t.dataset.bind) || [], cur || []).filter(function (o) { return U.isObj(o) && typeof o.id === 'string' && o.id; });
      const used = {};
      return t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (line) {
        const parts = line.split(/[|｜]/).map(function (x) { return x.trim(); });
        const label = parts[0] || '';
        const short = parts[1] || '';
        const hint = parts.slice(2).join('|').trim();
        const hit = old.find(function (o) { return o.label === label && !used[o.id]; });
        let id = hit ? hit.id : '';
        while (!id || used[id]) id = U.uid('ps');
        used[id] = true;
        const o = { id: id, label: label };
        if (short) o.short = short;
        if (hint) o.hint = hint;
        return o;
      });
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

  // 節のメニューの「今の節」: 上の帯（トップバー）の下に来ている最後の節。ページの末尾まで来たら最後の節
  function setNav(cur) {
    navCur = cur;
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.settings-nav a'), function (a) {
      const on = a.getAttribute('href') === '#' + cur;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  function spy() {
    if (!root || root.classList.contains('hidden') || !root.querySelector('.settings-body') || Date.now() < navHoldUntil) return;
    const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--flow-top-h')) || 0) + 32;
    let cur = NAV[0][0];
    NAV.forEach(function (x) { const el = root.querySelector('#' + x[0]); if (el && el.getBoundingClientRect().top <= top) cur = x[0]; });
    const de = document.documentElement;
    if (window.scrollY > 0 && window.innerHeight + window.scrollY >= de.scrollHeight - 2) cur = NAV[NAV.length - 1][0];
    if (cur !== navCur) setNav(cur);
  }
  function bindSpy() {
    if (spyBound) return;
    spyBound = true;
    let raf = 0;
    window.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; spy(); });
    }, { passive: true });
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
    // onSave は保存したかどうか（最終承認のパスワードを確かめるときは Promise）を返す。保存しなかったときは下書きを残し、注意の toast も出さない
    const warn = function (ok) { if (ok !== false && res.warnings.length && handlers.onToast) handlers.onToast('設定を保存しました。注意: ' + res.warnings.join(' / ')); };
    const r = handlers.onSave(U.deepClone(draft));
    if (r && typeof r.then === 'function') r.then(warn); else warn(r);
  }

  function onClick(e) {
    // 節のメニュー（アンカーで節へ移る。押した節をしばらく今の節にする）
    const nav = e.target.closest('.settings-nav a[href^="#"]');
    if (nav) { navHoldUntil = Date.now() + 300; setNav(nav.getAttribute('href').slice(1)); return; }
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
        lockForm = '';
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
      case 'lock-change':
      case 'lock-remove':
        lockForm = act === 'lock-change' ? 'change' : 'remove';
        paint(y);
        lockFocus();
        break;
      case 'lock-cancel':
        lockForm = '';
        paint(y);
        break;
      case 'lock-apply':
        lockApply('change', y);
        break;
      case 'lock-remove-apply':
        lockApply('remove', y);
        break;
      default:
        break;
    }
  }

  function paint(scrollY) {
    repaintPending = false;
    // 面接チェックリストの段階（<details>）の開閉を覚えておく
    if (root) Array.prototype.forEach.call(root.querySelectorAll('details.s-cl-sec[data-sec-id]'), function (d) { clOpen[d.getAttribute('data-sec-id')] = d.open; });
    root.innerHTML = template();
    root.oninput = onEdit;
    root.onchange = onEdit;
    root.onclick = onClick;
    root.onkeydown = onKey;
    if (typeof scrollY === 'number') window.scrollTo(0, scrollY);
  }

  function render(container, profile, h) {
    root = container;
    handlers = h;
    draft = U.deepClone(profile);
    issues = null;
    clOpen = {};
    lockForm = '';
    navCur = NAV[0][0];
    navHoldUntil = 0;
    bindPointer();
    bindSpy();
    paint();
  }

  // 下書きが p と同じ（未保存の変更が無い）か。別のタブで設定が保存されたとき、描き直してよいかの判定に使う（app.js）
  function isDraftOf(p) { return !!draft && JSON.stringify(draft) === JSON.stringify(p); }
  // 別のタブで設定が保存されたとき（未保存の変更が無いとき。app.js）: 最新の設定 p で描き直す（スクロール位置・台本の段階の開閉は残す）。
  //   keepLock なら開いているパスワードの入力欄と入力中の値を残す（最終承認のロックが変わっていないとき。docs/SPEC-a4.md 11 章 L5d）。
  //   入力欄を開いていたのに閉じたら true
  function reload(p, keepLock) {
    if (!root) return false;
    const form = lockForm, vals = {};
    const act = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : '';
    if (form && keepLock) ['lockCur', 'lockNew', 'lockNew2'].forEach(function (id) { const el = root.querySelector('#' + id); if (el) vals[id] = el.value; });
    draft = U.deepClone(p);
    issues = null;
    lockForm = keepLock ? form : '';
    paint(window.scrollY);
    Object.keys(vals).forEach(function (id) { const el = root.querySelector('#' + id); if (el) el.value = vals[id]; });
    const f = act && vals.hasOwnProperty(act) ? root.querySelector('#' + act) : null;
    if (f) f.focus();
    return !!form && !keepLock;
  }
  // 別のタブで設定が保存されたとき（下書きに未保存の変更があるとき。app.js）: 最終承認のロックが変わっていれば（prev → fresh）、下書きのロックを最新に合わせて描き直す。
  //   下書きでロックを変えていた（prev と違う）なら、古いロックで確かめた変更なので取り消す（true を返す）。ロックが変わっていなければ下書きはそのまま。docs/SPEC-a4.md 11 章 L5d
  function lockSig(l) { return lockIsOn(l) ? l.salt + ':' + l.hash : (U.isObj(l) && l.off === true ? 'off' : ''); }
  function syncLock(prev, fresh) {
    if (!draft || !root || lockSig(lockOf(fresh)) === lockSig(lockOf(prev))) return false;
    const touched = lockSig(lockOf(draft)) !== lockSig(lockOf(prev));
    if (!U.isObj(draft.management)) draft.management = {};
    draft.management.finalLock = U.deepClone(lockOf(fresh) || { salt: '', hash: '' });
    lockForm = '';
    paint(window.scrollY);
    return touched;
  }

  global.RecruitSettings = { render: render, isDraftOf: isDraftOf, reload: reload, syncLock: syncLock };
})(window);
