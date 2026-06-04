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
- **Protein**: `weight × 2g` (**vegans: × 1.6g** — hard to reach 2 from plants); if BMI ≥ 30, uses lean-body proxy (`25 × height_m²`) instead
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
4. **Budget-aware order**: builds the **non-hot** meals first (mostly unit portions), then the **hot** meal(s) last with `budget = target − Σ(other meals' cal)` (split by `pct` if two hot meals) — so the gram-weighted meat+carb fill the gap from the start. Display order is the original schedule order.
5. Each meal is built via `buildMealBest(type, budget, used, ctx)` — runs `buildMeal` 4× (random templates), each on a **cloned** `used` Map, and keeps the best by score = calorie-fit **+ a lean-fat preference** (penalises fat above the meal's expected share `S.fatG·budget/target`). This "swap a meal that fits better" both hits the budget and steers toward lean foods (chicken breast over thigh, 0% yogurt, white over yellow cheese) so fat stays near target **from the source** — the biggest fat lever, since most fat comes from fixed-portion protein foods. Shares the `used` Map and `ctx.usedCarbCats`.
6. After all meals: if no fruit was used and `target > 1200`, injects one fruit into the snack
7. **`reconcile(meals)`** (runs last) — adjusts the menu so the daily macros land near target

## Macro reconciliation (`reconcile`) — 3 stages

The build is bottom-up (per-item rounding, clamps, skipped `optional` slots), so raw totals drift. `reconcile(meals)` runs an outer loop (≤6) of three stages so protein & fat land near target and carbs absorb the rest of the calories. Tolerances: `PROT_TOL=0.07`, `FAT_TOL=0.08`, `CAL_TOL=0.04`. Per-item caps: protein ≤350 g (`clampG`), carbs ≤450 g (`CARBCAP`).

- **Stage 1 — protein → ±7% of `S.proteinG`.** Lever = grams-elastic protein items (`isProt`: meat/fish/legume with no `unitLabel`, not `dip`) **and eggs**. Distributes the protein delta by current-protein share; meats/legumes via `reG`+`clampG`, eggs via `adjustEgg(it, targetG)` (nearest size 15/16/17 = 53/63/73 g × count 1–2). Dairy proteins (cottage/yogurt/cheese) are fixed, so the meat/egg absorbs the delta.
- **Stage 2 — fat → ±8% of `S.fatG`**, via `adjustFat(meals)`. **Raise:** salad oil (`_oilG` 0–15 g) → scale **present nuts** (`reNuts`, 10–40 g) → if no nuts exist, **inject a small nut portion (10–35 g) into the snack**. **Lower:** protein-preserving lean-ify swaps `LEANER = {9→10, 20→21, 24→23}` (tuna-in-oil→water, cottage 5%→3%, yogurt 5%→0%) → shrink oil → present nuts → if still over, **swap the fattest meat/fish for the leanest allowed same-tag protein** (`reG` to keep protein grams). The main fat control, though, is the lean-fat preference in `buildMealBest` (above). Hard case: every liked protein is fatty (e.g. salmon + yellow cheese) and no oil to remove → fat stays high.
- **Stage 3 — calories → ±4% of `S.target`, carbs only.** Distributes the calorie delta across carb levers **only** — grams-elastic `hot_carb`/`grain`/`starch` (no `unitLabel`, cap 450 g) **plus count-levers**: sliced bread (`reBread`, 1–4) and rice/corn cakes (`reCracker`, 2–6). It **never grows protein to fill calories** — protein is owned by Stage 1 (which raises it to target when low) — so protein can't overshoot. If carbs are exhausted, the menu **accepts a small calorie undershoot** rather than inflate protein. The loop early-exits only when calories **and** protein **and** fat are all in band. (To keep carb capacity, the hot meal's `hot_side` is a legume only when the user likes one — otherwise an elastic grain, so there's always something to grow.)

Helpers: **`setMacros(it, f, g)`** is the single source of truth for an item's `cal/p/c/fat/fib` (food values are per-100g) — reused by `mkItem` and every lever. `reG`/`reBread`/`reCracker`/`reNuts`/`adjustEgg` set `g`+`dispG` then call it; `recalcSalad(sg)` rebuilds a salad group from `_comps`/`_oilG`; `recalcMeal(m)` re-sums meal totals. Natural-portion items (slice/banana/container) are never rescaled (labels stay truthful). `buildSalad` returns via `recalcSalad` and keeps `_comps`/`_oil`/`_oilG` so the oil stays tunable.

**Measured accuracy** (sim over thousands of menus): protein ~±3% (worst case +9%, never the old 200 g+ blowups), fat ~±4%, calories ~±4% — except **bulk ~−9%** (eating that many calories of whole food is genuinely hard) and other carb-poor menus may undershoot calories a little. **Inherent limit**: vegan protein falls ~20% short of `weight×1.6` (plants are protein-poor; seitan helps when present); and fat can't drop if every liked protein is fatty (salmon + yellow cheese, no salad oil).

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

- `condiment` (olive oil, tahini, peanut butter) — never standalone; only via `makeSpread` on bread/cracker
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
- `fib` — fiber grams for the served portion (`f.fib || 0`); meals sum it to `totFib`, daily total shown in the summary (number only, no target hint)
