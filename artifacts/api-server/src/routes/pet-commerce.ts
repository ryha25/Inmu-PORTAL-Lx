import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/session";
import { fetchInmuBalance } from "./solana";
import { hasActivePetSkill, getFreeGachaState } from "../services/pet-skills";
import { getSystemSettingNumber } from "../services/system-settings-store";

const router = Router();

const MANAGEMENT_WALLET = "Hatp1W4QCzr7GAVbnQqKTVW2BmX7sRaf7jeHJMvETeU4";
const INMU_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;
const DUPLICATE_CHARACTER_POINTS = 50_000;
const DUPLICATE_CHARACTER_SLEEP_TEA = 3;

const CHARACTERS = [
  { id: "nyarushian", name: "ニャルシアン" },
  { id: "takuya", name: "拓也" },
  { id: "leon", name: "レオン" },
] as const;

type PullType = "single" | "multi" | "eleven";
type GachaMode = "points" | "paid";
type PetGachaPrize = {
  prizeId: string;
  label: string;
  type: "points" | "inmu" | "premium_food" | "sleep_tea" | "character";
  amount: number;
  characterId?: string;
  isNewCharacter?: boolean;
  isDuplicate?: boolean;
  convertedPoints?: number;
  baseAmount?: number;
};

const PAID_PRIZES = [
  { id: "pts1000", label: "1,000ポイント", type: "points" as const, amount: 1_000, weight: 6_000 },
  { id: "pts3000", label: "3,000ポイント", type: "points" as const, amount: 3_000, weight: 2_000 },
  { id: "pts5000", label: "5,000ポイント", type: "points" as const, amount: 5_000, weight: 700 },
  { id: "pts10000", label: "10,000ポイント", type: "points" as const, amount: 10_000, weight: 200 },
  { id: "premium-food", label: "高級ごはん", type: "premium_food" as const, amount: 1, weight: 400 },
  { id: "sleep-tea", label: "アイスティー（睡眠薬入り）", type: "sleep_tea" as const, amount: 1, weight: 340 },
  ...CHARACTERS.map(character => ({
    id: `character-${character.id}`,
    label: character.name,
    type: "character" as const,
    amount: 1,
    characterId: character.id,
    weight: 120,
  })),
];

const POINT_GUARANTEED_EFFECT_RATE = 1 / 514;

const POINT_PRIZES = [
  { id: "pts100", label: "100ポイント", type: "points" as const, amount: 100, weight: 86_878 },
  { id: "pts300", label: "300ポイント", type: "points" as const, amount: 300, weight: 51_300 },
  { id: "pts500", label: "500ポイント", type: "points" as const, amount: 500, weight: 8_550 },
  { id: "pts1000", label: "1,000ポイント", type: "points" as const, amount: 1_000, weight: 5_130 },
  { id: "pts5000", label: "5,000ポイント", type: "points" as const, amount: 5_000, weight: 2_000 },
  { id: "inmu10k", label: "10,000 INMU", type: "inmu" as const, amount: 10_000, weight: 2_138 },
  { id: "premium-food", label: "高級ごはん", type: "premium_food" as const, amount: 1, weight: 7_684 },
  { id: "sleep-tea", label: "アイスティー（睡眠薬入り）", type: "sleep_tea" as const, amount: 1, weight: 6_243 },
  ...CHARACTERS.map(character => ({
    id: `character-${character.id}`,
    label: character.name,
    type: "character" as const,
    amount: 1,
    characterId: character.id,
    weight: 359,
  })),
];

let tablePromise: Promise<void> | null = null;
export function ensurePetCommerceTables() {
  if (tablePromise) return tablePromise;
  tablePromise = Promise.all([
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petGachaState" (
        "userId" TEXT PRIMARY KEY,
        "paidPity" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petGachaHistory" (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "gachaType" TEXT NOT NULL,
        "pullType" TEXT NOT NULL,
        "costPoints" INTEGER NOT NULL DEFAULT 0,
        "costInmu" BIGINT NOT NULL DEFAULT 0,
        "txId" TEXT UNIQUE,
        "payerWallet" TEXT,
        results JSONB NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petSlotUnlocks" (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "slotNumber" INTEGER NOT NULL,
        "paidInmu" BIGINT NOT NULL,
        "txId" TEXT NOT NULL UNIQUE,
        "payerWallet" TEXT,
        "unlockedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "slotNumber")
      )
    `),
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petPaymentAttempts" (
        "txId" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        purpose TEXT NOT NULL,
        "expectedAmount" BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        "lastError" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "verifiedAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "gachaKind" TEXT NOT NULL DEFAULT 'normal'`).catch(() => undefined),
  ]).then(() => undefined).catch(error => {
    tablePromise = null;
    throw error;
  });
  return tablePromise;
}

function weightedRoll(table: typeof PAID_PRIZES | typeof POINT_PRIZES) {
  const total = table.reduce((sum, prize) => sum + prize.weight, 0);
  let cursor = Math.floor(Math.random() * total);
  for (const prize of table) {
    if (cursor < prize.weight) return prize;
    cursor -= prize.weight;
  }
  return table[0];
}

function randomCharacter() {
  return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchConfirmedTransaction(signature: string) {
  const rpcUrl = process.env.SOLANA_RPC;
  if (!rpcUrl) throw new Error("SOLANA_RPC is not configured");
  let lastError: any = null;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[signature], { searchTransactionHistory: true }],
      }),
    });
    const statusRpc = await statusResponse.json() as any;
    const signatureStatus = statusRpc?.result?.value?.[0];
    if (signatureStatus?.err) throw new Error(`送金トランザクションが失敗しています: ${JSON.stringify(signatureStatus.err)}`);
    const commitment = signatureStatus?.confirmationStatus === "finalized" ? "finalized" : "confirmed";
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", commitment, maxSupportedTransactionVersion: 0 }],
      }),
    });
    const rpc = await response.json() as any;
    if (response.ok && !rpc?.error && rpc?.result) return rpc.result;
    lastError = rpc?.error ?? null;
    await wait(1_500);
  }
  throw new Error(lastError?.message ?? "送金確認を継続しています。しばらく待ってから同じ操作を再試行してください");
}

async function verifyStoredPayment(userId: string, signature: string, expectedAmount: number, purpose: string) {
  await pool.query(`
    INSERT INTO "petPaymentAttempts" ("txId","userId",purpose,"expectedAmount",status)
    VALUES ($1,$2,$3,$4,'pending')
    ON CONFLICT ("txId") DO UPDATE SET "updatedAt"=NOW()
  `, [signature, userId, purpose, expectedAmount]);
  try {
    const payment = await verifyInmuPayment(signature, expectedAmount);
    await pool.query(`UPDATE "petPaymentAttempts" SET status='verified',"lastError"=NULL,"verifiedAt"=NOW(),"updatedAt"=NOW() WHERE "txId"=$1`, [signature]);
    return payment;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(`UPDATE "petPaymentAttempts" SET "lastError"=$2,"updatedAt"=NOW() WHERE "txId"=$1`, [signature, message]);
    throw error;
  }
}

async function verifyInmuPayment(signature: string, expectedAmount: number) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature)) throw new Error("TXIDの形式が不正です");
  const transaction = await fetchConfirmedTransaction(signature);
  if (transaction.meta?.err) throw new Error(`送金トランザクションが失敗しています: ${JSON.stringify(transaction.meta.err)}`);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!transaction.blockTime || Math.abs(nowSeconds - Number(transaction.blockTime)) > 60 * 60) {
    throw new Error("この送金は有効期限を過ぎています");
  }

  const sumForOwner = (balances: any[]) => (balances ?? [])
    .filter(balance => balance?.mint === INMU_MINT && balance?.owner === MANAGEMENT_WALLET)
    .reduce((sum, balance) => sum + BigInt(balance?.uiTokenAmount?.amount ?? "0"), 0n);
  const before = sumForOwner(transaction.meta?.preTokenBalances);
  const after = sumForOwner(transaction.meta?.postTokenBalances);
  const expectedRaw = BigInt(Math.round(expectedAmount * 10 ** INMU_DECIMALS));
  if (after - before !== expectedRaw) throw new Error(`送金額が一致しません（必要: ${expectedAmount.toLocaleString()} INMU）`);

  const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
  const payer = accountKeys.find((key: any) => key?.signer)?.pubkey ?? accountKeys[0]?.pubkey ?? null;
  return { payerWallet: payer ? String(payer) : null };
}

async function addPremiumFood(client: any, userId: string, amount: number) {
  const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 FOR UPDATE`, [userId]);
  const now = Date.now();
  const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : { version: 5 };
  const premiumFood = state.premiumFood && typeof state.premiumFood === "object"
    ? state.premiumFood
    : { dailyDate: "", dailyUsed: 0, inventory: 0 };
  state.premiumFood = { ...premiumFood, inventory: Math.max(0, Number(premiumFood.inventory ?? 0)) + amount };
  await client.query(`
    INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
    ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()
  `, [userId, JSON.stringify(state), now]);
}

async function addSleepTea(client: any, userId: string, amount: number) {
  const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 FOR UPDATE`, [userId]);
  const now = Date.now();
  const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : { version: 5 };
  const items = state.items && typeof state.items === "object" ? state.items : { sleepTea: 0 };
  state.items = { ...items, sleepTea: Math.max(0, Number(items.sleepTea ?? 0)) + amount };
  await client.query(`
    INSERT INTO "userPetStates" ("userId",state,"clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
    ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()
  `, [userId, JSON.stringify(state), now]);
}

async function initializeCharacterAtLevelOne(client: any, userId: string, characterId: string) {
  const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 FOR UPDATE`, [userId]);
  const now = Date.now();
  const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : { version: 5 };
  state.pets = { ...(state.pets ?? {}), [characterId]: { level: 1, exp: 0, fullness: 50, sleepiness: 20, affection: 10 } };
  state.lastCareAt = { ...(state.lastCareAt ?? {}), [characterId]: { "feed-basic": 0, "feed-premium": 0, "play-yarn": 0, "play-ball": 0, "play-toy": 0, pet: 0 } };
  state.cooldownUntil = { ...(state.cooldownUntil ?? {}), [characterId]: { feed: 0, play: 0 } };
  state.expressions = { ...(state.expressions ?? {}), [characterId]: { kind: "default", until: 0 } };
  state.petting = { ...(state.petting ?? {}), [characterId]: { count: 0, lastAt: 0 } };
  state.sleepStartedAt = { ...(state.sleepStartedAt ?? {}), [characterId]: 0 };
  state.progress = { ...(state.progress ?? {}), [characterId]: { fullnessAt: now, sleepinessAt: now } };
  await client.query(`
    INSERT INTO "userPetStates" ("userId",state,"clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
    ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()
  `, [userId, JSON.stringify(state), now]);
}

async function applyPrizes(client: any, userId: string, rawPrizes: any[]) {
  const results: PetGachaPrize[] = [];
  let totalPoints = 0;
  let premiumFood = 0;
  let sleepTea = 0;
  let inmuCount = 0;
  const pointMultiplier = 1; // ニャルシアン効果はガチャポイントの対象外
  for (const raw of rawPrizes) {
    if (raw.type === "character") {
      const inserted = await client.query(`
        INSERT INTO "userPetCharacters" ("userId","characterId") VALUES ($1,$2)
        ON CONFLICT ("userId","characterId") DO NOTHING RETURNING id
      `, [userId, raw.characterId]);
      const isNew = inserted.rowCount === 1;
      if (isNew) await initializeCharacterAtLevelOne(client, userId, raw.characterId);
      const convertedPoints = isNew ? 0 : DUPLICATE_CHARACTER_POINTS * pointMultiplier;
      if (!isNew) {
        totalPoints += convertedPoints;
        sleepTea += DUPLICATE_CHARACTER_SLEEP_TEA;
      }
      results.push({
        prizeId: raw.id,
        label: isNew ? raw.label : `${raw.label}は既に所持しています。${convertedPoints.toLocaleString()}ポイント＋アイスティー${DUPLICATE_CHARACTER_SLEEP_TEA}個に変換されました。`,
        type: "character",
        amount: 1,
        characterId: raw.characterId,
        isNewCharacter: isNew,
        isDuplicate: !isNew,
        convertedPoints,
        ...(!isNew ? { baseAmount: DUPLICATE_CHARACTER_POINTS, convertedSleepTea: DUPLICATE_CHARACTER_SLEEP_TEA } : {}),
      });
    } else if (raw.type === "premium_food") {
      premiumFood += raw.amount;
      results.push({ prizeId: raw.id, label: raw.label, type: "premium_food", amount: raw.amount });
    } else if (raw.type === "sleep_tea") {
      sleepTea += raw.amount;
      results.push({ prizeId: raw.id, label: raw.label, type: "sleep_tea", amount: raw.amount });
    } else if (raw.type === "inmu") {
      inmuCount += 1;
      results.push({ prizeId: raw.id, label: raw.label, type: "inmu", amount: raw.amount });
    } else {
      const awarded = raw.amount * pointMultiplier;
      totalPoints += awarded;
      results.push({ prizeId: raw.id, label: `${awarded.toLocaleString()}ポイント`, type: "points", amount: awarded, baseAmount: raw.amount });
    }
  }
  if (premiumFood > 0) await addPremiumFood(client, userId, premiumFood);
  if (sleepTea > 0) await addSleepTea(client, userId, sleepTea);
  if (totalPoints > 0) {
    const month = new Date().toISOString().slice(0, 7);
    await client.query(`UPDATE profile SET "monthlyPoints"="monthlyPoints"+$1,"updatedAt"=NOW() WHERE "userId"=$2`, [totalPoints, userId]);
    await client.query(`INSERT INTO points ("userId",amount,type,source,month) VALUES ($1,$2,'pet_gacha_reward','INMU PETガチャ報酬',$3)`, [userId, totalPoints, month]);
  }
  return { results, totalPoints, premiumFood, sleepTea, pointMultiplier, inmuCount, hasInmu: inmuCount > 0 };
}

async function getCurrentPoints(client: any, userId: string) {
  const result = await client.query(`SELECT "monthlyPoints" FROM profile WHERE "userId"=$1`, [userId]);
  return Number(result.rows[0]?.monthlyPoints ?? 0);
}

function jstTodayStartUtc(): Date {
  const jstOffset = 9 * 3600 * 1000;
  const nowJst = new Date(Date.now() + jstOffset);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - jstOffset);
}

function jstTomorrowStartUtc(): Date {
  const today = jstTodayStartUtc();
  return new Date(today.getTime() + 24 * 3600 * 1000);
}

router.get("/pet-commerce/status", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensurePetCommerceTables();
    const [state, slots, history] = await Promise.all([
      pool.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1`, [req.userId!]),
      pool.query(`SELECT "slotNumber","paidInmu","txId","unlockedAt" FROM "petSlotUnlocks" WHERE "userId"=$1 ORDER BY "slotNumber"`, [req.userId!]),
      pool.query(`SELECT id,"gachaType","pullType","costPoints","costInmu","txId",results,"createdAt" FROM "petGachaHistory" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 30`, [req.userId!]),
    ]);
    res.json({ paidPity: Number(state.rows[0]?.paidPity ?? 0), unlockedSlots: 1 + slots.rows.length, slotUnlocks: slots.rows, history: history.rows });
  } catch (error) {
    console.error("[PetCommerce] status", error);
    res.status(500).json({ error: "PETガチャ情報の取得に失敗しました" });
  }
});

router.get("/pet-gacha/free-status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    await ensurePetCommerceTables();
    const state = await getFreeGachaState(userId);
    const nextReset = jstTomorrowStartUtc().toISOString();
    res.json({
      used: !state.canDrawPaid,
      usedCount: state.paidUsed,
      allowance: 1 + state.sharedBonus,
      remaining: state.paidRemaining,
      baseRemaining: state.paidBaseRemaining,
      sharedRemaining: state.sharedRemaining,
      sharedBonus: state.sharedBonus,
      nextReset,
    });
  } catch (e) {
    console.error("[PetCommerce] free-status error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/pet-commerce/inmu-balance", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensurePetCommerceTables();
    const walletResult = await pool.query(`
      SELECT COALESCE(
        NULLIF(p."solWallet", ''),
        (SELECT h."payerWallet" FROM "petGachaHistory" h WHERE h."userId"=$1 AND h."payerWallet" IS NOT NULL ORDER BY h."createdAt" DESC LIMIT 1),
        (SELECT s."payerWallet" FROM "petSlotUnlocks" s WHERE s."userId"=$1 AND s."payerWallet" IS NOT NULL ORDER BY s."unlockedAt" DESC LIMIT 1)
      ) AS wallet
      FROM profile p WHERE p."userId"=$1
    `, [req.userId!]);
    const wallet = String(walletResult.rows[0]?.wallet ?? '');
    if (!wallet) { res.json({ balance: 0, wallet: null }); return; }
    const balance = await fetchInmuBalance(wallet);
    res.json({ balance, wallet });
  } catch (error) {
    console.error("[PetCommerce] INMU balance", error);
    res.status(502).json({ error: "INMU残高を取得できませんでした", balance: 0 });
  }
});

router.post("/pet-gacha/points", requireAuth, async (req, res): Promise<void> => {
  const pullType: PullType = req.body?.pullType === "multi" ? "multi" : "single";
  const count = pullType === "multi" ? 10 : 1;
  const costPoints = pullType === "multi" ? 10_000 : 1_000;
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    await client.query("BEGIN");
    const currentPoints = await getCurrentPoints(client, req.userId!);
    if (currentPoints < costPoints) throw new Error("ポイントが不足しています");
    await client.query(`UPDATE profile SET "monthlyPoints"="monthlyPoints"-$1,"updatedAt"=NOW() WHERE "userId"=$2`, [costPoints, req.userId!]);
    await client.query(`INSERT INTO points ("userId",amount,type,source,month) VALUES ($1,$2,'pet_gacha_cost','INMU PET通常ガチャ', $3)`, [req.userId!, -costPoints, new Date().toISOString().slice(0, 7)]);
    const rolled = Array.from({ length: count }, () => weightedRoll(POINT_PRIZES));
    const applied = await applyPrizes(client, req.userId!, rolled);
    const history = await client.query(`
      INSERT INTO "petGachaHistory" ("userId","gachaType","pullType","costPoints",results)
      VALUES ($1,'points',$2,$3,$4::jsonb) RETURNING id,"createdAt"
    `, [req.userId!, pullType, costPoints, JSON.stringify(applied.results)]);
    const wasGuaranteed = Math.random() < POINT_GUARANTEED_EFFECT_RATE;
    const legacySpin = await client.query(`
      INSERT INTO "gachaResults" ("userId","pullType",results,"totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree","gachaKind")
      VALUES ($1,$2,$3::jsonb,$4,$5,$6,'pending',$7,$8,false,'normal') RETURNING id
    `, [req.userId!, pullType, JSON.stringify(applied.results), applied.totalPoints, applied.inmuCount > 0, applied.inmuCount, wasGuaranteed, costPoints]);
    if (applied.inmuCount > 0) {
      for (let index = 0; index < applied.inmuCount; index += 1) {
        await client.query(`INSERT INTO "gachaInmuWins" ("spinId","userId","pullType","inmuAmount","inmuSentStatus") VALUES ($1,$2,$3,10000,'pending')`, [legacySpin.rows[0].id, req.userId!, pullType]);
      }
    }
    const newPoints = await getCurrentPoints(client, req.userId!);
    await client.query("COMMIT");
    res.json({ ...applied, costPoints, costInmu: 0, newPoints, historyId: history.rows[0].id, paidPity: null, wasGuaranteed });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] points gacha", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "ガチャに失敗しました" });
  } finally {
    client.release();
  }
});

router.post("/pet-gacha/paid", requireAuth, async (req, res): Promise<void> => {
  const pullType: PullType = req.body?.pullType === "eleven" ? "eleven" : "single";
  const count = pullType === "eleven" ? 11 : 1;
  const costInmu = pullType === "eleven"
    ? await getSystemSettingNumber("gacha_paid_eleven_inmu", 100_000)
    : await getSystemSettingNumber("gacha_paid_single_inmu", 10_000);
  const txId = String(req.body?.txId ?? "").trim();
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    const existing = await pool.query(`SELECT "userId",results,"costInmu" FROM "petGachaHistory" WHERE "txId"=$1`, [txId]);
    if (existing.rowCount) {
      if (existing.rows[0].userId !== req.userId) throw new Error("このTXIDは既に使用されています");
      const currentPoints = await getCurrentPoints(client, req.userId!);
      const state = await pool.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1`, [req.userId!]);
      const recoveredResults = Array.isArray(existing.rows[0].results) ? existing.rows[0].results : [];
      const totalPoints = recoveredResults.reduce((sum: number, prize: any) => sum + (prize.type === "points" ? Number(prize.amount ?? 0) : Number(prize.convertedPoints ?? 0)), 0);
      res.json({ results: recoveredResults, totalPoints, premiumFood: recoveredResults.filter((prize: any) => prize.type === "premium_food").length, hasInmu: false, costPoints: 0, costInmu: Number(existing.rows[0].costInmu), txId, newPoints: currentPoints, paidPity: Number(state.rows[0]?.paidPity ?? 0), recovered: true });
      return;
    }
    const payment = await verifyStoredPayment(req.userId!, txId, costInmu, `paid-gacha:${pullType}`);
    await client.query("BEGIN");
    const duplicateTx = await client.query(`SELECT id FROM "petGachaHistory" WHERE "txId"=$1`, [txId]);
    if (duplicateTx.rowCount) throw new Error("このTXIDは既に使用されています");
    const state = await client.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1 FOR UPDATE`, [req.userId!]);
    let pity = Number(state.rows[0]?.paidPity ?? 0);
    const rolled: any[] = [];
    for (let index = 0; index < count; index += 1) {
      const prize = pity >= 49
        ? (() => { const character = randomCharacter(); return { id: `character-${character.id}`, label: character.name, type: "character", amount: 1, characterId: character.id }; })()
        : weightedRoll(PAID_PRIZES);
      rolled.push(prize);
      pity = prize.type === "character" ? 0 : pity + 1;
    }
    const applied = await applyPrizes(client, req.userId!, rolled);
    await client.query(`
      INSERT INTO "petGachaState" ("userId","paidPity") VALUES ($1,$2)
      ON CONFLICT ("userId") DO UPDATE SET "paidPity"=EXCLUDED."paidPity","updatedAt"=NOW()
    `, [req.userId!, pity]);
    const history = await client.query(`
      INSERT INTO "petGachaHistory" ("userId","gachaType","pullType","costInmu","txId","payerWallet",results)
      VALUES ($1,'paid',$2,$3,$4,$5,$6::jsonb) RETURNING id,"createdAt"
    `, [req.userId!, pullType, costInmu, txId, payment.payerWallet, JSON.stringify(applied.results)]);
    const newPoints = await getCurrentPoints(client, req.userId!);
    await client.query("COMMIT");
    res.json({ ...applied, costPoints: 0, costInmu, txId, newPoints, paidPity: pity, historyId: history.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] paid gacha", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "有償ガチャに失敗しました" });
  } finally {
    client.release();
  }
});

router.post("/pet-gacha/paid-free", requireAuth, async (req, res): Promise<void> => {
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    const initialState = await getFreeGachaState(req.userId!);
    if (!initialState.canDrawPaid) {
      res.status(400).json({ error: "本日の無料ガチャは使用済みです" });
      return;
    }
    await client.query("BEGIN");
    const recheckState = await getFreeGachaState(req.userId!);
    if (!recheckState.canDrawPaid) throw new Error("本日の無料ガチャは使用済みです");
    const state = await client.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1 FOR UPDATE`, [req.userId!]);
    let pity = Number(state.rows[0]?.paidPity ?? 0);
    const prize = pity >= 49
      ? (() => { const character = randomCharacter(); return { id: `character-${character.id}`, label: character.name, type: "character", amount: 1, characterId: character.id }; })()
      : weightedRoll(PAID_PRIZES);
    pity = prize.type === "character" ? 0 : pity + 1;
    const applied = await applyPrizes(client, req.userId!, [prize]);
    await client.query(`
      INSERT INTO "petGachaState" ("userId","paidPity") VALUES ($1,$2)
      ON CONFLICT ("userId") DO UPDATE SET "paidPity"=EXCLUDED."paidPity","updatedAt"=NOW()
    `, [req.userId!, pity]);
    const history = await client.query(`
      INSERT INTO "petGachaHistory" ("userId","gachaType","pullType","costInmu",results)
      VALUES ($1,'paid','free',0,$2::jsonb) RETURNING id,"createdAt"
    `, [req.userId!, JSON.stringify(applied.results)]);
    const wasGuaranteed = applied.results.some(prize => prize.type === "character");
    await client.query(`
      INSERT INTO "gachaResults" ("userId","pullType",results,"totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree","gachaKind")
      VALUES ($1,'free',$2::jsonb,$3,false,0,'pending',$4,0,true,'paid')
    `, [req.userId!, JSON.stringify(applied.results), applied.totalPoints, wasGuaranteed]);
    const newPoints = await getCurrentPoints(client, req.userId!);
    await client.query("COMMIT");
    res.json({ ...applied, costPoints: 0, costInmu: 0, txId: null, newPoints, paidPity: pity, historyId: history.rows[0].id, wasGuaranteed });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] paid free gacha", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "無料ガチャに失敗しました" });
  } finally {
    client.release();
  }
});

router.post("/pet-slots/unlock", requireAuth, async (req, res): Promise<void> => {
  const txId = String(req.body?.txId ?? "").trim();
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    const existing = await pool.query(`SELECT "userId","slotNumber","paidInmu","unlockedAt" FROM "petSlotUnlocks" WHERE "txId"=$1`, [txId]);
    if (existing.rowCount) {
      if (existing.rows[0].userId !== req.userId) throw new Error("このTXIDは既に使用されています");
      res.json({ ok: true, unlockedSlots: Number(existing.rows[0].slotNumber), slotNumber: Number(existing.rows[0].slotNumber), paidInmu: Number(existing.rows[0].paidInmu), txId, unlockedAt: existing.rows[0].unlockedAt, recovered: true });
      return;
    }
    const current = await pool.query(`SELECT COUNT(*)::int AS count FROM "petSlotUnlocks" WHERE "userId"=$1`, [req.userId!]);
    const slotNumber = Number(current.rows[0]?.count ?? 0) + 2;
    if (slotNumber > 3) throw new Error("育成枠は既に最大です");
    const paidInmu = slotNumber === 2
      ? await getSystemSettingNumber("slot_unlock_2_inmu", 1_000_000)
      : await getSystemSettingNumber("slot_unlock_3_inmu", 2_000_000);
    const payment = await verifyStoredPayment(req.userId!, txId, paidInmu, `slot-unlock:${slotNumber}`);
    await client.query("BEGIN");
    const inserted = await client.query(`
      INSERT INTO "petSlotUnlocks" ("userId","slotNumber","paidInmu","txId","payerWallet")
      VALUES ($1,$2,$3,$4,$5) RETURNING "slotNumber","unlockedAt"
    `, [req.userId!, slotNumber, paidInmu, txId, payment.payerWallet]);
    await client.query("COMMIT");
    res.json({ ok: true, unlockedSlots: slotNumber, slotNumber, paidInmu, txId, unlockedAt: inserted.rows[0].unlockedAt });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] unlock slot", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "育成枠の解放に失敗しました" });
  } finally {
    client.release();
  }
});

export default router;

