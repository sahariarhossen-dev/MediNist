# MediNist AI — Gemini-Style Rebuild

A full visual rewrite of `/ai`. No business logic, AI, or DB changes — only presentation. Same Supabase calls, same `useAuth`, same `ai-chat` edge function, same message persistence.

## Design philosophy (UX architect notes)

Gemini's strength is *restraint*: a near-white canvas, generous whitespace, one strong neutral (deep slate/near-black) for emphasis, soft pill surfaces, and motion that's barely there but always present. To make MediNist feel *more* elite than a Gemini clone, I'll layer in:

- **Ambient depth without noise:** a single ultra-soft radial wash behind the empty-state headline (not the full page), so the canvas reads "clean" but not "flat".
- **Greeting personalization:** when the chat is empty, headline reads "Hello, {first name}" with a gradient sweep on just the name (Gemini's signature move) — bilingual fallback for Bangla users.
- **Composer micro-interactions:** focus-within lifts the card 1px with a softer shadow; the send button stays disabled-gray until input has content, then animates to solid black with a tiny scale-in.
- **Message motion:** assistant messages fade+rise 6px over 240ms; the typing indicator uses a 3-dot shimmer in the same neutral palette (no indigo).
- **Drawer polish:** spring-eased slide-in (Sheet default), conversation rows get a 1px inset highlight on active, and the pinned profile footer has a hairline top divider + hover reveal of the settings gear.
- **Suggestion chips:** replaced with Gemini-style "action tiles" (2×2 grid on mobile) under the greeting — same suggestion strings, but as soft cards with a leading icon.
- **Tactile details:** all interactive surfaces get `active:scale-[0.98]`, all rounded corners standardize on `rounded-2xl` / `rounded-3xl` / `rounded-full`, all borders use `border-slate-200/70`.

## Visual system

- **Canvas:** `bg-white` (pure). Drawer + header share the same white — no glassmorphism on the main shell (Gemini avoids it on chrome). Glass is reserved for the floating composer's focus state.
- **Primary accent:** `bg-slate-900` (near-black) for the send button + new-chat CTA. No indigo/blue gradients anywhere.
- **Secondary surfaces:** `bg-slate-50` for hover states, `bg-slate-100` for active drawer row.
- **User bubble:** `bg-slate-100 text-slate-900 rounded-3xl rounded-tr-md` — soft, not branded.
- **Assistant bubble:** no bubble. Plain text on canvas with avatar mark on the left, exactly like Gemini.
- **Typography:** keep system font stack; headline uses `text-3xl font-medium tracking-tight`, with the name in a `bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 bg-clip-text text-transparent` sweep.

## File changes

### `src/pages/AIAssistant.tsx` (rewrite layout)
- Pure white shell, no ambient blobs on the page (move to empty state only).
- Empty state: centered greeting "Hello, {firstName}" with gradient name + subtitle "How can I help you today?" / Bangla fallback. Below it: 2×2 grid of action tiles (using existing `SUGGESTIONS`) with leading lucide icons (`TrendingUp`, `PackageSearch`, `Trophy`, `CalendarClock`).
- Conversation state: vertical list, no max-width changes (keep `max-w-2xl`).
- Composer: floating card `rounded-3xl border border-slate-200/80 bg-white shadow-sm`, two-row layout:
  - Row 1: textarea (borderless, large `text-base`).
  - Row 2: left side — `Plus` (attach) + `Globe` (web/tools placeholder, disabled visual); right side — circular send button `rounded-full bg-slate-900 text-white h-9 w-9` with `ArrowUp` icon, disabled state `bg-slate-200 text-slate-400`.
- Keep `keyboardInset` padding logic intact.

### `src/components/ai/ChatHeader.tsx` (refine)
- Flat white background, single hairline bottom border.
- Left cluster: menu icon → `LogoMark` → stacked title block ("MediNist AI" + shop name subtitle in `text-xs text-slate-500`).
- Right cluster: role badge as a tight `rounded-full bg-slate-100 text-slate-700` pill (drop indigo), then avatar.

### `src/components/ai/ConversationSidebar.tsx` (restructure)
- Sheet stays. Internal layout becomes 3 zones:
  - **Top:** "+ New chat" full-width pill `rounded-full bg-slate-900 text-white` (Gemini style — black, not gradient).
  - **Middle:** scrollable history with section label "Recent". Active row gets `bg-slate-100` + medium weight; hover `bg-slate-50`. Delete icon reveals on hover only.
  - **Bottom (pinned):** hairline top border, profile row with avatar + name + email-ish subtitle (role label) on the left, `Settings` gear icon on the right that navigates to `/profile`.
- Use `flex flex-col` + `flex-1` middle so the footer truly anchors.

### `src/components/ai/ChatMessage.tsx` (restyle)
- Assistant: no bubble, no border, no background. Avatar (LogoMark) on the left, prose flows on canvas. `animate-fade-in-up`.
- User: right-aligned soft pill `bg-slate-100 text-slate-900 rounded-3xl rounded-tr-md px-4 py-2.5`. No user icon (Gemini hides it).
- Prose tweaks: `text-[15px] leading-7 text-slate-800`.

### `src/components/ai/TypingIndicator.tsx` (restyle)
- Three small `bg-slate-400` dots with staggered bounce, aligned next to the LogoMark — no bubble.

### `tailwind.config.ts`
- Keep existing `fade-in-up`. Add `dot-pulse` keyframe for the typing indicator if not already covered by built-ins.

## Out of scope
- Edge functions, AI prompt, message persistence shape.
- Auth, routing, `BottomNav` (not rendered on `/ai`).
- Dark mode (Gemini reference is light; can be a follow-up).
- Real attachment / web-tool wiring (icons are visual placeholders, matching current `Plus` behavior).

## Acceptance check
- Empty `/ai` shows the centered greeting + 4 action tiles + floating composer; no header tint.
- Sending a message: user pill on the right, assistant text flows on canvas with logo, smooth fade-rise.
- Menu opens a left drawer with black "New chat" CTA on top, recent list in the middle, profile + gear pinned at the bottom.
- Composer send button is disabled-gray until input has text, then solid black.
- No indigo/blue brand colors remain anywhere on the page.
