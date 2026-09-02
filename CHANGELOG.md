# Changelog

All notable changes to VeloSync are recorded here, in reverse-chronological order (newest first). Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Versions follow semver — MAJOR for breaking data/account changes, MINOR for new user-facing features, PATCH for bug fixes.

## [Unreleased]

### Planned
- Mid-game substitution: swap in a player from the full roster (not just today's starting lineup) without leaving the live game; "add player" shortcut that returns to the same in-progress game; full substitution history tracked (who/when/inning) for scouting and stats.

## [0.2.0] — 2026-09-02

### Fixed
- Batting order set while building/editing a team now carries over correctly to a new game, instead of defaulting to raw database insertion order. Added a persisted `sortIndex` on each batter; wired the existing drag-and-drop reorder component into the team roster screen (previously reorder was only possible mid-game). The final batting order used at the end of a game now also overwrites the roster's baseline order, so the roster reflects how the team actually played most recently.
- The roster list itself (below the batting-order drag list) no longer reshuffles when you reorder the batting order — it's now a stable, alphabetical-by-last-name reference list, independent of play order.
- The "wrong batter — switch to…" picker during a live game now follows the game's actual current batting order (including any mid-game reorders), instead of raw unsorted roster order.
— PR #6

## [0.1.0] — 2026-08-31

### Added
- Rebranded from "Pitch Track" to **VeloSync** — new name, logo, PWA icons across the app.
- Bottom tab navigation (Home / Teams / Pitchers / Games / Settings), replacing the old top-nav-only layout.
- New home-plate "VS" logo, vectorized to clean SVG (sharp badge/V edges, smooth S curves) with light and dark variants for app and marketing use.
- GitHub Actions deploy pipeline: production deploy on merge to `main`, plus per-PR preview deployments (`/pr/<N>/`) for testing before merge.

### Fixed
- iOS PWA bottom-nav safe-area clipping (Home/Settings buttons were cut off when installed to homescreen).
- Removed redundant top navigation bar now that bottom tabs cover navigation.

---

## Earlier history (pre-VeloSync, as "Pitch Track")

- Added hit-by-pitch and inning tracking behind capture-detail flags.
- Added a logging detail level setting (Quick / Standard / Detailed, with advanced toggles).
- Made at-bat history in the batter report expandable to show full pitch sequence.
- Made the post-pitch recommendation hide automatically after a pick; made the result overlay more transparent.
- Removed the standalone Brackets tournament tool from this app (moved to its own separate site).
