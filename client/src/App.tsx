import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Expenses } from "./pages/Expenses";
import { Analytics } from "./pages/Analytics";
import { Planner } from "./pages/Planner";
import { PastMonths } from "./pages/PastMonths";
import { useAppStore } from "./store/useAppStore";

function App() {
  const hydrate = useAppStore((s) => s.hydrate);
  const loading = useAppStore((s) => s.loading);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (loading) {
    return (
      <div className="app-shell flex items-center justify-center h-screen">
        <div className="bg-orbs" />
        <div className="text-white/40 text-sm animate-pulse">Loading your planner…</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/past-months" element={<PastMonths />} />
      </Route>
    </Routes>
  );
}

export default App;
