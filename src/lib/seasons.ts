import type { Game, Season } from '../db'

/** The one season the coach is working in. If more than one is flagged, the latest write wins. */
export function pickActiveSeason(seasons: Season[]): Season | undefined {
  const active = seasons.filter((s) => s.active)
  active.sort((a, b) => b.updatedAt - a.updatedAt)
  return active[0]
}

/**
 * Chronological position of a season. Prefer the coach's start date, then the
 * earliest game logged in it, then when the season record was created.
 */
export function seasonSortTime(season: Season, games: Game[]): number {
  if (season.startDate) {
    const t = Date.parse(`${season.startDate}T00:00:00`)
    if (!Number.isNaN(t)) return t
  }
  const dates = games
    .filter((g) => g.seasonId === season.id && g.date)
    .map((g) => g.date)
    .sort()
  if (dates[0]) {
    const t = Date.parse(`${dates[0]}T00:00:00`)
    if (!Number.isNaN(t)) return t
  }
  return season.createdAt
}

/** Oldest first. `createdAt` breaks exact ties. */
export function orderSeasons(seasons: Season[], games: Game[]): Season[] {
  return [...seasons].sort((a, b) => {
    const diff = seasonSortTime(a, games) - seasonSortTime(b, games)
    if (diff !== 0) return diff
    return a.createdAt - b.createdAt
  })
}

export function formatSeasonDates(season: Season): string {
  if (season.startDate && season.endDate) return `${season.startDate} – ${season.endDate}`
  if (season.startDate) return `From ${season.startDate}`
  if (season.endDate) return `Through ${season.endDate}`
  return 'No dates set'
}
