import type { BattlePetId, BattleSettings } from './types'
import maleEvolvedImage from '@assets/inmu-pet-yajusenpai-male-evolved-v2.png'
import femaleEvolvedImage from '@assets/inmu-pet-yajusenpai-female-evolved-v2.png'

export const PET_DEFINITIONS = {
  'yajusenpai-male-evolved': {
    id: 'yajusenpai-male-evolved',
    name: '野獣先輩♂（進化後）',
    type: 'パワー',
    color: '#f7c744',
    image: maleEvolvedImage,
    hp: 800,
    atk: 150,
    def: 100,
    sp: 100,
    attackCooldown: 1.4,
    attackRange: 3.2,
    ultimateCost: 50,
    ultimateName: '固定810撃',
    ultimateDescription: '射程内の敵へ防御無視の810固定ダメージ',
  },
  'yajusenpai-female-evolved': {
    id: 'yajusenpai-female-evolved',
    name: '野獣先輩♀（進化後）',
    type: '連撃・サポート',
    color: '#a855f7',
    image: femaleEvolvedImage,
    hp: 600,
    atk: 100,
    def: 80,
    sp: 100,
    attackCooldown: 0.5,
    attackRange: 3.5,
    ultimateCost: 30,
    ultimateName: '連撃加速',
    ultimateDescription: '10秒間、攻撃量2倍・通常攻撃クールダウン短縮',
  },
} as const

export const DEFAULT_BATTLE_SETTINGS: BattleSettings = {
  petId: 'yajusenpai-male-evolved',
  partyPetIds: ['yajusenpai-male-evolved'],
  petLevel: 60,
  petHp: 800,
  petAtk: 150,
  petDef: 100,
  petSp: 100,
  enemyHp: 50_000,
  enemyAtk: 80,
  enemyDef: 50,
  enemyMoveSpeed: 2.2,
  enemyAttackInterval: 2.6,
  timeLimit: 180,
  enemyAi: true,
  invincible: false,
  freeUltimate: false,
  noAttackCooldown: false,
  stopEnemyAttacks: false,
  showDamage: true,
  showHitboxes: false,
}

export function settingsForPet(petId: BattlePetId, current: BattleSettings): BattleSettings {
  const pet = PET_DEFINITIONS[petId]
  return {
    ...current,
    petId,
    partyPetIds: [petId, ...current.partyPetIds.filter(id => id !== petId)].slice(0, 3),
    petHp: pet.hp,
    petAtk: pet.atk,
    petDef: pet.def,
    petSp: pet.sp,
  }
}
