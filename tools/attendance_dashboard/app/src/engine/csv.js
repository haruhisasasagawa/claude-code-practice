/* 勤務実績ダッシュボード — engine: CSV ingest (spec 10 §2).
 *
 *   AE.csv.decode(bytes)      UTF-8 (BOM stripped) / valid UTF-8 / Shift_JIS fallback
 *   AE.csv.parse(text)        Python csv.reader (dialect "excel", strict=False) emulation → array of records
 *   AE.csv.pasteValue(s)      paste_value(): Excel's automatic conversion on paste (date / time / number / text)
 *   AE.csv.parsePasted(text)  {records, data}: parse + pasteValue of every data field (memoised, read-only result)
 *   AE.csv.CSV_HEADERS        ingest_const_csv_headers (CSV_k row 1 template, 34 names)
 *   AE.csv.A1_COMMENT         CSV_k!A1 comment text
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});

  const CSV_HEADERS = [
    '募集シフトの日付', '募集店舗', '応募ステータス', '募集シフトの開始時間', '募集シフトの終了時間',
    '相談応募の開始時間', '相談応募の終了時間', 'アサインの開始時間', 'アサインの終了時間',
    '変更後の開始時間', '変更後の終了時間', '募集シフトの職種', '募集シフトの資格', '応募者の名前',
    '応募者の従業員番号', '応募者の所属店舗', '応募者の電話番号', '応募者の職種', '応募者の資格', '時給',
    '休憩1開始時間', '休憩1終了時間', '休憩2開始時間', '休憩2終了時間', '休憩3開始時間', '休憩3終了時間',
    '連携ID', '勤務店舗コード', '所属店舗コード', '更新時間', 'スケジュールID', 'パターン名', 'パターンコード', '勤務種別',
  ];

  const A1_COMMENT = '★ 貼り直すときは Ctrl+A → Delete で古い行を消してから。\n' +
    'シェアフルシフトのCSVをExcelで開き、ヘッダー行ごと全体をコピーして、このシートのA1セルに貼り付けてください。';

  // ------------------------------------------------------------------ decode
  // Python reads the file with encoding="utf-8-sig" (one leading BOM stripped). The HTML app additionally
  // accepts Shift_JIS (CP932) when the bytes are not valid UTF-8.
  function decode(bytes) {
    if (bytes == null) return '';
    if (typeof bytes === 'string') return bytes;
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes.subarray(3));
    }
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (e) {
      return new TextDecoder('shift_jis').decode(bytes);
    }
  }

  // ------------------------------------------------------------------ parse (Python csv.reader emulation)
  // Emulates CPython's Modules/_csv.c parser with the excel dialect (delimiter ',', quotechar '"', doublequote,
  // no escapechar, skipinitialspace=False, strict=False) fed by a newline='' file iterator:
  //   * a physical line ends with \r\n, \r or \n; an empty line gives the record [] (kept);
  //   * newlines inside a quoted field are kept verbatim; a final newline adds no record;
  //   * after a closing quote, any character other than , \r \n is kept and the field continues unquoted;
  //   * a quote inside an unquoted field is literal; an unterminated quote runs to the end of the input.
  function parse(text) {
    if (text == null) return [];
    text = String(text);
    const out = [];
    const n = text.length;
    const eolEnd = (i) => (text.charCodeAt(i) === 13 && text.charCodeAt(i + 1) === 10 ? i + 2 : i + 1);
    // next index >= i holding ',', '\r' or '\n' (n if none)
    const scan = (i) => {
      for (; i < n; i++) { const c = text.charCodeAt(i); if (c === 44 || c === 13 || c === 10) return i; }
      return n;
    };
    let i = 0;
    while (i < n) {
      const fields = [];
      let c = text.charCodeAt(i);
      if (c === 13 || c === 10) { out.push(fields); i = eolEnd(i); continue; }     // empty line
      for (;;) {                                   // START_FIELD at i
        if (i >= n) { fields.push(''); break; }   // end of input right after a delimiter
        c = text.charCodeAt(i);
        let buf = '';
        if (c === 34) {                            // quoted field
          i++;
          let closed = false;
          for (;;) {
            const qx = text.indexOf('"', i);
            if (qx < 0) { buf += text.slice(i); i = n; break; }            // unterminated: to the end
            buf += text.slice(i, qx); i = qx + 1;
            if (i < n && text.charCodeAt(i) === 34) { buf += '"'; i++; continue; }   // "" → "
            closed = true;
            break;
          }
          if (!closed || i >= n) { fields.push(buf); break; }
          c = text.charCodeAt(i);
          if (c === 44) { fields.push(buf); i++; continue; }
          if (c === 13 || c === 10) { fields.push(buf); i = eolEnd(i); break; }
          // strict=False: keep the character, continue as an unquoted field
        } else if (c === 44) { fields.push(''); i++; continue; }
        else if (c === 13 || c === 10) { fields.push(''); i = eolEnd(i); break; }
        const j = scan(i);                         // unquoted part (quotes are literal here)
        buf += text.slice(i, j); i = j;
        fields.push(buf);
        if (i >= n) break;
        c = text.charCodeAt(i);
        if (c === 44) { i++; continue; }
        i = eolEnd(i); break;                      // \r or \n ends the record
      }
      out.push(fields);
    }
    return out;
  }

  // ------------------------------------------------------------------ paste_value
  // Python regexes: \d matches any Unicode decimal digit (Nd); "$" also matches before one trailing "\n".
  const RE_DATE = /^(\p{Nd}{4})\/(\p{Nd}{1,2})\/(\p{Nd}{1,2})\n?$/u;
  const RE_TIME = /^(\p{Nd}{1,2}):(\p{Nd}{2})\n?$/u;
  const RE_NUM = /^-?\p{Nd}+(\.\p{Nd}+)?\n?$/u;
  const RE_ND = /\p{Nd}/u;
  const RE_ND_START = /^-?\p{Nd}/u;
  const RE_ASCII = /^[\x00-\x7F]*$/;
  // ASCII fast paths (same results as the Unicode patterns for ASCII strings)
  const RE_DATE_A = /^([0-9]{4})\/([0-9]{1,2})\/([0-9]{1,2})\n?$/;
  const RE_TIME_A = /^([0-9]{1,2}):([0-9]{2})\n?$/;
  const RE_NUM_A = /^-?[0-9]+(\.[0-9]+)?\n?$/;

  // Value of a Unicode decimal digit: Nd characters come in contiguous runs of ten (0..9).
  function digitValue(ch) {
    const cp = ch.codePointAt(0);
    if (cp >= 48 && cp <= 57) return cp - 48;
    let k = 0;
    while (k < 60 && RE_ND.test(String.fromCodePoint(cp - k - 1))) k++;
    return k % 10;
  }
  function asciiDigits(s) {
    let out = '';
    for (const ch of s) out += RE_ND.test(ch) ? String(digitValue(ch)) : ch;
    return out;
  }

  // Days since 1970-01-01 for a proleptic Gregorian date (no Date object: works for any year).
  function daysFromCivil(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }
  function validYMD(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    const dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return d <= dim;
  }
  // openpyxl to_excel(): days since 1899-12-30, minus one for 1900-01-01..1900-02-28 (Excel's 1900 leap bug).
  function serialOfDate(y, m, d) {
    let days = daysFromCivil(y, m, d) + 25569;
    if (days > 0 && days <= 60) days -= 1;
    return days;
  }

  function pasteValue(s) {
    if (s == null || s === '') return null;
    const c0 = s.charCodeAt(0);
    if (c0 < 128) {
      if (c0 !== 45 && (c0 < 48 || c0 > 57)) return s;          // must start with a digit or '-'
      if (RE_ASCII.test(s)) {
        let m = RE_DATE_A.exec(s);
        if (m) {
          const y = +m[1], mo = +m[2], d = +m[3];
          return y >= 1 && validYMD(y, mo, d) ? serialOfDate(y, mo, d) : s;
        }
        m = RE_TIME_A.exec(s);
        if (m) return (+m[1] * 60 + +m[2]) / 1440;
        if (RE_NUM_A.test(s)) { const v = Number(s.replace(/\n$/, '')); return Object.is(v, -0) ? 0 : v; }
        return s;
      }
    } else if (!RE_ND_START.test(s)) return s;
    let m = RE_DATE.exec(s);
    if (m) {
      const y = +asciiDigits(m[1]), mo = +asciiDigits(m[2]), d = +asciiDigits(m[3]);
      // Python dt.date() raises for an impossible date (generator crash); Excel keeps the text.
      if (y >= 1 && validYMD(y, mo, d)) return serialOfDate(y, mo, d);
      return s;
    }
    m = RE_TIME.exec(s);
    if (m) return (+asciiDigits(m[1]) * 60 + +asciiDigits(m[2])) / 1440;
    if (RE_NUM.test(s)) {
      const t = asciiDigits(s).replace(/\n$/, '');
      const v = Number(t);
      return Object.is(v, -0) ? 0 : v;
    }
    return s;
  }

  // parse + paste, memoised by the CSV text (the UI rebuilds the workbook on every settings change).
  // The returned arrays are shared between builds: treat them as read-only.
  const PASTE_CACHE = new Map(), PASTE_CACHE_MAX = 12;
  function parsePasted(text) {
    if (text == null) return { records: [], data: [] };
    text = String(text);
    let e = PASTE_CACHE.get(text);
    if (e) { PASTE_CACHE.delete(text); PASTE_CACHE.set(text, e); return e; }
    const records = parse(text);
    const data = new Array(Math.max(0, records.length - 1));
    for (let i = 1; i < records.length; i++) data[i - 1] = records[i].map(pasteValue);
    e = { records, data };
    PASTE_CACHE.set(text, e);
    while (PASTE_CACHE.size > PASTE_CACHE_MAX) PASTE_CACHE.delete(PASTE_CACHE.keys().next().value);
    return e;
  }

  AE.csv = {
    CSV_HEADERS, A1_COMMENT,
    decode, parse, pasteValue, parsePasted,
    _daysFromCivil: daysFromCivil, _validYMD: validYMD, _serialOfDate: serialOfDate, _asciiDigits: asciiDigits,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
