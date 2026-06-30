import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clock3, ExternalLink, RefreshCw, Send, Square, CheckSquare, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getPhantomProvider, isMobileBrowser, openInPhantomBrowser, sendInmuWithPhantom } from '@/lib/admin-inmu-transfer'

type RewardRequestStatus = 'pending' | 'rejected' | 'paid'

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
  rejected: { label: '却下', className: 'border-rose-300/30 bg-rose-300/10 text-rose-200' },
  paid: { label: '送金済み', className: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' },
}

const PHANTOM_PENDING_PET_REWARD_KEY = 'inmu_admin_pending_pet_reward'
const petRewardTxKey = (id: number) => `inmu_admin_pet_reward_tx:${id}`

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
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [loadError, setLoadError] = useState('')
  const resumedTransfer = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await request('/admin/pet-reward-requests') as RewardRequest[]
      setRows(Array.isArray(data) ? data : [])
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

  useEffect(() => {
    if (loading || resumedTransfer.current || !getPhantomProvider()) return
    const pendingId = Number(sessionStorage.getItem(PHANTOM_PENDING_PET_REWARD_KEY))
    if (!Number.isInteger(pendingId)) return
    const row = rows.find(candidate => candidate.id === pendingId && candidate.status === 'pending')
    if (!row) {
      sessionStorage.removeItem(PHANTOM_PENDING_PET_REWARD_KEY)
      return
    }
    resumedTransfer.current = true
    void sendReward(row)
  }, [loading, rows])

  const visible = useMemo(() => filter === 'all' ? rows : rows.filter(row => row.status === filter), [filter, rows])

  function toggle(id: number) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function rejectOne(row: RewardRequest) {
    setSaving(true)
    try {
      await request(`/admin/pet-reward-requests/${row.id}`, 'PUT', {
        status: 'rejected',
        adminNote: notes[row.id] ?? '',
      })
      toast.success(`${row.displayName}の申請を却下しました`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function sendReward(row: RewardRequest) {
    if (row.status !== 'pending') return
    if (!row.solWallet) {
      toast.error('申請者のウォレットが未設定です')
      return
    }
    const savedSignature = sessionStorage.getItem(petRewardTxKey(row.id))
    if (!savedSignature && !getPhantomProvider()) {
      if (isMobileBrowser()) {
        sessionStorage.setItem(PHANTOM_PENDING_PET_REWARD_KEY, String(row.id))
        toast.info('Phantomアプリへ切り替えます…')
        window.setTimeout(openInPhantomBrowser, 500)
      } else {
        toast.error('Phantomウォレットをインストールしてください', {
          action: { label: 'Phantomを開く', onClick: () => window.open('https://phantom.app/', '_blank') },
        })
      }
      return
    }

    const toastId = `pet-reward-send-${row.id}`
    setSaving(true)
    try {
      const signature = savedSignature ?? await sendInmuWithPhantom(
          row.solWallet,
          Number(row.inmuAmount),
          message => toast.loading(message, { id: toastId }),
        )
      sessionStorage.setItem(petRewardTxKey(row.id), signature)
      if (savedSignature) toast.loading('送金済みTXIDをDBへ再記録しています…', { id: toastId })
      await request(`/admin/pet-reward-requests/${row.id}`, 'PUT', {
        status: 'paid',
        adminNote: notes[row.id] ?? '',
        txHash: signature,
      })
      sessionStorage.removeItem(PHANTOM_PENDING_PET_REWARD_KEY)
      sessionStorage.removeItem(petRewardTxKey(row.id))
      toast.success(`${Number(row.inmuAmount).toLocaleString()} INMUを送金しました`, { id: toastId })
      await load()
    } catch (error) {
      toast.dismiss(toastId)
      const message = error instanceof Error ? error.message : '送金に失敗しました'
      if (!sessionStorage.getItem(petRewardTxKey(row.id))) sessionStorage.removeItem(PHANTOM_PENDING_PET_REWARD_KEY)
      if (message === 'User rejected the request.') toast.info('送金をキャンセルしました')
      else if (sessionStorage.getItem(petRewardTxKey(row.id))) toast.error(`送金は完了しましたがDB記録に失敗しました。再度押すと記録のみ再試行します: ${message}`)
      else toast.error(`送金失敗: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  async function rejectBulk() {
    if (selected.size === 0) return
    setSaving(true)
    try {
      const data = await request('/admin/pet-reward-requests', 'PUT', {
        ids: [...selected],
        status: 'rejected',
      })
      toast.success(`${Number(data.updated ?? selected.size)}件を却下しました`)
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
          <p className="mt-0.5 text-[10px] text-muted-foreground">送金済みを押すとPhantomが起動し、送金成功後にTxIDを保存します。</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />更新
        </Button>
      </div>

      <div className="flex snap-x gap-1.5 overflow-x-auto pb-1">
        {(['pending', 'rejected', 'paid', 'all'] as const).map(value => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${filter === value ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
            {value === 'all' ? 'すべて' : STATUS[value].label}（{value === 'all' ? rows.length : rows.filter(row => row.status === value).length}）
          </button>
        ))}
      </div>

      {loadError && <p className="rounded-md border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{loadError}。管理セッションとAPI接続を確認して、再度「更新」を押してください。</p>}

      {selected.size > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="mb-2 text-xs font-semibold">{selected.size}件を選択中</p>
          <Button size="sm" disabled={saving} onClick={() => void rejectBulk()} variant="destructive" className="h-9 w-full text-[10px]">選択した申請を一括却下</Button>
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
                  <button type="button" onClick={() => row.status === 'pending' && toggle(row.id)} disabled={row.status !== 'pending'} aria-label="申請を選択" className="mt-0.5 text-muted-foreground disabled:opacity-25">
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
                      <Input value={notes[row.id] ?? ''} onChange={event => setNotes(current => ({ ...current, [row.id]: event.target.value }))} placeholder="管理メモ・却下理由" className="min-h-9 text-xs" />
                      {row.txHash && (
                        <a href={`https://solscan.io/tx/${row.txHash}`} target="_blank" rel="noopener noreferrer" className="flex min-h-9 items-center gap-1 rounded-md border border-emerald-300/20 px-3 text-[10px] text-emerald-200 hover:bg-emerald-300/10">
                          <ExternalLink className="size-3" />TXIDをSolscanで確認
                        </a>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <Button size="sm" disabled={saving || row.status !== 'pending'} onClick={() => void rejectOne(row)} variant="destructive" className="h-9 gap-1 text-[10px]"><XCircle className="size-3" />却下</Button>
                      <Button size="sm" disabled={saving || row.status !== 'pending' || !row.solWallet} onClick={() => void sendReward(row)} className="h-9 gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-500"><Send className="size-3" />送金済み</Button>
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
