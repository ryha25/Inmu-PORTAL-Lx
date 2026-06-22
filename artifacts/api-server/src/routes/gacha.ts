import { Router } from "express";
import { db, pool } from "@workspace/db";
import { profileTable, pointsTable, notificationsTable } from "@workspace/db/schema";
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
  // 確定演出: INMU が含まれていなければ強制的に1個を10kINMUに差し替え
  if (guaranteed && !results.some(r => r.type === "inmu")) {
    const lastSmall = results.map(r => r.id).lastIndexOf("pts100");
    const idx = lastSmall >= 0 ? lastSmall : results.length - 1;
    results[idx] = PRIZES[3]; // inmu10k
  }
  return results;
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
  } catch (e) {
    console.warn("[Gacha] ensureTable:", e instanceof Error ? e.message : e);
  }
}
ensureTable();

// ── POST /api/gacha/spin ──
router.post("/gacha/spin", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { type } = req.body as { type?: "single" | "multi" };
  const pullType = type === "multi" ? "multi" : "single";
  const costPoints = pullType === "multi" ? 10000 : 1000;
  const count      = pullType === "multi" ? 10 : 1;

  // ① ポイント残高確認
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

  // ② 確定演出判定
  const wasGuaranteed = Math.random() < GUARANTEED_RATE;

  // ③ 抽選
  const prizeResults = rollMany(count, wasGuaranteed);

  // ④ 集計
  const totalPoints = prizeResults.filter(p => p.type === "points").reduce((s, p) => s + p.amount, 0);
  const inmuList    = prizeResults.filter(p => p.type === "inmu");
  const hasInmu     = inmuList.length > 0;
  const inmuCount   = inmuList.length;
  const netPoints   = totalPoints - costPoints;
  const month       = new Date().toISOString().slice(0, 7);

  try {
    // ⑤ monthlyPoints 更新
    await db.update(profileTable).set({
      monthlyPoints: sql`${profileTable.monthlyPoints} + ${netPoints}`,
      updatedAt: new Date(),
    }).where(eq(profileTable.userId, userId));

    // ⑥ ポイント履歴
    const pointsRows = [
      { userId, amount: String(-costPoints), type: "gacha_cost",   source: `ガチャ消費（${pullType === "multi" ? "10連" : "1連"}）`, month },
    ];
    if (totalPoints > 0) {
      pointsRows.push({ userId, amount: String(totalPoints), type: "gacha_reward", source: `ガチャ報酬（${pullType === "multi" ? "10連" : "1連"}）`, month });
    }
    await db.insert(pointsTable).values(pointsRows);

    // ⑦ ガチャ結果を保存
    const resultsJson = prizeResults.map(p => ({ prizeId: p.id, label: p.label, type: p.type, amount: p.amount }));
    await pool.query(
      `INSERT INTO "gachaResults" ("userId","pullType","results","totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints")
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,'pending',$7,$8)`,
      [userId, pullType, JSON.stringify(resultsJson), totalPoints, hasInmu, inmuCount, wasGuaranteed, costPoints],
    );

    // ⑧ INMU 当選通知
    if (hasInmu) {
      const dname = profile.displayName || userId;
      const adminMsg = `${dname} がガチャで 10,000 INMU を当選しました（${pullType === "multi" ? "10連" : "1連"} / ${inmuCount}個 / 未送金）`;
      await db.insert(notificationsTable).values([
        {
          userId,
          type:    "gacha_inmu_win",
          title:   "🎉 10,000 INMU 当選！",
          message: "10,000 INMU が当選しました。報酬は後日運営より送金されます。今しばらくお待ちください。",
        },
        {
          userId:  "admin",
          type:    "gacha_inmu_admin",
          title:   "🎰 INMU当選通知",
          message: adminMsg,
        },
      ]);
    }

    res.json({
      results: resultsJson,
      totalPoints,
      hasInmu,
      inmuCount,
      wasGuaranteed,
      costPoints,
      newPoints: currentPoints + netPoints,
    });
  } catch (e) {
    console.error("[Gacha] spin error:", e);
    res.status(500).json({ error: "ガチャの実行中にエラーが発生しました" });
  }
});

// ── GET /api/gacha/history ──
router.get("/gacha/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const { rows } = await pool.query(
      `SELECT id,"pullType",results,"totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","createdAt"
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
      `SELECT g.*, p."displayName"
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
router.put("/admin/gacha/results/:id/mark-sent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const adminId = req.adminId ?? req.userId ?? "admin";
  try {
    await pool.query(
      `UPDATE "gachaResults" SET "inmuSentStatus"='sent',"inmuSentAt"=NOW(),"inmuSentByAdminId"=$1 WHERE id=$2`,
      [adminId, id],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[Gacha/Admin] mark-sent error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
