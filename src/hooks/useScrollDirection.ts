import { useEffect, useState } from "react";

type Direction = "up" | "down" | "idle";

/**
 * Track scroll direction on a given element, or window if null.
 * Ignores small deltas to avoid jitter.
 * Also reacts to wheel/touch gestures so direction updates even when
 * the content does not overflow (no actual scroll event fires).
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

    // Wheel / touch fallback so we still toggle when content does not overflow.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 4) return;
      setDirection(e.deltaY > 0 ? "down" : "up");
    };

    let touchStartY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY == null) return;
      const y = e.touches[0]?.clientY ?? touchStartY;
      const diff = touchStartY - y;
      if (Math.abs(diff) < 8) return;
      setDirection(diff > 0 ? "down" : "up");
      touchStartY = y;
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    target.addEventListener("wheel", onWheel as EventListener, { passive: true });
    target.addEventListener("touchstart", onTouchStart as EventListener, { passive: true });
    target.addEventListener("touchmove", onTouchMove as EventListener, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      target.removeEventListener("wheel", onWheel as EventListener);
      target.removeEventListener("touchstart", onTouchStart as EventListener);
      target.removeEventListener("touchmove", onTouchMove as EventListener);
    };
  }, [element]);

  return direction;
};
