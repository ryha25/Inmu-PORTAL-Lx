import { useState, useEffect, useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import { AppShell } from '@/components/app-shell'
import { AdSlot } from '@/components/ad-slot'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { ChevronRight, LockKeyhole, WalletCards } from 'lucide-react'
import {
  fetchConnectedPhantomInmuBalance,
  fetchInmuBalanceForWallet,
  fetchMyInmuBalance,
  getPhantomProvider,
  isMobileBrowser,
  openInPhantomBrowser,
  sendInmuWithPhantom,
} from '@/lib/admin-inmu-transfer'
import { PET_BY_ID, type PetId } from '@/features/pet/pet-data'

import machineImg  from '@assets/generated_images/gacha-machine-v2.png'
import mascotImg   from '@assets/generated_images/mascot-v2-nobg.png'
import coinImg     from '@assets/IMG_6637_1782097134955.jpeg'
import bgImg       from '@assets/generated_images/gacha-bg.png'
import jackpotBg   from '@assets/generated_images/gacha-jackpot-bg.png'
import normalBannerImg from '@assets/gacha-banners/normal-main.jpg'
import takuyaBannerImg from '@assets/gacha-banners/takuya.jpg'
import nyarushianBannerImg from '@assets/gacha-banners/nyarushian.jpg'
import leonBannerImg from '@assets/gacha-banners/leon.jpg'
import paidBannerImg from '@assets/gacha-banners/paid-main.jpg'
import eventPointsBannerImg from '@assets/gacha-banners/20260717-points-main.jpg'
import eventInmuBannerImg from '@assets/gacha-banners/20260717-inmu-main.jpg'
import eventChingeBannerImg from '@assets/gacha-banners/20260717-chinge.jpg'
import eventTdnBannerImg from '@assets/gacha-banners/20260717-tdn.jpg'
import eventWhipBannerImg from '@assets/gacha-banners/20260717-whip.jpg'

/* ─── types ─── */
type Phase = 'idle'|'guaranteed'|'inserting'|'lever'|'space'|'falling'|'opening'|'done'
type Prize = {
  prizeId:string; label:string; type:'points'|'inmu'|'premium_food'|'sleep_tea'|'character'; amount:number
  characterId?:PetId; isNewCharacter?:boolean; isDuplicate?:boolean; convertedPoints?:number; baseAmount?:number
}
type TdnReroll = { token:string; mode:'points'|'paid'; pullType:'single'|'multi'|'eleven'; expiresAt:string }
type Result = { results:Prize[]; totalPoints:number; hasInmu:boolean; wasGuaranteed:boolean; costPoints:number; costInmu?:number; newPoints:number; txId?:string; paidPity?:number|null; pointMultiplier?:number; tdnReroll?:TdnReroll|null }
type HistRow = { id:number; pullType:string; isFree:boolean; results:Prize[]; totalPoints:number; hasInmu:boolean; inmuSentStatus:string; txHash:string|null; wasGuaranteed:boolean; costPoints:number; createdAt:string }
type CommerceHistRow = { id:number; gachaType:'points'|'paid'; pullType:string; costPoints:number; costInmu:number; txId:string|null; results:Prize[]; createdAt:string }
type GachaRateRow = { id:string; label:string; rate:string }
type GachaRuntimeConfig = {
  active:boolean
  name:string
  startsAt:string
  endsAt:string|null
  serverTime:string
  modes:Record<'points'|'paid',{ banners:string[]; rates:GachaRateRow[] }>
}

/* ─── capsule color configs (image 5 reference) ─── */
const CAPSULE: Record<string,{top:string;bot:string;glow:string;border:string;label:string}> = {
  pts100: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(255,255,255,.98) 0%, rgba(210,216,222,.95) 30%, rgba(75,80,88,.86) 58%, rgba(10,11,14,.90) 82%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(235,240,246,.95) 0%, rgba(130,138,150,.86) 36%, rgba(22,24,30,.90) 76%)',
    glow:'rgba(210,220,235,.62)', border:'rgba(235,242,250,.78)', label:'100pt',
  },
  pts300: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(255,205,240,.98) 0%, rgba(240,72,178,.92) 42%, rgba(142,16,104,.72) 74%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(255,152,222,.94) 0%, rgba(214,40,154,.88) 42%, rgba(106,10,84,.66) 74%)',
    glow:'rgba(255,88,196,.64)', border:'rgba(255,150,224,.58)', label:'300pt',
  },
  pts500: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(238,255,166,.98) 0%, rgba(143,224,32,.92) 42%, rgba(62,132,14,.72) 74%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(210,255,108,.94) 0%, rgba(116,196,24,.88) 42%, rgba(43,108,10,.66) 74%)',
    glow:'rgba(166,255,58,.64)', border:'rgba(210,255,112,.58)', label:'500pt',
  },
  pts1000: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(135,192,255,.98) 0%, rgba(25,85,218,.93) 42%, rgba(6,35,165,.68) 72%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(85,150,248,.93) 0%, rgba(16,65,202,.88) 42%, rgba(4,25,148,.62) 72%)',
    glow:'rgba(45,118,255,.65)', border:'rgba(75,145,255,.55)', label:'1,000pt',
  },
  pts3000: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(255,183,132,.98) 0%, rgba(231,78,38,.9) 42%, rgba(125,18,24,.70) 74%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(255,132,92,.93) 0%, rgba(196,44,36,.86) 42%, rgba(96,8,22,.64) 74%)',
    glow:'rgba(255,92,58,.64)', border:'rgba(255,146,92,.57)', label:'3,000pt',
  },
  pts5000: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(212,85,255,.98) 0%, rgba(145,18,228,.9) 42%, rgba(86,2,188,.67) 72%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(188,58,248,.93) 0%, rgba(125,8,212,.86) 42%, rgba(66,0,172,.6) 72%)',
    glow:'rgba(162,55,255,.68)', border:'rgba(182,78,255,.58)', label:'5,000pt',
  },
  pts10000: {
    top:'radial-gradient(ellipse at 33% 28%,rgba(255,248,174,.99),rgba(255,179,20,.94) 42%,rgba(151,65,0,.78) 76%)',
    bot:'radial-gradient(ellipse at 67% 72%,rgba(255,224,102,.96),rgba(232,124,8,.9) 44%,rgba(105,36,0,.76) 78%)',
    glow:'rgba(255,190,35,.82)', border:'rgba(255,225,125,.82)', label:'10,000pt',
  },
  inmu10k: {
    top:'radial-gradient(ellipse at 33% 28%, rgba(255,250,130,.99) 0%, rgba(238,180,15,.93) 38%, rgba(185,125,5,.72) 70%)',
    bot:'radial-gradient(ellipse at 67% 72%, rgba(248,215,78,.95) 0%, rgba(218,155,8,.9) 38%, rgba(165,105,0,.67) 70%)',
    glow:'rgba(255,215,0,.85)', border:'rgba(255,215,0,.65)', label:'10,000\nINMU',
  },
  'premium-food': {
    top:'radial-gradient(ellipse at 33% 28%,rgba(255,248,194,.99),rgba(231,161,42,.94) 42%,rgba(112,52,8,.82) 78%)',
    bot:'radial-gradient(ellipse at 67% 72%,rgba(255,222,112,.96),rgba(198,112,18,.9) 44%,rgba(83,31,4,.8) 78%)',
    glow:'rgba(255,184,54,.78)', border:'rgba(255,222,132,.75)', label:'高級ごはん',
  },
  'sleep-tea': {
    top:'radial-gradient(ellipse at 33% 28%,rgba(210,250,255,.99),rgba(55,184,220,.94) 42%,rgba(7,74,126,.82) 78%)',
    bot:'radial-gradient(ellipse at 67% 72%,rgba(150,238,255,.96),rgba(22,139,190,.9) 44%,rgba(4,45,92,.8) 78%)',
    glow:'rgba(65,210,255,.82)', border:'rgba(160,240,255,.8)', label:'アイスティー',
  },
  'character-nyarushian': {
    top:'linear-gradient(135deg,#ff5fa2,#ffdd4a 22%,#6dff9f 43%,#58c7ff 64%,#a66bff 82%,#ff70ce)',
    bot:'linear-gradient(315deg,#ff5fa2,#ffdd4a 22%,#6dff9f 43%,#58c7ff 64%,#a66bff 82%,#ff70ce)',
    glow:'rgba(188,116,255,.95)', border:'rgba(255,255,255,.92)', label:'ニャルシアン',
  },
  'character-takuya': {
    top:'linear-gradient(135deg,#ff5fa2,#ffdd4a 22%,#6dff9f 43%,#58c7ff 64%,#a66bff 82%,#ff70ce)',
    bot:'linear-gradient(315deg,#ff5fa2,#ffdd4a 22%,#6dff9f 43%,#58c7ff 64%,#a66bff 82%,#ff70ce)',
    glow:'rgba(188,116,255,.95)', border:'rgba(255,255,255,.92)', label:'拓也',
  },
  'character-leon': {
    top:'linear-gradient(135deg,#ff5fa2,#ffdd4a 22%,#6dff9f 43%,#58c7ff 64%,#a66bff 82%,#ff70ce)',
    bot:'linear-gradient(315deg,#ff5fa2,#ffdd4a 22%,#6dff9f 43%,#58c7ff 64%,#a66bff 82%,#ff70ce)',
    glow:'rgba(188,116,255,.95)', border:'rgba(255,255,255,.92)', label:'レオン',
  },
}

const BALLS = [
  { id:'pts100',  label:'100pt',       rate:'50.00%', color:'rgba(255,236,180,.9)'  },
  { id:'pts300',  label:'300pt',       rate:'30.00%', color:'rgba(255,88,196,.9)'  },
  { id:'pts500',  label:'500pt',       rate:'5.00%', color:'rgba(166,255,58,.9)'  },
  { id:'pts1000', label:'1,000pt',     rate:'3.00%', color:'rgba(70,140,255,.9)'  },
  { id:'pts5000', label:'5,000pt',     rate:'1.17%', color:'rgba(180,60,255,.9)'  },
  { id:'inmu10k', label:'10,000 INMU', rate:'1.79%',  color:'rgba(255,215,0,.9)'   },
  { id:'premium-food', label:'高級ごはん', rate:'4.49%', color:'rgba(255,184,54,.9)' },
  { id:'sleep-tea', label:'アイスティー（睡眠薬入り）', rate:'3.65%', color:'rgba(65,210,255,.9)' },
  { id:'character-nyarushian', label:'ニャルシアン', rate:'0.30%', color:'rgba(255,215,0,.9)' },
  { id:'character-takuya', label:'拓也', rate:'0.30%', color:'rgba(255,215,0,.9)' },
  { id:'character-leon', label:'レオン', rate:'0.30%', color:'rgba(255,215,0,.9)' },
]
const PAID_BALLS = [
  { id:'pts1000', label:'1,000pt', rate:'60%' },
  { id:'pts3000', label:'3,000pt', rate:'20%' },
  { id:'pts5000', label:'5,000pt', rate:'7%' },
  { id:'pts10000', label:'10,000pt', rate:'2%' },
  { id:'premium-food', label:'高級ごはん', rate:'4%' },
  { id:'sleep-tea', label:'アイスティー（睡眠薬入り）', rate:'3.4%' },
  { id:'character-nyarushian', label:'ニャルシアン', rate:'1.2%' },
  { id:'character-takuya', label:'拓也', rate:'1.2%' },
  { id:'character-leon', label:'レオン', rate:'1.2%' },
]
const ORBIT_POSITIONS = [
  { left:'13%', top:'69%' },
  { left:'76%', top:'34%' },
  { left:'82%', top:'69%' },
  { left:'18%', top:'34%' },
  { left:'62%', top:'20%' },
  { left:'48%', top:'76%' },
] as const
const PHASE_MS: Partial<Record<Phase,number>> = {
  guaranteed:2600, inserting:1600, lever:1800, space:2300, falling:2200, opening:1800,
}
const PAID_GACHA_PITY_PULLS = 30
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
  @keyframes ga-coininsert-full{0%{top:-22%;left:50%;transform:translateX(-50%) rotate(-24deg) scale(1.08);opacity:0}18%{opacity:1}72%{top:55%;left:50%;transform:translateX(-50%) rotate(360deg) scale(.72);opacity:1}92%{top:71%;left:50%;transform:translateX(-50%) rotate(510deg) scale(.42);opacity:.92}100%{top:74%;left:50%;transform:translateX(-50%) rotate(560deg) scale(.18);opacity:0}}
  @keyframes ga-leverrot2   {0%{transform:rotate(-8deg)}100%{transform:rotate(58deg)}}
  @keyframes ga-forelever    {0%{transform:rotate(-34deg)}18%{transform:rotate(-34deg)}68%{transform:rotate(42deg)}82%{transform:rotate(36deg)}100%{transform:rotate(44deg)}}
  @keyframes ga-orbit       {from{transform:rotate(0deg) translateX(60px) rotate(0deg)}to{transform:rotate(360deg) translateX(60px) rotate(-360deg)}}
  @keyframes ga-shockwave   {0%{transform:translateX(-50%) scale(.12);opacity:.88}100%{transform:translateX(-50%) scale(3.4);opacity:0}}
  @keyframes ga-capland     {0%{top:-120px}72%{top:188px}83%{top:174px}91%{top:186px}100%{top:181px}}
  @keyframes ga-capportal    {0%{transform:translate(-50%,-50%) scale(.35) rotate(-18deg);opacity:0;filter:blur(5px)}22%{opacity:1;filter:blur(0)}68%{transform:translate(-50%,-50%) scale(1.12) rotate(14deg);opacity:1}100%{transform:translate(-50%,-50%) scale(.82) rotate(26deg);opacity:.82}}
  @keyframes ga-capdropfull  {0%{top:-22%;transform:translateX(-50%) scale(.72) rotate(-20deg);opacity:0}18%{opacity:1}72%{top:48%;transform:translateX(-50%) scale(1.18) rotate(18deg);opacity:1}88%{top:44%;transform:translateX(-50%) scale(1.05) rotate(10deg)}100%{top:48%;transform:translateX(-50%) scale(1.1) rotate(14deg)}}
  @keyframes ga-capopenfore  {0%{transform:translate(-50%,-50%) scale(.7);opacity:0}18%{opacity:1}52%{transform:translate(-50%,-50%) scale(1.08)}100%{transform:translate(-50%,-50%) scale(1.2)}}
  @keyframes ga-premiumclosed{0%,48%{opacity:1;transform:scale(1) rotate(-4deg);filter:brightness(1.05)}70%,100%{opacity:0;transform:scale(.72) rotate(14deg);filter:brightness(2.2) blur(2px)}}
  @keyframes ga-premiumopen  {0%,42%{opacity:0;transform:translateY(18px) scale(.82);filter:brightness(2) blur(4px)}66%{opacity:1;transform:translateY(0) scale(1.12);filter:brightness(1.35) blur(0)}100%{opacity:1;transform:translateY(0) scale(1);filter:brightness(1)}}
  @keyframes ga-resultflare  {0%{opacity:0;transform:scale(.2)}42%{opacity:.95;transform:scale(1.15)}100%{opacity:0;transform:scale(2.4)}}
  @keyframes ga-capglint    {0%{transform:translateX(-130%) rotate(-18deg);opacity:0}28%{opacity:.9}100%{transform:translateX(155%) rotate(-18deg);opacity:0}}
  @keyframes ga-rayfall     {0%{transform:translateY(-38px);opacity:0}28%,72%{opacity:.78}100%{transform:translateY(42px);opacity:0}}
  @keyframes ga-vortex      {from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}
  @keyframes ga-goldrain    {0%{transform:translateY(-70px);opacity:0}18%{opacity:.9}82%{opacity:.75}100%{transform:translateY(105px);opacity:0}}
  @keyframes ga-stageflash  {0%,100%{opacity:.28;transform:scale(.96)}50%{opacity:.86;transform:scale(1.04)}}
  @keyframes ga-cutken      {0%{transform:scale(1.08) translate3d(0,0,0);filter:saturate(1.05) contrast(1.04)}100%{transform:scale(1.18) translate3d(var(--ga-pan-x,0),var(--ga-pan-y,0),0);filter:saturate(1.18) contrast(1.1)}}
  @keyframes ga-cutfade     {0%{opacity:0}12%{opacity:1}86%{opacity:1}100%{opacity:.92}}
  @keyframes ga-cutbeam     {0%{opacity:.15;transform:translateX(-50%) scaleY(.78)}44%{opacity:.72;transform:translateX(-50%) scaleY(1.08)}100%{opacity:.28;transform:translateX(-50%) scaleY(.96)}}
  @keyframes ga-cutsweep    {0%{transform:translateX(-140%) rotate(14deg);opacity:0}26%{opacity:.45}64%{opacity:.16}100%{transform:translateX(160%) rotate(14deg);opacity:0}}
  @keyframes ga-cutstar     {0%{opacity:0;transform:translateY(24px) scale(.55)}34%,72%{opacity:1}100%{opacity:0;transform:translateY(-42px) scale(1.18)}}
  .ga-pulse{animation:ga-pulse 2.2s ease-in-out infinite}
  .ga-floatslow{animation:ga-floatslow 3.4s ease-in-out infinite}
  .ga-reveal{animation:ga-reveal .42s ease-out forwards}
  .ga-machinepulse{animation:ga-machinepulse 2.6s ease-in-out infinite}
  .ga-shake{animation:ga-shake .55s ease-out}
`

/* 笊絶武笊絶武 Background 笊絶武笊絶武 */
function PageBg({ children, jackpot=false }:{children:React.ReactNode;jackpot?:boolean}) {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',
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

function GeneratedScene({ kind, guaranteed=false, zIndex=30, prizeId='pts300' }:{
  kind:'lever'|'space'|'falling'|'opening'; guaranteed?:boolean; zIndex?:number; prizeId?:string
}) {
  const stars = Array.from({length:kind==='lever'?22:44},(_,i)=>({
    left:`${(i*37.3+9)%92}%`,
    top:`${(i*53.7+7)%88}%`,
    size:1+(i%5)*.7,
    delay:i*.09,
  }))
  const rays = Array.from({length:kind==='space'?26:20},(_,i)=>({
    left:`${6+(i*17)%88}%`,
    height:44+(i%5)*28,
    delay:i*.07,
    dur:1.15+(i%6)*.12,
  }))
  const isCosmic = kind !== 'lever'

  return (
    <div style={{position:'absolute',inset:0,zIndex,pointerEvents:'none',
      overflow:'hidden',background:'#02010a',animation:'ga-cutfade .35s ease-out both'}}>
      <div style={{position:'absolute',inset:0,
        background:isCosmic
          ? 'radial-gradient(ellipse at 50% 86%,rgba(218,165,32,.34),rgba(72,24,2,.42) 28%,rgba(24,4,60,.32) 54%,rgba(0,0,8,.98) 82%)'
          : 'radial-gradient(ellipse at 76% 48%,rgba(218,165,32,.18),transparent 48%),linear-gradient(90deg,#050206 0%,#09070a 48%,#010005 100%)'}}/>

      {stars.map((s,i)=>(
        <div key={`s${i}`} style={{position:'absolute',left:s.left,top:s.top,
          width:s.size,height:s.size,borderRadius:'50%',
          background:i%4===0?'rgba(255,255,255,.9)':'rgba(255,215,0,.82)',
          boxShadow:'0 0 12px rgba(255,215,0,.75)',
          animation:`ga-cutstar ${1.2+(i%7)*.18}s ease-in-out ${s.delay}s infinite`}}/>
      ))}

      {kind==='lever'&&(
        <>
          <div style={{position:'absolute',inset:0,
            background:'radial-gradient(ellipse at 80% 44%,rgba(218,165,32,.16),transparent 48%),linear-gradient(90deg,#050302 0%,#080503 48%,#020101 100%)'}}/>
          <div style={{position:'absolute',left:'-22%',top:'-5%',width:'58%',height:'112%',
            borderRadius:'0 42% 42% 0',
            background:'linear-gradient(90deg,#050505 0%,#11100d 18%,#050504 34%,#2a1705 50%,#060403 70%,#010101 100%)',
            borderRight:'2px solid rgba(255,194,76,.55)',
            boxShadow:'inset -18px 0 44px rgba(218,165,32,.22),22px 0 70px rgba(0,0,0,.86)'}}/>
          {[6,31,58,86].map((top,i)=>(
            <div key={i} style={{position:'absolute',left:'-18%',top:`${top}%`,width:'61%',height:10,
              background:'linear-gradient(180deg,#2c1400,#d59b20 34%,#ffe3a0 50%,#7d4000 100%)',
              boxShadow:'0 0 18px rgba(218,165,32,.42),inset 0 1px 0 rgba(255,255,255,.24)'}}/>
          ))}
          {Array.from({length:22},(_,i)=>(
            <div key={i} style={{position:'absolute',left:`${2+(i%5)*7}%`,top:`${13+Math.floor(i/5)*18}%`,
              width:50,height:2,borderRadius:999,
              background:'linear-gradient(90deg,transparent,rgba(255,185,70,.64),transparent)',
              transform:`rotate(${i%2?42:-34}deg)`,opacity:.52}}/>
          ))}
          <div style={{position:'absolute',left:'17%',top:'73%',width:116,height:164,
            border:'4px solid rgba(218,165,32,.78)',borderBottom:'none',
            borderRadius:'58px 58px 0 0',
            background:'linear-gradient(180deg,rgba(0,0,0,.96),rgba(218,165,32,.06))',
            boxShadow:'0 0 36px rgba(218,165,32,.26),inset 0 0 22px rgba(0,0,0,.92)'}}/>
          <div style={{position:'absolute',left:'30%',top:'38%',width:134,height:134,borderRadius:'50%',
            transform:'translate(-50%,-50%)',
            background:'radial-gradient(circle at 34% 28%,#fff4b8 0%,#d99b1a 18%,#7b4100 44%,#140700 68%,#020101 100%)',
            border:'2px solid rgba(255,210,105,.42)',
            boxShadow:'0 0 42px rgba(218,165,32,.74),inset 0 0 30px rgba(0,0,0,.88)'}}/>
          <div style={{position:'absolute',left:'30%',top:'38%',transformOrigin:'0% 50%',
            animation:'ga-forelever 1.42s cubic-bezier(.2,.82,.18,1) forwards'}}>
            <div style={{position:'absolute',left:0,top:-12,width:218,height:24,borderRadius:999,
              background:'linear-gradient(180deg,#080200,#593000 12%,#d49818 36%,#fff0ad 50%,#bd790a 66%,#160800 100%)',
              border:'1px solid rgba(255,220,120,.38)',
              boxShadow:'0 0 24px rgba(218,165,32,.52),0 10px 24px rgba(0,0,0,.78),inset 0 2px 2px rgba(255,255,220,.34)'}}/>
            <div style={{position:'absolute',left:178,top:-43,width:92,height:92,borderRadius:'50%',
              background:'radial-gradient(circle at 30% 22%,#fff 0%,#fff5c8 7%,#f4bd32 26%,#a46200 58%,#2b1000 100%)',
              boxShadow:'0 0 55px rgba(255,190,40,.96),0 14px 28px rgba(0,0,0,.82),inset -10px -12px 18px rgba(0,0,0,.62)'}}>
              <div style={{position:'absolute',top:15,left:19,width:22,height:12,borderRadius:'50%',
                background:'rgba(255,255,255,.55)',transform:'rotate(-28deg)'}}/>
            </div>
          </div>
          <div style={{position:'absolute',left:'30%',top:'60%',width:82,height:82,borderRadius:'50%',
            transform:'translate(-50%,-50%)',
            background:'radial-gradient(circle at 30% 24%,#fff5bd 0%,#e1a51e 26%,#8a4a00 61%,#1e0a00 100%)',
            boxShadow:'0 0 38px rgba(218,165,32,.72),inset -8px -10px 16px rgba(0,0,0,.62)'}}/>
          <div style={{position:'absolute',left:'18%',right:'6%',bottom:'0%',height:'28%',
            background:'linear-gradient(180deg,transparent,rgba(218,165,32,.08),rgba(0,0,0,.25))'}}/>
          <div style={{position:'absolute',inset:0,
            background:'linear-gradient(90deg,transparent 0%,rgba(255,226,140,.24) 45%,transparent 66%)',
            filter:'blur(8px)',animation:'ga-cutsweep 1.85s ease-out both'}}/>
        </>
      )}

      {isCosmic&&(
        <>
          <div style={{position:'absolute',left:'50%',top:'16%',width:360,height:132,
            transform:'translate(-50%,-50%)'}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{position:'absolute',left:'50%',top:'50%',
                width:96+i*66,height:26+i*16,borderRadius:'50%',
                border:`${2-i*.25}px solid rgba(${i%2?170:255},${i%2?76:205},${i%2?255:40},${.62-i*.09})`,
                boxShadow:`0 0 ${20+i*8}px rgba(${i%2?170:255},${i%2?76:205},${i%2?255:40},${.48-i*.08})`,
                animation:`ga-vortex ${3.8+i*.6}s linear ${i*.1}s infinite`}}/>
            ))}
            <div style={{position:'absolute',left:'50%',top:'50%',width:48,height:48,borderRadius:'50%',
              transform:'translate(-50%,-50%)',
              background:'radial-gradient(circle,#fff9c8 0%,rgba(255,215,0,.95) 20%,rgba(160,80,255,.42) 54%,transparent 74%)',
              boxShadow:'0 0 60px rgba(255,215,0,.95),0 0 92px rgba(170,80,255,.5)',
              animation:'ga-stageflash .9s ease-in-out infinite'}}/>
          </div>
          <div style={{position:'absolute',bottom:'0%',left:'50%',width:'118%',height:'98%',
            transform:'translateX(-50%)',
            clipPath:'polygon(10% 100%,90% 100%,57% 0,43% 0)',
            background:'linear-gradient(0deg,rgba(255,215,0,.78),rgba(218,165,32,.50) 28%,rgba(255,230,120,.20) 58%,transparent 91%)',
            filter:'blur(13px)',animation:'ga-cutbeam 1.6s ease-in-out infinite'}}/>
          <div style={{position:'absolute',bottom:0,left:'50%',width:38,height:'86%',
            transform:'translateX(-50%)',
            background:'linear-gradient(0deg,rgba(255,250,190,.96),rgba(255,215,0,.68) 42%,transparent 92%)',
            filter:'blur(1px)',animation:'ga-stageflash .8s ease-in-out infinite'}}/>
          {rays.map((r,i)=>(
            <div key={`r${i}`} style={{position:'absolute',left:r.left,top:-40,
              width:i%4===0?3:1.5,height:r.height,borderRadius:999,
              background:'linear-gradient(180deg,transparent,rgba(255,236,150,.9),rgba(218,165,32,.42),transparent)',
              filter:'blur(.35px)',opacity:0,
              animation:`ga-goldrain ${r.dur}s ease-in-out ${r.delay}s infinite`}}/>
          ))}
          {[256,198,142].map((w,i)=>(
            <div key={i} style={{position:'absolute',bottom:14-i*4,left:'50%',
              transform:'translateX(-50%)',width:w,height:w*.17,borderRadius:'50%',
              border:`${2.2-i*.5}px solid rgba(255,215,0,${.78-i*.18})`,
              boxShadow:`0 0 ${24-i*5}px rgba(218,165,32,${.62-i*.13}),inset 0 0 14px rgba(218,165,32,.28)`}}/>
          ))}
        </>
      )}

      {kind==='space'&&BALLS.map((b,i)=>{
        const pos = ORBIT_POSITIONS[i % ORBIT_POSITIONS.length]
        return (
        <div key={b.id} style={{position:'absolute',
          left:pos.left,top:pos.top,
          animation:`ga-rayfall ${1.55+i*.18}s ease-in-out ${i*.12}s infinite`}}>
          <PrizeCapsule prizeId={b.id} size={76} showLabel={false}/>
        </div>
      )})}

      {kind==='space'&&(
        <div style={{position:'absolute',left:'50%',top:'58%',transform:'translate(-50%,-50%)',
          animation:'ga-capportal 2.05s cubic-bezier(.18,.78,.24,1) forwards'}}>
          <PrizeCapsule prizeId={prizeId} size={128} showLabel={false}/>
        </div>
      )}

      {kind==='falling'&&(
        <div style={{position:'absolute',left:'50%',top:'48%',transform:'translate(-50%,-50%)',
          animation:'ga-capdropfull 2s cubic-bezier(.22,.72,.18,1) forwards'}}>
          <PrizeCapsule prizeId={prizeId} size={154} showLabel={false}/>
        </div>
      )}

      {kind==='opening'&&(
        <div style={{position:'absolute',left:'50%',top:'48%',transform:'translate(-50%,-50%)',
          width:250,height:300,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
            animation:'ga-premiumopen 1.15s ease-out forwards'}}>
            <div style={{position:'absolute',inset:-20,borderRadius:'50%',
              background:'radial-gradient(circle,rgba(255,235,150,.78),rgba(218,165,32,.32) 42%,transparent 70%)',
              filter:'blur(8px)',animation:'ga-stageflash .9s ease-in-out infinite'}}/>
            <PrizeCapsule prizeId={prizeId} size={210} open showLabel={false}/>
          </div>
        </div>
      )}

      {guaranteed&&<div style={{position:'absolute',inset:0,pointerEvents:'none',boxShadow:'inset 0 0 70px rgba(255,215,0,.32)'}}/>}
    </div>
  )
}

function CapsuleVisual({ prizeId, size=170, open=false, style }: {
  prizeId:string; size?:number; open?:boolean; style?:CSSProperties
}) {
  return (
    <div style={style}>
      <PrizeCapsule prizeId={prizeId} size={size} open={open} showLabel={false}/>
    </div>
  )
}

function ResultCapsuleReveal({ prizeId, size=210 }: {prizeId:string; size?:number}) {
  return (
    <div style={{position:'relative',width:size,height:size*1.18,display:'flex',
      alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'absolute',inset:-24,borderRadius:'50%',
        background:'radial-gradient(circle,rgba(255,255,210,.9),rgba(218,165,32,.48) 36%,transparent 64%)',
        animation:'ga-resultflare 1.35s ease-out .22s forwards',opacity:0}}/>
      <CapsuleVisual prizeId={prizeId} size={size*.9} open={false}
        style={{position:'absolute',animation:'ga-premiumclosed 1.15s ease-out forwards'}}/>
      <CapsuleVisual prizeId={prizeId} size={size} open
        style={{position:'absolute',animation:'ga-premiumopen 1.15s ease-out forwards'}}/>
    </div>
  )
}

/* 笊絶武笊絶武 Prize Capsule: CSS-drawn colored capsule (image 5 reference) 笊絶武笊絶武 */
function PrizeCapsule({ prizeId, size=96, open=false, showLabel=true }:{prizeId:string;size?:number;open?:boolean;showLabel?:boolean}) {
  const c = CAPSULE[prizeId] ?? CAPSULE.pts300
  const width = size*1.42
  const height = size*.9
  const isJackpot = prizeId === 'inmu10k'
  const labelSize = Math.max(9, Math.min(28, size*.17))
  const isCharacter = prizeId.startsWith('character-')
  const shellColor = prizeId==='pts100' ? '#f3f5f7'
    : prizeId==='pts300' ? '#ff4daf'
    : prizeId==='pts500' ? '#a6ed35'
    : prizeId==='pts1000' ? '#2678f3'
    : prizeId==='pts3000' ? '#ff4b3f'
    : prizeId==='pts5000' ? '#a62ee9'
    : prizeId==='premium-food' ? '#ff922e'
    : prizeId==='sleep-tea' ? '#35cbea'
    : '#f5bd16'
  const shellGradient = isCharacter
    ? 'linear-gradient(145deg,rgba(255,255,255,.98),transparent 28%),linear-gradient(135deg,#ff4f9a,#ffe24f 20%,#68ff9c 40%,#55c9ff 61%,#a66cff 81%,#ff63d3)'
    : `linear-gradient(145deg,rgba(255,255,255,.92),transparent 30%),linear-gradient(160deg,${shellColor},${shellColor} 62%,rgba(0,0,0,.2))`
  const appleShape = 'polygon(7% 43%,10% 26%,20% 14%,34% 10%,48% 15%,59% 12%,76% 16%,88% 28%,93% 48%,88% 68%,77% 82%,60% 89%,42% 88%,24% 82%,12% 68%)'
  const inset = Math.max(4,size*.055)
  const shell = (part:'whole'|'top'|'bottom') => (
    <div style={{position:'absolute',inset:0,
      clipPath:part==='top'?'inset(0 0 49% 0)':part==='bottom'?'inset(49% 0 0 0)':'none',
      transform:part==='top'&&open?`translateY(${-size*.15}px) rotate(-3deg)`:part==='bottom'&&open?`translateY(${size*.15}px) rotate(2deg)`:'none',
      transition:'transform .42s cubic-bezier(.2,.8,.2,1)'}}>
      <div style={{position:'absolute',inset:0,clipPath:appleShape,background:'#090a0d'}}/>
      <div style={{position:'absolute',inset,clipPath:appleShape,background:shellGradient,overflow:'hidden'}}>
        <div style={{position:'absolute',left:'-2%',right:'-2%',top:'51%',bottom:'-4%',background:'#090a0d',
          clipPath:'polygon(0 20%,12% 8%,25% 24%,39% 5%,53% 21%,67% 4%,82% 20%,100% 9%,100% 100%,0 100%)'}}/>
        <div style={{position:'absolute',left:'18%',top:'22%',width:'26%',height:'52%',background:'#fff400',
          clipPath:'polygon(14% 0,62% 4%,100% 25%,79% 48%,97% 74%,62% 100%,20% 86%,0 55%,18% 34%,0 18%)'}}>
          <div style={{position:'absolute',inset:'14% 26% 12% 20%',background:'#fff',clipPath:'polygon(22% 0,75% 8%,100% 32%,75% 58%,93% 83%,52% 100%,16% 79%,0 42%)'}}/>
        </div>
        <div style={{position:'absolute',right:'17%',top:'21%',width:'27%',height:'53%',background:'#fff400',
          clipPath:'polygon(33% 0,82% 7%,100% 32%,78% 52%,95% 77%,61% 100%,19% 88%,0 62%,18% 39%,2% 20%)'}}>
          <div style={{position:'absolute',inset:'13% 20% 14% 24%',background:'#fff',clipPath:'polygon(19% 0,75% 9%,100% 39%,78% 62%,88% 84%,46% 100%,10% 76%,0 34%)'}}/>
        </div>
        <div style={{position:'absolute',left:'13%',top:'8%',width:'29%',height:'18%',borderRadius:'50%',background:'rgba(255,255,255,.48)',transform:'rotate(-12deg)'}}/>
      </div>
    </div>
  )
  return (
    <div style={{position:'relative',width,height,display:'flex',alignItems:'center',justifyContent:'center',
      filter:`drop-shadow(0 0 ${Math.max(16,size*.22)}px ${c.glow})`}}>
      {!open&&(
        <div style={{position:'absolute',inset:-Math.max(8,size*.08),borderRadius:'50%',
          background:`radial-gradient(circle,${c.glow} 0%,transparent 64%)`,
          opacity:isJackpot ? .42 : .22,pointerEvents:'none'}}/>
      )}
      {open ? <>{shell('top')}{shell('bottom')}</> : shell('whole')}
      <div style={{position:'absolute',left:'52%',top:'-5%',width:'4%',height:'24%',borderRadius:99,
        background:'#090a0d',transform:'rotate(13deg)',transformOrigin:'bottom',zIndex:5}}/>
      <div style={{position:'absolute',inset:0,clipPath:appleShape,overflow:'hidden',zIndex:6,pointerEvents:'none'}}>
        <div style={{position:'absolute',top:'-18%',bottom:'-18%',left:'10%',width:'24%',background:'linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent)',animation:'ga-capglint 2.2s ease-in-out infinite'}}/>
      </div>
      {showLabel&&(
        <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
          minWidth:size*.66,padding:`${Math.max(1,size*.018)}px ${Math.max(4,size*.048)}px`,
          borderRadius:999,textAlign:'center',zIndex:7,
          color:'#fff',
          fontSize:labelSize,fontWeight:900,lineHeight:1.05,whiteSpace:'pre-line',
          fontFamily:'system-ui, sans-serif',
          textShadow:'0 2px 5px rgba(0,0,0,.9),0 0 10px rgba(255,255,255,.3)'}}>
          {c.label}
        </div>
      )}
      {isJackpot&&open&&(
        <div style={{position:'absolute',inset:-12,borderRadius:'50%',
          background:'radial-gradient(circle,rgba(255,250,100,.45) 0%,rgba(218,165,32,.2) 40%,transparent 68%)',
          animation:'ga-glow 1.2s ease-in-out infinite',pointerEvents:'none'}}/>
      )}
    </div>
  )
}

function RateOrb({ id }:{id:string}) {
  const c = CAPSULE[id] ?? CAPSULE.pts300
  const isCharacter = id.startsWith('character-')
  const shellColor = id==='pts100' ? '#f3f5f7' : id==='pts300' ? '#ff4daf'
    : id==='pts500' ? '#a6ed35' : id==='pts1000' ? '#2678f3'
    : id==='pts3000' ? '#ff4b3f' : id==='pts5000' ? '#a62ee9'
    : id==='premium-food' ? '#ff922e' : id==='sleep-tea' ? '#35cbea' : '#f5bd16'
  const body=isCharacter?'linear-gradient(135deg,#ff58a0,#ffe34f 22%,#66ff9c 44%,#55c8ff 65%,#a76aff 84%,#ff63d2)':shellColor
  return <div style={{position:'relative',width:34,height:25,flexShrink:0,filter:`drop-shadow(0 0 7px ${c.glow})`}}>
    <div style={{position:'absolute',inset:0,background:'#090a0d',clipPath:'polygon(6% 43%,12% 22%,28% 11%,47% 16%,62% 12%,82% 20%,94% 42%,88% 70%,70% 88%,42% 90%,18% 78%)'}}/>
    <div style={{position:'absolute',inset:2,background:body,clipPath:'polygon(6% 43%,12% 22%,28% 11%,47% 16%,62% 12%,82% 20%,94% 42%,88% 70%,70% 88%,42% 90%,18% 78%)',overflow:'hidden'}}>
      <div style={{position:'absolute',left:0,right:0,top:'54%',bottom:0,background:'#090a0d'}}/>
      <i style={{position:'absolute',left:'20%',top:'20%',width:'25%',height:'45%',background:'#fff400',clipPath:'polygon(20% 0,100% 22%,72% 50%,100% 82%,45% 100%,0 60%)'}}/>
      <i style={{position:'absolute',right:'18%',top:'20%',width:'25%',height:'45%',background:'#fff400',clipPath:'polygon(30% 0,100% 30%,75% 55%,95% 84%,35% 100%,0 62%)'}}/>
    </div>
    <div style={{position:'absolute',left:'53%',top:-2,width:2,height:7,borderRadius:3,background:'#090a0d',transform:'rotate(12deg)'}}/>
  </div>
}

/* 笊絶武笊絶武 Rate Panel overlay 笊絶武笊絶武 */
function RatePanel({ balls=BALLS }:{balls?:readonly {id:string;label:string;rate:string}[]}) {
  return (
    <div style={{position:'absolute',top:'12%',right:0,zIndex:10,width:148,maxHeight:'76%',overflowY:'auto',
      background:'linear-gradient(180deg,rgba(8,5,1,.98),rgba(1,1,1,.98) 52%,rgba(10,5,1,.98))',
      border:'1.5px solid rgba(218,165,32,.68)',borderRadius:'8px 0 0 8px',
      padding:'10px 8px 10px 10px',
      backdropFilter:'blur(14px)',
      boxShadow:'inset 0 1px 0 rgba(255,238,160,.12),inset 0 -1px 0 rgba(0,0,0,.9),-4px 0 30px rgba(0,0,0,.74),0 0 18px rgba(218,165,32,.16)'}}>
      {(['tl','tr','bl','br'] as const).map(pos=>(
        <div key={pos} style={{position:'absolute',
          top:pos[0]==='t'?5:undefined,bottom:pos[0]==='b'?5:undefined,
          left:pos[1]==='l'?5:undefined,right:pos[1]==='r'?5:undefined,
          width:12,height:12,
          borderTop:pos[0]==='t'?'1px solid rgba(255,218,110,.72)':'none',
          borderBottom:pos[0]==='b'?'1px solid rgba(255,218,110,.72)':'none',
          borderLeft:pos[1]==='l'?'1px solid rgba(255,218,110,.72)':'none',
          borderRight:pos[1]==='r'?'1px solid rgba(255,218,110,.72)':'none'}}/>
      ))}
      <p style={{margin:'0 0 8px',fontSize:15,color:'#e8c65a',
        textAlign:'center',letterSpacing:'0.1em',fontWeight:900,
        textShadow:'0 0 12px rgba(218,165,32,.58)'}}>&#25490;&#20986;&#29575;</p>
      {balls.map(b=>(
        <div key={b.id} style={{display:'flex',alignItems:'center',gap:7,marginBottom:6}}>
          <RateOrb id={b.id}/>
          <div style={{minWidth:0}}>
            <p style={{fontSize:10,color:'rgba(255,246,210,.96)',fontWeight:800,margin:0,whiteSpace:'nowrap',
              lineHeight:1.05,textShadow:'0 1px 3px rgba(0,0,0,.85)'}}>
              {b.id==='inmu10k'?'10,000INMU':b.label}
            </p>
            <p style={{fontSize:13,color:'#b9ff9c',fontWeight:900,fontFamily:'monospace',margin:'1px 0 0',
              lineHeight:1,textShadow:'0 0 9px rgba(120,255,120,.32)'}}>{b.rate}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* 笊絶武笊絶武 Ornate Button (image 3 reference) 笊絶武笊絶武 */
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

/* 笊絶武笊絶武 Points Panel (image 3 reference) 笊絶武笊絶武 */
function BalancePanel({ label, value, loading, suffix }:{ label:string; value:number|null; loading:boolean; suffix:string }) {
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
          borderTop:pos[0]==='t'?'1.5px solid rgba(218,165,32,.55)':'none',
          borderBottom:pos[0]==='b'?'1.5px solid rgba(218,165,32,.55)':'none',
          borderLeft:pos[1]==='l'?'1.5px solid rgba(218,165,32,.55)':'none',
          borderRight:pos[1]==='r'?'1.5px solid rgba(218,165,32,.55)':'none',
        }}/>
      ))}
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{position:'relative',width:42,height:38,flexShrink:0}}>
          {[13,8,3].map((off,i)=>(
            <img key={i} src={coinImg} style={{position:'absolute',bottom:off,left:0,
              width:32,height:32,borderRadius:'50%',objectFit:'cover',
              border:`${2-i*.4}px solid rgba(218,165,32,${.9-i*.15})`,
              boxShadow:`0 ${2-i}px ${6-i*2}px rgba(0,0,0,.7)`}}/>
          ))}
        </div>
        <p style={{margin:0,fontSize:13,color:'rgba(218,165,32,.88)',fontWeight:700,letterSpacing:'0.1em'}}>{label}</p>
      </div>
      <div style={{display:'flex',alignItems:'baseline',gap:3}}>
        <span style={{fontFamily:'monospace',fontWeight:900,fontSize:27,color:'#ffd700',
          textShadow:'0 0 22px rgba(255,215,0,.65),0 2px 4px rgba(0,0,0,.9)'}}>
          {loading ? '---' : value == null ? '未接続' : value.toLocaleString()}
        </span>
        <span style={{fontSize:14,color:'rgba(218,165,32,.82)',fontWeight:700}}>{suffix}</span>
      </div>
    </div>
  )
}

function PointsPanel({ pts, loading }:{pts:number;loading:boolean}) {
  return <BalancePanel label="保有ポイント" value={pts} loading={loading} suffix="pt" />
}

function InmuBalancePanel({ balance, loading }:{balance:number|null;loading:boolean}) {
  return <BalancePanel label="保有INMU" value={balance} loading={loading} suffix="INMU" />
}

/* Main GachaPage */
function GachaModeTabs({ mode, onChange, disabled=false }: { mode:'points'|'paid'; onChange:(mode:'points'|'paid')=>void; disabled?:boolean }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,padding:4,margin:'6px auto 2px',width:'min(360px,92%)',border:'1px solid rgba(218,165,32,.35)',borderRadius:8,background:'rgba(3,2,10,.78)'}}>
      {(['points','paid'] as const).map(value => (
        <button key={value} type="button" disabled={disabled} onClick={()=>onChange(value)} style={{height:38,border:0,borderRadius:6,fontWeight:800,fontSize:12,cursor:disabled?'not-allowed':'pointer',color:mode===value?'#160c00':'rgba(255,255,255,.55)',background:mode===value?'linear-gradient(135deg,#ffe277,#d59a00)':'transparent',boxShadow:mode===value?'0 0 18px rgba(255,190,30,.36)':'none'}}>
          {value==='points'?'ポイントガチャ':'INMUガチャ'}
        </button>
      ))}
    </div>
  )
}

const FALLBACK_GACHA_BANNERS = {
  points: [normalBannerImg, takuyaBannerImg, nyarushianBannerImg, leonBannerImg],
  paid: [paidBannerImg, takuyaBannerImg, nyarushianBannerImg, leonBannerImg],
} as const

const GACHA_ASSET_MAP: Record<string, string> = {
  'asset:20260717-points-main': eventPointsBannerImg,
  'asset:20260717-inmu-main': eventInmuBannerImg,
  'asset:20260717-chinge': eventChingeBannerImg,
  'asset:20260717-tdn': eventTdnBannerImg,
  'asset:20260717-whip': eventWhipBannerImg,
}

function resolveBannerSrc(value: string) {
  return GACHA_ASSET_MAP[value] ?? value
}

function GachaBannerCarousel({ mode, config }:{mode:'points'|'paid'; config:GachaRuntimeConfig|null}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [active,setActive] = useState(0)
  const configured = config?.active ? config.modes?.[mode]?.banners?.map(resolveBannerSrc).filter(Boolean) : null
  const banners = configured?.length ? configured : FALLBACK_GACHA_BANNERS[mode]

  useEffect(()=>{
    setActive(0)
    scroller.current?.scrollTo({left:0,behavior:'auto'})
  },[mode, config?.active, banners.join('|')])

  const goTo = (index:number) => {
    const next = (index+banners.length)%banners.length
    const node = scroller.current
    if(node) node.scrollTo({left:node.clientWidth*next,behavior:'smooth'})
    setActive(next)
  }

  return (
    <div style={{position:'relative',width:'100%',flexShrink:0}}>
      <div ref={scroller} onScroll={event=>{
        const node=event.currentTarget
        if(node.clientWidth)setActive(Math.round(node.scrollLeft/node.clientWidth))
      }} style={{display:'flex',overflowX:'auto',scrollSnapType:'x mandatory',scrollbarWidth:'none',touchAction:'pan-x',borderRadius:8,border:'1px solid rgba(218,165,32,.38)',background:'#030207'}}>
        {banners.map((src,index)=><div key={src} style={{position:'relative',minWidth:'100%',scrollSnapAlign:'center'}}>
          <img src={src} alt={`${mode==='points'?'ポイント':'INMU'}ガチャ バナー ${index+1}`} draggable={false} style={{display:'block',width:'100%',height:'auto',aspectRatio:'1280 / 850',objectFit:'contain'}}/>
        </div>)}
      </div>
      <button type="button" aria-label="前のバナー" onClick={()=>goTo(active-1)} style={{position:'absolute',left:6,top:'50%',transform:'translateY(-50%)',width:32,height:42,borderRadius:6,border:'1px solid rgba(255,215,100,.42)',background:'rgba(0,0,0,.62)',color:'#ffe58a',fontSize:22,zIndex:7}}>‹</button>
      <button type="button" aria-label="次のバナー" onClick={()=>goTo(active+1)} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',width:32,height:42,borderRadius:6,border:'1px solid rgba(255,215,100,.42)',background:'rgba(0,0,0,.62)',color:'#ffe58a',fontSize:22,zIndex:7}}>›</button>
      <div style={{display:'flex',justifyContent:'center',gap:6,paddingTop:7}}>{banners.map((_,index)=><button key={index} type="button" aria-label={`バナー${index+1}`} onClick={()=>goTo(index)} style={{width:index===active?20:7,height:7,borderRadius:99,border:0,padding:0,background:index===active?'#ffd54b':'rgba(255,255,255,.28)',transition:'width .2s'}}/>)}</div>
    </div>
  )
}

function EmissionRateModal({ open, onClose, config }:{ open:boolean; onClose:()=>void; config:GachaRuntimeConfig|null }) {
  const [tab,setTab] = useState<'points'|'paid'>('points')
  useEffect(()=>{ if(open) setTab('points') },[open])
  if(!open) return null
  const list = config?.active ? (config.modes?.[tab]?.rates ?? []) : (tab==='points'?BALLS:PAID_BALLS)
  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,.72)',padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:420,maxHeight:'82vh',overflow:'hidden',display:'flex',flexDirection:'column',borderRadius:14,border:'1px solid rgba(218,165,32,.5)',background:'linear-gradient(160deg,#120a1e,#08040e)',boxShadow:'0 12px 40px rgba(0,0,0,.6)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:'1px solid rgba(218,165,32,.3)'}}>
          <h3 style={{margin:0,fontSize:15,fontWeight:800,color:'#e8c65a'}}>排出率一覧</h3>
          <button type="button" onClick={onClose} aria-label="閉じる" style={{background:'none',border:0,color:'rgba(255,255,255,.7)',fontSize:20,cursor:'pointer',lineHeight:1}}>×</button>
        </div>
        <div style={{display:'flex',gap:6,padding:'10px 16px 0'}}>
          <button type="button" onClick={()=>setTab('points')} style={{flex:1,padding:'8px 0',borderRadius:8,border:tab==='points'?'1px solid rgba(255,215,100,.7)':'1px solid rgba(255,255,255,.15)',background:tab==='points'?'rgba(255,215,100,.15)':'transparent',color:tab==='points'?'#ffe58a':'rgba(255,255,255,.6)',fontWeight:800,fontSize:12,cursor:'pointer'}}>ポイントガチャ</button>
          <button type="button" onClick={()=>setTab('paid')} style={{flex:1,padding:'8px 0',borderRadius:8,border:tab==='paid'?'1px solid rgba(255,215,100,.7)':'1px solid rgba(255,255,255,.15)',background:tab==='paid'?'rgba(255,215,100,.15)':'transparent',color:tab==='paid'?'#ffe58a':'rgba(255,255,255,.6)',fontWeight:800,fontSize:12,cursor:'pointer'}}>INMUガチャ</button>
        </div>
        <div style={{overflowY:'auto',padding:'12px 16px 16px'}}>
          {list.map(item=>(
            <div key={item.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
              <span style={{fontSize:13,color:'rgba(255,255,255,.9)',fontWeight:600}}>{item.label}</span>
              <span style={{fontSize:13,color:'#ffd54b',fontWeight:800}}>{item.rate}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function capsuleIdForPrize(prize?: Prize, result?: Result | null) {
  if (!prize) return 'pts300'
  if (prize.type === 'character') return prize.prizeId
  return prize.prizeId
}

function PrizeResultIcon({ prize, size=72 }:{prize:Prize;size?:number}) {
  if (prize.type === 'character' && prize.characterId) {
    const pet = PET_BY_ID[prize.characterId]
    return <img src={pet?.image} alt={pet?.name ?? prize.label} style={{width:size,height:size,objectFit:'contain',filter:'drop-shadow(0 0 15px rgba(196,120,255,.8))'}}/>
  }
  if (prize.type === 'premium_food') {
    return <div aria-label="高級ごはん" style={{width:size,height:size,borderRadius:'50%',display:'grid',placeItems:'center',fontSize:size*.62,background:'radial-gradient(circle at 35% 25%,#fff7b0,#ff9f1c 52%,#8b3100)',boxShadow:'0 0 18px rgba(255,170,40,.75)',border:'2px solid #ffe69a'}}>🍱</div>
  }
  if (prize.type === 'sleep_tea') {
    return <div aria-label="アイスティー（睡眠薬入り）" style={{width:size,height:size,borderRadius:'18%',display:'grid',placeItems:'center',fontSize:size*.58,background:'radial-gradient(circle at 35% 25%,#eaffff,#35cbea 52%,#074b75)',boxShadow:'0 0 18px rgba(65,210,255,.78)',border:'2px solid #a8f3ff'}}>🧋</div>
  }
  return <CapsuleVisual prizeId={capsuleIdForPrize(prize)} size={size} open/>
}

function NewPetCharacterScreen({ prize, profile, unread, onClose }:{ prize:Prize; profile:any; unread:number; onClose:()=>void }) {
  const pet = prize.characterId ? PET_BY_ID[prize.characterId] : null
  return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>
      <PageBg>
        <div style={{minHeight:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'28px 20px',textAlign:'center'}}>
          <p style={{color:'#ffe87d',fontFamily:'Georgia,serif',fontWeight:900,letterSpacing:'.2em',fontSize:13}}>NEW CHARACTER</p>
          <div style={{position:'relative',width:'min(310px,78vw)',height:'min(410px,48vh)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{position:'absolute',inset:'10%',borderRadius:'50%',background:'radial-gradient(circle,rgba(255,215,0,.75),rgba(130,38,255,.25) 48%,transparent 72%)',filter:'blur(12px)',animation:'ga-stageflash 1.6s ease-in-out infinite'}}/>
            {pet&&<img src={pet.image} alt={pet.name} style={{position:'relative',zIndex:2,maxWidth:'100%',maxHeight:'100%',objectFit:'contain',filter:'drop-shadow(0 0 32px rgba(255,215,0,.72))',animation:'ga-jpzoom .8s ease-out both'}}/>}
          </div>
          <p style={{margin:0,color:'#fff',fontSize:28,fontWeight:900}}>{pet?.name??prize.label}</p>
          <p style={{margin:'5px 0 20px',color:'#ffd700',fontWeight:800}}>★3 ・ Lv.1</p>
          <button type="button" onClick={onClose} style={{width:'min(320px,90%)',height:52,borderRadius:8,border:'1px solid #ffe47b',background:'linear-gradient(135deg,#ffe47b,#c78a00)',fontWeight:900,color:'#160b00',boxShadow:'0 0 24px rgba(255,190,20,.4)'}}>OK</button>
        </div>
      </PageBg>
    </AppShell>
  )
}

export function GachaPage() {
  const { profile, unread } = useAuth()
  const [pts,setPts]             = useState(0)
  const [ptsLoading,setPtsLoading]= useState(true)
  const [phase,setPhase]         = useState<Phase>('idle')
  const [result,setResult]       = useState<Result|null>(null)
  const [revIdx,setRevIdx]       = useState(0)
  const [history,setHistory]     = useState<HistRow[]>([])
  const [commerceHistory,setCommerceHistory] = useState<CommerceHistRow[]>([])
  const [histOpen,setHistOpen]   = useState(true)
  const [openFlash,setOpenFlash] = useState(false)
  const [newCharacterRevealIndex,setNewCharacterRevealIndex] = useState(0)
  const [jackpotSeen,setJackpotSeen] = useState(false)
  const [freeUsed,setFreeUsed]   = useState(true)
  const [freeRemaining,setFreeRemaining] = useState(0)
  const [freeSharedRemaining,setFreeSharedRemaining] = useState(0)
  const [freeNextReset,setFreeNextReset] = useState<string|null>(null)
  const [freeLoading,setFreeLoading] = useState(false)
  const [gachaMode,setGachaMode] = useState<'points'|'paid'>('points')
  const [drawRequestBusy,setDrawRequestBusy] = useState(false)
  const [paidBusy,setPaidBusy] = useState(false)
  const [tdnRerollBusy,setTdnRerollBusy] = useState(false)
  const [paidPity,setPaidPity] = useState(0)
  const [paidStatus,setPaidStatus] = useState('')
  const [inmuBalance,setInmuBalance] = useState<number|null>(null)
  const [inmuBalanceLoading,setInmuBalanceLoading] = useState(false)
  const [paidFreeLoading,setPaidFreeLoading] = useState(false)
  const [paidFreeUsed,setPaidFreeUsed] = useState(true)
  const [paidFreeRemaining,setPaidFreeRemaining] = useState(0)
  const [paidFreeSharedRemaining,setPaidFreeSharedRemaining] = useState(0)
  const [paidFreeNextReset,setPaidFreeNextReset] = useState<string|null>(null)
  const [rateModalOpen,setRateModalOpen] = useState(false)
  const [paidSinglePrice,setPaidSinglePrice] = useState(10000)
  const [paidElevenPrice,setPaidElevenPrice] = useState(100000)
  const [gachaConfig,setGachaConfig] = useState<GachaRuntimeConfig|null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null)
  const drawRequestLock = useRef(false)

  const beginDrawRequest = () => {
    if (drawRequestLock.current) return false
    drawRequestLock.current = true
    setDrawRequestBusy(true)
    return true
  }

  const endDrawRequest = () => {
    drawRequestLock.current = false
    setDrawRequestBusy(false)
  }

  const loadGachaConfig = useCallback(async()=>{
    try{
      const r=await fetch('/api/pet-gacha/config',{credentials:'include'})
      if(!r.ok)return
      const d=await r.json() as GachaRuntimeConfig
      setGachaConfig(d)
    }catch{/**/}
  },[])
  useEffect(()=>{void loadGachaConfig()},[loadGachaConfig])
  useEffect(()=>{
    if(!gachaConfig || gachaConfig.active)return
    const startsAt = new Date(gachaConfig.startsAt).getTime()
    const delay = startsAt - Date.now()
    if(!Number.isFinite(delay) || delay <= 0)return
    const timeout = window.setTimeout(()=>{void loadGachaConfig()}, Math.min(delay + 500, 2_147_483_647))
    return ()=>window.clearTimeout(timeout)
  },[gachaConfig,loadGachaConfig])

  useEffect(()=>{
    (async()=>{
      try{
        const r=await fetch('/api/pet-prices',{credentials:'include'})
        if(r.ok){
          const d=await r.json() as {gacha_paid_single_inmu?:number;gacha_paid_eleven_inmu?:number}
          if(Number.isFinite(d.gacha_paid_single_inmu))setPaidSinglePrice(Number(d.gacha_paid_single_inmu))
          if(Number.isFinite(d.gacha_paid_eleven_inmu))setPaidElevenPrice(Number(d.gacha_paid_eleven_inmu))
        }
      }catch{/**/}
    })()
  },[])

  const loadPts = useCallback(async()=>{
    try{
      const r=await fetch('/api/profile',{credentials:'include'})
      if(r.ok){const d=await r.json() as {monthlyPoints?:string|number};setPts(Number(d.monthlyPoints??0))}
    }catch{/**/}finally{setPtsLoading(false)}
  },[])
  useEffect(()=>{loadPts()},[loadPts])

  const loadInmuBalance = useCallback(async(connect=false)=>{
    setInmuBalanceLoading(true)
    try {
      const live = await fetchConnectedPhantomInmuBalance(connect)
      if (live !== null) {
        setInmuBalance(live)
        return
      }
      try {
        setInmuBalance(await fetchMyInmuBalance())
      } catch {
        const wallet = (profile as any)?.solWallet ?? (profile as any)?.walletAddress ?? ''
        if (wallet) setInmuBalance(await fetchInmuBalanceForWallet(wallet))
        else setInmuBalance(null)
      }
    } catch {
      setInmuBalance(null)
    } finally {
      setInmuBalanceLoading(false)
    }
  },[profile])

  useEffect(()=>{void loadInmuBalance(false)},[loadInmuBalance])
  useEffect(()=>{
    if (gachaMode === 'paid') void loadInmuBalance(false)
  },[gachaMode,loadInmuBalance])

  const loadHist = useCallback(async()=>{
    try{
      const r=await fetch('/api/gacha/history',{credentials:'include'})
      const d=await r.json() as HistRow[];setHistory(Array.isArray(d)?d:[])
    }catch{/**/}
  },[])
  useEffect(()=>{loadHist()},[loadHist])

  const loadFreeStatus = useCallback(async()=>{
    try{
      const r=await fetch('/api/gacha/free-status',{credentials:'include'})
      if(r.ok){const d=await r.json() as {used:boolean;remaining?:number;sharedRemaining?:number;nextReset:string};setFreeUsed(d.used);setFreeRemaining(Number(d.remaining??(d.used?0:1)));setFreeSharedRemaining(Number(d.sharedRemaining??0));setFreeNextReset(d.nextReset)}
    }catch{/**/}
  },[])
  useEffect(()=>{loadFreeStatus()},[loadFreeStatus])

  const loadPaidFreeStatus = useCallback(async()=>{
    try{
      const r=await fetch('/api/pet-gacha/free-status',{credentials:'include'})
      if(r.ok){const d=await r.json() as {used:boolean;remaining?:number;sharedRemaining?:number;nextReset:string};setPaidFreeUsed(d.used);setPaidFreeRemaining(Number(d.remaining??(d.used?0:1)));setPaidFreeSharedRemaining(Number(d.sharedRemaining??0));setPaidFreeNextReset(d.nextReset)}
    }catch{/**/}
  },[])
  useEffect(()=>{loadPaidFreeStatus()},[loadPaidFreeStatus])

  const loadCommerceStatus = useCallback(async()=>{
    try{
      const response=await fetch('/api/pet-commerce/status',{credentials:'include'})
      if(response.ok){const data=await response.json() as {paidPity?:number;history?:CommerceHistRow[]};setPaidPity(Number(data.paidPity??0));setCommerceHistory(Array.isArray(data.history)?data.history:[])}
    }catch{/**/}
  },[])
  useEffect(()=>{loadCommerceStatus()},[loadCommerceStatus])

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
    if(phase==='done'&&result&&(!result.hasInmu||jackpotSeen)&&result.results.length>1&&revIdx<result.results.length){
      const t=setTimeout(()=>setRevIdx(i=>i+1),360);return()=>clearTimeout(t)
    }
    return undefined
  },[phase,result,revIdx,jackpotSeen])

  useEffect(()=>{
    if(phase==='opening'){setOpenFlash(true);setTimeout(()=>setOpenFlash(false),680)}
  },[phase])

  async function spin(type:'single'|'multi'){
    if(phase!=='idle')return
    const cost=type==='multi'?10000:1000
    if(pts<cost){toast.error(`ポイント不足（必要: ${cost.toLocaleString()}pt）`);return}
    if(!beginDrawRequest())return
    try{
      const res=await fetch('/api/pet-gacha/points',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pullType:type})
      })
      if(!res.ok){const e=await res.json().catch(()=>({})) as {error?:string};throw new Error(e.error??'エラー')}
      const data=await res.json() as Result
      const r:Result={...data,hasInmu:Boolean(data.hasInmu),wasGuaranteed:Boolean(data.wasGuaranteed)}
      setResult(r);setRevIdx(0);setNewCharacterRevealIndex(0);setPts(r.newPoints)
      setPhase(r.wasGuaranteed?'guaranteed':'inserting')
    }catch(e){toast.error(e instanceof Error?e.message:'エラーが発生しました')}
    finally{endDrawRequest()}
  }

  async function spinFree(){
    if(phase!=='idle'||freeUsed||freeLoading||!beginDrawRequest())return
    setFreeLoading(true)
    try{
      const res=await fetch('/api/gacha/free-spin',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
      })
      if(!res.ok){const e=await res.json().catch(()=>({})) as {error?:string};throw new Error(e.error??'エラー')}
      const r=await res.json() as Result
      const normalized:Result={...r,hasInmu:Boolean(r.hasInmu),wasGuaranteed:Boolean(r.hasInmu)}
      setResult(normalized);setRevIdx(0);setNewCharacterRevealIndex(0);setPts(normalized.newPoints)
      void loadFreeStatus()
      setPhase(normalized.wasGuaranteed?'guaranteed':'inserting')
    }catch(e){toast.error(e instanceof Error?e.message:'エラーが発生しました')}
    finally{setFreeLoading(false);endDrawRequest()}
  }

  async function completePaidGacha(txId:string,pullType:'single'|'eleven'){
    const response=await fetch('/api/pet-gacha/paid',{
      method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({txId,pullType}),
    })
    const data=await response.json().catch(()=>({})) as Result&{error?:string}
    if(!response.ok)throw new Error(data.error??'INMUガチャの確定に失敗しました')
    localStorage.removeItem('inmu-pet-paid-gacha-pending')
    const hasCharacter=data.results.some(prize=>prize.type==='character')
    setResult({...data,hasInmu:false,wasGuaranteed:hasCharacter,costPoints:0})
    setPts(data.newPoints)
    setPaidPity(Number(data.paidPity??0))
    setRevIdx(0)
    setNewCharacterRevealIndex(0)
    void loadInmuBalance(false)
    setPhase(hasCharacter?'guaranteed':'inserting')
  }

  async function spinPaidFree(){
    if(phase!=='idle'||paidFreeUsed||paidFreeLoading||!beginDrawRequest())return
    setPaidFreeLoading(true)
    try{
      const res=await fetch('/api/pet-gacha/paid-free',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
      })
      const data=await res.json().catch(()=>({})) as Result&{error?:string}
      if(!res.ok)throw new Error(data.error??'エラー')
      const hasCharacter=data.results.some(prize=>prize.type==='character')
      setResult({...data,hasInmu:false,wasGuaranteed:hasCharacter,costPoints:0})
      setPts(data.newPoints)
      setPaidPity(Number(data.paidPity??0))
      setRevIdx(0);setNewCharacterRevealIndex(0)
      void loadPaidFreeStatus()
      setPhase(hasCharacter?'guaranteed':'inserting')
    }catch(e){toast.error(e instanceof Error?e.message:'エラーが発生しました')}
    finally{setPaidFreeLoading(false);endDrawRequest()}
  }

  async function spinPaid(pullType:'single'|'eleven'){
    if(phase!=='idle'||paidBusy||!beginDrawRequest())return
    const amount=pullType==='eleven'?paidElevenPrice:paidSinglePrice
    if(!getPhantomProvider()){
      if(isMobileBrowser()){
        localStorage.setItem('inmu-pet-paid-gacha-intent',pullType)
        toast.info('Phantomアプリで開きます…')
        window.setTimeout(openInPhantomBrowser,400)
      }else toast.error('Phantomウォレットをインストールしてください')
      endDrawRequest()
      return
    }
    setPaidBusy(true)
    try{
      const txId=await sendInmuWithPhantom('Hatp1W4QCzr7GAVbnQqKTVW2BmX7sRaf7jeHJMvETeU4',amount,setPaidStatus)
      localStorage.setItem('inmu-pet-paid-gacha-pending',JSON.stringify({txId,pullType}))
      setPaidStatus('送金を確認しています…')
      await completePaidGacha(txId,pullType)
    }catch(error){toast.error(error instanceof Error?error.message:'INMUガチャに失敗しました')}
    finally{setPaidBusy(false);setPaidStatus('');endDrawRequest()}
  }

  useEffect(()=>{
    // Phantom拡張機能の注入は非同期のため、マウント直後は getPhantomProvider() が
    // まだ null を返すことがある。以前はこの判定に引っかかって「送金済みだが
    // 未確定のガチャ」の復旧処理自体がスキップされてしまい、送金は成功して
    // サーバー側では抽選済みなのに画面には何も表示されないまま終わる不具合があった。
    // 復旧処理（completePaidGacha）自体はPhantomを必要としない（txIdのみで完結する）ため、
    // Phantom検出とは切り離して常に実行する。
    if(paidBusy)return
    const pendingRaw=localStorage.getItem('inmu-pet-paid-gacha-pending')
    if(pendingRaw){
      try{
        const pending=JSON.parse(pendingRaw) as {txId:string;pullType:'single'|'eleven'}
        setPaidBusy(true)
        void completePaidGacha(pending.txId,pending.pullType)
          .catch(error=>toast.error(error instanceof Error?error.message:'送金済みガチャの復旧に失敗しました。ページを再読み込みすると再度確認されます'))
          .finally(()=>setPaidBusy(false))
      }catch{localStorage.removeItem('inmu-pet-paid-gacha-pending')}
    }

    let cancelled=false
    let attempts=0
    const checkIntent=()=>{
      if(cancelled)return
      const intent=localStorage.getItem('inmu-pet-paid-gacha-intent') as 'single'|'eleven'|null
      if(!intent)return
      if(getPhantomProvider()){
        localStorage.removeItem('inmu-pet-paid-gacha-intent')
        setGachaMode('paid')
        return
      }
      attempts+=1
      if(attempts<20)window.setTimeout(checkIntent,300)
    }
    checkIntent()
    return ()=>{cancelled=true}
  },[])

  async function spinTdnReroll(){
    if(phase!=='done'||!result?.tdnReroll||tdnRerollBusy||!beginDrawRequest())return
    setTdnRerollBusy(true)
    try{
      const res=await fetch('/api/pet-gacha/tdn-reroll',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token:result.tdnReroll.token}),
      })
      const data=await res.json().catch(()=>({})) as Result&{error?:string}
      if(!res.ok)throw new Error(data.error??'再抽選に失敗しました')
      const hasCharacter=data.results.some(prize=>prize.type==='character')
      const normalized:Result={...data,hasInmu:Boolean(data.hasInmu),wasGuaranteed:Boolean(data.wasGuaranteed||hasCharacter),tdnReroll:null}
      setResult(normalized)
      setPts(normalized.newPoints)
      setPaidPity(Number(normalized.paidPity??paidPity))
      setRevIdx(0)
      setNewCharacterRevealIndex(0)
      setJackpotSeen(false)
      void loadFreeStatus()
      void loadPaidFreeStatus()
      void loadCommerceStatus()
      setPhase(normalized.wasGuaranteed?'guaranteed':'inserting')
    }catch(e){toast.error(e instanceof Error?e.message:'再抽選に失敗しました')}
    finally{setTdnRerollBusy(false);endDrawRequest()}
  }

  const reset=()=>{clr();setPhase('idle');setResult(null);setRevIdx(0);setNewCharacterRevealIndex(0);setJackpotSeen(false);loadPts();loadHist();loadFreeStatus();loadPaidFreeStatus();loadCommerceStatus();void loadInmuBalance(false)}
  const isMulti=(result?.results.length??0)>1
  const characterAnimationPrize=result?.results.find(prize=>prize.type==='character')
  const inmuAnimationPrize=result?.results.find(prize=>prize.prizeId==='inmu10k')
  const animationPrize=characterAnimationPrize??inmuAnimationPrize??result?.results[0]
  const animationPrizeId=capsuleIdForPrize(animationPrize,result)
  const isInmuGuaranteed=animationPrize?.prizeId==='inmu10k'

  const newCharacters=result?.results.filter(prize=>prize.type==='character'&&prize.isNewCharacter)??[]
  const newCharacter=newCharacters[newCharacterRevealIndex]
  if(phase==='done'&&newCharacter){
    return <NewPetCharacterScreen prize={newCharacter} profile={profile} unread={unread} onClose={()=>{
      if(isMulti)setNewCharacterRevealIndex(index=>index+1)
      else reset()
    }}/>
  }

  /* 笊絶武笊絶武 JACKPOT SCREEN 笊絶武笊絶武 */
  if(phase==='done'&&result?.hasInmu&&!jackpotSeen){
    return <JackpotScreen pts={pts} onReset={isMulti?()=>setJackpotSeen(true):reset} profile={profile} unread={unread} />
  }

  /* 笊絶武笊絶武 IDLE SCREEN 笊絶武笊絶武 */
  if(phase==='idle'&&gachaMode==='paid')return(
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>
      <PageBg>
        <div style={{display:'flex',flexDirection:'column',minHeight:'100%',paddingBottom:'max(20px,env(safe-area-inset-bottom))'}}>
          <GachaModeTabs mode={gachaMode} onChange={setGachaMode} disabled={paidBusy}/>
          <div style={{margin:'8px 12px 0'}}>
            <AdSlot slotId="gacha-paid-banner-break" variant="banner" />
          </div>
          <div style={{margin:'6px 12px 0'}}><GachaBannerCarousel mode="paid" config={gachaConfig}/></div>
          <div style={{margin:'8px 12px 0'}}>
            <AdSlot slotId="gacha-paid-banner-bottom" variant="banner" />
          </div>
          <p style={{margin:'4px 12px 0',fontSize:9,lineHeight:1.4,color:'rgba(255,255,255,.4)',textAlign:'center'}}>※レベル報酬で得られる購入申請還元は最大10%までです。(各キャラ保持で上乗せし最大＋30%効果はあり)次回更新時に誤記変更予定。</p>
          <div style={{margin:'8px 12px 0'}}>
            <button type="button" onClick={()=>setRateModalOpen(true)} style={{width:'100%',padding:'8px 14px',border:'1px solid rgba(218,165,32,.5)',borderRadius:8,background:'rgba(8,4,14,.7)',color:'#e8c65a',fontSize:11,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              排出率を見る <ChevronRight style={{width:14,height:14}}/>
            </button>
          </div>
          <div style={{margin:'8px 12px 0'}}>
            <button type="button" disabled={paidFreeUsed||paidFreeLoading||drawRequestBusy||phase!=='idle'} onClick={spinPaidFree} style={{width:'100%',padding:'10px 16px',border:`1.5px solid ${paidFreeUsed?'rgba(80,200,120,.2)':'rgba(80,200,120,.75)'}`,borderRadius:8,cursor:paidFreeUsed||paidFreeLoading||drawRequestBusy?'not-allowed':'pointer',background:paidFreeUsed?'linear-gradient(135deg,rgba(20,30,20,.92),rgba(16,24,16,.92))':'linear-gradient(135deg,rgba(20,80,40,.95),rgba(10,50,25,.95))',opacity:paidFreeUsed?0.6:1,position:'relative',overflow:'hidden',boxShadow:paidFreeUsed?'none':'0 4px 18px rgba(34,197,94,.35),inset 0 1px 0 rgba(255,255,255,.15)',transition:'all .2s'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{textAlign:'left'}}>
                  <p style={{margin:0,fontSize:14,fontWeight:800,color:paidFreeUsed?'rgba(134,239,172,.45)':'rgba(134,239,172,.95)',letterSpacing:'0.04em'}}>{paidFreeLoading?'処理中…': paidFreeUsed?'本日の無料ガチャは使用済みです':`無料ガチャ（残り${paidFreeRemaining}回）`}</p>
                  {!paidFreeUsed&&paidFreeSharedRemaining>0&&<p style={{margin:0,fontSize:9,color:'rgba(134,239,172,.5)',marginTop:2}}>うち拓也共通ボーナス残り{paidFreeSharedRemaining}回</p>}
                  {paidFreeUsed&&paidFreeNextReset&&<p style={{margin:0,fontSize:9,color:'rgba(134,239,172,.35)',marginTop:2}}>リセット: {new Date(paidFreeNextReset).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>}
                  {!paidFreeUsed&&<p style={{margin:0,fontSize:9,color:'rgba(134,239,172,.55)',marginTop:2}}>ポイント消費なしでINMUガチャを引けます</p>}
                </div>
                {!paidFreeUsed&&<span style={{fontSize:18,color:'rgba(134,239,172,.8)'}}>›</span>}
              </div>
            </button>
          </div>
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'18px 18px 8px',textAlign:'center'}}>
            <div style={{width:'min(430px,100%)'}}>
              <InmuBalancePanel balance={inmuBalance} loading={inmuBalanceLoading}/>
            </div>
            <div style={{marginTop:18,width:'min(430px,100%)',padding:16,borderRadius:8,border:'1px solid rgba(218,165,32,.48)',background:'rgba(8,4,14,.82)',boxShadow:'0 14px 45px rgba(0,0,0,.42)'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#f3d97c'}}><span>30連キャラ確定まで</span><strong>{Math.max(0,PAID_GACHA_PITY_PULLS-paidPity)}回</strong></div>
              <div style={{height:6,marginTop:8,borderRadius:99,background:'rgba(255,255,255,.08)',overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(100,paidPity/PAID_GACHA_PITY_PULLS*100)}%`,background:'linear-gradient(90deg,#a855f7,#ffd700)',boxShadow:'0 0 12px #d8a900'}}/></div>
              <p style={{fontSize:10,color:'rgba(255,255,255,.45)',margin:'9px 0 0'}}>30回以内に対象キャラを獲得するとカウントはリセットされます</p>
            </div>
          </div>
          <div style={{padding:'10px 14px'}}>
            <p style={{textAlign:'center',fontSize:9,color:'rgba(255,255,255,.45)',margin:'0 0 8px'}}>※価格により必要INMU数が変動する場合があります(最大値は1連1万INMU/11連10万INMU)</p>
            {paidStatus&&<p style={{textAlign:'center',fontSize:11,color:'#8ee7ff',margin:'0 0 8px'}}>{paidStatus}</p>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <OrnateButton gold enabled={!paidBusy&&!drawRequestBusy} onClick={()=>spinPaid('single')} label={paidBusy||drawRequestBusy?'処理中…':'1連ガチャ'} price={`${paidSinglePrice.toLocaleString()} INMU`}/>
              <OrnateButton gold={false} enabled={!paidBusy&&!drawRequestBusy} onClick={()=>spinPaid('eleven')} label={paidBusy||drawRequestBusy?'処理中…':'11連ガチャ'} price={`${paidElevenPrice.toLocaleString()} INMU`}/>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginTop:12,color:'rgba(255,255,255,.38)',fontSize:9}}><LockKeyhole style={{width:12}}/>送金成功をサーバーで確認後に抽選します</div>
            <div style={{marginTop:10,border:'1px solid rgba(184,134,11,.35)',borderRadius:8,overflow:'hidden'}}>
              <p style={{margin:0,padding:'7px 10px',fontSize:11,fontWeight:800,color:'#e8c65a'}}>INMUガチャ履歴</p>
              {commerceHistory.filter(row=>row.gachaType==='paid').slice(0,3).map(row=><div key={row.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'6px 10px',borderTop:'1px solid rgba(184,134,11,.15)',fontSize:9,color:'rgba(255,255,255,.68)'}}><span>{row.pullType==='eleven'?'11連':'1連'}</span><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.results.map(prize=>prize.label).join(' / ')}</span><span>{new Date(row.createdAt).toLocaleDateString('ja-JP')}</span></div>)}
              {commerceHistory.filter(row=>row.gachaType==='paid').length===0&&<p style={{margin:0,padding:'8px 10px',fontSize:9,color:'rgba(255,255,255,.35)'}}>履歴はありません</p>}
            </div>
          </div>
        </div>
      </PageBg>
      <EmissionRateModal open={rateModalOpen} onClose={()=>setRateModalOpen(false)} config={gachaConfig}/>
    </AppShell>
  )

  if(phase==='idle') return (
    <AppShell isAdmin={profile?.role==='admin'} displayName={profile?.displayName??''} unread={unread}>
      <style>{CSS}</style>
      <PageBg>
        <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0,overflowY:'auto',overflowX:'hidden'}}>
          <GachaModeTabs mode={gachaMode} onChange={setGachaMode}/>
          <div style={{margin:'0 12px 8px'}}>
            <AdSlot slotId="gacha-points-banner-break" variant="banner" />
          </div>
          <div style={{margin:'6px 12px 10px'}}><GachaBannerCarousel mode="points" config={gachaConfig}/></div>
          <div style={{margin:'0 12px 8px'}}>
            <AdSlot slotId="gacha-points-banner-bottom" variant="banner" />
          </div>
          <p style={{margin:'-6px 12px 8px',fontSize:9,lineHeight:1.4,color:'rgba(255,255,255,.4)',textAlign:'center'}}>※レベル報酬で得られる購入申請還元は最大10%までです。(各キャラ保持で上乗せし最大＋30%効果はあり)次回更新時に誤記変更予定。</p>
          <div style={{margin:'0 12px 8px'}}>
            <button type="button" onClick={()=>setRateModalOpen(true)} style={{width:'100%',padding:'8px 14px',border:'1px solid rgba(218,165,32,.5)',borderRadius:8,background:'rgba(8,4,14,.7)',color:'#e8c65a',fontSize:11,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              排出率を見る <ChevronRight style={{width:14,height:14}}/>
            </button>
          </div>
          <div style={{flexShrink:0,background:'linear-gradient(to top,rgba(2,1,10,.99) 84%,transparent)',backdropFilter:'blur(16px)',padding:'6px 14px max(18px,calc(env(safe-area-inset-bottom)+10px))'}}>
            <button type="button" disabled={freeUsed||freeLoading||drawRequestBusy||phase!=='idle'} onClick={spinFree} style={{width:'100%',marginBottom:8,padding:'10px 16px',border:`1.5px solid ${freeUsed?'rgba(80,200,120,.2)':'rgba(80,200,120,.75)'}`,borderRadius:8,cursor:freeUsed||freeLoading||drawRequestBusy?'not-allowed':'pointer',background:freeUsed?'linear-gradient(135deg,rgba(20,30,20,.92),rgba(16,24,16,.92))':'linear-gradient(135deg,rgba(20,80,40,.95),rgba(10,50,25,.95))',opacity:freeUsed?0.6:1,position:'relative',overflow:'hidden',boxShadow:freeUsed?'none':'0 4px 18px rgba(34,197,94,.35),inset 0 1px 0 rgba(255,255,255,.15)',transition:'all .2s'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{textAlign:'left'}}>
                  <p style={{margin:0,fontSize:14,fontWeight:800,color:freeUsed?'rgba(134,239,172,.45)':'rgba(134,239,172,.95)',letterSpacing:'0.04em'}}>{freeLoading?'処理中…': freeUsed?'本日の無料ガチャは使用済みです':`無料ガチャ（残り${freeRemaining}回）`}</p>
                  {!freeUsed&&freeSharedRemaining>0&&<p style={{margin:0,fontSize:9,color:'rgba(134,239,172,.5)',marginTop:2}}>うち拓也共通ボーナス残り{freeSharedRemaining}回</p>}
                  {freeUsed&&freeNextReset&&<p style={{margin:0,fontSize:9,color:'rgba(134,239,172,.35)',marginTop:2}}>リセット: {new Date(freeNextReset).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</p>}
                  {!freeUsed&&<p style={{margin:0,fontSize:9,color:'rgba(134,239,172,.55)',marginTop:2}}>ポイント消費なしでポイントガチャを引けます</p>}
                </div>
                {!freeUsed&&<span style={{fontSize:18,color:'rgba(134,239,172,.8)'}}>›</span>}
              </div>
            </button>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <OrnateButton gold enabled={pts>=1000&&!ptsLoading&&!drawRequestBusy} onClick={()=>spin('single')} label={drawRequestBusy?'処理中…':'1連ガチャ'} price="1,000 pt"/>
              <OrnateButton gold={false} enabled={pts>=10000&&!ptsLoading&&!drawRequestBusy} onClick={()=>spin('multi')} label={drawRequestBusy?'処理中…':'10連ガチャ'} price="10,000 pt"/>
            </div>
            <PointsPanel pts={pts} loading={ptsLoading}/>
            <div style={{marginTop:7,background:'linear-gradient(135deg,rgba(12,6,2,.92),rgba(6,3,16,.92))',border:'1px solid rgba(184,134,11,.4)',borderRadius:10,backdropFilter:'blur(8px)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 12px 4px'}}>
                <span style={{fontSize:11,fontWeight:700,color:'rgba(218,165,32,.88)',letterSpacing:'0.08em'}}>ガチャ履歴</span>
              </div>
              <div style={{borderTop:'1px solid rgba(184,134,11,.15)'}}>
                {history.length===0 ? <p style={{textAlign:'center',fontSize:10,color:'rgba(255,255,255,.3)',padding:'6px 0',margin:0}}>ガチャ履歴がありません</p> : history.slice(0,3).map((row,i)=>{
                  const label=row.hasInmu?'10,000 INMUを獲得しました':row.totalPoints>0?`${row.totalPoints.toLocaleString()} ptを獲得しました`:`${row.costPoints.toLocaleString()}pt 消費`
                  const time=new Date(row.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})
                  return <div key={row.id} style={{display:'flex',alignItems:'center',padding:'5px 12px',borderBottom:i<Math.min(history.length-1,2)?'1px solid rgba(184,134,11,.1)':'none'}}><span style={{fontSize:9,color:'rgba(255,255,255,.5)',minWidth:60,flexShrink:0}}>{profile?.displayName??'ユーザー'}</span><span style={{fontSize:9,color:row.hasInmu?'#ffd700':'rgba(255,255,255,.7)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginLeft:4}}>{label}</span><span style={{fontSize:9,color:'rgba(255,255,255,.3)',flexShrink:0,marginLeft:6}}>{time}</span></div>
                })}
              </div>
            </div>
          </div>
        </div>
      </PageBg>
      <EmissionRateModal open={rateModalOpen} onClose={()=>setRateModalOpen(false)} config={gachaConfig}/>
    </AppShell>
  )

  /* ANIMATION + RESULT SCREENS */
  return (
    <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex',flexDirection:'column',
      background:'#02010a',overflow:'hidden'}}>
      <style>{CSS}</style>

      {/* Opening flash */}
      {openFlash&&<div style={{position:'fixed',inset:0,zIndex:9999,pointerEvents:'none',
        background:'radial-gradient(circle at 50% 42%,rgba(255,255,200,.92) 0%,rgba(218,165,32,.72) 36%,transparent 65%)',
        animation:'ga-goldflash .68s ease-out forwards'}}/>}

      <PageBg>
        <div style={{flex:1,display:'flex',flexDirection:'column',
          alignItems:'stretch',justifyContent:'stretch',padding:0,gap:0,
          position:'relative',minHeight:0,overflow:'hidden'}}>
          {phase==='lever'&&<GeneratedScene kind="lever" zIndex={70}/>}
          {phase==='space'&&<GeneratedScene kind="space" prizeId={animationPrizeId} zIndex={70}/>}
          {phase==='falling'&&<GeneratedScene kind="falling" prizeId={animationPrizeId} guaranteed={result?.wasGuaranteed} zIndex={70}/>}
          {phase==='opening'&&<GeneratedScene kind="opening" prizeId={animationPrizeId} guaranteed={result?.wasGuaranteed} zIndex={70}/>}

          {/* 笊絶武笊絶武 Phase 1: GUARANTEED 笊絶武笊絶武 */}
          {phase==='guaranteed'&&(
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',
              alignItems:'center',justifyContent:'center',gap:18,padding:'18px 0',
              background:'radial-gradient(ellipse at 50% 44%,rgba(218,165,32,.16),transparent 58%)'}}>
              <div style={{position:'relative',width:'100%',flex:1,minHeight:0,
                display:'flex',alignItems:'center',justifyContent:'center'}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{position:'absolute',top:'50%',left:'50%',
                    width:88+i*74,height:88+i*74,borderRadius:'50%',
                    border:`1px solid rgba(218,165,32,${.36-i*.1})`,
                    animation:`ga-ring 2s ease-out ${i*.5}s infinite`}}/>
                ))}
                <div style={{position:'relative',animation:'ga-popin .42s ease-out both, ga-floatslow 2s ease-in-out .4s infinite'}}>
                  <PrizeCapsule prizeId={animationPrizeId} size={190} showLabel={false}/>
                  <div style={{position:'absolute',inset:-28,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,244,150,.58),rgba(255,190,20,.22) 46%,transparent 70%)',filter:'blur(8px)',zIndex:-1}}/>
                </div>
              </div>
              <div className="ga-glow" style={{
                background:'rgba(24,10,0,.92)',border:'2px solid #daa520',
                borderRadius:22,padding:'14px 38px',textAlign:'center',backdropFilter:'blur(10px)'}}>
                <p style={{margin:0,fontWeight:900,fontSize:22,color:'#ffd700',letterSpacing:'0.08em',
                  textShadow:'0 0 28px rgba(255,215,0,.9)'}}>{isInmuGuaranteed?'INMU確定':'確定'}</p>
                <div style={{display:'flex',gap:9,justifyContent:'center',marginTop:8}}>
                  {['✦','✧','★','✧','✦'].map((s,i)=>(
                    <span key={i} style={{fontSize:18,color:'#ffd700',
                      animation:`ga-sparkle ${.5+i*.14}s ease-in-out ${i*.11}s infinite`}}>{s}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════ Phase 2: COIN INSERT  Emachine top close-up, coin falls into slot ════ */}
          {phase==='inserting'&&(
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',
              alignItems:'stretch',gap:0,width:'100%',height:'100%'}}>
              <p className="ga-pulse" style={{fontSize:16,fontWeight:800,color:'#daa520',
                letterSpacing:'0.22em',margin:0,textAlign:'center',padding:'14px 0 8px',
                position:'relative',zIndex:12}}>コイン投入</p>

              {/* Machine cropped to show only the top dome area */}
              <div style={{width:'100%',flex:1,minHeight:0,borderRadius:0,overflow:'hidden',
                position:'relative',
                background:'radial-gradient(ellipse at 50% 110%, rgba(218,165,32,.38) 0%, transparent 44%), #040101',
                border:'none',
                boxShadow:'inset 0 0 90px rgba(0,0,0,.9),0 0 32px rgba(0,0,0,.8)'}}>

                {/* Machine image  Eonly top portion visible */}
                <img src={machineImg} alt="" style={{
                  position:'absolute',
                  width:'min(520px,118vw)',
                  left:'50%',transform:'translateX(-50%)',
                  top:0,
                  opacity:.34,
                  filter:'drop-shadow(0 4px 32px rgba(0,0,0,.9))'}}/>

                {/* Focus vignette: spotlight on coin slot (~12% from machine top 竕・46px) */}
                <div style={{position:'absolute',inset:0,pointerEvents:'none',
                  background:'radial-gradient(ellipse 62% 38% at 50% 22%, transparent 0%, rgba(0,0,0,0) 36%, rgba(0,0,0,.78) 72%, rgba(0,0,0,.96) 100%)'}}/>

                {/* Coin slot golden glow */}
                <div style={{position:'absolute',left:'16%',top:'12%',width:'68%',height:'20%',
                  background:'radial-gradient(ellipse,rgba(218,165,32,.86) 0%,transparent 62%)',
                  animation:'ga-glowtext 1s ease-in-out infinite',pointerEvents:'none'}}/>

                {/* Ornate insertion mouth, made dominant so the scene reads differently from the old machine close-up */}
                <div style={{position:'absolute',left:'50%',bottom:24,transform:'translateX(-50%)',
                  width:'76%',height:96,zIndex:4,pointerEvents:'none'}}>
                  <div style={{position:'absolute',left:'50%',bottom:16,transform:'translateX(-50%)',
                    width:'100%',height:54,borderRadius:'50%',
                    background:'radial-gradient(ellipse at 50% 38%, rgba(0,0,0,.98) 0%, rgba(5,2,0,.96) 46%, rgba(95,54,0,.88) 64%, rgba(218,165,32,.9) 76%, rgba(255,224,92,.95) 84%, rgba(80,42,0,.92) 100%)',
                    border:'2px solid rgba(255,215,100,.82)',
                    boxShadow:'0 0 36px rgba(218,165,32,.78), inset 0 0 22px rgba(0,0,0,.9)'}}/>
                  <div style={{position:'absolute',left:'50%',bottom:35,transform:'translateX(-50%)',
                    width:'72%',height:28,borderRadius:'50%',
                    background:'radial-gradient(ellipse, rgba(0,0,0,1) 0%, rgba(0,0,0,.94) 58%, rgba(255,210,70,.2) 100%)',
                    boxShadow:'inset 0 0 18px rgba(0,0,0,1), 0 0 24px rgba(255,215,0,.48)'}}/>
                  {[0,1,2,3,4].map(i=>(
                    <div key={i} style={{position:'absolute',left:`${18+i*16}%`,bottom:38,
                      width:2,height:70+i%2*18,borderRadius:2,
                      background:'linear-gradient(0deg,rgba(255,230,130,.9),rgba(218,165,32,.38),transparent)',
                      filter:'blur(.4px)',animation:`ga-rayfall ${1.1+i*.08}s ease-in-out ${i*.12}s infinite`}}/>
                  ))}
                </div>

                {/* INMU coin  Efalls from above container into slot */}
                <img src={coinImg} style={{
                  position:'absolute',left:'50%',
                  width:136,height:136,borderRadius:'50%',objectFit:'cover',
                  border:'3.5px solid #daa520',
                  boxShadow:'0 0 68px rgba(218,165,32,.98),0 0 28px rgba(255,215,0,.65)',
                  animation:'ga-coininsert-full 1.52s cubic-bezier(.18,.76,.2,1) forwards',
                  zIndex:14,
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

              <p style={{fontSize:11,color:'rgba(218,165,32,.65)',margin:0,letterSpacing:'0.12em',
                textAlign:'center',padding:'8px 0 14px'}}>
                INMUコインを投入します
              </p>
            </div>
          )}

          {/* ════ Phase 3: LEVER  ECSS-only lever mechanism close-up ════ */}
          {false&&phase==='lever'&&(
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',
              alignItems:'stretch',gap:0,width:'100%',height:'100%'}}>
              <p className="ga-pulse" style={{fontSize:16,fontWeight:800,color:'#daa520',
                letterSpacing:'0.22em',margin:0,textAlign:'center',padding:'14px 0 8px',
                position:'relative',zIndex:12}}>レバー回転</p>
              <div style={{position:'absolute',left:'28%',top:'36%',width:260,height:160,zIndex:48,
                pointerEvents:'none',filter:'drop-shadow(0 0 34px rgba(255,190,50,.72)) drop-shadow(0 16px 24px rgba(0,0,0,.82))'}}>
                <div style={{position:'absolute',left:0,top:58,width:72,height:72,borderRadius:'50%',
                  background:'radial-gradient(circle at 35% 28%,#fff7c8 0%,#d8a01c 28%,#7a4500 66%,#160800 100%)',
                  border:'2px solid rgba(255,225,120,.55)',boxShadow:'inset -7px -7px 14px rgba(0,0,0,.55),0 0 24px rgba(218,165,32,.7)'}}/>
                <div style={{position:'absolute',left:36,top:92,transformOrigin:'0 50%',
                  animation:'ga-forelever 1.58s cubic-bezier(.2,.82,.18,1) forwards'}}>
                  <div style={{width:176,height:24,borderRadius:999,
                    background:'linear-gradient(180deg,#1b0b00 0%,#a96a00 22%,#fff0a0 48%,#d39a14 62%,#4a2500 100%)',
                    border:'1px solid rgba(255,230,140,.42)',
                    boxShadow:'inset 0 2px 2px rgba(255,255,220,.45),0 8px 18px rgba(0,0,0,.7)'}}/>
                  <div style={{position:'absolute',right:-48,top:-31,width:86,height:86,borderRadius:'50%',
                    background:'radial-gradient(circle at 30% 22%,#fff 0%,#fff0a8 8%,#f0b62b 30%,#9a5a00 62%,#210c00 100%)',
                    boxShadow:'inset -10px -10px 20px rgba(0,0,0,.56),0 0 48px rgba(255,202,54,.9),0 12px 22px rgba(0,0,0,.78)'}}>
                    <div style={{position:'absolute',top:15,left:18,width:20,height:11,borderRadius:'50%',
                      background:'rgba(255,255,255,.58)',transform:'rotate(-26deg)'}}/>
                  </div>
                </div>
              </div>

              <div style={{width:'100%',flex:1,minHeight:0,borderRadius:0,overflow:'hidden',
                position:'relative',
                background:'radial-gradient(ellipse at 72% 38%, rgba(108,69,9,.42) 0%, transparent 44%), linear-gradient(135deg,#010101 0%,#090603 46%,#1b1003 100%)',
                border:'none',
                boxShadow:'inset 0 1px 0 rgba(255,236,150,.12),inset 0 -34px 80px rgba(0,0,0,.86),inset 0 0 90px rgba(0,0,0,.75),0 0 34px rgba(0,0,0,.88)'}}>

                {/* Ambient gold glow around lever */}
                <div style={{position:'absolute',left:'18%',top:'8%',width:'72%',height:'72%',
                  background:'radial-gradient(ellipse,rgba(218,165,32,.22) 0%,rgba(120,72,0,.12) 38%,transparent 70%)',
                  animation:'ga-glow 1.4s ease-in-out infinite',pointerEvents:'none'}}/>
                <div style={{position:'absolute',inset:0,pointerEvents:'none',
                  background:'radial-gradient(ellipse at 50% 52%, transparent 0%, transparent 50%, rgba(0,0,0,.72) 100%)'}}/>

                {/* Dark machine face plate */}
                <div style={{position:'absolute',left:'17%',top:'17%',width:'43%',height:'64%',
                  borderRadius:18,
                  background:'linear-gradient(145deg,rgba(5,4,3,.98),rgba(26,17,6,.96) 52%,rgba(3,2,1,.98))',
                  border:'1px solid rgba(218,165,32,.34)',
                  boxShadow:'inset 0 2px 0 rgba(255,240,160,.08),inset -16px -12px 30px rgba(0,0,0,.78),8px 12px 30px rgba(0,0,0,.78)'}}/>
                {[{l:'20%',t:'20%'},{l:'53%',t:'20%'},{l:'20%',t:'74%'},{l:'53%',t:'74%'}].map((b,i)=>(
                  <div key={i} style={{position:'absolute',left:b.l,top:b.t,width:10,height:10,borderRadius:'50%',
                    background:'radial-gradient(circle at 30% 25%,#fff2a0 0%,#d5a526 28%,#5c3500 72%,#120800 100%)',
                    boxShadow:'0 0 8px rgba(218,165,32,.48), inset -2px -2px 3px rgba(0,0,0,.65)'}}/>
                ))}

                {/* ── LEVER ASSEMBLY (centered, 3D metallic quality) ── */}
                <div style={{position:'absolute',left:'41%',top:'7%',transform:'translateX(-50%)'}}>

                  {/* Cylindrical post  Edeep metallic gold gradient for 3D cylinder look */}
                  <div style={{
                    width:62,height:214,borderRadius:18,position:'relative',
                    background:'linear-gradient(90deg,#030100 0%,#150900 5%,#402300 13%,#8e5600 22%,#d49a22 32%,#fff1a8 42%,#c88710 52%,#7a4500 66%,#291300 84%,#050200 100%)',
                    boxShadow:'inset -11px 0 22px rgba(0,0,0,.78),inset 9px 0 12px rgba(255,238,150,.18),12px 0 34px rgba(0,0,0,.88),-2px 0 10px rgba(255,204,80,.16)'
                  }}>
                    <div style={{position:'absolute',left:-4,top:-6,width:70,height:22,borderRadius:'50%',
                      background:'radial-gradient(ellipse at 40% 28%,#fff0a8 0%,#d39b21 36%,#6b3a00 70%,#120700 100%)',
                      border:'1px solid rgba(255,224,120,.28)',
                      boxShadow:'0 4px 14px rgba(0,0,0,.66),inset 0 2px 2px rgba(255,255,220,.24)'}}/>
                    <div style={{position:'absolute',left:-4,bottom:-8,width:70,height:24,borderRadius:'50%',
                      background:'radial-gradient(ellipse at 40% 28%,#fce58e 0%,#c58413 38%,#593000 72%,#0b0400 100%)',
                      border:'1px solid rgba(255,224,120,.24)',
                      boxShadow:'0 8px 18px rgba(0,0,0,.72),inset 0 2px 2px rgba(255,255,220,.18)'}}/>
                    <div style={{position:'absolute',left:12,top:8,width:9,height:'92%',borderRadius:8,
                      background:'linear-gradient(180deg,rgba(255,255,220,.38),rgba(255,220,80,.12),rgba(255,255,220,.26))',
                      filter:'blur(.3px)'}}/>

                    {/* Decorative metallic bands on post */}
                    {[0,1,2,3].map(i=>(
                      <div key={i} style={{
                        position:'absolute',left:-10,top:25+i*47,width:82,height:20,
                        borderRadius:10,
                        background:'linear-gradient(180deg,#050200 0%,#3a2300 12%,#9a6407 28%,#e6b52d 40%,#fff1a6 50%,#d59a12 62%,#805000 78%,#241000 100%)',
                        border:'1px solid rgba(255,224,120,.2)',
                        boxShadow:'0 0 16px rgba(218,165,32,.55),0 4px 10px rgba(0,0,0,.76),inset 0 1px 0 rgba(255,255,200,.45)'
                      }}/>
                    ))}

                    {/* ── LEVER ARM (pivots from post top-right) ── */}
                    <div style={{
                      position:'absolute',top:24,left:'88%',
                      transformOrigin:'0px 14px',
                      animation:'ga-leverrot2 .92s ease-in-out .1s forwards'
                    }}>
                      <div style={{position:'absolute',left:-22,top:-17,width:58,height:58,borderRadius:'50%',
                        background:'radial-gradient(circle at 32% 25%,#fff6c7 0%,#dca72a 26%,#805100 62%,#160900 100%)',
                        border:'2px solid rgba(255,224,120,.45)',
                        boxShadow:'0 0 28px rgba(218,165,32,.7),0 8px 18px rgba(0,0,0,.74),inset -5px -5px 10px rgba(0,0,0,.55)'}}/>
                      {/* Arm rod  Ecylindrical tube */}
                      <div style={{
                        width:118,height:26,borderRadius:13,
                        background:'linear-gradient(180deg,#060200 0%,#2a1600 10%,#8f5b00 22%,#d8a21d 36%,#fff0a2 48%,#d19610 61%,#794500 78%,#160900 100%)',
                        border:'1px solid rgba(255,224,120,.25)',
                        boxShadow:'0 8px 26px rgba(0,0,0,.78),0 0 18px rgba(218,165,32,.32),inset 0 2px 2px rgba(255,255,220,.3)',position:'relative'
                      }}>
                        {/* Arm knob  E3D metallic sphere with specular highlight */}
                        <div style={{
                          position:'absolute',right:-43,top:-29,
                          width:84,height:84,borderRadius:'50%',
                          background:'radial-gradient(ellipse at 27% 21%,#ffffff 0%,#fff9df 6%,#ffe56a 16%,#d59b18 34%,#a26400 54%,#6b3a00 74%,#1c0b00 96%)',
                          boxShadow:'0 0 50px rgba(218,165,32,.94),0 10px 24px rgba(0,0,0,.82),inset -8px -8px 18px rgba(0,0,0,.62),inset 3px 3px 8px rgba(255,255,210,.42)'
                        }}>
                          {/* Sphere secondary highlight */}
                          <div style={{position:'absolute',top:14,left:17,width:18,height:10,borderRadius:'50%',background:'rgba(255,255,255,.48)',transform:'rotate(-30deg)'}}/>
                          <div style={{position:'absolute',top:28,left:28,width:8,height:5,borderRadius:'50%',background:'rgba(255,255,255,.24)',transform:'rotate(-25deg)'}}/>
                        </div>
                      </div>
                    </div>

                    {/* Bottom knob  Elarge 3D metallic sphere */}
                    <div style={{
                      position:'absolute',bottom:-34,left:'50%',transform:'translateX(-50%)',
                      width:86,height:86,borderRadius:'50%',
                      background:'radial-gradient(ellipse at 28% 22%,#ffffff 0%,#fff8df 6%,#ffe063 16%,#d59b17 34%,#a26400 56%,#6b3a00 75%,#1b0b00 96%)',
                      boxShadow:'0 0 38px rgba(218,165,32,.78),0 10px 24px rgba(0,0,0,.8),inset -8px -8px 18px rgba(0,0,0,.62),inset 3px 3px 8px rgba(255,255,210,.38)'
                    }}>
                      <div style={{position:'absolute',top:15,left:18,width:18,height:10,borderRadius:'50%',background:'rgba(255,255,255,.46)',transform:'rotate(-30deg)'}}/>
                      <div style={{position:'absolute',top:31,left:29,width:8,height:5,borderRadius:'50%',background:'rgba(255,255,255,.24)',transform:'rotate(-25deg)'}}/>
                    </div>
                  </div>

                  {/* Large rotation arrow  Ebold & glowing */}
                  <div style={{
                    position:'absolute',bottom:-58,right:-108,
                    fontSize:96,lineHeight:1,
                    color:'rgba(255,211,74,.82)',fontWeight:900,
                    textShadow:'0 0 26px rgba(218,165,32,.86),0 0 58px rgba(218,165,32,.45)',
                    transform:'scaleX(.86)'
                  }}>↷</div>
                </div>

                {/* Gold sparkles */}
                {[{l:'68%',t:'26%'},{l:'80%',t:'40%'},{l:'62%',t:'54%'},{l:'76%',t:'64%'}].map((p,i)=>(
                  <span key={i} style={{position:'absolute',left:p.l,top:p.t,
                    fontSize:14+i*2,color:'#ffd700',
                    textShadow:'0 0 14px rgba(255,215,0,.98)',
                    animation:`ga-sparkle ${.52+i*.18}s ease-in-out ${i*.14}s infinite`}}>✦</span>
                ))}
              </div>

              <p style={{fontSize:11,color:'rgba(218,165,32,.65)',margin:0,letterSpacing:'0.12em',
                textAlign:'center',padding:'8px 0 14px'}}>
                レバーを回すとガチャが動き出します
              </p>
            </div>
          )}

          {/* ════ Phase 4: SPACE  Ecosmic scene, beam from below, coins orbit, glass orb ════ */}
          {false&&phase==='space'&&(
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',
              alignItems:'stretch',gap:0,width:'100%',height:'100%'}}>
              <p className="ga-pulse" style={{fontSize:16,fontWeight:800,color:'#daa520',
                letterSpacing:'0.22em',margin:0,textAlign:'center',padding:'14px 0 8px',
                position:'relative',zIndex:12}}>カプセル排出</p>
              <div style={{position:'absolute',left:'50%',top:'58%',zIndex:48,pointerEvents:'none',
                animation:'ga-capportal 2.05s cubic-bezier(.18,.78,.24,1) forwards'}}>
                <CapsuleVisual prizeId={capsuleIdForPrize(result?.results[0],result)} size={170}/>
                <div style={{position:'absolute',inset:-30,borderRadius:'50%',
                  background:'radial-gradient(circle,rgba(255,230,100,.46),rgba(218,165,32,.16) 42%,transparent 70%)',
                  filter:'blur(8px)',animation:'ga-stageflash .8s ease-in-out infinite'}}/>
              </div>

              <div style={{width:'100%',flex:1,minHeight:0,borderRadius:0,overflow:'hidden',
                border:'none',position:'relative',
                background:'radial-gradient(ellipse at 50% 92%, rgba(218,165,32,.32) 0%, rgba(80,20,0,.62) 28%, rgba(24,4,60,.88) 55%, rgba(2,1,16,.99) 80%)',
                boxShadow:'inset 0 2px 0 rgba(255,255,255,.04),inset 0 0 90px rgba(0,0,0,.86),0 0 34px rgba(0,0,0,.82)'}}>

                {/* Stars */}
                {Array.from({length:26},(_,i)=>(
                  <div key={i} style={{position:'absolute',
                    left:`${(i*43.7+5)%88+4}%`,top:`${(i*61.3+11)%78+4}%`,
                    width:1+(i%4)*.7,height:1+(i%4)*.7,borderRadius:'50%',
                    background:`rgba(255,255,255,${.5+i%3*.24})`,
                    animation:`ga-particle ${1.6+i*.28}s ease-in-out ${i*.34}s infinite`}}/>
                ))}

                {/* Galaxy vortex at the capsule gate, matching the reference's cosmic discharge */}
                <div style={{position:'absolute',left:'50%',top:'15%',width:280,height:100,
                  transform:'translate(-50%,-50%)',zIndex:3,pointerEvents:'none'}}>
                  {[0,1,2,3].map(i=>(
                    <div key={i} style={{position:'absolute',left:'50%',top:'50%',
                      width:72+i*42,height:20+i*12,borderRadius:'50%',
                      border:`${1.5-i*.18}px solid rgba(${i%2?160:218},${i%2?72:165},${i%2?255:32},${.54-i*.08})`,
                      boxShadow:`0 0 ${18+i*5}px rgba(${i%2?160:218},${i%2?72:165},${i%2?255:32},${.42-i*.06})`,
                      animation:`ga-vortex ${4.6+i*.8}s linear ${i*.12}s infinite`}}/>
                  ))}
                  <div style={{position:'absolute',left:'50%',top:'50%',width:46,height:46,borderRadius:'50%',
                    transform:'translate(-50%,-50%)',
                    background:'radial-gradient(circle,#fff8c8 0%,rgba(255,215,0,.86) 18%,rgba(160,70,255,.4) 46%,transparent 70%)',
                    boxShadow:'0 0 38px rgba(255,215,0,.85),0 0 70px rgba(155,72,255,.46)',
                    animation:'ga-stageflash 1.2s ease-in-out infinite'}}/>
                </div>

                {/* ── Cone light beam  Ewide at ground, narrows going up ── */}
                {/* Outer soft cone */}
                <div style={{position:'absolute',bottom:0,left:'50%',transform:'translateX(-50%)',
                  width:'112%',height:'96%',zIndex:1,
                  background:'linear-gradient(0deg,rgba(218,165,32,.62) 0%,rgba(218,165,32,.36) 22%,rgba(180,140,10,.18) 50%,rgba(120,90,0,.06) 72%,transparent 88%)',
                  clipPath:'polygon(14% 100%, 86% 100%, 58% 0%, 42% 0%)',
                  filter:'blur(14px)'}}/>
                {/* Mid cone */}
                <div style={{position:'absolute',bottom:0,left:'50%',transform:'translateX(-50%)',
                  width:'82%',height:'94%',zIndex:1,
                  background:'linear-gradient(0deg,rgba(255,230,100,.78) 0%,rgba(255,200,50,.52) 20%,rgba(218,165,32,.26) 50%,rgba(160,120,0,.08) 72%,transparent 88%)',
                  clipPath:'polygon(22% 100%, 78% 100%, 56% 0%, 44% 0%)',
                  filter:'blur(7px)'}}/>
                {/* Bright core */}
                <div style={{position:'absolute',bottom:0,left:'calc(50% - 18px)',
                  width:36,height:'82%',zIndex:1,
                  background:'linear-gradient(0deg,rgba(255,255,200,.92) 0%,rgba(255,240,120,.68) 20%,rgba(218,165,32,.38) 55%,transparent 84%)'}}/>
                <div style={{position:'absolute',top:'18%',left:'calc(50% - 4px)',
                  width:8,height:'73%',zIndex:4,borderRadius:999,
                  background:'linear-gradient(180deg,rgba(255,255,220,.95),rgba(255,215,0,.68),transparent)',
                  filter:'blur(1px)',animation:'ga-stageflash 1.05s ease-in-out infinite'}}/>
                {/* Falling light needles */}
                {[-72,-48,-24,24,48,72].map((x,i)=>(
                  <div key={i} style={{position:'absolute',
                    left:`calc(50% + ${x}px)`,top:'8%',width:i%2?1:2,height:'74%',zIndex:3,
                    background:'linear-gradient(180deg,transparent 0%,rgba(255,235,145,.74) 36%,rgba(218,165,32,.5) 62%,transparent 100%)',
                    filter:'blur(.4px)',opacity:0,
                    animation:`ga-rayfall ${1.35+i*.08}s ease-in-out ${i*.12}s infinite`}}/>
                ))}

                {/* Orbiting INMU coins */}
                {[0,-0.65,-1.3,-1.95].map((delay,i)=>(
                  <div key={i} style={{
                    position:'absolute',left:'50%',top:'44%',zIndex:6,
                    animation:`ga-orbit ${2.6+i*.18}s linear ${delay}s infinite`}}>
                    <img src={coinImg} style={{
                      position:'absolute',left:52+i*10,top:-14,
                      width:28,height:28,borderRadius:'50%',objectFit:'cover',
                      border:`${i<2?2:1.5}px solid #daa520`,
                      boxShadow:`0 0 ${16+i*4}px rgba(218,165,32,${i<2?.9:.72})`}}/>
                  </div>
                ))}

                {/* Circular ground rings */}
                {[214,166,122].map((w,i)=>(
                  <div key={i} style={{position:'absolute',bottom:8-i*3,left:'50%',
                    transform:'translateX(-50%)',
                    width:w,height:Math.round(w*.17),borderRadius:'50%',
                    border:`${2.2-i*.6}px solid rgba(218,165,32,${.78-i*.2})`,
                    boxShadow:`0 0 ${24-i*5}px rgba(218,165,32,${.55-i*.12}),inset 0 0 ${12-i*3}px rgba(218,165,32,.2)`,
                    zIndex:2}}/>
                ))}

                {/* Ground glow pool */}
                <div style={{position:'absolute',bottom:0,left:'6%',width:'88%',height:48,
                  background:'radial-gradient(ellipse,rgba(255,200,0,.68) 0%,rgba(218,165,32,.32) 44%,transparent 70%)',
                  filter:'blur(9px)',zIndex:2}}/>

                {/* ── Amber glass orb materializes (warm golden glow) ── */}
                <div style={{position:'absolute',bottom:'22%',left:'50%',transform:'translateX(-50%)',
                  animation:'ga-reveal .7s ease-out .32s both',zIndex:8}}>
                  <div style={{position:'relative',width:122,height:122,borderRadius:'50%',
                    background:'radial-gradient(ellipse at 34% 28%, rgba(255,255,220,.92) 0%, rgba(255,220,100,.68) 22%, rgba(220,150,20,.44) 46%, rgba(140,80,0,.30) 68%, rgba(50,25,0,.52) 100%)',
                    border:'1.5px solid rgba(255,200,80,.44)',
                    boxShadow:'0 0 56px rgba(218,165,32,.88),0 0 28px rgba(255,180,0,.62),inset -4px -4px 16px rgba(80,40,0,.52),inset 4px 4px 10px rgba(255,240,120,.34)'}}>
                    {/* Specular highlight */}
                    <div style={{position:'absolute',top:9,left:13,width:24,height:14,borderRadius:'50%',
                      background:'rgba(255,255,255,.65)',transform:'rotate(-24deg)'}}/>
                    <div style={{position:'absolute',top:21,left:10,width:9,height:5,borderRadius:'50%',
                      background:'rgba(255,255,255,.4)',transform:'rotate(-18deg)'}}/>
                    {/* Inner amber glow */}
                    <div style={{position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',
                      width:40,height:20,borderRadius:'50%',
                      background:'rgba(255,180,0,.48)',filter:'blur(5px)'}}/>
                    {/* Mascot */}
                    <div style={{position:'absolute',inset:9,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <img src={mascotImg} style={{width:68,height:'auto',objectFit:'contain',
                        opacity:.82,filter:'drop-shadow(0 2px 8px rgba(80,40,0,.8))'}}/>
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

              <p style={{fontSize:11,color:'rgba(218,165,32,.65)',margin:0,textAlign:'center',
                letterSpacing:'0.12em',padding:'8px 0 14px'}}>
                宇宙のような神秘的な空間からカプセルが排出されます
              </p>
            </div>
          )}

          {/* ════ Phase 5: FALLING  Eglass orb falls through starfield, lands with shockwave ════ */}
          {false&&phase==='falling'&&(
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',
              alignItems:'stretch',gap:0,width:'100%',height:'100%'}}>
              <p className="ga-pulse" style={{fontSize:16,fontWeight:800,color:'#daa520',
                letterSpacing:'0.22em',margin:0,textAlign:'center',padding:'14px 0 8px',
                position:'relative',zIndex:12}}>カプセル落下</p>
              <div style={{position:'absolute',left:'50%',zIndex:48,pointerEvents:'none',
                animation:'ga-capdropfull 1.95s cubic-bezier(.22,.72,.18,1) forwards'}}>
                <CapsuleVisual prizeId={capsuleIdForPrize(result?.results[0],result)} size={190}/>
                <div style={{position:'absolute',inset:-26,borderRadius:'50%',
                  background:'radial-gradient(circle,rgba(255,240,140,.38),rgba(218,165,32,.18) 44%,transparent 72%)',
                  filter:'blur(8px)',animation:'ga-stageflash .9s ease-in-out infinite'}}/>
              </div>

              <div style={{width:'100%',flex:1,minHeight:0,borderRadius:0,overflow:'hidden',
                border:'none',position:'relative',
                background:'radial-gradient(ellipse at 50% 98%, rgba(218,165,32,.34) 0%, rgba(100,50,0,.48) 22%, transparent 46%), #010008',
                boxShadow:'inset 0 0 90px rgba(0,0,0,.86),0 0 32px rgba(0,0,0,.82)'}}>

                {/* Stars (more prominent here) */}
                {Array.from({length:32},(_,i)=>(
                  <div key={i} style={{position:'absolute',
                    left:`${(i*37.3+8)%86+5}%`,top:`${(i*53.8+14)%82+5}%`,
                    width:1+(i%4)*.8,height:1+(i%4)*.8,borderRadius:'50%',
                    background:`rgba(255,255,255,${.45+i%4*.18})`,
                    animation:`ga-particle ${1.8+i*.22}s ease-in-out ${i*.28}s infinite`}}/>
                ))}

                {/* Golden rain trails like the reference drop scene */}
                {Array.from({length:18},(_,i)=>(
                  <div key={i} style={{position:'absolute',
                    left:`${8+(i*17)%84}%`,top:`${-18-(i%5)*18}px`,
                    width:i%3===0?3:1.5,height:46+(i%4)*20,borderRadius:999,
                    background:'linear-gradient(180deg,transparent 0%,rgba(255,232,130,.92) 34%,rgba(218,165,32,.48) 70%,transparent 100%)',
                    filter:'blur(.45px)',opacity:0,
                    animation:`ga-goldrain ${1.2+(i%5)*.18}s ease-in-out ${i*.08}s infinite`}}/>
                ))}

                {/* Faint vertical light trails (speed lines) */}
                {[-86,-66,-38,0,38,66,86].map((x,i)=>(
                  <div key={i} style={{position:'absolute',
                    left:`calc(50% + ${x}px - 1px)`,top:0,
                    width:i===3?3:1.5,height:'100%',
                    background:'linear-gradient(180deg,transparent 0%,rgba(255,235,145,.26) 24%,rgba(218,165,32,.36) 58%,transparent 100%)',
                    opacity:i===3?.9:.62,
                    animation:`ga-rayfall ${1.1+i*.06}s ease-in-out ${i*.09}s infinite`}}/>
                ))}

                {/* Falling amber glass orb + mascot */}
                <div style={{position:'absolute',left:0,right:0,
                  display:'flex',justifyContent:'center',zIndex:8,
                  animation:'ga-capland 1.05s ease-in forwards'}}>
                  <div style={{position:'relative',width:138,height:138,borderRadius:'50%',
                    background:'radial-gradient(ellipse at 34% 28%, rgba(255,255,220,.94) 0%, rgba(255,220,100,.70) 22%, rgba(220,150,20,.46) 46%, rgba(140,80,0,.30) 68%, rgba(50,25,0,.54) 100%)',
                    border:'1.5px solid rgba(255,200,80,.46)',
                    boxShadow:'0 0 68px rgba(218,165,32,.92),0 0 32px rgba(255,180,0,.65),inset -5px -5px 18px rgba(80,40,0,.54),inset 4px 4px 12px rgba(255,240,120,.36)'}}>
                    {/* Specular highlight */}
                    <div style={{position:'absolute',top:11,left:15,width:28,height:16,borderRadius:'50%',
                      background:'rgba(255,255,255,.68)',transform:'rotate(-24deg)'}}/>
                    <div style={{position:'absolute',top:24,left:11,width:11,height:6,borderRadius:'50%',
                      background:'rgba(255,255,255,.42)',transform:'rotate(-18deg)'}}/>
                    {/* Inner amber glow */}
                    <div style={{position:'absolute',bottom:14,left:'50%',transform:'translateX(-50%)',
                      width:46,height:22,borderRadius:'50%',
                      background:'rgba(255,180,0,.5)',filter:'blur(5px)'}}/>
                    {/* Mascot inside */}
                    <div style={{position:'absolute',inset:11,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <img src={mascotImg} style={{width:80,height:'auto',objectFit:'contain',
                        opacity:.84,filter:'drop-shadow(0 2px 8px rgba(80,40,0,.8))'}}/>
                    </div>
                  </div>
                  {/* Star-burst impact rays radiating from base of orb */}
                  {Array.from({length:8},(_,i)=>(
                    <div key={i} style={{
                      position:'absolute',bottom:-4,left:'50%',
                      width:2,height:36+i%3*8,
                      background:'linear-gradient(0deg,rgba(255,200,0,.85) 0%,rgba(218,165,32,.55) 50%,transparent 100%)',
                      transform:`translateX(-50%) rotate(${i*45}deg)`,
                      transformOrigin:'50% 100%',
                      filter:'blur(.6px)',
                      animation:`ga-glowtext ${.7+i*.08}s ease-in-out ${i*.06}s infinite`}}/>
                  ))}
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
                <div style={{position:'absolute',bottom:18,left:'50%',transform:'translateX(-50%)',
                  width:130,height:20,borderRadius:'50%',
                  border:'2px solid rgba(255,215,0,.82)',
                  boxShadow:'0 0 22px rgba(255,215,0,.78), inset 0 0 14px rgba(218,165,32,.42)',
                  animation:'ga-stageflash 1s ease-in-out infinite'}}/>
                <div style={{position:'absolute',bottom:0,left:'50%',transform:'translateX(-50%)',
                  width:5,height:78,borderRadius:999,
                  background:'linear-gradient(0deg,rgba(255,215,0,.95),rgba(255,245,180,.78),transparent)',
                  filter:'blur(.6px)',animation:'ga-stageflash .9s ease-in-out infinite'}}/>

                {/* Impact sparkles */}
                {[{l:'32%',b:'6%'},{l:'68%',b:'4%'},{l:'42%',b:'10%'},{l:'58%',b:'8%'}].map((p,i)=>(
                  <div key={i} style={{position:'absolute',left:p.l,bottom:p.b,
                    fontSize:12,color:'#ffd700',
                    textShadow:'0 0 10px rgba(255,215,0,.9)',
                    animation:`ga-sparkle ${.5+i*.16}s ease-in-out ${.8+i*.12}s infinite`}}>✦</div>
                ))}
              </div>

              <p style={{fontSize:11,color:'rgba(218,165,32,.65)',margin:0,letterSpacing:'0.12em',
                textAlign:'center',padding:'8px 0 14px'}}>
                カプセルが下へ落ちていきます
              </p>
            </div>
          )}

          {/* 笊絶武笊絶武 Phase 6: OPENING 笊絶武笊絶武 */}
          {false&&phase==='opening'&&(
            <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',
              alignItems:'center',justifyContent:'center',gap:16,
              background:'radial-gradient(circle at 50% 42%,rgba(218,165,32,.18),transparent 58%)'}}>
              <p style={{fontSize:14,fontWeight:800,color:'#daa520',letterSpacing:'0.18em',margin:0,
                position:'relative',zIndex:52,
                animation:'ga-glowtext 1.1s ease-in-out infinite'}}>カプセル開封中…</p>
              <div style={{position:'relative',height:'min(72vw,360px)',width:'min(72vw,360px)',
                zIndex:52,
                animation:'ga-capopenfore .8s ease-out forwards',
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
                <ResultCapsuleReveal prizeId={capsuleIdForPrize(result?.results[0],result)} size={230}/>
              </div>
            </div>
          )}

          {/* 笊絶武笊絶武 DONE: Single result 笊絶武笊絶武 */}
          {phase==='done'&&result&&!isMulti&&(
            <div className="ga-reveal" style={{
              position:'absolute',inset:0,display:'flex',flexDirection:'column',
              alignItems:'center',justifyContent:'center',gap:14,width:'100%',
              padding:'56px 18px 20px',
              overflow:'hidden',
              zIndex:120,
              pointerEvents:'auto',
              background:'radial-gradient(circle at 50% 28%,rgba(255,215,0,.24),transparent 32%),radial-gradient(ellipse at 50% 91%,rgba(218,165,32,.28),rgba(68,25,0,.28) 34%,rgba(0,0,8,.96) 74%),#02010a'}}>
              <div style={{position:'absolute',left:'50%',top:'16%',bottom:0,width:46,
                transform:'translateX(-50%)',
                background:'linear-gradient(180deg,transparent,rgba(255,215,0,.58),rgba(255,245,180,.82),rgba(255,215,0,.46),transparent)',
                filter:'blur(2px)',animation:'ga-stageflash 1.2s ease-in-out infinite'}}/>
              {[250,190,132].map((w,i)=>(
                <div key={i} style={{position:'absolute',bottom:34-i*6,left:'50%',
                  transform:'translateX(-50%)',width:w,height:w*.17,borderRadius:'50%',
                  border:`${2.2-i*.5}px solid rgba(255,215,0,${.72-i*.16})`,
                  boxShadow:`0 0 ${24-i*5}px rgba(218,165,32,${.54-i*.11})`}}/>
              ))}
              {Array.from({length:30},(_,i)=>(
                <div key={i} style={{position:'absolute',
                  left:`${(i*37+5)%92}%`,top:`${(i*53+9)%86}%`,
                  width:1+(i%5)*.7,height:1+(i%5)*.7,borderRadius:'50%',
                  background:i%4===0?'rgba(255,255,255,.9)':'rgba(255,215,0,.82)',
                  boxShadow:'0 0 12px rgba(255,215,0,.72)',
                  animation:`ga-cutstar ${1.4+(i%6)*.16}s ease-in-out ${i*.08}s infinite`}}/>
              ))}
              {result.wasGuaranteed&&(
                <p style={{fontSize:12,fontWeight:700,color:'#ffd700',margin:0,
                  animation:'ga-glowtext 1.5s ease-in-out infinite'}}>★ 確定演出が発動しました！</p>
              )}
              {result.results.map((prize)=>{
                const c=CAPSULE[prize.prizeId]??CAPSULE.pts300
                return (
                  <div key={prize.prizeId} style={{width:'100%',display:'flex',
                    flexDirection:'column',alignItems:'center',gap:14,position:'relative',zIndex:2}}>
                    <div style={{position:'relative'}}>
                      <ResultCapsuleReveal prizeId={capsuleIdForPrize(prize,result)} size={230}/>
                      {prize.prizeId==='inmu10k'&&(
                        <div style={{position:'absolute',inset:-18,borderRadius:'50%',
                          background:`radial-gradient(circle,${c.glow} 0%,transparent 65%)`,
                          animation:'ga-glow 1.1s ease-in-out infinite',pointerEvents:'none'}}/>
                      )}
                    </div>
                    {/* Prize panel */}
                    <div style={{width:'100%',textAlign:'center',
                      background:'linear-gradient(135deg,rgba(10,5,2,.82),rgba(6,3,18,.88))',
                      border:`1.5px solid ${c.border}`,borderRadius:12,
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
                      {(prize.type==='character'||prize.type==='premium_food'||prize.type==='sleep_tea')
                        ? <div style={{display:'flex',justifyContent:'center'}}><PrizeResultIcon prize={prize} size={82}/></div>
                        : <img src={mascotImg} style={{width:52,height:'auto',objectFit:'contain',filter:'drop-shadow(0 4px 10px rgba(0,0,0,.7))',animation:'ga-bounce 1.1s ease-in-out infinite'}}/>}
                    </div>
                  </div>
                )
              })}
              <button type="button" disabled={Boolean(result.tdnReroll)&&tdnRerollBusy} onPointerDown={(event)=>event.stopPropagation()} onClick={(event)=>{event.stopPropagation();result.tdnReroll?void spinTdnReroll():reset()}} style={{
                position:'relative',
                zIndex:50,
                border:result.tdnReroll?'1px solid rgba(80,220,255,.7)':'1px solid rgba(218,165,32,.55)',
                borderRadius:12,
                padding:'12px 24px',
                background:result.tdnReroll?'linear-gradient(135deg,rgba(7,64,88,.95),rgba(12,24,46,.95))':'linear-gradient(135deg,rgba(55,34,9,.92),rgba(16,10,4,.92))',
                color:result.tdnReroll?'#9eeeff':'#ffd700',
                fontWeight:900,
                letterSpacing:'0.04em',
                boxShadow:result.tdnReroll?'0 0 24px rgba(34,211,238,.28)':'0 0 22px rgba(218,165,32,.22)',
                cursor:tdnRerollBusy?'wait':'pointer',
                pointerEvents:'auto',
                WebkitTapHighlightColor:'transparent',
                opacity:tdnRerollBusy ? .7 : 1,
              }}>
                {result.tdnReroll ? (tdnRerollBusy ? '処理中…' : 'もう一度引く') : '\u30ac\u30c1\u30e3\u753b\u9762\u3078\u623b\u308b'}
              </button>
            </div>
          )}

          {/* ════ DONE: Multi result (10連) ════ */}
          {phase==='done'&&result&&isMulti&&(
            <div className="ga-reveal" style={{
              position:'absolute',inset:0,display:'flex',flexDirection:'column',
              justifyContent:'flex-start',gap:8,width:'100%',padding:'38px 10px 14px',
              overflowY:'auto',overflowX:'hidden',
              boxSizing:'border-box',
              border:'1px solid rgba(218,165,32,.45)',
              boxShadow:'inset 0 0 0 1px rgba(255,215,0,.12)',
              background:'radial-gradient(circle at 50% 10%,rgba(255,215,0,.18),transparent 26%),radial-gradient(ellipse at 50% 90%,rgba(218,165,32,.18),rgba(0,0,8,.96) 62%),#02010a'}}>
              <div style={{position:'absolute',inset:8,border:'1px solid rgba(218,165,32,.32)',
                pointerEvents:'none'}}/>
              <div style={{position:'relative',zIndex:2}}>
                <h2 style={{margin:0,fontFamily:'Georgia,serif',fontSize:26,letterSpacing:'0.08em',
                  color:'#daa520',textShadow:'0 0 20px rgba(218,165,32,.46)'}}>INMU GACHA</h2>
                <p style={{margin:'4px 0 0',fontSize:14,color:'rgba(255,255,255,.68)'}}>
                  所持: <b style={{color:'#ffd700'}}>{result.newPoints.toLocaleString()} pt</b>
                </p>
              </div>
              {result.wasGuaranteed&&(
                <p style={{fontSize:12,fontWeight:700,color:'#ffd700',textAlign:'center',margin:0}}>
                  ★ 確定演出が発動しました！
                </p>
              )}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:'8px 4px',
                width:'100%',position:'relative',zIndex:2,boxSizing:'border-box'}}>
                {result.results.map((prize,i)=>{
                  const c=CAPSULE[prize.prizeId]??CAPSULE.pts300
                  return (
                    <div key={i} style={{display:'flex',flexDirection:'column',
                      alignItems:'center',gap:3,
                      opacity:i<revIdx?1:0,
                      animation:i<revIdx?'ga-card .3s ease-out forwards':'none',
                      position:'relative',minWidth:0,overflow:'visible'}}>
                      <div style={{width:22,height:22,borderRadius:'50%',
                        display:'flex',alignItems:'center',justifyContent:'center',
                        background:'radial-gradient(circle at 35% 25%,#fff2a0,#daa520 42%,#7b4300 100%)',
                        color:'#160900',fontSize:11,fontWeight:900,
                        boxShadow:'0 0 14px rgba(218,165,32,.55)'}}>
                        {i+1}
                      </div>
                      <div style={{position:'absolute',top:29,left:'50%',transform:'translateX(-50%)',
                        width:54,height:54,borderRadius:'50%',
                        background:`radial-gradient(circle,${c.glow} 0%,transparent 64%)`,
                        opacity:prize.prizeId==='inmu10k' ? .55 : .24,
                        filter:'blur(2px)',pointerEvents:'none'}}/>
                      <PrizeResultIcon prize={prize} size={52}/>
                      <p style={{fontSize:7,fontWeight:800,color:c.border,
                        margin:0,textAlign:'center',lineHeight:1.2}}>
                        {c.label}
                      </p>
                    </div>
                  )
                })}
              </div>
              {result.totalPoints>0&&(
                <p style={{margin:0,fontSize:20,color:'#ffd700',textAlign:'center',fontWeight:900,
                  position:'relative',zIndex:2,
                  textShadow:'0 0 22px rgba(255,215,0,.75)'}}>
                  合計 +{result.totalPoints.toLocaleString()} pt 獲得！
                </p>
              )}
              <div style={{position:'absolute',right:8,bottom:4,zIndex:3,pointerEvents:'none'}}>
                <img src={mascotImg} style={{width:54,height:'auto',objectFit:'contain',
                  filter:'drop-shadow(0 4px 12px rgba(0,0,0,.7))',
                  animation:'ga-bounce 1s ease-in-out infinite'}}/>
              </div>
              <button type="button" disabled={Boolean(result.tdnReroll)&&tdnRerollBusy} onClick={()=>result.tdnReroll?void spinTdnReroll():reset()} style={{
                marginTop:8,padding:'8px 32px',borderRadius:8,
                background:result.tdnReroll?'linear-gradient(135deg,rgba(7,64,88,.95),rgba(12,24,46,.95))':'rgba(255,255,255,.12)',
                border:result.tdnReroll?'1px solid rgba(80,220,255,.7)':'1px solid rgba(218,165,32,.45)',
                color:result.tdnReroll?'#9eeeff':'#ffd700',fontSize:14,fontWeight:700,cursor:tdnRerollBusy?'wait':'pointer',
                position:'relative',zIndex:4,letterSpacing:'0.06em',
                backdropFilter:'blur(4px)',
                boxShadow:result.tdnReroll?'0 0 20px rgba(34,211,238,.25)':undefined,
                opacity:tdnRerollBusy ? .7 : 1,
              }}>{result.tdnReroll ? (tdnRerollBusy ? '処理中…' : 'もう一度引く') : 'もどる'}</button>
            </div>
          )}

        </div>
      </PageBg>
    </div>
  )
}

/* ════ JACKPOT SCREEN (10,000 INMU) ════ */
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
      setTimeout(()=>setFlash(false),700),
      setTimeout(()=>setStep(1),280),
      setTimeout(()=>setStep(2),900),
      setTimeout(()=>setStep(3),1800),
    ]
    return()=>ts.forEach(clearTimeout)
  },[])

  return (
    <div style={{position:'fixed',inset:0,zIndex:9000,display:'flex',flexDirection:'column',
      background:'#02010a',overflow:'hidden'}}>
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
                {'\u25c6 JACKPOT !! \u25c6'}
              </h1>
              <div style={{display:'flex',justifyContent:'center',gap:9,marginTop:5}}>
                {['\u2726', '\u2727', '\u2605', '\u2727', '\u2726'].map((s,i)=>(
                  <span key={i} style={{fontSize:20,color:'#ffd700',
                    animation:`ga-sparkle ${.68+i*.17}s ease-in-out ${i*.13}s infinite`}}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Step 2+: 10,000 INMU display */}
          {step>=2&&(
            <div className="ga-reveal" style={{textAlign:'center',
              background:'linear-gradient(135deg,rgba(26,12,2,.96),rgba(36,20,4,.96))',
              border:'2px solid rgba(218,165,32,.72)',borderRadius:22,
              padding:'16px 28px',backdropFilter:'blur(10px)',
              boxShadow:'inset 0 1px 0 rgba(255,255,255,.12),0 0 44px rgba(218,165,32,.38)'}}>
              <p style={{margin:0,fontWeight:900,fontSize:22,color:'#ffd700',letterSpacing:'0.04em',
                textShadow:'0 0 28px rgba(255,215,0,.95)'}}>
                おめでとうございます！
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

          {/* Step 2+: Points counter */}
          {step>=2&&(
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

          {/* Step 3: Back button */}
          {step>=3&&(
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
    </div>
  )
}
