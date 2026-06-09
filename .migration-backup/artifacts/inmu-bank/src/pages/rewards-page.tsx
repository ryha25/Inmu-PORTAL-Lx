import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { RewardView } from '@/components/reward-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

type Reward = { id: number; type: string; amount: string; memo: string | null; createdAt: string }

export function RewardsPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [rewards, setRewards] = useState<Reward[]>([])

  useEffect(() => {
    fetch('/api/rewards', { credentials: 'include' }).then(r => r.json()).then(setRewards)
  }, [])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_rewards" />
      <RewardView rewards={rewards} />
    </AppShell>
  )
}
