import { useState, useEffect, useCallback, useRef } from 'react'
import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown } from 'lucide-react'
import mascotImg  from '@assets/IMG_4397_1782097134955.jpeg'
import coinImg    from '@assets/IMG_6637_1782097134955.jpeg'
import machineImg from '@assets/generated_images/gacha-machine.png'
import bgImg      from '@assets/generated_images/gacha-bg.png'
import capsuleImg from '@assets/generated_images/gacha-capsule.png'
import jackpotBg  from '@assets/generated_images/gacha-jackpot-bg.png'

/* ─── 型定義 ─── */
type Phase = 'idle'|'guaranteed'|'inserting'|'lever'|'space'|'falling'|'opening'|'done'
type Prize = { prizeId:string; label:string; type:'points'|'inmu'; amount:number }
type Result = { results:Prize[]; totalPoints:number; hasInmu:boolean; wasGuaranteed:boolean; costPoints:number; newPoints:number }
type HistRow = { id:number; pullType:string; results:Prize[]; totalPoints:number; hasInmu:boolean; inmuSentStatus:string; wasGuaranteed:boolean; costPoints:number; createdAt:string }

/* ─── デザイントークン ─── */
const GOLD_BTN    = 'linear-gradient(160deg,#ffe680 0%,#d4a017 25%,#b8860b 55%,#7a5500 100%)'
const GOLD_BTN_DK = '#3d2900'
const GOLD_RIM    = 'rgba(255,238,150,.95)'
const RED_BTN     = 'linear-gradient(160deg,#ff7070 0%,#c41f1f 28%,#8a0808 58%,#3e0000 100%)'
const RED_BTN_DK  = '#300000'
const RED_RIM     = 'rgba(255,180,180,.9)'

const BALLS = [
  { id:'pts100',  label:'100pt',       rate:'88%', glow:'#90a0a0' },
  { id:'pts1000', label:'1,000pt',     rate:'8%',  glow:'#5090e0' },
  { id:'pts5000', label:'5,000pt',     rate:'3%',  glow:'#c060e0' },
  { id:'inmu10k', label:'10,000 INMU', rate:'1%',  glow:'#f8c030' },
]
const PRIZE_LABEL: Record<string,string> = { pts100:'100pt', pts1000:'1,000pt', pts5000:'5,000pt', inmu10k:'10,000\nINMU' }
const PHASE_MS: Partial<Record<Phase,number>> = { guaranteed:3200, inserting:1300, lever:1100, space:2000, falling:1000, opening:800 }

/* ─── 事前計算（決定論的）─── */
const BG_PARTICLES   = Array.from({length:28},(_,i)=>({ x:`${(i*41.7+8)%90}%`, y:`${(i*63.1+5)%90}%`, s:1.2+(i%4)*.9, dur:3+(i%6)*1.2, delay:(i*.6)%7 }))
const SPACE_PARTICLES= Array.from({length:22},(_,i)=>({ x:`${(i*38.7+5)%84+8}%`, y:`${(i*57.3+13)%70+10}%`, s:1.8+(i%5)*1.1, dur:1.8+(i%4)*.7, delay:(i*.43)%4.5 }))
const TRAIL_DOTS     = Array.from({length:10},(_,i)=>({ lx:`${44+(i%3-1)*3}%`, top:`${8+i*7}%`, sz:Math.max(2,6-i*.45) }))
const JP_PARTICLES   = Array.from({length:55},(_,i)=>({ x:`${(i*17.3+4)%93}%`, y:`${(i*23.7+7)%90}%`, s:1.5+(i%6)*1.4, dur:1.2+(i%5)*.7, delay:(i*.25)%4.2 }))
const COIN_FLIGHTS   = Array.from({length:14},(_,i)=>({ x:`${(i*7.1+3)%88}%`, sz:22+(i%4)*10, delay:(i*.22)%3.4, dur:2+(i%4)*.7 }))

/* ─── ジャックポット SE ─── */
function playJackpotSE() {
  try {
    const ctx = new AudioContext()
    ;[523.25,659.25,783.99,1046.5,1318.5].forEach((f,i)=>{
      const o=ctx.createOscillator(), g=ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value=f; o.type='sine'
      const t=ctx.currentTime+i*.16
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.28,t+.04); g.gain.exponentialRampToValueAtTime(.001,t+.5)
      o.start(t); o.stop(t+.52)
    })
    const bass=ctx.createOscillator(), bg=ctx.createGain()
    bass.connect(bg); bg.connect(ctx.destination)
    bass.type='triangle'; bass.frequency.value=80
    bg.gain.setValueAtTime(.4,ctx.currentTime); bg.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3)
    bass.start(ctx.currentTime); bass.stop(ctx.currentTime+.32)
  } catch {/**/}
}

/* ─── CSS ─── */
const CSS = `
  @keyframes ga-float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
  @keyframes ga-floatslow { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-8px) scale(1.02)} }
  @keyframes ga-pulse     { 0%,100%{text-shadow:0 0 8px rgba(218,165,32,.3)} 50%{text-shadow:0 0 40px rgba(255,215,0,1),0 0 80px rgba(218,165,32,.6)} }
  @keyframes ga-glow      { 0%,100%{box-shadow:0 0 18px 6px rgba(218,165,32,.5)} 50%{box-shadow:0 0 70px 28px rgba(218,165,32,1)} }
  @keyframes ga-glowtext  { 0%,100%{opacity:.55} 50%{opacity:1} }
  @keyframes ga-clap      { 0%,100%{transform:translateY(0)scale(1)} 35%{transform:translateY(-22px)scale(1.12)} 70%{transform:translateY(-9px)} }
  @keyframes ga-bounce    { 0%,100%{transform:translateY(0)rotate(0)} 40%{transform:translateY(-26px)rotate(-6deg)scale(1.08)} 68%{transform:translateY(-10px)rotate(3deg)} }
  @keyframes ga-popin     { 0%{transform:scale(0)rotate(-18deg);opacity:0} 65%{transform:scale(1.18)rotate(4deg);opacity:1} 100%{transform:scale(1)rotate(0);opacity:1} }
  @keyframes ga-hand      { 0%{transform:translateY(0);opacity:1} 100%{transform:translateY(-56px);opacity:0} }
  @keyframes ga-sparkle   { 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1.5)} }
  @keyframes ga-ring      { 0%{transform:translate(-50%,-50%)scale(1);opacity:.75} 100%{transform:translate(-50%,-50%)scale(3.5);opacity:0} }
  @keyframes ga-drop      { 0%{transform:translateY(-120px)rotate(0);opacity:0} 70%{transform:translateY(8px)rotate(200deg);opacity:1} 100%{transform:translateY(0)rotate(360deg);opacity:1} }
  @keyframes ga-reveal    { from{transform:scale(.6)translateY(22px);opacity:0} to{transform:scale(1)translateY(0);opacity:1} }
  @keyframes ga-card      { from{transform:translateY(16px)scale(.8);opacity:0} to{transform:translateY(0)scale(1);opacity:1} }
  @keyframes ga-machinepulse { 0%,100%{filter:drop-shadow(0 14px 44px rgba(0,0,0,.92)) drop-shadow(0 0 20px rgba(184,134,11,.22))} 50%{filter:drop-shadow(0 14px 44px rgba(0,0,0,.92)) drop-shadow(0 0 60px rgba(218,165,32,.8))} }
  @keyframes ga-capsulefly { 0%{transform:translateY(90px)scale(.3)rotate(-12deg);opacity:0} 60%{transform:translateY(-65px)scale(1.1)rotate(6deg);opacity:1} 100%{transform:translateY(-50px)scale(1)rotate(0);opacity:1} }
  @keyframes ga-capfall   { 0%{transform:translateY(-90px)rotate(0);opacity:0} 15%{opacity:1} 100%{transform:translateY(280px)rotate(600deg);opacity:.45} }
  @keyframes ga-split-t   { to{transform:translateY(-68px)rotate(-22deg)scale(1.05)} }
  @keyframes ga-split-b   { to{transform:translateY(68px)rotate(22deg)scale(1.05)} }
  @keyframes ga-burst     { 0%{opacity:0;transform:scale(.15)} 30%{opacity:.95} 100%{opacity:0;transform:scale(3.2)} }
  @keyframes ga-goldflash { 0%{opacity:0} 18%{opacity:1} 100%{opacity:0} }
  @keyframes ga-shake     { 0%,100%{transform:translateX(0)} 12%{transform:translateX(-10px)} 24%{transform:translateX(10px)} 36%{transform:translateX(-7px)} 48%{transform:translateX(7px)} 60%{transform:translateX(-4px)} 72%{transform:translateX(4px)} 84%{transform:translateX(-2px)} }
  @keyframes ga-particle  { 0%,100%{opacity:0;transform:translateY(0)scale(.7)} 40%,60%{opacity:1} 50%{transform:translateY(-16px)scale(1.3)} }
  @keyframes ga-drift     { 0%{opacity:0;transform:translateY(16px)scale(.8)} 30%,70%{opacity:.9} 100%{opacity:0;transform:translateY(-44px)scale(.5)} }
  @keyframes ga-spotlight { 0%,100%{opacity:.5} 50%{opacity:1} }
  @keyframes ga-lever     { 0%{transform:rotate(0) translateX(0)} 50%,100%{transform:rotate(-48deg) translateX(4px)} }
  @keyframes ga-leverback { 0%,50%{transform:rotate(-48deg)} 100%{transform:rotate(0)} }
  @keyframes ga-coinfly   { 0%{transform:translateY(60px)rotate(0);opacity:1} 75%{opacity:.9} 100%{transform:translateY(-160px)rotate(540deg);opacity:0} }
  @keyframes ga-jpzoom    { 0%{transform:scale(.1)rotate(-10deg);opacity:0} 65%{transform:scale(1.18)rotate(2deg);opacity:1} 100%{transform:scale(1)rotate(0);opacity:1} }
  @keyframes ga-jpbg      { 0%,100%{filter:brightness(1)saturate(1.1)} 50%{filter:brightness(1.5)saturate(1.8)} }
  @keyframes ga-jppulse   { 0%,100%{text-shadow:0 0 10px rgba(255,215,0,.4),0 0 0 transparent} 50%{text-shadow:0 0 50px rgba(255,215,0,1),0 0 100px rgba(218,165,32,.9),0 0 20px #fff} }
  @keyframes ga-mascotbounce { 0%,100%{transform:translateY(0)scaleX(1)} 42%{transform:translateY(-32px)scaleX(.95)} 72%{transform:translateY(-12px)} }
  .ga-float{animation:ga-float 2.8s ease-in-out infinite}
  .ga-floatslow{animation:ga-floatslow 3.4s ease-in-out infinite}
  .ga-pulse{animation:ga-pulse 2.2s ease-in-out infinite}
  .ga-glow{animation:ga-glow 1.3s ease-in-out infinite}
  .ga-reveal{animation:ga-reveal .42s ease-out forwards}
  .ga-machinepulse{animation:ga-machinepulse 2.6s ease-in-out infinite}
  .ga-shake{animation:ga-shake .55s ease-out}
`

/* ─── 金色パーティクル ─── */
function GoldParticles({ particles=BG_PARTICLES, drift=false }: { particles?: typeof BG_PARTICLES; drift?:boolean }) {
  return (
    <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden',zIndex:3}}>
      {particles.map((p,i)=>(
        <div key={i} style={{position:'absolute',left:p.x,top:p.y,
          width:p.s,height:p.s,borderRadius:'50%',
          background:'rgba(255,215,0,.88)',
          boxShadow:`0 0 ${p.s*2.8}px rgba(218,165,32,.7)`,
          animation:`${drift?'ga-drift':'ga-particle'} ${p.dur}s ease-in-out ${p.delay}s infinite`}} />
      ))}
    </div>
  )
}

/* ─── スポットライト ─── */
function Spotlight() {
  return (
    <>
      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:2,
        background:'radial-gradient(ellipse 52% 72% at 33% -6%, rgba(218,165,32,.24) 0%, transparent 60%)',
        animation:'ga-spotlight 5.5s ease-in-out infinite'}} />
      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:2,
        background:'radial-gradient(ellipse 52% 72% at 68% -6%, rgba(180,120,20,.19) 0%, transparent 60%)',
        animation:'ga-spotlight 5.5s ease-in-out 2.8s infinite'}} />
    </>
  )
}

/* ─── 共通背景ラッパー ─── */
function PageBg({ children, jackpot=false, particles=true }: { children:React.ReactNode; jackpot?:boolean; particles?:boolean }) {
  return (
    <div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',
      backgroundImage:`url(${jackpot?jackpotBg:bgImg})`,
      backgroundSize:'cover',backgroundPosition:'center top',position:'relative',
      animation:jackpot?'ga-jpbg 2s ease-in-out infinite':'none'}}>
      <div style={{position:'absolute',inset:0,pointerEvents:'none',
        background:jackpot?'rgba(8,4,0,.36)':'rgba(3,1,12,.52)'}} />
      {!jackpot&&<Spotlight />}
      {particles&&<GoldParticles drift={!jackpot} />}
      <div style={{position:'relative',zIndex:5,display:'flex',flexDirection:'column',flex:1}}>
        {children}
      </div>
    </div>
  )
}

/* ─── ガチャ本体 ─── */
function Machine({ size=300, animate=false }: { size?:number; animate?:boolean }) {
  return (
    <img src={machineImg} alt="INMU GACHA Machine"
      className={animate?'ga-machinepulse':''}
      style={{width:size,height:'auto',display:'block',
        filter:'drop-shadow(0 16px 48px rgba(0,0,0,.95)) drop-shadow(0 0 22px rgba(184,134,11,.32))'}} />
  )
}

/* ─── カプセル ─── */
function Capsule({ size=80, style:extra={} }: { size?:number; style?:React.CSSProperties }) {
  return <img src={capsuleImg} alt="capsule" style={{width:size,height:size,objectFit:'contain',display:'block',...extra}} />
}

/* ─── 3Dベベルボタン ─── */
function Spin3DButton({ enabled, onClick, face, edge, rim, textCol, title, sub }:{
  enabled:boolean; onClick:()=>void; face:string; edge:string; rim:string; textCol:string; title:string; sub:string
}) {
  const [pressed, setPressed] = useState(false)
  const lift = enabled?(pressed?1:8):0
  return (
    <button type="button" onClick={onClick} disabled={!enabled}
      onPointerDown={()=>setPressed(true)} onPointerUp={()=>setPressed(false)}
      onPointerLeave={()=>setPressed(false)} onBlur={()=>setPressed(false)}
      style={{flex:1,position:'relative',border:'none',padding:0,borderRadius:18,
        cursor:enabled?'pointer':'not-allowed',background:enabled?edge:'#130e08',
        boxShadow:enabled?`0 ${lift+5}px ${lift+8}px rgba(0,0,0,.6),0 2px 0 rgba(255,255,255,.06)`:'none',
        transition:'box-shadow .07s ease',opacity:enabled?1:.38}}>
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        padding:'14px 0',borderRadius:18,
        background:enabled?face:'#1a1410',
        transform:`translateY(-${lift}px)`,transition:'transform .07s ease',
        border:`1.5px solid ${enabled?rim:'rgba(255,255,255,.07)'}`,
        boxShadow:enabled?`inset 0 2px 2px rgba(255,255,255,.58),inset 0 -5px 10px rgba(0,0,0,.45)`:'none',
        position:'relative',overflow:'hidden'}}>
        {enabled&&<div style={{position:'absolute',top:0,left:'6%',width:'88%',height:'38%',
          borderRadius:16,background:'linear-gradient(180deg,rgba(255,255,255,.55),transparent)',pointerEvents:'none'}} />}
        <div style={{display:'flex',alignItems:'center',gap:7,position:'relative',zIndex:2}}>
          <img src={coinImg} alt="" style={{width:22,height:22,borderRadius:'50%',objectFit:'cover',
            boxShadow:'0 1px 5px rgba(0,0,0,.55)',flexShrink:0}} />
          <span style={{fontWeight:900,fontSize:17,color:enabled?textCol:'rgba(255,255,255,.45)',
            textShadow:enabled?'0 1px 2px rgba(0,0,0,.5)':'none',letterSpacing:'0.02em'}}>{title}</span>
        </div>
        <span style={{fontSize:12,fontWeight:800,marginTop:3,position:'relative',zIndex:2,
          color:enabled?textCol:'rgba(255,255,255,.38)',opacity:.88,letterSpacing:'0.06em'}}>{sub}</span>
      </div>
    </button>
  )
}

/* ─── ジャックポット専用画面 ─── */
function JackpotScreen({ result, pts, onReset }: { result:Result; pts:number; onReset:()=>void }) {
  const [goldFlash, setGoldFlash] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [revealDone, setRevealDone] = useState(false)

  useEffect(()=>{
    playJackpotSE()
    setGoldFlash(true); setShaking(true)
    setTimeout(()=>setGoldFlash(false), 950)
    setTimeout(()=>setShaking(false), 580)
    setTimeout(()=>setRevealDone(true), 400)
  },[])

  return (
    <>
      {/* 金色フラッシュ */}
      {goldFlash&&<div style={{position:'fixed',inset:0,zIndex:9999,pointerEvents:'none',
        background:'radial-gradient(circle at 50% 40%,rgba(255,255,200,.98) 0%,rgba(218,165,32,.88) 38%,transparent 68%)',
        animation:'ga-goldflash .95s ease-out forwards'}} />}

      <div className={shaking?'ga-shake':''}>
        <PageBg jackpot particles>
          {/* 大量金色パーティクル */}
          <GoldParticles particles={JP_PARTICLES} />

          {/* 上昇INMUコイン */}
          <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:4,overflow:'hidden'}}>
            {COIN_FLIGHTS.map((c,i)=>(
              <div key={i} style={{position:'absolute',bottom:'-10%',left:c.x,
                animation:`ga-coinfly ${c.dur}s ease-in ${c.delay}s infinite`}}>
                <img src={coinImg} alt="" style={{width:c.sz,height:c.sz,borderRadius:'50%',
                  objectFit:'cover',border:'2px solid #daa520',
                  boxShadow:'0 0 14px rgba(218,165,32,.8)',opacity:.9}} />
              </div>
            ))}
          </div>

          {/* 拡大リング */}
          <div style={{position:'absolute',top:'38%',left:'50%',zIndex:3,pointerEvents:'none'}}>
            {[0,1,2,3,4].map(i=>(
              <div key={i} style={{position:'absolute',
                width:80+i*70,height:80+i*70,borderRadius:'50%',
                border:`${Math.max(.8,2-i*.3)}px solid rgba(218,165,32,${.55-i*.08})`,
                animation:`ga-ring 2s ease-out ${i*.4}s infinite`,zIndex:3}} />
            ))}
          </div>

          <div style={{position:'relative',zIndex:6,display:'flex',flexDirection:'column',
            alignItems:'center',padding:'28px 18px',gap:20,minHeight:'100dvh'}}>

            {/* JACKPOT!! タイトル */}
            <div style={{textAlign:'center',marginTop:8}}>
              <h1 style={{margin:0,fontSize:38,fontWeight:900,
                fontFamily:'Georgia,serif',letterSpacing:'0.12em',
                color:'#ffd700',
                animation:'ga-jppulse 1.4s ease-in-out infinite, ga-jpzoom .55s ease-out forwards',
                opacity:0}}>
                ◆ JACKPOT !! ◆
              </h1>
              <div style={{display:'flex',justifyContent:'center',gap:10,marginTop:6}}>
                {['✦','★','✦','★','✦'].map((s,i)=>(
                  <span key={i} style={{fontSize:20,color:'#ffd700',
                    animation:`ga-sparkle ${.7+i*.18}s ease-in-out ${i*.14}s infinite`}}>{s}</span>
                ))}
              </div>
            </div>

            {/* カプセル + 賞品 */}
            {revealDone&&(
              <div className="ga-reveal" style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                <div style={{position:'relative',width:180,height:180}}>
                  <div style={{position:'absolute',inset:-24,borderRadius:'50%',
                    background:'radial-gradient(circle,rgba(255,250,100,.52) 0%,rgba(218,165,32,.3) 42%,transparent 70%)',
                    animation:'ga-glow 1.1s ease-in-out infinite'}} />
                  <Capsule size={180} style={{position:'relative',zIndex:2,
                    filter:'drop-shadow(0 0 60px rgba(218,165,32,1)) drop-shadow(0 0 120px rgba(218,165,32,.6)) drop-shadow(0 8px 16px rgba(0,0,0,.8))'}} />
                  <div style={{position:'absolute',inset:0,zIndex:3,
                    display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:13,fontWeight:900,color:'#fff',
                      textShadow:'0 2px 8px rgba(0,0,0,1),0 0 24px rgba(218,165,32,.9)'}}>10,000</span>
                    <span style={{fontSize:10,fontWeight:900,color:'#fff',
                      textShadow:'0 2px 8px rgba(0,0,0,1)'}}>INMU</span>
                  </div>
                </div>

                {/* 当選テキスト */}
                <div style={{textAlign:'center',
                  background:'linear-gradient(135deg,rgba(28,14,2,.96),rgba(40,22,4,.96))',
                  border:'2px solid rgba(218,165,32,.7)',borderRadius:22,
                  padding:'16px 32px',backdropFilter:'blur(10px)',
                  boxShadow:'inset 0 1px 0 rgba(255,255,255,.12),inset 0 -2px 6px rgba(0,0,0,.5),0 0 40px rgba(218,165,32,.35)'}}>
                  <p style={{margin:0,fontWeight:900,fontSize:24,color:'#ffd700',
                    textShadow:'0 0 28px rgba(255,215,0,.95)',letterSpacing:'0.04em'}}>
                    🏆 おめでとうございます！
                  </p>
                  <p style={{margin:'8px 0 0',fontSize:13,color:'rgba(253,230,138,.8)',lineHeight:1.7}}>
                    10,000 INMU を獲得しました！<br/>報酬は後日運営より送金されます。
                  </p>
                </div>
              </div>
            )}

            {/* マスコット群（複数ジャンプ）*/}
            <div style={{display:'flex',gap:16,alignItems:'flex-end',justifyContent:'center',
              paddingTop:4,paddingBottom:4}}>
              {[{s:88,d:'0s'},{s:110,d:'.28s'},{s:88,d:'.56s'}].map((m,i)=>(
                <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                  <img src={mascotImg} alt="INMUくん" style={{
                    width:m.s,height:'auto',objectFit:'contain',
                    filter:'drop-shadow(-2px 8px 20px rgba(0,0,0,.75)) drop-shadow(0 0 18px rgba(218,165,32,.55))',
                    animation:`ga-mascotbounce .85s ease-in-out ${m.d} infinite`}} />
                </div>
              ))}
            </div>

            {/* ポイント表示 */}
            <div style={{
              background:'linear-gradient(135deg,rgba(18,10,2,.95),rgba(28,16,2,.95))',
              border:'1px solid rgba(184,134,11,.55)',borderRadius:14,
              padding:'10px 24px',display:'flex',alignItems:'center',gap:12,
              boxShadow:'inset 0 1px 0 rgba(255,255,255,.08),0 4px 16px rgba(0,0,0,.5)'}}>
              <img src={coinImg} alt="" style={{width:24,height:24,borderRadius:'50%',objectFit:'cover',
                border:'1.5px solid #daa520',boxShadow:'0 0 12px rgba(218,165,32,.5)'}} />
              <div>
                <p style={{margin:0,fontSize:9,color:'rgba(218,165,32,.7)',fontWeight:700,letterSpacing:'0.15em'}}>INMU POINT</p>
                <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                  <span style={{fontFamily:'monospace',fontWeight:900,fontSize:22,color:'#ffd700',
                    textShadow:'0 0 18px rgba(255,215,0,.6)'}}>{pts.toLocaleString()}</span>
                  <span style={{fontSize:12,color:'rgba(218,165,32,.75)',fontWeight:700}}>pt</span>
                </div>
              </div>
            </div>

            {/* 戻るボタン */}
            <button type="button" onClick={onReset}
              style={{background:'linear-gradient(160deg,#ffe680 0%,#d4a017 30%,#7a5500 100%)',
                border:'none',borderRadius:18,padding:'14px 48px',
                color:'#2a1800',fontWeight:900,fontSize:15,cursor:'pointer',letterSpacing:'0.06em',
                boxShadow:'0 8px 16px rgba(0,0,0,.55),inset 0 2px 2px rgba(255,255,255,.5)',
                marginBottom:24}}>
              ガチャ画面へ戻る
            </button>
          </div>
        </PageBg>
      </div>
    </>
  )
}

/* ═══════════════════════ メインページ ═══════════════════════ */
export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts, setPts]           = useState(0)
  const [ptsLoading, setLoading]= useState(true)
  const [phase, setPhase]       = useState<Phase>('idle')
  const [result, setResult]     = useState<Result|null>(null)
  const [revIdx, setRevIdx]     = useState(0)
  const [history, setHistory]   = useState<HistRow[]>([])
  const [histOpen, setHistOpen] = useState(false)
  const [goldFlash, setGoldFlash]= useState(false)
  const [shaking, setShaking]   = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null)

  const loadPts = useCallback(async()=>{
    try {
      const r=await fetch('/api/profile',{credentials:'include'})
      if(r.ok){const d=await r.json() as {monthlyPoints?:string|number}; setPts(Number(d.monthlyPoints??0))}
    } catch{/**/} finally{setLoading(false)}
  },[])
  useEffect(()=>{loadPts()},[loadPts])

  const loadHist = useCallback(async()=>{
    try {
      const r=await fetch('/api/gacha/history',{credentials:'include'})
      const d=await r.json() as HistRow[]
      setHistory(Array.isArray(d)?d:[])
    } catch{/**/}
  },[])
  useEffect(()=>{loadHist()},[loadHist])

  const clr=()=>{if(timer.current)clearTimeout(timer.current)}
  const after=(ms:number,next:Phase)=>{clr(); timer.current=setTimeout(()=>setPhase(next),ms)}
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
      const t=setTimeout(()=>setRevIdx(i=>i+1),160); return()=>clearTimeout(t)
    }
    return undefined
  },[phase,result,revIdx])

  /* 通常演出の場合のみフラッシュ（ジャックポットはJackpotScreenで処理）*/
  useEffect(()=>{
    if(phase==='opening'){setGoldFlash(true); setTimeout(()=>setGoldFlash(false),700)}
  },[phase])

  async function spin(type:'single'|'multi'){
    if(phase!=='idle') return
    const cost=type==='multi'?10000:1000
    if(pts<cost){toast.error(`ポイント不足 (必要: ${cost.toLocaleString()}pt)`); return}
    try{
      const res=await fetch('/api/gacha/spin',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({type})})
      if(!res.ok){const e=await res.json().catch(()=>({})) as {error?:string}; throw new Error(e.error??'エラー')}
      const r=await res.json() as Result
      setResult(r); setRevIdx(0); setPts(r.newPoints)
      setPhase(r.wasGuaranteed?'guaranteed':'inserting')
    } catch(e){toast.error(e instanceof Error?e.message:'エラーが発生しました')}
  }

  const reset=()=>{clr(); setPhase('idle'); setResult(null); setRevIdx(0); loadPts(); loadHist()}
  const isMulti=(result?.results.length??0)>1

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     ジャックポット専用画面（完全別演出）
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  if(phase==='done'&&result?.hasInmu){
    return (
      <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
        <style>{CSS}</style>
        <JackpotScreen result={result} pts={pts} onReset={reset} />
      </AppShell>
    )
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     画面1: IDLE — トップ（ガチャ本体）
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  if(phase==='idle') return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>
      <PageBg>
        <div style={{paddingBottom:'max(165px, calc(env(safe-area-inset-bottom) + 155px))'}}>

          {/* タイトル */}
          <div style={{textAlign:'center',paddingTop:18,paddingBottom:0}}>
            <h1 className="ga-pulse" style={{fontSize:30,fontWeight:900,color:'#daa520',
              fontFamily:'Georgia,serif',letterSpacing:'0.14em',margin:0,
              textShadow:'0 2px 22px rgba(218,165,32,.8)'}}>✦ INMU GACHA ✦</h1>
            <p style={{fontSize:11,color:'rgba(218,165,32,.55)',marginTop:4,letterSpacing:'0.1em',fontWeight:600}}>
              — PREMIUM CAPSULE MACHINE —
            </p>
          </div>

          {/* ─── マシン ＋ マスコット（全身立ち位置）─── */}
          <div style={{display:'flex',justifyContent:'center',alignItems:'flex-end',
            paddingTop:6,paddingBottom:4,position:'relative'}}>
            {/* マシン */}
            <div className="ga-float" style={{position:'relative',zIndex:2}}>
              <Machine size={288} animate />
              {/* 接地グロー */}
              <div style={{position:'absolute',bottom:-8,left:'50%',transform:'translateX(-50%)',
                width:220,height:28,borderRadius:'50%',
                background:'radial-gradient(ellipse,rgba(218,165,32,.45) 0%,transparent 70%)',
                filter:'blur(6px)'}} />
            </div>
            {/* マスコット全身（右横）*/}
            <div className="ga-floatslow" style={{position:'absolute',right:'calc(50% - 230px)',bottom:0,zIndex:3}}>
              <img src={mascotImg} alt="INMUくん"
                style={{width:96,height:'auto',objectFit:'contain',
                  filter:'drop-shadow(-3px 10px 22px rgba(0,0,0,.8)) drop-shadow(0 0 18px rgba(218,165,32,.45))'}} />
            </div>
          </div>

          {/* ─── 排出率 ─── */}
          <div style={{paddingLeft:14,paddingRight:14,paddingTop:14}}>
            <p style={{fontSize:10,color:'rgba(184,134,11,.9)',textAlign:'center',
              marginBottom:8,letterSpacing:'0.18em',fontWeight:700}}>★ 排出率 ★</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
              {BALLS.map(b=>(
                <div key={b.id} style={{
                  background:'linear-gradient(160deg,rgba(18,10,2,.92),rgba(8,4,18,.92))',
                  border:'1px solid rgba(184,134,11,.48)',
                  borderRadius:14,padding:'10px 4px',
                  display:'flex',flexDirection:'column',alignItems:'center',gap:5,
                  backdropFilter:'blur(8px)',
                  boxShadow:'inset 0 1px 0 rgba(255,255,255,.07),inset 0 -1px 4px rgba(0,0,0,.5),0 0 12px rgba(0,0,0,.4)'}}>
                  <img src={capsuleImg} alt="" style={{width:32,height:32,objectFit:'contain',
                    filter:`drop-shadow(0 0 10px ${b.glow}dd)`}} />
                  <div style={{textAlign:'center'}}>
                    {b.label.split(' ').map((l,i)=>(
                      <p key={i} style={{fontSize:9,color:'#e0d0b0',lineHeight:1.25,margin:0}}>{l}</p>
                    ))}
                    <p style={{fontSize:14,fontWeight:900,color:'#daa520',fontFamily:'monospace',margin:'3px 0 0'}}>{b.rate}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 履歴 ─── */}
          <div style={{paddingLeft:14,paddingRight:14,paddingTop:16}}>
            <button type="button"
              onClick={()=>{setHistOpen(o=>!o); if(!histOpen)loadHist()}}
              style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
                background:'linear-gradient(135deg,rgba(14,8,2,.88),rgba(8,4,18,.88))',
                border:'1px solid rgba(184,134,11,.42)',borderRadius:12,
                padding:'10px 14px',cursor:'pointer',backdropFilter:'blur(8px)',
                boxShadow:'inset 0 1px 0 rgba(255,255,255,.05)'}}>
              <span style={{fontSize:12,fontWeight:700,color:'rgba(184,134,11,.9)'}}>📜 ガチャ履歴</span>
              {histOpen?<ChevronDown size={14} color="rgba(184,134,11,.7)"/>:<ChevronRight size={14} color="rgba(184,134,11,.7)"/>}
            </button>
            {histOpen&&(
              <div style={{marginTop:4,borderRadius:12,overflow:'hidden',
                border:'1px solid rgba(184,134,11,.3)',
                background:'linear-gradient(180deg,rgba(10,5,2,.9),rgba(4,2,14,.9))',
                backdropFilter:'blur(8px)'}}>
                {history.length===0?(
                  <p style={{textAlign:'center',fontSize:12,color:'rgba(255,255,255,.35)',padding:'16px 0'}}>
                    ガチャ履歴がありません
                  </p>
                ):history.map((row,i)=>{
                  const label=row.hasInmu?'🏆 10,000 INMU 獲得！'
                    :row.totalPoints>0?`+${row.totalPoints.toLocaleString()} pt 獲得`
                    :`${row.costPoints.toLocaleString()}pt 消費`
                  const time=new Date(row.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})
                  return (
                    <div key={row.id} style={{display:'flex',alignItems:'center',padding:'9px 14px',
                      borderBottom:i<history.length-1?'1px solid rgba(184,134,11,.14)':'none'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                          <span style={{fontSize:10,fontWeight:700,color:row.pullType==='multi'?'#e07060':'#a09060'}}>
                            {row.pullType==='multi'?'10連':'1連'}
                          </span>
                          {row.wasGuaranteed&&(
                            <span style={{fontSize:8,padding:'1px 5px',borderRadius:3,
                              background:'rgba(218,165,32,.18)',color:'#daa520',border:'1px solid rgba(218,165,32,.45)'}}>✨確定</span>
                          )}
                        </div>
                        <p style={{fontSize:11,color:row.hasInmu?'#ffd700':'rgba(255,255,255,.7)',
                          margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</p>
                      </div>
                      <span style={{fontSize:10,color:'rgba(255,255,255,.35)',flexShrink:0,marginLeft:8}}>{time}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── 固定フッター（iPhone Safe Area対応）─── */}
        <div style={{position:'fixed',bottom:0,left:0,right:0,
          background:'linear-gradient(to top,rgba(3,1,12,.99) 80%,transparent)',
          backdropFilter:'blur(14px)',zIndex:50,
          padding:`10px 14px max(30px, calc(env(safe-area-inset-bottom) + 14px))`}}>

          {/* 保有ポイント プレミアムパネル */}
          <div style={{
            display:'flex',alignItems:'center',justifyContent:'space-between',
            background:'linear-gradient(135deg,rgba(22,14,2,.96),rgba(32,20,4,.96))',
            border:'1px solid rgba(184,134,11,.62)',borderRadius:14,
            padding:'10px 18px',marginBottom:10,
            boxShadow:'inset 0 1px 0 rgba(255,238,150,.16),inset 0 -2px 0 rgba(0,0,0,.5),0 4px 16px rgba(0,0,0,.55)'}}>
            <div style={{display:'flex',alignItems:'center',gap:9}}>
              <img src={coinImg} alt="" style={{width:28,height:28,borderRadius:'50%',objectFit:'cover',
                border:'1.5px solid #daa520',boxShadow:'0 0 14px rgba(218,165,32,.6)'}} />
              <div>
                <p style={{margin:0,fontSize:9,color:'rgba(218,165,32,.72)',fontWeight:700,letterSpacing:'0.16em'}}>INMU POINT</p>
                <p style={{margin:0,fontSize:10,color:'rgba(184,134,11,.62)'}}>保有ポイント</p>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'baseline',gap:5}}>
              <span style={{fontFamily:'monospace',fontWeight:900,fontSize:26,color:'#ffd700',
                textShadow:'0 0 22px rgba(255,215,0,.65),0 2px 4px rgba(0,0,0,.9)'}}>
                {ptsLoading?'---':pts.toLocaleString()}
              </span>
              <span style={{fontSize:14,color:'rgba(218,165,32,.78)',fontWeight:700}}>pt</span>
            </div>
          </div>

          {/* ガチャボタン */}
          <div style={{display:'flex',gap:12}}>
            <Spin3DButton enabled={pts>=1000&&!ptsLoading} onClick={()=>spin('single')}
              face={GOLD_BTN} edge={GOLD_BTN_DK} rim={GOLD_RIM} textCol="#2a1800"
              title="1連ガチャ" sub="1,000 pt" />
            <Spin3DButton enabled={pts>=10000&&!ptsLoading} onClick={()=>spin('multi')}
              face={RED_BTN} edge={RED_BTN_DK} rim={RED_RIM} textCol="#fff0f0"
              title="10連ガチャ" sub="10,000 pt" />
          </div>
        </div>
      </PageBg>
    </AppShell>
  )

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     画面2 + 通常結果
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const PHASE_LABEL: Partial<Record<Phase,string>> = {
    guaranteed: '✦ JACKPOT CHANCE ✦',
    inserting:  'INMUコイン投入中…',
    lever:      'ガチャ起動中…',
    space:      'カプセル排出中…',
    falling:    'カプセル落下中…',
    opening:    'カプセル開封中…',
    done:       '抽選結果',
  }

  return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>

      {/* カプセル開封フラッシュ */}
      {goldFlash&&<div style={{position:'fixed',inset:0,zIndex:9999,pointerEvents:'none',
        background:'radial-gradient(circle at 50% 42%,rgba(255,255,200,.88) 0%,rgba(218,165,32,.7) 36%,transparent 65%)',
        animation:'ga-goldflash .7s ease-out forwards'}} />}

      <div className={shaking?'ga-shake':''}>
        <PageBg jackpot={phase==='guaranteed'}>

          {/* ヘッダー */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px 8px'}}>
            <div>
              <h1 className="ga-pulse" style={{margin:0,fontSize:18,fontWeight:900,color:'#daa520',
                fontFamily:'Georgia,serif',letterSpacing:'0.1em',textShadow:'0 0 22px rgba(218,165,32,.75)'}}>
                ✦ INMU GACHA ✦
              </h1>
              <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.45)',marginTop:1}}>
                所持: <strong style={{color:'#ffd700'}}>{pts.toLocaleString()} pt</strong>
              </p>
            </div>
            {phase==='done'&&(
              <button type="button" onClick={reset}
                style={{display:'flex',alignItems:'center',gap:6,
                  background:'rgba(255,255,255,.07)',backdropFilter:'blur(8px)',
                  border:'1px solid rgba(218,165,32,.35)',borderRadius:12,
                  padding:'9px 15px',color:'#daa520',fontSize:12,cursor:'pointer',fontWeight:700,
                  boxShadow:'0 2px 8px rgba(0,0,0,.4)'}}>
                ガチャ画面へ戻る
              </button>
            )}
          </div>

          {/* フェーズラベル */}
          <div style={{textAlign:'center',marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:900,color:'#e8c060',letterSpacing:'0.1em',
              textShadow:'0 0 20px rgba(218,165,32,.7)',
              animation:'ga-glowtext 1.8s ease-in-out infinite'}}>
              {PHASE_LABEL[phase]??''}
            </span>
          </div>

          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
            justifyContent:'center',padding:'0 18px',gap:18}}>

            {/* ══ guaranteed ══ */}
            {phase==='guaranteed'&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20,width:'100%'}}>
                <div style={{position:'relative',width:'100%',height:240,
                  display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{position:'absolute',bottom:14,left:'50%',
                      width:90+i*80,height:90+i*80,borderRadius:'50%',
                      border:`1px solid rgba(218,165,32,${.3-i*.08})`,
                      background:'rgba(218,165,32,.03)',
                      animation:`ga-ring 2s ease-out ${i*.55}s infinite`}} />
                  ))}
                  {[{l:'18%'},{l:'34%'},{l:'52%'},{l:'67%'},{l:'7%'}].map((h,i)=>(
                    <div key={i} style={{position:'absolute',bottom:220,left:h.l,fontSize:24,
                      animation:`ga-hand 1.1s ease-out ${i*.28}s infinite`}}>👏</div>
                  ))}
                  {[
                    {w:100,pos:{bottom:0,left:'50%',transform:'translateX(-50%)',zIndex:10},delay:0},
                    {w:78, pos:{bottom:0,left:'12%',zIndex:8},delay:180},
                    {w:78, pos:{bottom:0,right:'12%',zIndex:8},delay:360},
                    {w:62, pos:{bottom:68,left:'24%',zIndex:7},delay:540},
                    {w:62, pos:{bottom:68,right:'24%',zIndex:7},delay:720},
                  ].map((m,i)=>(
                    <div key={i} style={{...m.pos as React.CSSProperties,position:'absolute',
                      width:m.w,height:m.w,borderRadius:'50%',overflow:'hidden',
                      border:'3px solid #daa520',boxShadow:`0 0 ${i===0?44:24}px rgba(218,165,32,${i===0?.95:.7})`,
                      animation:`ga-popin .44s ease-out ${m.delay}ms both, ga-clap .7s ease-in-out ${m.delay+500}ms infinite`}}>
                      <img src={mascotImg} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                    </div>
                  ))}
                </div>
                <div className="ga-glow" style={{background:'rgba(28,10,0,.9)',border:'2px solid #daa520',
                  borderRadius:22,padding:'14px 40px',textAlign:'center',backdropFilter:'blur(10px)'}}>
                  <p style={{margin:0,fontWeight:900,fontSize:22,color:'#ffd700',letterSpacing:'0.08em',
                    textShadow:'0 0 30px rgba(255,215,0,.9)'}}>🎊 INMU 確定！ 🎊</p>
                  <div style={{display:'flex',gap:9,justifyContent:'center',marginTop:9}}>
                    {['✦','✧','★','✧','✦'].map((s,i)=>(
                      <span key={i} style={{fontSize:18,color:'#ffd700',
                        animation:`ga-sparkle ${.5+i*.15}s ease-in-out ${i*.12}s infinite`}}>{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══ inserting ══ */}
            {phase==='inserting'&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                <div style={{position:'relative',height:300,width:280,
                  display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
                  <img src={coinImg} alt="" style={{
                    position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
                    width:80,height:80,borderRadius:'50%',objectFit:'cover',
                    border:'3px solid #daa520',
                    boxShadow:'0 0 40px rgba(218,165,32,.95),0 0 90px rgba(218,165,32,.45)',
                    animation:'ga-drop .95s ease-out forwards',zIndex:10}} />
                  {[0,1,2,3].map(i=>(
                    <div key={i} style={{position:'absolute',top:`${8+i*10}%`,left:'47%',
                      width:5,height:5,borderRadius:'50%',
                      background:'rgba(218,165,32,.8)',boxShadow:'0 0 7px rgba(218,165,32,.7)',
                      animation:`ga-particle ${.6+i*.1}s ease-in-out ${i*.12}s infinite`,zIndex:9}} />
                  ))}
                  <Machine size={210} />
                  {/* マスコット（小・横）*/}
                  <div style={{position:'absolute',right:-8,bottom:0}}>
                    <img src={mascotImg} alt="" style={{width:70,height:'auto',objectFit:'contain',
                      filter:'drop-shadow(-2px 6px 14px rgba(0,0,0,.8))',
                      animation:'ga-floatslow 2.8s ease-in-out infinite'}} />
                  </div>
                </div>
                <p style={{color:'rgba(218,165,32,.8)',fontSize:14,fontWeight:800,margin:0,
                  letterSpacing:'0.18em',animation:'ga-glowtext 1s ease-in-out infinite'}}>
                  INMUコイン投入中…
                </p>
              </div>
            )}

            {/* ══ lever ══ */}
            {phase==='lever'&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                <div style={{position:'relative',height:290,width:280,
                  display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <Machine size={210} animate />
                  {['10%','52%','90%'].map((l,i)=>(
                    <span key={i} style={{position:'absolute',top:'10%',left:l,fontSize:26,color:'#ffd700',
                      textShadow:'0 0 20px rgba(255,215,0,.95)',
                      animation:`ga-sparkle ${.55+i*.22}s ease-in-out ${i*.18}s infinite`}}>✦</span>
                  ))}
                  <div style={{position:'absolute',right:'4%',top:'26%',
                    display:'flex',flexDirection:'column',alignItems:'center'}}>
                    <div style={{width:30,height:60,borderRadius:15,
                      background:'linear-gradient(180deg,#ffe066,#b8860b)',
                      boxShadow:'0 0 26px rgba(218,165,32,.95),0 3px 8px rgba(0,0,0,.6)',
                      animation:'ga-lever .5s ease-in-out .1s forwards, ga-leverback .5s ease-in-out .65s forwards'}} />
                  </div>
                  <div style={{position:'absolute',bottom:14,left:'50%',transform:'translateX(-50%)',
                    width:150,height:24,borderRadius:'50%',
                    border:'2px solid rgba(218,165,32,.65)',boxShadow:'0 0 22px rgba(218,165,32,.55)',
                    animation:'ga-glow 1.1s ease-in-out infinite'}} />
                </div>
                <p style={{color:'rgba(218,165,32,.8)',fontSize:14,fontWeight:800,margin:0,
                  letterSpacing:'0.18em',animation:'ga-glowtext 1s ease-in-out infinite'}}>
                  ガチャ起動中…
                </p>
              </div>
            )}

            {/* ══ space ══ */}
            {phase==='space'&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,width:'100%'}}>
                <div style={{width:'100%',height:310,borderRadius:24,overflow:'hidden',
                  border:'1px solid rgba(184,134,11,.52)',position:'relative',
                  background:'rgba(3,1,18,.78)',backdropFilter:'blur(4px)',
                  boxShadow:'inset 0 2px 0 rgba(255,255,255,.04),0 0 30px rgba(0,0,0,.7)'}}>
                  {/* スポットライト */}
                  <div style={{position:'absolute',top:0,left:'26%',width:72,height:'100%',
                    background:'linear-gradient(180deg,rgba(255,225,80,.4) 0%,rgba(218,165,32,.12) 55%,transparent 90%)',
                    transform:'skewX(-10deg)',animation:'ga-spotlight 3.5s ease-in-out infinite'}} />
                  <div style={{position:'absolute',top:0,right:'20%',width:72,height:'100%',
                    background:'linear-gradient(180deg,rgba(255,225,80,.34) 0%,rgba(218,165,32,.1) 55%,transparent 90%)',
                    transform:'skewX(10deg)',animation:'ga-spotlight 3.5s ease-in-out 1.8s infinite'}} />
                  {/* 神殿リング */}
                  {[220,178,138].map((w,i)=>(
                    <div key={i} style={{position:'absolute',bottom:18-i*4,left:'50%',transform:'translateX(-50%)',
                      width:w,height:Math.round(w*.2),borderRadius:'50%',
                      border:`${2-i*.55}px solid rgba(218,165,32,${.7-i*.18})`,
                      boxShadow:`0 0 ${20-i*5}px rgba(218,165,32,${.45-i*.1})`}} />
                  ))}
                  <div style={{position:'absolute',bottom:0,left:'10%',width:'80%',height:44,
                    background:'radial-gradient(ellipse,rgba(218,165,32,.38) 0%,transparent 70%)',
                    filter:'blur(8px)'}} />
                  {/* 浮遊コイン */}
                  {[
                    {l:'7%',t:'16%',s:40,d:'0s',dur:'2.2s'},
                    {l:'74%',t:'24%',s:32,d:'.7s',dur:'2.8s'},
                    {l:'14%',t:'52%',s:26,d:'1.1s',dur:'3.2s'},
                    {l:'69%',t:'56%',s:21,d:'1.5s',dur:'2.6s'},
                  ].map((c,i)=>(
                    <div key={i} style={{position:'absolute',left:c.l,top:c.t,
                      animation:`ga-float ${c.dur} ease-in-out ${c.d} infinite`}}>
                      <img src={coinImg} alt="" style={{width:c.s,height:c.s,
                        borderRadius:'50%',objectFit:'cover',
                        border:`${i<2?2:1.5}px solid #daa520`,
                        boxShadow:`0 0 ${i<2?20:13}px rgba(218,165,32,${i<2?.8:.58})`}} />
                    </div>
                  ))}
                  <GoldParticles particles={SPACE_PARTICLES} />
                  <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
                    width:92,height:'100%',
                    background:'radial-gradient(ellipse at 50% 8%,rgba(255,215,50,.38) 0%,rgba(218,165,32,.12) 40%,transparent 66%)'}} />
                  {/* カプセル */}
                  <div style={{position:'absolute',bottom:52,left:'50%',transform:'translateX(-50%)',
                    animation:'ga-capsulefly .8s ease-out forwards',zIndex:10}}>
                    <Capsule size={88} style={{filter:'drop-shadow(0 0 40px rgba(218,165,32,.98)) drop-shadow(0 0 80px rgba(218,165,32,.55))'}} />
                  </div>
                  <p style={{position:'absolute',bottom:6,left:'50%',transform:'translateX(-50%)',
                    fontSize:11,fontWeight:900,letterSpacing:'0.3em',color:'#daa520',
                    textShadow:'0 0 16px rgba(255,215,0,.85)',whiteSpace:'nowrap',
                    animation:'ga-glowtext 1.4s ease-in-out infinite'}}>✦ INMU ✦</p>
                </div>
                <p style={{color:'rgba(218,165,32,.75)',fontSize:13,fontWeight:800,margin:0,
                  letterSpacing:'0.18em',animation:'ga-glowtext 1s ease-in-out infinite'}}>
                  カプセル排出中…
                </p>
              </div>
            )}

            {/* ══ falling ══ */}
            {phase==='falling'&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,width:'100%'}}>
                <div style={{width:'100%',height:310,borderRadius:24,overflow:'hidden',
                  border:'1px solid rgba(184,134,11,.42)',position:'relative',
                  background:'rgba(3,1,18,.78)',backdropFilter:'blur(4px)',
                  boxShadow:'inset 0 2px 0 rgba(255,255,255,.04),0 0 30px rgba(0,0,0,.7)'}}>
                  <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
                    width:84,height:'100%',
                    background:'radial-gradient(ellipse at 50% 5%,rgba(255,215,50,.3) 0%,rgba(218,165,32,.08) 40%,transparent 68%)'}} />
                  {TRAIL_DOTS.map((d,i)=>(
                    <div key={i} style={{position:'absolute',left:d.lx,top:d.top,zIndex:4,
                      width:d.sz,height:d.sz*2.2,borderRadius:d.sz,
                      background:'rgba(255,215,0,.88)',boxShadow:`0 0 ${d.sz*2.2}px rgba(218,165,32,.85)`,
                      animation:`ga-particle ${.55+i*.06}s ease-in-out ${i*.08}s infinite`}} />
                  ))}
                  <div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',
                    animation:'ga-capfall .95s ease-in forwards',zIndex:10}}>
                    <Capsule size={82} style={{
                      filter:'drop-shadow(0 0 28px rgba(218,165,32,.85)) drop-shadow(0 8px 12px rgba(0,0,0,.7))'}} />
                  </div>
                  <div style={{position:'absolute',bottom:14,left:'50%',transform:'translateX(-50%)',
                    width:120,height:22,borderRadius:'50%',
                    border:'2px solid rgba(218,165,32,.42)',boxShadow:'0 0 18px rgba(218,165,32,.38)'}} />
                </div>
                <p style={{color:'rgba(218,165,32,.75)',fontSize:13,fontWeight:800,margin:0,
                  letterSpacing:'0.18em',animation:'ga-glowtext 1s ease-in-out infinite'}}>
                  カプセル落下中…
                </p>
              </div>
            )}

            {/* ══ opening ══ */}
            {phase==='opening'&&(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:18}}>
                <div style={{position:'relative',height:210,width:210,
                  display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                  <div style={{position:'absolute',inset:-24,borderRadius:'50%',
                    background:'radial-gradient(circle,rgba(255,255,180,.92) 0%,rgba(218,165,32,.68) 34%,transparent 64%)',
                    animation:'ga-burst .68s ease-out .12s forwards',opacity:0,zIndex:0}} />
                  {[0,1,2].map(i=>(
                    <div key={i} style={{position:'absolute',
                      width:68+i*62,height:68+i*62,borderRadius:'50%',
                      border:`1px solid rgba(218,165,32,${.48-i*.13})`,
                      background:'rgba(218,165,32,.03)',
                      animation:`ga-ring ${.52+i*.28}s ease-out ${.18+i*.15}s forwards`,zIndex:1}} />
                  ))}
                  <div style={{position:'absolute',width:158,height:79,borderRadius:'50% 50% 0 0',overflow:'hidden',
                    top:14,transformOrigin:'bottom center',
                    animation:'ga-split-t .6s ease-out .14s forwards',
                    boxShadow:'0 -8px 30px rgba(218,165,32,.65)',zIndex:5}}>
                    <img src={capsuleImg} alt="" style={{width:158,height:158,objectFit:'cover',objectPosition:'center top'}} />
                  </div>
                  <div style={{position:'absolute',width:158,height:79,borderRadius:'0 0 50% 50%',overflow:'hidden',
                    top:115,transformOrigin:'top center',
                    animation:'ga-split-b .6s ease-out .14s forwards',zIndex:5}}>
                    <img src={capsuleImg} alt="" style={{width:158,height:158,objectFit:'cover',objectPosition:'center bottom',marginTop:-79}} />
                  </div>
                  {['0deg','45deg','90deg','135deg','180deg','225deg','270deg','315deg'].map((r,i)=>(
                    <div key={i} style={{position:'absolute',width:4,height:4,borderRadius:'50%',
                      background:'rgba(255,215,0,.95)',boxShadow:'0 0 9px rgba(218,165,32,.95)',
                      top:'50%',left:'50%',transformOrigin:'-44px 2px',
                      transform:`rotate(${r}) translateX(44px)`,
                      animation:`ga-sparkle .72s ease-out ${.15+i*.05}s both`,zIndex:6}} />
                  ))}
                </div>
                <p style={{color:'rgba(218,165,32,.78)',fontSize:14,fontWeight:800,margin:0,
                  letterSpacing:'0.2em',animation:'ga-glowtext 1s ease-in-out infinite'}}>
                  カプセル開封中…
                </p>
              </div>
            )}

            {/* ══ done : 通常1連 ══ */}
            {phase==='done'&&result&&!isMulti&&(
              <div className="ga-reveal" style={{
                display:'flex',flexDirection:'column',alignItems:'center',gap:18,width:'100%',maxWidth:320}}>
                {result.wasGuaranteed&&(
                  <p style={{fontSize:13,fontWeight:700,color:'#ffd700',margin:0,
                    animation:'ga-glowtext 1.5s ease-in-out infinite'}}>✨ 確定演出が発動しました！</p>
                )}
                {result.results.map((prize,i)=>{
                  const b=BALLS.find(x=>x.id===prize.prizeId)??BALLS[0]
                  return (
                    <div key={i} style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                      <div style={{position:'relative',width:164,height:164}}>
                        <img src={capsuleImg} alt="" style={{width:164,height:164,objectFit:'contain',position:'relative',zIndex:2,
                          filter:`drop-shadow(0 0 24px ${b.glow}) drop-shadow(0 6px 14px rgba(0,0,0,.7))`}} />
                        <div style={{position:'absolute',inset:0,zIndex:3,
                          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                          {prize.label.split(' ').map((l,j)=>(
                            <span key={j} style={{fontSize:22,fontWeight:900,color:'#fff',lineHeight:1.3,
                              textShadow:`0 2px 8px rgba(0,0,0,.95),0 0 20px ${b.glow}`}}>{l}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{width:'100%',
                        background:'linear-gradient(135deg,rgba(10,5,2,.9),rgba(6,3,18,.9))',
                        border:`1.5px solid ${b.glow}55`,borderRadius:18,
                        padding:'16px 20px',textAlign:'center',backdropFilter:'blur(10px)',
                        boxShadow:`inset 0 1px 0 rgba(255,255,255,.06),0 0 32px ${b.glow}1e`}}>
                        <p style={{margin:0,fontWeight:900,fontSize:22,color:'#e0d0b0',
                          textShadow:`0 0 18px ${b.glow}66`}}>{prize.label}</p>
                        <p style={{margin:'6px 0 0',fontSize:12,color:'rgba(255,255,255,.5)'}}>ポイントを即時付与しました</p>
                        <div style={{display:'flex',justifyContent:'center',marginTop:12}}>
                          <img src={mascotImg} alt="" style={{width:44,height:'auto',objectFit:'contain',
                            filter:'drop-shadow(0 4px 10px rgba(0,0,0,.7))',
                            animation:'ga-floatslow 3s ease-in-out infinite'}} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ══ done : 通常10連 ══ */}
            {phase==='done'&&result&&isMulti&&(
              <div className="ga-reveal" style={{
                display:'flex',flexDirection:'column',gap:14,width:'100%',maxWidth:340}}>
                {result.wasGuaranteed&&(
                  <p style={{fontSize:13,fontWeight:700,color:'#ffd700',textAlign:'center',margin:0,
                    animation:'ga-glowtext 1.5s ease-in-out infinite'}}>✨ 確定演出が発動しました！</p>
                )}
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
                  {result.results.map((prize,i)=>{
                    const b=BALLS.find(x=>x.id===prize.prizeId)??BALLS[0]
                    return (
                      <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                        opacity:i<revIdx?1:0,
                        animation:i<revIdx?'ga-card .32s ease-out forwards':'none'}}>
                        <div style={{position:'relative',width:60,height:60}}>
                          <img src={capsuleImg} alt="" style={{width:60,height:60,objectFit:'contain',position:'relative',zIndex:2,
                            filter:`drop-shadow(0 0 9px ${b.glow})`}} />
                          <div style={{position:'absolute',inset:0,zIndex:3,
                            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                            {PRIZE_LABEL[prize.prizeId]?.split('\n').map((l,j)=>(
                              <span key={j} style={{fontSize:j===0&&prize.prizeId==='inmu10k'?7:10,fontWeight:900,color:'#fff',lineHeight:1.2,
                                textShadow:`0 1px 4px rgba(0,0,0,.95),0 0 8px ${b.glow}`}}>{l}</span>
                            ))}
                          </div>
                        </div>
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
                <div style={{display:'flex',justifyContent:'center',marginTop:4}}>
                  <img src={mascotImg} alt="" style={{width:52,height:'auto',objectFit:'contain',
                    filter:'drop-shadow(0 4px 12px rgba(0,0,0,.7))',
                    animation:'ga-floatslow 3s ease-in-out infinite'}} />
                </div>
              </div>
            )}

          </div>
        </PageBg>
      </div>
    </AppShell>
  )
}
