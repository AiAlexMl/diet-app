---
paths:
  - "data.js"
---

# Food Database Schema

Each item in `DB`:
```js
{ id, name, prep, p, c, f, fib, cal, tags[], unitG?, unitLabel?, maxDay?, maxMeal?, isEgg?, halfLabel? }
```

`p` = protein g/100g, `c` = carbs g/100g, `f` = fat g/100g, `fib` = fiber g/100g, `cal` = kcal/100g.
All numeric fields (`p`, `c`, `f`, `fib`, `cal`) are **per 100g** — never per serving.
`fib` values are approximate (USDA-based). `mkItem()` reads `f.fib || 0`, so a missing `fib` is treated as 0.

## Product Images

Each generic food has an image at `images/<id>.jpg`. The path is **derived from `id` automatically** in `renderMenu()` (`it.f.img || 'images/'+id+'.jpg'`) — generic items do NOT carry an `img` field. A missing file is hidden at runtime via the `<img onerror>` handler, so absence is safe.

Images were sourced from Wikimedia Commons (CC-licensed) via the fetch pipeline; `images/manifest.json` records `{ term, sourceTitle, license, artist }` per id for attribution. Search terms are English; ids 98/100 are copies of 97/45.

## Future Schema (prepared, not yet populated)

Optional fields reserved for the sponsorship layer. Absent = generic item; code treats absence as the default:

| Field | Type | Meaning |
|-------|------|---------|
| `img` | string | **Override** for the derived path. Generic items omit it (path comes from id). Branded items set it to a real product photo supplied by the company — never scraped |
| `brand` | string | Company name; absent = generic |
| `tier` | number | Sponsorship priority weight (0/absent = none). Used by the future swap layer as a **tie-breaker only** — never overrides allergy/diet/macro constraints |

The menu algorithm stays brand-agnostic; sponsorship will be a presentation/substitution layer applied after `buildMenu()`.

## Tags

All filtering logic is tag-driven:

| Tag | Meaning |
|-----|---------|
| `meat` | Chicken, beef, turkey |
| `fish` | All fish including tuna |
| `tuna` | Canned tuna — also has `fish`; `maxDay:160` |
| `egg` | Eggs (M/L/XL) — also has `isEgg:true`; `maxDay` varies by size |
| `dairy` | Cottage, yogurt, cheese, milk |
| `grain` | Grains (rice, pasta, oats, quinoa…) |
| `hot_carb` | Carbs served hot — grain or starch |
| `starch` | Starchy vegetables (sweet potato, potato, corn) |
| `bread` | Bread and pita |
| `cracker` | Rice/corn cakes — portion logic via `crackerPortion(g, unitG)`; `unitG` varies (4g or 9g) |
| `breakfast` | Oatmeal — breakfast-only carb |
| `salad` | Can appear standalone OR in composite salad |
| `salad_only` | **Only** inside composite salad — never standalone (lettuce, cabbage, onion) |
| `hot_veg` | Cooked vegetables (broccoli, zucchini…) |
| `veg` | All vegetables |
| `legume` | Lentils, chickpeas, beans, tofu, edamame |
| `fruit` | All fruits |
| `fat` | Healthy fats (avocado, nuts, oil) |
| `oil` | Olive oil (id:86) — added to every salad at **5g (כפית)** |
| `nuts` / `peanuts` / `sesame` / `soy` | Allergen sub-tags |
| `gluten` | Contains gluten (wheat/rye/oats-by-cross-contamination) — excluded for `gluten_free`. Set on: 35,36 (pasta), 37,38 (bread/rye), 39,40 (pita), 44 (bulgur), 41,106 (oats), 107 (granola), 108 (cornflakes), 101 (energy bar). **Not** on rice/quinoa/buckwheat/rice-corn-cakes/starch |
| `supplement` | Protein powder, bars, energy bars — only shown when `supplements` diet selected |

## Key Constraints

- `maxDay` — caps total grams per day (tracked in `used` Map in `buildMenu`)
- `maxMeal` — caps grams per single meal
- `unitG` — snaps serving to nearest multiple; also the minimum serving. For crackers this is the weight per piece (4g or 9g)
- `unitLabel` — human-readable portion description shown in menu
- `isEgg:true` — triggers `eggDisplay(g, unitG, size)` in `mkItem()`; displayed as "חביתה מביצה אחת (L)" etc.
- `halfLabel` — used for cottage cheese half-container display (ids 20–21 only)
- `vegOnly:true` — only allowed for vegan/vegetarian diets (e.g., tofu id 56). Checked in `allowed()`
- `containsMilk:true` — excluded for vegan/lactose_free (e.g., oatmeal-with-milk id 106). Checked in `allowed()`
- `condiment:true` — olive oil (86), tahini (91), peanut butter (92); never standalone, only via `attachSpread` on bread/cracker
- `drink:true` — milk (27); only the cornflakes `milk` slot, never a protein
- `complete:true` — self-contained meal (oatmeal-with-milk 106); its template has no protein slot
- `dip:true` — hummus-spread (52), tahini (91); side dip in hot meals, excluded from legume main/side
- `pita:true` — pitas (39, 40); only used as the carb with a fillable protein (egg/tuna). Dairy/cheese & salad meals use sliced bread only (`_sliced` matcher in `app.js`)
- `gfOnly:true` — gluten-free-only items shown **only when `gluten_free` selected** (mirrors `vegOnly`): GF bread (109), GF pasta (110). Checked in `allowed()`
- `optIn:true` — niche foods that appear **only if the user marked them liked** (`allowed()` excludes them otherwise). Set on: 6,7,8,11,12,13,14 (ground beef, sirloin, salmon, cod, bori, sea bass, tilapia), 57 (edamame), 63 (chard), 80 (watermelon), 83 (grapefruit)

## ID Ranges

| Range | Category |
|-------|----------|
| 2–14 | חלבון מן החי — meat (2–7), fish (8–14) |
| 15–17 | ביצים — M (id:15, 53g), L (id:16, 63g), XL (id:17, 73g) |
| 20–27 | מוצרי חלב |
| 33–46, 106–110 | דגנים — grains/bread/crackers; 41 oatmeal (water), 106 oatmeal (milk), 107 granola, 108 cornflakes, 109 GF bread, 110 GF pasta |
| 47–49 | ירקות עמילניים |
| 50–57 | קטניות |
| 60–74 | ירקות |
| 75–83, 102–105 | פירות |
| 86–93 | שומנים |
| 96–101 | תוספים |
| 100 | פריכיות אורז קטנות (4g/piece) — in דגנים |

## Next available IDs: 18–19, 28–32, 111+
