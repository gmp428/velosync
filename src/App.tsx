import { Link, Outlet, matchPath, useLocation } from 'react-router-dom'
import Logo from './components/Logo'
import BottomNav from './components/BottomNav'

const isPrPreview = import.meta.env.BASE_URL.includes('/pr/')

export default function App() {
  const { pathname } = useLocation()
  const liveGame = Boolean(matchPath('/game/:id', pathname))

  return (
    <div className={liveGame ? 'app live-game' : 'app'}>
      {!liveGame && (
        <header className="topbar">
          <Link to="/" className="brand" aria-label="Home">
            <Logo />
            {isPrPreview && <span className="brand-pr">PR</span>}
          </Link>
        </header>
      )}
      <Outlet />
      {!liveGame && <BottomNav />}
    </div>
  )
}
