import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
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
import { Component, type ErrorInfo, type ReactNode } from "react";

const queryClient = new QueryClient();

class PetPageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[INMU PET] page error", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold">INMU PETを読み込めませんでした</h1>
        <p className="text-sm text-muted-foreground">一時的な読み込みエラーです。ユーザーデータは変更されていません。</p>
        <button className="min-h-11 rounded-md bg-primary px-5 font-semibold text-primary-foreground" onClick={() => window.location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }
}

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
      <Route path="/pet">
        <PetPageBoundary><PetPage /></PetPageBoundary>
      </Route>
      <Route path="/inmu1919" component={AdminPage} />
      <Route path="/inmu1919/profile" component={AdminProfilePage} />
      <Route path="/inmu1919/ranking" component={AdminRankingPage} />
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
      <Route>
        <Redirect to="/" />
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
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
