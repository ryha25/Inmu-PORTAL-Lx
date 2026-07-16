import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'
import { RankingView } from '@/components/ranking-view'
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

type InmuRow      = { rank: number; userId: string; displayName: string; balance: number; showBalance: boolean; totalReceived: number; participations: number }
type PointsRow    = { rank: number; userId: string; displayName: string; points: number; participations: number }
type CompositeRow = { rank: number; userId: string; displayName: string; balance: number; points: number; clears: number; score: number }
type CompositeResult = { ranking: CompositeRow[]; myRank: number | null; totalUsers: number }

function summaryValueSize(value: number) {
  const length = Math.abs(Math.trunc(value)).toLocaleString().length
  if (length >= 13) return 'text-sm'
  if (length >= 10) return 'text-base'
  if (length >= 8) return 'text-lg'
  return 'text-2xl'
}

export function AchievementsPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const profileUserId = (profile as { userId?: string } | null)?.userId
  const [stats,         setStats]         = useState<CommunityStats | null>(null)
  const [inmuRows,      setInmuRows]      = useState<InmuRow[]>([])
  const [pointsRows,    setPointsRows]    = useState<PointsRow[]>([])
  const [compositeRows, setCompositeRows] = useState<CompositeRow[]>([])
  const [myCompositeRank, setMyCompositeRank] = useState<number | null>(null)
  const [myInmuRank,    setMyInmuRank]    = useState<number | null>(null)
  const [myPointsRank,  setMyPointsRank]  = useState<number | null>(null)
  const [totalUsers,    setTotalUsers]    = useState(0)

  useEffect(() => {
    const userId = profileUserId

    fetch('/api/community', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d) })

    fetch('/api/ranking', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((d: InmuRow[]) => {
        if (Array.isArray(d)) {
          setInmuRows(d)
          if (userId) setMyInmuRank(d.find(r => r.userId === userId)?.rank ?? null)
        }
      })

    fetch('/api/ranking/points', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((d: PointsRow[]) => {
        if (Array.isArray(d)) {
          setPointsRows(d)
          if (userId) setMyPointsRank(d.find(r => r.userId === userId)?.rank ?? null)
        }
      })

    fetch('/api/ranking/composite', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: CompositeResult | null) => {
        if (d) {
          setCompositeRows(d.ranking ?? [])
          setMyCompositeRank(d.myRank ?? null)
          setTotalUsers(d.totalUsers ?? 0)
        }
      })
  }, [profileUserId])

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
              <p className={`min-w-0 whitespace-nowrap font-mono font-bold tabular-nums text-primary ${summaryValueSize(stats.monthlyPoints)}`}>
                {stats.monthlyPoints.toLocaleString()}
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
              <p className={`min-w-0 whitespace-nowrap font-mono font-bold tabular-nums gold-text ${summaryValueSize(stats.totalReceivedInmu)}`}>
                {stats.totalReceivedInmu.toLocaleString()}
              </p>
            </Card>
          </div>

          {/* あなたの順位（総合ランキングと同一ロジック）*/}
          <Card className="border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-primary" />
                <p className="text-sm font-medium">{t('your_rank')}</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono font-bold text-lg gold-text">
                  {myCompositeRank ?? stats.rank}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">位 / {totalUsers || stats.totalUsers}人</span>
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {(myCompositeRank ?? stats.rank) <= 3
                ? '🏆 Top 3! 素晴らしい成績です！'
                : (myCompositeRank ?? stats.rank) <= 10
                ? '🥇 Top 10! 上位入賞中！'
                : (myCompositeRank ?? stats.rank) <= (totalUsers || stats.totalUsers) * 0.3
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
      <RankingView
        inmuRows={inmuRows}
        pointsRows={pointsRows}
        compositeRows={compositeRows}
        myCompositeRank={myCompositeRank}
        myInmuRank={myInmuRank}
        myPointsRank={myPointsRank}
        totalUsers={totalUsers}
        currentUserId={profileUserId}
      />
    </AppShell>
  )
}
