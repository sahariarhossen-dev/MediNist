import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  pharmacyId: string;
  userId: string;
  onSaved?: () => void;
}

const AddManualDueSheet = ({
  open, onOpenChange, customerId, customerName, pharmacyId, userId, onSaved,
}: Props) => {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setDescription("");
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
      const { error } = await supabase.from("customer_ledger").insert({
        customer_id: customerId,
        pharmacy_id: pharmacyId,
        user_id: userId,
        entry_type: "due",
        amount: amt,
        description: description.trim() || `Manual due for ${customerName}`,
      });
      if (error) throw error;

      toast.success("Manual due added");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add due");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-w-md mx-auto rounded-t-3xl p-0 max-h-[90vh] overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-2 text-left">
          <SheetTitle className="text-lg font-bold text-gray-900">Add Manual Due</SheetTitle>
          <p className="text-xs text-gray-500">Record an outstanding amount for {customerName}.</p>
        </SheetHeader>

        <div className="px-6 pb-6 pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="due-amount" className="text-sm text-gray-700">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">৳</span>
              <Input
                id="due-amount"
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due-desc" className="text-sm text-gray-700">Description</Label>
            <Textarea
              id="due-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Old debt, missed sale entry"
              className="rounded-xl bg-white border-gray-200 min-h-[60px]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" className="flex-1 h-11 rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Due"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddManualDueSheet;
