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
import chingeImage from '@assets/inmu-pet-chinge-v1.png'
import chingeAngryImage from '@assets/inmu-pet-chinge-angry-v1.png'
import chingeAnnoyedImage from '@assets/inmu-pet-chinge-annoyed-v1.png'
import chingeBlinkImage from '@assets/inmu-pet-chinge-blink-v1.png'
import chingeHappyImage from '@assets/inmu-pet-chinge-happy-v1.png'
import chingeHungryImage from '@assets/inmu-pet-chinge-hungry-v1.png'
import chingePettedImage from '@assets/inmu-pet-chinge-petted-v1.png'
import chingeSleepyImage from '@assets/inmu-pet-chinge-sleepy-v1.png'
import tdnImage from '@assets/inmu-pet-tdn-v1.png'
import tdnAngryImage from '@assets/inmu-pet-tdn-angry-v1.png'
import tdnAnnoyedImage from '@assets/inmu-pet-tdn-annoyed-v1.png'
import tdnBlinkImage from '@assets/inmu-pet-tdn-blink-v1.png'
import tdnHappyImage from '@assets/inmu-pet-tdn-happy-v1.png'
import tdnHungryImage from '@assets/inmu-pet-tdn-hungry-v1.png'
import tdnPettedImage from '@assets/inmu-pet-tdn-petted-v1.png'
import tdnSleepyImage from '@assets/inmu-pet-tdn-sleepy-v1.png'
import whipImage from '@assets/inmu-pet-whip-v1.png'
import whipAngryImage from '@assets/inmu-pet-whip-angry-v1.png'
import whipAnnoyedImage from '@assets/inmu-pet-whip-annoyed-v1.png'
import whipBlinkImage from '@assets/inmu-pet-whip-blink-v1.png'
import whipHappyImage from '@assets/inmu-pet-whip-happy-v1.png'
import whipHungryImage from '@assets/inmu-pet-whip-hungry-v1.png'
import whipPettedImage from '@assets/inmu-pet-whip-petted-v1.png'
import whipSleepyImage from '@assets/inmu-pet-whip-sleepy-v1.png'
import nyarushianRoomImage from '@assets/inmu-pet-room-nyarushian-v1.jpg'
import takuyaRoomImage from '@assets/inmu-pet-room-takuya-v1.jpg'
import leonRoomImage from '@assets/inmu-pet-room-leon-v1.jpg'
import festivalRoomImage from '@assets/inmu-pet-room-festival-v1.jpg'
import chingeRoomImage from '@assets/inmu-pet-room-chinge-v1.jpg'
import tdnRoomImage from '@assets/inmu-pet-room-tdn-v1.jpg'
import whipRoomImage from '@assets/inmu-pet-room-whip-v1.jpg'

export type PetId = 'nyarushian' | 'takuya' | 'leon' | 'chinge' | 'tdn' | 'whip' | 'inmu-festival'
export type PetExpression = 'default' | 'blink' | 'happy' | 'sleepy' | 'hungry' | 'petted' | 'affectionate' | 'annoyed' | 'angry'

export type PetDefinition = {
  id: PetId
  name: string
  rarity: number
  maxLevel: number
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
    level: number
    label: string
    detail?: string
    delivery?: string
    inmuAmount?: number
    rebateBonus?: number
  }[]
}

export const PET_DEFINITIONS: readonly PetDefinition[] = [
  {
    id: 'nyarushian',
    name: 'ニャルシアン',
    rarity: 3,
    maxLevel: 30,
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
      { level: 10, label: '紫の毛糸 + 購入申請還元 +5%', detail: 'Lv.10到達で還元率+5%が自動適用', rebateBonus: 5 },
      { level: 20, label: '特製クッション + INMU報酬', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.20 報酬INMU」と連動', delivery: '申請式（承認後送金）', inmuAmount: 50_000 },
      { level: 30, label: 'ニャル王冠 + INMU報酬 + 購入申請還元 +5%', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.30 報酬INMU」と連動・Lv.10+Lv.30で還元+10%', delivery: '申請式（承認後送金）', inmuAmount: 250_000, rebateBonus: 5 },
    ],
  },
  {
    id: 'takuya',
    name: '拓也',
    rarity: 3,
    maxLevel: 30,
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
      effect: 'ガチャ無料回数 +3回（毎日・通常＋有償合算）',
      notes: ['Lv.1から発動', '通常ガチャ・有償ガチャ合わせて毎日+3回分', '毎日0:00（JST）リセット'],
    },
    levelRewards: [
      { level: 10, label: '金のダンベル + 購入申請還元 +5%', detail: 'Lv.10到達で還元率+5%が自動適用', rebateBonus: 5 },
      { level: 20, label: '特製サングラス + INMU報酬', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.20 報酬INMU」と連動', delivery: '申請式（承認後送金）', inmuAmount: 50_000 },
      { level: 30, label: '拓也ソファ + INMU報酬 + 購入申請還元 +5%', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.30 報酬INMU」と連動・Lv.10+Lv.30で還元+10%', delivery: '申請式（承認後送金）', inmuAmount: 250_000, rebateBonus: 5 },
    ],
  },
  {
    id: 'leon',
    name: 'レオン',
    rarity: 3,
    maxLevel: 30,
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
      { level: 10, label: '王家の絨毯 + 購入申請還元 +5%', detail: 'Lv.10到達で還元率+5%が自動適用', rebateBonus: 5 },
      { level: 20, label: '宝石の首飾り + INMU報酬', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.20 報酬INMU」と連動', delivery: '申請式（承認後送金）', inmuAmount: 50_000 },
      { level: 30, label: '獅子王の玉座 + INMU報酬 + 購入申請還元 +5%', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.30 報酬INMU」と連動・Lv.10+Lv.30で還元+10%', delivery: '申請式（承認後送金）', inmuAmount: 250_000, rebateBonus: 5 },
    ],
  },
  {
    id: 'chinge',
    name: 'チンゲ',
    rarity: 3,
    maxLevel: 30,
    image: chingeImage,
    expressions: {
      default: chingeImage,
      blink: chingeBlinkImage,
      happy: chingeHappyImage,
      sleepy: chingeSleepyImage,
      hungry: chingeHungryImage,
      petted: chingePettedImage,
      affectionate: chingePettedImage,
      annoyed: chingeAnnoyedImage,
      angry: chingeAngryImage,
    },
    walk: { enabled: true, frames: [chingeImage, chingeImage], distancePercent: 17, tickMs: 310 },
    messages: { overpetted: '……しつこい。' },
    dialogues: {
      idle: ['夜は静かだ。', '月が出ている。', '無駄口は好まない。'],
      walking: ['月明かりが導く。', '静かに行こう。', '匂いを追っている。'],
      care: ['悪くない。', '少しだけなら。', '力が満ちる。'],
    },
    reactionDurations: { feed: 4200, play: 4400, pet: 3800, angry: 4600 },
    roomWidth: 'clamp(205px, 46%, 290px)',
    roomTheme: 'cat',
    roomImage: chingeRoomImage,
    skill: {
      name: '月夜',
      effect: '購入申請上限 +100,000 INMU（1日）',
      notes: ['Lv.1から発動', '1日の購入申請可能枠を10万INMU拡張'],
    },
    levelRewards: [
      { level: 10, label: '月影の護符 + 購入申請還元 +5%', detail: 'Lv.10到達で還元率5%が自動適用', rebateBonus: 5 },
      { level: 20, label: '特製クリスタル + INMU報酬', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.20 報酬INMU」と連動', delivery: '申請式（管理者確認後送信）', inmuAmount: 50_000 },
      { level: 30, label: 'チンゲの月冠 + INMU報酬 + 購入申請還元 +5%', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.30 報酬INMU」と連動。Lv.10+Lv.30で還元+10%', delivery: '申請式（管理者確認後送信）', inmuAmount: 250_000, rebateBonus: 5 },
    ],
  },
  {
    id: 'tdn',
    name: 'TDN',
    rarity: 5,
    maxLevel: 30,
    image: tdnImage,
    expressions: {
      default: tdnImage,
      blink: tdnBlinkImage,
      happy: tdnHappyImage,
      sleepy: tdnSleepyImage,
      hungry: tdnHungryImage,
      petted: tdnPettedImage,
      affectionate: tdnPettedImage,
      annoyed: tdnAnnoyedImage,
      angry: tdnAngryImage,
    },
    walk: { enabled: true, frames: [tdnImage, tdnImage], distancePercent: 19, tickMs: 260 },
    messages: { overpetted: '試合前だ、集中させろ。' },
    dialogues: {
      idle: ['肩はできている。', '全力投球だ。', '勝つ準備はできた。'],
      walking: ['ブルペンまで走るぞ。', '足腰も大事だ。', '球筋を確かめる。'],
      care: ['悪くない補給だ。', '気合いが入った。', 'まだ投げられる。'],
    },
    reactionDurations: { feed: 4000, play: 4300, pet: 3600, angry: 4500 },
    roomWidth: 'clamp(200px, 44%, 280px)',
    roomTheme: 'dog',
    roomImage: tdnRoomImage,
    skill: {
      name: 'オナシャス！センセンシャル',
      effect: 'ガチャ後に1日1回、ランダムでもう一度同じ回数を引ける',
      notes: ['Lv.1から発動', '発動時は結果画面に「もう一度引く」が表示されます'],
    },
    levelRewards: [
      { level: 10, label: '炎のミット + 購入申請還元 +5%', detail: 'Lv.10到達で還元率5%が自動適用', rebateBonus: 5 },
      { level: 20, label: '特製ユニフォーム + INMU報酬', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.20 報酬INMU」と連動', delivery: '申請式（管理者確認後送信）', inmuAmount: 50_000 },
      { level: 30, label: 'TDNブルペン勲章 + INMU報酬 + 購入申請還元 +5%', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.30 報酬INMU」と連動。Lv.10+Lv.30で還元+10%', delivery: '申請式（管理者確認後送信）', inmuAmount: 250_000, rebateBonus: 5 },
    ],
  },
  {
    id: 'whip',
    name: 'ホイップ',
    rarity: 1,
    maxLevel: 30,
    image: whipImage,
    expressions: {
      default: whipImage,
      blink: whipBlinkImage,
      happy: whipHappyImage,
      sleepy: whipSleepyImage,
      hungry: whipHungryImage,
      petted: whipPettedImage,
      affectionate: whipPettedImage,
      annoyed: whipAnnoyedImage,
      angry: whipAngryImage,
    },
    walk: { enabled: true, frames: [whipImage, whipImage], distancePercent: 18, tickMs: 280 },
    messages: { overpetted: 'ふわふわが乱れちゃうよ。' },
    dialogues: {
      idle: ['ふわふわしてるよ。', '甘いものが好き！', 'そばにいるね。'],
      walking: ['雲の道を歩こう。', 'ぴょんぴょん行くよ。', 'きらきら見つけた！'],
      care: ['うれしいな。', 'もっと元気になったよ。', 'ふわっと回復！'],
    },
    reactionDurations: { feed: 4000, play: 4400, pet: 3700, angry: 4600 },
    roomWidth: 'clamp(185px, 41%, 255px)',
    roomTheme: 'festival',
    roomImage: whipRoomImage,
    skill: {
      name: '幸せの青い鳥',
      effect: '散歩回数 +1回 / 散歩時のアイテム拾得率2倍',
      notes: ['Lv.1から発動', '散歩の本日上限とアイテム抽選に補正'],
    },
    levelRewards: [
      { level: 10, label: '雲のリボン + 購入申請還元 +5%', detail: 'Lv.10到達で還元率5%が自動適用', rebateBonus: 5 },
      { level: 20, label: 'ふわふわチャーム + INMU報酬', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.20 報酬INMU」と連動', delivery: '申請式（管理者確認後送信）', inmuAmount: 50_000 },
      { level: 30, label: 'ホイップクラウン + INMU報酬 + 購入申請還元 +5%', detail: '報酬INMUは管理画面の「ガチャキャラ Lv.30 報酬INMU」と連動。Lv.10+Lv.30で還元+10%', delivery: '申請式（管理者確認後送信）', inmuAmount: 250_000, rebateBonus: 5 },
    ],
  },
  {
    id: 'inmu-festival',
    name: 'INMUくん（810祭りVer.）',
    rarity: 3,
    maxLevel: 15,
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
      notes: ['Lv.1から発動', 'イベント期間中のみ有効'],
    },
    levelRewards: [
      { level: 10, label: '100,000ポイント', detail: '達成と同時に即時付与', delivery: '即時付与' },
      { level: 15, label: '30,000 INMU', detail: '購入申請還元率 +5%（全対象）', delivery: '申請式（承認後送金）', inmuAmount: 30_000, rebateBonus: 5 },
    ],
  },
]

export const PET_BY_ID = Object.fromEntries(
  PET_DEFINITIONS.map(pet => [pet.id, pet]),
) as Record<PetId, PetDefinition>
