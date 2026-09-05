import type { Zone } from '../db'
import { normalizeZone } from '../db'
import type { BattleAgg, GroupingCell } from '../lib/stats'
import { battleRate, groupingColor } from '../lib/stats'

// Strike zone from the catcher's point of view: a 3x3 in-zone grid surrounded
// by four out-of-zone strips (high / low / left / right).
//
// Tap to choose where a pitch went (when onSelect is given), and/or color the
// regions by how the battle went there (when heat is given) — colorblind-safe
// blue-to-vermillion scale: blue = our pitch won (strikes, fouls, outs),
// vermillion = they hit it. Both can be active at once: during a game the
// grid is a heat map AND the location picker.
//
// Two layouts, switched by `granular`:
//  - coarse (default): each outer strip is one big cell (13 cells total)
//  - granular (Detailed preset, granularZones flag on): each outer strip
//    splits into thirds, plus the 4 corners (25 cells total)

const CELLS_COARSE: Array<{ zone: Zone; style: React.CSSProperties; label?: string }> = [
  { zone: 'o-up', style: { gridColumn: '2 / 5', gridRow: '1' }, label: '↑' },
  { zone: 'o-left', style: { gridColumn: '1', gridRow: '2 / 5' }, label: '←' },
  { zone: 1, style: { gridColumn: '2', gridRow: '2' } },
  { zone: 2, style: { gridColumn: '3', gridRow: '2' } },
  { zone: 3, style: { gridColumn: '4', gridRow: '2' } },
  { zone: 4, style: { gridColumn: '2', gridRow: '3' } },
  { zone: 5, style: { gridColumn: '3', gridRow: '3' } },
  { zone: 6, style: { gridColumn: '4', gridRow: '3' } },
  { zone: 7, style: { gridColumn: '2', gridRow: '4' } },
  { zone: 8, style: { gridColumn: '3', gridRow: '4' } },
  { zone: 9, style: { gridColumn: '4', gridRow: '4' } },
  { zone: 'o-right', style: { gridColumn: '5', gridRow: '2 / 5' }, label: '→' },
  { zone: 'o-down', style: { gridColumn: '2 / 5', gridRow: '5' }, label: '↓' },
]

// Granular layout: same 5x5 grid, but every outer cell gets its own column/row
// instead of spanning 3 — a true 5x5 of 25 individually-tappable zones.
const CELLS_GRANULAR: Array<{ zone: Zone; style: React.CSSProperties; label?: string }> = [
  { zone: 'og-up-left-corner', style: { gridColumn: '1', gridRow: '1' }, label: '↖' },
  { zone: 'og-up-left-third', style: { gridColumn: '2', gridRow: '1' }, label: '↑' },
  { zone: 'og-up-middle-third', style: { gridColumn: '3', gridRow: '1' }, label: '↑' },
  { zone: 'og-up-right-third', style: { gridColumn: '4', gridRow: '1' }, label: '↑' },
  { zone: 'og-up-right-corner', style: { gridColumn: '5', gridRow: '1' }, label: '↗' },

  { zone: 'og-left-up-third', style: { gridColumn: '1', gridRow: '2' }, label: '←' },
  { zone: 1, style: { gridColumn: '2', gridRow: '2' } },
  { zone: 2, style: { gridColumn: '3', gridRow: '2' } },
  { zone: 3, style: { gridColumn: '4', gridRow: '2' } },
  { zone: 'og-right-up-third', style: { gridColumn: '5', gridRow: '2' }, label: '→' },

  { zone: 'og-left-middle-third', style: { gridColumn: '1', gridRow: '3' }, label: '←' },
  { zone: 4, style: { gridColumn: '2', gridRow: '3' } },
  { zone: 5, style: { gridColumn: '3', gridRow: '3' } },
  { zone: 6, style: { gridColumn: '4', gridRow: '3' } },
  { zone: 'og-right-middle-third', style: { gridColumn: '5', gridRow: '3' }, label: '→' },

  { zone: 'og-left-down-third', style: { gridColumn: '1', gridRow: '4' }, label: '←' },
  { zone: 7, style: { gridColumn: '2', gridRow: '4' } },
  { zone: 8, style: { gridColumn: '3', gridRow: '4' } },
  { zone: 9, style: { gridColumn: '4', gridRow: '4' } },
  { zone: 'og-right-down-third', style: { gridColumn: '5', gridRow: '4' }, label: '→' },

  { zone: 'og-down-left-corner', style: { gridColumn: '1', gridRow: '5' }, label: '↙' },
  { zone: 'og-down-left-third', style: { gridColumn: '2', gridRow: '5' }, label: '↓' },
  { zone: 'og-down-middle-third', style: { gridColumn: '3', gridRow: '5' }, label: '↓' },
  { zone: 'og-down-right-third', style: { gridColumn: '4', gridRow: '5' }, label: '↓' },
  { zone: 'og-down-right-corner', style: { gridColumn: '5', gridRow: '5' }, label: '↘' },
]

// Colorblind-safe diverging scale (Okabe-Ito palette), used for BOTH heat
// maps below. Deliberately avoids a green<->red axis — that's exactly the
// pair confused by red-green colorblindness (the most common form). Blue
// (good) to vermillion/orange (bad) instead, quantized into 5 distinct
// bands rather than a smooth blend so adjacent values read as clearly
// different colors, not a subtle gradient shift.
const HEAT_BANDS: Array<{ min: number; bg: string; fg: string }> = [
  { min: 0.8, bg: '#0072B2', fg: '#ffffff' }, // strong blue — best
  { min: 0.6, bg: '#56B4E9', fg: '#0d1526' }, // sky blue
  { min: 0.4, bg: '#F0E442', fg: '#0d1526' }, // yellow — neutral middle
  { min: 0.2, bg: '#E69F00', fg: '#0d1526' }, // orange
  { min: -1, bg: '#D55E00', fg: '#ffffff' },  // vermillion — worst
]

function heatColor(rate: number): { bg: string; fg: string } {
  for (const band of HEAT_BANDS) if (rate >= band.min) return { bg: band.bg, fg: band.fg }
  return HEAT_BANDS[HEAT_BANDS.length - 1]
}

export default function ZoneGrid(props: {
  selected?: Zone | null
  onSelect?: (z: Zone) => void
  heat?: Map<Zone, BattleAgg>
  grouping?: Map<Zone, GroupingCell> // command grouping heat map (granular only, see stats.ts commandGrouping)
  compact?: boolean
  granular?: boolean
}) {
  const { selected, onSelect, heat, grouping, compact, granular } = props
  const CELLS = granular ? CELLS_GRANULAR : CELLS_COARSE
  const resolution = granular ? 'granular' : 'coarse'
  return (
    <div className={`zone-grid ${compact ? 'zone-grid-compact' : ''} ${granular ? 'zone-grid-granular' : ''}`}>
      {CELLS.map(({ zone, style, label }) => {
        const inZone = typeof zone === 'number'
        let bg: string | undefined
        let fg: string | undefined
        let text = label ?? ''
        if (grouping) {
          if (selected !== null && selected !== undefined) {
            // Drill-down mode: the selected target zone keeps its original
            // grouping color (frozen), every other zone shows a neutral
            // background with the count of pitches (aimed at the selected
            // target) that actually LANDED there. Tapping the selected zone
            // again (handled by the caller toggling `selected` back to null)
            // returns to the normal overall heat map.
            if (zone === selected) {
              const cell = grouping.get(zone)
              if (cell) {
                const c = groupingColor(cell.avgDistance)
                bg = c.bg
                fg = c.fg
              }
              // Show how many pitches actually LANDED on target, matching
              // every other zone's meaning (a landing-spot count) — not the
              // total aimed here, which double-counted alongside the
              // other zones' landed-elsewhere counts.
              text = cell ? String(cell.actualBreakdown.get(zone) ?? 0) : ''
            } else {
              const selectedCell = grouping.get(selected)
              const landedCount = selectedCell?.actualBreakdown.get(zone) ?? 0
              if (landedCount > 0) {
                bg = '#475569' // neutral slate, distinct from the grouping scale
                fg = '#ffffff'
                text = String(landedCount)
              } else {
                text = ''
              }
            }
          } else {
            const cell = grouping.get(zone)
            if (cell) {
              const c = groupingColor(cell.avgDistance)
              bg = c.bg
              fg = c.fg
              text = String(cell.count)
            } else if (!onSelect) {
              text = ''
            }
          }
        } else if (heat) {
          // Normalize so a pitch logged at the OTHER resolution (e.g. from a
          // Standard-preset stretch, or before a coach switched settings)
          // still counts toward this cell instead of silently vanishing.
          let agg: BattleAgg | undefined
          if (inZone) {
            agg = heat.get(zone)
          } else {
            for (const [z, a] of heat) {
              if (normalizeZone(z, resolution) === zone) {
                agg = agg
                  ? { good: agg.good + a.good, bad: agg.bad + a.bad, balls: agg.balls + a.balls, total: agg.total + a.total }
                  : a
              }
            }
          }
          if (agg && agg.total > 0) {
            const rate = battleRate(agg)
            if (rate === null) {
              bg = '#64748b'
              fg = '#ffffff'
            } else {
              const c = heatColor(rate)
              bg = c.bg
              fg = c.fg
            }
            text = String(agg.total)
          } else if (!onSelect) {
            // pure heat map (report pages): blank empty cells
            text = ''
          }
        }
        const cls = [
          'zone-cell',
          inZone ? 'zone-in' : 'zone-out',
          selected === zone ? 'zone-selected' : '',
        ].join(' ')
        return (
          <button
            key={String(zone)}
            type="button"
            className={cls}
            style={{ ...style, ...(bg ? { background: bg, color: fg } : {}) }}
            onClick={onSelect ? () => onSelect(zone) : undefined}
            data-zone={String(zone)}
            disabled={!onSelect}
          >
            {text}
          </button>
        )
      })}
      {/* Strike-zone border + internal tic-tac-toe lines, drawn on top of
          whatever's in the cells (color, numbers) so the 3x3 zone boundary
          stays visible even when the grid is busy with heat-map data. Pure
          overlay — no pointer-events, doesn't affect taps on the cells
          beneath it. Sized to the coarse layout's 3x3 (columns/rows 2-4);
          identical placement works for granular since its 3x3 in-zone core
          sits in the same spot. */}
      <div className="zone-strike-outline" aria-hidden="true" />
    </div>
  )
}
