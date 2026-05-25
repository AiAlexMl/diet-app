---
paths:
  - "app.js"
---

# Macro & Menu Algorithm

## Macro Calculation (`calcMacro`)

- **BMR**: Harris-Benedict 1919
- **RMR** = BMR × 1.2
- **Calorie target**: RMR − 500 (cut) / RMR (maintain) / RMR + 300 (bulk)
- **Protein**: `weight × 2g`; if BMI ≥ 30, uses lean-body proxy (`25 × height_m²`) instead
- **Fat floor**: max(25g men / 40g women, 20% of target calories ÷ 9)
- **Carbs**: remainder = `(target − protein×4 − fat×9) / 4`

## Menu Building (`buildMenu`)

1. Calls `calcMacro()`
2. Sets `S.bmiWarning` if goal is `cut` and BMI < 20
3. Selects `MEAL_TIMES` template based on `S.time` / `S.noTrain`
4. Builds each meal via dedicated builder; shares a `used` Map (tracks grams per food ID) and a `usedCarbCats` Set (`'grain'`/`'starch'`) for carb variety
5. After all meals: if no fruit was used and `target > 1200`, injects one fruit into the snack

## Builders

| Builder | Description |
|---------|-------------|
| `buildBreakfast` | dairy/egg protein + breakfast carb + salad or single veg |
| `buildHotMeal` | hot meat/fish + hot_carb (varied by `usedCarbCats`) + salad or hot veg |
| `buildTunaMeal` | tuna + bread/cracker + salad |
| `buildDinner` | cold protein (tuna/dairy/egg) + salad + optional bread |
| `buildSnack` | dairy or supplement + fruit (or cracker fallback) |

## `buildSalad` Rules

- Requires ≥ 2 **regular** (`salad` tag, not `salad_only`) vegetables as base
- Optional 3rd veg from `salad_only` pool (lettuce, cabbage, onion) or a 3rd regular veg
- Olive oil (id:86) **always** added if permitted by diet/allergy — no daily-use restriction
- Parts display: `f.name.includes(' ') ? name + ' (' + unitLabel + ')' : unitLabel` — prevents "חצי פלפל + חצי פלפל" ambiguity

## `pick()` Priority

1. Foods in `S.liked` → `allowed()` → not in `used` (or under `maxDay`)
2. All other allowed foods not yet used
3. Serving size: calculated from calorie/protein budget, snapped to `unitG`, clamped to `maxDay`/`maxMeal`

## `mkItem()` Return Shape

```js
{ f, g, dispG, displayName?, cal, p, c, fat }
```
- `displayName` set only for eggs: "חביתה מביצה אחת" / "חביתה משתי ביצים"; `dispG` is `''`
- All other items: `displayName` is `undefined`; `dispG` holds the portion string
