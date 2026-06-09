import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { AdminPanel } from '@/components/admin-panel'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

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

const SESSION_KEY = 'inmu_admin_verified'

export function AdminPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [verified, setVerified] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [code, setCode] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (verified && profile?.role === 'admin') load()
  }, [load, verified, profile])

  useEffect(() => {
    if (verified) return
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [verified])

  if (profile?.role !== 'admin') {
    return (
      <AppShell isAdmin={false} displayName={profile?.displayName ?? ''} unread={unread}>
        <Card className="border-border bg-card p-8 text-center">
          <Shield className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('admin_only')}</p>
        </Card>
      </AppShell>
    )
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!code) return
    setCodeLoading(true)
    try {
      const res = await fetch('/api/admin/verify-code', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        toast.error('管理者コードが正しくありません')
        setCode('')
        return
      }
      sessionStorage.setItem(SESSION_KEY, '1')
      setVerified(true)
    } catch {
      toast.error(t('error'))
    } finally {
      setCodeLoading(false)
    }
  }

  if (!verified) {
    return (
      <AppShell isAdmin displayName={profile.displayName ?? ''} unread={unread}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="border-border bg-card w-full max-w-sm p-6">
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="size-6 text-primary" />
              </div>
              <h2 className="font-semibold text-lg">管理者コードを入力</h2>
              <p className="text-xs text-muted-foreground text-center">
                管理画面にアクセスするには管理者コードが必要です
              </p>
            </div>
            <form onSubmit={handleVerify} className="flex flex-col gap-3">
              <Input
                ref={inputRef}
                type="password"
                placeholder="管理者コード"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="min-h-12 text-center text-2xl tracking-widest font-mono"
                maxLength={20}
              />
              <Button type="submit" disabled={codeLoading || !code} className="min-h-12">
                {codeLoading ? t('loading') : '認証する'}
              </Button>
            </form>
          </Card>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell isAdmin displayName={profile.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_admin" />
      {loading
        ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div>
        : <AdminPanel users={users} onRefresh={load} />}
    </AppShell>
  )
}
