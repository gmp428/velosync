// VeloSync mark: a home-plate / badge silhouette (flat rounded-corner top,
// angled sides converging to a point at the bottom) rendered as a bold,
// unfilled outline, with a bold interlocking "VS" monogram built from the
// same stroke weight as the badge itself.
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
      {/* Badge outline: flat top with rounded outer corners, straight sides,
          then angled edges meeting at a point roughly as tall as the
          rectangular section above it (home-plate / pentagon-badge shape). */}
      <path
        d="M11 5
           H37
           A4 4 0 0 1 41 9
           V24
           L24 43
           L7 24
           V9
           A4 4 0 0 1 11 5
           Z"
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Interlocking "VS" monogram, drawn as bold strokes matching the
          badge outline's line weight. The V's right leg and the S's upper
          stroke overlap near the vertical center so the two letters read
          as one connected mark. */}
      <g fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        {/* V */}
        <path d="M13 14 L19.5 30 L24.5 17.5" />
        {/* S — starts tucked just behind the V's lower-right leg so the
            two letters interlock near the middle of the badge. */}
        <path d="M33.5 16.5 C29 14.5 24.5 16 24.5 19.5 C24.5 23.5 32 22.5 32 26.5 C32 30.5 26 31.5 22.5 29" />
      </g>
    </svg>
  )
}
