import { useState, useEffect, useCallback, useRef } from 'react'
import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown, RefreshCw } from 'lucide-react'
import mascotImg from '@assets/IMG_4397_1782097134955.jpeg'
import coinImg   from '@assets/IMG_6637_1782097134955.jpeg'

/* ─── 型 ─── */
type Phase = 'idle'|'guaranteed'|'inserting'|'lever'|'space'|'falling'|'opening'|'done'
type Prize = { prizeId:string; label:string; type:'points'|'inmu'; amount:number }
type Result = {
  results:Prize[]; totalPoints:number; hasInmu:boolean
  wasGuaranteed:boolean; costPoints:number; newPoints:number
}
type HistRow = {
  id:number; pullType:string; results:Prize[]; totalPoints:number; hasInmu:boolean
  inmuSentStatus:string; wasGuaranteed:boolean; costPoints:number; createdAt:string
}

/* ─── デザイントークン ─── */
const GOLD     = 'linear-gradient(145deg,#7c5a00,#b8860b 25%,#daa520 50%,#b8860b 75%,#7c5a00)'
const GOLD_BTN = 'linear-gradient(145deg,#5c3e00,#a07010 30%,#c89010 50%,#a07010 70%,#5c3e00)'
const RED_BTN  = 'linear-gradient(145deg,#4a0000,#880000 30%,#c01818 50%,#880000 70%,#4a0000)'
const METAL    = 'linear-gradient(180deg,#3a3020 0%,#2a2010 50%,#1a1208 100%)'
const DOME_BG  = 'radial-gradient(circle at 42% 36%,#241c3e 0%,#120e20 55%,#080512 100%)'
const SPACE_BG = 'radial-gradient(ellipse at 50% 20%,#1e0848 0%,#0d0520 45%,#040210 100%)'
const PAGE_BG  = '#070412'

const BALLS = [
  { id:'pts100',  label:'100pt',       rate:'88%', grad:'radial-gradient(circle at 35% 32%,#c8d0d0,#404848)', glow:'#90a0a0' },
  { id:'pts1000', label:'1,000pt',     rate:'8%',  grad:'radial-gradient(circle at 35% 32%,#70a0e8,#0a2070)', glow:'#5090e0' },
  { id:'pts5000', label:'5,000pt',     rate:'3%',  grad:'radial-gradient(circle at 35% 32%,#d870e8,#400888)', glow:'#c060e0' },
  { id:'inmu10k', label:'10,000 INMU', rate:'1%',  grad:'radial-gradient(circle at 35% 32%,#fcd040,#7a5000)', glow:'#f8c030' },
]
const PRIZE_LABEL: Record<string,string> = {
  pts100:'100pt', pts1000:'1,000pt', pts5000:'5,000pt', inmu10k:'10,000\nINMU'
}
const PHASE_MS: Partial<Record<Phase,number>> = {
  guaranteed:3200, inserting:1200, lever:1000, space:1800, falling:900, opening:750,
}
const CLAP_POS = [
  { w:96, pos:{bottom:0,left:'50%',transform:'translateX(-50%)',zIndex:10}, delay:0   },
  { w:76, pos:{bottom:0,left:14,  zIndex:8 },  delay:180 },
  { w:76, pos:{bottom:0,right:14, zIndex:8 },  delay:360 },
  { w:60, pos:{bottom:64,left:30, zIndex:7 },  delay:540 },
  { w:60, pos:{bottom:64,right:30,zIndex:7 },  delay:720 },
]

const CSS = `
  @keyframes ga-float  { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-10px)} }
  @keyframes ga-star   { 0%,100%{opacity:.08;transform:scale(.7)} 50%{opacity:1;transform:scale(1.2)} }
  @keyframes ga-spin   { to{transform:rotate(720deg)} }
  @keyframes ga-pulse  { 0%,100%{text-shadow:0 0 6px rgba(218,165,32,.2)} 50%{text-shadow:0 0 28px rgba(255,215,0,.9),0 0 56px rgba(218,165,32,.45)} }
  @keyframes ga-glow   { 0%,100%{box-shadow:0 0 14px 4px rgba(218,165,32,.45)} 50%{box-shadow:0 0 50px 20px rgba(218,165,32,.9)} }
  @keyframes ga-clap   { 0%,100%{transform:translateY(0)scale(1)} 35%{transform:translateY(-20px)scale(1.09)} 70%{transform:translateY(-8px)scale(1.03)} }
  @keyframes ga-popin  { 0%{transform:scale(0)rotate(-18deg);opacity:0} 65%{transform:scale(1.18)rotate(4deg);opacity:1} 100%{transform:scale(1)rotate(0);opacity:1} }
  @keyframes ga-hand   { 0%{transform:translateY(0);opacity:1} 100%{transform:translateY(-54px);opacity:0} }
  @keyframes ga-burst  { 0%{opacity:0;transform:scale(.3)} 65%{opacity:1;transform:scale(1.06)} 100%{opacity:1;transform:scale(1)} }
  @keyframes ga-sparkle{ 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1.4)} }
  @keyframes ga-ring   { 0%{transform:scale(1);opacity:.65} 100%{transform:scale(2.8);opacity:0} }
  @keyframes ga-drop   { 0%{transform:translateY(-110px)rotate(0);opacity:0} 70%{transform:translateY(6px)rotate(200deg);opacity:1} 100%{transform:translateY(0)rotate(360deg);opacity:1} }
  @keyframes ga-lever  { 0%{transform:rotate(0deg)} 50%,100%{transform:rotate(-40deg)} }
  @keyframes ga-fly    { 0%{transform:translateY(60px)scale(.3);opacity:0} 55%{transform:translateY(-80px)scale(1.08);opacity:1} 100%{transform:translateY(-60px)scale(1);opacity:1} }
  @keyframes ga-fall   { 0%{transform:translateY(-60px);opacity:1} 100%{transform:translateY(200px)rotate(25deg);opacity:0} }
  @keyframes ga-split-t{ to{transform:translateY(-52px)rotate(-16deg)} }
  @keyframes ga-split-b{ to{transform:translateY(52px)rotate(16deg)} }
  @keyframes ga-reveal { from{transform:scale(.6)translateY(20px);opacity:0} to{transform:scale(1)translateY(0);opacity:1} }
  @keyframes ga-card   { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes ga-bounce { 0%,100%{transform:translateY(0)} 40%{transform:translateY(-24px)} 70%{transform:translateY(-10px)} }
  .ga-float{animation:ga-float 2.6s ease-in-out infinite}
  .ga-pulse{animation:ga-pulse 2s ease-in-out infinite}
  .ga-glow{animation:ga-glow 1.3s ease-in-out infinite}
  .ga-reveal{animation:ga-reveal .4s ease-out forwards}
`

/* ═══════ ガチャマシン（スタンドアロンコンポーネント）═══════ */
function Machine({ size=280 }: { size?:number }) {
  const body = Math.round(size * .85)
  const dome = size
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:size}}>
      {/* アーチ */}
      <div style={{width:dome,height:Math.round(dome*.12),background:GOLD,
        borderRadius:`${dome*.5}px ${dome*.5}px 0 0`,
        boxShadow:'0 -4px 20px rgba(218,165,32,.6)',
        display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontSize:Math.round(dome*.046),color:'#ffe080',fontWeight:900,letterSpacing:'0.2em'}}>
          ★★ INMU ★★
        </span>
      </div>

      {/* ドーム */}
      <div style={{width:dome,height:dome,background:DOME_BG,
        border:'5px solid #b8860b',borderTop:'none',
        boxShadow:'0 0 50px rgba(184,134,11,.5),inset 0 0 80px rgba(0,0,0,.85)',
        position:'relative',overflow:'hidden',
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>

        {/* 星 */}
        {Array.from({length:16},(_,i)=>({
          x: [14,60,dome-42,dome-18,10,dome-22,26,dome-34,82,110,dome-70,dome-80,44,dome*.6,20,dome*.7][i],
          y: [18,10,22,66,88,108,140,154,dome-30,8,48,dome-24,dome*.5,22,dome*.35,dome*.65][i],
          s: [2.4,1.6,2.6,1.8,2,2.4,1.4,2.2,1.8,1.6,2,1.6,1.8,1.4,2.2,1.6][i],
        })).map((s,i)=>(
          <div key={i} className="absolute rounded-full bg-white"
            style={{left:s.x,top:s.y,width:s.s,height:s.s,
              animation:`ga-star ${1.4+i*.2}s ease-in-out ${i*.17}s infinite`}} />
        ))}

        {/* コイン（中央浮遊） */}
        <img src={coinImg} alt="" className="ga-float rounded-full object-cover"
          style={{width:dome*.36,height:dome*.36,
            border:`${Math.max(3,dome*.012)}px solid #daa520`,
            boxShadow:'0 0 36px rgba(218,165,32,.95),inset 0 2px 8px rgba(255,255,255,.3)',
            position:'relative',zIndex:5,marginTop:'-8%'}} />

        {/* キャプセル球（下部に散らばる）*/}
        {[
          {x:.05,y:.72,c:BALLS[0].grad,s:.13},{x:.24,y:.78,c:BALLS[1].grad,s:.12},
          {x:.75,y:.74,c:BALLS[2].grad,s:.14},{x:.87,y:.80,c:BALLS[3].grad,s:.15},
          {x:.48,y:.82,c:BALLS[0].grad,s:.11},{x:.62,y:.79,c:BALLS[1].grad,s:.10},
        ].map((b,i)=>(
          <div key={i} className="absolute rounded-full" style={{
            left:b.x*dome, top:b.y*dome,
            width:b.s*dome, height:b.s*dome,
            background:b.c,
            border:'1.5px solid rgba(255,255,255,.22)',
            boxShadow:'inset 0 2px 5px rgba(255,255,255,.3)',
          }} />
        ))}

        {/* 1114514 */}
        <p style={{position:'absolute',top:dome*.1,left:'50%',transform:'translateX(-50%)',
          fontSize:dome*.044,fontWeight:700,letterSpacing:'0.22em',fontFamily:'monospace',
          color:'rgba(218,165,32,.45)',whiteSpace:'nowrap'}}>1114514</p>
      </div>

      {/* ボディ */}
      <div style={{width:body,background:METAL,border:'4px solid #b8860b',borderTop:'none',position:'relative'}}>
        {/* INSERT COIN */}
        <div style={{borderBottom:'1px solid rgba(184,134,11,.35)',display:'flex',
          alignItems:'center',justifyContent:'center',gap:10,padding:'7px 0'}}>
          <div style={{width:30,height:20,background:'radial-gradient(circle at 38% 38%,#daa520,#7c5a00)',
            borderRadius:4,border:'1.5px solid #b8860b',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <img src={coinImg} alt="" style={{width:15,height:15,borderRadius:'50%',objectFit:'cover'}} />
          </div>
          <div>
            <p style={{fontSize:8,color:'#b8860b',fontWeight:900,letterSpacing:'0.2em',margin:0}}>INSERT COIN</p>
            <p style={{fontSize:7,color:'rgba(184,134,11,.65)',margin:0}}>INMU COIN ONLY</p>
          </div>
        </div>
        {/* コインドア */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'8px 0'}}>
          <div style={{width:60,height:38,background:'radial-gradient(circle at 40% 40%,#c8a050,#7c5a00)',
            borderRadius:8,border:'2px solid #daa520',boxShadow:'0 0 14px rgba(218,165,32,.45)',
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontSize:20}}>🪙</span>
          </div>
        </div>
        {/* レバー */}
        <div style={{position:'absolute',right:-22,top:6,display:'flex',flexDirection:'column',alignItems:'center'}}>
          <div style={{width:16,height:16,borderRadius:'50%',background:'radial-gradient(circle at 38% 35%,#daa520,#7c5a00)',
            border:'2px solid #b8860b',boxShadow:'0 0 12px rgba(218,165,32,.7)'}} />
          <div style={{width:6,height:36,background:GOLD,borderRadius:4}} />
          <div style={{width:14,height:10,background:'linear-gradient(to bottom,#b8860b,#7c5a00)',borderRadius:3}} />
        </div>
      </div>

      {/* ベース */}
      <div style={{width:dome,height:Math.round(dome*.11),
        background:'linear-gradient(180deg,#2a2010,#151008)',
        border:'4px solid #b8860b',borderTop:'none',
        borderRadius:`0 0 ${dome*.08}px ${dome*.08}px`,
        boxShadow:'0 8px 30px rgba(0,0,0,.75)'}} />
    </div>
  )
}

/* ═══════════════════════ メインページ ═══════════════════════ */
export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts, setPts]         = useState(0)
  const [ptsLoading, setLoading] = useState(true)
  const [phase, setPhase]     = useState<Phase>('idle')
  const [result, setResult]   = useState<Result|null>(null)
  const [revIdx, setRevIdx]   = useState(0)
  const [history, setHistory] = useState<HistRow[]>([])
  const [histOpen, setHistOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null)

  /* ── ポイント（useAuthにmonthlyPointsがないため直接fetch）── */
  const loadPts = useCallback(async () => {
    try {
      const r = await fetch('/api/profile', {credentials:'include'})
      if (r.ok) {
        const d = await r.json() as {monthlyPoints?:string|number}
        setPts(Number(d.monthlyPoints??0))
      }
    } catch {/**/ } finally { setLoading(false) }
  }, [])
  useEffect(()=>{ loadPts() },[loadPts])

  const loadHist = useCallback(async()=>{
    try {
      const r = await fetch('/api/gacha/history',{credentials:'include'})
      const d = await r.json() as HistRow[]
      setHistory(Array.isArray(d)?d:[])
    } catch {/**/ }
  },[])
  useEffect(()=>{ loadHist() },[loadHist])

  /* ── フェーズ進行 ── */
  const clr = ()=>{ if(timer.current) clearTimeout(timer.current) }
  const after = (ms:number,next:Phase)=>{ clr(); timer.current=setTimeout(()=>setPhase(next),ms) }
  useEffect(()=>()=>clr(),[])

  useEffect(()=>{
    if      (phase==='guaranteed') after(PHASE_MS.guaranteed!, 'inserting')
    else if (phase==='inserting')  after(PHASE_MS.inserting!,  'lever')
    else if (phase==='lever')      after(PHASE_MS.lever!,      'space')
    else if (phase==='space')      after(PHASE_MS.space!,      'falling')
    else if (phase==='falling')    after(PHASE_MS.falling!,    'opening')
    else if (phase==='opening')    after(PHASE_MS.opening!,    'done')
  },[phase])

  useEffect(()=>{
    if (phase==='done' && result && result.results.length>1 && revIdx<result.results.length) {
      const t=setTimeout(()=>setRevIdx(i=>i+1),160); return ()=>clearTimeout(t)
    }
  },[phase,result,revIdx])

  async function spin(type:'single'|'multi') {
    if (phase!=='idle') return
    const cost = type==='multi'?10000:1000
    if (pts<cost) { toast.error(`ポイント不足 (必要: ${cost.toLocaleString()}pt)`); return }
    try {
      const res = await fetch('/api/gacha/spin',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({type})})
      if (!res.ok) { const e=await res.json().catch(()=>({})) as {error?:string}; throw new Error(e.error??'エラー') }
      const r = await res.json() as Result
      setResult(r); setRevIdx(0); setPts(r.newPoints)
      setPhase(r.wasGuaranteed?'guaranteed':'inserting')
    } catch(e){ toast.error(e instanceof Error?e.message:'エラーが発生しました') }
  }

  const reset = ()=>{ clr(); setPhase('idle'); setResult(null); setRevIdx(0); loadPts(); loadHist() }
  const isMulti = (result?.results.length??0)>1

  /* ═══════════════════ IDLE（トップ画面）═══════════════════ */
  if (phase==='idle') return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>

      <div style={{background:PAGE_BG,minHeight:'100dvh',display:'flex',flexDirection:'column',
        paddingBottom:132}}>

        {/* タイトル */}
        <div style={{textAlign:'center',paddingTop:20,paddingBottom:8}}>
          <h1 className="ga-pulse" style={{fontSize:26,fontWeight:900,color:'#daa520',
            fontFamily:'Georgia,serif',letterSpacing:'0.1em',margin:0}}>
            ✦ INMU GACHA ✦
          </h1>
          <p style={{fontSize:11,color:'rgba(255,255,255,.5)',marginTop:4}}>
            INMUコインを投入してガチャを引こう！
          </p>
        </div>

        {/* ── ガチャマシン（中央・大きく）── */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',paddingTop:8,paddingBottom:4}}>
          <Machine size={288} />
          {/* マスコット */}
          <div style={{display:'flex',alignItems:'flex-end',gap:10,marginTop:12,paddingLeft:16,paddingRight:16,width:'100%',maxWidth:320}}>
            <img src={mascotImg} alt="インムくん"
              style={{width:60,height:60,borderRadius:'50%',objectFit:'cover',flexShrink:0,
                border:'2px solid rgba(184,134,11,.65)',boxShadow:'0 0 14px rgba(184,134,11,.35)'}} />
            <div style={{background:'rgba(18,12,2,.92)',border:'1px solid rgba(184,134,11,.4)',
              borderRadius:'14px 14px 14px 0',padding:'7px 12px',flex:1}}>
              <p style={{fontSize:11,color:'#f5deb3',lineHeight:1.6,margin:0}}>
                何が出るかな？<br/>ワクワクするね！
              </p>
            </div>
          </div>
        </div>

        {/* ── 排出率カード（横並び）── */}
        <div style={{paddingLeft:14,paddingRight:14,paddingTop:16}}>
          <p style={{fontSize:10,color:'rgba(184,134,11,.8)',textAlign:'center',marginBottom:8,
            letterSpacing:'0.15em',fontWeight:700}}>★ 排出率 ★</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
            {BALLS.map(b=>(
              <div key={b.id} style={{
                background:'linear-gradient(160deg,#1a1200,#261a00)',
                border:'1px solid rgba(184,134,11,.5)',
                borderRadius:12,
                padding:'10px 4px',
                display:'flex',flexDirection:'column',alignItems:'center',gap:5,
              }}>
                <div style={{width:28,height:28,borderRadius:'50%',background:b.grad,
                  border:'1.5px solid rgba(255,255,255,.22)',
                  boxShadow:`0 0 10px ${b.glow}88`}} />
                <div style={{textAlign:'center'}}>
                  {b.label.split(' ').map((l,i)=>(
                    <p key={i} style={{fontSize:9,color:'#e0d0b0',lineHeight:1.25,margin:0}}>{l}</p>
                  ))}
                  <p style={{fontSize:12,fontWeight:900,color:'#daa520',fontFamily:'monospace',
                    marginTop:2,margin:0}}>{b.rate}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ガチャ履歴 ── */}
        <div style={{paddingLeft:14,paddingRight:14,paddingTop:20}}>
          <button type="button"
            onClick={()=>{ setHistOpen(o=>!o); if(!histOpen) loadHist() }}
            style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
              background:'rgba(18,14,2,.8)',border:'1px solid rgba(184,134,11,.4)',
              borderRadius:10,padding:'10px 14px',cursor:'pointer'}}>
            <span style={{fontSize:12,fontWeight:700,color:'rgba(184,134,11,.9)'}}>📜 ガチャ履歴</span>
            {histOpen
              ? <ChevronDown size={14} color="rgba(184,134,11,.7)" />
              : <ChevronRight size={14} color="rgba(184,134,11,.7)" />}
          </button>

          {histOpen && (
            <div style={{marginTop:4,borderRadius:10,overflow:'hidden',
              border:'1px solid rgba(184,134,11,.3)',background:'rgba(10,8,2,.7)'}}>
              {history.length===0 ? (
                <p style={{textAlign:'center',fontSize:12,color:'rgba(255,255,255,.35)',padding:'16px 0'}}>
                  ガチャ履歴がありません
                </p>
              ) : history.map((row,i)=>{
                const label = row.hasInmu
                  ? '🏆 10,000 INMU 獲得！'
                  : row.totalPoints>0
                    ? `+${row.totalPoints.toLocaleString()} pt 獲得`
                    : `${row.costPoints.toLocaleString()}pt 消費`
                const time = new Date(row.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})
                return (
                  <div key={row.id} style={{
                    display:'flex',alignItems:'center',padding:'9px 14px',
                    borderBottom:i<history.length-1?'1px solid rgba(184,134,11,.15)':'none',
                  }}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                        <span style={{fontSize:10,fontWeight:700,
                          color:row.pullType==='multi'?'#e07060':'#a09060'}}>
                          {row.pullType==='multi'?'10連':'1連'}
                        </span>
                        {row.wasGuaranteed&&(
                          <span style={{fontSize:8,padding:'1px 5px',borderRadius:3,
                            background:'rgba(218,165,32,.18)',color:'#daa520',
                            border:'1px solid rgba(218,165,32,.45)'}}>✨確定</span>
                        )}
                      </div>
                      <p style={{fontSize:11,color:row.hasInmu?'#ffd700':'rgba(255,255,255,.7)',
                        margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {label}
                      </p>
                    </div>
                    <span style={{fontSize:10,color:'rgba(255,255,255,.35)',flexShrink:0,marginLeft:8}}>
                      {time}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 固定フッター: ポイント + ボタン ── */}
      <div style={{
        position:'fixed',bottom:0,left:0,right:0,
        background:'linear-gradient(to top,rgba(4,3,10,.98) 85%,transparent)',
        backdropFilter:'blur(8px)',
        padding:'10px 14px 24px',
        zIndex:50,
      }}>
        {/* 保有ポイント */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          background:'linear-gradient(135deg,rgba(18,12,0,.9),rgba(28,20,0,.9))',
          border:'1px solid rgba(184,134,11,.55)',borderRadius:12,
          padding:'8px 16px',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <img src={coinImg} alt="" style={{width:22,height:22,borderRadius:'50%',objectFit:'cover'}} />
            <span style={{fontSize:11,color:'#c8a060',fontWeight:600}}>保有ポイント</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{fontFamily:'monospace',fontWeight:900,fontSize:20,color:'#ffd700',
              textShadow:'0 0 16px rgba(255,215,0,.5)'}}>
              {ptsLoading ? '---' : pts.toLocaleString()}
            </span>
            <span style={{fontSize:13,color:'#c8a060',fontWeight:600}}> pt</span>
          </div>
        </div>

        {/* 1連 / 10連 ボタン */}
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>spin('single')} disabled={pts<1000||ptsLoading}
            style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
              justifyContent:'center',padding:'14px 0',borderRadius:14,
              background:pts>=1000&&!ptsLoading?GOLD_BTN:'#1a1400',
              border:`2px solid ${pts>=1000&&!ptsLoading?'rgba(218,165,32,.85)':'rgba(184,134,11,.3)'}`,
              boxShadow:pts>=1000&&!ptsLoading?'0 4px 24px rgba(184,134,11,.5),inset 0 1px 0 rgba(255,255,255,.18)':'none',
              opacity:pts<1000||ptsLoading?.35:1,cursor:pts<1000||ptsLoading?'not-allowed':'pointer',
              transition:'transform .1s',}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <img src={coinImg} alt="" style={{width:20,height:20,borderRadius:'50%',objectFit:'cover'}} />
              <span style={{fontWeight:900,fontSize:16,color:'#fff8e1',textShadow:'0 1px 6px rgba(0,0,0,.8)'}}>
                1連ガチャ
              </span>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:'rgba(255,248,225,.7)',marginTop:2}}>
              1,000 pt
            </span>
          </button>

          <button onClick={()=>spin('multi')} disabled={pts<10000||ptsLoading}
            style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
              justifyContent:'center',padding:'14px 0',borderRadius:14,
              background:pts>=10000&&!ptsLoading?RED_BTN:'#1a0000',
              border:`2px solid ${pts>=10000&&!ptsLoading?'rgba(185,28,28,.85)':'rgba(185,28,28,.3)'}`,
              boxShadow:pts>=10000&&!ptsLoading?'0 4px 24px rgba(185,28,28,.5),inset 0 1px 0 rgba(255,255,255,.18)':'none',
              opacity:pts<10000||ptsLoading?.35:1,cursor:pts<10000||ptsLoading?'not-allowed':'pointer',
              transition:'transform .1s'}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <img src={coinImg} alt="" style={{width:20,height:20,borderRadius:'50%',objectFit:'cover'}} />
              <span style={{fontWeight:900,fontSize:16,color:'#fff8f8',textShadow:'0 1px 6px rgba(0,0,0,.8)'}}>
                10連ガチャ
              </span>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:'rgba(255,248,248,.7)',marginTop:2}}>
              10,000 pt
            </span>
          </button>
        </div>
      </div>
    </AppShell>
  )

  /* ═══════════════════ 演出 + 結果（2・3段階）═══════════════════ */
  const stepLabel: Partial<Record<Phase,string>> = {
    guaranteed:'✦ 確定演出 ✦', inserting:'① コイン投入', lever:'② レバー回転',
    space:'③ カプセル排出', falling:'④ カプセル落下', opening:'カプセル開封！',
    done:'◆ 結果発表 ◆',
  }

  return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>

      <div style={{background:SPACE_BG,minHeight:'100dvh',display:'flex',flexDirection:'column'}}>
        {/* ヘッダー */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'16px 16px 12px'}}>
          <div>
            <h1 style={{margin:0,fontSize:17,fontWeight:900,color:'#daa520',fontFamily:'Georgia,serif'}}
              className="ga-pulse">✦ INMU GACHA ✦</h1>
            <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.5)',marginTop:2}}>
              所持: <strong style={{color:'#ffd700'}}>{pts.toLocaleString()} pt</strong>
            </p>
          </div>
          {phase==='done' && (
            <button onClick={reset}
              style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.08)',
                border:'1px solid rgba(255,255,255,.2)',borderRadius:10,padding:'8px 14px',
                color:'#fff',fontSize:12,cursor:'pointer'}}>
              <RefreshCw size={13} />もう一度
            </button>
          )}
        </div>

        {/* ステップ表示 */}
        <div style={{textAlign:'center',marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:700,color:'#daa520',letterSpacing:'0.08em'}}>
            {stepLabel[phase] ?? ''}
          </span>
        </div>

        {/* ── 演出コンテンツ ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
          justifyContent:'center',padding:'0 20px',gap:24}}>

          {/* ── 確定演出：インムくん×5 拍手 ── */}
          {phase==='guaranteed' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20,width:'100%'}}>
              <div style={{position:'relative',width:'100%',height:240,display:'flex',
                alignItems:'flex-end',justifyContent:'center'}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:'absolute',bottom:20,left:'50%',
                    transform:'translate(-50%,-50%)',
                    width:80+i*70,height:80+i*70,borderRadius:'50%',
                    background:'rgba(218,165,32,.04)',
                    border:`1px solid rgba(218,165,32,${.25-i*.07})`,
                    animation:`ga-ring 1.9s ease-out ${i*.5}s infinite`}} />
                ))}
                {[{l:'19%',d:'0s'},{l:'36%',d:'.28s'},{l:'53%',d:'.56s'},{l:'68%',d:'.84s'},{l:'9%',d:'1.1s'}].map((h,i)=>(
                  <div key={i} style={{position:'absolute',bottom:212,left:h.l,fontSize:22,
                    animation:`ga-hand 1.1s ease-out ${h.d} infinite`}}>👏</div>
                ))}
                {CLAP_POS.map((m,i)=>(
                  <div key={i} style={{
                    ...m.pos, position:'absolute',
                    width:m.w,height:m.w,borderRadius:'50%',overflow:'hidden',
                    border:'3px solid #daa520',
                    boxShadow:`0 0 ${i===0?36:20}px rgba(218,165,32,${i===0?.92:.68})`,
                    animation:`ga-popin .44s ease-out ${m.delay}ms both, ga-clap .7s ease-in-out ${m.delay+500}ms infinite`,
                  }}>
                    <img src={mascotImg} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                  </div>
                ))}
              </div>
              <div style={{background:'linear-gradient(135deg,#3d1f00,#5c3000)',border:'2px solid #daa520',
                borderRadius:20,padding:'14px 36px',textAlign:'center'}}
                className="ga-glow">
                <p style={{margin:0,fontWeight:900,fontSize:20,color:'#ffd700',letterSpacing:'0.08em',
                  textShadow:'0 0 24px rgba(255,215,0,.85)'}}>🎊 INMU 確定！ 🎊</p>
                <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:8}}>
                  {['✦','✧','★','✧','✦'].map((s,i)=>(
                    <span key={i} style={{fontSize:16,color:'#ffd700',
                      animation:`ga-sparkle ${.5+i*.15}s ease-in-out ${i*.11}s infinite`}}>{s}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── ① コイン投入 ── */}
          {phase==='inserting' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20}}>
              <div style={{position:'relative',height:240,width:220,display:'flex',
                alignItems:'flex-end',justifyContent:'center'}}>
                <img src={coinImg} alt="" style={{
                  position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
                  width:80,height:80,borderRadius:'50%',objectFit:'cover',
                  border:'3px solid #daa520',boxShadow:'0 0 28px rgba(218,165,32,.85)',
                  animation:'ga-drop .9s ease-out forwards',zIndex:10}} />
                <div style={{opacity:.85}}><Machine size={180} /></div>
              </div>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:13,margin:0}}
                className="animate-pulse">INMUコインを投入します</p>
            </div>
          )}

          {/* ── ② レバー回転 ── */}
          {phase==='lever' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20}}>
              <div style={{position:'relative',height:240,display:'flex',
                alignItems:'center',justifyContent:'center'}}>
                <div style={{opacity:.85}}><Machine size={180} /></div>
                {/* レバー動的エフェクト */}
                <div style={{position:'absolute',right:12,top:'30%',
                  display:'flex',flexDirection:'column',alignItems:'center'}}>
                  <div style={{width:20,height:48,background:GOLD,borderRadius:10,
                    transformOrigin:'bottom center',
                    animation:'ga-lever .6s ease-in-out .2s forwards',
                    boxShadow:'0 0 18px rgba(218,165,32,.8)'}} />
                </div>
                {['15%','50%','84%'].map((l,i)=>(
                  <span key={i} style={{position:'absolute',top:'15%',left:l,fontSize:20,color:'#ffd700',
                    animation:`ga-sparkle ${.6+i*.2}s ease-in-out ${i*.15}s infinite`}}>✦</span>
                ))}
              </div>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:13,margin:0}}
                className="animate-pulse">レバーを回すとガチャが動きます</p>
            </div>
          )}

          {/* ── ③ カプセル排出（宇宙演出）── */}
          {phase==='space' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,width:'100%'}}>
              <div style={{width:'100%',height:260,borderRadius:20,overflow:'hidden',
                background:SPACE_BG,border:'1px solid rgba(184,134,11,.4)',
                position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
                {/* 星 */}
                {Array.from({length:20},(_,i)=>({
                  x:`${4+i*4.8}%`,y:`${6+(i*12.3)%82}%`,s:1+Math.random()*.8,d:i*.16
                })).map((s,i)=>(
                  <div key={i} className="absolute rounded-full bg-white"
                    style={{left:s.x,top:s.y,width:s.s*2,height:s.s*2,position:'absolute',
                      animation:`ga-star ${1.2+i*.2}s ease-in-out ${s.d}s infinite`}} />
                ))}
                {/* 光柱 */}
                <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
                  width:100,height:'100%',
                  background:'radial-gradient(ellipse at 50% 0%,rgba(255,200,50,.42) 0%,rgba(160,80,255,.18) 40%,transparent 75%)'}} />
                {/* 床台座 */}
                <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',
                  width:110,height:22,borderRadius:'50%',
                  border:'2px solid rgba(218,165,32,.6)',boxShadow:'0 0 18px rgba(218,165,32,.4)'}} />
                {/* カプセル（飛び出す） */}
                <div style={{position:'absolute',bottom:42,left:'50%',transform:'translateX(-50%)',
                  width:60,height:60,animation:'ga-fly .7s ease-out forwards'}}>
                  <div style={{width:60,height:30,borderRadius:'50% 50% 0 0',
                    background:'radial-gradient(ellipse at 42% 35%,#d8e0e0,#707880)',
                    border:'2.5px solid rgba(220,230,230,.85)',
                    boxShadow:'inset 0 3px 8px rgba(255,255,255,.35)'}} />
                  <div style={{width:60,height:30,borderRadius:'0 0 50% 50%',
                    background:'radial-gradient(ellipse at 42% 65%,#505860,#383e48)',
                    border:'2.5px solid rgba(160,170,180,.6)'}} />
                </div>
                {/* 周辺の浮遊球 */}
                {[
                  {c:BALLS[0].grad,l:'16%',t:'22%',s:20,d:'.1s'},
                  {c:BALLS[3].grad,l:'74%',t:'18%',s:24,d:'.3s'},
                  {c:BALLS[1].grad,l:'80%',t:'58%',s:18,d:'.5s'},
                  {c:BALLS[2].grad,l:'10%',t:'60%',s:18,d:'.7s'},
                ].map((b,i)=>(
                  <div key={i} style={{position:'absolute',left:b.l,top:b.t,
                    width:b.s,height:b.s,borderRadius:'50%',background:b.c,
                    border:'1.5px solid rgba(255,255,255,.2)',
                    animation:`ga-float ${1.6+i*.3}s ease-in-out ${b.d} infinite`}} />
                ))}
                <p style={{position:'absolute',bottom:4,left:'50%',transform:'translateX(-50%)',
                  fontSize:10,fontWeight:900,letterSpacing:'0.25em',color:'#daa520',
                  textShadow:'0 0 10px rgba(255,215,0,.7)',whiteSpace:'nowrap'}}>INMU</p>
              </div>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:13,margin:0}}
                className="animate-pulse">神秘的な演出の中、カプセルが排出されます</p>
            </div>
          )}

          {/* ── ④ カプセル落下 ── */}
          {phase==='falling' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,width:'100%'}}>
              <div style={{width:'100%',height:260,borderRadius:20,overflow:'hidden',
                background:SPACE_BG,border:'1px solid rgba(184,134,11,.4)',
                position:'relative',display:'flex',alignItems:'flex-start',justifyContent:'center'}}>
                <div style={{marginTop:20,width:64,height:64,animation:'ga-fall .85s ease-in forwards'}}>
                  <div style={{width:64,height:32,borderRadius:'50% 50% 0 0',
                    background:'radial-gradient(ellipse at 42% 35%,#d8e0e0,#707880)',
                    border:'2.5px solid rgba(220,230,230,.85)',
                    boxShadow:'inset 0 3px 8px rgba(255,255,255,.35)'}} />
                  <div style={{width:64,height:32,borderRadius:'0 0 50% 50%',
                    background:'radial-gradient(ellipse at 42% 65%,#505860,#383e48)',
                    border:'2.5px solid rgba(160,170,180,.6)'}} />
                </div>
                {/* 軌跡 */}
                {Array.from({length:5},(_,i)=>({op:.9-i*.15,s:5-i*.7})).map((p,i)=>(
                  <div key={i} style={{position:'absolute',top:`${20+i*14}%`,left:'49%',
                    width:p.s,height:p.s,borderRadius:'50%',
                    background:`rgba(218,165,32,${p.op})`}} />
                ))}
              </div>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:13,margin:0}}
                className="animate-pulse">カプセルが下へ落ちていきます</p>
            </div>
          )}

          {/* ── 開封 ── */}
          {phase==='opening' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20}}>
              <div style={{position:'relative',height:180,width:180,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{position:'absolute',
                  width:160,height:80,borderRadius:'50% 50% 0 0',
                  background:'radial-gradient(ellipse at 42% 35%,#d8e0e0,#707880)',
                  border:'3px solid rgba(220,230,230,.85)',
                  boxShadow:'inset 0 4px 12px rgba(255,255,255,.35)',
                  top:10,transformOrigin:'bottom center',
                  animation:'ga-split-t .55s ease-out .15s forwards'}} />
                <div style={{position:'absolute',
                  width:160,height:80,borderRadius:'0 0 50% 50%',
                  background:'radial-gradient(ellipse at 42% 65%,#505860,#383e48)',
                  border:'3px solid rgba(160,170,180,.6)',
                  top:90,transformOrigin:'top center',
                  animation:'ga-split-b .55s ease-out .15s forwards'}} />
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:'absolute',
                    width:60+i*55,height:60+i*55,borderRadius:'50%',
                    background:'rgba(218,165,32,.05)',
                    border:`1px solid rgba(218,165,32,${.4-i*.12})`,
                    animation:`ga-ring ${.5+i*.28}s ease-out ${.2+i*.14}s forwards`}} />
                ))}
              </div>
              <p style={{color:'rgba(255,255,255,.65)',fontSize:14,margin:0,fontWeight:600}}
                className="animate-pulse">カプセルが開きます…</p>
            </div>
          )}

          {/* ── 結果：1連 ── */}
          {phase==='done' && result && !isMulti && (
            <div className="ga-reveal" style={{
              display:'flex',flexDirection:'column',alignItems:'center',gap:20,width:'100%',maxWidth:320}}>
              {result.wasGuaranteed&&(
                <p style={{fontSize:13,fontWeight:700,color:'#ffd700',margin:0}}
                  className="animate-pulse">✨ 確定演出が発動しました！</p>
              )}
              {result.results.map((prize,i)=>{
                const b = BALLS.find(x=>x.id===prize.prizeId)??BALLS[0]
                const isInmu = prize.type==='inmu'
                return (
                  <div key={i} style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                    {/* 大きなボール */}
                    <div className={isInmu?'ga-glow':''} style={{
                      width:140,height:140,borderRadius:'50%',background:b.grad,
                      border:`5px solid ${b.glow}`,
                      boxShadow:`0 0 ${isInmu?56:24}px ${isInmu?30:10}px ${b.glow}88`,
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                    }}>
                      {prize.label.split(' ').map((l,j)=>(
                        <span key={j} style={{fontSize:isInmu?16:22,fontWeight:900,color:'#fff',
                          textShadow:'0 2px 8px rgba(0,0,0,.9)',lineHeight:1.25}}>{l}</span>
                      ))}
                    </div>
                    {/* テキスト */}
                    <div style={{width:'100%',background:isInmu?'linear-gradient(135deg,#3d1f00,#5c3000)':'rgba(18,14,2,.85)',
                      border:`1.5px solid ${b.glow}66`,borderRadius:16,padding:'16px 20px',textAlign:'center'}}>
                      {isInmu ? (
                        <>
                          <p style={{margin:0,fontWeight:900,fontSize:20,color:'#ffd700',
                            textShadow:'0 0 22px rgba(255,215,0,.8)'}}>おめでとうございます！</p>
                          <p style={{margin:'6px 0 0',fontSize:12,color:'rgba(253,230,138,.7)',lineHeight:1.6}}>
                            10,000 INMU を獲得しました！<br/>報酬は後日運営より送金されます。
                          </p>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,marginTop:12}}>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                              <span style={{fontSize:22,animation:'ga-sparkle 1s ease-in-out infinite'}}>✨</span>
                              <span style={{fontSize:8,color:'rgba(255,215,0,.65)'}}>金色発光</span>
                            </div>
                            <img src={mascotImg} alt="" style={{width:36,height:36,borderRadius:'50%',objectFit:'cover',
                              border:'1.5px solid #daa520',animation:'ga-bounce 1s ease-in-out infinite'}} />
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                              <span style={{fontSize:22,animation:'ga-sparkle 1.2s ease-in-out .2s infinite'}}>🎊</span>
                              <span style={{fontSize:8,color:'rgba(255,215,0,.65)'}}>特別演出</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <p style={{margin:0,fontWeight:900,fontSize:22,color:'#e0d0b0'}}>
                            {prize.label}
                          </p>
                          <p style={{margin:'6px 0 0',fontSize:12,color:'rgba(255,255,255,.5)'}}>
                            ポイントを即時付与しました
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 結果：10連グリッド ── */}
          {phase==='done' && result && isMulti && (
            <div className="ga-reveal" style={{
              display:'flex',flexDirection:'column',gap:16,width:'100%',maxWidth:340}}>
              {result.wasGuaranteed&&(
                <p style={{fontSize:13,fontWeight:700,color:'#ffd700',textAlign:'center',margin:0}}
                  className="animate-pulse">✨ 確定演出が発動しました！</p>
              )}
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
                {result.results.map((prize,i)=>{
                  const b = BALLS.find(x=>x.id===prize.prizeId)??BALLS[0]
                  const isInmu = prize.type==='inmu'
                  return (
                    <div key={i} style={{
                      display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                      opacity:i<revIdx?1:0,
                      animation:i<revIdx?'ga-card .3s ease-out forwards':'none',
                    }}>
                      <div className={isInmu?'ga-glow':''} style={{
                        width:56,height:56,borderRadius:'50%',background:b.grad,
                        border:`2.5px solid ${b.glow}`,
                        boxShadow:`0 0 ${isInmu?24:10}px ${b.glow}88`,
                        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                      }}>
                        {PRIZE_LABEL[prize.prizeId]?.split('\n').map((l,j)=>(
                          <span key={j} style={{fontSize:isInmu?8:11,fontWeight:900,color:'#fff',
                            lineHeight:1.2,textShadow:'0 1px 4px rgba(0,0,0,.9)'}}>{l}</span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {result.totalPoints>0&&(
                <p style={{margin:0,fontSize:14,color:'#ffd700',textAlign:'center',fontWeight:700}}>
                  合計 +{result.totalPoints.toLocaleString()} pt 獲得！
                </p>
              )}
              {result.hasInmu&&(
                <div className="ga-glow" style={{borderRadius:16,padding:'14px 20px',textAlign:'center',
                  background:'linear-gradient(135deg,#3d1f00,#5c3000)',border:'2px solid #daa520'}}>
                  <p style={{margin:0,fontWeight:900,fontSize:17,color:'#ffd700'}}>🏆 10,000 INMU 当選！</p>
                  <p style={{margin:'5px 0 0',fontSize:12,color:'rgba(253,230,138,.8)',lineHeight:1.6}}>
                    おめでとうございます！<br/>報酬は後日運営より送金されます。
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
