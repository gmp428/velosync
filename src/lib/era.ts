import type { AtBat, EarnedRun, EraInnings, Game, Season } from '../db'
import { orderSeasons } from './seasons'

// Outs the pitcher of record is charged with. Strikeouts and balls in play
// that are logged as outs live on the at-bat (one out each). Ghost outs are
// automatic outs credited to whoever was on the mound when the slot was
// skipped. Walks, hits, errors, and HBP are not outs.
export function isRecordedOut(outcome: AtBat['outcome']): boolean {
  return outcome === 'out' || outcome === 'strikeout' || outcome === 'ghost_out'
}

/** Baseball innings notation: 0 outs → "0.0", 1 → "0.1", 2 → "0.2", 3 → "1.0". */
export function formatInningsPitched(outs: number): string {
  const safe = Math.max(0, Math.floor(outs))
  const whole = Math.floor(safe / 3)
  const thirds = safe % 3
  return `${whole}.${thirds}`
}

/**
 * ERA = (ER × inningsPerGame) ÷ IP, where IP = outs ÷ 3.
 * Returns null when IP is 0 so the caller can show "—" (no runs) or "∞" (runs
 * with literally no innings). Never divides by zero.
 */
export function eraNumber(er: number, outs: number, inningsPerGame: EraInnings): number | null {
  if (outs <= 0) return null
  return (er * inningsPerGame) / (outs / 3)
}

export function formatEra(er: number, outs: number, inningsPerGame: EraInnings): string {
  if (outs <= 0) return er > 0 ? '∞' : '—'
  const era = eraNumber(er, outs, inningsPerGame)
  return era === null ? '—' : era.toFixed(2)
}

export function sumOuts(atBats: AtBat[], pitcherIds: Set<string>, gameIds: Set<string>): number {
  let outs = 0
  for (const ab of atBats) {
    if (!gameIds.has(ab.gameId) || !pitcherIds.has(ab.pitcherId)) continue
    if (isRecordedOut(ab.outcome)) outs++
  }
  return outs
}

export function sumEarnedRuns(rows: EarnedRun[], pitcherIds: Set<string>, gameIds: Set<string>): number {
  let er = 0
  for (const row of rows) {
    if (!gameIds.has(row.gameId) || !pitcherIds.has(row.pitcherId)) continue
    er += row.runs
  }
  return er
}

export type EraWindow = 'this' | 'last2' | 'last3' | 'all'

export const ERA_WINDOW_LABELS: Record<EraWindow, string> = {
  this: 'This season',
  last2: 'Last 2 seasons',
  last3: 'Last 3 seasons',
  all: 'Overall',
}

/** Seasons in the window, oldest → newest, ending at the anchor season. */
export function seasonsInWindow(seasons: Season[], games: Game[], anchorId: string, window: EraWindow): Season[] {
  const ordered = orderSeasons(seasons, games)
  if (window === 'all') return ordered
  const idx = ordered.findIndex((s) => s.id === anchorId)
  if (idx < 0) return []
  const count = window === 'this' ? 1 : window === 'last2' ? 2 : 3
  return ordered.slice(Math.max(0, idx - count + 1), idx + 1)
}

/**
 * Combined windows (last 2, last 3, overall) use the active season's 6/7/9
 * factor. "This season" uses that season's own factor.
 */
export function eraFactorForWindow(
  window: EraWindow,
  active: Season | undefined,
  anchor: Season,
): EraInnings {
  if (window === 'this') return anchor.eraInnings
  return active?.eraInnings ?? anchor.eraInnings
}

export function gameIdsForSeasons(games: Game[], seasonIds: Set<string>): Set<string> {
  const ids = new Set<string>()
  for (const g of games) {
    if (g.seasonId && seasonIds.has(g.seasonId)) ids.add(g.id)
  }
  return ids
}
