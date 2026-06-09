import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu, maskWallet } from '@/lib/format'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import {
  Search, Download, Shield, User, Trash2,
  CheckSquare, Square, Send, Star, MinusCircle, Coins,
  WalletCards, History, X as XIcon,
} from 'lucide-react'

type UserRow = {
  userId: string
  displayName: string
  role: string
  balance: string
  savingsBalance: string
  totalReceived: string
  totalSent: string
  monthlyPoints: string
  participationCount: number
  xId: string | null
  discordId: string | null
  solWallet: string | null
  createdAt: string
}

type AuditRow = {
  id: number
  adminId: string
  action: string
  targetUserId: string | null
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
  airdrop: 'エアドロ',
}

const TX_INCOME_TYPES = ['deposit', 'receive', 'reward', 'airdrop']

function UserDetailDialog({
  user,
  users,
  onClose,
  onRefresh,
}: {
  user: UserRow
  users: UserRow[]
  onClose: () => void
  onRefresh: () => void
}) {
  const [txs, setTxs] = useState<TxRow[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [txType, setTxType] = useState('deposit')

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

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true)
    try {
      await fn()
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'エラー')
    } finally {
      setLoading(false)
    }
  }

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

        {/* ── 個別操作 ── */}
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground">操作</p>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium">入出金登録</p>
            <select
              value={txType}
              onChange={e => setTxType(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="deposit">入金</option>
              <option value="withdraw">出金</option>
              <option value="reward">報酬</option>
              <option value="airdrop">エアドロップ</option>
            </select>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="金額"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="min-h-10 flex-1"
              />
              <Input
                placeholder="メモ"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="min-h-10 flex-1"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => withLoading(() =>
                api('/admin/register-tx', 'POST', {
                  targetUserId: user.userId,
                  type: txType,
                  amount: Number(amount),
                  memo: reason,
                })
              )}
              disabled={loading || !amount}
              className="min-h-10"
            >
              登録
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => withLoading(() =>
                api('/admin/reset-user', 'POST', { targetUserId: user.userId, resetType: 'balance' })
              )}
              disabled={loading}
              className="flex-1 min-h-9 text-xs"
            >
              残高リセット
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => withLoading(() =>
                api('/admin/reset-user', 'POST', { targetUserId: user.userId, resetType: 'all' })
              )}
              disabled={loading}
              className="flex-1 min-h-9 text-xs"
            >
              全リセット
            </Button>
          </div>
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
  const [bulkDeductAmount, setBulkDeductAmount] = useState('')
  const [bulkReason, setBulkReason] = useState('')
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMsg, setNotifMsg] = useState('')
  const [pointsAmount, setPointsAmount] = useState('')

  const [airdropAllAmount, setAirdropAllAmount] = useState('')
  const [airdropAllMemo, setAirdropAllMemo] = useState('')
  const [pointsAllAmount, setPointsAllAmount] = useState('')
  const [pointsAllReason, setPointsAllReason] = useState('')

  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)

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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
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
                <Coins className="size-3" /> 全員エアドロ（INMU配布）
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
                  onClick={() => withLoading(async () => {
                    const d = await api('/admin/distribute-airdrop-all', 'POST', {
                      amount: Number(airdropAllAmount),
                      memo: airdropAllMemo || 'エアドロップ',
                    }) as { count: number }
                    toast.success(`${d.count}名にエアドロップ配布完了`)
                    setAirdropAllAmount('')
                    setAirdropAllMemo('')
                  })}
                  disabled={loading || !airdropAllAmount}
                  className="min-h-10"
                >
                  配布
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
                <Star className="size-3" /> 全員ポイント付与
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
                  onClick={() => withLoading(async () => {
                    const d = await api('/admin/grant-points-all', 'POST', {
                      amount: Number(pointsAllAmount),
                      reason: pointsAllReason || 'ポイント付与',
                    }) as { count: number }
                    toast.success(`${d.count}名にポイント付与完了`)
                    setPointsAllAmount('')
                    setPointsAllReason('')
                  })}
                  disabled={loading || !pointsAllAmount}
                  className="min-h-10"
                >
                  付与
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
                  <Coins className="size-3" /> INMU配布（選択ユーザー）
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
                    onClick={() => withLoading(() =>
                      api('/admin/distribute-airdrop', 'POST', {
                        targetUserIds: selectedIds,
                        amount: Number(bulkAmount),
                        memo: bulkReason || 'INMU配布',
                      })
                    )}
                    disabled={loading || !bulkAmount}
                    className="min-h-10"
                  >
                    配布
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MinusCircle className="size-3 text-destructive" /> INMU減算（選択ユーザー）
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="減算量"
                    value={bulkDeductAmount}
                    onChange={e => setBulkDeductAmount(e.target.value)}
                    className="min-h-10 flex-1"
                  />
                  <Button
                    variant="destructive"
                    onClick={() => withLoading(async () => {
                      for (const uid of selectedIds) {
                        await api('/admin/deduct-balance', 'POST', {
                          targetUserId: uid,
                          amount: Number(bulkDeductAmount),
                          reason: bulkReason || '管理者による減算',
                        })
                      }
                      toast.success(`${selectedIds.length}名から減算完了`)
                      setBulkDeductAmount('')
                    })}
                    disabled={loading || !bulkDeductAmount}
                    className="min-h-10"
                  >
                    減算
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Star className="size-3" /> ポイント付与（選択ユーザー）
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
                    onClick={() => withLoading(() =>
                      api('/admin/grant-points', 'POST', {
                        targetUserIds: selectedIds,
                        amount: Number(pointsAmount),
                        reason: bulkReason || 'ポイント付与',
                      })
                    )}
                    disabled={loading || !pointsAmount}
                    className="min-h-10"
                  >
                    付与
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
      </Tabs>

      {/* ── ユーザー詳細ダイアログ ── */}
      <Dialog open={!!detailUser} onOpenChange={open => { if (!open) setDetailUser(null) }}>
        {detailUser && (
          <UserDetailDialog
            user={detailUser}
            users={users}
            onClose={() => setDetailUser(null)}
            onRefresh={() => { onRefresh(); setDetailUser(null) }}
          />
        )}
      </Dialog>
    </div>
  )
}
