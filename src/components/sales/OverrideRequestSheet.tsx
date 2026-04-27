import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, ShieldAlert } from "lucide-react";

const schema = z.object({
  reason: z.string().trim().min(5, "Please describe the reason (min 5 chars)").max(500),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pharmacyId: string;
  userId: string;
  entityType: "sale";
  entityId: string;
  action: "edit" | "delete";
}

const OverrideRequestSheet = ({
  open,
  onOpenChange,
  pharmacyId,
  userId,
  entityType,
  entityId,
  action,
}: Props) => {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ reason });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("admin_override_requests").insert({
      pharmacy_id: pharmacyId,
      requested_by: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      reason: parsed.data.reason,
    });
    if (error) {
      setBusy(false);
      toast.error(error.message || "Could not submit request");
      return;
    }
    // Audit log entry
    await supabase.from("staff_activity_logs").insert({
      pharmacy_id: pharmacyId,
      user_id: userId,
      action_type: "override_request",
      entity_type: entityType,
      entity_id: entityId,
      description: `Requested permission to ${action} ${entityType}`,
      metadata: { reason: parsed.data.reason },
    });
    setBusy(false);
    setReason("");
    onOpenChange(false);
    toast.success("Request sent to Owner");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-w-md mx-auto rounded-t-3xl p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-2 text-left">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-amber-500" size={18} />
            <SheetTitle className="text-base font-bold text-gray-900">
              Request Admin Override
            </SheetTitle>
          </div>
          <p className="text-xs text-gray-500">
            Only the Owner can {action} a completed invoice. Send a request explaining why.
          </p>
        </SheetHeader>

        <div className="px-6 pb-6 pt-3 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-sm text-gray-700">Reason</Label>
            <Textarea
              id="reason"
              rows={4}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong quantity entered for paracetamol — needs correction."
              className="rounded-xl bg-white border-gray-200 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 h-11 rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default OverrideRequestSheet;
