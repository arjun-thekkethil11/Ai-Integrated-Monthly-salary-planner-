import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-80">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              onClick={() => dismissToast(t.id)}
              className="glass-strong rounded-xl px-4 py-3 flex items-start gap-2.5 cursor-pointer shadow-xl"
            >
              <Icon
                size={18}
                className={
                  t.tone === "success" ? "text-emerald-400 mt-0.5" : t.tone === "error" ? "text-rose-400 mt-0.5" : "text-cyan-400 mt-0.5"
                }
              />
              <span className="text-sm text-white/85 leading-snug">{t.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
