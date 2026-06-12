---
paths:
  - "ui.js"
  - "style.css"
  - "index.html"
---

# UI & Rendering

## Screen Navigation

`goTo(n)` shows screen `n` (0–4), hides others via `display:none`, updates step-bar classes.

| Screen | Content |
|--------|---------|
| 0 | פרטים אישיים — age/height/weight/gender/goal + live RMR box + live BMI warning |
| 1 | העדפות תזונה — diet chips, allergy chips, training time cards |
| 2 | מאכלים מועדפים — category tabs with badge counts, food cards |
| 3 | מאכלים מוחרגים — same grid structure, avoid mode |
| 4 | תפריט — output of `renderMenu()` |

## Live BMI Warning (screen 0)

`updateMacroDisplay()` computes BMI inline and shows/hides `#bmi-warn-box` (`.bmi-warn-inline`):
- cut + BMI < 20 → orange warning
- bulk + BMI ≥ 30 → orange warning
- Otherwise → hidden

## Food Grid (screens 2–3)

`renderGrid(mode)` builds:
1. **Category tabs** — each tab shows a badge with selected-item count for that category
2. **Food cards** — ❤️/🚫 icons, name, prep

`toggleFood(mode, id)` updates the card in-place and calls `updateTabBadges(mode)` to refresh all badge counts without re-rendering the grid.

## Menu Rendering (`renderMenu` → `renderDay`)

`renderMenu()` = build path: `buildMenu()` → wraps result in `DAY` (+ warnings/labels snapshot) → `saveDay()` → `renderDay()`. `renderDay()` renders from `DAY` only — used both after build and on restore-from-localStorage. Removed meals (`m.removed`, set by day-correction) are skipped.

**Menu-screen interactions:** daily progress bar (`#day-progress`, in-place updates); treat bar button (add/remove planned treat → full rebuild behind `confirmRebuild()`); per-meal `✓ אכלתי` (`toggleEaten` — in-place class+button+progress update) and `🔄 אכלתי משהו אחר` (`openAltPicker` — 3 tabs: TREATS / DB search+grams / manual name+calories → `applyAlt` → `rebuildRest`). `DAY.note` renders as a green `.day-note` banner (day-correction messages).

Renders in order:
1. Menu header (goal label + training label)
2. `S.bmiWarning` → orange `.bmi-warning` banner (⚠️)
3. `S.carbWarning` → yellow `.bmi-warning` banner (ℹ️)
3b. `S.menuWarning` → yellow `.bmi-warning` banner (ℹ️) — target unreachable with current likes/goal
4. Morning training tip (if applicable)
5. Meal cards
6. Daily summary card (calories/protein/carbs/fat + macro % bars + **fiber row**, number only)
7. Two nav buttons: **"תפריט נוסף עם אותן העדפות"** → `renderMenu()` (rebuild with same `S`) and **"התחל מחדש (איפוס)"** → `resetApp()`

**Food row name priority:**
1. `it.displayName` if set — eggs: "חביתה מביצה אחת (L)"
2. `it.f.name + it.f.prep` if prep word not already in name (e.g., "ברוקולי מאודה")

**Product image** — each non-salad food row shows a 26px thumbnail (`images/<id>.jpg`, derived from id; `it.f.img` overrides). Hover enlarges it to 150px (`.food-thumb:hover img`). Missing files hide via `<img onerror>`. Salad parts don't show images yet.

**Salad group** (`isSaladGroup: true`) — renders label + `it.parts.join(' + ')` as subtitle.

**Empty meal** — if `m.items.length === 0`, renders `.empty-meal-note` message instead.

## Regenerate vs. Reset (menu screen buttons)

- **"תפריט נוסף עם אותן העדפות"** → `renderMenu()` again: rebuilds a fresh menu keeping all of `S` (likes/avoids/diet/goal/time). Variety comes from the shuffles in `pick()`/`buildSalad`.
- **"התחל מחדש (איפוס)"** → `resetApp()`: clears `S.liked`, `S.avoided`, `S.diet`, `S.allergy`; `S.goal`→`'maintain'`, `S.time`→`null`, `S.noTrain`→`false`; resets all chip/toggle/time-card UI, count displays, noTrain button text; clears `localStorage['dietai-state']`; then `goTo(0)`.

## Persistence & Safety helpers (ui.js)

- `saveState()` / `loadState()` — localStorage persistence of all user inputs/selections (see `architecture.md`). Every mutator calls `saveState()`.
- `esc(s)` — HTML-escapes every dynamic string injected via innerHTML (food names, labels, dispG, salad parts). Mandatory for any future DB-sourced text (sponsored products, coach branding) — XSS guard.
- `readNum(id)` / `NUM_LIMITS` — clamps age/height/weight to valid ranges (HTML min/max doesn't block typed input); on `change` the input value itself is snapped back.
- `bmiWarnText()` (defined in app.js) — the single source for BMI warning copy, used by both the live screen-0 box and the menu banner.

## Disclaimer Overlay

Shown on page load via HTML (`.disclaimer-overlay` always visible at start). `closeDisclaimer()` sets `display:none`. Cannot be re-opened.

## Design System (style.css v2.0)

- **Accent**: `#4f46e5` (indigo) → `#7c3aed` (violet) gradient
- **Background**: `linear-gradient(135deg, #f0f2f8, #e8ecf7)` fixed
- **App wrapper**: `background: rgba(255,255,255,0.92)` with `backdrop-filter: blur`
- **Shadows**: `--shadow-sm` / `--shadow-md` on cards; hover lifts with `translateY(-1px)`
- **Buttons**: primary = gradient with `box-shadow`; active state = full accent fill
- **Chips/toggles**: active state = solid accent color
- **Summary card**: gradient purple/blue with font-weight 800 on numbers
- **RTL**: `direction: rtl` on body; all layout is RTL-first

## Planned Features

- Interactive food swap on the menu screen
- Save menu / export to PDF
- Coach/trainer version
- Integration with FoodsDictionary API
