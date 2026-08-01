# OVERDOSE — Liquid Lab

A cyber-themed ordering system for a drink lab: a customer storefront, a kitchen ticket board, and an admin console, all static HTML/CSS/JS with Firebase Firestore as the shared order backend.

This README documents the app exactly as the code behaves today — not as originally pitched — so anyone (including future-you) can pick this repo up cold.

---

## 1. What's actually in this repo

| Path | Status | Purpose |
|---|---|---|
| `index.html` + `js/` + `css/` | **Live** | Customer storefront: browse menu, cart, checkout |
| `kitchen/kitchen.html` | **Live** | Kitchen ticket board (Pending → Preparing → Ready → Completed) |
| `admin/admin.html` | **Live** | KPIs, revenue chart, popular items, menu editor |
| `firebase.json`, `firestore.rules`, `.firebaserc` | **Live** | Firebase Hosting + Firestore config |
| `deploy_firebase.bat` | **Live** | One-click `firebase deploy` |
| `push_github.bat` | **Live** | One-click `git add/commit/push` |
| `_backup_v1/` | **Dead weight** | Old copies of every page/script. Not linked from anywhere, not deployed (hosting ignores nothing, so it *would* ship — see §6). Delete it or it just adds confusion. |
| `concept-redesign.html`, `overdose-website.html` | **Dead weight** | Earlier prototypes, unlinked, still deploy to production as live URLs. |
| `serviceAccountKey.json` | **Secret, unused** | Firebase Admin SDK private key. Nothing in this codebase reads it. It sits in the folder for no active reason — see §7. |
| `od poster 1.png`, `od poster idea.jpg`, `overdose image 2.png` | Unused assets | Not referenced by any HTML/CSS found in this repo. |

If you're pushing this to GitHub to be a clean reference for "future me," the honest move is to delete the four dead-weight items above (or move them out of the hosted directory) before you push — otherwise your public repo and live site both carry files you'd have to explain later.

---

## 2. Architecture — how an order actually moves through the system

There is no application server. Three static pages talk to each other through two channels:

1. **`localStorage`** (same-browser only) — cart contents and the menu catalog.
2. **Firebase Firestore** (`orders` collection, cross-device) — the only thing that syncs between a customer's phone and the kitchen/admin screens.

```
Customer (index.html)
   │  addToCart() / cart.js        → localStorage["overdose_cart"]
   │  placeOrderHandler()
   ▼
buildOrderObject()  →  persistOrderRecord()  →  localStorage["overdose_orders"]
   │
   └─ window.OverdoseFirebase.saveOrder(order)  →  Firestore addDoc('orders', order)
                                                        │
                          onSnapshot('orders')  ◄───────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                     ▼
   kitchen/kitchen.html                      admin/admin.html
   renders 4-column board                    renders KPIs / chart / popular items
   advanceOrder() → updateOrderStatus()      (read-only on orders)
   → Firestore updateDoc(status)
              │
   onSnapshot fires again on every client watching 'orders'
   (including the same kitchen screen) → board re-renders
```

Key things this diagram implies that aren't obvious from skimming the code:

- **The menu is *not* in Firestore.** `js/menu.js` reads/writes `localStorage["overdose_menu"]`. When you "add an item" in the admin console, that item exists **only on that browser/device**. Customers on other devices still see the default 14-item menu (or whatever was last saved to *their* browser) until you build real menu sync. Don't be surprised when a menu edit "disappears" on another machine — it never left the device it was made on.
- **Orders sync fine across devices** because they go through Firestore, not localStorage.
- **`orderId`** (e.g. `ORD-KX9F3A2`) is a client-generated human-readable ID (`utils.js:generateId`). **`docId`** is the Firestore-assigned document ID. The kitchen board uses `docId` to know when it's safe to write directly to Firestore vs. falling back to local-only mode — don't confuse the two if you're debugging.
- **Every page degrades independently.** If Firestore is unreachable (bad config, offline, blocked project), each page falls back to local-only mode (polling its own `localStorage` every 2–3s) rather than breaking. The sync pill in the header (`CONNECTING…` / `LIVE SYNC · ALL DEVICES` / `LOCAL DEVICE ONLY`) tells you which mode you're actually in — check it first when something "isn't syncing."

---

## 3. Data model

### Firestore — `orders` collection (the only collection in use)

One document per order, shape exactly as built by `js/cart.js: buildOrderObject()`:

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
- `createdAt` is saved as a JS `Date`, which Firestore stores as a native Timestamp. `js/utils.js: toJsDate()` normalizes both shapes back to a JS `Date` on read (this matters if you ever query Firestore from a script — a raw JS `Date` compare will not work directly against a Timestamp).
- There is **no** `phone`, `sugar`, or `ice` field anywhere in the actual code, despite what earlier drafts of this README implied. If you want those, they need to be added to the checkout form (`index.html`) and `buildOrderObject()`.

### `localStorage` keys (per browser, not shared)

| Key | Written by | Contents |
|---|---|---|
| `overdose_cart` | `js/cart.js` | Current cart line items |
| `overdose_menu` | `js/menu.js` | Full menu catalog (defaults to 14 items in `defaultMenu`) |
| `overdose_orders` | `js/cart.js`, `kitchen/kitchen.html` | Local mirror/fallback of orders, used when Firestore is unreachable |

---

## 4. Firebase project — how it's actually configured

**Project:** `overdose-30375` (see `.firebaserc`)

### 4.1 Web app config (client-side, safe to expose)

`js/firebase.js` hardcodes the Firebase Web SDK config:

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

This is normal — Firebase web `apiKey` is not a secret, it just identifies the project to Google's servers. Actual protection comes from Firestore Security Rules (§4.3), not from hiding this object. You can safely commit this file.

**Where this comes from / how to recreate it on a new project:**
1. Firebase Console → your project → ⚙ Project settings → General.
2. Under "Your apps," select the web app (`</>` icon) or create one.
3. Copy the `firebaseConfig` object into `js/firebase.js`.

### 4.2 Firebase CLI setup (for `firebase deploy`)

```bash
npm install -g firebase-tools     # already listed as a devDependency
firebase login                    # opens a browser, authorizes the CLI
firebase use overdose-30375       # matches .firebaserc
```

`firebase.json` controls what gets deployed:

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

Worth knowing: `public` is `.` (repo root) and the `ignore` list only excludes `.bat`/`.json`/dotfiles/`node_modules`. It does **not** exclude `_backup_v1/`, `concept-redesign.html`, `overdose-website.html`, or the loose image files — every `firebase deploy` currently ships those to your live URL. If you don't want stray prototype pages publicly reachable at `overdose-30375.web.app/_backup_v1/...`, either delete them or add them to the `ignore` array.

### 4.3 Firestore Security Rules — current state is wide open

`firestore.rules`:

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

**This means anyone on the internet who finds your `apiKey` (which is visible in your page source, by design) can read every order, write fake orders, edit any order's status, or delete every order — no login required.** For a class project or private demo this is a fine starting point. Before this is a real business taking real orders, at minimum:

- Restrict `write` to only allow the fields your checkout form actually sends (prevents arbitrary data injection).
- Restrict `update`/`delete` of `status` to kitchen/admin only, gated behind Firebase Auth — right now a customer's browser has exactly the same write access as the kitchen screen.
- Consider Firebase App Check to block traffic that isn't coming from your actual pages.

A minimally better rule (still no auth, but stops arbitrary field injection) looks like:

```javascript
match /orders/{orderId} {
  allow read: if true;
  allow create: if request.resource.data.keys().hasAll(['orderId','customerName','total','status','items','createdAt'])
                && request.resource.data.status == 'Pending';
  allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status']);
  allow delete: if false;
}
```

Treat that as a starting point, not a finished answer — real auth is the actual fix.

### 4.4 `serviceAccountKey.json` — the Admin SDK key sitting in this folder

`serviceAccountKey.json` (project `overdose-30375`, service account `firebase-adminsdk-fbsvc@overdose-30375.iam.gserviceaccount.com`) is a **private key that bypasses Firestore Security Rules entirely** — full read/write/delete on the whole project, and depending on IAM roles, potentially other Google Cloud resources in that project too.

Findings, checked directly:
- It's listed in `.gitignore`, and confirmed via full git history that it has **never been committed** to this repo. Good.
- **Nothing in the current codebase uses it.** There's no Cloud Function, no admin script, no server — it's an orphaned credential.

Before pushing to GitHub:
- Don't remove it from `.gitignore`.
- If you don't have a concrete use for it (e.g., a future backend script), delete it and regenerate one later if needed — an unused live credential sitting on disk is pure downside.
- If you ever suspect it *was* exposed anywhere (another repo, a screenshot, a chat log), rotate it immediately from Firebase Console → Project Settings → Service Accounts → Generate new private key, then revoke the old one.

---

## 5. Local development

No build step — it's plain HTML/CSS/JS loaded as ES modules and classic scripts.

```bash
git clone https://github.com/esatyatej1/Overdose.git
cd Overdose

# any static file server works:
python -m http.server 8000
# or
npx serve .
```

Open:
- Storefront: `http://localhost:8000/index.html`
- Kitchen board: `http://localhost:8000/kitchen/kitchen.html`
- Admin console: `http://localhost:8000/admin/admin.html`

Because `js/firebase.js` already has live project credentials baked in, orders placed from `localhost` write to the **real** `overdose-30375` Firestore database — there's no separate dev/test project. If you want to test without polluting production data, either point `firebaseConfig` at a second Firebase project temporarily, or accept that local testing creates real order documents (they're just Firestore docs — delete them from the console or via the admin/kitchen UI when done).

---

## 6. Deployment

```bash
firebase deploy
```

or double-click `deploy_firebase.bat`, which runs the same command and offers to `firebase login` if the deploy fails on auth. This pushes:
- All static files under the repo root (see the hosting-ignore caveat in §4.2) to Firebase Hosting.
- `firestore.rules` to Firestore.

There's no Cloud Functions deploy target and no Firestore indexes file — none are currently needed since the app only ever queries the whole `orders` collection unfiltered.

---

## 7. Pushing to GitHub

`push_github.bat` runs `git add . && git commit && git push` against `origin` (`https://github.com/esatyatej1/Overdose.git`). Before your first push of this cleaned-up state:

1. Confirm `.gitignore` still lists `node_modules`, `serviceAccountKey.json`, `.env` (it does, as of this writing).
2. Run `git status` and actually read the file list before `git add .` — batch scripts that blindly `add .` are exactly how secrets end up in public repos.
3. Decide whether `_backup_v1/`, the prototype HTML files, and the unused images belong in the public repo at all (§1).

---

## 8. Known limitations (the honest list)

- **No authentication anywhere.** Anyone can place orders, advance kitchen tickets, or edit the menu on whatever browser they're using — there's no concept of a logged-in kitchen staff member or admin.
- **Firestore rules allow unrestricted read/write** (§4.3) — this is the single biggest thing to fix before handling real customers/money.
- **Menu is per-browser, not shared** (§2) — the admin console cannot push menu changes to customer devices without a real backend or a Firestore-backed menu collection.
- **No payment integration** — `total` is calculated and displayed, but nothing actually charges a card; this is an order-queue system, not a POS.
- **Dead/prototype files ship to production** (§1, §4.2) unless cleaned up or added to the hosting `ignore` list.
- **An unused, high-privilege credential (`serviceAccountKey.json`) sits in the project folder** (§4.4) — delete it unless you have a concrete plan for it.
- **Currency is hardcoded to ₹ (INR)** in `js/utils.js: formatPrice()`.

---

## 9. Quick reference

| Task | Command |
|---|---|
| Run locally | `python -m http.server 8000` |
| Log in to Firebase | `firebase login` |
| Deploy site + rules | `firebase deploy` or `deploy_firebase.bat` |
| Push to GitHub | `push_github.bat` or `git add . && git commit -m "..." && git push` |
| Where orders live | Firestore → project `overdose-30375` → collection `orders` |
| Where the menu lives | Browser `localStorage`, key `overdose_menu` (per device) |
| Firestore rules file | `firestore.rules` |
| Firebase project target | `.firebaserc` → `overdose-30375` |

---

## 10. Features — end to end

Everything below is verified against the actual code (`index.html`, `kitchen/kitchen.html`, `admin/admin.html`, `js/*.js`), not aspirational copy.

### 10.1 Customer storefront (`index.html`)

**Home page**
- Live "OPEN NOW" status pill with a real-time clock (`10:00–23:30 IST` hardcoded as the display window).
- Animated count-up stats (formulations, years pouring, hours open, etc.) that trigger once scrolled into view.
- Four-step "protocol" explainer, hazard-tape marquee banners, and a closing CTA banner — all pure content sections, no logic.

**Menu / "The Lab" page**
- Two categories — Hot Brews and Thickshakes — with an `ALL / HOT / SHAKE` tab bar and a sliding pill indicator that animates to the active tab.
- Live client-side search box that filters item cards as you type (no network round-trip).
- Each item card shows price, description, dietary/ingredient tags (e.g. `CONTAINS DAIRY`, `CAFFEINE`), an optional `HOUSE PICK` badge, and a "vial fill" bar whose height is computed from where the item's price sits in the current menu's price range.
- Out-of-stock items render disabled and unaddable; in-stock items get an `ADD` button that becomes a `−  qty  +` stepper once added.

**Cart & checkout**
- Floating "dose meter" button (hidden until the cart has items) showing item count, running total, and a circular SVG progress ring that fills toward a cosmetic ₹600 "full dose" reference.
- Slide-out cart drawer: per-line quantity steppers, remove-line button, subtotal/total, and a checkout form (**customer name required**, notes optional).
- "Fly-to-cart" animation — a small dot visually arcs from the clicked item to the cart button on every add.
- Placing an order writes to `localStorage` immediately and best-effort syncs to Firestore in the background; a receipt modal then shows the generated order ID (`ORD-XXXXXXX`).

**Command palette (`⌘K` / `Ctrl+K`)**
- Fuzzy-searchable list of every nav action, menu filter, cart action, and staff console link — plus every in-stock menu item is registered as a live "Add `<drink>`" command.
- Keyboard shortcuts outside the palette: `M` → menu, `H` → home, `C` → toggle cart (disabled while typing in a field).

**"Liquid lab" visual layer** (shared by all three pages via `fx.js` / `motion.js`)
- Custom WebGL fragment-shader background — a domain-warped fluid noise field that reacts to pointer position and pulses ("energy") on every add-to-cart, order placed, filter change, etc. Falls back to a static CSS aurora if WebGL is unavailable.
- Crosshair "reticle" cursor that snaps to and labels whatever interactive element it's hovering (desktop only — disabled on touch devices and under `prefers-reduced-motion`).
- Magnetic buttons, glitch-style text scramble/decode, character-by-character text reveal on scroll, 3D pointer-tilt on cards, ripple-on-press, HUD-style toast notifications, an animated boot/intro sequence on first load, and a shutter wipe transition between Home and Menu.
- Scroll progress bar, live digital clocks, duplicated marquee tickers for seamless looping, scan-line/grain/vignette overlays for the "HUD" aesthetic.
- Everything in this layer is additive/defensive — it degrades to a static page under reduced-motion or when a hook element is missing, and never owns application state.
- Mobile: dedicated slide-out nav drawer with overlay, all interactive controls collapse into a hamburger menu.
- Share button — uses the native Web Share sheet where available, falls back to copying the URL to the clipboard.

### 10.2 Kitchen Ops Deck (`kitchen/kitchen.html`)

- Real-time 4-column ticket board — `Pending → Preparing → Ready → Completed` — driven by a live Firestore `onSnapshot` listener on the `orders` collection.
- One-click stage advancement per ticket: `ACCEPT` (Pending→Preparing), `MARK READY` (Preparing→Ready), `COMPLETE` (Ready→Completed). Completed tickets simply stop rendering an action button.
- Ticket cards age visually: `fresh` under 6 minutes, `warm` from 6–12 minutes, `late` past 12 minutes (accent color and border shift accordingly), with a live "Xm" age readout that ticks up every 20 seconds.
- A toast fires ("New ticket on the board") the moment a genuinely new order appears mid-session.
- Metrics rail: open tickets, count in queue, count on the line, count ready to collect, and the oldest open ticket's age.
- DOM diffing on re-render — existing ticket cards keep their DOM node instead of the whole column being replaced, so updates don't flicker or replay entrance animations.
- Command palette shortcuts specific to this screen, including "accept the oldest pending ticket" in one action.
- Sync-status pill (`CONNECTING… / LIVE SYNC · ALL DEVICES / LOCAL DEVICE ONLY`) — automatically falls back to polling its own `localStorage` copy of orders every 2s if Firestore is unreachable.

### 10.3 Admin Console (`admin/admin.html`)

- Five KPI tiles: today's orders, today's revenue, open tickets, average order value, total orders — recomputed live as orders stream in.
- Hand-drawn `<canvas>` revenue chart (no charting library) covering the last 7 days: gradient bars for daily revenue plus an overlaid line for daily order count.
- "Popular items" leaderboard — top 6 drinks ranked by total units sold across all orders, with animated proportional bar fills.
- Full menu management table: add a new item (name, category, price, description, comma-separated tags), inline price editing, toggle in-stock/out-of-stock per item, remove an item outright, and a command-palette "reset menu to defaults" action.
- Same sync-status pill, command palette, and visual FX shell as the other two pages.
- **Menu edits here are local to this browser only** — see §2 and §4.2's honest caveat before assuming this "publishes" to customers.

### 10.4 Platform-level features

- **Zero backend code.** Three static HTML pages plus vanilla JS; Firebase Firestore is the only server-side component, used purely as a real-time datastore.
- **Real-time cross-device order sync** via Firestore `onSnapshot` — an order placed on a customer's phone appears on the kitchen board and admin console within the same snapshot round-trip, no polling required in the normal (online) path.
- **Graceful degradation everywhere** — every page that touches Firestore has a local-storage-backed fallback mode with polling, so a bad network or misconfigured project doesn't hard-break the UI, it just stops being "live."
- **One-click operational scripts** — `deploy_firebase.bat` (ships Hosting + Firestore rules, offers to re-auth on failure) and `push_github.bat` (stage, commit with a prompted message, push).

---

**Repository:** [esatyatej1/Overdose](https://github.com/esatyatej1/Overdose)
