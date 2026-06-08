import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { TransactionTable, type TxRow } from '@/components/transaction-table'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

export function HistoryPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [rows, setRows] = useState<TxRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/transactions', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_history" />
      {loading ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div> : <TransactionTable rows={rows} />}
    </AppShell>
  )
}
