'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { adminChangeBalance, adminAddInmu, adminRemoveInmu, adminRegisterTx, adminDistributeReward, adminDistributeAirdrop, adminAdjustPoints, adminResetUser, adminResetAll, adminBackupCsv, adminGetAuditLog, adminSetRole } from '@/app/actions/admin'
import { toast } from 'sonner'
import { useState } from 'react'
import { Search, Download, Shield, User, Coins, Trash2 } from 'lucide-react'

type UserRow = {
  userId: string
  displayName: string | null
  email: string | null
  role: string
  balance: string
  savingsBalance: string
  totalReceived: string
  totalSent: string
  monthlyPoints: string
  participationCount: number
  createdAt: string
}

export function AdminPanel({ users }: { users: UserRow[] }) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const filtered = users.filter((u) =>
    (u.displayName || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleChangeBalance() {
    if (!selectedUser || !amount) return
    setLoading(true)
    try {
      await adminChangeBalance(selectedUser.userId, Number(amount), reason)
      toast.success(t('success'))
      setAmount('')
      setReason('')
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleAddInmu() {
    if (!selectedUser || !amount) return
    setLoading(true)
    try {
      await adminAddInmu(selectedUser.userId, Number(amount), reason || 'Admin addition')
      toast.success(t('success'))
      setAmount('')
      setReason('')
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveInmu() {
    if (!selectedUser || !amount) return
    setLoading(true)
    try {
      await adminRemoveInmu(selectedUser.userId, Number(amount), reason || 'Admin removal')
      toast.success(t('success'))
      setAmount('')
      setReason('')
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleBackup() {
    setLoading(true)
    try {
      const csv = await adminBackupCsv()
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'inmu-users.csv'
      a.click()
      toast.success(t('success'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResetUser() {
    if (!selectedUser) return
    if (!confirm(t('reset_confirm_desc'))) return
    setLoading(true)
    try {
      await adminResetUser(selectedUser.userId)
      toast.success(t('success'))
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleResetAll() {
    if (!confirm(t('reset_confirm_desc'))) return
    setLoading(true)
    try {
      await adminResetAll()
      toast.success(t('success'))
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
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
          onChange={(e) => setSearch(e.target.value)}
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

        <TabsContent value="users" className="flex flex-col gap-3">
          {filtered.map((u) => (
            <Card
              key={u.userId}
              className="border-border bg-card p-3 cursor-pointer hover:bg-secondary/50"
              onClick={() => setSelectedUser(u)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <span className="font-medium">{u.displayName || u.email}</span>
                  {u.role === 'admin' && <Shield className="size-3 text-primary" />}
                </div>
                <span className="font-mono text-sm font-bold">{formatInmu(u.balance)}</span>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="actions" className="flex flex-col gap-3">
          {selectedUser ? (
            <>
              <p className="font-medium">{selectedUser.displayName || selectedUser.email}</p>
              <div className="flex flex-col gap-2">
                <Input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="min-h-11" />
                <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-11" />
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={handleAddInmu} disabled={loading} className="min-h-11">Add INMU</Button>
                  <Button onClick={handleRemoveInmu} disabled={loading} variant="destructive" className="min-h-11">Remove INMU</Button>
                  <Button onClick={handleChangeBalance} disabled={loading} variant="outline" className="min-h-11">Set Balance</Button>
                  <Button onClick={() => setSelectedUser(null)} variant="outline" className="min-h-11">Cancel</Button>
                </div>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Select a user from the Users tab</p>
          )}
          <Button onClick={handleBackup} variant="outline" className="min-h-11 gap-2">
            <Download className="size-4" />
            {t('backup')}
          </Button>
        </TabsContent>

        <TabsContent value="audit" className="flex flex-col gap-3">
          <AuditLogView />
        </TabsContent>

        <TabsContent value="reset" className="flex flex-col gap-3">
          {selectedUser ? (
            <>
              <p className="font-medium">Reset: {selectedUser.displayName || selectedUser.email}</p>
              <Button onClick={handleResetUser} disabled={loading} variant="destructive" className="min-h-11 gap-2">
                <Trash2 className="size-4" />
                {t('reset_user')}
              </Button>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Select a user to reset</p>
          )}
          <Button onClick={handleResetAll} disabled={loading} variant="destructive" className="min-h-11">
            {t('reset_all')}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AuditLogView() {
  const { t } = useI18n()
  const [logs, setLogs] = useState<{
    id: number
    adminId: string
    action: string
    targetUserId: string | null
    details: Record<string, unknown>
    createdAt: Date
  }[]>([])
  const [loaded, setLoaded] = useState(false)

  async function load() {
    try {
      const data = await adminGetAuditLog()
      setLogs(data)
    } catch {
      // ignore
    }
    setLoaded(true)
  }

  if (!loaded) {
    return <Button onClick={load} variant="outline">Load Audit Log</Button>
  }

  if (logs.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No audit entries</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {logs.map((log) => (
        <Card key={log.id} className="border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">{log.action}</span>
            <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('ja-JP')}</span>
          </div>
          {log.targetUserId && (
            <p className="mt-1 text-xs text-muted-foreground">Target: {log.targetUserId}</p>
          )}
        </Card>
      ))}
    </div>
  )
}
