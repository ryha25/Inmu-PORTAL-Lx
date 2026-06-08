/**
 * 管理者プロフィールページ
 *
 * ウォレット状態の分離設計:
 *   savedWallet  — localStorageに保存済みのアドレス。ページ再読み込み後も常に表示。
 *   phantomReady — Phantomが現在接続中かどうか(署名に使える状態か)。
 *
 * セキュリティ: 秘密鍵は一切保存しない。localStorageにはアドレスのみ。
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useLocation } from 'wouter'
import { AdminShell } from '@/components/admin-shell'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Shield, WalletCards, ExternalLink, LogOut, Coins,
  RefreshCw, CheckCircle2, Info, History, KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatInmu } from '@/lib/format'

const ADMIN_WALLET_KEY = 'inmu_admin_wallet'

interface PhantomProvider {
  isPhantom: boolean
  publicKey?: { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider }
    solana?: PhantomProvider
  }
}

function getPhantom(): PhantomProvider | null {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana
  if (window.solana?.isPhantom) return window.solana
  return null
}

function isMobile() { return /iPhone|iPad|iPod|Android/.test(navigator.userAgent) }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) }

export function AdminProfilePage() {
  const [, navigate] = useLocation()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  const [savedWallet, setSavedWallet] = useState<string | null>(null)
  const [phantomReady, setPhantomReady] = useState(false)
  const [inmuBalance, setInmuBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [connectLoading, setConnectLoading] = useState(false)
  const [recentHistory, setRecentHistory] = useState<Array<{
    id: number; action: string; createdAt: string;
    details: Record<string, unknown> | null;
  }>>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // 管理コード変更
  const [currentCode, setCurrentCode] = useState('')
  const [newCode, setNewCode] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [codeChanging, setCodeChanging] = useState(false)

  const initDone = useRef(false)

  // ── 管理者認証 ──
  useEffect(() => {
    fetch('/api/auth/admin-session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then((d: { isAdmin: boolean }) => {
        setIsAdmin(d.isAdmin)
        if (!d.isAdmin) navigate('/admin-login')
      })
      .catch(() => { setIsAdmin(false); navigate('/admin-login') })
  }, [navigate])

  // ── 初期化: サーバー保存ウォレットを優先読み込み + Phantom自動再接続 ──
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    const localStored = (() => {
      try { return localStorage.getItem(ADMIN_WALLET_KEY) } catch { return null }
    })()

    void (async () => {
      let wallet = localStored
      try {
        const res = await fetch('/api/admin/wallet', { credentials: 'include' })
        if (res.ok) {
          const d = await res.json() as { wallet: string | null }
          wallet = d.wallet
          try {
            if (d.wallet) localStorage.setItem(ADMIN_WALLET_KEY, d.wallet)
            else localStorage.removeItem(ADMIN_WALLET_KEY)
          } catch {}
        }
      } catch {}

      if (wallet) {
        setSavedWallet(wallet)
        fetchBalanceFor(wallet)
        const phantom = getPhantom()
        if (phantom) {
          phantom.connect({ onlyIfTrusted: true })
            .then(resp => {
              if (resp.publicKey.toString() === wallet) setPhantomReady(true)
            })
            .catch(() => {})
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 送金履歴取得（監査ログから） ──
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/admin/sol-transfer-history', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as unknown[]
        setRecentHistory(Array.isArray(data) ? (data as typeof recentHistory) : [])
      }
    } catch {}
    finally { setHistoryLoading(false) }
  }, [])

  // ── INMU残高取得 ──
  const fetchBalanceFor = useCallback(async (wallet: string) => {
    setBalanceLoading(true)
    try {
      const res = await fetch(
        `/api/admin/solana/inmu-balance?wallet=${encodeURIComponent(wallet)}`,
        { credentials: 'include' },
      )
      if (res.ok) {
        const d = await res.json() as { balance: number }
        setInmuBalance(d.balance)
      } else {
        setInmuBalance(null)
      }
    } catch {
      setInmuBalance(null)
    } finally {
      setBalanceLoading(false)
    }
  }, [])

  // ── Phantom接続 ──
  async function connectPhantom() {
    setConnectLoading(true)
    try {
      const phantom = getPhantom()
      if (phantom) {
        const resp = await phantom.connect()
        const addr = resp.publicKey.toString()
        setSavedWallet(addr)
        setPhantomReady(true)
        try { localStorage.setItem(ADMIN_WALLET_KEY, addr) } catch {}
        fetch('/api/admin/wallet', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: addr }),
        }).catch(() => {})
        toast.success('Phantom ウォレットを接続しました')
        fetchBalanceFor(addr)
        void fetchHistory()
        return
      }
      if (isMobile()) {
        const url = encodeURIComponent(window.location.href)
        const ref = encodeURIComponent(window.location.origin)
        const phantomUrl = `https://phantom.app/ul/browse/${url}?ref=${ref}`
        window.location.href = isIOS()
          ? phantomUrl
          : `intent://browse/${url}#Intent;scheme=phantom;package=app.phantom;S.browser_fallback_url=${encodeURIComponent(phantomUrl)};end`
        return
      }
      toast.error('Phantom ウォレットをインストールしてください')
      window.open('https://phantom.app/', '_blank')
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'User rejected the request.') {
        toast.error(e.message)
      }
    } finally {
      setConnectLoading(false)
    }
  }

  // ── Phantom切断 ──
  async function disconnectPhantom() {
    try {
      const phantom = getPhantom()
      if (phantom?.disconnect) await phantom.disconnect().catch(() => {})
    } catch {}
    setSavedWallet(null)
    setPhantomReady(false)
    setInmuBalance(null)
    try { localStorage.removeItem(ADMIN_WALLET_KEY) } catch {}
    fetch('/api/admin/wallet', { method: 'DELETE', credentials: 'include' }).catch(() => {})
    toast.success('ウォレットを切断しました')
  }

  // ── ログアウト ──
  async function handleLogout() {
    await fetch('/api/auth/admin-sign-out', { method: 'POST', credentials: 'include' })
    navigate('/admin-login')
  }

  // ── 管理コード変更 ──
  async function handleChangeCode() {
    if (!newCode || newCode !== confirmCode) {
      toast.error('新コードと確認コードが一致しません')
      return
    }
    if (newCode.length < 4) {
      toast.error('コードは4文字以上にしてください')
      return
    }
    setCodeChanging(true)
    try {
      const res = await fetch('/api/admin/change-admin-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentCode, newCode }),
      })
      const d = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'エラー')
      toast.success('管理コードを変更しました')
      setCurrentCode('')
      setNewCode('')
      setConfirmCode('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'エラー')
    } finally {
      setCodeChanging(false)
    }
  }

  if (isAdmin === null) return null
  if (!isAdmin) return null

  const shortAddr = savedWallet ? `${savedWallet.slice(0, 6)}…${savedWallet.slice(-6)}` : null

  return (
    <AdminShell onLogout={handleLogout}>
      <PageHeader titleKey="nav_profile" />

      <div className="flex flex-col gap-4 max-w-md">

        {/* ── Phantom ドメイン警告の説明 ── */}
        {savedWallet && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-50/10 p-3.5 flex gap-3">
            <Info className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Phantom 警告について</p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                Phantom が「リクエストがブロックされました」と表示するのは、
                <strong>開発用プレビューURL</strong>が未検証ドメインのためです。
                これはコードの問題ではありません。<br />
                ① Phantom の警告画面で「<strong>無視して続ける</strong>」をクリック<br />
                ② 本番ドメイン（inmuportal.com等）では警告は出ません
              </p>
            </div>
          </div>
        )}

        {/* ── 管理者情報 ── */}
        <Card className="border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Shield className="size-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-base">管理者</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="size-3 text-primary" /> INMU PORTAL 管理者権限
              </p>
            </div>
          </div>
        </Card>

        {/* ── 管理ウォレット ── */}
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <WalletCards className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">管理ウォレット</h3>
          </div>

          {savedWallet ? (
            <div className="flex flex-col gap-3">

              <div className="flex items-center gap-2">
                {phantomReady ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-green-500" />
                    <span className="text-xs font-medium text-green-600">Phantom 接続中</span>
                  </>
                ) : (
                  <>
                    <WalletCards className="size-3.5 text-primary" />
                    <span className="text-xs font-medium text-primary">アドレス保存済み</span>
                    <span className="text-[10px] text-muted-foreground">（送金時に再接続）</span>
                  </>
                )}
              </div>

              <div className="rounded-md bg-secondary/50 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">保存済みウォレットアドレス</p>
                <p className="font-mono text-xs break-all">{savedWallet}</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">（{shortAddr}）</p>
              </div>

              <Card className="border-border bg-secondary/30 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Coins className="size-4 text-primary" />
                    <p className="text-xs font-medium text-muted-foreground">管理者 INMU 残高</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchBalanceFor(savedWallet)}
                    disabled={balanceLoading}
                    className="size-7 p-0"
                  >
                    <RefreshCw className={`size-3.5 ${balanceLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                {balanceLoading ? (
                  <p className="font-mono text-lg font-bold text-muted-foreground">取得中…</p>
                ) : inmuBalance !== null ? (
                  <p className="font-mono text-lg font-bold gold-text">
                    {formatInmu(inmuBalance)} INMU
                  </p>
                ) : (
                  <p className="font-mono text-sm text-muted-foreground">取得できませんでした</p>
                )}
              </Card>

              {/* ── 送金履歴 ── */}
              <Card className="border-border bg-secondary/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <History className="size-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">INMU送金履歴</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchHistory}
                    disabled={historyLoading}
                    className="size-7 p-0"
                  >
                    <RefreshCw className={`size-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                {recentHistory.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-1">
                    {historyLoading ? '取得中…' : '↑ ボタンで履歴を取得'}
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                    {recentHistory.map(h => {
                      const d = h.details ?? {}
                      const isBatch = h.action === 'adminBatchInmuTransfer'
                      const txSig = (d.txSignature ?? d.txSig) as string | undefined
                      return (
                        <div key={h.id} className="flex items-center justify-between rounded-md bg-secondary/40 px-2.5 py-1.5">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[11px] font-medium text-primary">
                              {isBatch ? `一括INMU送金 (${d.count ?? '?'}名)` : 'INMU送金'}
                            </span>
                            {txSig && (
                              <a
                                href={`https://solscan.io/tx/${txSig}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-[9px] text-primary/70 hover:underline truncate"
                              >
                                {txSig.slice(0, 20)}…
                              </a>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(h.createdAt).toLocaleString('ja-JP')}
                            </span>
                          </div>
                          {(d.amount as number | undefined) !== undefined && (
                            <span className="font-mono text-xs font-bold text-primary shrink-0 ml-2">
                              {formatInmu(String(d.amount))} INMU
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              <a
                href={`https://solscan.io/account/${savedWallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                Solscan で確認
              </a>

              <div className="flex gap-2">
                {!phantomReady && (
                  <Button
                    onClick={connectPhantom}
                    disabled={connectLoading}
                    variant="outline"
                    className="min-h-10 flex-1 text-xs gap-1.5"
                  >
                    <WalletCards className="size-3.5" />
                    {connectLoading ? '接続中…' : 'Phantom に接続'}
                  </Button>
                )}
                {phantomReady && (
                  <Button
                    onClick={connectPhantom}
                    disabled={connectLoading}
                    variant="outline"
                    className="min-h-10 flex-1 text-xs gap-1.5"
                  >
                    <WalletCards className="size-3.5" />
                    再接続
                  </Button>
                )}
                <Button
                  onClick={disconnectPhantom}
                  variant="ghost"
                  className="min-h-10 text-destructive gap-1.5 text-xs"
                >
                  <LogOut className="size-3.5" />
                  切断
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-2 rounded-full bg-muted-foreground/30" />
                <span className="text-xs text-muted-foreground">ウォレット未設定</span>
              </div>
              <Button
                onClick={connectPhantom}
                disabled={connectLoading}
                className="min-h-11 gap-2"
              >
                <WalletCards className="size-4" />
                {connectLoading ? '接続中…' : 'Phantom ウォレットに接続'}
              </Button>
              {isMobile() && (
                <p className="text-[11px] text-center text-muted-foreground">
                  iPhoneの場合はPhantomアプリが起動します
                </p>
              )}
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
                <p className="font-medium mb-1">Phantom警告が出た場合</p>
                <p>「無視して続ける」を選択してください。開発環境のURLが未検証ドメインのため表示されます。本番ドメインでは表示されません。</p>
              </div>
            </div>
          )}
        </Card>

        {/* ── 管理コード変更 ── */}
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">管理コード変更</h3>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">現在のコード</p>
              <Input
                type="password"
                placeholder="現在の管理コード"
                value={currentCode}
                onChange={e => setCurrentCode(e.target.value)}
                className="min-h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">新しいコード</p>
              <Input
                type="password"
                placeholder="新しい管理コード（4文字以上）"
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                className="min-h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">新しいコード（確認）</p>
              <Input
                type="password"
                placeholder="もう一度入力"
                value={confirmCode}
                onChange={e => setConfirmCode(e.target.value)}
                className="min-h-10"
              />
            </div>
            <Button
              onClick={handleChangeCode}
              disabled={codeChanging || !currentCode || !newCode || !confirmCode}
              className="min-h-10 gap-2"
            >
              <KeyRound className="size-3.5" />
              {codeChanging ? '変更中…' : 'コードを変更'}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              変更後は次回ログイン時から新しいコードが有効になります。
            </p>
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
            <span className="flex-1 text-left">管理画面からログアウト</span>
          </button>
        </Card>
      </div>
    </AdminShell>
  )
}
