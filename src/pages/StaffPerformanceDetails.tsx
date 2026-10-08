import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Phone, MessageCircle, Pencil, Check, X,
  Award, Zap, Star, TrendingUp, Calendar, Coins, Users as UsersIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  StatCard,
  SmallCircularProgress as CircularProgress,
  BadgeTile,
  fmtBdt as fmt,
  startOfMonthIso,
  startOfWeekIso,
} from "@/components/staff/PerformanceWidgets";
import { profileRoleToInviteRole } from "@/lib/staffRoles";
import StaffAdvancesSheet from "@/components/staff/StaffAdvancesSheet";
import ProductTargetsList from "@/components/staff/ProductTargetsList";

interface StaffProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: string | null;
  pharmacy_id: string;
}

interface StaffSettings {
  monthly_target: number;
  commission_percent: number;
  basic_salary: number;
  advances: number; // legacy, unused for math
}

interface BadgeWinners {
  topSeller?: string;
  fastestBiller?: string;
  customerFavorite?: string;
}

const StaffPerformanceDetails = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { profile: me } = useAuth();
  const myRole = profileRoleToInviteRole(me?.role);
  const isOwner = myRole === "owner";
  const isManager = myRole === "manager";
  const isSelf = me?.id === userId;
  const canEdit = isOwner; // Only owners can edit salary/advances/targets

  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [settings, setSettings] = useState<StaffSettings>({
    monthly_target: 0, commission_percent: 0, basic_salary: 0, advances: 0,
  });
  const [monthSales, setMonthSales] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [weekSales, setWeekSales] = useState(0);
  const [loyalty, setLoyalty] = useState(0);
  const [monthAdvanceTotal, setMonthAdvanceTotal] = useState(0);
  const [advancesSheetOpen, setAdvancesSheetOpen] = useState(false);
  const [winners, setWinners] = useState<BadgeWinners>({});
  const [loading, setLoading] = useState(true);

  // Inline editor state
  const [editing, setEditing] = useState<null | "target" | "earnings">(null);
  const [draft, setDraft] = useState<StaffSettings>(settings);
  const [newAdvance, setNewAdvance] = useState<string>("");
  const [confirmAdvance, setConfirmAdvance] = useState<{
    open: boolean; delta: number; pending?: Partial<StaffSettings>;
  }>({ open: false, delta: 0 });
  const [savingEarnings, setSavingEarnings] = useState(false);

  useEffect(() => {
    if (!userId || !me?.pharmacy_id) return;
    if (!isOwner && !isManager && !isSelf) {
      toast({ title: "Access denied", variant: "destructive" });
      navigate("/profile", { replace: true });
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);

      // 1. Profile via RPC
      const { data: profData, error: profErr } = await supabase.rpc(
        "get_pharmacy_staff_profile" as any,
        { _user_id: userId },
      );
      const prof = Array.isArray(profData) ? profData[0] : profData;
      if (profErr || !prof) {
        toast({ title: "Staff not found", variant: "destructive" });
        navigate(-1);
        return;
      }
      if (cancelled) return;

      const targetRole = profileRoleToInviteRole(prof.role);
      // Hierarchical RBAC: A manager can ONLY supervise/view salesmen.
      // A manager MUST NOT be able to view detailed performance for other managers or the owner.
      if (isManager && !isSelf && targetRole !== "salesman") {
        toast({
          title: "Access Restricted",
          description: "Managers are not permitted to view performance details for owners or peer managers.",
          variant: "destructive",
        });
        navigate("/staff-management", { replace: true });
        return;
      }

      setStaff(prof as StaffProfile);

      // 2. Settings
      const { data: setData } = await supabase
        .from("staff_settings" as any)
        .select("monthly_target, commission_percent, basic_salary, advances")
        .eq("pharmacy_id", me.pharmacy_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!cancelled && setData) {
        const s = setData as unknown as StaffSettings;
        setSettings(s);
        setDraft(s);
      }

      const monthStart = startOfMonthIso();
      const weekStart = startOfWeekIso();

      // Monthly advance transactions for this staff
      const { data: advRows } = await supabase
        .from("cash_transactions")
        .select("amount")
        .eq("pharmacy_id", me.pharmacy_id)
        .eq("category", "expense")
        .like("note", `STAFF_ADVANCE:${userId}%`)
        .gte("occurred_at", monthStart);
      if (!cancelled) {
        setMonthAdvanceTotal(
          (advRows || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0),
        );
      }

      // 3. Month sales for this user
      const { data: monthRows } = await supabase
        .from("sales")
        .select("id, total, created_at, user_id")
        .eq("pharmacy_id", me.pharmacy_id)
        .eq("status", "completed")
        .gte("created_at", monthStart);
      const userMonth = (monthRows || []).filter((r: any) => r.user_id === userId);
      if (!cancelled) {
        setMonthSales(userMonth.reduce((s: number, r: any) => s + Number(r.total || 0), 0));
        setMonthCount(userMonth.length);
        setWeekSales(
          userMonth
            .filter((r: any) => r.created_at >= weekStart)
            .reduce((s: number, r: any) => s + Number(r.total || 0), 0),
        );
      }

      // 4. Badge winners across all staff (this month)
      const totals = new Map<string, { sales: number; count: number }>();
      for (const r of monthRows || []) {
        const t = totals.get((r as any).user_id) || { sales: 0, count: 0 };
        t.sales += Number((r as any).total || 0);
        t.count += 1;
        totals.set((r as any).user_id, t);
      }
      const topSeller = [...totals.entries()].sort((a, b) => b[1].sales - a[1].sales)[0]?.[0];
      const fastestBiller = [...totals.entries()].sort((a, b) => b[1].count - a[1].count)[0]?.[0];

      // 5. Customer favorite + loyalty (using customer_ledger to map sale -> customer)
      const { data: ledgerRows } = await supabase
        .from("customer_ledger")
        .select("sale_id, customer_id, occurred_at, user_id")
        .eq("pharmacy_id", me.pharmacy_id)
        .gte("occurred_at", monthStart);

      // distinct customers per staff (this month)
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

      // loyalty: distinct customers handled this month who also appear before this month
      const myCustomers = distinctByUser.get(userId) || new Set<string>();
      let loyaltyCount = 0;
      if (myCustomers.size > 0) {
        const { data: prior } = await supabase
          .from("customer_ledger")
          .select("customer_id")
          .eq("pharmacy_id", me.pharmacy_id)
          .lt("occurred_at", monthStart)
          .in("customer_id", [...myCustomers]);
        const priorSet = new Set((prior || []).map((r: any) => r.customer_id));
        for (const c of myCustomers) if (priorSet.has(c)) loyaltyCount++;
      }

      if (!cancelled) {
        setLoyalty(loyaltyCount);
        setWinners({ topSeller, fastestBiller, customerFavorite });
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, me?.pharmacy_id, isOwner, isManager, isSelf, navigate]);

  const commission = useMemo(
    () => (monthSales * (settings.commission_percent || 0)) / 100,
    [monthSales, settings.commission_percent],
  );
  const netPayable = useMemo(
    () => (settings.basic_salary || 0) + commission - monthAdvanceTotal,
    [settings.basic_salary, commission, monthAdvanceTotal],
  );
  const targetPct = settings.monthly_target > 0
    ? Math.min(100, (monthSales / settings.monthly_target) * 100)
    : 0;

  const persistSettings = async (next: Partial<StaffSettings>) => {
    if (!me?.pharmacy_id || !userId) return false;
    const merged = { ...settings, ...next };
    const { error } = await supabase
      .from("staff_settings" as any)
      .upsert(
        { pharmacy_id: me.pharmacy_id, user_id: userId, ...merged },
        { onConflict: "pharmacy_id,user_id" },
      );
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return false;
    }
    setSettings(merged);
    setDraft(merged);
    return true;
  };

  const saveSettings = async (next: Partial<StaffSettings>) => {
    const ok = await persistSettings(next);
    if (ok) toast({ title: "Saved" });
  };

  const handleSaveEarnings = async () => {
    if (!me?.pharmacy_id || !userId || !me.id) return;
    const advanceAmount = parseFloat(newAdvance);
    const hasAdvance = !isNaN(advanceAmount) && advanceAmount > 0;
    const pending: Partial<StaffSettings> = {
      basic_salary: draft.basic_salary,
      commission_percent: draft.commission_percent,
    };
    if (hasAdvance) {
      setConfirmAdvance({ open: true, delta: advanceAmount, pending });
      return;
    }
    setSavingEarnings(true);
    const ok = await persistSettings(pending);
    setSavingEarnings(false);
    if (ok) {
      toast({ title: "Saved" });
      setEditing(null);
    }
  };

  const confirmAdvanceDeduction = async () => {
    if (!me?.pharmacy_id || !userId || !me.id) return;
    const { delta, pending } = confirmAdvance;
    setSavingEarnings(true);
    if (pending && Object.keys(pending).length > 0) {
      const ok = await persistSettings(pending);
      if (!ok) {
        setSavingEarnings(false);
        setConfirmAdvance({ open: false, delta: 0 });
        return;
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const staffName = staff?.full_name || "Staff";
    const { error: txErr } = await supabase.from("cash_transactions").insert({
      pharmacy_id: me.pharmacy_id,
      user_id: me.id,
      direction: "out",
      category: "expense",
      party_name: `Staff Advance: ${staffName}`,
      amount: delta,
      note: `STAFF_ADVANCE:${userId} | Cash Advance - Approved by Owner (${today})`,
      occurred_at: new Date().toISOString(),
    });
    setSavingEarnings(false);
    setConfirmAdvance({ open: false, delta: 0 });
    if (txErr) {
      toast({
        title: "Saved settings, but transaction failed",
        description: txErr.message,
        variant: "destructive",
      });
      return;
    }
    setMonthAdvanceTotal((p) => p + delta);
    setNewAdvance("");
    toast({
      title: "Advance recorded",
      description: `৳${delta.toLocaleString("en-IN")} deducted from shop balance.`,
    });
    setEditing(null);
  };

  const initials = (staff?.full_name || "?")
    .split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const phone = staff?.phone?.replace(/\s+/g, "") || "";
  const waUrl = phone ? `https://wa.me/${phone.replace(/^\+/, "")}` : "";
  const telUrl = phone ? `tel:${phone}` : "";

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] max-w-md mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-white rounded-3xl" />
          <div className="h-24 bg-white rounded-3xl" />
          <div className="h-40 bg-white rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] max-w-md mx-auto pb-12">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-[#F4F6FB]/90 backdrop-blur px-page pt-3 pb-2 flex items-center gap-3">
        <h1 className="text-base font-bold text-gray-900 flex-1 truncate">Staff Performance</h1>
      </div>

      {/* Profile card */}
      <div className="px-page mt-2">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={staff?.avatar_url || undefined} />
            <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-gray-900 truncate">{staff?.full_name || "Unnamed"}</p>
            <Badge variant="secondary" className="mt-1 capitalize rounded-lg text-[10px]">{staff?.role}</Badge>
            {phone && <p className="text-xs text-muted-foreground mt-1 truncate">{phone}</p>}
          </div>
        </div>
        {phone && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <a
              href={telUrl}
              className="flex items-center justify-center gap-2 h-10 rounded-2xl bg-white border border-gray-100 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              <Phone size={14} className="text-emerald-600" /> Call
            </a>
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 h-10 rounded-2xl bg-white border border-gray-100 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
            >
              <MessageCircle size={14} className="text-emerald-600" /> WhatsApp
            </a>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="px-page mt-4 grid grid-cols-2 gap-3">
        <StatCard icon={<TrendingUp size={16} />} iconBg="bg-emerald-100 text-emerald-700"
          label="This Month" value={fmt(monthSales)} sub={`${monthCount} sales`} />
        <StatCard icon={<Calendar size={16} />} iconBg="bg-sky-100 text-sky-700"
          label="This Week" value={fmt(weekSales)} />
        <StatCard icon={<Coins size={16} />} iconBg="bg-amber-100 text-amber-700"
          label="Commission" value={fmt(commission)} sub={`${settings.commission_percent || 0}% of sales`} />
        <StatCard icon={<UsersIcon size={16} />} iconBg="bg-violet-100 text-violet-700"
          label="Loyalty Score" value={String(loyalty)} sub="repeat customers" />
      </div>

      {/* Target tracker */}
      <div className="px-page mt-4">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-900">Monthly Target</p>
            {canEdit && editing !== "target" && (
              <button
                onClick={() => { setDraft(settings); setEditing("target"); }}
                className="p-1.5 rounded-lg hover:bg-gray-100"
                aria-label="Edit target"
              >
                <Pencil size={14} className="text-gray-600" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-5">
            <CircularProgress percent={targetPct} />
            <div className="flex-1 min-w-0">
              {editing === "target" ? (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={draft.monthly_target}
                    onChange={(e) =>
                      setDraft({ ...draft, monthly_target: parseFloat(e.target.value) || 0 })
                    }
                    className="h-9 rounded-xl"
                    placeholder="Monthly target ৳"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 h-8 flex-1"
                      onClick={async () => {
                        await saveSettings({ monthly_target: draft.monthly_target });
                        setEditing(null);
                      }}
                    >
                      <Check size={14} /> Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl h-8"
                      onClick={() => { setDraft(settings); setEditing(null); }}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(monthSales)}</p>
                  <p className="text-xs text-muted-foreground">
                    of {fmt(settings.monthly_target || 0)} target
                  </p>
                </>
              )}
            </div>
          </div>
          {me?.pharmacy_id && userId && (
            <ProductTargetsList
              pharmacyId={me.pharmacy_id}
              userId={userId}
              isAdmin={isAdmin}
              currentUserId={me.id}
              embedded
            />
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="px-page mt-4">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-bold text-gray-900 mb-3">Achievements</p>
          <div className="grid grid-cols-3 gap-3">
            <BadgeTile
              icon={<Award size={20} />}
              label="Top Seller"
              earned={winners.topSeller === userId}
              color="amber"
            />
            <BadgeTile
              icon={<Zap size={20} />}
              label="Fastest Biller"
              earned={winners.fastestBiller === userId}
              color="sky"
            />
            <BadgeTile
              icon={<Star size={20} />}
              label="Customer Favorite"
              earned={winners.customerFavorite === userId}
              color="rose"
            />
          </div>
        </div>
      </div>

      {/* Earnings */}
      <div className="px-page mt-4">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-900">Earnings Summary</p>
            {canEdit && editing !== "earnings" && (
              <button
                onClick={() => { setDraft(settings); setEditing("earnings"); }}
                className="p-1.5 rounded-lg hover:bg-gray-100"
                aria-label="Edit earnings"
              >
                <Pencil size={14} className="text-gray-600" />
              </button>
            )}
          </div>

          {editing === "earnings" ? (
            <div className="space-y-2">
              <LabeledInput
                label="Basic Salary"
                value={draft.basic_salary}
                onChange={(v) => setDraft({ ...draft, basic_salary: v })}
              />
              <LabeledInput
                label="Commission %"
                value={draft.commission_percent}
                onChange={(v) => setDraft({ ...draft, commission_percent: v })}
              />
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 flex items-center justify-between">
                <p className="text-[11px] text-rose-700">Total Advances Taken (This Month)</p>
                <p className="text-sm font-semibold tabular-nums text-rose-600">
                  − {fmt(monthAdvanceTotal)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground w-32 shrink-0">New Advance</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={newAdvance}
                  placeholder="e.g. 500"
                  onChange={(e) => setNewAdvance(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 rounded-xl flex-1"
                />
              </div>
              <button
                type="button"
                onClick={() => setAdvancesSheetOpen(true)}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                View in Transactions →
              </button>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  disabled={savingEarnings}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 h-9 flex-1"
                  onClick={handleSaveEarnings}
                >
                  <Check size={14} /> Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl h-9"
                  onClick={() => { setDraft(settings); setNewAdvance(""); setEditing(null); }}
                >
                  <X size={14} />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Row label="Basic Salary" value={fmt(settings.basic_salary || 0)} />
              <Row label={`Commission (${settings.commission_percent || 0}%)`} value={`+ ${fmt(commission)}`} positive />
              <Row label="Advances (This Month)" value={`− ${fmt(monthAdvanceTotal)}`} negative />
              <button
                type="button"
                onClick={() => setAdvancesSheetOpen(true)}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
              >
                View in Transactions →
              </button>
              <div className="border-t border-gray-100 mt-3 pt-3 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Net Payable</p>
                <p className="text-lg font-bold text-emerald-700 tabular-nums">{fmt(netPayable)}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={confirmAdvance.open}
        onOpenChange={(o) => !o && setConfirmAdvance({ open: false, delta: 0 })}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Advance Payment</AlertDialogTitle>
            <AlertDialogDescription>
              This will deduct ৳{confirmAdvance.delta.toLocaleString("en-IN")} from
              the shop's current balance and log it as an expense in your Transactions.
              Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingEarnings}
              onClick={confirmAdvanceDeduction}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
            >
              Yes, deduct & save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {staff && me?.pharmacy_id && userId && (
        <StaffAdvancesSheet
          open={advancesSheetOpen}
          onOpenChange={setAdvancesSheetOpen}
          staffName={staff.full_name || "Staff"}
          userId={userId}
          pharmacyId={me.pharmacy_id}
        />
      )}
    </div>
  );
};

const Row = ({ label, value, positive, negative }: {
  label: string; value: string; positive?: boolean; negative?: boolean;
}) => (
  <div className="flex items-center justify-between py-1.5">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className={`text-sm font-semibold tabular-nums ${
      positive ? "text-emerald-700" : negative ? "text-rose-600" : "text-gray-900"
    }`}>{value}</p>
  </div>
);

const LabeledInput = ({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) => (
  <div className="flex items-center gap-3">
    <p className="text-xs text-muted-foreground w-32 shrink-0">{label}</p>
    <Input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      onFocus={(e) => e.currentTarget.select()}
      className="h-9 rounded-xl flex-1"
    />
  </div>
);

export default StaffPerformanceDetails;