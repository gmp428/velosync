import Dexie, { type EntityTable } from 'dexie'

// ---------- IDs & timestamps ----------
// Every row uses a globally-unique id (not an auto-increment integer) so the
// same record has the same id on every device — the foundation for syncing to
// a server later. `updatedAt` is stamped on every write for future sync/merge.

export const newId = (): string => crypto.randomUUID()
export const now = (): number => Date.now()

// Local-only sync stub. A later Postgres/Supabase pass can land without a rewrite.
// Nothing is sent off-device until that exists.
export type SyncStatus = 'pending' | 'synced' | 'error'

export type SyncMeta = {
  syncStatus: SyncStatus
  syncedAt?: number | null
}

/** Mark a local create/edit as not-yet-synced. Cloud sync is not implemented. */
export function pendingSync(): SyncMeta {
  return { syncStatus: 'pending', syncedAt: null }
}

function hydrateSync<T extends object>(row: T): T & SyncMeta {
  const r = row as T & Partial<SyncMeta>
  return {
    ...row,
    syncStatus: r.syncStatus ?? 'pending',
    syncedAt: r.syncedAt === undefined ? null : r.syncedAt,
  }
}

// Backups made before sortIndex existed have no batting-order field. Assign
// each opponent's batters 0,1,2... in their existing array order (same
// insertion-order fallback the schema v4 migration uses) rather than leaving
// sortIndex undefined, which would break sorts on import.
function hydrateBatterSortIndex<T extends { id: string; opponentId: string; sortIndex?: number }>(rows: T[]): T[] {
  const counters = new Map<string, number>()
  return rows.map((row) => {
    if (row.sortIndex != null) return row
    const next = counters.get(row.opponentId) ?? 0
    counters.set(row.opponentId, next + 1)
    return { ...row, sortIndex: next }
  })
}

// ---------- Types ----------

export interface Opponent {
  id: string
  name: string
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
  // Whether this opponent's baseline batting order (built on the roster
  // screen) plans a "ghost out" placeholder in the 9th spot — for a league
  // that enforces an automatic out for a short-handed 9th slot when the
  // team has exactly 8 real active batters. Draggable like a real batter
  // in the lineup editor; carried into a new game's default lineup
  // alongside sortIndex. Only ever offered/settable when activeToday
  // batters number exactly 8 — see Roster.tsx.
  ghostOutEnabled?: boolean
  ghostOutSortIndex?: number // position among batters' sortIndex values
}

export interface Batter {
  id: string
  opponentId: string
  firstName: string
  lastName?: string
  name?: string // legacy single-name (pre first/last split)
  number?: string
  bats: 'L' | 'R'
  notes?: string
  // Position in this opponent's saved batting order (0-based, ascending).
  // Drives both the roster screen's display order and a new game's default
  // lineup when there's no prior finished-game lineup to inherit from.
  sortIndex: number
  // Whether this batter is checked into TODAY's active lineup (max 9 checked
  // at once per opponent, no minimum). Only checked batters appear in the
  // batting-order drag list and get used to build a new game's lineup.
  // Undefined only appears on rows from before this field existed; the v5
  // migration backfills it, so app code should treat it as always defined.
  activeToday?: boolean
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

// A batting order has at most 9 active slots (no minimum — local/rec ball
// commonly plays short-handed with zero penalty). Enforced in the roster UI.
export const MAX_ACTIVE_LINEUP = 9

export interface Pitcher {
  id: string
  firstName: string
  lastName?: string
  name?: string // legacy single-name (pre first/last split)
  number?: string
  throws: 'L' | 'R'
  notes?: string
  // Pitch types this pitcher can throw. Undefined or empty = all pitch types
  // (covers pitchers created before arsenals existed).
  pitchTypeIds?: string[]
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

// Display "F. Last" (falls back to first name, then legacy name).
export function displayName(p: { firstName?: string; lastName?: string; name?: string } | undefined): string {
  if (!p) return '?'
  if (p.firstName && p.lastName) return `${p.firstName[0].toUpperCase()}. ${p.lastName}`
  return p.firstName || p.name || '?'
}

// Full "First Last" (for report titles).
export function fullName(p: { firstName?: string; lastName?: string; name?: string } | undefined): string {
  if (!p) return '?'
  const joined = [p.firstName, p.lastName].filter(Boolean).join(' ')
  return joined || p.name || '?'
}

export function pitcherArsenal(pitcher: Pitcher | undefined, allTypes: PitchType[]): PitchType[] {
  if (!pitcher?.pitchTypeIds || pitcher.pitchTypeIds.length === 0) return allTypes
  const allowed = new Set(pitcher.pitchTypeIds)
  const arsenal = allTypes.filter((t) => allowed.has(t.id))
  return arsenal.length > 0 ? arsenal : allTypes
}

export interface PitchType {
  id: string
  name: string
  abbr: string
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

export interface Game {
  id: string
  opponentId: string
  date: string // ISO yyyy-mm-dd
  label?: string
  status: 'active' | 'finished'
  currentPitcherId?: string
  lineup?: string[] // ordered batterIds — the opponent's batting order for this game.
  // A slot can also hold the GHOST_OUT sentinel (see below) instead of a
  // real batterId, marking a vacated lineup spot that auto-outs when reached.
  currentInning?: number // advances during the game (undefined = untracked, treat as 1)
  half?: 'top' | 'bottom' // which half the opponent bats — constant for the game
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

// A real roster change mid-game: one player replaces another going forward in
// the batting order. Distinct from the "wrong batter?" switch in LiveGame
// (which just corrects a mis-logged current at-bat and touches no history) —
// a Substitution is a persisted event for scouting/stats: who came out, who
// came in, what inning, and when. Never mutates past at-bats/pitches.
export interface Substitution {
  id: string
  gameId: string
  inning: number // inning the substitution took effect
  battedOutId: string // batterId who was replaced
  battedInId: string // batterId who came in
  timestamp: number
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

// Sentinel placed into `Game.lineup` for a vacated slot marked "ghost out"
// (a real mechanic — also called "automatic out" — in local/rec-ball
// rulebooks: used for a short-handed team, a player who leaves/is ejected
// mid-game, or any lineup slot with no sub available). When the batting
// order's cycle reaches this sentinel, LiveGame auto-logs a scoreless out
// and advances to the next real batter without any batter-picker or pitch
// logging for that turn. Never a real batterId, so `db.batters.get(...)`
// on it simply resolves to undefined — call sites must check for it first.
export const GHOST_OUT = '__ghost_out__' as const

export type AtBatOutcome =
  | 'walk'
  | 'strikeout'
  | 'out'
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run'
  | 'error'
  | 'hbp'
  | 'ghost_out' // automatic scoreless out for a vacated (ghost) lineup slot

export interface AtBat {
  id: string
  gameId: string
  // Real batterId, or the GHOST_OUT sentinel for an automatic out logged
  // against a vacated slot (no real batter took this turn).
  batterId: string
  pitcherId: string
  outcome?: AtBatOutcome
  inning?: number // inning this at-bat occurred in (undefined = untracked)
  startedAt: number
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

// Zones from the catcher's point of view.
// 1-9 are the strike zone (1 = up/left, 9 = down/right), o-* are out of the zone.
export type Zone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'o-up' | 'o-down' | 'o-left' | 'o-right'

export type PitchResult = 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'in_play' | 'hbp'

export type InPlayOutcome = 'out' | 'single' | 'double' | 'triple' | 'home_run' | 'error'

export interface Pitch {
  id: string
  gameId: string
  atBatId: string
  batterId: string
  pitcherId: string
  seq: number // 1-based pitch number within the at-bat
  balls: number // count BEFORE this pitch
  strikes: number
  pitchTypeId: string
  zone: Zone
  result: PitchResult
  inPlay?: InPlayOutcome
  inning?: number // inning this pitch was thrown in (undefined = untracked)
  ts: number
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

// ---------- App settings (logging detail level) ----------
// A single global preference row (id: 'app') controlling how much a coach logs
// per pitch. `capture` flags gate individual capture steps; a preset sets a
// sensible bundle of them (or 'custom' once toggled off-preset).

export type LoggingPreset = 'quick' | 'standard' | 'detailed' | 'custom'

export interface CaptureFlags {
  strikeType: boolean       // called vs swinging strike (off → single "Strike")
  inPlayDetail: boolean     // full hit types (off → just Out / Hit)
  hbp: boolean              // hit-by-pitch as a pitch outcome
  inning: boolean           // tag pitches/at-bats by inning + inning control
  // Future capture steps — flags exist so the UI can gate them as they ship.
  intendedLocation: boolean
  fieldPosition: boolean
  battedBallType: boolean
}

export interface AppSettings {
  id: 'app'
  preset: LoggingPreset
  capture: CaptureFlags
  updatedAt: number
}

const CAPTURE_QUICK: CaptureFlags = {
  strikeType: false, inPlayDetail: false, hbp: false, inning: false,
  intendedLocation: false, fieldPosition: false, battedBallType: false,
}
const CAPTURE_STANDARD: CaptureFlags = {
  strikeType: true, inPlayDetail: true, hbp: true, inning: false,
  intendedLocation: false, fieldPosition: false, battedBallType: false,
}
const CAPTURE_DETAILED: CaptureFlags = {
  strikeType: true, inPlayDetail: true, hbp: true, inning: true,
  intendedLocation: true, fieldPosition: true, battedBallType: true,
}

export const CAPTURE_PRESETS: Record<'quick' | 'standard' | 'detailed', CaptureFlags> = {
  quick: CAPTURE_QUICK,
  standard: CAPTURE_STANDARD,
  detailed: CAPTURE_DETAILED,
}

// Capture flags that actually change logging today. The rest are shown in
// Settings as "coming soon" so the framework is visible but honest.
export const LIVE_CAPTURE_FLAGS: Array<keyof CaptureFlags> = ['strikeType', 'inPlayDetail', 'hbp', 'inning']

export function defaultSettings(): AppSettings {
  return { id: 'app', preset: 'standard', capture: { ...CAPTURE_STANDARD }, updatedAt: now() }
}

// The stored settings row, or the default when none has been saved yet (existing
// databases predate the row — behavior stays identical until a coach changes it).
// Named presets derive their capture flags from the preset definition (so updating
// a preset instantly reaches everyone on it); only 'custom' uses stored flags,
// merged over all-false so newly-added flags default off.
export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get('app')
  if (!s) return defaultSettings()
  if (s.preset !== 'custom') return { ...s, capture: { ...CAPTURE_PRESETS[s.preset] } }
  return { ...s, capture: { ...CAPTURE_QUICK, ...s.capture } }
}

export async function saveSettings(patch: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'app', updatedAt: now() })
}

// ---------- Database ----------

// Primary keys are supplied by us (UUIDs), not auto-incremented. The database
// name is versioned (…-v2) because the id type changed from integers to
// strings; the old integer-keyed database is discarded (data was throwaway).
//
// PR-preview builds (deploy.yml sets VELOSYNC_PR) use a COMPLETELY SEPARATE
// database name, never the production one — this is a hard storage-level
// isolation, not a flag check, so no code path can ever cross-contaminate a
// real coach's data with preview/seed data, no matter what changes here.
// See PR_SEED_DATA below: it populates this separate database once, the
// first time it's created (Dexie's on('populate') hook), so every PR
// preview opens with the same standard test dataset instead of blank.
export const IS_PR_PREVIEW = import.meta.env.BASE_URL.includes('/pr/')
const DB_NAME = IS_PR_PREVIEW ? 'pitch-tracker-pr-preview' : 'pitch-tracker-v2'

export const db = new Dexie(DB_NAME) as Dexie & {
  opponents: EntityTable<Opponent, 'id'>
  batters: EntityTable<Batter, 'id'>
  pitchers: EntityTable<Pitcher, 'id'>
  pitchTypes: EntityTable<PitchType, 'id'>
  games: EntityTable<Game, 'id'>
  atBats: EntityTable<AtBat, 'id'>
  pitches: EntityTable<Pitch, 'id'>
  settings: EntityTable<AppSettings, 'id'>
  substitutions: EntityTable<Substitution, 'id'>
}

db.version(1).stores({
  opponents: 'id, name, updatedAt',
  batters: 'id, opponentId, updatedAt',
  pitchers: 'id, name, updatedAt',
  pitchTypes: 'id, name, updatedAt',
  games: 'id, opponentId, status, updatedAt',
  atBats: 'id, gameId, batterId, pitcherId, updatedAt',
  pitches: 'id, gameId, atBatId, batterId, pitcherId, ts, updatedAt',
})

// v2 adds the singleton app-settings store (logging detail level). Additive and
// non-destructive — existing rows in the other stores are carried over as-is.
db.version(2).stores({
  settings: 'id',
})

// v3 adds local-only sync metadata (status + last-synced timestamp) so a later
// server sync can land without rewriting the schema. Existing rows become pending.
db.version(3).stores({
  opponents: 'id, name, updatedAt, syncStatus',
  batters: 'id, opponentId, updatedAt, syncStatus',
  pitchers: 'id, name, updatedAt, syncStatus',
  pitchTypes: 'id, name, updatedAt, syncStatus',
  games: 'id, opponentId, status, updatedAt, syncStatus',
  atBats: 'id, gameId, batterId, pitcherId, updatedAt, syncStatus',
  pitches: 'id, gameId, atBatId, batterId, pitcherId, ts, updatedAt, syncStatus',
}).upgrade(async (tx) => {
  const tables = ['opponents', 'batters', 'pitchers', 'pitchTypes', 'games', 'atBats', 'pitches'] as const
  for (const name of tables) {
    await tx.table(name).toCollection().modify((row: Partial<SyncMeta>) => {
      if (row.syncStatus == null) row.syncStatus = 'pending'
      if (row.syncedAt === undefined) row.syncedAt = null
    })
  }
})

// v4 adds a persisted batting-order position (sortIndex) to batters, so the
// roster screen's drag-to-reorder has somewhere to save its state, and a new
// game's default lineup can respect the coach's saved order (instead of
// falling back to raw insertion order) when there's no prior finished game to
// inherit a lineup from. Existing rows have no sortIndex yet — assign each
// opponent's batters 0,1,2... in their current primary-key/insertion order so
// pre-migration rosters keep a stable (if previously-implicit) order rather
// than colliding on index 0 or breaking sorts downstream.
db.version(4).stores({
  batters: 'id, opponentId, updatedAt, syncStatus, sortIndex',
}).upgrade(async (tx) => {
  const batters = await tx.table('batters').toArray()
  const byOpponent = new Map<string, typeof batters>()
  for (const b of batters) {
    const list = byOpponent.get(b.opponentId) ?? []
    list.push(b)
    byOpponent.set(b.opponentId, list)
  }
  for (const list of byOpponent.values()) {
    // `batters` was loaded in primary-key order already (Dexie's default),
    // which is the same insertion order the old fallback used — so this
    // preserves whatever order coaches were already implicitly relying on.
    for (let i = 0; i < list.length; i++) {
      if (list[i].sortIndex == null) {
        await tx.table('batters').update(list[i].id, { sortIndex: i })
      }
    }
  }
})

// v5 adds a Substitution table: a persisted record of mid-game roster
// changes (who was replaced, who came in, what inning, when) for future
// scouting/stats use. Purely additive — no existing store is touched.
db.version(5).stores({
  substitutions: 'id, gameId, inning, battedOutId, battedInId, timestamp, updatedAt, syncStatus',
})

// v6 adds `activeToday` (checked-into-today's-lineup state) to batters, so
// the roster screen can cap the active batting order at 9 without a minimum.
// Existing rows predate the field — default every batter to checked-in
// (existing rosters just keep behaving exactly as before: everyone bats)
// rather than silently emptying every team's lineup on upgrade.
db.version(6).stores({
  batters: 'id, opponentId, updatedAt, syncStatus, sortIndex',
}).upgrade(async (tx) => {
  await tx.table('batters').toCollection().modify((row: Partial<Batter>) => {
    if (row.activeToday == null) row.activeToday = true
  })
})

// Discard the legacy integer-keyed database from before the UUID switch.
Dexie.delete('pitch-tracker').catch(() => {})

const SYNC_TABLES = ['opponents', 'batters', 'pitchers', 'pitchTypes', 'games', 'atBats', 'pitches', 'substitutions'] as const

for (const name of SYNC_TABLES) {
  const table = db.table(name)
  table.hook('creating', (_pk, obj) => {
    const row = obj as SyncMeta
    if (row.syncStatus == null) row.syncStatus = 'pending'
    if (row.syncedAt === undefined) row.syncedAt = null
  })
  table.hook('updating', () => ({
    syncStatus: 'pending' as const,
    syncedAt: null,
  }))
}

const DEFAULT_PITCH_TYPES: Array<Pick<PitchType, 'name' | 'abbr'>> = [
  { name: 'Fastball', abbr: 'FB' },
  { name: 'Changeup', abbr: 'CH' },
  { name: 'Drop ball', abbr: 'DR' },
  { name: 'Rise ball', abbr: 'RI' },
  { name: 'Curveball', abbr: 'CV' },
  { name: 'Screwball', abbr: 'SC' },
]

db.on('populate', async () => {
  await db.pitchTypes.bulkAdd(DEFAULT_PITCH_TYPES.map((t) => ({ ...t, id: newId(), updatedAt: now(), ...pendingSync() })))
  // PR-preview builds get a standard seed dataset on top of the default
  // pitch types, so a reviewer opens a populated scouting report instead of
  // a blank app. Fires once, only into the separate pr-preview database
  // (see DB_NAME above) -- structurally impossible to touch real data.
  if (IS_PR_PREVIEW) {
    await seedPrPreviewData()
  }
})

// ---------- PR-preview seed data ----------
// One standard, deterministic test dataset: a fixed opponent team, roster,
// pitching staff (varied arsenals), and a finished game with real pitch
// history -- so a reviewer can immediately exercise scouting reports,
// batting order, substitutions, etc. without manual setup. Same dataset
// every time (fixed names/order), so quirks are easy to learn and spot
// regressions against, per G's request. Only ever runs in the isolated
// pr-preview database -- never production.
async function seedPrPreviewData(): Promise<void> {
  const ts = now()

  const opponentId = 'seed-opponent-riverdale'
  await db.opponents.add({
    id: opponentId, name: 'Riverdale Rays', updatedAt: ts, ...pendingSync(),
  })

  const batterDefs = [
    { firstName: 'Casey', lastName: 'Nguyen', number: '2', bats: 'L' as const },
    { firstName: 'Maya', lastName: 'Ortiz', number: '7', bats: 'R' as const },
    { firstName: 'Jordan', lastName: 'Blake', number: '14', bats: 'R' as const },
    { firstName: 'Sam', lastName: 'Whitfield', number: '9', bats: 'L' as const },
    { firstName: 'Riley', lastName: 'Chen', number: '21', bats: 'R' as const },
    { firstName: 'Avery', lastName: 'Dunn', number: '3', bats: 'R' as const },
    { firstName: 'Taylor', lastName: 'Grimes', number: '11', bats: 'L' as const },
    { firstName: 'Morgan', lastName: 'Ellis', number: '18', bats: 'R' as const },
    { firstName: 'Skylar', lastName: 'Park', number: '5', bats: 'R' as const },
    { firstName: 'Devin', lastName: 'Torres', number: '24', bats: 'L' as const }, // bench, not in today's 9
  ]
  const batterIds = batterDefs.map((_, i) => `seed-batter-${i}`)
  await db.batters.bulkAdd(batterDefs.map((b, i) => ({
    id: batterIds[i], opponentId, sortIndex: i, activeToday: i < 9, updatedAt: ts, ...pendingSync(), ...b,
  })))

  const pitchTypeRows = await db.pitchTypes.toArray()
  const byAbbr = (abbr: string) => pitchTypeRows.find((t) => t.abbr === abbr)?.id
  const pitcherDefs = [
    { firstName: 'Charlie', lastName: 'Reyes', number: '1', throws: 'R' as const, arsenal: ['FB', 'CH', 'CV'] },
    { firstName: 'Bailey', lastName: 'Foster', number: '17', throws: 'L' as const, arsenal: ['FB', 'DR', 'RI', 'SC'] },
  ]
  const pitcherIds = pitcherDefs.map((_, i) => `seed-pitcher-${i}`)
  await db.pitchers.bulkAdd(pitcherDefs.map((p, i) => ({
    id: pitcherIds[i], firstName: p.firstName, lastName: p.lastName, number: p.number, throws: p.throws,
    pitchTypeIds: p.arsenal.map(byAbbr).filter((x): x is string => Boolean(x)),
    updatedAt: ts, ...pendingSync(),
  })))

  // One finished game with a real, varied pitch history so batter/pitcher
  // reports and heat maps have something to show immediately.
  const gameId = 'seed-game-1'
  const lineup = batterIds.slice(0, 9) // Devin Torres (bench) sits this one out
  await db.games.add({
    id: gameId, opponentId, date: '2026-08-24', label: 'vs Riverdale (scrimmage)',
    status: 'finished', currentPitcherId: pitcherIds[0], lineup,
    currentInning: 4, half: 'top',
    updatedAt: ts, ...pendingSync(),
  })

  type SeedPitch = { result: PitchResult; pitchTypeId?: string; inPlay?: InPlayOutcome }
  const fb = byAbbr('FB')!, ch = byAbbr('CH')!, cv = byAbbr('CV')!, dr = byAbbr('DR')!
  // A handful of representative at-bats across a few batters and both
  // pitchers, with mixed outcomes -- enough variety for stats/heat maps to
  // render real-looking data, not just one repeated pattern.
  const atBatPlans: Array<{ batterIdx: number; pitcherIdx: number; inning: number; outcome: AtBatOutcome | undefined; pitches: SeedPitch[] }> = [
    { batterIdx: 0, pitcherIdx: 0, inning: 1, outcome: 'strikeout', pitches: [
      { result: 'called_strike', pitchTypeId: fb }, { result: 'foul', pitchTypeId: fb }, { result: 'swinging_strike', pitchTypeId: cv },
    ] },
    { batterIdx: 1, pitcherIdx: 0, inning: 1, outcome: 'single', pitches: [
      { result: 'ball', pitchTypeId: fb }, { result: 'in_play', pitchTypeId: fb, inPlay: 'single' },
    ] },
    { batterIdx: 2, pitcherIdx: 0, inning: 1, outcome: 'out', pitches: [
      { result: 'in_play', pitchTypeId: ch, inPlay: 'out' },
    ] },
    { batterIdx: 3, pitcherIdx: 1, inning: 2, outcome: 'walk', pitches: [
      { result: 'ball', pitchTypeId: fb }, { result: 'ball', pitchTypeId: dr }, { result: 'called_strike', pitchTypeId: fb }, { result: 'ball', pitchTypeId: dr }, { result: 'ball', pitchTypeId: fb },
    ] },
    { batterIdx: 4, pitcherIdx: 1, inning: 2, outcome: 'double', pitches: [
      { result: 'in_play', pitchTypeId: fb, inPlay: 'double' },
    ] },
    { batterIdx: 0, pitcherIdx: 1, inning: 3, outcome: 'strikeout', pitches: [
      { result: 'swinging_strike', pitchTypeId: dr }, { result: 'ball', pitchTypeId: fb }, { result: 'swinging_strike', pitchTypeId: dr },
    ] },
    { batterIdx: 1, pitcherIdx: 1, inning: 3, outcome: 'home_run', pitches: [
      { result: 'called_strike', pitchTypeId: fb }, { result: 'in_play', pitchTypeId: fb, inPlay: 'home_run' },
    ] },
    { batterIdx: 2, pitcherIdx: 0, inning: 4, outcome: 'out', pitches: [
      { result: 'foul', pitchTypeId: cv }, { result: 'in_play', pitchTypeId: cv, inPlay: 'out' },
    ] },
  ]

  let pitchTs = ts - 1000 * 60 * 60 // an hour "ago" so it doesn't read as live
  for (let i = 0; i < atBatPlans.length; i++) {
    const plan = atBatPlans[i]
    const atBatId = `seed-atbat-${i}`
    await db.atBats.add({
      id: atBatId, gameId, batterId: batterIds[plan.batterIdx], pitcherId: pitcherIds[plan.pitcherIdx],
      outcome: plan.outcome, inning: plan.inning, startedAt: pitchTs, updatedAt: ts, ...pendingSync(),
    })
    let balls = 0, strikes = 0
    for (let seq = 0; seq < plan.pitches.length; seq++) {
      const p = plan.pitches[seq]
      pitchTs += 15_000
      await db.pitches.add({
        id: `seed-pitch-${i}-${seq}`, gameId, atBatId, batterId: batterIds[plan.batterIdx], pitcherId: pitcherIds[plan.pitcherIdx],
        seq: seq + 1, balls, strikes, pitchTypeId: p.pitchTypeId ?? fb, zone: ((seq % 9) + 1) as Zone,
        result: p.result, inPlay: p.inPlay, inning: plan.inning, ts: pitchTs, updatedAt: ts, ...pendingSync(),
      })
      if (p.result === 'ball') balls++
      else if (p.result === 'called_strike' || p.result === 'swinging_strike') strikes++
    }
  }
}

// ---------- Display helpers ----------

export const ZONES_IN: Zone[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const ZONES_OUT: Zone[] = ['o-up', 'o-down', 'o-left', 'o-right']

export function zoneLabel(zone: Zone): string {
  if (typeof zone === 'number') {
    const row = ['high', 'middle', 'low'][Math.floor((zone - 1) / 3)]
    const col = ['left', 'center', 'right'][(zone - 1) % 3]
    if (row === 'middle' && col === 'center') return 'middle-middle'
    return `${row}-${col}`
  }
  return { 'o-up': 'high (out of zone)', 'o-down': 'low (out of zone)', 'o-left': 'left (out of zone)', 'o-right': 'right (out of zone)' }[zone]
}

export function resultLabel(p: { result: PitchResult; inPlay?: InPlayOutcome }): string {
  switch (p.result) {
    case 'ball': return 'Ball'
    case 'called_strike': return 'Called strike'
    case 'swinging_strike': return 'Swinging strike'
    case 'foul': return 'Foul'
    case 'hbp': return 'Hit by pitch'
    case 'in_play': return `In play: ${outcomeLabel(p.inPlay!)}`
  }
}

export function outcomeLabel(o: AtBatOutcome | InPlayOutcome): string {
  return {
    walk: 'Walk', strikeout: 'Strikeout', out: 'Out', single: 'Single', double: 'Double',
    triple: 'Triple', home_run: 'Home run', error: 'Reached on error', hbp: 'Hit by pitch',
    ghost_out: 'Ghost out (automatic)',
  }[o]
}

// ---------- Export / import ----------

export interface BackupFile {
  app: 'pitch-tracker'
  version: number // 2 = pre-sync-meta; 3 = includes syncStatus/syncedAt; 4 = includes substitutions
  exportedAt: string
  opponents: Opponent[]
  batters: Batter[]
  pitchers: Pitcher[]
  pitchTypes: PitchType[]
  games: Game[]
  atBats: AtBat[]
  pitches: Pitch[]
  settings?: AppSettings[] // optional: older backups predate app settings
  substitutions?: Substitution[] // optional: older backups predate substitutions
}

export async function exportAll(): Promise<BackupFile> {
  return {
    app: 'pitch-tracker',
    version: 3,
    exportedAt: new Date().toISOString(),
    opponents: await db.opponents.toArray(),
    batters: await db.batters.toArray(),
    pitchers: await db.pitchers.toArray(),
    pitchTypes: await db.pitchTypes.toArray(),
    games: await db.games.toArray(),
    atBats: await db.atBats.toArray(),
    pitches: await db.pitches.toArray(),
    settings: await db.settings.toArray(),
    substitutions: await db.substitutions.toArray(),
  }
}

export async function importAll(data: BackupFile): Promise<void> {
  if (data.app !== 'pitch-tracker' || !Array.isArray(data.pitches)) {
    throw new Error('This file does not look like a VeloSync backup.')
  }
  await db.transaction('rw', [db.opponents, db.batters, db.pitchers, db.pitchTypes, db.games, db.atBats, db.pitches, db.settings, db.substitutions], async () => {
    await Promise.all([
      db.opponents.clear(), db.batters.clear(), db.pitchers.clear(),
      db.pitchTypes.clear(), db.games.clear(), db.atBats.clear(), db.pitches.clear(),
      db.settings.clear(), db.substitutions.clear(),
    ])
    await db.opponents.bulkAdd(data.opponents.map(hydrateSync))
    await db.batters.bulkAdd(hydrateBatterSortIndex(data.batters.map(hydrateSync)))
    await db.pitchers.bulkAdd(data.pitchers.map(hydrateSync))
    await db.pitchTypes.bulkAdd(data.pitchTypes.map(hydrateSync))
    await db.games.bulkAdd(data.games.map(hydrateSync))
    await db.atBats.bulkAdd(data.atBats.map(hydrateSync))
    await db.pitches.bulkAdd(data.pitches.map(hydrateSync))
    // Older backups predate settings — restore the row if present, else leave
    // the store empty so getSettings() falls back to the default.
    if (data.settings?.length) await db.settings.bulkAdd(data.settings)
    // Older backups predate substitutions — same fallback.
    if (data.substitutions?.length) await db.substitutions.bulkAdd(data.substitutions.map(hydrateSync))
  })
}

// ---------- Lineup ----------

// A game's default batting order: start from the most recent finished game's
// lineup for this opponent, drop batters no longer on the roster or no longer
// checked into today's lineup (activeToday), then append any active roster
// batters not already in it. Falls back to plain roster order. Ghost-out
// sentinels from a prior game are never carried forward — each game's
// vacancies are decided fresh.
export async function defaultLineup(opponentId: string): Promise<string[]> {
  const opponent = await db.opponents.get(opponentId)
  const roster = await db.batters.where('opponentId').equals(opponentId).toArray()
  const active = roster.filter((b) => b.activeToday !== false).slice(0, MAX_ACTIVE_LINEUP)
  const activeSet = new Set(active.map((b) => b.id))
  // Fallback order when there's no prior lineup to inherit: the coach's saved
  // batting order (sortIndex), not raw insertion order. Splices in the
  // roster-level planned ghost-out slot (see Opponent.ghostOutEnabled) if set.
  const items: Array<{ id: string; sortIndex: number }> = active.map((b) => ({ id: b.id, sortIndex: b.sortIndex ?? 0 }))
  if (opponent?.ghostOutEnabled) {
    items.push({ id: GHOST_OUT, sortIndex: opponent.ghostOutSortIndex ?? Infinity })
  }
  items.sort((a, b) => a.sortIndex - b.sortIndex)
  const bySortIndex = items.map((i) => i.id)

  const games = await db.games.where('opponentId').equals(opponentId).toArray()
  const prev = games
    .filter((g) => g.status === 'finished' && g.lineup && g.lineup.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]

  if (!prev?.lineup) return bySortIndex
  const kept = prev.lineup.filter((id) => id !== GHOST_OUT && activeSet.has(id))
  const appended = bySortIndex.filter((id) => !kept.includes(id))
  return [...kept, ...appended]
}

// When a game ends, its final lineup (the order actually batted, including any
// mid-game drag reordering) becomes the roster's new baseline order — so the
// roster screen and the next game's default both reflect the most recently
// PLAYED order, not just the most recently built one. Only batters present in
// `lineup` are touched; a batter added to the roster after this game (so not
// in the lineup) keeps its existing sortIndex and still sorts to the end.
// Ghost-out sentinels in `lineup` are skipped — there's no batter row to update.
export async function persistLineupToRoster(lineup: string[]): Promise<void> {
  await db.transaction('rw', db.batters, async () => {
    const realLineup = lineup.filter((id) => id !== GHOST_OUT)
    if (realLineup.length === 0) return
    const lineupSet = new Set(realLineup)
    // Batters not in this lineup (e.g. added to the roster after this game
    // started) keep their relative order but must be pushed past the lineup
    // batters' new indices so nothing collides with 0..lineup.length-1.
    const opponentId = (await db.batters.get(realLineup[0]))?.opponentId
    const others = opponentId
      ? (await db.batters.where('opponentId').equals(opponentId).toArray())
          .filter((b) => !lineupSet.has(b.id))
          .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      : []

    for (let i = 0; i < realLineup.length; i++) {
      const batter = await db.batters.get(realLineup[i])
      if (!batter) continue // batter removed from roster since the game started
      await db.batters.update(realLineup[i], { sortIndex: i, updatedAt: now(), ...pendingSync() })
    }
    for (let i = 0; i < others.length; i++) {
      await db.batters.update(others[i].id, { sortIndex: realLineup.length + i, updatedAt: now(), ...pendingSync() })
    }
  })
}
