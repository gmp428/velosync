import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CAPTURE_PRESETS, LIVE_CAPTURE_FLAGS, db, exportAll, getSettings, importAll, newId, now, saveSettings,
  type BackupFile, type CaptureFlags,
} from '../db'

const PRESETS: Array<{ key: 'quick' | 'standard' | 'detailed'; label: string; blurb: string }> = [
  { key: 'quick', label: 'Quick', blurb: 'Fewest taps — pitch, spot, ball/strike/foul, out or hit.' },
  { key: 'standard', label: 'Standard', blurb: 'Called vs swinging strikes and full hit types (default).' },
  { key: 'detailed', label: 'Detailed', blurb: 'Everything, including advanced capture as it ships.' },
]

const CAPTURE_LABELS: Array<{ key: keyof CaptureFlags; label: string; help: string }> = [
  { key: 'strikeType', label: 'Strike detail', help: 'Distinguish called vs swinging strikes.' },
  { key: 'inPlayDetail', label: 'Hit detail', help: 'Log single / double / triple / HR / error (vs just Out / Hit).' },
  { key: 'inning', label: 'Inning tags', help: 'Tag each pitch by inning (top / bottom).' },
  { key: 'intendedLocation', label: 'Intended location', help: 'Record the target spot vs where it finished.' },
  { key: 'fieldPosition', label: 'Ball-in-play location', help: 'Field diamond — where the ball was hit.' },
  { key: 'hbp', label: 'Hit-by-pitch', help: 'HBP as a pitch outcome.' },
  { key: 'battedBallType', label: 'Batted-ball type', help: 'Ground/fly/line, bunt, hard/soft hit, fielder’s choice.' },
]

export default function Settings() {
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [newName, setNewName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

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
    await db.pitchTypes.add({ id: newId(), name, abbr: name.slice(0, 2).toUpperCase(), updatedAt: now() })
    setNewName('')
  }

  const renameType = async (id: string, current: string) => {
    const name = prompt('New name for this pitch type:', current)?.trim()
    if (name) await db.pitchTypes.update(id, { name, updatedAt: now() })
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

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupFile
      if (!confirm(`Replace ALL current data with the backup from ${new Date(data.exportedAt).toLocaleString()}? This cannot be undone.`)) return
      await importAll(data)
      alert('Backup restored.')
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  if (!pitchTypes || !settings) return null

  return (
    <main>
      <h1>Settings</h1>

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

      <h2>Backup</h2>
      <p className="muted">
        All data lives on this device. Export a backup file every so often (and before switching phones),
        then import it to restore.
      </p>
      <div className="row">
        <button className="primary grow" onClick={doExport}>Export backup</button>
        <button className="grow" onClick={() => fileInput.current?.click()}>Import backup</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
        />
      </div>

      <h2>About</h2>
      <p className="muted">
        VeloSync — log every pitch by type, location, and result to build scouting reports
        on opposing batters and find the right pitch for each matchup.
      </p>
    </main>
  )
}
