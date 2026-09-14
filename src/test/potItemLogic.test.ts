import { describe, it, expect } from "vitest";
import {
  getPotItemInfo,
  validatePotSaleQuantity,
  getPotSteppedQuantity,
  formatPotQuantityDisplay,
  getCartItemPieces,
  getCartItemLineTotal,
} from "@/lib/stockUtils";

describe("getPotItemInfo", () => {
  it("detects Neuro-B 60s as a pot item with potSize 60", () => {
    const info = getPotItemInfo({
      name: "Neuro-B 60's",
      pcs_per_strip: 1,
      strip_per_pack: 60,
      product_type: "Tablet",
    });
    expect(info.isPot).toBe(true);
    expect(info.potSize).toBe(60);
    expect(info.potLabel).toBe("Pot");
  });

  it("detects Bextram Gold 30s as a pot item with potSize 30", () => {
    const info = getPotItemInfo({
      name: "Bextram Gold 30s",
      pcs_per_strip: 1,
      strip_per_pack: 30,
      product_type: "Tablet",
    });
    expect(info.isPot).toBe(true);
    expect(info.potSize).toBe(30);
  });

  it("detects items with explicit packaging_type 'container' or 'bottle'", () => {
    const container = getPotItemInfo({
      name: "Calbo-D 30s Container",
      packaging_type: "container",
      box_size: "30",
    });
    expect(container.isPot).toBe(true);
    expect(container.potSize).toBe(30);
    expect(container.potLabel).toBe("Container");

    const bottle = getPotItemInfo({
      name: "Vitamin C 500mg Bottle",
      packaging_type: "bottle",
      pack_size: "100's",
    });
    expect(bottle.isPot).toBe(true);
    expect(bottle.potSize).toBe(100);
    expect(bottle.potLabel).toBe("Bottle");
  });

  it("detects items marked as single-unit/pot", () => {
    const info = getPotItemInfo({
      name: "Multivitamin",
      unit_format: "single-unit/pot",
      box_size: "60",
    });
    expect(info.isPot).toBe(true);
    expect(info.potSize).toBe(60);
  });

  it("does NOT mark standard blister strip tablets as pots", () => {
    // Napa Extra: 10 strips of 10 pcs
    const napa = getPotItemInfo({
      name: "Napa Extra",
      pcs_per_strip: 10,
      strip_per_pack: 10,
      product_type: "Tablet",
    });
    expect(napa.isPot).toBe(false);

    // Maxpro 20: 10 strips of 14 pcs
    const maxpro = getPotItemInfo({
      name: "Maxpro 20mg",
      pcs_per_strip: 14,
      strip_per_pack: 10,
      product_type: "Capsule",
    });
    expect(maxpro.isPot).toBe(false);
  });
});

describe("validatePotSaleQuantity", () => {
  const pot60 = { isPot: true, potSize: 60, potLabel: "Pot" };

  it("allows exact full pot multiples", () => {
    expect(validatePotSaleQuantity(60, pot60).isValid).toBe(true);
    expect(validatePotSaleQuantity(120, pot60).isValid).toBe(true);
    expect(validatePotSaleQuantity(180, pot60).isValid).toBe(true);
  });

  it("rejects partial loose quantities like 10 pcs and snaps to minimum 60 pcs", () => {
    const res = validatePotSaleQuantity(10, pot60);
    expect(res.isValid).toBe(false);
    expect(res.snappedQty).toBe(60);
    expect(res.message).toBe("Cannot sell loose tablets for this pot item. Must be sold as full pot (60 pcs).");
  });

  it("snaps partial quantities like 70 pcs to nearest valid multiple (60 or 120)", () => {
    const res70 = validatePotSaleQuantity(70, pot60);
    expect(res70.isValid).toBe(false);
    expect(res70.snappedQty).toBe(60);

    const res100 = validatePotSaleQuantity(100, pot60);
    expect(res100.isValid).toBe(false);
    expect(res100.snappedQty).toBe(120);
  });

  it("allows any positive quantity for regular blister items", () => {
    const regular = { isPot: false, potSize: 1, potLabel: "" };
    expect(validatePotSaleQuantity(1, regular).isValid).toBe(true);
    expect(validatePotSaleQuantity(7, regular).isValid).toBe(true);
    expect(validatePotSaleQuantity(10, regular).isValid).toBe(true);
  });
});

describe("getPotSteppedQuantity", () => {
  const pot60 = { isPot: true, potSize: 60, potLabel: "Pot" };

  it("steps by full pot multiples", () => {
    expect(getPotSteppedQuantity(60, "up", pot60)).toBe(120);
    expect(getPotSteppedQuantity(120, "up", pot60)).toBe(180);
    expect(getPotSteppedQuantity(180, "down", pot60)).toBe(120);
    expect(getPotSteppedQuantity(120, "down", pot60)).toBe(60);
  });

  it("prevents decreasing below minimum 1 pot (60 pcs)", () => {
    expect(getPotSteppedQuantity(60, "down", pot60)).toBe(60);
  });

  it("steps normally for regular items", () => {
    const regular = { isPot: false, potSize: 1, potLabel: "" };
    expect(getPotSteppedQuantity(1, "up", regular)).toBe(2);
    expect(getPotSteppedQuantity(2, "down", regular)).toBe(1);
    expect(getPotSteppedQuantity(1, "down", regular)).toBe(1);
  });
});

describe("formatPotQuantityDisplay", () => {
  const pot60 = { isPot: true, potSize: 60, potLabel: "Pot" };
  it("formats single and plural pot counts", () => {
    expect(formatPotQuantityDisplay(60, pot60)).toBe("1 Pot (60 pcs)");
    expect(formatPotQuantityDisplay(120, pot60)).toBe("2 Pots (120 pcs)");
  });
});

describe("Unit-based cart logic for pot items", () => {
  const pot60 = { isPot: true, potSize: 60, potLabel: "Pot" };
  const regular = { isPot: false, potSize: 1, potLabel: "" };

  it("calculates pieces correctly for pot and regular items", () => {
    // 1 Pot of Neuro-B 60s is 60 pieces
    expect(getCartItemPieces(1, pot60)).toBe(60);
    // 2 Pots is 120 pieces
    expect(getCartItemPieces(2, pot60)).toBe(120);
    // Regular item with qty 5 is 5 pieces
    expect(getCartItemPieces(5, regular)).toBe(5);
  });

  it("calculates total price directly: 1 Pot x 60 pcs x 10 Tk/pc = 600.00 Tk", () => {
    const unitPrice = 10; // 10 Tk per pc
    // 1 Pot x 60 pcs x 10 Tk/pc = 600 Tk
    expect(getCartItemLineTotal(1, unitPrice, pot60)).toBe(600);
    // 2 Pots x 60 pcs x 10 Tk/pc = 1200 Tk
    expect(getCartItemLineTotal(2, unitPrice, pot60)).toBe(1200);
    // Regular item 5 pcs x 10 Tk = 50 Tk
    expect(getCartItemLineTotal(5, unitPrice, regular)).toBe(50);
  });
});
