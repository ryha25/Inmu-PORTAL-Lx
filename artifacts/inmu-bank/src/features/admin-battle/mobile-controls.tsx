import { RefreshCw, Shield, Sparkles, Swords } from 'lucide-react'
import { useRef, useState } from 'react'

export function MobileControls({ onMove, onLook, onAttack, onUltimate, onDodge, onSwitch }: {
  onMove: (x: number, y: number) => void
  onLook: (x: number, y: number) => void
  onAttack: () => void
  onUltimate: () => void
  onDodge: () => void
  onSwitch: () => void
}) {
  const stickRef = useRef<HTMLDivElement>(null)
  const lookPoint = useRef<{ x: number; y: number } | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const moveStick = (clientX: number, clientY: number) => {
    const rect = stickRef.current?.getBoundingClientRect()
    if (!rect) return
    const radius = rect.width * 0.32
    let x = clientX - (rect.left + rect.width / 2)
    let y = clientY - (rect.top + rect.height / 2)
    const length = Math.hypot(x, y)
    if (length > radius) { x = (x / length) * radius; y = (y / length) * radius }
    setKnob({ x, y }); onMove(x / radius, -y / radius)
  }

  return (
    <div className="absolute inset-0 z-30 md:hidden" style={{ touchAction: 'none' }}>
      <div
        className="absolute inset-0"
        onPointerDown={(event) => { lookPoint.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={(event) => { if (!lookPoint.current) return; onLook(event.clientX - lookPoint.current.x, event.clientY - lookPoint.current.y); lookPoint.current = { x: event.clientX, y: event.clientY } }}
        onPointerUp={() => { lookPoint.current = null }}
      />
      <div
        ref={stickRef}
        className="absolute bottom-[max(22px,env(safe-area-inset-bottom))] left-5 z-10 size-32 rounded-full border border-white/35 bg-black/35"
        onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); moveStick(event.clientX, event.clientY) }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveStick(event.clientX, event.clientY) }}
        onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); setKnob({ x: 0, y: 0 }); onMove(0, 0) }}
      >
        <span className="absolute left-1/2 top-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-white/20" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
      </div>
      <div className="absolute bottom-[max(22px,env(safe-area-inset-bottom))] right-4 z-10 grid grid-cols-2 gap-3">
        <ActionButton label="必殺" onClick={onUltimate}><Sparkles className="size-6" /></ActionButton>
        <button type="button" onPointerDown={(e) => { e.stopPropagation(); onAttack() }} className="row-span-2 grid size-20 place-items-center rounded-full border-2 border-amber-300 bg-amber-400/85 text-black shadow-lg"><Swords className="size-8" /><span className="text-[10px] font-bold">攻撃</span></button>
        <ActionButton label="回避" onClick={onDodge}><Shield className="size-6" /></ActionButton>
      </div>
      <div className="absolute right-5 z-10" style={{ bottom: 'calc(max(22px, env(safe-area-inset-bottom)) + 150px)' }}>
        <ActionButton label="交代" onClick={onSwitch}><RefreshCw className="size-6" /></ActionButton>
      </div>
    </div>
  )
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onPointerDown={(e) => { e.stopPropagation(); onClick() }} className="grid size-14 place-items-center rounded-full border border-white/50 bg-black/65 text-white"><span>{children}</span><span className="text-[9px]">{label}</span></button>
}
