import { useEffect } from 'react'
import { Link, Outlet, matchPath, useLocation } from 'react-router-dom'
import Logo from './components/Logo'
import BottomNav from './components/BottomNav'
import { HeaderExtraProvider, useHeaderExtraState } from './lib/headerExtra'

const prMatch = import.meta.env.BASE_URL.match(/\/pr\/(\d+)\//)
const prNumber = prMatch?.[1]

function Topbar() {
  const { subheader, rightAction } = useHeaderExtraState()
  return (
    <header className="topbar">
      <div className="topbar-row">
        <Link to="/" className="brand" aria-label="Home">
          <Logo />
          {prNumber && <span className="brand-pr">PR{prNumber}</span>}
        </Link>
        {rightAction}
      </div>
      {subheader && <div className="topbar-subheader">{subheader}</div>}
    </header>
  )
}

export default function App() {
  const { pathname } = useLocation()
  const liveGame = Boolean(matchPath('/game/:id', pathname))

  // Mobile Safari/WebKit PWA bug: navigating "back" to a long scrollable
  // list (e.g. Roster) can restore the previous scroll offset before the
  // page has actually repainted at that position -- leaving a blank frame
  // that only redraws once you manually scroll. Forcing a scrollTo on the
  // next frame after every route change makes the browser repaint
  // immediately, so the blank frame never has a chance to show.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      window.scrollTo(window.scrollX, window.scrollY)
    })
    return () => cancelAnimationFrame(raf)
  }, [pathname])

  return (
    <HeaderExtraProvider>
      <div className={liveGame ? 'app live-game' : 'app'}>
        <Topbar />
        <Outlet />
        {!liveGame && <BottomNav />}
      </div>
    </HeaderExtraProvider>
  )
}
