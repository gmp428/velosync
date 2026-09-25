# VeloSync

A phone-friendly web app for tracking softball pitch data. Log every pitch — type, location, and result — against opposing batters, and use that history to decide what to throw next time they're up.

## What it does

- **Live game logging** — pick the batter, then log each pitch in 3 taps: pitch type → location on a strike-zone grid → result. The count and at-bats advance automatically (walks, strikeouts, balls in play), with undo.
- **Your pitching staff** — every pitch is credited to whoever is pitching, including mid-game substitutions.
- **Pitch suggestions** — before each pitch, see what has worked against this batter, prioritizing history against the current pitcher.
- **Scouting reports** — per-batter zone heat maps, pitch-type effectiveness, and batter-vs-pitcher matchup splits, filterable by last game / last 3 games / overall.
- **Works offline** — it's a PWA: install it to your phone's home screen and it works with no signal at the field. All data stays on your device (IndexedDB). Settings can export that data, or import a JSON file that replaces it.

## Import from file

Settings → **Backup and import** → **Import from file** replaces everything stored on the device. The same button is on the first-season screen. Import does not merge. There is no sample file in this repo.

**Export backup** writes version 6, including `seasons`. Import accepts version 6. Older backups (version 2–5) still import. They have no `seasons` array; the app then asks you to name one season, and that season is assigned to the teams, pitchers, and games already in the file.

### BackupFile version 6

| Field | Required | Contents |
| --- | --- | --- |
| `app` | yes | `"pitch-tracker"` |
| `version` | yes | `6` (version 5 added earned runs; 6 adds seasons) |
| `exportedAt` | yes | ISO timestamp |
| `seasons` | yes | Array, possibly empty. At most one row has `active: true`. |
| `opponents` | yes | Teams. Each row’s `seasonId` must match a season `id`. |
| `batters` | yes | Batters. Season comes from their team’s `seasonId`. |
| `pitchers` | yes | One row per pitcher. The same `id` is used in every season. |
| `pitchTypes` | yes | Pitch types referenced by pitches |
| `games` | yes | Each row’s `seasonId` must match a season `id`. |
| `atBats` | yes | Plate appearances |
| `pitches` | yes | Pitches, including optional `intendedZone` |
| `earnedRuns` | no | Earned runs for one pitcher in one half-inning |
| `substitutions` | no | Mid-game batter substitutions |
| `settings` | no | Logging preset. Omit to leave the app default. |

`seasons[]` fields: `id`, `name`, `eraInnings` (`6`, `7`, or `9`), `active`, `updatedAt` (milliseconds), `syncStatus` (`"pending"`, `"synced"`, or `"error"`). Optional: `syncedAt` (number or null), `startDate`, `endDate` (`yyyy-mm-dd`). `createdAt` is not required; export may include it.

`opponents[]` keeps the existing team fields and adds required `seasonId`. Each season has its own team rows.

`games[]` keeps the existing game fields and adds required `seasonId`.

`pitchers[]` is the existing pitcher table. Do not add a pitcher-season join, and do not copy a pitcher into a second row per season. Games, at-bats, pitches, and earned runs in any season point at that same pitcher `id`. Leave `seasonId` off the pitcher row. A pitcher row that does carry `seasonId` is shown only on that season’s staff (the in-app “import from another season” copy).

`batters[]` are season-scoped through `opponentId` → that team’s `seasonId`. The same person on another team or in another season shares `linkGroupId`. Pitches stay on the batter row they were logged against.

`atBats[]`, `pitches[]` (`intendedZone` optional; zones are `1`–`9` or `o-` / `og-` ids), `earnedRuns[]`, `substitutions[]`, `pitchTypes[]`, and `settings[]` are unchanged from the current backup. Every row needs a string `id`.

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
