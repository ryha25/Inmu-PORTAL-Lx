'use client'

export const signIn = {
  email: async (params: { email: string; password: string }) => {
    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return { data: null, error: { message: data.error ?? 'Sign in failed' } }
      }
      return { data: {}, error: null }
    } catch {
      return { data: null, error: { message: 'Network error' } }
    }
  },
}

export const signUp = {
  email: async (params: { email: string; password: string; name: string }) => {
    try {
      const res = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return { data: null, error: { message: data.error ?? 'Sign up failed' } }
      }
      return { data: {}, error: null }
    } catch {
      return { data: null, error: { message: 'Network error' } }
    }
  },
}

export async function signOut() {
  await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => {})
}
