import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { formatDate } from '@/lib/format'
import { Award, Flame } from 'lucide-react'

type PointsData = {
  totalPoints: number
  streak: number
  alreadyClaimed: boolean
  history: { id: number; amount: string; type: string; createdAt: string }[]
  leaderboard: { rank: number; userId: string; displayName: string; points: number }[]
}

export function PointsView({ data }: { data: PointsData; onRefresh: () => void }) {
  const { t, locale } = useI18n()

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Award className="size-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">{t('points_title')}</p>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums gold-text">{data.totalPoints}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-destructive" />
            <p className="text-xs font-medium text-muted-foreground">Streak</p>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-destructive">{data.streak}日</p>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('points_history')}</h2>
        </div>
        {data.history.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.history.slice(0, 20).map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize">{h.type.replace('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(h.createdAt, locale)}</p>
                </div>
                <span className="font-mono text-sm font-bold text-chart-5">+{h.amount} pts</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
