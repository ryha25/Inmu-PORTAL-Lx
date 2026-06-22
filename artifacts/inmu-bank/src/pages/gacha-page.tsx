import { useState, useEffect, useCallback, useRef } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { ChevronRight, RefreshCw, History } from 'lucide-react'
import mascotImg from '@assets/IMG_4397_1782097134955.jpeg'
import coinImg   from '@assets/IMG_6637_1782097134955.jpeg'

/* ─── 型 ─── */
type GachaPhase = 'idle'|'guaranteed'|'inserting'|'lever'|'capsule_out'|'capsule_fall'|'opening'|'done'
type PrizeResult = { prizeId:string; label:string; type:'points'|'inmu'; amount:number }
type SpinResult  = {
  results:PrizeResult[]; totalPoints:number; hasInmu:boolean; inmuCount:number
  wasGuaranteed:boolean; costPoints:number; newPoints:number
}
type HistoryRow = {
  id:number; pullType:string; results:PrizeResult[]; totalPoints:number; hasInmu:boolean
  inmuCount:number; inmuSentStatus:string; wasGuaranteed:boolean; costPoints:number; createdAt:string
}

/* ─── 定数 ─── */
const PHASE_MS:Partial<Record<GachaPhase,number>> = {
  guaranteed:3200, inserting:1400, lever:1200,
  capsule_out:1600, capsule_fall:1000, opening:900,
}
const BALL_COLORS = [
  { id:'pts100',  grad:'radial-gradient(circle at 35% 32%,#c0c8c8,#404848)', bdr:'#8a9090', glow:'#8a9090' },
  { id:'pts1000', grad:'radial-gradient(circle at 35% 32%,#70a0e8,#0a2070)', bdr:'#5090e0', glow:'#5090e0' },
  { id:'pts5000', grad:'radial-gradient(circle at 35% 32%,#d870e8,#400888)', bdr:'#c060e0', glow:'#c060e0' },
  { id:'inmu10k', grad:'radial-gradient(circle at 35% 32%,#fcd040,#7a5000)', bdr:'#f8c030', glow:'#f8c030' },
]
const PRIZE_LABEL:Record<string,{label:string;sub:string}> = {
  pts100:  { label:'100pt',        sub:'100 pt を獲得！'        },
  pts1000: { label:'1,000pt',      sub:'1,000 pt を獲得！'      },
  pts5000: { label:'5,000pt',      sub:'5,000 pt を獲得！'      },
  inmu10k: { label:'10,000\nINMU', sub:'10,000 INMU を獲得！'   },
}
const G       = 'linear-gradient(160deg,#7c5a00,#b8860b 25%,#daa520 50%,#b8860b 75%,#7c5a00)'
const G_DARK  = 'linear-gradient(160deg,#3a2800,#6a4800,#3a2800)'
const G_RED   = 'linear-gradient(160deg,#4a0000,#880000 30%,#cc1a1a 50%,#880000 70%,#4a0000)'
const METAL   = 'linear-gradient(to bottom,#3a3020,#2a2010,#1a1206)'
const DOME_BG = 'radial-gradient(circle at 44% 38%,#20193c 0%,#100d1e 55%,#070410 100%)'
const SPACE   = 'radial-gradient(ellipse at 50% 25%,#1e0848 0%,#0d0520 45%,#040210 100%)'

const MASCOT_CLAP = [
  { w:96, s:{ bottom:0, left:'50%', transform:'translateX(-50%)', zIndex:10 }, d:0   },
  { w:74, s:{ bottom:0, left:12,  zIndex:8  }, d:180 },
  { w:74, s:{ bottom:0, right:12, zIndex:8  }, d:360 },
  { w:58, s:{ bottom:60, left:28, zIndex:7  }, d:540 },
  { w:58, s:{ bottom:60, right:28,zIndex:7  }, d:720 },
]

/* ─── CSS keyframes ─── */
const STYLES = `
  @keyframes g-float  {0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
  @keyframes g-star   {0%,100%{opacity:.1;transform:scale(.75)}50%{opacity:1;transform:scale(1.18)}}
  @keyframes g-spin   {from{transform:rotate(0)}to{transform:rotate(720deg)}}
  @keyframes g-clap   {0%,100%{transform:translateY(0)scale(1)}35%{transform:translateY(-20px)scale(1.08)}70%{transform:translateY(-8px)scale(1.03)}}
  @keyframes g-popin  {0%{transform:scale(0)rotate(-20deg);opacity:0}65%{transform:scale(1.2)rotate(4deg);opacity:1}100%{transform:scale(1)rotate(0);opacity:1}}
  @keyframes g-handup {0%{transform:translateY(0);opacity:1}100%{transform:translateY(-55px);opacity:0}}
  @keyframes g-drop   {0%{transform:translateY(-100px)rotate(0);opacity:0}70%{transform:translateY(6px)rotate(210deg);opacity:1}100%{transform:translateY(0)rotate(360deg);opacity:1}}
  @keyframes g-lever  {0%{transform-origin:bottom;transform:rotate(0)}40%{transform-origin:bottom;transform:rotate(-38deg)}100%{transform-origin:bottom;transform:rotate(-38deg)}}
  @keyframes g-capsule-fly {0%{transform:translateY(0)scale(.4);opacity:0}50%{transform:translateY(-60px)scale(1.1);opacity:1}100%{transform:translateY(-40px)scale(1);opacity:1}}
  @keyframes g-capsule-fall{0%{transform:translateY(-40px);opacity:1}100%{transform:translateY(140px)rotate(30deg);opacity:.1}}
  @keyframes g-split-t{from{transform:translateY(0)rotate(0)}to{transform:translateY(-44px)rotate(-14deg)}}
  @keyframes g-split-b{from{transform:translateY(0)rotate(0)}to{transform:translateY(44px)rotate(14deg)}}
  @keyframes g-reveal {from{transform:scale(.6)translateY(18px);opacity:0}to{transform:scale(1)translateY(0);opacity:1}}
  @keyframes g-glow   {0%,100%{box-shadow:0 0 16px 4px rgba(234,179,8,.5)}50%{box-shadow:0 0 50px 22px rgba(234,179,8,.95)}}
  @keyframes g-flash  {0%,100%{opacity:0}30%,60%{opacity:.45}}
  @keyframes g-card   {from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
  @keyframes g-pulse-g{0%,100%{text-shadow:0 0 8px rgba(218,165,32,.25)}50%{text-shadow:0 0 30px rgba(255,215,0,.95),0 0 60px rgba(218,165,32,.5)}}
  @keyframes g-burst  {0%{opacity:0;transform:scale(.3)}65%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
  @keyframes g-sparkle{0%,100%{opacity:0;transform:scale(0)}50%{opacity:1;transform:scale(1.4)}}
  @keyframes g-ring   {0%{transform:scale(1);opacity:.7}100%{transform:scale(2.6);opacity:0}}
  @keyframes g-bounce {0%,100%{transform:translateY(0)}40%{transform:translateY(-22px)}70%{transform:translateY(-10px)}}
  .g-float{animation:g-float 2.6s ease-in-out infinite}
  .g-spin {animation:g-spin  .46s linear infinite}
  .g-pulse-g{animation:g-pulse-g 2s ease-in-out infinite}
  .g-glow{animation:g-glow 1.3s ease-in-out infinite}
  .g-reveal{animation:g-reveal .44s ease-out forwards}
`

/* ═══════════════════════════════ MACHINE ═══════════════════════════════ */
function GachaMachine({ size = 196 }: { size?: number }) {
  const bodyW = Math.round(size * 0.83)
  return (
    <div className="flex flex-col items-center" style={{width:size}}>
      {/* アーチ */}
      <div style={{width:size,height:26,background:G,borderRadius:'50% 50% 0 0',
        boxShadow:'0 -3px 16px rgba(218,165,32,.55)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontSize:10,color:'#ffe080',fontWeight:900,letterSpacing:'0.2em'}}>★★ INMU ★★</span>
      </div>

      {/* ドーム */}
      <div className="relative overflow-hidden flex flex-col items-center justify-center" style={{
        width:size, height:size, background:DOME_BG,
        border:'4px solid #b8860b', borderTop:'none',
        boxShadow:'0 0 44px rgba(184,134,11,.5),inset 0 0 70px rgba(0,0,0,.85)',
      }}>
        {/* 星 */}
        {[{x:14,y:18},{x:60,y:10},{x:size-38,y:22},{x:size-18,y:66},
          {x:10,y:86},{x:size-20,y:110},{x:24,y:138},{x:size-30,y:154},
          {x:76,y:size-28},{x:108,y:8},{x:6,y:48},{x:size-12,y:42},{x:40,y:68},{x:size-50,y:78}
        ].map((s,i)=>(
          <div key={i} className="absolute rounded-full bg-white"
            style={{left:s.x,top:s.y,width:2.4,height:2.4,
              animation:`g-star ${1.4+i*.22}s ease-in-out infinite`,animationDelay:`${i*.18}s`}} />
        ))}

        {/* コイン（中央浮遊） */}
        <img src={coinImg} alt="" className="g-float rounded-full object-cover relative z-10"
          style={{width:Math.round(size*.38),height:Math.round(size*.38),marginTop:'-10%',
            border:'3px solid #daa520',boxShadow:'0 0 30px rgba(218,165,32,.9),inset 0 2px 8px rgba(255,255,255,.3)'}} />

        {/* キャプセル球（下部） */}
        {[
          {x:10, y:size-80,c:BALL_COLORS[0].grad,s:28},{x:42, y:size-66,c:BALL_COLORS[1].grad,s:26},
          {x:size-40,y:size-74,c:BALL_COLORS[2].grad,s:28},{x:size-64,y:size-60,c:BALL_COLORS[3].grad,s:30},
          {x:82, y:size-62,c:BALL_COLORS[0].grad,s:22},{x:108,y:size-68,c:BALL_COLORS[1].grad,s:20},
        ].map((b,i)=>(
          <div key={i} className="absolute rounded-full" style={{
            left:b.x,top:b.y,width:b.s,height:b.s,background:b.c,
            border:'1.5px solid rgba(255,255,255,.2)',
            boxShadow:'inset 0 2px 5px rgba(255,255,255,.3)',
          }} />
        ))}

        {/* 1114514 */}
        <p className="absolute" style={{top:28,left:'50%',transform:'translateX(-50%)',
          fontSize:9,fontWeight:700,letterSpacing:'0.2em',fontFamily:'monospace',
          color:'rgba(218,165,32,.5)',whiteSpace:'nowrap'}}>1114514</p>
      </div>

      {/* ボディ */}
      <div className="relative flex flex-col items-center" style={{
        width:bodyW,background:METAL,border:'3px solid #b8860b',borderTop:'none',
      }}>
        {/* INSERT COIN */}
        <div style={{borderBottom:'1px solid rgba(184,134,11,.35)',width:'100%',padding:'5px 0',
          display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <div style={{width:26,height:16,background:'radial-gradient(circle at 38% 38%,#daa520,#7c5a00)',
            borderRadius:3,border:'1px solid #b8860b',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <img src={coinImg} alt="" style={{width:13,height:13,borderRadius:'50%',objectFit:'cover'}} />
          </div>
          <div>
            <p style={{fontSize:7,color:'#b8860b',fontWeight:900,letterSpacing:'0.18em'}}>INSERT COIN</p>
            <p style={{fontSize:6,color:'rgba(184,134,11,.7)',letterSpacing:'0.1em'}}>INMU COIN ONLY</p>
          </div>
        </div>
        {/* コインドア */}
        <div className="my-2 flex items-center justify-center" style={{
          width:50,height:32,background:'radial-gradient(circle at 40% 40%,#c8a050,#7c5a00)',
          borderRadius:6,border:'2px solid #daa520',boxShadow:'0 0 12px rgba(218,165,32,.4)'}}>
          <span style={{fontSize:15}}>🪙</span>
        </div>

        {/* レバー */}
        <div className="absolute flex flex-col items-center" style={{right:-18,top:4}}>
          <div style={{width:14,height:14,borderRadius:'50%',background:'radial-gradient(circle at 38% 35%,#daa520,#7c5a00)',
            border:'1.5px solid #b8860b',boxShadow:'0 0 10px rgba(218,165,32,.6)'}} />
          <div style={{width:5,height:32,background:G,borderRadius:3}} />
          <div style={{width:12,height:8,background:'linear-gradient(to bottom,#b8860b,#7c5a00)',borderRadius:2}} />
        </div>
      </div>

      {/* ベース */}
      <div style={{width:size,height:28,
        background:'linear-gradient(to bottom,#2a2010,#181008)',
        border:'3px solid #b8860b',borderTop:'none',
        borderRadius:'0 0 14px 14px',boxShadow:'0 8px 26px rgba(0,0,0,.7)'}} />
    </div>
  )
}

/* ═══════════════════════════════ PAGE ═══════════════════════════════ */
export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts, setPts]             = useState(0)
  const [ptsLoading, setPtsLoading] = useState(true)
  const [phase, setPhase]         = useState<GachaPhase>('idle')
  const [spinResult, setSpinResult] = useState<SpinResult|null>(null)
  const [revealIdx, setRevealIdx] = useState(0)
  const [history, setHistory]     = useState<HistoryRow[]>([])
  const [histFull, setHistFull]   = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null)

  /* ── ポイント取得（useAuthはmonthlyPointsを含まないため直接fetch）── */
  const loadPts = useCallback(async () => {
    try {
      const r = await fetch('/api/profile', { credentials:'include' })
      if (r.ok) {
        const d = await r.json() as { monthlyPoints?:string|number }
        setPts(Number(d.monthlyPoints ?? 0))
      }
    } catch {/**/} finally { setPtsLoading(false) }
  }, [])
  useEffect(() => { loadPts() }, [loadPts])

  const loadHist = useCallback(async () => {
    try {
      const r = await fetch('/api/gacha/history', { credentials:'include' })
      const d = await r.json() as HistoryRow[]
      setHistory(Array.isArray(d) ? d : [])
    } catch {/**/}
  }, [])
  useEffect(() => { loadHist() }, [loadHist])

  /* ── フェーズ進行 ── */
  function clrTimer() { if (timer.current) clearTimeout(timer.current) }
  function afterMs(ms:number, next:GachaPhase) {
    clrTimer(); timer.current = setTimeout(()=>setPhase(next), ms)
  }
  useEffect(()=>()=>clrTimer(),[])

  useEffect(()=>{
    if      (phase==='guaranteed')   afterMs(PHASE_MS.guaranteed!,   'inserting')
    else if (phase==='inserting')    afterMs(PHASE_MS.inserting!,     'lever')
    else if (phase==='lever')        afterMs(PHASE_MS.lever!,         'capsule_out')
    else if (phase==='capsule_out')  afterMs(PHASE_MS.capsule_out!,   'capsule_fall')
    else if (phase==='capsule_fall') afterMs(PHASE_MS.capsule_fall!,  'opening')
    else if (phase==='opening')      afterMs(PHASE_MS.opening!,       'done')
  },[phase])

  useEffect(()=>{
    if (phase==='done' && spinResult && spinResult.results.length>1 && revealIdx<spinResult.results.length){
      const t=setTimeout(()=>setRevealIdx(i=>i+1),170); return ()=>clearTimeout(t)
    }
  },[phase,spinResult,revealIdx])

  /* ── スピン実行 ── */
  async function spin(type:'single'|'multi') {
    if (phase!=='idle') return
    const cost = type==='multi'?10000:1000
    if (pts<cost) { toast.error(`ポイント不足（必要:${cost.toLocaleString()}pt / 所持:${pts.toLocaleString()}pt）`); return }
    try {
      const res = await fetch('/api/gacha/spin',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({type})})
      if (!res.ok) { const e=await res.json().catch(()=>({})) as {error?:string}; throw new Error(e.error??'エラー') }
      const result = await res.json() as SpinResult
      setSpinResult(result); setRevealIdx(0); setPts(result.newPoints)
      setPhase(result.wasGuaranteed?'guaranteed':'inserting')
    } catch(e){ toast.error(e instanceof Error?e.message:'エラーが発生しました') }
  }

  function reset() { clrTimer(); setPhase('idle'); setSpinResult(null); setRevealIdx(0); loadPts(); loadHist() }

  const isMulti = (spinResult?.results.length??0)>1

  /* ─────────────────── IDLE（トップ画面）─────────────────── */
  if (phase==='idle') return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{STYLES}</style>
      <div style={{background:'#060411',minHeight:'100dvh'}}>

        {/* タイトル */}
        <div className="text-center pt-4 pb-2 px-4">
          <h1 className="g-pulse-g" style={{fontSize:24,fontWeight:900,letterSpacing:'0.12em',
            color:'#daa520',fontFamily:'serif'}}>✦ INMU GACHA ✦</h1>
          <p style={{fontSize:10,color:'rgba(255,255,255,.55)',marginTop:2,letterSpacing:'0.06em'}}>
            ガチャ機能 改修仕様まとめ
          </p>
        </div>

        {/* ── メインエリア: マシン + 排出率 ── */}
        <div className="flex gap-2 px-2 items-start">

          {/* 左：マシン + マスコット */}
          <div className="flex flex-col items-center">
            <GachaMachine size={196} />
            {/* マスコット + 吹き出し */}
            <div className="flex items-end gap-2 mt-2 w-full px-1">
              <img src={mascotImg} alt="インムくん" className="rounded-full object-cover flex-shrink-0"
                style={{width:56,height:56,border:'2px solid rgba(184,134,11,.65)',
                  boxShadow:'0 0 14px rgba(184,134,11,.35)'}} />
              <div style={{background:'rgba(18,12,2,.9)',border:'1px solid rgba(184,134,11,.45)',
                borderRadius:'12px 12px 12px 0',padding:'5px 10px',flex:1}}>
                <p style={{fontSize:10,color:'#f5deb3',lineHeight:1.55}}>
                  何が出るかな？<br/>ワクワクするね！
                </p>
              </div>
            </div>
          </div>

          {/* 右：排出率 */}
          <div className="flex-1 min-w-0">
            <div className="rounded-xl overflow-hidden" style={{
              background:'linear-gradient(160deg,#1a1200,#2a1a00)',
              border:'1.5px solid rgba(184,134,11,.6)',
            }}>
              <div className="flex items-center justify-center gap-1 py-2" style={{
                background:'linear-gradient(to right,transparent,rgba(184,134,11,.3),transparent)',
                borderBottom:'1px solid rgba(184,134,11,.35)'}}>
                <span style={{fontSize:9,color:'#daa520'}}>★</span>
                <span style={{fontSize:11,fontWeight:900,color:'#daa520',letterSpacing:'0.1em'}}>排出率</span>
                <span style={{fontSize:9,color:'#daa520'}}>★</span>
              </div>
              <div className="px-3 py-2.5 flex flex-col gap-2.5">
                {[
                  {grad:BALL_COLORS[0].grad,glow:BALL_COLORS[0].glow,label:'100pt',      rate:'88%'},
                  {grad:BALL_COLORS[1].grad,glow:BALL_COLORS[1].glow,label:'1,000pt',    rate:'8%' },
                  {grad:BALL_COLORS[2].grad,glow:BALL_COLORS[2].glow,label:'5,000pt',    rate:'3%' },
                  {grad:BALL_COLORS[3].grad,glow:BALL_COLORS[3].glow,label:'10,000\nINMU',rate:'1%'},
                ].map(({grad,glow,label,rate})=>(
                  <div key={label} className="flex items-center gap-2">
                    <div className="flex-shrink-0 rounded-full" style={{
                      width:15,height:15,background:grad,
                      border:'1.5px solid rgba(255,255,255,.25)',
                      boxShadow:`0 0 7px ${glow}99`,
                    }} />
                    <div className="flex flex-col leading-tight flex-1 min-w-0">
                      {label.split('\n').map((l,i)=>(
                        <span key={i} style={{fontSize:9,color:'#e0d0b0',lineHeight:1.25}}>{l}</span>
                      ))}
                    </div>
                    <span style={{fontFamily:'monospace',fontWeight:700,fontSize:11,color:'#daa520',flexShrink:0}}>
                      {rate}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── ガチャボタン ── */}
        <div className="flex gap-3 px-3 mt-4">
          <button onClick={()=>spin('single')} disabled={pts<1000||ptsLoading}
            className="flex-1 flex flex-col items-center justify-center py-4 rounded-xl transition-transform active:scale-95 disabled:opacity-35"
            style={{background:pts>=1000&&!ptsLoading?G_DARK:'#1a1400',
              border:`2px solid ${pts>=1000&&!ptsLoading?'rgba(218,165,32,.85)':'rgba(184,134,11,.3)'}`,
              boxShadow:pts>=1000&&!ptsLoading?'0 4px 24px rgba(184,134,11,.5),inset 0 1px 0 rgba(255,255,255,.18)':'none'}}>
            <div className="flex items-center gap-1.5">
              <img src={coinImg} alt="" className="rounded-full object-cover" style={{width:20,height:20}} />
              <span style={{fontWeight:900,fontSize:16,color:'#fff8e1',textShadow:'0 1px 6px rgba(0,0,0,.8)'}}>
                1連ガチャ
              </span>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:'rgba(255,248,225,.75)',marginTop:2}}>1,000pt</span>
          </button>

          <button onClick={()=>spin('multi')} disabled={pts<10000||ptsLoading}
            className="flex-1 flex flex-col items-center justify-center py-4 rounded-xl transition-transform active:scale-95 disabled:opacity-35"
            style={{background:pts>=10000&&!ptsLoading?G_RED:'#1a0000',
              border:`2px solid ${pts>=10000&&!ptsLoading?'rgba(185,28,28,.85)':'rgba(185,28,28,.3)'}`,
              boxShadow:pts>=10000&&!ptsLoading?'0 4px 24px rgba(185,28,28,.5),inset 0 1px 0 rgba(255,255,255,.18)':'none'}}>
            <div className="flex items-center gap-1.5">
              <img src={coinImg} alt="" className="rounded-full object-cover" style={{width:20,height:20}} />
              <span style={{fontWeight:900,fontSize:16,color:'#fff8f8',textShadow:'0 1px 6px rgba(0,0,0,.8)'}}>
                10連ガチャ
              </span>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:'rgba(255,248,248,.75)',marginTop:2}}>10,000pt</span>
          </button>
        </div>

        {/* ── 保有ポイントバー ── */}
        <div className="mx-3 mt-3 flex items-center justify-between px-4 py-3 rounded-xl" style={{
          background:'linear-gradient(135deg,#120e00,#1e1600,#120e00)',
          border:'1.5px solid rgba(184,134,11,.6)',
          boxShadow:'0 0 20px rgba(184,134,11,.15)',
        }}>
          <div className="flex items-center gap-2">
            <img src={coinImg} alt="" className="rounded-full object-cover" style={{width:22,height:22}} />
            <span style={{fontSize:12,color:'#c8a060',fontWeight:600}}>保有ポイント</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{fontFamily:'monospace',fontWeight:900,fontSize:19,color:'#ffd700',
              textShadow:'0 0 16px rgba(255,215,0,.55)'}}>
              {ptsLoading?'---':pts.toLocaleString()} pt
            </span>
            <ChevronRight className="size-4" style={{color:'#b8860b'}} />
          </div>
        </div>

        {pts<1000&&!ptsLoading&&(
          <p className="text-center text-xs text-muted-foreground mt-2">
            ミッションをクリアしてポイントを貯めよう！
          </p>
        )}

        {/* ── ガチャ履歴 ── */}
        <div className="mx-3 mt-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <History className="size-3.5" style={{color:'#b8860b'}} />
              <span style={{fontSize:12,fontWeight:700,color:'#b8860b'}}>ガチャ履歴</span>
            </div>
            <button onClick={()=>setHistFull(f=>!f)}
              style={{fontSize:10,color:'rgba(184,134,11,.75)',display:'flex',alignItems:'center',gap:2}}>
              {histFull?'閉じる':'もっと見る'}
              <ChevronRight className="size-3" />
            </button>
          </div>

          {history.length===0?(
            <p style={{fontSize:11,color:'rgba(255,255,255,.3)',textAlign:'center',padding:'12px 0'}}>
              ガチャ履歴がありません
            </p>
          ):(
            <div className="rounded-xl overflow-hidden" style={{
              border:'1px solid rgba(184,134,11,.35)',
              background:'rgba(10,8,2,.6)',
            }}>
              {(histFull?history:history.slice(0,4)).map((row,idx)=>{
                const isLast=histFull?idx===history.length-1:idx===Math.min(3,history.length-1)
                const topPrize=row.hasInmu
                  ? '10,000 INMU を獲得しました！'
                  : row.totalPoints>0
                    ? `${row.totalPoints.toLocaleString()} pt を獲得しました`
                    : `${row.costPoints.toLocaleString()}pt 消費`
                const timeStr=new Date(row.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})
                return (
                  <div key={row.id} style={{
                    display:'flex',alignItems:'center',padding:'8px 12px',
                    borderBottom:isLast?'none':'1px solid rgba(184,134,11,.2)',
                  }}>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="flex items-center gap-1.5">
                        <span style={{fontSize:10,fontWeight:700,color:row.hasInmu?'#ffd700':'#c8a060'}}>
                          {row.pullType==='multi'?'10連':'1連'}
                        </span>
                        {row.wasGuaranteed&&(
                          <span style={{fontSize:8,padding:'1px 5px',borderRadius:3,
                            background:'rgba(218,165,32,.2)',color:'#daa520',border:'1px solid rgba(218,165,32,.5)'}}>
                            ✨確定
                          </span>
                        )}
                      </div>
                      <p style={{fontSize:11,color:row.hasInmu?'#ffd700':'rgba(255,255,255,.7)',marginTop:1,
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {topPrize}
                      </p>
                    </div>
                    <span style={{fontSize:10,color:'rgba(255,255,255,.4)',flexShrink:0,marginLeft:8}}>
                      {timeStr}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )

  /* ─────────────────── ANIMATION + RESULT ─────────────────── */
  return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{STYLES}</style>

      <div className="flex flex-col min-h-[100dvh]" style={{background:SPACE}}>
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h1 className="g-pulse-g" style={{fontSize:16,fontWeight:900,color:'#daa520',fontFamily:'serif'}}>
              ✦ INMU GACHA ✦
            </h1>
            <p style={{fontSize:11,color:'rgba(255,255,255,.5)'}}>
              所持: <span style={{fontWeight:700,color:'#ffd700'}}>{pts.toLocaleString()} pt</span>
            </p>
          </div>
          {phase==='done' && (
            <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-xs h-9">
              <RefreshCw className="size-3.5" />もう一度
            </Button>
          )}
        </div>

        <div className="flex flex-col flex-1 items-center justify-center px-5 gap-6">

          {/* ══ 確定演出：インムくん×5 拍手 ══ */}
          {phase==='guaranteed' && (
            <div className="flex flex-col items-center gap-5 w-full">
              <div className="relative flex items-end justify-center w-full" style={{height:220}}>
                {[0,1,2].map(i=>(
                  <div key={i} className="absolute left-1/2 bottom-8 -translate-x-1/2 rounded-full"
                    style={{width:70+i*60,height:70+i*60,
                      background:'rgba(218,165,32,.05)',
                      border:`1px solid rgba(218,165,32,${.28-i*.08})`,
                      animation:`g-ring 1.9s ease-out infinite`,animationDelay:`${i*.52}s`}} />
                ))}
                {[{l:'19%',d:'0s'},{l:'36%',d:'.28s'},{l:'53%',d:'.56s'},{l:'69%',d:'.84s'},{l:'10%',d:'1.1s'}].map((h,i)=>(
                  <div key={i} className="absolute" style={{bottom:188,left:h.l,fontSize:20,
                    animation:'g-handup 1.1s ease-out infinite',animationDelay:h.d}}>👏</div>
                ))}
                {MASCOT_CLAP.map((m,i)=>(
                  <div key={i} className="absolute" style={{
                    ...m.s,width:m.w,height:m.w,borderRadius:'50%',overflow:'hidden',
                    border:'3px solid #daa520',
                    boxShadow:`0 0 ${i===0?34:18}px rgba(218,165,32,${i===0?.92:.68})`,
                    animation:`g-popin .45s ease-out ${m.d}ms both, g-clap .7s ease-in-out ${m.d+500}ms infinite`,
                  }}>
                    <img src={mascotImg} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                  </div>
                ))}
              </div>
              <div className="g-burst rounded-2xl px-10 py-3.5 text-center g-glow" style={{
                background:'linear-gradient(135deg,#3d1f00,#5c3000,#3d1f00)',border:'2px solid #daa520'}}>
                <p style={{fontWeight:900,fontSize:18,letterSpacing:'0.08em',color:'#ffd700',
                  textShadow:'0 0 24px rgba(255,215,0,.85)'}}>🎊 INMU 確定！ 🎊</p>
                <div className="flex gap-2 justify-center mt-2">
                  {['✦','✧','★','✧','✦'].map((s,i)=>(
                    <span key={i} style={{fontSize:15,color:'#ffd700',
                      animation:`g-sparkle ${.5+i*.15}s ease-in-out infinite`,animationDelay:`${i*.11}s`}}>{s}</span>
                  ))}
                </div>
              </div>
              <p style={{fontSize:11,color:'rgba(255,255,255,.5)'}}>
                ガチャ演出を開始します…
              </p>
            </div>
          )}

          {/* ══ コイン投入（① コイン投入） ══ */}
          {phase==='inserting' && (
            <div className="flex flex-col items-center gap-5 w-full">
              <p style={{fontSize:13,color:'#ffd700',fontWeight:700}}>① コイン投入</p>
              <div className="relative flex items-center justify-center" style={{height:260,width:220}}>
                {/* コイン落下 */}
                <img src={coinImg} alt="" className="absolute rounded-full object-cover"
                  style={{width:72,height:72,top:0,left:'50%',transform:'translateX(-50%)',
                    border:'3px solid #daa520',boxShadow:'0 0 26px rgba(218,165,32,.8)',
                    animation:'g-drop .9s ease-out forwards',zIndex:10}} />
                {/* マシン（小さめ） */}
                <div className="absolute bottom-0" style={{opacity:.88}}>
                  <GachaMachine size={160} />
                </div>
              </div>
              <p style={{fontSize:12,color:'rgba(255,255,255,.55)'}} className="animate-pulse">
                INMUコインを投入します
              </p>
            </div>
          )}

          {/* ══ レバー回転（② レバー回転） ══ */}
          {phase==='lever' && (
            <div className="flex flex-col items-center gap-5 w-full">
              <p style={{fontSize:13,color:'#ffd700',fontWeight:700}}>② レバー回転</p>
              <div className="relative flex items-center justify-center" style={{height:260}}>
                {/* マシン */}
                <div style={{opacity:.88}}>
                  <GachaMachine size={160} />
                </div>
                {/* レバー回転エフェクト */}
                <div className="absolute" style={{right:24,top:'38%'}}>
                  <div style={{
                    width:16,height:44,
                    background:G,
                    borderRadius:8,
                    transformOrigin:'bottom center',
                    animation:'g-lever .6s ease-in-out .3s forwards',
                    boxShadow:'0 0 14px rgba(218,165,32,.7)',
                  }} />
                </div>
                {/* ✦ エフェクト */}
                {['16%','50%','82%'].map((l,i)=>(
                  <div key={i} className="absolute" style={{top:'20%',left:l,fontSize:18,color:'#ffd700',
                    animation:`g-sparkle ${.6+i*.2}s ease-in-out infinite`,animationDelay:`${i*.15}s`}}>✦</div>
                ))}
              </div>
              <p style={{fontSize:12,color:'rgba(255,255,255,.55)'}} className="animate-pulse">
                レバーを回すとガチャが動きます
              </p>
            </div>
          )}

          {/* ══ カプセル排出（③ 宇宙演出）══ */}
          {phase==='capsule_out' && (
            <div className="flex flex-col items-center gap-5 w-full">
              <p style={{fontSize:13,color:'#ffd700',fontWeight:700}}>③ カプセル排出</p>
              {/* 宇宙背景 */}
              <div className="relative flex items-center justify-center overflow-hidden rounded-2xl w-full"
                style={{height:240,background:SPACE,border:'1px solid rgba(184,134,11,.35)'}}>
                {/* 星 */}
                {Array.from({length:18},(_,i)=>({
                  x:`${5+i*5.5}%`,y:`${8+(i*13)%80}%`,s:.9+Math.random()*.8,d:i*.18
                })).map((s,i)=>(
                  <div key={i} className="absolute rounded-full bg-white"
                    style={{left:s.x,top:s.y,width:s.s*2.2,height:s.s*2.2,
                      animation:`g-star ${1.2+i*.2}s ease-in-out infinite`,animationDelay:`${s.d}s`}} />
                ))}
                {/* 光柱 */}
                <div className="absolute inset-0 flex items-start justify-center pointer-events-none">
                  <div style={{width:90,height:'100%',
                    background:'radial-gradient(ellipse at 50% 0%,rgba(255,200,50,.4) 0%,rgba(160,80,255,.18) 45%,transparent 80%)'}} />
                </div>
                {/* 回転台座 */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2" style={{
                  width:100,height:22,borderRadius:'50%',
                  border:'1.5px solid rgba(218,165,32,.6)',
                  boxShadow:'0 0 16px rgba(218,165,32,.4)',
                }} />
                {/* キャプセル（飛び出す） */}
                <div className="absolute" style={{
                  bottom:50,left:'50%',transform:'translateX(-50%)',
                  width:52,height:52,
                  animation:'g-capsule-fly .7s ease-out forwards',
                }}>
                  <div style={{width:52,height:26,borderRadius:'50% 50% 0 0',
                    background:'radial-gradient(ellipse at 42% 35%,#d8e0e0,#707880)',
                    border:'2px solid rgba(220,230,230,.85)',
                    boxShadow:'inset 0 3px 8px rgba(255,255,255,.35)',
                  }} />
                  <div style={{width:52,height:26,borderRadius:'0 0 50% 50%',
                    background:'radial-gradient(ellipse at 42% 65%,#505860,#383e48)',
                    border:'2px solid rgba(160,170,180,.6)',
                  }} />
                </div>
                {/* 周辺球 */}
                {[
                  {c:BALL_COLORS[0].grad,x:'18%',y:'28%',s:18,d:'.1s'},
                  {c:BALL_COLORS[3].grad,x:'74%',y:'20%',s:22,d:'.25s'},
                  {c:BALL_COLORS[1].grad,x:'78%',y:'58%',s:16,d:'.4s'},
                  {c:BALL_COLORS[2].grad,x:'14%',y:'62%',s:16,d:'.55s'},
                ].map((b,i)=>(
                  <div key={i} className="absolute rounded-full" style={{
                    left:b.x,top:b.y,width:b.s,height:b.s,background:b.c,
                    border:'1px solid rgba(255,255,255,.2)',
                    animation:`g-float ${1.6+i*.3}s ease-in-out infinite`,animationDelay:b.d,
                  }} />
                ))}
              </div>
              <p style={{fontSize:12,color:'rgba(255,255,255,.55)'}} className="animate-pulse">
                宇宙のような神秘的な演出の中、カプセルが落下します
              </p>
            </div>
          )}

          {/* ══ カプセル落下（④）══ */}
          {phase==='capsule_fall' && (
            <div className="flex flex-col items-center gap-5 w-full">
              <p style={{fontSize:13,color:'#ffd700',fontWeight:700}}>④ カプセル落下</p>
              <div className="relative flex items-center justify-center overflow-hidden rounded-2xl w-full"
                style={{height:240,background:SPACE,border:'1px solid rgba(184,134,11,.35)'}}>
                {/* キャプセル落下 */}
                <div style={{
                  position:'absolute',top:20,left:'50%',transform:'translateX(-50%)',
                  width:60,height:60,
                  animation:'g-capsule-fall .85s ease-in forwards',
                }}>
                  <div style={{width:60,height:30,borderRadius:'50% 50% 0 0',
                    background:'radial-gradient(ellipse at 42% 35%,#d8e0e0,#707880)',
                    border:'2px solid rgba(220,230,230,.85)',
                    boxShadow:'inset 0 3px 8px rgba(255,255,255,.35)',
                  }} />
                  <div style={{width:60,height:30,borderRadius:'0 0 50% 50%',
                    background:'radial-gradient(ellipse at 42% 65%,#505860,#383e48)',
                    border:'2px solid rgba(160,170,180,.6)',
                  }} />
                </div>
                {/* 軌跡パーティクル */}
                {Array.from({length:6},(_,i)=>({
                  x:`${40+i*3.5}%`,y:`${15+i*10}%`,s:4-i*.4,op:.9-i*.13
                })).map((p,i)=>(
                  <div key={i} className="absolute rounded-full"
                    style={{left:p.x,top:p.y,width:p.s,height:p.s,
                      background:`rgba(218,165,32,${p.op})`}} />
                ))}
              </div>
              <p style={{fontSize:12,color:'rgba(255,255,255,.55)'}} className="animate-pulse">
                カプセルが下へ落ちていきます
              </p>
            </div>
          )}

          {/* ══ カプセル開封 ══ */}
          {phase==='opening' && (
            <div className="flex flex-col items-center gap-5 w-full">
              <p style={{fontSize:13,color:'#ffd700',fontWeight:700}}>カプセル開封！</p>
              <div className="relative flex flex-col items-center" style={{height:200}}>
                <div style={{width:0,height:0,position:'relative'}}>
                  <div style={{position:'absolute',left:-70,top:0,
                    width:140,height:70,borderRadius:'50% 50% 0 0',
                    background:'radial-gradient(ellipse at 42% 35%,#d8e0e0,#707880)',
                    border:'2.5px solid rgba(220,230,230,.85)',
                    boxShadow:'inset 0 4px 12px rgba(255,255,255,.35)',
                    animation:'g-split-t .55s ease-out .2s forwards',transformOrigin:'bottom center',
                  }} />
                  <div style={{position:'absolute',left:-70,top:70,
                    width:140,height:70,borderRadius:'0 0 50% 50%',
                    background:'radial-gradient(ellipse at 42% 65%,#505860,#383e48)',
                    border:'2.5px solid rgba(160,170,180,.6)',
                    animation:'g-split-b .55s ease-out .2s forwards',transformOrigin:'top center',
                  }} />
                </div>
                {/* 光爆発 */}
                <div className="absolute top-16 left-1/2 -translate-x-1/2">
                  {[0,1,2].map(i=>(
                    <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{width:50+i*50,height:50+i*50,
                        background:`rgba(218,165,32,${.04-i*.01})`,
                        animation:`g-ring ${.6+i*.3}s ease-out ${.3+i*.15}s forwards`}} />
                  ))}
                </div>
              </div>
              <p style={{fontSize:12,color:'rgba(255,255,255,.6)'}} className="animate-pulse">カプセルが開きます…</p>
            </div>
          )}

          {/* ══ 結果：1連 ══ */}
          {phase==='done' && spinResult && !isMulti && (
            <div className="g-reveal flex flex-col items-center gap-5 w-full max-w-xs">
              {/* 結果演出画面ヘッダー */}
              <p style={{fontSize:12,color:'#daa520',fontWeight:700,letterSpacing:'0.1em'}}>
                ◆ カプセル開封 〜 結果表示 ◆
              </p>

              {spinResult.wasGuaranteed&&(
                <p style={{fontSize:12,fontWeight:700,color:'#ffd700'}} className="animate-pulse">
                  ✨ 確定演出が発動しました！
                </p>
              )}

              {spinResult.results.map((prize,i)=>{
                const bc=BALL_COLORS.find(b=>b.id===prize.prizeId)??BALL_COLORS[0]
                const pl=PRIZE_LABEL[prize.prizeId]
                const isInmu=prize.type==='inmu'
                return (
                  <div key={i} className="flex flex-col items-center gap-3 w-full">
                    {/* 大きなキャプセルボール */}
                    <div className={isInmu?'g-glow':''} style={{
                      width:120,height:120,borderRadius:'50%',
                      background:bc.grad,
                      border:`4px solid ${bc.bdr}`,
                      boxShadow:`0 0 ${isInmu?'50px 20px':'20px 8px'} ${bc.glow}88`,
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                    }}>
                      {pl?.label.split('\n').map((l,j)=>(
                        <span key={j} style={{fontSize:isInmu?16:20,fontWeight:900,color:'#fff',
                          textShadow:'0 1px 6px rgba(0,0,0,.8)',lineHeight:1.2}}>{l}</span>
                      ))}
                    </div>

                    {/* おめでとうテキスト */}
                    <div className="text-center rounded-xl px-6 py-3 w-full" style={{
                      background:isInmu?'linear-gradient(135deg,#3d1f00,#5c3000)':'rgba(18,14,2,.8)',
                      border:`1px solid ${bc.bdr}66`,
                    }}>
                      <p style={{fontWeight:900,fontSize:isInmu?18:16,
                        color:isInmu?'#ffd700':'#e0d0b0',
                        textShadow:isInmu?'0 0 20px rgba(255,215,0,.7)':'none'}}>
                        {pl?.sub}
                      </p>
                      {isInmu&&(
                        <>
                          <p style={{fontSize:13,fontWeight:900,color:'#ffd700',marginTop:4}}>
                            おめでとうございます！
                          </p>
                          <p style={{fontSize:11,color:'rgba(253,230,138,.7)',marginTop:4,lineHeight:1.5}}>
                            報酬は後日送付されます。
                          </p>
                          {/* 特別演出（INMU当選時） */}
                          <div className="flex items-center justify-center gap-3 mt-4">
                            <div className="flex flex-col items-center gap-1">
                              <span style={{fontSize:20,animation:'g-sparkle 1s ease-in-out infinite'}}>✨</span>
                              <span style={{fontSize:8,color:'rgba(255,215,0,.7)'}}>金色発光</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <span style={{fontSize:20,animation:'g-flash 1s ease-in-out infinite'}}>💫</span>
                              <span style={{fontSize:8,color:'rgba(255,215,0,.7)'}}>背景フラッシュ</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <img src={mascotImg} alt="" className="rounded-full object-cover"
                                style={{width:32,height:32,border:'1.5px solid #daa520',
                                  animation:'g-bounce 1s ease-in-out infinite'}} />
                              <span style={{fontSize:8,color:'rgba(255,215,0,.7)'}}>インムくん</span>
                            </div>
                          </div>
                        </>
                      )}
                      {prize.type==='points'&&(
                        <p style={{fontSize:11,color:'rgba(255,255,255,.5)',marginTop:4}}>
                          ポイントを即時付与しました
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ══ 結果：10連グリッド ══ */}
          {phase==='done' && spinResult && isMulti && (
            <div className="g-reveal flex flex-col gap-4 w-full max-w-xs">
              <p style={{fontSize:12,color:'#daa520',fontWeight:700,letterSpacing:'0.1em',textAlign:'center'}}>
                ◆ カプセル開封 〜 結果表示 ◆
              </p>
              {spinResult.wasGuaranteed&&(
                <p style={{fontSize:12,fontWeight:700,color:'#ffd700',textAlign:'center'}} className="animate-pulse">
                  ✨ 確定演出が発動しました！
                </p>
              )}

              {/* ボール結果グリッド */}
              <div className="grid grid-cols-2 gap-3">
                {spinResult.results.map((prize,i)=>{
                  const bc=BALL_COLORS.find(b=>b.id===prize.prizeId)??BALL_COLORS[0]
                  const pl=PRIZE_LABEL[prize.prizeId]
                  const isInmu=prize.type==='inmu'
                  return (
                    <div key={i} className={`flex flex-col items-center gap-1.5 ${i<revealIdx?'g-card':'opacity-0'}`}>
                      <div className={isInmu?'g-glow':''} style={{
                        width:72,height:72,borderRadius:'50%',
                        background:bc.grad,
                        border:`3px solid ${bc.bdr}`,
                        boxShadow:`0 0 ${isInmu?30:12}px ${bc.glow}88`,
                        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                      }}>
                        {pl?.label.split('\n').map((l,j)=>(
                          <span key={j} style={{fontSize:isInmu?10:13,fontWeight:900,color:'#fff',
                            textShadow:'0 1px 4px rgba(0,0,0,.8)',lineHeight:1.2}}>{l}</span>
                        ))}
                      </div>
                      <p style={{fontSize:10,color:isInmu?'#ffd700':'rgba(255,255,255,.75)',
                        textAlign:'center',lineHeight:1.2}}>
                        {pl?.sub}
                      </p>
                    </div>
                  )
                })}
              </div>

              {spinResult.totalPoints>0&&(
                <p style={{fontSize:13,color:'#ffd700',textAlign:'center',fontWeight:700}}>
                  合計 +{spinResult.totalPoints.toLocaleString()} pt 獲得！
                </p>
              )}
              {spinResult.hasInmu&&(
                <div className="rounded-xl p-4 text-center g-glow" style={{
                  background:'linear-gradient(135deg,#3d1f00,#5c3000)',border:'2px solid #daa520'}}>
                  <p style={{fontWeight:900,fontSize:16,color:'#ffd700'}}>🏆 10,000 INMU 当選！</p>
                  <p style={{fontSize:11,color:'rgba(253,230,138,.8)',marginTop:4,lineHeight:1.5}}>
                    おめでとうございます！<br/>報酬は後日運営より送金されます
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
