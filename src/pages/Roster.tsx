import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, displayName, newId, now, pendingSync } from '../db'
import LineupEditor from '../components/LineupEditor'

export default function Roster() {
  const { id } = useParams()
  const opponentId = id!
  const navigate = useNavigate()
  const opponent = useLiveQuery(() => db.opponents.get(opponentId), [opponentId])
  const battersRaw = useLiveQuery(() => db.batters.where('opponentId').equals(opponentId).toArray(), [opponentId])
  // Display (and lineup-default) order always follows the saved sortIndex, not
  // whatever order Dexie happened to return rows in.
  const batters = battersRaw ? [...battersRaw].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0)) : battersRaw
  const battingOrder = batters?.map((b) => b.id) ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [number, setNumber] = useState('')
  const [bats, setBats] = useState<'L' | 'R'>('R')

  const resetForm = () => {
    setEditingId(null)
    setFirstName('')
    setLastName('')
    setNumber('')
    setBats('R')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const first = firstName.trim()
    if (!first) return
    const fields = { firstName: first, lastName: lastName.trim(), number: number.trim(), bats, updatedAt: now(), ...pendingSync() }
    if (editingId !== null) {
      await db.batters.update(editingId, fields)
    } else {
      // Append to the end of the current batting order (next free sortIndex),
      // never left undefined or colliding with an existing batter's slot.
      const nextSortIndex = batters && batters.length > 0
        ? Math.max(...batters.map((b) => b.sortIndex ?? 0)) + 1
        : 0
      await db.batters.add({ id: newId(), opponentId, sortIndex: nextSortIndex, ...fields })
    }
    resetForm()
  }

  const reorder = async (order: string[]) => {
    await db.transaction('rw', db.batters, async () => {
      for (let i = 0; i < order.length; i++) {
        await db.batters.update(order[i], { sortIndex: i, updatedAt: now(), ...pendingSync() })
      }
    })
  }

  const startEdit = (batterId: string) => {
    const b = batters?.find((x) => x.id === batterId)
    if (!b) return
    setEditingId(batterId)
    setFirstName(b.firstName ?? b.name ?? '')
    setLastName(b.lastName ?? '')
    setNumber(b.number ?? '')
    setBats(b.bats)
  }

  const removeBatter = async (batterId: string) => {
    const pitchCount = await db.pitches.where('batterId').equals(batterId).count()
    if (pitchCount > 0) {
      alert(`This batter has ${pitchCount} logged pitches. Delete is blocked to protect your data.`)
      return
    }
    if (confirm('Delete this batter?')) await db.batters.delete(batterId)
  }

  const removeTeam = async () => {
    const gameCount = await db.games.where('opponentId').equals(opponentId).count()
    if (gameCount > 0) {
      alert('This team has logged games, so it can’t be deleted.')
      return
    }
    if (!confirm(`Delete ${opponent?.name} and their roster?`)) return
    await db.batters.where('opponentId').equals(opponentId).delete()
    await db.opponents.delete(opponentId)
    navigate('/')
  }

  if (!opponent || !batters) return null

  return (
    <main>
      <h1>{opponent.name}</h1>
      <p className="muted">Tap a batter to see their scouting report.</p>

      <h2 style={{ marginTop: 20 }}>Batting order — drag ≡ to reorder</h2>
      <p className="muted">Sets the default lineup order for this team's next game.</p>
      {batters.length > 0 ? (
        <LineupEditor order={battingOrder} batters={batters} onChange={reorder} />
      ) : (
        <p className="empty">Add batters below to set a batting order.</p>
      )}

      <h2 style={{ marginTop: 20 }}>Roster</h2>
      <div className="list">
        {batters.map((b) => (
          <div key={b.id} className="list-item">
            <Link to={`/batter/${b.id}`} className="grow" style={{ color: 'var(--text)' }}>
              {b.number ? `#${b.number} ` : ''}{displayName(b)} <span className="pill">bats {b.bats}</span>
            </Link>
            <button className="small" onClick={() => startEdit(b.id)}>Edit</button>
            <button className="small danger" onClick={() => removeBatter(b.id)}>✕</button>
          </div>
        ))}
      </div>

      <form onSubmit={save} className="card stack">
        <strong>{editingId !== null ? 'Edit batter' : 'Add batter'}</strong>
        <div className="row">
          <div className="grow">
            <label>First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First" />
          </div>
          <div className="grow">
            <label>Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last" />
          </div>
          <div style={{ width: 64 }}>
            <label>#</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12" inputMode="numeric" />
          </div>
        </div>
        <div className="row">
          <label style={{ margin: 0 }}>Bats:</label>
          <button type="button" className={`chip ${bats === 'R' ? 'on' : ''}`} onClick={() => setBats('R')}>Right</button>
          <button type="button" className={`chip ${bats === 'L' ? 'on' : ''}`} onClick={() => setBats('L')}>Left</button>
        </div>
        <div className="row">
          <button type="submit" className="primary grow">{editingId !== null ? 'Save changes' : 'Add batter'}</button>
          {editingId !== null && <button type="button" onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      <button className="danger" onClick={removeTeam} style={{ marginTop: 20 }}>Delete team</button>
    </main>
  )
}
