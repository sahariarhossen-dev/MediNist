import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LockKeyhole, CheckCircle2, AlertTriangle } from "lucide-react";
import { z } from "zod";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const schema = z.object({
  declared: z
    .number({ invalid_type_error: "Enter the cash amount" })
    .min(0, "Cannot be negative")
    .max(10_000_000, "Amount too large"),
  notes: z.string().max(500).optional(),
});

const formatBDT = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

type OwnerClosing = {
  declared_cash: number | null;
  system_cash: number | null;
  discrepancy: number | null;
  notes: string | null;
  closed_by_user_id: string | null;
  closed_at: string | null;
  closing_type: string | null;
};

const CashClosing = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isOwner = profile?.role === "admin";

  const [declared, setDeclared] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Owner-only review of today's manual closing
  const [todayClosing, setTodayClosing] = useState<OwnerClosing | null>(null);
  const [submitterName, setSubmitterName] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner || !profile?.pharmacy_id) return;
    const load = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase
        .from("daily_closings")
        .select("declared_cash,system_cash,discrepancy,notes,closed_by_user_id,closed_at,closing_type")
        .eq("pharmacy_id", profile.pharmacy_id)
        .eq("closing_date", today)
        .maybeSingle();
      if (data && data.closing_type === "manual") {
        setTodayClosing(data as OwnerClosing);
        if (data.closed_by_user_id) {
          const { data: members } = await supabase.rpc("get_pharmacy_member_names");
          const m = (members as any[] | null)?.find((x) => x.user_id === data.closed_by_user_id);
          setSubmitterName(m?.full_name || null);
        }
      } else {
        setTodayClosing(null);
      }
    };
    load();
  }, [isOwner, profile?.pharmacy_id]);

  const handleSubmit = async () => {
    setError(null);
    const parsed = schema.safeParse({
      declared: declared === "" ? NaN : Number(declared),
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc("submit_blind_closing", {
      _declared: parsed.data.declared,
      _notes: parsed.data.notes ?? null,
    });
    setSubmitting(false);
    if (rpcError) {
      toast.error(rpcError.message || "Could not submit closing");
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] max-w-md mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1" aria-label="Back">
            <ArrowLeft size={22} className="text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Shift End — Cash Closing</h1>
        </div>
      </div>

      {/* Owner review */}
      {isOwner && todayClosing && (
        <div className="mx-page mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <LockKeyhole size={16} className="text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900">Today's Shift Closing Review</h2>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Submitted by" value={submitterName || "—"} />
            <Row
              label="Declared (counted)"
              value={`৳${formatBDT(Number(todayClosing.declared_cash || 0))}`}
            />
            <Row
              label="System expected"
              value={`৳${formatBDT(Number(todayClosing.system_cash || 0))}`}
            />
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-gray-600">Discrepancy</span>
              <span
                className={`font-bold tabular-nums ${
                  Math.abs(Number(todayClosing.discrepancy || 0)) < 1
                    ? "text-green-600"
                    : Number(todayClosing.discrepancy) > 0
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {Number(todayClosing.discrepancy) >= 0 ? "+" : "−"}৳
                {formatBDT(Math.abs(Number(todayClosing.discrepancy || 0)))}
              </span>
            </div>
            {todayClosing.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Staff note</p>
                <p className="text-sm text-gray-800">{todayClosing.notes}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => navigate("/more/daily-transactions")}
            className="w-full mt-4 text-xs text-blue-600 font-semibold"
          >
            Open Daily Transactions →
          </button>
        </div>
      )}

      {!submitted ? (
        <div className="mx-page mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <LockKeyhole size={16} className="text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900">Blind Cash Count</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            Count every note &amp; coin in the drawer right now and enter the total.
            The system total is hidden — your count is recorded as-is and reviewed by the Owner.
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="declared" className="text-sm text-gray-700">
                Physical cash in drawer (BDT)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-lg">৳</span>
                <Input
                  id="declared"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="1"
                  placeholder="0"
                  value={declared}
                  onChange={(e) => setDeclared(e.target.value)}
                  autoComplete="off"
                  className="h-14 pl-9 text-2xl font-bold rounded-xl bg-white border-gray-200 focus-visible:ring-blue-500 focus-visible:ring-offset-0 tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm text-gray-700">
                Notes (optional)
              </Label>
              <Textarea
                id="notes"
                rows={3}
                maxLength={500}
                placeholder="Any reason for surplus / shortage?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl bg-white border-gray-200 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button
              onClick={handleSubmit}
              disabled={submitting || declared === ""}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {submitting ? "Submitting…" : "Submit Closing"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mx-page mt-4 bg-white rounded-2xl p-6 shadow-sm text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <CheckCircle2 className="text-green-600" size={24} />
          </div>
          <h3 className="text-base font-bold text-gray-900">Closing recorded</h3>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Your cash count has been submitted. The Owner has been notified
            and will review any discrepancy.
          </p>
          <Button
            onClick={() => navigate("/more")}
            variant="outline"
            className="mt-5 rounded-xl"
          >
            Done
          </Button>
        </div>
      )}

      {!isOwner && (
        <div className="mx-page mt-4 flex items-start gap-2 text-xs text-gray-500 leading-relaxed">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p>The system total is intentionally hidden during shift end to keep the count honest.</p>
        </div>
      )}
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-gray-600">{label}</span>
    <span className="font-semibold tabular-nums text-gray-900">{value}</span>
  </div>
);

export default CashClosing;
