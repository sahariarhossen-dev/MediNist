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
  return boxes * spp * pps;
};
