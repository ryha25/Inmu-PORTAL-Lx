import { ChevronRight, Clock3, Dumbbell, Shield, Sparkles, Trophy } from 'lucide-react'
import maleEvolvedImage from '@assets/inmu-pet-yajusenpai-male-evolved-v2.png'
import femaleEvolvedImage from '@assets/inmu-pet-yajusenpai-female-evolved-v2.png'

export function QuestMenu({ onDaily, onTraining }: { onDaily: () => void; onTraining: () => void }) {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-black tracking-[0.22em] text-amber-300">QUEST COUNTER</p>
          <h2 className="mt-1 text-2xl font-black sm:text-3xl">クエストを選択</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 bg-emerald-400" />
          テストサーバー稼働中
        </div>
      </header>

      <button
        type="button"
        onClick={onDaily}
        className="group relative min-h-64 w-full overflow-hidden border border-amber-300/45 bg-[#17120a] text-left shadow-[0_16px_42px_rgba(0,0,0,.28)] transition hover:border-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
      >
        <div className="absolute inset-y-0 right-0 w-[48%] bg-[#221805]" />
        <img src={maleEvolvedImage} alt="" className="pointer-events-none absolute -bottom-8 right-[2%] h-[108%] w-[46%] object-contain object-bottom transition duration-300 group-hover:scale-[1.03]" />
        <div className="relative z-10 flex min-h-64 max-w-[67%] flex-col justify-between p-5 sm:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-amber-300 px-2.5 py-1 text-[11px] font-black text-black">DAILY</span>
              <span className="border border-amber-300/45 bg-black/35 px-2.5 py-1 text-[11px] font-bold text-amber-100">本日 1 / 1</span>
            </div>
            <h3 className="mt-4 text-xl font-black text-white sm:text-2xl">テストモンスター討伐</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/65">PETを編成して闘技場へ出撃。敵の予告攻撃を回避し、制限時間内の撃破を目指します。</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
            <span className="flex items-center gap-1.5 border border-white/15 bg-black/35 px-2.5 py-1.5 text-white/85"><Shield className="size-3.5 text-amber-300" />推奨 Lv.40</span>
            <span className="flex items-center gap-1.5 border border-white/15 bg-black/35 px-2.5 py-1.5 text-white/85"><Trophy className="size-3.5 text-amber-300" />報酬確認</span>
          </div>
          <span className="mt-5 inline-flex w-fit items-center gap-2 text-sm font-black text-amber-300">編成へ進む<ChevronRight className="size-4 transition group-hover:translate-x-1" /></span>
        </div>
      </button>

      <button
        type="button"
        onClick={onTraining}
        className="group relative min-h-56 w-full overflow-hidden border border-cyan-300/35 bg-[#07161b] text-left shadow-[0_16px_42px_rgba(0,0,0,.22)] transition hover:border-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        <div className="absolute inset-y-0 right-0 w-[48%] bg-[#08242b]" />
        <img src={femaleEvolvedImage} alt="" className="pointer-events-none absolute -bottom-10 right-[3%] h-[112%] w-[44%] object-contain object-bottom opacity-90 transition duration-300 group-hover:scale-[1.03]" />
        <div className="relative z-10 flex min-h-56 max-w-[67%] flex-col justify-between p-5 sm:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-cyan-300 px-2.5 py-1 text-[11px] font-black text-[#051216]">TRAINING</span>
              <span className="border border-cyan-300/35 bg-black/30 px-2.5 py-1 text-[11px] font-bold text-cyan-100">準備中</span>
            </div>
            <h3 className="mt-4 text-xl font-black text-white sm:text-2xl">特訓</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-white/65">PETを一定時間預けて育成。預けるPETと特訓時間を選び、完了後に経験値を受け取ります。</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
            <span className="flex items-center gap-1.5 border border-white/15 bg-black/30 px-2.5 py-1.5 text-white/85"><Clock3 className="size-3.5 text-cyan-300" />時間選択</span>
            <span className="flex items-center gap-1.5 border border-white/15 bg-black/30 px-2.5 py-1.5 text-white/85"><Dumbbell className="size-3.5 text-cyan-300" />経験値</span>
          </div>
          <span className="mt-5 inline-flex w-fit items-center gap-2 text-sm font-black text-cyan-300">特訓設定<ChevronRight className="size-4 transition group-hover:translate-x-1" /></span>
        </div>
      </button>

      <section className="flex items-start gap-3 border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
        <span className="grid size-9 shrink-0 place-items-center bg-white/5 text-white/70"><Sparkles className="size-4" /></span>
        <div><h3 className="font-bold text-foreground">管理者テスト環境</h3><p className="mt-1 leading-6">報酬、経験値、ポイント、挑戦回数は保存されません。一般ユーザーには表示されない確認用クエストです。</p></div>
      </section>
    </div>
  )
}
