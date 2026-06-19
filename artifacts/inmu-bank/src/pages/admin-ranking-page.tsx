import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { AdminShell } from '@/components/admin-shell'
import { RankingView } from '@/components/ranking-view'
import { PageHeader } from '@/components/page-header'

type InmuRow   = { rank: number; userId: string; displayName: string; balance: number; showBalance: boolean; totalReceived: number; participations: number }
type PointsRow = { rank: number; userId: string; displayName: string; points: number; participations: number }

export function AdminRankingPage() {
  const [, navigate] = useLocation()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [inmuRows,   setInmuRows]   = useState<InmuRow[]>([])
  const [pointsRows, setPointsRows] = useState<PointsRow[]>([])

  useEffect(() => {
    fetch('/api/auth/admin-session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then((d: { isAdmin: boolean }) => {
        setIsAdmin(d.isAdmin)
        if (!d.isAdmin) navigate('/inmu1919-login')
      })
      .catch(() => { setIsAdmin(false); navigate('/inmu1919-login') })
  }, [navigate])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/ranking',        { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setInmuRows(d) })
    fetch('/api/ranking/points', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setPointsRows(d) })
  }, [isAdmin])

  async function handleLogout() {
    await fetch('/api/auth/admin-sign-out', { method: 'POST', credentials: 'include' })
    navigate('/inmu1919-login')
  }

  if (isAdmin === null || !isAdmin) return null

  return (
    <AdminShell onLogout={handleLogout}>
      <PageHeader titleKey="nav_ranking" />
      <RankingView inmuRows={inmuRows} pointsRows={pointsRows} />
    </AdminShell>
  )
}
