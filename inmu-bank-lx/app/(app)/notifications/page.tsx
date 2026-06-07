import { PageHeader } from '@/components/page-header'
import { getNotifications, markAllRead } from '@/app/actions/data'
import { NotificationView } from '@/components/notification-view'

export default async function NotificationsPage() {
  const rows = await getNotifications()
  const serialized = rows.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }))
  return (
    <div>
      <PageHeader titleKey="notifications_title" />
      <NotificationView notifications={serialized} />
    </div>
  )
}
