import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable } from "@workspace/db/schema";
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

export default router;
