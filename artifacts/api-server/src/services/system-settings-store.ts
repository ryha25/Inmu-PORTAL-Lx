import { pool } from "@workspace/db";

export async function getSystemSettingNumber(key: string, fallback: number): Promise<number> {
  try {
    const { rows } = await pool.query(`SELECT value FROM "systemSettings" WHERE key=$1`, [key]);
    if (!rows.length) return fallback;
    const n = Number(rows[0].value);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
