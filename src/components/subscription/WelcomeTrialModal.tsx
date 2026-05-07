import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Gift } from "lucide-react";
import { formatDate } from "@/lib/subscriptionMock";

export default function WelcomeTrialModal({
  open,
  onClose,
  expiryDate,
}: {
  open: boolean;
  onClose: () => void;
  expiryDate: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl border-0 p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 px-6 pt-8 pb-6 text-center text-white relative">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <Sparkles className="absolute top-4 left-6 size-5 animate-pulse" />
            <Sparkles className="absolute top-10 right-8 size-3 animate-pulse" style={{ animationDelay: "0.4s" }} />
            <Sparkles className="absolute bottom-6 left-10 size-4 animate-pulse" style={{ animationDelay: "0.8s" }} />
          </div>
          <div className="relative mx-auto mb-3 flex size-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm animate-scale-in">
            <Gift className="size-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Welcome to the Pro Family! 🌟</h2>
          <p className="text-sm text-white/90 leading-relaxed">
            You've unlocked <span className="font-semibold">1 month of free premium access</span> to manage your pharmacy effortlessly.
          </p>
        </div>
        <div className="px-6 pb-6 pt-4 bg-white space-y-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
            <p className="text-xs text-emerald-700 font-medium uppercase tracking-wide">Free trial ends</p>
            <p className="text-sm font-bold text-emerald-900 mt-0.5">{formatDate(expiryDate)}</p>
          </div>
          <Button
            onClick={onClose}
            className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white rounded-xl font-semibold"
          >
            <Sparkles className="!size-4" /> Start Exploring
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}