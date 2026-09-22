type LogoProps = {
  height?: number
  className?: string
  /** Use the dark-background lockup (white shield outline + red V, white S)
   * on the permanent dark "broadcast bezel" header/nav chrome. The default
   * horizontal PNG is black text and disappears on a dark background. */
  dark?: boolean
}

export default function Logo({ height = 40, className, dark = false }: LogoProps) {
  const src = dark
    ? `${import.meta.env.BASE_URL}logos/velosync-badge-dark.svg`
    : `${import.meta.env.BASE_URL}logos/velosync-horizontal.png`
  return (
    <img
      src={src}
      alt="VeloSync"
      height={height}
      className={className}
      style={{ display: 'block', height, width: 'auto' }}
    />
  )
}
