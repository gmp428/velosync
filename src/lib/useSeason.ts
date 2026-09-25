import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Season } from '../db'
import { pickActiveSeason } from './seasons'

export function useSeasonList(): { seasons: Season[] | undefined; active: Season | undefined } {
  const seasons = useLiveQuery(() => db.seasons.toArray(), [])
  return { seasons, active: seasons ? pickActiveSeason(seasons) : undefined }
}
