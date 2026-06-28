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
import inmuFestivalImage from '@assets/inmu-pet-festival-810-v2.png'
import inmuFestivalAngryImage from '@assets/inmu-pet-festival-810-angry-v1.png'
import inmuFestivalAnnoyedImage from '@assets/inmu-pet-festival-810-annoyed-v1.png'
import inmuFestivalBlinkImage from '@assets/inmu-pet-festival-810-blink-v1.png'
import inmuFestivalHungryImage from '@assets/inmu-pet-festival-810-hungry-v1.png'
import inmuFestivalSleepyImage from '@assets/inmu-pet-festival-810-sleepy-v1.png'
import nyarushianRoomImage from '@assets/inmu-pet-room-nyarushian-v1.jpg'
import takuyaRoomImage from '@assets/inmu-pet-room-takuya-v1.jpg'
import leonRoomImage from '@assets/inmu-pet-room-leon-v1.jpg'
import festivalRoomImage from '@assets/inmu-pet-room-festival-v1.jpg'

export type PetId = 'nyarushian' | 'takuya' | 'leon' | 'inmu-festival'
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
    distancePercent: number
    tickMs: number
  }
  messages: {
    overpetted: string
  }
  dialogues: {
    idle: readonly string[]
    walking: readonly string[]
    care: readonly string[]
  }
  reactionDurations: {
    feed: number
    play: number
    pet: number
    angry: number
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
    notes: readonly string[]
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
    walk: { enabled: true, frames: [nyarushianWalk1Image, nyarushianWalk2Image], distancePercent: 17, tickMs: 310 },
    messages: { overpetted: 'もう十分だよ…' },
    dialogues: {
      idle: ['別に…', '暇なんだけど。', '眠い…', 'ふーん。', '今日は気分いいかも。'],
      walking: ['暇なんだけど。', 'ふーん。', 'ご飯まだ？'],
      care: ['なでてもいいけど…', 'ご飯まだ？', '今日は気分いいかも。'],
    },
    reactionDurations: { feed: 4200, play: 4400, pet: 3800, angry: 4600 },
    roomWidth: 'clamp(205px, 46%, 290px)',
    roomTheme: 'cat',
    roomImage: nyarushianRoomImage,
    skill: {
      name: '幸運の肉球',
      effect: '毎日受け取れるポイント ×2',
      notes: ['Lv.1から発動', 'デイリーポイント受取時に適用'],
    },
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
    walk: { enabled: true, frames: [takuyaImage, takuyaImage], distancePercent: 19, tickMs: 260 },
    messages: { overpetted: 'おいおい、もう十分だぜ！' },
    dialogues: {
      idle: ['やりますねぇ！', '最高だぜぇ！', '今日も元気！', '腹減った！'],
      walking: ['いいよ、来いよ！', '遊ぼうぜ！', '今日も元気！'],
      care: ['やりますねぇ！', '最高だぜぇ！', 'イキスギィ！'],
    },
    reactionDurations: { feed: 4000, play: 4300, pet: 3600, angry: 4500 },
    roomWidth: 'clamp(195px, 43%, 275px)',
    roomTheme: 'dog',
    roomImage: takuyaRoomImage,
    skill: {
      name: '卍解',
      effect: 'ガチャ無料回数 +3回（毎日）',
      notes: ['Lv.1から発動', '通常の無料ガチャとは別に毎日3回', '毎日0:00（JST）リセット'],
    },
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
    walk: { enabled: true, frames: [leonImage, leonImage], distancePercent: 15, tickMs: 330 },
    messages: { overpetted: '余はもう十分だ。' },
    dialogues: {
      idle: ['仲間は大切だ。', '焦る必要はない。', '平和が一番だ。'],
      walking: ['共に進もう。', '今日も鍛錬だ。', '強くなろう。'],
      care: ['ありがとう。', '仲間は大切だ。', '共に進もう。'],
    },
    reactionDurations: { feed: 4100, play: 4200, pet: 3900, angry: 4700 },
    roomWidth: 'clamp(205px, 46%, 290px)',
    roomTheme: 'lion',
    roomImage: leonRoomImage,
    skill: {
      name: '百獣の王',
      effect: '購入申請上限 +100,000 INMU（1日）',
      notes: ['Lv.1から発動', '1日の購入申請可能枚数を10万INMU拡張'],
    },
    levelRewards: [
      { level: 10, label: '王家の絨毯' },
      { level: 20, label: '宝石の首飾り' },
      { level: 30, label: '獅子王の玉座' },
    ],
  },
  {
    id: 'inmu-festival',
    name: 'INMUくん 810祭り',
    rarity: 3,
    image: inmuFestivalImage,
    expressions: {
      default: inmuFestivalImage,
      blink: inmuFestivalBlinkImage,
      happy: inmuFestivalImage,
      sleepy: inmuFestivalSleepyImage,
      hungry: inmuFestivalHungryImage,
      petted: inmuFestivalImage,
      affectionate: inmuFestivalImage,
      annoyed: inmuFestivalAnnoyedImage,
      angry: inmuFestivalAngryImage,
    },
    walk: { enabled: true, frames: [inmuFestivalImage, inmuFestivalImage], distancePercent: 18, tickMs: 280 },
    messages: { overpetted: '祭りは楽しいけど、なでるのはもう十分！' },
    dialogues: {
      idle: ['810祭り開催中！', '今日も盛り上がろう！', 'INMU最高！'],
      walking: ['祭りだー！！', 'わっしょい！', '遊ぼう！'],
      care: ['ありがとう！', '今日も盛り上がろう！', 'わっしょい！'],
    },
    reactionDurations: { feed: 4000, play: 4400, pet: 3700, angry: 4600 },
    roomWidth: 'clamp(185px, 41%, 255px)',
    roomTheme: 'festival',
    roomImage: festivalRoomImage,
    costume: { id: 'festival-810', label: '810祭りVer.' },
    skill: {
      name: '810祭り‼️',
      effect: '購入申請（イベント時）還元率 +5%',
      notes: ['Lv.1から発動', 'イベント期間中のみ有効', 'イベント時の購入申請還元率に+5%加算'],
    },
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
