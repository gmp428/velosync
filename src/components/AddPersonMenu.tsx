/**
 * The one entry point for adding a roster player or a pitcher:
 * a blank form, or import from another season.
 */
export default function AddPersonMenu({
  title,
  hint,
  newLabel,
  onClose,
  onNew,
  onImport,
  importDisabled = false,
  importDisabledReason,
}: {
  title: string
  hint: string
  newLabel: string
  onClose: () => void
  onNew: () => void
  onImport: () => void
  importDisabled?: boolean
  importDisabledReason?: string
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="card stack"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="row spread">
          <strong>{title}</strong>
          <button type="button" className="small" onClick={onClose}>Close</button>
        </div>
        <p className="muted" style={{ margin: 0 }}>{hint}</p>
        <button type="button" className="primary" style={{ width: '100%' }} onClick={onNew}>
          {newLabel}
        </button>
        <button
          type="button"
          style={{ width: '100%' }}
          onClick={onImport}
          disabled={importDisabled}
          title={importDisabled ? importDisabledReason : undefined}
        >
          Import from another season
        </button>
      </div>
    </div>
  )
}
