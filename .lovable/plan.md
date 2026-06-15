## Scope
Two focused UI tweaks to the MediNist AI chat — no logic changes.

### 1. `src/components/ai/ChatHeader.tsx` — remove top-right avatar
- Delete the `<button>` wrapping the `Avatar` (profile navigation button) at the end of the header row.
- Remove now-unused imports: `Avatar`, `AvatarFallback`, `AvatarImage`, `useNavigate`, and the local `initials` helper.
- Drop `avatarUrl` and `userName` from `ChatHeaderProps` (and the corresponding props passed from `AIAssistant.tsx`) since they're no longer used.
- Keep the role badge pill on the right so the header doesn't feel empty on wider screens; on mobile the right side will simply be clean whitespace (badge is `hidden sm:inline-flex`).

### 2. `src/components/ai/ChatMessage.tsx` — user avatar on the right + crisp icons
- Extend `ChatMessageProps` with optional `userName?: string | null` and `userAvatarUrl?: string | null`.
- For `isUser === true`, render the user's circular avatar on the right side of the bubble, mirroring the assistant `LogoMark` on the left:
  - Use shadcn `Avatar` with `AvatarImage` + `AvatarFallback` (initials from `userName`).
  - Size `h-7 w-7` with `shrink-0`, `ring-1 ring-slate-200`, aligned to the top of the bubble row.
- Keep bubble max-width responsive (`max-w-[80%]`) and the row `gap-3` so spacing matches the assistant side.

### 3. Crisp logo fix — `src/components/brand/LogoMark.tsx`
The current image uses `objectFit: "fill"` which stretches the PNG and adds noisy class spam (`font-bold text-2xl`, redundant zero-padding) — that's the source of the blur/squish.
- Rewrite the component to:
  - Render at 2× intrinsic resolution for crispness: set `width`/`height` attributes to `size * 2` while constraining the rendered box via `style={{ width: size, height: size }}`.
  - Use `object-contain` instead of `fill` so the mark is never distorted.
  - Remove the irrelevant typography classes; keep only `className` passthrough plus `shrink-0 select-none`.
  - Add `draggable={false}` and `decoding="async"`.

### 4. `src/pages/AIAssistant.tsx` — wire new props
- Stop passing `userName` / `avatarUrl` to `ChatHeader` (props removed).
- Pass `userName={profile?.full_name ?? null}` and `userAvatarUrl={profile?.avatar_url ?? null}` to every `<ChatMessage />` so user bubbles get the avatar.
- Wrap the assistant `LogoMark` containers (in `ChatMessage` and `TypingIndicator`) at `h-7 w-7 shrink-0` and render `<LogoMark size={28} />` so both side-avatars are visually identical in size and alignment.

## Out of scope
Header layout structure, sidebar, composer, animations, message persistence, edge functions, routing to `/profile` (now only reachable via the sidebar footer's settings gear).
