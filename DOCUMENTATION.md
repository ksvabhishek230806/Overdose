# Overdose — Technical Documentation

A cyber-themed drink ordering system: a customer storefront, a kitchen ticket board, and an admin console — three static HTML pages sharing one Firestore `orders` collection. No app server, no build step, no auth.

Repo: `ksvabhishek230806/Overdose` · Firebase project: `overdose-30375`

---

## 1. File inventory

| Path | Status | Purpose |
|---|---|---|
| `index.html` + `js/` + `css/` | Live | Customer storefront |
| `kitchen/kitchen.html` | Live | Kitchen ticket board |
| `admin/admin.html` | Live | KPIs, revenue chart, menu editor |
| `firebase.json`, `firestore.rules`, `.firebaserc` | Live | Hosting + Firestore config |
| `deploy_firebase.bat` | Live | One-click `firebase deploy` |
| `push_github.bat` | Live | One-click `git add/commit/push` |
| `_backup_v1/` | Dead weight | Old copies of every page/script, unlinked but still deploys live |
| `concept-redesign.html`, `overdose-website.html` | Dead weight | Earlier prototypes, unlinked but still deploy live |
| `serviceAccountKey.json` | Not present | Gitignored, never committed, not currently on disk. Nothing in the code uses it. |
| `od poster 1.png`, `od poster idea.jpg`, `overdose image 2.png` | Unused | Not referenced by any HTML/CSS |

Firebase Hosting's `ignore` list only excludes dotfiles, `.bat`, and `.json` — the dead-weight rows above still ship to the live URL on every deploy unless deleted or added to `ignore`.

---

## 2. Architecture

No app server. Three static pages talk to each other through two channels:

- **`localStorage`** (same-browser only) — cart contents and the menu catalog
- **Firestore `orders` collection** (cross-device) — the only thing synced between a customer's phone and the kitchen/admin screens

```
Customer (index.html)
  addToCart() → localStorage["overdose_cart"]
  placeOrderHandler() → buildOrderObject() → persistOrderRecord() → localStorage["overdose_orders"]
                                            → OverdoseFirebase.saveOrder() → Firestore addDoc('orders')
                                                                                    │
                                                                    onSnapshot('orders')
                                                                    ┌───────────────┴───────────────┐
                                                          kitchen/kitchen.html              admin/admin.html
                                                          4-column board, advanceOrder()      KPIs/chart (read-only)
                                                          → Firestore updateDoc(status)
```

Key things not obvious from skimming the code:

- **The menu is not in Firestore.** `js/menu.js` reads/writes `localStorage["overdose_menu"]` only. A menu edit made in the admin console lives on that one browser/device — other customers keep seeing the 14-item default (or whatever was last saved to *their* browser).
- **Orders sync fine across devices** because they go through Firestore, not localStorage.
- **`orderId` vs `docId`** — `orderId` (e.g. `ORD-KX9F3A2`) is client-generated (`utils.js: generateId()`). `docId` is the Firestore document ID, attached by `listenForOrders()`. The kitchen board checks for `docId` to know whether it's safe to write to Firestore vs. falling back to local-only mode.
- **Every page degrades independently.** If Firestore is unreachable, each page falls back to polling its own `localStorage` copy of orders every 2–3s instead of breaking. The sync pill (`CONNECTING…` / `LIVE SYNC · ALL DEVICES` / `LOCAL DEVICE ONLY`) tells you which mode a screen is actually in.

---

## 3. Data model

### Firestore — `orders` collection (only collection in use)

Built by `js/cart.js: buildOrderObject()`:

```json
{
  "orderId": "ORD-KX9F3A2",
  "customerName": "Alex Vance",
  "notes": "extra ice, no sugar",
  "total": 340,
  "createdAt": "2026-08-02T09:15:00.000Z",
  "status": "Pending",
  "items": [
    { "id": 10, "name": "Oreo", "qty": 2, "price": 180 }
  ]
}
```

- `status` moves through `Pending → Preparing → Ready → Completed` (`kitchen/kitchen.html: STATUS_FLOW`).
- `createdAt` is saved as a JS `Date`; Firestore stores it as a Timestamp. `utils.js: toJsDate()` normalizes both shapes back to a JS `Date` on read.
- No `phone`, `sugar`, or `ice` field exists anywhere in the code.

### localStorage keys (per browser, never shared)

| Key | Written by | Contents |
|---|---|---|
| `overdose_cart` | `js/cart.js` | Current cart line items |
| `overdose_menu` | `js/menu.js` | Full menu catalog (defaults to 14 items) |
| `overdose_orders` | `js/cart.js`, `kitchen/kitchen.html` | Local mirror / offline fallback of orders |

---

## 4. Customer storefront (`index.html`)

**Home**
- Live "OPEN NOW" pill + clock; `10:00–23:30 IST` is a hardcoded display string, not enforced.
- Animated count-up stats on scroll-into-view.
- Four-step protocol explainer, hazard-tape marquees, closing CTA.

**Menu ("The Lab")**
- Two categories (Hot Brews, Thickshakes) with `ALL/HOT/SHAKE` tabs and a sliding pill indicator.
- Live client-side search across name, description, tags, badge, SKU.
- Each card: price, description, tags, optional `HOUSE PICK` badge, a "vial fill" bar from `computeFillPercent()` (price position within the menu's range).
- Out-of-stock items disabled; in-stock items get `ADD` → `− qty +` stepper.

**Cart & checkout**
- Floating "dose meter" button (hidden until cart has items): count, total, circular SVG ring filling toward a cosmetic ₹600 reference (`DOSE_FULL_AT`, display-only).
- Slide-out drawer: qty steppers, remove-line, subtotal/total, checkout form (**name required**, notes optional).
- "Fly-to-cart" animation on add.
- Placing an order writes to `localStorage` immediately, then best-effort syncs to Firestore in the background — the receipt modal shows the order ID regardless of whether the Firestore write succeeded.

**Command palette (⌘K)**
- Fuzzy search over nav, filters, cart actions, staff console links, and every in-stock menu item as an "Add <drink>" command.
- Shortcuts: `M` menu, `H` home, `C` cart toggle (disabled while typing in a field).

**Mobile**
- Slide-out nav drawer; share button uses native Web Share or clipboard fallback.

---

## 5. Kitchen Ops Deck (`kitchen/kitchen.html`)

Single self-contained page, driven by a live Firestore `onSnapshot` on `orders`.

- Real-time 4-column board: `Pending → Preparing → Ready → Completed`.
- One-click stage advance per ticket: `ACCEPT`, `MARK READY`, `COMPLETE` (`advanceOrder()`). Completed tickets show no action button.
- Tickets age visually via `ageBucket()`: **fresh** (<6min), **warm** (6–12min), **late** (>12min) — color/border shift, live "Xm" readout ticking every 20s.
- `detectNewTickets()` toasts when a genuinely new order appears mid-session.
- Metrics rail: open tickets, count per stage, oldest open ticket's age.
- **DOM diffing** — `renderColumn()` reconciles each column against latest orders instead of replacing `innerHTML`, so cards keep their DOM node and updates don't flicker or replay animations.
- Command palette: "Accept the oldest pending ticket" in one action.
- Same sync-pill / local-polling fallback pattern (2s interval here).

---

## 6. Admin Console (`admin/admin.html`)

Also self-contained. Reads the same `orders` feed (read-only) and reads/writes the menu via `js/menu.js`.

- 5 KPI tiles (today's orders/revenue, open tickets, avg order value, total orders), live-recomputed.
- Hand-drawn `<canvas>` revenue chart, last 7 days — no charting library.
- "Popular items" leaderboard — top 6 by units sold.
- Menu management table: add item, inline price edit, toggle in/out of stock, remove item.
- Command palette includes "Reset menu to defaults" — **destructive, no confirmation dialog.**

> **Menu edits here are local to this browser only** — no publish step. See §2.

---

## 7. Visual FX layer (`js/fx.js`, `js/motion.js`)

Shared by all three pages via `window.OD`. Additive/defensive — degrades under `prefers-reduced-motion` or missing hooks, never owns app state.

- Custom WebGL fragment-shader background reacting to pointer + "energy" pulses on cart/order/filter events. Falls back to static CSS aurora without WebGL.
- Crosshair reticle cursor (desktop only).
- Magnetic buttons, glitch text scramble, scroll reveal, 3D card tilt, ripple-on-press, HUD toasts, boot intro sequence, shutter page transition.
- Scroll progress bar, live clocks, marquee tickers, scanline/grain/vignette overlays.
- Command palette engine — each page registers its own commands.

---

## 8. Firebase project

**Project:** `overdose-30375`

### Web config (`js/firebase.js`, safe to commit)

```js
const firebaseConfig = {
  apiKey: 'AIzaSy...',
  authDomain: 'overdose-30375.firebaseapp.com',
  projectId: 'overdose-30375',
  storageBucket: 'overdose-30375.firebasestorage.app',
  messagingSenderId: '327093868957',
  appId: '1:327093868957:web:...'
};
```

A Firebase web `apiKey` isn't a secret — protection comes from Firestore Security Rules, not from hiding this. To recreate on a new project: Firebase Console → Project settings → General → "Your apps" → copy `firebaseConfig`.

### CLI setup

```bash
npm install -g firebase-tools
firebase login
firebase use overdose-30375
```

### `firebase.json`

```json
{
  "firestore": { "rules": "firestore.rules" },
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "*.bat", "*.json"],
    "headers": [{ "source": "**/*.@(css|js)", "headers": [{ "key": "Cache-Control", "value": "no-cache, max-age=0, must-revalidate" }] }]
  }
}
```

`ignore` does **not** exclude `_backup_v1/`, the prototype HTML files, or the loose images — they deploy live unless removed.

---

## 9. Security posture

### Firestore rules — currently wide open

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /orders/{orderId} {
      allow read, write: if true;
    }
  }
}
```

**Anyone who finds the `apiKey`** (visible in page source by design) **can read, forge, edit, or delete every order — no login required.** Fine for a demo, not for real customers/money.

Before going live, at minimum:
- Restrict `write` to only the fields checkout actually sends.
- Restrict `update`/`delete` of `status` to kitchen/admin, gated behind Firebase Auth.
- Consider Firebase App Check.

A minimally better rule (still no auth, stops arbitrary field injection):

```javascript
match /orders/{orderId} {
  allow read: if true;
  allow create: if request.resource.data.keys().hasAll(['orderId','customerName','total','status','items','createdAt'])
                && request.resource.data.status == 'Pending';
  allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status']);
  allow delete: if false;
}
```

### No authentication anywhere

Customer, kitchen, and admin all share the same permission level — anyone with the URL to `kitchen/kitchen.html` or `admin/admin.html` has full functional access.

### `serviceAccountKey.json`

Would bypass Firestore rules entirely if present (full read/write/delete on the project). It's listed in `.gitignore`, confirmed never committed, and **not currently present on disk**. Nothing in the codebase references it. If it resurfaces without a concrete use, delete it. If ever suspected exposed, rotate immediately via Firebase Console → Project Settings → Service Accounts.

---

## 10. Local development

No build step.

```bash
git clone https://github.com/ksvabhishek230806/Overdose.git
cd Overdose
python -m http.server 8000
# or: npx serve .
```

- Storefront: `http://localhost:8000/index.html`
- Kitchen: `http://localhost:8000/kitchen/kitchen.html`
- Admin: `http://localhost:8000/admin/admin.html`

**There is no separate dev/test Firebase project** — `js/firebase.js` has live credentials baked in, so local orders write to the real `overdose-30375` database. Point `firebaseConfig` at a second project temporarily, or accept that local testing creates real order docs (delete via console or the UI).

## 11. Deployment

```bash
firebase deploy
```

...or `deploy_firebase.bat` (same command, offers to `firebase login` on auth failure). Ships all static files under the repo root (see §8 ignore caveat) plus `firestore.rules`. No Cloud Functions, no Firestore indexes file — not needed since the app only queries the whole `orders` collection unfiltered.

## 12. Pushing to GitHub

`push_github.bat` runs `git add . && git commit && git push` against `origin`. Before pushing:
1. Confirm `.gitignore` still lists `node_modules`, `serviceAccountKey.json`, `.env`.
2. Run `git status` and actually read the file list before `git add .`.
3. Decide whether `_backup_v1/`, the prototypes, and unused images belong in the public repo (§1).

---

## 13. Known limitations

- No authentication anywhere.
- Firestore rules allow unrestricted read/write — the single biggest fix before real customers/money.
- Menu is per-browser, not shared — admin edits don't reach customer devices without a real backend or Firestore-backed menu collection.
- No payment integration — `total` is calculated and shown, nothing charges a card.
- Dead/prototype files ship to production unless cleaned up or ignored.
- Currency hardcoded to ₹ in `js/utils.js: formatPrice()`.

---

## 14. Quick reference

| Task | Command |
|---|---|
| Run locally | `python -m http.server 8000` |
| Log in to Firebase | `firebase login` |
| Deploy site + rules | `firebase deploy` or `deploy_firebase.bat` |
| Push to GitHub | `push_github.bat` or `git add . && git commit -m "..." && git push` |
| Where orders live | Firestore → `overdose-30375` → collection `orders` |
| Where the menu lives | Browser `localStorage`, key `overdose_menu` (per device) |
| Firestore rules file | `firestore.rules` |
| Firebase project target | `.firebaserc` → `overdose-30375` |
