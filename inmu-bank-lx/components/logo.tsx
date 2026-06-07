import { cn } from '@/lib/utils'

export function Logo({
  className,
  size = 36,
}: {
  className?: string
  size?: number
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="relative flex shrink-0 items-center justify-center rounded-xl"
        style={{
          width: size,
          height: size,
          background:
            'linear-gradient(135deg, oklch(0.86 0.13 88), oklch(0.74 0.14 70))',
          boxShadow: '0 0 20px oklch(0.82 0.13 85 / 0.35)',
        }}
        aria-hidden="true"
      >
        <span
          className="font-mono font-bold text-background"
          style={{ fontSize: size * 0.5 }}
        >
          ¥
        </span>
      </div>
    </div>
  )
}
