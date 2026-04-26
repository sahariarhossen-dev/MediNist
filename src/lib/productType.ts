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