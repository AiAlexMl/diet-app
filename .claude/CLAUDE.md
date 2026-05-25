# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

Open `index.html` directly in a browser — no server, build step, or package manager required.

## Architecture

Pure client-side web app (HTML + CSS + vanilla JS), written in Hebrew with RTL layout.

**Script load order is strict** — `index.html` loads scripts in this sequence:

1. `data.js` — defines `DB` (food database, ~99 items) and `MEAL_TIMES` (4 meal schedule templates keyed by `noTrain | morning | noon | evening`)
2. `app.js` — global state object `S`, macro calculation (`calcMacro`), and the menu-building algorithm (`buildMenu`)
3. `ui.js` — DOM manipulation, screen navigation (`goTo`), and the final `renderMenu` that wires everything together

`ui.js` calls functions and reads variables defined in both `data.js` and `app.js`. There is no module system.

**Global state** lives in `S` (defined in `app.js`):
- User inputs: `gender`, `goal`, `age`, `height`, `weight`, `diet` (Set), `allergy` (Set), `time`, `noTrain`
- User selections: `liked` (Set of food IDs), `avoided` (Set of food IDs)
- Computed macros: `bmr`, `rmr`, `target`, `proteinG`, `fatG`, `carbG`
- Runtime flags: `bmiWarning` (string or null) — set by `buildMenu()` when BMI < 20 and goal is cut

**5 screens** are toggled via CSS `.active` class — no routing, no framework.

## Food Database (`data.js`)

Each food item schema:
```js
{ id, name, prep, p, c, f, cal, tags[], unitG?, unitLabel?, maxDay?, maxMeal?, isEgg?, halfLabel? }
```

`tags` drive all filtering logic. Key tags: `meat`, `fish`, `tuna`, `egg`, `dairy`, `grain`, `hot_carb`, `bread`, `cracker`, `breakfast`, `salad`, `salad_only`, `hot_veg`, `veg`, `starch`, `legume`, `fruit`, `fat`, `oil`, `nuts`, `peanuts`, `sesame`, `soy`, `supplement`.

**`salad` vs `salad_only`:** items tagged `salad` can appear standalone (via `buildSingleVeg`) or in a composite salad. Items tagged `salad_only` (lettuce, cabbage, onion) appear **only** inside a composite salad — never alone.

`maxDay` / `maxMeal` cap how much of a food can appear per day / per meal (e.g., tuna: 160g/day, eggs: 120g/day).

## Macro & Menu Algorithm (`app.js`)

- **BMR**: Harris-Benedict 1919; **RMR** = BMR × 1.2
- **Calorie target**: RMR − 500 (cut) / RMR (maintain) / RMR + 300 (bulk)
- **Protein**: `weight × 2g` (if BMI ≥ 30, uses lean-body proxy weight instead)
- **Fat floor**: 25g men / 40g women, or 20% of calories — whichever is higher
- **Carbs**: remainder after protein + fat calories

`buildMenu()` selects a `MEAL_TIMES` template, then calls one builder function per meal slot (`buildBreakfast`, `buildHotMeal`, `buildTunaMeal`, `buildDinner`, `buildSnack`). Each builder calls `pick()` which prioritizes foods in `S.liked`, respects `allowed()` (diet/allergy filters), and tracks cumulative per-day usage in a `Map`.

`buildMenu()` also maintains a `usedCarbCats` Set (`'grain'` / `'starch'`) passed to hot-meal builders to ensure carb variety across meals.

**Nutritional rules enforced by builders:**
- Breakfast: dairy/egg proteins only (no meat)
- Hot carbs (rice, pasta, etc.): only paired with hot meat/fish — never tuna cans
- Carb variety: if `grain` was used in one hot meal, next hot meal prefers `starch` (sweet potato, potato) and vice versa
- Salad (`buildSalad`): requires ≥ 2 regular (`salad` tag, non-`salad_only`) vegetables as base; olive oil always included; optional 3rd veg from `salad_only` pool (lettuce/cabbage/onion)
- Salad parts display: uses `f.name` to avoid duplicates (e.g., "פלפל אדום" vs "פלפל צהוב"), with portion info appended
- Eggs: displayed as "חביתה מביצה אחת/שתיים" via `displayName` field on the item; capped at 2/day
- Tuna: capped at 1 can/day; cottage: shown as whole or half container
- Fruit guarantee: if no fruit appeared in any meal and `target > 1200`, one fruit is injected into the snack after all meals are built
- BMI warning: if goal is `cut` and BMI < 20, `S.bmiWarning` is set and displayed as an orange banner on the menu screen

**`mkItem()` return shape:** `{ f, g, dispG, displayName?, cal, p, c, fat }` — `displayName` is set only for eggs and overrides `f.name` in the UI.

**Prep display (ui.js):** food row names in the menu append `f.prep` when not already present in `f.name` (e.g., "בטטה אפויה", "ברוקולי מאודה").

## Planned Features (not yet implemented)

- Interactive food swap on the menu screen
- Save menu / export to PDF
- Coach/trainer version
- Integration with FoodsDictionary API
