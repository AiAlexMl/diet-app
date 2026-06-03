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

## Health Safeguards (app.js)

- **Calorie floor**: `Math.max(target, female ? 1200 : 1500)` after goal offset
- **Dynamic cut deficit**: `min(500, rmr × 0.20)` — scales down for low-RMR users
- **Carb floor**: target raised so protein + fat + 100g carbs all fit (`S.carbWarning` set)
- **BMI warnings**: cut+BMI<20 / bulk+BMI≥30 → shown live on screen 0 and in final menu
- **Disclaimer**: overlay on load (`closeDisclaimer()`)
- **Calorie accuracy**: `reconcile(meals)` runs last in `buildMenu()` — nudges elastic grams-based carbs (then protein) so the daily total lands within **±8%** (`CAL_TOL`) of `S.target`; natural-portion items (slice/banana/container/egg/cracker) are never rescaled
- **Gluten-free**: `allowed()` excludes `gluten`-tagged foods (wheat/rye bread, pasta, pita, bulgur, granola, cornflakes, oats) and shows `gfOnly` items (GF bread 109, GF pasta 110) only when `gluten_free` is selected

## Menu Logic Notes (app.js / data.js)

- **Liked foods**: `pick()` puts liked first (shuffled for variety); legumes and fats are in the protein/snack pools so liked items there actually appear (and vegetarians get protein)
- **Tuna**: `tunaUsed()` — one tuna type per menu, max one can
- **Hot veg**: `buildHotMeal` serves a hot vegetable ~40% of the time instead of salad (gives broccoli etc. a chance)
- **Morning workout**: post-workout meal is `breakfast` type (not a hot meal)
- **Fiber**: `fib` per item; daily total shown in summary vs `~14g/1000kcal` target

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
| 50–57 | קטניות |
| 60–74 | ירקות |
| 75–83, 102–105 | פירות |
| 86–93 | שומנים |
| 96–101 | תוספים |
