import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import {
  DEMO_SESSION_COOKIE,
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
  DEMO_USER_NAME,
} from '@/lib/auth'

async function ensureDemoUser() {
  try {
    await db
      .insert(user)
      .values({
        id: DEMO_USER_ID,
        name: DEMO_USER_NAME,
        email: DEMO_USER_EMAIL,
        emailVerified: true,
      })
      .onConflictDoNothing()
  } catch {
    // user already exists — fine
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ all: string[] }> },
) {
  const { all } = await context.params
  const path = all.join('/')

  if (path === 'sign-in' || path === 'sign-up') {
    await ensureDemoUser()
    const res = NextResponse.json({ success: true })
    res.cookies.set(DEMO_SESSION_COOKIE, DEMO_USER_ID, COOKIE_OPTS)
    return res
  }

  if (path === 'sign-out') {
    const res = NextResponse.json({ success: true })
    res.cookies.delete(DEMO_SESSION_COOKIE)
    return res
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
