import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { formatDate } from '@/lib/format'
import { Award, Flame, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useState, useEffect } from 'react'

type PointsData = {
  totalPoints: number
  streak: number
  alreadyClaimed: boolean
  history: { id: number; amount: string; type: string; createdAt: string }[]
  leaderboard: { rank: number; userId: string; displayName: string; points: number }[]
}

type Mission = {
  id: number
  title: string
  description: string | null
  type: string
  points: number
  startAt: string | null
  endAt: string | null
  linkUrl: string | null
  isActive: boolean
}

export function PointsView({ data }: { data: PointsData; onRefresh: () => void }) {
  const { t, locale } = useI18n()
  const [dailyOpen, setDailyOpen] = useState(true)
  const [weeklyOpen, setWeeklyOpen] = useState(true)
  const [dailyMissions, setDailyMissions] = useState<Mission[]>([])
  const [weeklyMissions, setWeeklyMissions] = useState<Mission[]>([])

  useEffect(() => {
    fetch('/api/missions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setDailyMissions(d.daily ?? [])
          setWeeklyMissions(d.weekly ?? [])
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Award className="size-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">{t('points_title')}</p>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums gold-text">{data.totalPoints}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-destructive" />
            <p className="text-xs font-medium text-muted-foreground">Streak</p>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-destructive">{data.streak}日</p>
        </Card>
      </div>

      {/* ── デイリーミッション ── */}
      <Card className="border-border bg-card overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary/20 transition-colors"
          onClick={() => setDailyOpen(o => !o)}
        >
          <h2 className="text-sm font-semibold">▼ デイリーミッション</h2>
          {dailyOpen
            ? <ChevronUp className="size-4 text-muted-foreground" />
            : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        {dailyOpen && (
          dailyMissions.length === 0
            ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">現在ミッションはありません</p>
            : (
              <ul className="divide-y divide-border">
                {dailyMissions.map(m => (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          {m.linkUrl && (
                            <a href={m.linkUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                              <ExternalLink className="size-3 text-primary" />
                            </a>
                          )}
                        </div>
                        {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                      </div>
                      <span className="shrink-0 font-mono text-sm font-bold text-chart-5">+{m.points} pts</span>
                    </div>
                  </li>
                ))}
              </ul>
            )
        )}
      </Card>

      {/* ── ウィークリーミッション ── */}
      <Card className="border-border bg-card overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary/20 transition-colors"
          onClick={() => setWeeklyOpen(o => !o)}
        >
          <h2 className="text-sm font-semibold">▼ ウィークリーミッション</h2>
          {weeklyOpen
            ? <ChevronUp className="size-4 text-muted-foreground" />
            : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        {weeklyOpen && (
          weeklyMissions.length === 0
            ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">現在ミッションはありません</p>
            : (
              <ul className="divide-y divide-border">
                {weeklyMissions.map(m => (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{m.title}</p>
                          {m.linkUrl && (
                            <a href={m.linkUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                              <ExternalLink className="size-3 text-primary" />
                            </a>
                          )}
                        </div>
                        {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                      </div>
                      <span className="shrink-0 font-mono text-sm font-bold text-chart-5">+{m.points} pts</span>
                    </div>
                  </li>
                ))}
              </ul>
            )
        )}
      </Card>

      {/* ── ポイント履歴 ── */}
      <Card className="border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('points_history')}</h2>
        </div>
        {data.history.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.history.slice(0, 20).map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium capitalize">{h.type.replace('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(h.createdAt, locale)}</p>
                </div>
                <span className="font-mono text-sm font-bold text-chart-5">+{h.amount} pts</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
