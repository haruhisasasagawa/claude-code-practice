#!/usr/bin/env node
'use strict';
/* Parity test: engine (src/engine/*.js) vs golden values of LibreOffice-recalculated Excel workbooks.
 *
 *   node test/parity.js --case ns_s6 [--case gold_asa ...] [--private]
 *   node test/parity.js --all [--private]          every public case (+ ns_aug with --private)
 *   node test/parity.js --case edge  (or --extra)   synthetic edge-case workbooks (test/fixtures/edge; --extra also
 *                                                  runs vb1..vb6 = test/fixtures/view_edge, the dashboard edge cases)
 *   options: --sheet NAME (repeatable)  --section ID-REGEX  --max N (mismatches shown per section, default 20)
 *            --list (print the mapping sections and exit)
 *
 * Exit code 0 only when no section has a mismatch outside test/mapping.js EXCEPTIONS.
 *
 * Data locations (nothing here is committed real data): defaults point at the session scratchpad; override with
 * test/parity.local.json (git-ignored) {"scratch", "goldenDir", "privateGoldenDir", "sampleDir", "privateCsv"}
 * or the environment variables AE_SCRATCH, AE_GOLDEN_DIR, AE_PRIVATE_GOLDEN_DIR, AE_SAMPLE_DIR, AE_PRIVATE_CSV.
 * The private case (real staff data) needs privateCsv; it is only run with --private.
 */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..');
const ENGINE_FILES = ['csv.js', 'holidays.js', 'calc.js', 'roster.js', 'view.js', 'index.js'];
for (const f of ENGINE_FILES) {
  const p = path.join(APP, 'src', 'engine', f);
  if (fs.existsSync(p)) require(p);
}
const AE = globalThis.AE;
const mapping = require('./mapping.js');

// ---------------------------------------------------------------- configuration
function loadConfig() {
  let local = {};
  const lp = path.join(__dirname, 'parity.local.json');
  if (fs.existsSync(lp)) local = JSON.parse(fs.readFileSync(lp, 'utf8'));
  const env = process.env;
  const scratch = env.AE_SCRATCH || local.scratch ||
    '/tmp/claude-0/-home-user-claude-code-practice/80f78731-7e64-5797-98bb-bc409f51a97b/scratchpad';
  return {
    goldenDir: env.AE_GOLDEN_DIR || local.goldenDir || path.join(scratch, 'htmlapp', 'golden'),
    privateGoldenDir: env.AE_PRIVATE_GOLDEN_DIR || local.privateGoldenDir || path.join(scratch, 'htmlapp', 'golden_private'),
    sampleDir: env.AE_SAMPLE_DIR || local.sampleDir || path.join(scratch, 'sample6'),
    privateCsv: env.AE_PRIVATE_CSV || local.privateCsv || '',
  };
}
const CFG = loadConfig();

// Golden cases (CONTRACT.md): default settings, CSVs in slot order 1..6.
const CALC_SHEETS = ['計算1', '計算2', '計算3', '計算4', '計算5', '計算6'];
const CASES = {
  ns_s6: { golden: () => path.join(CFG.goldenDir, 'ns_s6.json'), csvs: 'sample6' },
  gold_asa: { golden: () => path.join(CFG.goldenDir, 'gold_asa.json'), csvs: 'sample6' },
  gold_mit: { golden: () => path.join(CFG.goldenDir, 'gold_mit.json'), csvs: 'sample6' },
  // OLDER generator: numbers only, DB計算 / 名簿 / 計算k (except column BL); no text sheets
  ns_job: { golden: () => path.join(CFG.goldenDir, 'ns_job.json'), csvs: 'sample6', older: true, numbersOnly: true,
    sheets: ['DB計算', '名簿', ...CALC_SHEETS] },
  // real data (local only): the August CSV in slot 1, slots 2..6 empty
  ns_aug: { golden: () => path.join(CFG.privateGoldenDir, 'ns_aug.json'), csvs: 'private', private: true },
  // synthetic edge cases (test/fixtures/edge, committed; generator built with --maxrows 80). Not part of --all:
  // run with --case edge or --extra.
  edge: { golden: () => path.join(__dirname, 'fixtures', 'edge', 'edge_golden.json'), csvs: 'edge', maxrows: 80, extra: true },
};
// spec-50 dashboard edge workbooks (test/fixtures/view_edge, synthetic data; generator run with --maxrows 60, then
// LibreOffice recalculation; t4–t6 have extra 祝日・繁忙日 rows, so the holiday list is read from the golden).
// They reach the branches the main cases never do: > 12 list items, > 24 missed busy days, > 6 連休, no 連休, blank
// busy-day names, a 0:00 shift start, an unregistered job code, months without data, a name not in 名簿.
// Not part of --all: run with --case vb1 … vb6 or --extra.
[['vb1', 't1', ['june.csv']], ['vb2', 't2', ['june.csv', 'july.csv']], ['vb3', 't3', ['june.csv', 'july.csv']],
  ['vb4', 't4', ['june2.csv', 'july.csv']], ['vb5', 't5', ['june2.csv', 'july.csv']], ['vb6', 't6', ['june2.csv', 'july.csv']]]
  .forEach(([id, t, files]) => {
    CASES[id] = { golden: () => path.join(__dirname, 'fixtures', 'view_edge', t + '_golden.json'), csvs: 'vb:' + files.join(','),
      maxrows: 60, extra: true, holidays: 'golden' };
  });
const PUBLIC_CASES = ['ns_s6', 'gold_asa', 'gold_mit', 'ns_job'];

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const a = { cases: [], all: false, priv: false, extra: false, sheets: [], section: null, max: 20, list: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--case') a.cases.push(argv[++i]);
    else if (x === '--all') a.all = true;
    else if (x === '--private') a.priv = true;
    else if (x === '--extra') a.extra = true;
    else if (x === '--sheet') a.sheets.push(argv[++i]);
    else if (x === '--section') a.section = new RegExp(argv[++i]);
    else if (x === '--max') a.max = +argv[++i];
    else if (x === '--list') a.list = true;
    else if (x === '-h' || x === '--help') { a.help = true; }
    else { console.error('unknown argument: ' + x); process.exit(2); }
  }
  return a;
}

// ---------------------------------------------------------------- inputs
const fileCache = new Map();
function csvFiles(kind) {
  if (fileCache.has(kind)) return fileCache.get(kind);
  let files;
  if (kind === 'sample6') {
    files = fs.readdirSync(CFG.sampleDir).filter((n) => /\.csv$/i.test(n)).sort()
      .map((n) => ({ name: n, text: AE.api.decode(fs.readFileSync(path.join(CFG.sampleDir, n))) }));
  } else if (kind === 'private') {
    if (!CFG.privateCsv || !fs.existsSync(CFG.privateCsv)) throw new Error('private CSV not configured (privateCsv / AE_PRIVATE_CSV)');
    files = [{ name: path.basename(CFG.privateCsv), text: AE.api.decode(fs.readFileSync(CFG.privateCsv)) }, null, null, null, null, null];
  } else if (kind === 'edge') {
    const dir = path.join(__dirname, 'fixtures', 'edge');
    files = ['edge1.csv', 'edge2.csv', 'edge3.csv', null, 'edge5.csv', 'edge6.csv']
      .map((n) => (n ? { name: n, text: AE.api.decode(fs.readFileSync(path.join(dir, n))) } : null));
  } else if (kind.startsWith('vb:')) {
    const dir = path.join(__dirname, 'fixtures', 'view_edge');
    const names = kind.slice(3).split(',');
    files = [0, 1, 2, 3, 4, 5].map((i) => (names[i] ? { name: names[i], text: AE.api.decode(fs.readFileSync(path.join(dir, names[i]))) } : null));
  } else throw new Error('unknown csv set ' + kind);
  fileCache.set(kind, files);
  return files;
}
// The holiday list of a golden's 祝日・繁忙日 sheet (rows 17..416), for cases whose workbook had extra rows.
function goldenHolidays(golden) {
  const h = golden['祝日・繁忙日'] || {}, out = [];
  let last = 0;
  for (let r = 17; r <= 416; r++) if (!isBlank(h['A' + r]) || !isBlank(h['B' + r])) last = r;
  for (let r = 17; r <= last; r++) out.push({ date: isBlank(h['A' + r]) ? null : h['A' + r], name: isBlank(h['B' + r]) ? '' : h['B' + r] });
  return out;
}
const wbCache = new Map();
function workbook(kind, golden, cfg) {
  const fromGolden = cfg && cfg.holidays === 'golden';
  const key = kind + (fromGolden ? '|' + cfg.golden() : '');
  if (wbCache.has(key)) return wbCache.get(key);
  const t0 = Date.now();
  const hol = fromGolden ? goldenHolidays(golden) : AE.api.defaultHolidays();
  const WB = AE.api.build(csvFiles(kind), AE.api.defaultSettings(), hol);
  const r = { WB, ms: Date.now() - t0 };
  wbCache.set(key, r);
  return r;
}

// ---------------------------------------------------------------- comparison
const isBlank = (v) => v === undefined || v === null || v === '';
function norm(v) {
  if (v && typeof v === 'object' && typeof v.code === 'string') return v.code;    // XLError
  return v;
}
function same(e, a) {
  e = norm(e); a = norm(a);
  if (isBlank(e) && isBlank(a)) return true;
  if (typeof e === 'number' && typeof a === 'number') {
    return Math.abs(e - a) <= 1e-9 * Math.max(1, Math.abs(e), Math.abs(a));
  }
  return e === a;
}
function show(v) {
  v = norm(v);
  if (v === undefined) return '(missing)';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}
function excepted(caseName, sheet, addr) {
  for (const x of mapping.EXCEPTIONS) {
    if (x.sheet !== sheet) continue;
    if (x.case && !x.case.test(caseName)) continue;
    if (x.addr && !x.addr.test(addr)) continue;
    return x;
  }
  return null;
}
const addrOrder = (a, b) => {
  const pa = mapping.parseAddr(a), pb = mapping.parseAddr(b);
  return pa.row - pb.row || mapping.colIndex(pa.col) - mapping.colIndex(pb.col);
};

function runSection(sec, sheet, ctx, cfg) {
  const res = { compared: 0, mismatches: [], excepted: 0, info: [] };
  const consider = (e, a) => !cfg.numbersOnly || typeof norm(e) === 'number' || typeof norm(a) === 'number';
  const record = (addr, e, a, note) => {
    if (excepted(ctx.caseName, sheet, addr)) { res.excepted++; return; }
    res.mismatches.push({ addr, expected: e, actual: a, note });
  };
  if (typeof sec.compare === 'function') {
    const r = sec.compare(ctx) || {};
    res.compared = r.compared || 0;
    for (const m of r.mismatches || []) record(m.addr, m.expected, m.actual, m.note);
    res.info = r.info || [];
    return res;
  }
  const cells = sec.cells(ctx);
  const actual = cells instanceof Map ? cells : new Map(Object.entries(cells || {}));
  const seen = new Set();
  for (const addr of Object.keys(ctx.g)) {
    if (!sec.owns(addr, ctx)) continue;
    seen.add(addr);
    if (sec.skip && sec.skip(addr, ctx)) continue;
    const e = ctx.g[addr], a = actual.get(addr);
    if (!consider(e, a)) continue;
    res.compared++;
    if (!same(e, a)) record(addr, e, a);
  }
  for (const [addr, a] of actual) {
    if (seen.has(addr) || isBlank(norm(a))) continue;
    if (!sec.owns(addr, ctx)) { record(addr, undefined, a, 'engine cell outside the section domain'); continue; }
    if (sec.skip && sec.skip(addr, ctx)) continue;
    if (!consider(undefined, a)) continue;
    res.compared++;
    record(addr, undefined, a);                 // golden blank, engine non-blank
  }
  res.mismatches.sort((x, y) => addrOrder(x.addr, y.addr));
  return res;
}

function runCase(caseName, args) {
  const cfg = CASES[caseName];
  const gp = cfg.golden();
  if (!fs.existsSync(gp)) throw new Error('golden not found: ' + gp);
  const golden = JSON.parse(fs.readFileSync(gp, 'utf8'));
  const { WB, ms } = workbook(cfg.csvs, golden, cfg);
  const dash = golden['ダッシュボード'] || {}, db = golden['DB計算'] || {};
  const memo = {};
  const ctx = {
    caseName, cfg, golden, WB, AE, memo,
    select: dash.B7 === undefined ? '' : dash.B7,
    sel: db.AC3 === undefined ? '' : db.AC3,
    view() {
      if (!('view' in memo)) memo.view = AE.api.view(WB, ctx.select);
      return memo.view;
    },
  };
  console.log(`\n== case ${caseName}  (golden ${path.basename(gp)}; ${WB.sheets.filter((s) => s.recordCount).length} CSV(s); build ${ms} ms)`);
  let fail = 0, compared = 0;
  const sheetNames = mapping.SHEET_ORDER.filter((s) => s in mapping.SHEETS);
  for (const sheet of sheetNames) {
    if (args.sheets.length && !args.sheets.includes(sheet)) continue;
    const g = golden[sheet] || {};
    const secs = mapping.SHEETS[sheet];
    if (cfg.sheets && !cfg.sheets.includes(sheet)) { console.log(`  ${sheet}: skipped (outside the case scope)`); continue; }
    if (!secs.length) { console.log(`  ${sheet}: no sections yet (${Object.keys(g).length} golden cells)`); continue; }
    const sctx = Object.assign({}, ctx, { g, sheet });
    const owned = new Set();
    for (const sec of secs) {
      if (args.section && !args.section.test(sec.id)) continue;
      if (sec.cases && !sec.cases(cfg, caseName)) { console.log(`  ${sheet} [${sec.id}]: skipped for this case`); continue; }
      let res;
      try {
        res = runSection(sec, sheet, sctx, cfg);
      } catch (e) {
        fail++;
        console.log(`  ${sheet} [${sec.id}]: ERROR ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
        continue;
      }
      if (sec.owns) for (const a of Object.keys(g)) if (sec.owns(a, sctx)) owned.add(a);
      compared += res.compared;
      fail += res.mismatches.length;
      const st = res.mismatches.length ? 'FAIL' : 'ok';
      console.log(`  ${sheet} [${sec.id}] ${st}: compared ${res.compared}, mismatches ${res.mismatches.length}` +
        (res.excepted ? `, excepted ${res.excepted}` : ''));
      for (const m of res.mismatches.slice(0, args.max)) {
        console.log(`      ${sheet}!${m.addr}: expected ${show(m.expected)}  got ${show(m.actual)}${m.note ? '  (' + m.note + ')' : ''}`);
      }
      if (res.mismatches.length > args.max) console.log(`      … ${res.mismatches.length - args.max} more`);
      for (const line of res.info) console.log(`      info: ${line}`);
    }
    if (!args.section) {
      const unmapped = Object.keys(g).filter((a) => !owned.has(a));
      if (unmapped.length) {
        console.log(`  ${sheet}: ${unmapped.length} golden cell(s) not owned by any section (e.g. ${unmapped.sort(addrOrder).slice(0, 8).join(', ')})`);
      }
    }
  }
  console.log(`  -- ${caseName}: compared ${compared}, failing mismatches ${fail}`);
  return fail;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log((/\/\*[\s\S]*?\*\//.exec(fs.readFileSync(__filename, 'utf8')) || [''])[0]);
    return 0;
  }
  if (args.list) {
    for (const s of mapping.SHEET_ORDER) {
      const secs = mapping.SHEETS[s] || [];
      console.log(`${s}: ${secs.length ? secs.map((x) => `${x.id} (${x.owner || '?'})`).join(', ') : '(none)'}`);
    }
    return 0;
  }
  let cases = args.cases.slice();
  if (args.all) cases = PUBLIC_CASES.slice();
  if (args.priv && !cases.includes('ns_aug')) cases.push('ns_aug');
  if (args.extra) for (const c of Object.keys(CASES)) if (CASES[c].extra && !cases.includes(c)) cases.push(c);
  if (!cases.length) cases = ['ns_s6'];
  for (const c of cases) {
    if (!CASES[c]) { console.error('unknown case: ' + c + ' (known: ' + Object.keys(CASES).join(', ') + ')'); return 2; }
    if (CASES[c].private && !args.priv) { console.error(`case ${c} uses real staff data: add --private`); return 2; }
  }
  let total = 0;
  const summary = [];
  for (const c of cases) {
    let f;
    try { f = runCase(c, args); } catch (e) { console.log(`\n== case ${c}: ERROR ${e.message}`); f = 1; }
    total += f;
    summary.push(`${c}: ${f ? f + ' failing' : 'ok'}`);
  }
  console.log('\n' + summary.join('   '));
  console.log(total ? `PARITY FAILED (${total} failing mismatches)` : 'PARITY OK');
  return total ? 1 : 0;
}

process.exitCode = main();
