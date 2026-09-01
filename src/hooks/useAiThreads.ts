import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { forwardableText } from "@/lib/agentCards";
import type { TopicKey } from "@/lib/aiTopics";

export interface AiThread {
  id: string;
  title: string;
  topic_key: string | null;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  last_role: string | null;
}

/**
 * AI topic threads for the signed-in user, with a preview of the newest turn.
 *
 * Two queries only (threads, then one batched message query) so the inbox never
 * fans out into a per-thread request.
 */
export const useAiThreads = () => {
  const { user } = useAuth();
  const [threads, setThreads] = useState<AiThread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setThreads([]);
      setLoading(false);
      return;
    }
    const { data: convs, error } = await supabase
      .from("ai_conversations")
      .select("id, title, topic_key, updated_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("useAiThreads:", error);
      setLoading(false);
      return;
    }

    const ids = (convs ?? []).map((c) => c.id);
    const previews = new Map<string, { text: string; at: string; role: string }>();
    if (ids.length > 0) {
      const { data: msgs } = await supabase
        .from("ai_messages")
        .select("conversation_id, content, created_at, role")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(400);
      for (const m of msgs ?? []) {
        if (previews.has(m.conversation_id)) continue;
        previews.set(m.conversation_id, {
          text: forwardableText(m.content).slice(0, 140),
          at: m.created_at,
          role: m.role,
        });
      }
    }

    setThreads(
      (convs ?? []).map((c) => {
        const p = previews.get(c.id);
        return {
          id: c.id,
          title: c.title,
          topic_key: c.topic_key,
          updated_at: c.updated_at,
          last_message: p?.text ?? null,
          last_message_at: p?.at ?? null,
          last_role: p?.role ?? null,
        };
      })
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return { threads, loading, refresh: load };
};

/** Create a topic thread and return its id. */
export const createAiThread = async (
  userId: string,
  pharmacyId: string,
  title: string,
  topicKey: TopicKey
): Promise<string | null> => {
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: userId, pharmacy_id: pharmacyId, title, topic_key: topicKey })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createAiThread:", error);
    return null;
  }
  return data.id;
};
