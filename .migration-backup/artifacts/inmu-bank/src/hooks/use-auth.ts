import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'

type Profile = { role: string; displayName: string; solWallet: string | null }

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [, navigate] = useLocation()

  useEffect(() => {
    fetch('/api/profile', { credentials: 'include' })
      .then(r => {
        if (r.status === 401) { navigate('/sign-in'); return null }
        return r.ok ? r.json() : null
      })
      .then(d => {
        if (d) setProfile({ role: d.role, displayName: d.displayName, solWallet: d.solWallet ?? null })
        setLoading(false)
      })
      .catch(() => setLoading(false))

    fetch('/api/notifications', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((d: { isRead: boolean }[]) => setUnread(Array.isArray(d) ? d.filter(n => !n.isRead).length : 0))
      .catch(() => {})
  }, [navigate])

  return { profile, unread, loading }
}
