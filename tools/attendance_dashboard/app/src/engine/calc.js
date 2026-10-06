/* 勤務実績ダッシュボード — engine: per-month calc sheets 計算1..6 and 設定 (spec 10 §0, §1, §3–§5, §7).
 *
 *   AE.calc.buildSheet(k, file, settings, holDates)  → one 計算k sheet (see "sheet object" below)
 *   AE.calc.selectionColumns(WB, sel)                → HOOK for the view layer: W / AA11 / AA12 for a selected staff
 *   AE.calc.raw(sheet, i, name)                      → pasted CSV_k value of data row i in the column mapped for `name`
 *   AE.calc.defaultSettings(), AE.calc.settingsChecks(settings), AE.calc.settingsDisplay(settings), AE.calc.SETTINGS_TEXT
 *   AE.calc.formatValue(v, fmt)                      Excel display text for '0%', '0.0%', '0', '[h]:mm', 'yyyy/mm/dd'
 *   AE.calc.xl                                       Excel coercion / comparison helpers shared with later layers
 *
 * Sheet object (WB.sheets[k-1]):
 *   k, name ('計算k'), csvName ('CSV_k'), fileName, recordCount (CSV records incl. header; 0 = nothing pasted)
 *   header[j]   CSV_k row 1 (0-based column j; null = blank cell)
 *   data[i][j]  pasted CSV_k value of sheet row i+2 (null = blank)
 *   colmap      {name → 1-based CSV column (0 = not found)}  = ingest_colmap
 *   map         {AB..AU → same numbers}                      = 計算k!AB2:AU2
 *   colmap_ok   ingest_colmap_ok (計算k!AA2)
 *   rows[i]     per-row columns of sheet row i+2, keyed by Excel column letter:
 *               A..V, X, Y, AV..BL  ('' = blank formula result; XLError for an Excel error)
 *               W is NOT here: it depends on the dashboard selection → selectionColumns().
 *   checks      {AA2, AA6, AA7, AA8, AA9}  (AA11/AA12 → selectionColumns())
 *   chk_month_first, chk_other_month_rows, chk_bad_date_rows, chk_text_staff_rows  (aliases of AA6..AA9)
 *   staffCount  final value of column T (= T of every row below the data)
 *
 * Time arithmetic is done in integer minutes where the inputs are whole minutes (10:Q17).
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});
  const csv = AE.csv;

  // ================================================================== Excel value model
  class XLError {
    constructor(code) { this.code = code; }
    toString() { return this.code; }
  }
  const ERR = { VALUE: new XLError('#VALUE!'), REF: new XLError('#REF!'), NUM: new XLError('#NUM!'), NA: new XLError('#N/A') };
  const isErr = (v) => v instanceof XLError;
  // Reading a value inside a formula: an error propagates (thrown, caught at the cell boundary).
  function val(v) { if (v instanceof XLError) throw v; return v === undefined ? null : v; }
  function cell(fn) {
    try { return fn(); } catch (e) { if (e instanceof XLError) return e; throw e; }
  }
  function iferror(fn, alt) {
    let v;
    try { v = fn(); } catch (e) { if (!(e instanceof XLError)) throw e; v = e; }
    if (v instanceof XLError) return typeof alt === 'function' ? alt() : alt;
    return v;
  }
  // AND / OR: every argument is evaluated (JS evaluates call arguments eagerly); an error argument propagates.
  function AND() { let r = true; for (let i = 0; i < arguments.length; i++) r = r && !!val(arguments[i]); return r; }
  function OR() { let r = false; for (let i = 0; i < arguments.length; i++) r = r || !!val(arguments[i]); return r; }

  // Excel "=" comparison: blank = "" = 0 = FALSE; texts case-insensitive; number never equals text.
  function eq(a, b) {
    a = val(a); b = val(b);
    if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : (b === null ? '' : 0);
    if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'string') return a === b || a.toLowerCase() === b.toLowerCase();
    return a === b;
  }
  const ne = (a, b) => !eq(a, b);
  // Key for MATCH(...,0) / COUNTIF equality maps (scope decision 3: no wildcard semantics).
  const keyOf = (v) => (typeof v === 'string' ? v.toLowerCase() : v);
  const isKey = (v) => typeof v === 'number' || (typeof v === 'string' && v !== '');

  // ---------------------------------------------------------------- text → number (VALUE / DATEVALUE / *1)
  // Full-width ASCII (U+FF01..U+FF5E) and the ideographic space are read as their half-width forms.
  function toHalfWidth(s) {
    return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
  }
  const RE_V_NUM = /^([+-])?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?(%)?$/;
  const RE_V_TIME = /^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d*)?))?$/;
  const RE_V_DATE = /^(\d{4})([/-])(\d{1,2})\2(\d{1,2})(?:\s+(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d*)?))?)?$/;
  const RE_V_JDATE = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/;

  function dateSerial(y, m, d) {
    if (!(y >= 1900 && y <= 9999) || !csv._validYMD(y, m, d)) return null;
    return csv._serialOfDate(y, m, d);
  }
  function timeFrac(h, mi, se) {
    if (mi >= 60 || se >= 60) return null;
    return (h * 3600 + mi * 60 + se) / 86400;
  }
  // Text formats accepted by VALUE() (spec 10 §0.2; Excel accepts more, OQ1). Returns null when not a number.
  function parseNumberText(s0) {
    const s = toHalfWidth(String(s0)).trim();
    if (s === '') return null;
    let m = RE_V_NUM.exec(s);
    if (m) {
      let x = Number(m[2].replace(/,/g, '') + (m[3] !== undefined ? 'e' + m[3] : ''));
      if (!isFinite(x)) return null;
      if (m[1] === '-') x = -x;
      if (m[4]) x /= 100;
      return x;
    }
    m = RE_V_TIME.exec(s);
    if (m) return timeFrac(+m[1], +m[2], m[3] !== undefined ? +m[3] : 0);
    m = RE_V_DATE.exec(s);
    if (m) {
      const d = dateSerial(+m[1], +m[3], +m[4]);
      if (d === null) return null;
      if (m[5] === undefined) return d;
      const t = timeFrac(+m[5], +m[6], m[7] !== undefined ? +m[7] : 0);
      return t === null ? null : d + t;
    }
    m = RE_V_JDATE.exec(s);
    if (m) return dateSerial(+m[1], +m[2], +m[3]);
    return null;
  }
  // VALUE(v)
  function xlValue(v) {
    v = val(v);
    if (typeof v === 'number') return v;
    if (v === null) return 0;
    if (typeof v === 'boolean') throw ERR.VALUE;
    const n = parseNumberText(v);
    if (n === null) throw ERR.VALUE;
    return n;
  }
  // v*1
  function xlMul1(v) {
    v = val(v);
    if (typeof v === 'number') return v;
    if (v === null) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = parseNumberText(v);
    if (n === null) throw ERR.VALUE;
    return n;
  }
  // DATEVALUE(t): text only
  const RE_DV = /^(\d{4})([/-])(\d{1,2})\2(\d{1,2})(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2}(?:\.\d*)?)?)?$/;
  function xlDateValue(t) {
    t = val(t);
    if (typeof t !== 'string') throw ERR.VALUE;
    const s = toHalfWidth(t).trim();
    let m = RE_DV.exec(s), d = null;
    if (m) d = dateSerial(+m[1], +m[3], +m[4]);
    else if ((m = RE_V_JDATE.exec(s))) d = dateSerial(+m[1], +m[2], +m[3]);
    if (d === null) throw ERR.VALUE;
    return d;
  }
  // IFERROR(VALUE(v),0)
  const tconv = (v) => iferror(() => xlValue(v), 0);

  // Excel General-format text of a number (v&"").
  function generalText(n) {
    if (Object.is(n, -0) || n === 0) return '0';
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    const p = n.toPrecision(15);                       // 15 significant digits
    let [mant, exp] = p.split('e');
    let e = exp === undefined ? null : +exp;
    const strip = (x) => (x.indexOf('.') >= 0 ? x.replace(/0+$/, '').replace(/\.$/, '') : x);
    if (e === null) {
      const x = Number(p);
      if (Math.abs(x) >= 1e-9 || x === 0) return strip(p);
      e = Math.floor(Math.log10(Math.abs(x)));
      mant = (x / Math.pow(10, e)).toPrecision(15);
    } else if (e < 15 && e >= -9) {
      return strip(Number(p).toFixed(Math.max(0, 14 - e)));
    }
    return strip(mant) + 'E' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
  }
  // v&""
  function xlText(v) {
    v = val(v);
    if (v === null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return generalText(v);
  }
  // ROUND(x,0): half away from zero, on the 15-significant-digit value
  function xlRound(x) {
    x = val(x);
    const a = Math.abs(Number(x));
    const a15 = Number(a.toPrecision(15));
    const r = Math.floor(a15 + 0.5);
    return x < 0 ? -r : r;
  }
  // WEEKDAY(s, type)  type 1: Sun=1..Sat=7; type 2: Mon=1..Sun=7
  function weekday(s, type) {
    s = val(s);
    if (typeof s !== 'number') s = xlMul1(s);
    if (!(s >= 0 && s < 2958466)) throw ERR.NUM;
    const f = Math.floor(s);
    return type === 2 ? ((((f - 2) % 7) + 7) % 7) + 1 : ((((f - 1) % 7) + 7) % 7) + 1;
  }
  // y/m/d of a serial in Excel's 1900 calendar (serial 0 = 1900-01-00, 60 = 1900-02-29)
  function ymd(s) {
    s = Math.floor(val(s));
    if (!(s >= 0 && s <= 2958465)) throw ERR.NUM;
    if (s === 0) return { y: 1900, m: 1, d: 0 };
    if (s === 60) return { y: 1900, m: 2, d: 29 };
    return AE.holidays._civilFromDays((s < 60 ? s + 1 : s) - 25569);
  }
  // DATE(y, m, d) for the values this engine produces (month may overflow by one for EDATE)
  function xlDate(y, m, d) {
    y += Math.floor((m - 1) / 12);
    m = ((((m - 1) % 12) + 12) % 12) + 1;
    return csv._serialOfDate(y, m, d);
  }

  // Integer-minute arithmetic (10:Q17): a time value that is a whole number of minutes is used exactly.
  function toMin(x) {
    const m = x * 1440;
    const r = Math.round(m);
    return Math.abs(m - r) < 1e-6 ? r : m;
  }

  // ================================================================== constants
  const NEEDED = [
    ['AB', '募集シフトの日付'], ['AC', '応募ステータス'], ['AD', '募集シフトの開始時間'], ['AE', '募集シフトの終了時間'],
    ['AF', '変更後の開始時間'], ['AG', '変更後の終了時間'], ['AH', '募集シフトの職種'], ['AI', '応募者の名前'],
    ['AJ', '応募者の従業員番号'], ['AK', '応募者の職種'], ['AL', '応募者の資格'], ['AM', '休憩1開始時間'],
    ['AN', '休憩1終了時間'], ['AO', '休憩2開始時間'], ['AP', '休憩2終了時間'], ['AQ', '休憩3開始時間'],
    ['AR', '休憩3終了時間'], ['AS', '更新時間'], ['AT', '勤務種別'], ['AU', '相談応募の開始時間'],
  ];
  // Per-row columns (CALC_COLS order); W is computed by selectionColumns().
  const CALC_COLS = [
    ['A', '番号'], ['B', '日付'], ['C', '確定'], ['D', '種別'], ['E', '勤務行'], ['F', '更新日(JST)'],
    ['G', '欠勤行'], ['H', '出勤日(初回)'], ['I', '欠勤日(初回)'], ['J', '開始'], ['K', '終了'], ['L', '休憩'],
    ['M', '実働h'], ['N', '深夜h'], ['O', '曜日'], ['P', '休み区分'], ['Q', '却下'], ['R', '職種'],
    ['S', '初出'], ['T', '番号累積'], ['U', '休み日(初回)'], ['V', '更新時刻(JST)'], ['W', '選択者一覧連番'],
    ['X', '元開始'], ['Y', '元終了'], ['AV', '勤務キー'], ['AW', '休みキー'], ['AX', '当日休みキー'],
    ['AY', '遅出行'], ['AZ', '早退行'], ['BA', '時間変更キー'], ['BB', '時間変更日(初回)'],
    ['BC', '繁忙日'], ['BD', '追加応募行'], ['BE', '追加応募・確定'], ['BF', '所属'],
    ['BG', '朝h'], ['BH', '午前h'], ['BI', '午後h'], ['BJ', '夕h'], ['BK', '夜h'], ['BL', '人・日キー'],
  ];
  const ROW_COLS = CALC_COLS.map((c) => c[0]).filter((c) => c !== 'W');
  const TIME_BANDS = [['朝 〜10時', 5, 10], ['午前 10〜13時', 10, 13], ['午後 13〜17時', 13, 17],
    ['夕 17〜21時', 17, 21], ['夜 21時〜', 21, 29]];
  const BAND_COLS = ['BG', 'BH', 'BI', 'BJ', 'BK'];
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const REST_CATS = [['事前', '事前（2日以上前）'], ['前日', '前日'], ['当日', '当日（＝欠勤）'], ['事後', 'シフト日より後']];
  // Fixed strings of the calc sheet (Z/AA columns).
  const SHEET_TEXT = {
    AA1: '列チェック',
    AA4: '列AB〜AUは貼付シートの列名→列番号の対応表、Z6〜AA12は貼付チェック用のセルです。数式で使うので編集しないでください。',
    Z6: '対象月の初日（日付の中央値）',
    Z7: '対象月以外の日付の行数',
    Z8: '日付を読み取れない行数',
    Z9: '番号が数値でない行数',
    Z11: '選択スタッフの一覧件数（欠勤＋当日時間変更、このシート）',
    Z12: '一覧連番のオフセット',
  };
  const MAX_INDEX_COL = 52;          // INDEX('CSV_k'!$A$1:$AZ$last, ...) is 52 columns wide (10:Q3)

  const N = {
    date: '募集シフトの日付', status: '応募ステータス', postS: '募集シフトの開始時間', postE: '募集シフトの終了時間',
    chS: '変更後の開始時間', chE: '変更後の終了時間', sjob: '募集シフトの職種', name: '応募者の名前',
    emp: '応募者の従業員番号', ajob: '応募者の職種', qual: '応募者の資格', upd: '更新時間', kind: '勤務種別',
    extra: '相談応募の開始時間',
  };
  const BREAKS = [['休憩1開始時間', '休憩1終了時間'], ['休憩2開始時間', '休憩2終了時間'], ['休憩3開始時間', '休憩3終了時間']];

  // ================================================================== column mapping (§3)
  function columnMap(header) {
    const colmap = {}, map = {};
    for (const [col, name] of NEEDED) {
      const lname = name.toLowerCase();
      let c = 0;
      for (let j = 0; j < header.length && !c; j++) {
        const h = header[j];
        if (typeof h === 'string' && h.toLowerCase() === lname) c = j + 1;
      }
      for (let j = 0; j < header.length && !c; j++) {                    // MATCH("*"&name&"*", ...)
        const h = header[j];
        if (typeof h === 'string' && h.toLowerCase().indexOf(lname) >= 0) c = j + 1;
      }
      colmap[name] = c;
      map[col] = c;
    }
    const colmap_ok = NEEDED.every(([, name]) => colmap[name] > 0);
    return { colmap, map, colmap_ok };
  }

  function rawOf(dataRow, colmap, name) {
    const c = colmap[name];
    if (c > MAX_INDEX_COL) return ERR.REF;
    if (!(c >= 1)) return null;
    const v = dataRow ? dataRow[c - 1] : undefined;
    return v === undefined ? null : v;
  }
  function raw(sheet, i, name) { return rawOf(sheet.data[i], sheet.colmap, name); }

  // ================================================================== one 計算k sheet (§4, §5)
  function buildSheet(k, file, settings, holDates) {
    settings = settings || defaultSettings();
    holDates = holDates || new Set();
    const text = file && file.text != null ? file.text : null;
    const { records: recs, data } = csv.parsePasted(text);
    const hdr = recs.length ? recs[0] : null;
    const width = Math.max(csv.CSV_HEADERS.length, hdr ? hdr.length : 0);
    const header = new Array(width);
    for (let j = 0; j < width; j++) {
      if (hdr && j < hdr.length) header[j] = hdr[j] === '' ? null : hdr[j];
      else header[j] = j < csv.CSV_HEADERS.length ? csv.CSV_HEADERS[j] : null;
    }
    const { colmap, map, colmap_ok } = columnMap(header);

    // MIN/MAX ignore a blank or text 設定!B7/B8 (10:Q6)
    const nsM = typeof settings.nightStart === 'number' && isFinite(settings.nightStart) ? toMin(settings.nightStart) : null;
    const neM = typeof settings.nightEnd === 'number' && isFinite(settings.nightEnd) ? toMin(settings.nightEnd) : null;
    const minNe = (b) => (neM === null ? b : Math.min(b, neM));
    const maxNs = (a) => (nsM === null ? a : Math.max(a, nsM));

    const rows = new Array(data.length);
    // ---------------- pass 1
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const rw = (name) => rawOf(d, colmap, name);
      const t = (name) => tconv(rw(name));
      const o = {};
      const Ablank = () => eq(o.A, '');

      o.A = cell(() => {
        if (!colmap_ok) return '';
        const num = rw(N.emp);
        if (eq(num, '')) return '';
        if (typeof num === 'number') return num;
        return iferror(() => xlValue(num), num);
      });
      o.B = cell(() => {
        if (Ablank()) return '';
        const dd = rw(N.date);
        if (typeof dd === 'number') return dd;
        return iferror(() => xlDateValue(dd),
          () => iferror(() => xlDateValue(xlText(dd).split('/').join('-')), ''));
      });
      const searchIn = (name, needle) => {
        const s = rw(name);
        if (isErr(s)) return 0;
        return xlText(s).toLowerCase().indexOf(needle) >= 0 ? 1 : 0;
      };
      o.C = cell(() => (Ablank() ? '' : searchIn(N.status, '確定')));
      o.Q = cell(() => (Ablank() ? '' : searchIn(N.status, '却下')));
      o.D = cell(() => (Ablank() ? '' : iferror(() => xlMul1(rw(N.kind)), 0)));
      o.E = cell(() => (Ablank() ? '' : (AND(eq(o.C, 1), eq(o.D, 1), ne(o.B, '')) ? 1 : 0)));
      o.F = cell(() => (Ablank() ? '' : iferror(() => Math.floor(xlMul1(rw(N.upd)) * 1 / 86400000 + 25569 + 9 / 24), '')));
      o.V = cell(() => (Ablank() ? '' : iferror(() => xlMul1(rw(N.upd)) * 1 / 86400000 + 25569 + 9 / 24, '')));
      o.O = cell(() => (Ablank() ? '' : eq(o.B, '') ? '' : weekday(o.B, 1)));
      o.R = cell(() => (Ablank() ? '' : xlText(rw(N.sjob))));
      o.BF = cell(() => (Ablank() ? '' : xlText(rw(N.ajob))));
      o.G = cell(() => (Ablank() ? '' : (AND(eq(o.C, 1), eq(o.D, 4), ne(o.B, ''), eq(o.F, o.B)) ? 1 : 0)));
      o.BL = cell(() => {
        if (Ablank()) return '';
        const a = o.A, b = o.B;
        if (typeof a === 'number' && typeof b === 'number') return a * 100000 + b;
        return xlText(a) + '_' + xlText(b);
      });
      o.AV = cell(() => (eq(o.E, 1) ? val(o.BL) : ''));
      o.AW = cell(() => (AND(eq(o.C, 1), eq(o.D, 4)) ? val(o.BL) : ''));
      o.AX = cell(() => (eq(o.G, 1) ? val(o.BL) : ''));
      // work-row times (not A-guarded: E is '' on blank rows)
      o.J = cell(() => (ne(o.E, 1) ? '' : eq(rw(N.chS), '') ? t(N.postS) : t(N.chS)));
      o.K = cell(() => (ne(o.E, 1) ? '' : eq(rw(N.chE), '') ? t(N.postE) : t(N.chE)));
      o.L = cell(() => {
        if (ne(o.E, 1)) return '';
        let m = 0;
        for (const [s, e] of BREAKS) m += toMin(t(e)) - toMin(t(s));
        return m / 1440;
      });
      o.M = cell(() => (ne(o.E, 1) ? '' : (toMin(val(o.K)) - toMin(val(o.J)) - toMin(val(o.L))) / 60));
      o.N = cell(() => {
        if (ne(o.E, 1)) return '';
        const seg = (a, b) => Math.max(0, minNe(b) - maxNs(a));
        let m = seg(toMin(val(o.J)), toMin(val(o.K)));
        for (const [s, e] of BREAKS) m -= seg(toMin(t(s)), toMin(t(e)));
        return m / 60;
      });
      for (let b = 0; b < 5; b++) {
        const lo = TIME_BANDS[b][1] * 60, hi = TIME_BANDS[b][2] * 60;
        o[BAND_COLS[b]] = cell(() => (ne(o.E, 1) ? ''
          : Math.max(0, Math.min(toMin(val(o.K)), hi) - Math.max(toMin(val(o.J)), lo)) / 60));
      }
      // same-day time changes
      o.AY = cell(() => (Ablank() ? '' : (AND(eq(o.E, 1), ne(o.B, ''), eq(o.F, o.B), ne(rw(N.chS), ''),
        xlRound((t(N.chS) - t(N.postS)) * 1440) > 0) ? 1 : 0)));
      o.AZ = cell(() => (Ablank() ? '' : (AND(eq(o.E, 1), ne(o.B, ''), eq(o.F, o.B), ne(rw(N.chE), ''),
        xlRound((t(N.postE) - t(N.chE)) * 1440) > 0) ? 1 : 0)));
      o.BA = cell(() => (OR(eq(o.AY, 1), eq(o.AZ, 1)) ? val(o.BL) : ''));
      o.BD = cell(() => (Ablank() ? '' : eq(rw(N.extra), '') ? 0 : 1));
      o.BE = cell(() => (Ablank() ? '' : (AND(eq(o.BD, 1), eq(o.C, 1)) ? 1 : 0)));
      o.BC = cell(() => {
        if (Ablank()) return '';
        if (eq(o.B, '')) return 0;
        const b = val(o.B);
        return OR(weekday(b, 2) >= 6, holDates.has(b)) ? 1 : 0;
      });
      o.X = cell(() => {
        if (Ablank()) return '';
        if (AND(eq(o.C, 1), eq(o.D, 4))) {
          if (AND(xlRound(t(N.postS) * 1440) === 300, xlRound(t(N.postE) * 1440) === 1740)) return '';
          return t(N.postS);
        }
        if (OR(eq(o.AY, 1), eq(o.AZ, 1))) return t(N.postS);
        return '';
      });
      o.Y = cell(() => (Ablank() ? '' : eq(o.X, '') ? '' : t(N.postE)));
      o.P = cell(() => {
        if (Ablank()) return '';
        if (AND(eq(o.C, 1), eq(o.D, 4))) {
          if (OR(eq(o.F, ''), eq(o.B, ''))) return '不明';
          const F = val(o.F), B = val(o.B);
          if (F > B) return '事後';
          if (F === B) return '当日';
          if (F === B - 1) return '前日';
          return '事前';
        }
        if (eq(o.AY, 1)) return eq(o.AZ, 1) ? '当日遅出・早退' : '当日遅出';
        if (eq(o.AZ, 1)) return '当日早退';
        return '';
      });
      rows[i] = o;
    }

    // ---------------- pass 2: first-occurrence maps (key → smallest row index) — sheet-local (10:Q18)
    const firstMap = (col) => {
      const m = new Map();
      for (let i = 0; i < rows.length; i++) {
        const v = rows[i][col];
        if (isKey(v)) { const kk = keyOf(v); if (!m.has(kk)) m.set(kk, i); }
      }
      return m;
    };
    const mAV = firstMap('AV'), mAW = firstMap('AW'), mAX = firstMap('AX'), mBA = firstMap('BA'), mA = firstMap('A');
    const isFirst = (m, key, i) => {
      key = val(key);
      const r = m.get(keyOf(key));
      if (r === undefined) throw ERR.NA;
      return r === i ? 1 : 0;
    };

    // ---------------- pass 3
    let prevT = 0;                                  // T1 is blank → N(T1) = 0
    for (let i = 0; i < rows.length; i++) {
      const o = rows[i];
      const Ablank = () => eq(o.A, '');
      o.H = cell(() => (Ablank() ? '' : eq(o.E, 1) ? isFirst(mAV, o.AV, i) : 0));
      o.I = cell(() => {
        if (Ablank()) return '';
        if (!eq(o.G, 1)) return 0;
        const ax = o.AX;
        if (isKey(ax) && mAV.has(keyOf(ax))) return 0;   // ISNUMBER(MATCH(AX, AV range, 0))
        return isFirst(mAX, ax, i);
      });
      o.U = cell(() => (Ablank() ? '' : AND(eq(o.C, 1), eq(o.D, 4)) ? isFirst(mAW, o.AW, i) : 0));
      o.BB = cell(() => (Ablank() ? '' : OR(eq(o.AY, 1), eq(o.AZ, 1)) ? isFirst(mBA, o.BA, i) : 0));
      o.S = cell(() => (Ablank() ? '' : isFirst(mA, o.A, i)));
      o.T = cell(() => {
        const p = val(prevT);
        return (typeof p === 'number' ? p : 0) + (eq(o.S, 1) ? 1 : 0);
      });
      prevT = o.T;
    }

    // ---------------- per-sheet checks (§5)
    const AA6 = iferror(() => {
      const nums = [];
      for (const r of rows) { const b = val(r.B); if (typeof b === 'number') nums.push(b); }
      if (!nums.length) throw ERR.NUM;
      nums.sort((a, b) => a - b);
      const n = nums.length;
      const med = n % 2 ? nums[(n - 1) / 2] : (nums[n / 2 - 1] + nums[n / 2]) / 2;
      const p = ymd(med);
      return xlDate(p.y, p.m, 1);
    }, '');
    const AA7 = cell(() => {
      if (AA6 === '') return 0;
      const p = ymd(AA6);
      const next = xlDate(p.y, p.m + 1, 1);
      let c = 0;
      for (const r of rows) { const b = val(r.B); if (typeof b === 'number' && (b < AA6 || b >= next)) c++; }
      return c;
    });
    const AA8 = cell(() => {
      let c = 0;
      for (const r of rows) if (ne(r.A, '') && eq(r.B, '')) c++;
      return c;
    });
    const AA9 = cell(() => {
      let c = 0;
      for (const r of rows) if (ne(r.A, '') && typeof r.A === 'string') c++;
      return c;
    });
    const last = rows.length ? rows[rows.length - 1].T : 0;

    return {
      k, name: '計算' + k, csvName: 'CSV_' + k,
      fileName: file && file.name != null ? String(file.name) : '',
      recordCount: recs.length,
      header, data, colmap, map, colmap_ok,
      rows,
      checks: { AA2: colmap_ok, AA6, AA7, AA8, AA9 },
      chk_month_first: AA6, chk_other_month_rows: AA7, chk_bad_date_rows: AA8, chk_text_staff_rows: AA9,
      staffCount: last,
    };
  }

  // ================================================================== selection hook (W, AA11, AA12)
  // HOOK for the view layer. `sel` = DB計算!AC3 (the selected staff's 従業員番号, '' when none).
  // Returns one entry per sheet: {AA11 (ingest_chk_sel_list_count), AA12 (ingest_chk_sel_list_offset),
  // W: array parallel to sheet.rows (ingest_row_sel_list_seq; '' when not an item)}.
  function selectionColumns(WB, sel) {
    const blank = sel === '' || sel === null || sel === undefined;
    const out = [];
    let offset = 0;
    for (const sh of WB.sheets) {
      const items = [];                           // rows of sel with I=1 or BB=1 (never both on one row)
      let AA11 = 0;
      if (!blank) {
        for (let i = 0; i < sh.rows.length; i++) {
          const r = sh.rows[i];
          if (isErr(r.A) || !eq(r.A, sel)) continue;
          if (r.I === 1) AA11++;
          if (r.BB === 1) AA11++;
        }
      }
      const AA12 = offset;
      const W = new Array(sh.rows.length).fill('');
      for (let i = 0; i < sh.rows.length; i++) {
        const r = sh.rows[i];
        W[i] = cell(() => {
          if (eq(r.A, '')) return '';
          if (!AND(OR(eq(r.I, 1), eq(r.BB, 1)), blank ? false : eq(r.A, sel))) return '';
          items.push(i);
          return null;                            // filled below
        });
      }
      for (const i of items) {
        const b = sh.rows[i].B;
        let c = 0;
        for (const j of items) {
          const rj = sh.rows[j];
          if (typeof rj.B === 'number' && rj.B < b) c += (rj.I === 1 ? 1 : 0) + (rj.BB === 1 ? 1 : 0);
        }
        W[i] = c + 1 + AA12;
      }
      out.push({ k: sh.k, AA11, AA12, W });
      offset += AA11;
    }
    return out;
  }

  // ================================================================== 設定 (§7)
  const NJOB = 20, NDEPT = 20;
  const JOB_CATS = [['02コンセ', 'コンセ'], ['03フロア', 'フロア'], ['04ストア', 'ストア'], ['05オフィス', 'オフィス'],
    ['06トレーナー', 'トレーナー'], ['07トレーニー', 'トレーニー']];
  const DEPTS = [['02コンセ', 'コンセ'], ['03フロア', 'フロア'], ['04ストア', 'ストア'], ['05オフィス', 'オフィス']];

  function defaultSettings() {
    const slots = (src, n) => Array.from({ length: n }, (_, i) => (i < src.length
      ? { code: src[i][0], label: src[i][1] } : { code: '', label: '' }));
    return {
      theatre: 'TOHOシネマズ新宿',
      rateGood: 0.95,
      rateWarn: 0.90,
      minDays: 20,
      alertRate: 0.05,
      nightStart: 22 / 24,
      nightEnd: 29 / 24,
      jobs: slots(JOB_CATS, NJOB),
      jobOtherLabel: 'その他',
      depts: slots(DEPTS, NDEPT),
    };
  }

  // Labels, notes and validation messages of the 設定 sheet (verbatim).
  const SETTINGS_TEXT = {
    scalars: [
      { key: 'theatre', row: 1, label: '劇場名（ダッシュボードの見出しに表示）', note: '他の劇場で使う場合はここを変更', fmt: 'text' },
      { key: 'rateGood', row: 3, label: '出勤率 ◎良好 の基準（この値以上）', note: '総合判定に使用。既定 95%', fmt: '0%', validation: 'rate' },
      { key: 'rateWarn', row: 4, label: '出勤率 △注意 の基準（この値以上）', note: 'この値未満は「✕要改善」。既定 90%', fmt: '0%', validation: 'rate' },
      { key: 'minDays', row: 5, label: '判定を保留する確定シフト日数（この日数未満は「参考値」）', note: 'シフト日数が少ないと欠勤1日で出勤率が大きく動くため、判定は出さず出勤率のみ表示。既定 20日', fmt: '0', validation: 'days' },
      { key: 'alertRate', row: 6, label: '当欠率（当日欠勤率）のアラート基準（この値以上で警告）', note: '当日に休みへ変更した日数 ÷ 確定シフト日数 がこの値以上のスタッフに警告を出す。既定 5%', fmt: '0.0%', validation: 'rate' },
      { key: 'nightStart', row: 7, label: '深夜勤務の開始時刻', note: '深夜勤務時間の集計範囲（開始）', fmt: '[h]:mm' },
      { key: 'nightEnd', row: 8, label: '深夜勤務の終了時刻', note: '同（終了）。翌5時は 29:00 と入力', fmt: '[h]:mm' },
    ],
    validation: {
      rate: { title: '割合で入力してください', message: '0〜1 の値で入力してください（95% は 95% または 0.95）', min: 0, max: 1, whole: false },
      days: { title: '日数で入力してください', message: '0〜60 の整数で入力してください', min: 0, max: 60, whole: true },
    },
    orderWarning: '※ △注意の基準（B4）は ◎良好の基準（B3）より小さくしてください',
    jobTitle: '職種の区分（ダッシュボードの「職種別の勤務時間」に使用）',
    jobNote: `最大${NJOB}件。使わない行は空欄のままにしてください（空欄の行は集計しません）`,
    jobHeaders: ['CSVの職種名', '表示名', '貼付データでの行数（自動）'],
    jobOtherCode: '（上記以外）',
    deptTitle: '所属（CSVの「応募者の職種」）の一覧（スタッフ一覧の所属別集計に使用）',
    deptNote: `最大${NDEPT}件。使わない行は空欄のままにしてください`,
    deptHeaders: ['CSVの所属名', '表示名', '貼付データでの行数（自動）'],
    // number format of the C-column row counts (filled by the roster layer)
    rowCountZero: '※ 貼付データに無い値です（表記を確認）',
    rowCountSuffix: '行',
    layout: { jobRow0: 13, jobOtherRow: 33, deptRow0: 38, njob: NJOB, ndept: NDEPT },
  };

  // ingest_set_order_warning (設定!A9)
  function settingsChecks(settings) {
    const g = settings ? settings.rateGood : null, w = settings ? settings.rateWarn : null;
    const isNum = (x) => typeof x === 'number' && isFinite(x);
    return { order_warning: isNum(g) && isNum(w) && w >= g ? SETTINGS_TEXT.orderWarning : '' };
  }

  // ---------------------------------------------------------------- display formats used by 設定 / 祝日・繁忙日
  // Number formats of the 設定 B cells and the 祝日・繁忙日 date column, rendered as Excel displays them
  // (half away from zero on the 15-significant-digit value). A blank or text value displays as itself.
  function roundTo(x, dec) {
    const f = Math.pow(10, dec);
    const a = Number((Math.abs(x) * f).toPrecision(15));
    const r = Math.floor(a + 0.5) / f;
    return x < 0 && r !== 0 ? -r : r;
  }
  function formatValue(v, fmt) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    switch (fmt) {
      case '0%': return roundTo(v * 100, 0).toFixed(0) + '%';
      case '0.0%': return roundTo(v * 100, 1).toFixed(1) + '%';
      case '0': return roundTo(v, 0).toFixed(0);
      case '[h]:mm': {
        const m = roundTo(Math.abs(v) * 1440, 0);
        return (v < 0 ? '-' : '') + Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
      }
      case 'yyyy/mm/dd': {
        const p = ymd(Math.floor(roundTo(v * 86400, 0) / 86400));
        return `${p.y}/${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`;
      }
      default: return generalText(v);
    }
  }
  // {key → displayed text} for the scalar settings (設定!B1, B3..B8)
  function settingsDisplay(settings) {
    const out = {};
    for (const s of SETTINGS_TEXT.scalars) {
      const v = settings ? settings[s.key] : '';
      out[s.key] = s.fmt === 'text' ? (v == null ? '' : String(v)) : iferror(() => formatValue(v, s.fmt), '#VALUE!');
    }
    return out;
  }

  AE.calc = {
    NEEDED, CALC_COLS, ROW_COLS, TIME_BANDS, BAND_COLS, WEEKDAYS, REST_CATS, SHEET_TEXT, MAX_INDEX_COL,
    JOB_CATS, DEPTS, NJOB, NDEPT, SETTINGS_TEXT,
    columnMap, buildSheet, selectionColumns, raw,
    defaultSettings, settingsChecks, settingsDisplay, formatValue,
    xl: {
      XLError, ERR, isErr, val, cell, iferror, AND, OR, eq, ne, keyOf, isKey,
      value: xlValue, mul1: xlMul1, dateValue: xlDateValue, tconv, text: xlText, generalText, round: xlRound,
      weekday, ymd, date: xlDate, toMin, parseNumberText,
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
