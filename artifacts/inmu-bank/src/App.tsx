import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n/context";
import { AuthForm } from "@/components/auth-form";
import { DashboardPage } from "@/pages/dashboard-page";
import { HistoryPage } from "@/pages/history-page";
import { AchievementsPage } from "@/pages/achievements-page";
import { NotificationsPage } from "@/pages/notifications-page";
import { ProfilePage } from "@/pages/profile-page";
import { PointsPage } from "@/pages/points-page";
import { GachaPage } from "@/pages/gacha-page";
import { PetPage } from "@/pages/pet-page";
import { AdminPage } from "@/pages/admin-page";
import { AdminLoginPage } from "@/pages/admin-login-page";
import { AdminProfilePage } from "@/pages/admin-profile-page";
import { AdminRankingPage } from "@/pages/admin-ranking-page";
import { DevLoginPage } from "@/pages/dev-login-page";
import { PublicLegalPage } from "@/pages/public-legal-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { MaintenanceOverlay } from "@/components/maintenance-overlay";
import { RoulettePage } from "@/pages/roulette-page";

const queryClient = new QueryClient();

function ServiceErrorNotifier() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let lastNotificationAt = 0;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 503) {
        const now = Date.now();
        if (now - lastNotificationAt > 800) {
          lastNotificationAt = now;
          toast.error("エラー番号: 503");
        }
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
const AdminBattleTestPage = lazy(() =>
  import("@/pages/admin-battle-test-page").then((module) => ({ default: module.AdminBattleTestPage })),
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/balance"><Redirect to="/" /></Route>
      <Route path="/history" component={HistoryPage} />
      <Route path="/achievements" component={AchievementsPage} />
      <Route path="/community">
        <Redirect to="/achievements" />
      </Route>
      <Route path="/ranking">
        <Redirect to="/achievements" />
      </Route>
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/points" component={PointsPage} />
      <Route path="/gacha" component={GachaPage} />
      <Route path="/pet" component={PetPage} />
      <Route path="/roulette" component={RoulettePage} />
      <Route path="/inmu1919" component={AdminPage} />
      <Route path="/inmu1919/profile" component={AdminProfilePage} />
      <Route path="/inmu1919/ranking" component={AdminRankingPage} />
      <Route path="/inmu1919/quests">
        <Suspense fallback={<div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">クエストを読み込み中...</div>}>
          <AdminBattleTestPage />
        </Suspense>
      </Route>
      <Route path="/inmu1919/battle-test"><Redirect to="/inmu1919/quests" /></Route>
      <Route path="/inmu1919-login" component={AdminLoginPage} />
      <Route path="/admin"><Redirect to="/" /></Route>
      <Route path="/admin/profile"><Redirect to="/" /></Route>
      <Route path="/admin-login"><Redirect to="/inmu1919-login" /></Route>
      <Route path="/dev-login" component={DevLoginPage} />
      <Route path="/sign-in">
        <AuthForm mode="sign-in" />
      </Route>
      <Route path="/sign-up">
        <AuthForm mode="sign-up" />
      </Route>
      <Route path="/terms">
        <PublicLegalPage type="terms" />
      </Route>
      <Route path="/privacy">
        <PublicLegalPage type="privacy" />
      </Route>
      <Route>
        <NotFoundPage />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <I18nProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster richColors />
          <ServiceErrorNotifier />
          <MaintenanceOverlay />
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
