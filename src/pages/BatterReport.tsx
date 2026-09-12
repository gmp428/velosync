import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, displayName, fullName, getSettings, normalizeZone, outcomeLabel, resultLabel, zoneLabel, type Zone } from '../db'
import ZoneGrid from '../components/ZoneGrid'
import { HEAT_BANDS } from '../components/ZoneGrid'
import {
  aggregate, byCount, byPitcher, byPitchType, byZoneBattle, filterByWindow,
  gameIdsForWindow, isHit, pct, plateDiscipline, successRate, WINDOW_LABELS, type TimeWindow,
} from '../lib/stats'

const WINDOWS: TimeWindow[] = ['last1', 'last3', 'all']

// Numeric-percentage range label for a HEAT_BANDS entry, derived from its own
// `min` and the next-higher band's `min` (bands are sorted highest-min first).
// The highest band has no upper neighbor, so it tops out at 100%; each lower
// band's range starts right where the one above it stops (no gaps/overlaps),
// e.g. min:0.6 with a next-band min:0.8 -> "60-79%", not "60-80%".
function heatBandRangeLabel(index: number): string {
  const band = HEAT_BANDS[index]
  const lo = Math.round(Math.max(0, band.min) * 100)
  const prevBand = index > 0 ? HEAT_BANDS[index - 1] : undefined
  const hi = prevBand ? Math.round(prevBand.min * 100) - 1 : 100
  return `${lo}-${hi}%`
}

export default function BatterReport() {
  const { id } = useParams()
  const batterId = id!
  const navigate = useNavigate()

  const batter = useLiveQuery(() => db.batters.get(batterId), [batterId])
  const opponent = useLiveQuery(
    () => (batter ? db.opponents.get(batter.opponentId) : undefined),
    [batter?.opponentId],
  )
  const pitches = useLiveQuery(() => db.pitches.where('batterId').equals(batterId).toArray(), [batterId])
  const atBats = useLiveQuery(() => db.atBats.where('batterId').equals(batterId).toArray(), [batterId])
  const allGames = useLiveQuery(() => db.games.toArray(), [])
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])

  const [win, setWin] = useState<TimeWindow>('all')
  const [pitcherFilter, setPitcherFilter] = useState<string | 'all'>('all')
  const [expandedAb, setExpandedAb] = useState<string | null>(null)
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)

  if (!batter || !opponent || !pitches || !atBats || !allGames || !pitchers || !pitchTypes || !settings) return null

  const windowPitches = filterByWindow(pitches, allGames, win)
  const viewPitches = pitcherFilter === 'all'
    ? windowPitches
    : windowPitches.filter((p) => p.pitcherId === pitcherFilter)

  const overall = aggregate(viewPitches)
  const heat = byZoneBattle(viewPitches)
  const typeAggs = byPitchType(viewPitches)
  const matchups = byPitcher(windowPitches)
  const discipline = plateDiscipline(viewPitches)
  const countRows = byCount(viewPitches)
  const rate = (r: number | null) => (r === null ? '—' : pct(r))

  const windowGameIds = gameIdsForWindow(pitches, allGames, win)
  const historyAtBats = atBats
    .filter((ab) => (windowGameIds === null || windowGameIds.has(ab.gameId)))
    .filter((ab) => (pitcherFilter === 'all' || ab.pitcherId === pitcherFilter))
    .filter((ab) => ab.outcome !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt)

  const gameById = new Map(allGames.map((g) => [g.id, g]))
  const pitchTypeById = new Map(pitchTypes.map((t) => [t.id, t.name]))
  const pitcherName = (pid: string) => displayName(pitchers.find((p) => p.id === pid))

  return (
    <main>
      <button className="small" style={{ marginTop: 10 }} onClick={() => navigate(-1)}>‹ Back</button>
      <h1>
        {batter.number ? `#${batter.number} ` : ''}{fullName(batter)}{' '}
        <span className="pill">bats {batter.bats}</span>
      </h1>
      <p className="muted"><Link to={`/opponent/${opponent.id}`}>{opponent.name}</Link></p>

      <div className="chips">
        {WINDOWS.map((w) => (
          <button key={w} className={`chip ${win === w ? 'on' : ''}`} onClick={() => setWin(w)}>
            {WINDOW_LABELS[w]}
          </button>
        ))}
      </div>

      <div className="chips">
        <button className={`chip ${pitcherFilter === 'all' ? 'on' : ''}`} onClick={() => setPitcherFilter('all')}>
          All pitchers
        </button>
        {pitchers.filter((p) => matchups.has(p.id)).map((p) => (
          <button key={p.id} className={`chip ${pitcherFilter === p.id ? 'on' : ''}`} onClick={() => setPitcherFilter(p.id)}>
            vs {displayName(p)}
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
            <span className={overall.hits > 0 ? 'bad' : 'muted'}>{overall.hits} hits</span>
          </div>

          <h2>Zone heat map</h2>
          <p className="muted">Red = our pitch won (strikes, fouls, outs), blue = they hit it. Number = pitches there.</p>
          <div className="row" style={{ gap: 0, marginBottom: 8 }}>
            {HEAT_BANDS.map((band, i) => (
              <div
                key={band.min}
                style={{
                  flex: 1,
                  background: band.bg,
                  color: band.fg,
                  textAlign: 'center',
                  fontSize: 12,
                  padding: '4px 2px',
                }}
              >
                {heatBandRangeLabel(i)}
              </div>
            ))}
          </div>
          <ZoneGrid
            heat={heat}
            granular={settings.capture.granularZones}
            selected={selectedZone}
            onSelect={(z) => setSelectedZone(selectedZone === z ? null : z)}
          />
          {selectedZone !== null && (() => {
            const resolution = settings.capture.granularZones ? 'granular' : 'coarse'
            const zonePitches = viewPitches.filter((p) => normalizeZone(p.zone, resolution) === selectedZone)
            const byType = new Map<string, typeof zonePitches>()
            for (const p of zonePitches) {
              const arr = byType.get(p.pitchTypeId) ?? []
              arr.push(p)
              byType.set(p.pitchTypeId, arr)
            }
            return (
              <div className="card stack" style={{ marginTop: 4 }}>
                <div className="row spread">
                  <strong>{zoneLabel(selectedZone)} — pitch breakdown</strong>
                  <button className="small" onClick={() => setSelectedZone(null)}>Close</button>
                </div>
                {zonePitches.length === 0 ? (
                  <p className="muted">No pitches logged in this zone.</p>
                ) : (
                  [...byType.entries()].map(([typeId, tp]) => {
                    const resultCounts = new Map<string, number>()
                    for (const p of tp) {
                      const label = resultLabel(p)
                      resultCounts.set(label, (resultCounts.get(label) ?? 0) + 1)
                    }
                    return (
                      <div key={typeId}>
                        <span>{pitchTypeById.get(typeId) ?? 'Pitch'} — {tp.length}</span>
                        <div className="muted" style={{ marginLeft: 8 }}>
                          {[...resultCounts.entries()].map(([label, count]) => `${label}: ${count}`).join(' · ')}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })()}

          <h2>By pitch type</h2>
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

          <h2>Plate discipline</h2>
          <div className="row" style={{ gap: 8 }}>
            <div className="card stat-tile"><div className="stat-num">{rate(discipline.chasePct)}</div><div className="muted">Chase</div></div>
            <div className="card stat-tile"><div className="stat-num">{rate(discipline.whiffPct)}</div><div className="muted">Whiff</div></div>
            <div className="card stat-tile"><div className="stat-num">{rate(discipline.zonePct)}</div><div className="muted">In zone</div></div>
            <div className="card stat-tile"><div className="stat-num">{rate(discipline.firstPitchStrikePct)}</div><div className="muted">1st-pitch K</div></div>
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            Chase = swings at pitches out of the zone · Whiff = swings and misses.
          </p>

          <h2>By count</h2>
          <table>
            <thead>
              <tr><th>Count</th><th className="num">Seen</th><th className="num">Whiff%</th><th className="num">Chase%</th><th className="num">Hits</th></tr>
            </thead>
            <tbody>
              {countRows.map(({ key, pitches: cp }) => {
                const d = plateDiscipline(cp)
                const hits = cp.filter(isHit).length
                return (
                  <tr key={key}>
                    <td>{key}</td>
                    <td className="num">{cp.length}</td>
                    <td className="num">{rate(d.whiffPct)}</td>
                    <td className="num">{rate(d.chasePct)}</td>
                    <td className={`num ${hits > 0 ? 'bad' : ''}`}>{hits}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {matchups.size > 0 && (
        <>
          <h2>Vs. my pitchers</h2>
          <p className="muted">Tap a row to filter this whole report to that matchup.</p>
          <table>
            <thead>
              <tr><th>Pitcher</th><th className="num">Pitches</th><th className="num">Hits</th><th className="num">Success</th></tr>
            </thead>
            <tbody>
              {[...matchups.entries()].map(([pid, a]) => (
                <tr
                  key={pid}
                  onClick={() => setPitcherFilter(pitcherFilter === pid ? 'all' : pid)}
                  style={{ cursor: 'pointer', background: pitcherFilter === pid ? 'var(--panel-2)' : undefined }}
                >
                  <td>{pitcherName(pid)}</td>
                  <td className="num">{a.total}</td>
                  <td className="num">{a.hits}</td>
                  <td className="num">{pct(successRate(a))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {historyAtBats.length > 0 && (
        <>
          <h2>At-bat history</h2>
          <p className="muted">Tap an at-bat to see its pitch-by-pitch sequence.</p>
          <div className="list">
            {historyAtBats.map((ab) => {
              const open = expandedAb === ab.id
              const seq = pitches
                .filter((p) => p.atBatId === ab.id)
                .sort((a, b) => a.seq - b.seq)
              const g = gameById.get(ab.gameId)
              const inningLabel = ab.inning
                ? `${(g?.half ?? 'top') === 'top' ? 'Top' : 'Bot'} ${ab.inning} · `
                : ''
              return (
                <div key={ab.id}>
                  <button
                    className="list-item"
                    style={{ width: '100%', cursor: 'pointer' }}
                    onClick={() => setExpandedAb(open ? null : ab.id)}
                  >
                    <span>{outcomeLabel(ab.outcome!)}</span>
                    <span className="muted">vs {pitcherName(ab.pitcherId)}</span>
                    <span className="chev">
                      {inningLabel}{g?.date ?? ''} {open ? '▾' : '▸'}
                    </span>
                  </button>
                  {open && (
                    <div className="card stack" style={{ margin: '4px 0 8px' }}>
                      {seq.length === 0 ? (
                        <span className="muted">No pitches recorded for this at-bat.</span>
                      ) : (
                        seq.map((p) => (
                          <span key={p.id} className="muted">
                            {p.seq}. ({p.balls}-{p.strikes}){' '}
                            {pitchTypeById.get(p.pitchTypeId) ?? 'Pitch'} · {zoneLabel(p.zone)} — {resultLabel(p)}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {batter.notes && <p className="card muted">📝 {batter.notes}</p>}
    </main>
  )
}
