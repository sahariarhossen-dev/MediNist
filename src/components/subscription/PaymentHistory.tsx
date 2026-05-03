import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBDT, formatDate, type PaymentRecord } from "@/lib/subscriptionMock";

function StatusPill({ status }: { status: PaymentRecord["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize",
        status === "success"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-700",
      )}
    >
      {status}
    </span>
  );
}

export default function PaymentHistory({ payments }: { payments: PaymentRecord[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Receipt size={18} className="text-blue-600" />
        <h2 className="font-semibold text-gray-900 text-fluid-base">Payment History</h2>
      </div>

      {/* Mobile list */}
      <ul className="sm:hidden divide-y divide-gray-100">
        {payments.map((p) => (
          <li key={p.id} className="py-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900 text-sm">{formatDate(p.date)}</span>
              <span className="font-semibold text-gray-900">{formatBDT(p.amount_bdt)}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gray-500">+{p.duration_days} days</span>
              <StatusPill status={p.status} />
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatDate(p.date)}</TableCell>
                <TableCell className="font-semibold">{formatBDT(p.amount_bdt)}</TableCell>
                <TableCell>+{p.duration_days} days</TableCell>
                <TableCell><StatusPill status={p.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}