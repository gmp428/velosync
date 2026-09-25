import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ImportFromSeason } from '../components/ImportFromSeason'
import { ActiveSeasonNote, NoActiveSeason } from '../components/SeasonChrome'
import { db, displayName, fullName, linkPitcherRecords, newId, now, pendingSync, pitcherArsenal, pitcherOnStaff, unlinkPitcherRecord } from '../db'
import { useSeasonList } from '../lib/useSeason'

export default function Pitchers() {
  const { seasons, active } = useSeasonList()
  const allPitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const pitchers = allPitchers?.filter((p) => active && pitcherOnStaff(p, active.id))
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [linkTarget, setLinkTarget] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [number, setNumber] = useState('')
  const [throws, setThrows] = useState<'L' | 'R'>('R')
  const [notes, setNotes] = useState('')
  const [arsenal, setArsenal] = useState<string[] | null>(null) // null = not yet initialized

  // Default a fresh form's arsenal to every pitch type once they load
  useEffect(() => {
    if (arsenal === null && pitchTypes) setArsenal(pitchTypes.map((t) => t.id))
  }, [arsenal, pitchTypes])

  const resetForm = () => {
    setEditingId(null)
    setFirstName('')
    setLastName('')
    setNumber('')
    setThrows('R')
    setNotes('')
    setArsenal(pitchTypes?.map((t) => t.id) ?? null)
    setLinkTarget('')
  }

  const toggleArsenal = (id: string) => {
    setArsenal((a) => {
      const cur = a ?? []
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const first = firstName.trim()
    if (!first) return
    const record = {
      firstName: first,
      lastName: lastName.trim(),
      number: number.trim(),
      throws,
      notes: notes.trim(),
      pitchTypeIds: arsenal ?? [],
      updatedAt: now(),
      ...pendingSync(),
    }
    if (editingId !== null) {
      await db.pitchers.update(editingId, record)
    } else {
      if (!active) return
      await db.pitchers.add({ id: newId(), seasonId: active.id, ...record })
    }
    resetForm()
  }

  const startEdit = (pitcherId: string) => {
    const p = pitchers?.find((x) => x.id === pitcherId)
    if (!p) return
    setEditingId(pitcherId)
    setFirstName(p.firstName ?? p.name ?? '')
    setLastName(p.lastName ?? '')
    setNumber(p.number ?? '')
    setThrows(p.throws)
    setNotes(p.notes ?? '')
    setArsenal(pitcherArsenal(p, pitchTypes ?? []).map((t) => t.id))
  }

  const remove = async (pitcherId: string) => {
    const pitchCount = await db.pitches.where('pitcherId').equals(pitcherId).count()
    if (pitchCount > 0) {
      alert(`This pitcher has ${pitchCount} logged pitches. Delete is blocked to protect your data.`)
      return
    }
    if (confirm('Delete this pitcher?')) await db.pitchers.delete(pitcherId)
  }

  if (!seasons || !allPitchers || !pitchers || !pitchTypes) return null
  const arsenalSel = arsenal ?? []
  const editing = editingId ? allPitchers.find((p) => p.id === editingId) : undefined
  const linkedOthers = editing?.linkGroupId
    ? allPitchers.filter((p) => p.linkGroupId === editing.linkGroupId && p.id !== editing.id)
    : []
  const linkCandidates = editing
    ? allPitchers.filter((p) => p.id !== editing.id && (!editing.linkGroupId || p.linkGroupId !== editing.linkGroupId))
    : []
  const seasonName = (id?: string) => seasons.find((s) => s.id === id)?.name ?? 'No season'

  const arsenalLabel = (p: (typeof pitchers)[number]) => {
    const list = pitcherArsenal(p, pitchTypes)
    return list.length === pitchTypes.length ? 'all pitches' : list.map((t) => t.abbr).join(' ')
  }

  return (
    <main>
      <h1>My pitchers</h1>
      {active ? <ActiveSeasonNote season={active} /> : <NoActiveSeason />}
      <p className="muted">Tap a pitcher to see their stats and batter matchups. The staff is kept per season.</p>

      {active && pitchers.length === 0 && (
        <p className="empty">Add your pitching staff. Every pitch you log is credited to whoever is in the circle.</p>
      )}

      <div className="list">
        {pitchers.map((p) => (
          <div key={p.id} className="list-item">
            <Link to={`/pitcher/${p.id}`} className="grow" style={{ color: 'var(--text)' }}>
              {p.number ? `#${p.number} ` : ''}{displayName(p)} <span className="pill">throws {p.throws}</span>{' '}
              <span className="pill">{arsenalLabel(p)}</span>
            </Link>
            <button className="small" onClick={() => startEdit(p.id)}>Edit</button>
            <button className="small danger" onClick={() => remove(p.id)}>✕</button>
          </div>
        ))}
      </div>

      {active && (
        <button type="button" onClick={() => setShowImport(true)}>Import pitchers from another season</button>
      )}
      {active && showImport && (
        <ImportFromSeason mode={{ kind: 'pitchers', targetSeasonId: active.id }} onClose={() => setShowImport(false)} />
      )}

      {active && <form onSubmit={save} className="card stack">
        <strong>{editingId !== null ? 'Edit pitcher' : 'Add pitcher'}</strong>
        <div className="row">
          <div className="grow">
            <label>First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" />
          </div>
          <div className="grow">
            <label>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" />
          </div>
          <div style={{ width: 56 }}>
            <label>#</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="7" inputMode="numeric" />
          </div>
        </div>
        <div className="row">
          <label style={{ margin: 0 }}>Throws:</label>
          <button type="button" className={`chip ${throws === 'R' ? 'on' : ''}`} onClick={() => setThrows('R')}>Right</button>
          <button type="button" className={`chip ${throws === 'L' ? 'on' : ''}`} onClick={() => setThrows('L')}>Left</button>
        </div>
        <div>
          <label>Pitches this pitcher throws</label>
          <div className="chips" style={{ margin: '4px 0 0' }}>
            {pitchTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${arsenalSel.includes(t.id) ? 'on' : ''}`}
                onClick={() => toggleArsenal(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          {arsenalSel.length === 0 && (
            <p className="muted" style={{ margin: '4px 0 0' }}>None selected = all pitches allowed.</p>
          )}
        </div>
        <div>
          <label>Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Best pitch, tendencies…" />
        </div>
        {editing && (
          <div className="stack">
            <strong>Same player</strong>
            {linkedOthers.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Not linked yet. Importing into another season links automatically. Link by hand if you added them twice.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Linked to {linkedOthers.map((p) => `${fullName(p)} (${seasonName(p.seasonId)})`).join(', ')}.
              </p>
            )}
            {linkedOthers.length > 0 && (
              <button type="button" className="small" onClick={() => unlinkPitcherRecord(editing.id)}>
                Unlink this roster entry
              </button>
            )}
            {linkCandidates.length > 0 && (
              <div className="row">
                <select className="grow" value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} aria-label="Player to link">
                  <option value="">Link to an existing player…</option>
                  {linkCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.number ? `#${p.number} ` : ''}{fullName(p)} — {seasonName(p.seasonId)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!linkTarget}
                  onClick={async () => {
                    await linkPitcherRecords(editing.id, linkTarget)
                    setLinkTarget('')
                  }}
                >
                  Link
                </button>
              </div>
            )}
          </div>
        )}
        <div className="row">
          <button type="submit" className="primary grow">{editingId !== null ? 'Save changes' : 'Add pitcher'}</button>
          {editingId !== null && <button type="button" onClick={resetForm}>Cancel</button>}
        </div>
      </form>}
    </main>
  )
}
