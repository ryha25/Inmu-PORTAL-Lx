'use server'

import { db } from '@/lib/db'
import {
  auditLog,
  goals,
  jars,
  notifications,
  points,
  profile,
  rewards,
  transactions,
  user,
} from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from './auth-helpers'

async function logAudit(
  adminId: string,
  action: string,
  targetUserId?: string,
  details?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    adminId,
    action,
    targetUserId,
    details: details || {},
  })
}

async function notify(
  userId: string,
  type: string,
  title: string,
  message: string,
) {
  await db.insert(notifications).values({ userId, type, title, message })
}

// ── User listing ──

export async function adminListUsers() {
  const adminId = await requireAdmin()
  await logAudit(adminId, 'adminListUsers')
  const rows = await db
    .select({
      userId: profile.userId,
      displayName: profile.displayName,
      email: user.email,
      role: profile.role,
      balance: profile.balance,
      savingsBalance: profile.savingsBalance,
      totalReceived: profile.totalReceived,
      totalSent: profile.totalSent,
      monthlyPoints: profile.monthlyPoints,
      xId: profile.xId,
      discordId: profile.discordId,
      discordUsername: profile.discordUsername,
      solWallet: profile.solWallet,
      participationCount: profile.participationCount,
      createdAt: profile.createdAt,
    })
    .from(profile)
    .leftJoin(user, eq(user.id, profile.userId))
  return rows
}

export async function adminSearchUsers(query: string) {
  const adminId = await requireAdmin()
  await logAudit(adminId, 'adminSearchUsers', undefined, { query })
  const rows = await db
    .select({
      userId: profile.userId,
      displayName: profile.displayName,
      email: user.email,
      role: profile.role,
      balance: profile.balance,
      participationCount: profile.participationCount,
    })
    .from(profile)
    .leftJoin(user, eq(user.id, profile.userId))
    .where(sql`LOWER(${profile.displayName}) LIKE ${'%' + query.toLowerCase() + '%'}`)
  return rows
}

export async function adminGetUserDetails(userId: string) {
  const adminId = await requireAdmin()
  await logAudit(adminId, 'adminGetUserDetails', userId)
  const [u] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)
  const [authUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  const txHistory = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(sql`${transactions.createdAt} DESC`)
  const savingsTx = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(sql`${transactions.createdAt} DESC`)
  const pointsHistory = await db
    .select()
    .from(points)
    .where(eq(points.userId, userId))
    .orderBy(sql`${points.createdAt} DESC`)
  return {
    profile: u,
    user: authUser,
    transactions: txHistory,
    savings: savingsTx,
    points: pointsHistory,
  }
}

// ── Balance / transactions ──

export async function adminChangeBalance(
  targetUserId: string,
  newBalance: number,
  reason: string,
) {
  const adminId = await requireAdmin()
  await db
    .update(profile)
    .set({ balance: String(newBalance), updatedAt: new Date() })
    .where(eq(profile.userId, targetUserId))
  await logAudit(adminId, 'adminChangeBalance', targetUserId, {
    newBalance,
    reason,
  })
  await notify(
    targetUserId,
    'deposit',
    '残高が更新されました',
    reason || `残高が ${newBalance} に設定されました`,
  )
  revalidatePath('/admin')
}

export async function adminAddInmu(
  targetUserId: string,
  amount: number,
  reason: string,
) {
  const adminId = await requireAdmin()
  await db
    .update(profile)
    .set({
      balance: sql`${profile.balance} + ${amount}`,
      totalReceived: sql`${profile.totalReceived} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, targetUserId))
  await db.insert(transactions).values({
    userId: targetUserId,
    type: 'deposit',
    amount: String(amount),
    counterparty: 'Admin',
    memo: reason,
  })
  await logAudit(adminId, 'adminAddInmu', targetUserId, { amount, reason })
  await notify(
    targetUserId,
    'deposit',
    'INMU が追加されました',
    `${amount} INMU 追加 (${reason})`,
  )
  revalidatePath('/admin')
}

export async function adminRemoveInmu(
  targetUserId: string,
  amount: number,
  reason: string,
) {
  const adminId = await requireAdmin()
  await db
    .update(profile)
    .set({
      balance: sql`GREATEST(${profile.balance} - ${amount}, 0)`,
      totalSent: sql`${profile.totalSent} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, targetUserId))
  await db.insert(transactions).values({
    userId: targetUserId,
    type: 'withdraw',
    amount: String(amount),
    counterparty: 'Admin',
    memo: reason,
  })
  await logAudit(adminId, 'adminRemoveInmu', targetUserId, { amount, reason })
  await notify(
    targetUserId,
    'withdraw',
    'INMU が処分されました',
    `${amount} INMU 処分 (${reason})`,
  )
  revalidatePath('/admin')
}

export async function adminRegisterTx(input: {
  targetUserId: string
  type: string
  amount: number
  counterparty?: string
  memo?: string
}) {
  const adminId = await requireAdmin()
  const { targetUserId, type, amount, counterparty, memo } = input
  await db.insert(transactions).values({
    userId: targetUserId,
    type,
    amount: String(amount),
    counterparty,
    memo,
  })
  const outgoing = type === 'withdraw' || type === 'send'
  await db
    .update(profile)
    .set({
      balance: outgoing
        ? sql`GREATEST(${profile.balance} - ${amount}, 0)`
        : sql`${profile.balance} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, targetUserId))
  await logAudit(adminId, 'adminRegisterTx', targetUserId, { type, amount, memo })
  await notify(
    targetUserId,
    outgoing ? 'withdraw' : 'deposit',
    outgoing ? '出金が登録されました' : '入金が登録されました',
    `${amount} INMU`,
  )
  revalidatePath('/admin')
}

export async function adminDistributeReward(input: {
  targetUserId: string
  type: string
  amount: number
  memo?: string
}) {
  const adminId = await requireAdmin()
  const { targetUserId, type, amount, memo } = input
  await db.insert(rewards).values({
    userId: targetUserId,
    type,
    amount: String(amount),
    memo,
  })
  await db.insert(transactions).values({
    userId: targetUserId,
    type: 'reward',
    amount: String(amount),
    category: type,
    memo,
  })
  await db
    .update(profile)
    .set({
      balance: sql`${profile.balance} + ${amount}`,
      participationCount: sql`${profile.participationCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, targetUserId))
  await logAudit(adminId, 'adminDistributeReward', targetUserId, { type, amount })
  await notify(targetUserId, 'reward', '報酬が配布されました', `${amount} INMU (${type})`)
  revalidatePath('/admin')
}

export async function adminDistributeAirdrop(input: {
  targetUserIds: string[]
  amount: number
  memo?: string
}) {
  const adminId = await requireAdmin()
  const { targetUserIds, amount, memo } = input
  for (const targetUserId of targetUserIds) {
    await db.insert(transactions).values({
      userId: targetUserId,
      type: 'airdrop',
      amount: String(amount),
      memo,
    })
    await db
      .update(profile)
      .set({
        balance: sql`${profile.balance} + ${amount}`,
        participationCount: sql`${profile.participationCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(profile.userId, targetUserId))
    await notify(
      targetUserId,
      'airdrop',
      'エアドロップを受け取りました',
      `${amount} INMU`,
    )
  }
  await logAudit(adminId, 'adminDistributeAirdrop', undefined, {
    count: targetUserIds.length,
    amount,
  })
  revalidatePath('/admin')
}

export async function adminAdjustPoints(
  targetUserId: string,
  amount: number,
  reason: string,
) {
  const adminId = await requireAdmin()
  await db.insert(points).values({
    userId: targetUserId,
    amount: String(amount),
    type: 'admin',
    month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    source: reason,
  })
  await db
    .update(profile)
    .set({
      monthlyPoints: sql`${profile.monthlyPoints} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(profile.userId, targetUserId))
  await logAudit(adminId, 'adminAdjustPoints', targetUserId, { amount, reason })
  await notify(
    targetUserId,
    'points',
    'ポイントが調整されました',
    `${amount > 0 ? '+' : ''}${amount} ポイント (${reason})`,
  )
  revalidatePath('/admin')
}

export async function adminSetRole(targetUserId: string, role: 'user' | 'admin') {
  const adminId = await requireAdmin()
  await db
    .update(profile)
    .set({ role, updatedAt: new Date() })
    .where(eq(profile.userId, targetUserId))
  await logAudit(adminId, 'adminSetRole', targetUserId, { role })
  revalidatePath('/admin')
}

// ── Audit log ──

export async function adminGetAuditLog() {
  const adminId = await requireAdmin()
  await logAudit(adminId, 'adminGetAuditLog')
  return db
    .select()
    .from(auditLog)
    .orderBy(sql`${auditLog.createdAt} DESC`)
    .limit(500)
}

// ── Reset functions ──

export async function adminResetUserBalance(targetUserId: string) {
  const adminId = await requireAdmin()
  await db
    .update(profile)
    .set({ balance: '0', updatedAt: new Date() })
    .where(eq(profile.userId, targetUserId))
  await logAudit(adminId, 'adminResetUserBalance', targetUserId)
  revalidatePath('/admin')
}

export async function adminResetUserHistory(targetUserId: string) {
  const adminId = await requireAdmin()
  await db.delete(transactions).where(eq(transactions.userId, targetUserId))
  await db.delete(rewards).where(eq(rewards.userId, targetUserId))
  await logAudit(adminId, 'adminResetUserHistory', targetUserId)
  revalidatePath('/admin')
}

export async function adminResetUser(targetUserId: string) {
  const adminId = await requireAdmin()
  await db.delete(transactions).where(eq(transactions.userId, targetUserId))
  await db.delete(rewards).where(eq(rewards.userId, targetUserId))
  await db.delete(jars).where(eq(jars.userId, targetUserId))
  await db.delete(goals).where(eq(goals.userId, targetUserId))
  await db.delete(notifications).where(eq(notifications.userId, targetUserId))
  await db.delete(points).where(eq(points.userId, targetUserId))
  await db
    .update(profile)
    .set({ balance: '0', savingsBalance: '0', totalReceived: '0', totalSent: '0', monthlyPoints: '0', participationCount: 0, updatedAt: new Date() })
    .where(eq(profile.userId, targetUserId))
  await logAudit(adminId, 'adminResetUser', targetUserId)
  revalidatePath('/admin')
}

export async function adminResetAll() {
  const adminId = await requireAdmin()
  await db.delete(transactions)
  await db.delete(rewards)
  await db.delete(jars)
  await db.delete(goals)
  await db.delete(notifications)
  await db.delete(points)
  await db.delete(loginStreaks)
  await db.delete(auditLog)
  await db.update(profile).set({ balance: '0', savingsBalance: '0', totalReceived: '0', totalSent: '0', monthlyPoints: '0', participationCount: 0 })
  await logAudit(adminId, 'adminResetAll')
  revalidatePath('/admin')
}

// ── CSV backup ──

export async function adminBackupCsv(): Promise<string> {
  const adminId = await requireAdmin()
  await logAudit(adminId, 'adminBackupCsv')
  const users = await db
    .select({
      userId: profile.userId,
      displayName: profile.displayName,
      email: user.email,
      role: profile.role,
      balance: profile.balance,
      savingsBalance: profile.savingsBalance,
      xId: profile.xId,
      discordId: profile.discordId,
      discordUsername: profile.discordUsername,
      solWallet: profile.solWallet,
      participationCount: profile.participationCount,
    })
    .from(profile)
    .leftJoin(user, eq(user.id, profile.userId))

  const header = [
    'userId',
    'displayName',
    'email',
    'role',
    'balance',
    'savingsBalance',
    'xId',
    'discordId',
    'discordUsername',
    'solWallet',
    'participationCount',
  ]
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [header.join(',')]
  for (const u of users) {
    lines.push(
      [
        u.userId,
        u.displayName,
        u.email,
        u.role,
        u.balance,
        u.savingsBalance,
        u.xId,
        u.discordId,
        u.discordUsername,
        u.solWallet,
        u.participationCount,
      ]
        .map(escape)
        .join(','),
    )
  }
  return lines.join('\n')
}
