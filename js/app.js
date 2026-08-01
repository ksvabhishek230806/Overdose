/* ============================================================
   app.js — page routing, nav, filters, bootstrap
   ============================================================ */

const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ================= SHUTTER TRANSITION ================= */
function runShutter(midpoint){
  const sh = document.getElementById('od-shutter');
  if(!sh || reduceMotionQuery.matches || document.body.classList.contains('page-transitioning')){
    if(typeof midpoint === 'function') midpoint();
    return;
  }
  document.body.classList.add('page-transitioning');
  sh.classList.remove('out');
  sh.classList.add('on', 'in');

  setTimeout(() => {
    if(typeof midpoint === 'function') midpoint();
    sh.classList.remove('in');
    sh.classList.add('out');
    setTimeout(() => {
      sh.classList.remove('on', 'out');
      document.body.classList.remove('page-transitioning');
    }, 700);
  }, 450);
}

/* ================= MENU ENTRANCE ================= */
function triggerMenuEntranceFx(){
  if(window.OD && OD.energy) OD.energy(0.9);
  if(typeof window.positionTabIndicator === 'function'){
    const activeTab = document.querySelector('.tab.active');
    if(activeTab) window.positionTabIndicator(activeTab);
  }
  // Re-run reveal for anything inside the menu page that was hidden.
  if(window.OD && OD.reveal) OD.reveal();
}

/* ================= ROUTING ================= */
function setNavState(name){
  const map = [
    ['nav-visit', 'home'], ['mnav-visit', 'home'],
    ['nav-menu', 'menu'],  ['mnav-menu', 'menu']
  ];
  map.forEach(([id, page]) => {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('active', name === page);
  });
}

function showPage(name, opts){
  opts = opts || {};
  const home = document.getElementById('page-home');
  const menu = document.getElementById('page-menu');
  if(!home || !menu) return;

  const current = home.classList.contains('active') ? home : menu;
  const target = name === 'home' ? home : menu;
  if(current === target) return;
  if(document.body.classList.contains('page-transitioning')) return;

  const swap = () => {
    current.classList.remove('active');
    target.classList.add('active');
    setNavState(name);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if(target === menu) triggerMenuEntranceFx();
  };

  if(opts.skipTransition || reduceMotionQuery.matches){
    swap();
    return;
  }
  runShutter(swap);
}

/* ================= BRAND INTRO ================= */
function playBrandIntro(){
  if(document.body.classList.contains('page-transitioning')) return;
  if(window.OD && OD.energy) OD.energy(1.5);
  const menu = document.getElementById('page-menu');
  if(menu && menu.classList.contains('active')){
    // Already in the lab — just pulse and scroll back to the top.
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('You are already in the lab', 'ok');
    return;
  }
  showPage('menu');
}

/* ================= FILTERS ================= */
function filterMenu(cat, btn){
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if(typeof window.positionTabIndicator === 'function') window.positionTabIndicator(btn);

  const hotCol = document.querySelector('.menu-col[data-section="hot"]');
  const shakeCol = document.querySelector('.menu-col[data-section="shake"]');
  if(!hotCol || !shakeCol) return;

  const apply = () => {
    hotCol.style.display   = (cat === 'all' || cat === 'hot')   ? '' : 'none';
    shakeCol.style.display = (cat === 'all' || cat === 'shake') ? '' : 'none';
  };

  if(reduceMotionQuery.matches || !hotCol.animate){ apply(); return; }

  [hotCol, shakeCol].forEach(col => col.animate([{ opacity:1 }, { opacity:0 }], { duration:150, easing:'ease' }));
  setTimeout(() => {
    apply();
    [hotCol, shakeCol].forEach(col => {
      if(col.style.display !== 'none'){
        col.animate(
          [{ opacity:0, transform:'translateY(12px)' }, { opacity:1, transform:'none' }],
          { duration:340, easing:'cubic-bezier(.16,1,.3,1)' }
        );
      }
    });
  }, 150);

  if(window.OD && OD.energy) OD.energy(0.4);
}

/* ================= MOBILE NAV ================= */
function openMobileNav(){
  document.getElementById('mobile-nav').classList.add('open');
  document.getElementById('mobile-nav-overlay').classList.add('open');
  const btn = document.getElementById('mobile-menu-btn');
  btn.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
  document.body.classList.add('no-scroll');
}
function closeMobileNav(){
  document.getElementById('mobile-nav').classList.remove('open');
  document.getElementById('mobile-nav-overlay').classList.remove('open');
  const btn = document.getElementById('mobile-menu-btn');
  btn.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('no-scroll');
}
function toggleMobileNav(){
  document.getElementById('mobile-nav').classList.contains('open') ? closeMobileNav() : openMobileNav();
}

/* ================= SHARE ================= */
function shareMenu(){
  const url = window.location.href;
  if(navigator.share){
    navigator.share({ title: 'Overdose Menu', url }).catch(() => {});
  }else if(navigator.clipboard){
    navigator.clipboard.writeText(url).then(() => showToast('Menu link copied', 'ok'));
  }else{
    showToast('Copy this page URL to share', 'warn');
  }
}

/* ================= BINDINGS ================= */
function bindGlobalEvents(){
  const on = (id, ev, fn) => { const el = document.getElementById(id); if(el) el.addEventListener(ev, fn); };

  on('floating-cart-btn', 'click', openCartDrawer);
  on('cart-close-btn', 'click', closeCartDrawer);
  on('cart-overlay', 'click', closeCartDrawer);
  on('place-order-btn', 'click', placeOrderHandler);
  on('success-modal-close', 'click', closeSuccessModal);
  on('success-modal-overlay', 'click', (e) => { if(e.target.id === 'success-modal-overlay') closeSuccessModal(); });
  on('mobile-menu-btn', 'click', toggleMobileNav);
  on('mobile-nav-overlay', 'click', closeMobileNav);

  const brand = document.getElementById('brand-trigger');
  if(brand) brand.addEventListener('click', playBrandIntro);

  window.addEventListener('keydown', (e) => {
    if(e.key !== 'Escape') return;
    closeMobileNav();
    closeCartDrawer();
    closeSuccessModal();
  });

  document.querySelectorAll('.btn, .tab, .place-order-btn, .modal-close-btn, .mobile-navlink, .icon-btn')
    .forEach(el => { if(window.OD && OD.ripple) OD.ripple(el); });
}

/* ================= BOOTSTRAP ================= */
document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  renderMenu();
  refreshCartUI();
  bindGlobalEvents();

  if(window.OD && typeof OD.boot === 'function'){
    OD.boot(() => {
      if(OD.reveal) OD.reveal();
      if(OD.energy) OD.energy(1.1);
    });
  }else{
    document.body.classList.remove('booting');
  }
});
