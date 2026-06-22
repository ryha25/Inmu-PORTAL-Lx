import { useState, useEffect, useCallback, useRef } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import mascotImg from '@assets/IMG_4397_1782097134955.jpeg'
import coinImg from '@assets/IMG_6637_1782097134955.jpeg'

type GachaPhase = 'idle' | 'guaranteed' | 'inserting' | 'spinning' | 'capsule' | 'opening' | 'done'

type PrizeResult = {
  prizeId: string
  label: string
  type: 'points' | 'inmu'
  amount: number
}

type SpinResult = {
  results: PrizeResult[]
  totalPoints: number
  hasInmu: boolean
  inmuCount: number
  wasGuaranteed: boolean
  costPoints: number
  newPoints: number
}

type GachaHistoryRow = {
  id: number
  pullType: string
  results: PrizeResult[]
  totalPoints: number
  hasInmu: boolean
  inmuCount: number
  inmuSentStatus: string
  wasGuaranteed: boolean
  costPoints: number
  createdAt: string
}

const PRIZE_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  pts100:  { bg: 'bg-slate-800',   border: 'border-slate-500',   text: 'text-white'        },
  pts1000: { bg: 'bg-blue-950',    border: 'border-blue-400',    text: 'text-blue-200'     },
  pts5000: { bg: 'bg-purple-950',  border: 'border-purple-400',  text: 'text-purple-200'   },
  inmu10k: { bg: 'bg-amber-950',   border: 'border-yellow-400',  text: 'text-yellow-300'   },
}

const PHASE_DURATION: Partial<Record<GachaPhase, number>> = {
  guaranteed: 2800,
  inserting:  1000,
  spinning:   1600,
  capsule:    800,
  opening:    700,
}

export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts, setPts] = useState(0)
  const [phase, setPhase] = useState<GachaPhase>('idle')
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const [revealIdx, setRevealIdx] = useState(0)
  const [history, setHistory] = useState<GachaHistoryRow[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (profile) setPts(Number(profile.monthlyPoints ?? 0))
  }, [profile])

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current)
  }
  function after(ms: number, next: GachaPhase) {
    clearTimer()
    timer.current = setTimeout(() => setPhase(next), ms)
  }
  useEffect(() => () => clearTimer(), [])

  useEffect(() => {
    if (phase === 'guaranteed') after(PHASE_DURATION.guaranteed!, 'inserting')
    else if (phase === 'inserting') after(PHASE_DURATION.inserting!, 'spinning')
    else if (phase === 'spinning')  after(PHASE_DURATION.spinning!,  'capsule')
    else if (phase === 'capsule')   after(PHASE_DURATION.capsule!,   'opening')
    else if (phase === 'opening')   after(PHASE_DURATION.opening!,   'done')
  }, [phase])

  // 10連: カードを一枚ずつ表示
  useEffect(() => {
    if (phase === 'done' && spinResult && spinResult.results.length > 1 && revealIdx < spinResult.results.length) {
      const t = setTimeout(() => setRevealIdx(i => i + 1), 140)
      return () => clearTimeout(t)
    }
  }, [phase, spinResult, revealIdx])

  async function spin(type: 'single' | 'multi') {
    if (phase !== 'idle') return
    const cost = type === 'multi' ? 10000 : 1000
    if (pts < cost) {
      toast.error(`ポイントが不足しています（必要: ${cost.toLocaleString()}pt / 所持: ${pts.toLocaleString()}pt）`)
      return
    }
    try {
      const res = await fetch('/api/gacha/spin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? '通信エラー')
      }
      const result = await res.json() as SpinResult
      setSpinResult(result)
      setRevealIdx(0)
      setPts(result.newPoints)
      if (result.wasGuaranteed) setPhase('guaranteed')
      else setPhase('inserting')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'エラーが発生しました')
    }
  }

  function reset() {
    clearTimer()
    setPhase('idle')
    setSpinResult(null)
    setRevealIdx(0)
  }

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/gacha/history', { credentials: 'include' })
      const d = await r.json() as GachaHistoryRow[]
      setHistory(Array.isArray(d) ? d : [])
    } catch { toast.error('履歴の取得に失敗しました') }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const isMulti = (spinResult?.results.length ?? 0) > 1

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <style>{`
        @keyframes g-float  { 0%,100%{transform:translateY(0)}      50%{transform:translateY(-9px)} }
        @keyframes g-spin   { from{transform:rotate(0deg)} to{transform:rotate(720deg)} }
        @keyframes g-bounce { 0%,100%{transform:translateY(0)scale(1)} 35%{transform:translateY(-26px)scale(1.07)} 70%{transform:translateY(-10px)scale(1.03)} }
        @keyframes g-drop   { 0%{transform:translateY(-90px)rotate(0deg);opacity:0} 65%{transform:translateY(6px)rotate(200deg);opacity:1} 100%{transform:translateY(0)rotate(360deg);opacity:1} }
        @keyframes g-pop    { 0%{transform:scale(0)translateY(18px);opacity:0} 65%{transform:scale(1.18)translateY(-4px);opacity:1} 100%{transform:scale(1)translateY(0);opacity:1} }
        @keyframes g-split-t{ from{transform:translateY(0)rotate(0)} to{transform:translateY(-36px)rotate(-12deg)} }
        @keyframes g-split-b{ from{transform:translateY(0)rotate(0)} to{transform:translateY(36px)rotate(12deg)} }
        @keyframes g-reveal { from{transform:scale(.7)translateY(16px);opacity:0} to{transform:scale(1)translateY(0);opacity:1} }
        @keyframes g-glow   { 0%,100%{box-shadow:0 0 14px 4px rgba(234,179,8,.55)} 50%{box-shadow:0 0 32px 12px rgba(234,179,8,.85)} }
        @keyframes g-card   { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes g-sparkle{ 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1.3)} }
        .g-float   { animation:g-float   2.6s ease-in-out infinite }
        .g-spin    { animation:g-spin    .45s linear infinite }
        .g-bounce  { animation:g-bounce  .75s ease-in-out infinite }
        .g-drop    { animation:g-drop    .85s ease-out forwards }
        .g-pop     { animation:g-pop     .5s  cubic-bezier(.3,0,.6,-.5) forwards }
        .g-split-t { animation:g-split-t .5s  ease-out forwards }
        .g-split-b { animation:g-split-b .5s  ease-out forwards }
        .g-reveal  { animation:g-reveal  .42s ease-out forwards }
        .g-glow    { animation:g-glow    1.3s ease-in-out infinite }
        .g-card    { animation:g-card    .3s  ease-out forwards }
      `}</style>

      <div className="flex flex-col min-h-[100dvh]">
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-yellow-400">🎰 ガチャ</h1>
            <p className="text-xs text-muted-foreground">
              所持: <span className="text-chart-5 font-bold">{pts.toLocaleString()} pt</span>
            </p>
          </div>
          {phase === 'done' && (
            <Button variant="outline" size="sm" onClick={reset} className="gap-1 text-xs h-8">
              <RefreshCw className="size-3" />もう一度
            </Button>
          )}
        </div>

        {/* アニメーションエリア */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">

          {/* ── idle ── */}
          {phase === 'idle' && (
            <div className="flex flex-col items-center gap-5 w-full max-w-xs">
              <div className="relative">
                <img
                  src={coinImg} alt="INMU Coin"
                  className="w-40 h-40 rounded-full object-cover g-float border-4 border-yellow-500/60 shadow-2xl shadow-yellow-500/25"
                />
                <img
                  src={mascotImg} alt="インムくん"
                  className="absolute -right-10 -bottom-1 w-16 h-16 rounded-full object-cover border-2 border-border shadow-lg"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">INMUコインを投入してガチャを引こう！</p>
              {/* 排出率表示 */}
              <div className="grid grid-cols-2 gap-1.5 w-full text-xs">
                {[
                  { label:'100pt',       rate:'88%', cls:'border-slate-500' },
                  { label:'1,000pt',     rate:'8%',  cls:'border-blue-500'  },
                  { label:'5,000pt',     rate:'3%',  cls:'border-purple-500'},
                  { label:'10,000 INMU', rate:'1%',  cls:'border-yellow-500'},
                ].map(({ label, rate, cls }) => (
                  <div key={label} className={`flex justify-between bg-card border ${cls} rounded px-2 py-1`}>
                    <span>{label}</span>
                    <span className="text-chart-5 font-mono">{rate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── guaranteed（確定演出）── */}
          {phase === 'guaranteed' && (
            <div className="flex flex-col items-center gap-5">
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 rounded-full animate-ping bg-yellow-400/25 scale-150" />
                <img
                  src={mascotImg} alt="インムくん"
                  className="w-40 h-40 rounded-full object-cover g-bounce border-4 border-yellow-400 shadow-2xl shadow-yellow-400/55 relative z-10"
                />
              </div>
              <div className="g-reveal bg-gradient-to-r from-yellow-900 to-amber-800 border-2 border-yellow-400 rounded-2xl px-8 py-4 text-center g-glow">
                <p className="text-yellow-300 font-black text-base tracking-wider">✨ 確定演出 ✨</p>
                <p className="text-yellow-200/90 text-xs mt-1">10,000 INMU 1個以上確定！</p>
              </div>
              <div className="flex gap-2.5">
                {['✦','✧','★','✧','✦'].map((s, i) => (
                  <span
                    key={i}
                    className="text-yellow-400 text-xl"
                    style={{ animation: `g-sparkle ${0.5 + i * 0.15}s ease-in-out infinite`, animationDelay: `${i * 0.11}s` }}
                  >{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── inserting（コイン投入）── */}
          {phase === 'inserting' && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-60 w-44 flex flex-col items-center">
                <img
                  src={coinImg} alt="INMU Coin"
                  className="absolute top-0 w-20 h-20 rounded-full object-cover g-drop border-2 border-yellow-400 shadow-lg shadow-yellow-400/40 z-10"
                />
                <div className="absolute bottom-0 w-36 h-40 rounded-3xl bg-card border-2 border-primary/40 flex flex-col items-center justify-center gap-1 shadow-inner">
                  <img src={coinImg} alt="" className="w-8 h-8 rounded-full object-cover opacity-40" />
                  <p className="text-[10px] text-muted-foreground font-bold tracking-widest">INMU GACHA</p>
                </div>
              </div>
            </div>
          )}

          {/* ── spinning（回転）── */}
          {phase === 'spinning' && (
            <div className="flex flex-col items-center gap-5">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-52 h-52 rounded-full border-4 border-yellow-400/30 animate-pulse" />
                <img
                  src={coinImg} alt="INMU Coin"
                  className="w-44 h-44 rounded-full object-cover g-spin border-4 border-yellow-400 shadow-2xl shadow-yellow-500/55 relative z-10"
                />
              </div>
              <p className="text-yellow-400 font-bold text-sm animate-pulse tracking-widest">ガチャ回転中…</p>
            </div>
          )}

          {/* ── capsule / opening ── */}
          {(phase === 'capsule' || phase === 'opening') && (
            <div className="flex flex-col items-center gap-5">
              <div className="relative w-36 h-44 flex flex-col items-center">
                <div className={`w-36 h-[84px] rounded-t-full bg-gradient-to-b from-slate-300 to-slate-500 border-2 border-slate-200/60 ${phase === 'opening' ? 'g-split-t' : 'g-pop'} origin-bottom`} />
                <div className={`w-36 h-[84px] rounded-b-full bg-gradient-to-t from-slate-500 to-slate-600 border-2 border-slate-400/60 ${phase === 'opening' ? 'g-split-b' : ''} origin-top`} />
                {phase === 'opening' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-20 h-20 rounded-full bg-white/20 animate-ping" />
                    <div className="absolute w-10 h-10 rounded-full bg-white/40 animate-ping" style={{ animationDelay: '150ms' }} />
                  </div>
                )}
              </div>
              {phase === 'capsule'  && <p className="text-sm text-muted-foreground animate-pulse">カプセルが出てきた…！</p>}
              {phase === 'opening'  && <p className="text-sm text-white/80 animate-pulse">カプセルオープン！</p>}
            </div>
          )}

          {/* ── done: 1連結果 ── */}
          {phase === 'done' && spinResult && !isMulti && (
            <div className="g-reveal flex flex-col items-center gap-4 w-full max-w-xs">
              {spinResult.wasGuaranteed && (
                <p className="text-xs text-yellow-400 font-bold animate-pulse">✨ 確定演出が発動！</p>
              )}
              {spinResult.results.map((prize, i) => {
                const st = PRIZE_STYLE[prize.prizeId] ?? PRIZE_STYLE.pts100
                const isInmu = prize.type === 'inmu'
                return (
                  <div
                    key={i}
                    className={`w-full rounded-2xl border-2 p-6 text-center ${st.bg} ${st.border} ${isInmu ? 'g-glow' : ''}`}
                  >
                    {isInmu && <p className="text-4xl mb-3">🏆</p>}
                    <p className={`font-black text-3xl tracking-wide ${st.text}`}>{prize.label}</p>
                    {prize.type === 'points' && (
                      <p className="text-xs text-muted-foreground mt-2">ポイントを即時付与しました</p>
                    )}
                    {isInmu && (
                      <p className="text-xs text-yellow-200/80 mt-2 leading-relaxed">
                        当選おめでとうございます！<br/>後日運営より送金されます
                      </p>
                    )}
                  </div>
                )
              })}
              {spinResult.totalPoints > 0 && (
                <p className="text-sm text-chart-5 font-bold">
                  +{spinResult.totalPoints.toLocaleString()} pt を獲得しました！
                </p>
              )}
            </div>
          )}

          {/* ── done: 10連結果グリッド ── */}
          {phase === 'done' && spinResult && isMulti && (
            <div className="g-reveal flex flex-col gap-3 w-full max-w-xs">
              {spinResult.wasGuaranteed && (
                <p className="text-xs text-yellow-400 font-bold text-center animate-pulse">✨ 確定演出が発動！</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {spinResult.results.map((prize, i) => {
                  const st = PRIZE_STYLE[prize.prizeId] ?? PRIZE_STYLE.pts100
                  const isInmu = prize.type === 'inmu'
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border-2 p-3 text-center ${st.bg} ${st.border} ${isInmu ? 'g-glow' : ''} ${i < revealIdx ? 'g-card' : 'opacity-0'}`}
                    >
                      {isInmu && <p className="text-2xl">🏆</p>}
                      <p className={`font-bold text-sm ${st.text}`}>{prize.label}</p>
                    </div>
                  )
                })}
              </div>
              {spinResult.totalPoints > 0 && (
                <p className="text-xs text-chart-5 text-center font-bold">
                  合計 +{spinResult.totalPoints.toLocaleString()} pt 獲得！
                </p>
              )}
              {spinResult.hasInmu && (
                <p className="text-xs text-yellow-300 text-center">
                  🏆 10,000 INMU 当選！後日運営より送金されます
                </p>
              )}
            </div>
          )}

        </div>

        {/* ── ボタン（idleのみ表示）── */}
        {phase === 'idle' && (
          <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-4 py-4 flex flex-col gap-2.5">
            <Button
              onClick={() => spin('single')}
              disabled={pts < 1000}
              className="w-full h-12 text-base font-bold"
              style={{ background: pts >= 1000 ? 'linear-gradient(135deg,#b8860b,#daa520,#b8860b)' : undefined }}
            >
              🪙 1連ガチャ — 1,000 pt
            </Button>
            <Button
              onClick={() => spin('multi')}
              disabled={pts < 10000}
              variant="outline"
              className="w-full h-12 text-base font-bold border-yellow-600/50 hover:bg-yellow-950/30 hover:border-yellow-400"
            >
              🌟 10連ガチャ — 10,000 pt
            </Button>
            {pts < 1000 && (
              <p className="text-center text-xs text-muted-foreground">
                ミッションをクリアしてポイントを貯めよう！
              </p>
            )}
          </div>
        )}

        {/* ── ガチャ履歴 ── */}
        <div className="px-4 pb-8 mt-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="flex w-full items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
          >
            <span className="text-sm font-semibold text-muted-foreground">📜 ガチャ履歴</span>
            {historyOpen
              ? <ChevronDown className="size-4 text-muted-foreground" />
              : <ChevronRight className="size-4 text-muted-foreground" />
            }
          </button>

          {historyOpen && (
            <div className="mt-2 flex flex-col gap-2">
              {history.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">ガチャ履歴がありません</p>
              )}
              {history.map(row => (
                <Card key={row.id} className="p-3 border-border bg-card">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold">{row.pullType === 'multi' ? '10連' : '1連'}</span>
                        {row.wasGuaranteed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-950/60 text-yellow-400 border border-yellow-700">✨確定</span>
                        )}
                        {row.hasInmu && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${row.inmuSentStatus === 'sent' ? 'bg-green-950/60 text-green-400 border-green-700' : 'bg-amber-950/60 text-yellow-400 border-yellow-700'}`}>
                            🏆INMU{row.inmuSentStatus === 'sent' ? '（送金済）' : '（未送金）'}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(row.createdAt).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {' — '}消費 {row.costPoints.toLocaleString()}pt
                        {row.totalPoints > 0 && ` / 獲得 +${row.totalPoints.toLocaleString()}pt`}
                      </p>
                    </div>
                  </div>

                  {row.results.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {row.results.map((r, i) => {
                        const st = PRIZE_STYLE[r.prizeId] ?? PRIZE_STYLE.pts100
                        return (
                          <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${st.border} ${st.bg} ${st.text}`}>
                            {r.label}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
