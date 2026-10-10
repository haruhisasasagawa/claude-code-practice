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
    if (hp.disallowedPathResult !== 'reject' && hp.disallowedPathResult !== 'review') hp.disallowedPathResult = base.highschoolPolicy.disallowedPathResult;
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
      applicant: U.deepClone(state.applicant),
      handoff: {
        items: h ? h.items.map(function (i) { return { id: i.id, severity: i.severity, category: i.category, text: i.text }; }) : [],
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

  function reportCss() {
    return '' +
      'body{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif;max-width:860px;margin:0 auto;padding:24px;color:#1a2233;background:#fff;line-height:1.6}\n' +
      '.head{border-bottom:3px solid #1f5fbf;padding-bottom:12px;margin-bottom:20px}\n' +
      '.head h1{font-size:20px;margin:0 0 4px}\n.head p{margin:0;color:#5b6675;font-size:13px}\n' +
      'h2{font-size:15px;margin:28px 0 10px;padding-left:10px;border-left:4px solid #1f5fbf}\n' +
      'h3{font-size:13.5px;margin:16px 0 6px;color:#3a4556}\n' +
      'table{width:100%;border-collapse:collapse;font-size:14px}\n' +
      'th,td{border:1px solid #dde3ea;padding:7px 10px;text-align:left;vertical-align:top}\n' +
      'th{width:9em;background:#f3f5f8;font-weight:600;color:#5b6675}\ntd.num{text-align:right;width:6em;white-space:nowrap}\n' +
      'table.list th{width:auto}\ntr.total td{font-weight:800;background:#f8fafc}\ntr.na td{color:#8a94a3}\n' +
      'ul{padding-left:0;list-style:none;margin:0}\n' +
      'li.h{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid #dde3ea;border-left-width:4px;border-radius:6px;margin-bottom:6px;font-size:14px}\n' +
      'li.h.block{border-left-color:#dc2626}li.h.warn{border-left-color:#d97706}li.h.info{border-left-color:#2563eb}\n' +
      'li.h.done{background:#f3faf6}\n.box{font-size:16px}\n' +
      '.sev{font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;background:#eef2f7;white-space:nowrap}\n' +
      '.cat{font-size:11px;color:#5b6675;white-space:nowrap;padding-top:2px}\n.txt{flex:1}\n' +
      '.tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:4px;background:#eef2f7;color:#3a4556;white-space:nowrap}\n' +
      '.tag.warn{background:#fdf1dc;color:#9a5b00}.tag.danger{background:#fde8e8;color:#b42318}.tag.ok{background:#e3f6ee;color:#0b7a55}\n' +
      '.callout{border:1px solid #dde3ea;border-left:4px solid #d97706;border-radius:6px;padding:10px 12px;margin-top:10px;font-size:14px;background:#fffaf0}\n' +
      '.callout.danger{border-left-color:#dc2626;background:#fff5f5}.callout.ok{border-left-color:#0e9f6e;background:#f3faf6}\n' +
      '.strengths li{padding:4px 0 4px 1.2em;position:relative}.strengths li:before{content:"✓";position:absolute;left:0;color:#0e9f6e;font-weight:700}\n' +
      '.result{border-radius:10px;padding:18px 20px;border:2px solid}\n' +
      '.result.recommend{background:#e3f6ee;border-color:#0e9f6e}.result.review{background:#fdf1dc;border-color:#d97706}.result.reject{background:#fde8e8;border-color:#dc2626}\n' +
      '.result-title{font-size:20px;font-weight:800;margin-bottom:6px}\n.result-score{margin-top:8px;font-weight:600}\n' +
      '.result-axes{margin-top:8px;font-weight:700;font-size:15px}\n.result-note{margin-top:8px;padding:8px 10px;background:rgba(255,255,255,.65);border-radius:6px;font-size:13.5px}\n' +
      '.result-mode{margin-top:4px;font-size:12.5px;color:#3a4556}\n' +
      '.mx-wrap{margin-top:12px;background:#fff;border-radius:8px;padding:8px}\n' +
      '.mx{border-collapse:collapse;width:100%;font-size:13px}.mx th,.mx td{border:1px solid #dde3ea;padding:6px 8px}\n' +
      '.mx th{text-align:center;width:auto}.mx th small{display:block;font-weight:600;color:#5b6675;font-size:11px}\n' +
      '.mx td{text-align:center}.mx td.recommend{background:#e3f6ee}.mx td.review{background:#fdf1dc}.mx td.reject{background:#fde8e8}\n' +
      '.mx td.cur{outline:3px solid #1a2233;outline-offset:-3px;font-weight:800}\n' +
      '.adj{margin-top:8px;font-size:13px;padding-left:1.2em;list-style:disc}\n' +
      '.warn-list{margin-top:10px;padding-left:1.2em;list-style:disc;font-size:13px}\n' +
      '.disclaimer{margin-top:10px;font-size:12px;color:#5b6675}\n.note{white-space:pre-wrap;background:#f8fafc;border:1px solid #dde3ea;border-radius:6px;padding:10px;font-size:14px}\n' +
      '.muted{color:#5b6675}\n.foot{margin-top:36px;padding-top:12px;border-top:1px solid #dde3ea;font-size:11px;color:#5b6675}\n' +
      '@media print{body{padding:0}.mx,.result,table{break-inside:avoid}}\n';
  }

  function generateReportHTML(record, profile) {
    const R = global.RecruitRules;
    const esc = U.esc;
    const a = record.applicant || {};
    const meta = profile.meta;
    const name = a.name ? a.name + 'さん' : '応募者';
    const savedAt = U.fmtDateTime(record.savedAt);
    const texts = profile.texts || {};
    const titleOf = function (r) { return ((texts[r] || {}).title) || r; };
    const bandName = function (b) { return ((texts.bandLabels || {})[b]) || { high: '高', mid: '中', low: '低' }[b] || '—'; };
    const fmtN = function (v) { return v == null || v === '' ? '-' : String(v); };

    const rows = R.describeApplicant(a, profile).map(function (r) {
      return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.value) + '</td></tr>';
    }).join('');

    // 高校生の採用方針（保存時点のスナップショットを優先）
    let hs = record.highschool;
    if (hs === undefined) {
      // 旧形式（スナップショットなし）は現在の設定で計算する
      try { const h0 = R.highschoolStatus(a, profile); hs = h0.applicable ? { status: h0.status, reasonsText: h0.reasonsText } : null; } catch (e) { hs = null; }
    }
    let hsHtml = '';
    if (hs && hs.status && hs.status !== 'none' && hs.status !== 'allowed') {
      const cls = hs.status === 'exception_met' ? 'ok' : hs.status === 'exception_incomplete' ? '' : 'danger';
      const policy = (profile.highschoolPolicy || {}).notice || '';
      hsHtml = '<div class="callout ' + cls + '"><b>高校生の採用方針: ' + esc(HS_STATUS_LABELS[hs.status] || hs.status) + '</b>' +
        (hs.reasonsText ? '（' + esc(hs.reasonsText) + '）' : '') +
        (policy ? '<div class="muted" style="font-size:12.5px;margin-top:4px">' + esc(policy) + '</div>' : '') + '</div>';
    }

    const sevLabel = function (s) { return (R.SEVERITY[s] || R.SEVERITY.info).label; };
    const handoffItems = (record.handoff.items || []).map(function (i) {
      const done = !!record.handoff.checks[i.id];
      return '<li class="h ' + esc(i.severity) + (done ? ' done' : '') + '">' +
        '<span class="box">' + (done ? '☑' : '☐') + '</span>' +
        '<span class="sev">' + esc(sevLabel(i.severity)) + '</span>' +
        '<span class="cat">' + esc(R.CATEGORY_LABELS[i.category] || i.category) + '</span>' +
        '<span class="txt">' + esc(i.text) + '</span></li>';
    }).join('');
    const strengths = (record.handoff.strengths || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

    // ---- シフト貢献度（保存時点のスナップショット） ----
    const j = record.judgment;
    const c = record.contribution || (j && j.contribution) || null;
    let contribHtml;
    if (!c || !Array.isArray(c.parts)) {
      contribHtml = '<p class="muted">シフト貢献度は未計算です（旧形式のデータ）。</p>';
    } else {
      const partRows = c.parts.map(function (pt) {
        const flags = (pt.flags || []).map(function (fl) {
          return '<span class="tag ' + (fl === 'restricted' ? 'danger' : fl === 'unanswered' ? 'warn' : '') + '">' + esc(FLAG_LABELS[fl] || fl) + '</span>';
        }).join('');
        return '<tr' + (pt.applicable === false ? ' class="na"' : '') + '><td>' + esc(pt.label) + flags + '</td>' +
          '<td class="num">' + (pt.applicable === false ? '対象外' : esc(fmtN(pt.score))) + '</td>' +
          '<td class="num">' + esc(fmtN(pt.max)) + '</td><td>' + esc(pt.detail || '') + '</td></tr>';
      }).join('');
      const bandTxt = c.enabled ? (c.incomplete && profile.contribution && profile.contribution.requireComplete !== false ? '未確定' : (c.bandLabel || bandName(c.band))) : '2軸判定OFF（参考値）';
      contribHtml = '<table class="list"><thead><tr><th>項目</th><th>得点</th><th>満点</th><th>内容</th></tr></thead><tbody>' + partRows +
        '<tr class="total"><td>合計</td><td class="num">' + esc(fmtN(c.total)) + '</td><td class="num">' + esc(fmtN(c.max)) + '</td>' +
        '<td>得点率 ' + esc(fmtN(c.pct)) + '%（' + esc(bandTxt) + '）</td></tr></tbody></table>' +
        (c.incomplete && c.missing && c.missing.length ? '<div class="callout">未確認: ' + esc(c.missing.join('・')) + '</div>' : '');

      // 繁忙期・オールナイトの明細
      const unitL = R.UNIT_LABEL || {};
      const triL = R.TRI_LABELS || {};
      const f = profile.features || {};
      const busyRows = (c.busyRows || []).map(function (b) {
        const days = b.days == null ? (R.isTri(b.avail) && f.vacationDays !== false ? '未確認' : '-') : b.days + (unitL[b.unit] || '日');
        return '<tr' + (b.weight > 0 ? '' : ' class="na"') + '><td>' + esc(b.label) + (b.critical && b.weight > 0 ? '<span class="tag">重点</span>' : '') + (b.weight > 0 ? '' : '<span class="tag">記録のみ</span>') + '</td>' +
          '<td>' + esc(b.avail ? (triL[b.avail] || b.avail) : '未確認') + '</td>' +
          '<td class="num">' + esc(days) + '</td>' +
          '<td class="num">' + esc(fmtN(b.refDays)) + (unitL[b.unit] ? esc(unitL[b.unit]) : '') + '</td>' +
          '<td class="num">' + esc(fmtN(b.weight)) + '</td></tr>';
      }).join('');
      if (busyRows) {
        contribHtml += '<h3>繁忙期（3連休・長期休暇）</h3><table class="list"><thead><tr><th>期間</th><th>可否</th><th>出られる日数</th><th>満点の日数</th><th>重み</th></tr></thead><tbody>' + busyRows + '</tbody></table>';
      }
      const o = profile.options || {};
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
        contribHtml += '<h3>祝日・土日・オールナイト</h3><table>' + extra.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>';
      }
    }

    const ev = profile.evaluation;
    const scoreRows = (ev.items || []).map(function (it) {
      const s = record.scores[it.id];
      return '<tr><td>' + esc(it.label) + '</td><td class="num">' + (s == null || s === '' ? '-' : esc(s) + '点') + '</td></tr>';
    }).join('');
    const hasScores = Object.keys(record.scores || {}).length > 0;
    const interviewTotal = j && j.interview
      ? '<tr class="total"><td>合計（' + esc(j.interview.pct) + '%・' + esc(j.interview.bandLabel || bandName(j.interview.band)) + '）</td><td class="num">' + esc(j.interview.total) + ' / ' + esc(j.interview.max) + '点</td></tr>'
      : '';

    // ---- 採用可否判定 ----
    let judgmentHtml = '<p class="muted">採用可否判定は未実施です。</p>';
    if (j) {
      let axes = '', mx = '', note = '', adj = '', mode = '';
      if (j.interview) {
        const jc = j.contribution || {};
        const cBand = j.mode === 'incomplete' ? '未確定' : j.mode === 'interviewOnly' ? '—' : (jc.bandLabel || bandName(jc.band));
        axes = '<div class="result-axes">面接 ' + esc(j.interview.pct) + '%（' + esc(j.interview.bandLabel || bandName(j.interview.band)) + '）× 貢献 ' +
          (j.mode === 'interviewOnly' ? '—' : esc(fmtN(jc.pct)) + '%') + '（' + esc(cBand) + '）</div>';
        mode = j.mode ? '<div class="result-mode">判定方式: ' + esc(MODE_LABELS[j.mode] || j.mode) + '</div>' : '';
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
            (j.mode === 'incomplete' ? '<div class="muted" style="font-size:12px;margin-top:4px">シフト貢献度が未確定のため、マトリクスには当てていません。</div>' : '') +
            '</div>';
        }
        if (j.matrix && j.matrix.note) note = '<div class="result-note">' + esc(j.matrix.note) + '</div>';
        if (j.adjustments && j.adjustments.length) {
          adj = '<div style="margin-top:10px;font-size:13px;font-weight:700">' +
            (j.mode === 'matrix' ? 'マトリクス' : '面接評価') + ': ' + esc(titleOf(j.baseResult)) + ' → 最終: ' + esc(titleOf(j.result)) + '</div>' +
            '<ul class="adj">' + j.adjustments.map(function (x) { return '<li>' + esc(titleOf(x.from)) + ' → ' + esc(titleOf(x.to)) + '：' + esc(x.reason) + '</li>'; }).join('') + '</ul>';
        }
      }
      const shownReasons = {};
      (j.adjustments || []).forEach(function (x) { shownReasons[x.reason] = true; });
      const warns = (j.warnings || []).filter(function (w) { return !shownReasons[w]; });
      judgmentHtml = '<div class="result ' + esc(j.result) + '">' +
        '<div class="result-title">' + esc(j.title) + '</div>' +
        '<div class="result-body">' + esc(j.body) + '</div>' + note + axes + mode +
        '<div class="result-score">面接評価 合計 ' + esc(j.total) + ' / ' + esc(j.max) + '点（' + esc(j.pct) + '%）　' +
        '採用推奨 ' + esc(j.thresholds.recommendPts) + '点以上 ／ 上長判断 ' + esc(j.thresholds.reviewPts) + '点以上</div>' +
        (j.interview && j.mode !== 'interviewOnly' && j.contribution ? '<div class="result-score">シフト貢献度 ' + esc(fmtN(j.contribution.total)) + ' / ' + esc(fmtN(j.contribution.max)) + '点（' + esc(fmtN(j.contribution.pct)) + '%）</div>' : '') +
        mx + adj +
        (warns.length ? '<ul class="warn-list">' + warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="disclaimer">' + esc(j.disclaimer) + (j.evaluatedAt ? '　判定日時: ' + esc(U.fmtDateTime(j.evaluatedAt)) : '') + '</div>' +
        '</div>';
    }

    const json = JSON.stringify(record).replace(/<\//g, '<\\/');
    const SCRIPT_END = '</scr' + 'ipt>';

    return '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>応募者情報 - ' + esc(name) + ' | ' + esc(meta.theaterName) + '</title>\n' +
      '<style>\n' + reportCss() + '</style>\n</head>\n<body>\n' +
      '<div class="head"><h1>' + esc(meta.theaterName) + '　応募者情報</h1>' +
      '<p>応募者: ' + esc(name) + '　｜　保存日時: ' + esc(savedAt) + '　｜　' + esc(meta.appTitle) + ' ' + esc(meta.version) + '</p></div>\n' +
      '<h2>応募情報</h2>\n<table>' + rows + '</table>\n' + hsHtml +
      '<h2>面接者への申し送り（留意点）</h2>\n' +
      (handoffItems ? '<ul>' + handoffItems + '</ul>' : '<p class="muted">留意点はありません。</p>') +
      (strengths ? '<h2>強み</h2>\n<ul class="strengths">' + strengths + '</ul>' : '') +
      (record.handoff.note ? '<h2>担当者からの追記</h2>\n<div class="note">' + esc(record.handoff.note) + '</div>' : '') +
      '<h2>シフト貢献度</h2>\n' + contribHtml + '\n' +
      '<h2>面接評価</h2>\n' +
      (hasScores ? '<table>' + scoreRows + interviewTotal + '</table>' : '<p class="muted">面接評価は未入力です。</p>') +
      (record.interviewNotes ? '<h2>面接所見</h2>\n<div class="note">' + esc(record.interviewNotes) + '</div>' : '') +
      '<h2>採用可否判定</h2>\n' + judgmentHtml + '\n' +
      '<div class="foot">' + esc(meta.footer) + '<br>このファイルはアプリの「読み込み」から再度開けます。ファイル内の埋め込みデータを編集しないでください。</div>\n' +
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
