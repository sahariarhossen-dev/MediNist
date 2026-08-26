import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pill, FlaskConical, Syringe, Package, AlertTriangle, Plus, Check, X, Wind } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  detectFunctionalTypeFromName,
  fetchPharmacyProductTypes,
  getFunctionalBucket,
  SEED_PRODUCT_TYPES,
  getStandardizedType,
} from "@/lib/productType";
import { toAddProductState, type MedExMappedPayload } from "@/lib/medExMapper";

const ADD_NEW_SENTINEL = "__add_new__";

const getStrengthConfig = (type: string) => {
  const bucket = getFunctionalBucket(type);
  switch (bucket) {
    case "tablet-like":
      return { label: "Strength", unit: "mg", placeholder: "e.g. 500" };
    case "liquid":
      return { label: "Volume", unit: "ml", placeholder: "e.g. 100" };
    case "topical":
      return { label: "Weight", unit: "gm", placeholder: "e.g. 15" };
    case "inhaler":
      return { label: "Doses", unit: "puffs", placeholder: "e.g. 200" };
    default:
      return null;
  }
};

const getTypeIcon = (type: string) => {
  switch (getStandardizedType(type)) {
    case "Tablet":
    case "Capsule":
      return <Pill size={16} />;
    case "Injection":
      return <Syringe size={16} />;
    case "Syrup":
      return <FlaskConical size={16} />;
    case "Inhaler":
      return <Wind size={16} />;
    case "Topical":
    default:
      return <Package size={16} />;
  }
};

const AddProduct = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [productType, setProductType] = useState<string>("");
  const [productTypes, setProductTypes] = useState<string[]>([...SEED_PRODUCT_TYPES]);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeInput, setNewTypeInput] = useState("");
  const [strength, setStrength] = useState("");
  const [stockAlert, setStockAlert] = useState("");
  const [mrp, setMrp] = useState("");
  const [pcsPerStrip, setPcsPerStrip] = useState("");
  const [stripPerBox, setStripPerBox] = useState("");

  const standardizedType = getStandardizedType(productType);
  const usesStripPack = standardizedType === "Tablet" || standardizedType === "Capsule";
  const totalBoxSize = pcsPerStrip && stripPerBox ? Number(pcsPerStrip) * Number(stripPerBox) : null;

  // Load dynamic product types from this pharmacy's existing inventory
  useEffect(() => {
    if (!profile?.pharmacy_id) return;
    let cancelled = false;
    fetchPharmacyProductTypes(profile.pharmacy_id).then((types) => {
      if (cancelled) return;
      setProductTypes((prev) => {
        // Preserve any in-session custom type the user just added
        const merged = new Map<string, string>();
        for (const t of types) merged.set(t.toLowerCase(), t);
        for (const t of prev) if (!merged.has(t.toLowerCase())) merged.set(t.toLowerCase(), t);
        return Array.from(merged.values());
      });
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.pharmacy_id]);

  // Auto-clear strip/pack fields when product is single-unit (Syrup, Injection, etc.)
  useEffect(() => {
    if (!usesStripPack) {
      setPcsPerStrip("");
      setStripPerBox("");
    }
  }, [usesStripPack]);

  useEffect(() => {
    const s = location.state;
    if (!s) return;
    // MedEx-mapped payload takes precedence — it comes from the shared
    // parser and already normalizes brand/strength/pack/price into the
    // exact keys this form consumes.
    const src = s.medexPayload
      ? { ...s, ...toAddProductState(s.medexPayload as MedExMappedPayload) }
      : s;
    if (src.editId) setEditId(src.editId);
    if (src.companyName) setCompanyName(src.companyName);
    if (src.name) setName(src.name);
    if (src.productType) {
      setProductType(src.productType);
      setProductTypes((prev) =>
        prev.some((t) => t.toLowerCase() === src.productType.toLowerCase())
          ? prev
          : [...prev, src.productType]
      );
    } else {
      const detected = detectFunctionalTypeFromName(src.name);
      if (detected) setProductType(detected);
    }
    if (src.strength) {
      const numericStrength = String(src.strength).replace(/[^0-9.]/g, "");
      setStrength(numericStrength);
    }
    if (src.stockAlert) setStockAlert(src.stockAlert);
    if (src.mrp) setMrp(src.mrp);
    if (src.pcsPerStrip) setPcsPerStrip(src.pcsPerStrip);
    if (src.stripPerBox) setStripPerBox(src.stripPerBox);
  }, []);

  // Self-heal: when opening Edit for an existing product, look up the
  // authoritative MedEx master row by (name, company) and overwrite the
  // pack numbers with the master values. Prevents stale local pack data
  // (e.g. swapped strips/pcs) from being re-saved on the next edit.
  useEffect(() => {
    const s = location.state;
    if (!s?.editId || !s?.name) return;
    let cancelled = false;
    (async () => {
      // Strict brand + strength match. If the local row has a strength,
      // only accept a master row whose normalized strength matches exactly.
      // This prevents a different strength variant (e.g. Clonipres 0.2 mg)
      // from silently overwriting this row's (e.g. 0.1 mg) pack numbers.
      const norm = (v: string | null | undefined) =>
        (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const wantStrength = norm(s.strength);
      const { data: rows } = await supabase
        .from("master_medicines")
        .select("pcs_per_strip, strip_per_pack, unit_price, strength")
        .ilike("brand_name", s.name)
        .ilike("company", s.companyName || "")
        .limit(20);
      if (cancelled || !rows || rows.length === 0) return;
      let data: typeof rows[number] | undefined;
      if (wantStrength) {
        data = rows.find((r) => norm(r.strength) === wantStrength);
        if (!data) return; // no exact strength match → do NOT overwrite
      } else {
        // Local row has no strength: only safe if master has a single variant.
        if (rows.length !== 1) return;
        data = rows[0];
      }
      if (typeof data.strip_per_pack === "number" && data.strip_per_pack > 0) {
        setStripPerBox(String(data.strip_per_pack));
      }
      if (typeof data.pcs_per_strip === "number" && data.pcs_per_strip > 0) {
        setPcsPerStrip(String(data.pcs_per_strip));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const strengthConfig = getStrengthConfig(productType);

  const handleTypeChange = (v: string) => {
    if (v === ADD_NEW_SENTINEL) {
      setShowAddType(true);
      setNewTypeInput("");
      return;
    }
    setProductType(v);
  };

  const handleConfirmNewType = () => {
    const v = newTypeInput.trim();
    if (!v) {
      toast.error("Type name cannot be empty");
      return;
    }
    const exists = productTypes.find((t) => t.toLowerCase() === v.toLowerCase());
    const finalValue = exists || v;
    setProductTypes((prev) =>
      exists ? prev : [...prev, v]
    );
    setProductType(finalValue);
    setShowAddType(false);
    setNewTypeInput("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Medicine name is required");
      return;
    }
    if (!profile?.pharmacy_id) {
      toast.error("No pharmacy linked to your account");
      return;
    }
    if (usesStripPack) {
      const pps = Number(pcsPerStrip);
      const spp = Number(stripPerBox);
      if (!pcsPerStrip || !stripPerBox || !Number.isFinite(pps) || !Number.isFinite(spp) || pps <= 0 || spp <= 0) {
        toast.error("Pieces per strip and strips per box are required for tablets/capsules");
        return;
      }
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      company_name: companyName.trim() || null,
      // Standardized category drives UI logic / grouping. For non-standard
      // custom types (e.g. "Eye Drop"), keep the verbatim string so this
      // pharmacy gets its own custom bucket in the dropdown.
      product_type: productType
        ? (standardizedType === "Other" ? productType : standardizedType)
        : null,
      // Verbatim label the user picked — preserved for tooltips / display.
      unit_format: productType || null,
      pharmacy_id: profile.pharmacy_id,
      product_size: strength.trim() ? `${strength.trim()} ${strengthConfig?.unit || ""}`.trim() : null,
      stock_alert: stockAlert ? Number(stockAlert) : 0,
      price: mrp ? Number(mrp) : null,
      // Persist whatever pack data the user entered (>0). Visibility of the
      // strip/box UI is no longer tied to product_type — it follows the
      // actual packaging numbers, matching the master JSON catalog shape.
      pcs_per_strip: usesStripPack
        ? (pcsPerStrip && Number(pcsPerStrip) > 0 ? Number(pcsPerStrip) : null)
        : 1,
      strip_per_pack: usesStripPack
        ? (stripPerBox && Number(stripPerBox) > 0 ? Number(stripPerBox) : null)
        : 1,
    };

    let error;
    if (editId) {
      const { error: updateError } = await supabase
        .from("medicines")
        .update(payload)
        .eq("id", editId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from("medicines").insert(payload);
      error = insertError;
    }

    setSaving(false);
    if (error) {
      console.error("[AddProduct] save failed:", error);
      toast.error(
        (editId ? "Failed to update product: " : "Failed to save product: ") +
          (error.message || "Unknown error")
      );
    } else {
      toast.success(editId ? "Product updated successfully!" : "Product added successfully!");
      navigate("/inventory", { replace: true, state: { refresh: Date.now() } });
    }
  };

  return (
    <div className="min-h-[calc(100vh-72px)] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <h1 className="text-lg font-bold text-foreground">
          {editId ? "Edit Product" : "Add New Product"}
        </h1>
      </div>

      <div className="px-5 py-6 space-y-5 pb-12">
        {/* 1. Product Type */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Product Type</Label>
          {showAddType ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                placeholder="e.g. Eye Drop, MDI, Lozenge"
                value={newTypeInput}
                onChange={(e) => setNewTypeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmNewType();
                  } else if (e.key === "Escape") {
                    setShowAddType(false);
                    setNewTypeInput("");
                  }
                }}
                className="rounded-xl bg-muted border-0 h-12 flex-1"
              />
              <button
                type="button"
                onClick={handleConfirmNewType}
                className="h-12 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"
                aria-label="Confirm new type"
              >
                <Check size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddType(false);
                  setNewTypeInput("");
                }}
                className="h-12 w-12 rounded-xl bg-muted text-foreground flex items-center justify-center"
                aria-label="Cancel"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <Select value={productType} onValueChange={handleTypeChange}>
              <SelectTrigger className="rounded-xl bg-muted border-0 h-12">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {productTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    <span className="flex items-center gap-2">
                      {getTypeIcon(t)} {t}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value={ADD_NEW_SENTINEL}>
                  <span className="flex items-center gap-2 text-primary font-medium">
                    <Plus size={16} /> Add new type…
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* 2. Medicine Name */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Medicine Name *</Label>
          <Input
            placeholder="e.g. Napa Extra"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl bg-muted border-0 h-12"
          />
        </div>

        {/* 3. Strength / Volume / Weight */}
        {strengthConfig && (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{strengthConfig.label}</Label>
            <div className="relative">
              <Input
                type="number"
                placeholder={strengthConfig.placeholder}
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                className="rounded-xl bg-muted border-0 h-12 pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground bg-background px-2 py-1 rounded-lg">
                {strengthConfig.unit}
              </span>
            </div>
          </div>
        )}

        {/* 3b. Strip & Pack Details — only for Tablet / Capsule. */}
        {usesStripPack && (
        <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">Strip & Pack Details</Label>
            <p className="text-xs text-muted-foreground">
              Leave blank or set to 1 for single-unit products (bottles, tubes, vials).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Pcs per Strip</Label>
                <Input
                  type="number"
                  placeholder="eg. 10"
                  value={pcsPerStrip}
                  onChange={(e) => setPcsPerStrip(e.target.value)}
                  className="rounded-xl bg-muted border-0 h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Strips per Box</Label>
                <Input
                  type="number"
                  placeholder="eg. 5"
                  value={stripPerBox}
                  onChange={(e) => setStripPerBox(e.target.value)}
                  className="rounded-xl bg-muted border-0 h-12"
                />
              </div>
            </div>
            {totalBoxSize !== null && totalBoxSize > 0 && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                Total Box Size: <span className="font-semibold text-foreground">{pcsPerStrip} × {stripPerBox} = {totalBoxSize} pcs</span>
              </p>
            )}
        </div>
        )}

        {/* 4. Company Name */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Company Name</Label>
          <button
            type="button"
            onClick={() =>
              navigate("/add-company", {
                state: {
                  formData: { editId, name, companyName, productType, strength, stockAlert, mrp, pcsPerStrip, stripPerBox },
                },
              })
            }
            className="w-full text-left rounded-xl bg-muted h-12 px-3 text-sm flex items-center"
          >
            {companyName ? (
              <span className="text-foreground">{companyName}</span>
            ) : (
              <span className="text-muted-foreground">Select or add company</span>
            )}
          </button>
        </div>

        {/* 5. MRP */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">MRP (৳)</Label>
          <Input
            type="number"
            placeholder="e.g. 12.50"
            value={mrp}
            onChange={(e) => setMrp(e.target.value)}
            className="rounded-xl bg-muted border-0 h-12"
          />
        </div>

        {/* 6. Stock Alert Level */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground flex items-center gap-2">
            <AlertTriangle size={14} className="text-destructive" />
            Stock Alert Level
          </Label>
          <p className="text-xs text-muted-foreground">
            Leave empty to use smart defaults — 1 box for Tablet/Capsule, 2 units for others.
          </p>
          <Input
            type="number"
            placeholder="e.g. 10"
            value={stockAlert}
            onChange={(e) => setStockAlert(e.target.value)}
            className="rounded-xl bg-muted border-0 h-12"
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 transition-colors hover:opacity-90 mt-4"
        >
          {saving ? "Saving..." : editId ? "Update Product" : "Save Product"}
        </button>
      </div>
    </div>
  );
};

export default AddProduct;
