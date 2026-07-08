import { db } from "@workspace/db";
import { pointsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";

/** Total points ever awarded to a user. Point spending never reduces this value. */
export async function getLifetimeEarnedPoints(userId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(cast(${pointsTable.amount} as numeric)), '0')`,
    })
    .from(pointsTable)
    .where(and(
      eq(pointsTable.userId, userId),
      sql`cast(${pointsTable.amount} as numeric) > 0`,
    ));

  return Math.max(0, Number(row?.total ?? 0));
}
