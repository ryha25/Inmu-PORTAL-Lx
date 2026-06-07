'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { updateMyProfile } from '@/app/actions/data'
import { toast } from 'sonner'
import { useState } from 'react'
import { User, Wallet, Coins, TrendingUp, TrendingDown, Award } from 'lucide-react'

export function ProfileView({
  profile,
}: {
  profile: {
    userId: string
    displayName: string | null
    xId: string | null
    discordId: string | null
    discordUsername: string | null
    solWallet: string | null
    avatar: string | null
    balance: string
    savingsBalance: string
    totalReceived: string
    totalSent: string
    monthlyPoints: string
    participationCount: number
    createdAt: string
  }
}) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    displayName: profile.displayName || '',
    xId: profile.xId || '',
    discordId: profile.discordId || '',
    discordUsername: profile.discordUsername || '',
    solWallet: profile.solWallet || '',
    avatar: profile.avatar || '',
  })

  async function handleSave() {
    setLoading(true)
    try {
      await updateMyProfile(form)
      toast.success(t('success'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-primary">
            <Coins className="size-4" />
            <p className="text-xs font-medium text-muted-foreground">{t('current_balance')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums gold-text">{formatInmu(profile.balance)}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-accent">
            <Wallet className="size-4" />
            <p className="text-xs font-medium text-muted-foreground">{t('jar_total')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums">{formatInmu(profile.savingsBalance)}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-chart-5">
            <TrendingUp className="size-4" />
            <p className="text-xs font-medium text-muted-foreground">{t('total_received')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-chart-5">{formatInmu(profile.totalReceived)}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-destructive">
            <TrendingDown className="size-4" />
            <p className="text-xs font-medium text-muted-foreground">{t('total_sent')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-destructive">{formatInmu(profile.totalSent)}</p>
        </Card>
      </div>

      <Card className="border-border bg-card p-4">
        <div className="flex items-center gap-2 text-primary">
          <Award className="size-4" />
          <p className="text-xs font-medium text-muted-foreground">{t('monthly_points')}</p>
        </div>
        <p className="mt-2 font-mono text-xl font-bold tabular-nums">{formatInmu(profile.monthlyPoints)}</p>
      </Card>

      {/* Profile form */}
      <Card className="border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <User className="size-4 text-primary" />
          <h2 className="font-semibold">{t('profile_title')}</h2>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t('displayName')}</Label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="min-h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('x_id')}</Label>
            <Input value={form.xId} onChange={(e) => setForm({ ...form, xId: e.target.value })} className="min-h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('discord_id')}</Label>
            <Input value={form.discordId} onChange={(e) => setForm({ ...form, discordId: e.target.value })} className="min-h-11" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('sol_wallet')}</Label>
            <Input value={form.solWallet} onChange={(e) => setForm({ ...form, solWallet: e.target.value })} className="min-h-11" />
          </div>
          <Button onClick={handleSave} disabled={loading} className="min-h-11">
            {t('save')}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('registered_at')}: {new Date(profile.createdAt).toLocaleDateString('ja-JP')}
        </p>
      </Card>
    </div>
  )
}
