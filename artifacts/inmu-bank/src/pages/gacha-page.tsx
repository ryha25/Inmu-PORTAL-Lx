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

const PRIZE_STYLE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  pts100:  { bg: 'bg-slate-800',   border: 'border-slate-500',   text: 'text-white',      dot: '#6b7280' },
  pts1000: { bg: 'bg-blue-950',    border: 'border-blue-400',    text: 'text-blue-200',   dot: '#3b82f6' },
  pts5000: { bg: 'bg-purple-950',  border: 'border-purple-400',  text: 'text-purple-200', dot: '#a855f7' },
  inmu10k: { bg: 'bg-amber-950',   border: 'border-yellow-400',  text: 'text-yellow-300', dot: '#eab308' },
}

const CAPSULE_COLORS = [
  { color: 'radial-gradient(circle at 38% 35%, #6b7280, #374151)', border: 'rgba(156,163,175,0.6)', label: '100pt' },
  { color: 'radial-gradient(circle at 38% 35%, #60a5fa, #1e3a8a)', border: 'rgba(96,165,250,0.7)',  label: '1,000pt' },
  { color: 'radial-gradient(circle at 38% 35%, #c084fc, #581c87)', border: 'rgba(192,132,252,0.7)', label: '5,000pt' },
  { color: 'radial-gradient(circle at 38% 35%, #fbbf24, #78350f)', border: 'rgba(251,191,36,0.9)',  label: '10,000\nINMU' },
]

const PHASE_DURATION: Partial<Record<GachaPhase, number>> = {
  guaranteed: 2800,
  inserting:  1000,
  spinning:   1600,
  capsule:    800,
  opening:    700,
}

const GOLD = 'linear-gradient(135deg,#b8860b 0%,#daa520 40%,#ffd700 60%,#b8860b 100%)'
const GOLD_BTN = 'linear-gradient(135deg,#7c5a00 0%,#b8860b 30%,#daa520 50%,#b8860b 70%,#7c5a00 100%)'
const RED_BTN  = 'linear-gradient(135deg,#6b0000 0%,#991b1b 30%,#dc2626 50%,#991b1b 70%,#6b0000 100%)'

export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts, setPts] = useState(0)
  const [phase, setPhase] = useState<GachaPhase>('idle')
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const [revealIdx, setRevealIdx] = useState(0)
  const [history, setHistory] = useState<GachaHistoryRow[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [ptsLoading, setPtsLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (profile) {
      setPts(Number(profile.monthlyPoints ?? 0))
      setPtsLoading(false)
    }
  }, [profile])

  async function refreshPoints() {
    try {
      const r = await fetch('/api/profile', { credentials: 'include' })
      if (r.ok) {
        const d = await r.json() as { monthlyPoints?: number | string }
        setPts(Number(d.monthlyPoints ?? 0))
      }
    } catch { /* ignore */ }
  }

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
      toast.error(`ポイント不足（必要: ${cost.toLocaleString()}pt / 所持: ${pts.toLocaleString()}pt）`)
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
    refreshPoints()
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
        @keyframes g-float   { 0%,100%{transform:translateY(0)}      50%{transform:translateY(-9px)} }
        @keyframes g-spin    { from{transform:rotate(0deg)} to{transform:rotate(720deg)} }
        @keyframes g-bounce  { 0%,100%{transform:translateY(0)scale(1)} 35%{transform:translateY(-26px)scale(1.07)} 70%{transform:translateY(-10px)scale(1.03)} }
        @keyframes g-drop    { 0%{transform:translateY(-90px)rotate(0deg);opacity:0} 65%{transform:translateY(6px)rotate(200deg);opacity:1} 100%{transform:translateY(0)rotate(360deg);opacity:1} }
        @keyframes g-pop     { 0%{transform:scale(0)translateY(18px);opacity:0} 65%{transform:scale(1.18)translateY(-4px);opacity:1} 100%{transform:scale(1)translateY(0);opacity:1} }
        @keyframes g-split-t { from{transform:translateY(0)rotate(0)} to{transform:translateY(-40px)rotate(-14deg)} }
        @keyframes g-split-b { from{transform:translateY(0)rotate(0)} to{transform:translateY(40px)rotate(14deg)} }
        @keyframes g-reveal  { from{transform:scale(.7)translateY(16px);opacity:0} to{transform:scale(1)translateY(0);opacity:1} }
        @keyframes g-glow    { 0%,100%{box-shadow:0 0 14px 4px rgba(234,179,8,.55)} 50%{box-shadow:0 0 40px 16px rgba(234,179,8,.9)} }
        @keyframes g-card    { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes g-sparkle { 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1.4)} }
        @keyframes g-star    { 0%,100%{opacity:.2} 50%{opacity:1} }
        @keyframes g-pulse-gold { 0%,100%{text-shadow:0 0 10px rgba(218,165,32,.4)} 50%{text-shadow:0 0 30px rgba(255,215,0,.9),0 0 60px rgba(218,165,32,.5)} }
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
        .g-pulse-gold { animation:g-pulse-gold 2s ease-in-out infinite }
        .star-1 { animation:g-star 2.1s ease-in-out infinite }
        .star-2 { animation:g-star 1.7s ease-in-out infinite .3s }
        .star-3 { animation:g-star 2.4s ease-in-out infinite .7s }
        .star-4 { animation:g-star 1.4s ease-in-out infinite 1.1s }
        .star-5 { animation:g-star 2.8s ease-in-out infinite .5s }
        .star-6 { animation:g-star 1.9s ease-in-out infinite 1.5s }
      `}</style>

      <div className="flex flex-col min-h-[100dvh] bg-background">

        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <div className="flex flex-col flex-1 pb-0">
            {/* Title */}
            <div className="text-center pt-5 pb-3 px-4">
              <h1
                className="text-2xl font-black tracking-widest g-pulse-gold"
                style={{ color: '#daa520' }}
              >
                ✦ INMU GACHA ✦
              </h1>
              <p className="text-xs text-muted-foreground mt-1">INMUコインを投入してガチャを引こう！</p>
            </div>

            {/* Machine + Rates */}
            <div className="flex gap-3 px-4 items-start">
              {/* Gacha Machine */}
              <div className="flex flex-col items-center flex-1">
                {/* Dome */}
                <div
                  className="relative flex items-center justify-center overflow-hidden"
                  style={{
                    width: 168, height: 168,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 40% 35%, #1c1a2e 0%, #0a080f 100%)',
                    border: '4px solid #b8860b',
                    boxShadow: '0 0 32px rgba(184,134,11,0.45), inset 0 0 40px rgba(0,0,0,0.7)',
                  }}
                >
                  {/* Stars inside dome */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[
                      {x:20,y:18,s:2}, {x:70,y:12,s:1.5},{x:130,y:20,s:2},
                      {x:148,y:55,s:1},{x:15,y:80,s:1.5},{x:145,y:100,s:2},
                      {x:30,y:120,s:1},{x:110,y:130,s:1.5},{x:60,y:140,s:1},
                    ].map((s, i) => (
                      <div
                        key={i}
                        className={`star-${(i%6)+1} absolute rounded-full bg-white`}
                        style={{ left:s.x, top:s.y, width:s.s, height:s.s }}
                      />
                    ))}
                  </div>
                  {/* Top label */}
                  <div className="absolute top-5 left-0 right-0 text-center">
                    <p className="text-yellow-400 text-[11px] font-black tracking-[0.25em]">★★</p>
                    <p
                      className="font-black text-lg tracking-[0.15em]"
                      style={{ color: '#daa520' }}
                    >INMU</p>
                  </div>
                  {/* Floating coin */}
                  <img
                    src={coinImg} alt="INMU Coin"
                    className="g-float rounded-full object-cover border-2 border-yellow-400"
                    style={{
                      width: 72, height: 72,
                      marginTop: 28,
                      boxShadow: '0 0 20px rgba(218,165,32,0.7)',
                    }}
                  />
                </div>

                {/* Machine body */}
                <div
                  className="flex flex-col items-center"
                  style={{
                    width: 148,
                    background: 'linear-gradient(to bottom, #2c2c2c, #1a1a1a)',
                    borderLeft: '4px solid #b8860b',
                    borderRight: '4px solid #b8860b',
                  }}
                >
                  <div
                    className="w-full flex items-center justify-center gap-2 py-1.5"
                    style={{ borderBottom: '1px solid rgba(184,134,11,0.3)' }}
                  >
                    <p className="text-[8px] font-black tracking-[0.2em]" style={{ color: '#b8860b' }}>
                      INSERT COIN
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 py-2">
                    <img src={coinImg} alt="" className="w-7 h-7 rounded-full object-cover" />
                    <div>
                      <p className="text-[9px] font-black" style={{ color: '#daa520' }}>INMU</p>
                      <p className="text-[8px]" style={{ color: '#7c6100' }}>COIN ONLY</p>
                    </div>
                  </div>
                </div>

                {/* Machine base */}
                <div
                  style={{
                    width: 164,
                    height: 32,
                    background: 'linear-gradient(to bottom, #1a1a1a, #111)',
                    border: '4px solid #b8860b',
                    borderTop: 'none',
                    borderRadius: '0 0 18px 18px',
                  }}
                />

                {/* Mascot + speech bubble */}
                <div className="flex items-end gap-2 mt-3 w-full px-2">
                  <div
                    className="flex-1 rounded-xl px-2.5 py-2"
                    style={{
                      background: 'rgba(30,20,5,0.8)',
                      border: '1px solid rgba(184,134,11,0.4)',
                    }}
                  >
                    <p className="text-[10px]" style={{ color: '#f5deb3' }}>何が出るかな？</p>
                    <p className="text-[10px]" style={{ color: '#f5deb3' }}>ワクワクするね！</p>
                  </div>
                  <img
                    src={mascotImg} alt="インムくん"
                    className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                    style={{ border: '2px solid rgba(184,134,11,0.6)', boxShadow: '0 0 12px rgba(184,134,11,0.3)' }}
                  />
                </div>
              </div>

              {/* Prize rates */}
              <div className="flex flex-col gap-2 pt-2 min-w-[88px]">
                <p
                  className="text-[10px] font-black text-center tracking-wider"
                  style={{ color: '#daa520' }}
                >★ 排出率 ★</p>
                {[
                  { dot: '#9ca3af', label: '100pt',       rate: '88%' },
                  { dot: '#60a5fa', label: '1,000pt',     rate: '8%'  },
                  { dot: '#c084fc', label: '5,000pt',     rate: '3%'  },
                  { dot: '#fbbf24', label: '10,000\nINMU',rate: '1%'  },
                ].map(({ dot, label, rate }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div
                      className="flex-shrink-0 rounded-full"
                      style={{
                        width: 14, height: 14,
                        background: `radial-gradient(circle at 35% 35%, #fff8, ${dot})`,
                        border: '1.5px solid rgba(255,255,255,0.25)',
                        boxShadow: `0 0 6px ${dot}80`,
                      }}
                    />
                    <div className="flex flex-col">
                      {label.split('\n').map((l, i) => (
                        <span key={i} className="text-[9px] text-gray-200 leading-tight">{l}</span>
                      ))}
                    </div>
                    <span
                      className="text-[10px] font-mono font-bold ml-auto"
                      style={{ color: '#daa520' }}
                    >{rate}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Capsule legend */}
            <div className="px-4 mt-4">
              <p className="text-[9px] text-muted-foreground text-center mb-2">カプセルデザイン（例）</p>
              <div className="flex gap-2 justify-center">
                {CAPSULE_COLORS.map(c => (
                  <div key={c.label} className="flex flex-col items-center gap-1">
                    <div
                      className="rounded-full"
                      style={{
                        width: 40, height: 40,
                        background: c.color,
                        border: `2px solid ${c.border}`,
                        boxShadow: `0 0 8px ${c.border}`,
                      }}
                    />
                    {c.label.split('\n').map((l, i) => (
                      <p key={i} className="text-[8px] text-muted-foreground leading-tight text-center">{l}</p>
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-[8px] text-muted-foreground text-center mt-1">
                ※カプセルの色は演出イメージです
              </p>
            </div>

            <div className="flex-1" />

            {/* Points display */}
            <div
              className="mx-4 mb-3 flex items-center justify-between px-4 py-3 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, #1a1200, #2a1e00)',
                border: '1.5px solid rgba(184,134,11,0.5)',
              }}
            >
              <div className="flex items-center gap-2">
                <img src={coinImg} alt="" className="w-6 h-6 rounded-full object-cover" />
                <span className="text-xs font-semibold text-yellow-200/80">保有ポイント</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="font-mono font-black text-lg tabular-nums"
                  style={{ color: '#ffd700' }}
                >
                  {ptsLoading ? '---' : pts.toLocaleString()} pt
                </span>
                <ChevronRight className="size-4 text-yellow-600" />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 px-4 pb-6">
              <button
                onClick={() => spin('single')}
                disabled={pts < 1000 || ptsLoading}
                className="flex-1 flex flex-col items-center justify-center py-3.5 rounded-xl font-black text-sm tracking-wide transition-opacity disabled:opacity-40 active:scale-95"
                style={{
                  background: pts >= 1000 ? GOLD_BTN : '#3a3a3a',
                  border: '2px solid rgba(218,165,32,0.7)',
                  boxShadow: pts >= 1000 ? '0 0 20px rgba(184,134,11,0.4), inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
                  color: '#fff8e1',
                  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <img src={coinImg} alt="" className="w-5 h-5 rounded-full object-cover" />
                  <span>1連ガチャ</span>
                </div>
                <span className="text-[11px] font-bold mt-0.5 opacity-90">1,000 pt</span>
              </button>

              <button
                onClick={() => spin('multi')}
                disabled={pts < 10000 || ptsLoading}
                className="flex-1 flex flex-col items-center justify-center py-3.5 rounded-xl font-black text-sm tracking-wide transition-opacity disabled:opacity-40 active:scale-95"
                style={{
                  background: pts >= 10000 ? RED_BTN : '#3a3a3a',
                  border: '2px solid rgba(185,28,28,0.7)',
                  boxShadow: pts >= 10000 ? '0 0 20px rgba(185,28,28,0.4), inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
                  color: '#fff8f8',
                  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <img src={coinImg} alt="" className="w-5 h-5 rounded-full object-cover" />
                  <span>10連ガチャ</span>
                </div>
                <span className="text-[11px] font-bold mt-0.5 opacity-90">10,000 pt</span>
              </button>
            </div>

            {pts < 1000 && !ptsLoading && (
              <p className="text-center text-xs text-muted-foreground pb-4 px-4">
                ミッションをクリアしてポイントを貯めよう！
              </p>
            )}
          </div>
        )}

        {/* ── ANIMATION phases ── */}
        {phase !== 'idle' && (
          <div className="flex flex-col flex-1 items-center justify-center px-6 py-8 gap-6">
            {/* Header during animation */}
            <div className="self-stretch flex items-center justify-between">
              <div>
                <h1 className="text-base font-black" style={{ color: '#daa520' }}>✦ INMU GACHA ✦</h1>
                <p className="text-xs text-muted-foreground">
                  所持: <span className="font-bold" style={{ color: '#ffd700' }}>{pts.toLocaleString()} pt</span>
                </p>
              </div>
              {phase === 'done' && (
                <Button variant="outline" size="sm" onClick={reset} className="gap-1 text-xs h-8">
                  <RefreshCw className="size-3" />もう一度
                </Button>
              )}
            </div>

            {/* ── guaranteed（確定演出）── */}
            {phase === 'guaranteed' && (
              <div className="flex flex-col items-center gap-5">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full animate-ping bg-yellow-400/25 scale-150" />
                  <img
                    src={mascotImg} alt="インムくん"
                    className="w-40 h-40 rounded-full object-cover g-bounce border-4 border-yellow-400 relative z-10"
                    style={{ boxShadow: '0 0 40px rgba(234,179,8,0.7)' }}
                  />
                </div>
                <div
                  className="g-reveal rounded-2xl px-8 py-4 text-center g-glow"
                  style={{ background: 'linear-gradient(135deg,#3d1f00,#5c3000)', border: '2px solid #daa520' }}
                >
                  <p className="font-black text-base tracking-wider" style={{ color: '#ffd700' }}>✨ 確定演出 ✨</p>
                  <p className="text-xs mt-1 text-yellow-200/90">10,000 INMU 1個以上確定！</p>
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
                <div className="relative h-64 w-44 flex flex-col items-center">
                  <img
                    src={coinImg} alt="INMU Coin"
                    className="absolute top-0 w-20 h-20 rounded-full object-cover g-drop border-2 border-yellow-400 z-10"
                    style={{ boxShadow: '0 0 20px rgba(218,165,32,0.7)' }}
                  />
                  <div
                    className="absolute bottom-0 w-40 h-44 rounded-3xl flex flex-col items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(to bottom, #1a1a1a, #111)',
                      border: '3px solid #b8860b',
                      boxShadow: '0 0 20px rgba(184,134,11,0.3)',
                    }}
                  >
                    <img src={coinImg} alt="" className="w-10 h-10 rounded-full object-cover opacity-50" />
                    <p className="text-[9px] font-black tracking-widest" style={{ color: '#7c5a00' }}>INMU GACHA</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">コインを投入中…</p>
              </div>
            )}

            {/* ── spinning（回転）── */}
            {phase === 'spinning' && (
              <div className="flex flex-col items-center gap-5">
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute rounded-full animate-pulse"
                    style={{ width: 200, height: 200, border: '3px solid rgba(218,165,32,0.3)' }}
                  />
                  <div
                    className="absolute rounded-full animate-ping"
                    style={{ width: 160, height: 160, background: 'rgba(218,165,32,0.05)' }}
                  />
                  <img
                    src={coinImg} alt="INMU Coin"
                    className="w-44 h-44 rounded-full object-cover g-spin border-4 border-yellow-400 relative z-10"
                    style={{ boxShadow: '0 0 40px rgba(218,165,32,0.8)' }}
                  />
                </div>
                <p className="text-yellow-400 font-bold text-sm animate-pulse tracking-widest">ガチャ回転中…</p>
              </div>
            )}

            {/* ── capsule / opening ── */}
            {(phase === 'capsule' || phase === 'opening') && (
              <div className="flex flex-col items-center gap-5">
                <div className="relative w-36 h-44 flex flex-col items-center">
                  <div
                    className={`w-36 h-[84px] rounded-t-full ${phase === 'opening' ? 'g-split-t' : 'g-pop'} origin-bottom`}
                    style={{
                      background: 'linear-gradient(to bottom, #d1d5db, #6b7280)',
                      border: '2px solid rgba(209,213,219,0.8)',
                      boxShadow: '0 0 16px rgba(255,255,255,0.2)',
                    }}
                  />
                  <div
                    className={`w-36 h-[84px] rounded-b-full ${phase === 'opening' ? 'g-split-b' : ''} origin-top`}
                    style={{ background: 'linear-gradient(to top, #4b5563, #6b7280)', border: '2px solid rgba(156,163,175,0.6)' }}
                  />
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
                  <p className="text-xs font-bold animate-pulse" style={{ color: '#ffd700' }}>✨ 確定演出が発動！</p>
                )}
                {spinResult.results.map((prize, i) => {
                  const st = PRIZE_STYLE[prize.prizeId] ?? PRIZE_STYLE.pts100
                  const isInmu = prize.type === 'inmu'
                  return (
                    <div
                      key={i}
                      className={`w-full rounded-2xl border-2 p-6 text-center ${st.bg} ${st.border} ${isInmu ? 'g-glow' : ''}`}
                    >
                      {isInmu && (
                        <p className="text-5xl mb-3" style={{ filter: 'drop-shadow(0 0 12px gold)' }}>🏆</p>
                      )}
                      <p className={`font-black text-3xl tracking-wide ${st.text}`}>{prize.label}</p>
                      {prize.type === 'points' && (
                        <p className="text-xs text-muted-foreground mt-2">ポイントを即時付与しました</p>
                      )}
                      {isInmu && (
                        <p className="text-xs text-yellow-200/80 mt-2 leading-relaxed">
                          当選おめでとうございます！<br/>報酬は後日運営より送金されます
                        </p>
                      )}
                    </div>
                  )
                })}
                {spinResult.totalPoints > 0 && (
                  <p className="text-sm font-bold" style={{ color: '#ffd700' }}>
                    +{spinResult.totalPoints.toLocaleString()} pt を獲得しました！
                  </p>
                )}
              </div>
            )}

            {/* ── done: 10連結果グリッド ── */}
            {phase === 'done' && spinResult && isMulti && (
              <div className="g-reveal flex flex-col gap-3 w-full max-w-xs">
                {spinResult.wasGuaranteed && (
                  <p className="text-xs font-bold text-center animate-pulse" style={{ color: '#ffd700' }}>✨ 確定演出が発動！</p>
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
                  <p className="text-xs text-center font-bold" style={{ color: '#ffd700' }}>
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
        )}

        {/* ── ガチャ履歴 ── */}
        {phase === 'idle' && (
          <div className="px-4 pb-8 mt-2">
            <button
              type="button"
              onClick={() => { setHistoryOpen(o => !o); if (!historyOpen) loadHistory() }}
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
        )}
      </div>
    </AppShell>
  )
}
