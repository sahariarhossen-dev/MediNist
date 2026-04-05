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

const productTypes = ["Tablet", "Capsule", "Syrup", "Injection", "Cream"] as const;
type ProductType = (typeof productTypes)[number];

const AddProduct = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [productType, setProductType] = useState<ProductType | "">("");
  const [stripPerPack, setStripPerPack] = useState("");
  const [pcsPerStrip, setPcsPerStrip] = useState("");
  
  const [productSize, setProductSize] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("");
  const [stockAlert, setStockAlert] = useState("");
  const [mrp, setMrp] = useState("");

  // Restore form state from navigation
  useEffect(() => {
    const s = location.state;
    if (!s) return;
    if (s.companyName) setCompanyName(s.companyName);
    if (s.name) setName(s.name);
    if (s.productType) setProductType(s.productType);
    if (s.stripPerPack) setStripPerPack(s.stripPerPack);
    if (s.pcsPerStrip) setPcsPerStrip(s.pcsPerStrip);
    
    if (s.productSize) setProductSize(s.productSize);
    if (s.totalQuantity) setTotalQuantity(s.totalQuantity);
    if (s.stockAlert) setStockAlert(s.stockAlert);
    if (s.mrp) setMrp(s.mrp);
  }, []);

  const isTabletOrCapsule = productType === "Tablet" || productType === "Capsule";
  const isLiquidOrCream = productType === "Syrup" || productType === "Injection" || productType === "Cream";


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
    const { error } = await supabase.from("medicines").insert({
      name: name.trim(),
      company_name: companyName.trim() || null,
      product_type: productType || null,
      pharmacy_id: profile.pharmacy_id,
      strip_per_pack: isTabletOrCapsule && stripPerPack ? Number(stripPerPack) : null,
      pcs_per_strip: isTabletOrCapsule && pcsPerStrip ? Number(pcsPerStrip) : null,
      stock_quantity: isTabletOrCapsule
        ? totalStrips ? Number(totalStrips) : null
        : isLiquidOrCream
        ? totalQuantity ? Number(totalQuantity) : null
        : null,
      product_size: isLiquidOrCream ? productSize.trim() || null : null,
      stock_alert: stockAlert ? Number(stockAlert) : 0,
      price: mrp ? Number(mrp) : null,
    });

    setSaving(false);
    if (error) {
      toast.error("Failed to save product");
    } else {
      toast.success("Product added successfully!");
      navigate("/inventory");
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "Tablet":
      case "Capsule":
        return <Pill size={16} />;
      case "Syrup":
        return <FlaskConical size={16} />;
      case "Injection":
        return <Syringe size={16} />;
      case "Cream":
        return <Package size={16} />;
      default:
        return null;
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
        <h1 className="text-lg font-bold text-foreground">Add New Product</h1>
      </div>

      <div className="px-5 py-6 space-y-5 pb-12">
        {/* Medicine Name */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Medicine Name *</Label>
          <Input
            placeholder="e.g. Napa Extra"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl bg-muted border-0 h-12"
          />
        </div>

        {/* Company Name - clickable */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">Company Name</Label>
          <button
            type="button"
            onClick={() =>
              navigate("/add-company", {
                state: {
                  formData: { name, companyName, productType, stripPerPack, pcsPerStrip, totalStrips, productSize, totalQuantity, stockAlert, mrp },
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

        {/* Product Type */}
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

        {/* Conditional: Tablet / Capsule */}
        {isTabletOrCapsule && (
          <div className="space-y-4 p-4 bg-muted rounded-2xl">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Strip & Pack Details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Strip per Pack</Label>
                <Input
                  type="number"
                  placeholder="e.g. 10"
                  value={stripPerPack}
                  onChange={(e) => setStripPerPack(e.target.value)}
                  className="rounded-xl bg-background border-0 h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Pcs per Strip</Label>
                <Input
                  type="number"
                  placeholder="e.g. 10"
                  value={pcsPerStrip}
                  onChange={(e) => setPcsPerStrip(e.target.value)}
                  className="rounded-xl bg-background border-0 h-11"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Total Strips in Stock</Label>
              <Input
                type="number"
                placeholder="e.g. 50"
                value={totalStrips}
                onChange={(e) => setTotalStrips(e.target.value)}
                className="rounded-xl bg-background border-0 h-11"
              />
            </div>
            {totalPcs !== null && (
              <div className="flex items-center gap-2 text-sm text-primary font-medium bg-primary/10 rounded-xl px-4 py-2.5">
                <Package size={16} />
                Total Pcs: {totalPcs}
              </div>
            )}
          </div>
        )}

        {/* Conditional: Syrup / Injection / Cream */}
        {isLiquidOrCream && (
          <div className="space-y-4 p-4 bg-muted rounded-2xl">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Product Details
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Product Size (ml / gm)</Label>
              <Input
                placeholder="e.g. 100ml"
                value={productSize}
                onChange={(e) => setProductSize(e.target.value)}
                className="rounded-xl bg-background border-0 h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Total Quantity in Stock</Label>
              <Input
                type="number"
                placeholder="e.g. 20"
                value={totalQuantity}
                onChange={(e) => setTotalQuantity(e.target.value)}
                className="rounded-xl bg-background border-0 h-11"
              />
            </div>
          </div>
        )}

        {/* Stock Alert */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground flex items-center gap-2">
            <AlertTriangle size={14} className="text-destructive" />
            Stock Alert Level
          </Label>
          <Input
            type="number"
            placeholder="e.g. 10"
            value={stockAlert}
            onChange={(e) => setStockAlert(e.target.value)}
            className="rounded-xl bg-muted border-0 h-12"
          />
          <p className="text-xs text-muted-foreground">Get warned when stock falls below this number</p>
        </div>

        {/* MRP */}
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

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 transition-colors hover:opacity-90 mt-4"
        >
          {saving ? "Saving..." : "Save Product"}
        </button>
      </div>
    </div>
  );
};

export default AddProduct;
