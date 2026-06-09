import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n/context'
import { formatDate } from '@/lib/format'
import {
  Award, Flame, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, ShoppingCart, Clock, XCircle, Star, Zap, Lock,
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
}

type PurchaseRequest = {
  id: number
  amount: string
  txHash: string | null
  comment: string | null
  status: string
  rebateAmount: string | null
  rebateRate: string | null
  adminNote: string | null
  rebateTxSignature: string | null
  createdAt: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:  { label: '審査中',   color: 'text-yellow-500' },
  approved: { label: '承認済み', color: 'text-green-500' },
  rejected: { label: '却下',     color: 'text-destructive' },
}

export function PointsView({ data, onRefresh }: { data: PointsData; onRefresh: () => void }) {
  const { locale } = useI18n()
  const [dailyOpen,       setDailyOpen]       = useState(true)
  const [weeklyOpen,      setWeeklyOpen]       = useState(true)
  const [achievementOpen, setAchievementOpen]  = useState(true)
  const [eventOpen,       setEventOpen]        = useState(true)
  const [purchaseOpen,    setPurchaseOpen]     = useState(false)

  const [dailyMissions,       setDailyMissions]       = useState<Mission[]>([])
  const [weeklyMissions,      setWeeklyMissions]       = useState<Mission[]>([])
  const [achievementMissions, setAchievementMissions]  = useState<Mission[]>([])
  const [eventMissions,       setEventMissions]        = useState<Mission[]>([])
  const [busy, setBusy] = useState<number | null>(null)

  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([])
  const [adminLimit,     setAdminLimit]     = useState<number>(1000000)
  const [totalBought,    setTotalBought]    = useState<number>(0)
  const [totalApplied,   setTotalApplied]   = useState<number>(0)
  const [effectiveLimit, setEffectiveLimit] = useState<number>(1000000)
  const [prAmount,  setPrAmount]  = useState('')
  const [prTxHash,  setPrTxHash]  = useState('')
  const [prComment, setPrComment] = useState('')
  const [prBusy,    setPrBusy]    = useState(false)

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

  const loadPurchaseRequests = useCallback(() => {
    fetch('/api/purchase-requests', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setPurchaseRequests(d.requests ?? [])
          setAdminLimit(d.adminLimit ?? 1000000)
          setTotalBought(d.totalBought ?? 0)
          setTotalApplied(d.totalApplied ?? 0)
          setEffectiveLimit(d.effectiveLimit ?? d.adminLimit ?? 1000000)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadMissions() }, [loadMissions])
  useEffect(() => { loadPurchaseRequests() }, [loadPurchaseRequests])

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

  async function achieveMission(mission: Mission) {
    setBusy(mission.id)
    try {
      const res = await fetch(`/api/missions/${mission.id}/achieve`, { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'エラーが発生しました')
      } else {
        toast.success('達成しました！報酬を受け取ってください')
        loadMissions()
      }
    } catch { toast.error('通信エラーが発生しました') }
    finally { setBusy(null) }
  }

  async function openLinkAndAchieve(mission: Mission) {
    if (mission.linkUrl) window.open(mission.linkUrl, '_blank', 'noopener,noreferrer')
    await achieveMission(mission)
  }

  async function claimMission(mission: Mission) {
    setBusy(mission.id)
    try {
      const res = await fetch(`/api/missions/${mission.id}/claim`, { method: 'POST', credentials: 'include' })
      const d = await res.json()
      if (!res.ok) {
        if (d.error === 'already_completed') toast.info('このミッションは既に達成済みです')
        else toast.error(d.error ?? 'エラーが発生しました')
      } else {
        toast.success(`+${d.points} ポイント獲得！`)
        loadMissions()
        onRefresh()
      }
    } catch { toast.error('通信エラーが発生しました') }
    finally { setBusy(null) }
  }

  async function submitPurchaseRequest() {
    const num = Number(prAmount)
    if (!prAmount || isNaN(num) || num <= 0) {
      toast.error('有効な枚数を入力してください')
      return
    }
    setPrBusy(true)
    try {
      const res = await fetch('/api/purchase-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num, txHash: prTxHash || null, comment: prComment || null }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error ?? 'エラーが発生しました')
      } else {
        toast.success('購入申請を送信しました')
        setPrAmount('')
        setPrTxHash('')
        setPrComment('')
        loadPurchaseRequests()
      }
    } catch { toast.error('通信エラーが発生しました') }
    finally { setPrBusy(false) }
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
            <span className="font-mono text-sm font-bold text-chart-5">+{m.points} pts</span>

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
            ) : (
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs"
                disabled={isBusy} onClick={() => joinMission(m)}>
                {isBusy ? '処理中…' : '参加する'}
              </Button>
            )}
          </div>
        </div>
      </li>
    )
  }

  const inputMax = effectiveLimit

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
        <button type="button"
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary/20 transition-colors"
          onClick={() => setDailyOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <Flame className="size-3.5 text-orange-400" />
            <h2 className="text-sm font-semibold">デイリーミッション</h2>
            {dailyMissions.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ({dailyMissions.filter(m => m.participationStatus === 'rewarded').length}/{dailyMissions.length})
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
                ({weeklyMissions.filter(m => m.participationStatus === 'rewarded').length}/{weeklyMissions.length})
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

      {/* ── 購入枚数申請 ── */}
      <Card className="border-border bg-card overflow-hidden">
        <button type="button"
          className="flex w-full items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary/20 transition-colors"
          onClick={() => setPurchaseOpen(o => !o)}>
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">購入枚数申請</h2>
          </div>
          {purchaseOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>

        {purchaseOpen && (
          <div className="flex flex-col gap-4 p-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-primary">新規申請</p>

              {/* 4項目表示 */}
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary/30 p-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">購入済み枚数</p>
                  <p className="font-mono text-sm font-bold">{totalBought.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">申請済み枚数</p>
                  <p className="font-mono text-sm font-bold text-yellow-500">{totalApplied.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">申請可能枚数</p>
                  <p className="font-mono text-sm font-bold text-green-500">{effectiveLimit.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">管理者設定上限</p>
                  <p className="font-mono text-sm font-bold">{adminLimit.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">購入枚数（INMU）*</Label>
                <Input
                  type="number"
                  placeholder={`最大 ${inputMax.toLocaleString()}`}
                  value={prAmount}
                  onChange={e => setPrAmount(e.target.value)}
                  min="1"
                  className="min-h-10"
                />
                {prAmount && Number(prAmount) > effectiveLimit && (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <XCircle className="size-3" />
                    {totalBought > 0 && Number(prAmount) > (totalBought - totalApplied)
                      ? `申請可能枚数を超えています（購入済み ${totalBought.toLocaleString()} − 申請済み ${totalApplied.toLocaleString()} = ${Math.max(0, totalBought - totalApplied).toLocaleString()} INMU）`
                      : `申請上限（${adminLimit.toLocaleString()} INMU）を超えています`}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">取引TxHash（任意）</Label>
                <Input
                  placeholder="Solanaトランザクション署名"
                  value={prTxHash}
                  onChange={e => setPrTxHash(e.target.value)}
                  className="min-h-10 font-mono text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">コメント（任意）</Label>
                <Input
                  placeholder="申請に関するメモ"
                  value={prComment}
                  onChange={e => setPrComment(e.target.value)}
                  className="min-h-10"
                />
              </div>

              <Button
                onClick={submitPurchaseRequest}
                disabled={prBusy || !prAmount || Number(prAmount) <= 0 || Number(prAmount) > effectiveLimit}
                className="min-h-10"
              >
                {prBusy ? '送信中…' : '申請を送信'}
              </Button>
            </div>

            {purchaseRequests.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">申請履歴</p>
                {purchaseRequests.map(pr => {
                  const s = STATUS_LABEL[pr.status] ?? { label: pr.status, color: 'text-muted-foreground' }
                  return (
                    <div key={pr.id} className="rounded-lg border border-border bg-secondary/20 p-3 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-bold">
                          {Number(pr.amount).toLocaleString()} INMU
                        </span>
                        <span className={`text-xs font-medium flex items-center gap-1 ${s.color}`}>
                          {pr.status === 'pending'  && <Clock className="size-3" />}
                          {pr.status === 'approved' && <CheckCircle2 className="size-3" />}
                          {pr.status === 'rejected' && <XCircle className="size-3" />}
                          {s.label}
                        </span>
                      </div>
                      {pr.status === 'approved' && pr.rebateAmount && (
                        <div>
                          <p className="text-xs text-green-600 dark:text-green-400">
                            還元: {Number(pr.rebateAmount).toLocaleString()} INMU
                            {pr.rebateRate && ` (${Number(pr.rebateRate)}%)`}
                          </p>
                          {pr.rebateTxSignature && (
                            <a
                              href={`https://solscan.io/tx/${pr.rebateTxSignature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-primary/70 hover:text-primary font-mono truncate block"
                            >
                              TxSig: {pr.rebateTxSignature.slice(0, 20)}…
                            </a>
                          )}
                        </div>
                      )}
                      {pr.status === 'rejected' && pr.adminNote && (
                        <p className="text-xs text-destructive">理由: {pr.adminNote}</p>
                      )}
                      {pr.comment && <p className="text-xs text-muted-foreground">{pr.comment}</p>}
                      <p className="text-[10px] text-muted-foreground">{formatDate(pr.createdAt, locale)}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {purchaseRequests.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">申請履歴がありません</p>
            )}
          </div>
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
