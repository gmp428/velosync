import { Link } from 'react-router-dom'
import type { Season } from '../db'

export function ActiveSeasonNote({ season }: { season: Season }) {
  return (
    <p className="muted">
      {season.name} · {season.eraInnings}-inning ERA · <Link to="/settings">Switch season</Link>
    </p>
  )
}

export function NoActiveSeason() {
  return (
    <div className="card">
      <p style={{ margin: 0 }}>
        No active season. <Link to="/settings">Choose one in Settings</Link> to see this season’s teams, pitchers, and games.
      </p>
    </div>
  )
}
