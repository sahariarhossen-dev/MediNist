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
    | (PackInfo & {
        product_type?: string | null;
        unit_format?: string | null;
        format?: string | null;
        is_splittable?: boolean | null;
        isSplittable?: boolean | null;
        packaging_type?: string | null;
        pack_size?: string | null;
      })
    | null
    | undefined
): boolean => {
  if (med?.is_splittable === false || med?.isSplittable === false || med?.packaging_type === "pot") {
    return true;
  }

  // Hard rule: a Tablet or Capsule is never single-unit unless it is a sealed non-splittable pot/pack
  const typeRaw = (med?.product_type ?? med?.format ?? "").toString();
  if (STRIP_ONLY_TYPE_RE.test(typeRaw)) {
    const packStr = (med?.pack_size || "").toLowerCase();
    if (/\b(pack|pot|container|bottle|jar)\b/i.test(packStr) && !/\bstrip\b/i.test(packStr)) {
      return true;
    }
    return false;
  }

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
  format?: string | null;
  product_type?: string | null;
  unit_format?: string | null;
}

export interface CatalogPackClassification {
  mode: PackMode;
  pcs_per_strip: number | null;
  strip_per_pack: number | null;
}

/**
 * Parse a MedEx-style "NxM" pack string (e.g. "5 x 10", "20×10", "10 X 14")
 * into `{ strip_per_pack, pcs_per_strip }`.
 *
 * MedEx convention: the FIRST number is the number of strips in a box, and
 * the SECOND number is the pieces per strip. Never swap these.
 * Returns null when the string does not contain an NxM pair.
 */
export const parseNxMPack = (
  pack: string | null | undefined
): { strip_per_pack: number; pcs_per_strip: number } | null => {
  if (!pack) return null;
  const m = String(pack).match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (!m) return null;
  const spp = parseInt(m[1], 10);
  const pps = parseInt(m[2], 10);
  if (!Number.isFinite(spp) || !Number.isFinite(pps) || spp <= 0 || pps <= 0) {
    return null;
  }
  return { strip_per_pack: spp, pcs_per_strip: pps };
};

/**
 * Centralized rule that decides whether a catalog medicine should be
 * persisted in `medicines` as a single whole unit (Syrup, Drop, Cream,
 * "30s pot" sold as one pack) or as a strip/box-divided product.
 *
 * Rules:
 * - Liquid/Bottles/Sprays (Syrup, Spray, Inhaler, Drops, Ointment) → single unit, never multiplied.
 * - Strip Tablets (e.g. '12s strip') → only allow loose/strip unit calculation if pack_size explicitly contains 'strip'.
 * - Pots / Sealed Pack Tablets (e.g. '30s pack', '60s pot') → single unit pot pack.
 */
export const classifyCatalogPack = (
  input: CatalogPackInput
): CatalogPackClassification => {
  const formatStr = `${input.format || ""} ${input.product_type || ""} ${input.unit_format || ""}`.toLowerCase();
  const packStr = (input.pack_size || "").toLowerCase();

  // 1. Liquid/Bottles/Sprays: strictly single unit, never multiply volume
  const isLiquidOrSpray =
    /\b(syrup|suspension|spray|inhaler|inhalation|drops?|ointment|cream|gel|lotion|liquid|solution|mouthwash|wash|shampoo)\b/i.test(formatStr) ||
    (/\b\d+(?:\.\d+)?\s*ml\b/i.test(packStr) && !/\b(tablet|capsule)\b/i.test(formatStr));

  if (isLiquidOrSpray) {
    return { mode: "single", pcs_per_strip: null, strip_per_pack: null };
  }

  // 2. Strip Tablets (only allow loose/strip unit calculation if pack_size explicitly contains 'strip')
  const hasStrip = /\bstrip\b/i.test(packStr);
  const hasPackPot = /\b(pack|pot|container|bottle|jar)\b/i.test(packStr);

  // If pack_size contains terms like 'pack', 'pot', 'container', or 'bottle' without 'strip'
  // treat it as a non-splittable Pot/Pack
  if (hasPackPot && !hasStrip) {
    const potMatch =
      input.pack_size?.match(/(\d+)\s*'?s?\s*(?:pack|pot|container|bottle|jar)\b/i) ||
      input.pack_size?.match(/(\d+)\s*'?s\b/i) ||
      input.pack_size?.match(/(\d+)/);
    const potCount = potMatch ? parseInt(potMatch[1], 10) : 1;
    return {
      mode: "single",
      pcs_per_strip: 1,
      strip_per_pack: potCount > 1 ? potCount : null,
    };
  }

  // 3. NxM is the source of truth when present.
  const nxm = parseNxMPack(input.pack_size);
  if (nxm) {
    if (nxm.strip_per_pack > 1) {
      return {
        mode: "full",
        pcs_per_strip: nxm.pcs_per_strip,
        strip_per_pack: nxm.strip_per_pack,
      };
    }
    // "1 x M" → single strip of M pieces
    return {
      mode: "strip",
      pcs_per_strip: nxm.pcs_per_strip,
      strip_per_pack: 1,
    };
  }

  if (hasStrip) {
    const stripMatch = input.pack_size?.match(/(\d+)\s*'?s?\s*strip/i);
    if (stripMatch) {
      const pps = parseInt(stripMatch[1], 10);
      return {
        mode: "strip",
        pcs_per_strip: pps > 1 ? pps : 1,
        strip_per_pack: 1,
      };
    }
  }

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

export interface PotItemInfo {
  isPot: boolean;
  potSize: number;
  potLabel: string;
}

/**
 * Identify Pot / Container / Bottle type medicines (e.g., Neuro-B 60s, Bextram Gold 30s)
 * which cannot be opened to sell loose single tablets and must be sold in full pot multiples.
 */
export const getPotItemInfo = (
  med:
    | {
        name?: string | null;
        product_type?: string | null;
        unit_format?: string | null;
        format?: string | null;
        packaging_type?: string | null;
        pack_size?: string | null;
        box_size?: string | null;
        pcs_per_strip?: number | null;
        strip_per_pack?: number | null;
        product_size?: string | null;
        is_splittable?: boolean | null;
        isSplittable?: boolean | null;
      }
    | null
    | undefined
): PotItemInfo => {
  if (!med) return { isPot: false, potSize: 1, potLabel: "" };

  const name = (med.name || "").trim();
  const pkgType = (med.packaging_type || "").toLowerCase();
  const unitFmt = (med.unit_format || "").toLowerCase();
  const prodType = (med.product_type || "").toLowerCase();
  const formatStr = (med.format || "").toLowerCase();
  const packSizeStr = (med.pack_size || "").toLowerCase();
  const prodSizeStr = (med.product_size || "").toLowerCase();

  // 1. Liquid/Bottles/Sprays (Syrup, Spray, Inhaler, Drops, Ointment):
  // They are single liquid/topical units, not tablet pots.
  const isLiquidOrSpray =
    /\b(syrup|suspension|spray|inhaler|inhalation|drops?|ointment|cream|gel|lotion|liquid|solution|mouthwash|wash|shampoo)\b/i.test(
      `${prodType} ${formatStr} ${unitFmt} ${name}`
    ) ||
    (/\b\d+(?:\.\d+)?\s*ml\b/i.test(packSizeStr) && !/\b(tablet|capsule)\b/i.test(`${prodType} ${formatStr} ${unitFmt}`));
  if (isLiquidOrSpray) {
    return { isPot: false, potSize: 1, potLabel: "" };
  }

  // 2. Strip Tablets (e.g. '12s strip'):
  // If pack_size explicitly contains 'strip', it is a strip unit, not a pot.
  if (/\bstrip\b/i.test(packSizeStr)) {
    return { isPot: false, potSize: 1, potLabel: "" };
  }

  const combinedMeta = `${pkgType} ${unitFmt} ${prodType} ${formatStr} ${packSizeStr}`;
  const hasExplicitPotKeyword = /\b(pack|pot|container|bottle|jar)\b/i.test(combinedMeta);
  const nameHasPotKeyword = /\b(pack|pot|container|bottle|jar)\b/i.test(name);
  const isMarkedSinglePot = /\bsingle-unit\/pot\b/i.test(`${unitFmt} ${prodType} ${formatStr}`) || pkgType === "pot";

  const pps = Number(med.pcs_per_strip ?? 0);
  const spp = Number(med.strip_per_pack ?? 0);

  // Normal blister strip tablets/capsules (e.g. 10x10):
  // If pps > 1 and spp > 1 and no explicit pot indicator, it is a blister strip and loose sale is allowed.
  if (pps > 1 && spp > 1 && !hasExplicitPotKeyword && !nameHasPotKeyword && !isMarkedSinglePot) {
    return { isPot: false, potSize: 1, potLabel: "" };
  }

  // Candidate pot size extraction:
  const packParsed = parsePackSize(med.pack_size);
  const boxParsed = parsePackSize(med.box_size);
  const nameCountMatch = `${name} ${prodSizeStr} ${packSizeStr}`.match(/\b(\d+)\s*'?s\b/i);
  const nameCount = nameCountMatch ? parseInt(nameCountMatch[1], 10) : null;

  let candidatePotSize: number | null = null;
  if (pps === 1 && spp > 1) {
    candidatePotSize = spp;
  } else if (spp === 1 && pps > 1 && (hasExplicitPotKeyword || nameHasPotKeyword || isMarkedSinglePot || nameCount)) {
    candidatePotSize = pps;
  } else if (boxParsed && boxParsed > 1 && (pps <= 1 || hasExplicitPotKeyword || nameHasPotKeyword || isMarkedSinglePot)) {
    candidatePotSize = boxParsed;
  } else if (packParsed && packParsed > 1 && (pps <= 1 || hasExplicitPotKeyword || nameHasPotKeyword || isMarkedSinglePot)) {
    candidatePotSize = packParsed;
  } else if (nameCount && nameCount > 1 && (pps <= 1 || hasExplicitPotKeyword || nameHasPotKeyword || isMarkedSinglePot)) {
    candidatePotSize = nameCount;
  }

  // Qualifies as a pot if candidate size > 1 AND:
  // - Explicit pack/pot/container/bottle keyword, OR
  // - Marked as single-unit/pot or is_splittable === false, OR
  // - Pcs per Strip = 1 with a fixed box/pot size (e.g. 60 pcs, 30 pcs), OR
  // - Name/pack indicates fixed count (e.g. 60s, 30s) without blister strips
  const isPot = Boolean(
    candidatePotSize &&
      candidatePotSize > 1 &&
      (hasExplicitPotKeyword ||
        nameHasPotKeyword ||
        isMarkedSinglePot ||
        med.is_splittable === false ||
        med.isSplittable === false ||
        (pps <= 1 && (spp > 1 || (boxParsed && boxParsed > 1) || (nameCount && nameCount > 1))) ||
        (nameCount && nameCount > 1 && spp <= 1))
  );

  if (isPot && candidatePotSize && candidatePotSize > 1) {
    const fullText = `${name} ${combinedMeta}`.toLowerCase();
    let potLabel = "Pot";
    if (/\bbottle\b/i.test(fullText)) potLabel = "Bottle";
    else if (/\bcontainer\b/i.test(fullText)) potLabel = "Container";
    else if (/\bjar\b/i.test(fullText)) potLabel = "Jar";
    else if (/\bpack\b/i.test(fullText)) potLabel = "Pack";

    return {
      isPot: true,
      potSize: candidatePotSize,
      potLabel,
    };
  }

  return { isPot: false, potSize: 1, potLabel: "" };
};

/**
 * Validate and compute snap for a pot sale quantity.
 */
export const validatePotSaleQuantity = (
  qty: number,
  potInfo: PotItemInfo
): { isValid: boolean; message: string; snappedQty: number } => {
  if (!potInfo.isPot || potInfo.potSize <= 1) {
    const validQty = Math.max(1, Math.floor(qty) || 1);
    return { isValid: true, message: "", snappedQty: validQty };
  }

  const { potSize, potLabel } = potInfo;
  const isMultiple = qty > 0 && qty % potSize === 0;

  if (isMultiple) {
    return { isValid: true, message: "", snappedQty: qty };
  }

  let snappedQty = Math.round(qty / potSize) * potSize;
  if (snappedQty < potSize) {
    snappedQty = potSize;
  }

  const message = `Cannot sell loose tablets for this ${potLabel.toLowerCase()} item. Must be sold as full ${potLabel.toLowerCase()} (${potSize} pcs).`;
  return { isValid: false, message, snappedQty };
};

/**
 * Step pot quantity up or down by 1 full pot (potSize).
 */
export const getPotSteppedQuantity = (
  currentQty: number,
  direction: "up" | "down",
  potInfo: PotItemInfo
): number => {
  if (!potInfo.isPot || potInfo.potSize <= 1) {
    return direction === "up" ? currentQty + 1 : Math.max(1, currentQty - 1);
  }

  const { potSize } = potInfo;
  if (direction === "up") {
    const currentPots = Math.floor(currentQty / potSize);
    return Math.max(potSize, (currentPots + 1) * potSize);
  } else {
    const currentPots = Math.ceil(currentQty / potSize);
    return Math.max(potSize, (currentPots - 1) * potSize);
  }
};

/**
 * Display formatted pot count with piece count.
 */
export const formatPotQuantityDisplay = (
  qty: number,
  potInfo: PotItemInfo
): string => {
  if (!potInfo.isPot || potInfo.potSize <= 1) {
    return `${qty} pcs`;
  }
  const pots = qty / potInfo.potSize;
  const isWhole = Number.isInteger(pots);
  const potUnit = pots === 1 ? potInfo.potLabel : `${potInfo.potLabel}s`;
  if (isWhole && pots > 0) {
    return `${pots} ${potUnit} (${qty} pcs)`;
  }
  return `${qty} pcs (loose invalid)`;
};

/**
 * Calculate total pieces for a cart item quantity.
 * For pot/bottle items, cart quantity represents number of pots/bottles.
 * For regular items, cart quantity represents pieces directly.
 */
export const getCartItemPieces = (qty: number, potInfo: PotItemInfo): number => {
  const safeQty = Math.max(1, Math.floor(qty) || 1);
  return potInfo.isPot ? safeQty * potInfo.potSize : safeQty;
};

/**
 * Calculate gross line total for a cart item before discounts.
 * unitPrice is the price per piece (as stored in the database).
 */
export const getCartItemLineTotal = (
  qty: number,
  unitPrice: number,
  potInfo: PotItemInfo
): number => {
  const pieces = getCartItemPieces(qty, potInfo);
  return pieces * (unitPrice || 0);
};

