/* ============================================================
   utils.js — shared helpers (index / kitchen / admin)
   ============================================================ */

function generateId(prefix){
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${time}${rand}`;
}

function formatPrice(amount){
  return `₹${Number(amount).toFixed(0)}`;
}

function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  try{ localStorage.setItem(key, JSON.stringify(value)); }
  catch(err){ console.warn('storage write failed:', err && err.message); }
}

/* Press ripple. fx.js owns the modern implementation; this keeps the old
   call sites (menu.js) working and simply delegates when fx.js is present. */
function attachRipple(button){
  if(!button) return;
  if(window.OD && typeof window.OD.ripple === 'function'){ window.OD.ripple(button); return; }
  button.addEventListener('click', function(e){
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'od-ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 620);
  });
}

/* Toast. Routes into the HUD toast stack from fx.js when available. */
function showToast(message, kind){
  if(window.OD && typeof window.OD.toast === 'function'){ window.OD.toast(message, kind); return; }
  console.log('[toast]', message);
}

/* Orders from Firestore carry `createdAt` as a Firestore Timestamp object,
   which `new Date(...)` can't parse. Normalize either shape into a Date. */
function toJsDate(dateInput){
  if(dateInput && typeof dateInput.toDate === 'function') return dateInput.toDate();
  return new Date(dateInput);
}

function formatTime(dateInput){
  const d = toJsDate(dateInput);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
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

/* Minutes elapsed since a timestamp — used for kitchen ticket urgency. */
function minutesSince(dateInput){
  const d = toJsDate(dateInput);
  if(isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
}
