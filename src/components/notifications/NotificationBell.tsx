import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import NotificationPanel from "./NotificationPanel";

const NotificationBell = () => {
  const {
    notifications,
    unreadCount,
    isUnread,
    markAsRead,
    markAllAsRead,
    bumpToken,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (bumpToken === 0) return;
    setAnimating(true);
    const t = setTimeout(() => setAnimating(false), 750);
    return () => clearTimeout(t);
  }, [bumpToken]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative p-2 rounded-full hover:bg-gray-100 transition ml-0 pl-[8px] mr-[10px]"
        >
          <Bell
            size={22}
            className={cn("text-gray-600 mb-0 mt-0 pb-0 pt-[5px]", animating && "animate-jiggle origin-top")}
          />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-[#e9f1fb]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="p-0 w-auto rounded-2xl shadow-xl border border-gray-200"
      >
        <NotificationPanel
          notifications={notifications}
          unreadCount={unreadCount}
          isUnread={isUnread}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;