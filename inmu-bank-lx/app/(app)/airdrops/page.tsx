import { PageHeader } from '@/components/page-header'
import { getAirdrops } from '@/app/actions/data'
import { AirdropView } from '@/components/airdrop-view'

export default async function AirdropsPage() {
  const { received } = await getAirdrops()
  const serialized = received.map((a) => ({
    ...a,
    amount: String(a.amount),
    createdAt: a.createdAt.toISOString(),
  }))
  return (
    <div>
      <PageHeader titleKey="airdrops_title" />
      <AirdropView received={serialized} />
    </div>
  )
}
