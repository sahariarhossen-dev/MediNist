import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const PLAN_DAYS = 30;
const PLAN_PRICE = 2000;

export default function SubscriptionCheckout() {
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);

  const handlePay = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-uddoktapay-checkout", {
        body: {
          days: PLAN_DAYS,
          amount: PLAN_PRICE,
          app_url: window.location.origin,
        },
      });
      if (error) throw error;
      const url = (data as any)?.payment_url;
      if (!url) throw new Error((data as any)?.error ?? "no_url");
      window.location.href = url;
    } catch (e: any) {
      toast.error("Could not connect to payment gateway. Please try again.");
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

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Payment
          </h2>
          <p className="text-sm text-gray-700">
            You'll be redirected to UddoktaPay's secure checkout to pay with{" "}
            <span className="font-medium">bKash, Nagad, Rocket</span> or{" "}
            <span className="font-medium">Card</span>.
          </p>
        </section>

        <Button
          onClick={handlePay}
          disabled={processing}
          className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-semibold text-base shadow-lg"
        >
          {processing ? (
            <>
              <Loader2 className="animate-spin !size-5" /> Connecting to gateway…
            </>
          ) : (
            <>
              <Lock className="!size-5" /> Confirm & Pay ৳{PLAN_PRICE.toLocaleString("en-IN")}
            </>
          )}
        </Button>

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
                <Loader2 className="animate-spin !size-5" /> Redirecting to gateway…
              </>
            ) : (
              <>Pay ৳{PLAN_PRICE.toLocaleString("en-IN")} with UddoktaPay</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}