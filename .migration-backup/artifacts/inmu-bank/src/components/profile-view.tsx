import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { fetchInmuTokenBalance } from '@/lib/solana'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import { Link, useLocation } from 'wouter'
import {
  User, Wallet, Coins, TrendingUp, TrendingDown, Award,
  ExternalLink, Bell, Star, Shield, ChevronRight, WalletCards,
  LogOut as WalletDisconnect, LogOut,
} from 'lucide-react'

type ProfileData = {
  userId: string
  displayName: string
  xId: string | null
  discordId: string | null
  discordUsername: string | null
  solWallet: string | null
  avatar: string | null
  balance: string
  savingsBalance: string
  totalReceived: string
  totalSent: string
  monthlyPoints: string
  participationCount: number
  createdAt: string
}

declare global {
  interface Window {
    phantom?: {
      solana?: {
        isPhantom?: boolean
        connect: () => Promise<{ publicKey: { toString(): string } }>
        disconnect: () => Promise<void>
      }
    }
    solana?: {
      isPhantom?: boolean
      connect: () => Promise<{ publicKey: { toString(): string } }>
      disconnect: () => Promise<void>
    }
  }
}

function getPhantomProvider() {
  return window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : null)
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function isAndroid() {
  return /Android/.test(navigator.userAgent)
}

function isMobile() {
  return isIOS() || isAndroid()
}

type SecondaryLink = {
  href: string
  label: string
  icon: React.ElementType
  adminOnly?: boolean
}

export function ProfileView({
  profile,
  isAdmin,
  onRefresh,
}: {
  profile: ProfileData
  isAdmin: boolean
  onRefresh: () => void
}) {
  const { t } = useI18n()
  const [, navigate] = useLocation()
  const [loading, setLoading] = useState(false)
  const [phantomLoading, setPhantomLoading] = useState(false)
  const [inmuOnChain, setInmuOnChain] = useState<number | null>(null)
  const [inmuFetching, setInmuFetching] = useState(false)
  const [form, setForm] = useState({
    displayName: profile.displayName || '',
    xId: profile.xId || '',
    discordId: profile.discordId || '',
    discordUsername: profile.discordUsername || '',
    solWallet: profile.solWallet || '',
  })

  // Auto-fetch INMU on-chain balance when wallet is connected
  useEffect(() => {
    if (!form.solWallet) {
      setInmuOnChain(null)
      return
    }
    setInmuFetching(true)
    fetchInmuTokenBalance(form.solWallet)
      .then(bal => setInmuOnChain(bal))
      .catch(() => setInmuOnChain(null))
      .finally(() => setInmuFetching(false))
  }, [form.solWallet])

  async function handleSave() {
    setLoading(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success(t('success'))
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function saveWallet(address: string | null) {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solWallet: address }),
    })
    if (!res.ok) throw new Error('Failed to save wallet')
  }

  async function handleLogout() {
    try {
      await fetch('/api/sign-out', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore — clear cookie regardless
    }
    navigate('/sign-in')
  }

  async function connectPhantom() {
    setPhantomLoading(true)
    try {
      const provider = getPhantomProvider()

      // Inside Phantom browser — connect directly
      if (provider?.isPhantom) {
        const resp = await provider.connect()
        const address = resp.publicKey.toString()
        await saveWallet(address)
        setForm(f => ({ ...f, solWallet: address }))
        toast.success(t('phantom_connected'))
        onRefresh()
        return
      }

      // Mobile: deep-link into Phantom's built-in browser
      if (isMobile()) {
        const currentUrl = encodeURIComponent(window.location.href)
        const ref = encodeURIComponent(window.location.origin)
        const phantomBrowse = `https://phantom.app/ul/browse/${currentUrl}?ref=${ref}`

        if (isIOS()) {
          window.location.href = phantomBrowse
        } else {
          const intentUrl = `intent://browse/${encodeURIComponent(window.location.href)}#Intent;scheme=phantom;package=app.phantom;S.browser_fallback_url=${encodeURIComponent(phantomBrowse)};end`
          window.location.href = intentUrl
        }
        return
      }

      // Desktop without extension
      toast.error(t('phantom_not_installed'))
      window.open('https://phantom.app/', '_blank')
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'User rejected the request.') {
        toast.error(e.message)
      }
    } finally {
      setPhantomLoading(false)
    }
  }

  async function disconnectPhantom() {
    setPhantomLoading(true)
    try {
      const provider = getPhantomProvider()
      if (provider?.disconnect) {
        await provider.disconnect()
      }
      await saveWallet(null)
      setForm(f => ({ ...f, solWallet: '' }))
      setInmuOnChain(null)
      toast.success('Phantom を切断しました')
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setPhantomLoading(false)
    }
  }

  const secondaryLinks: SecondaryLink[] = [
    { href: '/notifications', label: t('nav_notifications'), icon: Bell },
    { href: '/points',        label: t('nav_points'),        icon: Star },
    { href: '/admin',         label: t('nav_admin'),         icon: Shield, adminOnly: true },
  ]

  const visibleLinks = secondaryLinks.filter(l => !l.adminOnly || isAdmin)

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Coins className="size-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">{t('current_balance')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums gold-text">{formatInmu(profile.balance)}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-accent" />
            <p className="text-xs font-medium text-muted-foreground">{t('savings_title')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums">{formatInmu(profile.savingsBalance)}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-chart-5" />
            <p className="text-xs font-medium text-muted-foreground">{t('total_received')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-chart-5">{formatInmu(profile.totalReceived)}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-destructive" />
            <p className="text-xs font-medium text-muted-foreground">{t('total_sent')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-destructive">{formatInmu(profile.totalSent)}</p>
        </Card>
      </div>

      <Card className="border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Award className="size-4 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">{t('monthly_points')}</p>
        </div>
        <p className="mt-2 font-mono text-xl font-bold tabular-nums">{formatInmu(profile.monthlyPoints)}</p>
      </Card>

      {/* ── Secondary nav links ── */}
      {visibleLinks.length > 0 && (
        <Card className="border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">その他の機能</p>
          </div>
          <ul>
            {visibleLinks.map((link, i) => {
              const Icon = link.icon
              return (
                <li key={link.href} className={i > 0 ? 'border-t border-border' : ''}>
                  <Link
                    href={link.href}
                    className="flex min-h-[52px] items-center gap-3 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary active:bg-secondary"
                  >
                    <Icon className="size-[18px] shrink-0 text-muted-foreground" />
                    <span className="flex-1">{link.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* ── Phantom Wallet ── */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <WalletCards className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Phantom Wallet</h3>
          </div>
          {form.solWallet && (
            <a
              href={`https://solscan.io/account/${form.solWallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Solscan <ExternalLink className="size-3" />
            </a>
          )}
        </div>

        {form.solWallet ? (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs text-muted-foreground break-all bg-secondary/30 rounded p-2">
              {form.solWallet}
            </p>

            {/* INMU on-chain balance — no SOL */}
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">{t('inmu_wallet_balance')}</p>
              {inmuFetching ? (
                <p className="font-mono text-sm text-muted-foreground animate-pulse">{t('inmu_wallet_fetching')}</p>
              ) : inmuOnChain !== null ? (
                <p className="font-mono text-lg font-bold gold-text tabular-nums">
                  {inmuOnChain.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">INMU</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('inmu_wallet_not_set')}</p>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">{t('wallet_private')}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={connectPhantom}
                disabled={phantomLoading}
                className="min-h-9 flex-1 text-xs"
              >
                {t('connect_phantom')}
              </Button>
              <Button
                variant="ghost"
                onClick={disconnectPhantom}
                disabled={phantomLoading}
                className="min-h-9 text-destructive gap-1.5 text-xs"
              >
                <WalletDisconnect className="size-3" />
                切断
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              onClick={connectPhantom}
              disabled={phantomLoading}
              className="min-h-11 w-full gap-2"
            >
              <WalletCards className="size-4" />
              {phantomLoading ? t('loading') : t('connect_phantom')}
            </Button>
            {isMobile() && (
              <p className="text-[11px] text-center text-muted-foreground">
                iPhoneの場合はPhantomアプリが起動します
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Profile form */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <User className="size-4 text-primary" />
          <h2 className="font-semibold">{t('profile_title')}</h2>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t('displayName')}</Label>
            <Input
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('x_id')}</Label>
            <Input
              value={form.xId}
              onChange={e => setForm({ ...form, xId: e.target.value })}
              className="min-h-11"
              placeholder="@username"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('discord_id')}</Label>
            <Input
              value={form.discordId}
              onChange={e => setForm({ ...form, discordId: e.target.value })}
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('discord_username')}</Label>
            <Input
              value={form.discordUsername}
              onChange={e => setForm({ ...form, discordUsername: e.target.value })}
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('sol_wallet')}</Label>
            <Input
              value={form.solWallet}
              onChange={e => setForm({ ...form, solWallet: e.target.value })}
              className="min-h-11 font-mono text-xs"
              placeholder="SOL address"
            />
            <p className="text-[11px] text-muted-foreground">{t('wallet_private')}</p>
          </div>
          <Button onClick={handleSave} disabled={loading} className="min-h-11">
            {t('save')}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('registered_at')}: {new Date(profile.createdAt).toLocaleDateString('ja-JP')}
        </p>
      </Card>

      {/* ── Logout ── */}
      <Card className="border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full min-h-[56px] items-center gap-3 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/20"
        >
          <LogOut className="size-[18px] shrink-0" />
          <span className="flex-1 text-left">{t('nav_signout')}</span>
        </button>
      </Card>
    </div>
  )
}
