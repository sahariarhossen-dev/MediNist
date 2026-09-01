# Telegram-style Chat Headers (AI Threads + Staff DMs)

Redesign the two chat headers into one shared visual language: sticky translucent bar, tappable identity block on the left, actions on the right, and a smooth 3-dot menu — all in MediNist emerald/teal.

## Shared header shell

New component `src/components/chat/ChatTopBar.tsx` used by both screens:

- Sticky top, `bg-background/90 backdrop-blur-lg`, `border-b border-border/40`.
- Left: `ArrowLeft` back button (44x44 tap target, rounded-full hover).
- Identity region (avatar + title + subtitle) is one button — opens thread info / staff profile, Telegram-style.
- Right: slot for optional action button + 3-dot `MoreVertical` menu built on the existing shadcn `dropdown-menu` (already has slide/fade animation), aligned `end`, emerald focus rings.
- All colors via semantic tokens plus the emerald/teal accents already used in the workspace redesign.

## AI Topic Thread header (`src/pages/AIAssistant.tsx`)

- Avatar: teal→emerald gradient ring with the topic icon, soft glow, and a small pulsing green "AI active" dot (pulses only while the assistant is thinking, steady otherwise).
- Title: thread title (bold). Subtitle: topic chip (e.g. `Sales`) • pharmacy name; shows `Bridged: <topic>` when a bridge is active, and "Thinking…" while loading.
- Tapping identity region opens a Thread Info sheet (topic, created date, message count, bridge state).
- Right actions: Canvas toggle (kept, shown only for topics with a canvas) + 3-dot menu:
  - Link Topic — opens the existing bridge picker
  - Rename Topic — inline dialog, updates `ai_conversations.title`
  - Pin Thread — toggles local pin via `useThreadPrefs`
  - Clear History — confirm dialog, deletes this thread's `ai_messages`
  - Archive Thread — sets `archived_at`, then routes back to `/workspace`

## Staff Direct Chat header (`src/pages/ChatRoom.tsx`)

- Avatar/initials badge with live status dot: emerald when last seen < 60s, muted grey otherwise (group rooms keep the members icon).
- Title: staff full name. Subtitle: role badge ("Salesman"/"Manager"/"Owner") • "Active now" / "Last seen …" / "typing…".
- Identity region keeps opening `ProfileSheet` (or `GroupInfoSheet` for groups).
- Right action: only the 3-dot menu:
  - Search in Chat — reveals an inline search field in the header that filters the visible messages
  - View Staff Profile — opens `ProfileSheet`
  - Mute Notifications — toggles mute via `useThreadPrefs`
  - Clear Chat — confirm dialog, clears messages for this room

## Technical notes

- No routing changes; `/workspace/ai/:conversationId` and `/workspace/chat/:roomId` behaviour untouched.
- No edge function or AI request changes; `topic_focus` / `bridged_context` payloads stay as-is.
- Pin/mute use the existing local `threadPrefs` store (no schema change). Rename/archive/clear use existing tables and RLS.
- Roles rendered through `inviteRoleLabel` from `src/lib/staffRoles.ts`.
- Every icon button is at least 44x44; dropdown uses the shared shadcn animation classes.
- The unused `src/components/ai/ChatHeader.tsx` is removed if nothing imports it after the refactor.
