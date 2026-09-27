import type { CategoryMeta } from "../types";

// Mirrors server/src/lib/categorize.js CATEGORIES so the UI can render
// icons/colors synchronously without waiting on a network round-trip.
export const CATEGORIES: CategoryMeta[] = [
  { key: "Food & Dining", color: "#fb923c", icon: "utensils" },
  { key: "Groceries", color: "#34d399", icon: "shopping-basket" },
  { key: "Travel & Transport", color: "#38bdf8", icon: "car" },
  { key: "Shopping", color: "#f472b6", icon: "shopping-bag" },
  { key: "Entertainment", color: "#a78bfa", icon: "film" },
  { key: "Bills & Utilities", color: "#fbbf24", icon: "receipt" },
  { key: "Rent & Housing", color: "#f87171", icon: "home" },
  { key: "Health & Fitness", color: "#4ade80", icon: "heart-pulse" },
  { key: "Education", color: "#60a5fa", icon: "graduation-cap" },
  { key: "Investments & Savings", color: "#2dd4bf", icon: "piggy-bank" },
  { key: "Subscriptions", color: "#c084fc", icon: "repeat" },
  { key: "Other", color: "#94a3b8", icon: "more-horizontal" },
];

export function categoryMetaFor(key: string): CategoryMeta {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}
