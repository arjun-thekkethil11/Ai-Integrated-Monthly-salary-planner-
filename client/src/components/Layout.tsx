import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Receipt, LineChart, CalendarClock, Sparkles, Wallet } from "lucide-react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { useAppStore } from "../store/useAppStore";
import { formatCurrency } from "../lib/format";
import { Toasts } from "./Toasts";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", mobileLabel: "Home", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", mobileLabel: "Expenses", icon: Receipt },
  { to: "/analytics", label: "Analytics", mobileLabel: "Stats", icon: LineChart },
  { to: "/planner", label: "Purchase Planner", mobileLabel: "Planner", icon: Sparkles },
  { to: "/past-months", label: "Past Months", mobileLabel: "History", icon: CalendarClock },
];

export function Layout() {
  const settings = useAppStore((s) => s.settings);
  const budget = useAppStore((s) => s.budget);

  return (
    <div className="app-shell flex">
      <div className="bg-orbs" />
      <Toasts />

      <aside className="hidden md:flex w-64 shrink-0 flex-col gap-6 p-5 h-screen sticky top-0">
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-violet-500/30 float-slow">
            <Wallet size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-white/95 tracking-tight leading-none">Finly</div>
            <div className="text-[11px] text-white/40 leading-none mt-0.5">smart money planner</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1 mt-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all relative overflow-hidden",
                  isActive ? "text-white" : "text-white/50 hover:text-white/85 hover:bg-white/5"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 bg-gradient-to-r from-violet-500/25 to-cyan-500/10 border border-white/10 rounded-xl"
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    />
                  )}
                  <item.icon size={17} className="relative z-10" />
                  <span className="relative z-10">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="glass rounded-2xl p-4">
            <div className="text-[11px] text-white/40 mb-1">Current balance</div>
            <div className="text-xl font-bold text-white tabular-nums">
              {formatCurrency(settings?.current_balance, settings?.currency)}
            </div>
            {budget && (
              <div className="text-[11px] text-white/40 mt-2">
                ~{formatCurrency(budget.dailyAllowance, settings?.currency)}/day for {budget.daysRemaining} more day
                {budget.daysRemaining === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-screen">
        <MobileTopBar />
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 pb-28 md:pb-8">
          <Outlet />
        </div>
        <MobileNav />
      </main>
    </div>
  );
}

function MobileTopBar() {
  return (
    <div className="md:hidden sticky top-0 z-30 glass-strong px-4 py-3 flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center shrink-0">
        <Wallet size={14} className="text-white" />
      </div>
      <span className="font-bold text-white/95 text-sm tracking-tight">Finly</span>
    </div>
  );
}

function MobileNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-white/10 px-1"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              clsx(
                "relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium transition-colors",
                isActive ? "text-white" : "text-white/40"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-active"
                    className="absolute inset-x-2.5 top-1 bottom-1 bg-white/10 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
                <item.icon size={18} />
                <span>{item.mobileLabel}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
