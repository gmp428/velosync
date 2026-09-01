import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, defaultLineup, displayName, newId, now, pendingSync } from '../db'

export default function NewGame() {
  const navigate = useNavigate()
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const [opponentId, setOpponentId] = useState<string | null>(null)
  const [pitcherId, setPitcherId] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  if (!opponents || !pitchers) return null

  const start = async () => {
    if (opponentId === null || pitcherId === null) return
    const gameId = newId()
    const lineup = await defaultLineup(opponentId)
    await db.games.add({
      id: gameId,
      opponentId,
      date,
      status: 'active',
      currentPitcherId: pitcherId,
      lineup,
      currentInning: 1,
      half: 'top',
      updatedAt: now(),
      ...pendingSync(),
    })
    navigate(`/game/${gameId}`)
  }

  return (
    <main>
      <h1>Start a game</h1>

      <h2>Opponent</h2>
      {opponents.length === 0 && (
        <p className="empty">No teams yet — <Link to="/">add one on the home screen</Link> first.</p>
      )}
      <div className="chips">
        {opponents.map((o) => (
          <button key={o.id} className={`chip ${opponentId === o.id ? 'on' : ''}`} onClick={() => setOpponentId(o.id)}>
            {o.name}
          </button>
        ))}
      </div>

      <h2>Starting pitcher</h2>
      {pitchers.length === 0 && (
        <p className="empty">No pitchers yet — <Link to="/pitchers">add your staff</Link> first.</p>
      )}
      <div className="chips">
        {pitchers.map((p) => (
          <button key={p.id} className={`chip ${pitcherId === p.id ? 'on' : ''}`} onClick={() => setPitcherId(p.id)}>
            {p.number ? `#${p.number} ` : ''}{displayName(p)}
          </button>
        ))}
      </div>

      <h2>Date</h2>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <button
        className="primary"
        style={{ width: '100%', marginTop: 16 }}
        disabled={opponentId === null || pitcherId === null}
        onClick={start}
      >
        Start game
      </button>
    </main>
  )
}
