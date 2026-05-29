import { useEffect, useState, useCallback } from "react";
import { Pill, Trophy, Plus, Trash2, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import AddProductTargetSheet from "./AddProductTargetSheet";

interface ProductTarget {
  id: string;
  medicine_id: string;
  medicine_name: string;
  target_quantity: number;
  current_progress: number;
  incentive_description: string;
  achieved_at: string | null;
}

interface Props {
  pharmacyId: string;
  userId: string;
  isAdmin: boolean;
  currentUserId?: string; // for created_by when admin
  /** Hide entire card if there are no targets (used in staff Profile). */
  hideWhenEmpty?: boolean;
  /** Render without the outer white card chrome — host card supplies it. */
  embedded?: boolean;
}

const firstOfMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
};

export default function ProductTargetsList({
  pharmacyId, userId, isAdmin, currentUserId, hideWhenEmpty, embedded,
}: Props) {
  const [targets, setTargets] = useState<ProductTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_targets" as any)
      .select("id, medicine_id, medicine_name, target_quantity, current_progress, incentive_description, achieved_at")
      .eq("pharmacy_id", pharmacyId)
      .eq("user_id", userId)
      .eq("target_month", firstOfMonth())
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Could not load targets", description: error.message, variant: "destructive" });
      return;
    }
    setTargets((data || []) as unknown as ProductTarget[]);
  }, [pharmacyId, userId]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this product target?")) return;
    const { error } = await supabase.from("product_targets" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setTargets((p) => p.filter((t) => t.id !== id));
  };

  if (hideWhenEmpty && !loading && targets.length === 0) return null;

  const headerLabel = isAdmin ? "Product Targets & Incentives" : "My Product Targets";

  const rows = (
    <>
      {loading ? (
        <div className="space-y-2">
          <div className="h-10 bg-gray-50 rounded-lg animate-pulse" />
          <div className="h-10 bg-gray-50 rounded-lg animate-pulse" />
        </div>
      ) : targets.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">
          {isAdmin
            ? "No product targets yet — tap + to add one."
            : "No product targets set for this month."}
        </p>
      ) : (
        <div
          className={`space-y-2 ${
            targets.length > 3 ? "max-h-[180px] overflow-y-auto pr-1" : ""
          }`}
          style={{ scrollbarWidth: "thin" }}
        >
          {targets.map((t) => {
            const pct = Math.min(100, (t.current_progress / t.target_quantity) * 100);
            const achieved = !!t.achieved_at || t.current_progress >= t.target_quantity;
            return (
              <div
                key={t.id}
                className={`group rounded-xl px-2.5 py-2 transition-colors ${
                  achieved ? "bg-emerald-50/70" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      achieved
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    <Pill size={13} />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 truncate flex-1 min-w-0">
                    {t.medicine_name}
                  </p>
                  <span className="text-[11px] font-semibold tabular-nums text-gray-700 shrink-0">
                    {t.current_progress}/{t.target_quantity}
                  </span>
                  {achieved ? (
                    <span className="inline-flex items-center gap-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] px-2 py-0.5 font-semibold shrink-0">
                      <Trophy size={10} /> Achieved
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] px-2 py-0.5 font-medium shrink-0 max-w-[110px] truncate"
                      title={t.incentive_description}
                    >
                      <Gift size={10} className="shrink-0" />
                      <span className="truncate">{t.incentive_description}</span>
                    </span>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => remove(t.id)}
                      className="p-1 rounded hover:bg-rose-50 text-rose-500 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      aria-label="Delete target"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="mt-1.5 ml-9 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      achieved ? "bg-emerald-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const addSheet = isAdmin && currentUserId && (
    <AddProductTargetSheet
      open={addOpen}
      onOpenChange={setAddOpen}
      pharmacyId={pharmacyId}
      userId={userId}
      createdBy={currentUserId}
      onCreated={load}
    />
  );

  if (embedded) {
    return (
      <>
        <div className="border-t border-gray-100 mt-4 pt-[20px]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Product Targets · This month
            </p>
            {isAdmin && currentUserId && (
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                aria-label="Add product target"
              >
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          {rows}
        </div>
        {addSheet}
      </>
    );
  }

  return (
    <>
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-gray-900">{headerLabel}</p>
            <p className="text-[11px] text-muted-foreground">This month</p>
          </div>
          {isAdmin && currentUserId && (
            <Button
              size="sm"
              className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={14} /> Add
            </Button>
          )}
        </div>
        {rows}
      </div>
      {addSheet}
    </>
  );
}