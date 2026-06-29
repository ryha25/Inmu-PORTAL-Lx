import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { PET_DEFINITIONS } from '@/features/pet/pet-data'
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronRight,
  RotateCcw, Archive, Link2, ArrowUp, ArrowDown,
  GripVertical, Save, FileText,
} from 'lucide-react'

/* ── Types ── */
type MissionStatus = 'active' | 'inactive' | 'draft'
type MissionRow = {
  id: number
  title: string
  description: string | null
  type: string
  points: number
  startAt: string | null
  endAt: string | null
  linkUrl: string | null
  isActive: boolean
  status: MissionStatus
  createdAt: string
  conditionType: string | null
  conditionValue: string | null
  prerequisiteMissionId: number | null
  displayOrder: number
  rewardCharacterId: string | null
  rewardCharacterName: string | null
}
type StageForm = { title: string; description: string; points: string; conditionValue: string }
type MissionForm = {
  title: string; description: string; type: string; points: string
  rewardCharacterId: string
  startAt: string; endAt: string; linkUrl: string
  conditionType: string; conditionValue: string
}

/* ── Constants ── */
const CONDITION_TYPE_OPTIONS = [
  { value: 'none',                     label: '条件なし' },
  { value: 'link_visit',               label: 'リンク訪問' },
  { value: 'follow_x',                 label: 'Xフォローする' },
  { value: 'join_discord',             label: 'Discordに参加する' },
  { value: 'inmu_balance',             label: '累計INMU保有枚数' },
  { value: 'login_streak',             label: '連続ログイン日数' },
  { value: 'login_total',              label: '累計ログイン日数' },
  { value: 'buy_daily',                label: 'デイリー購入枚数' },
  { value: 'buy_weekly',               label: 'ウィークリー購入枚数' },
  { value: 'buy_total',                label: '累計購入枚数' },
  { value: 'daily_clears_today',       label: '当日デイリークリア数' },
  { value: 'daily_weekly_count',       label: 'デイリーミッション週間クリア数' },
  { value: 'dex_vote_weekly',          label: 'dexScanner週間投票数' },
  { value: 'login_weekly',             label: '週間ログイン日数' },
  { value: 'weekly_clears_weekly',     label: '週間ウィークリーミッション達成数' },
  { value: 'monthly_points',           label: '累計ポイント保有数' },
  { value: 'total_clears',             label: '累計ミッションクリア回数' },
  { value: 'daily_clears_total',       label: 'デイリーミッションクリア累計' },
  { value: 'weekly_clears_total',      label: 'ウィークリーミッションクリア累計' },
  { value: 'achievement_clears_total', label: 'アチーブメント達成数' },
]
const NO_VALUE_COND = new Set(['none', 'link_visit', 'follow_x', 'join_discord'])
const TYPE_CATEGORIES = [
  { value: 'daily',       label: 'デイリーミッション',    color: 'bg-green-500/20 text-green-400' },
  { value: 'weekly',      label: 'ウィークリーミッション', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'event',       label: 'イベントミッション',    color: 'bg-purple-500/20 text-purple-400' },
  { value: 'achievement', label: 'アチーブメント',        color: 'bg-yellow-500/20 text-yellow-400' },
]
const BLANK_FORM: MissionForm = { title: '', description: '', type: 'daily', points: '', rewardCharacterId: '', startAt: '', endAt: '', linkUrl: '', conditionType: 'none', conditionValue: '' }
const BLANK_STAGE: StageForm = { title: '', description: '', points: '', conditionValue: '' }
const PET_REWARD_OPTIONS = PET_DEFINITIONS.map(pet => ({ value: pet.id, label: pet.name }))

/* ── Chain helpers ── */
function buildChains(missions: MissionRow[]): Map<number, MissionRow[]> {
  const childIds = new Set(missions.filter(m => m.prerequisiteMissionId !== null).map(m => m.prerequisiteMissionId!))
  const result = new Map<number, MissionRow[]>()
  for (const m of missions) {
    if (childIds.has(m.id) && m.prerequisiteMissionId === null) {
      const chain: MissionRow[] = []
      let cur: MissionRow | undefined = m
      while (cur) {
        chain.push(cur)
        cur = missions.find(x => x.prerequisiteMissionId === cur!.id)
      }
      result.set(m.id, chain)
    }
  }
  return result
}

/* ── Status badge ── */
function StatusBadge({ status }: { status: MissionStatus }) {
  const cfg = {
    active:   { label: 'Active',   cls: 'bg-green-500/20 text-green-400' },
    draft:    { label: 'Draft',    cls: 'bg-amber-500/20 text-amber-400' },
    inactive: { label: 'Inactive', cls: 'bg-red-500/20 text-red-400' },
  }[status]
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${cfg.cls}`}>{cfg.label}</span>
}

/* ── Type badge ── */
function TypeBadge({ type }: { type: string }) {
  const cat = TYPE_CATEGORIES.find(c => c.value === type)
  const label = type === 'daily' ? 'D' : type === 'weekly' ? 'W' : type === 'achievement' ? 'A' : type === 'event' ? 'E' : type[0].toUpperCase()
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${cat?.color ?? 'bg-muted text-muted-foreground'}`}>{label}</span>
}

/* ── Condition label helper ── */
function condLabel(ct: string | null): string {
  if (!ct || ct === 'none') return ''
  return CONDITION_TYPE_OPTIONS.find(o => o.value === ct)?.label ?? ct
}

/* ── Select element ── */
const SELECT_CLS = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring'

/* ════════════════════════════════════════════════
   AdminMissionManager
   ════════════════════════════════════════════════ */
type ApiFunc = (path: string, method: string, body?: unknown) => Promise<unknown>

export function AdminMissionManager({ api }: { api: ApiFunc }) {
  const [all, setAll] = useState<MissionRow[]>([])
  const [loading, setLoading] = useState(false)

  /* Creation / single-edit form */
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<MissionForm>(BLANK_FORM)
  const [formStatus, setFormStatus] = useState<MissionStatus>('active')
  const [editId, setEditId] = useState<number | null>(null)

  /* Chain creation */
  const [chainMode, setChainMode] = useState(false)
  const [chainStages, setChainStages] = useState<StageForm[]>([{ ...BLANK_STAGE }, { ...BLANK_STAGE }])

  /* Chain group edit */
  const [editChainRootId, setEditChainRootId] = useState<number | null>(null)
  const [editChainMeta, setEditChainMeta] = useState({ type: 'daily', conditionType: 'none', linkUrl: '', startAt: '', endAt: '', status: 'active' as MissionStatus })
  const [editChainStages, setEditChainStages] = useState<(StageForm & { id: number; disabled: boolean })[]>([])

  /* Section expand/collapse */
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['daily']))
  const [openChains, setOpenChains] = useState<Set<number>>(new Set())

  const toggleSection = (k: string) => setOpenSections(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleChain = (id: number) => setOpenChains(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  /* ── Load ── */
  const loadMissions = useCallback(async () => {
    try {
      const data = await api('/admin/missions', 'GET') as MissionRow[]
      setAll(Array.isArray(data) ? data : [])
    } catch { toast.error('ミッションの読み込みに失敗しました') }
  }, [api])

  useEffect(() => { loadMissions() }, [loadMissions])

  /* ── Computed ── */
  const activeMissions  = all.filter(m => m.status === 'active')
  const draftMissions   = all.filter(m => m.status === 'draft')
  const inactiveMissions = all.filter(m => m.status === 'inactive')

  const chainMap = buildChains(all)
  const allChainIds = new Set<number>()
  chainMap.forEach(chain => chain.forEach(m => allChainIds.add(m.id)))

  /* ── Helpers ── */
  function resetForm() {
    setForm(BLANK_FORM); setFormStatus('active'); setEditId(null)
    setChainMode(false); setChainStages([{ ...BLANK_STAGE }, { ...BLANK_STAGE }])
    setEditChainRootId(null)
    setFormOpen(false)
  }

  function startEditMission(m: MissionRow) {
    setEditChainRootId(null)
    setChainMode(false)
    setEditId(m.id)
    setForm({
      title: m.title,
      description: m.description ?? '',
      type: m.type,
      points: String(m.points),
      rewardCharacterId: m.rewardCharacterId ?? '',
      startAt: m.startAt ? new Date(m.startAt).toISOString().slice(0, 16) : '',
      endAt: m.endAt ? new Date(m.endAt).toISOString().slice(0, 16) : '',
      linkUrl: m.linkUrl ?? '',
      conditionType: m.conditionType ?? 'none',
      conditionValue: m.conditionValue ?? '',
    })
    setFormStatus(m.status)
    setFormOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startEditChain(rootId: number) {
    const chain = chainMap.get(rootId) ?? []
    if (!chain.length) return
    const root = chain[0]
    setEditId(null)
    setChainMode(false)
    setEditChainRootId(rootId)
    setEditChainMeta({
      type: root.type,
      conditionType: root.conditionType ?? 'none',
      linkUrl: root.linkUrl ?? '',
      startAt: root.startAt ? new Date(root.startAt).toISOString().slice(0, 16) : '',
      endAt: root.endAt ? new Date(root.endAt).toISOString().slice(0, 16) : '',
      status: root.status,
    })
    setEditChainStages(chain.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description ?? '',
      points: String(m.points),
      conditionValue: m.conditionValue ?? '',
      disabled: m.status === 'inactive',
    })))
    setFormOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ── Save single mission ── */
  async function saveMission() {
    if (!form.title.trim()) { toast.error('タイトルが必要です'); return }
    const condTypeVal = form.conditionType === 'none' ? null : form.conditionType
    const condVal = condTypeVal && !NO_VALUE_COND.has(condTypeVal) && form.conditionValue ? Number(form.conditionValue) : null
    const payload = {
      title: form.title, description: form.description, type: form.type,
      points: Number(form.points) || 0,
      rewardCharacterId: form.rewardCharacterId || null,
      startAt: form.startAt || null, endAt: form.endAt || null,
      linkUrl: form.linkUrl || null,
      conditionType: condTypeVal, conditionValue: condVal,
      status: formStatus,
    }
    setLoading(true)
    try {
      if (editId !== null) {
        await api(`/admin/missions/${editId}`, 'PUT', payload)
        toast.success('ミッションを更新しました')
      } else {
        await api('/admin/missions', 'POST', payload)
        toast.success('ミッションを作成しました')
      }
      resetForm()
      await loadMissions()
    } catch (e) { toast.error(e instanceof Error ? e.message : '保存に失敗しました') }
    finally { setLoading(false) }
  }

  /* ── Save chain (new) ── */
  async function saveChain() {
    if (chainStages.some(s => !s.title.trim())) { toast.error('各ステージにタイトルが必要です'); return }
    const condTypeVal = form.conditionType === 'none' ? null : form.conditionType
    setLoading(true)
    try {
      await api('/admin/missions/chain', 'POST', {
        type: form.type,
        conditionType: condTypeVal,
        linkUrl: form.linkUrl || null,
        startAt: form.startAt || null,
        endAt: form.endAt || null,
        status: formStatus,
        stages: chainStages.map(s => ({
          title: s.title.trim(),
          description: s.description.trim() || null,
          points: Number(s.points) || 0,
          conditionValue: (condTypeVal && !NO_VALUE_COND.has(condTypeVal) && s.conditionValue) ? Number(s.conditionValue) : null,
        })),
      })
      toast.success(`${chainStages.length}ステージのチェーンを作成しました`)
      resetForm()
      await loadMissions()
    } catch (e) { toast.error(e instanceof Error ? e.message : '作成に失敗しました') }
    finally { setLoading(false) }
  }

  /* ── Save chain edit ── */
  async function saveChainEdit() {
    if (editChainStages.some(s => !s.title.trim())) { toast.error('全ステージのタイトルが必要です'); return }
    const condTypeVal = editChainMeta.conditionType === 'none' ? null : editChainMeta.conditionType
    setLoading(true)
    try {
      await api('/admin/missions/chain-update', 'PUT', {
        rootId: editChainRootId,
        type: editChainMeta.type,
        conditionType: condTypeVal,
        linkUrl: editChainMeta.linkUrl || null,
        startAt: editChainMeta.startAt || null,
        endAt: editChainMeta.endAt || null,
        status: editChainMeta.status,
        stages: editChainStages.map(s => ({
          ...(s.id > 0 ? { id: s.id } : {}),
          title: s.title.trim(),
          description: s.description.trim() || null,
          points: Number(s.points) || 0,
          conditionValue: (condTypeVal && !NO_VALUE_COND.has(condTypeVal) && s.conditionValue) ? Number(s.conditionValue) : null,
          stageStatus: s.disabled ? 'inactive' : editChainMeta.status,
        })),
      })
      toast.success('チェーンを更新しました')
      resetForm()
      await loadMissions()
    } catch (e) { toast.error(e instanceof Error ? e.message : '更新に失敗しました') }
    finally { setLoading(false) }
  }

  /* ── Status change helpers ── */
  async function setMissionStatus(id: number, status: MissionStatus) {
    try {
      await api(`/admin/missions/${id}`, 'PUT', { status })
      await loadMissions()
      toast.success(status === 'active' ? '有効化しました' : status === 'inactive' ? '無効化しました' : '下書きに変更しました')
    } catch { toast.error('更新に失敗しました') }
  }

  async function setChainStatus(rootId: number, status: MissionStatus) {
    const chain = chainMap.get(rootId) ?? []
    if (!chain.length) return
    try {
      await api('/admin/missions/chain-update', 'PUT', {
        rootId,
        status,
        stages: chain.map(m => ({ id: m.id, title: m.title })),
      })
      await loadMissions()
      toast.success(status === 'active' ? 'チェーンを有効化しました' : 'チェーンを無効化しました')
    } catch { toast.error('更新に失敗しました') }
  }

  async function restoreMission(id: number) {
    try {
      await api(`/admin/missions/${id}`, 'PUT', { status: 'active' })
      await loadMissions()
      toast.success('復活しました')
    } catch { toast.error('復活に失敗しました') }
  }

  async function permanentDelete(id: number) {
    if (!confirm('このミッションを完全削除しますか？この操作は取り消せません。')) return
    try {
      await api(`/admin/missions/${id}/permanent`, 'DELETE')
      await loadMissions()
      toast.success('完全削除しました')
    } catch { toast.error('削除に失敗しました') }
  }

  async function softDelete(id: number) {
    try {
      await api(`/admin/missions/${id}`, 'DELETE')
      await loadMissions()
      toast.success('無効化しました')
    } catch { toast.error('無効化に失敗しました') }
  }

  /* ── Chain stage reorder / disable helpers ── */
  function moveStageUp(i: number) {
    if (i <= 0) return
    setEditChainStages(p => { const a = [...p]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a })
  }
  function moveStageDown(i: number) {
    setEditChainStages(p => {
      if (i >= p.length - 1) return p
      const a = [...p]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a
    })
  }
  function toggleStageDisabled(i: number) {
    setEditChainStages(p => p.map((s, idx) => idx === i ? { ...s, disabled: !s.disabled } : s))
  }
  function addStageToChain() {
    setEditChainStages(p => [...p, { id: 0, title: '', description: '', points: '', conditionValue: '', disabled: false }])
  }

  /* ────────────────────────────────────────────────
     Render helpers
     ──────────────────────────────────────────────── */

  /* Single mission card */
  function MissionCard({ m, showRestore = false }: { m: MissionRow; showRestore?: boolean }) {
    const ct = condLabel(m.conditionType)
    return (
      <Card className={`border-border bg-card p-3 ${m.status === 'inactive' ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TypeBadge type={m.type} />
              <StatusBadge status={m.status} />
              <p className="text-sm font-medium truncate flex-1">{m.title}</p>
              {m.points > 0 && <span className="font-mono text-xs text-chart-5 shrink-0">+{m.points}pts</span>}
            </div>
            {m.description && <p className="text-xs text-muted-foreground mt-0.5 ml-0.5">{m.description}</p>}
            <div className="mt-1 flex flex-wrap gap-1.5">
              {m.rewardCharacterName && <span className="rounded bg-fuchsia-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">キャラ: {m.rewardCharacterName}</span>}
            </div>
            {ct && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                条件: {ct}{m.conditionValue && m.conditionType !== 'link_visit' ? ` — ${Number(m.conditionValue).toLocaleString()}` : ''}
              </p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => startEditMission(m)} title="編集">
              <Edit2 className="size-3" />
            </Button>
            {showRestore ? (
              <>
                <Button size="sm" variant="ghost" className="size-8 p-0 text-green-500 hover:text-green-400" onClick={() => restoreMission(m.id)} title="復活">
                  <RotateCcw className="size-3" />
                </Button>
                <Button size="sm" variant="ghost" className="size-8 p-0 text-destructive hover:text-destructive" onClick={() => permanentDelete(m.id)} title="完全削除">
                  <Trash2 className="size-3" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => softDelete(m.id)} title="無効化">
                <Archive className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    )
  }

  /* Chain group accordion */
  function ChainGroup({ rootId }: { rootId: number }) {
    const chain = chainMap.get(rootId)
    if (!chain || !chain.length) return null
    const root = chain[0]
    const isOpen = openChains.has(rootId)
    const ct = condLabel(root.conditionType)

    return (
      <div className="rounded-lg border border-primary/20 bg-primary/3 overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-primary/5 transition-colors text-left"
          onClick={() => toggleChain(rootId)}
        >
          {isOpen ? <ChevronDown className="size-3.5 text-primary shrink-0" /> : <ChevronRight className="size-3.5 text-primary shrink-0" />}
          <Link2 className="size-3 text-primary shrink-0" />
          <span className="text-sm font-medium flex-1 truncate">{root.title} 〜 {chain[chain.length - 1].title}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{chain.length}段階</span>
          <StatusBadge status={root.status} />
        </button>

        {isOpen && (
          <div className="border-t border-primary/10 px-3 pb-3 pt-2 flex flex-col gap-2">
            {ct && <p className="text-[10px] text-muted-foreground">条件: {ct}</p>}
            <div className="flex flex-col gap-1.5">
              {chain.map((m, i) => (
                <div key={m.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                  <span className="text-[10px] font-bold text-primary w-6 shrink-0">Lv{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{m.title}</p>
                    {m.conditionValue && m.conditionType !== 'link_visit' && (
                      <p className="text-[10px] text-muted-foreground">{Number(m.conditionValue).toLocaleString()}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-chart-5 shrink-0">+{m.points}pts</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap pt-1">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => startEditChain(rootId)}>
                <Edit2 className="size-3" />グループ編集
              </Button>
              {root.status === 'active' ? (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 text-muted-foreground" onClick={() => setChainStatus(rootId, 'inactive')}>
                  <Archive className="size-3" />無効化
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 text-green-500" onClick={() => setChainStatus(rootId, 'active')}>
                  <RotateCcw className="size-3" />有効化
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* Type section accordion */
  function TypeSection({ cat }: { cat: typeof TYPE_CATEGORIES[0] }) {
    const standalone = activeMissions.filter(m => m.type === cat.value && !allChainIds.has(m.id))
    const count = standalone.length
    const isOpen = openSections.has(cat.value)
    if (count === 0) return null
    return (
      <div className="rounded-lg border border-border bg-secondary/10 overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors"
          onClick={() => toggleSection(cat.value)}
        >
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cat.color}`}>{cat.value[0].toUpperCase()}</span>
            <span className="text-sm font-semibold">{cat.label}</span>
            <span className="text-xs text-muted-foreground">({count}件)</span>
          </div>
          {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        </button>
        {isOpen && (
          <div className="border-t border-border px-3 pb-3 pt-2 flex flex-col gap-2">
            {standalone.map(m => <MissionCard key={m.id} m={m} />)}
          </div>
        )}
      </div>
    )
  }

  /* Chain section accordion */
  function ChainSection() {
    const activeChainIds = Array.from(chainMap.keys()).filter(rootId => {
      const root = all.find(m => m.id === rootId)
      return root?.status === 'active'
    })
    if (activeChainIds.length === 0) return null
    const isOpen = openSections.has('chain')
    return (
      <div className="rounded-lg border border-border bg-secondary/10 overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors"
          onClick={() => toggleSection('chain')}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">🔗</span>
            <span className="text-sm font-semibold">段階式ミッション</span>
            <span className="text-xs text-muted-foreground">({activeChainIds.length}グループ)</span>
          </div>
          {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        </button>
        {isOpen && (
          <div className="border-t border-border px-3 pb-3 pt-2 flex flex-col gap-2">
            {activeChainIds.map(rootId => <ChainGroup key={rootId} rootId={rootId} />)}
          </div>
        )}
      </div>
    )
  }

  /* ═══════════════════════════════════════
     FORM AREA
     ═══════════════════════════════════════ */
  const isChainEdit = editChainRootId !== null
  const isEditing = editId !== null || isChainEdit
  const formTitle = isChainEdit ? 'チェーングループ編集' : editId !== null ? 'ミッション編集' : 'ミッション作成'

  function FormArea() {
    if (!formOpen) {
      return (
        <Button onClick={() => { setFormOpen(true); setEditId(null); setEditChainRootId(null); setChainMode(false) }} className="gap-2">
          <Plus className="size-4" />新規作成
        </Button>
      )
    }

    /* ── Chain group edit form ── */
    if (isChainEdit) {
      const noVal = NO_VALUE_COND.has(editChainMeta.conditionType)
      return (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <Link2 className="size-4" />{formTitle}
          </p>
          {/* chain meta */}
          <div className="flex gap-2">
            <select value={editChainMeta.type} onChange={e => setEditChainMeta(p => ({ ...p, type: e.target.value }))} className={`${SELECT_CLS} flex-1`}>
              {TYPE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={editChainMeta.status} onChange={e => setEditChainMeta(p => ({ ...p, status: e.target.value as MissionStatus }))} className={`${SELECT_CLS} w-28`}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex gap-2">
            <select value={editChainMeta.conditionType} onChange={e => setEditChainMeta(p => ({ ...p, conditionType: e.target.value }))} className={`${SELECT_CLS} flex-1`}>
              {CONDITION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">リンク候補（任意・1行に1URL）</Label>
            <textarea
              placeholder={'https://example.com/a\nhttps://example.com/b'}
              value={editChainMeta.linkUrl}
              onChange={e => setEditChainMeta(p => ({ ...p, linkUrl: e.target.value }))}
              rows={3}
              className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">候補から毎日1件が選ばれ、その日は同じリンクが表示されます。</p>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <Label className="text-xs text-muted-foreground">開始日時</Label>
              <Input type="datetime-local" value={editChainMeta.startAt} onChange={e => setEditChainMeta(p => ({ ...p, startAt: e.target.value }))} className="min-h-10" />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <Label className="text-xs text-muted-foreground">終了日時</Label>
              <Input type="datetime-local" value={editChainMeta.endAt} onChange={e => setEditChainMeta(p => ({ ...p, endAt: e.target.value }))} className="min-h-10" />
            </div>
          </div>
          {/* chain stages */}
          <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-background p-3">
            <p className="text-xs font-semibold text-muted-foreground">ステージ一覧</p>
            {editChainStages.map((s, i) => (
              <div key={s.id !== 0 ? s.id : `new-${i}`} className={`flex flex-col gap-1.5 rounded-md border bg-card p-2 transition-opacity ${s.disabled ? 'opacity-55 border-red-500/30' : 'border-border'}`}>
                {/* stage header */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-primary">Lv{i + 1}</span>
                    {s.id === 0 && <span className="text-[9px] text-chart-5 px-1 py-0.5 rounded bg-chart-5/10">新規</span>}
                    {s.disabled && <span className="text-[9px] text-red-400 px-1 py-0.5 rounded bg-red-500/10">無効</span>}
                  </div>
                  <div className="flex gap-0.5 items-center">
                    <Button type="button" size="sm" variant="ghost" className="size-6 p-0 text-muted-foreground" onClick={() => moveStageUp(i)} disabled={i === 0} title="上に移動">
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="size-6 p-0 text-muted-foreground" onClick={() => moveStageDown(i)} disabled={i === editChainStages.length - 1} title="下に移動">
                      <ArrowDown className="size-3" />
                    </Button>
                    <button
                      type="button"
                      onClick={() => toggleStageDisabled(i)}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${s.disabled ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      title={s.disabled ? 'このステージを有効化' : 'このステージを無効化'}
                    >
                      {s.disabled ? '有効化' : '無効化'}
                    </button>
                    {s.id === 0 && (
                      <Button type="button" size="sm" variant="ghost" className="size-6 p-0 text-destructive hover:text-destructive" onClick={() => setEditChainStages(p => p.filter((_, idx) => idx !== i))} title="削除">
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <Input placeholder="タイトル *" value={s.title} onChange={e => setEditChainStages(p => p.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} className="min-h-9 text-sm" />
                <Input placeholder="説明（任意）" value={s.description} onChange={e => setEditChainStages(p => p.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} className="min-h-9 text-sm" />
                <div className="flex gap-2">
                  <Input type="number" placeholder="ポイント" value={s.points} onChange={e => setEditChainStages(p => p.map((x, idx) => idx === i ? { ...x, points: e.target.value } : x))} className="min-h-9 text-sm flex-1" />
                  {!noVal && (
                    <Input type="number" placeholder="条件値" value={s.conditionValue} onChange={e => setEditChainStages(p => p.map((x, idx) => idx === i ? { ...x, conditionValue: e.target.value } : x))} className="min-h-9 text-sm flex-1" />
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addStageToChain} className="text-xs text-primary hover:underline text-left mt-0.5 py-1">
              + ステージを追加
            </button>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveChainEdit} disabled={loading} className="flex-1 min-h-10 gap-2">
              <Save className="size-4" />{loading ? '保存中…' : 'チェーンを更新'}
            </Button>
            <Button variant="outline" onClick={resetForm} className="min-h-10">キャンセル</Button>
          </div>
        </div>
      )
    }

    /* ── Single mission create / edit form ── */
    const showCondVal = form.conditionType !== 'none' && !NO_VALUE_COND.has(form.conditionType) && !chainMode
    return (
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-primary flex items-center gap-2">
          {isEditing ? <Edit2 className="size-4" /> : <Plus className="size-4" />}
          {formTitle}
        </p>
        <Input placeholder="タイトル *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="min-h-10" />
        <Input placeholder="説明（任意）" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="min-h-10" />
        <div className="flex gap-2">
          <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className={`${SELECT_CLS} flex-1`}>
            {TYPE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <Input type="number" placeholder="ポイント" value={form.points} onChange={e => setForm(p => ({ ...p, points: e.target.value }))} className="min-h-10 w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">報酬キャラクター</Label>
          <select value={form.rewardCharacterId} onChange={e => setForm(p => ({ ...p, rewardCharacterId: e.target.value }))} className={SELECT_CLS}>
            <option value="">なし</option>
            {PET_REWARD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {/* Status selector */}
        <div className="flex gap-2 items-center">
          <Label className="text-xs text-muted-foreground shrink-0">ステータス</Label>
          <select value={formStatus} onChange={e => setFormStatus(e.target.value as MissionStatus)} className={`${SELECT_CLS}`}>
            <option value="active">Active（即公開）</option>
            <option value="draft">Draft（下書き）</option>
            <option value="inactive">Inactive（非公開）</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">リンク候補（任意・1行に1URL）</Label>
          <textarea
            placeholder={'https://example.com/a\nhttps://example.com/b'}
            value={form.linkUrl}
            onChange={e => setForm(p => ({ ...p, linkUrl: e.target.value }))}
            rows={3}
            className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground">候補から毎日1件が選ばれ、その日は同じリンクが表示されます。</p>
        </div>
        <div className="flex gap-2">
          <select value={form.conditionType} onChange={e => setForm(p => ({ ...p, conditionType: e.target.value, conditionValue: '' }))} className={`${SELECT_CLS} flex-1`}>
            {CONDITION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {showCondVal && (
            <Input type="number" min="0" step="any" placeholder="条件値" value={form.conditionValue} onChange={e => setForm(p => ({ ...p, conditionValue: e.target.value }))} className="min-h-10 w-32" />
          )}
        </div>

        {/* Chain mode (new only) */}
        {editId === null && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={chainMode} onChange={e => setChainMode(e.target.checked)} className="accent-primary" />
              <span className="text-xs font-semibold text-primary">🔗 段階解放チェーンとして作成</span>
            </label>
            {chainMode && (
              <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-[11px] text-muted-foreground">各ステージのタイトル・ポイント・条件値を入力してください。</p>
                {chainStages.map((s, i) => (
                  <div key={i} className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary">Lv{i + 1}</span>
                      {chainStages.length > 2 && (
                        <button type="button" className="text-[10px] text-destructive hover:underline" onClick={() => setChainStages(p => p.filter((_, idx) => idx !== i))}>削除</button>
                      )}
                    </div>
                    <Input placeholder="タイトル *" value={s.title} onChange={e => setChainStages(p => p.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} className="min-h-9 text-sm" />
                    <Input placeholder="説明（任意）" value={s.description} onChange={e => setChainStages(p => p.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} className="min-h-9 text-sm" />
                    <div className="flex gap-2">
                      <Input type="number" placeholder="ポイント" value={s.points} onChange={e => setChainStages(p => p.map((x, idx) => idx === i ? { ...x, points: e.target.value } : x))} className="min-h-9 text-sm flex-1" />
                      {form.conditionType !== 'none' && !NO_VALUE_COND.has(form.conditionType) && (
                        <Input type="number" placeholder="条件値" value={s.conditionValue} onChange={e => setChainStages(p => p.map((x, idx) => idx === i ? { ...x, conditionValue: e.target.value } : x))} className="min-h-9 text-sm flex-1" />
                      )}
                    </div>
                  </div>
                ))}
                <button type="button" className="text-xs text-primary hover:underline text-left" onClick={() => setChainStages(p => [...p, { ...BLANK_STAGE }])}>+ ステージを追加</button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <Label className="text-xs text-muted-foreground">開始日時</Label>
            <Input type="datetime-local" value={form.startAt} onChange={e => setForm(p => ({ ...p, startAt: e.target.value }))} className="min-h-10" />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <Label className="text-xs text-muted-foreground">終了日時</Label>
            <Input type="datetime-local" value={form.endAt} onChange={e => setForm(p => ({ ...p, endAt: e.target.value }))} className="min-h-10" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={chainMode ? saveChain : saveMission} disabled={loading} className="flex-1 min-h-10 gap-2">
            <Save className="size-4" />
            {loading ? '保存中…' : editId !== null ? '更新' : formStatus === 'draft' ? '下書き保存' : '作成'}
          </Button>
          <Button variant="outline" onClick={resetForm} className="min-h-10">キャンセル</Button>
        </div>
      </div>
    )
  }

  /* ════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col gap-4">
      {/* Form */}
      <FormArea />

      {/* Active missions — by type + chains */}
      {activeMissions.length > 0 || Array.from(chainMap.values()).some(c => all.find(m => m.id === c[0].id)?.status === 'active') ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground px-1">有効ミッション</p>
          {TYPE_CATEGORIES.map(cat => <TypeSection key={cat.value} cat={cat} />)}
          <ChainSection />
        </div>
      ) : null}

      {/* Draft missions */}
      {draftMissions.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-amber-500/10 transition-colors"
              onClick={() => toggleSection('draft')}
            >
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">下書き</span>
                <span className="text-xs text-muted-foreground">({draftMissions.length}件)</span>
              </div>
              {openSections.has('draft') ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
            </button>
            {openSections.has('draft') && (
              <div className="border-t border-amber-500/20 px-3 pb-3 pt-2 flex flex-col gap-2">
                <p className="text-[11px] text-muted-foreground">下書きはユーザーには表示されません。編集後にActiveへ変更して公開できます。</p>
                {draftMissions.map(m => (
                  <Card key={m.id} className="border-amber-500/20 bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <TypeBadge type={m.type} />
                          <p className="text-sm font-medium truncate flex-1">{m.title}</p>
                          <span className="font-mono text-xs text-chart-5 shrink-0">+{m.points}pts</span>
                        </div>
                        {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => startEditMission(m)} title="編集">
                          <Edit2 className="size-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="size-8 p-0 text-green-500 hover:text-green-400" onClick={() => setMissionStatus(m.id, 'active')} title="公開（Activeへ）">
                          <RotateCcw className="size-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="size-8 p-0 text-destructive hover:text-destructive" onClick={() => permanentDelete(m.id)} title="完全削除">
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inactive missions */}
      {inactiveMissions.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-border bg-secondary/5 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors"
              onClick={() => toggleSection('inactive')}
            >
              <div className="flex items-center gap-2">
                <Archive className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">無効ミッション（アーカイブ）</span>
                <span className="text-xs text-muted-foreground">({inactiveMissions.length}件)</span>
              </div>
              {openSections.has('inactive') ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
            </button>
            {openSections.has('inactive') && (
              <div className="border-t border-border px-3 pb-3 pt-2 flex flex-col gap-2">
                <p className="text-[11px] text-muted-foreground">無効化されたミッションです。復活させるか、完全削除できます。</p>
                {inactiveMissions.map(m => <MissionCard key={m.id} m={m} showRestore />)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {all.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          ミッションがありません。上のボタンから作成してください。
        </p>
      )}
    </div>
  )
}
