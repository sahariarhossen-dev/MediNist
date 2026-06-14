import { Calendar, CircleDollarSign, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { InvoiceCardData } from "@/lib/chatCards";

const statusColor = (s: InvoiceCardData["status"]) =>
  s === "Paid"
    ? "text-emerald-600"
    : s === "Overdue"
    ? "text-red-600"
    : "text-amber-600";

const ChatInvoiceCard = ({ data }: { data: InvoiceCardData }) => {
  return (
    <div className="rounded-2xl p-4 max-w-xs shadow-sm border bg-slate-50 border-slate-100">
      <div className="flex items-start gap-2">
        <div className="h-7 w-7 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0">
          <FileText className="h-3.5 w-3.5 text-indigo-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 break-words leading-tight">
            {data.supplier}
          </p>
          <p className="text-[11px] text-slate-500 italic mt-0.5">{data.invoiceNo}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>Date:</span>
          <span className="font-medium text-slate-800">{data.date}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <CircleDollarSign className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>Total:</span>
          <span className="font-medium text-slate-800">৳ {data.total.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-current ml-1" />
          <span>Status:</span>
          <span className={`font-semibold ${statusColor(data.status)}`}>{data.status}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => toast({ title: "Invoice", description: "PDF view coming soon." })}
          className="text-xs text-indigo-600 font-medium hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          View PDF
        </button>
        <button
          onClick={() => toast({ title: "Marked Paid", description: `${data.invoiceNo} updated.` })}
          className="text-xs bg-slate-900 text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Mark Paid
        </button>
      </div>
    </div>
  );
};

export default ChatInvoiceCard;