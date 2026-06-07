'use client'

import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/stat-card'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { Trophy, Award, Gift, Users } from 'lucide-react'

export function CommunityView({
  stats,
}: {
  stats: {
    participations: number
    receiveCount: number
    totalReceivedInmu: number
    rank: number
    totalUsers: number
  }
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          labelKey="total_participations"
          value={stats.participations}
          icon={Award}
          accent="gold"
          isInmu={false}
        />
        <StatCard
          labelKey="total_receives"
          value={stats.receiveCount}
          icon={Gift}
          accent="teal"
          isInmu={false}
        />
        <StatCard
          labelKey="total_received_inmu"
          value={stats.totalReceivedInmu}
          icon={Trophy}
          accent="up"
        />
        <StatCard
          labelKey="your_rank"
          value={stats.rank}
          icon={Users}
          accent="default"
          isInmu={false}
          hint={`${t('rank')} / ${stats.totalUsers}`}
        />
      </div>

      <Card className="border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          {stats.rank <= 10
            ? '🏆 Top 10! すばらしい成績です！'
            : stats.rank <= stats.totalUsers * 0.3
              ? '💪 上位30%に入っています！'
              : '📊 もっとINMUをアクティブになりましょう！'}
        </p>
      </Card>
    </div>
  )
}
