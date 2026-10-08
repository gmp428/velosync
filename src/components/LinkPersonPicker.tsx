import { useId, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, fullName } from '../db'
import {
  defaultLinkSeasonId,
  filterLinkPeople,
  linkTeamsForSeason,
  type LinkPickPerson,
} from '../lib/linkPicker'
import { orderSeasons } from '../lib/seasons'
import { useSeasonList } from '../lib/useSeason'

/**
 * Shared person picker for pitcher Link and batter cross-team link.
 * Starts on a season (the active one when that season has someone to link),
 * then lists only that season. Batters drill into teams. A name box filters
 * first and/or last name as the coach types.
 */
export default function LinkPersonPicker({
  mode,
  people,
  commitLabel,
  onSelect,
}: {
  mode: 'pitcher' | 'batter'
  people: LinkPickPerson[]
  /** When set, each person row gets this button. Otherwise the row itself picks. */
  commitLabel?: string
  onSelect: (personId: string) => void
}) {
  const { seasons, active } = useSeasonList()
  const games = useLiveQuery(() => db.games.toArray(), [])
  const [seasonOverride, setSeasonOverride] = useState<string | undefined>(undefined)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const seasonFieldId = useId()
  const searchFieldId = useId()

  const groupByTeam = mode === 'batter'
  const includeUnassignedStaff = mode === 'pitcher'

  const ordered = useMemo(
    () => (seasons && games ? [...orderSeasons(seasons, games)].reverse() : []),
    [seasons, games],
  )

  const hasSeasons = ordered.length > 0
  const selectedSeasonId = !hasSeasons
    ? undefined
    : seasonOverride !== undefined
      ? seasonOverride
      : defaultLinkSeasonId(ordered, active?.id, people, includeUnassignedStaff)

  const teams = useMemo(
    () => (groupByTeam ? linkTeamsForSeason(people, selectedSeasonId) : []),
    [groupByTeam, people, selectedSeasonId],
  )
  const openTeam = teamId ? teams.find((t) => t.id === teamId) : undefined
  const searching = query.trim().length > 0
  const showingTeams = groupByTeam && !openTeam && !searching
  const visiblePeople = useMemo(
    () => filterLinkPeople(people, {
      seasonId: selectedSeasonId,
      includeUnassignedStaff,
      teamId: showingTeams ? null : openTeam?.id,
      query,
    }),
    [people, selectedSeasonId, includeUnassignedStaff, showingTeams, openTeam?.id, query],
  )
  const showUnassigned = groupByTeam && people.some((p) => !p.seasonId)
  const mixedStaff = includeUnassignedStaff && people.some((p) => p.seasonId) && people.some((p) => !p.seasonId)

  if (!seasons || !games) return null

  const chooseSeason = (id: string) => {
    setSeasonOverride(id)
    setTeamId(null)
  }

  const personLabel = (person: LinkPickPerson) =>
    `${person.number ? `#${person.number} ` : ''}${fullName(person)}`

  return (
    <div className="stack">
      {hasSeasons && (
        <div>
          <label htmlFor={seasonFieldId}>Season</label>
          <select
            id={seasonFieldId}
            value={selectedSeasonId ?? ''}
            onChange={(e) => chooseSeason(e.target.value)}
          >
            {ordered.map((season) => (
              <option key={season.id} value={season.id}>{season.name}</option>
            ))}
            {showUnassigned && <option value="">No season</option>}
          </select>
        </div>
      )}

      <div>
        <label htmlFor={searchFieldId}>Search by name</label>
        <input
          id={searchFieldId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          placeholder="First or last name"
          autoComplete="off"
          autoCapitalize="off"
        />
      </div>

      {showingTeams ? (
        teams.length === 0 ? (
          <p className="empty">No other teams in this season.</p>
        ) : (
          <div className="list" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className="list-item"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => setTeamId(team.id)}
              >
                <span className="grow">{team.name}</span>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          {openTeam && (
            <div className="row spread">
              <button type="button" className="small" onClick={() => setTeamId(null)}>‹ Teams</button>
              <strong>{openTeam.name}</strong>
            </div>
          )}
          {visiblePeople.length === 0 ? (
            <p className="empty">
              {searching
                ? 'No players match that name.'
                : groupByTeam
                  ? 'No linkable players on this team.'
                  : 'No pitchers in this season.'}
            </p>
          ) : (
            <div className="list" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {visiblePeople.map((person) => {
                const label = personLabel(person)
                const teamHint = groupByTeam && !openTeam ? person.teamName : undefined
                const staffHint = mixedStaff && !person.seasonId ? 'All seasons' : undefined
                const detail = [teamHint, staffHint].filter(Boolean).join(' · ')
                if (commitLabel) {
                  return (
                    <div key={person.id} className="list-item">
                      <span className="grow">
                        {label}
                        {detail && <span className="muted"> · {detail}</span>}
                      </span>
                      <button type="button" className="primary" onClick={() => onSelect(person.id)}>
                        {commitLabel}
                      </button>
                    </div>
                  )
                }
                return (
                  <button
                    key={person.id}
                    type="button"
                    className="list-item"
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => onSelect(person.id)}
                  >
                    <span className="grow">
                      {label}
                      {detail && <span className="muted"> · {detail}</span>}
                    </span>
                    <span className="chev">›</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
