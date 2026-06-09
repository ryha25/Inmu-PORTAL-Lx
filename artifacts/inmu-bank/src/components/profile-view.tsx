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
  AtSign, MessageSquare, Lock, KeyRound,
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

type PhantomLike = {
  isPhantom?: boolean
  connect: () => Promise<{ publicKey: { toString(): string } }>
  disconnect: () => Promise<void>
}

function getPhantomProvider(): PhantomLike | null {
  const w = window as Window & { phantom?: { solana?: PhantomLike }; solana?: PhantomLike }
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null) ?? null
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
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [currentPasscode, setCurrentPasscode] = useState('')
  const [newPasscode, setNewPasscode] = useState('')

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

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) return
    setLoading(true)
    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'エラーが発生しました')
      toast.success('パスワードを変更しました')
      setCurrentPassword('')
      setNewPassword('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally { setLoading(false) }
  }

  async function handleChangePasscode() {
    if (!currentPasscode || !newPasscode) return
    setLoading(true)
    try {
      const res = await fetch('/api/profile/change-passcode', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPasscode, newPasscode }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'エラーが発生しました')
      toast.success('パスコードを変更しました')
      setCurrentPasscode('')
      setNewPasscode('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally { setLoading(false) }
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

        {solWallet ? (
          <div className="flex flex-col gap-2">
            {/* 接続状態 */}
            <div className="flex items-center gap-2">
              <span className="inline-flex size-2 rounded-full bg-green-500" />
              <span className="text-xs font-medium text-green-600">接続中</span>
            </div>
            {/* SOLアドレス編集 */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground">SOL アドレス（編集可）</Label>
              <div className="flex gap-2">
                <Input
                  value={solWallet}
                  onChange={e => setSolWallet(e.target.value)}
                  className="min-h-9 flex-1 font-mono text-[11px]"
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await saveWallet(solWallet.trim())
                      toast.success('アドレスを保存しました')
                      onRefresh()
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : t('error'))
                    }
                  }}
                  disabled={loading}
                  className="min-h-9 shrink-0"
                >
                  保存
                </Button>
              </div>
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">SOLアドレスを手入力</Label>
              <div className="flex gap-2">
                <Input
                  value={solWallet}
                  onChange={e => setSolWallet(e.target.value)}
                  placeholder="SOLアドレスを入力"
                  className="min-h-10 flex-1 font-mono text-xs"
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!solWallet.trim()) return
                    try {
                      await saveWallet(solWallet.trim())
                      toast.success('アドレスを保存しました')
                      onRefresh()
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : t('error'))
                    }
                  }}
                  disabled={loading || !solWallet.trim()}
                  className="min-h-10 shrink-0"
                >
                  保存
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-[11px] text-muted-foreground">または</span>
              <div className="flex-1 border-t border-border" />
            </div>
            <Button
              onClick={connectPhantom}
              disabled={phantomLoading}
              className="min-h-10 w-full gap-2"
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

      {/* ── パスワード変更 ── */}
      <Card className="border-border bg-card p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Lock className="size-4 text-primary" />
          パスワード変更
        </p>
        <div className="flex flex-col gap-2">
          <Input
            type="password"
            placeholder="現在のパスワード"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="min-h-10"
          />
          <Input
            type="password"
            placeholder="新しいパスワード"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="min-h-10"
          />
          <Button
            size="sm"
            onClick={handleChangePassword}
            disabled={!currentPassword || !newPassword || loading}
            className="min-h-10"
          >
            パスワードを変更する
          </Button>
        </div>
      </Card>

      {/* ── パスコード変更 ── */}
      <Card className="border-border bg-card p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          パスコード変更
        </p>
        <div className="flex flex-col gap-2">
          <Input
            type="password"
            placeholder="現在のパスコード"
            value={currentPasscode}
            onChange={e => setCurrentPasscode(e.target.value)}
            className="min-h-10"
          />
          <Input
            type="password"
            placeholder="新しいパスコード（数字4〜6桁）"
            value={newPasscode}
            onChange={e => setNewPasscode(e.target.value)}
            className="min-h-10"
          />
          <Button
            size="sm"
            onClick={handleChangePasscode}
            disabled={!currentPasscode || !newPasscode || loading}
            className="min-h-10"
          >
            パスコードを変更する
          </Button>
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
