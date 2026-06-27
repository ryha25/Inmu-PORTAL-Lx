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
}

export const PET_DEFINITIONS: readonly PetDefinition[] = [
  {
    id: 'nyarushian',
    name: 'ニャルシアン',
    rarity: 3,
    image: nyarushianImage,
    roomWidth: 'clamp(230px, 58%, 350px)',
  },
  {
    id: 'takuya',
    name: '拓也',
    rarity: 3,
    image: takuyaImage,
    roomWidth: 'clamp(220px, 55%, 330px)',
  },
  {
    id: 'leon',
    name: 'レオン',
    rarity: 3,
    image: leonImage,
    roomWidth: 'clamp(230px, 58%, 350px)',
  },
]

export const PET_BY_ID = Object.fromEntries(
  PET_DEFINITIONS.map(pet => [pet.id, pet]),
) as Record<PetId, PetDefinition>
