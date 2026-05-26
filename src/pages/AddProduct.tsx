import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Pill, FlaskConical, Syringe, Package, AlertTriangle, Plus, Check, X, Wind } from "lucide-react";
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
  // Explicit packaging mode chosen by the user.
  // "single"      → pots, bottles, drops, syrups, inhalers, single-pack tablets
  // "strip_based" → real tablet/capsule strips inside a box
  const [packagingType, setPackagingType] = useState<"single" | "strip_based">("single");

  const standardizedType = getStandardizedType(productType);
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

  useEffect(() => {
    const s = location.state;
    if (!s) return;
    if (s.editId) setEditId(s.editId);
    if (s.companyName) setCompanyName(s.companyName);
    if (s.name) setName(s.name);
    if (s.productType) {
      setProductType(s.productType);
      // Make sure the saved type is selectable in the dropdown
      setProductTypes((prev) =>
        prev.some((t) => t.toLowerCase() === s.productType.toLowerCase())
          ? prev
          : [...prev, s.productType]
      );
    } else {
      // Auto-detect from medicine name only when DB value is empty/null
      const detected = detectFunctionalTypeFromName(s.name);
      if (detected) setProductType(detected);
    }
    if (s.strength) {
      // Parse numeric part from strength like "500" or already-numeric values
      const numericStrength = String(s.strength).replace(/[^0-9.]/g, "");
      setStrength(numericStrength);
    }
    if (s.stockAlert) setStockAlert(s.stockAlert);
    if (s.mrp) setMrp(s.mrp);
    if (s.pcsPerStrip) setPcsPerStrip(s.pcsPerStrip);
    if (s.stripPerBox) setStripPerBox(s.stripPerBox);
    if (s.packagingType === "single" || s.packagingType === "strip_based") {
      setPackagingType(s.packagingType);
    } else if (
      Number(s.pcsPerStrip || 0) > 1 &&
      Number(s.stripPerBox || 0) > 1
    ) {
      // Back-compat: legacy rows without packaging_type — infer from numbers.
      setPackagingType("strip_based");
    }
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
      pcs_per_strip:
        packagingType === "single"
          ? null
          : pcsPerStrip && Number(pcsPerStrip) > 0
            ? Number(pcsPerStrip)
            : null,
      strip_per_pack:
        packagingType === "single"
          ? null
          : stripPerBox && Number(stripPerBox) > 0
            ? Number(stripPerBox)
            : null,
      packaging_type: packagingType,
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
      toast.error(editId ? "Failed to update product" : "Failed to save product");
    } else {
      toast.success(editId ? "Product updated successfully!" : "Product added successfully!");
      navigate("/inventory", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
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

        {/* 3b. Strip & Pack Details — driven by data, not product type.
            Leave both blank (or 1) for single-unit products. */}
        <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">Packaging</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPackagingType("single")}
                className={`rounded-xl h-12 text-xs font-semibold transition border ${
                  packagingType === "single"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-foreground border-transparent"
                }`}
              >
                Single unit
                <span className="block text-[10px] font-normal opacity-80">pot / bottle / drop / syrup</span>
              </button>
              <button
                type="button"
                onClick={() => setPackagingType("strip_based")}
                className={`rounded-xl h-12 text-xs font-semibold transition border ${
                  packagingType === "strip_based"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-foreground border-transparent"
                }`}
              >
                Strip-based
                <span className="block text-[10px] font-normal opacity-80">tablet strips in a box</span>
              </button>
            </div>
            {packagingType === "strip_based" && (
              <>
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
              </>
            )}
        </div>

        {/* 4. Company Name */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Company Name</Label>
          <button
            type="button"
            onClick={() =>
              navigate("/add-company", {
                state: {
                  formData: { editId, name, companyName, productType, strength, stockAlert, mrp, pcsPerStrip, stripPerBox, packagingType },
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
