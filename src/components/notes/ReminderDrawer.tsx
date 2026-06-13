import { useMemo, useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Sunset, Sunrise, CalendarClock, Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentIso: string | null;
  onSave: (iso: string) => void;
  onClear: () => void;
}

function laterToday(): Date {
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  return d;
}
function tomorrowMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}
function fmt(d: Date) {
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ReminderDrawer = ({ open, onOpenChange, currentIso, onSave, onClear }: Props) => {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState<string>(toLocalInput(currentIso));

  useEffect(() => {
    if (open) {
      setShowCustom(false);
      setCustomValue(toLocalInput(currentIso));
    }
  }, [open, currentIso]);

  const later = useMemo(() => laterToday(), [open]);
  const tomorrow = useMemo(() => tomorrowMorning(), [open]);
  const laterDisabled = later.getTime() <= Date.now();

  const tile = (
    icon: React.ReactNode,
    label: string,
    sub: string,
    onClick: () => void,
    disabled = false,
  ) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-amber-50/40 hover:from-amber-50 hover:to-amber-100/60 active:scale-[.99] transition disabled:opacity-50 disabled:cursor-not-allowed text-left"
    >
      <span className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-amber-100 text-amber-700">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{sub}</span>
      </span>
    </button>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <DrawerHeader className="px-0 text-left">
          <DrawerTitle>Set Note Reminder</DrawerTitle>
          <DrawerDescription>
            Pick when MediNist should ping you about this note.
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-2.5">
          {tile(
            <Sunset size={20} />,
            "Later Today",
            laterDisabled ? "5:00 PM already passed" : `Today, ${fmt(later)}`,
            () => onSave(later.toISOString()),
            laterDisabled,
          )}
          {tile(
            <Sunrise size={20} />,
            "Tomorrow Morning",
            fmt(tomorrow),
            () => onSave(tomorrow.toISOString()),
          )}
          {tile(
            <CalendarClock size={20} />,
            "Pick Custom Date & Time",
            "Choose exact date and time",
            () => setShowCustom((v) => !v),
          )}

          {showCustom && (
            <div className="mt-2 p-3 rounded-2xl border border-gray-200 bg-white space-y-3">
              <input
                type="datetime-local"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <Button
                type="button"
                onClick={() => {
                  const d = new Date(customValue);
                  if (isNaN(d.getTime())) return;
                  onSave(d.toISOString());
                }}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
              >
                Set Reminder
              </Button>
            </div>
          )}

          {currentIso && (
            <button
              type="button"
              onClick={onClear}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl"
            >
              <Trash2 size={14} /> Clear reminder
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ReminderDrawer;