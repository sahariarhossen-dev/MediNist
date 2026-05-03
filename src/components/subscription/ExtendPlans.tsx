import { Button } from "@/components/ui/button";
import { Zap, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { extendPlans, formatBDT, type ExtendPlan } from "@/lib/subscriptionMock";

export default function ExtendPlans({ onPay }: { onPay: (plan: ExtendPlan) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Zap size={18} className="text-blue-600" />
        <h2 className="font-semibold text-gray-900 text-fluid-base">Extend Plan</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {extendPlans.map((p) => (
          <div
            key={p.id}
            className={cn(
              "relative bg-white rounded-2xl border shadow-sm p-4 flex flex-col",
              p.popular ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200",
            )}
          >
            {p.popular && (
              <span className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Popular
              </span>
            )}
            <h3 className="font-semibold text-gray-900">{p.label}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">{formatBDT(p.price_bdt)}</span>
              <span className="text-xs text-gray-500">/ {p.days}d</span>
            </div>
            <ul className="mt-3 space-y-1.5 flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Check size={12} className="text-emerald-600" /> {f}
                </li>
              ))}
            </ul>
            <Button
              onClick={() => onPay(p)}
              className={cn(
                "mt-4 w-full",
                p.popular ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-900 hover:bg-gray-800",
              )}
            >
              Pay Now
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}