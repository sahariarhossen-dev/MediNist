import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Pencil, Check, Camera, Trash2, Send, Store, Plus, AlertTriangle, Users, FileText, Percent, Link2, Copy, Megaphone, Trophy, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function extractInvokeError(error: any, data: any): Promise<string> {
  if (data?.error) return data.error;
  const ctx = error?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return body.error;
    } catch {
      try {
        const text = await ctx.clone().text();
        if (text) return text;
      } catch {}
    }
  }
  return error?.message || "Something went wrong. Please try again.";
}

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
  expires_at?: string | null;
  user_id?: string | null;
}

interface StaffOverviewRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: string | null;
  month_sales: number;
  month_count: number;
  monthly_target: number;
}

const ShopProfile = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [pharmacy, setPharmacy] = useState<PharmacyData | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [overview, setOverview] = useState<StaffOverviewRow[]>([]);
  const [broadcast, setBroadcast] = useState<{ id: string; message: string } | null>(null);
  const [broadcastDraft, setBroadcastDraft] = useState("");
  const [savingBroadcast, setSavingBroadcast] = useState(false);
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
      if (isAdmin) {
        fetchStaff();
      }
      fetchOverview();
      fetchBroadcast();
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
      .select("id,email,role,status,created_at,expires_at,user_id,pharmacy_id,invited_by,accepted_at")
      .eq("pharmacy_id", profile!.pharmacy_id!)
      .order("created_at", { ascending: false });
    if (data) setStaff(data as unknown as StaffMember[]);
  };

  const fetchOverview = async () => {
    const { data } = await supabase.rpc("get_pharmacy_staff_overview" as any);
    if (data) {
      const rows = (data as unknown as StaffOverviewRow[])
        .map((r) => ({
          ...r,
          month_sales: Number(r.month_sales || 0),
          monthly_target: Number(r.monthly_target || 0),
          month_count: Number(r.month_count || 0),
        }))
        .sort((a, b) => b.month_sales - a.month_sales);
      setOverview(rows);
    }
  };

  const fetchBroadcast = async () => {
    const { data } = await supabase
      .from("pharmacy_broadcasts" as any)
      .select("id, message")
      .eq("pharmacy_id", profile!.pharmacy_id!)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const b = data[0] as unknown as { id: string; message: string };
      setBroadcast(b);
      setBroadcastDraft(b.message);
    } else {
      setBroadcast(null);
      setBroadcastDraft("");
    }
  };

  const handleSaveBroadcast = async () => {
    if (!profile?.pharmacy_id || !profile?.id) return;
    const msg = broadcastDraft.trim();
    if (!msg) {
      toast({ title: "Notice is empty", variant: "destructive" });
      return;
    }
    setSavingBroadcast(true);
    // Deactivate existing active broadcasts first
    await supabase
      .from("pharmacy_broadcasts" as any)
      .update({ is_active: false } as any)
      .eq("pharmacy_id", profile.pharmacy_id)
      .eq("is_active", true);
    const { error } = await supabase.from("pharmacy_broadcasts" as any).insert({
      pharmacy_id: profile.pharmacy_id,
      created_by: profile.id,
      message: msg,
      is_active: true,
    });
    setSavingBroadcast(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Notice posted to all staff" });
    fetchBroadcast();
  };

  const handleClearBroadcast = async () => {
    if (!broadcast) return;
    const { error } = await supabase
      .from("pharmacy_broadcasts" as any)
      .update({ is_active: false } as any)
      .eq("id", broadcast.id);
    if (error) {
      toast({ title: "Failed to clear", description: error.message, variant: "destructive" });
      return;
    }
    setBroadcast(null);
    setBroadcastDraft("");
    toast({ title: "Notice cleared" });
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
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email) || email.length > 255) {
      toast({
        title: "Invalid email",
        description: "Enter a valid email address like name@example.com.",
        variant: "destructive",
      });
      return;
    }
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("invite-staff", {
      body: { email, role: inviteRole },
    });
    setInviting(false);
    if (error || data?.error) {
      const description = await extractInvokeError(error, data);
      toast({ title: "Invitation failed", description, variant: "destructive" });
      return;
    }
    setLinkDialog({
      open: true,
      email: data?.email ?? email,
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
      const description = await extractInvokeError(error, data);
      toast({ title: "Resend failed", description, variant: "destructive" });
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

          {/* Staff Management now lives on its own page: /staff-management */}
          {isAdmin && (
            <button
              onClick={() => navigate("/staff-management")}
              className="w-full bg-card rounded-3xl border border-emerald-100 shadow-sm px-5 py-4 flex items-center gap-3 text-left"
            >
              <div className="p-2 rounded-xl bg-emerald-50">
                <Users size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-base font-bold text-foreground">Manage Staff</span>
                <p className="text-xs text-muted-foreground">Roles, permissions and performance</p>
              </div>
              <ChevronRight size={18} className="text-muted-foreground shrink-0" />
            </button>
          )}


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

      {/* Invitation Link Dialog */}
      <Dialog open={linkDialog.open} onOpenChange={(o) => setLinkDialog((d) => ({ ...d, open: o }))}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Invitation Link Ready</DialogTitle>
            <DialogDescription className="text-xs">
              Share this link with <span className="font-medium text-foreground">{linkDialog.email}</span> ({linkDialog.role}). It expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 p-3 rounded-2xl bg-muted border border-emerald-100 break-all text-xs text-foreground font-mono select-all">
            {linkDialog.url}
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setLinkDialog((d) => ({ ...d, open: false }))}
              className="rounded-xl flex-1"
            >
              Close
            </Button>
            <Button
              onClick={() => handleCopyLink(linkDialog.url)}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2 flex-1"
            >
              <Copy size={14} /> Copy Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShopProfile;
