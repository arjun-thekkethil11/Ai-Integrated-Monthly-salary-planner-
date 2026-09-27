import type { ReactNode } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";

export function Card({
  children,
  className,
  strong = false,
  as: As = motion.div,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  as?: any;
}) {
  return (
    <As
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={clsx(strong ? "glass-strong" : "glass", "rounded-2xl p-4 sm:p-5", className)}
    >
      {children}
    </As>
  );
}

export function SectionTitle({ children, subtitle, action }: { children: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-white/90 tracking-tight">{children}</h2>
        {subtitle && <p className="text-sm text-white/50 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className,
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "subtle";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]";
  const sizes = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm";
  const variants: Record<string, string> = {
    primary: "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:brightness-110",
    ghost: "bg-white/5 text-white/80 hover:bg-white/10 border border-white/10",
    danger: "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/20",
    subtle: "bg-transparent text-white/50 hover:text-white/80",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={clsx(base, sizes, variants[variant], className)}>
      {children}
    </button>
  );
}

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  const tones: Record<string, string> = {
    default: "bg-white/10 text-white/70",
    success: "bg-emerald-500/15 text-emerald-300",
    warning: "bg-amber-500/15 text-amber-300",
    danger: "bg-rose-500/15 text-rose-300",
    info: "bg-cyan-500/15 text-cyan-300",
  };
  return <span className={clsx("px-2.5 py-1 rounded-full text-xs font-medium", tones[tone])}>{children}</span>;
}

export function ProgressBar({ value, tone = "default" }: { value: number; tone?: "default" | "warning" | "danger" }) {
  const clamped = Math.max(0, Math.min(100, value));
  const colors: Record<string, string> = {
    default: "from-violet-500 to-cyan-400",
    warning: "from-amber-400 to-orange-500",
    danger: "from-rose-500 to-red-600",
  };
  return (
    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div
        className={clsx("h-full rounded-full bg-gradient-to-r transition-all duration-500", colors[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/50 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-white/35 mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all";
