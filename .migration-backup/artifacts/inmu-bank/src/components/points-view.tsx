import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/context'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Award, Flame, Trophy } from 'lucide-react'

type PointsData = {
  totalPoints: number
  streak: number
  alreadyClaimed: boolean
  history: { id: number; amount: string; type: string; createdAt: string }[]
  leaderboard: { rank: number; userId: string; displayName: string; points: number }[]
}

export function PointsView({ data, onRefresh }: { data: PointsData; onRefresh: () => void }) {
  const { t, locale } = useI18n()

  async function handleClaim() {
    try {
      const res = await fetch('/api/points/claim-daily', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Error')
      }
      const result = await res.json() as { points: number; streak: number }
      toast.success(`+${result.points} pts (streak: ${result.streak}日)`)
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2"><Award className="size-4 text-primary" /><p className="text-xs font-medium text-muted-foreground">{t('points_title')}</p></div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums gold-text">{data.totalPoints}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2"><Flame className="size-4 text-destructive" /><p className="text-xs font-medium text-muted-foreground">Streak</p></div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-destructive">{data.streak}日</p>
        </Card>
      </div>

      <Button
        onClick={handleClaim}
        disabled={data.alreadyClaimed}
        className="min-h-12 gap-2 text-base font-bold"
      >
        <Award className="size-5" />
        {data.alreadyClaimed ? t('already_claimed') : t('claim_daily')}
      </Button>

      <Card className="border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Trophy className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">{t('points_leaderboard')}</h2>
        </div>
        <ul className="divide-y divide-border">
          {data.leaderboard.slice(0, 10).map((u) => (
            <li key={u.userId} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 text-center text-xs font-bold text-muted-foreground">{u.rank}</span>
              <span className="flex-1 text-sm font-medium">{u.displayName[0]}{'*'.repeat(Math.max(0, u.displayName.length - 2))}{u.displayName[u.displayName.length - 1]}</span>
              <span className="font-mono text-sm font-bold">{u.points} pts</span>
            </li>
          ))}
        </ul>
      </Card>

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
