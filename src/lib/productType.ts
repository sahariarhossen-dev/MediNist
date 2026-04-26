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
  const s = raw.toLowerCase();
  if (s.includes("tablet")) return "Tablet";
  if (s.includes("capsule")) return "Capsule";
  if (s.includes("suspension") || s.includes("syrup")) return "Syrup";
  return raw;
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