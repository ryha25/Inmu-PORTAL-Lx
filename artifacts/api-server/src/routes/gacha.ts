import { Router } from "express";
import { db, pool } from "@workspace/db";
import { profileTable, pointsTable, notificationsTable, transactionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/session";
import { hasActivePetSkill } from "../services/pet-skills";
import { ensurePetStateTable } from "../services/pet-state-store";

const router = Router();

// ── 確率テーブル（合計 10000）──
const PRIZES = [
  { id: "pts300", label: "300ポイント", type: "points" as const, amount: 300, weight: 4_190 },
  { id: "pts500", label: "500ポイント", type: "points" as const, amount: 500, weight: 2_500 },
  { id: "pts1000", label: "1,000ポイント", type: "points" as const, amount: 1_000, weight: 1_500 },
  { id: "pts3000", label: "3,000ポイント", type: "points" as const, amount: 3_000, weight: 800 },
  { id: "pts5000", label: "5,000ポイント", type: "points" as const, amount: 5_000, weight: 400 },
  { id: "inmu10k", label: "10,000 INMU", type: "inmu" as const, amount: 10_000, weight: 50 },
  { id: "premium-food", label: "高級ごはん", type: "premium_food" as const, amount: 1, weight: 500 },
  { id: "sleep-tea", label: "アイスティー（睡眠薬入り）", type: "sleep_tea" as const, amount: 1, weight: 60 },
] as const;
type Prize = (typeof PRIZES)[number];

const GUARANTEED_RATE = 1 / 114;

function rollPrize(): Prize {
  const r = Math.floor(Math.random() * 10000);
  let acc = 0;
  for (const p of PRIZES) {
    acc += p.weight;
    if (r < acc) return p;
  }
  return PRIZES[0];
}

function rollMany(count: number, guaranteed: boolean): Prize[] {
  const results: Prize[] = [];
  for (let i = 0; i < count; i++) results.push(rollPrize());
  if (guaranteed && !results.some(r => r.type === "inmu")) {
    results[results.length - 1] = PRIZES.find(prize => prize.id === "inmu10k")!;
  }
  return results;
}

async function addFreeGachaItem(userId: string, prize: Prize) {
  if (prize.type !== "premium_food" && prize.type !== "sleep_tea") return;
  await ensurePetStateTable();
  const result = await pool.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1`, [userId]);
  const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : { version: 5 };
  if (prize.type === "premium_food") {
    const food = state.premiumFood && typeof state.premiumFood === "object" ? state.premiumFood : { dailyDate: "", dailyUsed: 0, inventory: 0 };
    state.premiumFood = { ...food, inventory: Math.max(0, Number(food.inventory ?? 0)) + 1 };
  } else {
    const items = state.items && typeof state.items === "object" ? state.items : { sleepTea: 0 };
    state.items = { ...items, sleepTea: Math.max(0, Number(items.sleepTea ?? 0)) + 1 };
  }
  await pool.query(`INSERT INTO "userPetStates" ("userId",state,"clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
    ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()`,
    [userId, JSON.stringify(state), Date.now()]);
}

// ── DB テーブル初期化 ──
async function ensureTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "gachaResults" (
        id               SERIAL PRIMARY KEY,
        "userId"         TEXT    NOT NULL,
        "pullType"       TEXT    NOT NULL,
        results          JSONB   NOT NULL DEFAULT '[]',
        "totalPoints"    INTEGER NOT NULL DEFAULT 0,
        "hasInmu"        BOOLEAN NOT NULL DEFAULT false,
        "inmuCount"      INTEGER NOT NULL DEFAULT 0,
        "inmuSentStatus" TEXT    NOT NULL DEFAULT 'pending',
        "inmuSentAt"     TIMESTAMP,
        "inmuSentByAdminId" TEXT,
        "wasGuaranteed"  BOOLEAN NOT NULL DEFAULT false,
        "costPoints"     INTEGER NOT NULL DEFAULT 0,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "isFree"        BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "txHash"        TEXT`);
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "solWallet"     TEXT`);
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "failureReason" TEXT`);
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "gachaKind"     TEXT NOT NULL DEFAULT 'normal'`);
  } catch (e) {
    console.warn("[Gacha] ensureTable:", e instanceof Error ? e.message : e);
  }
}

// ── INMU当選個別管理テーブル（1当選=1行）──
async function ensureInmuWinsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "gachaInmuWins" (
        id                  SERIAL PRIMARY KEY,
        "spinId"            INTEGER NOT NULL,
        "userId"            TEXT    NOT NULL,
        "pullType"          TEXT    NOT NULL,
        "inmuAmount"        INTEGER NOT NULL DEFAULT 10000,
        "inmuSentStatus"    TEXT    NOT NULL DEFAULT 'pending',
        "inmuSentAt"        TIMESTAMP,
        "inmuSentByAdminId" TEXT,
        "txHash"            TEXT,
        "solWallet"         TEXT,
        "failureReason"     TEXT,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.warn("[Gacha] ensureInmuWinsTable:", e instanceof Error ? e.message : e);
  }
}

ensureTable();
ensureInmuWinsTable();

// ── JST 今日の開始時刻（UTC）を返す ──
function jstTodayStartUtc(): Date {
  const jstOffset = 9 * 3600 * 1000;
  const nowJst = new Date(Date.now() + jstOffset);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - jstOffset);
}

function jstTomorrowStartUtc(): Date {
  const today = jstTodayStartUtc();
  return new Date(today.getTime() + 24 * 3600 * 1000);
}

// ── GET /api/gacha/free-status ──
router.get("/gacha/free-status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const todayStart = jstTodayStartUtc();
    const { rows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM "gachaResults"
       WHERE "userId"=$1 AND "isFree"=true AND "gachaKind" IN ('normal','paid') AND "createdAt" >= $2`,
      [userId, todayStart.toISOString()],
    );
    const bonusPulls = await hasActivePetSkill(userId, "takuya") ? 3 : 0;
    const allowance = 2 + bonusPulls; // 通常+有償それぞれの無料1回 + 拓也スキルの合算ボーナス3回
    const usedCount = Number(rows[0].cnt);
    const used = usedCount >= allowance;
    const nextReset = jstTomorrowStartUtc().toISOString();
    res.json({ used, usedCount, allowance, remaining: Math.max(0, allowance - usedCount), nextReset });
  } catch (e) {
    console.error("[Gacha] free-status error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── POST /api/gacha/spin ──
router.post("/gacha/spin", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { type } = req.body as { type?: "single" | "multi" };
  const pullType = type === "multi" ? "multi" : "single";
  const costPoints = pullType === "multi" ? 10000 : 1000;
  const count      = pullType === "multi" ? 10 : 1;

  const [profile] = await db
    .select({ monthlyPoints: profileTable.monthlyPoints, displayName: profileTable.displayName })
    .from(profileTable).where(eq(profileTable.userId, userId)).limit(1);
  if (!profile) { res.status(404).json({ error: "プロフィールが見つかりません" }); return; }

  const currentPoints = Number(profile.monthlyPoints);
  if (currentPoints < costPoints) {
    res.status(400).json({
      error: `ポイントが不足しています（必要: ${costPoints.toLocaleString()}pt / 所持: ${currentPoints.toLocaleString()}pt）`,
    });
    return;
  }

  const wasGuaranteed = Math.random() < GUARANTEED_RATE;
  const prizeResults  = rollMany(count, wasGuaranteed);
  const pointMultiplier = 1; // ニャルシアン効果はガチャポイントの対象外
  const totalPoints   = prizeResults.filter(p => p.type === "points").reduce((s, p) => s + p.amount, 0) * pointMultiplier;
  const inmuList      = prizeResults.filter(p => p.type === "inmu");
  const hasInmu       = inmuList.length > 0;
  const inmuCount     = inmuList.length;
  const netPoints     = totalPoints - costPoints;
  const month         = new Date().toISOString().slice(0, 7);

  try {
    for (const prize of prizeResults) await addFreeGachaItem(userId, prize);
    await db.update(profileTable).set({
      monthlyPoints: sql`${profileTable.monthlyPoints} + ${netPoints}`,
      updatedAt: new Date(),
    }).where(eq(profileTable.userId, userId));

    const pointsRows = [
      { userId, amount: String(-costPoints), type: "gacha_cost", source: `ガチャ消費（${pullType === "multi" ? "10連" : "1連"}）`, month },
    ];
    if (totalPoints > 0) {
      pointsRows.push({ userId, amount: String(totalPoints), type: "gacha_reward", source: `ガチャ報酬（${pullType === "multi" ? "10連" : "1連"}）`, month });
    }
    await db.insert(pointsTable).values(pointsRows);

    const resultsJson = prizeResults.map(p => ({
      prizeId: p.id,
      label: p.type === "points" ? `${(p.amount * pointMultiplier).toLocaleString()}ポイント` : p.label,
      type: p.type,
      amount: p.type === "points" ? p.amount * pointMultiplier : p.amount,
      ...(p.type === "points" ? { baseAmount: p.amount } : {}),
    }));
    const { rows: spinRows } = await pool.query(
      `INSERT INTO "gachaResults" ("userId","pullType","results","totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree")
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,'pending',$7,$8,false) RETURNING id`,
      [userId, pullType, JSON.stringify(resultsJson), totalPoints, hasInmu, inmuCount, wasGuaranteed, costPoints],
    );
    const spinId = spinRows[0].id as number;

    // INMU当選ごとに個別行を挿入
    if (inmuCount > 0) {
      for (let i = 0; i < inmuCount; i++) {
        await pool.query(
          `INSERT INTO "gachaInmuWins" ("spinId","userId","pullType","inmuAmount","inmuSentStatus")
           VALUES ($1,$2,$3,10000,'pending')`,
          [spinId, userId, pullType],
        );
      }

      const dname = profile.displayName || userId;
      await db.insert(notificationsTable).values([
        { userId, type: "gacha_inmu_win", title: "🎉 10,000 INMU 当選！", message: `10,000 INMU が${inmuCount > 1 ? ` ${inmuCount}個` : ""}当選しました。報酬は後日運営より送金されます。今しばらくお待ちください。` },
        { userId: "admin", type: "gacha_inmu_admin", title: "🎰 INMU当選通知", message: `${dname} がガチャで 10,000 INMU を${inmuCount > 1 ? ` ${inmuCount}個` : ""}当選しました（${pullType === "multi" ? "10連" : "1連"} / 未送金）` },
      ]);
    }

    res.json({ results: resultsJson, totalPoints, hasInmu, inmuCount, wasGuaranteed, costPoints, newPoints: currentPoints + netPoints, pointMultiplier });
  } catch (e) {
    console.error("[Gacha] spin error:", e);
    res.status(500).json({ error: "ガチャの実行中にエラーが発生しました" });
  }
});

// ── POST /api/gacha/free-spin ──
router.post("/gacha/free-spin", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const todayStart = jstTodayStartUtc();
  const { rows: checkRows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM "gachaResults" WHERE "userId"=$1 AND "isFree"=true AND "gachaKind" IN ('normal','paid') AND "createdAt" >= $2`,
    [userId, todayStart.toISOString()],
  );
  const bonusPulls = await hasActivePetSkill(userId, "takuya") ? 3 : 0;
  const allowance = 2 + bonusPulls; // 通常+有償それぞれの無料1回 + 拓也スキルの合算ボーナス3回
  if (Number(checkRows[0].cnt) >= allowance) {
    res.status(400).json({ error: "本日の無料ガチャは使用済みです" });
    return;
  }

  const [profile] = await db
    .select({ monthlyPoints: profileTable.monthlyPoints, displayName: profileTable.displayName })
    .from(profileTable).where(eq(profileTable.userId, userId)).limit(1);
  if (!profile) { res.status(404).json({ error: "プロフィールが見つかりません" }); return; }

  const wasGuaranteed = Math.random() < GUARANTEED_RATE;
  const prizeResults  = rollMany(1, wasGuaranteed);
  const pointMultiplier = 1; // ニャルシアン効果はガチャポイントの対象外
  const totalPoints   = prizeResults.filter(p => p.type === "points").reduce((s, p) => s + p.amount, 0) * pointMultiplier;
  const inmuList      = prizeResults.filter(p => p.type === "inmu");
  const hasInmu       = inmuList.length > 0;
  const inmuCount     = inmuList.length;
  const month         = new Date().toISOString().slice(0, 7);
  const currentPoints = Number(profile.monthlyPoints);

  try {
    for (const prize of prizeResults) await addFreeGachaItem(userId, prize);
    if (totalPoints > 0) {
      await db.update(profileTable).set({
        monthlyPoints: sql`${profileTable.monthlyPoints} + ${totalPoints}`,
        updatedAt: new Date(),
      }).where(eq(profileTable.userId, userId));
      await db.insert(pointsTable).values({
        userId, amount: String(totalPoints), type: "gacha_reward",
        source: "ガチャ報酬（1日1回無料）", month,
      });
    }

    const resultsJson = prizeResults.map(p => ({
      prizeId: p.id,
      label: p.type === "points" ? `${(p.amount * pointMultiplier).toLocaleString()}ポイント` : p.label,
      type: p.type,
      amount: p.type === "points" ? p.amount * pointMultiplier : p.amount,
      ...(p.type === "points" ? { baseAmount: p.amount } : {}),
    }));
    const { rows: spinRows } = await pool.query(
      `INSERT INTO "gachaResults" ("userId","pullType","results","totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree")
       VALUES ($1,'free',$2::jsonb,$3,$4,$5,'pending',$6,0,true) RETURNING id`,
      [userId, JSON.stringify(resultsJson), totalPoints, hasInmu, inmuCount, wasGuaranteed],
    );
    const spinId = spinRows[0].id as number;

    if (inmuCount > 0) {
      await pool.query(
        `INSERT INTO "gachaInmuWins" ("spinId","userId","pullType","inmuAmount","inmuSentStatus")
         VALUES ($1,$2,'free',10000,'pending')`,
        [spinId, userId],
      );

      const dname = profile.displayName || userId;
      await db.insert(notificationsTable).values([
        { userId, type: "gacha_inmu_win", title: "🎉 10,000 INMU 当選！", message: "10,000 INMU が当選しました。報酬は後日運営より送金されます。今しばらくお待ちください。" },
        { userId: "admin", type: "gacha_inmu_admin", title: "🎰 INMU当選通知（無料）", message: `${dname} が無料ガチャで 10,000 INMU を当選しました（未送金）` },
      ]);
    }

    res.json({ results: resultsJson, totalPoints, hasInmu, inmuCount, wasGuaranteed, costPoints: 0, newPoints: currentPoints + totalPoints, pointMultiplier });
  } catch (e) {
    console.error("[Gacha] free-spin error:", e);
    res.status(500).json({ error: "ガチャの実行中にエラーが発生しました" });
  }
});

// ── GET /api/gacha/history ──
router.get("/gacha/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const { rows } = await pool.query(
      `SELECT id,"pullType",results,"totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree","txHash","createdAt"
       FROM "gachaResults" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 50`,
      [userId],
    );
    res.json(rows);
  } catch (e) {
    console.error("[Gacha] history error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/admin/gacha/spins ──
// gachaResults から全スピン一覧（結果バッジ付き）
router.get("/admin/gacha/spins", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT g.*, p."displayName"
       FROM "gachaResults" g
       LEFT JOIN profile p ON p."userId" = g."userId"
       ORDER BY g."createdAt" DESC LIMIT 500`,
    );
    res.json(rows);
  } catch (e) {
    console.error("[Gacha/Admin] spins error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── GET /api/admin/gacha/results ──
// gachaInmuWins から取得（1当選=1行）
router.get("/admin/gacha/results", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT
         w.id,
         w."spinId",
         w."userId",
         w."inmuAmount",
         w."inmuSentStatus",
         w."inmuSentAt",
         w."inmuSentByAdminId",
         w."txHash",
         w."solWallet",
         w."failureReason",
         w."createdAt",
         g."pullType",
         g."isFree",
         g."wasGuaranteed",
         p."displayName",
         p."solWallet" AS "profileSolWallet"
       FROM "gachaInmuWins" w
       JOIN "gachaResults" g ON g.id = w."spinId"
       LEFT JOIN profile p ON p."userId" = w."userId"
       ORDER BY w."createdAt" DESC
       LIMIT 500`,
    );
    res.json(rows);
  } catch (e) {
    console.error("[Gacha/Admin] results error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PUT /api/admin/gacha/results/:id/mark-sent ──
// gachaInmuWins の id を対象に txHash で送金済み記録
router.put("/admin/gacha/results/:id/mark-sent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const adminId = req.adminId ?? req.userId ?? "admin";
  const { txHash, solWallet } = req.body as { txHash?: string; solWallet?: string };

  if (!txHash) { res.status(400).json({ error: "txHash is required" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT "userId","inmuAmount","inmuSentStatus" FROM "gachaInmuWins" WHERE id=$1`,
      [id],
    );
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const row = rows[0] as { userId: string; inmuAmount: number; inmuSentStatus: string };

    if (row.inmuSentStatus === "sent") {
      res.status(400).json({ error: "既に送金済みです" });
      return;
    }

    const inmuAmount = row.inmuAmount ?? 10000;

    await pool.query(
      `UPDATE "gachaInmuWins"
       SET "inmuSentStatus"='sent', "inmuSentAt"=NOW(), "inmuSentByAdminId"=$1,
           "txHash"=$2, "solWallet"=$3, "failureReason"=NULL
       WHERE id=$4`,
      [adminId, txHash, solWallet ?? null, id],
    );

    // ユーザー transactions 履歴に gacha_reward として記録
    await db.insert(transactionsTable).values({
      userId: row.userId,
      type: "gacha_reward",
      amount: String(inmuAmount),
      memo: `ガチャ報酬 ${inmuAmount.toLocaleString()} INMU (tx: ${txHash.slice(0, 16)}…)`,
      counterparty: "管理者ウォレット",
      txHash,
    });

    // ユーザー残高更新
    await db.update(profileTable).set({
      balance: sql`${profileTable.balance} + ${inmuAmount}`,
      totalReceived: sql`${profileTable.totalReceived} + ${inmuAmount}`,
      updatedAt: new Date(),
    }).where(eq(profileTable.userId, row.userId));

    // ユーザー通知
    await db.insert(notificationsTable).values({
      userId: row.userId,
      type: "gacha_reward_sent",
      title: "🎁 ガチャ報酬が届きました！",
      message: `${inmuAmount.toLocaleString()} INMU が送金されました。\ntxHash: ${txHash}`,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("[Gacha/Admin] mark-sent error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PUT /api/admin/gacha/results/:id/mark-failed ──
router.put("/admin/gacha/results/:id/mark-failed", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { failureReason } = req.body as { failureReason?: string };
  try {
    await pool.query(
      `UPDATE "gachaInmuWins" SET "inmuSentStatus"='failed', "failureReason"=$1 WHERE id=$2 AND "inmuSentStatus" != 'sent'`,
      [failureReason ?? "送金失敗", id],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[Gacha/Admin] mark-failed error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PUT /api/admin/gacha/results/:id/reset-pending ──
router.put("/admin/gacha/results/:id/reset-pending", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await pool.query(
      `UPDATE "gachaInmuWins" SET "inmuSentStatus"='pending', "failureReason"=NULL WHERE id=$1 AND "inmuSentStatus"='failed'`,
      [id],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[Gacha/Admin] reset-pending error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
