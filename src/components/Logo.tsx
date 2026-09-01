type LogoProps = {
  className?: string
}

/** Official horizontal JPEG, scaled in CSS — not redrawn. */
export default function Logo({ className }: LogoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logos/velosync-horizontal.jpeg`}
      alt="VeloSync"
      className={className}
      width={1792}
      height={1008}
    />
  )
}
