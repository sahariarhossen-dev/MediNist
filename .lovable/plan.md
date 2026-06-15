## Goal
Upgrade the `/ai` chat surface so it feels like a premium AI copilot (ChatGPT / Gemini / DeepSeek vibe) instead of a basic messenger — without changing any chat logic, data flow, or keyboard handling.

## Scope (visual only)
Files to touch:
- `src/pages/AIAssistant.tsx` — canvas background, ambient glows, floating input capsule, suggestion chips polish, message entry animation.
- `src/components/ai/ChatHeader.tsx` — integrated light header, sleek capsule role badge.
- `src/components/ai/ChatMessage.tsx` — refined user gradient bubble + clean white assistant card, typography rhythm.
- `src/components/ai/ConversationSidebar.tsx` — glass/blur drawer, premium "New Chat" CTA, rounded hover items.
- `src/components/ai/TypingIndicator.tsx` — match new assistant card surface.
- `tailwind.config.ts` — add a `fade-in-up` keyframe/animation utility used by message entries.

No changes to: data fetching, Supabase calls, conversation state, keyboard inset behavior, BottomNav scroll wiring, or routing.

## Visual direction

### Canvas & ambient lighting
- Root wrapper: `bg-[#f8fafc]` with two soft fixed radial glows (indigo + sky) behind content, very low opacity, `pointer-events-none`.
- Removes the harsh white slab feel and gives depth without distracting from text.

### Header (`ChatHeader`)
- Replace blue gradient bar with an integrated light bar: `bg-white/70 backdrop-blur-md border-b border-slate-200/70`.
- Title `MediNist AI` in slate-900; subtitle in slate-500.
- Role badge becomes a capsule pill: `px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide shadow-sm bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100`.
- Menu + avatar buttons restyled for the light header (slate hover states).
- Keep logo mark; drop the white "tile" wrapper for a flatter look.

### Messages (`ChatMessage`)
- User bubble: `bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-2xl rounded-tr-none shadow-sm` (asymmetric corner per spec).
- Assistant bubble: `bg-white border border-slate-100 shadow-sm rounded-2xl rounded-tl-none`; typography `text-[15px] leading-relaxed text-slate-800`.
- Markdown prose: tighter heading spacing, `prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded`, `prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-xl prose-pre:p-3`, list spacing tightened.
- Each message gets `animate-fade-in-up` on mount.
- Avatars: assistant keeps logo mark in soft ring; user avatar gets a subtle indigo tint instead of `bg-primary-foreground`.

### Typing indicator
- Match assistant card: white surface, slate dots, soft shadow.

### Floating input capsule
- Wrap form so it floats above the canvas: remove `border-t bg-white shadow-sm`; instead inner pill is the visual element.
- Pill: `rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100`.
- Left utility slot reserved for a `Plus` (attach/quick-action) icon button — purely visual placeholder, no handler wired (out of scope to add features).
- Send button: `rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white` nested on the right; disabled state desaturated.
- Keep existing textarea auto-resize, Enter-to-send, and `keyboardInset` padding logic unchanged.

### Suggestion chips
- Light slate chips with indigo hover: `rounded-full border border-slate-200 bg-white/80 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition`.

### Sidebar drawer (`ConversationSidebar`)
- `SheetContent` className → `bg-white/80 backdrop-blur-md border-r border-slate-200/70`.
- Header row title in slate-900 with light divider.
- "New chat" CTA: `bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md ring-1 ring-indigo-500/20 hover:from-indigo-700 hover:to-blue-700`.
- History rows: `rounded-xl px-2.5 py-2 transition-all hover:bg-slate-100/80 active:scale-[0.99]`; active row `bg-indigo-50 ring-1 ring-indigo-100`.

### Animations
- Add to `tailwind.config.ts`:
  - keyframe `fade-in-up`: `0% { opacity:0; transform: translateY(6px) }` → `100% { opacity:1; transform: translateY(0) }`.
  - animation `fade-in-up: fade-in-up 0.25s ease-out`.
- Apply on each `ChatMessage` root and on `TypingIndicator`.

## Out of scope
- No changes to AI logic, prompts, edge functions, or persistence.
- No new attachment feature wiring (the left-slot button is a static visual to match ChatGPT-style layout — confirm if you'd rather omit it entirely).
- No dark mode pass in this round.

## Technical notes
- Tailwind v3 is in use; keyframe/animation additions go under `theme.extend.keyframes` / `theme.extend.animation` in `tailwind.config.ts`.
- Light header changes the contrast against `BottomNav` / system UI — verified non-issue since BottomNav is not rendered on `/ai` (page uses `fixed inset-0`).
- All Supabase calls, `useKeyboardInset`, and `useScrollContainer` wiring are preserved verbatim.
