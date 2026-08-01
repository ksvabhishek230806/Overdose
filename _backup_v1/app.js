// Flashes a light sweep across the screen and staggers the tabs/column
// headers in, so landing on the menu feels like a deliberate reveal rather
// than a plain fade. `opts.flash` can be set to false to skip the sweep
// (used when the brand splash intro is already providing the flourish).
function triggerMenuEntranceFx(opts){
  opts = opts || {};
  if(opts.flash !== false){
    const flash = document.getElementById('menu-flash');
    if(flash){
      flash.classList.remove('sweep');
      void flash.offsetWidth; // restart the animation even on repeat visits
      flash.classList.add('sweep');
    }
  }
  const wrap = document.querySelector('.menu-wrap');
  if(wrap){
    wrap.classList.remove('stagger-in');
    void wrap.offsetWidth;
    wrap.classList.add('stagger-in');
  }
  // Position the sliding tab pill now that .tabs is actually visible
  // (it reports zero width while the menu page is display:none).
  if(typeof window.positionTabIndicator === 'function'){
    const activeTab = document.querySelector('.tab.active');
    if(activeTab) window.positionTabIndicator(activeTab);
  }
}

function showPage(name, opts){
  opts = opts || {};
  const home = document.getElementById('page-home');
  const menu = document.getElementById('page-menu');
  const current = home.classList.contains('active') ? home : menu;
  const target = name === 'home' ? home : menu;
  if(current === target || document.body.classList.contains('page-transitioning')) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goingToMenu = target === menu;

  const swap = () => {
    current.classList.remove('active');
    target.classList.add('active');
    const navVisit = document.getElementById('nav-visit');
    const mnavVisit = document.getElementById('mnav-visit');
    const navMenu = document.getElementById('nav-menu');
    const mnavMenu = document.getElementById('mnav-menu');
    if(navVisit) navVisit.classList.toggle('active', name === 'home');
    if(mnavVisit) mnavVisit.classList.toggle('active', name === 'home');
    if(navMenu) navMenu.classList.toggle('active', name === 'menu');
    if(mnavMenu) mnavMenu.classList.toggle('active', name === 'menu');
    window.scrollTo({ top: 0, behavior: 'instant' });
    if(goingToMenu) triggerMenuEntranceFx({ flash: opts.skipFx !== true });
  };

  if(reduceMotion || !current.animate || opts.skipTransition){
    swap();
    return;
  }

  document.body.classList.add('page-transitioning');

  // Going to the menu gets a bigger, punchier "portal" transition (deeper
  // scale + blur, longer hold on the reveal); going home stays closer to
  // the original subtle crossfade.
  const outKeyframes = goingToMenu
    ? [
        { opacity: 1, transform: 'scale(1) translateY(0)', filter: 'blur(0px)' },
        { opacity: 0, transform: 'scale(0.9) translateY(-16px)', filter: 'blur(16px)' }
      ]
    : [
        { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' },
        { opacity: 0, transform: 'translateY(-14px) scale(0.97)', filter: 'blur(10px)' }
      ];

  current.animate(outKeyframes, {
    duration: goingToMenu ? 380 : 320,
    easing: 'cubic-bezier(.4,0,.2,1)'
  }).onfinish = () => {
    swap();
    const inKeyframes = goingToMenu
      ? [
          { opacity: 0, transform: 'scale(1.08) translateY(30px)', filter: 'blur(18px)' },
          { opacity: 1, transform: 'scale(1) translateY(0)', filter: 'blur(0px)' }
        ]
      : [
          { opacity: 0, transform: 'translateY(18px) scale(0.97)', filter: 'blur(10px)' },
          { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' }
        ];
    target.animate(inKeyframes, {
      duration: goingToMenu ? 580 : 420,
      easing: 'cubic-bezier(.16,1,.3,1)'
    }).onfinish = () => { document.body.classList.remove('page-transitioning'); };
  };
}

// Plays a full-screen native-app-style splash of the OVERDOSE mark, then
// iris-wipes it away to reveal the menu underneath. Triggered by clicking
// the brand logo in the header.
function playBrandIntro(){
  const splash = document.getElementById('brand-splash');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if(!splash || reduceMotion){
    showPage('menu');
    return;
  }
  if(document.body.classList.contains('splash-active')) return;

  document.body.classList.add('splash-active');
  splash.classList.remove('closing');
  splash.classList.add('open');

  // Swap the page underneath partway through the intro (while it's still
  // fully covered) so the iris-out wipe reveals the menu that's already
  // in place, instead of revealing the old page and then cutting away.
  setTimeout(() => {
    showPage('menu', { skipTransition: true, skipFx: true });
  }, 900);

  setTimeout(() => {
    splash.classList.add('closing');
  }, 1550);

  setTimeout(() => {
    splash.classList.remove('open', 'closing');
    document.body.classList.remove('splash-active');
  }, 2170);
}

function filterMenu(cat, btn){
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if(typeof window.positionTabIndicator === 'function') window.positionTabIndicator(btn);
  const hotCol = document.querySelector('.menu-col[data-section="hot"]');
  const shakeCol = document.querySelector('.menu-col[data-section="shake"]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const apply = () => {
    if(cat === 'all'){ hotCol.style.display = 'block'; shakeCol.style.display = 'block'; }
    else if(cat === 'hot'){ hotCol.style.display = 'block'; shakeCol.style.display = 'none'; }
    else if(cat === 'shake'){ hotCol.style.display = 'none'; shakeCol.style.display = 'block'; }
  };

  if(reduceMotion || !hotCol.animate){
    apply();
    return;
  }

  [hotCol, shakeCol].forEach(col => {
    col.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease' });
  });
  setTimeout(() => {
    apply();
    [hotCol, shakeCol].forEach(col => {
      if(col.style.display !== 'none'){
        col.animate(
          [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' }
        );
      }
    });
  }, 140);
}

function openMobileNav(){
  document.getElementById('mobile-nav').classList.add('open');
  document.getElementById('mobile-nav-overlay').classList.add('open');
  document.getElementById('mobile-menu-btn').classList.add('open');
  document.getElementById('mobile-menu-btn').setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeMobileNav(){
  document.getElementById('mobile-nav').classList.remove('open');
  document.getElementById('mobile-nav-overlay').classList.remove('open');
  document.getElementById('mobile-menu-btn').classList.remove('open');
  document.getElementById('mobile-menu-btn').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function toggleMobileNav(){
  const isOpen = document.getElementById('mobile-nav').classList.contains('open');
  if(isOpen) closeMobileNav(); else openMobileNav();
}

function shareMenu(){
  const url = window.location.href;
  if(navigator.share){ navigator.share({ title: 'Overdose Menu', url }); }
  else { navigator.clipboard.writeText(url).then(() => showToast('Menu link copied!')); }
}

function bindGlobalCartEvents(){
  document.getElementById('floating-cart-btn').addEventListener('click', openCartDrawer);
  document.getElementById('cart-close-btn').addEventListener('click', closeCartDrawer);
  document.getElementById('cart-overlay').addEventListener('click', closeCartDrawer);
  document.getElementById('place-order-btn').addEventListener('click', placeOrderHandler);
  document.getElementById('success-modal-close').addEventListener('click', closeSuccessModal);
  document.getElementById('success-modal-overlay').addEventListener('click', (e) => {
    if(e.target.id === 'success-modal-overlay') closeSuccessModal();
  });

  document.getElementById('mobile-menu-btn').addEventListener('click', toggleMobileNav);
  document.getElementById('mobile-nav-overlay').addEventListener('click', closeMobileNav);
  window.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') closeMobileNav();
  });

  const brandTrigger = document.getElementById('brand-trigger');
  if(brandTrigger){
    brandTrigger.addEventListener('click', playBrandIntro);
    brandTrigger.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        playBrandIntro();
      }
    });
  }

  document.querySelectorAll('.cta, .tab, .place-order-btn, .modal-close-btn, .mobile-navlink').forEach(attachRipple);
}

// Fades + slides menu item cards into view as the user scrolls, with a
// slight stagger so cards feel like they're arriving one after another
// rather than popping in all at once.
function initScrollReveal(){
  const cards = document.querySelectorAll('.item-card:not(.revealed)');
  if(!cards.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion || !('IntersectionObserver' in window)){
    return;
  }

  cards.forEach(card => card.classList.add('revealed'));

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      const card = entry.target;
      const siblings = Array.from(card.parentElement.children);
      const index = siblings.indexOf(card);
      card.style.animationDelay = `${Math.min(index % 8, 8) * 45}ms`;
      card.classList.add('in-view');
      obs.unobserve(card);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  cards.forEach(card => observer.observe(card));
}

document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  renderMenu();
  refreshCartUI();
  bindGlobalCartEvents();
});
