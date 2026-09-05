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
