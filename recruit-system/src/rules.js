/*
 * 判定エンジン（DOM非依存・純関数）
 * ----------------------------------------------------------------------
 * - analyzeShifts       : 希望シフトの解析（オープン/クローズ/深夜/週時間など）
 * - highschoolStatus    : 高校生の採用方針（原則対象外・高3例外）の判定
 * - nightStatus         : 深夜帯・オールナイトに入れるか（年少者・高校在学中）
 * - computeContribution : シフト貢献度スコア（繁忙期・土日祝・オールナイト等。内訳つき）
 * - buildHandoff        : 面接者への申し送り（留意点）と強みを生成
 * - evaluateHiring      : 面接評価 × シフト貢献度 の2軸マトリクスで採用可否を判定
 * - describeApplicant   : 応募情報を表示用のラベル／値ペアに整形
 * - stageOf ほか        : 入力の段階（面接前に入力／面接時に確認。INPUT_SECTIONS）と interviewConfirm（面接で確認する項目）
 *
 * 劇場固有の数値・文言はすべて profile（config.default.js）から受け取る。
 * 法令で決まる値（深夜業 22:00〜翌5:00、年少者 18歳未満など）だけは LAW 定数として持つ（設定不可）。
 */
;(function (global) {
  'use strict';

  const U = global.RecruitUtil;

  const DAYS = [
    { key: 'mon', label: '月', weekday: true },
    { key: 'tue', label: '火', weekday: true },
    { key: 'wed', label: '水', weekday: true },
    { key: 'thu', label: '木', weekday: true },
    { key: 'fri', label: '金', weekday: true },
    { key: 'sat', label: '土', weekday: false },
    { key: 'sun', label: '日', weekday: false }
  ];

  const SEVERITY = {
    block: { key: 'block', label: '要判断', order: 0, desc: '採用担当が面接実施・採用の可否を判断する項目' },
    warn:  { key: 'warn',  label: '要確認', order: 1, desc: '面接時に応募者へ確認する項目' },
    info:  { key: 'info',  label: '共有',   order: 2, desc: '面接者へ共有しておく事項' }
  };

  // 法令で決まる値（設定画面からは変えられない）
  const LAW = {
    MINOR_AGE: 18,              // 年少者（労基法 第6章）
    NIGHT_START: 22 * 60,       // 労基法61条 深夜業 22:00〜
    NIGHT_END: 5 * 60,          //                    〜翌5:00
    DEEP_NIGHT_START: 2 * 60,   // 2:00〜5:00 にかかる勤務＝オールナイト相当
    MIN_WORK_AGE: 15,           // 労基法56条
    MINOR_DAILY_WORK_MAX: 480,  // 労基法60条 1日8h
    MINOR_WEEKLY_WORK_MAX: 2400 // 週40h
  };

  // 設定画面で OFF にできない・重要度を変えられないルール（文言は編集可）
  const LOCKED_RULES = {
    minor_late_night: 'block',
    allnight_minor: 'block',
    under_working_age: 'block',
    minor_hours: 'block'
  };

  const CATEGORY_LABELS = {
    legal: '法令',
    highschool: '高校生',
    general: '全般',
    busy: '繁忙期・休日',
    allNight: 'オールナイト',
    lateNight: '深夜帯',
    vocational: '専門学校生',
    foreign: '外国籍',
    consistency: '入力の整合'
  };
  const CATEGORY_ORDER = ['legal', 'highschool', 'general', 'busy', 'allNight', 'lateNight', 'vocational', 'foreign', 'consistency'];

  const TRI_LABELS = { ok: '○ 可能', consult: '△ 要相談', ng: '× 不可' };
  const UNIT_LABEL = { total: '日', perWeek: '日/週', perEvent: '日/回' };
  const RESULT_RANK = { reject: 0, review: 1, recommend: 2 };
  // 調整で結果が下がったときの本文（texts.adjusted が無い旧設定用の既定）
  const DEFAULT_ADJUSTED_BODY = '{name}は{scoreSummary}で点数上は{baseTitle}ですが、下記の理由により{resultTitle}とします。';
  const BANDS = ['high', 'mid', 'low'];
  const CONTINUE_LABELS = { yes: '継続する', undecided: '未定', no: '継続しない' };

  // ---------- 入力の段階（面接前に入力／面接時に確認）。docs/SPEC-stages.md 1 章 ----------
  // 段階は「どの画面で入力するか」「申し送りでどう見せるか」だけに使い、判定の条件は変えない。
  // 既定の段階は劇場固有値なので config（profile.inputStages）に置き、ここはセクションの構造だけを持つ。
  const INPUT_STAGES = ['pre', 'interview'];
  const INPUT_STAGE_LABELS = { pre: '面接前に入力（Step1）', interview: '面接時に確認（Step3）' };
  // 入力セクション（配列の順＝Step2・Step3・設定画面・レポートの並び）。fixed は常に pre
  const INPUT_SECTIONS = [
    { id: 'basic',         label: '基本情報', fixed: true, ask: '氏名・性別・年齢・区分・卒業予定年月',
      fields: ['name', 'gender', 'age', 'category', 'graduationDate'] },
    { id: 'hsException',   label: '高校3年生の例外条件', ask: '進路（決定済みか・種別・進学先）と、卒業後も当劇場で継続するか',
      fields: ['highschool.careerDecided', 'highschool.careerPath', 'highschool.destination', 'continueAfterGraduation'] },
    { id: 'continuation',  label: '卒業後の継続', ask: '卒業後も当劇場でアルバイトを継続するか',
      fields: ['continueAfterGraduation'] },
    { id: 'foreignFlag',   label: '外国籍', ask: '外国籍に該当するか',
      fields: ['foreign.isForeign'] },
    { id: 'foreignDetail', label: '外国籍の詳細', ask: '在留資格・資格外活動許可（在留カード裏面）・在留期限・日本語レベル',
      fields: ['foreign.residenceStatus', 'foreign.workPermit', 'foreign.residenceExpiry', 'foreign.japaneseLevel'] },
    { id: 'commute',       label: '通勤', ask: '通勤方法・通勤時間・最寄り駅',
      fields: ['commuteMethod', 'commuteMinutes', 'nearestStation'] },
    { id: 'work',          label: '勤務条件', fixed: true, ask: '勤務可能曜日・勤務希望時間・週の勤務日数・勤務期間',
      fields: ['workDays', 'anyDay', 'shifts', 'daysMin', 'daysMax', 'workPeriod'] },
    { id: 'sideJob',       label: 'かけもち', ask: 'かけもちの有無・かけもち先・週あたり時間',
      fields: ['sideJob', 'sideJobDetail', 'sideJobHoursPerWeek'] },
    { id: 'busy',          label: '繁忙期・土日祝', ask: '繁忙期ごとの可否と出られる日数・土日の出勤頻度・祝日の勤務',
      fields: ['vacation', 'vacationDays', 'weekendFreq', 'holidayWork'] },
    { id: 'lateNight',     label: '深夜帯（{h}時以降）', ask: '{h}時以降の勤務の可否・帰宅手段（終電時刻・タクシー料金）',
      fields: ['lateNight.availability', 'lateNight.returnMethod', 'lateNight.lastTrain', 'lateNight.taxiFare'] },
    { id: 'allNight',      label: 'オールナイト上映', ask: 'オールナイトの可否・頻度・条件',
      fields: ['allNight.availability', 'allNight.frequency', 'allNight.note'] },
    { id: 'extras',        label: '希望部署・応募経路', ask: '希望部署・応募経路',
      fields: ['department', 'applicationRoute'] },
    { id: 'notes',         label: '面接者への申し送りコメント', fixed: true, ask: '',
      fields: ['reviewerNotes'] }
  ];
  const SECTION_MAP = {};
  INPUT_SECTIONS.forEach(function (s) { SECTION_MAP[s.id] = s; });
  // 未入力が原因で出る留意点のうち、セクションが「面接時」なら Step2 の一覧から外すもの（条件は変えない）
  const DEFERRABLE_RULES = {
    late_night_return_unknown: { section: 'lateNight' },
    late_night_last_train:     { section: 'lateNight' },
    late_night_taxi_unknown:   { section: 'lateNight' },
    // 'no' / 'unknown' は回答なので対象外（空欄のときだけ）
    foreign_permit_missing:    { section: 'foreignDetail', byBlank: function (c) { return !(c.a.foreign.workPermit || ''); } },
    foreign_expiry:            { section: 'foreignDetail', byBlank: function (c) { return !c.a.foreign.residenceExpiry; } }
  };
  // Step2 では「面接で確認すること」カードがこの内容を表すため、一覧に出さないルール
  const AGGREGATE_RULES = { shift_unanswered: true };
  // deferred / aggregate の印を付けないカテゴリ（高校生の方針・法令は段階に関係なく面接前に届ける）
  const NEVER_DEFER_CATEGORIES = { legal: true, highschool: true };
  // shiftConditionMissing の key → セクション
  const MISSING_KEY_SECTION = {
    busy: 'busy', busyDays: 'busy', weekendFreq: 'busy', holiday: 'busy',
    lateNight: 'lateNight', allNight: 'allNight', allNightFreq: 'allNight', daysMax: 'work'
  };

  // ---------- 共通ヘルパー ----------
  // 0 を「未設定」と区別して読む（Number(x) || 既定 だと 0 が既定値に戻るため）
  function num(v, def) {
    const n = Number(v);
    return (v === '' || v == null || typeof v === 'boolean' || isNaN(n)) ? def : n;
  }
  function round1(x) { return Math.round(x * 10) / 10; }
  function isTri(v) { return v === 'ok' || v === 'consult'; }   // ○ または △
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  // 開始日0時からの分 → 'H:MM' / '翌H:MM'
  function fmtAbs(m) {
    if (m == null || isNaN(m)) return '';
    const x = ((m % 1440) + 1440) % 1440;
    return (m >= 1440 ? '翌' : '') + Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0');
  }

  // ---------- 時刻ユーティリティ ----------
  function toMinutes(hhmm) {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
    const p = hhmm.split(':').map(Number);
    return p[0] * 60 + p[1];
  }

  // 終了が開始より早い、または翌日フラグがある場合は翌日扱い
  function duration(start, end, nextDay) {
    const s = toMinutes(start);
    const e0 = toMinutes(end);
    if (s == null || e0 == null) return null;
    let e = e0;
    if (nextDay || e < s) e += 1440;
    return e - s;
  }

  function fmtDuration(min) {
    if (min == null) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? h + '時間' + m + '分' : h + '時間';
  }

  function fmtEnd(end, nextDay) {
    return nextDay ? '翌' + end : end;
  }

  // [s,e)（開始日0時からの絶対分。e-s ≤ 1440）と、毎日繰り返す窓 [ws,we)（we>ws、翌日にまたがってよい）の重なり分数
  function periodicOverlap(s, e, ws, we) {
    let t = 0;
    for (let k = -1; k <= 1; k++) t += Math.max(0, Math.min(e, we + k * 1440) - Math.max(s, ws + k * 1440));
    return t;
  }

  // 拘束時間から休憩（労基法34条: 6h超→45分、8h超→60分）を引いた推定実労働時間
  function estimateWorkMinutes(m) {
    if (m > 525) return m - 60;               // 8h45m 超 → 60分休憩
    if (m > 360) return Math.max(360, m - 45); // 6h 超 → 45分休憩（6h を下回らない）
    return m;
  }

  function categoryGroup(profile, value) {
    const c = (((profile || {}).options || {}).categories || []).find(function (x) { return x.value === value; });
    return c ? c.group : '';
  }

  function isStudentGroup(g) {
    return g === 'highschool' || g === 'university' || g === 'vocational';
  }

  function labelOf(list, value) {
    const hit = (list || []).find(function (o) { return (typeof o === 'string' ? o : o.value) === value; });
    if (!hit) return value || '';
    return typeof hit === 'string' ? hit : hit.label;
  }

  function ratioOf(list, value) {
    const hit = (list || []).find(function (o) { return o && o.value === value; });
    return hit ? clamp01(num(hit.ratio, 0)) : null;
  }

  // 繁忙期の一覧（不足キーを補った読み取り専用コピー）
  function busyItems(profile) {
    return (((profile || {}).options || {}).vacationItems || []).filter(function (v) { return v && v.id; }).map(function (v) {
      const unit = UNIT_LABEL[v.unit] ? v.unit : 'total';
      const maxDays = unit === 'perWeek' ? 7 : num(v.maxDays, 7);
      return {
        id: v.id, label: v.label || v.id, periodNote: v.periodNote || '',
        unit: unit, maxDays: maxDays, refDays: num(v.refDays, 1),
        weight: Math.max(0, num(v.weight, 1)), critical: v.critical !== false
      };
    });
  }

  // ---------- シフト解析 ----------
  function analyzeShifts(applicant, profile) {
    const p = (profile && profile.params) || {};
    const shifts = applicant.shifts || {};
    const days = applicant.workDays || [];
    const useAny = !!applicant.anyDay;
    const entries = [];

    const minShift = Number(p.minShiftMinutes) || 180;
    const openFrom = Number(p.openStartFrom), openTo = Number(p.openStartTo);
    const closeEnd = num(p.closeEndHour, 22) * 60;
    const lateStart = num(p.lateNightStartHour, 22) * 60;
    const daytimeBefore = (Number(p.daytimeStartBefore) || 15) * 60;

    function push(key, label, weekday, s) {
      if (!s || !s.start || !s.end) return;
      const min = duration(s.start, s.end, s.nextDay);
      if (min == null) return;
      const startMin = toMinutes(s.start);
      const endAbs = startMin + min;
      entries.push({
        key: key, label: label, weekday: weekday,
        start: s.start, end: s.end, nextDay: !!s.nextDay || (toMinutes(s.end) < startMin),
        minutes: min, startAbs: startMin, endAbs: endAbs,
        workMinutes: estimateWorkMinutes(min),
        legalNightMinutes: periodicOverlap(startMin, endAbs, LAW.NIGHT_START, 1440 + LAW.NIGHT_END),
        lateNightMinutes: periodicOverlap(startMin, endAbs, lateStart, 1440 + LAW.NIGHT_END),
        deepNightMinutes: periodicOverlap(startMin, endAbs, LAW.DEEP_NIGHT_START, LAW.NIGHT_END)
      });
    }

    if (useAny) {
      push('any', '曜日問わず', null, shifts.any);
    } else {
      DAYS.forEach(function (d) {
        if (days.indexOf(d.key) >= 0) push(d.key, d.label + '曜', d.weekday, shifts[d.key]);
      });
    }

    const res = {
      entries: entries,
      hasAnyEntry: entries.length > 0,
      hasShort: false, hasLong: false,
      isOpen: false, isClose: false, isLateNight: false,
      hasLegalNight: false, legalNightMinutes: 0,
      hasDeepNight: false,
      weekdayDaytime: false, weekdayMorningToAfternoon: false,
      weekendBoth: false,
      latestEndAbs: null, latestEndText: '',
      earliestStartAbs: null,
      maxEntryMinutes: 0, maxEntryWorkMinutes: 0,
      weeklyMinutes: 0, weeklyWorkMinutes: 0,
      closeDays: 0, legalCloseDays: 0, openDays: 0,
      dayCount: useAny ? 7 : days.length,
      weekendCount: useAny ? 2 : (days.indexOf('sat') >= 0 ? 1 : 0) + (days.indexOf('sun') >= 0 ? 1 : 0),
      missingTimes: false
    };

    entries.forEach(function (e) {
      if (e.minutes < minShift) res.hasShort = true; else res.hasLong = true;
      const sh = Math.floor(e.startAbs / 60);
      if (!isNaN(openFrom) && !isNaN(openTo) && sh >= openFrom && sh <= openTo) { res.isOpen = true; res.openDays++; }
      if (e.endAbs >= closeEnd) { res.isClose = true; res.closeDays++; }
      if (e.endAbs >= closeEnd && e.endAbs <= LAW.NIGHT_START) res.legalCloseDays++;
      // 時間帯の重なりで判定（日付をまたがない早朝勤務も検出する）
      if (e.lateNightMinutes > 0) res.isLateNight = true;
      if (e.legalNightMinutes > 0) res.hasLegalNight = true;
      if (e.deepNightMinutes > 0) res.hasDeepNight = true;
      res.legalNightMinutes += e.legalNightMinutes;
      const weekday = useAny ? true : e.weekday;
      if (weekday && e.startAbs >= 7 * 60 && e.startAbs < daytimeBefore) {
        res.weekdayDaytime = true;
        if (e.endAbs >= daytimeBefore) res.weekdayMorningToAfternoon = true;
      }
      if (res.latestEndAbs == null || e.endAbs > res.latestEndAbs) res.latestEndAbs = e.endAbs;
      if (res.earliestStartAbs == null || e.startAbs < res.earliestStartAbs) res.earliestStartAbs = e.startAbs;
      if (e.minutes > res.maxEntryMinutes) res.maxEntryMinutes = e.minutes;
      if (e.workMinutes > res.maxEntryWorkMinutes) res.maxEntryWorkMinutes = e.workMinutes;
    });

    res.latestEndText = res.latestEndAbs != null ? fmtAbs(res.latestEndAbs) : '';
    res.weekendBoth = useAny || (days.indexOf('sat') >= 0 && days.indexOf('sun') >= 0);

    // 週あたりの勤務時間（目安）
    const daysMax = Number(applicant.daysMax) || 0;
    const daysMin = Number(applicant.daysMin) || 0;
    if (useAny) {
      const e = entries[0];
      const n = daysMax || daysMin || 0;
      res.weeklyMinutes = e ? e.minutes * n : 0;
      res.weeklyWorkMinutes = e ? e.workMinutes * n : 0;
    } else {
      let list = entries.slice().sort(function (a, b) { return b.minutes - a.minutes; });
      if (daysMax && list.length > daysMax) list = list.slice(0, daysMax);
      res.weeklyMinutes = list.reduce(function (a, e) { return a + e.minutes; }, 0);
      res.weeklyWorkMinutes = list.reduce(function (a, e) { return a + e.workMinutes; }, 0);
    }

    const selectedCount = useAny ? 1 : days.length;
    res.missingTimes = selectedCount > 0 && entries.length < selectedCount;
    return res;
  }

  // ---------- 公開する判定関数（rules と UI で共用） ----------

  // 高校生の採用方針
  function highschoolStatus(a, profile) {
    a = a || {};
    const group = categoryGroup(profile, a.category);
    // pathDisallowed: 進路が例外の対象外。pathReject: そのうち rejectCareerPaths で不採用推奨にする進路（既定は就職のみ）
    const out = { applicable: false, isExceptionCategory: false, status: 'none', unmet: [], missing: [], reasonsText: '', pathDisallowed: false, pathReject: false, pathLabel: '' };
    if (group !== 'highschool') return out;
    out.applicable = true;
    const hp = (profile && profile.highschoolPolicy) || { mode: 'allow' };
    const mode = hp.mode === 'allow' || hp.mode === 'deny' ? hp.mode : 'exceptionOnly';
    if (mode === 'allow') { out.status = 'allowed'; return out; }
    if (mode === 'deny') { out.status = 'excluded'; return out; }
    const cats = Array.isArray(hp.exceptionCategories) ? hp.exceptionCategories : [];
    if (cats.indexOf(a.category) < 0) { out.status = 'excluded'; return out; }

    out.isExceptionCategory = true;
    const hs = a.highschool || {};
    if (hp.requireCareerDecided !== false) {
      if (!hs.careerDecided) out.missing.push('進路決定の有無');
      else if (hs.careerDecided === 'no') out.unmet.push('進路が未決定');
      else if (hs.careerDecided === 'yes') {
        if (!hs.careerPath) out.missing.push('進路の種別');
        else if ((hp.allowedCareerPaths || {})[hs.careerPath] !== true) {
          out.pathDisallowed = true;
          out.pathReject = (hp.rejectCareerPaths || {})[hs.careerPath] === true;
          out.pathLabel = labelOf(((profile.options || {}).careerPaths), hs.careerPath);
          out.unmet.push('進路が『' + out.pathLabel + '』（例外の対象外）');
        }
      }
    }
    if (hp.requireContinue !== false) {
      const ct = a.continueAfterGraduation;
      if (!ct) out.missing.push('卒業後の継続意思');
      else if (ct === 'undecided') out.unmet.push('卒業後の継続が未定');
      else if (ct === 'no') out.unmet.push('卒業後は継続しない');
    }
    out.status = out.unmet.length ? 'exception_unmet' : out.missing.length ? 'exception_incomplete' : 'exception_met';
    out.reasonsText = out.unmet.concat(out.missing.map(function (m) { return m + 'が未入力'; })).join('・');
    return out;
  }

  // 深夜帯・オールナイトに入れるか
  function nightStatus(a, profile) {
    a = a || {};
    const age = num(a.age, 0);
    const isHS = categoryGroup(profile, a.category) === 'highschool';
    const isMinor = (age > 0 && age < LAW.MINOR_AGE) || (age === 0 && isHS);
    const restricted = isMinor || (isHS && ((profile && profile.highschoolPolicy) || {}).nightRestricted !== false);
    const reason = isMinor ? (age ? '18歳未満（' + age + '歳）' : '18歳未満（高校生・年齢未入力）')
      : restricted ? '高校在学中（当劇場の運用）' : '';
    return { isMinor: isMinor, restricted: restricted, reason: reason };
  }

  // 終電 × 最も遅い終了時刻
  function lastTrainCheck(a, profile, shift) {
    a = a || {};
    const f = (profile && profile.features) || {};
    const p = (profile && profile.params) || {};
    const ln = a.lateNight || {};
    shift = shift || analyzeShifts(a, profile);
    const boundary = num(p.dayBoundaryHour, 5) * 60;
    const out = { applicable: false, conflict: false, lastTrainAbs: null, compareEndAbs: shift.latestEndAbs };
    let lt = toMinutes(ln.lastTrain);
    if (lt != null && lt < boundary) lt += 1440;
    out.lastTrainAbs = lt;
    // クローズ勤務の標準終了時刻（設定時のみ）。深夜帯 ○△ の人はその時刻まで働く前提で比べる
    let cmp = shift.latestEndAbs;
    let cs = toMinutes(p.closeShiftStandardEnd);
    if (cs != null && isTri(ln.availability)) {
      if (cs < boundary) cs += 1440;
      cmp = cmp == null ? cs : Math.max(cmp, cs);
    }
    out.compareEndAbs = cmp;
    out.applicable = !!f.lateNight && ln.returnMethod === 'train' && lt != null && shift.latestEndAbs != null;
    out.conflict = out.applicable && cmp + num(p.lastTrainBufferMinutes, 15) > lt;
    return out;
  }

  // 勤務可能曜日の数 × 週の勤務日数
  function weeklyDaysCheck(a) {
    a = a || {};
    const mn = num(a.daysMin, 0), mx = num(a.daysMax, 0);
    const dayCount = a.anyDay ? 7 : (a.workDays || []).length;
    const claimDays = Math.max(mn, mx);
    return {
      mismatch: !a.anyDay && dayCount > 0 && claimDays > dayCount,
      order: mn > 0 && mx > 0 && mn > mx,
      dayCount: dayCount,
      claimDays: claimDays
    };
  }

  // 年齢 × 区分
  function ageCategoryCheck(a, profile) {
    a = a || {};
    const group = categoryGroup(profile, a.category);
    const ranges = (((profile || {}).params || {}).groupAgeRanges) || {};
    const r = ranges[group];
    const age = num(a.age, 0);
    if (!r) return { mismatch: false, ageRange: '' };
    const min = num(r.min, null), max = num(r.max, null);
    const ageRange = min != null && max != null ? min + '〜' + max + '歳' : min != null ? min + '歳以上' : max != null ? max + '歳以下' : '';
    return {
      mismatch: age > 0 && ((min != null && age < min) || (max != null && age > max)),
      ageRange: ageRange
    };
  }

  // 判定前に確定させるシフト条件の未確認項目
  function shiftConditionMissing(a, profile, shift, night) {
    a = a || {};
    const f = (profile && profile.features) || {};
    shift = shift || analyzeShifts(a, profile);
    night = night || nightStatus(a, profile);
    const out = [];
    const vac = a.vacation || {}, vdays = a.vacationDays || {};
    const items = busyItems(profile).filter(function (v) { return v.weight > 0; });
    if (f.vacation) {
      const un = items.filter(function (v) { return !vac[v.id]; });
      if (un.length) out.push({ key: 'busy', label: '繁忙期の可否（' + un.map(function (v) { return v.label; }).join('・') + '）' });
      if (f.vacationDays) {
        const nd = items.filter(function (v) { return isTri(vac[v.id]) && num(vdays[v.id], null) == null; });
        if (nd.length) out.push({ key: 'busyDays', label: '繁忙期の日数（' + nd.map(function (v) { return v.label; }).join('・') + '）' });
      }
    }
    if (f.weekendFreq && shift.weekendCount > 0 && !a.weekendFreq) out.push({ key: 'weekendFreq', label: '土日の出勤頻度' });
    if (f.holidayWork && !a.holidayWork) out.push({ key: 'holiday', label: '祝日の勤務' });
    const an = a.allNight || {};
    if (f.allNight && !night.restricted && !an.availability) out.push({ key: 'allNight', label: 'オールナイトの可否' });
    if (f.allNight && !night.restricted && isTri(an.availability) && !an.frequency) out.push({ key: 'allNightFreq', label: 'オールナイトの頻度' });
    if (f.lateNight && !night.restricted && !(a.lateNight || {}).availability) out.push({ key: 'lateNight', label: '22時以降の勤務' });
    if (!a.daysMax) out.push({ key: 'daysMax', label: '週の最大勤務日数' });
    return out;
  }

  // ---------- 入力の段階（DOM 非依存）。docs/SPEC-stages.md 1-3・1-4 ----------
  // セクションの段階。fixed・未知の id は 'pre'。inputStages が無い・不正（未 normalize の profile）も 'pre'（従来どおり）
  function stageOf(profile, id) {
    const sec = SECTION_MAP[id];
    if (!sec || sec.fixed) return 'pre';
    // 該当の有無が分からないまま詳細だけ面接前に聞くことはないため、外国籍が面接時なら詳細も面接時
    if (id === 'foreignDetail' && stageOf(profile, 'foreignFlag') === 'interview') return 'interview';
    const st = profile && U.isObj(profile.inputStages) ? profile.inputStages[id] : undefined;
    return INPUT_STAGES.indexOf(st) >= 0 ? st : 'pre';
  }

  function fillHour(text, profile) {
    const h = num((((profile || {}).params) || {}).lateNightStartHour, 22);
    return String(text || '').replace(/\{h\}/g, h);
  }
  function sectionLabel(profile, id) { const s = SECTION_MAP[id]; return s ? fillHour(s.label, profile) : String(id || ''); }
  function sectionAsk(profile, id) { const s = SECTION_MAP[id]; return s ? fillHour(s.ask, profile) : ''; }

  // セクションが劇場の設定で使われているか（入力項目の ON/OFF・高校生の方針）
  function sectionActive(profile, id) {
    const f = (profile && profile.features) || {};
    switch (id) {
      case 'hsException': { const hp = profile && profile.highschoolPolicy; return !!hp && hp.mode !== 'allow'; }
      case 'continuation': return f.graduationDate !== false;
      case 'foreignFlag':
      case 'foreignDetail': return !!f.foreignNational;
      case 'busy': return !!(f.vacation || f.holidayWork || f.weekendFreq);
      case 'lateNight': return !!f.lateNight;
      case 'allNight': return !!f.allNight;
      case 'extras': return !!(f.department || f.applicationRoute);
      default: return !!SECTION_MAP[id];
    }
  }

  // 卒業後の継続（continueAfterGraduation）が属するセクション。高3（例外対象区分）は例外条件、それ以外は卒業後の継続
  function continueSection(a, profile) {
    return highschoolStatus(a || {}, profile).isExceptionCategory ? 'hsException' : 'continuation';
  }

  // 有効かつ、この応募者に関係するセクションか
  function sectionRelevant(a, profile, id) {
    if (!sectionActive(profile, id)) return false;
    a = a || {};
    if (id === 'hsException') return highschoolStatus(a, profile).isExceptionCategory;
    if (id === 'continuation') return isStudentGroup(categoryGroup(profile, a.category)) && !highschoolStatus(a, profile).isExceptionCategory;
    if (id === 'foreignDetail') return (a.foreign || {}).isForeign === 'yes';
    return true;
  }

  function filled(v) {
    if (Array.isArray(v)) return v.length > 0;
    return v !== '' && v != null && v !== false;
  }

  // セクションのフィールドのどれかに値があるか
  function sectionHasInput(a, profile, id) {
    const sec = SECTION_MAP[id];
    if (!sec) return false;
    a = a || {};
    const ids = busyItems(profile).map(function (v) { return v.id; });
    return sec.fields.some(function (path) {
      if (path === 'vacation' || path === 'vacationDays') {
        const m = a[path] || {};
        return ids.some(function (k) { return filled(m[k]); });
      }
      if (path === 'shifts') {
        const sh = a.shifts || {};
        return Object.keys(sh).some(function (k) { return !!(sh[k] && (sh[k].start || sh[k].end)); });
      }
      if (path === 'anyDay') return a.anyDay === true;
      if (path === 'continueAfterGraduation') return continueSection(a, profile) === id && filled(a.continueAfterGraduation);
      return filled(U.getPath(a, path));
    });
  }

  // 「面接で確認する項目」の元データ（Step2 の「面接で確認すること」・Step3・レポートで共用）
  //   level: 'required'＝判定前に必要（shiftConditionMissing）/ 'check'＝空欄だと留意点・確認漏れが残る（対応する留意点ルールが ON のときだけ）/ 'optional'＝記録用
  //   opts: { shift, night, hs, contribution, ctx, now }。ctx（buildContext の結果）が無ければ buildContext から作る
  function interviewConfirm(applicant, profile, opts) {
    opts = opts || {};
    const c = opts.ctx;
    if (!c) return buildContext(applicant || {}, profile, opts).confirm;
    const a = c.a;
    const f = c.features;
    const night = opts.night || c.night;
    const hs = opts.hs || c.hs;
    const contribution = opts.contribution || c.contribution;
    const strict = !!contribution.enabled && ((profile.contribution || {}).requireComplete !== false);
    const fo = a.foreign || {};

    // 判定に必要な未入力（shiftConditionMissing）をセクションへ振り分ける
    const required = {};
    (contribution.missingKeys || []).forEach(function (k, i) {
      const sid = MISSING_KEY_SECTION[k];
      if (!sid) return;
      (required[sid] = required[sid] || []).push({ key: k, label: contribution.missing[i], level: 'required' });
    });
    const cond = function (id) { try { return !!CONDITIONS[id](c); } catch (e) { return false; } };
    // 'check'（空欄だと留意点が残る）は、対応する留意点ルールを劇場が ON にしているときだけ。OFF なら記録用（optional）
    const ruleOn = function (id) {
      return (profile.handoffRules || []).some(function (r) { return r && r.id === id && r.enabled !== false; });
    };
    const lvl = function (id) { return ruleOn(id) ? 'check' : 'optional'; };

    function candidates(id) {
      const out = (required[id] || []).slice();
      const push = function (key, label, level) { out.push({ key: key, label: label, level: level }); };
      switch (id) {
        case 'commute':
          if (!filled(a.commuteMethod)) push('commuteMethod', '通勤方法', 'optional');
          if (!filled(a.commuteMinutes)) push('commuteMinutes', '通勤時間', 'optional');
          break;
        case 'hsException':
          if (hs.isExceptionCategory) hs.missing.forEach(function (m) { push('highschool', m, 'check'); });
          break;
        case 'continuation':
          if (!filled(a.continueAfterGraduation)) push('continueAfterGraduation', '卒業後も当劇場で継続するか', 'optional');
          break;
        case 'foreignFlag':
          if (!filled(fo.isForeign)) push('foreign.isForeign', '外国籍の該当', 'check');
          break;
        case 'foreignDetail':
          if (!filled(fo.residenceStatus)) push('foreign.residenceStatus', '在留資格', 'optional');
          if (!filled(fo.workPermit)) push('foreign.workPermit', '資格外活動許可（在留カード裏面）', lvl('foreign_permit_missing'));
          if (!filled(fo.residenceExpiry) && fo.workPermit !== 'na') push('foreign.residenceExpiry', '在留期限', lvl('foreign_expiry'));
          if (!filled(fo.japaneseLevel)) push('foreign.japaneseLevel', '日本語レベル', 'optional');
          break;
        case 'sideJob':
          if (!filled(a.sideJob)) push('sideJob', 'かけもちの有無', 'optional');
          // 週28時間の判定に使うため（外国籍のかけもちあり）
          if (a.sideJob === 'yes' && fo.isForeign === 'yes' && !filled(a.sideJobHoursPerWeek)) push('sideJobHoursPerWeek', 'かけもち先の週あたり時間', 'optional');
          break;
        case 'lateNight':
          if (cond('late_night_return_unknown')) push('lateNight.returnMethod', '帰宅手段', lvl('late_night_return_unknown'));
          if (cond('late_night_last_train')) push('lateNight.lastTrain', '終電時刻', lvl('late_night_last_train'));
          if (cond('late_night_taxi_unknown')) push('lateNight.taxiFare', 'タクシー料金の目安', lvl('late_night_taxi_unknown'));
          break;
        case 'extras':
          if (f.department && !filled(a.department)) push('department', '希望部署', 'optional');
          if (f.applicationRoute && !filled(a.applicationRoute)) push('applicationRoute', '応募経路', 'optional');
          break;
      }
      return out;
    }

    const sections = [];
    INPUT_SECTIONS.forEach(function (sec) {
      const id = sec.id;
      if (!sectionActive(profile, id)) return;
      const stage = stageOf(profile, id);
      const relevant = sectionRelevant(a, profile, id);
      const toAsk = stage === 'interview' && relevant && !(night.restricted && (id === 'lateNight' || id === 'allNight'));
      let missing = relevant ? candidates(id) : [];
      // 面接時に聞くセクション以外は、判定に必要な未入力（required）だけを残す
      if (!toAsk) missing = missing.filter(function (m) { return m.level === 'required'; });
      sections.push({
        id: id, label: sectionLabel(profile, id), ask: sectionAsk(profile, id),
        stage: stage, fixed: !!sec.fixed, relevant: relevant, toAsk: toAsk,
        hasInput: sectionHasInput(a, profile, id),
        missing: missing,
        blocking: strict && missing.some(function (m) { return m.level === 'required'; })
      });
    });

    const items = [];
    sections.forEach(function (s) {
      s.missing.forEach(function (m) { items.push({ section: s.id, sectionLabel: s.label, key: m.key, label: m.label, level: m.level }); });
    });
    const summary = sections.map(function (s) {
      const req = s.missing.filter(function (m) { return m.level === 'required'; });
      return req.length ? s.label + '：' + req.map(function (m) { return m.label; }).join('、') : '';
    }).filter(Boolean).join('／');
    return {
      strict: strict,
      sections: sections,
      items: items,
      summary: summary,
      sectionLabels: sections.filter(function (s) { return s.missing.length > 0; }).map(function (s) { return s.label; })
    };
  }

  function monthsUntil(ym, now) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    if (!m) return null;
    return (Number(m[1]) * 12 + Number(m[2])) - (now.getFullYear() * 12 + now.getMonth() + 1);
  }

  function bandOf(pct, highPct, midPct) {
    return pct >= highPct ? 'high' : pct >= midPct ? 'mid' : 'low';
  }

  // ---------- シフト貢献度 ----------
  function busyScore(a, profile, cf) {
    const f = (profile && profile.features) || {};
    const vac = a.vacation || {}, vdays = a.vacationDays || {};
    const tri = function (v) { return v === 'ok' ? 1 : v === 'consult' ? cf : 0; };
    let sw = 0, sws = 0, unanswered = false;
    const rows = busyItems(profile).map(function (v) {
      const avail = vac[v.id] || '';
      const days = num(vdays[v.id], null);
      let s = 0;
      if (isTri(avail)) {
        if (f.vacationDays) {
          if (days == null) { s = 0; if (v.weight > 0) unanswered = true; }
          else s = tri(avail) * (v.refDays > 0 ? Math.min(1, Math.max(0, days) / v.refDays) : 1);
        } else {
          s = tri(avail);
        }
      } else if (!avail && v.weight > 0) {
        unanswered = true;
      }
      sw += v.weight; sws += v.weight * s;
      return { id: v.id, label: v.label, unit: v.unit, avail: avail, days: days, refDays: v.refDays, weight: v.weight, critical: v.critical, ratio: s };
    });
    return { rows: rows, weightSum: sw, ratio: sw > 0 ? sws / sw : 0, unanswered: unanswered };
  }

  function computeContribution(applicant, profile, opts) {
    const a = applicant || {};
    opts = opts || {};
    const f = profile.features || {};
    const p = profile.params || {};
    const o = profile.options || {};
    const co = profile.contribution || {};
    const now = opts.now ? new Date(opts.now) : new Date();
    const shift = opts.shift || analyzeShifts(a, profile);
    const night = opts.night || nightStatus(a, profile);
    const cf = clamp01(num(co.consultFactor, 0.5));
    const tri = function (v) { return v === 'ok' ? 1 : v === 'consult' ? cf : 0; };
    const targets = co.targets || {};
    const group = categoryGroup(profile, a.category);
    const busy = busyScore(a, profile, cf);
    const ln = a.lateNight || {};
    const an = a.allNight || {};
    const mn = num(a.daysMin, 0), mx = num(a.daysMax, 0);

    const CALC = {
      busy: function () {
        if (!f.vacation || busy.weightSum <= 0) return { applicable: false, ratio: 0, detail: f.vacation ? '対象期間なし' : '対象外（入力項目OFF）' };
        const detail = busy.rows.filter(function (r) { return r.weight > 0; }).map(function (r) {
          if (!r.avail) return r.label + '未確認';
          const mark = (TRI_LABELS[r.avail] || r.avail).charAt(0);
          if (!isTri(r.avail) || !f.vacationDays) return r.label + mark;
          return r.label + mark + (r.days == null ? '日数未確認' : r.days + '/' + r.refDays + UNIT_LABEL[r.unit]);
        }).join('・');
        return { ratio: busy.ratio, detail: detail, flags: busy.unanswered ? ['unanswered'] : [] };
      },
      weekend: function () {
        const wc = shift.weekendCount;
        const which = a.anyDay ? '曜日問わず' : wc === 2 ? '土日とも' : wc === 1 ? ((a.workDays || []).indexOf('sat') >= 0 ? '土のみ' : '日のみ') : '土日なし';
        if (wc === 0) return { ratio: 0, detail: which };
        let r, flags = [], label;
        if (f.weekendFreq) {
          const fr = ratioOf(o.weekendFrequencies, a.weekendFreq);
          if (fr == null) { r = 0; flags.push('unanswered'); label = '頻度未確認'; }
          else { r = fr; label = labelOf(o.weekendFrequencies, a.weekendFreq); }
        } else {
          const wd = co.weekendDerived || {};
          r = wc === 2 ? clamp01(num(wd.both, 0.8)) : clamp01(num(wd.one, 0.4));
          flags.push('estimated'); label = '曜日から推定';
        }
        if (wc === 1) r = Math.min(r, clamp01(num(co.weekendOneDayCap, 0.6)));
        return { ratio: r, detail: which + '・' + label, flags: flags };
      },
      holiday: function () {
        if (!f.holidayWork) return { applicable: false, ratio: 0, detail: '対象外（入力項目OFF）' };
        if (!a.holidayWork) return { ratio: 0, detail: '未確認', flags: ['unanswered'] };
        return { ratio: tri(a.holidayWork), detail: TRI_LABELS[a.holidayWork] || a.holidayWork };
      },
      allNight: function () {
        if (!f.allNight) return { applicable: false, ratio: 0, detail: '対象外（入力項目OFF）' };
        if (night.restricted) return { ratio: 0, detail: '対象外（' + night.reason + '）', flags: ['restricted'] };
        if (!an.availability) return { ratio: 0, detail: '未確認', flags: ['unanswered'] };
        const mark = (TRI_LABELS[an.availability] || an.availability).charAt(0);
        if (!isTri(an.availability)) return { ratio: 0, detail: mark };
        const fr = ratioOf(o.allNightFrequencies, an.frequency);
        if (fr == null) return { ratio: 0, detail: mark + '・頻度未確認', flags: ['unanswered'] };
        return { ratio: tri(an.availability) * fr, detail: mark + '・' + labelOf(o.allNightFrequencies, an.frequency) };
      },
      close: function () {
        const target = Math.max(1, num(targets.closeDaysPerWeek, 2));
        const D = night.restricted ? shift.legalCloseDays : shift.closeDays;
        const r1 = a.anyDay ? (shift.isClose ? 1 : 0) : Math.min(1, D / target);
        const lnOn = f.lateNight && !night.restricted;
        const r2 = lnOn ? tri(ln.availability) * clamp01(num(co.lateNightAvailFactor, 0.5)) : 0;
        const parts = [a.anyDay ? 'クローズ' + (shift.isClose ? '可' : 'なし') : 'クローズ ' + D + '日/週（目標' + target + '日）'];
        const flags = [];
        if (night.restricted) parts.push('22時以降は対象外（' + night.reason + '）');
        else if (f.lateNight) {
          if (ln.availability) parts.push(num(p.lateNightStartHour, 22) + '時以降' + (TRI_LABELS[ln.availability] || ln.availability).charAt(0));
          else { parts.push(num(p.lateNightStartHour, 22) + '時以降 未確認'); flags.push('unanswered'); }
        }
        return { ratio: Math.max(r1, r2), detail: parts.join('／'), flags: flags };
      },
      open: function () {
        const target = Math.max(1, num(targets.openDaysPerWeek, 1));
        const r = a.anyDay ? (shift.isOpen ? 1 : 0) : Math.min(1, shift.openDays / target);
        return { ratio: r, detail: a.anyDay ? 'オープン' + (shift.isOpen ? '可' : 'なし') : 'オープン ' + shift.openDays + '日/週（目標' + target + '日）' };
      },
      weeklyDays: function () {
        const full = Math.max(1, num(targets.weeklyDaysFull, 4));
        let base = (mn && mx) ? (mn + mx) / 2 : (mx || mn);
        if (!base) return { ratio: 0, detail: '未入力', flags: ['unanswered'] };
        const wdLen = (a.workDays || []).length;
        let capped = false;
        if (!a.anyDay && wdLen > 0 && base > wdLen) { base = wdLen; capped = true; }
        const range = mn && mx ? '週' + mn + '〜' + mx + '日' : '週' + (mx || mn) + '日';
        return { ratio: Math.min(1, base / full), detail: range + '（平均' + round1(base) + '日' + (capped ? '・曜日数で上限' : '') + '／満点' + full + '日）' };
      },
      period: function () {
        const pe = (o.workPeriods || []).find(function (w) { return w.value === a.workPeriod; }) || null;
        if (!pe) return { ratio: 0, detail: '未入力', flags: a.workPeriod ? [] : ['unanswered'] };
        let r = clamp01(num(pe.contributionRatio, 0));
        let detail = pe.label;
        const ml = monthsUntil(a.graduationDate, now);
        if (isStudentGroup(group) && ml != null && a.continueAfterGraduation !== 'yes') {
          const cap = Math.max(0, ml) / 12;
          if (cap < r) { r = cap; detail += '（卒業まで' + Math.max(0, ml) + 'か月のため上限' + (Math.round(cap * 100) / 100) + '）'; }
        }
        return { ratio: r, detail: detail };
      }
    };

    const parts = [];
    let total = 0, max = 0;
    (co.items || []).forEach(function (it) {
      if (!it || !CALC[it.id] || it.enabled === false) return;
      const m = num(it.max, 0);
      if (m <= 0) return;
      const r = CALC[it.id]();
      const applicable = r.applicable !== false;
      const ratio = applicable ? clamp01(r.ratio) : 0;
      const score = applicable ? round1(m * ratio) : 0;
      parts.push({ id: it.id, label: it.label || it.id, max: m, score: score, ratio: ratio, applicable: applicable, detail: r.detail || '', flags: r.flags || [] });
      if (applicable) { total += score; max += m; }
    });
    total = round1(total);
    const enabled = f.contribution !== false && max > 0;
    const pct = max ? round1((total / max) * 100) : 0;
    const bands = co.bands || {};
    const band = enabled ? bandOf(pct, num(bands.highPct, 60), num(bands.midPct, 35)) : null;
    const bl = ((profile.texts || {}).bandLabels) || {};
    const missingList = shiftConditionMissing(a, profile, shift, night);

    return {
      enabled: enabled,
      total: total, max: max, pct: pct,
      band: band, bandLabel: band ? (bl[band] || { high: '高', mid: '中', low: '低' }[band]) : '',
      incomplete: missingList.length > 0,
      missing: missingList.map(function (m) { return m.label; }),
      missingKeys: missingList.map(function (m) { return m.key; }),
      restricted: night.restricted,
      parts: parts,
      busyRows: busy.rows,
      busyRatio: f.vacation && busy.weightSum > 0 ? busy.ratio : null
    };
  }

  // ---------- 留意点ルールの条件 ----------
  // 各関数は false（該当なし）/ true / 追加変数オブジェクト を返す
  function vacLabels(list) { return list.map(function (v) { return v.label; }).join('・'); }

  const CONDITIONS = {
    // --- 法令 ---
    minor_late_night: function (c) {
      if (!c.isMinor) return false;
      const wish = [];
      if (c.shift.hasLegalNight) wish.push('希望シフトに22:00〜翌5:00の時間帯が含まれている');
      if (c.features.lateNight && isTri(c.a.lateNight.availability)) wish.push('深夜帯の勤務希望が『' + TRI_LABELS[c.a.lateNight.availability] + '』になっている');
      return wish.length ? { nightWish: wish.join('、') } : false;
    },
    allnight_minor: function (c) { return c.isMinor && c.features.allNight && isTri(c.allNight.availability); },
    under_working_age: function (c) { return c.age > 0 && c.age < LAW.MIN_WORK_AGE; },
    minor_hours: function (c) {
      return c.isMinor && (c.shift.maxEntryWorkMinutes > LAW.MINOR_DAILY_WORK_MAX || c.shift.weeklyWorkMinutes > LAW.MINOR_WEEKLY_WORK_MAX);
    },
    minor_documents: function (c) { return c.isMinor; },

    // --- 高校生 ---
    hs_out_of_policy: function (c) { return c.hs.status === 'excluded'; },
    hs_exception_unmet: function (c) { return c.hs.status === 'exception_unmet' || c.hs.status === 'exception_incomplete'; },
    hs_exception_ok: function (c) { return c.hs.status === 'exception_met'; },
    hs_exception_period: function (c) { return c.hs.status === 'exception_met' && !!c.a.workPeriod && c.a.workPeriod !== 'long'; },
    hs_night_policy: function (c) {
      if (!c.isHighschool || c.isMinor || c.hsPolicy.nightRestricted === false) return false;
      const wish = [];
      if (c.features.lateNight && isTri(c.a.lateNight.availability)) wish.push('深夜帯の希望が『' + TRI_LABELS[c.a.lateNight.availability] + '』');
      if (c.features.allNight && isTri(c.allNight.availability)) wish.push('オールナイトの希望が『' + TRI_LABELS[c.allNight.availability] + '』');
      return wish.length ? { nightWish: wish.join('、') } : false;
    },
    highschool_permission: function (c) { return c.isHighschool && c.hs.status !== 'excluded'; },
    highschool_hours: function (c) { return c.isHighschool && c.hs.status !== 'excluded'; },
    highschool_time_violation: function (c) {
      if (!c.isHighschool || c.shift.latestEndAbs == null) return false;
      if (c.isMinor && c.shift.hasLegalNight) return false; // minor_late_night で出す
      const limit = toMinutes(c.p.highschoolLatestEnd || '22:00');
      return limit != null && c.shift.latestEndAbs > limit;
    },

    // --- 全般 ---
    age_limit: function (c) { return !!c.p.maxAge && c.age > 0 && c.age >= Number(c.p.maxAge); },
    short_period: function (c) { return c.a.workPeriod === 'short'; },
    // 卒業までの残月数 < 希望の勤務期間の最低月数（卒業後も継続する人は除く）
    graduation_midterm: function (c) {
      if (!c.features.graduationDate || !c.isStudent || c.monthsLeft == null || c.monthsLeft < 0) return false;
      const pe = c.periodEntry;
      if (!pe || !(num(pe.minMonths, 0) > 0)) return false;
      return c.monthsLeft < num(pe.minMonths, 0) && c.a.continueAfterGraduation !== 'yes';
    },
    weekly_days_one: function (c) { return c.daysMax === 1; },
    weekly_days_low: function (c) { return c.daysMax >= 2 && c.daysMax <= (Number(c.p.lowMaxDays) || 2); },
    weekly_days_unknown: function (c) { return !c.daysMax && !c.daysMin; },
    shift_times_missing: function (c) { return c.shift.missingTimes || (!c.shift.hasAnyEntry && (c.a.workDays || []).length === 0 && !c.a.anyDay); },
    short_shift: function (c) { return c.shift.hasShort; },
    weekday_daytime: function (c) { return c.shift.weekdayMorningToAfternoon; },
    commute_block: function (c) { return c.commute > 0 && c.commute >= (Number(c.p.commuteBlockMinutes) || 90); },
    commute_warn: function (c) {
      return c.commute > (Number(c.p.commuteWarnMinutes) || 60) && c.commute < (Number(c.p.commuteBlockMinutes) || 90);
    },
    commute_car: function (c) { return c.a.commuteMethod === 'マイカー'; },
    side_job_student: function (c) { return c.a.sideJob === 'yes' && c.isStudent; },
    side_job_nonstudent: function (c) { return c.a.sideJob === 'yes' && !c.isStudent; },
    freeter_insurance: function (c) { return c.group === 'freeter'; },

    // --- 繁忙期・休日 ---
    vacation_ng: function (c) {
      if (!c.features.vacation) return false;
      const ng = c.busyItems.filter(function (v) { return v.critical && v.weight > 0 && c.vac[v.id] === 'ng'; });
      return ng.length ? { vacationLabels: vacLabels(ng) } : false;
    },
    vacation_consult: function (c) {
      if (!c.features.vacation) return false;
      const cs = c.busyItems.filter(function (v) { return c.vac[v.id] === 'consult'; });
      return cs.length ? { vacationLabels: vacLabels(cs) } : false;
    },
    busy_optional_ng: function (c) {
      if (!c.features.vacation) return false;
      const ng = c.busyItems.filter(function (v) { return !v.critical && v.weight > 0 && c.vac[v.id] === 'ng'; });
      return ng.length ? { vacationLabels: vacLabels(ng) } : false;
    },
    weekend_missing: function (c) { return ((c.a.workDays || []).length > 0 || c.a.anyDay) && !c.shift.weekendBoth; },
    weekend_freq_low: function (c) {
      if (!c.features.weekendFreq || c.shift.weekendCount <= 0 || !c.a.weekendFreq) return false;
      const r = ratioOf(c.o.weekendFrequencies, c.a.weekendFreq);
      return r != null && r < num(c.p.weekendFreqWarnBelow, 0.4);
    },
    holiday_ng: function (c) { return !!c.features.holidayWork && c.a.holidayWork === 'ng'; },
    holiday_consult: function (c) { return !!c.features.holidayWork && c.a.holidayWork === 'consult'; },
    shift_unanswered: function (c) { return c.contribution.missing.length > 0; },

    // --- オールナイト（18歳未満・高校在学中は法令／方針ルールだけを出す） ---
    allnight_ok: function (c) { return c.features.allNight && c.lateNightEligible && c.allNight.availability === 'ok'; },
    allnight_consult: function (c) { return c.features.allNight && c.lateNightEligible && c.allNight.availability === 'consult'; },
    allnight_ng: function (c) { return c.features.allNight && c.lateNightEligible && c.allNight.availability === 'ng'; },

    // --- 深夜帯 ---
    late_night_ng: function (c) { return c.lateNightEligible && c.features.lateNight && c.a.lateNight.availability === 'ng'; },
    late_night_consult: function (c) { return c.lateNightEligible && c.features.lateNight && c.a.lateNight.availability === 'consult'; },
    late_night_shift_conflict: function (c) {
      return c.lateNightEligible && c.features.lateNight && c.a.lateNight.availability === 'ng' && c.shift.isLateNight;
    },
    late_night_last_train: function (c) {
      if (!c.lateNightEligible || !c.features.lateNight) return false;
      const ln = c.a.lateNight;
      const wants = ln.availability === 'ok' || ln.availability === 'consult' || c.shift.isLateNight;
      return wants && ln.returnMethod === 'train' && !ln.lastTrain;
    },
    // 帰宅手段が空欄だと終電・タクシー規定額のどちらの確認も出ないため、空欄そのものを要確認にする
    late_night_return_unknown: function (c) {
      if (!c.lateNightEligible || !c.features.lateNight) return false;
      const ln = c.a.lateNight;
      const wants = ln.availability === 'ok' || ln.availability === 'consult' || c.shift.isLateNight;
      return wants && !ln.returnMethod;
    },
    late_night_last_train_early: function (c) { return c.lateNightEligible && c.lastTrain.conflict; },
    late_night_taxi_over: function (c) {
      if (!c.lateNightEligible || !c.features.lateNight || !c.features.taxi) return false;
      return c.a.lateNight.returnMethod === 'taxi' && c.taxiFare > 0 && c.taxiFare > (Number(c.p.taxiLimitYen) || 0);
    },
    late_night_taxi_unknown: function (c) {
      if (!c.lateNightEligible || !c.features.lateNight || !c.features.taxi) return false;
      return c.a.lateNight.returnMethod === 'taxi' && !(c.taxiFare > 0);
    },
    late_night_taxi_ok: function (c) {
      if (!c.lateNightEligible || !c.features.lateNight || !c.features.taxi) return false;
      return c.a.lateNight.returnMethod === 'taxi' && c.taxiFare > 0 && c.taxiFare <= (Number(c.p.taxiLimitYen) || 0);
    },

    // --- 専門学校生 ---
    vocational_permission: function (c) { return c.group === 'vocational'; },

    // --- 外国籍 ---
    foreign_permit_missing: function (c) {
      return c.isForeign && ['no', 'unknown', ''].indexOf(c.a.foreign.workPermit || '') >= 0;
    },
    foreign_hour_cap: function (c) { return c.isForeign && c.a.foreign.workPermit !== 'na'; },
    foreign_hour_cap_exceeded: function (c) {
      if (!c.isForeign || c.a.foreign.workPermit === 'na') return false;
      const cap = (Number(c.p.foreignWeeklyHourCap) || 28) * 60;
      const total = c.shift.weeklyMinutes + c.sideJobHours * 60;
      return total > cap ? { weeklyHours: round1(total / 60) } : false;
    },
    foreign_expiry: function (c) {
      if (!c.isForeign || c.a.foreign.workPermit === 'na') return false;
      const exp = c.a.foreign.residenceExpiry;
      if (!exp) return { residenceExpiry: '未入力' };
      const m = /^(\d{4})-(\d{2})/.exec(exp);
      if (!m) return { residenceExpiry: exp };
      const months = Number(c.p.residenceExpiryWarnMonths) || 6;
      const limit = new Date(c.now.getTime());
      limit.setMonth(limit.getMonth() + months);
      const expDate = new Date(Number(m[1]), Number(m[2]), 0); // 月末
      return expDate <= limit ? { residenceExpiry: exp } : false;
    },
    foreign_japanese: function (c) {
      if (!c.isForeign) return false;
      const levels = c.o.japaneseLevels || [];
      const lv = c.a.foreign.japaneseLevel;
      return lv && levels.length && lv === levels[levels.length - 1] ? { japaneseLevel: lv } : false;
    },
    foreign_busy_cap: function (c) {
      if (!c.isForeign || c.a.foreign.workPermit === 'na' || !c.features.vacation) return false;
      return c.busyItems.some(function (v) { return isTri(c.vac[v.id]); });
    },
    allnight_foreign_hours: function (c) {
      return c.isForeign && c.a.foreign.workPermit !== 'na' && c.features.allNight && c.lateNightEligible && isTri(c.allNight.availability);
    },

    // --- 入力の整合 ---
    age_category_mismatch: function (c) { return c.ageCat.mismatch; },
    weekly_days_mismatch: function (c) { return c.days.mismatch || c.days.order; },
    allnight_latenight_conflict: function (c) {
      return c.features.allNight && c.features.lateNight && c.lateNightEligible &&
        isTri(c.allNight.availability) && c.a.lateNight.availability === 'ng';
    },
    graduation_past: function (c) { return c.isStudent && c.monthsLeft != null && c.monthsLeft < 0; },
    allnight_shift_conflict: function (c) {
      return c.features.allNight && c.allNight.availability === 'ng' && c.shift.hasDeepNight;
    }
  };

  function buildContext(applicant, profile, opts) {
    // 入れ子の欠けを補った浅いコピー（呼び出し元の applicant は書き換えない）
    const a = Object.assign({}, applicant, {
      lateNight: (applicant && applicant.lateNight) || {},
      foreign: (applicant && applicant.foreign) || {}
    });
    const p = profile.params || {};
    const o = profile.options || {};
    const group = categoryGroup(profile, a.category);
    const shift = analyzeShifts(a, profile);
    const features = profile.features || {};
    const c = {
      a: a, p: p, o: o, profile: profile, features: features, shift: shift,
      group: group,
      isStudent: isStudentGroup(group),
      isHighschool: group === 'highschool',
      isForeign: !!features.foreignNational && (a.foreign || {}).isForeign === 'yes',
      age: Number(a.age) || 0,
      commute: Number(a.commuteMinutes) || 0,
      daysMin: Number(a.daysMin) || 0,
      daysMax: Number(a.daysMax) || 0,
      taxiFare: Number((a.lateNight || {}).taxiFare) || 0,
      vacationItems: o.vacationItems || [],
      busyItems: busyItems(profile),
      vac: a.vacation || {}
    };
    c.now = (opts && opts.now) ? new Date(opts.now) : new Date();
    c.category = a.category;
    c.hsPolicy = profile.highschoolPolicy || {};
    c.hs = highschoolStatus(a, profile);
    c.night = nightStatus(a, profile);
    c.isMinor = c.night.isMinor;
    c.nightRestricted = c.night.restricted;
    c.lateNightEligible = !c.night.restricted;
    c.allNight = a.allNight || {};
    c.hsA = a.highschool || {};
    // かけもち「なし」に戻したときに残った時間（非表示の欄）を合算しない
    c.sideJobHours = a.sideJob === 'yes' ? num(a.sideJobHoursPerWeek, 0) : 0;
    c.periodEntry = (o.workPeriods || []).find(function (w) { return w.value === a.workPeriod; }) || null;
    c.monthsLeft = monthsUntil(a.graduationDate, c.now);
    c.lastTrain = lastTrainCheck(a, profile, shift);
    c.days = weeklyDaysCheck(a);
    c.ageCat = ageCategoryCheck(a, profile);
    c.contribution = computeContribution(a, profile, { shift: shift, night: c.night, now: c.now });
    // 面接で確認する項目（ctx を渡すので buildContext を再帰しない）
    c.confirm = interviewConfirm(a, profile, { shift: shift, night: c.night, hs: c.hs, contribution: c.contribution, ctx: c });
    return c;
  }

  function templateVars(c, extra) {
    const p = c.p;
    const o = c.o;
    const busyPart = c.contribution.busyRatio;
    const base = {
      name: c.a.name ? c.a.name + 'さん' : '応募者',
      age: c.a.age,
      maxAge: p.maxAge,
      commuteTime: c.a.commuteMinutes,
      nearestStation: c.a.nearestStation,
      minDays: c.a.daysMin,
      maxDays: c.a.daysMax,
      minShiftHours: Math.round(((Number(p.minShiftMinutes) || 180) / 60) * 10) / 10,
      highschoolLatestEnd: p.highschoolLatestEnd,
      foreignWeeklyHourCap: p.foreignWeeklyHourCap,
      foreignVacationWeeklyHourCap: p.foreignVacationWeeklyHourCap,
      weeklyHours: Math.round(c.shift.weeklyMinutes / 6) / 10,
      taxiFare: c.taxiFare ? c.taxiFare.toLocaleString('ja-JP') : '',
      taxiLimitYen: p.taxiLimitYen != null ? Number(p.taxiLimitYen).toLocaleString('ja-JP') : '',
      closeEndHour: p.closeEndHour,
      lateNightStartHour: p.lateNightStartHour,
      residenceExpiry: (c.a.foreign || {}).residenceExpiry,
      japaneseLevel: (c.a.foreign || {}).japaneseLevel,
      // 追加（高校生・繁忙期・オールナイト・整合）
      category: c.a.category,
      ageText: c.age ? c.age + '歳' : '年齢未入力',
      graduationDate: c.a.graduationDate,
      monthsLeft: c.monthsLeft,
      workPeriodLabel: labelOf(o.workPeriods, c.a.workPeriod),
      periodMinMonths: c.periodEntry ? num(c.periodEntry.minMonths, 0) : '',
      dayCount: c.days.dayCount,
      claimDays: c.days.claimDays,
      ageRange: c.ageCat.ageRange,
      latestEnd: c.lastTrain.compareEndAbs != null ? fmtAbs(c.lastTrain.compareEndAbs) : '',
      lastTrain: (c.a.lateNight || {}).lastTrain,
      lastTrainBufferMinutes: num(p.lastTrainBufferMinutes, 15),
      hsUnmet: c.hs.reasonsText,
      hsExceptionCategories: (Array.isArray(c.hsPolicy.exceptionCategories) ? c.hsPolicy.exceptionCategories : []).join('・'),
      careerPathLabel: labelOf(o.careerPaths, c.hsA.careerPath),
      destination: c.hsA.destination,
      nightReason: c.night.reason,
      allNightAvail: TRI_LABELS[c.allNight.availability] || '',
      allNightFreq: labelOf(o.allNightFrequencies, c.allNight.frequency),
      allNightShiftStart: p.allNightShiftStart,
      allNightShiftEnd: p.allNightShiftEnd,
      weekendFreqLabel: labelOf(o.weekendFrequencies, c.a.weekendFreq),
      sideJobHours: c.sideJobHours,
      missingLabels: c.contribution.missing.join('・'),
      // 面接で確認する項目（セクションごとの判定前に必要な未入力／未入力のあるセクション名）
      confirmSummary: c.confirm ? c.confirm.summary : '',
      confirmSections: c.confirm ? c.confirm.sectionLabels.join('・') : '',
      contribPct: c.contribution.pct,
      busyPct: busyPart != null ? round1(busyPart * 100) : ''
    };
    return Object.assign(base, extra || {});
  }

  function categoryRank(cat) {
    const i = CATEGORY_ORDER.indexOf(cat);
    return i < 0 ? CATEGORY_ORDER.length : i;
  }

  // ---------- 申し送り（留意点）生成 ----------
  function buildHandoff(applicant, profile, opts) {
    const c = buildContext(applicant, profile, opts);
    const items = [];

    (profile.handoffRules || []).forEach(function (rule) {
      if (!rule || rule.enabled === false) return;
      const fn = CONDITIONS[rule.id];
      if (!fn) return; // 条件未実装のルールはスキップ（HANDOFF.md 参照）
      let hit;
      try { hit = fn(c); } catch (e) { hit = false; }
      if (!hit) return;
      const extra = typeof hit === 'object' ? hit : {};
      const sev = SEVERITY[rule.severity] ? rule.severity : 'info';
      const item = {
        id: rule.id,
        severity: sev,
        category: rule.category || 'general',
        categoryLabel: CATEGORY_LABELS[rule.category] || rule.category || '全般',
        text: U.fill(rule.text, templateVars(c, extra)),
        _i: items.length
      };
      items.push(item);
      // 段階の印（項目の追加・削除・並び・文言は変えない。該当しない item にはキー自体を付けない）
      //   aggregate: Step2 では「面接で確認すること」カードが代わりに表す
      //   deferred : 面接時のセクションの未入力が原因。Step2 の一覧から外し Step3 以降で確認する
      if (!NEVER_DEFER_CATEGORIES[item.category]) {
        if (AGGREGATE_RULES[rule.id]) item.aggregate = true;
        const df = DEFERRABLE_RULES[rule.id];
        if (df && stageOf(profile, df.section) === 'interview' && (!df.byBlank || df.byBlank(c))) { item.deferred = true; item.section = df.section; }
      }
    });

    // 重要度 → カテゴリ順（同一カテゴリ内は handoffRules の並び）の安定ソート
    items.sort(function (x, y) {
      return (SEVERITY[x.severity].order - SEVERITY[y.severity].order) ||
        (categoryRank(x.category) - categoryRank(y.category)) || (x._i - y._i);
    });
    items.forEach(function (i) { delete i._i; });

    // 強み（面接者への共有用）
    const st = (profile.texts && profile.texts.strengths) || {};
    const strengths = [];
    const v = templateVars(c);
    const sh = c.shift;
    const add = function (key, cond) { if (cond && st[key]) strengths.push({ key: key, text: U.fill(st[key], v) }); };
    add('open', sh.isOpen);
    add('close', sh.isClose);
    add('weekend', sh.weekendBoth);
    add('longTerm', c.a.workPeriod === 'long');
    add('days3', c.daysMin >= 3);
    add('longShift', sh.hasLong && !sh.hasShort);
    add('commuteNear', c.commute > 0 && c.commute <= 30);
    const weighted = c.busyItems.filter(function (it) { return it.weight > 0; });
    add('vacationOk', c.features.vacation && weighted.length > 0 && weighted.every(function (it) { return c.vac[it.id] === 'ok'; }));
    add('busyStrong', c.features.vacation && c.contribution.busyRatio != null &&
      c.contribution.busyRatio * 100 >= num((profile.contribution || {}).busyStrongPct, 80));
    add('holidayOk', c.features.holidayWork && c.a.holidayWork === 'ok');
    add('lateNightOk', c.features.lateNight && c.lateNightEligible && c.a.lateNight.availability === 'ok');
    add('allNightOk', c.features.allNight && c.lateNightEligible && c.allNight.availability === 'ok');

    const counts = { block: 0, warn: 0, info: 0 };
    items.forEach(function (i) { counts[i.severity]++; });

    return {
      items: items,
      strengths: strengths,
      counts: counts,
      shift: sh,
      badges: shiftBadges(c),
      contribution: c.contribution,
      confirm: c.confirm,
      hs: c.hs,
      night: c.night,
      generatedAt: new Date().toISOString()
    };
  }

  // 右パネル等で使う短いバッジ
  function shiftBadges(c) {
    const b = [];
    const sh = c.shift;
    const f = c.features;
    // 応募者の属性
    if (c.hs.applicable) {
      if (c.hs.status === 'excluded') b.push({ key: 'hs', label: '高校生 原則対象外', tone: 'danger' });
      else if (c.hs.status === 'exception_met') b.push({ key: 'hs', label: '高3 例外対象', tone: 'ok' });
      else if (c.hs.status === 'exception_unmet' || c.hs.status === 'exception_incomplete') b.push({ key: 'hs', label: '高3 例外未充足', tone: 'danger' });
      else if (c.hs.status === 'allowed') b.push({ key: 'hs', label: '高校生', tone: 'info' });
    }
    if (c.isMinor) b.push({ key: 'minor', label: '18歳未満', tone: 'warn' });
    // シフト
    if (sh.isOpen) b.push({ key: 'open', label: 'オープン', tone: 'ok' });
    if (sh.isClose) b.push({ key: 'close', label: 'クローズ', tone: 'ok' });
    if (sh.isLateNight && c.lateNightEligible) b.push({ key: 'late', label: '深夜帯', tone: 'info' });
    if (sh.weekendBoth) b.push({ key: 'weekend', label: '土日可', tone: 'ok' });
    else if ((c.a.workDays || []).length) b.push({ key: 'weekend-ng', label: '土日要確認', tone: 'warn' });
    if (f.holidayWork && c.a.holidayWork === 'ok') b.push({ key: 'holiday', label: '祝日可', tone: 'ok' });
    // 繁忙期
    if (f.vacation) {
      const busyStrong = c.contribution.busyRatio != null &&
        c.contribution.busyRatio * 100 >= num((c.profile.contribution || {}).busyStrongPct, 80);
      if (busyStrong) b.push({ key: 'busy', label: '繁忙期◎', tone: 'ok' });
      if (c.busyItems.some(function (v) { return v.critical && v.weight > 0 && c.vac[v.id] === 'ng'; })) b.push({ key: 'busy-ng', label: '繁忙期×あり', tone: 'danger' });
      if (c.busyItems.some(function (v) { return v.weight > 0 && !c.vac[v.id]; })) b.push({ key: 'busy-unknown', label: '繁忙期 未確認', tone: 'warn' });
    }
    // オールナイト
    if (f.allNight) {
      const av = c.allNight.availability;
      if (c.nightRestricted && isTri(av)) b.push({ key: 'allnight', label: 'オールナイト不可(法令/運用)', tone: 'danger' });
      else if (!c.nightRestricted && av === 'ok') b.push({ key: 'allnight', label: 'オールナイト可', tone: 'ok' });
      else if (!c.nightRestricted && av === 'consult') b.push({ key: 'allnight', label: 'オールナイト△', tone: 'warn' });
    }
    if (c.a.workPeriod === 'long') b.push({ key: 'long', label: '長期', tone: 'ok' });
    if (c.a.workPeriod === 'short') b.push({ key: 'short', label: '短期', tone: 'danger' });
    if (c.daysMin >= 3) b.push({ key: 'days', label: '週' + c.daysMin + '日〜', tone: 'ok' });
    if (sh.hasShort) b.push({ key: 'shortshift', label: '短時間日あり', tone: 'warn' });
    if (c.isForeign) b.push({ key: 'foreign', label: '外国籍', tone: 'info' });
    return b;
  }

  // ---------- 採用可否判定（面接評価 × シフト貢献度） ----------
  function evaluateHiring(applicant, scores, profile, handoff, checks, opts) {
    const ev = profile.evaluation || {};
    const items = ev.items || [];
    const scale = Number(ev.scaleMax) || 5;
    const texts = profile.texts || {};
    const co = profile.contribution || {};
    scores = scores || {};
    checks = checks || {};

    const breakdown = items.map(function (it) {
      const raw = scores[it.id];
      const s = raw === undefined || raw === null || raw === '' ? null : Number(raw);
      return { id: it.id, label: it.label, score: isNaN(s) ? null : s, isOverall: it.id === ev.overallItemId };
    });

    const unscored = breakdown.filter(function (b) { return b.score == null; });
    const total = breakdown.reduce(function (a, b) { return a + (b.score || 0); }, 0);
    const max = items.length * scale;
    const pct = max ? Math.round((total / max) * 1000) / 10 : 0;

    const th = ev.thresholds || {};
    const recPct = num(th.recommendPct, 70);
    const revPct = num(th.reviewPct, 40);
    const iBand = bandOf(pct, recPct, revPct);
    const legacy = { high: 'recommend', mid: 'review', low: 'reject' }[iBand];
    const bl = texts.bandLabels || {};
    const bandLabel = function (b) { return b ? (bl[b] || { high: '高', mid: '中', low: '低' }[b]) : ''; };

    const warnings = [];
    const overall = breakdown.find(function (b) { return b.isOverall; });
    const warnBelow = Number(ev.overallWarnBelow) || 3;
    if (overall && overall.score != null && overall.score < warnBelow) {
      warnings.push('面接者の総合判断が' + overall.score + '点と低評価です。採用可否は慎重に判断してください。');
    }
    if (unscored.length) {
      warnings.push('未入力の評価項目が' + unscored.length + '件あります（0点として集計）。');
    }

    const unresolved = ((handoff && handoff.items) || []).filter(function (i) { return !checks[i.id]; });
    const unresolvedBlock = unresolved.filter(function (i) { return i.severity === 'block'; });
    const unresolvedLegal = unresolvedBlock.filter(function (i) { return i.category === 'legal'; });
    if (unresolved.length) {
      warnings.push('未確認の留意点が' + unresolved.length + '件あります（うち要判断 ' + unresolvedBlock.length + '件）。');
    }

    // --- 2軸マトリクス ---
    const contrib = computeContribution(applicant, profile, opts);
    const cells = ((profile.matrix || {}).cells) || {};
    const cellNotes = ((profile.matrix || {}).cellNotes) || {};
    const bands = co.bands || {};
    const cHigh = num(bands.highPct, 60), cMid = num(bands.midPct, 35);
    let mode, result, cellKey = null, cellResult = null, note = '';
    if (!contrib.enabled) {
      mode = 'interviewOnly';
      result = legacy;
    } else if (contrib.incomplete && co.requireComplete !== false) {
      mode = 'incomplete';
      result = legacy;
    } else {
      mode = 'matrix';
      cellKey = iBand + '_' + contrib.band;
      const cell = cells[cellKey];
      if (RESULT_RANK[cell] != null) {
        result = cell;
        cellResult = cell;
      } else {
        result = legacy;
        warnings.push('マトリクス設定が不正なため面接評価のみで判定しました。');
      }
      note = cellNotes[cellKey] ? String(cellNotes[cellKey]) : '';
    }
    const baseResult = result;

    // --- 調整（下げる方向のみ。実際に変わったときだけ記録） ---
    const adjustments = [];
    function down(to, code, reason, alwaysWarn) {
      const from = result;
      if (RESULT_RANK[to] < RESULT_RANK[from]) {
        result = to;
        adjustments.push({ code: code, from: from, to: to, reason: reason });
        warnings.push(reason);
      } else if (alwaysWarn) {
        warnings.push(reason);
      }
    }
    // (1) シフト条件の未確認
    if (mode === 'incomplete') {
      down('review', 'contribution_incomplete',
        'シフト貢献度の入力が不足しているため（' + contrib.missing.join('・') + '）、面接評価のみで判定し、採用推奨には留めません。', true);
    }
    // (2) 総合判断の足切り
    const cutoff = num(ev.overallRejectAtOrBelow, 0);
    if (cutoff > 0 && overall && overall.score != null && overall.score <= cutoff) {
      down('reject', 'overall_cutoff', '面接者の総合判断が' + overall.score + '点（' + cutoff + '点以下）のため、不採用推奨とします。');
    }
    // (3) 高校生の採用方針
    const hs = highschoolStatus(applicant, profile);
    if (ev.holdOnHighschoolException !== false &&
        (hs.status === 'excluded' || hs.status === 'exception_unmet' || hs.status === 'exception_incomplete')) {
      // 未入力（確認待ち）と未充足（条件を満たさない）・原則対象外を区別して理由を示す
      // 進路が例外の対象外で、rejectCareerPaths に含まれる進路（既定は就職のみ）は不採用推奨まで下げる。
      // その他（浪人・未定など）・進路未決定・未入力は上長最終判断要に留める
      const pathReject = hs.status === 'exception_unmet' && hs.pathReject;
      const hsReason = hs.status === 'excluded'
        ? '高校生の採用方針（' + (applicant.category || '高校生') + 'は原則対象外）に該当するため、採用推奨ではなく上長最終判断要として扱います。'
        : hs.status === 'exception_incomplete'
          ? '高校3年生の例外条件（' + hs.missing.join('・') + '）が未入力のため、採用推奨ではなく上長最終判断要として扱います。面接で確認し、Step3 の「高校3年生の例外条件」に入力してください。'
          : pathReject
            ? (applicant.category || '高校生') + 'で進路が『' + hs.pathLabel + '』（例外の対象外）のため、不採用推奨とします。'
            : '高校3年生の例外条件を満たしていない（' + hs.reasonsText + '）ため、採用推奨ではなく上長最終判断要として扱います。';
      down(pathReject ? 'reject' : 'review', 'highschool_hold', hsReason);
    }
    // (4) 法令の要判断が未確認（設定に関係なく常に）
    if (unresolvedLegal.length) {
      down('review', 'legal_hold', '法令に関わる要判断の留意点が未確認のため、採用推奨ではなく上長最終判断要として扱います。');
    }
    // (5) 要判断が未確認
    if (ev.holdOnUnresolvedBlock && unresolvedBlock.length) {
      down('review', 'unresolved_block', '「要判断」の留意点が未確認のため、採用推奨ではなく上長最終判断要として扱います。');
    }

    if (mode === 'matrix' && contrib.band === 'low') {
      const weak = contrib.parts.filter(function (pt) { return pt.applicable; })
        .map(function (pt, i) { return { label: pt.label, ratio: pt.ratio, i: i }; })
        .sort(function (x, y) { return (x.ratio - y.ratio) || (x.i - y.i); })
        .slice(0, 2).map(function (x) { return x.label; });
      warnings.push('シフト貢献度が' + contrib.pct + '%と低めです（主な不足: ' + weak.join('・') + '）。');
    }

    const strengths = breakdown.filter(function (b) { return b.score != null && b.score >= 4 && !b.isOverall; }).map(function (b) { return b.label; });
    const concerns = breakdown.filter(function (b) { return b.score != null && b.score <= 2 && !b.isOverall; }).map(function (b) { return b.label; });

    const t = texts[result] || { title: result, body: '' };
    const name = applicant.name ? applicant.name + 'さん' : '応募者';
    // 調整で結果が下がったときは、点数を結論の理由のように書く本文やマスの注記を出さず、調整後とわかる本文にする
    const lowered = adjustments.length > 0 && result !== baseResult;
    const resultBodyTpl = mode === 'interviewOnly' ? t.body : (((texts.matrix || {})[result]) || t.body);
    const bodyTpl = lowered ? (texts.adjusted || DEFAULT_ADJUSTED_BODY) : resultBodyTpl;
    const contribBand = mode === 'incomplete' ? '未確定' : (bandLabel(contrib.band) || '—');
    const vars = {
      name: name, total: total, max: max, pct: pct,
      interviewPct: pct, interviewBand: bandLabel(iBand),
      contribTotal: contrib.total, contribMax: contrib.max, contribPct: contrib.pct,
      contribBand: contribBand,
      resultTitle: t.title, baseTitle: (texts[baseResult] || { title: baseResult }).title,
      scoreSummary: mode === 'interviewOnly'
        ? '面接評価' + total + '/' + max + '点（' + pct + '%）'
        : '面接評価' + pct + '%（' + bandLabel(iBand) + '）・シフト貢献度' + contrib.pct + '%（' + contribBand + '）'
    };
    const cellNote = note;
    if (lowered) note = '';

    const table = {};
    BANDS.forEach(function (ib) { BANDS.forEach(function (cb) { const k = ib + '_' + cb; table[k] = cells[k] != null ? cells[k] : null; }); });

    return {
      result: result,
      title: t.title,
      body: U.fill(bodyTpl, vars),
      disclaimer: texts.disclaimer || '',
      total: total, max: max, pct: pct,
      thresholds: {
        recommendPct: recPct, reviewPct: revPct,
        recommendPts: Math.ceil((max * recPct) / 100),
        reviewPts: Math.ceil((max * revPct) / 100)
      },
      breakdown: breakdown,
      strengths: strengths,
      concerns: concerns,
      warnings: warnings,
      unresolved: unresolved.map(function (i) { return { id: i.id, severity: i.severity, text: i.text }; }),
      adjusted: adjustments.length > 0,
      evaluatedAt: new Date().toISOString(),
      // 2軸判定
      mode: mode,
      interview: { total: total, max: max, pct: pct, band: iBand, bandLabel: bandLabel(iBand) },
      contribution: contrib,
      matrix: {
        cellKey: cellKey,
        cellResult: cellResult,
        note: note,           // 表示用（調整で結果が下がったときは空）
        cellNote: cellNote,   // マスの注記（調整の有無に関係なく）
        table: table,
        bands: { interview: { high: recPct, mid: revPct }, contribution: { high: cHigh, mid: cMid } }
      },
      baseResult: baseResult,
      adjustments: adjustments,
      highschool: { status: hs.status, reasonsText: hs.reasonsText }
    };
  }

  // ---------- 表示用整形 ----------
  function describeShifts(applicant, profile) {
    const sh = analyzeShifts(applicant, profile);
    return sh.entries.map(function (e) {
      return e.label + ' ' + e.start + '〜' + fmtEnd(e.end, e.nextDay) + '（' + fmtDuration(e.minutes) + '）';
    });
  }

  function hsStatusText(hs, a, profile) {
    if (!hs.applicable || hs.status === 'allowed' || hs.status === 'none') return '';
    if (hs.status === 'excluded') return '原則対象外';
    if (hs.status === 'exception_met') {
      const h = a.highschool || {};
      const parts = [];
      if (h.careerPath) parts.push(labelOf((profile.options || {}).careerPaths, h.careerPath) + (h.destination ? '（' + h.destination + '）' : ''));
      if (a.continueAfterGraduation === 'yes') parts.push('卒業後 継続する');
      return '例外対象（条件充足）' + (parts.length ? '：' + parts.join('／') : '');
    }
    return '例外条件 未充足（' + hs.reasonsText + '）';
  }

  function describeApplicant(a, profile) {
    const o = profile.options || {};
    const f = profile.features || {};
    const p = profile.params || {};
    const rows = [];
    // section: 行が属する入力セクション（SPEC-stages 1-5。応募時の情報／面接で確認した情報の振り分けに使う）
    const add = function (label, value, section) { if (value !== undefined && value !== null && value !== '') rows.push({ label: label, value: value, section: section }); };
    const group = categoryGroup(profile, a.category);
    const hs = highschoolStatus(a, profile);
    const night = nightStatus(a, profile);

    add('氏名', a.name, 'basic');
    add('性別', a.gender, 'basic');
    add('年齢', a.age ? a.age + '歳' : '', 'basic');
    add('区分', a.category, 'basic');
    // 高校生の方針（原則対象外など）は段階に関係なく面接前に伝えるため basic
    add('高校生の例外', hsStatusText(hs, a, profile), 'basic');
    if (f.graduationDate) add('卒業予定', a.graduationDate, 'basic');
    if (isStudentGroup(group)) add('卒業後の継続', CONTINUE_LABELS[a.continueAfterGraduation] || '', continueSection(a, profile));
    add('通勤方法', a.commuteMethod, 'commute');
    add('通勤時間', a.commuteMinutes ? a.commuteMinutes + '分' : '', 'commute');
    add('最寄り駅', a.nearestStation, 'commute');

    const dayLabels = a.anyDay ? '曜日問わず' : DAYS.filter(function (d) { return (a.workDays || []).indexOf(d.key) >= 0; }).map(function (d) { return d.label; }).join('・');
    add('勤務可能曜日', dayLabels, 'work');
    const dmin = a.daysMin, dmax = a.daysMax;
    add('週勤務日数', dmin || dmax ? (dmin || '?') + '〜' + (dmax || '?') + '日' : '', 'work');
    add('希望シフト', describeShifts(a, profile).join(' / '), 'work');
    add('勤務期間', labelOf(o.workPeriods, a.workPeriod), 'work');
    const sjh = num(a.sideJobHoursPerWeek, null);
    add('かけもち', a.sideJob === 'yes'
      ? 'あり' + (a.sideJobDetail ? '（' + a.sideJobDetail + '）' : '') + (sjh != null ? '（週' + sjh + '時間）' : '')
      : a.sideJob === 'no' ? 'なし' : '', 'sideJob');

    if (f.vacation) {
      const vdays = a.vacationDays || {};
      const v = busyItems(profile).map(function (it) {
        const val = (a.vacation || {})[it.id];
        if (!val) return it.label + ':未確認';
        let s = it.label + ':' + (TRI_LABELS[val] || val).charAt(0);
        if (isTri(val) && f.vacationDays) {
          const d = num(vdays[it.id], null);
          s += d == null ? '（日数未確認）' : d + UNIT_LABEL[it.unit];
        }
        return s;
      }).join('　');
      add('繁忙期', v, 'busy');
    }
    if (f.holidayWork) add('祝日', TRI_LABELS[a.holidayWork] || '', 'busy');
    if (f.weekendFreq && a.weekendFreq) add('土日の頻度', labelOf(o.weekendFrequencies, a.weekendFreq), 'busy');
    if (f.allNight) {
      const an = a.allNight || {};
      if (night.restricted) {
        add('オールナイト', '対象外（' + night.reason + '）', 'allNight');
      } else {
        const parts = [];
        if (an.availability) parts.push(TRI_LABELS[an.availability] || an.availability);
        if (isTri(an.availability) && an.frequency) parts.push(labelOf(o.allNightFrequencies, an.frequency));
        if (isTri(an.availability) && an.note) parts.push(an.note);
        add('オールナイト', parts.join(' / '), 'allNight');
      }
    }
    if (f.lateNight) {
      const ln = a.lateNight || {};
      const parts = [];
      if (ln.availability) parts.push(TRI_LABELS[ln.availability] || ln.availability);
      if (ln.returnMethod) parts.push(labelOf(o.returnMethods, ln.returnMethod));
      if (ln.returnMethod === 'train' && ln.lastTrain) parts.push('終電 ' + ln.lastTrain);
      if (f.taxi && ln.returnMethod === 'taxi' && ln.taxiFare) parts.push('料金目安 ' + Number(ln.taxiFare).toLocaleString('ja-JP') + '円');
      let txt = parts.join(' / ');
      if (txt && lastTrainCheck(a, profile).conflict) txt += '（終電に間に合わない可能性）';
      add('深夜帯（' + (p.lateNightStartHour || 22) + '時以降）', txt, 'lateNight');
    }
    if (f.foreignNational) {
      const fo = a.foreign || {};
      if (fo.isForeign === 'yes') {
        const parts = [];
        if (fo.residenceStatus) parts.push('在留資格: ' + fo.residenceStatus);
        if (fo.workPermit) parts.push('資格外活動許可: ' + labelOf(o.workPermitStates, fo.workPermit));
        if (fo.residenceExpiry) parts.push('在留期限: ' + fo.residenceExpiry);
        if (fo.japaneseLevel) parts.push('日本語: ' + fo.japaneseLevel);
        // 詳細が 1 つでもあれば外国籍の詳細、「該当」だけなら外国籍（該当の有無）
        add('外国籍', parts.join(' / ') || '該当', parts.length ? 'foreignDetail' : 'foreignFlag');
      } else if (fo.isForeign === 'no') {
        add('外国籍', '該当なし', 'foreignFlag');
      }
    }
    if (f.department) add('希望部署', a.department, 'extras');
    if (f.applicationRoute) add('応募経路', a.applicationRoute, 'extras');
    add('申し送りコメント', a.reviewerNotes, 'notes');
    return rows;
  }

  global.RecruitRules = {
    DAYS: DAYS,
    SEVERITY: SEVERITY,
    LAW: LAW,
    LOCKED_RULES: LOCKED_RULES,
    CATEGORY_LABELS: CATEGORY_LABELS,
    CATEGORY_ORDER: CATEGORY_ORDER,
    TRI_LABELS: TRI_LABELS,
    UNIT_LABEL: UNIT_LABEL,
    RESULT_RANK: RESULT_RANK,
    CONDITIONS: CONDITIONS,
    num: num,
    round1: round1,
    isTri: isTri,
    fmtAbs: fmtAbs,
    periodicOverlap: periodicOverlap,
    toMinutes: toMinutes,
    duration: duration,
    fmtDuration: fmtDuration,
    fmtEnd: fmtEnd,
    categoryGroup: categoryGroup,
    isStudentGroup: isStudentGroup,
    labelOf: labelOf,
    busyItems: busyItems,
    bandOf: bandOf,
    analyzeShifts: analyzeShifts,
    highschoolStatus: highschoolStatus,
    nightStatus: nightStatus,
    lastTrainCheck: lastTrainCheck,
    weeklyDaysCheck: weeklyDaysCheck,
    ageCategoryCheck: ageCategoryCheck,
    shiftConditionMissing: shiftConditionMissing,
    computeContribution: computeContribution,
    buildContext: buildContext,
    buildHandoff: buildHandoff,
    shiftBadges: shiftBadges,
    evaluateHiring: evaluateHiring,
    describeApplicant: describeApplicant,
    describeShifts: describeShifts,
    // 入力の段階（SPEC-stages）
    INPUT_STAGES: INPUT_STAGES,
    INPUT_STAGE_LABELS: INPUT_STAGE_LABELS,
    INPUT_SECTIONS: INPUT_SECTIONS,
    DEFERRABLE_RULES: DEFERRABLE_RULES,
    AGGREGATE_RULES: AGGREGATE_RULES,
    stageOf: stageOf,
    sectionLabel: sectionLabel,
    sectionAsk: sectionAsk,
    sectionActive: sectionActive,
    sectionRelevant: sectionRelevant,
    continueSection: continueSection,
    sectionHasInput: sectionHasInput,
    interviewConfirm: interviewConfirm
  };
})(window);
