import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Pill, FlaskConical, Syringe, Package, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const productTypes = ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Suspension", "Ointment"] as const;
type ProductType = (typeof productTypes)[number];

const getStrengthConfig = (type: ProductType | "") => {
  switch (type) {
    case "Tablet":
    case "Capsule":
    case "Injection":
      return { label: "Strength", unit: "mg", placeholder: "e.g. 500" };
    case "Syrup":
    case "Suspension":
      return { label: "Volume", unit: "ml", placeholder: "e.g. 100" };
    case "Cream":
    case "Ointment":
      return { label: "Weight", unit: "gm", placeholder: "e.g. 15" };
    default:
      return null;
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case "Tablet":
    case "Capsule":
      return <Pill size={16} />;
    case "Syrup":
    case "Suspension":
      return <FlaskConical size={16} />;
    case "Injection":
      return <Syringe size={16} />;
    case "Cream":
    case "Ointment":
      return <Package size={16} />;
    default:
      return null;
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
  const [productType, setProductType] = useState<ProductType | "">("");
  const [strength, setStrength] = useState("");
  const [stockAlert, setStockAlert] = useState("");
  const [mrp, setMrp] = useState("");
  const [pcsPerStrip, setPcsPerStrip] = useState("");
  const [stripPerBox, setStripPerBox] = useState("");

  const isTabletOrCapsule = productType === "Tablet" || productType === "Capsule";
  const totalBoxSize = pcsPerStrip && stripPerBox ? Number(pcsPerStrip) * Number(stripPerBox) : null;

  useEffect(() => {
    const s = location.state;
    if (!s) return;
    if (s.editId) setEditId(s.editId);
    if (s.companyName) setCompanyName(s.companyName);
    if (s.name) setName(s.name);
    if (s.productType) setProductType(s.productType);
    if (s.strength) {
      // Parse numeric part from strength like "500" or already-numeric values
      const numericStrength = String(s.strength).replace(/[^0-9.]/g, "");
      setStrength(numericStrength);
    }
    if (s.stockAlert) setStockAlert(s.stockAlert);
    if (s.mrp) setMrp(s.mrp);
    if (s.pcsPerStrip) setPcsPerStrip(s.pcsPerStrip);
    if (s.stripPerBox) setStripPerBox(s.stripPerBox);
  }, []);

  const strengthConfig = getStrengthConfig(productType);

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
      product_type: productType || null,
      unit_format: productType || null,
      pharmacy_id: profile.pharmacy_id,
      product_size: strength.trim() ? `${strength.trim()} ${strengthConfig?.unit || ""}`.trim() : null,
      stock_alert: stockAlert ? Number(stockAlert) : 0,
      price: mrp ? Number(mrp) : null,
      pcs_per_strip: isTabletOrCapsule && pcsPerStrip ? Number(pcsPerStrip) : null,
      strip_per_pack: isTabletOrCapsule && stripPerBox ? Number(stripPerBox) : null,
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
          onClick={() => navigate("/inventory")}
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
          <Select value={productType} onValueChange={(v) => setProductType(v as ProductType)}>
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
            </SelectContent>
          </Select>
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

        {/* 3b. Strip & Pack Details (Tablet/Capsule only) */}
        {isTabletOrCapsule && (
          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">Strip & Pack Details</Label>
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
