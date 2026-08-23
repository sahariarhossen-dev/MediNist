import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertOctagon, Percent, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/relativeTime";

interface ApprovalRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  reason: string | null;
  requested_by: string;
  requester_name: string | null;
  created_at: string;
  title: string | null;
  amount: number | null;
  discount_percent: number | null;
}

const ApprovalQueue = ({
  userFilter,
  refreshKey,
  onResolved,
}: {
  userFilter: string;
  refreshKey: number;
  onResolved: () => void;
}) => {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("get_pending_approvals" as any, {
      _user_id: userFilter === "all" ? null : userFilter,
    });
    setRows(((data as any[]) || []) as ApprovalRow[]);
  }, [userFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const resolve = async (row: ApprovalRow, approve: boolean) => {
    setBusy(row.id);
    const fn = row.entity_type === "medicine" ? "resolve_medicine_deletion" : "resolve_sale_discount";
    const { error } = await supabase.rpc(fn as any, { _request_id: row.id, _approve: approve });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      row.entity_type === "medicine"
        ? approve
          ? "Product deleted"
          : "Product restored"
        : approve
          ? "Sale approved"
          : "Sale voided, stock restored",
    );
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    onResolved();
  };

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <AlertOctagon size={14} className="text-destructive" />
        <p className="text-xs font-bold uppercase tracking-wide text-destructive">
          Needs your approval ({rows.length})
        </p>
      </div>

      {rows.map((r) => (
        <div key={r.id} className="p-3 rounded-xl bg-card border border-border space-y-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">
              {r.entity_type === "medicine" ? (
                <Trash2 size={14} className="text-destructive" />
              ) : (
                <Percent size={14} className="text-amber-600" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground break-words">
                {r.entity_type === "medicine"
                  ? `Delete "${r.title || "product"}"`
                  : `${Number(r.discount_percent ?? 0)}% discount · ${r.title || "Invoice"}`}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {r.requester_name || "Member"} · {relativeTime(r.created_at)}
                {r.amount ? ` · ৳${Math.round(Number(r.amount)).toLocaleString("en-IN")}` : ""}
              </p>
              {r.reason && <p className="text-[11px] text-muted-foreground/80 break-words">{r.reason}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="flex-1 rounded-xl"
              disabled={busy === r.id}
              onClick={() => void resolve(r, true)}
            >
              {r.entity_type === "medicine" ? "Confirm Delete" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-xl"
              disabled={busy === r.id}
              onClick={() => void resolve(r, false)}
            >
              {r.entity_type === "medicine" ? "Restore Product" : "Reject"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ApprovalQueue;
