import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { AdminShell } from '@/components/admin-shell'
import { AdminPanel } from '@/components/admin-panel'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'

export type UserRow = {
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

export function AdminPage() {
  const { t } = useI18n()
  const [, navigate] = useLocation()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/auth/admin-session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { isAdmin: false })
      .then((d: { isAdmin: boolean }) => {
        setIsAdmin(d.isAdmin)
        if (!d.isAdmin) navigate('/admin-login')
      })
      .catch(() => { setIsAdmin(false); navigate('/admin-login') })
  }, [navigate])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isAdmin) load()
  }, [load, isAdmin])

  async function handleLogout() {
    await fetch('/api/auth/admin-sign-out', { method: 'POST', credentials: 'include' })
    navigate('/admin-login')
  }

  if (isAdmin === null || !isAdmin) {
    return null
  }

  return (
    <AdminShell onLogout={handleLogout}>
      <PageHeader titleKey="nav_admin" />
      {loading
        ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div>
        : <AdminPanel users={users} onRefresh={load} />}
    </AdminShell>
  )
}
