// VeloSync shield/badge mark: a home-plate/police-badge style pentagon shield
// with a bold "VS" monogram, dark navy stroke + text on a white/transparent fill.
export const LOGO_NAVY = '#0F172A'

type LogoProps = {
  size?: number
  color?: string
  className?: string
}

export default function Logo({ size = 26, color = LOGO_NAVY, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      style={{ display: 'block' }}
    >
      {/* Shield: flat top, pointed rounded bottom (home-plate / badge silhouette) */}
      <path
        d="M8 6 H40 V22 C40 33 32 41 24 45 C16 41 8 33 8 22 Z"
        fill="#ffffff"
        stroke={color}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <text
        x="24"
        y="27"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontWeight="800"
        fontSize="16"
        fill={color}
      >
        VS
      </text>
    </svg>
  )
}
