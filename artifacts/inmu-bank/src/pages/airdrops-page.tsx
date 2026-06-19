import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { AirdropView } from '@/components/airdrop-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

type Tx = { id: number; type: string; amount: string; memo: string | null; createdAt: string }

export function AirdropsPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [received, setReceived] = useState<Tx[]>([])

  useEffect(() => {
    fetch('/api/airdrops', { credentials: 'include' }).then(r => r.json()).then(setReceived)
  }, [])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_airdrops" />
      <AirdropView received={received} />
    </AppShell>
  )
}
