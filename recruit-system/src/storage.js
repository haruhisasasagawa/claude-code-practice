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
    upgradeTexts(merged, base);
    enforceLocked(merged);
    merged.schemaVersion = 2;
    return merged;
  }

  // 保存前チェック（DOM 非依存）。errors があれば保存しない。
  function validateProfile(p) {
    const errors = [], warnings = [];
    p = p || {};
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
      scores: U.deepClone(state.scores || {}),
      interviewNotes: state.interviewNotes || '',
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
      return rec && rec.kind === RECORD_KIND ? rec : null;
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
      '@media (max-width:720px){.dash{grid-template-columns:repeat(2,minmax(0,1fr))}.rh-main{flex-direction:column;align-items:stretch}.verdict{align-items:flex-start}ul.strengths{grid-template-columns:1fr}.bar,.bar.wide{grid-template-columns:minmax(0,1fr) 90px 4.5em}.rh-top{flex-direction:column;align-items:flex-start}.rh-meta{text-align:left}}',
      '@media print{@page{size:A4;margin:12mm}body{background:#fff;font-size:12px}.page{padding:0;max-width:none}.rh,.sec,.tile,.result,li.h{box-shadow:none}.rh,.dash,.tile,.result,.mx-wrap,li.h,.bar,table.list tr,.callout,.note,.total-line{break-inside:avoid}.sec h2,.sec h3{break-after:avoid}.verdict,.result,.mx td,.badge,.tag,.sev,.meter>span,.b-track>span,li.h.done,.callout,.tile,.rh-mark,.sec h2::before{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    ].join('\n');
  }

  function generateReportHTML(record, profile) {
    const R = global.RecruitRules;
    const esc = U.esc;
    const a = record.applicant || {};
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

    // ---- 面接評価 ----
    const ev = profile.evaluation || {};
    const scale = Number(ev.scaleMax) || 5;
    const evItems = ev.items || [];
    const hasScores = Object.keys(record.scores || {}).length > 0;
    let scoreSum = 0;
    const scoreRows = evItems.map(function (it) {
      const s = record.scores[it.id];
      const has = !(s == null || s === '');
      const n = has ? Number(s) : 0;
      if (has && !isNaN(n)) scoreSum += n;
      const pct = has ? clamp(n / scale * 100) : 0;
      const isOverall = it.id === ev.overallItemId;
      return '<div class="bar' + (isOverall ? ' overall' : '') + '"><div class="b-label">' + esc(it.label) + '</div>' +
        '<div class="b-track"><span class="' + (has ? pctCls(pct) : '') + '" style="width:' + pct + '%"></span></div>' +
        '<div class="b-val">' + (has ? esc(s) + '<small> / ' + scale + '</small>' : '<small>-</small>') + '</div></div>';
    }).join('');
    const scoreMax = evItems.length * scale;
    const scorePct = j && j.interview ? j.interview.pct : (scoreMax ? Math.round(scoreSum / scoreMax * 1000) / 10 : 0);
    const scoreTotal = j && j.interview ? j.interview.total : scoreSum;
    const scoreBand = j && j.interview ? j.interview.band : '';
    const scoreBandTxt = j && j.interview ? (j.interview.bandLabel || bandName(j.interview.band)) : '';
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
          adj = '<div class="adj-head">' + (j.mode === 'matrix' ? 'マトリクスの結果' : '面接評価の結果') + '「' + esc(titleOf(j.baseResult)) + '」から「' + esc(titleOf(j.result)) + '」に調整</div>' +
            '<ul class="adj">' + j.adjustments.map(function (x) { return '<li><span class="step">' + esc(titleOf(x.from)) + ' → ' + esc(titleOf(x.to)) + '</span><span>' + esc(x.reason) + '</span></li>'; }).join('') + '</ul>';
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
        '<div class="result-body">' + esc(j.body) + '</div>' + note + axes +
        (j.interview ? '' : '<div class="result-mode">面接評価 合計 ' + esc(j.total) + ' / ' + esc(j.max) + '点（' + esc(j.pct) + '%）　採用推奨 ' + esc(j.thresholds.recommendPts) + '点以上／上長判断 ' + esc(j.thresholds.reviewPts) + '点以上</div>') +
        mx + adj +
        (warns.length ? '<ul class="warn-list">' + warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="disclaimer">' + esc(j.disclaimer) + (j.evaluatedAt ? '　判定日時: ' + esc(U.fmtDateTime(j.evaluatedAt)) : '') + '</div>' +
        '</div>';
    }

    // ---- ヘッダー・サマリー ----
    const stepLabel = { 1: '応募情報の入力中', 2: '面接者への申し送り', 3: '面接評価の入力中', 4: '採用可否判定まで完了' }[Number(record.step)] || '';
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
      : '<div class="verdict"><span class="v-kicker">採用可否判定</span><span class="v-title">' + (beforeIv ? '面接前' : '未実施') + '</span><span class="v-sub">' + esc(beforeIv ? '申し送り段階で保存' : '面接評価の入力後に判定') + '</span></div>';
    const headerHtml = '<header class="rh"><div class="rh-top">' +
      '<div class="rh-brand"><span class="rh-mark">' + esc((meta.theaterName || 'R').replace(/^TOHOシネマズ/, '').charAt(0) || 'R') + '</span><div><div class="rh-theater">' + esc(meta.theaterName) + '</div><div class="rh-app">' + esc(meta.appTitle) + ' ' + esc(meta.version) + '</div></div></div>' +
      '<div class="rh-meta">保存日時 ' + esc(savedAt) + (stepLabel ? '<br>進捗: ' + esc(stepLabel) : '') + '</div></div>' +
      '<div class="rh-main"><div><div class="rh-kicker">応募者情報</div><h1 class="rh-name">' + esc(a.name || '応募者') + '<small>さん</small></h1><div class="rh-chips">' + chipsHtml + '</div></div>' + verdictHtml + '</div></header>\n';

    const tileInterview = hasScores
      ? '<div class="tile"><div class="t-label">面接評価</div><div class="t-val">' + esc(scoreTotal) + '<small>/ ' + esc(scoreMax) + '点</small></div><div class="meter"><span class="' + (scoreBand ? bandCls(scoreBand) : pctCls(scorePct)) + '" style="width:' + clamp(scorePct) + '%"></span></div><div class="t-sub">得点率 ' + esc(scorePct) + '%' + (scoreBandTxt ? '・' + esc(scoreBandTxt) : '') + '</div></div>'
      : '<div class="tile"><div class="t-label">面接評価</div><div class="t-val txt muted">未入力</div><div class="t-sub">面接後に採点します</div></div>';
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

    const sec = function (title, body) { return '<section class="sec"><h2>' + title + '</h2>\n' + body + '</section>\n'; };
    const json = JSON.stringify(record).replace(/<\//g, '<\\/');
    const SCRIPT_END = '</scr' + 'ipt>';

    return '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>応募者情報 - ' + esc(name) + ' | ' + esc(meta.theaterName) + '</title>\n' +
      '<style>\n' + reportCss() + '\n</style>\n</head>\n<body>\n<div class="page">\n' +
      headerHtml + dashHtml +
      sec('応募時の情報', (preRows ? '<table class="kv">' + preRows + '</table>\n' : '<p class="empty">応募時の情報はありません。</p>\n') + hsHtml) +
      (a.reviewerNotes ? sec('面接者への申し送りコメント', '<div class="note">' + esc(a.reviewerNotes) + '</div>') : '') +
      sec('面接者への申し送り（留意点）',
        (handoffHtml || '<p class="empty">留意点はありません。</p>') +
        (strengths ? '<h3>強み（面接者へ共有）</h3><ul class="strengths">' + strengths + '</ul>' : '') +
        (record.handoff.note ? '<h3>追記（申し送りコメントの補足）</h3><div class="note">' + esc(record.handoff.note) + '</div>' : '')) +
      sec(beforeIv ? '面接前に分かっている情報（未確認）' : '面接で確認した情報',
        (ivRows ? '<table class="kv">' + ivRows + '</table>\n'
          : beforeIv ? '<p class="empty">面接前に分かっている項目の入力はありません（面接で確認します）。</p>\n'
            : '<p class="empty">面接で確認した項目の入力はありません。</p>\n') +
        (unconfirmed ? '<div class="callout"><span>⚠</span><div>保存時点で未入力: ' + esc(unconfirmed) + '</div></div>\n' : '')) +
      sec('シフト貢献度', contribHtml) +
      sec('面接評価', (hasScores ? '<div class="bars">' + scoreRows + '</div>' + interviewTotal : '<p class="empty">面接評価は未入力です。</p>') +
        (record.interviewNotes ? '<h3>面接所見</h3><div class="note">' + esc(record.interviewNotes) + '</div>' : '')) +
      sec('採用可否判定', judgmentHtml) +
      '<div class="foot"><span>' + esc(meta.footer) + '</span><span>このファイルはアプリの「読み込み」から再度開けます。埋め込みデータを編集しないでください。</span></div>\n' +
      '</div>\n' +
      '<script type="application/json" id="recruit-record">' + json + SCRIPT_END + '\n' +
      '</body>\n</html>\n';
  }

  global.RecruitStorage = {
    PROFILE_KEY: PROFILE_KEY,
    defaults: defaults,
    normalizeProfile: normalizeProfile,
    validateProfile: validateProfile,
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
