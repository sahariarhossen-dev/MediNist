import { Menu } from "lucide-react";
import LogoMark from "@/components/brand/LogoMark";

interface ChatHeaderProps {
  pharmacyName: string | null;
  role?: string | null;
  onToggleSidebar: () => void;
}

const roleLabel = (role?: string | null) => {
  const r = (role ?? "").toLowerCase();
  if (r === "admin" || r === "owner") return "Owner view";
  if (r === "manager") return "Manager view";
  if (r === "salesman") return "Salesman view · limited";
  return null;
};

const ChatHeader = ({ pharmacyName, role, onToggleSidebar }: ChatHeaderProps) => {
  const badge = roleLabel(role);

  return (
    <header className="shrink-0 border-b border-slate-200/70 bg-white">
      <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
        <button
          onClick={onToggleSidebar}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95"
          aria-label="Open conversation history"
        >
          <Menu className="h-5 w-5" />
        </button>

        <LogoMark size={28} className="h-7 w-7" />

        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-slate-900 sm:text-base">
            MediNist AI
          </h1>
          {pharmacyName && (
            <p className="truncate text-[11px] text-slate-500">{pharmacyName}</p>
          )}
        </div>

        {badge && (
          <span className="hidden shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600 sm:inline-flex">
            {badge}
          </span>
        )}
      </div>
    </header>
  );
};

export default ChatHeader;
