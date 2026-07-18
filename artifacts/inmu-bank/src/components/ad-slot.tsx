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
  if (variant === 'banner' && slotId === 'guest-hero-auth-break') return NINJA_ADMAX_BANNER_SRC
  return null
}

export function canRenderAdSlot(slotId: string, variant: AdSlotVariant = 'banner') {
  return Boolean(getAdScriptSrc(slotId, variant)) || showAdPlaceholders
}

function NinjaAdMaxScript({ src, slotId }: { src: string; slotId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const loadIdRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const loadId = loadIdRef.current + 1
    loadIdRef.current = loadId
    let active = true
    let restoreTimer: number | null = null
    const originalWrite = document.write
    const originalWriteln = document.writeln
    const restoreDocumentWrite = () => {
      if (document.write !== originalWrite) document.write = originalWrite
      if (document.writeln !== originalWriteln) document.writeln = originalWriteln
      if (restoreTimer !== null) {
        window.clearTimeout(restoreTimer)
        restoreTimer = null
      }
    }
    const writeIntoSlot = (...chunks: string[]) => {
      if (!active || loadIdRef.current !== loadId) return
      const html = chunks.join('')
      if (!html.trim()) return
      const wrapper = document.createElement('div')
      wrapper.innerHTML = html
      while (wrapper.firstChild) container.appendChild(wrapper.firstChild)
    }

    container.innerHTML = ''
    const script = document.createElement('script')
    script.src = src
    script.type = 'text/javascript'
    script.onload = () => {
      console.info(`[AdMax] script loaded: ${slotId}`)
      restoreTimer = window.setTimeout(restoreDocumentWrite, 1500)
    }
    script.onerror = (event) => {
      console.error(`[AdMax] script failed: ${slotId}`, event)
      restoreDocumentWrite()
    }
    document.write = writeIntoSlot as typeof document.write
    document.writeln = ((...chunks: string[]) => writeIntoSlot(...chunks, '\n')) as typeof document.writeln
    container.appendChild(script)

    return () => {
      active = false
      restoreDocumentWrite()
      container.innerHTML = ''
    }
  }, [src, slotId])

  return <div ref={containerRef} className="flex min-h-[inherit] w-full min-w-[320px] items-center justify-center" />
}

export function AdSlot({ slotId, variant = 'banner', className }: AdSlotProps) {
  const scriptSrc = adEnabled ? getAdScriptSrc(slotId, variant) : null
  if (!scriptSrc && !showAdPlaceholders) return null

  return (
    <aside
      aria-label="広告"
      data-ad-slot={slotId}
      className={cn(
        'overflow-visible rounded-lg border border-border/70 bg-card/55 text-muted-foreground shadow-sm',
        variant === 'banner'
          ? 'mx-auto min-h-[64px] w-full min-w-[320px] max-w-[360px]'
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
