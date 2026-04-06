import { NavLink } from "react-router-dom";
import { History, Map, Settings } from "lucide-react";
import { useAuth } from "../context/useAuth";

const navItems = [
  { to: "/", label: "Map", icon: Map },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings }
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="fixed h-screen w-screen overflow-hidden bg-slate-100">
      <div className="pointer-events-none absolute left-3 right-3 top-1 z-[1200] flex items-center justify-between gap-3 md:left-4 md:right-4 md:top-2">
        <div className="pointer-events-auto flex min-w-0 w-[calc(100%-60px)] items-center justify-between gap-3 rounded-[1.7rem] border border-slate-200/90 bg-white/95 px-4 py-3 shadow-lg backdrop-blur xl:w-[34%]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-brand-500 text-xs font-semibold uppercase tracking-[0.28em] text-white">
              <div className="flex items-center gap-0">
                <span style={{ marginLeft: "-2px" }}>G</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10.7"
                  viewBox="0 0 24 28"
                  fill="currentColor"
                  style={{ marginLeft: "-1px", marginTop: "1.1px" }}
                >
                  <path d="M12 2C7.58 2 4 5.58 4 10c0 6.25 8 16 8 16s8-9.75 8-16c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
                </svg>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="5"
                  height="12"
                  viewBox="0 0 8 12"
                  style={{ marginLeft: "3.8px", marginTop: "1.5px" }}
                >
                  <line
                    x1="0"
                    y1="6"
                    x2="8"
                    y2="6"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span style={{ marginLeft: "5px" }}>LAH</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="min-w-0 max-w-[120px] truncate text-sm text-slate-700 sm:max-w-[180px] md:max-w-[240px]">
              {user?.is_guest ? "Guest session" : user?.profile?.name || user?.email}
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {user?.is_guest ? "Login" : "Sign Out"}
            </button>
          </div>
        </div>
      </div>

      <aside className="absolute bottom-4 left-4 top-24 z-[1100] hidden w-[90px] rounded-[1rem] border border-slate-200/90 bg-white/94 p-3 shadow-xl backdrop-blur xl:block">
        <nav className="flex h-full flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex min-h-[78px] flex-col items-center justify-center rounded-2xl px-2 py-3 text-center text-xs font-medium transition ${
                    isActive
                      ? "bg-brand-500 text-brand-100"
                      : "text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                <Icon size={18} strokeWidth={2} />
                <span className="mt-1">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="absolute bottom-20 left-3 right-3 z-[1100] xl:hidden">
        <div className="mb-7 grid grid-cols-3 gap-2 rounded-[1.7rem] border border-slate-200/90 bg-white/94 p-1 shadow-xl backdrop-blur">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-center gap-1 rounded-2xl px-3 py-2 text-xs font-medium transition ${
                    isActive
                      ? "bg-brand-500 text-brand-100"
                      : "text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                <Icon size={16} strokeWidth={2} />
                <span className="text-[11px]">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      <main className="absolute inset-0 z-10 overflow-y-auto">{children}</main>
    </div>
  );
}
