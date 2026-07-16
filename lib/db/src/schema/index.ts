import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ── Auth tables ──
export const userTable = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("passwordHash"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// ── INMU Bank: profile ──
export const profileTable = pgTable("profile", {
  userId: text("userId").primaryKey(),
  displayName: text("displayName").notNull().default(""),
  xId: text("xId"),
  discordId: text("discordId"),
  discordUsername: text("discordUsername"),
  solWallet: text("solWallet"),
  avatar: text("avatar"),
  role: text("role").notNull().default("user"),
  balance: numeric("balance").notNull().default("0"),
  savingsBalance: numeric("savingsBalance").notNull().default("0"),
  totalReceived: numeric("totalReceived").notNull().default("0"),
  totalSent: numeric("totalSent").notNull().default("0"),
  monthlyPoints: numeric("monthlyPoints").notNull().default("0"),
  participationCount: integer("participationCount").notNull().default(0),
  passcodeHash: text("passcodeHash"),
  showBalance: boolean("showBalance").notNull().default(false),
  totalBought: numeric("totalBought").notNull().default("0"),
  totalSold: numeric("totalSold").notNull().default("0"),
  lastBuyAt: timestamp("lastBuyAt"),
  lastSellAt: timestamp("lastSellAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type Profile = typeof profileTable.$inferSelect;

// ── INMU Bank: transactions ──
export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount").notNull(),
  category: text("category"),
  counterparty: text("counterparty"),
  counterpartyId: text("counterpartyId"),
  memo: text("memo"),
  txHash: text("txHash"),
  jarId: integer("jarId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;

// ── INMU Bank: trade history (DEX buy/sell) ──
export const tradeHistoryTable = pgTable("tradeHistory", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  walletAddress: text("walletAddress").notNull(),
  type: text("type").notNull(), // "buy" | "sell"
  tokenAmount: numeric("tokenAmount").notNull(),
  usdPrice: numeric("usdPrice"),
  usdValue: numeric("usdValue"),
  txSignature: text("txSignature").notNull().unique(),
  dex: text("dex"),
  tradedAt: timestamp("tradedAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type TradeHistory = typeof tradeHistoryTable.$inferSelect;

// ── INMU Bank: jars ──
export const jarsTable = pgTable("jars", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").notNull(),
  balance: numeric("balance").notNull().default("0"),
  isLocked: boolean("isLocked").notNull().default(false),
  lockDays: integer("lockDays"),
  lockStart: timestamp("lockStart"),
  unlockDate: timestamp("unlockDate"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Jar = typeof jarsTable.$inferSelect;

// ── INMU Bank: goals ──
export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").notNull(),
  targetAmount: numeric("targetAmount").notNull(),
  currentAmount: numeric("currentAmount").notNull().default("0"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Goal = typeof goalsTable.$inferSelect;

// ── INMU Bank: rewards ──
export const rewardsTable = pgTable("rewards", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount").notNull(),
  memo: text("memo"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Reward = typeof rewardsTable.$inferSelect;

// ── INMU Bank: notifications ──
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message"),
  isRead: boolean("isRead").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;

// ── INMU Bank: points ──
export const pointsTable = pgTable("points", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  amount: numeric("amount").notNull().default("0"),
  type: text("type").notNull(),
  source: text("source"),
  month: text("month").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ── INMU Bank: login streaks ──
export const loginStreaksTable = pgTable("loginStreaks", {
  userId: text("userId").primaryKey(),
  lastLogin: timestamp("lastLogin").notNull().defaultNow(),
  streak: integer("streak").notNull().default(0),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// ── INMU Bank: audit log ──
export const auditLogTable = pgTable("auditLog", {
  id: serial("id").primaryKey(),
  adminId: text("adminId").notNull(),
  action: text("action").notNull(),
  targetUserId: text("targetUserId"),
  details: jsonb("details"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ── INMU Bank: security log (rate limit / lock events) ──
export const securityLogTable = pgTable("securityLog", {
  id: serial("id").primaryKey(),
  userId: text("userId"),
  event: text("event").notNull(),
  loginFailCount: integer("loginFailCount").notNull().default(0),
  passcodeFailCount: integer("passcodeFailCount").notNull().default(0),
  adminCodeFailCount: integer("adminCodeFailCount").notNull().default(0),
  lockStart: timestamp("lockStart"),
  lockUntil: timestamp("lockUntil"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ── INMU Bank: activity feed ──
export const activityFeedTable = pgTable("activityFeed", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  userId: text("userId"),
  targetUserId: text("targetUserId"),
  amount: numeric("amount"),
  message: text("message"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ── INMU Bank: missions ──
export const missionsTable = pgTable("missions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("daily"),
  points: integer("points").notNull().default(0),
  startAt: timestamp("startAt"),
  endAt: timestamp("endAt"),
  linkUrl: text("linkUrl"),
  isActive: boolean("isActive").notNull().default(true),
  status: text("status").notNull().default("active"),
  conditionType: text("conditionType"),
  conditionValue: numeric("conditionValue"),
  prerequisiteMissionId: integer("prerequisiteMissionId"),
  prerequisiteConditionType: text("prerequisiteConditionType"),
  prerequisiteConditionValue: numeric("prerequisiteConditionValue"),
  displayOrder: integer("displayOrder").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Mission = typeof missionsTable.$inferSelect;

// ── INMU Bank: mission completions ──
export const missionCompletionsTable = pgTable("missionCompletions", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  missionId: integer("missionId").notNull(),
  period: text("period").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ── INMU Bank: mission participations (join → achieve → rewarded) ──
export const missionParticipationsTable = pgTable("missionParticipations", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  missionId: integer("missionId").notNull(),
  period: text("period").notNull(),
  status: text("status").notNull().default("joined"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  achievedAt: timestamp("achievedAt"),
  rewardedAt: timestamp("rewardedAt"),
});

// ── INMU Bank: emergency auth (per-user emergency credentials) ──
export const emergencyAuthTable = pgTable("emergencyAuth", {
  userId: text("userId").primaryKey(),
  emergencyPasswordHash: text("emergencyPasswordHash"),
  emergencyPasscodeHash: text("emergencyPasscodeHash"),
  passwordEnabled: boolean("passwordEnabled").notNull().default(false),
  passcodeEnabled: boolean("passcodeEnabled").notNull().default(false),
  setByAdminId: text("setByAdminId"),
  passwordEnabledAt: timestamp("passwordEnabledAt"),
  passcodeEnabledAt: timestamp("passcodeEnabledAt"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// ── INMU Bank: purchase requests (ユーザーからの購入申請) ──
export const purchaseRequestsTable = pgTable("purchaseRequests", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  amount: numeric("amount").notNull(),
  txHash: text("txHash"),
  comment: text("comment"),
  status: text("status").notNull().default("pending"),
  reviewedByAdminId: text("reviewedByAdminId"),
  reviewedAt: timestamp("reviewedAt"),
  rebateAmount: numeric("rebateAmount"),
  rebateRate: numeric("rebateRate"),
  adminNote: text("adminNote"),
  rebateTxSignature: text("rebateTxSignature"),
  requestBaseRebateRate: numeric("requestBaseRebateRate"),
  requestPetRebateBonusRate: numeric("requestPetRebateBonusRate"),
  requestTotalRebateRate: numeric("requestTotalRebateRate"),
  requestPetRebateDetails: text("requestPetRebateDetails"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type PurchaseRequest = typeof purchaseRequestsTable.$inferSelect;

// ── INMU Bank: system settings (管理者が変更できる設定値) ──
export const systemSettingsTable = pgTable("systemSettings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type SystemSetting = typeof systemSettingsTable.$inferSelect;
