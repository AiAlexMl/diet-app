---
paths:
  - "ui.js"
  - "style.css"
  - "index.html"
---

# UI & Rendering

## Screen Navigation

`goTo(n)` shows screen `n` (0–4), hides others via `display:none`, updates step-bar classes. Screens: 0=פרטים אישיים, 1=העדפות תזונה, 2=מאכלים מועדפים, 3=מאכלים מוחרגים, 4=תפריט.

## Menu Rendering (`renderMenu`)

Food row name priority:
1. `it.displayName` if set (eggs → "חביתה מביצה אחת")
2. Otherwise: `it.f.name` + `it.f.prep` if the prep word isn't already in the name (e.g., "בטטה אפויה", "ברוקולי מאודה")

Salad group (`isSaladGroup: true`) rendered as a collapsible row with `it.parts.join(' + ')` as subtitle.

BMI warning (`S.bmiWarning`) rendered as an orange banner (`.bmi-warning`) above the meal cards.

## Design System (style.css v2.0)

- **Accent**: `#4f46e5` (indigo) → `#7c3aed` (violet) gradient
- **Background**: `linear-gradient(135deg, #f0f2f8, #e8ecf7)` fixed
- **App wrapper**: `background: rgba(255,255,255,0.92)` with `backdrop-filter: blur`
- **Shadows**: `--shadow-sm` / `--shadow-md` on cards; hover lifts with `translateY(-1px)`
- **Buttons**: primary = gradient with `box-shadow`; active state = full accent fill
- **Chips/toggles**: active state = solid accent color (not light-blue tint)
- **Summary card**: gradient purple/blue with font-weight 800 on numbers
- **RTL**: `direction: rtl` on body; all layout is RTL-first

## Planned Features

- Interactive food swap on the menu screen
- Save menu / export to PDF
- Coach/trainer version
- Integration with FoodsDictionary API
