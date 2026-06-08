import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { CommunityView } from '@/components/community-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

export function CommunityPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [stats, setStats] = useState<{ participations: number; receiveCount: number; totalReceivedInmu: number; rank: number; totalUsers: number } | null>(null)

  useEffect(() => {
    fetch('/api/community', { credentials: 'include' }).then(r => r.json()).then(setStats)
  }, [])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_community" />
      {!stats ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div> : <CommunityView stats={stats} />}
    </AppShell>
  )
}
