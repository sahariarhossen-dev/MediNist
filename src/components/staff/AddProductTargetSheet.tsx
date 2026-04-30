import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pill, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Medicine {
  id: string;
  name: string;
  company_name: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pharmacyId: string;
  userId: string;
  createdBy: string;
  onCreated?: () => void;
}

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function AddProductTargetSheet({
  open, onOpenChange, pharmacyId, userId, createdBy, onCreated,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Medicine[]>([]);
  const [picked, setPicked] = useState<Medicine | null>(null);
  const [qty, setQty] = useState("");
  const [incentive, setIncentive] = useState("");
  const [saving, setSaving] = useState(false);

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [],
  );

  useEffect(() => {
    if (!open) {
      setQuery(""); setResults([]); setPicked(null); setQty(""); setIncentive("");
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim() || picked) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_medicines", {
        _pharmacy_id: pharmacyId, _query: query.trim(),
      });
      setResults(((data ?? []) as Medicine[]).slice(0, 8));
    }, 180);
    return () => clearTimeout(t);
  }, [query, pharmacyId, picked]);

  const canSave = picked && parseInt(qty, 10) > 0 && incentive.trim().length > 0;

  const save = async () => {
    if (!canSave || !picked) return;
    setSaving(true);
    const { error } = await supabase.from("product_targets" as any).insert({
      pharmacy_id: pharmacyId,
      user_id: userId,
      medicine_id: picked.id,
      medicine_name: picked.name,
      target_quantity: parseInt(qty, 10),
      incentive_description: incentive.trim(),
      target_month: firstOfMonth(),
      created_by: createdBy,
    });
    setSaving(false);
    if (error) {
      const msg = error.message.includes("product_targets_unique_per_month")
        ? "Target already exists for this product this month."
        : error.message;
      toast({ title: "Could not create target", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: "Target created" });
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>New Product Target</SheetTitle>
          <p className="text-xs text-muted-foreground">For {monthLabel}</p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Product</Label>
            {picked ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-sky-50 border border-sky-100">
                <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Pill size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{picked.name}</p>
                  {picked.company_name && (
                    <p className="text-[11px] text-muted-foreground truncate">{picked.company_name}</p>
                  )}
                </div>
                <button
                  className="text-xs text-sky-700 font-medium"
                  onClick={() => { setPicked(null); setQuery(""); }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search medicine…"
                  className="pl-8 h-10 rounded-xl"
                />
                {results.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg max-h-60 overflow-y-auto">
                    {results.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => { setPicked(m); setQuery(""); setResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                        {m.company_name && (
                          <p className="text-[11px] text-muted-foreground truncate">{m.company_name}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Target Quantity</Label>
            <Input
              type="number" inputMode="numeric" min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 50"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Incentive / Reward</Label>
            <Input
              value={incentive}
              onChange={(e) => setIncentive(e.target.value)}
              placeholder="e.g. ৳500 Bonus or Gift Box"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700"
              disabled={!canSave || saving}
              onClick={save}
            >
              {saving ? "Saving…" : "Create Target"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}