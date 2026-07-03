import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Send, Search, WalletCards, ExternalLink, CheckCircle2, AlertTriangle, User,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatInmu } from '@/lib/format'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'

const INMU_MINT = new PublicKey('4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump')
const INMU_DECIMALS = 6

interface PhantomProvider {
  isPhantom: boolean
  publicKey?: { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  disconnect(): Promise<void>
  signTransaction(tx: Transaction): Promise<Transaction>
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

function isMobile() { return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) }
function isIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) }

function openPhantomBrowser() {
  const url = encodeURIComponent(window.location.href)
  const ref = encodeURIComponent(window.location.origin)
  const deepLink = `phantom://browse/${url}?ref=${ref}`
  const universalLink = `https://phantom.app/ul/browse/${url}?ref=${ref}`
  if (isIOS()) {
    window.location.href = deepLink
  } else {
    window.location.href = `intent://browse/${url}#Intent;scheme=phantom;package=app.phantom;S.browser_fallback_url=${encodeURIComponent(universalLink)};end`
  }
}

function getRpcUrl() {
  return `${window.location.origin}/api/solana/rpc-proxy`
}

type SearchResult = {
  userId: string
  displayName: string
  solWallet: string | null
  xId: string | null
  discordId: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  senderWallet: string | null
  onSuccess?: () => void
}

export function UserSendDialog({ open, onClose, senderWallet, onSuccess }: Props) {
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [recipient, setRecipient] = useState<SearchResult | null>(null)
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [passcode, setPasscode] = useState('')
  const [sending, setSending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return }
    setSearchLoading(true)
    try {
      const res = await fetch(`/api/transfer/user-search?q=${encodeURIComponent(q)}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data: SearchResult[] = await res.json()
        setSearchResults(data)
      }
    } catch { /* ignore */ } finally {
      setSearchLoading(false)
    }
  }, [])

  function handleSearchChange(v: string) {
    setSearchQ(v)
    setRecipient(null)
    void searchUsers(v)
  }

  function selectRecipient(u: SearchResult) {
    setRecipient(u)
    setSearchQ(u.displayName)
    setSearchResults([])
  }

  function handleClose() {
    setSearchQ('')
    setSearchResults([])
    setRecipient(null)
    setAmount('')
    setMemo('')
    setPasscode('')
    setTxHash(null)
    onClose()
  }

  async function handleSend() {
    if (!recipient?.solWallet) {
      toast.error('送金先を選択してください')
      return
    }
    const amountNum = Number(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('送金量を正しく入力してください')
      return
    }
    if (!passcode.trim()) {
      toast.error('パスコードを入力してください')
      return
    }
    if (!senderWallet) {
      toast.error('ウォレットアドレスが設定されていません。プロフィールでSOLアドレスを設定してください。')
      return
    }

    setSending(true)
    try {
      const verRes = await fetch('/api/transfer/verify-passcode', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })
      if (!verRes.ok) {
        const d = await verRes.json()
        toast.error(d.error ?? 'パスコードが正しくありません')
        return
      }

      const phantom = getPhantom()
      if (!phantom) {
        setSending(false)
        if (isMobile()) {
          toast.info('Phantomアプリで開きます…')
          openPhantomBrowser()
          return
        }
        toast.error('Phantom ウォレットが見つかりません。インストールしてください。')
        window.open('https://phantom.app/', '_blank')
        return
      }

      let phantomPubkeyStr: string
      try {
        toast.loading('Phantom に接続しています…', { id: 'ph-connect' })
        const resp = await phantom.connect()
        phantomPubkeyStr = resp.publicKey.toString()
        toast.dismiss('ph-connect')
      } catch {
        toast.dismiss('ph-connect')
        toast.error('Phantom への接続がキャンセルされました')
        return
      }

      if (phantomPubkeyStr !== senderWallet) {
        toast.error(`異なるウォレットが接続されました。プロフィールのSOLアドレスと一致しません。`)
        return
      }

      const connection = new Connection(getRpcUrl(), 'confirmed')
      const fromPubkey = new PublicKey(senderWallet)
      const toPubkey = new PublicKey(recipient.solWallet)

      const fromATA = await getAssociatedTokenAddress(INMU_MINT, fromPubkey, false, TOKEN_2022_PROGRAM_ID)
      const toATA = await getAssociatedTokenAddress(INMU_MINT, toPubkey, false, TOKEN_2022_PROGRAM_ID)

      const instructions = [
        createAssociatedTokenAccountIdempotentInstruction(
          fromPubkey, toATA, toPubkey, INMU_MINT, TOKEN_2022_PROGRAM_ID,
        ),
      ]

      const rawAmount = Math.floor(amountNum * Math.pow(10, INMU_DECIMALS))
      instructions.push(
        createTransferInstruction(fromATA, toATA, fromPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID)
      )

      const tx = new Transaction()
      tx.add(...instructions)
      tx.feePayer = fromPubkey

      const { blockhash } = await connection.getLatestBlockhash('processed')
      tx.recentBlockhash = blockhash

      toast.loading('Phantom で署名してください…', { id: 'signing' })
      const signedTx = await phantom.signTransaction(tx)
      toast.dismiss('signing')

      toast.loading('Solanaネットワークへ送信中…', { id: 'sending' })
      const rawTx = signedTx.serialize()
      const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        maxRetries: 5,
      })
      toast.dismiss('sending')

      // 署名取得後すぐに履歴記録（確認タイムアウト前に保存）
      const recordRes = await fetch('/api/transfer/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: recipient.userId,
          amount: amountNum,
          memo: memo.trim() || undefined,
          passcode,
          txHash: signature,
        }),
      })
      if (!recordRes.ok) {
        const d = await recordRes.json()
        toast.warning(`送金は完了しましたが記録に失敗しました: ${d.error ?? ''}`)
      }

      setTxHash(signature)
      toast.success(`送金が完了しました！ ${formatInmu(amountNum)} INMU → ${recipient.displayName}`)
      onSuccess?.()
    } catch (e: unknown) {
      toast.dismiss('signing')
      toast.dismiss('sending')
      if (e instanceof Error && e.message !== 'User rejected the request.') {
        toast.error(`送金失敗: ${e.message}`)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-4 text-primary" />
            INMU 送金
          </DialogTitle>
        </DialogHeader>

        {txHash ? (
          <div className="flex flex-col gap-4 pt-1">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-5" />
              <p className="font-semibold text-sm">送金が完了しました！</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">TxHash</p>
              <p className="font-mono text-[10px] break-all">{txHash}</p>
            </div>
            <a
              href={`https://solscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              Solscan で確認
            </a>
            <Button onClick={handleClose} className="min-h-10">閉じる</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-1">
            {!senderWallet && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-300/40 bg-yellow-50/10 p-2.5">
                <AlertTriangle className="size-3.5 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-yellow-700 dark:text-yellow-400">
                  SOLアドレスが設定されていません。プロフィールで設定してください。
                </p>
              </div>
            )}
            {isMobile() && !getPhantom() && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-300/40 bg-blue-50/10 p-2.5">
                <AlertTriangle className="size-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 dark:text-blue-400">
                  Phantomが検出されていません。送金ボタンを押すとPhantomアプリで開きます。
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">送金先を検索</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={searchQ}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="ユーザー名 / SOLアドレス / X ID / Discord ID"
                  className="pl-9 min-h-10 text-sm"
                />
              </div>
              {searchLoading && (
                <p className="text-xs text-muted-foreground px-1">検索中…</p>
              )}
              {searchResults.length > 0 && (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  {searchResults.map(u => (
                    <button
                      key={u.userId}
                      type="button"
                      onClick={() => selectRecipient(u)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary/50 transition-colors border-b border-border last:border-0"
                    >
                      <User className="size-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{u.displayName}</p>
                        {u.solWallet && (
                          <p className="text-[10px] text-muted-foreground font-mono truncate">
                            {u.solWallet.slice(0, 8)}…
                          </p>
                        )}
                      </div>
                      <WalletCards className="size-3 text-green-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {recipient && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2">
                  <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{recipient.displayName}</p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                      {recipient.solWallet?.slice(0, 12)}…
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">送金量 (INMU)</Label>
                <Input
                  type="number"
                  min="0.000001"
                  step="any"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="例: 10"
                  className="min-h-10"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">メモ（任意）</Label>
                <Input
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  placeholder="任意メモ"
                  className="min-h-10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">送金パスコード</Label>
              <Input
                type="password"
                value={passcode}
                onChange={e => setPasscode(e.target.value)}
                placeholder="パスコードを入力"
                className="min-h-10"
                autoComplete="off"
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 p-2.5">
              <AlertTriangle className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Phantom ウォレットでの署名が必要です。パスコード確認後、Phantom が起動します。
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={sending}
                className="min-h-10 flex-1"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !recipient || !amount || !passcode || !senderWallet}
                className="min-h-10 flex-1 gap-1.5"
              >
                <Send className="size-3.5" />
                {sending ? '処理中…' : 'Phantom で送金'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
