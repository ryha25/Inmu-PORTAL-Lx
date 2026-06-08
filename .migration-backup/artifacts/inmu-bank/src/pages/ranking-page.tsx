import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { RankingView } from '@/components/ranking-view'
import { PageHeader } from '@/components/page-header'
import { useAuth } from '@/hooks/use-auth'

type InmuRow   = { rank: number; userId: string; displayName: string; balance: number; totalReceived: number; participations: number }
type PointsRow = { rank: number; userId: string; displayName: string; points: number; participations: number }

export function RankingPage() {
  const { profile, unread } = useAuth()
  const [inmuRows,   setInmuRows]   = useState<InmuRow[]>([])
  const [pointsRows, setPointsRows] = useState<PointsRow[]>([])

  useEffect(() => {
    fetch('/api/ranking',        { credentials: 'include' }).then(r => r.json()).then(setInmuRows)
    fetch('/api/ranking/points', { credentials: 'include' }).then(r => r.json()).then(setPointsRows)
  }, [])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_ranking" />
      <RankingView inmuRows={inmuRows} pointsRows={pointsRows} />
    </AppShell>
  )
}
