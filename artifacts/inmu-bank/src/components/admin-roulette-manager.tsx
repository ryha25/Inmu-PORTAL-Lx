import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Play, RefreshCw, Save, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PET_BY_ID, type PetId } from "@/features/pet/pet-data";
import { RouletteWheel3D } from "@/components/roulette-wheel-3d";

type Api = (path: string, method: string, body?: unknown) => Promise<any>;
type RoulettePlay = {
  id: number;
  username: string;
  dealerPetId: string;
  betType: "color" | "dozen" | "number";
  betValue: string;
  betAmount: number;
  resultNumber: number;
  resultColor: "red" | "black" | "green";
  won: boolean;
  payout: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
};
type RouletteReport = {
  date: string;
  summary: {
    players: number;
    totalBet: number;
    totalPayout: number;
    houseNet: number;
    winners: number;
    losers: number;
  };
  plays: RoulettePlay[];
  byBetType: Array<{
    betType: string;
    betValue: string;
    plays: number;
    totalBet: number;
    totalPayout: number;
  }>;
  byResultNumber: Array<{ resultNumber: number; plays: number }>;
};
type Dealer = { characterId: string; sortOrder: number; enabled: boolean };
type Preview = {
  dealerPetId: string;
  dealerPetName: string;
  betType: "color" | "dozen" | "number";
  betValue: string;
  betAmount: number;
  resultNumber: number;
  resultColor: "red" | "black" | "green";
  won: boolean;
  payout: number;
};

const fmt = (value: number) => new Intl.NumberFormat("ja-JP").format(value);
const jstToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
const petName = (characterId: string) =>
  PET_BY_ID[characterId as PetId]?.name ?? characterId;

export function AdminRouletteManager({ api }: { api: Api }) {
  const [date, setDate] = useState(jstToday);
  const [report, setReport] = useState<RouletteReport | null>(null);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewDone, setPreviewDone] = useState(false);
  const [previewType, setPreviewType] = useState<Preview["betType"]>("color");
  const [previewValue, setPreviewValue] = useState("red");
  const [previewAmount, setPreviewAmount] = useState("10000");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportData, dealerData] = await Promise.all([
        api(`/admin/roulette?date=${encodeURIComponent(date)}`, "GET"),
        api("/admin/roulette/dealers", "GET"),
      ]);
      setReport(reportData);
      setDealers(Array.isArray(dealerData) ? dealerData : []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "ルーレット情報を取得できませんでした",
      );
    } finally {
      setLoading(false);
    }
  }, [api, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const moveDealer = (index: number, offset: number) => {
    setDealers((current) => {
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((dealer, sortOrder) => ({ ...dealer, sortOrder }));
    });
  };

  const saveDealers = async () => {
    setSaving(true);
    try {
      const saved = await api("/admin/roulette/dealers", "PUT", {
        dealers: dealers.map(({ characterId, enabled }, sortOrder) => ({
          characterId,
          enabled,
          sortOrder,
        })),
      });
      setDealers(Array.isArray(saved) ? saved : dealers);
      toast.success("ディーラー設定を保存しました");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "ディーラー設定を保存できませんでした",
      );
    } finally {
      setSaving(false);
    }
  };

  const changePreviewType = (type: Preview["betType"]) => {
    setPreviewType(type);
    if (type === "color") {
      setPreviewValue("red");
      setPreviewAmount("10000");
    } else if (type === "dozen") {
      setPreviewValue("1-12");
      setPreviewAmount("5000");
    } else {
      setPreviewValue("0");
      setPreviewAmount("1000");
    }
    setPreview(null);
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    try {
      const result = (await api("/admin/roulette/preview", "POST", {
        betType: previewType,
        betValue: previewValue,
        amount: Number(previewAmount),
      })) as Preview;
      setPreview(result);
      setPreviewDone(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "テスト抽選を開始できませんでした",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div>
          <h3 className="font-semibold">仕様確認用テスト抽選</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            ポイント・挑戦回数・履歴を消費せず、抽選と3D演出を確認できます。
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            ベット種類
            <select
              className="h-10 border bg-background px-3"
              value={previewType}
              onChange={(event) =>
                changePreviewType(event.target.value as Preview["betType"])
              }
            >
              <option value="color">赤・黒</option>
              <option value="dozen">範囲</option>
              <option value="number">単体数字</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ベット内容
            <select
              className="h-10 border bg-background px-3"
              value={previewValue}
              onChange={(event) => setPreviewValue(event.target.value)}
            >
              {previewType === "color" && (
                <>
                  <option value="red">赤</option>
                  <option value="black">黒</option>
                </>
              )}
              {previewType === "dozen" && (
                <>
                  <option value="1-12">1～12</option>
                  <option value="13-24">13～24</option>
                  <option value="25-36">25～36</option>
                </>
              )}
              {previewType === "number" &&
                Array.from({ length: 37 }, (_, number) => (
                  <option key={number} value={String(number)}>
                    {number}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            テストベット
            <Input
              type="number"
              inputMode="numeric"
              value={previewAmount}
              onChange={(event) => setPreviewAmount(event.target.value)}
            />
          </label>
          <Button
            type="button"
            className="self-end"
            onClick={() => void runPreview()}
            disabled={previewLoading}
          >
            <Play className="size-4" />
            無料でテスト
          </Button>
        </div>
        {preview && (
          <div className="relative mt-4 overflow-hidden border bg-black">
            <RouletteWheel3D
              resultNumber={preview.resultNumber}
              spinning={!previewDone}
              onAnimationComplete={() => setPreviewDone(true)}
            />
            {!previewDone && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="absolute right-3 top-3"
                onClick={() => setPreviewDone(true)}
              >
                <SkipForward className="size-4" />
                スキップ
              </Button>
            )}
            {previewDone && (
              <div className="absolute inset-x-4 top-1/2 mx-auto max-w-xs -translate-y-1/2 border border-amber-300/40 bg-black/90 p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  {preview.dealerPetName} / ポイント消費なし
                </p>
                <p className="mt-2 text-4xl font-black text-amber-300">
                  {preview.resultNumber}
                </p>
                <p className="mt-2 font-bold">
                  {preview.won ? "的中" : "はずれ"} / 払戻{" "}
                  {fmt(preview.payout)} pt
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-44 flex-1 flex-col gap-1 text-sm">
            集計日（JST）
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            更新
          </Button>
        </div>
      </Card>

      {report && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {[
              ["挑戦者数", `${fmt(report.summary.players)}人`],
              ["総ベット", `${fmt(report.summary.totalBet)} pt`],
              ["総払戻", `${fmt(report.summary.totalPayout)} pt`],
              ["運営差引", `${fmt(report.summary.houseNet)} pt`],
              ["的中者", `${fmt(report.summary.winners)}人`],
              ["外れ", `${fmt(report.summary.losers)}人`],
            ].map(([label, value]) => (
              <Card key={label} className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono text-base font-bold">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <h3 className="font-semibold">ユーザー別履歴</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-muted/40 text-left text-xs">
                  <tr>
                    <th className="p-3">日時</th>
                    <th className="p-3">ユーザー</th>
                    <th className="p-3">ディーラー</th>
                    <th className="p-3">ベット</th>
                    <th className="p-3 text-right">ベット額</th>
                    <th className="p-3">結果</th>
                    <th className="p-3 text-right">払戻</th>
                    <th className="p-3 text-right">残高</th>
                  </tr>
                </thead>
                <tbody>
                  {report.plays.map((play) => (
                    <tr key={play.id} className="border-t">
                      <td className="whitespace-nowrap p-3">
                        {new Date(play.createdAt).toLocaleString("ja-JP")}
                      </td>
                      <td className="p-3 font-medium">{play.username}</td>
                      <td className="p-3">{petName(play.dealerPetId)}</td>
                      <td className="p-3">
                        {play.betType} / {play.betValue}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {fmt(play.betAmount)}
                      </td>
                      <td className="p-3">
                        {play.resultNumber}（{play.resultColor}）{" "}
                        {play.won ? "的中" : "外れ"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {fmt(play.payout)}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {fmt(play.balanceBefore)} → {fmt(play.balanceAfter)}
                      </td>
                    </tr>
                  ))}
                  {report.plays.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-8 text-center text-muted-foreground"
                      >
                        この日の履歴はありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">
                ベット種類別（ベット / 払戻）
              </h3>
              <div className="space-y-2 text-sm">
                {report.byBetType.map((item) => (
                  <div
                    key={`${item.betType}:${item.betValue}`}
                    className="grid grid-cols-3 gap-2 border-b pb-2"
                  >
                    <span>
                      {item.betType} / {item.betValue}
                    </span>
                    <span className="text-right">{fmt(item.plays)}回</span>
                    <span className="text-right font-mono">
                      {fmt(item.totalBet)} / {fmt(item.totalPayout)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">当選数字別</h3>
              <div className="grid grid-cols-4 gap-2 text-sm sm:grid-cols-6">
                {report.byResultNumber.map((item) => (
                  <div
                    key={item.resultNumber}
                    className="border p-2 text-center"
                  >
                    <strong>{item.resultNumber}</strong>
                    <span className="block text-xs text-muted-foreground">
                      {item.plays}回
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">PETディーラー</h3>
            <p className="text-xs text-muted-foreground">
              有効なPETを上から日替わりで表示します。
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void saveDealers()}
            disabled={saving || !dealers.some((dealer) => dealer.enabled)}
          >
            <Save className="size-4" />
            保存
          </Button>
        </div>
        <div className="space-y-2">
          {dealers.map((dealer, index) => (
            <div
              key={dealer.characterId}
              className="flex items-center gap-2 border p-2"
            >
              <input
                type="checkbox"
                checked={dealer.enabled}
                onChange={(event) =>
                  setDealers((current) =>
                    current.map((item) =>
                      item.characterId === dealer.characterId
                        ? { ...item, enabled: event.target.checked }
                        : item,
                    ),
                  )
                }
                aria-label={`${petName(dealer.characterId)}を有効化`}
              />
              <span className="min-w-0 flex-1 truncate">
                {index + 1}. {petName(dealer.characterId)}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => moveDealer(index, -1)}
                disabled={index === 0}
                title="上へ"
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => moveDealer(index, 1)}
                disabled={index === dealers.length - 1}
                title="下へ"
              >
                <ArrowDown className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
