import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import NotificationItem from "./NotificationItem";
import type { AppNotification } from "@/hooks/useNotifications";

interface Props {
  notifications: AppNotification[];
  unreadCount: number;
  isUnread: (id: string) => boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClose: () => void;
}

const NotificationPanel = ({
  notifications,
  unreadCount,
  isUnread,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose,
}: Props) => {
  const [tab, setTab] = useState<"all" | "unread">("all");

  const unreadList = useMemo(
    () => notifications.filter((n) => isUnread(n.id)),
    [notifications, isUnread],
  );

  const renderList = (items: AppNotification[]) => {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Bell size={20} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">You're all caught up</p>
          <p className="text-xs text-gray-500 mt-1">No new notifications right now.</p>
        </div>
      );
    }
    return (
      <ScrollArea className="max-h-[60vh]">
        <div className="divide-y divide-gray-100">
          {items.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              unread={isUnread(n.id)}
              onRead={onMarkAsRead}
              onClose={onClose}
            />
          ))}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="w-[360px] max-w-[calc(100vw-24px)]">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-base font-semibold text-gray-900">Notifications</h3>
        <button
          onClick={onMarkAllAsRead}
          disabled={unreadCount === 0}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mark all as read
        </button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")} className="w-full">
        <div className="px-3">
          <TabsList className="h-9 bg-gray-100/70 w-full">
            <TabsTrigger value="all" className="flex-1 text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="flex-1 text-xs gap-1.5">
              Unread
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[10px] font-semibold px-1">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="all" className="mt-2">
          {renderList(notifications)}
        </TabsContent>
        <TabsContent value="unread" className="mt-2">
          {renderList(unreadList)}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NotificationPanel;