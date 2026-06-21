import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, pool } from "@workspace/db";
import { profileTable, userTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

// X IDを正規化（大文字小文字・@を統一）
function normalizeXId(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const { rows } = await pool.query(
      `SELECT
        p.*,
        COALESCE(ls.streak, 0)::int AS "loginStreak",
        COALESCE(ld.cnt, 0)::int    AS "totalLoginDays",
        COALESCE(mm.cnt, 0)::int    AS "monthlyMissionCount",
        COALESCE(tm.cnt, 0)::int    AS "totalMissionCount",
        COALESCE(ac.cnt, 0)::int    AS "achievementCount"
      FROM profile p
      LEFT JOIN "loginStreaks" ls ON ls."userId" = p."userId"
      LEFT JOIN (
        SELECT "userId", COUNT(*)::int AS cnt
        FROM points
        WHERE type = 'daily_login'
        GROUP BY "userId"
      ) ld ON ld."userId" = p."userId"
      LEFT JOIN (
        SELECT "userId", COUNT(*)::int AS cnt
        FROM "missionParticipations"
        WHERE status = 'rewarded'
          AND "rewardedAt" >= date_trunc('month', NOW())
          AND "rewardedAt" <  date_trunc('month', NOW()) + INTERVAL '1 month'
        GROUP BY "userId"
      ) mm ON mm."userId" = p."userId"
      LEFT JOIN (
        SELECT mp."userId", COUNT(*)::int AS cnt
        FROM "missionParticipations" mp
        WHERE mp.status = 'rewarded'
        GROUP BY mp."userId"
      ) tm ON tm."userId" = p."userId"
      LEFT JOIN (
        SELECT mp."userId", COUNT(*)::int AS cnt
        FROM "missionParticipations" mp
        JOIN missions m ON m.id = mp."missionId"
        WHERE mp.status = 'rewarded' AND m.type = 'achievement'
        GROUP BY mp."userId"
      ) ac ON ac."userId" = p."userId"
      WHERE p."userId" = $1`,
      [userId]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    const p = rows[0];
    res.json({
      ...p,
      createdAt: new Date(p.createdAt).toISOString(),
      updatedAt: new Date(p.updatedAt).toISOString(),
      loginStreak: Number(p.loginStreak),
      totalLoginDays: Number(p.totalLoginDays),
      monthlyMissionCount: Number(p.monthlyMissionCount),
      totalMissionCount: Number(p.totalMissionCount),
      achievementCount: Number(p.achievementCount),
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.put("/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { displayName, xId, discordId, discordUsername, solWallet, showBalance } =
    req.body as {
      displayName?: string;
      xId?: string;
      discordId?: string;
      discordUsername?: string;
      solWallet?: string;
      showBalance?: boolean;
    };

  // ① SOLウォレット重複チェック
  if (solWallet !== undefined && solWallet !== null && solWallet.trim() !== "") {
    const trimmed = solWallet.trim().toLowerCase();
    const { rows: dupCheck } = await pool.query(
      `SELECT "userId" FROM profile WHERE lower("solWallet") = $1 AND "userId" != $2 LIMIT 1`,
      [trimmed, userId],
    );
    if (dupCheck.length > 0) {
      res.status(400).json({ error: "このSOLアドレスは既に他のアカウントで使用されています" });
      return;
    }
  }

  // ② X ID 重複チェック（大文字小文字・@ 無視）
  if (xId !== undefined && xId !== null && xId.trim() !== "") {
    const normalized = normalizeXId(xId);
    const { rows: xDupCheck } = await pool.query(
      `SELECT "userId" FROM profile
       WHERE lower(regexp_replace("xId", '^@', '')) = $1 AND "userId" != $2 LIMIT 1`,
      [normalized, userId],
    );
    if (xDupCheck.length > 0) {
      res.status(400).json({ error: `この X ID（@${normalized}）は既に他のアカウントで使用されています` });
      return;
    }
  }

  try {
    // X ID 保存時は @ を除いた小文字に正規化
    const normalizedXId = xId !== undefined
      ? (xId.trim() === "" ? null : normalizeXId(xId))
      : undefined;

    await db
      .update(profileTable)
      .set({
        ...(displayName !== undefined && { displayName }),
        ...(normalizedXId !== undefined && { xId: normalizedXId }),
        ...(discordId !== undefined && { discordId }),
        ...(discordUsername !== undefined && { discordUsername }),
        ...(solWallet !== undefined && { solWallet: solWallet?.trim() ?? null }),
        ...(showBalance !== undefined && { showBalance }),
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, userId));
    const updated = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .then((r) => r[0]);
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/profile/change-password", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword と newPassword が必要です" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "新しいパスワードは8文字以上にしてください" });
    return;
  }
  try {
    const user = await db
      .select({ passwordHash: userTable.passwordHash })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .then((r) => r[0]);
    if (!user?.passwordHash) {
      res.status(404).json({ error: "ユーザーが見つかりません" });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "現在のパスワードが正しくありません" });
      return;
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(userTable)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(userTable.id, userId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/profile/change-passcode", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { currentPasscode, newPasscode } = req.body as {
    currentPasscode?: string;
    newPasscode?: string;
  };
  if (!newPasscode) {
    res.status(400).json({ error: "newPasscode が必要です" });
    return;
  }
  try {
    const profile = await db
      .select({ passcodeHash: profileTable.passcodeHash })
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .then((r) => r[0]);
    if (profile?.passcodeHash) {
      if (!currentPasscode) {
        res.status(400).json({ error: "現在のパスコードを入力してください" });
        return;
      }
      const valid = await bcrypt.compare(currentPasscode, profile.passcodeHash);
      if (!valid) {
        res.status(401).json({ error: "現在のパスコードが正しくありません" });
        return;
      }
    }
    const newHash = await bcrypt.hash(newPasscode, 12);
    await db
      .update(profileTable)
      .set({ passcodeHash: newHash, updatedAt: new Date() })
      .where(eq(profileTable.userId, userId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
