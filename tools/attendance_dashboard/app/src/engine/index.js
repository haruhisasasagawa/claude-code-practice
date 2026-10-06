/* 勤務実績ダッシュボード — engine public API (AE.api). Load order: csv.js, holidays.js, calc.js, roster.js, view.js, index.js.
 *
 *   AE.api.decode(uint8array) -> string
 *   AE.api.defaultSettings() -> Settings            (設定 defaults, spec 10 §7)
 *   AE.api.defaultHolidays() -> [{date, name}]      (祝日・繁忙日 defaults, spec 10 §6.2 / Appendix A)
 *   AE.api.detectMonth(csvText) -> {year, month} | null   (= the month of ingest_chk_month_first)
 *   AE.api.build(files, settings, holidays[, options]) -> WB    files[k-1] = {name, text} (or {name, bytes}) | null
 *   AE.api.selectionColumns(WB, sel)                → W / AA11 / AA12 hook (see calc.js), sel = DB計算!AC3
 *   AE.api.filter(WB, query) -> [staffRef]          → roster.js: dropdown candidates {n, name, key, master}; the array
 *                                                     also carries matchCount (名簿!CJ2), candidateCount (CJ3), fallback
 *   AE.api.view(WB, staff[, opts]) -> View          → view.js: everything ダッシュボード / DB計算 show for one staff.
 *                                                     staff = the B7 text (exact name, case-insensitive; the first in
 *                                                     name order wins for duplicates), null/'' = default (the first
 *                                                     staff in name order), a number / {key} / filter ref = that
 *                                                     従業員番号, {b7: value} = a literal B7 cell; opts.filter = D5 text
 *
 * WB (layer 1 fields; later layers add theirs, e.g. WB.roster):
 *   settings   the Settings object used (echo)
 *   holidays   the holiday list used (echo, as given)
 *   hol        {rows, dates, count, counta, extra, min, max,            prepared list (rows 17..416; rows[i] =
 *                                                                     {date, name, date_text 'yyyy/mm/dd'})
 *               msg_count, msg_format, msg_range, msg_coverage}       ingest_hol_msg_* (A12..A15)
 *   set        {order_warning, display}                               ingest_set_order_warning (設定!A9); display =
 *                                                                     Excel-formatted 設定 values ({rateGood: '95%', …})
 *   sheets     [6 sheet objects]; index 0 = CSV_1 / 計算1 (see calc.js for the fields)
 *   ingest_hol_dates, ingest_hol_list, ingest_hol_msg_*, ingest_set_order_warning   flat aliases of the above
 *
 * WB (layer 2, roster.js — see the header there):
 *   roster     the 名簿 object (stack, master[] keyed by 名簿 column letter and by spec name, named[], totals, dept[],
 *              month labels / paste status / period / warnings, filter, settings_counts, lists)
 *   roster_*   flat aliases (roster_total_staff, roster_month_label[6], roster_paste_status[6], roster_period_label, …,
 *              each total also as roster_total_*_text)
 *   lists_staff_*   スタッフ一覧: title, period_text, link, table_title, headers, hdr_work[6], hdr_absent[6],
 *                   rows[] {rank, name, id, dept, qual, work_days, …, month_work[6], month_absent[6]; every field also
 *                   as *_text = the Excel display}, order, print_last_row
 *   lists_sum_*     全体サマリー: title, period_text, tile_<id> (+_text, _label), tiles[], dept_rows[20], worst_title,
 *                   worst_rows[10]
 *   lists_howto_paste_rows[6] {sheet, month, rows, rows_text, status}, lists_howto_warning   使い方 B16:E22
 *   ingest_set_job_rowcount[20], ingest_set_dept_rowcount[20] (+ _text; also WB.set.job_rowcount …)   設定 C13:C32 / C38:C57
 *
 * View (layer 3, view.js — see the header there): dbcalc_* (DB計算), dashtop_* (ダッシュボード rows 1–47),
 *   dashbottom_* (rows 48–99), the selection-dependent calc W / AA11 / AA12 (selection_columns), chart data
 *   (dashtop_chart_*) and conditional-format states (… _color / _style / _alert / _red / _bar_pct).
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});
  const NSHEETS = 6;

  function defaultSettings() { return AE.calc.defaultSettings(); }
  function defaultHolidays() { return AE.holidays.defaultList(); }

  function detectMonth(csvText) {
    const sh = AE.calc.buildSheet(1, { name: '', text: csvText }, defaultSettings(), new Set());
    const mf = sh.checks.AA6;
    if (typeof mf !== 'number') return null;
    const p = AE.calc.xl.ymd(mf);
    return { year: p.y, month: p.m };
  }

  // options (optional): {limits: {maxrows, maxstaff, pasteRows}} — roster caps; default none (CONTRACT scope
  // decision 1). AE.roster.EXCEL_LIMITS reproduces the workbook's 6,000 rows / 400 staff / row 200,000.
  function build(files, settings, holidays, options) {
    settings = settings || defaultSettings();
    holidays = holidays || defaultHolidays();
    const hol = AE.holidays.prepare(holidays);
    const sheets = [];
    for (let k = 1; k <= NSHEETS; k++) {
      let f = files ? files[k - 1] : null;
      if (f && f.text == null && f.bytes != null) f = { name: f.name, text: AE.csv.decode(f.bytes) };
      sheets.push(AE.calc.buildSheet(k, f || null, settings, hol.dates));
    }
    Object.assign(hol, AE.holidays.checks(hol, sheets.map((s) => s.checks.AA6)));
    const set = AE.calc.settingsChecks(settings);
    set.display = AE.calc.settingsDisplay(settings);            // e.g. {rateGood: '95%', nightEnd: '29:00', …}
    for (const r of hol.rows) r.date_text = typeof r.date === 'number' ? AE.calc.formatValue(r.date, 'yyyy/mm/dd') : String(r.date);
    const WB = {
      settings,
      holidays,
      hol,
      set,
      sheets,
      // flat spec-identifier aliases (same values as hol.* / set.*)
      ingest_hol_dates: hol.dates,
      ingest_hol_list: hol.rows,
      ingest_hol_msg_count: hol.msg_count,
      ingest_hol_msg_format: hol.msg_format,
      ingest_hol_msg_range: hol.msg_range,
      ingest_hol_msg_coverage: hol.msg_coverage,
      ingest_set_order_warning: set.order_warning,
    };
    // ---- later layers attach here: roster aggregates + whole-theatre surfaces (roster.js)
    if (AE.roster && typeof AE.roster.attach === 'function') AE.roster.attach(WB, options);
    else if (AE.roster && typeof AE.roster.build === 'function') WB.roster = AE.roster.build(WB, options);
    return WB;
  }

  function need(mod, fn) {
    if (!AE[mod] || typeof AE[mod][fn] !== 'function') throw new Error(`AE.${mod}.${fn} is not loaded`);
    return AE[mod][fn];
  }

  AE.api = Object.assign(AE.api || {}, {
    decode: (bytes) => AE.csv.decode(bytes),
    defaultSettings,
    defaultHolidays,
    detectMonth,
    build,
    selectionColumns: (WB, sel) => AE.calc.selectionColumns(WB, sel),
    filter: (WB, query) => need('roster', 'filter')(WB, query),
    view: (WB, staff, opts) => need('view', 'view')(WB, staff, opts),
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
