import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Lets a page (currently just LiveGame) register content into the shared
// top-level App header: a small subheader line under the logo (e.g. "vs
// {Team}"), and a right-side action slot (e.g. "End game"). Registered via
// useHeaderExtra() in the page, cleared automatically on unmount so leaving
// the page always restores the plain header for every other screen.

type HeaderExtraState = {
  subheader: ReactNode | null
  rightAction: ReactNode | null
}

type HeaderExtraContextValue = {
  state: HeaderExtraState
  setState: (s: HeaderExtraState) => void
}

const HeaderExtraContext = createContext<HeaderExtraContextValue | null>(null)

export function HeaderExtraProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HeaderExtraState>({ subheader: null, rightAction: null })
  return (
    <HeaderExtraContext.Provider value={{ state, setState }}>
      {children}
    </HeaderExtraContext.Provider>
  )
}

export function useHeaderExtraState() {
  const ctx = useContext(HeaderExtraContext)
  if (!ctx) throw new Error('useHeaderExtraState must be used within HeaderExtraProvider')
  return ctx.state
}

// Call from a page to register header content. Automatically clears itself
// when the page unmounts. `deps` should be primitive values that actually
// determine subheader/rightAction's content (e.g. [opponent?.name]) — NOT
// the JSX nodes themselves, since JSX elements are new object references on
// every render and would otherwise re-fire this effect (and re-render the
// whole app tree via the shared context) on every single LiveGame render.
export function useHeaderExtra(subheader: ReactNode | null, rightAction: ReactNode | null, deps: unknown[]) {
  const ctx = useContext(HeaderExtraContext)
  if (!ctx) throw new Error('useHeaderExtra must be used within HeaderExtraProvider')
  const { setState } = ctx
  useEffect(() => {
    setState({ subheader, rightAction })
    return () => setState({ subheader: null, rightAction: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
