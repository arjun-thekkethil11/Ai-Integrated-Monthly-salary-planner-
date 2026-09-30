import { create } from "zustand";
import { api } from "../api/client";
import { readLocalSnapshot, snapshotHasUserData, writeLocalSnapshot } from "../lib/localSnapshot";
import type { Settings, Budget } from "../types";

interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

interface AppState {
  settings: Settings | null;
  budget: Budget | null;
  loading: boolean;
  error: string | null;
  toasts: Toast[];
  refresh: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  pushToast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  budget: null,
  loading: true,
  error: null,
  toasts: [],

  refresh: async () => {
    try {
      await reconcileStoredData();
      const { settings, budget } = await api.getBudget();
      set({ settings, budget, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  updateSettings: async (patch) => {
    const updated = await api.updateSettings(patch);
    set({ settings: updated });
    await get().refresh();
  },

  pushToast: (message, tone = "info") => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => get().dismissToast(id), 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

async function reconcileStoredData() {
  try {
    const remote = await api.getSnapshot();
    const local = readLocalSnapshot();
    if (!snapshotHasUserData(remote) && snapshotHasUserData(local)) {
      const restored = await api.restoreSnapshot(local!);
      writeLocalSnapshot(restored);
      return;
    }
    if (snapshotHasUserData(remote) || !snapshotHasUserData(local)) {
      writeLocalSnapshot(remote);
    }
  } catch {
    // Opening the app still works if this backup step fails.
  }
}
