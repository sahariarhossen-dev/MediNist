import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Check, LogOut, Pencil, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import ProfileSheet, { type ProfileMember } from "./ProfileSheet";
import type { RoomInfo, RoomMember } from "@/hooks/useChatRoom";

const initials = (n: string | null | undefined) =>
  (n || "?").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

const humanRole = (r?: string | null) =>
  !r ? "Member" : r === "admin" ? "Owner" : r.charAt(0).toUpperCase() + r.slice(1);

const GroupInfoSheet = ({
  open,
  onOpenChange,
  room,
  members,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  room: RoomInfo | null;
  members: RoomMember[];
  onChanged: () => void;
}) => {
  const { user, profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room?.name || "");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ProfileMember | null>(null);

  const me = members.find((m) => m.user_id === user?.id);
  const canEdit = !!me?.is_admin || profile?.role === "admin";

  const saveName = async () => {
    if (!room || !name.trim() || name.trim() === room.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("chat_rooms").update({ name: name.trim() }).eq("id", room.id);
    setBusy(false);
    if (error) {
      toast({ title: "Could not rename group", description: error.message, variant: "destructive" });
      return;
    }
    setEditing(false);
    onChanged();
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !room || !profile?.pharmacy_id) return;
    setBusy(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${profile.pharmacy_id}/groups/${room.id}/icon-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("pharmacy-assets").upload(path, file, { upsert: true });
    if (up.error) {
      setBusy(false);
      toast({ title: "Upload failed", description: up.error.message, variant: "destructive" });
      return;
    }
    const { data: pub } = supabase.storage.from("pharmacy-assets").getPublicUrl(path);
    const { error } = await supabase.from("chat_rooms").update({ avatar_url: pub.publicUrl }).eq("id", room.id);
    setBusy(false);
    if (error) {
      toast({ title: "Could not update group icon", description: error.message, variant: "destructive" });
      return;
    }
    onChanged();
  };

  const leaveGroup = async () => {
    if (!room || !user) return;
    if (!confirm("Leave this group?")) return;
    setBusy(true);
    const { error } = await supabase
      .from("chat_room_members")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      toast({ title: "Could not leave", description: error.message, variant: "destructive" });
      return;
    }
    onOpenChange(false);
    window.location.href = "/messages";
  };

  if (!room) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Group info</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center px-4 pt-6 pb-4 bg-gray-50 relative">
            <div className="relative">
              <Avatar className="h-28 w-28 mb-3">
                {room.avatar_url ? <AvatarImage src={room.avatar_url} className="object-cover" /> : null}
                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-green-600 text-white">
                  <Users className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
              {canEdit && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="absolute bottom-3 right-0 h-8 w-8 rounded-full bg-green-500 text-white flex items-center justify-center shadow"
                  aria-label="Change group icon"
                >
                  <Camera className="h-4 w-4" />
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            </div>
            {editing ? (
              <div className="flex items-center gap-2 w-full max-w-xs">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
                <Button size="sm" onClick={saveName} disabled={busy} className="bg-green-500 hover:bg-green-600">
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">{room.name || "Group"}</h2>
                {canEdit && (
                  <button
                    onClick={() => {
                      setName(room.name || "");
                      setEditing(true);
                    }}
                    className="h-7 w-7 rounded-full hover:bg-gray-200 flex items-center justify-center"
                  >
                    <Pencil className="h-3.5 w-3.5 text-gray-600" />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            <p className="px-4 pt-4 pb-2 text-[11px] text-gray-500 uppercase tracking-wide">Members</p>
            {members.map((m) => (
              <button
                key={m.user_id}
                onClick={() =>
                  setSelected({
                    user_id: m.user_id,
                    full_name: m.full_name,
                    avatar_url: m.avatar_url,
                    last_seen: m.last_read_at,
                  })
                }
                className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
              >
                <Avatar className="h-10 w-10">
                  {m.avatar_url ? <AvatarImage src={m.avatar_url} className="object-cover" /> : null}
                  <AvatarFallback className="bg-blue-500 text-white text-xs font-semibold">
                    {initials(m.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {m.user_id === user?.id ? "You" : m.full_name || "Member"}
                  </p>
                  <p className="text-xs text-gray-500">{humanRole(null)}</p>
                </div>
                {m.is_admin && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                )}
              </button>
            ))}
          </div>

          {!me?.is_admin && (
            <div className="border-t p-3">
              <Button onClick={leaveGroup} variant="destructive" className="w-full" disabled={busy}>
                <LogOut className="h-4 w-4 mr-2" /> Leave group
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ProfileSheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)} member={selected} />
    </>
  );
};

export default GroupInfoSheet;