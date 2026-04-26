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
 * Convert a number of boxes into total pieces.
 */
/**
 * Check if a product type uses single-unit quantity (not Box:Strip:Pcs).
 */
export const isSingleUnit = (productType: string | null): boolean => {
  const triUnitTypes = ["tablet", "capsule"];
  return !triUnitTypes.includes((productType || "").toLowerCase());
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
  product_type?: string | null;
  stock_alert?: number | null;
  strip_per_pack?: number | null;
  pcs_per_strip?: number | null;
}): number => {
  if (med.stock_alert && med.stock_alert > 0) return med.stock_alert;

  const type = (med.product_type || "").toLowerCase();
  if (type === "tablet" || type === "capsule") {
    const spp = med.strip_per_pack || 0;
    const pps = med.pcs_per_strip || 0;
    const oneBox = spp * pps;
    return oneBox > 0 ? oneBox : 10;
  }
  return 2;
};

/**
 * Returns true when a medicine's current stock is at or below its
 * effective low-stock threshold.
 */
export const isLowStock = (med: {
  product_type?: string | null;
  stock_alert?: number | null;
  strip_per_pack?: number | null;
  pcs_per_strip?: number | null;
  stock_quantity?: number | null;
}): boolean => {
  const qty = med.stock_quantity ?? 0;
  return qty <= getEffectiveStockAlert(med);
};
