import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, displayName, MAX_ACTIVE_LINEUP, newId, now, pendingSync } from '../db'
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

  // Only batters checked into today's lineup (activeToday) appear in the
  // drag-to-reorder batting order. A batter created before this field
  // existed defaults to checked-in (activeToday !== false), matching the
  // v5 migration. Ghost-out slots aren't offered here — they're a per-GAME
  // concept (persisted on Game.lineup once a game exists); the roster
  // screen only sets the baseline order/roster for the *next* game.
  const activeBatters = batters?.filter((b) => b.activeToday !== false) ?? []
  const activeCount = activeBatters.length
  const battingOrder = activeBatters.map((b) => b.id)

  // The roster list below is a separate, stable reference list — always
  // alphabetical by last name (falling back to first name), independent
  // of the drag-to-reorder batting order above it.
  const rosterList = batters
    ? [...batters].sort((a, b) => {
        const aName = (a.lastName?.trim() || a.firstName || a.name || '').toLowerCase()
        const bName = (b.lastName?.trim() || b.firstName || b.name || '').toLowerCase()
        return aName.localeCompare(bName)
      })
    : batters

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
      // New batters join today's active lineup automatically as long as
      // there's room under the 9-max cap; over the cap they land unchecked
      // on the roster so the coach can swap someone out first.
      const activeToday = activeCount < MAX_ACTIVE_LINEUP
      await db.batters.add({ id: newId(), opponentId, sortIndex: nextSortIndex, activeToday, ...fields })
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

  // Unchecks a batter from today's lineup — called both from the roster
  // checkbox and from the drag-list's ✕ (both views share this one state).
  // Checking IN a batter sends them to the bottom of the current batting
  // order (next sortIndex after the highest active one), not wherever their
  // old sortIndex happened to be — so checking players one at a time in the
  // order you want them to bat builds the lineup top-to-bottom naturally,
  // without disturbing anyone already checked in.
  const setActive = async (batterId: string, active: boolean) => {
    if (active && activeCount >= MAX_ACTIVE_LINEUP) {
      alert(`A batting order can have at most ${MAX_ACTIVE_LINEUP} active players. Uncheck someone first.`)
      return
    }
    const fields: { activeToday: boolean; updatedAt: number; sortIndex?: number } = {
      activeToday: active,
      updatedAt: now(),
    }
    if (active) {
      fields.sortIndex = activeBatters.length > 0
        ? Math.max(...activeBatters.map((b) => b.sortIndex ?? 0)) + 1
        : 0
    }
    await db.batters.update(batterId, { ...fields, ...pendingSync() })
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

  if (!opponent || !batters || !rosterList) return null

  return (
    <main>
      <h1>{opponent.name}</h1>
      <p className="muted">Tap a batter to see their scouting report.</p>

      <h2 style={{ marginTop: 20 }}>Batting order — drag ≡ to reorder</h2>
      <p className="muted">
        {activeCount}/{MAX_ACTIVE_LINEUP} checked in for today. Sets the default lineup order for this team's next game.
      </p>
      {activeCount > 0 && activeCount < 8 && (
        <p className="warning" style={{ marginTop: -8 }}>
          Only {activeCount} checked in — most leagues require at least 8 to
          play (rules vary; this isn't blocked, just a heads up).
        </p>
      )}
      {battingOrder.length > 0 ? (
        <LineupEditor
          order={battingOrder}
          batters={activeBatters}
          onChange={reorder}
          onRemoveBatter={(batterId) => setActive(batterId, false)}
        />
      ) : (
        <p className="empty">Check batters into today's lineup below to set a batting order.</p>
      )}

      <h2 style={{ marginTop: 20 }}>Roster</h2>
      <div className="list">
        {rosterList.map((b) => {
          const isActive = b.activeToday !== false
          return (
            <div key={b.id}>
              <div className="list-item">
                <input
                  type="checkbox"
                  aria-label={`${displayName(b)} in today's lineup`}
                  checked={isActive}
                  disabled={!isActive && activeCount >= MAX_ACTIVE_LINEUP}
                  onChange={(e) => setActive(b.id, e.target.checked)}
                  style={{ width: 20, height: 20, flexShrink: 0 }}
                />
                <Link to={`/batter/${b.id}`} className="grow" style={{ color: 'var(--text)' }}>
                  {b.number ? `#${b.number} ` : ''}{displayName(b)} <span className="pill">bats {b.bats}</span>
                </Link>
                <button className="small" onClick={() => (editingId === b.id ? resetForm() : startEdit(b.id))}>
                  {editingId === b.id ? 'Close' : 'Edit'}
                </button>
                <button className="small danger" onClick={() => removeBatter(b.id)}>✕</button>
              </div>
              {editingId === b.id && (
                <form onSubmit={save} className="card stack" style={{ marginTop: 8, marginBottom: 8 }}>
                  <strong>Edit batter</strong>
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
                    <button type="submit" className="primary grow">Save changes</button>
                    <button type="button" onClick={resetForm}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          )
        })}
      </div>


      <form onSubmit={save} className="card stack" style={{ display: editingId !== null ? 'none' : undefined }}>
        <strong>Add batter</strong>
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
          <button type="submit" className="primary grow">Add batter</button>
        </div>
      </form>

      <button className="danger" onClick={removeTeam} style={{ marginTop: 20 }}>Delete team</button>
    </main>
  )
}
