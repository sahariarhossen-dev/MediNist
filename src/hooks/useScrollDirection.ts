import { useEffect, useState } from "react";

type Direction = "up" | "down" | "idle";

/**
 * Track scroll direction on a given element, or window if null.
 * Ignores small deltas to avoid jitter.
 */
export const useScrollDirection = (element: HTMLElement | null): Direction => {
  const [direction, setDirection] = useState<Direction>("idle");

  useEffect(() => {
    const target: HTMLElement | Window = element ?? window;
    const getScrollTop = () =>
      element ? element.scrollTop : window.scrollY || document.documentElement.scrollTop;

    let lastY = getScrollTop();
    let ticking = false;
    const THRESHOLD = 6;

    const update = () => {
      const y = getScrollTop();
      const diff = y - lastY;
      if (Math.abs(diff) < THRESHOLD) {
        ticking = false;
        return;
      }
      if (y < 10) {
        setDirection("up");
      } else if (diff > 0) {
        setDirection("down");
      } else {
        setDirection("up");
      }
      lastY = y;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [element]);

  return direction;
};
