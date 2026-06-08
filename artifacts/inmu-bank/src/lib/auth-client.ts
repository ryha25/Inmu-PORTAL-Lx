export const signIn = {
  username: async (params: { name: string; password: string }) => {
    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return { data: null, error: { message: (data as {error?: string}).error ?? 'Sign in failed' } }
      }
      return { data: {}, error: null }
    } catch {
      return { data: null, error: { message: 'Network error' } }
    }
  },
  email: async (params: { email: string; password: string }) => {
    return signIn.username({ name: params.email, password: params.password })
  },
}

export const signUp = {
  username: async (params: { name: string; password: string; passcode: string }) => {
    try {
      const res = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return { data: null, error: { message: (data as {error?: string}).error ?? 'Sign up failed' } }
      }
      return { data: {}, error: null }
    } catch {
      return { data: null, error: { message: 'Network error' } }
    }
  },
  email: async (params: { email: string; password: string; name: string }) => {
    return signUp.username({ name: params.name, password: params.password, passcode: '' })
  },
}

export async function signOut() {
  await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {})
}

export async function getSession(): Promise<{ user: { id: string; email: string; name: string } } | null> {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
