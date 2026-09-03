// A compact on-screen numeric keypad for entering a list of jersey numbers,
// used by the Quick Add flow. Built as a real custom keypad (not relying on
// the phone's native keyboard) specifically because no native mobile
// keyboard mode offers BOTH digits and a comma/separator at once: iOS's
// inputMode="numeric" gives 0-9 only (no comma, no space), and the default
// text keyboard has a comma but forces the coach to hunt for digits among
// letters. This keypad never triggers the OS keyboard at all — readOnly
// display field, all input via on-screen buttons.
export default function NumberPadInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const pressDigit = (d: string) => onChange(value + d)
  const pressComma = () => {
    // Avoid doubling up on separators (e.g. tapping ',' twice, or ',' right
    // after a space) or leading with one on an empty field.
    if (value.length === 0 || /[,\s]$/.test(value)) return
    onChange(value + ', ')
  }
  const backspace = () => onChange(value.slice(0, -1))
  const clear = () => onChange('')

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫']

  return (
    <div className="stack">
      <div
        className="numberpad-display"
        aria-label="Jersey numbers entered so far"
      >
        {value || <span className="muted">Tap numbers below…</span>}
      </div>
      <div className="numberpad-grid">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className="numberpad-key"
            onClick={() => {
              if (k === ',') pressComma()
              else if (k === '⌫') backspace()
              else pressDigit(k)
            }}
          >
            {k}
          </button>
        ))}
      </div>
      {value.length > 0 && (
        <button type="button" className="small" onClick={clear}>Clear all</button>
      )}
    </div>
  )
}
