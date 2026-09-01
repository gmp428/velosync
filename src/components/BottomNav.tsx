import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const ACTIVE_COLOR = 'var(--accent)'
const INACTIVE_COLOR = 'var(--muted)'

function HomeIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 11 L12 4 L21 11" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10 V20 H19 V10" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 20 V14 H14 V20" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TeamsIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8" r="3" stroke={color} strokeWidth="2" />
      <circle cx="16" cy="9" r="2.5" stroke={color} strokeWidth="2" />
      <path d="M3 20 c0 -3.5 2.5 -6 5.5 -6 s5.5 2.5 5.5 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M14.5 14.5 c2.6 0.3 4.5 2.4 4.5 5.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function PitchersIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke={color} strokeWidth="2" />
      <path d="M8.5 6.5 a3.7 3.7 0 0 1 7 0" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M4.5 20 c0 -4.2 3.3 -7.2 7.5 -7.2 s7.5 3 7.5 7.2" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function GamesIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke={color} strokeWidth="2" />
      <path d="M4 9.5 H20" stroke={color} strokeWidth="2" />
      <path d="M8 3 V6.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3 V6.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2" />
      <path
        d="M12 3.5 l1 2.2 2.4 -0.6 1 2.1 2.1 1 -0.6 2.4 2.2 1 -2.2 1 0.6 2.4 -2.1 1 -1 2.1 -2.4 -0.6 -1 2.2 -1 -2.2 -2.4 0.6 -1 -2.1 -2.1 -1 0.6 -2.4 -2.2 -1 2.2 -1 -0.6 -2.4 2.1 -1 1 -2.1 2.4 0.6 Z"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const TABS: Array<{ to: string; label: string; icon: (color: string) => ReactNode; end?: boolean }> = [
  { to: '/', label: 'Home', end: true, icon: (c) => <HomeIcon color={c} /> },
  { to: '/teams', label: 'Teams', icon: (c) => <TeamsIcon color={c} /> },
  { to: '/pitchers', label: 'Pitchers', icon: (c) => <PitchersIcon color={c} /> },
  { to: '/games', label: 'Games', icon: (c) => <GamesIcon color={c} /> },
  { to: '/settings', label: 'Settings', icon: (c) => <SettingsIcon color={c} /> },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `bottom-nav-tab${isActive ? ' active' : ''}`}
        >
          {({ isActive }) => (
            <>
              {tab.icon(isActive ? ACTIVE_COLOR : INACTIVE_COLOR)}
              <span>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
