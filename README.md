# VeloSync

A phone-friendly web app for tracking softball pitch data. Log every pitch — type, location, and result — against opposing batters, and use that history to decide what to throw next time they're up.

## What it does

- **Live game logging** — pick the batter, then log each pitch in 3 taps: pitch type → location on a strike-zone grid → result. The count and at-bats advance automatically (walks, strikeouts, balls in play), with undo.
- **Your pitching staff** — every pitch is credited to whoever is pitching, including mid-game substitutions.
- **Pitch suggestions** — before each pitch, see what has worked against this batter, prioritizing history against the current pitcher.
- **Scouting reports** — per-batter zone heat maps, pitch-type effectiveness, and batter-vs-pitcher matchup splits, filterable by last game / last 3 games / overall.
- **Works offline** — it's a PWA: install it to your phone's home screen and it works with no signal at the field. All data stays on your device (IndexedDB). Settings can export that data, or import a JSON file that replaces it.

## Import from file

Settings → **Backup and import** → **Import from file** replaces everything stored on the device. The same button is on the first-season screen, before any season exists. Import does not merge. There is no sample file in this repo.

The file is JSON, version 6 (the same shape **Export backup** writes). Older backups (version 2–5) still import; they have no seasons, so the app asks you to name one afterward.

Top-level fields:

| Field | Required | What it is |
| --- | --- | --- |
| `app` | yes | `"pitch-tracker"` |
| `version` | yes | `6` |
| `exportedAt` | no | ISO timestamp, shown in the confirm dialog |
| `seasons` | no | Season list. Omit on a pre-season backup. |
| `opponents` | yes | Opposing teams |
| `batters` | yes | Batters on those teams |
| `pitchers` | yes | Your staff |
| `pitchTypes` | yes | Pitch types pitches refer to |
| `games` | yes | Games |
| `atBats` | yes | Plate appearances |
| `pitches` | yes | Pitches |
| `earnedRuns` | no | Earned runs per pitcher per half-inning |
| `substitutions` | no | Mid-game batter substitutions |
| `settings` | no | Logging preset. Omit to leave the app default. |

Every row needs a string `id`. Ids are how rows point at each other. `syncStatus` and `syncedAt` can be omitted; import marks the row pending.

`seasons[]`: `id`, `name`, `eraInnings` (`6`, `7`, or `9`), `active` (boolean; at most one `true`), `createdAt` and `updatedAt` (millisecond timestamps). Optional `startDate` and `endDate` are `yyyy-mm-dd`.

`opponents[]` (teams): `id`, `name`, `seasonId`. Optional `ghostOutEnabled`, `ghostOutSortIndex`.

`batters[]`: `id`, `opponentId`, `firstName`, `lastName`, `number`, `bats` (`"L"` or `"R"`), `sortIndex`, `activeToday`. Optional `linkGroupId`.

`pitchers[]`: `id`, `firstName`, `lastName`, `number`, `throws` (`"L"` or `"R"`), `seasonId`, `pitchTypeIds`. Optional `notes` and `linkGroupId`.

The same `linkGroupId` on two batter rows, or two pitcher rows, means the same person. Pitches stay on the row they were logged against. Leave `linkGroupId` off a person who appears once.

`games[]`: `id`, `opponentId`, `seasonId`, `date` (`yyyy-mm-dd`), `status` (`"active"` or `"finished"`), `homeAway` (`"home"` or `"away"`), `half` (`"top"` or `"bottom"`), `lineup` (batter ids in order). Optional `currentPitcherId`, `currentInning`, `label`.

`atBats[]`: `id`, `gameId`, `batterId`, `pitcherId`, `outcome`, `inning`, `half`, `startedAt`. Outcomes: `walk`, `strikeout`, `out`, `single`, `double`, `triple`, `home_run`, `error`, `hbp`, `ghost_out`.

`pitches[]`: `id`, `gameId`, `atBatId`, `batterId`, `pitcherId`, `pitchTypeId`, `seq` (1-based within the at-bat), `balls` and `strikes` (the count before this pitch), `zone`, `result`, `inning`, `ts`. Optional `intendedZone` and, when `result` is `in_play`, `inPlay` (`out`, `single`, `double`, `triple`, `home_run`, `error`). Results: `ball`, `called_strike`, `swinging_strike`, `foul`, `in_play`, `hbp`. A zone is `1`–`9` (strike zone, catcher's view) or an out-of-zone id: `o-up`, `o-down`, `o-left`, `o-right`, or a granular `og-` cell.

`earnedRuns[]`: `id`, `gameId`, `pitcherId`, `inning`, `half` (`"top"` or `"bottom"`), `runs` (a number, including `0`).

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
