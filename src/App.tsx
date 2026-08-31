import { Link, Outlet } from 'react-router-dom'
import Logo from './components/Logo'
import BottomNav from './components/BottomNav'

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Home">
          <Logo size={26} />
          <span className="brand-word">VeloSync</span>
        </Link>
        <nav className="topbar-links">
          <Link to="/teams">Teams</Link>
          <Link to="/pitchers">Pitchers</Link>
          <Link to="/games">Games</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>
      <Outlet />
      <BottomNav />
    </>
  )
}
