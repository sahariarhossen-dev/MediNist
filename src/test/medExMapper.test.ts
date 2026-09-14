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

describe("Master Database JSON parsing rules (Liquids, Pots, Strips)", () => {
  it("Bextram Kids Syrup (100ml bottle) shows strictly 90 Tk (NOT 90 × 100) and is_splittable = false", () => {
    const p = parseMedExProductData({
      brand_name: "Bextram Kids",
      brand_title: "Bextram Kids Syrup",
      pack_size: "100 ml bottle: ৳ 90.00",
      unit_price: 90,
      unit_format: "Syrup",
    });

    expect(p.boxPrice).toBe(90);
    expect(p.totalPrice).toBe(90);
    expect(p.is_splittable).toBe(false);
    expect(p.isPot).toBe(false);
    expect(p.pcsPerBox).toBe(1);

    const formState = toAddProductState(p);
    expect(formState.mrp).toBe("90");
    expect(formState.pcsPerStrip).toBe("");
    expect(formState.stripPerBox).toBe("");
    expect(formState.is_splittable).toBe(false);
  });

  it("Spray / Inhaler / Drops / Ointment are non-splittable and never multiply volume", () => {
    const nasalSpray = parseMedExProductData({
      brand_name: "Afrin",
      brand_title: "Afrin Nasal Spray",
      pack_size: "15 ml bottle: ৳ 120.00",
      unit_price: 120,
    });
    expect(nasalSpray.boxPrice).toBe(120);
    expect(nasalSpray.is_splittable).toBe(false);
    expect(nasalSpray.isPot).toBe(false);

    const ointment = parseMedExProductData({
      brand_name: "Quadriderm",
      brand_title: "Quadriderm Ointment",
      pack_size: "10 gm tube: ৳ 85.00",
      unit_price: 85,
    });
    expect(ointment.boxPrice).toBe(85);
    expect(ointment.is_splittable).toBe(false);
  });

  it("Bextram Gold / Teen (30's pack) shows as non-splittable Pot with 1 Pot Price = 185.10 Tk", () => {
    const p = parseMedExProductData({
      brand_name: "Bextram Gold",
      brand_title: "Bextram Gold Tablet",
      pack_size: "30's pack: ৳ 185.10",
      unit_price: 6.17,
    });

    expect(p.isPot).toBe(true);
    expect(p.is_splittable).toBe(false);
    expect(p.potSize).toBe(30);
    expect(p.potPrice).toBe(185.1);
    expect(p.totalPrice).toBe(185.1);
    expect(p.boxPrice).toBe(185.1);

    const formState = toAddProductState(p);
    expect(formState.mrp).toBe("185.1");
    expect(formState.is_splittable).toBe(false);
    expect(formState.packagingType).toBe("pot");
  });

  it("60s pot tablet shows as non-splittable Pot with price = unit_price × 60", () => {
    const p = parseMedExProductData({
      brand_name: "Neuro-B",
      brand_title: "Neuro-B Tablet",
      pack_size: "60's pot: ৳ 600.00",
      unit_price: 10,
    });

    expect(p.isPot).toBe(true);
    expect(p.is_splittable).toBe(false);
    expect(p.potSize).toBe(60);
    expect(p.potPrice).toBe(600);
    expect(p.totalPrice).toBe(600);
  });

  it("Strip Tablets ('12s strip') allows strip / splittable unit calculation", () => {
    const p = parseMedExProductData({
      brand_name: "StripMed",
      brand_title: "StripMed Tablet",
      pack_size: "12s strip: ৳ 36.00",
      unit_price: 3,
    });

    expect(p.is_splittable).toBe(true);
    expect(p.isPot).toBe(false);
    expect(p.pcsPerStrip).toBe(12);
    expect(p.pcsPerBox).toBe(12);
    expect(p.totalPrice).toBe(36);
  });
});
