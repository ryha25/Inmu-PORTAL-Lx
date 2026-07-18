import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { AdminShell } from '@/components/admin-shell'
import { RankingView } from '@/components/ranking-view'
import type { MonthlyVolumeRow, MonthlyVolumeSeason } from '@/components/ranking-view'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import { confirmSignaturePolling, getSolanaConfirmationError, SOLANA_SEND_OPTIONS } from '@/lib/solana-confirm'

type InmuRow      = { rank: number; userId: string; displayName: string; balance: number; showBalance: boolean; totalReceived: number; participations: number }
type PointsRow    = { rank: number; userId: string; displayName: string; points: number; participations: number }
type CompositeRow = { rank: number; userId: string; displayName: string; balance: number; points: number; clears: number; score: number }
type CompositeResult = { ranking: CompositeRow[]; myRank: number | null; totalUsers: number }
type MonthlyVolumeResult = { season: MonthlyVolumeSeason; formula: string; ranking: MonthlyVolumeRow[] }

interface PhantomProvider {
  isPhantom: boolean
  publicKey?: { toString(): string } | null
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>
  signTransaction(tx: Transaction): Promise<Transaction>
}

const INMU_MINT_PUBKEY = new PublicKey('4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump')
const INMU_DECIMALS = 6
const AIRDROP_CHUNK_SIZE = 2

function getPhantom(): PhantomProvider | null {
  const w = window as Window & { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider }
  if (w.phantom?.solana?.isPhantom) return w.phantom.solana
  if (w.solana?.isPhantom) return w.solana
  return null
}

function getAdminRpcUrl() {
  return `${window.location.origin}/api/solana/rpc-proxy`
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Error')
  }
  return res.json()
}

export function AdminRankingPage() {
  const [, navigate] = useLocation()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [inmuRows,      setInmuRows]      = useState<InmuRow[]>([])
  const [pointsRows,    setPointsRows]    = useState<PointsRow[]>([])
  const [compositeRows, setCompositeRows] = useState<CompositeRow[]>([])
  const [monthlyVolumeRows, setMonthlyVolumeRows] = useState<MonthlyVolumeRow[]>([])
  const [monthlyVolumeSeason, setMonthlyVolumeSeason] = useState<MonthlyVolumeSeason | null>(null)
  const [monthlyVolumeFormula, setMonthlyVolumeFormula] = useState('')
  const [monthlyVolumeSending, setMonthlyVolumeSending] = useState(false)
  const [totalUsers,    setTotalUsers]    = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/admin-session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then((d: { isAdmin: boolean }) => {
        setIsAdmin(d.isAdmin)
        if (!d.isAdmin) navigate('/inmu1919-login')
      })
      .catch(() => { setIsAdmin(false); navigate('/inmu1919-login') })
  }, [navigate])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetch('/api/ranking', { credentials: 'include' })
          .then(r => r.ok ? r.json() : [])
          .then((d: InmuRow[]) => { if (Array.isArray(d)) setInmuRows(d) })
          .catch(() => {}),

        fetch('/api/ranking/points', { credentials: 'include' })
          .then(r => r.ok ? r.json() : [])
          .then((d: PointsRow[]) => { if (Array.isArray(d)) setPointsRows(d) })
          .catch(() => {}),

        fetch('/api/ranking/composite', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((d: CompositeResult | null) => {
            if (d) {
              setCompositeRows(d.ranking ?? [])
              setTotalUsers(d.totalUsers ?? 0)
            }
          })
          .catch(() => {}),

        fetch('/api/admin/ranking/monthly-volume', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then((d: MonthlyVolumeResult | null) => {
            if (d) {
              setMonthlyVolumeRows(d.ranking ?? [])
              setMonthlyVolumeSeason(d.season ?? null)
              setMonthlyVolumeFormula(d.formula ?? '')
            }
          })
          .catch(() => {}),
      ])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) fetchAll()
  }, [isAdmin, fetchAll])

  async function handleLogout() {
    await fetch('/api/auth/admin-sign-out', { method: 'POST', credentials: 'include' })
    navigate('/inmu1919-login')
  }

  async function handleMonthlyVolumeBulkSend(rows: MonthlyVolumeRow[]) {
    const payableRows = rows.filter(row => row.solWallet && row.estimatedInmuAmount > 0)
    const noWalletCount = rows.filter(row => !row.solWallet && row.estimatedInmuAmount > 0).length
    if (payableRows.length === 0) {
      toast.error('送金対象がありません。SOLアドレス未登録または配布予定INMUが0です。')
      return
    }
    const totalAmount = payableRows.reduce((sum, row) => sum + row.estimatedInmuAmount, 0)
    if (!window.confirm(`${payableRows.length}名へ合計 ${totalAmount.toLocaleString()} INMU を送金します。続行しますか？`)) return

    const phantom = getPhantom()
    if (!phantom) {
      toast.error('Phantomウォレットが見つかりません。Phantomを有効にしてください。')
      return
    }

    setMonthlyVolumeSending(true)
    try {
      toast.loading('Phantomに接続しています...', { id: 'monthly-volume-connect' })
      const resp = await phantom.connect()
      toast.dismiss('monthly-volume-connect')

      const connection = new Connection(getAdminRpcUrl(), 'confirmed')
      const fromPubkey = new PublicKey(resp.publicKey.toString())
      const fromATA = await getAssociatedTokenAddress(INMU_MINT_PUBKEY, fromPubkey, false, TOKEN_2022_PROGRAM_ID)

      for (let i = 0; i < payableRows.length; i += AIRDROP_CHUNK_SIZE) {
        const chunk = payableRows.slice(i, i + AIRDROP_CHUNK_SIZE)
        const chunkLabel = payableRows.length > AIRDROP_CHUNK_SIZE ? ` (${Math.floor(i / AIRDROP_CHUNK_SIZE) + 1}/${Math.ceil(payableRows.length / AIRDROP_CHUNK_SIZE)})` : ''
        const instrs: Parameters<typeof Transaction.prototype.add>[0][] = []

        for (const row of chunk) {
          const toPubkey = new PublicKey(row.solWallet!)
          const toATA = await getAssociatedTokenAddress(INMU_MINT_PUBKEY, toPubkey, false, TOKEN_2022_PROGRAM_ID)
          const rawAmount = Math.floor(row.estimatedInmuAmount * Math.pow(10, INMU_DECIMALS))
          instrs.push(createAssociatedTokenAccountIdempotentInstruction(fromPubkey, toATA, toPubkey, INMU_MINT_PUBKEY, TOKEN_2022_PROGRAM_ID))
          instrs.push(createTransferInstruction(fromATA, toATA, fromPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID))
        }

        const tx = new Transaction()
        tx.add(...instrs)
        tx.feePayer = fromPubkey
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
        tx.recentBlockhash = blockhash

        toast.loading(`Phantomで署名してください${chunkLabel}...`, { id: 'monthly-volume-sign' })
        const signedTx = await phantom.signTransaction(tx)
        toast.dismiss('monthly-volume-sign')

        toast.loading(`Solanaへ送信中${chunkLabel}...`, { id: 'monthly-volume-send' })
        const signature = await connection.sendRawTransaction(signedTx.serialize(), SOLANA_SEND_OPTIONS)
        toast.dismiss('monthly-volume-send')

        toast.loading(`オンチェーン確認中${chunkLabel}...`, { id: 'monthly-volume-confirm' })
        const confirmation = await confirmSignaturePolling(connection, signature, lastValidBlockHeight)
        toast.dismiss('monthly-volume-confirm')
        const confirmationError = getSolanaConfirmationError(confirmation, signature)
        if (confirmationError) throw new Error(confirmationError)

        await api('/admin/record-airdrop-batch-variable', 'POST', {
          payments: chunk.map(row => ({ userId: row.userId, wallet: row.solWallet, amount: row.estimatedInmuAmount })),
          txSignature: signature,
          memo: `月間取引高ランキング還元 ${monthlyVolumeSeason?.label ?? ''}`.trim(),
        })
      }

      if (noWalletCount > 0) toast.warning(`${noWalletCount}名はSOLアドレス未登録のためスキップしました`)
      toast.success(`月間取引高ランキング還元を ${payableRows.length}名へ送金しました`)
      await fetchAll()
    } catch (error) {
      toast.dismiss('monthly-volume-connect')
      toast.dismiss('monthly-volume-sign')
      toast.dismiss('monthly-volume-send')
      toast.dismiss('monthly-volume-confirm')
      if ((error as Error).message !== 'User rejected the request.') {
        toast.error(error instanceof Error ? error.message : '送金に失敗しました')
      }
    } finally {
      setMonthlyVolumeSending(false)
    }
  }

  if (isAdmin === null || !isAdmin) return null

  return (
    <AdminShell onLogout={handleLogout}>
      <PageHeader titleKey="nav_ranking">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0 h-8" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          更新
        </Button>
      </PageHeader>
      <RankingView
        inmuRows={inmuRows}
        pointsRows={pointsRows}
        compositeRows={compositeRows}
        monthlyVolumeRows={monthlyVolumeRows}
        monthlyVolumeSeason={monthlyVolumeSeason}
        monthlyVolumeFormula={monthlyVolumeFormula}
        myCompositeRank={null}
        myInmuRank={null}
        myPointsRank={null}
        totalUsers={totalUsers}
        currentUserId={undefined}
        isAdmin
        onMonthlyVolumeBulkSend={handleMonthlyVolumeBulkSend}
        monthlyVolumeBulkSending={monthlyVolumeSending}
      />
    </AdminShell>
  )
}
