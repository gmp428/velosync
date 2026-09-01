const base = import.meta.env.BASE_URL

type MarkProps = {
  size?: number
  className?: string
}

/** Official VS home-plate mark (black on white JPEG). */
export default function Logo({ size = 36, className }: MarkProps) {
  return (
    <img
      src={`${base}vs-mark.jpeg`}
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  )
}

/** Official horizontal VeloSync wordmark (baseball as the o). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src={`${base}velosync-wordmark.jpeg`}
      alt="VeloSync"
      className={className}
      draggable={false}
    />
  )
}
