import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ActiveSeasonNote, NoActiveSeason } from '../components/SeasonChrome'
import { db, newId, now, pendingSync } from '../db'
import { useSeasonList } from '../lib/useSeason'

export default function Home() {
  const { seasons, active } = useSeasonList()
  const opponents = useLiveQuery(async () => {
    if (!active) return []
    const list = await db.opponents.where('seasonId').equals(active.id).toArray()
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [active?.id])
  const activeGames = useLiveQuery(async () => {
    if (!active) return []
    const list = await db.games.where('status').equals('active').toArray()
    return list.filter((g) => g.seasonId === active.id)
  }, [active?.id])
  const pitcherCount = useLiveQuery(
    () => (active ? db.pitchers.where('seasonId').equals(active.id).count() : Promise.resolve(0)),
    [active?.id],
  )
  const [name, setName] = useState('')

  const addOpponent = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !active) return
    await db.opponents.add({ id: newId(), name: trimmed, seasonId: active.id, updatedAt: now(), ...pendingSync() })
    setName('')
  }

  if (!seasons || !opponents || !activeGames || pitcherCount === undefined) return null

  return (
    <main>
      {active ? <ActiveSeasonNote season={active} /> : <NoActiveSeason />}
      {activeGames.map((g) => (
        <Link key={g.id} to={`/game/${g.id}`} className="list-item">
          <span className="live-dot" aria-hidden="true" />
          <span>
            Game in progress — {opponents.find((o) => o.id === g.opponentId)?.name ?? 'Unknown'}{' '}
            <span className="muted">({g.date})</span>
          </span>
          <span className="resume-link">Resume ›</span>
        </Link>
      ))}

      <Link to="/new-game" className="btn primary start-game">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.2v13.6l12-6.8z" fill="currentColor" />
        </svg>
        Start a game
      </Link>
      <Link to="/pitchers" className="soft-link">
        My pitchers{pitcherCount ? ` (${pitcherCount})` : ''}
      </Link>

      <h2>Opposing teams</h2>
      {!active ? null : opponents.length === 0 && (
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

      {active && <form onSubmit={addOpponent} className="row">
        <input
          className="grow"
          placeholder="New team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New team name"
        />
        <button type="submit" className="primary">Add team</button>
      </form>}
    </main>
  )
}
