import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, MessageSquarePlus } from "lucide-react";
import { usePharmacyStaff } from "@/hooks/usePharmacyStaff";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import NewGroupSheet from "./NewGroupSheet";

const initials = (n: string | null) =>
  (n || "?").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

const NewChatSheet = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const navigate = useNavigate();
  const { staff, loading } = usePharmacyStaff();
  const { profile } = useAuth();
  const [groupOpen, setGroupOpen] = useState(false);
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

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>New chat</SheetTitle>
          </SheetHeader>
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