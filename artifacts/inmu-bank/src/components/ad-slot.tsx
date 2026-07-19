import { Megaphone } from 'lucide-react'
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

const NINJA_ADMAX_MOBILE_SRCS = [
  'https://adm.shinobi.jp/s/e36c5e4e74950a07f9e7c9025c204e92',
  'https://adm.shinobi.jp/s/c0b9f17e093bef6243dec45abece2751',
  'https://adm.shinobi.jp/s/b25fbb1d23d8754f051cd322fc876777',
]
const NINJA_ADMAX_PC_RAIL_SRCS = [
  'https://adm.shinobi.jp/s/481377a347d76d9d3da31fb69cfb3964',
  'https://adm.shinobi.jp/s/06c2b426724793c5e5ab58c843cf7d7c',
  'https://adm.shinobi.jp/s/3ae4dfd997db92197ae038bef451ffdb',
]

const BANNER_AD_SLOT_IDS = new Set([
  'guest-hero-auth-break',
  'dashboard-recent-mid',
  'history-tabs-break',
  'transaction-list-mid',
  'points-history-mid',
  'gacha-paid-banner-break',
  'gacha-points-banner-break',
  'gacha-result-bottom',
  'pet-character-break',
  'ranking-top',
  'achievements-ranking-break',
  'profile-top',
])

function pickStableScriptSrc(slotId: string, sources: string[]) {
  const hash = Array.from(slotId).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return sources[hash % sources.length]
}

function getAdScriptSrc(slotId: string, variant: AdSlotVariant) {
  if (variant === 'rail') return pickStableScriptSrc(slotId, NINJA_ADMAX_PC_RAIL_SRCS)
  if (variant !== 'banner') return null
  if (!BANNER_AD_SLOT_IDS.has(slotId)) return null
  return pickStableScriptSrc(slotId, NINJA_ADMAX_MOBILE_SRCS)
}

export function canRenderAdSlot(slotId: string, variant: AdSlotVariant = 'banner') {
  return Boolean(getAdScriptSrc(slotId, variant)) || showAdPlaceholders
}

function NinjaAdMaxFrame({ src, slotId, variant }: { src: string; slotId: string; variant: AdSlotVariant }) {
  const width = variant === 'rail' ? 300 : 320
  const height = variant === 'rail' ? 250 : 64
  const srcDoc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=${width}, initial-scale=1">
    <style>html,body{margin:0;padding:0;width:${width}px;min-height:${height}px;overflow:visible;background:transparent;}body{display:flex;align-items:center;justify-content:center;}</style>
  </head>
  <body>
    <!-- admax -->
    <script src="${src}"></script>
    <!-- admax -->
  </body>
</html>`

  return (
    <iframe
      title={`admax-${slotId}`}
      srcDoc={srcDoc}
      width={width}
      height={height}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className="block border-0"
    />
  )
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
        <NinjaAdMaxFrame src={scriptSrc} slotId={slotId} variant={variant} />
      ) : (
        <div className="flex min-h-[inherit] items-center justify-center gap-2 px-4 py-5">
          <Megaphone className="size-4 opacity-55" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">AD</span>
        </div>
      )}
    </aside>
  )
}
