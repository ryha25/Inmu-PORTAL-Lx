import femaleBaseImage from '@assets/inmu-pet-yajusenpai-female-base-v1.png'
import femaleBaseAngryImage from '@assets/inmu-pet-yajusenpai-female-base-angry-v1.png'
import femaleBaseAnnoyedImage from '@assets/inmu-pet-yajusenpai-female-base-annoyed-v1.png'
import femaleBaseBlinkImage from '@assets/inmu-pet-yajusenpai-female-base-blink-v1.png'
import femaleBaseHappyImage from '@assets/inmu-pet-yajusenpai-female-base-happy-v1.png'
import femaleBaseHungryImage from '@assets/inmu-pet-yajusenpai-female-base-hungry-v1.png'
import femaleBasePettedImage from '@assets/inmu-pet-yajusenpai-female-base-petted-v1.png'
import femaleBaseSleepImage from '@assets/inmu-pet-yajusenpai-female-base-sleep-v1.png'
import femaleBaseSleepyImage from '@assets/inmu-pet-yajusenpai-female-base-sleepy-v1.png'
import femaleEvolvedImage from '@assets/inmu-pet-yajusenpai-female-evolved-v1.png'
import femaleEvolvedAngryImage from '@assets/inmu-pet-yajusenpai-female-evolved-angry-v1.png'
import femaleEvolvedAnnoyedImage from '@assets/inmu-pet-yajusenpai-female-evolved-annoyed-v1.png'
import femaleEvolvedBlinkImage from '@assets/inmu-pet-yajusenpai-female-evolved-blink-v1.png'
import femaleEvolvedHappyImage from '@assets/inmu-pet-yajusenpai-female-evolved-happy-v1.png'
import femaleEvolvedHungryImage from '@assets/inmu-pet-yajusenpai-female-evolved-hungry-v1.png'
import femaleEvolvedPettedImage from '@assets/inmu-pet-yajusenpai-female-evolved-petted-v1.png'
import femaleEvolvedSleepImage from '@assets/inmu-pet-yajusenpai-female-evolved-sleep-v1.png'
import femaleEvolvedSleepyImage from '@assets/inmu-pet-yajusenpai-female-evolved-sleepy-v1.png'
import maleBaseImage from '@assets/inmu-pet-yajusenpai-male-base-v1.png'
import maleBaseAngryImage from '@assets/inmu-pet-yajusenpai-male-base-angry-v1.png'
import maleBaseAnnoyedImage from '@assets/inmu-pet-yajusenpai-male-base-annoyed-v1.png'
import maleBaseBlinkImage from '@assets/inmu-pet-yajusenpai-male-base-blink-v1.png'
import maleBaseHappyImage from '@assets/inmu-pet-yajusenpai-male-base-happy-v1.png'
import maleBaseHungryImage from '@assets/inmu-pet-yajusenpai-male-base-hungry-v1.png'
import maleBasePettedImage from '@assets/inmu-pet-yajusenpai-male-base-petted-v1.png'
import maleBaseSleepImage from '@assets/inmu-pet-yajusenpai-male-base-sleep-v1.png'
import maleBaseSleepyImage from '@assets/inmu-pet-yajusenpai-male-base-sleepy-v1.png'
import maleEvolvedImage from '@assets/inmu-pet-yajusenpai-male-evolved-v1.png'
import maleEvolvedAngryImage from '@assets/inmu-pet-yajusenpai-male-evolved-angry-v1.png'
import maleEvolvedAnnoyedImage from '@assets/inmu-pet-yajusenpai-male-evolved-annoyed-v1.png'
import maleEvolvedBlinkImage from '@assets/inmu-pet-yajusenpai-male-evolved-blink-v1.png'
import maleEvolvedHappyImage from '@assets/inmu-pet-yajusenpai-male-evolved-happy-v1.png'
import maleEvolvedHungryImage from '@assets/inmu-pet-yajusenpai-male-evolved-hungry-v1.png'
import maleEvolvedPettedImage from '@assets/inmu-pet-yajusenpai-male-evolved-petted-v1.png'
import maleEvolvedSleepImage from '@assets/inmu-pet-yajusenpai-male-evolved-sleep-v1.png'
import maleEvolvedSleepyImage from '@assets/inmu-pet-yajusenpai-male-evolved-sleepy-v1.png'
import femaleRoomImage from '@assets/inmu-pet-room-yajusenpai-female-v1.jpg'
import maleRoomImage from '@assets/inmu-pet-room-yajusenpai-male-v1.jpg'

export type UpcomingPetId =
  | 'yajusenpai-male-base'
  | 'yajusenpai-male-evolved'
  | 'yajusenpai-female-base'
  | 'yajusenpai-female-evolved'

export type UpcomingPetExpression =
  | 'default'
  | 'blink'
  | 'happy'
  | 'sleepy'
  | 'hungry'
  | 'petted'
  | 'annoyed'
  | 'angry'
  | 'sleep'

type UpcomingPetAssets = {
  default: string
  blink: string
  happy: string
  sleepy: string
  hungry: string
  petted: string
  annoyed: string
  angry: string
  sleep: string
}

type CombatStats = {
  level: 31 | 60
  hp: number
  attack: number
  defense: number
  sp: 100
  attackCooldownSeconds: number
}

type UpcomingPetDefinition = {
  id: UpcomingPetId
  internalLabel: string
  name: '野獣先輩♂' | '野獣先輩♀'
  gender: 'male' | 'female'
  rarity: 3 | 4
  edition: 'first-generation-limited'
  evolutionStage: 'base' | 'evolved'
  maxLevel: 30 | 60
  plannedAvailability: '2026-08-10以降'
  enabled: false
  visibleToUsers: false
  gachaEligible: false
  adminDistributable: false
  uniqueSkillStatus: 'pending'
  image: string
  roomImage: string
  expressions: Record<UpcomingPetExpression, string>
  evolution:
    | {
        evolvesTo: UpcomingPetId
        requiredLevel: 30
        pointCost: 100_000
        evolvedStartLevel: 31
      }
    | {
        evolvesFrom: UpcomingPetId
        normalCareExperienceEnabled: false
        levelRange: {
          min: 31
          max: 60
        }
      }
  combat:
    | null
    | {
        type: 'power' | 'multi-hit-support'
        stats: {
          level31: CombatStats
          level60: CombatStats
        }
        ultimate:
          | {
              spCost: 50
              fixedDamage: 810
              ignoresAttackAndDefense: true
            }
          | {
              spCost: 30
              durationSeconds: 10
              selfAttackCountMultiplier: 2
              reducesAlliesAttackCooldown: true
              cooldownReductionValueStatus: 'pending'
            }
      }
}

const maleBaseExpressions: UpcomingPetAssets = {
  default: maleBaseImage,
  blink: maleBaseBlinkImage,
  happy: maleBaseHappyImage,
  sleepy: maleBaseSleepyImage,
  hungry: maleBaseHungryImage,
  petted: maleBasePettedImage,
  annoyed: maleBaseAnnoyedImage,
  angry: maleBaseAngryImage,
  sleep: maleBaseSleepImage,
}

const maleEvolvedExpressions: UpcomingPetAssets = {
  default: maleEvolvedImage,
  blink: maleEvolvedBlinkImage,
  happy: maleEvolvedHappyImage,
  sleepy: maleEvolvedSleepyImage,
  hungry: maleEvolvedHungryImage,
  petted: maleEvolvedPettedImage,
  annoyed: maleEvolvedAnnoyedImage,
  angry: maleEvolvedAngryImage,
  sleep: maleEvolvedSleepImage,
}

const femaleBaseExpressions: UpcomingPetAssets = {
  default: femaleBaseImage,
  blink: femaleBaseBlinkImage,
  happy: femaleBaseHappyImage,
  sleepy: femaleBaseSleepyImage,
  hungry: femaleBaseHungryImage,
  petted: femaleBasePettedImage,
  annoyed: femaleBaseAnnoyedImage,
  angry: femaleBaseAngryImage,
  sleep: femaleBaseSleepImage,
}

const femaleEvolvedExpressions: UpcomingPetAssets = {
  default: femaleEvolvedImage,
  blink: femaleEvolvedBlinkImage,
  happy: femaleEvolvedHappyImage,
  sleepy: femaleEvolvedSleepyImage,
  hungry: femaleEvolvedHungryImage,
  petted: femaleEvolvedPettedImage,
  annoyed: femaleEvolvedAnnoyedImage,
  angry: femaleEvolvedAngryImage,
  sleep: femaleEvolvedSleepImage,
}

// This catalog is intentionally not imported by the live PET, gacha, or admin flows.
export const UPCOMING_PET_DEFINITIONS: readonly UpcomingPetDefinition[] = [
  {
    id: 'yajusenpai-male-base',
    internalLabel: '野獣先輩♂（進化前）',
    name: '野獣先輩♂',
    gender: 'male',
    rarity: 3,
    edition: 'first-generation-limited',
    evolutionStage: 'base',
    maxLevel: 30,
    plannedAvailability: '2026-08-10以降',
    enabled: false,
    visibleToUsers: false,
    gachaEligible: false,
    adminDistributable: false,
    uniqueSkillStatus: 'pending',
    image: maleBaseImage,
    roomImage: maleRoomImage,
    expressions: maleBaseExpressions,
    evolution: {
      evolvesTo: 'yajusenpai-male-evolved',
      requiredLevel: 30,
      pointCost: 100_000,
      evolvedStartLevel: 31,
    },
    combat: null,
  },
  {
    id: 'yajusenpai-male-evolved',
    internalLabel: '野獣先輩♂（進化後）',
    name: '野獣先輩♂',
    gender: 'male',
    rarity: 4,
    edition: 'first-generation-limited',
    evolutionStage: 'evolved',
    maxLevel: 60,
    plannedAvailability: '2026-08-10以降',
    enabled: false,
    visibleToUsers: false,
    gachaEligible: false,
    adminDistributable: false,
    uniqueSkillStatus: 'pending',
    image: maleEvolvedImage,
    roomImage: maleRoomImage,
    expressions: maleEvolvedExpressions,
    evolution: {
      evolvesFrom: 'yajusenpai-male-base',
      normalCareExperienceEnabled: false,
      levelRange: { min: 31, max: 60 },
    },
    combat: {
      type: 'power',
      stats: {
        level31: { level: 31, hp: 560, attack: 105, defense: 70, sp: 100, attackCooldownSeconds: 1.4 },
        level60: { level: 60, hp: 800, attack: 150, defense: 100, sp: 100, attackCooldownSeconds: 1.4 },
      },
      ultimate: {
        spCost: 50,
        fixedDamage: 810,
        ignoresAttackAndDefense: true,
      },
    },
  },
  {
    id: 'yajusenpai-female-base',
    internalLabel: '野獣先輩♀（進化前）',
    name: '野獣先輩♀',
    gender: 'female',
    rarity: 3,
    edition: 'first-generation-limited',
    evolutionStage: 'base',
    maxLevel: 30,
    plannedAvailability: '2026-08-10以降',
    enabled: false,
    visibleToUsers: false,
    gachaEligible: false,
    adminDistributable: false,
    uniqueSkillStatus: 'pending',
    image: femaleBaseImage,
    roomImage: femaleRoomImage,
    expressions: femaleBaseExpressions,
    evolution: {
      evolvesTo: 'yajusenpai-female-evolved',
      requiredLevel: 30,
      pointCost: 100_000,
      evolvedStartLevel: 31,
    },
    combat: null,
  },
  {
    id: 'yajusenpai-female-evolved',
    internalLabel: '野獣先輩♀（進化後）',
    name: '野獣先輩♀',
    gender: 'female',
    rarity: 4,
    edition: 'first-generation-limited',
    evolutionStage: 'evolved',
    maxLevel: 60,
    plannedAvailability: '2026-08-10以降',
    enabled: false,
    visibleToUsers: false,
    gachaEligible: false,
    adminDistributable: false,
    uniqueSkillStatus: 'pending',
    image: femaleEvolvedImage,
    roomImage: femaleRoomImage,
    expressions: femaleEvolvedExpressions,
    evolution: {
      evolvesFrom: 'yajusenpai-female-base',
      normalCareExperienceEnabled: false,
      levelRange: { min: 31, max: 60 },
    },
    combat: {
      type: 'multi-hit-support',
      stats: {
        level31: { level: 31, hp: 430, attack: 70, defense: 55, sp: 100, attackCooldownSeconds: 0.5 },
        level60: { level: 60, hp: 620, attack: 100, defense: 80, sp: 100, attackCooldownSeconds: 0.5 },
      },
      ultimate: {
        spCost: 30,
        durationSeconds: 10,
        selfAttackCountMultiplier: 2,
        reducesAlliesAttackCooldown: true,
        cooldownReductionValueStatus: 'pending',
      },
    },
  },
]

export const UPCOMING_EVOLVED_PET_SYSTEM_SPEC = {
  plannedAvailability: '2026-08-10以降',
  evolvedLevelRange: { min: 31, max: 60 },
  fixedSp: 100,
  normalCareExperienceEnabled: false,
  trainingSources: {
    specialTraining: { status: 'planned', plannedAvailability: '2026-08-10以降' },
    guerrillaQuest: { status: 'planned', plannedAvailability: '2026-09頃' },
    raidQuest: { status: 'planned', plannedAvailability: '2026-09頃' },
  },
  quests: {
    guerrilla: {
      schedule: 'daily',
      challengeLimit: { count: 1, period: 'day' },
      evolvedPetsOnly: true,
      grantsLargeExperience: true,
      level31ExpectedToClearAtLaunch: false,
    },
    raid: {
      schedule: 'weekly',
      challengeLimit: { count: 3, period: 'week' },
      evolvedPetsOnly: true,
      highHpBoss: true,
      cumulativeDamageRewards: true,
    },
  },
  deploymentCapacityByUnlockedTrainingSlots: {
    1: 1,
    2: 2,
    3: 3,
  },
} as const
