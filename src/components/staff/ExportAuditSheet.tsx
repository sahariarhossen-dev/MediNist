import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDuration } from "@/lib/deviceInfo";

interface ReportLog {
  created_at: string;
  staff_name: string;
  action_type: string;
  severity: string;
  description: string | null;
  amount: number | null;
}

interface Report {
  from: string;
  to: string;
  invoices: number;
  sales_amount: number;
  duty_seconds: number;
  red_flags: number;
  logs: ReportLog[];
}

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

const ExportAuditSheet = ({
  userFilter,
  staffName,
}: {
  userFilter: string;
  staffName: string;
}) => {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);

  const fetchReport = async (): Promise<Report | null> => {
    const { data, error } = await supabase.rpc("get_audit_report" as any, {
      _user_id: userFilter === "all" ? null : userFilter,
      _from: new Date(`${from}T00:00:00`).toISOString(),
      _to: new Date(`${to}T23:59:59`).toISOString(),
    });
    if (error) {
      toast.error(error.message);
      return null;
    }
    return data as unknown as Report;
  };

  const rowsOf = (r: Report) =>
    r.logs.map((l) => [
      new Date(l.created_at).toLocaleString("en-GB"),
      l.staff_name,
      l.action_type.replace(/_/g, " "),
      l.severity,
      l.description ?? "",
      l.amount != null ? Math.round(Number(l.amount)) : "",
    ]);

  const summaryOf = (r: Report) => [
    ["Staff", staffName],
    ["Range", `${from} to ${to}`],
    ["Duty hours", formatDuration(Number(r.duty_seconds || 0))],
    ["Invoices", String(r.invoices)],
    ["Sales amount (BDT)", String(Math.round(Number(r.sales_amount || 0)))],
    ["Red flags", String(r.red_flags)],
  ];

  const exportExcel = async () => {
    setBusy(true);
    const r = await fetchReport();
    if (!r) return setBusy(false);
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryOf(r)), "Summary");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Date", "Staff", "Action", "Severity", "Description", "Amount"],
        ...rowsOf(r),
      ]),
      "Audit Log",
    );
    XLSX.writeFile(wb, `medinist-audit-${from}-to-${to}.xlsx`);
    setBusy(false);
    setOpen(false);
  };

  const exportPdf = async () => {
    setBusy(true);
    const r = await fetchReport();
    if (!r) return setBusy(false);
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("MediNist — Duty & Audit Report", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Metric", "Value"]],
      body: summaryOf(r),
      styles: { fontSize: 9 },
    });
    autoTable(doc, {
      head: [["Date", "Staff", "Action", "Severity", "Description", "Amount"]],
      body: rowsOf(r).map((row) => row.map((c) => String(c))),
      styles: { fontSize: 8 },
    });
    doc.save(`medinist-audit-${from}-to-${to}.pdf`);
    setBusy(false);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full rounded-xl gap-1.5">
          <Download size={14} />
          Export Duty &amp; Audit Report
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Export report — {staffName}</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 pt-3 pb-6">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => void exportPdf()} className="rounded-xl gap-1.5">
              <FileText size={14} />
              PDF
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void exportExcel()}
              className="rounded-xl gap-1.5"
            >
              <FileSpreadsheet size={14} />
              Excel
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Includes duty hours, invoice counts, sales totals and every audit / high-risk log in the range.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ExportAuditSheet;
