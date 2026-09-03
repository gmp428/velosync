# Changelog

All notable changes to VeloSync are recorded here, in reverse-chronological order (newest first). Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Versions follow semver — MAJOR for breaking data/account changes, MINOR for new user-facing features, PATCH for bug fixes.

## [Unreleased]

### Planned
- "Middle/End of the Nth" tap-to-continue message after 3 outs end a half (PR #11, in review).

## [0.6.0] — 2026-09-02

### Added
- Home/away picker on "Start a game" — sets who pitches first and auto-configures the correct starting inning half.
- Out tracker — three circles next to the pitch count, fill in live as outs happen this half (counts ghost outs too).
- Inning indicator — a number with a ▲/▼ triangle (up = top, down = bottom) next to the out tracker.
— PR #9

## [0.5.0] — 2026-09-02

### Added
- 9-max active lineup selection: a checkbox per roster batter for "in today's lineup," capped at 9 with no minimum enforced, synced live with the drag-order batting order. Checking a batter sends them to the bottom of the order automatically.
- "Ghost Batter (Auto Out)" mechanic — a real, named rule in local/rec-ball leagues: a roster-level placeholder for a short-handed 9th spot (offered at exactly 8 active players), draggable like a real batter in the order. Also available mid-game via the Substitute panel ("No substitute — mark as Ghost Batter") for an injury/no-sub scenario. When the batting order reaches a ghost slot, the game auto-logs a scoreless out and skips ahead with no picker or pitch-logging needed.
- Inline edit-batter form — tapping Edit on a roster row now opens the form directly under that row instead of jumping to the bottom of the page.

### Fixed
- Page scroll was blocked when touching anywhere on a batting-order row (not just the drag handle) — could get stuck unable to scroll past the lineup section.
- The ✕ on a ghost-out slot didn't actually remove it (silently recomputed back into the order).
- A ghost-out row displayed "?" instead of its label, due to a dnd-kit sortable-ID mismatch in the ghost-detection check.
— PR #8

## [0.4.0] — 2026-09-02

### Changed
- Replaced placeholder logo JPEGs with the final traced brand assets: sharp home-plate badge outline, straight-edged red V, smoothly-curved black S, and the full VeloSync wordmark. Added properly sized/maskable PWA app icons (previously used the raw 1152x1728 source image directly).
— PR #5

## [0.3.0] — 2026-09-02

### Added
- Mid-game player substitution: swap in a replacement from the full team roster (not just today's starting lineup) for any current batter. Substitution only affects future turns in the order — past at-bats are never rewritten. Includes an "add player" shortcut if the substitute isn't rostered yet, which returns to the same in-progress game afterward with no lost state. Full substitution history (who/out, who/in, inning, timestamp) is now tracked and shown on the post-game box score screen.
— PR #7

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
