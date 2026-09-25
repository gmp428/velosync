import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ImportFromSeason } from '../components/ImportFromSeason'
import { ActiveSeasonNote, NoActiveSeason } from '../components/SeasonChrome'
import { db, newId, now, pendingSync } from '../db'
import { useSeasonList } from '../lib/useSeason'

export default function Teams() {
  const { seasons, active } = useSeasonList()
  const opponents = useLiveQuery(async () => {
    if (!active) return []
    const list = await db.opponents.where('seasonId').equals(active.id).toArray()
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [active?.id])
  const batterCounts = useLiveQuery(async () => {
    const counts = new Map<string, number>()
    for (const b of await db.batters.toArray()) {
      counts.set(b.opponentId, (counts.get(b.opponentId) ?? 0) + 1)
    }
    return counts
  }, [])
  const [name, setName] = useState('')
  const [showImport, setShowImport] = useState(false)

  const addOpponent = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !active) return
    await db.opponents.add({ id: newId(), name: trimmed, seasonId: active.id, updatedAt: now(), ...pendingSync() })
    setName('')
  }

  if (!seasons || !opponents || !batterCounts) return null

  return (
    <main>
      <h1>Opposing teams</h1>
      {active ? <ActiveSeasonNote season={active} /> : <NoActiveSeason />}
      <p className="muted">Tap a team to edit its roster and see batter reports. Rosters are kept per season.</p>

      {active && opponents.length === 0 && (
        <p className="empty">No teams in this season yet — add one below, or import a roster from another season.</p>
      )}

      <div className="list">
        {opponents.map((o) => (
          <Link key={o.id} to={`/opponent/${o.id}`} className="list-item">
            <span>{o.name}</span>
            <span className="pill count-pill">{batterCounts.get(o.id) ?? 0} batters</span>
            <span className="chev">›</span>
          </Link>
        ))}
      </div>

      {active && (
        <>
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
          <button type="button" onClick={() => setShowImport(true)}>Import team from another season</button>
          {showImport && (
            <ImportFromSeason mode={{ kind: 'new-team', targetSeasonId: active.id }} onClose={() => setShowImport(false)} />
          )}
        </>
      )}
    </main>
  )
}
