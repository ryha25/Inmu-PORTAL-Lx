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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Shield, WalletCards, ExternalLink, LogOut, Coins,
  Send, RefreshCw, User, AlertTriangle, CheckCircle2, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatInmu } from '@/lib/format'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'

const INMU_MINT = new PublicKey('4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump')
const INMU_DECIMALS = 6
const ADMIN_WALLET_KEY = 'inmu_admin_wallet'

// Phantom プロバイダの型定義
interface PhantomProvider {
  isPhantom: boolean
  publicKey?: { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
  signTransaction(tx: Transaction): Promise<Transaction>
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider }
    solana?: PhantomProvider
  }
}

function getPhantom(): PhantomProvider | null {
  // Phantom推奨: window.phantom.solana を優先
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana
  if (window.solana?.isPhantom) return window.solana
  return null
}

function isMobile() { return /iPhone|iPad|iPod|Android/.test(navigator.userAgent) }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) }

function getRpcUrl() {
  return `${window.location.origin}/api/solana/rpc-proxy`
}

type UserRow = {
  userId: string
  displayName: string
  solWallet: string | null
  balance: string
  monthlyPoints: string
}

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

  // 送金ダイアログ
  const [users, setUsers] = useState<UserRow[]>([])
  const [sendOpen, setSendOpen] = useState(false)
  const [sendTarget, setSendTarget] = useState<UserRow | null>(null)
  const [sendAmount, setSendAmount] = useState('1')
  const [sendLoading, setSendLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')

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

  // ── ユーザー一覧 ──
  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.json())
      .then((d: UserRow[]) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [isAdmin])

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
    navigate('/admin-login')
  }

  // ── 実INMU送金 ──
  async function handleSendInmu() {
    if (!sendTarget?.solWallet || !savedWallet) return
    const amount = Number(sendAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error('送金量を正しく入力してください')
      return
    }

    const phantom = getPhantom()
    if (!phantom) {
      toast.error('Phantom ウォレットが見つかりません。インストールしてください。')
      return
    }

    // Phantom が未接続(または前回接続のみ)なら明示的に再接続
    if (!phantomReady || !phantom.publicKey) {
      toast.loading('Phantom に接続しています…', { id: 'ph-connect' })
      try {
        const resp = await phantom.connect()
        const addr = resp.publicKey.toString()
        toast.dismiss('ph-connect')
        if (addr !== savedWallet) {
          toast.error(`異なるウォレットが接続されました（${addr.slice(0, 6)}…）。正しいウォレットを選択してください。`)
          return
        }
        setPhantomReady(true)
      } catch {
        toast.dismiss('ph-connect')
        toast.error('Phantom への接続が必要です。「Phantom に接続」ボタンを押してください。')
        return
      }
    }

    setSendLoading(true)
    try {
      // バックエンドRPCプロキシ経由で接続 (403回避)
      const connection = new Connection(getRpcUrl(), 'confirmed')
      const fromPubkey = new PublicKey(savedWallet)
      const toPubkey = new PublicKey(sendTarget.solWallet)

      // INMU は Token-2022 トークン: 全命令に TOKEN_2022_PROGRAM_ID を指定
      const fromATA = await getAssociatedTokenAddress(INMU_MINT, fromPubkey, false, TOKEN_2022_PROGRAM_ID)
      const toATA = await getAssociatedTokenAddress(INMU_MINT, toPubkey, false, TOKEN_2022_PROGRAM_ID)

      const instructions = []

      // 受信者のATAが存在しない場合は作成
      try {
        await getAccount(connection, toATA, 'confirmed', TOKEN_2022_PROGRAM_ID)
      } catch {
        instructions.push(
          createAssociatedTokenAccountInstruction(fromPubkey, toATA, toPubkey, INMU_MINT, TOKEN_2022_PROGRAM_ID)
        )
      }

      const rawAmount = Math.floor(amount * Math.pow(10, INMU_DECIMALS))
      instructions.push(
        createTransferInstruction(fromATA, toATA, fromPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID)
      )

      const tx = new Transaction()
      tx.add(...instructions)
      tx.feePayer = fromPubkey

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized')
      tx.recentBlockhash = blockhash

      // signTransaction → sendRawTransaction (Phantom推奨方式)
      toast.loading('Phantom で署名してください…', { id: 'signing' })
      const signedTx = await phantom.signTransaction(tx)
      toast.dismiss('signing')

      toast.loading('Solanaネットワークへ送信中…', { id: 'sending' })
      const rawTx = signedTx.serialize()
      const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      })
      toast.dismiss('sending')

      toast.loading('トランザクション確認中…', { id: 'confirming' })
      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      )
      toast.dismiss('confirming')

      if (result.value.err) {
        throw new Error(`トランザクションが失敗しました: ${JSON.stringify(result.value.err)}`)
      }

      // バックエンドに履歴記録
      await fetch('/api/admin/record-sol-transfer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: sendTarget.userId,
          amount,
          txSignature: signature,
          targetWallet: sendTarget.solWallet,
        }),
      })

      toast.success(`${formatInmu(amount)} INMU を ${sendTarget.displayName} に送金しました！`)
      setSendOpen(false)
      setSendAmount('1')
      setSendTarget(null)
      fetchBalanceFor(savedWallet)
    } catch (e: unknown) {
      toast.dismiss('signing')
      toast.dismiss('sending')
      toast.dismiss('confirming')
      if (e instanceof Error && e.message !== 'User rejected the request.') {
        toast.error(`送金失敗: ${e.message}`)
      }
    } finally {
      setSendLoading(false)
    }
  }

  if (isAdmin === null) return null
  if (!isAdmin) return null

  const filteredUsers = users.filter(u =>
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) && u.solWallet
  )
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

        {/* ── 実INMU送金 ── */}
        {savedWallet && (
          <Card className="border-primary/30 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Send className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">実INMU送金</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              管理ウォレット → ユーザーウォレットへ実際のINMUをオンチェーン送金します。
              送金時にPhantomの署名確認が必要です。
            </p>
            {!phantomReady && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-300/40 bg-yellow-50/10 p-2.5 mb-3">
                <AlertTriangle className="size-3.5 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-yellow-700 dark:text-yellow-400">
                  Phantom未接続です。送金ボタンを押すと自動でPhantomへの接続確認が行われます。
                </p>
              </div>
            )}
            <Button onClick={() => setSendOpen(true)} className="min-h-11 w-full gap-2">
              <Send className="size-4" />
              ユーザーを選択して送金
            </Button>
          </Card>
        )}

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

      {/* ── 実INMU送金ダイアログ ── */}
      <Dialog open={sendOpen} onOpenChange={open => { setSendOpen(open); if (!open) setSendTarget(null) }}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-4 text-primary" />
              実INMU送金
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 pt-2">
            {!sendTarget ? (
              <>
                <p className="text-xs text-muted-foreground">
                  SOLアドレス登録済みのユーザーを選択してください
                </p>
                <Input
                  placeholder="ユーザー名で検索"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="min-h-10"
                />
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground py-4">
                    SOLアドレス登録済みのユーザーがいません
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {filteredUsers.map(u => (
                      <button
                        key={u.userId}
                        type="button"
                        onClick={() => setSendTarget(u)}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-secondary/30 transition-colors"
                      >
                        <User className="size-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{u.displayName}</p>
                          <p className="text-[10px] font-mono text-muted-foreground truncate">
                            {u.solWallet?.slice(0, 12)}…
                          </p>
                        </div>
                        <span className="text-xs font-mono shrink-0">{formatInmu(u.balance)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="rounded-lg bg-secondary/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">送金先</p>
                  <p className="font-medium text-sm">{sendTarget.displayName}</p>
                  <p className="font-mono text-[10px] text-muted-foreground break-all mt-0.5">
                    {sendTarget.solWallet}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium mb-1.5">送金量 (INMU)</p>
                  <Input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={sendAmount}
                    onChange={e => setSendAmount(e.target.value)}
                    className="min-h-11"
                    placeholder="例: 1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    管理ウォレット残高: {inmuBalance !== null ? formatInmu(inmuBalance) : '—'} INMU
                  </p>
                </div>

                {/* Phantom警告の説明 */}
                <div className="rounded-lg border border-amber-300/40 bg-amber-50/10 p-3">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mb-1">
                    ⚠️ Phantom で「警告」が表示された場合
                  </p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70">
                    「無視して続ける」を選択してください。
                    開発用URLのため表示されます。本番ドメインでは出ません。
                    秘密鍵は当アプリには送信されません。
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSendTarget(null)}
                    disabled={sendLoading}
                    className="flex-1 min-h-11"
                  >
                    戻る
                  </Button>
                  <Button
                    onClick={handleSendInmu}
                    disabled={sendLoading || !sendAmount}
                    className="flex-1 min-h-11 gap-2"
                  >
                    <Send className="size-4" />
                    {sendLoading ? '処理中…' : '署名して送金'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
