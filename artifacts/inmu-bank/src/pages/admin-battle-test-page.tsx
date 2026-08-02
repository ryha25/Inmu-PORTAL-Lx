import { ArrowLeft, Clipboard, RotateCcw, ShieldAlert, Swords } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { toast } from 'sonner'
import { AdminShell } from '@/components/admin-shell'
import { BattleScene } from '@/features/admin-battle/battle-scene'
import { DailyQuestSetup } from '@/features/admin-battle/daily-quest-setup'
import { QuestMenu } from '@/features/admin-battle/quest-menu'
import { TrainingSetup } from '@/features/admin-battle/training-setup'
import { DEFAULT_BATTLE_SETTINGS } from '@/features/admin-battle/pet-definitions'
import type { BattleResult, BattleSettings } from '@/features/admin-battle/types'

type View = 'menu' | 'daily' | 'training' | 'battle' | 'result'

export function AdminBattleTestPage() {
  const [, navigate] = useLocation()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<BattleSettings>({ ...DEFAULT_BATTLE_SETTINGS })
  const [view, setView] = useState<View>('menu')
  const [battleId, setBattleId] = useState('')
  const [result, setResult] = useState<BattleResult | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/auth/admin-session', { credentials: 'include' }),
      fetch('/api/admin/quests/access', { credentials: 'include' }),
    ]).then(async ([session, access]) => {
      const sessionData = session.ok ? await session.json() as { isAdmin?: boolean } : null
      if (!active) return
      const allowed = Boolean(sessionData?.isAdmin && access.ok)
      setAuthorized(allowed)
      if (!allowed) navigate('/inmu1919-login')
    }).catch(() => { if (active) { setAuthorized(false); navigate('/inmu1919-login') } })
    return () => { active = false }
  }, [navigate])

  async function startBattle() {
    try {
      const response = await fetch('/api/admin/quests/session', { method: 'POST', credentials: 'include' })
      if (!response.ok) {
        if (response.status === 403) navigate('/inmu1919-login')
        throw new Error('テストセッションを開始できませんでした')
      }
      const data = await response.json() as { battleId: string; rewardsEnabled: false }
      if (!data.battleId || data.rewardsEnabled !== false) throw new Error('安全設定を確認できませんでした')
      setBattleId(data.battleId)
      setResult(null)
      setView('battle')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'クエスト開始に失敗しました')
    }
  }

  async function logout() {
    await fetch('/api/auth/admin-sign-out', { method: 'POST', credentials: 'include' })
    navigate('/inmu1919-login')
  }

  if (authorized !== true) return null
  if (view === 'battle' && battleId) {
    return <BattleScene battleId={battleId} settings={settings} onFinish={(nextResult) => { setResult(nextResult); setView('result') }} />
  }

  return (
    <AdminShell onLogout={logout}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><Swords className="size-6 text-amber-400" /><h1 className="text-xl font-bold">クエスト</h1></div><p className="mt-1 text-sm text-muted-foreground">管理者専用のクエスト・特訓テスト</p></div>
        <button type="button" onClick={() => navigate('/inmu1919')} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-sm hover:bg-secondary"><ArrowLeft className="size-4" />管理画面</button>
      </div>
      <div className="mb-5 flex items-start gap-3 border border-cyan-400/30 bg-cyan-400/5 p-4 text-sm"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-cyan-400" /><p>このテストでは報酬、経験値、ポイント、INMU、アイテムを付与せず、PET状態、挑戦回数、ランキング、通知、履歴も変更しません。</p></div>
      {view === 'menu' && <QuestMenu onDaily={() => setView('daily')} onTraining={() => setView('training')} />}
      {view === 'daily' && <DailyQuestSetup settings={settings} onChange={setSettings} onBack={() => setView('menu')} onStart={startBattle} />}
      {view === 'training' && <TrainingSetup onBack={() => setView('menu')} />}
      {view === 'result' && result && <ResultPanel result={result} onRestart={startBattle} onBack={() => setView('daily')} />}
    </AdminShell>
  )
}

function ResultPanel({ result, onRestart, onBack }: { result: BattleResult; onRestart: () => void; onBack: () => void }) {
  const outcome = { won: '勝利', lost: '敗北', timeout: '時間切れ', aborted: '中断' }[result.outcome]
  return <div className="space-y-5">
    <section className="border border-amber-400/30 bg-card p-5 text-center">
      <p className="text-sm text-muted-foreground">テスト結果</p><h2 className="mt-1 text-3xl font-black text-amber-400">{outcome}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
        <Stat label="戦闘時間" value={`${(result.durationMs / 1000).toFixed(1)}秒`} /><Stat label="与ダメージ" value={result.damageDealt.toLocaleString()} /><Stat label="被ダメージ" value={result.damageTaken.toLocaleString()} /><Stat label="回避回数" value={String(result.dodgeCount)} /><Stat label="通常攻撃" value={String(result.normalAttackCount)} /><Stat label="必殺技" value={String(result.ultimateCount)} /><Stat label="報酬" value="付与なし" /><Stat label="本番保存" value="なし" />
      </div>
    </section>
    <details className="border border-border bg-card p-4"><summary className="cursor-pointer font-medium">結果JSON</summary><pre className="mt-3 max-h-80 overflow-auto bg-black/40 p-3 text-xs">{JSON.stringify(result, null, 2)}</pre><button type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(() => toast.success('結果JSONをコピーしました'))} className="mt-3 inline-flex min-h-10 items-center gap-2 border border-border px-3 text-sm"><Clipboard className="size-4" />コピー</button></details>
    <div className="flex flex-col gap-3 sm:flex-row"><button type="button" onClick={onRestart} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 bg-amber-400 font-bold text-black"><RotateCcw className="size-4" />もう一度テスト</button><button type="button" onClick={onBack} className="min-h-12 flex-1 border border-border font-medium">編成へ戻る</button></div>
  </div>
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold tabular-nums">{value}</p></div> }
