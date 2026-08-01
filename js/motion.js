/* ============================================================
   motion.js — customer-page interaction layer
   Runs after app.js. Depends on window.OD (fx.js).
   Everything here is presentational; it never owns cart state.
   ============================================================ */
(function () {
  'use strict';

  const OD = window.OD || {};
  const RM = OD.reduceMotion;

  /* Defer work until the boot curtain has lifted (if there is one). */
  function whenReady(fn) {
    if (!document.body.classList.contains('booting')) { fn(); return; }
    document.addEventListener('od:booted', fn, { once: true });
    // Safety net in case the boot sequence never reports back.
    setTimeout(() => { if (document.body.classList.contains('booting')) return; }, 4000);
  }

  /* ================= COUNT-UP ================= */
  whenReady(function countUp() {
    const nums = document.querySelectorAll('[data-count]');
    if (!nums.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const el = en.target;
        const target = Number(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        if (RM || !isFinite(target)) { el.textContent = target + suffix; return; }
        const dur = 1400, t0 = performance.now();
        (function tick(now) {
          const t = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(target * eased) + suffix;
          if (t < 1) requestAnimationFrame(tick);
          else el.textContent = target + suffix;
        })(t0);
      });
    }, { threshold: 0.4 });
    nums.forEach((n) => io.observe(n));
  });

  /* ================= SLIDING TAB PILL ================= */
  window.positionTabIndicator = function (activeTab) {
    const ind = document.getElementById('tab-indicator');
    const box = document.getElementById('tabs');
    if (!ind || !box || !activeTab) return;
    const b = box.getBoundingClientRect();
    const t = activeTab.getBoundingClientRect();
    if (!t.width) return;
    ind.style.width = t.width + 'px';
    ind.style.transform = `translateX(${t.left - b.left - 5}px)`;
  };
  window.addEventListener('resize', () => {
    const page = document.getElementById('page-menu');
    const tab = document.querySelector('.tab.active');
    if (page && page.classList.contains('active') && tab) window.positionTabIndicator(tab);
  });

  /* ================= FLY-TO-CART ================= */
  function flyToCart(fromEl) {
    if (RM) return;
    const target = document.getElementById('floating-cart-btn');
    if (!target) return;
    const fr = fromEl.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    if (!tr.width) return;

    const dot = document.createElement('div');
    dot.className = 'fly-dot';
    dot.style.left = (fr.left + fr.width / 2 - 6) + 'px';
    dot.style.top = (fr.top + fr.height / 2 - 6) + 'px';
    document.body.appendChild(dot);

    const dx = (tr.left + tr.width / 2) - (fr.left + fr.width / 2);
    const dy = (tr.top + tr.height / 2) - (fr.top + fr.height / 2);
    if (!dot.animate) { dot.remove(); return; }
    dot.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy - 90}px) scale(1.5)`, opacity: 1, offset: 0.58 },
      { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0 }
    ], { duration: 680, easing: 'cubic-bezier(.36,0,.66,1)' }).onfinish = () => dot.remove();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.add-cart-btn[data-id]');
    if (!btn) return;
    flyToCart(btn);
    if (OD.energy) OD.energy(0.75);
    const card = btn.closest('.item-card');
    if (card) { card.classList.remove('hit'); void card.offsetWidth; card.classList.add('hit'); }
  });

  /* ================= LIVE MENU SEARCH ================= */
  (function search() {
    const input = document.getElementById('menu-search');
    if (!input) return;
    let raf = null;
    input.addEventListener('input', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const q = input.value.trim().toLowerCase();
        let shown = 0;
        document.querySelectorAll('.item-card').forEach((card) => {
          const hay = (card.dataset.search || card.textContent).toLowerCase();
          const hit = !q || hay.includes(q);
          card.classList.toggle('filtered-out', !hit);
          if (hit) shown++;
        });
        document.querySelectorAll('.menu-col').forEach((col) => {
          const any = col.querySelector('.item-card:not(.filtered-out)');
          col.style.display = (q && !any) ? 'none' : '';
        });
        const label = document.getElementById('lab-count');
        if (label) label.textContent = q
          ? shown + ' MATCH' + (shown === 1 ? '' : 'ES')
          : (document.querySelectorAll('.item-card').length + ' FORMULATIONS');
      });
    });
  })();

  /* ================= COMMAND PALETTE COMMANDS ================= */
  window.OD_COMMANDS = [
    { icon: '⌂', label: 'Go to Visit', hint: 'PAGE', keywords: 'home visit', run: () => showPage('home') },
    { icon: '☰', label: 'Open the Menu', hint: 'PAGE', keywords: 'menu lab drinks', run: () => showPage('menu') },
    { icon: '◉', label: 'Show Hot Brews only', hint: 'FILTER', keywords: 'hot coffee tea', run: () => { showPage('menu'); setTimeout(() => clickTab('hot'), 340); } },
    { icon: '❄', label: 'Show Thickshakes only', hint: 'FILTER', keywords: 'cold shake', run: () => { showPage('menu'); setTimeout(() => clickTab('shake'), 340); } },
    { icon: '▤', label: 'Show everything', hint: 'FILTER', keywords: 'all reset', run: () => { showPage('menu'); setTimeout(() => clickTab('all'), 340); } },
    { icon: '⛃', label: 'Open your order', hint: 'CART', keywords: 'cart basket dose', run: () => openCartDrawer() },
    { icon: '⌫', label: 'Clear the cart', hint: 'CART', keywords: 'empty reset clear', run: () => { clearCart(); OD.toast && OD.toast('Cart cleared', 'warn'); } },
    { icon: '⇗', label: 'Share this menu', hint: 'ACTION', keywords: 'share link copy', run: () => shareMenu() },
    { icon: '⚙', label: 'Kitchen dashboard', hint: 'STAFF', keywords: 'kitchen orders board', run: () => (window.location.href = 'kitchen/kitchen.html') },
    { icon: '⚗', label: 'Admin console', hint: 'STAFF', keywords: 'admin stats manage', run: () => (window.location.href = 'admin/admin.html') }
  ];

  function clickTab(filter) {
    const tab = document.querySelector(`.tab[data-filter="${filter}"]`);
    if (tab) tab.click();
  }

  // Drinks become searchable commands once the menu has rendered.
  window.registerMenuCommands = function () {
    if (typeof getMenu !== 'function') return;
    const base = window.OD_COMMANDS.filter((c) => c.hint !== 'ADD');
    const drinks = getMenu().filter((m) => !m.outOfStock).map((m) => ({
      icon: m.category === 'hot' ? '☕' : '🥤',
      label: 'Add ' + m.name,
      hint: 'ADD',
      keywords: m.name + ' ' + (m.tags || []).join(' '),
      run: () => {
        addToCart(m.id);
        OD.toast && OD.toast(m.name + ' added', 'ok');
        OD.energy && OD.energy(0.7);
      }
    }));
    window.OD_COMMANDS = base.concat(drinks);
  };

  /* ================= KEYBOARD SHORTCUTS ================= */
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    if (k === 'm') { showPage('menu'); }
    else if (k === 'h') { showPage('home'); }
    else if (k === 'c') { const d = document.getElementById('cart-drawer'); d && d.classList.contains('open') ? closeCartDrawer() : openCartDrawer(); }
  });

  /* ================= SPECIMEN CARD ================= */
  if (window.OD && OD.tilt) OD.tilt();
})();
