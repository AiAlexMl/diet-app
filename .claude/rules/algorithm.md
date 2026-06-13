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
3. `mealPlan(key, target)` picks the `MEAL_TIMES` schedule (by `S.time`/`S.noTrain`) and **appends extra snacks for high calorie targets** (>2300 → +1, >2600 → +2, >3100 → +3, at 10:30/16:00/21:30), re-sorted by time and `pct` re-normalised — so a bulk's calories spread over 5–7 meals instead of ballooning single portions.
4. **Budget-aware order**: builds the **non-hot** meals first (mostly unit portions), then the **hot** meal(s) last with `budget = target − Σ(other meals' cal)` (split by `pct` if two hot meals) — so the gram-weighted meat+carb fill the gap from the start. Display order is the original schedule order.
5. Each meal is built via `buildMealBest(type, budget, used, ctx)` — runs `buildMeal` 4× (random templates), each on a **cloned** `used` Map, and keeps the best by score = calorie-fit **+ a lean-fat preference** (penalises fat above the meal's expected share `S.fatG·budget/target`). This "swap a meal that fits better" both hits the budget and steers toward lean foods (chicken breast over thigh, 0% yogurt, white over yellow cheese) so fat stays near target **from the source** — the biggest fat lever, since most fat comes from fixed-portion protein foods. Shares the `used` Map and `ctx.usedCarbCats`.
6. After all meals: if no fruit was used and `target > 1200`, injects one fruit into the snack
7. **`reconcile(meals)`** (runs last) — adjusts the menu so the daily macros land near target

## Macro reconciliation (`reconcile`) — 3 stages

The build is bottom-up (per-item rounding, clamps, skipped `optional` slots), so raw totals drift. `reconcile(meals)` runs an outer loop (≤6) of three stages so protein & fat land near target and carbs absorb the rest of the calories. Tolerances: `PROT_TOL=0.07`, `FAT_TOL=0.08`, `CAL_TOL=0.04`. Per-item caps: protein ≤350 g (`clampG`), carbs ≤450 g (`CARBCAP`).

- **Stage 1 — protein → ±7% of `S.proteinG`.** Lever = grams-elastic protein items (`isProt`: meat/fish/legume with no `unitLabel`, not `dip`) **and eggs**. Distributes the protein delta by current-protein share; meats/legumes via `reG`+`clampG`, eggs via `adjustEgg(it, targetG)` (nearest size 15/16/17 = 53/63/73 g × count 1–2). Dairy proteins (cottage/yogurt/cheese) are fixed, so the meat/egg absorbs the delta.
- **Stage 2 — fat → ±8% of `S.fatG`**, via `adjustFat(meals)`. **Raise:** salad oil (`_oilG` 0–15 g) → scale **present nuts** (`reNuts`, 10–40 g) → if no nuts exist, **inject a small nut portion (10–35 g) into the snack**. **Lower:** protein-preserving lean-ify swaps `LEANER = {9→10, 20→21, 24→23}` (tuna-in-oil→water, cottage 5%→3%, yogurt 5%→0%) → shrink oil → present nuts → if still over, **swap the fattest meat/fish for the leanest allowed same-tag protein** (`reG` to keep protein grams). **Liked foods are never swapped/lean-ified** — preferences win, so a liked schnitzel/salmon stays even if fat then runs high. The main fat control, though, is the lean-fat preference in `buildMealBest` (above) — it also keeps fatty items like schnitzel (id 3, `gluten`) out of default menus unless the user likes them. Hard case: liked fatty proteins + no oil to remove → fat stays high (accepted).
- **Stage 3 — calories → ±4% of `S.target`, carbs only.** Distributes the calorie delta across carb levers **only** — grams-elastic `hot_carb`/`grain` (no `unitLabel`, cap 450 g) **plus count-levers**: sliced bread (`reBread`, 1–4), rice/corn cakes (`reCracker`, 2–6), and **unit starches** (`reUnit`, 1–3 units of sweet potato/potato/corn — was the main undershoot source when a starch was the day's hot carb). It **never grows protein to fill calories** — protein is owned by Stage 1 (which raises it to target when low) — so protein can't overshoot. If carbs are exhausted, the menu **accepts a small calorie undershoot** rather than inflate protein. The loop early-exits only when calories **and** protein **and** fat are all in band. (To keep carb capacity, the hot meal's `hot_side` is a legume only when the user likes one — otherwise an elastic grain, so there's always something to grow.)

**Post-loop infeasibility resolve** (runs once after the loop, so no oscillation with Stage 1): if calories still **overshoot** (`dCal > target·(1+CAL_TOL)`) — e.g. liked fatty foods or bulky plant protein on a low (cut) target — shrink the grams-elastic protein items (incl. liked, *portion only, never swapped*) proportionally, clamped so daily protein stays ≥ **1.6 g/kg** (`S.proteinG×0.8`; for vegans the target is already 1.6 so no room). If it *still* overshoots, set **`S.menuWarning`** (shown as a banner) telling the user the preferences/target can't be met precisely.

Helpers: **`setMacros(it, f, g)`** is the single source of truth for an item's `cal/p/c/fat/fib` (food values are per-100g) — reused by `mkItem` and every lever. `reG`/`reBread`/`reCracker`/`reUnit`/`reNuts`/`adjustEgg` set `g`+`dispG` then call it; `recalcSalad(sg)` rebuilds a salad group from `_comps`/`_oilG`; `recalcMeal(m)` re-sums meal totals. **Truthful unit labels**: any food with `plural`+`unitG` is snapped to whole units by `mkItem` and labeled "N {plural}" ("3 תמרים", "2 בננות בינוניות") — the label always matches `g`. Other natural-portion items are never rescaled. `buildSalad` returns via `recalcSalad` and keeps `_comps`/`_oil`/`_oilG` so the oil stays tunable.

**Measured accuracy** (sim over thousands of menus, incl. 30k fuzz with 0 crashes/NaN): protein ~±3% (worst +10%, never the old 200 g+ blowups), fat ~±4%, calories: maintain median ~2%, p90 ~6%, only ~2% of menus deviate >10% (was 12% before the starch unit lever). The old egg-maxDay micro-issue is gone (one egg dish per menu via `VARIANT_GROUPS`). **Residual undershoot**: bulk ~−5% (GF-bulk ~−8%) even with 5–7 meals — high targets are carb-limited, worst for gluten-free. **Inherent limits**: vegan protein ~20% short of `weight×1.6` (plants are protein-poor; seitan helps when present); fat can't drop if every liked protein is fatty; and a low target + fatty/plant-only protein triggers the `S.menuWarning` (cut female + schnitzel+cheese ~25%, small vegan cut ~50%). Empty meals only when the user avoids ~45%+ of foods.

## Planned treats (`S.treats`)

`S.treats` is an **array** of `TREATS` ids (data.js, ids 200+) — multiple allowed (e.g. coffee + chocolate). In `buildMenu`: the treats' **summed** calories/fat/carbs are subtracted from the targets **before** building (protein untouched; floors 800 kcal / 20g fat / 50g carbs), the menu is built+reconciled against the reduced target, then `S.target` is restored and one standalone `type:'treat'` card holding **all** treat items is appended (never touched by reconcile). Over-target / >25% warnings use the **sum**. **Zero-cal treats** (Coke Zero, `cal:0`): no budget is reduced, warnings stay silent, the note becomes "🥤 על חשבון הבית — בלי השפעה" (`treatBuildNote`), and the workout-window treat-tip is suppressed when the treat card total `cal === 0`. UI: picker overlay (`openTreatPicker`); `chooseTreat` **pushes** to `S.treats` (mid-day add appends to the existing card + `rebalanceDay`; pre-eaten = full rebuild). `removeTreatItem(idx)` drops one treat (frees budget → `rebalanceDay`); `removeTreat` clears all. `S.treats` is restored from the treat card on day reload (`loadDay`). Rebuilding wipes day check-marks behind a confirm.

## Per-item removal (`removeItem` / `balanceAfterRemoval`)

Each meal card has a ✏️ **edit toggle** (`toggleMealEdit`, pure CSS `.editing` class; hidden on `type:'treat'` and ✓-eaten meals) that reveals an ✕ on every item row. ✕ = `removeItem(mi, ii)` — **"just skip"**: splices the item, `recalcMeal`, drops it from the daily summary/progress, **no rebuild** (other meals untouched); empty meal → `m.removed = true`. A green note explains it and offers an opt-in **"⚖️ אזן את ההמשך"** button via the transient `DAY.noteAction` field (rendered beside `DAY.note`, not persisted). `balanceAfterRemoval(mi)` reuses `rebuildRest` (locks the edited meal as eaten with its **remaining** items — the user ate the rest — and rebuilds only the untouched meals); if the meal was emptied it falls back to plain `rebalanceDay`. Treat rows instead show an always-visible ✕ → `removeTreatItem`.

## Day correction — `rebuildRest(meals, eaten, mealIdx, actualItem)`

"אכלתי משהו אחר": replaces the reported meal's items with what was actually eaten — **one or more items** (UI cart: TREATS / DB search+grams / `manualItem(name, cal)` — conservative macros: p=0, 60/40 carb/fat), locks all eaten meals (+ a not-yet-eaten planned treat), computes remaining targets, and acts by tier (every tier returns a `note` shown as the green day banner — the full-rebuild tier explicitly says the change is **for today only**):
**Workout meals are protected** (`m.tag` = pre/post): never removed in any tier — muscle preservation beats a small calorie overage. In tiers 2/3 they become a light **protein snack** (`proteinSnack`: snack template, falls back to a direct protein pick — cheese/yogurt/egg/meat/fish/legume — if the template came out low-protein); the tier notes mention the kept workout meal.
- **`tR ≤ 0`** (crossed daily target): open meals removed (workout meals → protein snack), positive banner with the overage ("חצית את היעד... מחר דף חדש"; no punishment meals, no compensating deficit — safety by design).
- **`0 < tR < 300`**: keepers = open workout meals (or one light snack if none) + supportive note; the rest removed.
- **`tR ≥ 300`**: full rebuild of open meals with the existing engine — `buildMealBest` per meal + `reconcile` — against temporarily-swapped `S` targets (restored in `finally`). **Two-way meal-count adaptation**: drops trailing **untagged** meals while `tR/openCount < 260` (workout meals never dropped), adds 1–3 extra snacks when `perMeal > 450/600/800` (cap: 6 open meals). The mid-day treat add/remove flows (`chooseTreat`/`removeTreat` in ui.js) reuse `rebalanceDay` without touching eaten meals.

**Measured** (2000 random disrupted days): 0 crashes/NaN; ~15% hit the over/light tiers; of the fully-rebuilt days ~93% land within ±12% of the original daily target (the residual is structural — e.g., the hot meal was the one replaced).

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

## Variant groups (one per menu)

`VARIANT_GROUPS = [[20,21],[15,16,17]]`, enforced by `variantBlocked(f, used)` inside `pick()`: one cottage type (3%/5%) and **one egg dish per menu** (M/L/XL are separate ids, so `used` alone wouldn't block a second omelet). `adjustEgg` additionally **respects a liked egg size** — if the user liked specific size(s), it only resizes within them. Together these also eliminate the old egg-maxDay micro-bug (two meals converging on the same egg id). The `LEANER` swap (20→21) is safe: replaces in place and checks `usedIds`.

## Kosher rule

`kosherOk(f, mealTags)` (checked in `buildFromTemplate` on the generic-slot and dip pools): when `kosher` is selected, a meal never mixes `meat` and `dairy` (fish+dairy stays allowed — tuna+cottage is fine). `mealTags` accumulates the tags of items already in the meal. Templates never mix the two anyway — this is an explicit guarantee that survives future templates. The `adjustFat` swaps are same-category (meat→meat, fish→fish, dairy→dairy) so they can't break it.

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
