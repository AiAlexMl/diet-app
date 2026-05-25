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
