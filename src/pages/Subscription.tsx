import { useState } from "react";
import { ArrowLeft, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StatusCard from "@/components/subscription/StatusCard";
import PaymentHistory from "@/components/subscription/PaymentHistory";
import {
  mockPayments,
  mockSubscription,
  type PaymentRecord,
  type SubscriptionInfo,
} from "@/lib/subscriptionMock";

export default function Subscription() {
  const navigate = useNavigate();
  const [sub] = useState<SubscriptionInfo>(mockSubscription);
  const [payments] = useState<PaymentRecord[]>(mockPayments);

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
        <PaymentHistory payments={payments} />
      </main>
    </div>
  );
}