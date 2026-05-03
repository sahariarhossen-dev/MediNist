import { Button } from "@/components/ui/button";
import { Zap, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RenewButton({
  open,
  onClick,
  disabled,
}: {
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full h-14 text-base font-semibold rounded-2xl shadow-md",
        "bg-gradient-to-r from-emerald-500 to-emerald-600",
        "hover:from-emerald-600 hover:to-emerald-700",
        "text-white border-0",
      )}
    >
      <Zap className="!size-5" />
      {open ? "Choose a plan below" : "Renew Now"}
      <ChevronDown
        className={cn("!size-5 transition-transform", open && "rotate-180")}
      />
    </Button>
  );
}
