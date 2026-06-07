import { DashboardView } from '@/components/dashboard-view'
import { ensureProfile } from '@/app/actions/auth-helpers'
import { getDashboard } from '@/app/actions/data'

export default async function DashboardPage() {
  const profile = await ensureProfile()
  const data = await getDashboard()
  // serialize dates for client component
  const serialized = {
    ...data,
    recent: data.recent.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  }
  return <DashboardView data={serialized} displayName={profile.displayName} />
}
