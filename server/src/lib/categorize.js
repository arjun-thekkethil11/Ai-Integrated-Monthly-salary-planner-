// Keyword-based auto-categorization engine, similar in spirit to how apps like
// Slice / bank statement categorizers auto-tag transactions from the merchant text.

export const CATEGORIES = [
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

const KEYWORD_MAP = {
  "Food & Dining": [
    "swiggy", "zomato", "restaurant", "cafe", "coffee", "starbucks", "dominos",
    "pizza", "burger", "kfc", "mcdonald", "food", "dining", "eatery", "dhaba",
    "biryani", "bar", "pub", "brewery", "canteen", "tea", "chai",
  ],
  Groceries: [
    "grocery", "groceries", "bigbasket", "blinkit", "zepto", "dmart", "supermarket",
    "vegetable", "milk", "kirana", "instamart", "reliance fresh", "more supermarket",
  ],
  "Travel & Transport": [
    "uber", "ola", "rapido", "petrol", "diesel", "fuel", "metro", "bus", "train",
    "irctc", "flight", "indigo", "airline", "taxi", "cab", "toll", "parking",
    "travel", "trip", "goibibo", "makemytrip", "yatra", "auto",
  ],
  Shopping: [
    "amazon", "flipkart", "myntra", "ajio", "shopping", "mall", "store", "meesho",
    "nykaa", "electronics", "apparel", "clothing", "shoes", "decathlon", "ikea",
  ],
  Entertainment: [
    "netflix", "prime video", "hotstar", "movie", "cinema", "pvr", "inox", "concert",
    "spotify", "gaming", "steam", "playstation", "xbox", "event", "party", "club",
    "youtube premium",
  ],
  "Bills & Utilities": [
    "electricity", "water bill", "gas bill", "broadband", "wifi", "internet bill",
    "recharge", "mobile bill", "dth", "utility", "airtel", "jio", "vodafone", "bill",
    "postpaid", "prepaid",
  ],
  "Rent & Housing": [
    "rent", "landlord", "housing", "maintenance", "society", "pg fee", "hostel",
  ],
  "Health & Fitness": [
    "pharmacy", "medicine", "hospital", "doctor", "clinic", "gym", "fitness",
    "yoga", "medical", "apollo", "diagnostic", "health", "insurance premium",
    "cult.fit", "protein",
  ],
  Education: [
    "course", "udemy", "coursera", "tuition", "school fee", "college", "book",
    "exam", "certification", "education", "class", "training",
  ],
  "Investments & Savings": [
    "sip", "mutual fund", "stocks", "zerodha", "groww", "investment", "fd",
    "fixed deposit", "ppf", "nps", "gold", "insurance", "upstox",
  ],
  Subscriptions: [
    "subscription", "prime membership", "icloud", "google one", "membership",
    "chatgpt", "openai", "cursor", "adobe", "microsoft 365",
  ],
};

/**
 * Guess the most likely category for an expense based on its free-text description.
 * Falls back to "Other" when nothing matches.
 */
export function autoCategorize(description = "") {
  const text = description.toLowerCase();
  if (!text.trim()) return "Other";

  for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return category;
    }
  }
  return "Other";
}

export function categoryMeta(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

// Categories treated as "essential/committed" spend for the Purchase Planner's
// affordability logic — rent, bills, groceries, health, education and
// investment commitments keep recurring whether or not a purchase happens.
// Everything else (dining out, shopping, entertainment, subscriptions,
// discretionary travel, etc.) is treated as flexible/discretionary spend that
// can realistically be cut back to make room for a purchase.
export const ESSENTIAL_CATEGORIES = new Set([
  "Rent & Housing",
  "Bills & Utilities",
  "Groceries",
  "Health & Fitness",
  "Education",
  "Investments & Savings",
]);

export function isEssentialCategory(key) {
  return ESSENTIAL_CATEGORIES.has(key);
}
