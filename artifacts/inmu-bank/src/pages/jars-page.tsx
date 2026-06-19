import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { JarView } from '@/components/jar-view'
import { PageHeader } from '@/components/page-header'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'

type Jar = { id: number; name: string; balance: string; isLocked: boolean; lockDays?: number | null; unlockDate?: string | null }

export function JarsPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [jars, setJars] = useState<Jar[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch('/api/jars', { credentials: 'include' }).then(r => r.json()).then(d => { setJars(d); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_jars" />
      {loading ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div> : <JarView jars={jars} onRefresh={load} />}
    </AppShell>
  )
}
