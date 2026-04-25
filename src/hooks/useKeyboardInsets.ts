import { useEffect, useState } from "react";

/**
 * Returns the height (in CSS px) currently obscured by the on-screen keyboard,
 * using the visualViewport API. Returns 0 when the keyboard is closed or the
 * API is unavailable (most desktop browsers).
 */
export const useKeyboardInset = (): number => {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const update = () => {
      // Difference between layout viewport and visual viewport ≈ keyboard height
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setInset(diff > 80 ? diff : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return inset;
};
