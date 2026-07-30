import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CircleDot, Moon } from "lucide-react";

type Status = { active: boolean; playDate: string; hasPlayed: boolean };

export function DailyRoulettePrompt() {
  const [status, setStatus] = useState<Status | null>(null);
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (location.startsWith("/inmu1919") || location === "/roulette") return;
    fetch("/api/roulette/status", { credentials: "include" })
      .then((response) =>
        response.ok ? (response.json() as Promise<Status>) : null,
      )
      .then((data) => {
        if (!data?.active || data.hasPlayed) return;
        const dismissed = localStorage.getItem(
          `inmu-roulette-dismissed:${data.playDate}`,
        );
        if (!dismissed) setStatus(data);
      })
      .catch(() => undefined);
  }, [location]);

  function dismissToday() {
    if (status)
      localStorage.setItem(`inmu-roulette-dismissed:${status.playDate}`, "1");
    setStatus(null);
  }

  return (
    <Dialog
      open={Boolean(status)}
      onOpenChange={(open) => {
        if (!open) dismissToday();
      }}
    >
      <DialogContent className="max-w-sm border-amber-400/30 bg-[#0b0a0f]">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            本日のデイリールーレット
          </DialogTitle>
        </DialogHeader>
        <div className="mx-auto flex size-20 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 shadow-[0_0_32px_rgba(251,191,36,.2)]">
          <CircleDot className="size-11 text-amber-300" />
        </div>
        <p className="text-center text-sm leading-6 text-muted-foreground">
          1日1回、ポイントを1か所に賭けて挑戦できます。
        </p>
        <Button
          className="min-h-12 gap-2"
          onClick={() => {
            setStatus(null);
            navigate("/roulette");
          }}
        >
          <CircleDot className="size-4" />
          ルーレットを回す
        </Button>
        <Button
          variant="outline"
          className="min-h-11 gap-2"
          onClick={dismissToday}
        >
          <Moon className="size-4" />
          今日は回さない
        </Button>
      </DialogContent>
    </Dialog>
  );
}
