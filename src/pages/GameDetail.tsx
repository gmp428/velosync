import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, displayName, GHOST_OUT, now, outcomeLabel, pendingSync, resultLabel, zoneLabel } from '../db'

export default function GameDetail() {
  const { id } = useParams()
  const gameId = id!
  const navigate = useNavigate()

  const game = useLiveQuery(() => db.games.get(gameId), [gameId])
  const opponent = useLiveQuery(() => (game ? db.opponents.get(game.opponentId) : undefined), [game?.opponentId])
  const atBats = useLiveQuery(() => db.atBats.where('gameId').equals(gameId).toArray(), [gameId])
  const pitches = useLiveQuery(() => db.pitches.where('gameId').equals(gameId).toArray(), [gameId])
  const batters = useLiveQuery(() => db.batters.toArray(), [])
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  const substitutions = useLiveQuery(() => db.substitutions.where('gameId').equals(gameId).toArray(), [gameId])

  if (!game || !opponent || !atBats || !pitches || !batters || !pitchers || !pitchTypes) return null

  const ordered = [...atBats].sort((a, b) => a.startedAt - b.startedAt)
  const subsOrdered = [...(substitutions ?? [])].sort((a, b) => a.timestamp - b.timestamp)

  const halfLabel = (game.half ?? 'top') === 'top' ? 'Top' : 'Bot'
  const byInning = new Map<number, number>()
  for (const p of pitches) {
    const i = p.inning ?? 1
    byInning.set(i, (byInning.get(i) ?? 0) + 1)
  }
  const inningRows = [...byInning.entries()].sort((a, b) => a[0] - b[0])

  const reopen = async () => {
    await db.games.update(gameId, { status: 'active', updatedAt: now(), ...pendingSync() })
    navigate(`/game/${gameId}`)
  }

  return (
    <main>
      <h1>vs {opponent.name} <span className="muted">({game.date})</span></h1>
      <div className="row">
        <span className="pill">{pitches.length} pitches</span>
        <span className="pill">{ordered.length} at-bats</span>
        {game.status === 'finished'
          ? <button className="small" onClick={reopen}>Reopen game</button>
          : <Link to={`/game/${gameId}`} className="btn small">Back to live game</Link>}
      </div>

      {inningRows.length > 1 && (
        <>
          <h2>Pitch count by inning</h2>
          <table>
            <thead>
              <tr><th>Inning</th><th className="num">Pitches</th></tr>
            </thead>
            <tbody>
              {inningRows.map(([inning, count]) => (
                <tr key={inning}>
                  <td>{halfLabel} {inning}</td>
                  <td className="num">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {ordered.length === 0 && <p className="empty">Nothing logged in this game.</p>}

      {subsOrdered.length > 0 && (
        <>
          <h2>Substitutions</h2>
          <div className="stack">
            {subsOrdered.map((s) => {
              const outB = batters.find((b) => b.id === s.battedOutId)
              const inB = batters.find((b) => b.id === s.battedInId)
              return (
                <div key={s.id} className="muted">
                  {halfLabel} {s.inning} — {displayName(inB)} in for {displayName(outB)}
                </div>
              )
            })}
          </div>
        </>
      )}

      {ordered.map((ab, i) => {
        const isGhost = ab.batterId === GHOST_OUT
        const batter = batters.find((b) => b.id === ab.batterId)
        const pitcher = pitchers.find((p) => p.id === ab.pitcherId)
        const abPitches = pitches.filter((p) => p.atBatId === ab.id).sort((a, b) => a.seq - b.seq)
        return (
          <div key={ab.id} className="card">
            <div className="row spread">
              <strong>
                {i + 1}. {isGhost
                  ? <span style={{ fontStyle: 'italic' }}>Ghost Batter (Auto Out)</span>
                  : <Link to={`/batter/${ab.batterId}`}>{displayName(batter)}</Link>}
              </strong>
              <span>{ab.outcome ? outcomeLabel(ab.outcome) : 'In progress'}</span>
            </div>
            <div className="muted">
              {isGhost ? 'automatic scoreless out' : `pitched by ${displayName(pitcher)}`}{ab.inning ? ` · ${halfLabel} ${ab.inning}` : ''}
            </div>
            <div className="stack" style={{ marginTop: 6 }}>
              {abPitches.map((p) => (
                <div key={p.id} className="muted">
                  {p.seq}. ({p.balls}-{p.strikes}) {pitchTypes.find((t) => t.id === p.pitchTypeId)?.name ?? '?'},{' '}
                  {zoneLabel(p.zone)} — {resultLabel(p)}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </main>
  )
}
