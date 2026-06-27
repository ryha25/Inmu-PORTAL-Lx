import type { ReactNode } from 'react'
import { useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { PET_BY_ID, PET_DEFINITIONS, type PetId } from '@/features/pet/pet-data'
import { usePetState, type PetAction } from '@/features/pet/use-pet-state'
import { Gamepad2, Heart, Moon, PawPrint, Sparkles, Utensils } from 'lucide-react'

const ACTIONS: Array<{
  id: PetAction
  label: string
  icon: React.ElementType
}> = [
  { id: 'feed', label: 'ご飯', icon: Utensils },
  { id: 'play', label: '遊ぶ', icon: Gamepad2 },
  { id: 'sleep', label: '寝る', icon: Moon },
  { id: 'pet', label: 'なでる', icon: Heart },
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground/90">
          {icon}{label}
        </span>
        <span className="font-mono text-muted-foreground">{display ?? `${value} / ${max}`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/45">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  )
}

export function PetPage() {
  const { profile, unread } = useAuth()
  const { selectedPetId, selectedStats, petStats, selectPet, care, maxLevel } = usePetState()
  const [message, setMessage] = useState('')
  const pet = PET_BY_ID[selectedPetId]
  const requiredExp = selectedStats.level * 20
  const isMaxLevel = selectedStats.level >= maxLevel
  const isFull = selectedStats.fullness >= 100

  function handleAction(action: PetAction) {
    if (action === 'feed' && isFull) {
      setMessage('満腹なのでご飯をあげられません')
      return
    }
    care(action)
    setMessage({
      feed: 'ご飯をあげました',
      play: '一緒に遊びました',
      sleep: 'ゆっくり休みました',
      pet: 'やさしくなでました',
    }[action])
  }

  function handleSelect(id: PetId) {
    selectPet(id)
    setMessage('')
  }

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <div className="mb-4">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
            <PawPrint className="size-3.5" />Pet room
          </p>
          <h1 className="text-2xl font-bold text-foreground">INMU PET</h1>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <section className="relative overflow-hidden rounded-lg border border-fuchsia-400/25 bg-black shadow-[0_0_32px_rgba(168,85,247,.12)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(168,85,247,.22),transparent_42%)]" />
          <div className="relative aspect-[4/3] min-h-[290px] sm:min-h-[390px]">
            <img
              src={pet.image}
              alt={pet.name}
              className="size-full object-cover"
              style={{ objectPosition: pet.imagePosition }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-4 pt-20">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="mb-1 flex gap-0.5 text-amber-300" aria-label={`レア度 星${pet.rarity}`}>
                    {Array.from({ length: pet.rarity }, (_, index) => <Sparkles key={index} className="size-4 fill-current" />)}
                  </div>
                  <h2 className="text-2xl font-bold text-white">{pet.name}</h2>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-white/60">Level</p>
                  <p className="font-mono text-2xl font-black text-cyan-300">Lv.{selectedStats.level}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <Card className="rounded-lg border-fuchsia-400/20 bg-[linear-gradient(145deg,rgba(27,18,44,.96),rgba(10,10,18,.98))] p-4 shadow-[inset_0_1px_rgba(255,255,255,.04)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-300">Status</p>
                <h3 className="text-sm font-semibold">育成ステータス</h3>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{pet.name}</span>
            </div>
            <div className="flex flex-col gap-4">
              <StatusBar
                label="EXP"
                value={isMaxLevel ? 1 : selectedStats.exp}
                max={isMaxLevel ? 1 : requiredExp}
                display={isMaxLevel ? 'MAX' : `${selectedStats.exp} / ${requiredExp}`}
                icon={<Sparkles className="size-3.5 text-cyan-300" />}
                color="linear-gradient(90deg,#22d3ee,#8b5cf6)"
              />
              <StatusBar label="満腹度" value={selectedStats.fullness} icon={<Utensils className="size-3.5 text-amber-300" />} color="linear-gradient(90deg,#f59e0b,#facc15)" />
              <StatusBar label="眠気" value={selectedStats.sleepiness} icon={<Moon className="size-3.5 text-indigo-300" />} color="linear-gradient(90deg,#6366f1,#a78bfa)" />
              <StatusBar label="愛情度" value={selectedStats.affection} icon={<Heart className="size-3.5 fill-pink-400 text-pink-400" />} color="linear-gradient(90deg,#ec4899,#fb7185)" />
            </div>
          </Card>

          <section className="rounded-lg border border-cyan-400/15 bg-card/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">お世話</h3>
              <span className="min-h-4 text-[10px] text-cyan-200" role="status">
                {isFull ? '満腹なのでご飯をあげられません' : message}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
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
                    className="h-14 justify-start gap-2 rounded-md border-white/10 bg-black/20 px-3 hover:border-fuchsia-400/40 hover:bg-fuchsia-400/10"
                  >
                    <Icon className="size-5 text-fuchsia-300" />
                    <span className="text-sm font-semibold">{action.label}</span>
                  </Button>
                )
              })}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-4 border-t border-border pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">所持キャラクター</h2>
          <span className="font-mono text-[10px] text-muted-foreground">3 / 3</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
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
                  'min-w-0 overflow-hidden rounded-lg border bg-black/30 text-left transition-colors',
                  active
                    ? 'border-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,.2)]'
                    : 'border-border hover:border-white/25',
                )}
              >
                <div className="aspect-square overflow-hidden bg-black">
                  <img src={candidate.image} alt="" className="size-full object-cover" style={{ objectPosition: candidate.imagePosition }} />
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-semibold">{candidate.name}</p>
                  <div className="mt-1 flex items-center justify-between gap-1 text-[9px]">
                    <span className="text-amber-300">★{candidate.rarity}</span>
                    <span className="font-mono text-cyan-300">Lv.{stats.level}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </AppShell>
  )
}
