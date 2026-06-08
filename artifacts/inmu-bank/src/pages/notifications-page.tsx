import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { NotificationView } from '@/components/notification-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

type Notification = { id: number; type: string; title: string; message: string | null; isRead: boolean; createdAt: string }

export function NotificationsPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])

  const load = useCallback(() => {
    fetch('/api/notifications', { credentials: 'include' }).then(r => r.json()).then(setNotifications)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_notifications" />
      <NotificationView notifications={notifications} onRefresh={load} />
    </AppShell>
  )
}
