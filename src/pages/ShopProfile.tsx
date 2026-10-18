import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationStore } from "@/contexts/LocationContext";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Check, Camera, Store, FileText, Percent, MapPin, Building2, Warehouse } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";

interface BranchProfileData {
  id: string;
  name: string;
  type: "branch" | "warehouse";
  proprietor_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  drug_license: string | null;
  trade_license: string | null;
  invoice_footer: string | null;
  logo_url: string | null;
  cover_url: string | null;
  default_discount: number | null;
  code?: string | null;
}

const ShopProfile = () => {
  const { profile, pharmacyName } = useAuth();
  const { 
    activeLocation, 
    locations, 
    setActiveLocation, 
    updateLocation, 
    currentUserRole 
  } = useLocationStore();

  const [branchData, setBranchData] = useState<BranchProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    proprietor_name: "",
    address: "",
    phone: "",
    email: "",
    drug_license: "",
    trade_license: "",
  });
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [defaultDiscount, setDefaultDiscount] = useState("10");
  const [saving, setSaving] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);
  const [savingDiscount, setSavingDiscount] = useState(false);

  const effectiveRole = (currentUserRole || profile?.role || "").toLowerCase().trim();
  const isOwner = effectiveRole === "owner" || effectiveRole === "admin";

  // Re-fetch or sync branch profile whenever the active location changes
  useEffect(() => {
    if (!activeLocation?.id) return;

    let isMounted = true;
    const fetchActiveBranch = async () => {
      // 1. Pre-fill immediately with hierarchical fallback from activeLocation and auth profile
      const initialProprietor = activeLocation.proprietor_name || profile?.full_name || null;
      const initialPhone = activeLocation.phone || profile?.phone || null;
      const initialEmail = activeLocation.email || (profile as any)?.email || null;

      const initialBranch: BranchProfileData = {
        id: activeLocation.id,
        name: activeLocation.name || "Branch",
        type: activeLocation.type,
        proprietor_name: initialProprietor,
        address: activeLocation.address || null,
        phone: initialPhone,
        email: initialEmail,
        drug_license: activeLocation.drug_license || null,
        trade_license: activeLocation.trade_license || null,
        invoice_footer: activeLocation.invoice_footer || null,
        logo_url: activeLocation.logo_url || null,
        cover_url: activeLocation.cover_url || null,
        default_discount: activeLocation.default_discount ?? 10,
        code: activeLocation.code || null,
      };

      if (isMounted) {
        setBranchData(initialBranch);
        setEditForm({
          name: initialBranch.name,
          proprietor_name: initialBranch.proprietor_name || "",
          address: initialBranch.address || "",
          phone: initialBranch.phone || "",
          email: initialBranch.email || "",
          drug_license: initialBranch.drug_license || "",
          trade_license: initialBranch.trade_license || "",
        });
        setInvoiceFooter(initialBranch.invoice_footer || "");
        setDefaultDiscount(String(initialBranch.default_discount ?? 10));
      }

      // 2. Fetch fresh details from shop_locations for the active branch with hierarchical backfill
      try {
        const { data, error } = await supabase
          .from("shop_locations" as any)
          .select("*")
          .eq("id", activeLocation.id)
          .maybeSingle();

        if (!error && data && isMounted) {
          let resolvedProprietor = (data as any).proprietor_name || null;
          let resolvedPhone = (data as any).phone || null;
          let resolvedEmail = (data as any).email || null;

          // Hierarchical fallback: if null on branch, resolve from parent pharmacy & owner profile
          if (!resolvedProprietor || !resolvedPhone || !resolvedEmail) {
            try {
              if (profile?.pharmacy_id) {
                const { data: parentPharm } = await supabase
                  .from("pharmacies")
                  .select("proprietor_name, phone, email")
                  .eq("id", profile.pharmacy_id)
                  .maybeSingle();

                if (parentPharm) {
                  if (!resolvedProprietor) resolvedProprietor = parentPharm.proprietor_name || null;
                  if (!resolvedPhone) resolvedPhone = parentPharm.phone || null;
                  if (!resolvedEmail) resolvedEmail = parentPharm.email || null;
                }
              }
              if (!resolvedProprietor && profile?.full_name) {
                resolvedProprietor = profile.full_name;
              }
              if (!resolvedPhone && profile?.phone) {
                resolvedPhone = profile.phone;
              }
              if (!resolvedEmail && (profile as any)?.email) {
                resolvedEmail = (profile as any).email;
              }
            } catch (fallbackErr) {
              console.warn("[ShopProfile] Fallback resolution warning:", fallbackErr);
            }
          }

          const freshBranch: BranchProfileData = {
            id: (data as any).id,
            name: (data as any).name || "Branch",
            type: (data as any).type as "branch" | "warehouse",
            proprietor_name: resolvedProprietor,
            address: (data as any).address || null,
            phone: resolvedPhone,
            email: resolvedEmail,
            drug_license: (data as any).drug_license || null,
            trade_license: (data as any).trade_license || null,
            invoice_footer: (data as any).invoice_footer || null,
            logo_url: (data as any).logo_url || null,
            cover_url: (data as any).cover_url || null,
            default_discount: (data as any).default_discount !== null ? Number((data as any).default_discount) : 10,
            code: (data as any).code || null,
          };
          setBranchData(freshBranch);
          setEditForm({
            name: freshBranch.name,
            proprietor_name: freshBranch.proprietor_name || "",
            address: freshBranch.address || "",
            phone: freshBranch.phone || "",
            email: freshBranch.email || "",
            drug_license: freshBranch.drug_license || "",
            trade_license: freshBranch.trade_license || "",
          });
          setInvoiceFooter(freshBranch.invoice_footer || "");
          setDefaultDiscount(String(freshBranch.default_discount ?? 10));

          // If branch record in database was missing these fields, auto-heal it
          if (
            isOwner &&
            (!(data as any).proprietor_name && resolvedProprietor ||
             !(data as any).phone && resolvedPhone ||
             !(data as any).email && resolvedEmail)
          ) {
            supabase
              .from("shop_locations" as any)
              .update({
                proprietor_name: resolvedProprietor,
                phone: resolvedPhone,
                email: resolvedEmail,
              })
              .eq("id", (data as any).id)
              .then(() => {});
          }
        }
      } catch (err) {
        console.warn("[ShopProfile] Error fetching fresh shop_locations details:", err);
      }
    };

    fetchActiveBranch();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocation?.id, profile?.id, profile?.pharmacy_id]);

  const handleImageUpload = async (type: "logo" | "cover", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeLocation?.id) return;
    const ext = file.name.split(".").pop();
    const path = `branch-${activeLocation.id}/${type}.${ext}`;
    
    const { error } = await supabase.storage.from("pharmacy-assets").upload(path, file, { upsert: true });
    if (error) { 
      toast({ title: "Upload failed", description: error.message, variant: "destructive" }); 
      return; 
    }
    const { data: urlData } = supabase.storage.from("pharmacy-assets").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();
    const col = type === "logo" ? "logo_url" : "cover_url";

    const success = await updateLocation(activeLocation.id, { [col]: url });
    if (success) {
      setBranchData((prev) => (prev ? { ...prev, [col]: url } : null));
      toast({ title: `Branch ${type === "logo" ? "Logo" : "Cover"} updated!` });
    }
  };

  const handleSaveInfo = async () => {
    if (!activeLocation?.id) return;
    setSaving(true);

    const updatePayload = {
      name: editForm.name.trim(),
      proprietor_name: editForm.proprietor_name.trim(),
      address: editForm.address.trim(),
      phone: editForm.phone.trim(),
      email: editForm.email.trim(),
      drug_license: editForm.drug_license.trim(),
      trade_license: editForm.trade_license.trim(),
    };

    const success = await updateLocation(activeLocation.id, updatePayload);
    setSaving(false);

    if (success) {
      setBranchData((prev) => (prev ? { ...prev, ...updatePayload } : null));
      setEditing(false);
      toast({ title: "Branch outlet details updated successfully!" });

      // Synchronize with parent pharmacy if this is the main branch or single outlet
      if (profile?.pharmacy_id && (activeLocation.is_main || locations.length <= 1)) {
        supabase
          .from("pharmacies")
          .update({
            proprietor_name: updatePayload.proprietor_name || null,
            phone: updatePayload.phone || null,
            email: updatePayload.email || null,
            address: updatePayload.address || null,
          })
          .eq("id", profile.pharmacy_id)
          .then(() => {});
      }
    }
  };

  const handleSaveFooter = async () => {
    if (!activeLocation?.id) return;
    setSavingFooter(true);
    const success = await updateLocation(activeLocation.id, { invoice_footer: invoiceFooter.trim() });
    setSavingFooter(false);
    if (success) {
      setBranchData((prev) => (prev ? { ...prev, invoice_footer: invoiceFooter.trim() } : null));
      toast({ title: "Branch invoice footer saved!" });
    }
  };

  const handleSaveDiscount = async () => {
    if (!activeLocation?.id) return;
    const val = parseFloat(defaultDiscount);
    if (isNaN(val) || val < 0 || val > 100) {
      toast({ title: "Invalid discount", description: "Enter a value between 0 and 100", variant: "destructive" });
      return;
    }
    setSavingDiscount(true);
    const success = await updateLocation(activeLocation.id, { default_discount: val });
    setSavingDiscount(false);
    if (success) {
      setBranchData((prev) => (prev ? { ...prev, default_discount: val } : null));
      toast({ title: "Branch default discount saved!" });
    }
  };

  const infoFields = [
    { label: "Branch Outlet Name", key: "name" as const },
    { label: "Proprietor / Branch In-charge", key: "proprietor_name" as const },
    { label: "Branch Phone Number", key: "phone" as const },
    { label: "Branch Email Address", key: "email" as const },
    { label: "Drug License No.", key: "drug_license" as const },
    { label: "Trade License No.", key: "trade_license" as const },
    { label: "Physical Address", key: "address" as const },
  ];

  return (
    <div className="min-h-[calc(100vh-72px)] bg-background pb-12">
      {/* Header & Hierarchy Breadcrumb */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Shop & Branch Profile</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configuring live identity and invoice details for active branch
            </p>
          </div>
          {pharmacyName && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
              <Building2 size={13} className="text-slate-500" />
              <span>Mother Tenant: <strong className="text-slate-900">{pharmacyName}</strong></span>
            </div>
          )}
        </div>

        {/* Branch Workspace Switcher Tabs */}
        {locations.length > 1 && (
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">
              Select Outlet:
            </span>
            {locations.map((loc) => {
              const isActive = loc.id === activeLocation?.id;
              const isWh = loc.type === "warehouse";
              return (
                <button
                  key={loc.id}
                  onClick={() => setActiveLocation(loc.id)}
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    isActive
                      ? "bg-[#CC3333] text-white border-[#CC3333] shadow-xs"
                      : "bg-card text-foreground hover:bg-muted border-border"
                  }`}
                >
                  {isWh ? <Warehouse size={13} /> : <Store size={13} />}
                  <span>{loc.name}</span>
                  {isActive && <Check size={12} className="stroke-[3]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cover & Logo */}
      <div className="relative mx-4 rounded-3xl overflow-hidden bg-muted" style={{ height: 180 }}>
        {branchData?.cover_url ? (
          <img src={branchData.cover_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100">
            <Store size={48} className="text-emerald-400 mb-1" />
            <span className="text-xs font-medium text-slate-500">{branchData?.name || "Branch Outlet"}</span>
          </div>
        )}
        {isOwner && (
          <label className="absolute top-3 right-3 p-2 rounded-full bg-white/90 backdrop-blur cursor-pointer shadow hover:bg-white transition border border-slate-200">
            <Camera size={18} className="text-[#CC3333]" />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload("cover", e)} />
          </label>
        )}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
          <div className="relative">
            <label className={isOwner ? "cursor-pointer" : ""}>
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                {branchData?.logo_url ? <AvatarImage src={branchData.logo_url} className="object-cover" /> : null}
                <AvatarFallback className="bg-red-50 text-[#CC3333] text-2xl font-bold border border-red-100">
                  {branchData?.name?.[0] || "B"}
                </AvatarFallback>
              </Avatar>
              {isOwner && (
                <>
                  <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[#CC3333] shadow border-2 border-background">
                    <Camera size={14} className="text-white" />
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload("logo", e)} />
                </>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* Active Branch Badge */}
      <div className="mt-12 text-center px-4">
        <h2 className="text-xl font-extrabold text-foreground tracking-tight">
          {branchData?.name || "Active Branch"}
        </h2>
        <div className="inline-flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
          <MapPin size={13} className="text-[#CC3333]" />
          <span>{branchData?.address || "Address not configured"}</span>
        </div>
      </div>

      <div className="mt-6 px-4">
        <Accordion type="multiple" defaultValue={["branch-info"]} className="space-y-4">
          {/* Outlet Details */}
          <AccordionItem value="branch-info" className="bg-card rounded-3xl border border-border shadow-xs overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-50 text-[#CC3333]">
                  <Store size={18} />
                </div>
                <div className="text-left">
                  <span className="text-base font-bold text-foreground block">Branch Information</span>
                  <span className="text-xs text-muted-foreground">Outlet name, phone, address, and license data</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="flex justify-end mb-3">
                {isOwner && (
                  <button
                    onClick={() => (editing ? handleSaveInfo() : setEditing(true))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-[#CC3333] hover:bg-red-100 font-medium text-xs transition"
                    disabled={saving}
                  >
                    {editing ? (
                      <>
                        <Check size={15} />
                        <span>{saving ? "Saving..." : "Save Details"}</span>
                      </>
                    ) : (
                      <>
                        <Pencil size={15} />
                        <span>Edit Details</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {infoFields.map(({ label, key }) => (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground font-medium">{label}</label>
                    {editing ? (
                      <Input
                        value={editForm[key]}
                        onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                        className="mt-1 rounded-xl border-border focus-visible:ring-[#CC3333]"
                      />
                    ) : (
                      <p className="text-sm font-medium text-foreground mt-0.5">
                        {(branchData as any)?.[key] || "—"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Billing & Invoice Customization */}
          <AccordionItem value="billing" className="bg-card rounded-3xl border border-border shadow-xs overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-50 text-[#CC3333]">
                  <FileText size={18} />
                </div>
                <div className="text-left">
                  <span className="text-base font-bold text-foreground block">Branch Invoice Customization</span>
                  <span className="text-xs text-muted-foreground">Footer notes printed on invoices issued by this branch</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <label className="text-xs text-muted-foreground font-medium">Invoice Footer Note</label>
              <Textarea
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
                placeholder='e.g. "No returns after 7 days. Thank you for shopping with us!"'
                className="mt-1 rounded-xl border-border focus-visible:ring-[#CC3333] min-h-[80px]"
                disabled={!isOwner}
              />
              {isOwner && (
                <Button
                  onClick={handleSaveFooter}
                  disabled={savingFooter}
                  className="mt-3 w-full rounded-xl bg-[#CC3333] hover:bg-red-700 text-white"
                >
                  {savingFooter ? "Saving..." : "Save Branch Footer"}
                </Button>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Branch Default Discount */}
          <AccordionItem value="discount" className="bg-card rounded-3xl border border-border shadow-xs overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-50 text-[#CC3333]">
                  <Percent size={18} />
                </div>
                <div className="text-left">
                  <span className="text-base font-bold text-foreground block">Default Discount Settings</span>
                  <span className="text-xs text-muted-foreground">Default discount applied at checkout in this branch</span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <p className="text-xs text-muted-foreground mb-3">
                This discount will auto-apply to every new sale in this branch. Staff can adjust per transaction if authorized.
              </p>
              <label className="text-xs text-muted-foreground font-medium">Branch Default Discount (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={defaultDiscount}
                onChange={(e) => setDefaultDiscount(e.target.value)}
                className="mt-1 rounded-xl border-border focus-visible:ring-[#CC3333]"
                disabled={!isOwner}
              />
              {isOwner && (
                <Button
                  onClick={handleSaveDiscount}
                  disabled={savingDiscount}
                  className="mt-3 w-full rounded-xl bg-[#CC3333] hover:bg-red-700 text-white"
                >
                  {savingDiscount ? "Saving..." : "Save Branch Discount"}
                </Button>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default ShopProfile;
