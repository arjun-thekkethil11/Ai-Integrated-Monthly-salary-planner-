import {
  Utensils,
  ShoppingBasket,
  Car,
  ShoppingBag,
  Film,
  Receipt,
  Home,
  HeartPulse,
  GraduationCap,
  PiggyBank,
  Repeat,
  MoreHorizontal,
  type LucideProps,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  utensils: Utensils,
  "shopping-basket": ShoppingBasket,
  car: Car,
  "shopping-bag": ShoppingBag,
  film: Film,
  receipt: Receipt,
  home: Home,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  "piggy-bank": PiggyBank,
  repeat: Repeat,
  "more-horizontal": MoreHorizontal,
};

export function CategoryIcon({ icon, ...props }: { icon: string } & LucideProps) {
  const Icon = ICON_MAP[icon] || MoreHorizontal;
  return <Icon {...props} />;
}
