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
- **Internal docs live in `internal/` (a separate PRIVATE repo, gitignored here)**: the public repo is indexed by Google, so anything with real people's names, leads, strategy, pricing, or competitor analysis goes in `internal/`, never here. Contents: `internal/ROADMAP.md` (strategy & GTM), `internal/ARCHITECTURE-COACHES.md` (binding technical design for the coaches layer — read before implementing anything coach/backend related), `internal/outreach-coaches.md` (coach leads + DMs), `internal/POST-LOG.md`, `internal/reel-v2-upload-kit.md`. Commit/push `internal/` separately (its own git remote: `AiAlexMl/shapeat-internal`).
- **Instagram posts (workflow)**: `internal/POST-LOG.md` is the **canonical log** of everything published/planned. **Before creating any new IG post / reel / story, read it first** — check what already shipped and which angles are taken (the "זוויות תפוסות" line) — and only then decide on content, so posts don't repeat. After building one, log it there (full date, status, actual caption). Reel/post assets + sources live under `brand/posts/<name>/` (public — published content only); reels are built with HyperFrames (scaffold lives outside the repo, see the asset's `README.md`).

## Health Safeguards (app.js)

- **Calorie floor**: `Math.max(target, female ? 1200 : 1500)` after goal offset
- **Dynamic cut deficit**: `min(500, rmr × 0.20)` — scales down for low-RMR users
- **Carb floor**: target raised so protein + fat + 100g carbs all fit (`S.carbWarning` set)
- **BMI warnings**: cut+BMI<20 / bulk+BMI≥30 → shown live on screen 0 and in final menu (`bmiWarnText`)
- **BMI hard-stops** (`buildBlockText` in app.js; gate in `renderMenu`→`renderBuildBlock`): harmful goal×BMI combos **refuse to build** and show a referral card instead — **cut + BMI<18.5** (deficit for underweight = clinical harm + ED red flag) and **bulk + BMI≥35** (surplus for class-2 obesity; threshold 35 not 30 because BMI can't tell muscle from fat — 30–35 stays a warning). Safety-by-design, not medical triage (refuses a harmful output from the user's own numbers)
- **Bulk-without-training warning** (`trainWarnText`/`S.trainWarning`): bulk goal + no training → sharp red banner (surplus without resistance training = fat, not muscle); shown live on screen 1 and in the final menu
- **Disclaimer**: entry overlay = **active self-declaration** — "general info for healthy adults; any medical condition / regular medication / pregnancy → consult first" + a **required acknowledgment checkbox** (`#disclaimer-ack`); the continue button stays `disabled` until checked and `closeDisclaimer()` is gated on it. There is **no per-condition medical screening** by design (a closed list implies the unlisted is "cleared" — `expressio unius`)
- **Macro accuracy**: best-of-4 meal builds + 3-stage `reconcile()`, 1.6 g/kg protein floor, `S.menuWarning` on infeasible low targets. **Full mechanics + measured accuracy: `.claude/rules/algorithm.md`**
- **Gluten-free**: `allowed()` excludes `gluten`-tagged foods; `gfOnly` items (109, 110) shown only when `gluten_free` selected
- **Kosher**: no meat+dairy in the same meal (`kosherOk` in `buildFromTemplate`); fish+dairy allowed

## Menu Logic Notes

- **The day is the product**: the generated menu persists as a **day** (`localStorage['shapeat-day']`) with ✓ check-offs + progress bar; **planned treats** reserve budget before build; **per-item removal** and **"אכלתי משהו אחר"** rebuild the rest of the day. This daily-companion loop, not the one-shot menu, is the north star.
- **Realism engine**: every meal is built from a coherent `MEAL_TEMPLATES` template (not free category-mixing); liked foods come first and are never lean-swapped; `plural` foods snap to truthful whole-unit labels with per-meal portion caps.
- **Full mechanics live in the scoped rules** (don't duplicate here): macro calc / `reconcile()` / treats / removal / `rebuildRest` / templates / variant-tuna-kosher rules → `.claude/rules/algorithm.md`; state + day persistence → `architecture.md`; rendering / print-to-PDF / `esc()` XSS guard → `ui-rendering.md`; food schema, tags, image derivation, and the full **ID-ranges + TREATS** table → `data-schema.md`.
