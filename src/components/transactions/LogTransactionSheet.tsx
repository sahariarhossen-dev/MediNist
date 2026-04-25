import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useScrollFocusedInput } from "@/hooks/useScrollFocusedInput";

const schema = z.object({
  party_name: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(100, "Max 100 characters"),
  type: z.enum(["in", "out"], { required_error: "Select a type" }),
  amount: z
    .number({ invalid_type_error: "Amount is required" })
    .positive("Amount must be greater than 0")
    .max(10_000_000, "Amount too large"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  pharmacyId: string;
  userId: string;
  onSaved: () => void;
}

const LogTransactionSheet = ({ open, onOpenChange, date, pharmacyId, userId, onSaved }: Props) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  useScrollFocusedInput(formRef);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { party_name: "", type: undefined as unknown as "in", amount: undefined as unknown as number },
  });

  const typeValue = watch("type");

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    const direction = values.type;
    const category = direction === "in" ? "other_in" : "expense";

    // Use selected date but preserve current time so chronological order makes sense
    const now = new Date();
    const occurred = new Date(date);
    occurred.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);

    const { error } = await supabase.from("cash_transactions").insert({
      pharmacy_id: pharmacyId,
      user_id: userId,
      direction,
      category,
      party_name: values.party_name,
      amount: values.amount,
      occurred_at: occurred.toISOString(),
    });

    setSaving(false);

    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Transaction logged", description: `৳${values.amount} ${direction === "in" ? "added" : "deducted"}.` });
    reset();
    onOpenChange(false);
    onSaved();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="max-w-md mx-auto rounded-t-3xl p-0 max-h-[90vh] overflow-y-auto"
      >
        <SheetHeader className="px-6 pt-6 pb-2 text-left">
          <SheetTitle className="text-lg font-bold text-gray-900">Log Transaction</SheetTitle>
          <p className="text-xs text-gray-500">Record cash in or cash out for this date.</p>
        </SheetHeader>

        <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="px-6 pb-6 pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="party_name" className="text-sm text-gray-700">
              Description / Source
            </Label>
            <Input
              id="party_name"
              placeholder="e.g. Owner Investment, Electricity Bill"
              autoComplete="off"
              {...register("party_name")}
              className="h-11 rounded-xl bg-white border-gray-200 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
            />
            {errors.party_name && (
              <p className="text-xs text-red-500">{errors.party_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-gray-700">Transaction Type</Label>
            <Select
              value={typeValue}
              onValueChange={(v) => setValue("type", v as "in" | "out", { shouldValidate: true })}
            >
              <SelectTrigger className="h-11 rounded-xl bg-white border-gray-200 focus:ring-blue-500 focus:ring-offset-0">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Cash In / Investment
                  </span>
                </SelectItem>
                <SelectItem value="out">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    Payment / Expense
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.type && <p className="text-xs text-red-500">{errors.type.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount" className="text-sm text-gray-700">
              Amount
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">৳</span>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0"
                {...register("amount", { valueAsNumber: true })}
                className="h-11 pl-8 rounded-xl bg-white border-gray-200 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
            </div>
            {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 h-11 rounded-xl"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default LogTransactionSheet;
