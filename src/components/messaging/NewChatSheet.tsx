import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, MessageSquarePlus, Sparkles, ChevronRight } from "lucide-react";
import { usePharmacyStaff } from "@/hooks/usePharmacyStaff";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import NewGroupSheet from "./NewGroupSheet";
import AiTopicModal from "@/components/ai/AiTopicModal";
import { createAiThread } from "@/hooks/useAiThreads";
import type { TopicKey } from "@/lib/aiTopics";

const initials = (n: string | null) =>
  (n || "?").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

const NewChatSheet = ({
  open,
  onOpenChange,
  aiFirst,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Open the AI topic modal as soon as the sheet mounts. */
  aiFirst?: boolean;
}) => {
  const navigate = useNavigate();
  const { staff, loading } = usePharmacyStaff();
  const { user, profile } = useAuth();
  const [groupOpen, setGroupOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(!!aiFirst);
  const [busy, setBusy] = useState(false);

  const startDirect = async (otherId: string) => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("get_or_create_direct_room", { _other_user: otherId });
    setBusy(false);
    if (error) {
      toast({ title: "Could not start chat", description: error.message, variant: "destructive" });
      return;
    }
    onOpenChange(false);
    navigate(`/workspace/room/${data}`);
  };

  const startTopic = async (title: string, topicKey: TopicKey) => {
    if (!user?.id || !profile?.pharmacy_id) {
      toast({ title: "Pharmacy not configured", variant: "destructive" });
      return;
    }
    setBusy(true);
    const id = await createAiThread(user.id, profile.pharmacy_id, title, topicKey);
    setBusy(false);
    if (!id) {
      toast({ title: "Could not create the topic", variant: "destructive" });
      return;
    }
    setTopicOpen(false);
    onOpenChange(false);
    navigate(`/workspace/ai/${id}`);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>New chat</SheetTitle>
          </SheetHeader>

          <button
            onClick={() => setTopicOpen(true)}
            className="flex items-center gap-3 border-b bg-gradient-to-r from-indigo-50/70 to-transparent px-4 py-3.5 text-left transition-colors hover:bg-indigo-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">MediNist AI (Co-pilot)</p>
              <p className="text-xs text-gray-500">Start a topic-based AI conversation</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
          </button>

          {profile?.role === "admin" && (
            <button
              onClick={() => setGroupOpen(true)}
              className="flex items-center gap-3 px-4 py-3 border-b hover:bg-gray-50 text-left"
            >
              <div className="h-10 w-10 rounded-full bg-green-500 text-white flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">New group</p>
                <p className="text-xs text-gray-500">Create a team chat</p>
              </div>
            </button>
          )}
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
            {!loading && staff.length === 0 && (
              <p className="p-6 text-sm text-gray-500 text-center">No teammates yet.</p>
            )}
            {staff.map((s) => (
              <button
                key={s.user_id}
                onClick={() => startDirect(s.user_id)}
                disabled={busy}
                className="flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left disabled:opacity-50"
              >
                <Avatar className="h-10 w-10">
                  {s.avatar_url ? <AvatarImage src={s.avatar_url} /> : null}
                  <AvatarFallback className="bg-blue-500 text-white text-xs font-semibold">
                    {initials(s.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold text-sm text-gray-900">{s.full_name || "Member"}</p>
                  <p className="text-xs text-gray-500 capitalize">{s.role || "salesman"}</p>
                </div>
                <MessageSquarePlus className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <AiTopicModal
        open={topicOpen}
        onOpenChange={setTopicOpen}
        busy={busy}
        onCreate={startTopic}
      />

      <NewGroupSheet
        open={groupOpen}
        onOpenChange={(v) => {
          setGroupOpen(v);
          if (!v) onOpenChange(false);
        }}
      />
    </>
  );
};

export default NewChatSheet;
