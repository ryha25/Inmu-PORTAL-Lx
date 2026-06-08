import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { useState } from 'react'
import { toast } from 'sonner'
import { PiggyBank, Plus, Lock, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Jar = { id: number; name: string; balance: string; isLocked: boolean; lockDays?: number | null; unlockDate?: string | null }

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as {error?: string}).error ?? 'Error') }
  return res.json()
}

export function JarView({ jars, onRefresh }: { jars: Jar[]; onRefresh: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [depositJar, setDepositJar] = useState<Jar | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawJar, setWithdrawJar] = useState<Jar | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true)
    try { await fn(); onRefresh() } catch (e) { toast.error(e instanceof Error ? e.message : t('error')) } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={() => setOpen(true)} className="min-h-11 gap-2"><Plus className="size-4" />{t('create_jar')}</Button>

      {jars.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {jars.map((jar) => (
            <Card key={jar.id} className={cn('border-border bg-card p-4', jar.isLocked && 'border-accent/50')}>
              <div className="flex items-center gap-2">
                <PiggyBank className="size-4 text-primary" />
                <h3 className="font-semibold">{jar.name}</h3>
                {jar.isLocked && <Lock className="size-3 text-accent" />}
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums gold-text">{formatInmu(jar.balance)}</p>
              {jar.isLocked && jar.unlockDate && (
                <p className="mt-1 text-xs text-muted-foreground">{t('lock_until')}: {new Date(jar.unlockDate).toLocaleDateString('ja-JP')}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setDepositJar(jar)} className="min-h-9">{t('deposit_to_jar')}</Button>
                <Button size="sm" variant="outline" onClick={() => setWithdrawJar(jar)} disabled={jar.isLocked} className="min-h-9">{t('withdraw_from_jar')}</Button>
                {!jar.isLocked && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => withLoading(() => api(`/jars/${jar.id}/lock`, 'POST', { days: 30 }))} className="min-h-9 text-xs">{t('lock_days_30')}</Button>
                    <Button size="sm" variant="outline" onClick={() => withLoading(() => api(`/jars/${jar.id}/lock`, 'POST', { days: 90 }))} className="min-h-9 text-xs">{t('lock_days_90')}</Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => withLoading(() => api(`/jars/${jar.id}`, 'DELETE'))} className="min-h-9 text-destructive"><Trash2 className="size-3" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('create_jar')}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <Input placeholder={t('jar_name')} value={name} onChange={(e) => setName(e.target.value)} className="min-h-11" />
            <Button onClick={() => withLoading(async () => { await api('/jars', 'POST', { name }); setOpen(false); setName('') })} disabled={loading} className="min-h-11">{t('create')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!depositJar} onOpenChange={() => setDepositJar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('deposit_to_jar')}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <Input type="number" placeholder="INMU" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="min-h-11" />
            <Button onClick={() => withLoading(async () => { await api(`/jars/${depositJar!.id}/deposit`, 'POST', { amount: Number(depositAmount) }); setDepositJar(null); setDepositAmount('') })} disabled={loading} className="min-h-11">{t('deposit_to_jar')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!withdrawJar} onOpenChange={() => setWithdrawJar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('withdraw_from_jar')}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <Input type="number" placeholder="INMU" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="min-h-11" />
            <Button onClick={() => withLoading(async () => { await api(`/jars/${withdrawJar!.id}/withdraw`, 'POST', { amount: Number(withdrawAmount) }); setWithdrawJar(null); setWithdrawAmount('') })} disabled={loading} className="min-h-11">{t('withdraw_from_jar')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
