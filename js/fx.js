/* ============================================================
   fx.js — OVERDOSE // LIQUID LAB
   The immersion layer. Shared by index / kitchen / admin.

   Everything here is additive and defensive: each module no-ops
   if its hook elements are missing, so the same file can be
   dropped on any page. It never owns app state.

   Public surface (window.OD):
     OD.energy(x)        -> pump the background shader (0..1 spike)
     OD.boot(onDone)     -> run the boot sequence
     OD.scramble(el,txt) -> glitch-decode text into an element
     OD.magnet(el)       -> make an element cursor-magnetic
     OD.reveal()         -> (re)scan the DOM for [data-reveal]
     OD.tilt()           -> (re)scan the DOM for [data-tilt]
     OD.toast(msg,kind)  -> HUD toast
     OD.ripple(el)       -> attach a press ripple
   ============================================================ */
(function () {
  'use strict';

  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE = window.matchMedia('(hover:none), (pointer:coarse)').matches;
  const OD = (window.OD = window.OD || {});
  OD.reduceMotion = RM;
  OD.coarse = COARSE;
  if (RM) document.documentElement.classList.add('no-motion');
  if (COARSE) document.documentElement.classList.add('is-touch');

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ==========================================================
     1. WEBGL PLASMA FIELD
     A domain-warped fbm shader painted behind everything. It
     reacts to the pointer and to an "energy" value the app
     pumps whenever something happens (add to cart, order sent,
     new ticket in the kitchen).
     Falls back silently to the CSS aurora if WebGL is missing.
     ========================================================== */
  const Field = (function () {
    let gl, prog, raf, canvas;
    let uRes, uTime, uMouse, uEnergy, uScroll, uDark;
    let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5;
    let energy = 0, energyTarget = 0;
    let scroll = 0;
    // Theme mix for the shader. Defaults to 0 (light) so pages that never
    // set data-theme — kitchen/ and admin/ — are unaffected by this module.
    let dark = 0, darkTarget = 0;
    let running = false;
    let t0 = performance.now();

    const VERT = `
      attribute vec2 p;
      void main(){ gl_Position = vec4(p, 0.0, 1.0); }
    `;

    const FRAG = `
      precision highp float;
      uniform vec2  u_res;
      uniform float u_time;
      uniform vec2  u_mouse;
      uniform float u_energy;
      uniform float u_scroll;
      uniform float u_dark;   // 0 = light theme, 1 = dark theme

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }

      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x),
                   mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
      }

      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for(int i = 0; i < 5; i++){
          v += a * noise(p);
          p = mat2(1.6,1.2,-1.2,1.6) * p;
          a *= 0.5;
        }
        return v;
      }

      void main(){
        vec2 res = u_res;
        vec2 p = (gl_FragCoord.xy - 0.5*res) / min(res.x, res.y);
        vec2 m = (u_mouse * res - 0.5*res) / min(res.x, res.y);

        float t = u_time * 0.045;
        float e = u_energy;

        // domain warping — the "liquid" look
        vec2 q = vec2(fbm(p*1.35 + t), fbm(p*1.35 + vec2(5.2,1.3) - t*0.8));
        vec2 r = vec2(fbm(p*1.35 + 2.6*q + vec2(1.7,9.2) + t*1.3),
                      fbm(p*1.35 + 2.6*q + vec2(8.3,2.8) - t*1.1));
        float f = fbm(p*1.35 + 2.8*r + u_scroll*0.35);

        // pointer heat + energy bloom
        float md = length(p - m);
        f += 0.30 * exp(-md*2.6) * (0.55 + e*1.6);
        f += e * 0.10;

        // Shared structure — the expensive fbm work above is computed once
        // and feeds both palettes.
        float fil = abs(sin((f + t*0.6) * 22.0));   // filament detail
        float fal = pow(1.0 - fil, 26.0);
        float d   = length(p) * 0.92;               // radial falloff

        // ---- LIGHT: settles back toward the cream base so the field reads
        //      as a soft warm wash rather than a bloom on black ----
        vec3 baseL  = vec3(0.965, 0.947, 0.902);
        vec3 emberL = vec3(0.760, 0.325, 0.051);
        vec3 hotL   = vec3(0.722, 0.071, 0.247);
        vec3 acidL  = vec3(0.369, 0.478, 0.071);

        vec3 colL = mix(baseL, emberL, smoothstep(0.34, 0.86, f) * 0.5);
        colL = mix(colL, hotL, smoothstep(0.56, 1.02, f) * 0.4);
        colL += acidL * smoothstep(0.82, 1.05, f) * (0.07 + e*0.22);
        colL = mix(colL, emberL, fal * 0.1 * (0.4 + e));
        colL = mix(baseL, colL, 0.55 + 0.45 * smoothstep(0.18, 0.95, f));
        colL = mix(baseL, colL, smoothstep(1.55, 0.25, d));

        // ---- DARK: multiplies down to near-black so the ember/hot bloom
        //      glows out of the darkness ----
        vec3 baseD  = vec3(0.016, 0.012, 0.011);
        vec3 emberD = vec3(1.00, 0.34, 0.06);
        vec3 hotD   = vec3(1.00, 0.12, 0.33);
        vec3 acidD  = vec3(0.66, 1.00, 0.18);

        vec3 colD = mix(baseD, emberD, smoothstep(0.34, 0.86, f));
        colD = mix(colD, hotD, smoothstep(0.56, 1.02, f) * 0.85);
        colD += acidD * smoothstep(0.82, 1.05, f) * (0.16 + e*0.5);
        colD += emberD * fal * 0.16 * (0.4 + e);
        colD *= 0.42 + 0.58 * (0.55 + e*0.75);
        colD *= smoothstep(1.55, 0.20, d);

        // Crossfade. u_dark is eased on the JS side, so flipping the theme
        // dissolves the field between the two looks instead of popping.
        vec3 col = mix(colL, colD, u_dark);

        // gentle dither to kill banding — dark gradients need more of it
        col += (hash(gl_FragCoord.xy + u_time) - 0.5) * mix(0.006, 0.012, u_dark);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[fx] shader:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, COARSE ? 1.25 : 1.6);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function frame() {
      if (!running) return;
      const now = performance.now();
      const time = (now - t0) / 1000;

      mx = lerp(mx, tx, 0.06);
      my = lerp(my, ty, 0.06);
      energyTarget *= 0.955;
      energy = lerp(energy, energyTarget, 0.09);
      // ~0.4s crossfade when the theme flips; snaps under reduced motion
      dark = RM ? darkTarget : lerp(dark, darkTarget, 0.10);
      if (Math.abs(dark - darkTarget) < 0.001) dark = darkTarget;

      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      scroll = lerp(scroll, max > 0 ? h.scrollTop / max : 0, 0.08);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mx, 1.0 - my);
      gl.uniform1f(uEnergy, energy);
      gl.uniform1f(uScroll, scroll);
      gl.uniform1f(uDark, dark);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    }

    function init() {
      canvas = document.getElementById('od-field');
      if (!canvas) return false;
      try {
        gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }) ||
             canvas.getContext('experimental-webgl');
      } catch (e) { gl = null; }
      if (!gl) { document.documentElement.classList.add('no-webgl'); return false; }

      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) { document.documentElement.classList.add('no-webgl'); return false; }

      prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        document.documentElement.classList.add('no-webgl');
        return false;
      }
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
      ]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      uRes = gl.getUniformLocation(prog, 'u_res');
      uTime = gl.getUniformLocation(prog, 'u_time');
      uMouse = gl.getUniformLocation(prog, 'u_mouse');
      uEnergy = gl.getUniformLocation(prog, 'u_energy');
      uScroll = gl.getUniformLocation(prog, 'u_scroll');
      uDark = gl.getUniformLocation(prog, 'u_dark');

      // Adopt whatever theme the pre-paint script already settled on, with
      // no crossfade — the first frame should just be correct.
      dark = darkTarget =
        document.documentElement.getAttribute('data-theme') === 'dark' ? 1 : 0;

      resize();
      window.addEventListener('resize', resize, { passive: true });
      window.addEventListener('pointermove', (e) => {
        tx = e.clientX / window.innerWidth;
        ty = e.clientY / window.innerHeight;
      }, { passive: true });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { running = false; cancelAnimationFrame(raf); }
        else if (!running) { running = true; raf = requestAnimationFrame(frame); }
      });

      document.documentElement.classList.add('has-webgl');
      running = true;
      raf = requestAnimationFrame(frame);
      return true;
    }

    return {
      init,
      pump(v) { energyTarget = clamp(energyTarget + (v == null ? 0.55 : v), 0, 1.6); },
      setTheme(isDark) {
        darkTarget = isDark ? 1 : 0;
        // Nothing is drawing while the tab is hidden, so land on the value
        // immediately rather than crossfading from a stale frame on resume.
        if (!running) dark = darkTarget;
      }
    };
  })();

  OD.energy = function (v) { Field.pump(v); };

  /* ==========================================================
     2. RETICLE CURSOR
     A crosshair that snaps to interactive targets and prints a
     live label for whatever it is hovering.
     ========================================================== */
  function initCursor() {
    if (COARSE || RM) return;
    const wrap = document.getElementById('od-cursor');
    if (!wrap) return;
    document.documentElement.classList.add('reticle');
    const ring = wrap.querySelector('.cur-ring');
    const dot = wrap.querySelector('.cur-dot');
    const label = wrap.querySelector('.cur-label');

    let px = innerWidth / 2, py = innerHeight / 2, rx = px, ry = py;
    let snapping = null;

    window.addEventListener('pointermove', (e) => {
      px = e.clientX; py = e.clientY;
      dot.style.transform = `translate(${px}px, ${py}px) translate(-50%,-50%)`;
    }, { passive: true });

    (function loop() {
      if (snapping) {
        const r = snapping.getBoundingClientRect();
        if (r.width) {
          rx = lerp(rx, r.left + r.width / 2, 0.22);
          ry = lerp(ry, r.top + r.height / 2, 0.22);
        } else { snapping = null; }
      } else {
        rx = lerp(rx, px, 0.19);
        ry = lerp(ry, py, 0.19);
      }
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
      label.style.transform = `translate(${px}px, ${py}px)`;
      requestAnimationFrame(loop);
    })();

    const SEL = 'a, button, input, textarea, select, [role="button"], [data-cursor]';
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest && e.target.closest(SEL);
      if (!t) return;
      wrap.classList.add('is-hot');
      const txt = t.dataset.cursor || t.getAttribute('aria-label') ||
        (t.textContent || '').trim().slice(0, 22) || 'ACTIVATE';
      label.textContent = txt.toUpperCase();
      wrap.classList.toggle('is-label', !!txt);
      if (t.dataset.cursorSnap !== undefined) snapping = t;
    });
    document.addEventListener('pointerout', (e) => {
      const t = e.target.closest && e.target.closest(SEL);
      if (!t) return;
      wrap.classList.remove('is-hot', 'is-label');
      if (snapping === t) snapping = null;
    });
    document.addEventListener('pointerdown', () => wrap.classList.add('is-down'));
    document.addEventListener('pointerup', () => wrap.classList.remove('is-down'));
  }

  /* ==========================================================
     3. MAGNETIC ELEMENTS
     ========================================================== */
  function magnet(el, strength) {
    if (COARSE || RM || el.dataset.magBound) return;
    el.dataset.magBound = '1';
    const s = strength || Number(el.dataset.magnetic) || 0.32;
    let raf2 = null, cx = 0, cy = 0, tX = 0, tY = 0;

    function run() {
      cx = lerp(cx, tX, 0.18);
      cy = lerp(cy, tY, 0.18);
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      if (Math.abs(cx - tX) > 0.1 || Math.abs(cy - tY) > 0.1) raf2 = requestAnimationFrame(run);
      else { el.style.transform = `translate3d(${tX}px, ${tY}px, 0)`; raf2 = null; }
    }
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      tX = (e.clientX - (r.left + r.width / 2)) * s;
      tY = (e.clientY - (r.top + r.height / 2)) * s;
      if (!raf2) raf2 = requestAnimationFrame(run);
    });
    el.addEventListener('pointerleave', () => {
      tX = 0; tY = 0;
      if (!raf2) raf2 = requestAnimationFrame(run);
    });
  }
  OD.magnet = magnet;
  OD.scanMagnets = function () {
    document.querySelectorAll('[data-magnetic]').forEach((el) => magnet(el));
  };

  /* ==========================================================
     4. TEXT SCRAMBLE
     ========================================================== */
  const GLYPHS = '▚▞█▓▒░#%&@$/\\|<>+=*ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function scramble(el, text, dur) {
    if (!el) return;
    const final = text != null ? text : (el.dataset.text || el.textContent);
    el.dataset.text = final;
    if (RM) { el.textContent = final; return; }
    const D = dur || 620;
    const start = performance.now();
    const queue = final.split('').map((c, i) => ({
      c, from: Math.random() * 0.5, to: 0.5 + Math.random() * 0.5
    }));
    function tick(now) {
      const t = clamp((now - start) / D, 0, 1);
      let out = '';
      for (let i = 0; i < queue.length; i++) {
        const q = queue[i];
        if (t >= q.to) out += q.c;
        else if (t >= q.from) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        else out += q.c === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = final;
    }
    requestAnimationFrame(tick);
  }
  OD.scramble = scramble;

  function initScrambleOnView() {
    const els = document.querySelectorAll('[data-scramble]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        scramble(en.target, en.target.textContent.trim(), 700);
      });
    }, { threshold: 0.5 });
    els.forEach((el) => io.observe(el));
    document.addEventListener('pointerenter', () => {}, true);
    els.forEach((el) => el.addEventListener('pointerenter', () => scramble(el, el.dataset.text, 420)));
  }

  /* ==========================================================
     5. SPLIT-TEXT + SCROLL REVEAL
     ========================================================== */
  function splitChars() {
    document.querySelectorAll('[data-split]:not([data-split-done])').forEach((el) => {
      el.dataset.splitDone = '1';
      const words = el.textContent.trim().split(/\s+/);
      el.textContent = '';
      words.forEach((w, wi) => {
        const wrap = document.createElement('span');
        wrap.className = 'sp-w';
        w.split('').forEach((ch, ci) => {
          const s = document.createElement('span');
          s.className = 'sp-c';
          s.textContent = ch;
          s.style.setProperty('--i', wi * 3 + ci);
          wrap.appendChild(s);
        });
        el.appendChild(wrap);
        if (wi < words.length - 1) el.appendChild(document.createTextNode(' '));
      });
    });
  }

  let revealIO = null;
  function reveal() {
    const els = document.querySelectorAll('[data-reveal]:not([data-rev-bound])');
    if (!els.length) return;
    if (RM || !('IntersectionObserver' in window)) {
      els.forEach((el) => { el.dataset.revBound = '1'; el.classList.add('in'); });
      return;
    }
    if (!revealIO) {
      revealIO = new IntersectionObserver((ents) => {
        ents.forEach((en) => {
          if (!en.isIntersecting) return;
          revealIO.unobserve(en.target);
          const sibs = Array.prototype.slice.call(en.target.parentElement.children);
          const idx = Math.min(sibs.indexOf(en.target), 9);
          en.target.style.transitionDelay = (idx * 55) + 'ms';
          en.target.classList.add('in');
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    }
    els.forEach((el) => { el.dataset.revBound = '1'; revealIO.observe(el); });
  }
  OD.reveal = reveal;

  /* ==========================================================
     6. 3D TILT + POINTER GLOW
     ========================================================== */
  function bindTilt(card) {
    if (RM || COARSE || card.dataset.tiltBound) return;
    card.dataset.tiltBound = '1';
    const max = Number(card.dataset.tilt) || 7;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--rx', ((py - 0.5) * -max).toFixed(2) + 'deg');
      card.style.setProperty('--ry', ((px - 0.5) * max).toFixed(2) + 'deg');
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      card.classList.add('tilting');
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.classList.remove('tilting');
    });
  }
  OD.tilt = function () { document.querySelectorAll('[data-tilt]').forEach(bindTilt); };

  /* ==========================================================
     7. RIPPLE
     ========================================================== */
  OD.ripple = function (btn) {
    if (!btn || btn.dataset.rippleBound) return;
    btn.dataset.rippleBound = '1';
    btn.addEventListener('pointerdown', (e) => {
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 1.1;
      const s = document.createElement('span');
      s.className = 'od-ripple';
      s.style.width = s.style.height = size + 'px';
      s.style.left = (e.clientX - r.left - size / 2) + 'px';
      s.style.top = (e.clientY - r.top - size / 2) + 'px';
      btn.appendChild(s);
      setTimeout(() => s.remove(), 620);
    });
  };

  /* ==========================================================
     8. HUD TOASTS
     ========================================================== */
  OD.toast = function (msg, kind) {
    let stack = document.querySelector('.od-toasts');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'od-toasts';
      document.body.appendChild(stack);
    }
    const t = document.createElement('div');
    t.className = 'od-toast' + (kind ? ' is-' + kind : '');
    t.innerHTML =
      '<span class="tk"></span><span class="tm"></span><span class="tbar"></span>';
    t.querySelector('.tm').textContent = msg;
    stack.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 380);
    }, 2600);
  };

  /* ==========================================================
     9. BOOT SEQUENCE
     ========================================================== */
  OD.boot = function (onDone) {
    const el = document.getElementById('od-boot');
    if (!el) { document.body.classList.remove('booting'); if (onDone) onDone(); return; }
    const bar = el.querySelector('.boot-bar i');
    const pct = el.querySelector('.boot-pct');
    const logEl = el.querySelector('.boot-log');
    const LINES = [
      'MOUNTING LIQUID SUBSTRATE',
      'CALIBRATING SUGAR MATRIX',
      'PRESSURISING BREW LINE',
      'SPOOLING FLAVOUR SHADERS',
      'DOSE THRESHOLD :: NOMINAL'
    ];

    function done() {
      el.classList.add('out');
      document.body.classList.remove('booting');
      setTimeout(() => { el.remove(); }, 900);
      // Entrance animations are held back until the boot curtain lifts so
      // they actually get seen instead of playing behind it.
      splitChars();
      reveal();
      document.dispatchEvent(new CustomEvent('od:booted'));
      if (onDone) onDone();
    }

    if (RM) { done(); return; }

    let i = 0;
    const step = () => {
      if (i < LINES.length && logEl) {
        const row = document.createElement('div');
        row.className = 'boot-line';
        row.innerHTML = '<b>OK</b><span></span>';
        row.querySelector('span').textContent = LINES[i];
        logEl.appendChild(row);
      }
      i++;
      if (i <= LINES.length) setTimeout(step, 175);
    };
    step();

    const DUR = 1180;
    const t0 = performance.now();
    (function tick(now) {
      const t = clamp((now - t0) / DUR, 0, 1);
      const eased = 1 - Math.pow(1 - t, 2.4);
      if (bar) bar.style.transform = `scaleX(${eased})`;
      if (pct) pct.textContent = String(Math.round(eased * 100)).padStart(3, '0');
      if (t < 1) requestAnimationFrame(tick);
      else setTimeout(done, 260);
    })(t0);
  };

  /* ==========================================================
     10. COMMAND PALETTE  (⌘K / Ctrl+K)
     ========================================================== */
  function initPalette() {
    const el = document.getElementById('od-palette');
    if (!el) return;
    const input = el.querySelector('input');
    const list = el.querySelector('.pal-list');
    let items = [];
    let cursor = 0;

    function commands() {
      const base = (window.OD_COMMANDS || []).slice();
      return base;
    }

    function render(filter) {
      const f = (filter || '').toLowerCase().trim();
      items = commands().filter((c) =>
        !f || (c.label + ' ' + (c.hint || '') + ' ' + (c.keywords || '')).toLowerCase().includes(f)
      );
      cursor = 0;
      list.innerHTML = items.length
        ? items.map((c, i) => `
            <button class="pal-item${i === 0 ? ' sel' : ''}" data-i="${i}">
              <span class="pal-ico">${c.icon || '›'}</span>
              <span class="pal-label">${c.label}</span>
              <span class="pal-hint">${c.hint || ''}</span>
            </button>`).join('')
        : '<div class="pal-empty">NO MATCHING COMMAND</div>';
      list.querySelectorAll('.pal-item').forEach((b) => {
        b.addEventListener('click', () => run(Number(b.dataset.i)));
      });
    }

    function move(d) {
      const btns = list.querySelectorAll('.pal-item');
      if (!btns.length) return;
      btns[cursor] && btns[cursor].classList.remove('sel');
      cursor = (cursor + d + btns.length) % btns.length;
      btns[cursor].classList.add('sel');
      btns[cursor].scrollIntoView({ block: 'nearest' });
    }

    function run(i) {
      const c = items[i];
      close();
      if (c && typeof c.run === 'function') setTimeout(c.run, 120);
    }

    function open() {
      el.classList.add('open');
      document.body.classList.add('pal-open');
      input.value = '';
      render('');
      setTimeout(() => input.focus(), 40);
      OD.energy(0.4);
    }
    function close() {
      el.classList.remove('open');
      document.body.classList.remove('pal-open');
      input.blur();
    }
    OD.openPalette = open;
    OD.closePalette = close;

    input.addEventListener('input', () => render(input.value));
    el.addEventListener('click', (e) => { if (e.target === el) close(); });

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); el.classList.contains('open') ? close() : open(); return; }
      if (!el.classList.contains('open')) return;
      if (k === 'escape') { e.preventDefault(); close(); }
      else if (k === 'arrowdown') { e.preventDefault(); move(1); }
      else if (k === 'arrowup') { e.preventDefault(); move(-1); }
      else if (k === 'enter') { e.preventDefault(); run(cursor); }
    });

    document.querySelectorAll('[data-open-palette]').forEach((b) =>
      b.addEventListener('click', open));
  }

  /* ==========================================================
     11. AMBIENT: marquee duplication, live clock, scroll bar
     ========================================================== */
  function initAmbient() {
    // scroll progress
    const bar = document.getElementById('od-progress');
    if (bar) {
      window.addEventListener('scroll', () => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        bar.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`;
      }, { passive: true });
    }
    // live clocks
    const clocks = document.querySelectorAll('[data-clock]');
    if (clocks.length) {
      const tickClock = () => {
        const d = new Date();
        const s = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        clocks.forEach((c) => (c.textContent = s));
      };
      tickClock();
      setInterval(tickClock, 1000);
    }
    // duplicate marquee content for a seamless loop
    document.querySelectorAll('[data-marquee]').forEach((m) => {
      if (m.dataset.marqueeDone) return;
      m.dataset.marqueeDone = '1';
      m.innerHTML = m.innerHTML + m.innerHTML;
    });
  }

  /* ==========================================================
     12. PAGE PARALLAX LAYERS  [data-parallax="0.2"]
     ========================================================== */
  function initParallax() {
    if (RM) return;
    const els = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
    if (!els.length) return;
    let ticking = false;
    function update() {
      const y = window.scrollY;
      els.forEach((el) => {
        const s = Number(el.dataset.parallax) || 0.15;
        el.style.transform = `translate3d(0, ${(-y * s).toFixed(1)}px, 0)`;
      });
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ==========================================================
     13. THEME  (light / dark)
     Storefront-only: this module no-ops on any page without a
     [data-theme-toggle] control, so kitchen/ and admin/ stay on
     the light :root palette and never gain the attribute.

     The *initial* theme is applied by a small inline script in
     index.html's <head>, before first paint, so a dark reload
     doesn't flash cream. This module owns everything after that:
     the toggle, persistence, and the shader crossfade.
     ========================================================== */
  const THEME_KEY = 'od-theme';   // kept in sync with the inline <head> script
  let themeMemory = null;         // fallback when localStorage is unavailable

  function persistTheme(name) {
    // Always remember in-memory so the toggle still works for the session
    // even when the write below is refused.
    themeMemory = name;
    try {
      window.localStorage.setItem(THEME_KEY, name);
    } catch (e) {
      /* private mode, blocked storage, cookies off — non-fatal */
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(name) {
    const isDark = name === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Relight the WebGL field. No-ops if WebGL never came up, in which case
    // the CSS aurora fallback carries the theme instead.
    Field.setTheme(isDark);

    // Keep the mobile browser chrome in step with the page.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#050403' : '#F7F2E6');

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(isDark));
      btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
      btn.dataset.cursor = isDark ? 'LIGHTS ON' : 'LIGHTS OUT';
    });

    document.dispatchEvent(new CustomEvent('od:theme', { detail: { theme: name } }));
  }

  OD.theme = currentTheme;
  OD.setTheme = function (name) {
    const t = name === 'dark' ? 'dark' : 'light';
    applyTheme(t);
    persistTheme(t);
  };
  OD.toggleTheme = function () {
    OD.setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  };

  function initTheme() {
    const btns = document.querySelectorAll('[data-theme-toggle]');
    if (!btns.length) return;
    // Sync the control labels and the shader to whatever the pre-paint
    // script already resolved, without re-persisting it.
    applyTheme(currentTheme());
    btns.forEach((b) => b.addEventListener('click', () => {
      OD.toggleTheme();
      OD.energy(0.5);
    }));
  }

  /* ==========================================================
     BOOTSTRAP
     ========================================================== */
  function start() {
    Field.init();
    initTheme();
    initCursor();
    // Pages with a boot curtain defer these until OD.boot() finishes.
    if (!document.getElementById('od-boot')) {
      splitChars();
      reveal();
    }
    OD.tilt();
    OD.scanMagnets();
    initScrambleOnView();
    initPalette();
    initAmbient();
    initParallax();
    document.querySelectorAll('[data-ripple]').forEach(OD.ripple);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
