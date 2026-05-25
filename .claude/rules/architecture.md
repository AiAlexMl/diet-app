# Architecture

Pure client-side web app (HTML + CSS + vanilla JS), Hebrew RTL. No build step, no modules, no framework.

**Script load order is strict** — `index.html` loads in this exact sequence:
1. `data.js` — `DB` (food database) and `MEAL_TIMES` (meal schedule templates)
2. `app.js` — global state `S`, `calcMacro()`, `buildMenu()` and all builder functions
3. `ui.js` — DOM manipulation, `goTo()`, `renderMenu()`

`ui.js` calls functions and reads variables defined in both `data.js` and `app.js`.

**5 screens** toggled via CSS `.active` class — no routing.

**Global state `S`** (defined in `app.js`):
- User inputs: `gender`, `goal`, `age`, `height`, `weight`, `diet` (Set), `allergy` (Set), `time`, `noTrain`
- User selections: `liked` (Set of food IDs), `avoided` (Set of food IDs)
- Computed macros: `bmr`, `rmr`, `target`, `proteinG`, `fatG`, `carbG`
- Runtime flags: `bmiWarning` (string | null) — set by `buildMenu()` when BMI < 20 and goal is cut
