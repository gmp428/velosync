import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ActiveSeasonNote, NoActiveSeason } from '../components/SeasonChrome'
import { db, defaultLineup, displayName, newId, now, pendingSync, type Pitcher } from '../db'
import { useSeasonList } from '../lib/useSeason'

export default function NewGame() {
  const navigate = useNavigate()
  const { seasons, active } = useSeasonList()
  const opponents = useLiveQuery(async () => {
    if (!active) return []
    const list = await db.opponents.where('seasonId').equals(active.id).toArray()
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [active?.id])
  const pitchers = useLiveQuery(async (): Promise<Pitcher[]> => {
    if (!active) return []
    return db.pitchers.where('seasonId').equals(active.id).toArray()
  }, [active?.id])
  const [opponentId, setOpponentId] = useState<string | null>(null)
  const [pitcherId, setPitcherId] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [homeAway, setHomeAway] = useState<'home' | 'away' | null>(null)

  if (!seasons || !opponents || !pitchers) return null

  const start = async () => {
    if (!active || opponentId === null || pitcherId === null || homeAway === null) return
    const gameId = newId()
    const lineup = await defaultLineup(opponentId)
    // Home team pitches first (the opponent bats top); away team bats first
    // (the opponent bats bottom, since we're the visiting team on offense).
    const half = homeAway === 'home' ? 'top' : 'bottom'
    await db.games.add({
      id: gameId,
      opponentId,
      seasonId: active.id,
      date,
      status: 'active',
      currentPitcherId: pitcherId,
      lineup,
      currentInning: 1,
      half,
      homeAway,
      updatedAt: now(),
      ...pendingSync(),
    })
    navigate(`/game/${gameId}`)
  }

  return (
    <main>
      <h1>Start a game</h1>
      {active ? <ActiveSeasonNote season={active} /> : <NoActiveSeason />}

      <h2>Home or away?</h2>
      <p className="muted">Sets who bats first — home pitches first, away bats first.</p>
      <div className="chips">
        <button className={`chip ${homeAway === 'home' ? 'on' : ''}`} onClick={() => setHomeAway('home')}>
          🏠 Home (we pitch first)
        </button>
        <button className={`chip ${homeAway === 'away' ? 'on' : ''}`} onClick={() => setHomeAway('away')}>
          ✈️ Away (we bat first)
        </button>
      </div>

      <h2>Opponent</h2>
      {active && opponents.length === 0 && (
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
      {active && pitchers.length === 0 && (
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
        disabled={!active || opponentId === null || pitcherId === null || homeAway === null}
        onClick={start}
      >
        Start game
      </button>
    </main>
  )
}
