import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TYPE_MAP: Record<string, { label: string; className: string; outgoing: boolean }> = {
  reward:        { label: '報酬',        className: 'bg-primary/15 text-primary border-primary/30',             outgoing: false },
  airdrop:       { label: 'エアドロップ', className: 'bg-accent/15 text-accent border-accent/30',               outgoing: false },
  inmu_send:     { label: 'INMU送金',    className: 'bg-chart-5/15 text-chart-5 border-chart-5/30',             outgoing: false },
  points_send:   { label: 'ポイント送金', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',          outgoing: false },
  points_deduct: { label: 'ポイント減算', className: 'bg-destructive/15 text-destructive border-destructive/30', outgoing: true  },
  deposit:       { label: '入金',        className: 'bg-chart-5/15 text-chart-5 border-chart-5/30',             outgoing: false },
  receive:       { label: '受取',        className: 'bg-chart-5/15 text-chart-5 border-chart-5/30',             outgoing: false },
  withdraw:      { label: '出金',        className: 'bg-destructive/15 text-destructive border-destructive/30', outgoing: true  },
  send:          { label: '送金',        className: 'bg-destructive/15 text-destructive border-destructive/30', outgoing: true  },
  buy:           { label: 'DEX購入',     className: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30', outgoing: false },
  sell:          { label: 'DEX売却',     className: 'bg-red-500/15 text-red-500 border-red-500/30',             outgoing: true  },
}

export function TxTypeBadge({ type }: { type: string }) {
  const cfg = TYPE_MAP[type]
  return (
    <Badge variant="outline" className={cn('font-medium', cfg?.className ?? '')}>
      {cfg?.label ?? type}
    </Badge>
  )
}

export function txSignFor(type: string) {
  return TYPE_MAP[type]?.outgoing ? '-' : '+'
}

export function isOutgoing(type: string) {
  return TYPE_MAP[type]?.outgoing ?? false
}
