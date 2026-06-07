import { cookies } from 'next/headers'

export const DEMO_SESSION_COOKIE = 'demo-session'
export const DEMO_USER_ID = 'demo-user-1'
export const DEMO_USER_EMAIL = 'demo@inmu.bank'
export const DEMO_USER_NAME = 'Demo User'

export type DemoSession = {
  user: {
    id: string
    email: string
    name: string
  }
} | null

export async function getSession(): Promise<DemoSession> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(DEMO_SESSION_COOKIE)?.value
  if (!sessionId) return null
  return {
    user: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      name: DEMO_USER_NAME,
    },
  }
}
