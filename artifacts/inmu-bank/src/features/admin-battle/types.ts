export type BattlePetId = 'yajusenpai-male-evolved' | 'yajusenpai-female-evolved'

export type BattlePhase = 'ready' | 'playing' | 'paused' | 'won' | 'lost' | 'timeout' | 'aborted'

export type BattleSettings = {
  petId: BattlePetId
  petLevel: number
  petHp: number
  petAtk: number
  petDef: number
  petSp: number
  enemyHp: number
  enemyAtk: number
  enemyDef: number
  enemyMoveSpeed: number
  enemyAttackInterval: number
  timeLimit: number
  enemyAi: boolean
  invincible: boolean
  freeUltimate: boolean
  noAttackCooldown: boolean
  stopEnemyAttacks: boolean
  showDamage: boolean
  showHitboxes: boolean
}

export type BattleSnapshot = {
  phase: BattlePhase
  playerHp: number
  playerMaxHp: number
  playerSp: number
  playerMaxSp: number
  enemyHp: number
  enemyMaxHp: number
  remainingSeconds: number
  attackCooldown: number
  dodgeCooldown: number
  ultimateCooldown: number
  femaleBuffSeconds: number
  message: string
}

export type BattleResult = {
  battleId: string
  mode: 'admin_test'
  startedAt: string
  endedAt: string
  durationMs: number
  damageDealt: number
  damageTaken: number
  normalAttackCount: number
  ultimateCount: number
  dodgeCount: number
  outcome: Exclude<BattlePhase, 'ready' | 'playing' | 'paused'>
  petId: BattlePetId
  petLevel: number
  enemyId: 'test-monster'
  rewardsEnabled: false
}

export type BattleSceneHandle = {
  attack: () => void
  ultimate: () => void
  dodge: () => void
  togglePause: () => void
  setMobileMove: (x: number, y: number) => void
  addMobileLook: (x: number, y: number) => void
  abort: () => void
}

export type DamagePopup = {
  id: number
  amount: number
  kind: 'player' | 'enemy' | 'fixed'
}
