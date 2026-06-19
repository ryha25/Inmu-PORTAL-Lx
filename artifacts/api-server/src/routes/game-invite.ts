import { Router } from "express";
import cors from "cors";
import { db } from "@workspace/db";
import { userTable, notificationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const publicCors = cors({ origin: "*", credentials: false });

/**
 * POST /api/game-invite
 * INMU大富豪から対戦招待通知をINMU PORTALへ送信する
 * 外部アプリから認証なしで利用可能
 *
 * Body: { from: string, to: string, game: string, roomId: string }
 */
router.post("/game-invite", publicCors, async (req, res): Promise<void> => {
  const { from, to, game, roomId } = req.body ?? {};

  if (!from || !to || !game || !roomId) {
    res.status(400).json({ error: "from, to, game, roomId はすべて必須です" });
    return;
  }

  try {
    const targetUser = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.name, String(to)))
      .then((r) => r[0]);

    if (!targetUser) {
      res.status(404).json({ error: `ユーザー "${to}" が見つかりません` });
      return;
    }

    await db.insert(notificationsTable).values({
      userId: targetUser.id,
      type: "game_invite",
      title: `🎮 ${String(game)}`,
      message: `${String(from)} さんから対戦招待が届いています。\n\nルームID：${String(roomId)}`,
      isRead: false,
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
