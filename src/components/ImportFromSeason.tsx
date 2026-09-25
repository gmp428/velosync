import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, displayName, importBattersToTeam, importPitchersToSeason,
  type Batter, type Pitcher,
} from '../db'
import { formatSeasonDates } from '../lib/seasons'

type Mode =
  | { kind: 'pitchers'; targetSeasonId: string }
  | { kind: 'new-team'; targetSeasonId: string }
  | { kind: 'onto-team'; targetSeasonId: string; targetOpponentId: string }

interface Row {
  id: string
  label: string
  who: string
  number: string
  linkGroupId?: string
  sortIndex: number
}

function pitcherRow(p: Pitcher): Row {
  return {
    id: p.id,
    label: `${p.number ? `#${p.number} ` : ''}${displayName(p)} · throws ${p.throws}`,
    who: displayName(p),
    number: p.number ?? '',
    linkGroupId: p.linkGroupId,
    sortIndex: 0,
  }
}

function batterRow(b: Batter): Row {
  return {
    id: b.id,
    label: `${b.number ? `#${b.number} ` : ''}${displayName(b)} · bats ${b.bats}`,
    who: displayName(b),
    number: b.number ?? '',
    linkGroupId: b.linkGroupId,
    sortIndex: b.sortIndex ?? 0,
  }
}

export function ImportFromSeason({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const seasons = useLiveQuery(() => db.seasons.toArray(), [])
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const batters = useLiveQuery(() => db.batters.toArray(), [])

  const [sourceSeasonId, setSourceSeasonId] = useState('')
  const [sourceOpponentId, setSourceOpponentId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [teamName, setTeamName] = useState('')
  const [step, setStep] = useState<'choose' | 'jerseys'>('choose')
  const [numbers, setNumbers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const otherSeasons = useMemo(
    () => (seasons ?? []).filter((s) => s.id !== mode.targetSeasonId).sort((a, b) => b.createdAt - a.createdAt),
    [seasons, mode.targetSeasonId],
  )
  const sourceTeams = useMemo(
    () => (opponents ?? [])
      .filter((o) => o.seasonId === sourceSeasonId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [opponents, sourceSeasonId],
  )

  const rows: Row[] = useMemo(() => {
    if (mode.kind === 'pitchers') {
      return (pitchers ?? [])
        .filter((p) => p.seasonId === sourceSeasonId)
        .sort((a, b) => displayName(a).localeCompare(displayName(b)))
        .map(pitcherRow)
    }
    if (!sourceOpponentId) return []
    return (batters ?? [])
      .filter((b) => b.opponentId === sourceOpponentId)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map(batterRow)
  }, [mode.kind, pitchers, batters, sourceSeasonId, sourceOpponentId])

  const ready = Boolean(seasons && opponents && pitchers && batters)
  const title = mode.kind === 'pitchers'
    ? 'Import pitchers'
    : mode.kind === 'new-team'
      ? 'Import opposing team'
      : 'Import players'

  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = (on: boolean) => {
    setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())
  }

  const pickSeason = (id: string) => {
    setSourceSeasonId(id)
    setSourceOpponentId('')
    setSelected(new Set())
    setTeamName('')
    setError(null)
  }

  const pickTeam = (id: string) => {
    setSourceOpponentId(id)
    const team = sourceTeams.find((t) => t.id === id)
    setTeamName(team?.name ?? '')
    const roster = (batters ?? []).filter((b) => b.opponentId === id)
    // Clone starts as the whole roster; uncheck anyone to leave behind.
    setSelected(new Set(roster.map((b) => b.id)))
    setError(null)
  }

  const goToJerseys = () => {
    if (selected.size === 0) {
      setError('Select at least one player.')
      return
    }
    if (mode.kind === 'new-team' && !teamName.trim()) {
      setError('Name the team in this season.')
      return
    }
    const initial: Record<string, string> = {}
    for (const row of rows) {
      if (selected.has(row.id)) initial[row.id] = row.number
    }
    setNumbers(initial)
    setError(null)
    setStep('jerseys')
  }

  const alreadyNote = (row: Row): string | null => {
    if (!row.linkGroupId) return null
    if (mode.kind === 'pitchers') {
      const hit = (pitchers ?? []).find((p) => p.seasonId === mode.targetSeasonId && p.linkGroupId === row.linkGroupId)
      return hit ? 'Already on this season’s staff — this adds another roster entry for the same player.' : null
    }
    const sameSeasonTeams = new Set(
      (opponents ?? []).filter((o) => o.seasonId === mode.targetSeasonId).map((o) => o.id),
    )
    const hits = (batters ?? []).filter((b) => b.linkGroupId === row.linkGroupId && sameSeasonTeams.has(b.opponentId))
    if (hits.length === 0) return null
    const names = hits.map((b) => (opponents ?? []).find((o) => o.id === b.opponentId)?.name ?? 'a team')
    return `Already on ${[...new Set(names)].join(', ')} this season — this adds another roster entry for the same player.`
  }

  const save = async () => {
    const picks = rows
      .filter((r) => selected.has(r.id))
      .map((r) => ({ sourceId: r.id, number: numbers[r.id] ?? r.number }))
    if (picks.length === 0) return
    setSaving(true)
    setError(null)
    try {
      if (mode.kind === 'pitchers') {
        await importPitchersToSeason(mode.targetSeasonId, picks)
      } else if (mode.kind === 'new-team') {
        const entire = rows.length > 0 && picks.length === rows.length
        await importBattersToTeam({
          targetSeasonId: mode.targetSeasonId,
          newTeamName: teamName,
          cloneGhostFromOpponentId: entire ? sourceOpponentId : null,
          picks,
        })
      } else {
        await importBattersToTeam({
          targetSeasonId: mode.targetSeasonId,
          targetOpponentId: mode.targetOpponentId,
          picks,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card stack" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <strong>{title}</strong>
          <button type="button" className="small" onClick={onClose}>Close</button>
        </div>
        {!ready ? null : otherSeasons.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            There’s no other season to import from yet. Create one in Settings, switch to it, then come back.
          </p>
        ) : step === 'choose' ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {mode.kind === 'pitchers'
                ? 'Imported pitchers join this season’s staff and stay linked to the same player. Add someone new by hand if they weren’t here last season.'
                : 'Clone a whole roster or uncheck players to leave them behind. Everyone imported stays linked to the same player.'}
            </p>
            <div>
              <label>From season</label>
              <select value={sourceSeasonId} onChange={(e) => pickSeason(e.target.value)}>
                <option value="">Select a season</option>
                {otherSeasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatSeasonDates(s)})
                  </option>
                ))}
              </select>
            </div>
            {mode.kind !== 'pitchers' && sourceSeasonId && (
              <div>
                <label>Team</label>
                {sourceTeams.length === 0 ? (
                  <p className="empty">No opposing teams in that season.</p>
                ) : (
                  <div className="chips">
                    {sourceTeams.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`chip ${sourceOpponentId === t.id ? 'on' : ''}`}
                        onClick={() => pickTeam(t.id)}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {mode.kind === 'new-team' && sourceOpponentId && (
              <div>
                <label>Team name this season</label>
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              </div>
            )}
            {rows.length > 0 && (
              <>
                <div className="row spread">
                  <span className="muted">{selected.size} of {rows.length} selected</span>
                  <button type="button" className="small" onClick={() => selectAll(selected.size !== rows.length)}>
                    {selected.size === rows.length ? 'Clear' : mode.kind === 'pitchers' ? 'Select all' : 'Entire team'}
                  </button>
                </div>
                <div className="list">
                  {rows.map((row) => (
                    <label key={row.id} className="list-item">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        style={{ width: 20, height: 20, flexShrink: 0 }}
                      />
                      <span className="grow">{row.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            {sourceSeasonId && mode.kind === 'pitchers' && rows.length === 0 && (
              <p className="empty">No pitchers in that season.</p>
            )}
            {error && <p className="warning" style={{ margin: 0 }}>{error}</p>}
            <button type="button" className="primary" disabled={selected.size === 0} onClick={goToJerseys}>
              Review jersey numbers
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Jersey numbers often change from season to season. These are filled in from last season — edit any that are different, then confirm.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Import links each player to the same person. Unlink later if that’s a mistake.
            </p>
            <div className="list">
              {rows.filter((r) => selected.has(r.id)).map((row) => {
                const note = alreadyNote(row)
                return (
                  <div key={row.id} className="stack" style={{ gap: 4 }}>
                    <div className="row">
                      <span className="grow">{row.who}</span>
                      <div style={{ width: 72 }}>
                        <input
                          aria-label={`Jersey number for ${row.label}`}
                          value={numbers[row.id] ?? ''}
                          inputMode="numeric"
                          onChange={(e) => setNumbers((cur) => ({ ...cur, [row.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                    {note && <p className="warning" style={{ margin: 0 }}>{note}</p>}
                  </div>
                )
              })}
            </div>
            {error && <p className="warning" style={{ margin: 0 }}>{error}</p>}
            <div className="row">
              <button type="button" className="primary grow" disabled={saving} onClick={save}>
                {saving ? 'Importing…' : `Import ${selected.size}`}
              </button>
              <button type="button" disabled={saving} onClick={() => { setStep('choose'); setError(null) }}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
