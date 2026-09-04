import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, displayName, fullName, getSettings, pitcherArsenal, saveSettings, type Zone, zoneLabel } from '../db'
import ZoneGrid from '../components/ZoneGrid'
import {
  aggregate, byPitchType, byZoneBattle, commandAgg, commandGrouping, commandRate, filterByWindow, pct, successRate,
  WINDOW_LABELS, type TimeWindow,
} from '../lib/stats'

const WINDOWS: TimeWindow[] = ['last1', 'last3', 'all']

export default function PitcherReport() {
  const { id } = useParams()
  const pitcherId = id!
  const navigate = useNavigate()

  const pitcher = useLiveQuery(() => db.pitchers.get(pitcherId), [pitcherId])
  const pitches = useLiveQuery(() => db.pitches.where('pitcherId').equals(pitcherId).toArray(), [pitcherId])
  const allGames = useLiveQuery(() => db.games.toArray(), [])
  const allBatters = useLiveQuery(() => db.batters.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])

  const [win, setWin] = useState<TimeWindow>('all')
  const [groupingPitchType, setGroupingPitchType] = useState<string | 'all'>('all')
  const [drillDownZone, setDrillDownZone] = useState<Zone | null>(null)

  if (!pitcher || !pitches || !allGames || !allBatters || !pitchTypes || !settings) return null

  const viewPitches = filterByWindow(pitches, allGames, win)
  const overall = aggregate(viewPitches)
  const typeAggs = byPitchType(viewPitches)
  const heat = byZoneBattle(viewPitches)
  const resolution = settings.capture.granularZones ? 'granular' : 'coarse'
  const command = commandAgg(viewPitches, settings.commandMatchMode, resolution)
  const groupingPitches = groupingPitchType === 'all' ? viewPitches : viewPitches.filter((p) => p.pitchTypeId === groupingPitchType)
  const grouping = resolution === 'granular' ? commandGrouping(groupingPitches) : new Map()
  const drillDown = drillDownZone !== null ? grouping.get(drillDownZone) : undefined

  // Per-batter results for this pitcher
  const byBatter = new Map<string, typeof overall>()
  for (const batterId of new Set(viewPitches.map((p) => p.batterId))) {
    byBatter.set(batterId, aggregate(viewPitches.filter((p) => p.batterId === batterId)))
  }

  return (
    <main>
      <button className="small" style={{ marginTop: 10 }} onClick={() => navigate(-1)}>‹ Back</button>
      <h1>
        {pitcher.number ? `#${pitcher.number} ` : ''}{fullName(pitcher)}{' '}
        <span className="pill">throws {pitcher.throws}</span>
      </h1>
      <p className="muted">
        Arsenal: {pitcherArsenal(pitcher, pitchTypes).map((t) => t.name).join(', ')}
      </p>
      {pitcher.notes && <p className="muted">📝 {pitcher.notes}</p>}

      <div className="chips">
        {WINDOWS.map((w) => (
          <button key={w} className={`chip ${win === w ? 'on' : ''}`} onClick={() => setWin(w)}>
            {WINDOW_LABELS[w]}
          </button>
        ))}
      </div>

      {viewPitches.length === 0 ? (
        <p className="empty">No pitches logged for this view yet.</p>
      ) : (
        <>
          <div className="card row spread">
            <span>{overall.total} pitches</span>
            <span className="good">{pct(successRate(overall))} success</span>
            <span className={overall.hits > 0 ? 'bad' : 'muted'}>{overall.hits} hits allowed</span>
          </div>

          <h2>Locations</h2>
          <ZoneGrid heat={heat} granular={settings.capture.granularZones} />

          {command.total > 0 && (
            <>
              <h2>Command</h2>
              <p className="muted">
                {command.total} pitches with an intended target logged
              </p>
              <div className="chips">
                <button
                  className={`chip ${settings.commandMatchMode === 'tight' ? 'on' : ''}`}
                  onClick={() => saveSettings({ commandMatchMode: 'tight' })}
                >
                  Tight — exact zone only
                </button>
                <button
                  className={`chip ${settings.commandMatchMode === 'loose' ? 'on' : ''}`}
                  onClick={() => saveSettings({ commandMatchMode: 'loose' })}
                >
                  Loose — same or adjacent zone
                </button>
              </div>
              <div className="card row spread" style={{ marginTop: 8 }}>
                <span className="good">{pct(commandRate(command) ?? 0)} hit target</span>
                {resolution === 'granular' && (
                  <>
                    <span className={command.missHigh > 0 ? 'bad' : 'muted'}>{command.missHigh} missed high</span>
                    <span className={command.missLow > 0 ? 'bad' : 'muted'}>{command.missLow} missed low</span>
                    <span className={command.missArmSide > 0 ? 'bad' : 'muted'}>{command.missArmSide} missed arm-side</span>
                    <span className={command.missGloveSide > 0 ? 'bad' : 'muted'}>{command.missGloveSide} missed glove-side</span>
                  </>
                )}
              </div>
              {resolution === 'coarse' && (
                <p className="muted">Turn on "Granular foul zones" in Settings for a high/low/arm-side/glove-side miss-direction breakdown.</p>
              )}

              {resolution === 'granular' && (
                <>
                  <h3 style={{ marginTop: 16 }}>Grouping heat map</h3>
                  <p className="muted">
                    Color shows how tightly clustered actual pitches were around each intended target —
                    green = tight grouping, red = scattered. Tap a target zone to see where those pitches
                    actually landed; tap it again to go back to the overall heat map.
                  </p>
                  <div className="chips">
                    <button className={`chip ${groupingPitchType === 'all' ? 'on' : ''}`} onClick={() => { setGroupingPitchType('all'); setDrillDownZone(null) }}>
                      All pitches
                    </button>
                    {pitchTypes.filter((t) => typeAggs.has(t.id)).map((t) => (
                      <button key={t.id} className={`chip ${groupingPitchType === t.id ? 'on' : ''}`} onClick={() => { setGroupingPitchType(t.id); setDrillDownZone(null) }}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                  <ZoneGrid
                    grouping={grouping}
                    granular
                    selected={drillDownZone}
                    onSelect={(z) => setDrillDownZone(drillDownZone === z ? null : z)}
                  />
                  {drillDown && (
                    <p className="muted" style={{ marginTop: 4 }}>
                      Showing landing spots for <strong style={{ color: 'var(--text)' }}>{drillDown.count}</strong> pitches
                      aimed at <strong style={{ color: 'var(--text)' }}>{zoneLabel(drillDown.intended)}</strong>
                    </p>
                  )}
                </>
              )}
            </>
          )}

          <h2>Pitch mix</h2>
          <table>
            <thead>
              <tr><th>Pitch</th><th className="num">Thrown</th><th className="num">Whiffs</th><th className="num">Hits</th><th className="num">Success</th></tr>
            </thead>
            <tbody>
              {pitchTypes.filter((t) => typeAggs.has(t.id)).map((t) => {
                const a = typeAggs.get(t.id)!
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="num">{a.total}</td>
                    <td className="num">{a.whiffs}</td>
                    <td className="num">{a.hits}</td>
                    <td className="num">{pct(successRate(a))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <h2>Batters faced</h2>
          <table>
            <thead>
              <tr><th>Batter</th><th className="num">Pitches</th><th className="num">Hits</th><th className="num">Success</th></tr>
            </thead>
            <tbody>
              {[...byBatter.entries()].map(([bid, a]) => {
                const b = allBatters.find((x) => x.id === bid)
                return (
                  <tr key={bid}>
                    <td><Link to={`/batter/${bid}`}>{displayName(b)}</Link></td>
                    <td className="num">{a.total}</td>
                    <td className="num">{a.hits}</td>
                    <td className="num">{pct(successRate(a))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
