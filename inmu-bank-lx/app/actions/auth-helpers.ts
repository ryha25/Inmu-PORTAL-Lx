'use server'

import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { profile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type SessionUser = {
  id: string
  email: string
  name: string
}

export async function getUserId(): Promise<string> {
  const session = await getSession()
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession()
  if (!session?.user) return null
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  }
}

export async function ensureProfile() {
  const session = await getSession()
  if (!session?.user) throw new Error('Unauthorized')
  const u = session.user

  const existing = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, u.id))
    .limit(1)

  if (existing.length > 0) return existing[0]

  const [created] = await db
    .insert(profile)
    .values({
      userId: u.id,
      displayName: u.name || u.email.split('@')[0],
      role: 'admin',
      balance: '0',
      savingsBalance: '0',
      totalReceived: '0',
      totalSent: '0',
      monthlyPoints: '0',
      participationCount: 0,
    })
    .returning()

  return created
}

export async function isAdmin(): Promise<boolean> {
  const userId = await getUserId()
  const [p] = await db
    .select({ role: profile.role })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)
  return p?.role === 'admin'
}

export async function requireAdmin(): Promise<string> {
  const userId = await getUserId()
  const [p] = await db
    .select({ role: profile.role })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)
  if (p?.role !== 'admin') throw new Error('Forbidden: admin only')
  return userId
}
