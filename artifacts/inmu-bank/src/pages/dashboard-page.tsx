import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { AdSlot } from '@/components/ad-slot'
import { DashboardView } from '@/components/dashboard-view'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { UserSendDialog } from '@/components/user-send-dialog'
import { toast } from 'sonner'
import { Send } from 'lucide-react'

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
  const [sendOpen, setSendOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
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

  function handleSendClick() {
    const w = window as Window & { phantom?: { solana?: { isPhantom?: boolean } }; solana?: { isPhantom?: boolean } }
    const hasPhantom = !!(w.phantom?.solana?.isPhantom || w.solana?.isPhantom)
    const mob = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    if (mob && !hasPhantom) {
      const url = encodeURIComponent(window.location.href)
      const ref = encodeURIComponent(window.location.origin)
      const phantomUrl = `phantom://browse/${url}?ref=${ref}`
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.location.assign(phantomUrl)
      } else {
        window.location.assign(`intent://browse/${url}#Intent;scheme=phantom;package=app.phantom;end`)
      }
      return
    }
    setSendOpen(true)
  }

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_dashboard">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={handleSendClick}
        >
          <Send className="size-3.5" />
          INMU送金
        </Button>
      </PageHeader>
      <AdSlot slotId="dashboard-top" variant="banner" className="mb-4" />
      <DashboardView
        data={data}
        displayName={profile?.displayName ?? ''}
        walletInmu={walletInmu}
        dailyClaim={dailyClaim ? { ...dailyClaim, onClaim: handleClaimDaily } : undefined}
        hasSolWallet={!!profile?.solWallet}
        onScan={handleScanTrades}
        scanning={scanning}
        onSend={handleSendClick}
        inmuPrice={inmuPrice ?? undefined}
      />
      <UserSendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        senderWallet={profile?.solWallet ?? null}
        onSuccess={loadDashboard}
      />
    </AppShell>
  )
}
