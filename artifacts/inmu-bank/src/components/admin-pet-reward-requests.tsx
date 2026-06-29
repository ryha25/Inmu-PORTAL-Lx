import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, Clock3, RefreshCw, Send, Square, CheckSquare, XCircle } from 'lucide-react'
import { toast } from 'sonner'

type RewardRequestStatus = 'pending' | 'approved' | 'rejected' | 'paid'

type RewardRequest = {
  id: number
  userId: string
  displayName: string
  characterName: string | null
  reachedLevel: number | null
  inmuAmount: string | number
  status: RewardRequestStatus
  adminNote: string | null
  txHash: string | null
  createdAt: string
  solWallet: string | null
}

const STATUS: Record<RewardRequestStatus, { label: string; className: string }> = {
  pending: { label: '申請中', className: 'border-amber-300/30 bg-amber-300/10 text-amber-200' },
  approved: { label: '承認済み', className: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200' },
  rejected: { label: '却下', className: 'border-rose-300/30 bg-rose-300/10 text-rose-200' },
  paid: { label: '送金済み', className: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' },
}

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? '処理に失敗しました')
  return data
}

export function AdminPetRewardRequests() {
  const [rows, setRows] = useState<RewardRequest[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<RewardRequestStatus | 'all'>('pending')
  const [txHashes, setTxHashes] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [bulkTxHash, setBulkTxHash] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await request('/admin/pet-reward-requests') as RewardRequest[]
      setRows(Array.isArray(data) ? data : [])
      setTxHashes(Object.fromEntries((data ?? []).map(row => [row.id, row.txHash ?? ''])))
      setNotes(Object.fromEntries((data ?? []).map(row => [row.id, row.adminNote ?? ''])))
      setSelected(new Set())
      setLoadError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : '報酬申請の取得に失敗しました'
      console.error('[AdminPetRewardRequests] load failed', error)
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => filter === 'all' ? rows : rows.filter(row => row.status === filter), [filter, rows])

  function toggle(id: number) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function updateOne(row: RewardRequest, status: RewardRequestStatus) {
    setSaving(true)
    try {
      await request(`/admin/pet-reward-requests/${row.id}`, 'PUT', {
        status,
        adminNote: notes[row.id] ?? '',
        txHash: txHashes[row.id] ?? '',
      })
      toast.success(`${row.displayName}の申請を「${STATUS[status].label}」に更新しました`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function updateBulk(status: Exclude<RewardRequestStatus, 'pending'>) {
    if (selected.size === 0) return
    setSaving(true)
    try {
      const data = await request('/admin/pet-reward-requests', 'PUT', {
        ids: [...selected],
        status,
        txHash: status === 'paid' ? bulkTxHash : '',
      })
      toast.success(`${Number(data.updated ?? selected.size)}件を「${STATUS[status].label}」に更新しました`)
      setBulkTxHash('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '一括更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">INMU PET報酬申請</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">承認後に送金し、TxIDを記録して送金済みに変更します。</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />更新
        </Button>
      </div>

      <div className="flex snap-x gap-1.5 overflow-x-auto pb-1">
        {(['pending', 'approved', 'rejected', 'paid', 'all'] as const).map(value => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${filter === value ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
            {value === 'all' ? 'すべて' : STATUS[value].label}（{value === 'all' ? rows.length : rows.filter(row => row.status === value).length}）
          </button>
        ))}
      </div>

      {loadError && <p className="rounded-md border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{loadError}。管理セッションとAPI接続を確認して、再度「更新」を押してください。</p>}

      {selected.size > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="mb-2 text-xs font-semibold">{selected.size}件を選択中</p>
          <Input value={bulkTxHash} onChange={event => setBulkTxHash(event.target.value)} placeholder="一括TxID（送金済み処理時・任意）" className="mb-2 min-h-9 text-xs" />
          <div className="grid grid-cols-3 gap-1.5">
            <Button size="sm" disabled={saving} onClick={() => void updateBulk('approved')} className="h-9 bg-cyan-600 text-[10px] hover:bg-cyan-500">一括承認</Button>
            <Button size="sm" disabled={saving} onClick={() => void updateBulk('rejected')} variant="destructive" className="h-9 text-[10px]">一括却下</Button>
            <Button size="sm" disabled={saving} onClick={() => void updateBulk('paid')} className="h-9 bg-emerald-600 text-[10px] hover:bg-emerald-500">一括送金済み</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">読み込んでいます…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">対象の申請はありません</p>
      ) : (
        <div className="space-y-2">
          {visible.map(row => {
            const checked = selected.has(row.id)
            return (
              <article key={row.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => toggle(row.id)} aria-label="申請を選択" className="mt-0.5 text-muted-foreground">
                    {checked ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="break-words text-sm font-bold">{row.displayName}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(row.createdAt).toLocaleString('ja-JP')}</p>
                      </div>
                      <span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${STATUS[row.status].className}`}>{STATUS[row.status].label}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-secondary/25 p-2 text-[10px]">
                      <p><span className="text-muted-foreground">キャラ：</span>{row.characterName ?? '—'}</p>
                      <p><span className="text-muted-foreground">到達：</span>Lv.{row.reachedLevel ?? '—'}</p>
                      <p className="col-span-2 text-sm font-black text-amber-300">{Number(row.inmuAmount).toLocaleString()} INMU</p>
                      <p className="col-span-2 break-all"><span className="text-muted-foreground">Wallet：</span>{row.solWallet ?? '未設定'}</p>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Input value={txHashes[row.id] ?? ''} onChange={event => setTxHashes(current => ({ ...current, [row.id]: event.target.value }))} placeholder="送金トランザクションID" className="min-h-9 text-xs" />
                      <Input value={notes[row.id] ?? ''} onChange={event => setNotes(current => ({ ...current, [row.id]: event.target.value }))} placeholder="管理メモ・却下理由" className="min-h-9 text-xs" />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <Button size="sm" disabled={saving || row.status === 'approved'} onClick={() => void updateOne(row, 'approved')} className="h-9 gap-1 bg-cyan-600 text-[10px] hover:bg-cyan-500"><CheckCircle2 className="size-3" />承認</Button>
                      <Button size="sm" disabled={saving || row.status === 'rejected'} onClick={() => void updateOne(row, 'rejected')} variant="destructive" className="h-9 gap-1 text-[10px]"><XCircle className="size-3" />却下</Button>
                      <Button size="sm" disabled={saving || row.status === 'paid'} onClick={() => void updateOne(row, 'paid')} className="h-9 gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-500"><Send className="size-3" />送金済み</Button>
                    </div>
                    {row.status === 'pending' && <p className="mt-2 flex items-center gap-1 text-[9px] text-amber-200/70"><Clock3 className="size-3" />運営確認待ち</p>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
