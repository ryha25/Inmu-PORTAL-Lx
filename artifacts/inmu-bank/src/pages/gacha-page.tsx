import { useState, useEffect, useCallback, useRef } from 'react'
import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown, RefreshCw } from 'lucide-react'
import mascotImg  from '@assets/IMG_4397_1782097134955.jpeg'
import coinImg    from '@assets/IMG_6637_1782097134955.jpeg'
import machineImg from '@assets/generated_images/gacha-machine.png'
import bgImg      from '@assets/generated_images/gacha-bg.png'
import capsuleImg from '@assets/generated_images/gacha-capsule.png'
import jackpotBg  from '@assets/generated_images/gacha-jackpot-bg.png'

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

/* ─── デザイントークン（ボタン・テキスト用）─── */
const GOLD_BTN    = 'linear-gradient(180deg,#f0d472 0%,#cda02a 32%,#a87a12 60%,#6e4d06 100%)'
const GOLD_BTN_DK = '#4a3300'
const RED_BTN     = 'linear-gradient(180deg,#e85858 0%,#c01818 32%,#8a0a0a 62%,#4a0000 100%)'
const RED_BTN_DK  = '#3a0000'

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

/* ─── アニメーション CSS ─── */
const CSS = `
  @keyframes ga-float   { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-12px)} }
  @keyframes ga-star    { 0%,100%{opacity:.1;transform:scale(.7)} 50%{opacity:1;transform:scale(1.3)} }
  @keyframes ga-pulse   { 0%,100%{text-shadow:0 0 6px rgba(218,165,32,.2)} 50%{text-shadow:0 0 28px rgba(255,215,0,.9),0 0 56px rgba(218,165,32,.45)} }
  @keyframes ga-glow    { 0%,100%{box-shadow:0 0 14px 4px rgba(218,165,32,.45)} 50%{box-shadow:0 0 50px 20px rgba(218,165,32,.9)} }
  @keyframes ga-clap    { 0%,100%{transform:translateY(0)scale(1)} 35%{transform:translateY(-20px)scale(1.09)} 70%{transform:translateY(-8px)scale(1.03)} }
  @keyframes ga-popin   { 0%{transform:scale(0)rotate(-18deg);opacity:0} 65%{transform:scale(1.18)rotate(4deg);opacity:1} 100%{transform:scale(1)rotate(0);opacity:1} }
  @keyframes ga-hand    { 0%{transform:translateY(0);opacity:1} 100%{transform:translateY(-54px);opacity:0} }
  @keyframes ga-sparkle { 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1.4)} }
  @keyframes ga-ring    { 0%{transform:scale(1);opacity:.65} 100%{transform:scale(2.8);opacity:0} }
  @keyframes ga-drop    { 0%{transform:translateY(-110px)rotate(0);opacity:0} 70%{transform:translateY(6px)rotate(200deg);opacity:1} 100%{transform:translateY(0)rotate(360deg);opacity:1} }
  @keyframes ga-fly     { 0%{transform:translateY(60px)scale(.4);opacity:0} 55%{transform:translateY(-70px)scale(1.1);opacity:1} 100%{transform:translateY(-50px)scale(1);opacity:1} }
  @keyframes ga-fall    { 0%{transform:translateY(-60px)rotate(0);opacity:1} 100%{transform:translateY(220px)rotate(40deg);opacity:0} }
  @keyframes ga-split-t { to{transform:translateY(-60px)rotate(-18deg)} }
  @keyframes ga-split-b { to{transform:translateY(60px)rotate(18deg)} }
  @keyframes ga-reveal  { from{transform:scale(.6)translateY(20px);opacity:0} to{transform:scale(1)translateY(0);opacity:1} }
  @keyframes ga-card    { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes ga-bounce  { 0%,100%{transform:translateY(0)} 40%{transform:translateY(-24px)} 70%{transform:translateY(-10px)} }
  @keyframes ga-machinepulse { 0%,100%{filter:drop-shadow(0 8px 32px rgba(0,0,0,.85)) drop-shadow(0 0 20px rgba(184,134,11,.3))} 50%{filter:drop-shadow(0 8px 32px rgba(0,0,0,.85)) drop-shadow(0 0 44px rgba(218,165,32,.7))} }
  @keyframes ga-capsulefly { 0%{transform:translateY(80px)scale(.4) rotate(-10deg);opacity:0} 60%{transform:translateY(-60px)scale(1.08) rotate(5deg);opacity:1} 100%{transform:translateY(-44px)scale(1) rotate(0deg);opacity:1} }
  @keyframes ga-capsuleglow { 0%,100%{filter:drop-shadow(0 0 16px rgba(218,165,32,.5))} 50%{filter:drop-shadow(0 0 40px rgba(255,215,0,.95))} }
  .ga-float{animation:ga-float 2.8s ease-in-out infinite}
  .ga-pulse{animation:ga-pulse 2s ease-in-out infinite}
  .ga-glow{animation:ga-glow 1.3s ease-in-out infinite}
  .ga-reveal{animation:ga-reveal .4s ease-out forwards}
  .ga-machinepulse{animation:ga-machinepulse 2.5s ease-in-out infinite}
  .ga-capsuleglow{animation:ga-capsuleglow 1.8s ease-in-out infinite}
  @media (prefers-reduced-motion: reduce){
    .ga-float,.ga-pulse,.ga-glow,.ga-machinepulse,.ga-capsuleglow{animation:none!important}
  }
`

/* ─── 共通背景ラッパー ─── */
function PageBg({ children, jackpot=false }: { children:React.ReactNode; jackpot?:boolean }) {
  return (
    <div style={{
      minHeight:'100dvh',
      display:'flex',
      flexDirection:'column',
      backgroundImage: `url(${jackpot ? jackpotBg : bgImg})`,
      backgroundSize:'cover',
      backgroundPosition:'center top',
      backgroundAttachment:'fixed',
      position:'relative',
    }}>
      {/* 暗めのオーバーレイ（可読性確保）*/}
      <div style={{
        position:'absolute',inset:0,pointerEvents:'none',
        background: jackpot
          ? 'rgba(10,6,0,.45)'
          : 'rgba(4,2,14,.55)',
      }} />
      <div style={{position:'relative',zIndex:1,display:'flex',flexDirection:'column',flex:1}}>
        {children}
      </div>
    </div>
  )
}

/* ─── ガチャマシン画像コンポーネント ─── */
function Machine({ size=280, animate=false }: { size?:number; animate?:boolean }) {
  return (
    <img
      src={machineImg}
      alt="INMU GACHA Machine"
      className={animate ? 'ga-machinepulse' : ''}
      style={{
        width:size,
        height:'auto',
        display:'block',
        filter:'drop-shadow(0 12px 40px rgba(0,0,0,.9)) drop-shadow(0 0 20px rgba(184,134,11,.3))',
      }}
    />
  )
}

/* ─── カプセル画像コンポーネント ─── */
function Capsule({ size=80, style: extraStyle={} }: { size?:number; style?:React.CSSProperties }) {
  return (
    <img
      src={capsuleImg}
      alt="capsule"
      style={{
        width:size,
        height:size,
        objectFit:'contain',
        display:'block',
        ...extraStyle,
      }}
    />
  )
}

/* ─── 3Dベベルボタン ─── */
function Spin3DButton({ enabled, onClick, face, edge, rim, textCol, title, sub }:{
  enabled:boolean; onClick:()=>void; face:string; edge:string
  rim:string; textCol:string; title:string; sub:string
}) {
  const [pressed, setPressed] = useState(false)
  const lift = enabled ? (pressed ? 2 : 7) : 0
  return (
    <button
      type="button"
      onClick={onClick} disabled={!enabled}
      onPointerDown={()=>setPressed(true)}
      onPointerUp={()=>setPressed(false)}
      onPointerLeave={()=>setPressed(false)}
      onKeyDown={e=>{ if(e.key==='Enter'||e.key===' ') setPressed(true) }}
      onKeyUp={e=>{ if(e.key==='Enter'||e.key===' ') setPressed(false) }}
      onBlur={()=>setPressed(false)}
      style={{
        flex:1, position:'relative', border:'none', padding:0,
        borderRadius:16, cursor:enabled?'pointer':'not-allowed',
        background: enabled ? edge : '#15110a',
        boxShadow: enabled ? `0 ${lift+4}px ${lift+6}px rgba(0,0,0,.5)` : 'none',
        transition:'box-shadow .08s ease',
        opacity: enabled ? 1 : .4,
      }}>
      <div style={{
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        padding:'13px 0', borderRadius:16,
        background: enabled ? face : '#1a1510',
        transform:`translateY(-${lift}px)`,
        transition:'transform .08s ease',
        border:`1.5px solid ${enabled?rim:'rgba(255,255,255,.08)'}`,
        boxShadow: enabled ? `inset 0 2px 1px ${rim}, inset 0 -4px 8px rgba(0,0,0,.35)` : 'none',
        position:'relative', overflow:'hidden',
      }}>
        {enabled&&(
          <div style={{position:'absolute',top:0,left:'8%',width:'84%',height:'36%',
            borderRadius:14,pointerEvents:'none',
            background:'linear-gradient(180deg,rgba(255,255,255,.38),transparent)'}} />
        )}
        <div style={{display:'flex',alignItems:'center',gap:6,position:'relative',zIndex:2}}>
          <img src={coinImg} alt="" style={{width:20,height:20,borderRadius:'50%',objectFit:'cover',
            boxShadow:'0 1px 3px rgba(0,0,0,.5)'}} />
          <span style={{fontWeight:900,fontSize:16,color:enabled?textCol:'rgba(255,255,255,.5)',
            textShadow:enabled?'0 1px 1px rgba(255,255,255,.3)':'none'}}>{title}</span>
        </div>
        <span style={{fontSize:12,fontWeight:800,marginTop:2,position:'relative',zIndex:2,
          color:enabled?textCol:'rgba(255,255,255,.4)',opacity:.85}}>{sub}</span>
      </div>
    </button>
  )
}

/* ═══════════════════════ メインページ ═══════════════════════ */
export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts, setPts]           = useState(0)
  const [ptsLoading, setLoading] = useState(true)
  const [phase, setPhase]       = useState<Phase>('idle')
  const [result, setResult]     = useState<Result|null>(null)
  const [revIdx, setRevIdx]     = useState(0)
  const [history, setHistory]   = useState<HistRow[]>([])
  const [histOpen, setHistOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null)

  /* ── ポイント取得（useAuthにmonthlyPointsがないため直接fetch）── */
  const loadPts = useCallback(async () => {
    try {
      const r = await fetch('/api/profile', {credentials:'include'})
      if (r.ok) {
        const d = await r.json() as {monthlyPoints?:string|number}
        setPts(Number(d.monthlyPoints??0))
      }
    } catch {/**/} finally { setLoading(false) }
  }, [])
  useEffect(()=>{ loadPts() },[loadPts])

  const loadHist = useCallback(async()=>{
    try {
      const r = await fetch('/api/gacha/history',{credentials:'include'})
      const d = await r.json() as HistRow[]
      setHistory(Array.isArray(d)?d:[])
    } catch {/**/}
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
    return undefined
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

  /* ══════════════════════════════════════════════════════
     画面1: IDLE（トップ画面）
     ガチャ本体 + 排出率 + 保有ポイント + ボタン + 履歴
  ══════════════════════════════════════════════════════ */
  if (phase==='idle') return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>
      <PageBg>
        <div style={{paddingBottom:148}}>

          {/* タイトル */}
          <div style={{textAlign:'center',paddingTop:22,paddingBottom:4}}>
            <h1 className="ga-pulse" style={{
              fontSize:28,fontWeight:900,color:'#daa520',
              fontFamily:'Georgia,serif',letterSpacing:'0.12em',margin:0,
              textShadow:'0 2px 16px rgba(218,165,32,.7)',
            }}>✦ INMU GACHA ✦</h1>
            <p style={{fontSize:11,color:'rgba(255,255,255,.5)',marginTop:5}}>
              INMUコインを投入してガチャを引こう！
            </p>
          </div>

          {/* ── ガチャ本体画像（中央・大きく）── */}
          <div style={{display:'flex',justifyContent:'center',paddingTop:4,paddingBottom:8}}>
            <Machine size={272} animate />
          </div>

          {/* マスコットコメント */}
          <div style={{
            display:'flex',alignItems:'flex-end',gap:10,
            marginTop:4,paddingLeft:16,paddingRight:16,
          }}>
            <img src={mascotImg} alt="インムくん"
              style={{width:52,height:52,borderRadius:'50%',objectFit:'cover',flexShrink:0,
                border:'2px solid rgba(184,134,11,.65)',
                boxShadow:'0 0 14px rgba(184,134,11,.4)'}} />
            <div style={{
              background:'rgba(8,4,24,.88)',
              border:'1px solid rgba(184,134,11,.4)',
              borderRadius:'14px 14px 14px 0',
              padding:'8px 12px',flex:1,
            }}>
              <p style={{fontSize:11,color:'#f5deb3',lineHeight:1.6,margin:0}}>
                何が出るかな？<br/>ワクワクするね！
              </p>
            </div>
          </div>

          {/* ── 排出率カード ── */}
          <div style={{paddingLeft:14,paddingRight:14,paddingTop:20}}>
            <p style={{fontSize:10,color:'rgba(184,134,11,.8)',textAlign:'center',
              marginBottom:8,letterSpacing:'0.15em',fontWeight:700}}>★ 排出率 ★</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
              {BALLS.map(b=>(
                <div key={b.id} style={{
                  background:'rgba(10,6,2,.78)',
                  border:'1px solid rgba(184,134,11,.45)',
                  borderRadius:12,padding:'10px 4px',
                  display:'flex',flexDirection:'column',alignItems:'center',gap:5,
                  backdropFilter:'blur(4px)',
                }}>
                  {/* 小さなカプセル画像 */}
                  <img src={capsuleImg} alt="" style={{
                    width:28,height:28,objectFit:'contain',
                    filter:`drop-shadow(0 0 6px ${b.glow}99)`,
                  }} />
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
                background:'rgba(8,4,24,.78)',border:'1px solid rgba(184,134,11,.4)',
                borderRadius:10,padding:'10px 14px',cursor:'pointer',backdropFilter:'blur(4px)'}}>
              <span style={{fontSize:12,fontWeight:700,color:'rgba(184,134,11,.9)'}}>📜 ガチャ履歴</span>
              {histOpen
                ? <ChevronDown size={14} color="rgba(184,134,11,.7)" />
                : <ChevronRight size={14} color="rgba(184,134,11,.7)" />}
            </button>

            {histOpen && (
              <div style={{marginTop:4,borderRadius:10,overflow:'hidden',
                border:'1px solid rgba(184,134,11,.3)',background:'rgba(6,3,18,.78)',
                backdropFilter:'blur(6px)'}}>
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
          background:'linear-gradient(to top,rgba(4,2,14,.98) 82%,transparent)',
          backdropFilter:'blur(10px)',
          padding:'10px 14px 28px',
          zIndex:50,
        }}>
          {/* 保有ポイント */}
          <div style={{
            display:'flex',alignItems:'center',justifyContent:'space-between',
            background:'rgba(12,8,2,.88)',
            border:'1px solid rgba(184,134,11,.55)',
            borderRadius:12,padding:'8px 16px',marginBottom:10,
            backdropFilter:'blur(6px)',
          }}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <img src={coinImg} alt="" style={{width:24,height:24,borderRadius:'50%',objectFit:'cover',
                boxShadow:'0 0 10px rgba(218,165,32,.5)'}} />
              <span style={{fontSize:11,color:'#c8a060',fontWeight:600}}>保有ポイント</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <span style={{fontFamily:'monospace',fontWeight:900,fontSize:21,color:'#ffd700',
                textShadow:'0 0 16px rgba(255,215,0,.5)'}}>
                {ptsLoading ? '---' : pts.toLocaleString()}
              </span>
              <span style={{fontSize:13,color:'#c8a060',fontWeight:600}}> pt</span>
            </div>
          </div>
          {/* 1連 / 10連 ボタン */}
          <div style={{display:'flex',gap:12}}>
            <Spin3DButton
              enabled={pts>=1000&&!ptsLoading}
              onClick={()=>spin('single')}
              face={GOLD_BTN} edge={GOLD_BTN_DK}
              rim="rgba(255,238,170,.9)" textCol="#3a2600"
              title="1連ガチャ" sub="1,000 pt" />
            <Spin3DButton
              enabled={pts>=10000&&!ptsLoading}
              onClick={()=>spin('multi')}
              face={RED_BTN} edge={RED_BTN_DK}
              rim="rgba(255,200,200,.9)" textCol="#fff5f5"
              title="10連ガチャ" sub="10,000 pt" />
          </div>
        </div>
      </PageBg>
    </AppShell>
  )

  /* ══════════════════════════════════════════════════════
     画面2: 演出画面（投入 → レバー → 排出 → 落下 → 開封）
  ══════════════════════════════════════════════════════ */
  const stepLabel: Partial<Record<Phase,string>> = {
    guaranteed:'✦ INMU 確定！ ✦',
    inserting:'① コイン投入',
    lever:'② レバー回転',
    space:'③ カプセル排出',
    falling:'④ カプセル落下',
    opening:'カプセル開封！',
    done:'◆ 結果発表 ◆',
  }

  const isJackpotBg = phase==='guaranteed' || (phase==='done' && result?.hasInmu)

  return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>
      <PageBg jackpot={isJackpotBg}>

        {/* ── ヘッダー ── */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'16px 16px 10px'}}>
          <div>
            <h1 style={{margin:0,fontSize:17,fontWeight:900,color:'#daa520',fontFamily:'Georgia,serif'}}
              className="ga-pulse">✦ INMU GACHA ✦</h1>
            <p style={{margin:0,fontSize:11,color:'rgba(255,255,255,.5)',marginTop:2}}>
              所持: <strong style={{color:'#ffd700'}}>{pts.toLocaleString()} pt</strong>
            </p>
          </div>
          {phase==='done' && (
            <button type="button" onClick={reset}
              style={{display:'flex',alignItems:'center',gap:6,
                background:'rgba(255,255,255,.1)',backdropFilter:'blur(6px)',
                border:'1px solid rgba(255,255,255,.22)',borderRadius:10,padding:'8px 14px',
                color:'#fff',fontSize:12,cursor:'pointer'}}>
              <RefreshCw size={13} />もう一度
            </button>
          )}
        </div>

        {/* ステップ表示 */}
        <div style={{textAlign:'center',marginBottom:4}}>
          <span style={{fontSize:14,fontWeight:800,color:'#daa520',letterSpacing:'0.08em'}}>
            {stepLabel[phase] ?? ''}
          </span>
        </div>

        {/* ── 演出コンテンツエリア ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',
          justifyContent:'center',padding:'0 20px',gap:20}}>

          {/* ══ guaranteed：INMU確定演出（インムくん拍手）══ */}
          {phase==='guaranteed' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20,width:'100%'}}>
              <div style={{position:'relative',width:'100%',height:230,
                display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
                {/* リング */}
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:'absolute',bottom:20,left:'50%',
                    width:80+i*70,height:80+i*70,borderRadius:'50%',
                    transform:'translate(-50%,-50%)',
                    border:`1px solid rgba(218,165,32,${.28-i*.07})`,
                    animation:`ga-ring 1.9s ease-out ${i*.5}s infinite`,
                    background:'rgba(218,165,32,.03)'}} />
                ))}
                {/* 拍手絵文字 */}
                {[{l:'18%',d:'0s'},{l:'34%',d:'.28s'},{l:'52%',d:'.56s'},{l:'68%',d:'.84s'},{l:'8%',d:'1.1s'}].map((h,i)=>(
                  <div key={i} style={{position:'absolute',bottom:210,left:h.l,fontSize:22,
                    animation:`ga-hand 1.1s ease-out ${h.d} infinite`}}>👏</div>
                ))}
                {/* インムくん5枚 */}
                {[
                  { w:96, pos:{bottom:0,left:'50%',transform:'translateX(-50%)',zIndex:10}, delay:0   },
                  { w:76, pos:{bottom:0,left:14,zIndex:8}, delay:180 },
                  { w:76, pos:{bottom:0,right:14,zIndex:8}, delay:360 },
                  { w:60, pos:{bottom:64,left:30,zIndex:7}, delay:540 },
                  { w:60, pos:{bottom:64,right:30,zIndex:7}, delay:720 },
                ].map((m,i)=>(
                  <div key={i} style={{
                    ...m.pos as React.CSSProperties,
                    position:'absolute',
                    width:m.w,height:m.w,borderRadius:'50%',overflow:'hidden',
                    border:'3px solid #daa520',
                    boxShadow:`0 0 ${i===0?36:20}px rgba(218,165,32,${i===0?.9:.65})`,
                    animation:`ga-popin .44s ease-out ${m.delay}ms both, ga-clap .7s ease-in-out ${m.delay+500}ms infinite`,
                  }}>
                    <img src={mascotImg} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                  </div>
                ))}
              </div>
              <div style={{
                background:'rgba(30,12,0,.82)',border:'2px solid #daa520',
                borderRadius:20,padding:'14px 36px',textAlign:'center',
                backdropFilter:'blur(8px)',
              }} className="ga-glow">
                <p style={{margin:0,fontWeight:900,fontSize:21,color:'#ffd700',letterSpacing:'0.08em',
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

          {/* ══ inserting：コイン投入 ══ */}
          {phase==='inserting' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
              <div style={{position:'relative',height:260,width:240,
                display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
                {/* 落下するコイン */}
                <img src={coinImg} alt="" style={{
                  position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
                  width:72,height:72,borderRadius:'50%',objectFit:'cover',
                  border:'3px solid #daa520',
                  boxShadow:'0 0 28px rgba(218,165,32,.85)',
                  animation:'ga-drop .9s ease-out forwards',
                  zIndex:10,
                }} />
                {/* マシン */}
                <Machine size={190} />
              </div>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:13,margin:0}}
                className="animate-pulse">INMUコインを投入します</p>
            </div>
          )}

          {/* ══ lever：レバー回転 ══ */}
          {phase==='lever' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
              <div style={{position:'relative',height:260,width:240,
                display:'flex',alignItems:'center',justifyContent:'center'}}>
                {/* マシン（光らせる）*/}
                <Machine size={190} animate />
                {/* スパークル */}
                {['14%','50%','86%'].map((l,i)=>(
                  <span key={i} style={{position:'absolute',top:'12%',left:l,fontSize:22,color:'#ffd700',
                    animation:`ga-sparkle ${.6+i*.2}s ease-in-out ${i*.15}s infinite`}}>✦</span>
                ))}
                {/* 「ガチャ作動中」リング */}
                <div style={{position:'absolute',bottom:10,left:'50%',transform:'translateX(-50%)',
                  width:120,height:24,borderRadius:'50%',
                  border:'2px solid rgba(218,165,32,.5)',
                  boxShadow:'0 0 14px rgba(218,165,32,.4)',
                  animation:`ga-glow 1.2s ease-in-out infinite`}} />
              </div>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:13,margin:0}}
                className="animate-pulse">レバーを回すとガチャが動きます</p>
            </div>
          )}

          {/* ══ space：カプセル排出（宇宙演出）══ */}
          {phase==='space' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,width:'100%'}}>
              <div style={{
                width:'100%',height:270,borderRadius:20,overflow:'hidden',
                border:'1px solid rgba(184,134,11,.4)',
                position:'relative',
                display:'flex',alignItems:'center',justifyContent:'center',
                background:'rgba(4,2,18,.6)',backdropFilter:'blur(4px)',
              }}>
                {/* 光柱 */}
                <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',
                  width:110,height:'100%',
                  background:'radial-gradient(ellipse at 50% 0%,rgba(255,200,50,.38) 0%,rgba(140,60,255,.14) 40%,transparent 72%)'}} />
                {/* 台座 */}
                <div style={{position:'absolute',bottom:24,left:'50%',transform:'translateX(-50%)',
                  width:120,height:22,borderRadius:'50%',
                  border:'2px solid rgba(218,165,32,.55)',
                  boxShadow:'0 0 18px rgba(218,165,32,.4)'}} />
                {/* カプセル画像（飛び出す）*/}
                <div style={{
                  position:'absolute',bottom:46,left:'50%',transform:'translateX(-50%)',
                  animation:'ga-capsulefly .75s ease-out forwards',
                }}>
                  <Capsule size={72} style={{filter:'drop-shadow(0 0 24px rgba(218,165,32,.7))'}} />
                </div>
                {/* 浮遊する小さいカプセル */}
                {[
                  {l:'14%',t:'20%',s:26,d:'.1s'},{l:'72%',t:'16%',s:30,d:'.3s'},
                  {l:'78%',t:'56%',s:22,d:'.5s'},{l:'8%', t:'58%',s:22,d:'.7s'},
                ].map((b,i)=>(
                  <div key={i} style={{position:'absolute',left:b.l,top:b.t,
                    animation:`ga-float ${1.6+i*.3}s ease-in-out ${b.d} infinite`}}>
                    <Capsule size={b.s} style={{opacity:.7}} />
                  </div>
                ))}
                <p style={{position:'absolute',bottom:6,left:'50%',transform:'translateX(-50%)',
                  fontSize:10,fontWeight:900,letterSpacing:'0.25em',color:'#daa520',
                  textShadow:'0 0 10px rgba(255,215,0,.7)',whiteSpace:'nowrap'}}>INMU</p>
              </div>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:13,margin:0}}
                className="animate-pulse">神秘的な演出の中、カプセルが排出されます</p>
            </div>
          )}

          {/* ══ falling：カプセル落下 ══ */}
          {phase==='falling' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,width:'100%'}}>
              <div style={{
                width:'100%',height:270,borderRadius:20,overflow:'hidden',
                border:'1px solid rgba(184,134,11,.4)',
                position:'relative',
                display:'flex',alignItems:'flex-start',justifyContent:'center',
                background:'rgba(4,2,18,.6)',backdropFilter:'blur(4px)',
              }}>
                {/* カプセル落下 */}
                <div style={{marginTop:16,animation:'ga-fall .85s ease-in forwards'}}>
                  <Capsule size={72} style={{filter:'drop-shadow(0 4px 16px rgba(218,165,32,.6))'}} />
                </div>
                {/* 軌跡ドット */}
                {Array.from({length:5},(_,i)=>({op:.9-i*.15,s:5-i*.7})).map((p,i)=>(
                  <div key={i} style={{position:'absolute',top:`${16+i*13}%`,left:'49%',
                    width:p.s,height:p.s,borderRadius:'50%',
                    background:`rgba(218,165,32,${p.op})`}} />
                ))}
              </div>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:13,margin:0}}
                className="animate-pulse">カプセルが下へ落ちていきます</p>
            </div>
          )}

          {/* ══ opening：カプセル開封 ══ */}
          {phase==='opening' && (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20}}>
              <div style={{position:'relative',height:190,width:190,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                {/* カプセル上半分 */}
                <div style={{
                  position:'absolute',
                  width:150,height:75,borderRadius:'50% 50% 0 0',overflow:'hidden',
                  top:15,transformOrigin:'bottom center',
                  animation:'ga-split-t .55s ease-out .15s forwards',
                  boxShadow:'0 -4px 22px rgba(218,165,32,.55)',
                }}>
                  <img src={capsuleImg} alt="" style={{
                    width:150,height:150,objectFit:'cover',objectPosition:'center top',
                    marginTop:0,
                  }} />
                </div>
                {/* カプセル下半分 */}
                <div style={{
                  position:'absolute',
                  width:150,height:75,borderRadius:'0 0 50% 50%',overflow:'hidden',
                  top:90,transformOrigin:'top center',
                  animation:'ga-split-b .55s ease-out .15s forwards',
                }}>
                  <img src={capsuleImg} alt="" style={{
                    width:150,height:150,objectFit:'cover',objectPosition:'center bottom',
                    marginTop:-75,
                  }} />
                </div>
                {/* リングエフェクト */}
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:'absolute',
                    width:60+i*55,height:60+i*55,borderRadius:'50%',
                    background:'rgba(218,165,32,.04)',
                    border:`1px solid rgba(218,165,32,${.42-i*.12})`,
                    animation:`ga-ring ${.5+i*.28}s ease-out ${.2+i*.14}s forwards`}} />
                ))}
              </div>
              <p style={{color:'rgba(255,255,255,.65)',fontSize:14,margin:0,fontWeight:600}}
                className="animate-pulse">カプセルが開きます…</p>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              画面3: 結果発表
          ══════════════════════════════════════════════════ */}

          {/* ── 1連結果 ── */}
          {phase==='done' && result && !isMulti && (
            <div className="ga-reveal" style={{
              display:'flex',flexDirection:'column',alignItems:'center',gap:20,
              width:'100%',maxWidth:320,
            }}>
              {result.wasGuaranteed&&(
                <p style={{fontSize:13,fontWeight:700,color:'#ffd700',margin:0}}
                  className="animate-pulse">✨ 確定演出が発動しました！</p>
              )}
              {result.results.map((prize,i)=>{
                const b = BALLS.find(x=>x.id===prize.prizeId)??BALLS[0]
                const isInmu = prize.type==='inmu'
                return (
                  <div key={i} style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                    {/* カプセル + カラーオーバーレイ */}
                    <div style={{position:'relative',width:150,height:150}}>
                      <img src={capsuleImg} alt="" style={{
                        width:150,height:150,objectFit:'contain',
                        filter:`drop-shadow(0 0 ${isInmu?40:20}px ${b.glow})`,
                        animation: isInmu ? 'ga-capsuleglow 1.6s ease-in-out infinite' : undefined,
                      }} />
                      {/* 賞品ラベル（カプセル上に表示）*/}
                      <div style={{
                        position:'absolute',inset:0,
                        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                      }}>
                        {prize.label.split(' ').map((l,j)=>(
                          <span key={j} style={{
                            fontSize:isInmu?15:21,fontWeight:900,color:'#fff',
                            textShadow:`0 2px 8px rgba(0,0,0,.95),0 0 16px ${b.glow}`,
                            lineHeight:1.3,
                          }}>{l}</span>
                        ))}
                      </div>
                    </div>
                    {/* 結果テキスト */}
                    <div style={{
                      width:'100%',
                      background: isInmu ? 'rgba(30,12,0,.85)' : 'rgba(8,4,24,.82)',
                      border:`1.5px solid ${b.glow}66`,
                      borderRadius:16,padding:'16px 20px',textAlign:'center',
                      backdropFilter:'blur(8px)',
                    }}>
                      {isInmu ? (
                        <>
                          <p style={{margin:0,fontWeight:900,fontSize:20,color:'#ffd700',
                            textShadow:'0 0 22px rgba(255,215,0,.8)'}}>おめでとうございます！</p>
                          <p style={{margin:'6px 0 0',fontSize:12,color:'rgba(253,230,138,.75)',lineHeight:1.6}}>
                            10,000 INMU を獲得しました！<br/>報酬は後日運営より送金されます。
                          </p>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:18,marginTop:12}}>
                            <span style={{fontSize:26,animation:'ga-sparkle 1s ease-in-out infinite'}}>✨</span>
                            <img src={mascotImg} alt="" style={{width:38,height:38,borderRadius:'50%',
                              objectFit:'cover',border:'1.5px solid #daa520',
                              animation:'ga-bounce 1s ease-in-out infinite'}} />
                            <span style={{fontSize:26,animation:'ga-sparkle 1.2s ease-in-out .2s infinite'}}>🎊</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <p style={{margin:0,fontWeight:900,fontSize:22,color:'#e0d0b0'}}>{prize.label}</p>
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

          {/* ── 10連結果グリッド ── */}
          {phase==='done' && result && isMulti && (
            <div className="ga-reveal" style={{
              display:'flex',flexDirection:'column',gap:16,width:'100%',maxWidth:340,
            }}>
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
                      {/* 小カプセル + カラードット */}
                      <div style={{position:'relative',width:56,height:56}}>
                        <img src={capsuleImg} alt="" style={{
                          width:56,height:56,objectFit:'contain',
                          filter:`drop-shadow(0 0 ${isInmu?16:8}px ${b.glow})`,
                          animation: isInmu ? 'ga-capsuleglow 1.6s ease-in-out infinite' : undefined,
                        }} />
                        <div style={{
                          position:'absolute',inset:0,
                          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                        }}>
                          {PRIZE_LABEL[prize.prizeId]?.split('\n').map((l,j)=>(
                            <span key={j} style={{
                              fontSize:isInmu?7:10,fontWeight:900,color:'#fff',lineHeight:1.2,
                              textShadow:`0 1px 4px rgba(0,0,0,.95),0 0 8px ${b.glow}`,
                            }}>{l}</span>
                          ))}
                        </div>
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
                <div className="ga-glow" style={{
                  borderRadius:16,padding:'14px 20px',textAlign:'center',
                  background:'rgba(30,12,0,.85)',border:'2px solid #daa520',
                  backdropFilter:'blur(8px)',
                }}>
                  <p style={{margin:0,fontWeight:900,fontSize:17,color:'#ffd700'}}>🏆 10,000 INMU 当選！</p>
                  <p style={{margin:'5px 0 0',fontSize:12,color:'rgba(253,230,138,.8)',lineHeight:1.6}}>
                    おめでとうございます！<br/>報酬は後日運営より送金されます。
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </PageBg>
    </AppShell>
  )
}
