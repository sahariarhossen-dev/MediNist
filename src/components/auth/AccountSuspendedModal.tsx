import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, PhoneCall, AlertTriangle } from "lucide-react";
import {
  getStoredSuspensionNotice,
  clearStoredSuspensionNotice,
  SuspensionNoticeData,
} from "@/lib/accountSuspension";

interface AccountSuspendedModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  reason?: string | null;
}

export const AccountSuspendedModal: React.FC<AccountSuspendedModalProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
  reason: propReason,
}) => {
  const [internalOpen, setInternalOpen] = useState<boolean>(false);
  const [noticeData, setNoticeData] = useState<SuspensionNoticeData | null>(null);

  // Check stored notice or listen to custom events
  useEffect(() => {
    // If controlled from props, sync
    if (propIsOpen !== undefined) {
      setInternalOpen(propIsOpen);
      return;
    }

    // Check storage on mount
    const stored = getStoredSuspensionNotice();
    if (stored) {
      setNoticeData(stored);
      setInternalOpen(true);
    }

    // Listen to account suspension event
    const handleSuspendedEvent = (e: Event) => {
      const customEvent = e as CustomEvent<SuspensionNoticeData>;
      setNoticeData(customEvent.detail || null);
      setInternalOpen(true);
    };

    const handleClearedEvent = () => {
      setInternalOpen(false);
      setNoticeData(null);
    };

    window.addEventListener("medinist:account-suspended", handleSuspendedEvent);
    window.addEventListener("medinist:account-suspended-cleared", handleClearedEvent);

    return () => {
      window.removeEventListener("medinist:account-suspended", handleSuspendedEvent);
      window.removeEventListener("medinist:account-suspended-cleared", handleClearedEvent);
    };
  }, [propIsOpen]);

  const effectiveOpen = propIsOpen !== undefined ? propIsOpen : internalOpen;
  const effectiveReason = propReason || noticeData?.reason;

  const handleDismiss = () => {
    clearStoredSuspensionNotice();
    setInternalOpen(false);
    if (propOnClose) {
      propOnClose();
    }
  };

  return (
    <Dialog open={effectiveOpen} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent
        className="max-w-md w-[92vw] sm:w-full p-0 overflow-hidden rounded-2xl border border-rose-200/80 shadow-2xl bg-white"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {/* Top visual warning banner */}
        <div className="bg-gradient-to-b from-rose-50 to-rose-100/50 p-6 flex flex-col items-center text-center border-b border-rose-100">
          <div className="w-16 h-16 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 mb-3 ring-4 ring-rose-100">
            <ShieldAlert size={34} strokeWidth={2.2} />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-semibold mb-2">
            <AlertTriangle size={13} className="text-rose-600" />
            অ্যাক্সেস সাসপেন্ডেড / Access Suspended
          </span>
          <DialogTitle className="text-xl font-bold text-gray-900 tracking-tight">
            অ্যাকাউন্ট সাসপেন্ড করা হয়েছে
          </DialogTitle>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-4">
          {/* Bengali primary message requested by user */}
          <div className="bg-rose-50/70 border border-rose-200/70 rounded-xl p-4 text-gray-800 text-sm leading-relaxed text-center font-medium">
            "আপনার অ্যাকাউন্টটি ওনার সাময়িকভাবে সাসপেন্ড করেছেন। শপ ওনার এটি আন-সাসপেন্ড না করা পর্যন্ত আপনি এই শপে প্রবেশ করতে পারবেন না।"
          </div>

          {/* English translation */}
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            Your account access has been temporarily suspended by the shop owner. You will not be able to access this shop until the owner reactivates your account.
          </p>

          {/* Reason box if available */}
          {effectiveReason && (
            <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900">
              <span className="font-semibold block mb-0.5 text-amber-950">
                সাসপেনশনের কারণ / Reason:
              </span>
              <p className="text-amber-900 italic font-mono">"{effectiveReason}"</p>
            </div>
          )}

          {/* Guidance note */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-100 text-gray-600 text-xs">
            <PhoneCall size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <span>
              পুনরায় অ্যাক্সেস পাওয়ার জন্য আপনার শপ বা ফার্মেসি ওনারের সাথে যোগাযোগ করুন।
            </span>
          </div>

          {/* Action button */}
          <div className="pt-2">
            <Button
              type="button"
              onClick={handleDismiss}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-medium py-2.5 rounded-xl shadow-sm transition-all focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              ঠিক আছে / Understood
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
