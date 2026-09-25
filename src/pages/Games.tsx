import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ActiveSeasonNote, NoActiveSeason } from '../components/SeasonChrome'
import { db } from '../db'
import { orderGamesNewestFirst } from '../lib/stats'
import { useSeasonList } from '../lib/useSeason'

export default function Games() {
  const { seasons, active } = useSeasonList()
  const games = useLiveQuery(async () => {
    if (!active) return []
    return db.games.where('seasonId').equals(active.id).toArray()
  }, [active?.id])
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])
  const pitchCounts = useLiveQuery(async () => {
    const counts = new Map<string, number>()
    const all = await db.pitches.toArray()
    for (const p of all) counts.set(p.gameId, (counts.get(p.gameId) ?? 0) + 1)
    return counts
  }, [])

  if (!seasons || !games || !opponents || !pitchCounts) return null

  const ordered = orderGamesNewestFirst(games)
    .map((gid) => games.find((g) => g.id === gid)!)

  return (
    <main>
      <h1>Games</h1>
      {active ? <ActiveSeasonNote season={active} /> : <NoActiveSeason />}
      {active && ordered.length === 0 && <p className="empty">No games in this season yet. Start one from the home screen.</p>}
      <div className="list">
        {ordered.map((g) => (
          <Link
            key={g.id}
            to={g.status === 'active' ? `/game/${g.id}` : `/games/${g.id}`}
            className="list-item"
          >
            <span>
              vs {opponents.find((o) => o.id === g.opponentId)?.name ?? '?'}{' '}
              <span className="muted">({g.date})</span>
            </span>
            {g.status === 'active' && <span className="pill good">live</span>}
            <span className="chev">{pitchCounts.get(g.id) ?? 0} pitches ›</span>
          </Link>
        ))}
      </div>
    </main>
  )
}
