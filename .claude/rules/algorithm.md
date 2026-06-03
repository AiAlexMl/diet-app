---
paths:
  - "app.js"
---

# Macro & Menu Algorithm

## Diet/allergy filter (`allowed`)

Excludes by avoided-set, allergy tags, and diet: vegan/vegetarian/lactose; **`gluten_free` excludes `gluten`-tagged foods**; `gfOnly` items appear only for GF users; `supplement`/`vegOnly`/`containsMilk`/`optIn` gating as documented in `data-schema.md`.

## Macro Calculation (`calcMacro`)

- **BMR**: Harris-Benedict 1919
- **RMR** = BMR × 1.2
- **Calorie target**:
  - cut: RMR − `min(500, rmr×0.20)` (dynamic deficit, max 20% of RMR)
  - maintain: RMR
  - bulk: RMR + 300
  - Floor: `Math.max(target, female ? 1200 : 1500)`
- **Protein**: `weight × 2g`; if BMI ≥ 30, uses lean-body proxy (`25 × height_m²`) instead
- **Fat floor**: `max(25g men / 40g women, 20% of target ÷ 9)`
- **Carb floor**: if `protein×4 + fat×9 + 400 > target`, target is raised to fit — sets `S.carbWarning`
- **Carbs**: `(target − protein×4 − fat×9) / 4`

## State Flags

- `S.bmiWarning` — set by `buildMenu()`: cut+BMI<20 or bulk+BMI≥30
- `S.carbWarning` — set by `calcMacro()`: when target was raised to meet macro floor

## Menu Building (`buildMenu`)

1. Calls `calcMacro()`
2. Sets `S.bmiWarning` (cut+BMI<20 or bulk+BMI≥30)
3. Selects `MEAL_TIMES` schedule based on `S.time` / `S.noTrain`
4. For each meal calls `buildMeal(def.type, budget, used, ctx)`; shares a `used` Map (grams per food ID) and `ctx.usedCarbCats` for hot-carb variety
5. After all meals: if no fruit was used and `target > 1200`, injects one fruit into the snack
6. **`reconcile(meals)`** (runs last) — adjusts the menu so the daily macros land near target

## Macro reconciliation (`reconcile`) — 3 stages

The build is bottom-up (per-item rounding to `unitG`, `maxDay`/`maxMeal`/`max` clamps, skipped `optional` slots), so raw totals drift. `reconcile(meals)` runs an outer loop (≤3) of three stages so protein & fat land near target and carbs absorb the rest of the calories. Tolerances: `PROT_TOL=0.10`, `FAT_TOL=0.25`, `CAL_TOL=0.08`.

- **Stage 1 — protein → ±10% of `S.proteinG`.** Lever = grams-elastic protein items (`isProt`: meat/fish/legume with no `unitLabel`, not `dip`) **and eggs**. Distributes the protein delta by current-protein share; meats/legumes via `reG`+`clampG` (snap `unitG`, floor `unitG||30`, ceil `min(maxMeal, maxDay, 400)`), eggs via `adjustEgg(it, targetG)` which picks the nearest size (15/16/17 = 53/63/73 g) × count (1–2). Dairy proteins (cottage/yogurt/cheese) are **not** levers (fixed natural portions), so the meat/egg absorbs the delta.
- **Stage 2 — fat → ±25% of `S.fatG` (approximate).** Only lever is **salad olive-oil** (`_oilG`, 0–15 g, label-safe and ~1 g fat per gram). Distributed across all salads, then `recalcSalad`. Other fat foods (nuts/avocado/cheese) have fixed natural-portion labels so are **not** tuned — fat is best-effort/coarse by design.
- **Stage 3 — calories → ±8% of `S.target`.** Distributes the calorie delta across carb levers — grams-elastic `hot_carb`/`grain`/`starch` (no `unitLabel`) **plus count-levers**: sliced bread by slice count (`reBread`, 1–4) and rice/corn cakes by piece count (`reCracker`, 2–6 via `crackerPortion`). Carbs are near-pure carbohydrate, so this barely disturbs Stages 1–2; falls back to other elastic items only if carb headroom is exhausted. Count-levers matter because breakfast/dinner often lack a grams-carb, and crackers are the main carb for gluten-free menus (sliced wheat bread is excluded).

Helpers: `reG(it,g)` re-rounds macros + grams `dispG`; `recalcSalad(sg)` rebuilds a salad group from `_comps`/`_oilG`; `recalcMeal(m)` re-sums meal totals. Natural-portion items (slice/banana/container/cracker) are never rescaled (labels stay truthful). `buildSalad` returns via `recalcSalad` and keeps `_comps`/`_oil`/`_oilG` so the oil stays tunable.

## Meal Templates (the realism mechanism)

Meals are built from **templates** (`MEAL_TEMPLATES` keyed by `breakfast`/`hot`/`snack`/`dinner`), not free category-mixing — so every meal is a coherent plate by construction.

`buildMeal(type)` → `chooseTemplate()` (keep templates whose required slots are fillable for the diet; prefer ones containing a liked food; weighted-random) → `buildFromTemplate()` fills each slot.

A **slot**: `{ match(f,used) | special, calPct, protPct?, max, optional?, spread? }`.
- `special`: `'salad'`→`buildSalad`; `'hotveg'`/`'hotveg_or_salad'`→`buildSingleVeg`/(~40% hot veg else salad); `'hot_carb'`→prefers an unused carb category via `ctx.usedCarbCats`; `'hot_side'`→one starchy side that is a **legume** (if liked / ~25%) **or** a `hot_carb` — never both; `'dip'`→optional hummus/tahini side (~25% / if liked), its own row.
- a template may carry `when(used)` (e.g. the `legume` hot template is feasible only when no meat/fish is available — vegetarians/vegans).
- otherwise `pick()` from `ALL.filter(match)`.
- `spread:'ifAlone'` → `makeSpread()` adds a condiment (tahini/PB) to a bread/cracker **only if the meal has no protein yet** (so cottage/egg/tuna meals get no spread). The bread's `displayName` shows "עם X"; the spread is a **separate row** with its own grams/calories.
- **Pita** (39,40, `pita` flag): dropped from bread pools unless the slot has `pitaOk` (only the eggs breakfast bread slot), and even there only ~30% of builds. All other bread slots use the `_sliced` matcher (sliced bread / crackers, no pita).
- **dairy_fruit** snack pairs fruit only with cottage/yogurt; white/yellow cheese go to `cracker_cheese` / cheese-bread (always with a carb), never alone with fruit.
- **fruit_nuts** snack / oats nut slot use `nuts` only (almonds/walnuts/cashews) — not avocado/olives (those are salad extras).
- **yogurt_bowl** topping is **granola only** (cooked oats 41 don't belong in a yogurt bowl); topping is optional so yogurt+fruit still works.

Templates: **breakfast** eggs / cheese / yogurt_bowl / porridge / cornflakes / oats_water / bread_spread (vegan-gated: bread+spread+fruit/nuts, `when` no egg/dairy — covers vegan & vegan+GF whose oats are gluten-excluded); **hot** meat (w3) / legume (w1, veg-only) — **always a cooked meat/fish (or legume) main + carb; no canned tuna here**; **snack** dairy_fruit / fruit_nuts / cracker_cheese / shake; **dinner** cheese_bread / tuna_bread / big_salad (canned tuna lives here).

**`big_salad` protein** = egg/cheese (animal). A legume satisfies it **only when the user has no animal protein available** (`!hasAnimalProtein()` — no allowed egg/meat/fish/dairy), i.e. vegans. For omnivores/vegetarians, beans are never "the protein" of a salad meal (they get egg/cheese); vegan dinners stay feasible via legume/tofu.

## Food role flags (enforce realism, set in `data.js`)

- `condiment` (olive oil, tahini, peanut butter) — never standalone; only via `attachSpread` on bread/cracker
- `drink` (milk) — never a protein; only the `milk` slot in cornflakes template
- `complete` (oatmeal-with-milk 106) — self-contained breakfast; its template has no protein slot
- `dip` (hummus-spread 52, tahini 91) — a side dip in hot meals; excluded from legume main/side pools

Legumes for **omnivores**: only a side in a meat meal (`hot_side`) or in `big_salad` — never a standalone hot main. For **vegetarians/vegans** the `legume` hot template is the main (legume + grain + veg), since no meat is available.

## Tuna rule

`tunaUsed(used)` gates all tuna pools: only one tuna type per menu, capped at one can (`maxDay:160`).

## `buildSalad` Rules

- Requires ≥ 2 **regular** (`salad` tag, not `salad_only`) vegetables as base
- Optional 3rd veg from `salad_only` pool (lettuce, cabbage, onion) or a 3rd regular veg
- Olive oil (id:86) always added if permitted — **5g (כפית)**, no daily-use restriction
- Parts display (`fmtPart`): each part shows its `unitLabel` (e.g. "חצי פלפל אדום", "עגבנייה בינונית") — no "name (label)" parentheses; pepper labels include the colour so they stay unambiguous
- Salad extra: optionally adds **avocado (87) or olives (93)** as a savory salad component (when liked or ~30%) — that's their home, never paired with fruit

## Portion Helpers

- `eggDisplay(g, unitW, size)` — rounds to 1–2 eggs by weight, appends size label (M/L/XL)
- `crackerPortion(targetG, unitW)` — snaps to 2–6 pieces using the cracker's own `unitG`
- `cottagePortion(targetG)` — 250g full / 125g half container

## `pick()` Priority

1. Foods in `S.liked` → `allowed()` → not in `used` — **shuffled** (Fisher-Yates)
2. All other allowed foods not yet used — **also shuffled** (for menu variety across regenerations)
3. Serving size: calculated from calorie/protein budget, snapped to `unitG`, clamped to `maxDay`/`maxMeal`

Liked foods always outrank non-liked (liked group comes first); both groups are shuffled internally so menus vary while preferences are still honored. `buildSalad` and `buildSingleVeg` shuffle their non-liked pools the same way.

## `mkItem()` Return Shape

```js
{ f, g, dispG, displayName?, cal, p, c, fat, fib }
```
- `displayName` set only for eggs: "חביתה מביצה אחת (L)"; `dispG` is `''`
- All other items: `displayName` is `undefined`; `dispG` holds the portion string
- `fib` — fiber grams for the served portion (`f.fib || 0`); meals sum it to `totFib`, daily total shown in summary with a `~14g/1000kcal` target hint
