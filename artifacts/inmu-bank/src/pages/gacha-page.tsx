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
  pts100:  { bg: 'bg-slate-800',  border: 'border-slate-500',  text: 'text-white'      },
  pts1000: { bg: 'bg-blue-950',   border: 'border-blue-400',   text: 'text-blue-200'   },
  pts5000: { bg: 'bg-purple-950', border: 'border-purple-400', text: 'text-purple-200' },
  inmu10k: { bg: 'bg-amber-950',  border: 'border-yellow-400', text: 'text-yellow-300' },
}

const PHASE_DURATION: Partial<Record<GachaPhase, number>> = {
  guaranteed: 3200,
  inserting:  1000,
  spinning:   1800,
  capsule:    900,
  opening:    700,
}

// 内部で使用するだけ（UI には表示しない）
const G_GOLD     = 'linear-gradient(160deg,#7c5a00 0%,#b8860b 25%,#daa520 50%,#b8860b 75%,#7c5a00 100%)'
const G_GOLD_BTN = 'linear-gradient(160deg,#5c3e00 0%,#a07010 30%,#d4a010 50%,#a07010 70%,#5c3e00 100%)'
const G_RED_BTN  = 'linear-gradient(160deg,#4a0000 0%,#880000 30%,#cc1a1a 50%,#880000 70%,#4a0000 100%)'
const G_METAL    = 'linear-gradient(to bottom,#3a3020,#2a2010,#1e1808)'
const G_DOME     = 'radial-gradient(circle at 42% 38%,#1e1b30 0%,#100d1a 60%,#080510 100%)'

// ── キャプセルの色 ──
const CAPS = [
  { grad:'radial-gradient(circle at 38% 35%,#8a9090,#3a4040)', border:'#6a8080', label:'100pt'       },
  { grad:'radial-gradient(circle at 38% 35%,#5090e0,#0a2060)', border:'#4080c0', label:'1,000pt'     },
  { grad:'radial-gradient(circle at 38% 35%,#c060e0,#4a0880)', border:'#a040c0', label:'5,000pt'     },
  { grad:'radial-gradient(circle at 38% 35%,#f8c030,#7a5000)', border:'#d4a020', label:'10,000\nINMU'},
]

// ── インムくんの配置（拍手演出）──
const MASCOT_POSITIONS = [
  { w: 96, style: { bottom: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }, delay: 0   },
  { w: 72, style: { bottom: 0, left: 16,  zIndex: 8  }, delay: 180 },
  { w: 72, style: { bottom: 0, right: 16, zIndex: 8  }, delay: 360 },
  { w: 56, style: { bottom: 60, left: 30, zIndex: 7  }, delay: 540 },
  { w: 56, style: { bottom: 60, right: 30,zIndex: 7  }, delay: 720 },
]

export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts, setPts] = useState(0)
  const [ptsLoading, setPtsLoading] = useState(true)
  const [phase, setPhase] = useState<GachaPhase>('idle')
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const [revealIdx, setRevealIdx] = useState(0)
  const [history, setHistory] = useState<GachaHistoryRow[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── ポイント残高を直接取得（useAuthはmonthlyPointsを含まないため）──
  const loadPoints = useCallback(async () => {
    try {
      const r = await fetch('/api/profile', { credentials: 'include' })
      if (r.ok) {
        const d = await r.json() as { monthlyPoints?: string | number }
        setPts(Number(d.monthlyPoints ?? 0))
      }
    } catch { /* ignore */ } finally {
      setPtsLoading(false)
    }
  }, [])

  useEffect(() => { loadPoints() }, [loadPoints])

  function clearTimer() { if (timer.current) clearTimeout(timer.current) }
  function after(ms: number, next: GachaPhase) {
    clearTimer()
    timer.current = setTimeout(() => setPhase(next), ms)
  }
  useEffect(() => () => clearTimer(), [])

  useEffect(() => {
    if (phase === 'guaranteed') after(PHASE_DURATION.guaranteed!, 'inserting')
    else if (phase === 'inserting') after(PHASE_DURATION.inserting!, 'spinning')
    else if (phase === 'spinning')  after(PHASE_DURATION.spinning!, 'capsule')
    else if (phase === 'capsule')   after(PHASE_DURATION.capsule!, 'opening')
    else if (phase === 'opening')   after(PHASE_DURATION.opening!, 'done')
  }, [phase])

  useEffect(() => {
    if (phase === 'done' && spinResult && spinResult.results.length > 1 && revealIdx < spinResult.results.length) {
      const t = setTimeout(() => setRevealIdx(i => i + 1), 150)
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
    loadPoints()
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
        @keyframes g-float   { 0%,100%{transform:translateY(0)}           50%{transform:translateY(-9px)} }
        @keyframes g-spin    { from{transform:rotate(0deg)}                to{transform:rotate(720deg)} }
        @keyframes g-clap    { 0%,100%{transform:translateY(0)scale(1)}   35%{transform:translateY(-18px)scale(1.08)} 70%{transform:translateY(-7px)scale(1.03)} }
        @keyframes g-popin   { 0%{transform:scale(0)rotate(-18deg);opacity:0} 65%{transform:scale(1.18)rotate(4deg);opacity:1} 100%{transform:scale(1)rotate(0);opacity:1} }
        @keyframes g-handup  { 0%{transform:translateY(0)scale(1);opacity:1} 100%{transform:translateY(-52px)scale(1.4);opacity:0} }
        @keyframes g-drop    { 0%{transform:translateY(-90px)rotate(0deg);opacity:0} 65%{transform:translateY(6px)rotate(200deg);opacity:1} 100%{transform:translateY(0)rotate(360deg);opacity:1} }
        @keyframes g-pop     { 0%{transform:scale(0)translateY(18px);opacity:0} 65%{transform:scale(1.18)translateY(-4px);opacity:1} 100%{transform:scale(1)translateY(0);opacity:1} }
        @keyframes g-split-t { from{transform:translateY(0)rotate(0)}     to{transform:translateY(-40px)rotate(-14deg)} }
        @keyframes g-split-b { from{transform:translateY(0)rotate(0)}     to{transform:translateY(40px)rotate(14deg)} }
        @keyframes g-reveal  { from{transform:scale(.7)translateY(16px);opacity:0} to{transform:scale(1)translateY(0);opacity:1} }
        @keyframes g-glow    { 0%,100%{box-shadow:0 0 14px 4px rgba(234,179,8,.55)} 50%{box-shadow:0 0 44px 18px rgba(234,179,8,.92)} }
        @keyframes g-card    { from{transform:translateY(12px);opacity:0}  to{transform:translateY(0);opacity:1} }
        @keyframes g-star    { 0%,100%{opacity:.15;transform:scale(.8)}    50%{opacity:1;transform:scale(1.1)} }
        @keyframes g-pulse-g { 0%,100%{text-shadow:0 0 8px rgba(218,165,32,.3)} 50%{text-shadow:0 0 28px rgba(255,215,0,.95),0 0 56px rgba(218,165,32,.5)} }
        @keyframes g-burst   { 0%{opacity:0;transform:scale(.4)}          60%{opacity:1;transform:scale(1.05)} 100%{opacity:1;transform:scale(1)} }
        @keyframes g-sparkle { 0%,100%{opacity:0;transform:scale(0)}      50%{opacity:1;transform:scale(1.35)} }
        .g-float  { animation:g-float  2.6s ease-in-out infinite }
        .g-spin   { animation:g-spin   .48s linear infinite }
        .g-drop   { animation:g-drop   .85s ease-out forwards }
        .g-pop    { animation:g-pop    .5s  cubic-bezier(.3,0,.6,-.5) forwards }
        .g-split-t{ animation:g-split-t .5s ease-out forwards }
        .g-split-b{ animation:g-split-b .5s ease-out forwards }
        .g-reveal { animation:g-reveal .44s ease-out forwards }
        .g-glow   { animation:g-glow   1.3s ease-in-out infinite }
        .g-card   { animation:g-card   .3s  ease-out forwards }
        .g-pulse-g{ animation:g-pulse-g 2s  ease-in-out infinite }
        .g-burst  { animation:g-burst  .5s  ease-out forwards }
      `}</style>

      <div className="flex flex-col min-h-[100dvh]">

        {/* ════════════════════ IDLE ════════════════════ */}
        {phase === 'idle' && (
          <div className="flex flex-col flex-1">

            {/* タイトル */}
            <div className="text-center pt-5 pb-2 px-4">
              <h1 className="text-[22px] font-black tracking-widest g-pulse-g" style={{ color: '#daa520' }}>
                ✦ INMU GACHA ✦
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">INMUコインを投入してガチャを引こう！</p>
            </div>

            {/* ── メインエリア: マシン + 排出率 ── */}
            <div className="flex gap-2 px-3 items-start">

              {/* ガチャマシン */}
              <div className="flex flex-col items-center" style={{ minWidth: 0 }}>

                {/* 上部の金アーチ */}
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 180, height: 22,
                    background: G_GOLD,
                    borderRadius: '50% 50% 0 0',
                    boxShadow: '0 -2px 12px rgba(218,165,32,.5)',
                  }}
                >
                  <span style={{ fontSize: 10, color: '#ffe080', fontWeight: 900, letterSpacing: '0.15em' }}>★★ INMU ★★</span>
                </div>

                {/* ドーム */}
                <div
                  className="relative flex flex-col items-center justify-center overflow-hidden"
                  style={{
                    width: 180, height: 180,
                    background: G_DOME,
                    border: '4px solid #b8860b',
                    borderTop: 'none',
                    boxShadow: '0 0 36px rgba(184,134,11,.45), inset 0 0 50px rgba(0,0,0,.7)',
                  }}
                >
                  {/* 星パーティクル */}
                  {[{x:14,y:16,r:1.6},{x:58,y:10,r:1},{x:148,y:18,r:1.8},{x:162,y:62,r:1.2},
                    {x:10,y:78,r:1.4},{x:155,y:102,r:1.6},{x:22,y:128,r:1},{x:140,y:148,r:1.8},
                    {x:72,y:158,r:1.2},{x:108,y:8,r:1},{x:4,y:46,r:1.4},{x:168,y:140,r:1}
                  ].map((s, i) => (
                    <div key={i} className="absolute rounded-full bg-white"
                      style={{ left:s.x, top:s.y, width:s.r*2, height:s.r*2,
                        animation:`g-star ${1.4+i*.22}s ease-in-out infinite`, animationDelay:`${i*.18}s` }}
                    />
                  ))}

                  {/* ドーム内のキャプセル（小さな球） */}
                  {[
                    {x:18,y:98, c:'radial-gradient(circle at 38% 35%,#aab0b0,#404848)'  ,s:24},
                    {x:46,y:112,c:'radial-gradient(circle at 38% 35%,#7090e0,#0a1860)'  ,s:26},
                    {x:132,y:104,c:'radial-gradient(circle at 38% 35%,#e070e0,#3a0870)' ,s:24},
                    {x:148,y:118,c:'radial-gradient(circle at 38% 35%,#f8c030,#6a4000)' ,s:28},
                    {x:76,y:124,c:'radial-gradient(circle at 38% 35%,#aab0b0,#404848)'  ,s:22},
                    {x:104,y:118,c:'radial-gradient(circle at 38% 35%,#7090e0,#0a1860)' ,s:20},
                  ].map((b, i) => (
                    <div key={i} className="absolute rounded-full"
                      style={{ left:b.x, top:b.y, width:b.s, height:b.s, background:b.c,
                        border:'1.5px solid rgba(255,255,255,.2)', boxShadow:'inset 0 2px 4px rgba(255,255,255,.3)' }}
                    />
                  ))}

                  {/* コインイメージ（中央に浮かぶ） */}
                  <img src={coinImg} alt="INMU Coin"
                    className="g-float rounded-full object-cover"
                    style={{ width:70, height:70, marginTop:-12,
                      border:'3px solid #daa520',
                      boxShadow:'0 0 24px rgba(218,165,32,.8), inset 0 2px 6px rgba(255,255,255,.3)' }}
                  />
                </div>

                {/* マシンボディ */}
                <div className="flex flex-col items-center" style={{ width:160, background:G_METAL, border:'3px solid #b8860b', borderTop:'none' }}>
                  <div className="w-full flex items-center justify-center gap-3 py-1.5"
                    style={{ borderBottom:'1px solid rgba(184,134,11,.35)' }}>
                    <div style={{ width:32, height:20, background:'radial-gradient(circle at 38% 38%,#daa520,#7c5a00)',
                      borderRadius:4, border:'1.5px solid #b8860b', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <img src={coinImg} alt="" style={{ width:16, height:16, borderRadius:'50%', objectFit:'cover' }} />
                    </div>
                    <div>
                      <p style={{ fontSize:8, color:'#b8860b', fontWeight:900, letterSpacing:'0.18em' }}>INSERT COIN</p>
                      <p style={{ fontSize:7, color:'#7c5a00', letterSpacing:'0.1em' }}>INMU COIN ONLY</p>
                    </div>
                  </div>
                  {/* コインドア */}
                  <div className="my-2 flex items-center justify-center" style={{
                    width:56, height:36,
                    background:'radial-gradient(circle at 40% 40%,#c8a050,#7c5a00)',
                    borderRadius:6, border:'2px solid #daa520',
                    boxShadow:'0 0 10px rgba(218,165,32,.4)',
                  }}>
                    <span style={{ fontSize:18 }}>🪙</span>
                  </div>
                </div>

                {/* ベース */}
                <div style={{
                  width:180, height:28,
                  background:'linear-gradient(to bottom,#2a2010,#181008)',
                  border:'3px solid #b8860b', borderTop:'none',
                  borderRadius:'0 0 16px 16px',
                  boxShadow:'0 6px 20px rgba(0,0,0,.6)',
                }} />

                {/* マスコット + 吹き出し */}
                <div className="flex items-end gap-2 mt-2 w-full px-1">
                  <div style={{ flex:1, background:'rgba(20,14,2,.85)', border:'1px solid rgba(184,134,11,.45)',
                    borderRadius:12, padding:'6px 10px' }}>
                    <p style={{ fontSize:10, color:'#f5deb3', lineHeight:1.5 }}>何が出るかな？<br/>ワクワクするね！</p>
                  </div>
                  <img src={mascotImg} alt="インムくん" className="rounded-full object-cover flex-shrink-0"
                    style={{ width:52, height:52, border:'2px solid rgba(184,134,11,.6)',
                      boxShadow:'0 0 12px rgba(184,134,11,.35)' }} />
                </div>
              </div>

              {/* 排出率バナー */}
              <div className="flex flex-col" style={{ minWidth:88, paddingTop:4 }}>
                <div className="flex items-center justify-center mb-2 py-1 px-2 rounded"
                  style={{ background:'linear-gradient(135deg,#2a1a00,#3a2800)', border:'1px solid rgba(184,134,11,.5)' }}>
                  <p style={{ fontSize:10, color:'#daa520', fontWeight:900, letterSpacing:'0.1em' }}>★ 排出率 ★</p>
                </div>
                {[
                  { dot:'#8a9090', label:'100pt',       rate:'88%' },
                  { dot:'#5090e0', label:'1,000pt',     rate:'8%'  },
                  { dot:'#c060e0', label:'5,000pt',     rate:'3%'  },
                  { dot:'#f8c030', label:'10,000\nINMU',rate:'1%'  },
                ].map(({ dot, label, rate }) => (
                  <div key={label} className="flex items-center gap-1.5 mb-2">
                    <div className="flex-shrink-0 rounded-full" style={{
                      width:14, height:14,
                      background:`radial-gradient(circle at 38% 35%,#ffffffcc,${dot})`,
                      border:'1.5px solid rgba(255,255,255,.25)',
                      boxShadow:`0 0 5px ${dot}99`,
                    }} />
                    <div className="flex flex-col leading-tight">
                      {label.split('\n').map((l, i) => (
                        <span key={i} style={{ fontSize:9, color:'#e0d0b0' }}>{l}</span>
                      ))}
                    </div>
                    <span style={{ fontSize:10, fontFamily:'monospace', color:'#daa520', fontWeight:700, marginLeft:'auto' }}>
                      {rate}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* カプセルデザイン */}
            <div className="px-4 mt-3">
              <p style={{ fontSize:9, color:'#666', textAlign:'center', marginBottom:6 }}>カプセルデザイン（例）</p>
              <div className="flex gap-2 justify-center">
                {CAPS.map(c => (
                  <div key={c.label} className="flex flex-col items-center gap-1">
                    <div className="rounded-full" style={{
                      width:38, height:38,
                      background:c.grad,
                      border:`2px solid ${c.border}`,
                      boxShadow:`0 0 8px ${c.border}66`,
                    }} />
                    {c.label.split('\n').map((l, i) => (
                      <p key={i} style={{ fontSize:8, color:'#888', lineHeight:1.2, textAlign:'center' }}>{l}</p>
                    ))}
                  </div>
                ))}
              </div>
              <p style={{ fontSize:8, color:'#555', textAlign:'center', marginTop:4 }}>
                ※カプセルの色は演出イメージです
              </p>
            </div>

            <div className="flex-1" />

            {/* 保有ポイント表示バー */}
            <div className="mx-4 mb-3 flex items-center justify-between px-4 py-3 rounded-xl" style={{
              background:'linear-gradient(135deg,#1a1200,#2a1e00,#1a1200)',
              border:'1.5px solid rgba(184,134,11,.55)',
              boxShadow:'0 0 16px rgba(184,134,11,.15)',
            }}>
              <div className="flex items-center gap-2">
                <img src={coinImg} alt="" className="w-6 h-6 rounded-full object-cover" />
                <span style={{ fontSize:12, color:'#c8a060', fontWeight:600 }}>保有ポイント</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:18, color:'#ffd700',
                  textShadow:'0 0 12px rgba(255,215,0,.5)' }}>
                  {ptsLoading ? '---' : pts.toLocaleString()} pt
                </span>
                <ChevronRight className="size-4" style={{ color:'#b8860b' }} />
              </div>
            </div>

            {/* ボタン */}
            <div className="flex gap-3 px-4 pb-5">
              <button
                onClick={() => spin('single')}
                disabled={pts < 1000 || ptsLoading}
                className="flex-1 flex flex-col items-center justify-center py-3.5 rounded-xl transition-transform active:scale-95 disabled:opacity-40"
                style={{
                  background: pts >= 1000 && !ptsLoading ? G_GOLD_BTN : '#2a2a2a',
                  border:'2px solid rgba(218,165,32,.75)',
                  boxShadow: pts >= 1000 && !ptsLoading
                    ? '0 4px 20px rgba(184,134,11,.45),inset 0 1px 0 rgba(255,255,255,.18)'
                    : 'none',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <img src={coinImg} alt="" className="w-5 h-5 rounded-full object-cover" />
                  <span style={{ fontWeight:900, fontSize:14, color:'#fff8e1',
                    textShadow:'0 1px 4px rgba(0,0,0,.7)' }}>1連ガチャ</span>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,248,225,.8)', marginTop:2 }}>
                  1,000 pt
                </span>
              </button>

              <button
                onClick={() => spin('multi')}
                disabled={pts < 10000 || ptsLoading}
                className="flex-1 flex flex-col items-center justify-center py-3.5 rounded-xl transition-transform active:scale-95 disabled:opacity-40"
                style={{
                  background: pts >= 10000 && !ptsLoading ? G_RED_BTN : '#2a2a2a',
                  border:'2px solid rgba(185,28,28,.75)',
                  boxShadow: pts >= 10000 && !ptsLoading
                    ? '0 4px 20px rgba(185,28,28,.45),inset 0 1px 0 rgba(255,255,255,.18)'
                    : 'none',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <img src={coinImg} alt="" className="w-5 h-5 rounded-full object-cover" />
                  <span style={{ fontWeight:900, fontSize:14, color:'#fff8f8',
                    textShadow:'0 1px 4px rgba(0,0,0,.7)' }}>10連ガチャ</span>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,248,248,.8)', marginTop:2 }}>
                  10,000 pt
                </span>
              </button>
            </div>

            {pts < 1000 && !ptsLoading && (
              <p className="text-center text-xs text-muted-foreground pb-4 -mt-2">
                ミッションをクリアしてポイントを貯めよう！
              </p>
            )}
          </div>
        )}

        {/* ════════════════════ ANIMATION PHASES ════════════════════ */}
        {phase !== 'idle' && (
          <div className="flex flex-col flex-1 items-center justify-center px-4 py-6 gap-5">

            {/* ヘッダー（アニメ中） */}
            <div className="self-stretch flex items-center justify-between">
              <div>
                <h1 style={{ fontSize:15, fontWeight:900, color:'#daa520' }}>✦ INMU GACHA ✦</h1>
                <p className="text-xs text-muted-foreground">
                  所持: <span style={{ fontWeight:700, color:'#ffd700' }}>{pts.toLocaleString()} pt</span>
                </p>
              </div>
              {phase === 'done' && (
                <Button variant="outline" size="sm" onClick={reset} className="gap-1 text-xs h-8">
                  <RefreshCw className="size-3" />もう一度
                </Button>
              )}
            </div>

            {/* ══ 確定演出：インムくんが複数登場して拍手 ══ */}
            {phase === 'guaranteed' && (
              <div className="flex flex-col items-center gap-4 w-full">
                {/* 背景グロー */}
                <div className="relative flex items-end justify-center w-full" style={{ height: 200 }}>
                  {/* 光の爆発 */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {[0,1,2].map(i => (
                      <div key={i} className="absolute rounded-full"
                        style={{
                          width: 80 + i * 60, height: 80 + i * 60,
                          background: 'rgba(218,165,32,0.06)',
                          border: `1px solid rgba(218,165,32,${0.25 - i * 0.07})`,
                          animation: `g-pulse-g ${1.2 + i * 0.4}s ease-in-out infinite`,
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>

                  {/* 浮かぶ拍手絵文字 */}
                  {[
                    { left:'22%', delay:'0s'   },
                    { left:'38%', delay:'0.3s' },
                    { left:'55%', delay:'0.6s' },
                    { left:'70%', delay:'0.9s' },
                    { left:'12%', delay:'1.2s' },
                  ].map((h, i) => (
                    <div key={i} className="absolute" style={{
                      bottom: 160, left: h.left,
                      fontSize: 18,
                      animation: 'g-handup 1.2s ease-out infinite',
                      animationDelay: h.delay,
                    }}>👏</div>
                  ))}

                  {/* インムくん×5（段階的ポップイン → 拍手アニメ） */}
                  {MASCOT_POSITIONS.map((m, i) => (
                    <div key={i} className="absolute" style={{
                      ...m.style,
                      width: m.w, height: m.w,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: '3px solid #daa520',
                      boxShadow: `0 0 ${i === 0 ? 28 : 16}px rgba(218,165,32,${i === 0 ? .9 : .6})`,
                      animation: `g-popin .45s ease-out ${m.delay}ms both, g-clap .7s ease-in-out ${m.delay + 500}ms infinite`,
                    }}>
                      <img src={mascotImg} alt="インムくん"
                        style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    </div>
                  ))}
                </div>

                {/* テキスト */}
                <div className="g-burst rounded-2xl px-8 py-3 text-center g-glow" style={{
                  background:'linear-gradient(135deg,#3d1f00,#5c3000,#3d1f00)',
                  border:'2px solid #daa520',
                }}>
                  <p style={{ fontWeight:900, fontSize:16, letterSpacing:'0.08em', color:'#ffd700',
                    textShadow:'0 0 20px rgba(255,215,0,.8)' }}>
                    🎊 INMU 確定！ 🎊
                  </p>
                  <div className="flex gap-2 justify-center mt-1.5">
                    {['✦','✧','★','✧','✦'].map((s, i) => (
                      <span key={i} style={{ fontSize:14, color:'#ffd700',
                        animation:`g-sparkle ${0.5 + i*.15}s ease-in-out infinite`,
                        animationDelay:`${i*.11}s` }}>{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══ コイン投入 ══ */}
            {phase === 'inserting' && (
              <div className="flex flex-col items-center gap-4">
                <div className="relative h-64 w-48 flex flex-col items-center">
                  <img src={coinImg} alt="INMU Coin"
                    className="absolute top-0 w-20 h-20 rounded-full object-cover g-drop z-10"
                    style={{ border:'2px solid #daa520', boxShadow:'0 0 20px rgba(218,165,32,.7)' }}
                  />
                  <div className="absolute bottom-0 w-44 h-48 rounded-3xl flex flex-col items-center justify-center gap-2"
                    style={{ background:G_METAL, border:'3px solid #b8860b', boxShadow:'0 0 24px rgba(184,134,11,.3)' }}>
                    <img src={coinImg} alt="" className="w-12 h-12 rounded-full object-cover opacity-40" />
                    <p style={{ fontSize:9, fontWeight:900, letterSpacing:'0.2em', color:'#7c5a00' }}>INMU GACHA</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">コインを投入中…</p>
              </div>
            )}

            {/* ══ 回転 ══ */}
            {phase === 'spinning' && (
              <div className="flex flex-col items-center gap-5">
                <div className="relative flex items-center justify-center">
                  {[200, 160, 120].map((s, i) => (
                    <div key={i} className="absolute rounded-full" style={{
                      width:s, height:s,
                      border:`${2-i}px solid rgba(218,165,32,${.25-i*.07})`,
                      animation:`g-pulse-g ${1.2+i*.3}s ease-in-out infinite`,
                      animationDelay:`${i*.2}s`,
                    }} />
                  ))}
                  <img src={coinImg} alt="INMU Coin"
                    className="w-44 h-44 rounded-full object-cover g-spin relative z-10"
                    style={{ border:'4px solid #daa520', boxShadow:'0 0 44px rgba(218,165,32,.85)' }}
                  />
                </div>
                <p style={{ color:'#ffd700', fontWeight:700, fontSize:13 }} className="animate-pulse tracking-widest">
                  ガチャ回転中…
                </p>
              </div>
            )}

            {/* ══ カプセル出現 / 開放 ══ */}
            {(phase === 'capsule' || phase === 'opening') && (
              <div className="flex flex-col items-center gap-5">
                <div className="relative w-40 h-48 flex flex-col items-center">
                  <div className={`w-40 h-[96px] rounded-t-full ${phase === 'opening' ? 'g-split-t' : 'g-pop'} origin-bottom`}
                    style={{ background:'linear-gradient(to bottom,#d8e0e0,#707880)',
                      border:'2.5px solid rgba(220,230,230,.85)',
                      boxShadow:'inset 0 4px 12px rgba(255,255,255,.35), 0 0 16px rgba(255,255,255,.12)' }}
                  />
                  <div className={`w-40 h-[96px] rounded-b-full ${phase === 'opening' ? 'g-split-b' : ''} origin-top`}
                    style={{ background:'linear-gradient(to top,#505860,#707880)',
                      border:'2.5px solid rgba(160,170,180,.6)' }}
                  />
                  {phase === 'opening' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-24 h-24 rounded-full bg-white/15 animate-ping" />
                      <div className="absolute w-12 h-12 rounded-full bg-white/35 animate-ping"
                        style={{ animationDelay:'150ms' }} />
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">
                  {phase === 'capsule' ? 'カプセルが出てきた…！' : 'カプセルオープン！'}
                </p>
              </div>
            )}

            {/* ══ 結果（1連）══ */}
            {phase === 'done' && spinResult && !isMulti && (
              <div className="g-reveal flex flex-col items-center gap-4 w-full max-w-xs">
                {spinResult.wasGuaranteed && (
                  <p style={{ fontSize:12, fontWeight:700, color:'#ffd700' }} className="animate-pulse">
                    ✨ 確定演出が発動しました！
                  </p>
                )}
                {spinResult.results.map((prize, i) => {
                  const st = PRIZE_STYLE[prize.prizeId] ?? PRIZE_STYLE.pts100
                  const isInmu = prize.type === 'inmu'
                  return (
                    <div key={i} className={`w-full rounded-2xl border-2 p-6 text-center ${st.bg} ${st.border} ${isInmu ? 'g-glow' : ''}`}>
                      {isInmu && <p className="text-5xl mb-3" style={{ filter:'drop-shadow(0 0 14px gold)' }}>🏆</p>}
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
                  <p style={{ fontSize:14, fontWeight:700, color:'#ffd700' }}>
                    +{spinResult.totalPoints.toLocaleString()} pt を獲得しました！
                  </p>
                )}
              </div>
            )}

            {/* ══ 結果（10連グリッド）══ */}
            {phase === 'done' && spinResult && isMulti && (
              <div className="g-reveal flex flex-col gap-3 w-full max-w-xs">
                {spinResult.wasGuaranteed && (
                  <p style={{ fontSize:12, fontWeight:700, color:'#ffd700', textAlign:'center' }} className="animate-pulse">
                    ✨ 確定演出が発動しました！
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {spinResult.results.map((prize, i) => {
                    const st = PRIZE_STYLE[prize.prizeId] ?? PRIZE_STYLE.pts100
                    const isInmu = prize.type === 'inmu'
                    return (
                      <div key={i} className={`rounded-xl border-2 p-3 text-center ${st.bg} ${st.border} ${isInmu ? 'g-glow' : ''} ${i < revealIdx ? 'g-card' : 'opacity-0'}`}>
                        {isInmu && <p className="text-2xl">🏆</p>}
                        <p className={`font-bold text-sm ${st.text}`}>{prize.label}</p>
                      </div>
                    )
                  })}
                </div>
                {spinResult.totalPoints > 0 && (
                  <p style={{ fontSize:12, color:'#ffd700', textAlign:'center', fontWeight:700 }}>
                    合計 +{spinResult.totalPoints.toLocaleString()} pt 獲得！
                  </p>
                )}
                {spinResult.hasInmu && (
                  <p style={{ fontSize:12, color:'#fde68a', textAlign:'center' }}>
                    🏆 10,000 INMU 当選！後日運営より送金されます
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════ ガチャ履歴 ════════════════════ */}
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
                : <ChevronRight className="size-4 text-muted-foreground" />}
            </button>
            {historyOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {history.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">ガチャ履歴がありません</p>
                )}
                {history.map(row => (
                  <Card key={row.id} className="p-3 border-border bg-card">
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
                      {new Date(row.createdAt).toLocaleDateString('ja-JP', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
                      {' — '}消費 {row.costPoints.toLocaleString()}pt
                      {row.totalPoints > 0 && ` / 獲得 +${row.totalPoints.toLocaleString()}pt`}
                    </p>
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
