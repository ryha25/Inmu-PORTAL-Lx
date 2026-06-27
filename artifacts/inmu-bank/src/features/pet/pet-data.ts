import nyarushianImage from '@assets/inmu-pet-nyarushian.jpg'
import takuyaImage from '@assets/inmu-pet-takuya.jpg'
import leonImage from '@assets/inmu-pet-leon.jpg'

export type PetId = 'nyarushian' | 'takuya' | 'leon'

export type PetDefinition = {
  id: PetId
  name: string
  rarity: number
  image: string
  imagePosition: string
}

export const PET_DEFINITIONS: readonly PetDefinition[] = [
  {
    id: 'nyarushian',
    name: 'ニャルシアン',
    rarity: 3,
    image: nyarushianImage,
    imagePosition: '68% center',
  },
  {
    id: 'takuya',
    name: '拓也',
    rarity: 3,
    image: takuyaImage,
    imagePosition: '72% center',
  },
  {
    id: 'leon',
    name: 'レオン',
    rarity: 3,
    image: leonImage,
    imagePosition: 'center 38%',
  },
]

export const PET_BY_ID = Object.fromEntries(
  PET_DEFINITIONS.map(pet => [pet.id, pet]),
) as Record<PetId, PetDefinition>

