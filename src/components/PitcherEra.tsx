import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, displayName, fullName, unlinkPitcherRecord, type Pitcher, type Season } from '../db'
import {
  ERA_WINDOW_LABELS, eraFactorForWindow, formatEra, formatInningsPitched,
  gameIdsForSeasons, seasonsInWindow, sumEarnedRuns, sumOuts, type EraWindow,
} from '../lib/era'
import { orderSeasons, pickActiveSeason } from '../lib/seasons'

const WINDOWS: EraWindow[] = ['this', 'last2', 'last3', 'all']

function personPitchers(pitcher: Pitcher, all: Pitcher[]): Pitcher[] {
  if (!pitcher.linkGroupId) return [pitcher]
  const linked = all.filter((p) => p.linkGroupId === pitcher.linkGroupId)
  return linked.length > 0 ? linked : [pitcher]
}

export function PitcherEra({ pitcher }: { pitcher: Pitcher }) {
  const allPitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const seasons = useLiveQuery(() => db.seasons.toArray(), [])
  const games = useLiveQuery(() => db.games.toArray(), [])
  const atBats = useLiveQuery(() => db.atBats.toArray(), [])
  const earnedRuns = useLiveQuery(() => db.earnedRuns.toArray(), [])
  const [eraWindow, setEraWindow] = useState<EraWindow>('this')

  const anchor = seasons?.find((s) => s.id === pitcher.seasonId)
  const active = seasons ? pickActiveSeason(seasons) : undefined

  const lines = useMemo(() => {
    if (!allPitchers || !seasons || !games || !atBats || !earnedRuns || !anchor) return null
    const entries = personPitchers(pitcher, allPitchers)
    const ids = new Set(entries.map((p) => p.id))
    const bySeason = orderSeasons(
      seasons.filter((s) => entries.some((p) => p.seasonId === s.id)),
      games,
    )
    return bySeason.map((season) => {
      const gameIds = gameIdsForSeasons(games, new Set([season.id]))
      return {
        season,
        outs: sumOuts(atBats, ids, gameIds),
        er: sumEarnedRuns(earnedRuns, ids, gameIds),
        entries: entries.filter((p) => p.seasonId === season.id),
      }
    })
  }, [allPitchers, seasons, games, atBats, earnedRuns, anchor, pitcher])

  if (!allPitchers || !seasons || !games || !atBats || !earnedRuns) return null
  if (!anchor || !lines) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>This pitcher isn’t in a season yet, so ERA can’t be calculated.</p>
      </div>
    )
  }

  const inWindow = new Set(seasonsInWindow(seasons, games, anchor.id, eraWindow).map((s) => s.id))
  const factor = eraFactorForWindow(eraWindow, active, anchor)
  const totals = lines.reduce(
    (acc, line) => {
      if (!inWindow.has(line.season.id)) return acc
      return { outs: acc.outs + line.outs, er: acc.er + line.er }
    },
    { outs: 0, er: 0 },
  )
  const combined = eraWindow !== 'this'
  const factorSeason: Season | undefined = combined ? (active ?? anchor) : anchor

  const others = personPitchers(pitcher, allPitchers).filter((p) => p.id !== pitcher.id)

  return (
    <section>
      <h2>ERA</h2>
      <label htmlFor="era-window">Range</label>
      <select id="era-window" value={eraWindow} onChange={(e) => setEraWindow(e.target.value as EraWindow)}>
        {WINDOWS.map((w) => (
          <option key={w} value={w}>{ERA_WINDOW_LABELS[w]}</option>
        ))}
      </select>
      <div className="card">
        <div className="muted">{ERA_WINDOW_LABELS[eraWindow]}</div>
        <div className="era-figure">{formatEra(totals.er, totals.outs, factor)}</div>
        <div>
          {formatInningsPitched(totals.outs)} IP · {totals.er} ER
        </div>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          {combined
            ? `Combined ERA uses ${factorSeason?.name ?? 'the active season'}’s ${factor}-inning factor (earned runs × ${factor} ÷ IP).`
            : `This line uses ${anchor.name}’s ${factor}-inning factor.`}
          {' '}Every game counts. IP is outs ÷ 3, shown in baseball thirds (0.1, 0.2, 1.0).
        </p>
      </div>

      <h3>By season</h3>
      <p className="muted">Each row uses that season’s own 6, 7, or 9.</p>
      <div className="list">
        {[...lines].reverse().map((line) => (
          <div key={line.season.id} className="list-item">
            <div className="grow">
              <div>
                {line.season.name}{' '}
                {line.season.active && <span className="pill">Active</span>}
                {inWindow.has(line.season.id) && eraWindow !== 'all' && <span className="pill">In this range</span>}
              </div>
              <div className="muted">
                {line.season.eraInnings}-inning · {formatInningsPitched(line.outs)} IP · {line.er} ER
                {line.entries.length > 1 ? ` · ${line.entries.length} roster entries` : ''}
              </div>
            </div>
            <span className="era-row">{formatEra(line.er, line.outs, line.season.eraInnings)}</span>
          </div>
        ))}
      </div>

      <div className="card stack">
        <strong>Same player</strong>
        {others.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Not linked to another roster entry. Importing this pitcher into another season links them automatically.
          </p>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Career ERA above includes {others.map((p) => {
                const season = seasons.find((s) => s.id === p.seasonId)
                return `${fullName(p)}${p.number ? ` #${p.number}` : ''} (${season?.name ?? 'no season'})`
              }).join(', ')}.
            </p>
            <button
              type="button"
              className="small"
              onClick={() => {
                if (confirm(`Unlink ${displayName(pitcher)} from the other roster entries? Their stats stay put.`)) {
                  void unlinkPitcherRecord(pitcher.id)
                }
              }}
            >
              Unlink this roster entry
            </button>
          </>
        )}
      </div>
    </section>
  )
}
