import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'
import { RankingView } from '@/components/ranking-view'
import { StatCard } from '@/components/stat-card'
import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { Trophy, Flame, Star, Calendar, Coins, Users } from 'lucide-react'

type CommunityStats = {
  participations: number
  receiveCount: number
  totalReceivedInmu: number
  rank: number
  totalUsers: number
  monthlyPoints: number
  loginStreak: number
}

type InmuRow   = { rank: number; userId: string; displayName: string; balance: number; totalReceived: number; participations: number }
type PointsRow = { rank: number; userId: string; displayName: string; points: number; participations: number }

export function AchievementsPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [stats, setStats] = useState<CommunityStats | null>(null)
  const [inmuRows,   setInmuRows]   = useState<InmuRow[]>([])
  const [pointsRows, setPointsRows] = useState<PointsRow[]>([])

  useEffect(() => {
    fetch('/api/community',        { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(d => { if (d) setStats(d) })
    fetch('/api/ranking',          { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setInmuRows(d) })
    fetch('/api/ranking/points',   { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setPointsRows(d) })
  }, [])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_achievements" />

      {/* ── 実績サマリー ── */}
      {stats ? (
        <div className="flex flex-col gap-4 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="size-4 text-orange-500" />
                <p className="text-xs font-medium text-muted-foreground">{t('login_streak')}</p>
              </div>
              <p className="font-mono text-2xl font-bold tabular-nums text-orange-500">
                {stats.loginStreak}
                <span className="ml-1 text-sm font-normal text-muted-foreground">日</span>
              </p>
            </Card>
            <Card className="border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="size-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground">{t('total_points')}</p>
              </div>
              <p className="font-mono text-2xl font-bold tabular-nums text-primary">
                {stats.monthlyPoints.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-muted-foreground">pts</span>
              </p>
            </Card>
            <Card className="border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="size-4 text-accent" />
                <p className="text-xs font-medium text-muted-foreground">{t('events_participated')}</p>
              </div>
              <p className="font-mono text-2xl font-bold tabular-nums">
                {stats.participations}
                <span className="ml-1 text-sm font-normal text-muted-foreground">回</span>
              </p>
            </Card>
            <Card className="border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="size-4 text-yellow-500" />
                <p className="text-xs font-medium text-muted-foreground">{t('total_received_inmu')}</p>
              </div>
              <p className="font-mono text-2xl font-bold tabular-nums gold-text">
                {stats.totalReceivedInmu.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-muted-foreground">INMU</span>
              </p>
            </Card>
          </div>

          {/* ランク情報 */}
          <Card className="border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-primary" />
                <p className="text-sm font-medium">{t('your_rank')}</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono font-bold text-lg gold-text">
                  {stats.rank}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">位 / {stats.totalUsers}人</span>
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {stats.rank <= 3
                ? '🏆 Top 3! 素晴らしい成績です！'
                : stats.rank <= 10
                ? '🥇 Top 10! 上位入賞中！'
                : stats.rank <= stats.totalUsers * 0.3
                ? '💪 上位30%に入っています！'
                : '📊 もっとINMUをアクティブに使いましょう！'}
            </p>
          </Card>
        </div>
      ) : (
        <div className="py-10 text-center text-muted-foreground mb-4">{t('loading')}</div>
      )}

      {/* ── ランキング ── */}
      <div className="flex items-center gap-2 mb-3">
        <Users className="size-4 text-primary" />
        <h2 className="font-semibold text-sm">{t('ranking_title')}</h2>
      </div>
      <RankingView inmuRows={inmuRows} pointsRows={pointsRows} />
    </AppShell>
  )
}
