function generateId(prefix){
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${time}${rand}`;
}

function formatPrice(amount){
  return `₹${Number(amount).toFixed(0)}`;
}

function readStorage(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(err){
    return fallback;
  }
}

function writeStorage(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function attachRipple(button){
  button.addEventListener('click', function(e){
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 550);
  });
}

function showToast(message){
  let stack = document.querySelector('.toast-stack');
  if(!stack){
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg><span>${message}</span>`;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2400);
}

// Orders that come from Firestore carry `createdAt` as a Firestore Timestamp
// object (not a plain Date/ISO string), which `new Date(...)` can't parse
// directly. This normalizes either shape into a real JS Date.
function toJsDate(dateInput){
  if(dateInput && typeof dateInput.toDate === 'function') return dateInput.toDate();
  return new Date(dateInput);
}

function formatTime(dateInput){
  const d = toJsDate(dateInput);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateInput){
  const d = toJsDate(dateInput);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function isSameDay(dateInput, reference){
  const d = toJsDate(dateInput);
  const r = reference ? toJsDate(reference) : new Date();
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth() && d.getDate() === r.getDate();
}
