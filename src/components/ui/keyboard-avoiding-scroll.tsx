import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/hooks/useKeyboardInsets";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  /** Extra spacing (px) kept between the focused field and the keyboard top edge. */
  scrollPadding?: number;
}

/**
 * Web equivalent of React Native's KeyboardAvoidingView + ScrollView with
 * `keyboardShouldPersistTaps="handled"`.
 *
 * - Adds bottom padding equal to the on-screen keyboard height so content is
 *   never hidden behind it.
 * - When an input/textarea/select inside it gains focus, smoothly scrolls so
 *   the field sits just above the keyboard.
 * - Uses `pointer-events` only on its own children so taps on inputs while the
 *   keyboard is open are always handled (taps don't dismiss focus prematurely).
 */
export const KeyboardAvoidingScroll = ({
  className,
  style,
  children,
  scrollPadding = 16,
  ...rest
}: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const inset = useKeyboardInset();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      const isField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable;
      if (!isField) return;

      // Defer so visualViewport has resized by the time we scroll.
      window.setTimeout(() => {
        try {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {
          target.scrollIntoView();
        }
      }, 250);
    };

    root.addEventListener("focusin", handleFocus);
    return () => root.removeEventListener("focusin", handleFocus);
  }, []);

  return (
    <div
      ref={ref}
      className={cn("overflow-y-auto", className)}
      style={{
        ...style,
        paddingBottom: `calc(${inset}px + env(safe-area-inset-bottom, 0px))`,
        transition: "padding-bottom 200ms ease-out",
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

export default KeyboardAvoidingScroll;
