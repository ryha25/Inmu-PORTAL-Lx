import { PageHeader } from '@/components/page-header'
import { getRewards } from '@/app/actions/data'
import { RewardView } from '@/components/reward-view'

export default async function RewardsPage() {
  const rewards = await getRewards()
  const serialized = rewards.map((r) => ({
    ...r,
    amount: String(r.amount),
    createdAt: r.createdAt.toISOString(),
  }))
  return (
    <div>
      <PageHeader titleKey="rewards_title" />
      <RewardView rewards={serialized} />
    </div>
  )
}
