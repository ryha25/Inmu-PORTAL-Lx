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
type PrizeResult = { prizeId: string; label: string; type: 'points' | 'inmu'; amount: number }
type SpinResult = {
  results: PrizeResult[]; totalPoints: number; hasInmu: boolean; inmuCount: number
  wasGuaranteed: boolean; costPoints: number; newPoints: number
}
type GachaHistoryRow = {
  id: number; pullType: string; results: PrizeResult[]; totalPoints: number; hasInmu: boolean
  inmuCount: number; inmuSentStatus: string; wasGuaranteed: boolean; costPoints: number; createdAt: string
}

const PRIZE_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  pts100:  { bg: 'bg-slate-800',  border: 'border-slate-500',  text: 'text-white'      },
  pts1000: { bg: 'bg-blue-950',   border: 'border-blue-400',   text: 'text-blue-200'   },
  pts5000: { bg: 'bg-purple-950', border: 'border-purple-400', text: 'text-purple-200' },
  inmu10k: { bg: 'bg-amber-950',  border: 'border-yellow-400', text: 'text-yellow-300' },
}

const PHASE_DUR: Partial<Record<GachaPhase, number>> = {
  guaranteed: 3200, inserting: 1000, spinning: 1800, capsule: 900, opening: 700,
}

const GOLD    = 'linear-gradient(160deg,#7c5a00,#b8860b 25%,#daa520 50%,#b8860b 75%,#7c5a00)'
const GOLD_BTN= 'linear-gradient(160deg,#5c3e00,#a07010 30%,#d4a010 50%,#a07010 70%,#5c3e00)'
const RED_BTN = 'linear-gradient(160deg,#4a0000,#880000 30%,#cc1a1a 50%,#880000 70%,#4a0000)'
const METAL   = 'linear-gradient(to bottom,#3a3020,#2a2010,#1e1808)'
const DOME_BG = 'radial-gradient(circle at 42% 38%,#1e1b30 0%,#100d1a 60%,#080510 100%)'
const SPACE_BG= 'radial-gradient(ellipse at 50% 30%,#1a0838 0%,#0d0520 40%,#050210 100%)'

const MASCOT_POSITIONS = [
  { w:96, style:{bottom:0,left:'50%',transform:'translateX(-50%)',zIndex:10}, delay:0   },
  { w:72, style:{bottom:0,left:16,zIndex:8},  delay:180 },
  { w:72, style:{bottom:0,right:16,zIndex:8}, delay:360 },
  { w:56, style:{bottom:60,left:30,zIndex:7}, delay:540 },
  { w:56, style:{bottom:60,right:30,zIndex:7},delay:720 },
]

// ── 右パネル：アニメ背景イメージ ──
function AnimPreviewPanel() {
  return (
    <div className="relative overflow-hidden rounded-xl flex flex-col items-center justify-center" style={{
      height:120, background:SPACE_BG,
      border:'1.5px solid rgba(184,134,11,.5)',
      boxShadow:'inset 0 0 30px rgba(100,0,200,.3)',
    }}>
      {/* 星 */}
      {[{x:'12%',y:'18%',s:1.4},{x:'82%',y:'12%',s:1},{x:'8%',y:'72%',s:1.2},{x:'88%',y:'68%',s:1.6},
        {x:'44%',y:'8%',s:1},{x:'55%',y:'82%',s:1.2},{x:'28%',y:'60%',s:1},{x:'72%',y:'30%',s:1.4}
      ].map((s,i)=>(
        <div key={i} className="absolute rounded-full bg-white"
          style={{left:s.x,top:s.y,width:s.s*2,height:s.s*2,
            animation:`g-star ${1.3+i*.2}s ease-in-out infinite`,animationDelay:`${i*.14}s`}} />
      ))}
      {/* 光柱 */}
      <div className="absolute inset-0 flex items-start justify-center pointer-events-none">
        <div style={{
          width:70,height:'100%',marginTop:0,
          background:'radial-gradient(ellipse at 50% 0%,rgba(255,200,50,.35) 0%,rgba(180,100,255,.15) 40%,transparent 85%)',
        }} />
      </div>
      {/* 回転リング（床面） */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2" style={{
        width:80,height:18,borderRadius:'50%',
        border:'1.5px solid rgba(218,165,32,.5)',
        boxShadow:'0 0 12px rgba(218,165,32,.3), inset 0 0 8px rgba(218,165,32,.1)',
      }} />
      {/* 浮かぶキャプセル球 */}
      {[
        {c:'radial-gradient(circle at 35% 32%,#f8c030,#7a5000)',s:16,x:'18%',y:'15%',d:'0s'},
        {c:'radial-gradient(circle at 35% 32%,#c060e0,#4a0880)',s:13,x:'76%',y:'22%',d:'.4s'},
        {c:'radial-gradient(circle at 35% 32%,#5090e0,#0a2060)',s:14,x:'68%',y:'60%',d:'.7s'},
        {c:'radial-gradient(circle at 35% 32%,#aab0b0,#404848)',s:11,x:'25%',y:'56%',d:'1s'},
      ].map((b,i)=>(
        <div key={i} className="absolute rounded-full" style={{
          left:b.x,top:b.y,width:b.s,height:b.s,background:b.c,
          border:'1px solid rgba(255,255,255,.2)',
          animation:`g-float ${1.8+i*.3}s ease-in-out infinite`,animationDelay:b.d,
        }} />
      ))}
      {/* INMUロゴ */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap"
        style={{fontWeight:900,fontSize:12,letterSpacing:'0.25em',color:'#daa520',
          textShadow:'0 0 12px rgba(255,215,0,.8)',fontFamily:'serif'}}>
        INMU
      </div>
    </div>
  )
}

// ── 右パネル：カプセル結果イメージ ──
function CapsulePreviewPanel() {
  return (
    <div className="relative overflow-hidden rounded-xl" style={{
      background:'radial-gradient(ellipse at 30% 40%,#120e00 0%,#080500 100%)',
      border:'1.5px solid rgba(184,134,11,.5)',
      padding:'8px 8px 6px',
    }}>
      <div className="flex items-center gap-2">
        {/* キャプセル */}
        <div className="flex flex-col items-center flex-shrink-0">
          {/* 上半球 */}
          <div style={{
            width:46,height:23,
            background:'radial-gradient(ellipse at 42% 35%,#f8e060,#c8900a)',
            borderRadius:'50% 50% 0 0',
            border:'1.5px solid #daa520',
            boxShadow:'0 -2px 10px rgba(218,165,32,.6),inset 0 3px 6px rgba(255,255,255,.3)',
          }} />
          {/* 下半球 */}
          <div style={{
            width:46,height:23,
            background:'radial-gradient(ellipse at 42% 65%,#c8800a,#7a4a00)',
            borderRadius:'0 0 50% 50%',
            border:'1.5px solid #b8760a',
            boxShadow:'0 4px 10px rgba(0,0,0,.5)',
          }} />
          {/* 賞テキスト */}
          <div className="mt-1 px-2 py-0.5 rounded text-center" style={{
            background:'linear-gradient(135deg,#3d2000,#5c3200)',
            border:'1px solid #daa520',
          }}>
            <p style={{fontSize:8,fontWeight:900,color:'#ffd700',lineHeight:1.2}}>10,000</p>
            <p style={{fontSize:8,fontWeight:900,color:'#ffd700',lineHeight:1.2}}>INMU</p>
          </div>
        </div>
        {/* マスコット */}
        <img src={mascotImg} alt="インムくん"
          style={{width:42,height:42,borderRadius:'50%',objectFit:'cover',
            border:'1.5px solid rgba(184,134,11,.5)',flexShrink:0}} />
      </div>
      {/* おめでとうテキスト */}
      <div className="mt-1.5">
        <p style={{fontWeight:900,fontSize:11,color:'#ffd700',
          textShadow:'0 0 10px rgba(255,215,0,.7)'}}>おめでとうございます！</p>
        <p style={{fontSize:8,color:'rgba(253,230,138,.7)',marginTop:1}}>報酬は後日送付されます。</p>
      </div>
    </div>
  )
}

export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts, setPts]           = useState(0)
  const [ptsLoading, setPtsLoading] = useState(true)
  const [phase, setPhase]       = useState<GachaPhase>('idle')
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)
  const [revealIdx, setRevealIdx]   = useState(0)
  const [history, setHistory]   = useState<GachaHistoryRow[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── ポイント残高（useAuthはmonthlyPointsを含まないため直接fetchする）──
  const loadPoints = useCallback(async () => {
    try {
      const r = await fetch('/api/profile', { credentials:'include' })
      if (r.ok) {
        const d = await r.json() as { monthlyPoints?: string|number }
        setPts(Number(d.monthlyPoints ?? 0))
      }
    } catch { /* ignore */ } finally { setPtsLoading(false) }
  }, [])

  useEffect(() => { loadPoints() }, [loadPoints])

  function clearTimer() { if (timer.current) clearTimeout(timer.current) }
  function after(ms: number, next: GachaPhase) {
    clearTimer()
    timer.current = setTimeout(() => setPhase(next), ms)
  }
  useEffect(() => () => clearTimer(), [])

  useEffect(() => {
    if (phase === 'guaranteed') after(PHASE_DUR.guaranteed!, 'inserting')
    else if (phase === 'inserting') after(PHASE_DUR.inserting!, 'spinning')
    else if (phase === 'spinning')  after(PHASE_DUR.spinning!, 'capsule')
    else if (phase === 'capsule')   after(PHASE_DUR.capsule!, 'opening')
    else if (phase === 'opening')   after(PHASE_DUR.opening!, 'done')
  }, [phase])

  useEffect(() => {
    if (phase === 'done' && spinResult && spinResult.results.length > 1 && revealIdx < spinResult.results.length) {
      const t = setTimeout(() => setRevealIdx(i => i + 1), 150)
      return () => clearTimeout(t)
    }
  }, [phase, spinResult, revealIdx])

  async function spin(type: 'single'|'multi') {
    if (phase !== 'idle') return
    const cost = type === 'multi' ? 10000 : 1000
    if (pts < cost) {
      toast.error(`ポイント不足（必要: ${cost.toLocaleString()}pt / 所持: ${pts.toLocaleString()}pt）`)
      return
    }
    try {
      const res = await fetch('/api/gacha/spin', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type }),
      })
      if (!res.ok) {
        const err = await res.json().catch(()=>({})) as { error?: string }
        throw new Error(err.error ?? '通信エラー')
      }
      const result = await res.json() as SpinResult
      setSpinResult(result); setRevealIdx(0)
      setPts(result.newPoints)
      if (result.wasGuaranteed) setPhase('guaranteed')
      else setPhase('inserting')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'エラーが発生しました') }
  }

  function reset() { clearTimer(); setPhase('idle'); setSpinResult(null); setRevealIdx(0); loadPoints() }

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/gacha/history', { credentials:'include' })
      const d = await r.json() as GachaHistoryRow[]
      setHistory(Array.isArray(d) ? d : [])
    } catch { toast.error('履歴の取得に失敗しました') }
  }, [])
  useEffect(() => { loadHistory() }, [loadHistory])

  const isMulti = (spinResult?.results.length ?? 0) > 1

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <style>{`
        @keyframes g-float  { 0%,100%{transform:translateY(0)}           50%{transform:translateY(-8px)} }
        @keyframes g-star   { 0%,100%{opacity:.12;transform:scale(.8)}   50%{opacity:1;transform:scale(1.15)} }
        @keyframes g-spin   { from{transform:rotate(0deg)} to{transform:rotate(720deg)} }
        @keyframes g-clap   { 0%,100%{transform:translateY(0)scale(1)}   35%{transform:translateY(-18px)scale(1.08)} 70%{transform:translateY(-7px)scale(1.03)} }
        @keyframes g-popin  { 0%{transform:scale(0)rotate(-18deg);opacity:0} 65%{transform:scale(1.18)rotate(4deg);opacity:1} 100%{transform:scale(1)rotate(0);opacity:1} }
        @keyframes g-handup { 0%{transform:translateY(0)scale(1);opacity:1} 100%{transform:translateY(-52px)scale(1.4);opacity:0} }
        @keyframes g-drop   { 0%{transform:translateY(-80px)rotate(0deg);opacity:0} 65%{transform:translateY(5px)rotate(200deg);opacity:1} 100%{transform:translateY(0)rotate(360deg);opacity:1} }
        @keyframes g-pop    { 0%{transform:scale(0)translateY(16px);opacity:0} 65%{transform:scale(1.18)translateY(-4px);opacity:1} 100%{transform:scale(1)translateY(0);opacity:1} }
        @keyframes g-split-t{ from{transform:translateY(0)rotate(0)} to{transform:translateY(-38px)rotate(-13deg)} }
        @keyframes g-split-b{ from{transform:translateY(0)rotate(0)} to{transform:translateY(38px)rotate(13deg)} }
        @keyframes g-reveal { from{transform:scale(.7)translateY(14px);opacity:0} to{transform:scale(1)translateY(0);opacity:1} }
        @keyframes g-glow   { 0%,100%{box-shadow:0 0 14px 4px rgba(234,179,8,.55)} 50%{box-shadow:0 0 44px 18px rgba(234,179,8,.92)} }
        @keyframes g-card   { from{transform:translateY(10px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes g-pulse-g{ 0%,100%{text-shadow:0 0 8px rgba(218,165,32,.3)} 50%{text-shadow:0 0 28px rgba(255,215,0,.95),0 0 56px rgba(218,165,32,.5)} }
        @keyframes g-burst  { 0%{opacity:0;transform:scale(.4)} 60%{opacity:1;transform:scale(1.05)} 100%{opacity:1;transform:scale(1)} }
        @keyframes g-sparkle{ 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1.35)} }
        @keyframes g-ring   { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.5);opacity:0} }
        .g-float  { animation:g-float  2.6s ease-in-out infinite }
        .g-spin   { animation:g-spin   .48s linear infinite }
        .g-pop    { animation:g-pop    .5s  cubic-bezier(.3,0,.6,-.5) forwards }
        .g-drop   { animation:g-drop   .85s ease-out forwards }
        .g-split-t{ animation:g-split-t .5s ease-out forwards }
        .g-split-b{ animation:g-split-b .5s ease-out forwards }
        .g-reveal { animation:g-reveal .44s ease-out forwards }
        .g-glow   { animation:g-glow   1.3s ease-in-out infinite }
        .g-card   { animation:g-card   .3s  ease-out forwards }
        .g-pulse-g{ animation:g-pulse-g 2s  ease-in-out infinite }
        .g-burst  { animation:g-burst  .5s  ease-out forwards }
      `}</style>

      <div className="flex flex-col min-h-[100dvh]" style={{background:'#060411'}}>

        {/* ══════════════════ IDLE ══════════════════ */}
        {phase === 'idle' && (
          <div className="flex flex-col flex-1">

            {/* タイトル */}
            <div className="text-center pt-4 pb-1 px-4">
              <h1 className="g-pulse-g" style={{
                fontSize:22,fontWeight:900,letterSpacing:'0.12em',color:'#daa520',fontFamily:'serif',
              }}>✦ INMU GACHA ✦</h1>
              <p style={{fontSize:10,color:'rgba(255,255,255,.65)',marginTop:2}}>
                INMUコインを投入してガチャを引こう！
              </p>
            </div>

            {/* ── メインエリア ── */}
            <div className="flex gap-2 px-2">

              {/* ── 左：ガチャマシン ── */}
              <div className="flex flex-col items-center relative" style={{width:190,flexShrink:0}}>

                {/* アーチ上部 */}
                <div style={{
                  width:182,height:24,
                  background:GOLD,
                  borderRadius:'50% 50% 0 0',
                  boxShadow:'0 -3px 14px rgba(218,165,32,.55)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                }}>
                  <span style={{fontSize:10,color:'#ffe080',fontWeight:900,letterSpacing:'0.18em'}}>★★ INMU ★★</span>
                </div>

                {/* ドーム */}
                <div className="relative flex flex-col items-center justify-center overflow-hidden" style={{
                  width:182,height:182,
                  background:DOME_BG,
                  border:'4px solid #b8860b',
                  borderTop:'none',
                  boxShadow:'0 0 40px rgba(184,134,11,.5), inset 0 0 60px rgba(0,0,0,.8)',
                }}>
                  {/* 星パーティクル */}
                  {[{x:16,y:18},{x:60,y:10},{x:148,y:20},{x:162,y:65},
                    {x:10,y:82},{x:156,y:106},{x:22,y:134},{x:142,y:152},
                    {x:74,y:162},{x:108,y:8},{x:6,y:48},{x:168,y:42},
                  ].map((s,i)=>(
                    <div key={i} className="absolute rounded-full bg-white"
                      style={{left:s.x,top:s.y,width:2.2,height:2.2,
                        animation:`g-star ${1.4+i*.22}s ease-in-out infinite`,animationDelay:`${i*.18}s`}} />
                  ))}

                  {/* 中央コイン（浮遊） */}
                  <img src={coinImg} alt="INMU Coin" className="g-float rounded-full object-cover relative z-10"
                    style={{width:72,height:72,marginTop:-16,
                      border:'3px solid #daa520',
                      boxShadow:'0 0 28px rgba(218,165,32,.85), inset 0 2px 6px rgba(255,255,255,.3)'}} />

                  {/* 内部キャプセル球 */}
                  {[
                    {x:14, y:100,c:'radial-gradient(circle at 35% 32%,#b0b8b8,#404848)',s:26},
                    {x:44, y:118,c:'radial-gradient(circle at 35% 32%,#6090e0,#0a1860)',s:24},
                    {x:130,y:108,c:'radial-gradient(circle at 35% 32%,#d060e0,#380870)',s:26},
                    {x:148,y:122,c:'radial-gradient(circle at 35% 32%,#f8c030,#6a4000)',s:28},
                    {x:80, y:128,c:'radial-gradient(circle at 35% 32%,#b0b8b8,#404848)',s:22},
                    {x:106,y:124,c:'radial-gradient(circle at 35% 32%,#6090e0,#0a1860)',s:20},
                  ].map((b,i)=>(
                    <div key={i} className="absolute rounded-full" style={{
                      left:b.x,top:b.y,width:b.s,height:b.s,background:b.c,
                      border:'1.5px solid rgba(255,255,255,.22)',
                      boxShadow:'inset 0 2px 4px rgba(255,255,255,.3)',
                    }} />
                  ))}

                  {/* 1114514 ドーム内テキスト */}
                  <p className="absolute" style={{
                    top:32,left:'50%',transform:'translateX(-50%)',
                    fontSize:9,fontWeight:700,letterSpacing:'0.2em',
                    color:'rgba(218,165,32,.55)',fontFamily:'monospace',whiteSpace:'nowrap',
                  }}>1114514</p>
                </div>

                {/* ボディ（レバー付き） */}
                <div className="relative flex flex-col items-center" style={{
                  width:156,background:METAL,
                  border:'3px solid #b8860b',borderTop:'none',
                }}>
                  <div style={{borderBottom:'1px solid rgba(184,134,11,.35)',width:'100%',padding:'5px 0',
                    display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                    <div style={{
                      width:28,height:18,
                      background:'radial-gradient(circle at 38% 38%,#daa520,#7c5a00)',
                      borderRadius:3,border:'1px solid #b8860b',
                      display:'flex',alignItems:'center',justifyContent:'center',
                    }}>
                      <img src={coinImg} alt="" style={{width:14,height:14,borderRadius:'50%',objectFit:'cover'}} />
                    </div>
                    <div>
                      <p style={{fontSize:7,color:'#b8860b',fontWeight:900,letterSpacing:'0.18em'}}>INSERT COIN</p>
                      <p style={{fontSize:6,color:'#7c5a00',letterSpacing:'0.1em'}}>INMU COIN ONLY</p>
                    </div>
                  </div>
                  {/* コインドア */}
                  <div className="my-2 flex items-center justify-center" style={{
                    width:52,height:34,
                    background:'radial-gradient(circle at 40% 40%,#c8a050,#7c5a00)',
                    borderRadius:6,border:'2px solid #daa520',
                    boxShadow:'0 0 12px rgba(218,165,32,.4)',
                  }}>
                    <span style={{fontSize:16}}>🪙</span>
                  </div>

                  {/* レバー（右側に突き出す） */}
                  <div className="absolute flex flex-col items-center" style={{right:-18,top:4}}>
                    {/* 球 */}
                    <div style={{
                      width:14,height:14,borderRadius:'50%',
                      background:'radial-gradient(circle at 38% 35%,#daa520,#7c5a00)',
                      border:'1.5px solid #b8860b',
                      boxShadow:'0 0 8px rgba(218,165,32,.5)',
                    }} />
                    {/* 腕 */}
                    <div style={{
                      width:5,height:32,
                      background:GOLD,
                      borderRadius:3,
                    }} />
                    {/* 台座 */}
                    <div style={{
                      width:12,height:8,
                      background:'linear-gradient(to bottom,#b8860b,#7c5a00)',
                      borderRadius:2,
                    }} />
                  </div>
                </div>

                {/* ベース */}
                <div style={{
                  width:182,height:26,
                  background:'linear-gradient(to bottom,#2a2010,#181008)',
                  border:'3px solid #b8860b',borderTop:'none',
                  borderRadius:'0 0 14px 14px',
                  boxShadow:'0 6px 22px rgba(0,0,0,.7)',
                }} />

                {/* マスコット + 吹き出し */}
                <div className="flex items-end gap-2 mt-1 w-full pl-1">
                  <img src={mascotImg} alt="インムくん"
                    className="rounded-full object-cover flex-shrink-0"
                    style={{width:56,height:56,
                      border:'2px solid rgba(184,134,11,.65)',
                      boxShadow:'0 0 14px rgba(184,134,11,.4)'}} />
                  <div style={{
                    background:'rgba(20,14,2,.9)',
                    border:'1px solid rgba(184,134,11,.45)',
                    borderRadius:'12px 12px 12px 0',
                    padding:'5px 9px',flex:1,
                  }}>
                    <p style={{fontSize:10,color:'#f5deb3',lineHeight:1.5}}>
                      何が出るかな？<br/>ワクワクするね！
                    </p>
                  </div>
                </div>
              </div>

              {/* ── 右：排出率 + プレビューパネル ── */}
              <div className="flex flex-col gap-2 flex-1 min-w-0">

                {/* 排出率スクロールバナー */}
                <div className="rounded-xl overflow-hidden" style={{
                  background:'linear-gradient(160deg,#1a1200,#2a1a00)',
                  border:'1.5px solid rgba(184,134,11,.6)',
                  boxShadow:'0 0 14px rgba(184,134,11,.2)',
                }}>
                  {/* バナーヘッダー（スターつき） */}
                  <div className="flex items-center justify-center gap-1 py-1.5" style={{
                    background:'linear-gradient(to right,transparent,rgba(184,134,11,.25),transparent)',
                    borderBottom:'1px solid rgba(184,134,11,.35)',
                  }}>
                    <span style={{fontSize:8,color:'#daa520'}}>★</span>
                    <span style={{fontSize:10,fontWeight:900,color:'#daa520',letterSpacing:'0.12em'}}>排出率</span>
                    <span style={{fontSize:8,color:'#daa520'}}>★</span>
                  </div>
                  {/* 排出率行 */}
                  <div className="px-2.5 py-2 flex flex-col gap-2">
                    {[
                      {dot:'radial-gradient(circle at 35% 32%,#b0b8b8,#404848)',dg:'#8a9090',label:'100pt',       rate:'88%'},
                      {dot:'radial-gradient(circle at 35% 32%,#6090e0,#0a1860)',dg:'#5090e0',label:'1,000pt',     rate:'8%' },
                      {dot:'radial-gradient(circle at 35% 32%,#d060e0,#380870)',dg:'#c060e0',label:'5,000pt',     rate:'3%' },
                      {dot:'radial-gradient(circle at 35% 32%,#f8c030,#6a4000)',dg:'#f8c030',label:'10,000\nINMU',rate:'1%' },
                    ].map(({dot,dg,label,rate})=>(
                      <div key={label} className="flex items-center gap-1.5">
                        <div className="flex-shrink-0 rounded-full" style={{
                          width:13,height:13,background:dot,
                          border:'1px solid rgba(255,255,255,.2)',
                          boxShadow:`0 0 6px ${dg}88`,
                        }} />
                        <div className="flex flex-col leading-tight flex-1 min-w-0">
                          {label.split('\n').map((l,i)=>(
                            <span key={i} style={{fontSize:8,color:'#e0d0b0',lineHeight:1.25}}>{l}</span>
                          ))}
                        </div>
                        <span style={{fontFamily:'monospace',fontWeight:700,fontSize:10,color:'#daa520'}}>
                          {rate}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ガチャ演出背景イメージ */}
                <div>
                  <p style={{fontSize:8,color:'rgba(184,134,11,.8)',marginBottom:3,letterSpacing:'0.06em'}}>
                    ガチャ演出背景イメージ
                  </p>
                  <AnimPreviewPanel />
                </div>

                {/* カプセル結果演出イメージ */}
                <div>
                  <p style={{fontSize:8,color:'rgba(184,134,11,.8)',marginBottom:3,letterSpacing:'0.06em'}}>
                    カプセル結果演出イメージ
                  </p>
                  <CapsulePreviewPanel />
                </div>
              </div>
            </div>

            {/* カプセルデザイン凡例 */}
            <div className="px-4 mt-3">
              <p style={{fontSize:9,color:'rgba(255,255,255,.4)',textAlign:'center',marginBottom:6}}>
                カプセルデザイン（例）
              </p>
              <div className="flex gap-2 justify-center">
                {[
                  {g:'radial-gradient(circle at 35% 32%,#b0b8b8,#404848)',b:'#8a9090',  label:'100pt'       },
                  {g:'radial-gradient(circle at 35% 32%,#6090e0,#0a1860)',b:'#5090e0',  label:'1,000pt'     },
                  {g:'radial-gradient(circle at 35% 32%,#d060e0,#380870)',b:'#c060e0',  label:'5,000pt'     },
                  {g:'radial-gradient(circle at 35% 32%,#f8c030,#6a4000)',b:'#f8c030',  label:'10,000\nINMU'},
                ].map(c=>(
                  <div key={c.label} className="flex flex-col items-center gap-1">
                    <div className="rounded-full" style={{
                      width:36,height:36,background:c.g,
                      border:`2px solid ${c.b}`,
                      boxShadow:`0 0 8px ${c.b}66`,
                    }} />
                    {c.label.split('\n').map((l,i)=>(
                      <p key={i} style={{fontSize:7,color:'rgba(255,255,255,.5)',lineHeight:1.2,textAlign:'center'}}>{l}</p>
                    ))}
                  </div>
                ))}
              </div>
              <p style={{fontSize:7,color:'rgba(255,255,255,.3)',textAlign:'center',marginTop:4}}>
                ※カプセルの色は演出イメージです
              </p>
            </div>

            <div className="flex-1" />

            {/* ── ガチャボタン ── */}
            <div className="flex gap-3 px-4 pb-2 pt-3">
              <button
                onClick={()=>spin('single')}
                disabled={pts < 1000 || ptsLoading}
                className="flex-1 flex flex-col items-center justify-center py-3.5 rounded-xl transition-transform active:scale-95 disabled:opacity-35"
                style={{
                  background: pts>=1000&&!ptsLoading ? GOLD_BTN : '#1a1400',
                  border:`2px solid ${pts>=1000&&!ptsLoading ? 'rgba(218,165,32,.8)' : 'rgba(184,134,11,.3)'}`,
                  boxShadow: pts>=1000&&!ptsLoading ? '0 4px 22px rgba(184,134,11,.45),inset 0 1px 0 rgba(255,255,255,.18)' : 'none',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <img src={coinImg} alt="" className="rounded-full object-cover" style={{width:18,height:18}} />
                  <span style={{fontWeight:900,fontSize:15,color:'#fff8e1',textShadow:'0 1px 5px rgba(0,0,0,.8)'}}>
                    1連ガチャ
                  </span>
                </div>
                <span style={{fontSize:11,fontWeight:700,color:'rgba(255,248,225,.75)',marginTop:2}}>1,000pt</span>
              </button>

              <button
                onClick={()=>spin('multi')}
                disabled={pts < 10000 || ptsLoading}
                className="flex-1 flex flex-col items-center justify-center py-3.5 rounded-xl transition-transform active:scale-95 disabled:opacity-35"
                style={{
                  background: pts>=10000&&!ptsLoading ? RED_BTN : '#1a0000',
                  border:`2px solid ${pts>=10000&&!ptsLoading ? 'rgba(185,28,28,.8)' : 'rgba(185,28,28,.3)'}`,
                  boxShadow: pts>=10000&&!ptsLoading ? '0 4px 22px rgba(185,28,28,.45),inset 0 1px 0 rgba(255,255,255,.18)' : 'none',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <img src={coinImg} alt="" className="rounded-full object-cover" style={{width:18,height:18}} />
                  <span style={{fontWeight:900,fontSize:15,color:'#fff8f8',textShadow:'0 1px 5px rgba(0,0,0,.8)'}}>
                    10連ガチャ
                  </span>
                </div>
                <span style={{fontSize:11,fontWeight:700,color:'rgba(255,248,248,.75)',marginTop:2}}>10,000pt</span>
              </button>
            </div>

            {/* ── 保有ポイントバー ── */}
            <div className="mx-4 mb-5 flex items-center justify-between px-4 py-2.5 rounded-xl" style={{
              background:'linear-gradient(135deg,#120e00,#1e1600,#120e00)',
              border:'1.5px solid rgba(184,134,11,.6)',
              boxShadow:'0 0 18px rgba(184,134,11,.15)',
            }}>
              <div className="flex items-center gap-2">
                <img src={coinImg} alt="" className="rounded-full object-cover" style={{width:22,height:22}} />
                <span style={{fontSize:11,color:'#c8a060',fontWeight:600}}>保有ポイント</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{fontFamily:'monospace',fontWeight:900,fontSize:17,color:'#ffd700',
                  textShadow:'0 0 14px rgba(255,215,0,.5)'}}>
                  {ptsLoading ? '---' : pts.toLocaleString()} pt
                </span>
                <ChevronRight className="size-4" style={{color:'#b8860b'}} />
              </div>
            </div>

            {pts < 1000 && !ptsLoading && (
              <p className="text-center text-xs text-muted-foreground -mt-3 pb-4">
                ミッションをクリアしてポイントを貯めよう！
              </p>
            )}

            {/* 履歴 */}
            <div className="px-4 pb-8">
              <button type="button"
                onClick={()=>{ setHistoryOpen(o=>!o); if (!historyOpen) loadHistory() }}
                className="flex w-full items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
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
                  {history.map(row=>(
                    <Card key={row.id} className="p-3 border-border bg-card">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold">{row.pullType==='multi'?'10連':'1連'}</span>
                        {row.wasGuaranteed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-950/60 text-yellow-400 border border-yellow-700">✨確定</span>
                        )}
                        {row.hasInmu && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${row.inmuSentStatus==='sent'?'bg-green-950/60 text-green-400 border-green-700':'bg-amber-950/60 text-yellow-400 border-yellow-700'}`}>
                            🏆INMU{row.inmuSentStatus==='sent'?'（送金済）':'（未送金）'}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(row.createdAt).toLocaleDateString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                        {' — '}消費 {row.costPoints.toLocaleString()}pt
                        {row.totalPoints>0&&` / 獲得 +${row.totalPoints.toLocaleString()}pt`}
                      </p>
                      {row.results.length>0&&(
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {row.results.map((r,i)=>{
                            const st=PRIZE_STYLE[r.prizeId]??PRIZE_STYLE.pts100
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
        )}

        {/* ══════════════════ ANIMATION PHASES ══════════════════ */}
        {phase !== 'idle' && (
          <div className="flex flex-col flex-1 items-center justify-center px-4 py-6 gap-5">
            <div className="self-stretch flex items-center justify-between">
              <div>
                <h1 style={{fontSize:15,fontWeight:900,color:'#daa520'}}>✦ INMU GACHA ✦</h1>
                <p className="text-xs text-muted-foreground">
                  所持: <span style={{fontWeight:700,color:'#ffd700'}}>{pts.toLocaleString()} pt</span>
                </p>
              </div>
              {phase==='done' && (
                <Button variant="outline" size="sm" onClick={reset} className="gap-1 text-xs h-8">
                  <RefreshCw className="size-3" />もう一度
                </Button>
              )}
            </div>

            {/* ── 確定演出：インムくん×5 拍手 ── */}
            {phase==='guaranteed' && (
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="relative flex items-end justify-center w-full" style={{height:210}}>
                  {/* 光の波紋 */}
                  {[0,1,2].map(i=>(
                    <div key={i} className="absolute left-1/2 bottom-8 -translate-x-1/2 rounded-full"
                      style={{
                        width:70+i*55,height:70+i*55,
                        background:'rgba(218,165,32,0.05)',
                        border:`1px solid rgba(218,165,32,${0.28-i*.08})`,
                        animation:`g-ring 1.8s ease-out infinite`,
                        animationDelay:`${i*.5}s`,
                      }} />
                  ))}
                  {/* 👏 フロート */}
                  {[{l:'20%',d:'0s'},{l:'36%',d:'.3s'},{l:'52%',d:'.6s'},{l:'68%',d:'.9s'},{l:'10%',d:'1.2s'}].map((h,i)=>(
                    <div key={i} className="absolute" style={{
                      bottom:175,left:h.l,fontSize:18,
                      animation:'g-handup 1.15s ease-out infinite',animationDelay:h.d,
                    }}>👏</div>
                  ))}
                  {/* インムくん×5 */}
                  {MASCOT_POSITIONS.map((m,i)=>(
                    <div key={i} className="absolute" style={{
                      ...m.style,width:m.w,height:m.w,
                      borderRadius:'50%',overflow:'hidden',
                      border:`3px solid #daa520`,
                      boxShadow:`0 0 ${i===0?30:16}px rgba(218,165,32,${i===0?.9:.65})`,
                      animation:`g-popin .45s ease-out ${m.delay}ms both, g-clap .7s ease-in-out ${m.delay+500}ms infinite`,
                    }}>
                      <img src={mascotImg} alt="インムくん" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                    </div>
                  ))}
                </div>
                <div className="g-burst rounded-2xl px-8 py-3 text-center g-glow" style={{
                  background:'linear-gradient(135deg,#3d1f00,#5c3000,#3d1f00)',
                  border:'2px solid #daa520',
                }}>
                  <p style={{fontWeight:900,fontSize:17,letterSpacing:'0.08em',color:'#ffd700',
                    textShadow:'0 0 22px rgba(255,215,0,.8)'}}>
                    🎊 INMU 確定！ 🎊
                  </p>
                  <div className="flex gap-2 justify-center mt-1.5">
                    {['✦','✧','★','✧','✦'].map((s,i)=>(
                      <span key={i} style={{fontSize:14,color:'#ffd700',
                        animation:`g-sparkle ${0.5+i*.15}s ease-in-out infinite`,animationDelay:`${i*.11}s`}}>{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── コイン投入 ── */}
            {phase==='inserting' && (
              <div className="flex flex-col items-center gap-4">
                <div className="relative h-64 w-48 flex flex-col items-center">
                  <img src={coinImg} alt="INMU Coin"
                    className="absolute top-0 w-20 h-20 rounded-full object-cover g-drop z-10"
                    style={{border:'2px solid #daa520',boxShadow:'0 0 22px rgba(218,165,32,.7)'}} />
                  <div className="absolute bottom-0 w-44 h-48 rounded-3xl flex flex-col items-center justify-center gap-2"
                    style={{background:METAL,border:'3px solid #b8860b',boxShadow:'0 0 26px rgba(184,134,11,.3)'}}>
                    <img src={coinImg} alt="" className="w-12 h-12 rounded-full object-cover opacity-40" />
                    <p style={{fontSize:9,fontWeight:900,letterSpacing:'0.2em',color:'#7c5a00'}}>INMU GACHA</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">コインを投入中…</p>
              </div>
            )}

            {/* ── 回転 ── */}
            {phase==='spinning' && (
              <div className="flex flex-col items-center gap-5">
                <div className="relative flex items-center justify-center">
                  {[200,158,116].map((s,i)=>(
                    <div key={i} className="absolute rounded-full" style={{
                      width:s,height:s,
                      border:`${2-i}px solid rgba(218,165,32,${.25-i*.07})`,
                      animation:`g-pulse-g ${1.2+i*.3}s ease-in-out infinite`,
                      animationDelay:`${i*.2}s`,
                    }} />
                  ))}
                  <img src={coinImg} alt="INMU Coin"
                    className="w-44 h-44 rounded-full object-cover g-spin relative z-10"
                    style={{border:'4px solid #daa520',boxShadow:'0 0 46px rgba(218,165,32,.9)'}} />
                </div>
                <p style={{color:'#ffd700',fontWeight:700,fontSize:13}} className="animate-pulse tracking-widest">
                  ガチャ回転中…
                </p>
              </div>
            )}

            {/* ── カプセル出現/開放 ── */}
            {(phase==='capsule'||phase==='opening') && (
              <div className="flex flex-col items-center gap-5">
                <div className="relative w-40 h-48 flex flex-col items-center">
                  <div className={`w-40 h-[96px] rounded-t-full ${phase==='opening'?'g-split-t':'g-pop'} origin-bottom`}
                    style={{background:'linear-gradient(to bottom,#d8e0e0,#707880)',
                      border:'2.5px solid rgba(220,230,230,.85)',
                      boxShadow:'inset 0 4px 12px rgba(255,255,255,.35),0 0 18px rgba(255,255,255,.14)'}} />
                  <div className={`w-40 h-[96px] rounded-b-full ${phase==='opening'?'g-split-b':''} origin-top`}
                    style={{background:'linear-gradient(to top,#505860,#707880)',
                      border:'2.5px solid rgba(160,170,180,.6)'}} />
                  {phase==='opening' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-24 h-24 rounded-full bg-white/15 animate-ping" />
                      <div className="absolute w-12 h-12 rounded-full bg-white/35 animate-ping"
                        style={{animationDelay:'150ms'}} />
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">
                  {phase==='capsule'?'カプセルが出てきた…！':'カプセルオープン！'}
                </p>
              </div>
            )}

            {/* ── 結果（1連）── */}
            {phase==='done' && spinResult && !isMulti && (
              <div className="g-reveal flex flex-col items-center gap-4 w-full max-w-xs">
                {spinResult.wasGuaranteed && (
                  <p style={{fontSize:12,fontWeight:700,color:'#ffd700'}} className="animate-pulse">
                    ✨ 確定演出が発動しました！
                  </p>
                )}
                {spinResult.results.map((prize,i)=>{
                  const st=PRIZE_STYLE[prize.prizeId]??PRIZE_STYLE.pts100
                  const isInmu=prize.type==='inmu'
                  return (
                    <div key={i} className={`w-full rounded-2xl border-2 p-6 text-center ${st.bg} ${st.border} ${isInmu?'g-glow':''}`}>
                      {isInmu && <p className="text-5xl mb-3" style={{filter:'drop-shadow(0 0 14px gold)'}}>🏆</p>}
                      <p className={`font-black text-3xl tracking-wide ${st.text}`}>{prize.label}</p>
                      {prize.type==='points' && <p className="text-xs text-muted-foreground mt-2">ポイントを即時付与しました</p>}
                      {isInmu && (
                        <p className="text-xs text-yellow-200/80 mt-2 leading-relaxed">
                          当選おめでとうございます！<br/>報酬は後日運営より送金されます
                        </p>
                      )}
                    </div>
                  )
                })}
                {spinResult.totalPoints>0 && (
                  <p style={{fontSize:14,fontWeight:700,color:'#ffd700'}}>
                    +{spinResult.totalPoints.toLocaleString()} pt を獲得しました！
                  </p>
                )}
              </div>
            )}

            {/* ── 結果（10連グリッド）── */}
            {phase==='done' && spinResult && isMulti && (
              <div className="g-reveal flex flex-col gap-3 w-full max-w-xs">
                {spinResult.wasGuaranteed && (
                  <p style={{fontSize:12,fontWeight:700,color:'#ffd700',textAlign:'center'}} className="animate-pulse">
                    ✨ 確定演出が発動しました！
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {spinResult.results.map((prize,i)=>{
                    const st=PRIZE_STYLE[prize.prizeId]??PRIZE_STYLE.pts100
                    const isInmu=prize.type==='inmu'
                    return (
                      <div key={i} className={`rounded-xl border-2 p-3 text-center ${st.bg} ${st.border} ${isInmu?'g-glow':''} ${i<revealIdx?'g-card':'opacity-0'}`}>
                        {isInmu && <p className="text-2xl">🏆</p>}
                        <p className={`font-bold text-sm ${st.text}`}>{prize.label}</p>
                      </div>
                    )
                  })}
                </div>
                {spinResult.totalPoints>0 && (
                  <p style={{fontSize:12,color:'#ffd700',textAlign:'center',fontWeight:700}}>
                    合計 +{spinResult.totalPoints.toLocaleString()} pt 獲得！
                  </p>
                )}
                {spinResult.hasInmu && (
                  <p style={{fontSize:12,color:'#fde68a',textAlign:'center'}}>
                    🏆 10,000 INMU 当選！後日運営より送金されます
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
