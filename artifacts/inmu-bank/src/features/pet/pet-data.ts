import nyarushianImage from '@assets/inmu-pet-nyarushian-v2.png'
import nyarushianAngryImage from '@assets/inmu-pet-nyarushian-angry-v1.png'
import nyarushianAnnoyedImage from '@assets/inmu-pet-nyarushian-annoyed-v1.png'
import nyarushianBlinkImage from '@assets/inmu-pet-nyarushian-blink-v1.png'
import nyarushianHappyImage from '@assets/inmu-pet-nyarushian-happy-v1.png'
import nyarushianHungryImage from '@assets/inmu-pet-nyarushian-hungry-v1.png'
import nyarushianPettedImage from '@assets/inmu-pet-nyarushian-petted-v1.png'
import nyarushianSleepyImage from '@assets/inmu-pet-nyarushian-sleepy-v1.png'
import nyarushianWalk1Image from '@assets/inmu-pet-nyarushian-walk-1-v1.png'
import nyarushianWalk2Image from '@assets/inmu-pet-nyarushian-walk-2-v1.png'
import takuyaImage from '@assets/inmu-pet-takuya-v2.png'
import takuyaAngryImage from '@assets/inmu-pet-takuya-angry-v1.png'
import takuyaAnnoyedImage from '@assets/inmu-pet-takuya-annoyed-v1.png'
import takuyaBlinkImage from '@assets/inmu-pet-takuya-blink-v1.png'
import takuyaHappyImage from '@assets/inmu-pet-takuya-happy-v1.png'
import takuyaHungryImage from '@assets/inmu-pet-takuya-hungry-v1.png'
import takuyaPettedImage from '@assets/inmu-pet-takuya-petted-v1.png'
import takuyaSleepyImage from '@assets/inmu-pet-takuya-sleepy-v1.png'
import leonImage from '@assets/inmu-pet-leon-v2.png'
import leonAngryImage from '@assets/inmu-pet-leon-angry-v1.png'
import leonAnnoyedImage from '@assets/inmu-pet-leon-annoyed-v1.png'
import leonBlinkImage from '@assets/inmu-pet-leon-blink-v1.png'
import leonHappyImage from '@assets/inmu-pet-leon-happy-v1.png'
import leonHungryImage from '@assets/inmu-pet-leon-hungry-v1.png'
import leonPettedImage from '@assets/inmu-pet-leon-petted-v1.png'
import leonSleepyImage from '@assets/inmu-pet-leon-sleepy-v1.png'
import inmuFestivalImage from '@assets/generated_images/mascot-v2-nobg.png'
import nyarushianRoomImage from '@assets/inmu-pet-room-nyarushian-v1.jpg'
import takuyaRoomImage from '@assets/inmu-pet-room-takuya-v1.jpg'
import leonRoomImage from '@assets/inmu-pet-room-leon-v1.jpg'
import festivalRoomImage from '@assets/inmu-pet-room-festival-v1.jpg'

export type PetId = 'nyarushian' | 'takuya' | 'leon' | 'inmu' | 'inmu-festival'
export type PetExpression = 'default' | 'blink' | 'happy' | 'sleepy' | 'hungry' | 'petted' | 'affectionate' | 'annoyed' | 'angry'

export type PetDefinition = {
  id: PetId
  name: string
  rarity: number
  image: string
  expressions: Record<PetExpression, string>
  walk: {
    enabled: boolean
    frames: readonly [string, string]
  }
  messages: {
    overpetted: string
  }
  roomWidth: string
  roomTheme: 'cat' | 'dog' | 'lion' | 'festival'
  roomImage: string
  costume?: {
    id: 'festival-810'
    label: string
  }
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
      affectionate: nyarushianPettedImage,
      annoyed: nyarushianAnnoyedImage,
      angry: nyarushianAngryImage,
    },
    walk: { enabled: true, frames: [nyarushianWalk1Image, nyarushianWalk2Image] },
    messages: { overpetted: 'もう十分だよ…' },
    roomWidth: 'clamp(205px, 46%, 290px)',
    roomTheme: 'cat',
    roomImage: nyarushianRoomImage,
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
      annoyed: takuyaAnnoyedImage,
      angry: takuyaAngryImage,
    },
    walk: { enabled: true, frames: [takuyaImage, takuyaImage] },
    messages: { overpetted: 'おいおい、もう十分だぜ！' },
    roomWidth: 'clamp(195px, 43%, 275px)',
    roomTheme: 'dog',
    roomImage: takuyaRoomImage,
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
      annoyed: leonAnnoyedImage,
      angry: leonAngryImage,
    },
    walk: { enabled: true, frames: [leonImage, leonImage] },
    messages: { overpetted: '余はもう十分だ。' },
    roomWidth: 'clamp(205px, 46%, 290px)',
    roomTheme: 'lion',
    roomImage: leonRoomImage,
    skill: { name: '王者の導き', effect: '愛情度ボーナス' },
    levelRewards: [
      { level: 10, label: '王家の絨毯' },
      { level: 20, label: '宝石の首飾り' },
      { level: 30, label: '獅子王の玉座' },
    ],
  },
  {
    id: 'inmu',
    name: 'INMUくん',
    rarity: 3,
    image: inmuFestivalImage,
    expressions: {
      default: inmuFestivalImage,
      blink: inmuFestivalImage,
      happy: inmuFestivalImage,
      sleepy: inmuFestivalImage,
      hungry: inmuFestivalImage,
      petted: inmuFestivalImage,
      affectionate: inmuFestivalImage,
      annoyed: inmuFestivalImage,
      angry: inmuFestivalImage,
    },
    walk: { enabled: true, frames: [inmuFestivalImage, inmuFestivalImage] },
    messages: { overpetted: 'もう十分だよ！' },
    roomWidth: 'clamp(185px, 41%, 255px)',
    roomTheme: 'festival',
    roomImage: festivalRoomImage,
    skill: { name: 'INMUスマイル', effect: '愛情度ボーナス' },
    levelRewards: [
      { level: 10, label: 'INMUマグ' },
      { level: 20, label: '金のコイン' },
      { level: 30, label: 'INMUクッション' },
    ],
  },
  {
    id: 'inmu-festival',
    name: 'INMUくん 810祭り',
    rarity: 3,
    image: inmuFestivalImage,
    expressions: {
      default: inmuFestivalImage,
      blink: inmuFestivalImage,
      happy: inmuFestivalImage,
      sleepy: inmuFestivalImage,
      hungry: inmuFestivalImage,
      petted: inmuFestivalImage,
      affectionate: inmuFestivalImage,
      annoyed: inmuFestivalImage,
      angry: inmuFestivalImage,
    },
    walk: { enabled: true, frames: [inmuFestivalImage, inmuFestivalImage] },
    messages: { overpetted: '祭りは楽しいけど、なでるのはもう十分！' },
    roomWidth: 'clamp(185px, 41%, 255px)',
    roomTheme: 'festival',
    roomImage: festivalRoomImage,
    costume: { id: 'festival-810', label: '810祭りVer.' },
    skill: { name: '810祭り魂', effect: 'お世話時ポイントボーナス' },
    levelRewards: [
      { level: 10, label: '810提灯' },
      { level: 20, label: '祭り太鼓' },
      { level: 30, label: '金のINMU神輿' },
    ],
  },
]

export const PET_BY_ID = Object.fromEntries(
  PET_DEFINITIONS.map(pet => [pet.id, pet]),
) as Record<PetId, PetDefinition>
