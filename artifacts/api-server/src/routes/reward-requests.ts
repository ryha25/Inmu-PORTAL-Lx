import { Router } from "express";
import { db, pool } from "@workspace/db";
import { notificationsTable, pointsTable, profileTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/session";
import { ensurePetStateTable } from "../services/pet-state-store";

const router = Router();

const PET_LEVEL_INMU_REWARDS: Record<string, { characterName: string; level: number; amount: number }> = {
  "inmu-festival:15": {
    characterName: "INMUくん（810祭りVer.）",
    level: 15,
    amount: 30_000,
  },
};

let rewardRequestTablePromise: Promise<void> | null = null;

function ensureRewardRequestTable() {
  if (rewardRequestTablePromise) return rewardRequestTablePromise;
  rewardRequestTablePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "inmuRewardRequests" (
        id                  SERIAL PRIMARY KEY,
        "userId"            TEXT NOT NULL,
        "displayName"       TEXT,
        "rewardType"        TEXT NOT NULL,
        "sourceKey"         TEXT NOT NULL,
        "characterId"       TEXT,
        "characterName"     TEXT,
        "reachedLevel"      INTEGER,
        "inmuAmount"        NUMERIC(24, 6) NOT NULL,
        status              TEXT NOT NULL DEFAULT 'pending',
        "adminNote"         TEXT,
        "txHash"            TEXT,
        "reviewedByAdminId" TEXT,
        "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "reviewedAt"        TIMESTAMPTZ,
        "paidAt"            TIMESTAMPTZ,
        UNIQUE ("userId", "rewardType", "sourceKey")
      )
    `);
    const requestColumns = [
      `ADD COLUMN IF NOT EXISTS "displayName" TEXT`,
      `ADD COLUMN IF NOT EXISTS "rewardType" TEXT`,
      `ADD COLUMN IF NOT EXISTS "sourceKey" TEXT`,
      `ADD COLUMN IF NOT EXISTS "characterId" TEXT`,
      `ADD COLUMN IF NOT EXISTS "characterName" TEXT`,
      `ADD COLUMN IF NOT EXISTS "reachedLevel" INTEGER`,
      `ADD COLUMN IF NOT EXISTS "inmuAmount" NUMERIC(24, 6) DEFAULT 0`,
      `ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`,
      `ADD COLUMN IF NOT EXISTS "adminNote" TEXT`,
      `ADD COLUMN IF NOT EXISTS "txHash" TEXT`,
      `ADD COLUMN IF NOT EXISTS "reviewedByAdminId" TEXT`,
      `ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW()`,
      `ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ`,
      `ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ`,
    ];
    for (const definition of requestColumns) {
      await pool.query(`ALTER TABLE "inmuRewardRequests" ${definition}`);
    }
    await pool.query(`UPDATE "inmuRewardRequests" SET status = 'pending' WHERE status IS NULL OR status NOT IN ('pending', 'approved', 'rejected', 'paid')`);
    await pool.query(`
      DELETE FROM "inmuRewardRequests" newer
      USING "inmuRewardRequests" older
      WHERE newer.id > older.id
        AND newer."userId" = older."userId"
        AND newer."rewardType" = older."rewardType"
        AND newer."sourceKey" = older."sourceKey"
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "inmu_reward_request_source_unique" ON "inmuRewardRequests" ("userId", "rewardType", "sourceKey")`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "petLevelRewardClaims" (
        id              SERIAL PRIMARY KEY,
        "userId"        TEXT NOT NULL,
        "characterId"   TEXT NOT NULL,
        "rewardLevel"   INTEGER NOT NULL,
        "rewardType"    TEXT NOT NULL,
        amount          NUMERIC(24, 6) NOT NULL,
        "claimedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "characterId", "rewardLevel", "rewardType")
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "userPetCharacters" (
        id                SERIAL PRIMARY KEY,
        "userId"          TEXT NOT NULL,
        "characterId"     TEXT NOT NULL,
        "sourceMissionId" INTEGER,
        "acquiredAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "characterId")
      )
    `);
  })().catch(error => {
    rewardRequestTablePromise = null;
    throw error;
  });
  return rewardRequestTablePromise;
}

router.post("/pet/level-rewards/claim", requireAuth, async (req, res): Promise<void> => {
  const characterId = typeof req.body?.characterId === "string" ? req.body.characterId : "";
  if (characterId !== "inmu-festival") {
    res.status(400).json({ error: "受け取れるレベル報酬がありません" });
    return;
  }
  try {
    await ensureRewardRequestTable();
    await ensurePetStateTable();
    const petState = await pool.query(`SELECT state FROM "userPetStates" WHERE "userId" = $1`, [req.userId!]);
    const currentLevel = Number(petState.rows[0]?.state?.pets?.[characterId]?.level ?? 0);
    if (currentLevel < 10) {
      res.status(400).json({ error: "Lv.10到達後に受け取れます" });
      return;
    }
    const owned = await pool.query(
      `SELECT 1 FROM "userPetCharacters" WHERE "userId" = $1 AND "characterId" = $2 LIMIT 1`,
      [req.userId!, characterId],
    );
    if (owned.rows.length === 0) {
      res.status(403).json({ error: "このキャラクターを所持していません" });
      return;
    }
    const { rows } = await pool.query(`
      INSERT INTO "petLevelRewardClaims" ("userId", "characterId", "rewardLevel", "rewardType", amount)
      VALUES ($1, $2, 10, 'points', 100000)
      ON CONFLICT ("userId", "characterId", "rewardLevel", "rewardType") DO NOTHING
      RETURNING id
    `, [req.userId!, characterId]);
    if (rows.length === 0) {
      res.json({ ok: true, alreadyClaimed: true, points: 100_000 });
      return;
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await db.insert(pointsTable).values({
      userId: req.userId!, amount: "100000", type: "pet_level_reward", source: "INMUくん Lv.10報酬", month,
    });
    await db.update(profileTable)
      .set({ monthlyPoints: sql`${profileTable.monthlyPoints} + 100000`, updatedAt: now })
      .where(eq(profileTable.userId, req.userId!));
    await db.insert(notificationsTable).values({
      userId: req.userId!, type: "pet_level_reward", title: "INMU PET Lv.10報酬",
      message: "INMUくん（810祭りVer.）のLv.10報酬として100,000ポイントを付与しました。",
    });
    res.json({ ok: true, alreadyClaimed: false, points: 100_000 });
  } catch (error) {
    console.error("[RewardRequests] claim point reward", error);
    res.status(500).json({ error: "ポイント報酬の付与に失敗しました" });
  }
});

router.get("/pet/reward-requests", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureRewardRequestTable();
    await ensurePetStateTable();
    const petState = await pool.query(`SELECT state FROM "userPetStates" WHERE "userId" = $1`, [req.userId!]);
    const storedLevel = Number(petState.rows[0]?.state?.pets?.[characterId]?.level ?? 0);
    if (storedLevel < reward.level) {
      res.status(400).json({ error: `Lv.${reward.level}到達後に申請できます` });
      return;
    }
    const { rows } = await pool.query(`
      SELECT id, "rewardType", "sourceKey", "characterId", "characterName",
             "reachedLevel", "inmuAmount", status, "adminNote", "txHash",
             "createdAt", "reviewedAt", "paidAt"
      FROM "inmuRewardRequests"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
    `, [req.userId!]);
    res.json(rows);
  } catch (error) {
    console.error("[RewardRequests] list user requests", error);
    res.status(500).json({ error: "報酬申請の取得に失敗しました" });
  }
});

router.post("/pet/reward-requests", requireAuth, async (req, res): Promise<void> => {
  const characterId = typeof req.body?.characterId === "string" ? req.body.characterId : "";
  const reachedLevel = Number(req.body?.reachedLevel);
  const reward = PET_LEVEL_INMU_REWARDS[`${characterId}:${reachedLevel}`];
  if (!reward) {
    res.status(400).json({ error: "申請できないレベル報酬です" });
    return;
  }

  try {
    await ensureRewardRequestTable();
    const owned = await pool.query(
      `SELECT 1 FROM "userPetCharacters" WHERE "userId" = $1 AND "characterId" = $2 LIMIT 1`,
      [req.userId!, characterId],
    );
    if (owned.rows.length === 0) {
      res.status(403).json({ error: "このキャラクターを所持していません" });
      return;
    }

    const sourceKey = `pet:${characterId}:level:${reward.level}`;
    const profile = await pool.query(`SELECT "displayName" FROM profile WHERE "userId" = $1 LIMIT 1`, [req.userId!]);
    const displayName = typeof profile.rows[0]?.displayName === "string" ? profile.rows[0].displayName : null;
    const { rows } = await pool.query(`
      INSERT INTO "inmuRewardRequests"
        ("userId", "displayName", "rewardType", "sourceKey", "characterId", "characterName", "reachedLevel", "inmuAmount")
      VALUES ($1, $2, 'pet_level', $3, $4, $5, $6, $7)
      ON CONFLICT ("userId", "rewardType", "sourceKey") DO NOTHING
      RETURNING *
    `, [req.userId!, displayName, sourceKey, characterId, reward.characterName, reward.level, reward.amount]);

    if (rows.length === 0) {
      res.status(409).json({ error: "このレベル報酬は既に申請済みです" });
      return;
    }
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("[RewardRequests] create request", error);
    res.status(500).json({ error: "報酬申請に失敗しました" });
  }
});

router.get("/admin/pet-reward-requests", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await ensureRewardRequestTable();
    const { rows } = await pool.query(`
      SELECT r.*, COALESCE(NULLIF(r."displayName", ''), p."displayName", u.name, r."userId") AS "displayName", p."solWallet"
      FROM "inmuRewardRequests" r
      LEFT JOIN profile p ON p."userId" = r."userId"
      LEFT JOIN "user" u ON u.id = r."userId"
      ORDER BY
        CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
        r."createdAt" DESC
      LIMIT 1000
    `);
    res.json(rows);
  } catch (error) {
    console.error("[RewardRequests] list admin requests", error);
    res.status(500).json({ error: "報酬申請の取得に失敗しました" });
  }
});

async function updateRequests(
  ids: number[],
  status: string,
  adminId: string,
  adminNote: string | null,
  txHash: string | null,
) {
  const { rows } = await pool.query(`
    UPDATE "inmuRewardRequests"
    SET status = $1,
        "adminNote" = COALESCE($2, "adminNote"),
        "txHash" = COALESCE($3, "txHash"),
        "reviewedByAdminId" = $4,
        "reviewedAt" = CASE WHEN $1 IN ('approved', 'rejected', 'paid') THEN NOW() ELSE "reviewedAt" END,
        "paidAt" = CASE WHEN $1 = 'paid' THEN NOW() ELSE "paidAt" END
    WHERE id = ANY($5::int[])
    RETURNING *
  `, [status, adminNote, txHash, adminId, ids]);
  return rows;
}

async function notifyRequestStatus(rows: Array<Record<string, unknown>>, status: string) {
  const statusCopy: Record<string, { title: string; message: string }> = {
    approved: { title: "INMU PET報酬申請が承認されました", message: "運営が内容を確認しました。送金完了までお待ちください。" },
    rejected: { title: "INMU PET報酬申請が却下されました", message: "申請内容をご確認ください。" },
    paid: { title: "INMU PET報酬を送金しました", message: "申請されたINMU報酬の送金が完了しました。" },
  };
  const copy = statusCopy[status];
  if (!copy) return;
  await Promise.all(rows.map(row => db.insert(notificationsTable).values({
    userId: String(row.userId),
    type: "pet_reward_request",
    title: copy.title,
    message: `${copy.message} ${Number(row.inmuAmount).toLocaleString()} INMU${row.txHash ? ` / Tx: ${String(row.txHash)}` : ""}`,
  })));
}

router.put("/admin/pet-reward-requests/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!Number.isInteger(id) || !["pending", "approved", "rejected", "paid"].includes(status)) {
    res.status(400).json({ error: "申請IDまたはステータスが不正です" });
    return;
  }
  try {
    await ensureRewardRequestTable();
    const rows = await updateRequests(
      [id], status, req.adminId ?? req.userId ?? "admin",
      typeof req.body?.adminNote === "string" ? req.body.adminNote.trim() || null : null,
      typeof req.body?.txHash === "string" ? req.body.txHash.trim() || null : null,
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "申請が見つかりません" });
      return;
    }
    await notifyRequestStatus(rows, status);
    res.json({ ok: true, request: rows[0] });
  } catch (error) {
    console.error("[RewardRequests] update request", error);
    res.status(500).json({ error: "申請の更新に失敗しました" });
  }
});

router.put("/admin/pet-reward-requests", requireAdmin, async (req, res): Promise<void> => {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map(Number).filter(Number.isInteger))]
    : [];
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (ids.length === 0 || !["approved", "rejected", "paid"].includes(status)) {
    res.status(400).json({ error: "対象申請とステータスを指定してください" });
    return;
  }
  try {
    await ensureRewardRequestTable();
    const rows = await updateRequests(
      ids, status, req.adminId ?? req.userId ?? "admin",
      typeof req.body?.adminNote === "string" ? req.body.adminNote.trim() || null : null,
      typeof req.body?.txHash === "string" ? req.body.txHash.trim() || null : null,
    );
    await notifyRequestStatus(rows, status);
    res.json({ ok: true, updated: rows.length });
  } catch (error) {
    console.error("[RewardRequests] bulk update requests", error);
    res.status(500).json({ error: "申請の一括更新に失敗しました" });
  }
});

export default router;
