import type { ElementType, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { PET_BY_ID, PET_DEFINITIONS, type PetDefinition, type PetId } from '@/features/pet/pet-data'
import { usePetState, type PetAction, type PetStats } from '@/features/pet/use-pet-state'
import {
  BookOpen, CircleDollarSign, Coins, Crown, Dumbbell, Gamepad2, Gem,
  Gift, Glasses, Hand, Heart, Leaf, LockKeyhole, Moon, PawPrint, Sparkles, Utensils,
} from 'lucide-react'

const ROOM_ACTIONS: Array<{ id: Exclude<PetAction, 'pet'>; label: string; icon: ElementType; tone: string }> = [
  { id: 'feed', label: 'ご飯', icon: Utensils, tone: 'border-pink-400/50 text-pink-200 shadow-[0_0_18px_rgba(244,114,182,.12)]' },
  { id: 'play', label: '遊ぶ', icon: Gamepad2, tone: 'border-amber-300/50 text-amber-200 shadow-[0_0_18px_rgba(252,211,77,.12)]' },
  { id: 'sleep', label: '寝る', icon: Moon, tone: 'border-cyan-400/50 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,.12)]' },
]

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
  .pet-meter-shine { animation: pet-meter-shine 3.1s ease-in-out infinite; }
  .pet-neon-sign { animation: pet-neon-breathe 3.8s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .pet-meter-shine, .pet-neon-sign { animation: none; }
  }
`

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

function PetRoom({
  petId,
  name,
  image,
  roomWidth,
  roomTheme,
  expression,
  stats,
  isFull,
  message,
  onAction,
  onPet,
}: {
  petId: PetId
  name: string
  image: string
  roomWidth: string
  roomTheme: 'cat' | 'dog' | 'lion'
  expression: 'default' | 'petted'
  stats: PetStats
  isFull: boolean
  message: string
  onAction: (action: Exclude<PetAction, 'pet'>) => void
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
        className="absolute inset-x-0 bottom-[148px] z-10 flex h-[50%] items-end justify-center"
        data-pet-stage
        data-pet-id={petId}
        data-pose="idle"
      >
        <div className="absolute bottom-1 left-1/2 h-7 w-[42%] -translate-x-1/2 rounded-[50%] bg-black/65 blur-md" data-pet-shadow />
        <button
          type="button"
          onClick={onPet}
          aria-label="なでる"
          title="なでる"
          className="absolute left-1/2 top-[3%] z-30 flex size-11 translate-x-[30%] items-center justify-center rounded-full border border-fuchsia-300/50 bg-black/70 text-fuchsia-200 shadow-[0_0_20px_rgba(232,121,249,.4)] backdrop-blur transition-all active:scale-90 active:bg-fuchsia-400/25"
          data-pet-interaction="pet"
        >
          <Hand className="size-6" />
        </button>
        <img
          src={image}
          alt={name}
          className={cn('relative z-10 max-h-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,.55)] transition-[filter,transform] duration-150', expression === 'petted' && 'scale-[.98] brightness-110')}
          style={{ width: roomWidth }}
          data-pet-character
          data-expression={expression}
        />
      </div>

      <div className="absolute inset-x-2 bottom-2 z-30 rounded-lg border border-violet-300/25 bg-[#090611]/92 p-2.5 shadow-[0_-10px_30px_rgba(0,0,0,.38)] backdrop-blur-md sm:inset-x-4 sm:p-3">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatusBar label="満腹度" value={stats.fullness} display={`${stats.fullness}`} icon={<Utensils className="size-4 text-pink-300" />} color="linear-gradient(90deg,#fb7185,#f472b6)" />
          <StatusBar label="眠気" value={stats.sleepiness} display={`${stats.sleepiness}`} icon={<Moon className="size-4 text-cyan-300" />} color="linear-gradient(90deg,#38bdf8,#6366f1)" />
          <StatusBar label="愛情度" value={stats.affection} display={`${stats.affection}`} icon={<Heart className="size-4 fill-fuchsia-400 text-fuchsia-400" />} color="linear-gradient(90deg,#e879f9,#c084fc)" />
        </div>
        <div className="mt-2 flex min-h-4 items-center justify-end">
          <p className="break-words text-right text-[9px] text-cyan-200" role="status">{isFull ? '満腹なのでご飯をあげられません' : message}</p>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {ROOM_ACTIONS.map(action => {
            const Icon = action.icon
            const disabled = action.id === 'feed' && isFull
            return (
              <Button key={action.id} type="button" variant="outline" disabled={disabled} onClick={() => onAction(action.id)} className={cn('h-11 gap-1.5 rounded-md bg-black/35 px-2 text-xs transition-all duration-100 active:scale-[.93] active:brightness-125', action.tone)}>
                <Icon className="size-4" /><span className="font-bold">{action.label}</span>
              </Button>
            )
          })}
        </div>
      </div>
    </section>
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

function CharacterRoster({ selectedPetId, petStats, onSelect, vertical = false }: { selectedPetId: PetId; petStats: Record<PetId, PetStats>; onSelect: (id: PetId) => void; vertical?: boolean }) {
  return (
    <section className={vertical ? '' : 'border-t border-violet-300/15 pt-4'}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-fuchsia-200">所持キャラクター</h2>
        <span className="font-mono text-[10px] text-muted-foreground">3 / 3</span>
      </div>
      <div className={cn(vertical ? 'flex flex-col gap-2' : 'flex snap-x snap-mandatory touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-2 pr-4 scrollbar-none')}>
        {PET_DEFINITIONS.map(candidate => {
          const active = candidate.id === selectedPetId
          const stats = petStats[candidate.id]
          return (
            <button key={candidate.id} type="button" aria-pressed={active} onClick={() => onSelect(candidate.id)} className={cn(vertical ? 'w-full' : 'w-24 shrink-0 snap-start sm:w-28', 'overflow-hidden rounded-lg border bg-[#0d0916] text-left transition-colors', active ? 'border-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,.24)]' : 'border-violet-300/15 hover:border-violet-300/35')}>
              <div className={cn('flex items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_65%,rgba(126,34,206,.2),transparent_67%)] px-2 pt-2', vertical ? 'h-24' : 'aspect-square')}>
                <img src={candidate.image} alt="" className="max-h-full max-w-full object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,.45)]" />
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

export function PetPage() {
  const { profile, unread } = useAuth()
  const { selectedPetId, selectedStats, petStats, selectPet, care, maxLevel } = usePetState()
  const [message, setMessage] = useState('')
  const [expression, setExpression] = useState<'default' | 'petted'>('default')
  const [balances, setBalances] = useState({ inmu: 0, points: 0 })
  const pettingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pet = PET_BY_ID[selectedPetId]
  const isFull = selectedStats.fullness >= 100

  useEffect(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setBalances({ inmu: Number(data.balance) || 0, points: Number(data.monthlyPoints) || 0 }) })
      .catch(() => {})
  }, [])

  useEffect(() => () => {
    if (pettingTimer.current) clearTimeout(pettingTimer.current)
  }, [])

  function handleAction(action: PetAction) {
    if (action === 'feed' && isFull) { setMessage('満腹なのでご飯をあげられません'); return }
    care(action)
    setMessage({ feed: 'ご飯をあげました', play: '一緒に遊びました', sleep: 'ゆっくり休みました', pet: 'やさしくなでました' }[action])
  }

  function handlePet() {
    handleAction('pet')
    setExpression('petted')
    if (pettingTimer.current) clearTimeout(pettingTimer.current)
    pettingTimer.current = setTimeout(() => {
      setExpression('default')
      pettingTimer.current = null
    }, 900)
  }

  function handleSelect(id: PetId) {
    if (pettingTimer.current) {
      clearTimeout(pettingTimer.current)
      pettingTimer.current = null
    }
    setExpression('default')
    selectPet(id)
    setMessage('')
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

        <div className="grid gap-3 lg:grid-cols-[140px_minmax(360px,1fr)_260px] lg:items-start lg:gap-4">
          <aside className="hidden lg:block"><CharacterRoster selectedPetId={selectedPetId} petStats={petStats} onSelect={handleSelect} vertical /></aside>

          <main className="flex min-w-0 flex-col gap-3">
            <div className="lg:hidden"><CharacterInfo pet={pet} stats={selectedStats} maxLevel={maxLevel} /></div>
            <PetRoom
              petId={pet.id}
              name={pet.name}
              image={pet.expressions[expression] ?? pet.expressions.default}
              roomWidth={pet.roomWidth}
              roomTheme={pet.roomTheme}
              expression={expression}
              stats={selectedStats}
              isFull={isFull}
              message={message}
              onAction={action => handleAction(action)}
              onPet={handlePet}
            />
            <div className="lg:hidden"><SkillPanel pet={pet} /></div>
            <div className="lg:hidden"><RewardsPanel pet={pet} level={selectedStats.level} /></div>
            <div className="lg:hidden"><CharacterRoster selectedPetId={selectedPetId} petStats={petStats} onSelect={handleSelect} /></div>
          </main>

          <aside className="hidden flex-col gap-3 lg:flex">
            <CharacterInfo pet={pet} stats={selectedStats} maxLevel={maxLevel} />
            <SkillPanel pet={pet} />
            <RewardsPanel pet={pet} level={selectedStats.level} />
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
