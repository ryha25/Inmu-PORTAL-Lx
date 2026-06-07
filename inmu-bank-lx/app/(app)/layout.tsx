import { AppShell } from '@/components/app-shell'
import { getSession } from '@/lib/auth'
import { ensureProfile } from '@/app/actions/auth-helpers'
import { getUnreadCount } from '@/app/actions/data'
import { redirect } from 'next/navigation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session?.user) redirect('/sign-in')

  const profile = await ensureProfile()
  const unread = await getUnreadCount()

  return (
    <AppShell
      isAdmin={profile.role === 'admin'}
      displayName={profile.displayName}
      unread={unread}
    >
      {children}
    </AppShell>
  )
}
