import { Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import LogoMark from "@/components/brand/LogoMark";

interface ChatHeaderProps {
  pharmacyName: string | null;
  userName: string | null;
  avatarUrl: string | null;
  role?: string | null;
  onToggleSidebar: () => void;
}

const initials = (name: string | null) => {
  if (!name) return "U";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

const roleLabel = (role?: string | null) => {
  const r = (role ?? "").toLowerCase();
  if (r === "admin" || r === "owner") return "Owner view";
  if (r === "manager") return "Manager view";
  if (r === "salesman") return "Salesman view · limited";
  return null;
};

const ChatHeader = ({ pharmacyName, userName, avatarUrl, role, onToggleSidebar }: ChatHeaderProps) => {
  const navigate = useNavigate();
  const subtitle = [pharmacyName, userName].filter(Boolean).join(" · ");
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

        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          <LogoMark size={28} />
        </div>

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

        <button
          onClick={() => navigate("/profile")}
          className="shrink-0 rounded-full transition active:scale-95"
          aria-label="Open profile"
        >
          <Avatar className="h-9 w-9 ring-1 ring-slate-200">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName ?? "Profile"} />}
            <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700">
              {initials(userName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </div>
    </header>
  );
};

export default ChatHeader;
