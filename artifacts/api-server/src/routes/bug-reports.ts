import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middlewares/session";

const router = Router();

let tableReady: Promise<void> | null = null;

function ensureBugReportsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS "bugReports" (
        id serial PRIMARY KEY,
        "userId" text NOT NULL,
        category text NOT NULL DEFAULT 'bug',
        subject text NOT NULL,
        message text NOT NULL,
        "pageUrl" text,
        "userAgent" text,
        source text NOT NULL DEFAULT 'portal',
        "challengeSessionId" text,
        "challengeCompensated" boolean NOT NULL DEFAULT false,
        status text NOT NULL DEFAULT 'open',
        "adminReply" text,
        "repliedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "bugReports_status_created_idx"
        ON "bugReports" (status, "createdAt" DESC);
      CREATE INDEX IF NOT EXISTS "bugReports_user_created_idx"
        ON "bugReports" ("userId", "createdAt" DESC);
      ALTER TABLE "bugReports" ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'portal';
      ALTER TABLE "bugReports" ADD COLUMN IF NOT EXISTS "challengeSessionId" text;
      ALTER TABLE "bugReports" ADD COLUMN IF NOT EXISTS "challengeCompensated" boolean NOT NULL DEFAULT false;
      CREATE UNIQUE INDEX IF NOT EXISTS "bugReports_challenge_compensation_idx"
        ON "bugReports" ("userId", "challengeSessionId")
        WHERE "challengeSessionId" IS NOT NULL;
    `).then(() => undefined).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

router.post("/bug-reports", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const pageUrl = typeof req.body?.pageUrl === "string" ? req.body.pageUrl.trim().slice(0, 500) : null;

  if (!subject || subject.length > 100 || message.length < 5 || message.length > 2000) {
    res.status(400).json({ error: "件名は100文字以内、内容は5〜2000文字で入力してください" });
    return;
  }

  try {
    await ensureBugReportsTable();
    const recent = await pool.query(
      `SELECT count(*)::int AS count
       FROM "bugReports"
       WHERE "userId" = $1 AND "createdAt" > now() - interval '10 minutes'`,
      [userId],
    );
    if (Number(recent.rows[0]?.count ?? 0) >= 5) {
      res.status(429).json({ error: "短時間に送信できる報告数を超えました。少し時間をおいてください" });
      return;
    }

    const inserted = await pool.query(
      `INSERT INTO "bugReports"
        ("userId", category, subject, message, "pageUrl", "userAgent")
       VALUES ($1, 'bug', $2, $3, $4, $5)
       RETURNING id, status, "createdAt"`,
      [userId, subject, message, pageUrl, req.get("user-agent")?.slice(0, 500) ?? null],
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    console.error("[BugReports] create error:", error);
    res.status(500).json({ error: "不具合報告を送信できませんでした" });
  }
});

router.get("/admin/bug-reports", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await ensureBugReportsTable();
    const result = await pool.query(`
      SELECT
        br.id,
        br."userId",
        COALESCE(NULLIF(p."displayName", ''), u.name, br."userId") AS "displayName",
        br.category,
        br.subject,
        br.message,
        br."pageUrl",
        br."userAgent",
        br.source,
        br."challengeCompensated",
        br.status,
        br."adminReply",
        br."repliedAt",
        br."createdAt",
        br."updatedAt"
      FROM "bugReports" br
      LEFT JOIN profile p ON p."userId" = br."userId"
      LEFT JOIN "user" u ON u.id = br."userId"
      ORDER BY
        CASE br.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        br."createdAt" DESC
      LIMIT 300
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("[BugReports] admin list error:", error);
    res.status(500).json({ error: "不具合報告を取得できませんでした" });
  }
});

router.patch("/admin/bug-reports/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  const adminReply = typeof req.body?.adminReply === "string" ? req.body.adminReply.trim() : "";

  if (!Number.isInteger(id) || id <= 0 || !["open", "in_progress", "resolved"].includes(status)) {
    res.status(400).json({ error: "更新内容が正しくありません" });
    return;
  }
  if (adminReply.length > 2000) {
    res.status(400).json({ error: "返信は2000文字以内で入力してください" });
    return;
  }

  let client;
  try {
    await ensureBugReportsTable();
    client = await pool.connect();
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT id, "userId", subject, "adminReply" FROM "bugReports" WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const report = current.rows[0];
    if (!report) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "報告が見つかりません" });
      return;
    }

    const shouldNotify = Boolean(adminReply) && adminReply !== (report.adminReply ?? "");
    const updated = await client.query(
      `UPDATE "bugReports"
       SET status = $2,
           "adminReply" = NULLIF($3, ''),
           "repliedAt" = CASE WHEN $3 <> '' THEN now() ELSE "repliedAt" END,
           "updatedAt" = now()
       WHERE id = $1
       RETURNING *`,
      [id, status, adminReply],
    );

    if (shouldNotify) {
      await client.query(
        `INSERT INTO notifications ("userId", type, title, message)
         VALUES ($1, 'bug_report_reply', '不具合報告への回答', $2)`,
        [report.userId, `「${report.subject}」への回答\n${adminReply}`],
      );
    }
    await client.query("COMMIT");
    res.json({ ...updated.rows[0], notificationSent: shouldNotify });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("[BugReports] admin update error:", error);
    res.status(500).json({ error: "不具合報告を更新できませんでした" });
  } finally {
    client?.release();
  }
});

export default router;
