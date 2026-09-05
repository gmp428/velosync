import type { Game, Pitch, Zone } from '../db'
import { normalizeZone } from '../db'

// A pitch is a "success" for us when it got a called strike, a swing-and-miss,
// or was put in play for an out.
export function isSuccess(p: Pitch): boolean {
  if (p.result === 'called_strike' || p.result === 'swinging_strike') return true
  if (p.result === 'in_play') return p.inPlay === 'out'
  return false
}

export function isHit(p: Pitch): boolean {
  return p.result === 'in_play' && (p.inPlay === 'single' || p.inPlay === 'double' || p.inPlay === 'triple' || p.inPlay === 'home_run')
}

// The batter offered at the pitch (swung).
export function isSwing(p: Pitch): boolean {
  return p.result === 'swinging_strike' || p.result === 'foul' || p.result === 'in_play'
}

// Out-of-zone pitches use the string zone regions (o-up/o-down/o-left/o-right);
// in-zone pitches use the numeric 1–9 grid.
export function isOutOfZone(p: Pitch): boolean {
  return typeof p.zone === 'string'
}

export interface Agg {
  total: number
  balls: number
  calledStrikes: number
  whiffs: number
  fouls: number
  inPlayOuts: number
  hits: number
  errors: number
}

export function aggregate(pitches: Pitch[]): Agg {
  const a: Agg = { total: 0, balls: 0, calledStrikes: 0, whiffs: 0, fouls: 0, inPlayOuts: 0, hits: 0, errors: 0 }
  for (const p of pitches) {
    a.total++
    if (p.result === 'ball') a.balls++
    else if (p.result === 'called_strike') a.calledStrikes++
    else if (p.result === 'swinging_strike') a.whiffs++
    else if (p.result === 'foul') a.fouls++
    else if (p.result === 'in_play') {
      if (p.inPlay === 'out') a.inPlayOuts++
      else if (p.inPlay === 'error') a.errors++
      else a.hits++
    }
  }
  return a
}

export function successRate(a: Agg): number {
  return a.total === 0 ? 0 : (a.calledStrikes + a.whiffs + a.inPlayOuts) / a.total
}

// ---------- Time windows ----------

export type TimeWindow = 'last1' | 'last3' | 'all'

export const WINDOW_LABELS: Record<TimeWindow, string> = {
  last1: 'Last game',
  last3: 'Last 3 games',
  all: 'Overall',
}

// Sort game ids newest-first by date (updatedAt breaks ties, higher = newer).
export function orderGamesNewestFirst(games: Game[]): string[] {
  return [...games]
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.updatedAt - a.updatedAt))
    .map((g) => g.id)
}

// The set of game ids to include for a window, based on the games in which
// these pitches actually occurred (e.g. a batter's most recent games with data).
// Returns null for 'all' (no filtering needed).
export function gameIdsForWindow(pitches: Pitch[], allGames: Game[], window: TimeWindow): Set<string> | null {
  if (window === 'all') return null
  const withData = new Set(pitches.map((p) => p.gameId))
  const ordered = orderGamesNewestFirst(allGames.filter((g) => withData.has(g.id)))
  return new Set(ordered.slice(0, window === 'last1' ? 1 : 3))
}

export function filterByWindow(pitches: Pitch[], allGames: Game[], window: TimeWindow): Pitch[] {
  const ids = gameIdsForWindow(pitches, allGames, window)
  return ids === null ? pitches : pitches.filter((p) => ids.has(p.gameId))
}

// ---------- Groupings ----------

function groupBy<K>(pitches: Pitch[], key: (p: Pitch) => K): Map<K, Pitch[]> {
  const m = new Map<K, Pitch[]>()
  for (const p of pitches) {
    const k = key(p)
    const arr = m.get(k)
    if (arr) arr.push(p)
    else m.set(k, [p])
  }
  return m
}

export function byZone(pitches: Pitch[]): Map<Zone, Agg> {
  return new Map([...groupBy(pitches, (p) => p.zone)].map(([k, v]) => [k, aggregate(v)]))
}

export function byPitchType(pitches: Pitch[]): Map<string, Agg> {
  return new Map([...groupBy(pitches, (p) => p.pitchTypeId)].map(([k, v]) => [k, aggregate(v)]))
}

export function byPitcher(pitches: Pitch[]): Map<string, Agg> {
  return new Map([...groupBy(pitches, (p) => p.pitcherId)].map(([k, v]) => [k, aggregate(v)]))
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

// ---------- "Battle" view: who won the pitch ----------
// good = we won it (called strike, whiff, foul, in-play out)
// bad  = they won it (hit, reached on error)
// balls are neutral (neither side "won" the pitch)

export interface BattleAgg {
  good: number
  bad: number
  balls: number
  total: number
}

export function battleAgg(pitches: Pitch[]): BattleAgg {
  const a: BattleAgg = { good: 0, bad: 0, balls: 0, total: 0 }
  for (const p of pitches) {
    a.total++
    // Balls and hit-by-pitches are neutral — not a strike, but the batter
    // didn't win the pitch off contact either.
    if (p.result === 'ball' || p.result === 'hbp') a.balls++
    else if (p.result === 'in_play' && p.inPlay !== 'out') a.bad++
    else a.good++
  }
  return a
}

// null when there's nothing decisive to rate (only balls, or no pitches)
export function battleRate(a: BattleAgg): number | null {
  return a.good + a.bad === 0 ? null : a.good / (a.good + a.bad)
}

export function byZoneBattle(pitches: Pitch[]): Map<Zone, BattleAgg> {
  const m = new Map<Zone, Pitch[]>()
  for (const p of pitches) {
    const arr = m.get(p.zone)
    if (arr) arr.push(p)
    else m.set(p.zone, [p])
  }
  return new Map([...m].map(([k, v]) => [k, battleAgg(v)]))
}

// ---------- Outcome breakdown for the per-pitch stat buttons ----------

export interface OutcomeSlice {
  label: string
  count: number
  pct: number // 0..1 of all pitches in the group
}

export function outcomeBreakdown(pitches: Pitch[]): OutcomeSlice[] {
  if (pitches.length === 0) return []
  const buckets: Record<string, number> = {}
  const bump = (label: string) => { buckets[label] = (buckets[label] ?? 0) + 1 }
  for (const p of pitches) {
    if (p.result === 'ball') bump('Ball')
    else if (p.result === 'called_strike') bump('Called K')
    else if (p.result === 'swinging_strike') bump('Whiff')
    else if (p.result === 'foul') bump('Foul')
    else if (p.result === 'hbp') bump('HBP')
    else if (p.inPlay === 'out') bump('Out')
    else bump('Hit')
  }
  return Object.entries(buckets)
    .map(([label, count]) => ({ label, count, pct: count / pitches.length }))
    .sort((a, b) => b.count - a.count)
}

// ---------- Plate discipline & count splits ----------

export interface PlateDiscipline {
  seen: number
  chasePct: number | null // swings at out-of-zone / out-of-zone seen
  whiffPct: number | null // swinging strikes / swings
  zonePct: number | null // in-zone / seen
  calledStrikePct: number | null // called strikes / seen
  firstPitchStrikePct: number | null // 0-0 strikes / 0-0 seen
}

export function plateDiscipline(pitches: Pitch[]): PlateDiscipline {
  let seen = 0, inZone = 0, oozSeen = 0, oozSwings = 0
  let swings = 0, whiffs = 0, called = 0
  let firstSeen = 0, firstStrikes = 0
  for (const p of pitches) {
    seen++
    if (isOutOfZone(p)) { oozSeen++; if (isSwing(p)) oozSwings++ } else inZone++
    if (isSwing(p)) swings++
    if (p.result === 'swinging_strike') whiffs++
    if (p.result === 'called_strike') called++
    if (p.balls === 0 && p.strikes === 0) {
      firstSeen++
      // strike = anything not a ball or hit-by-pitch
      if (p.result !== 'ball' && p.result !== 'hbp') firstStrikes++
    }
  }
  const rate = (num: number, den: number) => (den === 0 ? null : num / den)
  return {
    seen,
    chasePct: rate(oozSwings, oozSeen),
    whiffPct: rate(whiffs, swings),
    zonePct: rate(inZone, seen),
    calledStrikePct: rate(called, seen),
    firstPitchStrikePct: rate(firstStrikes, firstSeen),
  }
}

export function countKey(p: Pitch): string {
  return `${p.balls}-${p.strikes}`
}

// ---------- Command / intended-vs-actual location ----------
// Only meaningful for pitches logged with the "Intended location" capture
// flag on (Pitch.intendedZone set). Every other pitch is simply excluded
// from these stats — there's nothing to compare.

// Grid coordinates [col, row] for every zone, matching the ZoneGrid layouts
// exactly (see components/ZoneGrid.tsx CELLS_COARSE / CELLS_GRANULAR).
// Adjacency for "loose" command matching is derived generically from these
// (any zone one step away horizontally/vertically, no diagonals) rather than
// hand-listing every zone's neighbors separately — less error-prone, and
// automatically stays correct if either layout ever changes.
const GRANULAR_COORDS: Record<string, [number, number]> = {
  'og-up-left-corner': [1, 1], 'og-up-left-third': [2, 1], 'og-up-middle-third': [3, 1], 'og-up-right-third': [4, 1], 'og-up-right-corner': [5, 1],
  'og-left-up-third': [1, 2], 1: [2, 2], 2: [3, 2], 3: [4, 2], 'og-right-up-third': [5, 2],
  'og-left-middle-third': [1, 3], 4: [2, 3], 5: [3, 3], 6: [4, 3], 'og-right-middle-third': [5, 3],
  'og-left-down-third': [1, 4], 7: [2, 4], 8: [3, 4], 9: [4, 4], 'og-right-down-third': [5, 4],
  'og-down-left-corner': [1, 5], 'og-down-left-third': [2, 5], 'og-down-middle-third': [3, 5], 'og-down-right-third': [4, 5], 'og-down-right-corner': [5, 5],
}

// Coarse layout has 4 spanning outer regions (each covering 3 grid cells), so
// plain coordinate math doesn't apply cleanly — adjacency is hand-listed
// instead (only 13 zones, small and easy to verify against the grid picture
// in ZoneGrid.tsx: o-up spans above 1/2/3, o-left spans left of 1/4/7, etc).
const COARSE_ADJACENCY: Record<string, string[]> = {
  'o-up': [1, 2, 3] as unknown as string[],
  'o-down': [7, 8, 9] as unknown as string[],
  'o-left': [1, 4, 7] as unknown as string[],
  'o-right': [3, 6, 9] as unknown as string[],
  1: ['o-up', 2, 4, 'o-left'] as unknown as string[],
  2: ['o-up', 1, 3, 5] as unknown as string[],
  3: ['o-up', 2, 6, 'o-right'] as unknown as string[],
  4: ['o-left', 1, 5, 7] as unknown as string[],
  5: [2, 4, 6, 8] as unknown as string[],
  6: ['o-right', 3, 5, 9] as unknown as string[],
  7: ['o-left', 4, 8, 'o-down'] as unknown as string[],
  8: [5, 7, 9, 'o-down'] as unknown as string[],
  9: ['o-right', 6, 8, 'o-down'] as unknown as string[],
}

function granularAdjacent(a: Zone, b: Zone): boolean {
  const ca = GRANULAR_COORDS[String(a)]
  const cb = GRANULAR_COORDS[String(b)]
  if (!ca || !cb) return false
  return Math.abs(ca[0] - cb[0]) + Math.abs(ca[1] - cb[1]) === 1
}

// True when `actual` counts as hitting `intended` under the given mode.
// `resolution` should match whichever grid the pitch was actually logged at
// (coarse vs granular) — call normalizeZone() on both zones first if you need
// to compare across a mixed-resolution dataset.
export function commandHit(intended: Zone, actual: Zone, mode: 'tight' | 'loose', resolution: 'coarse' | 'granular'): boolean {
  if (intended === actual) return true
  if (mode === 'tight') return false
  if (resolution === 'granular') return granularAdjacent(intended, actual)
  const neighbors = COARSE_ADJACENCY[String(intended)] ?? []
  return neighbors.some((z) => String(z) === String(actual))
}

export interface CommandAgg {
  total: number       // pitches with intendedZone logged
  hit: number         // counted as hitting the target under the given mode
  missHigh: number
  missLow: number
  missArmSide: number  // toward o-right / right-third-ish cells (glove-side vs arm-side isn't handed-aware — see note below)
  missGloveSide: number
}

// Command aggregate for a set of pitches, under the given match mode. Pitches
// without an intendedZone are silently excluded (nothing to compare). Miss
// direction is a simple row/col comparison (intended vs actual), NOT
// batter/pitcher-handedness-aware — "arm side" here just means toward the
// right of the grid (the catcher's view), same convention as everywhere else
// in the app (zoneLabel, ZoneGrid). A handedness-aware left/right relabel can
// be layered on later without changing this aggregation.
export function commandAgg(pitches: Pitch[], mode: 'tight' | 'loose', resolution: 'coarse' | 'granular'): CommandAgg {
  const a: CommandAgg = { total: 0, hit: 0, missHigh: 0, missLow: 0, missArmSide: 0, missGloveSide: 0 }
  for (const p of pitches) {
    if (p.intendedZone === undefined) continue
    a.total++
    const intended = normalizeZone(p.intendedZone, resolution)
    const actual = normalizeZone(p.zone, resolution)
    if (commandHit(intended, actual, mode, resolution)) {
      a.hit++
      continue
    }
    const ci = resolution === 'granular' ? GRANULAR_COORDS[String(intended)] : undefined
    const ca = resolution === 'granular' ? GRANULAR_COORDS[String(actual)] : undefined
    if (ci && ca) {
      if (ca[1] < ci[1]) a.missHigh++
      else if (ca[1] > ci[1]) a.missLow++
      if (ca[0] > ci[0]) a.missArmSide++
      else if (ca[0] < ci[0]) a.missGloveSide++
    }
    // Coarse-resolution miss-direction is intentionally left unbucketed here
    // (COARSE_ADJACENCY has no coordinate grid to diff) — total/hit counts
    // are still fully correct at coarse resolution, just without a
    // high/low/arm/glove breakdown. Granular is where that detail lives.
  }
  return a
}

export function commandRate(a: CommandAgg): number | null {
  return a.total === 0 ? null : a.hit / a.total
}

// ---------- Command grouping heat map (granular resolution only) ----------
// For every granular zone a pitcher was aiming at (intendedZone), how tight
// was the actual grouping? Chebyshev ("king move") distance is used per G's
// exact spec: same zone = 1, any ring-1 neighbor INCLUDING diagonals = 2,
// ring 2 = 3, and so on outward. Averaging these per target zone gives a
// continuous "how scattered were the misses" score per target, distinct
// from the binary hit/miss of commandAgg() above.
//
// Only meaningful at granular resolution — the coarse layout's 4 outer
// zones each span 3 grid cells, so "how many rings away" isn't well-defined
// there the way it is on the uniform 5x5 granular grid.
export interface GroupingCell {
  intended: Zone
  avgDistance: number   // 1 = perfect, higher = more scattered
  count: number         // pitches aimed at this zone
  actualBreakdown: Map<Zone, number>  // for drill-down: where they actually landed
}

function chebyshevDistance(a: Zone, b: Zone): number | null {
  const ca = GRANULAR_COORDS[String(a)]
  const cb = GRANULAR_COORDS[String(b)]
  if (!ca || !cb) return null
  return Math.max(Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1])) + 1
}

// Pitches must already be normalized to granular resolution by the caller
// (normalizeZone both intendedZone and zone before calling this) if the
// dataset might mix coarse- and granular-logged pitches.
export function commandGrouping(pitches: Pitch[]): Map<Zone, GroupingCell> {
  const byIntended = new Map<Zone, Pitch[]>()
  for (const p of pitches) {
    if (p.intendedZone === undefined) continue
    const arr = byIntended.get(p.intendedZone)
    if (arr) arr.push(p)
    else byIntended.set(p.intendedZone, [p])
  }
  const result = new Map<Zone, GroupingCell>()
  for (const [intended, ps] of byIntended) {
    let sum = 0
    let n = 0
    const actualBreakdown = new Map<Zone, number>()
    for (const p of ps) {
      const d = chebyshevDistance(intended, p.zone)
      if (d === null) continue // shouldn't happen at granular resolution
      sum += d
      n++
      actualBreakdown.set(p.zone, (actualBreakdown.get(p.zone) ?? 0) + 1)
    }
    if (n > 0) result.set(intended, { intended, avgDistance: sum / n, count: n, actualBreakdown })
  }
  return result
}

// Colorblind-safe diverging scale (Okabe-Ito palette), used for the command
// grouping heat map. Blue (tight/good) to vermillion/orange (scattered/bad),
// quantized into 5 distinct bands rather than a smooth blend, matching
// ZoneGrid's heatColor() so both heat maps in the app use one consistent,
// colorblind-safe scale.
const GROUPING_BANDS: Array<{ maxDistance: number; bg: string; fg: string }> = [
  { maxDistance: 1.2, bg: '#0072B2', fg: '#ffffff' }, // near-perfect — strong blue
  { maxDistance: 1.8, bg: '#56B4E9', fg: '#0d1526' },  // sky blue
  { maxDistance: 2.4, bg: '#F0E442', fg: '#0d1526' },  // yellow — neutral middle
  { maxDistance: 3.0, bg: '#E69F00', fg: '#0d1526' },  // orange
  { maxDistance: Infinity, bg: '#D55E00', fg: '#ffffff' }, // vermillion — very scattered
]

export function groupingColor(avgDistance: number): { bg: string; fg: string } {
  for (const band of GROUPING_BANDS) if (avgDistance <= band.maxDistance) return { bg: band.bg, fg: band.fg }
  return GROUPING_BANDS[GROUPING_BANDS.length - 1]
}


export function byCount(pitches: Pitch[]): Array<{ key: string; pitches: Pitch[] }> {
  const m = new Map<string, Pitch[]>()
  for (const p of pitches) {
    const k = countKey(p)
    const arr = m.get(k)
    if (arr) arr.push(p)
    else m.set(k, [p])
  }
  return [...m.entries()]
    .map(([key, ps]) => ({ key, pitches: ps }))
    .sort((a, b) => {
      const [ab, as_] = a.key.split('-').map(Number)
      const [bb, bs] = b.key.split('-').map(Number)
      return ab - bb || as_ - bs
    })
}
