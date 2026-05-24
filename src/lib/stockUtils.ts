/**
 * Tri-Unit Inventory System: Box : Strip : Pcs
 *
 * Internally, stock is always stored as total pieces in the database.
 * Display uses the Box : Strip : Pcs format based on each product's
 * strip_per_pack and pcs_per_strip configuration.
 */

export interface TriUnit {
  boxes: number;
  strips: number;
  pcs: number;
}

/**
 * Pack mode is derived purely from the medicine's actual packaging numbers
 * (mirrors what the master JSON catalog stores). It replaces the previous
 * `product_type === Tablet/Capsule` heuristic so a Syrup that ships in a box
 * of 5 still gets the box UI, and a Tablet sold as a single piece behaves
 * like a single-unit product.
 */
export type PackMode = "single" | "strip" | "box" | "full";

export interface PackInfo {
  pcs_per_strip?: number | null;
  strip_per_pack?: number | null;
}

export const getPackMode = (med: PackInfo | null | undefined): PackMode => {
  const pps = Number(med?.pcs_per_strip ?? 0);
  const spp = Number(med?.strip_per_pack ?? 0);
  const hasStrip = pps > 1;
  const hasBox = spp > 1;
  if (hasStrip && hasBox) return "full";
  if (hasBox) return "box";
  if (hasStrip) return "strip";
  return "single";
};

/**
 * Convert total pieces into a TriUnit breakdown.
 */
export const totalPiecesToTriUnitObj = (
  totalPcs: number,
  stripPerPack: number | null,
  pcsPerStrip: number | null
): TriUnit => {
  const spp = stripPerPack || 1;
  const pps = pcsPerStrip || 1;
  const piecesPerBox = spp * pps;

  const boxes = Math.floor(totalPcs / piecesPerBox);
  const remainder = totalPcs % piecesPerBox;
  const strips = Math.floor(remainder / pps);
  const pcs = remainder % pps;

  return { boxes, strips, pcs };
};

/**
 * Convert total pieces into a formatted "B : S : P" string.
 */
export const totalPiecesToTriUnit = (
  totalPcs: number,
  stripPerPack: number | null,
  pcsPerStrip: number | null
): string => {
  const { boxes, strips, pcs } = totalPiecesToTriUnitObj(totalPcs, stripPerPack, pcsPerStrip);
  return `${boxes} : ${strips} : ${pcs}`;
};

/**
 * Convert total pieces into a labeled "0 • 1 • 5" string.
 * Cleaner display for retail dashboards than the raw "0 : 1 : 5" colon format.
 */
export const totalPiecesToTriUnitLabeled = (
  totalPcs: number,
  stripPerPack: number | null,
  pcsPerStrip: number | null
): string => {
  const { boxes, strips, pcs } = totalPiecesToTriUnitObj(totalPcs, stripPerPack, pcsPerStrip);
  return `${boxes} • ${strips} • ${pcs}`;
};

/**
 * True when a medicine's packaging data indicates a single-unit product
 * (no strip or box subdivisions). Driven by the actual pack numbers, not
 * the product_type string.
 */
export const isSingleUnit = (med: PackInfo | null | undefined): boolean => {
  return getPackMode(med) === "single";
};

/**
 * Convert a number of boxes into total pieces.
 */
export const boxesToPieces = (
  boxes: number,
  stripPerPack: number | null,
  pcsPerStrip: number | null
): number => {
  const spp = stripPerPack || 1;
  const pps = pcsPerStrip || 1;
  return boxes * spp * pps;
};

/**
 * Compute the effective low-stock threshold (in pieces) for a medicine.
 *
 * Rules:
 * - If the user explicitly set `stock_alert > 0`, use that value.
 * - Otherwise, fall back to a smart default based on product_type:
 *   • Tablet / Capsule → one full box (strip_per_pack × pcs_per_strip),
 *     fallback to 10 pieces if pack info is missing.
 *   • Everything else (Syrup, Injection, Cream, Suspension, Ointment, …)
 *     → 2 units.
 */
export const getEffectiveStockAlert = (med: {
  stock_alert?: number | null;
  strip_per_pack?: number | null;
  pcs_per_strip?: number | null;
}): number => {
  if (med.stock_alert && med.stock_alert > 0) return med.stock_alert;

  const spp = med.strip_per_pack || 0;
  const pps = med.pcs_per_strip || 0;
  const oneBox = spp * pps;
  if (oneBox > 0) return oneBox; // multi-unit → 1 box
  return 2; // single-unit → 2 pieces
};

/**
 * Returns true when a medicine's current stock is at or below its
 * effective low-stock threshold.
 */
export const isLowStock = (med: {
  stock_alert?: number | null;
  strip_per_pack?: number | null;
  pcs_per_strip?: number | null;
  stock_quantity?: number | null;
}): boolean => {
  const qty = med.stock_quantity ?? 0;
  return qty <= getEffectiveStockAlert(med);
};
