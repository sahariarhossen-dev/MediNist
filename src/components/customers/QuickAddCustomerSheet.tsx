import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CustomerLite = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pharmacyId: string;
  editing?: CustomerLite | null;
  onSaved?: (customer: CustomerLite) => void;
}

const QuickAddCustomerSheet = ({ open, onOpenChange, pharmacyId, editing, onSaved }: Props) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setPhone(editing?.phone ?? "");
      setAddress(editing?.address ?? "");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const phoneVal = phone.trim() || null;
      const addressVal = address.trim() || null;
      const notesVal = notes.trim() || null;

      if (editing) {
        const { data, error } = await supabase
          .from("customers")
          .update({ name: trimmedName, phone: phoneVal, address: addressVal, notes: notesVal })
          .eq("id", editing.id)
          .select("id, name, phone, address, notes")
          .single();
        if (error) throw error;
        toast.success("Customer updated");
        onSaved?.(data as CustomerLite);
        onOpenChange(false);
        return;
      }

      // Check duplicate by phone within pharmacy
      if (phoneVal) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id, name, phone, address, notes")
          .eq("pharmacy_id", pharmacyId)
          .eq("phone", phoneVal)
          .maybeSingle();
        if (existing) {
          toast.info("Customer with this phone already exists");
          onSaved?.(existing as CustomerLite);
          onOpenChange(false);
          return;
        }
      }

      const { data, error } = await supabase
        .from("customers")
        .insert({
          pharmacy_id: pharmacyId,
          name: trimmedName,
          phone: phoneVal,
          address: addressVal,
          notes: notesVal,
        })
        .select("id, name, phone, address, notes")
        .single();
      if (error) throw error;
      toast.success("Customer added");
      onSaved?.(data as CustomerLite);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-w-md mx-auto rounded-t-3xl p-0 max-h-[90vh] overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-2 text-left">
          <SheetTitle className="text-lg font-bold text-gray-900">
            {editing ? "Edit Customer" : "Add Customer"}
          </SheetTitle>
          <p className="text-xs text-gray-500">Quickly add a customer to track dues and prescriptions.</p>
        </SheetHeader>

        <div className="px-6 pb-6 pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cust-name" className="text-sm text-gray-700">Name *</Label>
            <Input
              id="cust-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer full name"
              className="h-11 rounded-xl bg-white border-gray-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-phone" className="text-sm text-gray-700">Phone</Label>
            <Input
              id="cust-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              inputMode="tel"
              className="h-11 rounded-xl bg-white border-gray-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-addr" className="text-sm text-gray-700">Address</Label>
            <Input
              id="cust-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional"
              className="h-11 rounded-xl bg-white border-gray-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-notes" className="text-sm text-gray-700">Notes</Label>
            <Textarea
              id="cust-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, conditions, etc."
              className="rounded-xl bg-white border-gray-200 min-h-[64px]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" className="flex-1 h-11 rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default QuickAddCustomerSheet;