import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("[db] DATABASE_URL is missing");
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DB_POOL_MAX ?? 5),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 15_000),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
  keepAlive: true,
});

pool.on("error", (error: Error & { code?: string }) => {
  console.error("[db] PostgreSQL pool error", {
    name: error.name,
    message: error.message,
    code: error.code,
  });
});

export const db = drizzle(pool, { schema });

export * from "./schema";
