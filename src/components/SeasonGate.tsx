import { useLiveQuery } from 'dexie-react-hooks'
import { createSeason, db } from '../db'
import { SeasonForm } from './SeasonForm'

// Shown until the coach has named at least one season. Existing teams,
// pitchers, and games are not assigned a seasonId in the Dexie upgrade —
// this screen is the one-time migration, and the same screen is the first
// step on a brand-new install.
export default function SeasonGate() {
  const legacyCount = useLiveQuery(async () => {
    const [teams, pitchers, games] = await Promise.all([
      db.opponents.count(),
      db.pitchers.count(),
      db.games.count(),
    ])
    return teams + pitchers + games
  }, [])

  const legacy = (legacyCount ?? 0) > 0

  return (
    <main>
      <h1>{legacy ? 'Name this season' : 'Create your first season'}</h1>
      {legacy ? (
        <p className="muted">
          Teams, pitchers, and games now belong to a season. Name the season for everything already on this device
          ({legacyCount} saved {legacyCount === 1 ? 'record' : 'records'}). You can set it active now, or later in Settings.
        </p>
      ) : (
        <p className="muted">
          A season holds your opposing teams, pitcher staff, and games. It starts empty until you add or import them.
          Pick how ERA is calculated before saving — nothing is selected for you.
        </p>
      )}
      <div className="card">
        <SeasonForm
          showMakeActive
          submitLabel={legacy ? 'Save season and keep my data' : 'Create season'}
          onSubmit={async (value) => {
            await createSeason(value)
          }}
        />
      </div>
    </main>
  )
}
