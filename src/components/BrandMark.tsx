import { cn } from '@/lib/cn'

// Rende solo <span>, mai un heading: se una pagina lo usa come titolo
// principale, avvolgerlo con un <h1> proprio (anche sr-only).
interface BrandMarkProps {
  iconSize?: number
  textClassName?: string
  className?: string
}

export function BrandMark({
  iconSize = 20,
  textClassName = 'text-[15px] font-semibold',
  className,
}: BrandMarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ color: 'var(--wl-brand-dark, #04342C)' }}
      >
        <path
          d="M20 4C10.5 4 4 9.5 4 18.5c0 .55.4 1 .95 1C13.5 19.5 20 13.5 20 4z"
          fill="currentColor"
        />
        <path
          d="M7 17C10.5 11.5 13.5 9 17.5 7.5"
          stroke="#FFFFFF"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span className={textClassName} style={{ color: 'var(--wl-brand-dark, #04342C)' }}>
        CasaZero
      </span>
    </span>
  )
}
