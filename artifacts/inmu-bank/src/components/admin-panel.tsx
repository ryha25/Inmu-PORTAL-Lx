import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu, maskWallet } from '@/lib/format'
import { toast } from 'sonner'
import { useState, useEffect, useCallback } from 'react'
import {
  Search, Download, Shield, User, Trash2,
  CheckSquare, Square, Send, Star, Coins,
  WalletCards, History, X as XIcon, MinusCircle, Plus, Edit2, Lock,
  TrendingUp, TrendingDown, RefreshCw,
} from 'lucide-react'
import type { UserRow } from '@/pages/admin-page'

type AuditRow = {
  id: number
  adminId: string
  action: string
  targetUserId: string | null
  createdAt: string
}

type TradeTxRow = {
  id: number
  userId: string
  walletAddress: string
  type: string
  tokenAmount: string
  txSignature: string
  dex: string | null
  tradedAt: string
}

type MissionRow = {
  id: number
  title: string
  description: string | null
  type: string
  points: number
  startAt: string | null
  endAt: string | null
  linkUrl: string | null
  isActive: boolean
  createdAt: string
}

type TxRow = {
  id: number
  userId: string
  type: string
  amount: string
  memo: string | null
  counterparty: string | null
  createdAt: string
}

type EmergencyRow = {
  userId: string
  displayName: string
  passwordEnabled: boolean
  passcodeEnabled: boolean
  updatedAt: string | null
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error ?? 'Error')
  }
  if (res.headers.get('content-type')?.includes('text/csv')) return res.text()
  return res.json()
}

const TX_TYPE_LABEL: Record<string, string> = {
  deposit: '入金',
  withdraw: '出金',
  send: '送金',
  receive: '受取',
  reward: '報酬',
  airdrop: 'エアドロップ',
  inmu_send: 'INMU送金',
  points_send: 'ポイント送金',
  points_deduct: 'ポイント減算',
}

const TX_INCOME_TYPES = ['deposit', 'receive', 'reward', 'airdrop', 'inmu_send', 'points_send']

function UserDetailDialog({
  user,
  onClose,
}: {
  user: UserRow
  onClose: () => void
}) {
  const [txs, setTxs] = useState<TxRow[]>([])
  const [txLoading, setTxLoading] = useState(true)

  useEffect(() => {
    setTxLoading(true)
    fetch(`/api/admin/user-transactions?userId=${encodeURIComponent(user.userId)}`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(d => { setTxs(Array.isArray(d) ? d : []) })
      .catch(() => setTxs([]))
      .finally(() => setTxLoading(false))
  }, [user.userId])

  return (
    <DialogContent className="max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <User className="size-4 text-primary" />
          {user.displayName}
          {user.role === 'admin' && <Shield className="size-3 text-primary" />}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 pt-1">
        {/* ── ユーザー詳細情報 ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">INMU残高</p>
            <p className="font-mono font-bold text-sm mt-0.5">{formatInmu(user.balance)}</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">月間ポイント</p>
            <p className="font-mono font-bold text-sm mt-0.5">{formatInmu(user.monthlyPoints)} pt</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">参加回数</p>
            <p className="font-mono font-bold text-sm mt-0.5">{user.participationCount} 回</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-[10px] text-muted-foreground">累計受取</p>
            <p className="font-mono font-bold text-sm mt-0.5">{formatInmu(user.totalReceived)}</p>
          </div>
          <div className="rounded-lg bg-green-500/10 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="size-3 text-green-500" />累計購入</p>
            <p className="font-mono font-bold text-sm mt-0.5 text-green-600 dark:text-green-400">{formatInmu(user.totalBought ?? '0')} INMU</p>
            {user.lastBuyAt && <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(user.lastBuyAt).toLocaleDateString('ja-JP')}</p>}
          </div>
          <div className="rounded-lg bg-red-500/10 p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingDown className="size-3 text-red-500" />累計売却</p>
            <p className="font-mono font-bold text-sm mt-0.5 text-red-500">{formatInmu(user.totalSold ?? '0')} INMU</p>
            {user.lastSellAt && <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(user.lastSellAt).toLocaleDateString('ja-JP')}</p>}
          </div>
        </div>

        {/* SOLアドレス */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 mb-1">
            <WalletCards className="size-3.5 text-primary" />
            <p className="text-xs font-medium">SOLアドレス</p>
          </div>
          {user.solWallet ? (
            <p className="font-mono text-[11px] break-all text-foreground">{user.solWallet}</p>
          ) : (
            <p className="text-xs text-muted-foreground">未設定</p>
          )}
        </div>

        {/* ── 入出金履歴 ── */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 mb-3">
            <History className="size-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">入出金履歴（直近50件）</p>
          </div>
          {txLoading ? (
            <p className="text-xs text-center text-muted-foreground py-4">読み込み中…</p>
          ) : txs.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground py-4">履歴なし</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {txs.map(tx => {
                const isIncome = TX_INCOME_TYPES.includes(tx.type)
                return (
                  <div key={tx.id} className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-xs font-medium ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                        {TX_TYPE_LABEL[tx.type] ?? tx.type}
                      </span>
                      {tx.memo && (
                        <span className="text-[10px] text-muted-foreground">{tx.memo}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <span className={`font-mono text-sm font-bold shrink-0 ${isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                      {isIncome ? '+' : '-'}{formatInmu(tx.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  )
}

export function AdminPanel({ users, onRefresh }: { users: UserRow[]; onRefresh: () => void }) {
  const { t } = useI18n()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailUser, setDetailUser] = useState<UserRow | null>(null)

  const [bulkAmount, setBulkAmount] = useState('')

  const [bulkReason, setBulkReason] = useState('')
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMsg, setNotifMsg] = useState('')
  const [pointsAmount, setPointsAmount] = useState('')
  const [deductPointsAmount, setDeductPointsAmount] = useState('')
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [missionForm, setMissionForm] = useState({ title: '', description: '', type: 'daily', points: '', startAt: '', endAt: '', linkUrl: '' })
  const [editingMissionId, setEditingMissionId] = useState<number | null>(null)

  const [airdropAllAmount, setAirdropAllAmount] = useState('')
  const [airdropAllMemo, setAirdropAllMemo] = useState('')
  const [pointsAllAmount, setPointsAllAmount] = useState('')
  const [pointsAllReason, setPointsAllReason] = useState('')

  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)

  const [tradeRows, setTradeRows] = useState<TradeTxRow[]>([])
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeFetched, setTradeFetched] = useState(false)
  const [tradeUserFilter, setTradeUserFilter] = useState('')
  const [tradeScanning, setTradeScanning] = useState<string | null>(null)

  const [emergencyList, setEmergencyList] = useState<EmergencyRow[]>([])
  const [emergencySearch, setEmergencySearch] = useState('')
  const [emergencyUserId, setEmergencyUserId] = useState<string | null>(null)
  const [emergencyForm, setEmergencyForm] = useState({ password: '', passcode: '', passwordEnabled: false, passcodeEnabled: false })
  const [emergencySaving, setEmergencySaving] = useState(false)
  const [confirmOp, setConfirmOp] = useState<{ label: string; fn: () => Promise<void> } | null>(null)
  const [passcodeInput, setPasscodeInput] = useState('')
  const [passcodeLoading, setPasscodeLoading] = useState(false)

  async function handleConfirmPasscode() {
    if (!confirmOp || !passcodeInput) return
    setPasscodeLoading(true)
    try {
      await api('/admin/verify-code', 'POST', { code: passcodeInput })
      setPasscodeInput('')
      setConfirmOp(null)
      await confirmOp.fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'パスコードが違います')
    } finally {
      setPasscodeLoading(false)
    }
  }

  function withConfirm(label: string, fn: () => Promise<void>) {
    setPasscodeInput('')
    setConfirmOp({ label, fn })
  }

  const filtered = users.filter(u =>
    u.displayName.toLowerCase().includes(search.toLowerCase()) ||
    (u.solWallet ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const allSelected = filtered.length > 0 && filtered.every(u => selected.has(u.userId))
  const selectedIds = Array.from(selected)

  function toggleUser(userId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map(u => u.userId)))
  }

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true)
    try {
      await fn()
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadBackup() {
    setLoading(true)
    try {
      const csv = await api('/admin/backup-csv', 'GET')
      const blob = new Blob([csv as string], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'inmu-backup.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('success'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function loadAuditLog() {
    try {
      const data = await api('/admin/audit', 'GET') as AuditRow[]
      setAuditLogs(data)
    } catch {
      toast.error(t('error'))
    }
  }

  async function loadMissions() {
    try {
      const data = await api('/admin/missions', 'GET') as MissionRow[]
      setMissions(data)
    } catch {
      toast.error(t('error'))
    }
  }

  const loadTradeHistory = useCallback(async (force = false) => {
    if (tradeFetched && !force) return
    setTradeLoading(true)
    try {
      const data = await api('/admin/trade-history?limit=200', 'GET') as TradeTxRow[]
      setTradeRows(Array.isArray(data) ? data : [])
      setTradeFetched(true)
    } catch {
      toast.error(t('error'))
    } finally {
      setTradeLoading(false)
    }
  }, [tradeFetched, t])

  async function handleAdminScan(userId: string) {
    setTradeScanning(userId)
    try {
      const result = await api('/admin/solana/scan-trades', 'POST', { targetUserId: userId }) as { added: number; total: number }
      toast.success(`${result.added}件の新規取引（合計${result.total}件）`)
      await loadTradeHistory(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setTradeScanning(null)
    }
  }

  async function saveMission() {
    const { title, description, type, points, startAt, endAt, linkUrl } = missionForm
    if (!title.trim()) { toast.error('タイトルが必要です'); return }
    try {
      if (editingMissionId !== null) {
        await api(`/admin/missions/${editingMissionId}`, 'PUT', { title, description, type, points: Number(points) || 0, startAt: startAt || null, endAt: endAt || null, linkUrl: linkUrl || null })
      } else {
        await api('/admin/missions', 'POST', { title, description, type, points: Number(points) || 0, startAt: startAt || null, endAt: endAt || null, linkUrl: linkUrl || null })
      }
      setMissionForm({ title: '', description: '', type: 'daily', points: '', startAt: '', endAt: '', linkUrl: '' })
      setEditingMissionId(null)
      await loadMissions()
      toast.success('保存しました')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-primary">
        <Shield className="size-4" />
        <p className="text-sm font-medium">{t('admin_only')}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('search')}
          className="min-h-11 pl-9"
        />
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="missions" onClick={loadMissions}>ミッション</TabsTrigger>
          <TabsTrigger value="emergency" onClick={async () => {
            try { const d = await api('/admin/emergency-auth', 'GET'); setEmergencyList(Array.isArray(d) ? d : []) } catch { setEmergencyList([]) }
          }}>緊急</TabsTrigger>
          <TabsTrigger value="trade" onClick={() => loadTradeHistory()}>売買</TabsTrigger>
        </TabsList>

        {/* ── Users tab ── */}
        <TabsContent value="users" className="flex flex-col gap-3 mt-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {allSelected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
              全選択 ({selected.size}/{filtered.length})
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                選択解除
              </button>
            )}
          </div>

          {filtered.map(u => (
            <Card
              key={u.userId}
              className={`border-border bg-card p-3 cursor-pointer transition-colors hover:bg-secondary/30 ${
                selected.has(u.userId) ? 'bg-primary/5 border-primary/30' : ''
              }`}
              onClick={() => setDetailUser(u)}
            >
              <div className="flex items-center gap-3">
                <div onClick={e => { e.stopPropagation(); toggleUser(u.userId) }}>
                  {selected.has(u.userId)
                    ? <CheckSquare className="size-4 text-primary" />
                    : <Square className="size-4 text-muted-foreground" />}
                </div>
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  <User className="size-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{u.displayName}</span>
                  {u.role === 'admin' && <Shield className="size-3 text-primary shrink-0" />}
                </div>
                <span className="font-mono text-sm font-bold shrink-0">{formatInmu(u.balance)}</span>
              </div>
              <div className="mt-1.5 pl-7 flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  参加: {u.participationCount}
                </span>
                {u.solWallet ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <WalletCards className="size-3 text-green-500" />
                    {maskWallet(u.solWallet)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/50">SOL未設定</span>
                )}
              </div>
            </Card>
          ))}

          <Button
            onClick={handleDownloadBackup}
            variant="outline"
            className="min-h-11 gap-2 mt-2"
            disabled={loading}
          >
            <Download className="size-4" />
            {t('backup')} (CSV)
          </Button>
        </TabsContent>

        {/* ── Actions tab ── */}
        <TabsContent value="actions" className="flex flex-col gap-4 mt-3">

          {/* 全体配布 */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-col gap-4">
            <p className="text-sm font-semibold text-primary flex items-center gap-2">
              <Star className="size-4" />
              全体配布
            </p>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Coins className="size-3" /> 全員INMU送金
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="配布量 / 人"
                  value={airdropAllAmount}
                  onChange={e => setAirdropAllAmount(e.target.value)}
                  className="min-h-10 flex-1"
                />
                <Button
                  onClick={() => withConfirm('全員INMU送金', () => withLoading(async () => {
                    const d = await api('/admin/distribute-airdrop-all', 'POST', {
                      amount: Number(airdropAllAmount),
                      memo: airdropAllMemo || 'INMU送金',
                    }) as { count: number }
                    toast.success(`${d.count}名にINMU送金完了`)
                    setAirdropAllAmount('')
                    setAirdropAllMemo('')
                  }))}
                  disabled={loading || !airdropAllAmount}
                  className="min-h-10"
                >
                  送金
                </Button>
              </div>
              <Input
                placeholder="メモ（任意）"
                value={airdropAllMemo}
                onChange={e => setAirdropAllMemo(e.target.value)}
                className="min-h-10"
              />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Star className="size-3" /> 全員ポイント送金
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="付与ポイント"
                  value={pointsAllAmount}
                  onChange={e => setPointsAllAmount(e.target.value)}
                  className="min-h-10 flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => withConfirm('全員ポイント送金', () => withLoading(async () => {
                    const d = await api('/admin/grant-points-all', 'POST', {
                      amount: Number(pointsAllAmount),
                      reason: pointsAllReason || 'ポイント送金',
                    }) as { count: number }
                    toast.success(`${d.count}名にポイント送金完了`)
                    setPointsAllAmount('')
                    setPointsAllReason('')
                  }))}
                  disabled={loading || !pointsAllAmount}
                  className="min-h-10"
                >
                  送金
                </Button>
              </div>
              <Input
                placeholder="理由（任意）"
                value={pointsAllReason}
                onChange={e => setPointsAllReason(e.target.value)}
                className="min-h-10"
              />
            </div>
          </div>

          {/* 選択ユーザー操作 */}
          {selected.size > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare className="size-4 text-primary" />
                {selected.size}名選択中
              </p>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Coins className="size-3" /> INMU送金（選択ユーザー）
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="配布量"
                    value={bulkAmount}
                    onChange={e => setBulkAmount(e.target.value)}
                    className="min-h-10 flex-1"
                  />
                  <Button
                    onClick={() => withConfirm('INMU送金', () => withLoading(() =>
                      api('/admin/distribute-airdrop', 'POST', {
                        targetUserIds: selectedIds,
                        amount: Number(bulkAmount),
                        memo: bulkReason || 'INMU送金',
                      })
                    ))}
                    disabled={loading || !bulkAmount}
                    className="min-h-10"
                  >
                    送金
                  </Button>
                </div>
              </div>


              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Star className="size-3" /> ポイント送金（選択ユーザー）
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="付与ポイント"
                    value={pointsAmount}
                    onChange={e => setPointsAmount(e.target.value)}
                    className="min-h-10 flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => withConfirm('ポイント送金', () => withLoading(() =>
                      api('/admin/grant-points', 'POST', {
                        targetUserIds: selectedIds,
                        amount: Number(pointsAmount),
                        reason: bulkReason || 'ポイント送金',
                      })
                    ))}
                    disabled={loading || !pointsAmount}
                    className="min-h-10"
                  >
                    送金
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MinusCircle className="size-3 text-destructive" /> ポイント減算（選択ユーザー）
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="減算ポイント"
                    value={deductPointsAmount}
                    onChange={e => setDeductPointsAmount(e.target.value)}
                    className="min-h-10 flex-1"
                  />
                  <Button
                    variant="destructive"
                    onClick={() => withConfirm('ポイント減算', () => withLoading(async () => {
                      await api('/admin/deduct-points', 'POST', {
                        targetUserIds: selectedIds,
                        amount: Number(deductPointsAmount),
                        reason: bulkReason || '管理者によるポイント減算',
                      })
                      toast.success(`${selectedIds.length}名からポイント減算完了`)
                      setDeductPointsAmount('')
                    }))}
                    disabled={loading || !deductPointsAmount}
                    className="min-h-10"
                  >
                    減算
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Send className="size-3" /> 通知送信（選択ユーザー）
                </p>
                <Input
                  placeholder="タイトル"
                  value={notifTitle}
                  onChange={e => setNotifTitle(e.target.value)}
                  className="min-h-10"
                />
                <Input
                  placeholder="メッセージ（任意）"
                  value={notifMsg}
                  onChange={e => setNotifMsg(e.target.value)}
                  className="min-h-10"
                />
                <Button
                  variant="outline"
                  onClick={() => withLoading(async () => {
                    await api('/admin/send-notification', 'POST', {
                      targetUserIds: selectedIds,
                      title: notifTitle,
                      message: notifMsg,
                    })
                    setNotifTitle('')
                    setNotifMsg('')
                  })}
                  disabled={loading || !notifTitle}
                  className="min-h-10 gap-2"
                >
                  <Send className="size-4" />送信
                </Button>
              </div>

              <Input
                placeholder="理由・メモ（共通）"
                value={bulkReason}
                onChange={e => setBulkReason(e.target.value)}
                className="min-h-10"
              />
            </div>
          )}

          {selected.size === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              Usersタブでユーザーをタップして詳細表示・選択
            </p>
          )}
        </TabsContent>

        {/* ── Missions tab ── */}
        <TabsContent value="missions" className="flex flex-col gap-4 mt-3">

          {/* 作成・編集フォーム */}
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-primary flex items-center gap-2">
              {editingMissionId !== null ? <Edit2 className="size-4" /> : <Plus className="size-4" />}
              {editingMissionId !== null ? 'ミッション編集' : 'ミッション作成'}
            </p>
            <div className="flex flex-col gap-2">
              <Input
                placeholder="タイトル *"
                value={missionForm.title}
                onChange={e => setMissionForm(f => ({ ...f, title: e.target.value }))}
                className="min-h-10"
              />
              <Input
                placeholder="説明（任意）"
                value={missionForm.description}
                onChange={e => setMissionForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-10"
              />
              <div className="flex gap-2">
                <select
                  value={missionForm.type}
                  onChange={e => setMissionForm(f => ({ ...f, type: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring flex-1"
                >
                  <option value="daily">デイリー</option>
                  <option value="weekly">ウィークリー</option>
                </select>
                <Input
                  type="number"
                  placeholder="ポイント"
                  value={missionForm.points}
                  onChange={e => setMissionForm(f => ({ ...f, points: e.target.value }))}
                  className="min-h-10 flex-1"
                />
              </div>
              <Input
                placeholder="リンクURL（任意）"
                value={missionForm.linkUrl}
                onChange={e => setMissionForm(f => ({ ...f, linkUrl: e.target.value }))}
                className="min-h-10"
              />
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <Label className="text-xs text-muted-foreground">開始日時</Label>
                  <Input
                    type="datetime-local"
                    value={missionForm.startAt}
                    onChange={e => setMissionForm(f => ({ ...f, startAt: e.target.value }))}
                    className="min-h-10"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <Label className="text-xs text-muted-foreground">終了日時</Label>
                  <Input
                    type="datetime-local"
                    value={missionForm.endAt}
                    onChange={e => setMissionForm(f => ({ ...f, endAt: e.target.value }))}
                    className="min-h-10"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveMission} className="min-h-10 flex-1">
                  {editingMissionId !== null ? '更新' : '作成'}
                </Button>
                {editingMissionId !== null && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingMissionId(null)
                      setMissionForm({ title: '', description: '', type: 'daily', points: '', startAt: '', endAt: '', linkUrl: '' })
                    }}
                    className="min-h-10"
                  >
                    キャンセル
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ミッション一覧 */}
          {missions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              ミッションがありません。上のフォームから作成してください。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {missions.map(m => (
                <Card key={m.id} className={`border-border bg-card p-3 ${!m.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${m.type === 'weekly' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                          {m.type === 'weekly' ? 'W' : 'D'}
                        </span>
                        <p className="text-sm font-medium truncate">{m.title}</p>
                        <span className="font-mono text-xs text-chart-5 shrink-0">+{m.points}pts</span>
                      </div>
                      {m.description && <p className="text-xs text-muted-foreground mt-0.5 ml-6">{m.description}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        onClick={() => {
                          setEditingMissionId(m.id)
                          setMissionForm({
                            title: m.title,
                            description: m.description ?? '',
                            type: m.type,
                            points: String(m.points),
                            startAt: m.startAt ? new Date(m.startAt).toISOString().slice(0, 16) : '',
                            endAt: m.endAt ? new Date(m.endAt).toISOString().slice(0, 16) : '',
                            linkUrl: m.linkUrl ?? '',
                          })
                        }}
                      >
                        <Edit2 className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0"
                        onClick={() => withLoading(async () => {
                          await api(`/admin/missions/${m.id}`, 'PUT', { isActive: !m.isActive })
                          await loadMissions()
                          toast.success(m.isActive ? '無効化しました' : '有効化しました')
                        })}
                      >
                        <History className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => withLoading(async () => {
                          await api(`/admin/missions/${m.id}`, 'DELETE')
                          await loadMissions()
                          toast.success('削除しました')
                        })}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Emergency Auth tab ── */}
        <TabsContent value="emergency" className="flex flex-col gap-4 mt-3">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
            <Lock className="size-3.5 text-destructive shrink-0 mt-0.5" />
            <p className="text-[11px] text-destructive/80">緊急認証はユーザーが通常の認証情報を使えない場合の予備手段です。有効化は慎重に行ってください。</p>
          </div>

          {/* ユーザー選択フォーム */}
          <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Lock className="size-4 text-primary" />
              ユーザー設定
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="ユーザー名で検索"
                value={emergencySearch}
                onChange={e => setEmergencySearch(e.target.value)}
                className="pl-8 min-h-10"
              />
            </div>
            {emergencySearch.trim() && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {users.filter(u => u.displayName.toLowerCase().includes(emergencySearch.toLowerCase())).map(u => (
                  <button
                    key={u.userId}
                    type="button"
                    onClick={async () => {
                      try {
                        const d = await api(`/admin/emergency-auth/${u.userId}`, 'GET')
                        setEmergencyForm({ password: '', passcode: '', passwordEnabled: d.passwordEnabled ?? false, passcodeEnabled: d.passcodeEnabled ?? false })
                        setEmergencyUserId(u.userId)
                        setEmergencySearch('')
                      } catch { toast.error('読み込みエラー') }
                    }}
                    className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 p-2.5 text-left text-sm hover:bg-secondary/60"
                  >
                    <User className="size-3.5 text-muted-foreground shrink-0" />
                    {u.displayName}
                  </button>
                ))}
              </div>
            )}

            {emergencyUserId && (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  対象: {users.find(u => u.userId === emergencyUserId)?.displayName ?? emergencyUserId}
                </p>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>緊急パスワード</span>
                    <button
                      type="button"
                      onClick={() => setEmergencyForm(f => ({ ...f, passwordEnabled: !f.passwordEnabled }))}
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${emergencyForm.passwordEnabled ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-border text-muted-foreground'}`}
                    >
                      {emergencyForm.passwordEnabled ? '有効' : '無効'}
                    </button>
                  </Label>
                  <Input
                    type="password"
                    placeholder="新しい緊急パスワード（空白=変更なし）"
                    value={emergencyForm.password}
                    onChange={e => setEmergencyForm(f => ({ ...f, password: e.target.value }))}
                    className="min-h-10"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>緊急パスコード</span>
                    <button
                      type="button"
                      onClick={() => setEmergencyForm(f => ({ ...f, passcodeEnabled: !f.passcodeEnabled }))}
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${emergencyForm.passcodeEnabled ? 'border-green-500 text-green-600 bg-green-50/20' : 'border-border text-muted-foreground'}`}
                    >
                      {emergencyForm.passcodeEnabled ? '有効' : '無効'}
                    </button>
                  </Label>
                  <Input
                    type="password"
                    placeholder="新しい緊急パスコード（空白=変更なし）"
                    value={emergencyForm.passcode}
                    onChange={e => setEmergencyForm(f => ({ ...f, passcode: e.target.value }))}
                    className="min-h-10"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 min-h-10"
                    onClick={() => { setEmergencyUserId(null); setEmergencyForm({ password: '', passcode: '', passwordEnabled: false, passcodeEnabled: false }) }}
                  >キャンセル</Button>
                  <Button
                    className="flex-1 min-h-10"
                    disabled={emergencySaving}
                    onClick={async () => {
                      setEmergencySaving(true)
                      try {
                        await api(`/admin/emergency-auth/${emergencyUserId}`, 'PUT', {
                          password: emergencyForm.password || undefined,
                          passcode: emergencyForm.passcode || undefined,
                          passwordEnabled: emergencyForm.passwordEnabled,
                          passcodeEnabled: emergencyForm.passcodeEnabled,
                        })
                        toast.success('緊急認証設定を保存しました')
                        setEmergencyForm(f => ({ ...f, password: '', passcode: '' }))
                        const d = await api('/admin/emergency-auth', 'GET')
                        setEmergencyList(Array.isArray(d) ? d : [])
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'エラーが発生しました')
                      } finally { setEmergencySaving(false) }
                    }}
                  >{emergencySaving ? '保存中…' : '保存'}</Button>
                </div>
              </div>
            )}
          </div>

          {/* 緊急認証有効ユーザー一覧 */}
          {emergencyList.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">緊急認証が設定済みのユーザー</p>
              {emergencyList.map(row => (
                <Card key={row.userId} className="border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{row.displayName}</p>
                    <div className="flex gap-1.5">
                      {row.passwordEnabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">PW有効</span>
                      )}
                      {row.passcodeEnabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">PC有効</span>
                      )}
                      {!row.passwordEnabled && !row.passcodeEnabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">無効</span>
                      )}
                    </div>
                  </div>
                  {row.updatedAt && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      更新: {new Date(row.updatedAt).toLocaleString('ja-JP')}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
          {emergencyList.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              緊急認証が設定されたユーザーはいません
            </p>
          )}
        </TabsContent>

        {/* ── Audit tab ── */}
        <TabsContent value="audit" className="flex flex-col gap-3 mt-3">
          {auditLogs.length === 0 ? (
            <Button onClick={loadAuditLog} variant="outline">監査ログを読み込む</Button>
          ) : (
            <div className="flex flex-col gap-2">
              {auditLogs.map(log => (
                <Card key={log.id} className="border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{log.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  {log.targetUserId && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      対象: {users.find(u => u.userId === log.targetUserId)?.displayName ?? log.targetUserId.slice(0, 12) + '…'}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── 売買履歴 tab ── */}
        <TabsContent value="trade" className="flex flex-col gap-3 mt-3">
          {/* ユーザー検索フィルタ + スキャンボタン */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="ユーザー名で絞り込み"
                value={tradeUserFilter}
                onChange={e => setTradeUserFilter(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 pl-8 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* ウォレット登録ユーザーのスキャンボタン一覧 */}
          {users.filter(u => u.solWallet && (!tradeUserFilter || u.displayName.toLowerCase().includes(tradeUserFilter.toLowerCase()))).length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <RefreshCw className="size-3" /> ウォレット登録ユーザーのスキャン
              </p>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                {users
                  .filter(u => u.solWallet && (!tradeUserFilter || u.displayName.toLowerCase().includes(tradeUserFilter.toLowerCase())))
                  .map(u => (
                    <div key={u.userId} className="flex items-center justify-between rounded-md bg-secondary/30 px-2.5 py-1.5">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{u.displayName}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{maskWallet(u.solWallet!)}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={tradeScanning === u.userId}
                        onClick={() => handleAdminScan(u.userId)}
                      >
                        <RefreshCw className={`size-3 ${tradeScanning === u.userId ? 'animate-spin' : ''}`} />
                        スキャン
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 取引一覧 */}
          {tradeLoading ? (
            <p className="text-xs text-center text-muted-foreground py-4">読み込み中…</p>
          ) : tradeRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              売買履歴がありません。ウォレット登録ユーザーをスキャンしてください。
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {tradeRows
                .filter(r => !tradeUserFilter || (users.find(u => u.userId === r.userId)?.displayName ?? '').toLowerCase().includes(tradeUserFilter.toLowerCase()))
                .map(row => {
                  const isBuy = row.type === 'buy'
                  const userName = users.find(u => u.userId === row.userId)?.displayName ?? row.userId.slice(0, 10)
                  return (
                    <Card key={row.id} className="border-border bg-card p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            {isBuy
                              ? <TrendingUp className="size-3.5 text-green-500" />
                              : <TrendingDown className="size-3.5 text-red-500" />}
                            <span className={`text-xs font-semibold ${isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                              {isBuy ? '購入' : '売却'}
                            </span>
                            {row.dex && <span className="text-[10px] px-1 py-0.5 rounded bg-secondary text-muted-foreground">{row.dex}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground">{userName}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(row.tradedAt).toLocaleString('ja-JP')}</span>
                          <a
                            href={`https://solscan.io/tx/${row.txSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary/70 hover:text-primary font-mono"
                          >
                            {row.txSignature.slice(0, 12)}…
                          </a>
                        </div>
                        <span className={`font-mono font-bold text-sm shrink-0 ${isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {isBuy ? '+' : '-'}{formatInmu(row.tokenAmount)}
                        </span>
                      </div>
                    </Card>
                  )
                })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── ユーザー詳細ダイアログ ── */}
      <Dialog open={!!detailUser} onOpenChange={open => { if (!open) setDetailUser(null) }}>
        {detailUser && (
          <UserDetailDialog
            user={detailUser}
            onClose={() => setDetailUser(null)}
          />
        )}
      </Dialog>

      {/* ── パスコード確認ダイアログ ── */}
      <Dialog open={!!confirmOp} onOpenChange={open => { if (!open) { setConfirmOp(null); setPasscodeInput('') } }}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4 text-primary" />
              操作の確認
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{confirmOp?.label}</span> を実行するには管理コードを入力してください。
            </p>
            <Input
              type="password"
              placeholder="管理コードを入力"
              value={passcodeInput}
              onChange={e => setPasscodeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmPasscode() }}
              className="min-h-11 text-base"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 min-h-10"
                onClick={() => { setConfirmOp(null); setPasscodeInput('') }}
              >
                キャンセル
              </Button>
              <Button
                className="flex-1 min-h-10"
                disabled={!passcodeInput || passcodeLoading}
                onClick={handleConfirmPasscode}
              >
                {passcodeLoading ? '確認中…' : '実行'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
