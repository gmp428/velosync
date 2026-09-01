import { Link, Outlet, matchPath, useLocation } from 'react-router-dom'
import Logo from './components/Logo'
import BottomNav from './components/BottomNav'

export default function App() {
  const { pathname } = useLocation()
  const liveGame = Boolean(matchPath('/game/:id', pathname))

  return (
    <div className={liveGame ? 'app live-game' : 'app'}>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Home">
          <Logo size={26} />
          <span className="brand-word">VeloSync</span>
        </Link>
      </header>
      <Outlet />
      {!liveGame && <BottomNav />}
    </div>
  )
}
