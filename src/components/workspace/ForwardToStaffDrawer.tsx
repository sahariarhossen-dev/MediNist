import { useMemo, useState } from "react";
import { Users, Send, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useChatInbox } from "@/hooks/useChatInbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initials = (n: string) =>
  n.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Message body forwarded into the selected staff thread. */
  content: string;
  title?: string;
  description?: string;
  /** Prefix prepended to the forwarded body (e.g. task framing). */
  prefix?: string;
  /** Called with a delivery receipt (e.g. "Sent to Rakib — 5 items"). */
  onSent?: (receipt: string) => void;
}

/** Count list-ish lines in a forwarded body so the receipt can say "5 items". */
const countItems = (body: string) =>
  body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^([-*•]|\d+[.)])\s+/.test(l)).length;

const ForwardToStaffDrawer = ({
  open,
  onOpenChange,
  content,
  title = "Forward to staff",
  description = "Pick a chat thread to send this report to.",
  prefix,
}: Props) => {
  const { user, profile } = useAuth();
  const { rooms } = useChatInbox();
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((r) => !q || r.display_name.toLowerCase().includes(q));
  }, [rooms, query]);

  const send = async (roomId: string, name: string) => {
    if (!user || !profile?.pharmacy_id) return;
    const body = [prefix, note.trim(), content.trim()].filter(Boolean).join("\n\n");
    if (!body) return;
    setSendingTo(roomId);
    const { error } = await supabase.from("chat_messages").insert({
      room_id: roomId,
      sender_id: user.id,
      pharmacy_id: profile.pharmacy_id,
      content: body,
    });
    setSendingTo(null);
    if (error) {
      toast.error("Could not send", { description: error.message });
      return;
    }
    toast.success(`Sent to ${name}`);
    setNote("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-6">
        <SheetHeader className="px-5 text-left">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="text-[12.5px]">{description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-2 px-5 pb-3 pt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a note (optional)"
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-300"
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search staff or groups"
              className="border-0 bg-slate-100 pl-9"
            />
          </div>
        </div>

        <div className="max-h-[45vh] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No chat threads yet. Start one from the Chats tab first.
            </p>
          )}
          {filtered.map((r) => (
            <div key={r.room_id} className="flex items-center gap-3 px-5 py-2.5">
              <Avatar className="h-10 w-10">
                {r.avatar_url ? <AvatarImage src={r.avatar_url} alt={r.display_name} /> : null}
                <AvatarFallback
                  className={
                    r.type === "group"
                      ? "bg-gradient-to-br from-emerald-400 to-green-600 text-white"
                      : "bg-blue-500 text-xs font-semibold text-white"
                  }
                >
                  {r.type === "group" ? <Users className="h-4 w-4" /> : initials(r.display_name)}
                </AvatarFallback>
              </Avatar>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                {r.display_name}
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={sendingTo === r.room_id}
                onClick={() => send(r.room_id, r.display_name)}
                className="h-8 gap-1.5 rounded-full px-3 text-xs"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ForwardToStaffDrawer;
