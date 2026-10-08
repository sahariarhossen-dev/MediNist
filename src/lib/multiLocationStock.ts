import { Location } from "@/types/location";
import { StockDistributionItem } from "@/types/inventory";

/**
 * Resolves a location from a distribution identifier (matches by id, code, or name).
 */
export function resolveLocation(
  locIdOrCode: string,
  locations: Location[]
): Location | undefined {
  if (!locIdOrCode || !locations || locations.length === 0) return undefined;
  const target = locIdOrCode.trim().toLowerCase();
  return locations.find(
    (loc) =>
      (loc.id && loc.id.toLowerCase() === target) ||
      (loc.code && loc.code.toLowerCase() === target) ||
      (loc.name && loc.name.toLowerCase() === target)
  );
}

/**
 * Calculates total stock dynamically from the distribution array.
 * Falls back to single stock_quantity if no distribution is present.
 */
export function calculateTotalStock(
  distribution?: StockDistributionItem[] | null,
  fallbackQty?: number | null
): number {
  if (Array.isArray(distribution) && distribution.length > 0) {
    return distribution.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  }
  return Number(fallbackQty) || 0;
}

/**
 * Extracts stock quantity strictly for a given location.
 */
export function getStockForLocation(
  medicine: {
    stock_distribution?: StockDistributionItem[] | null;
    stock_quantity?: number | null;
    location_id?: string | null;
  },
  targetLocation: Location | { id: string; code?: string; name?: string },
  locations: Location[] = []
): number {
  if (!targetLocation) return medicine.stock_quantity ?? 0;

  if (Array.isArray(medicine.stock_distribution) && medicine.stock_distribution.length > 0) {
    const targetId = targetLocation.id?.toLowerCase();
    const targetCode = targetLocation.code?.toLowerCase();
    const targetName = (targetLocation as any).name?.toLowerCase();

    const match = medicine.stock_distribution.find((item) => {
      const locKey = item.location_id.toLowerCase();
      if (targetId && locKey === targetId) return true;
      if (targetCode && locKey === targetCode) return true;
      if (targetName && locKey === targetName) return true;
      // Reverse check against locations list
      const resolved = resolveLocation(item.location_id, locations);
      return resolved && (
        (targetId && resolved.id.toLowerCase() === targetId) ||
        (targetCode && resolved.code?.toLowerCase() === targetCode) ||
        (targetName && resolved.name.toLowerCase() === targetName)
      );
    });

    return match ? Number(match.qty) || 0 : 0;
  }

  // If the record has an explicit location_id column
  if (medicine.location_id) {
    const targetId = targetLocation.id?.toLowerCase();
    const targetCode = targetLocation.code?.toLowerCase();
    const targetName = (targetLocation as any).name?.toLowerCase();
    const rowLoc = medicine.location_id.toLowerCase();

    if (
      (targetId && rowLoc === targetId) ||
      (targetCode && rowLoc === targetCode) ||
      (targetName && rowLoc === targetName)
    ) {
      return Number(medicine.stock_quantity) || 0;
    }

    const resolved = resolveLocation(medicine.location_id, locations);
    if (
      resolved &&
      ((targetId && resolved.id.toLowerCase() === targetId) ||
        (targetCode && resolved.code?.toLowerCase() === targetCode) ||
        (targetName && resolved.name.toLowerCase() === targetName))
    ) {
      return Number(medicine.stock_quantity) || 0;
    }

    return 0;
  }

  // If no distribution array and no location_id exists:
  // Strict rule: Never attribute unassigned stock to any branch.
  return 0;
}

/**
 * Generates an ordered breakdown of locations holding stock for this medicine.
 */
export function getLocationBreakdown(
  medicine: {
    stock_distribution?: StockDistributionItem[] | null;
    stock_quantity?: number | null;
    location_id?: string | null;
  },
  locations: Location[]
): Array<{ location: Location; qty: number; percent: number }> {
  if (!locations || locations.length === 0) return [];

  const total = calculateTotalStock(medicine.stock_distribution, medicine.stock_quantity);

  if (Array.isArray(medicine.stock_distribution) && medicine.stock_distribution.length > 0) {
    const map = new Map<string, { location: Location; qty: number }>();

    for (const item of medicine.stock_distribution) {
      const resolved = resolveLocation(item.location_id, locations);
      const qty = Number(item.qty) || 0;
      if (resolved && qty > 0) {
        const existing = map.get(resolved.id);
        if (existing) {
          existing.qty += qty;
        } else {
          map.set(resolved.id, { location: resolved, qty });
        }
      }
    }

    if (map.size > 0) {
      const results: Array<{ location: Location; qty: number; percent: number }> = [];
      for (const entry of map.values()) {
        const percent = total > 0 ? Math.round((entry.qty / total) * 100) : 0;
        results.push({ location: entry.location, qty: entry.qty, percent });
      }

      // Sort branches first, then warehouses, descending by qty
      return results.sort((a, b) => {
        if (a.location.type !== b.location.type) {
          return a.location.type === "branch" ? -1 : 1;
        }
        return b.qty - a.qty;
      });
    }
  }

  // If no distribution array, only attribute if medicine has an explicit location_id
  if (total > 0 && medicine.location_id) {
    const resolved = resolveLocation(medicine.location_id, locations);
    if (resolved) {
      return [{ location: resolved, qty: total, percent: 100 }];
    }
  }

  return [];
}
