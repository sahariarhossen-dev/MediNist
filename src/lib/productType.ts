import { supabase } from "@/integrations/supabase/client";

/**
 * Product Type / Format Mapping
 *
 * `unit_format` (display) — verbatim label from the master catalog or user
 *   input, e.g. "Chewable Tablet", "Soft Gelatin Capsule",
 *   "Dry Powder Inhalation Capsule", "Oral Suspension".
 * `product_type` (functional / standardized) — one of the seven Standard
 *   Categories below, derived via {@link getStandardizedType}. Drives all
 *   UI grouping, chip colors, strip/box logic, and stock-alert defaults.
 */

/** The seven standard categories every product is bucketed into. */
export type StandardCategory =
  | "Tablet"
  | "Capsule"
  | "Syrup"
  | "Injection"
  | "Inhaler"
  | "Topical"
  | "Other";

export const STANDARD_CATEGORIES: StandardCategory[] = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Inhaler",
  "Topical",
  "Other",
];

// Keyword priority — first match wins. Order matters so that
// "Inhalation Capsule" → Capsule (not Inhaler) and "Oral Suspension" → Syrup.
const CATEGORY_PATTERNS: Array<{ category: StandardCategory; pattern: RegExp }> = [
  { category: "Capsule", pattern: /\b(capsules?|softgels?|soft\s*gelatin|caps?)\b/i },
  { category: "Tablet", pattern: /\b(tablets?|tabs?|bolus)\b/i },
  { category: "Syrup", pattern: /\b(suspension|syrup|oral\s*liquid|solution)\b/i },
  { category: "Injection", pattern: /\b(injection|iv|im|vial|ampoule|ampule)\b/i },
  { category: "Inhaler", pattern: /\b(inhaler|inhalation|mdi|dpi|aerosol|respule|nebul\w*)\b/i },
  { category: "Topical", pattern: /\b(cream|ointment|gel|lotion)\b/i },
];

/**
 * Map any raw product_type / unit_format / catalog format string to a
 * Standard Category using priority-ordered keyword matching.
 *   "Dry Powder Inhalation Capsule" → "Capsule"
 *   "Soft Gelatin Capsule"          → "Capsule"
 *   "Chewable Tablet"               → "Tablet"
 *   "Oral Suspension"               → "Syrup"
 *   "MDI Aerosol"                   → "Inhaler"
 *   "IV Vial"                       → "Injection"
 *   "Eye Drop"                      → "Other"
 */
export function getStandardizedType(
  raw: string | null | undefined
): StandardCategory {
  if (!raw) return "Other";
  const s = raw.trim();
  if (!s) return "Other";
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(s)) return category;
  }
  return "Other";
}

/**
 * Tablet and Capsule are the only categories that use the
 * Pcs × Strip × Box tri-unit inventory model. Everything else uses
 * single-unit quantities (vials, bottles, tubes, puffs, etc.).
 */
export function isTriUnitCategory(
  category: string | null | undefined
): boolean {
  const std = getStandardizedType(category);
  return std === "Tablet" || std === "Capsule";
}

/**
 * Legacy alias — returns the standardized category for a raw catalog/user
 * string. Always returns one of the seven standard categories.
 */
export function toFunctionalType(
  raw: string | null | undefined
): StandardCategory {
  return getStandardizedType(raw);
}

export function getDisplayFormat(med: {
  unit_format?: string | null;
  product_type?: string | null;
}): string {
  return med.unit_format || med.product_type || "";
}

/**
 * Detect functional product type from a medicine name. Returns null if no
 * keyword matches. Used to auto-fill the Product Type dropdown on the
 * Edit Product screen when the DB value is empty.
 */
export function detectFunctionalTypeFromName(
  name: string | null | undefined
): StandardCategory | null {
  if (!name) return null;
  const std = getStandardizedType(name);
  return std === "Other" ? null : std;
}

/**
 * Seed types — always present in the dropdown for a brand-new pharmacy.
 * The six concrete Standard Categories appear first in priority order.
 */
export const SEED_PRODUCT_TYPES: readonly StandardCategory[] = STANDARD_CATEGORIES.filter(
  (c) => c !== "Other"
);

/**
 * Functional buckets that drive strength input and strip/box visibility.
 */
export function getFunctionalBucket(
  type: string | null | undefined
): "tablet-like" | "liquid" | "topical" | "inhaler" | "other" {
  switch (getStandardizedType(type)) {
    case "Tablet":
    case "Capsule":
    case "Injection":
      return "tablet-like";
    case "Syrup":
      return "liquid";
    case "Topical":
      return "topical";
    case "Inhaler":
      return "inhaler";
    default:
      return "other";
  }
}

/**
 * Tailwind chip classes (background + text) for a product type.
 * Driven by the Standard Category so any technical string still resolves
 * to a consistent color family across the app.
 */
export function getProductTypeChipClasses(type: string | null | undefined): string {
  switch (getStandardizedType(type)) {
    case "Tablet":    return "bg-blue-50 text-blue-700";
    case "Capsule":   return "bg-purple-50 text-purple-700";
    case "Syrup":     return "bg-amber-50 text-amber-700";
    case "Injection": return "bg-rose-50 text-rose-700";
    case "Topical":   return "bg-teal-50 text-teal-700";
    case "Inhaler":   return "bg-indigo-50 text-indigo-700";
    default:          return "bg-gray-100 text-gray-600";
  }
}

/**
 * Fetch the dynamic list of product types available to a pharmacy.
 * Always returns the six Standard Categories first (priority order), then
 * any genuinely custom types this pharmacy has saved (e.g. "Eye Drop")
 * sorted alphabetically. Existing inventory rows that map to a standard
 * category (e.g. "Soft Gelatin Capsule" → Capsule) are deduped into that
 * standard bucket so the dropdown stays clean.
 */
export async function fetchPharmacyProductTypes(
  pharmacyId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("medicines")
    .select("product_type")
    .eq("pharmacy_id", pharmacyId)
    .not("product_type", "is", null);

  const seen = new Map<string, string>(); // lowerKey -> displayValue
  for (const t of SEED_PRODUCT_TYPES) seen.set(t.toLowerCase(), t);

  if (!error && data) {
    const customs: string[] = [];
    for (const row of data as Array<{ product_type: string | null }>) {
      const v = (row.product_type || "").trim();
      if (!v) continue;
      // Anything that maps to a known standard category is already covered.
      if (getStandardizedType(v) !== "Other") continue;
      const key = v.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, v);
        customs.push(v);
      }
    }
    customs.sort((a, b) => a.localeCompare(b));
    return [...SEED_PRODUCT_TYPES, ...customs];
  }

  return [...SEED_PRODUCT_TYPES];
}
