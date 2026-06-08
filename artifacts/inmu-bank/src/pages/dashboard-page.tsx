import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { DashboardView } from '@/components/dashboard-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
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

  // Fetch on-chain INMU balance via server-side proxy (avoids CORS/403 issues with direct RPC calls)
  useEffect(() => {
    if (!profile?.solWallet) {
      setWalletInmu(null)
      return
    }
    const wallet = profile.solWallet
    console.info(`[Dashboard] Fetching INMU balance for wallet: ${wallet}`)
    fetch(`/api/solana/inmu-balance?wallet=${encodeURIComponent(wallet)}`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string }
          console.error(`[Dashboard] INMU balance fetch failed: HTTP ${r.status}`, body)
          return null
        }
        return r.json() as Promise<{ balance: number }>
      })
      .then(d => {
        if (d != null) {
          console.info(`[Dashboard] INMU wallet balance: ${d.balance}`)
          setWalletInmu(d.balance)
        } else {
          setWalletInmu(null)
        }
      })
      .catch(e => {
        console.error('[Dashboard] Error fetching INMU balance:', e)
        setWalletInmu(null)
      })
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
