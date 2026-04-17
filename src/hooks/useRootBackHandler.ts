import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const ROOT_PATHS = ["/", "/sales", "/ai", "/more"];

/**
 * Smart back-button handler for root tabs.
 *
 * - On AI page: hardware back goes straight to Dashboard.
 * - On any other root tab: requires double-press to "exit" (shows toast).
 * - On sub-pages: native back behavior (router pop) is preserved.
 *
 * We implement this by pushing a sentinel history entry whenever the user
 * lands on a root tab. When popstate fires we know the user pressed back,
 * and we react accordingly.
 */
export const useRootBackHandler = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const lastBackPressRef = useRef<number>(0);

  useEffect(() => {
    if (!ROOT_PATHS.includes(pathname)) return;

    // Push a sentinel state so the next back press fires popstate here
    // instead of leaving the app immediately.
    window.history.pushState({ rootSentinel: true, path: pathname }, "");

    const onPopState = () => {
      // AI page: jump straight to Dashboard, ignore intermediate history.
      if (pathname === "/ai") {
        navigate("/", { replace: true });
        return;
      }

      // Other root tabs: double-press to exit.
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        // Allow the actual back navigation (will leave the app / SPA).
        window.history.back();
        return;
      }

      lastBackPressRef.current = now;
      toast("Press back again to exit", { duration: 2000 });
      // Re-push sentinel so subsequent back press fires here again.
      window.history.pushState({ rootSentinel: true, path: pathname }, "");
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // If we navigated away from a root tab forward (e.g. clicked a sub-page link),
      // pop our sentinel so the user's history stays clean.
      if (window.history.state?.rootSentinel) {
        window.history.back();
      }
    };
  }, [pathname, navigate]);
};
