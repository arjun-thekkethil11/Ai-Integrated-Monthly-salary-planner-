import { useEffect, useMemo, useState } from "react";
import { Plus, Wand2, Sparkles, PenLine, Camera, X, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api/client";
import { useAppStore } from "../store/useAppStore";
import { Card, SectionTitle, Button, Field, inputClass } from "./ui";
import { CategoryIcon } from "./CategoryIcon";
import { todayISO } from "../lib/format";
import { resizeImageForAi } from "../lib/image";
import type { CategoryMeta, AiStatus, ScannedExpense } from "../types";

type Mode = "manual" | "describe" | "photo";
const MAX_PHOTOS_PER_SCAN = 3;

export function QuickAddExpense({ onAdded }: { onAdded: () => void }) {
  const pushToast = useAppStore((s) => s.pushToast);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<string>("");
  const [suggested, setSuggested] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [mode, setMode] = useState<Mode>("manual");
  const [aiText, setAiText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [scannedRows, setScannedRows] = useState<ScannedExpense[]>([]);

  // Only re-create thumbnail blob URLs when the file list actually changes,
  // and clean them up afterwards — avoids leaking a blob URL on every
  // unrelated re-render of this component.
  const photoPreviews = useMemo(() => photoFiles.map((f) => URL.createObjectURL(f)), [photoFiles]);
  useEffect(() => {
    return () => photoPreviews.forEach((u) => URL.revokeObjectURL(u));
  }, [photoPreviews]);

  function refreshAiStatus() {
    api.getAiStatus().then(setAiStatus).catch(() => setAiStatus({ enabled: false, model: null }));
  }

  useEffect(() => {
    api.getCategories().then(setCategories);
    refreshAiStatus();
  }, []);

  useEffect(() => {
    if (!description.trim()) {
      setSuggested(null);
      return;
    }
    const handle = setTimeout(() => {
      api.previewCategory(description).then((r) => setSuggested(r.category));
    }, 300);
    return () => clearTimeout(handle);
  }, [description]);

  function switchMode(next: Mode) {
    if (next !== "manual" && !aiStatus?.enabled) {
      pushToast("Add an OPENAI_API_KEY in server/.env to enable AI features", "info");
      return;
    }
    setMode(next);
  }

  async function handleAiParse() {
    if (!aiText.trim()) return;
    setAiParsing(true);
    try {
      const parsed = await api.parseExpenseAI(aiText.trim());
      if (parsed.amount) setAmount(String(parsed.amount));
      setDescription(parsed.description || aiText.trim());
      setCategory(parsed.category || "");
      setDate(parsed.date || todayISO());
      setMode("manual");
      setAiText("");
      pushToast(parsed.amount ? "Filled in from your description — check & save" : "Parsed it, but couldn't spot an amount — add one", "info");
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setAiParsing(false);
      refreshAiStatus();
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    if (picked.length > MAX_PHOTOS_PER_SCAN) {
      pushToast(`Scanning up to ${MAX_PHOTOS_PER_SCAN} screenshots at a time, to stay within the free-tier AI limit`, "info");
    }
    setPhotoFiles((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS_PER_SCAN));
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleScanPhotos() {
    if (photoFiles.length === 0) return;
    setScanning(true);
    const collected: ScannedExpense[] = [];
    for (let i = 0; i < photoFiles.length; i++) {
      setScanProgress(photoFiles.length > 1 ? `Scanning screenshot ${i + 1} of ${photoFiles.length}…` : "Reading screenshot…");
      try {
        const dataUrl = await resizeImageForAi(photoFiles[i]);
        const res = await api.parseExpenseImageAI(dataUrl);
        collected.push(...res.transactions.map((t) => ({ ...t, include: true })));
      } catch (err) {
        pushToast((err as Error).message, "error");
        break; // guardrail block or a hard failure — stop the rest of this batch
      }
    }
    setScanning(false);
    setScanProgress(null);
    refreshAiStatus();
    if (collected.length > 0) {
      setScannedRows((prev) => [...prev, ...collected]);
      setPhotoFiles([]);
      pushToast(`Found ${collected.length} transaction${collected.length === 1 ? "" : "s"} — review & confirm below`, "success");
    }
  }

  function updateScannedRow(idx: number, patch: Partial<ScannedExpense>) {
    setScannedRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeScannedRow(idx: number) {
    setScannedRows((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleConfirmScanned() {
    const toAdd = scannedRows.filter((r) => r.include !== false && Number(r.amount) > 0);
    if (toAdd.length === 0) {
      pushToast("Select at least one transaction to add", "error");
      return;
    }
    setSubmitting(true);
    try {
      for (const row of toAdd) {
        await api.addExpense({ amount: Number(row.amount), description: row.description, date: row.date, category: row.category });
      }
      pushToast(`Added ${toAdd.length} expense${toAdd.length === 1 ? "" : "s"}`, "success");
      setScannedRows((rows) => rows.filter((r) => !toAdd.includes(r)));
      onAdded();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      pushToast("Enter a valid amount", "error");
      return;
    }
    setSubmitting(true);
    try {
      await api.addExpense({
        amount: amt,
        description,
        date,
        category: category || undefined,
      });
      pushToast("Expense added", "success");
      setAmount("");
      setDescription("");
      setCategory("");
      setSuggested(null);
      onAdded();
    } catch (err) {
      pushToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveCategory = category || suggested;
  const quotaLabel =
    mode !== "manual" && aiStatus?.enabled && aiStatus.limits
      ? `${aiStatus.limits.sharedRemainingToday}/${aiStatus.limits.sharedPerDay} AI requests left today`
      : null;

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-1">
        <SectionTitle
          subtitle={
            mode === "manual"
              ? "Auto-categorized as you type"
              : mode === "describe"
                ? "Describe it in plain words"
                : "Upload a payment-app screenshot"
          }
        >
          Add an expense
        </SectionTitle>
        <div className="flex items-center gap-1 self-start sm:self-auto shrink-0 rounded-xl border border-white/10 p-1 bg-white/5">
          <ModeButton active={mode === "manual"} onClick={() => switchMode("manual")} icon={PenLine} label="Manual" />
          <ModeButton
            active={mode === "describe"}
            onClick={() => switchMode("describe")}
            icon={Sparkles}
            label="Describe"
            disabled={!aiStatus?.enabled}
          />
          <ModeButton
            active={mode === "photo"}
            onClick={() => switchMode("photo")}
            icon={Camera}
            label="Photo"
            disabled={!aiStatus?.enabled}
          />
        </div>
      </div>
      {quotaLabel && <div className="text-[11px] text-white/35 mb-4">{quotaLabel}</div>}
      {!quotaLabel && <div className="mb-4" />}

      <AnimatePresence mode="wait">
        {mode === "describe" ? (
          <motion.div key="describe" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <Field label="What happened?" hint='Try "spent 450 on dinner at Barbeque Nation yesterday"'>
              <textarea
                autoFocus
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAiParse();
                  }
                }}
                rows={3}
                placeholder="Paid 200 for chai with friends today…"
                className={inputClass}
              />
            </Field>
            <Button type="button" onClick={handleAiParse} disabled={aiParsing || !aiText.trim()} className="w-full">
              <Sparkles size={15} /> {aiParsing ? "Reading that…" : "Fill in details with AI"}
            </Button>
          </motion.div>
        ) : mode === "photo" ? (
          <motion.div key="photo" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            {scannedRows.length === 0 && (
              <>
                <label
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 py-8 px-4 text-center cursor-pointer transition-colors hover:border-violet-400/40 hover:bg-white/[0.03] ${
                    scanning ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <Camera size={22} className="text-white/40" />
                  <span className="text-sm text-white/60 font-medium">Upload a GPay / PhonePe / bank screenshot</span>
                  <span className="text-xs text-white/35">Daily or monthly spends — AI will read the transactions, you verify before saving</span>
                  <input type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" disabled={scanning} />
                </label>

                {photoFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {photoFiles.map((_, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 group">
                        <img src={photoPreviews[i]} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Button type="button" onClick={handleScanPhotos} disabled={scanning || photoFiles.length === 0} className="w-full">
                  {scanning ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {scanning ? scanProgress || "Scanning…" : `Scan ${photoFiles.length || ""} screenshot${photoFiles.length === 1 ? "" : "s"}`.trim()}
                </Button>
              </>
            )}

            {scannedRows.length > 0 && (
              <ScannedReview
                rows={scannedRows}
                categories={categories}
                onUpdate={updateScannedRow}
                onRemove={removeScannedRow}
                onConfirm={handleConfirmScanned}
                onDiscard={() => setScannedRows([])}
                submitting={submitting}
              />
            )}
          </motion.div>
        ) : (
          <motion.form key="manual" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
              </Field>
            </div>
            <Field label="What was it for?">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Swiggy dinner, Uber to office…"
                className={inputClass}
              />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-white/50">Category</span>
                {suggested && !category && (
                  <span className="text-[11px] text-violet-300 flex items-center gap-1">
                    <Wand2 size={11} /> Suggested: {suggested}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const active = effectiveCategory === c.key;
                  return (
                    <button
                      type="button"
                      key={c.key}
                      onClick={() => setCategory(category === c.key ? "" : c.key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        active ? "border-white/20 text-white" : "border-white/5 text-white/40 hover:text-white/70 hover:border-white/10"
                      }`}
                      style={active ? { backgroundColor: `${c.color}22`, borderColor: `${c.color}55` } : undefined}
                    >
                      <CategoryIcon icon={c.icon} size={12} style={active ? { color: c.color } : undefined} />
                      {c.key}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              <Plus size={15} /> {submitting ? "Adding…" : "Add expense"}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </Card>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={disabled ? "Add OPENAI_API_KEY in server/.env to enable this" : label}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-violet-500/30 to-cyan-500/20 text-white"
          : `text-white/45 hover:text-white/80 ${disabled ? "opacity-40" : ""}`
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function ScannedReview({
  rows,
  categories,
  onUpdate,
  onRemove,
  onConfirm,
  onDiscard,
  submitting,
}: {
  rows: ScannedExpense[];
  categories: CategoryMeta[];
  onUpdate: (idx: number, patch: Partial<ScannedExpense>) => void;
  onRemove: (idx: number) => void;
  onConfirm: () => void;
  onDiscard: () => void;
  submitting: boolean;
}) {
  const includedCount = rows.filter((r) => r.include !== false).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-white/45">
        <CheckCircle2 size={13} className="text-emerald-400" />
        Review what the AI found — uncheck or edit anything before adding.
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
        {rows.map((row, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.include !== false}
                onChange={(e) => onUpdate(i, { include: e.target.checked })}
                className="accent-violet-500 w-4 h-4"
              />
              <input
                type="text"
                value={row.description}
                onChange={(e) => onUpdate(i, { description: e.target.value })}
                className="flex-1 bg-transparent text-sm text-white/85 focus:outline-none border-b border-transparent focus:border-white/20"
              />
              <button type="button" onClick={() => onRemove(i)} className="text-white/25 hover:text-rose-400 shrink-0">
                <Trash2 size={13} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-0 sm:pl-6">
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.amount}
                onChange={(e) => onUpdate(i, { amount: Number(e.target.value) })}
                className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
              <input
                type="date"
                value={row.date}
                onChange={(e) => onUpdate(i, { date: e.target.value })}
                className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
              <select
                value={row.category}
                onChange={(e) => onUpdate(i, { category: e.target.value })}
                className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.key}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onDiscard} className="flex-1">
          Discard
        </Button>
        <Button type="button" onClick={onConfirm} disabled={submitting || includedCount === 0} className="flex-1">
          <Plus size={15} /> {submitting ? "Adding…" : `Add ${includedCount} expense${includedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
