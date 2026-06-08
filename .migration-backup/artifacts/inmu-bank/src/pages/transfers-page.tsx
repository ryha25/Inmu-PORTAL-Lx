import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { TransactionTable, type TxRow } from '@/components/transaction-table'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Send } from 'lucide-react'

export function TransfersPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [rows, setRows] = useState<TxRow[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    fetch('/api/transfers', { credentials: 'include' }).then(r => r.json()).then(setRows)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!recipientId || !amount) return
    setLoading(true)
    try {
      const res = await fetch('/api/transfers', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, amount: Number(amount), memo }) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(t('success'))
      setRecipientId(''); setAmount(''); setMemo('')
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : t('error')) } finally { setLoading(false) }
  }

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_transfers" />
      <div className="flex flex-col gap-4">
        <Card className="border-border bg-card p-4">
          <p className="mb-3 font-semibold text-sm">{t('send_inmu')}</p>
          <form onSubmit={handleSend} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('recipient')} (User ID)</Label>
              <Input value={recipientId} onChange={e => setRecipientId(e.target.value)} required className="min-h-11" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('send_amount')}</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} required min={1} className="min-h-11" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('memo')}</Label>
              <Input value={memo} onChange={e => setMemo(e.target.value)} className="min-h-11" />
            </div>
            <Button type="submit" disabled={loading} className="min-h-11 gap-2"><Send className="size-4" />{t('send')}</Button>
          </form>
        </Card>
        <TransactionTable rows={rows} showTypeFilter={false} filename="inmu-transfers.csv" />
      </div>
    </AppShell>
  )
}
