import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Target, Trash2 } from 'lucide-react'

type Goal = { id: number; name: string; targetAmount: string; currentAmount: string }

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as {error?: string}).error ?? 'Error') }
  return res.json()
}

export function GoalView({ goals, onRefresh }: { goals: Goal[]; onRefresh: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(false)
  const [progressGoal, setProgressGoal] = useState<Goal | null>(null)
  const [progressAmount, setProgressAmount] = useState('')

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true)
    try { await fn(); onRefresh() } catch (e) { toast.error(e instanceof Error ? e.message : t('error')) } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={() => setOpen(true)} className="min-h-11 gap-2"><Plus className="size-4" />{t('create_goal')}</Button>

      {goals.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p> : (
        <div className="grid grid-cols-1 gap-3">
          {goals.map((g) => {
            const targetN = Number(g.targetAmount)
            const current = Number(g.currentAmount)
            const rate = targetN > 0 ? Math.min(100, (current / targetN) * 100) : 0
            return (
              <Card key={g.id} className="border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-primary" />
                    <h3 className="font-semibold">{g.name}</h3>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => withLoading(() => api(`/goals/${g.id}`, 'DELETE'))} className="text-destructive"><Trash2 className="size-3" /></Button>
                </div>
                <div className="mt-3"><Progress value={rate} className="h-2" /></div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{formatInmu(current)} / {formatInmu(targetN)}</span>
                  <span className="font-bold text-primary">{Math.round(rate)}%</span>
                </div>
                <Button size="sm" variant="outline" className="mt-3 min-h-9" onClick={() => setProgressGoal(g)}>{t('add_progress')}</Button>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('create_goal')}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <Input placeholder={t('goal_name')} value={name} onChange={(e) => setName(e.target.value)} className="min-h-11" />
            <Input type="number" placeholder={t('target_amount')} value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-11" />
            <Button onClick={() => withLoading(async () => { await api('/goals', 'POST', { name, targetAmount: Number(target) }); setOpen(false); setName(''); setTarget('') })} disabled={loading} className="min-h-11">{t('create')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!progressGoal} onOpenChange={() => setProgressGoal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('add_progress')}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <Input type="number" placeholder="INMU" value={progressAmount} onChange={(e) => setProgressAmount(e.target.value)} className="min-h-11" />
            <Button onClick={() => withLoading(async () => { await api(`/goals/${progressGoal!.id}/progress`, 'POST', { amount: Number(progressAmount) }); setProgressGoal(null); setProgressAmount('') })} disabled={loading} className="min-h-11">{t('add_progress')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
