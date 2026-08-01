/* ============================================================
   cart.js — cart state, dose meter, checkout
   ============================================================ */

const CART_STORAGE_KEY = 'overdose_cart';
const ORDERS_STORAGE_KEY = 'overdose_orders';

/* The dose ring reads "full" at this order value. Purely cosmetic. */
const DOSE_FULL_AT = 600;

let cartState = [];

function loadCart(){
  cartState = readStorage(CART_STORAGE_KEY, []);
  return cartState;
}
function persistCart(){ writeStorage(CART_STORAGE_KEY, cartState); }

function getCartCount(){ return cartState.reduce((sum, line) => sum + line.qty, 0); }
function getCartSubtotal(){ return cartState.reduce((sum, line) => sum + line.qty * line.price, 0); }
function getCartQty(id){
  const line = cartState.find(l => l.id === id);
  return line ? line.qty : 0;
}

function addToCart(id){
  const menuItem = findMenuItem(id);
  if(!menuItem || menuItem.outOfStock) return;
  const existing = cartState.find(line => line.id === id);
  if(existing) existing.qty += 1;
  else cartState.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1 });
  persistCart();
  refreshCartUI();
}

function incrementLine(id){
  const line = cartState.find(l => l.id === id);
  if(!line) return;
  line.qty += 1;
  persistCart();
  refreshCartUI();
}

function decrementLine(id){
  const line = cartState.find(l => l.id === id);
  if(!line) return;
  line.qty -= 1;
  if(line.qty <= 0) cartState = cartState.filter(l => l.id !== id);
  persistCart();
  refreshCartUI();
}

function removeLine(id){
  cartState = cartState.filter(l => l.id !== id);
  persistCart();
  refreshCartUI();
}

function clearCart(){
  cartState = [];
  persistCart();
  refreshCartUI();
}

function refreshCartUI(){
  updateDoseMeter();
  renderCartDrawer();
  if(typeof syncMenuCardControls === 'function') syncMenuCardControls();
}

/* ================= DOSE METER ================= */
let lastCount = 0;
function updateDoseMeter(){
  const btn = document.getElementById('floating-cart-btn');
  const countEl = document.getElementById('fc-count');
  const totalEl = document.getElementById('fc-total');
  const fillEl = document.getElementById('dose-fill');

  const count = getCartCount();
  const total = getCartSubtotal();

  if(countEl) countEl.textContent = count;
  if(totalEl) totalEl.textContent = formatPrice(total);

  if(fillEl){
    const CIRC = 2 * Math.PI * 20; // r = 20 in the SVG
    const pct = Math.min(1, total / DOSE_FULL_AT);
    fillEl.style.strokeDasharray = String(CIRC);
    fillEl.style.strokeDashoffset = String(CIRC - CIRC * pct);
  }

  if(btn){
    btn.classList.toggle('hidden', count === 0);
    if(count > lastCount){
      btn.classList.remove('bump');
      void btn.offsetWidth;
      btn.classList.add('bump');
    }
  }
  lastCount = count;
}

/* ================= DRAWER ================= */
function buildCartLineHtml(line){
  return `
    <div class="cart-item" data-id="${line.id}">
      <div class="cart-item-name">${escapeHtml(line.name)}</div>
      <div class="cart-item-price">${formatPrice(line.price)} EACH</div>
      <div class="cart-item-row">
        <div class="qty-control">
          <button class="qty-btn" data-action="decrement" data-id="${line.id}" aria-label="Remove one">−</button>
          <span class="qty-value">${line.qty}</span>
          <button class="qty-btn" data-action="increment" data-id="${line.id}" aria-label="Add one">+</button>
        </div>
        <span class="cart-item-line-total">${formatPrice(line.price * line.qty)}</span>
      </div>
      <button class="remove-btn" data-action="remove" data-id="${line.id}">REMOVE</button>
    </div>`;
}

function renderCartDrawer(){
  const container = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl = document.getElementById('cart-total');
  const placeBtn = document.getElementById('place-order-btn');
  if(!container) return;

  if(cartState.length === 0){
    container.innerHTML = `
      <div class="cart-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1.2"/><circle cx="19" cy="21" r="1.2"/><path d="M2.5 3h2.4l2.4 12.4a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.6l1.6-8.4H6"/></svg>
        <p>No dose loaded<br>add something from the lab</p>
      </div>`;
  }else{
    container.innerHTML = cartState.map(buildCartLineHtml).join('');
    container.querySelectorAll('[data-action="increment"]').forEach(b => b.addEventListener('click', () => incrementLine(Number(b.dataset.id))));
    container.querySelectorAll('[data-action="decrement"]').forEach(b => b.addEventListener('click', () => decrementLine(Number(b.dataset.id))));
    container.querySelectorAll('[data-action="remove"]').forEach(b => b.addEventListener('click', () => removeLine(Number(b.dataset.id))));
  }

  const subtotal = getCartSubtotal();
  if(subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if(totalEl) totalEl.textContent = formatPrice(subtotal);
  if(placeBtn) placeBtn.disabled = cartState.length === 0;
}

function openCartDrawer(){
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  if(!overlay || !drawer) return;
  overlay.classList.add('open');
  drawer.classList.add('open');
  document.body.classList.add('no-scroll');
  if(window.OD && OD.energy) OD.energy(0.35);
}

function closeCartDrawer(){
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  if(!overlay || !drawer) return;
  overlay.classList.remove('open');
  drawer.classList.remove('open');
  document.body.classList.remove('no-scroll');
}

function handleAddToCart(id, btnEl){
  addToCart(id);
  const menuItem = findMenuItem(id);
  if(!menuItem) return;
  if(btnEl){
    btnEl.classList.add('added');
    setTimeout(() => btnEl.classList.remove('added'), 500);
  }
  showToast(`${menuItem.name} loaded`, 'ok');
}

/* ================= CHECKOUT ================= */
function validateCheckoutForm(){
  const nameField = document.getElementById('customer-name');
  let isValid = true;
  nameField.closest('.field-group').classList.remove('invalid');

  if(cartState.length === 0){
    showToast('Your cart is empty', 'warn');
    isValid = false;
  }
  if(!nameField.value.trim()){
    nameField.closest('.field-group').classList.add('invalid');
    showToast('Please enter your name', 'warn');
    nameField.focus();
    isValid = false;
  }
  return isValid;
}

function buildOrderObject(){
  const nameField = document.getElementById('customer-name');
  const notesField = document.getElementById('order-notes');
  return {
    orderId: generateId('ORD'),
    customerName: nameField.value.trim(),
    notes: notesField.value.trim(),
    total: getCartSubtotal(),
    createdAt: new Date(),
    status: 'Pending',
    items: cartState.map(line => ({ id: line.id, name: line.name, qty: line.qty, price: line.price }))
  };
}

function persistOrderRecord(order){
  const orders = readStorage(ORDERS_STORAGE_KEY, []);
  orders.push(order);
  writeStorage(ORDERS_STORAGE_KEY, orders);
}

function submitOrder(order){
  // Defense in depth: never persist an order without a customer name.
  if(!order || !order.customerName || !order.customerName.trim()){
    showToast('Please enter your name', 'warn');
    return false;
  }
  persistOrderRecord(order);

  // Best-effort durable save. This app has no server of its own, so
  // Firestore is the backend. If it isn't reachable the order still lives
  // in localStorage and nothing on-screen breaks.
  if(window.OverdoseFirebase && typeof window.OverdoseFirebase.saveOrder === 'function'){
    window.OverdoseFirebase.saveOrder(order).catch(err => {
      console.warn('Order saved locally, but Firestore save failed:', err.message);
    });
  }
  return true;
}

function resetCheckoutForm(){
  document.getElementById('customer-name').value = '';
  document.getElementById('order-notes').value = '';
}

function showSuccessModal(order){
  document.getElementById('success-order-id').textContent = order.orderId;
  document.getElementById('success-modal-overlay').classList.add('open');
  if(window.OD && OD.energy) OD.energy(1.4);
}

function closeSuccessModal(){
  document.getElementById('success-modal-overlay').classList.remove('open');
}

function placeOrderHandler(){
  if(!validateCheckoutForm()) return;
  const placeBtn = document.getElementById('place-order-btn');
  placeBtn.classList.add('loading');
  placeBtn.disabled = true;

  setTimeout(() => {
    const order = buildOrderObject();
    submitOrder(order);
    placeBtn.classList.remove('loading');
    clearCart();
    resetCheckoutForm();
    closeCartDrawer();
    showSuccessModal(order);
  }, 700);
}
