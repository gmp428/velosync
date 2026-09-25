import { useEffect, useRef, useState } from 'react'
import { DEMO_ACTIVE_SEASON_NAME, DEMO_LOAD_CONFIRM, loadDemoData } from '../lib/demoData'

export function LoadDemoButton() {
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const load = async () => {
    if (busy) return
    if (!confirm(DEMO_LOAD_CONFIRM)) return
    setBusy(true)
    try {
      await loadDemoData()
      alert(`Demo data loaded. ${DEMO_ACTIVE_SEASON_NAME} is the active season.`)
    } catch (err) {
      alert(`Could not load demo data: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <strong>Demo data</strong>
      <p className="muted" style={{ margin: 0 }}>
        Sample seasons for Maya Chen, Riley Brooks, and Jordan Hale: 2025 Fall (not active) and 2026 Spring (active), with opposing lineups and pitch-by-pitch games. Every game has a mid-inning pitching change, earned runs, and locations.
      </p>
      <p className="warning" style={{ margin: 0 }}>
        This wipes seasons, teams, pitchers, games, pitches, and pitch types on this device. It does not merge with data you already entered. Load it again anytime to reset to the same sample.
      </p>
      <button type="button" onClick={load} disabled={busy}>
        {busy ? 'Loading…' : 'Load demo data'}
      </button>
    </div>
  )
}
