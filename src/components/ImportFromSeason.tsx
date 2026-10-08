import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, displayName, importBattersToTeam, importPitchersToSeason,
  type Batter, type Pitcher,
} from '../db'
import LinkPersonPicker from './LinkPersonPicker'
import type { LinkPickPerson } from '../lib/linkPicker'
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

function pitcherPerson(p: Pitcher): LinkPickPerson {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    name: p.name,
    number: p.number,
    seasonId: p.seasonId,
  }
}

function batterPerson(b: Batter, seasonId: string, teamName: string): LinkPickPerson {
  return {
    id: b.id,
    firstName: b.firstName,
    lastName: b.lastName,
    name: b.name,
    number: b.number,
    seasonId,
    teamId: b.opponentId,
    teamName,
  }
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

  // Pitchers and "onto this team" use the shared season/team/name picker and
  // can select people from more than one team. The whole-team clone still
  // lists just the team the coach picked.
  const catalog = useMemo(() => {
    const empty = { rows: [] as Row[], people: [] as LinkPickPerson[] }
    if (mode.kind === 'pitchers') {
      const list = (pitchers ?? [])
        .filter((p) => p.seasonId && p.seasonId !== mode.targetSeasonId)
        .sort((a, b) => displayName(a).localeCompare(displayName(b)))
      return {
        rows: list.map(pitcherRow),
        people: list.map(pitcherPerson),
      }
    }
    if (mode.kind === 'onto-team') {
      const oppById = new Map((opponents ?? []).map((o) => [o.id, o]))
      const list = (batters ?? []).filter((b) => {
        const seasonId = oppById.get(b.opponentId)?.seasonId
        return Boolean(seasonId && seasonId !== mode.targetSeasonId)
      }).sort((a, b) => displayName(a).localeCompare(displayName(b)))
      return {
        rows: list.map(batterRow),
        people: list.flatMap((b) => {
          const team = oppById.get(b.opponentId)
          if (!team?.seasonId) return []
          return [batterPerson(b, team.seasonId, team.name)]
        }),
      }
    }
    if (!sourceOpponentId) return empty
    return {
      rows: (batters ?? [])
        .filter((b) => b.opponentId === sourceOpponentId)
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        .map(batterRow),
      people: empty.people,
    }
  }, [mode.kind, mode.targetSeasonId, pitchers, batters, opponents, sourceOpponentId])
  const rows = catalog.rows
  const importPeople = catalog.people
  const usesPicker = mode.kind === 'pitchers' || mode.kind === 'onto-team'

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
    const picked = rows.filter((row) => selected.has(row.id))
    if (picked.length === 0) {
      setError('Select at least one player.')
      return
    }
    if (mode.kind === 'new-team' && !teamName.trim()) {
      setError('Name the team in this season.')
      return
    }
    const initial: Record<string, string> = {}
    for (const row of picked) initial[row.id] = row.number
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
          usesPicker ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                {mode.kind === 'pitchers'
                  ? 'Pick a season and search by first or last name. Check everyone to add to this staff. Jersey numbers are next, and each pitcher stays linked to the same player.'
                  : 'Pick a season, open a team, and search by first or last name. Check everyone to add to this roster. Jersey numbers are next, and each player stays linked to the same player.'}
              </p>
              <LinkPersonPicker
                mode={mode.kind === 'pitchers' ? 'pitcher' : 'batter'}
                people={importPeople}
                excludeSeasonIds={[mode.targetSeasonId]}
                variant="import"
                selection={{ selected, onToggle: toggle }}
                onSeasonChange={() => {
                  setSelected(new Set())
                  setError(null)
                }}
              />
              <div className="row spread">
                <span className="muted">{selected.size} selected</span>
                {selected.size > 0 && (
                  <button type="button" className="small" onClick={() => setSelected(new Set())}>Clear</button>
                )}
              </div>
              {error && <p className="warning" style={{ margin: 0 }}>{error}</p>}
              <button type="button" className="primary" style={{ width: '100%' }} disabled={selected.size === 0} onClick={goToJerseys}>
                Review jersey numbers
              </button>
            </>
          ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Clone a whole roster or uncheck players to leave them behind. Everyone imported stays linked to the same player.
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
            {sourceSeasonId && (
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
            {sourceOpponentId && (
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
                    {selected.size === rows.length ? 'Clear' : 'Entire team'}
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
            {error && <p className="warning" style={{ margin: 0 }}>{error}</p>}
            <button type="button" className="primary" disabled={selected.size === 0} onClick={goToJerseys}>
              Review jersey numbers
            </button>
          </>
          )
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
