import { Package, ShoppingCart, Wallet, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relativeTime";
import type { AppNotification, NotificationCategory } from "@/hooks/useNotifications";

interface Props {
  notification: AppNotification;
  unread: boolean;
  onRead: (id: string) => void;
  onClose: () => void;
}

const ICON_MAP: Record<NotificationCategory, { Icon: any; bg: string; fg: string }> = {
  inventory: { Icon: Package, bg: "bg-amber-100", fg: "text-amber-600" },
  sale: { Icon: ShoppingCart, bg: "bg-green-100", fg: "text-green-600" },
  payment: { Icon: Wallet, bg: "bg-emerald-100", fg: "text-emerald-600" },
  due: { Icon: AlertCircle, bg: "bg-orange-100", fg: "text-orange-600" },
};

const NotificationItem = ({ notification, unread, onRead, onClose }: Props) => {
  const navigate = useNavigate();
  const { Icon, bg, fg } = ICON_MAP[notification.category];

  const handleClick = () => {
    onRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
      onClose();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left flex items-start gap-3 px-3 py-2.5 transition-colors",
        unread ? "bg-blue-50/70 hover:bg-blue-50" : "bg-white hover:bg-gray-50",
      )}
    >
      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0", bg)}>
        <Icon size={18} className={fg} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-tight">{notification.title}</p>
        <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-[11px] text-gray-400 mt-1">{relativeTime(notification.createdAt)}</p>
      </div>
      {unread && (
        <span className="mt-2 h-2 w-2 rounded-full bg-blue-500 shrink-0" aria-label="Unread" />
      )}
    </button>
  );
};

export default NotificationItem;