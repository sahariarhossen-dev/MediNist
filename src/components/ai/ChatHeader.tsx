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
    <header className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md">
      <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
        <button
          onClick={onToggleSidebar}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 active:scale-95"
          aria-label="Open conversation history"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-1.5 shadow-sm">
          <LogoMark size={28} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-bold text-white sm:text-lg">MediNist AI</h1>
            {badge && (
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="truncate text-[11px] text-blue-100 sm:text-xs">{subtitle}</p>
          )}
        </div>

        <button
          onClick={() => navigate("/profile")}
          className="shrink-0 rounded-full ring-2 ring-white/30 transition hover:ring-white/60 active:scale-95"
          aria-label="Open profile"
        >
          <Avatar className="h-9 w-9">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName ?? "Profile"} />}
            <AvatarFallback className="bg-white/20 text-xs font-semibold text-white">
              {initials(userName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </div>
    </header>
  );
};

export default ChatHeader;
