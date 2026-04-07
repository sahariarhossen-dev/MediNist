import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Pencil, Check, Camera, Trash2, Send, Store, Plus, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";

interface PharmacyData {
  id: string;
  name: string;
  address: string | null;
  drug_license: string | null;
  trade_license: string | null;
  invoice_footer: string | null;
  logo_url: string | null;
  cover_url: string | null;
}

interface StaffMember {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

const ShopProfile = () => {
  const navigate = useNavigate();
  const { profile, pharmacyName } = useAuth();
  const [pharmacy, setPharmacy] = useState<PharmacyData | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", proprietor_name: "", address: "", drug_license: "", trade_license: "" });
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("salesman");
  const [inviting, setInviting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);

  useEffect(() => {
    if (profile?.pharmacy_id) {
      fetchPharmacy();
      fetchStaff();
    }
  }, [profile?.pharmacy_id]);

  const fetchPharmacy = async () => {
    const { data } = await supabase
      .from("pharmacies")
      .select("*")
      .eq("id", profile!.pharmacy_id!)
      .single();
    if (data) {
      const p = data as unknown as PharmacyData;
      setPharmacy(p);
      setEditForm({
        name: p.name || "",
        address: p.address || "",
        drug_license: p.drug_license || "",
        trade_license: p.trade_license || "",
      });
      setInvoiceFooter(p.invoice_footer || "");
    }
  };

  const fetchStaff = async () => {
    const { data } = await supabase
      .from("shop_staff")
      .select("*")
      .eq("pharmacy_id", profile!.pharmacy_id!)
      .order("created_at", { ascending: false });
    if (data) setStaff(data as unknown as StaffMember[]);
  };

  const handleImageUpload = async (type: "logo" | "cover", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pharmacy) return;
    const ext = file.name.split(".").pop();
    const path = `${pharmacy.id}/${type}.${ext}`;
    const { error } = await supabase.storage.from("pharmacy-assets").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return; }
    const { data: urlData } = supabase.storage.from("pharmacy-assets").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();
    const col = type === "logo" ? "logo_url" : "cover_url";
    await supabase.from("pharmacies").update({ [col]: url } as any).eq("id", pharmacy.id);
    setPharmacy({ ...pharmacy, [col]: url });
    toast({ title: `${type === "logo" ? "Logo" : "Cover"} updated!` });
  };

  const handleSaveInfo = async () => {
    if (!pharmacy) return;
    setSaving(true);
    const { error } = await supabase.from("pharmacies").update({
      name: editForm.name,
      address: editForm.address,
      drug_license: editForm.drug_license,
      trade_license: editForm.trade_license,
    } as any).eq("id", pharmacy.id);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setPharmacy({ ...pharmacy, ...editForm });
    setEditing(false);
    toast({ title: "Shop info updated!" });
  };

  const handleSaveFooter = async () => {
    if (!pharmacy) return;
    setSavingFooter(true);
    const { error } = await supabase.from("pharmacies").update({ invoice_footer: invoiceFooter } as any).eq("id", pharmacy.id);
    setSavingFooter(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setPharmacy({ ...pharmacy, invoice_footer: invoiceFooter });
    toast({ title: "Invoice footer saved!" });
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("invite-staff", {
      body: { email: inviteEmail.trim(), role: inviteRole },
    });
    setInviting(false);
    if (error || data?.error) {
      toast({ title: "Invitation failed", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Invitation sent!", description: `Invitation sent to ${inviteEmail}!` });
    setInviteEmail("");
    fetchStaff();
  };

  const handleRemoveStaff = async (id: string) => {
    const { error } = await supabase.from("shop_staff").delete().eq("id", id);
    if (error) { toast({ title: "Remove failed", variant: "destructive" }); return; }
    setStaff(staff.filter((s) => s.id !== id));
    toast({ title: "Staff member removed" });
  };

  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-muted">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">Shop Profile</h1>
      </div>

      {/* Cover & Logo */}
      <div className="relative mx-4 rounded-3xl overflow-hidden bg-muted" style={{ height: 180 }}>
        {pharmacy?.cover_url ? (
          <img src={pharmacy.cover_url} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-emerald-50">
            <Store size={48} className="text-emerald-300" />
          </div>
        )}
        {isAdmin && (
          <label className="absolute top-3 right-3 p-2 rounded-full bg-white/80 backdrop-blur cursor-pointer shadow">
            <Camera size={18} className="text-emerald-600" />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload("cover", e)} />
          </label>
        )}
        {/* Logo */}
        <div className="absolute -bottom-8 left-5">
          <div className="relative">
            <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
              {pharmacy?.logo_url ? <AvatarImage src={pharmacy.logo_url} className="object-cover" /> : null}
              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xl font-bold">
                {pharmacy?.name?.[0] || "P"}
              </AvatarFallback>
            </Avatar>
            {isAdmin && (
              <label className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-600 cursor-pointer shadow">
                <Plus size={12} className="text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload("logo", e)} />
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 px-4 space-y-4">
        {/* Shop Info Card */}
        <div className="bg-card rounded-3xl p-5 border border-emerald-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-foreground">Shop Information</h2>
            {isAdmin && (
              <button
                onClick={() => editing ? handleSaveInfo() : setEditing(true)}
                className="p-2 rounded-full bg-emerald-50"
                disabled={saving}
              >
                {editing ? <Check size={16} className="text-emerald-600" /> : <Pencil size={16} className="text-emerald-600" />}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {[
              { label: "Pharmacy Name", key: "name" as const },
              { label: "Drug License No.", key: "drug_license" as const },
              { label: "Trade License No.", key: "trade_license" as const },
              { label: "Address", key: "address" as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground font-medium">{label}</label>
                {editing ? (
                  <Input
                    value={editForm[key]}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                    className="mt-1 rounded-xl border-emerald-200 focus-visible:ring-emerald-500"
                  />
                ) : (
                  <p className="text-sm text-foreground mt-0.5">{(pharmacy as any)?.[key] || "—"}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Staff Management */}
        <div className="bg-card rounded-3xl p-5 border border-emerald-100 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-4">Manage Staff</h2>
          {isAdmin && (
            <div className="space-y-3 mb-5">
              <Input
                placeholder="Staff email address"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="rounded-xl border-emerald-200 focus-visible:ring-emerald-500"
              />
              <div className="flex gap-2">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="flex-1 h-10 rounded-xl border border-emerald-200 bg-background px-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="salesman">Salesman</option>
                  <option value="manager">Manager</option>
                </select>
                <Button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  <Send size={14} /> {inviting ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </div>
          )}
          {/* Staff List */}
          <div className="space-y-2">
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No staff members yet</p>
            ) : (
              staff.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-muted rounded-2xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.email}</p>
                    <div className="flex gap-1.5 mt-1">
                      <Badge variant="secondary" className="text-[10px] capitalize rounded-lg">{s.role}</Badge>
                      <Badge
                        className={`text-[10px] rounded-lg ${s.status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}
                      >
                        {s.status === "active" ? "Active" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => handleRemoveStaff(s.id)} className="p-2 rounded-full hover:bg-destructive/10">
                      <Trash2 size={16} className="text-destructive" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Billing Customization */}
        <div className="bg-card rounded-3xl p-5 border border-emerald-100 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-3">Billing Customization</h2>
          <label className="text-xs text-muted-foreground font-medium">Invoice Footer Note</label>
          <Textarea
            value={invoiceFooter}
            onChange={(e) => setInvoiceFooter(e.target.value)}
            placeholder='e.g. "No returns after 7 days"'
            className="mt-1 rounded-xl border-emerald-200 focus-visible:ring-emerald-500 min-h-[80px]"
            disabled={!isAdmin}
          />
          {isAdmin && (
            <Button
              onClick={handleSaveFooter}
              disabled={savingFooter}
              className="mt-3 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {savingFooter ? "Saving..." : "Save Footer"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShopProfile;
