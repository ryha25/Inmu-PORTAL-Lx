import { ChevronRight, Clock3, Dumbbell, Map, Shield, Sparkles, Trophy } from 'lucide-react'
import maleEvolvedImage from '@assets/inmu-pet-yajusenpai-male-evolved-v2.png'
import femaleEvolvedImage from '@assets/inmu-pet-yajusenpai-female-evolved-v2.png'
import battlefieldImage from '@assets/quest-battlefield-concept-v1.png'
import slimeImage from '@assets/battle-blue-slime-v1.png'
import trainingRoomImage from '@assets/inmu-pet-room-yajusenpai-male-v1.jpg'

export function QuestMenu({ onDaily, onTraining }: { onDaily: () => void; onTraining: () => void }) {
  return (
    <div className="space-y-4">
      <header className="border-b border-amber-300/25 bg-[#090d13] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black text-amber-300">QUEST LOBBY</p>
            <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">出撃先を選択</h2>
          </div>
          <div className="flex items-center gap-2 border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200">
            <span className="size-2 bg-emerald-400" />テストサーバー接続中
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 border border-white/10 bg-black/35 p-1 text-center text-xs font-black">
          <span className="bg-amber-300 px-3 py-2 text-black">クエスト</span>
          <span className="px-3 py-2 text-white/55">特訓</span>
        </div>
      </header>

      <button
        type="button"
        onClick={onDaily}
        className="group relative min-h-[390px] w-full overflow-hidden border border-amber-300/50 bg-black text-left shadow-[0_18px_48px_rgba(0,0,0,.42)] transition hover:border-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
      >
        <img src={battlefieldImage} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-black/55" />
        <img src={slimeImage} alt="" className="pointer-events-none absolute bottom-16 left-[43%] h-[34%] w-[28%] object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,.7)]" />
        <img src={maleEvolvedImage} alt="" className="pointer-events-none absolute -bottom-8 right-[-5%] h-[91%] w-[48%] object-contain object-bottom drop-shadow-[0_16px_18px_rgba(0,0,0,.75)] transition duration-300 group-hover:scale-[1.025]" />

        <div className="relative z-10 flex min-h-[390px] flex-col justify-between p-5 sm:p-7">
          <div className="max-w-[62%]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-amber-300 px-2.5 py-1 text-[11px] font-black text-black">DAILY QUEST</span>
              <span className="border border-white/30 bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">挑戦 1 / 1</span>
            </div>
            <p className="mt-5 flex items-center gap-1.5 text-xs font-bold text-amber-200"><Map className="size-3.5" />崩壊した王都・中央闘技場</p>
            <h3 className="mt-2 text-2xl font-black text-white sm:text-3xl">ブルースライム討伐</h3>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/75">予告攻撃を見極め、編成したPETを交代しながら制限時間内の撃破を目指します。</p>
          </div>

          <div>
            <div className="grid max-w-xl grid-cols-3 border-y border-white/15 bg-black/60 text-center text-[11px] text-white/70 sm:text-xs">
              <div className="px-2 py-3"><Shield className="mx-auto mb-1 size-4 text-amber-300" /><strong className="block text-white">推奨 Lv.40</strong></div>
              <div className="border-x border-white/15 px-2 py-3"><Trophy className="mx-auto mb-1 size-4 text-amber-300" /><strong className="block text-white">報酬 調整中</strong></div>
              <div className="px-2 py-3"><Clock3 className="mx-auto mb-1 size-4 text-amber-300" /><strong className="block text-white">制限 180秒</strong></div>
            </div>
            <span className="mt-4 inline-flex min-h-11 items-center gap-2 bg-amber-300 px-5 text-sm font-black text-black shadow-[0_0_24px_rgba(252,211,77,.3)]">出撃編成へ<ChevronRight className="size-4 transition group-hover:translate-x-1" /></span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onTraining}
        className="group relative min-h-52 w-full overflow-hidden border border-cyan-300/35 bg-[#07161b] text-left transition hover:border-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        <img src={trainingRoomImage} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-[#05151b]/70" />
        <img src={femaleEvolvedImage} alt="" className="pointer-events-none absolute -bottom-10 right-[1%] h-[116%] w-[43%] object-contain object-bottom drop-shadow-[0_12px_16px_rgba(0,0,0,.7)]" />
        <div className="relative z-10 flex min-h-52 max-w-[68%] flex-col justify-between p-5 sm:p-7">
          <div><span className="bg-cyan-300 px-2.5 py-1 text-[11px] font-black text-[#051216]">TRAINING</span><h3 className="mt-4 text-xl font-black text-white sm:text-2xl">特訓施設</h3><p className="mt-2 text-sm leading-6 text-white/70">PETを一定時間預け、完了後に経験値を受け取ります。</p></div>
          <div className="mt-5 flex items-center gap-4 text-xs font-bold text-cyan-100"><span className="flex items-center gap-1.5"><Clock3 className="size-4 text-cyan-300" />時間選択</span><span className="flex items-center gap-1.5"><Dumbbell className="size-4 text-cyan-300" />経験値</span><ChevronRight className="ml-auto size-5" /></div>
        </div>
      </button>

      <section className="flex items-start gap-3 border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
        <span className="grid size-9 shrink-0 place-items-center bg-white/5 text-white/70"><Sparkles className="size-4" /></span>
        <div><h3 className="font-bold text-foreground">管理者テスト環境</h3><p className="mt-1 leading-6">報酬、経験値、ポイント、挑戦回数は保存されません。一般ユーザーには表示されません。</p></div>
      </section>
    </div>
  )
}
