import { Lock } from "lucide-react";
import { useReadOnlyLock } from "@/hooks/useReadOnlyLock";

const ReadOnlyBanner = () => {
  const { locked, reason } = useReadOnlyLock();
  if (!locked) return null;

  return (
    <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 flex items-center gap-2">
      <Lock size={14} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-bold leading-tight">App Blocked by Shop Owner</p>
        <p className="text-[11px] opacity-90 leading-tight truncate">
          {reason || "You can view your data but cannot make any changes right now."}
        </p>
      </div>
    </div>
  );
};

export default ReadOnlyBanner;
