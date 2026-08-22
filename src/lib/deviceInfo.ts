const SESSION_KEY = "medinist_session_id";

/** Stable per-browser session id, persisted so a reload keeps the same shift. */
export const getSessionId = (): string => {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
};

export const clearSessionId = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
};

export interface DeviceInfo {
  os: string;
  browser: string;
  device_type: "mobile" | "tablet" | "desktop";
}

/** Lightweight UA parsing — no dependency, runs once per mount. */
export const detectDevice = (ua = navigator.userAgent): DeviceInfo => {
  const os =
    /Android/i.test(ua) ? "Android"
    : /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Windows/i.test(ua) ? "Windows"
    : /Mac OS X/i.test(ua) ? "macOS"
    : /Linux/i.test(ua) ? "Linux"
    : "Unknown";

  const browser =
    /Edg\//i.test(ua) ? "Edge"
    : /OPR\//i.test(ua) ? "Opera"
    : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Safari\//i.test(ua) ? "Safari"
    : "Browser";

  const device_type: DeviceInfo["device_type"] =
    /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";

  return { os, browser, device_type };
};

export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
};
