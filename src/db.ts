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

// ---------- Types ----------

export interface Opponent {
  id: string
  name: string
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
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
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

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
  lineup?: string[] // ordered batterIds — the opponent's batting order for this game
  currentInning?: number // advances during the game (undefined = untracked, treat as 1)
  half?: 'top' | 'bottom' // which half the opponent bats — constant for the game
  updatedAt: number
  syncStatus: SyncStatus
  syncedAt?: number | null
}

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

export interface AtBat {
  id: string
  gameId: string
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
export const db = new Dexie('pitch-tracker-v2') as Dexie & {
  opponents: EntityTable<Opponent, 'id'>
  batters: EntityTable<Batter, 'id'>
  pitchers: EntityTable<Pitcher, 'id'>
  pitchTypes: EntityTable<PitchType, 'id'>
  games: EntityTable<Game, 'id'>
  atBats: EntityTable<AtBat, 'id'>
  pitches: EntityTable<Pitch, 'id'>
  settings: EntityTable<AppSettings, 'id'>
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

// Discard the legacy integer-keyed database from before the UUID switch.
Dexie.delete('pitch-tracker').catch(() => {})

const SYNC_TABLES = ['opponents', 'batters', 'pitchers', 'pitchTypes', 'games', 'atBats', 'pitches'] as const

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
})

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
  }[o]
}

// ---------- Export / import ----------

export interface BackupFile {
  app: 'pitch-tracker'
  version: number // 2 = pre-sync-meta; 3 = includes syncStatus/syncedAt
  exportedAt: string
  opponents: Opponent[]
  batters: Batter[]
  pitchers: Pitcher[]
  pitchTypes: PitchType[]
  games: Game[]
  atBats: AtBat[]
  pitches: Pitch[]
  settings?: AppSettings[] // optional: older backups predate app settings
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
  }
}

export async function importAll(data: BackupFile): Promise<void> {
  if (data.app !== 'pitch-tracker' || !Array.isArray(data.pitches)) {
    throw new Error('This file does not look like a VeloSync backup.')
  }
  await db.transaction('rw', [db.opponents, db.batters, db.pitchers, db.pitchTypes, db.games, db.atBats, db.pitches, db.settings], async () => {
    await Promise.all([
      db.opponents.clear(), db.batters.clear(), db.pitchers.clear(),
      db.pitchTypes.clear(), db.games.clear(), db.atBats.clear(), db.pitches.clear(),
      db.settings.clear(),
    ])
    await db.opponents.bulkAdd(data.opponents.map(hydrateSync))
    await db.batters.bulkAdd(data.batters.map(hydrateSync))
    await db.pitchers.bulkAdd(data.pitchers.map(hydrateSync))
    await db.pitchTypes.bulkAdd(data.pitchTypes.map(hydrateSync))
    await db.games.bulkAdd(data.games.map(hydrateSync))
    await db.atBats.bulkAdd(data.atBats.map(hydrateSync))
    await db.pitches.bulkAdd(data.pitches.map(hydrateSync))
    // Older backups predate settings — restore the row if present, else leave
    // the store empty so getSettings() falls back to the default.
    if (data.settings?.length) await db.settings.bulkAdd(data.settings)
  })
}

// ---------- Lineup ----------

// A game's default batting order: start from the most recent finished game's
// lineup for this opponent, drop batters no longer on the roster, then append
// any roster batters not already in it. Falls back to plain roster order.
export async function defaultLineup(opponentId: string): Promise<string[]> {
  const roster = await db.batters.where('opponentId').equals(opponentId).toArray()
  const rosterIds = roster.map((b) => b.id)
  const rosterSet = new Set(rosterIds)

  const games = await db.games.where('opponentId').equals(opponentId).toArray()
  const prev = games
    .filter((g) => g.status === 'finished' && g.lineup && g.lineup.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]

  if (!prev?.lineup) return rosterIds
  const kept = prev.lineup.filter((id) => rosterSet.has(id))
  const appended = rosterIds.filter((id) => !kept.includes(id))
  return [...kept, ...appended]
}
