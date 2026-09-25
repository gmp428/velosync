import { useEffect, useState } from 'react'
import { Link, Outlet, matchPath, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import Logo from './components/Logo'
import BottomNav from './components/BottomNav'
import SeasonGate from './components/SeasonGate'
import SplashIntro from './components/SplashIntro'
import { db } from './db'
import { HeaderExtraProvider, useHeaderExtraState } from './lib/headerExtra'
import { resolveIntroMode, type IntroMode } from './lib/intro'

const prMatch = import.meta.env.BASE_URL.match(/\/pr\/(\d+)\//)
const prNumber = prMatch?.[1]
// PR previews keep the PR number. Main/production builds show package.json version.
const brandBadge = prNumber ? `PR${prNumber}` : __APP_VERSION__ ? `v${__APP_VERSION__}` : ''

function Topbar() {
  const { subheader, rightAction } = useHeaderExtraState()
  return (
    <header className="topbar">
      <div className="topbar-row">
        <Link to="/" className="brand" aria-label="Home">
          <Logo />
          {brandBadge && <span className="brand-pr">{brandBadge}</span>}
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
  const [intro, setIntro] = useState<IntroMode | null>(() => resolveIntroMode())
  const seasonCount = useLiveQuery(() => db.seasons.count(), [])
  const needsSeason = seasonCount === 0

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
      {intro && <SplashIntro mode={intro} onDone={() => setIntro(null)} />}
      <div className={liveGame ? 'app live-game' : 'app'}>
        <Topbar />
        {seasonCount === undefined ? null : needsSeason ? <SeasonGate /> : <Outlet />}
        {seasonCount !== undefined && !needsSeason && !liveGame && <BottomNav />}
      </div>
    </HeaderExtraProvider>
  )
}
