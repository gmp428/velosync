type LogoProps = {
  height?: number
  className?: string
}

export default function Logo({ height = 40, className }: LogoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logos/velosync-horizontal.png`}
      alt="VeloSync"
      height={height}
      className={className}
      style={{ display: 'block', height, width: 'auto' }}
    />
  )
}
