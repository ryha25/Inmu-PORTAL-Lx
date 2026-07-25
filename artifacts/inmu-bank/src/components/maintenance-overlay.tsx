import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'

type MaintenanceStatus = {
  maintenance: boolean
  message: string
}

export function MaintenanceOverlay() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Check maintenance status
    async function checkMaintenance() {
      try {
        const r = await fetch('/api/maintenance')
        if (!r.ok) return
        const data = await r.json() as MaintenanceStatus
        if (!cancelled) setStatus(data)
      } catch {
        // ignore network errors — don't block users on fetch failures
      }
    }

    // Check if current user is admin (simple fetch, no redirect side effects)
    async function checkAdmin() {
      try {
        const r = await fetch('/api/profile', { credentials: 'include' })
        if (!r.ok) return
        const data = await r.json() as { role?: string }
        if (!cancelled && (data.role === 'admin' || data.role === 'operator')) {
          setIsAdmin(true)
        }
      } catch {
        // ignore
      }
    }

    checkMaintenance()
    checkAdmin()
    const id = setInterval(checkMaintenance, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!status?.maintenance) return null
  if (isAdmin) return null

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 px-8 text-center max-w-sm">
        <div className="flex size-20 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30">
          <Wrench className="size-10 text-amber-400" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold tracking-tight">メンテナンス中</h1>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {status.message}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          INMU PORTAL
        </p>
      </div>
    </div>
  )
}
