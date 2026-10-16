/*
 * 保存・読込
 * ----------------------------------------------------------------------
 * - 劇場プロファイル: localStorage に保存。JSON ファイルで書き出し／読み込み。
 * - 応募者レコード  : 人が読めるHTMLレポートとして保存し、同じファイルに
 *                    <script type="application/json" id="recruit-record"> で元データを埋め込む。
 *                    読み込み時はこのJSONを取り出すだけなので、見た目を変えても壊れない。
 */
;(function (global) {
  'use strict';

  const U = global.RecruitUtil;
  const PROFILE_KEY = 'recruit.profile.v1';
  const THEME_KEY = 'recruit.theme';
  const RECORD_KIND = 'recruit-applicant-record';

  function defaults() {
    const d = U.deepClone(global.RECRUIT_DEFAULT_PROFILE);
    // 既定のロック（ローカル版の初期パスワード）は「既定のロックからつながっている」印 chain の根（docs/SPEC-a4.md 11 章 L6d）
    const dl = U.isObj(d.management) ? d.management.finalLock : null;
    if (U.isObj(dl) && lockOn(dl)) dl.chain = true;
    return d;
  }

  function isNum(v) { return v !== '' && v != null && typeof v !== 'boolean' && !isNaN(Number(v)); }

  // ---------- 最終合否（profile.management.decision / record.decision。docs/SPEC-report.md 1 章） ----------
  const DECISION_FALLBACK = {
    enabled: true, label: '最終合否', hireLabel: '採用', rejectLabel: '不採用', hireColor: '#c8232c', rejectColor: '#1f4e8c',
    stampField: 'final', autoStampFinal: true, filenameSuffix: true, hint: '最終確認者が合否を決めて押します'
  };
  function decisionDefaults() {
    const mg = (global.RECRUIT_DEFAULT_PROFILE || {}).management || {};
    return U.deepClone(U.isObj(mg.decision) ? mg.decision : DECISION_FALLBACK);
  }
  // management.decision の既知のキーを既定値で補って整える（未知のキーは呼び出し側で残す）。fields = management.fields
  function decisionFields(src, fields, def) {
    src = U.isObj(src) ? src : {};
    def = U.isObj(def) ? def : decisionDefaults();
    const label = function (v, d) { return typeof v === 'string' && v.trim() ? v.trim() : d; };
    const color = function (v, d) { return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d; };
    const ids = (Array.isArray(fields) ? fields : []).filter(function (f) { return U.isObj(f) && f.id; }).map(function (f) { return String(f.id); });
    let sf = typeof src.stampField === 'string' ? src.stampField : def.stampField;
    if (sf && ids.indexOf(sf) < 0) sf = ids.indexOf('final') >= 0 ? 'final' : '';
    return {
      enabled: src.enabled !== false,
      label: label(src.label, def.label),
      hireLabel: label(src.hireLabel, def.hireLabel),
      rejectLabel: label(src.rejectLabel, def.rejectLabel),
      hireColor: color(src.hireColor, def.hireColor),
      rejectColor: color(src.rejectColor, def.rejectColor),
      stampField: sf || '',
      autoStampFinal: src.autoStampFinal !== false,
      filenameSuffix: src.filenameSuffix !== false,
      hint: typeof src.hint === 'string' ? src.hint : def.hint
    };
  }
  // 画面・レポートで使う最終合否の設定（正規化前の profile でも可）。sub = 劇場名から「TOHOシネマズ」を除いたもの
  function decisionConfig(profile) {
    profile = profile || {};
    const mg = U.isObj(profile.management) ? profile.management : {};
    const defMg = (global.RECRUIT_DEFAULT_PROFILE || {}).management || {};
    const fields = Array.isArray(mg.fields) && mg.fields.length ? mg.fields : (defMg.fields || []);
    const out = decisionFields(Object.assign(decisionDefaults(), U.isObj(mg.decision) ? mg.decision : {}), fields);
    out.sub = String(((profile.meta || {}).theaterName) || '').replace(/^TOHOシネマズ\s*/, '').trim();
    return out;
  }
  // record.decision の正規化。不正値・押した人のいない決定は null（docs/SPEC-report.md 1-2）
  function normalizeDecision(d) {
    if (!U.isObj(d) || (d.result !== 'hire' && d.result !== 'reject')) return null;
    if (!U.isObj(d.by)) return null;
    const name = asStr(d.by.name).trim();
    if (!name) return null;
    const short = asStr(d.by.short).trim() || (global.RecruitStamp ? global.RecruitStamp.shortName(name) : name);
    return {
      result: d.result,
      label: typeof d.label === 'string' && d.label.trim() ? d.label.trim() : (d.result === 'hire' ? '採用' : '不採用'),
      date: typeof d.date === 'string' && /^\d{4}\.\d{2}\.\d{2}$/.test(d.date) ? d.date : '',
      at: typeof d.at === 'string' ? d.at : '',
      by: { name: name, short: short, title: asStr(d.by.title).trim() }
    };
  }
  // A4 報告の .cl-decision（RecruitStamp.decisionSheet）に渡す設定
  function decOpts(dcfg, id, svgId) {
    return { id: id, svgId: svgId, title: dcfg.label, hireLabel: dcfg.hireLabel, rejectLabel: dcfg.rejectLabel, hireColor: dcfg.hireColor, rejectColor: dcfg.rejectColor, sub: dcfg.sub, size: 64 };
  }

  // 応募者の管理（押印欄・名簿・手入力・最終合否）。id 'initial' の押印欄は 2026-10-14 に廃止したので外す
  //   （JSON で足した独自の欄は残す。空になったら既定の 2 欄。docs/SPEC-slim.md D4）
  function fillManagement(src, base) {
    const bm = base.management;
    const mg = U.isObj(src) ? src : {};
    let fields = (Array.isArray(mg.fields) ? mg.fields : []).filter(function (x) { return U.isObj(x) && x.id && String(x.id) !== 'initial'; }).map(function (x) {
      return { id: String(x.id), label: String(x.label || x.id), hint: String(x.hint || '') };
    });
    if (!fields.length) fields = U.deepClone(bm.fields);
    const srcManagers = Array.isArray(mg.managers) ? mg.managers : bm.managers;
    const managers = srcManagers.filter(function (x) { return U.isObj(x) && x.name; }).map(function (x) {
      const name = String(x.name).trim();
      const short = String(x.short || '').trim() || (global.RecruitStamp ? global.RecruitStamp.shortName(name) : name);
      const out = { name: name, short: short, title: String(x.title || '').trim() };
      if (x.grade) out.grade = String(x.grade).trim();
      return out;
    });
    // 最終合否（fields 確定後。既知のキーだけ整え、未知のキーは残す）
    const dsrc = U.isObj(mg.decision) ? mg.decision : bm.decision;
    return {
      fields: fields,
      managers: managers,
      allowFreeName: mg.allowFreeName !== false,
      decision: Object.assign({}, U.deepClone(dsrc), decisionFields(dsrc, fields, bm.decision)),
      // 最終承認のパスワード（docs/SPEC-a4.md 11 章 L6b・L6c・L6d）。ロック（salt・hash）か「外した」印（off: true）があればそれ、
      //   キーが無い・空（{ salt: '', hash: '' }）・形が正しくなければ既定（ローカル版ならローカルのロック、公開版はパスワードなし）。
      //   空のロックはロックを持たない版（公開版）も書くので「外した」とは見なさない（同じ file:// の localStorage を公開版と共有しても外れない）。
      //   既定のロックを持つ版（ローカル版）は、chain の無いロック・印（公開版でロックの無い状態から付けたもの）も使わない（L6d）
      finalLock: resolveLock(mg.finalLock, bm.finalLock)
    };
  }
  // management.finalLock の正規化: { salt: 16 進 32 文字, hash: 16 進 64 文字 }（小文字）。形が違えば、off: true（パスワードを外した印）なら
  //   { salt: '', hash: '', off: true }、それ以外は { salt: '', hash: '' }（未設定）。
  //   chain: true（既定のロックから、現在のパスワードを確かめてつながっているロック・印。L6d）はロックと印にだけ残す
  function normalizeLock(l) {
    const salt = U.isObj(l) && typeof l.salt === 'string' ? l.salt.trim().toLowerCase() : '';
    const hash = U.isObj(l) && typeof l.hash === 'string' ? l.hash.trim().toLowerCase() : '';
    const out = /^[0-9a-f]{32}$/.test(salt) && /^[0-9a-f]{64}$/.test(hash) ? { salt: salt, hash: hash }
      : U.isObj(l) && l.off === true ? { salt: '', hash: '', off: true } : null;
    if (!out) return { salt: '', hash: '' };
    if (l.chain === true) out.chain = true;
    return out;
  }
  // ロックも「外した」印も無い（未設定）か
  function lockUnset(l) {
    const n = normalizeLock(l);
    return !lockOn(n) && !n.off;
  }
  // 保存値 l を使わない（既定 def を使う）か: 未設定か、既定のロックを持つ版（ローカル版）で chain の無いロック・印
  //   （ロックを持たない版〔公開版〕で、ロックの無い状態から現在のパスワードを確かめずに付けた・外したもの。docs/SPEC-a4.md 11 章 L6d）
  function lockIgnored(l, def) {
    return lockUnset(l) || (lockOn(normalizeLock(def)) && normalizeLock(l).chain !== true);
  }
  // 保存値 l（使わないなら既定 def）を正規化したロック。既定のロックは chain の根（chain: true）
  function resolveLock(l, def) {
    if (!lockIgnored(l, def)) return normalizeLock(l);
    const d = normalizeLock(def);
    if (lockOn(d)) d.chain = true;
    return d;
  }
  // 最終承認のロックがあるか（RecruitLock.isLocked。lock.js が無い環境でも形で判定する）
  function lockOn(l) {
    const L = global.RecruitLock;
    return L && typeof L.isLocked === 'function' ? L.isLocked(l) : !!(U.isObj(l) && /^[0-9a-f]{64}$/.test(asStr(l.hash)) && /^[0-9a-f]{32}$/.test(asStr(l.salt)));
  }
  // 最終承認のパスワードで守る押印欄（docs/SPEC-a4.md 11 章 L1b）: 既定の最終確認欄 'final' と、そのときの decision.stampField の欄（重複は 1 つ）。
  //   「押印欄と連動」を「連動しない」や別の欄に変えても、最終確認欄の押印・取消にはパスワードが要る（アプリ ③・保存 HTML の lockFields）
  const FINAL_FIELD_ID = 'final';
  function finalLockFields(profile) {
    const sf = decisionConfig(profile).stampField;
    return sf && sf !== FINAL_FIELD_ID ? [FINAL_FIELD_ID, sf] : [FINAL_FIELD_ID];
  }
  // ロックの対象を変える設定（押印欄と連動・最終合否の ON/OFF・押印欄の構成〔id の並び〕と押印欄の表示名）を比べるためのキー。
  //   ロックがあるとき、これが変わる設定の保存・JSON の読み込みには現在のパスワードが要る（app.js）。押印欄の表示名を含めるのは、パスワードの要らない欄
  //   （面接対応者）の表示名を「最終確認」にして、パスワードなしに押した印を最終確認の印に見せられないようにするため（docs/SPEC-a4.md 11 章 L5c）。
  //   押印欄の説明（hint）・最終合否の表示名・名簿は含めない
  function finalLockScope(profile) {
    const mg = U.isObj((profile || {}).management) ? profile.management : {};
    const d = decisionConfig(profile);
    const flds = Array.isArray(mg.fields) ? mg.fields : [];
    return JSON.stringify({ enabled: d.enabled, stampField: d.stampField, fields: flds.map(function (f) { return U.isObj(f) ? asStr(f.id) : ''; }),
      labels: flds.map(function (f) { return U.isObj(f) ? asStr(f.label) : ''; }) });
  }

  // ---------- 面接チェックリスト（docs/SPEC-checklist.md 6-1） ----------
  const CL_ID_RE = /^[A-Za-z][\w-]{0,40}$/;
  function clRules() { return global.RecruitRules || {}; }
  function strOr(v, def) { return typeof v === 'string' ? v : def; }
  function asStr(v) { return v == null ? '' : String(v); }
  function intIn(v, lo, hi) { return isNum(v) && Number(v) % 1 === 0 && Number(v) >= lo && (hi == null || Number(v) <= hi); }
  function clHasSections(def) {
    return U.isObj(def) && Array.isArray(def.sections) && def.sections.some(function (s) { return U.isObj(s); });
  }

  // 台本の正規化（決定的・冪等。未知のキーは残す）。baseDef は既定の台本。
  //   自動表示（auto / autoParams）は 2026-10-14 に削除した（docs/SPEC-slim.md D8）。旧い設定・記録の台本に残っていれば外す
  //   台本の題名・説明文（title / intro）も同日に削除した（表示していた詳細モードのヘッダーごと無くなったため）。残っていれば外す
  function normalizeChecklistDef(def, baseDef) {
    const R = clRules();
    const base = U.isObj(baseDef) ? baseDef : defaults().checklist;
    if (!clHasSections(def)) return U.deepClone(base);
    const out = U.deepClone(def);
    const types = R.CHECKLIST_BLOCK_TYPES || ['must', 'fields', 'explain', 'question', 'rating', 'notify', 'note'];
    const kinds = R.CHECKLIST_FIELD_KINDS || ['text', 'date', 'month', 'choice'];

    delete out.title;
    delete out.intro;
    ['version', 'overallLabel', 'overallHint'].forEach(function (k) { out[k] = strOr(out[k], base[k]); });
    const bo = base.overallOptions || {};
    if (!U.isObj(out.overallOptions)) out.overallOptions = U.deepClone(bo);
    ['hire', 'hold', 'reject'].forEach(function (k) { out.overallOptions[k] = strOr(out.overallOptions[k], bo[k]); });
    out.pages = Array.isArray(out.pages)
      ? out.pages.filter(function (pg) { return U.isObj(pg); }).map(function (pg, i) {
        pg.no = intIn(pg.no, 1) ? Number(pg.no) : i + 1;
        pg.title = asStr(pg.title);
        pg.lead = asStr(pg.lead);
        return pg;
      })
      : U.deepClone(base.pages);
    out.mustFailResult = ['reject', 'review'].indexOf(out.mustFailResult) >= 0 ? out.mustFailResult : base.mustFailResult;
    out.mustUnknownResult = ['none', 'review'].indexOf(out.mustUnknownResult) >= 0 ? out.mustUnknownResult : base.mustUnknownResult;
    const bc = base.overallCaps || {};
    if (!U.isObj(out.overallCaps)) out.overallCaps = U.deepClone(bc);
    ['hold', 'reject'].forEach(function (k) {
      if (['none', 'review', 'reject'].indexOf(out.overallCaps[k]) < 0) out.overallCaps[k] = bc[k];
    });
    if (!U.isObj(out.print)) out.print = U.deepClone(base.print);
    if (typeof out.print.showQuestions !== 'boolean') out.print.showQuestions = base.print.showQuestions;

    // ヘッダー
    const bh = base.header;
    if (!U.isObj(out.header)) out.header = U.deepClone(bh);
    const h = out.header;
    // 消極属性（negatives・morningOnlyEnd）は 2026-10-13 に削除。旧い設定・記録の台本に残っていれば外す（docs/SPEC-script-mode.md 12 章）
    delete h.negatives;
    delete h.morningOnlyEnd;
    if (!U.isObj(h.posting)) h.posting = U.deepClone(bh.posting);
    h.posting.label = strOr(h.posting.label, bh.posting.label);
    const popts = Array.isArray(h.posting.options)
      ? h.posting.options.filter(function (x) { return U.isObj(x) && typeof x.value === 'string' && x.value !== ''; }) : [];
    h.posting.options = popts.length ? popts.map(function (x) { x.label = asStr(x.label); return x; }) : U.deepClone(bh.posting.options);
    h.interviewerField = strOr(h.interviewerField, bh.interviewerField);

    // セクション → ブロック → 項目
    const seen = {};
    const uniq = function (id) {
      let x = id;
      if (seen[x]) { let k = 2; while (seen[id + '_' + k]) k++; x = id + '_' + k; }
      seen[x] = true;
      return x;
    };
    out.sections = out.sections.filter(function (s) { return U.isObj(s); }).map(function (sec, i) {
      sec.id = uniq(typeof sec.id === 'string' && CL_ID_RE.test(sec.id) ? sec.id : 'sec' + (i + 1));
      sec.title = asStr(sec.title);
      sec.lead = asStr(sec.lead);
      sec.minutes = intIn(sec.minutes, 0, 60) ? Number(sec.minutes) : 0;
      sec.minutesMax = sec.minutesMax === true;
      sec.page = intIn(sec.page, 1) ? Number(sec.page) : 1;
      sec.blocks = (Array.isArray(sec.blocks) ? sec.blocks : []).filter(function (b) {
        return U.isObj(b) && types.indexOf(b.type) >= 0;
      }).map(function (b, j) {
        b.id = uniq(typeof b.id === 'string' && CL_ID_RE.test(b.id) ? b.id : sec.id + '_b' + (j + 1));
        b.title = asStr(b.title);
        b.note = asStr(b.note);
        b.memoLabel = asStr(b.memoLabel);
        if (typeof b.memo !== 'boolean') b.memo = b.type === 'question';
        b.items = (Array.isArray(b.items) ? b.items : []).filter(function (it) { return U.isObj(it); }).map(function (it, k) {
          it.id = uniq(typeof it.id === 'string' && CL_ID_RE.test(it.id) ? it.id : b.id + '_' + (k + 1));
          if (it.label === undefined && it.text !== undefined) { it.label = it.text; delete it.text; }
          it.label = asStr(it.label);
          if (it.hint !== undefined) it.hint = asStr(it.hint);
          if (b.type === 'fields') {
            if (kinds.indexOf(it.kind) < 0) it.kind = 'text';
            if (it.options !== undefined) {
              it.options = (Array.isArray(it.options) ? it.options : []).filter(function (o) {
                return U.isObj(o) && o.value != null && String(o.value) !== '';
              }).map(function (o) { return { value: String(o.value), label: asStr(o.label) }; });
            }
            if (it.kind === 'choice') {
              const vs = (it.options || []).map(function (o) { return o.value; });
              const dup = vs.some(function (v, x) { return vs.indexOf(v) !== x; });
              if (vs.length < 2 || dup) it.kind = 'text';
            }
          }
          if (b.type === 'explain') { if (it.shortOnly !== undefined) it.shortOnly = it.shortOnly === true; }
          else delete it.shortOnly;
          // 1 ページの報告書で使う短い名前（任意）。空・文字列以外は外す（無いときは描画時に文言の先頭 14 文字。docs/SPEC-checklist.md 4-2）
          if (typeof it.short === 'string' && it.short.trim()) it.short = it.short.trim();
          else delete it.short;
          delete it.auto;
          delete it.autoParams;
          return it;
        });
        return b;
      });
      return sec;
    });
    if (typeof out.mustFailJumpTo !== 'string' || !out.sections.some(function (s) { return s.id === out.mustFailJumpTo; })) out.mustFailJumpTo = '';
    // 人物像（docs/SPEC-persona.md 1-4・D3）: キーがあるときだけ整える（無ければ足さない＝人物像の導入前に保存した記録の台本は人物像なしのまま）。
    //   プロファイルには fillChecklist の deepMerge で既定の persona が入る
    if ('persona' in out) out.persona = normalizePersonaDef(out.persona, U.isObj(base.persona) ? base.persona : defaults().checklist.persona);
    return out;
  }

  // 人物像の設定の正規化（決定的・冪等）。既知のキーは既定と同じ順に組み立て、未知のキーはその後ろに残す（並びが違うと normalizeProfile の report.stripped が毎回立つ）
  const PERSONA_RESULT_VALUES = ['none', 'review', 'reject'];
  function normalizePersonaDef(src, base) {
    base = U.isObj(base) ? base : {};
    if (!U.isObj(src)) return U.deepClone(base);
    const bl = Array.isArray(base.scaleLabels) ? base.scaleLabels : [];
    const out = {
      enabled: src.enabled !== false,
      title: typeof src.title === 'string' ? src.title : asStr(base.title),
      scaleMax: 5,
      scaleLabels: Array.isArray(src.scaleLabels)
        ? [0, 1, 2, 3, 4].map(function (i) { const v = src.scaleLabels[i]; return typeof v === 'string' && v.trim() ? v.trim() : asStr(bl[i]); })
        : U.deepClone(bl)
    };
    if (Array.isArray(src.items)) {
      const used = {};
      out.items = src.items.filter(function (it) { return U.isObj(it); }).map(function (it, i) {
        let id = typeof it.id === 'string' && CL_ID_RE.test(it.id) && !used[it.id] ? it.id : '';
        if (!id) { const b0 = 'ps_' + (i + 1); id = b0; let k = 2; while (used[id]) id = b0 + '_' + (k++); }
        used[id] = true;
        const o = { id: id, label: asStr(it.label) };
        if (typeof it.short === 'string' && it.short.trim()) o.short = it.short.trim();
        if (typeof it.hint === 'string' && it.hint.trim()) o.hint = it.hint.trim();
        return o;
      });
    } else out.items = U.deepClone(Array.isArray(base.items) ? base.items : []);
    out.keepPct = isNum(src.keepPct) ? Number(src.keepPct) : base.keepPct;
    out.rejectBelowPct = isNum(src.rejectBelowPct) ? Number(src.rejectBelowPct) : base.rejectBelowPct;
    out.onePointResult = PERSONA_RESULT_VALUES.indexOf(src.onePointResult) >= 0 ? src.onePointResult : base.onePointResult;
    out.unscoredResult = PERSONA_RESULT_VALUES.indexOf(src.unscoredResult) >= 0 ? src.unscoredResult : base.unscoredResult;
    Object.keys(src).forEach(function (k) { if (!(k in out)) out[k] = U.deepClone(src[k]); });
    return out;
  }

  // ---- 確認点 rt_manner の移行（docs/SPEC-persona.md 1-6・D17。プロファイルだけ） ----
  //   「最低限の話し方、敬語が可能か」（rt_manner）は人物像の「言葉遣い・説明のわかりやすさ」と重なるため 2026-10-16 に既定の台本から外した。
  //   保存済みの設定の台本（sections）が直前の既定（c0d20ce。rt_manner あり・説明と確認点に short なし）と同じなら、新しい既定の台本に置き換える
  //   （編集した台本はそのまま。記録の台本〔checklistDef〕は移行しない）
  const MANNER_ITEM = { id: 'rt_manner', label: '最低限の話し方、敬語が可能か', hint: '面接全体を通して（台本1枚目の冒頭）' };
  // 説明（explain）・確認点（rating）の項目の short を外した sections の JSON（直前の既定には説明・確認点の short が無かった）
  function scriptSig(sections) {
    const secs = U.deepClone(Array.isArray(sections) ? sections : []);
    secs.forEach(function (sec) {
      (U.isObj(sec) && Array.isArray(sec.blocks) ? sec.blocks : []).forEach(function (b) {
        if (!U.isObj(b) || (b.type !== 'explain' && b.type !== 'rating')) return;
        (Array.isArray(b.items) ? b.items : []).forEach(function (it) { if (U.isObj(it)) delete it.short; });
      });
    });
    return JSON.stringify(secs);
  }
  // 直前の既定の sections = 新しい既定の sections に rt_manner を conditions_rate の 2 番目へ戻したもの（正規化して比べる）
  function isPrevDefaultScript(sections, base) {
    if (!U.isObj(base) || !Array.isArray(base.sections)) return false;
    const prev = U.deepClone(base.sections);
    const rb = ((prev[0] && prev[0].blocks) || []).find(function (b) { return U.isObj(b) && b.id === 'conditions_rate'; });
    if (!rb || !Array.isArray(rb.items) || rb.items.some(function (it) { return U.isObj(it) && it.id === MANNER_ITEM.id; })) return false;
    rb.items.splice(1, 0, U.deepClone(MANNER_ITEM));
    const prevN = normalizeChecklistDef(Object.assign({}, base, { sections: prev }), base).sections;
    return scriptSig(sections) === scriptSig(prevN);
  }

  // 旧プロファイル（checklist なし・壊れた checklist）には既定の台本を補う。report を渡すと rt_manner の移行で report.mannerMoved を立てる
  function fillChecklist(raw, base, report) {
    const rc = raw.checklist;
    if (!U.isObj(rc) || !clHasSections(rc)) return U.deepClone(base.checklist);
    const out = normalizeChecklistDef(U.deepClone(U.deepMerge(base.checklist, rc)), base.checklist);
    if (isPrevDefaultScript(out.sections, base.checklist)) {
      out.sections = U.deepClone(base.checklist.sections);
      if (report) report.mannerMoved = true;
    }
    return out;
  }

  // 保存前チェック（validateProfile から呼ぶ。SPEC-checklist 5-4）
  function validateChecklist(p, errors, warnings) {
    const cl = p.checklist;
    if (!U.isObj(cl)) return;
    const R = clRules();
    const types = R.CHECKLIST_BLOCK_TYPES || [];
    const kinds = R.CHECKLIST_FIELD_KINDS || [];
    const circ = R.circled || function (n) { return '(' + n + ')'; };
    const TYPE_NAMES = { must: '必須条件', fields: '記入欄', explain: '説明', question: '質問', rating: '確認点', notify: '合否連絡', note: '注記' };
    const P0 = '面接チェックリスト';
    const secs = Array.isArray(cl.sections) ? cl.sections.filter(function (s) { return U.isObj(s); }) : [];
    if (!secs.length) errors.push(P0 + 'のセクションがありません。');
    const seen = {};
    const idCheck = function (id, where) {
      if (typeof id !== 'string' || !CL_ID_RE.test(id)) { errors.push(P0 + ' ' + where + 'の id「' + asStr(id) + '」が正しくありません（英字で始まる英数字・_・-）。'); return; }
      if (seen[id]) errors.push(P0 + ' ' + where + 'の id「' + id + '」が重複しています。');
      seen[id] = true;
    };
    let mustN = 0, ratingN = 0;
    secs.forEach(function (sec, i) {
      const sn = circ(i + 1) + ' ' + (asStr(sec.title).trim() || '（名前なし）');
      if (!asStr(sec.title).trim()) errors.push(P0 + 'の' + circ(i + 1) + 'のセクション名が空です。');
      if (!intIn(sec.minutes, 0, 60)) errors.push(P0 + ' ' + sn + 'の目安時間は0〜60分の整数にしてください。');
      if (!intIn(sec.page, 1)) errors.push(P0 + ' ' + sn + 'のページは1以上の整数にしてください。');
      idCheck(sec.id, sn);
      (Array.isArray(sec.blocks) ? sec.blocks : []).forEach(function (b, j) {
        if (!U.isObj(b) || types.indexOf(b.type) < 0) { errors.push(P0 + ' ' + sn + 'の' + (j + 1) + '番目のブロックの種類が正しくありません。'); return; }
        const bn = sn + '【' + (asStr(b.title).trim() || TYPE_NAMES[b.type]) + '】';
        idCheck(b.id, bn);
        (Array.isArray(b.items) ? b.items : []).forEach(function (it, k) {
          if (!U.isObj(it)) { errors.push(P0 + ' ' + bn + 'の' + (k + 1) + '行目が正しくありません。'); return; }
          idCheck(it.id, bn + 'の' + (k + 1) + '行目');
          if (b.type !== 'note' && !asStr(it.label).trim()) errors.push(P0 + ' ' + bn + 'の' + (k + 1) + '行目が空です。');
          if (b.type === 'must') mustN++;
          if (b.type === 'rating') ratingN++;
          if (b.type === 'fields') {
            if (kinds.indexOf(it.kind) < 0) errors.push(P0 + ' ' + bn + 'の' + (k + 1) + '行目の入力の種類が正しくありません。');
            if (it.kind === 'choice') {
              const vs = (Array.isArray(it.options) ? it.options : []).map(function (o) { return U.isObj(o) ? asStr(o.value) : ''; });
              if (vs.filter(function (v) { return v !== ''; }).length < 2) errors.push(P0 + ' ' + bn + 'の「' + asStr(it.label) + '」の選択肢は2件以上にしてください。');
              else if (vs.some(function (v, x) { return vs.indexOf(v) !== x; })) errors.push(P0 + ' ' + bn + 'の「' + asStr(it.label) + '」の選択肢の値が重複しています。');
            }
          }
        });
      });
    });
    if (!asStr(cl.overallLabel).trim()) errors.push(P0 + 'の総合判断の見出しが空です。');
    const oo = U.isObj(cl.overallOptions) ? cl.overallOptions : {};
    ['hire', 'hold', 'reject'].forEach(function (k) {
      if (!asStr(oo[k]).trim()) errors.push(P0 + 'の総合判断の表示名（' + { hire: '採用', hold: '保留', reject: '不採用' }[k] + '）が空です。');
    });
    if (['reject', 'review'].indexOf(cl.mustFailResult) < 0) errors.push(P0 + 'の「必須条件に不一致があるとき」の設定が正しくありません。');
    if (['none', 'review'].indexOf(cl.mustUnknownResult) < 0) errors.push(P0 + 'の「必須条件に未確認が残るとき」の設定が正しくありません。');
    const caps = U.isObj(cl.overallCaps) ? cl.overallCaps : {};
    ['hold', 'reject'].forEach(function (k) {
      if (['none', 'review', 'reject'].indexOf(caps[k]) < 0) errors.push(P0 + 'の総合判断「' + asStr(oo[k] || k) + '」のときの設定が正しくありません。');
    });
    // 人物像（docs/SPEC-persona.md 1-5。使うときだけ。id の形式・重複は JSON の読み込みのときだけ起きる）
    const ps = cl.persona;
    if (U.isObj(ps) && ps.enabled !== false) {
      const PP = P0 + 'の人物像';
      const items = Array.isArray(ps.items) ? ps.items : [];
      if (!items.some(function (it) { return U.isObj(it); })) errors.push(PP + 'の項目がありません（1 つ以上入力するか、「人物像を使う」を外してください）。');
      const psSeen = {};
      items.forEach(function (it, i) {
        const k = i + 1;
        if (!U.isObj(it)) { errors.push(PP + 'の' + k + '行目が正しくありません。'); return; }
        if (!asStr(it.label).trim()) errors.push(PP + 'の' + k + '行目の項目名が空です。');
        if (typeof it.id !== 'string' || !CL_ID_RE.test(it.id)) errors.push(PP + 'の' + k + '行目の id「' + asStr(it.id) + '」が正しくありません（英字で始まる英数字・_・-）。');
        else if (psSeen[it.id]) errors.push(PP + 'の' + k + '行目の id「' + it.id + '」が重複しています。');
        if (typeof it.id === 'string') psSeen[it.id] = true;
      });
      if (!asStr(ps.title).trim()) errors.push(PP + 'の見出しが空です。');
      const r = ps.rejectBelowPct, kp = ps.keepPct;
      if (!(isNum(r) && isNum(kp) && 0 <= Number(r) && Number(r) < Number(kp) && Number(kp) <= 100)) errors.push(PP + 'の得点率の境界（0 ≦ 不採用推奨 ＜ そのまま ≦ 100%）が正しくありません。');
      if (PERSONA_RESULT_VALUES.indexOf(ps.onePointResult) < 0) errors.push(PP + 'の「1 点の項目があるとき」の設定が正しくありません。');
      if (PERSONA_RESULT_VALUES.indexOf(ps.unscoredResult) < 0) errors.push(PP + 'の「未入力の項目があるとき」の設定が正しくありません。');
    }
    const hd = U.isObj(cl.header) ? cl.header : {};
    if (!ratingN) warnings.push('確認点がありません。面接評価は総合判断だけで決まります。');
    if (!mustN) warnings.push('必須条件がないため、不一致による不採用推奨は働きません。');
    const mfields = (((p.management || {}).fields) || []).map(function (f) { return f && f.id; });
    if (hd.interviewerField && mfields.indexOf(hd.interviewerField) < 0) warnings.push('担当と連動する押印欄が見つかりません。');
  }
  // ---------- プロファイルの正規化（docs/SPEC-slim.md 3-1） ----------
  // 許可したキーだけを組み立てる（トップレベルは schemaVersion, meta, features, management, options, evaluation, checklist, texts の 8 個）。
  // 2026-10-14 に削除した機能の設定（REMOVED_KEYS など）は読み飛ばす。
  // report を渡すと次を入れる: v1Reset（v1 は移行せず既定値）・fullModeRemoved（mode: 'full' の設定だった）・stripped（読み飛ばしたキーがあった）・
  //   mannerMoved（直前の既定の台本だったので、確認点 rt_manner を外した新しい既定の台本にした。docs/SPEC-persona.md 1-6）。
  // 冪等: normalizeProfile(normalizeProfile(x)) と normalizeProfile(x) は同じ内容になる。
  const REMOVED_KEYS = ['mode', 'inputStages', 'stageOptions', 'highschoolPolicy', 'params', 'handoffRules', 'contribution', 'matrix'];
  const TEXT_SCRIPT_KEYS = ['recommend', 'review', 'reject', 'missing', 'mustGate', 'adjusted'];
  function normalizeProfile(p, report) {
    const raw = U.isObj(p) ? p : {};
    const base = defaults();
    if (Object.keys(raw).length && (Number(raw.schemaVersion) || 1) < 2) {
      if (report) report.v1Reset = true;
      return base;
    }
    const str = function (v, d) { return typeof v === 'string' ? v : d; };
    const obj = function (v) { return U.isObj(v) ? v : {}; };
    const out = { schemaVersion: 2 };
    // 劇場情報
    const rm = obj(raw.meta);
    out.meta = {};
    ['theaterName', 'appTitle', 'version', 'footer'].forEach(function (k) { out.meta[k] = str(rm[k], base.meta[k]); });
    // 入力項目（卒業予定年月だけ）
    const rf = obj(raw.features);
    out.features = { graduationDate: rf.graduationDate === undefined ? base.features.graduationDate : rf.graduationDate !== false };
    // 応募者の管理（押印）
    out.management = fillManagement(raw.management, base);
    // 区分・性別
    const ro = obj(raw.options);
    const genders = (Array.isArray(ro.genders) ? ro.genders : []).filter(function (g) { return typeof g === 'string' && g.trim(); });
    const cats = (Array.isArray(ro.categories) ? ro.categories : []).filter(function (c) { return U.isObj(c) && typeof c.value === 'string' && c.value.trim(); })
      .map(function (c) { return { value: c.value, group: typeof c.group === 'string' && c.group ? c.group : 'other' }; });
    out.options = { genders: genders.length ? genders : U.deepClone(base.options.genders), categories: cats.length ? cats : U.deepClone(base.options.categories) };
    // 面接評価の帯の境界（範囲の検査は validateProfile）
    const th = obj(obj(raw.evaluation).thresholds), bth = base.evaluation.thresholds;
    out.evaluation = { thresholds: {
      recommendPct: isNum(th.recommendPct) ? Number(th.recommendPct) : bth.recommendPct,
      reviewPct: isNum(th.reviewPct) ? Number(th.reviewPct) : bth.reviewPct
    } };
    // 面接チェックリスト（台本）
    out.checklist = fillChecklist(raw, base, report);
    // 担当と連動する押印欄が無くなった（旧設定の 'initial' など）ときは面接対応者、無ければ連動しない
    const fids = out.management.fields.map(function (f) { return f.id; });
    const hdr = out.checklist.header;
    if (U.isObj(hdr) && hdr.interviewerField && fids.indexOf(hdr.interviewerField) < 0) hdr.interviewerField = fids.indexOf('interviewer') >= 0 ? 'interviewer' : '';
    // 結果の文言
    const rt = obj(raw.texts), bt = base.texts;
    out.texts = {};
    ['recommend', 'review', 'reject'].forEach(function (k) { out.texts[k] = { title: str(obj(rt[k]).title, bt[k].title) }; });
    out.texts.disclaimer = str(rt.disclaimer, bt.disclaimer);
    const rbl = obj(rt.bandLabels);
    out.texts.bandLabels = {};
    ['high', 'mid', 'low'].forEach(function (k) { out.texts.bandLabels[k] = str(rbl[k], bt.bandLabels[k]); });
    const rs = obj(rt.script);
    out.texts.script = {};
    TEXT_SCRIPT_KEYS.forEach(function (k) { out.texts.script[k] = str(rs[k], bt.script[k]); });
    if (report) {
      if (raw.mode === 'full') report.fullModeRemoved = true;
      // 最終承認のロックが未設定（キーが無い・空）・使わない（chain の無いロック。L6d）だけの保存済みの設定は保存し直さない
      //   （既定のロック＝ローカル版のロックを localStorage に固定しない・公開版が付けたロックを開いただけで消さない。docs/SPEC-a4.md 11 章 L6b）
      let cmp = out, rawCmp = raw;
      if (U.isObj(raw.management) && lockIgnored(raw.management.finalLock, base.management.finalLock)) {
        cmp = U.deepClone(out); delete cmp.management.finalLock;
        rawCmp = U.deepClone(raw); delete rawCmp.management.finalLock;
      }
      if (REMOVED_KEYS.some(function (k) { return raw[k] !== undefined; }) || (Object.keys(raw).length && JSON.stringify(cmp) !== JSON.stringify(rawCmp))) report.stripped = true;
    }
    return out;
  }

  // 保存前チェック（DOM 非依存）。errors があれば保存しない。
  function validateProfile(p) {
    const errors = [], warnings = [];
    p = p || {};
    const inRange = function (v, lo, hi) { return isNum(v) && Number(v) >= lo && Number(v) <= hi; };
    const ev = p.evaluation || {}, th = ev.thresholds || {};
    if (!inRange(th.recommendPct, 0, 100) || !inRange(th.reviewPct, 0, 100) || !(Number(th.recommendPct) > Number(th.reviewPct))) {
      errors.push('面接評価の境界（高 > 中、0〜100%）が正しくありません。');
    }
    validateChecklist(p, errors, warnings);
    // 最終合否（docs/SPEC-report.md 1-5）
    const dc = (p.management || {}).decision;
    if (U.isObj(dc) && dc.enabled !== false) {
      const hl = asStr(dc.hireLabel).trim(), rl = asStr(dc.rejectLabel).trim();
      if (!hl || !rl) errors.push('最終合否の「採用」「不採用」の表示名を入力してください。');
      else if (hl === rl) errors.push('最終合否の「採用」と「不採用」の表示名が同じです。');
      const fids = ((p.management || {}).fields || []).map(function (f) { return f && f.id; });
      if (dc.stampField && fids.indexOf(dc.stampField) < 0) warnings.push('最終合否と連動する押印欄が見つかりません。');
    }
    // 最終承認のパスワード（hash があれば salt〔16 進 32 文字〕と 16 進 64 文字の hash。docs/SPEC-a4.md 11 章）
    const lk = (p.management || {}).finalLock;
    if (U.isObj(lk) && asStr(lk.hash) !== '' && (!/^[0-9a-f]{64}$/.test(asStr(lk.hash)) || !/^[0-9a-f]{32}$/.test(asStr(lk.salt)))) {
      errors.push('最終承認のパスワードの設定が壊れています。パスワードを設定し直してください。');
    } else if (lk !== undefined && !U.isObj(lk)) {
      errors.push('最終承認のパスワードの設定が壊れています。パスワードを設定し直してください。');
    }
    return { errors: errors, warnings: warnings };
  }

  function loadProfile(report) {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return defaults();
      return normalizeProfile(JSON.parse(raw), report);
    } catch (e) {
      return defaults();
    }
  }

  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* 保存不可環境 */ }
  }

  function resetProfile() {
    try { localStorage.removeItem(PROFILE_KEY); } catch (e) { /* noop */ }
    return defaults();
  }

  // 劇場情報（meta）があり、台本・押印・旧形式の設定のどれかがある JSON を受け付ける（このアプリで書き出した JSON と旧い JSON の両方）
  function parseProfileJSON(text, report) {
    const obj = JSON.parse(text);
    if (!U.isObj(obj) || !U.isObj(obj.meta) || !(obj.checklist || obj.management || obj.handoffRules)) {
      throw new Error('劇場プロファイルの形式ではありません。');
    }
    return normalizeProfile(obj, report);
  }

  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) || ''; } catch (e) { return ''; }
  }

  function saveTheme(t) {
    try { if (t) localStorage.setItem(THEME_KEY, t); else localStorage.removeItem(THEME_KEY); } catch (e) { /* noop */ }
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // script 要素（type="application/json"）に埋め込む JSON。< > & を \u 形式にして、値に「閉じタグ」や
  // 「コメント開始＋script 開始タグ」が含まれても HTML パーサが要素を閉じ損ねない（script data double escaped 状態に
  // 入らない）ようにする。JSON.parse で元の文字に戻る。
  function jsonForScript(x) {
    return JSON.stringify(x).replace(/[<>&\u2028\u2029]/g, function (c) { return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4); });
  }

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || '応募者';
  }

  // ---------- 応募者レコード（docs/SPEC-slim.md 3-2・3-3） ----------
  // 応募者データは 6 キー（すべて文字列）。旧レコードの他のキー（勤務条件・通勤・繁忙期など）は読み込み時に捨てる
  const APPLICANT_KEYS = ['name', 'gender', 'age', 'category', 'graduationDate', 'reviewerNotes'];
  function pickApplicant(src) {
    src = U.isObj(src) ? src : {};
    const out = {};
    APPLICANT_KEYS.forEach(function (k) { out[k] = src[k] == null ? '' : String(src[k]); });
    return out;
  }

  function buildRecord(state) {
    const R = global.RecruitRules;
    return {
      kind: RECORD_KIND,
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      profile: { theaterName: state.profile.meta.theaterName, version: state.profile.meta.version, schemaVersion: 2 },
      step: state.step,
      applicant: pickApplicant(state.applicant),
      // 面接チェックリストの回答（SPEC-checklist 1-4）と保存時点の台本（レポートの文言・並び用。読込では使わない）
      checklist: U.deepClone(U.isObj(state.checklist) ? state.checklist : R.emptyChecklist()),
      checklistDef: state.profile.checklist ? U.deepClone(state.profile.checklist) : null,
      interviewNotes: state.interviewNotes || '',
      // 応募者の管理（押印）: { interviewer: { name, short, title, date, at }, final: { ... } }
      management: U.deepClone(state.management || {}),
      // 最終合否（人の決定）: { result, label, date, at, by: { name, short, title } } または null。判定とは独立
      decision: normalizeDecision(state.decision),
      // 保存時点の判定（evaluateScript の戻り値。読み込み時は現在の設定で判定し直す）
      judgment: state.judgment ? U.deepClone(state.judgment) : null
    };
  }

  //   info（任意のオブジェクト）を渡すと info.finalLock に保存時の最終承認のロック（#recruit-mgmt-config の finalLock。salt・hash だけ。無ければ null）を入れる
  //   （ロックの無いアプリで読み込んだとき、その記録の最終確認・最終合否を守るため。docs/SPEC-a4.md 11 章 L7b）
  function parseRecordFromHTML(html, info) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const node = doc.querySelector('script#recruit-record[type="application/json"]');
      if (!node) return null;
      const rec = JSON.parse(node.textContent);
      if (!rec || rec.kind !== RECORD_KIND) return null;
      // 最終合否は正規化して返す（キーの無い旧レコード・不正値は null）
      rec.decision = normalizeDecision(rec.decision);
      if (U.isObj(info)) {
        info.finalLock = null;
        const cn = doc.querySelector('script#recruit-mgmt-config[type="application/json"]');
        let cfg = null;
        try { cfg = cn ? JSON.parse(cn.textContent) : null; } catch (e) { cfg = null; }
        const l = normalizeLock(U.isObj(cfg) ? cfg.finalLock : null);
        if (lockOn(l)) info.finalLock = { salt: l.salt, hash: l.hash };
      }
      return rec;
    } catch (e) {
      return null;
    }
  }

  // 読み込んだレコードを今の形に整える（DOM 非依存）。旧い形式の記録も例外なく読む（docs/SPEC-slim.md 3-2）。
  //   legacy: v1（schemaVersion 1）／scores（旧評価の点数あり）／full（mode: 'full' の記録）／initial（廃止した押印欄の印あり）
  //   full の判別は mode === 'full'、または mode が 'script' でなく旧キー handoff がある（今の記録はどちらも書かない。D12）
  function normalizeRecord(rec) {
    rec = U.isObj(rec) ? rec : {};
    const R = global.RecruitRules;
    const mg = {};
    if (U.isObj(rec.management)) {
      Object.keys(rec.management).forEach(function (k) {
        const e = rec.management[k];
        if (k !== 'initial' && U.isObj(e) && e.name) mg[k] = U.deepClone(e);
      });
    }
    const ver = Number(rec.schemaVersion) || 1;
    const scores = U.isObj(rec.scores) ? rec.scores : {};
    const checklist = U.deepMerge(R.emptyChecklist(), U.isObj(rec.checklist) ? U.deepClone(rec.checklist) : {});
    ['header', 'values', 'notes'].forEach(function (k) { if (!U.isObj(checklist[k])) checklist[k] = k === 'header' ? R.emptyChecklist().header : {}; });
    // 人物像の回答（docs/SPEC-persona.md 1-3・D2）: 明示の null は null（人物像を使わない記録）・object はそのまま・キーが無ければ、記録の台本に人物像があるときだけ {}、
    //   無ければ null（v1・詳細モード・人物像の導入前の記録・壊れた値）。deepMerge は無い persona に {} を入れてしまうので元の値で決め直す
    const rp = U.isObj(rec.checklist) ? rec.checklist.persona : undefined;
    const defHasPs = U.isObj(rec.checklistDef) && U.isObj(rec.checklistDef.persona);
    checklist.persona = rp === null ? null : U.isObj(rp) ? U.deepClone(rp) : (rp === undefined && defHasPs ? {} : null);
    // 消極属性（2026-10-13 に削除）は読み飛ばす
    delete checklist.header.negatives;
    const step = Number(rec.step);
    return {
      applicant: pickApplicant(rec.applicant),
      checklist: checklist,
      checklistDef: U.isObj(rec.checklistDef) ? rec.checklistDef : null,
      interviewNotes: typeof rec.interviewNotes === 'string' ? rec.interviewNotes : '',
      management: mg,
      decision: normalizeDecision(rec.decision),
      judgment: U.isObj(rec.judgment) && rec.judgment.result ? rec.judgment : null,
      step: [1, 3, 4].indexOf(step) >= 0 ? step : 1,
      savedAt: rec.savedAt || null,
      theaterName: U.isObj(rec.profile) ? String(rec.profile.theaterName || '') : '',
      legacy: {
        v1: ver < 2,
        scores: ver < 2 || Object.keys(scores).some(function (k) { return isNum(scores[k]); }),
        full: rec.mode === 'full' || (rec.mode !== 'script' && U.isObj(rec.handoff)),
        initial: U.isObj(rec.management) && U.isObj(rec.management.initial) && !!rec.management.initial.name
      }
    };
  }

  // ---------- 保存 HTML のページのスタイル（docs/SPEC-a4.md 2-2）。用紙そのもの（.a4・.cl-sheet）は checklistSheetCss ----------
  //   画面: 灰色の背景に用紙を中央寄せ（上下 24px・影）。狭い画面は --a4-zoom（スクリプトが <html> に置く）で用紙ごと縮小（@media screen だけ。transform:scale）。
  //   印刷: @page の余白 0・背景白・影なしで用紙をそのまま 1 ページに出す（画面と同じ要素・寸法・文字組み。印刷のための切替はしない）。
  //   押せる欄のホバーは outline と position:absolute の ::after だけ（用紙の寸法・文字組みを変えない）。窓（.pop）・保存バー（.savebar）は印刷しない
  function reportCss() {
    return [
      ':root{color-scheme:light}',
      '*{box-sizing:border-box}',
      'html,body{margin:0;padding:0}',
      'body{background:#e6e9ee;color:#111;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP",system-ui,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}',
      'body>.a4{margin:24px auto}',
      '.a4-foot{width:210mm;max-width:calc(100% - 32px);margin:0 auto 24px;font-size:11px;line-height:1.5;color:#5b6675;text-align:center}',
      '@media screen{',
      //   狭い画面の縮小は zoom ではなく transform:scale（描画だけを縮める。レイアウト＝行の高さ・折り返しは計測したときの原寸のまま。docs/SPEC-a4.md 12 章 F7）。
      //   --a4-zoom が無ければ transform は無効（none）。用紙の箱は原寸のまま流れに残るので、余白で縮小後の大きさに合わせる
      //   （上下の余白も縮小に合わせて 24px×倍率、下はさらに縮んだ高さの分を引く。左は縮小後の幅で中央寄せ。スクリプトが動かず縮小しないときは従来の中央寄せと同じ）
      '.a4{transform:scale(var(--a4-zoom));transform-origin:0 0}',
      'body>.a4{margin:calc(24px * var(--a4-zoom,1)) 0 calc(24px * var(--a4-zoom,1) - 297mm * (1 - var(--a4-zoom,1))) max(0px,calc((100% - 210mm * var(--a4-zoom,1)) / 2))}',
      'body.a4-live .a4 [data-a4-t]{cursor:pointer}',
      'body.a4-live .a4 [data-a4-t="stamp"]:hover,body.a4-live .a4 [data-a4-t="decision"]:hover,body.a4-live .a4 [aria-expanded="true"]{outline:2px solid rgba(31,95,191,.4);outline-offset:1px}',
      'body.a4-live .a4 [data-a4-t]:focus-visible{outline:2px solid #1f5fbf;outline-offset:1px}',
      'body.a4-live .a4 [data-a4-t="stamp"]:hover::after{content:"クリックで押印"}',
      'body.a4-live .a4 [data-a4-t="decision"]:hover::after{content:"クリックで合否を押す"}',
      'body.a4-live .a4 [data-a4-t="stamp"]:hover::after,body.a4-live .a4 [data-a4-t="decision"]:hover::after{position:absolute;right:3px;bottom:2px;padding:0 4px;border-radius:3px;background:#1f5fbf;color:#fff;font-size:8px;font-weight:700;line-height:1.5;white-space:nowrap;pointer-events:none}',
      // 最終合否の欄は小さい（未押印で 86×58px）ので、案内は欄の上の辺の外に 1 行で出す（「未押印」・押した日付を隠さない）
      'body.a4-live .a4 [data-a4-t="decision"]:hover::after{right:-1px;bottom:100%;margin-bottom:3px}',
      'body.a4-live .a4 [data-a4-t="memo"]:hover,body.a4-live .a4 [data-a4-t="memos"]:hover{color:#1f4e8c;text-decoration:underline dotted}',
      '}',
      // 窓（ポップオーバー。body の末尾にスクリプトが作る）
      '.pop{position:absolute;z-index:30;width:260px;max-width:calc(100vw - 16px);padding:10px 12px;background:#fff;color:#1a2233;border:1px solid #c9d2dd;border-radius:8px;box-shadow:0 8px 24px rgba(16,24,40,.18);font-size:13px;line-height:1.5}',
      // メモの窓は高さ 60vh まで。本文（.pop-b）だけをスクロールし、見出しと［閉じる］は常に見せる
      '.pop[data-kind="memo"],.pop[data-kind="memos"]{width:380px;max-height:60vh;display:flex;flex-direction:column}',
      '.pop[data-kind="memo"] .pop-b,.pop[data-kind="memos"] .pop-b{flex:1 1 auto;min-height:0;overflow:auto}',
      '.pop-h{font-weight:800;font-size:13.5px}.pop-sub,.pop-ref{font-size:11.5px;color:#5b6675}',
      '.pop-b{display:flex;flex-direction:column;gap:6px;margin:8px 0}',
      '.pop-l{display:flex;flex-direction:column;gap:2px;font-size:11.5px;font-weight:700;color:#5b6675}',
      '.pop select,.pop input{font:inherit;font-size:13px;padding:5px 8px;border:1px solid #c7d0db;border-radius:6px;background:#fff;color:#1a2233;width:100%}',
      '.pop input[hidden]{display:none}',
      '.pop-note{font-size:12px;color:#9a5b00;background:#fdf1dc;border:1px solid #f3cf8a;border-radius:6px;padding:3px 8px}',
      '.pop-err{font-size:12px;font-weight:700;color:#b42318}.pop-err:empty{display:none}',
      // 最終承認のパスワード（ロックがあり、このページでまだ解錠していないとき。docs/SPEC-a4.md 11 章）
      '.pop-lock{font-size:12px;font-weight:700;color:#5b6675}',
      '.pop-text{white-space:pre-wrap;overflow-wrap:anywhere}',
      '.pop-memos{margin:0}.pop-memos dt{font-size:11.5px;font-weight:700;color:#5b6675;margin-top:6px}.pop-memos dt:first-child{margin-top:0}.pop-memos dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.pop-f{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.pop-f button,.savebar-btn{font:inherit;font-size:12.5px;font-weight:700;padding:5px 12px;border-radius:6px;border:1px solid #c7d0db;background:#fff;color:#1a2233;cursor:pointer}',
      '.pop-f button.primary,.savebar-btn{background:#1f5fbf;border-color:#1f5fbf;color:#fff}',
      '.pop-dec{color:var(--dec) !important;border:1.5px solid var(--dec) !important}.pop-hire{--dec:var(--dec-hire,#c8232c)}.pop-reject{--dec:var(--dec-reject,#1f4e8c)}',
      '.pop-dec:hover,.pop-dec.on{background:var(--dec) !important;color:#fff !important}',
      // 保存バー（右下。押印・合否を変えたときだけスクリプトが作る）。出ているあいだは body.a4-sb で下に余白（バーの高さ＋12px。--a4-sbh はスクリプトが置く）を足し、
      //   いちばん下までスクロールすれば用紙と注記がバーに隠れない（画面だけ。印刷の 1 ページに影響させない）。保存後は［×］で閉じられる
      '.savebar{position:fixed;z-index:40;right:12px;bottom:12px;max-width:calc(100vw - 24px);display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border-radius:8px;background:#fdf1dc;border:1px solid #f3cf8a;box-shadow:0 4px 14px rgba(16,24,40,.15);font-size:13px}',
      '.savebar-x{font:inherit;font-size:16px;line-height:1;padding:3px 6px;border:0;border-radius:6px;background:transparent;color:#5b6675;cursor:pointer}.savebar-x:hover{background:rgba(0,0,0,.06)}',
      '@media screen{body.a4-sb{padding-bottom:calc(var(--a4-sbh,49px) + 12px)}}',
      '@page{size:A4 portrait;margin:0}',
      '@media print{',
      'html,body{background:#fff}',
      'body>.a4{margin:0;box-shadow:none}',
      '.a4-foot,.pop,.savebar{display:none !important}',
      // キーボード操作の直後（窓を閉じると欄にフォーカスが戻る）に印刷しても、欄のフォーカス枠を紙に出さない
      '.a4 [data-a4-t],.a4 [data-a4-t]:focus,.a4 [data-a4-t]:focus-visible{outline:none !important}',
      '}'
    ].join('\n');
  }
  // ---------- 面接チェックリスト報告（A4 縦 1 枚の用紙。アプリ ③ の紙・アプリの印刷・保存 HTML で共用。docs/SPEC-a4.md） ----------
  //   DOM 非依存の HTML 文字列を返す。o = { decisionId, decisionSvgId, stampSvgPrefix, refWhere }（台本の全文を出す 'section' は 2026-10-14 に削除。
  //   refWhere は面接メモの案内の「画面で」の言い換え。アプリ ③ の紙だけが '保存した HTML の画面で' を渡す）
  //   1 ページの上限: 用紙の内寸の高さ 281mm（≒ 1062px）から 10px の余裕。押印行を含む .cl-sheet 全体の高さで計る
  const CL_SHEET_LIMIT_PX = 1052;
  // 「面接メモ・所見」の枠の手書き用の罫線（7.5mm 間隔の薄い点線）。内寸の高さ 281mm を超える本数（38 本）を置き、枠の外は切る
  const CL_NM_LINES = new Array(39).join('<i></i>');
  function clFmtDate(v) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asStr(v)); return m ? m[1] + '/' + m[2] + '/' + m[3] : asStr(v); }
  function clFmtMonth(v) { const m = /^(\d{4})-(\d{2})$/.exec(asStr(v)); return m ? m[1] + '年' + Number(m[2]) + '月' : asStr(v); }

  // 1 ページ用の短い名前（質問・合否連絡・記入欄）。short → 既定の台本の short（文言が既定と同じ項目だけ。short の無い旧い設定・記録の台本）→
  //   文言の先頭 14 文字＋「…」（前後の「」は外す）。設定の文言を後から変えても古い short が残らないよう、正規化では補わず描画時に決める
  function clShortFallback(label) {
    const t = asStr(label).trim().replace(/^「/, '').replace(/」$/, '');
    const ch = Array.from(t);
    return ch.length > 14 ? ch.slice(0, 14).join('') + '…' : t;
  }
  function clDefaultItems() {
    const out = {};
    ((defaults().checklist || {}).sections || []).forEach(function (s) {
      ((s && s.blocks) || []).forEach(function (b) { ((b && b.items) || []).forEach(function (it) { if (it && it.id) out[it.id] = it; }); });
    });
    return out;
  }
  function clShortOf(it, baseItems) {
    const s = asStr(it && it.short).trim();
    if (s) return s;
    const b = baseItems && it ? baseItems[it.id] : null;
    if (b && asStr(b.short).trim() && asStr(b.label) === asStr(it.label)) return asStr(b.short).trim();
    return clShortFallback(it && it.label);
  }

  // 1 ページ保証（docs/SPEC-a4.md 4-2・12 章）。.cl-sheet 全体（押印行を含む）の内容の高さ（.cl-measure を付けて用紙いっぱいに伸ばさない状態）で、
  //   まず .cl-roomy（ゆったり。内容が少ないとき）を試し、limit を超えたら通常、さらに超えたら次の順に詰める。
  //   .cl-compact（本文 9px・余白を詰める。質問の回答は 2 行のまま、面接所見は 10 行まで）→
  //   .cl-compact-q1（質問の回答・メモを 1 行、面接所見は 6 行まで）→ .cl-compact-2（質問の回答を省いて案内 1 行、面接所見は 4 行まで）→
  //   縮小（zoom。縮小後の高さを測り直し、上限に収まるまで下げる）。戻り値は付けた段階（'cl-roomy'・''・'cl-compact'…・'zoom'）。
  //   「…」で切れたメモ（.cl-nm-v・.cl-rt-nt）に .cl-cut を付け（保存 HTML ではクリックで全文）、1 つでもあれば .cl-nm-cut で案内 1 行を出す（案内の高さも含めて計る）。
  //   段階を決めたあと（縮小のときを除く）、「…」で切れた面接メモ（.cl-nm-v）が残っていれば、面接メモ・所見の枠の空き（罫線の部分）を使って
  //   行数の上限を広げる（docs/SPEC-a4.md 12 章 F5。面接所見 → ① のメモ → 質問の回答・ブロックのメモ〔用紙の順〕の順に、要素のインラインの
  //   -webkit-line-clamp で。内容の高さが limit を超えない範囲。罫線の空きは 0 行まで使う〔計測中も .cl-grow で .cl-roomy の罫線 38mm を外す〕）。
  //   全部入りきれば .cl-cut・.cl-nm-cut（「…」の案内）も外れる。最初にインラインの行数を外してから測り直すので、書き出したファイルを開き直しても同じ結果。
  //   広げるのは縦のはみ出し（scrollHeight − clientHeight）があるあいだだけ（.cl-cut は横のはみ出し＝折り返せない幅広の書記素でも付くので条件にしない）。
  //   行数を上げても見えない高さが減らなければ戻してやめ、1 要素 200 回まで（固まらない。12 章 F5）。
  //   アプリ ③ の紙（#appPaper）・アプリの印刷（#clSheet）・保存 HTML の用紙（#a4）に使う。祖先に zoom が掛かった状態で呼ばない（高さ・折り返しが変わる）。
  //   計測のあとは用紙いっぱいに伸びる（押印行は用紙の内寸の下端）。印刷のときに計測し直さない（画面と印刷で同じ）。
  //   保存 HTML にソースをそのまま埋め込むため、外部参照なしの ES5 で書く（関数内にコメントを書かない）
  function clFitSheet(sheet, limit) {
    if (!sheet || !sheet.getBoundingClientRect) return '';
    var cls = sheet.classList;
    var lv = ['cl-compact', 'cl-compact-q1', 'cl-compact-2'];
    var i, h, z = 1, n, mode = 'zoom', vs;
    var hOf = function () {
      cls.add('cl-measure');
      var r = sheet.getBoundingClientRect().height;
      cls.remove('cl-measure');
      return r;
    };
    var cut = function () {
      var vs = sheet.querySelectorAll('.cl-nm-v,.cl-rt-nt'), c = false, k, v, on;
      for (k = 0; k < vs.length; k++) {
        v = vs[k];
        on = !!(v.getClientRects().length && (v.scrollHeight > v.clientHeight + 1 || v.scrollWidth > v.clientWidth + 1));
        if (on) c = true;
        if (v.classList) { if (on) v.classList.add('cl-cut'); else v.classList.remove('cl-cut'); }
      }
      if (c) cls.add('cl-nm-cut'); else cls.remove('cl-nm-cut');
    };
    var clampTo = function (v, n) {
      if (n) v.style.setProperty('-webkit-line-clamp', String(n));
      else {
        v.style.removeProperty('-webkit-line-clamp');
        if (v.getAttribute && v.removeAttribute && !v.getAttribute('style')) v.removeAttribute('style');
      }
    };
    var hidOf = function (v) { return v.scrollHeight - v.clientHeight; };
    var grow = function () {
      var qs = ['.cl-nm-iv .cl-nm-v', '.cl-nm-memo .cl-nm-v', '.cl-nm-q .cl-nm-v,.cl-nm-b .cl-nm-v'], list = [], k, j, a, v, cs, n0, m, lh, add, h2, hid, t;
      if (typeof getComputedStyle !== 'function') return;
      for (k = 0; k < qs.length; k++) { a = sheet.querySelectorAll(qs[k]); for (j = 0; j < a.length; j++) list.push(a[j]); }
      cls.add('cl-grow');
      for (k = 0; k < list.length; k++) {
        v = list[k];
        if (!v.style || !v.classList || !v.classList.contains('cl-cut')) continue;
        cs = getComputedStyle(v);
        n0 = m = parseInt(cs.getPropertyValue('-webkit-line-clamp'), 10);
        lh = parseFloat(cs.lineHeight);
        if (!(m > 0) || !(lh > 0)) continue;
        for (t = 0; t < 200; t++) {
          hid = hidOf(v);
          if (!(hid > 1)) break;
          add = Math.max(1, Math.min(Math.ceil(hid / lh), Math.floor((limit - h) / (lh * z))));
          clampTo(v, m + add); cut(); h2 = hOf();
          if (h2 > limit && add > 1) { add = 1; clampTo(v, m + 1); cut(); h2 = hOf(); }
          if (h2 > limit || !(hidOf(v) < hid)) { clampTo(v, m === n0 ? 0 : m); cut(); break; }
          m += add; h = h2;
        }
      }
      cls.remove('cl-grow');
    };
    vs = sheet.querySelectorAll('.cl-nm-v');
    for (i = 0; i < vs.length; i++) { if (vs[i] && vs[i].style && vs[i].style.removeProperty) clampTo(vs[i], 0); }
    for (i = 0; i < lv.length; i++) cls.remove(lv[i]);
    sheet.style.zoom = '';
    cls.add('cl-roomy');
    cut();
    h = hOf();
    if (h && h <= limit) mode = 'cl-roomy';
    else {
      cls.remove('cl-roomy');
      cut();
      h = hOf();
      if (!h || h <= limit) mode = '';
      for (i = 0; i < lv.length && mode === 'zoom'; i++) {
        cls.add(lv[i]);
        cut();
        h = hOf();
        if (h <= limit) mode = lv[i];
      }
    }
    if (mode !== 'zoom') {
      if (h) grow();
      return mode;
    }
    for (n = 0; n < 12 && h > limit && z > 0.3; n++) {
      z = Math.max(0.3, Math.floor(z * limit / h * 1000) / 1000 - (n ? 0.005 : 0));
      sheet.style.zoom = String(z);
      h = hOf();
    }
    if (h && h <= limit) grow();
    return 'zoom';
  }
  function fitChecklistSheet(sheet, limit) {
    return clFitSheet(sheet, typeof limit === 'number' && limit > 0 ? limit : CL_SHEET_LIMIT_PX);
  }

  // ロゴ（brand.js。公開版は空）。base64 の data URL の画像だけを受け付ける（javascript:・http(s)・data:text/html・引用符入りは使わない）。
  //   alt は logoAlt → 劇場名。呼び出し側でエスケープする。用紙の見出し（checklistSheetHtml）とアプリのサイドバー（app.renderBrand）で使う
  const LOGO_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
  function brandLogo(theaterName) {
    const b = global.RecruitBrand || {};
    if (typeof b.logo !== 'string' || !LOGO_RE.test(b.logo)) return null;
    return { src: b.logo, alt: asStr(b.logoAlt).trim() || asStr(theaterName) };
  }

  // 用紙の見出し（白地＋濃紺の下線。左にロゴ・題、右に 台本の版／劇場名／日付）。報告書（面接チェックリスト報告）と面接記入シートで共用。
  //   label = 題（例: 面接チェックリスト報告）、dateText = 右端の日付（例: 作成 2026/10/10・印刷 2026/10/10）
  function clTitleHtml(meta, def, label, dateText) {
    const esc = U.esc;
    meta = meta || {};
    const logo = brandLogo(meta.theaterName);
    const right = [def && def.version ? '台本 ' + def.version + ' 版' : '', asStr(meta.theaterName).trim(), asStr(dateText)].filter(Boolean).join(' ／ ');
    return '<div class="cl-title">' + (logo ? '<img class="cl-title-logo" src="' + logo.src + '" alt="' + esc(logo.alt) + '">' : '') +
      '<span class="cl-title-t">' + esc(label) + '</span><span class="cl-title-r">' + esc(right) + '</span></div>';
  }

  function checklistSheetHtml(record, profile, o) {
    const R = global.RecruitRules;
    o = o || {};
    record = record || {};
    profile = profile || defaults();
    const a = record.applicant || {};
    const cl = U.isObj(record.checklist) ? record.checklist : R.emptyChecklist();
    const def = normalizeChecklistDef(record.checklistDef || profile.checklist, defaults().checklist);
    const prof = Object.assign({}, profile, { checklist: def });
    const sum = R.checklistSummary(a, cl, prof, { management: record.management });
    return clOnePageHtml(record, profile, o, def, sum);
  }

  // ---- A4「面接チェックリスト報告」（1 ページの要約。docs/SPEC-checklist.md 4-2・docs/SPEC-a4.md 1-2） ----
  //   上から: 見出し（白地＋濃紺の下線。左にロゴ・題、右に版／劇場／作成日）→ 応募者（2 行）→ 結果ストリップ（結果・総合判断・必須条件・確認点・人物像・最終合否、調整 1 行）→
  //   必須条件｜勤務条件の確認 → 確認点（6 行）｜人物像（7 行。docs/SPEC-persona.md 4 章）→ 面接メモ・所見の枠（残りの高さいっぱい。記入の下は手書き用の罫線。確認点のメモもここ）→
  //   説明・連絡（1 行）→ 押印行（record.management。用紙の内寸の下端）。人物像を使わない記録・OFF は従来の 4 タイル・確認点の表だけ
  //   色は結果・○△×（必須条件の一致／不一致を含む）・最終合否・ハンコだけ。他はグレースケール
  function clOnePageHtml(record, profile, o, def, sum) {
    const esc = U.esc;
    const a = record.applicant || {};
    const meta = profile.meta || {};
    const texts = profile.texts || {};
    const titleOf = function (r) { return ((texts[r] || {}).title) || r; };
    const baseItems = clDefaultItems();
    const shortOf = function (it) { return clShortOf(it, baseItems); };
    const dash = '<span class="cl-blank">—</span>';
    const val = function (v) { const s = asStr(v).trim(); return s ? esc(s) : dash; };
    const hd = sum.header;
    const m = sum.must;
    const sc = sum.score;
    const cnt = sc.counts || { good: 0, fair: 0, poor: 0, blank: 0 };
    const posting = asStr(hd.posting);

    // ---- 1. 見出し（ロゴは brand.js にあるときだけ） ----
    const created = U.fmtDate(record.savedAt ? new Date(record.savedAt) : new Date());
    const titleHtml = clTitleHtml(meta, def, '面接チェックリスト報告', '作成 ' + clFmtDate(created));

    // ---- 2. 応募者（1 行目: 氏名・区分・年齢・性別・卒業予定／2 行目: 面接日・担当・求人・タクシー。空の値は項目ごと省く） ----
    const kv = [];
    const kvPush = function (k, v) { const s = asStr(v).trim(); if (s) kv.push('<div><dt>' + esc(k) + '</dt><dd>' + esc(s) + '</dd></div>'); };
    kvPush('面接日', hd.date ? clFmtDate(hd.date) : '');
    kvPush('担当', hd.interviewer);
    kvPush(((def.header || {}).posting || {}).label || '応募した求人', hd.postingLabel);
    kvPush('タクシー可否・料金', hd.taxi && hd.taxi.text);
    const who = [a.category, a.age ? a.age + '歳' : '', a.gender].filter(Boolean).join('・');
    const grad = asStr(a.graduationDate).trim() ? clFmtMonth(asStr(a.graduationDate).trim()) : '';
    const headHtml = '<div class="cl-sheet-head">' + titleHtml +
      '<div class="cl-who"><div class="cl-who-1"><span class="cl-sh-name">' + esc(a.name || '応募者') + '<small>さん</small></span>' +
        (who ? '<span class="cl-sh-who">' + esc(who) + '</span>' : '') +
        (grad ? '<span class="cl-sh-grad"><b>卒業予定</b>' + esc(grad) + '</span>' : '') + '</div>' +
        (kv.length ? '<dl class="cl-sh-kv">' + kv.join('') + '</dl>' : '') + '</div></div>';

    // ---- 3. 結果ストリップ（判定を勝手に走らせない。未実施ならその旨） ----
    const j = record.judgment;
    const hasJ = !!(j && j.result);
    const resTone = { recommend: 't-ok', review: 't-warn', reject: 't-danger' };
    const resTile = '<div class="cl-tile cl-tile-res ' + (hasJ ? (resTone[j.result] || '') : 't-none') + '"><span class="cl-tile-k">結果</span>' +
      '<span class="cl-tile-v">' + (hasJ ? esc(j.title || titleOf(j.result)) : '未実施') + '</span>' +
      '<span class="cl-tile-s">' + (hasJ ? esc(j.evaluatedAt ? '判定 ' + U.fmtDateTime(j.evaluatedAt) : '') : '判定前') + '</span></div>';
    const ov = sum.overall;
    const ovTile = '<div class="cl-tile cl-tile-ov"><span class="cl-tile-k">総合判断</span><span class="cl-tile-v">' + (ov.value ? esc(ov.label) : '未入力') + '</span></div>';
    const mustTile = '<div class="cl-tile cl-tile-must' + (m.mismatch ? ' is-ng' : '') + '"><span class="cl-tile-k">必須条件</span><span class="cl-tile-v">' +
      (!m.total ? '—' : m.mismatch ? '不一致 ' + m.mismatch : m.unknown ? '未確認 ' + m.unknown : 'すべて一致') + '</span>' +
      (m.total && m.mismatch && m.unknown ? '<span class="cl-tile-s">未確認 ' + m.unknown + '</span>' : '') + '</div>';
    const scoreTile = '<div class="cl-tile cl-tile-score"><span class="cl-tile-k">確認点</span><span class="cl-tile-v">' + esc(sc.total) + '<small>/' + esc(sc.max) + '点</small></span>' +
      '<span class="cl-tile-s">' + esc('○' + cnt.good + ' △' + cnt.fair + ' ×' + cnt.poor + (cnt.blank ? ' 未入力' + cnt.blank : '')) + '</span></div>';
    // 人物像（docs/SPEC-persona.md 4-1。人物像を使わない記録・OFF は出さない＝従来の 4 タイル）。名前は見出しの末尾の「（…）」を外したもの。1 点の項目があれば値が赤（is-ng）
    const ps = sum.persona;
    const psName = ps ? (asStr(ps.title).replace(/\s*[（(][^（）()]*[）)]\s*$/, '').trim() || '人物像') : '';
    const psOnes = ps && ps.ones.length ? '・1点あり' : '';
    const psTile = ps ? '<div class="cl-tile cl-tile-ps' + (psOnes ? ' is-ng' : '') + '"><span class="cl-tile-k">' + esc(psName) + '</span><span class="cl-tile-v">' +
      (ps.scored ? esc(ps.total) + '<small>/' + esc(ps.max) + '点</small>' : '未入力') + '</span>' +
      (ps.scored ? '<span class="cl-tile-s">' + esc((ps.complete ? ps.pct + '%' : '未入力 ' + ps.unscored) + psOnes) + '</span>' : '') + '</div>' : '';
    // 最終合否（有効時のみ）。ストリップの右端（docs/SPEC-report.md 4-7）
    let decHtml = '';
    if (global.RecruitStamp) {
      const dcfg = decisionConfig(profile);
      if (dcfg.enabled) decHtml = global.RecruitStamp.decisionSheet(normalizeDecision(record.decision), decOpts(dcfg, o.decisionId || 'clDecision', o.decisionSvgId || 'vdSheet'));
    }
    // 調整（ストリップの下に 1 件 1 行）。必須条件の不一致は「必須条件の不一致により「…」に固定」と書く（docs/SPEC-script-mode.md 11-4 F6）
    const adjHtml = hasJ && (j.adjustments || []).length ? '<ul class="cl-adj">' + j.adjustments.map(function (x) {
      const head = x.code === 'must_conditions' ? '必須条件の不一致により「' + esc(titleOf(x.to)) + '」に固定'
        : x.from === x.to ? esc(titleOf(x.to)) + '（固定）' : esc(titleOf(x.from)) + ' → ' + esc(titleOf(x.to));
      return '<li><b>' + head + '</b>：' + esc(x.reason) + '</li>';
    }).join('') + '</ul>' : '';
    // ストリップの地色は結果に合わせる（data-result。class は従来どおり "cl-judge"）
    const judgeHtml = '<div class="cl-judge' + (hasJ ? '"' + ' data-result="' + esc(j.result) + '"' : ' cl-judge-none"') + '><div class="cl-judge-row"><div class="cl-judge-main">' +
      '<div class="cl-tiles' + (ps ? ' has-ps' : '') + '">' + resTile + ovTile + mustTile + scoreTile + psTile + '</div></div>' + decHtml + '</div>' + adjHtml + '</div>';

    // ---- 4. 必須条件（＋必須条件の直後の記入欄）｜勤務条件の確認（ほかの記入欄） ----
    const mustBlocks = [], leftFields = [], rightFields = [];
    sum.sections.forEach(function (s) {
      let afterMust = false;
      s.blocks.forEach(function (b) {
        if (b.type === 'must') { mustBlocks.push(b); afterMust = true; return; }
        if (b.type === 'fields') { (afterMust ? leftFields : rightFields).push(b); }
        afterMust = false;
      });
    });
    const fieldVal = function (it) {
      let v = it.effectiveLabel != null ? it.effectiveLabel : asStr(it.effective);
      if (it.kind === 'date') v = clFmtDate(v);
      else if (it.kind === 'month') v = clFmtMonth(v);
      return val(v);
    };
    const kvRows = function (blocks) {
      const rows = [];
      blocks.forEach(function (b) { b.items.forEach(function (it) { rows.push('<div data-cl-item="' + esc(it.id) + '"><dt>' + esc(shortOf(it)) + '</dt><dd>' + fieldVal(it) + '</dd></div>'); }); });
      return rows.length ? '<dl class="cl-kv">' + rows.join('') + '</dl>' : '';
    };
    const MUST_CLS = { match: 'm-match', mismatch: 'm-mismatch' };
    const mustRows = [];
    mustBlocks.forEach(function (b) {
      b.items.forEach(function (it) {
        mustRows.push('<tr class="' + (MUST_CLS[it.value] || 'm-unknown') + '" data-cl-item="' + esc(it.id) + '"><td class="cl-mm-c"><span class="cl-mm">' + esc(it.mark + it.valueLabel) + '</span></td>' +
          '<td class="cl-mm-l">' + esc(it.label) + '</td></tr>');
      });
    });
    const leftHtml = mustRows.length || leftFields.length
      ? '<section class="cl-blk cl-blk-must' + (m.mismatch ? ' cl-must-ng' : '') + '"><h3 class="cl-h">必須条件</h3>' +
        (mustRows.length ? '<table class="cl-mtab"><tbody>' + mustRows.join('') + '</tbody></table>' : '') + kvRows(leftFields) + '</section>'
      : '';
    const rightHtml = rightFields.length ? '<section class="cl-blk cl-blk-terms"><h3 class="cl-h">勤務条件の確認</h3>' + kvRows(rightFields) + '</section>' : '';
    const colsHtml = leftHtml && rightHtml ? '<div class="cl-cols">' + leftHtml + rightHtml + '</div>' : leftHtml + rightHtml;

    // ---- 5. 確認点（全項目。未入力の行も出す＝何を見なかったか分かる）｜人物像（1〜5 点。docs/SPEC-persona.md 4-2） ----
    //   確認点のメモは表に載せず、面接メモ・所見の枠の 1 行「確認点のメモ」に（6 の memoRows）。人物像があれば 2 カラム（50:50）、無ければ確認点の表だけ（全幅）
    const MARK_CLS = { good: 'm-good', fair: 'm-fair', poor: 'm-poor' };
    const rateOnly = sum.ratings.length
      ? '<section class="cl-blk cl-blk-rate"><h3 class="cl-h">確認点<small>○ できている　△ やや不安　× できていない</small></h3>' +
        '<table class="cl-rt"><colgroup><col class="c-no"><col class="c-lbl"><col class="c-mk"></colgroup><tbody>' +
        sum.ratings.map(function (it) {
          return '<tr data-cl-item="' + esc(it.id) + '"><td class="cl-rt-no">' + esc(it.noMark) + '</td><td class="cl-rt-lbl">' + esc(it.label) + '</td>' +
            '<td class="cl-rt-mk"><span class="cl-mark ' + (MARK_CLS[it.value] || 'm-none') + '">' + (it.value ? esc(it.mark) : '—') + '</span></td></tr>';
        }).join('') + '</tbody></table></section>'
      : '';
    //   人物像: 項目名（1 行。はみ出しは「…」）・5 段の目盛り（点まで塗る）・点。未入力の行は目盛りが空で「—」。見出しに 1・3・5 の目安と合計
    const psLbl = ps ? ps.scaleLabels : [];
    const psSum = !ps ? '' : !ps.scored ? '未入力' : ps.total + '/' + ps.max + '点・' + (ps.complete ? ps.pct + '%' : '未入力 ' + ps.unscored);
    const personaHtml = ps
      ? '<section class="cl-blk cl-blk-persona"><h3 class="cl-h">' + esc(ps.title) + '<small>' + esc('1 ' + psLbl[0] + '　3 ' + psLbl[2] + '　5 ' + psLbl[4]) + '</small><span class="cl-ps-sum">' + esc(psSum) + '</span></h3>' +
        '<table class="cl-ps"><colgroup><col class="c-no"><col class="c-lbl"><col class="c-sc"><col class="c-v"></colgroup><tbody>' +
        ps.items.map(function (it, i) {
          const n = it.score || 0;
          let bar = '';
          for (let k = 1; k <= ps.scaleMax; k++) bar += k <= n ? '<i class="on"></i>' : '<i></i>';
          return '<tr data-ps-item="' + esc(it.id) + '" class="s-' + n + '"><td class="cl-ps-no">' + (i + 1) + '</td><td class="cl-ps-lbl">' + esc(it.label) + '</td>' +
            '<td class="cl-ps-sc"><span class="cl-ps-bar" aria-hidden="true">' + bar + '</span></td><td class="cl-ps-v">' + (n ? n : dash) + '</td></tr>';
        }).join('') + '</tbody></table></section>'
      : '';
    const rateHtml = rateOnly && personaHtml ? '<div class="cl-cols cl-cols-eval">' + rateOnly + personaHtml + '</div>' : rateOnly + personaHtml;

    // ---- 6. 面接メモ・所見の枠（記入があるものを上から。質問の回答は「短い名前：回答」2 行まで・面接所見・Step① のメモ。記入が無くても空の枠と罫線） ----
    //   質問の回答の名前は 1 問目の短い名前＋「ほか n 問」（回答はブロックに 1 つ。3 問の名前を並べると 2 行になり名前が回答より目立つため）
    const memoRows = [];
    let qRows = 0;
    sum.sections.forEach(function (s) {
      s.blocks.forEach(function (b) {
        const t = asStr(b.memoText).trim();
        if (!b.memo || !t) return;
        const isQ = b.type === 'question' && b.items.length;
        const k = isQ ? shortOf(b.items[0]) + (b.items.length > 1 ? ' ほか' + (b.items.length - 1) + '問' : '') : (b.memoLabel || b.title || 'メモ');
        if (isQ) qRows++;
        memoRows.push('<div class="cl-nm-row ' + (isQ ? 'cl-nm-q' : 'cl-nm-b') + '" data-cl-block="' + esc(b.id) + '"><div class="cl-nm-k"><span class="cl-nm-no">' + esc(s.noMark) + '</span>' + esc(k) + '</div>' +
          '<div class="cl-nm-v">' + esc(t) + '</div></div>');
      });
    });
    // 確認点のメモ（docs/SPEC-persona.md 4-3）: 1 行に「①具体性：…／④チーム行動：…」。行数は .cl-nm-b（ブロックのメモ）と同じ（切れたら .cl-cut・広げる順も同じ）
    const rtNotes = sum.ratings.filter(function (it) { return asStr(it.note).trim(); });
    if (rtNotes.length) {
      memoRows.push('<div class="cl-nm-row cl-nm-b cl-nm-rt"><div class="cl-nm-k">確認点のメモ</div><div class="cl-nm-v">' + rtNotes.map(function (it) {
        return '<span class="cl-nm-rt-i" data-cl-item="' + esc(it.id) + '"><b>' + esc(it.noMark + shortOf(it)) + '</b>：' + esc(asStr(it.note).trim()) + '</span>';
      }).join('<span class="cl-nm-rt-sep">／</span>') + '</div></div>');
    }
    const ivNotes = asStr(record.interviewNotes).trim();
    if (ivNotes) memoRows.push('<div class="cl-nm-row cl-nm-iv"><div class="cl-nm-k">面接所見</div><div class="cl-nm-v">' + esc(ivNotes) + '</div></div>');
    // ① 応募者のメモ（入力欄「メモ（任意）」）
    const rvNotes = asStr(a.reviewerNotes).trim();
    if (rvNotes) memoRows.push('<div class="cl-nm-row cl-nm-memo"><div class="cl-nm-k">メモ</div><div class="cl-nm-v">' + esc(rvNotes) + '</div></div>');
    // 案内 1 行: 「…」で切れたメモがあるとき（.cl-nm-cut）／質問の回答を省いたとき（.cl-compact-2）だけ表示（clFitSheet が付ける）。
    //   保存 HTML の画面では、切れたメモ・この行をクリックすると全文の窓が出る（docs/SPEC-a4.md 3-7）。印刷物（保存 HTML・アプリの印刷）は「画面で」。
    //   アプリ ③ の紙はクリックしても窓を出さないので、o.refWhere（'保存した HTML の画面で'）で言い換える
    const refWhere = asStr(o.refWhere) || '画面で';
    //   「面接メモ・所見」の枠（docs/SPEC-a4.md 12 章）: 常に出し、用紙の残りの高さいっぱいに広げる（押印行は用紙の下端）。
    //   記入があれば上から並べ、その下（記入が無ければ枠全体）は手書き用の薄い点線の罫線（.cl-nm-lines。7.5mm 間隔。高さの計測には入らない）
    const notesHtml = '<section class="cl-blk cl-blk-notes"><h3 class="cl-h">面接メモ・所見</h3><div class="cl-nm-box' + (memoRows.length ? '' : ' is-empty') + '">' +
      (memoRows.length
        ? '<div class="cl-nm">' + memoRows.join('') + '</div>' +
          '<p class="cl-nm-ref' + (qRows ? ' has-q' : '') + '"><span class="cl-nm-ref-c">「…」で切れたメモは、' + esc(refWhere) + 'クリックすると全文を表示します</span>' +
          (qRows ? '<span class="cl-nm-ref-q">質問の回答は省略（' + esc(refWhere) + 'この行をクリックすると、回答と「…」で切れたメモの全文を表示します）</span>' : '') + '</p>'
        : '') +
      '<div class="cl-nm-lines" aria-hidden="true">' + CL_NM_LINES + '</div></div></section>';

    // ---- 7. 説明・連絡（説明のチェック数。※短期求人のみ の項目は求人が短期のときだけ数える） ----
    const exParts = [], ntParts = [];
    sum.sections.forEach(function (s) {
      let n = 0, d = 0;
      s.blocks.forEach(function (b) {
        if (b.type === 'explain') {
          b.items.forEach(function (it) { if (it.shortOnly && posting !== 'short') return; d++; if (it.value) n++; });
        } else if (b.type === 'notify') {
          b.items.forEach(function (it) { ntParts.push('<span class="cl-ex-i' + (it.value ? '' : ' is-off') + '">' + esc(shortOf(it)) + ' ' + (it.value ? '☑' : '☐') + '</span>'); });
        }
      });
      if (d) exParts.push('<span class="cl-ex-i' + (n < d ? ' is-off' : '') + '">' + esc(s.noMark) + ' ' + n + '/' + d + '</span>');
    });
    const exHtml = exParts.length || ntParts.length
      ? '<div class="cl-exline">' +
        (exParts.length ? '<span class="cl-ex-k">説明済み</span>' + exParts.join('<span class="cl-ex-sep">・</span>') : '') +
        (exParts.length && ntParts.length ? '<span class="cl-ex-bar">｜</span>' : '') +
        (ntParts.length ? '<span class="cl-ex-k">合否連絡</span>' + ntParts.join('<span class="cl-ex-sep">／</span>') : '') + '</div>'
      : '';

    // ---- 8. 押印行（用紙の最下段。record.management と押印欄の設定から描く。2 件なら 2 列。ハンコの SVG の id は o.stampSvgPrefix＋番号） ----
    const mgFields = (U.isObj(profile.management) && Array.isArray(profile.management.fields) ? profile.management.fields : []).filter(function (f) { return U.isObj(f) && f.id; });
    const mgmt = U.isObj(record.management) ? record.management : {};
    const Stamp = global.RecruitStamp;
    const prefix = o.stampSvgPrefix || 'cl';
    const stampsHtml = mgFields.length
      ? '<div class="cl-stamps"><div class="stamp-row cl-stamps-row' + (mgFields.length === 2 ? ' cols-2' : '') + '">' + mgFields.map(function (fld, idx) {
        const e = U.isObj(mgmt[fld.id]) && mgmt[fld.id].name ? mgmt[fld.id] : null;
        return '<div class="stamp-box" data-field-id="' + esc(fld.id) + '"><div class="stamp-label">' + esc(fld.label) + '</div>' +
          '<div class="stamp-area">' + (e && Stamp ? Stamp.render(e, { size: 46, id: prefix + idx }) : '<div class="stamp-empty">未押印</div>') + '</div>' +
          '<div class="stamp-meta">' + (e ? esc(e.name + (e.title ? '（' + e.title + '）' : '') + '　' + (e.date || '')) : '') + '</div></div>';
      }).join('') + '</div></div>'
      : '';
    return '<div class="cl-sheet cl-mode-sheet">' + headHtml + judgeHtml + colsHtml + rateHtml + notesHtml + exHtml + stampsHtml + '</div>';
  }

  // 用紙と報告書のスタイル（.a4 の箱・.cl-sheet 以下）。アプリは起動時に 1 回 <style> に入れ、保存 HTML は reportCss の後ろに足す（docs/SPEC-a4.md 2-1）。
  //   色はライト固定（アプリのダークテーマでも用紙は白地）。寸法は画面と印刷で同じ（画面で計測した高さがそのまま印刷に使える）。
  //   用紙の中に画面幅で変わる規則（@media (max-width…)）を置かない（画面と印刷で文字組みが変わり計測がずれる）
  function checklistSheetCss() {
    return [
      // A4 縦の用紙（210×297mm・内側の余白 上下 8mm／左右 10mm＝内寸 190×281mm）。はみ出しは切る（用紙が伸びて 2 ページにならない）
      '.a4{display:block;box-sizing:border-box;width:210mm;height:297mm;padding:8mm 10mm;margin:0 auto;background:#fff;color:#111;color-scheme:light;overflow:hidden;' +
        'box-shadow:0 1px 3px rgba(16,24,40,.12),0 12px 32px rgba(16,24,40,.16)}',
      '.cl-sheet{color:#1a2233;font-size:13px;line-height:1.5}',
      '.cl-sheet *{box-sizing:border-box}',
      '.cl-sheet .cl-blank{color:#8a94a3}',
      // ---- sheet（A4 報告・1 ページの要約）。本文 9.5px・ラベル 8.5px・見出し 10.5px。画面でも同じ寸法にして計測する ----
      //   用紙を埋める（docs/SPEC-a4.md 12 章）: シートは縦の flex で用紙の内寸の高さ（.a4 の 100%）まで伸ばし、「面接メモ・所見」の枠が残りの高さを取る
      //   ＝押印行は用紙の内寸の下端。高さの計測（clFitSheet）は .cl-measure（min-height:0・max-height:none）で内容そのものの高さを測る。
      //   シートは用紙の内寸より高くならない（max-height:100%）: 狭い画面の --a4-zoom で行の高さが丸められて内容が数 % 伸びても、面接メモ・所見の枠
      //   （.cl-blk-notes・.cl-nm-box・.cl-nm が min-height:0。.cl-nm は overflow:hidden）が縮んで吸収し、押印行は用紙の内寸の下端のまま（F5 で罫線の空きを使い切ったときのため）
      '.cl-sheet.cl-mode-sheet{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP",system-ui,sans-serif;font-size:9.5px;line-height:1.4;background:#fff;color:#111;' +
        'display:flex;flex-direction:column;min-height:100%;max-height:100%}',
      '.cl-sheet.cl-mode-sheet.cl-measure{min-height:0 !important;max-height:none !important}',
      '.cl-mode-sheet .cl-blank{color:#8a94a3;font-weight:400}',
      // 1. 見出し（白地＋濃紺 2px の下線。左にロゴ・題、右に版／劇場／作成日）
      '.cl-mode-sheet .cl-title{display:flex;align-items:center;gap:8px;min-height:7mm;padding:0 1px 3px;border-bottom:2px solid #24324a}',
      '.cl-mode-sheet .cl-title-logo{flex:none;display:block;height:7mm;width:auto;max-width:50mm;object-fit:contain}',
      '.cl-mode-sheet .cl-title-t{flex:none;font-size:13px;font-weight:800;letter-spacing:.04em;line-height:1.3;color:#1a2233}',
      '.cl-mode-sheet .cl-title-r{margin-left:auto;min-width:0;font-size:8.5px;color:#3a4556;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      // 2. 応募者（2 行）
      '.cl-mode-sheet .cl-who{padding:6px 2px 6px;border-bottom:1px solid #d5dbe3}',
      '.cl-mode-sheet .cl-who-1{display:flex;align-items:baseline;gap:4px 12px;flex-wrap:wrap;min-width:0}',
      '.cl-mode-sheet .cl-sh-name{font-size:16px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}.cl-mode-sheet .cl-sh-name small{font-size:10px;font-weight:600;margin-left:2px}',
      '.cl-mode-sheet .cl-sh-who,.cl-mode-sheet .cl-sh-grad{font-size:9.5px;font-weight:600;color:#3a4556}.cl-mode-sheet .cl-sh-grad b{font-size:8.5px;font-weight:600;color:#5b6675;margin-right:4px}',
      '.cl-mode-sheet dl.cl-sh-kv{display:flex;flex-wrap:wrap;gap:1px 16px;margin:3px 0 0}',
      '.cl-mode-sheet dl.cl-sh-kv>div{display:flex;gap:5px;align-items:baseline;min-width:0;max-width:100%}',
      '.cl-mode-sheet dl.cl-sh-kv dt{flex:none;font-size:8.5px;font-weight:600;color:#5b6675}',
      '.cl-mode-sheet dl.cl-sh-kv dd{margin:0;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      // 3. 結果ストリップ（結果・総合判断・必須条件・確認点＋最終合否。調整は 1 行ずつ）
      '.cl-mode-sheet .cl-judge{margin:8px 0 0;padding:6px;border:1px solid #d5dbe3;border-radius:5px;background:#f3f5f8;break-inside:avoid}',
      '.cl-mode-sheet .cl-judge[data-result="recommend"]{background:#eef8f3;border-color:#bfe3d2}.cl-mode-sheet .cl-judge[data-result="review"]{background:#fdf6e9;border-color:#efd5a4}.cl-mode-sheet .cl-judge[data-result="reject"]{background:#fdf1f1;border-color:#efc2c2}',
      '.cl-mode-sheet .cl-judge-row{display:flex;gap:6px;align-items:stretch;min-height:58px}',
      '.cl-mode-sheet .cl-judge-main{flex:1 1 auto;min-width:0;display:flex}',
      '.cl-mode-sheet .cl-tiles{flex:1 1 auto;min-width:0;display:grid;grid-template-columns:minmax(0,1.5fr) repeat(3,minmax(0,1fr));gap:6px}',
      '.cl-mode-sheet .cl-tile{display:flex;flex-direction:column;justify-content:center;gap:1px;min-width:0;padding:3px 8px;background:#fff;border:1px solid #d5dbe3;border-radius:4px}',
      '.cl-mode-sheet .cl-tile-k{font-size:8.5px;font-weight:700;color:#5b6675;line-height:1.2}',
      '.cl-mode-sheet .cl-tile-v{font-size:11px;font-weight:800;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cl-mode-sheet .cl-tile-v small{font-size:8.5px;font-weight:600;color:#5b6675;margin-left:1px}',
      '.cl-mode-sheet .cl-tile-s{font-size:8.5px;color:#3a4556;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cl-mode-sheet .cl-tile.is-ng .cl-tile-v{color:#b42318}',
      //   人物像のタイルがあるとき（.has-ps）は 5 枚（docs/SPEC-persona.md 4-1。4 枚の規則は人物像を使わない記録用に残す）
      '.cl-mode-sheet .cl-tiles.has-ps{grid-template-columns:minmax(0,1.5fr) repeat(4,minmax(0,1fr))}',
      '.cl-mode-sheet .cl-tile-res{border-width:2px;padding:3px 10px}.cl-mode-sheet .cl-tile-res .cl-tile-v{font-size:14px;line-height:1.3}',
      '.cl-mode-sheet .cl-tile-res.t-ok{border-color:#0b7a55}.cl-mode-sheet .cl-tile-res.t-ok .cl-tile-v{color:#0b7a55}',
      '.cl-mode-sheet .cl-tile-res.t-warn{border-color:#c98a1b}.cl-mode-sheet .cl-tile-res.t-warn .cl-tile-v{color:#9a5b00}',
      '.cl-mode-sheet .cl-tile-res.t-danger{border-color:#b42318}.cl-mode-sheet .cl-tile-res.t-danger .cl-tile-v{color:#b42318}',
      '.cl-mode-sheet .cl-tile-res.t-none{border-color:#b8c2cf;border-style:dashed}.cl-mode-sheet .cl-tile-res.t-none .cl-tile-v{color:#5b6675}',
      '.cl-mode-sheet .cl-adj{list-style:none;margin:5px 2px 0;padding:0;font-size:9px;color:#3a4556}',
      '.cl-mode-sheet .cl-adj li{overflow-wrap:anywhere}.cl-mode-sheet .cl-adj li::before{content:"※ "}.cl-mode-sheet .cl-adj li b{color:#111}',
      // 最終合否（ストリップの右端）
      //   幅は結果ストリップの 36% まで（担当者名が改行できない長い文字列でも、左の 5 枚のタイルを潰さない。担当者・日付は「…」で切る。docs/SPEC-persona.md D10）
      '.cl-mode-sheet .cl-decision{flex:0 0 auto;min-width:0;max-width:36%;display:flex;align-items:center;gap:6px;padding:3px 8px;border:1px solid #d5dbe3;border-radius:4px;background:#fff}',
      '.cl-mode-sheet .cl-dec-stamp{flex:none;display:grid;place-items:center}.cl-mode-sheet .cl-dec-stamp .verdict-stamp{width:64px;height:41px;mix-blend-mode:multiply;filter:none}',
      '.cl-mode-sheet .cl-dec-meta{display:flex;flex-direction:column;min-width:0;line-height:1.3}',
      '.cl-mode-sheet .cl-dec-kv{display:flex;align-items:baseline;gap:4px}.cl-mode-sheet .cl-dec-k{font-size:8.5px;font-weight:700;color:#5b6675}.cl-mode-sheet .cl-dec-v{font-size:12px;font-weight:800}',
      '.cl-mode-sheet .cl-dec-by,.cl-mode-sheet .cl-dec-date{font-size:8.5px;color:#3a4556;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cl-mode-sheet .cl-decision.is-none{padding:3px 6px}',
      '.cl-mode-sheet .cl-dec-empty{width:72px;height:44px;border:1.5px dashed #b8c2cf;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:8.5px;line-height:1.3;color:#5b6675;text-align:center}',
      // 見出し（左に濃紺のアクセント線）・ブロック
      '.cl-mode-sheet .cl-blk{margin:10px 0 0;break-inside:avoid}',
      '.cl-mode-sheet .cl-h{margin:0 0 3px;padding:0 0 0 6px;border-left:3px solid #24324a;font-size:10.5px;font-weight:800;line-height:1.35;color:#1a2233}',
      '.cl-mode-sheet .cl-h small{margin-left:10px;font-size:8.5px;font-weight:500;color:#5b6675}',
      // 4. 必須条件｜勤務条件の確認（左 45%・右 55%）
      '.cl-mode-sheet .cl-cols{display:grid;grid-template-columns:minmax(0,45fr) minmax(0,55fr);gap:0 16px;margin-top:10px}.cl-mode-sheet .cl-cols>.cl-blk{margin-top:0}',
      '.cl-mode-sheet table.cl-mtab{width:100%;border-collapse:collapse}',
      '.cl-mode-sheet .cl-mtab td{padding:3px 4px;border-bottom:1px solid #e6eaef;vertical-align:top}',
      '.cl-mode-sheet .cl-mm-c{width:5em;white-space:nowrap}.cl-mode-sheet .cl-mm-l{font-weight:600}',
      '.cl-mode-sheet .cl-mm{display:inline-block;padding:0 5px;border-radius:3px;font-weight:800;line-height:1.45;color:#5b6675;background:#eef1f5}',
      '.cl-mode-sheet .m-match .cl-mm{color:#0b7a55;background:#e3f6ee}.cl-mode-sheet .m-mismatch .cl-mm{color:#fff;background:#b42318}',
      '.cl-mode-sheet dl.cl-kv{margin:0}',
      '.cl-mode-sheet dl.cl-kv>div{display:grid;grid-template-columns:9.5em minmax(0,1fr);gap:6px;align-items:baseline;padding:3px 4px;border-bottom:1px solid #e6eaef}',
      '.cl-mode-sheet dl.cl-kv dt{font-size:8.5px;font-weight:600;color:#5b6675}',
      '.cl-mode-sheet dl.cl-kv dd{margin:0;min-width:0;font-weight:700;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}',
      // 5. 確認点（○緑 △琥珀 ×赤 の丸バッジ。未入力は灰「—」。メモの列は 2026-10-16 に外した＝確認点のメモは面接メモ・所見の枠の 1 行。.cl-rt-nt は旧い保存 HTML 用）
      '.cl-mode-sheet table.cl-rt{width:100%;border-collapse:collapse;table-layout:fixed}',
      '.cl-mode-sheet .cl-rt col.c-no{width:20px}.cl-mode-sheet .cl-rt col.c-lbl{width:auto}.cl-mode-sheet .cl-rt col.c-mk{width:30px}',
      '.cl-mode-sheet .cl-rt td{padding:3px 4px;border-bottom:1px solid #e6eaef;vertical-align:middle}',
      '.cl-mode-sheet .cl-rt-no{font-size:8.5px;color:#5b6675;text-align:center}.cl-mode-sheet .cl-rt-lbl{font-weight:600}.cl-mode-sheet .cl-rt-mk{text-align:center}',
      '.cl-mode-sheet .cl-rt-nt{color:#3a4556;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cl-mode-sheet .cl-mark{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;font-size:10px;font-weight:800;line-height:1;color:#fff;background:#8a94a3}',
      '.cl-mode-sheet .cl-mark.m-good{background:#0b7a55}.cl-mode-sheet .cl-mark.m-fair{background:#c98a1b}.cl-mode-sheet .cl-mark.m-poor{background:#b42318}.cl-mode-sheet .cl-mark.m-none{color:#8a94a3;background:#eef1f5}',
      // 5b. 確認点｜人物像の 2 カラム（50:50）・人物像の表（項目名・5 段の目盛り・点。1 点は赤・2 点は琥珀・3〜5 点は濃い灰色。docs/SPEC-persona.md 4-2）
      '.cl-mode-sheet .cl-cols.cl-cols-eval{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}',
      '.cl-mode-sheet .cl-blk-persona .cl-h{display:flex;align-items:baseline}.cl-mode-sheet .cl-ps-sum{margin-left:auto;font-size:9px;font-weight:800;color:#1a2233}',
      '.cl-mode-sheet table.cl-ps{width:100%;border-collapse:collapse;table-layout:fixed}',
      '.cl-mode-sheet .cl-ps col.c-no{width:16px}.cl-mode-sheet .cl-ps col.c-sc{width:64px}.cl-mode-sheet .cl-ps col.c-v{width:18px}',
      '.cl-mode-sheet .cl-ps td{padding:3px 4px;border-bottom:1px solid #e6eaef;vertical-align:middle}',
      '.cl-mode-sheet .cl-ps-no{font-size:8.5px;color:#5b6675;text-align:center}',
      '.cl-mode-sheet .cl-ps-lbl{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cl-mode-sheet .cl-ps-bar{display:flex;gap:2px}.cl-mode-sheet .cl-ps-bar i{flex:1 1 0;height:9px;border:1px solid #b8c2cf;border-radius:2px;background:#fff}',
      '.cl-mode-sheet .cl-ps-bar i.on{background:#3a4556;border-color:#3a4556}',
      '.cl-mode-sheet .cl-ps tr.s-2 .cl-ps-bar i.on{background:#c98a1b;border-color:#c98a1b}.cl-mode-sheet .cl-ps tr.s-1 .cl-ps-bar i.on{background:#b42318;border-color:#b42318}',
      '.cl-mode-sheet .cl-ps-v{text-align:center;font-weight:800}.cl-mode-sheet .cl-ps tr.s-1 .cl-ps-v{color:#b42318}',
      '.cl-mode-sheet .cl-nm-rt-i b{font-weight:700;color:#3a4556}.cl-mode-sheet .cl-nm-rt-sep{margin:0 5px;color:#8a94a3}',
      // 6. 面接メモ・所見の枠（質問の回答は 2 行まで。面接所見・メモは全文）。名前の列は「1 問目の短い名前 ほか n 問」が 1 行に入る幅。
      //   枠は残りの高さいっぱい（flex）。記入の下は手書き用の薄い点線の罫線（7.5mm 間隔。flex-basis 0・overflow:hidden で内容の高さに入れない）。
      //   記入が無い枠は罫線 1 本分（7.5mm）を最低の高さにする
      '.cl-mode-sheet .cl-blk-notes{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}',
      '.cl-mode-sheet .cl-nm-box{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;padding:0 8px 1px;border:1px solid #c9d2dd;border-radius:4px;background:#fff}',
      '.cl-mode-sheet .cl-nm{min-height:0;overflow:hidden}',
      '.cl-mode-sheet .cl-nm-lines{flex:1 1 0;min-height:0;overflow:hidden}',
      '.cl-mode-sheet .cl-nm-box.is-empty .cl-nm-lines{min-height:7.5mm}',
      '.cl-mode-sheet .cl-nm-lines i{display:block;height:7.5mm;border-bottom:1px dotted #b8c2cf}',
      '.cl-mode-sheet .cl-nm-row{display:grid;grid-template-columns:18em minmax(0,1fr);gap:8px;padding:3px 4px;border-bottom:1px solid #e6eaef}',
      '.cl-mode-sheet .cl-nm-k{font-size:8.5px;font-weight:700;color:#5b6675;line-height:1.35;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}',
      '.cl-mode-sheet .cl-nm-no{margin-right:3px;color:#24324a}',
      '.cl-mode-sheet .cl-nm-v{min-width:0;overflow-wrap:anywhere}',
      '.cl-mode-sheet .cl-nm-q .cl-nm-v,.cl-mode-sheet .cl-nm-b .cl-nm-v{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}',
      '.cl-mode-sheet .cl-nm-iv .cl-nm-v,.cl-mode-sheet .cl-nm-memo .cl-nm-v{white-space:pre-wrap}',
      // 案内 1 行: 「…」で切れたメモがある（.cl-nm-cut）／質問の回答を省いた（.cl-compact-2）ときだけ
      '.cl-mode-sheet .cl-nm-ref{display:none;margin:3px 4px 0;font-size:8.5px;color:#5b6675}',
      '.cl-mode-sheet.cl-nm-cut .cl-nm-ref,.cl-mode-sheet.cl-compact-2 .cl-nm-ref.has-q{display:block}',
      '.cl-mode-sheet .cl-nm-ref-q{display:none}.cl-mode-sheet.cl-compact-2 .cl-nm-ref.has-q .cl-nm-ref-q{display:inline}.cl-mode-sheet.cl-compact-2 .cl-nm-ref.has-q .cl-nm-ref-c{display:none}',
      // 7. 説明・連絡（1 行）
      '.cl-mode-sheet .cl-exline{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 5px;margin:10px 0 0;padding:4px 8px;border:1px solid #e1e6ec;border-radius:4px;background:#fafbfc}',
      '.cl-mode-sheet .cl-ex-k{font-size:8.5px;font-weight:700;color:#5b6675;margin-right:2px}.cl-mode-sheet .cl-ex-i{font-weight:600;white-space:nowrap}.cl-mode-sheet .cl-ex-i.is-off{font-weight:800;text-decoration:underline}',
      '.cl-mode-sheet .cl-ex-sep{color:#8a94a3}.cl-mode-sheet .cl-ex-bar{margin:0 6px;color:#b8c2cf}',
      // 8. 押印行
      '.cl-mode-sheet .cl-stamps{margin:10px 0 0;break-inside:avoid}',
      '.cl-sheet .stamp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;break-inside:avoid}',
      '.cl-sheet .stamp-row.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.cl-sheet .stamp-box{display:flex;align-items:center;gap:6px;text-align:left;padding:2px 8px;border:1px solid #c9d2dd;border-radius:4px;background:#fff;min-width:0}',
      '.cl-sheet .stamp-label{font-size:9.5px;font-weight:700;min-width:5em;color:#1a2233}.cl-sheet .stamp-area{height:auto;display:grid;place-items:center}',
      '.cl-sheet .hanko{width:46px;height:46px}.cl-sheet .stamp-empty{width:44px;height:44px;font-size:8.5px;border:2px dashed #c7d0db;border-radius:50%;display:grid;place-items:center;color:#5b6675;background:#fff}',
      '.cl-sheet .stamp-meta{font-size:8.5px;min-height:0;line-height:1.3;color:#3a4556}',
      // 押せる欄の案内（保存 HTML の ::after。position:absolute）の土台は常時付けておく（ホバーで付け外しすると寸法が変わる）。
      //   アプリのダークテーマのハンコの明るさ補正（:root[data-theme="dark"] .hanko）を用紙では効かせない
      '.cl-sheet .stamp-box,.cl-mode-sheet .cl-decision{position:relative}',
      '.cl-sheet .hanko,.cl-sheet .verdict-stamp{filter:none !important}',
      // 1 ページ保証（clFitSheet）: 高さが A4 を超えたら .cl-compact（本文 9px・余白を詰める。質問の回答は 2 行のまま・面接所見 10 行・メモ 3 行まで）→
      //   .cl-compact-q1（質問の回答 1 行・面接所見 6 行・メモ 2 行）→ .cl-compact-2（質問の回答を省いて 1 行の案内・面接所見 4 行・メモ 1 行）。
      //   段階ごとの行数の上限はここで決め、段階を決めたあとで「…」で切れたメモが残り、面接メモ・所見の枠に空き（罫線の部分）があれば、clFitSheet が
      //   要素のインラインの -webkit-line-clamp で 1 行ずつ広げる（面接所見 → メモ → 質問の回答。docs/SPEC-a4.md 12 章 F5）
      '.cl-mode-sheet.cl-compact{font-size:9px;line-height:1.35}',
      '.cl-mode-sheet.cl-compact .cl-blk,.cl-mode-sheet.cl-compact .cl-cols,.cl-mode-sheet.cl-compact .cl-exline,.cl-mode-sheet.cl-compact .cl-stamps{margin-top:7px}',
      '.cl-mode-sheet.cl-compact .cl-mtab td,.cl-mode-sheet.cl-compact .cl-rt td,.cl-mode-sheet.cl-compact dl.cl-kv>div,.cl-mode-sheet.cl-compact .cl-nm-row{padding-top:2px;padding-bottom:2px}',
      '.cl-mode-sheet.cl-compact dl.cl-kv dd{-webkit-line-clamp:1}',
      '.cl-mode-sheet.cl-compact .cl-nm-k{-webkit-line-clamp:1}',
      '.cl-mode-sheet.cl-compact .cl-nm-iv .cl-nm-v,.cl-mode-sheet.cl-compact .cl-nm-memo .cl-nm-v{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:10;overflow:hidden}',
      '.cl-mode-sheet.cl-compact .cl-nm-memo .cl-nm-v{-webkit-line-clamp:3}',
      '.cl-mode-sheet.cl-compact-q1 .cl-nm-q .cl-nm-v,.cl-mode-sheet.cl-compact-q1 .cl-nm-b .cl-nm-v{-webkit-line-clamp:1}',
      '.cl-mode-sheet.cl-compact-q1 .cl-nm-iv .cl-nm-v{-webkit-line-clamp:6}.cl-mode-sheet.cl-compact-q1 .cl-nm-memo .cl-nm-v{-webkit-line-clamp:2}',
      '.cl-mode-sheet.cl-compact-2 .cl-nm-q{display:none}',
      '.cl-mode-sheet.cl-compact-2 .cl-nm-iv .cl-nm-v{-webkit-line-clamp:4}.cl-mode-sheet.cl-compact-2 .cl-nm-memo .cl-nm-v{-webkit-line-clamp:1}.cl-mode-sheet.cl-compact-2 .cl-adj li+li{display:none}',
      // ゆったり（clFitSheet が最初に試す。内容が少ないとき）: 本文 10.5px・行の高さ・確認点の行高・ブロックの間隔を広げる。
      //   面接メモ・所見の枠に罫線 38mm 分を残せるときだけ付く（計測中＝.cl-measure のときだけ .cl-nm-lines の最低の高さを 38mm にして計る。
      //   表示中は最低の高さを付けない＝狭い画面の --a4-zoom で行の高さが丸められて内容が数 % 伸びても、罫線の部分が縮んで吸収し、押印行は用紙の下端のまま）
      '.cl-mode-sheet.cl-roomy{font-size:10.5px;line-height:1.5}',
      '.cl-mode-sheet.cl-roomy .cl-judge{margin-top:10px}',
      '.cl-mode-sheet.cl-roomy .cl-blk,.cl-mode-sheet.cl-roomy .cl-cols,.cl-mode-sheet.cl-roomy .cl-exline,.cl-mode-sheet.cl-roomy .cl-stamps{margin-top:13px}',
      '.cl-mode-sheet.cl-roomy .cl-h{font-size:11.5px;margin-bottom:5px}.cl-mode-sheet.cl-roomy .cl-h small{font-size:9px}',
      '.cl-mode-sheet.cl-roomy .cl-mtab td,.cl-mode-sheet.cl-roomy dl.cl-kv>div,.cl-mode-sheet.cl-roomy .cl-nm-row{padding-top:4px;padding-bottom:4px}',
      '.cl-mode-sheet.cl-roomy .cl-rt td{padding-top:6px;padding-bottom:6px}',
      '.cl-mode-sheet.cl-roomy dl.cl-kv dt,.cl-mode-sheet.cl-roomy .cl-nm-k,.cl-mode-sheet.cl-roomy .cl-rt-no,.cl-mode-sheet.cl-roomy .cl-ex-k{font-size:9.5px}',
      '.cl-mode-sheet.cl-roomy .cl-mark{width:19px;height:19px;font-size:11px}',
      '.cl-mode-sheet.cl-roomy .cl-exline{padding:5px 10px}',
      '.cl-mode-sheet.cl-roomy .cl-ps td{padding-top:6px;padding-bottom:6px}.cl-mode-sheet.cl-roomy .cl-ps-bar i{height:11px}.cl-mode-sheet.cl-roomy .cl-ps-no{font-size:9.5px}',
      '.cl-mode-sheet.cl-compact .cl-ps td{padding-top:2px;padding-bottom:2px}',
      //   切れたメモを広げる計測（.cl-grow）では 38mm を外す（罫線の空きは 0 行まで使う。F5）
      '.cl-mode-sheet.cl-roomy.cl-measure:not(.cl-grow) .cl-nm-box .cl-nm-lines{min-height:38mm}',
      '.cl-sheet .cl-title-logo,.cl-sheet .cl-tile,.cl-sheet .hanko,.cl-sheet .stamp-empty,.cl-sheet .cl-judge,.cl-sheet .cl-mark,.cl-sheet .cl-mm,.cl-sheet .cl-exline,.cl-sheet .cl-decision,.cl-sheet .verdict-stamp,.cl-sheet .cl-dec-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '.cl-sheet .cl-ps-bar i{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    ].join('\n');
  }

  // ---------- 面接記入シート（手書き用。A4 縦 1 枚。docs/SPEC-persona.md 5 章） ----------
  //   紙に書いて面接し、面接のあとでアプリに転記する人のための白紙の記入用紙（アプリの ② と同じ並び）。用紙の部品（.a4・見出し .cl-title）は報告書と同じ。
  //   保存しない（印刷だけ）。印字するのは ① の応募者（氏名・区分/年齢/性別・面接日・担当・求人・タクシー）だけで、② の回答は印字しない。
  //   人物像の行は台本（def.persona）で決める（記録の persona === null は見ない）。DOM 非依存の HTML 文字列。o = { now }（印刷日。既定は今日）
  //   上から: 見出し → 応募者（1 行）→ 2 段（台本の 1 枚目〔page 1〕｜2 枚目以降）→ 総評（人物像 1〜5・総合判断・面接所見の罫線〔残りの高さいっぱい〕）
  const PP_NOTE_LINES = new Array(41).join('<i></i>');   // 面接所見の罫線（7mm 間隔。残りの高さいっぱいに置き、はみ出しは切る）
  const PP_Q_LINES = '<i></i><i></i><i></i>';            // 質問のメモの罫線（1 ページに収まらなければ fitPaperSheet が 3 → 2 → 1 → 0 本にする）
  function paperSheetHtml(record, profile, o) {
    const R = global.RecruitRules;
    const esc = U.esc;
    o = o || {};
    record = record || {};
    profile = profile || defaults();
    const a = U.isObj(record.applicant) ? record.applicant : {};
    const cl = U.isObj(record.checklist) ? record.checklist : R.emptyChecklist();
    const def = normalizeChecklistDef(record.checklistDef || profile.checklist, defaults().checklist);
    const prof = Object.assign({}, profile, { checklist: def });
    const sum = R.checklistSummary(a, cl, prof, { management: record.management });
    const meta = profile.meta || {};
    const baseItems = clDefaultItems();
    const shortOf = function (it) { return clShortOf(it, baseItems); };
    const line = '<span class="pp-line"></span>';
    const box = function (label) { return '<span class="pp-box"></span>' + esc(label); };
    const val = function (v) { const t = asStr(v).trim(); return t ? esc(t) : line; };
    // 見出し（報告書と同じ部品。右は 台本の版／劇場名／印刷日）
    const titleHtml = clTitleHtml(meta, def, '面接記入シート', '印刷 ' + clFmtDate(U.fmtDate(o.now ? new Date(o.now) : new Date())));
    // 応募者（① に入力があれば印字、無ければ空欄の線。求人は未選択なら □通常求人 □短期求人）
    const hd = sum.header;
    const posting = U.isObj(def.header) && U.isObj(def.header.posting) ? def.header.posting : {};
    const pOpts = Array.isArray(posting.options) ? posting.options : [];
    const who = [asStr(a.category).trim(), asStr(a.age).trim() ? asStr(a.age).trim() + '歳' : '', asStr(a.gender).trim()].filter(Boolean).join('・');
    const name = asStr(a.name).trim();
    const whoHtml = '<dl class="pp-who">' +
      '<div class="pp-f pp-f-name"><dt>氏名</dt><dd>' + (name ? esc(name) : line) + '<small>さん</small>' + (who ? '<span class="pp-who-s">' + esc(who) + '</span>' : '') + '</dd></div>' +
      '<div class="pp-f"><dt>面接日</dt><dd>' + val(hd.date ? clFmtDate(hd.date) : '') + '</dd></div>' +
      '<div class="pp-f"><dt>担当</dt><dd>' + val(hd.interviewer) + '</dd></div>' +
      '<div class="pp-f"><dt>' + esc(asStr(posting.label) || '応募した求人') + '</dt><dd>' +
        (hd.postingLabel ? esc(hd.postingLabel) : pOpts.map(function (x) { return box(asStr(x.label) || asStr(x.value)); }).join('')) + '</dd></div>' +
      '<div class="pp-f"><dt>タクシー可否・料金</dt><dd>' + val(hd.taxi && hd.taxi.text) + '</dd></div></dl>';
    // セクション（台本の順・ブロックの順）。必須条件・確認点は全文、記入欄・説明・質問・合否連絡は短い名前。注記・質問文・説明の全文は載せない
    const secHtml = function (s) {
      let h = '<section class="pp-sec" data-sec="' + esc(s.id) + '"><h3 class="pp-h"><span>' + esc(s.noMark + ' ' + s.title) + '</span>' + (s.minutesText ? '<small>' + esc(s.minutesText) + '</small>' : '') + '</h3>';
      s.blocks.forEach(function (b) {
        if (!b.items.length) return;
        if (b.type === 'must') {
          h += '<table class="pp-t pp-must"><tbody>' + b.items.map(function (it) {
            return '<tr data-pp-item="' + esc(it.id) + '"><td class="pp-lbl">' + esc(it.label) + '</td><td class="pp-ch">' + box(R.MUST_VALUES.match.label) + box(R.MUST_VALUES.mismatch.label) + '</td></tr>';
          }).join('') + '</tbody></table>';
        } else if (b.type === 'fields') {
          h += '<dl class="pp-fields">' + b.items.map(function (it) {
            const opts = it.kind === 'choice' && Array.isArray(it.options) ? it.options : [];
            return '<div data-pp-item="' + esc(it.id) + '"><dt>' + esc(shortOf(it)) + '</dt><dd>' + (opts.length ? opts.map(function (x) { return box(asStr(x.label) || asStr(x.value)); }).join('') : line) + '</dd></div>';
          }).join('') + '</dl>';
        } else if (b.type === 'explain' || b.type === 'notify') {
          const so = b.type === 'explain' && b.items.some(function (it) { return it.shortOnly === true; });
          h += '<div class="pp-ex" data-pp-block="' + esc(b.id) + '"><span class="pp-k">' + esc(b.title || (b.type === 'notify' ? '合否連絡' : '説明')) + '</span>' +
            b.items.map(function (it) { return '<span class="pp-ck">' + box(shortOf(it) + (b.type === 'explain' && it.shortOnly === true ? '※' : '')) + '</span>'; }).join('') +
            (so ? '<span class="pp-note">※短期求人のみ</span>' : '') + '</div>';
        } else if (b.type === 'question') {
          h += '<div class="pp-q" data-pp-block="' + esc(b.id) + '"><div class="pp-qn"><span class="pp-k">質問</span>' +
            b.items.map(function (it) { return '<span class="pp-qi">' + esc(shortOf(it)) + '</span>'; }).join('<span class="pp-qsep">・</span>') + '</div>' +
            (b.memo ? '<div class="pp-lines" aria-hidden="true">' + PP_Q_LINES + '</div>' : '') + '</div>';
        } else if (b.type === 'rating') {
          h += '<table class="pp-t pp-rate"><tbody>' + b.items.map(function (it) {
            return '<tr data-pp-item="' + esc(it.id) + '"><td class="pp-lbl">' + esc(it.label) + '</td><td class="pp-mk"><span>○</span><span>△</span><span>×</span></td></tr>';
          }).join('') + '</tbody></table>';
        }
      });
      return h + '</section>';
    };
    // 2 段: 台本の 1 枚目（page 1）を左、2 枚目以降を右（どちらかが空になる台本は前半 ceil(n/2) を左・残りを右）
    const secs = sum.sections;
    let left = secs.filter(function (s) { return s.page === 1; }), right = secs.filter(function (s) { return s.page >= 2; });
    if (!left.length || !right.length) { const half = Math.ceil(secs.length / 2); left = secs.slice(0, half); right = secs.slice(half); }
    const colsHtml = '<div class="pp-cols"><div class="pp-col">' + left.map(secHtml).join('') + '</div><div class="pp-col">' + right.map(secHtml).join('') + '</div></div>';
    // 総評: 人物像（1〜5 に丸）・総合判断（採用／保留／不採用に丸）・面接所見の罫線
    const pm = R.personaModel(def, { persona: {} });
    const psHtml = pm
      ? '<div class="pp-ps"><div class="pp-ps-head"><b>' + esc(pm.title) + '</b><span class="pp-legend">' + esc(pm.scaleLabels.map(function (l, i) { return (i + 1) + ' ' + l; }).join('　')) + '</span>' +
        '<span class="pp-ps-sum">合計 ' + line + ' / ' + pm.max + ' 点</span></div>' +
        '<table class="pp-ps-t"><tbody>' + pm.items.map(function (it, i) {
          let sc = '';
          for (let k = 1; k <= pm.scaleMax; k++) sc += '<span>' + k + '</span>';
          return '<tr data-pp-ps="' + esc(it.id) + '"><td class="pp-no">' + (i + 1) + '</td><td class="pp-lbl">' + esc(it.label) + (it.hint ? '<small>' + esc(it.hint) + '</small>' : '') + '</td><td class="pp-sc">' + sc + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '';
    const oo = U.isObj(def.overallOptions) ? def.overallOptions : {};
    const OVL = { hire: '採用', hold: '保留', reject: '不採用' };
    const ovHtml = '<div class="pp-ov"><span class="pp-k">' + esc(asStr(def.overallLabel).trim() || '面接者の総合判断') + '</span>' +
      ['hire', 'hold', 'reject'].map(function (k) { return '<span class="pp-ov-o">' + esc(asStr(oo[k]).trim() || OVL[k]) + '</span>'; }).join('') + '<small>（○で囲む）</small></div>';
    const notesHtml = '<div class="pp-notes"><span class="pp-k">面接所見</span><div class="pp-lines" aria-hidden="true">' + PP_NOTE_LINES + '</div></div>';
    const sumHtml = '<section class="pp-sum"><h3 class="pp-h"><span>総評</span></h3>' + psHtml + ovHtml + notesHtml + '</section>';
    return '<div class="pp-sheet">' + titleHtml + whoHtml + colsHtml + sumHtml + '</div>';
  }

  // 面接記入シートのスタイル（アプリは起動時に 1 回 <style id="paperSheetCss"> に入れる。用紙の箱 .a4 は checklistSheetCss）。
  //   本文 9.5px・見出しは報告書と同じ寸法・罫線 7mm の点線・□ 9px の枠・2 段。シートは縦の flex で用紙の内寸いっぱい（面接所見の罫線が残りの高さ）。
  //   計測中（.pp-measure）は内容の高さ（面接所見の罫線は最低 30mm）。画面幅で変わる規則（@media）を置かない（画面と印刷で同じ）
  function paperSheetCss() {
    return [
      '.pp-sheet{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP",system-ui,sans-serif;font-size:9.5px;line-height:1.4;color:#111;background:#fff;display:flex;flex-direction:column;min-height:100%;max-height:100%}',
      '.pp-sheet.pp-measure{min-height:0 !important;max-height:none !important}',
      '.pp-sheet *{box-sizing:border-box}',
      '.pp-sheet .cl-title{display:flex;align-items:center;gap:8px;min-height:7mm;padding:0 1px 3px;border-bottom:2px solid #24324a}',
      '.pp-sheet .cl-title-logo{flex:none;display:block;height:7mm;width:auto;max-width:50mm;object-fit:contain}',
      '.pp-sheet .cl-title-t{flex:none;font-size:13px;font-weight:800;letter-spacing:.04em;line-height:1.3;color:#1a2233}',
      '.pp-sheet .cl-title-r{margin-left:auto;min-width:0;font-size:8.5px;color:#3a4556;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pp-who{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;margin:0;padding:6px 2px 5px;border-bottom:1px solid #d5dbe3}',
      '.pp-who>div{display:flex;align-items:baseline;gap:5px;min-width:0;max-width:100%}',
      '.pp-who dt{flex:none;font-size:8.5px;font-weight:700;color:#5b6675}',
      '.pp-who dd{margin:0;min-width:0;font-weight:700;overflow-wrap:anywhere}',
      '.pp-f-name dd{font-size:14px;font-weight:800}.pp-f-name small{font-size:9px;font-weight:600;margin-left:2px}.pp-f-name .pp-who-s{font-size:9px;font-weight:600;color:#3a4556;margin-left:6px}',
      '.pp-line{display:inline-block;width:26mm;height:1.1em;border-bottom:1px solid #5b6675;vertical-align:-3px}',
      '.pp-f-name .pp-line{width:46mm}',
      '.pp-box{display:inline-block;width:9px;height:9px;border:1px solid #3a4556;margin:0 2px 0 6px;vertical-align:-1px}',
      '.pp-box:first-child{margin-left:0}',
      '.pp-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 14px;margin-top:7px}',
      '.pp-col{min-width:0}',
      '.pp-sec{margin-top:7px}.pp-col>.pp-sec:first-child{margin-top:0}',
      '.pp-h{display:flex;align-items:baseline;gap:6px;margin:0 0 2px;padding:0 0 0 6px;border-left:3px solid #24324a;font-size:10.5px;font-weight:800;line-height:1.35;color:#1a2233}',
      '.pp-h small{font-size:8.5px;font-weight:600;color:#5b6675}',
      '.pp-k{flex:none;font-size:8.5px;font-weight:700;color:#5b6675;margin-right:4px}',
      'table.pp-t{width:100%;border-collapse:collapse}',
      '.pp-t td{padding:2px 3px;border-bottom:1px solid #e6eaef;vertical-align:middle}',
      '.pp-t .pp-lbl{font-weight:600}',
      '.pp-t .pp-ch{white-space:nowrap;text-align:right;font-weight:700}',
      '.pp-t .pp-mk{white-space:nowrap;text-align:right;width:62px}',
      '.pp-mk span{display:inline-block;width:18px;text-align:center;font-size:11.5px;font-weight:700}',
      '.pp-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 8px;margin:0}',
      '.pp-fields>div{display:flex;align-items:baseline;gap:4px;min-width:0;padding:2px 3px;border-bottom:1px solid #e6eaef}',
      '.pp-fields dt{flex:none;font-size:8.5px;font-weight:700;color:#5b6675}',
      '.pp-fields dd{margin:0;min-width:0;flex:1 1 auto;white-space:nowrap}',
      '.pp-fields dd .pp-line{width:100%}',
      '.pp-ex{display:flex;flex-wrap:wrap;align-items:baseline;gap:1px 9px;padding:2px 3px;border-bottom:1px solid #e6eaef}',
      '.pp-ck{white-space:nowrap}',
      '.pp-note{font-size:8px;color:#5b6675}',
      '.pp-q{padding:2px 3px 0;border-bottom:1px solid #e6eaef}',
      '.pp-qn{line-height:1.35}',
      '.pp-qi{white-space:nowrap}.pp-qsep{color:#8a94a3;margin:0 3px}',
      '.pp-lines i{display:block;height:7mm;border-bottom:1px dotted #8a94a3}',
      '.pp-sheet.pp-q2 .pp-q .pp-lines i:nth-child(n+3){display:none}',
      '.pp-sheet.pp-q1 .pp-q .pp-lines i:nth-child(n+2){display:none}',
      '.pp-sheet.pp-q0 .pp-q .pp-lines{display:none}',
      '.pp-sum{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;margin-top:9px}',
      '.pp-ps{margin-top:1px}',
      '.pp-ps-head{display:flex;align-items:baseline;gap:10px;padding:0 3px 1px}',
      '.pp-ps-head b{font-size:9.5px}',
      '.pp-legend{font-size:8.5px;color:#3a4556}',
      '.pp-ps-sum{margin-left:auto;font-size:9px;font-weight:700;white-space:nowrap}.pp-ps-sum .pp-line{width:12mm}',
      'table.pp-ps-t{width:100%;border-collapse:collapse}',
      '.pp-ps-t td{padding:2.5px 3px;border-bottom:1px solid #e6eaef;vertical-align:middle}',
      '.pp-ps-t .pp-no{width:14px;font-size:8.5px;color:#5b6675;text-align:center}',
      '.pp-ps-t .pp-lbl{font-weight:600}.pp-ps-t .pp-lbl small{font-size:8.5px;font-weight:500;color:#5b6675;margin-left:4px}',
      '.pp-ps-t .pp-sc{white-space:nowrap;text-align:right;width:44mm}',
      '.pp-ps-t .pp-sc span{display:inline-block;width:8mm;text-align:center;font-size:12px;font-weight:700}',
      '.pp-ov{display:flex;align-items:baseline;gap:6px;margin-top:5px;padding:2px 3px}',
      '.pp-ov-o{font-size:12.5px;font-weight:800;padding:0 10px}',
      '.pp-ov small{font-size:8.5px;color:#5b6675}',
      '.pp-notes{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;margin-top:3px;padding:0 3px}',
      '.pp-notes .pp-lines{flex:1 1 0;min-height:0;overflow:hidden}',
      //   計測中の面接所見の罫線は最低 30mm（4 本分）。flex:none にすると罫線 40 本ぶんの高さを測ってしまう
      '.pp-sheet.pp-measure .pp-notes .pp-lines{min-height:30mm}',
      '.pp-sheet.pp-compact{font-size:9px;line-height:1.3}',
      '.pp-sheet.pp-compact .pp-sec{margin-top:4px}',
      '.pp-sheet.pp-compact .pp-t td,.pp-sheet.pp-compact .pp-fields>div,.pp-sheet.pp-compact .pp-ex,.pp-sheet.pp-compact .pp-ps-t td{padding-top:1px;padding-bottom:1px}',
      '.pp-sheet.pp-compact .pp-lines i{height:6mm}',
      '.pp-sheet .pp-box,.pp-sheet .pp-line,.pp-sheet .pp-lines i{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    ].join('\n');
  }

  // 面接記入シートを 1 ページに収める（docs/SPEC-persona.md 5-4。clFitSheet と同じ形）。.pp-measure を付けた内容の高さが limit 以下になる最初の段階で止める:
  //   pp-q3（質問のメモの罫線 3 本）→ pp-q2 → pp-q1 → pp-q1 pp-compact（詰める）→ pp-q0 pp-compact（罫線なし）→ 縮小（zoom。最大 12 回・0.3 まで）。
  //   戻り値は付けた段階（'pp-q3'・…・'zoom'）。高さ 0（描かれていない）なら何もしない（''）
  function fitPaperSheet(sheet, limit) {
    if (!sheet || !sheet.getBoundingClientRect) return '';
    limit = typeof limit === 'number' && limit > 0 ? limit : CL_SHEET_LIMIT_PX;
    var cls = sheet.classList, lv = [['pp-q3'], ['pp-q2'], ['pp-q1'], ['pp-q1', 'pp-compact'], ['pp-q0', 'pp-compact']], all = ['pp-q3', 'pp-q2', 'pp-q1', 'pp-q0', 'pp-compact'];
    var i, j, h = 0, z = 1, n;
    var hOf = function () { cls.add('pp-measure'); var r = sheet.getBoundingClientRect().height; cls.remove('pp-measure'); return r; };
    var clear = function () { for (j = 0; j < all.length; j++) cls.remove(all[j]); };
    sheet.style.zoom = '';
    for (i = 0; i < lv.length; i++) {
      clear();
      for (j = 0; j < lv[i].length; j++) cls.add(lv[i][j]);
      h = hOf();
      if (!h) { clear(); return ''; }
      if (h <= limit) return lv[i].join(' ');
    }
    for (n = 0; n < 12 && h > limit && z > 0.3; n++) {
      z = Math.max(0.3, Math.floor(z * limit / h * 1000) / 1000 - (n ? 0.005 : 0));
      sheet.style.zoom = String(z);
      h = hOf();
    }
    return 'zoom';
  }

  // ---------- 保存 HTML（A4 縦の用紙 1 枚。docs/SPEC-a4.md 1 章・3 章） ----------
  //   body 直下の用紙 main.a4#a4 そのもの（画面と印刷で同じ要素・寸法・文字組み。詳細表示・印刷専用の複製・操作パネルは無い）。
  //   押印・最終合否は用紙の欄を直接クリックして窓（.pop）で押し、右下の保存バー（.savebar）から同じ形式のファイルを書き出す。
  //   「…」で切れたメモは画面でクリックすると全文の窓。窓・保存バー・押せる欄の印はスクリプトが作り、書き出すファイルには残さない
  function generateReportHTML(record, profile) {
    const esc = U.esc;
    record = record || {};
    profile = profile || defaults();
    const a = U.isObj(record.applicant) ? record.applicant : {};
    // 押印・最終合否（docs/SPEC-report.md 4-1）。ファイル名は合否付き（有効かつ合否ありのとき 基本名_採用.html）
    const Stamp = global.RecruitStamp;
    const dcfg = decisionConfig(profile);
    const dec = dcfg.enabled ? normalizeDecision(record.decision) : null;   // 表示用（埋め込み JSON は record のまま）
    const baseName = '応募者_' + safeName(a.name) + '_' + U.fmtDate(record.savedAt || new Date()) + '.html';
    const filename = Stamp ? Stamp.decisionFilename(baseName, dec, dcfg) : baseName;
    const meta = profile.meta || {};
    const name = a.name ? a.name + 'さん' : '応募者';
    const SCRIPT_END = '</scr' + 'ipt>';
    // 窓で使う設定（押印欄・名簿・手入力の可否・担当と連動する押印欄・最終合否）。押印欄 0・合否 OFF でも出す（長いメモの窓は常に使う）
    const mg = profile.management || {};
    const clDef = normalizeChecklistDef(record.checklistDef || profile.checklist, defaults().checklist);
    //   最終承認のパスワード（docs/SPEC-a4.md 11 章）: 保存時のロック（salt・hash だけ。平文は持たない）と、パスワードが要る押印欄
    //   （lockFields = 既定の最終確認欄 'final' と decision.stampField の欄。lockField は decision.stampField そのもの〔互換のため残す〕）。
    //   保存 HTML はこのロックで照合する（保存後にアプリでパスワードを変えても、出したファイルは出した時点のパスワード）
    const flk = normalizeLock(mg.finalLock);
    const mgmtConfig = jsonForScript({
      fields: Array.isArray(mg.fields) ? mg.fields : [], managers: Array.isArray(mg.managers) ? mg.managers : [], allowFreeName: mg.allowFreeName !== false,
      interviewerField: asStr((clDef.header || {}).interviewerField),
      decision: dcfg.enabled ? { label: dcfg.label, hireLabel: dcfg.hireLabel, rejectLabel: dcfg.rejectLabel, hireColor: dcfg.hireColor, rejectColor: dcfg.rejectColor,
        stampField: dcfg.stampField, autoStampFinal: dcfg.autoStampFinal, filenameSuffix: dcfg.filenameSuffix, hint: dcfg.hint, sub: dcfg.sub } : null,
      finalLock: lockOn(flk) ? { salt: flk.salt, hash: flk.hash } : null,
      lockField: asStr(dcfg.stampField),
      lockFields: finalLockFields(profile)
    });
    const foot = [asStr(meta.footer).trim(), 'このファイルはアプリの「読み込み」で再度開けます。埋め込みデータは編集しないでください。'].filter(Boolean).join('　');
    // スクリプトは 1 本: 1 ページ保証（clFitSheet）・ハンコと合否スタンプ（stamp.js の純関数）・最終承認のパスワードの照合（lock.js の純関数）・用紙の操作（a4PageScript）
    const Lock = global.RecruitLock;
    const script = '(function(){\n' + clFitSheet.toString() + '\n' + (Stamp ? Stamp.source() + '\n' : '') + (Lock ? Lock.source() + '\n' : '') +
      'var LIMIT=' + CL_SHEET_LIMIT_PX + ',PAPER_W=793.7;\n(' + a4PageScript.toString() + ')(LIMIT,PAPER_W);\n})();';

    return '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>面接チェックリスト報告 - ' + esc(name) + ' | ' + esc(meta.theaterName) + '</title>\n' +
      '<style>\n' + reportCss() + '\n' + checklistSheetCss() + '\n</style>\n</head>\n' +
      '<body class="a4-doc" data-filename="' + esc(filename) + '">\n' +
      '<main class="a4" id="a4">' + checklistSheetHtml(record, profile, { decisionId: 'a4Decision', decisionSvgId: 'vdA4', stampSvgPrefix: 'a4s' }) + '</main>\n' +
      '<footer class="a4-foot" id="a4Foot">' + esc(foot) + '</footer>\n' +
      '<script type="application/json" id="recruit-record">' + jsonForScript(record) + SCRIPT_END + '\n' +
      '<script type="application/json" id="recruit-mgmt-config">' + mgmtConfig + SCRIPT_END + '\n' +
      '<script>\n' + script + '\n' + SCRIPT_END + '\n' +
      '</body>\n</html>\n';
  }

  // 保存 HTML の用紙の操作（docs/SPEC-a4.md 3 章・11 章）。generateReportHTML がソースをそのまま埋め込み、clFitSheet と stamp.js の関数
  //   （stampSvg・shortName・verdictSvg・decisionSheetHtml・decisionFilename）・lock.js の関数（sha256Hex・hashPassword・isLocked・verify）と同じ IIFE の中で呼ぶ。アプリでは呼ばない。
  //   最終承認のパスワード: cfg.finalLock があり未解錠なら、最終確認（cfg.lockFields＝'final' と decision.stampField の欄。無い旧い設定は 'final' と cfg.lockField）と
  //   最終合否の窓はパスワード欄と［確認］だけ（正しければ unlocked。変数だけで書き出しに残さない）。
  //   外部参照はそれらの関数と DOM だけの ES5 で書く（関数内にコメント・閉じタグを書かない）。文字列は旧い埋め込みスクリプトと同じ二重引用符。
  //   計測（fit）は読み込み時・押印／合否の変更後だけ。load・フォントの読み込み後は、前の計測のあとでフォント（document.fonts.status）か画像（ロゴ）の
  //   読み込みの状態が変わったときだけ測り直す（同じ計測を続けて行わない。docs/SPEC-a4.md 12 章 F8）。印刷のための切替（beforeprint）はしない。
  //   狭い画面の縮小（--a4-zoom。transform:scale なのでレイアウトは変わらない。12 章 F7）は従来どおり計測の前に外し、計測のあとで付け直す
  function a4PageScript(LIMIT, PAPER_W) {
    var de = document.documentElement, a4 = document.getElementById("a4"), sheet = a4 && a4.querySelector(".cl-sheet");
    if (!sheet) return;
    var recNode = document.getElementById("recruit-record"), cfgNode = document.getElementById("recruit-mgmt-config");
    var rec = null, cfg = null;
    try { rec = JSON.parse(recNode.textContent); } catch (e) { rec = null; }
    try { cfg = cfgNode ? JSON.parse(cfgNode.textContent) : null; } catch (e) { cfg = null; }
    var recOk = !!rec && typeof rec === "object";
    if (!recOk) rec = {};
    if (!cfg || typeof cfg !== "object") cfg = {};
    cfg.fields = Array.isArray(cfg.fields) ? cfg.fields : [];
    cfg.managers = Array.isArray(cfg.managers) ? cfg.managers : [];
    cfg.allowFreeName = cfg.allowFreeName !== false;
    if (!rec.management || typeof rec.management !== "object") rec.management = {};
    var D = cfg.decision && typeof cfg.decision === "object" ? cfg.decision : null;
    var LK = cfg.finalLock && typeof cfg.finalLock === "object" ? cfg.finalLock : null, lockF = typeof cfg.lockField === "string" ? cfg.lockField : "";
    var lockFs = Array.isArray(cfg.lockFields) ? cfg.lockFields.concat(["final"]) : ["final", lockF];
    var locked = !!LK && (typeof isLocked !== "function" || isLocked(LK)), unlocked = false;
    var canStamp = recOk && typeof stampSvg === "function" && typeof shortName === "function" && cfg.fields.length > 0;
    var canDecide = recOk && !!D && typeof decisionSheetHtml === "function" && typeof decisionFilename === "function" && typeof shortName === "function";
    var dirty = false, saved = false, pop = null, anchor = null, bar = null, rz = 0, fitKey = "";
    var ATTRS = ["data-a4-t", "tabindex", "role", "aria-haspopup", "aria-label", "aria-expanded"];

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function today() { var d = new Date(); return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()); }
    function each(list, fn) { Array.prototype.forEach.call(list || [], fn); }
    function fieldOf(id) {
      for (var i = 0; i < cfg.fields.length; i++) { if (cfg.fields[i] && cfg.fields[i].id === id) return { f: cfg.fields[i], idx: i }; }
      return null;
    }
    function stamped(id) { var e = rec.management[id]; return e && e.name ? e : null; }
    function curDec() { var d = rec.decision; return d && (d.result === "hire" || d.result === "reject") && d.by && d.by.name ? d : null; }
    function noteText(d) {
      var j = rec.judgment;
      if (!d || !j) return "";
      if ((d.result === "hire" && j.result === "reject") || (d.result === "reject" && j.result === "recommend")) return "※ アプリの判定「" + (j.title || "") + "」と異なる最終合否です（記録はそのまま残ります）。";
      return "";
    }

    function scale() {
      var w = de.clientWidth, z = w < PAPER_W + 32 ? Math.max(0.2, Math.floor((w - 32) / PAPER_W * 1000) / 1000) : 1;
      if (z < 1) de.style.setProperty("--a4-zoom", String(z)); else de.style.removeProperty("--a4-zoom");
      if (!de.getAttribute("style")) de.removeAttribute("style");
    }
    function layoutKey() {
      var k = document.fonts && document.fonts.status ? String(document.fonts.status) : "";
      each(document.images, function (im) { k += im.complete ? "1" : "0"; });
      return k;
    }
    function fit() {
      de.style.removeProperty("--a4-zoom");
      var lv = clFitSheet(sheet, LIMIT);
      fitKey = layoutKey();
      markTargets();
      scale();
      if (pop) { if (anchor && de.contains(anchor) && anchor.getAttribute("data-a4-t")) place(); else closePop(false); }
      return lv;
    }
    function refit() { if (layoutKey() !== fitKey) fit(); }
    function mark(el, t, label) {
      el.setAttribute("data-a4-t", t); el.setAttribute("tabindex", "0"); el.setAttribute("role", "button");
      el.setAttribute("aria-haspopup", "dialog"); el.setAttribute("aria-label", label);
    }
    function unmark(el) { for (var i = 0; i < ATTRS.length; i++) el.removeAttribute(ATTRS[i]); }
    function markTargets() {
      if (canStamp) each(sheet.querySelectorAll(".cl-stamps .stamp-box[data-field-id]"), function (box) {
        var x = fieldOf(box.getAttribute("data-field-id"));
        if (x) mark(box, "stamp", (x.f.label || x.f.id) + "の押印"); else unmark(box);
      });
      var dec = canDecide ? document.getElementById("a4Decision") : null;
      if (dec) mark(dec, "decision", D.label || "最終合否");
      each(sheet.querySelectorAll(".cl-nm-v,.cl-rt-nt"), function (el) {
        if (el.classList.contains("cl-cut")) mark(el, "memo", "メモの全文を表示"); else if (el.getAttribute("data-a4-t")) unmark(el);
      });
      var ref = sheet.querySelector(".cl-nm-ref");
      if (ref) { if (ref.getClientRects().length) mark(ref, "memos", "面接メモの全文を表示"); else if (ref.getAttribute("data-a4-t")) unmark(ref); }
      if (anchor && anchor.getAttribute("data-a4-t")) anchor.setAttribute("aria-expanded", "true");
    }

    function renderStamps() {
      if (!canStamp) return;
      each(sheet.querySelectorAll(".cl-stamps .stamp-box[data-field-id]"), function (box) {
        var x = fieldOf(box.getAttribute("data-field-id"));
        if (!x) return;
        var e = stamped(x.f.id), area = box.querySelector(".stamp-area"), meta = box.querySelector(".stamp-meta");
        if (area) area.innerHTML = e ? stampSvg({ name: e.short || shortName(e.name), title: e.title || "", date: e.date || "", size: 46, id: "a4s" + x.idx }) : "<div class=\"stamp-empty\">未押印</div>";
        if (meta) meta.textContent = e ? e.name + (e.title ? "（" + e.title + "）" : "") + "　" + (e.date || "") : "";
      });
    }
    function renderDecision() {
      if (!canDecide) return;
      var old = document.getElementById("a4Decision");
      if (!old) return;
      var was = anchor === old, d = curDec();
      old.outerHTML = decisionSheetHtml(d, { id: "a4Decision", svgId: "vdA4", title: D.label, hireLabel: D.hireLabel, rejectLabel: D.rejectLabel, hireColor: D.hireColor, rejectColor: D.rejectColor, sub: D.sub || "", size: 64 });
      if (was) anchor = document.getElementById("a4Decision");
      document.body.setAttribute("data-filename", decisionFilename(document.body.getAttribute("data-filename") || "applicant.html", d, D));
    }
    function barSpace() {
      var bd = document.body;
      if (bar) { bd.classList.add("a4-sb"); bd.style.setProperty("--a4-sbh", bar.offsetHeight + "px"); return; }
      bd.classList.remove("a4-sb"); bd.style.removeProperty("--a4-sbh");
      if (!bd.getAttribute("style")) bd.removeAttribute("style");
    }
    function renderBar() {
      if (!dirty && !saved) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); bar = null; barSpace(); return; }
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "savebar"; bar.id = "saveBar";
        bar.setAttribute("role", "status"); bar.setAttribute("aria-live", "polite");
        bar.innerHTML = "<span class=\"savebar-msg\" id=\"saveBarMsg\"></span><button type=\"button\" class=\"savebar-btn\" id=\"saveBarBtn\"></button>" +
          "<button type=\"button\" class=\"savebar-x\" id=\"saveBarClose\" aria-label=\"閉じる\" title=\"閉じる\" hidden>×</button>";
        bar.querySelector(".savebar-btn").addEventListener("click", exportHtml);
        bar.querySelector(".savebar-x").addEventListener("click", function () { saved = false; renderBar(); });
        document.body.appendChild(bar);
      }
      bar.querySelector(".savebar-msg").textContent = dirty ? "押印・合否を変更しました" : "保存しました（保存できなかったときは再保存）";
      bar.querySelector(".savebar-btn").textContent = dirty ? "押印を保存" : "再保存";
      bar.querySelector(".savebar-x").hidden = dirty;
      barSpace();
    }
    function render() { renderStamps(); renderDecision(); fit(); renderBar(); }
    function changed() { dirty = true; saved = false; render(); }

    function memoOf(el) {
      var notes = (rec.checklist && rec.checklist.notes) || {}, row = el.closest(".cl-nm-row"), tr = el.closest("tr[data-cl-item]"), k = "", v = null, b;
      if (row) {
        k = (row.querySelector(".cl-nm-k") || {}).textContent || "メモ";
        b = row.getAttribute("data-cl-block");
        if (b && notes[b] != null) v = notes[b];
        else if (row.classList.contains("cl-nm-iv")) v = rec.interviewNotes;
        else if (row.classList.contains("cl-nm-memo")) v = (rec.applicant || {}).reviewerNotes;
        else if (row.classList.contains("cl-nm-rt")) { v = []; each(row.querySelectorAll(".cl-nm-rt-i"), function (s) { v.push(s.textContent); }); v = v.join("\n"); }
      } else if (tr) {
        k = ((tr.querySelector(".cl-rt-no") || {}).textContent || "") + " " + ((tr.querySelector(".cl-rt-lbl") || {}).textContent || "") + " のメモ";
        v = notes[tr.getAttribute("data-cl-item")];
      }
      if (v == null || v === "") v = el.textContent;
      return { k: k || "メモ", v: String(v) };
    }
    function personHtml(name) {
      var idx = -1, i, m, o = "<option value=\"\">担当者を選択</option>";
      for (i = 0; i < cfg.managers.length; i++) { if (name && cfg.managers[i] && cfg.managers[i].name === name) { idx = i; break; } }
      var free = !!name && idx < 0 && cfg.allowFreeName;
      for (i = 0; i < cfg.managers.length; i++) {
        m = cfg.managers[i] || {};
        o += "<option value=\"" + i + "\"" + (i === idx ? " selected" : "") + ">" + esc(m.name + (m.title ? "（" + m.title + "）" : "")) + "</option>";
      }
      if (cfg.allowFreeName) o += "<option value=\"__free\"" + (free ? " selected" : "") + ">名簿にない担当者（手入力）</option>";
      return "<label class=\"pop-l\"><span>担当者</span><select class=\"pop-sel\">" + o + "</select></label>" +
        (cfg.allowFreeName ? "<input class=\"pop-free\" type=\"text\" placeholder=\"氏名（例：山田 太郎）\" aria-label=\"氏名\"" + (free ? " value=\"" + esc(name) + "\"" : " hidden") + ">" : "");
    }
    function decBtn(r, label, d) {
      var on = !!d && d.result === r;
      return "<button type=\"button\" class=\"pop-dec pop-" + r + (on ? " on" : "") + "\" data-act=\"decide\" data-value=\"" + r + "\" aria-pressed=\"" + (on ? "true" : "false") + "\">" + esc(label) + "</button>";
    }
    function popErr(msg) { var e = pop && pop.querySelector(".pop-err"); if (e) e.textContent = msg; }
    function needPw(kind, id) { return locked && !unlocked && (kind === "decision" || (kind === "stamp" && !!id && lockFs.indexOf(id) >= 0)); }
    function pwHtml() {
      return "<div class=\"pop-lock\">最終承認にはパスワードが必要です</div>" +
        "<label class=\"pop-l\"><span>パスワード</span><input class=\"pop-pw\" type=\"password\" autocomplete=\"off\" aria-label=\"最終承認のパスワード\"></label>" +
        "<div class=\"pop-err\" role=\"alert\"></div>";
    }
    function doUnlock() {
      var inp = pop && pop.querySelector(".pop-pw"), t = anchor;
      if (!inp || !t) return;
      if (!inp.value) { popErr("パスワードを入力してください"); inp.focus(); return; }
      if (typeof verify !== "function" || !verify(LK, inp.value)) { popErr("パスワードが違います"); inp.focus(); inp.select(); return; }
      unlocked = true;
      openPop(t);
    }
    function pickPerson() {
      var sel = pop.querySelector(".pop-sel"), inp = pop.querySelector(".pop-free"), v = sel ? sel.value : "", m, nm;
      if (v === "__free") {
        nm = inp ? inp.value.trim() : "";
        if (!nm) { popErr("氏名を入力してください"); if (inp) inp.focus(); return null; }
        return { name: nm, short: shortName(nm), title: "" };
      }
      m = cfg.managers[Number(v)];
      if (!v || !m || !m.name) { popErr("担当者を選んでください"); if (sel) sel.focus(); return null; }
      return { name: m.name, short: m.short || shortName(m.name), title: m.title || "" };
    }

    function place() {
      if (!pop || !anchor) return;
      var r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, vw = de.clientWidth, vh = window.innerHeight;
      var top = r.bottom + 6;
      if (top + ph > vh - 8) top = r.top - 6 - ph >= 8 ? r.top - 6 - ph : Math.max(8, vh - ph - 8);
      var left = Math.min(Math.max(8, r.left), Math.max(8, vw - pw - 8));
      pop.style.left = (left + window.pageXOffset) + "px";
      pop.style.top = (top + window.pageYOffset) + "px";
    }
    function closePop(ret) {
      if (!pop) return;
      var t = anchor;
      if (pop.parentNode) pop.parentNode.removeChild(pop);
      pop = null; anchor = null;
      if (t) { t.removeAttribute("aria-expanded"); if (ret && de.contains(t) && t.focus) t.focus({ preventScroll: true }); }
    }
    function openPop(t) {
      var kind = t.getAttribute("data-a4-t"), h = "", sub = "", body = "", foot = "", close = "<button type=\"button\" data-act=\"close\">閉じる</button>";
      var x, e, d, st, j, nt, memo = null;
      closePop(false);
      if (kind === "stamp") {
        x = canStamp ? fieldOf(t.getAttribute("data-field-id")) : null;
        if (!x) return;
        e = stamped(x.f.id);
        h = x.f.label || x.f.id; sub = x.f.hint || "";
        if (needPw("stamp", x.f.id)) { body = pwHtml(); foot = "<button type=\"button\" class=\"primary\" data-act=\"unlock\">確認</button>" + close; }
        else body = personHtml(e ? e.name : (cfg.interviewerField && cfg.interviewerField === x.f.id && rec.checklist && rec.checklist.header ? String(rec.checklist.header.interviewer || "") : "")) +
          "<div class=\"pop-err\" role=\"alert\"></div>";
        if (!foot) foot = "<button type=\"button\" class=\"primary\" data-act=\"stamp\">押印</button>" + (e ? "<button type=\"button\" data-act=\"unstamp\">取消</button>" : "") + close;
      } else if (kind === "decision") {
        if (!canDecide) return;
        d = curDec(); st = D.stampField ? stamped(D.stampField) : null; j = rec.judgment; nt = noteText(d);
        h = D.label || "最終合否"; sub = D.hint || "";
        if (needPw("decision", "")) { body = pwHtml(); foot = "<button type=\"button\" class=\"primary\" data-act=\"unlock\">確認</button>" + close; }
        else body = personHtml((st && st.name) || (d && d.by.name) || "") +
          (j && j.result ? "<div class=\"pop-ref\">アプリの判定：" + esc(j.title || "") + "</div>" : "") +
          (nt ? "<div class=\"pop-note\">" + esc(nt) + "</div>" : "") + "<div class=\"pop-err\" role=\"alert\"></div>";
        if (!foot) foot = decBtn("hire", D.hireLabel || "採用", d) + decBtn("reject", D.rejectLabel || "不採用", d) + (d ? "<button type=\"button\" data-act=\"undecide\">取消</button>" : "") + close;
      } else if (kind === "memo") {
        memo = memoOf(t); h = memo.k; body = "<div class=\"pop-text\"></div>"; foot = close;
      } else if (kind === "memos") {
        h = "面接メモ（全文）"; body = "<dl class=\"pop-memos\"></dl>"; foot = close;
      } else return;
      pop = document.createElement("div");
      pop.className = "pop"; pop.id = "a4Pop";
      pop.setAttribute("role", "dialog"); pop.setAttribute("aria-labelledby", "a4PopH"); pop.setAttribute("data-kind", kind);
      pop.innerHTML = "<div class=\"pop-h\" id=\"a4PopH\">" + esc(h) + "</div>" + (sub ? "<div class=\"pop-sub\">" + esc(sub) + "</div>" : "") +
        "<div class=\"pop-b\">" + body + "</div><div class=\"pop-f\">" + foot + "</div>";
      if (kind === "decision") { pop.style.setProperty("--dec-hire", String(D.hireColor || "#c8232c")); pop.style.setProperty("--dec-reject", String(D.rejectColor || "#1f4e8c")); }
      if (memo) pop.querySelector(".pop-text").textContent = memo.v;
      if (kind === "memos") {
        each(sheet.querySelectorAll(".cl-nm-row"), function (row) {
          var v = row.querySelector(".cl-nm-v"), m, dt, dd;
          if (!v) return;
          m = memoOf(v); dt = document.createElement("dt"); dd = document.createElement("dd");
          dt.textContent = m.k; dd.textContent = m.v;
          pop.querySelector(".pop-memos").appendChild(dt); pop.querySelector(".pop-memos").appendChild(dd);
        });
      }
      pop.addEventListener("click", onPopClick);
      pop.addEventListener("change", onPopChange);
      pop.addEventListener("keydown", onPopKey);
      document.body.appendChild(pop);
      anchor = t; t.setAttribute("aria-expanded", "true");
      place();
      var f = pop.querySelector(".pop-pw") || pop.querySelector(".pop-sel") || pop.querySelector("[data-act=\"close\"]");
      if (f) f.focus({ preventScroll: true });
    }
    function doStamp(act) {
      var id = anchor.getAttribute("data-field-id"), p;
      if (act === "stamp") {
        p = pickPerson();
        if (!p) return;
        rec.management[id] = { name: p.name, short: p.short, title: p.title, date: today(), at: new Date().toISOString() };
      } else delete rec.management[id];
      closePop(true); changed();
    }
    function doDecide(act, r) {
      var p, dt, at;
      if (act === "undecide") { rec.decision = null; changed(); closePop(true); return; }
      if (r !== "hire" && r !== "reject") return;
      p = pickPerson();
      if (!p) return;
      dt = today(); at = new Date().toISOString();
      rec.decision = { result: r, label: r === "hire" ? D.hireLabel : D.rejectLabel, date: dt, at: at, by: { name: p.name, short: p.short, title: p.title } };
      if (D.autoStampFinal && D.stampField && fieldOf(D.stampField) && !stamped(D.stampField)) rec.management[D.stampField] = { name: p.name, short: p.short, title: p.title, date: dt, at: at };
      changed();
      if (noteText(rec.decision) && anchor) openPop(anchor); else closePop(true);
    }
    function onPopClick(ev) {
      var b = ev.target.closest ? ev.target.closest("[data-act]") : null, act, kind;
      if (!b || !pop || !pop.contains(b)) return;
      act = b.getAttribute("data-act"); kind = pop.getAttribute("data-kind");
      popErr("");
      if (act === "close") closePop(true);
      else if (act === "unlock") doUnlock();
      else if (needPw(kind, anchor ? anchor.getAttribute("data-field-id") : "")) return;
      else if (kind === "stamp" && (act === "stamp" || act === "unstamp")) doStamp(act);
      else if (kind === "decision" && (act === "decide" || act === "undecide")) doDecide(act, b.getAttribute("data-value"));
    }
    function onPopChange(ev) {
      var sel = ev.target, inp;
      if (!sel || !sel.classList || !sel.classList.contains("pop-sel")) return;
      popErr("");
      inp = pop.querySelector(".pop-free");
      if (inp) { inp.hidden = sel.value !== "__free"; if (sel.value === "__free") inp.focus(); }
      place();
    }
    function onPopKey(ev) {
      if (ev.key === "Enter" && ev.target.classList && ev.target.classList.contains("pop-pw")) { ev.preventDefault(); popErr(""); doUnlock(); return; }
      if (ev.key === "Enter" && ev.target.classList && ev.target.classList.contains("pop-free") && pop.getAttribute("data-kind") === "stamp") { ev.preventDefault(); popErr(""); doStamp("stamp"); }
    }
    function targetOf(ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-a4-t]") : null;
      return t && sheet.contains(t) ? t : null;
    }

    function exportHtml() {
      closePop(false);
      recNode.textContent=JSON.stringify(rec).replace(/[<>&\u2028\u2029]/g,function(c){return "\\u"+("000"+c.charCodeAt(0).toString(16)).slice(-4);});
      var root = de.cloneNode(true), bd = root.querySelector("body");
      each(root.querySelectorAll(".pop,.savebar"), function (n) { n.parentNode.removeChild(n); });
      each(root.querySelectorAll("[data-a4-t]"), unmark);
      if (bd) {
        bd.classList.remove("a4-live"); bd.classList.remove("a4-sb"); bd.style.removeProperty("--a4-sbh");
        if (!bd.getAttribute("style")) bd.removeAttribute("style");
      }
      root.style.removeProperty("--a4-zoom");
      if (!root.getAttribute("style")) root.removeAttribute("style");
      var html = "<!DOCTYPE html>\n" + root.outerHTML;
      var blob = new Blob([html], { type: "text/html;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = document.body.getAttribute("data-filename") || "applicant.html";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      dirty = false; saved = true; renderBar();
    }

    document.body.classList.add("a4-live");
    sheet.addEventListener("click", function (ev) {
      var t = targetOf(ev);
      if (!t) return;
      if (pop && anchor === t) closePop(true); else openPop(t);
    });
    sheet.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Spacebar") return;
      var t = targetOf(ev);
      if (!t || t !== ev.target) return;
      ev.preventDefault();
      if (pop && anchor === t) closePop(true); else openPop(t);
    });
    document.addEventListener("mousedown", function (ev) {
      if (!pop || pop.contains(ev.target) || (anchor && anchor.contains(ev.target))) return;
      closePop(false);
    }, true);
    document.addEventListener("keydown", function (ev) {
      if (pop && (ev.key === "Escape" || ev.key === "Esc")) { ev.preventDefault(); closePop(true); }
    });
    window.addEventListener("resize", function () {
      if (rz) return;
      rz = window.requestAnimationFrame(function () { rz = 0; scale(); if (pop) place(); if (bar) barSpace(); });
    });
    window.addEventListener("load", refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
    window.__a4Fit = fit;
    render();
  }

  global.RecruitStorage = {
    PROFILE_KEY: PROFILE_KEY,
    defaults: defaults,
    normalizeProfile: normalizeProfile,
    validateProfile: validateProfile,
    normalizeChecklistDef: normalizeChecklistDef,
    checklistSheetHtml: checklistSheetHtml,
    checklistSheetCss: checklistSheetCss,
    fitChecklistSheet: fitChecklistSheet,
    CL_SHEET_LIMIT_PX: CL_SHEET_LIMIT_PX,
    brandLogo: brandLogo,
    checklistShortLabel: function (it) { return clShortOf(it, clDefaultItems()); },
    // 面接記入シート（手書き用。docs/SPEC-persona.md 5 章）
    paperSheetHtml: paperSheetHtml,
    paperSheetCss: paperSheetCss,
    fitPaperSheet: fitPaperSheet,
    reportCss: reportCss,
    normalizeDecision: normalizeDecision,
    decisionConfig: decisionConfig,
    finalLockFields: finalLockFields,
    finalLockScope: finalLockScope,
    lockUnset: lockUnset,
    normalizeLock: normalizeLock,
    loadProfile: loadProfile,
    saveProfile: saveProfile,
    resetProfile: resetProfile,
    parseProfileJSON: parseProfileJSON,
    loadTheme: loadTheme,
    saveTheme: saveTheme,
    download: download,
    safeName: safeName,
    buildRecord: buildRecord,
    parseRecordFromHTML: parseRecordFromHTML,
    normalizeRecord: normalizeRecord,
    generateReportHTML: generateReportHTML
  };
})(window);
