import { RefObject, useEffect } from "react";

/**
 * When any input/textarea/select inside `containerRef` gains focus, smoothly
 * scroll it into the centre of the viewport so the on-screen keyboard does not
 * obscure it. Web equivalent of `keyboardShouldPersistTaps="handled"` +
 * scroll-to-focused-input behaviour from React Native.
 */
export const useScrollFocusedInput = (containerRef: RefObject<HTMLElement>) => {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const handler = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      const isField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable;
      if (!isField) return;

      // Wait for the visualViewport to settle after the keyboard opens.
      window.setTimeout(() => {
        try {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {
          target.scrollIntoView();
        }
      }, 250);
    };

    root.addEventListener("focusin", handler);
    return () => root.removeEventListener("focusin", handler);
  }, [containerRef]);
};
