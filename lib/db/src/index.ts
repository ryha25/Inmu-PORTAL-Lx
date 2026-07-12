import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("[db] DATABASE_URL is missing");
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on("error", (error: Error & { code?: string }) => {
  console.error("[db] PostgreSQL pool error", {
    name: error.name,
    message: error.message,
    code: error.code,
  });
});

export const db = drizzle(pool, { schema });

export * from "./schema";
