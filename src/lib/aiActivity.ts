/**
 * Lightweight cross-page store for AI co-pilot activity, used by the pinned
 * "MediNist AI" row in the unified inbox.
 *
 * Kept in localStorage (plus a same-tab custom event) so the state survives
 * navigation between /workspace and /workspace/ai and syncs across tabs.
 */
import { useEffect, useState } from "react";

const KEY = "medinist.ai.activity.v1";
const EVENT = "medinist:ai-activity";

export interface AiActivity {
  /** A request to ai-chat is currently in flight. */
  thinking: boolean;
  /** ISO timestamp of the newest assistant reply. */
  lastAssistantAt: string | null;
  /** ISO timestamp the user last had the AI thread in view. */
  lastSeenAt: string | null;
}

const EMPTY: AiActivity = { thinking: false, lastAssistantAt: null, lastSeenAt: null };

export const readAiActivity = (): AiActivity => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AiActivity>;
    return {
      thinking: !!parsed.thinking,
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

export const setAiThinking = (thinking: boolean) => write({ ...readAiActivity(), thinking });

export const markAiReplied = () =>
  write({ ...readAiActivity(), thinking: false, lastAssistantAt: new Date().toISOString() });

export const markAiSeen = () =>
  write({ ...readAiActivity(), lastSeenAt: new Date().toISOString() });

export const hasUnseenAiReply = (a: AiActivity) => {
  if (!a.lastAssistantAt) return false;
  if (!a.lastSeenAt) return true;
  return new Date(a.lastAssistantAt).getTime() > new Date(a.lastSeenAt).getTime();
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
    return () => {
      window.removeEventListener(EVENT, sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return state;
};
