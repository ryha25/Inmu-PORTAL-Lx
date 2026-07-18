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

const NINJA_ADMAX_GUEST_PRIMARY_SRC = 'https://adm.shinobi.jp/s/e36c5e4e74950a07f9e7c9025c204e92'
const NINJA_ADMAX_GENERAL_BANNER_SRC = 'https://adm.shinobi.jp/s/c0b9f17e093bef6243dec45abece2751'
const NINJA_ADMAX_RESULT_BANNER_SRC = 'https://adm.shinobi.jp/s/b25fbb1d23d8754f051cd322fc876777'
const NINJA_ADMAX_PC_RAIL_SRCS = [
  'https://adm.shinobi.jp/s/481377a347d76d9d3da31fb69cfb3964',
  'https://adm.shinobi.jp/s/06c2b426724793c5e5ab58c843cf7d7c',
  'https://adm.shinobi.jp/s/3ae4dfd997db92197ae038bef451ffdb',
]

function pickStableScriptSrc(slotId: string, sources: string[]) {
  const hash = Array.from(slotId).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return sources[hash % sources.length]
}

function isPrimaryMobileBannerSlot(slotId: string) {
  return [
    'achievements-top',
    'dashboard-top',
    'gacha-paid-banner-break',
    'guest-hero-auth-break',
    'history-top',
    'pet-top',
    'points-top',
    'profile-top',
    'ranking-top',
  ].includes(slotId)
}

function getAdScriptSrc(slotId: string, variant: AdSlotVariant) {
  if (variant === 'rail') return pickStableScriptSrc(slotId, NINJA_ADMAX_PC_RAIL_SRCS)
  if (variant !== 'banner') return null
  if (!isPrimaryMobileBannerSlot(slotId)) return null
  if (slotId === 'guest-hero-auth-break') return NINJA_ADMAX_GUEST_PRIMARY_SRC
  if (slotId === 'gacha-result-bottom') return NINJA_ADMAX_RESULT_BANNER_SRC
  return NINJA_ADMAX_GENERAL_BANNER_SRC
}

export function canRenderAdSlot(slotId: string, variant: AdSlotVariant = 'banner') {
  return Boolean(getAdScriptSrc(slotId, variant)) || showAdPlaceholders
}

let ninjaAdMaxQueue = Promise.resolve()

function NinjaAdMaxScript({ src, slotId }: { src: string; slotId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const loadIdRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const loadId = loadIdRef.current + 1
    loadIdRef.current = loadId
    let active = true
    let cleanupCurrentLoad = () => {}

    const loadScript = async () => {
      const previousLoad = ninjaAdMaxQueue
      let releaseQueue = () => {}
      ninjaAdMaxQueue = previousLoad.then(() => new Promise<void>((resolve) => {
        releaseQueue = resolve
      }))

      await previousLoad
      if (!active || loadIdRef.current !== loadId) {
        releaseQueue()
        return
      }

      let restoreTimer: number | null = null
      let timeoutTimer: number | null = null
      let finished = false
      const originalWrite = document.write
      const originalWriteln = document.writeln
      const restoreDocumentWrite = () => {
        if (document.write !== originalWrite) document.write = originalWrite
        if (document.writeln !== originalWriteln) document.writeln = originalWriteln
        if (restoreTimer !== null) {
          window.clearTimeout(restoreTimer)
          restoreTimer = null
        }
        if (timeoutTimer !== null) {
          window.clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
      }
      const finishLoad = () => {
        if (finished) return
        finished = true
        restoreTimer = window.setTimeout(() => {
          restoreDocumentWrite()
          releaseQueue()
        }, 1500)
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
        finishLoad()
      }
      script.onerror = (event) => {
        console.error(`[AdMax] script failed: ${slotId}`, event)
        finishLoad()
      }
      document.write = writeIntoSlot as typeof document.write
      document.writeln = ((...chunks: string[]) => writeIntoSlot(...chunks, '\n')) as typeof document.writeln
      cleanupCurrentLoad = () => {
        restoreDocumentWrite()
        releaseQueue()
      }
      container.appendChild(script)
      timeoutTimer = window.setTimeout(finishLoad, 5000)
    }

    void loadScript()

    return () => {
      active = false
      cleanupCurrentLoad()
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
        'overflow-visible rounded-lg border border-border/70 bg-card/55 text-muted-foreground shadow-sm',
        variant === 'banner'
          ? 'mx-auto min-h-[64px] w-full min-w-[320px] max-w-[360px]'
          : 'min-h-[250px] w-[300px] max-w-full',
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
