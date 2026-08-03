import type { BattlePetId, BattleSettings } from './types'
import maleEvolvedImage from '@assets/inmu-pet-yajusenpai-male-evolved-v2.png'
import femaleEvolvedImage from '@assets/inmu-pet-yajusenpai-female-evolved-v2.png'
import maleBattleFront from '@assets/battle-yajusenpai-male-front-v1.png'
import maleBattleBack from '@assets/battle-yajusenpai-male-back-v1.png'
import maleBattleLeftA from '@assets/battle-yajusenpai-male-left-a-v1.png'
import maleBattleLeftB from '@assets/battle-yajusenpai-male-left-b-v1.png'
import maleBattleRightA from '@assets/battle-yajusenpai-male-right-a-v1.png'
import maleBattleRightB from '@assets/battle-yajusenpai-male-right-b-v1.png'
import femaleBattleFront from '@assets/battle-yajusenpai-female-front-v1.png'
import femaleBattleBack from '@assets/battle-yajusenpai-female-back-v1.png'
import femaleBattleLeftA from '@assets/battle-yajusenpai-female-left-a-v1.png'
import femaleBattleLeftB from '@assets/battle-yajusenpai-female-left-b-v1.png'
import femaleBattleRightA from '@assets/battle-yajusenpai-female-right-a-v1.png'
import femaleBattleRightB from '@assets/battle-yajusenpai-female-right-b-v1.png'
import maleAttackWindup from '@assets/battle-yajusenpai-male-attack-windup-v1.png'
import maleAttackImpact from '@assets/battle-yajusenpai-male-attack-impact-v1.png'
import maleDodge from '@assets/battle-yajusenpai-male-dodge-v1.png'
import maleUltimate from '@assets/battle-yajusenpai-male-ultimate-v1.png'
import femaleAttackWindup from '@assets/battle-yajusenpai-female-attack-windup-v1.png'
import femaleAttackImpact from '@assets/battle-yajusenpai-female-attack-impact-v1.png'
import femaleDodge from '@assets/battle-yajusenpai-female-dodge-v1.png'
import femaleUltimate from '@assets/battle-yajusenpai-female-ultimate-v1.png'

export const PET_DEFINITIONS = {
  'yajusenpai-male-evolved': {
    id: 'yajusenpai-male-evolved',
    name: '野獣先輩♂（進化後）',
    type: 'パワー',
    color: '#f7c744',
    image: maleEvolvedImage,
    battleSprites: {
      front: maleBattleFront,
      back: maleBattleBack,
      left: [maleBattleLeftA, maleBattleLeftB],
      right: [maleBattleRightA, maleBattleRightB],
      attack: [maleAttackWindup, maleAttackImpact],
      dodge: maleDodge,
      ultimate: maleUltimate,
    },
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
    battleSprites: {
      front: femaleBattleFront,
      back: femaleBattleBack,
      left: [femaleBattleLeftA, femaleBattleLeftB],
      right: [femaleBattleRightA, femaleBattleRightB],
      attack: [femaleAttackWindup, femaleAttackImpact],
      dodge: femaleDodge,
      ultimate: femaleUltimate,
    },
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
