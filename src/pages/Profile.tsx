import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Camera, Pencil, LogOut, Eye, EyeOff, X, Check, Lock, ChevronDown,
  Award, Zap, Star, TrendingUp, Calendar, Coins, Users as UsersIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  StatCard, BadgeTile, fmtBdt as fmt, startOfMonthIso, startOfWeekIso,
} from "@/components/staff/PerformanceWidgets";
import { SmallCircularProgress as CircularProgress } from "@/components/staff/PerformanceWidgets";

const Profile = () => {
  const navigate = useNavigate();
  const { user, profile, pharmacyName, signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  // ---- Personal performance analytics (self only) ----
  const isAdmin = profile?.role === "admin";
  const [monthSales, setMonthSales] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [weekSales, setWeekSales] = useState(0);
  const [loyalty, setLoyalty] = useState(0);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [basicSalary, setBasicSalary] = useState(0);
  const [advances, setAdvances] = useState(0);
  const [winners, setWinners] = useState<{ topSeller?: string; fastestBiller?: string; customerFavorite?: string }>({});
  const [editingTarget, setEditingTarget] = useState(false);
  const [draftTarget, setDraftTarget] = useState(0);
  const [savingTarget, setSavingTarget] = useState(false);

  useEffect(() => {
    if (!user?.id || !profile?.pharmacy_id) return;
    let cancelled = false;
    (async () => {
      const monthStart = startOfMonthIso();
      const weekStart = startOfWeekIso();

      // Settings (target + commission)
      const { data: setData } = await supabase
        .from("staff_settings" as any)
        .select("monthly_target, commission_percent, basic_salary, advances")
        .eq("pharmacy_id", profile.pharmacy_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && setData) {
        const s = setData as unknown as {
          monthly_target: number; commission_percent: number;
          basic_salary: number; advances: number;
        };
        setMonthlyTarget(Number(s.monthly_target || 0));
        setDraftTarget(Number(s.monthly_target || 0));
        setCommissionPercent(Number(s.commission_percent || 0));
        setBasicSalary(Number(s.basic_salary || 0));
        setAdvances(Number(s.advances || 0));
      }

      // Pharmacy-wide month sales (needed both for personal totals + winners)
      const { data: monthRows } = await supabase
        .from("sales")
        .select("id, total, created_at, user_id")
        .eq("pharmacy_id", profile.pharmacy_id)
        .eq("status", "completed")
        .gte("created_at", monthStart);
      const mine = (monthRows || []).filter((r: any) => r.user_id === user.id);
      if (!cancelled) {
        setMonthSales(mine.reduce((s: number, r: any) => s + Number(r.total || 0), 0));
        setMonthCount(mine.length);
        setWeekSales(
          mine.filter((r: any) => r.created_at >= weekStart)
            .reduce((s: number, r: any) => s + Number(r.total || 0), 0),
        );
      }

      const totals = new Map<string, { sales: number; count: number }>();
      for (const r of monthRows || []) {
        const t = totals.get((r as any).user_id) || { sales: 0, count: 0 };
        t.sales += Number((r as any).total || 0);
        t.count += 1;
        totals.set((r as any).user_id, t);
      }
      const topSeller = [...totals.entries()].sort((a, b) => b[1].sales - a[1].sales)[0]?.[0];
      const fastestBiller = [...totals.entries()].sort((a, b) => b[1].count - a[1].count)[0]?.[0];

      // Customer favorite + loyalty via customer_ledger
      const { data: ledgerRows } = await supabase
        .from("customer_ledger")
        .select("customer_id, occurred_at, user_id")
        .eq("pharmacy_id", profile.pharmacy_id)
        .gte("occurred_at", monthStart);

      const distinctByUser = new Map<string, Set<string>>();
      for (const r of ledgerRows || []) {
        const u = (r as any).user_id;
        const c = (r as any).customer_id;
        if (!u || !c) continue;
        if (!distinctByUser.has(u)) distinctByUser.set(u, new Set());
        distinctByUser.get(u)!.add(c);
      }
      const customerFavorite =
        [...distinctByUser.entries()].sort((a, b) => b[1].size - a[1].size)[0]?.[0];

      const myCustomers = distinctByUser.get(user.id) || new Set<string>();
      let loyaltyCount = 0;
      if (myCustomers.size > 0) {
        const { data: prior } = await supabase
          .from("customer_ledger")
          .select("customer_id")
          .eq("pharmacy_id", profile.pharmacy_id)
          .lt("occurred_at", monthStart)
          .in("customer_id", [...myCustomers]);
        const priorSet = new Set((prior || []).map((r: any) => r.customer_id));
        for (const c of myCustomers) if (priorSet.has(c)) loyaltyCount++;
      }

      if (!cancelled) {
        setLoyalty(loyaltyCount);
        setWinners({ topSeller, fastestBiller, customerFavorite });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, profile?.pharmacy_id]);

  const commission = useMemo(
    () => (monthSales * (commissionPercent || 0)) / 100,
    [monthSales, commissionPercent],
  );
  const targetPct = monthlyTarget > 0
    ? Math.min(100, Math.round((monthSales / monthlyTarget) * 100))
    : 0;

  const saveTarget = async () => {
    if (!user?.id || !profile?.pharmacy_id || !isAdmin) return;
    setSavingTarget(true);
    const { error } = await supabase
      .from("staff_settings" as any)
      .upsert(
        { pharmacy_id: profile.pharmacy_id, user_id: user.id, monthly_target: draftTarget },
        { onConflict: "pharmacy_id,user_id" },
      );
    setSavingTarget(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setMonthlyTarget(draftTarget);
    setEditingTarget(false);
    toast({ title: "Target updated" });
  };

  const getPasswordStrength = (pw: string) => {
    if (!pw) return { label: "", color: "", percent: 0 };
    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    if (pw.length >= 10 && hasUpper && hasLower && hasNumber && hasSpecial)
      return { label: "Strong", color: "text-green-500", barColor: "bg-green-500", percent: 100 };
    if (pw.length >= 8 && ((hasLower || hasUpper) && hasNumber))
      return { label: "Normal", color: "text-yellow-500", barColor: "bg-yellow-500", percent: 66 };
    return { label: "Weak", color: "text-red-500", barColor: "bg-red-500", percent: 33 };
  };

  const strength = getPasswordStrength(newPassword);
  const canUpdatePassword = strength.label === "Normal" || strength.label === "Strong";

  const handleUpdatePassword = async () => {
    if (!canUpdatePassword) return;
    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password updated successfully!" });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setUpdatingPassword(false);
    }
  };

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const memberId = user?.id ? user.id.slice(0, 8).toUpperCase() : "—";

  const startEditing = () => {
    setEditName(profile?.full_name || "");
    setEditPhone(profile?.phone || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: editName.trim() || null, phone: editPhone.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setEditing(false);
      toast({ title: "Profile updated!" });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2MB allowed.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      await refreshProfile();
      toast({ title: "Avatar updated!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={() => navigate("/", { replace: true })} className="p-2 rounded-full hover:bg-muted transition">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h1 className="text-lg font-bold text-foreground">My Profile</h1>
      </div>

      {/* Avatar Upload */}
      <div className="flex flex-col items-center pt-2 pb-5">
        <div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}>
          <Avatar className="h-28 w-28 border-4 border-primary shadow-lg">
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="Avatar" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="absolute bottom-1 right-1 h-8 w-8 rounded-full bg-primary flex items-center justify-center shadow-md">
            <Camera size={14} className="text-primary-foreground" />
          </div>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
              <div className="animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full" />
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
        <p className="mt-3 text-base font-semibold text-foreground">{profile?.full_name || "User"}</p>
        <p className="text-xs text-muted-foreground">{pharmacyName || "—"}</p>
      </div>

      {/* Identity Card */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">User Identity</h2>
            {!editing ? (
              <button onClick={startEditing} className="p-1.5 rounded-full hover:bg-muted transition">
                <Pencil size={14} className="text-muted-foreground" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button onClick={cancelEditing} className="p-1.5 rounded-full hover:bg-muted transition">
                  <X size={14} className="text-muted-foreground" />
                </button>
                <button onClick={saveProfile} disabled={saving} className="p-1.5 rounded-full hover:bg-primary/10 transition">
                  <Check size={14} className="text-primary" />
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Full Name</span>
              {editing ? (
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 w-40 text-xs text-right" />
              ) : (
                <span className="text-xs font-medium text-foreground">{profile?.full_name || "—"}</span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Member ID</span>
              <span className="text-xs font-mono font-medium text-foreground">{memberId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Designation</span>
              <span className="text-xs font-medium text-foreground capitalize">{profile?.role || "Staff"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Phone</span>
              {editing ? (
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-7 w-40 text-xs text-right" />
              ) : (
                <span className="text-xs font-medium text-foreground">{profile?.phone || "—"}</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Personal performance — analytics grid */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-3">
        <StatCard icon={<TrendingUp size={16} />} iconBg="bg-emerald-100 text-emerald-700"
          label="This Month" value={fmt(monthSales)} sub={`${monthCount} sales`} />
        <StatCard icon={<Calendar size={16} />} iconBg="bg-sky-100 text-sky-700"
          label="This Week" value={fmt(weekSales)} />
        <StatCard icon={<Coins size={16} />} iconBg="bg-amber-100 text-amber-700"
          label="Commission" value={fmt(commission)} sub={`${commissionPercent || 0}% of sales`} />
        <StatCard icon={<UsersIcon size={16} />} iconBg="bg-violet-100 text-violet-700"
          label="Loyalty Score" value={String(loyalty)} sub="repeat customers" />
      </div>

      {/* Monthly Target — circular progress */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Monthly Target</h2>
            {isAdmin && !editingTarget && (
              <button
                onClick={() => { setDraftTarget(monthlyTarget); setEditingTarget(true); }}
                className="p-1.5 rounded-full hover:bg-muted transition"
                aria-label="Edit target"
              >
                <Pencil size={14} className="text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-5">
            <CircularProgress percent={targetPct} />
            <div className="flex-1 space-y-2">
              {editingTarget ? (
                <>
                  <Input
                    type="number"
                    value={draftTarget}
                    onChange={(e) => setDraftTarget(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-9 rounded-xl"
                    placeholder="Monthly target ৳"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={savingTarget} onClick={saveTarget}
                      className="rounded-xl h-8 flex-1 bg-primary">
                      <Check size={14} /> Save
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl h-8"
                      onClick={() => { setDraftTarget(monthlyTarget); setEditingTarget(false); }}>
                      <X size={14} />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Target</p>
                    <p className="text-sm font-bold text-foreground">৳{monthlyTarget.toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Achievement</p>
                    <p className="text-sm font-bold text-primary">৳{Math.round(monthSales).toLocaleString("en-IN")} ({targetPct}%)</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Achievements */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Achievements</h2>
          <div className="grid grid-cols-3 gap-3">
            <BadgeTile icon={<Award size={20} />} label="Top Seller"
              earned={winners.topSeller === user?.id} color="amber" />
            <BadgeTile icon={<Zap size={20} />} label="Fastest Biller"
              earned={winners.fastestBiller === user?.id} color="sky" />
            <BadgeTile icon={<Star size={20} />} label="Customer Favorite"
              earned={winners.customerFavorite === user?.id} color="rose" />
          </div>
        </Card>
      </div>

      {/* Earnings This Month */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Earnings This Month</h2>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between py-1">
              <p className="text-sm text-muted-foreground">Basic Salary</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{fmt(basicSalary)}</p>
            </div>
            <div className="flex items-center justify-between py-1">
              <p className="text-sm text-muted-foreground">Commission ({commissionPercent || 0}%)</p>
              <p className="text-sm font-semibold tabular-nums text-emerald-700">+ {fmt(commission)}</p>
            </div>
            <div className="flex items-center justify-between py-1">
              <p className="text-sm text-muted-foreground">Advances</p>
              <p className="text-sm font-semibold tabular-nums text-rose-600">− {fmt(advances)}</p>
            </div>
            <div className="border-t border-border mt-2 pt-3 flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">Remaining Salary</p>
              <p className="text-lg font-bold text-primary tabular-nums">
                {fmt(basicSalary + commission - advances)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Security & Password */}
      <div className="px-5 pb-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-card overflow-hidden">
          <button
            onClick={() => setSecurityOpen(!securityOpen)}
            className="w-full flex items-center justify-between p-5 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lock size={16} className="text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Change Your Password</span>
            </div>
            <ChevronDown
              size={16}
              className={`text-muted-foreground transition-transform duration-300 ${securityOpen ? "rotate-180" : ""}`}
            />
          </button>
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${securityOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="px-5 pb-5 space-y-3">
              {/* Current Password */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Current Password</label>
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-9 text-sm pr-9"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {/* New Password */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">New Password</label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 text-sm pr-9"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strength.barColor}`}
                        style={{ width: `${strength.percent}%` }}
                      />
                    </div>
                    <p className={`text-[11px] font-medium ${strength.color}`}>{strength.label}</p>
                  </div>
                )}
              </div>
              {/* Update Button */}
              <button
                onClick={handleUpdatePassword}
                disabled={!canUpdatePassword || updatingPassword}
                className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-opacity"
              >
                {updatingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Logout */}
      <div className="px-5 pb-6">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-3 bg-destructive/10 rounded-2xl p-4 hover:bg-destructive/20 transition-colors"
        >
          <LogOut size={20} className="text-destructive" />
          <span className="font-semibold text-destructive">Log Out</span>
        </button>
      </div>
    </div>
  );
};

export default Profile;
