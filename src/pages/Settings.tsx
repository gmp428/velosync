import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ImportFromFile } from '../components/ImportFromFile'
import { SeasonForm } from '../components/SeasonForm'
import {
  CAPTURE_PRESETS, LIVE_CAPTURE_FLAGS, assignUnscopedToSeason, countUnscopedSeasonRows, createSeason, db,
  deleteSeasonIfEmpty, exportAll, getSettings, newId, now, pendingSync, saveSettings, setActiveSeason,
  updateSeason,
  type CaptureFlags, type Season,
} from '../db'
import { formatSeasonDates, orderSeasons, pickActiveSeason } from '../lib/seasons'
import { introEnabled, setIntroEnabled } from '../lib/intro'

const PRESETS: Array<{ key: 'quick' | 'standard' | 'detailed'; label: string; blurb: string }> = [
  { key: 'quick', label: 'Quick', blurb: 'Fewest taps — pitch, spot, ball/strike/foul, out or hit.' },
  { key: 'standard', label: 'Standard', blurb: 'Called vs swinging strikes and full hit types (default).' },
  { key: 'detailed', label: 'Detailed', blurb: 'Everything, including advanced capture as it ships.' },
]

const CAPTURE_LABELS: Array<{ key: keyof CaptureFlags; label: string; help: string }> = [
  { key: 'strikeType', label: 'Strike detail', help: 'Distinguish called vs swinging strikes.' },
  { key: 'inPlayDetail', label: 'Hit detail', help: 'Log single / double / triple / HR / error (vs just Out / Hit).' },
  { key: 'granularZones', label: 'Granular foul zones', help: 'Split each out-of-zone strip into thirds, plus the 4 corners (25 zones total instead of 13).' },
  { key: 'intendedLocation', label: 'Intended location', help: 'Adds one extra tap per pitch: mark where the catcher/pitcher were aiming before logging where it actually went. Unlocks command % and miss-tendency reports.' },
  { key: 'fieldPosition', label: 'Ball-in-play location', help: 'Field diamond — where the ball was hit.' },
  { key: 'battedBallType', label: 'Batted-ball type', help: 'Ground/fly/line, bunt, hard/soft hit, fielder’s choice.' },
]

export default function Settings() {
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const seasons = useLiveQuery(() => db.seasons.toArray(), [])
  const games = useLiveQuery(() => db.games.toArray(), [])
  const unscoped = useLiveQuery(() => countUnscopedSeasonRows(), [])
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null)
  const [createKey, setCreateKey] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [newName, setNewName] = useState('')
  const [introOn, setIntroOn] = useState(() => introEnabled())

  const selectPreset = (key: 'quick' | 'standard' | 'detailed') =>
    saveSettings({ preset: key, capture: { ...CAPTURE_PRESETS[key] } })

  const toggleFlag = (key: keyof CaptureFlags) => {
    if (!settings) return
    saveSettings({ preset: 'custom', capture: { ...settings.capture, [key]: !settings.capture[key] } })
  }

  const addType = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    await db.pitchTypes.add({ id: newId(), name, abbr: name.slice(0, 2).toUpperCase(), updatedAt: now(), ...pendingSync() })
    setNewName('')
  }

  const renameType = async (id: string, current: string) => {
    const name = prompt('New name for this pitch type:', current)?.trim()
    if (name) await db.pitchTypes.update(id, { name, updatedAt: now(), ...pendingSync() })
  }

  const removeType = async (id: string) => {
    const used = await db.pitches.filter((p) => p.pitchTypeId === id).count()
    if (used > 0) {
      alert(`This pitch type is used by ${used} logged pitches, so it can’t be deleted.`)
      return
    }
    if (confirm('Delete this pitch type?')) await db.pitchTypes.delete(id)
  }

  const doExport = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pitch-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!pitchTypes || !settings || !seasons || !games || unscoped === undefined) return null

  const active = pickActiveSeason(seasons)
  const ordered = [...orderSeasons(seasons, games)].reverse()

  const removeSeason = async (season: Season) => {
    if (!confirm(`Delete “${season.name}”? Only empty seasons can be deleted.`)) return
    const ok = await deleteSeasonIfEmpty(season.id)
    if (!ok) alert('This season still has teams, pitchers, or games, so it stays.')
  }

  return (
    <main>
      <h1>Settings</h1>

      <h2>Seasons</h2>
      <p className="muted">
        Teams, pitchers, and games belong to a season. One season is active — you switch it here.
        Creating or activating a season does not archive the others, and a new season starts empty until you add or import into it.
      </p>
      {active ? (
        <p className="muted">Active now: <strong style={{ color: 'var(--text)' }}>{active.name}</strong> · {active.eraInnings}-inning ERA</p>
      ) : (
        <p className="warning">No season is active. Set one below to work in it.</p>
      )}
      {unscoped > 0 && active && (
        <div className="card stack">
          <p style={{ margin: 0 }}>
            {unscoped} team, pitcher, or game {unscoped === 1 ? 'record is' : 'records are'} not in a season yet.
          </p>
          <button type="button" className="primary" onClick={() => assignUnscopedToSeason(active.id)}>
            Put them in {active.name}
          </button>
        </div>
      )}
      <div className="list">
        {ordered.map((season) => (
          <div key={season.id} className="card stack" style={{ margin: 0 }}>
            {editingSeasonId === season.id ? (
              <SeasonForm
                key={season.updatedAt}
                initialName={season.name}
                initialStart={season.startDate ?? ''}
                initialEnd={season.endDate ?? ''}
                initialEra={season.eraInnings}
                submitLabel="Save season"
                onCancel={() => setEditingSeasonId(null)}
                onSubmit={async (value) => {
                  await updateSeason(season.id, value)
                  setEditingSeasonId(null)
                }}
              />
            ) : (
              <>
                <div className="row spread">
                  <strong>{season.name}</strong>
                  {season.active && <span className="pill">Active</span>}
                </div>
                <div className="muted">
                  {formatSeasonDates(season)} · {season.eraInnings}-inning ERA
                </div>
                <div className="row">
                  {!season.active && (
                    <button type="button" className="primary small" onClick={() => setActiveSeason(season.id)}>
                      Set active
                    </button>
                  )}
                  <button type="button" className="small" onClick={() => setEditingSeasonId(season.id)}>Edit</button>
                  <button type="button" className="small danger" onClick={() => removeSeason(season)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <h3>New season</h3>
      <p className="muted">Starts empty. Import last season’s teams and pitchers after you switch to it, or add them by hand.</p>
      <div className="card">
        <SeasonForm
          key={createKey}
          showMakeActive
          submitLabel="Create season"
          onSubmit={async (value) => {
            await createSeason(value)
            setCreateKey((k) => k + 1)
          }}
        />
      </div>

      <h2>Logging detail</h2>
      <p className="muted">How much to capture per pitch. Keep it quick, or opt into more detail.</p>
      <div className="chips">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`chip ${settings.preset === p.key ? 'on' : ''}`}
            onClick={() => selectPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        {settings.preset === 'custom' && <span className="chip on">Custom</span>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {settings.preset === 'custom'
          ? 'Custom — individual fields set below.'
          : PRESETS.find((p) => p.key === settings.preset)?.blurb}
      </p>

      <button className="small" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? 'Hide advanced' : 'Advanced — pick individual fields'}
      </button>
      {showAdvanced && (
        <div className="list" style={{ marginTop: 8 }}>
          {CAPTURE_LABELS.map(({ key, label, help }) => {
            const live = LIVE_CAPTURE_FLAGS.includes(key)
            const on = settings.capture[key]
            return (
              <div key={key} className="list-item" style={{ opacity: live ? 1 : 0.6 }}>
                <div className="grow">
                  <div>{label} {!live && <span className="pill">coming soon</span>}</div>
                  <div className="muted">{help}</div>
                </div>
                <button
                  className={`chip small-chip ${on ? 'on' : ''}`}
                  disabled={!live}
                  onClick={() => toggleFlag(key)}
                >
                  {on ? 'On' : 'Off'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <h2>Pitch types</h2>
      <div className="list">
        {pitchTypes.map((t) => (
          <div key={t.id} className="list-item">
            <span className="grow">{t.name}</span>
            <button className="small" onClick={() => renameType(t.id, t.name)}>Rename</button>
            <button className="small danger" onClick={() => removeType(t.id)}>✕</button>
          </div>
        ))}
      </div>
      <form onSubmit={addType} className="row">
        <input
          className="grow"
          placeholder="New pitch type"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="New pitch type"
        />
        <button type="submit" className="primary">Add</button>
      </form>

      <h2>Backup and import</h2>
      <p className="muted">
        All data lives on this device. Nothing is sent off the phone until cloud sync exists.
        Export a backup, or import a JSON file of seasons, teams, pitchers, games, pitches, earned runs, and person links.
        Import replaces what is on this device. It does not merge.
      </p>
      <div className="row">
        <button className="primary grow" onClick={doExport}>Export backup</button>
        <ImportFromFile className="grow" />
      </div>

      <h2>Opening splash</h2>
      <p className="muted">Plays each time you open the app. Turn it off to go straight to Home.</p>
      <div className="list-item">
        <span className="grow">Show intro</span>
        <button
          type="button"
          className={`chip small-chip ${introOn ? 'on' : ''}`}
          aria-pressed={introOn}
          onClick={() => {
            const next = !introOn
            setIntroEnabled(next)
            setIntroOn(next)
          }}
        >
          {introOn ? 'On' : 'Off'}
        </button>
      </div>

      <h2>About</h2>
      <p className="muted">
        VeloSync — log every pitch by type, location, and result to build scouting reports
        on opposing batters and find the right pitch for each matchup.
      </p>
    </main>
  )
}
