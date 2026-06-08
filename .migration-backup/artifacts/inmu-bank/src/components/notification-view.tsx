import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/context'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

type Notification = { id: number; type: string; title: string; message: string | null; isRead: boolean; createdAt: string }

export function NotificationView({ notifications, onRefresh }: { notifications: Notification[]; onRefresh: () => void }) {
  const { t, locale } = useI18n()

  async function handleMarkAllRead() {
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST', credentials: 'include' })
      toast.success(t('success'))
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleMarkAllRead} className="min-h-9">{t('mark_all_read')}</Button>
      </div>
      {notifications.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('no_notifications')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => (
            <Card key={n.id} className={cn('border-border bg-card p-3', !n.isRead && 'border-primary/30 bg-primary/5')}>
              <div className="flex items-start gap-3">
                <Bell className={cn('size-4 shrink-0 mt-0.5', !n.isRead ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.message && <p className="mt-1 text-xs text-muted-foreground">{n.message}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{formatDate(n.createdAt, locale)}</p>
                </div>
                {!n.isRead && <span className="flex size-2 shrink-0 rounded-full bg-primary" />}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
