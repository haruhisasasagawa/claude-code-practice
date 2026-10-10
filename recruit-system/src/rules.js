/*
 * 判定エンジン（DOM非依存・純関数）
 * ----------------------------------------------------------------------
 * - analyzeShifts    : 希望シフトの解析（オープン/クローズ/深夜/週時間など）
 * - buildHandoff     : 面接者への申し送り（留意点）と強みを生成
 * - evaluateHiring   : 面接評価スコアから採用可否を判定
 * - describeApplicant: 応募情報を表示用のラベル／値ペアに整形
 *
 * 劇場固有の数値・文言はすべて profile（config.default.js）から受け取る。
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
    block: { key: 'block', label: '要判断', order: 0, desc: '採用担当が面接実施の可否を判断する項目' },
    warn:  { key: 'warn',  label: '要確認', order: 1, desc: '面接時に応募者へ確認する項目' },
    info:  { key: 'info',  label: '共有',   order: 2, desc: '面接者へ共有しておく事項' }
  };

  const CATEGORY_LABELS = {
    general: '全般',
    highschool: '高校生',
    vocational: '専門学校生',
    foreign: '外国籍',
    lateNight: '深夜帯'
  };

  const TRI_LABELS = { ok: '○ 可能', consult: '△ 要相談', ng: '× 不可' };

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

  function categoryGroup(profile, value) {
    const c = (profile.options.categories || []).find(function (x) { return x.value === value; });
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

  // ---------- シフト解析 ----------
  function analyzeShifts(applicant, profile) {
    const p = profile.params || {};
    const shifts = applicant.shifts || {};
    const days = applicant.workDays || [];
    const useAny = !!applicant.anyDay;
    const entries = [];

    function push(key, label, weekday, s) {
      if (!s || !s.start || !s.end) return;
      const min = duration(s.start, s.end, s.nextDay);
      if (min == null) return;
      const startMin = toMinutes(s.start);
      entries.push({
        key: key, label: label, weekday: weekday,
        start: s.start, end: s.end, nextDay: !!s.nextDay || (toMinutes(s.end) < startMin),
        minutes: min, startAbs: startMin, endAbs: startMin + min
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
      weekdayDaytime: false, weekdayMorningToAfternoon: false,
      weekendBoth: false,
      latestEndAbs: null,
      weeklyMinutes: 0,
      missingTimes: false
    };

    const minShift = Number(p.minShiftMinutes) || 180;
    const openFrom = Number(p.openStartFrom), openTo = Number(p.openStartTo);
    const closeEnd = (Number(p.closeEndHour) || 22) * 60;
    const lateStart = (Number(p.lateNightStartHour) || 22) * 60;
    const daytimeBefore = (Number(p.daytimeStartBefore) || 15) * 60;

    entries.forEach(function (e) {
      if (e.minutes < minShift) res.hasShort = true; else res.hasLong = true;
      const sh = Math.floor(e.startAbs / 60);
      if (!isNaN(openFrom) && !isNaN(openTo) && sh >= openFrom && sh <= openTo) res.isOpen = true;
      if (e.endAbs >= closeEnd) res.isClose = true;
      if (e.endAbs > lateStart) res.isLateNight = true;
      const weekday = useAny ? true : e.weekday;
      if (weekday && e.startAbs >= 7 * 60 && e.startAbs < daytimeBefore) {
        res.weekdayDaytime = true;
        if (e.endAbs >= daytimeBefore) res.weekdayMorningToAfternoon = true;
      }
      if (res.latestEndAbs == null || e.endAbs > res.latestEndAbs) res.latestEndAbs = e.endAbs;
    });

    res.weekendBoth = useAny || (days.indexOf('sat') >= 0 && days.indexOf('sun') >= 0);

    // 週あたりの勤務時間（目安）
    const daysMax = Number(applicant.daysMax) || 0;
    const daysMin = Number(applicant.daysMin) || 0;
    if (useAny) {
      const e = entries[0];
      const n = daysMax || daysMin || 0;
      res.weeklyMinutes = e ? e.minutes * n : 0;
    } else {
      let list = entries.slice().sort(function (a, b) { return b.minutes - a.minutes; });
      if (daysMax && list.length > daysMax) list = list.slice(0, daysMax);
      res.weeklyMinutes = list.reduce(function (a, e) { return a + e.minutes; }, 0);
    }

    const selectedCount = useAny ? 1 : days.length;
    res.missingTimes = selectedCount > 0 && entries.length < selectedCount;
    return res;
  }

  // ---------- 留意点ルールの条件 ----------
  // 各関数は false（該当なし）/ true / 追加変数オブジェクト を返す
  const CONDITIONS = {
    age_limit: function (c) { return !!c.p.maxAge && c.age > 0 && c.age >= Number(c.p.maxAge); },
    short_period: function (c) { return c.a.workPeriod === 'short'; },
    graduation_midterm: function (c) {
      if (!c.a.graduationDate || c.a.workPeriod !== 'mid') return false;
      const ny = new Date().getFullYear() + 1;
      return c.a.graduationDate === ny + '-03';
    },
    weekly_days_one: function (c) { return c.daysMax === 1; },
    weekly_days_low: function (c) { return c.daysMax >= 2 && c.daysMax <= (Number(c.p.lowMaxDays) || 2); },
    weekly_days_unknown: function (c) { return !c.daysMax && !c.daysMin; },
    shift_times_missing: function (c) { return c.shift.missingTimes || (!c.shift.hasAnyEntry && (c.a.workDays || []).length === 0 && !c.a.anyDay); },
    short_shift: function (c) { return c.shift.hasShort; },
    weekday_daytime: function (c) { return c.shift.weekdayMorningToAfternoon; },
    weekend_missing: function (c) { return ((c.a.workDays || []).length > 0 || c.a.anyDay) && !c.shift.weekendBoth; },
    commute_block: function (c) { return c.commute > 0 && c.commute >= (Number(c.p.commuteBlockMinutes) || 90); },
    commute_warn: function (c) {
      return c.commute > (Number(c.p.commuteWarnMinutes) || 60) && c.commute < (Number(c.p.commuteBlockMinutes) || 90);
    },
    commute_car: function (c) { return c.a.commuteMethod === 'マイカー'; },
    side_job_student: function (c) { return c.a.sideJob === 'yes' && c.isStudent; },
    side_job_nonstudent: function (c) { return c.a.sideJob === 'yes' && !c.isStudent; },
    freeter_insurance: function (c) { return c.group === 'freeter'; },
    vacation_ng: function (c) {
      if (!c.features.vacation) return false;
      const ng = c.vacationItems.filter(function (v) { return (c.a.vacation || {})[v.id] === 'ng'; });
      return ng.length ? { vacationLabels: ng.map(function (v) { return v.label; }).join('・') } : false;
    },
    vacation_consult: function (c) {
      if (!c.features.vacation) return false;
      const cs = c.vacationItems.filter(function (v) { return (c.a.vacation || {})[v.id] === 'consult'; });
      return cs.length ? { vacationLabels: cs.map(function (v) { return v.label; }).join('・') } : false;
    },

    highschool_permission: function (c) { return c.isHighschool; },
    highschool_hours: function (c) { return c.isHighschool; },
    highschool_time_violation: function (c) {
      if (!c.isHighschool || c.shift.latestEndAbs == null) return false;
      const limit = toMinutes(c.p.highschoolLatestEnd || '22:00');
      return limit != null && c.shift.latestEndAbs > limit;
    },
    vocational_permission: function (c) { return c.group === 'vocational'; },

    foreign_permit_missing: function (c) {
      return c.isForeign && ['no', 'unknown', ''].indexOf(c.a.foreign.workPermit || '') >= 0;
    },
    foreign_hour_cap: function (c) { return c.isForeign && c.a.foreign.workPermit !== 'na'; },
    foreign_hour_cap_exceeded: function (c) {
      if (!c.isForeign || c.a.foreign.workPermit === 'na') return false;
      const cap = (Number(c.p.foreignWeeklyHourCap) || 28) * 60;
      return c.shift.weeklyMinutes > cap ? { weeklyHours: Math.round(c.shift.weeklyMinutes / 6) / 10 } : false;
    },
    foreign_expiry: function (c) {
      if (!c.isForeign || c.a.foreign.workPermit === 'na') return false;
      const exp = c.a.foreign.residenceExpiry;
      if (!exp) return { residenceExpiry: '未入力' };
      const m = /^(\d{4})-(\d{2})/.exec(exp);
      if (!m) return { residenceExpiry: exp };
      const months = Number(c.p.residenceExpiryWarnMonths) || 6;
      const limit = new Date();
      limit.setMonth(limit.getMonth() + months);
      const expDate = new Date(Number(m[1]), Number(m[2]), 0); // 月末
      return expDate <= limit ? { residenceExpiry: exp } : false;
    },
    foreign_japanese: function (c) {
      if (!c.isForeign) return false;
      const levels = c.profile.options.japaneseLevels || [];
      const lv = c.a.foreign.japaneseLevel;
      return lv && levels.length && lv === levels[levels.length - 1] ? { japaneseLevel: lv } : false;
    },

    late_night_ng: function (c) { return c.features.lateNight && c.a.lateNight.availability === 'ng'; },
    late_night_consult: function (c) { return c.features.lateNight && c.a.lateNight.availability === 'consult'; },
    late_night_shift_conflict: function (c) {
      return c.features.lateNight && c.a.lateNight.availability === 'ng' && c.shift.isLateNight;
    },
    late_night_last_train: function (c) {
      if (!c.features.lateNight) return false;
      const ln = c.a.lateNight;
      const wants = ln.availability === 'ok' || ln.availability === 'consult' || c.shift.isLateNight;
      return wants && ln.returnMethod === 'train' && !ln.lastTrain;
    },
    late_night_taxi_over: function (c) {
      if (!c.features.lateNight || !c.features.taxi) return false;
      return c.a.lateNight.returnMethod === 'taxi' && c.taxiFare > 0 && c.taxiFare > (Number(c.p.taxiLimitYen) || 0);
    },
    late_night_taxi_unknown: function (c) {
      if (!c.features.lateNight || !c.features.taxi) return false;
      return c.a.lateNight.returnMethod === 'taxi' && !(c.taxiFare > 0);
    },
    late_night_taxi_ok: function (c) {
      if (!c.features.lateNight || !c.features.taxi) return false;
      return c.a.lateNight.returnMethod === 'taxi' && c.taxiFare > 0 && c.taxiFare <= (Number(c.p.taxiLimitYen) || 0);
    }
  };

  function buildContext(applicant, profile) {
    const a = applicant;
    const p = profile.params || {};
    const group = categoryGroup(profile, a.category);
    const shift = analyzeShifts(a, profile);
    const features = profile.features || {};
    return {
      a: a, p: p, profile: profile, features: features, shift: shift,
      group: group,
      isStudent: isStudentGroup(group),
      isHighschool: group === 'highschool',
      isForeign: !!features.foreignNational && (a.foreign || {}).isForeign === 'yes',
      age: Number(a.age) || 0,
      commute: Number(a.commuteMinutes) || 0,
      daysMin: Number(a.daysMin) || 0,
      daysMax: Number(a.daysMax) || 0,
      taxiFare: Number((a.lateNight || {}).taxiFare) || 0,
      vacationItems: profile.options.vacationItems || []
    };
  }

  function templateVars(c, extra) {
    const p = c.p;
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
      japaneseLevel: (c.a.foreign || {}).japaneseLevel
    };
    return Object.assign(base, extra || {});
  }

  // ---------- 申し送り（留意点）生成 ----------
  function buildHandoff(applicant, profile) {
    const c = buildContext(applicant, profile);
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
      items.push({
        id: rule.id,
        severity: sev,
        category: rule.category || 'general',
        categoryLabel: CATEGORY_LABELS[rule.category] || rule.category || '全般',
        text: U.fill(rule.text, templateVars(c, extra))
      });
    });

    items.sort(function (x, y) { return SEVERITY[x.severity].order - SEVERITY[y.severity].order; });

    // 強み（面接者への共有用）
    const st = (profile.texts && profile.texts.strengths) || {};
    const strengths = [];
    const v = templateVars(c);
    const sh = c.shift;
    if (sh.isOpen && st.open) strengths.push({ key: 'open', text: U.fill(st.open, v) });
    if (sh.isClose && st.close) strengths.push({ key: 'close', text: U.fill(st.close, v) });
    if (sh.weekendBoth && st.weekend) strengths.push({ key: 'weekend', text: U.fill(st.weekend, v) });
    if (c.a.workPeriod === 'long' && st.longTerm) strengths.push({ key: 'longTerm', text: U.fill(st.longTerm, v) });
    if (c.daysMin >= 3 && st.days3) strengths.push({ key: 'days3', text: U.fill(st.days3, v) });
    if (sh.hasLong && !sh.hasShort && st.longShift) strengths.push({ key: 'longShift', text: U.fill(st.longShift, v) });
    if (c.commute > 0 && c.commute <= 30 && st.commuteNear) strengths.push({ key: 'commuteNear', text: U.fill(st.commuteNear, v) });
    if (c.features.vacation && c.vacationItems.length &&
        c.vacationItems.every(function (it) { return (c.a.vacation || {})[it.id] === 'ok'; }) && st.vacationOk) {
      strengths.push({ key: 'vacationOk', text: U.fill(st.vacationOk, v) });
    }
    if (c.features.lateNight && c.a.lateNight.availability === 'ok' && st.lateNightOk) {
      strengths.push({ key: 'lateNightOk', text: U.fill(st.lateNightOk, v) });
    }

    const counts = { block: 0, warn: 0, info: 0 };
    items.forEach(function (i) { counts[i.severity]++; });

    return {
      items: items,
      strengths: strengths,
      counts: counts,
      shift: sh,
      badges: shiftBadges(c),
      generatedAt: new Date().toISOString()
    };
  }

  // 右パネル等で使う短いバッジ
  function shiftBadges(c) {
    const b = [];
    const sh = c.shift;
    if (sh.isOpen) b.push({ key: 'open', label: 'オープン', tone: 'ok' });
    if (sh.isClose) b.push({ key: 'close', label: 'クローズ', tone: 'ok' });
    if (sh.isLateNight) b.push({ key: 'late', label: '深夜帯', tone: 'info' });
    if (sh.weekendBoth) b.push({ key: 'weekend', label: '土日可', tone: 'ok' });
    else if ((c.a.workDays || []).length) b.push({ key: 'weekend-ng', label: '土日要確認', tone: 'warn' });
    if (c.a.workPeriod === 'long') b.push({ key: 'long', label: '長期', tone: 'ok' });
    if (c.a.workPeriod === 'short') b.push({ key: 'short', label: '短期', tone: 'danger' });
    if (c.daysMin >= 3) b.push({ key: 'days', label: '週' + c.daysMin + '日〜', tone: 'ok' });
    if (sh.hasShort) b.push({ key: 'shortshift', label: '短時間日あり', tone: 'warn' });
    if (c.isForeign) b.push({ key: 'foreign', label: '外国籍', tone: 'info' });
    if (c.isHighschool) b.push({ key: 'hs', label: '高校生', tone: 'info' });
    return b;
  }

  // ---------- 採用可否判定 ----------
  function evaluateHiring(applicant, scores, profile, handoff, checks) {
    const ev = profile.evaluation || {};
    const items = ev.items || [];
    const scale = Number(ev.scaleMax) || 5;
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
    const recPct = Number(th.recommendPct) || 70;
    const revPct = Number(th.reviewPct) || 40;

    let result = pct >= recPct ? 'recommend' : pct >= revPct ? 'review' : 'reject';
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
    if (unresolved.length) {
      warnings.push('未確認の留意点が' + unresolved.length + '件あります（うち要判断 ' + unresolvedBlock.length + '件）。');
    }

    let adjusted = false;
    if (ev.holdOnUnresolvedBlock && result === 'recommend' && unresolvedBlock.length) {
      result = 'review';
      adjusted = true;
      warnings.push('「要判断」の留意点が未確認のため、採用推奨ではなく上長最終判断要として扱います。');
    }

    const strengths = breakdown.filter(function (b) { return b.score != null && b.score >= 4 && !b.isOverall; }).map(function (b) { return b.label; });
    const concerns = breakdown.filter(function (b) { return b.score != null && b.score <= 2 && !b.isOverall; }).map(function (b) { return b.label; });

    const t = (profile.texts || {})[result] || { title: result, body: '' };
    const name = applicant.name ? applicant.name + 'さん' : '応募者';

    return {
      result: result,
      title: t.title,
      body: U.fill(t.body, { name: name, total: total, max: max, pct: pct }),
      disclaimer: (profile.texts || {}).disclaimer || '',
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
      adjusted: adjusted,
      evaluatedAt: new Date().toISOString()
    };
  }

  // ---------- 表示用整形 ----------
  function describeShifts(applicant, profile) {
    const sh = analyzeShifts(applicant, profile);
    return sh.entries.map(function (e) {
      return e.label + ' ' + e.start + '〜' + fmtEnd(e.end, e.nextDay) + '（' + fmtDuration(e.minutes) + '）';
    });
  }

  function describeApplicant(a, profile) {
    const o = profile.options || {};
    const f = profile.features || {};
    const rows = [];
    const add = function (label, value) { if (value !== undefined && value !== null && value !== '') rows.push({ label: label, value: value }); };

    add('氏名', a.name);
    add('性別', a.gender);
    add('年齢', a.age ? a.age + '歳' : '');
    add('区分', a.category);
    if (f.graduationDate) add('卒業予定', a.graduationDate);
    add('通勤方法', a.commuteMethod);
    add('通勤時間', a.commuteMinutes ? a.commuteMinutes + '分' : '');
    add('最寄り駅', a.nearestStation);

    const dayLabels = a.anyDay ? '曜日問わず' : DAYS.filter(function (d) { return (a.workDays || []).indexOf(d.key) >= 0; }).map(function (d) { return d.label; }).join('・');
    add('勤務可能曜日', dayLabels);
    const dmin = a.daysMin, dmax = a.daysMax;
    add('週勤務日数', dmin || dmax ? (dmin || '?') + '〜' + (dmax || '?') + '日' : '');
    add('希望シフト', describeShifts(a, profile).join(' / '));
    add('勤務期間', labelOf(o.workPeriods, a.workPeriod));
    add('かけもち', a.sideJob === 'yes' ? 'あり' + (a.sideJobDetail ? '（' + a.sideJobDetail + '）' : '') : a.sideJob === 'no' ? 'なし' : '');

    if (f.vacation) {
      const v = (o.vacationItems || []).map(function (it) {
        const val = (a.vacation || {})[it.id];
        return val ? it.label + ':' + (TRI_LABELS[val] || val).charAt(0) : null;
      }).filter(Boolean).join('　');
      add('長期休暇', v);
    }
    if (f.lateNight) {
      const ln = a.lateNight || {};
      const parts = [];
      if (ln.availability) parts.push(TRI_LABELS[ln.availability] || ln.availability);
      if (ln.returnMethod) parts.push(labelOf(o.returnMethods, ln.returnMethod));
      if (ln.returnMethod === 'train' && ln.lastTrain) parts.push('終電 ' + ln.lastTrain);
      if (f.taxi && ln.returnMethod === 'taxi' && ln.taxiFare) parts.push('料金目安 ' + Number(ln.taxiFare).toLocaleString('ja-JP') + '円');
      add('深夜帯（' + (profile.params.lateNightStartHour || 22) + '時以降）', parts.join(' / '));
    }
    if (f.foreignNational) {
      const fo = a.foreign || {};
      if (fo.isForeign === 'yes') {
        const parts = [];
        if (fo.residenceStatus) parts.push('在留資格: ' + fo.residenceStatus);
        if (fo.workPermit) parts.push('資格外活動許可: ' + labelOf(o.workPermitStates, fo.workPermit));
        if (fo.residenceExpiry) parts.push('在留期限: ' + fo.residenceExpiry);
        if (fo.japaneseLevel) parts.push('日本語: ' + fo.japaneseLevel);
        add('外国籍', parts.join(' / ') || '該当');
      } else if (fo.isForeign === 'no') {
        add('外国籍', '該当なし');
      }
    }
    if (f.department) add('希望部署', a.department);
    if (f.applicationRoute) add('応募経路', a.applicationRoute);
    add('担当者所見', a.reviewerNotes);
    return rows;
  }

  global.RecruitRules = {
    DAYS: DAYS,
    SEVERITY: SEVERITY,
    CATEGORY_LABELS: CATEGORY_LABELS,
    TRI_LABELS: TRI_LABELS,
    CONDITIONS: CONDITIONS,
    toMinutes: toMinutes,
    duration: duration,
    fmtDuration: fmtDuration,
    fmtEnd: fmtEnd,
    categoryGroup: categoryGroup,
    isStudentGroup: isStudentGroup,
    labelOf: labelOf,
    analyzeShifts: analyzeShifts,
    buildHandoff: buildHandoff,
    evaluateHiring: evaluateHiring,
    describeApplicant: describeApplicant,
    describeShifts: describeShifts
  };
})(window);
