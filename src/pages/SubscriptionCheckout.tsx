import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Smartphone, CreditCard, ShieldCheck } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const PLAN_DAYS = 30;
const PLAN_PRICE = 500;

type Gateway = {
  id: string;
  name: string;
  desc: string;
  tone: string;
  icon: React.ReactNode;
};

const gateways: Gateway[] = [
  { id: "bkash", name: "bKash", desc: "Mobile wallet", tone: "bg-pink-50 text-pink-600", icon: <Smartphone size={20} /> },
  { id: "nagad", name: "Nagad", desc: "Mobile wallet", tone: "bg-orange-50 text-orange-600", icon: <Smartphone size={20} /> },
  { id: "rocket", name: "Rocket", desc: "Mobile wallet", tone: "bg-purple-50 text-purple-600", icon: <Smartphone size={20} /> },
  { id: "card", name: "Card", desc: "Visa / Mastercard", tone: "bg-blue-50 text-blue-600", icon: <CreditCard size={20} /> },
];

export default function SubscriptionCheckout() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>("bkash");
  const [processing, setProcessing] = useState(false);

  const fireConfetti = () => {
    confetti({
      particleCount: 140,
      spread: 80,
      origin: { y: 0.7 },
      colors: ["#10b981", "#34d399", "#6ee7b7", "#facc15"],
    });
  };

  const handlePay = async () => {
    setProcessing(true);
    try {
      // Mock gateway processing delay
      await new Promise((r) => setTimeout(r, 1500));
      // Days/amount are decided server-side; the client only picks a plan key.
      const { data, error } = await supabase.functions.invoke("subscription-checkout", {
        body: { planKey: "monthly", gateway: selected },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      fireConfetti();
      toast.success("Subscription Extended Successfully!", {
        description: `+${data?.days ?? PLAN_DAYS} days added to your plan.`,
      });
      setTimeout(() => navigate("/subscription"), 600);
    } catch (e: any) {
      toast.error("Payment failed", { description: e?.message ?? "Please try again." });
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md md:max-w-2xl mx-auto pb-32">
      <header className="sticky top-0 z-10 bg-[#F4F6FB]/90 backdrop-blur px-page py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="p-2 -ml-2 rounded-full hover:bg-gray-100"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="font-bold text-gray-900 text-fluid-lg">Checkout</h1>
      </header>

      <main className="px-page space-y-5 mt-2">
        {/* Order summary */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Order Summary
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">Pharmacy Pro</p>
              <p className="text-xs text-gray-500">1 Month · 30 days</p>
            </div>
            <p className="text-xl font-bold text-emerald-600">৳{PLAN_PRICE}</p>
          </div>
          <div className="border-t border-dashed border-gray-200 my-3" />
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total</span>
            <span className="font-bold text-gray-900">৳{PLAN_PRICE.toLocaleString("en-IN")}</span>
          </div>
        </section>

        {/* Payment methods */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
            Choose Payment Method
          </h2>
          <div className="space-y-2">
            {gateways.map((g) => {
              const active = selected === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelected(g.id)}
                  disabled={processing}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 rounded-2xl border bg-white text-left transition",
                    active
                      ? "border-emerald-500 ring-2 ring-emerald-100"
                      : "border-gray-200 hover:border-gray-300",
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", g.tone)}>
                    {g.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{g.name}</p>
                    <p className="text-xs text-gray-500">{g.desc}</p>
                  </div>
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                      active ? "border-emerald-500 bg-emerald-500" : "border-gray-300",
                    )}
                  >
                    {active && <Check size={12} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
          <ShieldCheck size={14} className="text-emerald-600" />
          Secure payment · Your subscription extends instantly upon success.
        </div>
      </main>

      {/* Sticky pay button */}
      <div className="fixed bottom-0 left-0 right-0 px-page py-4 bg-gradient-to-t from-[#F4F6FB] via-[#F4F6FB] to-transparent">
        <div className="w-full max-w-md md:max-w-2xl mx-auto">
          <Button
            onClick={handlePay}
            disabled={processing}
            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-semibold text-base shadow-lg"
          >
            {processing ? (
              <>
                <Loader2 className="animate-spin !size-5" /> Processing payment…
              </>
            ) : (
              <>Pay ৳{PLAN_PRICE.toLocaleString("en-IN")}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}