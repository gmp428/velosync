import { useEffect, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { displayName, GHOST_OUT, type Batter } from '../db'

// Drag-to-reorder list of batters. `order` is an array of batterIds, which
// may also include the GHOST_OUT sentinel for a slot deliberately left
// vacant (short-handed team, an ejected/departed player, etc.) — it auto-logs
// a scoreless out and skips ahead when a live game's order reaches it.
// Touch-capable so it works on a phone at the field.

function Row({
  sortId, rawId, batter, index, onRemove,
}: {
  sortId: string
  rawId: string
  batter: Batter | undefined
  index: number
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortId })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  const isGhost = rawId === GHOST_OUT
  return (
    <div ref={setNodeRef} style={style} className={`list-item lineup-row ${isGhost ? 'ghost-row' : ''}`}>
      <span className="lineup-num">{index + 1}</span>
      {isGhost ? (
        <span className="grow muted" style={{ fontStyle: 'italic' }}>Ghost Batter (Auto Out)</span>
      ) : (
        <>
          <span className="grow">{batter?.number ? `#${batter.number} ` : ''}{displayName(batter)}</span>
          {batter && <span className="pill">bats {batter.bats}</span>}
        </>
      )}
      <button
        type="button"
        className="small danger"
        aria-label={isGhost ? 'Remove ghost-out slot' : `Remove ${displayName(batter)} from lineup`}
        onClick={() => onRemove(sortId)}
      >
        ✕
      </button>
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag slot ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        ≡
      </button>
    </div>
  )
}

export default function LineupEditor({
  order,
  batters,
  onChange,
  onRemoveBatter,
  allowGhostAdd = false,
  addableBatters,
  onAddBatter,
}: {
  order: string[]
  batters: Batter[]
  onChange: (order: string[]) => void
  // Called (in addition to onChange) when a real batter's X is clicked, so
  // the caller can uncheck them from today's lineup — keeps the roster
  // checkbox list and this drag list in sync in both directions.
  onRemoveBatter?: (batterId: string) => void
  // Show a "+ Ghost out" button that appends a vacant, auto-out slot.
  allowGhostAdd?: boolean
  // Batters eligible to be added to the order (typically: on the roster but
  // NOT already in `order` — benched, or added to the roster since the
  // order was last built). Passing this (even an empty array) shows an
  // "Add batter to order" picker; omitting it hides the picker entirely.
  addableBatters?: Batter[]
  onAddBatter?: (batterId: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )
  const byId = new Map(batters.map((b) => [b.id, b]))

  // Local draft of the order, synced from the `order` prop only when it
  // genuinely changes from OUTSIDE (game loaded, another device's sync,
  // etc.) — NOT re-derived on every render. This closes a real race: every
  // edit here writes to Dexie and the new `order` prop only arrives after
  // that write round-trips back through the live query and a re-render. If
  // a coach fires off a second edit (drag another row, tap another remove)
  // before that round-trip completes, computing the second edit against the
  // stale `order` PROP would silently discard the first edit entirely once
  // its own write lands. Editing against local `draft` state instead means
  // each edit always builds on the immediately-preceding one, in order,
  // regardless of how fast Dexie's write/read-back cycle keeps up.
  const [draft, setDraft] = useState(order)
  useEffect(() => { setDraft(order) }, [order.join('\u0001')])

  const applyChange = (next: string[]) => {
    setDraft(next)
    onChange(next)
  }

  // dnd-kit needs stable, unique ids — multiple ghost slots would collide on
  // the literal GHOST_OUT string, so sortable ids are index-suffixed and
  // mapped back to real order values via `sortIds`.
  const sortIds = draft.map((id, i) => (id === GHOST_OUT ? `${GHOST_OUT}:${i}` : id))

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = sortIds.indexOf(String(active.id))
    const to = sortIds.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    applyChange(arrayMove(draft, from, to))
  }

  const removeAt = (sortId: string) => {
    const idx = sortIds.indexOf(sortId)
    if (idx === -1) return
    const removedId = draft[idx]
    applyChange(draft.filter((_, i) => i !== idx))
    // Always notify the caller, including for a ghost-out slot — Roster.tsx
    // needs this to turn off the persisted roster-level ghost setting, or
    // it'll just get recomputed back into the order on the next render.
    onRemoveBatter?.(removedId)
  }

  const addGhost = () => applyChange([...draft, GHOST_OUT])

  return (
    <div className="stack">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <div className="list">
            {draft.map((id, i) => (
              <Row key={sortIds[i]} sortId={sortIds[i]} rawId={id} batter={byId.get(id)} index={i} onRemove={removeAt} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {allowGhostAdd && (
        <button type="button" className="small" onClick={addGhost}>
          + Ghost Batter (Auto Out) slot
        </button>
      )}
      {addableBatters !== undefined && (
        <AddBatterPicker
          batters={addableBatters}
          onAdd={(batterId) => {
            applyChange([...draft, batterId])
            onAddBatter?.(batterId)
          }}
        />
      )}
    </div>
  )
}

function AddBatterPicker({ batters, onAdd }: { batters: Batter[]; onAdd?: (batterId: string) => void }) {
  const [selected, setSelected] = useState('')
  if (batters.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>No other batters available to add.</p>
  }
  return (
    <div className="row" style={{ gap: 8 }}>
      <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ flex: 1 }}>
        <option value="">Add a batter to the order…</option>
        {batters.map((b) => (
          <option key={b.id} value={b.id}>{b.number ? `#${b.number} ` : ''}{displayName(b)}</option>
        ))}
      </select>
      <button
        type="button"
        className="small"
        disabled={!selected}
        onClick={() => {
          if (selected) { onAdd?.(selected); setSelected('') }
        }}
      >
        Add
      </button>
    </div>
  )
}
