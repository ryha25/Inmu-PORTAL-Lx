import { PageHeader } from '@/components/page-header'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/app/actions/auth-helpers'
import { adminListUsers } from '@/app/actions/admin'
import { AdminPanel } from '@/components/admin-panel'

export default async function AdminPage() {
  const admin = await isAdmin()
  if (!admin) redirect('/')

  const users = await adminListUsers()
  const serialized = users.map((u) => ({
    ...u,
    balance: String(u.balance),
    savingsBalance: String(u.savingsBalance ?? 0),
    totalReceived: String(u.totalReceived ?? 0),
    totalSent: String(u.totalSent ?? 0),
    monthlyPoints: String(u.monthlyPoints ?? 0),
    createdAt: u.createdAt?.toISOString() ?? '',
  }))

  return (
    <div>
      <PageHeader titleKey="admin_title" />
      <AdminPanel users={serialized} />
    </div>
  )
}
