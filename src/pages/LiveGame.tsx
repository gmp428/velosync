import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CAPTURE_PRESETS, db, displayName, getSettings, newId, now, pendingSync, persistLineupToRoster, pitcherArsenal, resultLabel, zoneLabel,
  type AtBatOutcome, type Batter, type InPlayOutcome, type Pitch, type PitchResult, type Zone,
} from '../db'
import ZoneGrid from '../components/ZoneGrid'
import SuggestionPanel from '../components/SuggestionPanel'
import LineupEditor from '../components/LineupEditor'
import { battleAgg, battleRate, byZoneBattle, outcomeBreakdown, pct } from '../lib/stats'

// The next batter in the order after `currentId`, cycling back to the top.
// Falls back to the leadoff hitter if the current batter isn't in the order.
function nextInLineup(lineup: string[] | undefined, currentId: string): string | undefined {
  if (!lineup || lineup.length === 0) return undefined
  const idx = lineup.indexOf(currentId)
  if (idx === -1) return lineup[0]
  return lineup[(idx + 1) % lineup.length]
}

export default function LiveGame() {
  const { id } = useParams()
  const gameId = id!
  const navigate = useNavigate()

  const game = useLiveQuery(() => db.games.get(gameId), [gameId])
  const opponent = useLiveQuery(
    () => (game ? db.opponents.get(game.opponentId) : undefined),
    [game?.opponentId],
  )
  const roster = useLiveQuery(
    () => (game ? db.batters.where('opponentId').equals(game.opponentId).toArray() : Promise.resolve([] as Batter[])),
    [game?.opponentId],
  )
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const openAtBat = useLiveQuery(
    () => db.atBats.where('gameId').equals(gameId).filter((ab) => ab.outcome === undefined).first(),
    [gameId],
  )
  const abPitches = useLiveQuery(
    () => (openAtBat ? db.pitches.where('atBatId').equals(openAtBat.id).sortBy('seq') : Promise.resolve([] as Pitch[])),
    [openAtBat?.id],
  )
  const gamePitchCount = useLiveQuery(() => db.pitches.where('gameId').equals(gameId).count(), [gameId])
  const atBatCount = useLiveQuery(() => db.atBats.where('gameId').equals(gameId).count(), [gameId])
  // All history on the current batter, live-updating as pitches are logged
  const batterHistory = useLiveQuery(
    () => (openAtBat ? db.pitches.where('batterId').equals(openAtBat.batterId).toArray() : Promise.resolve([] as Pitch[])),
    [openAtBat?.batterId],
  )

  const [selType, setSelType] = useState<string | null>(null)
  const [selZone, setSelZone] = useState<Zone | null>(null)
  const [showInPlay, setShowInPlay] = useState(false)
  // Which history pool the in-game stats draw from
  const [scope, setScope] = useState<'all' | 'pitcher'>('all')
  // Showing the "wrong batter — switch to…" picker
  const [changingBatter, setChangingBatter] = useState(false)
  // Showing the substitute-player picker (real roster change, tracked in history).
  // null = closed; otherwise the batterId currently selected to be replaced
  // (starts as the current batter when opened from the at-bat card).
  const [substitutingFor, setSubstitutingFor] = useState<string | null>(null)
  const [showSubstitutePanel, setShowSubstitutePanel] = useState(false)
  // Showing the drag-to-reorder lineup panel
  const [showLineup, setShowLineup] = useState(false)
  const bootingRef = useRef(false)

  // If a pitcher change removes the selected pitch type from the arsenal, clear it
  useEffect(() => {
    setSelType(null)
  }, [game?.currentPitcherId])

  // Fresh batter: reset the stat scope and close the switch-batter picker
  useEffect(() => {
    setScope('all')
    setChangingBatter(false)
  }, [openAtBat?.batterId])

  // Auto-start the leadoff hitter when an active game has no at-bats yet.
  useEffect(() => {
    if (!game || game.status !== 'active') return
    if (atBatCount !== 0) return // undefined = loading; >0 = already underway
    const lu = game.lineup && game.lineup.length ? game.lineup : (roster ?? []).map((b) => b.id)
    if (lu.length === 0 || bootingRef.current) return
    bootingRef.current = true
    db.atBats
      .add({ id: newId(), gameId, batterId: lu[0], pitcherId: game.currentPitcherId!, inning: game.currentInning ?? 1, startedAt: Date.now(), updatedAt: now(), ...pendingSync() })
      .finally(() => { bootingRef.current = false })
  }, [game?.status, atBatCount, game?.lineup, game?.currentPitcherId, gameId, roster])

  if (!game || !opponent || !roster || !pitchers || !pitchTypes) return null

  const batter = openAtBat ? roster.find((b) => b.id === openAtBat.batterId) : undefined
  const currentPitcher = pitchers.find((p) => p.id === game.currentPitcherId)
  const arsenal = pitcherArsenal(currentPitcher, pitchTypes)
  const cap = settings?.capture ?? CAPTURE_PRESETS.standard
  const curInning = game.currentInning ?? 1
  const half = game.half ?? 'top'
  const halfLabel = half === 'top' ? 'Top' : 'Bot'

  // The batting order to drive auto-advance / the lineup panel. Always falls
  // back to roster order so a game with no saved lineup still works.
  const rosterIds = roster.map((b) => b.id)
  const order = game.lineup && game.lineup.length > 0 ? game.lineup : rosterIds

  // Replay the at-bat to get the current count (foul with 2 strikes doesn't add a strike)
  let balls = 0
  let strikes = 0
  for (const p of abPitches ?? []) {
    if (p.result === 'ball') balls++
    else if (p.result === 'foul') { if (strikes < 2) strikes++ }
    else if (p.result === 'called_strike' || p.result === 'swinging_strike') strikes++
  }

  // Reassign the current at-bat (and any pitches already logged in it) to a
  // different batter — for when the wrong batter was picked. Corrects the
  // batting order too (the chosen batter moves into the current slot), always
  // persisting a clean, duplicate-free order so the fix is remembered and
  // auto-advance keeps working.
  const switchBatter = async (newBatterId: string) => {
    if (!openAtBat || newBatterId === openAtBat.batterId) {
      setChangingBatter(false)
      return
    }
    const without = order.filter((idv) => idv !== newBatterId)
    const at = without.indexOf(openAtBat.batterId)
    const newLineup = at === -1
      ? [newBatterId, ...without]
      : [...without.slice(0, at), newBatterId, ...without.slice(at)]
    await db.transaction('rw', db.atBats, db.pitches, db.games, async () => {
      await db.atBats.update(openAtBat.id, { batterId: newBatterId, updatedAt: now(), ...pendingSync() })
      await db.pitches.where('atBatId').equals(openAtBat.id).modify({ batterId: newBatterId, updatedAt: now(), ...pendingSync() })
      await db.games.update(gameId, { lineup: newLineup, updatedAt: now(), ...pendingSync() })
    })
    setChangingBatter(false)
  }

  // Substitute a bench (or brand-new) player in for `outgoingId` going
  // forward in the batting order. This is a real roster change (tracked in
  // Substitution history for scouting/stats), unlike "wrong batter?" above —
  // it does NOT touch any already-completed at-bats/pitches for outgoingId,
  // it only swaps that slot in the order for turns still to come. If the
  // player currently at bat is the one being replaced, their in-progress
  // at-bat (including any pitches already logged) is reassigned to the
  // incoming batter, same as the wrong-batter fix does.
  const substitutePlayer = async (outgoingId: string, incomingId: string) => {
    if (outgoingId === incomingId) {
      setSubstitutingFor(null)
      setShowSubstitutePanel(false)
      return
    }
    const without = order.filter((idv) => idv !== incomingId)
    const at = without.indexOf(outgoingId)
    const newLineup = at === -1
      ? [...without, incomingId]
      : [...without.slice(0, at), incomingId, ...without.slice(at + 1)]
    await db.transaction('rw', db.atBats, db.pitches, db.games, db.substitutions, async () => {
      // If the outgoing player is at bat right now, hand off the in-progress
      // at-bat (and any pitches already logged in it) to the incoming player.
      if (openAtBat && openAtBat.batterId === outgoingId) {
        await db.atBats.update(openAtBat.id, { batterId: incomingId, updatedAt: now(), ...pendingSync() })
        await db.pitches.where('atBatId').equals(openAtBat.id).modify({ batterId: incomingId, updatedAt: now(), ...pendingSync() })
      }
      await db.games.update(gameId, { lineup: newLineup, updatedAt: now(), ...pendingSync() })
      await db.substitutions.add({
        id: newId(),
        gameId,
        inning: curInning,
        battedOutId: outgoingId,
        battedInId: incomingId,
        timestamp: Date.now(),
        updatedAt: now(),
        ...pendingSync(),
      })
    })
    setSubstitutingFor(null)
    setShowSubstitutePanel(false)
  }

  const startAtBat = async (batterId: string) => {
    await db.atBats.add({
      id: newId(),
      gameId,
      batterId,
      pitcherId: game.currentPitcherId!,
      inning: game.currentInning ?? 1,
      startedAt: Date.now(),
      updatedAt: now(),
      ...pendingSync(),
    })
    setSelType(null)
    setSelZone(null)
    setShowInPlay(false)
  }

  const setInning = (n: number) => db.games.update(gameId, { currentInning: Math.max(1, n), updatedAt: now(), ...pendingSync() })
  const toggleHalf = () => db.games.update(gameId, { half: half === 'top' ? 'bottom' : 'top', updatedAt: now(), ...pendingSync() })

  const commit = async (result: PitchResult, inPlay?: InPlayOutcome) => {
    if (!openAtBat || selType === null || selZone === null) return
    let outcome: AtBatOutcome | undefined
    if (result === 'ball' && balls + 1 >= 4) outcome = 'walk'
    else if ((result === 'called_strike' || result === 'swinging_strike') && strikes + 1 >= 3) outcome = 'strikeout'
    else if (result === 'hbp') outcome = 'hbp'
    else if (result === 'in_play') outcome = inPlay

    await db.transaction('rw', db.pitches, db.atBats, db.games, async () => {
      await db.pitches.add({
        id: newId(),
        gameId,
        atBatId: openAtBat.id,
        batterId: openAtBat.batterId,
        pitcherId: game.currentPitcherId ?? openAtBat.pitcherId,
        seq: (abPitches?.length ?? 0) + 1,
        balls,
        strikes,
        pitchTypeId: selType,
        zone: selZone,
        result,
        inPlay,
        inning: curInning,
        ts: Date.now(),
        updatedAt: now(),
        ...pendingSync(),
      })
      if (outcome) {
        await db.atBats.update(openAtBat.id, { outcome, updatedAt: now(), ...pendingSync() })
        // Inning auto-advance: once 3 outs are recorded in the current inning,
        // roll to the next one so the next at-bat is stamped with it.
        let nextInning = curInning
        if (cap.inning && (outcome === 'out' || outcome === 'strikeout')) {
          const gameAbs = await db.atBats.where('gameId').equals(gameId).toArray()
          const outs = gameAbs.filter(
            (a) => (a.inning ?? curInning) === curInning && (a.outcome === 'out' || a.outcome === 'strikeout'),
          ).length
          if (outs >= 3) {
            nextInning = curInning + 1
            await db.games.update(gameId, { currentInning: nextInning, updatedAt: now(), ...pendingSync() })
          }
        }
        // Auto-advance: open the next batter's at-bat per the lineup order.
        const nextId = nextInLineup(order, openAtBat.batterId)
        if (nextId) {
          await db.atBats.add({
            id: newId(), gameId, batterId: nextId,
            pitcherId: game.currentPitcherId ?? openAtBat.pitcherId,
            inning: nextInning,
            startedAt: Date.now(), updatedAt: now(), ...pendingSync(),
          })
        }
      }
    })
    setSelType(null)
    setSelZone(null)
    setShowInPlay(false)
  }

  const undo = async () => {
    await db.transaction('rw', db.pitches, db.atBats, async () => {
      const last = await db.pitches.where('gameId').equals(gameId).last()
      if (!last) {
        // No pitches yet — undo just backs out of the current batter selection
        const open = await db.atBats.where('gameId').equals(gameId).filter((ab) => ab.outcome === undefined).first()
        if (open) await db.atBats.delete(open.id)
        return
      }
      // If a fresh (pitchless) at-bat was already started after the last pitch, remove it
      const open = await db.atBats.where('gameId').equals(gameId).filter((ab) => ab.outcome === undefined).first()
      if (open && open.id !== last.atBatId) {
        const n = await db.pitches.where('atBatId').equals(open.id).count()
        if (n === 0) await db.atBats.delete(open.id)
      }
      await db.atBats.update(last.atBatId, { outcome: undefined, updatedAt: now(), ...pendingSync() })
      await db.pitches.delete(last.id)
    })
    setShowInPlay(false)
  }

  const endGame = async () => {
    if (!confirm('End this game?')) return
    // Discard an in-progress at-bat with no pitches
    const open = await db.atBats.where('gameId').equals(gameId).filter((ab) => ab.outcome === undefined).first()
    if (open) {
      const n = await db.pitches.where('atBatId').equals(open.id).count()
      if (n === 0) await db.atBats.delete(open.id)
    }
    await db.games.update(gameId, { status: 'finished', updatedAt: now(), ...pendingSync() })
    // The order actually batted (including any mid-game drag reordering)
    // becomes the roster's new baseline order for next time.
    if (order.length > 0) await persistLineupToRoster(order)
    navigate(`/games/${gameId}`)
  }

  const inPlayOptions: Array<[InPlayOutcome, string]> = [
    ['out', 'Out'], ['single', 'Single'], ['double', 'Double'],
    ['triple', 'Triple'], ['home_run', 'Home run'], ['error', 'Error'],
  ]

  return (
    <main>
      <div className="row spread">
        <h1 style={{ margin: '8px 0' }}>vs {opponent.name}</h1>
        <span className="muted">{gamePitchCount ?? 0} pitches</span>
      </div>

      <div className="row">
        <label style={{ margin: 0 }}>Pitching:</label>
        <select
          style={{ width: 'auto', flex: 1 }}
          value={game.currentPitcherId ?? ''}
          onChange={(e) => db.games.update(gameId, { currentPitcherId: e.target.value, updatedAt: now(), ...pendingSync() })}
        >
          {pitchers.map((p) => (
            <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{displayName(p)}</option>
          ))}
        </select>
        <button className="small" onClick={undo} disabled={!gamePitchCount && !openAtBat}>↩ Undo</button>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="small" onClick={() => setShowLineup((v) => !v)}>
          {showLineup ? 'Close lineup' : '☰ Batting order'}
        </button>
        <button className="small danger" onClick={endGame}>End game</button>
      </div>

      {cap.inning && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="small" onClick={() => setInning(curInning - 1)} disabled={curInning <= 1} aria-label="Previous inning">‹</button>
          <button className="chip small-chip" onClick={toggleHalf} title="Switch top / bottom">{halfLabel}</button>
          <span className="count-display" style={{ fontSize: '1.1rem' }}>Inning {curInning}</span>
          <button className="small" onClick={() => setInning(curInning + 1)}>Next inning ▸</button>
        </div>
      )}

      {showLineup && (
        <div className="card stack">
          <strong>Batting order — drag ≡ to reorder</strong>
          <LineupEditor
            order={order}
            batters={roster}
            onChange={(o) => db.games.update(gameId, { lineup: o, updatedAt: now(), ...pendingSync() })}
          />
        </div>
      )}

      {!openAtBat && (
        <>
          <h2>Who’s up to bat?</h2>
          {roster.length === 0 && (
            <p className="empty">No batters on {opponent.name}’s roster yet — add them from the team page.</p>
          )}
          <div className="list">
            {roster.map((b) => (
              <button key={b.id} className="list-item" onClick={() => startAtBat(b.id)} style={{ width: '100%' }}>
                <span>{b.number ? `#${b.number} ` : ''}{displayName(b)}</span>
                <span className="pill">bats {b.bats}</span>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        </>
      )}

      {openAtBat && batter && (() => {
        // Scope the batter's history to the chosen pool
        const history = batterHistory ?? []
        const scoped = scope === 'pitcher'
          ? history.filter((p) => p.pitcherId === game.currentPitcherId)
          : history
        const vsPitcherCount = history.filter((p) => p.pitcherId === game.currentPitcherId).length
        const heatPitches = selType !== null ? scoped.filter((p) => p.pitchTypeId === selType) : []
        const heat = heatPitches.length > 0 ? byZoneBattle(heatPitches) : undefined
        return (
        <>
          <div className="card">
            <div className="row spread">
              <div>
                <div style={{ fontWeight: 700 }}>{batter.number ? `#${batter.number} ` : ''}{displayName(batter)}</div>
                <div className="muted">bats {batter.bats} · vs {displayName(currentPitcher)}</div>
              </div>
              <div className="count-display">{balls}-{strikes}</div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="small" onClick={() => setChangingBatter((v) => !v)}>
                {changingBatter ? 'Cancel' : '↔ Wrong batter?'}
              </button>
              <button
                className="small"
                onClick={() => {
                  setShowSubstitutePanel((v) => !v)
                  setSubstitutingFor(batter.id)
                }}
              >
                {showSubstitutePanel ? 'Cancel' : '⇄ Substitute'}
              </button>
              {history.length > 0 && (
                <>
                  <button
                    className={`chip small-chip ${scope === 'all' ? 'on' : ''}`}
                    onClick={() => setScope('all')}
                  >
                    All pitchers ({history.length})
                  </button>
                  <button
                    className={`chip small-chip ${scope === 'pitcher' ? 'on' : ''}`}
                    onClick={() => setScope('pitcher')}
                    disabled={vsPitcherCount === 0}
                  >
                    vs {displayName(currentPitcher)} ({vsPitcherCount})
                  </button>
                </>
              )}
            </div>
          </div>

          {changingBatter && (
            <div className="card stack">
              <strong>Switch this at-bat to…</strong>
              <div className="list">
                {order.map((id) => {
                  const b = roster.find((x) => x.id === id)
                  if (!b) return null
                  return (
                    <button
                      key={b.id}
                      className="list-item"
                      style={{ width: '100%' }}
                      disabled={b.id === batter.id}
                      onClick={() => switchBatter(b.id)}
                    >
                      <span>{b.number ? `#${b.number} ` : ''}{displayName(b)}</span>
                      <span className="pill">bats {b.bats}</span>
                      {b.id === batter.id ? <span className="chev">current</span> : <span className="chev">›</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {showSubstitutePanel && (() => {
            const outgoingId = substitutingFor ?? batter.id
            const outgoing = roster.find((b) => b.id === outgoingId)
            // Pick from the FULL team roster, not just today's lineup — a
            // bench player who never started can still sub in. Anyone
            // currently occupying a different lineup slot is excluded (you
            // can't sub a player in for two slots at once); the outgoing
            // player themself is excluded too.
            const inLineup = new Set(order)
            const eligibleIncoming = roster.filter((b) => b.id !== outgoingId && !inLineup.has(b.id))
            return (
              <div className="card stack">
                <strong>Substitute — replace who?</strong>
                <select
                  style={{ width: '100%' }}
                  value={outgoingId}
                  onChange={(e) => setSubstitutingFor(e.target.value)}
                >
                  {order.map((id) => {
                    const b = roster.find((x) => x.id === id)
                    if (!b) return null
                    return <option key={id} value={id}>{b.number ? `#${b.number} ` : ''}{displayName(b)}</option>
                  })}
                </select>
                <strong>Coming in for {outgoing ? displayName(outgoing) : '…'}</strong>
                {eligibleIncoming.length === 0 && (
                  <p className="empty">No bench players available on {opponent.name}’s roster.</p>
                )}
                <div className="list">
                  {eligibleIncoming.map((b) => (
                    <button
                      key={b.id}
                      className="list-item"
                      style={{ width: '100%' }}
                      onClick={() => substitutePlayer(outgoingId, b.id)}
                    >
                      <span>{b.number ? `#${b.number} ` : ''}{displayName(b)}</span>
                      <span className="pill">bats {b.bats}</span>
                      <span className="chev">›</span>
                    </button>
                  ))}
                </div>
                <Link to={`/opponent/${game.opponentId}`} className="btn small">
                  + Add player to roster
                </Link>
                <p className="muted" style={{ margin: 0 }}>
                  Add the new player on the team page, then come back to this game — it’ll resume right where you left off.
                </p>
              </div>
            )
          })()}

          {selType === null && <SuggestionPanel batter={batter} currentPitcherId={game.currentPitcherId} />}

          {selType === null ? (
            <>
              <h3>1. Pitch type {scoped.length > 0 && <span className="muted" style={{ textTransform: 'none' }}>— {displayName(batter)}’s history per pitch</span>}</h3>
              <div className="pitch-grid">
                {arsenal.map((t) => {
                  const tp = scoped.filter((p) => p.pitchTypeId === t.id)
                  const rate = battleRate(battleAgg(tp))
                  const top3 = outcomeBreakdown(tp).slice(0, 2)
                  return (
                    <button
                      key={t.id}
                      className="pitch-stat"
                      onClick={() => setSelType(t.id)}
                    >
                      <span className="row spread">
                        <strong>{t.name}</strong>
                        <span className="muted">{tp.length > 0 ? `${tp.length} seen` : 'no data'}</span>
                      </span>
                      {rate !== null && (
                        <span className="winbar" aria-hidden="true">
                          <span style={{ width: `${Math.round(rate * 100)}%` }} />
                        </span>
                      )}
                      {top3.length > 0 && (
                        <span className="muted breakdown">
                          {top3.map((s) => `${s.label} ${pct(s.pct)}`).join(' · ')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="row spread selected-pitch">
              <span><span className="muted">Pitch:</span> <strong>{pitchTypes.find((t) => t.id === selType)?.name}</strong></span>
              <button className="small" onClick={() => { setSelType(null); setSelZone(null); setShowInPlay(false) }}>Change pitch</button>
            </div>
          )}

          {selType !== null && (
          <>
          <h3>2. Location {selZone === null && <span className="muted" style={{ textTransform: 'none' }}>— tap where the pitch went</span>}</h3>
          <div className="zone-wrap">
            <ZoneGrid selected={selZone} onSelect={setSelZone} heat={heat} />
            {selZone !== null && (
              <div className="result-overlay">
                <div className="row spread" style={{ marginBottom: 6 }}>
                  <span className="muted">Result · <strong style={{ color: 'var(--text)' }}>{zoneLabel(selZone)}</strong></span>
                  <button className="small" onClick={() => { setSelZone(null); setShowInPlay(false) }}>✎ Change spot</button>
                </div>
                {!showInPlay ? (
                  <div className="result-grid">
                    <button onClick={() => commit('ball')}>Ball</button>
                    {cap.strikeType ? (
                      <>
                        <button onClick={() => commit('called_strike')}>Called strike</button>
                        <button onClick={() => commit('swinging_strike')}>Swinging strike</button>
                      </>
                    ) : (
                      <button onClick={() => commit('called_strike')}>Strike</button>
                    )}
                    <button onClick={() => commit('foul')}>Foul</button>
                    {cap.hbp && <button onClick={() => commit('hbp')}>HBP</button>}
                    <button className="wide primary" onClick={() => setShowInPlay(true)}>In play…</button>
                  </div>
                ) : cap.inPlayDetail ? (
                  <div className="result-grid">
                    {inPlayOptions.map(([value, label]) => (
                      <button key={value} onClick={() => commit('in_play', value)}>{label}</button>
                    ))}
                    <button className="wide" onClick={() => setShowInPlay(false)}>‹ Back</button>
                  </div>
                ) : (
                  <div className="result-grid">
                    <button onClick={() => commit('in_play', 'out')}>Out</button>
                    <button onClick={() => commit('in_play', 'single')}>Hit</button>
                    <button className="wide" onClick={() => setShowInPlay(false)}>‹ Back</button>
                  </div>
                )}
              </div>
            )}
          </div>
          {heat && (
            <p className="muted" style={{ textAlign: 'center', margin: '0 0 8px' }}>
              Green = our pitch won · red = they hit it · number = pitches there
            </p>
          )}
          </>
          )}

          {(abPitches?.length ?? 0) > 0 && (
            <>
              <h3>This at-bat</h3>
              <div className="stack">
                {abPitches!.map((p) => (
                  <div key={p.id} className="muted">
                    {p.seq}. {pitchTypes.find((t) => t.id === p.pitchTypeId)?.name ?? '?'} — {resultLabel(p)}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
        )
      })()}
    </main>
  )
}
