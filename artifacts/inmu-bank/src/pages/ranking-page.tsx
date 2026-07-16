import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { RankingView } from '@/components/ranking-view'
import type { MonthlyVolumeRow, MonthlyVolumeSeason } from '@/components/ranking-view'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'

type InmuRow   = { rank: number; userId: string; displayName: string; balance: number; showBalance: boolean; totalReceived: number; participations: number }
type PointsRow = { rank: number; userId: string; displayName: string; points: number; participations: number }
type CompositeRow = { rank: number; userId: string; displayName: string; balance: number; points: number; clears: number; score: number }

type CompositeResult = {
  ranking: CompositeRow[]
  myRank: number | null
  totalUsers: number
}
type MonthlyVolumeResult = {
  season: MonthlyVolumeSeason
  formula: string
  ranking: MonthlyVolumeRow[]
}

export function RankingPage() {
  const { profile, unread } = useAuth()
  const profileUserId = (profile as { userId?: string } | null)?.userId
  const [inmuRows,   setInmuRows]   = useState<InmuRow[]>([])
  const [pointsRows, setPointsRows] = useState<PointsRow[]>([])
  const [compositeRows, setCompositeRows] = useState<CompositeRow[]>([])
  const [monthlyVolumeRows, setMonthlyVolumeRows] = useState<MonthlyVolumeRow[]>([])
  const [monthlyVolumeSeason, setMonthlyVolumeSeason] = useState<MonthlyVolumeSeason | null>(null)
  const [monthlyVolumeFormula, setMonthlyVolumeFormula] = useState('')
  const [myCompositeRank, setMyCompositeRank] = useState<number | null>(null)
  const [myInmuRank, setMyInmuRank] = useState<number | null>(null)
  const [myPointsRank, setMyPointsRank] = useState<number | null>(null)
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    const userId = profileUserId
    setLoading(true)
    try {
      await Promise.all([
        fetch('/api/ranking', { credentials: 'include' })
          .then(r => r.ok ? r.json() : [])
          .then((d: InmuRow[]) => {
            if (Array.isArray(d)) {
              setInmuRows(d)
              if (userId) setMyInmuRank(d.find(r => r.userId === userId)?.rank ?? null)
            }
          })
          .catch(() => {}),

        fetch('/api/ranking/points', { credentials: 'include' })
          .then(r => r.ok ? r.json() : [])
          .then((d: PointsRow[]) => {
            if (Array.isArray(d)) {
              setPointsRows(d)
              if (userId) setMyPointsRank(d.find(r => r.userId === userId)?.rank ?? null)
            }
          })
          .catch(() => {}),

        fetch('/api/ranking/composite', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((d: CompositeResult | null) => {
            if (d) {
              setCompositeRows(d.ranking ?? [])
              setMyCompositeRank(d.myRank ?? null)
              setTotalUsers(d.totalUsers ?? 0)
            }
          })
          .catch(() => {}),

        fetch('/api/ranking/monthly-volume', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((d: MonthlyVolumeResult | null) => {
            if (d) {
              setMonthlyVolumeRows(d.ranking ?? [])
              setMonthlyVolumeSeason(d.season ?? null)
              setMonthlyVolumeFormula(d.formula ?? '')
            }
          })
          .catch(() => {}),
      ])
    } finally {
      setLoading(false)
    }
  }, [profileUserId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_ranking">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0 h-8" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          更新
        </Button>
      </PageHeader>
      <RankingView
        inmuRows={inmuRows}
        pointsRows={pointsRows}
        compositeRows={compositeRows}
        monthlyVolumeRows={monthlyVolumeRows}
        monthlyVolumeSeason={monthlyVolumeSeason}
        monthlyVolumeFormula={monthlyVolumeFormula}
        myCompositeRank={myCompositeRank}
        myInmuRank={myInmuRank}
        myPointsRank={myPointsRank}
        totalUsers={totalUsers}
        currentUserId={profileUserId}
      />
    </AppShell>
  )
}
