# CLAUDE.md — Diat Application

## Running the App

Open `index.html` directly in a browser — no server, build step, or package manager required.

## Overview

Diet menu planner — pure client-side Hebrew RTL app (HTML + CSS + vanilla JS).
Detailed rules are in `.claude/rules/`:

- `architecture.md` — script load order, global state `S`, screen structure
- `data-schema.md` — food DB schema, tag reference, portion constraints *(scoped to `data.js`)*
- `algorithm.md` — macro calculation, `buildMenu()` flow, builder rules, salad logic *(scoped to `app.js`)*
- `ui-rendering.md` — menu rendering, design system, planned features *(scoped to `ui.js`, `style.css`, `index.html`)*

## Health Safeguards (app.js)

- **Calorie floor**: `Math.max(target, female ? 1200 : 1500)` applied after goal offset
- **Dynamic cut deficit**: `min(500, rmr × 0.20)` — scales down for low-RMR users
- **Carb floor**: if `protein×4 + fat×9 + 100×4 > target`, target is raised to fit all three floors
- **BMI warnings**: cut+BMI<20 → health warning; bulk+BMI≥30 → consult professional; both shown live on screen 0 and in final menu

## Key ID Ranges (data.js)

| Range | Category |
|-------|----------|
| 2–14 | חלבון מן החי (meat/fish) |
| 15–17 | ביצים (M/L/XL) |
| 20–27 | מוצרי חלב |
| 33–46, 100 | דגנים + פריכיות |
| 47–49 | ירקות עמילניים |
| 50–57 | קטניות |
| 60–74 | ירקות |
| 75–83, 102–105 | פירות |
| 86–93 | שומנים |
| 96–101 | תוספים |
