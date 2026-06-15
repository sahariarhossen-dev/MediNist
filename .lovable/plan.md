## Goal
Move the AI chat input from the bottom of the screen to the top, positioned directly below the header. The input must remain fixed during typing (including multi-line), and the message list must scroll below it while adapting to the on-screen keyboard.

## Current State
- `AIAssistant.tsx` uses a full-screen `fixed inset-0 flex flex-col` layout.
- The `ChatHeader` is `absolute inset-x-0 top-0` and hides on scroll-down via `translate-y-full`.
- The message list is `flex-1 overflow-y-auto pt-20` (padding reserves space for the absolute header).
- The input form sits at the bottom as a `shrink-0` element with `border-t` and safe-area bottom padding.

## Plan

### 1. Reorder layout in `AIAssistant.tsx`
Change the flex column so the top section (header + input) lives in normal document flow, and only the messages area scrolls.

```text
Before:  fixed flex-col → absolute Header → flex-1 Messages (pt-20) → shrink-0 Input
After:   fixed flex-col → shrink-0 Header → shrink-0 Input → flex-1 Messages
```

- Remove `absolute` positioning from the header wrapper; keep it as a `shrink-0` block.
- Move the entire `<form>` input block so it renders immediately after the header.
- Give the messages `<div>` `flex-1 overflow-y-auto` with **no** top padding (the header and input now occupy their own space).

### 2. Convert single-line Input to auto-resizing Textarea
- Replace the `<Input>` component with a native `<textarea>` so users can type multi-line messages.
- Implement auto-resize: on every `input`/`change` event, set `textarea.style.height = 'auto'` then `textarea.style.height = textarea.scrollHeight + 'px'`, capped at a sensible max (e.g., 120 px).
- Keep the existing rounded-pill container styling; the textarea itself sits inside with transparent background, no border, and no focus ring.
- Retain the circular send `<Button>` inside the same container.

### 3. Keyboard-aware message scrolling
- Import and use the existing `useKeyboardInset` hook in `AIAssistant.tsx`.
- Apply the keyboard inset value as bottom padding on the scrollable messages area:
  `paddingBottom: \`calc(1rem + \${keyboardInset}px + env(safe-area-inset-bottom))\``
- This ensures the last messages remain reachable and visible above the on-screen keyboard.

### 4. Remove header hide-on-scroll for this page
- The header slide-away (`translate-y-full`) relies on `absolute` positioning and is incompatible with a fixed top input block in normal flow.
- Remove the scroll-direction-driven header hiding logic from `AIAssistant.tsx` (the `useScrollDirection` usage and the translate classes).
- Keep the `ChatHeader` component itself unchanged; only the wrapper in `AIAssistant.tsx` is simplified.

### 5. Preserve existing auto-scroll behaviour
- Keep the existing `useEffect` that calls `scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })` on `messages`/`isLoading` changes.
- Because the messages area is now below the input, scrolling to bottom still reveals the newest content correctly.

## Files to Edit
- `src/pages/AIAssistant.tsx` — layout reorder, textarea swap, keyboard inset integration, remove header translate logic.

## Out of Scope
- `ChatHeader.tsx` — no changes to the header component itself.
- `ChatMessage.tsx` — no changes to message rendering.
- Edge function (`ai-chat`) — no backend changes.
- Bottom navigation behaviour — remains handled by `AppLayout` / `BottomNav`.