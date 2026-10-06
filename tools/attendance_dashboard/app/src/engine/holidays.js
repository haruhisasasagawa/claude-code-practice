/* 勤務実績ダッシュボード — engine: 祝日・繁忙日 (spec 10 §6).
 *
 *   AE.holidays.jpHolidays(y)        ingest_hol_jp_holidays(y): Map serial → name (振替休日・国民の休日を含む)
 *   AE.holidays.defaultList()        ingest_hol_default_list: [{date: serial, name}] (263 entries, 2025/1/1〜2033/1/4)
 *   AE.holidays.prepare(list)        → {rows, dates (Set of numeric dates in rows 17..416), count, counta, extra}
 *   AE.holidays.checks(prep, monthFirsts)  → {msg_count, msg_format, msg_range, msg_coverage} (A12..A15)
 *   AE.holidays.TEXT                 fixed sheet strings (title, tips, headings, headers)
 *
 * A list entry is {date, name}. date: an Excel serial (number) = a date cell; '' / null = an empty cell;
 * any other string = a cell holding text (not a date: counted by COUNTA, not by COUNT, never matches a shift date).
 * Entry i sits on sheet row 17+i. Rows 17..416 (i < 400) are the evaluated list; rows 417..2000 only feed the A14 warning.
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});

  const HOL_R0 = 17, HOL_ROWS = 400, HOL_LAST_CHECKED = 2000;
  const HOL_YEARS = [2025, 2033];          // national holidays generated for 2025..2032 (end excluded)

  const TEXT = {
    title: '祝日・繁忙日の一覧（この日付に出勤した日を「土日祝・繁忙日」として数えます）',   // A1
    howto: '使い方',                                                                           // A2
    tips: [                                                                                    // A3..A10
      '・土曜・日曜は自動で「繁忙日」として数えます。ここに登録するのは平日の祝日と、劇場として忙しい日だけです。',
      '・初期値として国民の祝日（振替休日・国民の休日を含む）と、ゴールデンウィーク・お盆・年末年始を入れてあります。',
      '・自劇場に合わせて、行の追加・削除ができます（日付の順番は問いません）。使わない行は空欄のままにしてください。',
      '・例：地域のイベント日、レイトショーの特別興行、大型作品の公開初週など、出勤してほしい日を足せます。',
      `・国民の祝日は ${HOL_YEARS[0]}年〜${HOL_YEARS[1] - 1}年分を入れてあります。${HOL_YEARS[1]}年以降を使うときは、その年の祝日を足してください。`,
      `・日付は${HOL_ROWS}件まで（${HOL_R0}行目〜${HOL_R0 + HOL_ROWS - 1}行目）。それより下に入力しても集計されません。`,
      '・名称はダッシュボードの「連休の入り方」「出勤していない繁忙日」にそのまま出ます（面談で本人も見ます）。GW・お盆・公開初週のような、短く分かりやすい名前にしてください。',
      '・ここを変えると、ダッシュボードの「土日祝出勤率」とスタッフ一覧の集計がすぐに変わります。',
    ],
    status: '登録状況（自動）',                                                                // A11
    headerDate: '日付',                                                                        // A16
    headerName: '名称（任意）',                                                                // B16
  };

  // ------------------------------------------------------------------ date helpers (serial ↔ y/m/d)
  const csv = AE.csv;
  const serial = (y, m, d) => csv._serialOfDate(y, m, d);
  // Proleptic Gregorian y/m/d of an epoch-day count (days since 1970-01-01).
  function civilFromDays(z) {
    z += 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const y = yoe + era * 400;
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp + (mp < 10 ? 3 : -9);
    return { y: y + (m <= 2 ? 1 : 0), m, d };
  }
  const ymdOfSerial = (s) => civilFromDays(s - 25569);           // valid for s >= 61 (no 1900 bug range)
  const weekdayMon0 = (s) => (((s - 25569) % 7) + 7 + 3) % 7;      // Python weekday(): Mon=0..Sun=6 (1970-01-01 = Thu)

  // ------------------------------------------------------------------ jp_holidays / busy_days
  function nthMonday(y, m, n) {
    const d = serial(y, m, 1);
    return d + ((7 - weekdayMon0(d)) % 7) + 7 * (n - 1);
  }
  function equinoxDay(y, c) {
    // Python: int(c + 0.242194*(y-1980) - int((y-1980)/4)), evaluated left to right; int() truncates
    return Math.trunc(c + 0.242194 * (y - 1980) - Math.trunc((y - 1980) / 4));
  }

  function jpHolidays(y) {
    const base = new Map([
      [serial(y, 1, 1), '元日'],
      [nthMonday(y, 1, 2), '成人の日'],
      [serial(y, 2, 11), '建国記念の日'],
      [serial(y, 2, 23), '天皇誕生日'],
      [serial(y, 3, equinoxDay(y, 20.8431)), '春分の日'],
      [serial(y, 4, 29), '昭和の日'],
      [serial(y, 5, 3), '憲法記念日'],
      [serial(y, 5, 4), 'みどりの日'],
      [serial(y, 5, 5), 'こどもの日'],
      [nthMonday(y, 7, 3), '海の日'],
      [serial(y, 8, 11), '山の日'],
      [nthMonday(y, 9, 3), '敬老の日'],
      [serial(y, 9, equinoxDay(y, 23.2488)), '秋分の日'],
      [nthMonday(y, 10, 2), 'スポーツの日'],
      [serial(y, 11, 3), '文化の日'],
      [serial(y, 11, 23), '勤労感謝の日'],
    ]);
    const h = new Map(base);
    const keys = [...base.keys()].sort((a, b) => a - b);
    for (const d of keys) {                          // 振替休日: a holiday on Sunday → next non-holiday day
      if (weekdayMon0(d) === 6) {
        let x = d + 1;
        while (h.has(x)) x += 1;
        h.set(x, '振替休日');
      }
    }
    for (const d of keys) {                          // 国民の休日: a non-Sunday day between two base holidays
      const mid = d + 1, nxt = d + 2;
      if (base.has(nxt) && !h.has(mid) && weekdayMon0(mid) !== 6) h.set(mid, '国民の休日');
    }
    return h;
  }

  function defaultList() {
    const out = [], seen = new Set();
    const add = (d, name) => { if (!seen.has(d)) { out.push({ date: d, name }); seen.add(d); } };
    for (let y = HOL_YEARS[0]; y < HOL_YEARS[1]; y++) {
      const h = jpHolidays(y);
      for (const d of [...h.keys()].sort((a, b) => a - b)) add(d, h.get(d));
    }
    const spans = [[[4, 29], [5, 6], 'GW'], [[8, 13], [8, 16], 'お盆'], [[12, 28], [12, 31], '年末年始']];
    for (let y = HOL_YEARS[0]; y < HOL_YEARS[1]; y++) {
      for (const [[m0, d0], [m1, d1], label] of spans) {
        for (let d = serial(y, m0, d0), e = serial(y, m1, d1); d <= e; d++) add(d, label);
      }
    }
    for (let y = HOL_YEARS[0]; y <= HOL_YEARS[1]; y++) {           // the January side of 年末年始 (end year included)
      for (let dd = 1; dd <= 4; dd++) add(serial(y, 1, dd), '年末年始');
    }
    out.sort((a, b) => a.date - b.date);
    if (out.length > HOL_ROWS) {
      throw new Error(`祝日・繁忙日が ${out.length} 件で上限 ${HOL_ROWS} 件を超えています。HOL_ROWS を増やしてください。`);
    }
    return out;
  }

  // ------------------------------------------------------------------ list preparation and checks
  const isBlank = (v) => v === null || v === undefined || v === '';

  function prepare(list) {
    list = Array.isArray(list) ? list : [];
    const rows = [];                // entries of rows 17..416, normalised {date, name}
    const dates = new Set();        // ingest_hol_dates: numeric values of A17:A416
    let count = 0, counta = 0, extra = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < list.length && i < HOL_LAST_CHECKED - HOL_R0 + 1; i++) {
      const e = list[i] || {};
      const date = isBlank(e.date) ? '' : e.date;
      const name = isBlank(e.name) ? '' : e.name;
      if (i < HOL_ROWS) {
        rows.push({ date, name });
        if (date !== '') counta++;
        if (typeof date === 'number' && isFinite(date)) {
          count++; dates.add(date);
          if (date < min) min = date;
          if (date > max) max = date;
        }
      } else if (date !== '') {
        extra++;                    // COUNTA(A417:A2000)
      }
    }
    return { rows, dates, count, counta, extra, min: count ? min : '', max: count ? max : '' };
  }

  // Excel YEAR() of a serial (1900 leap-bug calendar; error outside 0..2958465).
  function xlYear(s) {
    s = Math.floor(s);
    if (!(s >= 0 && s <= 2958465)) return null;
    if (s < 61) return 1900;
    return ymdOfSerial(s).y;
  }
  // TEXT(s, "yyyy/m/d")
  function textYMD(s) {
    const t = Math.floor(Math.round(s * 86400) / 86400);
    if (!(t >= 0 && t <= 2958465)) return '#VALUE!';
    let y, m, d;
    if (t === 0) { y = 1900; m = 1; d = 0; }
    else if (t === 60) { y = 1900; m = 2; d = 29; }
    else if (t < 60) { ({ y, m, d } = civilFromDays(t + 1 - 25569)); }
    else ({ y, m, d } = ymdOfSerial(t));
    return `${y}/${m}/${d}`;
  }

  // monthFirsts: the six ingest_chk_month_first values (serial or '').
  function checks(prep, monthFirsts) {
    const msg_count = '登録されている日付　' + prep.count + '件（土日はこの一覧に無くても繁忙日として数えます）';
    const bad = prep.counta - prep.count;
    const msg_format = bad > 0
      ? '※ 日付として読めない行が ' + bad + ' 行あります。yyyy/mm/dd の形式で入力し直してください。'
      : '日付の形式：OK';
    const msg_range = prep.extra > 0
      ? `※ ${HOL_R0 + HOL_ROWS - 1}行目より下に入力があります。この範囲は集計されません。上の空いている行に移してください。`
      : '入力範囲：OK';
    let msg_coverage;
    if (prep.count === 0) {
      msg_coverage = '※ 日付が1件も登録されていません。土日だけの集計になります。';
    } else {
      const ymin = xlYear(prep.min), ymax = xlYear(prep.max);
      let nbad = 0, err = ymin === null || ymax === null;
      for (const mf of monthFirsts || []) {
        if (mf === '' || mf === null || mf === undefined) continue;
        const y = xlYear(mf);
        if (y === null) { err = true; continue; }
        if (!err && (y < ymin || y > ymax)) nbad++;
      }
      if (err) msg_coverage = '#NUM!';
      else if (nbad > 0) msg_coverage = '※ 貼り付けた月の年の祝日が登録されていません。その年の祝日を追加してください（いまは土日だけで数えています）。';
      else msg_coverage = '貼付月との対応　' + textYMD(prep.min) + ' 〜 ' + textYMD(prep.max) + ' を登録済み：OK';
    }
    return { msg_count, msg_format, msg_range, msg_coverage };
  }

  AE.holidays = {
    HOL_R0, HOL_ROWS, HOL_LAST_CHECKED, HOL_YEARS, TEXT,
    jpHolidays, defaultList, prepare, checks,
    _civilFromDays: civilFromDays, _xlYear: xlYear, _textYMD: textYMD,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
