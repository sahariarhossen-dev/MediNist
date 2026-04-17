import { Plus, MessageSquare, Trash2, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface ConversationSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const dayMs = 86400000;
  if (diffMs < dayMs && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffMs < 7 * dayMs) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const ConversationSidebar = ({
  open,
  onOpenChange,
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
}: ConversationSidebarProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[85vw] max-w-sm flex-col gap-0 border-0 bg-white p-0"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Chat history</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 py-3">
          <Button
            onClick={() => {
              onNewChat();
              onOpenChange(false);
            }}
            className="h-11 w-full justify-start gap-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-md hover:from-blue-700 hover:to-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 px-2 pb-4">
            {conversations.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-gray-400">
                No conversations yet
              </p>
            )}
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-2 py-2 transition",
                    isActive ? "bg-blue-50" : "hover:bg-gray-50"
                  )}
                >
                  <button
                    onClick={() => {
                      onSelect(c.id);
                      onOpenChange(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <MessageSquare
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-blue-600" : "text-gray-400"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm",
                          isActive ? "font-semibold text-blue-700" : "text-gray-800"
                        )}
                      >
                        {c.title}
                      </p>
                      <p className="text-[10px] text-gray-400">{formatDate(c.updated_at)}</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this conversation?")) onDelete(c.id);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default ConversationSidebar;
