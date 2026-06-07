import { PageHeader } from '@/components/page-header'
import { getGoals } from '@/app/actions/data'
import { GoalView } from '@/components/goal-view'

export default async function GoalsPage() {
  const goals = await getGoals()
  const serialized = goals.map((g) => ({
    ...g,
    targetAmount: String(g.targetAmount),
    currentAmount: String(g.currentAmount),
    createdAt: g.createdAt.toISOString(),
  }))
  return (
    <div>
      <PageHeader titleKey="goals_title" />
      <GoalView goals={serialized} />
    </div>
  )
}
