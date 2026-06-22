# CLAUDE.md — Diet Application

## Running the App

Open `index.html` directly in a browser — no server, build step, or package manager required.

## Overview

Diet menu planner — pure client-side Hebrew RTL app (HTML + CSS + vanilla JS).
Flow: 5 screens (personal details → diet prefs → liked foods → avoided foods → generated menu).
Detailed rules are in `.claude/rules/`:

- `architecture.md` — script load order, global state `S`, screens, UI functions
- `data-schema.md` — food DB schema, tags, portions, images *(scoped to `data.js`)*
- `algorithm.md` — macro calc, `buildMenu()` flow, builders, salad, tuna rule *(scoped to `app.js`)*
- `ui-rendering.md` — menu rendering, thumbnails, design system *(scoped to `ui.js`, `style.css`, `index.html`)*

## Deployment & Marketing

- **Brand**: ShapEat / שייפיט. Live at **shapeat.co.il** (GitHub Pages + Cloudflare DNS; `CNAME` in repo root — push to `master` deploys; allow ~1–2 min).
- **Coaches funnel** (Stage 0.5 validation): `coaches.html` (landing page + Web3Forms waitlist form — English field `name`s so the dashboard/email aren't mojibake) and `coach-demo.html` (hard-coded coach-dashboard demo). Brand assets in `brand/`; OG/share image = `brand/AVATAR-shapeat.jpg` (keep under ~300KB so WhatsApp renders it). The menu screen carries a subtle "מאמן/ה?" link to `coaches.html`.
- **Strategy & go-to-market**: `ROADMAP.md` — business model, coaches/trainees decisions, and the current GTM plan (targeted coach outreach for validation).

## Health Safeguards (app.js)

- **Calorie floor**: `Math.max(target, female ? 1200 : 1500)` after goal offset
- **Dynamic cut deficit**: `min(500, rmr × 0.20)` — scales down for low-RMR users
- **Carb floor**: target raised so protein + fat + 100g carbs all fit (`S.carbWarning` set)
- **BMI warnings**: cut+BMI<20 / bulk+BMI≥30 → shown live on screen 0 and in final menu
- **Bulk-without-training warning** (`trainWarnText`/`S.trainWarning`): bulk goal + no training → sharp red banner (surplus without resistance training = fat, not muscle); shown live on screen 1 and in the final menu
- **Disclaimer**: entry overlay = **active self-declaration** — "general info for healthy adults; any medical condition / regular medication / pregnancy → consult first" + a **required acknowledgment checkbox** (`#disclaimer-ack`); the continue button stays `disabled` until checked and `closeDisclaimer()` is gated on it. There is **no per-condition medical screening** by design (a closed list implies the unlisted is "cleared" — `expressio unius`)
- **Macro accuracy**: best-of-4 meal builds (lean-fat preference) + 3-stage `reconcile()` (protein → fat → carbs-only calories), extra snacks for high targets, 1.6 g/kg protein floor + `S.menuWarning` on infeasible low targets. **Full mechanics + measured accuracy: `.claude/rules/algorithm.md`**
- **Gluten-free**: `allowed()` excludes `gluten`-tagged foods; `gfOnly` items (109, 110) shown only when `gluten_free` selected
- **Kosher**: no meat+dairy in the same meal (`kosherOk` in `buildFromTemplate`); fish+dairy allowed

## Menu Logic Notes (app.js / data.js)

- **Meal templates** (the realism engine): every meal is built from a coherent template (`MEAL_TEMPLATES`) via `buildMeal`→`chooseTemplate`→`buildFromTemplate` — not free category-mixing. Food role flags keep combos realistic. See `algorithm.md`
- **Liked foods**: `pick()` puts liked first (both groups shuffled for variety); liked foods are never lean-swapped away
- **One-type rules**: one tuna type per menu (max one can), one cottage type (3% or 5%)
- **Truthful unit labels**: `plural` field foods are snapped to whole units — "3 תמרים", never "תמר אחד" hiding 72g
- **State persists** to `localStorage['dietai-state']` (restored on load; cleared by reset). All dynamic text rendered via `esc()` (XSS guard for future DB content)
- **The day is the product**: generated menu persists as a day (`localStorage['shapeat-day']`) with ✓ check-offs + progress bar; **planned treats** (`S.treats`, array of TREATS ids 200+) reserve budget before build — multiple allowed (coffee + chocolate), zero-cal treats (Coke Zero) get a "free, no impact" note; **per-item removal** (✏️ edit toggle per meal → ✕ on a row) skips an item locally, with an optional "⚖️ אזן את ההמשך" action (`balanceAfterRemoval` → `rebuildRest`); **"אכלתי משהו אחר"** → `rebuildRest()` rebuilds the rest of the day in 3 tiers (rebuild / light snack / over-target banner). Details: `algorithm.md`, `architecture.md`
- **Fiber**: `fib` per item; daily total shown in the summary (number only)

## Product Images

`images/<id>.jpg` per food, derived from id in `renderMenu()` (`it.f.img` overrides). Sourced from Wikimedia Commons (CC); `images/manifest.json` holds attribution. Shown as a hover-to-enlarge thumbnail in the menu.

## Key ID Ranges (data.js)

| Range | Category |
|-------|----------|
| 2–14 | חלבון מן החי (meat/fish) |
| 15–17 | ביצים (M/L/XL) |
| 20–27 | מוצרי חלב |
| 33–46, 100, 106–110 | דגנים + פריכיות (109 לחם ללא גלוטן, 110 פסטה ללא גלוטן) |
| 47–49 | ירקות עמילניים |
| 50–58 | קטניות (58 = סייטן, vegan-only) |
| 60–74 | ירקות |
| 75–83, 102–105 | פירות |
| 86–93 | שומנים |
| 96–101 | תוספים |
