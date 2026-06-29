import type { ElementType, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { PET_BY_ID, PET_DEFINITIONS, type PetDefinition, type PetExpression, type PetId } from '@/features/pet/pet-data'
import { getActionCooldownRemaining, getCareCooldownRemaining, PET_CARE_CONFIG, usePetState, type PetCareAction, type PetCareCategory, type PetStats, type PremiumFoodState } from '@/features/pet/use-pet-state'
import {
  BookOpen, CircleDollarSign, Coins, Crown, Dumbbell, Gamepad2, Gem,
  Gift, Glasses, Hand, Heart, Leaf, LockKeyhole, Moon, PawPrint, Sparkles, Utensils,
} from 'lucide-react'

const ROOM_ACTIONS: Array<{ id: PetCareCategory; label: string; icon: ElementType; tone: string }> = [
  { id: 'feed', label: 'ご飯', icon: Utensils, tone: 'border-pink-400/50 text-pink-200 shadow-[0_0_18px_rgba(244,114,182,.12)]' },
  { id: 'play', label: '遊ぶ', icon: Gamepad2, tone: 'border-amber-300/50 text-amber-200 shadow-[0_0_18px_rgba(252,211,77,.12)]' },
]

const ACTIVE_PETS_STORAGE_KEY = 'inmu-portal:pet-active-slots:v1'
const USER_VISIBLE_PET_IDS = new Set<PetId>(['inmu-festival'])

const PET_ROOM_CSS = `
  @keyframes pet-meter-shine {
    0% { transform: translateX(-180%) skewX(-18deg); opacity: 0; }
    18% { opacity: .85; }
    55%, 100% { transform: translateX(420%) skewX(-18deg); opacity: 0; }
  }
  @keyframes pet-neon-breathe {
    0%, 100% { filter: brightness(.9); opacity: .72; }
    50% { filter: brightness(1.2); opacity: 1; }
  }
  @keyframes pet-room-enter {
    0% { opacity: 0; transform: scale(1.025); filter: blur(5px); }
    100% { opacity: 1; transform: scale(1); filter: blur(0); }
  }
  @keyframes pet-room-drift {
    0%, 100% { transform: translate3d(-2%, 2%, 0); opacity: .22; }
    50% { transform: translate3d(3%, -4%, 0); opacity: .5; }
  }
  @keyframes pet-room-sway {
    0%, 100% { transform: rotate(-2deg); }
    50% { transform: rotate(2deg); }
  }
  @keyframes pet-room-fire {
    0%, 100% { transform: scale(.92, 1.05); opacity: .55; }
    45% { transform: translateY(-3px) scale(1.08, .9); opacity: .9; }
  }
  @keyframes pet-room-speaker {
    0% { transform: scale(.65); opacity: .65; }
    100% { transform: scale(1.65); opacity: 0; }
  }
  @keyframes pet-idle-float {
    0%, 100% { transform: translate3d(-4px, 0, 0) rotate(-.35deg); }
    35% { transform: translate3d(3px, -8px, 0) rotate(.2deg); }
    70% { transform: translate3d(5px, -3px, 0) rotate(.35deg); }
  }
  @keyframes pet-react-feed {
    0% { transform: translateY(0) scale(1); }
    28% { transform: translateY(-18px) scale(1.04,.97); }
    52% { transform: translateY(0) scale(.98,1.03); }
    72% { transform: translateY(-7px) scale(1.02,.99); }
    100% { transform: translateY(0) scale(1); }
  }
  @keyframes pet-react-play {
    0% { transform: translate3d(0,0,0) rotate(0); }
    22% { transform: translate3d(-18px,-22px,0) rotate(-3deg); }
    50% { transform: translate3d(18px,-8px,0) rotate(3deg); }
    75% { transform: translate3d(-6px,-16px,0) rotate(-1deg); }
    100% { transform: translate3d(0,0,0) rotate(0); }
  }
  @keyframes pet-react-pet {
    0%, 100% { transform: translateY(0) rotate(0); }
    30% { transform: translateY(-8px) rotate(-1.5deg); }
    65% { transform: translateY(-5px) rotate(1deg); }
  }
  @keyframes pet-react-angry {
    0% { transform: translateX(0) rotate(0); }
    20% { transform: translateX(-13px) rotate(-2deg); }
    35% { transform: translateX(-5px) rotate(1deg); }
    52% { transform: translateX(-16px) rotate(-1deg); }
    100% { transform: translateX(-12px) rotate(0); }
  }
  @keyframes pet-sleep-breathe {
    0%, 100% { transform: translateY(2px) scale(1,.98); }
    50% { transform: translateY(0) scale(1.015,1); }
  }
  @keyframes pet-zzz {
    0% { transform: translate3d(0,8px,0) scale(.8); opacity: 0; }
    30% { opacity: 1; }
    100% { transform: translate3d(12px,-25px,0) scale(1.15); opacity: 0; }
  }
  @keyframes pet-speech-pop {
    0% { opacity: 0; transform: translate(-50%, 7px) scale(.94); }
    12%, 82% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -4px) scale(.98); }
  }
  .pet-meter-shine { animation: pet-meter-shine 3.1s ease-in-out infinite; }
  .pet-neon-sign { animation: pet-neon-breathe 3.8s ease-in-out infinite; }
  .pet-room-enter { animation: pet-room-enter .7s ease-out both; }
  .pet-room-drift { animation: pet-room-drift 7s ease-in-out infinite; }
  .pet-room-sway { animation: pet-room-sway 3.6s ease-in-out infinite; transform-origin: 50% 0; }
  .pet-room-fire { animation: pet-room-fire 1.25s ease-in-out infinite; transform-origin: 50% 100%; }
  .pet-room-speaker { animation: pet-room-speaker 1.8s ease-out infinite; }
  .pet-character-motion { animation: pet-idle-float 6.8s ease-in-out infinite; transform-origin: 50% 90%; }
  .pet-react-feed { animation: pet-react-feed 1.35s ease-out both; }
  .pet-react-play { animation: pet-react-play 1.55s ease-in-out both; }
  .pet-react-pet { animation: pet-react-pet 1.35s ease-in-out both; }
  .pet-react-angry { animation: pet-react-angry 1.55s ease-out both; }
  .pet-sleeping-motion { animation: pet-sleep-breathe 3.4s ease-in-out infinite; transform-origin: 50% 90%; }
  .pet-zzz { animation: pet-zzz 2.3s ease-out infinite; }
  .pet-speech-bubble { animation: pet-speech-pop 4.2s ease-in-out both; }
  @media (prefers-reduced-motion: reduce) {
    .pet-meter-shine, .pet-neon-sign, .pet-character-motion, .pet-react-feed, .pet-react-play, .pet-react-pet, .pet-react-angry, .pet-sleeping-motion, .pet-zzz, .pet-speech-bubble, .pet-room-enter, .pet-room-drift, .pet-room-sway, .pet-room-fire, .pet-room-speaker { animation: none; }
  }
`

function formatCooldown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `あと${minutes}分${String(seconds).padStart(2, '0')}秒`
}

type WalkMotion = {
  active: boolean
  moving: boolean
  frame: 0 | 1
  offsetPercent: number
  facing: 1 | -1
  bob: number
  stride: number
}

type ReactionMotion = 'feed' | 'play' | 'pet' | 'angry' | null

function getWalkMotion(tick: number, enabled: boolean, distancePercent = 18): WalkMotion {
  if (!enabled) return { active: false, moving: false, frame: 0, offsetPercent: 0, facing: 1, bob: 0, stride: 0 }
  const step = tick % 30
  if (step <= 8) {
    const frame = step % 2 as 0 | 1
    return { active: true, moving: true, frame, offsetPercent: -distancePercent + (distancePercent * 2 * step) / 8, facing: -1, bob: frame ? -5 : 1, stride: frame ? 1 : -1 }
  }
  if (step <= 13) return { active: true, moving: false, frame: 0, offsetPercent: distancePercent, facing: -1, bob: 0, stride: 0 }
  if (step <= 22) {
    const walkingStep = step - 14
    const frame = walkingStep % 2 as 0 | 1
    return { active: true, moving: true, frame, offsetPercent: distancePercent - (distancePercent * 2 * walkingStep) / 8, facing: 1, bob: frame ? -5 : 1, stride: frame ? 1 : -1 }
  }
  return { active: true, moving: false, frame: 0, offsetPercent: -distancePercent, facing: 1, bob: 0, stride: 0 }
}

function pickRandom<T>(items: readonly T[]): T | undefined {
  return items.length > 0 ? items[Math.floor(Math.random() * items.length)] : undefined
}

function StatusBar({
  label,
  value,
  max = 100,
  display,
  icon,
  color,
}: {
  label: string
  value: number
  max?: number
  display?: string
  icon: ReactNode
  color: string
}) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center justify-between gap-1 text-[10px] sm:text-xs">
        <span className="flex items-center gap-1 font-semibold text-foreground/85">{icon}{label}</span>
        <span className="font-mono text-muted-foreground">{display ?? value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/55 shadow-[inset_0_1px_3px_rgba(0,0,0,.75)]">
        <div className="relative h-full overflow-hidden rounded-full shadow-[0_0_10px_currentColor]" style={{ width: `${percent}%`, background: color }}>
          <span className="pet-meter-shine absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        </div>
      </div>
    </div>
  )
}

function BalanceChip({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-l border-white/10 pl-3 first:border-l-0 first:pl-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fuchsia-400/15 text-fuchsia-200">{icon}</span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="break-all font-mono text-[11px] font-bold leading-tight text-white sm:text-sm">{value.toLocaleString()}</p>
      </div>
    </div>
  )
}

function FestivalCharacter({ image, expression, name, className }: { image: string; expression: PetExpression; name: string; className?: string }) {
  const affectionate = expression === 'petted' || expression === 'affectionate'
  return (
    <div className={cn('relative', className)} data-festival-expression={expression}>
      <img src={image} alt={name} className="relative z-10 block max-h-full w-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,.55)]" />
      {affectionate && <div className="pointer-events-none absolute inset-0 z-40">
        <span className="absolute left-[23%] top-[37%] h-3 w-6 rounded-full bg-pink-400/45 blur-[2px]" />
        <span className="absolute right-[23%] top-[37%] h-3 w-6 rounded-full bg-pink-400/45 blur-[2px]" />
        <Heart className="absolute right-[13%] top-[16%] size-6 fill-pink-400 text-pink-300 drop-shadow-[0_0_7px_rgba(244,114,182,.8)]" />
      </div>}
    </div>
  )
}

function PetRoom({
  petId,
  name,
  image,
  roomWidth,
  roomTheme,
  roomImage,
  expression,
  stats,
  isFull,
  isSleeping,
  message,
  cooldownRemaining,
  walkMotion,
  reactionMotion,
  speechBubble,
  onAction,
  onPet,
}: {
  petId: PetId
  name: string
  image: string
  roomWidth: string
  roomTheme: 'cat' | 'dog' | 'lion' | 'festival'
  roomImage: string
  expression: PetExpression
  stats: PetStats
  isFull: boolean
  isSleeping: boolean
  message: string
  cooldownRemaining: Record<PetCareCategory, number>
  walkMotion: WalkMotion
  reactionMotion: ReactionMotion
  speechBubble: string
  onAction: (action: PetCareCategory) => void
  onPet: () => void
}) {
  return (
    <section className="relative h-[570px] overflow-hidden rounded-lg border border-fuchsia-400/25 bg-[#080611] shadow-[0_0_46px_rgba(168,85,247,.16)] sm:h-[650px]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#100b20_0%,#171026_55%,#0b0811_100%)]" />
      <div className="absolute inset-x-[7%] top-0 h-[61%] border-x border-violet-300/5 opacity-80 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute bottom-[39%] left-0 top-0 w-[8%] bg-gradient-to-r from-black/55 to-violet-950/10 [clip-path:polygon(0_0,100%_7%,100%_100%,0_100%)]" />
      <div className="absolute bottom-[39%] right-0 top-0 w-[8%] bg-gradient-to-l from-black/55 to-violet-950/10 [clip-path:polygon(0_7%,100%_0,100%_100%,0_100%)]" />
      <div className="absolute inset-x-0 bottom-[38.5%] h-2 border-y border-violet-300/10 bg-[#23142d] shadow-[0_2px_9px_rgba(0,0,0,.7)]" />
      <div className="absolute inset-x-0 bottom-0 h-[39%] origin-bottom [background:linear-gradient(165deg,#21142a_0%,#100b16_50%,#07060b_100%)] [clip-path:polygon(7%_0,93%_0,100%_100%,0_100%)]">
        <div className="absolute inset-0 opacity-45 [background-image:repeating-linear-gradient(102deg,transparent_0,transparent_62px,rgba(216,180,254,.16)_63px,transparent_65px),repeating-linear-gradient(0deg,transparent_0,transparent_42px,rgba(0,0,0,.35)_43px,transparent_45px)]" />
        <div className="absolute inset-x-[18%] bottom-0 top-[8%] rounded-[50%] border border-fuchsia-400/15 bg-[radial-gradient(ellipse,rgba(126,34,206,.24),rgba(30,18,40,.45)_48%,transparent_70%)] shadow-[inset_0_0_28px_rgba(192,38,211,.08)]" />
      </div>

      <div className="absolute left-4 top-28 h-40 w-28 overflow-hidden rounded-t-[48px] border-2 border-violet-300/15 bg-[#060917] shadow-[inset_0_0_24px_rgba(56,189,248,.1),8px_8px_18px_rgba(0,0,0,.35)] sm:left-8 sm:w-36">
        <div className="absolute inset-x-0 top-1/2 h-px bg-violet-300/15" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-violet-300/15" />
        <div className="absolute bottom-3 left-3 h-9 w-1 bg-fuchsia-400/40 shadow-[12px_-15px_0_rgba(34,211,238,.35),25px_4px_0_rgba(251,191,36,.35),42px_-24px_0_rgba(217,70,239,.3),58px_-3px_0_rgba(96,165,250,.35),74px_-18px_0_rgba(244,114,182,.3)]" />
        <div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-violet-300/10 to-transparent" />
      </div>

      <div className="absolute left-1/2 top-0 h-16 w-px -translate-x-1/2 bg-violet-200/20" />
      <div className="absolute left-1/2 top-14 h-5 w-24 -translate-x-1/2 rounded-[50%] bg-amber-100/80 shadow-[0_10px_40px_15px_rgba(251,191,36,.17),0_3px_4px_rgba(0,0,0,.6)]" />

      <div className="absolute right-4 top-28 h-44 w-24 sm:right-8 sm:w-28">
        <div className="absolute bottom-0 left-2 top-0 w-2 rounded bg-[#170e21] shadow-[3px_0_6px_rgba(0,0,0,.45)]" />
        <div className="absolute bottom-0 right-2 top-0 w-2 rounded bg-[#170e21]" />
        <div className="absolute inset-x-0 top-0 h-2 rounded bg-violet-300/25 shadow-[0_4px_7px_rgba(0,0,0,.55),0_0_16px_rgba(168,85,247,.18)]" />
        <div className="absolute inset-x-0 top-20 h-2 rounded bg-violet-300/25 shadow-[0_4px_7px_rgba(0,0,0,.55)]" />
        <Gem className="absolute right-7 top-5 size-9 text-fuchsia-300 drop-shadow-[0_0_10px_rgba(232,121,249,.6)]" />
        <BookOpen className="absolute bottom-6 left-3 size-8 text-indigo-300/75 drop-shadow-[0_4px_4px_rgba(0,0,0,.5)]" />
        <div className="absolute bottom-[5.4rem] left-4 h-8 w-2 rotate-[-5deg] rounded-sm bg-cyan-500/35 shadow-[9px_2px_0_rgba(244,114,182,.3),18px_0_0_rgba(251,191,36,.28)]" />
        <div className="absolute bottom-5 right-2 size-9 rounded border border-fuchsia-300/20 bg-fuchsia-300/5 p-2">
          <PawPrint className="size-full text-fuchsia-300/50" />
        </div>
      </div>

      <div className="pet-neon-sign absolute left-1/2 top-24 -translate-x-1/2 text-center text-fuchsia-300 drop-shadow-[0_0_10px_rgba(232,121,249,.75)]">
        <PawPrint className="mx-auto size-9" />
        <p className="mt-1 text-[11px] font-black tracking-[0.22em]">INMU PET</p>
      </div>

      <div className="absolute bottom-24 left-4 h-24 w-20 drop-shadow-[7px_9px_7px_rgba(0,0,0,.45)] sm:left-8">
        <div className="absolute bottom-0 left-4 h-10 w-12 rounded-b-xl bg-violet-950/90 ring-1 ring-violet-400/20" />
        <Leaf className="absolute bottom-7 left-0 size-11 -rotate-[28deg] text-emerald-400/55" />
        <Leaf className="absolute bottom-10 right-0 size-11 rotate-[28deg] text-emerald-300/55" />
        <Leaf className="absolute bottom-11 left-5 size-10 text-emerald-400/65" />
      </div>

      <div className="absolute bottom-7 left-1/2 h-20 w-[72%] -translate-x-1/2 rounded-[50%] border border-fuchsia-400/15 bg-[radial-gradient(ellipse,rgba(126,34,206,.3),rgba(24,12,35,.78)_62%,transparent_70%)]" />
      {roomTheme === 'cat' && (
        <>
          <div className="absolute bottom-16 left-1/2 h-20 w-[52%] -translate-x-1/2 rounded-[50%] border border-violet-300/15 bg-[#2c193b] shadow-[inset_0_-12px_18px_rgba(0,0,0,.55),0_8px_30px_rgba(0,0,0,.55)]" />
          <div className="absolute bottom-16 right-[15%] size-7 rounded-full bg-fuchsia-500/35 shadow-[-18px_10px_0_rgba(99,102,241,.3)] before:absolute before:left-1/2 before:top-1/2 before:h-px before:w-10 before:-translate-y-1/2 before:rotate-[28deg] before:bg-fuchsia-200/30" />
          <div className="absolute bottom-24 left-[15%] h-24 w-3 rounded bg-violet-900 shadow-[0_-36px_0_8px_rgba(88,28,135,.75),22px_-8px_0_-1px_rgba(88,28,135,.7)]" />
        </>
      )}
      {roomTheme === 'dog' && (
        <>
          <div className="absolute bottom-20 left-1/2 h-20 w-[60%] -translate-x-1/2 rounded-t-3xl border border-amber-300/10 bg-[#29202b] shadow-[inset_0_-10px_18px_rgba(0,0,0,.5),0_9px_22px_rgba(0,0,0,.45)]" />
          <Dumbbell className="absolute bottom-14 left-[13%] size-12 -rotate-12 text-amber-300/45 drop-shadow-[0_5px_5px_rgba(0,0,0,.55)]" />
          <Glasses className="absolute right-[16%] top-[47%] size-10 rotate-6 text-amber-200/50" />
        </>
      )}
      {roomTheme === 'lion' && (
        <>
          <div className="absolute bottom-0 left-1/2 h-[42%] w-[38%] -translate-x-1/2 bg-gradient-to-b from-red-800/35 to-red-950/10 [clip-path:polygon(35%_0,65%_0,100%_100%,0_100%)]" />
          <div className="absolute bottom-16 left-1/2 h-36 w-[43%] -translate-x-1/2 rounded-t-[42%] border border-amber-300/20 bg-[#2b1933] shadow-[inset_0_0_24px_rgba(120,53,15,.2),0_8px_24px_rgba(0,0,0,.5)]" />
          <div className="absolute bottom-24 right-[13%] h-20 w-10 border-x-4 border-b-4 border-amber-500/25">
            <Crown className="absolute -left-3 -top-7 size-14 text-amber-300/55 drop-shadow-[0_0_8px_rgba(251,191,36,.3)]" />
          </div>
        </>
      )}
      <div className="absolute bottom-9 right-5 z-10 h-7 w-16 rounded-[50%] border border-fuchsia-300/25 bg-[linear-gradient(180deg,#4b2858,#160d1d)] shadow-[inset_0_5px_8px_rgba(0,0,0,.6),0_7px_9px_rgba(0,0,0,.4)] sm:right-9">
        <div className="absolute inset-x-2 top-1 h-2 rounded-[50%] bg-amber-300/35" />
      </div>
      <div className="absolute bottom-12 right-[25%] size-4 rotate-12 rounded bg-cyan-300/15 ring-1 ring-cyan-200/20" />

      <div
        key={petId}
        className="pet-room-enter absolute inset-0 z-[1] bg-cover bg-center"
        style={{ backgroundImage: `url(${roomImage})` }}
        data-pet-room={roomTheme}
      />
      <div className="absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(2,1,8,.08),rgba(3,2,10,.18)_55%,rgba(2,1,7,.68))]" />
      <div className="pet-room-drift pointer-events-none absolute inset-0 z-[3] opacity-30 [background-image:radial-gradient(circle_at_15%_28%,rgba(255,255,255,.9)_0_1px,transparent_2px),radial-gradient(circle_at_76%_22%,rgba(250,204,21,.8)_0_1px,transparent_2px),radial-gradient(circle_at_68%_62%,rgba(232,121,249,.7)_0_1.5px,transparent_2.5px),radial-gradient(circle_at_28%_72%,rgba(255,255,255,.65)_0_1px,transparent_2px)] [background-size:120px_140px,170px_190px,210px_180px,155px_175px]" />
      {roomTheme === 'cat' && (
        <div className="pet-neon-sign absolute right-[13%] top-[17%] z-[4] text-fuchsia-300/70 drop-shadow-[0_0_12px_rgba(232,121,249,.9)]"><PawPrint className="size-10" /></div>
      )}
      {roomTheme === 'dog' && (
        <div className="absolute bottom-[27%] right-[15%] z-[4] size-16 rounded-full border border-amber-300/25">
          <div className="pet-room-speaker absolute inset-0 rounded-full border border-amber-300/35" />
          <div className="pet-room-speaker absolute inset-0 rounded-full border border-orange-300/25 [animation-delay:.9s]" />
        </div>
      )}
      {roomTheme === 'lion' && (
        <div className="pet-room-fire absolute left-[45%] top-[46%] z-[4] h-12 w-8 rounded-[50%_50%_45%_45%] bg-[radial-gradient(circle_at_50%_70%,#fff7ae,#f59e0b_45%,rgba(220,38,38,.35)_72%,transparent_73%)] blur-[1px]" />
      )}
      {roomTheme === 'festival' && (
        <>
          <div className="pet-room-sway absolute left-[12%] top-[12%] z-[4] h-20 w-10 rounded-[45%] border border-amber-200/50 bg-red-700/80 text-center text-[9px] font-black leading-[5rem] text-amber-100 shadow-[0_0_18px_rgba(251,146,60,.5)]">810</div>
          <div className="pet-room-sway absolute right-[12%] top-[14%] z-[4] h-20 w-10 rounded-[45%] border border-amber-200/50 bg-red-700/80 text-center text-[9px] font-black leading-[5rem] text-amber-100 shadow-[0_0_18px_rgba(251,146,60,.5)] [animation-delay:-1.8s]">祭</div>
        </>
      )}

      <div
        className="absolute inset-x-0 bottom-[148px] z-10 flex h-[50%] items-end justify-center"
        data-pet-stage
        data-pet-id={petId}
        data-pose={isSleeping ? 'sleeping' : reactionMotion ?? (walkMotion.moving ? 'walking' : 'idle')}
      >
        {speechBubble && (
          <div key={speechBubble} className="pet-speech-bubble absolute left-1/2 top-1 z-40 max-w-[72%] -translate-x-1/2 rounded-xl border border-fuchsia-300/35 bg-[#100817]/95 px-3 py-2 text-center text-xs font-bold text-fuchsia-50 shadow-[0_0_20px_rgba(232,121,249,.22)] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-[7px] after:border-transparent after:border-t-fuchsia-200/35">
            {speechBubble}
          </div>
        )}
        {isSleeping && !reactionMotion && (
          <div className="absolute left-[64%] top-[22%] z-30 font-black text-cyan-200 drop-shadow-[0_0_8px_rgba(34,211,238,.7)]">
            <span className="pet-zzz block text-lg">Z</span><span className="pet-zzz ml-4 block text-sm [animation-delay:.7s]">z</span>
          </div>
        )}
        <div className="absolute left-1/2 top-[3%] z-30 flex translate-x-[30%] flex-col items-center gap-1">
          <button
            type="button"
            onClick={onPet}
            aria-label="なでる"
            title="なでる"
            className="flex size-11 items-center justify-center rounded-full border border-fuchsia-300/50 bg-black/70 text-fuchsia-200 shadow-[0_0_20px_rgba(232,121,249,.4)] backdrop-blur transition-all active:scale-90 active:bg-fuchsia-400/25"
            data-pet-interaction="pet"
          >
            <Hand className="size-6" />
          </button>
        </div>
        <div
          className={cn(
            'relative z-10 flex max-h-full items-end justify-center',
            !walkMotion.active && !reactionMotion && !isSleeping && 'pet-character-motion',
            reactionMotion && `pet-react-${reactionMotion}`,
            isSleeping && !reactionMotion && 'pet-sleeping-motion',
          )}
          style={{
            width: roomWidth,
            transform: walkMotion.active
              ? `translate3d(${walkMotion.offsetPercent}%, ${walkMotion.bob}px, 0) scaleX(${walkMotion.facing}) rotate(${walkMotion.stride * 1.4}deg) scaleY(${walkMotion.moving ? (walkMotion.frame ? .985 : 1.012) : 1})`
              : undefined,
            transition: walkMotion.active ? 'transform 280ms linear' : undefined,
          }}
          data-walking={walkMotion.active || undefined}
        >
          <div
            className="absolute bottom-1 left-1/2 h-7 w-[72%] -translate-x-1/2 rounded-[50%] bg-black/65 blur-md transition-transform duration-200"
            style={{ transform: `translateX(-50%) scaleX(${walkMotion.moving ? (walkMotion.frame ? .88 : 1.04) : 1})` }}
            data-pet-shadow
          />
          {roomTheme === 'festival' ? (
            <FestivalCharacter image={image} expression={expression} name={name} className="relative z-10 w-full drop-shadow-[0_14px_18px_rgba(0,0,0,.55)]" />
          ) : (
            <img
              src={image}
              alt={name}
              className={cn('relative z-10 max-h-full w-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,.55)] transition-[filter,transform,opacity] duration-150', expression === 'petted' && 'scale-[.98] brightness-110')}
              data-pet-character
              data-expression={expression}
            />
          )}
        </div>
      </div>

      <div className="absolute inset-x-2 bottom-2 z-30 rounded-lg border border-violet-300/25 bg-[#090611]/92 p-2.5 shadow-[0_-10px_30px_rgba(0,0,0,.38)] backdrop-blur-md sm:inset-x-4 sm:p-3">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatusBar label="満腹度" value={stats.fullness} display={`${stats.fullness}`} icon={<Utensils className="size-4 text-pink-300" />} color="linear-gradient(90deg,#fb7185,#f472b6)" />
          <StatusBar label="眠気" value={stats.sleepiness} display={`${stats.sleepiness}`} icon={<Moon className="size-4 text-cyan-300" />} color="linear-gradient(90deg,#38bdf8,#6366f1)" />
          <StatusBar label="愛情度" value={stats.affection} display={`${stats.affection}`} icon={<Heart className="size-4 fill-fuchsia-400 text-fuchsia-400" />} color="linear-gradient(90deg,#e879f9,#c084fc)" />
        </div>
        <div className="mt-2 flex min-h-4 items-center justify-end">
          <p className="break-words text-right text-[9px] text-cyan-200" role="status">{isSleeping ? 'すやすや眠っています' : isFull ? '満腹なのでご飯をあげられません' : message}</p>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {ROOM_ACTIONS.map(action => {
            const Icon = action.icon
            const remaining = cooldownRemaining[action.id]
            const disabled = isSleeping || (action.id === 'feed' && isFull) || remaining > 0
            return (
              <Button key={action.id} type="button" variant="outline" disabled={disabled} onClick={() => onAction(action.id)} className={cn('h-14 flex-col gap-0.5 rounded-md bg-black/35 px-1 text-xs transition-all duration-100 active:scale-[.93] active:brightness-125', action.tone)}>
                <span className="flex items-center gap-1.5"><Icon className="size-4" /><span className="font-bold">{action.label}</span></span>
                {remaining > 0 && <span className="font-mono text-[8px] leading-none opacity-80">{formatCooldown(remaining)}</span>}
              </Button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const CARE_CHOICES: Record<PetCareCategory, Array<{ id: PetCareAction; label: string; detail: string }>> = {
  feed: [
    { id: 'feed-basic', label: '🍖 普通ごはん', detail: '満腹度 +20 / 愛情度 +2 / EXP +5 / 個数制限なし / CT 10分' },
    { id: 'feed-premium', label: '🍱 高級ごはん', detail: '満腹度 +40 / 愛情度 +10 / EXP +15' },
  ],
  play: [
    { id: 'play-yarn', label: '毛糸', detail: 'EXP +5 / 愛情度 +3 / 眠気 +5 / CT 10分' },
    { id: 'play-ball', label: 'ボール', detail: 'EXP +10 / 愛情度 +5 / 眠気 +10 / CT 20分' },
    { id: 'play-toy', label: 'おもちゃ', detail: 'EXP +15 / 愛情度 +7 / 眠気 +15 / CT 30分' },
  ],
}

function CareChoiceDialog({ kind, premiumFood, actionCooldowns, onClose, onChoose }: { kind: PetCareCategory | null; premiumFood: PremiumFoodState; actionCooldowns: Partial<Record<PetCareAction, number>>; onClose: () => void; onChoose: (action: PetCareAction) => void }) {
  if (!kind) return null
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="mx-4 max-w-sm border-violet-300/25 bg-[#0b0712]">
        <DialogHeader><DialogTitle>{kind === 'feed' ? 'ご飯を選ぶ' : '遊びを選ぶ'}</DialogTitle></DialogHeader>
        {kind === 'feed' && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2 text-[10px] text-amber-100/80">
            <span>本日の無料分 <strong className="ml-1 text-amber-200">{premiumFood.dailyRemaining} / 3</strong></span>
            <span>所持分 <strong className="ml-1 text-amber-200">{premiumFood.inventory}個</strong></span>
          </div>
        )}
        <div className="grid gap-2 pt-2">
          {CARE_CHOICES[kind].map(choice => {
            const Icon = kind === 'feed' ? Utensils : Gamepad2
            const cooldown = actionCooldowns[choice.id] ?? 0
            const unavailable = cooldown > 0 || (choice.id === 'feed-premium' && premiumFood.totalAvailable <= 0)
            return (
              <button key={choice.id} type="button" disabled={unavailable} onClick={() => onChoose(choice.id)} className="flex items-center gap-3 rounded-lg border border-violet-300/20 bg-violet-400/5 p-3 text-left transition hover:border-fuchsia-300/45 hover:bg-fuchsia-400/10 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-fuchsia-400/10 text-fuchsia-200"><Icon className="size-5" /></span>
                <span className="min-w-0"><span className="block font-bold text-white">{choice.label}</span><span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{choice.detail}</span>{cooldown > 0 && <span className="mt-1 block font-mono text-[9px] text-cyan-200">{formatCooldown(cooldown)}</span>}{choice.id === 'feed-premium' && <span className="mt-1 block text-[9px] text-amber-200/75">無料分を先に消費し、その後に所持分を使用</span>}</span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CharacterInfo({ pet, stats, maxLevel }: { pet: PetDefinition; stats: PetStats; maxLevel: number }) {
  const requiredExp = stats.level * 20
  const isMaxLevel = stats.level >= maxLevel
  return (
    <section className="rounded-lg border border-fuchsia-300/20 bg-[#0d0916] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-black text-white">{pet.name}</h2>
          <p className="mt-0.5 text-sm tracking-wider text-amber-300">{'★'.repeat(pet.rarity)}</p>
        </div>
        <span className="shrink-0 font-mono text-lg font-black text-cyan-300">Lv.{stats.level}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>EXP</span><span className="font-mono">{isMaxLevel ? 'MAX' : `${stats.exp} / ${requiredExp}`}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_3px_rgba(0,0,0,.7)]">
        <div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,.55)]" style={{ width: `${isMaxLevel ? 100 : Math.min(100, (stats.exp / requiredExp) * 100)}%` }}>
          <span className="pet-meter-shine absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        </div>
      </div>
    </section>
  )
}

function SkillPanel({ pet }: { pet: PetDefinition }) {
  return (
    <section className="rounded-lg border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(8,30,40,.7),rgba(13,9,22,.96))] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">固有スキル</p>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-300/10">
          <Sparkles className="size-5 text-cyan-200" />
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-sm font-bold text-white">{pet.skill.name}</h3>
          <p className="mt-0.5 break-words text-xs text-cyan-100/70">{pet.skill.effect}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 border-t border-cyan-300/10 pt-3">
        {pet.skill.notes.map(note => <li key={note} className="flex gap-2 text-[10px] leading-relaxed text-cyan-50/60"><span className="text-cyan-300">•</span><span>{note}</span></li>)}
      </ul>
    </section>
  )
}

function RewardsPanel({ pet, level }: { pet: PetDefinition; level: number }) {
  return (
    <section className="rounded-lg border border-amber-300/15 bg-[#0d0916] p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-100"><Gift className="size-4 text-amber-300" />Lv報酬</h2>
      <div className="flex flex-col gap-2">
        {pet.levelRewards.map(reward => {
          const unlocked = level >= reward.level
          return (
            <div key={reward.level} className={cn('flex items-center gap-2 rounded-md border px-2.5 py-2', unlocked ? 'border-amber-300/30 bg-amber-300/10' : 'border-white/5 bg-black/20')}>
              {unlocked ? <Gift className="size-4 shrink-0 text-amber-300" /> : <LockKeyhole className="size-4 shrink-0 text-muted-foreground" />}
              <span className="shrink-0 font-mono text-xs font-bold text-amber-200">Lv.{reward.level}</span>
              <span className="min-w-0 break-words text-xs text-foreground/80">{reward.label}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CharacterRoster({ candidates, selectedPetId, petStats, onSelect, vertical = false }: { candidates: readonly PetDefinition[]; selectedPetId: PetId; petStats: Record<PetId, PetStats>; onSelect: (id: PetId) => void; vertical?: boolean }) {
  return (
    <section className={vertical ? '' : 'border-t border-violet-300/15 pt-4'}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-fuchsia-200">育成中</h2>
        <span className="font-mono text-[10px] text-muted-foreground">{candidates.length} / 1</span>
      </div>
      <div className={cn(vertical ? 'flex flex-col gap-2' : 'flex snap-x snap-mandatory touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-2 pr-4 scrollbar-none')}>
        {candidates.map((candidate, index) => {
          const active = candidate.id === selectedPetId
          const stats = petStats[candidate.id]
          return (
            <button key={candidate.id} type="button" aria-pressed={active} onClick={() => onSelect(candidate.id)} className={cn(vertical ? 'w-full' : 'w-24 shrink-0 snap-start sm:w-28', 'overflow-hidden rounded-lg border bg-[#0d0916] text-left transition-colors', active ? 'border-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,.24)]' : 'border-violet-300/15 hover:border-violet-300/35')}>
              <div className={cn('relative flex items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_65%,rgba(126,34,206,.2),transparent_67%)] px-2 pt-2', vertical ? 'h-24' : 'aspect-square')}>
                <span className="absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full border border-amber-300/45 bg-black/70 font-mono text-[9px] font-black text-amber-200">{index + 1}</span>
                {candidate.roomTheme === 'festival'
                  ? <FestivalCharacter image={candidate.image} expression="default" name={candidate.name} className="h-full w-full" />
                  : <img src={candidate.image} alt="" className="max-h-full max-w-full object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,.45)]" />}
              </div>
              <div className="border-t border-white/5 p-2">
                <p className="break-words text-xs font-bold">{candidate.name}</p>
                <div className="mt-1 flex items-center justify-between gap-1 text-[9px]">
                  <span className="text-amber-300">★{candidate.rarity}</span>
                  <span className="rounded bg-cyan-400/10 px-1 py-0.5 font-mono font-bold text-cyan-200">Lv.{stats.level}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function OwnedCharacters({ ownedPetIds, activePetIds, onSet }: { ownedPetIds: readonly PetId[]; activePetIds: readonly PetId[]; onSet: (id: PetId) => void }) {
  const owned = ownedPetIds.map(id => PET_BY_ID[id]).filter(candidate => candidate && !activePetIds.includes(candidate.id))
  return (
    <section className="border-t border-violet-300/15 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-fuchsia-200">所持キャラクター</h2>
        <span className="text-[10px] text-muted-foreground">所持 {ownedPetIds.length}体</span>
      </div>
      <div className="space-y-2">
        {owned.map(candidate => (
          <div key={candidate.id} className="flex items-center gap-3 rounded-lg border border-violet-300/15 bg-[#0d0916] p-2.5">
            <div className="flex size-16 shrink-0 items-end justify-center overflow-hidden rounded-md bg-[radial-gradient(circle_at_50%_65%,rgba(126,34,206,.25),transparent_68%)]">
              {candidate.roomTheme === 'festival'
                ? <FestivalCharacter image={candidate.image} expression="default" name={candidate.name} className="h-full w-full" />
                : <img src={candidate.image} alt="" className="max-h-full max-w-full object-contain" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold text-white">{candidate.name}</p>
              <p className="mt-0.5 text-[10px] text-amber-300">★{candidate.rarity}{candidate.costume ? ` ・ ${candidate.costume.label}` : ''}</p>
            </div>
            <Button type="button" size="sm" onClick={() => onSet(candidate.id)} className="shrink-0 border border-fuchsia-300/35 bg-fuchsia-500/15 text-[11px] text-fuchsia-100 hover:bg-fuchsia-500/25">育成にセット</Button>
          </div>
        ))}
        {owned.length === 0 && <p className="rounded-lg border border-violet-300/10 bg-black/20 px-3 py-4 text-center text-xs text-muted-foreground">育成中のキャラクター以外は所持していません</p>}
      </div>
    </section>
  )
}

function TrainingSlots({ activePet }: { activePet: PetDefinition | null }) {
  const slots = [
    { number: 1, label: activePet?.name ?? '未設定', locked: false },
    { number: 2, label: '1,000,000 INMUで解放', locked: true },
    { number: 3, label: '2,000,000 INMUで解放', locked: true },
  ]
  return (
    <section className="border-t border-violet-300/15 pt-4">
      <h2 className="mb-3 text-sm font-bold text-fuchsia-200">育成枠</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {slots.map(slot => (
          <div key={slot.number} className={cn('flex min-h-16 items-center gap-2 rounded-lg border px-3 py-2', slot.locked ? 'border-white/10 bg-black/30 text-muted-foreground' : 'border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-100')}>
            {slot.locked ? <LockKeyhole className="size-4 shrink-0" /> : <PawPrint className="size-4 shrink-0 text-fuchsia-300" />}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">Slot {slot.number}</p>
              <p className="break-words text-xs font-bold">{slot.label}</p>
              {slot.locked && <p className="mt-0.5 text-[9px]">解放決済は準備中です</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function PetPage() {
  const { profile, unread } = useAuth()
  const { selectedPetId, petStats, cooldownUntil, lastCareAt, expressionState, premiumFood, isSleeping, selectPet, care, setExpression, maxLevel } = usePetState()
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now)
  const [isBlinking, setIsBlinking] = useState(false)
  const [isYawning, setIsYawning] = useState(false)
  const [walkTick, setWalkTick] = useState(0)
  const [careMenu, setCareMenu] = useState<PetCareCategory | null>(null)
  const [reactionMotion, setReactionMotion] = useState<ReactionMotion>(null)
  const [speechBubble, setSpeechBubble] = useState('')
  const [ownedPetIds, setOwnedPetIds] = useState<PetId[] | null>(null)
  const [ownershipError, setOwnershipError] = useState(false)
  const [activePetIds, setActivePetIds] = useState<PetId[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = JSON.parse(window.localStorage.getItem(ACTIVE_PETS_STORAGE_KEY) ?? '[]') as PetId[]
      return saved.filter((id, index) => PET_BY_ID[id] && USER_VISIBLE_PET_IDS.has(id) && saved.indexOf(id) === index).slice(0, 1)
    } catch {
      return []
    }
  })
  const [balances, setBalances] = useState({ inmu: 0, points: 0 })
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const motionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blinkResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const yawnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const yawnResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const walkingRef = useRef(false)
  const interactionRef = useRef(false)
  const sleepingRef = useRef(false)
  const displayedPetId = activePetIds.includes(selectedPetId) ? selectedPetId : (activePetIds[0] ?? 'inmu-festival')
  const pet = PET_BY_ID[displayedPetId]
  const selectedStats = petStats[displayedPetId]
  const activePets = activePetIds.map(id => PET_BY_ID[id]).filter(Boolean)
  const hasOwnedPet = (ownedPetIds?.length ?? 0) > 0
  const isFull = selectedStats.fullness >= 100
  const cooldownRemaining: Record<PetCareCategory, number> = {
    feed: getCareCooldownRemaining('feed', cooldownUntil, now),
    play: getCareCooldownRemaining('play', cooldownUntil, now),
  }
  const actionCooldowns = Object.fromEntries(
    (Object.keys(PET_CARE_CONFIG) as PetCareAction[]).map(action => [action, getActionCooldownRemaining(action, lastCareAt, now)]),
  ) as Record<PetCareAction, number>
  const statusExpressionWindow = Math.floor(now / 4000) % 5 === 0
  const expression: PetExpression = expressionState.until > now && expressionState.kind !== 'default'
    ? expressionState.kind
    : isSleeping
      ? 'sleepy'
      : selectedStats.fullness <= 30 && statusExpressionWindow
      ? 'hungry'
      : selectedStats.sleepiness >= 80 && statusExpressionWindow
        ? 'sleepy'
        : selectedStats.affection >= 100 && statusExpressionWindow
          ? 'affectionate'
          : isYawning
            ? 'sleepy'
          : isBlinking
            ? 'blink'
            : 'default'
  const canShowWalk = pet.walk.enabled && !isSleeping && expression === 'default' && !reactionMotion
  const walkMotion = getWalkMotion(walkTick, canShowWalk, pet.walk.distancePercent)
  walkingRef.current = walkMotion.moving
  interactionRef.current = Boolean(reactionMotion)
  sleepingRef.current = isSleeping
  const displayImage = canShowWalk && walkMotion.moving ? pet.walk.frames[walkMotion.frame] : pet.expressions[expression]

  useEffect(() => {
    const preloadUrls = new Set(PET_DEFINITIONS.flatMap(candidate => [
      ...Object.values(candidate.expressions),
      ...candidate.walk.frames,
      candidate.roomImage,
    ]).filter((url): url is string => Boolean(url)))
    preloadUrls.forEach(url => { const image = new Image(); image.src = url })
  }, [])

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_PETS_STORAGE_KEY, JSON.stringify(activePetIds))
    if (activePetIds.length > 0 && !activePetIds.includes(selectedPetId)) selectPet(activePetIds[0])
  }, [activePetIds, selectedPetId])

  useEffect(() => {
    let cancelled = false
    async function loadOwnership() {
      try {
        const response = await fetch('/api/pet/characters', { credentials: 'include' })
        if (!response.ok) throw new Error('ownership fetch failed')
        const data = await response.json() as { ownedCharacterIds?: string[] }
        if (cancelled) return
        const owned = (data.ownedCharacterIds ?? [])
          .filter((id): id is PetId => Boolean(PET_BY_ID[id as PetId]) && USER_VISIBLE_PET_IDS.has(id as PetId))
          .filter((id, index, list) => list.indexOf(id) === index)
        setOwnedPetIds(owned)
        setOwnershipError(false)
        setActivePetIds(current => {
          const activeOwned = current.filter(id => owned.includes(id)).slice(0, 1)
          return activeOwned.length > 0 ? activeOwned : owned.slice(0, 1)
        })
        if (owned.length > 0 && !owned.includes(selectedPetId)) selectPet(owned[0])
      } catch {
        if (!cancelled) {
          setOwnedPetIds([])
          setActivePetIds([])
          setOwnershipError(true)
        }
      }
    }
    loadOwnership()
    window.addEventListener('inmu-pet-ownership-changed', loadOwnership)
    return () => {
      cancelled = true
      window.removeEventListener('inmu-pet-ownership-changed', loadOwnership)
    }
  }, [])

  useEffect(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setBalances({ inmu: Number(data.balance) || 0, points: Number(data.monthlyPoints) || 0 }) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current)
    const remaining = expressionState.until - Date.now()
    if (expressionState.kind === 'default' || expressionState.until <= 0) return
    if (remaining <= 0) {
      setExpression('default')
      return
    }
    reactionTimer.current = setTimeout(() => setExpression('default'), remaining)
    return () => {
      if (reactionTimer.current) clearTimeout(reactionTimer.current)
    }
  }, [expressionState.kind, expressionState.until, selectedPetId])

  useEffect(() => () => {
    if (motionTimer.current) clearTimeout(motionTimer.current)
  }, [])

  useEffect(() => {
    function scheduleBlink() {
      blinkTimer.current = setTimeout(() => {
        setIsBlinking(true)
        blinkResetTimer.current = setTimeout(() => {
          setIsBlinking(false)
          scheduleBlink()
        }, 180)
      }, 5000 + Math.round(Math.random() * 3500))
    }
    setIsBlinking(false)
    scheduleBlink()
    return () => {
      if (blinkTimer.current) clearTimeout(blinkTimer.current)
      if (blinkResetTimer.current) clearTimeout(blinkResetTimer.current)
    }
  }, [selectedPetId])

  useEffect(() => {
    function scheduleYawn() {
      yawnTimer.current = setTimeout(() => {
        if (!isSleeping && expressionState.kind === 'default' && !reactionMotion) {
          setIsYawning(true)
          yawnResetTimer.current = setTimeout(() => {
            setIsYawning(false)
            scheduleYawn()
          }, 3000)
          return
        }
        scheduleYawn()
      }, 18000 + Math.round(Math.random() * 12000))
    }
    setIsYawning(false)
    scheduleYawn()
    return () => {
      if (yawnTimer.current) clearTimeout(yawnTimer.current)
      if (yawnResetTimer.current) clearTimeout(yawnResetTimer.current)
    }
  }, [selectedPetId, isSleeping, expressionState.kind, reactionMotion])

  useEffect(() => {
    function scheduleSpeech() {
      speechTimer.current = setTimeout(() => {
        if (!interactionRef.current && !sleepingRef.current) {
          const lines = walkingRef.current ? pet.dialogues.walking : pet.dialogues.idle
          const line = pickRandom(lines)
          if (line) {
            setSpeechBubble(line)
            if (speechResetTimer.current) clearTimeout(speechResetTimer.current)
            speechResetTimer.current = setTimeout(() => setSpeechBubble(''), 4200)
          }
        }
        scheduleSpeech()
      }, 11000 + Math.round(Math.random() * 10000))
    }
    scheduleSpeech()
    return () => {
      if (speechTimer.current) clearTimeout(speechTimer.current)
      if (speechResetTimer.current) clearTimeout(speechResetTimer.current)
    }
  }, [selectedPetId, pet.dialogues])

  useEffect(() => {
    setWalkTick(0)
    if (!pet.walk.enabled) return
    const interval = setInterval(() => setWalkTick(current => (current + 1) % 30), pet.walk.tickMs)
    return () => clearInterval(interval)
  }, [selectedPetId, pet.walk.enabled, pet.walk.tickMs])

  function openCareMenu(category: PetCareCategory) {
    if (isSleeping) { setMessage('眠っているので今はできません'); return }
    if (category === 'feed' && isFull) { setMessage('満腹なのでご飯をあげられません'); return }
    const remaining = getCareCooldownRemaining(category, cooldownUntil, Date.now())
    if (remaining > 0) { setMessage(formatCooldown(remaining)); return }
    setCareMenu(category)
  }

  function handleCare(action: PetCareAction) {
    const actionNow = Date.now()
    const config = PET_CARE_CONFIG[action]
    if (config.category !== 'pet') {
      if (isSleeping) { setMessage('眠っているので今はできません'); return false }
      if (config.category === 'feed' && isFull) { setMessage('満腹なのでご飯をあげられません'); return false }
      const actionRemaining = getActionCooldownRemaining(action, lastCareAt, actionNow)
      if (config.category === 'feed' && actionRemaining > 0) { setMessage(formatCooldown(actionRemaining)); return false }
      if (action === 'feed-premium' && premiumFood.totalAvailable <= 0) { setMessage('高級ごはんの無料分・所持分がありません'); return false }
      const remaining = getCareCooldownRemaining(config.category, cooldownUntil, actionNow)
      if (remaining > 0) { setMessage(formatCooldown(remaining)); return false }
    }
    const result = care(action, actionNow)
    if (!result) return false
    setNow(actionNow)
    const duration = pet.reactionDurations[result.motion]
    setExpression(result.expression, duration, actionNow)
    setReactionMotion(result.motion)
    const careSpeech = result.message === 'overpetted' ? pet.messages.overpetted : pickRandom(pet.dialogues.care) ?? ''
    if (speechResetTimer.current) clearTimeout(speechResetTimer.current)
    setSpeechBubble(careSpeech)
    setMessage({ fed: 'ご飯をあげました', played: '一緒に遊びました', petted: 'うれしそうにしています', overpetted: pet.messages.overpetted }[result.message] ?? '')
    setCareMenu(null)
    if (motionTimer.current) clearTimeout(motionTimer.current)
    motionTimer.current = setTimeout(() => {
      setReactionMotion(null)
      setSpeechBubble('')
    }, duration)
    return true
  }

  function handlePet() {
    handleCare('pet')
  }

  function handleSelect(id: PetId) {
    setIsBlinking(false)
    setReactionMotion(null)
    setSpeechBubble('')
    setCareMenu(null)
    selectPet(id)
    setMessage('')
  }

  function handleSetActive(id: PetId) {
    if (activePetIds.includes(id)) { handleSelect(id); return }
    if (!ownedPetIds?.includes(id)) return
    setActivePetIds([id])
    handleSelect(id)
    setMessage(`${PET_BY_ID[id].name}を育成にセットしました`)
  }

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <style>{PET_ROOM_CSS}</style>
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300"><PawPrint className="size-3.5" />Pet room</p>
            <h1 className="text-2xl font-black text-white">INMU PET</h1>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 rounded-lg border border-violet-300/15 bg-black/35 px-3 py-2 sm:w-auto sm:min-w-[230px]">
            <BalanceChip icon={<Coins className="size-3.5" />} label="INMU" value={balances.inmu} />
            <BalanceChip icon={<CircleDollarSign className="size-3.5" />} label="POINT" value={balances.points} />
          </div>
        </header>

        {ownedPetIds === null ? (
          <div className="flex min-h-64 items-center justify-center rounded-lg border border-violet-300/15 bg-black/25 text-sm text-muted-foreground">所持キャラクターを読み込んでいます…</div>
        ) : !hasOwnedPet ? (
          <div className="space-y-3">
            <section className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-fuchsia-400/20 bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,.16),transparent_55%),#090611] px-6 text-center">
              <LockKeyhole className="mb-4 size-10 text-fuchsia-300" />
              <h2 className="text-lg font-black text-white">育成キャラクターはまだいません</h2>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
                イベントミッション「ログイン日数通算7日達成」の報酬を受け取ると、INMUくん（810祭りVer.）が所持キャラクターに追加されます。
              </p>
              {ownershipError && <p className="mt-3 text-xs text-rose-300">所持情報を取得できませんでした。画面を再読み込みしてください。</p>}
            </section>
            <TrainingSlots activePet={null} />
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[140px_minmax(360px,1fr)_260px] lg:items-start lg:gap-4">
            <aside className="hidden lg:block"><CharacterRoster candidates={activePets} selectedPetId={displayedPetId} petStats={petStats} onSelect={handleSelect} vertical /></aside>

            <main className="flex min-w-0 flex-col gap-3">
              <div className="lg:hidden"><CharacterInfo pet={pet} stats={selectedStats} maxLevel={maxLevel} /></div>
              <div className="lg:hidden"><CharacterRoster candidates={activePets} selectedPetId={displayedPetId} petStats={petStats} onSelect={handleSelect} /></div>
              <PetRoom
                petId={pet.id}
                name={pet.name}
                image={displayImage}
                roomWidth={pet.roomWidth}
                roomTheme={pet.roomTheme}
                roomImage={pet.roomImage}
                expression={expression}
                stats={selectedStats}
                isFull={isFull}
                isSleeping={isSleeping}
                message={message}
                cooldownRemaining={cooldownRemaining}
                walkMotion={walkMotion}
                reactionMotion={reactionMotion}
                speechBubble={speechBubble}
                onAction={openCareMenu}
                onPet={handlePet}
              />
              <div className="lg:hidden"><SkillPanel pet={pet} /></div>
              <div className="lg:hidden"><RewardsPanel pet={pet} level={selectedStats.level} /></div>
              <TrainingSlots activePet={pet} />
              <OwnedCharacters ownedPetIds={ownedPetIds} activePetIds={activePetIds} onSet={handleSetActive} />
            </main>

            <aside className="hidden flex-col gap-3 lg:flex">
              <CharacterInfo pet={pet} stats={selectedStats} maxLevel={maxLevel} />
              <SkillPanel pet={pet} />
              <RewardsPanel pet={pet} level={selectedStats.level} />
            </aside>
          </div>
        )}
      </div>
      {hasOwnedPet && <CareChoiceDialog kind={careMenu} premiumFood={premiumFood} actionCooldowns={actionCooldowns} onClose={() => setCareMenu(null)} onChoose={handleCare} />}
    </AppShell>
  )
}
