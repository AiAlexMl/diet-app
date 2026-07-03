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

## Menu Rendering (`renderMenu` → `renderDay` → `dayHtml`)

`renderMenu()` = build path: `buildMenu()` → wraps result in `DAY` (+ warnings/labels snapshot) → `saveDay()` → `renderDay()`. `renderDay()` is a thin shell: `#menu-output.innerHTML = dayHtml(DAY, {})` + `updateDayProgress()` + `updateFavHeart()` + `goTo(4)` — used both after build and on restore-from-localStorage. Removed meals (`m.removed`, set by day-correction) are skipped.

**`dayHtml(day, {readOnly, title})`** is the shared HTML builder. `readOnly: true` (used by the account/history modal in supabase-client.js) drops all interactive chrome: `#day-progress`, treat-bar, noteAction button, `meal-card-N` ids (so `toggleEaten`'s in-place updates never hit the modal copy), edit/remove buttons, `.meal-actions`, bottom actions, `.coach-cta`. `title` overrides the header.

**Menu-screen interactions:** daily progress bar (`#day-progress`, in-place updates); treat bar button (add/remove planned treat → full rebuild behind `confirmRebuild()`); per-meal `✓ אכלתי` (`toggleEaten` — in-place class+button+progress update) and `🔄 אכלתי משהו אחר` (`openAltPicker` — 3 tabs: TREATS / DB search+grams / manual name+calories → `applyAlt` → `rebuildRest`). `DAY.note` renders as a green `.day-note` banner (day-correction messages).

Renders in order:
1. Menu header (goal label + training label) + **favorites heart** (`#fav-heart` → `toggleFavoriteToday()`; filled `.on` when today already saved)
2. `S.bmiWarning` → orange `.bmi-warning` banner (⚠️)
2b. `S.trainWarning` → **red `.field-error` banner (⚠️)** — bulk goal + no training (`trainWarnText()` in `buildMenu`); also shown **live on screen 1** in `#train-warn` via `updateTrainWarn()` (called from `setTime`/`toggleNoTrain`/`setGoal`/`goTo(1)`)
3. `S.carbWarning` → yellow `.bmi-warning` banner (ℹ️)
3b. `S.menuWarning` → yellow `.bmi-warning` banner (ℹ️) — target unreachable with current likes/goal
4. Morning training tip (if applicable)
5. Meal cards
6. Daily summary card (calories/protein/carbs/fat + macro % bars + **fiber row**, number only)
7. Quiet actions (`.menu-quiet-actions`, two `.pill-btn`): **"↻ תפריט נוסף"** → `confirmRebuild()`+`renderMenu()` and **"📄 שמירה כ-PDF"** → `window.print()` (disabled when a treat exists, with `.print-hint`); then **`.reset-link`** → `resetApp()`. Deliberately demoted — the day is the product, regeneration is secondary.

**Food row name priority:**
1. `it.displayName` if set — eggs: "חביתה מביצה אחת (L)"
2. `it.f.name + it.f.prep` if prep word not already in name (e.g., "ברוקולי מאודה")

**Product image** — each non-salad food row shows a 26px thumbnail (`images/<id>.jpg`, derived from id; `it.f.img` overrides). Hover enlarges it to 150px (`.food-thumb:hover img`). Missing files hide via `<img onerror>`. Salad parts don't show images yet.

**Salad group** (`isSaladGroup: true`) — renders label + `it.parts.join(' + ')` as subtitle.

**Empty meal** — if `m.items.length === 0`, renders `.empty-meal-note` message instead.

## Regenerate vs. Reset vs. Favorite (menu screen actions)

- **"↻ תפריט נוסף"** (`.pill-btn`) → `renderMenu()` again: rebuilds a fresh menu keeping all of `S` (likes/avoids/diet/goal/time). Variety comes from the shuffles in `pick()`/`buildSalad`. Guarded by `confirmRebuild()` when eaten marks exist.
- **"התחל מחדש (איפוס)"** (`.reset-link`) → `resetApp()`: clears `S.liked`, `S.avoided`, `S.diet`, `S.allergy`; `S.goal`→`'maintain'`, `S.time`→`null`, `S.noTrain`→`false`; resets all chip/toggle/time-card UI, count displays, noTrain button text; clears `localStorage['dietai-state']`; then `goTo(0)`. **Does not touch favorites** (saved snapshots survive reset, by design).
- **Favorites (♡ heart)** — `saveFavorite()` snapshots `serializeDay(DAY)` into `localStorage['shapeat-favorites']` (cap 30). Re-click on the same day **updates** the snapshot (same `fav_id`, new `saved_at`) — never duplicates, never unsaves; removal only from the account modal (`removeFavorite`). `showToast()` (`.app-toast`) gives feedback; anonymous users get a one-time "saved on device" hint (`shapeat-fav-hint`). Cloud mirror (table `favorites`) is handled by wrappers in supabase-client.js.

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

## Save / Print to PDF (implemented)

The menu screen has a "📄 שמירת התפריט" button → `window.print()`. A `@media print` block in `style.css` hides the interactive chrome (nav / treat-bar / progress / eaten+edit buttons / `.coach-cta` / step-bar) so the browser's "save as PDF" yields a clean menu-only sheet — no build step, no library.

## Planned Features

- Interactive food swap on the menu screen
- Coach/trainer version
- Integration with FoodsDictionary API
