import { useEffect, useState } from "react";
import { Loader2, Search, Pill, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyboardAvoidingScroll } from "@/components/ui/keyboard-avoiding-scroll";
import { useKeyboardInset } from "@/hooks/useKeyboardInsets";

export type Prescription = {
  id: string;
  customer_id: string;
  medicine_id: string | null;
  medicine_name: string;
  strength: string | null;
  dosage_frequency: string;
  dosage_timing: string | null;
  notes: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  pharmacyId: string;
  editing?: Prescription | null;
  onSaved?: () => void;
}

type MedSearchResult = {
  id: string;
  name: string;
  product_size: string | null;
  company_name: string | null;
};

const TIMING_OPTIONS = [
  { value: "Before meal", label: "Before meal" },
  { value: "After meal", label: "After meal" },
  { value: "With meal", label: "With meal" },
  { value: "As needed", label: "As needed" },
];

const AddPrescriptionSheet = ({ open, onOpenChange, customerId, pharmacyId, editing, onSaved }: Props) => {
  const kbInset = useKeyboardInset();
  const [medicineId, setMedicineId] = useState<string | null>(null);
  const [medicineName, setMedicineName] = useState("");
  const [strength, setStrength] = useState("");
  const [dosageFreq, setDosageFreq] = useState("");
  const [timing, setTiming] = useState<string>("After meal");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<MedSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMedicineId(editing?.medicine_id ?? null);
      setMedicineName(editing?.medicine_name ?? "");
      setStrength(editing?.strength ?? "");
      setDosageFreq(editing?.dosage_frequency ?? "");
      setTiming(editing?.dosage_timing ?? "After meal");
      setNotes(editing?.notes ?? "");
      setSearch("");
      setResults([]);
    }
  }, [open, editing]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("medicines")
        .select("id, name, product_size, company_name")
        .eq("pharmacy_id", pharmacyId)
        .ilike("name", `%${search.trim()}%`)
        .limit(8);
      setResults((data || []) as MedSearchResult[]);
      setSearching(false);
    }, 200);
    return () => clearTimeout(timeout);
  }, [search, pharmacyId]);

  const pickMedicine = (m: MedSearchResult) => {
    setMedicineId(m.id);
    setMedicineName(m.name);
    if (m.product_size && !strength) setStrength(m.product_size);
    setSearch("");
    setResults([]);
  };

  const handleSave = async () => {
    if (!medicineName.trim()) {
      toast.error("Medicine name is required");
      return;
    }
    if (!dosageFreq.trim()) {
      toast.error("Dosage frequency is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        medicine_id: medicineId,
        medicine_name: medicineName.trim(),
        strength: strength.trim() || null,
        dosage_frequency: dosageFreq.trim(),
        dosage_timing: timing || null,
        notes: notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("customer_prescriptions")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("customer_prescriptions")
          .insert({ ...payload, customer_id: customerId, pharmacy_id: pharmacyId });
        if (error) throw error;
      }
      toast.success(editing ? "Prescription updated" : "Prescription saved");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save prescription");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-w-md mx-auto rounded-t-3xl p-0 flex flex-col"
        style={{
          transform: "none",
          maxHeight: `calc(100dvh - ${kbInset}px - 24px)`,
        }}
      >
        <SheetHeader className="px-6 pt-6 pb-2 text-left shrink-0">
          <SheetTitle className="text-lg font-bold text-gray-900">{editing ? "Edit Prescription" : "Add Prescription"}</SheetTitle>
          <p className="text-xs text-gray-500">Save a recurring medicine and dosage for quick re-billing.</p>
        </SheetHeader>

        <KeyboardAvoidingScroll className="px-6 pb-6 pt-4 space-y-4 flex-1 min-h-0">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Search inventory (optional)</Label>
            <div className="relative flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white">
              <Search className="w-4 h-4 text-gray-400 ml-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search medicine in inventory"
                className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent"
              />
              {search && (
                <button onClick={() => { setSearch(""); setResults([]); }} className="px-2">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
            {results.length > 0 && (
              <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                {results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => pickMedicine(m)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <Pill className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{m.name} {m.product_size && <span className="text-xs text-gray-400 font-normal">{m.product_size}</span>}</p>
                      {m.company_name && <p className="text-[10px] text-gray-500 truncate">{m.company_name}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searching && <p className="text-xs text-gray-400">Searching…</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="med-name" className="text-sm text-gray-700">Medicine name *</Label>
            <Input
              id="med-name"
              value={medicineName}
              onChange={(e) => { setMedicineName(e.target.value); setMedicineId(null); }}
              placeholder="e.g. Napa Extra"
              className="h-11 rounded-xl bg-white border-gray-200"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="med-strength" className="text-sm text-gray-700">Strength</Label>
            <Input
              id="med-strength"
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
              placeholder="e.g. 500mg"
              className="h-11 rounded-xl bg-white border-gray-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dosage" className="text-sm text-gray-700">Dosage *</Label>
              <Input
                id="dosage"
                value={dosageFreq}
                onChange={(e) => setDosageFreq(e.target.value)}
                placeholder="1+0+1"
                className="h-11 rounded-xl bg-white border-gray-200 font-mono"
              />
              <p className="text-[10px] text-gray-400">e.g. 1+0+1 (morning+noon+night)</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-700">Timing</Label>
              <Select value={timing} onValueChange={setTiming}>
                <SelectTrigger className="h-11 rounded-xl bg-white border-gray-200">
                  <SelectValue placeholder="Select timing" />
                </SelectTrigger>
                <SelectContent>
                  {TIMING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="presc-notes" className="text-sm text-gray-700">Notes</Label>
            <Textarea
              id="presc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </KeyboardAvoidingScroll>
      </SheetContent>
    </Sheet>
  );
};

export default AddPrescriptionSheet;