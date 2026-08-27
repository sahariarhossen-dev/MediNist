/**
 * Per-device thread preferences (pin / mute) for the unified inbox.
 * Stored locally so no schema, RLS or RPC change is required.
 */
import { useCallback, useEffect, useState } from "react";

const KEY = "medinist.thread.prefs.v1";
const EVENT = "medinist:thread-prefs";

export interface ThreadPrefs {
  pinned: string[];
  muted: string[];
}

const EMPTY: ThreadPrefs = { pinned: [], muted: [] };

export const readThreadPrefs = (): ThreadPrefs => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ThreadPrefs>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((v) => typeof v === "string") : [],
      muted: Array.isArray(parsed.muted) ? parsed.muted.filter((v) => typeof v === "string") : [],
    };
  } catch {
    return EMPTY;
  }
};

const write = (next: ThreadPrefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<ThreadPrefs>(EVENT, { detail: next }));
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((v) => v !== id) : [...list, id];

export const useThreadPrefs = () => {
  const [prefs, setPrefs] = useState<ThreadPrefs>(() =>
    typeof window === "undefined" ? EMPTY : readThreadPrefs()
  );

  useEffect(() => {
    const sync = () => setPrefs(readThreadPrefs());
    window.addEventListener(EVENT, sync as EventListener);
    window.addEventListener("storage", sync);
    sync();
    return () => {
      window.removeEventListener(EVENT, sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const togglePin = useCallback((id: string) => {
    const cur = readThreadPrefs();
    write({ ...cur, pinned: toggle(cur.pinned, id) });
  }, []);

  const toggleMute = useCallback((id: string) => {
    const cur = readThreadPrefs();
    write({ ...cur, muted: toggle(cur.muted, id) });
  }, []);

  return {
    prefs,
    isPinned: (id: string) => prefs.pinned.includes(id),
    isMuted: (id: string) => prefs.muted.includes(id),
    togglePin,
    toggleMute,
  };
};
