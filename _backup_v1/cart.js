const CART_STORAGE_KEY = 'overdose_cart';
const ORDERS_STORAGE_KEY = 'overdose_orders';

let cartState = [];

function loadCart(){
  cartState = readStorage(CART_STORAGE_KEY, []);
  return cartState;
}

function persistCart(){
  writeStorage(CART_STORAGE_KEY, cartState);
}

function getCartCount(){
  return cartState.reduce((sum, line) => sum + line.qty, 0);
}

function getCartSubtotal(){
  return cartState.reduce((sum, line) => sum + line.qty * line.price, 0);
}

function getCartQty(id){
  const line = cartState.find(l => l.id === id);
  return line ? line.qty : 0;
}

function addToCart(id){
  const menuItem = findMenuItem(id);
  if(!menuItem || menuItem.outOfStock) return;

  const existing = cartState.find(line => line.id === id);
  if(existing){
    existing.qty += 1;
  }else{
    cartState.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1 });
  }
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
  if(line.qty <= 0){
    cartState = cartState.filter(l => l.id !== id);
  }
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
  updateFloatingCart();
  renderCartDrawer();
  if(typeof syncMenuCardControls === 'function') syncMenuCardControls();
}

let lastFcCount = 0;
function updateFloatingCart(){
  const btnEl = document.getElementById('floating-cart-btn');
  const countEl = document.getElementById('fc-count');
  const totalEl = document.getElementById('fc-total');
  const count = getCartCount();
  if(countEl){
    countEl.textContent = count;
    countEl.style.display = count > 0 ? 'flex' : 'none';
  }
  if(totalEl) totalEl.textContent = formatPrice(getCartSubtotal());
  if(btnEl && count > lastFcCount){
    btnEl.classList.remove('bump');
    // Force reflow so the animation can retrigger on rapid consecutive adds.
    void btnEl.offsetWidth;
    btnEl.classList.add('bump');
  }
  lastFcCount = count;
}

function buildCartLineHtml(line){
  return `
    <div class="cart-item" data-id="${line.id}">
      <div class="cart-item-info">
        <div class="cart-item-name">${line.name}</div>
        <div class="cart-item-price">${formatPrice(line.price)} each</div>
        <div class="cart-item-row">
          <div class="qty-control">
            <button class="qty-btn" data-action="decrement" data-id="${line.id}">−</button>
            <span class="qty-value">${line.qty}</span>
            <button class="qty-btn" data-action="increment" data-id="${line.id}">+</button>
          </div>
          <span class="cart-item-line-total">${formatPrice(line.price * line.qty)}</span>
        </div>
        <button class="remove-btn" data-action="remove" data-id="${line.id}">REMOVE</button>
      </div>
    </div>
  `;
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="21" r="1.2"/><circle cx="19" cy="21" r="1.2"/><path d="M2.5 3h2.4l2.4 12.4a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.6l1.6-8.4H6"/></svg>
        <p>Your cart is empty.<br>Add something delicious.</p>
      </div>
    `;
  }else{
    container.innerHTML = cartState.map(buildCartLineHtml).join('');
    container.querySelectorAll('[data-action="increment"]').forEach(btn => btn.addEventListener('click', () => incrementLine(Number(btn.dataset.id))));
    container.querySelectorAll('[data-action="decrement"]').forEach(btn => btn.addEventListener('click', () => decrementLine(Number(btn.dataset.id))));
    container.querySelectorAll('[data-action="remove"]').forEach(btn => btn.addEventListener('click', () => removeLine(Number(btn.dataset.id))));
  }

  const subtotal = getCartSubtotal();
  if(subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if(totalEl) totalEl.textContent = formatPrice(subtotal);
  if(placeBtn) placeBtn.disabled = cartState.length === 0;
}

function openCartDrawer(){
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-drawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer(){
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-drawer').classList.remove('open');
  document.body.style.overflow = '';
}

function handleAddToCart(id, btnEl){
  addToCart(id);
  const menuItem = findMenuItem(id);
  if(!menuItem) return;
  if(btnEl){
    btnEl.classList.add('added');
    setTimeout(() => btnEl.classList.remove('added'), 450);
  }
  showToast(`${menuItem.name} added to cart`);
}

function validateCheckoutForm(){
  const nameField = document.getElementById('customer-name');
  let isValid = true;

  nameField.closest('.field-group').classList.remove('invalid');

  if(cartState.length === 0){
    showToast('Your cart is empty');
    isValid = false;
  }
  if(!nameField.value.trim()){
    nameField.closest('.field-group').classList.add('invalid');
    showToast('Please enter your name');
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
    items: cartState.map(line => ({
      id: line.id,
      name: line.name,
      qty: line.qty,
      price: line.price
    }))
  };
}

function persistOrderRecord(order){
  const orders = readStorage(ORDERS_STORAGE_KEY, []);
  orders.push(order);
  writeStorage(ORDERS_STORAGE_KEY, orders);
}

function submitOrder(order){
  // Defense in depth: never persist an order without a customer name,
  // even if this function is ever called from somewhere that skipped
  // validateCheckoutForm().
  if(!order || !order.customerName || !order.customerName.trim()){
    showToast('Please enter your name');
    return false;
  }

  persistOrderRecord(order);

  // Best-effort permanent backend save. This app has no server of its
  // own, so Firestore (js/firebase.js) is the durable backend. If the
  // project hasn't been configured yet, this fails silently and the
  // order still lives in localStorage so nothing on-screen breaks.
  if(window.OverdoseFirebase && typeof window.OverdoseFirebase.saveOrder === 'function'){
    window.OverdoseFirebase.saveOrder(order).catch(err => {
      console.warn('Order saved locally, but Firestore save failed (is js/firebase.js configured?):', err.message);
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
