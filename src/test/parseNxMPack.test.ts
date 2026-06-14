import { describe, it, expect } from "vitest";
import { parseNxMPack, classifyCatalogPack } from "@/lib/stockUtils";

describe("parseNxMPack", () => {
  it("parses '5 x 10' as 5 strips of 10 pcs (Amloten)", () => {
    expect(parseNxMPack("5 x 10")).toEqual({ strip_per_pack: 5, pcs_per_strip: 10 });
  });
  it("parses '10 x 14' as 10 strips of 14 pcs (Maxpro)", () => {
    expect(parseNxMPack("10 x 14")).toEqual({ strip_per_pack: 10, pcs_per_strip: 14 });
  });
  it("parses '20×10' (unicode multiplication sign)", () => {
    expect(parseNxMPack("20×10")).toEqual({ strip_per_pack: 20, pcs_per_strip: 10 });
  });
  it("returns null for single-number packs", () => {
    expect(parseNxMPack("10's pack")).toBeNull();
    expect(parseNxMPack("30ml")).toBeNull();
    expect(parseNxMPack("")).toBeNull();
    expect(parseNxMPack(null)).toBeNull();
  });
});

describe("classifyCatalogPack honours NxM over box_size division", () => {
  it("Amloten (5 x 10) is full mode 5 strips × 10 pcs even with stale box_size", () => {
    expect(classifyCatalogPack({ pack_size: "5 x 10", box_size: "100" })).toEqual({
      mode: "full",
      strip_per_pack: 5,
      pcs_per_strip: 10,
    });
  });
  it("falls back to box/pack division when no NxM", () => {
    expect(classifyCatalogPack({ pack_size: "10", box_size: "100" })).toEqual({
      mode: "full",
      strip_per_pack: 10,
      pcs_per_strip: 10,
    });
  });
  it("treats missing box_size as single unit", () => {
    expect(classifyCatalogPack({ pack_size: null, box_size: null })).toEqual({
      mode: "single",
      strip_per_pack: null,
      pcs_per_strip: null,
    });
  });
});