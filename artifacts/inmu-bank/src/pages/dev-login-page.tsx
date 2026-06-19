import { useEffect } from 'react'
import { useLocation } from 'wouter'

export function DevLoginPage() {
  const [, navigate] = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const to = params.get('to') || '/'
    fetch('/api/auth/sign-in', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@inmu.bank', password: 'securepass123' }),
    }).then(() => {
      navigate(to)
    })
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground text-sm">Logging in…</p>
    </div>
  )
}
