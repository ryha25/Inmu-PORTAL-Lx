import { Pause, Play, RefreshCw, Shield, Sparkles, Swords, X } from 'lucide-react'
import type { BattleSnapshot } from './types'

export function BattleHud({ snapshot, onPause, onAbort, onSwitch }: { snapshot: BattleSnapshot; onPause: () => void; onAbort: () => void; onSwitch: () => void }) {
  const hpPct = (snapshot.playerHp / snapshot.playerMaxHp) * 100
  const spPct = (snapshot.playerSp / snapshot.playerMaxSp) * 100
  const enemyPct = (snapshot.enemyHp / snapshot.enemyMaxHp) * 100

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none text-white">
      <div className="absolute inset-x-3 top-[max(12px,env(safe-area-inset-top))] flex items-start gap-3">
        <div className="min-w-0 flex-1 bg-black/65 p-2 backdrop-blur-sm">
          <div className="flex justify-between text-xs"><span>テストモンスター</span><span>{snapshot.enemyHp.toLocaleString()} / {snapshot.enemyMaxHp.toLocaleString()}</span></div>
          <div className="mt-1 h-3 overflow-hidden bg-white/15"><div className="h-full bg-red-500 transition-[width]" style={{ width: `${enemyPct}%` }} /></div>
        </div>
        <div className="rounded bg-black/65 px-3 py-2 font-mono text-lg tabular-nums">{Math.ceil(snapshot.remainingSeconds)}s</div>
      </div>

      <div className="absolute left-3 top-20 w-48 space-y-2 bg-black/60 p-2 text-xs backdrop-blur-sm">
        <Bar label="HP" value={`${snapshot.playerHp} / ${snapshot.playerMaxHp}`} percent={hpPct} color="bg-emerald-400" />
        <Bar label="SP" value={`${snapshot.playerSp} / ${snapshot.playerMaxSp}`} percent={spPct} color="bg-cyan-400" />
        <div className="flex gap-1 pt-1">
          {snapshot.party.map((member, index) => (
            <span key={member.petId} className={`h-1.5 flex-1 ${member.petId === snapshot.activePetId ? 'bg-amber-300' : member.defeated ? 'bg-red-900' : 'bg-white/35'}`} title={`${index + 1}: ${member.hp}/${member.maxHp}`} />
          ))}
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute left-1/2 top-0 h-full w-px bg-white/80" />
        <span className="absolute left-0 top-1/2 h-px w-full bg-white/80" />
      </div>

      {snapshot.message && <div className="absolute left-1/2 top-[62%] -translate-x-1/2 bg-black/70 px-3 py-1 text-center text-sm">{snapshot.message}</div>}

      <div className="pointer-events-auto absolute right-3 top-20 flex gap-2">
        <button type="button" onClick={onSwitch} disabled={snapshot.switchCooldown > 0 || snapshot.party.length < 2} className="hidden size-11 place-items-center rounded-full bg-black/70 disabled:opacity-35 md:grid" aria-label="PET交代"><RefreshCw className="size-5" /></button>
        <button type="button" onClick={onPause} className="grid size-11 place-items-center rounded-full bg-black/70" aria-label="ポーズ">
          {snapshot.phase === 'paused' ? <Play className="size-5" /> : <Pause className="size-5" />}
        </button>
        <button type="button" onClick={onAbort} className="grid size-11 place-items-center rounded-full bg-black/70" aria-label="中断"><X className="size-5" /></button>
      </div>

      <div className="absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 hidden -translate-x-1/2 gap-2 text-[11px] md:flex">
        <Hint icon={<Swords className="size-3" />} text={`左クリック 攻撃 ${snapshot.attackCooldown > 0 ? snapshot.attackCooldown.toFixed(1) : 'READY'}`} />
        <Hint icon={<Shield className="size-3" />} text={`Shift 回避 ${snapshot.dodgeCooldown > 0 ? snapshot.dodgeCooldown.toFixed(1) : 'READY'}`} />
        <Hint icon={<Sparkles className="size-3" />} text={`Q 必殺 ${snapshot.ultimateCooldown > 0 ? snapshot.ultimateCooldown.toFixed(1) : 'READY'}`} />
        <Hint icon={<RefreshCw className="size-3" />} text={`E 交代 ${snapshot.switchCooldown > 0 ? snapshot.switchCooldown.toFixed(1) : 'READY'}`} />
      </div>
    </div>
  )
}

function Bar({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) {
  return <div><div className="flex justify-between"><span>{label}</span><span>{value}</span></div><div className="mt-0.5 h-2 bg-white/15"><div className={`h-full ${color}`} style={{ width: `${Math.max(0, percent)}%` }} /></div></div>
}

function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <span className="flex items-center gap-1 bg-black/65 px-2 py-1">{icon}{text}</span>
}
