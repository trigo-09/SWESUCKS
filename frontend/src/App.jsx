import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import { useAuth } from "./context/AuthContext";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import ProfileSetupPage from "./pages/ProfileSetupPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-lg text-ink">Loading GO-LAH...</div>;
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!user.is_guest && !user.first_login_completed) {
    return <ProfileSetupPage />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
