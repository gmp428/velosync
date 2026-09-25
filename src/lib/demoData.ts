import {
  db, pendingSync, saveSettings,
  type AtBat, type AtBatOutcome, type Batter, type EarnedRun, type Game, type InPlayOutcome,
  type Opponent, type Pitch, type Pitcher, type PitchResult, type PitchType, type Season, type Zone,
} from '../db'

/**
 * Fixed sample for trying seasons, import, and ERA.
 * Names and ids never change. A seeded picker only chooses scripts, pitch
 * types, and locations, so two loads are the same dataset.
 *
 * Out plan is intentional: fall totals are 41 / 44 / 41 outs (13.2, 14.2,
 * 13.2 IP) and the spring game is 8 / 5 / 8, so combined last-2 IP is 16.1
 * for each pitcher. Do not “even out” the staff to 42 outs — that hides thirds.
 */
const SEED = 20250925

export const DEMO_ACTIVE_SEASON_NAME = '2026 Spring'

export const DEMO_LOAD_CONFIRM = [
  'Replace everything on this device with the demo seasons?',
  '',
  'This wipes seasons, teams, pitchers, games, pitches, and pitch types. It does not merge with what you already have. Loading the demo again resets to the same names, numbers, and games.',
  '',
  'Logging switches to Custom, with intended location and granular zones on, so the sample reports can show command and location.',
  '',
  `${DEMO_ACTIVE_SEASON_NAME} will be the active season.`,
].join('\n')

const FALL_ID = 'demo-season-2025-fall'
const SPRING_ID = 'demo-season-2026-spring'
const FALL_AT = Date.parse('2025-08-20T15:00:00Z')
const SPRING_AT = Date.parse('2026-02-10T15:00:00Z')

const PT = {
  fb: 'demo-pt-fb',
  ch: 'demo-pt-ch',
  dr: 'demo-pt-dr',
  ri: 'demo-pt-ri',
  cv: 'demo-pt-cv',
  sc: 'demo-pt-sc',
} as const

type PitchKey = keyof typeof PT
type PitcherKey = 'maya' | 'riley' | 'jordan'
type Style = 'strike' | 'nibble' | 'offspeed'
type BatterTag = 'normal' | 'fb-crusher' | 'ch-weak'
type ScriptName =
  | 'kLooking' | 'kChase' | 'kFoul' | 'walk' | 'hbp' | 'weakOut'
  | 'single' | 'double' | 'hr' | 'error' | 'damage31' | 'damage20'
type Loc = 'strike' | 'ball' | 'chase' | 'middle' | 'hbp'
type TypeHint = 'mix' | 'offspeed' | 'fastball'

const SCRIPT_ORDER: ScriptName[] = [
  'kLooking', 'kChase', 'kFoul', 'walk', 'hbp', 'weakOut',
  'single', 'double', 'hr', 'error', 'damage31', 'damage20',
]

interface PitchSpec {
  result: PitchResult
  inPlay?: InPlayOutcome
  loc: Loc
  type: TypeHint
}

const SCRIPTS: Record<ScriptName, PitchSpec[]> = {
  // 0-0, 0-1, 0-2 looking.
  kLooking: [
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'called_strike', loc: 'strike', type: 'mix' },
  ],
  // The swing at 0-2 is a chase whiff. The foul happened one pitch earlier.
  kChase: [
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'foul', loc: 'strike', type: 'mix' },
    { result: 'swinging_strike', loc: 'chase', type: 'offspeed' },
  ],
  // One spoil at 0-2, then the same chase. Keeps 0-2 from being a pure whiff.
  kFoul: [
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'foul', loc: 'strike', type: 'mix' },
    { result: 'foul', loc: 'strike', type: 'mix' },
    { result: 'swinging_strike', loc: 'chase', type: 'offspeed' },
  ],
  // 2-0 is a foul (not damage). 3-1 is taken away for ball four.
  walk: [
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'foul', loc: 'strike', type: 'mix' },
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'ball', loc: 'ball', type: 'mix' },
  ],
  hbp: [
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'hbp', loc: 'hbp', type: 'mix' },
  ],
  weakOut: [
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'in_play', inPlay: 'out', loc: 'strike', type: 'mix' },
  ],
  single: [
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'in_play', inPlay: 'single', loc: 'strike', type: 'mix' },
  ],
  double: [
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'in_play', inPlay: 'double', loc: 'middle', type: 'fastball' },
  ],
  hr: [
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'foul', loc: 'strike', type: 'mix' },
    { result: 'in_play', inPlay: 'home_run', loc: 'middle', type: 'fastball' },
  ],
  error: [
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'in_play', inPlay: 'error', loc: 'strike', type: 'mix' },
  ],
  // Count before the hit is 3-1, and the pitch misses back over the middle.
  damage31: [
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'called_strike', loc: 'strike', type: 'mix' },
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'in_play', inPlay: 'double', loc: 'middle', type: 'fastball' },
  ],
  // Count before the hit is 2-0.
  damage20: [
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'ball', loc: 'ball', type: 'mix' },
    { result: 'in_play', inPlay: 'single', loc: 'middle', type: 'fastball' },
  ],
}

interface StaffDef {
  key: PitcherKey
  personId: string
  firstName: string
  lastName: string
  throws: 'L' | 'R'
  numberFall: string
  numberSpring: string
  style: Style
  mix: Record<PitchKey, number>
  offspeed: PitchKey[]
  notes: string
}

const STAFF: StaffDef[] = [
  {
    key: 'maya',
    personId: 'demo-person-maya',
    firstName: 'Maya',
    lastName: 'Chen',
    throws: 'R',
    numberFall: '7',
    numberSpring: '7',
    style: 'strike',
    mix: { fb: 58, ri: 24, ch: 18, dr: 0, cv: 0, sc: 0 },
    offspeed: ['ch', 'ri'],
    notes: 'Strike-thrower. Fills the zone with the fastball.',
  },
  {
    key: 'riley',
    personId: 'demo-person-riley',
    firstName: 'Riley',
    lastName: 'Brooks',
    throws: 'L',
    numberFall: '14',
    numberSpring: '14',
    style: 'nibble',
    mix: { fb: 28, cv: 26, sc: 26, ch: 20, dr: 0, ri: 0 },
    offspeed: ['cv', 'sc', 'ch'],
    notes: 'Nibbler. Lives on the edges and walks more than the others.',
  },
  {
    key: 'jordan',
    personId: 'demo-person-jordan',
    firstName: 'Jordan',
    lastName: 'Hale',
    throws: 'R',
    numberFall: '22',
    numberSpring: '3',
    style: 'offspeed',
    mix: { ch: 42, dr: 24, cv: 20, fb: 14, ri: 0, sc: 0 },
    offspeed: ['ch', 'dr', 'cv'],
    notes: 'Offspeed-heavy. Gets chases with the changeup.',
  },
]

interface BatterDef {
  slug: string
  firstName: string
  lastName: string
  number: string
  bats: 'L' | 'R'
  tag: BatterTag
  /** Present only for Harbor Makos kids who come back in the spring. */
  springNumber?: string
  bringToSpring?: boolean
  notes?: string
}

const MAKOS: BatterDef[] = [
  { slug: 'sophie', firstName: 'Sophie', lastName: 'Reyes', number: '8', bats: 'R', tag: 'fb-crusher', bringToSpring: true, springNumber: '18', notes: 'Crushes fastballs, especially middle-in.' },
  { slug: 'lena', firstName: 'Lena', lastName: 'Ortiz', number: '3', bats: 'L', tag: 'normal', bringToSpring: true },
  { slug: 'priya', firstName: 'Priya', lastName: 'Shah', number: '21', bats: 'R', tag: 'normal', bringToSpring: true, springNumber: '11' },
  { slug: 'camila', firstName: 'Camila', lastName: 'Brooks', number: '15', bats: 'L', tag: 'normal', bringToSpring: true },
  { slug: 'nora', firstName: 'Nora', lastName: 'Kim', number: '2', bats: 'R', tag: 'normal', bringToSpring: true },
  { slug: 'elise', firstName: 'Elise', lastName: 'Grant', number: '27', bats: 'L', tag: 'normal', bringToSpring: true },
  { slug: 'hannah', firstName: 'Hannah', lastName: 'Cole', number: '10', bats: 'R', tag: 'normal', bringToSpring: true },
  { slug: 'quinn', firstName: 'Quinn', lastName: 'Adler', number: '5', bats: 'L', tag: 'normal' },
  { slug: 'tess', firstName: 'Tess', lastName: 'Nguyen', number: '19', bats: 'R', tag: 'normal' },
]

const STORM: BatterDef[] = [
  { slug: 'jade', firstName: 'Jade', lastName: 'Walker', number: '4', bats: 'R', tag: 'ch-weak', notes: 'Chases changeups and other offspeed.' },
  { slug: 'brooke', firstName: 'Brooke', lastName: 'Ellis', number: '11', bats: 'L', tag: 'normal' },
  { slug: 'sloane', firstName: 'Sloane', lastName: 'Park', number: '6', bats: 'R', tag: 'normal' },
  { slug: 'mia', firstName: 'Mia', lastName: 'Delgado', number: '18', bats: 'L', tag: 'normal' },
  { slug: 'harper', firstName: 'Harper', lastName: 'Quinn', number: '9', bats: 'R', tag: 'normal' },
  { slug: 'lucy', firstName: 'Lucy', lastName: 'Bennett', number: '22', bats: 'L', tag: 'normal' },
  { slug: 'grace', firstName: 'Grace', lastName: 'Patel', number: '1', bats: 'R', tag: 'normal' },
  { slug: 'autumn', firstName: 'Autumn', lastName: 'Reed', number: '16', bats: 'L', tag: 'normal' },
  { slug: 'willa', firstName: 'Willa', lastName: 'Santos', number: '7', bats: 'R', tag: 'normal' },
]

const HAWKS: BatterDef[] = [
  { slug: 'nina', firstName: 'Nina', lastName: 'Alvarez', number: '3', bats: 'L', tag: 'normal' },
  { slug: 'chloe', firstName: 'Chloe', lastName: 'Barrett', number: '8', bats: 'R', tag: 'normal' },
  { slug: 'ivy', firstName: 'Ivy', lastName: 'Nakamura', number: '12', bats: 'L', tag: 'normal' },
  { slug: 'ruby', firstName: 'Ruby', lastName: 'Sanders', number: '5', bats: 'R', tag: 'normal' },
  { slug: 'paige', firstName: 'Paige', lastName: 'Okonkwo', number: '20', bats: 'L', tag: 'normal' },
  { slug: 'eden', firstName: 'Eden', lastName: 'Walsh', number: '14', bats: 'R', tag: 'normal' },
  { slug: 'freya', firstName: 'Freya', lastName: 'Lind', number: '9', bats: 'L', tag: 'normal' },
  { slug: 'maren', firstName: 'Maren', lastName: 'Doyle', number: '17', bats: 'R', tag: 'normal' },
  { slug: 'tessa', firstName: 'Tessa', lastName: 'Ibarra', number: '23', bats: 'L', tag: 'normal' },
]

const BASE_WEIGHTS: Record<Style, Record<ScriptName, number>> = {
  // Out-heavy on purpose. A low out-rate makes a pitcher face a huge lineup
  // before recording their outs, and ERA explodes. The style shows up in
  // the mix of the plate appearances that are not outs.
  strike: {
    kLooking: 28, kChase: 14, kFoul: 4, walk: 5, hbp: 2, weakOut: 24,
    single: 12, double: 3, hr: 1, error: 2, damage31: 3, damage20: 2,
  },
  nibble: {
    kLooking: 18, kChase: 10, kFoul: 4, walk: 14, hbp: 2, weakOut: 26,
    single: 14, double: 2, hr: 1, error: 2, damage31: 2, damage20: 3,
  },
  offspeed: {
    kLooking: 12, kChase: 20, kFoul: 6, walk: 8, hbp: 2, weakOut: 22,
    single: 12, double: 3, hr: 1, error: 2, damage31: 4, damage20: 4,
  },
}

type Rng = () => number

function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickScript(rng: Rng, weights: Record<ScriptName, number>): ScriptName {
  let total = 0
  for (const name of SCRIPT_ORDER) total += weights[name]
  let r = rng() * total
  for (const name of SCRIPT_ORDER) {
    r -= weights[name]
    if (r < 0) return name
  }
  return SCRIPT_ORDER[SCRIPT_ORDER.length - 1]
}

function weightsFor(style: Style, tag: BatterTag): Record<ScriptName, number> {
  const w = { ...BASE_WEIGHTS[style] }
  if (tag === 'fb-crusher') {
    w.hr += 16
    w.double += 8
    w.damage31 += 14
    w.damage20 += 8
    w.kLooking = Math.max(4, w.kLooking - 8)
    w.kChase = Math.max(2, w.kChase - 4)
    w.kFoul = Math.max(0, w.kFoul - 2)
    w.weakOut = Math.max(4, w.weakOut - 6)
  } else if (tag === 'ch-weak') {
    w.kChase += 22
    w.kFoul += 6
    w.hr = Math.max(0, w.hr - 1)
    w.double = Math.max(0, w.double - 3)
    w.damage31 = Math.max(0, w.damage31 - 4)
    w.damage20 = Math.max(0, w.damage20 - 3)
    w.single = Math.max(2, w.single - 4)
  }
  return w
}

function pickWeighted(rng: Rng, weights: Record<string, number>): string {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0).sort()
  let total = 0
  for (const k of keys) total += weights[k]
  let r = rng() * total
  for (const k of keys) {
    r -= weights[k]
    if (r < 0) return k
  }
  return keys[keys.length - 1]
}

function awayTarget(rng: Rng, style: Style): Zone {
  const edge = (): Zone => (rng() < 0.5 ? 3 : 9)
  if (style === 'nibble') return rng() < 0.8 ? edge() : 6
  if (style === 'strike') return rng() < 0.7 ? 6 : edge()
  return rng() < 0.55 ? 6 : edge()
}

function awayMiss(rng: Rng): Zone {
  const opts: Zone[] = ['og-right-up-third', 'og-right-middle-third', 'og-right-down-third']
  return opts[Math.floor(rng() * opts.length)]
}

function locate(rng: Rng, style: Style, loc: Loc): { intended: Zone; actual: Zone } {
  if (loc === 'hbp') return { intended: 6, actual: 'og-left-middle-third' }
  if (loc === 'middle') {
    const roll = rng()
    const actual: Zone = roll < 0.6 ? 5 : roll < 0.8 ? 2 : 8
    return { intended: 6, actual }
  }
  if (loc === 'chase') return { intended: rng() < 0.5 ? 3 : 9, actual: awayMiss(rng) }
  if (loc === 'ball') return { intended: awayTarget(rng, style), actual: awayMiss(rng) }
  const intended = awayTarget(rng, style)
  return { intended, actual: intended }
}

function stepCount(
  balls: number,
  strikes: number,
  result: PitchResult,
  inPlay?: InPlayOutcome,
): { balls: number; strikes: number; done: boolean; outcome?: AtBatOutcome } {
  if (result === 'ball') {
    const next = balls + 1
    return next >= 4
      ? { balls: next, strikes, done: true, outcome: 'walk' }
      : { balls: next, strikes, done: false }
  }
  if (result === 'called_strike' || result === 'swinging_strike') {
    const next = strikes + 1
    return next >= 3
      ? { balls, strikes: next, done: true, outcome: 'strikeout' }
      : { balls, strikes: next, done: false }
  }
  if (result === 'foul') {
    return strikes < 2
      ? { balls, strikes: strikes + 1, done: false }
      : { balls, strikes, done: false }
  }
  if (result === 'hbp') return { balls, strikes, done: true, outcome: 'hbp' }
  if (result === 'in_play') {
    if (!inPlay) throw new Error('in-play pitch is missing an outcome')
    return { balls, strikes, done: true, outcome: inPlay }
  }
  throw new Error(`unknown pitch result ${result}`)
}

type Bases = [boolean, boolean, boolean]

function advance(bases: Bases, outcome: AtBatOutcome): { bases: Bases; runs: number } {
  if (outcome === 'out' || outcome === 'strikeout' || outcome === 'ghost_out') {
    return { bases, runs: 0 }
  }
  // Walks, HBP, singles, and errors only force a run home when the bases
  // are already full. Extra-base hits send the runners.
  if (outcome === 'walk' || outcome === 'hbp' || outcome === 'single' || outcome === 'error') {
    if (bases[0] && bases[1] && bases[2]) return { bases: [true, true, true], runs: 1 }
    const next: Bases = [bases[0], bases[1], bases[2]]
    if (!next[0]) next[0] = true
    else if (!next[1]) next[1] = true
    else next[2] = true
    return { bases: next, runs: 0 }
  }
  const aboard = Number(bases[0]) + Number(bases[1]) + Number(bases[2])
  if (outcome === 'double') return { bases: [false, true, false], runs: aboard }
  if (outcome === 'triple') return { bases: [false, false, true], runs: aboard }
  if (outcome === 'home_run') return { bases: [false, false, false], runs: aboard + 1 }
  return { bases, runs: 0 }
}

interface SimBatter {
  id: string
  tag: BatterTag
}

interface SimPitcher {
  key: PitcherKey
  id: string
  style: Style
  mix: Record<string, number>
  offspeed: PitchKey[]
}

export interface DemoDataset {
  seasons: Season[]
  opponents: Opponent[]
  batters: Batter[]
  pitchers: Pitcher[]
  pitchTypes: PitchType[]
  games: Game[]
  atBats: AtBat[]
  pitches: Pitch[]
  earnedRuns: EarnedRun[]
}

function stamp(updatedAt: number) {
  return { updatedAt, ...pendingSync() }
}

function pitcherId(key: PitcherKey, season: 'fall' | 'spring'): string {
  return `demo-pitcher-${key}-${season}`
}

function arsenalIds(p: StaffDef): string[] {
  const keys = new Set<PitchKey>(p.offspeed)
  for (const key of Object.keys(PT) as PitchKey[]) {
    if (p.mix[key] > 0) keys.add(key)
  }
  return [...keys].map((k) => PT[k])
}

function fallOuts(starter: PitcherKey, middle: PitcherKey, late: PitcherKey, shortenStarter: boolean): PitcherKey[][] {
  return [
    [starter, starter, starter],
    [starter, starter, starter],
    [starter, starter, starter],
    shortenStarter ? [starter, middle, middle] : [starter, starter, middle],
    [middle, middle, middle],
    [middle, middle, late],
    [late, late, late],
  ]
}

interface GamePlan {
  id: string
  date: string
  homeAway: 'home' | 'away'
  season: 'fall' | 'spring'
  opponentId: string
  seasonId: string
  lineup: SimBatter[]
  outs: PitcherKey[][]
}

function resolveInPlay(script: ScriptName, spec: PitchSpec, tag: BatterTag): InPlayOutcome | undefined {
  if (spec.result !== 'in_play') return undefined
  if (script === 'damage31') return tag === 'fb-crusher' ? 'home_run' : 'double'
  if (script === 'damage20') return tag === 'fb-crusher' ? 'double' : 'single'
  return spec.inPlay
}

function chooseType(rng: Rng, pitcher: SimPitcher, hint: TypeHint, tag: BatterTag): PitchKey {
  if (hint === 'fastball') return 'fb'
  if (hint === 'offspeed') {
    if (tag === 'ch-weak' && (pitcher.mix.ch ?? 0) > 0) return 'ch'
    const weights: Record<string, number> = {}
    for (const key of pitcher.offspeed) weights[key] = pitcher.mix[key] ?? 0
    return pickWeighted(rng, weights) as PitchKey
  }
  return pickWeighted(rng, pitcher.mix) as PitchKey
}

function simulate(plan: GamePlan, pitchers: Map<PitcherKey, SimPitcher>, rng: Rng): {
  game: Game
  atBats: AtBat[]
  pitches: Pitch[]
  earnedRuns: EarnedRun[]
} {
  const atBats: AtBat[] = []
  const pitches: Pitch[] = []
  const runs = new Map<string, number>()
  const half: 'top' | 'bottom' = plan.homeAway === 'home' ? 'top' : 'bottom'
  let batterIdx = 0
  let pa = 0
  let clock = 0
  const tick = () => Date.parse(`${plan.date}T18:00:00Z`) + clock++ * 20_000
  let lastPitcherId = pitchers.get(plan.outs[0][0])!.id

  for (let inning = 1; inning <= 7; inning++) {
    let bases: Bases = [false, false, false]
    let outs = 0
    let guard = 0
    while (outs < 3) {
      if (++guard > 80) throw new Error(`inning ${inning} of ${plan.id} did not record 3 outs`)
      const key = plan.outs[inning - 1][outs]
      const pitcher = pitchers.get(key)
      if (!pitcher) throw new Error(`missing pitcher ${key}`)
      lastPitcherId = pitcher.id
      const batter = plan.lineup[batterIdx % plan.lineup.length]
      batterIdx++
      pa++
      const runKey = `${inning}|${pitcher.id}`
      if (!runs.has(runKey)) runs.set(runKey, 0)

      const script = pickScript(rng, weightsFor(pitcher.style, batter.tag))
      const specs = SCRIPTS[script]
      const abId = `demo-ab-${plan.id}-${inning}-${pa}`
      let balls = 0
      let strikes = 0
      let outcome: AtBatOutcome | undefined
      let startedAt = 0

      specs.forEach((spec, index) => {
        const inPlay = resolveInPlay(script, spec, batter.tag)
        const typeKey = chooseType(rng, pitcher, spec.type, batter.tag)
        const spot = locate(rng, pitcher.style, spec.loc)
        const ts = tick()
        if (index === 0) startedAt = ts
        pitches.push({
          id: `demo-pitch-${plan.id}-${inning}-${pa}-${index + 1}`,
          gameId: plan.id,
          atBatId: abId,
          batterId: batter.id,
          pitcherId: pitcher.id,
          seq: index + 1,
          balls,
          strikes,
          pitchTypeId: PT[typeKey],
          zone: spot.actual,
          intendedZone: spot.intended,
          result: spec.result,
          ...(inPlay ? { inPlay } : {}),
          inning,
          ts,
          ...stamp(ts),
        })
        const stepped = stepCount(balls, strikes, spec.result, inPlay)
        if (stepped.done !== (index === specs.length - 1)) {
          throw new Error(`script ${script} ended at pitch ${index + 1} of ${specs.length}`)
        }
        balls = stepped.balls
        strikes = stepped.strikes
        if (stepped.done) outcome = stepped.outcome
      })

      if (!outcome) throw new Error(`script ${script} produced no outcome`)
      const endedAt = pitches[pitches.length - 1].ts
      atBats.push({
        id: abId,
        gameId: plan.id,
        batterId: batter.id,
        pitcherId: pitcher.id,
        outcome,
        inning,
        half,
        startedAt,
        ...stamp(endedAt),
      })
      const advanced = advance(bases, outcome)
      bases = advanced.bases
      runs.set(runKey, (runs.get(runKey) ?? 0) + advanced.runs)
      if (outcome === 'out' || outcome === 'strikeout') outs++
    }
  }

  const earnedRuns: EarnedRun[] = [...runs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, earned]) => {
      const [inning, earnedPitcherId] = key.split('|')
      const ts = Date.parse(`${plan.date}T23:00:00Z`) + Number(inning)
      return {
        id: `demo-er-${plan.id}-${inning}-${earnedPitcherId}`,
        gameId: plan.id,
        pitcherId: earnedPitcherId,
        inning: Number(inning),
        half,
        runs: earned,
        ...stamp(ts),
      }
    })

  const game: Game = {
    id: plan.id,
    opponentId: plan.opponentId,
    seasonId: plan.seasonId,
    date: plan.date,
    status: 'finished',
    currentPitcherId: lastPitcherId,
    lineup: plan.lineup.map((b) => b.id),
    currentInning: 7,
    half,
    homeAway: plan.homeAway,
    ...stamp(Date.parse(`${plan.date}T23:30:00Z`)),
  }

  return { game, atBats, pitches, earnedRuns }
}

function rosterRows(
  defs: BatterDef[],
  opponentKey: string,
  opponentId: string,
  when: number,
): { fall: Batter[]; spring: Batter[]; fallSim: SimBatter[] } {
  const fall: Batter[] = []
  const spring: Batter[] = []
  const fallSim: SimBatter[] = []
  defs.forEach((def, index) => {
    const personId = `demo-person-${opponentKey}-${def.slug}`
    const id = `demo-batter-${opponentKey}-${def.slug}`
    fall.push({
      id,
      opponentId,
      firstName: def.firstName,
      lastName: def.lastName,
      number: def.number,
      bats: def.bats,
      sortIndex: index,
      activeToday: true,
      linkGroupId: personId,
      ...(def.notes ? { notes: def.notes } : {}),
      ...stamp(when),
    })
    fallSim.push({ id, tag: def.tag })
    if (def.bringToSpring) {
      spring.push({
        id: `${id}-spring`,
        opponentId: 'demo-opp-makos-spring',
        firstName: def.firstName,
        lastName: def.lastName,
        number: def.springNumber ?? def.number,
        bats: def.bats,
        sortIndex: spring.length,
        activeToday: true,
        linkGroupId: personId,
        ...(def.notes ? { notes: def.notes } : {}),
        ...stamp(SPRING_AT),
      })
    }
  })
  return { fall, spring, fallSim }
}

function simPitchers(season: 'fall' | 'spring'): Map<PitcherKey, SimPitcher> {
  return new Map(STAFF.map((p) => [p.key, {
    key: p.key,
    id: pitcherId(p.key, season),
    style: p.style,
    mix: p.mix,
    offspeed: p.offspeed,
  }]))
}

export function buildDemo(): DemoDataset {
  const rng = mulberry32(SEED)
  const pitchTypes: PitchType[] = [
    { id: PT.fb, name: 'Fastball', abbr: 'FB', ...stamp(FALL_AT) },
    { id: PT.ch, name: 'Changeup', abbr: 'CH', ...stamp(FALL_AT) },
    { id: PT.dr, name: 'Drop ball', abbr: 'DR', ...stamp(FALL_AT) },
    { id: PT.ri, name: 'Rise ball', abbr: 'RI', ...stamp(FALL_AT) },
    { id: PT.cv, name: 'Curveball', abbr: 'CV', ...stamp(FALL_AT) },
    { id: PT.sc, name: 'Screwball', abbr: 'SC', ...stamp(FALL_AT) },
  ]

  const seasons: Season[] = [
    {
      id: FALL_ID,
      name: '2025 Fall',
      startDate: '2025-09-01',
      endDate: '2025-10-31',
      eraInnings: 7,
      active: false,
      createdAt: FALL_AT,
      ...stamp(FALL_AT),
    },
    {
      id: SPRING_ID,
      name: DEMO_ACTIVE_SEASON_NAME,
      startDate: '2026-03-01',
      endDate: '2026-05-31',
      eraInnings: 7,
      active: true,
      createdAt: SPRING_AT,
      ...stamp(SPRING_AT),
    },
  ]

  const pitchers: Pitcher[] = STAFF.flatMap((p) => ([
    {
      id: pitcherId(p.key, 'fall'),
      firstName: p.firstName,
      lastName: p.lastName,
      number: p.numberFall,
      throws: p.throws,
      notes: p.notes,
      pitchTypeIds: arsenalIds(p),
      seasonId: FALL_ID,
      linkGroupId: p.personId,
      ...stamp(FALL_AT),
    },
    {
      id: pitcherId(p.key, 'spring'),
      firstName: p.firstName,
      lastName: p.lastName,
      number: p.numberSpring,
      throws: p.throws,
      notes: p.notes,
      pitchTypeIds: arsenalIds(p),
      seasonId: SPRING_ID,
      linkGroupId: p.personId,
      ...stamp(SPRING_AT),
    },
  ]))

  const opponents: Opponent[] = [
    { id: 'demo-opp-makos', name: 'Harbor Makos', seasonId: FALL_ID, ...stamp(FALL_AT) },
    { id: 'demo-opp-storm', name: 'Westside Storm', seasonId: FALL_ID, ...stamp(FALL_AT) },
    { id: 'demo-opp-hawks', name: 'Northridge Hawks', seasonId: FALL_ID, ...stamp(FALL_AT) },
    { id: 'demo-opp-makos-spring', name: 'Harbor Makos', seasonId: SPRING_ID, ...stamp(SPRING_AT) },
  ]

  const makos = rosterRows(MAKOS, 'makos', 'demo-opp-makos', FALL_AT)
  const storm = rosterRows(STORM, 'storm', 'demo-opp-storm', FALL_AT)
  const hawks = rosterRows(HAWKS, 'hawks', 'demo-opp-hawks', FALL_AT)
  const batters = [...makos.fall, ...storm.fall, ...hawks.fall, ...makos.spring]
  const springLineup: SimBatter[] = makos.spring.map((b) => ({
    id: b.id,
    tag: MAKOS.find((d) => `demo-batter-makos-${d.slug}-spring` === b.id)?.tag ?? 'normal',
  }))

  const fallPitchers = simPitchers('fall')
  const springPitchers = simPitchers('spring')
  const lineups: Record<string, SimBatter[]> = {
    'demo-opp-makos': makos.fallSim,
    'demo-opp-storm': storm.fallSim,
    'demo-opp-hawks': hawks.fallSim,
  }

  const plans: GamePlan[] = [
    {
      id: 'demo-game-makos-1', date: '2025-09-06', homeAway: 'home', season: 'fall',
      opponentId: 'demo-opp-makos', seasonId: FALL_ID, lineup: lineups['demo-opp-makos'],
      outs: fallOuts('maya', 'riley', 'jordan', true),
    },
    {
      id: 'demo-game-storm-1', date: '2025-09-13', homeAway: 'away', season: 'fall',
      opponentId: 'demo-opp-storm', seasonId: FALL_ID, lineup: lineups['demo-opp-storm'],
      outs: fallOuts('riley', 'jordan', 'maya', false),
    },
    {
      id: 'demo-game-makos-2', date: '2025-09-20', homeAway: 'away', season: 'fall',
      opponentId: 'demo-opp-makos', seasonId: FALL_ID, lineup: lineups['demo-opp-makos'],
      outs: fallOuts('maya', 'jordan', 'riley', false),
    },
    {
      id: 'demo-game-hawks-1', date: '2025-09-27', homeAway: 'home', season: 'fall',
      opponentId: 'demo-opp-hawks', seasonId: FALL_ID, lineup: lineups['demo-opp-hawks'],
      outs: fallOuts('jordan', 'riley', 'maya', true),
    },
    {
      id: 'demo-game-storm-2', date: '2025-10-04', homeAway: 'home', season: 'fall',
      opponentId: 'demo-opp-storm', seasonId: FALL_ID, lineup: lineups['demo-opp-storm'],
      outs: fallOuts('riley', 'maya', 'jordan', false),
    },
    {
      id: 'demo-game-hawks-2', date: '2025-10-11', homeAway: 'away', season: 'fall',
      opponentId: 'demo-opp-hawks', seasonId: FALL_ID, lineup: lineups['demo-opp-hawks'],
      outs: fallOuts('jordan', 'maya', 'riley', false),
    },
    {
      id: 'demo-game-makos-spring', date: '2026-03-14', homeAway: 'home', season: 'spring',
      opponentId: 'demo-opp-makos-spring', seasonId: SPRING_ID, lineup: springLineup,
      outs: [
        ['maya', 'maya', 'maya'],
        ['maya', 'maya', 'riley'],
        ['riley', 'riley', 'jordan'],
        ['jordan', 'jordan', 'jordan'],
        ['jordan', 'jordan', 'maya'],
        ['maya', 'maya', 'riley'],
        ['jordan', 'jordan', 'riley'],
      ],
    },
  ]

  const games: Game[] = []
  const atBats: AtBat[] = []
  const pitches: Pitch[] = []
  const earnedRuns: EarnedRun[] = []
  for (const plan of plans) {
    const played = simulate(plan, plan.season === 'fall' ? fallPitchers : springPitchers, rng)
    games.push(played.game)
    atBats.push(...played.atBats)
    pitches.push(...played.pitches)
    earnedRuns.push(...played.earnedRuns)
  }

  return { seasons, opponents, batters, pitchers, pitchTypes, games, atBats, pitches, earnedRuns }
}

/** Wipe local baseball data and write the fixed demo. Does not merge. */
export async function loadDemoData(): Promise<void> {
  const data = buildDemo()
  await db.transaction(
    'rw',
    [db.seasons, db.opponents, db.batters, db.pitchers, db.pitchTypes, db.games, db.atBats, db.pitches, db.substitutions, db.earnedRuns],
    async () => {
      await db.seasons.clear()
      await db.opponents.clear()
      await db.batters.clear()
      await db.pitchers.clear()
      await db.pitchTypes.clear()
      await db.games.clear()
      await db.atBats.clear()
      await db.pitches.clear()
      await db.substitutions.clear()
      await db.earnedRuns.clear()
      await db.pitchTypes.bulkAdd(data.pitchTypes)
      await db.seasons.bulkAdd(data.seasons)
      await db.opponents.bulkAdd(data.opponents)
      await db.batters.bulkAdd(data.batters)
      await db.pitchers.bulkAdd(data.pitchers)
      await db.games.bulkAdd(data.games)
      await db.atBats.bulkAdd(data.atBats)
      await db.pitches.bulkAdd(data.pitches)
      await db.earnedRuns.bulkAdd(data.earnedRuns)
    },
  )
  await saveSettings({
    preset: 'custom',
    capture: {
      strikeType: true,
      inPlayDetail: true,
      granularZones: true,
      intendedLocation: true,
      fieldPosition: false,
      battedBallType: false,
    },
  })
}
