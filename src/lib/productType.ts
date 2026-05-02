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
  | "Powder"
  | "Other";

export const STANDARD_CATEGORIES: StandardCategory[] = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Inhaler",
  "Topical",
  "Powder",
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
  { category: "Powder", pattern: /\b(powder|sachet|granules?|effervescent)\b/i },
];

/**
 * True when the raw product type / unit format string represents a
 * powder-like product (Effervescent Powder, Sachet, Granules, etc.).
 * Powders are inventoried as single units (containers / sachets) and
 * never use the strip/box tri-unit model.
 */
export function isPowderType(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.toLowerCase();
  // "Dry Powder Inhalation Capsule" should NOT count as a powder for inventory
  // purposes — it's still a capsule.
  if (/\b(capsules?|tablets?|inhal\w*)\b/.test(s)) return false;
  return /\b(powder|sachet|granules?|effervescent)\b/.test(s);
}

/** Allowed unit labels for powder-like products. */
export const POWDER_UNIT_OPTIONS = ["Container", "Sachet", "Jar", "Bottle", "Tin"] as const;
export type PowderUnit = (typeof POWDER_UNIT_OPTIONS)[number];

/**
 * Detect the most likely physical unit for a powder product from its
 * pack_size / product_size string. Defaults to "Container".
 */
export function detectPowderUnit(packSize: string | null | undefined): PowderUnit {
  const s = (packSize || "").toLowerCase();
  if (/sachet/.test(s)) return "Sachet";
  if (/jar/.test(s)) return "Jar";
  if (/bottle/.test(s)) return "Bottle";
  if (/\btin\b/.test(s)) return "Tin";
  return "Container";
}

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
 * Title-case a free-form custom product type for badge display.
 * "suppository" → "Suppository", "EYE DROP" → "Eye Drop",
 * "pediatric drops" → "Pediatric Drops".
 */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Display label for the product-type badge. Unlike {@link getStandardizedType}
 * (which collapses everything to one of seven buckets for *logic*), this
 * helper preserves real custom values like "Suppository", "Pediatric",
 * "Eye Drop" so the badge never falsely shows "Other" when the database
 * actually has a value. Truncated to 14 chars for mobile row layouts;
 * full string remains available via the `title` attribute.
 */
export function getDisplayCategory(
  raw: string | null | undefined
): string {
  if (!raw) return "";
  const s = raw.trim();
  if (!s) return "";
  // If it maps to a known standard bucket, use the short standard name
  // (so "Soft Gelatin Capsule" still chips as "Capsule").
  const std = getStandardizedType(s);
  if (std !== "Other") return std;
  // Otherwise show the user's actual value, title-cased + truncated.
  const pretty = titleCase(s);
  return pretty.length > 14 ? pretty.slice(0, 13) + "…" : pretty;
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
): "tablet-like" | "liquid" | "topical" | "inhaler" | "powder" | "other" {
  if (isPowderType(type)) return "powder";
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
  const std = getStandardizedType(type);
  switch (std) {
    case "Tablet":    return "bg-blue-50 text-blue-700";
    case "Capsule":   return "bg-purple-50 text-purple-700";
    case "Syrup":     return "bg-amber-50 text-amber-700";
    case "Injection": return "bg-rose-50 text-rose-700";
    case "Topical":   return "bg-teal-50 text-teal-700";
    case "Inhaler":   return "bg-indigo-50 text-indigo-700";
    case "Powder":    return "bg-orange-50 text-orange-700";
    default: {
      // Custom (unmapped) types — give them a neutral but intentional chip
      // instead of the washed-out "Other" gray, with a couple of soft
      // hints for the most common Bangladeshi pharmacy form factors.
      const s = (type || "").toLowerCase();
      if (/\bsuppositor/.test(s)) return "bg-pink-50 text-pink-700";
      if (/\bdrops?\b/.test(s)) return "bg-cyan-50 text-cyan-700";
      if (/\b(powder|sachet)\b/.test(s)) return "bg-orange-50 text-orange-700";
      if (/\bpediatric\b/.test(s)) return "bg-emerald-50 text-emerald-700";
      if (s.trim()) return "bg-slate-100 text-slate-700";
      return "bg-gray-100 text-gray-600";
    }
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
