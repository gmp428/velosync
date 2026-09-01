import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, now, pendingSync } from '../db'

export default function Teams() {
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])
  const batterCounts = useLiveQuery(async () => {
    const counts = new Map<string, number>()
    for (const b of await db.batters.toArray()) {
      counts.set(b.opponentId, (counts.get(b.opponentId) ?? 0) + 1)
    }
    return counts
  }, [])
  const [name, setName] = useState('')

  const addOpponent = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await db.opponents.add({ id: newId(), name: trimmed, updatedAt: now(), ...pendingSync() })
    setName('')
  }

  if (!opponents || !batterCounts) return null

  return (
    <main>
      <h1>Opposing teams</h1>
      <p className="muted">Tap a team to edit its roster and see batter reports.</p>

      {opponents.length === 0 && (
        <p className="empty">No teams yet — add the first one below.</p>
      )}

      <div className="list">
        {opponents.map((o) => (
          <Link key={o.id} to={`/opponent/${o.id}`} className="list-item">
            <span>{o.name}</span>
            <span className="pill">{batterCounts.get(o.id) ?? 0} batters</span>
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
