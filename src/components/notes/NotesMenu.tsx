import { Lightbulb, Pin, User as UserIcon, Users, ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export type NotesFilterMode = "all" | "pinned" | "mine" | "shared";

interface NotesMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: NotesFilterMode;
  onModeChange: (mode: NotesFilterMode) => void;
}

const items: { key: NotesFilterMode; label: string; icon: typeof Lightbulb }[] = [
  { key: "all", label: "Notes", icon: Lightbulb },
  { key: "pinned", label: "Pinned", icon: Pin },
  { key: "mine", label: "Mine", icon: UserIcon },
  { key: "shared", label: "Shared with team", icon: Users },
];

const NotesMenu = ({ open, onOpenChange, mode, onModeChange }: NotesMenuProps) => {
  const navigate = useNavigate();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-gray-100">
          <SheetTitle className="text-base font-semibold text-gray-900">
            MediNist Notes
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 py-2">
          {items.map((it) => {
            const Icon = it.icon;
            const active = mode === it.key;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => {
                  onModeChange(it.key);
                  onOpenChange(false);
                }}
                className={cn(
                  "w-full flex items-center gap-4 pl-5 pr-4 py-3 text-sm transition rounded-r-full mr-3",
                  active
                    ? "bg-[#feefc3] text-gray-900 font-medium"
                    : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <Icon size={18} className={active ? "text-gray-900" : "text-gray-500"} />
                <span>{it.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate("/more");
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 rounded-md hover:bg-gray-50"
          >
            <ArrowLeft size={16} />
            Back to More
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NotesMenu;
