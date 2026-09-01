import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App, { LiveGameLayout } from './App'
import Home from './pages/Home'
import Teams from './pages/Teams'
import Roster from './pages/Roster'
import Pitchers from './pages/Pitchers'
import PitcherReport from './pages/PitcherReport'
import NewGame from './pages/NewGame'
import LiveGame from './pages/LiveGame'
import Games from './pages/Games'
import GameDetail from './pages/GameDetail'
import BatterReport from './pages/BatterReport'
import Settings from './pages/Settings'

const router = createHashRouter([
  {
    children: [
      {
        element: <App />,
        children: [
          { index: true, element: <Home /> },
          { path: 'teams', element: <Teams /> },
          { path: 'opponent/:id', element: <Roster /> },
          { path: 'pitchers', element: <Pitchers /> },
          { path: 'pitcher/:id', element: <PitcherReport /> },
          { path: 'new-game', element: <NewGame /> },
          { path: 'games', element: <Games /> },
          { path: 'games/:id', element: <GameDetail /> },
          { path: 'batter/:id', element: <BatterReport /> },
          { path: 'settings', element: <Settings /> },
        ],
      },
      // Sibling of the list-screen shell so /#/game/:id never mounts the JPEG
      // header, separator, or tab bar.
      {
        path: 'game/:id',
        element: <LiveGameLayout />,
        children: [{ index: true, element: <LiveGame /> }],
      },
    ],
  },
])

// Ask the browser to protect our storage from being evicted under disk pressure.
// (Granted automatically for installed/home-screen PWAs on most platforms.)
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
