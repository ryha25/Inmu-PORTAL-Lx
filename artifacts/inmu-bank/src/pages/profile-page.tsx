import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { ProfileView } from '@/components/profile-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

type ProfileData = {
  userId: string; displayName: string; xId: string | null; discordId: string | null; discordUsername: string | null; solWallet: string | null
  avatar: string | null; balance: string; savingsBalance: string; totalReceived: string; totalSent: string; monthlyPoints: string; participationCount: number; createdAt: string
}

export function ProfilePage() {
  const { t } = useI18n()
  const { profile: auth, unread } = useAuth()
  const [profile, setProfile] = useState<ProfileData | null>(null)

  const load = useCallback(() => {
    fetch('/api/profile', { credentials: 'include' }).then(r => r.json()).then(setProfile)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppShell isAdmin={auth?.role === 'admin'} displayName={auth?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_profile" />
      {!profile ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div> : <ProfileView profile={profile} isAdmin={auth?.role === 'admin'} onRefresh={load} />}
    </AppShell>
  )
}
