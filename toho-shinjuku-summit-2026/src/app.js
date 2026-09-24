/* TOHO CINEMAS SHINJUKU — Relay Talk 2026 presentation engine */
(function () {
  'use strict';

  var TALK = window.TALK || { target: 270, scenes: {} };
  var stage = document.getElementById('stage');
  var viewport = document.getElementById('viewport');
  var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
  var N = scenes.length;
  var REVEAL = '.rv,.rv-l,.rv-s,.rv-f,.rv-clip,.rv-up,.rv-line,.rv-vline,.mask,.split,.punch,.count,.odo,.slashes,.strengths .card';

  var state = { started: false, idx: 0, step: 1, busy: false };
  var timers = [];           // pending timeouts for the current scene
  var clock = { t0: 0, sceneT0: 0, running: false };
  var presenter = null;      // popup window
  var swapId = 0, lastNav = 0;
  var reduced = false;           // calm mode (M key)

  /* ---------------- helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function parseDelay(el) {
    var v = el.style.getPropertyValue('--d') || getComputedStyle(el).getPropertyValue('--d') || '0s';
    v = String(v).trim();
    if (!v) return 0;
    return v.indexOf('ms') > -1 ? parseFloat(v) : parseFloat(v) * 1000;
  }
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }
  function sceneData(i) { return TALK.scenes[scenes[i].dataset.id] || {}; }
  function stepsOf(i) { return parseInt(scenes[i].dataset.steps || '1', 10); }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._id); toast._id = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* ---------------- stage fit ---------------- */
  function fit() {
    var w = viewport.clientWidth, h = viewport.clientHeight;
    var s = Math.min(w / 1920, h / 1080);
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  }
  window.addEventListener('resize', fit);

  /* ---------------- text splitting ---------------- */
  function splitChars(el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          Array.from(c.textContent).forEach(function (ch) {
            if (ch === '\n' || ch === '\r') return;
            var s = document.createElement('span');
            s.className = 'ch'; s.textContent = ch; s.style.setProperty('--ci', i++);
            frag.appendChild(s);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') {
          walk(c);
        }
      });
    })(el);
  }
  scenes.forEach(function (sc) {
    var cam = document.createElement('div'); cam.className = 'cam';
    while (sc.firstChild) cam.appendChild(sc.firstChild);
    sc.appendChild(cam);
  });
  $$('.split').forEach(splitChars);

  /* odometer: each digit becomes a reel that rolls to its value */
  $$('.odo').forEach(function (el) {
    var txt = el.textContent.trim(), di = 0; el.textContent = '';
    Array.from(txt).forEach(function (ch) {
      if (!/[0-9]/.test(ch)) { var sp = document.createElement('span'); sp.className = 'sep'; sp.textContent = ch; el.appendChild(sp); return; }
      var dg = document.createElement('span'); dg.className = 'dg';
      var reel = document.createElement('span'); reel.className = 'reel';
      for (var k = 0; k < 20; k++) { var n = document.createElement('span'); n.textContent = String(k % 10); reel.appendChild(n); }
      reel.style.setProperty('--dd', 'calc(var(--d, 0s) + ' + (di * 0.14) + 's)');
      reel.style.setProperty('--t', (1.5 + di * 0.25) + 's');
      reel.dataset.n = String(10 + parseInt(ch, 10));
      dg.appendChild(reel); el.appendChild(dg); di++;
    });
  });
  function setOdo(el, on) {
    $$('.reel', el).forEach(function (r) { r.style.transform = on ? 'translateY(' + (-parseInt(r.dataset.n, 10)) + 'em)' : ''; });
  }

  /* strengths cards: 3D tilt surface that follows the pointer */
  $$('.strengths .card').forEach(function (card) {
    var t = document.createElement('div'); t.className = 'tilt';
    while (card.firstChild) t.appendChild(card.firstChild);
    var g = document.createElement('div'); g.className = 'glare'; t.appendChild(g);
    card.appendChild(t);
    card.addEventListener('pointermove', function (e) {
      if (!card.classList.contains('go')) return;
      var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.classList.add('hover');
      t.style.setProperty('--ry', ((x - .5) * 16).toFixed(2) + 'deg');
      t.style.setProperty('--rx', ((.5 - y) * 12).toFixed(2) + 'deg');
      t.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); t.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    });
    card.addEventListener('pointerleave', function () {
      card.classList.remove('hover'); t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg');
    });
  });

  /* cover parallax + standby projector beam follow the pointer */
  var parRaf = 0, px = 0, py = 0;
  document.addEventListener('mousemove', function (e) {
    px = e.clientX / window.innerWidth * 2 - 1; py = e.clientY / window.innerHeight * 2 - 1;
    if (parRaf) return;
    parRaf = requestAnimationFrame(function () {
      parRaf = 0;
      stage.style.setProperty('--mx', px.toFixed(3)); stage.style.setProperty('--my', py.toFixed(3));
      var beam = $('#standby .beam'); if (beam) beam.style.setProperty('--bx', (px * 420).toFixed(0) + 'px');
    });
  });

  /* ---------------- grain texture ---------------- */
  (function grain() {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d'), d = x.createImageData(256, 256);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    $('#grain').style.backgroundImage = 'url(' + c.toDataURL() + ')';
  })();

  /* ---------------- counters ---------------- */
  function setCount(el, v) {
    var out = Math.round(v);
    el.textContent = el.dataset.comma ? out.toLocaleString('en-US') : String(out);
  }
  function runCount(el, instant) {
    var from = parseFloat(el.dataset.from || '0'), to = parseFloat(el.dataset.to || '0');
    var dur = parseFloat(el.dataset.dur || '1500');
    if (instant || reduced) { setCount(el, to); return; }
    setCount(el, from);
    var delay = parseDelay(el);
    later(function () {
      var t0 = performance.now();
      (function tick(now) {
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 4);
        setCount(el, from + (to - from) * e);
        if (p < 1 && el.isConnected) requestAnimationFrame(tick);
      })(t0);
    }, delay);
  }

  /* ---------------- reveal gating ---------------- */
  function elStep(el) {
    var s = el.closest('[data-step]');
    return s ? parseInt(s.dataset.step, 10) : 1;
  }
  function applyStep(scene, step, instant) {
    scene.dataset.at = step;
    $$(REVEAL, scene).forEach(function (el) {
      var need = elStep(el);
      var on = step >= need;
      var was = el.classList.contains('go');
      if (on && !was) {
        el.classList.add('go');
        if (el.classList.contains('count')) runCount(el, instant);
        if (el.classList.contains('odo')) setOdo(el, true);
      } else if (!on && was) {
        el.classList.remove('go');
        if (el.classList.contains('odo')) setOdo(el, false);
      }
    });
    Canvases.step(scene, step);
  }
  function resetScene(scene) {
    scene.classList.add('instant');
    $$(REVEAL, scene).forEach(function (el) { el.classList.remove('go'); if (el.classList.contains('odo')) setOdo(el, false); });
    scene.dataset.at = 0;
    void scene.offsetWidth;
    scene.classList.remove('instant');
  }

  /* ---------------- transitions ---------------- */
  function playOverlay(id, ms) {
    var o = document.getElementById(id);
    o.classList.remove('run'); void o.offsetWidth; o.classList.add('run');
    setTimeout(function () { o.classList.remove('run'); }, ms);
  }

  function show(idx, step, opts) {
    opts = opts || {};
    var prev = scenes[state.idx];
    var next = scenes[idx];
    var instant = !!opts.instant || reduced;

    if (idx === state.idx && prev.classList.contains('is-active')) {
      // same scene: step change
      if (step < state.step) {
        next.classList.add('instant');
        applyStep(next, step, true);
        void next.offsetWidth;
        next.classList.remove('instant');
      } else {
        applyStep(next, step, false);
      }
      state.step = step;
      afterChange();
      return;
    }

    clearTimers();
    var trans = opts.back || instant ? 'none' : (next.dataset.trans || 'fade');
    var swapDelay = 0;

    var leave = function () {
      if (prev && prev !== next && prev.classList.contains('is-active')) {
        var p = prev;
        p.classList.remove('is-active');
        p.classList.add('is-out');
        Canvases.stop(p);
        clearTimeout(p._outId);
        p._outId = setTimeout(function () { p.classList.remove('is-out'); if (!p.classList.contains('is-active')) resetScene(p); }, 650);
      }
    };

    state.idx = idx; state.step = step;
    clock.sceneT0 = performance.now();

    var enter = function () {
      clearTimeout(next._outId); next.classList.remove('is-out');
      resetScene(next);
      if (instant) {
        next.classList.add('instant');
        next.classList.add('is-active');
        applyStep(next, step, true);
        void next.offsetWidth;
        next.classList.remove('instant');
      } else {
        // set structural state (e.g. timeline layout) before becoming visible
        next.classList.add('instant');
        next.dataset.at = step;
        void next.offsetWidth;
        next.classList.remove('instant');
        next.classList.add('is-active');
        requestAnimationFrame(function () { if (scenes[state.idx] === next) applyStep(next, state.step, false); });
      }
      Canvases.start(next, instant);
    };
    if (swapDelay) { state.busy = true; clearTimeout(swapId); swapId = setTimeout(function () { leave(); enter(); state.busy = false; }, swapDelay); }
    else { leave(); enter(); }
    afterChange();
  }

  /* ---------------- navigation ---------------- */
  function navOK() {
    if (document.body.classList.contains('black')) { toggleBlack(); return false; }
    var now = performance.now(); if (now - lastNav < 200) return false; lastNav = now; return true;
  }
  function next() {
    if (state.busy) return;
    if (!navOK()) return;
    if (!state.started) { startShow(); return; }
    if (Countdown.running) { Countdown.skip(); return; }
    var steps = stepsOf(state.idx);
    if (state.step < steps) show(state.idx, state.step + 1);
    else if (state.idx < N - 1) show(state.idx + 1, 1);
  }
  function prev() {
    if (state.busy || !state.started || Countdown.running) return;
    if (!navOK()) return;
    if (state.step > 1) show(state.idx, state.step - 1);
    else if (state.idx > 0) show(state.idx - 1, stepsOf(state.idx - 1), { back: true, instant: true });
    else backToStandby();
  }
  function goto(idx, step) {
    if (state.busy) return;
    idx = Math.max(0, Math.min(N - 1, idx));
    step = Math.max(1, Math.min(stepsOf(idx), step || 1));
    if (!state.started) { enterShow(); if (!clock.running) startClock(); }
    show(idx, step, { instant: true, back: true });
  }

  function enterShow() {
    state.started = true;
    document.body.classList.remove('pre');
    $('#standby').classList.add('hide');
  }
  function startShow() {
    enterShow();
    Countdown.play(function () { startClock(); show(0, 1); });
  }
  function backToStandby() {
    clearTimers();
    clearTimeout(swapId); state.busy = false;
    if (Countdown.running) Countdown.cancel();
    clock.running = false;
    scenes.forEach(function (s) { s.classList.remove('is-active', 'is-out'); resetScene(s); Canvases.stop(s); });
    state.started = false; state.idx = 0; state.step = 1;
    document.body.classList.add('pre');
    $('#standby').classList.remove('hide');
    afterChange();
  }

  /* ---------------- countdown leader ---------------- */
  var Countdown = {
    running: false, raf: 0, done: null,
    play: function (done) {
      if (reduced) { done(); return; }
      var el = $('#countdown'), num = $('.cd-num', el), sweep = $('.cd-sweep', el), hand = $('.cd-hand', el);
      var self = this, per = 800, total = per * 3, t0 = performance.now();
      this.running = true; this.done = done;
      el.classList.add('run'); document.body.classList.add('counting');
      (function tick(now) {
        if (!self.running) return;
        var t = now - t0;
        if (t >= total) { self.finish(); return; }
        var k = Math.floor(t / per), f = (t % per) / per;
        num.textContent = String(3 - k);
        var deg = f * 360;
        sweep.style.setProperty('--sweep', deg + 'deg');
        sweep.style.background = 'conic-gradient(rgba(240,235,220,.16) ' + deg + 'deg, transparent 0)';
        hand.style.transform = 'rotate(' + (180 + deg) + 'deg)';
        self.raf = requestAnimationFrame(tick);
      })(t0);
    },
    finish: function () {
      if (!this.running) return;
      this.running = false; cancelAnimationFrame(this.raf);
      $('#countdown').classList.remove('run'); document.body.classList.remove('counting');
      var d = this.done; this.done = null; if (d) d();
    },
    skip: function () { this.finish(); },
    cancel: function () { this.done = null; this.finish(); }
  };

  /* ---------------- clock / pacing ---------------- */
  function startClock() { clock.t0 = performance.now(); clock.sceneT0 = clock.t0; clock.running = true; }
  function resetClock() { startClock(); toast('タイマーをリセットしました'); renderTimers(); }
  function elapsed() { return clock.running ? (performance.now() - clock.t0) / 1000 : 0; }
  function plan(i) {
    var s = 0;
    for (var k = 0; k < i; k++) s += (sceneData(k).seconds || 0);
    return { start: s, end: s + (sceneData(i).seconds || 0) };
  }
  function pace() {
    if (!state.started) return { text: '開始前', cls: '' };
    var e = elapsed(), p = plan(state.idx);
    if (e > p.end + 5) return { text: '予定より ' + fmt(e - p.end) + ' 遅れ', cls: 'late' };
    if (e < p.start - 5) return { text: '予定より ' + fmt(p.start - e) + ' 早い', cls: 'ok' };
    return { text: '予定どおり', cls: 'ok' };
  }

  /* ---------------- script segments ---------------- */
  var CUE = '［▶］';
  function segments(i) {
    var t = sceneData(i).text || '';
    return t.split(CUE).map(function (s) { return s.trim(); });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function scriptHTML(i, step) {
    var segs = segments(i);
    return segs.map(function (s, k) {
      var cls = k + 1 < step ? 'seg done' : k + 1 === step ? 'seg now' : 'seg';
      var cue = k > 0 ? '<span class="cue">▶ クリック</span>' : '';
      return cue + '<span class="' + cls + '">' + esc(s).replace(/\n/g, '<br>') + '</span>';
    }).join('');
  }
  function notesHTML(d) {
    return (d.hints || []).map(function (h) { return '<div class="hint">▸ ' + esc(h) + '</div>'; }).join('') +
      (d.flags || []).map(function (f) { return '<div class="flag">⚠ 要確認：' + esc(f) + '</div>'; }).join('');
  }
  function label(i) {
    var s = scenes[i];
    return (s.dataset.no ? s.dataset.no + ' ' : '') + s.dataset.title;
  }
  function chapterName(i) {
    var eb = $('.eyebrow', scenes[i]);
    if (!eb) return '';
    return eb.textContent.replace(/^\s*\d+\s*/, '').trim();
  }

  /* ---------------- after every change ---------------- */
  function afterChange() {
    var s = scenes[state.idx];
    var hud = $('#hud');
    var hideHud = !state.started || s.dataset.id === 'cover' || (s.dataset.id === 'together' && state.step >= 2);
    hud.classList.toggle('hide', hideHud);
    $('#hud-chapter').textContent = s.dataset.id === 'landscape' && state.step >= 2 ? 'CORRELATION' : chapterName(state.idx);
    var no = s.dataset.no2 && state.step >= 2 ? s.dataset.no2 : s.dataset.no;
    $('#hud-page').textContent = no ? no + ' / ' + scenes[N - 1].dataset.no : '';
    var frac = state.started ? (state.idx + state.step / stepsOf(state.idx)) / N : 0;
    $('#progress').style.width = (frac * 1780) + 'px';
    if (state.started) history.replaceState(null, '', '#' + (state.idx + 1) + '.' + state.step);
    else history.replaceState(null, '', location.pathname + location.search);
    renderNotes();
    renderPresenter();
    renderOverview();
    renderCtrl();
  }

  /* ---------------- page controls (buttons + dots) ---------------- */
  var dotsEl = $('#dots');
  scenes.forEach(function (s, i) {
    var b = document.createElement('button'); b.type = 'button';
    b.dataset.label = (s.dataset.no ? s.dataset.no + '  ' : '表紙  ') + s.dataset.title;
    b.setAttribute('aria-label', b.dataset.label);
    b.addEventListener('click', function () { goto(i, 1); });
    dotsEl.appendChild(b);
  });
  function renderCtrl() {
    $$('#dots button').forEach(function (b, i) {
      b.classList.toggle('on', state.started && i === state.idx);
      b.classList.toggle('done', state.started && i < state.idx);
    });
    var atEnd = state.idx === N - 1 && state.step >= stepsOf(N - 1);
    var nb = $('#btn-next'); nb.classList.toggle('end', atEnd);
    nb.firstChild.textContent = atEnd ? 'おわり' : '次へ';
    $('#btn-prev').disabled = !state.started;
  }
  $('#btn-next').addEventListener('click', function () { next(); });
  $('#btn-prev').addEventListener('click', function () { prev(); });
  $('#sb-start').addEventListener('click', function (e) { e.stopPropagation(); next(); });
  $$('#ctrl button, #sb-start').forEach(function (b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); });

  /* ---------------- notes panel (N) ---------------- */
  function renderNotes() {
    if (!document.body.classList.contains('notes')) return;
    var i = state.idx, d = sceneData(i);
    $('#n-no').textContent = state.started ? (scenes[i].dataset.no || 'COVER') : 'STANDBY';
    $('#n-title').textContent = scenes[i].dataset.title;
    $('#n-target').textContent = '目標 ' + (d.seconds || 0) + '秒 ・ ステップ ' + state.step + '/' + stepsOf(i);
    $('#n-text').innerHTML = state.started ? scriptHTML(i, state.step) : '<span class="seg now">→ キー／クリックでカウントダウンが始まり、表紙が出ます。</span>';
    $('#n-next').textContent = i < N - 1 ? '次：' + label(i + 1) : '最後のシーンです';
    $('#n-flags').innerHTML = notesHTML(d);
    renderTimers();
  }
  function renderTimers() {
    var p = pace();
    if (document.body.classList.contains('notes')) {
      $('#n-timer').textContent = fmt(elapsed());
      var np = $('#n-pace'); np.textContent = p.text + '（目標 ' + fmt(TALK.target) + '）'; np.className = 'n-pace ' + p.cls;
    }
    if (presenter && !presenter.closed) {
      var d = presenter.document;
      var set = function (id, v) { var e = d.getElementById(id); if (e) e.textContent = v; };
      set('p-elapsed', fmt(elapsed()));
      set('p-left', '残り ' + fmt(TALK.target - elapsed()));
      var pe = d.getElementById('p-pace'); if (pe) { pe.textContent = p.text; pe.className = 'pace ' + p.cls; }
      var sd = sceneData(state.idx).seconds || 0, se = state.started ? (performance.now() - clock.sceneT0) / 1000 : 0;
      set('p-scene', 'このシーン ' + fmt(se) + ' ／ 目標 ' + fmt(sd));
      var bar = d.getElementById('p-bar'); if (bar) { bar.style.width = Math.min(100, sd ? se / sd * 100 : 0) + '%'; bar.className = se > sd + 3 ? 'over' : ''; }
      var now = new Date(); set('p-clock', ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2));
    }
  }
  setInterval(renderTimers, 250);

  function toggleNotes() {
    document.body.classList.toggle('notes');
    fit(); renderNotes();
  }

  /* ---------------- presenter window (S) ---------------- */
  var PRESENTER_CSS = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'html,body{height:100%;background:#0b0c0f;color:#f5f2ea;font-family:"Noto Sans JP","Hiragino Sans","Yu Gothic UI","Yu Gothic","Meiryo",sans-serif}',
    'body{display:grid;grid-template-rows:auto 1fr auto;height:100vh}',
    'header{display:flex;align-items:baseline;gap:18px;padding:16px 26px;border-bottom:1px solid #23262d}',
    'header .no{font-family:"Inter Tight",Arial,sans-serif;font-weight:800;color:#e3262e;letter-spacing:.18em}',
    'header .tt{font-size:20px;font-weight:700}',
    'header .st{margin-left:auto;color:#8e9099;font-size:14px}#p-black{display:none;color:#fff;background:#e3262e;border-radius:6px;padding:2px 10px;font-size:14px;font-weight:700}',
    'main{display:grid;grid-template-columns:1fr 380px;min-height:0}',
    '#p-text{padding:26px 34px;font-size:clamp(20px,3.1vh,34px);line-height:1.8;overflow:auto}',
    '.seg{color:#595c64}.seg.now{color:#fff}.seg.done{color:#8a8d95}',
    '.cue{display:inline-block;margin:0 8px;padding:0 10px;border-radius:6px;background:#3a1418;color:#ff5a60;font-size:.62em;vertical-align:.2em;font-weight:700}',
    'aside{border-left:1px solid #23262d;padding:22px 24px;display:flex;flex-direction:column;gap:14px;overflow:auto}',
    '.lbl{font-size:12px;letter-spacing:.2em;color:#6f727b;font-family:"Inter Tight",Arial,sans-serif;font-weight:700}',
    '#p-elapsed{font-family:"Inter Tight",Arial,sans-serif;font-weight:800;font-size:72px;line-height:1;font-variant-numeric:tabular-nums}',
    '#p-left{color:#8e9099;font-size:15px}',
    '.pace{font-size:18px;font-weight:700}.pace.late{color:#ff5a60}.pace.ok{color:#7fd49b}',
    '.track{flex-shrink:0;height:6px;background:#1d2027;border-radius:3px;overflow:hidden}#p-bar{height:100%;width:0;background:#cfae6b;transition:width .25s}#p-bar.over{background:#e3262e}',
    '#p-scene{font-size:14px;color:#c9c7c1}',
    '#p-next{font-size:15px;line-height:1.6;color:#d3d0c8}',
    '#p-flags{font-size:13px;line-height:1.6}#p-flags .hint{color:#9fd3ff;margin-bottom:6px}#p-flags .flag{color:#cfae6b;margin-bottom:6px}',
    '#p-clock{font-family:"Inter Tight",Arial,sans-serif;font-size:22px;color:#8e9099;margin-top:auto}',
    'footer{display:flex;gap:10px;padding:12px 20px;border-top:1px solid #23262d}',
    'button{font:inherit;font-size:15px;color:#f5f2ea;background:#1b1e25;border:1px solid #353944;border-radius:10px;padding:10px 16px;cursor:pointer}',
    'button.pri{background:#e3262e;border-color:#e3262e;min-width:160px}',
    'footer .sp{flex:1}footer .h{color:#6f727b;font-size:12px;align-self:center}'
  ].join('\n');

  function openPresenter() {
    if (presenter && !presenter.closed) { presenter.focus(); return; }
    var w = window.open('', 'toho_presenter', 'popup=yes,width=1280,height=800');
    if (!w) { toast('ポップアップがブロックされました。許可するか、N キーで台本を表示してください'); toggleNotes(); return; }
    presenter = w;
    var fontCSS = (document.getElementById('font-data') || {}).textContent || '';
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>発表者ビュー｜TOHOシネマズ新宿</title><style>' + fontCSS + '\n' + PRESENTER_CSS + '</style></head><body>' +
      '<header><span class="no" id="p-no"></span><span class="tt" id="p-title"></span><span id="p-black">● 暗転中（次へ で解除）</span><span class="st" id="p-step"></span></header>' +
      '<main><div id="p-text"></div><aside>' +
      '<div class="lbl">ELAPSED</div><div id="p-elapsed">0:00</div><div id="p-left"></div><div id="p-pace" class="pace"></div>' +
      '<div class="lbl" style="margin-top:8px">SCENE</div><div class="track"><div id="p-bar"></div></div><div id="p-scene"></div>' +
      '<div class="lbl" style="margin-top:8px">NEXT</div><div id="p-next"></div>' +
      '<div id="p-flags"></div><div id="p-clock"></div></aside></main>' +
      '<footer><button data-a="prev">◀ 前へ</button><button class="pri" data-a="next">次へ ▶</button><span class="sp"></span>' +
      '<span class="h">このウィンドウでも → ← PageUp/Down で操作できます</span>' +
      '<button data-a="reset">タイマー リセット</button><button data-a="black">暗転</button></footer></body></html>');
    w.document.close();
    w.document.addEventListener('keydown', function (e) {
      if (/^(ArrowRight|ArrowLeft|ArrowUp|ArrowDown|PageUp|PageDown| |Enter|Backspace|Home|End|b|B|\.|w|W|t|T|[0-9])$/.test(e.key)) onKey(e);
    });
    w.document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('button'); if (!a) return;
      var act = a.getAttribute('data-a');
      if (act === 'next') next(); else if (act === 'prev') prev(); else if (act === 'reset') resetClock(); else if (act === 'black') toggleBlack();
    });
    renderPresenter();
  }
  function renderPresenter() {
    if (!presenter || presenter.closed) return;
    var d = presenter.document, i = state.idx, sd = sceneData(i);
    var set = function (id, v) { var e = d.getElementById(id); if (e) e.textContent = v; };
    var pno = scenes[i].dataset.no2 && state.step >= 2 ? scenes[i].dataset.no2 : scenes[i].dataset.no;
    set('p-no', state.started ? ((pno || '表紙') + ' / ' + scenes[N - 1].dataset.no) : 'STANDBY');
    var bl = d.getElementById('p-black'); if (bl) bl.style.display = document.body.classList.contains('black') ? 'block' : 'none';
    set('p-title', scenes[i].dataset.title);
    set('p-step', 'ステップ ' + state.step + ' / ' + stepsOf(i) + '　目標 ' + (sd.seconds || 0) + '秒');
    var tx = d.getElementById('p-text');
    if (tx) tx.innerHTML = state.started ? scriptHTML(i, state.step) : '<span class="seg now">待機画面です。→ でカウントダウン → 表紙。表紙が出たら話し始めてください。</span>';
    var nx = d.getElementById('p-next'); if (nx) nx.textContent = i < N - 1 ? label(i + 1) : '（最後のシーン）';
    var fl = d.getElementById('p-flags'); if (fl) fl.innerHTML = notesHTML(sd);
    renderTimers();
  }

  /* ---------------- printable script (台本) ---------------- */
  function openScript() {
    var w = window.open('', 'toho_script');
    if (!w) { toast('ポップアップがブロックされました'); return; }
    var cum = 0, total = 0, chars = 0;
    var rows = scenes.map(function (s, i) {
      var d = sceneData(i); var sec = d.seconds || 0; var st = cum; cum += sec; total += sec;
      var c = (d.text || '').replace(/［▶］|\s/g, '').length; chars += c;
      var body = segments(i).map(function (seg, k) { return (k ? '<span class="cue">▶ クリック</span>' : '') + esc(seg).replace(/\n/g, '<br>'); }).join('');
      var fl = (d.hints || []).map(function (h) { return '<li class="h">話し方：' + esc(h) + '</li>'; }).join('') + (d.flags || []).map(function (f) { return '<li>要確認：' + esc(f) + '</li>'; }).join('');
      return '<section><div class="h"><span class="no">' + (s.dataset.no || 'COVER') + '</span><span class="tt">' + esc(s.dataset.title) + '</span>' +
        '<span class="tm">' + fmt(st) + '〜' + fmt(cum) + '（' + sec + '秒・' + c + '字）</span></div><p>' + body + '</p>' + (fl ? '<ul>' + fl + '</ul>' : '') + '</section>';
    }).join('');
    var css = [
      '*{box-sizing:border-box;margin:0;padding:0}',
      'body{font-family:"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif;color:#111;background:#fff;padding:36px 44px;max-width:920px;margin:auto;line-height:1.7}',
      'h1{font-size:22px}.meta{margin-top:6px;color:#555;font-size:13px}.bar{margin:18px 0 8px;display:flex;gap:10px}',
      'button{font:inherit;font-size:14px;padding:8px 14px;border:1px solid #bbb;border-radius:8px;background:#f4f4f4;cursor:pointer}',
      'section{border-top:1px solid #ddd;padding:16px 0;break-inside:avoid}',
      '.h{display:flex;gap:12px;align-items:baseline}.no{font-weight:800;color:#c8141c;letter-spacing:.1em;min-width:64px}.tt{font-weight:700}.tm{margin-left:auto;color:#666;font-size:12px;white-space:nowrap}',
      'p{margin-top:8px;font-size:16px}',
      '.cue{display:inline-block;margin:0 6px;padding:0 6px;border:1px solid #c8141c;color:#c8141c;border-radius:4px;font-size:11px;font-weight:700;vertical-align:2px}',
      'ul{margin:8px 0 0 18px;color:#8a6d1f;font-size:12px}ul li.h{color:#2b6a9e}',
      '@media print{.bar{display:none}body{padding:0}}'
    ].join('\n');
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>台本｜TOHOシネマズ新宿 リレートーク</title><style>' + css + '</style></head><body>' +
      '<h1>台本　TOHOシネマズ新宿｜新宿映画館サミット2026 リレートーク</h1>' +
      '<p class="meta">持ち時間 3〜5分（目標 ' + fmt(TALK.target) + '）　合計 ' + fmt(total) + '・約' + chars + '字（1分≒300字）　「▶ クリック」の位置で次へ進めます。</p>' +
      '<div class="bar"><button onclick="print()">印刷する</button></div>' + rows + '</body></html>');
    w.document.close();
  }

  /* ---------------- overview (O) ---------------- */
  function renderOverview() {
    if (!document.body.classList.contains('over')) return;
    var cum = 0;
    $('#ov-grid').innerHTML = scenes.map(function (s, i) {
      var sec = sceneData(i).seconds || 0; var st = cum; cum += sec;
      return '<button class="it' + (i === state.idx && state.started ? ' cur' : '') + '" data-i="' + i + '"><div class="no">' + (s.dataset.no || 'COVER') + '</div><div class="tt">' + esc(s.dataset.title) + '</div><div class="tm">' + fmt(st) + '〜　' + sec + '秒</div></button>';
    }).join('');
  }
  $('#overview').addEventListener('click', function (e) {
    var b = e.target.closest('.it'); if (!b) { toggle('over'); return; }
    document.body.classList.remove('over');
    goto(parseInt(b.dataset.i, 10), 1);
  });

  /* ---------------- misc toggles ---------------- */
  function toggle(cls) { document.body.classList.toggle(cls); if (cls === 'over') renderOverview(); }
  function toggleBlack() { document.body.classList.toggle('black'); renderPresenter(); }
  function toggleFull() {
    var d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      var el = d.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
    }
  }
  $('#help').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) { if (e.target.id === 'help') toggle('help'); return; }
    var a = b.dataset.act;
    document.body.classList.remove('help');
    if (a === 'presenter') openPresenter(); else if (a === 'script') openScript(); else if (a === 'full') toggleFull();
  });

  /* ---------------- input ---------------- */
  var jumpBuf = '';
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.repeat && /^(ArrowRight|ArrowLeft|ArrowUp|ArrowDown|PageUp|PageDown| |Enter|Backspace)$/.test(e.key)) { e.preventDefault(); return; }
    var k = e.key, body = document.body;
    if (body.classList.contains('help') && (k === 'Escape' || k === '?' || k === 'h' || k === 'H')) { toggle('help'); e.preventDefault(); return; }
    if (body.classList.contains('over') && (k === 'Escape' || k === 'o' || k === 'O')) { toggle('over'); e.preventDefault(); return; }
    if (/^[0-9]$/.test(k)) { jumpBuf += k; clearTimeout(onKey._j); onKey._j = setTimeout(function () { jumpBuf = ''; }, 1500); return; }
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Spacebar':
        e.preventDefault(); next(); break;
      case 'Enter':
        e.preventDefault();
        if (jumpBuf) {
          var n = parseInt(jumpBuf, 10); jumpBuf = '';
          scenes.some(function (sc, i) {
            if (parseInt(sc.dataset.no || '0', 10) === n) { goto(i, 1); return true; }
            if (parseInt(sc.dataset.no2 || '0', 10) === n) { goto(i, 2); return true; }
            return false;
          });
        } else next();
        break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); backToStandby(); break;
      case 'End': e.preventDefault(); goto(N - 1, stepsOf(N - 1)); break;
      case 'f': case 'F': case 'F5': e.preventDefault(); toggleFull(); break;
      case 's': case 'S': case 'p': case 'P': e.preventDefault(); openPresenter(); break;
      case 'n': case 'N': e.preventDefault(); toggleNotes(); break;
      case 'o': case 'O': e.preventDefault(); toggle('over'); break;
      case 'b': case 'B': case '.': case 'w': case 'W': e.preventDefault(); toggleBlack(); break;
      case 't': case 'T': e.preventDefault(); resetClock(); break;
      case 'd': case 'D': e.preventDefault(); openScript(); break;
      case 'm': case 'M': e.preventDefault(); reduced = !reduced; document.body.classList.toggle('calm', reduced); toast(reduced ? '動きを控えめにしました（M で戻す）' : '動きを通常に戻しました'); break;
      case '?': case 'h': case 'H': e.preventDefault(); toggle('help'); break;
      case 'Escape': if (body.classList.contains('black')) toggleBlack(); break;
    }
  }
  document.addEventListener('keydown', onKey);
  var tx0 = null;
  viewport.addEventListener('touchstart', function (e) { tx0 = e.touches[0].clientX; }, { passive: true });
  viewport.addEventListener('touchend', function (e) {
    if (tx0 === null) return;
    var dx = e.changedTouches[0].clientX - tx0; tx0 = null;
    if (Math.abs(dx) > 50) { e.preventDefault(); if (dx < 0) next(); else prev(); }
  });
  var idleId = 0;
  function wake() {
    document.body.classList.remove('idle'); clearTimeout(idleId);
    idleId = setTimeout(function () { if (!onCtrl) document.body.classList.add('idle'); }, 2500);
  }
  document.addEventListener('mousemove', wake);
  document.addEventListener('mousedown', wake);
  var ctrlEl = $('#ctrl'), onCtrl = false;
  ctrlEl.addEventListener('mouseenter', function () { onCtrl = true; });
  ctrlEl.addEventListener('mouseleave', function () { onCtrl = false; wake(); });
  document.addEventListener('touchstart', wake, { passive: true });
  // keyboard / presentation remote: keep the controls and cursor out of the way
  document.addEventListener('keydown', function () { clearTimeout(idleId); document.body.classList.add('idle'); });
  idleId = setTimeout(function () { document.body.classList.add('idle'); }, 2500);
  window.addEventListener('beforeunload', function () { if (presenter && !presenter.closed) presenter.close(); });

  /* =========================================================
     Canvas animations — run only while their scene is visible
     ========================================================= */
  var Canvases = (function () {
    var registry = {};
    var active = null, raf = 0, last = 0;

    function loop(now) {
      if (!active) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      active.update(dt, now / 1000); active.draw(now / 1000);
      raf = requestAnimationFrame(loop);
    }
    return {
      register: function (id, obj) { registry[id] = obj; },
      start: function (scene, instant) {
        var o = registry[scene.dataset.id]; if (!o) return;
        if (active && active !== o) this.stop();
        active = o; o.enter(parseInt(scene.dataset.at || '1', 10), !!instant);
        cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop);
      },
      stop: function (scene) {
        if (scene && registry[scene.dataset.id] !== active) return;
        active = null; cancelAnimationFrame(raf);
      },
      step: function (scene, step) { var o = registry[scene.dataset.id]; if (o && o.step) o.step(step); }
    };
  })();

  /* --- RENEWAL: queue → flow --- */
  (function () {
    var cv = $('.renewal canvas.flow'); if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = 860, H = 700, S = cv.width / W;
    var wallX = 700, laneY = [139, 257, 375, 493];
    var mode = 'jam', ps = [], spawnAcc = 0, gates = [];
    var GOLD = [207, 174, 107], RED = [227, 38, 46], WHITE = [245, 242, 234];

    function setGates() {
      gates = mode === 'jam' ? [{ y: 350, last: -9, iv: 0.7 }] : laneY.map(function (y) { return { y: y, last: -9, iv: 0.12 }; });
      ps.forEach(function (p) { if (p.st === 0) p.g = nearest(p.y); });
    }
    function nearest(y) { var bi = 0, bd = 1e9; gates.forEach(function (g, i) { var d = Math.abs(g.y - y); if (d < bd) { bd = d; bi = i; } }); return bi; }
    function spawn() {
      var y = 70 + Math.random() * (H - 140);
      ps.push({ x: -12, y: y, vx: 0, vy: 0, st: 0, g: nearest(y), sp: 95 + Math.random() * 35, dens: 0 });
    }
    var T = 0;
    function update(dt) {
      T += dt;
      var rate = mode === 'jam' ? 3.4 : 3.6;
      spawnAcc += dt * rate;
      var waiting = ps.filter(function (p) { return p.st === 0; }).length;
      while (spawnAcc > 1) { spawnAcc -= 1; if (waiting < 110) spawn(); }
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (p.st === 1) { p.x += 170 * dt; p.y += (gates[p.g] ? (gates[p.g].y - p.y) : 0) * 3 * dt; continue; }
        var g = gates[p.g] || gates[0];
        var dx = wallX - p.x, dy = g.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var ax = dx / d * p.sp, ay = dy / d * p.sp;
        var n = 0;
        for (var j = 0; j < ps.length; j++) {
          if (j === i) continue; var q = ps[j]; if (q.st !== 0) continue;
          var rx = p.x - q.x, ry = p.y - q.y, r2 = rx * rx + ry * ry;
          if (r2 < 576 && r2 > 0.01) { var r = Math.sqrt(r2), f = (24 - r) / 24; ax += rx / r * f * 520; ay += ry / r * f * 520; }
          if (r2 < 1300) n++;
        }
        p.dens += (n - p.dens) * Math.min(1, dt * 4);
        p.vx += (ax - p.vx) * Math.min(1, dt * 6); p.vy += (ay - p.vy) * Math.min(1, dt * 6);
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.y = Math.max(20, Math.min(H - 20, p.y));
        if (p.x > wallX - 11) {
          if (Math.abs(p.y - g.y) < 13 && T - g.last > g.iv) { g.last = T; p.st = 1; p.x = wallX + 2; }
          else { p.x = wallX - 11; p.vx = Math.min(0, p.vx); }
        }
      }
      ps = ps.filter(function (p) { return p.x < W + 20; });
    }
    function mix(a, b, t) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')'; }
    function draw() {
      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // wall with gates
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 3;
      var ys = [24].concat(gates.reduce(function (a, g) { return a.concat([g.y - 14, g.y + 14]); }, [])).concat([H - 24]);
      if (mode === 'jam') {
        for (var k = 0; k < ys.length; k += 2) { ctx.beginPath(); ctx.moveTo(wallX, ys[k]); ctx.lineTo(wallX, ys[k + 1]); ctx.stroke(); }
      }
      gates.forEach(function (g) {
        ctx.fillStyle = mode === 'jam' ? 'rgba(227,38,46,.9)' : 'rgba(207,174,107,.9)';
        ctx.fillRect(wallX - 2, g.y - 14, 6, 28);
        if (mode === 'flow') { ctx.strokeStyle = 'rgba(207,174,107,.25)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.beginPath(); ctx.moveTo(0, g.y); ctx.lineTo(W, g.y); ctx.stroke(); ctx.setLineDash([]); }
      });
      ps.forEach(function (p) {
        var t = Math.max(0, Math.min(1, (p.dens - 1) / 5));
        ctx.fillStyle = p.st === 1 || mode === 'flow' ? mix(GOLD, WHITE, .5) : mix(GOLD, RED, t);
        ctx.beginPath(); ctx.arc(p.x, p.y, 8.5, 0, 6.2832); ctx.fill();
      });
      if (mode === 'jam') {
        var crowd = ps.filter(function (p) { return p.st === 0 && p.x > wallX - 160; }).length;
        ctx.font = '700 22px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif'; ctx.fillStyle = 'rgba(227,38,46,.95)'; ctx.textAlign = 'right';
        ctx.fillText('混雑のイメージ', W - 10, 40);
      }
    }
    Canvases.register('renewal', {
      enter: function (step) { mode = step >= 2 ? 'flow' : 'jam'; ps = []; T = 0; setGates(); for (var i = 0; i < (mode === 'jam' ? 300 : 60); i++) update(1 / 16); draw(); },
      step: function (step) {
        var m = step >= 2 ? 'flow' : 'jam'; if (m === mode) return;
        mode = m; setGates();
        if (m === 'jam' && ps.filter(function (p) { return p.st === 0; }).length < 20) { for (var i = 0; i < 300; i++) update(1 / 16); }
      },
      update: update, draw: draw
    });
  })();

  /* --- TOGETHER: 新宿映画圏 network --- */
  (function () {
    var cv = $('.together canvas.net'); if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = 980, H = 820, S = cv.width / W;
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    var hub = { x: 420, y: 430, r: 16, hub: true, label: 'TOHOシネマズ新宿', sub: '街の入口' };
    var cats = [
      { x: 700, y: 170, label: 'シネコン' }, { x: 860, y: 420, label: 'ミニシアター' },
      { x: 720, y: 690, label: '名画座' }, { x: 380, y: 740, label: '文化施設' },
      { x: 150, y: 560, label: '商店街・行政' }, { x: 230, y: 180, label: '来街者・訪日客' }
    ];
    var nodes = [hub].concat(cats.map(function (c) { c.r = 9; return c; }));
    for (var i = 0; i < 26; i++) nodes.push({ x: 60 + rnd() * (W - 120), y: 60 + rnd() * (H - 120), r: 3 + rnd() * 3 });
    nodes.forEach(function (n, k) { n.ph = rnd() * 6.28; n.bx = n.x; n.by = n.y; n.k = k; });
    var edges = [];
    function addEdge(a, b) { if (a === b) return; if (edges.some(function (e) { return (e.a === a && e.b === b) || (e.a === b && e.b === a); })) return; edges.push({ a: a, b: b }); }
    for (var c = 1; c <= cats.length; c++) addEdge(0, c);
    for (var c2 = 1; c2 <= cats.length; c2++) addEdge(c2, c2 === cats.length ? 1 : c2 + 1);
    nodes.forEach(function (n, a) {
      if (a <= cats.length) return;
      var ds = nodes.map(function (m, b) { return { b: b, d: Math.hypot(m.bx - n.bx, m.by - n.by) }; }).sort(function (x, y) { return x.d - y.d; });
      addEdge(a, ds[1].b); addEdge(a, ds[2].b);
    });
    edges.forEach(function (e) {
      var A = nodes[e.a], B = nodes[e.b];
      var dh = Math.min(Math.hypot(A.bx - hub.bx, A.by - hub.by), Math.hypot(B.bx - hub.bx, B.by - hub.by));
      e.t0 = 0.3 + dh / 520; e.hot = e.a === 0 || e.b === 0;
    });
    var pulses = [], tIn = 0, acc = 0, hover = -1, stepNow = 1;
    function nodeAt(e) {
      var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
      var best = -1, bd = 40;
      nodes.forEach(function (n, k) { var d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = k; } });
      return best;
    }
    cv.addEventListener('pointermove', function (e) { hover = nodeAt(e); cv.style.cursor = hover >= 0 ? 'pointer' : 'default'; });
    cv.addEventListener('pointerleave', function () { hover = -1; });
    cv.addEventListener('click', function (e) {
      var k = nodeAt(e); if (k < 0) return;
      nodes[k].flash = 1;
      edges.forEach(function (ed) { if (ed.a === k || ed.b === k) pulses.push({ e: ed, p: 0, hop: 1, from: k }); });
    });
    // embers for the closing card
    var ecv = $('.together canvas.embers'), ectx = ecv.getContext('2d'), embers = [];
    var endEl = $('.together .end'), sweepT = -1;
    function setSp(v) { endEl.style.setProperty('--sp', v.toFixed(2) + '%'); }
    function openNow() { sweepT = -1; setSp(0); endEl.classList.add('opened'); }
    function closeEnd() { sweepT = -1; setSp(50); endEl.classList.remove('opened'); }
    function emberUpdate(dt) {
      while (embers.length < 110) embers.push({ x: Math.random() * 1920, y: 1080 + Math.random() * 400, v: 40 + Math.random() * 90, r: 1 + Math.random() * 2.6, ph: Math.random() * 6.28, life: 0 });
      embers.forEach(function (m) { m.y -= m.v * dt; m.x += Math.sin(m.ph + m.y / 90) * 14 * dt; m.life += dt; });
      embers = embers.filter(function (m) { return m.y > -20; });
    }
    function emberDraw(t) {
      ectx.clearRect(0, 0, 1920, 1080);
      embers.forEach(function (m) {
        var a = Math.min(1, m.life / .8) * (0.45 + 0.55 * Math.abs(Math.sin(t * 3 + m.ph))) * Math.min(1, m.y / 500);
        var g = ectx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
        g.addColorStop(0, 'rgba(255,190,120,' + a + ')'); g.addColorStop(.4, 'rgba(255,90,50,' + (a * .6) + ')'); g.addColorStop(1, 'rgba(227,38,46,0)');
        ectx.fillStyle = g; ectx.beginPath(); ectx.arc(m.x, m.y, m.r * 4, 0, 6.2832); ectx.fill();
      });
    }
    function update(dt, t) {
      if (stepNow >= 2) {
        if (sweepT >= 0) {
          sweepT += dt;
          var p = Math.max(0, Math.min(1, (sweepT - 0.9) / 1.6));
          var e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          setSp(50 - 50 * e);
          if (p >= 1) { sweepT = -1; endEl.classList.add('opened'); }
        }
        emberUpdate(dt); return;
      }
      tIn += dt; acc += dt;
      nodes.forEach(function (n) { if (n.flash) n.flash = Math.max(0, n.flash - dt * 1.2); });
      nodes.forEach(function (n) { n.x = n.bx + Math.sin(t * .5 + n.ph) * (n.hub ? 2 : 5); n.y = n.by + Math.cos(t * .4 + n.ph) * (n.hub ? 2 : 5); });
      if (acc > 0.28 && tIn > 1.4) {
        acc = 0;
        var e = edges[Math.floor(Math.random() * cats.length)];
        pulses.push({ e: e, p: 0, fwd: true, hop: 0 });
      }
      pulses.forEach(function (p) { p.p += dt * 0.9; });
      pulses = pulses.filter(function (p) {
        if (p.p < 1) return true;
        if (p.hop < 1) { // continue from category node to a neighbour
          var from = p.e.a === 0 ? p.e.b : p.e.a;
          var nx = edges.filter(function (e) { return (e.a === from || e.b === from) && !e.hot; });
          if (nx.length) { var e2 = nx[Math.floor(Math.random() * nx.length)]; p.e = e2; p.from = from; p.p = 0; p.hop++; return true; }
        }
        return false;
      });
    }
    function draw(t) {
      if (stepNow >= 2) { emberDraw(t); return; }
      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.clearRect(0, 0, W, H);
      edges.forEach(function (e) {
        var k = Math.max(0, Math.min(1, (tIn - e.t0) / 0.8)); if (k <= 0) return;
        var A = nodes[e.a], B = nodes[e.b];
        var lit = hover >= 0 && (e.a === hover || e.b === hover);
        ctx.strokeStyle = lit ? 'rgba(255,225,170,' + (.9 * k) + ')' : e.hot ? 'rgba(227,38,46,' + (.55 * k) + ')' : 'rgba(207,174,107,' + (.22 * k) + ')';
        ctx.lineWidth = lit ? 3 : e.hot ? 2 : 1.2;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k); ctx.stroke();
      });
      pulses.forEach(function (p) {
        var a = p.from !== undefined ? p.from : 0, b = p.e.a === a ? p.e.b : p.e.a;
        var A = nodes[a], B = nodes[b];
        var x = A.x + (B.x - A.x) * p.p, y = A.y + (B.y - A.y) * p.p;
        var gr = ctx.createRadialGradient(x, y, 0, x, y, 14);
        gr.addColorStop(0, 'rgba(255,230,190,.95)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 14, 0, 6.2832); ctx.fill();
      });
      nodes.forEach(function (n, k) {
        var appear = Math.max(0, Math.min(1, (tIn - (n.hub ? 0.1 : 0.2 + k * 0.03)) / 0.5)); if (appear <= 0) return;
        if (n.hub) {
          var pr = 1 + Math.sin(t * 2.4) * .12;
          var g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 80 * pr);
          g.addColorStop(0, 'rgba(227,38,46,.55)'); g.addColorStop(1, 'rgba(227,38,46,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, 80 * pr, 0, 6.2832); ctx.fill();
          ctx.fillStyle = '#e3262e';
        } else ctx.fillStyle = n.label ? 'rgba(207,174,107,' + appear + ')' : 'rgba(245,242,234,' + (.45 * appear) + ')';
        var big = (k === hover ? 1.7 : 1) + (n.flash || 0) * 1.2;
        if (k === hover || n.flash) {
          var hg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 46 * big);
          hg.addColorStop(0, 'rgba(255,220,160,.45)'); hg.addColorStop(1, 'rgba(255,220,160,0)');
          var keep = ctx.fillStyle; ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(n.x, n.y, 46 * big, 0, 6.2832); ctx.fill(); ctx.fillStyle = keep;
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (0.5 + 0.5 * appear) * big, 0, 6.2832); ctx.fill();
        if (n.label) {
          ctx.globalAlpha = appear;
          ctx.textAlign = 'center';
          ctx.font = (n.hub ? '900 30px' : '700 24px') + ' "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
          ctx.fillStyle = n.hub ? '#ffffff' : '#ecd49c';
          ctx.fillText(n.label, n.x, n.y + (n.hub ? -34 : -20));
          if (n.sub) { ctx.font = '700 22px "Noto Sans JP", sans-serif'; ctx.fillStyle = '#ff5a60'; ctx.fillText(n.sub, n.x, n.y + 50); }
          ctx.globalAlpha = 1;
        }
      });
    }
    Canvases.register('together', {
      enter: function (step, instant) { stepNow = step; tIn = instant ? 5 : 0; pulses = []; embers = []; if (step >= 2) openNow(); else closeEnd(); },
      step: function (step) {
        var was = stepNow; stepNow = step;
        if (step < 2) { ectx.clearRect(0, 0, 1920, 1080); closeEnd(); }
        else if (was < 2) { if (reduced) openNow(); else { closeEnd(); sweepT = 0; } }
      },
      update: update, draw: draw
    });
  })();

  /* --- LEGACY: THEN / NOW slider --- */
  (function () {
    var sc = $('.legacy'); if (!sc) return;
    var ba = $('.ba', sc), knob = $('.knob', sc);
    var anim = false, drag = false, t = 0;
    function set(v) { ba.style.setProperty('--split', v.toFixed(2) + '%'); }
    function pct(x) { var r = ba.getBoundingClientRect(); return (x - r.left) / r.width * 100; }
    knob.addEventListener('pointerdown', function (e) { drag = true; anim = false; knob.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
    knob.addEventListener('pointermove', function (e) { if (drag) set(Math.max(6, Math.min(94, pct(e.clientX)))); });
    knob.addEventListener('pointerup', function () { drag = false; });
    knob.addEventListener('pointercancel', function () { drag = false; });
    Canvases.register('legacy', {
      enter: function (step, instant) { if (instant || reduced) { anim = false; set(50); } else { anim = true; t = 0; set(100); } },
      update: function (dt) {
        if (!anim) return;
        t += dt; var p = Math.max(0, Math.min(1, (t - 0.6) / 2.0));
        var e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        set(100 - 50 * e); if (p >= 1) anim = false;
      },
      draw: function () {}
    });
  })();

  /* ---------------- boot ---------------- */
  fit();
  function boot() {
    var m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash || '');
    if (m) { goto(parseInt(m[1], 10) - 1, parseInt(m[2] || '1', 10)); }
    else afterChange();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot); else boot();
  window.__deck = { next: next, prev: prev, goto: goto, state: state, openScript: openScript };
})();
