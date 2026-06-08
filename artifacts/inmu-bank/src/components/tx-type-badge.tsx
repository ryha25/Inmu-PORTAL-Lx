import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/dict'
import { cn } from '@/lib/utils'

const TYPE_MAP: Record<string, { key: TranslationKey; className: string; sign: string }> = {
  deposit: { key: 'type_deposit', className: 'bg-chart-5/15 text-chart-5 border-chart-5/30', sign: '+' },
  receive: { key: 'type_receive', className: 'bg-chart-5/15 text-chart-5 border-chart-5/30', sign: '+' },
  reward: { key: 'type_reward', className: 'bg-primary/15 text-primary border-primary/30', sign: '+' },
  airdrop: { key: 'type_airdrop', className: 'bg-accent/15 text-accent border-accent/30', sign: '+' },
  withdraw: { key: 'type_withdraw', className: 'bg-destructive/15 text-destructive border-destructive/30', sign: '-' },
  send: { key: 'type_send', className: 'bg-destructive/15 text-destructive border-destructive/30', sign: '-' },
}

export function TxTypeBadge({ type }: { type: string }) {
  const { t } = useI18n()
  const cfg = TYPE_MAP[type] ?? { key: 'all' as TranslationKey, className: '', sign: '' }
  return (
    <Badge variant="outline" className={cn('font-medium', cfg.className)}>
      {t(cfg.key)}
    </Badge>
  )
}

export function txSignFor(type: string) {
  return TYPE_MAP[type]?.sign ?? ''
}

export function isOutgoing(type: string) {
  return type === 'withdraw' || type === 'send'
}
