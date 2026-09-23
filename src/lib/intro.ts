/** Splash preference. localStorage only — not IndexedDB. Default is on (play every launch). */
export const INTRO_ENABLED_KEY = 'velosync-intro-enabled'

/** Previous skip-after-first-open flag. Cleared so it cannot hide the intro. */
const LEGACY_INTRO_SEEN_KEY = 'velosync-intro-seen'

export type IntroMode = 'a' | 'b'

function readParam(): string | null {
  const fromSearch = new URLSearchParams(window.location.search).get('intro')
  if (fromSearch) return fromSearch
  const hash = window.location.hash
  const q = hash.indexOf('?')
  if (q === -1) return null
  return new URLSearchParams(hash.slice(q + 1)).get('intro')
}

export function introEnabled(): boolean {
  try {
    localStorage.removeItem(LEGACY_INTRO_SEEN_KEY)
    return localStorage.getItem(INTRO_ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

export function setIntroEnabled(on: boolean): void {
  try {
    localStorage.setItem(INTRO_ENABLED_KEY, on ? '1' : '0')
  } catch {
    /* private mode / blocked storage */
  }
}

/**
 * Default open is Static A on every launch.
 * Turn it off in Settings (or `?intro=off`).
 * Static B (wordmark + Continue) is alt-only: `?intro=b`.
 * `?intro=replay` forces Static A even when the setting is off.
 */
export function resolveIntroMode(): IntroMode | null {
  const param = readParam()
  if (param === 'off') return null
  if (param === 'b' || param === 'static-b') return 'b'
  if (param === 'a' || param === 'replay' || param === '1') return 'a'
  if (!introEnabled()) return null
  return 'a'
}
