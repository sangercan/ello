type BrandMarkProps = {
  className?: string
  iconClassName?: string
  textClassName?: string
  showText?: boolean
}

const ICON_VERSION = '20260314-3'

export default function BrandMark({
  className = '',
  iconClassName = 'w-8 h-8 rounded-lg',
  textClassName = 'text-xl font-bold',
  showText = true,
}: BrandMarkProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <img
        src={`/brand-icon.png?v=${ICON_VERSION}`}
        alt="Ello Social"
        className={iconClassName}
        loading="eager"
        decoding="async"
      />
      {showText && <span className={textClassName}>Ello Social</span>}
    </div>
  )
}
