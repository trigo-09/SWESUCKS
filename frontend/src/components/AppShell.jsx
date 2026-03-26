import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" }
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-brand-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-brand-500">GO-LAH</p>
            <h1 className="text-xl font-semibold text-ink">Smart commute recommendations for Singapore</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-brand-50 px-4 py-2 text-sm text-brand-700">
              {user?.is_guest ? "Guest session" : user?.profile?.name || user?.email}
            </div>
            <button className="rounded-full border border-ink px-4 py-2 text-sm hover:bg-ink hover:text-white" onClick={logout}>
              Log off
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-3xl bg-white/80 p-4 shadow-panel">
          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive ? "bg-brand-500 text-white" : "text-ink hover:bg-brand-50"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {user?.is_guest && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Guest access cannot save favourite locations or recommendation history.
            </div>
          )}
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
