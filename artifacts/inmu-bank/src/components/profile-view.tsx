import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n/context'
import { toast } from 'sonner'
import { useState } from 'react'
import { useLocation } from 'wouter'
import {
  User, WalletCards,
  ExternalLink, LogOut as WalletDisconnect, LogOut,
  AtSign, MessageSquare,
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

export function ProfileView({
  profile,
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
  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const [xId, setXId] = useState(profile.xId || '')
  const [discordId, setDiscordId] = useState(profile.discordId || '')
  const [solWallet, setSolWallet] = useState(profile.solWallet || '')
  const [manualSolInput, setManualSolInput] = useState(profile.solWallet || '')
  const [manualSolSaving, setManualSolSaving] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          xId: xId || null,
          discordId: discordId || null,
          solWallet,
        }),
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

  async function handleSaveManualSol() {
    const addr = manualSolInput.trim()
    if (!addr) {
      toast.error('SOLアドレスを入力してください')
      return
    }
    setManualSolSaving(true)
    try {
      await saveWallet(addr)
      setSolWallet(addr)
      toast.success('SOLアドレスを保存しました（送金先として利用可能）')
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setManualSolSaving(false)
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    navigate('/sign-in')
  }

  async function connectPhantom() {
    setPhantomLoading(true)
    try {
      const provider = getPhantomProvider()

      if (provider?.isPhantom) {
        const resp = await provider.connect()
        const address = resp.publicKey.toString()
        await saveWallet(address)
        setSolWallet(address)
        toast.success(t('phantom_connected'))
        onRefresh()
        return
      }

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
      setSolWallet('')
      toast.success('Phantom を切断しました')
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setPhantomLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── プロフィール情報 ── */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <User className="size-4 text-primary" />
          <h2 className="font-semibold">{t('profile_title')}</h2>
        </div>
        <div className="flex flex-col gap-3">
          {/* 表示名 */}
          <div className="flex flex-col gap-1.5">
            <Label>{t('displayName')}</Label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="min-h-11"
              placeholder="表示名"
            />
          </div>

          {/* X ID */}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              <AtSign className="size-3" /> X ID
            </Label>
            <Input
              value={xId}
              onChange={e => setXId(e.target.value)}
              className="min-h-11"
              placeholder="@handle"
            />
          </div>

          {/* Discord ID */}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5">
              <MessageSquare className="size-3" /> Discord ID
            </Label>
            <Input
              value={discordId}
              onChange={e => setDiscordId(e.target.value)}
              className="min-h-11"
              placeholder="username または ID"
            />
          </div>

          <Button onClick={handleSave} disabled={loading} className="min-h-11">
            {t('save')}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('registered_at')}: {new Date(profile.createdAt).toLocaleDateString('ja-JP')}
        </p>
      </Card>

      {/* ── SOLアドレス & Phantom ── */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <WalletCards className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">SOL ウォレット</h3>
          </div>
          {solWallet && (
            <a
              href={`https://solscan.io/account/${solWallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Solscan <ExternalLink className="size-3" />
            </a>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* 現在のアドレス表示 */}
          {solWallet && (
            <div className="rounded-md bg-secondary/50 p-2.5">
              <p className="text-[10px] text-muted-foreground mb-1">設定済みアドレス</p>
              <p className="font-mono text-xs text-foreground break-all">{solWallet}</p>
              <p className="font-mono text-xs text-muted-foreground mt-0.5">
                ({solWallet.slice(0, 6)}…{solWallet.slice(-6)})
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">{t('wallet_private')}</p>
            </div>
          )}

          {/* 手入力 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">SOLアドレス手入力</p>
            <div className="flex gap-2">
              <Input
                value={manualSolInput}
                onChange={e => setManualSolInput(e.target.value)}
                placeholder="Solanaアドレスを貼り付け"
                className="min-h-10 flex-1 font-mono text-xs"
              />
              <Button
                variant="outline"
                onClick={handleSaveManualSol}
                disabled={manualSolSaving || !manualSolInput.trim()}
                className="min-h-10 text-xs shrink-0"
              >
                {manualSolSaving ? '保存中…' : '保存'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              ※ 手入力アドレスは送金先として利用可能。オンチェーン残高取得にはPhantom接続が必要。
            </p>
          </div>

          {/* Phantom接続 */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Phantom接続</p>
            {solWallet ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={connectPhantom}
                  disabled={phantomLoading}
                  className="min-h-9 flex-1 text-xs gap-1.5"
                >
                  <WalletCards className="size-3.5" />
                  {phantomLoading ? t('loading') : t('connect_phantom')}
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
            ) : (
              <Button
                onClick={connectPhantom}
                disabled={phantomLoading}
                className="min-h-10 w-full gap-2"
              >
                <WalletCards className="size-4" />
                {phantomLoading ? t('loading') : t('connect_phantom')}
              </Button>
            )}
            {isMobile() && (
              <p className="text-[11px] text-center text-muted-foreground">
                iPhoneの場合はPhantomアプリが起動します
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ── ログアウト ── */}
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
