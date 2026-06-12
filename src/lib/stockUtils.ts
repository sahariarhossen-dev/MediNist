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
 * Friendly long-form breakdown: "10 Boxes, 4 Strips, 2 Pcs".
 * Skips zero parts and singularizes "1 Box" / "1 Strip" / "1 Pc".
 * Falls back to "0 Pcs" when everything is zero.
 */
export const totalPiecesToTriUnitWords = (
  totalPcs: number,
  stripPerPack: number | null,
  pcsPerStrip: number | null
): string => {
  const { boxes, strips, pcs } = totalPiecesToTriUnitObj(totalPcs, stripPerPack, pcsPerStrip);
  const parts: string[] = [];
  if (boxes > 0) parts.push(`${boxes} ${boxes === 1 ? "Box" : "Boxes"}`);
  if (strips > 0) parts.push(`${strips} ${strips === 1 ? "Strip" : "Strips"}`);
  if (pcs > 0) parts.push(`${pcs} ${pcs === 1 ? "Pc" : "Pcs"}`);
  return parts.length ? parts.join(", ") : "0 Pcs";
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
 * Single-source-of-truth UI rule for "is this a single-unit product?".
 *
 * Defensive over `isSingleUnit`: also returns true when the row has no box
 * subdivision (`strip_per_pack` empty) AND its product_type is a format that
 * is intrinsically a single whole unit (Drops, Syrups, Creams, Inhalers,
 * Suspensions, Ointments, Gels, Lotions, Sprays, Solutions, Shampoos),
 * even if a stale `pcs_per_strip` value is still attached from legacy imports.
 */
const SINGLE_UNIT_TYPE_RE =
  /drop|syrup|suspension|cream|ointment|gel|lotion|inhaler|spray|solution|shampoo/i;

/**
 * Tablet / Capsule are always strip-based at the UI layer, even if their
 * pack fields are temporarily null due to stale data. Hard-guard them.
 */
const STRIP_ONLY_TYPE_RE = /^\s*(tablet|capsule)s?\s*$/i;

export const looksSingleUnit = (
  med:
    | (PackInfo & { product_type?: string | null; unit_format?: string | null; format?: string | null })
    | null
    | undefined
): boolean => {
  // Hard rule: a Tablet or Capsule is never single-unit.
  const typeRaw = (med?.product_type ?? med?.format ?? "").toString();
  if (STRIP_ONLY_TYPE_RE.test(typeRaw)) return false;

  if (isSingleUnit(med)) return true;
  const spp = Number(med?.strip_per_pack ?? 0);
  if (spp > 1) return false; // has a real box subdivision → not single
  const typeStr = `${med?.product_type ?? ""} ${med?.unit_format ?? ""} ${med?.format ?? ""}`;
  return SINGLE_UNIT_TYPE_RE.test(typeStr);
};

/**
 * Parse a raw pack/box size string from the master catalog (e.g. "10s",
 * "100s", "1", "30ml", "N/A") into a positive integer count. Returns null
 * when the value is missing, "N/A", or has no leading number.
 */
export const parsePackSize = (val: string | null | undefined): number | null => {
  if (!val || val === "N/A") return null;
  const match = String(val).match(/(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface CatalogPackInput {
  pack_size?: string | null;
  box_size?: string | null;
}

export interface CatalogPackClassification {
  mode: PackMode;
  pcs_per_strip: number | null;
  strip_per_pack: number | null;
}

/**
 * Centralized rule that decides whether a catalog medicine should be
 * persisted in `medicines` as a single whole unit (Syrup, Drop, Cream,
 * "30s pot" sold as one pack) or as a strip/box-divided product.
 *
 * Rules:
 * - `box_size` ≤ 1 (or missing) → SINGLE, regardless of `pack_size`.
 *   A 30s pot of Allion Gold is one unit, not 30 strips.
 * - `box_size` > 1 and `pack_size` > 1 → FULL strip+box.
 * - `box_size` > 1 with no usable `pack_size` → BOX only.
 * - Anything else falls back to SINGLE.
 */
export const classifyCatalogPack = (
  input: CatalogPackInput
): CatalogPackClassification => {
  const box = parsePackSize(input.box_size);
  const pack = parsePackSize(input.pack_size);

  // Single whole unit — no internal strip divisions.
  if (!box || box <= 1) {
    return { mode: "single", pcs_per_strip: null, strip_per_pack: null };
  }

  if (pack && pack > 1) {
    const strips = Math.floor(box / pack);
    if (strips > 1) {
      return { mode: "full", pcs_per_strip: pack, strip_per_pack: strips };
    }
    // box divisible into a single strip → treat as plain box of pieces
    return { mode: "box", pcs_per_strip: null, strip_per_pack: box };
  }

  // box > 1 with no strip info → flat box of N pieces
  return { mode: "box", pcs_per_strip: null, strip_per_pack: box };
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
