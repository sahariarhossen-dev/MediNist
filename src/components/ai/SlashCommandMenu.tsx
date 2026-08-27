import {
  TrendingUp,
  PackageSearch,
  Trophy,
  CalendarClock,
  Wallet,
  Slash,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface SlashCommand {
  cmd: string;
  label: string;
  prompt: string;
  icon: typeof TrendingUp;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/sales", label: "Today's sales", prompt: "আজকের বিক্রি কত?", icon: TrendingUp },
  {
    cmd: "/stock",
    label: "Low stock medicines",
    prompt: "Kon medicine gulor stock kom ase? List দাও।",
    icon: PackageSearch,
  },
  {
    cmd: "/short-items",
    label: "Short item list",
    prompt: "Short item list দাও, re-order korar jonno.",
    icon: PackageSearch,
  },
  {
    cmd: "/staff-performance",
    label: "Staff performance",
    prompt: "Ei mash e staff der performance kemon?",
    icon: Trophy,
  },
  {
    cmd: "/expiry",
    label: "Expiring soon",
    prompt: "Expire howar age ki ki medicine ase?",
    icon: CalendarClock,
  },
  {
    cmd: "/dues",
    label: "Customer dues",
    prompt: "Total customer due koto? Top customer der list dao.",
    icon: Wallet,
  },
];

const SlashCommandMenu = ({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (command: SlashCommand) => void;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-6">
      <SheetHeader className="px-5 pb-2 text-left">
        <SheetTitle className="flex items-center gap-2 text-base">
          <Slash className="h-4 w-4 text-indigo-500" />
          Quick commands
        </SheetTitle>
      </SheetHeader>
      <ul className="max-h-[60vh] overflow-y-auto">
        {SLASH_COMMANDS.map(({ cmd, label, prompt, icon: Icon }) => (
          <li key={cmd}>
            <button
              type="button"
              onClick={() => onSelect({ cmd, label, prompt, icon: Icon })}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{label}</span>
                <span className="block truncate text-[11.5px] text-slate-500">{cmd}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </SheetContent>
  </Sheet>
);

export default SlashCommandMenu;
