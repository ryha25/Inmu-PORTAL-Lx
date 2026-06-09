import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { toast } from 'sonner'
import { useState } from 'react'
import {
  Search, Download, Shield, User, Trash2,
  CheckSquare, Square, Send, Star, MinusCircle, Coins,
} from 'lucide-react'

type UserRow = {
  userId: string
  displayName: string
  role: string
  balance: string
  savingsBalance: string
  totalReceived: string
  totalSent: string
  participationCount: number
  xId: string | null
  discordId: string | null
  createdAt: string
}

type AuditRow = {
  id: number
  adminId: string
  action: string
  targetUserId: string | null
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

export function AdminPanel({ users, onRefresh }: { users: UserRow[]; onRefresh: () => void }) {
  const { t } = useI18n()

  // Search & selection
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Single user actions
  const [focusUser, setFocusUser] = useState<UserRow | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [txType, setTxType] = useState('deposit')
  const [rewardType, setRewardType] = useState('810day')
  const [loading, setLoading] = useState(false)

  // Bulk action states
  const [bulkAmount, setBulkAmount] = useState('')
  const [bulkReason, setBulkReason] = useState('')
  const [notifTitle, setNotifTitle] = useState('')
  const [notifMsg, setNotifMsg] = useState('')
  const [pointsAmount, setPointsAmount] = useState('')

  // Airdrop all
  const [airdropAmount, setAirdropAmount] = useState('')
  const [airdropMemo, setAirdropMemo] = useState('')

  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([])

  const filtered = users.filter(u =>
    u.displayName.toLowerCase().includes(search.toLowerCase())
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
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(u => u.userId)))
    }
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

      {/* Search */}
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="reset">Reset</TabsTrigger>
        </TabsList>

        {/* ── Users tab ── */}
        <TabsContent value="users" className="flex flex-col gap-3 mt-3">
          {/* Select all */}
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
                focusUser?.userId === u.userId ? 'border-primary/60' : ''
              } ${selected.has(u.userId) ? 'bg-primary/5 border-primary/30' : ''}`}
              onClick={() => {
                setFocusUser(u)
                toggleUser(u.userId)
              }}
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
              <p className="mt-1 text-xs text-muted-foreground pl-7">
                貯蓄: {formatInmu(u.savingsBalance)} · 参加: {u.participationCount}
              </p>
            </Card>
          ))}
        </TabsContent>

        {/* ── Actions tab ── */}
        <TabsContent value="actions" className="flex flex-col gap-4 mt-3">

          {/* Bulk actions (multiple selected) */}
          {selected.size > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-col gap-4">
              <p className="text-sm font-semibold text-primary flex items-center gap-2">
                <CheckSquare className="size-4" />
                {selected.size}名選択中
              </p>

              {/* INMU配布 */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Coins className="size-3" /> INMU配布（選択ユーザー）
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="配布量"
                    value={airdropAmount}
                    onChange={e => setAirdropAmount(e.target.value)}
                    className="min-h-10 flex-1"
                  />
                  <Button
                    onClick={() => withLoading(() =>
                      api('/admin/distribute-airdrop', 'POST', {
                        targetUserIds: selectedIds,
                        amount: Number(airdropAmount),
                        memo: airdropMemo || 'INMU配布',
                      })
                    )}
                    disabled={loading || !airdropAmount}
                    className="min-h-10"
                  >
                    配布
                  </Button>
                </div>
                <Input
                  placeholder="メモ"
                  value={airdropMemo}
                  onChange={e => setAirdropMemo(e.target.value)}
                  className="min-h-10"
                />
              </div>

              {/* ポイント付与 */}
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

              {/* 通知送信 */}
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
                placeholder="理由（共通）"
                value={bulkReason}
                onChange={e => setBulkReason(e.target.value)}
                className="min-h-10"
              />
            </div>
          )}

          {/* Single user actions */}
          {focusUser ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg bg-secondary/50 px-3 py-2">
                <p className="text-sm font-medium">{focusUser.displayName}</p>
                <p className="text-xs text-muted-foreground">残高: {formatInmu(focusUser.balance)}</p>
              </div>

              {/* 残高設定 */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t('change_balance')}</p>
                <Input
                  type="number"
                  placeholder="新しい残高"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="min-h-11"
                />
                <Input
                  placeholder={t('reason')}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="min-h-11"
                />
                <Button
                  onClick={() => withLoading(() =>
                    api('/admin/balance', 'POST', {
                      targetUserId: focusUser.userId,
                      newBalance: Number(amount),
                      reason,
                    })
                  )}
                  disabled={loading}
                  className="min-h-11"
                >
                  {t('apply')}
                </Button>
              </div>

              {/* 残高減算 */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MinusCircle className="size-3 text-destructive" /> 残高減算
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="減算量"
                    value={bulkAmount}
                    onChange={e => setBulkAmount(e.target.value)}
                    className="min-h-11 flex-1"
                  />
                  <Button
                    variant="destructive"
                    onClick={() => withLoading(() =>
                      api('/admin/deduct-balance', 'POST', {
                        targetUserId: focusUser.userId,
                        amount: Number(bulkAmount),
                        reason,
                      })
                    )}
                    disabled={loading || !bulkAmount}
                    className="min-h-11"
                  >
                    減算
                  </Button>
                </div>
              </div>

              {/* 入出金登録 */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t('register_tx')}</p>
                <select
                  value={txType}
                  onChange={e => setTxType(e.target.value)}
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="deposit">入金</option>
                  <option value="withdraw">出金</option>
                  <option value="reward">報酬</option>
                  <option value="airdrop">エアドロップ</option>
                </select>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="min-h-11"
                />
                <Input
                  placeholder={t('memo')}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="min-h-11"
                />
                <Button
                  variant="outline"
                  onClick={() => withLoading(() =>
                    api('/admin/register-tx', 'POST', {
                      targetUserId: focusUser.userId,
                      type: txType,
                      amount: Number(amount),
                      memo: reason,
                    })
                  )}
                  disabled={loading}
                  className="min-h-11"
                >
                  {t('register_tx')}
                </Button>
              </div>

              {/* 報酬配布 */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t('distribute_reward')}</p>
                <select
                  value={rewardType}
                  onChange={e => setRewardType(e.target.value)}
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="810day">810Day</option>
                  <option value="inmuday">INMU Day</option>
                  <option value="campaign">Campaign</option>
                </select>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="min-h-11"
                />
                <Button
                  variant="outline"
                  onClick={() => withLoading(() =>
                    api('/admin/distribute-reward', 'POST', {
                      targetUserId: focusUser.userId,
                      rewardType,
                      amount: Number(amount),
                      memo: reason,
                    })
                  )}
                  disabled={loading}
                  className="min-h-11"
                >
                  {t('distribute_reward')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Usersタブでユーザーをクリックして選択してください
            </p>
          )}

          {/* 全員エアドロップ */}
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">{t('distribute_airdrop')}（全員）</p>
            <Input
              type="number"
              placeholder="配布量/人"
              value={airdropAmount}
              onChange={e => setAirdropAmount(e.target.value)}
              className="min-h-11"
            />
            <Input
              placeholder="Memo"
              value={airdropMemo}
              onChange={e => setAirdropMemo(e.target.value)}
              className="min-h-11"
            />
            <Button
              onClick={() => withLoading(() =>
                api('/admin/distribute-airdrop', 'POST', {
                  targetUserIds: users.map(u => u.userId),
                  amount: Number(airdropAmount),
                  memo: airdropMemo,
                })
              )}
              disabled={loading || !airdropAmount}
              className="min-h-11"
            >
              {t('distribute_airdrop')}
            </Button>
          </div>

          {/* CSV出力 */}
          <Button
            onClick={handleDownloadBackup}
            variant="outline"
            className="min-h-11 gap-2"
            disabled={loading}
          >
            <Download className="size-4" />
            {t('backup')} (CSV)
          </Button>
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

        {/* ── Reset tab ── */}
        <TabsContent value="reset" className="flex flex-col gap-3 mt-3">
          {focusUser ? (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-sm">Reset: {focusUser.displayName}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => withLoading(() =>
                    api('/admin/reset-user', 'POST', { targetUserId: focusUser.userId, resetType: 'balance' })
                  )}
                  disabled={loading}
                  variant="destructive"
                  className="min-h-11 text-xs"
                >
                  {t('reset_balance')}
                </Button>
                <Button
                  onClick={() => withLoading(() =>
                    api('/admin/reset-user', 'POST', { targetUserId: focusUser.userId, resetType: 'history' })
                  )}
                  disabled={loading}
                  variant="destructive"
                  className="min-h-11 text-xs"
                >
                  {t('reset_history')}
                </Button>
                <Button
                  onClick={() => withLoading(() =>
                    api('/admin/reset-user', 'POST', { targetUserId: focusUser.userId, resetType: 'all' })
                  )}
                  disabled={loading}
                  variant="destructive"
                  className="min-h-11 gap-2 col-span-2"
                >
                  <Trash2 className="size-4" />
                  {t('reset_user')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-5 text-center text-sm text-muted-foreground">
              Usersタブでユーザーを選択してください
            </p>
          )}
          <Button
            onClick={() => {
              if (!confirm(t('reset_confirm_desc'))) return
              withLoading(() => api('/admin/reset-all', 'POST'))
            }}
            disabled={loading}
            variant="destructive"
            className="min-h-11"
          >
            {t('reset_all')}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}
