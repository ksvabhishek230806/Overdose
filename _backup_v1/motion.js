// ============================================================
// motion.js — the 2026 visual/interaction layer.
//
// Everything in here is additive and defensive on purpose: it only
// enhances what app.js / cart.js / menu.js already render, never
// replaces their state or event logic. If an expected element isn't
// on the page (e.g. this script gets reused on a page that doesn't
// have a cart), each piece just no-ops instead of throwing.
//
// Hooks other files call into (kept intentionally small):
//   - menu.js  -> initTiltCards()          after every renderMenu()
//   - app.js   -> positionTabIndicator(el) when the menu tab changes
//                 or the menu page becomes visible
// ============================================================

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduceMotion) document.body.classList.add('no-motion');

/* ================= PRELOADER ================= */
(function preload(){
  const pre = document.getElementById('preloader');
  const fill = document.getElementById('dose-fill');
  const pct = document.getElementById('dose-pct');
  if(!pre) return;

  function finish(){
    pre.classList.add('done');
    document.body.classList.remove('lock');
  }

  if(reduceMotion || !fill){
    finish();
    return;
  }

  const circumference = 2 * Math.PI * 45; // matches r=45 in the SVG
  const dur = 900;
  const start = performance.now();
  function tick(now){
    const t = Math.min(1, (now - start) / dur);
    fill.style.strokeDasharray = String(circumference);
    fill.style.strokeDashoffset = String(circumference - circumference * t);
    if(pct) pct.textContent = Math.round(t * 100) + '%';
    if(t < 1) requestAnimationFrame(tick);
    else setTimeout(finish, 120);
  }
  requestAnimationFrame(tick);
})();

/* ================= CUSTOM CURSOR ================= */
(function cursor(){
  if(reduceMotion || window.matchMedia('(hover:none)').matches) return;
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if(!dot || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;
  window.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
  });
  (function loop(){
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  })();

  const HOVER_SELECTOR = 'a, button, .item-card, input, textarea, select, [role="button"]';
  document.addEventListener('mouseover', e => {
    if(e.target.closest && e.target.closest(HOVER_SELECTOR)) ring.classList.add('hover');
  });
  document.addEventListener('mouseout', e => {
    if(e.target.closest && e.target.closest(HOVER_SELECTOR)) ring.classList.remove('hover');
  });
})();

/* ================= AURORA PARALLAX ================= */
(function aurora(){
  if(reduceMotion) return;
  const wraps = ['blob-wrap-1', 'blob-wrap-2', 'blob-wrap-3'].map(id => document.getElementById(id)).filter(Boolean);
  if(!wraps.length) return;
  const strength = [16, -12, 22];
  window.addEventListener('mousemove', e => {
    const mx = (e.clientX / window.innerWidth - 0.5);
    const my = (e.clientY / window.innerHeight - 0.5);
    wraps.forEach((w, i) => {
      w.style.transform = `translate(${mx * strength[i]}px, ${my * strength[i]}px)`;
    });
  }, { passive: true });
})();

/* ================= HERO PARALLAX TILT ================= */
(function heroTilt(){
  if(reduceMotion) return;
  const el = document.getElementById('hero-parallax');
  if(!el) return;
  window.addEventListener('mousemove', e => {
    const mx = (e.clientX / window.innerWidth - 0.5);
    const my = (e.clientY / window.innerHeight - 0.5);
    el.style.transform = `rotateX(${my * -2.5}deg) rotateY(${mx * 2.5}deg)`;
  }, { passive: true });
})();

/* ================= SCROLL PROGRESS ================= */
(function progress(){
  const bar = document.getElementById('scroll-progress');
  if(!bar) return;
  window.addEventListener('scroll', () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    bar.style.width = pct + '%';
  }, { passive: true });
})();

/* ================= SCROLL REVEAL ([data-reveal]) ================= */
(function reveal(){
  const els = document.querySelectorAll('[data-reveal]');
  if(!els.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if(en.isIntersecting){ en.target.classList.add('in-view'); io.unobserve(en.target); }
    });
  }, { threshold: 0.2 });
  els.forEach(el => io.observe(el));
})();

/* ================= COUNT-UP ([data-count]) ================= */
(function countUp(){
  const nums = document.querySelectorAll('[data-count]');
  if(!nums.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if(!en.isIntersecting) return;
      io.unobserve(en.target);
      const target = Number(en.target.dataset.count);
      const suffix = en.target.dataset.suffix || '';
      if(reduceMotion || !isFinite(target)){
        en.target.textContent = target + suffix;
        return;
      }
      const dur = 1300;
      const start = performance.now();
      function tick(now){
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        en.target.textContent = Math.round(target * eased) + suffix;
        if(t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.4 });
  nums.forEach(n => io.observe(n));
})();

/* ================= SLIDING TAB INDICATOR =================
   Called by app.js: once when the menu tabs first become visible, and
   again on every filterMenu() click. Exposed on window so app.js can
   call it without motion.js needing to know about app.js. */
window.positionTabIndicator = function positionTabIndicator(activeTab){
  const ind = document.getElementById('tab-indicator');
  const container = document.getElementById('tabs');
  if(!ind || !container || !activeTab) return;
  const cRect = container.getBoundingClientRect();
  const tRect = activeTab.getBoundingClientRect();
  if(tRect.width === 0) return; // tabs container is hidden (page not active yet)
  ind.style.width = tRect.width + 'px';
  ind.style.transform = `translateX(${tRect.left - cRect.left - 6}px)`;
};

window.addEventListener('resize', () => {
  const menuPage = document.getElementById('page-menu');
  const activeTab = document.querySelector('.tab.active');
  if(menuPage && menuPage.classList.contains('active') && activeTab){
    window.positionTabIndicator(activeTab);
  }
});

/* ================= 3D TILT + GLOW ON MENU/HERO CARDS =================
   Bound directly to each card rather than delegated, since the customer
   menu only renders once per page load (see menu.js renderMenu()) — cart
   updates only patch .item-controls, they never recreate the card nodes. */
function bindTilt(card){
  if(reduceMotion || card.dataset.tiltBound) return;
  card.dataset.tiltBound = '1';
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rx = (py - 0.5) * -6;
    const ry = (px - 0.5) * 6;
    card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
    card.style.setProperty('--mx', (px * 100) + '%');
    card.style.setProperty('--my', (py * 100) + '%');
  });
  card.addEventListener('mouseleave', () => { card.style.transform = ''; });
}
window.initTiltCards = function initTiltCards(){
  document.querySelectorAll('.item-card').forEach(bindTilt);
};
// Hero side-card gets the same treatment; it's static, so bind once now.
document.addEventListener('DOMContentLoaded', () => {
  const side = document.getElementById('side-card');
  if(side) bindTilt(side);
});

/* ================= FLY-TO-CART MICRO-INTERACTION =================
   Purely decorative: listens for clicks on add-cart-btn elements and
   spawns a small dot that arcs into the floating cart icon. cart.js's
   own listener (bound in menu.js's bindItemControls) still runs
   independently and owns all real cart state — this never touches it. */
function flyToCart(fromEl){
  if(reduceMotion) return;
  const target = document.getElementById('floating-cart-btn');
  if(!target) return;
  const fr = fromEl.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  if(tr.width === 0) return; // cart button not visible for some reason

  const dot = document.createElement('div');
  dot.style.cssText = `position:fixed; z-index:1600; width:12px; height:12px; border-radius:50%;
    background:var(--grad); pointer-events:none; box-shadow:0 0 14px rgba(255,106,26,.7);
    left:${fr.left + fr.width / 2 - 6}px; top:${fr.top + fr.height / 2 - 6}px;`;
  document.body.appendChild(dot);

  const dx = (tr.left + tr.width / 2) - (fr.left + fr.width / 2);
  const dy = (tr.top + tr.height / 2) - (fr.top + fr.height / 2);

  if(!dot.animate){ dot.remove(); return; }
  dot.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx}px, ${dy - 70}px) scale(1.3)`, opacity: 1, offset: 0.6 },
    { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0 }
  ], { duration: 600, easing: 'cubic-bezier(.36,0,.66,1)' }).onfinish = () => dot.remove();
}
document.addEventListener('click', e => {
  const btn = e.target.closest('.add-cart-btn[data-id]');
  if(btn) flyToCart(btn);
});
