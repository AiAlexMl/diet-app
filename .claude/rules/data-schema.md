---
paths:
  - "data.js"
---

# Food Database Schema

Each item in `DB`:
```js
{ id, name, prep, p, c, f, cal, tags[], unitG?, unitLabel?, maxDay?, maxMeal?, isEgg?, halfLabel? }
```

`p` = protein g/100g, `c` = carbs g/100g, `f` = fat g/100g, `cal` = kcal/100g.

## Tags

All filtering logic is tag-driven:

| Tag | Meaning |
|-----|---------|
| `meat` | Chicken, beef, turkey |
| `fish` | All fish including tuna |
| `tuna` | Canned tuna — also has `fish`; `maxDay:160` |
| `egg` | Eggs — also has `isEgg:true`; `maxDay:120` |
| `dairy` | Cottage, yogurt, cheese, milk |
| `grain` | Grains (rice, pasta, oats, quinoa…) |
| `hot_carb` | Carbs served hot — grain or starch |
| `starch` | Starchy vegetables (sweet potato, potato, corn) |
| `bread` | Bread and pita |
| `cracker` | Rice/corn cakes — portion logic via `crackerPortion()` |
| `breakfast` | Oatmeal — breakfast-only carb |
| `salad` | Can appear standalone OR in composite salad |
| `salad_only` | **Only** inside composite salad — never standalone (lettuce, cabbage, onion) |
| `hot_veg` | Cooked vegetables (broccoli, zucchini…) |
| `veg` | All vegetables |
| `legume` | Lentils, chickpeas, beans, tofu, edamame |
| `fruit` | All fruits |
| `fat` | Healthy fats (avocado, nuts, oil) |
| `oil` | Olive oil (id:86) — added to every salad |
| `nuts` / `peanuts` / `sesame` / `soy` | Allergen sub-tags |
| `supplement` | Protein powder, bars — only shown when `supplements` diet selected |

## Key Constraints

- `maxDay` — caps total grams per day (tracked in `used` Map in `buildMenu`)
- `maxMeal` — caps grams per single meal
- `unitG` — snaps serving size to nearest multiple (e.g., 9g per cracker)
- `unitLabel` — human-readable portion description shown in menu
- `isEgg:true` — triggers `eggDisplay()` in `mkItem()`; shown as "חביתה" not "ביצה שלמה"
- `halfLabel` — used for cottage cheese half-container display
