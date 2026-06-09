import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n/context";
import { AuthForm } from "@/components/auth-form";
import { DashboardPage } from "@/pages/dashboard-page";
import { HistoryPage } from "@/pages/history-page";
import { BalancePage } from "@/pages/balance-page";
import { AchievementsPage } from "@/pages/achievements-page";
import { NotificationsPage } from "@/pages/notifications-page";
import { ProfilePage } from "@/pages/profile-page";
import { PointsPage } from "@/pages/points-page";
import { AdminPage } from "@/pages/admin-page";
import { AdminLoginPage } from "@/pages/admin-login-page";
import { AdminProfilePage } from "@/pages/admin-profile-page";
import { DevLoginPage } from "@/pages/dev-login-page";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/balance" component={BalancePage} />
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
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/profile" component={AdminProfilePage} />
      <Route path="/admin-login" component={AdminLoginPage} />
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
