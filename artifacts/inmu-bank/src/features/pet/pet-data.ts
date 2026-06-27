import nyarushianImage from '@assets/inmu-pet-nyarushian-v2.png'
import takuyaImage from '@assets/inmu-pet-takuya-v2.png'
import leonImage from '@assets/inmu-pet-leon-v2.png'

export type PetId = 'nyarushian' | 'takuya' | 'leon'

export type PetDefinition = {
  id: PetId
  name: string
  rarity: number
  image: string
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
