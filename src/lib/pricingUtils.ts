/**
 * pricingUtils.ts
 *
 * Centralized, multi-tenant price normalization utility for MediNist.
 * Distinguishes clearly between:
 *  - Unit / Piece Price (selling price per single tablet / capsule / ml / piece)
 *  - Box Price / MRP (selling price per full box or pack)
 *  - Purchase Price per Box (BTP+VAT per full box)
 *  - Purchase Price per Unit (BTP+VAT per piece)
 *
 * Prevents accidental double-multiplication bugs (e.g. box_price * pcs_per_box)
 * when editing in inventory modals or adding to sales carts.
 */

export interface NormalizedPricing {
  unitPrice: number;        // Per-piece selling price (e.g. 7.00 BDT)
  boxPrice: number;         // Per-box selling price / MRP (e.g. 350.00 BDT)
  purchasePriceBox: number; // Purchase price per box including VAT (e.g. 308.00 BDT)
  purchasePriceUnit: number;// Purchase price per piece including VAT (e.g. 6.16 BDT)
  pcsPerBox: number;        // Packaging pieces per box (e.g. 50)
  isBoxPriceDetected: boolean; // True if raw price was identified as an un-divided box price
}

export interface NormalizePricingParams {
  rawPrice?: number | string | null;
  pcsPerBox?: number | null;
  masterUnitPrice?: number | null;
  explicitUnitPrice?: number | null;
  explicitBoxPrice?: number | null;
  explicitPurchasePriceBox?: number | null;
  isBoxPriceInput?: boolean;
  productType?: string | null;
}

/**
 * Standard rounding for currency calculations (2 decimal places).
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * High-precision rounding for unit prices (up to 4 decimal places).
 */
export function roundUnitPrice(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 10000) / 10000;
}

/**
 * Calculates pieces per box from pcs_per_strip and strip_per_pack or explicit packaging.
 */
export function resolvePcsPerBox(item?: {
  pcs_per_strip?: number | null;
  strip_per_pack?: number | null;
  pcsPerBox?: number | null;
  packaging_type?: string | null;
}): number {
  if (!item) return 1;
  if (typeof item.pcsPerBox === "number" && item.pcsPerBox > 0) {
    return Math.floor(item.pcsPerBox);
  }
  const pps = Number(item.pcs_per_strip) || 1;
  const spp = Number(item.strip_per_pack) || 1;
  const total = pps * spp;
  return total > 1 ? total : 1;
}

/**
 * Normalizes pricing for a medicine item across all tenants and contexts.
 */
export function normalizePricing({
  rawPrice,
  pcsPerBox = 1,
  masterUnitPrice,
  explicitUnitPrice,
  explicitBoxPrice,
  explicitPurchasePriceBox,
  isBoxPriceInput = false,
  productType,
}: NormalizePricingParams): NormalizedPricing {
  const pBox = Math.max(1, Number(pcsPerBox) || 1);
  const raw = rawPrice != null && !isNaN(Number(rawPrice)) ? Number(rawPrice) : 0;
  const masterUnit = masterUnitPrice != null && !isNaN(Number(masterUnitPrice)) ? Number(masterUnitPrice) : null;

  let unitPrice = 0;
  let boxPrice = 0;
  let isBoxPriceDetected = false;

  // Case 1: Explicit Unit Price provided
  if (explicitUnitPrice != null && explicitUnitPrice > 0) {
    unitPrice = roundUnitPrice(explicitUnitPrice);
    boxPrice = roundMoney(unitPrice * pBox);
  }
  // Case 2: Explicit Box Price provided
  else if (explicitBoxPrice != null && explicitBoxPrice > 0) {
    boxPrice = roundMoney(explicitBoxPrice);
    unitPrice = pBox > 1 ? roundUnitPrice(boxPrice / pBox) : boxPrice;
    isBoxPriceDetected = true;
  }
  // Case 3: User input directly into a Box Price field (e.g. Sale : in InventoryUpdateModal)
  else if (isBoxPriceInput) {
    boxPrice = roundMoney(raw);
    unitPrice = pBox > 1 ? roundUnitPrice(boxPrice / pBox) : boxPrice;
  }
  // Case 4: Inspecting an existing price (e.g. medicine.price from the database)
  else {
    if (pBox <= 1) {
      // Liquid, syrup, eye drops, or single-unit items: Box Price === Unit Price
      unitPrice = roundMoney(raw);
      boxPrice = unitPrice;
    } else {
      // Strip / Pack / Box items (e.g. 50 pcs/box)
      // Check if raw matches master catalog unit price vs box price
      if (masterUnit != null && masterUnit > 0) {
        const expectedBoxPrice = masterUnit * pBox;
        // If raw price is within 5% of expected box price, it was stored as Box Price!
        if (Math.abs(raw - expectedBoxPrice) <= Math.max(0.5, expectedBoxPrice * 0.05)) {
          isBoxPriceDetected = true;
          boxPrice = roundMoney(raw);
          unitPrice = roundUnitPrice(masterUnit);
        }
        // If raw price is close to master unit price, it is already a Unit Price
        else if (Math.abs(raw - masterUnit) <= Math.max(0.2, masterUnit * 0.1)) {
          unitPrice = roundUnitPrice(raw);
          boxPrice = roundMoney(unitPrice * pBox);
        }
        // If raw price is much higher than master unit price (e.g. > 2.5x master unit), it's likely a box price
        else if (raw > masterUnit * 2.5) {
          isBoxPriceDetected = true;
          boxPrice = roundMoney(raw);
          unitPrice = roundUnitPrice(raw / pBox);
        } else {
          unitPrice = roundUnitPrice(raw);
          boxPrice = roundMoney(unitPrice * pBox);
        }
      } else {
        // Master unit price is not known. Use pharmaceutical packaging heuristics:
        // In Bangladesh, tablets/capsules with pBox >= 10:
        // If raw > 50 and raw / pBox is between 0.50 and 40 Tk:
        // Raw is almost certainly the Box Price (e.g. Chear 50mg, raw = 350, pBox = 50 -> 7 Tk/pc).
        const isTabletOrCapsule = !productType || /\b(tablet|capsule|strip|cap|tab)\b/i.test(productType);
        if (isTabletOrCapsule && pBox >= 8 && raw >= 40 && (raw / pBox) <= 50) {
          isBoxPriceDetected = true;
          boxPrice = roundMoney(raw);
          unitPrice = roundUnitPrice(raw / pBox);
        } else {
          unitPrice = roundUnitPrice(raw);
          boxPrice = roundMoney(unitPrice * pBox);
        }
      }
    }
  }

  // Calculate purchase prices (BTP+VAT)
  let purchasePriceBox: number;
  if (explicitPurchasePriceBox != null && explicitPurchasePriceBox > 0) {
    purchasePriceBox = roundMoney(explicitPurchasePriceBox);
  } else if (boxPrice > 0) {
    // Default trade discount: 12% off Box MRP
    purchasePriceBox = roundMoney(boxPrice * 0.88);
  } else {
    purchasePriceBox = 0;
  }

  const purchasePriceUnit = pBox > 1 ? roundUnitPrice(purchasePriceBox / pBox) : purchasePriceBox;

  return {
    unitPrice,
    boxPrice,
    purchasePriceBox,
    purchasePriceUnit,
    pcsPerBox: pBox,
    isBoxPriceDetected,
  };
}

/**
 * Resolves the unit selling price for any cart item or inventory item:
 * Strictly prioritizes:
 *   1. Explicit piece_price / unit_price
 *   2. box_price / pcs_per_box
 *   3. Normalized medicine.price
 */
export function resolveItemSellingPrice(item: {
  piece_price?: number | null;
  unit_price?: number | null;
  box_price?: number | null;
  price?: number | null;
  pcs_per_strip?: number | null;
  strip_per_pack?: number | null;
  pcsPerBox?: number | null;
  product_type?: string | null;
  unit_format?: string | null;
}): number {
  if (typeof item.piece_price === "number" && item.piece_price > 0) {
    return roundUnitPrice(item.piece_price);
  }
  if (typeof item.unit_price === "number" && item.unit_price > 0) {
    return roundUnitPrice(item.unit_price);
  }

  const pBox = resolvePcsPerBox(item);

  if (typeof item.box_price === "number" && item.box_price > 0) {
    return pBox > 1 ? roundUnitPrice(item.box_price / pBox) : roundUnitPrice(item.box_price);
  }

  // Fallback to normalized price
  const normalized = normalizePricing({
    rawPrice: item.price,
    pcsPerBox: pBox,
    productType: item.product_type || item.unit_format,
  });

  return normalized.unitPrice;
}
