import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { AdSlot } from '@/components/ad-slot'
import { DashboardView } from '@/components/dashboard-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'

type DashboardData = {
  balance: number
  savingsBalance: number
  monthlyChange: number
  totalReceived: number
  totalSent: number
  jarTotal: number
  goalRate: number
  monthlyPoints: number
  recent: { id: number; type: string; amount: string; counterparty: string | null; memo: string | null; createdAt: string }[]
}

export function DashboardPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [walletInmu, setWalletInmu] = useState<number | null>(null)
  const [dailyClaim, setDailyClaim] = useState<{ alreadyClaimed: boolean; streak: number } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [daifugoOpening, setDaifugoOpening] = useState(false)
  const [inmuPrice, setInmuPrice] = useState<{ usdPrice: number; jpyRate: number } | null>(null)

  async function handleScanTrades() {
    setScanning(true)
    try {
      const res = await fetch('/api/solana/scan-trades', { method: 'POST', credentials: 'include' })
      const d = await res.json() as { added?: number; total?: number; error?: string }
      if (!res.ok) { toast.error(d.error ?? 'スキャンエラー'); return }
      toast.success(d.added ? `${d.added}件の新規取引を取得しました` : '新規取引はありませんでした')
    } catch {
      toast.error('スキャンエラー')
    } finally {
      setScanning(false)
    }
  }

  const fallbackDashboardData = useCallback((): DashboardData => {
    const p = profile as (typeof profile & {
      balance?: number | string
      savingsBalance?: number | string
      totalReceived?: number | string
      totalSent?: number | string
      monthlyPoints?: number | string
    })
    return {
      balance: Number(p?.balance ?? 0),
      savingsBalance: Number(p?.savingsBalance ?? 0),
      monthlyChange: 0,
      totalReceived: Number(p?.totalReceived ?? 0),
      totalSent: Number(p?.totalSent ?? 0),
      jarTotal: 0,
      goalRate: 0,
      monthlyPoints: Number(p?.monthlyPoints ?? 0),
      recent: [],
    }
  }, [profile])

  const loadDashboard = useCallback(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(Array.isArray(d?.recent) ? d : fallbackDashboardData()) })
      .catch(() => { setData(fallbackDashboardData()) })
  }, [fallbackDashboardData])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const loadPoints = useCallback(() => {
    fetch('/api/points', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d != null) setDailyClaim({ alreadyClaimed: d.alreadyClaimed, streak: d.streak }) })
      .catch(() => {})
  }, [])

  useEffect(() => { loadPoints() }, [loadPoints])

  async function handleClaimDaily() {
    try {
      const res = await fetch('/api/points/claim-daily', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        toast.error(d.error ?? 'エラーが発生しました')
        return
      }
      const result = await res.json() as { points: number; streak: number }
      toast.success(`+${result.points} pts (streak: ${result.streak}日)`)
      setDailyClaim({ alreadyClaimed: true, streak: result.streak })
    } catch {
      toast.error('エラーが発生しました')
    }
  }

  async function handleOpenDaifugo() {
    setDaifugoOpening(true)
    try {
      const res = await fetch('/api/game-link/daifugo', { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'INMU大富豪連携に失敗しました')
      window.location.assign(data.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'INMU大富豪連携に失敗しました')
    } finally {
      setDaifugoOpening(false)
    }
  }

  useEffect(() => {
    if (!profile?.solWallet) { setWalletInmu(null); return }
    const wallet = profile.solWallet
    fetch(`/api/solana/inmu-balance?wallet=${encodeURIComponent(wallet)}`, { credentials: 'include' })
      .then(async r => r.ok ? r.json() as Promise<{ balance: number }> : null)
      .then(d => { setWalletInmu(d?.balance ?? null) })
      .catch(() => { setWalletInmu(null) })
  }, [profile?.solWallet])

  useEffect(() => {
    fetch('/api/solana/inmu-price', { credentials: 'include' })
      .then(r => r.ok ? r.json() as Promise<{ usdPrice: number; jpyRate: number }> : null)
      .then(d => { if (d) setInmuPrice(d) })
      .catch(() => {})
  }, [])

  if (!data) return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <div className="py-20 text-center text-muted-foreground">{t('loading')}</div>
    </AppShell>
  )

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_dashboard" />
      <button
        type="button"
        className="mx-auto mb-4 flex h-[52px] w-[104px] max-w-full overflow-hidden rounded-xl border border-amber-300/50 bg-black p-0 shadow-[0_0_18px_rgba(245,158,11,0.2)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 sm:h-[64px] sm:w-[128px]"
        onClick={handleOpenDaifugo}
        disabled={daifugoOpening}
        aria-label="Daifugoで遊ぶ"
      >
        <img
          src="/daifugo-play-button.jpg"
          alt=""
          className="h-full w-full object-cover"
        />
      </button>
      <AdSlot slotId="dashboard-top" variant="banner" className="mb-4" />
      <DashboardView
        data={data}
        displayName={profile?.displayName ?? ''}
        walletInmu={walletInmu}
        dailyClaim={dailyClaim ? { ...dailyClaim, onClaim: handleClaimDaily } : undefined}
        hasSolWallet={!!profile?.solWallet}
        onScan={handleScanTrades}
        scanning={scanning}
        inmuPrice={inmuPrice ?? undefined}
      />
    </AppShell>
  )
}
