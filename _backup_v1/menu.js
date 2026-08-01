const MENU_STORAGE_KEY = 'overdose_menu';

const defaultMenu = [
  { id: 1, name: 'Coffee', category: 'hot', price: 110, description: 'A warm, familiar cup for starting slow or staying late.', tags: ['HOT'], badge: 'HOUSE PICK', outOfStock: false },
  { id: 2, name: 'Tea', category: 'hot', price: 100, description: 'A comforting everyday brew, served hot and easy.', tags: ['HOT'], badge: '', outOfStock: false },
  { id: 3, name: 'Lemon Tea', category: 'hot', price: 110, description: 'Bright tea with a citrus lift and a clean finish.', tags: ['HOT'], badge: 'HOUSE PICK', outOfStock: false },
  { id: 4, name: 'Badam Milk', category: 'hot', price: 125, description: 'Warm, creamy almond milk with a gentle sweet finish.', tags: ['HOT', 'CONTAINS NUTS'], badge: '', outOfStock: false },
  { id: 5, name: 'Classic Vanilla', category: 'shake', price: 160, description: 'Smooth vanilla thickshake with a soft, creamy finish.', tags: ['COLD', 'CONTAINS DAIRY'], badge: 'HOUSE PICK', outOfStock: false },
  { id: 6, name: 'Chocolate', category: 'shake', price: 165, description: 'Rich chocolate blended into a proper thick, cold treat.', tags: ['COLD', 'CONTAINS DAIRY'], badge: '', outOfStock: false },
  { id: 7, name: 'Mango', category: 'shake', price: 170, description: 'Mango sweetness, blended cold and extra creamy.', tags: ['COLD', 'CONTAINS DAIRY'], badge: '', outOfStock: false },
  { id: 8, name: 'Strawberry', category: 'shake', price: 170, description: 'Bright strawberry flavour with a smooth shake texture.', tags: ['COLD', 'CONTAINS DAIRY'], badge: '', outOfStock: false },
  { id: 9, name: 'Butterscotch', category: 'shake', price: 170, description: 'Caramelised butterscotch, blended thick and nutty.', tags: ['COLD', 'CONTAINS DAIRY', 'CONTAINS NUTS'], badge: '', outOfStock: false },
  { id: 10, name: 'Oreo', category: 'shake', price: 180, description: 'Crushed cookie chunks folded into a creamy cold shake.', tags: ['COLD', 'CONTAINS DAIRY', 'CONTAINS GLUTEN'], badge: 'HOUSE PICK', outOfStock: false },
  { id: 11, name: 'KitKat', category: 'shake', price: 185, description: 'Chocolate wafer bars blended into a rich cold shake.', tags: ['COLD', 'CONTAINS DAIRY', 'CONTAINS GLUTEN'], badge: '', outOfStock: false },
  { id: 12, name: 'Nutella', category: 'shake', price: 190, description: 'Hazelnut cocoa spread blended cold, thick and indulgent.', tags: ['COLD', 'CONTAINS DAIRY', 'CONTAINS NUTS'], badge: '', outOfStock: false },
  { id: 13, name: 'Cold Coffee', category: 'shake', price: 150, description: 'Bold cold brew blended thick, for a slower kind of jolt.', tags: ['COLD', 'CONTAINS DAIRY'], badge: '', outOfStock: false },
  { id: 14, name: 'Red Bull Energy', category: 'shake', price: 195, description: 'Energy drink blended shake style, for staying up late.', tags: ['COLD', 'CONTAINS DAIRY', 'CAFFEINE'], badge: '', outOfStock: false }
];

function getMenu(){
  const stored = readStorage(MENU_STORAGE_KEY, null);
  if(stored && Array.isArray(stored) && stored.length){
    return stored;
  }
  writeStorage(MENU_STORAGE_KEY, defaultMenu);
  return defaultMenu;
}

function saveMenu(menu){
  writeStorage(MENU_STORAGE_KEY, menu);
}

function getNextMenuId(menu){
  return menu.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function addMenuItem(item){
  const menu = getMenu();
  const newItem = Object.assign({ id: getNextMenuId(menu), outOfStock: false, tags: [], badge: '' }, item);
  menu.push(newItem);
  saveMenu(menu);
  return menu;
}

function removeMenuItem(id){
  const menu = getMenu().filter(item => item.id !== id);
  saveMenu(menu);
  return menu;
}

function updateMenuItem(id, changes){
  const menu = getMenu().map(item => item.id === id ? Object.assign({}, item, changes) : item);
  saveMenu(menu);
  return menu;
}

function findMenuItem(id){
  return getMenu().find(item => item.id === id);
}

function buildItemControlsHtml(item, qty){
  if(item.outOfStock){
    return `<button class="add-cart-btn" disabled>UNAVAILABLE</button>`;
  }
  if(qty > 0){
    return `
      <div class="item-qty-stepper" data-id="${item.id}">
        <button class="stepper-btn" data-action="decrement" data-id="${item.id}" aria-label="Remove one ${item.name}">−</button>
        <span class="stepper-qty">${qty}</span>
        <button class="stepper-btn" data-action="increment" data-id="${item.id}" aria-label="Add one more ${item.name}">+</button>
      </div>
    `;
  }
  return `
    <button class="add-cart-btn" data-id="${item.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="9" cy="21" r="1.2"/><circle cx="19" cy="21" r="1.2"/><path d="M2.5 3h2.4l2.4 12.4a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.6l1.6-8.4H6"/></svg>
      ADD
    </button>
  `;
}

function bindItemControls(container, id){
  const addBtn = container.querySelector('.add-cart-btn[data-id]');
  if(addBtn){
    attachRipple(addBtn);
    addBtn.addEventListener('click', () => handleAddToCart(id, addBtn));
  }
  container.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if(btn.dataset.action === 'increment'){ incrementLine(id); }
      else{ decrementLine(id); }
    });
  });
}

function buildItemCardHtml(item){
  const badgeHtml = item.badge ? `<span class="badge">✦ ${item.badge}</span>` : '';
  const tagsHtml = item.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
  const rightHtml = item.outOfStock
    ? `<span class="stock-badge">OUT OF STOCK</span>`
    : `<span class="item-price">${formatPrice(item.price)}</span>`;
  const qty = (typeof getCartQty === 'function') ? getCartQty(item.id) : 0;
  const controlsHtml = buildItemControlsHtml(item, qty);

  return `
    <div class="item-card${item.outOfStock ? ' out-of-stock' : ''}" data-cat="${item.category}" data-id="${item.id}">
      <div class="item-top">
        <div class="item-name-row"><span class="item-name">${item.name}</span>${badgeHtml}</div>
        ${rightHtml}
      </div>
      <div class="item-desc">${item.description}</div>
      <div class="item-bottom">
        <div class="tag-row">${tagsHtml}</div>
        <div class="item-controls" data-id="${item.id}">${controlsHtml}</div>
      </div>
    </div>
  `;
}

function renderMenu(){
  const menu = getMenu();
  const hotItems = menu.filter(item => item.category === 'hot');
  const shakeItems = menu.filter(item => item.category === 'shake');

  const hotCol = document.querySelector('.menu-col[data-section="hot"] .item-list');
  const shakeCol = document.querySelector('.menu-col[data-section="shake"] .item-list');
  const hotCount = document.getElementById('hot-count');
  const shakeCount = document.getElementById('shake-count');

  if(hotCol) hotCol.innerHTML = hotItems.map(buildItemCardHtml).join('');
  if(shakeCol) shakeCol.innerHTML = shakeItems.map(buildItemCardHtml).join('');
  if(hotCount) hotCount.textContent = `${hotItems.length} item${hotItems.length === 1 ? '' : 's'}`;
  if(shakeCount) shakeCount.textContent = `${shakeItems.length} item${shakeItems.length === 1 ? '' : 's'}`;

  document.querySelectorAll('.item-controls[data-id]').forEach(container => {
    bindItemControls(container, Number(container.dataset.id));
  });

  if(typeof initScrollReveal === 'function') initScrollReveal();
  if(typeof window.initTiltCards === 'function') window.initTiltCards();
}

// Called whenever the cart changes (add/increment/decrement/remove) so the
// +/- stepper on each menu card always mirrors the live cart quantity,
// without doing a full re-render of the menu grid.
function syncMenuCardControls(){
  document.querySelectorAll('.item-controls[data-id]').forEach(container => {
    const id = Number(container.dataset.id);
    const item = findMenuItem(id);
    if(!item) return;
    const qty = getCartQty(id);
    container.innerHTML = buildItemControlsHtml(item, qty);
    bindItemControls(container, id);
  });
}
