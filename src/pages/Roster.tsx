import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, displayName, GHOST_OUT, newId, now, pendingSync } from '../db'
import LineupEditor from '../components/LineupEditor'
import NumberPadInput from '../components/NumberPadInput'

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
  // A roster-level "planned" ghost-out slot fills out the missing spot for
  // a league that requires an automatic out when the team is short-handed.
  // Offered any time active count is 8 or fewer — there's no upper cap on
  // active batters anymore (leagues that run Extra Hitter/DP-Flex just
  // check in as many as they want), but a ghost slot only ever makes sense
  // when the team doesn't have enough for a standard lineup.
  const ghostEnabled = opponent?.ghostOutEnabled === true && activeCount <= 8
  const battingOrder: string[] = activeBatters.map((b) => b.id)
  if (ghostEnabled) {
    const idx = opponent?.ghostOutSortIndex ?? Infinity
    const insertAt = activeBatters.findIndex((b) => (b.sortIndex ?? 0) > idx)
    if (insertAt === -1) battingOrder.push(GHOST_OUT)
    else battingOrder.splice(insertAt, 0, GHOST_OUT)
  }

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
  // Quick jersey-number-only entry: paste/type a whole opposing lineup's
  // numbers at once (space/comma separated), in the order handed over on
  // the lineup card — creates unnamed "Batter #N" placeholders in that
  // exact order, checked into today's lineup, so a coach can start the
  // game within the couple minutes before first pitch and fill in real
  // names later between innings.
  const [quickNumbers, setQuickNumbers] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)

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
    const num = number.trim()
    // Require SOMETHING to identify the batter by — either a name or a
    // jersey number (a number-only entry displays as "Batter #N" via
    // displayName's fallback until a real name is added later).
    if (!first && !num) return
    const fields = {
      firstName: first || undefined, lastName: lastName.trim() || undefined,
      number: num, bats, updatedAt: now(), ...pendingSync(),
    }
    if (editingId !== null) {
      await db.batters.update(editingId, fields)
    } else {
      // Append to the end of the current batting order (next free sortIndex),
      // never left undefined or colliding with an existing batter's slot.
      const nextSortIndex = batters && batters.length > 0
        ? Math.max(...batters.map((b) => b.sortIndex ?? 0)) + 1
        : 0
      // New batters always join today's active lineup automatically —
      // there's no upper cap; the coach unchecks anyone they want to bench.
      const activeToday = true
      await db.batters.add({ id: newId(), opponentId, sortIndex: nextSortIndex, activeToday, ...fields })
    }
    resetForm()
  }

  // Quick-add a whole opposing lineup by jersey number only, in the exact
  // order typed/pasted (matching the order on a physical lineup card) —
  // creates one unnamed batter per number, all checked into today's
  // lineup, appended after anything already on the roster. Splits on
  // commas, spaces, or newlines so "3 7 12" / "3,7,12" / one-per-line all
  // work without the coach needing to think about formatting under time
  // pressure.
  const quickAddByNumbers = async () => {
    const nums = quickNumbers.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    if (nums.length === 0) return
    const baseSortIndex = batters && batters.length > 0
      ? Math.max(...batters.map((b) => b.sortIndex ?? 0)) + 1
      : 0
    await db.batters.bulkAdd(nums.map((num, i) => ({
      id: newId(),
      opponentId,
      number: num,
      bats: 'R' as const,
      sortIndex: baseSortIndex + i,
      activeToday: true,
      updatedAt: now(),
      ...pendingSync(),
    })))
    setQuickNumbers('')
    setShowQuickAdd(false)
  }

  // Persists both the real batters' sortIndex AND (if a ghost slot is
  // present) its position, expressed as a sortIndex value between its
  // neighbors — so dragging the ghost slot around the order sticks.
  const reorder = async (order: string[]) => {
    const realOrder = order.filter((oid) => oid !== GHOST_OUT)
    await db.transaction('rw', db.batters, async () => {
      for (let i = 0; i < realOrder.length; i++) {
        await db.batters.update(realOrder[i], { sortIndex: i, updatedAt: now(), ...pendingSync() })
      }
    })
    const ghostAt = order.indexOf(GHOST_OUT)
    if (ghostAt !== -1) {
      // Position the ghost slot just after the real batter now sitting
      // before it in the dragged order (or before index 0 if dragged to top).
      const ghostSortIndex = ghostAt === 0 ? -0.5 : ghostAt - 0.5
      await db.opponents.update(opponentId, { ghostOutSortIndex: ghostSortIndex, updatedAt: now(), ...pendingSync() })
    }
  }

  // Toggle the roster-level planned ghost-out slot on/off. Only offered
  // (and meaningful) at 8 or fewer active batters — see `ghostEnabled` above.
  const setGhostEnabled = async (enabled: boolean) => {
    await db.opponents.update(opponentId, {
      ghostOutEnabled: enabled,
      ghostOutSortIndex: enabled ? activeCount - 0.5 : undefined,
      updatedAt: now(),
      ...pendingSync(),
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
    setShowQuickAdd(false)
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
        {activeCount} checked in for today. Sets the default lineup order for this team's next game.
      </p>
      {activeCount > 0 && activeCount < 8 && (
        <p className="warning" style={{ marginTop: -8 }}>
          Only {activeCount} checked in — most leagues require at least 8 to
          play (rules vary; this isn't blocked, just a heads up).
        </p>
      )}
      {activeCount > 0 && activeCount <= 8 && (
        <label className="row" style={{ alignItems: 'center', gap: 8, marginTop: -8 }}>
          <input
            type="checkbox"
            checked={opponent?.ghostOutEnabled === true}
            onChange={(e) => setGhostEnabled(e.target.checked)}
            style={{ width: 20, height: 20, flexShrink: 0 }}
          />
          <span className="muted">
            Add a Ghost Batter (Auto Out) for the missing spot — some leagues require an
            automatic out when you're short-handed.
          </span>
        </label>
      )}
      {battingOrder.length > 0 ? (
        <LineupEditor
          order={battingOrder}
          batters={activeBatters}
          onChange={reorder}
          onRemoveBatter={(batterId) =>
            batterId === GHOST_OUT ? setGhostEnabled(false) : setActive(batterId, false)
          }
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
          <button type="button" className="small" onClick={() => setShowQuickAdd((v) => !v)}>
            {showQuickAdd ? 'Close quick add' : '⚡ Quick add by #s'}
          </button>
        </div>
      </form>

      {showQuickAdd && editingId === null && (
        <div className="card stack" style={{ marginTop: 8 }}>
          <strong>Quick add by jersey number</strong>
          <p className="muted" style={{ margin: 0 }}>
            No time for names before first pitch? Tap in the numbers straight
            off their lineup card, in order — e.g. "3, 7, 12, 21, 5". Creates
            unnamed "Batter #N" placeholders, checked into today's lineup in
            that exact order. Add real names later from the roster list
            below whenever there's time.
          </p>
          <NumberPadInput value={quickNumbers} onChange={setQuickNumbers} />
          <div className="row">
            <button type="button" className="primary grow" onClick={quickAddByNumbers} disabled={!quickNumbers.trim()}>
              Add lineup
            </button>
          </div>
        </div>
      )}

      <button className="danger" onClick={removeTeam} style={{ marginTop: 20 }}>Delete team</button>
    </main>
  )
}
