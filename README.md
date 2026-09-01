# VeloSync

A phone-friendly web app for tracking softball pitch data. Log every pitch — type, location, and result — against opposing batters, and use that history to decide what to throw next time they're up.

## What it does

- **Live game logging** — pick the batter, then log each pitch in 3 taps: pitch type → location on a strike-zone grid → result. The count and at-bats advance automatically (walks, strikeouts, balls in play), with undo.
- **Your pitching staff** — every pitch is credited to whoever is pitching, including mid-game substitutions.
- **Pitch suggestions** — before each pitch, see what has worked against this batter, prioritizing history against the current pitcher.
- **Scouting reports** — per-batter zone heat maps, pitch-type effectiveness, and batter-vs-pitcher matchup splits, filterable by last game / last 3 games / overall.
- **Works offline** — it's a PWA: install it to your phone's home screen and it works with no signal at the field. All data stays on your device (IndexedDB), with JSON export/import for backups.

## Tech

Vite + React + TypeScript, Dexie (IndexedDB), vite-plugin-pwa. No backend, no accounts.

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # production build in dist/
npm run preview    # serve the production build locally
```

## Deployment

GitHub Pages (project site) via `.github/workflows/deploy.yml` and the `gh-pages` branch:

- **main** → https://gmp428.github.io/velosync/ (Vite `base` `/velosync/`, PWA name `VeloSync`)
- **PR previews** → https://gmp428.github.io/velosync/pr/{number}/ (Vite `base` `/velosync/pr/{number}/`, PWA name `VeloSync PR`)

Main deploys replace root files but keep `pr/`. PR deploys only write that PR’s folder. Closing a PR removes its preview folder.

Enable Pages once: **Settings → Pages → Branch: `gh-pages` / `/ (root)` → Save**.
