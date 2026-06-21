import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { AdminShell } from '@/components/admin-shell'
import { RankingView } from '@/components/ranking-view'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

type InmuRow      = { rank: number; userId: string; displayName: string; balance: number; showBalance: boolean; totalReceived: number; participations: number }
type PointsRow    = { rank: number; userId: string; displayName: string; points: number; participations: number }
type CompositeRow = { rank: number; userId: string; displayName: string; balance: number; points: number; clears: number; score: number }
type CompositeResult = { ranking: CompositeRow[]; myRank: number | null; totalUsers: number }

export function AdminRankingPage() {
  const [, navigate] = useLocation()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [inmuRows,      setInmuRows]      = useState<InmuRow[]>([])
  const [pointsRows,    setPointsRows]    = useState<PointsRow[]>([])
  const [compositeRows, setCompositeRows] = useState<CompositeRow[]>([])
  const [totalUsers,    setTotalUsers]    = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/admin-session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then((d: { isAdmin: boolean }) => {
        setIsAdmin(d.isAdmin)
        if (!d.isAdmin) navigate('/inmu1919-login')
      })
      .catch(() => { setIsAdmin(false); navigate('/inmu1919-login') })
  }, [navigate])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetch('/api/ranking', { credentials: 'include' })
          .then(r => r.ok ? r.json() : [])
          .then((d: InmuRow[]) => { if (Array.isArray(d)) setInmuRows(d) })
          .catch(() => {}),

        fetch('/api/ranking/points', { credentials: 'include' })
          .then(r => r.ok ? r.json() : [])
          .then((d: PointsRow[]) => { if (Array.isArray(d)) setPointsRows(d) })
          .catch(() => {}),

        fetch('/api/ranking/composite', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((d: CompositeResult | null) => {
            if (d) {
              setCompositeRows(d.ranking ?? [])
              setTotalUsers(d.totalUsers ?? 0)
            }
          })
          .catch(() => {}),
      ])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) fetchAll()
  }, [isAdmin, fetchAll])

  async function handleLogout() {
    await fetch('/api/auth/admin-sign-out', { method: 'POST', credentials: 'include' })
    navigate('/inmu1919-login')
  }

  if (isAdmin === null || !isAdmin) return null

  return (
    <AdminShell onLogout={handleLogout}>
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
        myCompositeRank={null}
        myInmuRank={null}
        myPointsRank={null}
        totalUsers={totalUsers}
        currentUserId={undefined}
      />
    </AdminShell>
  )
}
