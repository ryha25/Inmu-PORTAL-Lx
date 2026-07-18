import { Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

type AdSlotVariant = 'banner' | 'rail'

type AdSlotProps = {
  slotId: string
  variant?: AdSlotVariant
  className?: string
}

const showAdPlaceholders =
  import.meta.env.DEV || import.meta.env.VITE_AD_PLACEHOLDERS === 'true'

const adEnabled = import.meta.env.VITE_NINJA_ADMAX_ENABLED === 'true'

export function AdSlot({ slotId, variant = 'banner', className }: AdSlotProps) {
  if (!adEnabled && !showAdPlaceholders) return null

  return (
    <aside
      aria-label="広告"
      data-ad-slot={slotId}
      className={cn(
        'overflow-hidden rounded-lg border border-border/70 bg-card/55 text-muted-foreground shadow-sm',
        variant === 'banner'
          ? 'min-h-[92px] w-full'
          : 'min-h-[280px] w-full',
        className,
      )}
    >
      {adEnabled ? (
        <div id={`ninja-admax-${slotId}`} className="min-h-[inherit] w-full" />
      ) : (
        <div className="flex min-h-[inherit] items-center justify-center gap-2 px-4 py-5">
          <Megaphone className="size-4 opacity-55" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">AD</span>
        </div>
      )}
    </aside>
  )
}
