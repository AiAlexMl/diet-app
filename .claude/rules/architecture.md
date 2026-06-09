---
paths:
  - "app.js"
  - "ui.js"
  - "index.html"
---

# Architecture

Pure client-side web app (HTML + CSS + vanilla JS), Hebrew RTL. No build step, no modules, no framework.

**Script load order is strict** — `index.html` loads in this exact sequence:
1. `data.js` — `DB` (food database) and `MEAL_TIMES` (meal schedule templates)
2. `app.js` — global state `S`, `calcMacro()`, `buildMenu()` and all builder functions
3. `ui.js` — DOM manipulation, `goTo()`, `renderMenu()`

`ui.js` calls functions and reads variables defined in both `data.js` and `app.js`.

**5 screens** toggled via `display:none` / `display:block` — no routing. Step-bar dots updated via `.done` / `.active` classes.

## Global State `S` (defined in `app.js`)

- **User inputs**: `gender`, `goal`, `age`, `height`, `weight`, `diet` (Set), `allergy` (Set), `time`, `noTrain`
- **User selections**: `liked` (Set of food IDs), `avoided` (Set of food IDs)
- **Computed macros**: `bmr`, `rmr`, `target`, `proteinG`, `fatG`, `carbG`
- **Runtime flags**:
  - `bmiWarning` (string | null) — set by `buildMenu()` when cut+BMI<20 or bulk+BMI≥30
  - `carbWarning` (string | null) — set by `calcMacro()` when target was raised to meet macro floor
  - `menuWarning` (string | null) — set by `reconcile()` when calories can't meet the target even after shrinking protein to the 1.6 g/kg floor (fatty/plant-only protein on a low target)

The meal **count is dynamic**: `mealPlan(key, target)` adds 1–3 snacks for high (bulk) targets, so a day can have 4–7 meals.

## Key UI Functions (ui.js)

| Function | Description |
|----------|-------------|
| `goTo(n)` | Navigate to screen n; calls `updateMacroDisplay()`, renders food grids on screens 2–3 |
| `updateMacroDisplay()` | Reads form inputs → `calcMacro()` → updates RMR box + live BMI warning on screen 0 |
| `renderMenu()` | Calls `buildMenu()`, builds full HTML, navigates to screen 4 |
| `resetApp()` | Clears all Sets, resets goal/time/noTrain, resets all chip/button UI, calls `goTo(0)` |
| `renderGrid(mode)` | Renders category tabs (with badge counts) + food cards for `'like'` or `'avoid'` mode |
| `toggleFood(mode, id)` | Toggles a food in `S.liked`/`S.avoided`, updates card UI + calls `updateTabBadges()` |
| `updateTabBadges(mode)` | Updates badge counts on all category tabs without re-rendering the food grid |
| `closeDisclaimer()` | Hides the disclaimer overlay |
