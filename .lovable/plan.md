# Premium Background + Typography Refactor — MediNist AI Chat

Refine the chat surface to a soft warm-gray canvas with elite, highly readable markdown typography, while preserving the avatar layout from the previous step.

## 1. Background canvas (warm gray)

Introduce a single shared token so the header, scroll area, composer, and user bubble all sit on the same warm surface — no white "patches" anywhere.

- `src/index.css` — add a semantic token:
  - `--chat-canvas: 60 6% 95%;` (HSL for ~`#f4f4f3`)
  - Optional companion: `--chat-user-bubble: 60 5% 91%;` for a subtle step above canvas.
- `tailwind.config.ts` — expose `chat-canvas` and `chat-user-bubble` under `theme.extend.colors` so we use `bg-chat-canvas` instead of arbitrary hex.

Apply in:
- `src/pages/AIAssistant.tsx` — root container `bg-chat-canvas` (replace `bg-white`).
- `src/components/ai/ChatHeader.tsx` — header `bg-chat-canvas` (remove white), keep bottom border very soft (`border-black/5`).
- Composer card (in `AIAssistant.tsx`) — change card from `bg-white` to `bg-white/70 backdrop-blur` with `border-black/5` and `shadow-[0_1px_2px_rgba(0,0,0,0.04)]` so it floats organically over the warm canvas.

## 2. Elite typography for assistant markdown

Edit `src/components/ai/ChatMessage.tsx` assistant branch only.

- Wrapper text color: `text-[#1f1f1f]` (deep slate, not pitch black, not washed gray).
- Base size/leading: `text-[15.5px] leading-7`.
- Replace the current `prose` chain with a tuned set:
  - `prose-p:my-0 prose-p:mb-3`
  - `prose-strong:font-semibold prose-strong:text-black`
  - `prose-headings:font-semibold prose-headings:text-black prose-headings:mt-4 prose-headings:mb-2`
  - `prose-h1:text-lg prose-h2:text-base prose-h3:text-[15px]`
  - `prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5`
  - `prose-li:my-1.5 prose-li:leading-7 marker:text-slate-400`
  - `prose-code:rounded-md prose-code:bg-black/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none`
  - `prose-pre:my-3 prose-pre:rounded-xl prose-pre:bg-[#1f1f1f] prose-pre:text-slate-100 prose-pre:p-3`
  - `prose-a:text-sky-700 prose-a:underline-offset-2`
- Add a wrapping `<div className="space-y-3">` around the markdown so consecutive blocks always get breathing room even when prose margins collapse.

## 3. User bubble + alignment (preserve previous step)

In `ChatMessage.tsx`:
- Keep `LogoMark` on the left for assistant, shadcn `Avatar` on the right for user (already in place).
- Restyle the user bubble to blend with the canvas:
  - `bg-chat-user-bubble text-[#1f1f1f]`
  - `rounded-3xl rounded-tr-md px-4 py-2.5`
  - `text-[15px] leading-relaxed`
  - `ring-1 ring-black/5` (replace any hard shadow).
- Keep avatar `h-7 w-7 ring-1 ring-black/10`.

## 4. Out of scope

- No changes to sidebar, suggestion tiles content, message persistence, edge functions, or routing.
- No changes to `TypingIndicator` beyond what's needed (it already inherits canvas).
- No new animations beyond existing `animate-fade-in-up`.

## Files touched

- `src/index.css` — add `--chat-canvas`, `--chat-user-bubble` tokens.
- `tailwind.config.ts` — expose tokens as Tailwind colors.
- `src/pages/AIAssistant.tsx` — swap root + composer surfaces to new tokens.
- `src/components/ai/ChatHeader.tsx` — header background + border.
- `src/components/ai/ChatMessage.tsx` — assistant prose overhaul + user bubble restyle.
