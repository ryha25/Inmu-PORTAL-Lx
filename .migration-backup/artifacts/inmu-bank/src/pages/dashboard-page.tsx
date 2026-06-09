import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { DashboardView } from '@/components/dashboard-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { fetchInmuTokenBalance } from '@/lib/solana'

export function DashboardPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [data, setData] = useState<{
    balance: number; savingsBalance: number; monthlyChange: number; totalReceived: number; totalSent: number; jarTotal: number; goalRate: number; monthlyPoints: number
    recent: { id: number; type: string; amount: string; counterparty: string | null; memo: string | null; createdAt: string }[]
  } | null>(null)
  const [walletInmu, setWalletInmu] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.recent) setData(d) })
  }, [])

  // Fetch on-chain INMU balance when wallet address is available
  useEffect(() => {
    if (!profile?.solWallet) {
      setWalletInmu(null)
      return
    }
    fetchInmuTokenBalance(profile.solWallet)
      .then(bal => setWalletInmu(bal))
      .catch(() => setWalletInmu(null))
  }, [profile?.solWallet])

  if (!data) return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <div className="py-20 text-center text-muted-foreground">{t('loading')}</div>
    </AppShell>
  )

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_dashboard" />
      <DashboardView data={data} displayName={profile?.displayName ?? ''} walletInmu={walletInmu} />
    </AppShell>
  )
}
