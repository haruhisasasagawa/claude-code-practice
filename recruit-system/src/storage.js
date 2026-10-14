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

  // ---------- プロファイルの正規化・移行（schemaVersion 1 → 2） ----------
  // v1（コミット 32a643e）の既定文言。完全一致したものだけ v2 の既定文言に置き換える（編集済みの文言は維持）
  const V1_DEFAULT_TEXTS = {
    graduation_midterm: '来年3月卒業予定で勤務期間が「中期」です。実際に中期で勤務できるか面接時に確認してください。',
    vacation_ng: '長期休暇期間（{vacationLabels}）の勤務ができません。繁忙期対応の観点から面接実施の可否を判断してください。',
    vacation_consult: '長期休暇期間（{vacationLabels}）が要相談です。具体的にどの程度入れるか確認してください。',
    highschool_hours: '高校生は法令上22:00まで。当劇場では{highschoolLatestEnd}までの勤務としている旨を伝えてください。',
    foreign_hour_cap_exceeded: '希望シフトの合計（週{weeklyHours}時間目安）が週{foreignWeeklyHourCap}時間の上限を超えています。シフト調整の可否を判断してください。'
  };
  const V1_VACATION_IDS = ['summer', 'obon', 'yearend', 'gw'];
  const V1_VACATION_LABELS = { summer: '夏休み', obon: 'お盆', yearend: '年末年始', gw: 'GW' };
  const V1_VACATION_OK = '長期休暇期間すべてに対応可能です';
  const SHINJUKU = 'TOHOシネマズ新宿';
  const BUSY_ITEM_FALLBACK = { periodNote: '', unit: 'total', maxDays: 7, refDays: 3, weight: 1, critical: false };
  const RESULTS = ['recommend', 'review', 'reject'];
  const HS_MODES = ['allow', 'exceptionOnly', 'deny'];
  const MATRIX_KEYS = (function () {
    const b = ['high', 'mid', 'low'], out = [];
    b.forEach(function (i) { b.forEach(function (c) { out.push(i + '_' + c); }); });
    return out;
  })();

  function isNum(v) { return v !== '' && v != null && typeof v !== 'boolean' && !isNaN(Number(v)); }

  function migrateV1(merged, base, raw) {
    const o = merged.options = merged.options || {};
    // 新宿以外の劇場（meta があり劇場名が新宿でない・高校生方針が未設定）は従来動作を保つ（SPEC 8-1 の 4・10-1 #16）
    const keepLegacy = !raw.highschoolPolicy && !!raw.meta && raw.meta.theaterName !== SHINJUKU;
    // 1. 繁忙期: 既定にあって raw に無い期間を追加
    const rawItems = Array.isArray(o.vacationItems) ? o.vacationItems.slice() : [];
    const rawIds = rawItems.map(function (v) { return v && v.id; });
    const defItems = base.options.vacationItems;
    const untouched = rawIds.length === V1_VACATION_IDS.length && rawIds.every(function (id, i) { return id === V1_VACATION_IDS[i]; });
    let items;
    if (untouched && !keepLegacy) {
      // v1 既定の並びのまま → v2 既定の並び・期間に置き換える（編集済みのラベルは維持）
      items = defItems.map(function (d) {
        const hit = rawItems.find(function (v) { return v.id === d.id; });
        const out = U.deepClone(d);
        if (hit && hit.label && hit.label !== V1_VACATION_LABELS[d.id]) out.label = hit.label;
        return out;
      });
    } else {
      items = rawItems.map(function (v) {
        const out = Object.assign({}, v);
        const d = defItems.find(function (x) { return x.id === v.id; });
        if (d && out.label === V1_VACATION_LABELS[v.id]) out.label = d.label;
        return out;
      });
      // 他劇場には v1 に無かった期間（3連休・SW・春休み）を足さない（未回答の留意点が新たに付かないように）
      if (!keepLegacy) defItems.forEach(function (d, di) {
        if (items.some(function (v) { return v.id === d.id; })) return;
        // 既定配列での直前の既定 id の後ろ（無ければ先頭）に挿入
        let pos = 0;
        for (let k = di - 1; k >= 0; k--) {
          const idx = items.findIndex(function (v) { return v.id === defItems[k].id; });
          if (idx >= 0) { pos = idx + 1; break; }
        }
        items.splice(pos, 0, U.deepClone(d));
      });
    }
    o.vacationItems = items;

    // 2. 留意点ルール: v1 既定文言のままなら v2 既定文言へ、繁忙期系はカテゴリを busy へ
    const baseRules = {};
    base.handoffRules.forEach(function (r) { baseRules[r.id] = r; });
    (merged.handoffRules || []).forEach(function (r) {
      if (!r || !r.id) return;
      if (V1_DEFAULT_TEXTS[r.id] && r.text === V1_DEFAULT_TEXTS[r.id] && baseRules[r.id]) r.text = baseRules[r.id].text;
      if ((r.id === 'vacation_ng' || r.id === 'vacation_consult' || r.id === 'weekend_missing') && r.category === 'general') r.category = 'busy';
    });

    // 3. 強みの文言
    const st = (merged.texts || {}).strengths;
    if (st && st.vacationOk === V1_VACATION_OK) st.vacationOk = base.texts.strengths.vacationOk;

    // 4. 劇場ごとの既定の振り分け（新宿以外の従来動作は変えない）
    if (keepLegacy) {
      merged.highschoolPolicy.mode = 'allow';
      merged.features.contribution = false;
      merged.features.allNight = false;
      // v1 に無かった入力欄（繁忙期の日数・祝日・土日の頻度）は出さない
      merged.features.vacationDays = false;
      merged.features.holidayWork = false;
      merged.features.weekendFreq = false;
      // 2軸判定 OFF の劇場では「シフト条件の未確認」の留意点を出さない（設定画面で ON にできる）
      (merged.handoffRules || []).forEach(function (r) { if (r.id === 'shift_unanswered') r.enabled = false; });
    }
  }

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

  // deepMerge は配列を丸ごと置き換えるため、配列の要素単位で不足キーを補う（毎回・冪等）
  function fillArrays(merged, base) {
    const o = merged.options = U.isObj(merged.options) ? merged.options : U.deepClone(base.options);
    const bo = base.options;

    if (!Array.isArray(o.vacationItems)) o.vacationItems = U.deepClone(bo.vacationItems);
    o.vacationItems = o.vacationItems.filter(function (v) { return U.isObj(v); }).map(function (v) {
      const d = bo.vacationItems.find(function (x) { return x.id === v.id; }) || BUSY_ITEM_FALLBACK;
      const out = Object.assign({}, v);
      ['periodNote', 'unit', 'critical'].forEach(function (k) { if (out[k] === undefined) out[k] = d[k]; });
      if (out.label === undefined) out.label = d.label || out.id || '';
      ['maxDays', 'refDays', 'weight'].forEach(function (k) {
        out[k] = isNum(out[k]) ? Number(out[k]) : (isNum(d[k]) ? d[k] : BUSY_ITEM_FALLBACK[k]);
      });
      out.critical = out.critical !== false;
      return out;
    });

    if (!Array.isArray(o.workPeriods) || !o.workPeriods.length) o.workPeriods = U.deepClone(bo.workPeriods);
    o.workPeriods = o.workPeriods.map(function (w) {
      if (!U.isObj(w)) return w;
      const d = bo.workPeriods.find(function (x) { return x.value === w.value; }) || { minMonths: 0, contributionRatio: 0 };
      const out = Object.assign({}, w);
      out.minMonths = isNum(out.minMonths) ? Number(out.minMonths) : d.minMonths;
      out.contributionRatio = isNum(out.contributionRatio) ? Number(out.contributionRatio) : d.contributionRatio;
      return out;
    });

    ['weekendFrequencies', 'allNightFrequencies', 'careerPaths'].forEach(function (k) {
      if (!Array.isArray(o[k]) || !o[k].length) o[k] = U.deepClone(bo[k]);
    });
    ['weekendFrequencies', 'allNightFrequencies'].forEach(function (k) {
      o[k] = o[k].map(function (x) {
        if (!U.isObj(x)) return x;
        const out = Object.assign({}, x);
        out.ratio = isNum(out.ratio) ? Number(out.ratio) : 0;
        return out;
      });
    });

    // シフト貢献度の項目（id は計算関数と対応するため既定の id だけ）
    const co = merged.contribution = U.isObj(merged.contribution) ? merged.contribution : U.deepClone(base.contribution);
    const defCo = base.contribution.items;
    let ci = Array.isArray(co.items) && co.items.length ? co.items : U.deepClone(defCo);
    ci = ci.filter(function (it) { return U.isObj(it) && defCo.some(function (d) { return d.id === it.id; }); });
    defCo.forEach(function (d) { if (!ci.some(function (it) { return it.id === d.id; })) ci.push(U.deepClone(d)); });
    co.items = ci.map(function (it) {
      const d = defCo.find(function (x) { return x.id === it.id; });
      const out = Object.assign({}, it);
      if (out.enabled === undefined) out.enabled = d.enabled;
      if (out.label === undefined) out.label = d.label;
      out.max = isNum(out.max) ? Number(out.max) : d.max;
      return out;
    });

    // 2軸マトリクス
    const mx = merged.matrix = U.isObj(merged.matrix) ? merged.matrix : U.deepClone(base.matrix);
    mx.cells = U.isObj(mx.cells) ? mx.cells : {};
    mx.cellNotes = U.isObj(mx.cellNotes) ? mx.cellNotes : {};
    MATRIX_KEYS.forEach(function (k) {
      if (RESULTS.indexOf(mx.cells[k]) < 0) mx.cells[k] = base.matrix.cells[k];
      mx.cellNotes[k] = mx.cellNotes[k] == null ? (base.matrix.cellNotes[k] || '') : String(mx.cellNotes[k]);
    });

    // 高校生の方針
    const hp = merged.highschoolPolicy = U.isObj(merged.highschoolPolicy) ? merged.highschoolPolicy : U.deepClone(base.highschoolPolicy);
    if (HS_MODES.indexOf(hp.mode) < 0) hp.mode = base.highschoolPolicy.mode;
    if (!Array.isArray(hp.exceptionCategories)) hp.exceptionCategories = U.deepClone(base.highschoolPolicy.exceptionCategories);

    // 応募者の管理（押印欄・名簿）
    const mg = merged.management = U.isObj(merged.management) ? merged.management : U.deepClone(base.management);
    if (!Array.isArray(mg.fields) || !mg.fields.length) mg.fields = U.deepClone(base.management.fields);
    mg.fields = mg.fields.filter(function (x) { return U.isObj(x) && x.id; }).map(function (x) {
      return { id: String(x.id), label: String(x.label || x.id), hint: String(x.hint || '') };
    });
    if (!mg.fields.length) mg.fields = U.deepClone(base.management.fields);
    // 初期対応者の旧既定の説明（「応募受付・申し送りを行った担当者」）は現在の既定にする（書き換えた説明はそのまま）
    const initBase = (base.management.fields || []).find(function (x) { return x && x.id === 'initial'; });
    mg.fields.forEach(function (x) { if (x.id === 'initial' && x.hint === '応募受付・申し送りを行った担当者' && initBase) x.hint = initBase.hint; });
    mg.managers = (Array.isArray(mg.managers) ? mg.managers : []).filter(function (x) { return U.isObj(x) && x.name; }).map(function (x) {
      const name = String(x.name).trim();
      const short = String(x.short || '').trim() || (global.RecruitStamp ? global.RecruitStamp.shortName(name) : name);
      const out = { name: name, short: short, title: String(x.title || '').trim() };
      if (x.grade) out.grade = String(x.grade).trim();
      return out;
    });
    mg.allowFreeName = mg.allowFreeName !== false;
    // 最終合否（mg.fields 確定後。既知のキーだけ整え、未知のキーは残す）
    mg.decision = Object.assign({}, U.isObj(mg.decision) ? mg.decision : {}, decisionFields(mg.decision, mg.fields, (base.management || {}).decision));
    if (!U.isObj(hp.rejectCareerPaths)) hp.rejectCareerPaths = U.deepClone(base.highschoolPolicy.rejectCareerPaths);
    // 旧設定 disallowedPathResult（対象外の進路を一律 reject/review）からの移行: 'review' なら不採用推奨にする進路なし
    if (hp.disallowedPathResult === 'review') Object.keys(hp.rejectCareerPaths).forEach(function (k) { hp.rejectCareerPaths[k] = false; });
    delete hp.disallowedPathResult;
  }

  // ---------- 入力の段階（docs/SPEC-stages.md 2-2） ----------
  const STAGES = ['pre', 'interview'];
  // 入力の段階: 既定のキーだけ残し、不正値・欠落は既定に戻す（未知のキーは削除）。旧プロファイル（inputStages なし）は既定の段階
  function fillStages(merged, base) {
    const def = base.inputStages;
    const src = U.isObj(merged.inputStages) ? merged.inputStages : {};
    const out = {};
    Object.keys(def).forEach(function (k) { out[k] = STAGES.indexOf(src[k]) >= 0 ? src[k] : def[k]; });
    // 該当の有無が分からないまま詳細だけ面接前に聞くことはないため、外国籍が面接時なら詳細も面接時
    if (out.foreignFlag === 'interview') out.foreignDetail = 'interview';
    merged.inputStages = out;
    const so = U.isObj(merged.stageOptions) ? merged.stageOptions : {};
    merged.stageOptions = {};
    Object.keys(base.stageOptions).forEach(function (k) { merged.stageOptions[k] = typeof so[k] === 'boolean' ? so[k] : base.stageOptions[k]; });
  }
  // ---------- 面接チェックリスト（docs/SPEC-checklist.md 6-1） ----------
  const CL_ID_RE = /^[A-Za-z][\w-]{0,40}$/;
  const CL_AUTO_PARAM_RULES = {   // autoParams の検査（不正値は既定の項目なら既定値、そうでなければ削除）
    minDays: function (v) { return isNum(v) && Number(v) % 1 === 0 && Number(v) >= 1 && Number(v) <= 7; },
    minHours: function (v) { return isNum(v) && Number(v) >= 1 && Number(v) <= 12; },
    monthsAfter: function (v) { return isNum(v) && Number(v) % 1 === 0 && Number(v) >= 0 && Number(v) <= 12; },
    periods: function (v) { return Array.isArray(v) && v.every(function (x) { return typeof x === 'string' && x !== ''; }); }
  };
  function clRules() { return global.RecruitRules || {}; }
  function strOr(v, def) { return typeof v === 'string' ? v : def; }
  function asStr(v) { return v == null ? '' : String(v); }
  function intIn(v, lo, hi) { return isNum(v) && Number(v) % 1 === 0 && Number(v) >= lo && (hi == null || Number(v) <= hi); }
  function clHasSections(def) {
    return U.isObj(def) && Array.isArray(def.sections) && def.sections.some(function (s) { return U.isObj(s); });
  }

  // 台本の正規化（決定的・冪等。未知のキーは残す）。baseDef は既定の台本
  function normalizeChecklistDef(def, baseDef) {
    const R = clRules();
    const base = U.isObj(baseDef) ? baseDef : defaults().checklist;
    if (!clHasSections(def)) return U.deepClone(base);
    const out = U.deepClone(def);
    const types = R.CHECKLIST_BLOCK_TYPES || ['must', 'fields', 'explain', 'question', 'rating', 'notify', 'note'];
    const kinds = R.CHECKLIST_FIELD_KINDS || ['text', 'date', 'month', 'choice'];
    const autos = R.CHECKLIST_AUTO || { must: [], fields: [] };

    ['title', 'version', 'intro', 'overallLabel', 'overallHint'].forEach(function (k) { out[k] = strOr(out[k], base[k]); });
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

    // 既定の項目（autoParams の補完用）
    const baseItems = {};
    (base.sections || []).forEach(function (s) { (s.blocks || []).forEach(function (b) { (b.items || []).forEach(function (it) { baseItems[it.id] = it; }); }); });

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
          const allowed = autos[b.type] || [];
          if (it.auto !== undefined && allowed.indexOf(it.auto) < 0) delete it.auto;
          if (it.auto === undefined) delete it.autoParams;
          else if (it.autoParams !== undefined) {
            const bi = baseItems[it.id];
            const bap = bi && bi.auto === it.auto && U.isObj(bi.autoParams) ? bi.autoParams : null;
            if (!U.isObj(it.autoParams)) {
              if (bap) it.autoParams = U.deepClone(bap); else delete it.autoParams;
            } else {
              Object.keys(CL_AUTO_PARAM_RULES).forEach(function (key) {
                if (it.autoParams[key] === undefined || CL_AUTO_PARAM_RULES[key](it.autoParams[key])) return;
                if (bap && bap[key] !== undefined) it.autoParams[key] = U.deepClone(bap[key]); else delete it.autoParams[key];
              });
              ['minDays', 'minHours', 'monthsAfter'].forEach(function (key) {
                if (it.autoParams[key] !== undefined) it.autoParams[key] = Number(it.autoParams[key]);
              });
            }
          }
          return it;
        });
        return b;
      });
      return sec;
    });
    if (typeof out.mustFailJumpTo !== 'string' || !out.sections.some(function (s) { return s.id === out.mustFailJumpTo; })) out.mustFailJumpTo = '';
    return out;
  }

  // normalizeProfile から呼ぶ（fillStages の後・毎回・冪等）。旧プロファイル（checklist なし）には既定の台本を補う
  function fillChecklist(merged, base, raw, report) {
    const rc = raw.checklist;
    if (!U.isObj(rc) || !clHasSections(rc)) {
      merged.checklist = U.deepClone(base.checklist);
      if (rc === undefined || rc === null) { if (report) report.checklistAdded = true; }
      return;
    }
    merged.checklist = normalizeChecklistDef(merged.checklist, base.checklist);
  }

  // 保存前チェック（validateProfile から呼ぶ。SPEC-checklist 5-4）
  function validateChecklist(p, errors, warnings) {
    const cl = p.checklist;
    if (!U.isObj(cl)) return;
    const R = clRules();
    const types = R.CHECKLIST_BLOCK_TYPES || [];
    const kinds = R.CHECKLIST_FIELD_KINDS || [];
    const autos = R.CHECKLIST_AUTO || {};
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
          if (it.auto !== undefined && it.auto !== '' && (autos[b.type] || []).indexOf(it.auto) < 0) errors.push(P0 + ' ' + bn + 'の' + (k + 1) + '行目の自動表示の種類が正しくありません。');
          const ap = U.isObj(it.autoParams) ? it.autoParams : {};
          Object.keys(CL_AUTO_PARAM_RULES).forEach(function (key) {
            if (ap[key] !== undefined && !CL_AUTO_PARAM_RULES[key](ap[key])) {
              errors.push(P0 + ' ' + bn + 'の' + (k + 1) + '行目の自動表示の設定（' + key + '）が範囲外です。');
            }
          });
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

  // v2 内での既定文言の変更。旧既定と完全一致するものだけ新既定へ（編集済みの文言は維持）
  const V2_TEXT_UPGRADES = {
    rules: {
      shift_unanswered: ['面接で確認が必要なシフト条件があります（{missingLabels}）。面接で確認し、Step3「シフト条件の最終確認」に入力してください。'],
      // 繁忙期は既定で面接時に確認するため、面接後にも意味が通る文言へ（「面接実施の可否」→「採用可否」）
      vacation_ng: ['繁忙期（{vacationLabels}）の勤務ができません。新宿は連休・長期休暇の貢献を重視するため、面接実施の可否を判断してください。']
    },
    texts: { contributionIntro: ['応募情報から計算したシフト貢献度の見込みです。「未確認」は面接で確認し、Step3「シフト条件の最終確認」で入力すると確定します。'] }
  };
  function upgradeTexts(merged, base) {
    (merged.handoffRules || []).forEach(function (r) {
      const olds = V2_TEXT_UPGRADES.rules[r && r.id];
      const b = olds && base.handoffRules.find(function (x) { return x.id === r.id; });
      if (b && olds.indexOf(r.text) >= 0) r.text = b.text;
    });
    Object.keys(V2_TEXT_UPGRADES.texts).forEach(function (k) {
      if (merged.texts && V2_TEXT_UPGRADES.texts[k].indexOf(merged.texts[k]) >= 0) merged.texts[k] = base.texts[k];
    });
  }

  // 法令ルールは常に ON・重要度固定
  function enforceLocked(merged) {
    const locked = (global.RecruitRules && global.RecruitRules.LOCKED_RULES) || {};
    (merged.handoffRules || []).forEach(function (r) {
      if (r && locked[r.id]) { r.enabled = true; r.severity = locked[r.id]; }
    });
  }

  // 既定値に不足キーを補う。既定に追加された新ルールも末尾に追加する。
  // report を渡すと、旧形式から移行したとき report.migratedFrom に元の版数を入れる。
  // 冪等: normalizeProfile(normalizeProfile(x)) と normalizeProfile(x) は同じ内容になる。
  function normalizeProfile(p, report) {
    const raw = U.isObj(p) ? p : {};
    const fromVersion = Number(raw.schemaVersion) || 1;
    const base = defaults();
    const merged = U.deepClone(U.deepMerge(base, raw));
    merged.handoffRules = Array.isArray(merged.handoffRules) ? merged.handoffRules.filter(function (r) { return U.isObj(r); }) : [];
    const ids = {};
    merged.handoffRules.forEach(function (r) { if (r.id) ids[r.id] = true; });
    base.handoffRules.forEach(function (r) { if (!ids[r.id]) merged.handoffRules.push(U.deepClone(r)); });
    merged.evaluation = U.isObj(merged.evaluation) ? merged.evaluation : U.deepClone(base.evaluation);
    if (!Array.isArray(merged.evaluation.items) || !merged.evaluation.items.length) {
      merged.evaluation.items = U.deepClone(base.evaluation.items);
    }
    if (fromVersion < 2) {
      migrateV1(merged, base, raw);
      if (report) report.migratedFrom = fromVersion;
    }
    fillArrays(merged, base);
    fillStages(merged, base);
    fillChecklist(merged, base, raw, report);
    upgradeTexts(merged, base);
    enforceLocked(merged);
    // 運用モード（docs/SPEC-script-mode.md 1-1）。無い・不正は台本モード。保存済みの設定に mode が無かったときは report.modeAdded
    // （空オブジェクト = 保存済み設定なし は知らせない）
    const rawMode = raw.mode;
    merged.mode = (rawMode === 'script' || rawMode === 'full') ? rawMode : 'script';
    if (report && rawMode !== 'script' && rawMode !== 'full' && Object.keys(raw).length) report.modeAdded = true;
    merged.schemaVersion = 2;
    return merged;
  }

  // 保存前チェック（DOM 非依存）。errors があれば保存しない。
  function validateProfile(p) {
    const errors = [], warnings = [];
    p = p || {};
    if (p.mode !== undefined && p.mode !== 'script' && p.mode !== 'full') errors.push('運用モード（台本モード／詳細モード）が正しくありません。');
    const inRange = function (v, lo, hi) { return isNum(v) && Number(v) >= lo && Number(v) <= hi; };
    const isTime = function (v) { return /^\d{1,2}:\d{2}$/.test(String(v || '')) && Number(String(v).split(':')[0]) < 24 && Number(String(v).split(':')[1]) < 60; };
    const ev = p.evaluation || {}, th = ev.thresholds || {};
    if (!inRange(th.recommendPct, 0, 100) || !inRange(th.reviewPct, 0, 100) || !(Number(th.recommendPct) > Number(th.reviewPct))) {
      errors.push('面接評価の境界（高 > 中、0〜100%）が正しくありません。');
    }
    const co = p.contribution || {}, bands = co.bands || {};
    if (!inRange(bands.highPct, 0, 100) || !inRange(bands.midPct, 0, 100) || !(Number(bands.highPct) > Number(bands.midPct))) {
      errors.push('シフト貢献度の境界（高 > 中、0〜100%）が正しくありません。');
    }
    const o = p.options || {};
    const seen = {};
    (o.vacationItems || []).forEach(function (v, i) {
      const name = '繁忙期「' + ((v && v.label) || (i + 1) + '行目') + '」';
      if (!v || !v.id) { errors.push(name + 'の id が空です。'); return; }
      if (seen[v.id]) errors.push(name + 'の id「' + v.id + '」が重複しています。');
      seen[v.id] = true;
      // 上限日数 1〜62（perWeek は 7 固定扱いのため検査しない）
      const maxOk = v.unit === 'perWeek' || v.maxDays == null || inRange(v.maxDays, 1, 62);
      if (!maxOk) errors.push(name + 'の上限日数は1〜62にしてください。');
      const maxDays = v.unit === 'perWeek' ? 7 : Number(v.maxDays);
      if (!isNum(v.refDays) || Number(v.refDays) < 1) errors.push(name + 'の満点日数は1以上にしてください。');
      else if (maxOk && isNum(maxDays) && Number(v.refDays) > maxDays) errors.push(name + 'の満点日数が上限日数を超えています。');
      if (v.weight != null && !inRange(v.weight, 0, 10)) errors.push(name + 'の重みは0〜10にしてください。');
    });
    const ratioChecks = [
      ['△（要相談）の割合', co.consultFactor],
      ['土日の推定割合（両日）', (co.weekendDerived || {}).both],
      ['土日の推定割合（片方）', (co.weekendDerived || {}).one],
      ['土日片方の上限', co.weekendOneDayCap],
      ['22時以降○の割合', co.lateNightAvailFactor],
      ['土日頻度の要確認しきい値', (p.params || {}).weekendFreqWarnBelow]
    ];
    (o.weekendFrequencies || []).forEach(function (x) { ratioChecks.push(['土日頻度「' + (x && x.label) + '」の割合', x && x.ratio]); });
    (o.allNightFrequencies || []).forEach(function (x) { ratioChecks.push(['オールナイト頻度「' + (x && x.label) + '」の割合', x && x.ratio]); });
    (o.workPeriods || []).forEach(function (x) { if (x && x.contributionRatio != null) ratioChecks.push(['勤務期間「' + x.label + '」の貢献度割合', x.contributionRatio]); });
    ratioChecks.forEach(function (rc) { if (rc[1] != null && !inRange(rc[1], 0, 1)) errors.push(rc[0] + 'は0〜1にしてください。'); });
    // SPEC 4-5 の範囲（負の満点は黙って計算から外れ、極端な満点は1項目が貢献度を支配するため保存させない）
    (co.items || []).forEach(function (it, i) {
      if (!it) return;
      const nm = 'シフト貢献度「' + (it.label || it.id || (i + 1) + '行目') + '」';
      if (!inRange(it.max, 0, 100) || Number(it.max) % 1 !== 0) errors.push(nm + 'の満点は0〜100の整数にしてください。');
    });
    const tg = co.targets || {};
    [['クローズの満点日数', tg.closeDaysPerWeek], ['オープンの満点日数', tg.openDaysPerWeek], ['週の勤務日数の満点', tg.weeklyDaysFull]].forEach(function (t) {
      if (t[1] != null && !inRange(t[1], 1, 7)) errors.push(t[0] + 'は1〜7にしてください。');
    });
    if (co.busyStrongPct != null && !inRange(co.busyStrongPct, 0, 100)) errors.push('繁忙期の強みを出す得点率は0〜100%にしてください。');
    (o.workPeriods || []).forEach(function (x) {
      if (x && x.minMonths != null && !inRange(x.minMonths, 0, 60)) errors.push('勤務期間「' + x.label + '」の最低月数は0〜60にしてください。');
    });
    const cells = (p.matrix || {}).cells || {};
    MATRIX_KEYS.forEach(function (k) { if (RESULTS.indexOf(cells[k]) < 0) errors.push('2軸判定のマス「' + k + '」の結果が正しくありません。'); });
    const pr = p.params || {};
    if (pr.dayBoundaryHour != null && !inRange(pr.dayBoundaryHour, 0, 12)) errors.push('終電の日付の区切りは0〜12時にしてください。');
    [['オールナイト開始', pr.allNightShiftStart], ['オールナイト終了', pr.allNightShiftEnd], ['高校生の終了上限', pr.highschoolLatestEnd]].forEach(function (t) {
      if (t[1] != null && t[1] !== '' && !isTime(t[1])) errors.push(t[0] + 'の時刻は HH:MM で入力してください。');
    });
    if (pr.closeShiftStandardEnd && !isTime(pr.closeShiftStandardEnd)) errors.push('クローズ標準終了の時刻は HH:MM で入力してください。');

    const sum = (co.items || []).reduce(function (a, it) { return a + (it && it.enabled !== false && isNum(it.max) ? Math.max(0, Number(it.max)) : 0); }, 0);
    if (sum <= 0) warnings.push('有効なシフト貢献度項目の満点合計が0のため、2軸判定は自動で無効になります（面接評価のみで判定）。');
    const cats = (o.categories || []).map(function (c) { return c && c.value; });
    ((p.highschoolPolicy || {}).exceptionCategories || []).forEach(function (c) {
      if (cats.indexOf(c) < 0) warnings.push('高校生の例外区分「' + c + '」は区分の選択肢にありません。');
    });
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

  function parseProfileJSON(text, report) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !obj.meta || !obj.handoffRules) {
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

  // ---------- 応募者レコード ----------
  function buildRecord(state) {
    const h = state.handoff;
    const R = global.RecruitRules;
    let contribution = null, highschool = null;
    try { contribution = R.computeContribution(state.applicant, state.profile); } catch (e) { contribution = null; }
    try {
      const hs = R.highschoolStatus(state.applicant, state.profile);
      highschool = hs.applicable ? { status: hs.status, reasonsText: hs.reasonsText, mode: (state.profile.highschoolPolicy || {}).mode || '' } : null;
    } catch (e) { highschool = null; }
    return {
      kind: RECORD_KIND,
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      profile: { theaterName: state.profile.meta.theaterName, version: state.profile.meta.version, schemaVersion: 2 },
      step: state.step,
      // 保存時の運用モード（'script' | 'full'）。保存 HTML の形はこれで決める（旧レコードは無し＝'full'）
      mode: R.isScriptMode(state.profile) ? 'script' : 'full',
      // 保存時点の入力の段階（レポートの「応募時の情報／面接で確認した情報」の振り分け用。読込では使わない）
      inputStages: U.deepClone(state.profile.inputStages || null),
      applicant: U.deepClone(state.applicant),
      handoff: {
        // deferred / section / aggregate は該当するときだけ付ける（SPEC-stages 6-1）
        items: h ? h.items.map(function (i) {
          const out = { id: i.id, severity: i.severity, category: i.category, text: i.text };
          if (i.deferred) { out.deferred = true; out.section = i.section; }
          if (i.aggregate) out.aggregate = true;
          return out;
        }) : [],
        strengths: h ? h.strengths.map(function (s) { return s.text; }) : [],
        checks: U.deepClone(state.handoffChecks || {}),
        note: state.handoffNote || ''
      },
      // 旧形式（10項目×5点）の面接評価。新しい面接では {}（面接はチェックリストで評価する）
      scores: U.deepClone(state.scores || {}),
      // 面接チェックリストの回答（SPEC-checklist 1-4）と保存時点の台本（レポートの文言・並び用。読込では使わない）
      checklist: U.deepClone(U.isObj(state.checklist) ? state.checklist : R.emptyChecklist()),
      checklistDef: state.profile.checklist ? U.deepClone(state.profile.checklist) : null,
      interviewNotes: state.interviewNotes || '',
      // 応募者の管理（押印）: { initial: { name, short, title, date, at }, ... }
      management: U.deepClone(state.management || {}),
      // 最終合否（人の決定）: { result, label, date, at, by: { name, short, title } } または null。判定とは独立
      decision: normalizeDecision(state.decision),
      // 保存時点のスナップショット（レポート表示・監査用。読み込み時は現在の設定で再計算する）
      contribution: contribution ? U.deepClone(contribution) : null,
      highschool: highschool,
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

  // ---------- HTMLレポート生成 ----------
  const HS_STATUS_LABELS = {
    excluded: '原則対象外',
    exception_met: '例外対象（条件充足）',
    exception_unmet: '例外条件 未充足',
    exception_incomplete: '例外条件 未入力あり',
    allowed: '制限なし'
  };
  const MODE_LABELS = {
    matrix: '2軸判定（面接評価 × シフト貢献度）',
    incomplete: 'シフト条件が未確定のため面接評価のみで判定（採用推奨には留めない）',
    interviewOnly: '面接評価のみで判定（シフト貢献度 OFF）'
  };
  const SHORT_RESULT = { recommend: '推奨', review: '上長', reject: '不採用' };
  const FLAG_LABELS = { unanswered: '未確認', restricted: '法令/運用で対象外', estimated: '推定' };

  // ---------- HTML レポートのスタイル（アプリと同じデザイントークン。印刷・共有向けにライトテーマ固定） ----------
  function reportCss() {
    return [
      ':root{--bg:#f3f5f8;--surface:#fff;--surface-2:#f8fafc;--surface-3:#eef2f6;--text:#1a2233;--muted:#5b6675;--border:#dde3ea;--accent:#1f5fbf;--accent-soft:#e6eefb;--ok:#0e9f6e;--ok-soft:#e3f6ee;--warn:#d97706;--warn-soft:#fdf1dc;--danger:#dc2626;--danger-soft:#fde8e8;--info:#2563eb;--info-soft:#e5edff;color-scheme:light}',
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
      // サマリータイル
      '.dash{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}',
      '.tile{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;min-width:0}',
      '.tile .t-label{font-size:11.5px;font-weight:700;letter-spacing:.06em;color:var(--muted)}',
      '.tile .t-val{font-size:24px;font-weight:800;line-height:1.2;margin-top:2px;font-variant-numeric:tabular-nums}.tile .t-val small{font-size:12px;font-weight:600;color:var(--muted);margin-left:2px}',
      '.tile .t-val.txt{font-size:15px;line-height:1.4;margin-top:6px}',
      '.tile .t-sub{font-size:12px;color:var(--muted);margin-top:2px}',
      '.meter{height:7px;border-radius:999px;background:var(--surface-3);overflow:hidden;margin-top:8px}.meter>span{display:block;height:100%;border-radius:999px;background:var(--accent)}',
      '.meter>span.hi{background:var(--ok)}.meter>span.mid{background:var(--warn)}.meter>span.lo{background:var(--danger)}',
      '.counts{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}',
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
      'table.list{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px}',
      'table.list th{text-align:left;font-weight:600;color:var(--muted);background:var(--surface-2);padding:7px 10px;border-bottom:1px solid var(--border)}',
      'table.list td{padding:7px 10px;border-bottom:1px solid var(--surface-3);vertical-align:top}',
      'table.list td.num,table.list th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
      'table.list tr.total td{font-weight:800;background:var(--surface-2);border-top:2px solid var(--border)}table.list tr.na td{color:#8a94a3}',
      // バー
      '.bars{display:flex;flex-direction:column;gap:7px}',
      '.bar{display:grid;grid-template-columns:minmax(0,1fr) 150px 4.5em;gap:12px;align-items:center;font-size:13.5px}',
      '.bar.wide{grid-template-columns:minmax(0,1fr) 150px 5.5em}',
      '.bar .b-label{min-width:0}.bar .b-label small{display:block;font-size:11.5px;color:var(--muted);line-height:1.4}',
      '.bar .b-track{height:9px;border-radius:999px;background:var(--surface-3);overflow:hidden}.bar .b-track>span{display:block;height:100%;border-radius:999px;background:var(--accent)}',
      '.bar .b-track>span.hi{background:var(--ok)}.bar .b-track>span.mid{background:var(--warn)}.bar .b-track>span.lo{background:var(--danger)}',
      '.bar .b-val{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.bar .b-val small{font-weight:600;color:var(--muted)}',
      '.bar.overall .b-label{font-weight:700}.bar.na{color:#8a94a3}',
      '.total-line{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-top:12px;padding:10px 14px;border-radius:8px;background:var(--surface-2);border:1px solid var(--border);font-size:13.5px}',
      '.total-line b{font-size:22px;font-weight:800}.total-line .right{margin-left:auto;font-weight:700;display:flex;align-items:center;gap:8px}',
      // バッジ・タグ
      '.badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;background:var(--surface-3);color:var(--muted)}',
      '.badge.ok{background:var(--ok-soft);color:var(--ok)}.badge.warn{background:var(--warn-soft);color:var(--warn)}.badge.danger{background:var(--danger-soft);color:var(--danger)}.badge.info{background:var(--info-soft);color:var(--info)}.badge.accent{background:var(--accent-soft);color:var(--accent)}',
      '.badge.lg{font-size:14px;padding:5px 14px}',
      '.tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:5px;background:var(--surface-3);color:#3a4556;white-space:nowrap;vertical-align:1px}',
      '.tag.warn{background:var(--warn-soft);color:#9a5b00}.tag.danger{background:var(--danger-soft);color:#b42318}.tag.ok{background:var(--ok-soft);color:#0b7a55}',
      // 留意点
      '.hgroup{margin-bottom:12px}.hgroup:last-child{margin-bottom:0}',
      '.hgroup-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12.5px;color:var(--muted)}.hgroup-head b{color:var(--text)}',
      'ul.hlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}',
      'li.h{display:grid;grid-template-columns:20px 1fr;gap:10px;align-items:start;padding:9px 12px;border:1px solid var(--border);border-left-width:4px;border-radius:8px;font-size:13.5px;background:var(--surface)}',
      'li.h.block{border-left-color:var(--danger)}li.h.warn{border-left-color:var(--warn)}li.h.info{border-left-color:var(--info)}',
      'li.h.done{background:var(--ok-soft);border-color:#bfe3d3;border-left-color:var(--ok)}li.h.done .txt{color:var(--muted)}',
      'li.h .box{font-size:16px;line-height:1.2;color:var(--muted)}li.h.done .box{color:var(--ok)}',
      'li.h .hmeta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:2px}',
      'li.h .sev{font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:var(--surface-3);color:var(--muted)}',
      'li.h .sev.block{background:var(--danger-soft);color:var(--danger)}li.h .sev.warn{background:var(--warn-soft);color:var(--warn)}li.h .sev.info{background:var(--info-soft);color:var(--info)}',
      'li.h .cat{font-size:11px;color:var(--muted);padding:0 6px;border:1px solid var(--border);border-radius:4px}',
      'li.h .txt{line-height:1.55}',
      'ul.strengths{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 16px}',
      'ul.strengths li{position:relative;padding-left:1.4em;font-size:13.5px}ul.strengths li::before{content:"✓";position:absolute;left:0;color:var(--ok);font-weight:800}',
      '.callout{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border);border-left:4px solid var(--warn);border-radius:8px;padding:10px 12px;margin-top:12px;font-size:13.5px;background:var(--warn-soft)}',
      '.callout.danger{border-left-color:var(--danger);background:var(--danger-soft)}.callout.ok{border-left-color:var(--ok);background:var(--ok-soft)}.callout.info{border-left-color:var(--info);background:var(--info-soft)}',
      '.callout>div{min-width:0}.callout .muted{display:block}',
      '.note{white-space:pre-wrap;background:var(--surface-2);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:8px;padding:12px 14px;font-size:14px;line-height:1.7}',
      '.muted{color:var(--muted)}.empty{color:var(--muted);font-size:13.5px}',
      // 判定
      '.result{border:2px solid var(--border);border-radius:12px;padding:18px 20px;background:var(--surface)}',
      '.result.recommend{border-color:var(--ok);background:linear-gradient(180deg,var(--ok-soft),#fff 60%)}.result.review{border-color:var(--warn);background:linear-gradient(180deg,var(--warn-soft),#fff 60%)}.result.reject{border-color:var(--danger);background:linear-gradient(180deg,var(--danger-soft),#fff 60%)}',
      '.result-kicker{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--muted)}',
      '.result-title{font-size:24px;font-weight:800;margin:2px 0 6px}',
      '.result.recommend .result-title{color:var(--ok)}.result.review .result-title{color:var(--warn)}.result.reject .result-title{color:var(--danger)}',
      '.result-body{font-size:14.5px}',
      '.result-must{margin-top:8px;font-size:13px;display:flex;flex-wrap:wrap;align-items:center;gap:4px}',
      '.result-note{margin-top:10px;padding:9px 12px;background:rgba(255,255,255,.75);border:1px solid var(--border);border-radius:8px;font-size:13.5px}',
      '.axes{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:14px}',
      '.axis{background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px 12px;min-width:0}',
      '.axis .a-label{font-size:11.5px;font-weight:700;color:var(--muted);letter-spacing:.04em}.axis .a-val{font-size:20px;font-weight:800;line-height:1.2;margin-top:2px;font-variant-numeric:tabular-nums}.axis .a-val small{font-size:12px;font-weight:600;color:var(--muted)}.axis .a-val.txt{font-size:13.5px;line-height:1.45;margin-top:4px}.axis .a-sub{font-size:12px;color:var(--muted);margin-top:2px}',
      '.mx-wrap{margin-top:12px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px}',
      '.mx{border-collapse:separate;border-spacing:4px;width:100%;font-size:12.5px}',
      '.mx th{font-weight:700;text-align:center;padding:6px 4px;color:var(--text)}.mx th small{display:block;font-weight:600;color:var(--muted);font-size:11px}',
      '.mx thead th:first-child{text-align:left;color:var(--muted);font-size:11.5px;font-weight:600}',
      '.mx td{text-align:center;padding:9px 6px;border-radius:7px;font-weight:600;background:var(--surface-3)}',
      '.mx td.recommend{background:var(--ok-soft);color:#0b7a55}.mx td.review{background:var(--warn-soft);color:#9a5b00}.mx td.reject{background:var(--danger-soft);color:#b42318}',
      '.mx td.cur{outline:3px solid var(--text);outline-offset:-3px;font-weight:800}',
      '.mx-note{font-size:12px;color:var(--muted);margin-top:6px}',
      '.adj{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}',
      '.adj li{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.75);border:1px solid var(--border);font-size:13px}',
      '.adj .step{white-space:nowrap;font-weight:700;color:var(--muted)}',
      '.adj-head{margin-top:14px;font-size:13px;font-weight:700}',
      '.warn-list{margin:10px 0 0;padding-left:1.3em;font-size:13px}.warn-list li{margin-bottom:3px}',
      '.disclaimer{margin-top:12px;font-size:12px;color:var(--muted)}',
      '.foot{margin-top:28px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);line-height:1.6;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      // 押印欄
      '.stamp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
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
      '@media (max-width:720px){.stamp-row{grid-template-columns:1fr}}',
      // 申し送りシート（A4 1枚）印刷
      '.rtool{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-size:12.5px;color:var(--muted)}',
      '.rtool button{font:inherit;font-size:12.5px;font-weight:700;padding:5px 11px;border-radius:6px;border:1px solid #c7d0db;background:#fff;color:var(--text);cursor:pointer}.rtool button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.rtool-hint{font-size:11.5px}',
      // 表示切替（報告書／詳細）と報告書表示（docs/SPEC-report.md 5-1）。報告書表示の規則は画面だけ・印刷準備中（print-*）は外す
      '.rtool-view{display:inline-flex;border:1px solid #c7d0db;border-radius:7px;overflow:hidden;background:#fff}',
      '.rtool .rtool-view button{border:none;border-radius:0;padding:5px 14px;color:var(--muted);background:#fff}',
      '.rtool .rtool-view button+button{border-left:1px solid #c7d0db}',
      '.rtool .rtool-view button.on{background:#24324a;color:#fff}',
      '.rtool-sep{width:1px;height:20px;background:var(--border);margin:0 4px}',
      '.paper-wrap{display:none}',
      '.paper-cap{display:flex;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;width:210mm;max-width:100%;margin:0 auto 6px;font-size:12px;color:var(--muted)}.paper-cap b{color:var(--text)}',
      '.paper{box-sizing:content-box;width:190mm;margin:0 auto;padding:10mm;background:#fff;color:#111;border:1px solid #d5dbe3;border-radius:2px;box-shadow:0 1px 2px rgba(16,24,40,.08),0 12px 32px rgba(16,24,40,.12)}',
      '.paper .cl-mode-sheet .cl-page+.cl-page{margin-top:8mm;padding-top:6mm;border-top:1px dashed #b8c2cf}',
      '@media screen{',
      'body.view-report.has-cl:not(.print-checklist):not(.print-handoff) .page>:not(.rtool):not(.paper-wrap):not(section[data-sec="mgmt"]):not(.foot){display:none}',
      'body.view-report.has-cl:not(.print-checklist):not(.print-handoff) .paper-wrap{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 2px 14px}',
      'body.view-report.has-cl:not(.print-checklist):not(.print-handoff) section.sec[data-sec="mgmt"]{max-width:210mm;margin:12px auto 0}',
      'body.view-report.has-cl:not(.print-checklist):not(.print-handoff) section.sec[data-sec="mgmt"] h2::before{display:none}',
      'body.view-report:not(.has-cl):not(.print-checklist):not(.print-handoff) .dash{display:none}',
      'body.view-report:not(.has-cl):not(.print-checklist):not(.print-handoff) section.sec:not([data-sec="pre"]):not([data-sec="comment"]):not([data-sec="handoff"]):not([data-sec="interview"]):not([data-sec="mgmt"]){display:none}',
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
      '@media print{.paper-wrap,.dec-ctl,.dec-hint{display:none !important}.decision.is-none{display:none !important}body.print-checklist #decision,body.print-handoff #decision,body.print-handoff .rh-decision{display:none !important}.decision{break-inside:avoid;padding:6px 10px;margin-bottom:8px;gap:4px 12px}.dec-stamp{width:100px;height:64px}.dec-stamp .verdict-stamp{width:96px;height:61px}.decision,.verdict-stamp,.dec-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
      '.print-only{display:none}',
      '@page sheet{size:A4;margin:7mm 9mm}',
      '@media print{.rtool{display:none !important}',
      'body.print-handoff{page:sheet;font-size:10px;line-height:1.35}',
      'body.print-handoff .print-only{display:block}body.print-handoff .sheet-title{font-size:13px;font-weight:800;color:var(--accent);margin-bottom:2px}',
      'body.print-handoff .dash,body.print-handoff .verdict,body.print-handoff .rh-top,body.print-handoff .foot,body.print-handoff .mgmt-note,body.print-handoff .stamp-hint,body.print-handoff .stamp-ctl,body.print-handoff .mgmt-save{display:none !important}',
      'body.print-handoff section.sec:not([data-sec="pre"]):not([data-sec="comment"]):not([data-sec="handoff"]):not([data-sec="interview"]):not([data-sec="mgmt"]){display:none !important}',
      'body.print-handoff .rh{border-radius:5px}body.print-handoff .rh-main{padding:3px 10px 4px;gap:10px}body.print-handoff .rh-name{font-size:16px;margin:0 0 3px}body.print-handoff .rh-name small{font-size:10px}body.print-handoff .rh-kicker{display:none}body.print-handoff .chip{font-size:9px;padding:0 6px}body.print-handoff .rh-chips{gap:4px}',
      'body.print-handoff .sec{padding:4px 8px 5px;margin-top:4px;border-radius:5px;box-shadow:none}body.print-handoff .sec h2{font-size:11px;padding-bottom:3px;margin-bottom:4px;gap:6px}body.print-handoff .sec h2::before{width:15px;height:15px;font-size:9.5px;border-radius:4px}body.print-handoff .sec h3{font-size:9.5px;margin:4px 0 2px;padding-bottom:1px}',
      'body.print-handoff table.kv{font-size:10px;display:block}body.print-handoff table.kv tbody{display:block;columns:2;column-gap:14px}body.print-handoff table.kv tr{display:grid;grid-template-columns:6.5em 1fr;break-inside:avoid;border-bottom:1px solid #eef2f6}body.print-handoff table.kv th,body.print-handoff table.kv td{padding:1px 4px 1px 0;border:none;width:auto}',
      'body.print-handoff .note{padding:2px 8px;font-size:10px;line-height:1.35}body.print-handoff .callout{padding:3px 8px;font-size:10px;margin-top:5px}',
      'body.print-handoff li.h{padding:1px 6px;gap:5px;grid-template-columns:12px 1fr;font-size:9.7px;border-left-width:3px;border-radius:4px;break-inside:avoid}body.print-handoff li.h .box{font-size:11px}body.print-handoff li.h .hmeta{margin-bottom:0;gap:4px}body.print-handoff li.h .sev,body.print-handoff li.h .cat,body.print-handoff .tag{font-size:8px;padding:0 4px}body.print-handoff li.h .txt{line-height:1.3}',
      'body.print-handoff ul.hlist{gap:2px}body.print-handoff .hgroup{margin-bottom:4px}body.print-handoff .hgroup-head{margin-bottom:2px;font-size:9.5px;gap:6px}body.print-handoff .hgroup-head>span:not(.badge){display:none}body.print-handoff .badge{font-size:8.5px;padding:0 5px}',
      'body.print-handoff ul.strengths{gap:0 12px}body.print-handoff ul.strengths li{font-size:10px}',
      'body.print-handoff .sheet-2col ul.hlist{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;align-items:start}',
      'body.print-handoff .stamp-row{gap:8px}body.print-handoff .stamp-box{display:flex;align-items:center;gap:8px;text-align:left;padding:2px 8px}body.print-handoff .stamp-label{font-size:10px;min-width:5.5em}body.print-handoff .stamp-area{height:auto}body.print-handoff .hanko{width:46px;height:46px}body.print-handoff .stamp-empty{width:44px;height:44px;font-size:8.5px}body.print-handoff .stamp-meta{font-size:9px;min-height:0;line-height:1.3}}',
      '@media print{.stamp-ctl,.mgmt-save,.mgmt-note{display:none !important}.stamp-row{break-inside:avoid}.hanko,.stamp-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
      '@media (max-width:720px){.dash{grid-template-columns:repeat(2,minmax(0,1fr))}.rh-main{flex-direction:column;align-items:stretch}.verdict{align-items:flex-start}ul.strengths{grid-template-columns:1fr}.bar,.bar.wide{grid-template-columns:minmax(0,1fr) 90px 4.5em}.rh-top{flex-direction:column;align-items:flex-start}.rh-meta{text-align:left}}',
      // 全体印刷: 画面用の余白を詰め、大きなブロックは途中で改ページ可にして各ページ下部の空白を減らす
      '@media print{@page{size:A4;margin:10mm 11mm}body{background:#fff;font-size:11px;line-height:1.45}.page{padding:0;max-width:none}',
      '.rh,.sec,.tile,.result,li.h{box-shadow:none}.rh{border-radius:8px}.rh-top{padding:5px 14px}.rh-main{padding:8px 14px;gap:12px}.rh-name{font-size:19px;margin:0 0 4px}.rh-chips{gap:4px}.chip{font-size:10.5px;padding:1px 8px}.verdict{padding:6px 12px;min-width:170px;gap:0}.verdict .v-title{font-size:16px}',
      '.dash{margin-top:8px;gap:8px}.tile{padding:7px 10px}.tile .t-val{font-size:17px}.tile .t-label{font-size:10.5px}.meter{margin-top:5px}',
      '.sec{margin-top:8px;padding:9px 14px 11px;border-radius:8px}.sec h2{font-size:12.5px;margin-bottom:7px;padding-bottom:5px}.sec h2::before{width:20px;height:20px;font-size:11px}.sec h3{margin:9px 0 5px}',
      'table.kv th,table.kv td{padding:2px 8px 2px 0}table.kv tr{break-inside:avoid}table.list th,table.list td{padding:3px 8px}',
      'li.h{padding:4px 9px}ul.hlist{gap:4px}.hgroup{margin-bottom:7px}.hgroup-head{margin-bottom:4px}ul.strengths{gap:3px 14px}.note{padding:7px 11px}.callout{padding:7px 10px;margin-top:8px}',
      '.bars{gap:4px}.bar{grid-template-columns:minmax(0,1fr) 120px 4.5em}.bar.wide{grid-template-columns:minmax(0,1fr) 120px 5.5em}.total-line{padding:6px 10px;margin-top:8px}.total-line b{font-size:16px}',
      '.result{padding:11px 14px;break-inside:auto}.result-title{font-size:18px}.axes{margin-top:8px;gap:8px}.axis{padding:6px 10px}.axis .a-val{font-size:15px}.mx-wrap{margin-top:8px;padding:6px}.mx td{padding:6px 4px}.adj{margin-top:8px}.adj li{padding:5px 10px}',
      '.stamp-row{gap:8px}.stamp-box{padding:8px}.stamp-area{height:80px}.hanko{width:70px;height:70px}.stamp-empty{width:66px;height:66px}.foot{margin-top:12px}',
      '.dash,.tile,.mx-wrap,li.h,.bar,table.list tr,.callout,.note,.total-line,.axes,.stamp-row,.adj li{break-inside:avoid}.sec h2,.sec h3,.result-kicker,.result-title,.result-body,.hgroup-head{break-after:avoid}',
      '.verdict,.result,.mx td,.badge,.tag,.sev,.meter>span,.b-track>span,li.h.done,.callout,.tile,.rh-mark,.sec h2::before{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    ].join('\n');
  }

  // ---------- 面接チェックリスト（報告書の描画。アプリの A4 報告・保存レポートで共用。docs/SPEC-checklist.md 4-2） ----------
  //   DOM 非依存の HTML 文字列を返す。o = { mode: 'section' | 'sheet', stamps: html文字列 | '' }
  //   'section' = 保存レポートの「面接チェックリスト」節、'sheet' = A4「面接チェックリスト報告」（ヘッダー・判定サマリー・押印欄つき）
  const CL_SHEET_PAGE_PX = 1040;   // A4 の印字可能高さ（297mm − 上下余白 16mm ≒ 1062px）の安全側。1 ページ目がこれを超えたら .cl-fit
  const CL_TONE_CLASS = { ok: 't-ok', warn: 't-warn', danger: 't-danger', info: 't-info', muted: 't-muted' };
  function clFmtDate(v) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asStr(v)); return m ? m[1] + '/' + m[2] + '/' + m[3] : asStr(v); }
  function clFmtMonth(v) { const m = /^(\d{4})-(\d{2})$/.exec(asStr(v)); return m ? m[1] + '年' + Number(m[2]) + '月' : asStr(v); }

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
    // 運用モードは保存時の記録で決める（台本モードの記録は自動表示なし。docs/SPEC-script-mode.md 3-6）
    const scriptRec = R.isScriptRecord(record);
    const prof = Object.assign({}, profile, { checklist: def, mode: scriptRec ? 'script' : 'full' });
    const sum = R.checklistSummary(a, cl, prof, { scores: record.scores, management: record.management });
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
          const suffix = it.fromAuto ? (it.auto === 'firstEnd' ? '（自動）' : '（応募情報より）') : '';
          return '<div><dt>' + esc(it.label) + '</dt><dd>' + (asStr(v).trim() ? esc(v) + (suffix ? '<small>' + suffix + '</small>' : '') : dash) + '</dd></div>';
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
            (it.hint && (mode === 'section' || showQ) ? '<small class="cl-hint">' + esc(it.hint) + '</small>' : '') + '</td>' +
            '<td class="cl-mk">' + (it.value ? esc(it.mark) : '<small>未入力</small>') + '</td>' +
            '<td class="cl-pt">' + (it.points == null ? '' : esc(it.points) + '点') + '</td>' +
            '<td class="cl-nt">' + (asStr(it.note).trim() ? esc(it.note) : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      }
      if (b.type === 'note') return b.note ? '<p class="cl-sflow">→ ' + esc(b.note) + '</p>' : '';
      return '';
    };

    // 「面接で確認した勤務条件」（① の直後・sheet のみ）: 応募情報のうち面接時に確認する段階の行
    let confirmedHtml = '';
    if (mode === 'sheet' && !scriptRec) {
      const stages = record.inputStages || profile.inputStages || {};
      let rows = [];
      try {
        rows = R.describeApplicant(a, profile).filter(function (r) { return r.section !== 'notes' && R.stageOf({ inputStages: stages }, r.section) === 'interview'; });
      } catch (e) { rows = []; }
      if (rows.length) {
        confirmedHtml = '<div class="cl-confirmed"><div class="cl-bt">【面接で確認した勤務条件】</div><dl class="cl-fields cl-kv">' +
          rows.map(function (r) { return '<div><dt>' + esc(r.label) + '</dt><dd>' + esc(r.value) + '</dd></div>'; }).join('') + '</dl></div>';
      }
    }

    // ---- セクション ----
    const secHtml = function (s, isFirst) {
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
        '<div class="cl-s-body">' + body + '</div></section>' +
        (isFirst ? confirmedHtml : '');
    };

    // ---- ページ（台本の 1 枚目・2 枚目）。section.page の出現順にまとめる ----
    const pageNos = [];
    sum.sections.forEach(function (s) { if (pageNos.indexOf(s.page) < 0) pageNos.push(s.page); });
    const confirmAfter = (sum.sections.find(function (s) { return s.blocks.some(function (b) { return b.type === 'must' || b.type === 'fields'; }); }) || sum.sections[0] || {}).id;
    const nameDate = esc(a.name || '応募者') + 'さん' + (sum.header.date ? '　面接日 ' + esc(clFmtDate(sum.header.date)) : '');
    const pagesHtml = pageNos.map(function (no, pi) {
      const pg = (sum.pages || []).find(function (x) { return U.isObj(x) && Number(x.no) === no; }) || {};
      // 台本の各ページの題名・前書き（例: 必須条件一致・継続性／人物確認・逆質問）。保存レポートの節（section）にも出す
      const head = (mode === 'sheet' || pg.title || pg.lead)
        ? '<div class="cl-page-h"><span class="cl-page-no">' + (mode === 'sheet' ? '' : '台本') + esc(no) + '枚目</span><span class="cl-page-t">' + esc(pg.title || '') + '</span>' +
          (mode === 'sheet' && pi > 0 ? '<span class="cl-page-who">' + nameDate + '</span>' : '') +
          (pg.lead ? '<span class="cl-page-lead">' + esc(pg.lead) + '</span>' : '') + '</div>'
        : '';
      return '<div class="cl-page" data-page="' + esc(no) + '">' + head +
        sum.sections.filter(function (s) { return s.page === no; }).map(function (s) { return secHtml(s, s.id === confirmAfter); }).join('') + '</div>';
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
      // 台本モード: Step① のメモ（入力欄「メモ（任意）」）も報告に載せる
      (scriptRec && mode === 'sheet' && asStr(a.reviewerNotes).trim() ? '<div class="cl-ov-row cl-ov-notes"><span class="cl-ov-k">メモ</span><span class="cl-ov-v cl-memo-t">' + esc(asStr(a.reviewerNotes).trim()) + '</span></div>' : '') +
      '</div>';

    // ---- 台本ヘッダー（面接日・担当・応募した求人・タクシー可否・料金）。section / sheet 共通 ----
    //   消極属性は 2026-10-13 に削除（旧レコードの header.negatives は読み飛ばす。docs/SPEC-script-mode.md 12 章）
    const hd = sum.header;
    const chips = [];
    const postingChip = '<span class="cl-hchip"><b>' + esc(((def.header || {}).posting || {}).label || '応募した求人') + '</b>' + txt(hd.postingLabel) + '</span>';
    // 台本モードの記録は常に手入力（「（手入力）」「（自動）」を付けない）
    const taxiChip = '<span class="cl-hchip ' + tone(hd.taxi.tone) + '"><b>タクシー可否・料金</b>' + txt(hd.taxi.text) + (hd.taxi.auto || scriptRec ? '' : '<small>（手入力）</small>') + '</span>';
    // 台本モード: 応募者の属性の順（卒業予定 → 求人 → タクシー。卒業予定は sheet のヘッダーで先頭に足す）。詳細モードは従来どおりタクシー → 求人
    if (scriptRec) chips.push(postingChip, taxiChip);
    else chips.push(taxiChip, postingChip);
    // 目安（台本の合計分）は詳細モードだけ。台本モードのヘッダーは 氏名・区分・年齢・性別・卒業予定・求人・タクシー・面接日・担当
    const kvHtml = '<dl class="cl-sh-kv"><div><dt>面接日</dt><dd>' + (hd.date ? esc(clFmtDate(hd.date)) : dash) + '</dd></div>' +
      '<div><dt>担当</dt><dd>' + txt(hd.interviewer) + (hd.interviewerFromStamp ? '<small>（押印より）</small>' : '') + '</dd></div>' +
      (scriptRec ? '' : '<div><dt>目安</dt><dd>' + esc(sum.minutesTotal) + '分</dd></div>') + '</dl>';

    if (mode === 'section') {
      const secHead = '<div class="cl-sheet-head cl-sec-head">' + kvHtml + '<div class="cl-sh-chips">' + chips.join('') + '</div></div>';
      return '<div class="cl-sheet cl-mode-section">' + secHead + pagesHtml + overallHtml + '</div>';
    }

    // ---- sheet: ヘッダー ----
    const meta = profile.meta || {};
    const opts = profile.options || {};
    let who;
    if (scriptRec) {
      // 台本モード: 区分・年齢・性別と卒業予定（勤務期間・週・希望シフトは出さない）
      who = [a.category, a.age ? a.age + '歳' : '', a.gender].filter(Boolean).join('・');
      if (asStr(a.graduationDate).trim()) chips.unshift('<span class="cl-hchip"><b>卒業予定</b>' + esc(clFmtMonth(asStr(a.graduationDate).trim())) + '</span>');
    } else {
      let shiftsLine = '';
      try { shiftsLine = R.describeShifts(a, profile).join('、'); } catch (e) { shiftsLine = ''; }
      who = [a.category, a.age ? a.age + '歳' : ''].filter(Boolean).join('・');
      if (a.workPeriod) chips.push('<span class="cl-hchip"><b>勤務期間</b>' + esc(R.labelOf(opts.workPeriods, a.workPeriod)) + '</span>');
      if (a.daysMin || a.daysMax) chips.push('<span class="cl-hchip"><b>週</b>' + esc((a.daysMin || '?') + '〜' + (a.daysMax || '?') + '日') + '</span>');
      if (shiftsLine) chips.push('<span class="cl-hchip cl-hchip-wide"><b>希望シフト</b>' + esc(shiftsLine) + '</span>');
    }
    const created = U.fmtDate(record.savedAt ? new Date(record.savedAt) : new Date());
    const headHtml = '<div class="cl-sheet-head">' +
      '<div class="cl-sh-top"><span class="cl-sh-theater">' + esc(meta.theaterName || '') + '</span>' +
      '<span class="cl-sh-title">面接チェックリスト報告<small>（' + esc(def.title || '') + (def.version ? ' ' + esc(def.version) + ' 版' : '') + '）</small></span>' +
      '<span class="cl-sh-date">作成 ' + esc(clFmtDate(created)) + '</span></div>' +
      '<div class="cl-sh-main"><div class="cl-sh-name">' + esc(a.name || '応募者') + '<small>さん</small>' + (who ? '<span class="cl-sh-who">' + esc(who) + '</span>' : '') + '</div>' +
      kvHtml + '</div>' +
      '<div class="cl-sh-chips">' + chips.join('') + '</div></div>';

    // ---- sheet: 判定サマリー（判定を勝手に走らせない。未実施ならその旨） ----
    const j = record.judgment;
    const texts = profile.texts || {};
    const titleOf = function (r) { return ((texts[r] || {}).title) || r; };
    const resTone = { recommend: 't-ok', review: 't-warn', reject: 't-danger' };
    const bandTone = { high: 't-ok', mid: 't-warn', low: 't-danger' };
    // 最終合否（sheet のみ・有効時のみ）。【判定サマリー】の右端に置く（docs/SPEC-report.md 4-7）
    let decHtml = '';
    if (global.RecruitStamp) {
      const dcfg = decisionConfig(profile);
      if (dcfg.enabled) decHtml = global.RecruitStamp.decisionSheet(normalizeDecision(record.decision), decOpts(dcfg, o.decisionId || 'clDecision', o.decisionSvgId || 'vdSheet'));
    }
    const judgeHead = '<div class="cl-bt">【判定サマリー】</div>';
    let judgeHtml;
    if (j && j.result) {
      const iv = j.interview || { total: j.total, max: j.max, pct: j.pct, band: '', bandLabel: '' };
      const jc = j.contribution || {};
      const contribTile = j.mode === 'incomplete'
        ? '<div class="cl-tile"><span class="cl-tile-k">シフト貢献度</span><span class="cl-tile-v">未確定</span><span class="cl-tile-s">面接評価のみで判定</span></div>'
        : j.mode === 'interviewOnly' || !j.interview
          ? '<div class="cl-tile"><span class="cl-tile-k">シフト貢献度</span><span class="cl-tile-v">OFF</span><span class="cl-tile-s">面接評価のみで判定</span></div>'
          : '<div class="cl-tile ' + (bandTone[jc.band] || '') + '"><span class="cl-tile-k">シフト貢献度</span><span class="cl-tile-v">' + esc(jc.total == null ? '-' : jc.total) + '<small> / ' + esc(jc.max == null ? '-' : jc.max) + '点</small></span><span class="cl-tile-s">' + esc((jc.pct == null ? '-' : jc.pct) + '%' + (jc.bandLabel ? '・' + jc.bandLabel : '')) + '</span></div>';
      const mustTile = m.total ? '<div class="cl-tile ' + (m.mismatch ? 't-danger' : m.unknown ? 't-muted' : 't-ok') + '"><span class="cl-tile-k">必須条件</span><span class="cl-tile-v">' + (m.mismatch ? '不一致 ' + m.mismatch : m.unknown ? '未確認 ' + m.unknown : 'すべて一致') + '</span><span class="cl-tile-s">' + esc(mustCountsText(m)) + '</span></div>' : '';
      const resTile = '<div class="cl-tile cl-tile-res ' + (resTone[j.result] || '') + '"><span class="cl-tile-k">結果</span><span class="cl-tile-v">' + esc(j.title || titleOf(j.result)) + '</span><span class="cl-tile-s">' + esc(j.evaluatedAt ? '判定 ' + U.fmtDateTime(j.evaluatedAt) : '') + '</span></div>';
      // 台本モード: 面接評価（確認点）・必須条件・総合判断・結果（シフト貢献度のタイルは出さない）
      const jo = (j.overall && typeof j.overall === 'object') ? j.overall : (j.checklist && j.checklist.overall) || sum.overall;
      const joTone = jo && jo.value ? (CL_TONE_CLASS[R.OVERALL_TONE[jo.value]] || '') : 't-muted';
      const tilesHtml = scriptRec ? '<div class="cl-tiles">' +
        '<div class="cl-tile ' + (bandTone[iv.band] || '') + '"><span class="cl-tile-k">面接評価（確認点）</span><span class="cl-tile-v">' + esc(iv.total) + '<small> / ' + esc(iv.max) + '点</small></span><span class="cl-tile-s">' + esc(iv.pct + '%' + (iv.bandLabel ? '・' + iv.bandLabel : '')) + '</span></div>' +
        mustTile +
        '<div class="cl-tile ' + joTone + '"><span class="cl-tile-k">総合判断</span><span class="cl-tile-v">' + esc(jo && jo.value ? jo.label : '未入力') + '</span><span class="cl-tile-s">' + esc(def.overallLabel || '面接者の総合判断') + '</span></div>' +
        resTile +
        '</div>' : '<div class="cl-tiles">' +
        '<div class="cl-tile ' + (bandTone[iv.band] || '') + '"><span class="cl-tile-k">面接評価</span><span class="cl-tile-v">' + esc(iv.total) + '<small> / ' + esc(iv.max) + '点</small></span><span class="cl-tile-s">' + esc(iv.pct + '%' + (iv.bandLabel ? '・' + iv.bandLabel : '')) + '</span></div>' +
        contribTile +
        (m.total ? '<div class="cl-tile ' + (m.mismatch ? 't-danger' : m.unknown ? 't-muted' : 't-ok') + '"><span class="cl-tile-k">必須条件</span><span class="cl-tile-v">' + (m.mismatch ? '不一致 ' + m.mismatch : m.unknown ? '未確認 ' + m.unknown : 'すべて一致') + '</span><span class="cl-tile-s">' + esc(mustCountsText(m)) + '</span></div>' : '') +
        '<div class="cl-tile cl-tile-res ' + (resTone[j.result] || '') + '"><span class="cl-tile-k">結果</span><span class="cl-tile-v">' + esc(j.title || titleOf(j.result)) + '</span><span class="cl-tile-s">' + esc(j.evaluatedAt ? '判定 ' + U.fmtDateTime(j.evaluatedAt) : '') + '</span></div>' +
        '</div>';
      const adjHtml = (j.adjustments || []).length ? '<ul class="cl-adj">' + j.adjustments.map(function (x) {
        return '<li><b>' + (x.from === x.to ? esc(titleOf(x.to)) + '（固定）' : esc(titleOf(x.from)) + ' → ' + esc(titleOf(x.to))) + '</b>：' + esc(x.reason) + '</li>';
      }).join('') + '</ul>' : '';
      judgeHtml = decHtml
        ? '<div class="cl-judge"><div class="cl-judge-row"><div class="cl-judge-main">' + judgeHead + tilesHtml + '</div>' + decHtml + '</div>' + adjHtml + '</div>'
        : '<div class="cl-judge">' + judgeHead + tilesHtml + adjHtml + '</div>';
    } else {
      const noneHtml = '<p>採用可否判定は未実施（面接評価 ' + esc(sc.total + '/' + sc.max + '・' + sc.pct + '%') + ' の時点）</p>';
      judgeHtml = decHtml
        ? '<div class="cl-judge cl-judge-none"><div class="cl-judge-row"><div class="cl-judge-main">' + judgeHead + noneHtml + '</div>' + decHtml + '</div></div>'
        : '<div class="cl-judge cl-judge-none">' + judgeHead + noneHtml + '</div>';
    }
    const stampsHtml = o.stamps ? '<div class="cl-stamps"><div class="cl-bt">【押印】</div>' + o.stamps + '</div>' : '';
    return '<div class="cl-sheet cl-mode-sheet">' + headHtml + pagesHtml + overallHtml + judgeHtml + stampsHtml + '</div>';
  }

  // 報告書のスタイル（.cl-sheet 以下＋ A4 印刷の規則）。アプリは起動時に 1 回 <style> に入れ、保存レポートは reportCss の後ろに足す。
  //   色はライト固定（アプリのダークテーマでも印刷は白地）。'sheet' の寸法は画面でも同じにして、1 ページ目の高さを画面で計測できるようにする
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
      '.cl-sheet dl.cl-fields dt{color:#5b6675;font-weight:600}.cl-sheet dl.cl-fields dd{margin:0;overflow-wrap:anywhere}.cl-sheet dl.cl-fields dd small{color:#5b6675;margin-left:3px}',
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
      '.cl-mode-section .cl-hchip{display:inline-flex;gap:6px;align-items:baseline;padding:1px 8px;border:1px solid #c9d2dd;border-radius:5px;font-size:12px;background:#fff}.cl-mode-section .cl-hchip b{color:#5b6675;font-weight:700}.cl-mode-section .cl-hchip small{color:#5b6675}',
      '.cl-mode-section .cl-hchip.t-ok{border-color:#9fd8bf;background:#e3f6ee}.cl-mode-section .cl-hchip.t-warn{border-color:#f3cf8a;background:#fdf1dc}.cl-mode-section .cl-hchip.t-danger{border-color:#f5b5b5;background:#fde8e8;color:#b42318}.cl-mode-section .cl-hchip.t-info{border-color:#b9cdf7;background:#e5edff}',
      '.cl-mode-section .cl-page-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;margin:4px 0 6px;padding-bottom:3px;border-bottom:2px solid #24324a;break-after:avoid}',
      '.cl-mode-section .cl-page-no{font-size:11.5px;font-weight:800;color:#fff;background:#24324a;padding:0 7px;border-radius:4px}.cl-mode-section .cl-page-t{font-weight:800;font-size:14px}',
      '.cl-mode-section .cl-page-lead{flex-basis:100%;font-size:12px;color:#3a4556}',
      '.cl-sheet .cl-sflow{margin:5px 0 0;font-size:.92em;font-weight:600;color:#3a4556}',
      '.cl-sheet .cl-confirmed{border:1px dashed #c9d2dd;border-radius:8px;padding:5px 12px;margin:0 0 10px;break-inside:auto}',
      '.cl-sheet .cl-overall{border:2px solid #24324a;border-radius:8px;padding:6px 12px;margin:0 0 10px;break-inside:avoid}',
      '.cl-sheet .cl-ov-row{display:grid;grid-template-columns:9em minmax(0,1fr);gap:8px;padding:2px 0;border-bottom:1px solid #e3e8ee}.cl-sheet .cl-ov-row:last-child{border-bottom:none}',
      '.cl-sheet .cl-ov-k{font-weight:700;color:#3a4556}.cl-sheet .cl-ov-v{font-weight:700}.cl-sheet .cl-ov-v small{font-weight:600;color:#5b6675;margin-left:4px}.cl-sheet .cl-ov-notes .cl-ov-v{font-weight:400}',
      '.cl-sheet .cl-ov-v.t-ok{color:#0b7a55}.cl-sheet .cl-ov-v.t-warn{color:#9a5b00}.cl-sheet .cl-ov-v.t-danger{color:#b42318}.cl-sheet .cl-ov-v.t-muted{color:#5b6675}',
      // sheet（A4 報告）: 9.5px の詰めた寸法。画面でも同じ寸法にして計測する
      '.cl-sheet.cl-mode-sheet{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,"Noto Sans JP",system-ui,sans-serif;font-size:9.5px;line-height:1.35;background:#fff;color:#111}',
      '.cl-mode-sheet .cl-sheet-head{border-bottom:2px solid #24324a;padding:0 0 3px;margin:0 0 4px}',
      '.cl-mode-sheet .cl-sh-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:9px;color:#3a4556}',
      '.cl-mode-sheet .cl-sh-title{font-size:13px;font-weight:800;color:#24324a}.cl-mode-sheet .cl-sh-title small{font-size:9px;font-weight:600;color:#5b6675;margin-left:4px}',
      '.cl-mode-sheet .cl-sh-main{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:1px}',
      '.cl-mode-sheet .cl-sh-name{font-size:16px;font-weight:800}.cl-mode-sheet .cl-sh-name small{font-size:10px;font-weight:600;margin-left:2px}.cl-mode-sheet .cl-sh-who{font-size:10px;font-weight:600;color:#3a4556;margin-left:10px}',
      '.cl-mode-sheet dl.cl-sh-kv{display:flex;gap:12px;margin:0;font-size:10px}.cl-mode-sheet dl.cl-sh-kv>div{display:flex;gap:4px;align-items:baseline}.cl-mode-sheet dl.cl-sh-kv dt{color:#5b6675;font-weight:600}.cl-mode-sheet dl.cl-sh-kv dd{margin:0;font-weight:700;min-width:5em;border-bottom:1px solid #8a94a3}.cl-mode-sheet dl.cl-sh-kv dd small{font-weight:500;color:#5b6675}',
      '.cl-mode-sheet .cl-sh-chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}',
      '.cl-mode-sheet .cl-hchip{display:inline-flex;gap:4px;align-items:baseline;padding:0 6px;border:1px solid #c9d2dd;border-radius:4px;font-size:9px;background:#f8fafc}.cl-mode-sheet .cl-hchip b{color:#5b6675;font-weight:700}.cl-mode-sheet .cl-hchip small{color:#5b6675}',
      '.cl-mode-sheet .cl-hchip.t-ok{border-color:#9fd8bf;background:#e3f6ee}.cl-mode-sheet .cl-hchip.t-warn{border-color:#f3cf8a;background:#fdf1dc}.cl-mode-sheet .cl-hchip.t-danger{border-color:#f5b5b5;background:#fde8e8;color:#b42318}.cl-mode-sheet .cl-hchip.t-info{border-color:#b9cdf7;background:#e5edff}',
      '.cl-mode-sheet .cl-page-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;margin:0 0 3px;padding:1px 0;border-bottom:1px solid #24324a}',
      '.cl-mode-sheet .cl-page-no{font-weight:800;color:#fff;background:#24324a;padding:0 6px;border-radius:3px}.cl-mode-sheet .cl-page-t{font-weight:800;font-size:10.5px}',
      '.cl-mode-sheet .cl-page-who{margin-left:auto;font-size:9px;color:#3a4556}.cl-mode-sheet .cl-page-lead{flex-basis:100%;font-size:8.5px;color:#3a4556}',
      '.cl-mode-sheet .cl-s{border-radius:4px;margin:0 0 4px}.cl-mode-sheet .cl-s-h{padding:1px 8px;font-size:11px;gap:6px}.cl-mode-sheet .cl-s-sum{font-size:9px}',
      '.cl-mode-sheet .cl-s-lead{padding:2px 8px 0;font-size:9px}.cl-mode-sheet .cl-s-body{padding:3px 8px 4px}',
      '.cl-mode-sheet .cl-2col{gap:2px 10px}.cl-mode-sheet .cl-b{margin:0 0 3px}.cl-mode-sheet .cl-bt{margin:1px 0 1px;font-size:9.5px}',
      '.cl-mode-sheet table td{padding:1px 4px}.cl-mode-sheet .cl-rate .cl-mk{font-size:11px}',
      '.cl-mode-sheet dl.cl-fields{gap:0 10px}.cl-mode-sheet dl.cl-fields>div{grid-template-columns:7em minmax(0,1fr);padding:1px 0}.cl-mode-sheet .cl-col dl.cl-fields>div{grid-template-columns:12em minmax(0,1fr)}',
      '.cl-mode-sheet ul.cl-checks{gap:0 10px}.cl-mode-sheet ol.cl-qs{margin:0 0 2px;padding-left:1.4em}',
      '.cl-mode-sheet .cl-memo{padding:1px 6px}.cl-mode-sheet .cl-sflow{margin:3px 0 0;font-size:9px}',
      '.cl-mode-sheet .cl-confirmed{padding:2px 8px;margin:0 0 4px;border-radius:4px}.cl-mode-sheet .cl-confirmed dl.cl-fields{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.cl-mode-sheet .cl-overall{padding:2px 8px;margin:0 0 4px;border-radius:4px}.cl-mode-sheet .cl-ov-row{grid-template-columns:8.5em minmax(0,1fr);padding:1px 0}',
      '.cl-mode-sheet .cl-judge{border:1px solid #c9d2dd;border-radius:4px;padding:2px 8px 4px;margin:0 0 4px;break-inside:avoid}',
      '.cl-mode-sheet .cl-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}',
      '.cl-mode-sheet .cl-tile{display:flex;flex-direction:column;border:1px solid #c9d2dd;border-radius:4px;padding:2px 6px;background:#f8fafc;min-width:0}',
      '.cl-mode-sheet .cl-tile-k{font-size:8.5px;font-weight:700;color:#5b6675}.cl-mode-sheet .cl-tile-v{font-size:13px;font-weight:800;line-height:1.25}.cl-mode-sheet .cl-tile-v small{font-size:9px;font-weight:600;color:#5b6675}.cl-mode-sheet .cl-tile-s{font-size:8.5px;color:#3a4556}',
      '.cl-mode-sheet .cl-tile.t-ok{border-color:#9fd8bf;background:#e3f6ee}.cl-mode-sheet .cl-tile.t-ok .cl-tile-v{color:#0b7a55}.cl-mode-sheet .cl-tile.t-warn{border-color:#f3cf8a;background:#fdf1dc}.cl-mode-sheet .cl-tile.t-warn .cl-tile-v{color:#9a5b00}',
      '.cl-mode-sheet .cl-tile.t-danger{border-color:#f5b5b5;background:#fde8e8}.cl-mode-sheet .cl-tile.t-danger .cl-tile-v{color:#b42318}.cl-mode-sheet .cl-tile.t-muted .cl-tile-v{color:#5b6675}',
      '.cl-mode-sheet .cl-tile-res{border-width:2px}',
      '.cl-mode-sheet .cl-adj{margin:3px 0 0;padding-left:1.3em;font-size:9px}.cl-mode-sheet .cl-adj li{break-inside:avoid}.cl-mode-sheet .cl-judge-none p{margin:0;font-weight:700;color:#5b6675}',
      // 最終合否（【判定サマリー】の右端。高さはタイル以下）
      '.cl-mode-sheet .cl-judge-row{display:flex;gap:6px;align-items:stretch}',
      '.cl-mode-sheet .cl-judge-main{flex:1 1 auto;min-width:0}',
      '.cl-mode-sheet .cl-decision{flex:0 0 auto;display:flex;align-items:center;gap:5px;margin-top:2px;padding:2px 6px;border:1px solid #c9d2dd;border-radius:4px;background:#fff}',
      '.cl-mode-sheet .cl-dec-stamp{flex:none;display:grid;place-items:center}.cl-mode-sheet .cl-dec-stamp .verdict-stamp{width:64px;height:41px;mix-blend-mode:multiply;filter:none}',
      '.cl-mode-sheet .cl-dec-meta{display:flex;flex-direction:column;min-width:0;line-height:1.3}',
      '.cl-mode-sheet .cl-dec-kv{display:flex;align-items:baseline;gap:4px}.cl-mode-sheet .cl-dec-k{font-size:8.5px;font-weight:700;color:#5b6675}.cl-mode-sheet .cl-dec-v{font-size:12px;font-weight:800}',
      '.cl-mode-sheet .cl-dec-by,.cl-mode-sheet .cl-dec-date{font-size:8.5px;color:#3a4556;white-space:nowrap}',
      '.cl-mode-sheet .cl-dec-empty{width:64px;height:38px;border:1.5px dashed #b8c2cf;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:8.5px;line-height:1.25;color:#5b6675;text-align:center}',
      '.cl-sheet .cl-decision,.cl-sheet .verdict-stamp,.cl-sheet .cl-dec-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '.cl-mode-sheet .cl-stamps{margin:0;break-inside:avoid}',
      '.cl-sheet .stamp-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;break-inside:avoid}',
      '.cl-sheet .stamp-box{display:flex;align-items:center;gap:6px;text-align:left;padding:2px 8px;border:1px solid #c9d2dd;border-radius:4px;background:#fff;min-width:0}',
      '.cl-sheet .stamp-label{font-size:9.5px;font-weight:700;min-width:5em;color:#1a2233}.cl-sheet .stamp-area{height:auto;display:grid;place-items:center}',
      '.cl-sheet .hanko{width:46px;height:46px;filter:none}.cl-sheet .stamp-empty{width:44px;height:44px;font-size:8.5px;border:2px dashed #c7d0db;border-radius:50%;display:grid;place-items:center;color:#5b6675;background:#fff}',
      '.cl-sheet .stamp-meta{font-size:8.5px;min-height:0;line-height:1.3;color:#3a4556}',
      // 1 ページ目があふれるとき（.cl-fit）は 2 ページ目の強制改ページを外す
      '.cl-mode-sheet .cl-page+.cl-page{break-before:page}.cl-mode-sheet.cl-fit .cl-page+.cl-page{break-before:auto}',
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
      'body.print-checklist section.sec[data-sec="mgmt"]{margin-top:0;padding:2px 8px 4px;border-radius:4px;box-shadow:none;break-inside:avoid}',
      'body.print-checklist section.sec[data-sec="mgmt"] h2{font-size:9.5px;padding-bottom:1px;margin-bottom:3px;border-bottom:none}body.print-checklist section.sec[data-sec="mgmt"] h2::before{display:none}',
      'body.print-checklist .stamp-hint,body.print-checklist .stamp-ctl,body.print-checklist .mgmt-save,body.print-checklist .mgmt-note{display:none !important}',
      'body.print-checklist .stamp-row{gap:6px}body.print-checklist .stamp-box{display:flex;align-items:center;gap:6px;text-align:left;padding:2px 8px}body.print-checklist .stamp-label{font-size:9.5px;min-width:5em}body.print-checklist .stamp-area{height:auto}body.print-checklist .hanko{width:46px;height:46px}body.print-checklist .stamp-empty{width:44px;height:44px;font-size:8.5px}body.print-checklist .stamp-meta{font-size:8.5px;min-height:0;line-height:1.3}',
      '.cl-sheet .cl-s-h,.cl-sheet tr,.cl-sheet .cl-tile,.cl-sheet .cl-hchip,.cl-sheet .cl-page-no,.cl-sheet .cl-memo,.cl-sheet .hanko,.cl-sheet .stamp-empty{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      // 全体印刷（レポートの「面接チェックリスト」節）: 余白を詰める
      '.cl-mode-section .cl-s{break-inside:auto}.cl-mode-section table td{padding:2px 5px}',
      '}'
    ].join('\n');
  }

  function generateReportHTML(record, profile) {
    const R = global.RecruitRules;
    const esc = U.esc;
    const a = record.applicant || {};
    // 台本モードの記録（record.mode === 'script'）は応募者情報・面接チェックリスト・採用可否判定（台本）・応募者の管理だけ（docs/SPEC-script-mode.md 3 章）
    const scriptRec = R.isScriptRecord(record);
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
    const o = profile.options || {};
    const f = profile.features || {};
    const titleOf = function (r) { return ((texts[r] || {}).title) || r; };
    const bandName = function (b) { return ((texts.bandLabels || {})[b]) || { high: '高', mid: '中', low: '低' }[b] || '—'; };
    const fmtN = function (v) { return v == null || v === '' ? '-' : String(v); };
    const clamp = function (x) { const n = Number(x); return isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n * 10) / 10)); };
    const pctCls = function (pct) { const n = Number(pct); return isNaN(n) ? '' : n >= 70 ? 'hi' : n >= 40 ? 'mid' : 'lo'; };
    const bandCls = function (b) { return { high: 'hi', mid: 'mid', low: 'lo' }[b] || ''; };
    const bandTone = function (b) { return { high: 'ok', mid: 'warn', low: 'danger' }[b] || ''; };
    const resultTone = function (r) { return { recommend: 'ok', review: 'warn', reject: 'danger' }[r] || ''; };
    const tagsOf = function (flags) {
      return (flags || []).map(function (fl) {
        return '<span class="tag ' + (fl === 'restricted' ? 'danger' : fl === 'unanswered' ? 'warn' : '') + '">' + esc(FLAG_LABELS[fl] || fl) + '</span>';
      }).join('');
    };

    // ---- 応募情報を段階で振り分ける（保存時点の段階を優先。どちらも無い旧データは全部「応募時の情報」） ----
    const stages = record.inputStages || profile.inputStages;
    const sp = { inputStages: stages || {} };
    const rowHtml = function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; };
    const descRows = R.describeApplicant(a, profile);
    const preRows = descRows.filter(function (r) { return r.section !== 'notes' && R.stageOf(sp, r.section) === 'pre'; }).map(rowHtml).join('');
    const ivRows = descRows.filter(function (r) { return r.section !== 'notes' && R.stageOf(sp, r.section) === 'interview'; }).map(rowHtml).join('');

    // 保存時点で未入力の「面接で確認する項目」
    let unconfirmed = '';
    try {
      const cf = R.interviewConfirm(a, Object.assign({}, profile, sp));
      const groups = [];
      cf.items.filter(function (it) { return it.level === 'required' || it.level === 'check'; }).forEach(function (it) {
        let g = groups.find(function (x) { return x.label === it.sectionLabel; });
        if (!g) { g = { label: it.sectionLabel, items: [] }; groups.push(g); }
        g.items.push(it.label);
      });
      unconfirmed = groups.map(function (g) { return g.label + '：' + g.items.join('、'); }).join('／');
    } catch (e) { unconfirmed = ''; }

    // ---- 高校生の採用方針（保存時点のスナップショットを優先） ----
    let hs = record.highschool;
    if (hs === undefined) {
      try { const h0 = R.highschoolStatus(a, profile); hs = h0.applicable ? { status: h0.status, reasonsText: h0.reasonsText } : null; } catch (e) { hs = null; }
    }
    let hsHtml = '';
    let hsChip = '';
    if (hs && hs.status && hs.status !== 'none' && hs.status !== 'allowed') {
      const cls = hs.status === 'exception_met' ? 'ok' : hs.status === 'exception_incomplete' ? '' : 'danger';
      const policy = (profile.highschoolPolicy || {}).notice || '';
      hsHtml = '<div class="callout ' + cls + '"><span>' + (cls === 'ok' ? '✓' : '⚠') + '</span><div><b>高校生の採用方針: ' + esc(HS_STATUS_LABELS[hs.status] || hs.status) + '</b>' +
        (hs.reasonsText ? '（' + esc(hs.reasonsText) + '）' : '') +
        (policy ? '<span class="muted" style="font-size:12.5px;margin-top:4px">' + esc(policy) + '</span>' : '') + '</div></div>';
      hsChip = '<span class="badge ' + (cls === 'ok' ? 'ok' : cls === 'danger' ? 'danger' : 'warn') + '">' + esc(HS_STATUS_LABELS[hs.status] || hs.status) + '</span>';
    }

    // ---- 留意点（重要度ごと） ----
    const items = record.handoff.items || [];
    const checks = record.handoff.checks || {};
    const counts = { block: 0, warn: 0, info: 0 };
    let doneCount = 0;
    items.forEach(function (i) { if (counts[i.severity] != null) counts[i.severity]++; if (checks[i.id]) doneCount++; });
    const handoffHtml = ['block', 'warn', 'info'].map(function (k) {
      const list = items.filter(function (i) { return i.severity === k; });
      if (!list.length) return '';
      const m = R.SEVERITY[k] || R.SEVERITY.info;
      const tone = k === 'block' ? 'danger' : k === 'warn' ? 'warn' : 'info';
      return '<div class="hgroup"><div class="hgroup-head"><span class="badge ' + tone + '">' + esc(m.label) + '</span><b>' + list.length + '件</b><span>' + esc(m.desc || '') + '</span></div>' +
        '<ul class="hlist">' + list.map(function (i) {
          const done = !!checks[i.id];
          return '<li class="h ' + esc(i.severity) + (done ? ' done' : '') + '">' +
            '<span class="box">' + (done ? '☑' : '☐') + '</span>' +
            '<div><div class="hmeta"><span class="sev ' + esc(i.severity) + '">' + esc(m.label) + '</span>' +
            '<span class="cat">' + esc(R.CATEGORY_LABELS[i.category] || i.category) + '</span>' +
            (i.deferred || i.aggregate ? '<span class="tag warn">面接で確認</span>' : '') + '</div>' +
            '<div class="txt">' + esc(i.text) + '</div></div></li>';
        }).join('') + '</ul></div>';
    }).join('');
    const strengths = (record.handoff.strengths || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

    // ---- シフト貢献度（保存時点のスナップショット） ----
    const j = record.judgment;
    const c = record.contribution || (j && j.contribution) || null;
    const requireComplete = !(profile.contribution && profile.contribution.requireComplete === false);
    const cPending = !!(c && c.incomplete && requireComplete);
    let contribHtml;
    let contribBand = '';
    let contribBandTxt = '';
    if (!c || !Array.isArray(c.parts)) {
      contribHtml = '<p class="empty">シフト貢献度は未計算です（旧形式のデータ）。</p>';
    } else {
      contribBand = c.band || '';
      contribBandTxt = c.enabled ? (cPending ? '未確定' : (c.bandLabel || bandName(c.band))) : '2軸判定OFF（参考値）';
      const partRows = c.parts.map(function (pt) {
        const na = pt.applicable === false;
        const max = Number(pt.max) || 0;
        const sc = Number(pt.score) || 0;
        const pct = na || !max ? 0 : clamp(sc / max * 100);
        return '<div class="bar wide' + (na ? ' na' : '') + '"><div class="b-label">' + esc(pt.label) + tagsOf(pt.flags) +
          (pt.detail ? '<small>' + esc(pt.detail) + '</small>' : '') + '</div>' +
          '<div class="b-track"><span class="' + (na ? '' : pctCls(pct)) + '" style="width:' + pct + '%"></span></div>' +
          '<div class="b-val">' + (na ? '<small>対象外</small>' : esc(fmtN(pt.score)) + '<small> / ' + esc(fmtN(pt.max)) + '</small>') + '</div></div>';
      }).join('');
      contribHtml = '<div class="bars">' + partRows + '</div>' +
        '<div class="total-line">合計 <b>' + esc(fmtN(c.total)) + '</b><span class="muted">/ ' + esc(fmtN(c.max)) + '点</span>' +
        '<span class="right">得点率 ' + esc(fmtN(c.pct)) + '%<span class="badge ' + (cPending || !c.enabled ? '' : bandTone(c.band)) + '">' + esc(contribBandTxt) + '</span></span></div>' +
        (c.incomplete && c.missing && c.missing.length ? '<div class="callout"><span>⚠</span><div>未確認: ' + esc(c.missing.join('・')) + '</div></div>' : '');

      // 繁忙期の明細（表の形式はテスト・読み戻しで参照しているため維持）
      const unitL = R.UNIT_LABEL || {};
      const triL = R.TRI_LABELS || {};
      const busyRows = (c.busyRows || []).map(function (b) {
        const days = b.days == null ? (R.isTri(b.avail) && f.vacationDays !== false ? '未確認' : '-') : b.days + (unitL[b.unit] || '日');
        return '<tr' + (b.weight > 0 ? '' : ' class="na"') + '><td>' + esc(b.label) + (b.critical && b.weight > 0 ? '<span class="tag">重点</span>' : '') + (b.weight > 0 ? '' : '<span class="tag">記録のみ</span>') + '</td>' +
          '<td>' + esc(b.avail ? (triL[b.avail] || b.avail) : '未確認') + '</td>' +
          '<td class="num">' + esc(days) + '</td>' +
          '<td class="num">' + esc(fmtN(b.refDays)) + (unitL[b.unit] ? esc(unitL[b.unit]) : '') + '</td>' +
          '<td class="num">' + esc(fmtN(b.weight)) + '</td></tr>';
      }).join('');
      if (busyRows) {
        contribHtml += '<h3>繁忙期（3連休・長期休暇）</h3><table class="list"><thead><tr><th>期間</th><th>可否</th><th class="num">出られる日数</th><th class="num">満点の日数</th><th class="num">重み</th></tr></thead><tbody>' + busyRows + '</tbody></table>';
      }
      const an = a.allNight || {};
      const extra = [];
      if (f.holidayWork !== false) extra.push(['祝日', a.holidayWork ? (triL[a.holidayWork] || a.holidayWork) : '未確認']);
      if (f.weekendFreq !== false) extra.push(['土日の頻度', a.weekendFreq ? R.labelOf(o.weekendFrequencies, a.weekendFreq) : (c.parts.some(function (p) { return p.id === 'weekend' && (p.flags || []).indexOf('unanswered') >= 0; }) ? '未確認' : '-')]);
      if (f.allNight !== false) {
        const anPart = c.parts.find(function (p) { return p.id === 'allNight'; });
        let anTxt;
        if (anPart && (anPart.flags || []).indexOf('restricted') >= 0) anTxt = anPart.detail;
        else {
          const ps = [];
          ps.push(an.availability ? (triL[an.availability] || an.availability) : '未確認');
          if (R.isTri(an.availability)) ps.push(an.frequency ? R.labelOf(o.allNightFrequencies, an.frequency) : '頻度未確認');
          if (an.note) ps.push(an.note);
          anTxt = ps.join(' / ');
        }
        const pr = profile.params || {};
        extra.push(['オールナイト', anTxt + (pr.allNightShiftStart ? '（' + pr.allNightShiftStart + '〜翌' + (pr.allNightShiftEnd || '') + '目安）' : '')]);
      }
      if (extra.length) {
        contribHtml += '<h3>祝日・土日・オールナイト</h3><table class="kv">' + extra.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>';
      }
    }

    // ---- 面接チェックリスト（SPEC-checklist 4-3）。保存時点の台本（checklistDef）の文言で出す ----
    const clRec = U.isObj(record.checklist) ? record.checklist : R.emptyChecklist();
    const clHas = R.checklistHasInput(clRec);
    const clProf = Object.assign({}, profile, { checklist: normalizeChecklistDef(record.checklistDef || profile.checklist, defaults().checklist) });
    const ivModel = R.interviewModel(clProf, record.scores || {}, clRec);
    const clMust = R.mustSummary(clProf.checklist, clRec);

    // ---- 面接評価（旧形式・10項目×5点。旧レコードの scores があるときだけ） ----
    const ev = profile.evaluation || {};
    const scale = Number(ev.scaleMax) || 5;
    const scoresObj = U.isObj(record.scores) ? record.scores : {};
    const hasScores = Object.keys(scoresObj).some(function (k) { return isNum(scoresObj[k]); });
    // ラベルは現在の旧評価項目 → 保存時の判定の内訳 → id の順に補う
    const bdLabels = {};
    ((j && j.interviewMode !== 'checklist' && j.breakdown) || []).forEach(function (b) { if (b && b.id) bdLabels[b.id] = b.label; });
    let evItems = (ev.items || []).slice();
    Object.keys(scoresObj).forEach(function (k) {
      if (!evItems.some(function (it) { return it.id === k; })) evItems.push({ id: k, label: bdLabels[k] || k });
    });
    let scoreSum = 0;
    const scoreRows = evItems.map(function (it) {
      const s = scoresObj[it.id];
      const has = !(s == null || s === '');
      const n = has ? Number(s) : 0;
      if (has && !isNaN(n)) scoreSum += n;
      const pct = has ? clamp(n / scale * 100) : 0;
      const isOverall = it.id === ev.overallItemId;
      return '<div class="bar' + (isOverall ? ' overall' : '') + '"><div class="b-label">' + esc(it.label) + '</div>' +
        '<div class="b-track"><span class="' + (has ? pctCls(pct) : '') + '" style="width:' + pct + '%"></span></div>' +
        '<div class="b-val">' + (has ? esc(s) + '<small> / ' + scale + '</small>' : '<small>-</small>') + '</div></div>';
    }).join('');
    const scoreMax = (ev.items || []).length ? (ev.items || []).length * scale : evItems.length * scale;
    // 判定が旧方式なら判定の値（帯つき）、チェックリスト方式の判定がある（参考表示）なら点数から計算
    const legacyJ = j && j.interview && j.interviewMode !== 'checklist';
    const scorePct = legacyJ ? j.interview.pct : (scoreMax ? Math.round(scoreSum / scoreMax * 1000) / 10 : 0);
    const scoreTotal = legacyJ ? j.interview.total : scoreSum;
    const scoreBand = legacyJ ? j.interview.band : '';
    const scoreBandTxt = legacyJ ? (j.interview.bandLabel || bandName(j.interview.band)) : '';
    const interviewTotal = hasScores
      ? '<div class="total-line">合計 <b>' + esc(scoreTotal) + '</b><span class="muted">/ ' + esc(scoreMax) + '点</span>' +
        '<span class="right">得点率 ' + esc(scorePct) + '%' + (scoreBandTxt ? '<span class="badge ' + bandTone(scoreBand) + '">' + esc(scoreBandTxt) + '</span>' : '') + '</span></div>'
      : '';

    // ---- 採用可否判定 ----
    const beforeIv = !j && Number(record.step) < 3;
    let judgmentHtml = '<p class="empty">' + (beforeIv ? '面接前（申し送り段階）の保存のため、採用可否判定は未実施です。' : '採用可否判定は未実施です。') + '</p>';
    let axesSummary = '';
    if (j) {
      let axes = '', mx = '', note = '', adj = '', mode = '';
      if (j.interview) {
        const jc = j.contribution || {};
        const cBandTxt = j.mode === 'incomplete' ? '未確定' : j.mode === 'interviewOnly' ? '—' : (jc.bandLabel || bandName(jc.band));
        const iBandTxt = j.interview.bandLabel || bandName(j.interview.band);
        axesSummary = '面接 ' + j.interview.pct + '%（' + iBandTxt + '）' + (j.mode === 'interviewOnly' ? '' : ' × 貢献 ' + fmtN(jc.pct) + '%（' + cBandTxt + '）');
        axes = '<div class="axes">' +
          '<div class="axis"><div class="a-label">面接評価</div><div class="a-val">' + esc(j.interview.total) + '<small> / ' + esc(j.interview.max) + '点</small></div>' +
          '<div class="a-sub">得点率 ' + esc(j.interview.pct) + '%・' + esc(iBandTxt) + '　採用推奨 ' + esc(j.thresholds.recommendPts) + '点以上／上長判断 ' + esc(j.thresholds.reviewPts) + '点以上</div></div>' +
          (j.mode !== 'interviewOnly'
            ? '<div class="axis"><div class="a-label">シフト貢献度</div><div class="a-val">' + (j.mode === 'incomplete' ? '未確定' : esc(fmtN(jc.total)) + '<small> / ' + esc(fmtN(jc.max)) + '点</small>') + '</div>' +
              '<div class="a-sub">' + (j.mode === 'incomplete' ? '面接評価のみで判定' : '得点率 ' + esc(fmtN(jc.pct)) + '%・' + esc(cBandTxt)) + '</div></div>'
            : '') +
          '<div class="axis"><div class="a-label">判定方式</div><div class="a-val txt">' + esc(MODE_LABELS[j.mode] || j.mode || '面接評価のみ') + '</div></div>' +
          '</div>';
        if (j.mode !== 'interviewOnly' && j.matrix && j.matrix.table) {
          const B = ['high', 'mid', 'low'];
          const bi = (j.matrix.bands || {}).interview || {}, bc = (j.matrix.bands || {}).contribution || {};
          const iR = { high: bi.high + '%以上', mid: bi.mid + '〜' + bi.high + '%', low: bi.mid + '%未満' };
          const cR = { high: bc.high + '%以上', mid: bc.mid + '〜' + bc.high + '%', low: bc.mid + '%未満' };
          mx = '<div class="mx-wrap"><table class="mx"><thead><tr><th>面接 ＼ 貢献度</th>' +
            B.map(function (cb) { return '<th>' + esc(bandName(cb)) + '<small>' + esc(cR[cb]) + '</small></th>'; }).join('') + '</tr></thead><tbody>' +
            B.map(function (ib) {
              return '<tr><th>' + esc(bandName(ib)) + '<small>' + esc(iR[ib]) + '</small></th>' + B.map(function (cb) {
                const k = ib + '_' + cb, r = j.matrix.table[k];
                const cur = j.matrix.cellKey === k;
                return '<td class="' + esc(r || '') + (cur ? ' cur' : '') + '">' + (cur ? '▶ ' : '') + esc(r ? titleOf(r) : '-') + '</td>';
              }).join('') + '</tr>';
            }).join('') + '</tbody></table>' +
            (j.mode === 'incomplete' ? '<div class="mx-note">シフト貢献度が未確定のため、マトリクスには当てていません。</div>' : '') +
            '</div>';
        }
        if (j.matrix && j.matrix.note) note = '<div class="result-note">' + esc(j.matrix.note) + '</div>';
        if (j.adjustments && j.adjustments.length) {
          adj = '<div class="adj-head">' + (j.mode === 'matrix' ? 'マトリクスの結果' : '面接評価の結果') + '「' + esc(titleOf(j.baseResult)) + '」' +
            (j.result === j.baseResult ? '。必須条件の不一致により「' + esc(titleOf(j.result)) + '」に固定' : 'から「' + esc(titleOf(j.result)) + '」に調整') + '</div>' +
            '<ul class="adj">' + j.adjustments.map(function (x) {
              return '<li><span class="step">' + (x.from === x.to ? esc(titleOf(x.to)) + '（固定）' : esc(titleOf(x.from)) + ' → ' + esc(titleOf(x.to))) + '</span><span>' + esc(x.reason) + '</span></li>';
            }).join('') + '</ul>';
        }
      } else {
        axesSummary = '面接評価 ' + j.pct + '%';
      }
      const shownReasons = {};
      (j.adjustments || []).forEach(function (x) { shownReasons[x.reason] = true; });
      const warns = (j.warnings || []).filter(function (w) { return !shownReasons[w]; });
      judgmentHtml = '<div class="result ' + esc(j.result) + '">' +
        '<div class="result-kicker">採用可否判定</div>' +
        '<div class="result-title">' + esc(j.title) + '</div>' +
        '<div class="result-body">' + esc(j.body) + '</div>' +
        (j.checklist && j.checklist.must && j.checklist.must.total ? '<div class="result-must"><b>必須条件:</b> 一致 ' + esc(j.checklist.must.match) + '・不一致 ' + esc(j.checklist.must.mismatch) + '・未確認 ' + esc(j.checklist.must.unknown) +
          ((j.checklist.must.mismatchLabels || []).length ? '<span class="tag danger">不一致: ' + esc(j.checklist.must.mismatchLabels.join('、')) + '</span>' : '') +
          ((j.checklist.must.unknownLabels || []).length ? '<span class="tag">未確認: ' + esc(j.checklist.must.unknownLabels.join('、')) + '</span>' : '') + '</div>' : '') +
        note + axes +
        (j.interview ? '' : '<div class="result-mode">面接評価 合計 ' + esc(j.total) + ' / ' + esc(j.max) + '点（' + esc(j.pct) + '%）　採用推奨 ' + esc(j.thresholds.recommendPts) + '点以上／上長判断 ' + esc(j.thresholds.reviewPts) + '点以上</div>') +
        mx + adj +
        (warns.length ? '<ul class="warn-list">' + warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="disclaimer">' + esc(j.disclaimer) + (j.evaluatedAt ? '　判定日時: ' + esc(U.fmtDateTime(j.evaluatedAt)) : '') + '</div>' +
        '</div>';
    }

    // ---- ヘッダー・サマリー ----
    const stepLabel = { 1: '応募情報の入力中', 2: '面接者への申し送り', 3: '面接チェックリストの入力中', 4: '採用可否判定まで完了' }[Number(record.step)] || '';
    const chips = [];
    if (a.category) chips.push(a.category);
    if (a.age) chips.push(a.age + '歳');
    if (a.gender) chips.push(a.gender);
    if (a.commuteMethod || a.commuteMinutes) chips.push([a.commuteMethod, a.commuteMinutes ? a.commuteMinutes + '分' : ''].filter(Boolean).join(' '));
    if (a.workPeriod) chips.push(R.labelOf(o.workPeriods, a.workPeriod));
    if (a.daysMin || a.daysMax) chips.push('週' + (a.daysMin || '?') + '〜' + (a.daysMax || '?') + '日');
    const chipsHtml = chips.map(function (ch) { return '<span class="chip">' + esc(ch) + '</span>'; }).join('') + hsChip;
    const verdictHtml = j
      ? '<div class="verdict ' + esc(j.result) + '"><span class="v-kicker">採用可否判定</span><span class="v-title">' + esc(j.title) + '</span><span class="v-sub">' + esc(axesSummary) + '</span></div>'
      : '<div class="verdict"><span class="v-kicker">採用可否判定</span><span class="v-title">' + (beforeIv ? '面接前' : '未実施') + '</span><span class="v-sub">' + esc(beforeIv ? '申し送り段階で保存' : '面接チェックリストの入力後に判定') + '</span></div>';
    // 全体レポートのヘッダー: 判定バッジの横に最終合否（小）
    const rhDecHtml = dcfg.enabled ? '<div class="rh-decision" id="rhDecision">' + decSvg(72, 'vdHead') + '</div>' : '';
    const headerHtml = '<header class="rh"><div class="rh-top">' +
      '<div class="rh-brand"><span class="rh-mark">' + esc((meta.theaterName || 'R').replace(/^TOHOシネマズ/, '').charAt(0) || 'R') + '</span><div><div class="rh-theater">' + esc(meta.theaterName) + '</div><div class="rh-app">' + esc(meta.appTitle) + ' ' + esc(meta.version) + '</div></div></div>' +
      '<div class="rh-meta">保存日時 ' + esc(savedAt) + (stepLabel ? '<br>進捗: ' + esc(stepLabel) : '') + '</div></div>' +
      '<div class="rh-main"><div><div class="sheet-title print-only">面接者への申し送りシート</div><div class="rh-kicker">応募者情報</div><h1 class="rh-name">' + esc(a.name || '応募者') + '<small>さん</small></h1><div class="rh-chips">' + chipsHtml + '</div></div>' + verdictHtml + rhDecHtml + '</div></header>\n';

    // 面接評価: チェックリスト方式は ○△× ＋総合判断、旧レコードは旧 10 項目（interviewModel が方式を決める）
    const tileMustNg = ivModel.mode === 'checklist' && clMust.mismatch ? '<span style="color:var(--danger);font-weight:700">・必須 不一致' + clMust.mismatch + '</span>' : '';
    const tileInterview = ivModel.rated > 0
      ? '<div class="tile"><div class="t-label">面接評価' + (ivModel.mode === 'legacy' ? '（旧形式）' : '') + '</div><div class="t-val">' + esc(ivModel.total) + '<small>/ ' + esc(ivModel.max) + '点</small></div><div class="meter"><span class="' + (ivModel.band ? bandCls(ivModel.band) : pctCls(ivModel.pct)) + '" style="width:' + clamp(ivModel.pct) + '%"></span></div><div class="t-sub">得点率 ' + esc(ivModel.pct) + '%' + (ivModel.bandLabel ? '・' + esc(ivModel.bandLabel) : '') + tileMustNg + '</div></div>'
      : '<div class="tile"><div class="t-label">面接評価</div><div class="t-val txt muted">未入力</div><div class="t-sub">' + (clMust.mismatch ? '<span style="color:var(--danger);font-weight:700">必須 不一致' + clMust.mismatch + '</span>' : '面接チェックリストで評価します') + '</div></div>';
    const tileContrib = c && Array.isArray(c.parts)
      ? (cPending
        ? '<div class="tile"><div class="t-label">シフト貢献度</div><div class="t-val txt">未確定</div><div class="t-sub">面接で確認後に確定（' + esc((c.missing || []).length) + '項目）</div></div>'
        : '<div class="tile"><div class="t-label">シフト貢献度</div><div class="t-val">' + esc(fmtN(c.total)) + '<small>/ ' + esc(fmtN(c.max)) + '点</small></div><div class="meter"><span class="' + bandCls(contribBand) + '" style="width:' + clamp(c.pct) + '%"></span></div><div class="t-sub">得点率 ' + esc(fmtN(c.pct)) + '%・' + esc(contribBandTxt) + '</div></div>')
      : '<div class="tile"><div class="t-label">シフト貢献度</div><div class="t-val txt muted">—</div><div class="t-sub">未計算</div></div>';
    const tileHandoff = '<div class="tile"><div class="t-label">留意点</div><div class="t-val">' + items.length + '<small>件</small></div>' +
      '<div class="counts"><span class="badge danger">要判断 ' + counts.block + '</span><span class="badge warn">要確認 ' + counts.warn + '</span><span class="badge info">共有 ' + counts.info + '</span></div>' +
      '<div class="t-sub">確認済み ' + doneCount + ' / ' + items.length + '</div></div>';
    const tileVerdict = j
      ? '<div class="tile"><div class="t-label">判定</div><div class="t-val txt"><span class="badge lg ' + resultTone(j.result) + '">' + esc(j.title) + '</span></div><div class="t-sub">' + esc(j.mode === 'matrix' ? '2軸判定' : j.mode === 'incomplete' ? '面接評価のみ（貢献度未確定）' : '面接評価のみ') + (j.evaluatedAt ? '・' + esc(U.fmtDateTime(j.evaluatedAt)) : '') + '</div></div>'
      : '<div class="tile"><div class="t-label">判定</div><div class="t-val txt muted">' + (beforeIv ? '面接前' : '未実施') + '</div><div class="t-sub">' + esc(beforeIv ? '面接で確認する項目: ' + (unconfirmed ? unconfirmed.split('／').length + 'セクション' : 'なし') : '面接評価の入力後に判定') + '</div></div>';
    const dashHtml = '<div class="dash">' + tileInterview + tileContrib + tileHandoff + tileVerdict + '</div>\n';

    const sec = function (title, body, key) { return '<section class="sec"' + (key ? ' data-sec="' + key + '"' : '') + '><h2>' + title + '</h2>\n' + body + '</section>\n'; };
    // 「面接チェックリスト」節と「面接評価（旧形式）」節（SPEC-checklist 4-3 の表）
    const notesHtml = record.interviewNotes ? '<h3>面接所見</h3><div class="note">' + esc(record.interviewNotes) + '</div>' : '';
    const checklistSecHtml = clHas
      ? sec('面接チェックリスト', checklistSheetHtml(record, profile, { mode: 'section' }), 'checklist')
      : !hasScores ? sec('面接チェックリスト', '<p class="empty">面接チェックリストは未入力です。</p>' + notesHtml, 'checklist') : '';
    const legacySecHtml = hasScores
      ? sec(clHas ? '面接評価（旧形式・10項目×5点・参考）' : '面接評価（旧形式・10項目×5点）', '<div class="bars">' + scoreRows + '</div>' + interviewTotal + (clHas ? '' : notesHtml), 'scores')
      : '';
    const json = jsonForScript(record);
    const SCRIPT_END = '</scr' + 'ipt>';

    // ---- 台本モードの記録（docs/SPEC-script-mode.md 3-3〜3-5）。留意点・面接で確認した情報・シフト貢献度は出さない ----
    let scriptHeaderHtml = '', scriptDashHtml = '', scriptApplicantSecHtml = '', scriptJudgmentSecHtml = '';
    if (scriptRec) {
      const sRows = R.scriptApplicantRows(a, clRec, clProf, record.management);
      const rowVal = function (k) { const r = sRows.find(function (x) { return x.key === k; }); return r ? r.value : ''; };
      const ivS = R.interviewModel(clProf, {}, clRec);
      const cntS = ivS.counts || { good: 0, fair: 0, poor: 0, blank: 0 };
      const marksS = '○' + cntS.good + ' △' + cntS.fair + ' ×' + cntS.poor;
      const oo = (clProf.checklist && clProf.checklist.overallOptions) || {};
      const ovV = R.OVERALL_POINTS.hasOwnProperty(clRec.overall) ? clRec.overall : '';
      const ovL = ovV ? (oo[ovV] || { hire: '採用', hold: '保留', reject: '不採用' }[ovV]) : '';
      const mustShort = function (m) { return !m || !m.total ? 'なし' : m.mismatch ? '不一致 ' + m.mismatch : m.unknown ? '未確認 ' + m.unknown : 'すべて一致'; };
      const mustCounts = function (m) { return '一致 ' + m.match + '・不一致 ' + m.mismatch + '・未確認 ' + m.unknown; };
      const jMust = j ? ((j.checklist && j.checklist.must) || j.must || clMust) : clMust;
      const jOv = j ? ((j.overall && typeof j.overall === 'object') ? j.overall : (j.checklist && j.checklist.overall) || { value: ovV, label: ovL }) : { value: ovV, label: ovL };
      // ヘッダー
      const sStep = { 1: '応募者の入力中', 3: '面接チェックリストの入力中', 4: '報告書まで完了' }[Number(record.step)] || '';
      const sChips = [rowVal('category'), rowVal('age'), rowVal('gender'), rowVal('graduation') ? '卒業予定 ' + rowVal('graduation') : '', rowVal('posting')].filter(Boolean)
        .map(function (ch) { return '<span class="chip">' + esc(ch) + '</span>'; }).join('');
      const sVerdict = j
        ? '<div class="verdict ' + esc(j.result) + '"><span class="v-kicker">採用可否判定</span><span class="v-title">' + esc(j.title) + '</span><span class="v-sub">' + esc('必須条件 ' + mustShort(jMust) + '・総合判断 ' + (jOv.label || '未入力')) + '</span></div>'
        : '<div class="verdict"><span class="v-kicker">採用可否判定</span><span class="v-title">未実施</span><span class="v-sub">アプリの「報告書」を開くと判定します</span></div>';
      scriptHeaderHtml = '<header class="rh"><div class="rh-top">' +
        '<div class="rh-brand"><span class="rh-mark">' + esc((meta.theaterName || 'R').replace(/^TOHOシネマズ/, '').charAt(0) || 'R') + '</span><div><div class="rh-theater">' + esc(meta.theaterName) + '</div><div class="rh-app">' + esc(meta.appTitle) + ' ' + esc(meta.version) + '</div></div></div>' +
        '<div class="rh-meta">保存日時 ' + esc(savedAt) + (sStep ? '<br>進捗: ' + esc(sStep) : '') + '</div></div>' +
        '<div class="rh-main"><div><div class="rh-kicker">応募者情報</div><h1 class="rh-name">' + esc(a.name || '応募者') + '<small>さん</small></h1><div class="rh-chips">' + sChips + '</div></div>' +
        sVerdict + (dcfg.enabled ? '<div class="rh-decision" id="rhDecision">' + decSvg(72, 'vdHead') + '</div>' : '') + '</div></header>\n';
      // ダッシュ（面接評価〔確認点〕・必須条件・総合判断・結果）
      const ivBandTxt = ivS.bandLabel || '';
      scriptDashHtml = '<div class="dash">' +
        (ivS.rated > 0
          ? '<div class="tile" data-tile="interview"><div class="t-label">面接評価（確認点）</div><div class="t-val">' + esc(ivS.total) + '<small>/ ' + esc(ivS.max) + '点</small></div><div class="meter"><span class="' + (ivS.band ? bandCls(ivS.band) : pctCls(ivS.pct)) + '" style="width:' + clamp(ivS.pct) + '%"></span></div><div class="t-sub">得点率 ' + esc(ivS.pct) + '%' + (ivBandTxt ? '・' + esc(ivBandTxt) : '') + '　' + esc(marksS) + '</div></div>'
          : '<div class="tile" data-tile="interview"><div class="t-label">面接評価（確認点）</div><div class="t-val txt muted">未入力</div><div class="t-sub">' + esc(marksS) + '</div></div>') +
        '<div class="tile" data-tile="must"><div class="t-label">必須条件</div><div class="t-val txt"' + (clMust.mismatch ? ' style="color:var(--danger)"' : '') + '>' + esc(mustShort(clMust)) + '</div><div class="t-sub">' + esc(mustCounts(clMust)) + '</div></div>' +
        '<div class="tile" data-tile="overall"><div class="t-label">総合判断</div><div class="t-val txt' + (ovV ? '' : ' muted') + '">' + esc(ovL || '未入力') + '</div><div class="t-sub">面接者の総合判断</div></div>' +
        (j
          ? '<div class="tile" data-tile="result"><div class="t-label">結果</div><div class="t-val txt"><span class="badge lg ' + resultTone(j.result) + '">' + esc(j.title) + '</span></div><div class="t-sub">台本モード' + (j.evaluatedAt ? '・' + esc(U.fmtDateTime(j.evaluatedAt)) : '') + '</div></div>'
          : '<div class="tile" data-tile="result"><div class="t-label">結果</div><div class="t-val txt muted">未実施</div><div class="t-sub">台本モード</div></div>') +
        '</div>\n';
      // 応募者情報（Step① の項目だけ）
      scriptApplicantSecHtml = sec('応募者情報', sRows.length
        ? '<table class="kv">' + sRows.map(function (r) { return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>'; }).join('') + '</table>\n'
        : '<p class="empty">応募者情報の入力はありません。</p>\n', 'applicant');
      // 採用可否判定（台本モード）
      let sj = '<p class="empty">採用可否判定は未実施です（アプリの「報告書」を開くと判定します）。</p>';
      if (j) {
        const jiv = j.interview || { total: j.total, max: j.max, pct: j.pct, band: '', bandLabel: '' };
        const jc = (j.checklist && j.checklist.counts) || cntS;
        const mDet = [];
        if ((jMust.mismatchLabels || []).length) mDet.push('不一致: ' + jMust.mismatchLabels.join('、'));
        if ((jMust.unknownLabels || []).length) mDet.push('未確認: ' + jMust.unknownLabels.join('、'));
        let adjS = '';
        if (j.adjustments && j.adjustments.length) {
          // 必須条件の不一致（must_conditions）があれば、総合判断の結果から変わったかどうか（from / to）に関係なく「固定」と書く
          const fixed = j.adjustments.some(function (x) { return x.code === 'must_conditions'; });
          adjS = '<div class="adj-head">' + (fixed ? '必須条件の不一致により「' + esc(j.title) + '」に固定' + (jOv.label ? '' : '（総合判断は未入力）') : '総合判断による結果「' + esc(titleOf(j.baseResult)) + '」から「' + esc(j.title) + '」に調整') + '</div>' +
            '<ul class="adj">' + j.adjustments.map(function (x) {
              return '<li><span class="step">' + (x.from === x.to ? esc(titleOf(x.to)) + '（固定）' : esc(titleOf(x.from)) + ' → ' + esc(titleOf(x.to))) + '</span><span>' + esc(x.reason) + '</span></li>';
            }).join('') + '</ul>';
        }
        const shownS = {};
        (j.adjustments || []).forEach(function (x) { shownS[x.reason] = true; });
        const warnsS = (j.warnings || []).filter(function (w) { return !shownS[w]; });
        sj = '<div class="result ' + esc(j.result) + '"><div class="result-kicker">採用可否判定（台本モード）</div>' +
          '<div class="result-title">' + esc(j.title) + '</div><div class="result-body">' + esc(j.body) + '</div>' +
          '<table class="kv script-judge">' +
            '<tr><th>必須条件</th><td>' + esc(mustCounts(jMust) + (mDet.length ? '（' + mDet.join('／') + '）' : '')) + '</td></tr>' +
            '<tr><th>面接評価（確認点）</th><td>' + esc(jiv.total + '/' + jiv.max + '点（' + jiv.pct + '%' + (jiv.bandLabel ? '・' + jiv.bandLabel : '') + '）　○' + jc.good + ' △' + jc.fair + ' ×' + jc.poor) + '</td></tr>' +
            '<tr><th>総合判断</th><td>' + esc(jOv.label || '未入力') + '</td></tr>' +
            '<tr><th>結果</th><td>' + esc(j.title) + '</td></tr>' +
          '</table>' + adjS +
          (warnsS.length ? '<ul class="warn-list">' + warnsS.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
          '<div class="disclaimer">' + esc(j.disclaimer) + (j.evaluatedAt ? '　判定日時: ' + esc(U.fmtDateTime(j.evaluatedAt)) : '') + '</div></div>';
      }
      scriptJudgmentSecHtml = sec('採用可否判定', sj, 'judgment');
    }

    // ---- 応募者の管理（押印欄）。レポート上でも押印でき、「押印を保存」で同じ形式のファイルを再出力する ----
    const mg = profile.management || {};
    const mgFields = Array.isArray(mg.fields) && mg.fields.length ? mg.fields : [];
    const mgManagers = Array.isArray(mg.managers) ? mg.managers : [];
    const management = record.management || {};
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
      const jd = record.judgment;
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
    const mgmtNoteHtml = '<div class="mgmt-note">' + (dcfg.enabled && scriptRec
      ? '運用: 面接者はアプリで面接チェックリストを入力し、報告書の「面接対応者」に押印して保存したファイルをスレッドに添付します。副支配人はこのファイルをブラウザで開き、「' + esc(dcfg.label) + '」で担当者を選んで「' + esc(dcfg.hireLabel) + '」または「' + esc(dcfg.rejectLabel) + '」を押し（押印欄「最終確認」が未押印なら同じ担当者の印も押されます）、「押印を保存」で再出力したファイルをスレッドに添付してください。レポート上で押した印・合否は「押印を保存」で再出力したファイルにだけ記録されます（保存せずに閉じると消えます）。再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。担当者名簿は設定（劇場ルール）の「応募者の管理」で編集できます。'
      : dcfg.enabled
      ? '運用: 面接者はアプリで面接チェックリストを入力・判定し、「面接対応者」に押印して保存したファイルをスレッドに添付します。副支配人はこのファイルをブラウザで開き、「' + esc(dcfg.label) + '」で担当者を選んで「' + esc(dcfg.hireLabel) + '」または「' + esc(dcfg.rejectLabel) + '」を押し（押印欄「最終確認」が未押印なら同じ担当者の印も押されます）、「押印を保存」で再出力したファイルをスレッドに添付してください。レポート上で押した印・合否は「押印を保存」で再出力したファイルにだけ記録されます（保存せずに閉じると消えます）。再出力したファイルはアプリの「読み込み」で押印・合否ごと引き継げます。担当者名簿は設定（劇場ルール）の「応募者の管理」で編集できます。'
      : '担当者名簿は設定（劇場ルール）の「応募者の管理」で編集できます。レポート上で押した印は「押印を保存」で再出力したファイルにだけ記録されます（保存せずに閉じると消えます）。再出力したファイルはアプリの「読み込み」で押印ごと引き継げます。') + '</div>';
    const mgmtHtml = decPanelHtml + (mgFields.length
      ? '<div class="stamp-row" id="mgmt">' + stampBoxes + '</div>' + saveBarHtml + mgmtNoteHtml
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

    // 詳細モード・旧レコードの本文（従来どおり）
    function fullBodyHtml() {
      return '<span>印刷:</span><button type="button" id="rtPrintSheet" class="primary">申し送りシート（A4 1枚）</button>' +
        (clHas ? '<button type="button" id="rtPrintChecklist">面接チェックリスト報告（A4）</button>' : '') +
        '<button type="button" id="rtPrintAll">レポート全体</button><span class="rtool-hint">申し送りシートは応募情報・留意点・面接で確認する項目・押印欄だけを 1 枚にまとめます。' +
        (clHas ? '面接チェックリスト報告は台本の①〜⑤の記入内容・判定・押印欄を A4 1〜2 枚にまとめます。' : '') + '</span></div>\n' +
      // 報告書表示の紙プレビュー（画面用。印刷用の #clSheet とは別に描く。docs/SPEC-report.md 4-4）
      (clHas ? '<div class="paper-wrap" id="reportPaper"><div class="paper-cap"><b>面接チェックリスト報告（A4 プレビュー）</b><span>印刷は「面接チェックリスト報告（A4）」で 1〜2 枚。全体は「詳細」</span></div>' +
        '<div class="paper" id="clPaper">' + checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '', decisionId: 'clPaperDecision', decisionSvgId: 'vdPaper' }) + '</div></div>\n' : '') +
      headerHtml + dashHtml +
      sec('応募時の情報', (preRows ? '<table class="kv">' + preRows + '</table>\n' : '<p class="empty">応募時の情報はありません。</p>\n') + hsHtml, 'pre') +
      (a.reviewerNotes ? sec('面接者への申し送りコメント', '<div class="note">' + esc(a.reviewerNotes) + '</div>', 'comment') : '') +
      sec('面接者への申し送り（留意点）',
        (handoffHtml || '<p class="empty">留意点はありません。</p>') +
        (strengths ? '<h3>強み（面接者へ共有）</h3><ul class="strengths">' + strengths + '</ul>' : '') +
        (record.handoff.note ? '<h3>追記（申し送りコメントの補足）</h3><div class="note">' + esc(record.handoff.note) + '</div>' : ''), 'handoff') +
      sec(beforeIv ? '面接前に分かっている情報（未確認）' : '面接で確認した情報',
        (ivRows ? '<table class="kv">' + ivRows + '</table>\n'
          : beforeIv ? '<p class="empty">面接前に分かっている項目の入力はありません（面接で確認します）。</p>\n'
            : '<p class="empty">面接で確認した項目の入力はありません。</p>\n') +
        (unconfirmed ? '<div class="callout"><span>⚠</span><div>保存時点で未入力: ' + esc(unconfirmed) + '</div></div>\n' : ''), 'interview') +
      sec('シフト貢献度', contribHtml, 'contrib') +
      checklistSecHtml + legacySecHtml +
      sec('採用可否判定', judgmentHtml, 'judgment') +
      (clHas ? '<div id="clSheet" class="cl-sheet-print">' + checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '' }) + '</div>\n' : '') +
      sec('応募者の管理', mgmtHtml, 'mgmt');
    }

    return '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>応募者情報 - ' + esc(name) + ' | ' + esc(meta.theaterName) + '</title>\n' +
      '<style>\n' + reportCss() + '\n' + checklistSheetCss() + '\n</style>\n</head>\n<body class="view-report' + (scriptRec ? ' has-cl mode-script' : clHas ? ' has-cl' : '') + '" data-filename="' + esc(filename) + '">\n<div class="page">\n' +
      // 表示切替（報告書＝既定／詳細＝全体レポート）＋印刷（docs/SPEC-report.md 4-3）
      '<div class="rtool no-print"><div class="rtool-view" role="group" aria-label="表示"><button type="button" id="rtViewReport" class="on" aria-pressed="true">報告書</button><button type="button" id="rtViewFull" aria-pressed="false">詳細</button></div><span class="rtool-sep"></span>' +
      (scriptRec
        // 台本モード: 申し送りシートは無い（回答が無くても白紙の台本として A4 報告を出す。docs/SPEC-script-mode.md 3-2）
        ? '<span>印刷:</span><button type="button" id="rtPrintChecklist" class="primary">面接チェックリスト報告（A4）</button><button type="button" id="rtPrintAll">レポート全体</button>' +
          '<span class="rtool-hint">面接チェックリスト報告は台本の①〜⑤の記入内容・判定・押印欄を A4 1〜2 枚にまとめます。「レポート全体」は「詳細」の内容を印刷します。</span></div>\n' +
          '<div class="paper-wrap" id="reportPaper"><div class="paper-cap"><b>面接チェックリスト報告（A4 プレビュー）</b><span>印刷は「面接チェックリスト報告（A4）」で 1〜2 枚。全体は「詳細」</span></div>' +
          '<div class="paper" id="clPaper">' + checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '', decisionId: 'clPaperDecision', decisionSvgId: 'vdPaper' }) + '</div></div>\n' +
          scriptHeaderHtml + scriptDashHtml + scriptApplicantSecHtml + checklistSecHtml + legacySecHtml + scriptJudgmentSecHtml +
          '<div id="clSheet" class="cl-sheet-print">' + checklistSheetHtml(record, profile, { mode: 'sheet', stamps: '' }) + '</div>\n' +
          sec('応募者の管理', mgmtHtml, 'mgmt')
        : fullBodyHtml()) +
      '<div class="foot"><span>' + esc(meta.footer) + '</span><span>このファイルはアプリの「読み込み」から再度開けます。埋め込みデータを編集しないでください。</span></div>\n' +
      '</div>\n' +
      '<script type="application/json" id="recruit-record">' + json + SCRIPT_END + '\n' +
      '<script>\n(function(){var b=document.getElementById("rtPrintSheet"),a=document.getElementById("rtPrintAll");\n' +
      'function prep(on){var h=document.querySelector(\'section.sec[data-sec="handoff"]\');if(h){h.classList.toggle("sheet-2col",!!on&&h.querySelectorAll("li.h").length>=9);}document.body.classList.toggle("print-handoff",!!on);}\n' +
      'window.__prepareHandoffSheet=prep;\n' +
      'if(b)b.addEventListener("click",function(){prep(true);var done=function(){prep(false);window.removeEventListener("afterprint",done);};window.addEventListener("afterprint",done);setTimeout(done,3000);window.print();});\n' +
      'if(a)a.addEventListener("click",function(){printingAll=true;try{window.print();}finally{printingAll=false;}});\n' +
      // 面接チェックリスト報告（A4）: body.print-checklist の付け外しと、1 ページ目があふれるときの強制改ページ解除（アプリと同じ規則）
      'var c=document.getElementById("rtPrintChecklist"),host=document.getElementById("clSheet");\n' +
      'function prepCl(on){if(!host)return false;var sh=host.querySelector(".cl-sheet");document.body.classList.toggle("print-checklist",!!on);if(sh){sh.classList.remove("cl-fit");if(on){var p1=sh.querySelector(\'.cl-page[data-page="1"]\')||sh.querySelector(".cl-page");if(p1){var t0=sh.getBoundingClientRect().top,h1=p1.getBoundingClientRect().bottom-t0,ht=sh.getBoundingClientRect().bottom-t0;if(h1>' + CL_SHEET_PAGE_PX + '||(ht-h1>' + CL_SHEET_PAGE_PX + '&&ht<=' + (CL_SHEET_PAGE_PX * 2) + '))sh.classList.add("cl-fit");}}}return true;}\n' +
      'window.__prepareChecklistSheet=prepCl;\n' +
      'if(c)c.addEventListener("click",function(){prepCl(true);var done=function(){prepCl(false);window.removeEventListener("afterprint",done);};window.addEventListener("afterprint",done);setTimeout(done,3000);window.print();});\n' +
      // 表示切替（報告書／詳細）。保存時の表示に関係なく、開いたときは必ず報告書表示（docs/SPEC-report.md 4-8）
      'var vr=document.getElementById("rtViewReport"),vf=document.getElementById("rtViewFull");\n' +
      'function setView(v){var r=v!=="full",bd=document.body;bd.classList.toggle("view-report",r);bd.classList.toggle("view-full",!r);\n' +
      '  if(vr){vr.classList.toggle("on",r);vr.setAttribute("aria-pressed",String(r));}if(vf){vf.classList.toggle("on",!r);vf.setAttribute("aria-pressed",String(!r));}}\n' +
      'window.__setReportView=setView;\n' +
      'if(vr)vr.addEventListener("click",function(){setView("report");});\n' +
      'if(vf)vf.addEventListener("click",function(){setView("full");});\n' +
      'setView("report");\n' +
      // 報告書表示（チェックリスト回答あり）のままブラウザで印刷したときは面接チェックリスト報告にする。「レポート全体」ボタンは除く
      'var autoCl=false,printingAll=false;\n' +
      'window.addEventListener("beforeprint",function(){var bd=document.body;\n' +
      '  if(printingAll||!bd.classList.contains("view-report")||!bd.classList.contains("has-cl")||bd.classList.contains("print-handoff")||bd.classList.contains("print-checklist"))return;\n' +
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
    reportCss: reportCss,
    normalizeDecision: normalizeDecision,
    decisionConfig: decisionConfig,
    V1_DEFAULT_TEXTS: V1_DEFAULT_TEXTS,
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
    generateReportHTML: generateReportHTML
  };
})(window);
