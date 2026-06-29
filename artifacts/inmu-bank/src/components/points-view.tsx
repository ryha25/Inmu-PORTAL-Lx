import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Award, Flame, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, Star, Zap, History, Target, X,
} from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { PET_BY_ID, type PetId } from '@/features/pet/pet-data'
import { initializeAwardedPetAtLevelOne } from '@/features/pet/use-pet-state'

type CharacterRevealData = { characterId: string; characterName: string; points: number }

function CharacterRewardReveal({ reward, onClose }: { reward: CharacterRevealData; onClose: () => void }) {
  const [phase, setPhase] = useState(0)
  const pet = PET_BY_ID[reward.characterId as PetId]
  const characterName = pet?.name ?? getCanonicalCharacterName(reward.characterId, reward.characterName)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timers = [
      window.setTimeout(() => setPhase(1), 850),
      window.setTimeout(() => setPhase(2), 1120),
      window.setTimeout(() => setPhase(3), 2600),
    ]
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      timers.forEach(window.clearTimeout)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  if (!pet) return null

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-[#020106] text-white" role="dialog" aria-modal="true" aria-label={`${characterName}獲得演出`}>
      <style>{`
        @keyframes mission-reveal-stars { from { transform: translateY(18px); opacity:.25 } to { transform:translateY(-42px); opacity:1 } }
        @keyframes mission-reveal-pulse { 0%,100% { transform:scale(.94); opacity:.62 } 50% { transform:scale(1.1); opacity:1 } }
        @keyframes mission-reveal-flash { 0% { opacity:0 } 22% { opacity:1 } 100% { opacity:0 } }
        @keyframes mission-capsule-top { to { transform:translate3d(-12px,-115px,0) rotate(-14deg); opacity:.3 } }
        @keyframes mission-capsule-bottom { to { transform:translate3d(12px,115px,0) rotate(11deg); opacity:.3 } }
        @keyframes mission-character-pop { 0% { opacity:0; transform:translateY(78px) scale(.38); filter:brightness(3) blur(8px) } 62% { opacity:1; transform:translateY(-8px) scale(1.08); filter:brightness(1.35) blur(0) } 100% { opacity:1; transform:translateY(0) scale(1); filter:brightness(1) blur(0) } }
        @keyframes mission-title-in { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(250,204,21,.34),transparent_22%),radial-gradient(circle_at_50%_60%,rgba(126,34,206,.3),transparent_48%),linear-gradient(180deg,#020106,#080313_62%,#020106)]" />
      <div className="absolute inset-0 opacity-60">
        {Array.from({ length: 28 }, (_, index) => (
          <span key={index} className="absolute rounded-full bg-amber-200 shadow-[0_0_10px_rgba(250,204,21,.9)]" style={{
            left: `${(index * 37) % 97}%`, top: `${(index * 53) % 92}%`, width: 2 + index % 4, height: 2 + index % 4,
            animation: `mission-reveal-stars ${2.1 + (index % 5) * .33}s ease-in-out ${(index % 7) * .12}s infinite alternate`,
          }} />
        ))}
      </div>
      <button type="button" onClick={onClose} aria-label="演出を閉じる" className="fixed right-4 top-4 z-50 flex size-11 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white backdrop-blur hover:bg-white/15 active:scale-95">
        <X className="size-5" />
      </button>

      {phase >= 1 && <div className="pointer-events-none absolute inset-0 z-30 bg-[radial-gradient(circle_at_50%_44%,white_0%,#fff7b2_15%,rgba(250,204,21,.75)_34%,transparent_68%)]" style={{ animation: 'mission-reveal-flash 1.15s ease-out both' }} />}

      <div className="relative z-20 flex min-h-[100dvh] flex-col items-center justify-center px-5 py-8">
        <p className="mb-7 font-serif text-sm font-black tracking-[0.28em] text-amber-200 drop-shadow-[0_0_12px_rgba(250,204,21,.8)]">CHARACTER REWARD</p>
        <div className="relative flex h-[390px] w-full max-w-sm items-center justify-center">
          <div className="absolute size-72 rounded-full border border-amber-200/35 shadow-[0_0_80px_rgba(250,204,21,.25)]" style={{ animation: 'mission-reveal-pulse 1.5s ease-in-out infinite' }} />
          {[0, 1, 2].map(index => <div key={index} className="absolute rounded-full border border-amber-300/30" style={{ width: 190 + index * 70, height: 70 + index * 26, transform: `rotate(${index * 22 - 18}deg)` }} />)}

          <div className="absolute size-48">
            <div className="absolute inset-x-0 top-0 h-24 rounded-t-full border-2 border-amber-100/80 bg-[radial-gradient(circle_at_30%_18%,#fffbd1_0%,#ffe169_8%,#e9a817_32%,#8a4300_74%,#2b1000_100%)] shadow-[inset_-18px_-12px_25px_rgba(45,17,0,.55),inset_12px_8px_20px_rgba(255,255,220,.7),0_0_45px_rgba(250,204,21,.75)]" style={phase >= 1 ? { animation: 'mission-capsule-top .75s cubic-bezier(.2,.8,.2,1) forwards' } : undefined}>
              <span className="absolute left-[19%] top-[14%] h-9 w-5 -rotate-45 rounded-full bg-white/75 blur-[1px]" />
            </div>
            <div className="absolute inset-x-0 bottom-0 h-24 rounded-b-full border-2 border-amber-100/75 bg-[radial-gradient(circle_at_34%_4%,#ffd960_0%,#d89309_34%,#6d3100_74%,#230c00_100%)] shadow-[inset_-16px_12px_24px_rgba(35,12,0,.65),inset_10px_-5px_18px_rgba(255,222,104,.42),0_0_45px_rgba(250,204,21,.7)]" style={phase >= 1 ? { animation: 'mission-capsule-bottom .75s cubic-bezier(.2,.8,.2,1) forwards' } : undefined} />
            <div className="absolute inset-x-[-3px] top-1/2 z-10 h-3 -translate-y-1/2 rounded-full border border-yellow-100 bg-gradient-to-b from-yellow-100 via-amber-400 to-amber-800 shadow-[0_0_12px_rgba(255,237,130,.95)]" />
          </div>

          {phase >= 2 && <img src={pet.image} alt={characterName} className="absolute z-20 max-h-[330px] w-[74%] object-contain drop-shadow-[0_0_35px_rgba(250,204,21,.8)] drop-shadow-[0_18px_20px_rgba(0,0,0,.8)]" style={{ animation: 'mission-character-pop 1.05s cubic-bezier(.16,.85,.24,1) both' }} />}
        </div>

        {phase >= 3 && (
          <div className="z-40 w-full max-w-sm text-center" style={{ animation: 'mission-title-in .55s ease-out both' }}>
            <p className="text-xs font-bold tracking-[0.2em] text-fuchsia-200">NEW CHARACTER</p>
            <h2 className="mt-2 text-2xl font-black text-white drop-shadow-[0_0_16px_rgba(217,70,239,.8)]">{characterName}</h2>
            <p className="mt-1 text-sm font-semibold text-fuchsia-100">{characterName}を獲得しました！</p>
            <p className="mt-1 text-sm font-bold text-amber-300">★{pet.rarity} ・ Lv.1</p>
            {reward.points > 0 && <p className="mt-2 text-xs text-cyan-100">同時獲得：{reward.points.toLocaleString()}ポイント</p>}
            <Button type="button" onClick={onClose} className="mt-5 min-h-12 w-full border border-amber-200/50 bg-gradient-to-b from-yellow-300 to-amber-600 font-black text-black shadow-[0_0_28px_rgba(250,204,21,.42)] hover:from-yellow-200 hover:to-amber-500">仲間に迎える</Button>
          </div>
        )}
      </div>
    </div>
  )
}

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

const CHARACTER_REWARD_NAMES: Record<string, string> = {
  nyarushian: 'ニャルシアン',
  takuya: '拓也',
  leon: 'レオン',
  'inmu-festival': 'INMUくん（810祭りVer.）',
}

function getCanonicalCharacterName(characterId: string, fallback?: string | null) {
  return CHARACTER_REWARD_NAMES[characterId] ?? fallback ?? characterId
}

function getCharacterRewardName(mission: Mission) {
  if (!mission.rewardCharacterId) return null
  return getCanonicalCharacterName(mission.rewardCharacterId, mission.rewardCharacterName)
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
  const [characterReveal, setCharacterReveal] = useState<CharacterRevealData | null>(null)

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
        if (d.characterId) {
          initializeAwardedPetAtLevelOne(d.characterId)
          setCharacterReveal({ characterId: d.characterId, characterName: getCanonicalCharacterName(d.characterId, d.characterName), points: Number(d.points ?? 0) })
          window.dispatchEvent(new CustomEvent('inmu-pet-ownership-changed'))
        } else {
          toast.success(`${Number(d.points ?? 0).toLocaleString()}ポイントを獲得しました！`)
        }
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
              {getCharacterRewardName(m) && <span className="rounded bg-fuchsia-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">{getCharacterRewardName(m)}</span>}
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
      {characterReveal && <CharacterRewardReveal reward={characterReveal} onClose={() => {
        setCharacterReveal(null)
        loadMissions()
        onRefresh()
        window.dispatchEvent(new CustomEvent('inmu-pet-ownership-changed'))
      }} />}

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
