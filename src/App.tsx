import { Link, Outlet, matchPath, useLocation } from 'react-router-dom'
import Logo from './components/Logo'
import BottomNav from './components/BottomNav'

const prMatch = import.meta.env.BASE_URL.match(/\/pr\/(\d+)\//)
const prNumber = prMatch?.[1]

export default function App() {
  const { pathname } = useLocation()
  const liveGame = Boolean(matchPath('/game/:id', pathname))

  return (
    <div className={liveGame ? 'app live-game' : 'app'}>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Home">
          <Logo />
          {prNumber && <span className="brand-pr">PR{prNumber}</span>}
        </Link>
      </header>
      <Outlet />
      {!liveGame && <BottomNav />}
    </div>
  )
}
