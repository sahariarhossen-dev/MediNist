import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import LogoFull from "@/components/brand/LogoFull";
import NotificationBell from "@/components/notifications/NotificationBell";

const AppHeader = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="flex items-center justify-between px-page pb-[10px] pt-[20px] border-muted-foreground rounded-lg border-0 bg-[#e9f1fb] border-solid opacity-100">
      <LogoFull height={28} />
      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />
        <Avatar className="h-9 w-9 cursor-pointer" onClick={() => navigate("/profile")}>
          {profile?.avatar_url ? (
            <AvatarImage src={profile.avatar_url} alt="Avatar" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-blue-500 text-white text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
};

export default AppHeader;
