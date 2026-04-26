/**
 * Normalizes a string for flexible matching: lowercases and strips
 * everything that isn't a-z or 0-9. Use on BOTH the query and the
 * value being searched so things like "A-mactin" match "amactin".
 * Display values are never modified — this is matching-only.
 */
export const normalizeForSearch = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");