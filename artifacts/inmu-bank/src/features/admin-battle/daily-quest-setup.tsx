import { ArrowLeft, Gift, ShieldAlert, Skull, Swords, Users } from 'lucide-react'
import { PET_DEFINITIONS, settingsForPet } from './pet-definitions'
import type { BattlePetId, BattleSettings } from './types'
import slimeImage from '@assets/battle-blue-slime-v1.png'

export function DailyQuestSetup({ settings, onChange, onBack, onStart }: {
  settings: BattleSettings
  onChange: (settings: BattleSettings) => void
  onBack: () => void
  onStart: () => void
}) {
  const selected = settings.partyPetIds

  function togglePet(petId: BattlePetId) {
    if (selected.includes(petId)) {
      if (selected.length === 1) return
      const nextParty = selected.filter(id => id !== petId)
      onChange({ ...settingsForPet(nextParty[0], settings), partyPetIds: nextParty })
      return
    }
    if (selected.length >= 3) return
    onChange({ ...settings, partyPetIds: [...selected, petId] })
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-sm hover:bg-secondary"><ArrowLeft className="size-4" />クエスト選択へ戻る</button>

      <section className="border border-amber-400/35 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-bold text-amber-300">DAILY QUEST</p><h2 className="mt-1 text-xl font-black">ブルースライム討伐</h2></div>
          <span className="border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-sm font-black text-amber-300">推奨 Lv.40</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-4 border border-border bg-background p-4"><img src={slimeImage} alt="ブルースライム" className="size-20 shrink-0 object-contain" /><Info title="敵情報" icon={<Skull className="size-4" />} lines={['ブルースライム x 1', 'HP 50,000 / 体当たり・前方範囲攻撃', '制限時間 180秒']} plain /></div>
          <Info title="報酬内容" icon={<Gift className="size-4" />} lines={['PET経験値：調整中', 'ポイント：調整中', '育成アイテム抽選：調整中']} />
        </div>
      </section>

      <section className="border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Users className="size-5 text-cyan-300" /><h2 className="font-bold">出撃PET編成</h2></div><span className="text-sm tabular-nums text-muted-foreground">{selected.length} / 3</span></div>
        <p className="mt-2 text-sm text-muted-foreground">管理者テストでは解放スロット数に関係なく最大3体まで選択できます。先頭のPETで出撃し、控えPETとは戦闘中に交代できます。</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[0, 1, 2].map(index => {
            const pet = selected[index] ? PET_DEFINITIONS[selected[index]] : null
            return <div key={index} className="aspect-[4/5] border border-border bg-background p-2 text-center">
              {pet ? <><img src={pet.image} alt={pet.name} className="h-[70%] w-full object-contain" /><p className="mt-1 truncate text-xs font-bold">{pet.name}</p><p className="text-[10px] text-muted-foreground">{index === 0 ? '出撃PET' : '控えPET'}</p></> : <div className="grid h-full place-items-center text-xs text-muted-foreground">空きスロット</div>}
            </div>
          })}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(Object.values(PET_DEFINITIONS) as Array<(typeof PET_DEFINITIONS)[BattlePetId]>).map(pet => {
            const active = selected.includes(pet.id)
            return <button key={pet.id} type="button" onClick={() => togglePet(pet.id)} className={`flex min-h-16 items-center gap-3 border p-2 text-left transition ${active ? 'border-cyan-300 bg-cyan-400/10' : 'border-border bg-background hover:bg-secondary'}`}>
              <img src={pet.image} alt="" className="size-12 object-contain" />
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{pet.name}</span><span className="text-xs text-muted-foreground">{pet.type} / Lv.60</span></span>
              <span className="ml-auto text-xs font-bold text-cyan-300">{active ? '選択中' : '選択'}</span>
            </button>
          })}
        </div>
      </section>

      <div className="border border-cyan-400/25 bg-cyan-400/5 p-4 text-sm text-muted-foreground"><div className="flex items-center gap-2 font-bold text-cyan-300"><ShieldAlert className="size-4" />テスト環境</div><p className="mt-2">表示中の報酬は説明のみです。挑戦回数、報酬、経験値、PET状態は一切保存されません。</p></div>
      <button type="button" onClick={onStart} disabled={selected.length === 0} className="inline-flex min-h-14 w-full items-center justify-center gap-2 bg-amber-400 px-5 text-base font-black text-black hover:bg-amber-300 disabled:opacity-40"><Swords className="size-5" />クエスト開始</button>
    </div>
  )
}

function Info({ title, icon, lines, plain = false }: { title: string; icon: React.ReactNode; lines: string[]; plain?: boolean }) {
  return <div className={plain ? 'min-w-0' : 'border border-border bg-background p-4'}><div className="flex items-center gap-2 text-sm font-bold text-amber-200">{icon}{title}</div><ul className="mt-3 space-y-1 text-sm text-muted-foreground">{lines.map(line => <li key={line}>{line}</li>)}</ul></div>
}
