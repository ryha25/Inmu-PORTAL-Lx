import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { GoalView } from '@/components/goal-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

type Goal = { id: number; name: string; targetAmount: string; currentAmount: string }

export function GoalsPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch('/api/goals', { credentials: 'include' }).then(r => r.json()).then(d => { setGoals(d); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_goals" />
      {loading ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div> : <GoalView goals={goals} onRefresh={load} />}
    </AppShell>
  )
}
