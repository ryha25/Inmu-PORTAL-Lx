'use server'

import { db } from '@/lib/db'
import {
  goals,
  jars,
  notifications,
  points,
  profile,
  rewards,
  transactions,
  loginStreaks,
  activityFeed,
} from '@/lib/db/schema'
import { TX_INCOME_TYPES, TX_OUTGOING_TYPES } from '@/lib/format'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { ensureProfile, getUserId } from './auth-helpers'

// ── Dashboard ──

export async function getDashboard() {
  const userId = await getUserId()
  const p = await ensureProfile()

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const allTx = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))

  let monthlyChange = 0
  for (const t of allTx) {
    const amt = Number(t.amount)
    const outgoing = TX_OUTGOING_TYPES.includes(t.type)
    if (new Date(t.createdAt) >= startOfMonth) {
      monthlyChange += outgoing ? -amt : amt
    }
  }

  const jarRows = await db.select().from(jars).where(eq(jars.userId, userId))
  const jarTotal = jarRows.reduce((s, j) => s + Number(j.balance), 0)

  const goalRows = await db.select().from(goals).where(eq(goals.userId, userId))
  const goalTotalTarget = goalRows.reduce((s, g) => s + Number(g.targetAmount), 0)
  const goalTotalCurrent = goalRows.reduce((s, g) => s + Number(g.currentAmount), 0)
  const goalRate =
    goalTotalTarget > 0
      ? Math.min(100, (goalTotalCurrent / goalTotalTarget) * 100)
      : 0

  const recent = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(6)

  // Current month's points
  const currentMonth = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}`
  const monthlyPoints = await db
    .select({ total: sql<number>`COALESCE(SUM(${points.amount}),0)::float` })
    .from(points)
    .where(and(eq(points.userId, userId), eq(points.month, currentMonth)))

  return {
    balance: Number(p.balance),
    savingsBalance: Number(p.savingsBalance),
    totalReceived: Number(p.totalReceived),
    totalSent: Number(p.totalSent),
    monthlyPoints: monthlyPoints[0]?.total ?? 0,
    monthlyChange,
    jarTotal,
    goalRate,
    recent,
  }
}

// ── Transactions ──

export async function getTransactions(filters?: {
  type?: string
  search?: string
}) {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))

  let result = rows
  if (filters?.type && filters.type !== 'all') {
    result = result.filter((r) => r.type === filters.type)
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(
      (r) =>
        r.memo?.toLowerCase().includes(q) ||
        r.counterparty?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q),
    )
  }
  return result
}

export async function getTransfers() {
  const userId = await getUserId()
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.type} IN ('send','receive')`,
      ),
    )
    .orderBy(desc(transactions.createdAt))
}

// ── User Transfer (P2P) ──

export async function sendInmu(targetUserId: string, amount: number, memo?: string) {
  const userId = await getUserId()
  if (amount <= 0) throw new Error('Amount must be positive')
  if (userId === targetUserId) throw new Error('Cannot send to yourself')

  const [sender] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)
  if (!sender || Number(sender.balance) < amount) {
    throw new Error('Insufficient balance')
  }

  const [target] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, targetUserId))
    .limit(1)
  if (!target) throw new Error('Recipient not found')

  // Atomic: deduct sender, add receiver, record both transactions
  await db
    .update(profile)
    .set({
      balance: sql`${profile.balance} - ${amount}`,
      totalSent: sql`${profile.totalSent} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, userId))

  await db
    .update(profile)
    .set({
      balance: sql`${profile.balance} + ${amount}`,
      totalReceived: sql`${profile.totalReceived} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, targetUserId))

  await db.insert(transactions).values({
    userId,
    type: 'send',
    amount: String(amount),
    counterparty: target.displayName || 'Unknown',
    counterpartyId: targetUserId,
    memo: memo || 'P2P Transfer',
  })

  await db.insert(transactions).values({
    userId: targetUserId,
    type: 'receive',
    amount: String(amount),
    counterparty: sender.displayName || 'Unknown',
    counterpartyId: userId,
    memo: memo || 'P2P Transfer',
  })

  await db.insert(notifications).values({
    userId: targetUserId,
    type: 'transfer',
    title: 'INMU受取',
    message: `${sender.displayName || 'Unknown'} から ${amount} INMU 受取`,
  })

  await db.insert(activityFeed).values({
    type: 'transfer',
    userId,
    targetUserId,
    amount: String(amount),
    message: `${sender.displayName} → ${target.displayName}`,
  })

  revalidatePath('/transfers')
  revalidatePath('/balance')
  revalidatePath('/')
  return { success: true }
}

// ── Jars ──

export async function getJars() {
  const userId = await getUserId()
  return db
    .select()
    .from(jars)
    .where(eq(jars.userId, userId))
    .orderBy(desc(jars.createdAt))
}

export async function createJar(name: string) {
  const userId = await getUserId()
  await db.insert(jars).values({ userId, name })
  revalidatePath('/jars')
}

export async function depositToJar(jarId: number, amount: number) {
  const userId = await getUserId()
  const [jar] = await db
    .select()
    .from(jars)
    .where(and(eq(jars.id, jarId), eq(jars.userId, userId)))
  if (!jar) throw new Error('Jar not found')

  const [p] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)
  if (!p || Number(p.balance) < amount) throw new Error('Insufficient balance')

  await db
    .update(profile)
    .set({ balance: sql`${profile.balance} - ${amount}`, updatedAt: new Date() })
    .where(eq(profile.userId, userId))

  await db
    .update(jars)
    .set({ balance: sql`${jars.balance} + ${amount}` })
    .where(and(eq(jars.id, jarId), eq(jars.userId, userId)))

  revalidatePath('/jars')
  revalidatePath('/')
}

export async function withdrawFromJar(jarId: number, amount: number) {
  const userId = await getUserId()
  const [jar] = await db
    .select()
    .from(jars)
    .where(and(eq(jars.id, jarId), eq(jars.userId, userId)))
  if (!jar) throw new Error('Jar not found')
  if (jar.isLocked && jar.unlockDate && new Date(jar.unlockDate) > new Date()) {
    throw new Error('LOCKED')
  }
  await db
    .update(jars)
    .set({ balance: sql`GREATEST(${jars.balance} - ${amount}, 0)` })
    .where(and(eq(jars.id, jarId), eq(jars.userId, userId)))

  await db
    .update(profile)
    .set({ balance: sql`${profile.balance} + ${amount}`, updatedAt: new Date() })
    .where(eq(profile.userId, userId))

  revalidatePath('/jars')
  revalidatePath('/')
}

export async function lockJar(jarId: number, days: number) {
  const userId = await getUserId()
  const start = new Date()
  const unlock = new Date()
  unlock.setDate(unlock.getDate() + days)
  await db
    .update(jars)
    .set({ isLocked: true, lockDays: days, lockStart: start, unlockDate: unlock })
    .where(and(eq(jars.id, jarId), eq(jars.userId, userId)))
  revalidatePath('/jars')
}

export async function deleteJar(jarId: number) {
  const userId = await getUserId()
  await db.delete(jars).where(and(eq(jars.id, jarId), eq(jars.userId, userId)))
  revalidatePath('/jars')
}

// ── Savings (move to/from savings wallet) ──

export async function moveToSavings(amount: number) {
  const userId = await getUserId()
  const [p] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)
  if (!p || Number(p.balance) < amount) throw new Error('Insufficient balance')

  await db
    .update(profile)
    .set({
      balance: sql`${profile.balance} - ${amount}`,
      savingsBalance: sql`${profile.savingsBalance} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, userId))

  await db.insert(transactions).values({
    userId,
    type: 'deposit',
    amount: String(amount),
    category: 'savings',
    memo: 'Moved to savings',
  })

  revalidatePath('/')
  revalidatePath('/balance')
}

export async function moveFromSavings(amount: number) {
  const userId = await getUserId()
  const [p] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)
  if (!p || Number(p.savingsBalance) < amount) throw new Error('Insufficient savings')

  await db
    .update(profile)
    .set({
      balance: sql`${profile.balance} + ${amount}`,
      savingsBalance: sql`${profile.savingsBalance} - ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, userId))

  await db.insert(transactions).values({
    userId,
    type: 'withdraw',
    amount: String(amount),
    category: 'savings',
    memo: 'Moved from savings',
  })

  revalidatePath('/')
  revalidatePath('/balance')
}

export async function getSavingsHistory() {
  const userId = await getUserId()
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.category, 'savings')))
    .orderBy(desc(transactions.createdAt))
}

// ── Goals ──

export async function getGoals() {
  const userId = await getUserId()
  return db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .orderBy(desc(goals.createdAt))
}

export async function createGoal(name: string, targetAmount: number) {
  const userId = await getUserId()
  await db.insert(goals).values({ userId, name, targetAmount: String(targetAmount) })
  revalidatePath('/goals')
}

export async function addGoalProgress(goalId: number, amount: number) {
  const userId = await getUserId()
  await db
    .update(goals)
    .set({ currentAmount: sql`${goals.currentAmount} + ${amount}` })
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
  revalidatePath('/goals')
}

export async function deleteGoal(goalId: number) {
  const userId = await getUserId()
  await db.delete(goals).where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
  revalidatePath('/goals')
}

// ── Rewards ──

export async function getRewards() {
  const userId = await getUserId()
  return db
    .select()
    .from(rewards)
    .where(eq(rewards.userId, userId))
    .orderBy(desc(rewards.createdAt))
}

// ── Airdrops ──

export async function getAirdrops() {
  const userId = await getUserId()
  const received = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.type, 'airdrop')))
    .orderBy(desc(transactions.createdAt))
  return { received }
}

// ── Notifications ──

export async function getNotifications() {
  const userId = await getUserId()
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50)
}

export async function getUnreadCount() {
  const userId = await getUserId()
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
  return row?.count ?? 0
}

export async function markAllRead() {
  const userId = await getUserId()
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId))
  revalidatePath('/notifications')
}

// ── Community / Ranking ──

export async function getCommunityStats() {
  const userId = await getUserId()
  const p = await ensureProfile()

  const received = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))

  const receiveCount = received.filter(
    (t) => !TX_OUTGOING_TYPES.includes(t.type),
  ).length
  const totalReceivedInmu = received
    .filter((t) => !TX_OUTGOING_TYPES.includes(t.type))
    .reduce((s, t) => s + Number(t.amount), 0)

  const allProfiles = await db
    .select({ userId: profile.userId, balance: profile.balance })
    .from(profile)
    .orderBy(desc(profile.balance))
  const rank = allProfiles.findIndex((x) => x.userId === userId) + 1

  return {
    participations: p.participationCount,
    receiveCount,
    totalReceivedInmu,
    rank: rank || allProfiles.length,
    totalUsers: allProfiles.length,
  }
}

export async function getRanking() {
  await getUserId()
  const rows = await db
    .select({
      userId: profile.userId,
      displayName: profile.displayName,
      balance: profile.balance,
      participationCount: profile.participationCount,
    })
    .from(profile)
    .orderBy(desc(profile.balance))
    .limit(50)

  const totals = await db
    .select({
      userId: transactions.userId,
      total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} NOT IN ('withdraw','send') THEN ${transactions.amount} ELSE 0 END),0)::float`,
    })
    .from(transactions)
    .groupBy(transactions.userId)

  const totalMap = new Map(totals.map((t) => [t.userId, Number(t.total)]))

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    displayName: r.displayName || 'INMU User',
    balance: Number(r.balance),
    totalReceived: totalMap.get(r.userId) ?? 0,
    participations: r.participationCount,
  }))
}

// ── Points System ──

function getCurrentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function getPoints() {
  const userId = await getUserId()
  const currentMonth = getCurrentMonth()

  const monthTotal = await db
    .select({ total: sql<number>`COALESCE(SUM(${points.amount}),0)::float` })
    .from(points)
    .where(and(eq(points.userId, userId), eq(points.month, currentMonth)))

  const allPoints = await db
    .select()
    .from(points)
    .where(eq(points.userId, userId))
    .orderBy(desc(points.createdAt))

  return {
    monthlyTotal: monthTotal[0]?.total ?? 0,
    allPoints,
  }
}

export async function claimDailyLogin() {
  const userId = await getUserId()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [streak] = await db
    .select()
    .from(loginStreaks)
    .where(eq(loginStreaks.userId, userId))
    .limit(1)

  let bonus = 10
  let newStreak = 1

  if (streak) {
    const lastLogin = new Date(streak.lastLogin)
    lastLogin.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((today.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      newStreak = streak.streak + 1
      bonus = Math.min(10 + newStreak * 2, 50)
    } else if (diffDays === 0) {
      return { alreadyClaimed: true, bonus: 0, streak: streak.streak }
    }
  }

  await db
    .insert(loginStreaks)
    .values({ userId, lastLogin: today, streak: newStreak })
    .onConflictDoUpdate({
      target: loginStreaks.userId,
      set: { lastLogin: today, streak: newStreak },
    })

  await db.insert(points).values({
    userId,
    amount: String(bonus),
    type: 'daily_login',
    month: getCurrentMonth(),
    source: `Day ${newStreak} streak`,
  })

  await db
    .update(profile)
    .set({
      monthlyPoints: sql`${profile.monthlyPoints} + ${bonus}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, userId))

  return { alreadyClaimed: false, bonus, streak: newStreak }
}

export async function getPointsLeaderboard() {
  const currentMonth = getCurrentMonth()
  const rows = await db
    .select({
      userId: points.userId,
      total: sql<number>`SUM(${points.amount})`,
    })
    .from(points)
    .where(eq(points.month, currentMonth))
    .groupBy(points.userId)
    .orderBy(sql`SUM(${points.amount}) DESC`)
    .limit(50)

  const profileRows = await db
    .select({
      userId: profile.userId,
      displayName: profile.displayName,
    })
    .from(profile)
    .where(sql`${profile.userId} IN (${rows.map((r) => `'${r.userId}'`).join(',')})`)

  const nameMap = new Map(profileRows.map((p) => [p.userId, p.displayName]))

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    displayName: nameMap.get(r.userId) || 'INMU User',
    points: Number(r.total),
  }))
}

// ── Activity Feed ──

export async function getActivityFeed() {
  await getUserId()
  return db
    .select()
    .from(activityFeed)
    .orderBy(desc(activityFeed.createdAt))
    .limit(50)
}

// ── Profile ──

export async function getMyProfile() {
  await getUserId()
  return ensureProfile()
}

export async function updateMyProfile(input: {
  displayName?: string
  xId?: string
  discordId?: string
  discordUsername?: string
  solWallet?: string
  avatar?: string
}) {
  const userId = await getUserId()
  await ensureProfile()
  await db
    .update(profile)
    .set({
      displayName: input.displayName,
      xId: input.xId,
      discordId: input.discordId,
      discordUsername: input.discordUsername,
      solWallet: input.solWallet,
      avatar: input.avatar,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, userId))
  revalidatePath('/profile')
}

export async function getUserProfile(userId: string) {
  const [p] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)
  return p ?? null
}
