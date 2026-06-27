import nyarushianImage from '@assets/inmu-pet-nyarushian-v2.png'
import nyarushianBlinkImage from '@assets/inmu-pet-nyarushian-blink-v1.png'
import nyarushianHappyImage from '@assets/inmu-pet-nyarushian-happy-v1.png'
import nyarushianHungryImage from '@assets/inmu-pet-nyarushian-hungry-v1.png'
import nyarushianPettedImage from '@assets/inmu-pet-nyarushian-petted-v1.png'
import nyarushianSleepyImage from '@assets/inmu-pet-nyarushian-sleepy-v1.png'
import takuyaImage from '@assets/inmu-pet-takuya-v2.png'
import takuyaBlinkImage from '@assets/inmu-pet-takuya-blink-v1.png'
import takuyaHappyImage from '@assets/inmu-pet-takuya-happy-v1.png'
import takuyaHungryImage from '@assets/inmu-pet-takuya-hungry-v1.png'
import takuyaPettedImage from '@assets/inmu-pet-takuya-petted-v1.png'
import takuyaSleepyImage from '@assets/inmu-pet-takuya-sleepy-v1.png'
import leonImage from '@assets/inmu-pet-leon-v2.png'
import leonBlinkImage from '@assets/inmu-pet-leon-blink-v1.png'
import leonHappyImage from '@assets/inmu-pet-leon-happy-v1.png'
import leonHungryImage from '@assets/inmu-pet-leon-hungry-v1.png'
import leonPettedImage from '@assets/inmu-pet-leon-petted-v1.png'
import leonSleepyImage from '@assets/inmu-pet-leon-sleepy-v1.png'

export type PetId = 'nyarushian' | 'takuya' | 'leon'
export type PetExpression = 'default' | 'blink' | 'happy' | 'sleepy' | 'hungry' | 'petted' | 'affectionate'

export type PetDefinition = {
  id: PetId
  name: string
  rarity: number
  image: string
  expressions: Record<PetExpression, string>
  roomWidth: string
  roomTheme: 'cat' | 'dog' | 'lion'
  skill: {
    name: string
    effect: string
  }
  levelRewards: readonly {
    level: 10 | 20 | 30
    label: string
  }[]
}

export const PET_DEFINITIONS: readonly PetDefinition[] = [
  {
    id: 'nyarushian',
    name: 'ニャルシアン',
    rarity: 3,
    image: nyarushianImage,
    expressions: {
      default: nyarushianImage,
      blink: nyarushianBlinkImage,
      happy: nyarushianHappyImage,
      sleepy: nyarushianSleepyImage,
      hungry: nyarushianHungryImage,
      petted: nyarushianPettedImage,
      affectionate: nyarushianHappyImage,
    },
    roomWidth: 'clamp(205px, 46%, 290px)',
    roomTheme: 'cat',
    skill: { name: '幸運の肉球', effect: 'ポイント2倍' },
    levelRewards: [
      { level: 10, label: '紫の毛糸' },
      { level: 20, label: '特製クッション' },
      { level: 30, label: 'ニャル王冠' },
    ],
  },
  {
    id: 'takuya',
    name: '拓也',
    rarity: 3,
    image: takuyaImage,
    expressions: {
      default: takuyaImage,
      blink: takuyaBlinkImage,
      happy: takuyaHappyImage,
      sleepy: takuyaSleepyImage,
      hungry: takuyaHungryImage,
      petted: takuyaPettedImage,
      affectionate: takuyaHappyImage,
    },
    roomWidth: 'clamp(195px, 43%, 275px)',
    roomTheme: 'dog',
    skill: { name: '盛り上げ上手', effect: 'お世話EXPアップ' },
    levelRewards: [
      { level: 10, label: '金のダンベル' },
      { level: 20, label: '特製サングラス' },
      { level: 30, label: '拓也ソファ' },
    ],
  },
  {
    id: 'leon',
    name: 'レオン',
    rarity: 3,
    image: leonImage,
    expressions: {
      default: leonImage,
      blink: leonBlinkImage,
      happy: leonHappyImage,
      sleepy: leonSleepyImage,
      hungry: leonHungryImage,
      petted: leonPettedImage,
      affectionate: leonHappyImage,
    },
    roomWidth: 'clamp(205px, 46%, 290px)',
    roomTheme: 'lion',
    skill: { name: '王者の導き', effect: '愛情度ボーナス' },
    levelRewards: [
      { level: 10, label: '王家の絨毯' },
      { level: 20, label: '宝石の首飾り' },
      { level: 30, label: '獅子王の玉座' },
    ],
  },
]

export const PET_BY_ID = Object.fromEntries(
  PET_DEFINITIONS.map(pet => [pet.id, pet]),
) as Record<PetId, PetDefinition>
