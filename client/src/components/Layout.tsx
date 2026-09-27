import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Receipt, LineChart, CalendarClock, Sparkles, Wallet } from "lucide-react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { useAppStore } from "../store/useAppStore";
import { formatCurrency } from "../lib/format";
import { Toasts } from "./Toasts";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/analytics", label: "Analytics", icon: LineChart },
  { to: "/planner", label: "Purchase Planner", icon: Sparkles },
  { to: "/past-months", label: "Past Months", icon: CalendarClock },
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
        <MobileNav />
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function MobileNav() {
  return (
    <div className="md:hidden sticky top-0 z-40 glass-strong px-3 py-2 flex items-center gap-1 overflow-x-auto scrollbar-thin">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
              isActive ? "bg-white/10 text-white" : "text-white/50"
            )
          }
        >
          <item.icon size={14} />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
