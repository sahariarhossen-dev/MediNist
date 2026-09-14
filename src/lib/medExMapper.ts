/**
 * MedEx → MediNist Data Mapping Layer
 *
 * Single source of truth for converting raw MedEx product data (either an
 * HTML page string or an already-parsed JSON-ish object) into a clean
 * payload that aligns with:
 *   - the Add Product form fields (`AddProduct.tsx` location.state)
 *   - the `master_medicines` / `medicines` DB columns
 *
 * Format-aware: strip-based products (Tablet, Capsule) compute
 * pcs/strip × strips/box; single-unit products (Syrup, Injection, Cream,
 * Drops, Inhaler, Ointment, Gel, Suspension, ...) gracefully default to
 * pcsPerStrip=1, stripPerBox=1, pcsPerBox=1.
 */

import { getStandardizedType, type StandardCategory } from "@/lib/productType";
import { parseNxMPack } from "@/lib/stockUtils";
import { roundMoney } from "@/lib/formatUtils";

export type MedExFormat = "strip" | "liquid" | "semisolid" | "single";

/**
 * Loose shape for pre-parsed MedEx data (e.g. rows read from
 * `master_medicines`, or JSON extracted by an external scraper).
 */
export interface MedExRawData {
  brand_name?: string | null;
  brandName?: string | null;
  name?: string | null;

  generic_name?: string | null;
  genericName?: string | null;
  generic?: string | null;

  company?: string | null;
  company_name?: string | null;
  manufacturer?: string | null;

  strength?: string | null;
  strength_text?: string | null;

  format?: string | null;
  product_type?: string | null;
  unit_format?: string | null;
  brand_title?: string | null; // e.g. "Napa Extra Tablet"

  pack_size?: string | null;
  pack_text?: string | null;

  unit_price?: number | string | null;
  unitPrice?: number | string | null;

  strip_price?: number | string | null;
  pack_total?: number | string | null;

  pcs_per_strip?: number | null;
  strip_per_pack?: number | null;

  medex_url?: string | null;
  medexUrl?: string | null;
}

export interface MedExMappedPayload {
  /** MedEx brand name → Add Product `name` field. */
  name: string;
  /** MedEx generic name (may be null). */
  genericName: string | null;
  /** MedEx manufacturer → `companyName`. */
  companyName: string | null;

  /** Verbatim MedEx form label, e.g. "Chewable Tablet", "Pediatric Drops". */
  unitFormat: string | null;
  /** Standardized category driving UI logic (`getStandardizedType`). */
  productType: StandardCategory;
  /** High-level format bucket used for pack math. */
  format: MedExFormat;

  /** Raw strength string, e.g. "40 mg+500 mg+250 mg+100 mg". */
  strength: string | null;
  /** First numeric component, e.g. 40 (from "40 mg+..."). */
  strengthNumeric: number | null;
  /** Unit of the first numeric component, e.g. "mg". */
  strengthUnit: string | null;

  /** Pieces per strip. Defaults to 1 for single-unit products. */
  pcsPerStrip: number;
  /** Strips per box. Defaults to 1 for single-unit products. */
  stripPerBox: number;
  /** Total pieces per box (pcsPerStrip × stripPerBox). Always ≥ 1. */
  pcsPerBox: number;

  /** Original MedEx pack text, preserved for provenance/tooltips. */
  packSizeText: string | null;

  /** Per-piece price (MedEx "Unit Price"). */
  unitPrice: number | null;
  /** Per-box / total price = unitPrice × pcsPerBox (or 1 Pot Price / single bottle price), rounded to 2 dp. */
  boxPrice: number | null;

  medexUrl: string | null;

  /**
   * Whether loose pieces or strips can be split/sold loose.
   * false for liquids/sprays/syrups and sealed pots/packs.
   * true only if pack_size explicitly contains 'strip'.
   */
  is_splittable: boolean;
  isSplittable: boolean;

  /** Whether this item is a non-splittable pot/pack (e.g. 30s pack, 60s pot). */
  isPot: boolean;
  /** Extracted pack count for pot items (e.g. 30, 60). */
  potSize: number;
  /** Calculated price for 1 full Pot (unit_price × extracted pack quantity). */
  potPrice: number | null;
  /** Total price for the container / pack (strictly unitPrice for liquid/bottles, potPrice for pots). */
  totalPrice: number | null;
  /** Packaging container type ("pot", "bottle", "strip", "tube", etc.). */
  packagingType: string;
}

// --------------------------------------------------------------------------
// Format detection
// --------------------------------------------------------------------------

/**
 * Detect the high-level MedEx format from a brand title + pack text pair.
 * Mirrors the edge function's `detectFormat` so client and server stay in
 * lockstep.
 */
export function detectMedExFormat(
  brandTitle: string | null | undefined,
  packText: string | null | undefined,
  formatOrType?: string | null | undefined,
): MedExFormat {
  const t = `${brandTitle || ""} ${formatOrType || ""}`.toLowerCase();
  const p = (packText || "").toLowerCase();
  if (/\b(injection|infusion|iv|im|pfs)\b/.test(t)) return "single";
  if (/\b(vial|ampoule|amp)\b/.test(p) || /\b(vial|ampoule)\b/.test(t)) return "single";
  if (/\b(cream|ointment|gel|lotion|paste|oil|emulsion)\b/.test(t)) return "semisolid";
  if (/\b\d+(?:\.\d+)?\s*(?:gm|g)\b.*\b(tube|jar|pot)\b/.test(p)) return "semisolid";
  if (/\b(syrup|suspension|drops?|solution|spray|inhaler|inhalation|mouthwash|nebuliser|nebulizer|shampoo|wash|liquid)\b/.test(t))
    return "liquid";
  if (/\b\d+(?:\.\d+)?\s*ml\b/.test(p) || /\bbottle\b/.test(p)) return "liquid";
  if (/\btube\b/.test(p)) return "semisolid";
  return "strip";
}

// --------------------------------------------------------------------------
// Strength parsing
// --------------------------------------------------------------------------

function extractFirstStrengthComponent(
  raw: string | null | undefined,
): { value: number; unit: string } | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/\/\s*[^\s,+()]+/g, " ");
  const m = cleaned.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|gm|iu|%|ml)/i);
  if (!m) return null;
  const unit = m[2].toLowerCase() === "gm" ? "g" : m[2].toLowerCase();
  return { value: parseFloat(m[1]), unit };
}

// --------------------------------------------------------------------------
// HTML → raw data (lightweight regex extractor mirroring the edge function)
// --------------------------------------------------------------------------

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMedExHtml(html: string): MedExRawData {
  const out: MedExRawData = {};

  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) {
    const title = stripTags(titleMatch[1]);
    out.brand_title = title;
    // Brand name is the leading word(s) before the form word (e.g. "Napa Extra Tablet")
    const parts = title.split(/\s+/);
    const formIdx = parts.findIndex((w) =>
      /^(tablet|capsule|syrup|suspension|injection|cream|ointment|gel|drops?|inhaler|inhalation|spray|solution|lotion|powder|sachet|vial|ampoule|suppository|lozenge)s?$/i.test(w),
    );
    out.brand_name = formIdx > 0 ? parts.slice(0, formIdx).join(" ") : title;
    out.unit_format = formIdx >= 0 ? parts.slice(formIdx).join(" ") : null;
  }

  const genMatch = html.match(/<a[^>]*href="[^"]*\/generics\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
  if (genMatch) out.generic_name = stripTags(genMatch[1]);

  const head = html.slice(0, 12000);
  const doseMatch = head.match(
    />\s*(\d+(?:\.\d+)?\s*(?:mg|mcg|ml|%|iu|gm|g)(?:\s*\+\s*\d+(?:\.\d+)?\s*(?:mg|mcg|ml|%|iu|gm|g))*)\s*</i,
  );
  if (doseMatch) out.strength = doseMatch[1].trim();

  const compMatch = html.match(/<a[^>]*href="[^"]*\/manufacturers\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
  if (compMatch) out.company = stripTags(compMatch[1]);

  const block = html.match(/<div class="package-container[\s\S]*?<\/div>\s*<\/div>/);
  const scope = block ? block[0] : html;

  const unitM = scope.match(/Unit Price:[\s\S]*?৳\s*([\d,]+(?:\.\d+)?)/i);
  if (unitM) out.unit_price = parseFloat(unitM[1].replace(/,/g, ""));

  const stripM = scope.match(/Strip Price:[\s\S]*?৳\s*([\d,]+(?:\.\d+)?)/i);
  if (stripM) out.strip_price = parseFloat(stripM[1].replace(/,/g, ""));

  const packM = scope.match(/class="pack-size-info"[\s\S]*?>\s*([\s\S]*?)<\/span>/i);
  if (packM) {
    const raw = packM[1].replace(/\s+/g, " ").trim().replace(/^\(|\)$/g, "");
    out.pack_size = raw;
    out.pack_text = raw;
    const totalM = raw.match(/:\s*৳\s*([\d,]+(?:\.\d+)?)/);
    if (totalM) out.pack_total = parseFloat(totalM[1].replace(/,/g, ""));
  }

  if (out.unit_price == null) {
    const lone = scope.match(/৳\s*([\d,]+(?:\.\d+)?)/);
    if (lone) out.unit_price = parseFloat(lone[1].replace(/,/g, ""));
  }

  return out;
}

// --------------------------------------------------------------------------
// Main mapper
// --------------------------------------------------------------------------

function pickString(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Main entry point.
 *
 * Accepts either raw MedEx HTML or a pre-parsed JSON-ish object and returns
 * a fully-mapped payload ready to auto-fill the Add Product form or to be
 * written into `master_medicines` / `medicines`.
 */
export function parseMedExProductData(
  rawData: string | MedExRawData,
): MedExMappedPayload {
  const raw: MedExRawData =
    typeof rawData === "string" ? parseMedExHtml(rawData) : rawData;

  const name = pickString(raw.brand_name, raw.brandName, raw.name) ?? "";
  const genericName = pickString(raw.generic_name, raw.genericName, raw.generic);
  const companyName = pickString(raw.company, raw.company_name, raw.manufacturer);

  const unitFormat = pickString(raw.unit_format, raw.format, raw.product_type);
  // Standardize using the strongest signal available: explicit format label,
  // then brand title (e.g. "Napa Extra Tablet"), then unit_format.
  const typeSource = pickString(raw.format, raw.unit_format, raw.brand_title, raw.product_type, name);
  const productType = getStandardizedType(typeSource);

  const packSizeText = pickString(raw.pack_size, raw.pack_text);
  const format = detectMedExFormat(raw.brand_title ?? name, packSizeText, typeSource);

  const strength = pickString(raw.strength, raw.strength_text);
  const firstComp = extractFirstStrengthComponent(strength);

  const formatStr = `${typeSource || ""} ${raw.format || ""} ${raw.unit_format || ""} ${raw.brand_title || ""} ${name || ""}`.toLowerCase();
  const packStr = (packSizeText || "").toLowerCase();

  // 1. Liquid/Bottles/Sprays (Syrup, Spray, Inhaler, Drops, Ointment)
  const isLiquidOrSpray =
    format === "liquid" ||
    format === "semisolid" ||
    format === "single" ||
    /\b(syrup|suspension|spray|inhaler|inhalation|drops?|ointment|cream|gel|lotion|liquid|solution|mouthwash|wash|shampoo)\b/i.test(formatStr) ||
    (/\b\d+(?:\.\d+)?\s*ml\b/i.test(packStr) && !/\b(tablet|capsule)\b/i.test(formatStr));

  // 2. Strip Tablets vs Pots / Sealed Pack Tablets
  const explicitlyContainsStrip = /\bstrip\b/i.test(packStr);
  const containsPackPotContainerBottle = /\b(pack|pot|container|bottle|jar)\b/i.test(packStr);

  const rawUnitPrice = toNumber(raw.unit_price ?? raw.unitPrice ?? (raw as any).price);

  let pcsPerStrip = 1;
  let stripPerBox = 1;
  let pcsPerBox = 1;
  let unitPrice: number | null = rawUnitPrice;
  let boxPrice: number | null = null;
  let totalPrice: number | null = null;
  let potPrice: number | null = null;
  let is_splittable = false;
  let isPot = false;
  let potSize = 1;
  let packagingType = "unit";

  if (isLiquidOrSpray) {
    // Liquid/Bottles/Sprays (Syrup, Spray, Inhaler, Drops, Ointment):
    // Do NOT multiply unit_price by volume/ml numbers in pack_size (e.g. 100ml bottle with unit_price = 90 → strictly 90 Tk).
    // Set is_splittable = false.
    pcsPerStrip = 1;
    stripPerBox = 1;
    pcsPerBox = 1;
    is_splittable = false;
    isPot = false;
    potSize = 1;
    boxPrice = unitPrice != null ? roundMoney(unitPrice) : null;
    totalPrice = boxPrice;
    potPrice = null;
    packagingType = /\b(ointment|cream|gel)\b/i.test(formatStr) ? "tube" : "bottle";
  } else if (explicitlyContainsStrip) {
    // Strip Tablets (e.g., '12s strip'):
    // Only allow loose/strip unit calculation if pack_size explicitly contains 'strip'.
    is_splittable = true;
    isPot = false;
    potSize = 1;
    packagingType = "strip";

    const nxm = parseNxMPack(packSizeText);
    if (nxm) {
      stripPerBox = nxm.strip_per_pack;
      pcsPerStrip = nxm.pcs_per_strip;
    } else if (raw.pcs_per_strip && raw.strip_per_pack) {
      pcsPerStrip = raw.pcs_per_strip;
      stripPerBox = raw.strip_per_pack;
    } else if (packSizeText) {
      const stripMatch = packSizeText.match(/(\d+)\s*'?s?\s*strip/i);
      if (stripMatch) {
        stripPerBox = 1;
        pcsPerStrip = parseInt(stripMatch[1], 10);
      }
    }
    pcsPerBox = Math.max(1, pcsPerStrip * stripPerBox);
    boxPrice = unitPrice != null ? roundMoney(unitPrice * pcsPerBox) : null;
    totalPrice = boxPrice;
    potPrice = null;
  } else if (containsPackPotContainerBottle || format !== "strip") {
    // Pots / Sealed Pack Tablets (e.g., '30s pack', '60s pot'):
    // If pack_size contains terms like 'pack', 'pot', 'container', or 'bottle' (even if format is Tablet),
    // treat it as a non-splittable Pot/Pack.
    // Set is_splittable = false.
    // 1 Pot Price = unit_price × extracted pack quantity (e.g., 6.17 × 30 = 185.10 Tk).
    is_splittable = false;
    isPot = true;
    packagingType = "pot";

    const potMatch =
      packSizeText?.match(/(\d+)\s*'?s?\s*(?:pack|pot|container|bottle|jar)\b/i) ||
      packSizeText?.match(/(\d+)\s*'?s\b/i) ||
      packSizeText?.match(/(\d+)/);
    const extractedPackQty = potMatch
      ? parseInt(potMatch[1], 10)
      : raw.pcs_per_strip && raw.strip_per_pack
        ? raw.pcs_per_strip * raw.strip_per_pack
        : 1;

    potSize = Number.isFinite(extractedPackQty) && extractedPackQty > 0 ? extractedPackQty : 1;
    pcsPerStrip = 1;
    stripPerBox = potSize;
    pcsPerBox = potSize;

    potPrice = unitPrice != null ? roundMoney(unitPrice * potSize) : null;
    boxPrice = potPrice;
    totalPrice = potPrice;
  } else {
    // Other tablet/capsule without 'strip' keyword (e.g. raw NxM like '3 x 10' or '10 x 10'):
    // Strip Tablets only allow loose/strip unit calculation if pack_size explicitly contains 'strip'.
    const nxm = parseNxMPack(packSizeText);
    if (nxm) {
      stripPerBox = nxm.strip_per_pack;
      pcsPerStrip = nxm.pcs_per_strip;
    } else if (raw.pcs_per_strip && raw.strip_per_pack) {
      pcsPerStrip = raw.pcs_per_strip;
      stripPerBox = raw.strip_per_pack;
    }
    pcsPerBox = Math.max(1, pcsPerStrip * stripPerBox);
    boxPrice = unitPrice != null ? roundMoney(unitPrice * pcsPerBox) : null;
    totalPrice = boxPrice;
    potPrice = null;
    is_splittable = false;
    isPot = false;
    potSize = 1;
    packagingType = "box";
  }

  const medexUrl = pickString(raw.medex_url, raw.medexUrl);

  return {
    name,
    genericName,
    companyName,
    unitFormat,
    productType,
    format,
    strength,
    strengthNumeric: firstComp?.value ?? null,
    strengthUnit: firstComp?.unit ?? null,
    pcsPerStrip,
    stripPerBox,
    pcsPerBox,
    packSizeText,
    unitPrice,
    boxPrice,
    medexUrl,
    is_splittable,
    isSplittable: is_splittable,
    isPot,
    potSize,
    potPrice,
    totalPrice,
    packagingType,
  };
}

/** Alias export for master database items */
export const parseMasterDatabaseItem = parseMedExProductData;

// --------------------------------------------------------------------------
// Add Product form bridge
// --------------------------------------------------------------------------

/**
 * Convert a mapped payload into the exact `location.state` keys that
 * `src/pages/AddProduct.tsx` already consumes. Pass this straight to
 * `navigate("/add-product", { state })`.
 */
export function toAddProductState(payload: MedExMappedPayload): {
  name: string;
  companyName: string;
  productType: string;
  strength: string;
  mrp: string;
  pcsPerStrip: string;
  stripPerBox: string;
  is_splittable: boolean;
  isSplittable: boolean;
  packagingType: string;
} {
  const isPot = payload.isPot;
  const isSingle =
    payload.format === "single" ||
    payload.format === "liquid" ||
    payload.format === "semisolid";
  // For pots, mrp is the 1 Pot Price (e.g. 185.10); for all others (regular tablets, liquids, sprays), mrp is unitPrice (e.g. 2.5, 90).
  const priceValue = isPot && payload.potPrice != null
    ? payload.potPrice
    : (payload.unitPrice ?? payload.totalPrice);

  return {
    name: payload.name,
    companyName: payload.companyName ?? "",
    // Prefer the verbatim MedEx label so custom types (e.g. "Pediatric Drops")
    // are preserved; otherwise fall back to the standardized bucket.
    productType: payload.unitFormat || payload.productType,
    strength:
      payload.strengthNumeric != null ? String(payload.strengthNumeric) : "",
    mrp: priceValue != null ? String(priceValue) : "",
    pcsPerStrip: !isPot && !isSingle && payload.pcsPerStrip > 1 ? String(payload.pcsPerStrip) : "",
    stripPerBox: !isPot && !isSingle && payload.stripPerBox > 1 ? String(payload.stripPerBox) : "",
    is_splittable: payload.is_splittable,
    isSplittable: payload.isSplittable,
    packagingType: payload.packagingType,
  };
}
