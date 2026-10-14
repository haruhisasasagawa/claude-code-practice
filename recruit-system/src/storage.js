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
    return U.deepClone(global.RECRUIT_DEFAULT_PROFILE);
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
      decision: Object.assign({}, U.deepClone(dsrc), decisionFields(dsrc, fields, bm.decision))
    };
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
    return out;
  }

  // 旧プロファイル（checklist なし・壊れた checklist）には既定の台本を補う
  function fillChecklist(raw, base) {
    const rc = raw.checklist;
    if (!U.isObj(rc) || !clHasSections(rc)) return U.deepClone(base.checklist);
    return normalizeChecklistDef(U.deepClone(U.deepMerge(base.checklist, rc)), base.checklist);
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
    const hd = U.isObj(cl.header) ? cl.header : {};
    if (!ratingN) warnings.push('確認点がありません。面接評価は総合判断だけで決まります。');
    if (!mustN) warnings.push('必須条件がないため、不一致による不採用推奨は働きません。');
    const mfields = (((p.management || {}).fields) || []).map(function (f) { return f && f.id; });
    if (hd.interviewerField && mfields.indexOf(hd.interviewerField) < 0) warnings.push('担当と連動する押印欄が見つかりません。');
  }
  // ---------- プロファイルの正規化（docs/SPEC-slim.md 3-1） ----------
  // 許可したキーだけを組み立てる（トップレベルは schemaVersion, meta, features, management, options, evaluation, checklist, texts の 8 個）。
  // 2026-10-14 に削除した機能の設定（REMOVED_KEYS など）は読み飛ばす。
  // report を渡すと次を入れる: v1Reset（v1 は移行せず既定値）・fullModeRemoved（mode: 'full' の設定だった）・stripped（読み飛ばしたキーがあった）。
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
    out.checklist = fillChecklist(raw, base);
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
      if (REMOVED_KEYS.some(function (k) { return raw[k] !== undefined; }) || (Object.keys(raw).length && JSON.stringify(out) !== JSON.stringify(raw))) report.stripped = true;
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

  function parseRecordFromHTML(html) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const node = doc.querySelector('script#recruit-record[type="application/json"]');
      if (!node) return null;
      const rec = JSON.parse(node.textContent);
      if (!rec || rec.kind !== RECORD_KIND) return null;
      // 最終合否は正規化して返す（キーの無い旧レコード・不正値は null）
      rec.decision = normalizeDecision(rec.decision);
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

  // ---------- HTML レポートのスタイル（アプリと同じデザイントークン。印刷・共有向けにライトテーマ固定） ----------
  function reportCss() {
    return [
      ':root{--bg:#f3f5f8;--surface:#fff;--surface-2:#f8fafc;--surface-3:#eef2f6;--text:#1a2233;--muted:#5b6675;--border:#dde3ea;--accent:#1f5fbf;--accent-soft:#e6eefb;--ok:#0e9f6e;--ok-soft:#e3f6ee;--warn:#d97706;--warn-soft:#fdf1dc;--danger:#dc2626;--danger-soft:#fde8e8;color-scheme:light}',
      '*{box-sizing:border-box}',
      'body{margin:0;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP",system-ui,sans-serif;font-size:14px;line-height:1.6;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}',
      '.page{max-width:900px;margin:0 auto;padding:28px 20px 48px;counter-reset:sec}',
      'h1,h2,h3,p{margin:0}',
      // ヘッダー
      '.rh{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.1)}',
      '.rh-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid var(--border);background:var(--surface-2);font-size:12px;color:var(--muted)}',
      '.rh-brand{display:flex;align-items:center;gap:10px;color:var(--text)}',
      '.rh-mark{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--accent),#6f3fd1);color:#fff;font-weight:800;display:grid;place-items:center;font-size:14px;flex:none}',
      '.rh-theater{font-weight:700;font-size:13.5px;line-height:1.3}.rh-app{font-size:11.5px;color:var(--muted);line-height:1.3}',
      '.rh-meta{text-align:right;line-height:1.5}',
      '.rh-main{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px 22px;flex-wrap:wrap}',
      '.rh-main>div:first-child{flex:1 1 400px;min-width:0}.rh-main>.verdict{flex:0 0 auto}',
      '.rh-kicker{font-size:11.5px;font-weight:700;letter-spacing:.08em;color:var(--muted)}',
      '.rh-name{font-size:28px;font-weight:800;line-height:1.2;margin:2px 0 8px}.rh-name small{font-size:14px;font-weight:600;color:var(--muted);margin-left:4px}',
      '.rh-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;background:var(--surface-3);font-size:12px;font-weight:600;color:var(--text)}',
      '.verdict{display:flex;flex-direction:column;align-items:flex-end;gap:2px;padding:12px 18px;border-radius:12px;border:2px solid var(--border);background:var(--surface-2);min-width:230px}',
      '.verdict .v-kicker{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--muted)}',
      '.verdict .v-title{font-size:22px;font-weight:800;line-height:1.25}',
      '.verdict .v-sub{font-size:12.5px;color:var(--muted)}',
      '.verdict.recommend{border-color:var(--ok);background:var(--ok-soft)}.verdict.recommend .v-title{color:var(--ok)}',
      '.verdict.review{border-color:var(--warn);background:var(--warn-soft)}.verdict.review .v-title{color:var(--warn)}',
      '.verdict.reject{border-color:var(--danger);background:var(--danger-soft)}.verdict.reject .v-title{color:var(--danger)}',
      // セクション
      '.sec{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 22px 20px;margin-top:16px;box-shadow:0 1px 2px rgba(16,24,40,.05)}',
      '.sec h2{font-size:15px;font-weight:700;display:flex;align-items:center;gap:10px;padding-bottom:10px;margin-bottom:14px;border-bottom:1px solid var(--border)}',
      '.sec h2::before{counter-increment:sec;content:counter(sec);display:inline-grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--accent-soft);color:var(--accent);font-size:12.5px;font-weight:800;flex:none}',
      '.sec h3{font-size:12.5px;font-weight:700;letter-spacing:.04em;color:var(--muted);margin:18px 0 8px;padding-bottom:5px;border-bottom:1px dashed var(--border)}',
      // 項目表
      'table.kv{width:100%;border-collapse:collapse;font-size:13.5px}',
      'table.kv th{width:10em;text-align:left;font-weight:600;color:var(--muted);padding:7px 10px 7px 0;vertical-align:top;border-bottom:1px solid var(--surface-3)}',
      'table.kv td{padding:7px 0;vertical-align:top;border-bottom:1px solid var(--surface-3)}',
      'table.kv tr:last-child th,table.kv tr:last-child td{border-bottom:none}',
      // 所見・空の段落
      '.note{white-space:pre-wrap;background:var(--surface-2);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:8px;padding:12px 14px;font-size:14px;line-height:1.7}',
      '.empty{color:var(--muted);font-size:13.5px}',
      // 判定
      '.result{border:2px solid var(--border);border-radius:12px;padding:18px 20px;background:var(--surface)}',
      '.result.recommend{border-color:var(--ok);background:linear-gradient(180deg,var(--ok-soft),#fff 60%)}.result.review{border-color:var(--warn);background:linear-gradient(180deg,var(--warn-soft),#fff 60%)}.result.reject{border-color:var(--danger);background:linear-gradient(180deg,var(--danger-soft),#fff 60%)}',
      '.result-kicker{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--muted)}',
      '.result-title{font-size:24px;font-weight:800;margin:2px 0 6px}',
      '.result.recommend .result-title{color:var(--ok)}.result.review .result-title{color:var(--warn)}.result.reject .result-title{color:var(--danger)}',
      '.result-body{font-size:14.5px}',
      '.adj{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}',
      '.adj li{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.75);border:1px solid var(--border);font-size:13px}',
      '.adj .step{white-space:nowrap;font-weight:700;color:var(--muted)}',
      '.adj-head{margin-top:14px;font-size:13px;font-weight:700}',
      '.warn-list{margin:10px 0 0;padding-left:1.3em;font-size:13px}.warn-list li{margin-bottom:3px}',
      '.disclaimer{margin-top:12px;font-size:12px;color:var(--muted)}',
      '.foot{margin-top:28px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);line-height:1.6;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      // 押印欄
      '.stamp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
      // 押印欄が 2 つ（既定）のときは 2 列（docs/SPEC-slim.md D10）
      '.stamp-row.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.stamp-box{border:1px solid var(--border);border-radius:10px;padding:12px 10px 10px;text-align:center;background:var(--surface-2);min-width:0}',
      '.stamp-label{font-size:12.5px;font-weight:700;color:var(--muted)}.stamp-hint{font-size:11px;color:var(--muted);margin-bottom:6px;line-height:1.4}',
      '.stamp-area{height:100px;display:grid;place-items:center}',
      '.stamp-empty{width:84px;height:84px;border:2px dashed #c7d0db;border-radius:50%;display:grid;place-items:center;font-size:11px;color:var(--muted);background:#fff}',
      '.hanko{mix-blend-mode:multiply}',
      '.stamp-meta{font-size:12px;color:var(--muted);min-height:1.3em;line-height:1.4}',
      '.stamp-ctl{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:8px}',
      '.stamp-ctl select,.stamp-ctl input{font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid #c7d0db;border-radius:6px;max-width:100%;background:#fff;color:var(--text)}',
      '.stamp-ctl input{width:100%}',
      '.stamp-ctl button,.mgmt-save button{font:inherit;font-size:12.5px;font-weight:700;padding:5px 11px;border-radius:6px;border:1px solid #c7d0db;background:#fff;color:var(--text);cursor:pointer}',
      '.stamp-ctl button.primary,.mgmt-save button{background:var(--accent);color:#fff;border-color:var(--accent)}',
      '.stamp-ctl button:hover{filter:brightness(.97)}',
      '.mgmt-save{display:none;margin-top:12px;padding:10px 14px;border-radius:8px;background:var(--warn-soft);border:1px solid #f3cf8a;font-size:13px;align-items:center;gap:10px;flex-wrap:wrap}.mgmt-save.show{display:flex}',
      '.mgmt-note{font-size:12px;color:var(--muted);margin-top:10px}',
      '@media (max-width:720px){.stamp-row,.stamp-row.cols-2{grid-template-columns:1fr}}',
      // 表示切替・印刷のツールバー
      '.rtool{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-size:12.5px;color:var(--muted)}',
      '.rtool button{font:inherit;font-size:12.5px;font-weight:700;padding:5px 11px;border-radius:6px;border:1px solid #c7d0db;background:#fff;color:var(--text);cursor:pointer}.rtool button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.rtool-hint{font-size:11.5px}',
      // 表示切替（報告書／詳細）と報告書表示（docs/SPEC-report.md 5-1）。報告書表示の規則は画面だけ・A4 の印刷準備中（print-checklist）は外す
      '.rtool-view{display:inline-flex;border:1px solid #c7d0db;border-radius:7px;overflow:hidden;background:#fff}',
      '.rtool .rtool-view button{border:none;border-radius:0;padding:5px 14px;color:var(--muted);background:#fff}',
      '.rtool .rtool-view button+button{border-left:1px solid #c7d0db}',
      '.rtool .rtool-view button.on{background:#24324a;color:#fff}',
      '.rtool-sep{width:1px;height:20px;background:var(--border);margin:0 4px}',
      '.paper-wrap{display:none}',
      '.paper-cap{display:flex;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;width:210mm;max-width:100%;margin:0 auto 6px;font-size:12px;color:var(--muted)}.paper-cap b{color:var(--text)}',
      '.paper{box-sizing:content-box;width:190mm;margin:0 auto;padding:10mm;background:#fff;color:#111;border:1px solid #d5dbe3;border-radius:2px;box-shadow:0 1px 2px rgba(16,24,40,.08),0 12px 32px rgba(16,24,40,.12)}',
      '@media screen{',
      'body.view-report.has-cl:not(.print-checklist) .page>:not(.rtool):not(.paper-wrap):not(section[data-sec="mgmt"]):not(.foot){display:none}',
      'body.view-report.has-cl:not(.print-checklist) .paper-wrap{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 2px 14px}',
      'body.view-report.has-cl:not(.print-checklist) section.sec[data-sec="mgmt"]{max-width:210mm;margin:12px auto 0}',
      'body.view-report.has-cl:not(.print-checklist) section.sec[data-sec="mgmt"] h2::before{display:none}',
      '}',
      // 最終合否パネル（「応募者の管理」節の先頭）
      '.decision{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 18px;align-items:center;padding:12px 16px;margin:0 0 14px;border:1px solid var(--border);border-left:4px solid #24324a;border-radius:10px;background:var(--surface-2)}',
      '.decision.is-hire{border-left-color:var(--dec-hire,#c8232c)}.decision.is-reject{border-left-color:var(--dec-reject,#1f4e8c)}',
      '.dec-head{grid-column:1/-1;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.dec-title{font-size:14px;font-weight:800}.dec-hint{font-size:12px;color:var(--muted)}',
      '.dec-stamp{width:124px;height:80px;display:grid;place-items:center}',
      '.dec-empty{width:116px;height:70px;border:2px dashed #c7d0db;border-radius:9px;display:grid;place-items:center;font-size:12px;font-weight:700;color:var(--muted);background:#fff}',
      '.dec-body{min-width:0;display:flex;flex-direction:column;gap:8px}',
      '.dec-meta{font-size:13.5px;font-weight:700;min-height:1.4em}.dec-meta:empty::before{content:"まだ押されていません";color:var(--muted);font-weight:600}',
      '.dec-note{font-size:12.5px;color:#9a5b00;background:var(--warn-soft);border:1px solid #f3cf8a;border-radius:6px;padding:4px 10px}.dec-note:empty{display:none}',
      '.dec-ctl{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.dec-ctl select,.dec-ctl input{font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid #c7d0db;border-radius:6px;background:#fff;color:var(--text);max-width:100%}',
      '.dec-ctl button{font:inherit;font-size:13px;font-weight:800;padding:5px 16px;border-radius:6px;cursor:pointer;background:#fff;color:var(--text);border:1px solid #c7d0db}',
      '.dec-ctl .dec-btn{color:var(--dec);border:1.5px solid var(--dec)}.dec-ctl .dec-hire{--dec:var(--dec-hire,#c8232c)}.dec-ctl .dec-reject{--dec:var(--dec-reject,#1f4e8c)}',
      '.dec-ctl .dec-btn:hover,.dec-ctl .dec-btn.on{background:var(--dec);color:#fff}',
      '.verdict-stamp{mix-blend-mode:multiply}',
      '.rh-decision{flex:0 0 auto;display:grid;place-items:center}.rh-decision:empty{display:none}',
      '@media (max-width:720px){.decision{grid-template-columns:1fr}}',
      '@media print{.paper-wrap,.dec-ctl,.dec-hint{display:none !important}.decision.is-none{display:none !important}body.print-checklist #decision{display:none !important}.decision{break-inside:avoid;padding:6px 10px;margin-bottom:8px;gap:4px 12px}.dec-stamp{width:100px;height:64px}.dec-stamp .verdict-stamp{width:96px;height:61px}.decision,.verdict-stamp,.dec-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
      '@media print{.rtool{display:none !important}}',
      '@media print{.stamp-ctl,.mgmt-save,.mgmt-note{display:none !important}.stamp-row{break-inside:avoid}.hanko,.stamp-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
      '@media (max-width:720px){.rh-main{flex-direction:column;align-items:stretch}.verdict{align-items:flex-start}.rh-top{flex-direction:column;align-items:flex-start}.rh-meta{text-align:left}}',
      // 「詳細」の印刷（ブラウザの既定の印刷）: 画面用の余白を詰め、大きなブロックは途中で改ページ可にして各ページ下部の空白を減らす
      '@media print{@page{size:A4;margin:10mm 11mm}body{background:#fff;font-size:11px;line-height:1.45}.page{padding:0;max-width:none}',
      '.rh,.sec,.result{box-shadow:none}.rh{border-radius:8px}.rh-top{padding:5px 14px}.rh-main{padding:8px 14px;gap:12px}.rh-name{font-size:19px;margin:0 0 4px}.rh-chips{gap:4px}.chip{font-size:10.5px;padding:1px 8px}.verdict{padding:6px 12px;min-width:170px;gap:0}.verdict .v-title{font-size:16px}',
      '.sec{margin-top:8px;padding:9px 14px 11px;border-radius:8px}.sec h2{font-size:12.5px;margin-bottom:7px;padding-bottom:5px}.sec h2::before{width:20px;height:20px;font-size:11px}.sec h3{margin:9px 0 5px}',
      'table.kv th,table.kv td{padding:2px 8px 2px 0}table.kv tr{break-inside:avoid}.note{padding:7px 11px}',
      '.result{padding:11px 14px;break-inside:auto}.result-title{font-size:18px}.adj{margin-top:8px}.adj li{padding:5px 10px}',
      '.stamp-row{gap:8px}.stamp-box{padding:8px}.stamp-area{height:80px}.hanko{width:70px;height:70px}.stamp-empty{width:66px;height:66px}.foot{margin-top:12px}',
      '.note,.stamp-row,.adj li{break-inside:avoid}.sec h2,.sec h3,.result-kicker,.result-title,.result-body{break-after:avoid}',
      '.verdict,.result,.rh-mark,.sec h2::before{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    ].join('\n');
  }
  // ---------- 面接チェックリスト（報告書の描画。アプリの A4 報告・保存レポートで共用。docs/SPEC-checklist.md 4-2） ----------
  //   DOM 非依存の HTML 文字列を返す。o = { mode: 'section' | 'sheet', stamps: html文字列 | '', decisionId, decisionSvgId }
  //   'section' = 保存レポート「詳細」の「面接チェックリスト」節（台本の全文）
  //   'sheet'   = A4「面接チェックリスト報告」（1 ページの要約。台本の説明文・質問文・空の記入欄は載せない。2026-10-14）
  const CL_SHEET_PAGE_PX = 1040;   // A4 の印字可能高さ（297mm − 上下余白 16mm ≒ 1062px）の安全側
  const CL_SHEET_STAMPS_PX = 90;   // 押印行（アプリ: .cl-stamps／保存 HTML: 直後に印刷する押印の節）に取っておく高さ（押印欄 3 件まで＝1 段。既定は 2 件）
  const CL_SHEET_STAMP_ROW_PX = 60;   // 押印欄が 4 件以上（1 段 3 件で 2 段目以降）のとき 1 段ごとに足す高さ（実測 1 段 ≒ 56px）
  const CL_SHEET_BODY_PX = CL_SHEET_PAGE_PX - CL_SHEET_STAMPS_PX;   // 押印欄 3 件までの本文の上限。超えたら .cl-compact → .cl-compact-q1 → .cl-compact-2
  // 押印行を除いた本文の上限（押印欄の件数で決める。アプリの紙プレビュー・印刷用、保存 HTML の紙プレビュー・印刷用で同じ値を使う）
  function checklistSheetLimit(nStamps) {
    const rows = Math.max(1, Math.ceil((Number(nStamps) || 0) / 3));
    return CL_SHEET_BODY_PX - (rows - 1) * CL_SHEET_STAMP_ROW_PX;
  }
  const CL_TONE_CLASS = { ok: 't-ok', warn: 't-warn', danger: 't-danger', info: 't-info', muted: 't-muted' };
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

  // 1 ページ保証（docs/SPEC-checklist.md 4-4）。.cl-sheet の高さ（押印行 .cl-stamps とその上の余白を除く）が limit を超えたら次の順に詰める。
  //   .cl-compact（本文 9px・余白を詰める。質問の回答は 2 行のまま、面接所見は 10 行まで）→
  //   .cl-compact-q1（質問の回答・メモを 1 行、面接所見は 6 行まで）→ .cl-compact-2（質問の回答を省いて案内 1 行、面接所見は 4 行まで）→
  //   縮小（zoom。縮小後の高さを測り直し、上限に収まるまで下げる）。
  //   面接メモ・確認点のメモが「…」で切れたら .cl-nm-cut を付けて案内 1 行（全文は保存 HTML の「詳細」）を出す（案内の高さも含めて計る）。
  //   紙プレビュー（#appPaper／#clPaper）と印刷用（#clSheet）の両方に使う。
  //   保存 HTML にソースをそのまま埋め込むため、外部参照なしの ES5 で書く（関数内にコメントを書かない）
  function clFitSheet(sheet, limit) {
    if (!sheet || !sheet.getBoundingClientRect) return '';
    var cls = sheet.classList;
    var lv = ['cl-compact', 'cl-compact-q1', 'cl-compact-2'];
    var i, h, z, n;
    var hOf = function () {
      var r = sheet.getBoundingClientRect(), st = sheet.querySelector('.cl-stamps'), pv = st && st.previousElementSibling;
      return st ? (pv ? pv.getBoundingClientRect().bottom - r.top : 0) : r.height;
    };
    var cut = function () {
      var vs = sheet.querySelectorAll('.cl-nm-v,.cl-rt-nt'), c = false, k, v;
      for (k = 0; k < vs.length && !c; k++) {
        v = vs[k];
        if (v.getClientRects().length && (v.scrollHeight > v.clientHeight + 1 || v.scrollWidth > v.clientWidth + 1)) c = true;
      }
      if (c) cls.add('cl-nm-cut'); else cls.remove('cl-nm-cut');
    };
    for (i = 0; i < lv.length; i++) cls.remove(lv[i]);
    sheet.style.zoom = '';
    cut();
    h = hOf();
    if (!h || h <= limit) return '';
    for (i = 0; i < lv.length; i++) {
      cls.add(lv[i]);
      cut();
      h = hOf();
      if (h <= limit) return lv[i];
    }
    z = 1;
    for (n = 0; n < 12 && h > limit && z > 0.3; n++) {
      z = Math.max(0.3, Math.floor(z * limit / h * 1000) / 1000 - (n ? 0.005 : 0));
      sheet.style.zoom = String(z);
      h = hOf();
    }
    return 'zoom';
  }
  function fitChecklistSheet(sheet, limit) {
    return clFitSheet(sheet, typeof limit === 'number' && limit > 0 ? limit : CL_SHEET_BODY_PX);
  }

  function checklistSheetHtml(record, profile, o) {
    const R = global.RecruitRules;
    const esc = U.esc;
    o = o || {};
    record = record || {};
    profile = profile || defaults();
    const mode = o.mode === 'sheet' ? 'sheet' : 'section';
    const a = record.applicant || {};
    const cl = U.isObj(record.checklist) ? record.checklist : R.emptyChecklist();
    const def = normalizeChecklistDef(record.checklistDef || profile.checklist, defaults().checklist);
    const prof = Object.assign({}, profile, { checklist: def });
    const sum = R.checklistSummary(a, cl, prof, { management: record.management });
    if (mode === 'sheet') return clOnePageHtml(record, profile, o, def, sum);

    // ---- 以下 'section'（保存レポート「詳細」の節。台本の全文） ----
    const showQ = !(U.isObj(def.print) && def.print.showQuestions === false);
    const tone = function (t) { return CL_TONE_CLASS[t] || ''; };
    const dash = '<span class="cl-blank">—</span>';
    const txt = function (v) { const s = asStr(v).trim(); return s ? esc(s) : dash; };
    const mustCountsText = function (m) {
      return '一致 ' + m.match + '・不一致 ' + m.mismatch + '・未確認 ' + m.unknown;
    };
    const sc = sum.score;
    const cnt = sc.counts || { good: 0, fair: 0, poor: 0, blank: 0 };
    const scoreText = sc.total + ' / ' + sc.max + '点（' + sc.pct + '%' + (sc.bandLabel ? '・' + sc.bandLabel : '') + '）';
    const markCounts = '○' + cnt.good + ' △' + cnt.fair + ' ×' + cnt.poor + (cnt.blank ? ' 未入力' + cnt.blank : '');

    // ---- ブロック ----
    const blockTitle = function (b, fallback) {
      const t = b.title || fallback || '';
      return (t || b.note) ? '<div class="cl-bt">' + (t ? '【' + esc(t) + '】' : '') + (b.note ? '<small>' + esc(b.note) + '</small>' : '') + '</div>' : '';
    };
    const blockHtml = function (b) {
      if (b.type === 'must') {
        return '<div class="cl-b cl-b-must">' + blockTitle(b, '必須条件') + '<table class="cl-must"><tbody>' + b.items.map(function (it) {
          return '<tr class="' + tone(it.tone) + '"><td class="cl-lbl">' + esc(it.label) + '</td><td class="cl-val">' + esc(it.mark + it.valueLabel) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      }
      if (b.type === 'fields') {
        return '<div class="cl-b cl-b-fields">' + blockTitle(b) + '<dl class="cl-fields">' + b.items.map(function (it) {
          let v = it.effectiveLabel != null ? it.effectiveLabel : asStr(it.effective);
          if (it.kind === 'date') v = clFmtDate(v);
          else if (it.kind === 'month') v = clFmtMonth(v);
          return '<div><dt>' + esc(it.label) + '</dt><dd>' + (asStr(v).trim() ? esc(v) : dash) + '</dd></div>';
        }).join('') + '</dl></div>';
      }
      if (b.type === 'explain' || b.type === 'notify') {
        return '<div class="cl-b cl-b-' + b.type + '">' + blockTitle(b, b.type === 'notify' ? '合否連絡' : '説明') + '<ul class="cl-checks">' + b.items.map(function (it) {
          return '<li class="' + (it.value ? 'on' : 'off') + (it.dim ? ' dim' : '') + '"><span class="cl-box">' + (it.value ? '☑' : '☐') + '</span><span>' +
            (it.shortOnly ? '※' : '') + esc(it.label) + '</span></li>';
        }).join('') + '</ul>' + (b.memo ? '<div class="cl-memo"><b>' + esc(b.memoLabel || 'メモ') + '：</b><span class="cl-memo-t">' + txt(b.memoText) + '</span></div>' : '') + '</div>';
      }
      if (b.type === 'question') {
        const qs = showQ && b.items.length ? '<ol class="cl-qs">' + b.items.map(function (it) { return '<li>' + esc(it.label) + '</li>'; }).join('') + '</ol>' : '';
        const memo = b.memo ? '<div class="cl-memo"><b>' + esc(b.memoLabel || 'メモ') + '：</b><span class="cl-memo-t">' + txt(b.memoText) + '</span></div>' : '';
        if (!qs && !memo) return '';
        return '<div class="cl-b cl-b-question">' + (showQ ? blockTitle(b) : '') + qs + memo + '</div>';
      }
      if (b.type === 'rating') {
        return '<div class="cl-b cl-b-rating">' + blockTitle(b, '確認点') + '<table class="cl-rate"><tbody>' + b.items.map(function (it) {
          return '<tr class="' + (it.value ? tone(it.tone) : 't-blank') + '" data-cl-item="' + esc(it.id) + '"><td class="cl-lbl">' + esc(it.label) +
            (it.hint ? '<small class="cl-hint">' + esc(it.hint) + '</small>' : '') + '</td>' +
            '<td class="cl-mk">' + (it.value ? esc(it.mark) : '<small>未入力</small>') + '</td>' +
            '<td class="cl-pt">' + (it.points == null ? '' : esc(it.points) + '点') + '</td>' +
            '<td class="cl-nt">' + (asStr(it.note).trim() ? esc(it.note) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      }
      if (b.type === 'note') return b.note ? '<p class="cl-sflow">→ ' + esc(b.note) + '</p>' : '';
      return '';
    };

    // ---- セクション ----
    const secHtml = function (s) {
      const must = s.blocks.filter(function (b) { return b.type === 'must'; });
      let mm = 0, mu = 0, mo = 0, rg = 0, rf = 0, rp = 0, rb = 0;
      must.forEach(function (b) { b.items.forEach(function (it) { if (it.value === 'match') mo++; else if (it.value === 'mismatch') mm++; else mu++; }); });
      s.blocks.forEach(function (b) {
        if (b.type !== 'rating') return;
        b.items.forEach(function (it) { if (it.value === 'good') rg++; else if (it.value === 'fair') rf++; else if (it.value === 'poor') rp++; else rb++; });
      });
      const sumParts = [];
      if (rg + rf + rp + rb) sumParts.push('確認点 ○' + rg + ' △' + rf + ' ×' + rp + (rb ? ' 未入力' + rb : ''));
      if (mo + mm + mu) sumParts.push('必須 一致' + mo + (mm ? ' 不一致' + mm : '') + (mu ? ' 未確認' + mu : ''));
      const twoCol = s.blocks.some(function (b) { return b.type === 'must' || b.type === 'fields'; });
      let body;
      if (twoCol) {
        const left = s.blocks.filter(function (b) { return b.type === 'must' || b.type === 'fields'; }).map(blockHtml).join('');
        const right = s.blocks.filter(function (b) { return b.type === 'explain' || b.type === 'question' || b.type === 'notify'; }).map(blockHtml).join('');
        const rest = s.blocks.filter(function (b) { return b.type === 'rating' || b.type === 'note'; }).map(blockHtml).join('');
        body = '<div class="cl-2col"><div class="cl-col">' + left + '</div><div class="cl-col">' + right + '</div></div>' + rest;
      } else {
        body = s.blocks.map(blockHtml).join('');
      }
      return '<section class="cl-s' + (mm ? ' cl-s-ng' : '') + '" data-cl-sec="' + esc(s.id) + '">' +
        '<h3 class="cl-s-h"><span class="cl-s-no">' + esc(s.noMark) + '</span><span class="cl-s-title">' + esc(s.title) + '</span>' +
        (s.minutesText ? '<small class="cl-s-min">' + esc(s.minutesText) + '</small>' : '') +
        (sumParts.length ? '<span class="cl-s-sum">' + esc(sumParts.join(' ／ ')) + '</span>' : '') + '</h3>' +
        (s.lead ? '<p class="cl-s-lead">' + esc(s.lead) + '</p>' : '') +
        '<div class="cl-s-body">' + body + '</div></section>';
    };

    // ---- ページ（台本の 1 枚目・2 枚目）。section.page の出現順にまとめる ----
    const pageNos = [];
    sum.sections.forEach(function (s) { if (pageNos.indexOf(s.page) < 0) pageNos.push(s.page); });
    const pagesHtml = pageNos.map(function (no) {
      const pg = (sum.pages || []).find(function (x) { return U.isObj(x) && Number(x.no) === no; }) || {};
      // 台本の各ページの題名・前書き（例: 必須条件一致・継続性／人物確認・逆質問）
      const head = (pg.title || pg.lead)
        ? '<div class="cl-page-h"><span class="cl-page-no">台本' + esc(no) + '枚目</span><span class="cl-page-t">' + esc(pg.title || '') + '</span>' +
          (pg.lead ? '<span class="cl-page-lead">' + esc(pg.lead) + '</span>' : '') + '</div>'
        : '';
      return '<div class="cl-page" data-page="' + esc(no) + '">' + head +
        sum.sections.filter(function (s) { return s.page === no; }).map(secHtml).join('') + '</div>';
    }).join('');

    // ---- 総合判断・面接評価・必須条件・面接所見 ----
    const m = sum.must;
    const mustDetail = [];
    if (m.mismatchLabels.length) mustDetail.push('不一致: ' + m.mismatchLabels.join('、'));
    if (m.unknownLabels.length) mustDetail.push('未確認: ' + m.unknownLabels.join('、'));
    const overallHtml = '<div class="cl-overall">' +
      '<div class="cl-ov-row"><span class="cl-ov-k">' + esc(def.overallLabel || '面接者の総合判断') + '</span><span class="cl-ov-v ' + tone(sum.overall.tone) + '">' + (sum.overall.value ? esc(sum.overall.label) : '未入力') + '</span></div>' +
      '<div class="cl-ov-row"><span class="cl-ov-k">面接評価</span><span class="cl-ov-v">' + esc(scoreText) + '　<small>' + esc(markCounts) + '</small></span></div>' +
      (m.total ? '<div class="cl-ov-row"><span class="cl-ov-k">必須条件</span><span class="cl-ov-v ' + (m.mismatch ? 't-danger' : m.unknown ? 't-muted' : 't-ok') + '">' + esc(mustCountsText(m)) +
        (mustDetail.length ? '<small>（' + esc(mustDetail.join('／')) + '）</small>' : '') + '</span></div>' : '') +
      '<div class="cl-ov-row cl-ov-notes"><span class="cl-ov-k">面接所見</span><span class="cl-ov-v cl-memo-t">' + txt(record.interviewNotes) + '</span></div>' +
      '</div>';

    // ---- 台本ヘッダー（面接日・担当・応募した求人・タクシー可否・料金） ----
    //   消極属性は 2026-10-13 に削除（旧レコードの header.negatives は読み飛ばす。docs/SPEC-script-mode.md 12 章）
    const hd = sum.header;
    const chips = [];
    const postingChip = '<span class="cl-hchip"><b>' + esc(((def.header || {}).posting || {}).label || '応募した求人') + '</b>' + txt(hd.postingLabel) + '</span>';
    const taxiChip = '<span class="cl-hchip ' + tone(hd.taxi.tone) + '"><b>タクシー可否・料金</b>' + txt(hd.taxi.text) + '</span>';
    // 応募者の属性の順（求人 → タクシー）
    chips.push(postingChip, taxiChip);
    const kvHtml = '<dl class="cl-sh-kv"><div><dt>面接日</dt><dd>' + (hd.date ? esc(clFmtDate(hd.date)) : dash) + '</dd></div>' +
      '<div><dt>担当</dt><dd>' + txt(hd.interviewer) + (hd.interviewerFromStamp ? '<small>（押印より）</small>' : '') + '</dd></div></dl>';

    const secHead = '<div class="cl-sheet-head cl-sec-head">' + kvHtml + '<div class="cl-sh-chips">' + chips.join('') + '</div></div>';
    return '<div class="cl-sheet cl-mode-section">' + secHead + pagesHtml + overallHtml + '</div>';
  }

  // ---- A4「面接チェックリスト報告」（1 ページの要約。docs/SPEC-checklist.md 4-2） ----
  //   上から: ヘッダー帯 → 応募者（2 行）→ 結果ストリップ（結果・総合判断・必須条件・確認点・最終合否、調整 1 行）→
  //   必須条件｜勤務条件の確認 → 確認点（7 行）→ 面接メモ（記入があるものだけ）→ 説明・連絡（1 行）→ 押印行
  //   色は結果・○△×（必須条件の一致／不一致を含む）・最終合否だけ。他はグレースケール
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

    // ---- 1. ヘッダー帯 ----
    const created = U.fmtDate(record.savedAt ? new Date(record.savedAt) : new Date());
    const bandHtml = '<div class="cl-band"><span class="cl-band-t">面接チェックリスト報告</span>' +
      '<span class="cl-band-v">' + (def.version ? '台本 ' + esc(def.version) + ' 版' : '') + '</span>' +
      '<span class="cl-band-r">' + esc([asStr(meta.theaterName).trim(), '作成 ' + clFmtDate(created)].filter(Boolean).join(' ／ ')) + '</span></div>';

    // ---- 2. 応募者（1 行目: 氏名・区分・年齢・性別・卒業予定／2 行目: 面接日・担当・求人・タクシー。空の値は項目ごと省く） ----
    const kv = [];
    const kvPush = function (k, v) { const s = asStr(v).trim(); if (s) kv.push('<div><dt>' + esc(k) + '</dt><dd>' + esc(s) + '</dd></div>'); };
    kvPush('面接日', hd.date ? clFmtDate(hd.date) : '');
    kvPush('担当', hd.interviewer);
    kvPush(((def.header || {}).posting || {}).label || '応募した求人', hd.postingLabel);
    kvPush('タクシー可否・料金', hd.taxi && hd.taxi.text);
    const who = [a.category, a.age ? a.age + '歳' : '', a.gender].filter(Boolean).join('・');
    const grad = asStr(a.graduationDate).trim() ? clFmtMonth(asStr(a.graduationDate).trim()) : '';
    const headHtml = '<div class="cl-sheet-head">' + bandHtml +
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
    // 最終合否（有効時のみ）。ストリップの右端（docs/SPEC-report.md 4-7）
    let decHtml = '';
    if (global.RecruitStamp) {
      const dcfg = decisionConfig(profile);
      if (dcfg.enabled) decHtml = global.RecruitStamp.decisionSheet(normalizeDecision(record.decision), decOpts(dcfg, o.decisionId || 'clDecision', o.decisionSvgId || 'vdSheet'));
    }
    // 調整（ストリップの下に 1 件 1 行）。必須条件の不一致は保存 HTML の「採用可否判定」と同じ「必須条件の不一致により「…」に固定」（docs/SPEC-script-mode.md 11-4 F6）
    const adjHtml = hasJ && (j.adjustments || []).length ? '<ul class="cl-adj">' + j.adjustments.map(function (x) {
      const head = x.code === 'must_conditions' ? '必須条件の不一致により「' + esc(titleOf(x.to)) + '」に固定'
        : x.from === x.to ? esc(titleOf(x.to)) + '（固定）' : esc(titleOf(x.from)) + ' → ' + esc(titleOf(x.to));
      return '<li><b>' + head + '</b>：' + esc(x.reason) + '</li>';
    }).join('') + '</ul>' : '';
    // ストリップの地色は結果に合わせる（data-result。class は従来どおり "cl-judge"）
    const judgeHtml = '<div class="cl-judge' + (hasJ ? '"' + ' data-result="' + esc(j.result) + '"' : ' cl-judge-none"') + '><div class="cl-judge-row"><div class="cl-judge-main">' +
      '<div class="cl-tiles">' + resTile + ovTile + mustTile + scoreTile + '</div></div>' + decHtml + '</div>' + adjHtml + '</div>';

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

    // ---- 5. 確認点（全項目。未入力の行も出す＝何を見なかったか分かる） ----
    const MARK_CLS = { good: 'm-good', fair: 'm-fair', poor: 'm-poor' };
    const rateHtml = sum.ratings.length
      ? '<section class="cl-blk cl-blk-rate"><h3 class="cl-h">確認点<small>○ できている　△ やや不安　× できていない</small></h3>' +
        '<table class="cl-rt"><colgroup><col class="c-no"><col class="c-lbl"><col class="c-mk"><col class="c-nt"></colgroup><tbody>' +
        sum.ratings.map(function (it) {
          const note = asStr(it.note).trim();
          return '<tr data-cl-item="' + esc(it.id) + '"><td class="cl-rt-no">' + esc(it.noMark) + '</td><td class="cl-rt-lbl">' + esc(it.label) + '</td>' +
            '<td class="cl-rt-mk"><span class="cl-mark ' + (MARK_CLS[it.value] || 'm-none') + '">' + (it.value ? esc(it.mark) : '—') + '</span></td>' +
            '<td class="cl-rt-nt">' + (note ? esc(note) : '') + '</td></tr>';
        }).join('') + '</tbody></table></section>'
      : '';

    // ---- 6. 面接メモ（記入があるものだけ。質問の回答は「短い名前：回答」2 行まで・面接所見・Step① のメモ） ----
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
    const ivNotes = asStr(record.interviewNotes).trim();
    if (ivNotes) memoRows.push('<div class="cl-nm-row cl-nm-iv"><div class="cl-nm-k">面接所見</div><div class="cl-nm-v">' + esc(ivNotes) + '</div></div>');
    // ① 応募者のメモ（入力欄「メモ（任意）」）
    const rvNotes = asStr(a.reviewerNotes).trim();
    if (rvNotes) memoRows.push('<div class="cl-nm-row cl-nm-memo"><div class="cl-nm-k">メモ</div><div class="cl-nm-v">' + esc(rvNotes) + '</div></div>');
    // 案内 1 行: 「…」で切れたメモがあるとき（.cl-nm-cut）／質問の回答を省いたとき（.cl-compact-2）だけ表示（clFitSheet が付ける）
    const notesHtml = memoRows.length
      ? '<section class="cl-blk cl-blk-notes"><h3 class="cl-h">面接メモ</h3><div class="cl-nm">' + memoRows.join('') + '</div>' +
        '<p class="cl-nm-ref' + (qRows ? ' has-q' : '') + '"><span class="cl-nm-ref-c">「…」で切れたメモの全文は、保存 HTML の「詳細」表示にあります</span>' +
        (qRows ? '<span class="cl-nm-ref-q">質問の回答は省略（回答と「…」で切れたメモの全文は、保存 HTML の「詳細」表示にあります）</span>' : '') + '</p></section>'
      : '';

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

    // ---- 8. 押印行（アプリ: o.stamps／保存 HTML: '' で、直後の押印の節を続けて印刷） ----
    const stampsHtml = o.stamps ? '<div class="cl-stamps">' + o.stamps + '</div>' : '';
    return '<div class="cl-sheet cl-mode-sheet">' + headHtml + judgeHtml + colsHtml + rateHtml + notesHtml + exHtml + stampsHtml + '</div>';
  }

  // 報告書のスタイル（.cl-sheet 以下＋ A4 印刷の規則）。アプリは起動時に 1 回 <style> に入れ、保存レポートは reportCss の後ろに足す。
  //   色はライト固定（アプリのダークテーマでも印刷は白地）。'sheet' の寸法は画面でも同じにして、紙プレビューと印刷用の高さを画面で計測できるようにする
  function checklistSheetCss() {
    return [
      // 共通（保存レポートの節＝画面向けの大きさ）
      '.cl-sheet{color:#1a2233;font-size:13px;line-height:1.5}',
      '.cl-sheet *{box-sizing:border-box}',
      '.cl-sheet .cl-s{border:1px solid #c9d2dd;border-radius:8px;margin:0 0 10px;overflow:hidden;background:#fff;break-inside:auto}',
      '.cl-sheet .cl-s-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0;padding:5px 12px;background:#24324a;color:#fff;font-size:14px;font-weight:700;break-after:avoid}',
      '.cl-sheet .cl-s.cl-s-ng .cl-s-h{background:#9b1c1c}',
      '.cl-sheet .cl-s-no{font-size:1.15em}.cl-sheet .cl-s-min{font-size:.85em;font-weight:600;opacity:.85;padding:0 6px;border:1px solid rgba(255,255,255,.55);border-radius:999px}',
      '.cl-sheet .cl-s-sum{margin-left:auto;font-size:.85em;font-weight:600}',
      '.cl-sheet .cl-s-lead{margin:0;padding:4px 12px 0;color:#5b6675;font-size:.92em}',
      '.cl-sheet .cl-s-body{padding:6px 12px 8px}',
      '.cl-sheet .cl-2col{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 16px}',
      '.cl-sheet .cl-b{margin:0 0 6px}.cl-sheet .cl-b:last-child{margin-bottom:0}',
      '.cl-sheet .cl-bt{font-weight:700;font-size:.92em;margin:2px 0 3px;break-after:avoid}.cl-sheet .cl-bt small{font-weight:500;color:#5b6675;margin-left:6px}',
      '.cl-sheet table{width:100%;border-collapse:collapse}',
      '.cl-sheet table td{padding:3px 6px;border-bottom:1px solid #e3e8ee;vertical-align:top}',
      '.cl-sheet table tr{break-inside:avoid}',
      '.cl-sheet .cl-must .cl-val{width:6em;white-space:nowrap;font-weight:700;text-align:center}',
      '.cl-sheet .cl-rate .cl-lbl{font-weight:600;width:40%}.cl-sheet .cl-rate .cl-mk{width:4.5em;text-align:center;font-weight:800;font-size:1.15em;white-space:nowrap}.cl-sheet .cl-rate .cl-mk small{font-size:.75em;font-weight:600;color:#8a94a3}',
      '.cl-sheet .cl-rate .cl-pt{width:3em;text-align:right;white-space:nowrap;color:#5b6675}.cl-sheet .cl-rate .cl-nt{white-space:pre-wrap;overflow-wrap:anywhere}',
      '.cl-sheet tr.t-ok .cl-val,.cl-sheet tr.t-ok .cl-mk{color:#0b7a55;background:#e3f6ee}.cl-sheet tr.t-warn .cl-mk{color:#9a5b00;background:#fdf1dc}',
      '.cl-sheet tr.t-danger .cl-val,.cl-sheet tr.t-danger .cl-mk{color:#b42318;background:#fde8e8}.cl-sheet tr.t-muted .cl-val{color:#5b6675;background:#eef2f6}',
      '.cl-sheet dl.cl-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2px 12px;margin:0}',
      '.cl-sheet dl.cl-fields>div{display:grid;grid-template-columns:7.5em minmax(0,1fr);gap:4px;border-bottom:1px solid #e3e8ee;padding:2px 0;break-inside:avoid}',
      '.cl-sheet dl.cl-fields dt{color:#5b6675;font-weight:600}.cl-sheet dl.cl-fields dd{margin:0;overflow-wrap:anywhere}',
      '.cl-sheet .cl-col dl.cl-fields{grid-template-columns:minmax(0,1fr)}.cl-sheet .cl-col dl.cl-fields>div{grid-template-columns:10em minmax(0,1fr)}',
      '.cl-sheet ul.cl-checks{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1px 12px}',
      '.cl-sheet .cl-col ul.cl-checks,.cl-sheet .cl-b-notify ul.cl-checks{grid-template-columns:minmax(0,1fr)}',
      '.cl-sheet ul.cl-checks li{display:grid;grid-template-columns:1.2em minmax(0,1fr);gap:3px;break-inside:avoid}.cl-sheet ul.cl-checks li.off{color:#5b6675}.cl-sheet ul.cl-checks li.dim{opacity:.6}',
      '.cl-sheet .cl-box{font-size:1.1em;line-height:1.3}.cl-sheet li.on .cl-box{color:#0b7a55}',
      '.cl-sheet ol.cl-qs{margin:0 0 3px;padding-left:1.5em;color:#3a4556}.cl-sheet ol.cl-qs li{break-inside:avoid}',
      '.cl-sheet .cl-memo{display:flex;gap:4px;padding:3px 8px;background:#f8fafc;border:1px solid #e3e8ee;border-left:3px solid #1f5fbf;border-radius:4px;break-inside:avoid}.cl-sheet .cl-memo b{flex:none}',
      '.cl-sheet .cl-memo-t{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}',
      '.cl-sheet .cl-blank{color:#8a94a3}',
      '.cl-sheet .cl-hint{display:block;font-weight:500;font-size:.85em;color:#5b6675;line-height:1.35}',
      // section（保存レポートの節）: 台本ヘッダーとページ題名
      '.cl-mode-section .cl-sheet-head{border:1px solid #c9d2dd;border-radius:8px;padding:6px 12px;margin:0 0 10px;background:#f8fafc;break-inside:avoid}',
      '.cl-mode-section dl.cl-sh-kv{display:flex;flex-wrap:wrap;gap:2px 20px;margin:0 0 4px}.cl-mode-section dl.cl-sh-kv>div{display:flex;gap:6px;align-items:baseline}',
      '.cl-mode-section dl.cl-sh-kv dt{color:#5b6675;font-weight:600}.cl-mode-section dl.cl-sh-kv dd{margin:0;font-weight:700}.cl-mode-section dl.cl-sh-kv dd small{font-weight:500;color:#5b6675;margin-left:3px}',
      '.cl-mode-section .cl-sh-chips{display:flex;flex-wrap:wrap;gap:4px}',
      '.cl-mode-section .cl-hchip{display:inline-flex;gap:6px;align-items:baseline;padding:1px 8px;border:1px solid #c9d2dd;border-radius:5px;font-size:12px;background:#fff}.cl-mode-section .cl-hchip b{color:#5b6675;font-weight:700}',
      // タクシーのチップ（手入力の値があれば t-info。docs/SPEC-slim.md B1）
      '.cl-mode-section .cl-hchip.t-info{border-color:#b9cdf7;background:#e5edff}',
      '.cl-mode-section .cl-page-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;margin:4px 0 6px;padding-bottom:3px;border-bottom:2px solid #24324a;break-after:avoid}',
      '.cl-mode-section .cl-page-no{font-size:11.5px;font-weight:800;color:#fff;background:#24324a;padding:0 7px;border-radius:4px}.cl-mode-section .cl-page-t{font-weight:800;font-size:14px}',
      '.cl-mode-section .cl-page-lead{flex-basis:100%;font-size:12px;color:#3a4556}',
      '.cl-sheet .cl-sflow{margin:5px 0 0;font-size:.92em;font-weight:600;color:#3a4556}',
      '.cl-sheet .cl-overall{border:2px solid #24324a;border-radius:8px;padding:6px 12px;margin:0 0 10px;break-inside:avoid}',
      '.cl-sheet .cl-ov-row{display:grid;grid-template-columns:9em minmax(0,1fr);gap:8px;padding:2px 0;border-bottom:1px solid #e3e8ee}.cl-sheet .cl-ov-row:last-child{border-bottom:none}',
      '.cl-sheet .cl-ov-k{font-weight:700;color:#3a4556}.cl-sheet .cl-ov-v{font-weight:700}.cl-sheet .cl-ov-v small{font-weight:600;color:#5b6675;margin-left:4px}.cl-sheet .cl-ov-notes .cl-ov-v{font-weight:400}',
      '.cl-sheet .cl-ov-v.t-ok{color:#0b7a55}.cl-sheet .cl-ov-v.t-warn{color:#9a5b00}.cl-sheet .cl-ov-v.t-danger{color:#b42318}.cl-sheet .cl-ov-v.t-muted{color:#5b6675}',

      // ---- sheet（A4 報告・1 ページの要約）。本文 9.5px・ラベル 8.5px・見出し 10.5px。画面でも同じ寸法にして計測する ----
      '.cl-sheet.cl-mode-sheet{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP",system-ui,sans-serif;font-size:9.5px;line-height:1.4;background:#fff;color:#111}',
      '.cl-mode-sheet .cl-blank{color:#8a94a3;font-weight:400}',
      // 1. ヘッダー帯
      '.cl-mode-sheet .cl-band{display:flex;align-items:center;gap:10px;height:22px;padding:0 8px;background:#24324a;color:#fff;border-radius:3px}',
      '.cl-mode-sheet .cl-band-t{flex:none;font-size:11px;font-weight:800;letter-spacing:.04em}',
      '.cl-mode-sheet .cl-band-v{flex:1 1 auto;min-width:0;text-align:center;font-size:8.5px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cl-mode-sheet .cl-band-r{flex:none;font-size:8.5px;white-space:nowrap}',
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
      '.cl-mode-sheet .cl-tile-res{border-width:2px;padding:3px 10px}.cl-mode-sheet .cl-tile-res .cl-tile-v{font-size:14px;line-height:1.3}',
      '.cl-mode-sheet .cl-tile-res.t-ok{border-color:#0b7a55}.cl-mode-sheet .cl-tile-res.t-ok .cl-tile-v{color:#0b7a55}',
      '.cl-mode-sheet .cl-tile-res.t-warn{border-color:#c98a1b}.cl-mode-sheet .cl-tile-res.t-warn .cl-tile-v{color:#9a5b00}',
      '.cl-mode-sheet .cl-tile-res.t-danger{border-color:#b42318}.cl-mode-sheet .cl-tile-res.t-danger .cl-tile-v{color:#b42318}',
      '.cl-mode-sheet .cl-tile-res.t-none{border-color:#b8c2cf;border-style:dashed}.cl-mode-sheet .cl-tile-res.t-none .cl-tile-v{color:#5b6675}',
      '.cl-mode-sheet .cl-adj{list-style:none;margin:5px 2px 0;padding:0;font-size:9px;color:#3a4556}',
      '.cl-mode-sheet .cl-adj li{overflow-wrap:anywhere}.cl-mode-sheet .cl-adj li::before{content:"※ "}.cl-mode-sheet .cl-adj li b{color:#111}',
      // 最終合否（ストリップの右端）
      '.cl-mode-sheet .cl-decision{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:3px 8px;border:1px solid #d5dbe3;border-radius:4px;background:#fff}',
      '.cl-mode-sheet .cl-dec-stamp{flex:none;display:grid;place-items:center}.cl-mode-sheet .cl-dec-stamp .verdict-stamp{width:64px;height:41px;mix-blend-mode:multiply;filter:none}',
      '.cl-mode-sheet .cl-dec-meta{display:flex;flex-direction:column;min-width:0;line-height:1.3}',
      '.cl-mode-sheet .cl-dec-kv{display:flex;align-items:baseline;gap:4px}.cl-mode-sheet .cl-dec-k{font-size:8.5px;font-weight:700;color:#5b6675}.cl-mode-sheet .cl-dec-v{font-size:12px;font-weight:800}',
      '.cl-mode-sheet .cl-dec-by,.cl-mode-sheet .cl-dec-date{font-size:8.5px;color:#3a4556;white-space:nowrap}',
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
      // 5. 確認点（○緑 △琥珀 ×赤 の丸バッジ。未入力は灰「—」。メモは 1 行で末尾を…）
      '.cl-mode-sheet table.cl-rt{width:100%;border-collapse:collapse;table-layout:fixed}',
      '.cl-mode-sheet .cl-rt col.c-no{width:20px}.cl-mode-sheet .cl-rt col.c-lbl{width:40%}.cl-mode-sheet .cl-rt col.c-mk{width:30px}',
      '.cl-mode-sheet .cl-rt td{padding:3px 4px;border-bottom:1px solid #e6eaef;vertical-align:middle}',
      '.cl-mode-sheet .cl-rt-no{font-size:8.5px;color:#5b6675;text-align:center}.cl-mode-sheet .cl-rt-lbl{font-weight:600}.cl-mode-sheet .cl-rt-mk{text-align:center}',
      '.cl-mode-sheet .cl-rt-nt{color:#3a4556;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cl-mode-sheet .cl-mark{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;font-size:10px;font-weight:800;line-height:1;color:#fff;background:#8a94a3}',
      '.cl-mode-sheet .cl-mark.m-good{background:#0b7a55}.cl-mode-sheet .cl-mark.m-fair{background:#c98a1b}.cl-mode-sheet .cl-mark.m-poor{background:#b42318}.cl-mode-sheet .cl-mark.m-none{color:#8a94a3;background:#eef1f5}',
      // 6. 面接メモ（質問の回答は 2 行まで。面接所見・メモは全文）。名前の列は「1 問目の短い名前 ほか n 問」が 1 行に入る幅
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
      '.cl-sheet .hanko{width:46px;height:46px;filter:none}.cl-sheet .stamp-empty{width:44px;height:44px;font-size:8.5px;border:2px dashed #c7d0db;border-radius:50%;display:grid;place-items:center;color:#5b6675;background:#fff}',
      '.cl-sheet .stamp-meta{font-size:8.5px;min-height:0;line-height:1.3;color:#3a4556}',
      // 1 ページ保証（clFitSheet）: 高さが A4 を超えたら .cl-compact（本文 9px・余白を詰める。質問の回答は 2 行のまま・面接所見 10 行・メモ 3 行まで）→
      //   .cl-compact-q1（質問の回答 1 行・面接所見 6 行・メモ 2 行）→ .cl-compact-2（質問の回答を省いて 1 行の案内・面接所見 4 行・メモ 1 行）。
      //   面接所見は行数の上限を固定（残りの高さまで広げない。所見が紙を占めて結果・確認点より目立たないように）
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
      // 印刷ホスト（アプリ #clSheet.cl-sheet-host／レポート #clSheet.cl-sheet-print）。画面では隠し、計測時は画面外に 190mm 幅で置く
      '.cl-sheet-host,.cl-sheet-print{display:none}',
      'body.print-checklist .cl-sheet-host,body.print-checklist .cl-sheet-print{display:block;position:absolute;left:-10000px;top:0;width:190mm}',
      '@page clsheet{size:A4;margin:8mm 10mm}',
      '@media print{',
      'body.print-checklist{page:clsheet;background:#fff}',
      'body.print-checklist .cl-sheet-host,body.print-checklist .cl-sheet-print{position:static;left:auto;width:auto}',
      'body:not(.print-checklist) .cl-sheet-host,body:not(.print-checklist) .cl-sheet-print{display:none !important}',
      'body.print-checklist .page{padding:0;max-width:none}',
      'body.print-checklist .page>:not(#clSheet):not(section[data-sec="mgmt"]){display:none !important}',
      'body.print-checklist section.sec[data-sec="mgmt"]{margin-top:8px;padding:2px 8px 4px;border-radius:4px;box-shadow:none;break-inside:avoid}',
      'body.print-checklist section.sec[data-sec="mgmt"] h2{font-size:9.5px;padding-bottom:1px;margin-bottom:3px;border-bottom:none}body.print-checklist section.sec[data-sec="mgmt"] h2::before{display:none}',
      'body.print-checklist .stamp-hint,body.print-checklist .stamp-ctl,body.print-checklist .mgmt-save,body.print-checklist .mgmt-note{display:none !important}',
      'body.print-checklist .stamp-row{gap:6px}body.print-checklist .stamp-box{display:flex;align-items:center;gap:6px;text-align:left;padding:2px 8px}body.print-checklist .stamp-label{font-size:9.5px;min-width:5em}body.print-checklist .stamp-area{height:auto}body.print-checklist .hanko{width:46px;height:46px}body.print-checklist .stamp-empty{width:44px;height:44px;font-size:8.5px}body.print-checklist .stamp-meta{font-size:8.5px;min-height:0;line-height:1.3}',
      '.cl-sheet .cl-s-h,.cl-sheet tr,.cl-sheet .cl-tile,.cl-sheet .cl-hchip,.cl-sheet .cl-page-no,.cl-sheet .cl-memo,.cl-sheet .hanko,.cl-sheet .stamp-empty,.cl-sheet .cl-band,.cl-sheet .cl-judge,.cl-sheet .cl-mark,.cl-sheet .cl-mm,.cl-sheet .cl-exline,.cl-sheet .cl-decision,.cl-sheet .verdict-stamp,.cl-sheet .cl-dec-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      // 「詳細」の印刷（レポートの「面接チェックリスト」節）: 余白を詰める
      '.cl-mode-section .cl-s{break-inside:auto}.cl-mode-section table td{padding:2px 5px}',
      '}'
    ].join('\n');
  }

  // ---------- 保存 HTML（報告書。docs/SPEC-report.md・docs/SPEC-script-mode.md 3 章） ----------
  //   開くと報告書表示（A4 の紙プレビュー＋押印・最終合否）。「詳細」はヘッダー・応募者情報・面接チェックリスト（台本の全文）・採用可否判定・応募者の管理。
  //   印刷は「A4 で印刷（1 ページ）」だけ（報告書表示のままブラウザで印刷しても A4 報告。「詳細」の印刷はブラウザの既定）
  function generateReportHTML(record, profile) {
    const R = global.RecruitRules;
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
    const decLabelOf = function (d) { return d.label || (d.result === 'hire' ? dcfg.hireLabel : dcfg.rejectLabel); };
    const decSvg = function (size, id) {
      return dec && Stamp ? Stamp.verdict({ label: decLabelOf(dec), date: dec.date, color: dec.result === 'hire' ? dcfg.hireColor : dcfg.rejectColor, size: size, id: id, sub: dcfg.sub }) : '';
    };
    const meta = profile.meta;
    const name = a.name ? a.name + 'さん' : '応募者';
    const savedAt = U.fmtDateTime(record.savedAt);
    const texts = profile.texts || {};
    const titleOf = function (r) { return ((texts[r] || {}).title) || r; };
    const j = U.isObj(record.judgment) && record.judgment.result ? record.judgment : null;

    // ---- 面接チェックリスト（SPEC-checklist 4-3）。保存時点の台本（checklistDef）の文言で出す ----
    const clRec = U.isObj(record.checklist) ? record.checklist : R.emptyChecklist();
    const clHas = R.checklistHasInput(clRec);
    const clProf = Object.assign({}, profile, { checklist: normalizeChecklistDef(record.checklistDef || profile.checklist, defaults().checklist) });
    const clMust = R.mustSummary(clProf.checklist, clRec);

    const sec = function (title, body, key) { return '<section class="sec"' + (key ? ' data-sec="' + key + '"' : '') + '><h2>' + title + '</h2>\n' + body + '</section>\n'; };
    const notesHtml = record.interviewNotes ? '<h3>面接所見</h3><div class="note">' + esc(record.interviewNotes) + '</div>' : '';
    const checklistSecHtml = clHas
      ? sec('面接チェックリスト', checklistSheetHtml(record, profile, { mode: 'section' }), 'checklist')
      : sec('面接チェックリスト', '<p class="empty">面接チェックリストは未入力です。</p>' + notesHtml, 'checklist');
    const json = jsonForScript(record);
    const SCRIPT_END = '</scr' + 'ipt>';

    // ---- ヘッダー・応募者情報・採用可否判定（docs/SPEC-script-mode.md 3-3〜3-5） ----
    const sRows = R.scriptApplicantRows(a, clRec, clProf, record.management);
    const rowVal = function (k) { const r = sRows.find(function (x) { return x.key === k; }); return r ? r.value : ''; };
    const ivS = R.interviewModel(clProf, clRec);
    const cntS = ivS.counts || { good: 0, fair: 0, poor: 0, blank: 0 };
    const oo = (clProf.checklist && clProf.checklist.overallOptions) || {};
    const ovV = R.OVERALL_POINTS.hasOwnProperty(clRec.overall) ? clRec.overall : '';
    const ovL = ovV ? (oo[ovV] || { hire: '採用', hold: '保留', reject: '不採用' }[ovV]) : '';
    const mustShort = function (m) { return !m || !m.total ? 'なし' : m.mismatch ? '不一致 ' + m.mismatch : m.unknown ? '未確認 ' + m.unknown : 'すべて一致'; };
    const mustCounts = function (m) { return '一致 ' + m.match + '・不一致 ' + m.mismatch + '・未確認 ' + m.unknown; };
    const jMust = j ? ((j.checklist && j.checklist.must) || j.must || clMust) : clMust;
    const jOv = j ? ((j.overall && typeof j.overall === 'object') ? j.overall : (j.checklist && j.checklist.overall) || { value: ovV, label: ovL }) : { value: ovV, label: ovL };
    // ヘッダー
    const stepText = { 1: '応募者の入力中', 3: '面接チェックリストの入力中', 4: '報告書まで完了' }[Number(record.step)] || '';
    const chipsHtml = [rowVal('category'), rowVal('age'), rowVal('gender'), rowVal('graduation') ? '卒業予定 ' + rowVal('graduation') : '', rowVal('posting')].filter(Boolean)
      .map(function (ch) { return '<span class="chip">' + esc(ch) + '</span>'; }).join('');
    const verdictHtml = j
      ? '<div class="verdict ' + esc(j.result) + '"><span class="v-kicker">採用可否判定</span><span class="v-title">' + esc(j.title || titleOf(j.result)) + '</span><span class="v-sub">' + esc('必須条件 ' + mustShort(jMust) + '・総合判断 ' + (jOv.label || '未入力')) + '</span></div>'
      : '<div class="verdict"><span class="v-kicker">採用可否判定</span><span class="v-title">未実施</span><span class="v-sub">アプリの「報告書」を開くと判定します</span></div>';
    const headerHtml = '<header class="rh"><div class="rh-top">' +
      '<div class="rh-brand"><span class="rh-mark">' + esc((meta.theaterName || 'R').replace(/^TOHOシネマズ/, '').charAt(0) || 'R') + '</span><div><div class="rh-theater">' + esc(meta.theaterName) + '</div><div class="rh-app">' + esc(meta.appTitle) + ' ' + esc(meta.version) + '</div></div></div>' +
      '<div class="rh-meta">保存日時 ' + esc(savedAt) + (stepText ? '<br>進捗: ' + esc(stepText) : '') + '</div></div>' +
      '<div class="rh-main"><div><div class="rh-kicker">応募者情報</div><h1 class="rh-name">' + esc(a.name || '応募者') + '<small>さん</small></h1><div class="rh-chips">' + chipsHtml + '</div></div>' +
      verdictHtml + (dcfg.enabled ? '<div class="rh-decision" id="rhDecision">' + decSvg(72, 'vdHead') + '</div>' : '') + '</div></header>\n';
    // 応募者情報（① 応募者の項目だけ）
    const applicantSecHtml = sec('応募者情報', sRows.length
      ? '<table class="kv">' + sRows.map(function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; }).join('') + '</table>\n'
      : '<p class="empty">応募者情報の入力はありません。</p>\n', 'applicant');
    // 採用可否判定
    let sj = '<p class="empty">採用可否判定は未実施です（アプリの「報告書」を開くと判定します）。</p>';
    if (j) {
      const jiv = j.interview || { total: j.total, max: j.max, pct: j.pct, band: '', bandLabel: '' };
      const jc = (j.checklist && j.checklist.counts) || cntS;
      const jTitle = j.title || titleOf(j.result);
      const mDet = [];
      if ((jMust.mismatchLabels || []).length) mDet.push('不一致: ' + jMust.mismatchLabels.join('、'));
      if ((jMust.unknownLabels || []).length) mDet.push('未確認: ' + jMust.unknownLabels.join('、'));
      let adjS = '';
      if (j.adjustments && j.adjustments.length) {
        // 必須条件の不一致（must_conditions）があれば、総合判断の結果から変わったかどうか（from / to）に関係なく「固定」と書く
        const fixed = j.adjustments.some(function (x) { return x.code === 'must_conditions'; });
        adjS = '<div class="adj-head">' + (fixed ? '必須条件の不一致により「' + esc(jTitle) + '」に固定' + (jOv.label ? '' : '（総合判断は未入力）') : '総合判断による結果「' + esc(titleOf(j.baseResult)) + '」から「' + esc(jTitle) + '」に調整') + '</div>' +
          '<ul class="adj">' + j.adjustments.map(function (x) {
            return '<li><span class="step">' + (x.from === x.to ? esc(titleOf(x.to)) + '（固定）' : esc(titleOf(x.from)) + ' → ' + esc(titleOf(x.to))) + '</span><span>' + esc(x.reason) + '</span></li>';
          }).join('') + '</ul>';
      }
      const shownS = {};
      (j.adjustments || []).forEach(function (x) { shownS[x.reason] = true; });
      const warnsS = (j.warnings || []).filter(function (w) { return !shownS[w]; });
      sj = '<div class="result ' + esc(j.result) + '"><div class="result-kicker">採用可否判定</div>' +
        '<div class="result-title">' + esc(jTitle) + '</div><div class="result-body">' + esc(j.body || '') + '</div>' +
        '<table class="kv script-judge">' +
          '<tr><th>必須条件</th><td>' + esc(mustCounts(jMust) + (mDet.length ? '（' + mDet.join('／') + '）' : '')) + '</td></tr>' +
          '<tr><th>面接評価（確認点）</th><td>' + esc(jiv.total + '/' + jiv.max + '点（' + jiv.pct + '%' + (jiv.bandLabel ? '・' + jiv.bandLabel : '') + '）　○' + jc.good + ' △' + jc.fair + ' ×' + jc.poor) + '</td></tr>' +
          '<tr><th>総合判断</th><td>' + esc(jOv.label || '未入力') + '</td></tr>' +
          '<tr><th>結果</th><td>' + esc(jTitle) + '</td></tr>' +
        '</table>' + adjS +
        (warnsS.length ? '<ul class="warn-list">' + warnsS.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="disclaimer">' + esc(j.disclaimer || '') + (j.evaluatedAt ? '　判定日時: ' + esc(U.fmtDateTime(j.evaluatedAt)) : '') + '</div></div>';
    }
    const judgmentSecHtml = sec('採用可否判定', sj, 'judgment');

    // ---- 応募者の管理（押印欄）。レポート上でも押印でき、「押印を保存」で同じ形式のファイルを再出力する ----
    const mg = profile.management || {};
    const mgFields = Array.isArray(mg.fields) && mg.fields.length ? mg.fields : [];
    const mgManagers = Array.isArray(mg.managers) ? mg.managers : [];
    const management = U.isObj(record.management) ? record.management : {};
    const stampBoxes = mgFields.map(function (fld, idx) {
      const e = management[fld.id];
      const svg = e && e.name && Stamp ? Stamp.render(e, { size: 88, id: 'rp' + idx }) : '';
      return '<div class="stamp-box" data-field-id="' + esc(fld.id) + '">' +
        '<div class="stamp-label">' + esc(fld.label) + '</div>' +
        (fld.hint ? '<div class="stamp-hint">' + esc(fld.hint) + '</div>' : '<div class="stamp-hint"></div>') +
        '<div class="stamp-area">' + (svg || '<div class="stamp-empty">未押印</div>') + '</div>' +
        '<div class="stamp-meta">' + (e && e.name ? esc(e.name + (e.title ? '（' + e.title + '）' : '') + '　' + (e.date || '')) : '') + '</div>' +
        '<div class="stamp-ctl">' +
          '<select aria-label="' + esc(fld.label) + ' 担当者"><option value="">担当者を選択</option>' +
            mgManagers.map(function (m, i) { return '<option value="' + i + '">' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>'; }).join('') +
            (mg.allowFreeName !== false ? '<option value="__free">名簿にない担当者（手入力）</option>' : '') +
          '</select>' +
          (mg.allowFreeName !== false ? '<input type="text" placeholder="氏名（例：山田 太郎）" style="display:none">' : '') +
          '<button type="button" class="primary" data-act="stamp">押印</button>' +
          '<button type="button" data-act="unstamp"' + (e && e.name ? '' : ' style="display:none"') + '>取消</button>' +
        '</div></div>';
    }).join('');
    // ---- 最終合否パネル（「応募者の管理」節の先頭・#mgmt の外。docs/SPEC-report.md 4-6） ----
    let decPanelHtml = '';
    if (dcfg.enabled) {
      const allowFree = mg.allowFreeName !== false;
      const stEntry = dcfg.stampField ? management[dcfg.stampField] : null;
      // 担当者の初期選択: 連動する押印欄（最終確認）の押印者 → 合否を押した人
      const selName = (stEntry && stEntry.name) || (dec ? dec.by.name : '') || '';
      let selIdx = -1;
      mgManagers.forEach(function (m, i) { if (selIdx < 0 && selName && m.name === selName) selIdx = i; });
      const useFree = !!selName && selIdx < 0 && allowFree;
      const jd = j;
      const noteText = dec && jd && ((dec.result === 'hire' && jd.result === 'reject') || (dec.result === 'reject' && jd.result === 'recommend'))
        ? '※ アプリの判定「' + (jd.title || '') + '」と異なる最終合否です（記録はそのまま残ります）。' : '';
      const decBtn = function (r, cls, label) {
        const on = !!dec && dec.result === r;
        return '<button type="button" class="dec-btn ' + cls + (on ? ' on' : '') + '" data-act="decide" data-value="' + r + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
      };
      decPanelHtml = '<div class="decision ' + (dec ? 'is-' + dec.result : 'is-none') + '" id="decision" data-result="' + (dec ? dec.result : '') + '" style="--dec-hire:' + esc(dcfg.hireColor) + ';--dec-reject:' + esc(dcfg.rejectColor) + '">' +
        '<div class="dec-head"><span class="dec-title">' + esc(dcfg.label) + '</span><span class="dec-hint">' + esc(dcfg.hint) + '</span></div>' +
        '<div class="dec-stamp">' + (dec ? decSvg(120, 'vdPanel') : '<div class="dec-empty">未押印</div>') + '</div>' +
        '<div class="dec-body">' +
          '<div class="dec-meta">' + (dec ? esc(decLabelOf(dec) + '・' + dec.by.name + (dec.by.title ? '（' + dec.by.title + '）' : '') + '　' + dec.date) : '') + '</div>' +
          '<div class="dec-note">' + esc(noteText) + '</div>' +
          '<div class="dec-ctl">' +
            '<select aria-label="' + esc(dcfg.label) + ' 担当者"><option value="">担当者を選択</option>' +
              mgManagers.map(function (m, i) { return '<option value="' + i + '"' + (i === selIdx ? ' selected' : '') + '>' + esc(m.name + (m.title ? '（' + m.title + '）' : '')) + '</option>'; }).join('') +
              (allowFree ? '<option value="__free"' + (useFree ? ' selected' : '') + '>名簿にない担当者（手入力）</option>' : '') +
            '</select>' +
            (allowFree ? '<input type="text" placeholder="氏名（例：山田 太郎）"' + (useFree ? ' value="' + esc(selName) + '"' : ' style="display:none"') + '>' : '') +
            decBtn('hire', 'dec-hire', dcfg.hireLabel) + decBtn('reject', 'dec-reject', dcfg.rejectLabel) +
            '<button type="button" class="dec-undo" data-act="undecide"' + (dec ? '' : ' style="display:none"') + '>取消</button>' +
          '</div>' +
        '</div></div>';
    }
    const saveBarHtml = '<div class="mgmt-save" id="mgmtSave"><span id="mgmtSaveMsg">押印を変更しました。「押印を保存」でこのレポートを再出力し、元のファイルと置き換えてください。</span><button type="button" id="mgmtSaveBtn">押印を保存</button></div>';
    const mgmtNoteHtml = '<div class="mgmt-note">' + (dcfg.enabled
      ? '運用: 面接者はアプリで面接チェックリストを入力し、報告書の「面接対応者」に押印して保存したファイルをスレッドに添付します。副支配人はこのファイルをブラウザで開き、「' + esc(dcfg.label) + '」で担当者を選んで「' + esc(dcfg.hireLabel) + '」または「' + esc(dcfg.rejectLabel) + '」を押し（押印欄「最終確認」が未押印なら同じ担当者の印も押されます）、「押印を保存」で再出力したファイルをスレッドに添付してください。レポート上で押した印・合否は「押印を保存」で再出力したファイルにだけ記録されます（保存せずに閉じると消えます）。再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。担当者名簿は設定（劇場ルール）の「応募者の管理」で編集できます。'
      : '担当者名簿は設定（劇場ルール）の「応募者の管理」で編集できます。レポート上で押した印は「押印を保存」で再出力したファイルにだけ記録されます（保存せずに閉じると消えます）。再出力したファイルはアプリの「読み込み」で押印ごと引き継げます。') + '</div>';
    const mgmtHtml = decPanelHtml + (mgFields.length
      ? '<div class="stamp-row' + (mgFields.length === 2 ? ' cols-2' : '') + '" id="mgmt">' + stampBoxes + '</div>' + saveBarHtml + mgmtNoteHtml
      : '<p class="empty">押印欄は設定されていません。</p>' + (dcfg.enabled ? saveBarHtml + mgmtNoteHtml : ''));
    const mgmtConfig = jsonForScript({ fields: mgFields, managers: mgManagers, allowFreeName: mg.allowFreeName !== false,
      decision: dcfg.enabled ? { label: dcfg.label, hireLabel: dcfg.hireLabel, rejectLabel: dcfg.rejectLabel, hireColor: dcfg.hireColor, rejectColor: dcfg.rejectColor,
        stampField: dcfg.stampField, autoStampFinal: dcfg.autoStampFinal, filenameSuffix: dcfg.filenameSuffix, hint: dcfg.hint, sub: dcfg.sub } : null });
    const reportScript = Stamp && (mgFields.length || dcfg.enabled) ? (
      '<script type="application/json" id="recruit-mgmt-config">' + mgmtConfig + SCRIPT_END + '\n' +
      '<script>\n(function(){\n' +
      'var recNode=document.getElementById("recruit-record");var cfgNode=document.getElementById("recruit-mgmt-config");var root=document.getElementById("mgmt");if(!recNode||!cfgNode)return;\n' +
      'var rec,cfg;try{rec=JSON.parse(recNode.textContent);cfg=JSON.parse(cfgNode.textContent);}catch(e){return;}\n' +
      'var D=cfg.decision||null,dpanel=D?document.getElementById("decision"):null;if(!root&&!dpanel)return;\n' +
      Stamp.source() + '\n' +
      'rec.management=rec.management||{};var dirty=false,saved=false;\n' +
      'var MSG_DIRTY="押印を変更しました。「押印を保存」でこのレポートを再出力し、元のファイルと置き換えてください。",MSG_SAVED="押印を保存したファイルを書き出しました。保存できなかった場合は「再保存」を押してください。";\n' +
      'function pad(n){return String(n).padStart(2,"0");}\n' +
      'function today(){var d=new Date();return d.getFullYear()+"."+pad(d.getMonth()+1)+"."+pad(d.getDate());}\n' +
      // 最終合否（docs/SPEC-report.md 4-9）。描画・ファイル名は stamp.js の純関数（verdictSvg / decisionSheetHtml / decisionFilename）
      'function hasField(id){return !!id&&cfg.fields.some(function(f){return f.id===id;});}\n' +
      'function curDec(){var d=rec.decision;return d&&(d.result==="hire"||d.result==="reject")&&d.by&&d.by.name?d:null;}\n' +
      'function decLabel(d){return d.label||(d.result==="hire"?D.hireLabel:D.rejectLabel);}\n' +
      'function decColor(d){return d.result==="hire"?D.hireColor:D.rejectColor;}\n' +
      'function decSvg(d,size,id){return verdictSvg({label:decLabel(d),date:d.date||"",color:decColor(d),size:size,id:id,sub:D.sub||""});}\n' +
      'function decOpts(id,svgId){return {id:id,svgId:svgId,title:D.label,hireLabel:D.hireLabel,rejectLabel:D.rejectLabel,hireColor:D.hireColor,rejectColor:D.rejectColor,sub:D.sub||"",size:64};}\n' +
      'function noteText(d){var j=rec.judgment;if(!d||!j)return "";if((d.result==="hire"&&j.result==="reject")||(d.result==="reject"&&j.result==="recommend"))return "※ アプリの判定「"+(j.title||"")+"」と異なる最終合否です（記録はそのまま残ります）。";return "";}\n' +
      'function pickPerson(sel,inp){var v=sel?sel.value:"";if(v==="__free"){var nm=inp?inp.value.trim():"";if(!nm){alert("氏名を入力してください");return null;}return {name:nm,short:shortName(nm),title:""};}\n' +
      '  var m=cfg.managers[Number(v)];if(!v||!m){alert("担当者を選んでください");return null;}return {name:m.name,short:m.short||shortName(m.name),title:m.title||""};}\n' +
      'function initDecSel(){if(!dpanel)return;var sel=dpanel.querySelector(".dec-ctl select"),inp=dpanel.querySelector(".dec-ctl input");if(!sel)return;\n' +
      '  var st=D.stampField?rec.management[D.stampField]:null,d=curDec();var nm=(st&&st.name)||(d?d.by.name:"")||"";var idx=-1;\n' +
      '  cfg.managers.some(function(m,i){if(nm&&m.name===nm){idx=i;return true;}return false;});\n' +
      '  if(idx>=0)sel.value=String(idx);else if(nm&&inp&&sel.querySelector(\'option[value="__free"]\')){sel.value="__free";inp.value=nm;}else sel.value="";\n' +
      '  if(inp)inp.style.display=sel.value==="__free"?"":"none";}\n' +
      'function renderDecision(){if(!D)return;var d=curDec();\n' +
      '  [["clPaperDecision","vdPaper"],["clDecision","vdSheet"]].forEach(function(x){var el=document.getElementById(x[0]);if(el)el.outerHTML=decisionSheetHtml(d,decOpts(x[0],x[1]));});\n' +
      '  if(dpanel){dpanel.className="decision "+(d?"is-"+d.result:"is-none");dpanel.setAttribute("data-result",d?d.result:"");\n' +
      '    dpanel.querySelector(".dec-stamp").innerHTML=d?decSvg(d,120,"vdPanel"):\'<div class="dec-empty">未押印</div>\';\n' +
      '    dpanel.querySelector(".dec-meta").textContent=d?(decLabel(d)+"・"+d.by.name+(d.by.title?"（"+d.by.title+"）":"")+"　"+(d.date||"")):"";\n' +
      '    dpanel.querySelector(".dec-note").textContent=noteText(d);\n' +
      '    Array.prototype.forEach.call(dpanel.querySelectorAll(\'[data-act="decide"]\'),function(b){var on=!!d&&b.getAttribute("data-value")===d.result;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on));});\n' +
      '    var un=dpanel.querySelector(\'[data-act="undecide"]\');if(un)un.style.display=d?"":"none";}\n' +
      '  var rh=document.getElementById("rhDecision");if(rh)rh.innerHTML=d?decSvg(d,72,"vdHead"):"";\n' +
      '  document.body.setAttribute("data-filename",decisionFilename(document.body.getAttribute("data-filename")||"applicant.html",d,D));}\n' +
      'function render(){if(root)cfg.fields.forEach(function(f,idx){var box=root.querySelector(\'.stamp-box[data-field-id="\'+f.id+\'"]\');if(!box)return;var e=rec.management[f.id];\n' +
      '  box.querySelector(".stamp-area").innerHTML=e&&e.name?stampSvg({name:e.short||shortName(e.name),title:e.title||"",date:e.date||"",size:88,id:"rp"+idx}):\'<div class="stamp-empty">未押印</div>\';\n' +
      '  box.querySelector(".stamp-meta").textContent=e&&e.name?(e.name+(e.title?"（"+e.title+"）":"")+"　"+(e.date||"")):"";\n' +
      '  var un=box.querySelector(\'[data-act="unstamp"]\');if(un)un.style.display=e&&e.name?"":"none";\n' +
      '  var sel=box.querySelector("select"),inp=box.querySelector("input");if(sel&&inp)inp.style.display=sel.value==="__free"?"":"none";});\n' +
      '  renderDecision();\n' +
      '  var bar=document.getElementById("mgmtSave");if(bar)bar.classList.toggle("show",dirty||saved);\n' +
      '  var msg=document.getElementById("mgmtSaveMsg");if(msg)msg.textContent=!dirty&&saved?MSG_SAVED:MSG_DIRTY;var sb=document.getElementById("mgmtSaveBtn");if(sb)sb.textContent=!dirty&&saved?"再保存":"押印を保存";}\n' +
      'if(root){root.addEventListener("change",function(ev){var sel=ev.target;if(sel.tagName==="SELECT"){var inp=sel.closest(".stamp-box").querySelector("input");if(inp){inp.style.display=sel.value==="__free"?"":"none";if(sel.value==="__free")inp.focus();}}});\n' +
      'root.addEventListener("click",function(ev){var b=ev.target.closest("[data-act]");if(!b)return;var box=b.closest(".stamp-box");var id=box.getAttribute("data-field-id");var act=b.getAttribute("data-act");\n' +
      '  if(act==="stamp"){var sel=box.querySelector("select");var v=sel?sel.value:"";var m=null;\n' +
      '    if(v==="__free"){var inp=box.querySelector("input");var nm=inp?inp.value.trim():"";if(!nm){alert("氏名を入力してください");return;}m={name:nm,short:shortName(nm),title:""};}\n' +
      '    else{m=cfg.managers[Number(v)];if(!v||!m){alert("担当者を選んでください");return;}}\n' +
      '    rec.management[id]={name:m.name,short:m.short||shortName(m.name),title:m.title||"",date:today(),at:new Date().toISOString()};dirty=true;render();}\n' +
      '  else if(act==="unstamp"){delete rec.management[id];dirty=true;render();}});}\n' +
      'if(dpanel){dpanel.addEventListener("change",function(ev){var sel=ev.target;if(sel.tagName!=="SELECT")return;var inp=dpanel.querySelector(".dec-ctl input");if(inp){inp.style.display=sel.value==="__free"?"":"none";if(sel.value==="__free")inp.focus();}});\n' +
      'dpanel.addEventListener("click",function(ev){var b=ev.target.closest("[data-act]");if(!b)return;var act=b.getAttribute("data-act");\n' +
      '  if(act==="decide"){var r=b.getAttribute("data-value");if(r!=="hire"&&r!=="reject")return;var p=pickPerson(dpanel.querySelector(".dec-ctl select"),dpanel.querySelector(".dec-ctl input"));if(!p)return;\n' +
      '    var dt=today(),at=new Date().toISOString();rec.decision={result:r,label:r==="hire"?D.hireLabel:D.rejectLabel,date:dt,at:at,by:{name:p.name,short:p.short,title:p.title}};\n' +
      // 連動する押印欄（最終確認）が未押印なら同じ担当者の印も押す
      '    if(D.autoStampFinal&&hasField(D.stampField)){var cur=rec.management[D.stampField];if(!cur||!cur.name)rec.management[D.stampField]={name:p.name,short:p.short,title:p.title,date:dt,at:at};}\n' +
      '    dirty=true;render();}\n' +
      // 取消は合否だけを消す（押印は押印欄の「取消」で消す）
      '  else if(act==="undecide"){rec.decision=null;dirty=true;render();}});}\n' +
      'var saveBtn=document.getElementById("mgmtSaveBtn");if(saveBtn)saveBtn.addEventListener("click",function(){\n' +
      '  recNode.textContent=JSON.stringify(rec).replace(/[<>&\\u2028\\u2029]/g,function(c){return "\\\\u"+("000"+c.charCodeAt(0).toString(16)).slice(-4);});\n' +
      // 書き出すファイルは保存バーを閉じた状態にする。書き出し後は「再保存」できるようバーを残す（ダウンロードの成否は分からないため）
      '  dirty=false;saved=false;render();var html="<!DOCTYPE html>\\n"+document.documentElement.outerHTML;saved=true;render();\n' +
      '  var blob=new Blob([html],{type:"text/html;charset=utf-8"});var url=URL.createObjectURL(blob);\n' +
      '  var a=document.createElement("a");a.href=url;a.download=document.body.getAttribute("data-filename")||"applicant.html";document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url);},1000);});\n' +
      'window.addEventListener("beforeunload",function(e){if(dirty){e.preventDefault();e.returnValue="";}});\n' +
      'initDecSel();render();\n})();\n' + SCRIPT_END + '\n'
    ) : '';

    return '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>応募者情報 - ' + esc(name) + ' | ' + esc(meta.theaterName) + '</title>\n' +
      '<style>\n' + reportCss() + '\n' + checklistSheetCss() + '\n</style>\n</head>\n<body class="view-report has-cl mode-script" data-filename="' + esc(filename) + '">\n<div class="page">\n' +
      // 表示切替（報告書＝既定／詳細）＋印刷（docs/SPEC-report.md 4-3）。回答が無くても白紙の台本として A4 報告を出す
      '<div class="rtool no-print"><div class="rtool-view" role="group" aria-label="表示"><button type="button" id="rtViewReport" class="on" aria-pressed="true">報告書</button><button type="button" id="rtViewFull" aria-pressed="false">詳細</button></div><span class="rtool-sep"></span>' +
      '<span>印刷:</span><button type="button" id="rtPrintChecklist" class="primary">A4 で印刷（1 ページ）</button>' +
      '<span class="rtool-hint">結果・必須条件・確認点・面接メモ・押印を A4 1 枚にまとめた面接チェックリスト報告を印刷します。台本の全文は「詳細」にあります。</span></div>\n' +
      '<div class="paper-wrap" id="reportPaper"><div class="paper-cap"><b>面接チェックリスト報告（A4 プレビュー）</b><span>印刷は「A4 で印刷（1 ページ）」で 1 枚。台本の全文は「詳細」</span></div>' +
      '<div class="paper" id="clPaper">' + checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '', decisionId: 'clPaperDecision', decisionSvgId: 'vdPaper' }) + '</div></div>\n' +
      headerHtml + applicantSecHtml + checklistSecHtml + judgmentSecHtml +
      '<div id="clSheet" class="cl-sheet-print">' + checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '' }) + '</div>\n' +
      sec('応募者の管理', mgmtHtml, 'mgmt') +
      '<div class="foot"><span>' + esc(meta.footer) + '</span><span>このファイルはアプリの「読み込み」から再度開けます。埋め込みデータを編集しないでください。</span></div>\n' +
      '</div>\n' +
      '<script type="application/json" id="recruit-record">' + json + SCRIPT_END + '\n' +
      '<script>\n(function(){\n' +
      // A4 で印刷（1 ページ）: body.print-checklist の付け外しと 1 ページ保証（.cl-compact → .cl-compact-q1 → .cl-compact-2 → 縮小。アプリと同じ関数 clFitSheet）。
      //   印刷用 #clSheet は押印行を含まない（直後の押印の節を続けて印刷する）ので、押印の節の分（押印欄の件数で段数が変わる）を除いた上限で計る
      'var c=document.getElementById("rtPrintChecklist"),host=document.getElementById("clSheet");\n' +
      clFitSheet.toString() + '\n' +
      'var CL_LIMIT=' + checklistSheetLimit(mgFields.length) + ';\n' +
      'function prepCl(on){if(!host)return false;var sh=host.querySelector(".cl-sheet");document.body.classList.toggle("print-checklist",!!on);if(sh){if(on)clFitSheet(sh,CL_LIMIT);else{sh.classList.remove("cl-compact");sh.classList.remove("cl-compact-q1");sh.classList.remove("cl-compact-2");sh.style.zoom="";}}return true;}\n' +
      // 紙プレビュー（#clPaper）にも同じクラスを付ける（報告書表示のときだけ計れる。表示を戻したときに計り直す）
      'function fitPaper(){var p=document.querySelector("#clPaper .cl-sheet");if(p)clFitSheet(p,CL_LIMIT);}\n' +
      'window.__fitChecklistPaper=fitPaper;\n' +
      'window.__prepareChecklistSheet=prepCl;\n' +
      'if(c)c.addEventListener("click",function(){prepCl(true);var done=function(){prepCl(false);window.removeEventListener("afterprint",done);};window.addEventListener("afterprint",done);setTimeout(done,3000);window.print();});\n' +
      // 表示切替（報告書／詳細）。保存時の表示に関係なく、開いたときは必ず報告書表示（docs/SPEC-report.md 4-8）
      'var vr=document.getElementById("rtViewReport"),vf=document.getElementById("rtViewFull");\n' +
      'function setView(v){var r=v!=="full",bd=document.body;bd.classList.toggle("view-report",r);bd.classList.toggle("view-full",!r);\n' +
      '  if(vr){vr.classList.toggle("on",r);vr.setAttribute("aria-pressed",String(r));}if(vf){vf.classList.toggle("on",!r);vf.setAttribute("aria-pressed",String(!r));}if(r)fitPaper();}\n' +
      'window.__setReportView=setView;\n' +
      'if(vr)vr.addEventListener("click",function(){setView("report");});\n' +
      'if(vf)vf.addEventListener("click",function(){setView("full");});\n' +
      'setView("report");\n' +
      // 報告書表示のままブラウザで印刷したときは A4 報告にする（「詳細」の印刷はブラウザの既定のまま）
      'var autoCl=false;\n' +
      'window.addEventListener("beforeprint",function(){var bd=document.body;\n' +
      '  if(!bd.classList.contains("view-report")||bd.classList.contains("print-checklist"))return;\n' +
      '  if(prepCl(true))autoCl=true;});\n' +
      'window.addEventListener("afterprint",function(){if(autoCl){autoCl=false;prepCl(false);}});\n' +
      '})();\n' + SCRIPT_END + '\n' +
      reportScript +
      '</body>\n</html>\n';
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
    checklistSheetLimit: checklistSheetLimit,
    CL_SHEET_BODY_PX: CL_SHEET_BODY_PX,
    checklistShortLabel: function (it) { return clShortOf(it, clDefaultItems()); },
    reportCss: reportCss,
    normalizeDecision: normalizeDecision,
    decisionConfig: decisionConfig,
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
