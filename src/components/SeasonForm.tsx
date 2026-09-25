import { useId, useState } from 'react'
import { isEraInnings, type EraInnings } from '../db'

export interface SeasonFormValue {
  name: string
  startDate: string
  endDate: string
  eraInnings: EraInnings
  makeActive: boolean
}

export function SeasonForm({
  initialName = '',
  initialStart = '',
  initialEnd = '',
  initialEra = '',
  showMakeActive = false,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string
  initialStart?: string
  initialEnd?: string
  /** Empty string means nothing is selected yet — required before save. */
  initialEra?: '' | EraInnings
  showMakeActive?: boolean
  submitLabel: string
  onSubmit: (value: SeasonFormValue) => Promise<void>
  onCancel?: () => void
}) {
  const uid = useId()
  const [name, setName] = useState(initialName)
  const [startDate, setStartDate] = useState(initialStart)
  const [endDate, setEndDate] = useState(initialEnd)
  const [era, setEra] = useState<'' | EraInnings>(initialEra)
  const [makeActive, setMakeActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name the season to continue.')
      return
    }
    if (!isEraInnings(era)) {
      setError('Choose how ERA is calculated this season.')
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setError('End date has to be on or after the start date.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSubmit({ name: trimmed, startDate, endDate, eraInnings: era, makeActive })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div>
        <label htmlFor={`${uid}-name`}>Season name</label>
        <input
          id={`${uid}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Fall 2026"
          autoComplete="off"
        />
      </div>
      <div className="row">
        <div className="grow">
          <label htmlFor={`${uid}-start`}>Starts (optional)</label>
          <input id={`${uid}-start`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="grow">
          <label htmlFor={`${uid}-end`}>Ends (optional)</label>
          <input id={`${uid}-end`} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-era`}>How is ERA calculated this season?</label>
        <select
          id={`${uid}-era`}
          value={era === '' ? '' : String(era)}
          onChange={(e) => {
            const n = Number(e.target.value)
            setEra(isEraInnings(n) ? n : '')
          }}
        >
          {initialEra === '' && (
            <option value="" disabled>Select 6, 7, or 9 innings</option>
          )}
          <option value="6">6 innings</option>
          <option value="7">7 innings</option>
          <option value="9">9 innings</option>
        </select>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          ERA = (earned runs × this number) ÷ innings pitched. You can change it later — every ERA recalculates.
        </p>
      </div>
      {showMakeActive && (
        <label className="row" style={{ alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={makeActive}
            onChange={(e) => setMakeActive(e.target.checked)}
            style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }}
          />
          <span>
            Set as the active season
            <span className="muted" style={{ display: 'block' }}>
              Leave this off to keep working in the current season. Turning a season on does not archive the others.
            </span>
          </span>
        </label>
      )}
      {error && <p className="warning" style={{ margin: 0 }}>{error}</p>}
      <div className="row">
        <button type="submit" className="primary grow" disabled={saving || !name.trim() || !isEraInnings(era)}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        )}
      </div>
    </form>
  )
}
