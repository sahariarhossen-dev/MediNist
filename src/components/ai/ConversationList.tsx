import { useState, useCallback } from "react";
import { Plus, Trash2, Pin, X } from "lucide-react";
import ConversationRow from "./ConversationRow";
import ChatContextMenu from "./ChatContextMenu";
import {
  getConversations,
  createConversation,
  deleteConversation,
  deleteMultiple,
  togglePin,
  pinMultiple,
  type Conversation,
} from "./chatStore";
import { toast } from "sonner";

interface Props {
  onOpenChat: (id: string) => void;
}

const ConversationList = ({ onOpenChat }: Props) => {
  const [convos, setConvos] = useState<Conversation[]>(getConversations);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const refresh = () => setConvos(getConversations());

  const handleNew = () => {
    const c = createConversation();
    refresh();
    onOpenChat(c.id);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  };

  const handleLongPress = (id: string, e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 100 : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 200 : (e as React.MouseEvent).clientY;
    setCtxMenu({ id, x: clientX, y: clientY });
  };

  const handleCtxAction = useCallback(
    (action: string) => {
      if (!ctxMenu) return;
      const id = ctxMenu.id;
      setCtxMenu(null);
      switch (action) {
        case "pin":
          togglePin(id);
          refresh();
          toast.success("Toggled pin");
          break;
        case "copy": {
          const c = convos.find((c) => c.id === id);
          if (c) navigator.clipboard.writeText(c.preview);
          toast.success("Copied to clipboard");
          break;
        }
        case "select":
          setSelectMode(true);
          setSelectedIds(new Set([id]));
          break;
        case "delete":
          deleteConversation(id);
          refresh();
          toast.success("Chat deleted");
          break;
        case "detail":
          onOpenChat(id);
          break;
        default:
          toast.info("Coming soon");
      }
    },
    [ctxMenu, convos, onOpenChat]
  );

  const handleBulkDelete = () => {
    deleteMultiple(Array.from(selectedIds));
    exitSelectMode();
    refresh();
    toast.success("Chats deleted");
  };

  const handleBulkPin = () => {
    pinMultiple(Array.from(selectedIds));
    exitSelectMode();
    refresh();
    toast.success("Chats pinned");
  };

  const pinned = convos.filter((c) => c.pinned);
  const now = Date.now();
  const recent = convos.filter((c) => !c.pinned && now - c.updatedAt < 86400000);
  const allOther = convos.filter((c) => !c.pinned && now - c.updatedAt >= 86400000);

  const Section = ({ label, items }: { label: string; items: Conversation[] }) =>
    items.length > 0 ? (
      <div className="mb-3">
        <h2 className="text-[10px] font-bold tracking-widest text-[#64748B] uppercase px-4 mb-1.5">{label}</h2>
        <div className="space-y-1">
          {items.map((c) => (
            <ConversationRow
              key={c.id}
              convo={c}
              selected={selectedIds.has(c.id)}
              selectMode={selectMode}
              onClick={() => onOpenChat(c.id)}
              onLongPress={(e) => handleLongPress(c.id, e)}
              onToggleSelect={() => toggleSelect(c.id)}
            />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0A0F1C] z-50">
      {/* Header */}
      <div className="px-4 pt-[env(safe-area-inset-top,12px)] pb-2 shrink-0">
        {selectMode ? (
          <div className="flex items-center justify-between py-2">
            <button onClick={exitSelectMode} className="text-[#94A3B8]">
              <X className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold text-[#F1F5F9]">{selectedIds.size} Selected</h1>
            <div className="w-5" />
          </div>
        ) : (
          <h1 className="text-xl font-bold text-[#F1F5F9] py-2">MediNist Conversations</h1>
        )}
      </div>

      {/* New Chat button */}
      {!selectMode && (
        <div className="px-4 mb-3">
          <button
            onClick={handleNew}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 bg-[#1A8CFF] text-white
              font-semibold text-sm shadow-lg shadow-[#1A8CFF]/20 hover:bg-[#1578D9] transition-colors active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-24">
        <Section label="Pin Chat" items={pinned} />
        <Section label="Recent" items={recent} />
        <Section label="All Chat" items={allOther} />
        {convos.length === 0 && (
          <p className="text-center text-sm text-[#64748B] mt-12">No conversations yet</p>
        )}
      </div>

      {/* Multi-select bottom bar */}
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#111827] border-t border-[#1E293B] px-6 py-3
          flex items-center justify-around pb-[env(safe-area-inset-bottom,12px)]">
          <button onClick={handleBulkDelete} className="flex flex-col items-center gap-1 text-red-400">
            <Trash2 className="w-5 h-5" />
            <span className="text-[10px]">Delete</span>
          </button>
          <button onClick={handleBulkPin} className="flex flex-col items-center gap-1 text-[#1A8CFF]">
            <Pin className="w-5 h-5" />
            <span className="text-[10px]">Pin</span>
          </button>
          <button onClick={exitSelectMode} className="flex flex-col items-center gap-1 text-[#94A3B8]">
            <X className="w-5 h-5" />
            <span className="text-[10px]">Cancel</span>
          </button>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ChatContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onAction={handleCtxAction}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};

export default ConversationList;
