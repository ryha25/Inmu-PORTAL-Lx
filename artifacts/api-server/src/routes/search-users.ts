import { Router } from "express";
import cors from "cors";
import { db } from "@workspace/db";
import { userTable } from "@workspace/db/schema";
import { eq, ilike } from "drizzle-orm";

const router = Router();

const publicCors = cors({ origin: "*", credentials: false });

/**
 * GET /api/search-users?q=YKN_Daifuku
 * ユーザー名の前方一致で検索（最大20件）
 * 外部アプリ（INMU大富豪など）から認証なしで利用可能
 */
router.get("/search-users", publicCors, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.status(400).json({ error: "クエリパラメータ q が必要です" });
    return;
  }
  if (q.length < 2) {
    res.status(400).json({ error: "q は2文字以上で指定してください" });
    return;
  }
  try {
    const users = await db
      .select({ username: userTable.name })
      .from(userTable)
      .where(ilike(userTable.name, `${q}%`))
      .limit(20);
    res.json(users);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

/**
 * GET /api/user?username=YKN_Daifuku
 * ユーザー名の完全一致で1件取得
 * 外部アプリ（INMU大富豪など）から認証なしで利用可能
 */
router.get("/user", publicCors, async (req, res): Promise<void> => {
  const username =
    typeof req.query.username === "string" ? req.query.username.trim() : "";
  if (!username) {
    res.status(400).json({ error: "クエリパラメータ username が必要です" });
    return;
  }
  try {
    const user = await db
      .select({ username: userTable.name })
      .from(userTable)
      .where(eq(userTable.name, username))
      .then((r) => r[0]);
    if (!user) {
      res.status(404).json({ error: "ユーザーが見つかりません" });
      return;
    }
    res.json(user);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
