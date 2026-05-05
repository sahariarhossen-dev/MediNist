import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function SubscriptionPaymentReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invoiceId = params.get("invoice_id");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!invoiceId) {
      setState("error");
      setMessage("Missing invoice id.");
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke("uddoktapay-verify", {
        body: { invoice_id: invoiceId },
      });
      if (error || !data?.ok) {
        setState("error");
        setMessage((data as any)?.message || error?.message || "Payment could not be verified.");
        return;
      }
      setState("success");
      confetti({
        particleCount: 140,
        spread: 80,
        origin: { y: 0.7 },
        colors: ["#10b981", "#34d399", "#6ee7b7", "#facc15"],
      });
      toast.success("Subscription Extended Successfully!", {
        description: "+30 days added to your plan.",
      });
      setTimeout(() => navigate("/subscription", { replace: true }), 1200);
    })();
  }, [invoiceId, navigate]);

  return (
    <div className="min-h-screen bg-[#F4F6FB] w-full max-w-md md:max-w-2xl mx-auto flex items-center justify-center px-page">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full text-center space-y-4">
        {state === "loading" && (
          <>
            <Loader2 className="animate-spin text-emerald-600 mx-auto" size={36} />
            <h1 className="text-lg font-bold text-gray-900">Verifying payment…</h1>
            <p className="text-sm text-gray-500">Please wait while we confirm your transaction.</p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="text-emerald-600 mx-auto" size={48} />
            <h1 className="text-lg font-bold text-gray-900">Payment successful</h1>
            <p className="text-sm text-gray-500">Redirecting to your subscription…</p>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="text-red-500 mx-auto" size={48} />
            <h1 className="text-lg font-bold text-gray-900">Payment failed</h1>
            <p className="text-sm text-gray-500">{message}</p>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/subscription")}>
                Back
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => navigate("/subscription/checkout")}
              >
                Try again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}