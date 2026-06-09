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
import {
  Shield, WalletCards, ExternalLink, LogOut, Coins,
  RefreshCw, CheckCircle2, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatInmu } from '@/lib/format'

const ADMIN_WALLET_KEY = 'inmu_admin_wallet'

// Phantom プロバイダの型定義
interface PhantomProvider {
  isPhantom: boolean
  publicKey?: { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
}

function getPhantom(): PhantomProvider | null {
  const w = window as Window & { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider }
  if (w.phantom?.solana?.isPhantom) return w.phantom.solana
  if (w.solana?.isPhantom) return w.solana
  return null
}

function isMobile() { return /iPhone|iPad|iPod|Android/.test(navigator.userAgent) }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) }


export function AdminProfilePage() {
  const [, navigate] = useLocation()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  // ── ウォレットアドレス (localStorage永続) ──
  const [savedWallet, setSavedWallet] = useState<string | null>(null)
  // ── Phantom接続状態 (ページ跨ぎで消える) ──
  const [phantomReady, setPhantomReady] = useState(false)
  // ── INMU残高 ──
  const [inmuBalance, setInmuBalance] = useState<number | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [connectLoading, setConnectLoading] = useState(false)

  const initDone = useRef(false)

  // ── 管理者認証 ──
  useEffect(() => {
    fetch('/api/auth/admin-session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then((d: { isAdmin: boolean }) => {
        setIsAdmin(d.isAdmin)
        if (!d.isAdmin) navigate('/inmu1919-login')
      })
      .catch(() => { setIsAdmin(false); navigate('/inmu1919-login') })
  }, [navigate])

  // ── 初期化: サーバー保存ウォレットを優先読み込み + Phantom自動再接続 ──
  // サーバー側に保存することで、Phantom内ブラウザ・Safari・別端末など
  // どのブラウザで管理画面を開いてもウォレットアドレスと残高が表示される。
  // localStorage はオフライン時のキャッシュとして併用。
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    const localStored = (() => {
      try { return localStorage.getItem(ADMIN_WALLET_KEY) } catch { return null }
    })()

    void (async () => {
      let wallet = localStored
      // サーバー保存値を取得（管理者セッションがあればブラウザを問わず取得可能）
      // 取得成功時はサーバーを権威とする: 別ブラウザで切断(null)されたら
      // ローカルキャッシュも消し、全ブラウザで切断状態を同期する。
      try {
        const res = await fetch('/api/admin/wallet', { credentials: 'include' })
        if (res.ok) {
          const d = await res.json() as { wallet: string | null }
          wallet = d.wallet  // サーバーが権威 (null の可能性あり)
          try {
            if (d.wallet) localStorage.setItem(ADMIN_WALLET_KEY, d.wallet)
            else localStorage.removeItem(ADMIN_WALLET_KEY)
          } catch {}
        }
        // res.ok でない(5xx等)場合はローカルキャッシュを維持
      } catch { /* サーバー未到達時は localStorage を使用 */ }

      if (wallet) {
        setSavedWallet(wallet)
        // 残高はバックエンド経由で取得(Phantom不要)
        fetchBalanceFor(wallet)
        // Phantom がインストール済みなら onlyIfTrusted で静かに再接続
        const phantom = getPhantom()
        if (phantom) {
          phantom.connect({ onlyIfTrusted: true })
            .then(resp => {
              if (resp.publicKey.toString() === wallet) {
                setPhantomReady(true)
              }
            })
            .catch(() => { /* ユーザー未承認 → cached 状態のまま */ })
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── INMU残高取得 (バックエンドRPC経由, Phantom不要) ──
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
        // Phantom 推奨: connect() でユーザーに接続承認を求める
        const resp = await phantom.connect()
        const addr = resp.publicKey.toString()
        setSavedWallet(addr)
        setPhantomReady(true)
        try { localStorage.setItem(ADMIN_WALLET_KEY, addr) } catch {}
        // サーバー側に保存（ブラウザ跨ぎで永続）
        fetch('/api/admin/wallet', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: addr }),
        }).catch(() => {})
        toast.success('Phantom ウォレットを接続しました')
        fetchBalanceFor(addr)
        return
      }
      // モバイル: Phantomアプリへディープリンク
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
    // サーバー側の保存も削除
    fetch('/api/admin/wallet', { method: 'DELETE', credentials: 'include' }).catch(() => {})
    toast.success('ウォレットを切断しました')
  }

  // ── ログアウト ──
  async function handleLogout() {
    await fetch('/api/auth/admin-sign-out', { method: 'POST', credentials: 'include' })
    navigate('/inmu1919-login')
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

              {/* 接続ステータス */}
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

              {/* アドレス表示 (常時表示) */}
              <div className="rounded-md bg-secondary/50 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">保存済みウォレットアドレス</p>
                <p className="font-mono text-xs break-all">{savedWallet}</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">（{shortAddr}）</p>
              </div>

              {/* INMU残高 (バックエンド取得, Phantom不要) */}
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
