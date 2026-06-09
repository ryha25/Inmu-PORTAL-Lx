import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { profileTable, userTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const profile = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .then((r) => r[0]);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json({
      ...profile,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.put("/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { displayName, xId, discordId, discordUsername, solWallet } =
    req.body as {
      displayName?: string;
      xId?: string;
      discordId?: string;
      discordUsername?: string;
      solWallet?: string;
    };
  try {
    await db
      .update(profileTable)
      .set({
        ...(displayName !== undefined && { displayName }),
        ...(xId !== undefined && { xId }),
        ...(discordId !== undefined && { discordId }),
        ...(discordUsername !== undefined && { discordUsername }),
        ...(solWallet !== undefined && { solWallet }),
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
