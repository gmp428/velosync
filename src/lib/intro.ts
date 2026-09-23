/** First-open splash flag. localStorage only — not IndexedDB. */
export const INTRO_SEEN_KEY = 'velosync-intro-seen'

export type IntroMode = 'a' | 'b'

function readParam(): string | null {
  const fromSearch = new URLSearchParams(window.location.search).get('intro')
  if (fromSearch) return fromSearch
  const hash = window.location.hash
  const q = hash.indexOf('?')
  if (q === -1) return null
  return new URLSearchParams(hash.slice(q + 1)).get('intro')
}

export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {
    /* private mode / blocked storage — splash may replay next open */
  }
}

export function clearIntroSeen(): void {
  try {
    localStorage.removeItem(INTRO_SEEN_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Default open is Static A (mark badge → motion → Home).
 * Static B (wordmark + Continue) is alt-only: `?intro=b`.
 * `?intro=replay` forces Static A. `?intro=off` skips.
 * After a successful intro, later opens skip unless the flag is cleared.
 */
export function resolveIntroMode(): IntroMode | null {
  const param = readParam()
  if (param === 'off') return null
  if (param === 'b' || param === 'static-b') return 'b'
  if (param === 'a' || param === 'replay' || param === '1') return 'a'
  if (introSeen()) return null
  return 'a'
}
