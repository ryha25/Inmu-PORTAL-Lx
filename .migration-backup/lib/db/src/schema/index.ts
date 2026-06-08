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
  jarId: integer("jarId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;

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
