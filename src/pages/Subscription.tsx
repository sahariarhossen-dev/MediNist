import { useState } from "react";
import { ArrowLeft, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import StatusCard from "@/components/subscription/StatusCard";
import ExtendPlans from "@/components/subscription/ExtendPlans";
import PaymentHistory from "@/components/subscription/PaymentHistory";
import {
  formatDate,
  mockPayments,
  mockSubscription,
  stackExpiry,
  type ExtendPlan,
  type PaymentRecord,
  type SubscriptionInfo,
} from "@/lib/subscriptionMock";

export default function Subscription() {
  const navigate = useNavigate();
  const [sub, setSub] = useState<SubscriptionInfo>(mockSubscription);
  const [payments, setPayments] = useState<PaymentRecord[]>(mockPayments);

  const handlePay = (plan: ExtendPlan) => {
    const newExpiry = stackExpiry(new Date(sub.expiry_date), plan.days);
    setSub((s) => ({
      ...s,
      expiry_date: newExpiry.toISOString(),
      total_days: s.total_days + plan.days,
    }));
    setPayments((list) => [
      {
        id: `p${Date.now()}`,
        date: new Date().toISOString(),
        amount_bdt: plan.price_bdt,
        duration_days: plan.days,
        status: "success",
      },
      ...list,
    ]);
    toast.success("Subscription extended", {
      description: `New expiry: ${formatDate(newExpiry.toISOString())}`,
    });
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md md:max-w-2xl mx-auto pb-24">
      <header className="sticky top-0 z-10 bg-[#F4F6FB]/90 backdrop-blur px-page py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="p-2 -ml-2 rounded-full hover:bg-gray-100"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <div className="flex items-center gap-2">
          <CreditCard size={20} className="text-blue-600" />
          <h1 className="font-bold text-gray-900 text-fluid-lg">Subscription</h1>
        </div>
      </header>

      <main className="px-page space-y-5 mt-2">
        <StatusCard sub={sub} />
        <ExtendPlans onPay={handlePay} />
        <PaymentHistory payments={payments} />
      </main>
    </div>
  );
}