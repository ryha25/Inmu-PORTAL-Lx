import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { PointsView } from '@/components/points-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

export function PointsPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [data, setData] = useState<{
    totalPoints: number; streak: number; alreadyClaimed: boolean
    history: { id: number; amount: string; type: string; createdAt: string }[]
    leaderboard: { rank: number; userId: string; displayName: string; points: number }[]
  } | null>(null)

  const load = useCallback(() => {
    fetch('/api/points', { credentials: 'include' }).then(r => r.json()).then(setData)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_points" />
      {!data ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div> : <PointsView data={data} onRefresh={load} />}
    </AppShell>
  )
}
