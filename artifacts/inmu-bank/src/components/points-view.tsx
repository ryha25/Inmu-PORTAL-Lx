import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Award, Flame, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, Star, Zap, History, Target,
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

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
  participationStatus: string | null
  conditionType: string | null
  conditionValue: string | null
  conditionMet: boolean | null
  conditionCurrent: number | null
  locked: boolean
  prerequisiteMissionTitle: string | null
  rewardCharacterId: string | null
  rewardCharacterName: string | null
}

const POINT_TYPE_LABEL: Record<string, string> = {
  mission:     'ミッション',
  daily_login: 'ログインボーナス',
  dex_vote:    'DEX投票',
  admin_grant: '管理者付与',
  admin_deduct:'管理者減算',
  streak:      'ストリーク',
}

export function PointsView({ data, onRefresh }: { data: PointsData; onRefresh: () => void }) {
  const [dailyOpen,       setDailyOpen]       = useState(true)
  const [weeklyOpen,      setWeeklyOpen]       = useState(true)
  const [achievementOpen, setAchievementOpen]  = useState(true)
  const [eventOpen,       setEventOpen]        = useState(true)
  const [historyOpen,     setHistoryOpen]      = useState(true)

  const [dailyMissions,       setDailyMissions]       = useState<Mission[]>([])
  const [weeklyMissions,      setWeeklyMissions]       = useState<Mission[]>([])
  const [achievementMissions, setAchievementMissions]  = useState<Mission[]>([])
  const [eventMissions,       setEventMissions]        = useState<Mission[]>([])
  const [busy, setBusy] = useState<number | null>(null)

  const loadMissions = useCallback(() => {
    fetch('/api/missions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setDailyMissions(d.daily ?? [])
          setWeeklyMissions(d.weekly ?? [])
          setAchievementMissions(d.achievement ?? [])
          setEventMissions(d.event ?? [])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadMissions() }, [loadMissions])

  async function joinMission(mission: Mission) {
    setBusy(mission.id)
    try {
      const res = await fetch(`/api/missions/${mission.id}/join`, { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.message ?? d.error ?? 'エラーが発生しました')
      } else {
        toast.success('ミッションに参加しました！')
        loadMissions()
      }
    } catch { toast.error('通信エラーが発生しました') }
    finally { setBusy(null) }
  }

  async function joinAndOpenLinkMission(mission: Mission) {
    if (mission.linkUrl) window.open(mission.linkUrl, '_blank', 'noopener,noreferrer')
    setBusy(mission.id)
    try {
      const joinRes = await fetch(`/api/missions/${mission.id}/join`, { method: 'POST', credentials: 'include' })
      if (!joinRes.ok) {
        const d = await joinRes.json()
        toast.error(d.message ?? d.error ?? 'エラーが発生しました')
        return
      }
      const achRes = await fetch(`/api/missions/${mission.id}/achieve`, { method: 'POST', credentials: 'include' })
      if (!achRes.ok) {
        const d = await achRes.json()
        toast.error(d.error ?? 'エラーが発生しました')
      } else {
        toast.success('達成しました！報酬を受け取ってください')
      }
      loadMissions()
    } catch { toast.error('通信エラーが発生しました') }
    finally { setBusy(null) }
  }

  function updateMissionStatus(missionId: number, status: string | null) {
    const update = (arr: Mission[]) => arr.map(m => m.id === missionId ? { ...m, participationStatus: status } : m)
    setDailyMissions(update)
    setWeeklyMissions(update)
    setAchievementMissions(update)
    setEventMissions(update)
  }

  async function achieveMission(mission: Mission) {
    updateMissionStatus(mission.id, 'achieved')
    setBusy(mission.id)
    try {
      const res = await fetch(`/api/missions/${mission.id}/achieve`, { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'エラーが発生しました')
        updateMissionStatus(mission.id, 'joined')
      } else {
        toast.success('達成しました！報酬を受け取ってください')
        loadMissions()
      }
    } catch {
      toast.error('通信エラーが発生しました')
      updateMissionStatus(mission.id, 'joined')
    }
    finally { setBusy(null) }
  }

  async function openLinkAndAchieve(mission: Mission) {
    if (mission.linkUrl) window.open(mission.linkUrl, '_blank', 'noopener,noreferrer')
    await achieveMission(mission)
  }

  async function achieveMissionDirect(mission: Mission) {
    updateMissionStatus(mission.id, 'achieved')
    setBusy(mission.id)
    try {
      if (!mission.participationStatus) {
        const joinRes = await fetch(`/api/missions/${mission.id}/join`, { method: 'POST', credentials: 'include' })
        if (!joinRes.ok) {
          const d = await joinRes.json()
          toast.error(d.error ?? 'エラーが発生しました')
          updateMissionStatus(mission.id, null)
          return
        }
      }
      const res = await fetch(`/api/missions/${mission.id}/achieve`, { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'エラーが発生しました')
        updateMissionStatus(mission.id, 'joined')
      } else {
        toast.success('達成しました！報酬を受け取ってください')
        loadMissions()
      }
    } catch {
      toast.error('通信エラーが発生しました')
      updateMissionStatus(mission.id, null)
    }
    finally { setBusy(null) }
  }

  async function claimMission(mission: Mission) {
    updateMissionStatus(mission.id, 'rewarded')
    setBusy(mission.id)
    try {
      const res = await fetch(`/api/missions/${mission.id}/claim`, { method: 'POST', credentials: 'include' })
      const d = await res.json()
      if (!res.ok) {
        if (d.error === 'already_completed') toast.info('このミッションは既に達成済みです')
        else if (d.error === 'character_already_owned') toast.info('このキャラクターは既に所持しています')
        else toast.error(d.message ?? d.error ?? 'エラーが発生しました')
        updateMissionStatus(mission.id, 'achieved')
      } else {
        const rewards = [
          d.points > 0 ? `${Number(d.points).toLocaleString()}ポイント` : null,
          d.characterName || null,
        ].filter(Boolean)
        toast.success(`${rewards.join(' + ')}を獲得しました！`)
        if (d.characterId) window.dispatchEvent(new CustomEvent('inmu-pet-ownership-changed'))
        loadMissions()
        onRefresh()
      }
    } catch {
      toast.error('通信エラーが発生しました')
      updateMissionStatus(mission.id, 'achieved')
    }
    finally { setBusy(null) }
  }

  function MissionItem({ m, isAchievement }: { m: Mission; isAchievement?: boolean }) {
    const isBusy = busy === m.id
    const status = m.participationStatus
    const isCompleted = status === 'rewarded'

    return (
      <li className={`px-4 py-3 ${isCompleted && isAchievement ? 'opacity-70' : ''}`}>
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
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {m.points > 0 && <span className="rounded bg-yellow-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-300">{m.points.toLocaleString()} pt</span>}
              {m.rewardCharacterName && <span className="rounded bg-fuchsia-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">{m.rewardCharacterName}</span>}
            </div>
            {m.conditionType && m.conditionType !== 'none' && m.conditionCurrent !== null && m.conditionValue && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                進捗: {Number(m.conditionCurrent).toLocaleString()} / {Number(m.conditionValue).toLocaleString()}
                {m.conditionMet && <span className="text-green-500 ml-1">✓</span>}
              </p>
            )}
            {m.endAt && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                期限: {new Date(m.endAt).toLocaleDateString('ja-JP')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {status === 'rewarded' ? (
              <div className="flex items-center gap-1 rounded-full bg-chart-5/15 px-2 py-1">
                <CheckCircle2 className="size-3 text-chart-5" />
                <span className="text-[10px] font-medium text-chart-5">
                  {isAchievement ? '達成済み' : '受取済み'}
                </span>
              </div>
            ) : status === 'achieved' ? (
              <Button size="sm" className="h-7 px-2 text-xs bg-chart-5 hover:bg-chart-5/90"
                disabled={isBusy} onClick={() => claimMission(m)}>
                {isBusy ? '処理中…' : '報酬を受け取る'}
              </Button>
            ) : status === 'joined' ? (
              m.linkUrl ? (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                  disabled={isBusy} onClick={() => openLinkAndAchieve(m)}>
                  {isBusy ? '処理中…' : <><ExternalLink className="size-3" />リンクを開く</>}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                  disabled={isBusy || (m.conditionType && m.conditionType !== 'none' && m.conditionType !== 'link_visit' ? !m.conditionMet : false)}
                  onClick={() => achieveMission(m)}>
                  {isBusy ? '処理中…' : '達成する'}
                </Button>
              )
            ) : m.conditionType === 'link_visit' ? (
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs"
                disabled={isBusy} onClick={() => joinAndOpenLinkMission(m)}>
                {isBusy ? '処理中…' : '参加する'}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                disabled={isBusy || (m.conditionType && m.conditionType !== 'none' ? !m.conditionMet : false)}
                onClick={() => achieveMissionDirect(m)}>
                {isBusy ? '処理中…' : '達成する'}
              </Button>
            )}
          </div>
        </div>
      </li>
    )
  }

  const dailyDone   = dailyMissions.filter(m => m.participationStatus === 'rewarded').length
  const weeklyDone  = weeklyMissions.filter(m => m.participationStatus === 'rewarded').length

  return (
    <div className="flex flex-col gap-4">

      {/* ── 上部統計 ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-orange-400/30 bg-orange-400/10 p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Flame className="size-3.5 text-orange-400" />
            <p className="text-xs font-semibold text-orange-400">デイリー達成</p>
          </div>
          <p className="font-mono text-xl font-bold">
            {dailyDone}
            <span className="text-sm font-normal text-muted-foreground">/{dailyMissions.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-blue-400/30 bg-blue-400/10 p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Target className="size-3.5 text-blue-400" />
            <p className="text-xs font-semibold text-blue-400">ウィークリー達成</p>
          </div>
          <p className="font-mono text-xl font-bold">
            {weeklyDone}
            <span className="text-sm font-normal text-muted-foreground">/{weeklyMissions.length}</span>
          </p>
        </div>
      </div>

      {/* ── デイリーミッション ── */}
      <Card className="border-border bg-card overflow-hidden">
        <button type="button"
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary/20 transition-colors"
          onClick={() => setDailyOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <Flame className="size-3.5 text-orange-400" />
            <h2 className="text-sm font-semibold">デイリーミッション</h2>
            {dailyMissions.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ({dailyDone}/{dailyMissions.length})
              </span>
            )}
          </div>
          {dailyOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        {dailyOpen && (
          dailyMissions.length === 0
            ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">現在ミッションはありません</p>
            : <ul className="divide-y divide-border">{dailyMissions.map(m => <MissionItem key={m.id} m={m} />)}</ul>
        )}
      </Card>

      {/* ── ウィークリーミッション ── */}
      <Card className="border-border bg-card overflow-hidden">
        <button type="button"
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary/20 transition-colors"
          onClick={() => setWeeklyOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <Star className="size-3.5 text-blue-400" />
            <h2 className="text-sm font-semibold">ウィークリーミッション</h2>
            {weeklyMissions.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ({weeklyDone}/{weeklyMissions.length})
              </span>
            )}
          </div>
          {weeklyOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        {weeklyOpen && (
          weeklyMissions.length === 0
            ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">現在ミッションはありません</p>
            : <ul className="divide-y divide-border">{weeklyMissions.map(m => <MissionItem key={m.id} m={m} />)}</ul>
        )}
      </Card>

      {/* ── アチーブメント ── */}
      <Card className="border-border bg-card overflow-hidden">
        <button type="button"
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary/20 transition-colors"
          onClick={() => setAchievementOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <Award className="size-3.5 text-chart-5" />
            <h2 className="text-sm font-semibold">アチーブメント</h2>
            {achievementMissions.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ({achievementMissions.filter(m => m.participationStatus === 'rewarded').length}/{achievementMissions.length})
              </span>
            )}
          </div>
          {achievementOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        {achievementOpen && (
          achievementMissions.length === 0
            ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">現在アチーブメントはありません</p>
            : <ul className="divide-y divide-border">{achievementMissions.map(m => <MissionItem key={m.id} m={m} isAchievement />)}</ul>
        )}
      </Card>

      {/* ── イベントミッション ── */}
      {eventMissions.length > 0 && (
        <Card className="border border-primary/40 bg-primary/5 overflow-hidden">
          <button type="button"
            className="flex w-full items-center justify-between px-4 py-3 border-b border-primary/20 hover:bg-primary/10 transition-colors"
            onClick={() => setEventOpen(o => !o)}>
            <div className="flex items-center gap-2">
              <Zap className="size-3.5 text-primary" />
              <h2 className="text-sm font-semibold text-primary">イベントミッション</h2>
              <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">LIMITED</span>
            </div>
            {eventOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </button>
          {eventOpen && (
            <ul className="divide-y divide-primary/10">{eventMissions.map(m => <MissionItem key={m.id} m={m} />)}</ul>
          )}
        </Card>
      )}

      {/* ── ポイント履歴 ── */}
      <Card className="border-border bg-card overflow-hidden">
        <button type="button"
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary/20 transition-colors"
          onClick={() => setHistoryOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <History className="size-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">ポイント履歴</h2>
            {data.totalPoints > 0 && (
              <span className="font-mono text-xs text-chart-5">{data.totalPoints.toLocaleString()} pt 累計</span>
            )}
          </div>
          {historyOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        {historyOpen && (
          data.history.length === 0
            ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">ポイント履歴がありません</p>
            : (
              <ul className="divide-y divide-border">
                {data.history.map(h => {
                  const isPlus = Number(h.amount) >= 0
                  return (
                    <li key={h.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <p className="text-xs font-medium">{POINT_TYPE_LABEL[h.type] ?? h.type}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(h.createdAt).toLocaleString('ja-JP')}
                        </p>
                      </div>
                      <span className={`font-mono text-sm font-bold shrink-0 ${isPlus ? 'text-chart-5' : 'text-destructive'}`}>
                        {isPlus ? '+' : ''}{Number(h.amount).toLocaleString()} pt
                      </span>
                    </li>
                  )
                })}
              </ul>
            )
        )}
      </Card>
    </div>
  )
}
