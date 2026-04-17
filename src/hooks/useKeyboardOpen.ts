import { useEffect, useState } from "react";

/**
 * Detects if the mobile on-screen keyboard is open using the visualViewport API.
 * Returns true when the visual viewport height is significantly smaller than the
 * layout viewport height (>150px difference).
 */
export const useKeyboardOpen = (): boolean => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const check = () => {
      const diff = window.innerHeight - vv.height;
      setOpen(diff > 150);
    };

    check();
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    return () => {
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
    };
  }, []);

  return open;
};
