import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InboxRoom {
  room_id: string;
  type: "direct" | "group";
  display_name: string;
  avatar_url: string | null;
  other_user_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export const useChatInbox = () => {
  const { user, profile } = useAuth();
  const [rooms, setRooms] = useState<InboxRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("get_chat_inbox");
    if (!error && data) setRooms(data as unknown as InboxRoom[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!profile?.pharmacy_id || !user?.id) return;
    const channelName = `inbox:${profile.pharmacy_id}:${user.id}:${instanceIdRef.current}`;
    const ch = supabase.channel(channelName);
    ch.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `pharmacy_id=eq.${profile.pharmacy_id}`,
      },
      () => refresh()
    )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_room_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.pharmacy_id, user?.id, refresh]);

  const totalUnread = rooms.reduce((acc, r) => acc + (r.unread_count || 0), 0);
  return { rooms, totalUnread, loading, refresh };
};
