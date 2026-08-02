export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export function rollDamage(attack: number, defense: number, fixed?: number): number {
  const base = fixed ?? Math.max(1, attack - defense * 0.5)
  const variance = 0.95 + Math.random() * 0.1
  return Math.max(1, Math.round(base * variance))
}

export function createBattleId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `battle-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
