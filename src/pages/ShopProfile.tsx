import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Pencil, Check, Camera, Trash2, Send, Store, Plus, AlertTriangle, Users, FileText, Percent, Link2, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface PharmacyData {
  id: string;
  name: string;
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
}

interface StaffMember {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  token?: string | null;
  expires_at?: string | null;
}

const ShopProfile = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [pharmacy, setPharmacy] = useState<PharmacyData | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", proprietor_name: "", address: "", phone: "", email: "",
    drug_license: "", trade_license: "",
  });
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [defaultDiscount, setDefaultDiscount] = useState("10");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("salesman");
  const [inviting, setInviting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; email: string; role: string; url: string }>({
    open: false, email: "", role: "", url: "",
  });

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (profile?.pharmacy_id) {
      fetchPharmacy();
      if (isAdmin) fetchStaff();
    }
  }, [profile?.pharmacy_id, isAdmin]);

  const fetchPharmacy = async () => {
    if (isAdmin) {
      // Admins can read the full row (including license + contact fields)
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
          proprietor_name: p.proprietor_name || "",
          address: p.address || "",
          phone: p.phone || "",
          email: p.email || "",
          drug_license: p.drug_license || "",
          trade_license: p.trade_license || "",
        });
        setInvoiceFooter(p.invoice_footer || "");
        setDefaultDiscount(String(p.default_discount ?? 10));
      }
    } else {
      // Non-admins see only non-sensitive fields via security-definer RPC
      const { data } = await supabase.rpc("get_my_pharmacy_public" as any);
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        const p: PharmacyData = {
          id: row.id,
          name: row.name,
          proprietor_name: null,
          address: row.address,
          phone: null,
          email: null,
          drug_license: null,
          trade_license: null,
          invoice_footer: row.invoice_footer,
          logo_url: row.logo_url,
          cover_url: row.cover_url,
          default_discount: row.default_discount,
        };
        setPharmacy(p);
        setInvoiceFooter(p.invoice_footer || "");
        setDefaultDiscount(String(p.default_discount ?? 10));
      }
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
      proprietor_name: editForm.proprietor_name,
      address: editForm.address,
      phone: editForm.phone,
      email: editForm.email,
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

  const handleSaveDiscount = async () => {
    if (!pharmacy) return;
    const val = parseFloat(defaultDiscount);
    if (isNaN(val) || val < 0 || val > 100) {
      toast({ title: "Invalid discount", description: "Enter a value between 0 and 100", variant: "destructive" });
      return;
    }
    setSavingDiscount(true);
    const { error } = await supabase.from("pharmacies").update({ default_discount: val } as any).eq("id", pharmacy.id);
    setSavingDiscount(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setPharmacy({ ...pharmacy, default_discount: val });
    toast({ title: "Default discount saved!" });
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
    setLinkDialog({
      open: true,
      email: data?.email ?? inviteEmail.trim(),
      role: data?.role ?? inviteRole,
      url: data?.acceptUrl ?? "",
    });
    setInviteEmail("");
    fetchStaff();
  };

  const handleRemoveStaff = async (id: string) => {
    const { error } = await supabase.from("shop_staff").delete().eq("id", id);
    if (error) { toast({ title: "Remove failed", variant: "destructive" }); return; }
    setStaff(staff.filter((s) => s.id !== id));
    toast({ title: "Staff member removed" });
  };

  const handleRevokeInvite = async (id: string) => {
    const { error } = await supabase.from("shop_staff").update({ status: "revoked" } as any).eq("id", id);
    if (error) { toast({ title: "Revoke failed", description: error.message, variant: "destructive" }); return; }
    setStaff(staff.map((s) => (s.id === id ? { ...s, status: "revoked" } : s)));
    toast({ title: "Invitation revoked" });
  };

  const handleResendInvite = async (email: string, role: string) => {
    const { data, error } = await supabase.functions.invoke("invite-staff", { body: { email, role } });
    if (error || data?.error) {
      toast({ title: "Resend failed", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    setLinkDialog({
      open: true,
      email: data?.email ?? email,
      role: data?.role ?? role,
      url: data?.acceptUrl ?? "",
    });
    fetchStaff();
  };

  const buildAcceptUrl = (token: string) => `${window.location.origin}/accept-invitation?token=${token}`;

  const handleShowExistingLink = (s: StaffMember) => {
    if (!s.token) {
      toast({ title: "Link unavailable", description: "Resend the invitation to generate a new link.", variant: "destructive" });
      return;
    }
    setLinkDialog({
      open: true,
      email: s.email,
      role: s.role,
      url: buildAcceptUrl(s.token),
    });
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share it with the invitee." });
    } catch {
      toast({ title: "Copy failed", description: "Select and copy the link manually.", variant: "destructive" });
    }
  };


  const infoFields = [
    { label: "Pharmacy Name", key: "name" as const },
    { label: "Proprietor Name", key: "proprietor_name" as const },
    { label: "Shop Mobile Number", key: "phone" as const },
    { label: "Shop Email Address", key: "email" as const },
    { label: "Drug License No.", key: "drug_license" as const },
    { label: "Trade License No.", key: "trade_license" as const },
    { label: "Address", key: "address" as const },
  ];

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
          <label className="absolute top-3 right-3 p-2 rounded-full bg-white/80 backdrop-blur cursor-pointer shadow border-secondary-foreground border">
            <Camera size={18} className="text-emerald-600" />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload("cover", e)} />
          </label>
        )}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
          <div className="relative">
            <label className={isAdmin ? "cursor-pointer py-0 my-0 mt-0 px-0 pt-0 mx-0 mr-0 ml-0 pb-0 pl-[350px] mb-0" : ""}>
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg mt-0 my-[2px] py-[10px] px-0 pb-0 pt-0 mb-[20px] mr-0 ml-0">
                {pharmacy?.logo_url ? <AvatarImage src={pharmacy.logo_url} className="object-cover mx-0 mt-0 mb-0 pt-0 pb-0" /> : null}
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-2xl font-bold">
                  {pharmacy?.name?.[0] || "P"}
                </AvatarFallback>
              </Avatar>
              {isAdmin && (
                <>
                  <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-emerald-600 shadow border-2 border-background px-[6px] mt-0 mb-[30px] mr-[10px]">
                    <Camera size={14} className="text-white" />
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload("logo", e)} />
                </>
              )}
            </label>
          </div>
        </div>
      </div>

      <div className="mt-14 px-4">
        <Accordion type="multiple" className="space-y-4">
          {/* Shop Information */}
          <AccordionItem value="shop-info" className="bg-card rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50">
                  <Store size={18} className="text-emerald-600" />
                </div>
                <span className="text-base font-bold text-foreground">Shop Information</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <div className="flex justify-end mb-3">
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
                {infoFields.map(({ label, key }) => (
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
            </AccordionContent>
          </AccordionItem>

          {/* Staff Management */}
          <AccordionItem value="staff" className="bg-card rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50">
                  <Users size={18} className="text-emerald-600" />
                </div>
                <span className="text-base font-bold text-foreground">Manage Staff</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              {isAdmin && (
                <div className="space-y-3 mb-5">
                  <Input
                    placeholder="Staff email address"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="rounded-xl border-emerald-200 focus-visible:ring-emerald-500"
                  />
                  <div className="flex gap-2 items-start">
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
                      <Send size={14} /> {inviting ? "Sending..." : "Send"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Invitations expire after 7 days.</p>
                </div>
              )}
              <div className="space-y-2">
                {staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No staff members yet</p>
                ) : (
                  staff.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 bg-muted rounded-2xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.email}</p>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] capitalize rounded-lg">{s.role}</Badge>
                          <Badge
                            className={`text-[10px] rounded-lg capitalize ${
                              s.status === "accepted" || s.status === "active"
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : s.status === "pending"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : s.status === "revoked"
                                ? "bg-gray-200 text-gray-600 border-gray-300"
                                : "bg-rose-100 text-rose-700 border-rose-200"
                            }`}
                          >
                            {s.status === "accepted" || s.status === "active" ? "Accepted" : s.status}
                          </Badge>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          {s.status === "pending" && (
                            <button
                              onClick={() => handleResendInvite(s.email, s.role)}
                              className="p-2 rounded-full hover:bg-emerald-100"
                              title="Resend invitation"
                            >
                              <Send size={14} className="text-emerald-600" />
                            </button>
                          )}
                          {s.status === "pending" && (
                            <button
                              onClick={() => handleRevokeInvite(s.id)}
                              className="p-2 rounded-full hover:bg-amber-100"
                              title="Revoke invitation"
                            >
                              <AlertTriangle size={14} className="text-amber-600" />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveStaff(s.id)}
                            className="p-2 rounded-full hover:bg-destructive/10"
                            title="Remove"
                          >
                            <Trash2 size={16} className="text-destructive" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Billing Customization */}
          <AccordionItem value="billing" className="bg-card rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50">
                  <FileText size={18} className="text-emerald-600" />
                </div>
                <span className="text-base font-bold text-foreground">Billing Customization</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
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
            </AccordionContent>
          </AccordionItem>

          {/* Default Discount Settings */}
          <AccordionItem value="discount" className="bg-card rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-50">
                  <Percent size={18} className="text-emerald-600" />
                </div>
                <span className="text-base font-bold text-foreground">Default Discount Settings</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5">
              <p className="text-xs text-muted-foreground mb-3">
                This discount will auto-apply to every new sale. Staff can override it per transaction.
              </p>
              <label className="text-xs text-muted-foreground font-medium">Global Default Discount (%)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={defaultDiscount}
                onChange={(e) => setDefaultDiscount(e.target.value)}
                className="mt-1 rounded-xl border-emerald-200 focus-visible:ring-emerald-500"
                disabled={!isAdmin}
              />
              {isAdmin && (
                <Button
                  onClick={handleSaveDiscount}
                  disabled={savingDiscount}
                  className="mt-3 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {savingDiscount ? "Saving..." : "Save Discount"}
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
