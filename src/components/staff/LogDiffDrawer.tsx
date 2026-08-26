import { ArrowRight } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { relativeTime } from "@/lib/relativeTime";

export interface DiffChange {
  field: string;
  old: string | null;
  new: string | null;
}

export interface DiffLog {
  id: string;
  staffName: string;
  action_type: string;
  description: string | null;
  amount: number | null;
  created_at: string;
  changes: DiffChange[];
}

const LogDiffDrawer = ({
  log,
  onOpenChange,
}: {
  log: DiffLog | null;
  onOpenChange: (open: boolean) => void;
}) => (
  <Drawer open={!!log} onOpenChange={onOpenChange}>
    <DrawerContent className="rounded-t-2xl">
      <DrawerHeader className="text-left">
        <DrawerTitle className="text-base">
          {log?.action_type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
        </DrawerTitle>
        <DrawerDescription className="text-xs">
          {log ? `${log.staffName} · ${relativeTime(log.created_at)}` : ""}
        </DrawerDescription>
      </DrawerHeader>

      <div className="px-4 pb-8 space-y-3">
        {log?.description && <p className="text-sm text-foreground">{log.description}</p>}

        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {(log?.changes ?? []).map((c, i) => (
            <div key={`${c.field}-${i}`} className="p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {c.field}
              </p>
              <div className="flex items-center gap-2 text-sm tabular-nums">
                <span className="text-muted-foreground line-through">{c.old ?? "—"}</span>
                <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                <span className="font-bold text-foreground">{c.new ?? "—"}</span>
              </div>
            </div>
          ))}
          {log && log.changes.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No field-level changes recorded.</p>
          )}
        </div>

        {log?.amount ? (
          <p className="text-xs text-muted-foreground">
            Amount involved: ৳{Math.round(Number(log.amount)).toLocaleString("en-IN")}
          </p>
        ) : null}
      </div>
    </DrawerContent>
  </Drawer>
);

export default LogDiffDrawer;
