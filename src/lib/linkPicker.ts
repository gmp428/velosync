// Season + name filtering for the pitcher Link control and the batter
// cross-team link picker. Link/unlink still writes linkGroupId elsewhere;
// this module only decides who is on screen.

export interface LinkPickPerson {
  id: string
  firstName?: string
  lastName?: string
  name?: string
  number?: string
  /** Season this roster entry belongs to. Missing = not tagged to a season. */
  seasonId?: string
  teamId?: string
  teamName?: string
}

/**
 * Case-insensitive partial match on first and/or last name.
 * Each word the coach types must appear in the first name, the last name,
 * or a legacy single-name field. "jo smi" matches John Smith.
 */
export function nameMatchesQuery(
  person: { firstName?: string; lastName?: string; name?: string },
  query: string,
): boolean {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return true
  const first = (person.firstName ?? '').toLowerCase()
  const last = (person.lastName ?? '').toLowerCase()
  const legacy = (person.name ?? '').toLowerCase()
  return trimmed.split(/\s+/).every((tok) => first.includes(tok) || last.includes(tok) || legacy.includes(tok))
}

/**
 * `seasonId` undefined = no season catalog, so everyone is in scope.
 * `seasonId` '' = the "No season" bucket (rows that were never tagged).
 * Pitchers with no seasonId are on every season's staff when
 * `includeUnassignedStaff` is set.
 */
export function personInSelectedSeason(
  person: { seasonId?: string },
  seasonId: string | undefined,
  includeUnassignedStaff: boolean,
): boolean {
  if (seasonId === undefined) return true
  if (!seasonId) return !person.seasonId
  if (person.seasonId === seasonId) return true
  return includeUnassignedStaff && !person.seasonId
}

/**
 * Active season when it actually has someone to link. Otherwise the first
 * season in `seasonsNewestFirst` that does. Batters who were never tagged
 * land in the "No season" bucket (`''`) when no named season has them.
 */
export function defaultLinkSeasonId(
  seasonsNewestFirst: { id: string }[],
  activeSeasonId: string | undefined,
  people: LinkPickPerson[],
  includeUnassignedStaff: boolean,
): string {
  const has = (id: string) => people.some((p) => personInSelectedSeason(p, id, includeUnassignedStaff))
  if (activeSeasonId && seasonsNewestFirst.some((s) => s.id === activeSeasonId) && has(activeSeasonId)) {
    return activeSeasonId
  }
  const withPeople = seasonsNewestFirst.find((s) => has(s.id))
  if (withPeople) return withPeople.id
  if (!includeUnassignedStaff && people.some((p) => !p.seasonId)) return ''
  if (activeSeasonId && seasonsNewestFirst.some((s) => s.id === activeSeasonId)) return activeSeasonId
  return seasonsNewestFirst[0]?.id ?? ''
}

function compareLinkPeople(a: LinkPickPerson, b: LinkPickPerson): number {
  const last = (p: LinkPickPerson) => (p.lastName || p.name || p.firstName || '').toLowerCase()
  const byLast = last(a).localeCompare(last(b), undefined, { sensitivity: 'base' })
  if (byLast !== 0) return byLast
  return (a.firstName ?? '').localeCompare(b.firstName ?? '', undefined, { sensitivity: 'base' })
}

export function filterLinkPeople(
  people: LinkPickPerson[],
  opts: {
    seasonId: string | undefined
    includeUnassignedStaff: boolean
    teamId?: string | null
    query: string
  },
): LinkPickPerson[] {
  return people
    .filter((p) => personInSelectedSeason(p, opts.seasonId, opts.includeUnassignedStaff))
    .filter((p) => !opts.teamId || p.teamId === opts.teamId)
    .filter((p) => nameMatchesQuery(p, opts.query))
    .sort(compareLinkPeople)
}

/** Teams that have at least one linkable person in the selected season. */
export function linkTeamsForSeason(
  people: LinkPickPerson[],
  seasonId: string | undefined,
): { id: string; name: string }[] {
  const names = new Map<string, string>()
  for (const person of people) {
    if (!person.teamId) continue
    if (!personInSelectedSeason(person, seasonId, false)) continue
    if (!names.has(person.teamId)) names.set(person.teamId, person.teamName?.trim() || 'Team')
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}
