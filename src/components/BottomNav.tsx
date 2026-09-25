import { NavLink } from 'react-router-dom'
import homeSvg from '../assets/nav/home-3.svg?raw'
import teamsSvg from '../assets/nav/teams-ref-raglan.svg?raw'
import pitchersSvg from '../assets/nav/pitchers-2.svg?raw'
import gamesSvg from '../assets/nav/games-ref-crossed-b.svg?raw'
import settingsSvg from '../assets/nav/settings-3.svg?raw'

/** Locked filled glyphs stay #2563EB in the asset files. Tabs recolor via currentColor. */
function navGlyph(raw: string): string {
  return raw
    .replace('<svg ', '<svg width="26" height="26" aria-hidden="true" focusable="false" ')
    .replaceAll('#2563EB', 'currentColor')
}

const TABS: Array<{ to: string; label: string; glyph: string; end?: boolean }> = [
  { to: '/', label: 'Home', end: true, glyph: navGlyph(homeSvg) },
  { to: '/teams', label: 'Teams', glyph: navGlyph(teamsSvg) },
  { to: '/pitchers', label: 'Pitchers', glyph: navGlyph(pitchersSvg) },
  { to: '/games', label: 'Games', glyph: navGlyph(gamesSvg) },
  { to: '/settings', label: 'Settings', glyph: navGlyph(settingsSvg) },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="bottom-nav-island">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `bottom-nav-tab${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-glyph" dangerouslySetInnerHTML={{ __html: tab.glyph }} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
