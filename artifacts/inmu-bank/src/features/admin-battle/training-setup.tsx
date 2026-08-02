import { ArrowLeft, Clock3, Dumbbell, Info } from 'lucide-react'
import { useState } from 'react'
import { PET_DEFINITIONS } from './pet-definitions'
import type { BattlePetId } from './types'

export function TrainingSetup({ onBack }: { onBack: () => void }) {
  const [petId, setPetId] = useState<BattlePetId>('yajusenpai-male-evolved')
  const pet = PET_DEFINITIONS[petId]
  return <div className="space-y-5">
    <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 border border-border px-3 text-sm hover:bg-secondary"><ArrowLeft className="size-4" />クエスト選択へ戻る</button>
    <section className="border border-cyan-400/30 bg-card p-5">
      <div className="flex items-center gap-2"><Dumbbell className="size-6 text-cyan-300" /><div><p className="text-xs font-bold text-cyan-300">TRAINING</p><h2 className="text-xl font-black">PET特訓</h2></div></div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">PETを一定時間預け、完了後に経験値を受け取る育成方式です。現在は画面と選択操作のみ確認できます。</p>
    </section>
    <section className="border border-border bg-card p-5">
      <h3 className="font-bold">特訓するPET</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{(Object.values(PET_DEFINITIONS) as Array<(typeof PET_DEFINITIONS)[BattlePetId]>).map(item => <button key={item.id} type="button" onClick={() => setPetId(item.id)} className={`flex min-h-20 items-center gap-3 border p-2 text-left ${petId === item.id ? 'border-cyan-300 bg-cyan-400/10' : 'border-border bg-background'}`}><img src={item.image} alt="" className="size-16 object-contain" /><span><span className="block font-bold">{item.name}</span><span className="text-xs text-muted-foreground">Lv.60 / {item.type}</span></span></button>)}</div>
    </section>
    <section className="border border-border bg-card p-5"><div className="flex items-center gap-2"><Clock3 className="size-5 text-amber-300" /><h3 className="font-bold">特訓時間・報酬</h3></div><div className="mt-3 border border-dashed border-border bg-background p-6 text-center"><p className="font-bold">設定準備中</p><p className="mt-2 text-sm text-muted-foreground">時間と獲得経験値が決まり次第、選択肢と開始ボタンを有効にします。</p></div></section>
    <div className="flex gap-2 border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-amber-300" /><p>{pet.name}を選択中です。PETデータの変更や保存は行いません。</p></div>
    <button type="button" disabled className="min-h-12 w-full bg-cyan-300 font-bold text-black opacity-40">特訓を開始（設定待ち）</button>
  </div>
}
