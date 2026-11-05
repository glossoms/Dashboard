# Gloom Dashboard

A minimal, Apple-inspired dashboard for a freelance business. Pure HTML/CSS/JS — no build step, no dependencies. Everything is saved in your browser (`localStorage`).

**Today** (home): daily to-dos, schedule/reminders, deadlines, notes (yesterday's prompts you to fill it in), live stats, quote of the day
**Overview**: revenue, commission and deadline-vs-actual charts (hover a card → expand icon for detailed views)
**Commissions** · **Pending** (timers, deadlines, Complete → becomes a commission) · **Clients** (Roblox avatars, per-client stats)
USD/INR switch with live rate (editable), subtle UI sounds (mute in the header).

## Run / host
Open `index.html`, or serve the folder (`python3 -m http.server`). GitHub Pages: **Settings → Pages → Deploy from branch → main / root**.

## Structure
```
index.html          markup + icon sprite
css/style.css       design system (light/dark, responsive)
js/store.js         persistence + pure logic (unit-tested)
js/charts.js        SVG charts
js/quotes.js        quote of the day (open API + curated fallback)
js/sound.js         synthesized UI sounds (Web Audio)
js/app.js           views and interactions
tests/logic.test.js         node tests/logic.test.js
tests/e2e/*.py              browser tests (pip install playwright; playwright install chromium; run from repo root)
```

## Notes
- Data is per browser/device. Clearing site data erases it.
- Roblox avatars load from the numeric user ID (or a profile link); usernames can't be resolved from a static page. Falls back to initials.
- Calendar: add events manually or import a `.ics` file (recurring events aren't expanded). Live Google/Apple sync would need a server.
- Quote of the day uses the open-source DummyJSON quotes API and falls back to a built-in list offline.
