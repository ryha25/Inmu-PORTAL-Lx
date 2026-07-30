import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { PET_BY_ID, type PetId } from "@/features/pet/pet-data";
import { RouletteWheel3D } from "@/components/roulette-wheel-3d";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  CircleDot,
  Coins,
  History,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type BetType = "color" | "dozen" | "number";
type Bet = { betType: BetType; betValue: string; amount: number };
type Play = {
  id: string;
  executionId: string;
  playDate: string;
  dealerPetId: string;
  dealerPetName: string;
  betType: BetType;
  betValue: string;
  betAmount: number;
  resultNumber: number;
  resultColor: "green" | "red" | "black";
  won: boolean;
  payout: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  nextAvailableAt: string;
};
type RouletteStatus = {
  active: boolean;
  startsAt: string;
  playDate: string;
  hasPlayed: boolean;
  points: number;
  dealer: { id: string; name: string };
  play: Play | null;
};

const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const numbers = Array.from({ length: 37 }, (_, index) => index);

function betRules(type: BetType) {
  if (type === "color") return { min: 10_000, max: 100_000, multiplier: 2 };
  if (type === "dozen") return { min: 5_000, max: 100_000, multiplier: 3 };
  return { min: 1_000, max: 50_000, multiplier: 36 };
}

function betLabel(type: BetType, value: string) {
  if (type === "color") return value === "red" ? "赤" : "黒";
  if (type === "number") return `単体 ${value}`;
  return value;
}

function formatPoints(value: number) {
  return `${value.toLocaleString("ja-JP")} pt`;
}

function colorLabel(color: Play["resultColor"]) {
  if (color === "red") return "赤";
  if (color === "black") return "黒";
  return "緑";
}

function formatNextAvailable(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function RoulettePage() {
  const { profile, unread } = useAuth();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<RouletteStatus | null>(null);
  const [history, setHistory] = useState<Play[]>([]);
  const [selected, setSelected] = useState<{
    betType: BetType;
    betValue: string;
  } | null>(null);
  const [amountText, setAmountText] = useState("");
  const [placedBet, setPlacedBet] = useState<Bet | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [play, setPlay] = useState<Play | null>(null);
  const [animationDone, setAnimationDone] = useState(false);
  const [lightweight, setLightweight] = useState(
    () => localStorage.getItem("inmu-roulette-lightweight") === "1",
  );

  const load = useCallback(async () => {
    const [statusResponse, historyResponse] = await Promise.all([
      fetch("/api/roulette/status", { credentials: "include" }),
      fetch("/api/roulette/history", { credentials: "include" }),
    ]);
    if (statusResponse.ok) {
      const data = (await statusResponse.json()) as RouletteStatus;
      setStatus(data);
      if (data.play) {
        setPlay(data.play);
        setAnimationDone(true);
      }
    }
    if (historyResponse.ok)
      setHistory((await historyResponse.json()) as Play[]);
  }, []);

  useEffect(() => {
    load().catch(() => toast.error("ルーレット情報を読み込めませんでした"));
  }, [load]);

  const rules = selected ? betRules(selected.betType) : null;
  const amount = Number(amountText);
  const validAmount = Boolean(
    rules &&
    Number.isSafeInteger(amount) &&
    amount >= rules.min &&
    amount <= rules.max &&
    amount <= (status?.points ?? 0),
  );
  const dealer = status ? PET_BY_ID[status.dealer.id as PetId] : null;
  const potentialPayout =
    selected && rules && Number.isFinite(amount)
      ? Math.max(0, amount) * rules.multiplier
      : 0;

  function chooseBet(betType: BetType, betValue: string) {
    const next = { betType, betValue };
    setSelected(next);
    if (placedBet) setPlacedBet({ ...placedBet, ...next });
  }

  function placeChip() {
    if (!selected || !validAmount) return;
    setPlacedBet({ ...selected, amount });
  }

  async function confirmAndPlay() {
    if (!placedBet || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/roulette/play", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...placedBet,
          executionId: crypto.randomUUID(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        play?: Play;
        error?: string;
      };
      if (data.play) {
        setPlay(data.play);
        setStatus((current) =>
          current
            ? {
                ...current,
                hasPlayed: true,
                points: data.play!.balanceAfter,
                play: data.play!,
              }
            : current,
        );
        setAnimationDone(!response.ok);
        if (!response.ok) {
          setHistory((current) =>
            current.some((item) => item.id === data.play!.id)
              ? current
              : [data.play!, ...current],
          );
          return;
        }
      }
      if (!response.ok || !data.play) {
        throw new Error(data.error ?? "抽選を開始できませんでした");
      }
      setAnimationDone(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "抽選を開始できませんでした",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const numberRows = useMemo(
    () =>
      [0, 1, 2].map((column) =>
        numbers.filter((number) => number > 0 && (number - 1) % 3 === column),
      ),
    [],
  );

  if (!status) {
    return (
      <AppShell
        isAdmin={profile?.role === "admin"}
        displayName={profile?.displayName ?? ""}
        unread={unread}
      >
        <div className="py-24 text-center text-muted-foreground">
          ルーレットを準備しています...
        </div>
      </AppShell>
    );
  }

  if (!status.active) {
    return (
      <AppShell
        isAdmin={profile?.role === "admin"}
        displayName={profile?.displayName ?? ""}
        unread={unread}
      >
        <Card className="mx-auto max-w-lg p-8 text-center">
          <CircleDot className="mx-auto size-14 text-amber-300" />
          <h1 className="mt-4 text-2xl font-bold">デイリールーレット</h1>
          <p className="mt-3 text-muted-foreground">
            2026年8月1日 0:00（JST）開始予定です。
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => navigate("/")}
          >
            ダッシュボードへ戻る
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      isAdmin={profile?.role === "admin"}
      displayName={profile?.displayName ?? ""}
      unread={unread}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-300">
              Daily casino
            </p>
            <h1 className="text-2xl font-bold">デイリールーレット</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>軽量表示</span>
            <Switch
              checked={lightweight}
              onCheckedChange={(checked) => {
                setLightweight(checked);
                localStorage.setItem(
                  "inmu-roulette-lightweight",
                  checked ? "1" : "0",
                );
              }}
            />
          </div>
        </div>

        {play ? (
          <section className="overflow-hidden border-y border-amber-300/20 bg-black">
            <div className="relative min-h-[430px] sm:min-h-[560px]">
              {!lightweight ? (
                <RouletteWheel3D
                  resultNumber={play.resultNumber}
                  spinning={!animationDone}
                  onAnimationComplete={() => setAnimationDone(true)}
                />
              ) : (
                <div className="flex min-h-[430px] items-center justify-center bg-[radial-gradient(circle,#31120d_0%,#080709_62%)]">
                  <motion.div
                    initial={{ rotate: 0, scale: 0.72 }}
                    animate={{ rotate: 1440, scale: 1 }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    onAnimationComplete={() => setAnimationDone(true)}
                    className="flex size-64 items-center justify-center rounded-full border-[18px] border-amber-500 bg-[#171318] shadow-[0_0_55px_rgba(245,158,11,.35)]"
                  >
                    <span
                      className={cn(
                        "flex size-24 items-center justify-center rounded-full text-5xl font-black text-white",
                        play.resultColor === "red"
                          ? "bg-red-700"
                          : play.resultColor === "green"
                            ? "bg-emerald-700"
                            : "bg-black",
                      )}
                    >
                      {play.resultNumber}
                    </span>
                  </motion.div>
                </div>
              )}

              {dealer && (
                <motion.div
                  initial={{ x: -80, opacity: 0 }}
                  animate={
                    !animationDone
                      ? {
                          x: [-80, 0, 0, 6, 0],
                          y: [0, 0, -8, 2, 0],
                          rotate: [0, 0, -3, 2, 0],
                          opacity: 1,
                        }
                      : { x: 0, y: 0, rotate: 0, opacity: 1 }
                  }
                  transition={
                    !animationDone
                      ? {
                          duration: 6.2,
                          times: [0, 0.18, 0.35, 0.58, 1],
                          ease: "easeInOut",
                        }
                      : { duration: 0.25 }
                  }
                  className="pointer-events-none absolute bottom-3 left-2 w-[112px] sm:w-[190px]"
                >
                  <img
                    src={dealer.image}
                    alt={status.dealer.name}
                    className="max-h-[230px] w-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,.8)]"
                  />
                  <div className="rounded bg-black/75 px-2 py-1 text-center text-[10px] font-semibold text-amber-200 sm:text-xs">
                    本日のディーラー
                    <br />
                    {status.dealer.name}
                  </div>
                </motion.div>
              )}

              {!animationDone && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute right-3 top-3 gap-1.5"
                  onClick={() => setAnimationDone(true)}
                >
                  <SkipForward className="size-4" />
                  演出をスキップ
                </Button>
              )}

              <AnimatePresence>
                {animationDone && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-x-4 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-lg border border-amber-300/40 bg-black/90 p-5 text-center shadow-2xl backdrop-blur"
                  >
                    <p className="text-xs text-muted-foreground">当選数字</p>
                    <div
                      className={cn(
                        "mx-auto mt-2 flex size-20 items-center justify-center rounded-full text-4xl font-black text-white",
                        play.resultColor === "red"
                          ? "bg-red-700"
                          : play.resultColor === "green"
                            ? "bg-emerald-700"
                            : "bg-black ring-1 ring-white/30",
                      )}
                    >
                      {play.resultNumber}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {colorLabel(play.resultColor)}
                    </p>
                    <p
                      className={cn(
                        "mt-3 text-2xl font-black",
                        play.won ? "text-amber-300" : "text-muted-foreground",
                      )}
                    >
                      {play.won ? "的中" : "はずれ"}
                    </p>
                    <p className="mt-1 text-sm">
                      払戻 {formatPoints(play.payout)}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {betLabel(play.betType, play.betValue)} / ベット{" "}
                      {formatPoints(play.betAmount)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatPoints(play.balanceBefore)} →{" "}
                      {formatPoints(play.balanceAfter)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      次回挑戦 {formatNextAvailable(play.nextAvailableAt)}
                    </p>
                    <Button
                      className="mt-4 w-full"
                      onClick={() => navigate("/")}
                    >
                      ダッシュボードへ戻る
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        ) : (
          <>
            <Card className="border-amber-300/20 bg-[#0d0b10] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {dealer && (
                    <img
                      src={dealer.image}
                      alt=""
                      className="size-16 object-contain"
                    />
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">
                      本日のディーラー
                    </p>
                    <p className="font-bold text-amber-200">
                      {status.dealer.name}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">所持ポイント</p>
                  <p className="font-mono text-lg font-bold">
                    {formatPoints(status.points)}
                  </p>
                </div>
              </div>
            </Card>

            <section className="overflow-hidden rounded-lg border border-amber-300/25 bg-[#08070a] p-2 sm:p-4">
              <div className="grid grid-cols-[52px_repeat(12,minmax(42px,1fr))] gap-1 overflow-x-auto pb-2">
                <button
                  type="button"
                  onClick={() => chooseBet("number", "0")}
                  className={cn(
                    "row-span-3 flex min-h-[142px] items-center justify-center rounded bg-emerald-700 text-lg font-black text-white ring-offset-2 ring-offset-black",
                    selected?.betType === "number" &&
                      selected.betValue === "0" &&
                      "ring-2 ring-amber-300",
                  )}
                >
                  0
                </button>
                {numberRows.map((row, rowIndex) =>
                  row.map((number) => (
                    <button
                      key={number}
                      type="button"
                      style={{ gridRow: rowIndex + 1 }}
                      onClick={() => chooseBet("number", String(number))}
                      className={cn(
                        "relative min-h-11 min-w-[42px] rounded text-sm font-bold text-white ring-offset-1 ring-offset-black",
                        RED.has(number) ? "bg-red-700" : "bg-[#15151a]",
                        selected?.betType === "number" &&
                          selected.betValue === String(number) &&
                          "ring-2 ring-amber-300",
                      )}
                    >
                      {number}
                      {placedBet?.betType === "number" &&
                        placedBet.betValue === String(number) && (
                          <span className="absolute -right-1 -top-1 size-4 rounded-full border border-amber-100 bg-amber-500 text-[0px]" />
                        )}
                    </button>
                  )),
                )}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                {["1-12", "13-24", "25-36"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseBet("dozen", value)}
                    className={cn(
                      "min-h-12 rounded border border-amber-100/30 bg-white/5 text-sm font-semibold",
                      selected?.betType === "dozen" &&
                        selected.betValue === value &&
                        "border-amber-300 bg-amber-300/15 text-amber-200",
                    )}
                  >
                    {value}
                    <span className="block text-[10px] opacity-70">3倍</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => chooseBet("color", "red")}
                  className={cn(
                    "min-h-12 rounded bg-red-700 font-bold text-white",
                    selected?.betType === "color" &&
                      selected.betValue === "red" &&
                      "ring-2 ring-amber-300",
                  )}
                >
                  赤 <span className="text-xs">2倍</span>
                </button>
                <button
                  type="button"
                  onClick={() => chooseBet("color", "black")}
                  className={cn(
                    "min-h-12 rounded bg-black font-bold text-white ring-1 ring-white/25",
                    selected?.betType === "color" &&
                      selected.betValue === "black" &&
                      "ring-2 ring-amber-300",
                  )}
                >
                  黒 <span className="text-xs">2倍</span>
                </button>
              </div>
            </section>

            <Card className="p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">選択中</p>
                  <p className="mt-1 font-semibold">
                    {selected
                      ? betLabel(selected.betType, selected.betValue)
                      : "ベット場所を選択してください"}
                  </p>
                  {rules && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatPoints(rules.min)}～{formatPoints(rules.max)} /{" "}
                      {rules.multiplier}倍
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="roulette-bet"
                    className="text-xs text-muted-foreground"
                  >
                    ベットポイント数
                  </label>
                  <Input
                    id="roulette-bet"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min={rules?.min}
                    max={rules?.max}
                    value={amountText}
                    onChange={(event) => setAmountText(event.target.value)}
                    placeholder={rules ? String(rules.min) : "場所を選択"}
                    disabled={!selected || Boolean(placedBet)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded bg-secondary/55 px-3 py-2 text-sm">
                <span className="text-muted-foreground">的中時の払戻予定</span>
                <span className="font-mono font-bold text-amber-300">
                  {formatPoints(potentialPayout)}
                </span>
              </div>
              {!placedBet ? (
                <Button
                  className="mt-4 w-full gap-2"
                  disabled={!validAmount}
                  onClick={placeChip}
                >
                  <Coins className="size-4" />
                  チップを置く
                </Button>
              ) : (
                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <Button
                    className="gap-2"
                    disabled={submitting}
                    onClick={confirmAndPlay}
                  >
                    <CircleDot
                      className={cn("size-4", submitting && "animate-spin")}
                    />
                    ベットを確定して回す
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="ベットを取り消す"
                    onClick={() => setPlacedBet(null)}
                    disabled={submitting}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
              )}
            </Card>
          </>
        )}

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <History className="size-4 text-amber-300" />
            <h2 className="font-semibold">ルーレット履歴</h2>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              履歴はまだありません
            </p>
          ) : (
            <div className="divide-y divide-border">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3"
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full font-bold text-white",
                      item.resultColor === "red"
                        ? "bg-red-700"
                        : item.resultColor === "green"
                          ? "bg-emerald-700"
                          : "bg-black ring-1 ring-white/25",
                    )}
                  >
                    {item.resultNumber}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {betLabel(item.betType, item.betValue)} /{" "}
                      {formatPoints(item.betAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString("ja-JP")} ・{" "}
                      {item.dealerPetName}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1 text-sm font-bold",
                      item.won ? "text-amber-300" : "text-muted-foreground",
                    )}
                  >
                    {item.won ? (
                      <Check className="size-4" />
                    ) : (
                      <X className="size-4" />
                    )}
                    {formatPoints(item.payout)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Button
          variant="ghost"
          className="self-start gap-2"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="size-4" />
          ダッシュボードへ戻る
        </Button>
      </div>
    </AppShell>
  );
}
