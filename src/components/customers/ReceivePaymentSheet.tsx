import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLocationStore } from "@/contexts/LocationContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  pharmacyId: string;
  userId: string;
  totalDue: number;
  onSaved?: () => void;
}

const ReceivePaymentSheet = ({
  open, onOpenChange, customerId, customerName, pharmacyId, userId, totalDue, onSaved,
}: Props) => {
  const { activeLocation } = useLocationStore();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setNote("");
    }
  }, [open]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const locId = activeLocation?.id || null;

      // 1. Insert ledger payment
      const { error: ledgerErr } = await supabase.from("customer_ledger").insert({
        customer_id: customerId,
        pharmacy_id: pharmacyId,
        user_id: userId,
        location_id: locId,
        entry_type: "payment",
        amount: amt,
        description: note.trim() || `Payment from ${customerName}`,
      });
      if (ledgerErr) throw ledgerErr;

      // 2. Insert mirror cash transaction so it shows in Daily Transactions
      const { error: cashErr } = await supabase.from("cash_transactions").insert({
        pharmacy_id: pharmacyId,
        user_id: userId,
        location_id: locId,
        direction: "in",
        category: "due_collection",
        party_name: customerName,
        amount: amt,
        note: note.trim() || null,
      });
      if (cashErr) throw cashErr;

      toast.success("Payment received");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-w-md mx-auto rounded-t-3xl p-0 max-h-[90vh] overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-2 text-left">
          <SheetTitle className="text-lg font-bold text-gray-900">Receive Payment</SheetTitle>
          <p className="text-xs text-gray-500">From {customerName} · Outstanding: <span className="font-semibold text-red-600">৳{Math.round(totalDue)}</span></p>
        </SheetHeader>

        <div className="px-6 pb-6 pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" className="text-sm text-gray-700">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">৳</span>
              <Input
                id="pay-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-11 pl-8 rounded-xl bg-white border-gray-200"
              />
            </div>
            {totalDue > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(Math.round(totalDue)))}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Pay full amount (৳{Math.round(totalDue)})
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note" className="text-sm text-gray-700">Note</Label>
            <Textarea
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className="rounded-xl bg-white border-gray-200 min-h-[60px]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" className="flex-1 h-11 rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold"
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Payment"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ReceivePaymentSheet;