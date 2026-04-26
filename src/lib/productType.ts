import { supabase } from "@/integrations/supabase/client";

/**
 * Product Type / Format Mapping
 *
 * `unit_format` (display) — verbatim label from the master catalog,
 *   e.g. "Chewable Tablet", "Soft Gelatin Capsule", "Oral Suspension".
 * `product_type` (functional) — canonical category that drives
 *   stock/box/strip/MRP logic: "Tablet" | "Capsule" | "Syrup" | other.
 */

export function toFunctionalType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const s = trimmed.toLowerCase();
  if (s.includes("tablet")) return "Tablet";
  if (s.includes("capsule")) return "Capsule";
  if (s.includes("suspension") || s.includes("syrup")) return "Syrup";
  // Unknown format → pass through verbatim so it becomes a new product_type
  // (e.g. "Eye Drop", "Pediatric Drops", "Metered-Dose Inhaler (MDI)").
  return trimmed;
}

export function getDisplayFormat(med: {
  unit_format?: string | null;
  product_type?: string | null;
}): string {
  return med.unit_format || med.product_type || "";
}

/**
 * Detect functional product type from a medicine name (case-insensitive).
 * Returns null if no keyword matches. Used to auto-fill the Product Type
 * dropdown on the Edit Product screen when the DB value is empty.
 */
export function detectFunctionalTypeFromName(
  name: string | null | undefined
): "Tablet" | "Capsule" | "Syrup" | null {
  if (!name) return null;
  const s = name.toLowerCase();
  if (s.includes("tablet")) return "Tablet";
  if (s.includes("capsule")) return "Capsule";
  if (s.includes("syrup") || s.includes("suspension") || s.includes("oral")) return "Syrup";
  return null;
}

/**
 * Seed types — always present in the dropdown even for a brand-new pharmacy
 * with no inventory yet. Order is preserved at the top of the list.
 */
export const SEED_PRODUCT_TYPES = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Cream",
  "Suspension",
  "Ointment",
] as const;

/**
 * Functional buckets that drive strength input and strip/box visibility.
 */
export function getFunctionalBucket(
  type: string | null | undefined
): "tablet-like" | "liquid" | "topical" | "other" {
  if (!type) return "other";
  const s = type.toLowerCase();
  if (s.includes("tablet") || s.includes("capsule") || s.includes("injection")) return "tablet-like";
  if (s.includes("syrup") || s.includes("suspension")) return "liquid";
  if (s.includes("cream") || s.includes("ointment") || s.includes("gel") || s.includes("lotion")) return "topical";
  return "other";
}

/**
 * Fetch the dynamic list of product types available to a pharmacy.
 * Combines the seed list with every distinct `product_type` already used
 * in this pharmacy's inventory, de-duplicated case-insensitively. Seeds
 * appear first, custom types follow alphabetically.
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