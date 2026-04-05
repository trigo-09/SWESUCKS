import { Navigate, Route, Routes, Outlet, useLocation} from "react-router-dom";
import AppShell from "./components/AppShell";
import { useAuth } from "./context/useAuth";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import ProfileSetupPage from "./pages/ProfileSetupPage";
import SettingsPage from "./pages/SettingsPage";

function LoadingScreen() {
  return <div className="flex min-h-screen items-center justify-center text-lg text-ink">Loading GO-LAH...</div>;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!user.is_guest && !user.first_login_completed && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  return <Outlet />;
}


function RedirectIfAuthenticated() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthPage />;
  }

  const redirectTarget = user.is_guest
    ? location.state?.from?.pathname || "/"
    : user.first_login_completed
      ? location.state?.from?.pathname || "/"
      : "/setup";

  return <Navigate to={redirectTarget} replace />;
}

function RequireProfileSetup() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.is_guest || user.first_login_completed) {
    return <Navigate to="/" replace />;
  }

  return <ProfileSetupPage />;
}

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfAuthenticated />} />
      <Route path="/setup" element={<RequireProfileSetup />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}