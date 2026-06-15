import { Plus, MessageSquare, Trash2, Settings } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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

const initials = (name: string | null | undefined) => {
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
  if (r === "admin" || r === "owner") return "Owner";
  if (r === "manager") return "Manager";
  if (r === "salesman") return "Salesman";
  return "Member";
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
  const navigate = useNavigate();
  const { profile } = useAuth();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[85vw] max-w-sm flex-col gap-0 border-r border-slate-200/70 bg-white p-0"
      >
        <div className="px-3 pb-2 pt-4">
          <Button
            onClick={() => {
              onNewChat();
              onOpenChange(false);
            }}
            className="h-11 w-full justify-start gap-2 rounded-full bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>

        <div className="px-4 pb-1 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Recent</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            {conversations.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-slate-400">
                No conversations yet
              </p>
            )}
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl px-2.5 py-2 transition-all active:scale-[0.99]",
                    isActive
                      ? "bg-slate-100"
                      : "hover:bg-slate-50"
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
                        isActive ? "text-slate-700" : "text-slate-400"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm",
                          isActive ? "font-medium text-slate-900" : "text-slate-700"
                        )}
                      >
                        {c.title}
                      </p>
                      <p className="text-[10px] text-slate-400">{formatDate(c.updated_at)}</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this conversation?")) onDelete(c.id);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="border-t border-slate-200/70 px-3 py-3">
          <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
            <Avatar className="h-9 w-9 ring-1 ring-slate-200">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={profile?.full_name ?? "Profile"} />
              )}
              <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700">
                {initials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {profile?.full_name ?? "Account"}
              </p>
              <p className="truncate text-[11px] text-slate-500">{roleLabel(profile?.role)}</p>
            </div>
            <button
              onClick={() => {
                onOpenChange(false);
                navigate("/profile");
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
              aria-label="Open settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ConversationSidebar;
