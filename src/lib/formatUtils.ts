/**
 * Smart truncation utilities for mobile-friendly product display.
 * Follows the 10+8 rule: name ≤ 10 chars, strength ≤ 8 chars.
 */

export const truncateName = (name: string, max = 10): string => {
  if (!name) return "";
  return name.length > max ? name.substring(0, max) + "…" : name;
};

export const truncateStrength = (strength: string | null | undefined, max = 8): string => {
  if (!strength) return "";
  return strength.length > max ? strength.substring(0, max) + "…" : strength;
};

/**
 * Round a numeric money value to exactly 2 decimal places.
 * Uses Number.EPSILON to avoid edge cases like 1.005 rounding down.
 * Use this for any value that goes into state, math, or the database.
 */
export const roundMoney = (n: number | null | undefined): number => {
  const v = Number(n) || 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
};

/**
 * Format a money value for display: 2 decimals, with thousands separators.
 * Example: 90.14999999999999 -> "90.15"; 1234.5 -> "1,234.50"
 */
export const formatMoney = (n: number | null | undefined): string => {
  return roundMoney(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
