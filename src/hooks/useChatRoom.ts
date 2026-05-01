import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
}

export interface RoomMember {
  user_id: string;
  is_admin: boolean;
  last_read_at: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  phone: string | null;
}

export interface RoomInfo {
  id: string;
  type: "direct" | "group";
  name: string | null;
  avatar_url: string | null;
  created_by: string;
  pharmacy_id: string;
}

export const useChatRoom = (roomId: string | undefined) => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadAll = useCallback(async () => {
    if (!roomId) return;
    const [r, m, msgs] = await Promise.all([
      supabase.from("chat_rooms").select("*").eq("id", roomId).maybeSingle(),
      supabase.from("chat_room_members").select("user_id,is_admin,last_read_at").eq("room_id", roomId),
      supabase.from("chat_messages").select("*").eq("room_id", roomId).order("created_at", { ascending: true }).limit(200),
    ]);
    if (r.data) setRoom(r.data as unknown as RoomInfo);
    if (msgs.data) setMessages(msgs.data as ChatMessage[]);
    if (m.data) {
      const ids = (m.data as { user_id: string; is_admin: boolean; last_read_at: string }[]).map((x) => x.user_id);
      const profiles = ids.length
        ? await supabase.from("profiles").select("id,full_name,avatar_url,role,phone").in("id", ids)
        : {
            data: [] as {
              id: string;
              full_name: string | null;
              avatar_url: string | null;
              role: string | null;
              phone: string | null;
            }[],
          };
      const map = new Map((profiles.data || []).map((p) => [p.id, p]));
      setMembers(
        (m.data as { user_id: string; is_admin: boolean; last_read_at: string }[]).map((mb) => ({
          user_id: mb.user_id,
          is_admin: mb.is_admin,
          last_read_at: mb.last_read_at,
          full_name: map.get(mb.user_id)?.full_name ?? null,
          avatar_url: map.get(mb.user_id)?.avatar_url ?? null,
          role: map.get(mb.user_id)?.role ?? null,
          phone: map.get(mb.user_id)?.phone ?? null,
        }))
      );
    }
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const markRead = useCallback(async () => {
    if (!roomId) return;
    await supabase.rpc("mark_room_read", { _room_id: roomId });
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !user) return;
    const ch = supabase
      .channel(`room:${roomId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as ChatMessage;
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
          markRead();
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const uid = (payload as { user_id: string }).user_id;
        if (!uid || uid === user.id) return;
        setTypingUserIds((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
        setTimeout(() => {
          setTypingUserIds((prev) => prev.filter((x) => x !== uid));
        }, 2500);
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [roomId, user, markRead]);

  const sendMessage = useCallback(
    async (content: string, attachment?: { url: string; type: string }) => {
      if (!roomId || !user || !profile?.pharmacy_id) return;
      const trimmed = content.trim();
      if (!trimmed && !attachment) return;
      await supabase.from("chat_messages").insert({
        room_id: roomId,
        sender_id: user.id,
        pharmacy_id: profile.pharmacy_id,
        content: trimmed || null,
        attachment_url: attachment?.url || null,
        attachment_type: attachment?.type || null,
      });
    },
    [roomId, user, profile?.pharmacy_id]
  );

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: user.id } });
  }, [user]);

  return { room, members, messages, typingUserIds, loading, sendMessage, markRead, broadcastTyping, reload: loadAll };
};