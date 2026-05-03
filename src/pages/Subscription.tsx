import { useState } from "react";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import StatusCard from "@/components/subscription/StatusCard";
import PaymentHistory from "@/components/subscription/PaymentHistory";
import RenewButton from "@/components/subscription/RenewButton";
import ExtendPlans from "@/components/subscription/ExtendPlans";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import type { ExtendPlan } from "@/lib/subscriptionMock";

export default function Subscription() {
  const navigate = useNavigate();
  const { sub, payments, loading, refetch } = useSubscription();
  const [showPlans, setShowPlans] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fireConfetti = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.7 },
      colors: ["#10b981", "#34d399", "#6ee7b7", "#facc15"],
    });
  };

  const handleSubscriptionPayment = async (plan: ExtendPlan) => {
    setLoadingId(plan.id);
    try {
      const { error } = await supabase.rpc("extend_subscription", {
        _days: plan.days,
        _amount: plan.price_bdt,
      });
      if (error) throw error;
      toast.success("Subscription Extended Successfully!", {
        description: `+${plan.days} days added to your plan.`,
      });
      fireConfetti();
      setShowPlans(false);
      await refetch();
    } catch (e: any) {
      toast.error("Payment failed", {
        description: e?.message ?? "Please try again.",
      });
    } finally {
      setLoadingId(null);
    }
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
          <CreditCard size={20} className="text-emerald-600" />
          <h1 className="font-bold text-gray-900 text-fluid-lg">Subscription</h1>
        </div>
      </header>

      <main className="px-page space-y-5 mt-2">
        {loading || !sub ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            <StatusCard sub={sub} />
            <RenewButton
              open={showPlans}
              onClick={() => setShowPlans((v) => !v)}
              disabled={!!loadingId}
            />
            {showPlans && (
              <ExtendPlans onPay={handleSubscriptionPayment} loadingId={loadingId} />
            )}
            <PaymentHistory payments={payments} />
          </>
        )}
      </main>
    </div>
  );
}
