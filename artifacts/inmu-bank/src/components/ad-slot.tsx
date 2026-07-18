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

const NINJA_ADMAX_COMMON_BOTTOM_SRC = 'https://adm.shinobi.jp/s/c0b9f17e093bef6243dec45abece2751'
const NINJA_ADMAX_GACHA_RESULT_SRC = 'https://adm.shinobi.jp/s/b25fbb1d23d8754f051cd322fc876777'

function getAdScriptSrc(slotId: string, variant: AdSlotVariant) {
  if (variant === 'banner' && slotId === 'gacha-result-bottom') return NINJA_ADMAX_GACHA_RESULT_SRC
  if (variant === 'banner') return NINJA_ADMAX_COMMON_BOTTOM_SRC
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
    script.async = true
    script.dataset.slotId = slotId
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [src, slotId])

  return <div ref={containerRef} className="flex w-full items-center justify-center" />
}

export function AdSlot({ slotId, variant = 'banner', className }: AdSlotProps) {
  const scriptSrc = adEnabled ? getAdScriptSrc(slotId, variant) : null
  if (!scriptSrc && !showAdPlaceholders) return null

  return (
    <aside
      aria-label="広告"
      data-ad-slot={slotId}
      className={cn(
        scriptSrc
          ? 'mx-auto flex w-full justify-center overflow-hidden'
          : 'overflow-hidden rounded-lg border border-border/70 bg-card/55 text-muted-foreground shadow-sm',
        variant === 'banner'
          ? scriptSrc ? 'max-w-[360px]' : 'mx-auto min-h-[58px] w-full max-w-[360px]'
          : scriptSrc ? 'w-full' : 'min-h-[280px] w-full',
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
