/**
 * Lightweight cross-page store for AI co-pilot activity, used by the AI topic
 * rows in the unified inbox.
 *
 * Kept in localStorage (plus a same-tab custom event) so the state survives
 * navigation between /workspace and /workspace/ai/:id and syncs across tabs.
 */
import { useEffect, useState } from "react";

const KEY = "medinist.ai.activity.v1";
const SEEN_KEY = "medinist.ai.threadseen.v1";
const EVENT = "medinist:ai-activity";

export interface AiActivity {
  /** A request to ai-chat is currently in flight. */
  thinking: boolean;
  /** When the in-flight request started (guards against a stale flag). */
  thinkingSince: string | null;
  /** Which topic thread is currently generating, when known. */
  thinkingThread: string | null;
  /** ISO timestamp of the newest assistant reply. */
  lastAssistantAt: string | null;
  /** ISO timestamp the user last had the AI thread in view. */
  lastSeenAt: string | null;
}

const STALE_MS = 90_000;

const EMPTY: AiActivity = {
  thinking: false,
  thinkingSince: null,
  thinkingThread: null,
  lastAssistantAt: null,
  lastSeenAt: null,
};

export const readAiActivity = (): AiActivity => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AiActivity>;
    const since = parsed.thinkingSince ?? null;
    const stale = !since || Date.now() - new Date(since).getTime() > STALE_MS;
    return {
      thinking: !!parsed.thinking && !stale,
      thinkingSince: since,
      thinkingThread: stale ? null : parsed.thinkingThread ?? null,
      lastAssistantAt: parsed.lastAssistantAt ?? null,
      lastSeenAt: parsed.lastSeenAt ?? null,
    };
  } catch {
    return EMPTY;
  }
};

const write = (next: AiActivity) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — state simply won't persist */
  }
  window.dispatchEvent(new CustomEvent<AiActivity>(EVENT, { detail: next }));
};

export const setAiThinking = (thinking: boolean, threadId?: string | null) =>
  write({
    ...readAiActivity(),
    thinking,
    thinkingSince: thinking ? new Date().toISOString() : null,
    thinkingThread: thinking ? threadId ?? null : null,
  });

export const markAiReplied = () =>
  write({
    ...readAiActivity(),
    thinking: false,
    thinkingSince: null,
    thinkingThread: null,
    lastAssistantAt: new Date().toISOString(),
  });

export const markAiSeen = () =>
  write({ ...readAiActivity(), lastSeenAt: new Date().toISOString() });

export const hasUnseenAiReply = (a: AiActivity) => {
  if (!a.lastAssistantAt) return false;
  if (!a.lastSeenAt) return true;
  return new Date(a.lastAssistantAt).getTime() > new Date(a.lastSeenAt).getTime();
};

/* ---------------------------------------------------------------- per thread */

type SeenMap = Record<string, string>;

const readSeenMap = (): SeenMap => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
};

/** Record that the user just viewed this topic thread. */
export const markThreadSeen = (threadId: string) => {
  const map = readSeenMap();
  map[threadId] = new Date().toISOString();
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  markAiSeen();
};

/** True when the thread's newest assistant turn arrived after the last view. */
export const isThreadUnseen = (
  threadId: string,
  lastRole: string | null,
  lastAt: string | null
) => {
  if (lastRole !== "assistant" || !lastAt) return false;
  const seen = readSeenMap()[threadId];
  if (!seen) return true;
  return new Date(lastAt).getTime() > new Date(seen).getTime();
};

export const useAiActivity = (): AiActivity => {
  const [state, setState] = useState<AiActivity>(() =>
    typeof window === "undefined" ? EMPTY : readAiActivity()
  );

  useEffect(() => {
    const sync = () => setState(readAiActivity());
    window.addEventListener(EVENT, sync as EventListener);
    window.addEventListener("storage", sync);
    sync();
    // Re-read periodically so a stale "thinking" flag expires on its own.
    const id = setInterval(sync, 15_000);
    return () => {
      clearInterval(id);
      window.removeEventListener(EVENT, sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return state;
};
