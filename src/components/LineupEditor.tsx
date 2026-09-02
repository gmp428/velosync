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
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )
  const byId = new Map(batters.map((b) => [b.id, b]))

  // dnd-kit needs stable, unique ids — multiple ghost slots would collide on
  // the literal GHOST_OUT string, so sortable ids are index-suffixed and
  // mapped back to real order values via `sortIds`.
  const sortIds = order.map((id, i) => (id === GHOST_OUT ? `${GHOST_OUT}:${i}` : id))

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = sortIds.indexOf(String(active.id))
    const to = sortIds.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onChange(arrayMove(order, from, to))
  }

  const removeAt = (sortId: string) => {
    const idx = sortIds.indexOf(sortId)
    if (idx === -1) return
    const removedId = order[idx]
    onChange(order.filter((_, i) => i !== idx))
    // Always notify the caller, including for a ghost-out slot — Roster.tsx
    // needs this to turn off the persisted roster-level ghost setting, or
    // it'll just get recomputed back into the order on the next render.
    onRemoveBatter?.(removedId)
  }

  const addGhost = () => onChange([...order, GHOST_OUT])

  return (
    <div className="stack">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <div className="list">
            {order.map((id, i) => (
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
    </div>
  )
}
