import { pool } from "@workspace/db";

let setupPromise: Promise<void> | null = null;

export function ensureLifetimePointsTracking(): Promise<void> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    await pool.query(`
      ALTER TABLE profile
      ADD COLUMN IF NOT EXISTS "lifetimeEarnedPoints" NUMERIC(30,0) NOT NULL DEFAULT 0
    `);
    await pool.query(`
      UPDATE profile p
      SET "lifetimeEarnedPoints" = GREATEST(
        p."lifetimeEarnedPoints",
        COALESCE(p."monthlyPoints", 0),
        COALESCE(ledger.positive_total, 0),
        COALESCE(p."monthlyPoints", 0) - COALESCE(ledger.negative_total, 0)
      )
      FROM (
        SELECT "userId",
          SUM(CASE WHEN CAST(amount AS numeric) > 0 THEN CAST(amount AS numeric) ELSE 0 END) AS positive_total,
          SUM(CASE WHEN CAST(amount AS numeric) < 0 THEN CAST(amount AS numeric) ELSE 0 END) AS negative_total
        FROM points
        GROUP BY "userId"
      ) ledger
      WHERE ledger."userId" = p."userId"
    `);
    await pool.query(`
      UPDATE profile
      SET "lifetimeEarnedPoints" = GREATEST("lifetimeEarnedPoints", COALESCE("monthlyPoints", 0))
    `);
    await pool.query(`
      CREATE OR REPLACE FUNCTION track_lifetime_earned_points()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."monthlyPoints" > OLD."monthlyPoints" THEN
          NEW."lifetimeEarnedPoints" := GREATEST(OLD."lifetimeEarnedPoints", 0)
            + (NEW."monthlyPoints" - OLD."monthlyPoints");
        ELSE
          NEW."lifetimeEarnedPoints" := OLD."lifetimeEarnedPoints";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      DROP TRIGGER IF EXISTS profile_lifetime_points_trigger ON profile;
      CREATE TRIGGER profile_lifetime_points_trigger
      BEFORE UPDATE OF "monthlyPoints" ON profile
      FOR EACH ROW EXECUTE FUNCTION track_lifetime_earned_points()
    `);
  })().catch(error => {
    setupPromise = null;
    throw error;
  });
  return setupPromise;
}
