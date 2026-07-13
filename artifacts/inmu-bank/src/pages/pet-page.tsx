import type { ElementType, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import {
  fetchConnectedPhantomInmuBalance,
  fetchInmuBalanceForWallet,
  fetchMyInmuBalance,
  getPhantomProvider,
  isMobileBrowser,
  openInPhantomBrowser,
  sendInmuWithPhantom,
} from '@/lib/admin-inmu-transfer'
import { toast } from 'sonner'
import { PET_BY_ID, PET_DEFINITIONS, type PetDefinition, type PetExpression, type PetId } from '@/features/pet/pet-data'
import { getActionCooldownRemaining, getCareCooldownRemaining, getRequiredPetExp, PET_CARE_CONFIG, PET_WALK_DAILY_LIMIT, usePetState, type PetCareAction, type PetCareCategory, type PetStats, type PremiumFoodState, type PetWalkItem, type PetWalkResult, type PetWalkState } from '@/features/pet/use-pet-state'
import {
  BookOpen, CircleDollarSign, Coins, Crown, Dumbbell, Gamepad2, Gem,
  Gift, Glasses, Hand, Heart, Leaf, LockKeyhole, Moon, PawPrint, Sparkles, Utensils,
  CupSoda,
} from 'lucide-react'

const ROOM_ACTIONS: Array<{ id: PetCareCategory; label: string; icon: ElementType; tone: string }> = [
  { id: 'feed', label: 'ご飯', icon: Utensils, tone: 'border-pink-400/50 text-pink-200 shadow-[0_0_18px_rgba(244,114,182,.12)]' },
  { id: 'play', label: '遊ぶ', icon: Gamepad2, tone: 'border-amber-300/50 text-amber-200 shadow-[0_0_18px_rgba(252,211,77,.12)]' },
]

const USER_VISIBLE_PET_IDS = new Set<PetId>(['nyarushian', 'takuya', 'leon', 'chinge', 'tdn', 'whip', 'inmu-festival'])

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
  const safeMilliseconds = Number.isFinite(milliseconds) ? milliseconds : 0
  const totalSeconds = Math.max(0, Math.ceil(safeMilliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `あと${minutes}分${String(seconds).padStart(2, '0')}秒`
}

function formatWalkRemaining(milliseconds: number) {
  const safeMilliseconds = Number.isFinite(milliseconds) ? milliseconds : 0
  const totalSeconds = Math.max(0, Math.ceil(safeMilliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
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
        <div className="relative h-full overflow-hidden rounded-full shadow-[0_0_10px_currentColor]" style={{ width: String(percent) + '%', background: color }}>
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
  isWalking,
  walkRemaining,
  message,
  cooldownRemaining,
  walkMotion,
  reactionMotion,
  speechBubble,
  onAction,
  onPet,
  onWalk,
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
  isWalking: boolean
  walkRemaining: number
  message: string
  cooldownRemaining: Record<PetCareCategory, number>
  walkMotion: WalkMotion
  reactionMotion: ReactionMotion
  speechBubble: string
  onAction: (action: PetCareCategory) => void
  onPet: () => void
  onWalk: () => void
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
        style={{ backgroundImage: 'url(' + roomImage + ')' }}
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
        {isWalking && (
          <div className="absolute left-1/2 top-[34%] z-40 flex -translate-x-1/2 flex-col items-center rounded-lg border border-cyan-300/30 bg-black/70 px-6 py-4 text-center shadow-[0_0_28px_rgba(34,211,238,.18)] backdrop-blur">
            <p className="text-lg font-black text-cyan-100">散歩中</p>
            <p className="mt-1 font-mono text-sm font-bold text-cyan-200">帰宅まで {formatWalkRemaining(walkRemaining)}</p>
          </div>
        )}
        {isSleeping && !isWalking && !reactionMotion && (
          <div className="absolute left-[64%] top-[22%] z-30 font-black text-cyan-200 drop-shadow-[0_0_8px_rgba(34,211,238,.7)]">
            <span className="pet-zzz block text-lg">Z</span><span className="pet-zzz ml-4 block text-sm [animation-delay:.7s]">z</span>
          </div>
        )}
        <div className="absolute left-1/2 top-[3%] z-30 flex translate-x-[30%] flex-col items-center gap-1">
          <button
            type="button"
            onClick={onPet}
            disabled={isWalking}
            aria-label="なでる"
            title="なでる"
            className="flex size-11 items-center justify-center rounded-full border border-fuchsia-300/50 bg-black/70 text-fuchsia-200 shadow-[0_0_20px_rgba(232,121,249,.4)] backdrop-blur transition-all active:scale-90 active:bg-fuchsia-400/25 disabled:cursor-not-allowed disabled:opacity-40"
            data-pet-interaction="pet"
          >
            <Hand className="size-6" />
          </button>
        </div>
        {!isWalking && <div
          className={cn(
            'relative z-10 flex max-h-full items-end justify-center',
            !walkMotion.active && !reactionMotion && !isSleeping && 'pet-character-motion',
            reactionMotion && ('pet-react-' + reactionMotion),
            isSleeping && !reactionMotion && 'pet-sleeping-motion',
          )}
          style={{
            width: roomWidth,
            transform: walkMotion.active
              ? 'translate3d(' + walkMotion.offsetPercent + '%, ' + walkMotion.bob + 'px, 0) scaleX(' + walkMotion.facing + ') rotate(' + (walkMotion.stride * 1.4) + 'deg) scaleY(' + (walkMotion.moving ? (walkMotion.frame ? .985 : 1.012) : 1) + ')'
              : undefined,
            transition: walkMotion.active ? 'transform 280ms linear' : undefined,
          }}
          data-walking={walkMotion.active || undefined}
        >
          <div
            className="absolute bottom-1 left-1/2 h-7 w-[72%] -translate-x-1/2 rounded-[50%] bg-black/65 blur-md transition-transform duration-200"
            style={{ transform: 'translateX(-50%) scaleX(' + (walkMotion.moving ? (walkMotion.frame ? .88 : 1.04) : 1) + ')' }}
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
        </div>}
      </div>

      <div className="absolute inset-x-2 bottom-2 z-30 rounded-lg border border-violet-300/25 bg-[#090611]/92 p-2.5 shadow-[0_-10px_30px_rgba(0,0,0,.38)] backdrop-blur-md sm:inset-x-4 sm:p-3">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatusBar label="満腹度" value={stats.fullness} display={`${stats.fullness}`} icon={<Utensils className="size-4 text-pink-300" />} color="linear-gradient(90deg,#fb7185,#f472b6)" />
          <StatusBar label="眠気" value={stats.sleepiness} display={`${stats.sleepiness}`} icon={<Moon className="size-4 text-cyan-300" />} color="linear-gradient(90deg,#38bdf8,#6366f1)" />
          <StatusBar label="愛情度" value={stats.affection} display={`${stats.affection}`} icon={<Heart className="size-4 fill-fuchsia-400 text-fuchsia-400" />} color="linear-gradient(90deg,#e879f9,#c084fc)" />
        </div>
        <div className="mt-2 flex min-h-4 items-center justify-end">
          <p className="break-words text-right text-[9px] text-cyan-200" role="status">
            {isSleeping ? 'すやすや眠っています' : isFull ? '満腹なのでご飯をあげられません' : message}
          </p>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {ROOM_ACTIONS.map(action => {
            const Icon = action.icon
            const remaining = cooldownRemaining[action.id]
            const disabled = isWalking || isSleeping || (action.id === 'feed' && isFull) || remaining > 0
            return (
              <Button key={action.id} type="button" variant="outline" disabled={disabled} onClick={() => onAction(action.id)} className={cn('h-14 flex-col gap-0.5 rounded-md bg-black/35 px-1 text-xs transition-all duration-100 active:scale-[.93] active:brightness-125', action.tone)}>
                <span className="flex items-center gap-1.5"><Icon className="size-4" /><span className="font-bold">{action.label}</span></span>
                {remaining > 0 && <span className="font-mono text-[8px] leading-none opacity-80">{formatCooldown(remaining)}</span>}
              </Button>
            )
          })}
        </div>
        <Button type="button" variant="outline" disabled={isWalking || isSleeping} onClick={onWalk} className="mt-2 h-12 w-full gap-1.5 rounded-md border-cyan-300/35 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40">
          <PawPrint className="size-4" />
          <span className="font-bold">{isWalking ? '散歩中' : '散歩'}</span>
          {isWalking && <span className="font-mono text-[10px]">{formatWalkRemaining(walkRemaining)}</span>}
        </Button>
      </div>
    </section>
  )
}

const CARE_CHOICES: Record<PetCareCategory, Array<{ id: PetCareAction; label: string; detail: string }>> = {
  feed: [
    { id: 'feed-basic', label: '普通ごはん', detail: '満腹度 +20 / 愛情度 +2 / EXP +10 / CT 10分' },
    { id: 'feed-premium', label: '高級ごはん', detail: '満腹度 +40 / 愛情度 +10 / EXP +30' },
  ],
  play: [
    { id: 'play-yarn', label: '毛糸', detail: 'EXP +10 / 愛情度 +3 / 眠気 +5 / CT 10分' },
    { id: 'play-ball', label: 'ボール', detail: 'EXP +20 / 愛情度 +5 / 眠気 +10 / CT 20分' },
    { id: 'play-toy', label: 'おもちゃ', detail: 'EXP +30 / 愛情度 +7 / 眠気 +15 / CT 30分' },
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
            <span>所持数 <strong className="ml-1 text-amber-200">{premiumFood.inventory}個</strong></span>
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
                <span className="min-w-0"><span className="block font-bold text-white">{choice.label}</span><span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{choice.detail}</span>{cooldown > 0 && <span className="mt-1 block font-mono text-[9px] text-cyan-200">{formatCooldown(cooldown)}</span>}{choice.id === 'feed-premium' && <span className="mt-1 block text-[9px] text-amber-200/75">無料分を先に消費し、その後に所持分を使用します</span>}</span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WalkChoiceDialog({
  open,
  walks,
  items,
  petId,
  onClose,
  onChoose,
}: {
  open: boolean
  walks: PetWalkState
  items: { takuyaSunglasses: number; catHeadband: number }
  petId: PetId
  onClose: () => void
  onChoose: (item: PetWalkItem) => void
}) {
  if (!open) return null
  const today = walks.dailyDate
  const dailyRemaining = Math.max(0, PET_WALK_DAILY_LIMIT - walks.dailyCount)
  const petUsed = walks.petDaily[petId] === today
  const choices: Array<{ item: PetWalkItem; label: string; detail: string; disabled?: boolean }> = [
    { item: 'none', label: '使用アイテムなし', detail: '散歩時間 1時間 / 通常の報酬抽選' },
    { item: 'takuya_sunglasses', label: '拓也のサングラスを使う', detail: '散歩時間が1時間長くなり、アイテムを拾う確率が上がります。', disabled: items.takuyaSunglasses <= 0 },
    { item: 'cat_headband', label: '猫のカチューシャを使う', detail: '散歩で獲得できる経験値が増え、眠気の上昇を軽減します。', disabled: items.catHeadband <= 0 },
  ]
  return (
    <Dialog open onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent className="mx-4 max-w-sm border-cyan-300/25 bg-[#0b0712]">
        <DialogHeader><DialogTitle>散歩に行く</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-100/80">
          <p>本日の残り {dailyRemaining} / {PET_WALK_DAILY_LIMIT}</p>
          {petUsed && <p className="mt-1 font-bold text-amber-200">このキャラクターは本日散歩済みです</p>}
        </div>
        <div className="grid gap-2 pt-2">
          {choices.map(choice => (
            <button
              key={choice.item}
              type="button"
              disabled={choice.disabled || dailyRemaining <= 0 || petUsed}
              onClick={() => onChoose(choice.item)}
              className="flex items-center gap-3 rounded-lg border border-violet-300/20 bg-violet-400/5 p-3 text-left transition hover:border-cyan-300/45 hover:bg-cyan-400/10 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-200">
                {choice.item === 'takuya_sunglasses' ? <Glasses className="size-5" /> : <PawPrint className="size-5" />}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-white">{choice.label}</span>
                <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{choice.detail}</span>
                {choice.item === 'takuya_sunglasses' && <span className="mt-1 block text-[9px] text-cyan-200/75">所持数 {items.takuyaSunglasses}個</span>}
                {choice.item === 'cat_headband' && <span className="mt-1 block text-[9px] text-cyan-200/75">所持数 {items.catHeadband}個</span>}
              </span>
            </button>
          ))}
          <Button type="button" variant="outline" onClick={onClose} className="min-h-10">キャンセル</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WalkResultDialog({ result, onClose }: { result: PetWalkResult | null; onClose: () => void }) {
  if (!result) return null
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="mx-4 max-w-sm border-emerald-300/25 bg-[#0b0712]">
        <DialogHeader><DialogTitle>散歩結果</DialogTitle></DialogHeader>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"><span>獲得経験値</span><strong>+{result.exp}</strong></div>
          <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"><span>上昇した眠気</span><strong>+{result.sleepiness}</strong></div>
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
            <span className="block text-muted-foreground">拾ったアイテム</span>
            <strong className="mt-1 block text-white">{result.rewardLabel ?? 'アイテムは見つかりませんでした'}</strong>
          </div>
        </div>
        <Button type="button" onClick={onClose} className="min-h-10 w-full">閉じる</Button>
      </DialogContent>
    </Dialog>
  )
}

function CharacterInfo({ pet, stats, maxLevel }: { pet: PetDefinition; stats: PetStats; maxLevel: number }) {
  const requiredExp = getRequiredPetExp(stats.level, pet.id)
  const isMaxLevel = stats.level >= maxLevel
  return (
    <section className="rounded-lg border border-fuchsia-300/20 bg-[#0d0916] p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-black text-white">{pet.name}</h2>
          <p className="mt-0.5 text-xs tracking-wider text-amber-300">{'★'.repeat(pet.rarity)}</p>
        </div>
        <span className="shrink-0 font-mono text-base font-black text-cyan-300">Lv.{stats.level}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>EXP</span><span className="font-mono">{isMaxLevel ? 'MAX' : `${stats.exp} / ${requiredExp}`}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_3px_rgba(0,0,0,.7)]">
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

function ItemPanel({ inventory, level, maxLevel, disabled = false, onUse }: { inventory: number; level: number; maxLevel: number; disabled?: boolean; onUse: (amount: number) => void }) {
  const [amount, setAmount] = useState(1)
  const maxUsable = disabled ? 0 : Math.min(3, inventory, Math.max(0, maxLevel - level))
  useEffect(() => setAmount(current => Math.max(1, Math.min(current, Math.max(1, maxUsable)))), [maxUsable])
  return (
    <section className="rounded-lg border border-sky-300/20 bg-[linear-gradient(145deg,rgba(8,28,42,.82),rgba(12,8,22,.97))] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-sky-100"><CupSoda className="size-4 text-sky-300" />所持アイテム</h2>
        <span className="rounded border border-sky-300/20 bg-sky-300/10 px-2 py-1 font-mono text-xs text-sky-100">{inventory}個</span>
      </div>
      <p className="mt-2 text-xs font-bold text-white">アイスティー（睡眠薬入り）</p>
      <p className="mt-1 text-[10px] leading-relaxed text-sky-100/65">1個につきLv.+1、眠気+33。最大3個まで同時に使用できます。</p>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        {disabled && <p className="col-span-2 text-[11px] font-bold text-cyan-300">眠っている間は使用できません</p>}
        <select
          value={Math.min(amount, Math.max(1, maxUsable))}
          onChange={event => setAmount(Number(event.target.value))}
          disabled={maxUsable <= 0}
          className="h-10 rounded-md border border-sky-300/25 bg-black/45 px-3 text-sm text-sky-50 outline-none disabled:opacity-40"
        >
          {[1, 2, 3].filter(value => value <= maxUsable).map(value => <option key={value} value={value}>{value}個使用</option>)}
          {maxUsable <= 0 && <option value={1}>{level >= maxLevel ? 'レベルMAX' : '所持数0'}</option>}
        </select>
        <Button type="button" disabled={maxUsable <= 0} onClick={() => onUse(amount)} className="h-10 border border-sky-300/35 bg-sky-500/20 text-sky-50 hover:bg-sky-500/30">使う</Button>
      </div>
    </section>
  )
}

type PetRewardRequest = {
  id: number
  sourceKey: string
  status: 'pending' | 'rejected' | 'paid'
  txHash: string | null
}

type PetLevelReward = PetDefinition['levelRewards'][number]

const GACHA_REWARD_PET_IDS = ['nyarushian', 'takuya', 'leon', 'chinge', 'tdn', 'whip'] as const
type GachaRewardPetId = typeof GACHA_REWARD_PET_IDS[number]
type CharacterRewardAmount = { lv20: number; lv30: number }

type PetRewardAmounts = {
  festivalLv15: number
  gachaLv20: number
  gachaLv30: number
  character: Partial<Record<GachaRewardPetId, CharacterRewardAmount>>
}

const DEFAULT_PET_REWARD_AMOUNTS: PetRewardAmounts = {
  festivalLv15: 30_000,
  gachaLv20: 50_000,
  gachaLv30: 250_000,
  character: {},
}

const PET_DISPLAY_NAMES: Record<PetId, string> = {
  nyarushian: 'ニャルシアン',
  takuya: '拓也',
  leon: 'レオン',
  chinge: 'チンゲ',
  tdn: 'TDN',
  whip: 'ホイップ',
  'inmu-festival': 'INMUくん（810祭りVer.）',
}

function formatRewardInmu(amount: number) {
  return `${amount.toLocaleString('ja-JP')} INMU`
}

function isGachaRewardPetId(petId: PetId): petId is GachaRewardPetId {
  return (GACHA_REWARD_PET_IDS as readonly string[]).includes(petId)
}

function getRewardAmountForPet(rewardAmounts: PetRewardAmounts, petId: PetId, level: 20 | 30) {
  if (!isGachaRewardPetId(petId)) return level === 20 ? rewardAmounts.gachaLv20 : rewardAmounts.gachaLv30
  const characterAmount = rewardAmounts.character[petId]
  return level === 20
    ? characterAmount?.lv20 ?? rewardAmounts.gachaLv20
    : characterAmount?.lv30 ?? rewardAmounts.gachaLv30
}

function getDisplayLevelRewards(pet: PetDefinition, rewardAmounts: PetRewardAmounts): PetLevelReward[] {
  const petName = PET_DISPLAY_NAMES[pet.id] ?? pet.name

  if (pet.id === 'inmu-festival') {
    return pet.levelRewards.map(reward => {
      if (reward.level !== 15) return reward
      return {
        ...reward,
        label: formatRewardInmu(rewardAmounts.festivalLv15),
        detail: '購入申請還元率 +5%（全対象）',
        delivery: '申請式（承認後送金）',
        inmuAmount: rewardAmounts.festivalLv15,
      }
    })
  }

  if (pet.id === 'nyarushian' || pet.id === 'takuya' || pet.id === 'leon' || pet.id === 'chinge' || pet.id === 'tdn' || pet.id === 'whip') {
    const lv20Amount = getRewardAmountForPet(rewardAmounts, pet.id, 20)
    const lv30Amount = getRewardAmountForPet(rewardAmounts, pet.id, 30)
    return pet.levelRewards.map(reward => {
      if (reward.level === 20) {
        return {
          ...reward,
          label: `${petName} Lv.20報酬 + ${formatRewardInmu(lv20Amount)}`,
          detail: 'INMU報酬は申請式です。管理画面で送金済み後に反映されます。',
          delivery: '申請式（承認後送金）',
          inmuAmount: lv20Amount,
        }
      }
      if (reward.level === 30) {
        return {
          ...reward,
          label: `${petName} Lv.30報酬 + ${formatRewardInmu(lv30Amount)} + 購入申請還元 +5%`,
          detail: `INMU合計 ${formatRewardInmu(lv20Amount + lv30Amount)} / 購入申請還元 +5%`,
          delivery: '申請式（承認後送金）',
          inmuAmount: lv30Amount,
        }
      }
      return reward
    })
  }

  return [...pet.levelRewards]
}

const PET_REWARD_STATUS_LABEL: Record<PetRewardRequest['status'], string> = {
  pending: '申請中',
  rejected: '却下',
  paid: '送金済み',
}

function RewardsPanel({
  pet,
  level,
  rewards,
  requests,
  requestBusy,
  onRequest,
}: {
  pet: PetDefinition
  level: number
  rewards: readonly PetLevelReward[]
  requests: readonly PetRewardRequest[]
  requestBusy: string | null
  onRequest: (pet: PetDefinition, level: number) => void
}) {
  return (
    <section className="rounded-lg border border-amber-300/15 bg-[#0d0916] p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-100"><Gift className="size-4 text-amber-300" />レベル報酬</h2>
      <div className="flex flex-col gap-2">
        {rewards.map(reward => {
          const unlocked = level >= reward.level
          const sourceKey = `pet:${pet.id}:level:${reward.level}`
          const request = requests.find(candidate => candidate.sourceKey === sourceKey)
          return (
            <div key={reward.level} className={cn('flex items-center gap-2 rounded-md border px-2.5 py-2', unlocked ? 'border-amber-300/30 bg-amber-300/10' : 'border-white/5 bg-black/20')}>
              {unlocked ? <Gift className="size-4 shrink-0 text-amber-300" /> : <LockKeyhole className="size-4 shrink-0 text-muted-foreground" />}
              <span className="shrink-0 font-mono text-xs font-bold text-amber-200">Lv.{reward.level}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-bold text-foreground/90">{reward.label}</p>
                {reward.detail && <p className="mt-0.5 break-words text-[10px] leading-relaxed text-amber-200/75">{reward.detail}</p>}
                {reward.delivery && <p className="mt-1 inline-flex rounded border border-cyan-300/20 bg-cyan-300/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-200">{reward.delivery}</p>}
                {reward.inmuAmount && unlocked && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(request) || requestBusy === sourceKey}
                    onClick={() => onRequest(pet, reward.level)}
                    className={cn(
                      'mt-2 min-h-9 w-full text-[10px] font-bold',
                      request?.status === 'paid'
                        ? 'bg-emerald-600/20 text-emerald-200'
                        : 'border border-fuchsia-300/35 bg-fuchsia-500/20 text-fuchsia-100 hover:bg-fuchsia-500/30',
                    )}
                  >
                    {requestBusy === sourceKey
                      ? '申請しています…'
                      : request
                        ? PET_REWARD_STATUS_LABEL[request.status]
                        : 'INMU報酬を申請する'}
                  </Button>
                )}
                {request?.txHash && <p className="mt-1 break-all text-[8px] text-muted-foreground">Tx: {request.txHash}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SkillActivationGrid({
    ownedPetIds,
    skillActiveCharacterIds,
    petStats,
    onSetSkillCharacter,
    onUnsetSkillCharacter,
    skillLockStatus,
  }: {
    ownedPetIds: readonly PetId[]
    skillActiveCharacterIds: PetId[]
    petStats: Record<PetId, PetStats>
    onSetSkillCharacter: (id: PetId) => void
    onUnsetSkillCharacter: (id: PetId) => void
    skillLockStatus?: Record<string, boolean>
  }) {
    const [pickerOpen, setPickerOpen] = useState(false)
    const [previewId, setPreviewId] = useState<PetId | null>(null)
    const activePets = skillActiveCharacterIds.map(id => PET_BY_ID[id]).filter(Boolean)
    const previewPet = previewId ? PET_BY_ID[previewId] : null
    const owned = ownedPetIds.map(id => PET_BY_ID[id]).filter(pet => Boolean(pet) && !skillActiveCharacterIds.includes(pet.id))

    function closePicker() {
      setPickerOpen(false)
      setPreviewId(null)
    }

    function confirmPreview() {
      if (!previewId) return
      onSetSkillCharacter(previewId)
      closePicker()
    }

    return (
      <div>
        <p className="mb-1.5 text-[9px] leading-tight text-cyan-100/60">スキル効果を本日中に使用すると「外す」がロックされます（毎日0:00にリセット）</p>
        <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map(slotIndex => {
              const activePet = activePets[slotIndex]
              if (!activePet) {
                return (
                  <button
                    key={`empty-${slotIndex}`}
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-cyan-300/30 bg-black/20 text-2xl font-black text-cyan-200/70 transition-colors hover:border-cyan-300/50 hover:text-cyan-200"
                  >
                    +
                  </button>
                )
              }
              return (
                <div key={activePet.id} className="flex flex-col overflow-hidden rounded-lg border border-cyan-300/25 bg-cyan-300/5">
                  <div className="relative flex aspect-square w-full items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_65%,rgba(34,211,238,.2),transparent_68%)]">
                    {activePet.roomTheme === 'festival'
                      ? <FestivalCharacter image={activePet.image} expression="default" name={activePet.name} className="h-full w-full" />
                      : <img src={activePet.image} alt="" className="max-h-full max-w-full object-contain" />}
                  </div>
                  <div className="flex flex-col gap-0.5 p-1">
                    <p className="truncate text-[10px] font-bold text-white">{activePet.name}</p>
                    <Button type="button" size="sm" disabled={Boolean(skillLockStatus?.[activePet.id])} onClick={() => onUnsetSkillCharacter(activePet.id)} className="h-5 w-full shrink-0 border border-rose-300/35 bg-rose-500/15 px-1 text-[9px] text-rose-100 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40">{skillLockStatus?.[activePet.id] ? 'ロック中' : '外す'}</Button>
                  </div>
                </div>
              )
            })}
        </div>

        <Dialog open={pickerOpen} onOpenChange={open => { if (!open) closePicker() }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{previewPet ? previewPet.name : '固有スキルを発動するキャラクターを選択'}</DialogTitle>
            </DialogHeader>
            {previewPet ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3">
                  <div className="flex size-16 shrink-0 items-end justify-center overflow-hidden rounded-md bg-[radial-gradient(circle_at_50%_65%,rgba(34,211,238,.2),transparent_68%)]">
                    {previewPet.roomTheme === 'festival'
                      ? <FestivalCharacter image={previewPet.image} expression="default" name={previewPet.name} className="h-full w-full" />
                      : <img src={previewPet.image} alt="" className="max-h-full max-w-full object-contain" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-white">{previewPet.name}</p>
                    <p className="mt-1 break-words text-xs leading-relaxed text-cyan-100/80">{previewPet.skill.effect}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="min-h-10 flex-1" onClick={() => setPreviewId(null)}>キャンセル</Button>
                  <Button type="button" className="min-h-10 flex-1 border border-fuchsia-300/35 bg-fuchsia-500/20 text-fuchsia-100 hover:bg-fuchsia-500/30" onClick={confirmPreview}>セットする</Button>
                </div>
              </div>
            ) : (
              <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
                {owned.map(candidate => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setPreviewId(candidate.id)}
                    className="overflow-hidden rounded-lg border border-violet-300/15 bg-[#0d0916] text-left transition-colors hover:border-violet-300/40"
                  >
                    <div className="relative flex aspect-square items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_65%,rgba(126,34,206,.2),transparent_67%)] px-1.5 pt-1.5">
                      {candidate.roomTheme === 'festival'
                        ? <FestivalCharacter image={candidate.image} expression="default" name={candidate.name} className="h-full w-full" />
                        : <img src={candidate.image} alt="" className="max-h-full max-w-full object-contain" />}
                    </div>
                    <div className="border-t border-white/5 p-1.5">
                      <p className="truncate text-[10px] font-bold">{candidate.name}</p>
                      <span className="rounded bg-cyan-400/10 px-1 py-0.5 font-mono text-[9px] font-bold text-cyan-200">Lv.{petStats[candidate.id]?.level ?? 1}</span>
                    </div>
                  </button>
                ))}
                {owned.length === 0 && <p className="col-span-3 rounded-lg border border-violet-300/10 bg-black/20 px-3 py-6 text-center text-xs text-muted-foreground">選択可能なキャラクターがいません</p>}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

function SkillActivationButton(props: {
  ownedPetIds: readonly PetId[]
  skillActiveCharacterIds: PetId[]
  petStats: Record<PetId, PetStats>
  onSetSkillCharacter: (id: PetId) => void
  onUnsetSkillCharacter: (id: PetId) => void
  skillLockStatus?: Record<string, boolean>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-16 w-full flex-col gap-0.5 rounded-md border-cyan-300/30 bg-cyan-300/5 px-1 text-cyan-100 hover:bg-cyan-300/10"
      >
        <span className="flex items-center gap-1.5"><Sparkles className="size-4" /><span className="text-xs font-bold">固有スキル発動</span></span>
        <span className="font-mono text-[10px] text-cyan-200">{props.skillActiveCharacterIds.length} / 3</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>固有スキル発動</DialogTitle></DialogHeader>
          <SkillActivationGrid {...props} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function getAchievedRebateLabel(pet: PetDefinition, level: number): string | null {
  const total = pet.levelRewards
    .filter(reward => (reward.rebateBonus ?? 0) > 0 && level >= reward.level)
    .reduce((sum, reward) => sum + (reward.rebateBonus ?? 0), 0)
  return total > 0 ? `購入申請還元 +${total}%` : null
}

function LevelRewardEffectGrid({
    activePets,
    unlockedSlots,
    petStats,
    ownedPetIds,
    slotBusy,
    slotPrices,
    onAdd,
    onRemove,
    onUnlock,
  }: {
    activePets: PetDefinition[]
    unlockedSlots: number
    petStats: Record<PetId, PetStats>
    ownedPetIds: readonly PetId[]
    slotBusy: boolean
    slotPrices: { slot2: number; slot3: number }
    onAdd: (id: PetId) => void
    onRemove: (id: PetId) => void
    onUnlock: () => void
  }) {
    const [pickerOpen, setPickerOpen] = useState(false)
    const [confirmUnlockOpen, setConfirmUnlockOpen] = useState(false)
    const owned = ownedPetIds
      .map(id => PET_BY_ID[id])
      .filter((candidate): candidate is PetDefinition => Boolean(candidate) && !activePets.some(active => active.id === candidate.id))
    const nextUnlockPrice = unlockedSlots === 1 ? slotPrices.slot2 : slotPrices.slot3

    return (
      <div>
        <p className="mb-1.5 text-[9px] leading-tight text-fuchsia-100/60">枠を解放してキャラクターをセットすると、レベル報酬効果（購入申請還元など）が発動します。</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map(slotIndex => {
            const slotNumber = slotIndex + 1
            const locked = slotNumber > unlockedSlots
            const activePet = activePets[slotIndex]

            if (locked) {
              const isNextUnlockable = slotNumber === unlockedSlots + 1
              return (
                <button
                  key={`locked-${slotNumber}`}
                  type="button"
                  disabled={!isNextUnlockable || slotBusy}
                  onClick={() => isNextUnlockable && setConfirmUnlockOpen(true)}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-black/25 px-1 text-center text-muted-foreground transition-colors enabled:hover:border-amber-300/40 enabled:hover:text-amber-200 disabled:cursor-not-allowed"
                >
                  <LockKeyhole className="size-4" />
                  <span className="text-[9px] font-bold">未解放</span>
                  {isNextUnlockable && <span className="font-mono text-[8px] text-amber-200/80">{nextUnlockPrice.toLocaleString()} INMU</span>}
                </button>
              )
            }

            if (!activePet) {
              return (
                <button
                  key={`empty-${slotIndex}`}
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-fuchsia-300/30 bg-black/20 text-2xl font-black text-fuchsia-200/70 transition-colors hover:border-fuchsia-300/50 hover:text-fuchsia-200"
                >
                  +
                </button>
              )
            }

            const stats = petStats[activePet.id]
            const rebateLabel = stats ? getAchievedRebateLabel(activePet, stats.level) : null

            return (
              <div key={activePet.id} className="flex flex-col overflow-hidden rounded-lg border border-fuchsia-300/25 bg-fuchsia-300/5">
                <div className="relative flex aspect-square w-full items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_65%,rgba(232,121,249,.2),transparent_68%)]">
                  {activePet.roomTheme === 'festival'
                    ? <FestivalCharacter image={activePet.image} expression="default" name={activePet.name} className="h-full w-full" />
                    : <img src={activePet.image} alt="" className="max-h-full max-w-full object-contain" />}
                </div>
                <div className="flex flex-col gap-0.5 p-1">
                  <p className="truncate text-[10px] font-bold text-white">{activePet.name}</p>
                  <p className="text-center text-[9px] font-bold text-emerald-300">解放中</p>
                  {rebateLabel && <p className="truncate text-center text-[8px] font-semibold text-amber-200">{rebateLabel}</p>}
                  <Button type="button" size="sm" onClick={() => onRemove(activePet.id)} className="h-5 w-full shrink-0 border border-rose-300/35 bg-rose-500/15 px-1 text-[9px] text-rose-100 hover:bg-rose-500/25">外す</Button>
                </div>
              </div>
            )
          })}
        </div>

        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>レベル報酬効果を発動するキャラクターを選択</DialogTitle></DialogHeader>
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
              {owned.map(candidate => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => { onAdd(candidate.id); setPickerOpen(false) }}
                  className="overflow-hidden rounded-lg border border-violet-300/15 bg-[#0d0916] text-left transition-colors hover:border-violet-300/40"
                >
                  <div className="relative flex aspect-square items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_65%,rgba(126,34,206,.2),transparent_67%)] px-1.5 pt-1.5">
                    {candidate.roomTheme === 'festival'
                      ? <FestivalCharacter image={candidate.image} expression="default" name={candidate.name} className="h-full w-full" />
                      : <img src={candidate.image} alt="" className="max-h-full max-w-full object-contain" />}
                  </div>
                  <div className="border-t border-white/5 p-1.5">
                    <p className="truncate text-[10px] font-bold">{candidate.name}</p>
                    <span className="rounded bg-cyan-400/10 px-1 py-0.5 font-mono text-[9px] font-bold text-cyan-200">Lv.{petStats[candidate.id]?.level ?? 1}</span>
                  </div>
                </button>
              ))}
              {owned.length === 0 && <p className="col-span-3 rounded-lg border border-violet-300/10 bg-black/20 px-3 py-6 text-center text-xs text-muted-foreground">セットできるキャラクターがいません</p>}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmUnlockOpen} onOpenChange={setConfirmUnlockOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>枠 {unlockedSlots + 1} の解放を確認</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Phantomウォレットから {nextUnlockPrice.toLocaleString()} INMU を送金します。よろしいですか？</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="min-h-10 flex-1" onClick={() => setConfirmUnlockOpen(false)}>キャンセル</Button>
                <Button type="button" className="min-h-10 flex-1 border border-amber-200/40 bg-amber-300/20 text-amber-100 hover:bg-amber-300/30" onClick={() => { setConfirmUnlockOpen(false); onUnlock() }}>送金して解放する</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

function LevelRewardEffectButton(props: {
  activePets: PetDefinition[]
  unlockedSlots: number
  petStats: Record<PetId, PetStats>
  ownedPetIds: readonly PetId[]
  slotBusy: boolean
  slotPrices: { slot2: number; slot3: number }
  onAdd: (id: PetId) => void
  onRemove: (id: PetId) => void
  onUnlock: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-16 w-full flex-col gap-0.5 rounded-md border-fuchsia-300/30 bg-fuchsia-300/5 px-1 text-fuchsia-100 hover:bg-fuchsia-300/10"
      >
        <span className="flex items-center gap-1.5"><Gift className="size-4" /><span className="text-xs font-bold">レベル報酬効果発動</span></span>
        <span className="font-mono text-[10px] text-fuchsia-200">{props.activePets.length} / 3</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>レベル報酬効果発動</DialogTitle></DialogHeader>
          <LevelRewardEffectGrid {...props} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function CharacterSelectStrip({
  pets,
  displayedPetId,
  onSelect,
}: {
  pets: PetDefinition[]
  displayedPetId: PetId
  onSelect: (id: PetId) => void
}) {
  if (pets.length === 0) return null
  return (
    <section className="rounded-lg border border-violet-300/20 bg-[#0d0916] p-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">育成キャラクター選択</p>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {pets.map(candidate => {
          const isSelected = candidate.id === displayedPetId
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onSelect(candidate.id)}
              className={cn(
                'flex size-16 shrink-0 items-end justify-center overflow-hidden rounded-lg border bg-[radial-gradient(circle_at_50%_65%,rgba(168,85,247,.18),transparent_67%)] transition-colors',
                isSelected ? 'border-fuchsia-300/70 shadow-[0_0_0_2px_rgba(232,121,249,.25)]' : 'border-violet-300/15 hover:border-violet-300/40',
              )}
            >
              {candidate.roomTheme === 'festival'
                ? <FestivalCharacter image={candidate.image} expression="default" name={candidate.name} className="h-full w-full" />
                : <img src={candidate.image} alt={candidate.name} className="max-h-full max-w-full object-contain" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function PetPage() {
  const { profile, unread } = useAuth()
  const { selectedPetId, activePetIds, petStats, cooldownUntil, lastCareAt, expressionState, premiumFood, items, isSleeping, isWalking, walkRemaining, walks, affectionGifts, depressionMessage, selectPet, setActivePetIds, care, setExpression, useSleepTea, startWalk, markWalkResultSeen, markWalkPointsGranted, markAffectionGiftPointsGranted, maxLevel, isHydrated, syncError, skillActiveCharacterIds, setSkillActiveCharacterIds, skillLockStatus, refreshSkillLockStatus } = usePetState()
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now)
  const [isBlinking, setIsBlinking] = useState(false)
  const [isYawning, setIsYawning] = useState(false)
  const [walkTick, setWalkTick] = useState(0)
  const [careMenu, setCareMenu] = useState<PetCareCategory | null>(null)
  const [walkMenuOpen, setWalkMenuOpen] = useState(false)
  const [walkResult, setWalkResult] = useState<PetWalkResult | null>(null)
  const [reactionMotion, setReactionMotion] = useState<ReactionMotion>(null)
  const [speechBubble, setSpeechBubble] = useState('')
  const [ownedPetIds, setOwnedPetIds] = useState<PetId[] | null>(null)
  const [ownershipError, setOwnershipError] = useState(false)
  const [unlockedSlots, setUnlockedSlots] = useState(1)
  const [slotBusy, setSlotBusy] = useState(false)
  const [slotPrices, setSlotPrices] = useState({ slot2: 1_000_000, slot3: 2_000_000 })
  const [petRewardAmounts, setPetRewardAmounts] = useState(DEFAULT_PET_REWARD_AMOUNTS)
  const [rewardRequests, setRewardRequests] = useState<PetRewardRequest[]>([])
  const [rewardRequestBusy, setRewardRequestBusy] = useState<string | null>(null)
  const levelRewardSyncRef = useRef(new Set<string>())
  const walkPointGrantRef = useRef(new Set<string>())
  const affectionGiftPointGrantRef = useRef(new Set<string>())
  const [balances, setBalances] = useState({ inmu: 0, points: 0 })

  const loadRewardRequests = async () => {
    try {
      const response = await fetch('/api/pet/reward-requests', { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json() as PetRewardRequest[]
      setRewardRequests(Array.isArray(data) ? data : [])
    } catch {
      // The room remains usable if request history cannot be loaded.
    }
  }

  const requestLevelReward = async (targetPet: PetDefinition, reachedLevel: number) => {
    const sourceKey = `pet:${targetPet.id}:level:${reachedLevel}`
    setRewardRequestBusy(sourceKey)
    try {
      const response = await fetch('/api/pet/reward-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: targetPet.id, reachedLevel }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? '報酬申請に失敗しました')
      toast.success('INMU報酬を申請しました。運営の送金をお待ちください。')
      await loadRewardRequests()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '報酬申請に失敗しました')
    } finally {
      setRewardRequestBusy(null)
    }
  }

  useEffect(() => { void loadRewardRequests() }, [])

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/pet-prices', { credentials: 'include' })
        if (!response.ok) return
        const data = await response.json() as Record<string, number | undefined>
        const readNumber = (key: string, fallback: number) => Number.isFinite(data[key]) ? Number(data[key]) : fallback
        const gachaLv20 = readNumber('reward_gacha_lv20_inmu', DEFAULT_PET_REWARD_AMOUNTS.gachaLv20)
        const gachaLv30 = readNumber('reward_gacha_lv30_inmu', DEFAULT_PET_REWARD_AMOUNTS.gachaLv30)
        setSlotPrices({
          slot2: readNumber('slot_unlock_2_inmu', 1_000_000),
          slot3: readNumber('slot_unlock_3_inmu', 2_000_000),
        })
        setPetRewardAmounts({
          festivalLv15: readNumber('reward_level_inmu', DEFAULT_PET_REWARD_AMOUNTS.festivalLv15),
          gachaLv20,
          gachaLv30,
          character: Object.fromEntries(GACHA_REWARD_PET_IDS.map(petId => [
            petId,
            {
              lv20: readNumber(`reward_${petId}_lv20_inmu`, gachaLv20),
              lv30: readNumber(`reward_${petId}_lv30_inmu`, gachaLv30),
            },
          ])) as Record<GachaRewardPetId, CharacterRewardAmount>,
        })
      } catch {
        // Keep default prices if they cannot be loaded.
      }
    })()
  }, [])

  const loadSlotStatus = async () => {
    try {
      const response = await fetch('/api/pet-commerce/status', { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json() as { unlockedSlots?: number }
      setUnlockedSlots(Math.min(3, Math.max(1, Number(data.unlockedSlots ?? 1))))
    } catch {
      // Keep the first slot available if status cannot be loaded.
    }
  }

  useEffect(() => { void loadSlotStatus() }, [])

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
  const displayedPetId = (ownedPetIds ?? []).includes(selectedPetId) ? selectedPetId : ((ownedPetIds ?? [])[0] ?? 'inmu-festival')
  const pet = PET_BY_ID[displayedPetId] ?? PET_BY_ID['inmu-festival']
  const selectedStats = petStats[displayedPetId] ?? petStats['inmu-festival'] ?? {
    level: 1,
    exp: 0,
    fullness: 50,
    sleepiness: 20,
    affection: 50,
  }
  const activePets = activePetIds.map(id => PET_BY_ID[id]).filter(Boolean)
  const ownedPets = (ownedPetIds ?? []).map(id => PET_BY_ID[id]).filter(Boolean)
  const hasOwnedPet = (ownedPetIds?.length ?? 0) > 0

  useEffect(() => {
    if (!isHydrated || displayedPetId !== 'inmu-festival' || selectedStats.level < 10 || !ownedPetIds?.includes(displayedPetId)) return
    const key = `${displayedPetId}:10`
    if (levelRewardSyncRef.current.has(key)) return
    levelRewardSyncRef.current.add(key)
    void fetch('/api/pet/level-rewards/claim', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: displayedPetId, currentLevel: selectedStats.level }),
    }).then(async response => {
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'ポイント報酬の受取に失敗しました')
      if (!data.alreadyClaimed) {
        toast.success('Lv.10報酬として100,000ポイントを受け取りました！')
        setBalances(current => ({ ...current, points: current.points + 100_000 }))
      }
    }).catch(error => {
      levelRewardSyncRef.current.delete(key)
      toast.error(error instanceof Error ? error.message : 'ポイント報酬の受取に失敗しました')
    })
  }, [displayedPetId, isHydrated, ownedPetIds, selectedStats.level])

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
        : selectedStats.affection <= 19 && statusExpressionWindow
          ? (Math.floor(now / 8000) % 2 === 0 ? 'annoyed' : 'angry')
          : selectedStats.affection >= 100 && statusExpressionWindow
            ? 'affectionate'
            : selectedStats.affection >= 50 && statusExpressionWindow
              ? 'happy'
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
    const latest = walks.results.find(result => result.petId === displayedPetId && !result.seen)
    if (latest) setWalkResult(current => current?.id === latest.id ? current : latest)
  }, [displayedPetId, walks.results])

  useEffect(() => {
    const pending = walks.results.filter(result => result.rewardType === 'points' && result.pointsGrantStatus !== 'granted')
    pending.forEach(result => {
      if (walkPointGrantRef.current.has(result.id)) return
      walkPointGrantRef.current.add(result.id)
      void fetch('/api/pet/walk/point-grant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId: result.id, amount: result.rewardAmount }),
      }).then(response => {
        if (response.ok) {
          markWalkPointsGranted(result.id)
          setBalances(current => ({ ...current, points: current.points + result.rewardAmount }))
        }
      }).catch(() => {
        walkPointGrantRef.current.delete(result.id)
      })
    })
  }, [markWalkPointsGranted, walks.results])

  useEffect(() => {
    const pending = affectionGifts.filter(gift => gift.rewardType === 'points' && gift.pointsGrantStatus !== 'granted')
    pending.forEach(gift => {
      if (affectionGiftPointGrantRef.current.has(gift.id)) return
      affectionGiftPointGrantRef.current.add(gift.id)
      void fetch('/api/pet/affection-gift/point-grant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId: gift.id, amount: gift.rewardAmount }),
      }).then(response => {
        if (response.ok) {
          markAffectionGiftPointsGranted(gift.id)
          setBalances(current => ({ ...current, points: current.points + gift.rewardAmount }))
        }
      }).catch(() => {
        affectionGiftPointGrantRef.current.delete(gift.id)
      })
    })
  }, [affectionGifts, markAffectionGiftPointsGranted])

  useEffect(() => {
    const preloadUrls = new Set(PET_DEFINITIONS.flatMap(candidate => [
      ...Object.values(candidate.expressions),
      ...candidate.walk.frames,
      candidate.roomImage,
    ]).filter((url): url is string => Boolean(url)))
    preloadUrls.forEach(url => { const image = new Image(); image.src = url })
  }, [])

  useEffect(() => {
    if (ownedPetIds && ownedPetIds.length > 0 && !ownedPetIds.includes(selectedPetId)) selectPet(ownedPetIds[0])
  }, [ownedPetIds, selectedPetId])

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
        if (owned.length > 0) {
          setActivePetIds(current =>
            current
              .filter((id, index, list) => owned.includes(id) && list.indexOf(id) === index)
              .slice(0, 3),
          )
        }
        if (owned.length > 0 && !owned.includes(selectedPetId)) selectPet(owned[0])
      } catch {
        if (!cancelled) {
          setOwnedPetIds([])
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
  }, [selectedPetId])

  const refreshBalances = useCallback(async (connect = false) => {
    try {
      const dashboard = await fetch('/api/dashboard', { credentials: 'include' })
        .then(response => response.ok ? response.json() : null)
        .catch(() => null)
      const points = Number(dashboard?.monthlyPoints) || 0
      let inmu: number | null = await fetchConnectedPhantomInmuBalance(connect)
      if (inmu === null) {
        try {
          inmu = await fetchMyInmuBalance()
        } catch {
          const wallet = (profile as any)?.solWallet ?? (profile as any)?.walletAddress ?? ''
          inmu = wallet ? await fetchInmuBalanceForWallet(wallet) : 0
        }
      }
      setBalances({ inmu: Number(inmu) || 0, points })
    } catch {
      setBalances(current => ({ ...current, inmu: 0 }))
    }
  }, [profile])

  useEffect(() => {
    void refreshBalances(false)
  }, [refreshBalances])

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
    if (isWalking) { setMessage('散歩中のためお世話できません'); return }
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
      if (isWalking) { setMessage('散歩中のためお世話できません'); return false }
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
    const duration = result.expressionUntil
      ? Math.max(0, result.expressionUntil - actionNow)
      : pet.reactionDurations[result.motion]
    setExpression(result.expression, duration, actionNow)
    setReactionMotion(result.motion)
    const careSpeech = result.message === 'overpetted' ? pet.messages.overpetted : pickRandom(pet.dialogues.care) ?? ''
    if (speechResetTimer.current) clearTimeout(speechResetTimer.current)
    setSpeechBubble(careSpeech)
    setMessage({
      fed: 'ご飯をあげました',
      played: '一緒に遊びました',
      petted: 'うれしそうにしています',
      overpetted: pet.messages.overpetted,
    }[result.message] ?? '')
    setCareMenu(null)
    if (motionTimer.current) clearTimeout(motionTimer.current)
    motionTimer.current = setTimeout(() => {
      setReactionMotion(null)
      setSpeechBubble('')
    }, duration)
    return true
  }

  function handlePet() {
    if (isWalking) {
      setMessage('散歩中のためお世話できません')
      return
    }
    handleCare('pet')
  }

  function handleUseSleepTea(amount: number) {
    if (isWalking) {
      setMessage('散歩中のためアイスティーを使用できません')
      return
    }
    if (walks.sleepTeaBlockedDate[displayedPetId] === walks.dailyDate) {
      setMessage('今日はこのキャラクターにアイスティーを使用できません')
      return
    }
    if (isSleeping) {
      setMessage('眠っている間はアイスティーを使用できません')
      return
    }
    const used = useSleepTea(amount)
    if (used <= 0) {
      setMessage(
        selectedStats.level >= maxLevel
          ? 'レベルは既に最大です'
          : selectedStats.sleepiness >= 100 - 32
            ? '眠気が100を超えるため使用できません'
            : 'アイスティーを所持していません',
      )
      return
    }
    setNow(Date.now())
    setMessage(`アイスティーを${used}個使用しました。Lv.+${used}、眠気+${33 * used}`)
    setExpression('sleepy', 4200)
  }

  function handleStartWalk(item: PetWalkItem) {
    const result = startWalk(item)
    if (!result.ok) {
      setMessage({
        sleeping: '眠っているため散歩に行けません',
        walking: 'すでに散歩中です',
        daily_limit: '本日の散歩回数は上限です',
        pet_daily_limit: 'このキャラクターは本日すでに散歩済みです',
        no_item: '使用するアイテムを所持していません',
      }[result.reason] ?? '散歩を開始できません')
      return
    }
    setWalkMenuOpen(false)
    setNow(Date.now())
    setMessage(result.special ? '罵声を浴びせられてうつ状態' : '散歩に出かけました')
  }

  function closeWalkResult() {
    if (walkResult) markWalkResultSeen(walkResult.id)
    setWalkResult(null)
    void refreshBalances(false)
  }

  function handleSelect(id: PetId) {
    setIsBlinking(false)
    setReactionMotion(null)
    setSpeechBubble('')
    setCareMenu(null)
    setWalkMenuOpen(false)
    selectPet(id)
    setMessage('')
  }

  function handleAddRewardSlot(id: PetId) {
    if (!ownedPetIds?.includes(id) || activePetIds.includes(id) || activePetIds.length >= unlockedSlots) return
    setActivePetIds(current => [...current, id])
    setMessage(`${PET_BY_ID[id].name}のレベル報酬効果を発動しました`)
  }

  function handleRemoveSlot(id: PetId) {
    setActivePetIds(current => current.filter(existingId => existingId !== id))
    setMessage(`${PET_BY_ID[id].name}を育成から外しました`)
  }

  function handleSetSkillCharacter(id: PetId) {
    if (!ownedPetIds?.includes(id) || skillActiveCharacterIds.includes(id) || skillActiveCharacterIds.length >= 3) return
    setSkillActiveCharacterIds(current => [...current, id])
    setMessage(`${PET_BY_ID[id].name}の固有スキルを発動しました`)
  }

  function handleUnsetSkillCharacter(id: PetId) {
    if (!skillActiveCharacterIds.includes(id)) return
    if (skillLockStatus?.[id]) { setMessage(`${PET_BY_ID[id].name}は本日のスキル効果を使用済みのため外せません（0:00にリセット）`); return }
    setMessage(`${PET_BY_ID[id].name}の固有スキルを外しました`)
    setSkillActiveCharacterIds(current => current.filter(existingId => existingId !== id))
  }

  async function unlockNextSlot() {
    if (slotBusy || unlockedSlots >= 3) return
    const price = unlockedSlots === 1 ? slotPrices.slot2 : slotPrices.slot3
    if (!getPhantomProvider()) {
      if (isMobileBrowser()) {
        localStorage.setItem('inmu-pet-slot-unlock-intent', String(unlockedSlots + 1))
        toast.info('Phantomアプリで開きます…')
        window.setTimeout(openInPhantomBrowser, 400)
      } else toast.error('Phantomウォレットをインストールしてください')
      return
    }
    setSlotBusy(true)
    try {
      const txId = await sendInmuWithPhantom('Hatp1W4QCzr7GAVbnQqKTVW2BmX7sRaf7jeHJMvETeU4', price, progress => setMessage(progress))
      localStorage.setItem('inmu-pet-slot-unlock-pending', JSON.stringify({ txId, slotNumber: unlockedSlots + 1 }))
      const response = await fetch('/api/pet-slots/unlock', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? '育成枠の解放に失敗しました')
      localStorage.removeItem('inmu-pet-slot-unlock-pending')
      setUnlockedSlots(Number(data.unlockedSlots))
      void refreshBalances(false)
      toast.success(`育成枠${data.slotNumber}を解放しました`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '育成枠の解放に失敗しました')
    } finally {
      setSlotBusy(false)
      setMessage('')
    }
  }

  useEffect(() => {
    if (!getPhantomProvider()) return
    if (localStorage.getItem('inmu-pet-slot-unlock-intent')) {
      localStorage.removeItem('inmu-pet-slot-unlock-intent')
      toast.info('育成枠の解放ボタンを押して送金を続けてください')
    }
    const pendingRaw = localStorage.getItem('inmu-pet-slot-unlock-pending')
    if (!pendingRaw || slotBusy) return
    try {
      const pending = JSON.parse(pendingRaw) as { txId: string }
      setSlotBusy(true)
      void fetch('/api/pet-slots/unlock', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txId: pending.txId }),
      }).then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? '育成枠の復旧に失敗しました')
        localStorage.removeItem('inmu-pet-slot-unlock-pending')
        setUnlockedSlots(Number(data.unlockedSlots))
        void refreshBalances(false)
        toast.success(`育成枠${data.slotNumber}を解放しました`)
      }).catch(error => toast.error(error instanceof Error ? error.message : '育成枠の復旧に失敗しました')).finally(() => setSlotBusy(false))
    } catch {
      localStorage.removeItem('inmu-pet-slot-unlock-pending')
    }
  }, [refreshBalances, slotBusy])

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

        {!isHydrated && <p className="rounded-md border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-100">育成データを同期しています…</p>}
        {syncError && <p className="rounded-md border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{syncError} 一時データを表示しています。</p>}

        {ownedPetIds === null ? (
          <div className="flex min-h-64 items-center justify-center rounded-lg border border-violet-300/15 bg-black/25 text-sm text-muted-foreground">所持キャラクターを読み込んでいます…</div>
        ) : !hasOwnedPet ? (
          <div className="space-y-3">
            <section className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-fuchsia-400/20 bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,.16),transparent_55%),#090611] px-6 text-center">
              <LockKeyhole className="mb-4 size-10 text-fuchsia-300" />
              <h2 className="text-lg font-black text-white">育成キャラクターはまだいません</h2>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
                イベントミッションの報酬を受け取ると、所持キャラクターへ追加されます。
              </p>
              {ownershipError && <p className="mt-3 text-xs text-rose-300">所持情報を取得できませんでした。画面を再読み込みしてください。</p>}
            </section>
            <div className="grid grid-cols-2 gap-2">
              <LevelRewardEffectButton activePets={[]} unlockedSlots={unlockedSlots} petStats={petStats} ownedPetIds={ownedPetIds ?? []} slotBusy={slotBusy} slotPrices={slotPrices} onAdd={handleAddRewardSlot} onRemove={handleRemoveSlot} onUnlock={unlockNextSlot} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <main className="flex min-w-0 flex-col gap-3">
              <CharacterInfo pet={pet} stats={selectedStats} maxLevel={maxLevel} />
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
                isWalking={isWalking}
                walkRemaining={walkRemaining}
                message={depressionMessage || message}
                cooldownRemaining={cooldownRemaining}
                walkMotion={walkMotion}
                reactionMotion={reactionMotion}
                speechBubble={speechBubble}
                onAction={openCareMenu}
                onPet={handlePet}
                onWalk={() => setWalkMenuOpen(true)}
              />
              <CharacterSelectStrip pets={ownedPets} displayedPetId={displayedPetId} onSelect={handleSelect} />
              <div className="grid grid-cols-2 gap-2">
                <SkillActivationButton ownedPetIds={ownedPetIds ?? []} skillActiveCharacterIds={skillActiveCharacterIds} petStats={petStats} onSetSkillCharacter={handleSetSkillCharacter} onUnsetSkillCharacter={handleUnsetSkillCharacter} skillLockStatus={skillLockStatus} />
                <LevelRewardEffectButton activePets={activePets} unlockedSlots={unlockedSlots} petStats={petStats} ownedPetIds={ownedPetIds ?? []} slotBusy={slotBusy} slotPrices={slotPrices} onAdd={handleAddRewardSlot} onRemove={handleRemoveSlot} onUnlock={unlockNextSlot} />
              </div>
              <SkillPanel pet={pet} />
              <ItemPanel inventory={items.sleepTea} level={selectedStats.level} maxLevel={maxLevel} disabled={isSleeping || isWalking || walks.sleepTeaBlockedDate[displayedPetId] === walks.dailyDate} onUse={handleUseSleepTea} />
              <RewardsPanel
                pet={pet}
                level={selectedStats.level}
                rewards={getDisplayLevelRewards(pet, petRewardAmounts)}
                requests={rewardRequests}
                requestBusy={rewardRequestBusy}
                onRequest={requestLevelReward}
              />
            </main>
          </div>
        )}
      </div>
      {hasOwnedPet && <CareChoiceDialog kind={careMenu} premiumFood={premiumFood} actionCooldowns={actionCooldowns} onClose={() => setCareMenu(null)} onChoose={handleCare} />}
      {hasOwnedPet && <WalkChoiceDialog open={walkMenuOpen} walks={walks} items={items} petId={displayedPetId} onClose={() => setWalkMenuOpen(false)} onChoose={handleStartWalk} />}
      <WalkResultDialog result={walkResult} onClose={closeWalkResult} />
    </AppShell>
  )
}

