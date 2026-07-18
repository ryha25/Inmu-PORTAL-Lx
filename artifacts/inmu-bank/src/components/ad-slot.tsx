import { Megaphone } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type AdSlotVariant = 'banner' | 'rail'

type AdSlotProps = {
  slotId: string
  variant?: AdSlotVariant
  className?: string
}

const showAdPlaceholders =
  import.meta.env.VITE_AD_PLACEHOLDERS === 'true'

const adEnabled = import.meta.env.VITE_NINJA_ADMAX_ENABLED !== 'false'

const NINJA_ADMAX_BANNER_SRC = 'https://adm.shinobi.jp/s/e36c5e4e74950a07f9e7c9025c204e92'

function getAdScriptSrc(slotId: string, variant: AdSlotVariant) {
  if (variant === 'banner') return NINJA_ADMAX_BANNER_SRC
  return null
}

export function canRenderAdSlot(slotId: string, variant: AdSlotVariant = 'banner') {
  return Boolean(getAdScriptSrc(slotId, variant)) || showAdPlaceholders
}

function NinjaAdMaxScript({ src, slotId }: { src: string; slotId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''
    const script = document.createElement('script')
    script.src = src
    script.type = 'text/javascript'
    script.dataset.slotId = slotId
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [src, slotId])

  return <div ref={containerRef} className="flex min-h-[inherit] w-full items-center justify-center" />
}

export function AdSlot({ slotId, variant = 'banner', className }: AdSlotProps) {
  const scriptSrc = adEnabled ? getAdScriptSrc(slotId, variant) : null
  if (!scriptSrc && !showAdPlaceholders) return null

  return (
    <aside
      aria-label="広告"
      data-ad-slot={slotId}
      className={cn(
        'overflow-hidden rounded-lg border border-border/70 bg-card/55 text-muted-foreground shadow-sm',
        variant === 'banner'
          ? 'mx-auto min-h-[58px] w-full max-w-[360px]'
          : 'min-h-[280px] w-full',
        className,
      )}
    >
      {scriptSrc ? (
        <NinjaAdMaxScript src={scriptSrc} slotId={slotId} />
      ) : (
        <div className="flex min-h-[inherit] items-center justify-center gap-2 px-4 py-5">
          <Megaphone className="size-4 opacity-55" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">AD</span>
        </div>
      )}
    </aside>
  )
}
