import type { ElementType, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { PET_BY_ID, PET_DEFINITIONS, type PetId } from '@/features/pet/pet-data'
import { usePetState, type PetAction } from '@/features/pet/use-pet-state'
import {
  BookOpen, CircleDollarSign, Coins, Gamepad2, Gem,
  Heart, Leaf, Moon, PawPrint, Sparkles, Utensils,
} from 'lucide-react'

const ACTIONS: Array<{ id: PetAction; label: string; icon: ElementType; tone: string }> = [
  { id: 'feed', label: 'ご飯', icon: Utensils, tone: 'border-pink-400/50 text-pink-200 shadow-[0_0_18px_rgba(244,114,182,.12)]' },
  { id: 'play', label: '遊ぶ', icon: Gamepad2, tone: 'border-amber-300/50 text-amber-200 shadow-[0_0_18px_rgba(252,211,77,.12)]' },
  { id: 'sleep', label: '寝る', icon: Moon, tone: 'border-cyan-400/50 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,.12)]' },
  { id: 'pet', label: 'なでる', icon: Heart, tone: 'border-fuchsia-400/50 text-fuchsia-200 shadow-[0_0_18px_rgba(232,121,249,.12)]' },
]

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
      <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-black/55">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
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
        <p className="truncate font-mono text-xs font-bold text-white sm:text-sm">{value.toLocaleString()}</p>
      </div>
    </div>
  )
}

function PetRoom({
  petId,
  name,
  image,
  roomWidth,
  rarity,
  level,
  exp,
  requiredExp,
  isMaxLevel,
}: {
  petId: PetId
  name: string
  image: string
  roomWidth: string
  rarity: number
  level: number
  exp: number
  requiredExp: number
  isMaxLevel: boolean
}) {
  const expPercent = isMaxLevel ? 100 : Math.min(100, (exp / requiredExp) * 100)
  return (
    <section className="relative h-[540px] overflow-hidden rounded-lg border border-fuchsia-400/25 bg-[#080611] shadow-[0_0_40px_rgba(168,85,247,.14)] sm:h-[620px]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#100b20_0%,#171026_55%,#0b0811_100%)]" />
      <div className="absolute inset-x-0 top-0 h-[58%] opacity-70 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute inset-x-0 bottom-0 h-[42%] origin-bottom [background:linear-gradient(150deg,#17101f,#08070d)] before:absolute before:inset-0 before:opacity-30 before:[background-image:repeating-linear-gradient(90deg,transparent_0,transparent_58px,rgba(192,132,252,.18)_59px,transparent_60px)]" />

      <div className="absolute left-4 top-28 h-40 w-28 overflow-hidden rounded-t-[48px] border border-violet-300/20 bg-[#060917] shadow-[inset_0_0_24px_rgba(56,189,248,.08)] sm:left-8 sm:w-36">
        <div className="absolute inset-x-0 top-1/2 h-px bg-violet-300/15" />
        <div className="absolute bottom-3 left-3 h-9 w-1 bg-fuchsia-400/40 shadow-[12px_-15px_0_rgba(34,211,238,.35),25px_4px_0_rgba(251,191,36,.35),42px_-24px_0_rgba(217,70,239,.3),58px_-3px_0_rgba(96,165,250,.35),74px_-18px_0_rgba(244,114,182,.3)]" />
      </div>

      <div className="absolute left-1/2 top-0 h-16 w-px -translate-x-1/2 bg-violet-200/20" />
      <div className="absolute left-1/2 top-14 h-5 w-24 -translate-x-1/2 rounded-[50%] bg-amber-100/80 shadow-[0_10px_34px_12px_rgba(251,191,36,.16)]" />

      <div className="absolute right-4 top-28 h-44 w-24 sm:right-8 sm:w-28">
        <div className="absolute inset-x-0 top-0 h-2 rounded bg-violet-300/20 shadow-[0_0_16px_rgba(168,85,247,.18)]" />
        <div className="absolute inset-x-0 top-20 h-2 rounded bg-violet-300/20" />
        <Gem className="absolute right-7 top-5 size-9 text-fuchsia-300 drop-shadow-[0_0_10px_rgba(232,121,249,.6)]" />
        <BookOpen className="absolute bottom-6 left-3 size-8 text-indigo-300/70" />
        <div className="absolute bottom-5 right-2 size-9 rounded border border-fuchsia-300/20 bg-fuchsia-300/5 p-2">
          <PawPrint className="size-full text-fuchsia-300/50" />
        </div>
      </div>

      <div className="absolute left-1/2 top-24 -translate-x-1/2 text-center text-fuchsia-300 drop-shadow-[0_0_10px_rgba(232,121,249,.75)]">
        <PawPrint className="mx-auto size-9" />
        <p className="mt-1 text-[11px] font-black tracking-[0.22em]">INMU PET</p>
      </div>

      <div className="absolute bottom-24 left-4 h-24 w-20 sm:left-8">
        <div className="absolute bottom-0 left-4 h-10 w-12 rounded-b-xl bg-violet-950/90 ring-1 ring-violet-400/20" />
        <Leaf className="absolute bottom-7 left-0 size-11 -rotate-[28deg] text-emerald-400/55" />
        <Leaf className="absolute bottom-10 right-0 size-11 rotate-[28deg] text-emerald-300/55" />
        <Leaf className="absolute bottom-11 left-5 size-10 text-emerald-400/65" />
      </div>

      <div className="absolute bottom-7 left-1/2 h-20 w-[72%] -translate-x-1/2 rounded-[50%] border border-fuchsia-400/15 bg-[radial-gradient(ellipse,rgba(126,34,206,.3),rgba(24,12,35,.78)_62%,transparent_70%)]" />
      <div className="absolute bottom-16 left-1/2 h-20 w-[52%] -translate-x-1/2 rounded-[50%] border border-violet-300/15 bg-[#24172f] shadow-[inset_0_-12px_18px_rgba(0,0,0,.55),0_8px_30px_rgba(0,0,0,.55)]" />

      <div className="absolute left-3 top-3 z-20 w-[168px] rounded-md border border-fuchsia-300/20 bg-black/60 p-3 backdrop-blur-md sm:left-5 sm:top-5 sm:w-[190px]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white sm:text-base">{name}</p>
            <p className="mt-0.5 text-xs tracking-wider text-amber-300">{'★'.repeat(rarity)}</p>
          </div>
          <span className="shrink-0 font-mono text-sm font-black text-cyan-300">Lv.{level}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
          <span>EXP</span><span className="font-mono">{isMaxLevel ? 'MAX' : `${exp} / ${requiredExp}`}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400" style={{ width: `${expPercent}%` }} />
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-14 z-10 flex h-[68%] items-end justify-center"
        data-pet-stage
        data-pet-id={petId}
        data-pose="idle"
      >
        <div className="absolute bottom-2 left-1/2 h-5 w-[32%] -translate-x-1/2 rounded-[50%] bg-black/55 blur-sm" data-pet-shadow />
        <img
          src={image}
          alt={name}
          className="relative z-10 max-h-full object-contain drop-shadow-[0_14px_18px_rgba(0,0,0,.55)]"
          style={{ width: roomWidth }}
          data-pet-character
          data-expression="default"
        />
      </div>
    </section>
  )
}

export function PetPage() {
  const { profile, unread } = useAuth()
  const { selectedPetId, selectedStats, petStats, selectPet, care, maxLevel } = usePetState()
  const [message, setMessage] = useState('')
  const [balances, setBalances] = useState({ inmu: 0, points: 0 })
  const pet = PET_BY_ID[selectedPetId]
  const requiredExp = selectedStats.level * 20
  const isMaxLevel = selectedStats.level >= maxLevel
  const isFull = selectedStats.fullness >= 100

  useEffect(() => {
    fetch('/api/dashboard', { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (data) setBalances({ inmu: Number(data.balance) || 0, points: Number(data.monthlyPoints) || 0 })
      })
      .catch(() => {})
  }, [])

  function handleAction(action: PetAction) {
    if (action === 'feed' && isFull) {
      setMessage('満腹なのでご飯をあげられません')
      return
    }
    care(action)
    setMessage({ feed: 'ご飯をあげました', play: '一緒に遊びました', sleep: 'ゆっくり休みました', pet: 'やさしくなでました' }[action])
  }

  function handleSelect(id: PetId) {
    selectPet(id)
    setMessage('')
  }

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300">
              <PawPrint className="size-3.5" />Pet room
            </p>
            <h1 className="truncate text-2xl font-black text-white">INMU PET</h1>
          </div>
          <div className="grid min-w-[195px] grid-cols-2 gap-3 rounded-lg border border-violet-300/15 bg-black/35 px-3 py-2">
            <BalanceChip icon={<Coins className="size-3.5" />} label="INMU" value={balances.inmu} />
            <BalanceChip icon={<CircleDollarSign className="size-3.5" />} label="POINT" value={balances.points} />
          </div>
        </header>

        <PetRoom
          petId={pet.id}
          name={pet.name}
          image={pet.image}
          roomWidth={pet.roomWidth}
          rarity={pet.rarity}
          level={selectedStats.level}
          exp={selectedStats.exp}
          requiredExp={requiredExp}
          isMaxLevel={isMaxLevel}
        />

        <section className="relative z-20 -mt-2 rounded-lg border border-violet-300/20 bg-[#0d0916]/95 p-4 shadow-[0_-10px_30px_rgba(0,0,0,.35)] backdrop-blur-md">
          <div className="flex gap-3 sm:gap-5">
            <StatusBar label="満腹度" value={selectedStats.fullness} icon={<Utensils className="size-3.5 text-pink-300" />} color="linear-gradient(90deg,#fb7185,#f472b6)" />
            <StatusBar label="眠気" value={selectedStats.sleepiness} icon={<Moon className="size-3.5 text-cyan-300" />} color="linear-gradient(90deg,#38bdf8,#6366f1)" />
            <StatusBar label="愛情度" value={selectedStats.affection} icon={<Heart className="size-3.5 fill-fuchsia-400 text-fuchsia-400" />} color="linear-gradient(90deg,#e879f9,#c084fc)" />
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-violet-300/15 bg-[#0d0916] p-3 sm:p-4">
          <div className="mb-3 flex min-h-5 items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-fuchsia-200">お世話</h2>
            <p className="text-right text-[10px] text-cyan-200" role="status">{isFull ? '満腹なのでご飯をあげられません' : message}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ACTIONS.map(action => {
              const Icon = action.icon
              const disabled = action.id === 'feed' && isFull
              return (
                <Button
                  key={action.id}
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => handleAction(action.id)}
                  className={cn('h-20 flex-col gap-2 rounded-lg bg-black/35 text-sm hover:bg-white/5', action.tone)}
                >
                  <Icon className="size-6" />
                  <span className="font-bold">{action.label}</span>
                </Button>
              )
            })}
          </div>
        </section>

        <section className="mt-3 border-t border-violet-300/15 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-fuchsia-200">所持キャラクター</h2>
            <span className="font-mono text-[10px] text-muted-foreground">3 / 3</span>
          </div>
          <div className="flex snap-x gap-2 overflow-x-auto pb-2 scrollbar-none">
            {PET_DEFINITIONS.map(candidate => {
              const active = candidate.id === selectedPetId
              const stats = petStats[candidate.id]
              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelect(candidate.id)}
                  className={cn(
                    'w-28 shrink-0 snap-start overflow-hidden rounded-lg border bg-[#0d0916] text-left transition-colors sm:w-32',
                    active ? 'border-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,.22)]' : 'border-violet-300/15 hover:border-violet-300/35',
                  )}
                >
                  <div className="flex aspect-square items-end justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_65%,rgba(126,34,206,.2),transparent_67%)] px-2 pt-2">
                    <img src={candidate.image} alt="" className="max-h-full max-w-full object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,.45)]" />
                  </div>
                  <div className="border-t border-white/5 p-2">
                    <p className="truncate text-xs font-bold">{candidate.name}</p>
                    <div className="mt-1 flex items-center justify-between text-[9px]">
                      <span className="text-amber-300">★{candidate.rarity}</span>
                      <span className="font-mono text-cyan-300">Lv.{stats.level}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
