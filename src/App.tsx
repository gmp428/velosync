import { Link, Outlet } from 'react-router-dom'
import Logo from './components/Logo'
import BottomNav from './components/BottomNav'

const isPrPreview = import.meta.env.BASE_URL.includes('/pr/')

/** List-screen chrome: large JPEG header + tab bar. Not used on /game/:id. */
export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Home">
          <Logo />
          {isPrPreview && <span className="brand-pr">PR</span>}
        </Link>
      </header>
      <Outlet />
      <BottomNav />
    </div>
  )
}

/** Live logger shell: no wordmark, no separator, no tabs. */
export function LiveGameLayout() {
  return (
    <div className="app live-game">
      <Outlet />
    </div>
  )
}
