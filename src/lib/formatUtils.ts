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
