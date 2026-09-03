import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, now, pendingSync } from '../db'

export default function Home() {
  const opponents = useLiveQuery(
    () => db.opponents.toArray().then((list) => list.sort((a, b) => a.name.localeCompare(b.name))),
    []
  )
  const activeGames = useLiveQuery(() => db.games.where('status').equals('active').toArray(), [])
  const pitcherCount = useLiveQuery(() => db.pitchers.count(), [])
  const [name, setName] = useState('')

  const addOpponent = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await db.opponents.add({ id: newId(), name: trimmed, updatedAt: now(), ...pendingSync() })
    setName('')
  }

  if (!opponents || !activeGames) return null

  return (
    <main>
      {activeGames.map((g) => (
        <Link key={g.id} to={`/game/${g.id}`} className="list-item" style={{ borderColor: 'var(--good)' }}>
          <span className="good">●</span>
          <span>
            Game in progress — {opponents.find((o) => o.id === g.opponentId)?.name ?? 'Unknown'}{' '}
            <span className="muted">({g.date})</span>
          </span>
          <span className="chev">Resume ›</span>
        </Link>
      ))}

      <div className="row" style={{ marginTop: 12 }}>
        <Link to="/new-game" className="btn primary grow">▶ Start a game</Link>
        <Link to="/pitchers" className="btn grow">My pitchers{pitcherCount ? ` (${pitcherCount})` : ''}</Link>
      </div>

      <h2>Opposing teams</h2>
      {opponents.length === 0 && (
        <p className="empty">
          Add the teams you play against, then add their batters.<br />
          Everything you log builds their scouting reports.
        </p>
      )}
      <div className="list">
        {opponents.map((o) => (
          <Link key={o.id} to={`/opponent/${o.id}`} className="list-item">
            <span>{o.name}</span>
            <span className="chev">›</span>
          </Link>
        ))}
      </div>

      <form onSubmit={addOpponent} className="row">
        <input
          className="grow"
          placeholder="New team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New team name"
        />
        <button type="submit" className="primary">Add team</button>
      </form>
    </main>
  )
}
