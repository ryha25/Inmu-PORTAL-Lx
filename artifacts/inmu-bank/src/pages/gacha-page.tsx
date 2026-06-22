import { useState, useEffect, useCallback, useRef } from 'react'
import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { ChevronRight } from 'lucide-react'

import machineImg  from '@assets/generated_images/gacha-machine-v2.png'
import mascotImg   from '@assets/generated_images/mascot-v2-nobg.png'
import coinImg     from '@assets/IMG_6637_1782097134955.jpeg'
import bgImg       from '@assets/generated_images/gacha-bg.png'
import jackpotBg   from '@assets/generated_images/gacha-jackpot-bg.png'

/* ─── types ─── */
type Phase = 'idle'|'guaranteed'|'inserting'|'lever'|'space'|'falling'|'opening'|'done'
type Prize = { prizeId:string; label:string; type:'points'|'inmu'; amount:number }
type Result = { results:Prize[]; totalPoints:number; hasInmu:boolean; wasGuaranteed:boolean; costPoints:number; newPoints:number }
type HistRow = { id:number; pullType:string; results:Prize[]; totalPoints:number; hasInmu:boolean; inmuSentStatus:string; wasGuaranteed:boolean; costPoints:number; createdAt:string }

/* ─── capsule color configs (image 5 reference) ─── */
const CAPSULE: Record<string,{top:string;bot:string;glow:string;border:string;label:string}> = {
  pts100: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(232,238,248,.98) 0%, rgba(168,182,202,.96) 38%, rgba(108,126,150,.74) 68%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(200,214,230,.97) 0%, rgba(148,165,188,.92) 38%, rgba(86,106,132,.68) 68%)',
    glow:'rgba(155,178,208,.64)', border:'rgba(182,200,222,.70)', label:'100pt',
  },
  pts1000: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(135,192,255,.98) 0%, rgba(25,85,218,.93) 42%, rgba(6,35,165,.68) 72%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(85,150,248,.93) 0%, rgba(16,65,202,.88) 42%, rgba(4,25,148,.62) 72%)',
    glow:'rgba(45,118,255,.65)', border:'rgba(75,145,255,.55)', label:'1,000pt',
  },
  pts5000: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(212,85,255,.98) 0%, rgba(145,18,228,.9) 42%, rgba(86,2,188,.67) 72%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(188,58,248,.93) 0%, rgba(125,8,212,.86) 42%, rgba(66,0,172,.6) 72%)',
    glow:'rgba(162,55,255,.68)', border:'rgba(182,78,255,.58)', label:'5,000pt',
  },
  inmu10k: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(255,250,130,.99) 0%, rgba(238,180,15,.93) 38%, rgba(185,125,5,.72) 70%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(248,215,78,.95) 0%, rgba(218,155,8,.9) 38%, rgba(165,105,0,.67) 70%)',
    glow:'rgba(255,215,0,.85)', border:'rgba(255,215,0,.65)', label:'10,000\nINMU',
  },
}

const BALLS = [
  { id:'pts100',  label:'100pt',       rate:'88%', color:'rgba(180,218,255,.9)' },
  { id:'pts1000', label:'1,000pt',     rate:'8%',  color:'rgba(70,140,255,.9)'  },
  { id:'pts5000', label:'5,000pt',     rate:'3%',  color:'rgba(180,60,255,.9)'  },
  { id:'inmu10k', label:'10,000 INMU', rate:'1%',  color:'rgba(255,215,0,.9)'   },
]
const PHASE_MS: Partial<Record<Phase,number>> = {
  guaranteed:2000, inserting:1250, lever:1050, space:1350, falling:1150, opening:900,
}
const BG_STARS = Array.from({length:28},(_,i)=>({
  x:`${(i*41.7+8)%90}%`,y:`${(i*63.1+5)%90}%`,s:1+(i%4)*.9,dur:2.8+(i%6)*1.1,delay:(i*.6)%7
}))
const JP_PARTICLES = Array.from({length:48},(_,i)=>({
  x:`${(i*17.3+4)%93}%`,y:`${(i*23.7+7)%90}%`,s:1.4+(i%6)*1.3,dur:1.2+(i%5)*.65,delay:(i*.24)%4
}))
const COIN_RISES = Array.from({length:12},(_,i)=>({
  x:`${(i*8.3+5)%86}%`,sz:20+(i%4)*9,delay:(i*.28)%3.2,dur:1.8+(i%4)*.6
}))

/* ─── SE ─── */
function playJackpotSE() {
  try {
    const ctx = new AudioContext()
    ;[523.25,659.25,783.99,1046.5,1318.5].forEach((f,i)=>{
      const o=ctx.createOscillator(),g=ctx.createGain()
      o.connect(g);g.connect(ctx.destination);o.frequency.value=f;o.type='sine'
      const t=ctx.currentTime+i*.15
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.26,t+.04);g.gain.exponentialRampToValueAtTime(.001,t+.48)
      o.start(t);o.stop(t+.5)
    })
  } catch{/**/}
}

/* ─── CSS ─── */
const CSS=`
  @keyframes ga-float    {0%,100%{transform:translateY(0)}50%{transform:translateY(-11px)}}
  @keyframes ga-floatslow{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
  @keyframes ga-floatcoin{0%,100%{transform:translateY(0)rotate(-3deg)}50%{transform:translateY(-10px)rotate(3deg)}}
  @keyframes ga-pulse    {0%,100%{text-shadow:0 0 6px rgba(218,165,32,.2),0 2px 18px rgba(0,0,0,.8)}50%{text-shadow:0 0 44px rgba(255,215,0,1),0 0 88px rgba(218,165,32,.7),0 2px 4px rgba(0,0,0,.9)}}
  @keyframes ga-glow     {0%,100%{box-shadow:0 0 14px 4px rgba(218,165,32,.4)}50%{box-shadow:0 0 70px 26px rgba(218,165,32,1)}}
  @keyframes ga-glowtext {0%,100%{opacity:.5}50%{opacity:1}}
  @keyframes ga-sparkle  {0%,100%{opacity:0;transform:scale(0)}50%{opacity:1;transform:scale(1.5)}}
  @keyframes ga-ring     {0%{transform:translate(-50%,-50%)scale(1);opacity:.72}100%{transform:translate(-50%,-50%)scale(3.4);opacity:0}}
  @keyframes ga-reveal   {from{transform:scale(.6)translateY(20px);opacity:0}to{transform:scale(1)translateY(0);opacity:1}}
  @keyframes ga-card     {from{transform:translateY(14px)scale(.82);opacity:0}to{transform:translateY(0)scale(1);opacity:1}}
  @keyframes ga-drop     {0%{transform:translateY(-140px)rotate(0);opacity:0}65%{transform:translateY(6px)rotate(200deg);opacity:1}100%{transform:translateY(0)rotate(360deg);opacity:1}}
  @keyframes ga-popin    {0%{transform:scale(0)rotate(-18deg);opacity:0}65%{transform:scale(1.18)rotate(4deg);opacity:1}100%{transform:scale(1)rotate(0);opacity:1}}
  @keyframes ga-bounce   {0%,100%{transform:translateY(0)}42%{transform:translateY(-28px)scale(.96)}72%{transform:translateY(-11px)}}
  @keyframes ga-shimmer  {0%{transform:translateX(-100%)skewX(-22deg)}100%{transform:translateX(280%)skewX(-22deg)}}
  @keyframes ga-particle {0%,100%{opacity:0;transform:translateY(0)scale(.7)}42%,58%{opacity:1}50%{transform:translateY(-15px)scale(1.3)}}
  @keyframes ga-coinrise {0%{transform:translateY(80px)rotate(0);opacity:1}80%{opacity:.85}100%{transform:translateY(-180px)rotate(520deg);opacity:0}}
  @keyframes ga-split-t  {to{transform:translateY(-72px)rotate(-24deg)scale(1.06)}}
  @keyframes ga-split-b  {to{transform:translateY(72px)rotate(24deg)scale(1.06)}}
  @keyframes ga-burst    {0%{opacity:0;transform:scale(.12)}28%{opacity:.92}100%{opacity:0;transform:scale(3.4)}}
  @keyframes ga-goldflash{0%{opacity:0}15%{opacity:1}100%{opacity:0}}
  @keyframes ga-shake    {0%,100%{transform:translateX(0)}12%{transform:translateX(-10px)}24%{transform:translateX(10px)}36%{transform:translateX(-7px)}48%{transform:translateX(7px)}60%{transform:translateX(-4px)}72%{transform:translateX(4px)}}
  @keyframes ga-leverrot {0%{transform:rotate(0)}100%{transform:rotate(-52deg)}}
  @keyframes ga-spotlight{0%,100%{opacity:.44}50%{opacity:1}}
  @keyframes ga-jpzoom   {0%{transform:scale(.1)rotate(-10deg);opacity:0}62%{transform:scale(1.2)rotate(2deg);opacity:1}100%{transform:scale(1)rotate(0);opacity:1}}
  @keyframes ga-jppulse  {0%,100%{text-shadow:0 0 8px rgba(255,215,0,.35)}50%{text-shadow:0 0 48px rgba(255,215,0,1),0 0 96px rgba(218,165,32,.9)}}
  @keyframes ga-drift    {0%{opacity:0;transform:translateY(14px)scale(.8)}30%,70%{opacity:.88}100%{opacity:0;transform:translateY(-42px)scale(.5)}}
  @keyframes ga-machinepulse{0%,100%{filter:drop-shadow(0 24px 72px rgba(0,0,0,.98)) drop-shadow(0 0 22px rgba(184,134,11,.22))}50%{filter:drop-shadow(0 24px 72px rgba(0,0,0,.98)) drop-shadow(0 0 60px rgba(218,165,32,.82))}}
  @keyframes ga-coinfall    {0%{top:-20%;transform:rotate(0deg);opacity:.55}70%{opacity:1}100%{top:4%;transform:rotate(400deg);opacity:1}}
  @keyframes ga-coinfall2   {0%{top:-96px;transform:rotate(-12deg);opacity:.65}20%{opacity:1}100%{top:6px;transform:rotate(340deg)}}
  @keyframes ga-leverrot2   {0%{transform:rotate(-8deg)}100%{transform:rotate(58deg)}}
  @keyframes ga-orbit       {from{transform:rotate(0deg) translateX(60px) rotate(0deg)}to{transform:rotate(360deg) translateX(60px) rotate(-360deg)}}
  @keyframes ga-shockwave   {0%{transform:translateX(-50%) scale(.12);opacity:.88}100%{transform:translateX(-50%) scale(3.4);opacity:0}}
  @keyframes ga-capland     {0%{top:-120px}72%{top:188px}83%{top:174px}91%{top:186px}100%{top:181px}}
  .ga-pulse{animation:ga-pulse 2.2s ease-in-out infinite}
  .ga-floatslow{animation:ga-floatslow 3.4s ease-in-out infinite}
  .ga-reveal{animation:ga-reveal .42s ease-out forwards}
  .ga-machinepulse{animation:ga-machinepulse 2.6s ease-in-out infinite}
  .ga-shake{animation:ga-shake .55s ease-out}
`

/* ════ Background ════ */
function PageBg({ children, jackpot=false }:{children:React.ReactNode;jackpot?:boolean}) {
  return (
    <div style={{height:'100dvh',display:'flex',flexDirection:'column',
      backgroundImage:`url(${jackpot?jackpotBg:bgImg})`,
      backgroundSize:'cover',backgroundPosition:'center top',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,pointerEvents:'none',
        background:jackpot?'rgba(6,2,0,.38)':'rgba(2,1,10,.55)'}} />
      {/* stars */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:2}}>
        {BG_STARS.map((s,i)=>(
          <div key={i} style={{position:'absolute',left:s.x,top:s.y,width:s.s,height:s.s,
            borderRadius:'50%',background:'rgba(255,215,0,.82)',
            boxShadow:`0 0 ${s.s*2.8}px rgba(218,165,32,.65)`,
            animation:`ga-particle ${s.dur}s ease-in-out ${s.delay}s infinite`}}/>
        ))}
      </div>
      {/* spotlights */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:2,
        background:'radial-gradient(ellipse 52% 72% at 30% -4%, rgba(218,165,32,.22) 0%, transparent 58%)',
        animation:'ga-spotlight 5.5s ease-in-out infinite'}}/>
      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:2,
        background:'radial-gradient(ellipse 52% 72% at 70% -4%, rgba(180,120,18,.18) 0%, transparent 58%)',
        animation:'ga-spotlight 5.5s ease-in-out 2.7s infinite'}}/>
      <div style={{position:'relative',zIndex:5,display:'flex',flexDirection:'column',flex:1}}>
        {children}
      </div>
    </div>
  )
}

/* ════ Prize Capsule: CSS-drawn colored capsule (image 5 reference) ════ */
function PrizeCapsule({ prizeId, size=96, open=false }:{prizeId:string;size?:number;open?:boolean}) {
  const c = CAPSULE[prizeId] ?? CAPSULE.pts100
  const r = size/2
  const sep = open ? 10 : 0
  return (
    <div style={{position:'relative',width:size,height:size+sep*2,display:'flex',
      flexDirection:'column',alignItems:'center'}}>
      {/* Top half */}
      <div style={{width:size,height:r,
        borderRadius:`${r}px ${r}px 0 0`,
        background:c.top,
        border:`1px solid ${c.border}`,borderBottom:'none',
        boxShadow:`0 -4px 22px ${c.glow},inset 0 2px 10px rgba(255,255,255,.38),inset 0 -4px 8px rgba(0,0,0,.32)`,
        transform:`translateY(${-sep}px)`,flexShrink:0}} />
      {/* Bottom half */}
      <div style={{width:size,height:r,
        borderRadius:`0 0 ${r}px ${r}px`,
        background:c.bot,
        border:`1px solid ${c.border}`,borderTop:'none',
        boxShadow:`0 6px 24px ${c.glow},inset 0 4px 8px rgba(0,0,0,.26),inset 0 -2px 6px rgba(255,255,255,.18)`,
        transform:`translateY(${sep}px)`,flexShrink:0}} />
      {prizeId==='inmu10k'&&open&&(
        <div style={{position:'absolute',inset:-12,borderRadius:'50%',
          background:'radial-gradient(circle,rgba(255,250,100,.45) 0%,rgba(218,165,32,.2) 40%,transparent 68%)',
          animation:'ga-glow 1.2s ease-in-out infinite',pointerEvents:'none'}}/>
      )}
    </div>
  )
}

/* ════ Rate Panel overlay ════ */
function RatePanel() {
  return (
    <div style={{position:'absolute',top:'28%',right:0,zIndex:10,width:104,
      background:'linear-gradient(160deg,rgba(8,4,22,.97),rgba(14,7,2,.97))',
      border:'1px solid rgba(184,134,11,.55)',borderRadius:'12px 0 0 12px',
      padding:'10px 8px 10px 10px',
      backdropFilter:'blur(14px)',
      boxShadow:'inset 0 1px 0 rgba(255,255,255,.07),-3px 0 28px rgba(0,0,0,.65)'}}>
      <p style={{margin:'0 0 8px',fontSize:9,color:'rgba(218,165,32,.88)',
        textAlign:'center',letterSpacing:'0.22em',fontWeight:700}}>排出率</p>
      {BALLS.map(b=>(
        <div key={b.id} style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
          <div style={{width:18,height:18,borderRadius:'50%',flexShrink:0,
            background:b.color,boxShadow:`0 0 7px ${b.color}`}} />
          <div>
            <p style={{fontSize:8,color:'rgba(218,165,32,.75)',fontWeight:700,margin:0,whiteSpace:'nowrap'}}>{b.label}</p>
            <p style={{fontSize:13,color:'#ffd700',fontWeight:900,fontFamily:'monospace',margin:0}}>{b.rate}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ════ Ornate Button (image 3 reference) ════ */
function OrnateButton({ gold, enabled, onClick, label, price }:{
  gold:boolean;enabled:boolean;onClick:()=>void;label:string;price:string
}) {
  const [p,setP]=useState(false)
  const face = gold
    ? 'linear-gradient(165deg,#ffe066 0%,#c89010 26%,#8a6200 56%,#5c4200 100%)'
    : 'linear-gradient(165deg,#b83838 0%,#8a1010 28%,#5c0808 56%,#320000 100%)'
  const rim = gold ? '#e8c040' : '#9a2222'
  const inner = gold ? 'rgba(255,255,255,.55)' : 'rgba(255,180,180,.45)'

  return (
    <button type="button" disabled={!enabled} onClick={onClick}
      onPointerDown={()=>setP(true)} onPointerUp={()=>setP(false)} onPointerLeave={()=>setP(false)}
      style={{flex:1,border:`2px solid ${rim}`,borderRadius:6,padding:2,
        background:face,cursor:enabled?'pointer':'not-allowed',opacity:enabled?1:.35,
        transform:`translateY(${p?2:0}px)`,transition:'transform .06s',
        boxShadow:p?`0 1px 4px rgba(0,0,0,.8)`:`0 6px 18px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.07),inset 0 1px 0 rgba(255,255,255,.25)`}}>
      {/* Corner ornaments */}
      {(['tl','tr','bl','br'] as const).map(pos=>(
        <div key={pos} style={{position:'absolute',
          top:pos[0]==='t'?5:undefined, bottom:pos[0]==='b'?5:undefined,
          left:pos[1]==='l'?5:undefined, right:pos[1]==='r'?5:undefined,
          width:9,height:9,
          borderTop:   pos[0]==='t'?`1.5px solid ${inner}`:'none',
          borderBottom:pos[0]==='b'?`1.5px solid ${inner}`:'none',
          borderLeft:  pos[1]==='l'?`1.5px solid ${inner}`:'none',
          borderRight: pos[1]==='r'?`1.5px solid ${inner}`:'none',
        }}/>
      ))}
      {/* Content */}
      <div style={{borderRadius:4,padding:'13px 8px',display:'flex',alignItems:'center',
        gap:9,justifyContent:'center',position:'relative',overflow:'hidden',
        background:'linear-gradient(180deg,rgba(255,255,255,.18) 0%,transparent 50%)'}}>
        <div style={{position:'absolute',top:0,left:'-32%',width:'38%',height:'100%',
          background:'rgba(255,255,255,.1)',transform:'skewX(-22deg)',
          animation:'ga-shimmer 3.4s ease-in-out infinite',pointerEvents:'none'}}/>
        <img src={coinImg} style={{width:36,height:36,borderRadius:'50%',objectFit:'cover',
          flexShrink:0,border:'1.5px solid rgba(255,255,255,.35)',
          boxShadow:'0 2px 7px rgba(0,0,0,.55)'}}/>
        <div style={{textAlign:'left'}}>
          <p style={{margin:0,fontSize:20,fontWeight:900,letterSpacing:'.02em',lineHeight:1.15,
            color:gold?'#1c0e00':'#fff8f8',
            textShadow:`0 1px 2px rgba(0,0,0,.4)`}}>{label}</p>
          <p style={{margin:0,fontSize:13,fontWeight:700,letterSpacing:'.05em',
            color:gold?'rgba(40,24,0,.8)':'rgba(255,220,220,.75)'}}>{price}</p>
        </div>
      </div>
    </button>
  )
}

/* ════ Points Panel (image 3 reference) ════ */
function PointsPanel({ pts, loading }:{pts:number;loading:boolean}) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
      background:'linear-gradient(135deg,rgba(14,8,2,.98),rgba(22,12,2,.98))',
      border:'1.5px solid rgba(184,134,11,.65)',borderRadius:8,padding:'12px 16px',
      position:'relative',overflow:'hidden',
      boxShadow:'inset 0 1px 0 rgba(255,238,150,.14),inset 0 -1px 0 rgba(0,0,0,.6),0 4px 18px rgba(0,0,0,.65)'}}>
      {(['tl','tr','bl','br'] as const).map(pos=>(
        <div key={pos} style={{position:'absolute',
          top:pos[0]==='t'?5:undefined, bottom:pos[0]==='b'?5:undefined,
          left:pos[1]==='l'?5:undefined, right:pos[1]==='r'?5:undefined,
          width:9,height:9,
          borderTop:   pos[0]==='t'?'1.5px solid rgba(218,165,32,.55)':'none',
          borderBottom:pos[0]==='b'?'1.5px solid rgba(218,165,32,.55)':'none',
          borderLeft:  pos[1]==='l'?'1.5px solid rgba(218,165,32,.55)':'none',
          borderRight: pos[1]==='r'?'1.5px solid rgba(218,165,32,.55)':'none',
        }}/>
      ))}
      {/* coin stack + label */}
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{position:'relative',width:42,height:38,flexShrink:0}}>
          {[13,8,3].map((off,i)=>(
            <img key={i} src={coinImg} style={{position:'absolute',bottom:off,left:0,
              width:32,height:32,borderRadius:'50%',objectFit:'cover',
              border:`${2-i*.4}px solid rgba(218,165,32,${.9-i*.15})`,
              boxShadow:`0 ${2-i}px ${6-i*2}px rgba(0,0,0,.7)`}}/>
          ))}
        </div>
        <p style={{margin:0,fontSize:13,color:'rgba(218,165,32,.88)',fontWeight:700,
          letterSpacing:'0.1em'}}>保有ポイント</p>
      </div>
      {/* amount */}
      <div style={{display:'flex',alignItems:'baseline',gap:3}}>
        <span style={{fontFamily:'monospace',fontWeight:900,fontSize:27,color:'#ffd700',
          textShadow:'0 0 22px rgba(255,215,0,.65),0 2px 4px rgba(0,0,0,.9)'}}>
          {loading?'---':pts.toLocaleString()}
        </span>
        <span style={{fontSize:14,color:'rgba(218,165,32,.82)',fontWeight:700}}>pt</span>
        <span style={{fontSize:16,color:'rgba(218,165,32,.55)',marginLeft:2}}>›</span>
      </div>
    </div>
  )
}

/* ════ Main GachaPage ════ */
export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts,setPts]             = useState(0)
  const [ptsLoading,setPtsLoading]= useState(true)
  const [phase,setPhase]         = useState<Phase>('idle')
  const [result,setResult]       = useState<Result|null>(null)
  const [revIdx,setRevIdx]       = useState(0)
  const [history,setHistory]     = useState<HistRow[]>([])
  const [histOpen,setHistOpen]   = useState(true)
  const [openFlash,setOpenFlash] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null)

  const loadPts = useCallback(async()=>{
    try{
      const r=await fetch('/api/profile',{credentials:'include'})
      if(r.ok){const d=await r.json() as {monthlyPoints?:string|number};setPts(Number(d.monthlyPoints??0))}
    }catch{/**/}finally{setPtsLoading(false)}
  },[])
  useEffect(()=>{loadPts()},[loadPts])

  const loadHist = useCallback(async()=>{
    try{
      const r=await fetch('/api/gacha/history',{credentials:'include'})
      const d=await r.json() as HistRow[];setHistory(Array.isArray(d)?d:[])
    }catch{/**/}
  },[])
  useEffect(()=>{loadHist()},[loadHist])

  const clr=()=>{if(timer.current)clearTimeout(timer.current)}
  const after=(ms:number,next:Phase)=>{clr();timer.current=setTimeout(()=>setPhase(next),ms)}
  useEffect(()=>()=>clr(),[])

  useEffect(()=>{
    if     (phase==='guaranteed') after(PHASE_MS.guaranteed!,'inserting')
    else if(phase==='inserting')  after(PHASE_MS.inserting!,'lever')
    else if(phase==='lever')      after(PHASE_MS.lever!,'space')
    else if(phase==='space')      after(PHASE_MS.space!,'falling')
    else if(phase==='falling')    after(PHASE_MS.falling!,'opening')
    else if(phase==='opening')    after(PHASE_MS.opening!,'done')
  },[phase])

  useEffect(()=>{
    if(phase==='done'&&result&&result.results.length>1&&revIdx<result.results.length){
      const t=setTimeout(()=>setRevIdx(i=>i+1),155);return()=>clearTimeout(t)
    }
    return undefined
  },[phase,result,revIdx])

  useEffect(()=>{
    if(phase==='opening'){setOpenFlash(true);setTimeout(()=>setOpenFlash(false),680)}
  },[phase])

  async function spin(type:'single'|'multi'){
    if(phase!=='idle')return
    const cost=type==='multi'?10000:1000
    if(pts<cost){toast.error(`ポイント不足 (必要: ${cost.toLocaleString()}pt)`);return}
    try{
      const res=await fetch('/api/gacha/spin',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type})
      })
      if(!res.ok){const e=await res.json().catch(()=>({})) as {error?:string};throw new Error(e.error??'エラー')}
      const r=await res.json() as Result
      setResult(r);setRevIdx(0);setPts(r.newPoints)
      setPhase(r.wasGuaranteed?'guaranteed':'inserting')
    }catch(e){toast.error(e instanceof Error?e.message:'エラーが発生しました')}
  }

  const reset=()=>{clr();setPhase('idle');setResult(null);setRevIdx(0);loadPts();loadHist()}
  const isMulti=(result?.results.length??0)>1

  /* ════ JACKPOT SCREEN ════ */
  if(phase==='done'&&result?.hasInmu){
    return <JackpotScreen pts={pts} onReset={reset} profile={profile} unread={unread} />
  }

  /* ════ IDLE SCREEN ════ */
  if(phase==='idle') return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>
      <PageBg>
        {/* ── Fixed non-scrolling layout matching reference screen 3 ── */}
        <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden'}}>

          {/* Title (compact) */}
          <div style={{textAlign:'center',padding:'4px 16px 0',flexShrink:0}}>
            <h1 className="ga-pulse" style={{margin:0,fontSize:22,fontWeight:900,color:'#daa520',
              fontFamily:'Georgia,serif',letterSpacing:'0.16em',
              textShadow:'0 2px 22px rgba(218,165,32,.82)'}}>
              ✦ INMU GACHA ✦
            </h1>
            <p style={{margin:'1px 0 0',fontSize:9,color:'rgba(218,165,32,.42)',
              letterSpacing:'0.14em',fontWeight:600}}>— PREMIUM CAPSULE MACHINE —</p>
          </div>

          {/* ── Machine + Mascot + Rate Panel — flex:1, fills all available space ── */}
          <div style={{flex:1,position:'relative',display:'flex',
            justifyContent:'center',alignItems:'center',minHeight:0,overflow:'hidden'}}>
            <img src={machineImg} alt="INMU GACHA Machine"
              className="ga-machinepulse"
              style={{maxHeight:'100%',width:'auto',maxWidth:'82vw',
                display:'block',objectFit:'contain',
                filter:'drop-shadow(0 22px 66px rgba(0,0,0,.98)) drop-shadow(0 0 30px rgba(184,134,11,.3))'}}/>
            {/* Mascot bottom-left */}
            <div className="ga-floatslow" style={{position:'absolute',bottom:0,left:'2%',zIndex:8}}>
              <img src={mascotImg} alt="INMUくん" style={{
                width:'min(100px,24vw)',height:'auto',objectFit:'contain',
                filter:'drop-shadow(-4px 14px 24px rgba(0,0,0,.88)) drop-shadow(0 0 18px rgba(218,165,32,.38))'}}/>
            </div>
            {/* Rate panel */}
            <RatePanel />
          </div>

          {/* ── Bottom controls (non-fixed, natural flex child) ── */}
          <div style={{flexShrink:0,
            background:'linear-gradient(to top,rgba(2,1,10,.99) 84%,transparent)',
            backdropFilter:'blur(16px)',
            padding:`6px 14px max(18px,calc(env(safe-area-inset-bottom)+10px))`}}>

            {/* Buttons */}
            <div style={{display:'flex',gap:10,marginBottom:8}}>
              <OrnateButton gold enabled={pts>=1000&&!ptsLoading}
                onClick={()=>spin('single')} label="1連ガチャ" price="1,000 pt"/>
              <OrnateButton gold={false} enabled={pts>=10000&&!ptsLoading}
                onClick={()=>spin('multi')} label="10連ガチャ" price="10,000 pt"/>
            </div>

            {/* Points */}
            <PointsPanel pts={pts} loading={ptsLoading}/>

            {/* Compact history (no toggle) */}
            <div style={{marginTop:7,
              background:'linear-gradient(135deg,rgba(12,6,2,.92),rgba(6,3,16,.92))',
              border:'1px solid rgba(184,134,11,.4)',borderRadius:10,
              backdropFilter:'blur(8px)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'6px 12px 4px'}}>
                <span style={{fontSize:11,fontWeight:700,color:'rgba(218,165,32,.88)',letterSpacing:'0.08em'}}>ガチャ履歴</span>
                <span style={{fontSize:10,color:'rgba(218,165,32,.5)'}}>もっと見る ›</span>
              </div>
              <div style={{borderTop:'1px solid rgba(184,134,11,.15)'}}>
                {history.length===0
                  ?<p style={{textAlign:'center',fontSize:10,color:'rgba(255,255,255,.3)',padding:'6px 0',margin:0}}>
                      ガチャ履歴がありません
                    </p>
                  :history.slice(0,3).map((row,i)=>{
                      const label=row.hasInmu?'10,000 INMUを獲得しました！'
                        :row.totalPoints>0?`${row.totalPoints.toLocaleString()} ptを獲得しました`
                        :`${row.costPoints.toLocaleString()}pt 消費`
                      const time=new Date(row.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})
                      return (
                        <div key={row.id} style={{display:'flex',alignItems:'center',
                          padding:'5px 12px',
                          borderBottom:i<Math.min(history.length-1,2)?'1px solid rgba(184,134,11,.1)':'none'}}>
                          <span style={{fontSize:9,color:'rgba(255,255,255,.5)',minWidth:60,flexShrink:0}}>
                            {profile?.displayName??'ユーザー'}
                          </span>
                          <span style={{fontSize:9,color:row.hasInmu?'#ffd700':'rgba(255,255,255,.7)',
                            flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginLeft:4}}>
                            {label}
                          </span>
                          <span style={{fontSize:9,color:'rgba(255,255,255,.3)',flexShrink:0,marginLeft:6}}>
                            {time}
                          </span>
                        </div>
                      )
                    })}
              </div>
            </div>
          </div>

        </div>
      </PageBg>
    </AppShell>
  )

  /* ════ ANIMATION + RESULT SCREENS ════ */
  return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>

      {/* Opening flash */}
      {openFlash&&<div style={{position:'fixed',inset:0,zIndex:9999,pointerEvents:'none',
        background:'radial-gradient(circle at 50% 42%,rgba(255,255,200,.92) 0%,rgba(218,165,32,.72) 36%,transparent 65%)',
        animation:'ga-goldflash .68s ease-out forwards'}}/>}

      <PageBg>
        {/* ── Phase header ── */}
        <div style={{padding:'14px 16px 8px',display:'flex',alignItems:'center',
          justifyContent:'space-between'}}>
          <div>
            <h1 className="ga-pulse" style={{margin:0,fontSize:17,fontWeight:900,color:'#daa520',
              fontFamily:'Georgia,serif',letterSpacing:'0.1em'}}>✦ INMU GACHA ✦</h1>
            <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.42)',marginTop:1}}>
              所持: <strong style={{color:'#ffd700'}}>{pts.toLocaleString()} pt</strong>
            </p>
          </div>
          {phase==='done'&&(
            <button type="button" onClick={reset}
              style={{background:'rgba(255,255,255,.06)',backdropFilter:'blur(8px)',
                border:'1px solid rgba(218,165,32,.38)',borderRadius:12,
                padding:'9px 14px',color:'#daa520',fontSize:12,cursor:'pointer',fontWeight:700}}>
              ガチャ画面へ戻る
            </button>
          )}
        </div>

        {/* ── Phase step indicators ── */}
        <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:8}}>
          {(['inserting','lever','space','falling'] as Phase[]).map((p,i)=>{
            const order=['inserting','lever','space','falling','opening','done']
            const current=order.indexOf(phase)
            const step=order.indexOf(p)
            const active=current>=step
            return (
              <div key={p} style={{display:'flex',alignItems:'center',gap:3}}>
                <div style={{width:22,height:22,borderRadius:'50%',
                  background:active?'rgba(218,165,32,.9)':'rgba(255,255,255,.1)',
                  border:`1.5px solid ${active?'#ffd700':'rgba(255,255,255,.2)'}`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:10,fontWeight:900,color:active?'#1a0e00':'rgba(255,255,255,.3)',
                  transition:'all .3s'}}>
                  {i+1}
                </div>
                {i<3&&<div style={{width:16,height:1,background:active&&current>step?'rgba(218,165,32,.6)':'rgba(255,255,255,.12)'}}/>}
              </div>
            )
          })}
        </div>

        <div style={{flex:1,display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',padding:'0 20px',gap:16}}>

          {/* ════ Phase 1: GUARANTEED ════ */}
          {phase==='guaranteed'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:18}}>
              <div style={{position:'relative',width:'100%',height:220,
                display:'flex',alignItems:'center',justifyContent:'center'}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:'absolute',top:'50%',left:'50%',
                    width:88+i*74,height:88+i*74,borderRadius:'50%',
                    border:`1px solid rgba(218,165,32,${.36-i*.1})`,
                    animation:`ga-ring 2s ease-out ${i*.5}s infinite`}}/>
                ))}
                {[{s:100,d:'0ms'},{s:80,d:'180ms'},{s:80,d:'360ms'},{s:66,d:'540ms'},{s:66,d:'720ms'}].map((m,i)=>(
                  <div key={i} style={{
                    position:'absolute',
                    left:['50%','14%','72%','24%','60%'][i],
                    top:['40%','45%','45%','58%','58%'][i],
                    width:m.s,height:m.s,borderRadius:'50%',
                    overflow:'hidden',border:'2.5px solid #daa520',
                    boxShadow:`0 0 ${i===0?44:24}px rgba(218,165,32,${i===0?.95:.7})`,
                    transform:i===0?'translate(-50%,-50%)':'translate(-50%,-50%)',
                    animation:`ga-popin .42s ease-out ${m.d} both, ga-bounce .72s ease-in-out ${500+parseInt(m.d)}ms infinite`}}>
                    <img src={mascotImg} style={{width:'100%',height:'100%',objectFit:'contain',background:'rgba(4,2,14,.4)'}}/>
                  </div>
                ))}
              </div>
              <div className="ga-glow" style={{
                background:'rgba(24,10,0,.92)',border:'2px solid #daa520',
                borderRadius:22,padding:'14px 38px',textAlign:'center',backdropFilter:'blur(10px)'}}>
                <p style={{margin:0,fontWeight:900,fontSize:22,color:'#ffd700',letterSpacing:'0.08em',
                  textShadow:'0 0 28px rgba(255,215,0,.9)'}}>🎊 INMU 確定！ 🎊</p>
                <div style={{display:'flex',gap:9,justifyContent:'center',marginTop:8}}>
                  {['✦','✧','★','✧','✦'].map((s,i)=>(
                    <span key={i} style={{fontSize:18,color:'#ffd700',
                      animation:`ga-sparkle ${.5+i*.14}s ease-in-out ${i*.11}s infinite`}}>{s}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════ Phase 2: COIN INSERT — machine top close-up, coin falls into slot ════ */}
          {phase==='inserting'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,width:'100%'}}>
              <p className="ga-pulse" style={{fontSize:16,fontWeight:800,color:'#daa520',
                letterSpacing:'0.22em',margin:0,textAlign:'center'}}>コイン投入</p>

              {/* Machine cropped to show only the top dome area */}
              <div style={{width:'100%',maxWidth:340,height:252,borderRadius:20,overflow:'hidden',
                position:'relative',
                background:'radial-gradient(ellipse at 50% 110%, rgba(218,165,32,.38) 0%, transparent 44%), #040101',
                border:'1px solid rgba(184,134,11,.4)',
                boxShadow:'0 0 32px rgba(0,0,0,.8)'}}>

                {/* Machine image — only top portion visible */}
                <img src={machineImg} alt="" style={{
                  position:'absolute',
                  width:'min(296px,76vw)',
                  left:'50%',transform:'translateX(-50%)',
                  top:0,
                  filter:'drop-shadow(0 4px 32px rgba(0,0,0,.9))'}}/>

                {/* Focus vignette: spotlight on coin slot (~12% from machine top ≈ 46px) */}
                <div style={{position:'absolute',inset:0,pointerEvents:'none',
                  background:'radial-gradient(ellipse 62% 38% at 50% 22%, transparent 0%, rgba(0,0,0,0) 36%, rgba(0,0,0,.78) 72%, rgba(0,0,0,.96) 100%)'}}/>

                {/* Coin slot golden glow */}
                <div style={{position:'absolute',left:'16%',top:'12%',width:'68%',height:'20%',
                  background:'radial-gradient(ellipse,rgba(218,165,32,.86) 0%,transparent 62%)',
                  animation:'ga-glowtext 1s ease-in-out infinite',pointerEvents:'none'}}/>

                {/* INMU coin — falls from above container into slot */}
                <img src={coinImg} style={{
                  position:'absolute',left:'calc(50% - 46px)',
                  width:92,height:92,borderRadius:'50%',objectFit:'cover',
                  border:'3.5px solid #daa520',
                  boxShadow:'0 0 68px rgba(218,165,32,.98),0 0 28px rgba(255,215,0,.65)',
                  animation:'ga-coinfall2 1.15s ease-in forwards',
                  pointerEvents:'none'}}/>

                {/* Sparkles at the slot */}
                {[{l:'34%',t:'22%'},{l:'50%',t:'18%'},{l:'64%',t:'23%'}].map((p,i)=>(
                  <div key={i} style={{position:'absolute',left:p.l,top:p.t,
                    width:6,height:6,borderRadius:'50%',
                    background:'rgba(255,215,0,.95)',boxShadow:'0 0 12px rgba(218,165,32,.92)',
                    animation:`ga-particle ${.42+i*.1}s ease-in-out ${i*.12+.72}s infinite`,
                    pointerEvents:'none'}}/>
                ))}

                {/* Extra gold rays from slot */}
                {[-18,0,18].map((a,i)=>(
                  <div key={i} style={{position:'absolute',left:'calc(50% - 1.5px)',top:'22%',
                    width:3,height:'14%',borderRadius:2,
                    background:'linear-gradient(180deg,rgba(218,165,32,.7),transparent)',
                    transformOrigin:'top center',transform:`rotate(${a}deg)`,
                    animation:`ga-particle ${.5+i*.1}s ease-in-out ${i*.1}s infinite`,
                    pointerEvents:'none'}}/>
                ))}
              </div>

              <p style={{fontSize:11,color:'rgba(218,165,32,.65)',margin:0,letterSpacing:'0.12em'}}>
                INMUコインを投入します
              </p>
            </div>
          )}

          {/* ════ Phase 3: LEVER — CSS-only lever mechanism close-up ════ */}
          {phase==='lever'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,width:'100%'}}>
              <p className="ga-pulse" style={{fontSize:16,fontWeight:800,color:'#daa520',
                letterSpacing:'0.22em',margin:0,textAlign:'center'}}>レバー回転</p>

              <div style={{width:'100%',maxWidth:340,height:290,borderRadius:20,overflow:'hidden',
                position:'relative',
                background:'radial-gradient(ellipse at 46% 38%, rgba(55,32,4,.88) 0%, rgba(10,5,1,.98) 58%)',
                border:'1px solid rgba(184,134,11,.42)',
                boxShadow:'0 0 32px rgba(0,0,0,.82)'}}>

                {/* Ambient gold glow around lever */}
                <div style={{position:'absolute',left:'30%',top:'14%',width:'40%',height:'55%',
                  background:'radial-gradient(ellipse,rgba(218,165,32,.22) 0%,transparent 68%)',
                  animation:'ga-glow 1.4s ease-in-out infinite',pointerEvents:'none'}}/>

                {/* ── LEVER ASSEMBLY (centered) ── */}
                <div style={{position:'absolute',left:'50%',top:'8%',transform:'translateX(-50%)'}}>

                  {/* Cylindrical post (tall, gold metallic) */}
                  <div style={{
                    width:54,height:196,borderRadius:14,position:'relative',
                    background:'linear-gradient(90deg,#1a0e00 0%,#8a5c00 12%,#d4a020 26%,#ffe060 36%,#d4a020 50%,#8a5c00 66%,#1e1000 100%)',
                    boxShadow:'inset -6px 0 16px rgba(0,0,0,.62),inset 5px 0 10px rgba(255,230,80,.18),6px 0 26px rgba(0,0,0,.7)'
                  }}>

                    {/* Decorative rings on post */}
                    {[0,1,2].map(i=>(
                      <div key={i} style={{
                        position:'absolute',left:-5,top:28+i*54,width:64,height:16,
                        borderRadius:8,
                        background:'linear-gradient(180deg,#ffe068 0%,#c89000 60%,#8a5c00 100%)',
                        boxShadow:'0 0 10px rgba(218,165,32,.55),inset 0 2px 4px rgba(255,255,180,.3)'
                      }}/>
                    ))}

                    {/* ── LEVER ARM (rotates from near top of post) ── */}
                    <div style={{
                      position:'absolute',top:22,left:'100%',
                      transformOrigin:'0px 15px',
                      animation:'ga-leverrot2 .92s ease-in-out .1s forwards'
                    }}>
                      {/* Arm rod */}
                      <div style={{
                        width:118,height:22,borderRadius:11,
                        background:'linear-gradient(180deg,#ffe068 0%,#c89000 46%,#7a4a00 100%)',
                        boxShadow:'0 5px 20px rgba(0,0,0,.65)',position:'relative'
                      }}>
                        {/* Large knob at end of arm */}
                        <div style={{
                          position:'absolute',right:-30,top:-22,
                          width:66,height:66,borderRadius:'50%',
                          background:'radial-gradient(ellipse at 32% 26%,#fff8d0 0%,#ffe060 18%,#c89000 42%,#7a4a00 70%,#2a1400 100%)',
                          boxShadow:'0 0 38px rgba(218,165,32,.94),0 6px 18px rgba(0,0,0,.7),inset -4px -4px 12px rgba(0,0,0,.5)'
                        }}/>
                      </div>
                    </div>

                    {/* Bottom knob of post */}
                    <div style={{
                      position:'absolute',bottom:-20,left:'50%',transform:'translateX(-50%)',
                      width:74,height:44,borderRadius:'50%',
                      background:'radial-gradient(ellipse at 34% 28%,#fff8d0 0%,#ffe060 18%,#c89000 42%,#7a4a00 72%)',
                      boxShadow:'0 0 26px rgba(218,165,32,.8),0 6px 16px rgba(0,0,0,.65),inset -3px -3px 10px rgba(0,0,0,.5)'
                    }}/>
                  </div>

                  {/* Large curved rotation arrow */}
                  <div style={{
                    position:'absolute',bottom:-46,right:-88,
                    fontSize:92,lineHeight:1,color:'rgba(218,165,32,.86)',fontWeight:900,
                    textShadow:'0 0 28px rgba(218,165,32,.72)',
                    transform:'scaleX(.88)'
                  }}>↷</div>
                </div>

                {/* Gold sparkles */}
                {[{l:'68%',t:'28%'},{l:'78%',t:'42%'},{l:'62%',t:'52%'},{l:'72%',t:'60%'}].map((p,i)=>(
                  <span key={i} style={{position:'absolute',left:p.l,top:p.t,
                    fontSize:13+i*2,color:'#ffd700',
                    textShadow:'0 0 12px rgba(255,215,0,.95)',
                    animation:`ga-sparkle ${.52+i*.18}s ease-in-out ${i*.14}s infinite`}}>✦</span>
                ))}
              </div>

              <p style={{fontSize:11,color:'rgba(218,165,32,.65)',margin:0,letterSpacing:'0.12em'}}>
                レバーを回すとガチャが動き出します
              </p>
            </div>
          )}

          {/* ════ Phase 4: SPACE — cosmic scene, beam from below, coins orbit, glass orb ════ */}
          {phase==='space'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,width:'100%'}}>
              <p className="ga-pulse" style={{fontSize:16,fontWeight:800,color:'#daa520',
                letterSpacing:'0.22em',margin:0,textAlign:'center'}}>カプセル排出</p>

              <div style={{width:'100%',maxWidth:340,height:310,borderRadius:20,overflow:'hidden',
                border:'1px solid rgba(184,134,11,.46)',position:'relative',
                background:'radial-gradient(ellipse at 50% 92%, rgba(218,165,32,.32) 0%, rgba(80,20,0,.62) 28%, rgba(24,4,60,.88) 55%, rgba(2,1,16,.99) 80%)',
                boxShadow:'inset 0 2px 0 rgba(255,255,255,.04),0 0 34px rgba(0,0,0,.82)'}}>

                {/* Stars */}
                {Array.from({length:26},(_,i)=>(
                  <div key={i} style={{position:'absolute',
                    left:`${(i*43.7+5)%88+4}%`,top:`${(i*61.3+11)%78+4}%`,
                    width:1+(i%4)*.7,height:1+(i%4)*.7,borderRadius:'50%',
                    background:`rgba(255,255,255,${.5+i%3*.24})`,
                    animation:`ga-particle ${1.6+i*.28}s ease-in-out ${i*.34}s infinite`}}/>
                ))}

                {/* Light beam — BOTTOM to TOP (beam source is below) */}
                <div style={{position:'absolute',left:'calc(50% - 42px)',bottom:0,
                  width:84,height:'96%',
                  background:'linear-gradient(0deg,rgba(255,220,80,.72) 0%,rgba(218,165,32,.44) 28%,rgba(180,120,10,.22) 58%,rgba(100,60,0,.08) 78%,transparent 96%)',
                  filter:'blur(4px)',
                  animation:'ga-spotlight 3s ease-in-out infinite'}}/>

                {/* Bright core beam */}
                <div style={{position:'absolute',left:'calc(50% - 14px)',bottom:0,
                  width:28,height:'88%',
                  background:'linear-gradient(0deg,rgba(255,245,180,.88) 0%,rgba(255,215,0,.55) 28%,rgba(218,165,32,.22) 60%,transparent 90%)'}}/>

                {/* Orbiting INMU coins */}
                {[0,-0.65,-1.3,-1.95].map((delay,i)=>(
                  <div key={i} style={{
                    position:'absolute',left:'50%',top:'46%',
                    animation:`ga-orbit ${2.6+i*.18}s linear ${delay}s infinite`}}>
                    <img src={coinImg} style={{
                      position:'absolute',left:52+i*10,top:-14,
                      width:28,height:28,borderRadius:'50%',objectFit:'cover',
                      border:`${i<2?2:1.5}px solid #daa520`,
                      boxShadow:`0 0 ${14+i*4}px rgba(218,165,32,${i<2?.88:.7})`}}/>
                  </div>
                ))}

                {/* Circular ground rings (light converges here) */}
                {[210,162,118].map((w,i)=>(
                  <div key={i} style={{position:'absolute',bottom:10-i*3,left:'50%',
                    transform:'translateX(-50%)',
                    width:w,height:Math.round(w*.18),borderRadius:'50%',
                    border:`${2-i*.55}px solid rgba(218,165,32,${.72-i*.18})`,
                    boxShadow:`0 0 ${22-i*5}px rgba(218,165,32,${.52-i*.1}),inset 0 0 ${10-i*2}px rgba(218,165,32,.18)`}}/>
                ))}

                {/* Ground glow */}
                <div style={{position:'absolute',bottom:0,left:'8%',width:'84%',height:42,
                  background:'radial-gradient(ellipse,rgba(218,165,32,.62) 0%,rgba(218,165,32,.25) 48%,transparent 70%)',
                  filter:'blur(8px)'}}/>

                {/* Glass orb materializes — transparent glass sphere with mascot + inner glow */}
                <div style={{position:'absolute',bottom:'22%',left:'50%',transform:'translateX(-50%)',
                  animation:'ga-reveal .7s ease-out .32s both',zIndex:8}}>
                  <div style={{position:'relative',width:100,height:100,borderRadius:'50%',
                    background:'radial-gradient(ellipse at 36% 30%, rgba(255,255,255,.72) 0%, rgba(220,235,255,.3) 22%, rgba(160,190,230,.1) 46%, rgba(80,110,180,.08) 70%, rgba(15,20,50,.18) 100%)',
                    border:'1.5px solid rgba(180,210,255,.32)',
                    boxShadow:'0 0 56px rgba(218,165,32,.82),0 0 24px rgba(218,165,32,.48),inset 0 -3px 14px rgba(100,140,220,.14),inset 4px 4px 12px rgba(255,255,255,.26)'}}>
                    {/* Top-left glass highlight */}
                    <div style={{position:'absolute',top:9,left:13,width:26,height:15,borderRadius:'50%',
                      background:'rgba(255,255,255,.6)',transform:'rotate(-24deg)'}}/>
                    {/* Secondary small highlight */}
                    <div style={{position:'absolute',top:22,left:10,width:10,height:6,borderRadius:'50%',
                      background:'rgba(255,255,255,.36)',transform:'rotate(-18deg)'}}/>
                    {/* Inner gold glow (bottom center) */}
                    <div style={{position:'absolute',bottom:14,left:'50%',transform:'translateX(-50%)',
                      width:40,height:20,borderRadius:'50%',
                      background:'rgba(218,165,32,.38)',filter:'blur(5px)'}}/>
                    {/* Mascot inside orb */}
                    <div style={{position:'absolute',inset:10,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <img src={mascotImg} style={{width:52,height:'auto',objectFit:'contain',
                        opacity:.8,filter:'drop-shadow(0 2px 8px rgba(0,0,0,.6))'}}/>
                    </div>
                  </div>
                </div>

                {/* Gold sparkle particles */}
                {[{l:'28%',t:'22%',s:4},{l:'68%',t:'28%',s:3.2},{l:'18%',t:'46%',s:3.5},{l:'78%',t:'36%',s:3},{l:'38%',t:'14%',s:2.8}].map((p,i)=>(
                  <div key={i} style={{position:'absolute',left:p.l,top:p.t,
                    width:p.s,height:p.s,borderRadius:'50%',
                    background:'rgba(255,215,0,.92)',
                    boxShadow:`0 0 ${p.s*2.8}px rgba(218,165,32,.88)`,
                    animation:`ga-particle ${1.4+i*.32}s ease-in-out ${i*.26}s infinite`}}/>
                ))}
              </div>

              <p style={{fontSize:11,color:'rgba(218,165,32,.65)',margin:0,textAlign:'center',letterSpacing:'0.12em'}}>
                宇宙の神秘の中、カプセルが排出されます
              </p>
            </div>
          )}

          {/* ════ Phase 5: FALLING — glass orb falls through starfield, lands with shockwave ════ */}
          {phase==='falling'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,width:'100%'}}>
              <p className="ga-pulse" style={{fontSize:16,fontWeight:800,color:'#daa520',
                letterSpacing:'0.22em',margin:0,textAlign:'center'}}>カプセル落下</p>

              <div style={{width:'100%',maxWidth:340,height:310,borderRadius:20,overflow:'hidden',
                border:'1px solid rgba(184,134,11,.38)',position:'relative',
                background:'radial-gradient(ellipse at 50% 98%, rgba(218,165,32,.34) 0%, rgba(100,50,0,.48) 22%, transparent 46%), #010008',
                boxShadow:'0 0 32px rgba(0,0,0,.82)'}}>

                {/* Stars (more prominent here) */}
                {Array.from({length:32},(_,i)=>(
                  <div key={i} style={{position:'absolute',
                    left:`${(i*37.3+8)%86+5}%`,top:`${(i*53.8+14)%82+5}%`,
                    width:1+(i%4)*.8,height:1+(i%4)*.8,borderRadius:'50%',
                    background:`rgba(255,255,255,${.45+i%4*.18})`,
                    animation:`ga-particle ${1.8+i*.22}s ease-in-out ${i*.28}s infinite`}}/>
                ))}

                {/* Faint vertical light trails (speed lines) */}
                {[-66,-38,38,66].map((x,i)=>(
                  <div key={i} style={{position:'absolute',
                    left:`calc(50% + ${x}px - 1px)`,top:0,
                    width:1.5,height:'100%',
                    background:'linear-gradient(180deg,transparent 0%,rgba(218,165,32,.16) 30%,rgba(218,165,32,.16) 70%,transparent 100%)',
                    opacity:.6}}/>
                ))}

                {/* Falling glass orb + mascot — transparent glass sphere */}
                <div style={{position:'absolute',left:0,right:0,
                  display:'flex',justifyContent:'center',zIndex:8,
                  animation:'ga-capland 1.05s ease-in forwards'}}>
                  <div style={{position:'relative',width:110,height:110,borderRadius:'50%',
                    background:'radial-gradient(ellipse at 36% 30%, rgba(255,255,255,.7) 0%, rgba(215,232,255,.28) 22%, rgba(150,185,230,.1) 46%, rgba(70,105,175,.07) 70%, rgba(10,18,45,.16) 100%)',
                    border:'1.5px solid rgba(180,210,255,.35)',
                    boxShadow:'0 0 66px rgba(218,165,32,.92),0 0 30px rgba(218,165,32,.55),inset 0 -3px 16px rgba(100,140,220,.13),inset 4px 4px 14px rgba(255,255,255,.28)'}}>
                    {/* Top-left glass highlight */}
                    <div style={{position:'absolute',top:11,left:15,width:28,height:17,borderRadius:'50%',
                      background:'rgba(255,255,255,.62)',transform:'rotate(-24deg)'}}/>
                    {/* Secondary highlight */}
                    <div style={{position:'absolute',top:24,left:11,width:11,height:7,borderRadius:'50%',
                      background:'rgba(255,255,255,.38)',transform:'rotate(-18deg)'}}/>
                    {/* Inner gold glow */}
                    <div style={{position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',
                      width:44,height:22,borderRadius:'50%',
                      background:'rgba(218,165,32,.42)',filter:'blur(5px)'}}/>
                    {/* Mascot inside */}
                    <div style={{position:'absolute',inset:11,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <img src={mascotImg} style={{width:62,height:'auto',objectFit:'contain',
                        opacity:.82,filter:'drop-shadow(0 2px 8px rgba(0,0,0,.65))'}}/>
                    </div>
                  </div>
                </div>

                {/* Shockwave rings on landing */}
                {[0,.16,.32].map((d,i)=>(
                  <div key={i} style={{
                    position:'absolute',bottom:8,left:'50%',
                    width:86+i*58,height:14+i*10,
                    borderRadius:'50%',
                    border:`${2-i*.55}px solid rgba(218,165,32,${.76-i*.2})`,
                    boxShadow:`0 0 ${14-i*3}px rgba(218,165,32,${.48-i*.12})`,
                    opacity:0,
                    animation:`ga-shockwave .9s ease-out ${.76+d}s both`}}/>
                ))}

                {/* Ground impact glow */}
                <div style={{position:'absolute',bottom:0,left:'10%',width:'80%',height:38,
                  background:'radial-gradient(ellipse,rgba(218,165,32,.58) 0%,transparent 68%)',
                  filter:'blur(8px)',
                  animation:'ga-glowtext 2s ease-in-out .74s infinite'}}/>

                {/* Impact sparkles */}
                {[{l:'32%',b:'6%'},{l:'68%',b:'4%'},{l:'42%',b:'10%'},{l:'58%',b:'8%'}].map((p,i)=>(
                  <div key={i} style={{position:'absolute',left:p.l,bottom:p.b,
                    fontSize:12,color:'#ffd700',
                    textShadow:'0 0 10px rgba(255,215,0,.9)',
                    animation:`ga-sparkle ${.5+i*.16}s ease-in-out ${.8+i*.12}s infinite`}}>✦</div>
                ))}
              </div>

              <p style={{fontSize:11,color:'rgba(218,165,32,.65)',margin:0,letterSpacing:'0.12em'}}>
                カプセルが下へ落ちていきます
              </p>
            </div>
          )}

          {/* ════ Phase 6: OPENING ════ */}
          {phase==='opening'&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
              <p style={{fontSize:14,fontWeight:800,color:'#daa520',letterSpacing:'0.18em',margin:0,
                animation:'ga-glowtext 1.1s ease-in-out infinite'}}>カプセル開封中…</p>
              <div style={{position:'relative',height:220,width:220,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{position:'absolute',inset:-24,borderRadius:'50%',
                  background:'radial-gradient(circle,rgba(255,255,180,.9) 0%,rgba(218,165,32,.65) 36%,transparent 62%)',
                  animation:'ga-burst .72s ease-out .1s forwards',opacity:0}}/>
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:'absolute',
                    width:68+i*62,height:68+i*62,borderRadius:'50%',
                    border:`1px solid rgba(218,165,32,${.52-i*.14})`,
                    animation:`ga-ring ${.5+i*.26}s ease-out ${.16+i*.14}s forwards`}}/>
                ))}
                {/* Top half */}
                <div style={{position:'absolute',width:150,height:75,
                  borderRadius:'75px 75px 0 0',overflow:'hidden',
                  top:18,transformOrigin:'bottom center',
                  animation:'ga-split-t .62s ease-out .12s forwards',
                  boxShadow:'0 -8px 30px rgba(218,165,32,.65)',zIndex:5}}>
                  <PrizeCapsule prizeId={result?.results[0]?.prizeId??'pts100'} size={150}/>
                </div>
                {/* Bottom half */}
                <div style={{position:'absolute',width:150,height:75,
                  borderRadius:'0 0 75px 75px',overflow:'hidden',
                  top:111,transformOrigin:'top center',
                  animation:'ga-split-b .62s ease-out .12s forwards',
                  boxShadow:'0 8px 30px rgba(218,165,32,.55)',zIndex:5}}>
                  <PrizeCapsule prizeId={result?.results[0]?.prizeId??'pts100'} size={150}/>
                </div>
              </div>
            </div>
          )}

          {/* ════ DONE: Single result ════ */}
          {phase==='done'&&result&&!isMulti&&(
            <div className="ga-reveal" style={{
              display:'flex',flexDirection:'column',alignItems:'center',gap:14,width:'100%',maxWidth:320}}>
              {result.wasGuaranteed&&(
                <p style={{fontSize:12,fontWeight:700,color:'#ffd700',margin:0,
                  animation:'ga-glowtext 1.5s ease-in-out infinite'}}>✨ 確定演出が発動しました！</p>
              )}
              {result.results.map((prize)=>{
                const c=CAPSULE[prize.prizeId]??CAPSULE.pts100
                return (
                  <div key={prize.prizeId} style={{width:'100%',display:'flex',
                    flexDirection:'column',alignItems:'center',gap:14}}>
                    <div style={{position:'relative'}}>
                      <PrizeCapsule prizeId={prize.prizeId} size={160} open/>
                      {prize.prizeId==='inmu10k'&&(
                        <div style={{position:'absolute',inset:-18,borderRadius:'50%',
                          background:`radial-gradient(circle,${c.glow} 0%,transparent 65%)`,
                          animation:'ga-glow 1.1s ease-in-out infinite',pointerEvents:'none'}}/>
                      )}
                    </div>
                    {/* Prize panel */}
                    <div style={{width:'100%',textAlign:'center',
                      background:'linear-gradient(135deg,rgba(10,5,2,.94),rgba(6,3,18,.94))',
                      border:`1.5px solid ${c.border}`,borderRadius:18,
                      padding:'16px 20px',backdropFilter:'blur(12px)',
                      boxShadow:`inset 0 1px 0 rgba(255,255,255,.06),0 0 38px ${c.glow}1e`}}>
                      <p style={{margin:0,fontWeight:900,fontSize:24,
                        color:prize.prizeId==='inmu10k'?'#ffd700':'#e0d0b0',
                        textShadow:`0 0 18px ${c.glow}66`}}>
                        {prize.label}
                      </p>
                      <p style={{margin:'6px 0 10px',fontSize:12,color:'rgba(255,255,255,.5)'}}>
                        ポイントを即時付与しました
                      </p>
                      <img src={mascotImg} style={{width:52,height:'auto',objectFit:'contain',
                        filter:'drop-shadow(0 4px 10px rgba(0,0,0,.7))',
                        animation:'ga-bounce 1.1s ease-in-out infinite'}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ════ DONE: Multi result (10連) ════ */}
          {phase==='done'&&result&&isMulti&&(
            <div className="ga-reveal" style={{
              display:'flex',flexDirection:'column',gap:14,width:'100%',maxWidth:340}}>
              {result.wasGuaranteed&&(
                <p style={{fontSize:12,fontWeight:700,color:'#ffd700',textAlign:'center',margin:0}}>
                  ✨ 確定演出が発動しました！
                </p>
              )}
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6}}>
                {result.results.map((prize,i)=>{
                  const c=CAPSULE[prize.prizeId]??CAPSULE.pts100
                  return (
                    <div key={i} style={{display:'flex',flexDirection:'column',
                      alignItems:'center',gap:3,
                      opacity:i<revIdx?1:0,
                      animation:i<revIdx?'ga-card .3s ease-out forwards':'none'}}>
                      <PrizeCapsule prizeId={prize.prizeId} size={58} open/>
                      <p style={{fontSize:8,fontWeight:800,color:c.border,
                        margin:0,textAlign:'center',lineHeight:1.2}}>
                        {c.label}
                      </p>
                    </div>
                  )
                })}
              </div>
              {result.totalPoints>0&&(
                <p style={{margin:0,fontSize:15,color:'#ffd700',textAlign:'center',fontWeight:900,
                  textShadow:'0 0 22px rgba(255,215,0,.75)'}}>
                  合計 +{result.totalPoints.toLocaleString()} pt 獲得！
                </p>
              )}
              <div style={{display:'flex',justifyContent:'center'}}>
                <img src={mascotImg} style={{width:60,height:'auto',objectFit:'contain',
                  filter:'drop-shadow(0 4px 12px rgba(0,0,0,.7))',
                  animation:'ga-bounce 1s ease-in-out infinite'}}/>
              </div>
            </div>
          )}

        </div>
      </PageBg>
    </AppShell>
  )
}

/* ════ JACKPOT SCREEN (10,000 INMU) — multi-step sequential reveal ════ */
function JackpotScreen({ pts, onReset, profile, unread }:{
  pts:number; onReset:()=>void;
  profile:{role?:string;displayName?:string}|null;
  unread:number
}) {
  const [step,setStep]=useState(0)
  const [flash,setFlash]=useState(true)

  useEffect(()=>{
    playJackpotSE()
    const ts=[
      setTimeout(()=>setFlash(false),900),
      setTimeout(()=>setStep(1),320),    // JACKPOT title
      setTimeout(()=>setStep(2),980),    // gold capsule + burst glow
      setTimeout(()=>setStep(3),1680),   // capsule opens (split)
      setTimeout(()=>setStep(4),2080),   // mascot burst from capsule
      setTimeout(()=>setStep(5),2600),   // multiple mascots jumping
      setTimeout(()=>setStep(6),3200),   // 10,000 INMU display
      setTimeout(()=>setStep(7),4100),   // back button
    ]
    return()=>ts.forEach(clearTimeout)
  },[])

  return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>

      {/* Full-screen gold flash */}
      {flash&&<div style={{position:'fixed',inset:0,zIndex:9999,pointerEvents:'none',
        background:'radial-gradient(circle at 50% 42%,rgba(255,255,200,.98) 0%,rgba(218,165,32,.88) 38%,transparent 68%)',
        animation:'ga-goldflash .9s ease-out forwards'}}/>}

      <PageBg jackpot>
        {/* Rising coins */}
        <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:4,overflow:'hidden'}}>
          {COIN_RISES.map((c,i)=>(
            <div key={i} style={{position:'absolute',bottom:'-8%',left:c.x,
              animation:`ga-coinrise ${c.dur}s ease-in ${c.delay}s infinite`}}>
              <img src={coinImg} style={{width:c.sz,height:c.sz,borderRadius:'50%',objectFit:'cover',
                border:'2px solid #daa520',boxShadow:'0 0 12px rgba(218,165,32,.8)',opacity:.88}}/>
            </div>
          ))}
        </div>
        {/* Particles */}
        <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:3}}>
          {JP_PARTICLES.map((p,i)=>(
            <div key={i} style={{position:'absolute',left:p.x,top:p.y,
              width:p.s,height:p.s,borderRadius:'50%',
              background:'rgba(255,215,0,.88)',
              boxShadow:`0 0 ${p.s*2.8}px rgba(218,165,32,.7)`,
              animation:`ga-drift ${p.dur}s ease-in-out ${p.delay}s infinite`}}/>
          ))}
        </div>
        {/* Rings */}
        <div style={{position:'absolute',top:'40%',left:'50%',zIndex:3,pointerEvents:'none'}}>
          {[0,1,2,3,4].map(i=>(
            <div key={i} style={{position:'absolute',
              width:78+i*68,height:78+i*68,borderRadius:'50%',
              border:`${Math.max(.6,1.8-i*.3)}px solid rgba(218,165,32,${.55-i*.08})`,
              animation:`ga-ring 2s ease-out ${i*.4}s infinite`}}/>
          ))}
        </div>

        <div style={{position:'relative',zIndex:6,display:'flex',
          flexDirection:'column',alignItems:'center',
          padding:'14px 18px',gap:14,minHeight:'100dvh',overflowY:'auto'}}>

          {/* Step 1: JACKPOT title */}
          {step>=1&&(
            <div className="ga-reveal" style={{textAlign:'center',marginTop:4}}>
              <h1 style={{margin:0,fontSize:'min(10vw,36px)',fontWeight:900,
                fontFamily:'Georgia,serif',letterSpacing:'0.12em',color:'#ffd700',
                animation:'ga-jppulse 1.3s ease-in-out infinite, ga-jpzoom .52s ease-out forwards',opacity:0}}>
                ◆ JACKPOT !! ◆
              </h1>
              <div style={{display:'flex',justifyContent:'center',gap:9,marginTop:5}}>
                {['✦','★','✦','★','✦'].map((s,i)=>(
                  <span key={i} style={{fontSize:20,color:'#ffd700',
                    animation:`ga-sparkle ${.68+i*.17}s ease-in-out ${i*.13}s infinite`}}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Gold capsule burst */}
          {step===2&&(
            <div className="ga-reveal" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{position:'relative'}}>
                <div style={{position:'absolute',inset:-32,borderRadius:'50%',
                  background:'radial-gradient(circle,rgba(255,250,80,.68) 0%,rgba(218,165,32,.36) 42%,transparent 68%)',
                  animation:'ga-glow .8s ease-in-out infinite'}}/>
                <div style={{position:'absolute',inset:-52,borderRadius:'50%',
                  animation:'ga-burst .65s ease-out forwards',opacity:0,
                  background:'radial-gradient(circle,rgba(255,255,120,.52) 0%,transparent 60%)'}}/>
                <PrizeCapsule prizeId="inmu10k" size={168}/>
              </div>
            </div>
          )}

          {/* Step 3: Capsule opening */}
          {step===3&&(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
              <div style={{position:'relative',height:200,width:200,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{position:'absolute',inset:-28,borderRadius:'50%',
                  background:'radial-gradient(circle,rgba(255,255,180,.9) 0%,rgba(218,165,32,.68) 36%,transparent 62%)',
                  animation:'ga-burst .72s ease-out .05s forwards',opacity:0}}/>
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:'absolute',
                    width:68+i*58,height:68+i*58,borderRadius:'50%',
                    border:`1px solid rgba(218,165,32,${.55-i*.15})`,
                    animation:`ga-ring ${.48+i*.24}s ease-out ${.12+i*.14}s forwards`}}/>
                ))}
                <div style={{position:'absolute',width:155,height:78,
                  borderRadius:'78px 78px 0 0',overflow:'hidden',
                  top:14,transformOrigin:'bottom center',
                  animation:'ga-split-t .6s ease-out .1s forwards',
                  boxShadow:'0 -8px 32px rgba(218,165,32,.7)',zIndex:5}}>
                  <PrizeCapsule prizeId="inmu10k" size={155}/>
                </div>
                <div style={{position:'absolute',width:155,height:78,
                  borderRadius:'0 0 78px 78px',overflow:'hidden',
                  top:110,transformOrigin:'top center',
                  animation:'ga-split-b .6s ease-out .1s forwards',
                  boxShadow:'0 8px 32px rgba(218,165,32,.58)',zIndex:5}}>
                  <PrizeCapsule prizeId="inmu10k" size={155}/>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Mascot bursts from capsule */}
          {step===4&&(
            <div className="ga-reveal" style={{display:'flex',flexDirection:'column',
              alignItems:'center',gap:6}}>
              <img src={mascotImg} style={{
                width:110,height:'auto',objectFit:'contain',
                filter:'drop-shadow(0 0 32px rgba(218,165,32,.88)) drop-shadow(-2px 8px 18px rgba(0,0,0,.8))',
                animation:'ga-popin .42s ease-out both'}}/>
            </div>
          )}

          {/* Step 5+: Multiple mascots jumping */}
          {step>=5&&(
            <div style={{display:'flex',gap:12,alignItems:'flex-end',justifyContent:'center'}}>
              {[{s:82,d:'0s'},{s:108,d:'.24s'},{s:82,d:'.48s'}].map((m,i)=>(
                <img key={i} src={mascotImg} style={{
                  width:m.s,height:'auto',objectFit:'contain',
                  filter:'drop-shadow(-2px 8px 18px rgba(0,0,0,.8)) drop-shadow(0 0 16px rgba(218,165,32,.55))',
                  animation:`ga-bounce .82s ease-in-out ${m.d} infinite`}}/>
              ))}
            </div>
          )}

          {/* Step 6+: 10,000 INMU display */}
          {step>=6&&(
            <div className="ga-reveal" style={{textAlign:'center',
              background:'linear-gradient(135deg,rgba(26,12,2,.96),rgba(36,20,4,.96))',
              border:'2px solid rgba(218,165,32,.72)',borderRadius:22,
              padding:'16px 28px',backdropFilter:'blur(10px)',
              boxShadow:'inset 0 1px 0 rgba(255,255,255,.12),0 0 44px rgba(218,165,32,.38)'}}>
              <p style={{margin:0,fontWeight:900,fontSize:22,color:'#ffd700',letterSpacing:'0.04em',
                textShadow:'0 0 28px rgba(255,215,0,.95)'}}>
                🏆 おめでとうございます！
              </p>
              <p style={{margin:'6px 0 0',fontSize:16,fontWeight:900,color:'#ffe566',
                textShadow:'0 0 18px rgba(255,215,0,.78)'}}>
                10,000 INMU 獲得！
              </p>
              <p style={{margin:'5px 0 0',fontSize:11,color:'rgba(253,230,138,.72)',lineHeight:1.6}}>
                報酬は後日運営より送金されます
              </p>
            </div>
          )}

          {/* Step 6+: Points counter */}
          {step>=6&&(
            <div className="ga-reveal" style={{background:'linear-gradient(135deg,rgba(16,8,2,.96),rgba(24,14,2,.96))',
              border:'1px solid rgba(184,134,11,.58)',borderRadius:14,
              padding:'10px 22px',display:'flex',alignItems:'center',gap:12,
              boxShadow:'inset 0 1px 0 rgba(255,255,255,.08),0 4px 16px rgba(0,0,0,.5)'}}>
              <img src={coinImg} style={{width:26,height:26,borderRadius:'50%',objectFit:'cover',
                border:'1.5px solid #daa520',boxShadow:'0 0 12px rgba(218,165,32,.5)'}}/>
              <div>
                <p style={{margin:0,fontSize:9,color:'rgba(218,165,32,.7)',fontWeight:700,letterSpacing:'0.15em'}}>INMU POINT</p>
                <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                  <span style={{fontFamily:'monospace',fontWeight:900,fontSize:22,color:'#ffd700',
                    textShadow:'0 0 18px rgba(255,215,0,.62)'}}>{pts.toLocaleString()}</span>
                  <span style={{fontSize:12,color:'rgba(218,165,32,.75)',fontWeight:700}}>pt</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Back button */}
          {step>=7&&(
            <button type="button" onClick={onReset} className="ga-reveal"
              style={{background:'linear-gradient(160deg,#ffe680 0%,#d4a017 30%,#7a5500 100%)',
                border:'none',borderRadius:20,padding:'14px 48px',
                color:'#2a1800',fontWeight:900,fontSize:15,cursor:'pointer',letterSpacing:'0.06em',
                boxShadow:'0 8px 18px rgba(0,0,0,.6),inset 0 2px 2px rgba(255,255,255,.55)',
                marginBottom:28}}>
              ガチャ画面へ戻る
            </button>
          )}

        </div>
      </PageBg>
    </AppShell>
  )
}
