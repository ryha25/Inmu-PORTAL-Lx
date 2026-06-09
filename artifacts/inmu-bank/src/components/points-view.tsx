import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/context'
import { formatDate } from '@/lib/format'
import { Award, Flame, ChevronDown, ChevronUp, ExternalLink, CheckCircle2 } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

type PointsData = {
  totalPoints: number
  streak: number
  alreadyClaimed: boolean
  history: { id: number; amount: string; type: string; createdAt: string }[]
  leaderboard: { rank: number; userId: string; displayName: string; points: number }[]
}

const CONDITION_LABELS: Record<string, string> = {
  inmu_balance: 'INMU保有',
  login_streak: '連続ログイン',
  login_total:  '累計ログイン',
  buy_daily:    'デイリー購入',
  buy_weekly:   'ウィークリー購入',
  buy_total:    '累計購入',
}

const CONDITION_UNITS: Record<string, string> = {
  inmu_balance: ' INMU',
  login_streak: '日',
  login_total:  '日',
  buy_daily:    ' INMU',
  buy_weekly:   ' INMU',
  buy_total:    ' INMU',
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
  participationStatus: string | null
  conditionType: string | null
  conditionValue: string | null
  conditionMet: boolean | null
  conditionCurrent: number | null
}

export function PointsView({ data, onRefresh }: { data: PointsData; onRefresh: () => void }) {
  const { locale } = useI18n()
  const [dailyOpen, setDailyOpen] = useState(true)
  const [weeklyOpen, setWeeklyOpen] = useState(true)
  const [dailyMissions, setDailyMissions] = useState<Mission[]>([])
  const [weeklyMissions, setWeeklyMissions] = useState<Mission[]>([])
  const [busy, setBusy] = useState<number | null>(null)

  const loadMissions = useCallback(() => {
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

  useEffect(() => { loadMissions() }, [loadMissions])

  async function joinMission(mission: Mission) {
    setBusy(mission.id)
    try {
      const res = await fetch(`/api/missions/${mission.id}/join`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'エラーが発生しました')
      } else {
        toast.success('ミッションに参加しました！')
        loadMissions()
      }
    } catch {
      toast.error('通信エラーが発生しました')
    } finally {
      setBusy(null)
    }
  }

  async function achieveMission(mission: Mission) {
    setBusy(mission.id)
    try {
      const res = await fetch(`/api/missions/${mission.id}/achieve`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'エラーが発生しました')
      } else {
        toast.success('達成しました！報酬を受け取ってください')
        loadMissions()
      }
    } catch {
      toast.error('通信エラーが発生しました')
    } finally {
      setBusy(null)
    }
  }

  async function openLinkAndAchieve(mission: Mission) {
    if (mission.linkUrl) {
      window.open(mission.linkUrl, '_blank', 'noopener,noreferrer')
    }
    await achieveMission(mission)
  }

  async function claimMission(mission: Mission) {
    setBusy(mission.id)
    try {
      const res = await fetch(`/api/missions/${mission.id}/claim`, {
        method: 'POST',
        credentials: 'include',
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.error === 'already_completed') {
          toast.info('このミッションは既に達成済みです')
        } else {
          toast.error(d.error ?? 'エラーが発生しました')
        }
      } else {
        toast.success(`+${d.points} ポイント獲得！`)
        loadMissions()
        onRefresh()
      }
    } catch {
      toast.error('通信エラーが発生しました')
    } finally {
      setBusy(null)
    }
  }

  function ConditionBadge({ conditionType, conditionValue, conditionMet, conditionCurrent }: {
    conditionType: string | null
    conditionValue: string | null
    conditionMet: boolean | null
    conditionCurrent: number | null
  }) {
    if (!conditionType || conditionType === 'none') return null

    if (conditionType === 'link_visit') {
      return (
        <span className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-1.5 py-0.5">
          条件: リンク訪問
        </span>
      )
    }

    const label = CONDITION_LABELS[conditionType]
    const unit = CONDITION_UNITS[conditionType] ?? ''
    if (!label || !conditionValue) return null

    const target = Number(conditionValue)
    const fmtNum = (n: number) => n >= 10000 ? `${(n / 10000).toLocaleString()}万` : n.toLocaleString()

    const met = conditionMet
    const current = conditionCurrent

    return (
      <span className={`inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 ${
        met === true
          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
          : met === false
            ? 'bg-destructive/10 text-destructive'
            : 'bg-secondary/50 text-muted-foreground'
      }`}>
        {met === true ? '✓' : met === false ? '✗' : ''}
        {label}: {current !== null ? `${fmtNum(current)}/` : ''}{fmtNum(target)}{unit}
        {met === true ? ' 達成' : met === false ? ' 未達成' : ''}
      </span>
    )
  }

  function MissionItem({ m }: { m: Mission }) {
    const isBusy = busy === m.id
    const status = m.participationStatus

    return (
      <li className="px-4 py-3">
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
            <div className="mt-1">
              <ConditionBadge
                conditionType={m.conditionType}
                conditionValue={m.conditionValue}
                conditionMet={m.conditionMet}
                conditionCurrent={m.conditionCurrent}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-sm font-bold text-chart-5">+{m.points} pts</span>

            {status === 'rewarded' ? (
              <div className="flex items-center gap-1 rounded-full bg-chart-5/15 px-2 py-1">
                <CheckCircle2 className="size-3 text-chart-5" />
                <span className="text-[10px] font-medium text-chart-5">受取済み</span>
              </div>

            ) : status === 'achieved' ? (
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-chart-5 hover:bg-chart-5/90"
                disabled={isBusy}
                onClick={() => claimMission(m)}
              >
                {isBusy ? '処理中…' : '報酬を受け取る'}
              </Button>

            ) : status === 'joined' ? (
              m.linkUrl ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1"
                  disabled={isBusy}
                  onClick={() => openLinkAndAchieve(m)}
                >
                  {isBusy ? '処理中…' : (
                    <>
                      <ExternalLink className="size-3" />
                      リンクを開く
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={isBusy}
                  onClick={() => achieveMission(m)}
                >
                  {isBusy ? '処理中…' : '達成する'}
                </Button>
              )

            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-xs"
                disabled={isBusy}
                onClick={() => joinMission(m)}
              >
                {isBusy ? '処理中…' : '参加する'}
              </Button>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Award className="size-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">累計ポイント</p>
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
                {dailyMissions.map(m => <MissionItem key={m.id} m={m} />)}
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
                {weeklyMissions.map(m => <MissionItem key={m.id} m={m} />)}
              </ul>
            )
        )}
      </Card>

      {/* ── ポイント履歴 ── */}
      <Card className="border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">ポイント履歴</h2>
        </div>
        {data.history.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">データがありません</p>
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
