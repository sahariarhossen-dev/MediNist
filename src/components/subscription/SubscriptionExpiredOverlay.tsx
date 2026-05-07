import { Lock, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function SubscriptionExpiredOverlay() {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-md flex items-center justify-center px-6 animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-rose-100">
          <Lock className="size-8 text-rose-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Subscription Expired</h2>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          Your trial or subscription has ended. Renew now to continue using MediNist and keep your pharmacy running smoothly.
        </p>
        <Button
          onClick={() => navigate("/subscription")}
          className="mt-5 w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl font-semibold"
        >
          Renew Now to Continue <ArrowRight className="!size-4" />
        </Button>
      </div>
    </div>
  );
}