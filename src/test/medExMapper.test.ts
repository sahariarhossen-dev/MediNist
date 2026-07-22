import { describe, it, expect } from "vitest";
import { parseMedExProductData, toAddProductState } from "@/lib/medExMapper";

describe("parseMedExProductData — pack math", () => {
  it("'3 x 10' → pcsPerStrip 10, stripPerBox 3, pcsPerBox 30", () => {
    const p = parseMedExProductData({
      brand_name: "Napa",
      brand_title: "Napa Tablet",
      pack_size: "3 x 10",
      unit_price: 1.2,
    });
    expect(p.pcsPerStrip).toBe(10);
    expect(p.stripPerBox).toBe(3);
    expect(p.pcsPerBox).toBe(30);
  });

  it("'10 x 10' → pcsPerBox 100 and boxPrice = unitPrice × 100", () => {
    const p = parseMedExProductData({
      brand_name: "Amloten",
      brand_title: "Amloten Tablet",
      pack_size: "10 x 10",
      unit_price: 45,
    });
    expect(p.pcsPerBox).toBe(100);
    expect(p.boxPrice).toBe(4500);
  });

  it("Example: unit price 45 × 30 pcs = 1350 box price", () => {
    const p = parseMedExProductData({
      brand_name: "Example",
      brand_title: "Example Tablet",
      pack_size: "3 x 10",
      unit_price: 45,
    });
    expect(p.boxPrice).toBe(1350);
  });
});

describe("parseMedExProductData — single-unit formats default gracefully", () => {
  it("100 ml bottle syrup → pcsPerBox = 1, boxPrice = unitPrice", () => {
    const p = parseMedExProductData({
      brand_name: "Mucosol",
      brand_title: "Mucosol Syrup",
      pack_size: "100 ml bottle: ৳ 90.00",
      unit_price: 90,
    });
    expect(p.format).toBe("liquid");
    expect(p.pcsPerStrip).toBe(1);
    expect(p.stripPerBox).toBe(1);
    expect(p.pcsPerBox).toBe(1);
    expect(p.boxPrice).toBe(90);
  });

  it("Injection vial → single format, pcsPerBox = 1", () => {
    const p = parseMedExProductData({
      brand_name: "Nefrofer",
      brand_title: "Nefrofer IV Injection",
      pack_size: "1 vial",
      unit_price: 350,
    });
    expect(p.format).toBe("single");
    expect(p.pcsPerBox).toBe(1);
    expect(p.productType).toBe("Injection");
  });

  it("Cream tube → semisolid, pcsPerBox = 1", () => {
    const p = parseMedExProductData({
      brand_name: "Fungin",
      brand_title: "Fungin Cream",
      pack_size: "15 gm tube",
      unit_price: 60,
    });
    expect(p.format).toBe("semisolid");
    expect(p.pcsPerBox).toBe(1);
    expect(p.productType).toBe("Topical");
  });
});

describe("parseMedExProductData — strength parsing", () => {
  it("preserves combo strength and extracts first numeric + unit", () => {
    const p = parseMedExProductData({
      brand_name: "Combo",
      brand_title: "Combo Tablet",
      pack_size: "1 x 10",
      strength: "40 mg+500 mg+250 mg+100 mg",
    });
    expect(p.strength).toBe("40 mg+500 mg+250 mg+100 mg");
    expect(p.strengthNumeric).toBe(40);
    expect(p.strengthUnit).toBe("mg");
  });
});

describe("toAddProductState bridges to AddProduct form", () => {
  it("maps a Tablet payload into location.state keys", () => {
    const p = parseMedExProductData({
      brand_name: "Napa Extra",
      brand_title: "Napa Extra Tablet",
      company: "Beximco",
      pack_size: "10 x 10",
      strength: "500 mg+65 mg",
      unit_price: 2.5,
    });
    const s = toAddProductState(p);
    expect(s.name).toBe("Napa Extra");
    expect(s.companyName).toBe("Beximco");
    expect(s.strength).toBe("500");
    expect(s.mrp).toBe("2.5");
    expect(s.pcsPerStrip).toBe("10");
    expect(s.stripPerBox).toBe("10");
  });

  it("blanks pack fields for a Syrup so single-unit UI is used", () => {
    const p = parseMedExProductData({
      brand_name: "Mucosol",
      brand_title: "Mucosol Syrup",
      pack_size: "100 ml bottle",
      unit_price: 90,
    });
    const s = toAddProductState(p);
    expect(s.pcsPerStrip).toBe("");
    expect(s.stripPerBox).toBe("");
    expect(s.mrp).toBe("90");
  });
});
