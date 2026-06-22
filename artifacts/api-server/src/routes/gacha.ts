import { Router } from "express";
import { db, pool } from "@workspace/db";
import { profileTable, pointsTable, notificationsTable, transactionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

// ── 確率テーブル（合計 1000）──
const PRIZES = [
  { id: "pts100",  label: "100ポイント",   type: "points" as const, amount: 100,   weight: 880 },
  { id: "pts1000", label: "1,000ポイント", type: "points" as const, amount: 1000,  weight: 80  },
  { id: "pts5000", label: "5,000ポイント", type: "points" as const, amount: 5000,  weight: 30  },
  { id: "inmu10k", label: "10,000 INMU",  type: "inmu"   as const, amount: 10000, weight: 10  },
] as const;
type Prize = (typeof PRIZES)[number];

// 確定演出の発生確率（1/114）
const GUARANTEED_RATE = 1 / 114;

function rollPrize(): Prize {
  const r = Math.floor(Math.random() * 1000);
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
    const lastSmall = results.map(r => r.id).lastIndexOf("pts100");
    const idx = lastSmall >= 0 ? lastSmall : results.length - 1;
    results[idx] = PRIZES[3];
  }
  return results;
}

// ── DB テーブル初期化 + 列追加マイグレーション ──
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
    // 新列（既存テーブル用マイグレーション）
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "isFree"        BOOLEAN NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "txHash"        TEXT`);
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "solWallet"     TEXT`);
    await pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "failureReason" TEXT`);
  } catch (e) {
    console.warn("[Gacha] ensureTable:", e instanceof Error ? e.message : e);
  }
}
ensureTable();

// ── JST 今日の開始時刻（UTC）を返す ──
function jstTodayStartUtc(): Date {
  const jstOffset = 9 * 3600 * 1000;
  const nowJst = new Date(Date.now() + jstOffset);
  // JST での年月日
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  // JST 00:00:00 → UTC に変換
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
       WHERE "userId"=$1 AND "isFree"=true AND "createdAt" >= $2`,
      [userId, todayStart.toISOString()],
    );
    const used = Number(rows[0].cnt) > 0;
    const nextReset = jstTomorrowStartUtc().toISOString();
    res.json({ used, nextReset });
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
  const totalPoints   = prizeResults.filter(p => p.type === "points").reduce((s, p) => s + p.amount, 0);
  const inmuList      = prizeResults.filter(p => p.type === "inmu");
  const hasInmu       = inmuList.length > 0;
  const inmuCount     = inmuList.length;
  const netPoints     = totalPoints - costPoints;
  const month         = new Date().toISOString().slice(0, 7);

  try {
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

    const resultsJson = prizeResults.map(p => ({ prizeId: p.id, label: p.label, type: p.type, amount: p.amount }));
    await pool.query(
      `INSERT INTO "gachaResults" ("userId","pullType","results","totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree")
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,'pending',$7,$8,false)`,
      [userId, pullType, JSON.stringify(resultsJson), totalPoints, hasInmu, inmuCount, wasGuaranteed, costPoints],
    );

    if (hasInmu) {
      const dname = profile.displayName || userId;
      await db.insert(notificationsTable).values([
        { userId, type: "gacha_inmu_win", title: "🎉 10,000 INMU 当選！", message: "10,000 INMU が当選しました。報酬は後日運営より送金されます。今しばらくお待ちください。" },
        { userId: "admin", type: "gacha_inmu_admin", title: "🎰 INMU当選通知", message: `${dname} がガチャで 10,000 INMU を当選しました（${pullType === "multi" ? "10連" : "1連"} / ${inmuCount}個 / 未送金）` },
      ]);
    }

    res.json({ results: resultsJson, totalPoints, hasInmu, inmuCount, wasGuaranteed, costPoints, newPoints: currentPoints + netPoints });
  } catch (e) {
    console.error("[Gacha] spin error:", e);
    res.status(500).json({ error: "ガチャの実行中にエラーが発生しました" });
  }
});

// ── POST /api/gacha/free-spin ──
router.post("/gacha/free-spin", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  // 今日の無料ガチャ使用済チェック（JST基準）
  const todayStart = jstTodayStartUtc();
  const { rows: checkRows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM "gachaResults" WHERE "userId"=$1 AND "isFree"=true AND "createdAt" >= $2`,
    [userId, todayStart.toISOString()],
  );
  if (Number(checkRows[0].cnt) > 0) {
    res.status(400).json({ error: "本日の無料ガチャは使用済みです" });
    return;
  }

  const [profile] = await db
    .select({ monthlyPoints: profileTable.monthlyPoints, displayName: profileTable.displayName })
    .from(profileTable).where(eq(profileTable.userId, userId)).limit(1);
  if (!profile) { res.status(404).json({ error: "プロフィールが見つかりません" }); return; }

  const wasGuaranteed = Math.random() < GUARANTEED_RATE;
  const prizeResults  = rollMany(1, wasGuaranteed);
  const totalPoints   = prizeResults.filter(p => p.type === "points").reduce((s, p) => s + p.amount, 0);
  const inmuList      = prizeResults.filter(p => p.type === "inmu");
  const hasInmu       = inmuList.length > 0;
  const inmuCount     = inmuList.length;
  const month         = new Date().toISOString().slice(0, 7);
  const currentPoints = Number(profile.monthlyPoints);

  try {
    // ポイント報酬があればのみ付与（無料なので消費なし）
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

    const resultsJson = prizeResults.map(p => ({ prizeId: p.id, label: p.label, type: p.type, amount: p.amount }));
    await pool.query(
      `INSERT INTO "gachaResults" ("userId","pullType","results","totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree")
       VALUES ($1,'free',$2::jsonb,$3,$4,$5,'pending',$6,0,true)`,
      [userId, JSON.stringify(resultsJson), totalPoints, hasInmu, inmuCount, wasGuaranteed],
    );

    if (hasInmu) {
      const dname = profile.displayName || userId;
      await db.insert(notificationsTable).values([
        { userId, type: "gacha_inmu_win", title: "🎉 10,000 INMU 当選！", message: "10,000 INMU が当選しました。報酬は後日運営より送金されます。今しばらくお待ちください。" },
        { userId: "admin", type: "gacha_inmu_admin", title: "🎰 INMU当選通知（無料）", message: `${dname} が無料ガチャで 10,000 INMU を当選しました（未送金）` },
      ]);
    }

    res.json({ results: resultsJson, totalPoints, hasInmu, inmuCount, wasGuaranteed, costPoints: 0, newPoints: currentPoints + totalPoints });
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

// ── GET /api/admin/gacha/results ──
router.get("/admin/gacha/results", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT g.*, p."displayName", p."solWallet"
       FROM "gachaResults" g
       LEFT JOIN profile p ON p."userId" = g."userId"
       ORDER BY g."createdAt" DESC LIMIT 500`,
    );
    res.json(rows);
  } catch (e) {
    console.error("[Gacha/Admin] results error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PUT /api/admin/gacha/results/:id/mark-sent ──
// Phantom 署名完了後に txHash を受け取り、送金済みとして記録する
router.put("/admin/gacha/results/:id/mark-sent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const adminId = req.adminId ?? req.userId ?? "admin";
  const { txHash, solWallet } = req.body as { txHash?: string; solWallet?: string };

  if (!txHash) { res.status(400).json({ error: "txHash is required" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT "userId","inmuCount","inmuSentStatus" FROM "gachaResults" WHERE id=$1`,
      [id],
    );
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const row = rows[0] as { userId: string; inmuCount: number; inmuSentStatus: string };

    if (row.inmuSentStatus === "sent") {
      res.status(400).json({ error: "既に送金済みです" });
      return;
    }

    const inmuAmount = row.inmuCount * 10000;

    // gachaResults 更新
    await pool.query(
      `UPDATE "gachaResults"
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
      `UPDATE "gachaResults" SET "inmuSentStatus"='failed', "failureReason"=$1 WHERE id=$2 AND "inmuSentStatus" != 'sent'`,
      [failureReason ?? "送金失敗", id],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[Gacha/Admin] mark-failed error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── PUT /api/admin/gacha/results/:id/reset-pending ──
// 送金失敗した当選を再送金可能状態（pending）に戻す
router.put("/admin/gacha/results/:id/reset-pending", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await pool.query(
      `UPDATE "gachaResults" SET "inmuSentStatus"='pending', "failureReason"=NULL WHERE id=$1 AND "inmuSentStatus"='failed'`,
      [id],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[Gacha/Admin] reset-pending error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
