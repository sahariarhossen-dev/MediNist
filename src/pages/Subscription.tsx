import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, Loader2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StatusCard from "@/components/subscription/StatusCard";
import PaymentHistory from "@/components/subscription/PaymentHistory";
import RenewButton from "@/components/subscription/RenewButton";
import { useSubscription } from "@/hooks/useSubscription";
import WelcomeTrialModal from "@/components/subscription/WelcomeTrialModal";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function Subscription() {
  const navigate = useNavigate();
  const { sub, payments, loading, isTrial, isExpired, pharmacyId, lastPopupShown, refetch } = useSubscription();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (loading || !isTrial || !pharmacyId) return;
    const today = new Date().toISOString().slice(0, 10);
    if (lastPopupShown !== today) setShowWelcome(true);
  }, [loading, isTrial, pharmacyId, lastPopupShown]);

  const dismissWelcome = async () => {
    setShowWelcome(false);
    if (pharmacyId) {
      const today = new Date().toISOString().slice(0, 10);
      await supabase
        .from("pharmacies")
        .update({ last_popup_shown: today } as any)
        .eq("id", pharmacyId);
      refetch();
    }
  };

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F4F6FB] w-full max-w-md md:max-w-2xl mx-auto pb-24">
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
            <StatusCard sub={sub} isTrial={isTrial} />
            {isExpired && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 font-medium">
                Your access is paused — renew to unlock the app.
              </div>
            )}
            <RenewButton open={false} onClick={() => setShowConfirm(true)} />
            <PaymentHistory payments={payments} />
          </>
        )}
      </main>

      {sub && (
        <WelcomeTrialModal
          open={showWelcome}
          onClose={dismissWelcome}
          expiryDate={sub.expiry_date}
        />
      )}

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Renew Subscription</DialogTitle>
            <DialogDescription>
              Confirm your renewal details below.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Plan Price</span>
              <span className="font-semibold text-gray-900">500 BDT</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Validity</span>
              <span className="font-semibold text-gray-900">1 Month (30 Days)</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowConfirm(false);
                navigate("/subscription/checkout");
              }}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold"
            >
              Proceed to Checkout <ArrowRight className="!size-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
