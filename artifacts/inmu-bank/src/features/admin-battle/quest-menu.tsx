import { Clock3, Dumbbell, Shield, Swords } from 'lucide-react'

export function QuestMenu({ onDaily, onTraining }: { onDaily: () => void; onTraining: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <button type="button" onClick={onDaily} className="min-h-52 border border-amber-400/35 bg-card p-5 text-left transition hover:border-amber-300 hover:bg-amber-400/5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-12 place-items-center bg-amber-400/15 text-amber-300"><Swords className="size-6" /></span>
          <span className="border border-amber-400/35 px-2 py-1 text-xs font-bold text-amber-300">1日1回</span>
        </div>
        <h2 className="mt-5 text-xl font-bold">デイリークエスト</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">最大3体のPETを編成し、テストモンスターへ挑戦します。推奨レベル、敵情報、報酬内容を確認してから出撃できます。</p>
        <div className="mt-4 flex items-center gap-2 text-sm font-bold text-amber-300"><Shield className="size-4" />参加条件なし</div>
      </button>

      <button type="button" onClick={onTraining} className="min-h-52 border border-cyan-400/30 bg-card p-5 text-left transition hover:border-cyan-300 hover:bg-cyan-400/5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-12 place-items-center bg-cyan-400/15 text-cyan-300"><Dumbbell className="size-6" /></span>
          <span className="border border-cyan-400/30 px-2 py-1 text-xs font-bold text-cyan-300">設定準備中</span>
        </div>
        <h2 className="mt-5 text-xl font-bold">特訓</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">一定時間PETを預け、完了後に経験値を受け取る育成機能です。預ける時間と経験値は後から設定できる構造で準備しています。</p>
        <div className="mt-4 flex items-center gap-2 text-sm font-bold text-cyan-300"><Clock3 className="size-4" />現在は表示確認のみ</div>
      </button>

      <section className="border border-border bg-card p-4 md:col-span-2">
        <h3 className="font-bold">管理者テスト環境</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">報酬、経験値、ポイント、挑戦回数は保存されません。一般ユーザーには表示されない管理者専用機能です。</p>
      </section>
    </div>
  )
}
