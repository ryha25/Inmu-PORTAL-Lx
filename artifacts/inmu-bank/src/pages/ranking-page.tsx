import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { RankingView } from '@/components/ranking-view'
import { PageHeader } from '@/components/page-header'
import { useAuth } from '@/hooks/use-auth'

type InmuRow   = { rank: number; userId: string; displayName: string; balance: number; showBalance: boolean; totalReceived: number; participations: number }
type PointsRow = { rank: number; userId: string; displayName: string; points: number; participations: number }
type CompositeRow = { rank: number; userId: string; displayName: string; balance: number; points: number; clears: number; score: number }

type CompositeResult = {
  ranking: CompositeRow[]
  myRank: number | null
  totalUsers: number
}

export function RankingPage() {
  const { profile, unread } = useAuth()
  const [inmuRows,   setInmuRows]   = useState<InmuRow[]>([])
  const [pointsRows, setPointsRows] = useState<PointsRow[]>([])
  const [compositeRows, setCompositeRows] = useState<CompositeRow[]>([])
  const [myCompositeRank, setMyCompositeRank] = useState<number | null>(null)
  const [myInmuRank, setMyInmuRank] = useState<number | null>(null)
  const [myPointsRank, setMyPointsRank] = useState<number | null>(null)
  const [totalUsers, setTotalUsers] = useState(0)

  useEffect(() => {
    const userId = profile?.userId

    fetch('/api/ranking', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((d: InmuRow[]) => {
        if (Array.isArray(d)) {
          setInmuRows(d)
          if (userId) {
            const found = d.find(r => r.userId === userId)
            setMyInmuRank(found?.rank ?? null)
          }
        }
      })
      .catch(() => {})

    fetch('/api/ranking/points', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((d: PointsRow[]) => {
        if (Array.isArray(d)) {
          setPointsRows(d)
          if (userId) {
            const found = d.find(r => r.userId === userId)
            setMyPointsRank(found?.rank ?? null)
          }
        }
      })
      .catch(() => {})

    fetch('/api/ranking/composite', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: CompositeResult | null) => {
        if (d) {
          setCompositeRows(d.ranking ?? [])
          setMyCompositeRank(d.myRank)
          setTotalUsers(d.totalUsers)
        }
      })
      .catch(() => {})
  }, [profile?.userId])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_ranking" />
      <RankingView
        inmuRows={inmuRows}
        pointsRows={pointsRows}
        compositeRows={compositeRows}
        myCompositeRank={myCompositeRank}
        myInmuRank={myInmuRank}
        myPointsRank={myPointsRank}
        totalUsers={totalUsers}
        currentUserId={profile?.userId}
      />
    </AppShell>
  )
}
