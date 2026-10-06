/* 勤務実績ダッシュボード — SVG chart components (no libraries).
 * AE.charts.ring / stacked / bars / radar build an <svg> from plain numbers and display strings.
 * Rules (data-viz): thin marks, 2px surface gaps between touching fills, recessive hairline grid,
 * text in ink colours only (series colour appears on marks and legend swatches), hover/focus tooltips
 * on every mark (keyboard focusable, aria-label), selective direct labels.
 * All strings are inserted with textContent; nothing here touches innerHTML.
 */
(function (root) {
  'use strict';
  const AE = root.AE || (root.AE = {});
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#1F2D3D';
  const INK2 = '#4A5568';
  const MUTED = '#7A8494';
  const GRID = '#DCE2EA';
  const BASE = '#C9D1DC';
  const TRACK = '#EEF1F5';
  const GAP = 2;          // surface gap between touching fills (px)
  const TIPS = new WeakMap();

  function s(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v !== undefined && v !== null && v !== false) e.setAttribute(k, String(v));
      }
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, str, attrs) {
    const e = s('text', Object.assign({ x: r2(x), y: r2(y) }, attrs || {}), parent);
    e.textContent = String(str);
    return e;
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  function svgRoot(w, h, label) {
    const svg = s('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'group', 'aria-label': label || '', preserveAspectRatio: 'xMidYMid meet' });
    return svg;
  }

  /* ---------- colour helpers ---------- */
  function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lum(hex) {
    const c = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  /** text colour for a label set inside a fill: white or ink, whichever contrasts more */
  function onFill(fill) { return contrast('#FFFFFF', fill) >= contrast(INK, fill) ? '#FFFFFF' : INK; }

  /* ---------- tooltip layer ---------- */
  function tipText(tip) {
    if (!tip) return '';
    const parts = [];
    if (tip.title) parts.push(tip.title);
    for (const r of tip.rows || []) parts.push((r.label ? r.label + ' ' : '') + (r.value == null ? '' : r.value));
    return parts.join('、');
  }
  /** make an element a focusable mark carrying a tooltip */
  function mark(el, tip) {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', tipText(tip));
    const cls = el.getAttribute('class');
    el.setAttribute('class', (cls ? cls + ' ' : '') + 'mk');
    TIPS.set(el, tip);
    return el;
  }
  let tipEl = null;
  let current = null;
  function tipNode() {
    if (!tipEl || !tipEl.isConnected) {
      tipEl = document.getElementById('tooltip');
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
      }
    }
    return tipEl;
  }
  function renderTip(tip) {
    const el = tipNode();
    el.textContent = '';
    if (tip.title) {
      const d = document.createElement('div');
      d.className = 'tt-title';
      d.textContent = tip.title;
      el.appendChild(d);
    }
    for (const r of tip.rows || []) {
      const row = document.createElement('div');
      row.className = 'tt-row';
      if (r.color) {
        const k = document.createElement('span');
        k.className = 'tt-key';
        k.style.background = r.color;
        row.appendChild(k);
      }
      const v = document.createElement('span');
      v.className = 'tt-val';
      v.textContent = r.value == null ? '' : String(r.value);
      row.appendChild(v);
      if (r.label) {
        const l = document.createElement('span');
        l.className = 'tt-lab';
        l.textContent = r.label;
        row.appendChild(l);
      }
      el.appendChild(row);
    }
    el.hidden = false;
  }
  function place(x, y) {
    const el = tipNode();
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x + 14, top = y + 14;
    if (left + w > vw - 6) left = Math.max(6, x - w - 14);
    if (top + h > vh - 6) top = Math.max(6, y - h - 14);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }
  function hide() { current = null; if (tipEl) tipEl.hidden = true; }
  function findMark(t) {
    let n = t;
    while (n && n !== document) {
      if (n.nodeType === 1 && TIPS.has(n)) return n;
      n = n.parentNode;
    }
    return null;
  }
  let installed = false;
  function installTooltips() {
    if (installed) return;
    installed = true;
    document.addEventListener('pointerover', e => {
      const m = findMark(e.target);
      if (!m) { if (current) hide(); return; }
      current = m;
      renderTip(TIPS.get(m));
      place(e.clientX, e.clientY);
    });
    document.addEventListener('pointermove', e => { if (current) place(e.clientX, e.clientY); });
    document.addEventListener('pointerout', e => {
      if (current && !(e.relatedTarget && current.contains(e.relatedTarget))) hide();
    });
    document.addEventListener('focusin', e => {
      const m = findMark(e.target);
      if (!m) return;
      current = m;
      renderTip(TIPS.get(m));
      const b = m.getBoundingClientRect();
      place(b.left + b.width / 2, b.top + Math.min(b.height / 2, 24));
    });
    document.addEventListener('focusout', () => hide());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
    window.addEventListener('scroll', () => hide(), true);
  }

  /* ---------- geometry helpers ---------- */
  function pt(cx, cy, rad, a) { return [cx + rad * Math.sin(a), cy - rad * Math.cos(a)]; }
  function sectorPath(cx, cy, r0, r1, a0, a1, i0, i1) {
    // outer arc a0..a1 at r1, inner arc i1..i0 at r0
    const [x0, y0] = pt(cx, cy, r1, a0);
    const [x1, y1] = pt(cx, cy, r1, a1);
    const [x2, y2] = pt(cx, cy, r0, i1);
    const [x3, y3] = pt(cx, cy, r0, i0);
    const lo = (a1 - a0) > Math.PI ? 1 : 0;
    const li = (i1 - i0) > Math.PI ? 1 : 0;
    return 'M' + r2(x0) + ',' + r2(y0) + 'A' + r2(r1) + ',' + r2(r1) + ' 0 ' + lo + ' 1 ' + r2(x1) + ',' + r2(y1) +
      'L' + r2(x2) + ',' + r2(y2) + 'A' + r2(r0) + ',' + r2(r0) + ' 0 ' + li + ' 0 ' + r2(x3) + ',' + r2(y3) + 'Z';
  }
  function circlePath(cx, cy, r, sweep) {
    return 'M' + r2(cx) + ',' + r2(cy - r) + 'A' + r2(r) + ',' + r2(r) + ' 0 1 ' + sweep + ' ' + r2(cx) + ',' + r2(cy + r) +
      'A' + r2(r) + ',' + r2(r) + ' 0 1 ' + sweep + ' ' + r2(cx) + ',' + r2(cy - r) + 'Z';
  }
  function annulusPath(cx, cy, r0, r1) {
    return circlePath(cx, cy, r1, 1) + (r0 > 0 ? circlePath(cx, cy, r0, 0) : '');
  }
  /** column rect with rounded top (data end) and square baseline */
  function colPath(x, y, w, h, rTop) {
    const r = Math.max(0, Math.min(rTop, h, w / 2));
    if (r <= 0.01) return 'M' + r2(x) + ',' + r2(y + h) + 'V' + r2(y) + 'H' + r2(x + w) + 'V' + r2(y + h) + 'Z';
    return 'M' + r2(x) + ',' + r2(y + h) + 'V' + r2(y + r) + 'Q' + r2(x) + ',' + r2(y) + ' ' + r2(x + r) + ',' + r2(y) +
      'H' + r2(x + w - r) + 'Q' + r2(x + w) + ',' + r2(y) + ' ' + r2(x + w) + ',' + r2(y + r) + 'V' + r2(y + h) + 'Z';
  }
  function niceMax(maxV, step) {
    if (!(maxV > 0)) return step;
    return Math.ceil((maxV * 1.05) / step) * step;
  }

  /* ---------- doughnut ---------- */
  /**
   * opts: { w, h, cy?, R, hole (inner/outer, default .7), slices:[{value, color, tip, label}],
   *         ariaLabel, minLabelShare (default .04) }
   * label = direct label text (ink), drawn just outside the ring for slices >= minLabelShare.
   */
  function ring(opts) {
    const w = opts.w, h = opts.h;
    const cx = w / 2, cy = opts.cy != null ? opts.cy : h / 2;
    const R = opts.R, r = R * (opts.hole != null ? opts.hole : 0.7);
    const svg = svgRoot(w, h, opts.ariaLabel);
    const slices = (opts.slices || []).map(x => Object.assign({}, x, { v: (typeof x.value === 'number' && x.value > 0) ? x.value : 0 }));
    const total = slices.reduce((a, x) => a + x.v, 0);
    s('path', { d: annulusPath(cx, cy, r, R), fill: TRACK, 'fill-rule': 'evenodd' }, svg);
    if (!(total > 0)) return svg;
    const positive = slices.filter(x => x.v > 0);
    let cum = 0;
    const minShare = opts.minLabelShare != null ? opts.minLabelShare : 0.04;
    const labels = s('g', null, null);
    for (const sl of slices) {
      if (!(sl.v > 0)) continue;
      const a0 = cum / total * 2 * Math.PI;
      cum += sl.v;
      const a1 = cum / total * 2 * Math.PI;
      const g = s('g', null, svg);
      if (positive.length === 1) {
        s('path', { class: 'vis', d: annulusPath(cx, cy, r, R), fill: sl.color, 'fill-rule': 'evenodd' }, g);
        s('path', { class: 'hit', d: annulusPath(cx, cy, Math.max(0, r - 6), R + 6), 'fill-rule': 'evenodd' }, g);
      } else {
        const pO = (GAP / 2) / R, pI = (GAP / 2) / r;
        let ao0 = a0 + pO, ao1 = a1 - pO, ai0 = a0 + pI, ai1 = a1 - pI;
        if (ai1 <= ai0) { ai0 = ai1 = (a0 + a1) / 2; }
        if (ao1 > ao0) s('path', { class: 'vis', d: sectorPath(cx, cy, r, R, ao0, ao1, ai0, ai1), fill: sl.color }, g);
        s('path', { class: 'hit', d: sectorPath(cx, cy, Math.max(0, r - 6), R + 6, a0, a1, a0, a1) }, g);
      }
      if (sl.tip) mark(g, sl.tip);
      const share = sl.v / total;
      if (sl.label && share >= minShare) {
        const am = (a0 + a1) / 2;
        const [lx, ly] = pt(cx, cy, R + 11, am);
        const sn = Math.sin(am);
        const anchor = sn > 0.2 ? 'start' : (sn < -0.2 ? 'end' : 'middle');
        const cs = Math.cos(am);
        const dy = cs > 0.5 ? -1 : (cs < -0.5 ? 8 : 3.5);
        txt(labels, lx, ly + dy, sl.label, { class: 'val-txt', fill: INK, 'text-anchor': anchor });
      }
    }
    svg.appendChild(labels);
    return svg;
  }

  /* ---------- stacked columns ---------- */
  /**
   * opts: { w, h, categories:[string], series:[{name,color,values:[number]}], labelSeries (index, -1 none),
   *         fmt(v) → label text, step (major unit, default 5), tip(i) → tip, ariaLabel }
   */
  function stacked(opts) {
    const w = opts.w, h = opts.h;
    const m = { l: 30, r: 10, t: 12, b: 22 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const svg = svgRoot(w, h, opts.ariaLabel);
    const cats = opts.categories || [];
    const n = Math.max(1, cats.length);
    const step = opts.step || 5;
    const sums = cats.map((_, i) => opts.series.reduce((a, se) => a + (pos(se.values[i])), 0));
    const ymax = niceMax(Math.max(0, ...sums), step);
    const y = v => m.t + ph - v / ymax * ph;
    const grid = s('g', null, svg);
    for (let v = 0; v <= ymax + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      s('line', { x1: m.l, x2: m.l + pw, y1: yy, y2: yy, stroke: v === 0 ? BASE : GRID, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, grid);
      txt(grid, m.l - 6, yy + 3, String(v), { class: 'axis-txt', 'text-anchor': 'end' });
    }
    const band = pw / n;
    const bw = Math.min(24, band * 0.625);
    cats.forEach((cat, i) => {
      const x = m.l + band * i + (band - bw) / 2;
      const g = s('g', null, svg);
      s('rect', { class: 'hit', x: r2(m.l + band * i + 2), y: m.t, width: r2(band - 4), height: ph }, g);
      let cum = 0;
      let drawn = 0;
      const segs = [];
      opts.series.forEach((se, j) => {
        const v = pos(se.values[i]);
        if (!(v > 0)) return;
        const yb = y(cum), yt = y(cum + v);
        cum += v;
        segs.push({ j, v, yb, yt, color: se.color });
      });
      segs.forEach((sg, k) => {
        let yb = sg.yb;
        if (k > 0) yb -= GAP;
        let hh = yb - sg.yt;
        if (hh < 1) hh = 1;
        const top = k === segs.length - 1;
        s('path', { class: 'vis', d: colPath(x, yb - hh, bw, hh, top ? 4 : 0), fill: sg.color }, g);
        drawn++;
        if (opts.labelSeries === sg.j && hh >= 13) {
          txt(g, x + bw / 2, yb - hh / 2 + 3.5, opts.fmt ? opts.fmt(sg.v) : String(sg.v),
            { class: 'val-txt', fill: onFill(sg.color), 'text-anchor': 'middle' });
        }
      });
      if (cat !== '' && cat != null) txt(svg, m.l + band * i + band / 2, m.t + ph + 15, cat, { class: 'cat-txt', 'text-anchor': 'middle' });
      if (opts.tip) mark(g, opts.tip(i));
    });
    return svg;
  }
  function pos(v) { return (typeof v === 'number' && v > 0) ? v : 0; }

  /* ---------- single-series columns (per-bar colours) ---------- */
  /**
   * opts: { w, h, categories, values, colors:[per bar], fmt(v), step, tip(i), ariaLabel }
   * Every bar carries its value on the cap (0 included, as in the Excel chart).
   */
  function bars(opts) {
    const w = opts.w, h = opts.h;
    const m = { l: 30, r: 10, t: 16, b: 22 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const svg = svgRoot(w, h, opts.ariaLabel);
    const cats = opts.categories || [];
    const n = Math.max(1, cats.length);
    const step = opts.step || 5;
    const vals = cats.map((_, i) => (typeof opts.values[i] === 'number' ? opts.values[i] : 0));
    const ymax = niceMax(Math.max(0, ...vals), step);
    const y = v => m.t + ph - Math.max(0, v) / ymax * ph;
    const grid = s('g', null, svg);
    for (let v = 0; v <= ymax + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      s('line', { x1: m.l, x2: m.l + pw, y1: yy, y2: yy, stroke: v === 0 ? BASE : GRID, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, grid);
      txt(grid, m.l - 6, yy + 3, String(v), { class: 'axis-txt', 'text-anchor': 'end' });
    }
    const band = pw / n;
    const bw = Math.min(24, band * 0.667);
    cats.forEach((cat, i) => {
      const v = vals[i];
      const x = m.l + band * i + (band - bw) / 2;
      const g = s('g', null, svg);
      s('rect', { class: 'hit', x: r2(m.l + band * i + 2), y: m.t - 12, width: r2(band - 4), height: ph + 12 }, g);
      if (v > 0) {
        const yt = y(v);
        s('path', { class: 'vis', d: colPath(x, yt, bw, Math.max(1, m.t + ph - yt), 4), fill: opts.colors[i] }, g);
      }
      txt(g, x + bw / 2, y(v) - 4, opts.fmt ? opts.fmt(v) : String(v), { class: 'val-txt', fill: INK, 'text-anchor': 'middle' });
      txt(svg, m.l + band * i + band / 2, m.t + ph + 15, cat, { class: 'cat-txt', 'text-anchor': 'middle' });
      if (opts.tip) mark(g, opts.tip(i));
    });
    return svg;
  }

  /* ---------- radar (no fill) ---------- */
  /**
   * opts: { w, h, labels:[5], series:[{name,color,width,values:[5],dots}], tip(axis) → tip, ariaLabel, fmt(v) }
   * Series are drawn in reverse order so the first (本人) lies on top.
   */
  function radar(opts) {
    const w = opts.w, h = opts.h;
    const svg = svgRoot(w, h, opts.ariaLabel);
    const labels = opts.labels || [];
    const n = Math.max(3, labels.length);
    const cx = w / 2, cy = h / 2 + 2;
    const R = Math.min(w * 0.33, h * 0.37);
    let mx = 0;
    for (const se of opts.series) for (const v of se.values) if (typeof v === 'number' && v > mx) mx = v;
    const steps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0];
    let rmax = 0.5;
    if (mx > 0) { rmax = steps.find(sv => sv >= mx * 1.08 - 1e-12) || Math.ceil(mx * 10) / 10; }
    const ringStep = rmax <= 0.5 ? 0.1 : 0.2;
    const ang = i => i * 2 * Math.PI / n;
    const grid = s('g', null, svg);
    for (let v = ringStep; v <= rmax + 1e-9; v += ringStep) {
      const rr = v / rmax * R;
      const d = labels.map((_, i) => pt(cx, cy, rr, ang(i))).map((p, i) => (i ? 'L' : 'M') + r2(p[0]) + ',' + r2(p[1])).join('') + 'Z';
      s('path', { d, fill: 'none', stroke: GRID, 'stroke-width': 1 }, grid);
    }
    labels.forEach((_, i) => {
      const [x, y2] = pt(cx, cy, R, ang(i));
      s('line', { x1: r2(cx), y1: r2(cy), x2: r2(x), y2: r2(y2), stroke: GRID, 'stroke-width': 1 }, grid);
    });
    txt(grid, cx + 4, cy - R + 9, Math.round(rmax * 100) + '%', { class: 'axis-txt', fill: MUTED, style: 'font-size:7pt' });
    labels.forEach((lab, i) => {
      const a = ang(i);
      const [x, y2] = pt(cx, cy, R + 10, a);
      const sn = Math.sin(a), cs = Math.cos(a);
      const anchor = sn > 0.2 ? 'start' : (sn < -0.2 ? 'end' : 'middle');
      const dy = cs > 0.5 ? -2 : (cs < -0.5 ? 9 : 3.5);
      txt(svg, x, y2 + dy, lab, { class: 'cat-txt', 'text-anchor': anchor });
    });
    const order = opts.series.map((se, i) => i).reverse();
    for (const si of order) {
      const se = opts.series[si];
      const vals = se.values.map(v => (typeof v === 'number' && v > 0 ? v : 0));
      if (!vals.some(v => v > 0)) continue;
      const pts = vals.map((v, i) => pt(cx, cy, Math.min(v, rmax) / rmax * R, ang(i)));
      const d = pts.map((p, i) => (i ? 'L' : 'M') + r2(p[0]) + ',' + r2(p[1])).join('') + 'Z';
      s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': se.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      if (se.dots) {
        for (const p of pts) s('circle', { cx: r2(p[0]), cy: r2(p[1]), r: 4, fill: se.color, stroke: '#FFFFFF', 'stroke-width': 2 }, svg);
      }
    }
    // one hit wedge per axis: tooltip lists every series at that axis
    labels.forEach((lab, i) => {
      const a = ang(i), half = Math.PI / n;
      const g = s('g', { class: 'mk-axis' }, svg);
      s('path', { class: 'hit', d: sectorPath(cx, cy, 0.001, R + 18, a - half, a + half, a - half, a + half) }, g);
      for (const se of opts.series) {
        const v = typeof se.values[i] === 'number' && se.values[i] > 0 ? se.values[i] : 0;
        const [px, py] = pt(cx, cy, Math.min(v, rmax) / rmax * R, a);
        s('circle', { class: 'hl', cx: r2(px), cy: r2(py), r: 5, fill: '#FFFFFF', stroke: se.color, 'stroke-width': 2, 'pointer-events': 'none' }, g);
      }
      if (opts.tip) mark(g, opts.tip(i));
    });
    return svg;
  }

  /* ---------- HTML legend helpers ---------- */
  function swatch(kind, color) {
    const sp = document.createElement('span');
    sp.className = 'sw ' + (kind || 'rect');
    sp.style.background = color;
    sp.setAttribute('aria-hidden', 'true');
    return sp;
  }
  /** items: [{label, color, kind, cell?}] → <div class="legend"> (cell = data-cell of the workbook cell it shows) */
  function legend(items, cls) {
    const d = document.createElement('div');
    d.className = 'legend' + (cls ? ' ' + cls : '');
    for (const it of items) {
      const li = document.createElement('span');
      li.className = 'li';
      if (it.cell) li.setAttribute('data-cell', it.cell);
      li.appendChild(swatch(it.kind, it.color));
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = it.label;
      li.appendChild(t);
      d.appendChild(li);
    }
    return d;
  }

  AE.charts = { ring, stacked, bars, radar, legend, swatch, mark, installTooltips, onFill, hideTip: hide };
})(typeof globalThis !== 'undefined' ? globalThis : this);
